# 动态对话者模拟实验包 (Dynamic Interlocutor Simulation Package)

## 简介

本实验包实现了论文中提到的"交互对象模拟"（Interlocutor Simulation）功能，使用模型动态生成对话者回复，替代静态提示列表，以更好地测试角色的长对话稳定性和"长对话漂移"（Long-Dialogue Drift）现象。

## 核心特性

- ✅ **动态对话者生成**：使用本地模型（Qwen2.5-7B）动态生成对话者回复
- ✅ **话题转换控制**：在关键轮次（5、15、20、25）引入话题转换或冲突
- ✅ **上下文感知**：基于对话历史生成自然的后续问题或回应
- ✅ **角色一致性**：生成的回复符合对话者的性格特点
- ✅ **双模式支持**：支持静态提示列表和动态生成两种模式

## 文件结构

```
interlocutor_simulation_package/
├── README.md                          # 本文件
├── run_long_dialogue_4way.py         # 核心实验脚本
├── requirements.txt                   # Python 依赖
└── INTERLOCUTOR_SIMULATION.md         # 详细技术文档
```

## 环境要求

### Python 依赖

```bash
pip install -r requirements.txt
```

主要依赖：
- `torch>=2.0.0`
- `transformers>=4.30.0`
- `peft>=0.4.0`

### 硬件要求

- GPU（用于运行 Qwen2.5-7B 模型）
- 建议显存：至少 16GB

### 模型要求

- 基础模型：`Qwen/Qwen2.5-7B-Instruct`（会自动从 HuggingFace 下载）
- SFT 适配器：可选，如果使用 GroupD_SFT 组，需要提供适配器路径

## 快速开始

### 1. 基本使用（静态模式）

```bash
python run_long_dialogue_4way.py \
    --groups GroupC_StructuredPrompt \
    --chars LinDaiyu \
    --turns 30
```

### 2. 使用动态对话者模拟（推荐）

```bash
python run_long_dialogue_4way.py \
    --groups GroupC_StructuredPrompt \
    --chars LinDaiyu \
    --turns 30 \
    --dynamic-interlocutor
```

### 3. 批量运行多个角色

```bash
python run_long_dialogue_4way.py \
    --groups GroupC_StructuredPrompt \
    --chars LinDaiyu,WangXifeng,JiaBaoyu \
    --turns 30 \
    --dynamic-interlocutor
```

## 实验配置

### 4个模型组

1. **GroupA_ZeroShot**: 零样本基线（最小提示词）
2. **GroupB_SimplePrompt**: 简单提示词（角色简介）
3. **GroupC_StructuredPrompt**: 结构化提示词（心理学驱动，包含双系统处理）⭐ **推荐**
4. **GroupD_SFT**: SFT微调模型（需要提供适配器路径）

### 测试角色

- **红楼梦**: LinDaiyu（林黛玉）、JiaBaoyu（贾宝玉）、WangXifeng（王熙凤）、XueBaochai（薛宝钗）
- **三国演义**: ZhugeLiang（诸葛亮）、CaoCao（曹操）、GuanYu（关羽）、ZhouYu（周瑜）
- **冰与火之歌**: TyrionLannister（提利昂）、JonSnow（琼恩·雪诺）

### 关键轮次设置

在30轮对话中，动态对话者会在以下轮次引入话题转换或冲突：
- **第5轮**：引入新话题或轻微挑战
- **第15轮**：转换话题或提出深入思考的问题
- **第20轮**：触及敏感点或质疑之前的内容
- **第25轮**：更具挑战性的问题或引发强烈情感的话题

## 输出结果

### 结果文件位置

结果保存在 `results/` 目录下，文件命名格式：
```
results/{group}_{character}.json
```

例如：`results/GroupC_StructuredPrompt_LinDaiyu.json`

### 结果格式

```json
{
  "group": "GroupC_StructuredPrompt",
  "char": "LinDaiyu",
  "interlocutor": "贾宝玉",
  "interlocutor_key": "JiaBaoyu",
  "use_dynamic_interlocutor": true,
  "logs": [
    {
      "turn": 5,
      "type": "topic_shift",
      "is_critical": true,
      "trigger_reason": "keyword_hit",
      "input": "（对话者生成的输入）",
      "response": "（角色生成的回复）",
      "monologue": "（内心独白，仅GroupC）",
      "mood": "melancholy",
      "energy": 65,
      "dynamic_generated": true,
      "topic_shift": true
    }
  ]
}
```

### 关键字段说明

- `use_dynamic_interlocutor`: 是否使用动态对话者模拟
- `dynamic_generated`: 该轮输入是否由动态生成（而非静态提示）
- `topic_shift`: 是否为话题转换轮次
- `monologue`: 内心独白（仅 GroupC_StructuredPrompt 组）
- `mood`, `energy`: 动态状态（仅 GroupC_StructuredPrompt 组）

## 命令行参数

```bash
python run_long_dialogue_4way.py [OPTIONS]

选项:
  --groups GROUPS          模型组，多个用逗号分隔
                          可选: GroupA_ZeroShot, GroupB_SimplePrompt, 
                                GroupC_StructuredPrompt, GroupD_SFT
  
  --chars CHARS           角色名称，多个用逗号分隔
                          例如: LinDaiyu,WangXifeng
  
  --turns TURNS           对话轮数（默认: 30）
  
  --dynamic-interlocutor  启用动态对话者模拟（推荐）
                          如果未指定，使用静态提示列表
```

## 代码修改说明

### 核心类：InterlocutorSimulator

位置：`run_long_dialogue_4way.py` 第 353-519 行

主要功能：
- 根据对话历史和角色回复动态生成对话者输入
- 在关键轮次引入话题转换或冲突
- 保持对话者角色一致性

### 集成点

1. **初始化**（第 777-784 行）：
   ```python
   if use_dynamic_interlocutor and interlocutor_key:
       interlocutor_simulator = InterlocutorSimulator(...)
   ```

2. **场景生成**（第 786-800 行）：
   - 动态模式：第一轮使用初始提示，后续动态生成
   - 静态模式：使用预定义提示列表

3. **主循环**（第 842-850 行）：
   ```python
   if scene.get("dynamic", False) and interlocutor_simulator:
       prompt, is_topic_shift = interlocutor_simulator.generate_response(...)
   ```

## 注意事项

1. **计算开销**：动态生成会增加模型调用次数（每轮额外1次），总调用次数约为静态模式的2倍
2. **质量保证**：生成的回复质量依赖于基础模型（Qwen2.5-7B）的能力
3. **备用机制**：如果生成失败，会自动使用备用静态回复
4. **显存占用**：确保有足够的显存加载模型（建议16GB+）

## 与论文的对应关系

本实现对应论文中的"交互对象模拟"（Interlocutor Simulation）部分：

- **论文方法**：使用 Gemini 2.5 Flash 扮演中立提问者，在第 15、30、45 轮动态引入话题转换或冲突
- **本实现**：使用 Qwen2.5-7B 本地模型，在第 5、15、20、25 轮引入话题转换或冲突（适配30轮对话）

## 常见问题

### Q: 如何知道是否使用了动态对话者？

A: 检查结果 JSON 文件中的 `use_dynamic_interlocutor` 字段，以及 `logs` 中每轮的 `dynamic_generated` 字段。

### Q: 动态模式和静态模式的区别？

A: 
- **静态模式**：使用预定义的 `stress_prompts` 和 `casual_prompts` 列表
- **动态模式**：对话者根据角色回复和历史动态生成输入

### Q: 可以自定义关键轮次吗？

A: 可以，修改 `InterlocutorSimulator` 类的 `self.critical_turns` 属性（第 364 行）。

### Q: 如何添加新的角色？

A: 在 `CHARACTER_PROFILES` 字典中添加角色配置（第 60-301 行），包括角色信息、性格档案、压力提示和日常提示。

## 引用

如果使用本代码，请引用相关论文。

## 许可证

请参考原项目许可证。

## 联系方式

如有问题或建议，请提交 Issue 或联系项目维护者。

