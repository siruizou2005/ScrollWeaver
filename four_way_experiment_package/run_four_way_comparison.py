import argparse
import json
import os
import torch
import sys
import time
import urllib.request
import urllib.error
from typing import List, Dict, Any, Optional
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

# Configuration
BASE_MODEL_NAME = "Qwen/Qwen2.5-7B-Instruct" 
ADAPTER_BASE_DIR = "/home/ubuntu/ScrollWeaver/LLaMA-Factory/saves"

# Characters (Only 2 for this package)
CHARACTER_DATA = {
    "JonSnow": {
        "name": "Jon Snow",
        "adapter_path": f"{ADAPTER_BASE_DIR}/qwen_JonSnow_sft",
        "bio": "You are Jon Snow, the Bastard of Winterfell, Lord Commander of the Night's Watch, and King in the North. Raised by Ned Stark. Joined the Night's Watch. Fought White Walkers. Betrayed by your brothers. Resurrected. Honorable, brooding, introverted, dutiful, humble, melancholy. You struggle with the weight of leadership and your identity.",
        "personality_profile": {
            "core_traits": {
                "big_five": {"openness": 0.6, "conscientiousness": 0.85, "extraversion": 0.4, "agreeableness": 0.7, "neuroticism": 0.5},
                "defense_mechanism": "Altruism"
            },
            "speaking_style": {"sentence_length": "short", "vocabulary_level": "casual", "catchphrases": ["I know nothing", "The North remembers"], "tone_markers": ["aye", "well"]}
        },
        "scenarios": [
            "Your brothers in the Night's Watch have betrayed and stabbed you. What are your last thoughts?",
            "Daenerys demands you bend the knee. How do you refuse respectfully?",
            "Samwell Tarly asks if you are afraid of the Night King.",
            "You are looking at the Wall, thinking about Ygritte. What do you say to yourself?"
        ]
    },
    "LinDaiyu": {
        "name": "Lin Daiyu (林黛玉)",
        "adapter_path": f"{ADAPTER_BASE_DIR}/qwen_LinDaiyu_sft",
        "bio": "你是林黛玉，金陵十二钗之首，贾宝玉的姑表妹。性格：多愁善感，才情高捷，孤标傲世，心思细腻，敏感多疑，却又率真纯情。背景：父母双亡，寄居荣国府。与贾宝玉真心相爱，却受制于封建礼教。当前状态：身体孱弱，寄人篱下，感叹身世凄凉。",
        "personality_profile": {
            "core_traits": {
                "big_five": {"openness": 0.9, "conscientiousness": 0.6, "extraversion": 0.3, "agreeableness": 0.4, "neuroticism": 0.9},
                "defense_mechanism": "Sublimation"
            },
            "speaking_style": {"sentence_length": "long", "vocabulary_level": "academic", "catchphrases": ["也罢", "倒是", "不过"], "tone_markers": ["罢了", "呢", "罢"]}
        },
        "scenarios": [
            "宝玉把通灵宝玉摔在地上，你看着这块玉，心里怎么想，会说什么？",
            "周瑞家的送宫花来，最后才给你。你会怎么讥讽她？",
            "秋雨连绵，你在潇湘馆独自垂泪，紫鹃问你在想什么。",
            "听闻宝玉要娶宝钗的消息（尽管是误传），你会是什么反应？"
        ]
    }
}

def generate_response(model, tokenizer, user_input, system_prompt):
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_input}
    ]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    model_inputs = tokenizer([text], return_tensors="pt").to(model.device)
    with torch.no_grad():
        generated_ids = model.generate(**model_inputs, max_new_tokens=256, temperature=0.7, top_p=0.9)
    generated_ids = [output_ids[len(input_ids):] for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)]
    return tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]

def construct_group_c_prompt(role_key, data):
    """Constructs the structured psychology-based prompt for Group C"""
    profile = data["personality_profile"]
    traits = profile["core_traits"]["big_five"]
    dm = profile["core_traits"]["defense_mechanism"]
    style = profile["speaking_style"]
    
    big_five_str = ", ".join([f"{k.capitalize()}: {v}" for k, v in traits.items()])
    
    prompt = f"""You are {data['name']}.
[Psychological Profile]
Big Five Traits: {big_five_str}
Defense Mechanism: {dm}
Values: Loyalty, Honor, Duty (Inferred)

[Speaking Style]
Sentence Length: {style['sentence_length']}
Vocabulary: {style['vocabulary_level']}
Catchphrases: {', '.join(style['catchphrases'])}
Tone Markers: {', '.join(style['tone_markers'])}

Immerse yourself fully in this persona."""
    return prompt

def save_results(results, output_file):
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

def run_experiment():
    output_file = "four_way_comparison_results.json"
    
    results = {
        "GroupA_ZeroShot": {},
        "GroupB_SimplePrompt": {},
        "GroupC_StructuredPrompt": {},
        "GroupD_SFT": {}
    }

    # --- Phase 1: Base Model (Groups A, B, C) ---
    print("\n[Phase 1] Loading Base Model for Groups A, B, C...")
    try:
        tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_NAME, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(BASE_MODEL_NAME, device_map="auto", torch_dtype=torch.float16, trust_remote_code=True)
    except Exception as e:
        print(f"Error loading base model: {e}")
        return

    for char_key, config in CHARACTER_DATA.items():
        print(f"\nProcessing {char_key} (Base Model Groups)...")
        
        # Group A: Zero-shot
        print("  - Running Group A (Zero-shot)...")
        res_a = []
        prompt_a = f"You are {config['name']}." if "Jon" in char_key else f"你是{config['name']}。"
        for scen in config["scenarios"]:
            resp = generate_response(model, tokenizer, scen, prompt_a)
            res_a.append({"scenario": scen, "response": resp})
        results["GroupA_ZeroShot"][char_key] = res_a

        # Group B: Simple Prompt
        print("  - Running Group B (Simple Prompt)...")
        res_b = []
        prompt_b = config["bio"]
        for scen in config["scenarios"]:
            resp = generate_response(model, tokenizer, scen, prompt_b)
            res_b.append({"scenario": scen, "response": resp})
        results["GroupB_SimplePrompt"][char_key] = res_b

        # Group C: Structured Prompt
        print("  - Running Group C (Structured Prompt)...")
        res_c = []
        prompt_c = construct_group_c_prompt(char_key, config)
        for scen in config["scenarios"]:
            resp = generate_response(model, tokenizer, scen, prompt_c)
            res_c.append({"scenario": scen, "response": resp})
        results["GroupC_StructuredPrompt"][char_key] = res_c
        
        save_results(results, output_file)
    
    del model
    torch.cuda.empty_cache()

    # --- Phase 2: SFT Model (Group D) ---
    print("\n[Phase 2] Loading SFT Models for Group D...")
    
    for char_key, config in CHARACTER_DATA.items():
        adapter_path = config["adapter_path"]
        if not os.path.exists(adapter_path): 
            print(f"  Skipping {char_key} (Group D), adapter not found at {adapter_path}")
            continue
            
        print(f"  Loading Adapter for {char_key}...")
        try:
            model = AutoModelForCausalLM.from_pretrained(BASE_MODEL_NAME, device_map="auto", torch_dtype=torch.float16, trust_remote_code=True)
            model = PeftModel.from_pretrained(model, adapter_path)
            
            print(f"  - Running Group D (SFT)...")
            res_d = []
            prompt_d = f"You are {config['name']}." if "Jon" in char_key else f"你是{config['name']}。"
            for scen in config["scenarios"]:
                resp = generate_response(model, tokenizer, scen, prompt_d)
                res_d.append({"scenario": scen, "response": resp})
            results["GroupD_SFT"][char_key] = res_d
            
            del model
            torch.cuda.empty_cache()
            save_results(results, output_file)
        except Exception as e:
            print(f"Error loading adapter for {char_key}: {e}")

    print(f"\nExperiment Complete! Results saved to {output_file}")

if __name__ == "__main__":
    run_experiment()
