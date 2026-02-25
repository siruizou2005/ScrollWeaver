# ScrollWeaver（织梦绘卷）

<div align="center">

**从文本到"活世界"的多智能体互动故事系统**

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-latest-green.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | [中文](README_zh.md)

**Demo：** [https://scrollweaver.harrycn.com](https://scrollweaver.harrycn.com)

</div>

---

## 项目概述

**ScrollWeaver（织梦绘卷）** 是一个多智能体社会模拟引擎，能将静态文本（小说、设定集、世界观文档）"复活"为可互动、可共创、可导出的**活世界**。

系统围绕两类核心 Agent 构建完整的社会模拟环境：

- **指挥家（Orchestrator）** — 世界导演。理解世界观、地点和规则，负责编排场景、调度角色登场。
- **表演者（Performer）** — 角色 Agent。拥有独立的性格、记忆和目标，在指挥家设定的场景中自主行动、对话、演化。

---

## 核心玩法

### 1. 造物（Creation）— *"一念生万物"*
上传一本小说，或用一句话描述一个世界，AI 自动提取世界观、地理志和人物谱系，一键生成完整可玩的书卷。

- **点石成金（RAG）** — 上传 PDF/TXT（如《三体》），AI 自动提取世界观、地理和角色花名册
- **凭空造物（Prompt）** — 一句话描述（如"赛博朋克版红楼梦"），AI 自动生成所有配置
- **手动编织（Manual）** — 硬核玩家专属编辑器：手调事件链走向、精修角色信念参数、精雕世界细节

### 2. 历练（Simulation）— *"红尘炼本心"*
穿越至经典文学世界，化身剧中人，亲手改写既定命运。

**活世界地图** — 历练体验的核心：

- **24×12 交互式网格地图**，以 SVG 渲染，直观呈现世界地理
- 每个世界拥有专属背景图（如红楼梦使用大观园水墨画风）
- **建筑物可点击** — 点击任意地点，查看当前在场角色，并可发起**私语**（1v1 对话）
- **角色头像实时显示**在地图上，随模拟进行动态移动
- 随时点击顶部控制栏**暂停 / 继续**世界运行

**玩家状态栏** — 你的角色拥有三项实时追踪的 RPG 属性：
- **才情 / 内力**（Talent / Inner Power）
- **羁绊 / 声望**（Bond / Reputation）
- **精力 / 行动力**（Energy / Action Points）

**世界见闻录** — 可随时查阅的世界事件完整历史记录。

**虚拟时间** — 世界内置加速时钟，当前世界时间实时显示在顶部状态栏。

### 3. 雅集（Gathering）— *"博弈见真章"*
与林黛玉、曹操同桌竞技，在 A-O-P 信念机制驱动的社交博弈游戏中体验 AI 真正的谋略。

- **狼人杀** — 经典社交推理游戏，AI 玩家有阵营、有隐藏目标、会撒谎
- **谁是卧底** — 3 名真实玩家 + 6 个 AI，在谎言与推理中找出卧底
- AI 角色具有真实信念和阵营立场——为保护阵营，它们会争辩、会欺骗、会战略性推理

---

## 技术架构

### 三种互动模式

| 模式 | 名称 | 适用场景 | 核心机制 |
|------|------|---------|---------|
| **P** | 私语 | 与角色 1v1 角色扮演 | 直接对话 |
| **O-P** | 入卷 | 多角色世界模拟 | **事件链** |
| **A-O-P** | 雅集 | 有规则的社交推理游戏 | **信念机制** |

**事件链（Event Chain）** — 指挥家通过结构化的事件链掌控故事宏观走向，拒绝流水账，让每个故事有始有终。

**信念机制（Belief System）** — 雅集模式中，每个 AI 表演者被赋予阵营和隐藏身份。信念驱动决策：为了保护阵营利益，AI 会争辩、会撒谎、会进行逻辑推演。

### 指挥家–表演者（O-P）核心

| 组件 | 文件 | 职责 |
|------|------|------|
| 指挥家 | `modules/orchestrator.py` | 加载世界观、构建 RAG 事实库、调度场景 |
| 表演者 | `modules/main_performer.py` | 加载角色画像、维护记忆、生成行动 |
| ScrollWeaver 引擎 | `ScrollWeaver.py` | 主模拟循环与状态协同 |
| FastAPI 服务器 | `server.py` | REST API + WebSocket 实时推流 |
| 数据库 | `database.py` | SQLite 持久化书卷和会话 |

### 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI + WebSocket |
| 模拟引擎 | ScrollWeaver（自研）|
| LLM 支持 | OpenAI、Gemini、DeepSeek、Claude、Qwen、Doubao、Kimi、OpenRouter、Ollama、VLLM |
| 向量数据库 | ChromaDB（世界观 RAG + 长期记忆）|
| 嵌入模型 | BGE-Small（中英文双语）|
| 地图渲染 | SVG + D3.js（力导向图）|
| 前端 | 纯静态 HTML/CSS/JS |
| 数据库 | SQLite |

---

## 快速开始

### 前置要求

- Python 3.8+
- 至少一个 LLM API Key（Gemini / OpenAI / DeepSeek 等）

### 1. 克隆仓库

```bash
git clone https://github.com/siruizou2005/ScrollWeaver.git
cd ScrollWeaver
```

### 2. 安装依赖

```bash
pip install -r requirements.txt

# 如果使用 SOCKS 代理，还需安装：
pip install 'httpx[socks]'
```

### 3. 配置

编辑 `config.json`，填入你的 API Key：

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

支持：OpenAI (GPT-3.5/4/4o)、Google Gemini、Anthropic Claude、Qwen、DeepSeek、Doubao、Kimi、OpenRouter、Ollama/VLLM（本地）。

### 4. 启动服务器

```bash
python server.py
```

服务器在 `http://localhost:8000` 运行。

**使用代理（可选）：**
```bash
export https_proxy=http://127.0.0.1:7890
python server.py
```

### 5. 访问应用

打开浏览器访问 `http://localhost:8000`，注册/登录后，从**广场**选择：
- **天工** — 进入造办处，创建新书卷
- **穿越** — 进入已有书卷（藏书阁、阅卷、或雅集博弈）

---

## 应用流程

```
登录 → 广场
         ├── 天工（造物）
         │     ├── 上传小说（RAG 自动提取）
         │     ├── 一句话描述（Prompt 生成）
         │     └── 手动编辑器
         └── 穿越
               ├── 藏书阁 ─── 进入书卷 ──► 活世界地图（历练）
               ├── 阅卷  ─── 浏览他人共享的书卷
               └── 雅集  ─── 狼人杀 / 谁是卧底
```

---

## 活世界地图界面

进入书卷后，主视图即为**交互式活世界地图**：

```
┌─────────────────────────────────────────────────────────────┐
│  [← 返回]  世界地图           [⏸ 暂停]    🕐 虚时 08:32   │
├──────────────────────────┬──────────────────────────────────┤
│  [玩家头像]              │                                  │
│  角色名 | 穿越者         │                                  │
│  ✨ 才情  ████░ 60       │      交互式世界地图              │
│  ♥  羁绊  ███░░ 45       │    （SVG，24×12 格，可缩放）    │
│  ⚡ 精力  █████ 80       │                                  │
│                          │   [建筑物] [角色头像实时移动]    │
└──────────────────────────┴──────────────────────────────────┘
```

**点击建筑物**会弹出面板，显示：
- 当前在此地点的所有角色
- 可向任意在场角色发起**私语**（1v1 对话）

---

## 预置世界

ScrollWeaver 内置四个经典文学世界：

| 世界 | 预设文件 | 特色地点 |
|------|---------|---------|
| **红楼梦** | `experiment_red_mansions.json` | 大观园：沁芳亭、潇湘馆、怡红院、藕香榭、栊翠庵、秋爽斋、蘅芜苑 |
| **三国演义** | `experiment_three_kindoms.json` | 隆中、各大战场 |
| **冰与火之歌** | `experiment_icefire.json` | 维斯特洛大陆各地 |
| **爱丽丝梦游仙境** | `experiment_alice.json` | 仙境各地 |

**红楼梦**世界配有水墨风格大观园专属背景图，7 座建筑以历史坐标精确定位于网格地图上。林黛玉、贾宝玉、薛宝钗等角色在潇湘馆、怡红院、蘅芜苑之间实时游走。

---

## 项目结构

```
ScrollWeaver/
├── ScrollWeaver.py              # 核心模拟引擎
├── server.py                    # FastAPI 服务器入口
├── sw_utils.py                  # 通用工具函数
├── database.py                  # SQLite 数据库操作
├── config.json                  # 配置文件
├── requirements.txt             # Python 依赖
├── Dockerfile                   # Docker 部署配置
├── index.html                   # 应用入口
├── frontend/
│   ├── pages/
│   │   ├── home.html            # 落地介绍页
│   │   ├── login.html           # 登录 / 注册
│   │   ├── plaza.html           # 主广场（天工 / 穿越）
│   │   ├── creation.html        # 造物工坊
│   │   ├── library.html         # 藏书阁（你的书卷）
│   │   ├── explore.html         # 阅卷（浏览共享书卷）
│   │   ├── world-view.html      # 活世界地图（历练）
│   │   ├── chat.html            # 私语 1v1 聊天
│   │   ├── multiplayer-story.html # 入卷同游（多人共创）
│   │   ├── gathering.html       # 雅集大厅
│   │   ├── werewolf.html        # 狼人杀
│   │   └── who-is-human.html    # 谁是卧底
│   ├── js/
│   │   ├── pages/world-view.js  # 地图渲染 + WebSocket
│   │   ├── left-section/map-panel.js  # D3.js 地图面板
│   │   └── ...
│   ├── css/
│   └── assets/images/           # 地图背景图、图标
├── modules/
│   ├── core/                    # 核心服务器、会话、socket.io
│   ├── orchestrator.py          # 世界指挥家
│   ├── main_performer.py        # 角色表演者
│   ├── dual_process_agent.py    # 双进程认知架构
│   ├── personality_model.py     # 三层人格模型
│   ├── dynamic_state_manager.py # 动态关系追踪
│   ├── simulation/              # 场景/事件/移动管理器
│   ├── chat/                    # P 模式聊天表演者
│   ├── werewolf/                # 狼人杀 A-O-P 模块
│   ├── gathering/               # 雅集游戏模块
│   ├── llm/                     # LLM 适配器
│   ├── db/                      # ChromaDB 适配器
│   └── prompt/                  # 提示词模板（中英文）
├── data/
│   ├── worlds/                  # 世界观配置
│   ├── roles/                   # 角色档案（已 gitignore）
│   ├── locations/               # 各世界地点数据
│   ├── maps/                    # 地图 CSV + 建筑物 JSON 坐标
│   │   ├── A_Dream_in_Red_Mansions_buildings.json  # 7 座建筑网格坐标
│   │   └── ...
│   └── werewolf/                # 狼人杀预设
├── experiment_presets/          # 书卷启动配置
├── extract_data/                # 从文本提取世界数据的工具
└── map-pic/                     # 地图背景图片
```

---

## 核心概念

### 三层人格模型

1. **内核层** — MBTI 类型、大五人格（Big Five）、价值观、防御机制
2. **表象层** — 语言风格矩阵（句长偏好、词汇等级、标点习惯、表情使用频率）、口头禅、Few-Shot 对话样本
3. **记忆层** — 动态情绪/能量状态、关系映射、ChromaDB 长期记忆、短期互动历史

### 双进程认知架构

受心理学双进程理论启发：
- **系统 1（快速）** — 基于人格和当前情绪的直觉反应
- **系统 2（慢速）** — 有意识的内心独白（"先想后说"），在压力下触发防御机制

### 基于 RAG 的世界一致性

指挥家启动时将世界观构建为 ChromaDB 向量库。每个场景和角色行动都通过 RAG 检索进行世界观校验，有效防止长期模拟中的剧情漂移和人设崩塌。

### 动态状态管理器

追踪角色间随时间演化的关系状态——好感度、紧张感、信任度根据互动历史动态变化，形成有机的社交动态。

---

## 添加你自己的世界

### 方式一：在应用内创建（推荐）

使用应用内的**造办处**：
1. 上传小说 PDF/TXT — AI 自动提取所有内容
2. 或一句话描述你的世界 — AI 从零生成配置
3. 或使用手动编辑器进行精细控制

### 方式二：手动创建文件

1. 创建 `data/worlds/<world>/general.json` — 世界观配置
2. 创建 `data/locations/<world>.json` — 地点定义
3. 创建 `data/maps/<world>.csv` — 网格地图
4. 可选：创建 `data/maps/<world>_buildings.json` — 带网格坐标的具名建筑多边形
5. 在 `data/roles/<world>/` 添加角色档案
6. 创建 `experiment_presets/experiment_<world>.json`
7. 在 `config.json` 中设置 `preset_path` 并重启

### 方式三：从文本自动提取（命令行）

```bash
# 先编辑 extract_data/extract_config.json
python extract_data/extract_data.py      # 提取角色和地点
python extract_data/extract_settings.py  # 提取世界设定
```

### 添加新的 LLM 适配器

1. 在 `modules/llm/` 中创建新文件，继承 `BaseLLM`
2. 在 `sw_utils.py` 的 `get_models()` 函数中注册

---

## 常见问题

**书卷一直显示"正在加载书卷..."**
- 查看 `server.log` 中的初始化错误
- 确认 `config.json` 中的 `preset_path` 指向已存在的文件
- 确认 API Key 有效

**WebSocket 返回 500 错误** — 通常是 ScrollWeaver 初始化失败，查看服务端日志并核对预设文件中所有路径。

**地图显示异常** — 确认 `data/maps/<world>.csv` 和 `data/maps/<world>_buildings.json` 存在且与 `general.json` 中的配置匹配。

---

## 贡献指南

欢迎任何形式的贡献！

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feature/your-feature`）
3. 提交更改
4. 推送并开启 Pull Request

提交 Issue 时请附上：错误日志、复现步骤、Python 版本和操作系统信息。

---

## 致谢

本项目的多智能体模拟框架基于 **[BookWorld](https://github.com/alienet1109/BookWorld)**（Chen et al., 2025，Apache License 2.0）开发。

**ScrollWeaver 的核心创新：**
- 心理学基础的双进程认知架构
- 三层人格模型（大五人格 + 防御机制 + 说话风格）
- 动态状态管理器，支持角色关系的持续演化
- 交互式活世界地图，角色实时移动可见
- 事件链机制，确保长篇故事的连贯性
- 信念机制，赋予 AI 真实立场驱动社交博弈

---

## 引用

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

## 许可证

详见 [LICENSE](LICENSE) 文件。

---

<div align="center">

**让你最热爱的故事世界活起来。**

[快速开始](#快速开始) · [添加你的世界](#添加你自己的世界) · [Demo](https://scrollweaver.harrycn.com)

</div>
