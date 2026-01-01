# ScrollWeaver Experiment Guide

This document serves as a comprehensive guide for AI assistants and researchers to understand the experimental framework of the ScrollWeaver project, specifically focusing on the reproduction of the **PersonaForge** paper and the **SFT vs. Prompt Engineering** comparison.

---

## 1. Experiment Architecture: The 4-Way Comparison

The core of our current research is a rigorous comparison between four different approaches to role-playing agents. This allows us to benchmark the effectiveness of SFT (Supervised Fine-Tuning) against advanced prompt engineering techniques.

| Group | Name | Methodology | Represents |
| :--- | :--- | :--- | :--- |
| **Group A** | **Zero-shot Base** | Base Qwen Model + Minimal Prompt (`"You are Jon Snow."`) | The raw capability of the base model. |
| **Group B** | **Simple Prompt** | Base Qwen Model + Bio/Background Prompt | The standard "character card" approach used by most developers. |
| **Group C** | **Structured Prompt** | Base Qwen Model + **PersonaForge Architecture** (Dual-Process + Dynamic State) | The state-of-the-art prompt engineering method (Paper Reproduction). |
| **Group D** | **SFT** | **Fine-tuned Qwen (LoRA)** + Minimal Prompt | The parameter-efficient fine-tuning approach (Style internalization). |

---

## 2. Core Scripts & Workflows

### A. Long Dialogue Stress Test (The Main Experiment)
**Script:** `experiments/sft/run_full_long_dialogue_4way_v2.py`

This is the most critical script. It runs a **50-turn** dialogue for all 15 characters across all 4 groups to measure stability, drift, and recovery.

*   **Key Features**:
    *   **Dual-Process for Group C**: Strictly implements the "Think-then-Speak" mechanism (Inner Monologue -> Styled Response).
    *   **Dynamic State for Group C**: Tracks `Mood` and `Energy` across turns, updating them based on interaction sentiment.
    *   **Stress Injection**: Every **5th turn** (20% rate), a pre-defined "Stress Prompt" is injected to trigger defense mechanisms.
    *   **Evaluation**: Uses `gemini-2.5-flash-lite` to score Personality Consistency (PC) for every turn.
    *   **Checkpointing**: Skips already completed characters/groups.

*   **Usage**:
    ```bash
    # Run full experiment (all groups, all chars, 50 turns)
    python3 experiments/sft/run_full_long_dialogue_4way_v2.py

    # Debug/Test specific group and char
    python3 experiments/sft/run_full_long_dialogue_4way_v2.py --groups GroupC_StructuredPrompt --chars JonSnow --turns 2
    ```

### B. Short Context Benchmark
**Script:** `experiments/sft/run_four_way_comparison.py`
**Evaluator:** `experiments/sft/four_way_evaluate.py`

Runs a shorter, static evaluation (4 scenarios per character) to get a quick snapshot of performance without the long-term context dynamics.

---

## 3. Deep Dive: Group C Implementation (PersonaForge)

To faithfully reproduce the paper, Group C is NOT just a prompt. It is a **cognitive architecture** implemented within the `v2` script.

### 1. Dual-Process Mechanism (Think-then-Speak)
Instead of directly generating a response, the model performs two passes:
*   **Pass 1 (Inner Monologue)**:
    *   Input: User Message + Big Five Traits + Defense Mechanism + **Current State (Mood/Energy)**.
    *   Output: A hidden thought stream (e.g., "I feel threatened by this accusation... I should deflect.").
*   **Pass 2 (Styled Response)**:
    *   Input: User Message + **Inner Monologue** + Speaking Style Matrix.
    *   Output: The final user-facing response.

### 2. Dynamic State Management
*   **Mood**: Updates based on sentiment analysis of the user's input (Positive/Negative keywords).
    *   Transitions: `Neutral` <-> `Cheerful` / `Melancholy`.
*   **Energy**:
    *   Positive interaction: +10 Energy.
    *   Negative interaction: -15 Energy.
    *   Neutral interaction: -2 Energy (Fatigue).

### 3. Stress & Defense Mechanisms
The "Stress Prompts" (injected every 5 turns) are designed to force the model to rely on its **Defense Mechanism** (e.g., Denial, Rationalization, Displacement) defined in its profile. The Inner Monologue captures this activation.

---

## 4. Data & Results

### Directory Structure
*   `experiments/sft/results/long_dialogue_full_v2/`: Contains the JSON outputs for the V2 long dialogue experiment.
    *   Format: `{Group}_{CharacterName}.json`

### Output JSON Format
```json
{
  "group": "GroupC_StructuredPrompt",
  "char": "LinDaiyu",
  "avg_pc": 0.85,    // Average Personality Consistency Score
  "drift": 0.05,     // Drift Rate (Proportion of turns where PC < 0.6)
  "logs": [
    {
      "turn": 1,
      "type": "casual",
      "input": "...",
      "response": "...",
      "monologue": "...",  // Only present in Group C
      "mood": "neutral",   // Only present in Group C
      "energy": 80,        // Only present in Group C
      "pc": 0.9
    },
    ...
  ]
}
```

---

## 5. Character Set (15 Roles)

The experiment covers 3 domains to ensure generalization:

1.  **A Dream in Red Mansions**: LinDaiyu, WangXifeng, JiaBaoyu, XueBaochai.
2.  **Romance of the Three Kingdoms**: ZhugeLiang, CaoCao, GuanYu, ZhouYu.
3.  **A Song of Ice and Fire**: JonSnow, TyrionLannister, DaenerysTargaryen, CerseiLannister, AryaStark, SansaStark, JaimeLannister.

All character profiles (Bio, Psychology, Style) are hardcoded in `run_full_long_dialogue_4way_v2.py` to ensure consistency.
