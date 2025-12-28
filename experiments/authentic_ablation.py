import os
import sys
import json
import random
from typing import Dict, List, Any, Optional
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from experiments.evaluation_framework import ExperimentRunner, EvaluationScenario
from experiments.run_experiment import PersonaForgeGenerator
from experiments.ablation_psychology import GenericStructuredGenerator
from experiments.pairwise_judge import PairwiseJudge
from modules.utils import load_json_file, save_json_file

def run_authentic_ablation():
    print("=" * 70)
    print("Authentic Psychology Grounding Ablation Study")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    # Initialize
    runner = ExperimentRunner()
    judge = PairwiseJudge()
    
    # Load project config for LLM
    project_config = load_json_file("config.json")
    for key in ["GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "OPENAI_API_BASE"]:
        if key in project_config and project_config[key]:
            os.environ[key] = project_config[key]
            
    # Generators
    # Note: run_experiment.py's PersonaForgeGenerator expects an LLM instance or name
    role_llm_name = project_config.get("role_llm_name", "gemini-2.5-flash-lite")
    # We'll use the Gemini class directly for generators to match project logic
    from modules.llm.Gemini import Gemini
    llm_instance = Gemini(model=role_llm_name, timeout=60)
    
    ours_gen = PersonaForgeGenerator(llm=llm_instance)
    generic_gen = GenericStructuredGenerator(llm=llm_instance)
    
    judge = PairwiseJudge(model_name=role_llm_name) # PairwiseJudge should also use the timeout
    
    selected_roles = [
        ("A_Dream_in_Red_Mansions", "LinDaiyu-zh"),
        ("A_Song_of_Ice_and_Fire", "TyrionLannister-en")
    ]
    
    # Filter scenarios for high impact (Conflict & Emotional)
    test_scenarios = [s for s in runner.scenarios if s.scenario_type in ["conflict", "emotional"]][:4]
    
    ablation_results = []
    
    for source, role_code in selected_roles:
        role_data = runner.load_character(source, role_code)
        if not role_data:
            print(f"Role {role_code} not found.")
            continue
            
        print(f"\n[Ablation] Evaluating Character: {role_data.get('role_name')} ({role_code})")
        
        for scenario in test_scenarios:
            print(f"  Scenario: {scenario.scenario_id} ({scenario.scenario_type})")
            
            # 1. Generate with PersonaForge (Full)
            # generate_with_dual_process returns (response, inner_monologue)
            resp_ours, thought_ours = ours_gen.generate_with_dual_process(role_data, scenario)
            
            # 2. Generate with Generic-3Layer
            resp_gen, thought_gen = generic_gen.generate_generic_3layer(role_data, scenario)
            
            # 3. Judge evaluation
            print("  Running Pairwise Judge...")
            comparison = judge.compare(
                role_info=role_data,
                context=scenario.context,
                trigger=scenario.trigger,
                response_a=resp_ours,
                response_b=resp_gen
            )
            
            if comparison:
                res = {
                    "role_code": role_code,
                    "scenario_id": scenario.scenario_id,
                    "scenario_type": scenario.scenario_type,
                    "responses": {
                        "ours": resp_ours,
                        "generic": resp_gen
                    },
                    "thoughts": {
                        "ours": thought_ours,
                        "generic": thought_gen
                    },
                    "judgment": comparison
                }
                ablation_results.append(res)
                print(f"  Winner: {comparison.get('winner')} | reasoning: {comparison.get('reasoning')[:100]}...")
            
    # 4. Save results
    output_dir = "experiment_results/ablation"
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"{output_dir}/authentic_ablation_{timestamp}.json"
    
    save_json_file(output_file, ablation_results)
    
    # 5. Summary Statistics
    win_counts = {"ours": 0, "generic": 0, "tie": 0}
    for r in ablation_results:
        winner = r["judgment"]["winner"].lower()
        if winner == "a": win_counts["ours"] += 1 # judge.compare returns winner "A" for first arg
        elif winner == "b": win_counts["generic"] += 1
        else: win_counts["tie"] += 1
        
    print("\n" + "="*50)
    print("Ablation Study Summary:")
    print(f"Total scenarios: {len(ablation_results)}")
    print(f"PersonaForge Wins: {win_counts['ours']}")
    print(f"Generic-3Layer Wins: {win_counts['generic']}")
    print(f"Ties: {win_counts['tie']}")
    print(f"Results saved to: {output_file}")
    print("="*50)

if __name__ == "__main__":
    run_authentic_ablation()
