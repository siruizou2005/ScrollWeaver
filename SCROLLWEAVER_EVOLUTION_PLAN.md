# ScrollWeaver 项目演进设计文档：雅集与博弈

**项目新口号**: 编织书卷，博弈古今 (Weaving Scrolls, Gaming with History)
**版本目标**: 从单一的故事生成工具进化为集角色扮演、故事编织、社交博弈于一体的沉浸式 AI 平台。

---

## 1. 核心架构重构 (Architecture Refactoring)

为了支持多样化的互动模式，系统将从单一的 `O-P` (Orchestrator-Performer) 架构重构为支持三种模式的混合架构。

### 1.1 三种架构模式定义

| 模式代号 | 名称 | 适用场景 | 核心逻辑 | 角色构成 |
| :--- | :--- | :--- | :--- | :--- |
| **P Mode** | **私密晤谈 (Soliloquy)** | 1v1 聊天、心理咨询、角色攻略 | 直接对话，无旁白干扰。 | **Performer**: 目标角色<br>**User**: 用户 |
| **O-P Mode** | **入卷同游 (Saga)** | 现有的跑团、故事生成、多角色群聊 | AI 编导控制剧情走向，角色自由发挥。 | **Orchestrator**: 编导 (上帝)<br>**Performer(s)**: NPC<br>**User**: 主角 |
| **A-O-P Mode** | **雅集博弈 (Arena)** | 狼人杀、谁是卧底、规则类卡牌游戏 | 代码控制硬规则，AI 负责演绎和推理。 | **Administrator**: 规则执行官 (代码)<br>**Orchestrator**: 主持人 (描述者)<br>**Performer(s)**: 玩家 (AI)<br>**User**: 玩家 (人) |

### 1.2 A-O-P 详细工作流与 O 的职能重定义

#### Administrator (A)
*   **性质**: 纯 Python 类 (State Machine)，**不使用 LLM**。
*   **职责**: 维护游戏状态 (State Keeping)。记录谁是狼人、谁死了、票数统计、胜负判定。
*   **输出**: 结构化指令，如 `{"event": "night_results", "dead": ["PlayerA"], "win": null}`。

#### Orchestrator (O) 的定位调整
虽然 A 可以直接通知 P，但 ScrollWeaver 必须保留 O 以维持世界观沉浸感。
*   **性质**: LLM Wrapper + 模板引擎。
*   **核心职责**:
    1.  **世界观渲染 (The Renderer)**: 将 A 的枯燥状态 (e.g., "Player dies") 翻译为符合《红楼梦》或《冰与火之歌》风格的文学叙事。
    2.  **软性控场 (The Host)**: 在“垃圾时间”填补环境描写，维持氛围。
    3.  **情感锚点**: 为 AI Performer 提供更有张力的 Input，激发更真实的情绪反应。

*   **优化策略: 混合模式 (Hybrid Orchestrator)**
    *   为了解决延迟和成本，O 将分为两类操作：
    *   **Templated (模板化)**: 对于重复性高、无叙事需求的指令（如“请发言”），由 A 直接分发预设文本，**绕过 LLM**。
    *   **LLM-Driven (大模型驱动)**: 仅在**关键节点**（开场、死亡、结局、日夜切换）介入，进行高成本的文学渲染。

#### Performer (P)
*   **性质**: LLM Wrapper (Agent)。
*   **职责**: 玩游戏。接收 O 的公开信息，结合自己的私密身份 (如狼人) 进行思考 (Think) 和行动 (Act)。

---

## 2. 页面流与交互设计 (UI/UX Flow)

### 2.1 广场页优化 (Plaza)
*   **新增入口**: 在现有卡片旁增加“**雅集·博弈**”入口。
*   **视觉**: 保持米色宣纸质感，雅集入口采用深紫色或朱砂红点缀，图标为“棋盘”或“灯笼”。

### 2.2 全新：书卷前言页 (The Prologue / Intro Page)
用户点击任意书卷或游戏后，不再直接开始，而是进入此缓冲页。

*   **布局**: 左右分栏或中心聚焦。
*   **展示信息**:
    *   **世界观摘要**: 当前选定剧本的简介。
    *   **登场人物**: 卡牌展示，支持用户勾选“陪玩”角色（可选）。
    *   **历史进度**: 时间轴展示已生成的“幕 (Act)”。
*   **操作入口 (Mode Selection)**:
    1.  **[私语]**: 下拉选择一名角色进入 P 模式。
    2.  **[入卷]**: 选择“第 N 幕”或“新建一幕”进入 O-P 模式。
    3.  **[组局]**: 创建/加入房间，进入 A-O-P 模式 (仅限游戏剧本)。

### 2.3 游戏大厅与多用户支持 (Multiplayer Lobby)
*   **房间机制**: 基于 WebSocket/Socket.IO 的房间管理。
*   **界面**:
    *   **圆桌视图**: 屏幕中央为圆桌，用户在正下方，AI 与其他玩家围坐。
    *   **状态栏**: 顶部显示当前阶段 (白天/黑夜/投票)。
    *   **操作区**: 底部动态按钮 (查验/投票/跳过)。

### 2.4 故事阅读优化：分幕系统 (Act System)
*   **结构**: 将长故事切分为 `Act 1`, `Act 2`, `Act 3`...
*   **交互**:
    *   用户在“前言页”选择进入某一幕。
    *   在故事进行中，用户可点击“**下一幕**”，触发总结机制，归档当前上下文，开启新的一章，防止 Context Window 溢出。

### 2.5 创作与共享生态 (Creation & Sharing)
*   **造办处 (The Workshop)**:
    *   **快速制作**: 输入一句话描述（"赛博朋克版红楼梦"），调用 `Gemini-3-Pro` 自动生成完整的 World + Roles 配置。
    *   **自主制作**: 保留现有的详细表单填写模式。
*   **藏书阁 (The Library)**:
    *   **书卷包 (Scroll Package)**: 包含 `World Config` + `Role Cards` + `Event Chain Script` 的完整数据包。
    *   **共享模式**: 支持引用 (Reference/Fork) 和快照 (Snapshot)。
    *   **推荐逻辑**: 优先推荐官方内置 > 社区高赞 > 用户自定义创建。

---

## 3. 算法与智能增强 (Algorithm Enhancements)

### 3.1 全局动机预设 (Motivation Injection)
*   **触发时机**: 创建新书卷/新游戏初始化时。
*   **执行者**: 高推理模型 (如 Gemini-2.5-Pro)。
*   **流程**:
    1.  读取 `world_setting` 和 `character_profile`。
    2.  发送 Prompt: "分析 [角色名] 在 [世界] 中的深层欲望、恐惧和潜在目标，生成一段 200 字的隐藏动机。"
    3.  **存储**: 将结果存入 `data/roles/.../profile.json` 的 `<hidden_motivation>` 字段。
    4.  **应用**: 每次 Performer 加载时，将此动机作为 System Prompt 的高优先级指令。

### 3.2 动态思考链 (Chain of Thought & Planning)
*   **原理**: Performer 在说话前，先进行一轮“心理活动”。
*   **数据流**:
    1.  **Input**: O 的描述 ("轮到你发言了")。
    2.  **Internal Step (Thinking)**: 调用 LLM 生成 JSON:
        ```json
        {
          "analysis": "我是狼人，现在大家都在怀疑贾宝玉，我要顺水推舟。",
          "plan": "假装好人，踩一下贾宝玉。",
          "memory_to_save": "下一轮如果不死，通过女巫验证身份。"
        }
        ```
    3.  **External Step (Speaking)**: 基于 `plan` 生成最终对话。
    4.  **Storage**: 将 `plan` 和 `memory_to_save` 存入该角色的短期记忆向量库，供未来决策检索。

### 3.3 预设剧本与命运干预 (Scripted Events & Destiny Control)
*   **适用场景**: O-P 模式 (入卷同游)。
*   **核心流程**:
    1.  **设置**: 用户选择 `Total Acts` (3/5/8/10) 和 `Enable Multiplayer`。
    2.  **推演天机**: 调用 `Gemini-3-Pro` 生成完整的故事大纲 (Event Chain)，包含每一幕的标题、明线、暗线。
    3.  **命运干预 (God Mode)**:
        *   **开启**: 用户可预览并修改每一幕的事件摘要 (e.g., 改写结局)。
        *   **关闭**: 沉浸式体验，Orchestrator 按照既定大纲隐形引导剧情。

---

## 4. 实施路线图 (Implementation Roadmap)

### Phase 1: 地基重构 (Foundation)
1.  **后端**: 在 `server.py` 引入 `python-socketio`，建立 Room (房间) 管理机制。
2.  **核心**: 重写 `modules/`，建立 `BaseSession` 基类，派生 `ChatSession` (P), `StorySession` (OP), `GameSession` (AOP)。
3.  **前端**: 完成 `intro.html` (前言页) 的基础布局和跳转逻辑。

### Phase 2: 智能体升级 (Brain Upgrade)
1.  **脚本**: 编写 `initialize_motivations.py`，集成 Gemini-2.5 接口进行批量动机生成。
2.  **逻辑**: 修改 `main_performer.py`，实现 `Think -> Act` 的两阶段推理流程。
3.  **剧本引擎**: 实现基于 `Gemini-3-Pro` 的事件链生成与编辑功能。
4.  **数据**: 升级 JSON 数据结构，支持存储 `acts` (分幕)、`thoughts` (思考) 和 `event_chain` (预设剧本)。

### Phase 3: 雅集博弈实现 (The Game)
1.  **Admin**: 编写 `modules/game_logic/werewolf_admin.py`，实现狼人杀标准规则状态机。
2.  **Orchestrator**: 适配 A-O 接口，实现**混合模式 (Hybrid Orchestrator)**，将游戏状态转化为叙事文本。
3.  **前端**: 开发 `game_room.html`，实现圆桌布局、投票交互动画。

### Phase 4: 整合与多用户联调 (Integration)
1.  **联机**: 调试多用户同时进入同一房间的消息同步。
2.  **体验**: 优化“分幕”切换的流畅度，确保历史记录正确加载。
3.  **创作**: 开发“造办处”与“藏书阁”界面，打通“生成-分享-引用”的 UGC 链路。
4.  **UI**: 统一全站古风视觉元素 (字体、按钮、背景)。

