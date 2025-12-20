import asyncio
from fastapi import WebSocket
from typing import Dict, List, Optional
import uuid
import os
from datetime import datetime, timedelta
from functools import partial
from ScrollWeaver import ScrollWeaver
from sw_utils import is_image, load_json_file

# Load config similar to server.py
config = load_json_file('config.json')
default_icon_path = './frontend/assets/images/default-icon.jpg'

class Room:
    def __init__(self, room_id: str, preset_path: str = None):
        self.room_id = room_id
        self.active_connections: Dict[str, WebSocket] = {}  # client_id -> WebSocket
        self.story_task: Optional[asyncio.Task] = None
        
        # Room state
        self.user_selected_roles: Dict[str, str] = {}  # client_id -> role_code
        self.waiting_for_input: Dict[str, bool] = {}  # client_id -> bool
        self.pending_user_inputs: Dict[str, asyncio.Future] = {}  # client_id -> Future
        self.possession_mode: Dict[str, bool] = {}  # client_id -> bool
        self.user_agents: Dict[str, str] = {}  # user_id -> role_code
        self.pending_display_message: Dict[str, dict] = {}
        
        self.last_empty_time: Optional[datetime] = datetime.now() # Start empty
        self.conversation_ended: bool = False  # 对话是否已结束（所有用户退出）
        
        
        # Initialize ScrollWeaver
        self._init_scrollweaver(preset_path)
        
    def _init_scrollweaver(self, preset_path: str = None):
        if not preset_path:
             if "preset_path" in config and config["preset_path"] and os.path.exists(config["preset_path"]):
                preset_path = config["preset_path"]
             elif "genre" in config and config["genre"]:
                genre = config["genre"]
                preset_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), f"config/experiment_{genre}.json")
             else:
                preset_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 
                                          'experiment_presets/soulverse_sandbox.json')
        
        if not os.path.exists(preset_path):
             print(f"Warning: Preset path {preset_path} does not exist. Using default.")
             # Fallback logic could be added here
        
        print(f"Initializing Room {self.room_id} with preset: {preset_path}")
        
        self.scrollweaver = ScrollWeaver(
            preset_path=preset_path,
            world_llm_name=config["world_llm_name"],
            role_llm_name=config["role_llm_name"],
            embedding_name=config["embedding_model_name"]
        )
        
        self.generator_config = {
            "rounds": config.get("rounds", 100) if self.scrollweaver.server.is_soulverse_mode else config.get("rounds", 10),
            "save_dir": config.get("save_dir", ""),
            "if_save": config.get("if_save", 0),
            "mode": "free",
            "scene_mode": 1,
        }
        self.generator_initialized = False

    async def connect(self, websocket: WebSocket, client_id: str, user_id: str = None):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        
        # If room was empty, mark as active and resume story loop if needed
        was_empty = self.last_empty_time is not None
        was_conversation_ended = self.conversation_ended
        

        if user_id:
            # 自动绑定用户数字孪生
            role_code = None
            
            # 检查用户是否已有agent在这个房间
            if user_id in self.user_agents:
                role_code = self.user_agents[user_id]
                # 验证agent是否仍然存在
                if role_code not in self.scrollweaver.server.role_codes:
                    # Agent不存在，需要重新恢复
                    role_code = None
                    del self.user_agents[user_id]
            
            # 如果没有role_code，尝试从用户数据恢复
            digital_twin = None
            if not role_code:
                try:
                    from sw_utils import load_json_file
                    import os
                    USERS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'data', 'users')
                    user_file = os.path.join(USERS_DIR, f"{user_id}.json")
                    if os.path.exists(user_file):
                        user_data = load_json_file(user_file)
                        digital_twin = user_data.get('digital_twin')
                        if digital_twin and digital_twin.get('role_code'):
                            role_code = digital_twin['role_code']
                            # 验证role_code格式
                            if not role_code.startswith('digital_twin_user_'):
                                print(f"[Room {self.room_id}] Warning: Invalid role_code format for user {user_id}: {role_code}")
                                role_code = None
                                digital_twin = None
                except Exception as e:
                    print(f"[Room {self.room_id}] Error loading user data for {user_id}: {e}")
                    role_code = None
                    digital_twin = None
            
            if role_code:
                # 确保agent在沙盒中
                if role_code not in self.scrollweaver.server.role_codes:
                    # 自动恢复agent到沙盒
                    try:
                        # 如果还没有加载digital_twin，现在加载
                        if not digital_twin:
                            from sw_utils import load_json_file
                            import os
                            USERS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'data', 'users')
                            user_file = os.path.join(USERS_DIR, f"{user_id}.json")
                            if os.path.exists(user_file):
                                user_data = load_json_file(user_file)
                                digital_twin = user_data.get('digital_twin')
                        
                        if not digital_twin:
                            raise ValueError(f"Digital twin data not found for user {user_id}")
                        
                        from modules.soul_api_mock import get_soul_profile
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
                        user_agent = self.scrollweaver.server.add_user_agent(
                            user_id=user_id,
                            role_code=role_code,
                            soul_profile=soul_profile
                        )
                        
                        # 记录用户 Agent 映射
                        self.user_agents[user_id] = role_code
                        self.user_selected_roles[client_id] = role_code
                        print(f"[Room {self.room_id}] Auto-restored and linked User Agent {role_code} (User {user_id})")
                    except Exception as e:
                        print(f"[Room {self.room_id}] Error auto-restoring user agent: {e}")
                        import traceback
                        traceback.print_exc()
                        # 通知前端需要手动恢复
                        try:
                            await websocket.send_json({
                                'type': 'agent_restore_needed',
                                'data': {'role_code': role_code, 'message': 'Agent恢复失败，请重试'}
                            })
                        except Exception as send_error:
                            print(f"[Room {self.room_id}] Error sending agent_restore_needed: {send_error}")
                else:
                    # Agent已存在，直接绑定
                    self.user_selected_roles[client_id] = role_code
                    self.user_agents[user_id] = role_code
                    print(f"[Room {self.room_id}] Auto-linked Client {client_id} to User Agent {role_code} (User {user_id})")
            else:
                print(f"[Room {self.room_id}] User {user_id} has no digital twin, cannot auto-bind")
                # 通知前端需要创建数字孪生
                try:
                    await websocket.send_json({
                        'type': 'no_digital_twin',
                        'data': {'message': '请先创建数字孪生'}
                    })
                except Exception as e:
                    print(f"[Room {self.room_id}] Error sending no_digital_twin message: {e}")
                
            # Store client_id for this user (for later lookups)
            self.user_client_map = getattr(self, 'user_client_map', {})
            if user_id not in self.user_client_map:
                self.user_client_map[user_id] = set()
            self.user_client_map[user_id].add(client_id)
        
        # Move start_story_loop to here, AFTER agent is added
        if was_empty or was_conversation_ended:
            # 重置对话结束标志，恢复对话
            self.last_empty_time = None
            self.conversation_ended = False
            print(f"[Room {self.room_id}] Client {client_id} connected, {'resuming' if was_conversation_ended else 'starting'} story loop")
            # Ensure story loop is running
            await self.start_story_loop()
        
    async def disconnect(self, client_id: str):
        """断开客户端连接并清理相关状态"""
        was_waiting_input = client_id in self.waiting_for_input and self.waiting_for_input.get(client_id, False)
        role_code = self.user_selected_roles.get(client_id)
        
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            
        if not self.active_connections:
            # 所有用户已退出，结束对话
            self.last_empty_time = datetime.now()
            self.conversation_ended = True
            print(f"[Room {self.room_id}] All clients disconnected, conversation ended")
            # 注意：此时没有active_connections，无法广播消息
            # 对话结束标志会在_story_loop()中检测并处理
        
        # Clean up client specific state
        if client_id in self.user_selected_roles:
            del self.user_selected_roles[client_id]
            # 注意：role_selection_map广播已移除，因为用户数字孪生自动绑定，无需手动选择
        
        # If client was waiting for input, trigger timeout handling
        if was_waiting_input and client_id in self.pending_user_inputs:
            future = self.pending_user_inputs[client_id]
            if not future.done():
                # Cancel the future to trigger timeout handling
                future.cancel()
                # Notify other users that this user disconnected
                try:
                    await self.broadcast_json({
                        'type': 'system',
                        'data': {'message': f'用户已断开连接，已自动使用AI回复'}
                    })
                except Exception as e:
                    print(f"[Room {self.room_id}] Error broadcasting disconnect notification: {e}")
        
        if client_id in self.waiting_for_input:
            del self.waiting_for_input[client_id]
        if client_id in self.pending_user_inputs:
            if not self.pending_user_inputs[client_id].done():
                self.pending_user_inputs[client_id].cancel()
            del self.pending_user_inputs[client_id]
        
        if client_id in self.possession_mode:
            del self.possession_mode[client_id]
        
        print(f"[Room {self.room_id}] Client {client_id} disconnected (was waiting input: {was_waiting_input})")

    async def broadcast_json(self, data: dict):
        """Send JSON to all connected clients"""
        if not self.active_connections:
            print(f"[Room {self.room_id}] Warning: broadcast_json called but no active connections")
            return
            
        disconnected = []
        for cid, ws in list(self.active_connections.items()):  # Use list() to avoid modification during iteration
            try:
                await ws.send_json(data)
            except Exception as e:
                print(f"[Room {self.room_id}] Error broadcasting to {cid}: {e}")
                disconnected.append(cid)
        
        # Disconnect clients that failed - do this synchronously to avoid recursion
        for cid in disconnected:
            if cid in self.active_connections:
                del self.active_connections[cid]
            if not self.active_connections:
                self.last_empty_time = datetime.now()
            
            # Clean up client state without async broadcast to avoid recursion
            if cid in self.user_selected_roles:
                del self.user_selected_roles[cid]
            if cid in self.waiting_for_input:
                del self.waiting_for_input[cid]
            if cid in self.pending_user_inputs:
                if not self.pending_user_inputs[cid].done():
                    self.pending_user_inputs[cid].cancel()
                del self.pending_user_inputs[cid]
            if cid in self.possession_mode:
                del self.possession_mode[cid]

    async def cleanup(self):
        """Cleanup room resources"""
        if self.story_task:
            self.story_task.cancel()
            try:
                await self.story_task
            except asyncio.CancelledError:
                pass
        
        for cid in list(self.active_connections.keys()):
            await self.active_connections[cid].close()
            del self.active_connections[cid]

    # ... Include logic from ConnectionManager but adapted for Room ...
    # Specifically, generate_story should loop and broadcast
    
    def _ensure_generator_initialized(self):
        if not self.generator_initialized:
            if len(self.scrollweaver.server.role_codes) == 0:
                return False
            
            self.scrollweaver.set_generator(
                rounds=self.generator_config["rounds"],
                save_dir=self.generator_config["save_dir"],
                if_save=self.generator_config["if_save"],
                mode=self.generator_config["mode"],
                scene_mode=self.generator_config["scene_mode"]
            )
            self.generator_initialized = True
            return True
        return True

    async def get_next_message(self):
        # ... logic from ConnectionManager.get_next_message ...
        if not self._ensure_generator_initialized():
            return None, None
        
        max_attempts = 10
        attempts = 0
        loop = asyncio.get_running_loop()

        while attempts < max_attempts:
            try:
                # 同步当前房间中被用户选中的角色到 ScrollWeaver，使其可识别多用户占位符
                # 在消息生成前立即同步，减少竞态条件窗口
                sync_success = False
                try:
                    selected = set(self.user_selected_roles.values()) if self.user_selected_roles else set()
                    # 存为可序列化的列表或集合，ScrollWeaver 支持 `_user_role_codes`
                    self.scrollweaver.server._user_role_codes = list(selected)
                    
                    # 同步 possession 模式到 ScrollWeaver（按 role）
                    # 统一按角色管理：每个角色只有一个possession状态（取第一个控制该角色的客户端状态）
                    # 注意：逻辑反转
                    # - room.possession_mode[cid] = True 表示"用户控制"（前端enabled=true）
                    # - ScrollWeaver.possession_modes[role] = True 表示"AI接管"（AI自由行动）
                    # 所以需要反转：用户控制 → AI不接管(False)，AI自由 → AI接管(True)
                    pos_map = {}
                    role_to_client = {}  # 用于追踪角色到客户端的映射
                    
                    for cid, role in self.user_selected_roles.items():
                        if role:
                            # 如果角色还没有possession状态，则设置
                            if role not in pos_map:
                                # 反转逻辑：前端possession_mode=True(用户控制) → ScrollWeaver False(AI不接管)
                                user_control = bool(self.possession_mode.get(cid, False))
                                pos_map[role] = not user_control  # AI接管 = 不是用户控制
                                role_to_client[role] = cid
                            # 如果当前客户端有possession模式，覆盖之前的状态（确保一致性）
                            else:
                                # 如果当前客户端是用户控制模式，则AI不接管
                                user_control = bool(self.possession_mode.get(cid, False))
                                pos_map[role] = not user_control
                                role_to_client[role] = cid
                    
                    # 验证：确保possession状态一致性
                    # 如果同一个角色被多个客户端控制，使用第一个有possession的客户端状态
                    for role in selected:
                        if role not in pos_map:
                            # 如果没有找到possession状态，默认为False（用户控制，AI不接管）
                            pos_map[role] = False
                    
                    self.scrollweaver.server.possession_modes = pos_map
                    self.scrollweaver.server._possession_mode_by_role = pos_map
                    # 兼容性全局标志：any(pos_map.values()) 表示是否有任何角色是AI接管模式
                    self.scrollweaver.server._possession_mode = any(pos_map.values()) if pos_map else False
                    
                    # 验证同步是否成功
                    if hasattr(self.scrollweaver.server, '_user_role_codes'):
                        sync_success = True
                    else:
                        print(f"[Room {self.room_id}] Warning: Failed to verify role codes sync")
                except Exception as e:
                    print(f"[Room {self.room_id}] Error syncing user roles and possession modes: {e}")
                    import traceback
                    traceback.print_exc()
                    # 如果同步失败，重试
                    if attempts < max_attempts - 1:
                        attempts += 1
                        await asyncio.sleep(0.1)  # 短暂等待后重试
                        continue
                
                # Execute blocking generator in a separate thread
                # Note: generate_next_message is synchronous and cpu/io bound (LLM calls)
                # 只有在同步成功后才执行消息生成
                if sync_success:
                    try:
                        message = await loop.run_in_executor(None, self.scrollweaver.generate_next_message)
                    except RuntimeError as e:
                        # Python 3.7+ wraps StopIteration in RuntimeError when raised from generator in executor
                        if "StopIteration" in str(e) or isinstance(e.__cause__, StopIteration):
                            print(f"[Room {self.room_id}] Message generator exhausted (StopIteration wrapped in RuntimeError)")
                            return None, None
                        raise
                    except StopIteration:
                        # Generator exhausted - normal end condition
                        print(f"[Room {self.room_id}] Message generator exhausted")
                        return None, None
                else:
                    # 如果同步失败且已达到最大重试次数，返回None
                    return None, None
                
            except StopIteration:
                # Generator exhausted - normal end condition
                print(f"[Room {self.room_id}] Message generator exhausted")
                return None, None
            except RuntimeError as e:
                # Handle StopIteration wrapped in RuntimeError (Python 3.7+)
                if "StopIteration" in str(e) or isinstance(getattr(e, '__cause__', None), StopIteration):
                    print(f"[Room {self.room_id}] Message generator exhausted (StopIteration wrapped in RuntimeError)")
                    return None, None
                raise
            except AttributeError as e:
                # Catching thread execution errors might wrap them, but here we assume direct usage
                if "generator" in str(e):
                    # Generator not initialized - recoverable error
                    print(f"[Room {self.room_id}] Generator not initialized, retrying...")
                    if attempts < max_attempts - 1:
                        attempts += 1
                        await asyncio.sleep(0.5)
                        continue
                    return None, None
                # Other AttributeError - potentially fatal
                print(f"[Room {self.room_id}] Fatal AttributeError in message generation: {e}")
                import traceback
                traceback.print_exc()
                raise
            except TimeoutError as e:
                # API timeout - Gemini layer already retried, so this is a final failure
                print(f"[Room {self.room_id}] API timeout after Gemini layer retries: {e}")
                # Broadcast error to clients
                try:
                    await self.broadcast_json({
                        'type': 'error',
                        'data': {'message': 'API调用超时，请稍后重试'}
                    })
                except:
                    pass
                return None, None
            except Exception as e:
                # Categorize errors
                error_str = str(e).lower()
                error_type = type(e).__name__
                
                # Check for recoverable errors (timeout is handled separately above, so not included here)
                is_recoverable = any(keyword in error_str for keyword in [
                    'network', 'connection', 'temporary', 'retry', 'rate limit',
                    'service unavailable', '503', '502', '504'
                ])
                
                if is_recoverable:
                    # Recoverable error - retry with backoff
                    print(f"[Room {self.room_id}] Recoverable error in message generation (attempt {attempts + 1}/{max_attempts}): {error_type}: {e}")
                    if attempts < max_attempts - 1:
                        attempts += 1
                        wait_time = min(1.0 * attempts, 5.0)
                        print(f"[Room {self.room_id}] Retrying after {wait_time}s...")
                        await asyncio.sleep(wait_time)
                        continue
                    else:
                        print(f"[Room {self.room_id}] Max retries reached for recoverable error")
                        # Broadcast error to clients
                        try:
                            await self.broadcast_json({
                                'type': 'error',
                                'data': {'message': f'服务暂时不可用: {str(e)[:100]}'}
                            })
                        except:
                            pass
                        return None, None
                else:
                    # Potentially fatal error - log and decide
                    print(f"[Room {self.room_id}] Error in async generation: {error_type}: {e}")
                    import traceback
                    traceback.print_exc()
                    
                    # Check if it's a StopIteration wrapped in RuntimeError
                    if isinstance(e, StopIteration) or (isinstance(e, RuntimeError) and "StopIteration" in str(e)):
                        return None, None
                    
                    # For other errors, retry if attempts remain
                    if attempts < max_attempts - 1:
                        attempts += 1
                        await asyncio.sleep(0.5)
                        continue
                    else:
                        # Fatal error after max attempts
                        print(f"[Room {self.room_id}] Fatal error after {max_attempts} attempts: {e}")
                        # Broadcast error to clients
                        try:
                            await self.broadcast_json({
                                'type': 'error',
                                'data': {'message': f'消息生成失败: {str(e)[:100]}'}
                            })
                        except:
                            pass
                        return None, None
            
            if message is None:
                print(f"[Room {self.room_id}] get_next_message: message is None (attempt {attempts + 1}/{max_attempts})")
                attempts += 1
                continue
            
            text = message.get("text", "").strip()
            if text == "__USER_INPUT_PLACEHOLDER__":
                message["is_placeholder"] = True
                status = self.scrollweaver.get_current_status()
                print(f"[Room {self.room_id}] get_next_message: got placeholder for user input")
                return message, status
            
            if not text:
                print(f"[Room {self.room_id}] get_next_message: message text is empty (attempt {attempts + 1}/{max_attempts})")
                attempts += 1
                continue

            if not os.path.exists(message.get("icon", "")) or not is_image(message.get("icon", "")):
                message["icon"] = default_icon_path
            
            status = self.scrollweaver.get_current_status()
            print(f"[Room {self.room_id}] get_next_message: returning message with text length {len(text)}")
            return message, status
        
        return None, None
    
    def _get_role_code_by_name(self, role_name: str) -> str:
        # ... logic from ConnectionManager ...
        if not role_name:
            return None
        try:
            role_name_lower = role_name.lower().strip()
            for role_code in self.scrollweaver.server.role_codes:
                performer = self.scrollweaver.server.performers.get(role_code)
                if not performer:
                    continue
                # Safely check attributes
                performer_role_name = getattr(performer, 'role_name', None)
                performer_nickname = getattr(performer, 'nickname', None)
                if (performer_role_name and performer_role_name.lower().strip() == role_name_lower) or \
                   (performer_nickname and performer_nickname.lower().strip() == role_name_lower):
                    return role_code
        except Exception as e:
            print(f"[Room {self.room_id}] Error in _get_role_code_by_name: {e}")
            import traceback
            traceback.print_exc()
        return None

    async def handle_user_role_input(self, client_id: str, role_code: str, user_text: str, delay_display: bool = False, skip_broadcast: bool = False):
        # 权限验证：确保用户只能控制自己的数字孪生
        # 检查client_id是否绑定了这个role_code
        if self.user_selected_roles.get(client_id) != role_code:
            print(f"[Room {self.room_id}] Permission denied: Client {client_id} cannot control role {role_code}")
            return
        
        # 验证role_code格式（必须是digital_twin_user_开头）
        if not role_code.startswith('digital_twin_user_'):
            print(f"[Room {self.room_id}] Invalid role_code format: {role_code}")
            return
        
        # ... logic from ConnectionManager ...
        try:
            record_id = str(uuid.uuid4())
            self.scrollweaver.server.record(
                role_code=role_code,
                detail=user_text,
                actor=role_code,
                group=self.scrollweaver.server.current_status.get('group', [role_code]),
                actor_type='role',
                act_type="user_input",
                record_id=record_id
            )
            
            performer = self.scrollweaver.server.performers[role_code]
            username = performer.nickname if hasattr(performer, 'nickname') and performer.nickname else (performer.role_name if hasattr(performer, 'role_name') else role_code)
            # 统一消息格式：确保所有字段都存在
            message = {
                'username': username,
                'type': 'role',
                'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                'text': user_text,
                'icon': performer.icon_path if hasattr(performer, 'icon_path') and os.path.exists(performer.icon_path) and is_image(performer.icon_path) else default_icon_path,
                'uuid': record_id,
                'scene': self.scrollweaver.server.cur_round,
                'is_user': True,
                'is_timeout_replacement': False,  # 明确标记不是超时回复
                'role_code': role_code  # 添加role_code用于前端区分不同用户
            }
            
            if delay_display:
                self.pending_display_message[client_id] = message
            elif not skip_broadcast:
                await self.broadcast_json({
                    'type': 'message',
                    'data': message
                })
                status = self.scrollweaver.get_current_status()
                await self.broadcast_json({
                    'type': 'status_update',
                    'data': status
                })
        except Exception as e:
            print(f"Error handling user role input: {e}")

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
            loop = asyncio.get_running_loop()
            
            for i, config in enumerate(style_configs[:num_options]):
                max_retries = 3  # 每个选项最多重试3次
                retry_count = 0
                success = False
                
                while retry_count < max_retries and not success:
                    try:
                        # 调用Performer的plan_with_style方法生成行动，传入风格提示和温度
                        # 使用 run_in_executor 在单独的线程中执行阻塞的 LLM 调用
                        # 使用 partial 避免闭包问题
                        plan_func = partial(
                            performer.plan_with_style,
                            other_roles_info=other_roles_info,
                            available_locations=self.scrollweaver.server.orchestrator.locations,
                            world_description=self.scrollweaver.server.orchestrator.description,
                            intervention=self.scrollweaver.server.event,
                            style_hint=config['style_hint'],
                            temperature=config['temperature']
                        )
                        plan = await loop.run_in_executor(None, plan_func)
                        
                        detail = plan.get("detail", "")
                        # 检查detail是否为空或只包含空白字符
                        if detail and detail.strip():
                            options.append({
                                'index': i + 1,
                                'style': config['style'],
                                'name': config['name'],
                                'description': config['description'],
                                'text': detail
                            })
                            success = True
                        else:
                            retry_count += 1
                            if retry_count < max_retries:
                                print(f"Warning: Option {i+1} ({config['style']}) returned empty detail, retrying ({retry_count}/{max_retries-1})...")
                            else:
                                print(f"Error: Option {i+1} ({config['style']}) failed after {max_retries} attempts: detail is empty")
                    except Exception as e:
                        retry_count += 1
                        if retry_count < max_retries:
                            print(f"Error generating option {i+1} ({config['style']}), retrying ({retry_count}/{max_retries-1}): {e}")
                        else:
                            print(f"Error generating option {i+1} ({config['style']}) after {max_retries} attempts: {e}")
                            import traceback
                            traceback.print_exc()
            
            return options if options else None
        except Exception as e:
            print(f"Error in generate_auto_action_options: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def start_story_loop(self):
        """Single loop to drive the story forward for the room"""
        if self.story_task and not self.story_task.done():
            return # Already running
            
        self.story_task = asyncio.create_task(self._story_loop())
    
    async def _story_loop(self):
        print(f"[Room {self.room_id}] Starting story loop")
        try:
            if len(self.scrollweaver.server.role_codes) == 0:
                 print(f"[Room {self.room_id}] No roles found, waiting for characters...")
                 await self.broadcast_json({
                    'type': 'error',
                    'data': {'message': 'Waiting for characters...'}
                })
                 # Wait a bit or exit loop? Let's check periodically or wait for an event?
                 # For now, just exit and let 'start_story_loop' be called again when agents are added
                 return
            
            print(f"[Room {self.room_id}] Story loop started with {len(self.scrollweaver.server.role_codes)} roles: {list(self.scrollweaver.server.role_codes)}")

            while True:
                # Check active connections
                if not self.active_connections:
                    # 检查对话是否已结束
                    if self.conversation_ended:
                        # 所有用户已退出，结束对话
                        print(f"[Room {self.room_id}] Conversation ended, stopping story loop")
                        # 注意：此时没有active_connections，无法广播消息
                        # 如果有客户端重新连接，会在connect()中收到conversation_ended状态
                        break
                    else:
                        # Room is empty but conversation not ended - pause story loop to save resources
                        print(f"[Room {self.room_id}] No active connections, pausing story loop")
                        self.last_empty_time = datetime.now()
                        
                        # Wait for connections with periodic checks
                        empty_check_interval = 5  # Check every 5 seconds
                        while not self.active_connections and not self.conversation_ended:
                            await asyncio.sleep(empty_check_interval)
                            # Check if room should be cleaned up (handled by RoomManager cleanup loop)
                        
                        # 如果对话已结束，退出循环
                        if self.conversation_ended:
                            print(f"[Room {self.room_id}] Conversation ended during pause, stopping story loop")
                            break
                        
                        # Connections restored - resume story loop
                        print(f"[Room {self.room_id}] Active connections restored, resuming story loop")
                        self.last_empty_time = None
                        self.conversation_ended = False  # 重置标志
                        continue

                # Determine active user role across all clients?
                # The logic in ConnectionManager assumed one user driving one role.
                # In multiplayer, multiple users might drive multiple roles, or share.
                # Simplified: Check if ANY client has selected a role that is currently acting?
                
                # Logic adaptation:
                # pass ALL user selected roles to server?
                # server._user_role_code was a single string.
                # multiplayer support required in ScrollWeaver? 
                # Assuming simple adaptation: If the NEXT actor is controlled by ANY user, we wait.
                
                # We need to know who is controlled.
                controlled_roles = set(self.user_selected_roles.values())
                
                # We can't easily pass list of user roles to single var `_user_role_code`.
                # BUT, `ConnectionManager` passed it just before `get_next_message`.
                # `ScrollWeaver` uses `decide_next_actor`.
                # If `decide_next_actor` picks a role that is in `controlled_roles`, we handle it.
                
                # Modify ScrollWeaver state to know all user roles?
                # Or just let it pick naturally. If it picks a role X:
                # If X is in controlled_roles, we hit the placeholder logic if we set the flag.
                
                # Hack: We can set `_user_role_code` to the *likely next* or *any* for now to trigger the logic inside generator?
                # Actually, `decide_next_actor` logic in `ScrollWeaver` doesn't strictly depend on `_user_role_code` for SELECTION,
                # but `generate_next_message` checks if the SELECTED actor == `_user_role_code` to yield placeholder.
                
                # To support multiple user roles, we might need to patch ScrollWeaver or use a trick.
                # Let's assume for this step we support one acting user at a time or we need to update `ScrollWeaver` (out of scope?).
                # Wait! The generator yields tokens/messages.
                
                # If we want `ScrollWeaver` to yield placeholder for ANY user role:
                # We need to intercept the check inside `ScrollWeaver`.
                
                # Let's look at `ConnectionManager` logic again.
                # It sets `self.scrollweaver.server._user_role_code = user_role_code`.
                
                # If we have multiple users, we might need to set `_user_role_code` to a LIST or change how we invoke it.
                # Or, we just set it to the role that is about to act? We don't know who is about to act until `decide_next_actor` runs inside generator.
                
                # Workaround:
                # If we can't change `ScrollWeaver`, we might suffer.
                # But wait, `ScrollWeaver` is likely Python code we can see?
                # Yes, but avoiding deep changes there is better if possible.
                
                # Let's try to set `_user_role_code` to the set of all controlled roles if possible, or iterate?
                # Python dynamic attributes. 
                
                # Actually, simply:
                # `self.scrollweaver.server._controlled_roles = controlled_roles`
                # And we rely on `ScrollWeaver` being smart enough? Unlikely if not written that way.
                
                # Let's assume for the MVP: One "Possession" at a time globally for the room?
                # OR, we risk it not pausing for other users.
                
                # Let's peek at `server.py` lines 222 again.
                # It sets `_user_role_code`.
                
                # In Multi-User, multiple people might possess different agents.
                # If Agent A (User A) is picked, we must pause for User A.
                # If Agent B (User B) is picked, we must pause for User B.
                
                # We need to pass ALL possessed roles.
                # `self.scrollweaver.server._user_role_codes = list(controlled_roles)`
                # (We will need to check if ScrollWeaver supports this, or we patch it).
                
                # For this task, I will set `_user_role_code` to the union of roles if they are compatible, or just one.
                # LIMITATION: If we can't patch ScrollWeaver easily, maybe we accept race condition or limit 1 active user role?
                
                # Let's proceed assuming we can manage flow.
                
                message, status = await self.get_next_message()
                
                if message is None:
                     if len(self.scrollweaver.server.role_codes) == 0:
                        await self.broadcast_json({
                            'type': 'error',
                            'data': {'message': 'Waiting for characters...'}
                        })
                     else:
                        await self.broadcast_json({'type': 'story_ended', 'data': {'message': 'Story ended.'}})
                     break
                
                # Debug: Log message received
                print(f"[Room {self.room_id}] Got message: type={message.get('type')}, username={message.get('username')}, text_preview={str(message.get('text', ''))[:50]}")
                
                is_placeholder = message.get('is_placeholder', False) or message.get('text', '').strip().startswith('__USER_INPUT_PLACEHOLDER__')
                
                # Identify which role this message belongs to
                username = message.get('username', '')
                current_role_code = self._get_role_code_by_name(username)
                
                # Debug: Log role identification
                print(f"[Room {self.room_id}] Message for role: {current_role_code} (username: {username})")
                print(f"[Room {self.room_id}] User selected roles: {self.user_selected_roles}")
                print(f"[Room {self.room_id}] ScrollWeaver _user_role_codes: {getattr(self.scrollweaver.server, '_user_role_codes', None)}")
                
                # Check if this role is controlled by any connected client
                # Find client_id that controls this role
                controlling_client_id = None
                for cid, role in self.user_selected_roles.items():
                    if role == current_role_code:
                        controlling_client_id = cid
                        print(f"[Room {self.room_id}] Found controlling client: {cid} for role {current_role_code}")
                        break
                
                if current_role_code and current_role_code.startswith('digital_twin_user_') and not controlling_client_id:
                    print(f"[Room {self.room_id}] WARNING: User role {current_role_code} is not controlled by any client!")
                    print(f"[Room {self.room_id}] Available user_selected_roles: {self.user_selected_roles}")
                
                if controlling_client_id and is_placeholder:
                    # It's a user turn!
                    # Check if client is still connected before waiting for input
                    if controlling_client_id not in self.active_connections:
                        print(f"[Room {self.room_id}] Client {controlling_client_id} disconnected, skipping user input wait")
                        # Use AI auto-reply instead
                        try:
                            performer = self.scrollweaver.server.performers.get(current_role_code)
                            if performer:
                                loop = asyncio.get_running_loop()
                                try:
                                    ai_interaction = await loop.run_in_executor(
                                        None,
                                        lambda: performer.single_role_interact(current_role_code, username, "（用户已断开，AI自动回复）", "")
                                    )
                                    ai_text = None
                                    if isinstance(ai_interaction, dict):
                                        ai_text = ai_interaction.get('detail') or ai_interaction.get('text') or None
                                    elif isinstance(ai_interaction, str):
                                        ai_text = ai_interaction
                                    
                                    if ai_text:
                                        record_id = str(uuid.uuid4())
                                        self.scrollweaver.server.record(
                                            role_code=current_role_code,
                                            detail=ai_text,
                                            actor=current_role_code,
                                            group=self.scrollweaver.server.current_status.get('group', [current_role_code]),
                                            actor_type='role',
                                            act_type="user_input",
                                            record_id=record_id
                                        )
                                        # If this is a user's digital twin, mark as user message so it displays on the right
                                        is_user_digital_twin = current_role_code.startswith('digital_twin_user_')
                                        timeout_msg = {
                                            'username': username,
                                            'type': 'role',
                                            'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                            'text': ai_text,
                                            'icon': performer.icon_path if hasattr(performer, 'icon_path') and os.path.exists(performer.icon_path) and is_image(performer.icon_path) else default_icon_path,
                                            'uuid': record_id,
                                            'scene': self.scrollweaver.server.cur_round,
                                            'is_user': is_user_digital_twin,  # User's digital twin messages should display on the right
                                            'is_timeout_replacement': True,
                                            'role_code': current_role_code  # Include role_code for frontend reference
                                        }
                                        await self.broadcast_json({'type': 'message', 'data': timeout_msg})
                                except Exception as e:
                                    print(f"[Room {self.room_id}] Error generating AI reply for disconnected client: {e}")
                        except Exception as e:
                            print(f"[Room {self.room_id}] Error handling disconnected client input: {e}")
                        continue
                    
                    # Notify SPECIFIC user to input
                    ws = self.active_connections.get(controlling_client_id)
                    if ws:
                         # Send exclusive request to this user
                         await ws.send_json({
                            'type': 'waiting_for_user_input',
                            'data': {
                                'role_name': username,
                                'message': 'Your turn to act!'
                            }
                        })
                         
                         self.waiting_for_input[controlling_client_id] = True
                         future = asyncio.Future()
                         self.pending_user_inputs[controlling_client_id] = future

                         # Notify others? "Waiting for X..."
                         await self.broadcast_json_except(controlling_client_id, {
                             'type': 'status_update',
                             'data': {'status': f"Waiting for {username}..."}
                         })

                         try:
                             timeout = config.get('user_input_timeout', 60)

                             # Send countdown start ONLY to the controlling client
                             # Other clients should NOT enter input mode
                             try:
                                 deadline = (datetime.utcnow() + timedelta(seconds=timeout)).isoformat() + 'Z'
                                 await ws.send_json({
                                     'type': 'input_countdown_start',
                                     'data': {
                                         'role_name': username,
                                         'role_code': current_role_code,
                                         'duration': int(timeout),
                                         'deadline': deadline
                                     }
                                 })
                                 # Notify other clients that someone is inputting (but they shouldn't enter input mode)
                                 await self.broadcast_json_except(controlling_client_id, {
                                     'type': 'status_update',
                                     'data': {'status': f"{username}正在输入..."}
                                 })
                             except Exception:
                                 pass

                             # Start timeout reminder task
                             reminder_task = None
                             try:
                                 reminder_task = asyncio.create_task(
                                     self._send_timeout_reminders(controlling_client_id, timeout, future)
                                 )
                             except Exception as e:
                                 print(f"Error starting timeout reminder task: {e}")

                             user_input_result = await asyncio.wait_for(future, timeout=timeout)
                             
                             # Cancel reminder task if user responded
                             if reminder_task and not reminder_task.done():
                                 reminder_task.cancel()
                                 try:
                                     await reminder_task
                                 except asyncio.CancelledError:
                                     pass
                             if isinstance(user_input_result, tuple):
                                 user_text, is_echoed = user_input_result
                             else:
                                 user_text = user_input_result
                                 is_echoed = False
                                 
                             # Process input... (Similar to existing code)
                             original_uuid = message.get('uuid')
                             
                             def _augment_for_context(text: str, min_len: int = 40) -> str:
                                    t = text.strip()
                                    if len(t) >= min_len:
                                        return t
                                    return f"{t}\n(System Note: User intent is short, please elaborate reasonably.)"
                             
                             augmented_text = _augment_for_context(user_text)
                             
                             # Cancel countdown display (user responded)
                             try:
                                 await self.broadcast_json({
                                     'type': 'input_countdown_cancel',
                                     'data': {'role_code': current_role_code}
                                 })
                             except Exception:
                                 pass

                             if original_uuid:
                                 self.scrollweaver.server.history_manager.modify_record(original_uuid, augmented_text)
                                 # Update act_type
                                 for record in self.scrollweaver.server.history_manager.detailed_history:
                                     if record.get("record_id") == original_uuid:
                                         record["act_type"] = "user_input"
                                         break

                                 # 无论是否已回显，都确保消息被广播（统一消息格式）
                                 if not is_echoed:
                                      # 获取 performer 对象用于获取图标等信息
                                      performer = self.scrollweaver.server.performers.get(current_role_code)
                                      icon_path = default_icon_path
                                      if performer and hasattr(performer, 'icon_path') and performer.icon_path and os.path.exists(performer.icon_path) and is_image(performer.icon_path):
                                          icon_path = performer.icon_path
                                      
                                      # Broadcast echo to ALL with complete message format
                                      echo_msg = {
                                        'username': username,
                                        'type': 'role',
                                        'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                        'text': user_text,
                                        'icon': icon_path,
                                        'uuid': original_uuid,
                                        'scene': self.scrollweaver.server.cur_round,
                                        'is_user': True,
                                        'is_timeout_replacement': False,
                                        'role_code': current_role_code  # 添加role_code用于前端区分不同用户
                                      }
                                      await self.broadcast_json({'type': 'message', 'data': echo_msg})
                             else:
                                 # Fallback: 确保消息被广播
                                 await self.handle_user_role_input(controlling_client_id, current_role_code, user_text, delay_display=False, skip_broadcast=False)

                         except asyncio.TimeoutError:
                             # User did not respond in time. Notify room and skip.
                             # Cancel reminder task if still running
                             if reminder_task and not reminder_task.done():
                                 reminder_task.cancel()
                                 try:
                                     await reminder_task
                                 except asyncio.CancelledError:
                                     pass
                             
                             try:
                                 await self.broadcast_json({
                                     'type': 'input_countdown_timeout',
                                     'data': {
                                         'role_name': username,
                                         'role_code': current_role_code,
                                         'message': f'用户 {username} 超时未回复，已自动使用AI回复'
                                     }
                                 })
                             except Exception as e:
                                 print(f"Error broadcasting timeout notification: {e}")
                             try:
                                 await self.broadcast_json({
                                     'type': 'system',
                                     'data': {'message': f'用户 {username} 超时未回复，已自动使用AI回复'}
                                 })
                             except Exception as e:
                                 print(f"Error broadcasting system timeout message: {e}")
                             
                             print(f"[Room {self.room_id}] User input timeout for client {controlling_client_id} (role {current_role_code})")
                             
                             # Attempt AI auto-reply to replace the missing user input
                             try:
                                 performer = None
                                 try:
                                     performer = self.scrollweaver.server.performers.get(current_role_code)
                                 except Exception as e:
                                     print(f"[Room {self.room_id}] Error getting performer for {current_role_code}: {e}")
                                     performer = None

                                 if performer:
                                     loop = asyncio.get_running_loop()
                                     # Run the potentially blocking LLM call in a threadpool
                                     try:
                                         ai_interaction = await loop.run_in_executor(
                                             None,
                                             performer.single_role_interact,
                                             current_role_code,
                                             username,
                                             "（用户超时，AI代替回复）",
                                             ""
                                         )
                                     except TypeError:
                                         # Fallback if run_in_executor with args not accepted: use lambda
                                         ai_interaction = await loop.run_in_executor(
                                             None,
                                             lambda: performer.single_role_interact(current_role_code, username, "（用户超时，AI代替回复）", "")
                                         )

                                     ai_text = None
                                     if isinstance(ai_interaction, dict):
                                         ai_text = ai_interaction.get('detail') or ai_interaction.get('text') or None
                                     elif isinstance(ai_interaction, str):
                                         ai_text = ai_interaction

                                     if ai_text:
                                         # Record and broadcast with timeout replacement marker
                                         try:
                                             record_id = str(uuid.uuid4())
                                             self.scrollweaver.server.record(
                                                 role_code=current_role_code,
                                                 detail=ai_text,
                                                 actor=current_role_code,
                                                 group=self.scrollweaver.server.current_status.get('group', [current_role_code]),
                                                 actor_type='role',
                                                 act_type="user_input",
                                                 record_id=record_id
                                             )
                                             
                                             # Broadcast timeout replacement message with marker
                                             # If this is a user's digital twin, mark as user message so it displays on the right
                                             is_user_digital_twin = current_role_code.startswith('digital_twin_user_')
                                             timeout_msg = {
                                                 'username': username,
                                                 'type': 'role',
                                                 'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                                 'text': ai_text,
                                                 'icon': performer.icon_path if hasattr(performer, 'icon_path') and os.path.exists(performer.icon_path) and is_image(performer.icon_path) else default_icon_path,
                                                 'uuid': record_id,
                                                 'scene': self.scrollweaver.server.cur_round,
                                                 'is_user': is_user_digital_twin,  # User's digital twin messages should display on the right
                                                 'is_timeout_replacement': True,
                                                 'role_code': current_role_code  # Include role_code for frontend reference
                                             }
                                             await self.broadcast_json({'type': 'message', 'data': timeout_msg})
                                             
                                             status = self.scrollweaver.get_current_status()
                                             await self.broadcast_json({
                                                 'type': 'status_update',
                                                 'data': status
                                             })
                                         except Exception as e:
                                             print(f"[Room {self.room_id}] Error broadcasting AI replacement input: {e}")
                                             import traceback
                                             traceback.print_exc()
                                 else:
                                     print(f"[Room {self.room_id}] No performer found for {current_role_code}, cannot generate AI replacement")
                             except Exception as e:
                                 print(f"[Room {self.room_id}] Error generating AI replacement on timeout: {e}")
                                 import traceback
                                 traceback.print_exc()
                         except Exception as e:
                             print(f"Error handling user input: {e}")
                         finally:
                             self.waiting_for_input[controlling_client_id] = False
                             if controlling_client_id in self.pending_user_inputs:
                                 del self.pending_user_inputs[controlling_client_id]
                    else:
                        # Client disconnected? Skip turn or auto-play
                        pass
                else:
                    # Normal message, broadcast to all
                    if not is_placeholder:
                        # 确保消息格式统一：添加缺失的字段
                        if 'is_user' not in message:
                            message['is_user'] = False
                        if 'is_timeout_replacement' not in message:
                            message['is_timeout_replacement'] = False
                        if 'timestamp' not in message:
                            message['timestamp'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        if 'type' not in message:
                            message['type'] = 'role'
                        # 确保role_code存在（从actor、role_code或code字段获取）
                        if 'role_code' not in message:
                            if 'actor' in message:
                                message['role_code'] = message.get('actor')
                            elif 'code' in message:
                                message['role_code'] = message.get('code')
                            else:
                                # 尝试从username推断role_code
                                username = message.get('username', '')
                                if username:
                                    inferred_role_code = self._get_role_code_by_name(username)
                                    if inferred_role_code:
                                        message['role_code'] = inferred_role_code
                        
                        # Debug: Log before broadcasting
                        print(f"[Room {self.room_id}] Broadcasting message: username={message.get('username')}, text_preview={str(message.get('text', ''))[:50]}, active_connections={len(self.active_connections)}")
                        
                        await self.broadcast_json({'type': 'message', 'data': message})
                        if status:
                             await self.broadcast_json({'type': 'status_update', 'data': status})
                        await asyncio.sleep(0.2)

        except asyncio.CancelledError:
            # Task was cancelled - normal shutdown
            print(f"[Room {self.room_id}] Story loop cancelled")
            raise
        except Exception as e:
            # Categorize errors
            error_str = str(e).lower()
            is_fatal = any(keyword in error_str for keyword in [
                'keyerror', 'attributeerror', 'typeerror', 'valueerror', 'indexerror'
            ])
            
            if is_fatal:
                # Fatal error - stop loop and notify clients
                print(f"[Room {self.room_id}] Fatal error in story loop: {e}")
                import traceback
                traceback.print_exc()
                
                try:
                    await self.broadcast_json({
                        'type': 'error',
                        'data': {
                            'message': f'故事循环发生致命错误: {str(e)}',
                            'fatal': True
                        }
                    })
                except Exception as broadcast_error:
                    print(f"[Room {self.room_id}] Error broadcasting fatal error: {broadcast_error}")
                
                # Stop the loop
                return
            else:
                # Recoverable error - log and continue
                print(f"[Room {self.room_id}] Recoverable error in story loop: {e}")
                import traceback
                traceback.print_exc()
                
                # Try to continue after a short delay
                try:
                    await asyncio.sleep(1.0)
                    # Restart the loop
                    await self.start_story_loop()
                except Exception as restart_error:
                    print(f"[Room {self.room_id}] Error restarting story loop: {restart_error}")
                    return

    async def broadcast_json_except(self, excluded_cid: str, data: dict):
        for cid, ws in self.active_connections.items():
            if cid != excluded_cid:
                try:
                    await ws.send_json(data)
                except:
                    pass

    async def _send_timeout_reminders(self, client_id: str, timeout: int, future: asyncio.Future):
        """发送超时提醒消息"""
        reminder_intervals = config.get('user_input_timeout_reminder_intervals', [30, 15, 10])
        warning_seconds = config.get('user_input_timeout_warning_seconds', 10)
        
        for reminder_seconds in sorted(reminder_intervals, reverse=True):
            if reminder_seconds >= timeout:
                continue
            
            try:
                await asyncio.sleep(timeout - reminder_seconds)
                
                # 检查future是否已完成
                if future.done():
                    return
                
                # 检查客户端是否仍然连接
                if client_id not in self.active_connections:
                    return
                
                ws = self.active_connections.get(client_id)
                if ws:
                    await ws.send_json({
                        'type': 'input_timeout_warning',
                        'data': {
                            'remaining_seconds': reminder_seconds,
                            'message': f'还剩 {reminder_seconds} 秒，超时后将自动使用AI回复'
                        }
                    })
            except asyncio.CancelledError:
                return
            except Exception as e:
                print(f"Error sending timeout reminder: {e}")
        
        # 最后发送一次警告（当剩余时间≤warning_seconds时）
        if warning_seconds < timeout:
            try:
                await asyncio.sleep(timeout - warning_seconds)
                
                if future.done():
                    return
                
                if client_id not in self.active_connections:
                    return
                
                ws = self.active_connections.get(client_id)
                if ws:
                    await ws.send_json({
                        'type': 'input_timeout_warning',
                        'data': {
                            'remaining_seconds': warning_seconds,
                            'message': f'⚠️ 还剩 {warning_seconds} 秒！超时后将自动使用AI回复',
                            'urgent': True
                        }
                    })
            except asyncio.CancelledError:
                return
            except Exception as e:
                print(f"Error sending final timeout warning: {e}")

class RoomManager:
    def __init__(self):
        self._rooms: Dict[str, Room] = {}
        
    def get_room(self, room_id: str) -> Optional[Room]:
        return self._rooms.get(room_id)
        
    def create_room(self, room_id: str = None, preset_path: str = None) -> Room:
        if not room_id:
            room_id = str(uuid.uuid4())[:8]
        if room_id in self._rooms:
            return self._rooms[room_id]
            
        room = Room(room_id, preset_path)
        self._rooms[room_id] = room
        return room
    
    async def delete_room(self, room_id: str):
        if room_id in self._rooms:
            await self._rooms[room_id].cleanup()
            del self._rooms[room_id]

    def get_or_create_default_room(self) -> Room:
        return self.create_room("default")
        
    async def start_cleanup_task(self):
        """Start the background cleanup loop"""
        asyncio.create_task(self._cleanup_loop())
        
    async def _cleanup_loop(self):
        print("Starting RoomManager cleanup loop")
        while True:
            try:
                await asyncio.sleep(60) # Check every minute
                now = datetime.now()
                ids_to_delete = []
                
                # Check for inactive rooms
                for rid, room in list(self._rooms.items()):
                    if rid == "default": continue # Keep default room? Or clean it too? 
                    # Let's keep default room for convenience, or maybe clean it if using resources.
                    # Usually default room is persistent entry point.
                    
                    if not room.active_connections:
                        if room.last_empty_time:
                             elapsed = (now - room.last_empty_time).total_seconds()
                             if elapsed > 600: # 10 minutes
                                  ids_to_delete.append(rid)
                        else:
                             # Should have been set in disconnect, but if created and never connected:
                             room.last_empty_time = now
                
                for rid in ids_to_delete:
                    print(f"Cleaning up inactive room {rid}")
                    await self.delete_room(rid)
                    
            except Exception as e:
                print(f"Error in cleanup loop: {e}")
                await asyncio.sleep(60)
