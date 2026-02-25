# ScrollWeaver

<div align="center">

**From Text to a Living World — A Multi-Agent Interactive Story System**

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-latest-green.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | [中文](README_zh.md)

**Demo:** [https://scrollweaver.harrycn.com](https://scrollweaver.harrycn.com)

</div>

---

## What is ScrollWeaver?

**ScrollWeaver** (织梦绘卷) is a multi-agent social simulation engine that breathes life into static text — novels, worldbuilding documents, lore collections — turning them into interactive, co-creatable, exportable **living worlds**.

The system simulates a complete social environment built around two core agent types:

- **Orchestrator** — The world director. Understands the world's lore, locations, and rules. Schedules scenes and cues characters to act.
- **Performer** — The character agent. Has its own personality, memory, and goals. Autonomously acts, speaks, and evolves within the scenes the Orchestrator sets.

---

## Core Experiences

### 1. AI Director Mode (Watch the Story Unfold)
The default state — fully automated narrative:
1. Select or upload a world (e.g. *Dream of the Red Chamber*, *A Song of Ice and Fire*)
2. The Orchestrator begins scheduling scenes based on the world's lore
3. Characters autonomously dialogue, act, and build relationships
4. Watch an ever-evolving story you never need to write yourself

### 2. Human Intervention Mode (Play a Character)
Step in and steer the story at any time:
1. Select a character to play
2. The system pauses via WebSocket when it's your character's turn to act
3. Type your action or dialogue
4. All other AI characters respond in real time based on your input — true human–AI co-creation

### 3. Co-Creation Mode (Generate & Export)
Designed for writers and content creators:
1. Load or build your world and character cards
2. Play key plot points yourself to anchor the story's direction
3. Hand off to AI to run forward at high speed — N more rounds or N days
4. Download the complete co-authored script (`.txt` / `.md`) ready for novels, screenplays, or video creation

---

## Architecture

### Orchestrator–Performer (O-P) Model

| Component | File | Role |
|-----------|------|------|
| Orchestrator | `modules/orchestrator.py` | World director: loads lore, builds RAG fact base, schedules scenes |
| Performer | `modules/main_performer.py` | Character actor: loads profile, maintains memory, generates actions |
| ScrollWeaver Engine | `ScrollWeaver.py` | Main simulation loop and state coordination |
| FastAPI Server | `server.py` | REST API + WebSocket real-time streaming |
| Database | `database.py` | SQLite persistence for scrolls and sessions |

### Supported Interaction Modes

| Mode | Name | Use Case |
|------|------|---------|
| **P Mode** | Private Chat | 1-on-1 roleplay, character chat |
| **O-P Mode** | Story Saga | Multi-character story simulation (default) |
| **A-O-P Mode** | Arena Games | Rule-bound games: Werewolf, Who is Human |

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + WebSocket |
| Simulation Engine | ScrollWeaver (custom) |
| LLM Support | OpenAI, Gemini, DeepSeek, Claude, Qwen, Doubao, Kimi, OpenRouter, Ollama, VLLM |
| Vector DB | ChromaDB (RAG for world lore & long-term memory) |
| Embedding | BGE-Small (bilingual CN/EN) |
| Frontend | Static HTML/CSS/JS |
| Database | SQLite (`database.py`) |

---

## Quick Start

### Prerequisites

- Python 3.8+
- At least one LLM API key (Gemini / OpenAI / DeepSeek / etc.)

### 1. Clone the Repository

```bash
git clone https://github.com/siruizou2005/ScrollWeaver.git
cd ScrollWeaver
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt

# If using a SOCKS proxy, also install:
pip install 'httpx[socks]'
```

### 3. Configure

Edit `config.json` with your API keys:

```json
{
    "role_llm_name": "gemini-2.5-flash-lite",
    "world_llm_name": "gemini-2.5-flash-lite",
    "embedding_model_name": "bge-small",
    "preset_path": "./experiment_presets/experiment_three_kindoms.json",
    "GEMINI_API_KEY": "your-gemini-api-key",
    "OPENAI_API_KEY": "your-openai-api-key",
    "DEEPSEEK_API_KEY": "your-deepseek-api-key"
}
```

Supported providers: OpenAI (GPT-3.5/4/4o), Google Gemini, Anthropic Claude, Qwen, DeepSeek, Doubao, Kimi, OpenRouter, Ollama/VLLM (local).

### 4. Start the Server

```bash
python server.py
```

Server runs at `http://localhost:8000`.

**With proxy (optional):**
```bash
export https_proxy=http://127.0.0.1:7890
python server.py
```

### 5. Open the App

Visit `http://localhost:8000` in your browser. Register/login, select a scroll (world), and start your experience.

---

## Project Structure

```
ScrollWeaver/
├── ScrollWeaver.py              # Core simulation engine
├── server.py                    # FastAPI server entry point
├── sw_utils.py                  # Shared utility functions
├── database.py                  # SQLite database operations
├── config.json                  # Configuration (models, API keys)
├── requirements.txt             # Python dependencies
├── Dockerfile                   # Docker deployment
├── index.html                   # Frontend entry point
├── frontend/                    # Static HTML/CSS/JS frontend
│   ├── pages/                   # HTML pages
│   ├── js/                      # JavaScript modules
│   └── css/                     # Stylesheets
├── modules/
│   ├── core/                    # Core server, sessions, socket.io
│   ├── orchestrator.py          # World Orchestrator agent
│   ├── main_performer.py        # Character Performer agent
│   ├── dual_process_agent.py    # Dual-process cognitive architecture
│   ├── personality_model.py     # Three-layer personality model
│   ├── dynamic_state_manager.py # Dynamic relationship/mood tracking
│   ├── memory.py                # Short/long-term memory
│   ├── history_manager.py       # Interaction history
│   ├── embedding.py             # Embedding model wrapper
│   ├── style_vector_db.py       # Style vector database
│   ├── llm/                     # LLM adapters (OpenAI, Gemini, etc.)
│   ├── db/                      # Database adapters (ChromaDB)
│   ├── prompt/                  # Prompt templates (EN/ZH)
│   ├── simulation/              # Simulation sub-systems
│   │   ├── simulator.py         # Main simulation loop
│   │   ├── scene_manager.py     # Scene scheduling
│   │   ├── event_manager.py     # Event generation
│   │   ├── movement_manager.py  # Character movement
│   │   └── state_manager.py     # World state management
│   ├── chat/                    # Chat mode performer
│   ├── werewolf/                # Werewolf game module
│   ├── gathering/               # Gathering game module
│   ├── business/                # Business game module
│   ├── utils/                   # Utility helpers
│   ├── models/                  # Response data models
│   └── routes/                  # API route handlers
├── data/
│   ├── worlds/                  # World lore configurations
│   ├── roles/                   # Character profiles (gitignored)
│   ├── locations/               # Location data
│   ├── maps/                    # Map data and images
│   └── werewolf/                # Werewolf game presets
├── experiment_presets/          # Simulation presets (world launch configs)
├── extract_data/                # Tools to extract world/role data from text
└── map-pic/                     # Map background images
```

---

## Preset Worlds

ScrollWeaver ships with four pre-built literary worlds:

| World | Source | Characters |
|-------|--------|-----------|
| `experiment_red_mansions.json` | Dream of the Red Chamber (红楼梦) | Jia Baoyu, Lin Daiyu, Xue Baochai... |
| `experiment_three_kindoms.json` | Romance of the Three Kingdoms (三国演义) | Cao Cao, Liu Bei, Zhuge Liang... |
| `experiment_icefire.json` | A Song of Ice and Fire | Tyrion, Daenerys, Jon Snow... |
| `experiment_alice.json` | Alice's Adventures in Wonderland | Alice, Mad Hatter, Queen of Hearts... |

---

## Core Concepts

### Three-Layer Personality Model

Each character agent operates on three layers:

1. **Core Layer** — MBTI type, Big Five traits, values, defense mechanisms
2. **Surface Layer** — Speaking style matrix: sentence length, vocabulary level, punctuation habits, emoji usage; catchphrases; few-shot dialogue examples
3. **Memory Layer** — Dynamic mood/energy state, relationship map, ChromaDB long-term memory, short-term interaction history

### Dual-Process Cognitive Architecture

Inspired by psychological dual-process theory:
- **System 1 (Fast)** — Instinctive reaction based on personality and current mood
- **System 2 (Slow)** — Deliberate inner monologue ("Think-then-Speak") with defense mechanism triggers

### RAG-Based World Consistency

The Orchestrator builds a ChromaDB vector store from the world's lore at startup. Every scene and character action is grounded via RAG retrieval, preventing world-logic violations and character drift across long simulations.

### Dynamic State Manager

Tracks evolving relationship states between characters over time — affinity, tension, and trust change based on interaction history, ensuring organic social dynamics rather than static configurations.

---

## Adding Your Own World

### Method 1: Manual (Recommended)

1. Create a world config in `data/worlds/<your_world>/general.json`
2. Add location data to `data/locations/<your_world>.json`
3. Add a map to `data/maps/<your_world>.csv`
4. Add character profiles to `data/roles/<your_world>/`
5. Create a preset in `experiment_presets/experiment_<your_world>.json`
6. Set `preset_path` in `config.json` and restart

### Method 2: Auto-Extract from Text

Use the extraction pipeline in `extract_data/`:
```bash
# Edit extract_data/extract_config.json with your source text
python extract_data/extract_data.py      # Extract characters and locations
python extract_data/extract_settings.py  # Extract world settings
```

### Method 3: Add a New LLM Adapter

1. Create a file in `modules/llm/`
2. Inherit from `BaseLLM`
3. Register in `sw_utils.py` → `get_models()`

---

## Troubleshooting

**Scroll stuck on "Loading..."**
- Check `server.log` for initialization errors
- Verify `preset_path` in `config.json` points to an existing file
- Ensure API keys are valid

**WebSocket 500 error**
- Usually a ScrollWeaver initialization failure — check server logs
- Verify all paths in the preset file are correct

**Model loading fails**
- Confirm the API key is valid and has quota
- For local models (Ollama/VLLM), ensure the service is running

---

## Contributing

Contributions are welcome!

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push and open a Pull Request

When filing issues, please include: error logs, reproduction steps, Python version, and OS.

---

## Acknowledgements

This project's multi-agent simulation framework builds on **[BookWorld](https://github.com/alienet1109/BookWorld)** (Chen et al., 2025), an open-source project (Apache License 2.0) providing a robust world simulation environment and character interaction loop.

**ScrollWeaver's core innovations:**
- Psychology-grounded dual-process cognitive architecture
- Three-layer personality model (Big Five + Defense Mechanisms + Speaking Style)
- Dynamic state manager for evolving character relationships

---

## Citation

```bibtex
@inproceedings{ran2025scrollweaver,
  title={BOOKWORLD: From Novels to Interactive Agent Societies for Story Creation},
  author={Ran, Yiting and Wang, Xintao and Qiu, Tian and Liang, Jiaqing and Xiao, Yanghua and Yang, Deqing},
  booktitle={Proceedings of the 63rd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)},
  pages={15898--15912},
  year={2025}
}
```

---

## License

See [LICENSE](LICENSE) for details.

---

<div align="center">

**Turn your favorite story into a living world.**

[Get Started](#quick-start) · [Add Your World](#adding-your-own-world) · [Contributing](#contributing)

</div>
