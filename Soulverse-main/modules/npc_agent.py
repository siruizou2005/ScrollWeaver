"""
NPC Agent类
用于创建预设的NPC Agent，与用户Agent进行社交互动
支持新的三层人格模型
"""
import os
import sys
sys.path.append("../")
from typing import Any, Dict, List, Optional
from modules.main_performer import Performer
from modules.soulverse_mode import SoulverseMode
from modules.personality_model import PersonalityProfile
from modules.preset_agents import PresetAgents
from modules.style_vector_db import StyleVectorDB
from sw_utils import *


class NPCAgent(Performer):
    """
    NPC Agent类，用于创建预设的NPC
    继承Performer的所有功能，但使用预设配置初始化
    """
    
    def __init__(self,
                 role_code: str,
                 role_name: str,
                 world_file_path: str,
                 preset_config: Optional[Dict[str, Any]] = None,
                 preset_id: Optional[str] = None,
                 personality_profile: Optional[PersonalityProfile] = None,
                 language: str = "zh",
                 db_type: str = "chroma",
                 llm_name: str = "gpt-4o-mini",
                 llm = None,
                 embedding_name: str = "bge-small",
                 embedding = None):
        """
        初始化NPC Agent
        
        Args:
            role_code: Agent的角色代码（唯一标识）
            role_name: Agent的名称
            world_file_path: 世界设定文件路径
            preset_config: 预设配置字典（旧版，如果preset_id和personality_profile都为None则使用）
            preset_id: 预设ID（新版，优先使用）
            personality_profile: 三层人格模型数据（新版，如果提供则直接使用）
            language: 语言设置
            db_type: 数据库类型
            llm_name: LLM模型名称
            llm: LLM实例（可选）
            embedding_name: 嵌入模型名称
            embedding: 嵌入模型实例（可选）
        """
        self.is_user_agent = False  # 标记为NPC Agent
        self.is_npc_agent = True  # 标记为NPC
        self.soulverse_mode = SoulverseMode(language=language)  # Soulverse模式
        
        # 获取PersonalityProfile
        if personality_profile is None:
            if preset_id:
                # 使用预设ID创建PersonalityProfile
                personality_profile = PresetAgents.create_personality_profile_from_preset(preset_id, role_name)
                preset_config = PresetAgents.get_preset_by_id(preset_id)
            elif preset_config:
                # 从旧版preset_config转换（需要preset_id）
                preset_id = preset_config.get("id")
                if preset_id:
                    personality_profile = PresetAgents.create_personality_profile_from_preset(preset_id, role_name)
                else:
                    # 如果没有preset_id，使用默认方法
                    personality_profile = self._create_personality_profile_from_config(preset_config)
            else:
                raise ValueError("Either preset_id, preset_config, or personality_profile must be provided")
        
        self.preset_config = preset_config or {}  # 保留旧版数据以兼容
        self.personality_profile = personality_profile  # 新版三层人格模型
        
        # 优化：延迟初始化语言风格向量数据库（预设NPC通常没有聊天记录）
        # 仅在需要时（有聊天记录或需要提取风格时）再初始化
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        style_db_name = f"style_{role_code}_{embedding_name}"
        self.style_vector_db = None  # 延迟初始化
        self._style_db_name = style_db_name
        self._style_db_embedding_name = embedding_name
        self._style_db_type = db_type
        self._style_db_language = language
        self._style_db_initialized = False
        
        # 从PersonalityProfile生成Agent的profile文本（用于向后兼容）
        agent_profile = personality_profile.to_profile_text()
        
        # 创建临时角色信息文件
        role_info = self._create_role_info(role_code, role_name, agent_profile, personality_profile)
        
        # 创建临时目录存储角色信息
        temp_role_dir = self._create_temp_role_dir(role_code, role_info)
        
        # 调用父类初始化，使用临时角色目录
        super().__init__(
            role_code=role_code,
            role_file_dir=temp_role_dir,
            world_file_path=world_file_path,
            source="",
            language=language,
            db_type=db_type,
            llm_name=llm_name,
            llm=llm,
            embedding_name=embedding_name,
            embedding=embedding
        )
        
        # 设置长期目标（基于PersonalityProfile）
        self.long_term_goals = personality_profile.long_term_goals
        self.initial_social_goals = personality_profile.social_goals
    
    def _create_personality_profile_from_config(self, preset_config: Dict[str, Any]) -> PersonalityProfile:
        """从旧版preset_config创建PersonalityProfile（fallback方法）"""
        from modules.soul_api_mock import SoulProfileMock
        return SoulProfileMock.get_personality_profile(
            interests=preset_config.get("interests"),
            mbti=preset_config.get("mbti")
        )
    
    def _create_role_info(self, role_code: str, role_name: str, profile: str, personality_profile: PersonalityProfile) -> Dict[str, Any]:
        """
        创建角色信息字典（使用新的三层人格模型）
        
        Args:
            role_code: 角色代码
            role_name: 角色名称
            profile: Agent profile文本（向后兼容）
            personality_profile: 三层人格模型数据
        
        Returns:
            角色信息字典
        """
        # 检查预设配置中是否有预生成的 motivation
        pre_generated_motivation = ""
        if self.preset_config and "pre_generated_motivation" in self.preset_config:
            pre_generated_motivation = self.preset_config["pre_generated_motivation"]
        
        role_info = {
            "role_code": role_code,
            "role_name": role_name,
            "nickname": role_name,
            "source": "soulverse_npc",
            "activity": 0.9,  # 默认活跃度
            "profile": profile,  # 保留文本profile以兼容旧代码
            "personality_profile": personality_profile.to_dict(),  # 新版结构化数据
            "style_examples": personality_profile.style_examples,  # Few-Shot样本
            "style_vector_db_name": self._style_db_name if hasattr(self, '_style_db_name') else None,  # 风格向量库名称（延迟初始化）
            "relation": {},  # 初始没有关系
            "motivation": pre_generated_motivation  # 使用预设的 motivation，如果没有则为空字符串
        }
        
        return role_info
    
    def _create_temp_role_dir(self, role_code: str, role_info: Dict[str, Any]) -> str:
        """
        创建临时角色目录并保存角色信息
        
        Args:
            role_code: 角色代码
            role_info: 角色信息字典
        
        Returns:
            临时目录路径
        """
        # 创建临时目录
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        temp_dir = os.path.join(base_dir, "data", "roles", "soulverse_npcs", role_code)
        os.makedirs(temp_dir, exist_ok=True)
        
        # 保存角色信息
        role_info_path = os.path.join(temp_dir, "role_info.json")
        save_json_file(role_info_path, role_info)
        
        # 创建空的role_data（可以后续扩展）
        role_data_path = os.path.join(temp_dir, "role_data.jsonl")
        if not os.path.exists(role_data_path):
            with open(role_data_path, 'w', encoding='utf-8') as f:
                pass  # 创建空文件
        
        return os.path.join(base_dir, "data", "roles")
    
    def _ensure_style_vector_db_initialized(self, embedding=None):
        """
        确保风格向量数据库已初始化（延迟初始化）
        
        注意：由于get_embedding_model有缓存机制，即使多次调用也会复用同一个模型实例，
        所以这里不需要手动传递embedding参数，StyleVectorDB会自动获取缓存的实例。
        """
        if not self._style_db_initialized and self.style_vector_db is None:
            self.style_vector_db = StyleVectorDB(
                db_name=self._style_db_name,
                embedding_name=self._style_db_embedding_name,
                db_type=self._style_db_type,
                language=self._style_db_language
            )
            self._style_db_initialized = True
    
    def get_social_goals(self) -> List[str]:
        """获取社交目标"""
        return self.preset_config.get("social_goals", [])
    
    def set_motivation(self, 
                      world_description: str, 
                      other_roles_info: Dict[str, Any], 
                      intervention: str = "", 
                      script: str = ""):
        """
        重写set_motivation，使用Soulverse社交模式
        
        Args:
            world_description: 世界描述
            other_roles_info: 其他角色信息
            intervention: 干预事件（在Soulverse模式下不使用）
            script: 剧本（在Soulverse模式下不使用）
        """
        if self.motivation:
            return self.motivation
        
        # 使用Soulverse模式生成社交motivation
        social_goals = self.get_social_goals()
        current_location = self.location_name if hasattr(self, 'location_name') and self.location_name else "未知位置"
        
        motivation = self.soulverse_mode.generate_social_motivation(
            agent_profile=self.role_profile,
            social_goals=social_goals,
            world_description=world_description,
            other_agents_info=other_roles_info,
            current_location=current_location
        )
        
        self.motivation = motivation
        return motivation

