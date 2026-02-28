# ScrollWeaver

<div align="center">

**From Text to a Living World — A Multi-Agent Interactive Story System**

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-latest-green.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | [简体中文](README_zh.md)

**Demo:** [https://scrollweaver.harrycn.com](https://scrollweaver.harrycn.com)

</div>

---

## What is ScrollWeaver?

**ScrollWeaver** is a multi-agent social simulation engine that breathes life into static text — novels, worldbuilding documents, lore collections — turning them into interactive, co-creatable, exportable **living worlds**.

The system simulates a complete social environment built around two core agent types:

- **Orchestrator** — The world director. Understands the world's lore, locations, and rules. Schedules scenes and cues characters to act.
- **Performer** — The character agent. Has its own personality, memory, and goals. Autonomously acts, speaks, and evolves within the scenes the Orchestrator sets.

---

## Core Experiences

### 1. Creation — *"Build a World"*

Upload a novel or describe a setting in one sentence. AI automatically extracts the world's lore, geography, and character profiles to build a fully playable scroll.

- **RAG-based extraction** — Upload PDF/TXT (e.g. *The Three-Body Problem*); AI extracts worldview, geography, and character roster in one click
- **Prompt-based generation** — Describe in a sentence ("a cyberpunk version of Dream of the Red Chamber"); AI generates all configurations
- **Manual editing** — A full editor for power users: tune event chains, adjust character belief parameters, craft precise lore

### 2. Simulation — *"Enter the World"*

Inhabit a classic literary world as a character. Change fate through your own actions.

**The Living World Map** — The centerpiece of the simulation experience:

- A **24×12 interactive grid map** rendered with SVG, representing the world's geography
- Each world has a custom background image (e.g. an ink painting of the Grand View Garden for *Dream of the Red Chamber*)
- **Buildings are clickable** — click any location to see which characters are currently there and initiate a private one-on-one conversation
- **Character avatars** appear in real time on the map showing each character's current location
- Characters move between locations autonomously as the simulation runs
- **Pause / Resume** the world at any time from the top control bar

**Player Status** — Your character has three RPG-style attributes tracked in real time:
- **Talent / Inner Power**
- **Bond / Reputation**
- **Energy / Action Points**

**World Chronicle** — A scrollable log of all world events, accessible at any time during the session.

**In-world time** — A simulated clock runs at accelerated speed; the current world time is displayed in the top bar.

### 3. Gathering — *"Play the Game"*

Sit at the same table as Lin Daiyu and Cao Cao. Compete in social deduction games powered by the A-O-P belief system.

- **Werewolf** — Classic social deduction with AI players who have factions, hidden agendas, and can lie
- **Who is Human** — 3 human players + 6 AI; uncover who's who through deduction and bluffing
- AI characters hold genuine beliefs and allegiances — they will deceive to protect their faction

---

## Architecture

### Three Interaction Modes

| Mode | Name | Use Case | Key Mechanism |
|------|------|---------|---------------|
| **P** | Private Chat | 1-on-1 roleplay with a character | Direct dialogue |
| **O-P** | Story Saga | Multi-character world simulation | **Event Chain** |
| **A-O-P** | Arena Games | Rule-bound social deduction games | **Belief System** |

**Event Chain** — The Orchestrator controls the story's macro arc through structured event chains, preventing aimless meandering and ensuring every story has a beginning, climax, and resolution.

**Belief System** — In Arena mode, each AI Performer is assigned a faction and hidden role. Their beliefs drive their decisions: they will argue, bluff, and reason strategically to protect their allegiance.

### Orchestrator–Performer (O-P) Core

| Component | File | Role |
|-----------|------|------|
| Orchestrator | `modules/orchestrator.py` | Loads lore, builds RAG fact base, schedules scenes |
| Performer | `modules/main_performer.py` | Loads character profile, maintains memory, generates actions |
| ScrollWeaver Engine | `ScrollWeaver.py` | Main simulation loop and state coordination |
| FastAPI Server | `server.py` | REST API + WebSocket real-time streaming |
| Database | `database.py` | SQLite persistence for scrolls and sessions |

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + WebSocket |
| Simulation Engine | ScrollWeaver (custom) |
| LLM Support | OpenAI, Gemini, DeepSeek, Claude, Qwen, Doubao, Kimi, OpenRouter, Ollama, VLLM |
| Vector DB | ChromaDB (RAG for world lore & long-term memory) |
| Embedding | BGE-Small (bilingual CN/EN) |
| Map Rendering | SVG + D3.js |
| Frontend | Static HTML/CSS/JS |
| Database | SQLite |

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

Visit `http://localhost:8000`. Register/login, then from the **Plaza** choose:
- **Workshop** — Create a new world from a novel, a prompt, or manually
- **Travel** — Enter an existing world (your library, shared scrolls, or the gathering hall)

---

## App Flow

```
Login --> Plaza
           |
           +-- Workshop (Creation)
           |     +-- Upload novel  (RAG extraction)
           |     +-- One-sentence prompt  (AI generation)
           |     +-- Manual editor
           |
           +-- Travel (Enter World)
                 +-- Library  ----------->  Enter World Map --> Simulation
                 +-- Explore  ----------->  Browse shared scrolls
                 +-- Gathering  --------->  Werewolf / Who is Human
```

---

## World Map Interface

When you enter a world, the main view is the **interactive world map**:

```
+-------------------------------------------------------------+
|  [<- Back]  World Map          [|| Pause]   Clock 08:32    |
+------------------------+------------------------------------+
|  [Player Avatar]       |                                    |
|  Character Name        |                                    |
|  Traveler              |      Interactive World Map         |
|  Talent   [####-] 60   |    (SVG, 24x12 grid, zoomable)    |
|  Bond     [###--] 45   |                                    |
|  Energy   [#####] 80   |   Buildings  +  Live character     |
|                        |   avatars moving in real time      |
+------------------------+------------------------------------+
```

**Clicking a building** opens a panel showing:
- All characters currently at that location
- Option to **start a private one-on-one chat** with any character present

---

## Preset Worlds

ScrollWeaver ships with four pre-built literary worlds:

| World | Preset File | Featured Locations |
|-------|-------------|-------------------|
| **Dream of the Red Chamber** | `experiment_red_mansions.json` | Grand View Garden: Qinfang Pavilion, Xiaoxiang Lodge, Yihong Courtyard, Ouxiang Pavilion, Longcui Nunnery, Qiushuang Studio, Hengwu Garden |
| **Romance of the Three Kingdoms** | `experiment_three_kindoms.json` | Longzhong, major battlefield zones |
| **A Song of Ice and Fire** | `experiment_icefire.json` | Westeros locations |
| **Alice's Adventures in Wonderland** | `experiment_alice.json` | Wonderland locations |

The **Dream of the Red Chamber** world features a custom ink-painting background of the Grand View Garden with all 7 buildings mapped to their historical coordinates. Characters like Lin Daiyu, Jia Baoyu, and Xue Baochai move between their residences in real time.

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
├── index.html                   # App entry point
├── frontend/
│   ├── pages/
│   │   ├── home.html            # Landing / intro page
│   │   ├── login.html           # Login / register
│   │   ├── plaza.html           # Main lobby
│   │   ├── creation.html        # World creation workshop
│   │   ├── library.html         # Your scrolls library
│   │   ├── explore.html         # Browse shared scrolls
│   │   ├── world-view.html      # Interactive world map
│   │   ├── chat.html            # Private 1-on-1 chat
│   │   ├── multiplayer-story.html # Co-op story mode
│   │   ├── gathering.html       # Gathering lobby
│   │   ├── werewolf.html        # Werewolf game
│   │   └── who-is-human.html    # Who is Human game
│   ├── js/
│   │   ├── pages/world-view.js  # Map rendering + WebSocket
│   │   ├── left-section/map-panel.js  # D3.js map panel
│   │   └── ...
│   ├── css/
│   └── assets/images/           # Map backgrounds, icons
├── modules/
│   ├── core/                    # Core server, sessions, socket.io
│   ├── orchestrator.py          # World Orchestrator
│   ├── main_performer.py        # Character Performer
│   ├── dual_process_agent.py    # Dual-process cognitive architecture
│   ├── personality_model.py     # Three-layer personality model
│   ├── dynamic_state_manager.py # Dynamic relationship tracking
│   ├── simulation/              # Scene/event/movement managers
│   ├── chat/                    # Private chat performer
│   ├── werewolf/                # Werewolf A-O-P module
│   ├── gathering/               # Gathering game module
│   ├── llm/                     # LLM adapters
│   ├── db/                      # ChromaDB adapter
│   └── prompt/                  # Prompt templates (EN/ZH)
├── data/
│   ├── worlds/                  # World lore configs
│   ├── roles/                   # Character profiles (gitignored)
│   ├── locations/               # Location data per world
│   ├── maps/                    # Map CSVs + building JSON configs
│   │   ├── A_Dream_in_Red_Mansions_buildings.json  # 7 buildings with grid coords
│   │   └── ...
│   └── werewolf/                # Werewolf game presets
├── experiment_presets/          # World launch configurations
├── extract_data/                # Tools to extract world data from text
└── map-pic/                     # Map background images
```

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
- **System 2 (Slow)** — Deliberate inner monologue ("Think-then-Speak") with defense mechanism triggers under stress

### RAG-Based World Consistency

The Orchestrator builds a ChromaDB vector store from the world's lore at startup. Every scene and character action is grounded via RAG retrieval, preventing world-logic violations and character drift across long simulations.

### Dynamic State Manager

Tracks evolving relationship states between characters over time — affinity, tension, and trust change based on interaction history, ensuring organic social dynamics.

---

## Adding Your Own World

### Method 1: In-app Workshop (Recommended)

1. Upload your novel as PDF/TXT — AI extracts everything automatically
2. Or describe your world in one sentence — AI generates all configurations from scratch
3. Or use the manual editor for fine-grained control over every detail

### Method 2: Manual File Creation

1. Create `data/worlds/<world>/general.json` — world lore config
2. Create `data/locations/<world>.json` — location definitions
3. Create `data/maps/<world>.csv` — grid map
4. Optionally create `data/maps/<world>_buildings.json` — named building polygons with grid coordinates
5. Add character profiles to `data/roles/<world>/`
6. Create `experiment_presets/experiment_<world>.json`
7. Set `preset_path` in `config.json` and restart

### Method 3: Auto-Extract from Text (CLI)

```bash
# Edit extract_data/extract_config.json first
python extract_data/extract_data.py      # Extract characters and locations
python extract_data/extract_settings.py  # Extract world settings
```

### Adding a New LLM Adapter

1. Create a file in `modules/llm/`, inherit from `BaseLLM`
2. Register in `sw_utils.py` → `get_models()`

---

## Troubleshooting

**World stuck on "Loading..."**
- Check `server.log` for initialization errors
- Verify `preset_path` in `config.json` points to an existing file
- Ensure API keys are valid

**WebSocket 500 error** — Usually a ScrollWeaver initialization failure; check server logs and verify all paths in the preset file.

**Map not displaying correctly** — Ensure `data/maps/<world>.csv` and `data/maps/<world>_buildings.json` exist and match the world's `general.json` config.

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
- Interactive world map with real-time character movement
- Event chain mechanism for coherent long-form storytelling
- Belief system enabling strategic AI behavior in social deduction games

---

## License

See [LICENSE](LICENSE) for details.

---

<div align="center">

**Turn your favorite story into a living world.**

[Get Started](#quick-start) · [Add Your World](#adding-your-own-world) · [Demo](https://scrollweaver.harrycn.com)

</div>


