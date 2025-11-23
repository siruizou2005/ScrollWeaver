from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Depends, Header, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json
import asyncio
import os
from pathlib import Path
from datetime import datetime
from typing import Optional
from sw_utils import is_image, load_json_file
from ScrollWeaver import ScrollWeaver
from modules.utils.text_utils import remove_markdown
from database import db
# Server class is now in modules.core.server, but ScrollWeaver wrapper is still in ScrollWeaver.py

app = FastAPI()
# 添加CORS支持
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()
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
        self.client_users: dict[str, dict] = {}  # client_id -> user_info  
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
        if client_id in self.client_users:
            del self.client_users[client_id]
            
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
        # 注意：对于包含 "--------- Current Event ---------" 的系统消息，保留完整文本
        if "text" in message and message["text"]:
            original_text = message["text"]
            # 如果是事件消息，只做基本清理，不进行完整的 markdown 移除
            if "--------- Current Event ---------" in original_text:
                # 只移除代码块标记，保留其他格式
                import re
                cleaned_text = re.sub(r'```[\w]*\n?', '', original_text)
                cleaned_text = re.sub(r'```', '', cleaned_text)
                message["text"] = cleaned_text.strip()
            else:
                message["text"] = remove_markdown(original_text)
                if not message["text"].strip():
                    print("Warning: Markdown cleanup removed all content; falling back to original text.")
                    message["text"] = original_text
        
        status = self.scrollweaver.get_current_status()
        # 清理状态中的事件描述（如果有）
        if status and isinstance(status, dict):
            if "event" in status and status["event"]:
                original_event = status["event"]
                # 如果事件文本包含 "--------- Current Event ---------"，只做基本清理
                if "--------- Current Event ---------" in original_event or "Current Event" in original_event:
                    # 只移除代码块标记，避免截断
                    import re
                    cleaned_event = re.sub(r'```[\w]*\n?', '', original_event)
                    cleaned_event = re.sub(r'```', '', cleaned_event)
                    status["event"] = cleaned_event.strip()
                else:
                    status["event"] = remove_markdown(original_event)
                    if not status["event"].strip():
                        print("Warning: Markdown cleanup removed all status event content; falling back to original text.")
                        status["event"] = original_event
        
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
    html_file = Path("frontend/pages/home.html")
    return HTMLResponse(html_file.read_text(encoding="utf-8"))

@app.get("/game")
async def get_game():
    """游戏页面"""
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
    
    # 存储客户端的scroll_id
    client_scroll_id = None
    
    try:
        first_message = None
        # 等待第一个消息，可能是初始化消息包含scroll_id和token
        try:
            first_data = await websocket.receive_text()
            first_message = json.loads(first_data)
            
            # 处理用户认证
            if 'token' in first_message:
                user_info = db.verify_token(first_message['token'])
                if user_info:
                    manager.client_users[client_id] = user_info
                    print(f"User authenticated: {user_info['username']} for client {client_id}")
            
            # 处理scroll_id
            if first_message.get('type') == 'init' and 'scroll_id' in first_message:
                client_scroll_id = first_message.get('scroll_id')
                # 加载对应的书卷
                if client_scroll_id:
                    scroll = db.get_scroll(client_scroll_id)
                    print(f"Loading scroll {client_scroll_id}: {scroll}")
                    if scroll:
                        preset_path = scroll.get('preset_path')
                        if preset_path and os.path.exists(preset_path):
                            # 为这个客户端创建新的ScrollWeaver实例
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
                            print(f"Loaded scroll {client_scroll_id} for client {client_id}, preset_path: {preset_path}")
                        else:
                            print(f"Warning: Scroll {client_scroll_id} preset_path not found or invalid: {preset_path}")
                            await websocket.send_json({
                                'type': 'error',
                                'data': {'message': f'书卷预设文件不存在: {preset_path}'}
                            })
                    else:
                        print(f"Warning: Scroll {client_scroll_id} not found in database")
                        await websocket.send_json({
                            'type': 'error',
                            'data': {'message': f'书卷不存在: {client_scroll_id}'}
                        })
                first_message = None  # init消息已处理，清除
        except Exception as e:
            # 如果没有初始化消息，使用默认预设
            print(f"No init message or error: {e}")
        
        print(f"Getting initial data for client {client_id}")
        initial_data = await manager.get_initial_data()
        await websocket.send_json({
            'type': 'initial_data',
            'data': initial_data
        })
        print(f"Initial data sent to client {client_id}")
        
        # 处理消息循环
        while True:
            try:
                # 如果第一个消息不是init，先处理它；否则接收新消息
                if first_message and first_message.get('type') != 'init':
                    message = first_message
                    first_message = None  # 清除，避免重复处理
                else:
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
                    
                    # 保存故事到数据库（如果用户已登录）
                    story_id = None
                    if client_id in manager.client_users:
                        user_info = manager.client_users[client_id]
                        scroll_id = None
                        # 尝试从localStorage获取scroll_id（通过消息传递）
                        if 'scroll_id' in message:
                            scroll_id = message.get('scroll_id')
                        
                        # 获取历史记录作为story_data
                        story_data = {}
                        if hasattr(manager.scrollweaver, 'get_history'):
                            story_data = manager.scrollweaver.get_history()
                        
                        story_id = db.save_story(
                            user_id=user_info['id'],
                            scroll_id=scroll_id,
                            title=f"故事_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                            content=story_text,
                            story_data=story_data
                        )
                    
                    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    # 发送生成的故事
                    await websocket.send_json({
                        'type': 'story_exported',
                        'data': {
                            'story': story_text,
                            'timestamp': timestamp,
                            'story_id': story_id
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

# 用户认证相关API
async def get_current_user(request: Request, authorization: Optional[str] = Header(None)):
    """获取当前用户"""
    token = None
    # 尝试从Authorization header获取token
    if authorization:
        if authorization.startswith("Bearer "):
            token = authorization[7:]
    # 尝试从query参数获取token（用于WebSocket等场景）
    if not token:
        token = request.query_params.get("token")
    # 尝试从cookie获取token
    if not token:
        token = request.cookies.get("token")
    
    if not token:
        raise HTTPException(status_code=401, detail="未提供token")
    
    user = db.verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="无效的token")
    return user

async def get_optional_user(request: Request, authorization: Optional[str] = Header(None)):
    """获取当前用户（可选）"""
    try:
        return await get_current_user(request, authorization)
    except HTTPException:
        return None

@app.post("/api/register")
async def register(request: Request):
    """用户注册"""
    try:
        data = await request.json()
        username = data.get('username')
        password = data.get('password')
        email = data.get('email')
        
        if not username or not password:
            raise HTTPException(status_code=400, detail="用户名和密码不能为空")
        
        user_id = db.create_user(username, password, email)
        if not user_id:
            raise HTTPException(status_code=400, detail="用户名已存在")
        
        token = db.create_token(user_id)
        return {"success": True, "token": token, "user": {"id": user_id, "username": username}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/login")
async def login(request: Request):
    """用户登录"""
    try:
        data = await request.json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            raise HTTPException(status_code=400, detail="用户名和密码不能为空")
        
        user = db.verify_user(username, password)
        if not user:
            raise HTTPException(status_code=401, detail="用户名或密码错误")
        
        token = db.create_token(user['id'])
        return {"success": True, "token": token, "user": user}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/user/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """获取当前用户信息"""
    return {"success": True, "user": current_user}

@app.get("/api/scrolls")
async def get_scrolls(request: Request, current_user: Optional[dict] = Depends(get_optional_user)):
    """获取书卷列表"""
    try:
        user_id = current_user['id'] if current_user else None
        scroll_type = request.query_params.get('type')
        scrolls = db.get_scrolls(user_id=user_id, scroll_type=scroll_type, include_public=True)
        return {"success": True, "scrolls": scrolls}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scrolls/{scroll_id}")
async def get_scroll(scroll_id: int):
    """获取单个书卷"""
    try:
        scroll = db.get_scroll(scroll_id)
        if not scroll:
            raise HTTPException(status_code=404, detail="书卷不存在")
        return {"success": True, "scroll": scroll}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/scrolls")
async def create_scroll_simple(request: Request, current_user: dict = Depends(get_current_user)):
    """创建书卷（简单版本）"""
    try:
        data = await request.json()
        title = data.get('title')
        description = data.get('description', '')
        scroll_type = data.get('scroll_type', 'user')
        preset_path = data.get('preset_path')
        world_dir = data.get('world_dir')
        is_public = data.get('is_public', False)
        
        if not title:
            raise HTTPException(status_code=400, detail="标题不能为空")
        
        scroll_id = db.create_scroll(
            user_id=current_user['id'],
            title=title,
            description=description,
            scroll_type=scroll_type,
            preset_path=preset_path,
            world_dir=world_dir,
            is_public=is_public
        )
        
        return {"success": True, "scroll_id": scroll_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stories")
async def get_stories(current_user: dict = Depends(get_current_user)):
    """获取用户的故事列表"""
    try:
        stories = db.get_user_stories(current_user['id'])
        return {"success": True, "stories": stories}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stories")
async def save_story(request: Request, current_user: dict = Depends(get_current_user)):
    """保存故事"""
    try:
        data = await request.json()
        scroll_id = data.get('scroll_id')
        title = data.get('title', '未命名故事')
        content = data.get('content', '')
        story_data = data.get('story_data', {})
        
        story_id = db.save_story(
            user_id=current_user['id'],
            scroll_id=scroll_id,
            title=title,
            content=content,
            story_data=story_data
        )
        
        return {"success": True, "story_id": story_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stories/{story_id}")
async def get_story(story_id: int, current_user: dict = Depends(get_current_user)):
    """获取单个故事"""
    try:
        story = db.get_story(story_id, current_user['id'])
        if not story:
            raise HTTPException(status_code=404, detail="故事不存在")
        return {"success": True, "story": story}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/create-scroll")
async def create_scroll(request: Request, current_user: dict = Depends(get_current_user)):
    """创建书卷（完整引导流程）"""
    try:
        data = await request.json()
        
        # 验证必填字段
        if not data.get('title') or not data.get('worldName') or not data.get('worldDescription'):
            raise HTTPException(status_code=400, detail="缺少必填字段")
        
        if not data.get('locations') or len(data['locations']) == 0:
            raise HTTPException(status_code=400, detail="至少需要一个地点")
        
        if not data.get('characters') or len(data['characters']) == 0:
            raise HTTPException(status_code=400, detail="至少需要一个角色")
        
        # 生成source名称（基于标题）
        import re
        source_name = re.sub(r'[^\w\s-]', '', data['title'])
        source_name = re.sub(r'[-\s]+', '_', source_name).lower()
        source_name = f"user_{current_user['id']}_{source_name}"
        
        # 创建目录结构
        base_dir = f"./data"
        world_dir = f"{base_dir}/worlds/{source_name}"
        roles_dir = f"{base_dir}/roles/{source_name}"
        locations_file = f"{base_dir}/locations/{source_name}.json"
        map_file = f"{base_dir}/maps/{source_name}.csv"
        preset_file = f"./experiment_presets/user_{current_user['id']}_{source_name}.json"
        
        os.makedirs(world_dir, exist_ok=True)
        os.makedirs(roles_dir, exist_ok=True)
        os.makedirs(f"{base_dir}/locations", exist_ok=True)
        os.makedirs(f"{base_dir}/maps", exist_ok=True)
        os.makedirs("./experiment_presets", exist_ok=True)
        
        # 1. 创建世界文件
        world_data = {
            "source": source_name,
            "world_name": data['worldName'],
            "description": data['worldDescription'],
            "language": data.get('language', 'zh')
        }
        world_file = f"{world_dir}/general.json"
        with open(world_file, 'w', encoding='utf-8') as f:
            json.dump(world_data, f, ensure_ascii=False, indent=2)
        
        # 2. 创建地点文件
        locations_data = {}
        for loc in data['locations']:
            location_code = re.sub(r'[^\w\s-]', '', loc['name'])
            location_code = re.sub(r'[-\s]+', '_', location_code).lower()
            locations_data[location_code] = {
                "location_code": location_code,
                "location_name": loc['name'],
                "source": source_name,
                "description": loc['description'],
                "detail": loc.get('detail', '')
            }
        with open(locations_file, 'w', encoding='utf-8') as f:
            json.dump(locations_data, f, ensure_ascii=False, indent=2)
        
        # 3. 创建地图文件（CSV格式）
        location_codes = list(locations_data.keys())
        import csv
        with open(map_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            # 表头
            writer.writerow([''] + location_codes)
            # 距离矩阵（默认距离为1）
            for loc_code in location_codes:
                row = [loc_code]
                for target_code in location_codes:
                    if loc_code == target_code:
                        row.append(0)
                    else:
                        row.append(1)
                writer.writerow(row)
        
        # 4. 创建角色文件
        performer_codes = []
        for char in data['characters']:
            char_name = char.get('name', '').strip()
            if not char_name:
                continue  # 跳过名称为空的角色
            
            # 如果code为空或无效，从name生成
            char_code = char.get('code', '').strip()
            if not char_code:
                import re
                char_code = re.sub(r'[^\w\s-]', '', char_name.lower())
                char_code = re.sub(r'[-\s]+', '_', char_code)
                print(f"警告：角色 '{char_name}' 的代码为空，自动生成为: {char_code}")
            
            performer_codes.append(char_code)
            
            char_dir = f"{roles_dir}/{char_code}"
            os.makedirs(char_dir, exist_ok=True)
            
            # 构建角色关系
            relations = {}
            for other_char in data['characters']:
                if other_char['code'] != char_code:
                    relations[other_char['code']] = {
                        "relation": [],
                        "detail": ""
                    }
            
            char_data = {
                "role_code": char_code,
                "role_name": char['name'],
                "source": source_name,
                "activity": 1,
                "profile": char['profile'],
                "nickname": char.get('nickname', char['name']),
                "relation": relations
            }
            
            char_file = f"{char_dir}/role_info.json"
            with open(char_file, 'w', encoding='utf-8') as f:
                json.dump(char_data, f, ensure_ascii=False, indent=2)
        
        # 5. 创建预设文件
        preset_data = {
            "experiment_subname": source_name,
            "source": source_name,
            "world_file_path": world_file,
            "map_file_path": map_file,
            "loc_file_path": locations_file,
            "role_file_dir": f"./data/roles/",
            "performer_codes": performer_codes,
            "intervention": data.get('description', ''),
            "script": "",
            "language": data.get('language', 'zh')
        }
        with open(preset_file, 'w', encoding='utf-8') as f:
            json.dump(preset_data, f, ensure_ascii=False, indent=2)
        
        # 6. 在数据库中创建书卷记录
        scroll_id = db.create_scroll(
            user_id=current_user['id'],
            title=data['title'],
            description=data.get('description', ''),
            scroll_type='user',
            preset_path=preset_file,
            world_dir=world_dir
        )
        
        return {
            "success": True,
            "scroll_id": scroll_id,
            "message": "书卷创建成功"
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload-document")
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """上传文档并处理生成书卷数据"""
    print(f"[上传文档] 开始处理文件: {file.filename}, 用户ID: {current_user.get('id')}, 标题: {title}")
    try:
        import sys
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        
        # 检查文件大小（1万字约50KB，20页约200KB，设置限制为5MB）
        file_content = await file.read()
        file_size = len(file_content)
        print(f"[上传文档] 文件大小: {file_size} 字节 ({file_size / 1024:.2f} KB)")
        if file_size > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="文件大小超过限制（5MB）")
        
        # 保存上传的文件
        upload_dir = f"./user_uploads/{current_user['id']}"
        os.makedirs(upload_dir, exist_ok=True)
        
        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, 'wb') as f:
            f.write(file_content)
        print(f"[上传文档] 文件已保存到: {file_path}")
        
        # 使用 Gemini API 一次性提取所有信息（世界观、角色、地点）
        file_ext = os.path.splitext(file.filename)[1].lower()
        
        # 支持的 MIME 类型
        mime_types = {
            '.txt': 'text/plain',
            '.pdf': 'application/pdf',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.doc': 'application/msword'
        }
        
        if file_ext not in mime_types:
            raise HTTPException(status_code=400, detail=f"不支持的文件格式: {file_ext}，支持格式：TXT, DOC, DOCX, PDF")
        
        mime_type = mime_types[file_ext]
        
        # 生成 source 名称
        import re
        source_name = re.sub(r'[^\w\s-]', '', title)
        source_name = re.sub(r'[-\s]+', '_', source_name).lower()
        source_name = f"user_{current_user['id']}_{source_name}"
        
        # 创建目录结构
        base_dir = f"./data"
        world_dir = f"{base_dir}/worlds/{source_name}"
        roles_dir = f"{base_dir}/roles/{source_name}"
        locations_file = f"{base_dir}/locations/{source_name}.json"
        map_file = f"{base_dir}/maps/{source_name}.csv"
        preset_file = f"./experiment_presets/user_{current_user['id']}_{source_name}.json"
        
        os.makedirs(world_dir, exist_ok=True)
        os.makedirs(roles_dir, exist_ok=True)
        os.makedirs(f"{base_dir}/locations", exist_ok=True)
        os.makedirs(f"{base_dir}/maps", exist_ok=True)
        os.makedirs("./experiment_presets", exist_ok=True)
        
        try:
            from google import genai
            from google.genai import types
            
            # 配置 Gemini API - 新API需要设置环境变量
            gemini_api_key = os.getenv("GEMINI_API_KEY") or config.get("GEMINI_API_KEY")
            if not gemini_api_key:
                raise HTTPException(status_code=500, detail="未配置 GEMINI_API_KEY，无法处理文件")
            
            # 设置环境变量（新API需要）
            os.environ['GEMINI_API_KEY'] = gemini_api_key
            
            # 创建客户端（使用Gemini Developer API，不是Vertex AI）
            client = genai.Client(vertexai=False)
            
            print(f"[上传文档] 开始使用 Gemini API（新API）一次性提取所有信息...")
            
            # 构建一次性提取所有信息的提示词
            extraction_prompt = """请从提供的文档中一次性提取以下所有信息，并以 JSON 格式返回：

{
    "world": {
        "world_name": "世界名称",
        "description": "详细的世界观描述，包括背景设定、规则、特色等",
        "language": "zh"
    },
    "characters": [
        {
            "role_name": "角色名称",
            "nickname": "昵称",
            "profile": "角色简介，包括性格、背景、特点等"
        }
    ],
    "locations": {
        "地点代码": {
            "location_code": "地点代码",
            "location_name": "地点名称",
            "description": "地点描述",
            "detail": "详细描述"
        }
    }
}

要求：
1. 提取主要角色（至少2个，最多10个）
2. 提取主要地点（至少2个，最多10个）
3. 只返回 JSON 格式，不要添加任何其他说明或注释
4. 确保 JSON 格式正确，可以直接解析

请开始分析文档："""
            
            # 根据文件类型处理
            if file_ext == '.txt':
                # 对于 TXT 文件，直接读取内容
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        file_text = f.read()
                except UnicodeDecodeError:
                    try:
                        with open(file_path, 'r', encoding='gbk') as f:
                            file_text = f.read()
                    except UnicodeDecodeError:
                        with open(file_path, 'r', encoding='gb2312') as f:
                            file_text = f.read()
                
                # 检查文本长度
                if len(file_text) > 100000:  # 限制为10万字
                    file_text = file_text[:100000]
                    print(f"[上传文档] 文本过长，已截取前10万字")
                
                print(f"[上传文档] 使用 Gemini API 处理 TXT 文件: {file.filename}")
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[extraction_prompt, file_text]
                )
            else:
                # 对于 PDF、DOCX、DOC 文件，读取文件内容并使用 Part.from_bytes
                print(f"[上传文档] 读取文件内容: {file.filename}, MIME类型: {mime_type}")
                with open(file_path, 'rb') as f:
                    file_data = f.read()
                
                print(f"[上传文档] 文件大小: {len(file_data)} 字节")
                print(f"[上传文档] 使用 Part.from_bytes 上传文件并提取信息...")
                
                # 使用新API的方式：直接使用 Part.from_bytes
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[
                        types.Part.from_bytes(
                            data=file_data,
                            mime_type=mime_type,
                        ),
                        extraction_prompt
                    ]
                )
                
                print(f"[上传文档] 文件处理完成，信息提取成功")
            
            if not response or not response.text:
                raise HTTPException(status_code=500, detail="Gemini API 未能提取信息")
            
            # 解析返回的 JSON
            result_text = response.text.strip()
            try:
                # 移除可能的 markdown 代码块标记
                if "```json" in result_text:
                    result_text = result_text.split("```json")[1].split("```")[0].strip()
                elif "```" in result_text:
                    result_text = result_text.split("```")[1].split("```")[0].strip()
                
                extracted_data = json.loads(result_text)
            except json.JSONDecodeError as e:
                print(f"[上传文档] JSON 解析失败: {e}")
                print(f"[上传文档] 返回的文本: {result_text[:500]}")
                raise HTTPException(status_code=500, detail=f"无法解析 Gemini API 返回的 JSON 格式: {str(e)}")
            
            # 1. 提取世界观信息
            world_info = extracted_data.get("world", {})
            if not world_info:
                world_info = {
                    "world_name": title,
                    "description": "从文档中提取的世界观",
                    "language": "zh"
                }
            world_info["source"] = source_name
            
            world_file = os.path.join(world_dir, "general.json")
            with open(world_file, 'w', encoding='utf-8') as f:
                json.dump(world_info, f, ensure_ascii=False, indent=2)
            print(f"[上传文档] 世界信息文件已创建: {world_file}")
            
            # 2. 提取角色信息
            characters = extracted_data.get("characters", [])
            if not characters or len(characters) < 1:
                characters = [{
                    "role_name": "主角",
                    "nickname": "主角",
                    "profile": "文档中的主要角色"
                }]
            
            performer_codes = []
            for char in characters:
                char_name = char.get("role_name", "未知角色")
                char_code = re.sub(r'[^\w\s-]', '', char_name)
                char_code = re.sub(r'[-\s]+', '_', char_code).lower()
                char_code = f"{char_code}-zh"
                performer_codes.append(char_code)
                
                char_dir = os.path.join(roles_dir, char_code)
                os.makedirs(char_dir, exist_ok=True)
                
                # 构建角色关系
                relations = {}
                for other_char in characters:
                    if other_char.get("role_name") != char_name:
                        other_code = re.sub(r'[^\w\s-]', '', other_char.get("role_name", ""))
                        other_code = re.sub(r'[-\s]+', '_', other_code).lower()
                        other_code = f"{other_code}-zh"
                        relations[other_code] = {
                            "relation": [],
                            "detail": ""
                        }
                
                # 确保nickname不为null，如果为空则使用role_name
                nickname_value = char.get("nickname")
                if not nickname_value or nickname_value == "null" or nickname_value is None:
                    nickname_value = char_name
                
                char_data = {
                    "role_code": char_code,
                    "role_name": char_name,
                    "source": source_name,
                    "activity": 1,
                    "profile": char.get("profile", ""),
                    "nickname": nickname_value,
                    "relation": relations
                }
                
                char_file = os.path.join(char_dir, "role_info.json")
                with open(char_file, 'w', encoding='utf-8') as f:
                    json.dump(char_data, f, ensure_ascii=False, indent=2)
                print(f"[上传文档] 角色信息已保存: {char_file}")
            
            # 3. 提取地点信息
            locations_data = extracted_data.get("locations", {})
            if not locations_data:
                locations_data = {
                    "default_location": {
                        "location_code": "default_location",
                        "location_name": "默认地点",
                        "description": "文档中的主要地点",
                        "detail": ""
                    }
                }
            
            # 为每个地点添加 source
            for loc_code, loc_info in locations_data.items():
                loc_info["source"] = source_name
            
            with open(locations_file, 'w', encoding='utf-8') as f:
                json.dump(locations_data, f, ensure_ascii=False, indent=2)
            print(f"[上传文档] 地点信息已保存: {locations_file}")
            
            # 4. 创建地图文件（CSV格式）
            location_codes = list(locations_data.keys())
            import csv
            with open(map_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([''] + location_codes)
                for loc_code in location_codes:
                    row = [loc_code]
                    for target_code in location_codes:
                        if loc_code == target_code:
                            row.append(0)
                        else:
                            row.append(1)
                    writer.writerow(row)
            print(f"[上传文档] 地图文件已创建: {map_file}")
            
            # 5. 创建预设文件
            preset_data = {
                "experiment_subname": source_name,
                "source": source_name,
                "world_file_path": world_file,
                "map_file_path": map_file,
                "loc_file_path": locations_file,
                "role_file_dir": f"./data/roles/",
                "performer_codes": performer_codes,
                "intervention": "",
                "script": "",
                "language": world_info.get("language", "zh")
            }
            with open(preset_file, 'w', encoding='utf-8') as f:
                json.dump(preset_data, f, ensure_ascii=False, indent=2)
            print(f"[上传文档] 预设文件已创建: {preset_file}")
                
        except ImportError as e:
            print(f"[上传文档] 错误: 缺少 google-generativeai 库")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail="缺少 google-generativeai 库，请安装: pip install google-generativeai")
        except HTTPException:
            # 重新抛出 HTTPException，不进行额外处理
            raise
        except Exception as e:
            import traceback
            print(f"[上传文档] 处理文件时发生错误: {str(e)}")
            traceback.print_exc()
            error_msg = str(e)
            if "GEMINI_API_KEY" in error_msg or "API key" in error_msg.lower():
                raise HTTPException(status_code=500, detail=f"Gemini API 配置错误: {error_msg}")
            elif "不支持的文件格式" in error_msg:
                raise HTTPException(status_code=400, detail=error_msg)
            else:
                raise HTTPException(status_code=500, detail=f"处理文件时出错: {error_msg}")
        
        # 创建书卷记录
        scroll_id = db.create_scroll(
            user_id=current_user['id'],
            title=title,
            description=f"从文档自动生成：{file.filename}",
            scroll_type='user',
            preset_path=preset_file,
            world_dir=world_dir
        )
        
        print(f"[上传文档] 书卷创建成功，ID: {scroll_id}")
        
        return {
            "success": True,
            "scroll_id": scroll_id,
            "message": "文档处理完成，书卷已创建"
        }
    except HTTPException:
        # 重新抛出 HTTPException，不进行额外处理
        raise
    except Exception as e:
        import traceback
        print(f"[上传文档] 未预期的错误: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"处理文档时发生错误: {str(e)}")

@app.post("/api/save-config")
async def save_config(request: Request):
    # Disabled: front-end configuration is no longer supported for security reasons.
    # All configuration should be edited in the server-side config.json file and the service restarted.
    raise HTTPException(status_code=403, detail="前端配置已禁用。请在服务器上编辑 config.json 并重启服务以更改配置。")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
