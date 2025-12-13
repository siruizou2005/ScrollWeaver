/**
 * 狼人杀前端逻辑
 * 注意：保留了原有的所有逻辑和 API 调用
 */

class WerewolfGame {
    constructor() {
        this.gameId = null;
        this.playerId = "player_0"; // 默认人类玩家ID
        this.ws = null;
        this.gameState = {
            phase: "waiting",
            players: [],
            myRole: null
        };

        this.initElements();
        this.bindEvents();
    }

    initElements() {
        // 按钮
        this.startGameBtn = document.getElementById('startGameBtn');
        this.confirmConfigBtn = document.getElementById('confirmConfigBtn');
        this.cancelConfigBtn = document.getElementById('cancelConfigBtn');
        this.backBtn = document.getElementById('backBtn');

        // 容器
        this.playersGrid = document.getElementById('playersGrid');
        this.gameLog = document.getElementById('gameLog');
        this.actionButtons = document.getElementById('actionButtons');
        this.actionPrompt = document.getElementById('actionPrompt');
        this.configModal = document.getElementById('configModal');

        // 信息显示
        this.gameStatus = document.getElementById('gameStatus');
        this.playerCount = document.getElementById('playerCount');
        this.currentPhase = document.getElementById('currentPhase');
        this.dayCount = document.getElementById('dayCount');

        // 角色卡片
        this.myCard = document.querySelector('.my-card');
        this.myRoleName = document.getElementById('myRoleName');
        this.myRoleDesc = document.getElementById('myRoleDesc');
        this.myRoleIcon = document.getElementById('myRoleIcon');

        // 确认对话框
        this.confirmModal = document.getElementById('confirmModal');
        this.confirmMessage = document.getElementById('confirmMessage');
        this.confirmOkBtn = document.getElementById('confirmOkBtn');
        this.confirmCancelBtn = document.getElementById('confirmCancelBtn');
    }

    bindEvents() {
        this.startGameBtn.onclick = () => {
            this.configModal.classList.add('active');
        };

        this.cancelConfigBtn.onclick = () => {
            this.configModal.classList.remove('active');
        };

        this.confirmConfigBtn.onclick = async () => {
            const preset = document.getElementById('presetSelect').value;
            const preferredRole = document.getElementById('roleSelect').value;
            await this.createGame(preset, preferredRole);
            this.configModal.classList.remove('active');
        };

        // 返回按钮：确认后关闭游戏并跳转
        this.backBtn.onclick = () => {
            this.handleBack();
        };

        // 确认对话框按钮
        this.confirmOkBtn.onclick = () => {
            this.confirmResolve(true);
        };

        this.confirmCancelBtn.onclick = () => {
            this.confirmResolve(false);
        };

        // 点击背景关闭确认对话框
        if (this.confirmModal) {
            const backdrop = this.confirmModal.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.onclick = () => {
                    this.confirmResolve(false);
                };
            }
        }

        // 页面关闭事件处理
        window.addEventListener('beforeunload', (e) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // 显示浏览器默认确认对话框
                e.preventDefault();
                e.returnValue = '确定要离开吗？这将关闭当前游戏。';
                return e.returnValue;
            }
        });
    }

    // 自定义确认对话框
    async showConfirm(message) {
        return new Promise((resolve) => {
            this.confirmResolve = resolve;
            this.confirmMessage.textContent = message;
            this.confirmModal.classList.add('active');
        });
    }

    confirmResolve(result) {
        this.confirmModal.classList.remove('active');
        if (this.confirmResolve) {
            this.confirmResolve(result);
            this.confirmResolve = null;
        }
    }

    handleBack() {
        // 显示自定义确认对话框
        this.showConfirm('确定要返回广场吗？这将关闭当前游戏。').then((confirmed) => {
            if (confirmed) {
                // 关闭WebSocket连接
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.close();
                    this.log("已断开游戏连接", "system");
                }
                
                // 跳转到广场页
                window.location.href = '/frontend/pages/plaza.html';
            }
        });
    }

    async createGame(preset, preferredRole) {
        try {
            this.log("正在创建游戏...", "system");
            const body = { preset };
            if (preferredRole) {
                body.preferred_role = preferredRole;
            }

            const response = await fetch('/api/werewolf/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            // 检查HTTP状态码
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.detail || errorData.error || errorData.message || `HTTP错误: ${response.status}`;
                this.log(`创建失败: ${errorMsg}`, "system");
                return;
            }

            const data = await response.json();
            if (data.success) {
                this.gameId = data.game_id;
                this.log(`游戏创建成功！ID: ${this.gameId}`, "system");
                this.connectWebSocket();

                // 隐藏开始按钮
                this.startGameBtn.style.display = 'none';
                this.gameStatus.textContent = "连接中...";
            } else {
                const errorMsg = data.error || data.message || data.detail || '未知错误';
                this.log(`创建失败: ${errorMsg}`, "system");
            }
        } catch (e) {
            console.error(e);
            this.log("网络错误", "system");
        }
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/werewolf/${this.gameId}/${this.playerId}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.log("已连接到服务器", "system");
            this.gameStatus.textContent = "游戏中";
            this.startGame();
        };

        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            this.handleMessage(msg);
        };

        this.ws.onclose = () => {
            this.log("连接已断开", "system");
            this.gameStatus.textContent = "离线";
        };
    }

    async startGame() {
        // 发送开始游戏请求
        await fetch('/api/werewolf/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: this.gameId })
        });
    }

    handleMessage(msg) {
        console.log("收到消息:", msg);

        switch (msg.type) {
            case 'game_start':
                this.handleGameStart(msg.data);
                break;
            case 'role_reveal':
                this.handleRoleReveal(msg.data);
                break;
            case 'player_states':
                this.handlePlayerStates(msg.data);
                break;
            case 'phase_change':
                this.handlePhaseChange(msg.data);
                break;
            case 'action_request':
                this.handleActionRequest(msg.data);
                break;
            case 'speech':
                this.handleSpeech(msg.data);
                break;
            case 'announcement':
                this.log(msg.data.message, "phase");
                if (msg.data.sub_message) {
                    this.log(msg.data.sub_message, "system");
                }
                break;
            case 'game_end':
                this.handleGameEnd(msg.data);
                break;
            case 'game_review':
                this.handleGameReview(msg.data);
                break;
            case 'action_result':
                // 显示行动结果（如预言家查验）
                console.log('行动结果:', msg.data);
                if (msg.data.message) {
                    this.log(msg.data.message, "system");
                    alert(msg.data.message); // 弹窗提醒重要信息
                }
                break;
            case 'vote_result':
                this.handleVoteResult(msg.data);
                break;
            case 'exile':
                this.handleExile(msg.data);
                break;
            case 'error':
                this.handleError(msg.data);
                break;
        }
    }

    handleRoleReveal(data) {
        // 显示玩家自己的身份
        this.gameState.myRole = data;
        const roleIcons = {
            'werewolf': '🐺',
            'seer': '🔮',
            'witch': '🧪',
            'hunter': '🏹',
            'villager': '👤',
            'guard': '🛡️'
        };

        this.myRoleIcon.textContent = roleIcons[data.role_id] || '❓';
        this.myRoleName.textContent = data.role_name;
        this.myRoleDesc.textContent = data.description || `你是${data.camp === 'werewolf' ? '狼人阵营' : '好人阵营'}`;

        // 翻转卡片
        this.myCard.classList.add('revealed');

        this.log(`你的身份是：${data.role_name}`, "system");
    }

    handlePlayerStates(data) {
        // data.players is an array of player info
        data.players.forEach(player => {
            const playerEl = document.querySelector(`[data-id="${player.id}"]`);
            if (playerEl) {
                // 更新存活状态
                if (player.alive) {
                    playerEl.classList.remove('dead');
                    playerEl.classList.add('alive');
                } else {
                    playerEl.classList.remove('alive');
                    playerEl.classList.add('dead');
                }

                // 显示揭示的角色（如狼人看到其他狼人）
                if (player.revealed_role === '狼人') {
                    const avatarEl = playerEl.querySelector('.player-avatar');
                    if (avatarEl) {
                        // 变成狼人头像
                        avatarEl.innerHTML = '🐺';
                        avatarEl.style.fontSize = '2rem';
                        avatarEl.style.lineHeight = '1';
                        avatarEl.style.display = 'flex';
                        avatarEl.style.justifyContent = 'center';
                        avatarEl.style.alignItems = 'center';
                        // 添加红色边框或背景以示区分
                        playerEl.style.borderColor = '#ff4444';
                    }
                }
            }
        });
    }

    handleGameStart(data) {
        this.log("游戏开始！正在分配角色...", "phase");

        // 初始化玩家列表
        // 假设data.config.total_players可用
        const total = data.config.total_players;
        this.gameState.players = [];
        this.playersGrid.innerHTML = '';

        for (let i = 0; i < total; i++) {
            const pid = `player_${i}`;
            const isMe = pid === this.playerId;

            // 生成显示名称：player_0 -> "玩家0（你）", player_1 -> "玩家1"
            const displayName = isMe ? `玩家${i}（你）` : `玩家${i}`;

            const playerEl = document.createElement('div');
            playerEl.className = `player-card alive ${isMe ? 'me' : ''}`;
            playerEl.dataset.id = pid;
            playerEl.innerHTML = `
                <div class="player-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="player-name">${displayName}</div>
            `;

            // 点击选择逻辑
            playerEl.onclick = () => this.selectPlayer(pid);

            this.playersGrid.appendChild(playerEl);
            this.gameState.players.push(pid);
        }

        this.playerCount.textContent = `${total}/${total}`;
    }

    handlePhaseChange(data) {
        this.currentPhase.textContent = this.translatePhase(data.phase);
        this.dayCount.textContent = `第 ${data.round} 天`;
        this.log(`进入阶段: ${this.translatePhase(data.phase)}`, "phase");

        // 清除旧的行动按钮
        this.actionButtons.innerHTML = '';
        this.actionPrompt.style.display = 'none';

        // 清除选中状态
        document.querySelectorAll('.player-card').forEach(el => el.classList.remove('selected'));
    }

    handleActionRequest(data) {
        this.actionPrompt.style.display = 'flex';
        this.actionButtons.innerHTML = '';

        // 女巫特殊处理：显示被击杀者信息
        if (data.context && data.context.kill_target_name) {
            const killInfo = document.createElement('div');
            killInfo.style.cssText = 'background: #331111; border: 2px solid #ff4444; padding: 15px; margin-bottom: 15px; border-radius: 8px; text-align: center;';
            killInfo.innerHTML = `
                <div style="color: #ff4444; font-size: 1.2em; font-weight: bold; margin-bottom: 5px;">
                    ⚠️ 昨晚被狼人击杀的玩家
                </div>
                <div style="color: #fff; font-size: 1.5em; font-weight: bold;">
                    ${data.context.kill_target_name}
                </div>
            `;
            this.actionButtons.appendChild(killInfo);
            this.log(`⚠️ 昨晚被击杀的是：${data.context.kill_target_name}`, "system");
        }

        // 倒计时逻辑
        const timerEl = document.getElementById('actionTimer');
        let timeLeft = data.timeout || 30;
        timerEl.textContent = `${timeLeft}s`;

        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            timeLeft--;
            timerEl.textContent = `${timeLeft}s`;
            if (timeLeft <= 0) {
                clearInterval(this.timerInterval);
                // 超时处理...
            }
        }, 1000);

        const options = data.options;

        // 如果是发言请求，使用特殊UI
        if (options.length === 1 && options[0].is_speech) {
            this.showSpeechInput();
            return;
        }

        // 创建行动按钮（仅一次）
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn-secondary';
            btn.textContent = opt.description;

            btn.onclick = () => {
                // 女巫解药特殊处理：自动使用kill_target
                if (opt.action_type === 'witch_antidote' && data.context && data.context.kill_target) {
                    this.sendAction(opt.action_type, data.context.kill_target);
                }
                // 如果需要选择目标
                else if (opt.targets && opt.targets.length > 0) {
                    this.enableTargetSelection(opt);
                } else {
                    this.sendAction(opt.action_type);
                }
            };

            this.actionButtons.appendChild(btn);
        });

        // 如果可以跳过
        if (options.some(o => o.can_skip)) {
            const skipBtn = document.createElement('button');
            skipBtn.className = 'btn-secondary';
            skipBtn.textContent = '跳过';
            skipBtn.onclick = () => this.sendAction('skip');
            this.actionButtons.appendChild(skipBtn);
        }
    }

    showSpeechInput() {
        this.actionButtons.innerHTML = `
            <div class="speech-input-area" style="width: 100%; display: flex; gap: 10px;">
                <input type="text" id="speechInput" placeholder="请输入你的发言..." style="flex: 1; padding: 12px; border-radius: 6px; border: 1px solid #444; background: rgba(0,0,0,0.5); color: #fff;">
                <button class="btn-primary" id="sendSpeechBtn">发送</button>
            </div>
        `;

        const input = document.getElementById('speechInput');
        const btn = document.getElementById('sendSpeechBtn');

        const sendSpeech = () => {
            const content = input.value.trim();
            if (content) {
                this.ws.send(JSON.stringify({
                    action_type: "speech",
                    content: content
                }));
                this.actionButtons.innerHTML = '<div style="color:#888">已发言</div>';
                this.actionPrompt.style.display = 'none';
            }
        };

        btn.onclick = sendSpeech;
        input.onkeypress = (e) => {
            if (e.key === 'Enter') sendSpeech();
        };

        input.focus();
    }

    enableTargetSelection(option) {
        this.log(`请选择目标: ${option.description}`, "system");

        // 高亮可选目标
        document.querySelectorAll('.player-card').forEach(el => {
            const pid = el.dataset.id;
            if (option.targets.includes(pid)) {
                el.style.cursor = 'pointer';
                el.style.borderColor = '#d4af37';
                el.style.animation = 'pulse 1s infinite';
                el.onclick = () => {
                    this.sendAction(option.action_type, pid);
                    // 重置点击事件
                    this.resetPlayerClicks();
                };
            } else {
                el.style.opacity = '0.5';
                el.onclick = null;
            }
        });
    }

    resetPlayerClicks() {
        document.querySelectorAll('.player-card').forEach(el => {
            el.style.cursor = 'default';
            el.style.opacity = '1';
            el.style.borderColor = '';
            el.style.animation = '';
            el.onclick = () => this.selectPlayer(el.dataset.id); // 恢复默认点击
        });
    }

    selectPlayer(pid) {
        // 默认点击行为（查看信息等）
        console.log("点击玩家:", pid);
    }

    sendAction(type, target = null) {
        const payload = {
            action_type: type,
            target: target
        };
        this.ws.send(JSON.stringify(payload));

        // 隐藏操作区
        this.actionButtons.innerHTML = '<div style="color:#888">已行动</div>';
        this.actionPrompt.style.display = 'none';
        this.resetPlayerClicks();
    }

    handleSpeech(data) {
        const div = document.createElement('div');
        div.className = 'log-message speech';

        const speaker = document.createElement('span');
        speaker.className = 'speaker';
        speaker.textContent = data.player_id === this.playerId ? '你' : `玩家 ${data.player_id.split('_')[1]}`;

        div.appendChild(speaker);
        div.appendChild(document.createTextNode(`: ${data.content}`));

        this.gameLog.appendChild(div);
        this.gameLog.scrollTop = this.gameLog.scrollHeight;
    }

    handleGameEnd(data) {
        this.log(`游戏结束！获胜方: ${data.winner}`, "phase");
        alert(`游戏结束！获胜方: ${data.winner}`);
    }

    log(msg, type = "normal") {
        const div = document.createElement('div');
        div.className = `log-message ${type}`;
        div.textContent = msg;
        this.gameLog.appendChild(div);
        this.gameLog.scrollTop = this.gameLog.scrollHeight;
    }

    handleVoteResult(votes) {
        // votes: { voter_id: target_id }
        this.log("=== 投票结果 ===", "phase");

        // 统计票数
        const counts = {};
        Object.entries(votes).forEach(([voter, target]) => {
            const getPlayerName = (pid) => {
                if (pid === this.playerId) return "你";
                if (!pid) return "未知";
                const parts = pid.split('_');
                return parts.length > 1 ? `玩家 ${parts[1]}` : `玩家 ${pid}`;
            };

            const voterName = getPlayerName(voter);
            const targetName = getPlayerName(target);

            this.log(`${voterName} 投给了 ${targetName}`, "normal");

            counts[target] = (counts[target] || 0) + 1;
        });

        // 显示票数统计
        Object.entries(counts).forEach(([target, count]) => {
            const getPlayerName = (pid) => {
                if (pid === this.playerId) return "你";
                if (!pid) return "未知";
                const parts = pid.split('_');
                return parts.length > 1 ? `玩家 ${parts[1]}` : `玩家 ${pid}`;
            };
            const targetName = getPlayerName(target);
            this.log(`${targetName}: ${count} 票`, "system");
        });
    }

    handleExile(data) {
        const pid = data.player_id;

        if (!pid) {
            console.error("收到无效的放逐消息:", data);
            this.log("放逐失败：数据错误", "system");
            return;
        }

        const name = pid === this.playerId ? "你" : `玩家 ${pid.split('_')[1]}`;

        const msg = `${name} 被投票放逐了！`;
        this.log(msg, "phase");
        alert(msg);

        // 更新状态
        const playerEl = document.querySelector(`[data-id="${pid}"]`);
        if (playerEl) {
            playerEl.classList.remove('alive');
            playerEl.classList.add('dead');
        }
    }

    translatePhase(phase) {
        const map = {
            'night_werewolf': '狼人行动',
            'night_seer': '预言家行动',
            'night_witch': '女巫行动',
            'day_announce': '天亮宣布',
            'day_discussion': '自由讨论',
            'day_vote': '投票放逐'
        };
        return map[phase] || phase;
    }

    handleGameReview(data) {
        this.log(`\n${"=".repeat(50)}`, "phase");
        this.log(`📋 ${data.title}`, "phase");
        this.log(`${"=".repeat(50)}`, "phase");

        // 按阵营分组显示
        const werewolves = data.players.filter(p => p.camp === "werewolf");
        const villagers = data.players.filter(p => p.camp === "villager");

        this.log("\n🐺 狼人阵营：", "system");
        werewolves.forEach(p => {
            const status = p.status === "alive" ? "✅ 存活" : "💀 死亡";
            this.log(`  ${p.player_name}: ${p.role_name} ${status}`, "normal");
        });

        this.log("\n👥 好人阵营：", "system");
        villagers.forEach(p => {
            const status = p.status === "alive" ? "✅ 存活" : "💀 死亡";
            this.log(`  ${p.player_name}: ${p.role_name} ${status}`, "normal");
        });

        this.log(`\n${"=".repeat(50)}\n`, "phase");
    }

    handleError(data) {
        console.error("Game Error:", data);
        this.log(`错误: ${data.message || '未知错误'}`, "system");
    }
}

// 启动游戏
window.onload = () => {
    new WerewolfGame();
};