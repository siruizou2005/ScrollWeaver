// message.js
document.addEventListener('DOMContentLoaded', function() {
    const chatMessages = document.querySelector('.chat-messages');
    const textarea = document.querySelector('textarea');
    const sendButton = document.querySelector('.send-btn');
    const controlBtn = document.getElementById('controlBtn');
    const stopBtn = document.getElementById('stopBtn');
    const exportStoryBtn = document.getElementById('exportStoryBtn');
    
    // 生成随机的客户端ID
    const clientId = Math.random().toString(36).substring(7);
    
    // WebSocket连接
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${clientId}`);
    window.ws = ws

    let isPlaying = false;
    // 添加场景相关属性
    let currentSceneFilter = null;
    let startButtonText =  translations[window.i18n.currentLang]['start'];
    // 全局编辑状态，避免为每条消息注册 document 监听
    let currentEditingMessage = null;
    let currentEditingOriginalText = '';
    // 用户选择的角色
    let selectedRoleName = null;
    let waitingForInput = false;
    // 控制按钮点击事件
    controlBtn.addEventListener('click', function() {
        if (!isPlaying) {
            // 开始
            ws.send(JSON.stringify({
                type: 'control',
                action: 'start'
            }));
            startButtonText =  translations[window.i18n.currentLang]['pause']
            controlBtn.innerHTML = `<i class="fas fa-pause"></i><span data-i18n="pause">${startButtonText}</span>`;
            isPlaying = true;
        } else {
            // 暂停
            ws.send(JSON.stringify({
                type: 'control',
                action: 'pause'
            }));
            startButtonText =  translations[window.i18n.currentLang]['start']
            controlBtn.innerHTML = `<i class="fas fa-play"></i><span data-i18n="pause">${startButtonText}</span>`;
            isPlaying = false;
        }
    });

    // 停止按钮点击事件
    stopBtn.addEventListener('click', function() {
        ws.send(JSON.stringify({
            type: 'control',
            action: 'stop'
        }));
        controlBtn.innerHTML = '<i class="fas fa-play"></i><span>开始</span>';
        isPlaying = false;
    });

    // WebSocket事件处理
    ws.onopen = function() {
        console.log('WebSocket连接已建立');
        addSystemMessage('连接已建立');
    };
    
    ws.onclose = function() {
        console.log('WebSocket连接已关闭');
        addSystemMessage('连接已断开');
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket错误:', error);
        addSystemMessage('连接错误');
    };
    
    ws.onmessage = function(event) {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        // 创建自定义事件来分发 WebSocket 消息
        const wsEvent = new CustomEvent('websocket-message', {
            detail: message
        });
        window.dispatchEvent(wsEvent);

        // 消息处理逻辑
        if (message.type === 'waiting_for_user_input') {
            // 等待用户输入
            waitingForInput = true;
            textarea.placeholder = `请输入 ${message.data.role_name} 的内容...`;
            textarea.disabled = false;
            textarea.focus();
            addSystemMessage(`等待输入：${message.data.role_name} - ${message.data.message}`);
        }
        else if (message.type === 'role_selected') {
            // 角色选择成功
            selectedRoleName = message.data.role_name;
            addSystemMessage(message.data.message);
        }
        else if (message.type === 'error') {
            // 错误消息
            addSystemMessage(`错误: ${message.data.message}`);
        }
        else if (message.type === 'story_ended') {
            // 故事结束
            addSystemMessage(message.data.message);
            isPlaying = false;
            controlBtn.innerHTML = '<i class="fas fa-play"></i><span data-i18n="start">开始</span>';
        }
        else if (message.type === 'message') {
            // 从状态中获取当前场景编号
            const sceneNumber = message.data.scene; // 确保消息中包含场景信息
            if (sceneNumber !== undefined) {
                // 触发场景更新事件
                window.dispatchEvent(new CustomEvent('scene-update', {
                    detail: { scene: sceneNumber }
                }));
            }
            if (message.data.type === 'system') {
                addSystemMessage(message.data.text);
            } 
            else if (message.data.type === 'story') {
                // 为故事消息添加特殊样式
                const messageElement = document.createElement('div');
                messageElement.className = 'message story-message';
                messageElement.innerHTML = `
                    <div class="content">
                        <div class="header">
                            <span class="username">故事总结</span>
                            <span class="timestamp">${message.data.timestamp}</span>
                        </div>
                        <div class="text">${message.data.text}</div>
                    </div>
                `;
                chatMessages.appendChild(messageElement);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
            else {
                renderMessage(message.data);
            }
        }
        else if (message.type === 'initial_data') {
            // 清空现有消息，处理初始数据
            chatMessages.innerHTML = '';
            
            if (message.data.history_messages) {
                loadHistoryMessages(message.data.history_messages);
            }
            else {
                loadHistoryMessages([]);
            }
        }
    };

    function loadHistoryMessages(messages) {
        // 清空现有消息
        chatMessages.innerHTML = '';
        
        messages.forEach(message => {
            renderMessage(message);
        });

        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        console.log(`Loaded ${messages.length} historical messages`);
    }

    // 渲染消息
    function renderMessage(message) {
    const messageElement = document.createElement('div');
    // 支持基于来源的样式：如果消息包含 from/is_user 字段，则加上 user/npc 类
    const srcClass = (message.from === 'user' || message.is_user) ? ' user' : ' npc';
    messageElement.className = 'message' + srcClass;
        messageElement.dataset.timestamp = message.timestamp;
        messageElement.dataset.username = message.username;
        
        // 添加场景属性
        if (message.scene !== undefined) {
            messageElement.dataset.scene = message.scene;
            console.log(`Rendering message for scene ${message.scene}`);
        }
        
        // Note: avatar/icon intentionally not rendered in chat (requirement: remove avatars)
        messageElement.innerHTML = `
            <div class="content">
                <div class="header">
                    <a href="#" class="username profile-link">${message.username}</a>
                    <span class="timestamp">${message.timestamp}</span>
                </div>
                <div class="text-wrapper">
                    <div class="text">${message.text}</div>
                    <button class="edit-icon"><i class="fas fa-pen"></i></button>
                    <div class="edit-buttons" style="display: none;">
                        <button class="edit-btn save-btn">保存</button>
                        <button class="edit-btn cancel-btn">取消</button>
                    </div>
                </div>
            </div>
        `;
    
        // 获取元素引用
        const textElement = messageElement.querySelector('.text');
        const editButtons = messageElement.querySelector('.edit-buttons');
        const editIcon = messageElement.querySelector('.edit-icon');

        // 存储原始文本并使用全局编辑状态管理
        const originalText = message.text;

        // 点击铅笔图标进入编辑模式
        editIcon.addEventListener('click', () => {
            // 如果已有其他编辑中的消息，先退出它（回退）
            if (currentEditingMessage && currentEditingMessage !== messageElement) {
                exitEditMode(currentEditingMessage, true);
            }
            currentEditingMessage = messageElement;
            currentEditingOriginalText = originalText;
            editButtons.style.display = 'flex';
            textElement.classList.add('editing');
            textElement.setAttribute('contenteditable', 'true');
            textElement.focus();
        });

        // 保存按钮点击事件
        messageElement.querySelector('.save-btn').addEventListener('click', () => {
            const newText = textElement.textContent.trim();
            if (newText !== originalText) {
                ws.send(JSON.stringify({
                    type: 'edit_message',
                    data: { uuid: message.uuid, text: newText }
                }));
                currentEditingOriginalText = newText;
            }
            exitEditMode(messageElement, false);
        });

        // 取消按钮点击事件
        messageElement.querySelector('.cancel-btn').addEventListener('click', () => {
            textElement.textContent = currentEditingOriginalText || originalText;
            exitEditMode(messageElement, true);
        });

        // 处理快捷键（仅在编辑时）
        textElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                messageElement.querySelector('.save-btn').click();
            }
            if (e.key === 'Escape') {
                messageElement.querySelector('.cancel-btn').click();
            }
        });

        // 防止消息点击冒泡到全局点击（全局点击用于退出编辑）
        messageElement.addEventListener('click', function(event) {
            event.stopPropagation();
        });

        function exitEditMode(msgEl, revert) {
            if (!msgEl) return;
            const txtEl = msgEl.querySelector('.text');
            const btns = msgEl.querySelector('.edit-buttons');
            if (btns) btns.style.display = 'none';
            if (txtEl) {
                txtEl.classList.remove('editing');
                txtEl.removeAttribute('contenteditable');
                txtEl.blur();
                if (revert) txtEl.textContent = currentEditingOriginalText || originalText;
            }
            if (currentEditingMessage === msgEl) {
                currentEditingMessage = null;
                currentEditingOriginalText = '';
            }
        }
    
        // 根据当前场景筛选器决定是否显示
        if (currentSceneFilter !== null) {
            messageElement.style.display = 
                (String(message.scene) === String(currentSceneFilter)) ? '' : 'none';
        }

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    // 添加系统消息
    function addSystemMessage(text) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message system';
        messageElement.innerHTML = `
            <div class="content">
                <div class="text">${text}</div>
            </div>
        `;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 发送消息
    function sendMessage() {
        const text = textarea.value.trim();
        if (!text) {
            // 空输入提示
            if (waitingForInput) {
                alert('请输入内容');
            }
            return;
        }
        
        if (ws.readyState === WebSocket.OPEN) {
            const message = {
                type: 'user_message',
                text: text,
                timestamp: new Date().toLocaleString()
            };
            ws.send(JSON.stringify(message));
            textarea.value = '';
            
            // 如果正在等待输入，重置状态
            if (waitingForInput) {
                waitingForInput = false;
                textarea.placeholder = 'input';
            }
        }
    }

    // 角色选择按钮
    const selectRoleBtn = document.getElementById('selectRoleBtn');
    selectRoleBtn.addEventListener('click', function() {
        // 获取所有角色
        const profiles = window.characterProfiles && window.characterProfiles.allCharacters ? 
            window.characterProfiles.allCharacters : 
            (window.characterProfiles && window.characterProfiles.characters ? 
                window.characterProfiles.characters : []);
        
        if (profiles.length === 0) {
            alert('暂无可用角色');
            return;
        }
        
        // 创建角色选择对话框
        const roleList = profiles.map((char, idx) => 
            `${idx + 1}. ${char.name || char.nickname}`
        ).join('\n');
        
        const roleIndex = prompt(`请选择角色（输入序号）：\n\n${roleList}\n\n输入序号：`);
        
        if (roleIndex) {
            const index = parseInt(roleIndex) - 1;
            if (index >= 0 && index < profiles.length) {
                const selectedChar = profiles[index];
                const roleName = selectedChar.name || selectedChar.nickname;
                selectedRoleName = roleName;
                
                // 发送角色选择消息
                ws.send(JSON.stringify({
                    type: 'select_role',
                    role_name: roleName
                }));
                
                selectRoleBtn.innerHTML = `<i class="fas fa-user-check"></i><span>${roleName}</span>`;
                selectRoleBtn.style.background = '#1e293b';
            }
        }
    });

    // 绑定发送按钮点击事件
    sendButton.addEventListener('click', sendMessage);

    // 绑定回车键发送
    textarea.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // 角色名点击 -> 打开角色档案弹窗（弹窗内容不包含动机）
    document.addEventListener('click', function (e) {
        const target = e.target;
        if (target && target.classList && target.classList.contains('profile-link')) {
            e.preventDefault();
            const name = target.textContent.trim();
            openProfileModalByName(name);
        }
    });

    // 全局文档点击：用于退出任何打开的编辑模式（回退不保存）
    document.addEventListener('click', function (e) {
        if (currentEditingMessage && !currentEditingMessage.contains(e.target)) {
            const txt = currentEditingMessage.querySelector('.text');
            if (txt) txt.textContent = currentEditingOriginalText || txt.textContent;
            const btns = currentEditingMessage.querySelector('.edit-buttons');
            if (btns) btns.style.display = 'none';
            if (txt) {
                txt.classList.remove('editing');
                txt.removeAttribute('contenteditable');
            }
            currentEditingMessage = null;
            currentEditingOriginalText = '';
        }
    });

    function openProfileModalByName(name) {
        const modal = document.getElementById('profile-modal');
        if (!modal) return;
        // Try to find character data from the left-side CharacterProfiles instance
        const profiles = window.characterProfiles && window.characterProfiles.allCharacters ? window.characterProfiles.allCharacters : (window.characterProfiles && window.characterProfiles.characters ? window.characterProfiles.characters : []);
        let character = profiles.find(c => String(c.name || c.nickname || c.id) === String(name) || String(c.nickname || '') === String(name));
        // Fallback: try matching by nickname or id
        if (!character) {
            character = profiles.find(c => (c.nickname && c.nickname === name));
        }

        // Populate modal (do not show motivation)
        const nameEl = modal.querySelector('.modal-name');
        const descEl = modal.querySelector('.modal-description');
        const avatarEl = modal.querySelector('.modal-avatar');
        const locEl = modal.querySelector('.modal-location');
        const goalEl = modal.querySelector('.modal-goal');
        const stateEl = modal.querySelector('.modal-state');

        if (character) {
            nameEl.textContent = character.name || character.nickname || name;
            descEl.textContent = character.description || character.brief || '';
            avatarEl.src = character.icon || './frontend/assets/images/default-icon.jpg';
            locEl.textContent = character.location || '—';
            goalEl.textContent = character.goal || '—';
            stateEl.textContent = character.state || character.status || '—';
        } else {
            // Minimal fallback when no character data
            nameEl.textContent = name;
            descEl.textContent = '';
            avatarEl.src = './frontend/assets/images/default-icon.jpg';
            locEl.textContent = '—';
            goalEl.textContent = '—';
            stateEl.textContent = '—';
        }

        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        // Close handlers (支持 overlay 点击和 ESC 键)
        const closeBtn = modal.querySelector('.modal-close');
        const overlay = modal.querySelector('.modal-overlay');
        function close() {
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
            closeBtn.removeEventListener('click', close);
            overlay.removeEventListener('click', close);
            document.removeEventListener('keydown', onKeyDown);
        }
        function onKeyDown(e) {
            if (e.key === 'Escape') close();
        }
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', close);
        document.addEventListener('keydown', onKeyDown);
    }
    
    // 监听场景选择事件
    window.addEventListener('scene-selected', (event) => {
        const selectedScene = event.detail.scene;
        currentSceneFilter = selectedScene;
        
        // 更新所有消息的显示状态
        document.querySelectorAll('.message').forEach(msg => {
            if (selectedScene === null) {
                msg.style.display = '';
            } else {
                msg.style.display = 
                    (msg.dataset.scene === String(selectedScene)) ? '' : 'none';
            }
        });
        
        // 滚动到可见的第一条消息
        const visibleMessages = document.querySelectorAll('.message[style=""]');
        if (visibleMessages.length > 0) {
            visibleMessages[0].scrollIntoView({ behavior: 'smooth' });
        }
    });

    // 添加导出故事按钮的点击事件
    exportStoryBtn.addEventListener('click', function() {
        ws.send(JSON.stringify({
            type: 'generate_story'
        }));
    });
});
