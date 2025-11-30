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
                    // 共享书卷：所有共享了的书卷（包括用户自己的）
                    filteredScrolls = (allData.scrolls || []).filter(scroll => 
                        (scroll.scroll_type === 'shared' || scroll.is_public || scroll.is_shared)
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
    
    // 检查是否是用户自己的书卷
    const isOwnScroll = scroll.user_id && user.id && scroll.user_id === parseInt(user.id);
    
    // 显示共享人信息（共享书卷时显示，如果是自己的则显示"我"）
    let authorInfo = '';
    if (type === 'shared' && scroll.author) {
        const authorText = isOwnScroll ? '我' : scroll.author;
        authorInfo = `<p class="scroll-author"><i class="fas fa-user"></i> 共享人：${authorText}</p>`;
    }
    
    // 如果是用户自己的共享书卷，添加取消共享按钮
    const unshareButton = (type === 'shared' && isOwnScroll) 
        ? `<button class="unshare-btn" data-scroll-id="${scroll.id}" title="取消共享">
            <i class="fas fa-share-alt"></i> 取消共享
           </button>`
        : '';
    
    card.innerHTML = `
        <div class="scroll-card-content">
            <h3 class="scroll-card-title">${scroll.title || '未命名书卷'}</h3>
            <p class="scroll-card-description">${scroll.description || '暂无描述'}</p>
            ${authorInfo}
            <div class="scroll-card-footer">
                <span class="scroll-card-type ${type === 'system' ? 'system-scroll' : 'shared-scroll'}">
                    ${type === 'system' ? '系统书卷' : '共享书卷'}
                </span>
                ${unshareButton}
            </div>
        </div>
    `;
    
    // 点击卡片主体跳转到书卷详情或直接进入
    const cardContent = card.querySelector('.scroll-card-content');
    cardContent.addEventListener('click', (e) => {
        // 如果点击的是取消共享按钮，不跳转
        if (e.target.closest('.unshare-btn')) {
            return;
        }
        // 保存当前书卷信息
        localStorage.setItem('currentScrollId', scroll.id);
        localStorage.setItem('currentScroll', JSON.stringify(scroll));
        
        // 跳转到书卷详情页或前言页
        const introUrl = `/frontend/pages/intro.html?scroll_id=${scroll.id}`;
        window.location.href = introUrl;
    });
    
    // 绑定取消共享按钮事件
    if (isOwnScroll && type === 'shared') {
        const unshareBtn = card.querySelector('.unshare-btn');
        if (unshareBtn) {
            unshareBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // 阻止事件冒泡，避免触发卡片点击
                await handleUnshareScroll(scroll.id, card);
            });
        }
    }
    
    return card;
}

/**
 * 处理取消共享
 */
async function handleUnshareScroll(scrollId, cardElement) {
    try {
        // 显示确认对话框
        const message = '确定要取消共享此书卷吗？取消后其他用户将无法在"阅卷共享书卷"中看到此书卷。';
        
        // 修改确认对话框标题为"取消共享"
        const confirmModal = document.getElementById('confirmModal');
        const modalHeader = confirmModal?.querySelector('.modal-header h2');
        const originalTitle = modalHeader ? modalHeader.innerHTML : null;
        
        if (modalHeader) {
            modalHeader.innerHTML = '<i class="fas fa-share-alt"></i> 取消共享';
        }
        
        // 确保 showConfirm 函数可用，如果不可用则使用系统确认对话框
        let confirmed = false;
        if (typeof showConfirm === 'function') {
            confirmed = await showConfirm(message);
        } else {
            // 回退到系统确认对话框
            confirmed = window.confirm(message);
        }
        
        // 恢复原始标题
        if (modalHeader && originalTitle) {
            modalHeader.innerHTML = originalTitle;
        }
        
        if (!confirmed) {
            return;
        }
        
        // 执行取消共享操作
        const response = await fetch(`/api/scroll/${scrollId}/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                is_public: false
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: '操作失败' }));
            throw new Error(errorData.detail || '取消共享失败');
        }
        
        const result = await response.json();
        
        // 显示成功消息（使用页面内提示）
        if (typeof showSuccess === 'function') {
            showSuccess(result.message || '已取消共享');
        } else {
            // 回退到 alert
            alert(result.message || '已取消共享');
        }
        
        // 重新加载共享书卷列表
        await loadScrolls('shared');
        
    } catch (error) {
        console.error('取消共享失败:', error);
        // 显示错误消息（使用页面内提示）
        if (typeof showError === 'function') {
            showError('取消共享失败：' + (error.message || '未知错误'));
        } else {
            // 回退到 alert
            alert('取消共享失败：' + (error.message || '未知错误'));
        }
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 默认加载系统书卷
    loadScrolls('system');
});

