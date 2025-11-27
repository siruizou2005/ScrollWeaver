# RAG信息传入格式说明

## 是的，所有信息都是以字符串格式传入的

---

## 1. 检索方法返回字符串

### 1.1 retrieve_history() - 返回字符串

**代码位置**: `modules/main_performer.py` line 549-555

```python
def retrieve_history(self, query: str, top_k: int = 5, retrieve: bool = False):
    if len(self.history_manager) == 0: return ""
    if len(self.history_manager) >= top_k and retrieve:
        history = "\n" + "\n".join(self.memory.search(query, top_k)) + "\n"
    else:
        history = "\n" + "\n".join(self.history_manager.get_recent_history(top_k))
    return history  # ← 返回字符串
```

**返回格式**: 
- 字符串，多条记录用 `\n` 连接
- 示例: `"\n记录1\n记录2\n记录3\n"`

### 1.2 retrieve_references() - 返回字符串

**代码位置**: `modules/main_performer.py` line 543-547

```python
def retrieve_references(self, query: str, top_k: int = 1):
    if self.db is None:
        return ""
    references = "\n".join(self.db.search(query, top_k,self.db_name))
    return references  # ← 返回字符串
```

**返回格式**:
- 字符串，多条记录用 `\n` 连接
- 示例: `"参考信息1\n参考信息2"`

### 1.3 retrieve_knowledges() - 返回字符串

**代码位置**: `modules/main_performer.py` line 536-541

```python
def retrieve_knowledges(self, query:str, top_k:int=1, max_words = 100):
    if self.world_db is None:
        return ""
    knowledges = "\n".join(self.world_db.search(query, top_k,self.world_db_name))
    knowledges = knowledges[:max_words]
    return knowledges  # ← 返回字符串
```

**返回格式**:
- 字符串，多条记录用 `\n` 连接，限制最大100字符
- 示例: `"世界观知识1\n世界观知识2"`

---

## 2. 字符串传入Prompt模板

### 2.1 Prompt模板格式化

**代码位置**: `modules/main_performer.py` line 189-203

```python
# 检索到的信息都是字符串
action_history_text = self.retrieve_history(query = "", retrieve=False)  # 字符串
references = self.retrieve_references(query = action_history_text)      # 字符串
knowledges = self.retrieve_knowledges(query = action_history_text)      # 字符串

# 将字符串传入prompt模板
prompt = self._ROLE_PLAN_PROMPT.format(**{
    "role_name": self.role_name,           # 字符串
    "nickname": self.nickname,             # 字符串
    "profile": self.role_profile,          # 字符串
    "goal": self.goal,                     # 字符串
    "status": self.status,                 # 字符串
    "history": action_history_text,        # 字符串 ← RAG检索的历史
    "other_roles_info": other_roles_info_text,  # 字符串
    "world_description": world_description,     # 字符串
    "location": self.location_name,        # 字符串
    "references": references,               # 字符串 ← RAG检索的参考信息
    "knowledges": knowledges,              # 字符串 ← RAG检索的世界观知识
})

# prompt最终是一个完整的字符串
# 示例格式:
"""
你是 林朝夕. 你的昵称是 林朝夕. 你需要基于你的目标、状态和提供的其它信息实行下一步行动。

## 历史对话记录
记录1
记录2
记录3

## 你的档案
角色档案信息...

## 你的目标
当前目标...

## 你的状态
当前状态...

## 和你在一起的其它角色
其他角色信息...

## 角色扮演的要求
...
- 讲话部分的用语习惯可以参考：参考信息1
参考信息2
- 你可以参考相关世界观设定: 世界观知识1
世界观知识2
...
"""
```

---

## 3. 字符串传入LLM

### 3.1 LLM.chat()方法接收字符串

**代码位置**: `modules/llm/Gemini.py` line 291-305

```python
def chat(self, text, temperature=0.8):
    """
    简单的聊天接口。
    
    Args:
        text: 用户输入的文本  # ← 字符串类型
        temperature: 温度参数，默认 0.8
        
    Returns:
        模型生成的文本响应
    """
    self.initialize_message()
    self.user_message(text)  # ← 传入字符串
    response = self.get_response(temperature=temperature)
    return response
```

### 3.2 user_message()存储字符串

**代码位置**: `modules/llm/Gemini.py` line 149-156

```python
def user_message(self, payload):
    """
    添加用户消息。
    
    Args:
        payload: 用户消息内容  # ← 字符串类型
    """
    self.messages.append({"role": "user", "content": payload})  # ← 存储字符串
```

### 3.3 最终API调用

**代码位置**: `modules/llm/Gemini.py` line 220-222

```python
# 单次对话，直接生成
prompt = self.messages[0]["content"] if self.messages else ""  # ← 字符串
response_result[0] = model.generate_content(prompt, generation_config=generation_config)
```

---

## 4. 完整数据流示例

```
1. 向量数据库检索
   ↓
   db.search(query, top_k) 
   → 返回: ["文档1", "文档2", "文档3"]  # 列表
   ↓
2. 列表转字符串
   ↓
   "\n".join(["文档1", "文档2", "文档3"])
   → 返回: "文档1\n文档2\n文档3"  # 字符串
   ↓
3. 字符串传入Prompt模板
   ↓
   prompt_template.format(history="文档1\n文档2\n文档3", ...)
   → 返回: "完整的prompt字符串..."  # 字符串
   ↓
4. 字符串传入LLM
   ↓
   llm.chat("完整的prompt字符串...")
   → 内部: messages.append({"role": "user", "content": "完整的prompt字符串..."})
   ↓
5. LLM API调用
   ↓
   model.generate_content("完整的prompt字符串...")
   → 返回: 模型生成的响应字符串
```

---

## 5. 关键点总结

### ✅ 所有信息都是字符串格式

1. **检索结果**: 字符串（用 `\n` 连接多条记录）
2. **Prompt模板**: 字符串（通过 `.format()` 方法填充）
3. **LLM输入**: 字符串（通过 `chat(text)` 方法传入）
4. **API调用**: 字符串（`generate_content(prompt)` 接收字符串）

### 📝 字符串格式示例

**历史记录字符串**:
```
"
2025-11-23 20:53:13 林朝夕: 设立了动机: 成为一名有思想、有担当的人民教师...
2025-11-23 20:53:17 老林: 设立了动机: 确保朝夕能独立、幸福地走她自己的人生路...
2025-11-23 20:53:21 裴之: 设立了动机: 在数学领域取得突破性进展...
"
```

**参考信息字符串**:
```
"角色习惯说'...'，经常表现出...的行为模式。"
```

**世界观知识字符串**:
```
"在这个世界中，...的设定是...，规则包括..."
```

**最终Prompt字符串**:
```
"你是 林朝夕. 你的昵称是 林朝夕...

## 历史对话记录
2025-11-23 20:53:13 林朝夕: 设立了动机: 成为一名有思想、有担当的人民教师...
2025-11-23 20:53:17 老林: 设立了动机: 确保朝夕能独立、幸福地走她自己的人生路...

## 你的档案
22岁的哲学系学生...

- 讲话部分的用语习惯可以参考：角色习惯说'...'，经常表现出...的行为模式。
- 你可以参考相关世界观设定: 在这个世界中，...的设定是...
..."
```

---

## 6. 为什么使用字符串格式？

### ✅ 优点

1. **简单直接**: LLM API通常接收字符串格式的prompt
2. **易于调试**: 可以直接打印和查看完整的prompt
3. **兼容性好**: 所有LLM接口都支持字符串输入
4. **灵活性强**: 可以轻松组合和格式化不同来源的信息

### ⚠️ 注意事项

1. **长度限制**: 字符串长度受LLM的token限制
2. **格式控制**: 需要手动控制换行、缩进等格式
3. **信息密度**: 所有信息都拼接在一个字符串中

---

## 结论

**是的，所有RAG检索的信息和过去的信息都是以字符串格式传入的。**

流程：
1. 向量数据库检索 → 返回列表
2. 列表转字符串 → `"\n".join(...)`
3. 字符串填充模板 → `template.format(...)`
4. 字符串传入LLM → `llm.chat(prompt_string)`
5. LLM处理字符串 → 返回响应字符串

