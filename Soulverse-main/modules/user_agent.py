"""
用户Agent类
基于Soul兴趣图谱创建的用户Agent，继承Performer的核心功能
支持新的三层人格模型
"""
import os
import sys
sys.path.append("../")
from typing import Any, Dict, List, Optional
from modules.main_performer import Performer
from modules.soul_api_mock import get_soul_profile, get_personality_profile
from modules.soulverse_mode import SoulverseMode
from modules.personality_model import PersonalityProfile
from modules.style_vector_db import StyleVectorDB
from sw_utils import *


class UserAgent(Performer):
    """
    用户Agent类，基于Soul兴趣图谱创建
    继承Performer的所有功能，但使用用户画像数据初始化
    """
    
    def __init__(self,
                 user_id: str,
                 role_code: str,
                 world_file_path: str,
                 soul_profile: Optional[Dict[str, Any]] = None,
                 personality_profile: Optional[PersonalityProfile] = None,
                 chat_history: Optional[List[str]] = None,
                 language: str = "zh",
                 db_type: str = "chroma",
                 llm_name: str = "gpt-4o-mini",
                 llm = None,
                 embedding_name: str = "bge-small",
                 embedding = None):
        """
        初始化用户Agent
        
        Args:
            user_id: 用户ID
            role_code: Agent的角色代码（唯一标识）
            world_file_path: 世界设定文件路径
            soul_profile: Soul用户画像数据（旧版，如果为None且personality_profile也为None，则从模拟API获取）
            personality_profile: 三层人格模型数据（新版，优先使用）
            chat_history: 聊天记录（可选，用于提取语言风格）
            language: 语言设置
            db_type: 数据库类型
            llm_name: LLM模型名称
            llm: LLM实例（可选）
            embedding_name: 嵌入模型名称
            embedding: 嵌入模型实例（可选）
        """
        # 获取或生成PersonalityProfile
        if personality_profile is None:
            if soul_profile is None:
                # 使用新版API生成三层人格模型
                personality_profile = get_personality_profile(user_id=user_id)
                soul_profile = {"interests": personality_profile.interests,
                              "mbti": personality_profile.core_traits.mbti,
                              "social_goals": personality_profile.social_goals,
                              "long_term_goals": personality_profile.long_term_goals}
            else:
                # 从旧版soul_profile转换（简化处理）
                from modules.soul_api_mock import SoulProfileMock
                personality_profile = SoulProfileMock.get_personality_profile(
                    user_id=user_id,
                    interests=soul_profile.get("interests"),
                    mbti=soul_profile.get("mbti")
                )
        
        self.user_id = user_id
        self.soul_profile = soul_profile  # 保留旧版数据以兼容
        self.personality_profile = personality_profile  # 新版三层人格模型
        self.is_user_agent = True  # 标记为用户Agent
        self.soulverse_mode = SoulverseMode(language=language)  # Soulverse模式
        
        # 初始化语言风格向量数据库
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        style_db_name = f"style_{role_code}_{embedding_name}"
        self.style_vector_db = StyleVectorDB(
            db_name=style_db_name,
            embedding_name=embedding_name,
            db_type=db_type,
            language=language
        )
        
        # 如果有聊天记录，添加到风格向量数据库
        if chat_history:
            self.style_vector_db.add_utterances_batch([
                {"text": text, "context": ""} for text in chat_history
            ])
            # 更新Few-Shot样本
            self.personality_profile.style_examples = self.style_vector_db.extract_few_shot_examples(
                num_examples=5
            )
        
        # 从PersonalityProfile生成Agent的profile文本（用于向后兼容）
        agent_profile = personality_profile.to_profile_text()
        
        # 创建临时角色信息文件
        role_info = self._create_role_info(role_code, agent_profile, personality_profile)
        
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
        
        # 设置初始motivation（基于社交目标）
        self.initial_social_goals = personality_profile.social_goals
    
    def _create_role_info(self, role_code: str, profile: str, personality_profile: PersonalityProfile) -> Dict[str, Any]:
        """
        创建角色信息字典（使用新的三层人格模型）
        
        Args:
            role_code: 角色代码
            profile: Agent profile文本（向后兼容）
            personality_profile: 三层人格模型数据
        
        Returns:
            角色信息字典
        """
        # 生成角色名称：默认展示完整用户ID，确保不会丢失首字母/单词
        base_name = (self.user_id or "").strip()
        if not base_name:
            base_name = role_code
        # 统一使用下划线替换空白，避免 UI 中首字符被隐藏
        sanitized_name = base_name.replace(" ", "_")
        if sanitized_name.startswith("用户_") or sanitized_name.startswith("用户"):
            role_name = sanitized_name
        else:
            role_name = f"用户_{sanitized_name}"
        nickname = role_name
        
        role_info = {
            "role_code": role_code,
            "role_name": role_name,
            "nickname": nickname,
            "original_user_id": self.user_id,
            "source": "soulverse_user",
            "activity": 1.0,  # 默认活跃度
            "profile": profile,  # 保留文本profile以兼容旧代码
            "personality_profile": personality_profile.to_dict(),  # 新版结构化数据
            "style_examples": personality_profile.style_examples,  # Few-Shot样本
            "style_vector_db_name": self.style_vector_db.db_name,  # 风格向量库名称
            "relation": {},  # 初始没有关系
            "motivation": ""  # 将在set_motivation时生成
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
        temp_dir = os.path.join(base_dir, "data", "roles", "soulverse_users", role_code)
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
    
    def get_soul_interests(self) -> List[str]:
        """获取Soul兴趣标签"""
        return self.soul_profile.get("interests", [])
    
    def get_soul_mbti(self) -> str:
        """获取MBTI类型"""
        return self.soul_profile.get("mbti", "未知")
    
    def get_social_goals(self) -> List[str]:
        """获取社交目标"""
        return self.soul_profile.get("social_goals", [])
    
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
    
    def update_motivation_with_social_goals(self, world_description: str, other_roles_info: Dict[str, Any]):
        """
        基于社交目标更新motivation
        
        Args:
            world_description: 世界描述
            other_roles_info: 其他角色信息
        """
        # 调用父类的set_motivation，但会考虑社交目标
        motivation = self.set_motivation(
            world_description=world_description,
            other_roles_info=other_roles_info,
            intervention=""
        )
        
        # 如果有社交目标，在motivation中强调
        if self.initial_social_goals:
            goals_text = "，".join(self.initial_social_goals)
            motivation = f"{motivation}\n\n特别关注：{goals_text}"
            self.motivation = motivation
        
        return motivation
