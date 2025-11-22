// 登录页面交互逻辑
const API_BASE = window.location.origin;

// 切换登录/注册表单
document.getElementById('showRegister')?.addEventListener('click', (e) => {
    e.preventDefault();
    const loginSection = document.getElementById('loginSection');
    const registerSection = document.getElementById('registerSection');
    
    loginSection.style.display = 'none';
    registerSection.style.display = 'block';
});

document.getElementById('showLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    const loginSection = document.getElementById('loginSection');
    const registerSection = document.getElementById('registerSection');
    
    registerSection.style.display = 'none';
    loginSection.style.display = 'block';
});

// 登录表单提交
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('loginError');
    errorDiv.classList.remove('show');
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // 保存token
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // 播放翻页动画
            playFlipAnimation(() => {
                // 跳转到广场页
                window.location.href = 'plaza.html';
            });
        } else {
            errorDiv.textContent = data.detail || '登录失败，请检查用户名和密码';
            errorDiv.classList.add('show');
        }
    } catch (error) {
        errorDiv.textContent = '网络错误，请稍后重试';
        errorDiv.classList.add('show');
    }
});

// 注册表单提交
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('registerError');
    errorDiv.classList.remove('show');
    
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (password !== confirmPassword) {
        errorDiv.textContent = '两次输入的密码不一致';
        errorDiv.classList.add('show');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // 保存token
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // 播放翻页动画
            playFlipAnimation(() => {
                // 跳转到广场页
                window.location.href = 'plaza.html';
            });
        } else {
            errorDiv.textContent = data.detail || '注册失败，用户名可能已存在';
            errorDiv.classList.add('show');
        }
    } catch (error) {
        errorDiv.textContent = '网络错误，请稍后重试';
        errorDiv.classList.add('show');
    }
});

// 翻页动画
function playFlipAnimation(callback) {
    const overlay = document.getElementById('pageFlipOverlay');
    overlay.classList.add('active');
    
    setTimeout(() => {
        overlay.classList.remove('active');
        if (callback) callback();
    }, 2000);
}

// 检查是否已登录
const token = localStorage.getItem('token');
if (token) {
    // 验证token
    fetch(`${API_BASE}/api/user/me`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }).then(response => {
        if (response.ok) {
            // 已登录，跳转到广场页
            window.location.href = 'plaza.html';
        }
    });
}

