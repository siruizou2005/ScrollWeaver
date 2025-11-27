# ScrollWeaver 私语模式 vs SillyTavern 实现差异分析

## 一、核心差异总结

### 1. **System Instruction 处理方式**

**SillyTavern**：
```javascript
// 使用 systemInstruction 参数（如果 API 支持）
if (useSystemPrompt && Array.isArray(prompt.system_instruction.parts) && prompt.system_instruction.parts.length) {
    body.systemInstruction = prompt.system_instruction;  // 作为独立参数
}
```

**ScrollWeaver（当前）**：
```python
# 新版 API 不支持 system_instruction 参数，合并到第一个 user 消息中
if system_instruction and system_instruction.get("parts"):
    system_text = system_instruction["parts"][0].get("text", "")
    first_part["text"] = f"{system_text}\n\n{current_text}"  # 合并到消息内容
```

**影响**：
- SillyTavern 的 system prompt 作为独立参数，模型更容易识别
- 我们的方式将 system prompt 混入用户消息，可能影响模型理解

---

### 2. **System Prompt 格式构建**

**SillyTavern**：
- 使用 **story_string 模板系统**（可配置）
- 默认格式：`{{description}}\n{{personality}}\n{{scenario}}`
- 支持条件渲染：`{{#if personality}}{{personality}}\n{{/if}}`
- 支持自定义格式（通过 preset 配置）

**ScrollWeaver（当前）**：
- **硬编码格式**，固定顺序：
  1. 角色身份说明（"你是一个专业的角色扮演者..."）
  2. 角色设定（profile）
  3. 性格设定（personality）
  4. 场景设定（scenario）
  5. 世界观（world description）

**差异点**：
```python
# 我们添加了额外的角色身份说明
prompt_parts.append(f"你是一个专业的角色扮演者，能够完全沉浸到任何给定的角色中...")

# SillyTavern 直接使用角色卡内容，不添加额外说明（除非配置了 system prompt）
```

---

### 3. **示例对话（Example Dialogue）处理**

**SillyTavern**：
- 示例对话作为 **system 消息**的一部分
- 使用 `example_user` 和 `example_assistant` 标识
- 支持 `<START>` 标记
- 支持多组示例对话（通过 `mesExamplesArray`）

**ScrollWeaver（当前）**：
- 示例对话也作为 system 消息
- 使用相同的 `example_user` 和 `example_assistant` 标识
- **简化解析**：只支持基本的 `用户名: 内容` 格式

**差异点**：
```python
# 我们的解析逻辑较简单
if line.startswith(f"{self.user_name}:"):
    # 简单的前缀匹配

# SillyTavern 有更复杂的解析，支持多种格式
```

---

### 4. **消息格式转换**

**SillyTavern**：
- 支持**多模态内容**（图片、视频、音频）
- 支持 **tool calls**（函数调用）
- 支持 **消息名称前缀**（`message.name`）
- 复杂的消息合并逻辑（合并连续同角色消息）

**ScrollWeaver（当前）**：
- **仅支持文本**
- 不支持 tool calls
- **不添加消息名称前缀**
- 简单的消息合并逻辑

**关键差异**：
```javascript
// SillyTavern：添加角色名称前缀
if (message.name === 'example_assistant') {
    if (!part.text.startsWith(`${names.charName}: `)) {
        part.text = `${names.charName}: ${part.text}`;
    }
}

// ScrollWeaver：不添加前缀（在 system prompt 中处理）
```

---

### 5. **消息合并策略**

**SillyTavern**：
```javascript
// 合并连续的同角色消息
if (index > 0 && message.role === contents[contents.length - 1].role) {
    // 合并文本部分
    textPart.text += '\n\n' + part.text;
}
```

**ScrollWeaver（当前）**：
```python
# 相同的合并策略
if contents and contents[-1]["role"] == gemini_role:
    contents[-1]["parts"][0]["text"] += "\n\n" + content
```

**相同点**：两者都合并连续的同角色消息

---

### 6. **角色名称处理**

**SillyTavern**：
- 在消息内容中添加角色名称前缀
- 支持群聊（多个角色名称）
- 使用 `names.charName` 和 `names.userName`

**ScrollWeaver（当前）**：
- **不在消息内容中添加名称前缀**
- 仅在 system prompt 中提及角色名称
- 仅支持 1v1 对话

---

### 7. **API 调用方式**

**SillyTavern**：
```javascript
// 使用 REST API（Maker Suite 或 Vertex AI）
const body = {
    contents: prompt.contents,
    systemInstruction: prompt.system_instruction,  // 独立参数
    generationConfig: generationConfig,
    safetySettings: safetySettings
};
```

**ScrollWeaver（当前）**：
```python
# 使用新版 Python SDK（genai.Client）
response = self._client.models.generate_content(
    model=self.llm_name,
    contents=contents,  # system prompt 已合并到 contents
    config=config
)
```

**关键差异**：
- SillyTavern 使用 REST API，可以传递 `systemInstruction`
- 我们使用 Python SDK，新版 API 可能不支持 `systemInstruction` 参数

---

## 二、功能差异

### 已实现（与 SillyTavern 相同）
✅ System prompt 构建  
✅ 示例对话解析  
✅ 消息历史管理  
✅ 每次对话包含 system prompt  
✅ 消息合并逻辑  

### 未实现（SillyTavern 有）
❌ **多模态支持**（图片、视频、音频）  
❌ **Tool calls 支持**（函数调用）  
❌ **消息名称前缀**（在消息内容中添加角色名）  
❌ **Story String 模板系统**（可配置的格式）  
❌ **System Instruction 独立参数**（如果 API 支持）  
❌ **群聊支持**（多角色对话）  
❌ **扩展提示词**（World Info、Memory、Authors Note 等）  

---

## 三、潜在问题

### 1. **System Prompt 合并到用户消息**
- **问题**：将 system prompt 合并到第一个 user 消息，可能让模型混淆
- **影响**：模型可能将角色设定视为用户输入的一部分
- **建议**：尝试使用 `systemInstruction` 参数（如果新版 API 支持）

### 2. **缺少消息名称前缀**
- **问题**：消息中没有角色名称前缀
- **影响**：模型可能无法清楚区分不同角色的消息
- **建议**：在消息内容中添加角色名称前缀（如 `角色名: 消息内容`）

### 3. **硬编码格式**
- **问题**：System prompt 格式固定，无法自定义
- **影响**：无法适应不同的角色卡格式
- **建议**：实现模板系统（参考 SillyTavern 的 story_string）

---

## 四、建议改进方向

### 优先级高
1. **尝试使用 systemInstruction 参数**
   - 检查新版 Gemini API 是否支持
   - 如果支持，使用独立参数而不是合并到消息中

2. **添加消息名称前缀**
   - 在消息内容中添加角色名称
   - 格式：`角色名: 消息内容`

3. **优化 System Prompt 格式**
   - 移除硬编码的"角色扮演者"说明
   - 使用更简洁的格式（参考 SillyTavern 的 story_string）

### 优先级中
4. **实现 Story String 模板系统**
   - 支持可配置的格式
   - 支持条件渲染

5. **改进示例对话解析**
   - 支持更多格式
   - 支持 `<START>` 标记

### 优先级低
6. **多模态支持**
7. **Tool calls 支持**
8. **扩展提示词系统**

---

## 五、代码对比示例

### System Prompt 构建

**SillyTavern**：
```javascript
// 使用模板渲染
const storyString = renderStoryString({
    description: description,
    personality: personality,
    scenario: scenario,
    // ...
});
```

**ScrollWeaver**：
```python
# 硬编码格式
prompt_parts.append(f"你是一个专业的角色扮演者...")
prompt_parts.append(self.role_profile)
prompt_parts.append(f"{char_name_display}的性格: {self.role_persona}")
```

### 消息格式转换

**SillyTavern**：
```javascript
// 添加角色名称前缀
if (message.name === 'example_assistant') {
    part.text = `${names.charName}: ${part.text}`;
}
```

**ScrollWeaver**：
```python
# 不添加前缀（在 system prompt 中处理）
# 仅在示例对话解析时添加前缀
if name == "example_assistant":
    content = f"{self.char_name}: {content}"
```

---

## 六、总结

当前实现已经基本对齐 SillyTavern 的核心逻辑，但仍有以下关键差异：

1. **System Instruction 处理**：合并到消息 vs 独立参数
2. **格式构建**：硬编码 vs 模板系统
3. **消息格式**：无名称前缀 vs 有名称前缀
4. **功能范围**：仅文本 vs 多模态+工具调用

建议优先修复 System Instruction 的处理方式，这是影响角色扮演效果的关键因素。

