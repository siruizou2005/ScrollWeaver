// 藏书页交互逻辑
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

// 退出登录（带确认对话框）
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        if (confirm('确定要退出登录吗？')) {
            fetch(`${API_BASE}/api/logout`, { 
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/frontend/pages/login.html';
            })
            .catch(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/frontend/pages/login.html';
            });
        }
    });
}

// 获取用户自己的书卷列表
async function loadUserScrolls() {
    try {
        const response = await fetch(`${API_BASE}/api/user/scrolls`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            // 如果API不存在，尝试使用通用API并过滤
            const allResponse = await fetch(`${API_BASE}/api/scrolls`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!allResponse.ok) {
                throw new Error(`HTTP error! status: ${allResponse.status}`);
            }
            
            const allData = await allResponse.json();
            if (allData.success) {
                // 过滤出用户自己的书卷
                const userScrolls = (allData.scrolls || []).filter(scroll => 
                    scroll.scroll_type === 'user' || scroll.user_id === user.id
                );
                renderScrolls(userScrolls);
            } else {
                renderScrolls([]);
            }
            return;
        }
        
        const data = await response.json();
        if (data.success) {
            renderScrolls(data.scrolls || []);
        } else {
            renderScrolls([]);
        }
    } catch (error) {
        console.error('加载书卷失败:', error);
        renderScrolls([]);
    }
}

function renderScrolls(scrolls) {
    const grid = document.getElementById('bookshelfGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (scrolls.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #6b4423;">
                <p style="font-size: 1.2rem; margin-bottom: 1rem;">暂无书卷</p>
                <p style="color: #8b4513;">前往"制卷"创建你的第一本书卷</p>
            </div>
        `;
        return;
    }
    
    scrolls.forEach(scroll => {
        const card = createScrollCard(scroll);
        grid.appendChild(card);
    });
}

function createScrollCard(scroll) {
    const card = document.createElement('div');
    card.className = 'scroll-card user-scroll';
    
    card.innerHTML = `
        <div class="scroll-card-content">
            <h3 class="scroll-card-title">${scroll.title || '未命名书卷'}</h3>
            <p class="scroll-card-description">${scroll.description || '暂无描述'}</p>
            <span class="scroll-card-type user-scroll">我的书卷</span>
        </div>
    `;
    
    // 点击跳转到详情页
    card.addEventListener('click', () => {
        // 保存当前书卷信息
        localStorage.setItem('currentScrollId', scroll.id);
        localStorage.setItem('currentScroll', JSON.stringify(scroll));
        
        // 跳转到书卷详情页或前言页
        const introUrl = `/frontend/pages/intro.html?scroll_id=${scroll.id}`;
        window.location.href = introUrl;
    });
    
    return card;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    loadUserScrolls();
});

