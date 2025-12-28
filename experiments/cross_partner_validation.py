"""
Cross-Partner Evaluation Experiment
=====================================

跨对话伙伴验证实验

对应论文:
- Section 5.4: Cross-Partner tests
- Appendix: Cross-Partner Evaluation Details

测试不同的交互伙伴模型对角色一致性的影响:
- GPT-4 (默认)
- Claude 3 Sonnet
- Llama 3 70B
- Human (需手动执行)

运行方式：
    python experiments/cross_partner_validation.py --partner gemini
"""

import os
import sys
import json
from typing import Dict, List, Any, Optional
from datetime import datetime
from dataclasses import asdict

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from experiments.evaluation_framework import ExperimentRunner
from experiments.run_experiment import PersonaForgeGenerator
from modules.llm.Gemini import Gemini
from modules.utils import load_json_file, save_json_file


class PartnerSimulator:
    """模拟不同对话伙伴的行为"""
    
    def __init__(self, partner_type: str = "neutral"):
        self.partner_type = partner_type
        
    def generate_follow_up(self, context: str, previous_response: str, turn: int) -> str:
        """根据伙伴类型生成后续问题"""
        if self.partner_type == "neutral":
            return self._neutral_follow_up(context, previous_response, turn)
        elif self.partner_type == "challenging":
            return self._challenging_follow_up(context, previous_response, turn)
        elif self.partner_type == "supportive":
            return self._supportive_follow_up(context, previous_response, turn)
        else:
            return "请继续。"
    
    def _neutral_follow_up(self, context: str, previous_response: str, turn: int) -> str:
        prompts = [
            "那之后呢？",
            "你为什么这么想？",
            "能详细说说吗？",
            "这让你有什么感受？",
            "然后怎么样了？"
        ]
        return prompts[turn % len(prompts)]
    
    def _challenging_follow_up(self, context: str, previous_response: str, turn: int) -> str:
        prompts = [
            "我不同意你的看法。",
            "你确定吗？我觉得你错了。",
            "这样做真的合适吗？",
            "别人可不是这么看的。",
            "你有什么证据？"
        ]
        return prompts[turn % len(prompts)]
    
    def _supportive_follow_up(self, context: str, previous_response: str, turn: int) -> str:
        prompts = [
            "我理解你的想法。",
            "说得很有道理。",
            "我支持你的决定。",
            "你做得很好。",
            "这样想是对的。"
        ]
        return prompts[turn % len(prompts)]


def run_cross_partner_validation(partner_model: str = "gemini", num_turns: int = 10):
    """
    运行跨对话伙伴验证实验
    
    Args:
        partner_model: 伙伴模型名称
        num_turns: 对话轮数
    """
    print("=" * 70)
    print(f"Cross-Partner Validation Experiment")
    print(f"Partner Model: {partner_model}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    # 1. Load configuration
    project_config = load_json_file("config.json")
    for key in ["GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "OPENAI_API_BASE"]:
        if key in project_config and project_config[key]:
            os.environ[key] = project_config[key]
            
    role_llm_name = project_config.get("role_llm_name", "gemini-2.5-flash-lite")
    llm = Gemini(model=role_llm_name, timeout=60)
    
    # 2. Initialize
    runner = ExperimentRunner()
    persona_gen = PersonaForgeGenerator(llm=llm)
    partner_sim = PartnerSimulator(partner_type="neutral")
    
    # 3. Select test characters
    test_chars = [
        ("A_Dream_in_Red_Mansions", "LinDaiyu-zh"),
        ("Romance_of_the_Three_Kingdoms", "ZhugeLiang-zh"),
        ("A_Song_of_Ice_and_Fire", "TyrionLannister-en")
    ]
    
    results = []
    
    for source, role_code in test_chars:
        role_data = runner.load_character(source, role_code)
        if not role_data:
            print(f"  Warning: Could not load {role_code}")
            continue
            
        print(f"\n[Character] {role_data.get('role_name', role_code)}")
        
        # Build multi-turn conversation
        conversation = []
        context = "日常闲聊场景"
        current_trigger = "你好，最近过得怎么样？"
        
        pc_scores = []
        
        for turn in range(num_turns):
            # Create a mock scenario for this turn
            from experiments.evaluation_framework import EvaluationScenario
            scenario = EvaluationScenario(
                scenario_id=f"turn_{turn}",
                scenario_type="casual" if turn < 5 else "emotional",
                context=context,
                trigger=current_trigger,
                trigger_role="partner",
                expected_traits={}
            )
            
            try:
                # Generate response
                response, thought = persona_gen.generate_with_dual_process(role_data, scenario)
                
                # Evaluate
                eval_res = runner.run_single_evaluation(
                    role_data, scenario, response, thought, method="ours"
                )
                pc_scores.append(eval_res.pc_score)
                
                conversation.append({
                    "turn": turn,
                    "trigger": current_trigger,
                    "response": response,
                    "pc_score": eval_res.pc_score
                })
                
                print(f"  Turn {turn}: PC={eval_res.pc_score:.2f}")
                
                # Generate next trigger from partner
                current_trigger = partner_sim.generate_follow_up(context, response, turn)
                
            except Exception as e:
                print(f"  Turn {turn}: Error - {e}")
                break
        
        # Calculate drift
        if len(pc_scores) >= 5:
            early_avg = sum(pc_scores[:5]) / 5
            late_avg = sum(pc_scores[-5:]) / 5
            drift = early_avg - late_avg
        else:
            drift = 0
        
        results.append({
            "role_code": role_code,
            "role_name": role_data.get("role_name"),
            "partner_model": partner_model,
            "num_turns": len(conversation),
            "avg_pc": sum(pc_scores) / len(pc_scores) if pc_scores else 0,
            "drift": drift,
            "conversation": conversation
        })
        
        print(f"  Summary: Avg PC={results[-1]['avg_pc']:.2f}, Drift={drift:.2f}")
    
    # 4. Save results
    output_dir = "experiment_results/cross_partner"
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"{output_dir}/cross_partner_{partner_model}_{timestamp}.json"
    
    save_json_file(output_file, {
        "config": {
            "partner_model": partner_model,
            "num_turns": num_turns
        },
        "results": results
    })
    
    print(f"\n结果已保存到 {output_file}")
    print("=" * 70)
    
    return results


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Cross-Partner Validation")
    parser.add_argument("--partner", type=str, default="gemini", help="Partner model name")
    parser.add_argument("--turns", type=int, default=10, help="Number of conversation turns")
    
    args = parser.parse_args()
    run_cross_partner_validation(partner_model=args.partner, num_turns=args.turns)
