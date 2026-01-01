# 交互对象模拟完善方案 (Interlocutor Simulation Enhancement)

## 问题描述

### 原始问题
论文方法使用一个模拟的对话者（如 Gemini 2.5 Flash 扮演中立提问者），在第 15、30、45 轮动态引入话题转换或冲突。但代码实现中使用了预定义的静态提示列表 (`stress_prompts`, `casual_prompts`)，虽然分配了对话者 (`interlocutor_key`)，但在生成循环中并没有调用模型来生成对话者的回复，而是使用了固定题库。

### 影响
这降低了对话的动态性，可能无法完全复现论文中提到的"长对话漂移"（Long-Dialogue Drift）测试的复杂性。

## 完善方案

### 1. 核心改进：动态对话者模拟器

创建了 `InterlocutorSimulator` 类，使用模型动态生成对话者回复，替代静态提示列表。

#### 关键特性：
- **动态生成**：使用本地模型（Qwen2.5-7B）生成对话者回复
- **话题转换**：在关键轮次（5、15、20、25）引入话题转换或冲突
- **上下文感知**：基于对话历史生成自然的后续问题或回应
- **角色一致性**：生成的回复符合对话者的性格特点

### 2. 关键轮次设置

针对30轮对话，在以下轮次引入话题转换或冲突：
- **第5轮**：引入新话题或轻微挑战
- **第15轮**：转换话题或提出深入思考的问题
- **第20轮**：触及敏感点或质疑之前的内容
- **第25轮**：更具挑战性的问题或引发强烈情感的话题

### 3. 实现细节

#### InterlocutorSimulator 类

```python
class InterlocutorSimulator:
    def __init__(self, model, tokenizer, interlocutor_key, interlocutor_role_name, language="zh"):
        self.model = model
        self.tokenizer = tokenizer
        self.interlocutor_key = interlocutor_key
        self.interlocutor_role_name = interlocutor_role_name
        self.language = language
        self.critical_turns = [5, 15, 20, 25]  # 关键轮次
    
    def generate_response(self, turn_num, char_role_name, char_response, history, char_data=None):
        # 根据轮次和对话历史动态生成回复
        ...
```

#### 生成策略

1. **普通轮次**：
   - 追问细节
   - 表达好奇
   - 分享看法
   - 引入相关话题

2. **关键轮次**（5、15、20、25）：
   - 引入新话题
   - 提出质疑或挑战
   - 转换话题
   - 触及敏感点
   - 引发情感反应

### 4. 使用方法

#### 命令行参数

```bash
# 使用静态提示列表（默认）
python run_long_dialogue_4way.py --groups GroupC_StructuredPrompt --chars LinDaiyu

# 使用动态对话者模拟
python run_long_dialogue_4way.py --groups GroupC_StructuredPrompt --chars LinDaiyu --dynamic-interlocutor
```

#### 代码集成

```python
# 在 run_experiment 函数中
use_dynamic_interlocutor = True  # 启用动态对话者

# 初始化模拟器
if use_dynamic_interlocutor and interlocutor_key:
    interlocutor_simulator = InterlocutorSimulator(
        current_model, tokenizer, interlocutor_key, 
        interlocutor_role_name, lang
    )

# 在主循环中使用
if scene.get("dynamic", False) and interlocutor_simulator:
    prompt, is_topic_shift = interlocutor_simulator.generate_response(
        i, char_data["role_name"], last_response, history, char_data
    )
```

### 5. 输出格式

结果 JSON 文件中新增字段：
- `use_dynamic_interlocutor`: 是否使用动态对话者
- `dynamic_generated`: 该轮是否由动态生成
- `topic_shift`: 是否为话题转换轮次

示例：
```json
{
  "group": "GroupC_StructuredPrompt",
  "char": "LinDaiyu",
  "use_dynamic_interlocutor": true,
  "logs": [
    {
      "turn": 5,
      "dynamic_generated": true,
      "topic_shift": true,
      "input": "（动态生成的对话者回复）",
      "response": "（角色回复）"
    }
  ]
}
```

## 优势

1. **动态性**：对话不再局限于预定义提示，能够根据上下文动态调整
2. **真实性**：更接近真实对话场景，对话者会根据角色回复做出自然反应
3. **可控性**：在关键轮次引入话题转换，测试角色的长对话稳定性
4. **可复现性**：使用本地模型，不依赖外部 API，结果可复现

## 注意事项

1. **计算开销**：动态生成会增加模型调用次数（每轮额外1次）
2. **质量保证**：生成的回复质量依赖于基础模型的能力
3. **备用机制**：如果生成失败，会自动使用备用静态回复

## 未来改进方向

1. **多轮规划**：对话者可以提前规划多轮对话策略
2. **情感建模**：为对话者添加情感状态，影响生成策略
3. **冲突强度控制**：根据角色状态动态调整冲突强度
4. **评估指标**：添加对话动态性评估指标

