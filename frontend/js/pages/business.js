// 商业博弈游戏逻辑
const API_BASE = window.location.origin;

// 检查登录状态
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/frontend/pages/login.html';
    throw new Error('未登录');
}

const user = JSON.parse(localStorage.getItem('user') || '{}');
const usernameElement = document.getElementById('username');
if (usernameElement) {
    usernameElement.textContent = user.username || '用户';
}

let gameId = null;
let websocket = null;
let currentRound = 0;
let totalProfitHuman = 0;
let totalProfitAI = 0;
let isGameFinished = false;
let isGameStarted = false;
let isWebSocketConnected = false;
let isUserClosing = false; // 标记用户是否主动关闭连接

// 初始化游戏
async function initGame() {
    try {
        // 禁用开始按钮，显示加载状态
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 初始化中...';
        }
        
        const response = await fetch(`${API_BASE}/api/business/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('创建游戏失败:', response.status, errorText);
            throw new Error(`创建游戏失败: ${response.status} ${errorText}`);
        }
        
        const data = await response.json();
        console.log('创建游戏响应:', data);
        
        if (!data.success) {
            throw new Error(data.error || '创建游戏失败');
        }
        
        if (!data.game_id) {
            throw new Error('服务器未返回游戏ID');
        }
        
        gameId = data.game_id;
        
        console.log('游戏ID已设置:', gameId);
        
        // 加载排行榜
        loadLeaderboard();
        
        // 显示开始按钮，隐藏输入区域
        showStartSection();
        
        // 启用开始按钮
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        }
    } catch (error) {
        console.error('初始化游戏失败:', error);
        showNotification('初始化游戏失败，请刷新页面重试', 'error');
        
        // 恢复开始按钮
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        }
    }
}

// 开始游戏
function startGame() {
    if (isGameStarted) {
        return;
    }
    
    // 检查gameId是否存在
    if (!gameId) {
        console.error('游戏ID不存在，尝试重新初始化...');
        showNotification('游戏尚未初始化，请稍候...', 'info');
        // 尝试重新初始化游戏
        initGame().then(() => {
            if (gameId) {
                // 初始化成功后，自动开始连接
                const startBtn = document.getElementById('startBtn');
                if (startBtn) {
                    startBtn.disabled = true;
                    startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 连接中...';
                }
                connectWebSocket();
            } else {
                showNotification('游戏初始化失败，请刷新页面重试', 'error');
            }
        }).catch((error) => {
            console.error('重新初始化失败:', error);
            showNotification('游戏初始化失败，请刷新页面重试', 'error');
        });
        return;
    }
    
    // 显示开始按钮的加载状态
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 连接中...';
    }
    
    // 连接WebSocket
    connectWebSocket();
}

// 显示开始区域
function showStartSection() {
    document.getElementById('startSection').style.display = 'block';
    document.getElementById('inputSection').style.display = 'none';
    document.getElementById('waitingSection').style.display = 'none';
    isGameStarted = false;
}

// 显示输入区域
function showInputSection() {
    document.getElementById('startSection').style.display = 'none';
    document.getElementById('inputSection').style.display = 'block';
    document.getElementById('waitingSection').style.display = 'none';
    const priceInput = document.getElementById('priceInput');
    const submitBtn = document.getElementById('submitBtn');
    if (priceInput) priceInput.disabled = false;
    if (submitBtn) submitBtn.disabled = false;
    isGameStarted = true;
}

// 连接WebSocket
function connectWebSocket() {
    if (!gameId) {
        console.error('游戏ID不存在，无法连接WebSocket');
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        }
        showNotification('游戏ID不存在，请刷新页面重试', 'error');
        return;
    }
    
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/business/${gameId}?token=${token}`;
    
    console.log('正在连接WebSocket:', wsUrl);
    console.log('游戏ID:', gameId);
    console.log('Token:', token ? '存在' : '不存在');
    
    try {
        websocket = new WebSocket(wsUrl);
    } catch (error) {
        console.error('创建WebSocket失败:', error);
        showNotification('创建连接失败: ' + error.message, 'error');
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        }
        return;
    }
    
    websocket.onopen = () => {
        console.log('WebSocket连接成功');
        isWebSocketConnected = true;
        
        // 连接成功后，显示输入区域
        showInputSection();
        
        // 恢复开始按钮
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        }
    };
    
    websocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('收到WebSocket消息:', data);
            handleWebSocketMessage(data);
        } catch (error) {
            console.error('解析WebSocket消息失败:', error, event.data);
        }
    };
    
    websocket.onerror = (error) => {
        console.error('WebSocket错误:', error);
        isWebSocketConnected = false;
        
        // 恢复开始按钮
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        }
        
        // 显示错误提示
        showNotification('连接失败，请检查网络连接后重试', 'error');
    };
    
    websocket.onclose = (event) => {
        console.log('WebSocket连接关闭', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            isGameStarted: isGameStarted,
            isGameFinished: isGameFinished,
            isUserClosing: isUserClosing
        });
        isWebSocketConnected = false;
        
        // 如果用户主动关闭连接（比如点击返回按钮），不显示错误提示
        if (isUserClosing) {
            console.log('用户主动关闭连接，不显示错误提示');
            return;
        }
        
        // 如果游戏未开始或刚连接就关闭，恢复开始按钮
        if (!isGameStarted || isGameFinished) {
            const startBtn = document.getElementById('startBtn');
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
            }
            
            // 显示关闭原因（排除正常关闭和用户主动关闭）
            // 1000: 正常关闭
            // 1001: 端点离开（如服务器关闭或浏览器导航离开）
            // 1005: 没有状态码（通常表示连接被强制关闭，如网络断开）
            if (event.code !== 1000 && event.code !== 1001) {
                // 1005通常是网络问题或页面关闭，不显示错误
                if (event.code === 1005) {
                    console.log('连接关闭（代码1005），可能是网络问题或页面关闭');
                    return;
                }
                
                let errorMsg = '连接已断开';
                if (event.code === 4003) {
                    errorMsg = '认证失败，请刷新页面重新登录';
                } else if (event.code === 4004) {
                    errorMsg = '游戏不存在，请刷新页面重新开始';
                } else if (event.reason) {
                    errorMsg = `连接失败: ${event.reason}`;
                } else {
                    errorMsg = `连接已断开`;
                }
                console.error('WebSocket关闭错误:', errorMsg);
                // 使用更友好的提示方式
                showNotification(errorMsg, 'warning');
            }
        } else if (isGameStarted && !isGameFinished) {
            // 游戏进行中断开连接
            showNotification('连接已断开，游戏已暂停', 'warning');
        }
    };
}

// 处理WebSocket消息
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'game_state':
            updateGameState(data);
            break;
        case 'round_result':
            handleRoundResult(data);
            break;
        case 'ai_thinking':
            // AI正在思考下一轮，但不影响当前输入（因为AI在后台思考）
            // 可以显示一个小的提示，但不阻止用户输入
            console.log('AI正在思考下一轮...');
            break;
        case 'ai_ready':
            // AI已准备好下一轮，可以显示提示
            console.log('AI已准备好下一轮');
            break;
        case 'error':
            showNotification(data.message || '发生错误', 'error');
            break;
    }
}

// 更新游戏状态
function updateGameState(data) {
    currentRound = data.current_round || 0;
    totalProfitHuman = data.total_profit_human || 0;
    totalProfitAI = data.total_profit_ai || 0;
    isGameFinished = data.is_finished || false;
    
    // 更新UI
    document.getElementById('currentRound').textContent = `${currentRound} / ${data.max_rounds || 20}`;
    document.getElementById('totalProfitHuman').textContent = totalProfitHuman.toFixed(2);
    document.getElementById('totalProfitAI').textContent = totalProfitAI.toFixed(2);
    document.getElementById('marketState').textContent = data.state_description || '等待开始';
    
    if (data.last_price_ai !== null && data.last_price_ai !== undefined) {
        document.getElementById('lastPriceAI').textContent = data.last_price_ai;
    }
    if (data.last_price_human !== null && data.last_price_human !== undefined) {
        document.getElementById('lastPriceHuman').textContent = data.last_price_human;
    }
    
    // 更新输入区域状态
    const inputSection = document.getElementById('inputSection');
    const waitingSection = document.getElementById('waitingSection');
    const submitBtn = document.getElementById('submitBtn');
    const priceInput = document.getElementById('priceInput');
    
    if (isGameFinished) {
        inputSection.style.display = 'none';
        waitingSection.style.display = 'none';
        showGameOverModal();
    } else if (isGameStarted && isWebSocketConnected) {
        inputSection.style.display = 'block';
        waitingSection.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
        if (priceInput) priceInput.disabled = false;
    }
}

// 处理本轮结果
function handleRoundResult(data) {
    // 隐藏等待提示
    document.getElementById('waitingSection').style.display = 'none';
    
    if (isGameStarted && isWebSocketConnected) {
        document.getElementById('inputSection').style.display = 'block';
        const submitBtn = document.getElementById('submitBtn');
        const priceInput = document.getElementById('priceInput');
        if (submitBtn) submitBtn.disabled = false;
        if (priceInput) priceInput.disabled = false;
    }
    
    // 添加到历史记录
    addHistoryItem(data);
    
    // 更新上一轮价格显示
    document.getElementById('lastPriceAI').textContent = data.price_ai;
    document.getElementById('lastPriceHuman').textContent = data.price_human;
}

// 添加历史记录项
function addHistoryItem(data) {
    const historyList = document.getElementById('historyList');
    
    // 移除空消息
    const emptyMsg = historyList.querySelector('.empty-message');
    if (emptyMsg) {
        emptyMsg.remove();
    }
    
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
        <div class="history-item-header">
            <span class="history-round">第 ${data.round} 轮</span>
            <div class="history-prices">
                <span>AI: ${data.price_ai}元</span>
                <span>你: ${data.price_human}元</span>
            </div>
        </div>
        <div class="history-profits">
            <div class="profit-item profit-ai-item">AI利润: ${data.profit_ai.toFixed(2)}元</div>
            <div class="profit-item profit-human-item">你的利润: ${data.profit_human.toFixed(2)}元</div>
        </div>
        ${data.ai_thought ? `<div class="ai-thought">💭 AI思考: ${data.ai_thought}</div>` : ''}
    `;
    
    historyList.insertBefore(item, historyList.firstChild);
}

// 提交价格
function submitPrice() {
    if (!isGameStarted) {
        showNotification('请先点击开始游戏按钮', 'warning');
        return;
    }
    
    if (!isWebSocketConnected || !websocket || websocket.readyState !== WebSocket.OPEN) {
        showNotification('连接已断开，请刷新页面重新开始', 'error');
        return;
    }
    
    const priceInput = document.getElementById('priceInput');
    const price = parseFloat(priceInput.value);
    
    if (isNaN(price) || price < 8 || price > 20) {
        showNotification('请输入8-20之间的有效价格', 'warning');
        return;
    }
    
    if (isGameFinished) {
        showNotification('游戏已结束', 'info');
        return;
    }
    
    // 禁用输入
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('inputSection').style.display = 'none';
    document.getElementById('waitingSection').style.display = 'block';
    
    // 发送价格
    websocket.send(JSON.stringify({
        type: 'submit_price',
        price: price
    }));
    
    // 清空输入
    priceInput.value = '';
}

// 加载排行榜
async function loadLeaderboard() {
    try {
        const response = await fetch(`${API_BASE}/api/business/leaderboard`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('加载排行榜失败');
        }
        
        const data = await response.json();
        renderLeaderboard(data.leaderboard || []);
    } catch (error) {
        console.error('加载排行榜失败:', error);
        renderLeaderboard([]);
    }
}

// 渲染排行榜
function renderLeaderboard(leaderboard) {
    const leaderboardList = document.getElementById('leaderboardList');
    leaderboardList.innerHTML = '';
    
    if (leaderboard.length === 0) {
        leaderboardList.innerHTML = '<p class="empty-message">暂无排行榜数据<br/>完成一局游戏后即可上榜</p>';
        return;
    }
    
    leaderboard.forEach((item, index) => {
        const rank = index + 1;
        const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
        
        const itemElement = document.createElement('div');
        itemElement.className = 'leaderboard-item';
        itemElement.innerHTML = `
            <span class="leaderboard-rank ${rankClass}">${rank}</span>
            <div class="leaderboard-info">
                <div class="leaderboard-username">${item.username || '匿名用户'}</div>
                <div class="leaderboard-profit">最佳成绩 · ${item.game_count || 0}局</div>
            </div>
            <span class="leaderboard-value">${parseFloat(item.total_profit || 0).toFixed(2)}元</span>
        `;
        leaderboardList.appendChild(itemElement);
    });
}

// 显示游戏结束模态框
function showGameOverModal() {
    const modal = document.getElementById('gameOverModal');
    document.getElementById('finalProfitHuman').textContent = totalProfitHuman.toFixed(2);
    document.getElementById('finalProfitAI').textContent = totalProfitAI.toFixed(2);
    
    const winnerText = document.getElementById('winnerText');
    if (totalProfitHuman > totalProfitAI) {
        winnerText.textContent = '🎉 恭喜！你获胜了！';
        winnerText.style.color = '#2d7a2d';
    } else if (totalProfitAI > totalProfitHuman) {
        winnerText.textContent = 'AI获胜了，再接再厉！';
        winnerText.style.color = '#8b4513';
    } else {
        winnerText.textContent = '平局！';
        winnerText.style.color = '#6b4423';
    }
    
    modal.style.display = 'flex';
    
    // 保存游戏结果
    saveGameResult();
}

// 保存游戏结果
async function saveGameResult() {
    try {
        const response = await fetch(`${API_BASE}/api/business/save-result`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                game_id: gameId
            })
        });
        
        if (response.ok) {
            // 刷新排行榜
            loadLeaderboard();
        }
    } catch (error) {
        console.error('保存游戏结果失败:', error);
    }
}

// 开始新游戏
function startNewGame() {
    // 关闭WebSocket
    if (websocket) {
        websocket.close();
    }
    
    // 重置状态
    gameId = null;
    currentRound = 0;
    totalProfitHuman = 0;
    totalProfitAI = 0;
    isGameFinished = false;
    isGameStarted = false;
    isWebSocketConnected = false;
    
    // 清空历史记录
    document.getElementById('historyList').innerHTML = '<p class="empty-message">暂无记录</p>';
    
    // 隐藏模态框
    document.getElementById('gameOverModal').style.display = 'none';
    
    // 重新初始化
    initGame();
}

// 返回
function goBack() {
    // 如果游戏正在进行中，显示确认对话框
    if (isGameStarted && !isGameFinished) {
        showConfirmDialog(
            '确认退出',
            `当前游戏进行到第 ${currentRound} 轮，累计利润 ${totalProfitHuman.toFixed(2)} 元。确定要退出吗？退出后当前游戏进度将丢失。`,
            () => {
                // 确认退出
                confirmExit();
            }
        );
    } else {
        // 游戏未开始或已结束，直接退出
        confirmExit();
    }
}

// 确认退出（实际执行退出操作）
function confirmExit() {
    // 标记为用户主动关闭
    isUserClosing = true;
    
    if (websocket) {
        // 尝试正常关闭连接
        try {
            websocket.close(1000, '用户主动退出');
        } catch (e) {
            console.log('关闭WebSocket时出错:', e);
        }
    }
    
    // 延迟跳转，确保WebSocket关闭消息已发送
    setTimeout(() => {
        window.location.href = '/frontend/pages/gathering.html';
    }, 100);
}

// 显示确认对话框
function showConfirmDialog(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    
    // 设置内容
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // 移除旧的事件监听器（通过克隆节点）
    const newOkBtn = okBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    
    // 添加新的事件监听器
    newOkBtn.addEventListener('click', () => {
        hideConfirmDialog();
        if (onConfirm) {
            onConfirm();
        }
    });
    
    newCancelBtn.addEventListener('click', () => {
        hideConfirmDialog();
    });
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideConfirmDialog();
        }
    });
    
    // 显示对话框
    modal.style.display = 'flex';
}

// 隐藏确认对话框
function hideConfirmDialog() {
    const modal = document.getElementById('confirmModal');
    modal.style.display = 'none';
}

// 显示友好的通知提示
function showNotification(message, type = 'info') {
    // 移除已存在的通知
    const existingNotification = document.querySelector('.game-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `game-notification game-notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 3秒后自动消失（错误消息保留更久）
    const autoHideDelay = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 300);
        }
    }, autoHideDelay);
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    initGame();
    
    // 回车提交
    document.getElementById('priceInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitPrice();
        }
    });
    
    // ESC键关闭确认对话框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const confirmModal = document.getElementById('confirmModal');
            if (confirmModal && confirmModal.style.display === 'flex') {
                hideConfirmDialog();
            }
        }
    });
    
    // 页面卸载时标记为用户主动关闭
    window.addEventListener('beforeunload', () => {
        isUserClosing = true;
        if (websocket) {
            try {
                websocket.close(1001, '页面关闭');
            } catch (e) {
                // 忽略错误
            }
        }
    });
    
    // 页面隐藏时也标记（移动端切换应用时）
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // 页面隐藏，可能是用户切换标签页，不标记为主动关闭
            // 但如果WebSocket断开，也不显示错误
        }
    });
});

