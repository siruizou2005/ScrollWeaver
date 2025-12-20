"""
预设Agent模板
提供一些预设的Agent配置，用户可以从中选择并创建
支持新的三层人格模型格式
"""
import os
import json
from typing import Dict, List, Any, Optional
from modules.personality_model import (
    PersonalityProfile, CoreTraits, SpeakingStyle, DynamicState,
    DefenseMechanism
)
from sw_utils import load_json_file


class PresetAgents:
    """预设Agent模板库"""
    
    _PRESET_TEMPLATES = None
    
    @staticmethod
    def _load_preset_templates() -> List[Dict[str, Any]]:
        """从JSON文件加载预设模板"""
        if PresetAgents._PRESET_TEMPLATES is not None:
            return PresetAgents._PRESET_TEMPLATES
        
        # 尝试从JSON文件加载
        json_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'data', 'preset_agents', 'preset_agents.json'
        )
        
        if os.path.exists(json_path):
            try:
                PresetAgents._PRESET_TEMPLATES = load_json_file(json_path)
                return PresetAgents._PRESET_TEMPLATES
            except Exception as e:
                print(f"Warning: Failed to load preset templates from JSON: {e}")
                # 如果加载失败，使用硬编码的默认值
                pass
        
        # 如果JSON文件不存在或加载失败，使用硬编码的默认值（向后兼容）
        PresetAgents._PRESET_TEMPLATES = [
        {
            "id": "preset_001",
            "name": "文艺青年",
            "icon": "📚",
            "description": "热爱阅读、电影和音乐的文艺青年",
            "interests": ["阅读", "电影", "音乐", "旅行", "摄影", "咖啡"],
            "mbti": "INFP",
            "personality": "理想主义、富有创造力，喜欢深度思考和独处，但也享受与志同道合的人交流",
            "social_goals": ["寻找读书伙伴", "讨论电影和文学", "寻找音乐同好"],
            "tags": ["文艺", "内向", "理想主义"],
            "pre_generated_motivation": "在闲聊酒会中，我希望找到志同道合的读书伙伴，一起讨论最近读过的书籍和电影。我期待能够分享对文学和艺术的见解，也愿意倾听他人的想法，寻找那些能够深入交流的知音。",
            "big_five": {
                "openness": 0.85,
                "conscientiousness": 0.35,
                "extraversion": 0.25,
                "agreeableness": 0.75,
                "neuroticism": 0.65
            },
            "values": ["审美", "真诚", "自由", "创造力", "深度"],
            "defense_mechanism": "Sublimation",
            "long_term_goals": [
                "在虚拟世界中建立自己的文学圈子",
                "创作一部有影响力的作品",
                "与志同道合的朋友深度交流",
                "探索更多艺术形式"
            ],
            "initial_mood": "melancholy",
            "initial_energy": 65
        },
        {
            "id": "preset_002",
            "name": "科技极客",
            "icon": "💻",
            "description": "对科技、编程和AI充满热情的极客",
            "interests": ["编程", "AI", "科技", "游戏", "动漫", "科幻"],
            "mbti": "INTP",
            "personality": "逻辑思维强，喜欢探索新技术，对未知充满好奇，享受深度技术讨论",
            "social_goals": ["寻找技术伙伴", "讨论科技话题", "寻找游戏搭子"],
            "tags": ["科技", "理性", "创新"],
            "pre_generated_motivation": "在闲聊酒会中，我希望找到对技术和AI感兴趣的朋友，一起探讨最新的科技趋势和编程技巧。我期待能够分享技术见解，也愿意学习他人的经验，寻找能够进行深度技术讨论的伙伴。",
            "big_five": {
                "openness": 0.90,
                "conscientiousness": 0.40,
                "extraversion": 0.20,
                "agreeableness": 0.50,
                "neuroticism": 0.55
            },
            "values": ["理性", "创新", "知识", "逻辑", "探索"],
            "defense_mechanism": "Intellectualization",
            "long_term_goals": [
                "在虚拟世界中开发有意义的项目",
                "掌握前沿技术并分享给他人",
                "建立技术社区",
                "探索AI的无限可能"
            ],
            "initial_mood": "neutral",
            "initial_energy": 75
        },
        {
            "id": "preset_003",
            "name": "运动达人",
            "icon": "🏃",
            "description": "热爱运动和健康生活的活力派",
            "interests": ["运动", "健身", "跑步", "旅行", "美食", "咖啡"],
            "mbti": "ESFP",
            "personality": "外向活跃，充满活力，喜欢户外活动，享受与朋友一起运动的时光",
            "social_goals": ["寻找运动伙伴", "寻找旅行伙伴", "寻找健身搭子"],
            "tags": ["运动", "外向", "活力"],
            "pre_generated_motivation": "在闲聊酒会中，我希望找到热爱运动和健康生活的朋友，一起分享运动心得和旅行经历。我期待能够组织一些户外活动，也愿意参与他人的运动计划，寻找充满活力的伙伴一起享受生活。",
            "big_five": {
                "openness": 0.60,
                "conscientiousness": 0.45,
                "extraversion": 0.85,
                "agreeableness": 0.75,
                "neuroticism": 0.40
            },
            "values": ["活力", "享受", "健康", "自由", "冒险"],
            "defense_mechanism": "Humor",
            "long_term_goals": [
                "在虚拟世界中保持健康的生活方式",
                "组织更多户外活动",
                "与朋友一起探索新地方",
                "传播健康生活的理念"
            ],
            "initial_mood": "cheerful",
            "initial_energy": 85
        },
        {
            "id": "preset_004",
            "name": "艺术创作者",
            "icon": "🎨",
            "description": "热爱艺术创作和设计的创意者",
            "interests": ["绘画", "设计", "艺术", "摄影", "音乐", "时尚"],
            "mbti": "ENFP",
            "personality": "富有创造力，热情洋溢，喜欢表达自我，享受艺术创作和灵感交流",
            "social_goals": ["寻找创作伙伴", "分享艺术作品", "寻找灵感"],
            "tags": ["艺术", "创意", "热情"],
            "pre_generated_motivation": "在闲聊酒会中，我希望找到同样热爱艺术创作的朋友，一起分享作品和灵感。我期待能够展示自己的创作，也愿意欣赏他人的艺术作品，寻找能够激发创作灵感的伙伴。",
            "big_five": {
                "openness": 0.90,
                "conscientiousness": 0.35,
                "extraversion": 0.80,
                "agreeableness": 0.80,
                "neuroticism": 0.50
            },
            "values": ["创造力", "表达", "灵感", "审美", "自由"],
            "defense_mechanism": "Sublimation",
            "long_term_goals": [
                "在虚拟世界中建立艺术工作室",
                "创作一系列有影响力的作品",
                "与艺术家朋友共同创作",
                "传播艺术之美"
            ],
            "initial_mood": "cheerful",
            "initial_energy": 80
        },
        {
            "id": "preset_005",
            "name": "美食探索家",
            "icon": "🍜",
            "description": "热爱美食和烹饪的美食家",
            "interests": ["美食", "烹饪", "烘焙", "咖啡", "茶道", "旅行"],
            "mbti": "ISFP",
            "personality": "享受生活，注重细节，喜欢尝试新口味，享受与朋友分享美食的快乐",
            "social_goals": ["寻找美食伙伴", "分享烹饪心得", "寻找探店搭子"],
            "tags": ["美食", "生活", "享受"],
            "pre_generated_motivation": "在闲聊酒会中，我希望找到同样热爱美食的朋友，一起分享烹饪心得和探店经历。我期待能够推荐一些好吃的餐厅，也愿意学习新的烹饪技巧，寻找能够一起探索美食的伙伴。",
            "big_five": {
                "openness": 0.70,
                "conscientiousness": 0.50,
                "extraversion": 0.30,
                "agreeableness": 0.80,
                "neuroticism": 0.55
            },
            "values": ["享受", "审美", "细节", "分享", "生活"],
            "defense_mechanism": "Sublimation",
            "long_term_goals": [
                "在虚拟世界中探索各种美食",
                "掌握更多烹饪技巧",
                "与朋友分享美食体验",
                "发现隐藏的美食宝藏"
            ],
            "initial_mood": "cheerful",
            "initial_energy": 70
        },
        {
            "id": "preset_006",
            "name": "哲学思考者",
            "icon": "🤔",
            "description": "喜欢深度思考和哲学讨论的思考者",
            "interests": ["哲学", "心理学", "阅读", "历史", "文学", "思考"],
            "mbti": "INFJ",
            "personality": "深度思考，富有洞察力，喜欢探讨人生意义，享受深度对话",
            "social_goals": ["寻找思想伙伴", "讨论哲学话题", "深度交流"],
            "tags": ["哲学", "思考", "深度"],
            "pre_generated_motivation": "在闲聊酒会中，我希望找到同样喜欢深度思考的朋友，一起探讨哲学话题和人生意义。我期待能够进行有深度的对话，也愿意倾听他人的见解，寻找能够进行思想碰撞的伙伴。",
            "big_five": {
                "openness": 0.80,
                "conscientiousness": 0.65,
                "extraversion": 0.35,
                "agreeableness": 0.85,
                "neuroticism": 0.60
            },
            "values": ["真理", "洞察", "深度", "智慧", "理解"],
            "defense_mechanism": "Intellectualization",
            "long_term_goals": [
                "在虚拟世界中探索哲学思想",
                "与思想者进行深度对话",
                "形成自己的哲学体系",
                "帮助他人理解人生意义"
            ],
            "initial_mood": "neutral",
            "initial_energy": 70
        }
        ]
        return PresetAgents._PRESET_TEMPLATES
    
    @staticmethod
    def get_preset_templates() -> List[Dict[str, Any]]:
        """获取所有预设模板"""
        return PresetAgents._load_preset_templates()
    
    @staticmethod
    def get_preset_by_id(preset_id: str) -> Dict[str, Any]:
        """根据ID获取预设模板"""
        templates = PresetAgents.get_preset_templates()
        for template in templates:
            if template["id"] == preset_id:
                return template
        return None
    
    @staticmethod
    def create_soul_profile_from_preset(preset_id: str, custom_name: str = None) -> Dict[str, Any]:
        """从预设模板创建Soul画像（旧版，保持兼容）"""
        preset = PresetAgents.get_preset_by_id(preset_id)
        if not preset:
            raise ValueError(f"Preset {preset_id} not found")
        
        return {
            "user_id": custom_name or preset["name"],
            "interests": preset["interests"],
            "mbti": preset["mbti"],
            "personality": preset["personality"],
            "traits": preset.get("tags", []),
            "social_goals": preset["social_goals"],
            "long_term_goals": [f"在虚拟世界中{goal}" for goal in preset["social_goals"]],
            "activity_level": 0.9,
            "preset_id": preset_id,
            "preset_name": preset["name"]
        }
    
    @staticmethod
    def _get_big_five_for_mbti(mbti: str) -> Dict[str, float]:
        """根据MBTI获取Big Five评分"""
        # MBTI到Big Five的映射
        mappings = {
            "INFP": {"openness": 0.85, "conscientiousness": 0.35, "extraversion": 0.25, "agreeableness": 0.75, "neuroticism": 0.65},
            "INTP": {"openness": 0.90, "conscientiousness": 0.40, "extraversion": 0.20, "agreeableness": 0.50, "neuroticism": 0.55},
            "ESFP": {"openness": 0.60, "conscientiousness": 0.45, "extraversion": 0.85, "agreeableness": 0.75, "neuroticism": 0.40},
            "ENFP": {"openness": 0.90, "conscientiousness": 0.35, "extraversion": 0.80, "agreeableness": 0.80, "neuroticism": 0.50},
            "ISFP": {"openness": 0.70, "conscientiousness": 0.50, "extraversion": 0.30, "agreeableness": 0.80, "neuroticism": 0.55},
            "INFJ": {"openness": 0.80, "conscientiousness": 0.65, "extraversion": 0.35, "agreeableness": 0.85, "neuroticism": 0.60}
        }
        return mappings.get(mbti, {"openness": 0.5, "conscientiousness": 0.5, "extraversion": 0.5, "agreeableness": 0.5, "neuroticism": 0.5})
    
    @staticmethod
    def _get_speaking_style_for_preset(preset_id: str, mbti: str) -> Dict[str, Any]:
        """根据预设ID和MBTI获取语言风格"""
        # 为每个预设定制语言风格
        styles = {
            "preset_001": {  # 文艺青年
                "sentence_length": "medium",
                "vocabulary_level": "casual",
                "punctuation_habit": "standard",
                "emoji_usage": {"frequency": "low", "preferred": ["✨", "📚"], "avoided": []},
                "catchphrases": ["确实", "有点意思"],
                "tone_markers": ["啊", "呢"]
            },
            "preset_002": {  # 科技极客
                "sentence_length": "long",
                "vocabulary_level": "academic",
                "punctuation_habit": "minimal",
                "emoji_usage": {"frequency": "low", "preferred": ["🤔", "💻"], "avoided": ["🥺"]},
                "catchphrases": ["理论上", "实际上"],
                "tone_markers": []
            },
            "preset_003": {  # 运动达人
                "sentence_length": "short",
                "vocabulary_level": "casual",
                "punctuation_habit": "excessive",
                "emoji_usage": {"frequency": "high", "preferred": ["💪", "🏃", "🔥"], "avoided": []},
                "catchphrases": ["冲", "走起"],
                "tone_markers": ["啊", "哈"]
            },
            "preset_004": {  # 艺术创作者
                "sentence_length": "mixed",
                "vocabulary_level": "casual",
                "punctuation_habit": "excessive",
                "emoji_usage": {"frequency": "high", "preferred": ["🎨", "✨", "💫"], "avoided": []},
                "catchphrases": ["灵感", "创作"],
                "tone_markers": ["呀", "呢"]
            },
            "preset_005": {  # 美食探索家
                "sentence_length": "medium",
                "vocabulary_level": "casual",
                "punctuation_habit": "standard",
                "emoji_usage": {"frequency": "medium", "preferred": ["🍜", "😋", "✨"], "avoided": []},
                "catchphrases": ["好吃", "推荐"],
                "tone_markers": ["啊", "呢"]
            },
            "preset_006": {  # 哲学思考者
                "sentence_length": "long",
                "vocabulary_level": "academic",
                "punctuation_habit": "standard",
                "emoji_usage": {"frequency": "none", "preferred": [], "avoided": []},
                "catchphrases": ["思考", "探讨"],
                "tone_markers": []
            }
        }
        
        default_style = {
            "sentence_length": "medium",
            "vocabulary_level": "casual",
            "punctuation_habit": "standard",
            "emoji_usage": {"frequency": "medium", "preferred": [], "avoided": []},
            "catchphrases": [],
            "tone_markers": []
        }
        
        return styles.get(preset_id, default_style)
    
    @staticmethod
    def create_personality_profile_from_preset(preset_id: str, custom_name: Optional[str] = None) -> PersonalityProfile:
        """
        从预设模板创建完整的三层人格模型（新版）
        优先使用预设模板中的完整字段，避免调用API
        
        Args:
            preset_id: 预设ID
            custom_name: 自定义名称（可选）
        
        Returns:
            PersonalityProfile对象
        """
        preset = PresetAgents.get_preset_by_id(preset_id)
        if not preset:
            raise ValueError(f"Preset {preset_id} not found")
        
        mbti = preset["mbti"]
        
        # 获取Big Five（优先使用预设模板中的，否则从MBTI映射）
        if "big_five" in preset and preset["big_five"]:
            big_five = preset["big_five"]
        else:
            big_five = PresetAgents._get_big_five_for_mbti(mbti)
        
        # 获取语言风格
        style_data = PresetAgents._get_speaking_style_for_preset(preset_id, mbti)
        
        # 获取价值观（优先使用预设模板中的）
        values = preset.get("values", ["真诚", "自由"])
        
        # 获取防御机制（优先使用预设模板中的）
        defense_mechanism_str = preset.get("defense_mechanism", "RATIONALIZATION")
        # 验证防御机制是否有效
        try:
            # 尝试匹配枚举名称（全大写，如 "SUBLIMATION"）
            defense_mechanism_upper = defense_mechanism_str.upper()
            if hasattr(DefenseMechanism, defense_mechanism_upper):
                defense_mechanism = DefenseMechanism[defense_mechanism_upper].value
            else:
                # 如果找不到，尝试直接使用字符串值（如 "Sublimation"）
                # 检查是否是有效的枚举值
                valid_values = [e.value for e in DefenseMechanism]
                if defense_mechanism_str in valid_values:
                    defense_mechanism = defense_mechanism_str
                else:
                    # 如果都找不到，使用默认值
                    defense_mechanism = DefenseMechanism.RATIONALIZATION.value
        except (KeyError, AttributeError, TypeError):
            # 如果无效，使用默认值
            defense_mechanism = DefenseMechanism.RATIONALIZATION.value
        
        # 构建CoreTraits
        core_traits = CoreTraits(
            mbti=mbti,
            big_five=big_five,
            values=values,
            defense_mechanism=defense_mechanism
        )
        
        # 构建SpeakingStyle
        speaking_style = SpeakingStyle(
            sentence_length=style_data["sentence_length"],
            vocabulary_level=style_data["vocabulary_level"],
            punctuation_habit=style_data["punctuation_habit"],
            emoji_usage=style_data["emoji_usage"],
            catchphrases=style_data["catchphrases"],
            tone_markers=style_data["tone_markers"]
        )
        
        # 获取初始状态（优先使用预设模板中的）
        initial_mood = preset.get("initial_mood", "neutral")
        initial_energy = preset.get("initial_energy", 70)
        
        # 构建DynamicState
        dynamic_state = DynamicState(
            current_mood=initial_mood,
            energy_level=initial_energy
        )
        
        # 获取长期目标（优先使用预设模板中的）
        if "long_term_goals" in preset and preset["long_term_goals"]:
            long_term_goals = preset["long_term_goals"]
        else:
            # 如果没有，从social_goals生成
            long_term_goals = [f"在虚拟世界中{goal}" for goal in preset["social_goals"]]
        
        # 构建PersonalityProfile
        return PersonalityProfile(
            core_traits=core_traits,
            speaking_style=speaking_style,
            dynamic_state=dynamic_state,
            interests=preset["interests"],
            social_goals=preset["social_goals"],
            long_term_goals=long_term_goals,
            style_examples=[]
        )

    # --- Embedding Cache ---
    _EMBEDDING_CACHE = None
    _CACHE_FILE = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'data', 'preset_agents', 'preset_embeddings.pkl'
    )

    @staticmethod
    def _load_embedding_cache():
        import pickle
        if PresetAgents._EMBEDDING_CACHE is not None:
            return
        
        if os.path.exists(PresetAgents._CACHE_FILE):
            try:
                with open(PresetAgents._CACHE_FILE, 'rb') as f:
                    PresetAgents._EMBEDDING_CACHE = pickle.load(f)
            except Exception as e:
                print(f"Error loading embedding cache: {e}")
                PresetAgents._EMBEDDING_CACHE = {}
        else:
            PresetAgents._EMBEDDING_CACHE = {}

    @staticmethod
    def _save_embedding_cache():
        import pickle
        try:
            os.makedirs(os.path.dirname(PresetAgents._CACHE_FILE), exist_ok=True)
            with open(PresetAgents._CACHE_FILE, 'wb') as f:
                pickle.dump(PresetAgents._EMBEDDING_CACHE, f)
        except Exception as e:
            print(f"Error saving embedding cache: {e}")

    @staticmethod
    def get_preset_embeddings(preset: Dict[str, Any], embedding_model) -> Dict[str, Any]:
        """
        获取预设Agent的Embedding（优先从缓存读取）
        
        Args:
            preset: 预设Agent配置
            embedding_model: Embedding模型函数
            
        Returns:
            Dict: 包含 'interests', 'values', 'goals' 的 embedding 向量
        """
        PresetAgents._load_embedding_cache()
        
        preset_id = preset['id']
        # 简单的缓存键生成：ID + 内容哈希（简化版只用ID，假设ID唯一且内容不变）
        # 如果需要更严谨，可以将 interests/values 等内容拼接后 hash
        
        if preset_id in PresetAgents._EMBEDDING_CACHE:
            return PresetAgents._EMBEDDING_CACHE[preset_id]
        
        # 计算 Embedding
        embeddings = {}
        try:
            interests_text = " ".join(preset.get('interests', []))
            values_text = " ".join(preset.get('values', []))
            goals_text = " ".join(preset.get('social_goals', []))
            
            texts = [t for t in [interests_text, values_text, goals_text] if t]
            if texts and embedding_model:
                vecs = embedding_model(texts)
                idx = 0
                if interests_text:
                    embeddings['interests'] = vecs[idx]
                    idx += 1
                if values_text:
                    embeddings['values'] = vecs[idx]
                    idx += 1
                if goals_text:
                    embeddings['goals'] = vecs[idx]
                    idx += 1
            
            # 更新缓存
            PresetAgents._EMBEDDING_CACHE[preset_id] = embeddings
            PresetAgents._save_embedding_cache()
            
        except Exception as e:
            print(f"Error computing embeddings for preset {preset_id}: {e}")
            
        return embeddings

