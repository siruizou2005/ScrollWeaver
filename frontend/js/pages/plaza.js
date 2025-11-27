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
    console.log('初始化书架...');
    // 加载书卷
    loadScrolls();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('Plaza page loaded, initializing...');
    initBookshelf();
});

// 创建书卷卡片
function createScrollCard(scroll) {
    const card = document.createElement('div');
    card.className = 'scroll-card';
    
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
    
    // 添加类型类到卡片本身，用于卷轴颜色
    card.classList.add(typeClass);
    
    card.innerHTML = `
        <div class="scroll-card-content">
            <h3 class="scroll-card-title">${scroll.title || '未命名书卷'}</h3>
            <p class="scroll-card-description">${scroll.description || '暂无描述'}</p>
            <span class="scroll-card-type ${typeClass}">${typeText}</span>
        </div>
    `;
    
    // 绑定点击事件 - 使用 addEventListener 更可靠
    card.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('点击书卷卡片:', scroll.id, scroll.title);
        enterScroll(scroll);
    });
    
    // 添加鼠标悬停样式
    card.style.cursor = 'pointer';
    
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
    console.log('enterScroll 被调用，scroll:', scroll);
    
    // 保存当前书卷ID到localStorage
    localStorage.setItem('currentScrollId', scroll.id);
    localStorage.setItem('currentScroll', JSON.stringify(scroll));
    
    // 跳转到书卷前言页（新增功能）
    const introUrl = `/frontend/pages/intro.html?scroll_id=${scroll.id}`;
    console.log('准备跳转到:', introUrl);
    window.location.href = introUrl;
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
    progressText.textContent = '正在制作书卷...';
    
    let progressInterval = null;
    try {
        // 模拟进度
        progressInterval = setInterval(() => {
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
        
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
        
        // 检查响应状态
        if (!response.ok) {
            let errorMsg = '上传失败，请稍后重试';
            try {
                const errorData = await response.json();
                errorMsg = errorData.detail || errorData.message || errorMsg;
            } catch (e) {
                errorMsg = `服务器错误: ${response.status} ${response.statusText}`;
            }
            progressFill.style.width = '100%';
            progressText.textContent = '处理失败';
            alert('生成失败：' + errorMsg);
            setTimeout(() => {
                progressDiv.style.display = 'none';
            }, 2000);
            return;
        }
        
        const data = await response.json();
        progressFill.style.width = '100%';
        progressText.textContent = '处理完成！';
        
        if (data.success) {
            setTimeout(() => {
                document.getElementById('generateModal').classList.remove('active');
                fileInput.value = '';
                titleInput.value = '';
                progressDiv.style.display = 'none';
                loadScrolls(); // 重新加载书卷列表
            }, 1000);
        } else {
            progressFill.style.width = '100%';
            progressText.textContent = '处理失败';
            alert('生成失败：' + (data.detail || '未知错误'));
            setTimeout(() => {
                progressDiv.style.display = 'none';
            }, 2000);
        }
    } catch (error) {
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
        console.error('上传失败:', error);
        progressFill.style.width = '100%';
        progressText.textContent = '处理失败';
        alert('上传失败：' + (error.message || '请稍后重试'));
        setTimeout(() => {
            progressDiv.style.display = 'none';
        }, 2000);
    } finally {
        // 确保清理定时器
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
    }
});

// 制作书卷表单相关代码（保持原有逻辑）
let currentStep = 1;
const totalSteps = 5;
let scrollData = {
    title: '',
    description: '',
    worldview: '',
    worldName: '',
    locations: [],
    characters: []
};

function resetCreateForm() {
    currentStep = 1;
    scrollData = {
        title: '',
        description: '',
        worldview: '',
        worldName: '',
        locations: [],
        characters: []
    };
    // 清空表单字段
    document.getElementById('createScrollTitle')?.value && (document.getElementById('createScrollTitle').value = '');
    document.getElementById('createDescription')?.value && (document.getElementById('createDescription').value = '');
    document.getElementById('worldName')?.value && (document.getElementById('worldName').value = '');
    document.getElementById('worldDescription')?.value && (document.getElementById('worldDescription').value = '');
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

function nextStep(targetStep) {
    // 在切换步骤前，先保存当前步骤的数据
    saveCurrentStepData();
    
    // 如果提供了目标步骤，直接跳转；否则前进到下一步
    if (targetStep !== undefined) {
        if (targetStep > currentStep && targetStep <= totalSteps) {
            currentStep = targetStep;
        } else if (targetStep <= currentStep) {
            currentStep = targetStep;
        }
    } else {
        if (currentStep < totalSteps) {
            currentStep++;
        }
    }
    
    showStep(currentStep);
    
    // 如果进入步骤5（预览），生成预览内容
    if (currentStep === 5) {
        generatePreview();
    }
}

// 保存当前步骤的数据
function saveCurrentStepData() {
    // 步骤1：基本信息
    const titleInput = document.getElementById('createScrollTitle');
    if (titleInput) {
        scrollData.title = titleInput.value;
    }
    const descInput = document.getElementById('createDescription');
    if (descInput) {
        scrollData.description = descInput.value;
    }
    
    // 步骤2：世界观
    const worldDescInput = document.getElementById('worldDescription');
    if (worldDescInput) {
        scrollData.worldview = worldDescInput.value.trim();
        console.log('保存世界观描述:', scrollData.worldview);
    }
    const worldNameInput = document.getElementById('worldName');
    if (worldNameInput) {
        scrollData.worldName = worldNameInput.value.trim();
    }
    
    // 步骤3：地点
    updateLocationsData();
    
    // 步骤4：角色
    updateCharactersData();
}

function prevStep(targetStep) {
    // 如果提供了目标步骤，直接跳转；否则后退到上一步
    if (targetStep !== undefined) {
        if (targetStep >= 1 && targetStep < currentStep) {
            currentStep = targetStep;
        }
    } else {
        if (currentStep > 1) {
            currentStep--;
        }
    }
    showStep(currentStep);
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
document.getElementById('worldDescription')?.addEventListener('input', (e) => {
    scrollData.worldview = e.target.value;
});

// 世界名称（可选）
document.getElementById('worldName')?.addEventListener('input', (e) => {
    scrollData.worldName = e.target.value;
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
        if (name && name.trim()) {
            // 生成角色代码（基于角色名称）
            const code = name.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s-]+/g, '_');
            // 确保code不为空
            if (code) {
                scrollData.characters.push({
                    name: name.trim(),
                    code: code,
                    nickname: (nickname || '').trim(),
                    profile: (profile || '').trim()
                });
            } else {
                console.warn('角色代码生成失败，角色名称:', name);
            }
        }
    });
}

document.getElementById('addCharacterBtn')?.addEventListener('click', addCharacter);

// 生成预览内容
function generatePreview() {
    const previewContent = document.getElementById('previewContent');
    if (!previewContent) return;
    
    // 先保存所有步骤的数据
    saveCurrentStepData();
    
    // 调试日志
    console.log('生成预览 - scrollData:', {
        title: scrollData.title,
        description: scrollData.description,
        worldview: scrollData.worldview,
        worldName: scrollData.worldName,
        locationsCount: scrollData.locations.length,
        charactersCount: scrollData.characters.length
    });
    
    let html = '<div class="preview-section">';
    html += `<h4>基本信息</h4>`;
    html += `<p><strong>书卷名称：</strong>${scrollData.title || '未填写'}</p>`;
    html += `<p><strong>描述：</strong>${scrollData.description || '无'}</p>`;
    html += `</div>`;
    
    html += '<div class="preview-section">';
    html += `<h4>世界观</h4>`;
    if (scrollData.worldName) {
        html += `<p><strong>世界名称：</strong>${scrollData.worldName}</p>`;
    }
    html += `<p>${scrollData.worldview || '未填写'}</p>`;
    html += `</div>`;
    
    html += '<div class="preview-section">';
    html += `<h4>地点 (${scrollData.locations.length}个)</h4>`;
    if (scrollData.locations.length === 0) {
        html += `<p style="color: #999;">暂无地点</p>`;
    } else {
        html += '<ul>';
        scrollData.locations.forEach(loc => {
            html += `<li><strong>${loc.name}</strong>: ${loc.description || '无描述'}</li>`;
        });
        html += '</ul>';
    }
    html += `</div>`;
    
    html += '<div class="preview-section">';
    html += `<h4>角色 (${scrollData.characters.length}个)</h4>`;
    if (scrollData.characters.length === 0) {
        html += `<p style="color: #999;">暂无角色</p>`;
    } else {
        html += '<ul>';
        scrollData.characters.forEach(char => {
            html += `<li><strong>${char.name}</strong>${char.nickname ? ` (${char.nickname})` : ''}: ${char.profile || '无设定'}</li>`;
        });
        html += '</ul>';
    }
    html += `</div>`;
    
    previewContent.innerHTML = html;
}

// 提交创建书卷函数（供HTML按钮调用）
function submitCreateScroll() {
    // 先保存所有步骤的数据
    saveCurrentStepData();
    
    // 调试日志
    console.log('提交创建书卷 - scrollData:', {
        title: scrollData.title,
        description: scrollData.description,
        worldview: scrollData.worldview,
        worldName: scrollData.worldName,
        locationsCount: scrollData.locations.length,
        charactersCount: scrollData.characters.length
    });
    
    // 验证必填字段
    if (!scrollData.title || scrollData.title.trim() === '') {
        alert('请输入书卷名称');
        showStep(1);
        return;
    }
    
    if (!scrollData.worldview || scrollData.worldview.trim() === '') {
        alert('请输入世界观描述');
        showStep(2);
        return;
    }
    
    if (!scrollData.locations || scrollData.locations.length === 0) {
        alert('至少需要添加一个地点');
        showStep(3);
        return;
    }
    
    if (!scrollData.characters || scrollData.characters.length === 0) {
        alert('至少需要添加一个角色');
        showStep(4);
        return;
    }
    
    // 确保从输入框读取最新值
    const worldDescInput = document.getElementById('worldDescription');
    if (worldDescInput) {
        scrollData.worldview = worldDescInput.value;
    }
    const worldNameInput = document.getElementById('worldName');
    if (worldNameInput) {
        scrollData.worldName = worldNameInput.value;
    }
    
    // 准备发送给后端的数据
    // 确保角色代码不为空
    const characters = scrollData.characters.map(char => {
        if (!char.code || char.code.trim() === '') {
            // 如果code为空，重新生成
            const code = char.name.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s-]+/g, '_');
            console.warn('角色代码为空，重新生成:', char.name, '->', code);
            return {
                name: char.name.trim(),
                code: code,
                nickname: (char.nickname || char.name).trim(),
                profile: (char.profile || '').trim()
            };
        }
        return {
            name: char.name.trim(),
            code: char.code.trim(),
            nickname: (char.nickname || char.name).trim(),
            profile: (char.profile || '').trim()
        };
    }).filter(char => char.code && char.code.trim() !== ''); // 过滤掉code为空的角色
    
    if (characters.length === 0) {
        alert('至少需要添加一个有效的角色（角色名称不能为空）');
        showStep(4);
        return;
    }
    
    const requestData = {
        title: scrollData.title,
        description: scrollData.description || '',
        worldName: scrollData.worldName || scrollData.title, // 使用世界名称，如果没有则使用书卷名称
        worldDescription: scrollData.worldview,
        language: document.getElementById('createLanguage')?.value || 'zh',
        locations: scrollData.locations.map(loc => ({
            name: loc.name.trim(),
            description: (loc.description || '').trim(),
            detail: (loc.detail || '').trim()
        })).filter(loc => loc.name && loc.name.trim() !== ''), // 过滤掉名称为空的地点
        characters: characters
    };
    
    console.log('提交的书卷数据:', requestData);
    
    const progressDiv = document.getElementById('createProgress');
    const progressFill = document.getElementById('createProgressFill');
    const progressText = document.getElementById('createProgressText');
    
    progressDiv.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '正在创建书卷...';
    
    // 模拟进度
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 10;
        if (progress <= 90) {
            progressFill.style.width = progress + '%';
        }
    }, 200);
    
    fetch(`${API_BASE}/api/create-scroll`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestData)
    })
    .then(async response => {
        clearInterval(progressInterval);
        progressFill.style.width = '100%';
        
        if (!response.ok) {
            let errorMsg = '创建失败，请稍后重试';
            try {
                const errorData = await response.json();
                errorMsg = errorData.detail || errorData.message || errorMsg;
            } catch (e) {
                errorMsg = `服务器错误: ${response.status} ${response.statusText}`;
            }
            throw new Error(errorMsg);
        }
        
        return response.json();
    })
    .then(data => {
        progressText.textContent = '创建完成！';
        
        if (data.success) {
            setTimeout(() => {
                alert('创建成功！');
                document.getElementById('createModal').classList.remove('active');
                resetCreateForm();
                loadScrolls();
                progressDiv.style.display = 'none';
            }, 500);
        } else {
            throw new Error(data.detail || '未知错误');
        }
    })
    .catch(error => {
        clearInterval(progressInterval);
        console.error('创建失败:', error);
        progressFill.style.width = '100%';
        progressText.textContent = '创建失败';
        alert('创建失败：' + (error.message || '请稍后重试'));
        setTimeout(() => {
            progressDiv.style.display = 'none';
        }, 2000);
    });
}

// 步骤按钮
document.getElementById('nextStepBtn')?.addEventListener('click', () => {
    // 先保存当前步骤的数据
    saveCurrentStepData();
    
    // 验证当前步骤
    if (currentStep === 1) {
        if (!scrollData.title || scrollData.title.trim() === '') {
            alert('请输入书卷名称');
            return;
        }
    } else if (currentStep === 2) {
        if (!scrollData.worldview || scrollData.worldview.trim() === '') {
            alert('请输入世界观描述');
            return;
        }
    } else if (currentStep === 3) {
        if (!scrollData.locations || scrollData.locations.length === 0) {
            alert('至少需要添加一个地点');
            return;
        }
    } else if (currentStep === 4) {
        if (!scrollData.characters || scrollData.characters.length === 0) {
            alert('至少需要添加一个角色');
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
