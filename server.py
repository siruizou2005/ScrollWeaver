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
        if client_id in self.story_tasks:
            # 如果已经有任务在运行，先停止它
            self.stop_story(client_id)
        
        # 创建新的故事任务
        self.story_tasks[client_id] = asyncio.create_task(
            self.generate_story(client_id)
        )

    async def generate_story(self, client_id: str):
        """持续生成故事的协程"""
        try:
            while True:
                if client_id in self.active_connections:
                    message,status = await self.get_next_message()
                    
                    # 检查生成器是否已结束
                    if message is None:
                        await self.active_connections[client_id].send_json({
                            'type': 'story_ended',
                            'data': {'message': '故事已结束'}
                        })
                        break
                    
                    # 检查是否轮到用户选择的角色
                    user_role_code = self.user_selected_roles.get(client_id)
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
                    
                    # 正常发送消息
                    await self.active_connections[client_id].send_json({
                        'type': 'message',
                        'data': message
                    })
                    if status is not None:
                        await self.active_connections[client_id].send_json({
                            'type': 'status_update',
                            'data': status
                        })
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
            'characters': self.scrollweaver.get_characters_info(),
            'map': self.scrollweaver.get_map_info(),
            'settings': self.scrollweaver.get_settings_info(),
            'status': self.scrollweaver.get_current_status(),
            'history_messages':self.scrollweaver.get_history_messages(save_dir = config["save_dir"]),
        }
    
    async def get_next_message(self):
        """从ScrollWeaver获取下一条消息"""
        try:
            message = self.scrollweaver.generate_next_message()
        except StopIteration:
            # 生成器已结束
            return None, None
        if not os.path.exists(message["icon"]) or not is_image(message["icon"]):
            message["icon"] = default_icon_path
        status = self.scrollweaver.get_current_status()
        return message,status
    
    def _get_role_code_by_name(self, role_name: str) -> str:
        """通过角色名称找到角色代码"""
        if not role_name:
            return None
        try:
            # 遍历所有角色，查找匹配的名称或昵称
            for role_code in self.scrollweaver.server.role_codes:
                performer = self.scrollweaver.server.performers[role_code]
                if performer.role_name == role_name or performer.nickname == role_name:
                    return role_code
        except Exception as e:
            print(f"Error finding role code for {role_name}: {e}")
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
    await manager.connect(websocket, client_id)
    try:
        initial_data = await manager.get_initial_data()
        await websocket.send_json({
            'type': 'initial_data',
            'data': initial_data
        })
        
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
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
                    # 普通用户消息（未集成到故事系统）
                    await websocket.send_json({
                        'type': 'message',
                        'data': {
                            'username': 'User',
                            'timestamp': message['timestamp'],
                            'text': message['text'],
                            'icon': default_icon_path,
                        }
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
                
            elif message['type'] == 'control':
                # 处理控制命令
                if message['action'] == 'start':
                    await manager.start_story(client_id)
                elif message['action'] == 'pause':
                    manager.stop_story(client_id)
                elif message['action'] == 'stop':
                    manager.stop_story(client_id)
                    # 可以在这里添加额外的停止逻辑
                    
            elif message['type'] == 'edit_message':
                # 处理消息编辑
                edit_data = message['data']
                # 假设 ScrollWeaver 类有一个处理编辑的方法
                manager.scrollweaver.handle_message_edit(
                    record_id=edit_data['uuid'],
                    new_text=edit_data['text']
                )
                
            elif message['type'] == 'request_scene_characters':
                manager.scrollweaver.select_scene(message['scene'])
                scene_characters = manager.scrollweaver.get_characters_info()
                await websocket.send_json({
                    'type': 'scene_characters',
                    'data': scene_characters
                })
                
            elif message['type'] == 'generate_story':
                # 生成故事文本
                story_text = manager.scrollweaver.generate_story()
                # 发送生成的故事作为新消息
                await websocket.send_json({
                    'type': 'message',
                    'data': {
                        'username': 'System',
                        'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        'text': story_text,
                        'icon': default_icon_path,
                        'type': 'story'
                    }
                })
                
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        manager.disconnect(client_id)

@app.post("/api/save-config")
async def save_config(request: Request):
    # Disabled: front-end configuration is no longer supported for security reasons.
    # All configuration should be edited in the server-side config.json file and the service restarted.
    raise HTTPException(status_code=403, detail="前端配置已禁用。请在服务器上编辑 config.json 并重启服务以更改配置。")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
