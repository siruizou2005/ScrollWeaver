"""
Simulator for ScrollWeaver simulation.
"""

from typing import Dict, Any, List, Literal, Generator, Tuple
import uuid
import random
from modules.utils.role_utils import name2code


class Simulator:
    """Core simulation loop."""
    
    def __init__(self,
                 performers: Dict,
                 orchestrator,
                 state_manager,
                 record_manager,
                 interaction_handler,
                 event_manager,
                 movement_manager,
                 scene_manager,
                 persistence,
                 history_manager,
                 current_status: Dict,
                 role_codes: List[str],
                 logger,
                 language: str = "zh"):
        """
        Initialize Simulator.
        
        Args:
            performers: Dictionary of performers
            orchestrator: Orchestrator instance
            state_manager: StateManager instance
            record_manager: RecordManager instance
            interaction_handler: InteractionHandler instance
            event_manager: EventManager instance
            movement_manager: MovementManager instance
            scene_manager: SceneManager instance
            persistence: Persistence instance
            history_manager: HistoryManager instance
            current_status: Current status dictionary
            role_codes: List of role codes
            logger: Logger instance
            language: Language code
        """
        self.performers = performers
        self.orchestrator = orchestrator
        self.state_manager = state_manager
        self.record_manager = record_manager
        self.interaction_handler = interaction_handler
        self.event_manager = event_manager
        self.movement_manager = movement_manager
        self.scene_manager = scene_manager
        self.persistence = persistence
        self.history_manager = history_manager
        self.current_status = current_status
        self.role_codes = role_codes
        self.logger = logger
        self.language = language
        self.cur_round: int = 0
        self.mode: str = "free"
    
    def simulate_generator(self,
                          rounds: int = 10,
                          save_dir: str = "",
                          if_save: Literal[0, 1] = 0,
                          mode: Literal["free", "script"] = "free",
                          scene_mode: Literal[0, 1] = 1,
                          meta_info: Dict[str, Any] = None) -> Generator[Tuple[str, str, str, Any], None, None]:
        """
        Main simulation generator.
        
        Args:
            rounds: Maximum number of rounds
            save_dir: Save directory
            if_save: Whether to save
            mode: Simulation mode
            scene_mode: Scene mode
            meta_info: Meta information from continue_simulation_from_file (optional)
            
        Yields:
            Tuple of (message_type, role_code, text, record_id)
        """
        self.mode = mode
        self.persistence.set_if_save(if_save)
        
        # Use provided meta_info, or create default if not provided
        # Note: continue_simulation_from_file should be called BEFORE this method
        if meta_info is None:
            meta_info = {
                "location_setted": False,
                "goal_setted": False,
                "round": 0,
                "sub_round": 0,
            }
        
        start_round: int = meta_info["round"]
        sub_start_round: int = meta_info["sub_round"] if "sub_round" in meta_info else 0
        if start_round == rounds:
            return
        
        # Setting Locations
        if not meta_info["location_setted"]:
            self.logger.info("========== Start Location Setting ==========")
            self._init_role_locations()
            if hasattr(self, '_server_instance'):
                self.persistence.save_current_simulation(
                    "location",
                    0,
                    0,
                    self._get_server_state(),
                    self.history_manager,
                    self.performers,
                    self.orchestrator,
                    self.role_codes
                )
        
        # Setting Goals
        if not meta_info["goal_setted"]:
            yield ("system", "", "-- Setting Goals --", None)
            self.logger.info("========== Start Goal Setting ==========")
            
            if self.mode == "free":
                self.event_manager.get_event()
                self.logger.info(f"--------- Free Mode: Current Event ---------\n{self.event_manager.event}\n")
                yield ("system", "", f"--------- Current Event ---------\n{self.event_manager.event}\n", None)
                self.event_manager.add_event_to_history(self.event_manager.event)
            elif self.mode == "script":
                self.event_manager.get_script()
                self.logger.info(f"--------- Script Mode: Setted Script ---------\n{self.event_manager.script}\n")
                yield ("system", "", f"--------- Setted Script ---------\n{self.event_manager.script}\n", None)
                self.event_manager.add_event_to_history(self.event_manager.event)
            
            if self.mode == "free":
                # Get all performers info for motivation setting
                all_performers_dict = self.state_manager.get_group_members_info_dict(self.role_codes)
                for role_code in self.role_codes:
                    motivation = self.performers[role_code].set_motivation(
                        world_description=self.orchestrator.description,
                        other_roles_info=all_performers_dict,
                        intervention=self.event_manager.event,
                        script=self.event_manager.script
                    )
                    info_text = (f"{self.performers[role_code].nickname} 设立了动机: {motivation}"
                               if self.language == "zh"
                               else f"{self.performers[role_code].nickname} has set the motivation: {motivation}")
                    
                    record_id = str(uuid.uuid4())
                    self.logger.info(info_text)
                    self.record_manager.record(
                        role_code=role_code,
                        detail=info_text,
                        actor=role_code,
                        group=[role_code],
                        actor_type='role',
                        act_type="goal setting",
                        record_id=record_id
                    )
                    yield ("role", role_code, info_text, record_id)
            
            if hasattr(self, '_server_instance'):
                self.persistence.save_current_simulation(
                    "goal",
                    0,
                    0,
                    self._get_server_state(),
                    self.history_manager,
                    self.performers,
                    self.orchestrator,
                    self.role_codes
                )
        
        yield ("system", "", "-- Simulation Started --", None)
        selected_role_codes = []
        
        # Simulating
        for current_round in range(start_round, rounds):
            self.cur_round = current_round
            self.record_manager.update_cur_round(current_round)
            self.logger.info(f"========== Round {current_round+1} Started ==========")
            
            if self.event_manager.event and current_round >= 1:
                self.logger.info(f"--------- Current Event ---------\n{self.event_manager.event}\n")
                yield ("world", "", "-- Current Event --\n" + self.event_manager.event, None)
                self.event_manager.add_event_to_history(self.event_manager.event)
            
            if len(self.movement_manager.moving_roles_info) == len(self.role_codes):
                self.movement_manager.settle_movement()
                continue
            
            # Characters in next scene
            if scene_mode:
                group = self.scene_manager.decide_scene_actors(
                    selected_role_codes,
                    self.movement_manager.moving_roles_info,
                    self.event_manager.event,
                    scene_mode=True
                )
                selected_role_codes += group
                if len(selected_role_codes) >= len(self.role_codes):
                    selected_role_codes = []
            else:
                group = self.role_codes
            
            self.current_status['group'] = group
            if group:
                self.current_status['location_code'] = self.performers[group[0]].location_code
            self.scene_manager.set_scene_characters(current_round, group)
            
            start_idx = len(self.history_manager)
            
            sub_round = sub_start_round
            for sub_round in range(sub_start_round, 3):
                if self.mode == "script":
                    instruction = self.event_manager.script_instruct(self.event_manager.progress)
                    for code in instruction:
                        if code == "progress":
                            progress_msg = ("剧本进度：" + instruction["progress"]
                                          if self.language == "zh"
                                          else "Current Stage:" + instruction["progress"])
                            self.logger.info(progress_msg)
                            self.event_manager.update_progress(instruction["progress"])
                        elif code in self.role_codes:
                            self.performers[code].goal = instruction[code]
                else:
                    for role_code in group:
                        self.performers[role_code].update_goal(
                            other_roles_status=self.state_manager.get_status_text(self.role_codes)
                        )
                
                for role_code in group:
                    current_role_code = role_code
                    if scene_mode:
                        current_role_code = name2code(
                            self.orchestrator.decide_next_actor(
                                "\n".join(self.history_manager.get_recent_history(3)),
                                self.state_manager.get_group_members_info_text(group, status=True),
                                self.event_manager.script
                            ),
                            self.performers,
                            self.role_codes,
                            self.language
                        )
                        if not isinstance(current_role_code, str):
                            current_role_code = role_code
                    
                    yield from self.interaction_handler.implement_next_plan(role_code=current_role_code, group=group)
                    if hasattr(self, '_server_instance'):
                        self.persistence.save_current_simulation(
                            "action",
                            current_round,
                            sub_round,
                            self._get_server_state(),
                            self.history_manager,
                            self.performers,
                            self.orchestrator,
                            self.role_codes
                        )
                
                if_end, epilogue = self.orchestrator.judge_if_ended(
                    "\n".join(self.history_manager.get_recent_history(len(self.history_manager) - start_idx))
                )
                if if_end:
                    record_id = str(uuid.uuid4())
                    self.logger.info("--Epilogue--: " + epilogue)
                    self.record_manager.record(
                        role_code="None",
                        detail=epilogue,
                        actor_type="world",
                        act_type="epilogue",
                        actor="world",
                        group=[],
                        record_id=record_id
                    )
                    yield ("world", "", "--Epilogue--: " + epilogue, record_id)
                    break
            
            for role_code in group:
                yield from self.movement_manager.decide_whether_to_move(
                    role_code=role_code,
                    group=self.state_manager.find_group(role_code)
                )
                self.performers[role_code].update_status()
            
            self.movement_manager.settle_movement()
            self.event_manager.update_event(group)
            
            sub_start_round = 0
            if hasattr(self, '_server_instance'):
                self.persistence.save_current_simulation(
                    "action",
                    current_round + 1,
                    sub_round + 1,
                    self._get_server_state(),
                    self.history_manager,
                    self.performers,
                    self.orchestrator,
                    self.role_codes
                )
    
    def _init_role_locations(self, random_allocate: bool = True) -> None:
        """Initialize role locations."""
        init_locations_code = random.choices(self.orchestrator.locations, k=len(self.role_codes))
        for i, role_code in enumerate(self.role_codes):
            self.performers[role_code].set_location(
                init_locations_code[i],
                self.orchestrator.find_location_name(init_locations_code[i])
            )
            info_text = (f"{self.performers[role_code].nickname} 现在位于 {self.orchestrator.find_location_name(init_locations_code[i])}"
                        if self.language == "zh"
                        else f"{self.performers[role_code].nickname} is now located at {self.orchestrator.find_location_name(init_locations_code[i])}")
            self.logger.info(info_text)
    
    def _get_server_state(self) -> Dict[str, Any]:
        """Get server state for serialization."""
        if hasattr(self, '_server_instance'):
            return self._server_instance.__getstate__()
        return {}
    
    def __getstate__(self) -> Dict[str, Any]:
        """Get state for serialization."""
        states = {key: value for key, value in self.__dict__.items()
                  if isinstance(value, (str, int, list, dict, bool, type(None)))
                  and key not in ['performers', 'orchestrator', 'logger', 'state_manager',
                                  'record_manager', 'interaction_handler', 'event_manager',
                                  'movement_manager', 'scene_manager', 'persistence',
                                  'history_manager']}
        return states
    
    def __setstate__(self, states: Dict[str, Any]) -> None:
        """Set state from serialization."""
        self.__dict__.update(states)

