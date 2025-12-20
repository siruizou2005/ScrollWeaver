import sys
from collections import defaultdict
sys.path.append("../")
import os
from typing import Any, Dict, List, Optional, Literal
from modules.embedding import get_embedding_model
from modules.memory import build_performer_memory
from modules.history_manager import HistoryManager
from modules.personality_model import PersonalityProfile
from modules.dual_process_agent import DualProcessAgent
from modules.dynamic_state_manager import DynamicStateManager
from modules.style_vector_db import StyleVectorDB
from sw_utils import *
import random
import warnings
warnings.filterwarnings("ignore")



class Performer:
    def __init__(self, 
                 role_code: str,
                 role_file_dir: str,
                 world_file_path: str,
                 source: str = "",
                 language: str = "en",
                 db_type: str = "chroma",
                 llm_name: str = "gpt-4o-mini",
                 llm = None,
                 embedding_name: str = "bge-small",
                 embedding = None
                 ):
        super(Performer, self).__init__()
        self.language: str  = language
        self.role_code: str = role_code
        self.embedding_name = embedding_name  # 保存embedding_name用于延迟初始化
        
        self.history_manager = HistoryManager()
        self.prompts: List[Dict] = []
        self.acted: bool = False
        self.status: str = ""
        self.goal: str = ""
        self.location_code: str = ""
        self.location_name: str = ""
        self.motivation: str = ""
        
        self._init_from_file(role_code, role_file_dir, world_file_path, source)
        self._init_prompt()
        
        self.llm_name = llm_name
        if llm == None:
            llm = get_models(llm_name)
        self.llm = llm
        
        if embedding is None:
            embedding = get_embedding_model(embedding_name, language=self.language)
        
        self.db_name = clean_collection_name(f"role_{role_code}_{embedding_name}")
        
        # 优化：如果role_data为空，延迟初始化数据库（提升NPC加载速度）
        if self.role_data and len(self.role_data) > 0:
            self.db = build_db(data=self.role_data,
                               db_name=self.db_name,
                               db_type=db_type,
                               embedding=embedding)
            self._db_initialized = True
        else:
            # 空数据，延迟初始化（仅在需要时创建）
            self.db = None
            self._db_initialized = False
            self._db_embedding = embedding  # 保存embedding用于延迟初始化
            self._db_type = db_type
        
        self.world_db = None
        self.world_db_name = ""
        
        # 优化：延迟初始化记忆系统（如果role_data为空）
        if self.role_data and len(self.role_data) > 0:
            self.memory = build_performer_memory(llm_name=llm_name,
                                                  embedding_name=embedding_name,
                                                  embedding=embedding,
                                                  db_name=self.db_name.replace("role","memory"),
                                                  language=self.language,
                                                  type="naive")
            self._memory_initialized = True
        else:
            # 延迟初始化
            self.memory = None
            self._memory_initialized = False
            self._memory_llm_name = llm_name
            self._memory_embedding_name = embedding_name
            self._memory_embedding = embedding  # 保存embedding用于延迟初始化
            self._memory_language = self.language
            # 确保embedding存在（如果为None，延迟创建）
            if self._memory_embedding is None:
                # embedding会在需要时通过get_embedding_model创建
                pass
        
        # 初始化双重思维链和动态状态管理器（如果有人格画像）
        self.dual_process_agent: Optional[DualProcessAgent] = None
        self.dynamic_state_manager: Optional[DynamicStateManager] = None
        self.style_vector_db: Optional[StyleVectorDB] = None
        
        if self.personality_profile:
            self.dual_process_agent = DualProcessAgent(llm=self.llm, language=self.language)
            self.dynamic_state_manager = DynamicStateManager(llm=self.llm, language=self.language)
            
            # 初始化风格向量数据库（如果存在）
            if self.style_vector_db_name and embedding:
                self.style_vector_db = StyleVectorDB(
                    db_name=self.style_vector_db_name,
                    embedding_name=embedding_name,
                    db_type=db_type,
                    language=self.language
                )
        
    def _init_prompt(self):
        if self.language == 'zh':
            from modules.prompt.performer_prompt_zh \
                import ROLE_PLAN_PROMPT,ROLE_SINGLE_ROLE_RESPONSE_PROMPT,ROLE_MULTI_ROLE_RESPONSE_PROMPT,ROLE_SET_GOAL_PROMPT,INTERVENTION_PROMPT,UPDATE_GOAL_PROMPT,UPDATE_STATUS_PROMPT,ROLE_SET_MOTIVATION_PROMPT,SCRIPT_ATTENTION_PROMPT,ROLE_MOVE_PROMPT,SUMMARIZE_PROMPT,ROLE_NPC_RESPONSE_PROMPT
            
        else:
            from modules.prompt.performer_prompt_en \
                import ROLE_PLAN_PROMPT,ROLE_SINGLE_ROLE_RESPONSE_PROMPT,ROLE_MULTI_ROLE_RESPONSE_PROMPT,ROLE_SET_GOAL_PROMPT,INTERVENTION_PROMPT,UPDATE_GOAL_PROMPT,UPDATE_STATUS_PROMPT,ROLE_SET_MOTIVATION_PROMPT,SCRIPT_ATTENTION_PROMPT,ROLE_MOVE_PROMPT,SUMMARIZE_PROMPT,ROLE_NPC_RESPONSE_PROMPT
        self._ROLE_SET_GOAL_PROMPT = ROLE_SET_GOAL_PROMPT
        self._ROLE_PLAN_PROMPT = ROLE_PLAN_PROMPT
        self._ROLE_SINGLE_ROLE_RESPONSE_PROMPT = ROLE_SINGLE_ROLE_RESPONSE_PROMPT
        self._ROLE_MULTI_ROLE_RESPONSE_PROMPT = ROLE_MULTI_ROLE_RESPONSE_PROMPT
        self._INTERVENTION_PROMPT = INTERVENTION_PROMPT
        self._UPDATE_GOAL_PROMPT = UPDATE_GOAL_PROMPT
        self._UPDATE_STATUS_PROMPT = UPDATE_STATUS_PROMPT
        self._ROLE_SET_MOTIVATION_PROMPT = ROLE_SET_MOTIVATION_PROMPT
        self._SCRIPT_PROMPT = SCRIPT_ATTENTION_PROMPT
        self._ROLE_MOVE_PROMPT = ROLE_MOVE_PROMPT
        self._SUMMARIZE_PROMPT = SUMMARIZE_PROMPT
        self._ROLE_NPC_RESPONSE_PROMPT = ROLE_NPC_RESPONSE_PROMPT
            
    def _init_from_file(self, 
                        role_code: str, 
                        role_file_dir: str, 
                        world_file_path: str,
                        source:str):
        if source and os.path.exists(os.path.join(role_file_dir, source)):
            for path in get_child_folders(os.path.join(role_file_dir, source)):
                if role_code in path:
                    role_path = path
                    break
        else:
            for path in get_grandchild_folders(role_file_dir):
                if role_code in path:
                    role_path = path
                    break
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        role_profile_path = os.path.join(base_dir, role_path,"role_info.json")
        
        role_info = load_json_file(role_profile_path)
        # self.role_info = role_info
        self.role_profile: str = role_info['profile']
        self.nickname: str = role_info["nickname"]
        self.role_name: str = role_info["role_name"]
        self.relation: str = role_info["relation"]
        self.motivation: str = role_info["motivation"] if "motivation" in role_info else ""
        
        self.activity: float = float(role_info["activity"]) if "activity" in role_info else 1.0
        
        # 加载三层人格模型（如果存在）
        self.personality_profile: Optional[PersonalityProfile] = None
        if "personality_profile" in role_info:
            try:
                self.personality_profile = PersonalityProfile.from_dict(role_info["personality_profile"])
            except Exception as e:
                print(f"Warning: Failed to load personality_profile: {e}")
        
        # 加载风格样本（如果存在）
        self.style_examples: List[Dict[str, str]] = role_info.get("style_examples", [])
        
        # 风格向量数据库名称（如果存在）
        self.style_vector_db_name: Optional[str] = role_info.get("style_vector_db_name")
        self.icon_path: str = os.path.join(base_dir, role_path,"icon.png")
        self.avatar_path: str = os.path.join(base_dir, role_path,"avatar.png")
        for image_type in ['jpg','png','bmp']:
            if os.path.exists(os.path.join(base_dir, role_path,f"./avatar.{image_type}")):
                self.avatar_path: str = os.path.join(base_dir, role_path,f"avatar.{image_type}")
            if os.path.exists(os.path.join(base_dir, role_path,f"./icon.{image_type}")):
                self.icon_path: str = os.path.join(base_dir, role_path,f"icon.{image_type}")

        self.role_data: List[str] = build_performer_data(os.path.join(base_dir, role_path))
        
    # Agent
    def set_motivation(self, 
                       world_description: str, 
                       other_roles_info: Dict[str, Any], 
                       intervention: str = "", 
                       script: str = ""):
        if self.motivation:
            return self.motivation
        other_roles_info_text = self.get_other_roles_info_text(other_roles_info)
        prompt = self._ROLE_SET_MOTIVATION_PROMPT.format(**
            {
                "role_name": self.role_name,
                "profile":self.role_profile,
                "world_description": world_description,
                "other_roles_description": other_roles_info_text,
                "location": self.location_name
            })  
        if script:
            script = self._SCRIPT_PROMPT.format(**
                {"script": script}
            )  
            prompt = prompt + script
        elif intervention:
            intervention = self._INTERVENTION_PROMPT.format(**
                {"intervention": intervention}
            )
            prompt = intervention + prompt + "\n**注意: 在你的动机中考虑全局事件的影响**" if self.language == "zh" else intervention + prompt + "\n**Notice that: You should take the global event into consideration.**"
        
        motivation = self.llm.chat(prompt)
        self.save_prompt(prompt = prompt, detail = motivation)
        self.motivation = motivation
        return motivation
    
    def plan(self, 
             other_roles_info: Dict[str, Any], 
             available_locations: List[str], 
             world_description: str, 
             intervention: str = ""):
        action_history_text = self.retrieve_history(query = "", retrieve=False)
        references = self.retrieve_references(query = action_history_text)
        knowledges = self.retrieve_knowledges(query = action_history_text)
        
        if len(other_roles_info) == 1:
            other_roles_info_text = "没有人在这里。你不能进行涉及角色的互动。" if self.language == "zh" else "No one else is here. You can not interact with roles."
        else:
            other_roles_info_text = self.get_other_roles_info_text(other_roles_info, if_profile = False)
        
        if intervention:
            intervention = self._INTERVENTION_PROMPT.format(**
                {"intervention": intervention}
            )
        prompt = self._ROLE_PLAN_PROMPT.format(**
            {
                "role_name": self.role_name,
                "nickname": self.nickname,
                "profile": self.role_profile,
                "goal": self.goal,
                "status": self.status,
                "history": action_history_text,
                "other_roles_info": other_roles_info_text,
                "world_description": world_description,
                "location": self.location_name,
                "references": references,
                "knowledges":knowledges,
                "big_five_info": self._format_big_five_info(),
                "speaking_style_info": self._format_speaking_style_info()
            }
        )
        prompt = intervention + prompt
        max_tries = 3
        plan = {"action": "待机" if self.language == "zh" else "Stay", 
                "destination": None,
                "interact_type":'no',
                "target_role_codes": [],
                "target_npc_name":None,
                "detail": f"{self.role_name}原地不动，观察情况。" if self.language == "zh" else f"{self.role_name} stays put."
                }
        
        for i in range(max_tries):
            response = self.llm.chat(prompt)
            try:
                plan.update(json_parser(response))
                break
            except Exception as e:
                print(self.role_name)
                print(f"Parsing failure! {i+1}th tries. Error:", e)   
                print(response)
        plan["role_code"] = self.role_code
        self.save_prompt(detail=plan["detail"],
                      prompt=prompt)
        return plan
    
    def plan_with_style(self, 
             other_roles_info: Dict[str, Any], 
             available_locations: List[str], 
             world_description: str, 
             intervention: str = "",
             style_hint: str = "",
             temperature: float = 0.8):
        """带风格提示和温度参数的plan方法"""
        action_history_text = self.retrieve_history(query = "", retrieve=False)
        references = self.retrieve_references(query = action_history_text)
        knowledges = self.retrieve_knowledges(query = action_history_text)
        
        if len(other_roles_info) == 1:
            other_roles_info_text = "没有人在这里。你不能进行涉及角色的互动。" if self.language == "zh" else "No one else is here. You can not interact with roles."
        else:
            other_roles_info_text = self.get_other_roles_info_text(other_roles_info, if_profile = False)
        
        if intervention:
            intervention = self._INTERVENTION_PROMPT.format(**{"intervention": intervention})
        
        # 构建基础prompt
        prompt = self._ROLE_PLAN_PROMPT.format(**{
            "role_name": self.role_name,
            "nickname": self.nickname,
            "profile": self.role_profile,
            "goal": self.goal,
            "status": self.status,
            "history": action_history_text,
            "other_roles_info": other_roles_info_text,
            "world_description": world_description,
            "location": self.location_name,
            "references": references,
            "knowledges": knowledges,
            "big_five_info": self._format_big_five_info(),
            "speaking_style_info": self._format_speaking_style_info()
        })
        
        # 添加风格提示
        if style_hint:
            style_prompt = f"\n\n## 行动风格要求\n{style_hint}\n" if self.language == "zh" else f"\n\n## Action Style Requirement\n{style_hint}\n"
            prompt = prompt + style_prompt
        
        prompt = intervention + prompt
        max_tries = 3
        plan = {"action": "待机" if self.language == "zh" else "Stay", 
                "destination": None,
                "interact_type":'no',
                "target_role_codes": [],
                "target_npc_name":None,
                "detail": f"{self.role_name}原地不动，观察情况。" if self.language == "zh" else f"{self.role_name} stays put."
                }
        
        for i in range(max_tries):
            # 使用指定的温度参数调用LLM
            response = self.llm.chat(prompt, temperature=temperature)
            try:
                parsed_plan = json_parser(response)
                plan.update(parsed_plan)
                # 检查detail是否为空或只包含空白字符，如果为空则继续重试
                detail = plan.get("detail", "")
                if detail and detail.strip():
                    # detail有效，退出循环
                    break
                else:
                    # detail为空，继续重试
                    if i < max_tries - 1:
                        print(f"{self.role_name}: Parsed successfully but detail is empty, retrying ({i+1}/{max_tries})...")
                        # 恢复默认detail，避免被空字符串覆盖
                        plan["detail"] = f"{self.role_name}原地不动，观察情况。" if self.language == "zh" else f"{self.role_name} stays put."
                    else:
                        print(f"{self.role_name}: Warning: detail is empty after {max_tries} attempts, using default detail")
            except Exception as e:
                print(self.role_name)
                print(f"Parsing failure! {i+1}th tries. Error:", e)   
                print(response)
        plan["role_code"] = self.role_code
        self.save_prompt(detail=plan["detail"], prompt=prompt)
        return plan
    
    def npc_interact(self,
                     npc_name:str,
                     npc_response:str,
                     history:str,
                     intervention:str = ""
                     ):
        references = self.retrieve_references(npc_response)
        knowledges = self.retrieve_knowledges(query = npc_response)
        
        if intervention:
            intervention = self._INTERVENTION_PROMPT.format(**
                {"intervention": intervention}
            )
        prompt = self._ROLE_NPC_RESPONSE_PROMPT.format(**
            {
                "role_name": self.role_name,
                "nickname": self.nickname,
                "profile": self.role_profile,
                "goal": self.goal,
                "npc_name":npc_name,
                "npc_response":npc_response,
                "references": references,
                "knowledges":knowledges,
                "dialogue_history": history
            }
            )
        prompt = intervention + prompt
        interaction = {
                    "if_end_interaction": True,
                    "detail": "",
                    }
        response = self.llm.chat(prompt)
        interaction.update(json_parser(response))
        self.save_prompt(detail = interaction["detail"], 
                      prompt = prompt)
        return interaction
    
    def single_role_interact(self, 
                             action_maker_code: str, 
                             action_maker_name: str,
                             action_detail: str, 
                             action_maker_profile: str, 
                             intervention: str = ""):
        references = self.retrieve_references(action_detail)
        # 当上一条为用户输入时，优先用用户输入做query并启用语义检索，扩大top_k
        use_user_query = False
        user_query_text = ""
        if hasattr(self, 'history_manager') and len(self.history_manager) > 0:
            last = self.history_manager.detailed_history[-1]
            if last.get('act_type') in ('user_input', 'user_input_placeholder'):
                use_user_query = True
                user_query_text = last.get('detail', '')
        if use_user_query and user_query_text.strip():
            history = self.retrieve_history(query = user_query_text, top_k = 6, retrieve = True)
        else:
            history = self.retrieve_history(query = action_detail)
        knowledges = self.retrieve_knowledges(query = action_detail)
        
        relation = f"role_code:{action_maker_code}\n" + self.search_relation(action_maker_code)
        
        # 检查是否应该使用双重思维链
        use_dual_process = False
        if self.personality_profile and self.dual_process_agent:
            other_role_info = {"role_code": action_maker_code, "role_name": action_maker_name}
            relationship_map = self.personality_profile.dynamic_state.relationship_map
            use_dual_process = self.dual_process_agent.is_critical_interaction(
                action_detail=action_detail,
                other_role_info=other_role_info,
                personality_profile=self.personality_profile,
                relationship_map=relationship_map
            )
        
        # 检测是否是用户输入，如果是，增强提示
        is_user_input = False
        user_emphasis = ""
        if hasattr(self, 'history_manager') and len(self.history_manager.detailed_history) > 0:
            last = self.history_manager.detailed_history[-1]
            if last.get('act_type') == 'user_input' and last.get('role_code') == action_maker_code:
                is_user_input = True
                user_emphasis = f"\n\n⚠️ **重要提示**：{action_maker_name} 是真实用户，你必须直接、具体地回应他们的问题或意见。不要岔开话题或自说自话。"
        
        if use_dual_process and self.personality_profile:
            # 使用双重思维链
            # Step 1: 生成内心独白
            inner_monologue = self.dual_process_agent.generate_inner_monologue(
                personality_profile=self.personality_profile,
                action_detail=action_detail,
                action_maker_name=action_maker_name,
                history=history,
                goal=self.goal,
                status=self.status
            )
            
            # 检索风格样本
            style_examples = self.style_examples.copy()
            if self.style_vector_db:
                similar_examples = self.style_vector_db.search_similar_style(action_detail, top_k=3)
                style_examples.extend([
                    {"context": ex.get("context", ""), "response": ex["text"]}
                    for ex in similar_examples
                ])
            
            # Step 2: 生成风格化回复
            styled_response = self.dual_process_agent.generate_styled_response(
                inner_monologue=inner_monologue,
                personality_profile=self.personality_profile,
                style_examples=style_examples,
                action_detail=action_detail,
                action_maker_name=action_maker_name,
                history=history
            )
            
            # 构建回复（使用标准格式）
            interaction = {
                "if_end_interaction": False,
                "extra_interact_type": "no",
                "target_npc_name": "",
                "detail": styled_response
            }
            
            # 更新动态状态
            if self.dynamic_state_manager:
                self.dynamic_state_manager.update_state_after_interaction(
                    personality_profile=self.personality_profile,
                    interaction_detail=styled_response,
                    other_role_code=action_maker_code,
                    other_role_name=action_maker_name
                )
                # 保存更新后的状态到role_info.json
                self._save_personality_profile()
            
            self.save_prompt(detail=interaction["detail"], prompt="")
        else:
            # 使用传统方法
            if intervention:
                intervention = self._INTERVENTION_PROMPT.format(**
                    {"intervention": intervention}
                )
            prompt = self._ROLE_SINGLE_ROLE_RESPONSE_PROMPT.format(**
                {
                    "role_name": self.role_name,
                    "nickname": self.nickname,
                    "action_maker_name": action_maker_name,
                    "action_detail": action_detail + user_emphasis,  # 添加用户输入强调 
                    "profile": self.role_profile,
                    "action_maker_profile": action_maker_profile,
                    "relation": relation,
                    "goal": self.goal,
                    "status": self.status,
                    "references": references,
                    "knowledges":knowledges,
                    "history": history,
                    "big_five_info": self._format_big_five_info(),
                    "speaking_style_info": self._format_speaking_style_info(),
                    "style_examples": self._format_style_examples()
                }
                )
            prompt = intervention + prompt
            
            max_tries = 3
            interaction = {
                        "if_end_interaction": True,
                        "extra_interact_type":"no",
                        "target_npc_name":"",
                        "detail": "",
                        }
            
            for i in range(max_tries):
                response = self.llm.chat(prompt) 
                try:
                    interaction.update(json_parser(response))
                    break
                except Exception as e:
                    print(f"Parsing failure! {i}th tries. Error:", e)    
                    print(response)
            
            # 更新动态状态（即使不使用双重思维链）
            if self.personality_profile and self.dynamic_state_manager:
                self.dynamic_state_manager.update_state_after_interaction(
                    personality_profile=self.personality_profile,
                    interaction_detail=interaction.get("detail", ""),
                    other_role_code=action_maker_code,
                    other_role_name=action_maker_name
                )
                self._save_personality_profile()
            
            self.save_prompt(detail=interaction["detail"], prompt=prompt)
        
        return interaction
    
    def _save_personality_profile(self):
        """保存更新后的personality_profile到role_info.json"""
        if not self.personality_profile:
            return
        
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            role_info_path = None
            
            # 查找role_info.json路径
            for path in get_grandchild_folders(os.path.join(base_dir, "data", "roles")):
                if self.role_code in path:
                    role_info_path = os.path.join(base_dir, path, "role_info.json")
                    break
            
            if role_info_path and os.path.exists(role_info_path):
                role_info = load_json_file(role_info_path)
                role_info["personality_profile"] = self.personality_profile.to_dict()
                save_json_file(role_info_path, role_info)
        except Exception as e:
            print(f"Warning: Failed to save personality_profile: {e}")
    
    def _format_big_five_info(self) -> str:
        """格式化Big Five信息用于prompt"""
        if not self.personality_profile:
            return ""
        
        big_five = self.personality_profile.core_traits.big_five
        if self.language == "zh":
            return f"""
## 大五人格特征（影响你的思维和决策）：
- 开放性(Openness): {big_five['openness']:.2f} - {'高' if big_five['openness'] > 0.7 else '低' if big_five['openness'] < 0.4 else '中'} - 影响你对新想法和可能性的接受程度
- 尽责性(Conscientiousness): {big_five['conscientiousness']:.2f} - {'高' if big_five['conscientiousness'] > 0.7 else '低' if big_five['conscientiousness'] < 0.4 else '中'} - 影响你的组织性和责任感
- 外向性(Extraversion): {big_five['extraversion']:.2f} - {'高' if big_five['extraversion'] > 0.7 else '低' if big_five['extraversion'] < 0.4 else '中'} - 影响你的社交性和积极性
- 宜人性(Agreeableness): {big_five['agreeableness']:.2f} - {'高' if big_five['agreeableness'] > 0.7 else '低' if big_five['agreeableness'] < 0.4 else '中'} - 影响你的合作性和同理心
- 神经质(Neuroticism): {big_five['neuroticism']:.2f} - {'高' if big_five['neuroticism'] > 0.7 else '低' if big_five['neuroticism'] < 0.4 else '中'} - 影响你的情绪稳定性
"""
        else:
            return f"""
## Big Five Personality Traits (affecting your thinking and decisions):
- Openness: {big_five['openness']:.2f} - {'High' if big_five['openness'] > 0.7 else 'Low' if big_five['openness'] < 0.4 else 'Medium'}
- Conscientiousness: {big_five['conscientiousness']:.2f} - {'High' if big_five['conscientiousness'] > 0.7 else 'Low' if big_five['conscientiousness'] < 0.4 else 'Medium'}
- Extraversion: {big_five['extraversion']:.2f} - {'High' if big_five['extraversion'] > 0.7 else 'Low' if big_five['extraversion'] < 0.4 else 'Medium'}
- Agreeableness: {big_five['agreeableness']:.2f} - {'High' if big_five['agreeableness'] > 0.7 else 'Low' if big_five['agreeableness'] < 0.4 else 'Medium'}
- Neuroticism: {big_five['neuroticism']:.2f} - {'High' if big_five['neuroticism'] > 0.7 else 'Low' if big_five['neuroticism'] < 0.4 else 'Medium'}
"""
    
    def _format_speaking_style_info(self) -> str:
        """格式化语言风格信息用于prompt"""
        if not self.personality_profile:
            return ""
        
        style = self.personality_profile.speaking_style
        if self.language == "zh":
            emoji_info = ""
            if style.emoji_usage["frequency"] != "none":
                preferred = ", ".join(style.emoji_usage.get("preferred", []))
                if preferred:
                    emoji_info = f"\n- 表情使用：{style.emoji_usage['frequency']}，常用表情：{preferred}"
            
            return f"""
## 语言风格要求（严格遵守）：
- 句长偏好：{style.sentence_length}（{'短句为主' if style.sentence_length == 'short' else '长句为主' if style.sentence_length == 'long' else '中等长度' if style.sentence_length == 'medium' else '混合'}）
- 词汇等级：{style.vocabulary_level}（{'学术/正式' if style.vocabulary_level == 'academic' else '口语化' if style.vocabulary_level == 'casual' else '网络用语' if style.vocabulary_level == 'network' else '混合'}）
- 标点习惯：{style.punctuation_habit}（{'少用标点' if style.punctuation_habit == 'minimal' else '标准使用' if style.punctuation_habit == 'standard' else '频繁使用' if style.punctuation_habit == 'excessive' else '混合'}）
- 语气词：{', '.join(style.tone_markers) if style.tone_markers else '无'}
- 口头禅：{', '.join(style.catchphrases) if style.catchphrases else '无'}{emoji_info}
"""
        else:
            emoji_info = ""
            if style.emoji_usage["frequency"] != "none":
                preferred = ", ".join(style.emoji_usage.get("preferred", []))
                if preferred:
                    emoji_info = f"\n- Emoji usage: {style.emoji_usage['frequency']}, preferred: {preferred}"
            
            return f"""
## Speaking Style Requirements (strictly follow):
- Sentence length: {style.sentence_length}
- Vocabulary level: {style.vocabulary_level}
- Punctuation habit: {style.punctuation_habit}
- Tone markers: {', '.join(style.tone_markers) if style.tone_markers else 'none'}
- Catchphrases: {', '.join(style.catchphrases) if style.catchphrases else 'none'}{emoji_info}
"""
    
    def _format_style_examples(self) -> str:
        """格式化Few-Shot样本用于prompt"""
        if not self.style_examples:
            return ""
        
        if self.language == "zh":
            examples_text = "\n## 参考样本（Few-Shot Examples，模仿这些风格）：\n"
            for i, ex in enumerate(self.style_examples[:5], 1):
                examples_text += f"\n样本{i}:\nContext: {ex.get('context', '')}\nResponse: {ex.get('response', '')}\n"
            return examples_text
        else:
            examples_text = "\n## Reference Examples (Few-Shot, imitate this style):\n"
            for i, ex in enumerate(self.style_examples[:5], 1):
                examples_text += f"\nExample {i}:\nContext: {ex.get('context', '')}\nResponse: {ex.get('response', '')}\n"
            return examples_text
    
    def multi_role_interact(self, 
                            action_maker_code: str, 
                            action_maker_name: str, 
                            action_detail: str, 
                            action_maker_profile: str, 
                            other_roles_info: Dict[str, Any], 
                            intervention: str = ""):
        references = self.retrieve_references(query = action_detail)
        # 当上一条为用户输入时，优先用用户输入做query并启用语义检索，扩大top_k
        use_user_query = False
        user_query_text = ""
        is_user_input = False
        user_emphasis = ""
        if hasattr(self, 'history_manager') and len(self.history_manager) > 0:
            last = self.history_manager.detailed_history[-1]
            if last.get('act_type') in ('user_input', 'user_input_placeholder'):
                use_user_query = True
                user_query_text = last.get('detail', '')
                # 检测是否是用户输入
                if last.get('act_type') == 'user_input' and last.get('role_code') == action_maker_code:
                    is_user_input = True
                    user_emphasis = f"\n\n⚠️ **重要提示**：{action_maker_name} 是真实用户，你必须直接、具体地回应他们的问题或意见。不要岔开话题或自说自话。"
        if use_user_query and user_query_text.strip():
            history = self.retrieve_history(query = user_query_text, top_k = 6, retrieve = True)
        else:
            history = self.retrieve_history(query = action_detail)
        knowledges = self.retrieve_knowledges(query = action_detail)
        
        other_roles_info_text = self.get_other_roles_info_text(other_roles_info, if_profile = False)

        if intervention:
            intervention = self._INTERVENTION_PROMPT.format(**
                {"intervention": intervention}
            )
        prompt = self._ROLE_MULTI_ROLE_RESPONSE_PROMPT.format(**
            {
                "role_name": self.role_name,
                "nickname": self.nickname,
                "action_maker_name": action_maker_name,
                "action_detail": action_detail + user_emphasis,  # 添加用户输入强调 
                "profile": self.role_profile,
                "action_maker_profile": action_maker_profile,
                "other_roles_info":other_roles_info_text,
                "goal":self.goal,
                "status": self.status,
                "references": references,
                "knowledges":knowledges,
                "history": history,
                "big_five_info": self._format_big_five_info(),
                "speaking_style_info": self._format_speaking_style_info(),
                "style_examples": self._format_style_examples()
            }
            )
        prompt = intervention + prompt
        max_tries = 3
        interaction = {
                    "if_end_interaction": True,
                    "extra_interact_type":"no",
                    "target_role_code":"",
                    "target_npc_name":"",
                    "visible_role_codes":[],
                    "detail": "",
                    }
        
        for i in range(max_tries):
            response = self.llm.chat(prompt) 
            try:
                interaction.update(json_parser(response))
                break
            except Exception as e:
                print(f"Parsing failure! {i}th tries. Error:", e)    
                print(response)
        self.save_prompt(detail = interaction["detail"], prompt=prompt)
        return interaction
    
    def update_status(self,):
        prompt = self._UPDATE_STATUS_PROMPT.format(**{
            "role_name":self.role_name,
            "status":self.status,
            "history_text":self.retrieve_history(query=""),
            "activity":self.activity
        })
        max_tries = 3
        for i in range(max_tries):
            response = self.llm.chat(prompt) 
            try:
                status = json_parser(response)
                self.status = status["updated_status"]
                self.activity = float(status["activity"])
                break
            except Exception as e:
                print(f"Parsing failure! {i}th tries. Error:", e)    
                print(response)
        
        return
    
    def update_goal(self,other_roles_status: str,instruction: str = ""):
        motivation = self.motivation
        if instruction:
            motivation = instruction
        history = self.retrieve_history(self.motivation)
        if len(history) == 0:
            self.goal = motivation
            return motivation
        
        prompt = self._UPDATE_GOAL_PROMPT.format(**{
            "history":history,
            "motivation":motivation,
            "goal":self.goal,
            "other_roles_status":other_roles_status,
            "location":self.location_name
        })
        response = self.llm.chat(prompt) 
        try:
            new_plan = json_parser(response)
            if new_plan["if_change_goal"]:
                goal = new_plan["updated_goal"]
                self.save_prompt(prompt,response)
                self.goal = goal
                return goal
        except Exception as e:
            print(self.role_name)
            print(f"Parsing failure! Error:", e)    
            print(response)
        return ""
    
    def move(self, 
             locations_info_text: str, 
             locations_info: Dict[str, Any]):
        history_text = self.retrieve_history(query="")
        prompt = self._ROLE_MOVE_PROMPT.format(**{
            "role_name":self.role_name,
            "profile": self.role_profile,
            "goal":self.goal,
            "status":self.status,
            "history":history_text,
            "location":self.location_name,
            "locations_info_text":locations_info_text
            
        })
        response= self.llm.chat(prompt)
        try:
            result = json_parser(response)
            if result["if_move"] and "destination_code" in result and result["destination_code"] in locations_info and result["destination_code"] != self.location_code:
                destination_code = result["destination_code"]
                self.save_prompt(detail = result["detail"],
                              prompt = prompt)
                return True, result["detail"], destination_code
        except Exception as e:
            print(f"Parsing failure! Error:", e)    
            print(response)
        return False, "",self.location_code
    
    def record(self, 
                record):
        self.history_manager.add_record(record)
        
    def save_prompt(self,prompt,detail):
        if prompt:
            self.prompts.append({"prompt":prompt,
                                 "response":detail})
    # Other
    def action_check(self,):
        if self.acted == False:
            self.acted = True
            return True
        dice = random.uniform(0,1)
        if dice > self.activity:
            self.acted = False
            return False
        return True
    
    def retrieve_knowledges(self, query:str, top_k:int=1, max_words = 100):
        if self.world_db is None:
            return ""
        knowledges = "\n".join(self.world_db.search(query, top_k,self.world_db_name))
        knowledges = knowledges[:max_words]
        return knowledges
    
    def retrieve_references(self, query: str, top_k: int = 1):
        # 延迟初始化数据库（如果需要）
        if not self._db_initialized and self.db is None:
            try:
                # 获取或创建embedding
                db_embedding = None
                if hasattr(self, '_db_embedding'):
                    db_embedding = self._db_embedding
                
                if db_embedding is None:
                    # 如果embedding不存在，创建它
                    if hasattr(self, '_memory_embedding_name') and hasattr(self, '_memory_language'):
                        db_embedding = get_embedding_model(
                            self._memory_embedding_name, 
                            language=self._memory_language
                        )
                    elif hasattr(self, 'embedding_name'):
                        db_embedding = get_embedding_model(
                            self.embedding_name, 
                            language=self.language
                        )
                    self._db_embedding = db_embedding
                
                if db_embedding is not None:
                    self.db = build_db(data=[], 
                                       db_name=self.db_name,
                                       db_type=self._db_type,
                                       embedding=db_embedding)
                    self._db_initialized = True
            except Exception as e:
                # 如果初始化失败，记录错误
                print(f"Warning: Failed to initialize database: {e}")
                import traceback
                traceback.print_exc()
                self._db_initialized = True  # 标记为已尝试，避免重复尝试
        
        if self.db is None:
            return ""
        try:
            search_results = self.db.search(query, top_k, self.db_name)
            if search_results is None:
                return ""
            return "\n".join(search_results)
        except Exception as e:
            # 如果搜索失败，返回空字符串
            print(f"Warning: Database search failed: {e}")
            return ""
    
    def retrieve_history(self, query: str, top_k: int = 5, retrieve: bool = False):
        if len(self.history_manager) == 0: return ""
        if len(self.history_manager) >= top_k and retrieve:
            # 延迟初始化记忆系统（如果需要）
            if not self._memory_initialized and self.memory is None:
                try:
                    # 获取或创建embedding
                    memory_embedding = None
                    if hasattr(self, '_memory_embedding'):
                        memory_embedding = self._memory_embedding
                    
                    if memory_embedding is None:
                        # 如果embedding不存在，创建它
                        memory_embedding = get_embedding_model(
                            self._memory_embedding_name, 
                            language=self._memory_language
                        )
                        self._memory_embedding = memory_embedding
                    
                    if memory_embedding is not None:
                        self.memory = build_performer_memory(
                            llm_name=self._memory_llm_name,
                            embedding_name=self._memory_embedding_name,
                            embedding=memory_embedding,
                            db_name=self.db_name.replace("role","memory"),
                            language=self._memory_language,
                            type="naive"
                        )
                        self._memory_initialized = True
                except Exception as e:
                    # 如果初始化失败，记录错误但继续使用历史管理器
                    print(f"Warning: Failed to initialize memory system: {e}")
                    import traceback
                    traceback.print_exc()
                    self._memory_initialized = True  # 标记为已尝试，避免重复尝试
            
            if self.memory is None:
                # 如果记忆系统未初始化，使用历史管理器（包含说话者信息）
                performers = getattr(self, '_performers_ref', None)
                history = "\n" + "\n".join(self.history_manager.get_recent_history(top_k, include_speaker=True, performers=performers))
            else:
                try:
                    search_results = self.memory.search(query, top_k)
                    if search_results is None:
                        search_results = []
                    history = "\n" + "\n".join(search_results) + "\n"
                except Exception as e:
                    # 如果搜索失败，使用历史管理器作为fallback
                    print(f"Warning: Memory search failed: {e}")
                    performers = getattr(self, '_performers_ref', None)
                    history = "\n" + "\n".join(self.history_manager.get_recent_history(top_k, include_speaker=True, performers=performers))
        else:
            performers = getattr(self, '_performers_ref', None)
            history = "\n" + "\n".join(self.history_manager.get_recent_history(top_k, include_speaker=True, performers=performers))
        return history
        
    def get_other_roles_info_text(self, other_roles: List[str], if_relation: bool = True, if_profile: bool = True):
        roles_info_text = ""
        for i, role_code in enumerate(other_roles):
            if role_code == self.role_code :continue
            name = other_roles[role_code]["nickname"]
            profile = other_roles[role_code]["profile"]  if if_profile else ""
            relation = self.search_relation(role_code) if if_relation else ""
            roles_info_text += f"\n{i+1}. {name}\nrole_code:{role_code}\n{relation}\n{profile}\n\n"

        return roles_info_text
    
    def search_relation(self, other_role_code: str):
        if self.language == 'en':
            if other_role_code in self.relation:
                relation_text = ",".join(self.relation[other_role_code]["relation"])
                detail_text = self.relation[other_role_code]["detail"]
                return f"This is your {relation_text}. {detail_text}\n"
            else:
                return ""
        elif self.language == 'zh':
            if other_role_code in self.relation:
                relation_text = ",".join(self.relation[other_role_code]["relation"])
                detail_text = self.relation[other_role_code]["detail"]
                return f"这是你的{relation_text}. {detail_text}\n"
            else:
                return ""
    def set_location(self, location_code, location_name):
        self.location_code: Optional[str] = location_code
        self.location_name: Optional[str] = location_name
            
    def __getstate__(self):
        states = {key: value for key, value in self.__dict__.items() \
            if isinstance(value, (str, int, list, dict, bool, type(None))) \
                and key not in ['role_info','role_data','llm','embedding','db',"memory"]
                and "PROMPT" not in key}
        return states

    def __setstate__(self, states):
        self.__dict__.update(states)
        self._init_prompt()

    def save_to_file(self, root_dir):
        filename = os.path.join(root_dir, f"./roles/{self.role_code}.json")
        save_json_file(filename, self.__getstate__() )

    def load_from_file(self, root_dir):
        filename = os.path.join(root_dir, f"./roles/{self.role_code}.json")
        states = load_json_file(filename)
        self.__setstate__(states)     
        self.memory.init_from_data(self.history_manager.get_complete_history())

def build_performer_data(role_dir: str):
    role_data: List[str] = []
    for path in get_child_paths(role_dir):
        if os.path.splitext(path)[-1] == ".txt":
            text = load_text_file(path)
            role_data += split_text_by_max_words(text)
        elif os.path.splitext(path)[-1] == ".jsonl":
            role_data += [line["text"] for line in load_jsonl_file(path)]
    return role_data      


if __name__ == "__main__":
    agent = Performer(role_code='Harry-en')
    agent.single_role_interact("Hi,Harry, Who is Ron?")


    