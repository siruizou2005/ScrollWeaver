// 谁是人类游戏页面逻辑
const API_BASE = window.location.origin;

// 检查登录状态
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/frontend/pages/login.html';
    throw new Error('未登录');
}

const user = JSON.parse(localStorage.getItem('user') || '{}');
let gameId = null;
let websocket = null;
let humanPlayerId = null;
let currentRound = 0;
let maxRounds = 3;
let players = [];

// 返回按钮
function goBack() {
    if (websocket) {
        websocket.close();
    }
    window.location.href = '/frontend/pages/gathering.html';
}

// 切换规则面板折叠状态
function toggleRules() {
    const infoCard = document.querySelector('.info-card');
    const rulesContent = document.getElementById('rulesContent');
    const rulesIcon = document.getElementById('rulesIcon');
    
    if (infoCard.classList.contains('collapsed')) {
        infoCard.classList.remove('collapsed');
        rulesContent.style.maxHeight = rulesContent.scrollHeight + 'px';
    } else {
        infoCard.classList.add('collapsed');
        rulesContent.style.maxHeight = '0';
    }
}

// 初始化：默认折叠规则面板
document.addEventListener('DOMContentLoaded', () => {
    const infoCard = document.querySelector('.info-card');
    const rulesContent = document.getElementById('rulesContent');
    if (infoCard && rulesContent) {
        infoCard.classList.add('collapsed');
        rulesContent.style.maxHeight = '0';
    }
});

// 开始游戏
async function startGame() {
    try {
        const response = await fetch(`${API_BASE}/api/who-is-human/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.detail || '创建游戏失败');
        }
        
        const data = await response.json();
        gameId = data.game_id;
        
        // 连接WebSocket
        connectWebSocket();
        
        // 隐藏开始按钮，显示等待状态
        document.getElementById('startSection').style.display = 'none';
        document.getElementById('waitingSection').style.display = 'block';
        
    } catch (error) {
        console.error('开始游戏失败:', error);
        alert('开始游戏失败：' + (error.message || '请重试'));
        document.getElementById('startSection').style.display = 'block';
        document.getElementById('waitingSection').style.display = 'none';
    }
}

// 连接WebSocket
function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/who-is-human/${gameId}?token=${token}`;
    
    websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
        console.log('WebSocket连接已建立');
        // 发送开始游戏消息
        websocket.send(JSON.stringify({
            type: 'start_game'
        }));
    };
    
    websocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
    };
    
    websocket.onerror = (error) => {
        console.error('WebSocket错误:', error);
        alert('连接错误，请刷新页面重试');
    };
    
    websocket.onclose = () => {
        console.log('WebSocket连接已关闭');
    };
}

// 处理WebSocket消息
function handleWebSocketMessage(message) {
    console.log('收到消息:', message);
    
    switch (message.type) {
        case 'game_state':
            updateGameState(message);
            break;
        case 'game_start':
            handleGameStart(message);
            break;
        case 'round_start':
            handleRoundStart(message);
            break;
        case 'descriptions_ready':
            handleDescriptionsReady(message);
            break;
        case 'all_descriptions_ready':
            handleAllDescriptionsReady(message);
            break;
        case 'round_result':
            handleRoundResult(message);
            break;
        case 'game_end':
            handleGameEnd(message);
            break;
        case 'error':
            alert('错误：' + message.message);
            break;
        default:
            console.log('未知消息类型:', message.type);
    }
}

// 更新游戏状态
function updateGameState(message) {
    currentRound = message.current_round || 0;
    maxRounds = message.max_rounds || 3;
    
    document.getElementById('currentRound').textContent = `${currentRound} / ${maxRounds}`;
    document.getElementById('gameState').textContent = message.is_finished ? '已结束' : '进行中';
    
    // 更新轮次进度指示器
    updateRoundIndicators(currentRound, maxRounds);
}

// 更新轮次进度指示器
function updateRoundIndicators(currentRound, maxRounds) {
    const indicators = document.querySelectorAll('.round-dot:not(.overtime-dot)');
    const overtimeDot = document.querySelector('.round-dot.overtime-dot');
    
    // 如果maxRounds > 2，显示加时赛点
    if (maxRounds > 2 && overtimeDot) {
        overtimeDot.classList.add('show');
    } else if (overtimeDot) {
        overtimeDot.classList.remove('show');
    }
    
    // 更新所有点的状态
    const allDots = document.querySelectorAll('.round-dot');
    allDots.forEach((dot) => {
        const roundNum = parseInt(dot.getAttribute('data-round'));
        dot.classList.remove('active', 'completed');
        
        if (roundNum < currentRound) {
            // 已完成的轮次
            dot.classList.add('completed');
        } else if (roundNum === currentRound) {
            // 当前轮次
            dot.classList.add('active');
        }
    });
}

// 处理游戏开始
function handleGameStart(message) {
    players = message.all_players || message.players || [];
    maxRounds = message.max_rounds || 2;
    
    // 更新物品显示（整个游戏都使用这个物品）
    document.getElementById('currentItem').textContent = message.item;
    
    // 更新轮次显示
    document.getElementById('currentRound').textContent = `0 / ${maxRounds}`;
    
    // 更新轮次指示器（根据maxRounds决定是否显示第三个点）
    updateRoundIndicators(0, maxRounds);
    
    // 找到人类玩家ID
    const humanPlayer = players.find(p => p.type === 'human');
    if (humanPlayer) {
        humanPlayerId = humanPlayer.id;
    }
    
    // 显示提示：2轮淘汰制
    console.log(`游戏开始，物品：${message.item}，将进行淘汰制游戏`);
}

// 处理轮次开始
function handleRoundStart(message) {
    currentRound = message.round;
    maxRounds = message.max_rounds || maxRounds;
    
    // 更新状态显示（物品保持不变）
    document.getElementById('currentRound').textContent = `${currentRound} / ${maxRounds}`;
    document.getElementById('currentItem').textContent = message.item; // 物品在整个游戏中保持不变
    
    // 更新轮次进度指示器（如果进入加时赛，会显示第三个点）
    updateRoundIndicators(currentRound, maxRounds);
    
    // 显示活跃玩家和已出局玩家信息
    const activePlayers = message.active_players || [];
    const eliminatedPlayers = message.eliminated_players || [];
    let stateText = `第${currentRound}轮 - 等待描述`;
    if (eliminatedPlayers.length > 0) {
        stateText += ` (已出局：${eliminatedPlayers.length}人)`;
    }
    document.getElementById('gameState').textContent = stateText;
    
    // 显示上一轮发言历史
    if (message.previous_round && message.previous_round.descriptions) {
        displayPreviousRound(message.previous_round);
    } else {
        // 隐藏历史面板
        document.getElementById('historyPanel').style.display = 'none';
    }
    
    // 清空当前轮描述列表
    document.getElementById('descriptionsList').innerHTML = '<p class="empty-message">等待描述...</p>';
    
    // 隐藏投票面板
    document.getElementById('votingPanel').style.display = 'none';
    
    // 显示等待状态
    document.getElementById('waitingSection').style.display = 'block';
    document.getElementById('inputSection').style.display = 'none';
}

// 显示上一轮发言
function displayPreviousRound(previousRound) {
    const historyPanel = document.getElementById('historyPanel');
    const historyList = document.getElementById('historyList');
    
    if (!previousRound.descriptions || Object.keys(previousRound.descriptions).length === 0) {
        historyPanel.style.display = 'none';
        return;
    }
    
    historyPanel.style.display = 'block';
    historyList.innerHTML = '';
    
    // 显示上一轮的描述
    const descriptions = previousRound.descriptions;
    const allPlayers = players || [];
    
    for (const [playerId, description] of Object.entries(descriptions)) {
        const player = allPlayers.find(p => p.id === playerId);
        const playerName = player ? player.name : '玩家';
        const isEliminated = previousRound.eliminated_player === playerId;
        
        const item = document.createElement('div');
        item.className = 'description-item';
        if (isEliminated) {
            item.style.opacity = '0.6';
            item.style.borderLeftColor = 'rgba(200, 0, 0, 0.5)';
        }
        item.innerHTML = `
            <div class="description-player-name">
                ${playerName} 
                ${isEliminated ? '<span style="color: #c80000;">(已出局)</span>' : ''}
            </div>
            <div class="description-text">${description}</div>
        `;
        historyList.appendChild(item);
    }
}

// 处理描述已准备好（等待人类玩家输入）
function handleDescriptionsReady(message) {
    // 显示输入区域
    document.getElementById('waitingSection').style.display = 'none';
    document.getElementById('inputSection').style.display = 'block';
    
    // 启用输入框和提交按钮
    const descriptionInput = document.getElementById('descriptionInput');
    const submitBtn = document.getElementById('submitDescriptionBtn');
    
    descriptionInput.disabled = false;
    submitBtn.disabled = false;
    descriptionInput.focus();
    
    // 显示AI的描述（只读）
    const descriptionsList = document.getElementById('descriptionsList');
    descriptionsList.innerHTML = '';
    
    const currentPlayers = message.active_players || message.players || players;
    for (const [playerId, description] of Object.entries(message.descriptions)) {
        const player = currentPlayers.find(p => p.id === playerId);
        const playerName = player ? player.name : '玩家';
        
        const item = document.createElement('div');
        item.className = 'description-item';
        item.innerHTML = `
            <div class="description-player-name">${playerName}</div>
            <div class="description-text">${description}</div>
        `;
        descriptionsList.appendChild(item);
    }
}

// 处理所有描述已准备好（可以投票）
function handleAllDescriptionsReady(message) {
    // 隐藏输入区域
    document.getElementById('inputSection').style.display = 'none';
    
    // 显示所有描述
    const descriptionsList = document.getElementById('descriptionsList');
    descriptionsList.innerHTML = '';
    
    message.descriptions.forEach((desc, index) => {
        const item = document.createElement('div');
        item.className = 'description-item';
        item.innerHTML = `
            <div class="description-player-name">${desc.player_name}</div>
            <div class="description-text">${desc.description}</div>
        `;
        descriptionsList.appendChild(item);
    });
    
    // 显示投票面板
    const votingPanel = document.getElementById('votingPanel');
    votingPanel.style.display = 'block';
    
    // 创建投票选项
    const votingOptions = document.getElementById('votingOptions');
    votingOptions.innerHTML = '';
    
    // 只显示活跃玩家的投票选项（不能投票给自己）
    message.descriptions.forEach((desc) => {
        // 检查是否是当前玩家（不能投票给自己）
        if (desc.player_id === humanPlayerId) {
            return; // 跳过自己
        }
        
        const option = document.createElement('button');
        option.className = 'voting-option';
        option.textContent = desc.player_name;
        option.setAttribute('data-player-id', desc.player_id); // 添加data属性便于识别
        // 使用闭包确保player_id正确传递
        option.addEventListener('click', function() {
            const playerId = this.getAttribute('data-player-id');
            console.log('投票按钮被点击，player_id:', playerId);
            submitVote(playerId);
        });
        votingOptions.appendChild(option);
    });
    
    // 如果没有投票选项，说明只有自己一个人了（不应该发生）
    if (votingOptions.children.length === 0) {
        votingOptions.innerHTML = '<p class="empty-message">无法投票（只剩你一个人）</p>';
    }
    
    // 如果没有投票选项，说明只有自己一个人了（不应该发生）
    if (votingOptions.children.length === 0) {
        votingOptions.innerHTML = '<p class="empty-message">无法投票（只剩你一个人）</p>';
    }
}

// 提交描述
function submitDescription() {
    const descriptionInput = document.getElementById('descriptionInput');
    const description = descriptionInput.value.trim();
    
    if (!description) {
        alert('请输入描述');
        return;
    }
    
    // 禁用输入和按钮
    descriptionInput.disabled = true;
    document.getElementById('submitDescriptionBtn').disabled = true;
    
    // 发送描述
    websocket.send(JSON.stringify({
        type: 'submit_description',
        description: description
    }));
}

// 提交投票
function submitVote(votedPlayerId) {
    console.log('submitVote called with:', votedPlayerId);
    console.log('humanPlayerId:', humanPlayerId);
    console.log('websocket state:', websocket ? websocket.readyState : 'null');
    
    if (!humanPlayerId) {
        alert('无法识别玩家ID，请刷新页面重试');
        return;
    }
    
    if (!votedPlayerId) {
        alert('请选择要投票的玩家');
        return;
    }
    
    // 检查WebSocket连接
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        alert('WebSocket连接已断开，请刷新页面重试');
        return;
    }
    
    // 禁用所有投票选项
    const options = document.querySelectorAll('.voting-option');
    options.forEach(opt => {
        opt.disabled = true;
        // 标记选中的选项
        const playerId = opt.getAttribute('data-player-id');
        if (playerId === votedPlayerId) {
            opt.classList.add('selected');
        }
    });
    
    // 发送投票
    const voteMessage = {
        type: 'submit_vote',
        voter_id: humanPlayerId,
        voted_player_id: votedPlayerId
    };
    
    console.log('Sending vote message:', voteMessage);
    
    try {
        websocket.send(JSON.stringify(voteMessage));
    } catch (error) {
        console.error('发送投票失败:', error);
        alert('发送投票失败：' + error.message);
    }
}

// 处理轮次结果
function handleRoundResult(message) {
    // 更新状态
    let stateText = '';
    if (message.is_tie) {
        stateText = `平局！${message.tie_players?.length || 0}位玩家得票相同，将进行加时赛`;
        // 平局时，maxRounds会增加，更新指示器显示第三个点
        if (message.max_rounds && message.max_rounds > 2) {
            maxRounds = message.max_rounds;
            document.getElementById('currentRound').textContent = `${currentRound} / ${maxRounds}`;
            updateRoundIndicators(currentRound, maxRounds);
        }
    } else if (message.eliminated_player) {
        const allPlayers = message.all_players || players || [];
        const eliminatedPlayer = allPlayers.find(p => p.id === message.eliminated_player);
        const isHumanEliminated = message.eliminated_player === message.human_player_id;
        if (isHumanEliminated) {
            stateText = eliminatedPlayer ? `${eliminatedPlayer.name} 被投票出局，游戏结束` : '你被淘汰，游戏结束';
        } else {
            stateText = eliminatedPlayer ? `${eliminatedPlayer.name} 被投票出局` : '有玩家被淘汰';
        }
    }
    document.getElementById('gameState').textContent = stateText || '本轮结束';
    
    // 如果消息中包含max_rounds更新，同步更新显示
    if (message.max_rounds && message.max_rounds !== maxRounds) {
        maxRounds = message.max_rounds;
        document.getElementById('currentRound').textContent = `${currentRound} / ${maxRounds}`;
        updateRoundIndicators(currentRound, maxRounds);
    }
    
    // 显示投票结果
    const descriptionsList = document.getElementById('descriptionsList');
    descriptionsList.innerHTML = '';
    
    // 显示投票统计
    const voteCounts = message.vote_counts || {};
    const mostVoted = message.most_voted || [];
    const allPlayers = message.all_players || players || [];
    
    for (const [playerId, description] of Object.entries(message.descriptions)) {
        const player = allPlayers.find(p => p.id === playerId);
        const playerName = player ? player.name : '玩家';
        const votes = voteCounts[playerId] || 0;
        const isMostVoted = mostVoted.includes(playerId);
        const isHuman = playerId === message.human_player_id;
        const isEliminated = message.eliminated_player === playerId;
        
        const item = document.createElement('div');
        item.className = 'description-item';
        if (isMostVoted) {
            item.style.borderLeftColor = 'rgba(212, 175, 55, 1)';
            item.style.boxShadow = '0 4px 12px rgba(212, 175, 55, 0.4)';
        }
        if (isEliminated) {
            item.style.opacity = '0.6';
            item.style.borderLeftColor = 'rgba(200, 0, 0, 0.8)';
        }
        item.innerHTML = `
            <div class="description-player-name">
                ${playerName} 
                ${isHuman ? '<span style="color: #2d7a2d;">(你)</span>' : ''}
                ${isMostVoted ? '<span style="color: #d4af37;">(得票最多)</span>' : ''}
                ${isEliminated ? '<span style="color: #c80000;">(已出局)</span>' : ''}
            </div>
            <div class="description-text">${description}</div>
            <div style="margin-top: 0.3rem; font-size: 0.7rem; color: #6b4423;">
                得票数：${votes}
            </div>
        `;
        descriptionsList.appendChild(item);
    }
    
    // 隐藏投票面板
    document.getElementById('votingPanel').style.display = 'none';
    
    // 更新上一轮发言显示
    if (message.descriptions) {
        displayPreviousRound(message);
    }
}

// 处理游戏结束
function handleGameEnd(message) {
    const modal = document.getElementById('gameOverModal');
    document.getElementById('finalRounds').textContent = message.total_rounds;
    
    let winnerText = '';
    if (message.human_survived) {
        winnerText = '恭喜！你成功存活到最后！';
    } else {
        const round = message.eliminated_round || '未知';
        winnerText = `很遗憾，你在第${round}轮被淘汰了`;
    }
    
    document.getElementById('finalFoundCount').textContent = message.human_survived ? '存活' : '被淘汰';
    document.getElementById('winnerText').textContent = winnerText;
    modal.style.display = 'flex';
}

// 开始新游戏
function startNewGame() {
    // 关闭WebSocket
    if (websocket) {
        websocket.close();
    }
    
    // 重置状态
    gameId = null;
    websocket = null;
    humanPlayerId = null;
    currentRound = 0;
    
    // 重置UI
    document.getElementById('gameOverModal').style.display = 'none';
    document.getElementById('startSection').style.display = 'block';
    document.getElementById('inputSection').style.display = 'none';
    document.getElementById('waitingSection').style.display = 'none';
    document.getElementById('votingPanel').style.display = 'none';
    document.getElementById('descriptionsList').innerHTML = '<p class="empty-message">等待描述...</p>';
    document.getElementById('descriptionInput').value = '';
    document.getElementById('currentRound').textContent = '0 / 2';
    document.getElementById('currentItem').textContent = '等待开始';
    document.getElementById('gameState').textContent = '等待开始';
    
    // 重置轮次指示器（默认2轮，隐藏第三个点）
    maxRounds = 2;
    updateRoundIndicators(0, 2);
}

// 页面卸载时关闭WebSocket
window.addEventListener('beforeunload', () => {
    if (websocket) {
        websocket.close();
    }
});

