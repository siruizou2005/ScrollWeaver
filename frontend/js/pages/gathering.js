// 雅集页交互逻辑
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

// 用户名下拉菜单
const userDropdown = document.querySelector('.user-dropdown');
const dropdownMenu = document.querySelector('.dropdown-menu');

if (userDropdown && dropdownMenu) {
    userDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('show');
    });

    // 点击外部关闭下拉菜单
    document.addEventListener('click', (e) => {
        if (!userDropdown.contains(e.target)) {
            dropdownMenu.classList.remove('show');
        }
    });
}

// 退出登录（使用共享的确认对话框）
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        showConfirm('确定要退出登录吗？').then((confirmed) => {
            if (confirmed) {
                fetch(`${API_BASE}/api/logout`, { 
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
                .then(() => {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = '/frontend/pages/home.html';
                })
                .catch(() => {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = '/frontend/pages/home.html';
                });
            }
        });
    });
}

// 创建房间模态框控制
const createRoomBtn = document.getElementById('createRoomBtn');
const createRoomModal = document.getElementById('createRoomModal');
const closeCreateRoomModal = document.getElementById('closeCreateRoomModal');

if (createRoomBtn) {
    createRoomBtn.addEventListener('click', () => {
        if (createRoomModal) {
            createRoomModal.classList.add('active');
        }
    });
}

if (closeCreateRoomModal) {
    closeCreateRoomModal.addEventListener('click', () => {
        if (createRoomModal) {
            createRoomModal.classList.remove('active');
        }
    });
}

// 点击模态框外部关闭
if (createRoomModal) {
    createRoomModal.addEventListener('click', (e) => {
        if (e.target === createRoomModal) {
            createRoomModal.classList.remove('active');
        }
    });
}

// 创建房间表单提交
const createRoomForm = document.getElementById('createRoomForm');
if (createRoomForm) {
    createRoomForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const roomName = document.getElementById('roomName').value;
        const roomPassword = document.getElementById('roomPassword').value;
        
        if (!roomName.trim()) {
            alert('请输入房间名称');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/rooms/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: roomName.trim(),
                    password: roomPassword.trim() || null,
                    maxPlayers: 3  // 最多三个人玩
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || errorData.message || '创建房间失败');
            }
            
            const room = await response.json();
            
            // 关闭模态框
            if (createRoomModal) {
                createRoomModal.classList.remove('active');
            }
            
            // 清空表单
            document.getElementById('roomName').value = '';
            document.getElementById('roomPassword').value = '';
            
            // 刷新房间列表
            loadRooms();
            
            alert('房间创建成功！');
        } catch (error) {
            console.error('创建房间失败:', error);
            alert('创建房间失败：' + (error.message || '请重试'));
        }
    });
}

// 加载房间列表
async function loadRooms() {
    try {
        const response = await fetch(`${API_BASE}/api/rooms`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            // 如果API不存在，显示空列表
            renderRooms([]);
            return;
        }
        
        const data = await response.json();
        const rooms = data.rooms || data || [];
        renderRooms(rooms);
    } catch (error) {
        console.error('加载房间列表失败:', error);
        renderRooms([]);
    }
}

function renderRooms(rooms) {
    const roomList = document.getElementById('roomList');
    if (!roomList) return;
    
    roomList.innerHTML = '';
    
    if (rooms.length === 0) {
        roomList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #6b4423;">
                <p>暂无房间</p>
                <p style="font-size: 0.9rem; margin-top: 0.5rem; opacity: 0.7;">点击上方按钮创建房间</p>
            </div>
        `;
        return;
    }
    
    rooms.forEach(room => {
        const card = createRoomCard(room);
        roomList.appendChild(card);
    });
}

function createRoomCard(room) {
    const card = document.createElement('div');
    card.className = 'room-card';
    
    const currentPlayers = room.currentPlayers || room.current_players || 0;
    const maxPlayers = room.maxPlayers || room.max_players || 3;
    const roomId = room.id || room.room_id;
    
    card.innerHTML = `
        <div class="room-name">${room.name || '未命名房间'}</div>
        <div class="room-info">
            <span>当前人数：${currentPlayers}/${maxPlayers}</span>
            <div class="room-actions">
                <input type="text" class="room-password-input" 
                       placeholder="输入暗号" 
                       id="password-${roomId}">
                <button class="join-room-btn" onclick="joinRoom('${roomId}')">
                    进入
                </button>
            </div>
        </div>
    `;
    
    return card;
}

// 加入房间（全局函数，供HTML调用）
window.joinRoom = async function(roomId) {
    const passwordInput = document.getElementById(`password-${roomId}`);
    const password = passwordInput ? passwordInput.value : '';
    
    try {
        const response = await fetch(`${API_BASE}/api/rooms/${roomId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ password: password.trim() || null })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || errorData.message || '进入房间失败');
        }
        
        const data = await response.json();
        
        // 跳转到房间页面
        // 如果房间页面不存在，可以跳转到其他页面或显示提示
        const roomUrl = `/frontend/pages/room.html?id=${roomId}`;
        window.location.href = roomUrl;
    } catch (error) {
        console.error('进入房间失败:', error);
        alert(error.message || '进入房间失败，请重试');
    }
};

// 开始游戏
document.getElementById('werewolfCard')?.addEventListener('click', (e) => {
    // 如果点击的是按钮，直接开始游戏
    if (e.target.classList.contains('start-game-btn')) {
        e.stopPropagation();
        startGame('werewolf');
    } else {
        // 如果点击的是卡片其他地方，也直接开始游戏
        startGame('werewolf');
    }
});

document.getElementById('whoIsAICard')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('start-game-btn')) {
        e.stopPropagation();
        startGame('who-is-ai');
    } else {
        startGame('who-is-ai');
    }
});

document.getElementById('businessCard')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('start-game-btn')) {
        e.stopPropagation();
        startGame('business');
    } else {
        startGame('business');
    }
});

function startGame(gameType) {
    // 狼人杀跳转到专门的狼人杀页面（黑色风格）
    if (gameType === 'werewolf') {
        // 跳转到专门的狼人杀页面，而不是书卷风格的game页面
        window.location.href = '/frontend/pages/werewolf.html';
    } else {
        // 其他游戏暂时显示提示
        alert(`${gameType === 'who-is-ai' ? '谁是AI' : '商业博弈'}功能开发中，敬请期待！`);
    }
}

// 页面加载时获取房间列表
document.addEventListener('DOMContentLoaded', () => {
    loadRooms();
});

