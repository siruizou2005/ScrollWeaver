# Four-Way Experiment Package

This package contains all necessary files to reproduce the 4-way comparison experiment (SFT vs. Prompt Engineering) for the ScrollWeaver project.

## Structure

*   `run_four_way_comparison.py`: Runs the short-context comparison (4 scenarios per character) for all 4 groups.
*   `four_way_evaluate.py`: Evaluates the generated responses using Gemini-2.5-flash-lite.
*   `long_dialogue_runs/run_long_dialogue_4way.py`: Runs a 50-turn long dialogue stress test for a specific group and character.
*   `config.json`: Configuration file containing API keys.

## 1. Short Context Comparison (Four-Way)

To run the standard benchmark (4 scenarios):

```bash
# 1. Generate Responses (Requires GPU)
python3 run_four_way_comparison.py

# 2. Score Responses (Requires API Key)
python3 four_way_evaluate.py
```

Results will be saved in `four_way_comparison_scored.json`.

## 2. Long Dialogue Stress Test (50 Turns)

To run the long-term stability test (Drift Rate & Recovery):

```bash
cd long_dialogue_runs

# Syntax: --group [A|B|C|D] --character [JonSnow|LinDaiyu]
# Groups: A=ZeroShot, B=Simple, C=Structured, D=SFT

# Example: Test LinDaiyu with SFT (Group D)
python3 run_long_dialogue_4way.py --group D --character LinDaiyu

# Example: Test JonSnow with Structured Prompt (Group C)
python3 run_long_dialogue_4way.py --group C --character JonSnow
```

Results will be saved in `long_dialogue_runs/results/`.
