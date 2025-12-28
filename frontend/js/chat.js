/**
 * 私语模式聊天页面逻辑
 */

// 全局变量
let sessionId = null;
let scrollId = null;
let roleCode = null;
let userName = '用户';
let characterName = '';
let characterNickname = '';
let characterAvatar = '';
let token = null;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 获取URL参数
    const urlParams = new URLSearchParams(window.location.search);
    scrollId = urlParams.get('scroll_id');
    roleCode = urlParams.get('role_code');
    userName = urlParams.get('user_name') || '用户';

    if (!scrollId || !roleCode) {
        alert('缺少必要参数：scroll_id 或 role_code');
        window.location.href = '/frontend/pages/plaza.html';
        return;
    }

    // 获取token
    token = localStorage.getItem('token');
    if (!token) {
        alert('请先登录');
        window.location.href = '/frontend/pages/login.html';
        return;
    }

    // 绑定事件监听器
    bindEventListeners();

    // 初始化聊天
    await initChat();
});

/**
 * 绑定事件监听器
 */
function bindEventListeners() {
    // 返回按钮
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // 尝试获取 world_session_id 返回 world-view
            const worldSessionId = new URLSearchParams(window.location.search).get('world_session_id');
            const chatSessionId = sessionId; // 这里的 sessionId 是私语模式的聊天 session_id

            if (worldSessionId) {
                // 如果有 World Session ID，说明是从 Session Mode 过来的，返回 Session Mode
                window.location.href = `/frontend/pages/world-view.html?session_id=${worldSessionId}&scroll_id=${scrollId}&from_chat=1&chat_session_id=${chatSessionId}`;
            } else {
                // 否则返回 View Mode
                window.location.href = `/frontend/pages/world-view.html?scroll_id=${scrollId}&from_chat=1&chat_session_id=${chatSessionId}`;
            }
        });
    }

    // 发送按钮
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }

    // 输入框回车发送（Shift+Enter换行）
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // 输入框自动调整高度
        messageInput.addEventListener('input', () => {
            messageInput.style.height = 'auto';
            messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
        });
    }

    // 清空历史按钮
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearHistory);
    }
}

/**
 * 初始化聊天
 */
async function initChat() {
    try {
        showLoading(true);

        // 1. 加载角色信息
        await loadCharacterInfo();

        // 2. 创建或获取会话
        await createOrGetSession();

        // 3. 加载历史消息
        await loadHistory();

        showLoading(false);

        // 聚焦输入框
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.focus();
        }
    } catch (error) {
        console.error('初始化聊天失败:', error);
        alert('初始化聊天失败: ' + error.message);
        showLoading(false);
    }
}

/**
 * 加载角色信息
 */
async function loadCharacterInfo() {
    try {
        const response = await fetch(`/api/scroll/${scrollId}/character/${roleCode}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('加载角色信息失败');
        }

        const data = await response.json();
        const character = data.character;

        characterName = character.name || character.code;
        characterNickname = character.nickname || '';
        characterAvatar = character.avatar || '';

        // 更新UI
        const characterNameEl = document.getElementById('characterName');
        const characterNicknameEl = document.getElementById('characterNickname');
        const avatarContainer = document.getElementById('characterAvatar');

        if (characterNameEl) {
            characterNameEl.textContent = characterName;
        }

        if (characterNicknameEl) {
            if (characterNickname && characterNickname !== characterName) {
                characterNicknameEl.textContent = `(${characterNickname})`;
            } else {
                characterNicknameEl.textContent = '';
            }
        }

        // 更新头像
        if (avatarContainer) {
            if (characterAvatar) {
                avatarContainer.innerHTML = `<img src="${characterAvatar}" alt="${characterName}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-user-circle\\'></i>';" />`;
            }
        }
    } catch (error) {
        console.error('加载角色信息失败:', error);
        throw error;
    }
}

/**
 * 创建或获取会话
 */
async function createOrGetSession() {
    try {
        // 获取当前用户身份信息（从localStorage的selected_role）
        let currentUserName = userName;
        let userIdentity = '';
        let userProfile = '';
        const savedRole = localStorage.getItem('selected_role');
        if (savedRole) {
            try {
                const role = JSON.parse(savedRole);
                // 如果用户选择了角色（不是默认的"用户"），使用角色信息
                if (role.name && role.name !== '用户') {
                    currentUserName = role.name;
                    userIdentity = role.identity || '';
                    userProfile = role.profile || role.description || '';
                }
            } catch (e) {
                console.warn('解析已选角色失败:', e);
            }
        }

        // 更新全局userName
        userName = currentUserName;

        // 尝试从localStorage获取已有会话
        const savedSession = localStorage.getItem(`chat_session_${scrollId}_${roleCode}`);
        if (savedSession) {
            const sessionData = JSON.parse(savedSession);

            // 检查是否为同一个用户角色（防止切换角色后继续使用旧会话）
            const savedUserName = sessionData.user_name || '';
            if (savedUserName && savedUserName !== currentUserName) {
                // 用户角色已更换，需要创建新会话
                console.log(`用户角色已更换: ${savedUserName} -> ${currentUserName}，创建新会话`);
                localStorage.removeItem(`chat_session_${scrollId}_${roleCode}`);
            } else {
                sessionId = sessionData.session_id;

                // 验证会话是否仍然有效
                try {
                    const response = await fetch(`/api/chat/history/${sessionId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (response.ok) {
                        // 会话有效，使用已有会话
                        return;
                    }
                } catch (e) {
                    // 会话无效，创建新会话
                }
            }
        }

        // 创建新会话
        const response = await fetch('/api/chat/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                scroll_id: parseInt(scrollId),
                role_code: roleCode,
                user_name: userName,
                user_identity: userIdentity,
                user_profile: userProfile
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: '创建会话失败' }));
            throw new Error(errorData.detail || '创建会话失败');
        }

        const data = await response.json();
        sessionId = data.session_id;

        // 保存会话ID到localStorage（包含user_name以便检测角色切换）
        localStorage.setItem(`chat_session_${scrollId}_${roleCode}`, JSON.stringify({
            session_id: sessionId,
            user_name: userName,
            created_at: new Date().toISOString()
        }));
    } catch (error) {
        console.error('创建会话失败:', error);
        throw error;
    }
}

/**
 * 加载历史消息
 */
async function loadHistory() {
    try {
        if (!sessionId) {
            return;
        }

        const response = await fetch(`/api/chat/history/${sessionId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('加载历史消息失败');
        }

        const data = await response.json();
        const history = data.history || [];

        // 清空消息容器
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) {
            console.warn('消息容器未找到');
            return;
        }

        messagesContainer.innerHTML = '';

        // 渲染历史消息
        history.forEach(msg => {
            renderMessage(msg);
        });

        // 滚动到底部
        scrollToBottom();
    } catch (error) {
        console.error('加载历史消息失败:', error);
        // 不抛出错误，允许继续使用
    }
}

/**
 * 发送消息
 */
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    if (!messageInput || !sendBtn) {
        console.error('输入框或发送按钮未找到');
        return;
    }

    const message = messageInput.value.trim();

    if (!message) {
        return;
    }

    if (!sessionId) {
        alert('会话未初始化，请刷新页面重试');
        return;
    }

    // 禁用输入和发送按钮
    messageInput.disabled = true;
    sendBtn.disabled = true;

    try {
        // 显示用户消息
        renderMessage({
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });

        // 清空输入框
        messageInput.value = '';
        messageInput.style.height = 'auto';

        // 显示"正在输入"提示
        const typingMessage = renderTypingMessage();

        // 发送消息到服务器
        const response = await fetch('/api/chat/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                session_id: sessionId,
                message: message,
                temperature: 0.8
            })
        });

        // 移除"正在输入"提示
        if (typingMessage) {
            typingMessage.remove();
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: '发送消息失败' }));
            throw new Error(errorData.detail || '发送消息失败');
        }

        const data = await response.json();

        // 显示角色回复
        renderMessage({
            role: 'model',
            content: data.message,
            timestamp: data.timestamp || new Date().toISOString()
        });

        // 滚动到底部
        scrollToBottom();
    } catch (error) {
        console.error('发送消息失败:', error);
        alert('发送消息失败: ' + error.message);
    } finally {
        // 恢复输入和发送按钮
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

/**
 * 渲染消息
 */
function renderMessage(msg) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        console.warn('消息容器未找到，无法渲染消息');
        return null;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.role === 'user' ? 'user' : 'character'}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = msg.content || '';

    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'message-timestamp';
    timestampDiv.textContent = formatTimestamp(msg.timestamp);

    contentDiv.appendChild(timestampDiv);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);

    return messageDiv;
}

/**
 * 渲染"正在输入"提示
 */
function renderTypingMessage() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        console.warn('消息容器未找到，无法渲染输入提示');
        return null;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message character typing';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = '正在输入...';

    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);

    return messageDiv;
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp) {
    if (!timestamp) {
        return '';
    }

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) { // 1分钟内
        return '刚刚';
    } else if (diff < 3600000) { // 1小时内
        return `${Math.floor(diff / 60000)}分钟前`;
    } else if (diff < 86400000) { // 24小时内
        return `${Math.floor(diff / 3600000)}小时前`;
    } else {
        return date.toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

/**
 * 清空历史
 */
async function clearHistory() {
    if (!confirm('确定要清空对话历史吗？')) {
        return;
    }

    if (!sessionId) {
        return;
    }

    try {
        const response = await fetch(`/api/chat/clear/${sessionId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('清空历史失败');
        }

        // 清空消息显示
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
    } catch (error) {
        console.error('清空历史失败:', error);
        alert('清空历史失败: ' + error.message);
    }
}

/**
 * 显示/隐藏加载状态
 */
function showLoading(show) {
    const messagesLoading = document.getElementById('messagesLoading');
    const messagesContainer = document.getElementById('messagesContainer');

    if (!messagesLoading || !messagesContainer) {
        console.warn('消息容器元素未找到');
        return;
    }

    if (show) {
        messagesLoading.style.display = 'flex';
        messagesContainer.style.display = 'none';
    } else {
        messagesLoading.style.display = 'none';
        messagesContainer.style.display = 'block';
    }
}

