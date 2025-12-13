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
    2.  **软性控场 (The Host)**: 在"垃圾时间"填补环境描写，维持氛围。
    3.  **情感锚点**: 为 AI Performer 提供更有张力的 Input，激发更真实的情绪反应。

*   **优化策略: 混合模式 (Hybrid Orchestrator)**
    *   为了解决延迟和成本，O 将分为两类操作：
    *   **Templated (模板化)**: 对于重复性高、无叙事需求的指令（如"请发言"），由 A 直接分发预设文本，**绕过 LLM**。
    *   **LLM-Driven (大模型驱动)**: 仅在**关键节点**（开场、死亡、结局、日夜切换）介入，进行高成本的文学渲染。

#### Performer (P)
*   **性质**: LLM Wrapper (Agent)。
*   **职责**: 玩游戏。接收 O 的公开信息，结合自己的私密身份 (如狼人) 进行思考 (Think) 和行动 (Act)。

---

## 2. 页面流与交互设计 (UI/UX Flow)

### 2.1 广场页优化 (Plaza)
*   **新增入口**: 在现有卡片旁增加"**雅集·博弈**"入口。
*   **视觉**: 保持米色宣纸质感，雅集入口采用深紫色或朱砂红点缀，图标为"棋盘"或"灯笼"。

### 2.2 全新：书卷前言页 (The Prologue / Intro Page)
用户点击任意书卷或游戏后，不再直接开始，而是进入此缓冲页。

*   **布局**: 左右分栏或中心聚焦。
*   **展示信息**:
    *   **世界观摘要**: 当前选定剧本的简介。
    *   **登场人物**: 卡牌展示，支持用户勾选"陪玩"角色（可选）。
    *   **历史进度**: 时间轴展示已生成的"幕 (Act)"。
*   **操作入口 (Mode Selection)**:
    1.  **[私语]**: 下拉选择一名角色进入 P 模式。
    2.  **[入卷]**: 选择"第 N 幕"或"新建一幕"进入 O-P 模式。
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
    *   用户在"前言页"选择进入某一幕。
    *   在故事进行中，用户可点击"**下一幕**"，触发总结机制，归档当前上下文，开启新的一章，防止 Context Window 溢出。

### 2.5 创作与共享生态 (Creation & Sharing)
*   **造办处 (The Workshop)**:
    *   **快速制作**: 输入一句话描述（"赛博朋克版红楼梦"），调用 `Gemini-3-Pro` 自动生成完整的 World + Roles 配置。
    *   **自主制作**: 保留现有的详细表单填写模式。
*   **藏书阁 (The Library)**:
    *   **书卷包 (Scroll Package)**: 包含 `World Config` + `Role Cards` + `Event Chain Script` 的完整数据包。
    *   **共享模式**: 支持引用 (Reference/Fork) 和快照 (Snapshot)。
    *   **推荐逻辑**: 优先推荐官方内置 > 社区高赞 > 用户自定义创建。

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
*   **原理**: Performer 在说话前，先进行一轮"心理活动"。
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

### Phase 1: 地基重构 (Foundation) ✅ **已完成**

#### 1.1 依赖管理
- [x] 在 `requirements.txt` 中添加 `python-socketio[asyncio]` 依赖

#### 1.2 核心架构
- [x] 创建 `modules/core/sessions.py`:
  - [x] `BaseSession` 抽象基类（定义通用接口）
  - [x] `ChatSession` (P 模式) - 1v1 聊天会话
  - [x] `StorySession` (O-P 模式) - 故事生成会话
  - [x] `GameSession` (A-O-P 模式) - 游戏会话
  - [x] `SessionManager` 会话管理器（房间管理、用户会话追踪）

#### 1.3 Socket.IO 集成
- [x] 创建 `modules/core/socketio_manager.py`:
  - [x] `SocketIOManager` 类实现
  - [x] 连接/断开事件处理
  - [x] 房间加入/离开逻辑
  - [x] 消息路由和广播机制

#### 1.4 服务器集成
- [x] 在 `server.py` 中集成 Socket.IO 管理器
- [x] 添加新 API 端点:
  - [x] `GET /api/scroll/{scroll_id}` - 获取书卷详情（用于 intro 页）
  - [x] `GET /api/scroll/{scroll_id}/characters` - 获取角色列表
  - [x] `GET /api/scroll/{scroll_id}/history` - 获取历史进度
  - [x] `POST /api/game/create-room` - 创建游戏房间
  - [x] `GET /api/game/join-room/{room_code}` - 加入游戏房间

#### 1.5 前端页面
- [x] 创建 `frontend/pages/intro.html` - 书卷前言页
- [x] 创建 `frontend/css/pages/intro.css` - 样式文件
- [x] 创建 `frontend/js/intro.js` - 交互逻辑
- [x] 实现三种模式选择入口（私语/入卷/组局）
- [x] 实现角色卡牌展示和选择
- [x] 实现历史进度时间轴展示

#### 1.6 私语模式 (P Mode) 实现
- [x] 创建 `modules/chat/chat_performer.py` - 聊天角色扮演核心逻辑
- [x] 实现 System Prompt 构建（参考 SillyTavern）
- [x] 实现 World Info、Memory、Authors Note 扩展提示词支持
- [x] 创建 `frontend/pages/chat.html` - 聊天页面
- [x] 创建 `frontend/css/pages/chat.css` - 聊天样式
- [x] 创建 `frontend/js/chat.js` - 聊天交互逻辑
- [x] 添加聊天 API 端点（创建会话、发送消息、获取历史、更新扩展提示词）

---

### Phase 2: 智能体升级 (Brain Upgrade) ✅ **已完成**

#### 2.1 动机生成系统
- [x] 创建 `modules/utils/motivation_generator.py`:
  - [x] 实现 `MotivationGenerator` 类
  - [x] 集成 Gemini-2.5-Pro API 接口
  - [x] 实现批量角色动机生成功能
  - [x] 支持从预设文件读取角色和世界观信息
  - [x] 将生成的动机写入角色 JSON 文件的 `hidden_motivation` 字段

#### 2.2 思考链实现
- [x] 修改 `modules/main_performer.py`:
  - [x] 实现 `think()` 方法 - 内部思考步骤
  - [x] 修改 `plan()` 方法支持思考链的两阶段流程
  - [x] 实现思考结果的 JSON 结构化输出（使用 `ThoughtChain` 模型）
  - [x] 将思考结果存入角色的短期记忆向量库
  - [x] 添加思考链 prompt（中英文版本）

#### 2.3 数据结构升级
- [x] 升级角色 JSON 结构:
  - [x] 添加 `hidden_motivation` 字段（动机预设）- 在 `_init_from_file` 中加载
  - [x] 思考链历史通过 `memory.add_record()` 存入向量库
  - [x] 计划信息通过思考链的 `plan` 字段存储
- [x] 升级书卷 JSON 结构:
  - [x] 事件链生成器支持 `acts` 数组（分幕信息）
  - [x] 事件链生成器支持 `event_chain` 对象（预设事件链）
  - [x] 事件链包含 `current_act` 相关信息

#### 2.4 事件链生成引擎
- [x] 创建 `modules/utils/event_chain_generator.py`:
  - [x] 实现 `EventChainGenerator` 类
  - [x] 集成 Gemini-2.5-Pro API 接口（支持 gemini-3-pro 当可用时）
  - [x] 实现基于用户描述生成事件链的功能
  - [x] 支持 3/5/8/10 幕的生成
  - [x] 实现事件链的编辑和保存功能（`save_event_chain`、`load_event_chain`）
  - [x] 支持 JSON 格式的事件链数据

#### 2.5 快速制作书卷功能
- [x] 创建 `modules/utils/fast_scroll_generator.py`:
  - [x] 实现 `FastScrollGenerator` 类
  - [x] 集成 Gemini-2.5-Pro API 接口（支持 gemini-3-pro 当可用时）
  - [x] 实现从用户描述生成完整书卷配置的功能
  - [x] 自动生成世界观、角色、地点等配置
  - [x] 实现配置保存功能（`save_scroll_config`）
  - [ ] 在 `server.py` 中添加 `/api/scrolls/fast-create` 端点（待 Phase 4 集成）

---

### Phase 3: 雅集博弈实现 (The Game) 📋 **待开始**

#### 3.1 Administrator 实现
- [ ] 创建 `modules/game_logic/` 目录
- [ ] 创建 `modules/game_logic/base_admin.py`:
  - [ ] 实现 `BaseAdministrator` 抽象基类
  - [ ] 定义游戏状态管理接口
  - [ ] 定义游戏流程控制接口
- [ ] 创建 `modules/game_logic/werewolf_admin.py`:
  - [ ] 实现 `WerewolfAdministrator` 类
  - [ ] 实现狼人杀标准规则状态机
  - [ ] 实现角色分配逻辑（狼人/村民/预言家/女巫/猎人等）
  - [ ] 实现夜晚阶段处理（狼人杀人、预言家查验、女巫用药）
  - [ ] 实现白天阶段处理（讨论、投票、处决）
  - [ ] 实现胜负判定逻辑
  - [ ] 实现游戏状态序列化和反序列化

#### 3.2 Orchestrator 适配
- [ ] 修改 `modules/orchestrator.py`:
  - [ ] 添加 `render_game_state()` 方法 - 将游戏状态转化为叙事文本
  - [ ] 实现混合模式（模板化 + LLM 驱动）
  - [ ] 实现关键节点的文学渲染（开场、死亡、结局）
  - [ ] 实现 A-O 通信协议接口
- [ ] 创建 `modules/game_logic/game_orchestrator.py`:
  - [ ] 实现游戏专用的 Orchestrator 包装类
  - [ ] 处理游戏事件的叙事渲染

#### 3.3 Performer 游戏适配
- [ ] 修改 `modules/main_performer.py`:
  - [ ] 添加游戏模式下的特殊处理逻辑
  - [ ] 实现接收私密身份信息（如狼人身份）
  - [ ] 实现游戏决策生成（投票、杀人、查验等）
  - [ ] 实现游戏发言生成（基于身份和策略）

#### 3.4 前端游戏界面
- [ ] 创建 `frontend/pages/game_room.html`:
  - [ ] 实现圆桌布局（玩家围坐）
  - [ ] 实现玩家头像和状态显示
  - [ ] 实现游戏阶段指示器（白天/黑夜/投票）
  - [ ] 实现操作按钮（查验/投票/跳过等）
  - [ ] 实现消息气泡显示（玩家发言）
  - [ ] 实现投票界面和结果展示
- [ ] 创建 `frontend/css/pages/game_room.css` - 游戏界面样式
- [ ] 创建 `frontend/js/game_room.js`:
  - [ ] 实现 Socket.IO 客户端连接
  - [ ] 实现游戏状态同步
  - [ ] 实现用户操作处理（投票、发言等）
  - [ ] 实现实时消息更新

#### 3.5 游戏会话集成
- [ ] 完善 `modules/core/sessions.py` 中的 `GameSession`:
  - [ ] 实现 `initialize()` 方法 - 初始化游戏
  - [ ] 实现 `process_message()` 方法 - 处理游戏消息
  - [ ] 集成 Administrator、Orchestrator、Performer
  - [ ] 实现游戏流程控制

---

### Phase 4: 整合与多用户联调 (Integration) 📋 **待开始**

#### 4.1 多用户联机功能
- [ ] 完善 Socket.IO 房间管理:
  - [ ] 实现房间状态同步（玩家加入/离开）
  - [ ] 实现消息广播机制
  - [ ] 实现断线重连处理
  - [ ] 实现房间权限管理（房主权限）
- [ ] 在 `StorySession` 中实现多用户支持:
  - [ ] 实现多用户同时参与故事生成
  - [ ] 实现用户输入队列管理
  - [ ] 实现角色分配和切换

#### 4.2 分幕系统完善
- [ ] 实现分幕数据持久化:
  - [ ] 在数据库中创建 `acts` 表
  - [ ] 实现幕的保存和加载
  - [ ] 实现幕的总结和归档
- [ ] 完善前端分幕切换:
  - [ ] 在故事页面添加分幕选择器
  - [ ] 实现幕的加载和显示
  - [ ] 实现"下一幕"按钮和自动归档

#### 4.3 造办处与藏书阁
- [ ] 创建 `frontend/pages/workshop.html`:
  - [ ] 实现快速制作界面（输入描述，一键生成）
  - [ ] 实现自主制作界面（详细表单）
  - [ ] 实现生成进度显示
- [ ] 创建 `frontend/pages/library.html`:
  - [ ] 实现书卷列表展示（官方/社区/用户）
  - [ ] 实现搜索和筛选功能
  - [ ] 实现书卷详情页（预览、点赞、Fork）
  - [ ] 实现书卷分享功能
- [ ] 在 `server.py` 中添加相关 API:
  - [ ] `POST /api/scrolls/fast-create` - 快速创建书卷
  - [ ] `GET /api/library/scrolls` - 获取藏书阁列表
  - [ ] `POST /api/library/scrolls/{scroll_id}/fork` - Fork 书卷
  - [ ] `POST /api/library/scrolls/{scroll_id}/share` - 分享书卷

#### 4.4 事件链预设功能
- [ ] 在 intro.html 中完善事件链设置:
  - [ ] 实现事件链生成界面（选择幕数、生成）
  - [ ] 实现事件链预览和编辑界面
  - [ ] 实现事件链保存和加载
- [ ] 在 `StorySession` 中集成事件链:
  - [ ] 实现按照事件链引导剧情
  - [ ] 实现事件链的检查和更新

#### 4.5 UI/UX 统一优化
- [ ] 统一视觉风格:
  - [ ] 统一字体（Noto Serif SC）
  - [ ] 统一配色方案（米色/棕色/朱砂红）
  - [ ] 统一按钮样式（古风印章/玉佩风格）
  - [ ] 统一加载动画（毛笔/墨水效果）
- [ ] 优化交互体验:
  - [ ] 添加页面过渡动画
  - [ ] 优化移动端适配
  - [ ] 添加错误提示和用户反馈
  - [ ] 实现离线状态检测

#### 4.6 测试与优化
- [ ] 单元测试:
  - [ ] Session 类测试
  - [ ] Administrator 逻辑测试
  - [ ] 动机生成测试
- [ ] 集成测试:
  - [ ] 多用户游戏流程测试
  - [ ] 事件链生成和使用测试
  - [ ] Socket.IO 连接稳定性测试
- [ ] 性能优化:
  - [ ] LLM 调用优化（缓存、批处理）
  - [ ] 数据库查询优化
  - [ ] 前端资源加载优化

---

## 5. 技术债务与注意事项

### 5.1 向后兼容
- 保留现有的 WebSocket 端点 (`/ws/{client_id}`) 以支持旧版客户端
- 逐步迁移现有功能到新的 Session 架构

### 5.2 性能考虑
- Socket.IO 连接池管理
- LLM API 调用频率限制和缓存策略
- 数据库连接池优化

### 5.3 安全性
- 用户认证和授权
- 房间访问控制
- API 请求频率限制
- 输入验证和 XSS 防护

---

## 6. 里程碑与验收标准

### Phase 1 验收标准 ✅
- [x] 三种 Session 类可以正常创建和初始化
- [x] Socket.IO 连接和房间管理正常工作
- [x] intro.html 页面可以正常访问和交互
- [x] API 端点可以正常响应请求

### Phase 2 验收标准
- [ ] 可以成功为角色生成隐藏动机并保存
- [ ] Performer 可以实现思考链并生成基于思考的对话
- [ ] 可以成功生成事件链（3/5/8/10 幕）
- [ ] 快速制作功能可以生成完整的书卷配置

### Phase 3 验收标准
- [ ] 可以成功创建和加入游戏房间
- [ ] 狼人杀游戏可以完整运行一局（包含所有阶段）
- [ ] 游戏状态可以正确同步到所有玩家
- [ ] 游戏界面可以正常显示和交互

### Phase 4 验收标准
- [ ] 多用户可以同时参与故事生成
- [ ] 分幕系统可以正常保存和加载
- [ ] 造办处和藏书阁功能完整可用
- [ ] 全站 UI/UX 统一且流畅
