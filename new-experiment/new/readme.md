# LLM 角色扮演仿真框架 (PersonaForge & SFT)

本项目是一个用于评估和模拟大语言模型（LLM）角色扮演能力的框架。它支持多种提示工程策略（Zero-Shot, SFT, PersonaForge/Structured Prompt），并包含基于心理学防御机制的动态状态跟踪（System 1/System 2）以及动态对话对手模拟。

## 🛠️ 环境准备

在运行代码之前，请确保您的环境满足以下要求：

### 1. 硬件要求

* **GPU**: 建议显存 **16GB** 以上（加载 Qwen2.5-7B-Instruct fp16）。
* **显存不足时**: 如果显存只有 12GB 或更少，请在代码中修改加载参数开启 8-bit 量化（需安装 `bitsandbytes`）。

### 2. 软件依赖

请使用 Python 3.8+ 并安装以下库：

```bash
pip install torch transformers peft accelerate
# 如果需要 8-bit 量化运行，请额外安装:
# pip install bitsandbytes

```

---

## ⚙️ 关键配置 (运行前必读)

在使用前，**必须**检查并修改代码顶部的配置路径，否则程序找不到文件或无法保存结果。

打开 `run_simulation.py`，找到 `--- Configuration ---` 部分：

```python
# 1. 基础模型名称 (确保服务器能连接 HuggingFace，或修改为本地绝对路径)
BASE_MODEL_NAME = "Qwen/Qwen2.5-7B-Instruct"

# 2. SFT Adapter 路径 (重要！)
# 如果你没有微调后的Adapter，代码会自动降级使用基础模型，但会提示警告。
# 请修改为您存放 LoRA 权重的真实路径。
ADAPTER_BASE_DIR = "/home/ubuntu/ScrollWeaver/LLaMA-Factory/saves"

# 3. 结果保存路径
# 默认保存在当前目录下的 fourtest/results
RESULTS_DIR = "fourtest/results"

```

---

## 🧪 怎样测试 (Quick Start)

这里提供几种不同场景的测试命令，帮助您验证代码是否正常运行。

### 场景 1：极速冒烟测试 (Sanity Check)

**目的**：验证环境、模型加载和基本代码逻辑是否正常，不消耗太多时间。
**说明**：只运行 `LinDaiyu` 一个角色，只跑 `2` 轮对话，使用 `GroupC` (结构化提示词) 模式。

```bash
python run_simulation.py --groups GroupC_StructuredPrompt --chars LinDaiyu --turns 2

```

* **预期结果**：终端打印出两轮对话日志，`fourtest/results/` 目录下生成 `GroupC_StructuredPrompt_LinDaiyu.json` 文件。

### 场景 2：测试动态对话者 (Dynamic Interlocutor)

**目的**：测试两个 LLM 互相对话的功能（而不是使用静态提示词列表）。
**说明**：开启 `--dynamic-interlocutor`，模型将自动扮演对话对手（如贾宝玉与林黛玉对话）。

```bash
python run_simulation.py --chars LinDaiyu --groups GroupC_StructuredPrompt --turns 5 --dynamic-interlocutor

```

### 场景 3：全量运行特定组

**目的**：运行完整的实验流程。

```bash
# 运行 GroupC 和 GroupA，测试林黛玉和诸葛亮，每人跑 10 轮
python run_simulation.py --groups GroupA_ZeroShot,GroupC_StructuredPrompt --chars LinDaiyu,ZhugeLiang --turns 10

```

---

## 📄 命令行参数说明

| 参数 | 说明 | 默认值 | 示例 |
| --- | --- | --- | --- |
| `--groups` | 要运行的实验组，用逗号分隔。可选值: `GroupA_ZeroShot`, `GroupB_SimplePrompt`, `GroupC_StructuredPrompt`, `GroupD_SFT` | 所有组 | `--groups GroupC_StructuredPrompt` |
| `--chars` | 要运行的角色 ID，用逗号分隔 (必须在代码字典中存在)。 | 所有角色 | `--chars LinDaiyu,CaoCao` |
| `--turns` | 对话轮数。 | 30 | `--turns 5` |
| `--dynamic-interlocutor` | 开关。启用后，对话的另一方也由 LLM 生成回复，而非读取预设 Prompt 列表。 | False | `--dynamic-interlocutor` |

---

## 📂 输出结果分析

运行结束后，结果会保存在 `fourtest/results` 文件夹中。

**文件命名格式**：
`{Group名}_{角色名}_{对手名(可选)}.json`

**JSON 内容示例**：

```json
{
  "group": "GroupC_StructuredPrompt",
  "char": "LinDaiyu",
  "interlocutor": "JiaBaoyu",
  "logs": [
    {
      "turn": 1,
      "type": "casual",
      "is_critical": true,  // 是否触发了 System 2 (慢思考)
      "trigger_reason": "keyword_hit", // 触发原因
      "input": "（情境：午后在潇湘馆内教鹦鹉念葬花吟。）",
      "response": "（林黛玉轻轻叹了口气...）",
      "monologue": "（这里是角色的内心独白...）", // 仅 GroupC 有此字段
      "mood": "melancholy", // 仅 GroupC 有此字段
      "energy": 78
    }
  ]
}

```

---

## ❓ 常见问题 (Troubleshooting)

1. **错误：`OutOfMemoryError: CUDA out of memory**`
* **原因**：显存不足以加载 7B 模型。
* **解决**：
1. 减少 `--turns` 不会解决加载问题。
2. 修改代码中的 `model = AutoModelForCausalLM.from_pretrained(...)`，添加 `load_in_8bit=True` (需要安装 `bitsandbytes`)。




2. **错误：`OSError: .../saves/qwen_LinDaiyu_sft does not appear to have a file named adapter_config.json**`
* **原因**：运行了 `GroupD_SFT`，但 `ADAPTER_BASE_DIR` 路径下没有对应的 Adapter 文件。
* **解决**：
* 如果你没有训练好的 Adapter，请在测试时**不包含** `GroupD_SFT`：
`python run_simulation.py --groups GroupA_ZeroShot,GroupC_StructuredPrompt ...`
* 或者修改代码中的 `ADAPTER_BASE_DIR` 指向正确位置。




3. **生成的回复为空或乱码**
* **原因**：模型未正确下载或 tokenizer 版本不匹配。
* **解决**：确保 `BASE_MODEL_NAME` 正确，且网络能连接 HuggingFace，或者指定本地已下载好的模型路径。