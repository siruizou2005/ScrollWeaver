import os
import sys
import json
from datetime import datetime
from typing import Dict, List, Any

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from experiments.evaluation_framework import ExperimentRunner
from experiments.run_experiment import PersonaForgeGenerator
from modules.llm.Gemini import Gemini
from modules.utils import load_json_file, save_json_file

def run_rolebench_expansion():
    print("=" * 70)
    print("RoleBench Expansion Experiment")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    # Initialize
    project_config = load_json_file("config.json")
    for key in ["GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "OPENAI_API_BASE"]:
        if key in project_config and project_config[key]:
            os.environ[key] = project_config[key]
            
    role_llm_name = project_config.get("role_llm_name", "gemini-2.5-flash-lite")
    llm = Gemini(model=role_llm_name, timeout=60)
    
    runner = ExperimentRunner()
    persona_gen = PersonaForgeGenerator(llm=llm)
    
    # Expand to more characters across domains
    target_characters = [
        ("A_Dream_in_Red_Mansions", "LinDaiyu-zh"),
        ("A_Dream_in_Red_Mansions", "JiaBaoyu-zh"),
        ("A_Song_of_Ice_and_Fire", "TyrionLannister-en"),
        ("A_Song_of_Ice_and_Fire", "DaenerysTargaryen-en"),
        ("Romance_of_the_Three_Kingdoms", "ZhugeLiang-zh"),
        ("Romance_of_the_Three_Kingdoms", "CaoCao-zh"),
        ("Alice_s_Adventures_in_Wonderland-Through_the_Looking-Glass", "Alice-en")
    ]
    
    expanded_results = []
    
    for source, role_code in target_characters:
        role_data = runner.load_character(source, role_code)
        if not role_data:
            print(f"Warning: Character {role_code} not found in {source}")
            continue
            
        print(f"\n[Expansion] Evaluating: {role_data.get('role_name', role_code)} ({source})")
        
        # Test 3 scenarios per character for breadth
        for scenario in runner.scenarios[:3]:
            print(f"  Running Scenario: {scenario.scenario_id}")
            
            try:
                # PersonaForge Method
                resp, thought = persona_gen.generate_with_dual_process(role_data, scenario)
                
                # Single evaluation for metrics
                eval_res = runner.run_single_evaluation(
                    role_data, scenario, resp, thought, method="personaforge"
                )
                expanded_results.append(eval_res)
                print(f"    PC: {eval_res.pc_score:.2f} | SA: {eval_res.sa_score:.2f}")
            except Exception as e:
                print(f"    Error: {e}")
                
    # Save Results
    output_dir = "experiment_results/expansion"
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"{output_dir}/rolebench_expansion_{timestamp}.json"
    
    save_json_file(output_file, [vars(r) for r in expanded_results])
    
    # Compute Final Statistics
    if expanded_results:
        avg_scores = runner.compute_aggregate_scores(expanded_results)
        print("\n" + "="*50)
        print("RoleBench Expansion Summary Metrics:")
        for metric, score in avg_scores.items():
            print(f"  {metric.upper()}: {score:.4f}")
        print(f"Results saved to: {output_file}")
        print("="*50)

if __name__ == "__main__":
    run_rolebench_expansion()
