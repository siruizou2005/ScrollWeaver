from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Depends, Header, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json
import asyncio
import os
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict
from sw_utils import is_image, load_json_file
from ScrollWeaver import ScrollWeaver
from modules.utils.text_utils import remove_markdown
from database import db
from modules.core.socketio_manager import SocketIOManager
from modules.core.sessions import SessionMode, SessionManager
from modules.werewolf.werewolf_session import WerewolfSessionManager
from modules.business.business_game import BusinessGameManager
from modules.gathering.who_is_human_game import WhoIsHumanGameManager
import socketio
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

# 初始化 Socket.IO 管理器
socketio_manager = SocketIOManager()

# 初始化会话管理器（用于聊天会话）
session_manager = SessionManager()

# 初始化狼人杀会话管理器
werewolf_manager = WerewolfSessionManager()

# 初始化商业博弈管理器
business_manager = BusinessGameManager()

# 初始化谁是人类游戏管理器
who_is_human_manager = WhoIsHumanGameManager()

# Startup event handler for warmup
@app.on_event("startup")
async def startup_event():
    """服务器启动时的预热任务"""
    print("=" * 60)
    print("Starting ScrollWeaver server...")
    print("=" * 60)
    
    # 初始化 Socket.IO
    socketio_manager.set_app(app)
    # 将 Socket.IO 挂载为 ASGI 应用
    socketio_app = socketio.ASGIApp(socketio_manager.sio, app)
    app.mount("/socket.io", socketio_app)
    print("[SocketIO] Socket.IO manager initialized")
    
    # 在后台异步预热embedding模型
    asyncio.create_task(warmup_models())

async def warmup_models():
    """后台预热模型"""
    try:
        print("\n[Warmup] Starting background model warmup...")
        
        # 预加载embedding模型
        embedding_name = config.get("embedding_model_name", "bge-m3")
        language = 'zh'
        
        print(f"[Warmup] Pre-loading embedding model: {embedding_name}")
        
        # 在线程池中执行以避免阻塞
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            ConnectionManager.get_or_create_embedding,
            embedding_name,
            language
        )
        
        print("[Warmup] ✓ Embedding model loaded successfully")
        print("[Warmup] ✓ Server is ready for connections")
        print("=" * 60)
        
    except Exception as e:
        print(f"[Warmup] ✗ Warning: Error during warmup: {e}")
        print("[Warmup] Server will load models on first connection")
        print("=" * 60)
        import traceback
        traceback.print_exc()


class ConnectionManager:
    # Class-level embedding cache for sharing across instances
    _shared_embedding = None
    _shared_embedding_name = None
    
    @classmethod
    def get_or_create_embedding(cls, embedding_name: str, language: str = 'zh'):
        """获取或创建共享的embedding实例，避免重复加载"""
        from modules.embedding import get_embedding_model
        
        cache_key = f"{embedding_name}_{language}"
        if cls._shared_embedding is None or cls._shared_embedding_name != cache_key:
            print(f"\n[ConnectionManager] Loading shared embedding model: {embedding_name}")
            cls._shared_embedding = get_embedding_model(embedding_name, language)
            cls._shared_embedding_name = cache_key
            print(f"[ConnectionManager] ✓ Shared embedding model loaded\n")
        else:
            print(f"[ConnectionManager] ✓ Reusing cached embedding model: {embedding_name}")
        
        return cls._shared_embedding
    
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}  
        self.story_tasks: dict[str, asyncio.Task] = {}
        self.user_selected_roles: dict[str, str] = {}  # client_id -> role_code
        self.waiting_for_input: dict[str, bool] = {}  # client_id -> bool
        self.pending_user_inputs: dict[str, asyncio.Future] = {}  # client_id -> Future
        self.client_users: dict[str, dict] = {}  # client_id -> user_info
        
        # 延迟初始化scrollweaver，只在需要时创建（根据scroll_id）
        # 这样可以避免在ConnectionManager初始化时就加载所有模型
        self.scrollweaver = None
          
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
        try:
            if not hasattr(self, 'scrollweaver') or self.scrollweaver is None:
                print("Warning: scrollweaver not initialized in get_initial_data")
                return {
                    'characters': [],
                    'map': {'places': [], 'distances': []},
                    'settings': {},
                    'status': {},
                    'history_messages': []
                }
            
            return {
                'characters': self.scrollweaver.get_characters_info(use_selected=False),
                'map': self.scrollweaver.get_map_info(),
                'settings': self.scrollweaver.get_settings_info(),
                'status': self.scrollweaver.get_current_status(),
                'history_messages':self.scrollweaver.get_history_messages(save_dir = config["save_dir"]),
            }
        except Exception as e:
            print(f"Error in get_initial_data: {e}")
            import traceback
            traceback.print_exc()
            # 返回空数据而不是抛出异常
            return {
                'characters': [],
                'map': {'places': [], 'distances': []},
                'settings': {},
                'status': {},
                'history_messages': []
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


# Lazy initialization for ConnectionManager
_manager_instance = None

def get_manager() -> ConnectionManager:
    """获取ConnectionManager单例，使用延迟初始化"""
    global _manager_instance
    if _manager_instance is None:
        print("\n[Server] Initializing ConnectionManager...")
        _manager_instance = ConnectionManager()
        print("[Server] ✓ ConnectionManager initialized\n")
    return _manager_instance

# For backward compatibility, keep manager as a property
class _ManagerProxy:
    def __getattr__(self, name):
        return getattr(get_manager(), name)
    
    def __setattr__(self, name, value):
        setattr(get_manager(), name, value)

manager = _ManagerProxy()


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
            # Get shared embedding instance
            embedding = ConnectionManager.get_or_create_embedding(
                config["embedding_model_name"],
                language='zh'
            )
            
            # 更新ScrollWeaver实例的预设
            manager.scrollweaver = ScrollWeaver(
                preset_path=preset_path,
                world_llm_name=config["world_llm_name"],
                role_llm_name=config["role_llm_name"],
                embedding_name=config["embedding_model_name"],
                embedding=embedding
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
    try:
        await manager.connect(websocket, client_id)
        print(f"WebSocket connected for client {client_id}")
    except Exception as e:
        print(f"Error connecting WebSocket for client {client_id}: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # 存储客户端的scroll_id
    client_scroll_id = None
    
    try:
        first_message = None
        # 等待第一个消息，可能是初始化消息包含scroll_id和token
        try:
            first_data = await websocket.receive_text()
            print(f"Received first message from client {client_id}: {first_data[:200]}")  # 只打印前200字符
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
                    try:
                        scroll = db.get_scroll(client_scroll_id)
                        print(f"Loading scroll {client_scroll_id}: {scroll}")
                        if scroll:
                            preset_path = scroll.get('preset_path')
                            if preset_path and os.path.exists(preset_path):
                                # Get shared embedding instance
                                embedding = ConnectionManager.get_or_create_embedding(
                                    config["embedding_model_name"],
                                    language='zh'
                                )
                                
                                print(f"Initializing ScrollWeaver for scroll {client_scroll_id}...")
                                # 为这个客户端创建新的ScrollWeaver实例
                                manager.scrollweaver = ScrollWeaver(
                                    preset_path=preset_path,
                                    world_llm_name=config["world_llm_name"],
                                    role_llm_name=config["role_llm_name"],
                                    embedding_name=config["embedding_model_name"],
                                    embedding=embedding
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
                    except Exception as e:
                        print(f"Error loading scroll {client_scroll_id}: {e}")
                        import traceback
                        traceback.print_exc()
                        await websocket.send_json({
                            'type': 'error',
                            'data': {'message': f'加载书卷失败: {str(e)}'}
                        })
                first_message = None  # init消息已处理，清除
        except Exception as e:
            # 如果没有初始化消息，使用默认预设
            print(f"No init message or error: {e}")
            import traceback
            traceback.print_exc()
        
        print(f"Getting initial data for client {client_id}")
        try:
            # 检查scrollweaver是否已初始化
            if not hasattr(manager, 'scrollweaver') or manager.scrollweaver is None:
                print(f"Warning: scrollweaver not initialized for client {client_id}")
                await websocket.send_json({
                    'type': 'error',
                    'data': {'message': '书卷未初始化，请刷新页面重试'}
                })
                # 发送空的初始数据，让前端知道连接已建立
                await websocket.send_json({
                    'type': 'initial_data',
                    'data': {
                        'characters': [],
                        'map': {'places': [], 'distances': []},
                        'settings': {},
                        'status': {},
                        'history_messages': []
                    }
                })
            else:
                initial_data = await manager.get_initial_data()
                await websocket.send_json({
                    'type': 'initial_data',
                    'data': initial_data
                })
                print(f"Initial data sent to client {client_id}")
        except Exception as e:
            print(f"Error getting initial data for client {client_id}: {e}")
            import traceback
            traceback.print_exc()
            await websocket.send_json({
                'type': 'error',
                'data': {'message': f'获取初始数据失败: {str(e)}'}
            })
            # 即使出错也发送空的初始数据，让前端知道连接已建立
            await websocket.send_json({
                'type': 'initial_data',
                'data': {
                    'characters': [],
                    'map': {'places': [], 'distances': []},
                    'settings': {},
                    'status': {},
                    'history_messages': []
                }
            })
        
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
                        
                        # 在角色选择时初始化所有角色的位置（如果尚未初始化）
                        import random
                        if hasattr(manager.scrollweaver, 'server') and manager.scrollweaver.server:
                            server = manager.scrollweaver.server
                            if hasattr(server, 'performers') and hasattr(server, 'orchestrator'):
                                locations = server.orchestrator.locations if server.orchestrator.locations else []
                                if locations:
                                    needs_init = any(
                                        not p.location_code or not p.location_name 
                                        for p in server.performers.values()
                                    )
                                    if needs_init:
                                        print("[select_role] 正在初始化所有角色位置...")
                                        init_locs = random.choices(locations, k=len(server.performers))
                                        for i, (rc, performer) in enumerate(server.performers.items()):
                                            performer.set_location(
                                                init_locs[i],
                                                server.orchestrator.find_location_name(init_locs[i])
                                            )
                                            print(f"[select_role] {performer.role_name} -> {performer.location_name}")
                        
                        # 返回角色选择成功消息
                        await websocket.send_json({
                            'type': 'role_selected',
                            'data': {
                                'role_name': role_name,
                                'role_code': role_code,
                                'message': f'已选择角色: {role_name}'
                            }
                        })
                        
                        # 返回更新后的角色和地图数据（包含位置信息）
                        updated_characters = manager.scrollweaver.get_characters_info(use_selected=False)
                        updated_map = manager.scrollweaver.get_map_info()
                        await websocket.send_json({
                            'type': 'initial_data',
                            'data': {
                                'characters': updated_characters,
                                'map': updated_map,
                                'settings': manager.scrollweaver.get_settings_info(),
                                'status': manager.scrollweaver.get_current_status(),
                                'history_messages': []
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
                    # 清理故事文本中的 Markdown 格式和故事标记符号
                    if story_text:
                        story_text = remove_markdown(story_text)
                        # 专门清理故事格式标记（【】、（）、「」），只在输出故事时使用
                        import re
                        # 【】内的心理活动：移除标记，保留内容
                        story_text = re.sub(r'【([^】]*)】', r'\1', story_text)
                        # （）内的动作：移除标记，保留内容
                        story_text = re.sub(r'（([^）]*)）', r'\1', story_text)
                        # 「」内的对话：转换为引号
                        story_text = re.sub(r'「([^」]*)」', r'"\1"', story_text)
                        # 清理多余的空格和换行，但保留段落之间的空行
                        # 首先规范化段落之间的空行为两个换行符（保留段落分隔）
                        story_text = re.sub(r'\n\s*\n\s*\n+', '\n\n', story_text)
                        # 规范化单个换行符后的空格（段落内的换行）
                        story_text = re.sub(r'\n +', '\n', story_text)
                        story_text = re.sub(r' +\n', '\n', story_text)
                        # 清理段落内的多个连续空格为单个空格（但不影响换行符和空行）
                        lines = story_text.split('\n')
                        cleaned_lines = []
                        for line in lines:
                            if line.strip() == '':
                                # 保留空行作为段落分隔符
                                cleaned_lines.append('')
                            else:
                                # 清理每行内的多余空格，但保留行首行尾的空格（如果有意义的话）
                                cleaned_line = re.sub(r'[ \t]+', ' ', line)
                                # 清理行首行尾的空格
                                cleaned_line = cleaned_line.strip()
                                cleaned_lines.append(cleaned_line)
                        story_text = '\n'.join(cleaned_lines)
                        # 确保段落之间有空行分隔（如果原本有多个空行，保留为两个）
                        story_text = re.sub(r'\n\n\n+', '\n\n', story_text)
                        story_text = story_text.strip()
                    
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
            
            elif message['type'] == 'move_character':
                # 处理用户指定的角色移动请求
                try:
                    role_name = message.get('role_name')
                    target_location = message.get('target_location')
                    
                    if not role_name or not target_location:
                        await websocket.send_json({
                            'type': 'error',
                            'data': {'message': '缺少角色名或目标地点'}
                        })
                    else:
                        # 获取角色代码
                        role_code = manager._get_role_code_by_name(role_name)
                        if not role_code:
                            await websocket.send_json({
                                'type': 'error',
                                'data': {'message': f'未找到角色: {role_name}'}
                            })
                        else:
                            # 获取目标地点代码
                            target_location_code = None
                            for loc_code in manager.scrollweaver.server.orchestrator.locations:
                                loc_name = manager.scrollweaver.server.orchestrator.find_location_name(loc_code)
                                if loc_name == target_location:
                                    target_location_code = loc_code
                                    break
                            
                            if not target_location_code:
                                await websocket.send_json({
                                    'type': 'error',
                                    'data': {'message': f'未找到地点: {target_location}'}
                                })
                            else:
                                # 设置角色位置
                                performer = manager.scrollweaver.server.performers[role_code]
                                old_location = performer.location_name or '未知位置'
                                performer.set_location(target_location_code, target_location)
                                
                                # 发送成功消息
                                await websocket.send_json({
                                    'type': 'character_moved',
                                    'data': {
                                        'role_name': role_name,
                                        'from_location': old_location,
                                        'to_location': target_location,
                                        'message': f'{role_name} 已前往 {target_location}'
                                    }
                                })
                                
                                # 发送更新后的状态
                                status = manager.scrollweaver.get_current_status()
                                await websocket.send_json({
                                    'type': 'status_update',
                                    'data': status
                                })
                except Exception as e:
                    print(f"Error moving character: {e}")
                    import traceback
                    traceback.print_exc()
                    await websocket.send_json({
                        'type': 'error',
                        'data': {'message': f'移动角色时出错: {str(e)}'}
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

@app.get("/api/scrolls/shared")
async def get_shared_scrolls(current_user: dict = Depends(get_current_user)):
    """获取共享的书卷列表（排除当前用户自己的书卷）"""
    try:
        scrolls = db.get_shared_scrolls(current_user['id'])
        return {"success": True, "scrolls": scrolls}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/scroll/{scroll_id}/share")
async def share_scroll(scroll_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    """共享/取消共享书卷"""
    try:
        data = await request.json()
        is_public = data.get('is_public', True)
        
        # 更新共享状态
        success = db.update_scroll_share_status(scroll_id, is_public, current_user['id'])
        
        if not success:
            raise HTTPException(status_code=403, detail="无权操作此书卷或书卷不存在")
        
        return {
            "success": True,
            "message": "共享状态已更新" if is_public else "已取消共享"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scroll/{scroll_id}")
async def get_scroll_for_intro(scroll_id: int):
    """获取单个书卷（用于intro页面）"""
    try:
        scroll = db.get_scroll(scroll_id)
        if not scroll:
            raise HTTPException(status_code=404, detail="书卷不存在")
        return scroll
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scrolls/{scroll_id}")
async def get_scroll(scroll_id: int):
    """获取单个书卷（兼容旧API）"""
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
        # 首先生成所有角色的code
        char_code_map = {}  # 存储角色名到code的映射
        for char in data['characters']:
            char_name = char.get('name', '').strip()
            if not char_name:
                continue
            
            # 从name生成code
            char_code = re.sub(r'[^\w\s-]', '', char_name.lower())
            char_code = re.sub(r'[-\s]+', '_', char_code)
            char_code = f"{char_code}-zh"  # 添加语言后缀
            char_code_map[char_name] = char_code
        
        performer_codes = []
        for char in data['characters']:
            char_name = char.get('name', '').strip()
            if not char_name:
                continue  # 跳过名称为空的角色
            
            char_code = char_code_map.get(char_name)
            if not char_code:
                continue
            
            performer_codes.append(char_code)
            
            char_dir = f"{roles_dir}/{char_code}"
            os.makedirs(char_dir, exist_ok=True)
            
            # 构建角色关系
            relations = {}
            for other_char in data['characters']:
                other_name = other_char.get('name', '').strip()
                if other_name and other_name != char_name:
                    other_code = char_code_map.get(other_name)
                    if other_code:
                        relations[other_code] = {
                            "relation": [],
                            "detail": ""
                        }
            
            char_data = {
                "role_code": char_code,
                "role_name": char['name'],
                "source": source_name,
                "activity": 1,
                "profile": char.get('description', char.get('profile', '')),
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

@app.post("/api/generate-scroll-from-prompt")
async def generate_scroll_from_prompt(request: Request, current_user: dict = Depends(get_current_user)):
    """凭空造物功能：从用户描述生成完整的书卷配置"""
    try:
        data = await request.json()
        
        # 验证必填字段
        description = data.get('description', '').strip()
        title = data.get('title', '').strip()
        language = data.get('language', 'zh')
        num_characters = int(data.get('num_characters', 5))
        num_locations = int(data.get('num_locations', 5))
        
        if not description:
            raise HTTPException(status_code=400, detail="缺少世界描述")
        if not title:
            raise HTTPException(status_code=400, detail="缺少书卷名称")
        
        # 验证数量范围
        if num_characters < 2 or num_characters > 10:
            raise HTTPException(status_code=400, detail="角色数量必须在2-10之间")
        if num_locations < 2 or num_locations > 10:
            raise HTTPException(status_code=400, detail="地点数量必须在2-10之间")
        
        print(f"[凭空造物] 开始生成书卷: {title}, 用户ID: {current_user['id']}")
        print(f"[凭空造物] 描述: {description}")
        print(f"[凭空造物] 角色数: {num_characters}, 地点数: {num_locations}")
        
        # 导入 FastScrollGenerator
        from modules.utils.fast_scroll_generator import FastScrollGenerator
        
        # 初始化生成器（使用支持结构化输出的模型）
        generator = FastScrollGenerator(llm_name="gemini-3-pro-preview")
        
        # 生成书卷配置
        config = generator.generate_scroll_config(
            user_description=description,
            language=language,
            num_characters=num_characters,
            num_locations=num_locations
        )
        
        # 生成source名称（基于标题）
        import re
        source_name = re.sub(r'[^\w\s-]', '', title)
        source_name = re.sub(r'[-\s]+', '_', source_name).lower()
        source_name = f"user_{current_user['id']}_{source_name}"
        
        # 保存书卷配置到文件系统
        base_dir = "./data"
        paths = generator.save_scroll_config(config, source_name, base_dir)
        
        world_file = paths.get("world_file")
        roles_dir = paths.get("roles_dir")
        locations_file = paths.get("locations_file")
        
        if not world_file or not roles_dir or not locations_file:
            raise HTTPException(status_code=500, detail="保存书卷配置失败")
        
        # 创建地图文件（CSV格式）
        map_file = f"{base_dir}/maps/{source_name}.csv"
        os.makedirs(os.path.dirname(map_file), exist_ok=True)
        
        # 读取地点数据以获取地点代码
        locations_data = load_json_file(locations_file)
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
        
        # 获取所有角色代码
        performer_codes = []
        world_data = load_json_file(world_file)
        world_language = world_data.get('language', language)
        
        # 从角色目录中读取所有角色代码
        if os.path.exists(roles_dir):
            for item in os.listdir(roles_dir):
                role_dir = os.path.join(roles_dir, item)
                if os.path.isdir(role_dir):
                    # 角色代码就是目录名（已包含语言后缀，如 "zhang_san-zh"）
                    role_info_file = os.path.join(role_dir, "role_info.json")
                    if os.path.exists(role_info_file):
                        # 验证角色信息文件存在，确保这是一个有效的角色目录
                        performer_codes.append(item)
        
        # 创建预设文件
        preset_file = f"./experiment_presets/user_{current_user['id']}_{source_name}.json"
        os.makedirs(os.path.dirname(preset_file), exist_ok=True)
        
        preset_data = {
            "experiment_subname": source_name,
            "source": source_name,
            "world_file_path": world_file,
            "map_file_path": map_file,
            "loc_file_path": locations_file,
            "role_file_dir": f"./data/roles/",
            "performer_codes": performer_codes,
            "intervention": description,
            "script": "",
            "language": world_language
        }
        with open(preset_file, 'w', encoding='utf-8') as f:
            json.dump(preset_data, f, ensure_ascii=False, indent=2)
        
        # 在数据库中创建书卷记录
        world_dir = os.path.dirname(world_file)
        scroll_id = db.create_scroll(
            user_id=current_user['id'],
            title=title,
            description=description,
            scroll_type='user',
            preset_path=preset_file,
            world_dir=world_dir
        )
        
        print(f"[凭空造物] 书卷生成成功: scroll_id={scroll_id}")
        
        return {
            "success": True,
            "scroll_id": scroll_id,
            "message": "书卷生成成功"
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"生成书卷失败: {str(e)}")

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
            # 新API需要显式传递 api_key 参数
            client = genai.Client(api_key=gemini_api_key, vertexai=False)
            
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
                    model="gemini-3-pro-preview",
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
                    model="gemini-3-pro-preview",
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

# ==================== Evolution Phase 1: 新增 API 端点 ====================

@app.get("/api/scroll/{scroll_id}")
async def get_scroll_for_intro(scroll_id: int):
    """获取单个书卷（用于intro页面）"""
    try:
        scroll = db.get_scroll(scroll_id)
        if not scroll:
            raise HTTPException(status_code=404, detail="书卷不存在")
        return scroll
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scroll/{scroll_id}/characters")
async def get_scroll_characters(scroll_id: int, current_user: Optional[dict] = Depends(get_optional_user)):
    """获取书卷的角色列表"""
    try:
        scroll = db.get_scroll(scroll_id)
        if not scroll:
            raise HTTPException(status_code=404, detail="书卷不存在")
        
        preset_path = scroll.get('preset_path')
        if not preset_path or not os.path.exists(preset_path):
            raise HTTPException(status_code=404, detail="书卷预设文件不存在")
        
        # 加载预设文件
        preset_data = load_json_file(preset_path)
        performer_codes = preset_data.get('performer_codes', [])
        role_file_dir = preset_data.get('role_file_dir', './data/roles/')
        source = preset_data.get('source', '')
        
        # 从角色文件中读取详细信息
        characters = []
        base_dir = os.path.dirname(os.path.abspath(__file__))
        
        for role_code in performer_codes:
            try:
                # 查找角色文件路径
                role_path = None
                if source and os.path.exists(os.path.join(base_dir, role_file_dir, source)):
                    from sw_utils import get_child_folders
                    for path in get_child_folders(os.path.join(base_dir, role_file_dir, source)):
                        if role_code in path:
                            role_path = path
                            break
                else:
                    from sw_utils import get_grandchild_folders
                    for path in get_grandchild_folders(os.path.join(base_dir, role_file_dir)):
                        if role_code in path:
                            role_path = path
                            break
                
                if role_path:
                    role_info_path = os.path.join(base_dir, role_path, "role_info.json")
                    if os.path.exists(role_info_path):
                        role_info = load_json_file(role_info_path)
                        character = {
                            'code': role_code,
                            'name': role_info.get('role_name', role_code),
                            'nickname': role_info.get('nickname', role_info.get('role_name', role_code)),
                            'role': role_info.get('relation', {}).get('relation', ''),
                            'description': role_info.get('profile', '')[:100] + '...' if len(role_info.get('profile', '')) > 100 else role_info.get('profile', '')
                        }
                        characters.append(character)
            except Exception as e:
                print(f"加载角色 {role_code} 失败: {e}")
                # 如果加载失败，至少添加基本信息
                characters.append({
                    'code': role_code,
                    'name': role_code,
                    'nickname': role_code,
                    'role': '',
                    'description': ''
                })
        
        return {"success": True, "characters": characters}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scroll/{scroll_id}/character/{role_code}")
async def get_character_detail(scroll_id: int, role_code: str, current_user: Optional[dict] = Depends(get_optional_user)):
    """获取角色详细信息"""
    try:
        scroll = db.get_scroll(scroll_id)
        if not scroll:
            raise HTTPException(status_code=404, detail="书卷不存在")
        
        preset_path = scroll.get('preset_path')
        if not preset_path or not os.path.exists(preset_path):
            raise HTTPException(status_code=404, detail="书卷预设文件不存在")
        
        # 加载预设文件
        preset_data = load_json_file(preset_path)
        role_file_dir = preset_data.get('role_file_dir', './data/roles/')
        source = preset_data.get('source', '')
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        
        # 查找角色文件路径
        role_path = None
        if source and os.path.exists(os.path.join(base_dir, role_file_dir, source)):
            from sw_utils import get_child_folders
            for path in get_child_folders(os.path.join(base_dir, role_file_dir, source)):
                if role_code in path:
                    role_path = path
                    break
        else:
            from sw_utils import get_grandchild_folders
            for path in get_grandchild_folders(os.path.join(base_dir, role_file_dir)):
                if role_code in path:
                    role_path = path
                    break
        
        if not role_path:
            raise HTTPException(status_code=404, detail="角色不存在")
        
        role_info_path = os.path.join(base_dir, role_path, "role_info.json")
        if not os.path.exists(role_info_path):
            raise HTTPException(status_code=404, detail="角色信息文件不存在")
        
        role_info = load_json_file(role_info_path)
        
        # 查找头像文件
        avatar_path = None
        avatar_extensions = ['.png', '.jpg', '.jpeg']
        for ext in avatar_extensions:
            potential_avatar = os.path.join(base_dir, role_path, f"avatar{ext}")
            if os.path.exists(potential_avatar):
                # 返回API端点路径
                avatar_path = f"/api/scroll/{scroll_id}/character/{role_code}/avatar"
                break
        
        # 构建角色详细信息
        character_detail = {
            'code': role_code,
            'name': role_info.get('role_name', role_code),
            'nickname': role_info.get('nickname', role_info.get('role_name', role_code)),
            'profile': role_info.get('profile', '暂无描述'),
            'persona': role_info.get('persona', ''),
            'avatar': avatar_path,
            'relation': role_info.get('relation', {}),
            'scenario': role_info.get('scenario', ''),
            'first_message': role_info.get('first_message', ''),
            'description': role_info.get('description', '')
        }
        
        return {"success": True, "character": character_detail}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scroll/{scroll_id}/character/{role_code}/avatar")
async def get_character_avatar(scroll_id: int, role_code: str, current_user: Optional[dict] = Depends(get_optional_user)):
    """获取角色头像"""
    try:
        scroll = db.get_scroll(scroll_id)
        if not scroll:
            raise HTTPException(status_code=404, detail="书卷不存在")
        
        preset_path = scroll.get('preset_path')
        if not preset_path or not os.path.exists(preset_path):
            raise HTTPException(status_code=404, detail="书卷预设文件不存在")
        
        # 加载预设文件
        preset_data = load_json_file(preset_path)
        role_file_dir = preset_data.get('role_file_dir', './data/roles/')
        source = preset_data.get('source', '')
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        
        # 查找角色文件路径
        role_path = None
        if source and os.path.exists(os.path.join(base_dir, role_file_dir, source)):
            from sw_utils import get_child_folders
            for path in get_child_folders(os.path.join(base_dir, role_file_dir, source)):
                if role_code in path:
                    role_path = path
                    break
        else:
            from sw_utils import get_grandchild_folders
            for path in get_grandchild_folders(os.path.join(base_dir, role_file_dir)):
                if role_code in path:
                    role_path = path
                    break
        
        if not role_path:
            raise HTTPException(status_code=404, detail="角色不存在")
        
        # 查找头像文件
        avatar_extensions = ['.png', '.jpg', '.jpeg']
        for ext in avatar_extensions:
            potential_avatar = os.path.join(base_dir, role_path, f"avatar{ext}")
            if os.path.exists(potential_avatar):
                return FileResponse(potential_avatar)
        
        # 如果没有找到头像，返回默认图标
        if os.path.exists(default_icon_path):
            return FileResponse(default_icon_path)
        else:
            raise HTTPException(status_code=404, detail="头像不存在")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scroll/{scroll_id}/world-info")
async def get_scroll_world_info(scroll_id: int, current_user: Optional[dict] = Depends(get_optional_user)):
    """获取书卷的世界观信息"""
    try:
        scroll = db.get_scroll(scroll_id)
        if not scroll:
            raise HTTPException(status_code=404, detail="书卷不存在")
        
        preset_path = scroll.get('preset_path')
        if not preset_path or not os.path.exists(preset_path):
            raise HTTPException(status_code=404, detail="书卷预设文件不存在")
        
        preset_data = load_json_file(preset_path)
        world_file_path = preset_data.get('world_file_path', '')
        
        world_description = scroll.get('description', '暂无描述')
        
        # 尝试从世界文件加载更详细的世界观
        if world_file_path and os.path.exists(world_file_path):
            try:
                world_data = load_json_file(world_file_path)
                if world_data.get('description'):
                    world_description = world_data.get('description')
                elif world_data.get('world_description'):
                    world_description = world_data.get('world_description')
            except:
                pass
        
        return {
            "success": True,
            "world_description": world_description,
            "world_name": world_data.get('world_name', '') if 'world_data' in locals() else ''
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/scroll/{scroll_id}/generate-event-chain")
async def generate_event_chain(scroll_id: int, request: Request, current_user: Optional[dict] = Depends(get_optional_user)):
    """生成事件链"""
    try:
        scroll = db.get_scroll(scroll_id)
        if not scroll:
            raise HTTPException(status_code=404, detail="书卷不存在")
        
        # 获取请求参数
        data = await request.json()
        total_acts = data.get('total_acts', 5)
        language = data.get('language', 'zh')
        
        if total_acts not in [1, 3, 5, 8, 10]:
            raise HTTPException(status_code=400, detail="幕数必须是 1、3、5、8 或 10")
        
        preset_path = scroll.get('preset_path')
        if not preset_path or not os.path.exists(preset_path):
            raise HTTPException(status_code=404, detail="书卷预设文件不存在")
        
        # 加载预设文件
        preset_data = load_json_file(preset_path)
        world_file_path = preset_data.get('world_file_path', '')
        performer_codes = preset_data.get('performer_codes', [])
        role_file_dir = preset_data.get('role_file_dir', './data/roles/')
        source = preset_data.get('source', '')
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        
        # 加载世界观描述
        world_description = ""
        if world_file_path:
            world_path = os.path.join(base_dir, world_file_path)
            if os.path.exists(world_path):
                world_data = load_json_file(world_path)
                world_description = world_data.get('description', '')
        
        # 获取角色名称列表
        character_names = []
        for role_code in performer_codes:
            try:
                role_path = None
                if source and os.path.exists(os.path.join(base_dir, role_file_dir, source)):
                    from sw_utils import get_child_folders
                    for path in get_child_folders(os.path.join(base_dir, role_file_dir, source)):
                        if role_code in path:
                            role_path = path
                            break
                else:
                    from sw_utils import get_grandchild_folders
                    for path in get_grandchild_folders(os.path.join(base_dir, role_file_dir)):
                        if role_code in path:
                            role_path = path
                            break
                
                if role_path:
                    role_info_path = os.path.join(base_dir, role_path, "role_info.json")
                    if os.path.exists(role_info_path):
                        role_info = load_json_file(role_info_path)
                        character_names.append(role_info.get('role_name', role_code))
            except Exception as e:
                print(f"[API] 获取角色 {role_code} 信息失败: {e}")
                continue
        
        # 生成事件链
        from modules.utils.event_chain_generator import EventChainGenerator
        try:
            generator = EventChainGenerator(llm_name="gemini-2.5-flash")
            event_chain = generator.generate_event_chain(
                world_description=world_description,
                character_names=character_names,
                total_acts=total_acts,
                language=language
            )
            
            return {
                "success": True,
                "event_chain": event_chain
            }
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"生成事件链失败: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scroll/{scroll_id}/history")
async def get_scroll_history(scroll_id: int, current_user: Optional[dict] = Depends(get_optional_user)):
    """获取书卷的历史进度（幕）"""
    try:
        scroll = db.get_scroll(scroll_id)
        if not scroll:
            raise HTTPException(status_code=404, detail="书卷不存在")
        
        # TODO: 从数据库或文件系统加载历史记录
        # 目前返回空列表
        acts = []
        
        return {"success": True, "acts": acts}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/game/create-room")
async def create_game_room(request: Request, current_user: dict = Depends(get_current_user)):
    """创建游戏房间"""
    try:
        data = await request.json()
        scroll_id = data.get('scroll_id')
        game_type = data.get('game_type', 'werewolf')
        
        if not scroll_id:
            raise HTTPException(status_code=400, detail="缺少scroll_id")
        
        # 创建游戏会话
        session = socketio_manager.session_manager.create_session(
            mode=SessionMode.GAME,
            scroll_id=scroll_id,
            user_id=current_user['id'],
            game_type=game_type
        )
        
        # 初始化会话
        config = {
            'scroll_id': scroll_id,
            'game_type': game_type
        }
        await session.initialize(config)
        
        return {
            "success": True,
            "room_id": session.room_id,
            "session_id": session.session_id,
            "room_code": session.room_id[:8].upper()  # 简化的房间代码
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/game/join-room/{room_code}")
async def join_game_room(room_code: str, current_user: dict = Depends(get_current_user)):
    """加入游戏房间"""
    try:
        # 查找房间（简化实现，实际应该用数据库存储房间代码映射）
        sessions = socketio_manager.session_manager.sessions
        target_session = None
        
        for session in sessions.values():
            if session.room_id.startswith(room_code.upper()) or session.room_id.startswith(room_code.lower()):
                target_session = session
                break
        
        if not target_session:
            raise HTTPException(status_code=404, detail="房间不存在")
        
        return {
            "success": True,
            "room_id": target_session.room_id,
            "session_id": target_session.session_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== 联机模式 API 端点 ====================

# 存储联机房间信息（内存中，实际应该用数据库）
multiplayer_rooms: Dict[str, dict] = {}

@app.post("/api/multiplayer/create-room")
async def create_multiplayer_room(request: Request, current_user: dict = Depends(get_current_user)):
    """创建联机房间"""
    try:
        data = await request.json()
        scroll_id = data.get('scroll_id')
        password = data.get('password', '').strip()
        
        if not scroll_id:
            raise HTTPException(status_code=400, detail="缺少scroll_id")
        
        # 验证书卷存在
        scroll = db.get_scroll(scroll_id)
        if not scroll:
            raise HTTPException(status_code=404, detail="书卷不存在")
        
        # 生成房间ID
        import uuid
        room_id = str(uuid.uuid4())
        
        # 保存到数据库
        conn = sqlite3.connect(db.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO multiplayer_rooms (id, scroll_id, host_id, password, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            room_id,
            scroll_id,
            current_user['id'],
            password,
            'matching',
            datetime.now().isoformat(),
            datetime.now().isoformat()
        ))
        
        # 添加房主到玩家列表
        cursor.execute('''
            INSERT INTO multiplayer_room_players (room_id, user_id, username, confirmed, joined_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            room_id,
            current_user['id'],
            current_user['username'],
            0,  # 房主也需要确认
            datetime.now().isoformat()
        ))
        
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "room_id": room_id,
            "scroll_id": scroll_id
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/multiplayer/join-room")
async def join_multiplayer_room(request: Request, current_user: dict = Depends(get_current_user)):
    """加入联机房间"""
    try:
        data = await request.json()
        room_id = data.get('room_id')
        password = data.get('password', '').strip()
        
        if not room_id:
            raise HTTPException(status_code=400, detail="缺少room_id")
        
        # 从数据库获取房间信息
        conn = sqlite3.connect(db.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM multiplayer_rooms WHERE id = ?', (room_id,))
        room = cursor.fetchone()
        
        if not room:
            conn.close()
            raise HTTPException(status_code=404, detail="房间不存在")
        
        # 验证密码
        if room[3] and room[3] != password:  # password字段
            conn.close()
            raise HTTPException(status_code=403, detail="房间暗号错误")
        
        # 检查是否已经在房间中
        cursor.execute('SELECT * FROM multiplayer_room_players WHERE room_id = ? AND user_id = ?', (room_id, current_user['id']))
        existing_player = cursor.fetchone()
        
        if not existing_player:
            # 添加玩家到房间
            cursor.execute('''
                INSERT INTO multiplayer_room_players (room_id, user_id, username, confirmed, joined_at)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                room_id,
                current_user['id'],
                current_user['username'],
                0,
                datetime.now().isoformat()
            ))
            conn.commit()
        
        conn.close()
        
        return {
            "success": True,
            "room_id": room_id
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/multiplayer/room/{room_id}")
async def get_multiplayer_room(room_id: str, current_user: dict = Depends(get_current_user)):
    """获取联机房间信息"""
    try:
        conn = sqlite3.connect(db.db_path)
        cursor = conn.cursor()
        
        # 获取房间信息
        cursor.execute('SELECT * FROM multiplayer_rooms WHERE id = ?', (room_id,))
        room = cursor.fetchone()
        
        if not room:
            conn.close()
            raise HTTPException(status_code=404, detail="房间不存在")
        
        # 获取书卷信息
        scroll = db.get_scroll(room[1])  # scroll_id
        scroll_title = scroll['title'] if scroll else '未知书卷'
        
        # 获取玩家列表
        cursor.execute('''
            SELECT user_id, username, confirmed, selected_role
            FROM multiplayer_room_players
            WHERE room_id = ?
            ORDER BY joined_at
        ''', (room_id,))
        players_data = cursor.fetchall()
        
        players = []
        for player_data in players_data:
            players.append({
                'user_id': player_data[0],
                'username': player_data[1],
                'confirmed': bool(player_data[2]),
                'selected_role': player_data[3],
                'is_host': player_data[0] == room[2]  # host_id
            })
        
        conn.close()
        
        return {
            "room_id": room_id,
            "scroll_id": room[1],
            "scroll_title": scroll_title,
            "host_id": room[2],
            "status": room[4],
            "players": players
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/multiplayer/confirm")
async def confirm_multiplayer(request: Request, current_user: dict = Depends(get_current_user)):
    """确认准备"""
    try:
        data = await request.json()
        room_id = data.get('room_id')
        
        if not room_id:
            raise HTTPException(status_code=400, detail="缺少room_id")
        
        conn = sqlite3.connect(db.db_path)
        cursor = conn.cursor()
        
        # 更新确认状态
        cursor.execute('''
            UPDATE multiplayer_room_players
            SET confirmed = 1
            WHERE room_id = ? AND user_id = ?
        ''', (room_id, current_user['id']))
        
        conn.commit()
        conn.close()
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/multiplayer/select-role")
async def select_role_multiplayer(request: Request, current_user: dict = Depends(get_current_user)):
    """选择角色"""
    try:
        data = await request.json()
        room_id = data.get('room_id')
        role_code = data.get('role_code')  # 可以为None，表示取消选择
        
        if not room_id:
            raise HTTPException(status_code=400, detail="缺少room_id")
        
        conn = sqlite3.connect(db.db_path)
        cursor = conn.cursor()
        
        # 如果选择了角色，检查是否已被其他玩家选择
        if role_code:
            cursor.execute('''
                SELECT user_id FROM multiplayer_room_players
                WHERE room_id = ? AND selected_role = ? AND user_id != ?
            ''', (room_id, role_code, current_user['id']))
            if cursor.fetchone():
                conn.close()
                raise HTTPException(status_code=400, detail="该角色已被其他玩家选择")
        
        # 更新角色选择
        cursor.execute('''
            UPDATE multiplayer_room_players
            SET selected_role = ?
            WHERE room_id = ? AND user_id = ?
        ''', (role_code, room_id, current_user['id']))
        
        conn.commit()
        conn.close()
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/multiplayer/start-room")
async def start_multiplayer_room(request: Request, current_user: dict = Depends(get_current_user)):
    """开始游戏（房主）"""
    try:
        data = await request.json()
        room_id = data.get('room_id')
        
        if not room_id:
            raise HTTPException(status_code=400, detail="缺少room_id")
        
        conn = sqlite3.connect(db.db_path)
        cursor = conn.cursor()
        
        # 验证是否为房主
        cursor.execute('SELECT host_id FROM multiplayer_rooms WHERE id = ?', (room_id,))
        room = cursor.fetchone()
        if not room or room[0] != current_user['id']:
            conn.close()
            raise HTTPException(status_code=403, detail="只有房主可以开始游戏")
        
        # 更新房间状态
        cursor.execute('''
            UPDATE multiplayer_rooms
            SET status = 'playing', updated_at = ?
            WHERE id = ?
        ''', (datetime.now().isoformat(), room_id))
        
        conn.commit()
        conn.close()
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/multiplayer/leave-room")
async def leave_multiplayer_room(request: Request, current_user: dict = Depends(get_current_user)):
    """离开房间"""
    try:
        data = await request.json()
        room_id = data.get('room_id')
        
        if not room_id:
            raise HTTPException(status_code=400, detail="缺少room_id")
        
        conn = sqlite3.connect(db.db_path)
        cursor = conn.cursor()
        
        # 删除玩家记录
        cursor.execute('DELETE FROM multiplayer_room_players WHERE room_id = ? AND user_id = ?', (room_id, current_user['id']))
        
        # 如果房间没有玩家了，删除房间
        cursor.execute('SELECT COUNT(*) FROM multiplayer_room_players WHERE room_id = ?', (room_id,))
        if cursor.fetchone()[0] == 0:
            cursor.execute('DELETE FROM multiplayer_rooms WHERE id = ?', (room_id,))
        
        conn.commit()
        conn.close()
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/multiplayer/rooms")
async def list_multiplayer_rooms(current_user: dict = Depends(get_current_user)):
    """获取联机房间列表"""
    try:
        conn = sqlite3.connect(db.db_path)
        cursor = conn.cursor()
        
        # 获取所有匹配中的房间
        cursor.execute('''
            SELECT r.id, r.scroll_id, r.host_id, r.password, s.title,
                   (SELECT COUNT(*) FROM multiplayer_room_players WHERE room_id = r.id) as player_count
            FROM multiplayer_rooms r
            LEFT JOIN scrolls s ON r.scroll_id = s.id
            WHERE r.status = 'matching'
            ORDER BY r.created_at DESC
        ''')
        
        rooms_data = cursor.fetchall()
        rooms = []
        for room_data in rooms_data:
            rooms.append({
                'id': room_data[0],
                'room_id': room_data[0],
                'scroll_id': room_data[1],
                'scroll_title': room_data[4] or '未知书卷',
                'currentPlayers': room_data[5] or 0,
                'current_players': room_data[5] or 0,
                'maxPlayers': 10,
                'max_players': 10
            })
        
        conn.close()
        
        return {"rooms": rooms}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ==================== 聊天 API 端点 ====================

@app.post("/api/chat/create")
async def create_chat_session(request: Request, current_user: dict = Depends(get_current_user)):
    """创建私语模式聊天会话"""
    try:
        data = await request.json()
        scroll_id = data.get('scroll_id')
        role_code = data.get('role_code')
        user_name = data.get('user_name', current_user.get('username', '用户'))
        
        if not scroll_id:
            raise HTTPException(status_code=400, detail="缺少scroll_id")
        if not role_code:
            raise HTTPException(status_code=400, detail="缺少role_code")
        
        # 验证书卷存在
        scroll = db.get_scroll(scroll_id)
        if not scroll:
            raise HTTPException(status_code=404, detail="书卷不存在")
        
        # 创建聊天会话
        session = session_manager.create_session(
            mode=SessionMode.CHAT,
            scroll_id=scroll_id,
            user_id=current_user['id'],
            role_code=role_code,
            user_name=user_name
        )
        
        # 初始化会话
        config = {
            'llm_name': 'gemini-3-flash-preview',
            'user_name': user_name
        }
        init_result = await session.initialize(config)
        
        return {
            "success": True,
            "session_id": session.session_id,
            "role_code": role_code,
            "character_name": init_result.get('character_name', ''),
            "character_nickname": init_result.get('character_nickname', '')
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/send")
async def send_chat_message(request: Request, current_user: dict = Depends(get_current_user)):
    """发送聊天消息"""
    try:
        data = await request.json()
        session_id = data.get('session_id')
        message = data.get('message', '')
        temperature = data.get('temperature', 0.8)
        
        if not session_id:
            raise HTTPException(status_code=400, detail="缺少session_id")
        if not message:
            raise HTTPException(status_code=400, detail="消息内容不能为空")
        
        # 获取会话
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")
        
        # 验证用户权限
        if session.user_id != current_user['id']:
            raise HTTPException(status_code=403, detail="无权访问此会话")
        
        # 处理消息
        result = await session.process_message({
            "text": message,
            "temperature": temperature
        }, sender_id=current_user['id'])
        
        return {
            "success": True,
            "message": result.get('message', ''),
            "character_name": result.get('character_name', ''),
            "character_nickname": result.get('character_nickname', ''),
            "timestamp": result.get('timestamp', '')
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/history/{session_id}")
async def get_chat_history(session_id: str, current_user: dict = Depends(get_current_user)):
    """获取对话历史"""
    try:
        # 获取会话
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")
        
        # 验证用户权限
        if session.user_id != current_user['id']:
            raise HTTPException(status_code=403, detail="无权访问此会话")
        
        # 获取历史
        history = session.chat_history if hasattr(session, 'chat_history') else []
        
        return {
            "success": True,
            "history": history
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/clear/{session_id}")
async def clear_chat_history(session_id: str, current_user: dict = Depends(get_current_user)):
    """清空对话历史"""
    try:
        # 获取会话
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")
        
        # 验证用户权限
        if session.user_id != current_user['id']:
            raise HTTPException(status_code=403, detail="无权访问此会话")
        
        # 清空历史
        if hasattr(session, 'chat_performer') and session.chat_performer:
            session.chat_performer.clear_history()
        if hasattr(session, 'chat_history'):
            session.chat_history.clear()
        
        return {
            "success": True,
            "message": "历史已清空"
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/update-extensions/{session_id}")
async def update_chat_extensions(session_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """更新扩展提示词（World Info、Memory、Authors Note）"""
    try:
        data = await request.json()
        
        # 获取会话
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")
        
        # 验证用户权限
        if session.user_id != current_user['id']:
            raise HTTPException(status_code=403, detail="无权访问此会话")
        
        if not hasattr(session, 'chat_performer') or not session.chat_performer:
            raise HTTPException(status_code=400, detail="会话未初始化")
        
        # 更新扩展提示词
        world_info_before = data.get('world_info_before', '')
        world_info_after = data.get('world_info_after', '')
        memory_summary = data.get('memory_summary', '')
        authors_note = data.get('authors_note', '')
        
        if world_info_before or world_info_after:
            session.chat_performer.update_world_info(world_info_before, world_info_after)
        
        if memory_summary:
            session.chat_performer.update_memory(memory_summary)
        
        if authors_note:
            session.chat_performer.update_authors_note(authors_note)
        
        return {
            "success": True,
            "message": "扩展提示词已更新"
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/extensions/{session_id}")
async def get_chat_extensions(session_id: str, current_user: dict = Depends(get_current_user)):
    """获取扩展提示词（World Info、Memory、Authors Note）"""
    try:
        # 获取会话
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")
        
        # 验证用户权限
        if session.user_id != current_user['id']:
            raise HTTPException(status_code=403, detail="无权访问此会话")
        
        if not hasattr(session, 'chat_performer') or not session.chat_performer:
            raise HTTPException(status_code=400, detail="会话未初始化")
        
        performer = session.chat_performer
        
        return {
            "success": True,
            "extensions": {
                "world_info_before": performer.world_info_before,
                "world_info_after": performer.world_info_after,
                "memory_summary": performer.memory_summary,
                "authors_note": performer.authors_note
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# -------------------------------------------------------------------------
# 狼人杀 API 接口
# -------------------------------------------------------------------------

@app.post("/api/werewolf/create")
async def create_werewolf_game(request: Request):
    """创建新的狼人杀游戏"""
    data = await request.json()
    preset = data.get("preset", "standard_12")
    preferred_role = data.get("preferred_role")
    
    try:
        game_id = werewolf_manager.create_game(preset, preferred_role)
        return {"success": True, "game_id": game_id, "message": "游戏创建成功"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

@app.post("/api/werewolf/start")
async def start_werewolf_game(request: Request):
    """开始狼人杀游戏"""
    data = await request.json()
    game_id = data.get("game_id")
    
    session = werewolf_manager.get_session(game_id)
    if not session:
        raise HTTPException(status_code=404, detail="游戏不存在")
        
    # 异步启动游戏
    asyncio.create_task(session.start_game())
    
    return {"success": True, "message": "游戏已启动"}

@app.websocket("/ws/werewolf/{game_id}/{player_id}")
async def werewolf_websocket_endpoint(websocket: WebSocket, game_id: str, player_id: str):
    """狼人杀游戏WebSocket连接"""
    session = werewolf_manager.get_session(game_id)
    if not session:
        await websocket.close(code=4004, reason="Game not found")
        return
        
    await session.connect_player(player_id, websocket)
    
    try:
        while True:
            data = await websocket.receive_json()
            # 处理玩家消息
            await session.handle_message(player_id, data)
            
    except WebSocketDisconnect:
        session.disconnect_player(player_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        import traceback
        traceback.print_exc()
        session.disconnect_player(player_id)

# -------------------------------------------------------------------------
# 商业博弈 API 接口
# -------------------------------------------------------------------------

@app.post("/api/business/create")
async def create_business_game(request: Request, current_user: dict = Depends(get_current_user)):
    """创建新的商业博弈游戏"""
    try:
        username = current_user.get('username', '用户')
        game_id = business_manager.create_game(current_user['id'], username)
        return {"success": True, "game_id": game_id, "message": "游戏创建成功"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

@app.post("/api/business/submit-price")
async def submit_business_price(request: Request, current_user: dict = Depends(get_current_user)):
    """提交价格（用于非WebSocket模式）"""
    try:
        data = await request.json()
        game_id = data.get("game_id")
        price = data.get("price")
        
        if not game_id or price is None:
            raise HTTPException(status_code=400, detail="缺少game_id或price")
        
        session = business_manager.get_session(game_id)
        if not session:
            raise HTTPException(status_code=404, detail="游戏不存在")
        
        if session.user_id != current_user['id']:
            raise HTTPException(status_code=403, detail="无权访问此游戏")
        
        # 这里需要异步处理，但为了简化，先返回成功
        # 实际应该通过WebSocket处理
        return {"success": True, "message": "价格已提交"}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/business/leaderboard")
async def get_business_leaderboard(current_user: Optional[dict] = Depends(get_optional_user)):
    """获取商业博弈排行榜（按累计利润降序）"""
    try:
        # 从数据库获取排行榜数据
        leaderboard = db.get_business_leaderboard(limit=100)
        return {"success": True, "leaderboard": leaderboard}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e), "leaderboard": []}

@app.post("/api/business/save-result")
async def save_business_result(request: Request, current_user: dict = Depends(get_current_user)):
    """保存游戏结果到数据库"""
    try:
        data = await request.json()
        game_id = data.get("game_id")
        
        if not game_id:
            raise HTTPException(status_code=400, detail="缺少game_id")
        
        session = business_manager.get_session(game_id)
        if not session:
            raise HTTPException(status_code=404, detail="游戏不存在")
        
        if session.user_id != current_user['id']:
            raise HTTPException(status_code=403, detail="无权访问此游戏")
        
        stats = session.get_final_stats()
        
        # 保存到数据库
        db.save_business_result(
            user_id=current_user['id'],
            username=current_user.get('username', '用户'),
            game_id=game_id,
            total_profit=stats['total_profit_human'],
            total_rounds=stats['total_rounds'],
            history=stats['history']
        )
        
        return {"success": True, "stats": stats}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/business/{game_id}")
async def business_websocket_endpoint(websocket: WebSocket, game_id: str):
    """商业博弈WebSocket连接"""
    await websocket.accept()
    
    # 从查询参数获取token进行验证
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4003, reason="No token provided")
        return
    
    # 验证token并获取用户信息
    try:
        user = db.verify_token(token)
        if not user:
            await websocket.close(code=4003, reason="Invalid token")
            return
    except:
        await websocket.close(code=4003, reason="Token verification failed")
        return
    
    session = business_manager.get_session(game_id)
    if not session:
        await websocket.close(code=4004, reason="Game not found")
        return
    
    # 验证用户权限
    if session.user_id != user['id']:
        await websocket.close(code=4003, reason="Unauthorized")
        return
    
    await session.connect(websocket)
    
    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "submit_price":
                price = data.get("price")
                if price is not None:
                    await session.handle_price_input(price)
            elif message_type == "get_state":
                await session.send_game_state()
            else:
                await session.send_error(f"未知消息类型: {message_type}")
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Business game WebSocket error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # 游戏结束时保存结果
        if session.is_finished:
            try:
                stats = session.get_final_stats()
                db.save_business_result(
                    user_id=session.user_id,
                    username=session.username,
                    game_id=game_id,
                    total_profit=stats['total_profit_human'],
                    total_rounds=stats['total_rounds'],
                    history=stats['history']
                )
            except Exception as e:
                print(f"Failed to save business result: {e}")

# -------------------------------------------------------------------------
# 谁是人类游戏 API 接口
# -------------------------------------------------------------------------

@app.post("/api/who-is-human/create")
async def create_who_is_human_game(request: Request, current_user: dict = Depends(get_current_user)):
    """创建新的谁是人类游戏"""
    try:
        username = current_user.get('username', '用户')
        game_id = who_is_human_manager.create_game(current_user['id'], username)
        return {"success": True, "game_id": game_id, "message": "游戏创建成功"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

@app.websocket("/ws/who-is-human/{game_id}")
async def who_is_human_websocket_endpoint(websocket: WebSocket, game_id: str):
    """谁是人类游戏WebSocket连接"""
    await websocket.accept()
    
    # 从查询参数获取token进行验证
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4003, reason="No token provided")
        return
    
    # 验证token并获取用户信息
    try:
        user = db.verify_token(token)
        if not user:
            await websocket.close(code=4003, reason="Invalid token")
            return
    except:
        await websocket.close(code=4003, reason="Token verification failed")
        return
    
    session = who_is_human_manager.get_session(game_id)
    if not session:
        await websocket.close(code=4004, reason="Game not found")
        return
    
    # 验证用户权限
    if session.user_id != user['id']:
        await websocket.close(code=4003, reason="Unauthorized")
        return
    
    await session.connect(websocket)
    
    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "start_game":
                await session.start_game()
            elif message_type == "submit_description":
                description = data.get("description")
                if description:
                    await session.submit_human_description(description)
            elif message_type == "submit_vote":
                voter_id = data.get("voter_id")
                voted_player_id = data.get("voted_player_id")
                if voter_id and voted_player_id:
                    await session.submit_vote(voter_id, voted_player_id)
            elif message_type == "get_state":
                await session.send_game_state()
            else:
                await session.send_error(f"未知消息类型: {message_type}")
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Who is human game WebSocket error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
