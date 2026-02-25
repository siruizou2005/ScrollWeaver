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

### 玩法一：AI 导演模式（观察故事）

系统默认状态——完全自动化叙事：
1. 选择或上传世界（如红楼梦、冰与火之歌）
2. 指挥家根据世界观自动编排场景
3. 角色自主进行对话、行动，建立关系网络
4. 你如同观看一场永不重复的戏剧

### 玩法二：人类介入模式（扮演角色）

随时介入，亲自推动剧情：
1. 选择你想扮演的角色
2. 轮到该角色行动时，系统通过 WebSocket 自动暂停，等待你输入
3. 输入你的行动或对话
4. 所有 AI 角色实时根据你的输入调整反应——真正的人机共创

### 玩法三：人机协同创作模式（生成与导出）

专为创作者设计的核心功能：
1. 加载或构建你的世界观和角色卡
2. 亲自扮演关键节点，确定故事核心走向
3. 点击"AI 接管"，AI 在后台高速推演后续 N 轮或 N 天的剧情
4. 一键下载完整的共创故事脚本（`.txt` / `.md`），可直接用于小说、剧本或视频创作

---

## 技术架构

### 指挥家–表演者（O-P）模型

| 组件 | 文件 | 职责 |
|------|------|------|
| 指挥家 | `modules/orchestrator.py` | 加载世界观、构建 RAG 事实库、调度场景 |
| 表演者 | `modules/main_performer.py` | 加载角色画像、维护记忆、生成行动 |
| ScrollWeaver 引擎 | `ScrollWeaver.py` | 主模拟循环与状态协同 |
| FastAPI 服务器 | `server.py` | REST API + WebSocket 实时推流 |
| 数据库 | `database.py` | SQLite 持久化书卷和会话 |

### 互动模式

| 模式 | 名称 | 适用场景 |
|------|------|---------|
| **P 模式** | 私密晤谈 | 1v1 聊天、角色扮演 |
| **O-P 模式** | 入卷同游 | 多角色故事模拟（默认）|
| **A-O-P 模式** | 雅集博弈 | 规则类游戏：狼人杀、谁是卧底 |

### 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI + WebSocket |
| 模拟引擎 | ScrollWeaver（自研）|
| LLM 支持 | OpenAI、Gemini、DeepSeek、Claude、Qwen、Doubao、Kimi、OpenRouter、Ollama、VLLM |
| 向量数据库 | ChromaDB（世界观 RAG + 长期记忆）|
| 嵌入模型 | BGE-Small（中英文双语）|
| 前端 | 纯静态 HTML/CSS/JS |
| 数据库 | SQLite（`database.py`）|

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

支持的模型：OpenAI (GPT-3.5/4/4o)、Google Gemini、Anthropic Claude、Qwen、DeepSeek、Doubao、Kimi、OpenRouter、Ollama/VLLM（本地）。

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

打开浏览器访问 `http://localhost:8000`，注册/登录后选择书卷，开始体验。

---

## 项目结构

```
ScrollWeaver/
├── ScrollWeaver.py              # 核心模拟引擎
├── server.py                    # FastAPI 服务器入口
├── sw_utils.py                  # 通用工具函数
├── database.py                  # SQLite 数据库操作
├── config.json                  # 配置文件（模型、API Key）
├── requirements.txt             # Python 依赖
├── Dockerfile                   # Docker 部署配置
├── index.html                   # 前端入口
├── frontend/                    # 纯静态前端
│   ├── pages/                   # HTML 页面
│   ├── js/                      # JavaScript 模块
│   └── css/                     # 样式表
├── modules/
│   ├── core/                    # 核心服务器、会话、socket.io
│   ├── orchestrator.py          # 世界指挥家
│   ├── main_performer.py        # 角色表演者
│   ├── dual_process_agent.py    # 双进程认知架构
│   ├── personality_model.py     # 三层人格模型
│   ├── dynamic_state_manager.py # 动态关系/情绪状态追踪
│   ├── memory.py                # 短期/长期记忆
│   ├── history_manager.py       # 互动历史管理
│   ├── embedding.py             # 嵌入模型封装
│   ├── style_vector_db.py       # 风格向量数据库
│   ├── llm/                     # LLM 适配器（OpenAI、Gemini 等）
│   ├── db/                      # 数据库适配器（ChromaDB）
│   ├── prompt/                  # 提示词模板（中英文）
│   ├── simulation/              # 模拟子系统
│   │   ├── simulator.py         # 主模拟循环
│   │   ├── scene_manager.py     # 场景调度
│   │   ├── event_manager.py     # 事件生成
│   │   ├── movement_manager.py  # 角色移动
│   │   └── state_manager.py     # 世界状态管理
│   ├── chat/                    # 聊天模式表演者
│   ├── werewolf/                # 狼人杀游戏模块
│   ├── gathering/               # 雅集游戏模块
│   ├── business/                # 商业游戏模块
│   ├── utils/                   # 工具辅助函数
│   ├── models/                  # 响应数据模型
│   └── routes/                  # API 路由处理器
├── data/
│   ├── worlds/                  # 世界观配置文件
│   ├── roles/                   # 角色档案（已 gitignore）
│   ├── locations/               # 地点数据
│   ├── maps/                    # 地图数据与图片
│   └── werewolf/                # 狼人杀预设
├── experiment_presets/          # 模拟预设（世界启动配置）
├── extract_data/                # 从文本自动提取世界/角色的工具
└── map-pic/                     # 地图背景图片
```

---

## 预置世界

ScrollWeaver 内置四个经典文学世界：

| 世界 | 原著 | 代表角色 |
|------|------|---------|
| `experiment_red_mansions.json` | 红楼梦 | 贾宝玉、林黛玉、薛宝钗… |
| `experiment_three_kindoms.json` | 三国演义 | 曹操、刘备、诸葛亮… |
| `experiment_icefire.json` | 冰与火之歌 | 提利昂、丹妮莉丝、琼恩… |
| `experiment_alice.json` | 爱丽丝梦游仙境 | 爱丽丝、疯帽子、红皇后… |

---

## 核心概念

### 三层人格模型

每个角色 Agent 基于三个层次运作：

1. **内核层** — MBTI 类型、大五人格（Big Five）、价值观、防御机制
2. **表象层** — 语言风格矩阵（句长偏好、词汇等级、标点习惯、表情频率）、口头禅、Few-Shot 对话样本
3. **记忆层** — 动态情绪/能量状态、关系映射、ChromaDB 长期记忆、短期互动历史

### 双进程认知架构

受心理学双进程理论启发：
- **系统 1（快速）** — 基于人格和当前情绪的直觉反应
- **系统 2（慢速）** — 有意识的内心独白（"先想后说"），触发防御机制

### 基于 RAG 的世界一致性

指挥家在启动时将世界观构建为 ChromaDB 向量库。每个场景和角色行动都通过 RAG 检索进行世界观校验，有效防止长期模拟中的剧情漂移和人设崩塌。

### 动态状态管理器

追踪角色间随时间演化的关系状态——好感度、紧张感和信任度会根据互动历史动态变化，形成有机的社交动态，而非静态设定。

---

## 添加你自己的世界

### 方式一：手动创建（推荐）

1. 在 `data/worlds/<your_world>/general.json` 创建世界配置
2. 在 `data/locations/<your_world>.json` 添加地点数据
3. 在 `data/maps/<your_world>.csv` 添加地图
4. 在 `data/roles/<your_world>/` 添加角色档案
5. 在 `experiment_presets/experiment_<your_world>.json` 创建预设
6. 在 `config.json` 中设置 `preset_path` 并重启

### 方式二：从文本自动提取

使用 `extract_data/` 中的提取流程：
```bash
# 编辑 extract_data/extract_config.json，设置你的源文本
python extract_data/extract_data.py      # 提取角色和地点
python extract_data/extract_settings.py  # 提取世界设定
```

### 方式三：添加新的 LLM 适配器

1. 在 `modules/llm/` 中创建新文件
2. 继承 `BaseLLM` 基类
3. 在 `sw_utils.py` 的 `get_models()` 函数中注册

---

## 常见问题

**书卷一直显示"正在加载书卷..."**
- 查看 `server.log` 中的初始化错误信息
- 确认 `config.json` 中的 `preset_path` 指向已存在的文件
- 确认 API Key 有效

**WebSocket 返回 500 错误**
- 通常是 ScrollWeaver 初始化失败——查看服务端日志
- 核对预设文件中的所有路径是否正确

**模型加载失败**
- 确认 API Key 有效且有余额
- 本地模型（Ollama/VLLM）需确保对应服务正在运行

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

[快速开始](#快速开始) · [添加你的世界](#添加你自己的世界) · [贡献指南](#贡献指南)

</div>
