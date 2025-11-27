# RAG和过去信息传入机制详解

## 概述

ScrollWeaver使用RAG（Retrieval-Augmented Generation）机制，通过向量数据库检索相关信息并传入LLM的prompt中。本文档详细说明信息是如何检索和传入的。

---

## 1. 数据存储结构

### 1.1 角色数据库 (Role DB)
**位置**: `modules/main_performer.py` line 54-57

```python
self.db_name = clean_collection_name(f"role_{role_code}_{embedding_name}")
self.db = build_db(data = self.role_data,
                   db_name = self.db_name,
                   db_type = db_type,
                   embedding = embedding)
```

**数据来源**: `self.role_data` - 从角色文件夹中的文件构建
- `role_info.json` - 角色基本信息
- 其他相关文件

**用途**: 存储角色的参考信息（references），如说话习惯、行为模式等

### 1.2 世界观数据库 (World DB)
**位置**: `modules/main_performer.py` line 58-59

```python
self.world_db = None
self.world_db_name = ""
```

**数据来源**: 从Orchestrator的世界观数据构建
**用途**: 存储世界观相关知识（knowledges）

### 1.3 记忆数据库 (Memory DB)
**位置**: `modules/main_performer.py` line 60-66

```python
self.memory = build_performer_memory(llm_name=llm_name,
                                      embedding_name = embedding_name,
                                      embedding = embedding,
                                      db_name = self.db_name.replace("role","memory"),
                                      language = self.language,
                                      type="naive")
```

**数据来源**: 历史记录（HistoryManager）
**用途**: 存储和检索角色的历史记忆

### 1.4 历史管理器 (HistoryManager)
**位置**: `modules/main_performer.py` line 33

```python
self.history_manager = HistoryManager()
```

**数据来源**: 角色的行动记录
**用途**: 管理角色的历史对话和行动记录

---

## 2. 信息检索方法

### 2.1 检索世界观知识 (retrieve_knowledges)

**位置**: `modules/main_performer.py` line 536-541

```python
def retrieve_knowledges(self, query:str, top_k:int=1, max_words = 100):
    if self.world_db is None:
        return ""
    knowledges = "\n".join(self.world_db.search(query, top_k,self.world_db_name))
    knowledges = knowledges[:max_words]
    return knowledges
```

**流程**:
1. 使用查询文本 `query` 在 `world_db` 中搜索
2. 返回最相关的 `top_k` 条结果
3. 限制总长度不超过 `max_words` 字符
4. 返回拼接后的字符串

**调用位置**:
- `plan()` - line 178
- `plan_with_style()` - line 238
- `npc_interact()` - line 299
- `single_role_response()` - line 337
- `multi_role_response()` - line 393

### 2.2 检索角色参考信息 (retrieve_references)

**位置**: `modules/main_performer.py` line 543-547

```python
def retrieve_references(self, query: str, top_k: int = 1):
    if self.db is None:
        return ""
    references = "\n".join(self.db.search(query, top_k,self.db_name))
    return references
```

**流程**:
1. 使用查询文本 `query` 在角色数据库 `self.db` 中搜索
2. 返回最相关的 `top_k` 条结果
3. 返回拼接后的字符串

**调用位置**:
- `plan()` - line 177
- `plan_with_style()` - line 237
- `npc_interact()` - line 298
- `single_role_response()` - line 336
- `multi_role_response()` - line 392

### 2.3 检索历史记录 (retrieve_history)

**位置**: `modules/main_performer.py` line 549-555

```python
def retrieve_history(self, query: str, top_k: int = 5, retrieve: bool = False):
    if len(self.history_manager) == 0: return ""
    if len(self.history_manager) >= top_k and retrieve:
        history = "\n" + "\n".join(self.memory.search(query, top_k)) + "\n"
    else:
        history = "\n" + "\n".join(self.history_manager.get_recent_history(top_k))
    return history
```

**流程**:
1. 如果 `retrieve=True` 且历史记录足够多，使用向量检索从memory中搜索
2. 否则，直接获取最近的 `top_k` 条历史记录
3. 返回格式化后的历史文本

**调用位置**:
- `plan()` - line 176
- `plan_with_style()` - line 236
- `npc_interact()` - line 295
- `single_role_response()` - line 336
- `multi_role_response()` - line 392
- `update_status()` - line 443
- `update_goal()` - line 464
- `move()` - line 493

---

## 3. 信息传入Prompt

### 3.1 Prompt模板结构

**示例**: `ROLE_PLAN_PROMPT` (中文版)

```python
ROLE_PLAN_PROMPT = """
你是 {role_name}. 你的昵称是 {nickname}. 你需要基于你的目标、状态和提供的其它信息实行下一步行动。

## 历史对话记录
{history}          # ← 这里传入历史信息

## 你的档案
{profile}

## 你的目标
{goal}

## 你的状态
{status}

## 和你在一起的其它角色（当前场景中出现的角色）
{other_roles_info}

## 角色扮演的要求
...
- 讲话部分的用语习惯可以参考：{references}  # ← 这里传入参考信息
- 你可以参考相关世界观设定: {knowledges}     # ← 这里传入世界观知识
...
"""
```

### 3.2 信息传入流程

**以 `plan()` 方法为例** (`modules/main_performer.py` line 170-226):

```python
def plan(self, other_roles_info: Dict[str, Any], ...):
    # 1. 检索历史信息
    action_history_text = self.retrieve_history(query = "", retrieve=False)
    
    # 2. 检索参考信息（基于历史）
    references = self.retrieve_references(query = action_history_text)
    
    # 3. 检索世界观知识（基于历史）
    knowledges = self.retrieve_knowledges(query = action_history_text)
    
    # 4. 构建prompt，传入检索到的信息
    prompt = self._ROLE_PLAN_PROMPT.format(**{
        "role_name": self.role_name,
        "nickname": self.nickname,
        "profile": self.role_profile,
        "goal": self.goal,
        "status": self.status,
        "history": action_history_text,      # ← 历史信息
        "other_roles_info": other_roles_info_text,
        "world_description": world_description,
        "location": self.location_name,
        "references": references,            # ← 参考信息
        "knowledges": knowledges,            # ← 世界观知识
    })
    
    # 5. 调用LLM
    response = self.llm.chat(prompt)
```

---

## 4. 向量数据库检索机制

### 4.1 ChromaDB检索实现

**位置**: `modules/db/ChromaDB.py` line 84-99

```python
def search(self, query, n_results, db_name):
    if not query or not db_name or db_name not in self.collections:
        return []
    
    try:
        n_results = min(self.collections[db_name].count(), n_results)
        if n_results < 1:
            return []
        results = self.collections[db_name].query(
            query_texts=[query], 
            n_results=n_results
        )
        return results['documents'][0]
    except Exception as e:
        print(f"Search error: {str(e)}")
        return []
```

**流程**:
1. 将查询文本 `query` 转换为向量（通过embedding模型）
2. 在向量数据库中搜索最相似的文档
3. 返回 `n_results` 条最相关的结果

### 4.2 记忆检索实现

**位置**: `modules/memory.py` line 95-96

```python
def search(self,query,top_k):
    fetched_memories = self.db.search(query, top_k,self.db_name)
    return fetched_memories
```

**流程**:
1. 使用查询文本在记忆数据库中搜索
2. 返回最相关的 `top_k` 条记忆

---

## 5. 完整信息流示例

### 场景：角色计划下一步行动

```
1. 用户触发: generate_next_message()
   ↓
2. Simulator调用: performer.plan()
   ↓
3. 检索历史信息:
   - retrieve_history(query="", retrieve=False)
   - 返回最近5条历史记录
   ↓
4. 检索参考信息:
   - retrieve_references(query=action_history_text)
   - 在角色数据库中搜索与历史相关的参考信息
   - 返回: "角色习惯说'...'，经常..."
   ↓
5. 检索世界观知识:
   - retrieve_knowledges(query=action_history_text)
   - 在世界观数据库中搜索相关知识
   - 返回: "在这个世界中，..."
   ↓
6. 构建Prompt:
   prompt = ROLE_PLAN_PROMPT.format(
       history=action_history_text,      # 历史对话记录
       references=references,            # 角色参考信息
       knowledges=knowledges,            # 世界观知识
       ...
   )
   ↓
7. 调用LLM:
   response = self.llm.chat(prompt)
   ↓
8. 返回生成的行动
```

---

## 6. 关键参数说明

### 6.1 检索参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `top_k` (knowledges) | 1 | 检索世界观知识的数量 |
| `top_k` (references) | 1 | 检索参考信息的数量 |
| `top_k` (history) | 5 | 检索历史记录的数量 |
| `max_words` (knowledges) | 100 | 世界观知识的最大字符数 |

### 6.2 检索策略

**历史记录检索**:
- `retrieve=False`: 直接获取最近N条记录（时间顺序）
- `retrieve=True`: 使用向量检索，根据相关性排序

**参考信息检索**:
- 使用历史记录作为查询文本
- 检索角色数据库中相关的参考信息

**世界观知识检索**:
- 使用历史记录作为查询文本
- 检索世界观数据库中相关的知识

---

## 7. 数据更新机制

### 7.1 历史记录更新

**位置**: `modules/main_performer.py` line 519

```python
def add_record(self, record):
    self.history_manager.add_record(record)
```

**触发时机**: 每次角色行动后

### 7.2 记忆更新

**位置**: `modules/memory.py` line 91-93

```python
def add_record(self,text):
    self.idx += 1
    self.db.add(text, str(self.idx), db_name=self.db_name)
```

**触发时机**: 通过HistoryManager自动更新

---

## 8. 总结

### RAG机制的核心流程

1. **数据存储**: 将角色信息、世界观知识、历史记录存储在向量数据库中
2. **信息检索**: 根据当前上下文（历史记录）检索相关信息
3. **信息整合**: 将检索到的信息整合到prompt模板中
4. **LLM生成**: LLM基于完整的上下文信息生成响应

### 信息传入的层次

1. **直接传入**: 角色档案、目标、状态等直接信息
2. **RAG检索**: 历史记录、参考信息、世界观知识等通过向量检索获取
3. **动态更新**: 每次行动后更新历史记录，影响后续检索

### 优势

- ✅ **上下文感知**: 通过历史记录检索相关信息
- ✅ **知识增强**: 通过世界观数据库增强角色知识
- ✅ **个性化**: 通过角色数据库保持角色一致性
- ✅ **效率优化**: 只检索最相关的信息，避免信息过载

