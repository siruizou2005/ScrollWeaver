import os
import sys
import json
import time
from typing import Dict, List, Any, Optional, Literal
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.core.server import Server
from modules.utils import load_json_file, save_json_file

def run_long_dialogue_benchmark():
    # 1. Setup Configuration
    config = {
        "performer_codes": ["LinDaiyu-zh", "JiaBaoyu-zh"],
        "world_file_path": "data/worlds/A_Dream_in_Red_Mansions/world_info.json",
        "role_file_dir": "data/roles/",
        "loc_file_path": "data/locations/A_Dream_in_Red_Mansions.json",
        "language": "zh",
        "source": "A_Dream_in_Red_Mansions",
        "experiment_subname": "authentic_long_dialogue"
    }
    
    config_path = "experiments/configs/long_dialogue_lin.json"
    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    save_json_file(config_path, config)
    
    # 2. Initialize Server
    print("Loading project LLM configuration...")
    try:
        project_config = load_json_file("config.json")
        role_llm = project_config.get("role_llm_name", "gemini-2.5-flash-lite")
        world_llm = project_config.get("world_llm_name", "gemini-2.5-flash-lite")
        
        # Ensure API keys are in environment variables
        for key in ["GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "OPENAI_API_BASE"]:
            if key in project_config and project_config[key]:
                os.environ[key] = project_config[key]
    except Exception as e:
        print(f"Warning: Could not load config.json ({e}), using defaults.")
        role_llm = "gemini-2.5-flash-lite"
        world_llm = "gemini-2.5-flash-lite"

    print(f"Initializing Sandbox with Role LLM: {role_llm}, World LLM: {world_llm}...")
    server = Server(
        preset_path=config_path,
        world_llm_name=world_llm,
        role_llm_name=role_llm,
        timeout=60 # Increase timeout to 60s
    )
    
    # Initialize locations
    # We want to force them to Xiaoxiang Pavilion
    pavilion_code = "XiaoxiangPavilion" 
    pav_name = server.orchestrator.find_location_name(pavilion_code)
    
    for role_code in server.role_codes:
        server.performers[role_code].set_location(pavilion_code, pav_name)

    print(f"Simulation environment established at {pav_name}")
    print("-" * 50)
    
    # 3. Instrument the DualProcessAgent to track triggering
    target_agent = server.performers["LinDaiyu-zh"].dual_process_agent
    original_is_critical = target_agent.is_critical_interaction
    
    trigger_record = []
    
    def tracked_is_critical(*args, **kwargs):
        result = original_is_critical(*args, **kwargs)
        trigger_record.append(result)
        return result
        
    target_agent.is_critical_interaction = tracked_is_critical
    
    # 4. Run Simulation Loop
    total_rounds = 50
    perturbations = {
        15: "突然间，王夫人派人来传话，说要查抄大观园，气氛变得极其紧张。黛玉感到一阵莫名的心悸。",
        30: "夜深了，黛玉旧病复发，咳出了点点鲜血在帕子上。宝玉在一旁手足无措，满眼忧心。",
        45: "传来小道消息，说宝玉与宝钗的婚事已定。黛玉听闻，惊魂失魄，不觉泪下。"
    }
    
    full_log = []
    
    # meta_info to tell simulator that locations are already set
    meta_info = {
        "location_setted": True,
        "goal_setted": False,
        "round": 0,
        "sub_round": 0,
    }
    
    sim_gen = server.simulate_generator(rounds=total_rounds, mode="free", meta_info=meta_info)
    
    print(f"Running {total_rounds} turns benchmark...")
    
    count = 0
    try:
        while count < total_rounds:
            # Check for stressors
            if count in perturbations:
                stressor = perturbations[count]
                print(f"\n>>> [PERTURBATION] Turn {count}: {stressor}")
                server.event_manager.set_intervention(stressor)
            
            # Step the simulation
            try:
                output = next(sim_gen)
                msg_type, role_id, content, record_id = output
                
                # Capture only role actions for the log
                if msg_type == "role":
                    print(f"[{count}] {role_id}: {content[:60]}...")
                    
                    # Capture state for evaluation
                    performer = server.performers.get("LinDaiyu-zh")
                    entry = {
                        "turn": count,
                        "speaker": role_id,
                        "content": content,
                        "lin_mood": performer.personality_profile.dynamic_state.current_mood,
                        "lin_energy": performer.personality_profile.dynamic_state.energy_level,
                        "triggered": trigger_record[-1] if trigger_record else False
                    }
                    full_log.append(entry)
                    count += 1
                elif msg_type == "system":
                    print(f"[System] {content}")
                elif msg_type == "world":
                    print(f"[World] {content}")
                    
            except StopIteration:
                print("Simulation finished prematurely.")
                break
                
    except KeyboardInterrupt:
        print("Simulation stopped by user.")
    except Exception as e:
        print(f"Error during simulation: {e}")
        import traceback
        traceback.print_exc()

    # 5. Save Results
    output_dir = "experiment_results/long_dialogue"
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"{output_dir}/authentic_long_dialogue_lin_{timestamp}.json"
    
    save_json_file(output_file, {
        "metadata": config,
        "metrics": {
            "total_turns": count,
            "trigger_count": sum(1 for t in trigger_record if t),
            "perturbation_count": len(perturbations)
        },
        "history": full_log
    })
    
    print("\n" + "="*50)
    print(f"Experiment completed successfully!")
    print(f"Total turns: {count}")
    print(f"Critical trigger count: {sum(1 for t in trigger_record if t)}")
    print(f"Results saved to: {output_file}")
    print("="*50)

if __name__ == "__main__":
    run_long_dialogue_benchmark()
