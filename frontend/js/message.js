// message.js
document.addEventListener('DOMContentLoaded', function() {
    const chatMessages = document.querySelector('.chat-messages');
    const textarea = document.querySelector('textarea');
    const sendButton = document.querySelector('.send-btn');
    const controlBtn = document.getElementById('controlBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resetSessionBtn = document.getElementById('resetSessionBtn');
    const exportStoryBtn = document.getElementById('exportStoryBtn');
    
    // 生成随机的客户端ID
    const clientId = Math.random().toString(36).substring(7);
    
    // WebSocket连接
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${clientId}`);
    window.ws = ws

    // 辅助函数：安全地发送 WebSocket 消息
    function sendWebSocketMessage(message) {
        if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
            console.error('WebSocket is not connected. Message:', message);
            addSystemMessage('WebSocket连接未建立，请稍后再试');
            return false;
        }
        try {
            window.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            addSystemMessage('发送消息失败，请稍后再试');
            return false;
        }
    }

    let isPlaying = false;
    let currentRuntimeScene = null;
    // 添加场景相关属性
    let currentSceneFilter = null;
    // 跟踪是否正在加载（用于显示加载动画）
    let isLoadingStory = false;
    const getTranslation = (key) => {
        if (window.i18n && typeof window.i18n.get === 'function') {
            return window.i18n.get(key);
        }
        const lang = window.i18n?.currentLang || 'zh';
        return (translations?.[lang]?.[key]) ?? key;
    };
    const updateControlButtonUI = () => {
        if (!controlBtn) return;
        if (isPlaying) {
            const pauseLabel = getTranslation('pause');
            controlBtn.innerHTML = `<i class="fas fa-pause"></i><span data-i18n="pause">${pauseLabel}</span>`;
        } else {
            const startLabel = getTranslation('start');
            controlBtn.innerHTML = `<i class="fas fa-play"></i><span data-i18n="start">${startLabel}</span>`;
        }
    };
    const applySceneFilter = () => {
        const hasFilter = currentSceneFilter !== null && currentSceneFilter !== undefined;
        const filterValue = hasFilter ? String(currentSceneFilter) : null;
        document.querySelectorAll('.message').forEach(msg => {
            if (!hasFilter) {
                msg.style.display = '';
            } else {
                const msgScene = msg.dataset.scene;
                // Normalize both values to strings for comparison
                const msgSceneStr = msgScene !== undefined && msgScene !== null ? String(msgScene) : '';
                msg.style.display = (msgSceneStr === filterValue) ? '' : 'none';
            }
        });
        if (!hasFilter) return;
        const visibleMessages = Array.from(document.querySelectorAll('.message')).filter(msg => msg.style.display === '');
        if (visibleMessages.length > 0) {
            visibleMessages[0].scrollIntoView({ behavior: 'smooth' });
        } else {
            // If no messages visible, log for debugging
            console.log(`No messages found for scene ${filterValue}. Total messages: ${document.querySelectorAll('.message').length}`);
        }
    };
    const updatePlayingState = (playing, source = 'ui') => {
        const normalized = Boolean(playing);
        if (isPlaying === normalized) {
            if (source === 'language-change') {
                updateControlButtonUI();
            }
            return;
        }
        isPlaying = normalized;
        updateControlButtonUI();
        if (isPlaying) {
            currentSceneFilter = null;
            applySceneFilter();
        }
        window.dispatchEvent(new CustomEvent('simulation-state-change', {
            detail: {
                playing: isPlaying,
                source
            }
        }));
    };
    window.setIsPlaying = (playing, source = 'external') => updatePlayingState(playing, source);
    window.getIsPlaying = () => isPlaying;
    window.getCurrentRuntimeScene = () => currentRuntimeScene;
    window.requestSceneCharacters = function(scene, context = 'runtime') {
        if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
            console.warn('Cannot request scene characters: WebSocket not connected');
            return false;
        }
        try {
            window.ws.send(JSON.stringify({
                type: 'request_scene_characters',
                scene,
                context
            }));
            return true;
        } catch (err) {
            console.error('Failed to request scene characters:', err);
            return false;
        }
    };
    const normalizeSceneIdentifier = (sceneValue) => {
        if (sceneValue === undefined || sceneValue === null || sceneValue === '') {
            return null;
        }
        const numeric = Number(sceneValue);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
        return sceneValue;
    };
    const broadcastStatus = (statusData, origin = 'status_update') => {
        if (!statusData) return;
        const sceneIdentifier = normalizeSceneIdentifier(statusData.current_scene);
        if (sceneIdentifier !== null) {
            window.dispatchEvent(new CustomEvent('scene-update', {
                detail: {
                    scene: sceneIdentifier,
                    source: origin === 'initial' ? 'status-initial' : 'status-update'
                }
            }));
            currentRuntimeScene = sceneIdentifier;
        } else if (currentRuntimeScene !== null) {
            currentRuntimeScene = null;
            window.dispatchEvent(new CustomEvent('scene-update', {
                detail: {
                    scene: null,
                    source: origin === 'initial' ? 'status-initial' : 'status-update'
                }
            }));
        }
        window.dispatchEvent(new CustomEvent('status-sync', {
            detail: {
                status: statusData,
                origin
            }
        }));
    };
    window.addEventListener('language-changed', () => {
        updatePlayingState(isPlaying, 'language-change');
    });
    // 全局编辑状态，避免为每条消息注册 document 监听
    let currentEditingMessage = null;
    let currentEditingOriginalText = '';
    // 用户选择的角色
    let selectedRoleName = null;
    let waitingForInput = false;
    const autoCompleteBtn = document.getElementById('autoCompleteBtn');
    
    // 初始化输入框状态：默认禁用
    textarea.disabled = true;
    textarea.placeholder = '等待您的回合...';
    if (autoCompleteBtn) {
        autoCompleteBtn.style.display = 'none';
        autoCompleteBtn.disabled = false;
        autoCompleteBtn.style.opacity = '1';
    }
    
    // 加载覆盖层相关函数
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const loadingSubtext = document.getElementById('loadingSubtext');
    
    function showLoadingOverlay(text = '正在初始化...', subtext = '请稍候，这可能需要一些时间') {
        if (loadingOverlay && loadingText && loadingSubtext) {
            loadingText.textContent = text;
            loadingSubtext.textContent = subtext;
            loadingOverlay.classList.add('active');
        }
    }
    
    function hideLoadingOverlay() {
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
        }
    }
    
    // 控制按钮点击事件 - 使用 sendWebSocketMessage 辅助函数
    controlBtn.addEventListener('click', function() {
        if (!isPlaying) {
            // 开始
            console.log('Sending start message');
            if (sendWebSocketMessage({
                type: 'control',
                action: 'start'
            })) {
                // 显示加载动画
                isLoadingStory = true;
                showLoadingOverlay('正在启动故事...', '正在设立角色动机，请稍候');
                controlBtn.classList.add('loading');
                controlBtn.disabled = true;
                updatePlayingState(true, 'ui');
            }
        } else {
            // 暂停
            console.log('Sending pause message');
            if (sendWebSocketMessage({
                type: 'control',
                action: 'pause'
            })) {
                updatePlayingState(false, 'ui');
            }
        }
    });

    // 停止按钮点击事件 - 使用 window.ws 而不是闭包中的 ws
    stopBtn.addEventListener('click', function() {
        console.log('Sending stop message');
        if (sendWebSocketMessage({
            type: 'control',
            action: 'stop'
        })) {
            updatePlayingState(false, 'stop');
        }
    });

    // 重置会话按钮点击事件
    resetSessionBtn.addEventListener('click', function() {
        if (confirm('确定要重置所有当前对话的临时session内容吗？此操作不可撤销。')) {
            // 发送重置请求
            if (sendWebSocketMessage({
                type: 'reset_session'
            })) {
                // 禁用按钮，显示加载状态
                resetSessionBtn.disabled = true;
                resetSessionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>重置中...</span>';
            }
        }
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
    
    // 将消息处理逻辑提取为函数，以便在新连接中重用
    function handleWebSocketMessage(event) {
        const message = JSON.parse(event.data);
        console.log('Received WebSocket message:', message.type, message);
        // 创建自定义事件来分发 WebSocket 消息
        const wsEvent = new CustomEvent('websocket-message', {
            detail: message
        });
        window.dispatchEvent(wsEvent);

        // 消息处理逻辑
        if (message.type === 'waiting_for_user_input') {
            // 等待用户输入 - 这是唯一允许用户输入的情况
            console.log('Enabling input for user role:', message.data.role_name);
            waitingForInput = true;
            textarea.placeholder = `请输入 ${message.data.role_name} 的内容...`;
            textarea.disabled = false;
            textarea.focus();
            // 显示AI自动完成按钮
            if (autoCompleteBtn) {
                autoCompleteBtn.style.display = 'flex';
                autoCompleteBtn.disabled = false;
                autoCompleteBtn.style.opacity = '1';
                autoCompleteBtn.title = window.i18n?.get('autoComplete') ?? 'AI自动完成';
            }
            addSystemMessage(`等待输入：${message.data.role_name} - ${message.data.message}`);
        }
        else if (message.type === 'role_selected') {
            // 角色选择成功
            selectedRoleName = message.data.role_name;
            addSystemMessage(message.data.message);
            
            // 查找并显示选中的角色
            if (window.characterProfiles) {
                const allChars = window.characterProfiles.allCharacters || window.characterProfiles.characters || [];
                const selectedChar = allChars.find(c => 
                    (c.name && c.name === message.data.role_name) || 
                    (c.nickname && c.nickname === message.data.role_name)
                );
                if (selectedChar) {
                    showSelectedCharacter(selectedChar);
                } else {
                    // 如果找不到，从DOM中获取
                    const cards = document.querySelectorAll('.character-card');
                    cards.forEach(card => {
                        const nameEl = card.querySelector('.character-name');
                        if (nameEl && nameEl.textContent.trim() === message.data.role_name) {
                            const descEl = card.querySelector('.character-description');
                            const locationEl = card.querySelector('.character-location');
                            const goalEl = card.querySelector('.character-goal');
                            const stateEl = card.querySelector('.character-state');
                            
                            showSelectedCharacter({
                                name: message.data.role_name,
                                nickname: message.data.role_name,
                                description: descEl ? descEl.textContent.trim() : '',
                                location: locationEl ? locationEl.textContent.replace('📍', '').trim() : '',
                                goal: goalEl ? goalEl.textContent.replace('🎯', '').trim() : '',
                                state: stateEl ? stateEl.textContent.replace('⚡', '').trim() : ''
                            });
                        }
                    });
                }
            }
        }
        else if (message.type === 'role_cleared') {
            selectedRoleName = null;
            addSystemMessage(message.data?.message || '已取消角色选择');
            resetSelectedCharacterUI();
        }
        else if (message.type === 'characters_list') {
            // 收到角色列表，更新本地数据
            if (window.characterProfiles && message.data.characters) {
                window.characterProfiles.updateCharacters(message.data.characters);
                // 提示用户可以重新选择
                addSystemMessage('角色列表已更新，请重新点击"选择角色"按钮');
            }
        }
        else if (message.type === 'error') {
            // 错误消息
            addSystemMessage(`错误: ${message.data.message}`);
            // 如果是"不是您的回合"的错误，确保输入框被禁用
            if (message.data.message && message.data.message.includes('不是您的回合')) {
                waitingForInput = false;
                textarea.disabled = true;
                textarea.placeholder = '等待您的回合...';
                if (autoCompleteBtn) {
                    autoCompleteBtn.style.display = 'none';
                    autoCompleteBtn.disabled = false;
                    autoCompleteBtn.style.opacity = '1';
                }
            }
            // 恢复自动完成按钮状态（如果正在等待输入）
            else if (autoCompleteBtn && waitingForInput) {
                autoCompleteBtn.disabled = false;
                autoCompleteBtn.style.opacity = '1';
            }
        }
        else if (message.type === 'story_exported') {
            // 故事导出成功
            showStoryModal(message.data.story, message.data.timestamp);
        }
        else if (message.type === 'auto_complete_options') {
            // AI生成了多个选项
            showAutoOptionsModal(message.data.options);
        }
        else if (message.type === 'auto_complete_success') {
            // AI自动完成成功
            if (autoCompleteBtn) {
                autoCompleteBtn.disabled = false;
                autoCompleteBtn.style.opacity = '1';
            }
        }
        else if (message.type === 'story_started') {
            if (message.data?.message) {
                addSystemMessage(message.data.message);
            }
            // 隐藏加载动画
            isLoadingStory = false;
            hideLoadingOverlay();
            if (controlBtn) {
                controlBtn.classList.remove('loading');
                controlBtn.disabled = false;
            }
            updatePlayingState(true, 'server');
            textarea.disabled = true;
            textarea.placeholder = '等待中...';
            if (autoCompleteBtn) {
                autoCompleteBtn.style.display = 'none';
                autoCompleteBtn.disabled = false;
                autoCompleteBtn.style.opacity = '1';
            }
        }
        else if (message.type === 'story_paused') {
            // 隐藏加载动画（如果还在显示）
            if (isLoadingStory) {
                isLoadingStory = false;
                hideLoadingOverlay();
                if (controlBtn) {
                    controlBtn.classList.remove('loading');
                    controlBtn.disabled = false;
                }
            }
            if (message.data?.message) {
                addSystemMessage(message.data.message);
            }
            updatePlayingState(false, 'server');
            waitingForInput = false;
            textarea.disabled = true;
            textarea.placeholder = '故事已暂停';
            if (autoCompleteBtn) {
                autoCompleteBtn.style.display = 'none';
                autoCompleteBtn.disabled = false;
                autoCompleteBtn.style.opacity = '1';
            }
        }
        else if (message.type === 'story_stopped') {
            // 隐藏加载动画（如果还在显示）
            if (isLoadingStory) {
                isLoadingStory = false;
                hideLoadingOverlay();
                if (controlBtn) {
                    controlBtn.classList.remove('loading');
                    controlBtn.disabled = false;
                }
            }
            if (message.data?.message) {
                addSystemMessage(message.data.message);
            }
            updatePlayingState(false, 'server');
            waitingForInput = false;
            textarea.disabled = true;
            textarea.placeholder = '故事已停止';
            if (autoCompleteBtn) {
                autoCompleteBtn.style.display = 'none';
                autoCompleteBtn.disabled = false;
                autoCompleteBtn.style.opacity = '1';
            }
        }
        else if (message.type === 'story_ended') {
            // 隐藏加载动画（如果还在显示）
            if (isLoadingStory) {
                isLoadingStory = false;
                hideLoadingOverlay();
                if (controlBtn) {
                    controlBtn.classList.remove('loading');
                    controlBtn.disabled = false;
                }
            }
            
            const endData = message.data || {};
            const primaryMessage = endData.message || '故事已结束';
            addSystemMessage(primaryMessage);
            if (endData.reason === 'error') {
                const detailParts = [endData.error_type, endData.error_message, endData.error_cause].filter(Boolean);
                if (detailParts.length > 0) {
                    addSystemMessage(`异常详情：${detailParts.join('；')}`);
                }
            } else if (endData.reason === 'invalid_message' && endData.detail) {
                addSystemMessage(`异常详情：${endData.detail}`);
            }
            updatePlayingState(false, 'story_ended');
            // 禁用输入框
            waitingForInput = false;
            textarea.disabled = true;
            if (endData.reason === 'error') {
                const placeholderDetail = endData.error_message || endData.error_type || primaryMessage;
                textarea.placeholder = `故事异常：${placeholderDetail}`;
            } else {
                textarea.placeholder = primaryMessage;
            }
            if (autoCompleteBtn) {
                autoCompleteBtn.style.display = 'none';
                autoCompleteBtn.disabled = false;
                autoCompleteBtn.style.opacity = '1';
            }
        }
        else if (message.type === 'message') {
            console.log('Processing message type:', message.type, 'data:', message.data);
            
            // 如果是第一条消息，隐藏加载动画
            if (isLoadingStory) {
                isLoadingStory = false;
                hideLoadingOverlay();
                if (controlBtn) {
                    controlBtn.classList.remove('loading');
                    controlBtn.disabled = false;
                }
            }
            
            // 从状态中获取当前场景编号
            const sceneNumber = message.data.scene; // 确保消息中包含场景信息
            const normalizedScene = normalizeSceneIdentifier(sceneNumber);
            if (normalizedScene !== null) {
                currentRuntimeScene = normalizedScene;
                window.dispatchEvent(new CustomEvent('scene-update', {
                    detail: { scene: normalizedScene, source: 'runtime' }
                }));
            }
            
            // 收到任何消息时，都应该禁用输入框（除非是 waiting_for_user_input）
            // 只有当服务器明确发送 waiting_for_user_input 时，才会重新启用输入框
            // 这确保了用户只能在轮到自己的角色时才能输入
            // 注意：用户输入的消息（is_user: true）在用户发送后已经禁用了输入框，
            // 但为了安全起见，这里再次检查并确保输入框被禁用
            if (waitingForInput) {
                console.log('Disabling input: received message while waiting for input, message is_user:', message.data.is_user);
                waitingForInput = false;
                textarea.disabled = true;
                textarea.placeholder = '等待中...';
                if (autoCompleteBtn) {
                    autoCompleteBtn.style.display = 'none';
                    autoCompleteBtn.disabled = false;
                    autoCompleteBtn.style.opacity = '1';
                }
            } else if (!textarea.disabled && !message.data.is_user) {
                // 额外的安全措施：如果输入框意外启用（不应该发生），收到非用户消息时禁用它
                console.warn('Input box was enabled when it should be disabled, disabling it now');
                textarea.disabled = true;
                textarea.placeholder = '等待您的回合...';
                if (autoCompleteBtn) {
                    autoCompleteBtn.style.display = 'none';
                    autoCompleteBtn.disabled = false;
                    autoCompleteBtn.style.opacity = '1';
                }
            }
            
            if (message.data.type === 'system') {
                console.log('Rendering system message:', message.data.text);
                addSystemMessage(message.data.text);
            } 
            else if (message.data.type === 'story') {
                console.log('Rendering story message');
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
                console.log('Rendering regular message:', message.data.username, message.data.text?.substring(0, 50));
                renderMessage(message.data);
            }
        }
        else if (message.type === 'initial_data') {
            // 清空现有消息，处理初始数据
            chatMessages.innerHTML = '';
            
            // 初始化时禁用输入框
            waitingForInput = false;
            textarea.disabled = true;
            textarea.placeholder = '等待您的回合...';
            if (autoCompleteBtn) {
                autoCompleteBtn.style.display = 'none';
                autoCompleteBtn.disabled = false;
                autoCompleteBtn.style.opacity = '1';
            }
            
            if (message.data.history_messages) {
                loadHistoryMessages(message.data.history_messages);
            }
            else {
                loadHistoryMessages([]);
            }

            if (message.data.status) {
                broadcastStatus(message.data.status, 'initial');
            }
        }
        else if (message.type === 'status_update') {
            broadcastStatus(message.data, 'status_update');
        }
        else if (message.type === 'clear_messages') {
            // 清空所有消息
            chatMessages.innerHTML = '';
            addSystemMessage('所有消息已清空');
        }
        else if (message.type === 'session_reset') {
            // Session重置成功
            addSystemMessage(message.data.message || 'Session已重置');
            // 显示刷新提示
            addSystemMessage('页面将在2秒后自动刷新...');
            
            // 延迟刷新页面，给用户时间看到提示信息
            setTimeout(function() {
                window.location.reload();
            }, 2000);
        }
    }
    
    // 将处理函数和辅助函数暴露到全局，以便新连接使用
    window.handleWebSocketMessage = handleWebSocketMessage;
    window.renderMessage = renderMessage;
    window.addSystemMessage = addSystemMessage;
    
    // 为原始连接设置消息处理器
    ws.onmessage = handleWebSocketMessage;

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
        
        // 添加场景属性（确保转换为字符串）
        if (message.scene !== undefined && message.scene !== null) {
            messageElement.dataset.scene = String(message.scene);
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
                sendWebSocketMessage({
                    type: 'edit_message',
                    data: { uuid: message.uuid, text: newText }
                });
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
        // 只有当等待用户输入时才能发送消息
        if (!waitingForInput) {
            console.warn('Cannot send message: not waiting for user input');
            addSystemMessage('当前不是您的回合，无法发送消息');
            return;
        }
        
        const text = textarea.value.trim();
        if (!text) {
            // 空输入提示
            alert('请输入内容');
            return;
        }
        
        const message = {
            type: 'user_message',
            text: text,
            timestamp: new Date().toLocaleString()
        };
        if (sendWebSocketMessage(message)) {
            textarea.value = '';
            
            // 发送消息后，禁用输入框，等待服务器响应
            waitingForInput = false;
            textarea.disabled = true;
            textarea.placeholder = '等待中...';
            // 隐藏AI自动完成按钮
            if (autoCompleteBtn) {
                autoCompleteBtn.style.display = 'none';
                autoCompleteBtn.disabled = false;
                autoCompleteBtn.style.opacity = '1';
            }
        }
    }

    // AI自动完成按钮点击事件
    if (autoCompleteBtn) {
        autoCompleteBtn.addEventListener('click', function() {
            if (waitingForInput) {
                // 发送自动完成请求
                if (sendWebSocketMessage({
                    type: 'auto_complete',
                    timestamp: new Date().toLocaleString()
                })) {
                    // 禁用按钮，防止重复点击
                    autoCompleteBtn.disabled = true;
                    autoCompleteBtn.style.opacity = '0.6';
                    const generatingMsg = window.i18n?.get('generatingAction') ?? '正在生成AI行动...';
                    addSystemMessage(generatingMsg);
                }
            }
        });
    }

    // 角色选择按钮
    const selectRoleBtn = document.getElementById('selectRoleBtn');
    selectRoleBtn.addEventListener('click', function() {
        showRoleSelectModal();
    });
    
    // 显示角色选择模态框
    function showRoleSelectModal() {
        // 优先从window.characterProfiles获取完整数据
        let profiles = [];
        if (window.characterProfiles) {
            // 尝试多种方式获取角色列表
            if (window.characterProfiles.allCharacters && window.characterProfiles.allCharacters.length > 0) {
                profiles = window.characterProfiles.allCharacters;
            } else if (window.characterProfiles.characters && window.characterProfiles.characters.length > 0) {
                profiles = window.characterProfiles.characters;
            }
        }
        
        console.log('角色选择 - window.characterProfiles:', window.characterProfiles);
        console.log('角色选择 - profiles from characterProfiles:', profiles.length);
        
        // 如果还没有，从DOM中获取
        if (profiles.length === 0) {
            const characterCards = document.querySelectorAll('.character-card');
            characterCards.forEach((card, idx) => {
                const nameEl = card.querySelector('.character-name');
                const descEl = card.querySelector('.character-description');
                const locationEl = card.querySelector('.character-location');
                const goalEl = card.querySelector('.character-goal');
                const stateEl = card.querySelector('.character-state');
                const iconEl = card.querySelector('.character-icon img');
                
                if (nameEl) {
                    const name = nameEl.textContent.trim();
                    const location = locationEl ? locationEl.textContent.replace('📍', '').trim() : '';
                    const goal = goalEl ? goalEl.textContent.replace('🎯', '').trim() : '';
                    const state = stateEl ? stateEl.textContent.replace('⚡', '').trim() : '';
                    const icon = iconEl ? iconEl.src : './frontend/assets/images/default-icon.jpg';
                    
                    // 提取描述
                    let description = '';
                    if (descEl) {
                        const fullDesc = descEl.querySelector('.full-desc');
                        const shortDesc = descEl.querySelector('.short-desc');
                        if (fullDesc && fullDesc.style.display !== 'none') {
                            description = fullDesc.textContent.trim();
                        } else if (shortDesc) {
                            description = shortDesc.textContent.trim();
                        } else {
                            description = descEl.textContent.trim();
                        }
                    }
                    
                    profiles.push({
                        name: name,
                        nickname: name,
                        description: description,
                        location: location,
                        goal: goal,
                        state: state,
                        icon: icon,
                        index: idx
                    });
                }
            });
        }
        
        if (profiles.length === 0) {
            // 从服务器请求
            sendWebSocketMessage({
                type: 'request_characters'
            });
            alert('正在加载角色列表，请稍后再试');
            return;
        }
        
        // 显示模态框
        const modal = document.getElementById('role-select-modal');
        const container = document.getElementById('roleCardsContainer');
        
        if (!modal || !container) {
            console.error('角色选择模态框元素未找到');
            return;
        }
        
        // 清空容器
        container.innerHTML = '';
        
        // 创建角色卡片
        profiles.forEach((character) => {
            const card = createRoleSelectCard(character);
            container.appendChild(card);
        });
        
        // 显示模态框
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        
        // 设置关闭事件
        const closeBtn = modal.querySelector('.modal-close');
        const overlay = modal.querySelector('.modal-overlay');
        
        function closeModal() {
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
            closeBtn.removeEventListener('click', closeModal);
            overlay.removeEventListener('click', closeModal);
            document.removeEventListener('keydown', onKeyDown);
        }
        
        function onKeyDown(e) {
            if (e.key === 'Escape') closeModal();
        }
        
        closeBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);
        document.addEventListener('keydown', onKeyDown);
    }
    
    // 创建角色选择卡片
    function createRoleSelectCard(character) {
        const card = document.createElement('div');
        card.className = 'role-select-card';
        card.setAttribute('data-role-name', character.name || character.nickname);
        
        const name = character.name || character.nickname || 'Unknown';
        const description = character.description || character.brief || '';
        const icon = character.icon || './frontend/assets/images/default-icon.jpg';
        const location = character.location || '';
        const goal = character.goal || '';
        const state = character.state || character.status || '';
        
        card.innerHTML = `
            <div class="role-select-card-header">
                <img class="role-select-card-avatar" src="${icon}" alt="${name}" onerror="this.src='./frontend/assets/images/default-icon.jpg'">
                <h3 class="role-select-card-name">${name}</h3>
            </div>
            ${description ? `<p class="role-select-card-description">${description}</p>` : ''}
            ${(location || goal || state) ? `
                <div class="role-select-card-details">
                    ${location ? `<div class="role-select-card-detail"><span class="role-select-card-detail-icon">📍</span><span>${location}</span></div>` : ''}
                    ${goal ? `<div class="role-select-card-detail"><span class="role-select-card-detail-icon">🎯</span><span>${goal}</span></div>` : ''}
                    ${state ? `<div class="role-select-card-detail"><span class="role-select-card-detail-icon">⚡</span><span>${state}</span></div>` : ''}
                </div>
            ` : ''}
        `;
        
        // 添加点击事件
        card.addEventListener('click', function() {
            handleRoleSelection(name, character);
            // 关闭模态框
            const modal = document.getElementById('role-select-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.setAttribute('aria-hidden', 'true');
            }
        });
        
        return card;
    }
    
    // 处理角色选择的函数
    function handleRoleSelection(roleName, characterData) {
        if (selectedRoleName && selectedRoleName === roleName) {
            // 再次点击同一角色 => 取消选择
            sendWebSocketMessage({
                type: 'select_role',
                role_name: null
            });
            selectedRoleName = null;
            resetSelectedCharacterUI();
            return;
        }

        selectedRoleName = roleName;

        // 发送角色选择消息
        sendWebSocketMessage({
            type: 'select_role',
            role_name: roleName
        });
        
        // 更新按钮
        selectRoleBtn.innerHTML = `<i class="fas fa-user-check"></i><span>${roleName}</span>`;
        selectRoleBtn.style.background = '#1e293b';
        
        // 显示选中的角色在左侧栏顶部
        showSelectedCharacter(characterData);
    }
    
    // 显示选中的角色
    function showSelectedCharacter(character) {
        const selectedSection = document.getElementById('selectedCharacterSection');
        const selectedCard = document.getElementById('selectedCharacterCard');
        
        if (!selectedSection || !selectedCard) return;
        
        // 创建选中角色的卡片
        const name = character.name || character.nickname || '未知角色';
        const description = character.description || '';
        const location = character.location || '—';
        const goal = character.goal || '—';
        const state = character.state || '—';
        
        selectedCard.innerHTML = `
            <div class="selected-character-info">
                <div class="selected-character-name">${name}</div>
                ${description ? `<div class="selected-character-description">${description}</div>` : ''}
                <div class="selected-character-details">
                    <div class="selected-character-location">📍 ${location}</div>
                    <div class="selected-character-goal">🎯 ${goal}</div>
                    <div class="selected-character-state">⚡ ${state}</div>
                </div>
            </div>
        `;
        
        // 显示选中区域
        selectedSection.style.display = 'block';
        
        // 从普通列表中移除选中的角色（可选）
        const allCards = document.querySelectorAll('.character-card');
        allCards.forEach(card => {
            const nameEl = card.querySelector('.character-name');
            if (nameEl && nameEl.textContent.trim() === (character.name || character.nickname)) {
                card.style.opacity = '0.5';
                card.style.border = '2px solid #1e293b';
            }
        });
    }

    function resetSelectedCharacterUI() {
        const selectedSection = document.getElementById('selectedCharacterSection');
        const selectedCard = document.getElementById('selectedCharacterCard');
        if (selectedSection && selectedCard) {
            selectedCard.innerHTML = '';
            selectedSection.style.display = 'none';
        }
        if (selectRoleBtn) {
            selectRoleBtn.innerHTML = `<i class="fas fa-user"></i><span data-i18n="selectRole">${window.i18n?.get('selectRole') ?? '选择角色'}</span>`;
            selectRoleBtn.style.background = '';
        }
        const allCards = document.querySelectorAll('.character-card');
        allCards.forEach(card => {
            card.style.opacity = '';
            card.style.border = '';
        });
    }

    // 绑定发送按钮点击事件
    sendButton.addEventListener('click', sendMessage);

    // 绑定回车键发送（只有在输入框启用时才能发送）
    textarea.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // 只有在等待输入时才能发送
            if (waitingForInput && !textarea.disabled) {
                sendMessage();
            } else {
                // 如果输入框被禁用，提示用户
                addSystemMessage('当前不是您的回合，无法发送消息');
            }
        }
    });
    
    // 防止在输入框禁用时输入（额外的保护）
    textarea.addEventListener('input', function(e) {
        if (textarea.disabled) {
            textarea.value = '';
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
        const locEl = modal.querySelector('.modal-location');
        const goalEl = modal.querySelector('.modal-goal');
        const stateEl = modal.querySelector('.modal-state');

        if (character) {
            nameEl.textContent = character.name || character.nickname || name;
            descEl.textContent = character.description || character.brief || '';
            locEl.textContent = character.location || '—';
            goalEl.textContent = character.goal || '—';
            stateEl.textContent = character.state || character.status || '—';
        } else {
            // Minimal fallback when no character data
            nameEl.textContent = name;
            descEl.textContent = '';
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
        const { scene: selectedScene, origin } = event.detail || {};
        const shouldFilter = origin === 'manual' && selectedScene !== null && selectedScene !== undefined;
        // Normalize scene value to ensure consistent comparison
        currentSceneFilter = shouldFilter ? (selectedScene !== null && selectedScene !== undefined ? String(selectedScene) : null) : null;
        console.log(`Scene filter updated: ${currentSceneFilter}, origin: ${origin}`);
        applySceneFilter();
    });

    // 添加导出故事按钮的点击事件
        exportStoryBtn.addEventListener('click', function() {
        // 显示加载状态
        if (sendWebSocketMessage({
            type: 'generate_story'
        })) {
            exportStoryBtn.disabled = true;
            exportStoryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>生成中...</span>';
        }
    });
    
    // 显示故事模态框
    function showStoryModal(storyText, timestamp) {
        const modal = document.getElementById('story-modal');
        const content = document.getElementById('storyContent');
        const downloadBtn = document.getElementById('downloadStoryBtn');
        
        if (!modal || !content) {
            console.error('故事模态框元素未找到');
            return;
        }
        
        // 恢复按钮状态
        exportStoryBtn.disabled = false;
        exportStoryBtn.innerHTML = '<i class="fas fa-book"></i><span data-i18n="exportStory">输出故事</span>';
        
        // 设置故事内容
        content.textContent = storyText;
        
        // 显示模态框
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        
        // 设置下载功能
        if (downloadBtn) {
            downloadBtn.onclick = function() {
                downloadStory(storyText, timestamp);
            };
        }
        
        // 设置关闭事件
        const closeBtn = modal.querySelector('.modal-close');
        const overlay = modal.querySelector('.modal-overlay');
        
        function closeModal() {
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
            closeBtn.removeEventListener('click', closeModal);
            if (overlay) overlay.removeEventListener('click', closeModal);
            document.removeEventListener('keydown', onKeyDown);
        }
        
        function onKeyDown(e) {
            if (e.key === 'Escape') closeModal();
        }
        
        closeBtn.addEventListener('click', closeModal);
        if (overlay) overlay.addEventListener('click', closeModal);
        document.addEventListener('keydown', onKeyDown);
    }
    
    // 下载故事
    function downloadStory(storyText, timestamp) {
        const filename = `story_${timestamp || new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        const blob = new Blob([storyText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // 显示AI选项选择模态框
    function showAutoOptionsModal(options) {
        const modal = document.getElementById('auto-options-modal');
        const container = document.getElementById('autoOptionsContainer');
        
        if (!modal || !container) {
            console.error('AI选项模态框元素未找到');
            return;
        }
        
        // 恢复按钮状态
        if (autoCompleteBtn) {
            autoCompleteBtn.disabled = false;
            autoCompleteBtn.style.opacity = '1';
        }
        
        // 清空容器
        container.innerHTML = '';
        
        // 创建选项卡片
        options.forEach((option, index) => {
            const card = createOptionCard(option, index);
            container.appendChild(card);
        });
        
        // 显示模态框
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        
        // 设置关闭事件
        const closeBtn = modal.querySelector('.modal-close');
        const overlay = modal.querySelector('.modal-overlay');
        
        function closeModal() {
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
            closeBtn.removeEventListener('click', closeModal);
            if (overlay) overlay.removeEventListener('click', closeModal);
            document.removeEventListener('keydown', onKeyDown);
        }
        
        function onKeyDown(e) {
            if (e.key === 'Escape') closeModal();
        }
        
        closeBtn.addEventListener('click', closeModal);
        if (overlay) overlay.addEventListener('click', closeModal);
        document.addEventListener('keydown', onKeyDown);
    }
    
    // 创建选项卡片
    function createOptionCard(option, index) {
        const card = document.createElement('div');
        card.className = 'auto-option-card';
        card.setAttribute('data-option-index', index);
        
        const styleIcons = {
            'aggressive': '⚔️',
            'balanced': '⚖️',
            'conservative': '🛡️'
        };
        
        const styleColors = {
            'aggressive': '#dc2626',
            'balanced': '#2563eb',
            'conservative': '#059669'
        };
        
        const icon = styleIcons[option.style] || '💭';
        const color = styleColors[option.style] || '#64748b';
        
        card.innerHTML = `
            <div class="option-header">
                <div class="option-style-badge" style="background: ${color}20; color: ${color}; border-color: ${color}40;">
                    <span class="option-icon">${icon}</span>
                    <span class="option-name">${option.name}</span>
                </div>
                <div class="option-description">${option.description}</div>
            </div>
            <div class="option-content">${option.text}</div>
            <button class="option-select-btn" style="border-color: ${color}; color: ${color};">
                选择此方案
            </button>
        `;
        
        // 添加点击事件
        const selectBtn = card.querySelector('.option-select-btn');
        selectBtn.addEventListener('click', function() {
            // 发送选中的选项
            sendWebSocketMessage({
                type: 'select_auto_option',
                selected_text: option.text
            });
            
            // 关闭模态框
            const modal = document.getElementById('auto-options-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.setAttribute('aria-hidden', 'true');
            }
        });
        
        // 卡片点击也可以选择
        card.addEventListener('click', function(e) {
            if (e.target !== selectBtn && !selectBtn.contains(e.target)) {
                selectBtn.click();
            }
        });
        
        return card;
    }
});
