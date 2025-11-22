// 广场页交互逻辑
const API_BASE = window.location.origin;
let scrolls = [];

// 检查登录状态
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/frontend/pages/login.html';
    throw new Error('未登录');
}

const user = JSON.parse(localStorage.getItem('user') || '{}');
document.getElementById('username').textContent = user.username || '用户';

// 退出登录
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/frontend/pages/login.html';
});

// 初始化书架
function initBookshelf() {
    // 加载书卷
    loadScrolls();
}

// 创建书卷卡片
function createScrollCard(scroll) {
    const card = document.createElement('div');
    card.className = 'scroll-card';
    card.onclick = () => enterScroll(scroll);
    
    // 根据书卷类型设置样式
    let typeClass = '';
    let typeText = '';
    if (scroll.scroll_type === 'system') {
        typeClass = 'system-scroll';
        typeText = '系统预设';
    } else if (scroll.scroll_type === 'user') {
        typeClass = 'user-scroll';
        typeText = '我的书卷';
    } else if (scroll.scroll_type === 'shared') {
        typeClass = 'shared-scroll';
        typeText = '分享的书卷';
    }
    
    card.innerHTML = `
        <div class="scroll-card-spine ${typeClass}"></div>
        <div class="scroll-card-content">
            <h3 class="scroll-card-title">${scroll.title || '未命名书卷'}</h3>
            <p class="scroll-card-description">${scroll.description || '暂无描述'}</p>
            <span class="scroll-card-type ${typeClass}">${typeText}</span>
        </div>
    `;
    
    return card;
}

// 加载书卷列表
async function loadScrolls() {
    try {
        const response = await fetch(`${API_BASE}/api/scrolls`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API返回数据:', data);
        
        if (data.success) {
            scrolls = data.scrolls || [];
            console.log('加载的书卷数量:', scrolls.length, scrolls);
            if (scrolls.length === 0) {
                console.warn('没有找到任何书卷');
            }
            renderBooks();
        } else {
            console.error('加载书卷失败:', data.detail || '未知错误');
            scrolls = [];
            renderBooks();
        }
    } catch (error) {
        console.error('加载书卷出错:', error);
        scrolls = [];
        renderBooks();
    }
}

// 渲染书卷
function renderBooks() {
    const container = document.getElementById('bookshelfGrid');
    if (!container) {
        console.warn('书架容器未找到');
        return;
    }
    
    // 清空现有书卷
    container.innerHTML = '';
    
    if (scrolls.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #6b4423;">
                <p style="font-size: 1.2rem; margin-bottom: 1rem;">暂无书卷</p>
                <p style="color: #8b4513;">点击上方按钮创建或生成书卷</p>
            </div>
        `;
        return;
    }
    
    console.log('开始渲染', scrolls.length, '本书卷');
    
    // 创建每本书卷卡片
    scrolls.forEach((scroll) => {
        try {
            const card = createScrollCard(scroll);
            container.appendChild(card);
        } catch (error) {
            console.error('创建书卷卡片时出错:', error, scroll);
        }
    });
}

// 进入书卷
function enterScroll(scroll) {
    // 保存当前书卷ID到localStorage
    localStorage.setItem('currentScrollId', scroll.id);
    localStorage.setItem('currentScroll', JSON.stringify(scroll));
    
    // 跳转到游戏页面
    window.location.href = '/game?scroll_id=' + scroll.id;
}

// 模态框控制
document.getElementById('generateScrollBtn')?.addEventListener('click', () => {
    document.getElementById('generateModal').classList.add('active');
});

document.getElementById('createScrollBtn')?.addEventListener('click', () => {
    resetCreateForm();
    document.getElementById('createModal').classList.add('active');
});

document.getElementById('closeGenerateModal')?.addEventListener('click', () => {
    document.getElementById('generateModal').classList.remove('active');
});

document.getElementById('closeCreateModal')?.addEventListener('click', () => {
    document.getElementById('createModal').classList.remove('active');
});

// 点击模态框外部关闭
window.addEventListener('click', (event) => {
    const generateModal = document.getElementById('generateModal');
    const createModal = document.getElementById('createModal');
    
    if (event.target === generateModal) {
        generateModal.classList.remove('active');
    }
    if (event.target === createModal) {
        createModal.classList.remove('active');
    }
});

// 生成书卷表单提交
document.getElementById('generateForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fileInput = document.getElementById('documentFile');
    const titleInput = document.getElementById('scrollTitle');
    const progressDiv = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    if (!fileInput.files[0]) {
        alert('请选择文件');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('title', titleInput.value);
    
    progressDiv.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '正在上传文档...';
    
    try {
        // 模拟上传进度
        const progressInterval = setInterval(() => {
            const currentWidth = parseInt(progressFill.style.width) || 0;
            if (currentWidth < 90) {
                progressFill.style.width = (currentWidth + 10) + '%';
            }
        }, 200);
        
        const response = await fetch(`${API_BASE}/api/upload-document`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        clearInterval(progressInterval);
        progressFill.style.width = '100%';
        progressText.textContent = '处理完成！';
        
        const data = await response.json();
        if (data.success) {
            setTimeout(() => {
                document.getElementById('generateModal').classList.remove('active');
                fileInput.value = '';
                titleInput.value = '';
                progressDiv.style.display = 'none';
                loadScrolls(); // 重新加载书卷列表
            }, 1000);
        } else {
            alert('生成失败：' + (data.detail || '未知错误'));
        }
    } catch (error) {
        console.error('上传失败:', error);
        alert('上传失败，请稍后重试');
    }
});

// 制作书卷表单相关代码（保持原有逻辑）
let currentStep = 1;
const totalSteps = 5;
let scrollData = {
    title: '',
    description: '',
    worldview: '',
    locations: [],
    characters: []
};

function resetCreateForm() {
    currentStep = 1;
    scrollData = {
        title: '',
        description: '',
        worldview: '',
        locations: [],
        characters: []
    };
    updateStepIndicator();
    showStep(1);
}

function updateStepIndicator() {
    document.querySelectorAll('.step').forEach((step, index) => {
        const stepNum = index + 1;
        step.classList.remove('active', 'completed');
        if (stepNum < currentStep) {
            step.classList.add('completed');
        } else if (stepNum === currentStep) {
            step.classList.add('active');
        }
    });
}

function showStep(stepNum) {
    document.querySelectorAll('.create-step').forEach(step => {
        step.classList.remove('active');
    });
    const stepElement = document.querySelector(`.create-step[data-step="${stepNum}"]`);
    if (stepElement) {
        stepElement.classList.add('active');
    }
    updateStepIndicator();
}

function nextStep() {
    if (currentStep < totalSteps) {
        currentStep++;
        showStep(currentStep);
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        showStep(currentStep);
    }
}

// 步骤导航
document.querySelectorAll('.step').forEach(step => {
    step.addEventListener('click', () => {
        const stepNum = parseInt(step.dataset.step);
        if (stepNum <= currentStep || step.classList.contains('completed')) {
            currentStep = stepNum;
            showStep(currentStep);
        }
    });
});

// 步骤1：基本信息
document.getElementById('createScrollTitle')?.addEventListener('input', (e) => {
    scrollData.title = e.target.value;
});

document.getElementById('createScrollDescription')?.addEventListener('input', (e) => {
    scrollData.description = e.target.value;
});

// 步骤2：世界观
document.getElementById('worldviewText')?.addEventListener('input', (e) => {
    scrollData.worldview = e.target.value;
});

// 步骤3：地点管理
let locationCount = 0;

function addLocation() {
    locationCount++;
    const locationsContainer = document.getElementById('locationsContainer');
    const locationDiv = document.createElement('div');
    locationDiv.className = 'location-item';
    locationDiv.innerHTML = `
        <div class="form-group">
            <label>地点名称 *</label>
            <input type="text" class="location-name" placeholder="例如：王宫" required>
        </div>
        <div class="form-group">
            <label>地点描述</label>
            <textarea class="location-description" rows="2" placeholder="描述这个地点的特点"></textarea>
        </div>
        <div class="form-group">
            <label>详细信息</label>
            <textarea class="location-detail" rows="3" placeholder="更详细的描述"></textarea>
        </div>
        <button type="button" class="remove-btn" onclick="removeLocation(this)">删除</button>
    `;
    locationsContainer.appendChild(locationDiv);
    updateLocationsData();
}

function removeLocation(btn) {
    btn.parentElement.remove();
    updateLocationsData();
}

function updateLocationsData() {
    scrollData.locations = [];
    document.querySelectorAll('.location-item').forEach(item => {
        const name = item.querySelector('.location-name')?.value;
        const description = item.querySelector('.location-description')?.value;
        const detail = item.querySelector('.location-detail')?.value;
        if (name) {
            scrollData.locations.push({
                name: name,
                description: description || '',
                detail: detail || ''
            });
        }
    });
}

document.getElementById('addLocationBtn')?.addEventListener('click', addLocation);

// 步骤4：角色管理
let characterCount = 0;

function addCharacter() {
    characterCount++;
    const charactersContainer = document.getElementById('charactersContainer');
    const characterDiv = document.createElement('div');
    characterDiv.className = 'character-item';
    characterDiv.innerHTML = `
        <div class="form-group">
            <label>角色名称 *</label>
            <input type="text" class="character-name" placeholder="例如：张三" required>
        </div>
        <div class="form-group">
            <label>角色昵称</label>
            <input type="text" class="character-nickname" placeholder="例如：三哥">
        </div>
        <div class="form-group">
            <label>角色设定</label>
            <textarea class="character-profile" rows="4" placeholder="描述角色的性格、背景、目标等"></textarea>
        </div>
        <button type="button" class="remove-btn" onclick="removeCharacter(this)">删除</button>
    `;
    charactersContainer.appendChild(characterDiv);
    updateCharactersData();
}

function removeCharacter(btn) {
    btn.parentElement.remove();
    updateCharactersData();
}

function updateCharactersData() {
    scrollData.characters = [];
    document.querySelectorAll('.character-item').forEach(item => {
        const name = item.querySelector('.character-name')?.value;
        const nickname = item.querySelector('.character-nickname')?.value;
        const profile = item.querySelector('.character-profile')?.value;
        if (name) {
            scrollData.characters.push({
                name: name,
                nickname: nickname || '',
                profile: profile || ''
            });
        }
    });
}

document.getElementById('addCharacterBtn')?.addEventListener('click', addCharacter);

// 步骤按钮
document.getElementById('nextStepBtn')?.addEventListener('click', () => {
    // 验证当前步骤
    if (currentStep === 1) {
        if (!scrollData.title) {
            alert('请输入书卷名称');
            return;
        }
    } else if (currentStep === 2) {
        if (!scrollData.worldview) {
            alert('请输入世界观描述');
            return;
        }
    }
    nextStep();
});

document.getElementById('prevStepBtn')?.addEventListener('click', prevStep);

// 提交创建书卷
document.getElementById('createScrollForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!scrollData.title) {
        alert('请输入书卷名称');
        return;
    }
    
    if (!scrollData.worldview) {
        alert('请输入世界观描述');
        return;
    }
    
    const progressDiv = document.getElementById('createProgress');
    progressDiv.style.display = 'block';
    
    try {
        const response = await fetch(`${API_BASE}/api/create-scroll`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(scrollData)
        });
        
        const data = await response.json();
        progressDiv.style.display = 'none';
        
        if (data.success) {
            alert('创建成功！');
            document.getElementById('createModal').classList.remove('active');
            resetCreateForm();
            loadScrolls();
        } else {
            alert('创建失败：' + (data.detail || '未知错误'));
        }
    } catch (error) {
        console.error('创建失败:', error);
        alert('创建失败，请稍后重试');
        progressDiv.style.display = 'none';
    }
});

// 监听地点和角色输入变化
document.addEventListener('input', function(e) {
    if (e.target.classList.contains('location-name') || 
        e.target.classList.contains('location-description') || 
        e.target.classList.contains('location-detail')) {
        updateLocationsData();
    }
    if (e.target.classList.contains('character-name') || 
        e.target.classList.contains('character-profile') || 
        e.target.classList.contains('character-nickname')) {
        updateCharactersData();
    }
});

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initBookshelf();
});
