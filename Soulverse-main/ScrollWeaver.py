from tqdm import tqdm 
import json 
import os
import warnings
import random
from typing import Any, Dict, List, Optional, Literal
from collections import defaultdict
import uuid

from sw_utils import *
from modules.main_performer import Performer
from modules.user_agent import UserAgent
from modules.npc_agent import NPCAgent
from modules.orchestrator import Orchestrator
from modules.history_manager import HistoryManager
from modules.embedding import get_embedding_model
from modules.time_simulator import TimeSimulator, get_time_simulator
import argparse
from datetime import datetime

warnings.filterwarnings('ignore')

class Server():
    def __init__(self,
                 preset_path: str,
                 world_llm_name: str,
                 role_llm_name: str,
                 embedding_name:str = "bge-small") :
        """
        The initialization function of the system.
        
        Args:
            preset_path (str): The path to config file of this experiment.
            world_llm_name (str, optional): The base model of the orchestrator. Defaults to 'gpt-4o'.
            role_llm_name (str, optional): The base model of all performers. Defaults to 'gpt-4o'.
            mode (str, optional): If set to 'script', performers will act according to the given script. 
                                  If set to 'free', performers act freely based on their backgrounds.
                                  Defaults to 'free'.
        """
        
        self.role_llm_name: str = role_llm_name
        self.world_llm_name: str = world_llm_name
        self.embedding_name:str = embedding_name
        config = load_json_file(preset_path)
        self.preset_path = preset_path
        self.config: Dict = config
        self.experiment_name: str = os.path.basename(preset_path).replace(".json","") + "/" + config["experiment_subname"] + "_" + role_llm_name
        
        performer_codes: List[str] = config.get('performer_codes', [])
        world_file_path: str = config["world_file_path"]
        map_file_path: str = config["map_file_path"] if "map_file_path" in config else ""
        role_file_dir: str = config["role_file_dir"] if "role_file_dir" in config else "./data/roles/"
        loc_file_path: str = config["loc_file_path"]
        self.intervention: str = config["intervention"] if "intervention" in config else ""
        self.event = self.intervention
        self.script: str = config["script"] if "script" in config else ""
        self.language: str = config["language"] if "language" in config else "zh"
        self.source:str = config["source"] if "source" in config else ""
        
        # 强制使用Soulverse模式：不再支持传统Performer
        # 所有Agent必须通过add_user_agent()或add_npc_agent()动态添加
        self.is_soulverse_mode = True
        
        self.idx: int = 0
        self.cur_round: int = 0
        self.progress: str = "剧本刚刚开始，还什么都没有发生" if self.language == 'zh' else "The story has just begun, nothing happens yet."
        self.moving_roles_info: Dict[str, Any] = {}   
        self.history_manager = HistoryManager()
        self.start_time = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        self.current_status = {
            "location_code":"",
            "group":[],  # Soulverse模式：初始为空，Agent动态添加后更新
        }
        self.scene_characters = {}
        self.event_history = []
        
        # 初始化时间模拟器（1虚拟小时 = 1实际分钟，即60倍速）
        self.time_simulator = get_time_simulator(time_ratio=60.0)
        
        self.role_llm = get_models(role_llm_name)
        self.logger = get_logger(self.experiment_name)
        
        self.embedding = get_embedding_model(embedding_name, language=self.language)
        
        # Soulverse模式：不初始化传统Performer，Agent通过API动态添加
        # 初始化空的角色列表和performers字典
        self.role_codes: List[str] = []
        self.performers: Dict[str, Performer] = {}
        
        # 如果配置中有performer_codes，记录警告但不创建
        if performer_codes:
            self.logger.warning(f"检测到performer_codes配置，但Soulverse模式不支持传统Performer。"
                              f"请使用add_user_agent()或add_npc_agent()API动态添加Agent。")
        
        if world_llm_name == role_llm_name:
            self.world_llm = self.role_llm
        else:
            self.world_llm = get_models(world_llm_name)
        self.init_orchestrator_from_file(world_file_path = world_file_path,
                                        map_file_path = map_file_path,
                                        loc_file_path = loc_file_path,
                                        llm = self.world_llm,
                                        embedding = self.embedding)

        if self.is_soulverse_mode:
            self._enforce_single_scene()
    
    def _safe_str(self, value: Any) -> str:
        """
        安全地将值转换为字符串，用于字符串拼接操作。
        
        Args:
            value: 需要转换的值（可能是字符串、列表、字典等）
            
        Returns:
            str: 转换后的字符串
        """
        if value is None:
            return ""
        elif isinstance(value, str):
            return value
        elif isinstance(value, list):
            # 如果是列表，尝试智能转换
            if len(value) == 0:
                return ""
            # 检查是否是字典列表（如 [{"thought": "...", "speech": "..."}]）
            if isinstance(value[0], dict):
                parts = []
                for item in value:
                    if isinstance(item, dict):
                        if "thought" in item:
                            parts.append(f"【{item['thought']}】")
                        if "speech" in item:
                            parts.append(f"「{item['speech']}」")
                        if "action" in item:
                            parts.append(f"（{item['action']}）")
                    else:
                        parts.append(str(item))
                return " ".join(parts)
            else:
                # 普通列表，用空格连接
                return " ".join(str(item) for item in value)
        elif isinstance(value, dict):
            # 如果是字典，尝试提取常见字段
            if "detail" in value:
                return self._safe_str(value["detail"])
            elif "text" in value:
                return self._safe_str(value["text"])
            else:
                return str(value)
        else:
            return str(value)
    
    # Init
    def init_performers(self, 
                         performer_codes: List[str], 
                         role_file_dir:str, 
                         world_file_path:str,
                         llm=None,
                         embedding=None) -> None:
        """
        初始化角色列表（已废弃）
        
        注意：此方法已废弃。系统现在强制使用Soulverse模式，不再支持传统Performer。
        所有Agent必须通过add_user_agent()或add_npc_agent()动态添加。
        
        保留此方法仅为了向后兼容，但不会执行任何操作。
        """
        # 已废弃：不再创建传统Performer
        # 所有Agent必须通过add_user_agent()或add_npc_agent()动态添加
        self.logger.warning("init_performers()已废弃。请使用add_user_agent()或add_npc_agent()动态添加Agent。")
        return
    
    def init_orchestrator_from_file(self, 
                                   world_file_path: str, 
                                   map_file_path: str,
                                   loc_file_path: str,
                                   llm=None,
                                   embedding=None) -> None:
        self.orchestrator: Orchestrator = Orchestrator(world_file_path = world_file_path, 
                                                  location_file_path = loc_file_path,
                                                  map_file_path = map_file_path, 
                                                  llm_name=self.world_llm_name,
                                                  llm = llm,
                                                  embedding_name=self.embedding_name,
                                                  embedding = embedding,
                                                  language=self.language)
        for role_code in self.performers:
            self.performers[role_code].world_db = self.orchestrator.db
            self.performers[role_code].world_db_name = self.orchestrator.db_name

    def _enforce_single_scene(self):
        """强制Soulverse模式仅使用一个场景（闲聊酒会）。"""
        scene_code = "soulverse_banquet"
        scene_name = "闲聊酒会"
        scene_description = "一个持续开放的社交酒会，所有Agent都会在这里交流。"
        scene_detail = (
            "闲聊酒会是Soulverse中唯一的公共场景，柔和的灯光、背景音乐与开放式吧台"
            "让每位来访者都能随时加入话题、分享灵感。"
        )

        self.orchestrator.locations_info = {
            scene_code: {
                "location_code": scene_code,
                "location_name": scene_name,
                "description": scene_description,
                "detail": scene_detail,
            }
        }
        self.orchestrator.locations = [scene_code]
        self.orchestrator.edges = {}
        self.current_status["location_code"] = scene_code
        self.selected_scene = None

        for role_code in self.role_codes:
            self.performers[role_code].set_location(scene_code, scene_name)

        self.logger.info(f"单场景模式已启用，所有Agent位于 {scene_name}")
        
    def init_role_locations(self, random_allocate: bool = True):
        """
        Set initial positions of the roles.
        
        Args:
            random_allocate (bool, optional): if set to be True, the initial positions of the roles are randomly assigned. Defaults to True.
        """
        init_locations_code = random.choices(self.orchestrator.locations, k = len(self.role_codes))
        for i,role_code in enumerate(self.role_codes):
            self.performers[role_code].set_location(init_locations_code[i], self.orchestrator.find_location_name(init_locations_code[i]))
            info_text = f"{self.performers[role_code].nickname} 现在位于 {self.orchestrator.find_location_name(init_locations_code[i])}" \
                if self.language == "zh" else f"{self.performers[role_code].nickname} is now located at {self.orchestrator.find_location_name(init_locations_code[i])}"
            self.log(info_text)
    
    def reset_llm(self, role_llm_name, world_llm_name):
        self.role_llm = get_models(role_llm_name)
        for role_code in self.role_codes:
            self.performers[role_code].llm = self.role_llm
            self.performers[role_code].llm_name = role_llm_name
        if world_llm_name == role_llm_name:
            self.world_llm = self.role_llm
        else:
            self.world_llm = get_models(world_llm_name)
        self.orchestrator.llm = self.world_llm
        self.role_llm_name = role_llm_name
        self.world_llm_name = world_llm_name
    
    def add_user_agent(self,
                      user_id: str,
                      role_code: str,
                      soul_profile: Optional[Dict[str, Any]] = None,
                      initial_location: Optional[str] = None):
        """
        动态添加用户Agent到沙盒
        
        Args:
            user_id: 用户ID
            role_code: Agent的角色代码（唯一标识）
            soul_profile: Soul用户画像数据（如果为None，则从模拟API获取）
            initial_location: 初始位置代码（如果为None，随机分配）
        
        Returns:
            创建的UserAgent实例
        """
        # 检查role_code是否已存在
        if role_code in self.role_codes:
            raise ValueError(f"Agent with role_code {role_code} already exists")
        
        # 创建UserAgent
        user_agent = UserAgent(
            user_id=user_id,
            role_code=role_code,
            world_file_path=self.config.get("world_file_path", ""),
            soul_profile=soul_profile,
            language=self.language,
            db_type="chroma",
            llm_name=self.role_llm_name,
            llm=self.role_llm,
            embedding_name=self.embedding_name,
            embedding=self.embedding
        )
        
        # 设置初始位置
        if initial_location:
            if initial_location in self.orchestrator.locations:
                user_agent.set_location(initial_location, self.orchestrator.find_location_name(initial_location))
            else:
                # 如果位置无效，随机分配
                initial_location = random.choice(self.orchestrator.locations)
                user_agent.set_location(initial_location, self.orchestrator.find_location_name(initial_location))
        else:
            # 随机分配位置
            initial_location = random.choice(self.orchestrator.locations)
            user_agent.set_location(initial_location, self.orchestrator.find_location_name(initial_location))
        
        # 共享world_db
        user_agent.world_db = self.orchestrator.db
        user_agent.world_db_name = self.orchestrator.db_name
        
        # 共享全局history_manager（关键！让所有agent看到相同的历史）
        user_agent.history_manager = self.history_manager
        # 保存performers引用，用于格式化历史记录
        user_agent._performers_ref = self.performers
        
        # 添加到系统
        self.role_codes.append(role_code)
        self.performers[role_code] = user_agent
        
        # 设置初始motivation
        motivation = user_agent.set_motivation(
            world_description=self.orchestrator.description,
            other_roles_info=self._get_group_members_info_dict(self.performers),
            intervention=self.event,
            script=self.script
        )
        
        self.log(f"用户Agent {user_agent.nickname} ({role_code}) 已加入沙盒，初始位置: {user_agent.location_name}")
        
        return user_agent
    
    def add_npc_agent(self,
                     role_code: str,
                     role_name: str,
                     preset_config: Optional[Dict[str, Any]] = None,
                     preset_id: Optional[str] = None,
                     initial_location: Optional[str] = None):
        """
        动态添加NPC Agent到沙盒（使用新的三层人格模型）
        
        Args:
            role_code: Agent的角色代码（唯一标识）
            role_name: Agent的名称
            preset_config: 预设配置字典（旧版，如果preset_id为None则使用）
            preset_id: 预设ID（新版，优先使用）
            initial_location: 初始位置代码（如果为None，随机分配）
        
        Returns:
            创建的NPCAgent实例
        """
        # 检查role_code是否已存在
        if role_code in self.role_codes:
            raise ValueError(f"Agent with role_code {role_code} already exists")
        
        # 创建NPCAgent（使用新的三层人格模型）
        npc_agent = NPCAgent(
            role_code=role_code,
            role_name=role_name,
            world_file_path=self.config.get("world_file_path", ""),
            preset_config=preset_config,
            preset_id=preset_id,
            language=self.language,
            db_type="chroma",
            llm_name=self.role_llm_name,
            llm=self.role_llm,
            embedding_name=self.embedding_name,
            embedding=self.embedding
        )
        
        # 设置初始位置
        if initial_location:
            if initial_location in self.orchestrator.locations:
                npc_agent.set_location(initial_location, self.orchestrator.find_location_name(initial_location))
            else:
                # 如果位置无效，随机分配
                initial_location = random.choice(self.orchestrator.locations)
                npc_agent.set_location(initial_location, self.orchestrator.find_location_name(initial_location))
        else:
            # 随机分配位置
            initial_location = random.choice(self.orchestrator.locations)
            npc_agent.set_location(initial_location, self.orchestrator.find_location_name(initial_location))
        
        # 共享world_db
        npc_agent.world_db = self.orchestrator.db
        npc_agent.world_db_name = self.orchestrator.db_name
        
        # 共享全局history_manager（关键！让所有agent看到相同的历史）
        npc_agent.history_manager = self.history_manager
        # 保存performers引用，用于格式化历史记录
        npc_agent._performers_ref = self.performers
        
        # 添加到系统
        self.role_codes.append(role_code)
        self.performers[role_code] = npc_agent
        
        # 设置初始motivation（仅当motivation为空时才调用LLM）
        # 如果Agent已经有motivation（从预设模板加载），则跳过
        if not npc_agent.motivation or npc_agent.motivation.strip() == "":
            motivation = npc_agent.set_motivation(
                world_description=self.orchestrator.description,
                other_roles_info=self._get_group_members_info_dict(self.performers),
                intervention=self.event,
                script=self.script
            )
            self.log(f"NPC Agent {npc_agent.nickname} ({role_code}) 已生成motivation")
        else:
            self.log(f"NPC Agent {npc_agent.nickname} ({role_code}) 使用预设motivation")
        
        self.log(f"NPC Agent {npc_agent.nickname} ({role_code}) 已加入沙盒，初始位置: {npc_agent.location_name}")
        
        return npc_agent
        
    # Simulation        
    def simulate_generator(self, 
                 rounds: int = 10, 
                 save_dir: str = "", 
                 if_save: Literal[0,1] = 0,
                 mode: Literal["free", "script"] = "free",
                 scene_mode: Literal[0,1] = 1,):
        """
        The main function of the simulation.

        Args:
            rounds (int, optional): The max rounds of simulation. Defaults to 10.
            save_dir (str, optional): _description_. Defaults to "".
            if_save (Literal[0,1], optional): _description_. Defaults to 0.
        """
        self.mode = mode 
        meta_info: Dict[str, Any] = self.continue_simulation_from_file(save_dir)            
        self.if_save: int = if_save
        start_round: int = meta_info["round"]
        sub_start_round:int = meta_info["sub_round"] if "sub_round" in meta_info else 0
        if start_round == rounds: return 
        
        # Setting Locations
        if not meta_info["location_setted"]:
            self.log("========== Start Location Setting ==========")
            self.init_role_locations()
            self._save_current_simulation("location")
            
        # Setting Goals
        if not meta_info["goal_setted"]:
            yield ("system","","-- Setting Goals --",None) 
            self.log("========== Start Goal Setting ==========")
            
            if self.mode == "free":
                self.get_event()
                event_text = self._safe_str(self.event)
                self.log(f"--------- Free Mode: Current Event ---------\n{event_text}\n")
                event_text = self._safe_str(self.event)
                yield ("system","",f"--------- Current Event ---------\n{event_text}\n", None) 
                self.event_history.append(self.event)
            elif self.mode == "script":
                self.get_script()
                script_text = self._safe_str(self.script)
                self.log(f"--------- Script Mode: Setted Script ---------\n{script_text}\n")
                script_text = self._safe_str(self.script)
                yield ("system","",f"--------- Setted Script ---------\n{script_text}\n", None) 
                self.event_history.append(self.event)
            if self.mode == "free":
                # 获取当前所有被用户选中的角色（支持多个选中）
                user_role_codes = set()
                single_user_role = getattr(self, '_user_role_code', None)
                multi_user_roles = getattr(self, '_user_role_codes', None)
                if multi_user_roles:
                    try:
                        user_role_codes.update(set(multi_user_roles))
                    except Exception:
                        pass
                if single_user_role:
                    user_role_codes.add(single_user_role)

                for role_code in self.role_codes:
                    # 在Goal Setting阶段，用户角色也会设置motivation，但不yield消息
                    # 因为Goal Setting是自动的，不需要用户输入
                    motivation = self.performers[role_code].set_motivation(
                        world_description = self.orchestrator.description, 
                        other_roles_info = self._get_group_members_info_dict(self.performers),
                        intervention = self.event,
                        script = self.script
                        )
                    motivation = self._safe_str(motivation)
                    info_text = f"{self.performers[role_code].nickname} 设立了动机: {motivation}" \
                        if self.language == "zh" else f"{self.performers[role_code].nickname} has set the motivation: {motivation}"
                    
                    record_id = str(uuid.uuid4())
                    self.log(info_text)
                    self.record(role_code=role_code,
                                detail=info_text,
                                actor = role_code,
                                group = [role_code],
                                actor_type = 'role',
                                act_type="goal setting",
                                record_id = record_id)
                    
                    # 如果是用户选中的角色，则只记录不yield；其它角色正常yield
                    if user_role_codes and role_code in user_role_codes:
                        continue
                    else:
                        yield ("role",role_code,info_text,record_id)

            self._save_current_simulation("goal")
        yield ("system","","-- Simulation Started --",None)
        selected_role_codes = []
        # Simulating
        for current_round in range(start_round, rounds):
            self.cur_round = current_round
            self.log(f"========== Round {current_round+1} Started ==========")
            if self.event and current_round >= 1:
                event_text = self._safe_str(self.event)
                self.log(f"--------- Current Event ---------\n{event_text}\n")
                yield ("world","","-- Current Event --\n" + event_text, None)
                self.event_history.append(self.event)
                
            if len(self.moving_roles_info) == len(self.role_codes):
                self.settle_movement()
                continue
            
            # Characters in next scene
            # Soulverse模式：所有角色都在同一场景
            if self.is_soulverse_mode:
                # 强制使用所有角色（过滤掉不存在的agents）
                group = [rc for rc in self.role_codes if rc in self.performers]
                if group:
                    print(f"[Soulverse模式] 本轮参与的角色: {[self.performers[c].nickname for c in group]}")
                else:
                    print(f"[Soulverse模式] Warning: No valid agents found")
                    continue  # 跳过这一轮
            elif scene_mode:
                group = self._name2code(
                    self.orchestrator.decide_scene_actors(
                        self._get_locations_info(False),
                        self.history_manager.get_recent_history(5),
                        self.event,
                        list(set(selected_role_codes + list(self.moving_roles_info.keys())))))
                # 过滤掉不存在的agents
                group = [rc for rc in group if rc in self.performers]
                selected_role_codes += group
                if len(selected_role_codes) >= len(self.role_codes):
                    selected_role_codes = []
            else:
                group = [rc for rc in self.role_codes if rc in self.performers]
            
            # 如果group为空，跳过这一轮
            if not group:
                print(f"[Round {current_round}] Warning: No valid agents in group, skipping")
                continue
            
            self.current_status['group'] = group
            self.current_status['location_code'] = self.performers[group[0]].location_code
            self.scene_characters[str(current_round)] = group
            # Prologue 
            # if current_round == 0 and len(group) > 0 
            #     prologue = self.orchestrator.generate_location_prologue(location_code=self.performers[group[0]].location_code, history_text=self._get_history_text(group),event=self.event,location_info_text=self._find_roles_at_location(self.performers[group[0]].location_code,name=True))
            #     self.log("--Prologue--: "+prologue)
            #     self.record(role_code="None",detail=prologue,act_type="prologue")
            start_idx = len(self.history_manager)

            sub_round = sub_start_round
            for sub_round in range(sub_start_round,3):
                # 过滤group中不存在的agents
                valid_group = [rc for rc in group if rc in self.performers]
                if not valid_group:
                    print(f"[Round {current_round}, Sub-round {sub_round}] Warning: No valid agents in group, skipping")
                    break
                
                if self.mode == "script":    
                    self.script_instruct(self.progress)
                else:
                    for role_code in valid_group:
                        self.performers[role_code].update_goal(other_roles_status=self._get_status_text(self.role_codes))

                for role_code in valid_group:
                    # 正常决定下一个行动的角色（由系统根据场景逻辑自然决定）
                    if scene_mode:
                        # 若最近一条为用户输入或用户角色发言，则放大历史窗口并加入用户焦点导语
                        # 支持两种模式：
                        # 1. 用户控制模式：act_type 为 'user_input' 或 'user_input_placeholder'
                        # 2. AI行动模式：role_code 为用户角色且 act_type 为 'plan', 'single', 'multi'
                        recent_k = 3
                        last_is_user = False
                        last_user_text = ""
                        # 支持单值或多值用户控制角色
                        user_role_codes = set()
                        single_user_role = getattr(self, '_user_role_code', None)
                        multi_user_roles = getattr(self, '_user_role_codes', None)
                        if multi_user_roles:
                            try:
                                user_role_codes.update(set(multi_user_roles))
                            except Exception:
                                pass
                        if single_user_role:
                            user_role_codes.add(single_user_role)
                        
                        if hasattr(self.history_manager, 'detailed_history') and len(self.history_manager.detailed_history) > 0:
                            last = self.history_manager.detailed_history[-1]
                            last_act_type = last.get('act_type', '')
                            last_role_code = last.get('role_code', '')
                            
                            # 检查是否是用户输入（用户控制模式）
                            is_user_input = last_act_type in ('user_input', 'user_input_placeholder')
                            # 检查是否是用户角色发言（AI行动模式），支持多个被控制角色
                            is_user_role_speaking = (user_role_codes and 
                                                    last_role_code in user_role_codes and 
                                                    last_act_type in ('plan', 'single', 'multi'))
                            
                            last_is_user = is_user_input or is_user_role_speaking
                            
                            if last_is_user:
                                recent_k = 8
                                last_user_text = last.get('detail', '')
                                # 如果上一条是用户输入或用户角色发言，确保下一轮不立即选择用户角色
                                # 通过增加历史窗口，让orchestrator看到更多上下文，避免重复选择
                        
                        history_text = "\n".join(self.history_manager.get_recent_history(recent_k))
                        if last_is_user and last_user_text.strip():
                            focus_prefix = f"【重点】用户刚刚说：{last_user_text}\n请优先回应该内容。\n"
                            history_text = focus_prefix + history_text
                            
                            # 如果上一条是用户输入或用户角色发言，在提示中明确要求选择其他角色
                            if user_role_codes:
                                # 取第一个可见的用户角色用于提示
                                user_in_perf = None
                                for r in user_role_codes:
                                    if r in self.performers:
                                        user_in_perf = r
                                        break
                                user_name = self.performers[user_in_perf].nickname if user_in_perf else "用户"
                                history_text = f"【重要】上一条是{user_name}的发言，请选择其他角色进行回应，不要立即选择{user_name}。\n" + history_text
                        
                        # 调用orchestrator决定下一个行动的角色
                        roles_info_text = self._get_group_members_info_text(group, status=True)
                        print(f"[调度] Group包含 {len(group)} 个角色: {[self.performers[c].nickname for c in group]}")
                        print(f"[调度DEBUG] 传递给Orchestrator的角色信息:\n{roles_info_text}")
                        
                        next_actor_result = self.orchestrator.decide_next_actor(history_text, roles_info_text, self.script)
                        # 清理返回结果（去除可能的换行、空格等）
                        next_actor_result = next_actor_result.strip().replace('\n', '').replace('\r', '')
                        
                        # 先检查是否直接返回了role_code
                        if next_actor_result in self.role_codes:
                            # Orchestrator直接返回了role_code，直接使用
                            role_code = next_actor_result
                            print(f"[调度] Orchestrator直接返回了role_code: {role_code}")
                        else:
                            # 尝试通过名字匹配
                            role_code = self._name2code(next_actor_result)
                            print(f"[调度] Orchestrator选择: {next_actor_result} -> role_code: {role_code}")
                            
                            # 检查是否匹配成功
                            if role_code not in self.role_codes:
                                print(f"[调度ERROR] 无法匹配角色！Orchestrator返回: '{next_actor_result}', 无法找到对应的role_code")
                                # 如果匹配失败，优先选择用户角色（支持多用户）
                                user_role_codes = set()
                                single_user_role = getattr(self, '_user_role_code', None)
                                multi_user_roles = getattr(self, '_user_role_codes', None)
                                if multi_user_roles:
                                    try:
                                        user_role_codes.update(set(multi_user_roles))
                                    except Exception:
                                        pass
                                if single_user_role:
                                    user_role_codes.add(single_user_role)
                                intersect = [r for r in user_role_codes if r in group]
                                if intersect:
                                    role_code = intersect[0]
                                    print(f"[调度] 匹配失败，优先选择用户角色: {role_code}")
                                else:
                                    # 选择第一个未发言的角色
                                    spoken_codes = set()
                                    if hasattr(self.history_manager, 'detailed_history'):
                                        for record in self.history_manager.detailed_history[-10:]:
                                            if record.get('act_type') in ('plan', 'single', 'multi'):
                                                spoken_codes.add(record.get('role_code'))
                                    unspoken = [c for c in group if c not in spoken_codes]
                                    if unspoken:
                                        role_code = unspoken[0]
                                        print(f"[调度] 匹配失败，选择未发言角色: {role_code}")
                                    else:
                                        # 最后选择group中的第一个
                                        role_code = group[0]
                                        print(f"[调度] 匹配失败，选择group第一个: {role_code}")
                    
                    # 检查是否是用户选择的角色（如果是，根据 possession_mode 决定行为）
                    # 支持多个用户控制的角色
                    user_role_codes = set()
                    single_user_role = getattr(self, '_user_role_code', None)
                    multi_user_roles = getattr(self, '_user_role_codes', None)
                    if multi_user_roles:
                        try:
                            user_role_codes.update(set(multi_user_roles))
                        except Exception:
                            pass
                    if single_user_role:
                        user_role_codes.add(single_user_role)
                    
                    # 使用 per-role possession mode
                    possession_modes = getattr(self, 'possession_modes', {})
                    # 默认为 False (用户手动控制)，如果在 map 中且为 True，则为 AI 接管
                    is_ai_possession = possession_modes.get(role_code, False)

                    print(f"[检查] role_code={role_code}, user_role_codes={user_role_codes}, ai_possession={is_ai_possession}")

                    if user_role_codes and role_code in user_role_codes and not is_ai_possession:
                        # 用户控制模式：系统选择了用户控制的角色，不调用plan()生成计划，而是创建占位消息等待用户输入
                        record_id = str(uuid.uuid4())
                        placeholder_text = "__USER_INPUT_PLACEHOLDER__"
                        self.record(role_code=role_code,
                                    detail=placeholder_text,
                                    actor_type='role',
                                    act_type="user_input_placeholder",
                                    actor=role_code,
                                    group=[role_code],
                                    record_id=record_id)
                        yield ("role", role_code, placeholder_text, record_id)
                        # 跳过plan和interaction，等待用户输入
                        continue
                    
                    # AI自由行动模式或非用户角色：正常执行计划
                    
                    # 正常执行计划（非用户角色）
                    yield from self.implement_next_plan(role_code = role_code,
                                            group = group)
                    self._save_current_simulation("action", current_round, sub_round)

                if_end,epilogue = self.orchestrator.judge_if_ended("\n".join(self.history_manager.get_recent_history(len(self.history_manager)-start_idx)))
                if if_end:
                    record_id = str(uuid.uuid4())
                    epilogue = self._safe_str(epilogue)
                    self.log("--Epilogue--: "+epilogue)
                    self.record(role_code = "None",
                                detail = epilogue, 
                                actor_type="world",
                                act_type="epilogue", 
                                actor = "world",
                                group = [],
                                record_id = record_id)
                    yield ("world","","--Epilogue--: "+epilogue, record_id)
                    
                    break
            
                
            for role_code in group:
                yield from self.decide_whether_to_move(role_code = role_code,
                                            group = self._find_group(role_code))
                self.performers[role_code].update_status()
                
            self.settle_movement()
            self.update_event(group)    
                
            sub_start_round = 0 
            self._save_current_simulation("action", current_round + 1,sub_round + 1)
            
    # Main functions using llm    
    def implement_next_plan(self,role_code: str, group: List[str]):
        # 检查 agent 是否存在（可能在对话进行中被移除）
        if role_code not in self.performers:
            self.log(f"Warning: Agent {role_code} not found, skipping plan implementation")
            return
        
        # 过滤group中不存在的agents
        valid_group = [rc for rc in group if rc in self.performers]
        if not valid_group:
            self.log(f"Warning: No valid agents in group, skipping plan implementation")
            return
        
        other_roles_info = self._get_group_members_info_dict(valid_group)
        plan = self.performers[role_code].plan(
            other_roles_info = other_roles_info,
            available_locations = self.orchestrator.locations,
            world_description = self.orchestrator.description,
            intervention = self.event,
        )
        
        info_text = plan["detail"]
        
        # 处理detail字段：如果API返回的是列表格式，需要转换为字符串
        if isinstance(info_text, list):
            # 将列表格式的detail转换为字符串
            detail_parts = []
            for item in info_text:
                if isinstance(item, dict):
                    if "thought" in item:
                        detail_parts.append(f"【{item['thought']}】")
                    if "speech" in item:
                        detail_parts.append(f"「{item['speech']}」")
                    if "action" in item:
                        detail_parts.append(f"（{item['action']}）")
                elif isinstance(item, str):
                    detail_parts.append(item)
            info_text = " ".join(detail_parts)
            plan["detail"] = info_text  # 更新plan中的detail为字符串格式
        
        # 确保info_text是字符串
        if not isinstance(info_text, str):
            info_text = str(info_text)
            plan["detail"] = info_text
        
        # 确保target_role_codes是列表格式
        if "target_role_codes" not in plan or plan["target_role_codes"] is None:
            plan["target_role_codes"] = []
        elif not isinstance(plan["target_role_codes"], list):
            # 如果是字符串或其他类型，转换为列表
            plan["target_role_codes"] = [plan["target_role_codes"]]
        
        if plan["target_role_codes"]:
            plan["target_role_codes"] = self._name2code(plan["target_role_codes"])
            # 再次过滤不存在的agents
            plan["target_role_codes"] = [rc for rc in plan["target_role_codes"] if rc in self.performers]
            
            
        record_id = str(uuid.uuid4())
        performer = self.performers[role_code]
        self.log(f"-Action-\n{performer.role_name}: "+ info_text)
        # 构建有效的group（包含role_code和target_role_codes）
        valid_group = [role_code] + plan["target_role_codes"]
        valid_group = [rc for rc in valid_group if rc in self.performers]  # 再次过滤
        
        self.record(role_code = role_code,
                    detail = plan["detail"],
                    actor_type = 'role',
                    act_type = "plan",
                    actor = role_code,
                    group = valid_group,
                    plan = plan,
                    record_id = record_id
                        )
        yield ("role", role_code, info_text, record_id)

        if plan["interact_type"] == "single" and len(plan["target_role_codes"]) == 1 and plan["target_role_codes"][0] in valid_group:
            yield from self.start_single_role_interaction(plan, record_id)
        elif plan["interact_type"] == "multi" and len(plan["target_role_codes"]) > 1 and set(plan["target_role_codes"]).issubset(set(valid_group))  :
            yield from self.start_multi_role_interaction(plan, record_id)
        elif plan["interact_type"] == "enviroment":
            yield from self.start_enviroment_interaction(plan,role_code, record_id)
        elif plan["interact_type"] == "npc" and plan["target_npc_name"]:
            yield from self.start_npc_interaction(plan,role_code,target_name=plan["target_npc_name"], record_id = record_id)
        return info_text         
    
    def decide_whether_to_move(self, 
                          role_code: str, 
                          group: List[str]):
        if len(self.orchestrator.locations) <= 1:
            return False
        if_move, move_detail, destination_code = self.performers[role_code].move(locations_info_text = self._get_locations_info(), 
                                                                                  locations_info = self.orchestrator.locations_info)
        if if_move:
            move_detail = self._safe_str(move_detail)
            self.log(move_detail)
            print(f"角色选择移动。{self.performers[role_code].role_name}正在前往{self.orchestrator.find_location_name(destination_code)}" if self.language == "zh" else f"The role decides to move. {self.performers[role_code].role_name} is heading to {self.orchestrator.find_location_name(destination_code)}.")
            self.record(role_code = role_code,
                    detail = move_detail,
                    actor_type = 'role',
                    act_type = "move",
                    actor = role_code,
                    group = [role_code],
                    destinatiion_code = destination_code
                        )
            yield ("role",role_code,move_detail,None)
            
            distance = self.orchestrator.get_distance(self.performers[role_code].location_code, destination_code)
            self.performers[role_code].set_location(location_code=None, location_name=None)
            self.moving_roles_info[role_code] = {
                "location_code":destination_code,
                "distance":distance
            }
        return if_move
          
    def start_enviroment_interaction(self,
                                     plan: Dict[str, Any], 
                                     role_code: str,
                                     record_id: str):
        """
        Handles the role's interaction with the environment. 
        It gets interaction results from agents in the world, record the result and update the status of the role.

        Args:
            plan (Dict[str, Any]): The details of the action.
            role_code (str): The action maker.

        Returns:
            (str): The enviroment response.
        """
        if "action" not in plan:
            plan["action"] = ""
        self.current_status['group'] = [role_code]
        location_code = self.performers[role_code].location_code
        result = self.orchestrator.enviroment_interact(action_maker_name = self.performers[role_code].role_name,
                                                            action  = plan["action"],
                                                            action_detail = conceal_thoughts(self.history_manager.search_record_detail(record_id)),
                                                            location_code = location_code)
        result = self._safe_str(result)
        env_record_id = str(uuid.uuid4())
        self.log(f"(Enviroment):{result}")
        self.record(role_code = role_code,
                    detail = result,
                    actor_type = 'world',
                    act_type = "enviroment",
                    initiator = role_code,
                    actor = "world",
                    group = [role_code],
                    record_id = env_record_id)
        yield ("world","","(Enviroment):" + result, env_record_id)
        
        record_detail = self._safe_str(self.history_manager.search_record_detail(record_id))
        env_detail = self._safe_str(self.history_manager.search_record_detail(env_record_id))
        return conceal_thoughts(record_detail) + env_detail
    
    def start_npc_interaction(self,
                              plan: Dict[str, Any], 
                              role_code: str, 
                              target_name: str,
                              record_id: str,
                              max_rounds: int = 3):
        """
        Handles the role's interaction with the environment. 
        It gets interaction results from agents in the world, record the result and update the status of the role.

        Args:
            plan (Dict[str, Any]): The details of the action.
            role_code (str): The action maker.
            target_name (str): The target npc.

        Returns:
            (str): The enviroment response.
        """
        interaction = plan
        start_idx = len(self.history_manager)
        
        self.log(f"----------NPC Interaction----------\n")
        self.current_status['group'] = [role_code,target_name]
        for round in range(max_rounds):
            npc_interaction = self.orchestrator.npc_interact(action_maker_name=self.performers[role_code].role_name,
                                                    action_detail=self.history_manager.search_record_detail(record_id),
                                                    location_name=self.performers[role_code].location_name,
                                                    target_name=target_name)
            npc_detail = self._safe_str(npc_interaction.get("detail", ""))
            
            npc_record_id = str(uuid.uuid4())
            self.log(f"{target_name}: " + npc_detail)
            self.record(role_code = role_code,
                        detail = npc_detail,
                        actor_type = 'world',
                        act_type = "npc",
                        actor = "world",
                        group = [role_code],
                        npc_name = target_name,
                        record_id = npc_record_id
                        )
            yield ("world","",f"(NPC-{target_name}):" + npc_detail, npc_record_id)
            
            if npc_interaction["if_end_interaction"]:
                break
            
            interaction = self.performers[role_code].npc_interact(
                npc_name = target_name,
                npc_response = self.history_manager.search_record_detail(npc_record_id),
                history = "\n".join(self.history_manager.get_subsequent_history(start_idx = start_idx)),
                intervention = self.event
            )
            detail = self._safe_str(interaction.get("detail", ""))
            
            record_id = str(uuid.uuid4())
            self.log(f"{self.performers[role_code].role_name}: " + detail)
            self.record(role_code = role_code,
                        detail = detail,
                        actor_type = 'role',
                        act_type = "npc",
                        actor = role_code,
                        group = [role_code],
                        npc_name = target_name,
                        record_id = record_id)
            yield ("role",role_code,detail,record_id)
            
            if interaction["if_end_interaction"]:
                break
            if_end,epilogue = self.orchestrator.judge_if_ended("\n".join(self.history_manager.get_subsequent_history(start_idx)))
            if if_end:
                break
                
        return "\n".join(self.history_manager.get_subsequent_history(start_idx = start_idx))
    
    def start_single_role_interaction(self,
                                      plan: Dict[str, Any],
                                      record_id: str,
                                      max_rounds: int = 8):
        interaction = plan
        acted_role_code = interaction["role_code"]
        acting_role_code = interaction["target_role_codes"][0]
        
        # 检查agents是否存在（可能在对话进行中被移除）
        if acted_role_code not in self.performers:
            print(f"Warning: Role {acted_role_code} does not exist in performers.")
            return
        if acting_role_code not in self.performers:
            print(f"Warning: Role {acting_role_code} does not exist in performers.")
            return
        
        self.current_status['group'] = [acted_role_code, acting_role_code]
        
        start_idx = len(self.history_manager)
        for round in range(max_rounds):
            # 如果当前轮到的角色是用户控制的Agent，则跳过自动回复，等待用户输入
            # 支持单值或多值用户控制角色
            user_role_codes = set()
            single_user_role = getattr(self, '_user_role_code', None)
            multi_user_roles = getattr(self, '_user_role_codes', None)
            if multi_user_roles:
                try:
                    user_role_codes.update(set(multi_user_roles))
                except Exception:
                    pass
            if single_user_role:
                user_role_codes.add(single_user_role)
            if user_role_codes and acting_role_code in user_role_codes:
                placeholder_id = str(uuid.uuid4())
                placeholder_text = "__USER_INPUT_PLACEHOLDER__"
                self.log(f"{self.performers[acting_role_code].role_name}: (等待用户输入)")
                self.record(
                    role_code=acting_role_code,
                    detail=placeholder_text,
                    actor_type='role',
                    act_type="user_input_placeholder",
                    actor=acting_role_code,
                    group=[acted_role_code, acting_role_code],
                    target_role_code=acting_role_code,
                    planning_role_code=plan["role_code"],
                    round=round,
                    record_id=placeholder_id
                )
                yield ("role", acting_role_code, placeholder_text, placeholder_id)
                return

            interaction = self.performers[acting_role_code].single_role_interact(
                action_maker_code = acted_role_code, 
                action_maker_name = self.performers[acted_role_code].role_name,
                action_detail = conceal_thoughts(self.history_manager.search_record_detail(record_id)), 
                action_maker_profile = self.performers[acted_role_code].role_profile, 
                intervention = self.event
            )
            
            detail = self._safe_str(interaction.get("detail", ""))
            
            record_id = str(uuid.uuid4())
            self.log(f"{self.performers[acting_role_code].role_name}: " + detail)
            self.record(role_code = acting_role_code,
                        detail = detail,
                        actor_type = 'role',
                        act_type = "single",
                        group = [acted_role_code,acting_role_code],
                        target_role_code = acting_role_code,
                        planning_role_code = plan["role_code"],
                        round = round,
                        record_id = record_id
                        )
            yield ("role",acting_role_code,detail,record_id)
            
            if interaction["if_end_interaction"]:
                return
            if interaction["extra_interact_type"] == "npc":
                print("---Extra NPC Interact---")
                result = yield from self.start_npc_interaction(plan=interaction,
                                                               role_code=acted_role_code,
                                                               target_name=interaction["target_npc_name"],
                                                               record_id=record_id)
                interaction["detail"] = result
                
            elif interaction["extra_interact_type"] == "enviroment":
                print("---Extra Env Interact---")
                result = yield from self.start_enviroment_interaction(plan=interaction,role_code=acted_role_code,record_id=record_id)
                interaction["detail"] = result
                
            if_end,epilogue = self.orchestrator.judge_if_ended("\n".join(self.history_manager.get_subsequent_history(start_idx)))
            if if_end:
                break
            acted_role_code,acting_role_code = acting_role_code,acted_role_code
        return
    
    def start_multi_role_interaction(self, 
                                     plan: Dict[str, Any], 
                                     record_id: str,
                                     max_rounds: int = 8):

        interaction = plan
        acted_role_code = interaction["role_code"]
        group = list(interaction["target_role_codes"])  # 创建副本
        group.append(acted_role_code)
        
        # 过滤掉不存在的agents
        valid_group = [code for code in group if code in self.performers]
        if not valid_group:
            print(f"Warning: No valid agents in group for multi_role_interaction.")
            return
        if acted_role_code not in self.performers:
            print(f"Warning: Acted role {acted_role_code} does not exist.")
            return
        
        self.current_status['group'] = valid_group
        
        start_idx = len(self.history_manager)
        other_roles_info = self._get_group_members_info_dict(valid_group)
        
        for round in range(max_rounds):
            acting_role_code = self._name2code(self.orchestrator.decide_next_actor(
                history_text="\n".join(self.history_manager.get_recent_history(3)),
                roles_info_text=self._get_group_members_info_text(remove_list_elements(valid_group, acted_role_code), status=True)))
            
            # 检查acting_role_code是否存在
            if acting_role_code not in self.performers:
                print(f"Warning: Acting role {acting_role_code} does not exist, skipping interaction.")
                break

            # 如果轮到用户控制的角色，跳过自动生成对话，等待用户输入
            user_role_codes = set()
            single_user_role = getattr(self, '_user_role_code', None)
            multi_user_roles = getattr(self, '_user_role_codes', None)
            if multi_user_roles:
                try:
                    user_role_codes.update(set(multi_user_roles))
                except Exception:
                    pass
            if single_user_role:
                user_role_codes.add(single_user_role)
            if user_role_codes and acting_role_code in user_role_codes:
                placeholder_id = str(uuid.uuid4())
                placeholder_text = "__USER_INPUT_PLACEHOLDER__"
                self.log(f"{self.performers[acting_role_code].role_name}: (等待用户输入)")
                self.record(
                    role_code=acting_role_code,
                    detail=placeholder_text,
                    actor_type='role',
                    act_type="user_input_placeholder",
                    actor=acting_role_code,
                    group=valid_group,
                    planning_role_code=plan["role_code"],
                    round=round,
                    record_id=placeholder_id
                )
                yield ("role", acting_role_code, placeholder_text, placeholder_id)
                return

            interaction = self.performers[acting_role_code].multi_role_interact(
                action_maker_code = acted_role_code, 
                action_maker_name = self.performers[acted_role_code].role_name,
                action_detail = conceal_thoughts(self.history_manager.search_record_detail(record_id)), 
                action_maker_profile = self.performers[acted_role_code].role_profile, 
                other_roles_info = other_roles_info,
                intervention = self.event
            )
            
            detail = self._safe_str(interaction.get("detail", ""))
            
            record_id = str(uuid.uuid4())
            self.log(f"{self.performers[acting_role_code].role_name}: "+ detail)
            self.record(role_code = acting_role_code,
                        detail = detail,
                        actor_type = 'role',
                        act_type = "multi",
                        group = valid_group,
                        actor = acting_role_code,
                        planning_role_code = plan["role_code"],
                        round = round,
                        record_id = record_id
                        )
            yield ("role",acting_role_code,detail,record_id)
            
                
            if interaction["if_end_interaction"]:
                break
            result = ""
            if interaction["extra_interact_type"] == "npc":
                print("---Extra NPC Interact---")
                result = yield from self.start_npc_interaction(plan=interaction,role_code=acting_role_code,target_name=interaction["target_npc_name"],record_id = record_id)
            elif interaction["extra_interact_type"] == "enviroment":
                print("---Extra Env Interact---")
                result = yield from self.start_enviroment_interaction(plan=interaction,role_code=acting_role_code,record_id = record_id)
            record_detail = self._safe_str(self.history_manager.search_record_detail(record_id))
            result = self._safe_str(result)
            interaction["detail"] = record_detail + result
            acted_role_code = acting_role_code
            if_end,epilogue = self.orchestrator.judge_if_ended("\n".join(self.history_manager.get_subsequent_history(start_idx)))
            if if_end:
                break
            
            return
    
    # Sub functions using llm
    def script_instruct(self, 
                        last_progress: str, 
                        top_k: int = 5):
        """
        Under the script mode, generate instruction for the roles at the beginning of each round.

        Args:
            last_progress (str): Where the script went in the last round.
            top_k (int, optional): The number of action history of each role to refer. Defaults to 1.

        Returns:
            Dict[str, Any]: Instruction for each role.
        """
        roles_info_text = self._get_group_members_info_text(self.role_codes,status=True)
        history_text = self.history_manager.get_recent_history(top_k)
    
        instruction = self.orchestrator.get_script_instruction(
                                roles_info_text=roles_info_text, 
                                event = self.event, 
                                history_text=history_text,
                                script=self.script,
                                last_progress = last_progress)
        
        for code in instruction:
            if code == "progress":
                progress_text = self._safe_str(instruction.get("progress", ""))
                self.log("剧本进度：" + progress_text) if self.language == "zh" else self.log("Current Stage:" + progress_text)
            elif code in self.role_codes:
                # self.performers[code].update_goal(instruction = instruction[code])
                self.performers[code].goal = instruction[code]
            else:
                print("Instruction failed, role code:",code)
        return instruction
       
    def get_event(self,):
        if self.intervention == "" and not self.script:
            roles_info_text = self._get_group_members_info_text(self.role_codes,profile=True)
            status_text = self._get_status_text(self.role_codes)
            event = self.orchestrator.generate_event(roles_info_text=roles_info_text,event=self.intervention,history_text=status_text)
            # Normalize None to empty string to avoid concatenation errors
            self.intervention = event if isinstance(event, str) and event is not None else (event or "")
        elif self.intervention == "" and self.script:
            self.intervention = self.script or ""
        self.event = self.intervention or ""
        return self.intervention
    
    def get_script(self,):
        if self.script == "":
            roles_info_text = self._get_group_members_info_text(self.role_codes,profile=True)
            status = self._get_status_text(self.role_codes)
            script = self.orchestrator.generate_script(roles_info_text=roles_info_text,event=self.intervention,history_text=status)
            self.script = script
        return self.script
    
    def update_event(self, group: List[str], top_k: int = 1):
        # Soulverse模式：生成新的社交场景事件
        if self.is_soulverse_mode:
            from modules.soulverse_mode import SoulverseMode
            soulverse_mode = SoulverseMode(language=self.language)
            agents_info = [self.performers[code] for code in self.role_codes]
            recent_activities = self.history_manager.get_recent_history(5)
            self.event = soulverse_mode.generate_social_event(
                agents_info=agents_info,
                recent_activities=recent_activities
            )
        elif self.intervention == "":
            self.event = ""
        else:
            status_text = self._get_status_text(group)
            self.event = self.orchestrator.update_event(self.event, self.intervention, status_text, script = self.script)
    
    # other
    def record(self,
               role_code: str, 
               detail: str, 
               actor_type: str,
               act_type: str,
               group: List[str] = [],
               actor: str = "",
               record_id = None,
               **kwargs):
        if act_type == "plan" and "plan" in kwargs:
            detail = f"{self.performers[role_code].nickname}: {detail}"
            interact_type = kwargs["plan"]["interact_type"]
            target = ", ".join(kwargs["plan"]["target_role_codes"])
            other_info = f"Interact type: {interact_type}, Target: {target}"
        elif act_type == "move" and "destination_code" in kwargs:
            destination = kwargs["destination_code"]
            other_info = f"Desitination:{destination}"
        elif act_type == "single":
            detail = f"{self.performers[role_code].nickname}: {detail}"
            target, planning_role, round = kwargs["target_role_code"],kwargs["planning_role_code"],kwargs["round"]
            other_info = f"Target: {target}, Planning Role: {planning_role}, Round: {round}"
        elif act_type == "multi": 
            detail = f"{self.performers[role_code].nickname}: {detail}"
            planning_role, round = kwargs["planning_role_code"],kwargs["round"]
            other_info = f"Group member:{group}, Planning Role: {planning_role}, Round:{round},"
        elif act_type == "npc":
            name = kwargs["npc_name"]
            other_info = f"Target: {name}"
        elif act_type == "enviroment":
            other_info = ""
        else:
            other_info = ""
        # 获取虚拟时间戳
        virtual_time = self.time_simulator.get_virtual_time() if hasattr(self, 'time_simulator') else datetime.now()
        
        record = {
            "cur_round":self.cur_round,
            "role_code":role_code,
            "detail":detail,
            "actor":actor,
            "group":group,      # visible group
            "actor_type":actor_type,
            "act_type":act_type,
            "other_info":other_info,
            "record_id":record_id,
            "virtual_time": virtual_time.strftime("%Y-%m-%d %H:%M:%S"),
            "virtual_timestamp": virtual_time.timestamp()
        }
        self.history_manager.add_record(record)
        for code in group:
            if code in self.performers:
                self.performers[code].record(record)
    
    def settle_movement(self,):
        for role_code in self.moving_roles_info.copy():
            if not self.moving_roles_info[role_code]["distance"]:
                location_code = self.moving_roles_info[role_code]["location_code"]
                self.performers[role_code].set_location(location_code, self.orchestrator.find_location_name(location_code))
                self.log(f"{self.performers[role_code].role_name} 已到达 【{self.orchestrator.find_location_name(location_code)}】" if self.language == "zh" else
                         f"{self.performers[role_code].role_name} has reached [{self.orchestrator.find_location_name(location_code)}]")
                del self.moving_roles_info[role_code]
            else:
                self.moving_roles_info[role_code]["distance"] -= 1
    
    def _find_group(self,role_code):
        # 检查role_code是否存在
        if role_code not in self.performers:
            return []
        target_location = self.performers[role_code].location_code
        return [code for code in self.role_codes if code in self.performers and self.performers[code].location_code==target_location]
    
    def _find_roles_at_location(self,location_code,name = False):
        if name:
            return [self.performers[code].nickname for code in self.role_codes if code in self.performers and self.performers[code].location_code==location_code]
        else:
            return [code for code in self.role_codes if code in self.performers and self.performers[code].location_code==location_code]

    def _get_status_text(self,group):
        status_lines = []
        for role_code in group:
            status = self.performers[role_code].status
            # 如果status是字典，尝试提取文本（可能是LLM返回格式错误）
            if isinstance(status, dict):
                status = status.get('updated_status', status.get('status', str(status)))
            # 确保status是字符串
            status_lines.append(str(status))
        return "\n".join(status_lines)
    
    def _get_group_members_info_text(self,group, profile = False,status = False):
        roles_info_text = ""
        for i, role_code in enumerate(group):
            performer = self.performers[role_code]
            # 优先使用 nickname（更友好），如果没有则使用 role_name
            name = performer.nickname if hasattr(performer, 'nickname') and performer.nickname else performer.role_name
            roles_info_text += f"{i+1}. {name}\n(role_code:{role_code})\n"
            if profile:
                profile =  performer.role_profile
                roles_info_text += f"{profile}\n"
            if status:
                status_value = performer.status
                # 如果status是字典，尝试提取文本
                if isinstance(status_value, dict):
                    status_value = status_value.get('updated_status', status_value.get('status', str(status_value)))
                roles_info_text += f"{str(status_value)}\\n"
        return roles_info_text
    
    def _get_group_members_info_dict(self,group: List[str]):
        info = {
                role_code: {
                    "nickname": self.performers[role_code].nickname,
                    "profile": self.performers[role_code].role_profile
                }
                for role_code in group
            }
        return info
    
    def _get_locations_info(self,detailed = True):
        location_info_text = "---当前各角色位置---\n" if self.language == "zh" else "---Current Location of Roles---\n"
        if detailed:
            for i,location_code in enumerate(self.orchestrator.locations_info):
                location_name = self.orchestrator.find_location_name(location_code)
                description = self.orchestrator.locations_info[location_code]["description"]
                location_info_text += f"\n{i+1}. {location_name}\nlocation_code:{location_code}\n{description}\n\n"
                role_names = [f"{self.performers[code].role_name}({code})" for code in self.role_codes if self.performers[code].location_code == location_code]
                role_names = ", ".join(role_names)
                location_info_text += "目前在这里的角色有：" + role_names if self.language == "zh" else "Roles located here: " + role_names
        else:
            for i,location_code in enumerate(self.orchestrator.locations_info):
                location_name = self.orchestrator.find_location_name(location_code)
                role_names = [f"{self.performers[code].role_name}({code})" for code in self.role_codes if self.performers[code].location_code == location_code]
                if len(role_names) == 0:continue
                role_names = ", ".join(role_names)
                location_info_text += f"【{location_name}】：" + role_names +"；"
        return location_info_text
    
    def _name2code(self,roles):
        name_dic = {}
        # 构建名字到代码的映射（包括 role_name 和 nickname）
        for code in self.role_codes:
            performer = self.performers[code]
            name_dic[performer.role_name] = code
            if hasattr(performer, 'nickname') and performer.nickname:
                name_dic[performer.nickname] = code
        
        print(f"[DEBUG] _name2code 映射表: {name_dic}")
        # helper: fallback suffix-based match like 'user_rdon' -> match '*rdon'
        def _suffix_match(name: str):
            if not isinstance(name, str):
                return None
            base = name.strip().replace("\n", "").split("_")[-1].lower()
            for code in self.role_codes:
                rn = str(self.performers[code].role_name).lower()
                nn = str(self.performers[code].nickname).lower()
                if rn.endswith(base) or nn.endswith(base):
                    return code
            return None
        if isinstance(roles, list):
            processed_roles = []
            for role in roles:
                if role in self.role_codes:
                    processed_roles.append(role)
                elif role in name_dic:
                    processed_roles.append(name_dic[role])
                elif "-" in role and role.split("-")[0] in name_dic:
                    processed_roles.append(name_dic[role.split("-")[0]])
                elif role.replace("_","·") in self.role_codes:
                    processed_roles.append(role.replace("_","·"))
                else:
                    # Try suffix-based best-effort mapping
                    matched = _suffix_match(role)
                    processed_roles.append(matched if matched else role)
            return processed_roles
        elif isinstance(roles, str) :
            roles = roles.replace("\n","")
            if roles in self.role_codes:
                return roles
            elif roles in name_dic:
                return name_dic[roles]
            elif f"{roles}-{self.language}" in self.role_codes:
                return f"{roles}-{self.language}"
            elif "-" in roles and roles.split("-")[0] in name_dic:
                return name_dic[roles.split("-")[0]]
            elif roles.replace("_","·") in self.role_codes:
                return roles.replace("_","·")
            else:
                matched = _suffix_match(roles)
                if matched:
                    return matched
        return roles
    
    def log(self,text):
        self.logger.info(text)
        print(text)
    
    def _save_current_simulation(self, 
                                 stage: Literal["location", "goal", "action"], 
                                 current_round: int = 0,
                                 sub_round:int = 0):
        """
        Save the current simulation progress. 

        Args:
            stage (Literal["location", "goal", "action"]): The stage in which the simulation has been carried out
            current_round (int, optional): If the stage is "action", specify the number of rounds that have been completed. Defaults to 0.
        """
        if not self.if_save:
            return
        save_dir = f"./experiment_saves/{self.experiment_name}/{self.role_llm_name}_{self.start_time}"
        create_dir(save_dir)
        location_setted, goal_setted = False,False
        if stage in ["location","goal","action"]:
            location_setted = True
        if stage in ["goal","action"]:
            goal_setted = True
        meta_info = {
                "location_setted":location_setted,
                "goal_setted": goal_setted,
                "round": current_round,   
                "sub_round": sub_round,    
            }

        save_json_file(os.path.join(save_dir, "meta_info.json"), meta_info)
        name = self.experiment_name.split("/")[0]
        save_json_file(os.path.join(save_dir, f"{name}.json"), self.config)
        
        filename = os.path.join(save_dir, f"./server_info.json")
        save_json_file(filename, self.__getstate__() )
        
        self.history_manager.save_to_file(save_dir)
        if hasattr(self, 'performers'):
            for role_code in self.role_codes:
                self.performers[role_code].save_to_file(save_dir)
            self.orchestrator.save_to_file(save_dir)
        
    def continue_simulation_from_file(self, save_dir: str):
        """
        Restore the record of the last simulation.
        
        Args:
            save_dir (str): The path where the last simulation record was saved.

        Returns:
            Dict[str, Any]: The meta information recording the progress of the simulation
        """
        if os.path.exists(save_dir):
            meta_info = load_json_file(os.path.join(save_dir, "./meta_info.json"))
            filename = os.path.join(save_dir, f"./server_info.json")
            states = load_json_file(filename)
            self.__setstate__(states)   
            for role_code in self.role_codes:
                self.performers[role_code].load_from_file(save_dir) 
            self.orchestrator.load_from_file(save_dir)
            self.history_manager.load_from_file(save_dir)
            
            for record in self.history_manager.detailed_history:
                for code in record["group"]:
                    if code in self.role_codes:
                        self.performers[code].record(record)
        else:
            meta_info = {
                "location_setted":False,
                "goal_setted": False,
                "round": 0,
                "sub_round": 0,
            }
        return meta_info
    
    def __getstate__(self):
        states = {key: value for key, value in self.__dict__.items() \
            if isinstance(value, (str, int, list, dict, bool, type(None))) \
                and key not in ['performers','orchestrator','logger']}
        
        return states

    def __setstate__(self, states):
        self.__dict__.update(states)


class ScrollWeaver():
    def __init__(self,
                 preset_path: str,
                 world_llm_name: str,
                 role_llm_name: str,
                 embedding_name:str = "bge-m3") :
        self.server = Server(preset_path, 
                        world_llm_name=world_llm_name, 
                        role_llm_name=role_llm_name, 
                        embedding_name=embedding_name)
        self.selected_scene = None
        self.config = getattr(self.server, "config", {})
        self.role_llm_name = role_llm_name
        self.world_llm_name = world_llm_name
        self._analysis_llm = None
        
    def set_generator(self, 
                      rounds:int = 10, 
                      save_dir:str = "", 
                      if_save: Literal[0,1] = 0,
                      mode: Literal["free", "script"] = "free",
                      scene_mode: Literal[0,1] = 0,):
        self.server.continue_simulation_from_file(save_dir)
        self.generator = self.server.simulate_generator(rounds = rounds,
                                                        save_dir = save_dir,
                                                        if_save = if_save,
                                                        mode = mode,
                                                        scene_mode = scene_mode)
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
        
    def get_characters_info(self):
        characters_info = []
        if self.selected_scene == None:
            codes = self.server.role_codes
        else:
            codes = self.server.scene_characters[str(self.selected_scene)]
        for (i, code) in enumerate(codes):
            agent = self.server.performers[code]
            location = agent.location_name
            if code in self.server.moving_roles_info:
                location_name = self.server.orchestrator.find_location_name(self.server.moving_roles_info[code]["location_code"])
                distance = self.server.moving_roles_info[code]['distance']
                location = f"Reaching {location_name}... ({distance})"
            chara_info = {
                "id": i,
                "name": agent.nickname,
                "icon": agent.icon_path,
                "description": agent.role_profile,
                "goal": agent.goal if agent.goal else agent.motivation,
                "state": agent.status,
                "location": location,
                "code": code  # 添加role_code用于识别
            }
            
            # 标记是否为用户Agent
            if hasattr(agent, 'is_user_agent') and agent.is_user_agent:
                chara_info["is_user_agent"] = True
            elif hasattr(agent, 'is_npc_agent') and agent.is_npc_agent:
                chara_info["is_npc_agent"] = True
                chara_info["is_user_agent"] = False
            else:
                # 默认不是用户Agent（兼容旧代码）
                chara_info["is_user_agent"] = False
            
            # 如果是UserAgent或NPCAgent，添加额外信息
            if hasattr(agent, 'soul_profile') and agent.soul_profile:
                chara_info["mbti"] = agent.soul_profile.get("mbti", "")
                chara_info["interests"] = agent.soul_profile.get("interests", [])
                chara_info["personality"] = agent.soul_profile.get("personality", "")
                chara_info["traits"] = agent.soul_profile.get("traits", [])
                chara_info["social_goals"] = agent.soul_profile.get("social_goals", [])
            elif hasattr(agent, 'preset_config') and agent.preset_config:
                chara_info["mbti"] = agent.preset_config.get("mbti", "")
                chara_info["interests"] = agent.preset_config.get("interests", [])
                chara_info["traits"] = agent.preset_config.get("tags", [])
                chara_info["social_goals"] = agent.preset_config.get("social_goals", [])
                # Add complete preset data for profile viewing (structured format)
                if hasattr(agent, 'personality_profile') and agent.personality_profile:
                    # Extract big_five from personality_profile
                    if hasattr(agent.personality_profile, 'core_traits') and hasattr(agent.personality_profile.core_traits, 'big_five'):
                        big_five = agent.personality_profile.core_traits.big_five
                        # big_five is a dict, convert to dict if needed
                        if isinstance(big_five, dict):
                            big_five_dict = big_five
                        else:
                            big_five_dict = big_five.__dict__ if hasattr(big_five, '__dict__') else {}
                        chara_info["personality"] = {
                            "mbti": agent.preset_config.get("mbti", ""),
                            "big_five": big_five_dict,
                            "values": agent.preset_config.get("values", []),
                            "defense_mechanism": agent.preset_config.get("defense_mechanism", "")
                        }
                    else:
                        # Fallback: use preset_config data
                        chara_info["personality"] = {
                            "mbti": agent.preset_config.get("mbti", ""),
                            "big_five": agent.preset_config.get("big_five", {}),
                            "values": agent.preset_config.get("values", []),
                            "defense_mechanism": agent.preset_config.get("defense_mechanism", "")
                        }
                elif agent.preset_config.get("big_five"):
                    # Use big_five from preset_config if available
                    chara_info["personality"] = {
                        "mbti": agent.preset_config.get("mbti", ""),
                        "big_five": agent.preset_config.get("big_five", {}),
                        "values": agent.preset_config.get("values", []),
                        "defense_mechanism": agent.preset_config.get("defense_mechanism", "")
                    }
                else:
                    # Fallback: keep original format for compatibility
                    chara_info["personality"] = agent.preset_config.get("personality", "")
            characters_info.append(chara_info)
        return characters_info

    def generate_next_message(self):
        message_type, code, text,message_id = next(self.generator)
        if message_type == "role":
            # 检查 agent 是否存在（可能在对话进行中被移除）
            if code not in self.server.performers:
                self.server.log(f"Warning: Agent {code} not found in generate_next_message, using fallback")
                username = code  # 使用role_code作为fallback
                icon_path = ""
            else:
                username = self.server.performers[code].role_name
                icon_path = self.server.performers[code].icon_path
        else:
            username = message_type
            icon_path = ""
        message = {
            'username': username,
            'type': message_type, # role, world, system
            'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            'text': text,
            'icon': icon_path,
            "uuid": message_id,
            "scene": self.server.cur_round,
            "role_code": code if message_type == "role" else None  # 添加role_code字段用于前端区分不同用户
        }
        return message
        
    def get_settings_info(self):
        return self.server.orchestrator.world_settings
    
    def get_current_status(self):
        status = self.server.current_status
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
        status['characters'] = self.get_characters_info()
        return status
    
    def handle_message_edit(self,record_id,new_text):
        group = self.server.history_manager.modify_record(record_id,new_text)
        for code in group:
            self.server.performers[code].history_manager.modify_record(record_id,new_text)
        return

    def get_history_messages(self,save_dir):
        
        messages = []
        for record in self.server.history_manager.detailed_history:
            message_type = record["actor_type"]
            code = record["role_code"]
            if message_type == "role" and code in self.server.performers:
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
    
    def generate_social_report(self, agent_code: Optional[str] = None, format: str = "text"):
        """
        生成社交报告（替代原来的generate_story）
        如果是Soulverse模式，生成结构化的社交报告；否则保持原有逻辑
        
        Args:
            agent_code: 可选，指定Agent代码。如果为None，生成所有Agent的报告
            format: 返回格式，"text" 返回文本，"json" 返回结构化数据（包含图表数据）
        
        Returns:
            社交报告文本或结构化数据
        """
        if self.server.is_soulverse_mode:
            # Soulverse模式：生成结构化的社交报告
            from modules.social_analyzer import SocialAnalyzer
            from datetime import datetime
            
            analyzer = SocialAnalyzer(
                self.server.history_manager, 
                language=self.server.language,
                llm_name=self.server.world_llm_name
            )
            
            if agent_code:
                # 获取Agent的profile信息
                agent = self.server.performers.get(agent_code)
                agent_profile = {}
                agent_name = agent_code
                if agent:
                    agent_name = agent.nickname if hasattr(agent, 'nickname') and agent.nickname else agent_code
                    print(f"[Social Report] Retrieving profile for agent: {agent_code}")
                    if hasattr(agent, 'soul_profile') and agent.soul_profile:
                        agent_profile = agent.soul_profile
                        print(f"[Social Report] Using soul_profile: MBTI={agent_profile.get('mbti', 'NOT FOUND')}")
                    elif hasattr(agent, 'preset_config') and agent.preset_config:
                        agent_profile = {
                            "interests": agent.preset_config.get("interests", []),
                            "mbti": agent.preset_config.get("mbti", ""),
                            "personality": agent.preset_config.get("personality", ""),
                            "social_goals": agent.preset_config.get("social_goals", [])
                        }
                        print(f"[Social Report] Using preset_config: MBTI={agent_profile.get('mbti', 'NOT FOUND')}")
                    else:
                        print(f"[Social Report] WARNING: No profile found for agent {agent_code}")
                
                # 分析Agent行为
                behavior_analysis = analyzer.analyze_agent_behavior(agent_code, agent_profile, agent_name=agent_name)
                
                if format == "json":
                    # 返回结构化数据
                    return self._format_agent_social_report_json(agent_code, behavior_analysis)
                else:
                    # 返回文本格式
                    report = self._format_agent_social_report(agent_code, behavior_analysis)
                    return report
            else:
                # 生成所有Agent的综合报告
                if format == "json":
                    return self._format_all_agents_social_report_json(analyzer)
                else:
                    report = self._format_all_agents_social_report(analyzer)
                    return report
        else:
            # 非Soulverse模式：保持原有的故事生成逻辑
            logs = self.server.history_manager.get_complete_history()
            story = self.server.orchestrator.log2story(logs)
            return story
    
    def _format_agent_social_report(self, agent_code, behavior_analysis=None):
        """格式化单个Agent的社交报告（文本格式）"""
        agent = self.server.performers.get(agent_code)
        agent_name = agent.nickname if agent else agent_code

        report_lines = [
            f"# {agent_name} 的社交报告",
            "",
        ]

        # 只添加LLM生成的行为分析
        if behavior_analysis:
            insights = behavior_analysis.get("behavior_insights", {})
            if insights:
                report_lines.extend([
                    insights.get("analysis", "暂无分析数据"),
                    "",
                ])
        
        return "\n".join(report_lines)
    
    def _format_agent_social_report_json(self, agent_code, behavior_analysis):
        """格式化单个Agent的社交报告（JSON格式）"""
        agent = self.server.performers.get(agent_code)
        agent_name = agent.nickname if agent else agent_code
        
        return {
            "agent_code": agent_code,
            "agent_name": agent_name,
            "behavior_analysis": behavior_analysis,
            "report_text": self._format_agent_social_report(agent_code, behavior_analysis)
        }
    
    def _format_all_agents_social_report_json(self, analyzer):
        """格式化所有Agent的社交报告（JSON格式）"""
        user_agents = [code for code, agent in self.server.performers.items() 
                      if hasattr(agent, 'is_user_agent') and agent.is_user_agent]
        
        reports = []
        for agent_code in user_agents:
            agent = self.server.performers.get(agent_code)
            agent_profile = {}
            agent_name = agent_code
            if agent:
                agent_name = agent.nickname if hasattr(agent, 'nickname') and agent.nickname else agent_code
                if hasattr(agent, 'soul_profile') and agent.soul_profile:
                    agent_profile = agent.soul_profile
            
            behavior_analysis = analyzer.analyze_agent_behavior(agent_code, agent_profile, agent_name=agent_name)
            report_json = self._format_agent_social_report_json(agent_code, behavior_analysis)
            reports.append(report_json)
        
        return {
            "reports": reports,
            "total_agents": len(reports),
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }


    def _get_analysis_llm(self):
        if self._analysis_llm:
            return self._analysis_llm
        try:
            self._analysis_llm = get_models(self.world_llm_name)
        except Exception as exc:
            if hasattr(self, 'logger'):
                self.logger.warning(f"AI匹配度分析模型初始化失败: {exc}")
            self._analysis_llm = None
        return self._analysis_llm or getattr(self, 'world_llm', None)
    
    def _format_all_agents_social_report(self, analyzer):
        """格式化所有Agent的综合社交报告"""
        report_lines = [
            "# Soulverse 社交报告",
            "",
            f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "## 概述",
            f"本报告记录了Soulverse虚拟社交沙盒中所有Agent的社交活动。",
            "",
        ]
        
        # 获取所有用户Agent
        user_agents = [code for code, agent in self.server.performers.items() 
                      if hasattr(agent, 'is_user_agent') and agent.is_user_agent]
        
        if not user_agents:
            report_lines.append("目前还没有用户Agent参与社交活动。")
            return "\n".join(report_lines)
        
        # 为每个Agent生成报告
        from modules.social_analyzer import SocialAnalyzer
        analyzer = SocialAnalyzer(
            self.server.history_manager, 
            language=self.server.language,
            llm_name=self.server.world_llm_name
        )
        
        for agent_code in user_agents:
            agent = self.server.performers[agent_code]
            agent_profile = {}
            agent_name = agent_code
            if agent:
                agent_name = agent.nickname if hasattr(agent, 'nickname') and agent.nickname else agent_code
                if hasattr(agent, 'soul_profile') and agent.soul_profile:
                    agent_profile = agent.soul_profile
            
            behavior_analysis = analyzer.analyze_agent_behavior(agent_code, agent_profile, agent_name=agent_name)
            agent_report = self._format_agent_social_report(agent_code, behavior_analysis)
            report_lines.append("---")
            report_lines.append("")
            report_lines.append(agent_report)
            report_lines.append("")
        
        return "\n".join(report_lines)
    
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
