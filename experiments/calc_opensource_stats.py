import json
import numpy as np

file_path = '/root/ScrollWeaver/experiments/experiment_results/extended_opensource/extended_opensource_results_20251229_194723.json'

with open(file_path, 'r') as f:
    data = json.load(f)

models = ["Qwen-Plus", "Kimi", "DeepSeek"]
methods = ["personaforge", "structured_cot"]

print("--- Cross-Generator Validation ---")
for model in models:
    for method in methods:
        key = method
        if key not in data['results'][model]:
            continue
        
        scores = [item['pc'] for item in data['results'][model][key]]
        avg_pc = np.mean(scores)
        print(f"Model: {model}, Method: {method}, Avg PC: {avg_pc:.4f}")

