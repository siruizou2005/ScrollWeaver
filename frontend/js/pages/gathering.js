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

// Logo点击返回广场页
const logo = document.querySelector('.logo.seal-logo');
if (logo) {
    logo.addEventListener('click', () => {
        window.location.href = '/frontend/pages/plaza.html';
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
        const response = await fetch(`${API_BASE}/api/multiplayer/rooms`, {
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
    const scrollId = room.scroll_id || '';
    const roomName = room.name || room.scroll_title || '未命名房间';
    
    card.innerHTML = `
        <div class="room-name">${roomName}</div>
        <div class="room-info">
            <span>当前人数：${currentPlayers}/${maxPlayers}</span>
            <button class="join-room-btn" onclick="showPasswordModal('${roomId}', '${scrollId}')">
                <i class="fas fa-door-open"></i> 加入房间
            </button>
        </div>
    `;
    
    return card;
}

// 存储当前要加入的房间信息
let currentRoomInfo = { roomId: null, scrollId: null };

// 显示密码输入对话框
window.showPasswordModal = function(roomId, scrollId) {
    currentRoomInfo.roomId = roomId;
    currentRoomInfo.scrollId = scrollId;
    
    const passwordModal = document.getElementById('passwordModal');
    const passwordInput = document.getElementById('roomPasswordInput');
    
    if (passwordModal && passwordInput) {
        passwordInput.value = '';
        passwordModal.classList.add('active');
        // 聚焦到输入框
        setTimeout(() => {
            passwordInput.focus();
        }, 100);
    }
};

// 关闭密码输入模态框
function closePasswordModal() {
    const passwordModal = document.getElementById('passwordModal');
    if (passwordModal) {
        passwordModal.classList.remove('active');
        currentRoomInfo = { roomId: null, scrollId: null };
    }
}

// 确认输入密码
function confirmPassword() {
    const passwordInput = document.getElementById('roomPasswordInput');
    if (!passwordInput) return;
    
    const password = passwordInput.value.trim();
    // 允许空密码（房间可能没有密码）
    joinRoom(currentRoomInfo.roomId, currentRoomInfo.scrollId, password);
    closePasswordModal();
}


// 加入房间（全局函数，供HTML调用）
window.joinRoom = async function(roomId, scrollId, password) {
    try {
        const response = await fetch(`${API_BASE}/api/multiplayer/join-room`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                room_id: roomId,
                password: password
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || errorData.message || '进入房间失败');
        }
        
        const data = await response.json();
        
        // 跳转到匹配页
        window.location.href = `/frontend/pages/matching.html?room_id=${roomId}&scroll_id=${scrollId}&is_host=false`;
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

document.getElementById('whoIsHumanCard')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('start-game-btn')) {
        e.stopPropagation();
        startGame('who-is-human');
    } else {
        startGame('who-is-human');
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
    } else if (gameType === 'business') {
        // 商业博弈跳转到商业博弈页面
        window.location.href = '/frontend/pages/business.html';
    } else if (gameType === 'who-is-human') {
        // 谁是人类跳转到谁是人类页面
        window.location.href = '/frontend/pages/who-is-human.html';
    } else {
        // 其他游戏暂时显示提示
        alert('未知游戏功能开发中，敬请期待！');
    }
}

// 页面加载时获取房间列表和初始化密码模态框
document.addEventListener('DOMContentLoaded', () => {
    loadRooms();
    
    // 密码输入模态框事件绑定
    const passwordModal = document.getElementById('passwordModal');
    const closePasswordModalBtn = document.getElementById('closePasswordModal');
    const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
    const confirmPasswordBtn = document.getElementById('confirmPasswordBtn');
    const passwordInput = document.getElementById('roomPasswordInput');
    
    // 关闭按钮
    if (closePasswordModalBtn) {
        closePasswordModalBtn.addEventListener('click', closePasswordModal);
    }
    
    // 取消按钮
    if (cancelPasswordBtn) {
        cancelPasswordBtn.addEventListener('click', closePasswordModal);
    }
    
    // 确认按钮
    if (confirmPasswordBtn) {
        confirmPasswordBtn.addEventListener('click', confirmPassword);
    }
    
    // 点击模态框外部关闭
    if (passwordModal) {
        passwordModal.addEventListener('click', (e) => {
            if (e.target === passwordModal) {
                closePasswordModal();
            }
        });
    }
    
    // 按Enter键确认
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmPassword();
            }
        });
    }
    
    // 按ESC键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const passwordModal = document.getElementById('passwordModal');
            if (passwordModal && passwordModal.classList.contains('active')) {
                closePasswordModal();
            }
        }
    });
});

