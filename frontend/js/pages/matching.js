// 匹配页交互逻辑
const API_BASE = window.location.origin;
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room_id');
const scrollId = urlParams.get('scroll_id');
const isHost = urlParams.get('is_host') === 'true';

const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/frontend/pages/login.html';
    throw new Error('未登录');
}

let socket = null;
let confirmed = false;
let players = [];

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    if (!roomId || !scrollId) {
        alert('缺少必要参数');
        window.location.href = '/frontend/pages/gathering.html';
        return;
    }

    await loadRoomInfo();
    connectWebSocket();
    bindEventListeners();
});

// 加载房间信息
async function loadRoomInfo() {
    try {
        const response = await fetch(`${API_BASE}/api/multiplayer/room/${roomId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('获取房间信息失败');
        }

        const data = await response.json();
        document.getElementById('roomInfo').textContent = `房间：${data.scroll_title || '未知书卷'}`;
        updatePlayersList(data.players || []);
    } catch (error) {
        console.error('加载房间信息失败:', error);
        alert('加载房间信息失败');
    }
}

// 连接WebSocket
function connectWebSocket() {
    socket = io(API_BASE, {
        auth: {
            token: token
        }
    });

    socket.on('connect', () => {
        console.log('WebSocket连接成功');
        socket.emit('join_matching_room', { room_id: roomId });
    });

    socket.on('player_joined', async (data) => {
        console.log('玩家加入:', data);
        await loadRoomInfo();
    });

    socket.on('player_left', async (data) => {
        console.log('玩家离开:', data);
        await loadRoomInfo();
    });

    socket.on('player_confirmed', async (data) => {
        console.log('玩家确认:', data);
        await loadRoomInfo();
    });

    socket.on('room_started', (data) => {
        console.log('房间开始:', data);
        window.location.href = `/frontend/pages/multiplayer-story.html?room_id=${roomId}&scroll_id=${scrollId}`;
    });

    socket.on('disconnect', () => {
        console.log('WebSocket断开连接');
    });
}

// 更新玩家列表
function updatePlayersList(newPlayers) {
    players = newPlayers;
    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';

    if (players.length === 0) {
        playersList.innerHTML = '<p style="text-align: center; color: #8b7355;">暂无玩家</p>';
        return;
    }

    players.forEach(player => {
        const card = document.createElement('div');
        card.className = `player-card ${player.confirmed ? 'confirmed' : ''}`;
        card.innerHTML = `
            <div class="player-info">
                <div class="player-avatar">${player.username ? player.username.charAt(0).toUpperCase() : '?'}</div>
                <div>
                    <div class="player-name">${player.username || '未知用户'}</div>
                    <div class="player-status">
                        ${player.confirmed ? '<i class="fas fa-check-circle"></i> 已确认' : '<i class="fas fa-clock"></i> 等待确认'}
                    </div>
                </div>
            </div>
            ${player.is_host ? '<span style="color: #6b4423; font-weight: 600;">房主</span>' : ''}
        `;
        playersList.appendChild(card);
    });

    checkAllConfirmed(players);
    
    // 定期刷新玩家列表
    setTimeout(() => {
        loadRoomInfo();
    }, 2000);
}

// 检查是否所有人都已确认
function checkAllConfirmed(playersList) {
    const allConfirmed = playersList.length > 0 && playersList.every(p => p.confirmed);
    const statusIndicator = document.getElementById('statusIndicator');
    const startBtn = document.getElementById('startBtn');

    if (allConfirmed) {
        statusIndicator.innerHTML = '<i class="fas fa-check-circle"></i> <span>所有玩家已确认，房主可以开始游戏</span>';
        statusIndicator.style.color = '#4caf50';
        
        if (isHost) {
            startBtn.style.display = 'inline-block';
        }
    } else {
        const confirmedCount = playersList.filter(p => p.confirmed).length;
        statusIndicator.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>等待确认 (${confirmedCount}/${playersList.length})</span>`;
        statusIndicator.style.color = '#6b4423';
        startBtn.style.display = 'none';
    }
}

// 绑定事件监听器
function bindEventListeners() {
    const confirmBtn = document.getElementById('confirmBtn');
    if (!confirmBtn) {
        console.error('confirmBtn not found');
        return;
    }
    
    confirmBtn.addEventListener('click', async () => {
        if (confirmed) {
            alert('您已经确认过了');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/multiplayer/confirm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ room_id: roomId })
            });

            if (!response.ok) {
                throw new Error('确认失败');
            }

            confirmed = true;
            document.getElementById('confirmBtn').disabled = true;
            document.getElementById('confirmBtn').innerHTML = '<i class="fas fa-check"></i> 已确认';
            
            socket.emit('player_confirm', { room_id: roomId });
        } catch (error) {
            console.error('确认失败:', error);
            alert('确认失败，请重试');
        }
    });

    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
            if (confirm('确定要离开房间吗？')) {
                try {
                    await fetch(`${API_BASE}/api/multiplayer/leave-room`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ room_id: roomId })
                    });
                } catch (error) {
                    console.error('离开房间失败:', error);
                }
                window.location.href = '/frontend/pages/gathering.html';
            }
        });
    }

    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('开始按钮被点击，isHost:', isHost, 'roomId:', roomId, 'scrollId:', scrollId);
            
            if (!isHost) {
                alert('只有房主可以开始游戏');
                return;
            }

            // 禁用按钮防止重复点击
            startBtn.disabled = true;
            const originalHTML = startBtn.innerHTML;
            startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在进入...';

            try {
                console.log('调用开始游戏API...');
                const response = await fetch(`${API_BASE}/api/multiplayer/start-room`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ room_id: roomId })
                });

                console.log('API响应状态:', response.status);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ detail: '开始游戏失败' }));
                    throw new Error(errorData.detail || '开始游戏失败');
                }

                const result = await response.json();
                console.log('API调用成功:', result);

                // 发送WebSocket事件通知其他玩家
                if (socket && socket.connected) {
                    console.log('发送WebSocket事件...');
                    socket.emit('start_game', { room_id: roomId });
                }

                // 直接跳转到入卷同游页面
                console.log('准备跳转到:', `/frontend/pages/multiplayer-story.html?room_id=${roomId}&scroll_id=${scrollId}`);
                window.location.href = `/frontend/pages/multiplayer-story.html?room_id=${roomId}&scroll_id=${scrollId}`;
            } catch (error) {
                console.error('开始游戏失败:', error);
                alert(error.message || '开始游戏失败，请重试');
                // 恢复按钮状态
                startBtn.disabled = false;
                startBtn.innerHTML = originalHTML;
            }
        });
    } else {
        console.error('startBtn元素未找到');
    }
}

// 页面卸载时断开连接
window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.disconnect();
    }
});
