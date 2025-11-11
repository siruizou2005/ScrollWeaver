class PresetPanel {
    constructor() {
        this.presets = [];
        this.currentPreset = null;
        this.container = document.querySelector('.preset-container');
        this.select = document.querySelector('.preset-select');
        this.submitBtn = document.querySelector('.preset-submit-btn');
        this.init();
    }

    init() {
        this.loadPresets();
        this.setupEventListeners();
    }

    async loadPresets() {
        try {
            const response = await fetch('/api/list-presets');
            if (!response.ok) {
                throw new Error('Failed to load presets');
            }
            const data = await response.json();
            this.presets = data.presets;
            this.renderPresetOptions();
        } catch (error) {
            console.error('Error loading presets:', error);
            alert('Error loading presets, please try again.');
        }
    }

    renderPresetOptions() {
        if (!this.select) return;

        this.select.innerHTML = '<option value="">Select a preset...</option>';
        this.presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset;
            option.textContent = preset.replace('.json', '');
            this.select.appendChild(option);
        });
    }

    setupEventListeners() {
        if (this.select) {
            this.select.addEventListener('change', () => {
                this.currentPreset = this.select.value;
                this.submitBtn.disabled = !this.currentPreset;
            });
        }

        if (this.submitBtn) {
            this.submitBtn.addEventListener('click', () => this.handleSubmit());
        }
    }

    async handleSubmit() {
        if (!this.currentPreset) return;

        // 禁用按钮，防止重复点击
        this.submitBtn.disabled = true;

        try {
            const response = await fetch('/api/load-preset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    preset: this.currentPreset
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to load preset');
            }

            if (data.success) {
                // 触发预设加载成功事件
                window.dispatchEvent(new CustomEvent('preset-loaded', {
                    detail: { preset: this.currentPreset }
                }));

                // 检测是否为Safari浏览器
                const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

                // 重新加载初始数据
                if (window.ws) {
                    // 先停止当前的故事生成
                    if (window.ws.readyState === WebSocket.OPEN) {
                        window.ws.send(JSON.stringify({
                            type: 'control',
                            action: 'stop'
                        }));
                    }

                    // 正确关闭旧连接
                    const closeOldConnection = () => {
                        return new Promise((resolve) => {
                            if (!window.ws || window.ws.readyState === WebSocket.CLOSED) {
                                resolve();
                                return;
                            }

                            const oldWs = window.ws;
                            // 移除错误处理器，避免显示错误
                            oldWs.onerror = null;
                            
                            oldWs.onclose = () => {
                                console.log('Old WebSocket connection closed');
                                resolve();
                            };

                            if (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING) {
                                oldWs.close();
                            } else {
                                resolve();
                            }

                            // 超时保护
                            setTimeout(resolve, 1000);
                        });
                    };

                    // 创建新连接
                    const reconnect = async () => {
                        await closeOldConnection();

                        // 使用动态协议
                        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                        const clientId = Math.random().toString(36).substring(7);
                        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${clientId}`);
                        
                        let connectionEstablished = false;
                        let errorShown = false;

                        // 设置消息处理器（在 onopen 之前设置，以便连接建立后立即可用）
                        // 这个处理器会在 handleWebSocketMessage 可用时使用它，否则使用回退逻辑
                        ws.onmessage = (event) => {
                            console.log('New connection received message');
                            // 优先使用全局处理函数
                            if (typeof window.handleWebSocketMessage === 'function') {
                                window.handleWebSocketMessage(event);
                                return;
                            }
                            
                            // 回退处理：如果处理函数不可用，至少分发事件
                            console.warn('handleWebSocketMessage not available, using fallback and event dispatch');
                            try {
                                const message = JSON.parse(event.data);
                                console.log('Received message on new connection (fallback):', message.type, message);
                                
                                // 分发事件，让其他监听器处理（这些监听器可能在 message.js 之前加载）
                                window.dispatchEvent(new CustomEvent('websocket-message', {
                                    detail: message
                                }));
                                
                                // 如果消息类型是 'message'，尝试直接渲染到聊天窗口
                                if (message.type === 'message' && message.data) {
                                    const chatMessages = document.querySelector('.chat-messages');
                                    if (chatMessages) {
                                        // 尝试调用 renderMessage 如果可用
                                        if (typeof window.renderMessage === 'function') {
                                            window.renderMessage(message.data);
                                        } else if (typeof window.addSystemMessage === 'function') {
                                            // 至少显示系统消息
                                            window.addSystemMessage(message.data.text || JSON.stringify(message.data));
                                        } else {
                                            // 最后的回退：直接添加到 DOM
                                            const messageElement = document.createElement('div');
                                            messageElement.className = 'message system';
                                            messageElement.innerHTML = `
                                                <div class="content">
                                                    <div class="text">${message.data.text || JSON.stringify(message.data)}</div>
                                                </div>
                                            `;
                                            chatMessages.appendChild(messageElement);
                                            chatMessages.scrollTop = chatMessages.scrollHeight;
                                        }
                                    } else {
                                        console.error('chat-messages element not found');
                                    }
                                }
                            } catch (e) {
                                console.error('Error parsing WebSocket message:', e);
                            }
                        };

                        ws.onopen = () => {
                            connectionEstablished = true;
                            console.log('WebSocket Reconnected:', clientId);
                            window.ws = ws;
                            // 重置 isPlaying 状态
                            if (typeof window.setIsPlaying === 'function') {
                                window.setIsPlaying(false);
                            }
                            // 通过事件系统通知连接已建立
                            console.log('WebSocket connection re-established');
                            // 确保消息处理器已设置（如果在连接建立时处理器已可用，直接使用它）
                            if (typeof window.handleWebSocketMessage === 'function') {
                                ws.onmessage = window.handleWebSocketMessage;
                                console.log('Message handler attached to new connection');
                            } else {
                                console.warn('handleWebSocketMessage not available yet, temporary handler will delegate');
                                // 临时处理器已经设置，它会在收到消息时检查并调用 handleWebSocketMessage
                                // 同时，定期检查处理器是否已可用，如果可用则替换临时处理器
                                const checkAndSetHandler = setInterval(() => {
                                    if (typeof window.handleWebSocketMessage === 'function') {
                                        ws.onmessage = window.handleWebSocketMessage;
                                        console.log('Message handler attached to new connection (delayed)');
                                        clearInterval(checkAndSetHandler);
                                    }
                                }, 100);
                                // 10秒后停止检查
                                setTimeout(() => clearInterval(checkAndSetHandler), 10000);
                            }
                        };

                        ws.onclose = (event) => {
                            console.log('New WebSocket connection closed:', event.code, event.reason);
                            if (!connectionEstablished && !errorShown && event.code !== 1000) {
                                if (!isSafari) {
                                    errorShown = true;
                                    alert('WebSocket连接错误，但预设已加载。请刷新页面。');
                                }
                            }
                        };

                        // 改进的错误处理：Safari可能会触发临时错误
                        ws.onerror = (error) => {
                            console.warn('WebSocket connection warning (may be temporary in Safari):', error);
                            // 在Safari中，不立即显示错误，等待连接结果
                            // 只有在连接真正失败时才显示错误
                        };

                        ws.onclose = (event) => {
                            // 只有在连接未成功建立且不是正常关闭时才显示错误
                            if (!connectionEstablished && !errorShown && event.code !== 1000) {
                                // 对于Safari，即使连接关闭，如果预设已加载，也不显示错误
                                // 因为用户说"不影响使用"
                                if (!isSafari) {
                                    errorShown = true;
                                    alert('WebSocket connection error, but preset is loaded. Please refresh the page.');
                                } else {
                                    // Safari: 静默处理，因为不影响使用
                                    console.log('WebSocket connection closed in Safari (preset already loaded)');
                                }
                            }
                        };
                    };

                    // 执行重连
                    reconnect().catch(error => {
                        console.error('Reconnection error:', error);
                        // Safari: 不显示错误，因为不影响使用
                        if (!isSafari) {
                            alert('WebSocket连接错误，但预设已加载。请刷新页面以获取最新数据。');
                        }
                    });
                } else {
                    // 如果没有现有连接，直接刷新页面
                    console.log('No existing WebSocket connection, reloading page');
                    window.location.reload();
                    return;
                }

                alert('Preset loaded successfully!');
            }
        } catch (error) {
            console.error('Error loading preset:', error);
            alert(error.message || 'Failed to load preset, please try again.');
        } finally {
            // 恢复按钮状态
            this.submitBtn.disabled = false;
        }
    }
}

const presetPanel = new PresetPanel();