# Soulverse

<div align="center">

**基于多 Agent 模拟的"平行时空"社交沙盒**

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](#introduction) | [中文](#项目概述)

</div>

---

## 项目概述

**Soulverse** 是一个创新的"平行时空"社交沙盒系统，基于 ScrollWeaver 多智能体引擎构建。每位用户都能基于兴趣图谱生成一个"AI 灵魂"（数字孪生 Agent），这个 AI 灵魂可以在虚拟世界中自主生活、结识同类，而用户既可以"零压力"观察，也能随时"灵魂降临"亲自互动。

### 核心特性

- 🎭 **观察者模式**：零压力社交，看着你的 AI 替你破冰、交友、生活
- ⚡ **灵魂降临模式**：关键时刻一键接管，亲自改写剧情
- 💫 **动态匹配**：基于 AI 互动产生的真实故事来寻找灵魂伴侣
- 🧠 **三层人格模型**：内核层（认知与特质）、表象层（语言与行为模式）、记忆层（经历与关系）
- 🌐 **多 Agent 社会系统**：从"单聊关系"升级为"世界级互动"
- 📊 **社交故事生成**：自动生成社交互动故事和每日报告
- 🔄 **持续运行**：支持长期运行（100+ 轮次），即使离线也在延续故事

### 解决的问题

- **社交启动困难**：解决"破冰"尴尬，降低社交消耗
- **匹配质量肤浅**：用动态互动证据取代静态标签
- **时间精力有限**：即使离线，AI 也在为你延续故事

---

## Introduction

**Soulverse** is an innovative "parallel universe" social sandbox system built on the ScrollWeaver multi-agent engine. Each user can generate an "AI soul" (digital twin Agent) based on their interest profile. This AI soul can autonomously live and interact in the virtual world, while users can either observe with "zero pressure" or "possess" the soul at any time for direct interaction.

### Key Features

- 🎭 **Observer Mode**: Zero-pressure social interaction, watch your AI break the ice, make friends, and live
- ⚡ **Soul Possession Mode**: Take control at key moments, rewrite the story yourself
- 💫 **Dynamic Matching**: Find soulmates based on real stories generated from AI interactions
- 🧠 **Three-Layer Personality Model**: Core layer (cognition & traits), surface layer (language & behavior patterns), memory layer (experiences & relationships)
- 🌐 **Multi-Agent Social System**: Upgrade from "single-chat relationships" to "world-level interactions"
- 📊 **Social Story Generation**: Automatically generate social interaction stories and daily reports
- 🔄 **Continuous Operation**: Supports long-term running (100+ rounds), stories continue even when offline

---

## 技术架构

### 后端技术栈

- **框架**: FastAPI + WebSocket
- **多智能体引擎**: ScrollWeaver
- **LLM 支持**: OpenAI, Gemini, DeepSeek, Claude, Qwen, Doubao, Ollama, VLLM 等
- **向量数据库**: ChromaDB (用于 RAG 检索和长期记忆存储)
- **嵌入模型**: BGE-small, 支持中英文
- **会话管理**: Starlette SessionMiddleware

### 前端技术栈

- **框架**: Next.js 14 + React 18
- **3D 渲染**: Three.js + React Three Fiber
- **UI 库**: Tailwind CSS + Framer Motion
- **图表**: Chart.js + D3.js
- **Markdown**: React Markdown

### 核心模块

- **ScrollWeaver**: 多智能体模拟引擎核心
- **Orchestrator**: 世界指挥家，负责场景调度和事件生成
- **UserAgent**: 用户 Agent，基于兴趣图谱创建
- **NPCAgent**: NPC Agent，预设模板或动态创建
- **PersonalityModel**: 三层人格模型（内核层、表象层、记忆层）
- **SocialStoryGenerator**: 社交故事生成器
- **DailyReportGenerator**: 每日报告生成器
- **NeuralMatching**: 神经匹配算法，基于兴趣、MBTI、社交目标

---

## 快速开始

### 前置要求

- Python 3.10+
- Node.js 18+
- npm 或 yarn
- 至少一个 LLM API Key (OpenAI/Gemini/DeepSeek 等)

### 安装步骤

#### 1. 克隆仓库

```bash
git clone https://github.com/Jinqitrip/Soulverse.git
cd Soulverse
```

#### 2. 安装 Python 依赖

```bash
# 创建虚拟环境（推荐）
conda create -n soulverse python=3.10
conda activate soulverse

# 或使用 venv
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

#### 3. 安装前端依赖

```bash
cd frontend
npm install
cd ..
```

#### 4. 配置

编辑 `config.json` 文件：

```json
{
    "role_llm_name": "gemini-2.5-flash-lite",
    "world_llm_name": "gemini-2.5-flash-lite",
    "embedding_model_name": "bge-small",
    "preset_path": "./experiment_presets/soulverse_sandbox.json",
    "if_save": 0,
    "scene_mode": 1,
    "rounds": 100,
    "save_dir": "",
    "mode": "free",
    
    "OPENAI_API_KEY": "your-openai-key",
    "GEMINI_API_KEY": "your-gemini-key",
    "DEEPSEEK_API_KEY": "your-deepseek-key"
}
```

**配置说明**：
- `role_llm_name`: Agent 使用的 LLM 模型
- `world_llm_name`: 世界模拟使用的 LLM 模型
- `embedding_model_name`: 嵌入模型名称（用于向量检索）
- `preset_path`: 实验预设文件路径
- `rounds`: 模拟轮次（Soulverse 模式建议 100+）
- `mode`: 模拟模式（"free" 自由模式）

### 运行项目

#### 开发模式

**启动后端服务器**：
```bash
python server.py
# 或
uvicorn server:app --host 127.0.0.1 --port 8001
```

**启动前端开发服务器**（新终端）：
```bash
cd frontend
npm run dev
```

访问：
- 前端：http://localhost:3000
- 后端 API：http://localhost:8001
- API 文档：http://localhost:8001/docs

#### 生产模式

**构建前端**：
```bash
cd frontend
npm run build
```

**启动生产服务器**：
```bash
python server.py
```

访问：http://localhost:8001

#### Docker 部署

```bash
docker build -t soulverse .
docker run -p 8001:8001 soulverse
```

---

## 使用指南

### 1. 用户注册/登录

- 访问登录页面
- 支持用户注册或访客模式
- 访客模式会自动生成临时用户 ID

### 2. 创建数字孪生 Agent

#### 方式一：通过 Soul API（模拟）

```bash
POST /api/create-user-agent
{
    "user_id": "user_001",
    "role_code": "my_agent_001"
}
```

系统会自动从 Soul mock API 获取用户画像（兴趣、MBTI、人格等）。

#### 方式二：从文本提取

```bash
POST /api/create-agent-from-text
{
    "user_id": "user_001",
    "role_code": "my_agent_002",
    "text": "用户提供的文本描述..."
}
```

#### 方式三：从文件上传

```bash
POST /api/create-agent-from-file
FormData:
    - user_id: "user_001"
    - role_code: "my_agent_003"
    - file: <file>
```

#### 方式四：通过问答

```bash
POST /api/create-agent-from-qa
{
    "user_id": "user_001",
    "role_code": "my_agent_004",
    "answers": {
        "q1": "answer1",
        "q2": "answer2"
    }
}
```

### 3. 观察者模式

**功能**：查看你的 Agent 在虚拟世界中的自主活动

**使用步骤**：
1. 在 Soulverse 面板的"观察者模式"区域
2. 从下拉菜单选择你的 Agent
3. 点击"查看社交故事"查看最近 24 小时的互动记录
4. 点击"查看每日报告"查看每日活动摘要

**查看内容**：
- **社交故事**：Agent 的所有互动记录，按时间排序
- **每日报告**：包含摘要、亮点事件、互动统计等

### 4. 灵魂降临模式

**功能**：完全控制你的 Agent 并参与互动

**使用步骤**：
1. 从左侧角色列表选择你的 Agent（或通过"选择角色"按钮）
2. 系统自动检测这是用户 Agent 并进入灵魂降临模式
3. 当 Agent 需要行动时，系统暂停并等待你的输入
4. 在输入框中输入 Agent 的行动/对话
5. 点击"AI 自动补全"按钮获取 AI 建议的行动选项

**模式切换**：
- 点击"进入灵魂降临"按钮手动切换模式
- 观察者模式：Agent 自主行动，你只能查看
- 灵魂降临模式：所有 Agent 行动都需要你的输入

### 5. 神经匹配

**功能**：基于兴趣、MBTI、社交目标匹配最合适的 Agent

```bash
POST /api/neural-match
{
    "user_id": "user_001"
}
```

返回：
- Top 3 完美共振 Agent
- 2 个随机邂逅 Agent

### 6. 添加预设 NPC

```bash
POST /api/add-preset-npc
{
    "preset_id": "preset_001",  # 预设模板 ID
    "custom_name": "自定义名称（可选）",
    "role_code": "自定义 role_code（可选）"
}
```

**可用预设模板**：
- `preset_001`: 文艺青年 (INFP)
- `preset_002`: 科技极客 (INTP)
- `preset_003`: 运动爱好者 (ESFP)
- `preset_004`: 艺术创作者 (ENFP)
- `preset_005`: 美食探索家 (ISFP)
- `preset_006`: 哲学思考者 (INFJ)

---

## API 文档

### 用户管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/login` | POST | 用户登录（支持访客模式） |
| `/api/register` | POST | 用户注册 |
| `/api/logout` | POST | 用户退出登录 |
| `/api/user/me` | GET | 获取当前用户信息 |

### Agent 管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/create-user-agent` | POST | 创建用户 Agent |
| `/api/create-agent-from-text` | POST | 从文本创建 Agent |
| `/api/create-agent-from-file` | POST | 从文件创建 Agent |
| `/api/create-agent-from-qa` | POST | 通过问答创建 Agent |
| `/api/add-preset-npc` | POST | 添加预设 NPC |
| `/api/toggle-agent-sandbox` | POST | 切换 Agent 沙盒状态 |
| `/api/restore-user-agent` | POST | 恢复用户 Agent |

### 数字孪生

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/user/digital-twin` | POST | 创建/更新数字孪生 |
| `/api/user/digital-twin` | GET | 获取数字孪生信息 |
| `/api/generate-digital-twin-profile` | POST | 生成数字孪生完整画像 |

### 社交功能

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/get-social-story/{agent_code}` | GET | 获取社交故事（支持 hours 参数） |
| `/api/get-daily-report/{agent_code}` | GET | 获取每日报告（支持 date 参数） |
| `/api/neural-match` | POST | 神经匹配算法 |
| `/api/list-preset-agents` | GET | 列出所有预设 Agent |

### 聊天功能

| 端点 | 方法 | 说明 |
|------|------|------|
| `/ws/{client_id}` | WebSocket | WebSocket 连接（实时聊天） |
| `/api/start-1on1-chat` | POST | 启动一对一聊天 |
| `/api/clear-chat-history` | POST | 清空聊天历史 |

### 系统管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/reset-sandbox` | POST | 重置沙盒 |
| `/api/reset-all` | POST | 重置所有 |
| `/api/save-config` | POST | 保存配置 |
| `/api/list-presets` | GET | 列出所有预设 |
| `/api/load-preset` | POST | 加载预设 |

完整的 API 文档可在运行服务器后访问：http://localhost:8001/docs

---

## 项目结构

```
Soulverse/
├── data/                          # 数据目录
│   ├── preset_agents/            # 预设 Agent 数据
│   │   ├── preset_agents.json    # 预设模板 JSON
│   │   └── preset_embeddings.pkl # 预设嵌入向量
│   ├── users/                    # 用户数据目录
│   ├── roles/                    # 角色数据
│   │   ├── soulverse_npcs/      # NPC 角色
│   │   └── soulverse_users/     # 用户角色
│   ├── locations/                # 地点数据
│   ├── maps/                     # 地图数据
│   └── worlds/                   # 世界配置
│       └── soulverse_sandbox/    # Soulverse 沙盒世界
├── frontend/                      # 前端代码
│   ├── app/                      # Next.js App Router
│   │   ├── page.tsx             # 首页
│   │   ├── login/                # 登录页
│   │   └── universe/             # 主界面
│   ├── components/               # React 组件
│   │   ├── ChatInterface.jsx    # 聊天界面
│   │   ├── CreationWizard.jsx   # 创建向导
│   │   ├── NeuralMatching.jsx   # 神经匹配
│   │   ├── UserAgentStatus.jsx  # 用户 Agent 状态
│   │   └── UniverseView.jsx      # 宇宙视图
│   ├── services/                 # API 服务
│   │   └── api.js               # API 客户端
│   ├── data/                     # 前端数据
│   │   └── questionnaires.js    # 问卷数据
│   └── package.json             # 前端依赖
├── modules/                       # 核心模块
│   ├── core/                     # 核心工具
│   ├── db/                       # 数据库模块
│   │   ├── BaseDB.py           # 数据库基类
│   │   └── ChromaDB.py          # ChromaDB 实现
│   ├── llm/                      # LLM 适配器
│   │   ├── BaseLLM.py           # LLM 基类
│   │   ├── OpenAI.py            # OpenAI 适配器
│   │   ├── Gemini.py            # Gemini 适配器
│   │   ├── DeepSeek.py          # DeepSeek 适配器
│   │   └── ...                   # 其他 LLM 适配器
│   ├── prompt/                   # 提示词模板
│   │   ├── orchestrator_prompt_zh.py
│   │   ├── orchestrator_prompt_en.py
│   │   ├── performer_prompt_zh.py
│   │   └── performer_prompt_en.py
│   ├── user_agent.py            # 用户 Agent 类
│   ├── npc_agent.py             # NPC Agent 类
│   ├── orchestrator.py          # 指挥家类
│   ├── main_performer.py        # 表演者基类
│   ├── personality_model.py     # 三层人格模型
│   ├── soulverse_mode.py        # Soulverse 模式逻辑
│   ├── social_story_generator.py # 社交故事生成器
│   ├── daily_report.py          # 每日报告生成器
│   ├── preset_agents.py         # 预设 Agent 管理
│   └── profile_extractor.py     # 画像提取器
├── experiment_presets/           # 实验预设配置
│   ├── soulverse_sandbox.json   # Soulverse 沙盒预设
│   └── soulverse_1on1.json     # 一对一对话预设
├── extract_data/                 # 数据提取工具
│   ├── extract_data.py          # 提取角色和地点
│   ├── extract_settings.py      # 提取世界设定
│   └── extract_config.json      # 提取配置
├── ScrollWeaver.py              # ScrollWeaver 核心引擎
├── server.py                     # FastAPI 服务器
├── config.json                   # 配置文件
├── requirements.txt              # Python 依赖
├── Dockerfile                    # Docker 配置
└── README.md                     # 本文档
```

---

## 核心概念

### 三层人格模型

Soulverse 采用创新的三层人格模型来构建 Agent 的个性：

1. **内核层（Core Layer）**
   - MBTI 类型
   - 大五人格（Big Five）
   - 价值观（Values）
   - 防御机制（Defense Mechanisms）

2. **表象层（Surface Layer）**
   - 语言风格矩阵
     - 句长偏好（短句/中句/长句）
     - 词汇等级（学术/口语/网络用语）
     - 标点习惯（少用/标准/频繁）
     - 表情使用频率
   - 口头禅列表
   - Few-Shot 样本

3. **记忆层（Memory Layer）**
   - 动态状态（心情、能量值）
   - 关系映射（与其他 Agent 的关系）
   - 长期记忆（ChromaDB 向量存储）
   - 短期记忆（最近互动）

### ScrollWeaver 架构

ScrollWeaver 是多智能体模拟的核心引擎：

- **Server**: 系统服务器，管理所有 Agent 和世界状态
- **Orchestrator**: 世界指挥家，负责场景调度、事件生成
- **Performer**: 表演者基类，所有 Agent 的父类
  - **UserAgent**: 用户 Agent，基于兴趣图谱
  - **NPCAgent**: NPC Agent，预设模板或动态创建
- **HistoryManager**: 历史管理器，记录所有互动
- **TimeSimulator**: 时间模拟器（默认 60 倍速：1 分钟 = 1 小时）

### Soulverse 模式

Soulverse 模式是专为社交沙盒设计的模式：

- **强制启用**：系统默认启用 Soulverse 模式
- **动态 Agent**：所有 Agent 通过 API 动态添加
- **社交场景**：基于兴趣生成社交场景事件
- **社交动机**：基于社交目标和兴趣生成动机（非剧本）
- **持续运行**：支持长期运行（100+ 轮次）

---

## 自定义与扩展

### 创建自定义预设 Agent

1. 编辑 `data/preset_agents/preset_agents.json`
2. 添加新的预设模板：

```json
{
    "id": "preset_007",
    "name": "自定义名称",
    "icon": "🎨",
    "description": "描述",
    "interests": ["兴趣1", "兴趣2"],
    "mbti": "ENFP",
    "personality": "人格描述",
    "social_goals": ["社交目标1"],
    "big_five": {
        "openness": 0.8,
        "conscientiousness": 0.6,
        "extraversion": 0.7,
        "agreeableness": 0.8,
        "neuroticism": 0.4
    },
    "values": ["价值1", "价值2"],
    "defense_mechanism": "Sublimation"
}
```

3. 通过 API 创建：

```bash
POST /api/add-preset-npc
{
    "preset_id": "preset_007"
}
```

### 添加新的 LLM 适配器

1. 在 `modules/llm/` 目录创建新文件
2. 继承 `BaseLLM` 类
3. 实现必要的方法
4. 在 `sw_utils.py` 的 `get_models()` 函数中注册

### 自定义世界设定

1. 编辑 `data/worlds/soulverse_sandbox/general.json`
2. 修改世界描述、规则等
3. 重启服务器

---

## 测试

### 运行测试脚本

```bash
python test_soulverse.py
```

### 测试场景

1. **基础社交互动**：创建两个兴趣相似的用户 Agent，观察他们在咖啡馆相遇并建立联系
2. **不同兴趣 Agent 探索**：创建三个兴趣不同的 Agent，观察他们在不同场景中的探索和互动
3. **社交故事生成**：运行模拟后，为特定 Agent 生成社交故事和每日报告

### 验证要点

1. **Soulverse 模式检测**：确认 `scrollweaver.server.is_soulverse_mode == True`
2. **动机生成**：确认 UserAgent 的动机包含社交目标
3. **Agent 行为**：确认 Agent 基于兴趣选择场景并积极互动
4. **社交故事**：确认故事聚焦社交互动并包含准确的统计数据

---

## 常见问题

### Q: Agent Code 必须唯一吗？

A: 是的，Agent Code 必须全局唯一。如果创建时使用已存在的 Code，会返回错误。

### Q: 时间加速比例是多少？

A: 默认是 60 倍速，即 1 实际分钟 = 1 虚拟小时。可在 `TimeSimulator` 中修改。

### Q: 支持多用户吗？

A: 是的，多个用户 Agent 可以在同一个沙盒中互动。

### Q: 数据会持久化保存吗？

A: 当前版本数据会保存到 `data/` 目录，但重启后需要重新加载。生产环境建议使用数据库。

### Q: 如何切换 LLM 模型？

A: 修改 `config.json` 中的 `role_llm_name` 和 `world_llm_name`，并确保对应的 API Key 已配置。

### Q: WebSocket 连接失败怎么办？

A: 检查后端服务器是否正常运行，端口是否正确，以及防火墙设置。

---

## 已知问题与改进计划

### 高优先级

- [ ] 模式状态显示：在界面顶部显示当前模式（观察者/灵魂降临）
- [ ] Agent 创建后自动刷新：角色列表自动更新
- [ ] 时间控制面板：添加时间加速和暂停功能

### 中优先级

- [ ] 社交故事时间线视图：更友好的显示方式
- [ ] 模式切换优化：更流畅的切换体验
- [ ] Agent 创建流程优化：自动生成 Code 和预览

### 低优先级

- [ ] 关系网络可视化：社交网络图
- [ ] 实时通知系统：推送重要事件
- [ ] 数据分析面板：更深入的统计和分析

---

## 贡献指南

我们欢迎所有形式的贡献！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 作者与引用

**作者**: Yiting Ran, Xintao Wang, Tian Qiu, Jiaqing Liang, Yanghua Xiao, Deqing Yang

**论文引用**:

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

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

---

## 联系方式

Soulverse 是一个基础框架，我们致力于持续优化和丰富自定义模块。我们非常欢迎您的建议和贡献！

如有任何建议或想要贡献，请联系我们：**alienet1109@163.com**

---

## 致谢

- [ScrollWeaver](https://github.com/Jinqitrip/Soulverse) - 多智能体模拟引擎
- [FastAPI](https://fastapi.tiangolo.com/) - 现代 Web 框架
- [Next.js](https://nextjs.org/) - React 框架
- [Three.js](https://threejs.org/) - 3D 图形库
- [ChromaDB](https://www.trychroma.com/) - 向量数据库

---

<div align="center">

**准备好开启你的平行人生了吗？** 🚀

[开始使用](#快速开始) | [查看文档](#使用指南) | [贡献代码](#贡献指南)

</div>
