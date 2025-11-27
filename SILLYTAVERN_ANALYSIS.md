# SillyTavern System Prompt 构建与多角色支持分析

## 一、System Prompt 构建机制

### 1.1 消息格式（前端构建）

前端构建的消息数组格式：
```javascript
messages = [
    { role: 'system', content: '角色设定内容', name: 'example_assistant' },
    { role: 'system', content: '世界观设定', name: undefined },
    { role: 'system', content: '示例对话', name: 'example_user' },
    { role: 'user', content: '用户消息1', name: 'UserName' },
    { role: 'assistant', content: '角色回复1', name: 'CharName' },
    { role: 'user', content: '用户消息2', name: 'UserName' },
    // ...
]
```

### 1.2 System Prompt 提取逻辑（后端）

**对于 Gemini API (`convertGooglePrompt`)**：

```javascript
export function convertGooglePrompt(messages, model, useSysPrompt, names) {
    const sysPrompt = [];
    
    if (useSysPrompt) {
        // 提取所有开头的 system 消息
        while (messages.length > 1 && messages[0].role === 'system') {
            // 处理示例对话中的角色名
            if (names.userName && messages[0].name === 'example_user') {
                if (!messages[0].content.startsWith(`${names.userName}: `)) {
                    messages[0].content = `${names.userName}: ${messages[0].content}`;
                }
            }
            if (names.charName && messages[0].name === 'example_assistant') {
                if (!messages[0].content.startsWith(`${names.charName}: `)) {
                    messages[0].content = `${names.charName}: ${messages[0].content}`;
                }
            }
            sysPrompt.push(messages[0].content);
            messages.shift(); // 从消息数组中移除
        }
    }
    
    // 构建 system_instruction
    const system_instruction = { 
        parts: sysPrompt.map(text => ({ text })) 
    };
    
    // 转换剩余消息为 contents 格式
    const contents = [];
    messages.forEach((message) => {
        // 角色映射：system/tool -> user, assistant -> model
        if (message.role === 'system' || message.role === 'tool') {
            message.role = 'user';
        } else if (message.role === 'assistant') {
            message.role = 'model';  // Gemini 使用 "model" 而非 "assistant"
        }
        
        // 处理消息内容（支持多模态）
        // ...
        contents.push({
            role: message.role,
            parts: parts
        });
    });
    
    return { 
        contents: contents, 
        system_instruction: system_instruction 
    };
}
```

### 1.3 System Prompt 内容组成

SillyTavern 的 System Prompt 通常包含：

1. **角色设定 (Character Card)**
   - 角色名称、昵称
   - 角色描述 (description)
   - 性格设定 (personality)
   - 场景设定 (scenario)
   - 对话示例 (example_dialogue)
   - 第一句话 (first_mes)

2. **世界观设定 (World Info)**
   - 世界背景
   - 相关知识和设定

3. **示例对话 (Example Messages)**
   - `name: 'example_user'` - 用户示例消息
   - `name: 'example_assistant'` - 角色示例回复

### 1.4 API 调用格式

**Gemini API 请求体**：
```json
{
    "contents": [
        { "role": "user", "parts": [{ "text": "用户消息" }] },
        { "role": "model", "parts": [{ "text": "角色回复" }] }
    ],
    "systemInstruction": {
        "parts": [
            { "text": "角色设定内容" },
            { "text": "世界观设定" },
            { "text": "示例对话内容" }
        ]
    },
    "generationConfig": {
        "temperature": 0.8,
        "maxOutputTokens": 2048
    }
}
```

## 二、多角色支持机制

### 2.1 角色名称管理

```javascript
// 从请求中提取角色信息
function getPromptNames(request) {
    return {
        charName: String(request.body.char_name || ''),      // 主角色名
        userName: String(request.body.user_name || ''),      // 用户名
        groupNames: Array.isArray(request.body.group_names) 
            ? request.body.group_names.map(String) 
            : [],                                            // 群聊角色名数组
        startsWithGroupName: function (message) {
            // 检查消息是否以群聊角色名开头
            return this.groupNames.some(name => 
                message.startsWith(`${name}: `)
            );
        }
    };
}
```

### 2.2 消息中的角色标识

**单角色聊天**：
```javascript
messages = [
    { role: 'user', content: '消息', name: 'UserName' },
    { role: 'assistant', content: '回复', name: 'CharName' }
]
```

**多角色群聊**：
```javascript
messages = [
    { role: 'user', content: '消息1', name: 'UserName' },
    { role: 'assistant', content: '回复1', name: 'Char1' },
    { role: 'assistant', content: '回复2', name: 'Char2' },  // 多个角色
    { role: 'user', content: '消息2', name: 'UserName' }
]
```

### 2.3 角色名前缀处理

**关键逻辑**：
- 如果消息有 `name` 属性，会在内容前添加 `"角色名: "` 前缀
- 对于 `example_user` 和 `example_assistant`，使用实际的用户名和角色名
- 对于群聊，检查 `groupNames` 避免重复添加前缀

```javascript
if (message.name) {
    message.content.forEach((part) => {
        if (part.type === 'text') {
            // 检查是否已有前缀
            if (!part.text.startsWith(`${message.name}: `)) {
                part.text = `${message.name}: ${part.text}`;
            }
        }
    });
}
```

### 2.4 群聊特殊处理

**`startsWithGroupName` 函数**：
```javascript
startsWithGroupName: function (message) {
    return this.groupNames.some(name => 
        message.startsWith(`${name}: `)
    );
}
```

**用途**：
- 判断消息是否已经是群聊角色的消息
- 避免重复添加角色名前缀
- 确保群聊中不同角色的消息能正确区分

## 三、关键差异点

### 3.1 角色映射差异

| API | user | assistant | system |
|-----|------|-----------|--------|
| OpenAI | user | assistant | system |
| Gemini | user | **model** | system (提取到 system_instruction) |
| Claude | user | assistant | system (可提取到 system prompt) |

### 3.2 System Prompt 处理差异

**Gemini**：
- 如果 `useSysPrompt = true`：提取到 `systemInstruction`
- 如果 `useSysPrompt = false`：system 消息转为 user 消息

**Claude**：
- 如果 `useSystemPrompt = true`：提取到 `system` 数组
- 如果 `useSystemPrompt = false`：system 消息保留在 messages 中

### 3.3 多角色支持方式

1. **单角色模式**：
   - `charName`: 主角色名
   - `userName`: 用户名
   - 消息通过 `name` 属性区分

2. **群聊模式**：
   - `groupNames`: 所有角色名数组
   - 每个消息都有 `name` 属性标识发送者
   - 消息内容自动添加 `"角色名: "` 前缀

## 四、ScrollWeaver 私语模式实现要点

### 4.1 简化版 System Prompt 构建

```python
def build_system_prompt(character_info, world_info):
    """
    构建私语模式的 System Prompt
    参考 SillyTavern 的构建逻辑，但简化处理
    """
    parts = []
    
    # 1. 角色设定
    if character_info.get('profile'):
        parts.append(character_info['profile'])
    
    # 2. 性格设定
    if character_info.get('persona'):
        parts.append(f"\n性格: {character_info['persona']}")
    
    # 3. 场景设定
    if character_info.get('scenario'):
        parts.append(f"\n场景: {character_info['scenario']}")
    
    # 4. 世界观（可选）
    if world_info:
        parts.append(f"\n世界观: {world_info}")
    
    # 5. 第一句话（可选）
    if character_info.get('first_message'):
        parts.append(f"\n第一句话: {character_info['first_message']}")
    
    return "\n".join(parts)
```

### 4.2 消息历史格式

```python
# 消息数组格式（参考 SillyTavern）
messages = [
    {"role": "user", "content": "用户消息1"},
    {"role": "model", "content": "角色回复1"},  # Gemini 使用 "model"
    {"role": "user", "content": "用户消息2"},
    {"role": "model", "content": "角色回复2"},
]
```

### 4.3 Gemini API 调用

```python
# 使用 Gemini.py 的现有实现
llm = Gemini(model="gemini-2.5-flash-lite")
llm.system_message(system_prompt)  # 设置 system instruction

# 添加历史消息
for msg in chat_history:
    if msg["role"] == "user":
        llm.user_message(msg["content"])
    elif msg["role"] == "model":  # 或 "assistant"
        llm.ai_message(msg["content"])  # Gemini.py 内部会转换为 "model"

# 获取回复
response = llm.get_response(temperature=0.8)
```

## 五、总结

### 5.1 System Prompt 构建要点

1. **提取所有开头的 system 消息**：在消息数组最前面
2. **合并为 system_instruction**：对于 Gemini，合并为 `parts` 数组
3. **处理示例对话**：`example_user` 和 `example_assistant` 需要添加实际角色名
4. **角色映射**：assistant -> model (Gemini)

### 5.2 多角色支持要点

1. **使用 `name` 属性**：每个消息都有 `name` 标识发送者
2. **自动添加前缀**：消息内容前添加 `"角色名: "` 前缀
3. **群聊检测**：`groupNames` 数组和 `startsWithGroupName` 函数
4. **消息合并**：相同角色的连续消息可以合并

### 5.3 ScrollWeaver 私语模式简化

由于私语模式是 1v1，可以简化：
- 不需要 `groupNames`
- 不需要 `startsWithGroupName` 检查
- 消息格式固定为 user/model 交替
- System Prompt 只需包含角色设定和世界观

