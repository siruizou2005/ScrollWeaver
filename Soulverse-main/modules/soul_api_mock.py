"""
Soul兴趣图谱模拟接口
提供模拟的用户画像数据，用于创建用户Agent
"""
import random
from typing import Dict, List, Any, Optional
from modules.personality_model import (
    PersonalityProfile, CoreTraits, SpeakingStyle, DynamicState,
    DefenseMechanism
)


class SoulProfileMock:
    """Soul兴趣图谱模拟数据生成器"""
    
    # 预定义的兴趣标签库
    INTEREST_TAGS = [
        "电影", "音乐", "旅行", "摄影", "阅读", "游戏", "运动", "美食",
        "科技", "艺术", "时尚", "宠物", "动漫", "二次元", "摇滚", "爵士",
        "古典音乐", "电子音乐", "民谣", "说唱", "科幻", "悬疑", "爱情",
        "喜剧", "恐怖", "纪录片", "篮球", "足球", "跑步", "瑜伽", "健身",
        "咖啡", "茶道", "烘焙", "日料", "中餐", "西餐", "编程", "AI",
        "心理学", "哲学", "历史", "文学", "诗歌", "绘画", "设计"
    ]
    
    # MBTI类型
    MBTI_TYPES = [
        "INTJ", "INTP", "ENTJ", "ENTP",
        "INFJ", "INFP", "ENFJ", "ENFP",
        "ISTJ", "ISFJ", "ESTJ", "ESFJ",
        "ISTP", "ISFP", "ESTP", "ESFP"
    ]
    
    # 性格特征描述模板
    PERSONALITY_TRAITS = {
        "外向": ["热情", "活跃", "社交", "健谈", "乐观"],
        "内向": ["安静", "深思", "独立", "专注", "内省"],
        "理性": ["逻辑", "客观", "分析", "冷静", "务实"],
        "感性": ["情感丰富", "同理心", "直觉", "艺术感", "理想主义"]
    }
    
    # 社交目标模板
    SOCIAL_GOALS = [
        "寻找志同道合的朋友",
        "拓展社交圈子",
        "寻找恋爱对象",
        "寻找学习伙伴",
        "寻找游戏搭子",
        "寻找旅行伙伴",
        "寻找音乐同好",
        "寻找电影搭子",
        "寻找运动伙伴",
        "寻找读书伙伴"
    ]
    
    @staticmethod
    def get_user_profile(user_id: Optional[str] = None, 
                        interests: Optional[List[str]] = None,
                        mbti: Optional[str] = None) -> Dict[str, Any]:
        """
        获取用户画像数据
        
        Args:
            user_id: 用户ID（可选，用于生成固定数据）
            interests: 兴趣标签列表（可选，如果提供则使用）
            mbti: MBTI类型（可选，如果提供则使用）
        
        Returns:
            用户画像字典，包含：
            - interests: 兴趣标签列表
            - mbti: MBTI类型
            - personality: 性格描述
            - social_goals: 社交目标列表
            - traits: 性格特征列表
        """
        # 如果提供了user_id，使用固定随机种子确保一致性
        if user_id:
            random.seed(hash(user_id) % 10000)
        
        # 生成兴趣标签
        if interests is None:
            num_interests = random.randint(5, 12)
            selected_interests = random.sample(SoulProfileMock.INTEREST_TAGS, num_interests)
        else:
            selected_interests = interests
        
        # 生成MBTI类型
        if mbti is None:
            selected_mbti = random.choice(SoulProfileMock.MBTI_TYPES)
        else:
            selected_mbti = mbti
        
        # 根据MBTI生成性格特征
        personality_desc = SoulProfileMock._generate_personality_from_mbti(selected_mbti)
        
        # 生成性格特征列表
        traits = SoulProfileMock._generate_traits(selected_mbti)
        
        # 生成社交目标
        num_goals = random.randint(1, 3)
        social_goals = random.sample(SoulProfileMock.SOCIAL_GOALS, num_goals)
        
        # 生成长期目标（基于兴趣和MBTI）
        long_term_goals = SoulProfileMock._generate_long_term_goals(selected_interests, selected_mbti)
        
        profile = {
            "user_id": user_id or f"user_{random.randint(1000, 9999)}",
            "interests": selected_interests,
            "mbti": selected_mbti,
            "personality": personality_desc,
            "traits": traits,
            "social_goals": social_goals,
            "long_term_goals": long_term_goals,
            "activity_level": random.uniform(0.7, 1.0)  # 活跃度
        }
        
        return profile
    
    @staticmethod
    def _generate_personality_from_mbti(mbti: str) -> str:
        """根据MBTI类型生成性格描述"""
        mbti_descriptions = {
            "INTJ": "独立、理性、有远见的战略家，喜欢深度思考和规划未来",
            "INTP": "好奇、逻辑、创新的思想家，热爱探索理论和可能性",
            "ENTJ": "果断、自信、有领导力的指挥官，善于制定和执行计划",
            "ENTP": "聪明、创新、辩论家，喜欢挑战传统和探索新想法",
            "INFJ": "理想主义、有洞察力、富有同理心的倡导者",
            "INFP": "理想主义、忠诚、富有创造力的调停者",
            "ENFJ": "热情、有魅力、天生的领导者，关心他人成长",
            "ENFP": "热情、自由、富有创造力的活动家",
            "ISTJ": "实际、可靠、有责任感的检查员",
            "ISFJ": "温暖、负责、保护性的守护者",
            "ESTJ": "务实、果断、有组织能力的执行官",
            "ESFJ": "外向、友好、关心他人的执政官",
            "ISTP": "大胆、实用、实验性的冒险家",
            "ISFP": "灵活、迷人、艺术性的探险家",
            "ESTP": "聪明、精力充沛、感知力强的企业家",
            "ESFP": "自发的、精力充沛的、热情的表演者"
        }
        return mbti_descriptions.get(mbti, "性格温和，待人友善")
    
    @staticmethod
    def _generate_traits(mbti: str) -> List[str]:
        """根据MBTI生成性格特征列表"""
        # 根据MBTI的字母组合生成特征
        traits = []
        if mbti[0] == 'E':
            traits.extend(["外向", "社交"])
        else:
            traits.extend(["内向", "独立"])
        
        if mbti[1] == 'S':
            traits.append("务实")
        else:
            traits.append("理想主义")
        
        if mbti[2] == 'T':
            traits.append("理性")
        else:
            traits.append("感性")
        
        if mbti[3] == 'J':
            traits.append("有计划")
        else:
            traits.append("灵活")
        
        return traits
    
    @staticmethod
    def _generate_long_term_goals(interests: List[str], mbti: str) -> List[str]:
        """根据兴趣和MBTI生成长期目标"""
        goals = []
        
        # 基于兴趣生成目标
        if "电影" in interests:
            goals.append("找到一起看电影的朋友，分享观影心得")
        if "音乐" in interests:
            goals.append("寻找音乐同好，一起探索新音乐")
        if "旅行" in interests:
            goals.append("找到旅行伙伴，一起探索世界")
        if "阅读" in interests:
            goals.append("建立读书小组，分享阅读体验")
        if "运动" in interests or "健身" in interests:
            goals.append("找到运动伙伴，一起保持健康")
        
        # 如果没有生成目标，添加通用目标
        if not goals:
            goals.append("在虚拟世界中找到志同道合的朋友")
        
        return goals
    
    @staticmethod
    def _generate_big_five_from_mbti(mbti: str) -> Dict[str, float]:
        """根据MBTI生成大五人格评分"""
        # MBTI到Big Five的映射（简化版）
        # 实际应该更复杂，这里提供基础映射
        
        # E/I -> Extraversion
        # S/N -> Openness (N更开放)
        # T/F -> Agreeableness (F更宜人)
        # J/P -> Conscientiousness (J更尽责)
        
        big_five = {
            "openness": 0.5,
            "conscientiousness": 0.5,
            "extraversion": 0.5,
            "agreeableness": 0.5,
            "neuroticism": 0.5
        }
        
        # Extraversion
        if mbti[0] == 'E':
            big_five["extraversion"] = random.uniform(0.6, 0.9)
        else:
            big_five["extraversion"] = random.uniform(0.1, 0.4)
        
        # Openness (N更开放)
        if mbti[1] == 'N':
            big_five["openness"] = random.uniform(0.6, 0.9)
        else:
            big_five["openness"] = random.uniform(0.3, 0.6)
        
        # Agreeableness (F更宜人)
        if mbti[2] == 'F':
            big_five["agreeableness"] = random.uniform(0.6, 0.9)
        else:
            big_five["agreeableness"] = random.uniform(0.3, 0.6)
        
        # Conscientiousness (J更尽责)
        if mbti[3] == 'J':
            big_five["conscientiousness"] = random.uniform(0.6, 0.9)
        else:
            big_five["conscientiousness"] = random.uniform(0.2, 0.5)
        
        # Neuroticism (随机，但I类型可能略高)
        if mbti[0] == 'I':
            big_five["neuroticism"] = random.uniform(0.4, 0.7)
        else:
            big_five["neuroticism"] = random.uniform(0.2, 0.5)
        
        return big_five
    
    @staticmethod
    def _generate_speaking_style_from_mbti(mbti: str) -> Dict[str, Any]:
        """根据MBTI生成语言风格"""
        # 简化版：根据MBTI特征推断语言风格
        
        style = {
            "sentence_length": "medium",
            "vocabulary_level": "casual",
            "punctuation_habit": "standard",
            "emoji_usage": {
                "frequency": "medium",
                "preferred": [],
                "avoided": []
            },
            "catchphrases": [],
            "tone_markers": []
        }
        
        # 外向型更可能用表情和语气词
        if mbti[0] == 'E':
            style["emoji_usage"]["frequency"] = random.choice(["medium", "high"])
            style["tone_markers"] = random.choice([["啊", "呢"], ["哈哈", "确实"], []])
        else:
            style["emoji_usage"]["frequency"] = random.choice(["none", "low"])
            style["tone_markers"] = []
        
        # N类型可能用更多网络用语
        if mbti[1] == 'N':
            style["vocabulary_level"] = random.choice(["casual", "network"])
        else:
            style["vocabulary_level"] = "casual"
        
        # F类型可能用更多标点（表达情感）
        if mbti[2] == 'F':
            style["punctuation_habit"] = random.choice(["standard", "excessive"])
        
        # 设置表情偏好（随机）
        emoji_pools = {
            "positive": ["🥺", "✨", "😊", "💕", "🌟"],
            "neutral": ["😐", "🤔", "👀"],
            "negative": ["😢", "😤", "💔"]
        }
        if style["emoji_usage"]["frequency"] != "none":
            style["emoji_usage"]["preferred"] = random.sample(
                emoji_pools["positive"], 
                random.randint(1, 3)
            )
        
        return style
    
    @staticmethod
    def get_personality_profile(user_id: Optional[str] = None,
                               interests: Optional[List[str]] = None,
                               mbti: Optional[str] = None) -> PersonalityProfile:
        """
        获取完整的三层人格模型（新版）
        
        Args:
            user_id: 用户ID（可选，用于生成固定数据）
            interests: 兴趣标签列表（可选）
            mbti: MBTI类型（可选）
        
        Returns:
            PersonalityProfile对象
        """
        # 如果提供了user_id，使用固定随机种子
        if user_id:
            random.seed(hash(user_id) % 10000)
        
        # 生成基础信息
        basic_profile = SoulProfileMock.get_user_profile(user_id, interests, mbti)
        
        selected_mbti = basic_profile["mbti"]
        
        # 生成Big Five
        big_five = SoulProfileMock._generate_big_five_from_mbti(selected_mbti)
        
        # 生成语言风格
        speaking_style_data = SoulProfileMock._generate_speaking_style_from_mbti(selected_mbti)
        
        # 构建CoreTraits
        core_traits = CoreTraits(
            mbti=selected_mbti,
            big_five=big_five,
            values=basic_profile.get("values", ["真诚", "自由"]),
            defense_mechanism=random.choice(list(DefenseMechanism)).value
        )
        
        # 构建SpeakingStyle
        speaking_style = SpeakingStyle(
            sentence_length=speaking_style_data["sentence_length"],
            vocabulary_level=speaking_style_data["vocabulary_level"],
            punctuation_habit=speaking_style_data["punctuation_habit"],
            emoji_usage=speaking_style_data["emoji_usage"],
            catchphrases=speaking_style_data["catchphrases"],
            tone_markers=speaking_style_data["tone_markers"]
        )
        
        # 构建DynamicState
        dynamic_state = DynamicState(
            current_mood="neutral",
            energy_level=random.randint(40, 80)
        )
        
        return PersonalityProfile(
            core_traits=core_traits,
            speaking_style=speaking_style,
            dynamic_state=dynamic_state,
            interests=basic_profile["interests"],
            social_goals=basic_profile["social_goals"],
            long_term_goals=basic_profile["long_term_goals"],
            style_examples=[]
        )


def get_soul_profile(user_id: Optional[str] = None,
                    interests: Optional[List[str]] = None,
                    mbti: Optional[str] = None) -> Dict[str, Any]:
    """
    获取Soul用户画像（模拟接口）
    
    这是模拟接口，实际使用时可以替换为真实的Soul API调用
    
    Args:
        user_id: 用户ID
        interests: 兴趣标签列表
        mbti: MBTI类型
    
    Returns:
        用户画像字典
    """
    return SoulProfileMock.get_user_profile(user_id, interests, mbti)


# 真实API接口占位符（未来实现）
def get_soul_profile_from_api(user_id: str, api_key: str) -> Dict[str, Any]:
    """
    从真实Soul API获取用户画像
    
    注意：这是占位符函数，需要后续实现真实的API调用
    
    Args:
        user_id: Soul用户ID
        api_key: API密钥
    
    Returns:
        用户画像字典
    """
    # TODO: 实现真实的Soul API调用
    # 目前返回模拟数据
    return get_soul_profile(user_id=user_id)


def get_personality_profile(user_id: Optional[str] = None,
                           interests: Optional[List[str]] = None,
                           mbti: Optional[str] = None) -> PersonalityProfile:
    """
    获取完整的三层人格模型（新版便捷函数）
    
    Args:
        user_id: 用户ID
        interests: 兴趣标签列表
        mbti: MBTI类型
    
    Returns:
        PersonalityProfile对象
    """
    return SoulProfileMock.get_personality_profile(user_id, interests, mbti)

