# ScrollWeaver 私语模式实现方案

## 一、整体架构

### 1.1 模块结构

```
modules/
├── chat/                          # 新建：私语模式专用模块
│   ├── __init__.py
│   ├── chat_performer.py          # ChatPerformer 类（核心）
│   └── chat_history.py            # 对话历史管理
├── core/
│   └── sessions.py                # 修改：完善 ChatSession
└── llm/
    └── Gemini.py                  # 已存在，直接使用

frontend/
├── pages/
│   └── chat.html                  # 新建：私语模式页面
├── js/
│   └── chat.js                    # 新建：聊天页面逻辑
└── css/
    └── pages/
        └── chat.css               # 新建：聊天页面样式

server.py                          # 修改：添加聊天 API 端点
```

## 二、核心模块实现

### 2.1 ChatPerformer (`modules/chat/chat_performer.py`)

**职责**：
- 加载角色信息（从 role_info.json）
- 构建 System Prompt（参考 SillyTavern）
- 管理对话历史
- 调用 Gemini API 生成回复

**核心方法**：

```python
class ChatPerformer:
    def __init__(self, role_code, scroll_id, llm_name="gemini-2.5-flash-lite"):
        """
        初始化 ChatPerformer
        
        Args:
            role_code: 角色代码
            scroll_id: 书卷ID
            llm_name: LLM模型名称，默认 gemini-2.5-flash-lite
        """
        # 1. 加载角色信息
        # 2. 加载世界观信息
        # 3. 初始化 Gemini LLM
        # 4. 构建 System Prompt
        # 5. 初始化对话历史
    
    def build_system_prompt(self) -> str:
        """
        构建 System Prompt（参考 SillyTavern）
        
        组成：
        1. 角色设定 (profile)
        2. 性格设定 (persona)
        3. 场景设定 (scenario)
        4. 世界观 (world_description)
        5. 第一句话 (first_message)
        
        Returns:
            System Prompt 字符串
        """
        pass
    
    def generate_response(self, user_message: str) -> str:
        """
        生成角色回复
        
        Args:
            user_message: 用户消息
            
        Returns:
            角色回复文本
        """
        # 1. 添加用户消息到历史
        # 2. 调用 LLM 生成回复
        # 3. 添加角色回复到历史
        # 4. 返回回复
        pass
    
    def get_chat_history(self) -> List[Dict]:
        """
        获取对话历史
        
        Returns:
            消息历史列表，格式：[{"role": "user", "content": "..."}, ...]
        """
        pass
    
    def clear_history(self):
        """清空对话历史"""
        pass
```

### 2.2 ChatSession 完善 (`modules/core/sessions.py`)

**修改点**：

```python
class ChatSession(BaseSession):
    def __init__(self, ...):
        super().__init__(...)
        self.role_code = role_code
        self.chat_performer = None  # ChatPerformer 实例
        self.chat_history: List[Dict[str, Any]] = []
    
    async def initialize(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """初始化聊天会话"""
        from modules.chat.chat_performer import ChatPerformer
        
        # 创建 ChatPerformer 实例
        self.chat_performer = ChatPerformer(
            role_code=self.role_code,
            scroll_id=self.scroll_id,
            llm_name=config.get("llm_name", "gemini-2.5-flash-lite")
        )
        
        return {
            "status": "initialized",
            "role_code": self.role_code,
            "session_id": self.session_id,
            "character_name": self.chat_performer.character_name
        }
    
    async def process_message(self, message: Dict[str, Any], sender_id: int) -> Dict[str, Any]:
        """处理聊天消息"""
        user_text = message.get("text", "")
        
        # 调用 ChatPerformer 生成回复
        character_response = self.chat_performer.generate_response(user_text)
        
        # 更新历史
        self.chat_history = self.chat_performer.get_chat_history()
        
        return {
            "type": "chat_response",
            "role_code": self.role_code,
            "character_name": self.chat_performer.character_name,
            "message": character_response,
            "timestamp": datetime.now().isoformat()
        }
    
    async def cleanup(self):
        """清理聊天会话"""
        self.is_active = False
        if self.chat_performer:
            self.chat_performer.clear_history()
        self.chat_history.clear()
```

## 三、API 端点实现 (`server.py`)

### 3.1 创建聊天会话

```python
@app.post("/api/chat/create")
async def create_chat_session(
    scroll_id: int,
    role_code: str,
    current_user: dict = Depends(get_current_user)
):
    """
    创建私语模式聊天会话
    
    Args:
        scroll_id: 书卷ID
        role_code: 角色代码
        
    Returns:
        会话信息
    """
    # 1. 验证书卷和角色存在
    # 2. 创建 ChatSession
    # 3. 初始化会话
    # 4. 返回会话ID和角色信息
```

### 3.2 发送消息

```python
@app.post("/api/chat/send")
async def send_chat_message(
    session_id: str,
    message: str,
    current_user: dict = Depends(get_current_user)
):
    """
    发送聊天消息
    
    Args:
        session_id: 会话ID
        message: 用户消息文本
        
    Returns:
        角色回复
    """
    # 1. 获取会话
    # 2. 调用 process_message
    # 3. 返回回复
```

### 3.3 获取历史

```python
@app.get("/api/chat/history/{session_id}")
async def get_chat_history(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    获取对话历史
    
    Returns:
        消息历史列表
    """
    # 1. 获取会话
    # 2. 返回 chat_history
```

### 3.4 清空历史

```python
@app.post("/api/chat/clear/{session_id}")
async def clear_chat_history(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """清空对话历史"""
    # 1. 获取会话
    # 2. 清空历史
```

## 四、前端实现

### 4.1 页面结构 (`frontend/pages/chat.html`)

```html
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <title>私语 - ScrollWeaver</title>
    <link rel="stylesheet" href="../css/pages/chat.css">
</head>
<body>
    <div class="chat-container">
        <!-- 顶部栏 -->
        <header class="chat-header">
            <button class="back-btn" id="backBtn">返回</button>
            <div class="character-info">
                <div class="character-avatar" id="characterAvatar"></div>
                <h2 id="characterName">角色名称</h2>
            </div>
            <button class="menu-btn" id="menuBtn">菜单</button>
        </header>
        
        <!-- 消息区域 -->
        <div class="messages-container" id="messagesContainer">
            <!-- 消息将动态添加 -->
        </div>
        
        <!-- 输入区域 -->
        <div class="input-container">
            <textarea id="messageInput" placeholder="输入消息..."></textarea>
            <button id="sendBtn">发送</button>
        </div>
    </div>
    
    <script src="../js/chat.js"></script>
</body>
</html>
```

### 4.2 JavaScript 逻辑 (`frontend/js/chat.js`)

**核心功能**：
1. 从 URL 获取参数（scroll_id, role_code）
2. 创建/获取会话
3. 加载历史消息
4. 发送消息并显示回复
5. 实时更新消息列表

**关键函数**：

```javascript
// 初始化
async function initChat() {
    // 1. 获取 URL 参数
    // 2. 创建会话
    // 3. 加载角色信息
    // 4. 加载历史消息
}

// 发送消息
async function sendMessage() {
    // 1. 获取输入文本
    // 2. 显示用户消息
    // 3. 调用 API 发送
    // 4. 显示角色回复
    // 5. 清空输入框
}

// 加载历史
async function loadHistory() {
    // 1. 调用 API 获取历史
    // 2. 渲染消息列表
}

// 渲染消息
function renderMessage(message) {
    // 根据 role 渲染用户/角色消息
}
```

### 4.3 CSS 样式 (`frontend/css/pages/chat.css`)

**设计要点**：
- 保持 ScrollWeaver 的古风风格
- 消息气泡样式（用户右对齐，角色左对齐）
- 响应式设计
- 滚动优化

## 五、实现步骤

### Phase 1: 后端核心模块

1. **创建 `modules/chat/` 目录**
2. **实现 `ChatPerformer` 类**
   - 角色信息加载
   - System Prompt 构建
   - Gemini API 调用
   - 历史管理

3. **完善 `ChatSession`**
   - 集成 ChatPerformer
   - 实现消息处理

### Phase 2: API 端点

1. **创建会话端点** (`POST /api/chat/create`)
2. **发送消息端点** (`POST /api/chat/send`)
3. **获取历史端点** (`GET /api/chat/history/{session_id}`)
4. **清空历史端点** (`POST /api/chat/clear/{session_id}`)

### Phase 3: 前端页面

1. **创建 `chat.html`**
2. **实现 `chat.js`**
3. **实现 `chat.css`**
4. **修改 `intro.js`**：跳转到 chat.html

### Phase 4: 集成测试

1. **测试角色加载**
2. **测试消息发送**
3. **测试历史管理**
4. **测试页面跳转**

## 六、关键技术细节

### 6.1 System Prompt 构建（参考 SillyTavern）

```python
def build_system_prompt(self) -> str:
    parts = []
    
    # 1. 角色设定
    if self.role_profile:
        parts.append(self.role_profile)
    
    # 2. 性格设定
    if self.role_persona:
        parts.append(f"\n性格: {self.role_persona}")
    
    # 3. 场景设定
    if self.role_scenario:
        parts.append(f"\n场景: {self.role_scenario}")
    
    # 4. 世界观
    if self.world_description:
        parts.append(f"\n世界观: {self.world_description}")
    
    # 5. 第一句话（可选，作为提示）
    if self.first_message:
        parts.append(f"\n第一句话示例: {self.first_message}")
    
    return "\n".join(parts)
```

### 6.2 消息历史格式

```python
# 消息格式（与 SillyTavern 兼容）
chat_history = [
    {"role": "user", "content": "用户消息"},
    {"role": "model", "content": "角色回复"},  # Gemini 使用 "model"
    {"role": "user", "content": "用户消息2"},
    {"role": "model", "content": "角色回复2"},
]
```

### 6.3 Gemini API 调用

```python
# 使用现有的 Gemini.py
llm = Gemini(model="gemini-2.5-flash-lite")

# 设置 System Prompt（一次性设置）
llm.system_message(system_prompt)

# 添加历史消息
for msg in chat_history:
    if msg["role"] == "user":
        llm.user_message(msg["content"])
    elif msg["role"] == "model":
        llm.ai_message(msg["content"])  # Gemini.py 内部转换为 "model"

# 添加新用户消息
llm.user_message(user_message)

# 获取回复
response = llm.get_response(temperature=0.8)
```

### 6.4 角色信息加载

```python
def load_character_info(self, role_code, scroll_id):
    """
    加载角色信息（参考 server.py 中的逻辑）
    """
    # 1. 获取书卷信息
    scroll = db.get_scroll(scroll_id)
    preset_path = scroll.get('preset_path')
    
    # 2. 加载预设文件
    preset_data = load_json_file(preset_path)
    role_file_dir = preset_data.get('role_file_dir', './data/roles/')
    source = preset_data.get('source', '')
    
    # 3. 查找角色文件路径
    role_path = find_role_path(role_code, role_file_dir, source)
    
    # 4. 加载 role_info.json
    role_info_path = os.path.join(role_path, "role_info.json")
    role_info = load_json_file(role_info_path)
    
    # 5. 加载世界观（可选）
    world_file_path = preset_data.get('world_file_path', '')
    world_description = ""
    if world_file_path and os.path.exists(world_file_path):
        world_data = load_json_file(world_file_path)
        world_description = world_data.get('description', '')
    
    return role_info, world_description
```

## 七、与现有系统的集成

### 7.1 从 intro.html 跳转

修改 `frontend/js/intro.js`：

```javascript
function enterChatMode(roleCode) {
    const params = new URLSearchParams({
        scroll_id: scrollId,
        role_code: roleCode,
        mode: 'chat'
    });
    window.location.href = `/frontend/pages/chat.html?${params.toString()}`;
}
```

### 7.2 使用现有的工具函数

- `sw_utils.load_json_file()` - 加载 JSON 文件
- `sw_utils.get_child_folders()` / `get_grandchild_folders()` - 查找角色路径
- `modules.llm.Gemini` - Gemini API 调用
- `database.db` - 数据库操作

### 7.3 复用现有样式

- 参考 `intro.css` 的古风设计
- 复用按钮、卡片等组件样式
- 保持整体视觉一致性

## 八、注意事项

1. **SillyTavern-release 文件夹会被清除**
   - 需要提取的逻辑已记录在 `SILLYTAVERN_ANALYSIS.md`
   - 实现时参考该文档，不直接复制文件

2. **模型配置**
   - 确保 `config.json` 中有 `GEMINI_API_KEY`
   - 使用 `gemini-2.5-flash-lite` 模型

3. **错误处理**
   - API 调用失败时的回退机制
   - 角色信息加载失败的处理
   - 用户友好的错误提示

4. **性能优化**
   - 历史消息限制（避免 token 超限）
   - 消息缓存机制
   - 异步处理优化

5. **页面风格**
   - 保持 ScrollWeaver 的古风雅集风格
   - 与 intro.html 风格一致
   - 响应式设计

## 九、测试计划

1. **单元测试**
   - ChatPerformer 的 System Prompt 构建
   - 消息历史管理
   - Gemini API 调用

2. **集成测试**
   - 完整的消息发送流程
   - 历史加载和保存
   - 会话创建和清理

3. **UI 测试**
   - 页面跳转
   - 消息显示
   - 输入和发送

## 十、后续优化方向

1. **流式响应**：支持实时显示生成过程
2. **消息编辑**：允许编辑和重新生成
3. **历史导出**：导出对话记录
4. **多轮对话优化**：智能总结历史，减少 token 消耗
5. **角色切换**：在同一会话中切换不同角色（高级功能）

