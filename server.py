from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
import uvicorn
import json
import asyncio
import os
from pathlib import Path
from datetime import datetime
from sw_utils import is_image, load_json_file
from ScrollWeaver import ScrollWeaver
from modules.utils.text_utils import remove_markdown
# Server class is now in modules.core.server, but ScrollWeaver wrapper is still in ScrollWeaver.py

app = FastAPI()
default_icon_path = './frontend/assets/images/default-icon.jpg'
config = load_json_file('config.json')
for key in config:
    if "API_KEY" in key and config[key]:
        os.environ[key] = config[key]
# Also allow setting API base URLs (mirrors) from config.json, e.g. OPENAI_API_BASE
for key in ['OPENAI_API_BASE', 'GEMINI_API_BASE', 'OPENROUTER_BASE_URL']:
    if key in config and config[key]:
        os.environ[key] = config[key]

static_file_abspath = os.path.abspath(os.path.join(os.path.dirname(__file__), 'frontend'))
app.mount("/frontend", StaticFiles(directory=static_file_abspath), name="frontend")

# 预设文件目录
PRESETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'experiment_presets')

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}  
        self.story_tasks: dict[str, asyncio.Task] = {}
        self.user_selected_roles: dict[str, str] = {}  # client_id -> role_code
        self.waiting_for_input: dict[str, bool] = {}  # client_id -> bool
        self.pending_user_inputs: dict[str, asyncio.Future] = {}  # client_id -> Future  
        if True:
            if "preset_path" in config and config["preset_path"]:
                if os.path.exists(config["preset_path"]):
                    preset_path = config["preset_path"]
                else:
                    raise ValueError(f"The preset path {config['preset_path']} does not exist.")
            elif "genre" in config and config["genre"]:
                genre = config["genre"]
                preset_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),f"./config/experiment_{genre}.json")
            else:
                raise ValueError("Please set the preset_path in `config.json`.")
            self.scrollweaver = ScrollWeaver(preset_path = preset_path,
                    world_llm_name = config["world_llm_name"],
                    role_llm_name = config["role_llm_name"],
                    embedding_name = config["embedding_model_name"])
            self.scrollweaver.set_generator(rounds = config["rounds"], 
                        save_dir = config["save_dir"], 
                        if_save = config["if_save"],
                        mode = config["mode"],
                        scene_mode = config["scene_mode"],)
        else:
            from ScrollWeaver_test import ScrollWeaver_test
            self.scrollweaver = ScrollWeaver_test()
          
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        self.stop_story(client_id)
        # 清理用户选择的状态
        if client_id in self.user_selected_roles:
            del self.user_selected_roles[client_id]
        if client_id in self.waiting_for_input:
            del self.waiting_for_input[client_id]
        if client_id in self.pending_user_inputs:
            # 如果Future还在等待，取消它
            if not self.pending_user_inputs[client_id].done():
                self.pending_user_inputs[client_id].cancel()
            del self.pending_user_inputs[client_id]
            
    def stop_story(self, client_id: str):
        if client_id in self.story_tasks:
            self.story_tasks[client_id].cancel()
            del self.story_tasks[client_id]

    async def start_story(self, client_id: str):
        print(f"start_story called for client {client_id}")
        if client_id in self.story_tasks:
            # 如果已经有任务在运行，先停止它
            print(f"Stopping existing story task for client {client_id}")
            self.stop_story(client_id)
        
        # 创建新的故事任务
        print(f"Creating new story task for client {client_id}")
        self.story_tasks[client_id] = asyncio.create_task(
            self.generate_story(client_id)
        )
        print(f"Story task created for client {client_id}")

    async def generate_story(self, client_id: str):
        """持续生成故事的协程"""
        print(f"generate_story started for client {client_id}")
        try:
            while True:
                if client_id in self.active_connections:
                    print(f"Getting next message for client {client_id}")
                    message, meta = await self.get_next_message()
                    print(f"Got message for client {client_id}: message is not None = {message is not None}")
                    if message:
                        print(f"Message details: type={message.get('type')}, username={message.get('username')}, text_preview={message.get('text', '')[:50] if message.get('text') else 'None'}")
                    
                    # 检查生成器是否已结束
                    if message is None:
                        print(f"Message is None, sending story_ended to client {client_id}")
                        end_payload = {'message': '故事已结束'}
                        if isinstance(meta, dict):
                            reason = meta.get('reason')
                            if reason:
                                end_payload['reason'] = reason
                            if reason == 'error':
                                error_type = meta.get('error_type')
                                error_message = meta.get('error_message')
                                error_cause = meta.get('error_cause') or meta.get('error_detail')
                                detail_parts = [part for part in [error_type, error_message, error_cause] if part]
                                if detail_parts:
                                    end_payload['message'] = f"故事运行过程中出现错误：{'；'.join(detail_parts)}"
                                else:
                                    end_payload['message'] = '故事运行过程中出现错误，请检查服务器日志。'
                                if error_type:
                                    end_payload['error_type'] = error_type
                                if error_message:
                                    end_payload['error_message'] = error_message
                                if error_cause:
                                    end_payload['error_cause'] = error_cause
                            elif reason == 'completed':
                                end_payload['message'] = end_payload['message']
                            elif reason == 'invalid_message':
                                detail = meta.get('detail')
                                if detail:
                                    end_payload['message'] = f"故事终止：收到无效消息（{detail}）"
                            elif reason == 'empty':
                                end_payload['message'] = "故事终止：未收到有效的剧情消息。"
                        await self.active_connections[client_id].send_json({
                            'type': 'story_ended',
                            'data': end_payload
                        })
                        break
                    
                    # 检查是否轮到用户选择的角色
                    user_role_code = self.user_selected_roles.get(client_id)
                    print(f"Checking user role: user_role_code={user_role_code}, message_type={message.get('type')}")
                    if user_role_code and message.get('type') == 'role':
                        # 检查当前消息的角色代码是否匹配用户选择的角色
                        # 需要通过角色名称找到角色代码
                        current_role_code = self._get_role_code_by_name(message.get('username', ''))
                        
                        if current_role_code and current_role_code == user_role_code:
                            # 暂停生成，等待用户输入
                            self.waiting_for_input[client_id] = True
                            await self.active_connections[client_id].send_json({
                                'type': 'waiting_for_user_input',
                                'data': {
                                    'role_name': message.get('username'),
                                    'message': '请为角色输入内容'
                                }
                            })
                            
                            # 等待用户输入
                            if client_id not in self.pending_user_inputs:
                                self.pending_user_inputs[client_id] = asyncio.Future()
                            
                            try:
                                user_text = await asyncio.wait_for(
                                    self.pending_user_inputs[client_id], 
                                    timeout=None
                                )
                                # 用户输入已收到，用用户输入替换消息内容
                                original_uuid = message.get('uuid')
                                if not user_text.strip():
                                    # 空输入，继续等待
                                    await self.active_connections[client_id].send_json({
                                        'type': 'error',
                                        'data': {'message': '输入不能为空，请重新输入'}
                                    })
                                    # 重新创建Future继续等待
                                    self.pending_user_inputs[client_id] = asyncio.Future()
                                    continue
                                
                                message['text'] = user_text
                                message['is_user'] = True
                                
                                # 更新历史记录中的detail
                                if original_uuid:
                                    try:
                                        self.scrollweaver.server.history_manager.modify_record(
                                            original_uuid, 
                                            user_text
                                        )
                                    except Exception as e:
                                        print(f"Error modifying record {original_uuid}: {e}")
                                        # 如果修改失败，创建新记录
                                        await self.handle_user_role_input(client_id, user_role_code, user_text)
                                        continue
                                else:
                                    # 如果没有uuid，需要创建新记录
                                    await self.handle_user_role_input(client_id, user_role_code, user_text)
                                    # 跳过当前消息，因为已经通过handle_user_role_input发送了
                                    continue
                                
                                # 清除future
                                if client_id in self.pending_user_inputs:
                                    del self.pending_user_inputs[client_id]
                                self.waiting_for_input[client_id] = False
                            except asyncio.CancelledError:
                                break
                            except Exception as e:
                                print(f"Error waiting for user input: {e}")
                                import traceback
                                traceback.print_exc()
                                # 清理状态并继续
                                if client_id in self.pending_user_inputs:
                                    del self.pending_user_inputs[client_id]
                                self.waiting_for_input[client_id] = False
                    else:
                        print(f"Not waiting for user input: user_role_code={user_role_code}, message_type={message.get('type')}")
                    
                    # 正常发送消息
                    print(f"Sending message to client {client_id}: type={message.get('type', 'unknown')}, username={message.get('username', 'unknown')}")
                    status = meta
                    try:
                        await self.active_connections[client_id].send_json({
                            'type': 'message',
                            'data': message
                        })
                        print(f"Message sent successfully to client {client_id}")
                    except Exception as e:
                        print(f"Error sending message to client {client_id}: {e}")
                        import traceback
                        traceback.print_exc()
                        break
                    
                    if status is not None:
                        try:
                            await self.active_connections[client_id].send_json({
                                'type': 'status_update',
                                'data': status
                            })
                        except Exception as e:
                            print(f"Error sending status to client {client_id}: {e}")
                            # 继续发送消息，状态更新失败不是致命错误
                    
                    # 添加延迟，控制消息发送频率
                    await asyncio.sleep(0.2)  # 可以调整这个值
                else:
                    break
        except asyncio.CancelledError:
            # 任务被取消时的处理
            print(f"Story generation cancelled for client {client_id}")
        except Exception as e:
            print(f"Error in generate_story: {e}")
        finally:
            # 清理状态
            if client_id in self.waiting_for_input:
                del self.waiting_for_input[client_id]
            if client_id in self.pending_user_inputs:
                del self.pending_user_inputs[client_id]

    async def get_initial_data(self):
        """获取初始化数据"""
        return {
            'characters': self.scrollweaver.get_characters_info(use_selected=False),
            'map': self.scrollweaver.get_map_info(),
            'settings': self.scrollweaver.get_settings_info(),
            'status': self.scrollweaver.get_current_status(),
            'history_messages':self.scrollweaver.get_history_messages(save_dir = config["save_dir"]),
        }
    
    async def reset_session(self, client_id: str):
        """
        重置所有当前对话的临时session内容
        """
        try:
            # 停止当前运行的故事任务
            self.stop_story(client_id)
            
            # 重置ScrollWeaver的session
            self.scrollweaver.reset_session()
            
            # 重新设置generator（使用空save_dir，确保不从文件加载状态）
            # 这样重置后就是一个全新的session，不会加载之前保存的状态
            self.scrollweaver.set_generator(
                rounds=config["rounds"],
                save_dir="",  # 使用空字符串，不从文件加载
                if_save=config["if_save"],
                mode=config["mode"],
                scene_mode=config["scene_mode"]
            )
            
            # 清理客户端状态
            if client_id in self.user_selected_roles:
                del self.user_selected_roles[client_id]
            if client_id in self.waiting_for_input:
                del self.waiting_for_input[client_id]
            if client_id in self.pending_user_inputs:
                if not self.pending_user_inputs[client_id].done():
                    self.pending_user_inputs[client_id].cancel()
                del self.pending_user_inputs[client_id]
            
            return True
        except Exception as e:
            print(f"Error resetting session: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def get_next_message(self):
        """从ScrollWeaver获取下一条消息"""
        print("get_next_message called")
        error_info = None
        try:
            # Run the synchronous generator call in a thread to avoid blocking the event loop
            loop = asyncio.get_event_loop()
            print("Running generate_next_message in thread pool")
            message = await loop.run_in_executor(None, self.scrollweaver.generate_next_message)
            print(f"generate_next_message returned: message is not None = {message is not None}")
            # Check if generator is exhausted (returns None)
            if message is None:
                print("Generator exhausted (returned None)")
                return None, {'reason': 'completed'}
            if message:
                print(f"Message type: {message.get('type', 'unknown')}, username: {message.get('username', 'unknown')}")
        except StopIteration:
            # 生成器已结束（legacy handling, should not occur with new implementation)
            print("Generator exhausted (StopIteration)")
            return None, {'reason': 'completed'}
        except Exception as e:
            # 捕获其他异常，打印错误信息
            print(f"Error in get_next_message: {e}")
            import traceback
            traceback.print_exc()
            error_info = {
                'reason': 'error',
                'error_type': e.__class__.__name__,
                'error_message': str(e)
            }
            cause = getattr(e, '__cause__', None)
            if cause:
                error_info['error_cause'] = str(cause)
            return None, error_info
        
        # Check if message is valid
        if message is None:
            print("Message is None, returning None, None")
            return None, {'reason': 'empty'}
        
        # Validate message structure
        if not isinstance(message, dict):
            print(f"Invalid message type: {type(message)}, message: {message}")
            return None, {
                'reason': 'invalid_message',
                'detail': str(type(message))
            }
        
        # Validate and set default icon if needed
        if "icon" in message:
            if not os.path.exists(message["icon"]) or not is_image(message["icon"]):
                message["icon"] = default_icon_path
        else:
            message["icon"] = default_icon_path
        
        # 清理消息文本中的 Markdown 格式
        if "text" in message and message["text"]:
            message["text"] = remove_markdown(message["text"])
        
        status = self.scrollweaver.get_current_status()
        # 清理状态中的事件描述（如果有）
        if status and isinstance(status, dict):
            if "event" in status and status["event"]:
                status["event"] = remove_markdown(status["event"])
        
        print(f"Returning message and status, message keys: {list(message.keys())}")
        return message, status
    
    def _get_role_code_by_name(self, role_name: str) -> str:
        """通过角色名称找到角色代码（支持role_name和nickname匹配）"""
        if not role_name:
            return None
        try:
            # 遍历所有角色，查找匹配的名称或昵称（不区分大小写）
            role_name_lower = role_name.lower().strip()
            for role_code in self.scrollweaver.server.role_codes:
                performer = self.scrollweaver.server.performers[role_code]
                if (performer.role_name and performer.role_name.lower().strip() == role_name_lower) or \
                   (performer.nickname and performer.nickname.lower().strip() == role_name_lower):
                    return role_code
        except Exception as e:
            print(f"Error finding role code for {role_name}: {e}")
            import traceback
            traceback.print_exc()
        return None
    
    async def generate_auto_action(self, client_id: str, role_code: str) -> str:
        """使用AI自动生成角色的行动（单个选项，保持向后兼容）"""
        options = await self.generate_auto_action_options(client_id, role_code, num_options=1)
        return options[0]['text'] if options and len(options) > 0 else None
    
    async def generate_auto_action_options(self, client_id: str, role_code: str, num_options: int = 3) -> list:
        """使用AI自动生成角色的多个行动选项"""
        try:
            performer = self.scrollweaver.server.performers[role_code]
            current_status = self.scrollweaver.server.current_status
            group = current_status.get('group', [])
            
            # 将group中的名称/代码转换为角色代码列表
            group_codes = []
            for item in group:
                # 如果已经是角色代码，直接使用
                if item in self.scrollweaver.server.role_codes:
                    group_codes.append(item)
                else:
                    # 否则尝试通过名称查找角色代码
                    code = self._get_role_code_by_name(item)
                    if code:
                        group_codes.append(code)
            
            # 确保当前角色在group中
            if role_code not in group_codes:
                group_codes.append(role_code)
            
            # 获取同组其他角色信息
            other_roles_info = self.scrollweaver.server._get_group_members_info_dict(group_codes)
            
            # 定义不同风格的选项配置
            style_configs = [
                {
                    'style': 'aggressive',
                    'name': '激进',
                    'description': '采取更直接、大胆的行动',
                    'temperature': 1.2,
                    'style_hint': '采取更直接、大胆、果断的行动方式。不要过于谨慎，可以承担一定风险。'
                },
                {
                    'style': 'balanced',
                    'name': '平衡',
                    'description': '采取平衡、理性的行动',
                    'temperature': 0.8,
                    'style_hint': '采取平衡、理性的行动方式。综合考虑各种因素，做出合理的决策。'
                },
                {
                    'style': 'conservative',
                    'name': '保守',
                    'description': '采取谨慎、稳妥的行动',
                    'temperature': 0.5,
                    'style_hint': '采取谨慎、稳妥、保守的行动方式。优先考虑安全，避免不必要的风险。'
                }
            ]
            
            # 生成多个选项
            options = []
            for i, config in enumerate(style_configs[:num_options]):
                try:
                    # 调用Performer的plan方法生成行动，传入风格提示和温度
                    plan = performer.plan_with_style(
                        other_roles_info=other_roles_info,
                        available_locations=self.scrollweaver.server.orchestrator.locations,
                        world_description=self.scrollweaver.server.orchestrator.description,
                        intervention=self.scrollweaver.server.event,
                        style_hint=config['style_hint'],
                        temperature=config['temperature']
                    )
                    
                    detail = plan.get("detail", "")
                    if detail:
                        options.append({
                            'index': i + 1,
                            'style': config['style'],
                            'name': config['name'],
                            'description': config['description'],
                            'text': detail
                        })
                except Exception as e:
                    print(f"Error generating option {i+1} ({config['style']}): {e}")
                    import traceback
                    traceback.print_exc()
            
            return options if options else None
        except Exception as e:
            print(f"Error in generate_auto_action_options: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    async def handle_user_role_input(self, client_id: str, role_code: str, user_text: str):
        """处理用户输入作为角色消息（当消息没有uuid时使用）"""
        try:
            # 生成record_id
            import uuid
            record_id = str(uuid.uuid4())
            
            # 记录用户输入到历史
            self.scrollweaver.server.record(
                role_code=role_code,
                detail=user_text,
                actor=role_code,
                group=self.scrollweaver.server.current_status.get('group', [role_code]),
                actor_type='role',
                act_type="user_input",
                record_id=record_id
            )
            
            # 构造消息格式
            performer = self.scrollweaver.server.performers[role_code]
            message = {
                'username': performer.role_name,
                'type': 'role',
                'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                'text': user_text,
                'icon': performer.icon_path if os.path.exists(performer.icon_path) and is_image(performer.icon_path) else default_icon_path,
                'uuid': record_id,
                'scene': self.scrollweaver.server.cur_round,
                'is_user': True  # 标记为用户输入
            }
            
            # 发送消息
            await self.active_connections[client_id].send_json({
                'type': 'message',
                'data': message
            })
            
            # 发送状态更新
            status = self.scrollweaver.get_current_status()
            await self.active_connections[client_id].send_json({
                'type': 'status_update',
                'data': status
            })
            
        except Exception as e:
            print(f"Error handling user role input: {e}")
            import traceback
            traceback.print_exc()

manager = ConnectionManager()

@app.get("/")
async def get():
    html_file = Path("index.html")
    return HTMLResponse(html_file.read_text(encoding="utf-8"))

@app.get("/data/{full_path:path}")
async def get_file(full_path: str):
    # 可以设置多个基础路径
    base_paths = [
        Path("/data/")
    ]
    
    for base_path in base_paths:
        file_path = base_path / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        else:
            return FileResponse(default_icon_path)
    
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/list-presets")
async def list_presets():
    try:
        # 获取所有json文件
        presets = [f for f in os.listdir(PRESETS_DIR) if f.endswith('.json')]
        return {"presets": presets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/load-preset")
async def load_preset(request: Request):
    try:
        data = await request.json()
        preset_name = data.get('preset')
        
        if not preset_name:
            raise HTTPException(status_code=400, detail="No preset specified")
            
        preset_path = os.path.join(PRESETS_DIR, preset_name)
        print(f"Loading preset from: {preset_path}")
        
        if not os.path.exists(preset_path):
            raise HTTPException(status_code=404, detail=f"Preset not found: {preset_path}")
            
        try:
            # 更新ScrollWeaver实例的预设
            manager.scrollweaver = ScrollWeaver(
                preset_path=preset_path,
                world_llm_name=config["world_llm_name"],
                role_llm_name=config["role_llm_name"],
                embedding_name=config["embedding_model_name"]
            )
            manager.scrollweaver.set_generator(
                rounds=config["rounds"],
                save_dir=config["save_dir"],
                if_save=config["if_save"],
                mode=config["mode"],
                scene_mode=config["scene_mode"]
            )
            
            # 获取初始数据
            initial_data = await manager.get_initial_data()
            
            return {
                "success": True,
                "data": initial_data
            }
        except Exception as e:
            print(f"Error initializing ScrollWeaver: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error initializing ScrollWeaver: {str(e)}")
            
    except Exception as e:
        print(f"Error in load_preset: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    print(f"WebSocket connection attempt for client {client_id}")
    await manager.connect(websocket, client_id)
    print(f"WebSocket connected for client {client_id}")
    try:
        print(f"Getting initial data for client {client_id}")
        initial_data = await manager.get_initial_data()
        await websocket.send_json({
            'type': 'initial_data',
            'data': initial_data
        })
        print(f"Initial data sent to client {client_id}")
        
        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                print(f"Received WebSocket message: {message.get('type')} for client {client_id}, full message: {message}")
            except json.JSONDecodeError as e:
                print(f"JSON decode error for client {client_id}: {e}")
                try:
                    await websocket.send_json({
                        'type': 'error',
                        'data': {'message': f'Invalid JSON: {str(e)}'}
                    })
                except:
                    pass  # Connection might be closed
                continue
            except WebSocketDisconnect:
                print(f"WebSocket disconnected for client {client_id} (during receive)")
                break
            except Exception as e:
                print(f"Error receiving message for client {client_id}: {e}")
                import traceback
                traceback.print_exc()
                # Check if connection is still open before breaking
                try:
                    await websocket.send_json({
                        'type': 'error',
                        'data': {'message': f'Error processing message: {str(e)}'}
                    })
                except:
                    pass  # Connection might be closed
                break
            
            if message['type'] == 'user_message':
                # 处理用户消息
                if client_id in manager.waiting_for_input and manager.waiting_for_input[client_id]:
                    # 如果正在等待用户输入，将输入传递给生成器
                    if client_id in manager.pending_user_inputs:
                        if not manager.pending_user_inputs[client_id].done():
                            user_text = message.get('text', '').strip()
                            if user_text:  # 只处理非空输入
                                manager.pending_user_inputs[client_id].set_result(user_text)
                            else:
                                # 空输入，提示用户
                                await websocket.send_json({
                                    'type': 'error',
                                    'data': {'message': '输入不能为空，请重新输入'}
                                })
                    else:
                        # 没有待处理的 Future，可能状态不一致
                        print(f"Warning: Received user message but no pending future for client {client_id}")
                        await websocket.send_json({
                            'type': 'error',
                            'data': {'message': '当前不是您的回合，无法发送消息'}
                        })
                else:
                    # 不在等待输入状态，拒绝用户消息
                    print(f"Warning: Received user message when not waiting for input for client {client_id}")
                    await websocket.send_json({
                        'type': 'error',
                        'data': {'message': '当前不是您的回合，请等待轮到您选择的角色时再发送消息'}
                    })
            
            elif message['type'] == 'select_role':
                # 处理角色选择
                role_name = message.get('role_name')
                if role_name:
                    role_code = manager._get_role_code_by_name(role_name)
                    if role_code:
                        manager.user_selected_roles[client_id] = role_code
                        await websocket.send_json({
                            'type': 'role_selected',
                            'data': {
                                'role_name': role_name,
                                'role_code': role_code,
                                'message': f'已选择角色: {role_name}'
                            }
                        })
                    else:
                        await websocket.send_json({
                            'type': 'error',
                            'data': {
                                'message': f'未找到角色: {role_name}'
                            }
                        })
                else:
                    if client_id in manager.user_selected_roles:
                        del manager.user_selected_roles[client_id]
                    await websocket.send_json({
                        'type': 'role_cleared',
                        'data': {
                            'message': '已取消角色选择'
                        }
                    })
            
            elif message['type'] == 'request_characters':
                # 请求角色列表
                characters = manager.scrollweaver.get_characters_info(use_selected=False)
                await websocket.send_json({
                    'type': 'characters_list',
                    'data': {
                        'characters': characters
                    }
                })
                
            elif message['type'] == 'control':
                # 处理控制命令
                print(f"Received control message: {message.get('action')} for client {client_id}")
                try:
                    if message['action'] == 'start':
                        print(f"Starting story for client {client_id}")
                        await manager.start_story(client_id)
                        print(f"Story started for client {client_id}")
                        # Send acknowledgment to client
                        try:
                            await websocket.send_json({
                                'type': 'story_started',
                                'data': {'message': '故事已开始'}
                            })
                        except Exception as e:
                            print(f"Error sending story_started message: {e}")
                    elif message['action'] == 'pause':
                        print(f"Pausing story for client {client_id}")
                        manager.stop_story(client_id)
                        try:
                            await websocket.send_json({
                                'type': 'story_paused',
                                'data': {'message': '故事已暂停'}
                            })
                        except Exception as e:
                            print(f"Error sending story_paused message: {e}")
                    elif message['action'] == 'stop':
                        print(f"Stopping story for client {client_id}")
                        manager.stop_story(client_id)
                        try:
                            await websocket.send_json({
                                'type': 'story_stopped',
                                'data': {'message': '故事已停止'}
                            })
                        except Exception as e:
                            print(f"Error sending story_stopped message: {e}")
                    else:
                        print(f"Unknown control action: {message.get('action')}")
                        try:
                            await websocket.send_json({
                                'type': 'error',
                                'data': {'message': f'Unknown action: {message.get("action")}'}
                            })
                        except Exception as e:
                            print(f"Error sending error message: {e}")
                except Exception as e:
                    print(f"Error handling control message: {e}")
                    import traceback
                    traceback.print_exc()
                    try:
                        await websocket.send_json({
                            'type': 'error',
                            'data': {'message': f'处理控制命令时出错: {str(e)}'}
                        })
                    except:
                        pass  # Connection might be closed
                    
            elif message['type'] == 'edit_message':
                # 处理消息编辑
                edit_data = message['data']
                # 假设 ScrollWeaver 类有一个处理编辑的方法
                manager.scrollweaver.handle_message_edit(
                    record_id=edit_data['uuid'],
                    new_text=edit_data['text']
                )
                
            elif message['type'] == 'request_scene_characters':
                context = message.get('context', 'runtime')
                scene = message.get('scene')
                if context == 'manual':
                    manager.scrollweaver.select_scene(scene)
                else:
                    manager.scrollweaver.select_scene(None)
                scene_characters = manager.scrollweaver.get_characters_info(
                    scene_number=scene,
                    use_selected=(context == 'manual' and scene is None)
                )
                await websocket.send_json({
                    'type': 'scene_characters',
                    'data': scene_characters
                })
                
            elif message['type'] == 'auto_complete':
                # 处理AI自动完成请求
                if client_id in manager.waiting_for_input and manager.waiting_for_input[client_id]:
                    user_role_code = manager.user_selected_roles.get(client_id)
                    if user_role_code and client_id in manager.pending_user_inputs:
                        if not manager.pending_user_inputs[client_id].done():
                            try:
                                # 调用AI生成多个行动选项
                                options = await manager.generate_auto_action_options(client_id, user_role_code, num_options=3)
                                if options and len(options) > 0:
                                    # 发送多个选项给前端
                                    await websocket.send_json({
                                        'type': 'auto_complete_options',
                                        'data': {
                                            'options': options,
                                            'message': 'AI已生成多个行动选项，请选择'
                                        }
                                    })
                                else:
                                    await websocket.send_json({
                                        'type': 'error',
                                        'data': {'message': 'AI生成行动失败，请重试'}
                                    })
                            except Exception as e:
                                print(f"Error generating auto action options: {e}")
                                import traceback
                                traceback.print_exc()
                                await websocket.send_json({
                                    'type': 'error',
                                    'data': {'message': f'生成行动时出错: {str(e)}'}
                                })
                    else:
                        await websocket.send_json({
                            'type': 'error',
                            'data': {'message': '未选择角色或不在等待输入状态'}
                        })
                else:
                    await websocket.send_json({
                        'type': 'error',
                        'data': {'message': '当前不在等待输入状态'}
                    })
            
            elif message['type'] == 'select_auto_option':
                # 处理用户选择的AI选项
                if client_id in manager.waiting_for_input and manager.waiting_for_input[client_id]:
                    user_role_code = manager.user_selected_roles.get(client_id)
                    if user_role_code and client_id in manager.pending_user_inputs:
                        if not manager.pending_user_inputs[client_id].done():
                            selected_text = message.get('selected_text', '')
                            if selected_text:
                                # 将选中的选项作为用户输入
                                manager.pending_user_inputs[client_id].set_result(selected_text)
                                await websocket.send_json({
                                    'type': 'auto_complete_success',
                                    'data': {'message': '已选择AI生成的行动'}
                                })
                            else:
                                await websocket.send_json({
                                    'type': 'error',
                                    'data': {'message': '无效的选项'}
                                })
                    else:
                        await websocket.send_json({
                            'type': 'error',
                            'data': {'message': '未选择角色或不在等待输入状态'}
                        })
                else:
                    await websocket.send_json({
                        'type': 'error',
                        'data': {'message': '当前不在等待输入状态'}
                    })
            
            elif message['type'] == 'generate_story':
                # 生成故事文本
                try:
                    scene = message.get('scene')
                    if scene == "" or scene is False:
                        scene = None
                    story_text = manager.scrollweaver.generate_story(scene_number=scene)
                    # 清理故事文本中的 Markdown 格式
                    if story_text:
                        story_text = remove_markdown(story_text)
                    # 发送生成的故事
                    await websocket.send_json({
                        'type': 'story_exported',
                        'data': {
                            'story': story_text,
                            'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        }
                    })
                except Exception as e:
                    print(f"Error generating story: {e}")
                    import traceback
                    traceback.print_exc()
                    await websocket.send_json({
                        'type': 'error',
                        'data': {
                            'message': f'生成故事时出错: {str(e)}'
                        }
                    })
            
            elif message['type'] == 'reset_session':
                # 处理重置session请求
                try:
                    success = await manager.reset_session(client_id)
                    if success:
                        # 发送重置成功消息
                        await websocket.send_json({
                            'type': 'session_reset',
                            'data': {
                                'message': 'Session已重置，所有临时对话内容已清空',
                                'success': True
                            }
                        })
                        # 发送清空消息的指令
                        await websocket.send_json({
                            'type': 'clear_messages',
                            'data': {}
                        })
                        # 发送更新后的初始数据
                        initial_data = await manager.get_initial_data()
                        await websocket.send_json({
                            'type': 'initial_data',
                            'data': initial_data
                        })
                    else:
                        await websocket.send_json({
                            'type': 'error',
                            'data': {
                                'message': '重置session失败'
                            }
                        })
                except Exception as e:
                    print(f"Error resetting session: {e}")
                    import traceback
                    traceback.print_exc()
                    await websocket.send_json({
                        'type': 'error',
                        'data': {
                            'message': f'重置session时出错: {str(e)}'
                        }
                    })
            else:
                # Unknown message type
                print(f"Unknown message type received: {message.get('type')} for client {client_id}")
                await websocket.send_json({
                    'type': 'error',
                    'data': {'message': f'Unknown message type: {message.get("type")}'}
                })
                
    except WebSocketDisconnect as e:
        print(f"WebSocket disconnected for client {client_id}: {e}")
        manager.disconnect(client_id)
    except Exception as e:
        print(f"WebSocket error for client {client_id}: {e}")
        import traceback
        traceback.print_exc()
        try:
            manager.disconnect(client_id)
        except:
            pass

@app.post("/api/save-config")
async def save_config(request: Request):
    # Disabled: front-end configuration is no longer supported for security reasons.
    # All configuration should be edited in the server-side config.json file and the service restarted.
    raise HTTPException(status_code=403, detail="前端配置已禁用。请在服务器上编辑 config.json 并重启服务以更改配置。")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
