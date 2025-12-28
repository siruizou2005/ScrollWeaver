import os
import sys
import json
import argparse
from datetime import datetime
from typing import Dict, List, Any

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from experiments.evaluation_framework import ExperimentRunner
from experiments.run_experiment import PersonaForgeGenerator
from modules.utils import load_json_file, save_json_file

def run_opensource_validation(model_name: str):
    print("=" * 70)
    print(f"Open-Source Pipeline Validation: {model_name}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    # 1. Load API keys for open source models
    project_config = load_json_file("config.json")
    for key in ["DASHSCOPE_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_BASE", "OPENAI_API_KEY"]:
        if key in project_config and project_config[key]:
            os.environ[key] = project_config[key]
    
    # 2. Get LLM Instance
    from modules.utils.model_utils import get_models
    try:
        llm = get_models(model_name)
        print(f"✓ {model_name} initialized via model_utils")
    except Exception as e:
        print(f"✗ Failed to initialize {model_name}: {e}")
        return

    # 3. Setup Experiment
    runner = ExperimentRunner()
    persona_gen = PersonaForgeGenerator(llm=llm)
    
    # Select a representative character (Lin Daiyu)
    source, role_code = "A_Dream_in_Red_Mansions", "LinDaiyu-zh"
    role_data = runner.load_character(source, role_code)
    
    if not role_data:
        print(f"Character {role_code} not found.")
        return
        
    print(f"\n[OpenSource] Validating pipeline for: {role_data.get('role_name')}")
    
    # Run 2 scenarios (Conflict and Emotional)
    val_scenarios = [s for s in runner.scenarios if s.scenario_type in ["conflict", "emotional"]][:2]
    
    validation_results = []
    
    for scenario in val_scenarios:
        print(f"  Testing Scenario: {scenario.scenario_id}")
        
        try:
            # Full Dual-Process Cycle
            resp, thought = persona_gen.generate_with_dual_process(role_data, scenario)
            
            # Evaluate using standard framework (using Gemini as Judge if available, or static evaluator)
            eval_res = runner.run_single_evaluation(
                role_data, scenario, resp, thought, method=f"personaforge_{model_name}"
            )
            validation_results.append(eval_res)
            print(f"    Response Length: {len(resp)} characters")
            print(f"    Inner Monologue generated: {bool(thought)}")
            print(f"    Metrics -> PC: {eval_res.pc_score:.2f} | SA: {eval_res.sa_score:.2f}")
        except Exception as e:
            print(f"    Error during generation: {e}")
            
    # 4. Save results
    output_dir = "experiment_results/opensource"
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"{output_dir}/validation_{model_name}_{timestamp}.json"
    
    save_json_file(output_file, [vars(r) for r in validation_results])
    
    print("\n" + "="*50)
    print(f"Open-source validation for {model_name} completed.")
    print(f"Results saved to: {output_file}")
    print("="*50)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, default="qwen-turbo", help="Model name (e.g. qwen-plus, deepseek-v3)")
    args = parser.parse_args()
    run_opensource_validation(args.model)
