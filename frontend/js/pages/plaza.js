// 广场页交互逻辑
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
                // 执行退出逻辑
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
                    // 即使API失败也清除本地存储并跳转
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = '/frontend/pages/home.html';
                });
            }
        });
    });
}

// 四象阵卡片点击跳转
document.getElementById('creationCard')?.addEventListener('click', () => {
    window.location.href = '/frontend/pages/creation.html';
});

document.getElementById('gatheringCard')?.addEventListener('click', () => {
    window.location.href = '/frontend/pages/gathering.html';
});

document.getElementById('libraryCard')?.addEventListener('click', () => {
    window.location.href = '/frontend/pages/library.html';
});

document.getElementById('exploreCard')?.addEventListener('click', () => {
    window.location.href = '/frontend/pages/explore.html';
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('Plaza page loaded');
});
