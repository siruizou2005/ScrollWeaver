// 阅卷页交互逻辑
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

// 标签切换
const tabButtons = document.querySelectorAll('.tab-btn');
const bookshelfGrid = document.getElementById('bookshelfGrid');
let currentTab = 'system';

tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // 移除所有active类
        tabButtons.forEach(b => b.classList.remove('active'));
        // 添加active类到当前按钮
        btn.classList.add('active');
        
        // 加载对应标签的内容
        currentTab = btn.dataset.tab;
        loadScrolls(currentTab);
    });
});

// 加载书卷列表
async function loadScrolls(type) {
    try {
        let endpoint;
        if (type === 'shared') {
            endpoint = `${API_BASE}/api/scrolls/shared`;
        } else {
            endpoint = `${API_BASE}/api/scrolls/system`;
        }
        
        // 如果API不存在，使用通用API并过滤
        let response = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            // 回退到通用API
            response = await fetch(`${API_BASE}/api/scrolls`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const allData = await response.json();
            if (allData.success) {
                // 过滤书卷
                let filteredScrolls = [];
                if (type === 'shared') {
                    // 共享书卷：别人创建的且共享了的，排除用户自己的
                    filteredScrolls = (allData.scrolls || []).filter(scroll => 
                        (scroll.scroll_type === 'shared' || scroll.is_shared) && 
                        scroll.user_id !== user.id
                    );
                } else {
                    // 系统书卷
                    filteredScrolls = (allData.scrolls || []).filter(scroll => 
                        scroll.scroll_type === 'system'
                    );
                }
                renderScrolls(filteredScrolls, type);
            } else {
                renderScrolls([], type);
            }
            return;
        }
        
        const data = await response.json();
        if (data.success) {
            renderScrolls(data.scrolls || [], type);
        } else {
            renderScrolls([], type);
        }
    } catch (error) {
        console.error('加载书卷失败:', error);
        renderScrolls([], type);
    }
}

function renderScrolls(scrolls, type) {
    if (!bookshelfGrid) return;
    
    bookshelfGrid.innerHTML = '';
    
    if (scrolls.length === 0) {
        bookshelfGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #6b4423;">
                <p style="font-size: 1.2rem; margin-bottom: 1rem;">暂无${type === 'shared' ? '共享' : '系统'}书卷</p>
            </div>
        `;
        return;
    }
    
    scrolls.forEach(scroll => {
        const card = createScrollCard(scroll, type);
        bookshelfGrid.appendChild(card);
    });
}

function createScrollCard(scroll, type) {
    const card = document.createElement('div');
    card.className = `scroll-card ${type === 'system' ? 'system-scroll' : 'shared-scroll'}`;
    
    const authorInfo = type === 'shared' && scroll.author 
        ? `<p class="scroll-author">作者：${scroll.author}</p>` 
        : '';
    
    card.innerHTML = `
        <div class="scroll-card-content">
            <h3 class="scroll-card-title">${scroll.title || '未命名书卷'}</h3>
            <p class="scroll-card-description">${scroll.description || '暂无描述'}</p>
            ${authorInfo}
            <span class="scroll-card-type ${type === 'system' ? 'system-scroll' : 'shared-scroll'}">
                ${type === 'system' ? '系统书卷' : '共享书卷'}
            </span>
        </div>
    `;
    
    // 点击跳转到书卷详情或直接进入
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
    // 默认加载系统书卷
    loadScrolls('system');
});

