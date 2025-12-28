"""
PersonaForge Experiment Runner
==============================

完整实验运行脚本：对比 PersonaForge 与基线方法

使用方法：
    python run_experiment.py --method all --characters 10 --scenarios all
    python run_experiment.py --method ours --characters 5 --scenarios conflict
"""

import os
import sys
import json
import argparse
from datetime import datetime
from typing import Dict, List, Any, Optional
import random

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from experiments.evaluation_framework import (
    ExperimentRunner, 
    EvaluationResult,
    EvaluationScenario
)


class BaselineGenerator:
    """基线方法生成器"""
    
    def __init__(self, llm=None):
        self.llm = llm
    
    def generate_vanilla(self, role_data: Dict, scenario: EvaluationScenario) -> str:
        """
        Vanilla LLM 基线：直接使用角色描述生成
        """
        prompt = f"""你是{role_data.get('role_name', '一个角色')}。

角色描述：{role_data.get('profile', '')}

场景：{scenario.context}

{scenario.trigger_role}说："{scenario.trigger}"

请以{role_data.get('role_name')}的身份回复："""
        
        if self.llm:
            return self.llm.chat(prompt)
        else:
            # Mock response for testing
            return f"[Vanilla] 这是{role_data.get('role_name')}的回复。"
    
    def generate_character_llm(self, role_data: Dict, scenario: EvaluationScenario) -> str:
        """
        Character-LLM 基线：使用详细角色描述 + 少量示例
        """
        style_examples = role_data.get('style_examples', [])
        examples_text = ""
        if style_examples:
            examples_text = "\n\n参考示例：\n"
            for ex in style_examples[:2]:
                examples_text += f"场景：{ex.get('context', '')}\n回复：{ex.get('response', '')}\n\n"
        
        prompt = f"""你是{role_data.get('role_name', '一个角色')}。

【角色描述】
{role_data.get('profile', '')}

【身份】
{', '.join(role_data.get('identity', []))}
{examples_text}
【当前场景】{scenario.context}

{scenario.trigger_role}说："{scenario.trigger}"

请以{role_data.get('role_name')}的身份，用符合角色风格的方式回复："""
        
        if self.llm:
            return self.llm.chat(prompt)
        else:
            return f"[CharacterLLM] 这是{role_data.get('role_name')}的回复。"


class PersonaForgeGenerator:
    """PersonaForge 方法生成器"""
    
    def __init__(self, llm=None):
        self.llm = llm
    
    def generate_with_dual_process(self, role_data: Dict, scenario: EvaluationScenario) -> tuple:
        """
        PersonaForge 完整方法：三层人格模型 + 双重思维链
        
        Returns:
            (response, inner_monologue)
        """
        personality_profile = role_data.get("personality_profile", {})
        core_traits = personality_profile.get("core_traits", {})
        speaking_style = personality_profile.get("speaking_style", {})
        dynamic_state = personality_profile.get("dynamic_state", {})
        
        # Phase 1: 生成内心独白
        big_five = core_traits.get("big_five", {})
        big_five_desc = ", ".join([f"{k}: {v:.2f}" for k, v in big_five.items()])
        
        inner_prompt = f"""你是{role_data.get('role_name')}，{core_traits.get('mbti', 'INFP')}类型的人。

你的大五人格是：{big_five_desc}
你的防御机制是：{core_traits.get('defense_mechanism', '')}
你的价值观：{', '.join(core_traits.get('values', []))}
当前心情：{dynamic_state.get('current_mood', 'neutral')}
能量值：{dynamic_state.get('energy_level', 50)}/100

场景：{scenario.context}
{scenario.trigger_role}对你说："{scenario.trigger}"

请根据你的性格生成一段**内心独白**（不展示给用户）：

规则：
1. 如果神经质(neuroticism)高(>0.7)，多关注潜在威胁或焦虑
2. 如果宜人性(agreeableness)低(<0.4)，可以内心吐槽
3. 根据防御机制，在压力下有相应心理反应
4. 能量低时想法简短消极，能量高时想法丰富积极

只输出内心独白："""

        if self.llm:
            inner_monologue = self.llm.chat(inner_prompt)
        else:
            inner_monologue = f"[内心独白] {role_data.get('role_name')}正在思考..."
        
        # Phase 2: 生成风格化回复
        response_prompt = f"""你的内心想法是：
"{inner_monologue}"

现在将其转化为回复给{scenario.trigger_role}。

**严格遵守以下语言风格**:
- 句长: {speaking_style.get('sentence_length', 'medium')}
- 词汇等级: {speaking_style.get('vocabulary_level', 'casual')}
- 标点习惯: {speaking_style.get('punctuation_habit', 'standard')}
- 语气词: {', '.join(speaking_style.get('tone_markers', []))}
- 口头禅: {', '.join(speaking_style.get('catchphrases', []))}

当前上下文：
场景：{scenario.context}
{scenario.trigger_role}说："{scenario.trigger}"

请生成符合上述风格的回复，只输出回复内容："""

        if self.llm:
            response = self.llm.chat(response_prompt)
        else:
            response = f"[PersonaForge] 这是{role_data.get('role_name')}的风格化回复。"
        
        return response, inner_monologue
    
    def generate_without_dual_process(self, role_data: Dict, scenario: EvaluationScenario) -> str:
        """
        消融实验：只用三层人格模型，不用双重思维链
        """
        personality_profile = role_data.get("personality_profile", {})
        core_traits = personality_profile.get("core_traits", {})
        speaking_style = personality_profile.get("speaking_style", {})
        
        big_five = core_traits.get("big_five", {})
        big_five_desc = ", ".join([f"{k}: {v:.2f}" for k, v in big_five.items()])
        
        prompt = f"""你是{role_data.get('role_name')}。

【人格特质】
- MBTI: {core_traits.get('mbti', 'INFP')}
- 大五人格: {big_five_desc}
- 防御机制: {core_traits.get('defense_mechanism', '')}
- 价值观: {', '.join(core_traits.get('values', []))}

【语言风格】
- 句长: {speaking_style.get('sentence_length', 'medium')}
- 词汇等级: {speaking_style.get('vocabulary_level', 'casual')}
- 语气词: {', '.join(speaking_style.get('tone_markers', []))}
- 口头禅: {', '.join(speaking_style.get('catchphrases', []))}

【场景】{scenario.context}

{scenario.trigger_role}说："{scenario.trigger}"

请以{role_data.get('role_name')}的身份，用符合人格和风格的方式回复："""
        
        if self.llm:
            return self.llm.chat(prompt)
        else:
            return f"[PersonaForge-NoDual] 这是{role_data.get('role_name')}的回复。"


def run_experiment(args):
    """运行实验"""
    print("=" * 70)
    print("PersonaForge ACL Experiment")
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    # 初始化
    runner = ExperimentRunner()
    baseline_gen = BaselineGenerator(llm=None)  # 传入实际 LLM
    persona_gen = PersonaForgeGenerator(llm=None)  # 传入实际 LLM
    
    # 选择角色
    all_characters = runner.list_characters()
    if args.characters == "all":
        selected_characters = all_characters
    else:
        n = int(args.characters)
        selected_characters = random.sample(all_characters, min(n, len(all_characters)))
    
    print(f"\n选择的角色数量: {len(selected_characters)}")
    
    # 选择场景
    if args.scenarios == "all":
        selected_scenarios = runner.scenarios
    else:
        selected_scenarios = [s for s in runner.scenarios if s.scenario_type == args.scenarios]
    
    print(f"选择的场景数量: {len(selected_scenarios)}")
    
    # 存储结果
    results_by_method = {
        "vanilla": [],
        "character_llm": [],
        "ours": [],
        "ours_no_dual": []
    }
    
    # 遍历角色和场景
    total = len(selected_characters) * len(selected_scenarios)
    current = 0
    
    for source, role_code in selected_characters:
        role_data = runner.load_character(source, role_code)
        if not role_data:
            continue
        
        print(f"\n处理角色: {role_data.get('role_name', role_code)}")
        
        for scenario in selected_scenarios:
            current += 1
            print(f"  [{current}/{total}] 场景: {scenario.scenario_id}")
            
            # 方法 1: Vanilla LLM
            if args.method in ["all", "vanilla"]:
                response = baseline_gen.generate_vanilla(role_data, scenario)
                result = runner.run_single_evaluation(
                    role_data, scenario, response, method="vanilla"
                )
                results_by_method["vanilla"].append(result)
            
            # 方法 2: Character-LLM
            if args.method in ["all", "character_llm"]:
                response = baseline_gen.generate_character_llm(role_data, scenario)
                result = runner.run_single_evaluation(
                    role_data, scenario, response, method="character_llm"
                )
                results_by_method["character_llm"].append(result)
            
            # 方法 3: PersonaForge (完整)
            if args.method in ["all", "ours"]:
                response, inner_mono = persona_gen.generate_with_dual_process(role_data, scenario)
                result = runner.run_single_evaluation(
                    role_data, scenario, response, inner_mono, method="ours"
                )
                results_by_method["ours"].append(result)
            
            # 方法 4: PersonaForge (无双重思维链)
            if args.method in ["all", "ours_no_dual"]:
                response = persona_gen.generate_without_dual_process(role_data, scenario)
                result = runner.run_single_evaluation(
                    role_data, scenario, response, method="ours_no_dual"
                )
                results_by_method["ours_no_dual"].append(result)
    
    # 计算聚合分数
    print("\n" + "=" * 70)
    print("实验结果汇总")
    print("=" * 70)
    
    for method, results in results_by_method.items():
        if not results:
            continue
        
        scores = runner.compute_aggregate_scores(results)
        print(f"\n[{method.upper()}] ({len(results)} samples)")
        for metric, score in scores.items():
            print(f"  {metric}: {score:.4f}")
    
    # 保存结果
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    for method, results in results_by_method.items():
        if results:
            runner.save_results(results, f"{method}_{timestamp}.json")
    
    print(f"\n实验完成！结果已保存到 {runner.output_dir}/")


def main():
    parser = argparse.ArgumentParser(description="PersonaForge Experiment Runner")
    parser.add_argument(
        "--method", 
        type=str, 
        default="all",
        choices=["all", "vanilla", "character_llm", "ours", "ours_no_dual"],
        help="要运行的方法"
    )
    parser.add_argument(
        "--characters",
        type=str,
        default="10",
        help="使用的角色数量，或 'all'"
    )
    parser.add_argument(
        "--scenarios",
        type=str,
        default="all",
        help="场景类型: all, emotional, conflict, casual, first_encounter, decision"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./experiment_results",
        help="输出目录"
    )
    
    args = parser.parse_args()
    run_experiment(args)


if __name__ == "__main__":
    main()
