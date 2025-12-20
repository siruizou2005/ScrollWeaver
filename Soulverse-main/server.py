from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from starlette.middleware.sessions import SessionMiddleware
import uvicorn
import json
import asyncio
import os
import secrets
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional
from sw_utils import is_image, load_json_file, get_models, json_parser
from ScrollWeaver import ScrollWeaver
from modules.social_story_generator import SocialStoryGenerator, generate_social_story
from modules.daily_report import DailyReportGenerator, generate_daily_report
from modules.soul_api_mock import get_soul_profile
from modules.profile_extractor import ProfileExtractor, extract_profile_from_text, extract_profile_from_qa
from modules.preset_agents import PresetAgents
from fastapi import UploadFile, File, Form
import base64
try:
    from google import genai
    from google.genai import types
    USE_NEW_GENAI_API = True
except ImportError:
    import google.generativeai as genai
    USE_NEW_GENAI_API = False

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源，生产环境应限制为前端域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加会话中间件
app.add_middleware(SessionMiddleware, secret_key=secrets.token_urlsafe(32))

default_icon_path = './frontend/assets/images/default-icon.jpg'
config = load_json_file('config.json')
for key in config:
    if "API_KEY" in key and config[key]:
        os.environ[key] = config[key]
# Also allow setting API base URLs (mirrors) from config.json, e.g. OPENAI_API_BASE
for key in ['OPENAI_API_BASE', 'GEMINI_API_BASE', 'OPENROUTER_BASE_URL']:
    if key in config and config[key]:
        os.environ[key] = config[key]



# 预设文件目录
PRESETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'experiment_presets')

# 用户数据目录
USERS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'users')
os.makedirs(USERS_DIR, exist_ok=True)

# 简单的用户会话存储（内存中，实际生产环境应使用数据库或Redis）
user_sessions: dict[str, dict] = {}  # session_id -> user_data

from modules.server.room_manager import RoomManager

room_manager = RoomManager()

@app.on_event("startup")
async def startup_event():
    await room_manager.start_cleanup_task()

# Ensure at least one default room or create on demand
# For backward compatibility or simple testing, creating a default room might be useful if we want
# but the plan says we create on load-preset or via API.

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
        room_id = data.get('room_id') # Optional, if provided join/reset specific room
        
        if not preset_name:
            raise HTTPException(status_code=400, detail="No preset specified")
            
        preset_path = os.path.join(PRESETS_DIR, preset_name)
        print(f"Loading preset from: {preset_path}")
        
        if not os.path.exists(preset_path):
            raise HTTPException(status_code=404, detail=f"Preset not found: {preset_path}")
            
        try:
            # Create or get room
            # If no room_id provided, create new one
            if not room_id:
                room = room_manager.create_room(preset_path=preset_path)
            else:
                # If room exists, maybe we just return it or reset it?
                # For now assume we create/get. If user wants to RESET a room with new preset, we might need explicit logic.
                # Here we simplify: if room exists, we return it (ignoring preset change request for now or re-init?)
                # To support changing preset, we might need to verify if room is empty or force reset.
                room = room_manager.create_room(room_id=room_id, preset_path=preset_path)

            # Get initial data from room
            # Note: Room class needs get_initial_data method? Or we access scrollweaver directly?
            # Let's add get_initial_data to Room or access it here.
            
            initial_data = {
                'characters': room.scrollweaver.get_characters_info(),
                'map': room.scrollweaver.get_map_info(),
                'settings': room.scrollweaver.get_settings_info(),
                'status': room.scrollweaver.get_current_status(),
                'history_messages': room.scrollweaver.get_history_messages(save_dir=config.get("save_dir","")),
                'room_id': room.room_id
            }
            
            return {
                "success": True,
                "data": initial_data,
                "room_id": room.room_id
            }
        except Exception as e:
            print(f"Error initializing Room: {str(e)}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Error initializing Room: {str(e)}")
            
    except Exception as e:
        print(f"Error in load_preset: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/{room_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    room = room_manager.get_room(room_id)
    if not room:
         # 房间不存在，拒绝连接
         await websocket.close(code=1008, reason="Room does not exist")
         return
    
    # Try to extract user_id from session
    user_id = None
    try:
        user_id = websocket.session.get('user_id')
    except Exception:
        pass
        
    try:
        await room.connect(websocket, client_id, user_id)
    except Exception as e:
        print(f"Error in room.connect: {e}")
        import traceback
        traceback.print_exc()
        await websocket.close(code=1011)
        return
    
    try:
        # Send initial data
        characters_info = room.scrollweaver.get_characters_info()
        map_info = room.scrollweaver.get_map_info()
        settings_info = room.scrollweaver.get_settings_info()
        
        await websocket.send_json({
            'type': 'initial_state',
            'data': {
                'characters': characters_info,
                'map': map_info,
                'settings': settings_info,
                'status': room.scrollweaver.get_current_status()
            }
        })
        
        # Start story loop for the room
        await room.start_story_loop()
        
        while True:
            data = await websocket.receive_json()
            msg_type = data.get('type')
            
            if msg_type == 'user_input':
                text = data.get('text', '')
                if client_id in room.pending_user_inputs and not room.pending_user_inputs[client_id].done():
                    room.pending_user_inputs[client_id].set_result(text)
                else:
                    # Check possession mode and verify permissions
                    role_code = room.user_selected_roles.get(client_id)
                    if role_code:
                        # 权限验证：确保用户只能控制自己的数字孪生
                        if not role_code.startswith('digital_twin_user_'):
                            await websocket.send_json({
                                'type': 'error',
                                'data': {'message': '只能控制自己的数字孪生'}
                            })
                        else:
                            # 权限验证通过，处理用户输入
                            await room.handle_user_role_input(client_id, role_code, text)
                    else:
                        await websocket.send_json({
                            'type': 'error',
                            'data': {'message': '未绑定数字孪生，无法发送消息'}
                        })
                         
            # role_selected消息处理已移除 - 用户数字孪生自动绑定
                
            elif msg_type == 'possession_mode' or msg_type == 'set_possession_mode':
                enabled = data.get('enabled', False)
                role_code = room.user_selected_roles.get(client_id)
                
                # 注意：前端的语义是：
                # - enabled = true 表示"用户控制模式"（possession mode开启）
                # - enabled = false 表示"AI自由行动模式"（possession mode关闭）
                # 但ScrollWeaver中的语义是：
                # - possession_modes[role] = True 表示"AI接管"（AI自由行动）
                # - possession_modes[role] = False 表示"用户控制"（等待用户输入）
                # 所以需要反转逻辑
                
                room.possession_mode[client_id] = enabled
                
                # Sync possession per-role to ScrollWeaver server
                try:
                    # Build role->possession mapping
                    pos_map = getattr(room.scrollweaver.server, '_possession_mode_by_role', {}) or {}
                    if role_code:
                        # 反转逻辑：前端enabled=true(用户控制) → ScrollWeaver需要False(AI不接管)
                        # 前端enabled=false(AI自由) → ScrollWeaver需要True(AI接管)
                        pos_map[role_code] = not bool(enabled)
                    # default global flag for backward compatibility
                    room.scrollweaver.server._possession_mode = any(not v for v in pos_map.values()) if pos_map else not bool(enabled)
                    room.scrollweaver.server._possession_mode_by_role = pos_map
                    print(f"[Room {room.room_id}] Possession mode updated: client={client_id}, role={role_code}, enabled={enabled}, ai_possession={pos_map.get(role_code) if role_code else 'N/A'}")
                except Exception as e:
                    print(f"[Room {room.room_id}] Error syncing possession mode: {e}")
                    # best-effort only
                    room.scrollweaver.server._possession_mode = not bool(enabled)
                
            # clear_role消息处理已移除 - 用户数字孪生自动绑定，无法手动清除
                    
            elif msg_type == 'control_command':
                cmd = data.get('command')
                if cmd == 'start':
                    await room.start_story_loop()
                elif cmd == 'pause':
                    # implement pause logic in Room if needed
                    pass
                elif cmd == 'stop':
                    if room.story_task:
                        room.story_task.cancel()
            
            elif msg_type == 'request_characters':
                 await websocket.send_json({
                     'type': 'characters_updated',
                     'data': {'characters': room.scrollweaver.get_characters_info()}
                 })
            
            elif msg_type == 'auto_complete':
                # 处理AI自动完成请求
                if client_id in room.waiting_for_input and room.waiting_for_input[client_id]:
                    user_role_code = room.user_selected_roles.get(client_id)
                    if user_role_code and client_id in room.pending_user_inputs:
                        if not room.pending_user_inputs[client_id].done():
                            try:
                                # 调用AI生成多个行动选项
                                options = await room.generate_auto_action_options(client_id, user_role_code, num_options=3)
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
                                'data': {'message': '输入已完成，无法生成建议'}
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
            
            elif msg_type == 'select_auto_option':
                # 处理用户选择的AI选项
                if client_id in room.waiting_for_input and room.waiting_for_input[client_id]:
                    user_role_code = room.user_selected_roles.get(client_id)
                    if user_role_code and client_id in room.pending_user_inputs:
                        if not room.pending_user_inputs[client_id].done():
                            selected_text = data.get('selected_text', '')
                            if selected_text:
                                # 将选中的选项作为用户输入，并标记为已回显
                                room.pending_user_inputs[client_id].set_result((selected_text, True))
                                
                                # 立即广播消息给所有用户，确保大家都能看到
                                performer = room.scrollweaver.server.performers.get(user_role_code)
                                username = performer.nickname if performer and hasattr(performer, 'nickname') and performer.nickname else (performer.role_name if performer and hasattr(performer, 'role_name') else user_role_code)
                                icon_path = default_icon_path
                                if performer and hasattr(performer, 'icon_path') and performer.icon_path and os.path.exists(performer.icon_path) and is_image(performer.icon_path):
                                    icon_path = performer.icon_path
                                
                                # 使用广播而不是单发，确保所有用户都能看到
                                # 添加 role_code 字段，确保前端能正确判断消息来源
                                await room.broadcast_json({
                                    'type': 'message',
                                    'data': {
                                        'username': username,
                                        'text': selected_text,
                                        'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                        'is_user': True,
                                        'is_timeout_replacement': False,
                                        'role_code': user_role_code,  # 添加 role_code 用于前端区分
                                        'icon': icon_path
                                    }
                                })
                                
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
                                'data': {'message': '输入已完成，无法选择建议'}
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
                 
    except WebSocketDisconnect:
        await room.disconnect(client_id)
        print(f"Client {client_id} disconnected from room {room_id}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        import traceback
        traceback.print_exc()
        await room.disconnect(client_id)



def get_user_id_from_session(request: Request) -> Optional[str]:
    """从会话中获取用户ID"""
    session_id = request.session.get('user_id')
    return session_id

@app.post("/api/reset-sandbox")
async def reset_sandbox(request: Request):
    """重置沙盒状态"""
    try:
        data = await request.json()
        room_id = data.get('room_id')
        
        if room_id:
            room = room_manager.get_room(room_id)
        if not room_id or not room:
             room = room_manager.get_or_create_default_room()
             
        print(f"[Reset Sandbox] Resetting sandbox for room {room.room_id}")
        
        # Stop current story loop
        if room.story_task and not room.story_task.done():
            room.story_task.cancel()
            try:
                await room.story_task
            except asyncio.CancelledError:
                pass
            print(f"[Reset Sandbox] Story loop cancelled for room {room.room_id}")
        
        # Clear history - use the correct method
        if hasattr(room.scrollweaver.server, 'history_manager'):
            room.scrollweaver.server.history_manager.detailed_history = []
            if hasattr(room.scrollweaver.server.history_manager, 'history'):
                room.scrollweaver.server.history_manager.history = []
            print(f"[Reset Sandbox] History cleared for room {room.room_id}")
        
        # Reset round and event
        if hasattr(room.scrollweaver.server, 'cur_round'):
            room.scrollweaver.server.cur_round = 0
        if hasattr(room.scrollweaver.server, 'event_history'):
            room.scrollweaver.server.event_history = []
        if hasattr(room.scrollweaver.server, 'event'):
            room.scrollweaver.server.event = ""
        
        # Reset generator
        room.generator_initialized = False
        
        # Broadcast reset
        await room.broadcast_json({
            'type': 'system_reset',
            'data': {'message': '沙盒已重置'}
        })
        
        print(f"[Reset Sandbox] Sandbox reset completed for room {room.room_id}")
        return {"success": True}
    except Exception as e:
        print(f"Error resetting sandbox: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/clear-chat-history")
async def clear_chat_history(request: Request):
    """清空聊天记录"""
    try:
        data = await request.json()
        room_id = data.get('room_id')
        
        if room_id:
            room = room_manager.get_room(room_id)
        if not room_id or not room:
             room = room_manager.get_or_create_default_room()

        print(f"[Clear History] Clearing chat history for room {room.room_id}")
        
        # Clear history - use the correct method
        if hasattr(room.scrollweaver.server, 'history_manager'):
            room.scrollweaver.server.history_manager.detailed_history = []
            if hasattr(room.scrollweaver.server.history_manager, 'history'):
                room.scrollweaver.server.history_manager.history = []
            print(f"[Clear History] History cleared for room {room.room_id}")
        
        await room.broadcast_json({
            'type': 'history_cleared',
            'data': {'message': '聊天记录已清空'}
        })
        
        return {"success": True}
    except Exception as e:
        print(f"Error clearing history: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/start-1on1-chat")
async def start_1on1_chat(request: Request):
    """开启1对1聊天模式"""
    try:
        data = await request.json()
        target_role_code = data.get('target_role_code')
        room_id = data.get('room_id')
        
        if not target_role_code:
            raise HTTPException(status_code=400, detail="Target role code is required")
            
        if room_id:
            room = room_manager.get_room(room_id)
        if not room_id or not room:
             room = room_manager.get_or_create_default_room()

        # Logic to set 1on1 mode in ScrollWeaver server?
        # Assuming ScrollWeaver has support or we just ensure only 2 agents are active?
        # Typically implies pausing others or setting a focus.
        # For now, we'll just set it in server state if supported, or just return success
        # if the frontend handles the UI focus.
        
        # room.scrollweaver.server.set_1on1_mode(target_role_code) # Hypothetical
        
        return {"success": True, "message": f"Started 1on1 chat with {target_role_code}"}
    except Exception as e:
        print(f"Error starting 1on1 chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
@app.get("/api/get-daily-report")
async def get_daily_report(room_id: str = None):
    """获取日报"""
    try:
        if room_id:
            room = room_manager.get_room(room_id)
        if not room_id or not room:
             room = room_manager.get_or_create_default_room()
             
        # Assuming ScrollWeaver can generate a report
        report = "Daily report functionality not fully implemented in ScrollWeaver yet."
        # report = room.scrollweaver.generate_daily_report()
        
        return {"success": True, "report": report}
    except Exception as e:
        print(f"Error getting daily report: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/login")
async def login(request: Request):
    """用户登录（简单验证，支持访客模式）"""
    try:
        data = await request.json()
        user_id = data.get('user_id', '').strip()
        password = data.get('password', '').strip()
        is_guest = data.get('is_guest', False)
        
        if is_guest:
            # 访客模式：生成临时用户ID
            user_id = f"guest_{secrets.token_urlsafe(8)}"
            # 创建访客用户数据
            user_data = {
                "user_id": user_id,
                "username": "访客",
                "is_guest": True,
                "created_at": datetime.now().isoformat()
            }
        else:
            # 正常登录：验证用户（简单实现，实际应验证密码）
            if not user_id:
                raise HTTPException(status_code=400, detail="用户ID不能为空")
            
            # 检查用户是否存在
            user_file = os.path.join(USERS_DIR, f"{user_id}.json")
            if os.path.exists(user_file):
                user_data = load_json_file(user_file)
            else:
                # 新用户：创建用户数据
                user_data = {
                    "user_id": user_id,
                    "username": user_id,
                    "is_guest": False,
                    "created_at": datetime.now().isoformat()
                }
                # 保存用户数据
                with open(user_file, 'w', encoding='utf-8') as f:
                    json.dump(user_data, f, ensure_ascii=False, indent=2)
        
        # 设置会话
        request.session['user_id'] = user_id
        request.session['username'] = user_data.get('username', user_id)
        
        return {
            "success": True,
            "user_id": user_id,
            "username": user_data.get('username', user_id),
            "is_guest": user_data.get('is_guest', False)
        }
    except Exception as e:
        print(f"Error in login: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/register")
async def register(request: Request):
    """用户注册（可选）"""
    try:
        data = await request.json()
        user_id = data.get('user_id', '').strip()
        password = data.get('password', '').strip()
        username = data.get('username', user_id).strip()
        
        if not user_id:
            raise HTTPException(status_code=400, detail="用户ID不能为空")
        
        user_file = os.path.join(USERS_DIR, f"{user_id}.json")
        if os.path.exists(user_file):
            raise HTTPException(status_code=400, detail="用户已存在")
        
        # 创建新用户
        user_data = {
            "user_id": user_id,
            "username": username,
            "password": password,  # 简单存储，实际应加密
            "is_guest": False,
            "created_at": datetime.now().isoformat()
        }
        
        # 保存用户数据
        with open(user_file, 'w', encoding='utf-8') as f:
            json.dump(user_data, f, ensure_ascii=False, indent=2)
        
        # 设置会话
        request.session['user_id'] = user_id
        request.session['username'] = username
        
        return {
            "success": True,
            "user_id": user_id,
            "username": username
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in register: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/user/me")
async def get_current_user(request: Request):
    """获取当前用户信息"""
    try:
        user_id = get_user_id_from_session(request)
        if not user_id:
            raise HTTPException(status_code=401, detail="未登录")
        
        user_file = os.path.join(USERS_DIR, f"{user_id}.json")
        if os.path.exists(user_file):
            user_data = load_json_file(user_file)
            # 移除敏感信息
            user_data.pop('password', None)
            return {
                "success": True,
                "user": user_data
            }
        else:
            # 访客用户或新用户
            return {
                "success": True,
                "user": {
                    "user_id": user_id,
                    "username": request.session.get('username', user_id),
                    "is_guest": True
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_current_user: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/logout")
async def logout(request: Request):
    """用户退出登录"""
    try:
        # 清除会话
        request.session.clear()
        
        return {
            "success": True,
            "message": "已退出登录"
        }
    except Exception as e:
        print(f"Error in logout: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-digital-twin-profile")
async def generate_digital_twin_profile(request: Request):
    """生成数字孪生完整画像"""
    try:
        data = await request.json()
        
        # 提取输入数据
        mbti_type = data.get('mbti_type')
        mbti_answers = data.get('mbti_answers', [])
        big_five_answers = data.get('big_five_answers', [])
        
        # 新增 Phase 2 数据
        defense_answers = data.get('defense_answers', [])
        attachment_answers = data.get('attachment_answers', [])
        values_order = data.get('values_order', [])
        
        chat_history = data.get('chat_history', '')
        user_name = data.get('user_name', '')
        relationship = data.get('relationship', '')
        
        # 1. 确定MBTI类型
        final_mbti = mbti_type
        if not final_mbti and mbti_answers:
            # 计算MBTI
            counts = {'E': 0, 'I': 0, 'S': 0, 'N': 0, 'T': 0, 'F': 0, 'J': 0, 'P': 0}
            for answer in mbti_answers:
                if answer:
                    counts[answer] += 1
            
            final_mbti = (
                ('E' if counts['E'] >= counts['I'] else 'I') +
                ('S' if counts['S'] >= counts['N'] else 'N') +
                ('T' if counts['T'] >= counts['F'] else 'T') +
                ('J' if counts['J'] >= counts['P'] else 'P')
            )
        elif not final_mbti:
            # 如果没有MBTI类型且无法计算（新版问卷数据在后端未配置题目元数据），暂定为未知
            pass
            
        # 2. 计算Big Five分数
        big_five_scores = None
        if big_five_answers:
            scores = {
                'openness': [], 
                'conscientiousness': [], 
                'extraversion': [], 
                'agreeableness': [], 
                'neuroticism': []
            }
            
            for answer in big_five_answers:
                if answer and 'dimension' in answer and 'value' in answer:
                    dim = answer['dimension']
                    try:
                        val = float(answer['value'])
                        
                        # 处理反向计分 (1-5量表)
                        if 'direction' in answer and int(answer.get('direction', 1)) == -1:
                            val = 6 - val
                            
                        if dim in scores:
                            scores[dim].append(val)
                    except (ValueError, TypeError):
                        continue
            
            big_five_scores = {}
            for dim, values in scores.items():
                if values:
                    # 计算平均分 (1-5)
                    avg = sum(values) / len(values)
                    # 归一化到 0-1 (1->0, 5->1)
                    normalized = (avg - 1) / 4
                    big_five_scores[dim] = round(max(0.0, min(1.0, normalized)), 2)
                else:
                    big_five_scores[dim] = 0.5

        # 3. 计算防御机制分数
        defense_scores = {}
        if defense_answers:
            d_scores = {}
            for answer in defense_answers:
                if answer and 'dimension' in answer and 'value' in answer:
                    dim = answer['dimension']
                    val = float(answer['value'])
                    if dim not in d_scores: d_scores[dim] = []
                    d_scores[dim].append(val)
            
            for dim, values in d_scores.items():
                defense_scores[dim] = round(sum(values) / len(values), 2)

        # 4. 计算依恋风格分数
        attachment_scores = {}
        if attachment_answers:
            a_scores = {}
            for answer in attachment_answers:
                if answer and 'dimension' in answer and 'value' in answer:
                    dim = answer['dimension']
                    val = float(answer['value'])
                    if dim not in a_scores: a_scores[dim] = []
                    a_scores[dim].append(val)
            
            for dim, values in a_scores.items():
                attachment_scores[dim] = round(sum(values) / len(values), 2)
        
        # 5. 构建Prompt
        prompt = "你是一位专业的数字孪生人格分析师。请基于以下所有信息，生成用户的完整人格画像。\n\n"
        
        # MBTI信息
        prompt += "## 一、MBTI类型信息\n"
        if mbti_type:
            prompt += f"**用户自己选择的MBTI类型**: {mbti_type}\n**重要**: 这是用户自己确定的MBTI类型，你必须使用这个类型，不可更改。\n"
        elif final_mbti:
            prompt += f"**根据问卷计算的MBTI类型**: {final_mbti}\n"
        else:
            prompt += "**MBTI类型**: 未知\n"
            
        # 核心层信息
        prompt += "\n## 二、核心层信息 (Big Five)\n"
        if big_five_scores:
            prompt += f"**Big Five评分**（基于问卷计算）: {json.dumps(big_five_scores, ensure_ascii=False, indent=2)}\n"
        else:
            prompt += "用户未完成核心层问卷。\n"

        # 深层机制信息
        prompt += "\n## 三、深层机制信息\n"
        if defense_scores:
            prompt += f"**防御机制倾向** (1-5分): {json.dumps(defense_scores, ensure_ascii=False, indent=2)}\n"
            # 找出得分最高的防御机制
            top_defense = max(defense_scores.items(), key=lambda x: x[1])[0] if defense_scores else "Unknown"
            prompt += f"**主要防御机制**: {top_defense}\n"
        else:
            prompt += "用户未完成防御机制问卷。\n"

        if attachment_scores:
            prompt += f"**依恋风格倾向** (1-5分): {json.dumps(attachment_scores, ensure_ascii=False, indent=2)}\n"
            # 找出得分最高的依恋风格
            top_attachment = max(attachment_scores.items(), key=lambda x: x[1])[0] if attachment_scores else "Unknown"
            prompt += f"**主要依恋风格**: {top_attachment}\n"
        else:
            prompt += "用户未完成依恋风格问卷。\n"

        if values_order:
            prompt += f"**价值观排序** (从最重要到最不重要): {', '.join(values_order)}\n"
        else:
            prompt += "用户未完成价值观排序。\n"

        if not big_five_scores and not defense_scores and chat_history:
             prompt += "**注意**: 由于缺乏问卷数据，请重点基于后续提供的聊天记录，推断用户的Big Five人格特征、价值观和防御机制。\n"
                
        # 聊天记录信息
        prompt += "\n## 四、用户聊天记录\n"
        if chat_history:
            prompt += f"**用户名称**: {user_name}\n"
            if relationship:
                prompt += f"**聊天对象关系**: {relationship}\n"
            
            # 截取最近的聊天记录以避免超出token限制
            # 简单截取最后10000个字符
            truncated_history = chat_history[-10000:] if len(chat_history) > 10000 else chat_history
            prompt += f"\n**聊天记录内容**:\n{truncated_history}\n\n"
            
            prompt += "**重要说明**:\n"
            prompt += f"- 请识别出用户自己发送的消息（发送者为\"{user_name}\"的消息）\n"
            prompt += "- 基于用户自己的消息，分析语言风格特征（表象层）\n"
            prompt += "- 基于完整聊天记录，分析用户的性格特征\n"
        else:
            prompt += "用户未上传聊天记录。\n"
            
        # 生成要求
        prompt += """
\n## 五、分析与生成要求

请按以下步骤进行思考 (Chain of Thought):
1. **核心特质识别**: 结合MBTI、Big Five和价值观排序，构建用户的人格核心。
2. **深层动力分析**: 
   - 结合依恋风格和防御机制，分析用户在压力或亲密关系中的行为模式。
   - 确保生成的 defense_mechanism 与问卷结果一致（如有）。
   - 确保生成的 values 与用户的价值观排序一致（如有）。
3. **一致性检验**: 如果有聊天记录，对比问卷结果和聊天风格是否一致。
4. **语言风格设计**: 确保生成的语言风格（speaking_style）与人格特质高度匹配。

请生成一个完整的JSON对象，包含以下所有字段：

{
  "core_traits": {
    "mbti": "MBTI类型",
    "big_five": {"openness": 0.5, "conscientiousness": 0.5, "extraversion": 0.5, "agreeableness": 0.5, "neuroticism": 0.5},
    "values": ["价值观1", "价值观2", "价值观3"],
    "defense_mechanism": "防御机制名称 (英文)",
    "attachment_style": "依恋风格 (Secure/Anxious/Avoidant)"
  },
  "speaking_style": {
    "sentence_length": "short/medium/long/mixed",
    "vocabulary_level": "academic/casual/network/mixed",
    "punctuation_habit": "minimal/standard/excessive/mixed",
    "emoji_usage": {
      "frequency": "none/low/medium/high",
      "preferred": ["表情1", "表情2"],
      "avoided": []
    },
    "catchphrases": ["口头禅1", "口头禅2"],
    "tone_markers": ["语气词1", "语气词2"]
  }
}

**重要规则**:
1. **MBTI类型**: 必须使用确定的MBTI类型。
2. **核心层数据**: 
   - Big Five评分必须基于计算结果（如有）。
   - values数组生成3-5个中文词汇，必须优先参考用户的价值观排序。
   - defense_mechanism: 如果有问卷结果，必须使用得分最高的机制；否则从以下选择：Rationalization, Projection, Denial, Repression, Sublimation, Displacement, ReactionFormation, Humor, Intellectualization。
   - attachment_style: 如果有问卷结果，必须使用得分最高的风格；否则根据分析推断。
3. **表象层数据**: 
   - 如果有聊天记录，必须深入分析生成speaking_style对象。
   - 如果没有聊天记录，请根据MBTI和Big Five推断最可能的语言风格。
4. 只返回JSON对象，不要包含markdown代码块标记。
"""

        # 4. 调用LLM
        # 使用配置中的默认模型
        model_name = config.get("role_llm_name", "gpt-3.5-turbo")
        llm = get_models(model_name)
        
        # Async call to prevent blocking server
        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(None, llm.chat, prompt)
        
        # 5. 解析响应
        try:
            # 尝试清理markdown标记
            cleaned_response = response.strip()
            if cleaned_response.startswith("```json"):
                cleaned_response = cleaned_response[7:]
            if cleaned_response.startswith("```"):
                cleaned_response = cleaned_response[3:]
            if cleaned_response.endswith("```"):
                cleaned_response = cleaned_response[:-3]
            
            profile_data = json_parser(cleaned_response)
            
            return {
                "success": True,
                "profile": profile_data
            }
        except Exception as e:
            print(f"Error parsing LLM response: {e}")
            print(f"Raw response: {response}")
            return {
                "success": False,
                "error": "生成失败，无法解析AI响应",
                "raw_response": response
            }
            
    except Exception as e:
        print(f"Error in generate_digital_twin_profile: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/user/digital-twin")
async def save_digital_twin(request: Request):
    """保存/更新用户的数字孪生 agent"""
    try:
        user_id = get_user_id_from_session(request)
        if not user_id:
            raise HTTPException(status_code=401, detail="未登录")
        
        data = await request.json()
        agent_info = data.get('agent_info')
        
        if not agent_info:
            raise HTTPException(status_code=400, detail="agent_info 不能为空")
        
        # 加载或创建用户数据
        user_file = os.path.join(USERS_DIR, f"{user_id}.json")
        if os.path.exists(user_file):
            user_data = load_json_file(user_file)
        else:
            user_data = {
                "user_id": user_id,
                "username": request.session.get('username', user_id),
                "created_at": datetime.now().isoformat()
            }
        
        # 保存数字孪生（覆盖旧的）
        user_data['digital_twin'] = agent_info
        user_data['digital_twin_updated_at'] = datetime.now().isoformat()
        
        # 保存到文件
        with open(user_file, 'w', encoding='utf-8') as f:
            json.dump(user_data, f, ensure_ascii=False, indent=2)
        
        return {
            "success": True,
            "message": "数字孪生已保存",
            "agent_info": agent_info
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in save_digital_twin: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/user/digital-twin")
async def get_digital_twin(request: Request):
    """获取用户的数字孪生 agent"""
    try:
        user_id = get_user_id_from_session(request)
        if not user_id:
            raise HTTPException(status_code=401, detail="未登录")
        
        user_file = os.path.join(USERS_DIR, f"{user_id}.json")
        if os.path.exists(user_file):
            user_data = load_json_file(user_file)
            digital_twin = user_data.get('digital_twin')
            if digital_twin:
                return {
                    "success": True,
                    "agent_info": digital_twin
                }
        
        return {
            "success": True,
            "agent_info": None,
            "message": "用户尚未创建数字孪生"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_digital_twin: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-anime-images")
async def generate_anime_images(
    front_photo: UploadFile = File(...),
    life_photo_1: UploadFile = File(...),
    life_photo_2: UploadFile = File(...)
):
    """使用 Gemini Nano Banana Pro 将人物图片动漫化"""
    try:
        # 配置 Gemini API
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            raise HTTPException(status_code=500, detail="未配置 GEMINI_API_KEY")
        
        # 创建图片存储目录（保存到 pic 文件夹）
        images_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pic')
        os.makedirs(images_dir, exist_ok=True)
        
        # 读取图片文件
        front_photo_data = await front_photo.read()
        life_photo_1_data = await life_photo_1.read()
        life_photo_2_data = await life_photo_2.read()
        
        # 初始化 Gemini 客户端
        # 临时禁用代理以避免 OAuth2 连接错误
        original_proxy_vars = {}
        proxy_vars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']
        for var in proxy_vars:
            if var in os.environ:
                original_proxy_vars[var] = os.environ[var]
                del os.environ[var]
        
        client = None
        use_new_api = USE_NEW_GENAI_API
        # 对于图片生成，强制使用旧 API (google.generativeai)
        import google.generativeai as genai_old
        genai_module = genai_old
        
        try:
            if use_new_api:
                client = genai_module.Client(api_key=gemini_api_key)
            else:
                genai_module.configure(api_key=gemini_api_key)
        except Exception as client_error:
            print(f"警告：创建 Gemini 客户端时出错: {client_error}")
            # 如果新 API 失败，尝试使用旧 API
            if use_new_api:
                print("尝试使用旧版 API...")
                try:
                    import google.generativeai as genai_old
                    genai_old.configure(api_key=gemini_api_key)
                    use_new_api = False
                    genai_module = genai_old
                    client = None  # 旧 API 不需要 client 对象
                except Exception as fallback_error:
                    print(f"旧版 API 也失败: {fallback_error}")
                    # 恢复代理环境变量
                    for var, value in original_proxy_vars.items():
                        os.environ[var] = value
                    raise HTTPException(status_code=500, detail=f"无法初始化 Gemini API 客户端: {fallback_error}")
            else:
                # 恢复代理环境变量
                for var, value in original_proxy_vars.items():
                    os.environ[var] = value
                raise HTTPException(status_code=500, detail=f"无法初始化 Gemini API 客户端: {client_error}")
        
        anime_images = {}
        image_files = [
            ('front', front_photo_data, front_photo.filename),
            ('life1', life_photo_1_data, life_photo_1.filename),
            ('life2', life_photo_2_data, life_photo_2.filename)
        ]
        
        for img_type, img_data, filename in image_files:
            try:
                import PIL.Image
                import io
                
                # 从字节数据创建 PIL Image 对象
                img = PIL.Image.open(io.BytesIO(img_data))
                
                # 动漫化提示词
                prompt = "请动漫化人物图片"
                
                # 保存生成的动漫图片路径
                anime_filename = f"{img_type}_{int(datetime.now().timestamp())}.png"
                anime_path = os.path.join(images_dir, anime_filename)
                
                try:
                    # 注意：新 API 的图片生成模型不支持 API Key，强制使用旧 API
                    # 使用旧的 API (google.generativeai) 进行图片生成
                    print(f"[Anime] 开始处理 {img_type}")
                    print(f"[Anime] 提示词: {prompt}")
                    # 使用 gemini-2.0-flash-exp，它支持图片生成和 API Key
                    model = genai_module.GenerativeModel('gemini-2.0-flash-exp')
                    print(f"[Anime] 调用模型: gemini-2.0-flash-exp")
                    response = model.generate_content([prompt, img])
                    print(f"[Anime] API 调用成功，响应类型: {type(response)}")
                    
                    # 尝试从响应中提取图片
                    image_saved = False
                    if hasattr(response, 'candidates') and response.candidates:
                        print(f"[Anime] 找到 {len(response.candidates)} 个候选结果")
                        candidate = response.candidates[0]
                        if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                            print(f"[Anime] 内容有 {len(candidate.content.parts)} 个部分")
                            for i, part in enumerate(candidate.content.parts):
                                print(f"[Anime] 检查 Part {i}: {type(part)}")
                                if hasattr(part, 'inline_data') and part.inline_data:
                                    print(f"[Anime] ✅ 找到图片数据！")
                                    import base64
                                    try:
                                        image_data = base64.b64decode(part.inline_data.data)
                                        with open(anime_path, 'wb') as f:
                                            f.write(image_data)
                                        image_saved = True
                                        print(f"[Anime] ✅ 成功保存动漫图片: {img_type}")
                                        break
                                    except Exception as decode_error:
                                        print(f"[Anime] ❌ 解码图片数据失败: {decode_error}")
                                        import traceback
                                        traceback.print_exc()
                                        continue
                                elif hasattr(part, 'text'):
                                    print(f"[Anime] Part {i} 是文本: {part.text[:100] if part.text else 'None'}")
                        else:
                            print(f"[Anime] ⚠️ 候选结果没有 content.parts")
                    else:
                        print(f"[Anime] ⚠️ 响应没有 candidates 或 candidates 为空")
                        if hasattr(response, 'text'):
                            print(f"[Anime] 响应文本: {response.text[:500] if response.text else 'None'}")
                    
                    if not image_saved:
                        print(f"[Anime] ⚠️ 警告: 未找到图片数据，保存原始图片: {img_type}")
                        img.save(anime_path)
                            
                except Exception as api_error:
                    print(f"Gemini API error for {img_type}: {api_error}")
                    import traceback
                    traceback.print_exc()
                    # 如果 API 调用失败，保存原始图片
                    img.save(anime_path)
                
                anime_images[img_type] = f"/api/anime-images/{anime_filename}"
                
            except Exception as e:
                print(f"Error processing {img_type} image: {e}")
                import traceback
                traceback.print_exc()
                # 如果处理失败，保存原始图片
                anime_filename = f"{img_type}_{int(datetime.now().timestamp())}.jpg"
                anime_path = os.path.join(images_dir, anime_filename)
                with open(anime_path, 'wb') as f:
                    f.write(img_data)
                anime_images[img_type] = f"/api/anime-images/{anime_filename}"
        
        # 恢复代理环境变量
        for var, value in original_proxy_vars.items():
            os.environ[var] = value
        
        return {
            "success": True,
            "anime_images": anime_images,
            "message": "动漫化处理完成"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in generate_anime_images: {e}")
        import traceback
        traceback.print_exc()
        # 确保返回 JSON 格式的错误响应
        error_detail = str(e)
        # 如果错误信息太长，截断
        if len(error_detail) > 200:
            error_detail = error_detail[:200] + "..."
        raise HTTPException(status_code=500, detail=error_detail)

# 添加静态文件服务，用于访问动漫化图片
anime_images_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pic')
os.makedirs(anime_images_dir, exist_ok=True)

@app.get("/api/anime-images/{filename}")
async def get_anime_image(filename: str):
    """获取动漫化图片"""
    try:
        file_path = os.path.join(anime_images_dir, filename)
        if os.path.exists(file_path):
            return FileResponse(file_path)
        else:
            raise HTTPException(status_code=404, detail="图片不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/restore-user-agent")
async def restore_user_agent(request: Request):
    """从已保存的数字孪生恢复用户 agent 到沙盒"""
    try:
        user_id = get_user_id_from_session(request)
        if not user_id:
            raise HTTPException(status_code=401, detail="未登录")
        
        data = await request.json()
        room_id = data.get('room_id')
        
        if room_id:
            room = room_manager.get_room(room_id)
            if not room:
                 room = room_manager.create_room(room_id)
        else:
             room = room_manager.get_or_create_default_room()

        # 获取用户的数字孪生数据
        user_file = os.path.join(USERS_DIR, f"{user_id}.json")
        if not os.path.exists(user_file):
            raise HTTPException(status_code=404, detail="用户数据不存在")
        
        user_data = load_json_file(user_file)
        digital_twin = user_data.get('digital_twin')
        if not digital_twin:
            raise HTTPException(status_code=404, detail="数字孪生数据不存在")
        
        # 从数字孪生数据中获取role_code
        role_code = digital_twin.get('role_code')
        if not role_code:
            raise HTTPException(status_code=400, detail="数字孪生数据中缺少role_code")
        
        # 验证role_code格式
        if not role_code.startswith('digital_twin_user_'):
            raise HTTPException(status_code=400, detail=f"无效的role_code格式: {role_code}")

        # 检查 agent 是否已存在
        if role_code in room.scrollweaver.server.role_codes:
            print(f"用户Agent {role_code} 已存在于沙盒中，跳过恢复")
            agent = room.scrollweaver.server.performers.get(role_code)
            nickname = "Unknown"
            if agent:
                nickname = getattr(agent, 'nickname', None) or getattr(agent, 'role_name', None) or "Unknown"
            return {
                "success": True,
                "already_exists": True,
                "agent_info": {
                    "role_code": role_code,
                    "nickname": nickname,
                    "message": "Agent已存在"
                }
            }
        
        # 数字孪生数据已在上面获取
        soul_profile = digital_twin.get('extracted_profile', {})
        
        core_traits = None
        if 'personality' in digital_twin and isinstance(digital_twin['personality'], dict) and 'mbti' in digital_twin['personality']:
             core_traits = digital_twin['personality']
        elif 'core_traits' in digital_twin:
             core_traits = digital_twin['core_traits']

        if not soul_profile and core_traits:
            soul_profile = {
                "mbti": core_traits.get('mbti'),
                "interests": core_traits.get('values', []),
                "social_goals": core_traits.get('values', []),
                "big_five": core_traits.get('big_five', {}),
                "defense_mechanism": core_traits.get('defense_mechanism'),
                "attachment_style": core_traits.get('attachment_style'),
                "personality": core_traits
            }

        if not soul_profile:
            soul_profile = get_soul_profile(user_id=user_id)
        
        # 创建用户 Agent
        user_agent = room.scrollweaver.server.add_user_agent(
            user_id=user_id,
            role_code=role_code,
            soul_profile=soul_profile
        )
        
        # 记录用户 Agent 映射
        room.user_agents[user_id] = role_code
        
        # 注意：不需要重置generator_initialized，新agent会在下一个轮次自然参与
        
        print(f"用户Agent已恢复到沙盒: {user_agent.nickname} ({role_code})")
        
        characters_info = room.scrollweaver.get_characters_info()
        
        # Broadcast update to notify all clients
        await room.broadcast_json({
            'type': 'characters_list',
            'data': {'characters': characters_info}
        })

        return {
            "success": True,
            "already_exists": False,
            "agent_info": {
                "role_code": role_code,
                "role_name": user_agent.role_name,
                "nickname": user_agent.nickname,
                "location": user_agent.location_name
            },
            "characters": characters_info
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in restore_user_agent: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/create-room")
async def create_room_endpoint(request: Request):
    """显式创建房间"""
    try:
        data = await request.json()
        room_id = data.get('room_id')
        
        if not room_id:
            raise HTTPException(status_code=400, detail="Room ID is required")
            
        # create_room will return existing room if it exists, or create new one
        room = room_manager.create_room(room_id)
        
        return {
            "success": True,
            "room_id": room.room_id,
            "message": "Room created successfully"
        }
    except Exception as e:
        print(f"Error creating room: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/room-exists")
async def check_room_exists(room_id: str):
    """检查房间是否存在"""
    try:
        if not room_id:
            return {"success": False, "exists": False, "message": "房间ID不能为空"}
        
        room = room_manager.get_room(room_id)
        exists = room is not None
        
        if exists:
            # 检查房间中是否有agents（判断是否为空房间）
            characters_info = room.scrollweaver.get_characters_info()
            has_agents = len(characters_info) > 0
            return {
                "success": True,
                "exists": True,
                "has_agents": has_agents,
                "characters_count": len(characters_info)
            }
        else:
            return {
                "success": True,
                "exists": False,
                "has_agents": False,
                "characters_count": 0
            }
    except Exception as e:
        print(f"Error checking room existence: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "exists": False, "message": str(e)}

@app.get("/api/characters")
async def get_characters(request: Request, room_id: str = None):
    """获取房间中的agents列表"""
    try:
        if room_id:
            room = room_manager.get_room(room_id)
        if not room_id or not room:
             room = room_manager.get_or_create_default_room()
        
        characters_info = room.scrollweaver.get_characters_info()
        return {"success": True, "characters": characters_info}
    except Exception as e:
        print(f"Error getting characters: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/clear-preset-agents")
async def clear_preset_agents(request: Request):
    """清空沙盒中的所有预设agents（保留用户agent）
    
    注意：只有在房间为空（没有其他用户的agents）时才应该调用此API
    """
    try:
        user_id = get_user_id_from_session(request)
        if not user_id:
            raise HTTPException(status_code=401, detail="未登录")
            
        data = await request.json()
        room_id = data.get('room_id')
        
        if room_id:
            room = room_manager.get_room(room_id)
        if not room_id or not room:
             room = room_manager.get_or_create_default_room()
        
        # 检查房间中是否有其他用户的agents
        role_codes = list(room.scrollweaver.server.role_codes)
        other_users_agents = [rc for rc in role_codes if rc.startswith('digital_twin_user_')]
        
        # 如果房间中有其他用户的agents，不应该清空（多用户场景）
        if len(other_users_agents) > 1:  # 超过1个用户agent，说明有其他用户
            return {
                "success": False,
                "message": "房间中有其他用户的agents，不能清空",
                "removed_count": 0
            }
        
        # 获取当前沙盒中的所有agents
        preset_agents_count = 0
        
        # 遍历所有agents，移除预设agents（保留用户agent）
        for role_code in role_codes:
            # 检查是否是用户agent（统一使用 digital_twin_user_ 开头）
            if not role_code.startswith('digital_twin_user_'):
                # 是预设agent，移除
                preset_agents_count += 1
                try:
                    if role_code in room.scrollweaver.server.role_codes:
                        room.scrollweaver.server.role_codes.remove(role_code)
                    if role_code in room.scrollweaver.server.performers:
                        del room.scrollweaver.server.performers[role_code]
                except Exception as e:
                     print(f"Error removing {role_code}: {e}")
        
        # 注意：不需要重置generator_initialized，agent移除会在下一个轮次生效
        
        characters_info = room.scrollweaver.get_characters_info()
        
        # Broadcast update
        await room.broadcast_json({
            'type': 'characters_list',
            'data': {'characters': characters_info}
        })

        return {
            "success": True,
            "message": "已清空所有NPC",
            "removed_count": preset_agents_count,
            "characters": characters_info
        }
    except Exception as e:
        print(f"Error clearing preset agents: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/api/add-preset-npc")
async def add_preset_npc(request: Request):
    """添加预设NPC到沙盒"""
    try:
        data = await request.json()
        preset_id = data.get('preset_id')
        custom_name = data.get('custom_name')
        
        # Room support
        room_id = data.get('room_id') or "default"
        
        if not preset_id:
            raise HTTPException(status_code=400, detail="Missing preset_id")
            
        preset = PresetAgents.get_preset_by_id(preset_id)
        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")
        
        room = room_manager.get_or_create_default_room() if room_id == "default" else room_manager.get_room(room_id)
        if not room:
             room = room_manager.create_room(room_id)

        # 生成唯一的 role_code
        # 使用更短的随机码，避免 prompt 过长
        suffix = str(uuid.uuid4())[:6]
        role_code = f"{preset['id']}_{suffix}"
        
        role_name = custom_name or preset['name']
        
        # 调用 Server API 添加 NPC
        room.scrollweaver.server.add_npc_agent(
            role_code=role_code,
            role_name=role_name,
            preset_config=preset,  # 传递完整配置
            preset_id=preset_id,
            initial_location="location_lounge" # 默认位置
        )
        
        # 强制更新一次状态
        characters_info = room.scrollweaver.get_characters_info()
        
        # Broadcast update
        await room.broadcast_json({
            'type': 'characters_list',
            'data': {'characters': characters_info}
        })
        
        # 获取agent实例以获取完整信息
        agent = room.scrollweaver.server.performers.get(role_code)
        
        # 构建完整的agent_info，包含preset数据（用于前端profile显示）
        agent_info = {
            "role_code": role_code,
            "role_name": role_name,
            "nickname": role_name,
            "preset": preset,  # 包含完整的预设数据（big_five, values, mbti等）
            "profile": preset.get("description", ""),
            "description": preset.get("description", ""),
            "source": "soulverse_npc"
        }
        
        # 如果agent存在，添加额外信息
        if agent:
            if hasattr(agent, 'personality_profile'):
                # 添加personality_profile数据
                agent_info["personality_profile"] = agent.personality_profile.to_dict()
            if hasattr(agent, 'role_profile'):
                agent_info["profile"] = agent.role_profile or preset.get("description", "")
        
        return {
            "success": True, 
            "role_code": role_code, 
            "role_name": role_name,
            "agent_info": agent_info,  # 返回完整的agent_info
            "characters": characters_info
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error adding preset NPC: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/neural-match")
async def neural_match(request: Request):
    """神经元匹配：计算用户数字孪生与预设 agents 的匹配度"""
    try:
        user_id = get_user_id_from_session(request)
        if not user_id:
            raise HTTPException(status_code=401, detail="未登录")
        
        # 获取用户的数字孪生
        user_file = os.path.join(USERS_DIR, f"{user_id}.json")
        if not os.path.exists(user_file):
            raise HTTPException(status_code=404, detail="用户尚未创建数字孪生")
        
        user_data = load_json_file(user_file)
        digital_twin = user_data.get('digital_twin')
        if not digital_twin:
            raise HTTPException(status_code=404, detail="用户尚未创建数字孪生")
        
        # 获取所有预设 agents
        preset_templates = PresetAgents.get_preset_templates()
        
        # 构建用户 agent 的 profile（用于匹配计算）
        # 优先使用 personality 字段 (新版结构)
        personality = digital_twin.get('personality', {})
        generated_traits = digital_twin.get('generated_profile', {}).get('core_traits', {})
        extracted_profile = digital_twin.get('extracted_profile', {})
        
        user_profile = {
            "mbti": personality.get('mbti') or generated_traits.get('mbti') or extracted_profile.get('mbti', ''),
            "interests": extracted_profile.get('interests', []) or personality.get('values', []) or generated_traits.get('values', []),
            "social_goals": extracted_profile.get('social_goals', []) or personality.get('values', []) or generated_traits.get('values', []),
            "personality": personality.get('big_five') or generated_traits.get('big_five') or extracted_profile.get('personality', '')
        }
        
        # 计算匹配度
        matches = []
        
        # 调试输出：用户profile
        print(f"\n========== Neural Matching Debug ==========")
        print(f"User Profile:")
        print(f"  MBTI: {user_profile.get('mbti')}")
        print(f"  Big Five: {user_profile.get('personality')}")
        print(f"  Interests: {user_profile.get('interests')[:3] if user_profile.get('interests') else 'None'}...")
        print(f"  Values: {user_profile.get('social_goals')[:3] if user_profile.get('social_goals') else 'None'}...")
        print(f"==========================================\n")
        
        # 预计算用户Embedding（避免重复计算）
        user_embeddings = {}
        # Use default room for embedding model access
        default_room = room_manager.get_or_create_default_room()
        embedding_model = default_room.scrollweaver.server.embedding
        
        if embedding_model:
            try:
                # 准备用户文本数据
                user_interests_text = " ".join(user_profile.get("interests", []))
                user_values_text = " ".join(user_profile.get("social_goals", [])) # Values usually in social_goals or values
                user_goals_text = " ".join(user_profile.get("social_goals", []))
                
                # 批量生成Embedding
                texts_to_embed = [t for t in [user_interests_text, user_values_text, user_goals_text] if t]
                if texts_to_embed:
                    embeddings = embedding_model(texts_to_embed)
                    idx = 0
                    if user_interests_text:
                        user_embeddings["interests"] = embeddings[idx]
                        idx += 1
                    if user_values_text:
                        user_embeddings["values"] = embeddings[idx]
                        idx += 1
                    if user_goals_text:
                        user_embeddings["goals"] = embeddings[idx]
                        idx += 1
            except Exception as e:
                print(f"Error generating user embeddings: {e}")

        for preset in preset_templates:
            preset_profile = {
                "interests": preset.get('interests', []),
                "mbti": preset.get('mbti', ''),
                "social_goals": preset.get('social_goals', []),
                "personality": preset.get('personality', ''),
                "big_five": preset.get('big_five', {}),
                "values": preset.get('values', [])
            }
            
            # 使用高级匹配算法
            # 获取预设Agent的Embedding (带缓存)
            preset_embeddings = PresetAgents.get_preset_embeddings(preset, embedding_model)
            
            compatibility_result = calculate_advanced_compatibility(user_profile, preset_profile, user_embeddings, preset_embeddings)
            compatibility = compatibility_result['score']
            breakdown = compatibility_result['breakdown']
            
            # 调试输出：每个preset的匹配度
            # print(f"[Match] {preset.get('name'):15s} | MBTI: {preset.get('mbti'):4s} | Score: {compatibility*100:5.1f}%")
            # print(f"  Breakdown: {breakdown}")
            
            # 获取预设 agent 的动漫化图片（如果有）
            anime_images = None
            # 注意：预设 agents 可能没有动漫化图片，只有用户数字孪生才有
            
            matches.append({
                "id": preset.get('id'),
                "name": preset.get('name'),
                "role": preset.get('description', ''),
                "match": round(compatibility * 100),
                "match_breakdown": breakdown,  # 添加详细breakdown
                "avatar": get_avatar_color(preset.get('id')),
                "status": "online",
                "preset": preset
            })
        
        # 按匹配度排序
        matches.sort(key=lambda x: x['match'], reverse=True)
        
        # 调试输出：排序后的结果
        print(f"\n========== Sorted Matches ==========")
        for i, match in enumerate(matches[:5], 1):
            print(f"{i}. {match['name']:15s} | {match['match']}%")
        print(f"====================================\n")
        
        # Top 3 完美共鸣
        top_matches = matches[:3]
        
        # 2 个随机遭遇（从匹配度较低的agents中选择，增加多样性）
        import random
        # 从后50%的agents中随机选择（真正的"偶然遭遇"，不是高匹配）
        all_remaining = matches[3:]
        if len(all_remaining) >= 4:
            # 如果剩余agents足够多，从后半部分（低匹配度）中随机选择
            lower_half_start = len(all_remaining) // 2
            random_pool = all_remaining[lower_half_start:]
            random_encounters = random.sample(random_pool, min(2, len(random_pool)))
        elif len(all_remaining) >= 2:
            # agents不够多，就从所有剩余中随机选
            random_encounters = random.sample(all_remaining, 2)
        elif len(all_remaining) == 1:
            random_encounters = all_remaining
        else:
            random_encounters = []
        
        return {
            "success": True,
            "matched_twins": top_matches,
            "random_twins": random_encounters
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in neural_match: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

def calculate_advanced_compatibility(profile1: dict, profile2: dict, user_embeddings: dict = None, preset_embeddings: dict = None) -> float:
    """
    高级匹配度计算算法 (Scheme C + B)
    综合考量：性格共鸣(40%) + 价值观契合(35%) + 兴趣重叠(15%) + 社交目标(10%)
    """
    import numpy as np
    
    scores = []
    
    # --- 1. 性格共鸣 (Personality Resonance) - 权重 40% ---
    # 包含 Big Five 距离 (25%) + MBTI 互补性 (15%)
    
    # A. Big Five 距离 (欧几里得距离)
    bf1 = profile1.get('personality', {})
    bf2 = profile2.get('big_five', {})
    
    # 确保是字典且有数据
    if not isinstance(bf1, dict): bf1 = {}
    if not isinstance(bf2, dict): bf2 = {}
    
    dims = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']
    dist_sq = 0
    valid_dims = 0
    
    for dim in dims:
        v1 = bf1.get(dim)
        v2 = bf2.get(dim)
        if v1 is not None and v2 is not None:
            # 归一化差异 (假设输入是0-1)
            diff = float(v1) - float(v2)
            dist_sq += diff * diff
            valid_dims += 1
            
    if valid_dims > 0:
        # 计算平均距离
        avg_dist = np.sqrt(dist_sq / valid_dims)
        # 距离越小越好，转换为相似度 (0-1)
        # 使用更强的高斯核函数增加区分度: gamma从2.0提升到5.0
        bf_score = np.exp(-5.0 * (avg_dist ** 2))
    else:
        bf_score = 0.3 # 默认降低（从0.5降至0.3），缺失数据时匹配度更低
        
    # B. MBTI 互补性
    mbti1 = profile1.get('mbti', '')
    mbti2 = profile2.get('mbti', '')
    mbti_score = 0.3  # 默认降低
    
    if mbti1 and mbti2 and len(mbti1) == 4 and len(mbti2) == 4:
        # E/I: 互补更好 (Different is better)
        s_ei = 1.0 if mbti1[0] != mbti2[0] else 0.5  # 降低"相同"的分数
        # N/S: 相同更好 (Same is better) - 沟通基础
        s_ns = 1.0 if mbti1[1] == mbti2[1] else 0.3  # 增加惩罚
        # T/F: 互补或相同皆可，视情况而定，这里暂定相同稍好
        s_tf = 0.7 if mbti1[2] == mbti2[2] else 0.5
        # J/P: 互补通常有助于生活协作，但在闲聊中相同可能更轻松
        s_jp = 0.7 if mbti1[3] == mbti2[3] else 0.5
        
        mbti_score = (s_ei * 0.3 + s_ns * 0.4 + s_tf * 0.15 + s_jp * 0.15)
        
    personality_resonance = bf_score * 0.6 + mbti_score * 0.4
    scores.append(('personality', personality_resonance, 0.50))  # 提升到50%权重
    
    # --- 2. 语义匹配 (Semantic Matching) ---
    # 辅助函数：计算余弦相似度
    def cosine_sim(vec1, vec2):
        if vec1 is None or vec2 is None: return 0.3  # 降低默认值
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        if norm1 == 0 or norm2 == 0: return 0.0
        return np.dot(vec1, vec2) / (norm1 * norm2)

    # A. 价值观契合 (Values Alignment) - 权重 35%
    values_score = 0.3  # 降低默认值
    if user_embeddings and "values" in user_embeddings and preset_embeddings and "values" in preset_embeddings:
        try:
            raw_sim = cosine_sim(user_embeddings["values"], preset_embeddings["values"])
            # 激进的非线性映射：余弦相似度天生偏高，需要强力压制
            # 使用指数惩罚: score = (raw_sim - 0.5)^3 if > 0.5
            if raw_sim > 0.85:
                values_score = 0.7 + (raw_sim - 0.85) * 2.0  # 0.85-1.0 → 0.7-1.0
            elif raw_sim > 0.75:
                values_score = 0.4 + (raw_sim - 0.75) * 3.0  # 0.75-0.85 → 0.4-0.7
            elif raw_sim > 0.65:
                values_score = 0.2 + (raw_sim - 0.65) * 2.0  # 0.65-0.75 → 0.2-0.4
            elif raw_sim > 0.5:
                values_score = (raw_sim - 0.5) * 1.33        # 0.5-0.65 → 0-0.2
            else:
                values_score = 0.0
        except:
            pass
    else:
        # 回退到 Jaccard
        v1 = set(profile1.get('social_goals', [])) # User values often in social_goals
        v2 = set(profile2.get('values', []))
        if v1 and v2:
            values_score = len(v1 & v2) / len(v1 | v2)
            
    scores.append(('values', values_score, 0.30))  # 降低权重
    
    # B. 兴趣重叠 (Interests Overlap) - 权重 15%
    interests_score = 0.3  # 降低默认值
    if user_embeddings and "interests" in user_embeddings and preset_embeddings and "interests" in preset_embeddings:
        try:
            raw_sim = cosine_sim(user_embeddings["interests"], preset_embeddings["interests"])
            # 应用同样激进的映射
            if raw_sim > 0.8:
                interests_score = 0.6 + (raw_sim - 0.8) * 2.0
            elif raw_sim > 0.65:
                interests_score = 0.3 + (raw_sim - 0.65) * 2.0
            elif raw_sim > 0.5:
                interests_score = (raw_sim - 0.5) * 2.0
            else:
                interests_score = 0.0
        except:
            pass
    else:
        # 回退到 Jaccard
        i1 = set(profile1.get('interests', []))
        i2 = set(profile2.get('interests', []))
        if i1 and i2:
            interests_score = len(i1 & i2) / len(i1 | i2)
            
    scores.append(('interests', interests_score, 0.10))  # 降低权重
    
    # C. 社交目标 (Social Goals) - 权重 10%
    goals_score = 0.3  # 降低默认值
    if user_embeddings and "goals" in user_embeddings and preset_embeddings and "goals" in preset_embeddings:
        try:
            raw_sim = cosine_sim(user_embeddings["goals"], preset_embeddings["goals"])
            # 应用最激进的映射（因为这个维度区分度最差）
            if raw_sim > 0.85:
                goals_score = 0.7 + (raw_sim - 0.85) * 2.0
            elif raw_sim > 0.7:
                goals_score = 0.3 + (raw_sim - 0.7) * 2.67
            elif raw_sim > 0.5:
                goals_score = (raw_sim - 0.5) * 1.5
            else:
                goals_score = 0.0
        except:
            pass
    else:
        # 回退到 Jaccard
        g1 = set(profile1.get('social_goals', []))
        g2 = set(profile2.get('social_goals', []))
        if g1 and g2:
            goals_score = len(g1 & g2) / len(g1 | g2)
            
    scores.append(('goals', goals_score, 0.10))
    
    # 计算加权总分
    total_score = sum(score * weight for _, score, weight in scores)
    
    # 调试输出：各维度得分
    debug_output = f"  P:{scores[0][1]:.2f}({scores[0][2]}) V:{scores[1][1]:.2f}({scores[1][2]}) I:{scores[2][1]:.2f}({scores[2][2]}) G:{scores[3][1]:.2f}({scores[3][2]}) => Total:{total_score:.3f}"
    
    # 应用非线性映射，进一步拉大区分度
    # 使用sigmoid风格的映射
    import random
    # 将0.3-0.9的原始分数映射到0.1-0.99
    if total_score > 0.6:
        # 高分区：0.6-1.0 → 0.65-0.99
        mapped_score = 0.65 + (total_score - 0.6) * 0.85
    elif total_score > 0.4:
        # 中分区：0.4-0.6 → 0.35-0.65
        mapped_score = 0.35 + (total_score - 0.4) * 1.5
    else:
        # 低分区：0.0-0.4 → 0.1-0.35
        mapped_score = 0.1 + total_score * 0.625
    
    # 添加小的随机扰动，避免分数完全相同
    jitter = random.uniform(-0.03, 0.03)
    final_score = max(0.05, min(0.99, mapped_score + jitter))
    
    # 输出映射后的分数
    print(debug_output + f" | Mapped:{mapped_score:.3f} Final:{final_score:.3f}")
    
    # 返回最终分数和详细breakdown
    return {
        'score': final_score,
        'breakdown': {
            'personality': round(scores[0][1] * 100, 1),
            'values': round(scores[1][1] * 100, 1),
            'interests': round(scores[2][1] * 100, 1),
            'goals': round(scores[3][1] * 100, 1)
        }
    }

def get_avatar_color(preset_id: str) -> str:
    """根据预设ID返回头像颜色类"""
    color_map = {
        "preset_001": "bg-purple-500",
        "preset_002": "bg-blue-500",
        "preset_003": "bg-pink-500",
        "preset_004": "bg-indigo-600",
        "preset_005": "bg-red-600",
        "preset_006": "bg-cyan-500",
        "preset_007": "bg-yellow-500",
        "preset_008": "bg-green-500",
        "preset_009": "bg-orange-500",
        "preset_010": "bg-teal-500",
        "preset_011": "bg-violet-500",
        "preset_012": "bg-rose-500"
    }
    return color_map.get(preset_id, "bg-slate-500")

@app.post("/api/reset-all")
async def reset_all(request: Request):
    """重置所有内容：清除所有soulverse角色数据和状态"""
    try:
        data = await request.json()
        room_id = data.get('room_id')
        
        # If room_id provided, only reset that room?
        # Or if "all" implies server-wide...
        # Let's assume room-specific for safety in multi-user.
        
        rooms_to_reset = []
        if room_id:
            room = room_manager.get_room(room_id)
            if room:
                rooms_to_reset.append(room)
        else:
            # Reset default room if exists
            room = room_manager.get_room("default")
            if room:
                rooms_to_reset.append(room)
                
        for room in rooms_to_reset:
             # Stop tasks
            await room.cleanup()
            
            # Re-init? 
            # Ideally we delete the room and let client reconnect/recreate.
            room_manager.delete_room(room.room_id)
            
        # Clean up files? Use caution.
        # Original code deleted "data/roles/soulverse_npcs". 
        # This affects ALL rooms if they share disk storage.
        # If we want to support true multi-user isolation, we should probably namespace storage by room_id.
        # For now, we SKIP deleting disk files to avoid destroying other rooms' data,
        # unless we are sure.
        
        # If no room_id, maybe we do a global cleanup (old behavior)?
        if not room_id:
            # Global cleanup logic from old code
            # ... (omitted for safety, better to manually clean)
            pass
            
        return {
            "success": True,
            "message": "房间已重置"
        }
    except Exception as e:
        print(f"Error in reset_all: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
