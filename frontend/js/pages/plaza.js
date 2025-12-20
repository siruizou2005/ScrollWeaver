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

// Logo点击返回广场页
const logo = document.querySelector('.logo.seal-logo');
if (logo) {
    logo.addEventListener('click', () => {
        window.location.href = '/frontend/pages/plaza.html';
    });
}

// 双模块卡片点击跳转
document.getElementById('creationCard')?.addEventListener('click', () => {
    window.location.href = '/frontend/pages/creation.html';
});

document.getElementById('crossworldCard')?.addEventListener('click', () => {
    const modal = document.getElementById('crossworldModal');
    if (modal) modal.classList.add('active');
});

// 弹窗内部关闭逻辑
document.getElementById('closeCrossworldModal')?.addEventListener('click', () => {
    document.getElementById('crossworldModal')?.classList.remove('active');
});

// 子模块跳转逻辑
document.getElementById('gotoLibrary')?.addEventListener('click', () => {
    window.location.href = '/frontend/pages/library.html';
});

document.getElementById('gotoExplore')?.addEventListener('click', () => {
    window.location.href = '/frontend/pages/explore.html';
});

document.getElementById('gotoGathering')?.addEventListener('click', () => {
    window.location.href = '/frontend/pages/gathering.html';
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('Plaza page loaded');
    initInkTrail();
    initFloatingParticles();
});

// 鼠标跟随水墨拖尾效果
function initInkTrail() {
    const canvas = document.getElementById('inkTrailCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    let mouseX = 0;
    let mouseY = 0;
    const particles = [];
    const maxParticles = 20;
    
    // 更新画布尺寸
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
    
    // 鼠标移动事件
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        // 添加新粒子
        if (particles.length < maxParticles) {
            particles.push({
                x: mouseX,
                y: mouseY,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                life: 1.0,
                size: Math.random() * 3 + 2
            });
        }
    });
    
    // 动画循环
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 更新和绘制粒子
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            
            // 更新位置
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            
            // 绘制粒子
            ctx.globalAlpha = p.life * 0.3;
            ctx.fillStyle = '#6b4423';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            
            // 移除死亡粒子
            if (p.life <= 0) {
                particles.splice(i, 1);
            }
        }
        
        requestAnimationFrame(animate);
    }
    
    animate();
}

// 漂浮粒子效果
function initFloatingParticles() {
    const container = document.getElementById('floatingParticles');
    if (!container) return;
    
    const particleCount = 15;
    
    // 创建粒子
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'floating-particle';
        
        // 随机类型：金色微尘或墨迹字符
        const isText = Math.random() > 0.6;
        if (isText) {
            const chars = ['书', '卷', '墨', '文', '字', '笔', '纸'];
            particle.textContent = chars[Math.floor(Math.random() * chars.length)];
            particle.classList.add('particle-text');
        } else {
            particle.classList.add('particle-dust');
        }
        
        // 随机位置和动画参数
        const size = Math.random() * 8 + 4;
        const startX = Math.random() * 100;
        const startY = Math.random() * 100;
        const endX = startX + (Math.random() - 0.5) * 30;
        const endY = startY + (Math.random() - 0.5) * 30;
        const duration = Math.random() * 20 + 15;
        const delay = Math.random() * 5;
        
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.left = startX + '%';
        particle.style.top = startY + '%';
        particle.style.setProperty('--start-x', startX + '%');
        particle.style.setProperty('--start-y', startY + '%');
        particle.style.setProperty('--end-x', endX + '%');
        particle.style.setProperty('--end-y', endY + '%');
        particle.style.animationDuration = duration + 's';
        particle.style.animationDelay = delay + 's';
        
        container.appendChild(particle);
    }
}
