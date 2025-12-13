"""
Core Server class for ScrollWeaver.
"""

import os
from typing import Any, Dict, List, Optional, Literal
from datetime import datetime
import random

from modules.main_performer import Performer
from modules.orchestrator import Orchestrator
from modules.history_manager import HistoryManager
from modules.embedding import get_embedding_model

from modules.utils import (
    get_models, get_logger, load_json_file,
    check_role_code_availability
)
from modules.simulation import (
    StateManager, RecordManager, InteractionHandler,
    EventManager, MovementManager, SceneManager,
    Persistence, Simulator
)


class Server:
    """Server class that orchestrates the simulation."""
    
    def __init__(self,
                 preset_path: str,
                 world_llm_name: str,
                 role_llm_name: str,
                 embedding_name: str = "bge-small",
                 embedding = None):
        """
        Initialize the Server.
        
        Args:
            preset_path: Path to config file
            world_llm_name: World LLM name
            role_llm_name: Role LLM name
            embedding_name: Embedding model name
            embedding: Optional pre-loaded embedding instance (for reuse)
        """
        self.role_llm_name: str = role_llm_name
        self.world_llm_name: str = world_llm_name
        self.embedding_name: str = embedding_name
        
        config = load_json_file(preset_path)
        self.preset_path = preset_path
        self.config: Dict = config
        self.experiment_name: str = (os.path.basename(preset_path).replace(".json", "") + "/" +
                                     config["experiment_subname"] + "_" + role_llm_name)
        
        performer_codes: List[str] = config['performer_codes']
        world_file_path: str = config["world_file_path"]
        map_file_path: str = config.get("map_file_path", "")
        role_file_dir: str = config.get("role_file_dir", "./data/roles/")
        loc_file_path: str = config["loc_file_path"]
        
        self.language: str = config.get("language", "zh")
        self.source: str = config.get("source", "")
        
        self.idx: int = 0
        self.cur_round: int = 0
        self.start_time = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        self.current_status = {
            "location_code": "",
            "group": performer_codes,
        }
        
        # Initialize LLMs and logger
        self.role_llm = get_models(role_llm_name)
        self.logger = get_logger(self.experiment_name)
        
        # Initialize embedding - use provided instance or load new one
        if embedding is not None:
            self.embedding = embedding
        else:
            self.embedding = get_embedding_model(embedding_name, language=self.language)
        
        # Initialize performers
        self.init_performers(
            performer_codes=performer_codes,
            role_file_dir=role_file_dir,
            world_file_path=world_file_path,
            llm=self.role_llm,
            embedding=self.embedding
        )
        
        # Initialize orchestrator
        if world_llm_name == role_llm_name:
            self.world_llm = self.role_llm
        else:
            self.world_llm = get_models(world_llm_name)
        
        self.init_orchestrator_from_file(
            world_file_path=world_file_path,
            map_file_path=map_file_path,
            loc_file_path=loc_file_path,
            llm=self.world_llm,
            embedding=self.embedding
        )
        
        # Initialize history manager
        self.history_manager = HistoryManager()
        
        # Initialize simulation modules
        self._init_simulation_modules()
    
    def _init_simulation_modules(self):
        """Initialize all simulation modules."""
        # State manager
        self.state_manager = StateManager(
            self.performers,
            self.orchestrator,
            self.role_codes,
            self.language
        )
        
        # Record manager
        self.record_manager = RecordManager(
            self.performers,
            self.history_manager,
            self.cur_round
        )
        
        # Event manager
        self.event_manager = EventManager(
            self.performers,
            self.orchestrator,
            self.state_manager,
            self.history_manager,
            self.role_codes,
            self.language
        )
        self.event_manager.set_intervention(self.config.get("intervention", ""))
        self.event_manager.set_script(self.config.get("script", ""))
        
        # Movement manager
        self.movement_manager = MovementManager(
            self.performers,
            self.orchestrator,
            self.state_manager,
            self.record_manager,
            self.logger,
            self.language
        )
        
        # Scene manager
        self.scene_manager = SceneManager(
            self.performers,
            self.orchestrator,
            self.state_manager,
            self.history_manager,
            self.role_codes,
            self.language
        )
        
        # Persistence
        self.persistence = Persistence(
            self.experiment_name,
            self.role_llm_name,
            self.start_time,
            self.config
        )
        
        # Interaction handler
        self.interaction_handler = InteractionHandler(
            self.performers,
            self.orchestrator,
            self.state_manager,
            self.record_manager,
            self.history_manager,
            self.event_manager,
            self.current_status,
            self.role_codes,
            self.logger,
            self.language
        )
        
        # Simulator
        self.simulator = Simulator(
            self.performers,
            self.orchestrator,
            self.state_manager,
            self.record_manager,
            self.interaction_handler,
            self.event_manager,
            self.movement_manager,
            self.scene_manager,
            self.persistence,
            self.history_manager,
            self.current_status,
            self.role_codes,
            self.logger,
            self.language
        )
    
    def init_performers(self,
                       performer_codes: List[str],
                       role_file_dir: str,
                       world_file_path: str,
                       llm=None,
                       embedding=None) -> None:
        """Initialize performers."""
        self.role_codes: List[str] = performer_codes
        self.performers: Dict[str, Performer] = {}
        
        for role_code in performer_codes:
            if check_role_code_availability(role_code, role_file_dir):
                self.performers[role_code] = Performer(
                    role_code=role_code,
                    role_file_dir=role_file_dir,
                    world_file_path=world_file_path,
                    source=self.source,
                    language=self.language,
                    llm_name=self.role_llm_name,
                    llm=llm,
                    embedding_name=self.embedding_name,
                    embedding=embedding
                )
            else:
                print(f"Warning: The specified role `{role_code}` does not exist.")
    
    def init_orchestrator_from_file(self,
                                   world_file_path: str,
                                   map_file_path: str,
                                   loc_file_path: str,
                                   llm=None,
                                   embedding=None) -> None:
        """Initialize orchestrator from file."""
        self.orchestrator: Orchestrator = Orchestrator(
            world_file_path=world_file_path,
            location_file_path=loc_file_path,
            map_file_path=map_file_path,
            llm_name=self.world_llm_name,
            llm=llm,
            embedding_name=self.embedding_name,
            embedding=embedding,
            language=self.language
        )
        for role_code in self.performers:
            self.performers[role_code].world_db = self.orchestrator.db
            self.performers[role_code].world_db_name = self.orchestrator.db_name
    
    def init_role_locations(self, random_allocate: bool = True):
        """Set initial positions of the roles."""
        init_locations_code = random.choices(self.orchestrator.locations, k=len(self.role_codes))
        for i, role_code in enumerate(self.role_codes):
            self.performers[role_code].set_location(
                init_locations_code[i],
                self.orchestrator.find_location_name(init_locations_code[i])
            )
            info_text = (f"{self.performers[role_code].nickname} 现在位于 {self.orchestrator.find_location_name(init_locations_code[i])}"
                        if self.language == "zh"
                        else f"{self.performers[role_code].nickname} is now located at {self.orchestrator.find_location_name(init_locations_code[i])}")
            self.log(info_text)
    
    def reset_llm(self, role_llm_name, world_llm_name):
        """Reset LLMs."""
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
    
    def simulate_generator(self,
                          rounds: int = 10,
                          save_dir: str = "",
                          if_save: Literal[0, 1] = 0,
                          mode: Literal["free", "script"] = "free",
                          scene_mode: Literal[0, 1] = 1,
                          meta_info: Dict[str, Any] = None):
        """Main simulation generator."""
        # Update simulator with server reference
        self.simulator._server_instance = self
        
        # If meta_info is not provided, create default
        # Note: continue_simulation_from_file should be called before this
        if meta_info is None:
            meta_info = {
                "location_setted": False,
                "goal_setted": False,
                "round": 0,
                "sub_round": 0,
            }
        
        yield from self.simulator.simulate_generator(
            rounds=rounds,
            save_dir=save_dir,
            if_save=if_save,
            mode=mode,
            scene_mode=scene_mode,
            meta_info=meta_info
        )
    
    def log(self, text: str):
        """Log text."""
        self.logger.info(text)
        print(text)
    
    # Compatibility methods for backward compatibility
    @property
    def event(self):
        """Get current event."""
        return self.event_manager.event
    
    @event.setter
    def event(self, value):
        """Set current event."""
        self.event_manager.event = value
    
    @property
    def intervention(self):
        """Get intervention."""
        return self.event_manager.intervention
    
    @intervention.setter
    def intervention(self, value):
        """Set intervention."""
        self.event_manager.set_intervention(value)
    
    @property
    def script(self):
        """Get script."""
        return self.event_manager.script
    
    @script.setter
    def script(self, value):
        """Set script."""
        self.event_manager.set_script(value)
    
    @property
    def progress(self):
        """Get progress."""
        return self.event_manager.progress
    
    @progress.setter
    def progress(self, value):
        """Set progress."""
        self.event_manager.update_progress(value)
    
    @property
    def moving_roles_info(self):
        """Get moving roles info."""
        return self.movement_manager.moving_roles_info
    
    @property
    def scene_characters(self):
        """Get scene characters."""
        return self.scene_manager.scene_characters
    
    @property
    def event_history(self):
        """Get event history."""
        return self.event_manager.event_history
    
    def get_event(self):
        """Get event."""
        return self.event_manager.get_event()
    
    def get_script(self):
        """Get script."""
        return self.event_manager.get_script()
    
    def update_event(self, group: List[str], top_k: int = 1):
        """Update event."""
        return self.event_manager.update_event(group, top_k)
    
    def script_instruct(self, last_progress: str, top_k: int = 5):
        """Script instruct."""
        return self.event_manager.script_instruct(last_progress, top_k)
    
    def record(self, *args, **kwargs):
        """Record event."""
        return self.record_manager.record(*args, **kwargs)
    
    def settle_movement(self):
        """Settle movement."""
        return self.movement_manager.settle_movement()
    
    def _find_group(self, role_code):
        """Find group."""
        return self.state_manager.find_group(role_code)
    
    def _find_roles_at_location(self, location_code, name=False):
        """Find roles at location."""
        return self.state_manager.find_roles_at_location(location_code, name)
    
    def _get_status_text(self, group):
        """Get status text."""
        return self.state_manager.get_status_text(group)
    
    def _get_group_members_info_text(self, group, profile=False, status=False):
        """Get group members info text."""
        return self.state_manager.get_group_members_info_text(group, profile, status)
    
    def _get_group_members_info_dict(self, group):
        """Get group members info dict."""
        return self.state_manager.get_group_members_info_dict(group)
    
    def _get_locations_info(self, detailed=True):
        """Get locations info."""
        return self.state_manager.get_locations_info(detailed)
    
    def _name2code(self, roles):
        """Convert name to code."""
        from modules.utils.role_utils import name2code
        return name2code(roles, self.performers, self.role_codes, self.language)
    
    def _save_current_simulation(self, stage: Literal["location", "goal", "action"], current_round: int = 0, sub_round: int = 0):
        """Save current simulation."""
        return self.persistence.save_current_simulation(
            stage,
            current_round,
            sub_round,
            self.__getstate__(),
            self.history_manager,
            self.performers,
            self.orchestrator,
            self.role_codes
        )
    
    def continue_simulation_from_file(self, save_dir: str):
        """Continue simulation from file."""
        return self.persistence.continue_simulation_from_file(
            save_dir,
            self,
            self.performers,
            self.orchestrator,
            self.history_manager,
            self.role_codes
        )
    
    def __getstate__(self):
        """Get state for serialization."""
        states = {key: value for key, value in self.__dict__.items()
                  if isinstance(value, (str, int, list, dict, bool, type(None)))
                  and key not in ['performers', 'orchestrator', 'logger', 'role_llm', 'world_llm',
                                  'embedding', 'state_manager', 'record_manager', 'interaction_handler',
                                  'event_manager', 'movement_manager', 'scene_manager', 'persistence',
                                  'simulator', 'history_manager']}
        return states
    
    def __setstate__(self, states):
        """Set state from serialization."""
        # Update basic state first
        self.__dict__.update(states)
        # Note: performers, orchestrator, and history_manager are loaded separately
        # in continue_simulation_from_file, so we don't need to re-initialize here
        # The modules will be initialized when _init_simulation_modules is called
        # after the performers and orchestrator are loaded
    
    def reset_session(self):
        """Reset session."""
        # 1. Clear global history
        self.history_manager.detailed_history = []
        
        # 2. Reset server state
        self.cur_round = 0
        self.event_manager.progress = "剧本刚刚开始，还什么都没有发生" if self.language == 'zh' else "The story has just begun, nothing happens yet."
        self.movement_manager.moving_roles_info = {}
        self.current_status = {
            "location_code": "",
            "group": self.role_codes,
        }
        self.scene_manager.scene_characters = {}
        self.event_manager.event_history = []
        self.start_time = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        
        # 重置事件管理器状态
        # 重新从config读取intervention和script（如果config中有的话）
        # 如果没有，则重置为空字符串
        intervention_from_config = self.config.get("intervention", "")
        script_from_config = self.config.get("script", "")
        self.event_manager.set_intervention(intervention_from_config)
        self.event_manager.set_script(script_from_config)
        # 重置当前事件为空（会在下次启动时重新生成）
        self.event_manager.event = ""
        
        # 3. Reset each role's state
        for role_code in self.role_codes:
            performer = self.performers[role_code]
            
            # Clear role history
            performer.history_manager.detailed_history = []
            
            # Reset role state
            performer.acted = False
            performer.status = ""
            performer.goal = ""
            performer.motivation = ""  # 重置动机
            performer.location_code = ""
            performer.location_name = ""
            
            # Recreate role temporary memory
            from modules.memory import build_performer_memory
            performer.memory = build_performer_memory(
                llm_name=self.role_llm_name,
                embedding_name=self.embedding_name,
                embedding=self.embedding,
                db_name=performer.db_name.replace("role", "memory"),
                language=self.language,
                type="naive"
            )
            
            # Clear role prompts
            performer.prompts = []
        
        # 4. Reset orchestrator temporary data
        self.orchestrator.history = []
        self.orchestrator.prompts = []
        
        print("Session重置完成：所有临时对话内容已清空")

