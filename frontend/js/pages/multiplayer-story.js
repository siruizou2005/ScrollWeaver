// 入卷同游页交互逻辑
const API_BASE = window.location.origin;
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room_id');
const scrollId = urlParams.get('scroll_id');

const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/frontend/pages/login.html';
    throw new Error('未登录');
}

let socket = null;
let characters = [];
let players = [];
let selectedRole = null;
let currentUserId = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    if (!roomId || !scrollId) {
        alert('缺少必要参数');
        window.location.href = '/frontend/pages/gathering.html';
        return;
    }

    await loadUserInfo();
    await loadScrollInfo();
    await loadCharacters();
    await loadRoomInfo();
    connectWebSocket();
});

// 加载用户信息
async function loadUserInfo() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        currentUserId = user.id;
    } catch (error) {
        console.error('加载用户信息失败:', error);
    }
}

// 加载书卷信息
async function loadScrollInfo() {
    try {
        const response = await fetch(`${API_BASE}/api/scroll/${scrollId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('获取书卷信息失败');
        }

        const data = await response.json();
        const scroll = data.scroll || data;
        document.getElementById('scrollTitle').textContent = scroll.title || '未知书卷';
    } catch (error) {
        console.error('加载书卷信息失败:', error);
    }
}

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
        updatePlayersList(data.players || []);
        
        // 更新当前用户的选择
        const currentPlayer = data.players.find(p => p.user_id === currentUserId);
        if (currentPlayer) {
            selectedRole = currentPlayer.selected_role || null;
            updateSelectedRoleDisplay();
        }
    } catch (error) {
        console.error('加载房间信息失败:', error);
    }
}

// 加载角色列表
async function loadCharacters() {
    try {
        const response = await fetch(`${API_BASE}/api/scroll/${scrollId}/characters`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('获取角色列表失败');
        }

        const data = await response.json();
        characters = data.characters || [];
        renderCharacters();
    } catch (error) {
        console.error('加载角色列表失败:', error);
    }
}

// 渲染角色列表
function renderCharacters() {
    const charactersGrid = document.getElementById('charactersGrid');
    charactersGrid.innerHTML = '';

    if (characters.length === 0) {
        charactersGrid.innerHTML = '<p style="text-align: center; color: #8b7355;">暂无角色</p>';
        return;
    }

    characters.forEach(char => {
        const card = document.createElement('div');
        card.className = 'character-card';
        card.dataset.roleCode = char.code;

        // 检查角色是否被选择
        const player = players.find(p => p.selected_role === char.code);
        const isSelected = selectedRole === char.code;
        const isOccupied = player && player.user_id !== currentUserId;

        if (isSelected) {
            card.classList.add('selected');
        } else if (isOccupied) {
            card.classList.add('occupied');
        }

        const displayName = char.name || char.nickname || char.code;
        const description = char.description || char.persona || '暂无描述';
        const avatar = char.avatar || '';

        card.innerHTML = `
            <div class="character-avatar">
                ${avatar ? `<img src="${avatar}" alt="${displayName}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>'">` : '<i class="fas fa-user"></i>'}
            </div>
            <div class="character-name">${displayName}</div>
            <div class="character-desc">${description.length > 50 ? description.substring(0, 50) + '...' : description}</div>
            ${isSelected ? '<div class="character-status selected">已选择</div>' : ''}
            ${isOccupied ? `<div class="character-status occupied">${player.username || '其他玩家'}</div>` : ''}
        `;

        if (!isOccupied) {
            card.addEventListener('click', () => {
                selectRole(char.code);
            });
        }

        charactersGrid.appendChild(card);
    });
}

// 选择角色
async function selectRole(roleCode) {
    // 如果点击的是已选择的角色，则取消选择
    if (selectedRole === roleCode) {
        roleCode = null;
    }

    try {
        const response = await fetch(`${API_BASE}/api/multiplayer/select-role`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                room_id: roomId,
                role_code: roleCode
            })
        });

        if (!response.ok) {
            throw new Error('选择角色失败');
        }

        selectedRole = roleCode;
        updateSelectedRoleDisplay();
        
        // 通过WebSocket通知其他玩家
        socket.emit('role_selected', {
            room_id: roomId,
            role_code: roleCode
        });

        renderCharacters();
    } catch (error) {
        console.error('选择角色失败:', error);
        alert('选择角色失败，请重试');
    }
}

// 更新选中的角色显示
function updateSelectedRoleDisplay() {
    const selectedRoleCard = document.getElementById('selectedRoleCard');
    
    if (!selectedRole) {
        selectedRoleCard.innerHTML = `
            <div class="no-role">
                <i class="fas fa-user-slash"></i>
                <p>暂未选择角色</p>
            </div>
        `;
        return;
    }

    const character = characters.find(c => c.code === selectedRole);
    if (!character) return;

    const displayName = character.name || character.nickname || character.code;
    const description = character.description || character.persona || '暂无描述';
    const avatar = character.avatar || '';

    selectedRoleCard.innerHTML = `
        <div class="selected-role-info">
            <div class="selected-role-avatar">
                ${avatar ? `<img src="${avatar}" alt="${displayName}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>'">` : '<i class="fas fa-user"></i>'}
            </div>
            <div class="selected-role-name">${displayName}</div>
            <div class="selected-role-desc">${description.length > 100 ? description.substring(0, 100) + '...' : description}</div>
            <button class="btn-unselect" onclick="selectRole('${selectedRole}')">
                <i class="fas fa-times"></i> 取消选择
            </button>
        </div>
    `;
}

// 更新玩家列表
function updatePlayersList(newPlayers) {
    players = newPlayers;
    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';

    document.getElementById('playerCount').textContent = `玩家数：${players.length}`;

    if (players.length === 0) {
        playersList.innerHTML = '<p style="text-align: center; color: #8b7355;">暂无玩家</p>';
        return;
    }

    players.forEach(player => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = `
            <div class="player-avatar">${player.username ? player.username.charAt(0).toUpperCase() : '?'}</div>
            <div style="flex: 1;">
                <div class="player-name">${player.username || '未知用户'}</div>
                ${player.selected_role ? `<div class="player-role">${getRoleName(player.selected_role)}</div>` : '<div class="player-role">未选择角色</div>'}
            </div>
        `;
        playersList.appendChild(item);
    });

    renderCharacters();
}

// 获取角色名称
function getRoleName(roleCode) {
    const character = characters.find(c => c.code === roleCode);
    return character ? (character.name || character.nickname || character.code) : roleCode;
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
        socket.emit('join_multiplayer_room', { room_id: roomId });
    });

    socket.on('players_updated', async (data) => {
        console.log('玩家列表更新:', data);
        await loadRoomInfo();
    });

    socket.on('role_selected', async (data) => {
        console.log('角色选择更新:', data);
        // 重新加载玩家列表以获取最新状态
        await loadRoomInfo();
    });
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
            updatePlayersList(data.players || []);
            
            // 更新当前用户的选择
            const currentPlayer = data.players.find(p => p.user_id === currentUserId);
            if (currentPlayer) {
                selectedRole = currentPlayer.selected_role || null;
                updateSelectedRoleDisplay();
            }
        } catch (error) {
            console.error('加载房间信息失败:', error);
        }
    }

    socket.on('disconnect', () => {
        console.log('WebSocket断开连接');
    });
}

// 页面卸载时断开连接
window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.disconnect();
    }
});
