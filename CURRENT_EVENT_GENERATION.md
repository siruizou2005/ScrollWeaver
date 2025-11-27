# Current Event 生成流程说明

## 概述

"--------- Current Event ---------" 是系统中显示当前重大事件的标识。本文档详细说明事件的生成、更新和显示流程。

---

## 1. 事件生成流程

### 1.1 初始事件生成

**触发时机**: 模拟开始时，如果 `intervention` 为空且没有 `script`

**代码路径**:
```
modules/simulation/event_manager.py (line 36-60)
  └─> modules/orchestrator.py (line 345-370)
      └─> orchestrator.generate_event()
          └─> LLM API调用 (使用 EventText 结构化输出)
```

**具体流程**:

1. **EventManager.get_event()** (`modules/simulation/event_manager.py:36`)
   ```python
   if self.intervention == "" and not self.script:
       # 获取角色信息和状态
       roles_info_text = self.state_manager.get_group_members_info_text(...)
       status_text = self.state_manager.get_status_text(...)
       
       # 调用Orchestrator生成事件
       event = self.orchestrator.generate_event(
           roles_info_text=roles_info_text,
           event=self.intervention,
           history_text=status_text
       )
   ```

2. **Orchestrator.generate_event()** (`modules/orchestrator.py:345`)
   ```python
   def generate_event(self, roles_info_text: str, event: str, history_text: str):
       prompt = self._GENERATE_INTERVENTION_PROMPT.format(**{
           "world_description": self.description,
           "roles_info": roles_info_text,
           "history_text": history_text
       })
       
       # 使用结构化输出 (EventText)
       response_model = self.llm.chat(prompt, response_model=EventText)
       response = response_model.event
       return response
   ```

3. **Prompt模板** (`modules/prompt/orchestrator_prompt_zh.py:67`)
   ```
   你是一个虚拟世界的管理员，有许多角色在这个世界中生活。
   现在需要你基于世界观和其他信息，生成一个重大事件。
   
   ## 世界观详情
   {world_description}
   
   ## 角色信息
   {roles_info}
   
   ## 最新角色行动
   {history_text}
   
   返回一个字符串。保持简洁。
   
   ### 事件生成要求
   1. 事件尽可能新颖，有趣，包含不同角色的利益冲突。
   2. 禁止包含任何细节、人物具体行动和心理，包括对话等。
   ```

4. **结构化输出模型** (`modules/models/response_models.py`)
   ```python
   class EventText(BaseModel):
       event: str = Field(
           description="A concise event description. Should be novel, interesting, "
           "and contain conflicts between different characters. "
           "Must not include any details, specific character actions, psychology, or dialogue. "
           "Must be plain text without Markdown formatting."
       )
   ```

---

## 2. 事件更新流程

### 2.1 事件更新触发

**触发时机**: 每轮模拟结束后，根据角色行动更新事件

**代码路径**:
```
modules/simulation/simulator.py (line 315)
  └─> modules/simulation/event_manager.py (line 75-86)
      └─> modules/orchestrator.py (line 100-120)
          └─> orchestrator.update_event()
              └─> LLM API调用 (使用 EventText 结构化输出)
```

**具体流程**:

1. **Simulator.update_event()** (`modules/simulation/simulator.py:315`)
   ```python
   self.event_manager.update_event(group)
   ```

2. **EventManager.update_event()** (`modules/simulation/event_manager.py:75`)
   ```python
   def update_event(self, group: List[str], top_k: int = 1):
       if self.intervention == "":
           self.event = ""
       else:
           status_text = self.state_manager.get_status_text(group)
           self.event = self.orchestrator.update_event(
               self.event,           # 当前事件
               self.intervention,    # 最初事件
               status_text,          # 最近行动
               script=self.script
           )
   ```

3. **Orchestrator.update_event()** (`modules/orchestrator.py:100`)
   ```python
   def update_event(self, cur_event: str, intervention: str, history_text: str, script: str = ""):
       prompt = self._UPDATE_EVENT_PROMPT.format(**{
           "event": cur_event,
           "intervention": intervention,
           "history": history_text
       })
       
       # 使用结构化输出 (EventText)
       response_model = self.llm.chat(prompt, response_model=EventText)
       new_event = response_model.event
       return new_event
   ```

4. **Prompt模板** (`modules/prompt/orchestrator_prompt_zh.py:87`)
   ```
   参考最初的事件: {intervention}
   基于最近行动详情: {history}
   对事件: {event} 进行更新
   
   ## 若最初的事件已经得到处理/结束/接近尾声，返回一个全新事件
   ## 若未解决，返回更新后的事件
   ```

---

## 3. 事件显示流程

### 3.1 在模拟器中生成消息

**代码位置**: `modules/simulation/simulator.py`

**两种显示方式**:

1. **Free Mode (自由模式)** (line 127-128)
   ```python
   self.event_manager.get_event()
   yield ("system", "", f"--------- Current Event ---------\n{self.event_manager.event}\n", None)
   ```

2. **Script Mode (剧本模式)** (line 211-213)
   ```python
   if self.event_manager.event and current_round >= 1:
       yield ("world", "", "-- Current Event --\n" + self.event_manager.event, None)
   ```

### 3.2 通过WebSocket发送到前端

**代码位置**: `server.py` (line 333-416)

**流程**:
```python
async def get_next_message(self):
    message = self.scrollweaver.generate_next_message()
    
    # 清理消息文本中的 Markdown 格式
    if "--------- Current Event ---------" in original_text:
        # 只移除代码块标记，保留其他格式
        cleaned_text = re.sub(r'```[\w]*\n?', '', original_text)
        cleaned_text = re.sub(r'```', '', cleaned_text)
        message["text"] = cleaned_text.strip()
    
    # 获取当前状态（包含事件）
    status = self.scrollweaver.get_current_status()
    if "event" in status and status["event"]:
        # 清理状态中的事件描述
        if "--------- Current Event ---------" in original_event:
            # 只做基本清理，避免截断
            status["event"] = cleaned_event.strip()
    
    return message, status
```

### 3.3 前端显示

**代码位置**: `frontend/js/right-section/status-panel.js` (line 36-46)

**流程**:
```javascript
updateEvent(eventText) {
    const eventContainer = document.querySelector('#current-event .module-content');
    if (eventContainer) {
        eventContainer.innerHTML = `
            <div class="event-text">
                <span class="status-indicator ${eventText ? 'status-active' : 'status-inactive'}"></span>
                ${eventText || 'No Event'}
            </div>
        `;
    }
}
```

**更新触发**: 通过WebSocket接收 `status` 消息，调用 `updateEvent(status.event)`

---

## 4. 事件数据结构

### 4.1 EventManager 中的事件

```python
class EventManager:
    intervention: str = ""      # 最初的事件/干预
    event: str = ""             # 当前事件
    script: str = ""            # 剧本（如果有）
    event_history: List[str]    # 事件历史记录
```

### 4.2 事件格式

- **生成时**: 纯文本字符串，简洁的事件描述
- **显示时**: `"--------- Current Event ---------\n{event_text}\n"`
- **状态中**: `status["event"]` 包含事件文本

---

## 5. API调用详情

### 5.1 使用的API

- **模型**: `gemini-2.5-flash`
- **API**: 新版 Gemini API (`from google import genai`)
- **结构化输出**: `EventText` Pydantic模型

### 5.2 API调用代码

```python
# modules/orchestrator.py
from .models import EventText

response_model = self.llm.chat(prompt, response_model=EventText)
event = response_model.event  # 直接获取结构化输出的事件文本
```

### 5.3 回退机制

如果结构化输出失败，会自动回退到文本输出：
```python
try:
    response_model = self.llm.chat(prompt, response_model=EventText)
    event = response_model.event
except Exception as e:
    # 回退到文本输出
    event = self.llm.chat(prompt)
    if not isinstance(event, str):
        event = str(event)
```

---

## 6. 关键文件

| 文件 | 功能 |
|------|------|
| `modules/simulation/event_manager.py` | 事件管理器，负责获取和更新事件 |
| `modules/orchestrator.py` | 调用LLM生成/更新事件 |
| `modules/models/response_models.py` | EventText模型定义 |
| `modules/prompt/orchestrator_prompt_zh.py` | 事件生成的Prompt模板 |
| `modules/simulation/simulator.py` | 在模拟循环中生成事件消息 |
| `server.py` | WebSocket消息处理和状态同步 |
| `frontend/js/right-section/status-panel.js` | 前端事件显示 |

---

## 7. 总结

### 事件生成流程

```
1. EventManager.get_event()
   ↓
2. Orchestrator.generate_event()
   ↓
3. LLM API调用 (结构化输出 EventText)
   ↓
4. 返回事件文本字符串
   ↓
5. Simulator生成消息: "--------- Current Event ---------\n{event}\n"
   ↓
6. WebSocket发送到前端
   ↓
7. StatusPanel.updateEvent() 显示
```

### 事件更新流程

```
1. Simulator.update_event()
   ↓
2. EventManager.update_event()
   ↓
3. Orchestrator.update_event()
   ↓
4. LLM API调用 (结构化输出 EventText)
   ↓
5. 更新 self.event
   ↓
6. 下一轮显示更新后的事件
```

### 关键特点

- ✅ **使用结构化输出**: 通过 `EventText` Pydantic模型确保输出格式正确
- ✅ **自动回退**: 如果结构化输出失败，自动回退到文本输出
- ✅ **避免截断**: 特殊处理包含 "Current Event" 的文本，只做基本清理
- ✅ **历史记录**: 事件会被添加到 `event_history` 中保存

---

## 8. 注意事项

1. **事件格式**: 事件应该是简洁的描述，不包含细节、对话或具体行动
2. **Markdown清理**: 包含 "Current Event" 的文本只做基本清理，避免截断
3. **空事件处理**: 如果事件为空，会使用默认值 "故事正在继续发展。"
4. **结构化输出**: 所有事件生成/更新都使用 `EventText` 结构化输出，无需本地JSON解析

