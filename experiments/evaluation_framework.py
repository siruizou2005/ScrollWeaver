"""
PersonaForge Experiment Evaluation Framework
=============================================

实验评测框架：评估心理学驱动的三层人格模型 + 双重思维链生成机制

主要评测维度：
1. Personality Consistency (PC) - 人格一致性
2. Style Adherence (SA) - 风格遵守度
3. Response Diversity (RD) - 回复多样性
4. Defense Mechanism Manifestation (DM) - 防御机制体现
"""

import os
import sys
import json
import random
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from collections import defaultdict
import re

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@dataclass
class EvaluationScenario:
    """评测场景"""
    scenario_id: str
    scenario_type: str  # emotional, conflict, casual, first_encounter
    context: str  # 场景描述
    trigger: str  # 触发行为/对话
    trigger_role: str  # 触发者
    expected_traits: Dict[str, Any]  # 期望体现的特质
    

@dataclass
class EvaluationResult:
    """评测结果"""
    scenario_id: str
    role_code: str
    response: str
    inner_monologue: Optional[str]  # 如果使用双重思维链，记录内心独白
    pc_score: float  # 人格一致性分数 0-1
    sa_score: float  # 风格遵守度分数 0-1
    dm_score: float  # 防御机制体现分数 0-1
    method: str  # baseline/ours/ours_no_dual
    metadata: Dict[str, Any]


class PersonalityConsistencyEvaluator:
    """
    人格一致性评估器
    
    评估生成的回复是否符合角色的 Big Five 人格特质
    """
    
    def __init__(self, llm=None):
        self.llm = llm
        
        # Big Five 特质的行为指标
        self.trait_indicators = {
            "openness": {
                "high": ["创新想法", "好奇", "开放", "艺术", "想象", "新颖"],
                "low": ["传统", "保守", "务实", "常规", "实际"]
            },
            "conscientiousness": {
                "high": ["计划", "责任", "谨慎", "有序", "目标", "自律"],
                "low": ["随意", "灵活", "即兴", "自由", "随性"]
            },
            "extraversion": {
                "high": ["热情", "主动", "社交", "积极", "活力", "健谈"],
                "low": ["安静", "内敛", "独处", "沉默", "保留"]
            },
            "agreeableness": {
                "high": ["合作", "友善", "同情", "信任", "温和", "宽容"],
                "low": ["竞争", "质疑", "批判", "独立", "直言"]
            },
            "neuroticism": {
                "high": ["焦虑", "担心", "敏感", "紧张", "情绪化", "忧虑"],
                "low": ["冷静", "稳定", "放松", "乐观", "淡定"]
            }
        }
    
    def evaluate(self, response: str, personality_profile: Dict) -> float:
        """
        评估回复与人格特质的一致性
        
        Args:
            response: 生成的回复
            personality_profile: 角色的人格画像
            
        Returns:
            一致性分数 0-1
        """
        big_five = personality_profile.get("core_traits", {}).get("big_five", {})
        
        if not big_five:
            return 0.5  # 无法评估
        
        scores = []
        for trait, value in big_five.items():
            trait_score = self._evaluate_trait(response, trait, value)
            scores.append(trait_score)
        
        return sum(scores) / len(scores) if scores else 0.5
    
    def _evaluate_trait(self, response: str, trait: str, value: float) -> float:
        """评估单个特质的一致性"""
        if trait not in self.trait_indicators:
            return 0.5
        
        indicators = self.trait_indicators[trait]
        high_count = sum(1 for ind in indicators["high"] if ind in response)
        low_count = sum(1 for ind in indicators["low"] if ind in response)
        
        # 高分特质应该更多体现 high 指标
        if value >= 0.7:  # 高分特质
            expected_high = True
        elif value <= 0.3:  # 低分特质
            expected_high = False
        else:  # 中等特质
            return 0.5  # 不做强要求
        
        if high_count + low_count == 0:
            return 0.5  # 无法判断
        
        ratio = high_count / (high_count + low_count)
        
        if expected_high:
            return ratio
        else:
            return 1 - ratio


class StyleAdherenceEvaluator:
    """
    风格遵守度评估器
    
    评估生成的回复是否符合角色的语言风格
    """
    
    def __init__(self):
        pass
    
    def evaluate(self, response: str, personality_profile: Dict) -> float:
        """
        评估回复与风格矩阵的符合度
        
        Args:
            response: 生成的回复
            personality_profile: 角色的人格画像
            
        Returns:
            符合度分数 0-1
        """
        speaking_style = personality_profile.get("speaking_style", {})
        
        if not speaking_style:
            return 0.5
        
        scores = []
        
        # 1. 评估句长
        sentence_length = speaking_style.get("sentence_length", "medium")
        scores.append(self._evaluate_sentence_length(response, sentence_length))
        
        # 2. 评估口头禅使用
        catchphrases = speaking_style.get("catchphrases", [])
        if catchphrases:
            scores.append(self._evaluate_catchphrases(response, catchphrases))
        
        # 3. 评估语气词使用
        tone_markers = speaking_style.get("tone_markers", [])
        if tone_markers:
            scores.append(self._evaluate_tone_markers(response, tone_markers))
        
        # 4. 评估词汇等级
        vocabulary_level = speaking_style.get("vocabulary_level", "mixed")
        scores.append(self._evaluate_vocabulary(response, vocabulary_level))
        
        return sum(scores) / len(scores) if scores else 0.5
    
    def _evaluate_sentence_length(self, response: str, expected: str) -> float:
        """评估句长"""
        # 按标点分句
        sentences = re.split(r'[。！？；…]', response)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        if not sentences:
            return 0.5
        
        avg_length = sum(len(s) for s in sentences) / len(sentences)
        
        if expected == "short":
            # 短句：平均 < 15 字符
            return 1.0 if avg_length < 15 else max(0, 1 - (avg_length - 15) / 30)
        elif expected == "long":
            # 长句：平均 > 30 字符
            return 1.0 if avg_length > 30 else max(0, avg_length / 30)
        else:  # medium or mixed
            return 0.7  # 中等长度给固定分数
    
    def _evaluate_catchphrases(self, response: str, catchphrases: List[str]) -> float:
        """评估口头禅使用"""
        if not catchphrases:
            return 0.5
        
        used = sum(1 for cp in catchphrases if cp in response)
        # 使用至少一个口头禅得满分
        return min(1.0, used / 1)
    
    def _evaluate_tone_markers(self, response: str, tone_markers: List[str]) -> float:
        """评估语气词使用"""
        if not tone_markers:
            return 0.5
        
        used = sum(1 for tm in tone_markers if tm in response)
        # 使用至少一个语气词得满分
        return min(1.0, used / 1)
    
    def _evaluate_vocabulary(self, response: str, expected: str) -> float:
        """评估词汇等级"""
        # 学术词汇指标
        academic_words = ["然", "故", "此", "乃", "者", "也", "矣", "焉", "之", "与"]
        # 口语化指标
        casual_words = ["啊", "呀", "嘛", "吧", "呢", "哦", "诶", "咋", "俺"]
        # 网络用语指标
        network_words = ["yyds", "绝绝子", "无语", "爆笑", "笑死", "破防"]
        
        academic_count = sum(1 for w in academic_words if w in response)
        casual_count = sum(1 for w in casual_words if w in response)
        network_count = sum(1 for w in network_words if w in response)
        
        total = academic_count + casual_count + network_count
        if total == 0:
            return 0.5
        
        if expected == "academic":
            return academic_count / total
        elif expected == "casual":
            return casual_count / total
        elif expected == "network":
            return network_count / total
        else:  # mixed
            return 0.7


class DefenseMechanismEvaluator:
    """
    防御机制体现评估器
    
    评估在压力场景下，生成的回复是否体现了角色的防御机制
    """
    
    def __init__(self, llm=None):
        self.llm = llm
        
        # 防御机制的典型表现
        self.mechanism_indicators = {
            "Rationalization": ["因为", "所以", "道理", "自然", "合理", "应该"],
            "Projection": ["你才", "他们", "都是", "别人", "怪", "责"],
            "Denial": ["不是", "没有", "怎么可能", "不会", "不可能"],
            "Sublimation": ["不如", "倒是", "正好", "反而", "化作", "寄情"],
            "Displacement": ["算了", "管他", "随便", "也罢", "不理"],
            "Humor": ["哈哈", "好笑", "有趣", "开玩笑", "自嘲"],
            "Intellectualization": ["客观", "分析", "逻辑", "理性", "思考", "判断"],
            "Repression": ["不想", "忘了", "别提", "过去了"],
            "ReactionFormation": ["虽然", "但是", "其实", "不过", "可是"]
        }
    
    def evaluate(self, response: str, personality_profile: Dict, 
                 is_stressful_scenario: bool = False) -> float:
        """
        评估回复是否体现了防御机制
        
        Args:
            response: 生成的回复
            personality_profile: 角色的人格画像
            is_stressful_scenario: 是否为压力场景
            
        Returns:
            体现度分数 0-1
        """
        if not is_stressful_scenario:
            return 0.5  # 非压力场景不评估
        
        defense = personality_profile.get("core_traits", {}).get("defense_mechanism", "")
        
        if not defense or defense not in self.mechanism_indicators:
            return 0.5
        
        indicators = self.mechanism_indicators[defense]
        matches = sum(1 for ind in indicators if ind in response)
        
        # 至少匹配 1 个指标得满分
        return min(1.0, matches / 1)


class ResponseDiversityEvaluator:
    """
    回复多样性评估器
    
    使用 Self-BLEU 评估生成回复的多样性（越低越好）
    """
    
    def __init__(self):
        pass
    
    def evaluate_batch(self, responses: List[str]) -> float:
        """
        计算一批回复的 Self-BLEU 分数（越低表示多样性越好）
        
        Args:
            responses: 回复列表
            
        Returns:
            Self-BLEU 分数 0-1（越低越好）
        """
        if len(responses) < 2:
            return 0.5
        
        # 简化版 Self-BLEU：计算两两相似度的平均值
        def calculate_overlap(text1: str, text2: str) -> float:
            """计算两段文本的 n-gram 重叠度"""
            # 2-gram
            def get_ngrams(text: str, n: int = 2) -> set:
                chars = list(text)
                return set(tuple(chars[i:i+n]) for i in range(len(chars) - n + 1))
            
            ngrams1 = get_ngrams(text1)
            ngrams2 = get_ngrams(text2)
            
            if not ngrams1 or not ngrams2:
                return 0
            
            overlap = len(ngrams1 & ngrams2)
            return overlap / max(len(ngrams1), len(ngrams2))
        
        total_overlap = 0
        count = 0
        for i in range(len(responses)):
            for j in range(i + 1, len(responses)):
                total_overlap += calculate_overlap(responses[i], responses[j])
                count += 1
        
        return total_overlap / count if count > 0 else 0.5


class ExperimentRunner:
    """
    实验运行器
    
    执行完整的评测实验流程
    """
    
    def __init__(self, 
                 data_dir: str = "./data/roles",
                 output_dir: str = "./experiment_results"):
        self.data_dir = data_dir
        self.output_dir = output_dir
        
        # 初始化评估器
        self.pc_evaluator = PersonalityConsistencyEvaluator()
        self.sa_evaluator = StyleAdherenceEvaluator()
        self.dm_evaluator = DefenseMechanismEvaluator()
        self.rd_evaluator = ResponseDiversityEvaluator()
        
        # 评测场景
        self.scenarios = self._create_scenarios()
    
    def _create_scenarios(self) -> List[EvaluationScenario]:
        """创建评测场景"""
        scenarios = [
            # 情感场景
            EvaluationScenario(
                scenario_id="emotional_1",
                scenario_type="emotional",
                context="在花园中，春意正浓",
                trigger="你怎么看起来有些忧愁？是有什么心事吗？",
                trigger_role="friend",
                expected_traits={"neuroticism": "high_if_high"}
            ),
            EvaluationScenario(
                scenario_id="emotional_2",
                scenario_type="emotional",
                context="收到一封意外的来信",
                trigger="这封信里说你最在意的人即将离开，你有什么感想？",
                trigger_role="friend",
                expected_traits={"neuroticism": "high_if_high", "openness": "show_expression"}
            ),
            
            # 冲突场景（用于评估防御机制）
            EvaluationScenario(
                scenario_id="conflict_1",
                scenario_type="conflict",
                context="在众人面前被指责犯了错误",
                trigger="你这次做的事情真是太让人失望了！大家都在议论你！",
                trigger_role="authority",
                expected_traits={"defense_mechanism": "should_manifest"}
            ),
            EvaluationScenario(
                scenario_id="conflict_2",
                scenario_type="conflict",
                context="被人当众质疑能力",
                trigger="我觉得你根本做不好这件事，还是让别人来吧！",
                trigger_role="rival",
                expected_traits={"defense_mechanism": "should_manifest"}
            ),
            
            # 日常场景
            EvaluationScenario(
                scenario_id="casual_1",
                scenario_type="casual",
                context="午后闲暇时光",
                trigger="今天天气不错，你有什么打算吗？",
                trigger_role="friend",
                expected_traits={"extraversion": "show_tendency"}
            ),
            EvaluationScenario(
                scenario_id="casual_2",
                scenario_type="casual",
                context="讨论一个有趣的话题",
                trigger="最近有一种新的想法在流行，你怎么看待新事物？",
                trigger_role="friend",
                expected_traits={"openness": "show_tendency"}
            ),
            
            # 首次相遇场景
            EvaluationScenario(
                scenario_id="first_encounter_1",
                scenario_type="first_encounter",
                context="在一个聚会上第一次见面",
                trigger="初次见面，请多指教。请问你是做什么的？",
                trigger_role="stranger",
                expected_traits={"extraversion": "show_tendency", "agreeableness": "show_tendency"}
            ),
            
            # 决策场景
            EvaluationScenario(
                scenario_id="decision_1",
                scenario_type="decision",
                context="面临一个重要选择",
                trigger="这件事关系重大，你需要在今天做出决定。你会怎么选？",
                trigger_role="advisor",
                expected_traits={"conscientiousness": "show_tendency"}
            ),
        ]
        return scenarios
    
    def load_character(self, source: str, role_code: str) -> Optional[Dict]:
        """加载角色数据"""
        role_path = os.path.join(self.data_dir, source, role_code, "role_info.json")
        if os.path.exists(role_path):
            with open(role_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None
    
    def list_characters(self) -> List[Tuple[str, str]]:
        """列出所有可用角色"""
        characters = []
        for source in os.listdir(self.data_dir):
            source_path = os.path.join(self.data_dir, source)
            if os.path.isdir(source_path):
                for role_code in os.listdir(source_path):
                    role_path = os.path.join(source_path, role_code)
                    if os.path.isdir(role_path):
                        characters.append((source, role_code))
        return characters
    
    def run_single_evaluation(self, 
                             role_data: Dict,
                             scenario: EvaluationScenario,
                             response: str,
                             inner_monologue: Optional[str] = None,
                             method: str = "ours") -> EvaluationResult:
        """运行单次评估"""
        personality_profile = role_data.get("personality_profile", {})
        
        # 评估人格一致性
        pc_score = self.pc_evaluator.evaluate(response, personality_profile)
        
        # 评估风格遵守度
        sa_score = self.sa_evaluator.evaluate(response, personality_profile)
        
        # 评估防御机制体现
        is_stressful = scenario.scenario_type in ["conflict", "emotional"]
        dm_score = self.dm_evaluator.evaluate(response, personality_profile, is_stressful)
        
        return EvaluationResult(
            scenario_id=scenario.scenario_id,
            role_code=role_data.get("role_code", ""),
            response=response,
            inner_monologue=inner_monologue,
            pc_score=pc_score,
            sa_score=sa_score,
            dm_score=dm_score,
            method=method,
            metadata={
                "scenario_type": scenario.scenario_type,
                "trigger": scenario.trigger
            }
        )
    
    def compute_aggregate_scores(self, results: List[EvaluationResult]) -> Dict[str, float]:
        """计算聚合分数"""
        if not results:
            return {}
        
        pc_scores = [r.pc_score for r in results]
        sa_scores = [r.sa_score for r in results]
        dm_scores = [r.dm_score for r in results if r.metadata.get("scenario_type") in ["conflict", "emotional"]]
        
        responses = [r.response for r in results]
        rd_score = self.rd_evaluator.evaluate_batch(responses)
        
        return {
            "PC (Personality Consistency)": sum(pc_scores) / len(pc_scores),
            "SA (Style Adherence)": sum(sa_scores) / len(sa_scores),
            "DM (Defense Mechanism)": sum(dm_scores) / len(dm_scores) if dm_scores else 0.5,
            "RD (Response Diversity)": 1 - rd_score,  # 转换为越高越好
        }
    
    def save_results(self, results: List[EvaluationResult], output_file: str):
        """保存结果"""
        os.makedirs(self.output_dir, exist_ok=True)
        output_path = os.path.join(self.output_dir, output_file)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump([asdict(r) for r in results], f, ensure_ascii=False, indent=2)
        
        print(f"Results saved to {output_path}")


def main():
    """主函数：演示评测流程"""
    print("=" * 60)
    print("PersonaForge Experiment Evaluation Framework")
    print("=" * 60)
    
    runner = ExperimentRunner()
    
    # 列出可用角色
    characters = runner.list_characters()
    print(f"\n发现 {len(characters)} 个角色:")
    for source, role_code in characters[:10]:  # 只显示前10个
        print(f"  - {source}/{role_code}")
    
    # 显示评测场景
    print(f"\n共有 {len(runner.scenarios)} 个评测场景:")
    for scenario in runner.scenarios:
        print(f"  - [{scenario.scenario_type}] {scenario.scenario_id}: {scenario.trigger[:30]}...")
    
    print("\n评测框架已就绪。请使用 run_experiment.py 执行完整实验。")


if __name__ == "__main__":
    main()
