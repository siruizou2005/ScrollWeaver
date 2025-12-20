from tqdm import tqdm 
import json 
import os
import warnings
import random
from typing import Any, Dict, List, Optional, Literal
from collections import defaultdict
import uuid

from sw_utils import *
from modules.core.server import Server
from modules.utils.role_utils import name2code
import argparse
from datetime import datetime

warnings.filterwarnings('ignore')

# The Server class has been moved to modules.core.server
# This file now only contains the ScrollWeaver wrapper class and main entry point


class ScrollWeaver():
    def __init__(self,
                 preset_path: str,
                 world_llm_name: str,
                 role_llm_name: str,
                 embedding_name:str = "bge-m3",
                 embedding = None) :
        self.server = Server(preset_path, 
                        world_llm_name=world_llm_name, 
                        role_llm_name=role_llm_name, 
                        embedding_name=embedding_name,
                        embedding=embedding)
        self.selected_scene = None
        
    def set_generator(self, 
                      rounds:int = 10, 
                      save_dir:str = "", 
                      if_save: Literal[0,1] = 0,
                      mode: Literal["free", "script"] = "free",
                      scene_mode: Literal[0,1] = 0,):
        # Continue simulation from file and get meta_info
        meta_info = self.server.continue_simulation_from_file(save_dir)
        # Create generator with meta_info
        self.generator = self.server.simulate_generator(rounds = rounds,
                                                        save_dir = save_dir,
                                                        if_save = if_save,
                                                        mode = mode,
                                                        scene_mode = scene_mode,
                                                        meta_info = meta_info)
    def get_map_info(self):
        location_codes = self.server.orchestrator.locations
        location_names = [self.server.orchestrator.find_location_name(location_code) for location_code in location_codes]
        n = len(location_codes)
        distances = []
        for i in range(n):
            for j in range(i+1,n):
                if self.server.orchestrator.get_distance(location_codes[i], location_codes[j]):
                    distances.append({
                        "source": location_names[i],
                        "target": location_names[j],
                        "distance": self.server.orchestrator.get_distance(location_codes[i], location_codes[j])
                    })
            
        return {
            "places": location_names,
            "distances": distances
        }
    def select_scene(self,scene_number):
        if scene_number == None:
            self.selected_scene = scene_number
        else:
            self.selected_scene = str(scene_number)
        
    def _normalize_role_codes(self, codes):
        converted_codes = name2code(codes, self.server.performers, self.server.role_codes, self.server.language)
        if isinstance(converted_codes, list):
            codes = converted_codes
        else:
            codes = [converted_codes] if converted_codes else []

        valid_codes = []
        for code in codes:
            if code in self.server.performers:
                valid_codes.append(code)
            else:
                print(f"[ScrollWeaver] Warning: Invalid role identifier '{code}' encountered when gathering character info.")
        return valid_codes

    def get_characters_info(self, scene_number=None, use_selected=True, scene_mode=False):
        characters_info = []
        target_scene = None
        if scene_number is not None and scene_number != "":
            target_scene = str(scene_number)
        elif use_selected and self.selected_scene is not None:
            target_scene = str(self.selected_scene)

        if target_scene is None:
            if scene_mode:
                current_scene_key = str(self.server.cur_round)
                codes = list(self.server.scene_manager.scene_characters.get(current_scene_key, []))
                codes = self._normalize_role_codes(codes)
                if not codes:
                    return []
            else:
                codes = list(self.server.role_codes)
                codes = self._normalize_role_codes(codes)
        else:
            codes = list(self.server.scene_characters.get(target_scene, []))
            codes = self._normalize_role_codes(codes)
            if not codes:
                return []
        for (i, code) in enumerate(codes):
            agent = self.server.performers[code]
            location = agent.location_name
            if code in self.server.moving_roles_info:
                location_name = self.server.orchestrator.find_location_name(self.server.moving_roles_info[code]["location_code"])
                distance = self.server.moving_roles_info[code]['distance']
                location = f"Reaching {location_name}... ({distance})"
            chara_info = {
                "id": i,
                "name": agent.role_name,
                "code": code,  # 添加角色代码，方便过滤
                "icon": agent.icon_path,
                "description": agent.role_profile,
                "goal": agent.goal if agent.goal else agent.motivation,
                "state": agent.status,
                "location": location
            }
            characters_info.append(chara_info)
        return characters_info

    def generate_next_message(self):
        print(f"ScrollWeaver.generate_next_message called, generator: {self.generator}")
        try:
            message_type, code, text, message_id = next(self.generator)
            print(f"Got from generator: type={message_type}, code={code}, text_length={len(text) if text else 0}, id={message_id}")
        except StopIteration:
            # Generator exhausted, return None instead of raising to avoid issues in async context
            print("Generator exhausted in generate_next_message")
            return None
        except Exception as e:
            # Log other exceptions and re-raise
            print(f"Error in generate_next_message: {e}")
            import traceback
            traceback.print_exc()
            raise
        
        if message_type == "role":
            username = self.server.performers[code].role_name
            icon_path = self.server.performers[code].icon_path
        else:
            username = message_type
            icon_path = ""
        
        # 确保text是字符串
        if text is not None and not isinstance(text, str):
            text = str(text)
        if text is None:
            text = ""
        
        message = {
            'username': username,
            'type': message_type, # role, world, system
            'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            'text': text,
            'icon': icon_path,
            "uuid": message_id,
            "scene": self.server.cur_round
        }
        # 安全地截取前50个字符用于日志
        text_preview = text[:50] if text and len(text) > 50 else (text if text else '')
        print(f"Generated message: username={username}, type={message_type}, text_preview={text_preview}...")
        return message
        
    def get_settings_info(self):
        return self.server.orchestrator.world_settings
    
    def get_current_status(self):
        status = dict(self.server.current_status)
        status['event'] = self.server.event
        group = []
        for code in status['group']:
            if code in self.server.role_codes:
                group.append(self.server.performers[code].nickname)
            else:
                group.append(code)
        status['group'] = group
        location_code = self.server.current_status['location_code']
        if location_code not in self.server.orchestrator.locations_info:
            location_name,location_description = "Undefined","Undefined"
        else:
            location_name,location_description = self.server.orchestrator.find_location_name(location_code),self.server.orchestrator.locations_info[location_code]["description"]
        status['location'] = {'name': location_name, 'description': location_description}
        status['characters'] = self.get_characters_info(scene_number=None, use_selected=False, scene_mode=False)
        status['scene_characters'] = self.get_characters_info(scene_number=None, use_selected=False, scene_mode=True)
        status['current_scene'] = self.server.cur_round
        try:
            available_scene_keys = {
                int(key) if str(key).isdigit() else key
                for key in self.server.scene_manager.scene_characters.keys()
            }
        except ValueError:
            available_scene_keys = {str(key) for key in self.server.scene_manager.scene_characters.keys()}
        available_scene_keys.add(status['current_scene'])
        try:
            available_scene_keys = sorted(available_scene_keys, key=lambda value: value)
        except TypeError:
            available_scene_keys = sorted([str(key) for key in available_scene_keys])
        status['available_scenes'] = available_scene_keys
        return status
    
    def handle_message_edit(self,record_id,new_text):
        group = self.server.history_manager.modify_record(record_id,new_text)
        for code in group:
            self.server.performers[code].history_manager.modify_record(record_id,new_text)
        return

    def get_history_messages(self,save_dir):
        
        messages = []
        # 跟踪每个场景是否已经插入了事件消息
        scene_event_inserted = {}
        
        for record in self.server.history_manager.detailed_history:
            cur_round = record["cur_round"]
            
            # 在每个场景的第一条消息之前插入 "-- Current Event --" 消息
            # 检查是否有事件，且该场景还没有插入事件消息
            if (cur_round >= 1 and 
                self.server.event_manager.event and 
                cur_round not in scene_event_inserted and
                len(self.server.event_manager.event_history) > 0):
                # 找到对应场景的事件（事件历史中的索引对应场景编号）
                event_index = min(cur_round - 1, len(self.server.event_manager.event_history) - 1)
                if event_index >= 0:
                    event_text = self.server.event_manager.event_history[event_index]
                    if event_text:
                        messages.append({
                            'username': 'world',
                            'type': 'world',
                            'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            'text': "-- Current Event --\n" + event_text,
                            'icon': "./frontend/assets/images/default-icon.jpg",
                            "uuid": None,
                            "scene": cur_round
                        })
                        scene_event_inserted[cur_round] = True
            
            message_type = record["actor_type"]
            code = record["role_code"]
            if message_type == "role":
                username = self.server.performers[code].role_name
                icon_path = self.server.performers[code].icon_path
            else:
                username = message_type
                icon_path = "./frontend/assets/images/default-icon.jpg"
            messages.append({
                'username': username,
                'type': message_type, # role, world, system
                'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                'text': record["detail"],
                'icon': icon_path,
                "uuid": record["record_id"],
                "scene": record["cur_round"]
            })
        return messages
    
    def generate_story(self, scene_number=None):
        target_scene = None
        if scene_number not in (None, ""):
            target_scene = str(scene_number)
        elif self.selected_scene not in (None, ""):
            target_scene = str(self.selected_scene)

        if target_scene is not None:
            filtered_logs = [
                record["detail"]
                for record in self.server.history_manager.detailed_history
                if str(record.get("cur_round")) == target_scene
            ]
        else:
            filtered_logs = self.server.history_manager.get_complete_history()

        if not filtered_logs:
            return "当前幕暂无故事内容。" if getattr(self.server, "language", "zh") == "zh" else "No story available for the selected scene."

        story = self.server.orchestrator.log2story(filtered_logs)
        return story
    
    def reset_session(self):
        """
        重置所有当前对话的临时session内容
        注意：调用此方法后，需要重新调用set_generator来重新初始化generator
        """
        self.server.reset_session()
    
def _is_connection_issue(exc: Exception) -> bool:
    connection_error_names = {
        "openai.error.APIConnectionError",
        "openai.OpenAIError",
        "requests.exceptions.ConnectionError",
        "requests.exceptions.RequestException",
        "urllib3.exceptions.HTTPError",
        "httpx.ConnectError",
        "httpx.ConnectTimeout",
        "httpx.ReadTimeout",
        "httpx.NetworkError",
    }
    full_name = f"{exc.__class__.__module__}.{exc.__class__.__name__}"
    if full_name in connection_error_names:
        return True
    message = str(exc).lower()
    keywords = ["connection", "resolve", "timeout", "network", "api key"]
    return any(keyword in message for keyword in keywords)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument('--world_llm', type=str, default='gpt-4o-mini')
    parser.add_argument('--role_llm', type=str, default='gpt-4o-mini')
    parser.add_argument('--genre', type=str, default='icefire')
    parser.add_argument('--preset_path', type=str, default='')

    parser.add_argument('--if_save', type=int, default=1, choices=[0,1])
    parser.add_argument('--scene_mode', type=int, default=0, choices=[0,1])
    parser.add_argument('--rounds', type=int, default=10)
    parser.add_argument('--save_dir', type=str, default='')
    parser.add_argument('--mode', type=str, default='free', choices=['free','script'])
    args = parser.parse_args()

    config: Dict[str, Any] = {}
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
    if os.path.exists(config_path):
        try:
            config = load_json_file(config_path)
        except Exception as exc:
            print(f"Warning: Failed to load config.json ({exc}).")
            config = {}

    if config:
        for key, value in config.items():
            if "API_KEY" in key and value and not os.getenv(key):
                os.environ[key] = value
        for key in ['OPENAI_API_BASE', 'GEMINI_API_BASE', 'OPENROUTER_BASE_URL']:
            if key in config and config[key] and not os.getenv(key):
                os.environ[key] = config[key]

    default_world_llm = parser.get_default('world_llm')
    default_role_llm = parser.get_default('role_llm')
    default_rounds = parser.get_default('rounds')
    default_mode = parser.get_default('mode')
    default_scene_mode = parser.get_default('scene_mode')
    default_if_save = parser.get_default('if_save')
    default_save_dir = parser.get_default('save_dir')

    world_llm_name = args.world_llm
    if world_llm_name == default_world_llm and config.get("world_llm_name"):
        world_llm_name = config["world_llm_name"]

    role_llm_name = args.role_llm
    if role_llm_name == default_role_llm and config.get("role_llm_name"):
        role_llm_name = config["role_llm_name"]

    rounds = args.rounds
    if rounds == default_rounds and config.get("rounds") is not None:
        rounds = config["rounds"]

    mode = args.mode
    if mode == default_mode and config.get("mode"):
        mode = config["mode"]

    scene_mode = args.scene_mode
    if scene_mode == default_scene_mode and config.get("scene_mode") is not None:
        scene_mode = config["scene_mode"]

    if_save = args.if_save
    if if_save == default_if_save and config.get("if_save") is not None:
        if_save = config["if_save"]

    save_dir = args.save_dir
    if save_dir == default_save_dir and config.get("save_dir"):
        save_dir = config["save_dir"]

    preset_path = args.preset_path
    if not preset_path and config.get("preset_path"):
        preset_path = config["preset_path"]

    genre = args.genre
    if not preset_path:
        preset_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"./experiment_presets/experiment_{genre}.json")

    embedding_name = config.get("embedding_model_name", "bge-m3")
    
    simulation = ScrollWeaver(preset_path, world_llm_name=world_llm_name, role_llm_name=role_llm_name, embedding_name=embedding_name)
    simulation.set_generator(rounds = rounds, save_dir = save_dir, if_save = if_save, scene_mode = scene_mode,mode = mode)
    
    for i in range(100):
        try:
            simulation.generate_next_message()
        except StopIteration:
            break
        except Exception as exc:
            if _is_connection_issue(exc):
                warning_text = "Simulation stopped early due to LLM connectivity issue. Please verify your API access or network before rerunning."
                print(warning_text)
                print(f"Detail: {exc}")
                if hasattr(simulation, "server") and getattr(simulation.server, "logger", None):
                    simulation.server.logger.warning(f"{warning_text} ({exc})")
                break
            raise
