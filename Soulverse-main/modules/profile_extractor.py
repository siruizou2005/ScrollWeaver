"""
从用户文本（聊天记录、自述等）提取用户画像
使用LLM分析文本，提取兴趣、性格、MBTI等信息
支持多数据源：问卷、聊天记录、文本
"""
import json
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from typing import Dict, List, Any, Optional
from sw_utils import get_models
from modules.personality_model import (
    PersonalityProfile, CoreTraits, SpeakingStyle, DynamicState,
    DefenseMechanism, SentenceLength, VocabularyLevel, PunctuationHabit, EmojiFrequency
)
from modules.style_vector_db import StyleVectorDB, create_style_db_from_chat_history


class ProfileExtractor:
    """从文本提取用户画像的类"""
    
    def __init__(self, llm_name: str = "gpt-4o-mini", language: str = "zh"):
        """
        初始化ProfileExtractor
        
        Args:
            llm_name: LLM模型名称
            language: 语言设置
        """
        self.llm = get_models(llm_name)
        self.language = language
    
    def extract_profile_from_text(self, text: str) -> Dict[str, Any]:
        """
        从文本中提取用户画像
        
        Args:
            text: 用户提供的文本（聊天记录、自述等）
        
        Returns:
            用户画像字典，包含：
            - interests: 兴趣标签列表
            - mbti: MBTI类型
            - personality: 性格描述
            - traits: 性格特征列表
            - social_goals: 社交目标列表
            - long_term_goals: 长期目标列表
        """
        if self.language == "zh":
            prompt = self._get_chinese_prompt(text)
        else:
            prompt = self._get_english_prompt(text)
        
        try:
            response = self.llm.chat(prompt)
            profile = self._parse_response(response)
            return profile
        except Exception as e:
            print(f"Error extracting profile: {e}")
            # 返回默认画像
            return self._get_default_profile()
    
    def _get_chinese_prompt(self, text: str) -> str:
        """生成中文提示词"""
        return f"""请分析以下文本，提取用户的兴趣、性格特征、MBTI类型和社交目标。

文本内容：
{text}

请以JSON格式返回分析结果，格式如下：
{{
    "interests": ["兴趣1", "兴趣2", ...],  // 从文本中提取的兴趣标签，至少5个
    "mbti": "MBTI类型",  // 16种MBTI类型之一：INTJ, INTP, ENTJ, ENTP, INFJ, INFP, ENFJ, ENFP, ISTJ, ISFJ, ESTJ, ESFJ, ISTP, ISFP, ESTP, ESFP
    "personality": "性格描述",  // 一段描述用户性格的文字
    "traits": ["特征1", "特征2", ...],  // 性格特征标签列表
    "social_goals": ["目标1", "目标2", ...],  // 社交目标列表，如"寻找志同道合的朋友"、"寻找学习伙伴"等
    "long_term_goals": ["长期目标1", "长期目标2", ...]  // 长期目标列表
}}

注意：
1. 如果文本中没有明确信息，请根据文本的语气、用词、话题等进行合理推断
2. interests应该包含用户明显感兴趣的话题、活动、领域等
3. mbti需要根据用户的交流风格、思维方式、行为模式进行判断
4. social_goals应该基于用户的表达和需求推断
5. 只返回JSON，不要有其他文字说明"""
    
    def _get_english_prompt(self, text: str) -> str:
        """生成英文提示词"""
        return f"""Please analyze the following text and extract the user's interests, personality traits, MBTI type, and social goals.

Text content:
{text}

Please return the analysis results in JSON format as follows:
{{
    "interests": ["interest1", "interest2", ...],  // Extract at least 5 interest tags from the text
    "mbti": "MBTI_TYPE",  // One of 16 MBTI types: INTJ, INTP, ENTJ, ENTP, INFJ, INFP, ENFJ, ENFP, ISTJ, ISFJ, ESTJ, ESFJ, ISTP, ISFP, ESTP, ESFP
    "personality": "personality description",  // A paragraph describing the user's personality
    "traits": ["trait1", "trait2", ...],  // List of personality trait tags
    "social_goals": ["goal1", "goal2", ...],  // List of social goals, such as "find like-minded friends", "find study partners", etc.
    "long_term_goals": ["long_term_goal1", "long_term_goal2", ...]  // List of long-term goals
}}

Note:
1. If the text doesn't contain explicit information, make reasonable inferences based on the text's tone, word choice, topics, etc.
2. interests should include topics, activities, fields the user is clearly interested in
3. mbti needs to be determined based on the user's communication style, thinking patterns, and behavioral patterns
4. social_goals should be inferred based on the user's expressions and needs
5. Return only JSON, no other text explanations"""
    
    def _parse_response(self, response: str) -> Dict[str, Any]:
        """解析LLM返回的JSON响应"""
        try:
            # 尝试提取JSON部分
            response = response.strip()
            # 如果响应包含```json或```，提取其中的内容
            if "```json" in response:
                start = response.find("```json") + 7
                end = response.find("```", start)
                if end != -1:
                    response = response[start:end].strip()
            elif "```" in response:
                start = response.find("```") + 3
                end = response.find("```", start)
                if end != -1:
                    response = response[start:end].strip()
            
            # 解析JSON
            profile = json.loads(response)
            
            # 验证和补充字段
            if "interests" not in profile or not profile["interests"]:
                profile["interests"] = ["阅读", "音乐", "旅行"]
            if "mbti" not in profile or not profile["mbti"]:
                profile["mbti"] = "INFP"
            if "personality" not in profile:
                profile["personality"] = "性格温和，待人友善"
            if "traits" not in profile or not profile["traits"]:
                profile["traits"] = ["友好", "开放"]
            if "social_goals" not in profile or not profile["social_goals"]:
                profile["social_goals"] = ["寻找志同道合的朋友"]
            if "long_term_goals" not in profile or not profile["long_term_goals"]:
                profile["long_term_goals"] = ["在虚拟世界中找到志同道合的朋友"]
            
            return profile
        except Exception as e:
            print(f"Error parsing response: {e}")
            print(f"Response was: {response}")
            return self._get_default_profile()
    
    def _get_default_profile(self) -> Dict[str, Any]:
        """返回默认用户画像"""
        return {
            "interests": ["阅读", "音乐", "旅行", "电影", "科技"],
            "mbti": "INFP",
            "personality": "性格温和，待人友善，喜欢探索新事物",
            "traits": ["友好", "开放", "好奇"],
            "social_goals": ["寻找志同道合的朋友"],
            "long_term_goals": ["在虚拟世界中找到志同道合的朋友"]
        }
    
    def extract_profile_from_qa(self, answers: Dict[str, str]) -> Dict[str, Any]:
        """
        从问答结果提取用户画像（旧版方法，保持兼容）
        
        Args:
            answers: 问答字典，例如：
                {
                    "interests": "我喜欢看电影、听音乐、旅行",
                    "personality": "我比较内向，喜欢独处，但也喜欢和志同道合的人交流",
                    "social_goals": "我想找到一起看电影的朋友"
                }
        
        Returns:
            用户画像字典
        """
        # 将问答结果组合成文本
        text = "\n".join([f"{key}: {value}" for key, value in answers.items()])
        return self.extract_profile_from_text(text)
    
    # ========== 新版三层人格模型提取方法 ==========
    
    def extract_personality_profile_from_questionnaire(self, 
                                                      answers: Dict[str, str],
                                                      chat_history: Optional[List[str]] = None) -> PersonalityProfile:
        """
        从问卷答案提取完整的三层人格模型
        
        Args:
            answers: 问卷答案字典，例如：
                {
                    "interests": "我喜欢看电影、听音乐、旅行",
                    "personality": "我比较内向，喜欢独处，但也喜欢和志同道合的人交流",
                    "social_goals": "我想找到一起看电影的朋友"
                }
            chat_history: 可选的聊天记录（用于提取语言风格）
        
        Returns:
            PersonalityProfile对象
        """
        # 将问卷答案组合成文本
        text = "\n".join([f"{key}: {value}" for key, value in answers.items()])
        
        # 提取基础信息
        basic_profile = self.extract_profile_from_text(text)
        
        # 提取Big Five和语言风格
        big_five = self.extract_big_five(text)
        speaking_style = self.extract_speaking_style(text, chat_history)
        
        # 构建CoreTraits
        core_traits = CoreTraits(
            mbti=basic_profile.get("mbti", "INFP"),
            big_five=big_five,
            values=basic_profile.get("values", ["真诚", "自由"]),
            defense_mechanism=self.extract_defense_mechanism(text)
        )
        
        # 构建SpeakingStyle
        style = SpeakingStyle(
            sentence_length=speaking_style.get("sentence_length", "medium"),
            vocabulary_level=speaking_style.get("vocabulary_level", "casual"),
            punctuation_habit=speaking_style.get("punctuation_habit", "standard"),
            emoji_usage=speaking_style.get("emoji_usage", {"frequency": "medium", "preferred": [], "avoided": []}),
            catchphrases=speaking_style.get("catchphrases", []),
            tone_markers=speaking_style.get("tone_markers", [])
        )
        
        # 构建DynamicState（初始状态）
        dynamic_state = DynamicState(
            current_mood="neutral",
            energy_level=50
        )
        
        # 提取Few-Shot样本（如果有聊天记录）
        style_examples = []
        if chat_history and len(chat_history) >= 2:
            style_examples = self.extract_few_shot_examples(chat_history)
        
        return PersonalityProfile(
            core_traits=core_traits,
            speaking_style=style,
            dynamic_state=dynamic_state,
            interests=basic_profile.get("interests", []),
            social_goals=basic_profile.get("social_goals", []),
            long_term_goals=basic_profile.get("long_term_goals", []),
            style_examples=style_examples
        )
    
    def extract_personality_profile_from_chat_history(self,
                                                    chat_history: List[str],
                                                    num_examples: int = 5) -> PersonalityProfile:
        """
        从聊天记录提取完整的三层人格模型
        
        Args:
            chat_history: 聊天记录列表（每条是一个发言）
            num_examples: 提取的Few-Shot样本数量
        
        Returns:
            PersonalityProfile对象
        """
        # 将所有聊天记录组合成文本
        text = "\n".join(chat_history)
        
        # 提取基础信息
        basic_profile = self.extract_profile_from_text(text)
        
        # 提取Big Five和语言风格
        big_five = self.extract_big_five(text)
        speaking_style = self.extract_speaking_style(text, chat_history)
        
        # 构建CoreTraits
        core_traits = CoreTraits(
            mbti=basic_profile.get("mbti", "INFP"),
            big_five=big_five,
            values=basic_profile.get("values", ["真诚", "自由"]),
            defense_mechanism=self.extract_defense_mechanism(text)
        )
        
        # 构建SpeakingStyle
        style = SpeakingStyle(
            sentence_length=speaking_style.get("sentence_length", "medium"),
            vocabulary_level=speaking_style.get("vocabulary_level", "casual"),
            punctuation_habit=speaking_style.get("punctuation_habit", "standard"),
            emoji_usage=speaking_style.get("emoji_usage", {"frequency": "medium", "preferred": [], "avoided": []}),
            catchphrases=speaking_style.get("catchphrases", []),
            tone_markers=speaking_style.get("tone_markers", [])
        )
        
        # 构建DynamicState
        dynamic_state = DynamicState(
            current_mood="neutral",
            energy_level=50
        )
        
        # 提取Few-Shot样本
        style_examples = self.extract_few_shot_examples(chat_history, num_examples)
        
        return PersonalityProfile(
            core_traits=core_traits,
            speaking_style=style,
            dynamic_state=dynamic_state,
            interests=basic_profile.get("interests", []),
            social_goals=basic_profile.get("social_goals", []),
            long_term_goals=basic_profile.get("long_term_goals", []),
            style_examples=style_examples
        )
    
    def extract_personality_profile_from_text(self, text: str) -> PersonalityProfile:
        """
        从文本提取完整的三层人格模型
        
        Args:
            text: 用户提供的文本
        
        Returns:
            PersonalityProfile对象
        """
        # 提取基础信息
        basic_profile = self.extract_profile_from_text(text)
        
        # 提取Big Five和语言风格
        big_five = self.extract_big_five(text)
        speaking_style = self.extract_speaking_style(text)
        
        # 构建CoreTraits
        core_traits = CoreTraits(
            mbti=basic_profile.get("mbti", "INFP"),
            big_five=big_five,
            values=basic_profile.get("values", ["真诚", "自由"]),
            defense_mechanism=self.extract_defense_mechanism(text)
        )
        
        # 构建SpeakingStyle
        style = SpeakingStyle(
            sentence_length=speaking_style.get("sentence_length", "medium"),
            vocabulary_level=speaking_style.get("vocabulary_level", "casual"),
            punctuation_habit=speaking_style.get("punctuation_habit", "standard"),
            emoji_usage=speaking_style.get("emoji_usage", {"frequency": "medium", "preferred": [], "avoided": []}),
            catchphrases=speaking_style.get("catchphrases", []),
            tone_markers=speaking_style.get("tone_markers", [])
        )
        
        # 构建DynamicState
        dynamic_state = DynamicState(
            current_mood="neutral",
            energy_level=50
        )
        
        return PersonalityProfile(
            core_traits=core_traits,
            speaking_style=style,
            dynamic_state=dynamic_state,
            interests=basic_profile.get("interests", []),
            social_goals=basic_profile.get("social_goals", []),
            long_term_goals=basic_profile.get("long_term_goals", []),
            style_examples=[]
        )
    
    def extract_big_five(self, text: str) -> Dict[str, float]:
        """
        提取大五人格评分
        
        Args:
            text: 用户文本
        
        Returns:
            Big Five评分字典，格式：{"openness": 0.8, "conscientiousness": 0.6, ...}
        """
        if self.language == "zh":
            prompt = f"""请分析以下文本，评估用户的大五人格特征，给出0-1之间的评分。

文本内容：
{text}

请以JSON格式返回，格式如下：
{{
    "openness": 0.8,  // 开放性：对新事物、新想法的接受程度
    "conscientiousness": 0.6,  // 尽责性：组织性、自律性、责任感
    "extraversion": 0.4,  // 外向性：社交性、活力、积极性
    "agreeableness": 0.7,  // 宜人性：信任、合作、同理心
    "neuroticism": 0.5  // 神经质：情绪稳定性、焦虑程度
}}

只返回JSON，不要有其他文字说明。"""
        else:
            prompt = f"""Please analyze the following text and evaluate the user's Big Five personality traits, giving scores between 0-1.

Text content:
{text}

Please return in JSON format:
{{
    "openness": 0.8,  // Openness to experience
    "conscientiousness": 0.6,  // Conscientiousness
    "extraversion": 0.4,  // Extraversion
    "agreeableness": 0.7,  // Agreeableness
    "neuroticism": 0.5  // Neuroticism
}}

Return only JSON, no other text."""
        
        try:
            response = self.llm.chat(prompt)
            big_five = self._parse_json_response(response)
            
            # 验证和默认值
            required = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"]
            for trait in required:
                if trait not in big_five:
                    big_five[trait] = 0.5
                else:
                    big_five[trait] = max(0.0, min(1.0, float(big_five[trait])))
            
            return big_five
        except Exception as e:
            print(f"Error extracting Big Five: {e}")
            return {
                "openness": 0.5,
                "conscientiousness": 0.5,
                "extraversion": 0.5,
                "agreeableness": 0.5,
                "neuroticism": 0.5
            }
    
    def extract_speaking_style(self, text: str, chat_history: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        提取语言风格
        
        Args:
            text: 用户文本
            chat_history: 可选的聊天记录（用于更准确的分析）
        
        Returns:
            语言风格字典
        """
        # 如果有聊天记录，优先使用聊天记录分析
        analysis_text = "\n".join(chat_history) if chat_history else text
        
        if self.language == "zh":
            prompt = f"""请分析以下文本，提取用户的语言风格特征。

文本内容：
{analysis_text}

请以JSON格式返回，格式如下：
{{
    "sentence_length": "short",  // 句长偏好：short/medium/long/mixed
    "vocabulary_level": "casual",  // 词汇等级：academic/casual/network/mixed
    "punctuation_habit": "minimal",  // 标点习惯：minimal/standard/excessive/mixed
    "emoji_usage": {{
        "frequency": "medium",  // 表情使用频率：none/low/medium/high
        "preferred": ["🥺", "✨"],  // 常用表情列表
        "avoided": ["👍"]  // 避免使用的表情
    }},
    "catchphrases": ["笑死", "确实"],  // 口头禅列表
    "tone_markers": ["啊", "捏"]  // 语气词列表
}}

只返回JSON，不要有其他文字说明。"""
        else:
            prompt = f"""Please analyze the following text and extract the user's speaking style.

Text content:
{analysis_text}

Please return in JSON format:
{{
    "sentence_length": "short",
    "vocabulary_level": "casual",
    "punctuation_habit": "minimal",
    "emoji_usage": {{
        "frequency": "medium",
        "preferred": ["🥺", "✨"],
        "avoided": ["👍"]
    }},
    "catchphrases": ["lol", "indeed"],
    "tone_markers": ["ah", "hmm"]
}}

Return only JSON, no other text."""
        
        try:
            response = self.llm.chat(prompt)
            style = self._parse_json_response(response)
            
            # 设置默认值
            if "sentence_length" not in style:
                style["sentence_length"] = "medium"
            if "vocabulary_level" not in style:
                style["vocabulary_level"] = "casual"
            if "punctuation_habit" not in style:
                style["punctuation_habit"] = "standard"
            if "emoji_usage" not in style:
                style["emoji_usage"] = {"frequency": "medium", "preferred": [], "avoided": []}
            if "catchphrases" not in style:
                style["catchphrases"] = []
            if "tone_markers" not in style:
                style["tone_markers"] = []
            
            return style
        except Exception as e:
            print(f"Error extracting speaking style: {e}")
            return {
                "sentence_length": "medium",
                "vocabulary_level": "casual",
                "punctuation_habit": "standard",
                "emoji_usage": {"frequency": "medium", "preferred": [], "avoided": []},
                "catchphrases": [],
                "tone_markers": []
            }
    
    def extract_defense_mechanism(self, text: str) -> str:
        """
        提取防御机制
        
        Args:
            text: 用户文本
        
        Returns:
            防御机制类型（字符串）
        """
        if self.language == "zh":
            prompt = f"""请分析以下文本，推断用户在遇到尴尬、冲突或压力时的防御机制。

文本内容：
{text}

防御机制类型：
- Rationalization（合理化）：用看似合理的理由解释不合理的行为
- Projection（投射）：将自己的想法、情感投射到他人身上
- Denial（否认）：拒绝承认不愉快的事实
- Repression（压抑）：将不愉快的记忆压抑到潜意识
- Sublimation（升华）：将冲动转化为社会可接受的行为
- Displacement（转移）：将情感从一个对象转移到另一个对象
- ReactionFormation（反向形成）：表现出与真实情感相反的行为
- Humor（幽默/自嘲）：用幽默或自嘲来应对压力
- Intellectualization（理智化）：用理性分析来避免情感体验

请只返回一个防御机制类型（英文），例如：Rationalization"""
        else:
            prompt = f"""Please analyze the following text and infer the user's defense mechanism when facing embarrassment, conflict, or stress.

Text content:
{text}

Defense mechanism types: Rationalization, Projection, Denial, Repression, Sublimation, Displacement, ReactionFormation, Humor, Intellectualization

Return only the defense mechanism type (in English), e.g., Rationalization"""
        
        try:
            response = self.llm.chat(prompt)
            mechanism = response.strip()
            
            # 验证是否为有效的防御机制
            valid_mechanisms = [e.value for e in DefenseMechanism]
            if mechanism not in valid_mechanisms:
                mechanism = "Rationalization"  # 默认值
            
            return mechanism
        except Exception as e:
            print(f"Error extracting defense mechanism: {e}")
            return "Rationalization"
    
    def extract_few_shot_examples(self, chat_history: List[str], num_examples: int = 5) -> List[Dict[str, str]]:
        """
        从聊天记录提取Few-Shot样本
        
        Args:
            chat_history: 聊天记录列表
            num_examples: 提取的样本数量
        
        Returns:
            Few-Shot样本列表，格式：[{"context": "...", "response": "..."}, ...]
        """
        examples = []
        
        # 从聊天记录中提取对话对
        for i in range(1, len(chat_history)):
            if len(examples) >= num_examples:
                break
            
            context = chat_history[i-1] if i > 0 else ""
            response = chat_history[i]
            
            examples.append({
                "context": context,
                "response": response
            })
        
        return examples
    
    def _parse_json_response(self, response: str) -> Dict[str, Any]:
        """解析JSON响应（辅助方法）"""
        try:
            response = response.strip()
            if "```json" in response:
                start = response.find("```json") + 7
                end = response.find("```", start)
                if end != -1:
                    response = response[start:end].strip()
            elif "```" in response:
                start = response.find("```") + 3
                end = response.find("```", start)
                if end != -1:
                    response = response[start:end].strip()
            
            return json.loads(response)
        except Exception as e:
            print(f"Error parsing JSON response: {e}")
            print(f"Response was: {response}")
            return {}


def extract_profile_from_text(text: str, llm_name: str = "gpt-4o-mini", language: str = "zh") -> Dict[str, Any]:
    """
    从文本提取用户画像的便捷函数
    
    Args:
        text: 用户提供的文本
        llm_name: LLM模型名称
        language: 语言设置
    
    Returns:
        用户画像字典
    """
    extractor = ProfileExtractor(llm_name=llm_name, language=language)
    return extractor.extract_profile_from_text(text)


def extract_profile_from_qa(answers: Dict[str, str], llm_name: str = "gpt-4o-mini", language: str = "zh") -> Dict[str, Any]:
    """
    从问答结果提取用户画像的便捷函数（旧版）
    
    Args:
        answers: 问答字典
        llm_name: LLM模型名称
        language: 语言设置
    
    Returns:
        用户画像字典
    """
    extractor = ProfileExtractor(llm_name=llm_name, language=language)
    return extractor.extract_profile_from_qa(answers)


# ========== 新版三层人格模型便捷函数 ==========

def extract_personality_profile_from_questionnaire(answers: Dict[str, str],
                                                   chat_history: Optional[List[str]] = None,
                                                   llm_name: str = "gpt-4o-mini",
                                                   language: str = "zh") -> PersonalityProfile:
    """
    从问卷答案提取完整的三层人格模型（便捷函数）
    
    Args:
        answers: 问卷答案字典
        chat_history: 可选的聊天记录
        llm_name: LLM模型名称
        language: 语言设置
    
    Returns:
        PersonalityProfile对象
    """
    extractor = ProfileExtractor(llm_name=llm_name, language=language)
    return extractor.extract_personality_profile_from_questionnaire(answers, chat_history)


def extract_personality_profile_from_chat_history(chat_history: List[str],
                                                  num_examples: int = 5,
                                                  llm_name: str = "gpt-4o-mini",
                                                  language: str = "zh") -> PersonalityProfile:
    """
    从聊天记录提取完整的三层人格模型（便捷函数）
    
    Args:
        chat_history: 聊天记录列表
        num_examples: Few-Shot样本数量
        llm_name: LLM模型名称
        language: 语言设置
    
    Returns:
        PersonalityProfile对象
    """
    extractor = ProfileExtractor(llm_name=llm_name, language=language)
    return extractor.extract_personality_profile_from_chat_history(chat_history, num_examples)


def extract_personality_profile_from_text(text: str,
                                         llm_name: str = "gpt-4o-mini",
                                         language: str = "zh") -> PersonalityProfile:
    """
    从文本提取完整的三层人格模型（便捷函数）
    
    Args:
        text: 用户文本
        llm_name: LLM模型名称
        language: 语言设置
    
    Returns:
        PersonalityProfile对象
    """
    extractor = ProfileExtractor(llm_name=llm_name, language=language)
    return extractor.extract_personality_profile_from_text(text)

