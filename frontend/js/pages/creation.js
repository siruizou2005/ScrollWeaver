// 制卷选择页交互逻辑
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

// 模态框控制
const generateModal = document.getElementById('generateModal');
const createModal = document.getElementById('createModal');
const closeGenerateModal = document.getElementById('closeGenerateModal');
const closeCreateModal = document.getElementById('closeCreateModal');

// 打开生成书卷模态框
function openGenerateModal() {
    if (generateModal) {
        generateModal.classList.add('active');
    }
}

// 关闭生成书卷模态框
function closeGenerateModalFunc() {
    if (generateModal) {
        generateModal.classList.remove('active');
        document.getElementById('generateForm').reset();
        document.getElementById('uploadProgress').style.display = 'none';
    }
}

// 打开制作书卷模态框
function openCreateModal() {
    if (createModal) {
        createModal.classList.add('active');
        currentStep = 1;
        updateStepIndicator();
        showStep(1);
    }
}

// 关闭制作书卷模态框
function closeCreateModalFunc() {
    if (createModal) {
        createModal.classList.remove('active');
        document.getElementById('generateForm').reset();
        resetCreateForm();
    }
}

// 点击外部关闭模态框
if (generateModal) {
    generateModal.addEventListener('click', (e) => {
        if (e.target === generateModal) {
            closeGenerateModalFunc();
        }
    });
}

if (createModal) {
    createModal.addEventListener('click', (e) => {
        if (e.target === createModal) {
            closeCreateModalFunc();
        }
    });
}

if (closeGenerateModal) {
    closeGenerateModal.addEventListener('click', closeGenerateModalFunc);
}

if (closeCreateModal) {
    closeCreateModal.addEventListener('click', closeCreateModalFunc);
}

// ESC键关闭模态框
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (generateModal && generateModal.classList.contains('active')) {
            closeGenerateModalFunc();
        }
        if (createModal && createModal.classList.contains('active')) {
            closeCreateModalFunc();
        }
    }
});

// 点石成金（RAG）- 打开上传文档功能
document.getElementById('ragCard')?.addEventListener('click', () => {
    openGenerateModal();
});

// 凭空造物（Prompt）- 占位卡片
document.getElementById('promptCard')?.addEventListener('click', (e) => {
    e.preventDefault();
    alert('功能即将推出，敬请期待！');
});

// 手动编织（Editor）- 打开制作书卷功能
document.getElementById('editorCard')?.addEventListener('click', () => {
    openCreateModal();
});

// 生成书卷表单提交
const generateForm = document.getElementById('generateForm');
if (generateForm) {
    generateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fileInput = document.getElementById('documentFile');
        const titleInput = document.getElementById('scrollTitle');
        const progressDiv = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        if (!fileInput.files[0]) {
            alert('请选择要上传的文档');
            return;
        }
        
        if (!titleInput.value.trim()) {
            alert('请输入书卷名称');
            return;
        }
        
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('title', titleInput.value.trim());
        
        // 显示进度条
        progressDiv.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = '正在上传文档...';
        
        // 模拟上传进度
        let currentProgress = 0;
        let uploadInterval = null;
        let progressPromise = new Promise((resolve) => {
            // 模拟上传进度，逐渐增加到80%
            uploadInterval = setInterval(() => {
                currentProgress += Math.random() * 10 + 5; // 每次增加5-15%
                if (currentProgress >= 80) {
                    currentProgress = 80;
                    clearInterval(uploadInterval);
                    progressFill.style.width = '80%';
                    progressText.textContent = '正在制作书卷...';
                    resolve(); // 到达80%后resolve
                } else {
                    progressFill.style.width = currentProgress + '%';
                }
            }, 150); // 每150ms更新一次
        });
        
        try {
            // 同时进行上传和进度条动画
            const [response] = await Promise.all([
                fetch(`${API_BASE}/api/upload-document`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                }),
                progressPromise // 等待进度条到达80%
            ]);
            
            // 确保清除进度条动画（防止重复）
            if (uploadInterval) {
                clearInterval(uploadInterval);
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || '上传失败');
            }
            
            // 进度条到100%
            progressFill.style.width = '100%';
            progressText.textContent = '书卷创建成功！';
            
            const result = await response.json();
            
            if (result.success) {
                setTimeout(() => {
                    closeGenerateModalFunc();
                    // 跳转到书卷详情页或刷新页面
                    if (result.scroll_id) {
                        window.location.href = `/frontend/pages/intro.html?scroll_id=${result.scroll_id}`;
                    } else {
                        window.location.href = '/frontend/pages/library.html';
                    }
                }, 1000);
            } else {
                throw new Error(result.message || '创建失败');
            }
        } catch (error) {
            // 清除进度条动画
            if (uploadInterval) {
                clearInterval(uploadInterval);
            }
            console.error('上传文档失败:', error);
            progressText.textContent = `错误: ${error.message}`;
            alert(`上传失败: ${error.message}`);
        }
    });
}

// 制作书卷相关变量
let currentStep = 1;
let locations = [];
let characters = [];

// 重置制作书卷表单
function resetCreateForm() {
    currentStep = 1;
    locations = [];
    characters = [];
    document.getElementById('createScrollTitle').value = '';
    document.getElementById('createLanguage').value = 'zh';
    document.getElementById('createDescription').value = '';
    document.getElementById('worldName').value = '';
    document.getElementById('worldDescription').value = '';
    document.getElementById('locationsContainer').innerHTML = '';
    document.getElementById('charactersContainer').innerHTML = '';
    document.getElementById('previewContent').innerHTML = '';
    updateStepIndicator();
    showStep(1);
}

// 更新步骤指示器
function updateStepIndicator() {
    const steps = document.querySelectorAll('.step');
    steps.forEach((step, index) => {
        const stepNum = index + 1;
        step.classList.remove('active', 'completed');
        if (stepNum === currentStep) {
            step.classList.add('active');
        } else if (stepNum < currentStep) {
            step.classList.add('completed');
        }
    });
}

// 显示指定步骤
function showStep(stepNum) {
    const steps = document.querySelectorAll('.create-step');
    steps.forEach((step) => {
        if (parseInt(step.dataset.step) === stepNum) {
            step.classList.add('active');
        } else {
            step.classList.remove('active');
        }
    });
    currentStep = stepNum;
    updateStepIndicator();
}

// 下一步
window.nextStep = function(stepNum) {
    // 验证当前步骤
    if (currentStep === 1) {
        const title = document.getElementById('createScrollTitle').value.trim();
        if (!title) {
            alert('请输入书卷名称');
            return;
        }
    } else if (currentStep === 2) {
        const worldName = document.getElementById('worldName').value.trim();
        const worldDescription = document.getElementById('worldDescription').value.trim();
        if (!worldName || !worldDescription) {
            alert('请填写完整的世界观信息');
            return;
        }
    } else if (currentStep === 3) {
        if (locations.length === 0) {
            alert('请至少添加一个地点');
            return;
        }
    } else if (currentStep === 4) {
        if (characters.length === 0) {
            alert('请至少添加一个角色');
            return;
        }
    } else if (currentStep === 5) {
        // 预览步骤，生成预览内容
        generatePreview();
    }
    
    showStep(stepNum);
};

// 上一步
window.prevStep = function(stepNum) {
    showStep(stepNum);
};

// 添加地点
window.addLocation = function() {
    const locationId = Date.now();
    const locationItem = {
        id: locationId,
        name: '',
        description: ''
    };
    locations.push(locationItem);
    renderLocations();
};

// 删除地点
function removeLocation(id) {
    locations = locations.filter(loc => loc.id !== id);
    renderLocations();
}

// 渲染地点列表
function renderLocations() {
    const container = document.getElementById('locationsContainer');
    container.innerHTML = '';
    
    locations.forEach((loc, index) => {
        const item = document.createElement('div');
        item.className = 'location-item';
        item.innerHTML = `
            <div class="location-item-header">
                <span class="location-item-title">地点 ${index + 1}</span>
                <button type="button" class="btn-remove" onclick="removeLocation(${loc.id})">删除</button>
            </div>
            <div class="form-group" style="padding: 0; margin-bottom: 1rem;">
                <label>地点名称 *</label>
                <input type="text" class="location-name" data-id="${loc.id}" placeholder="例如：长安城" value="${loc.name}" required>
            </div>
            <div class="form-group" style="padding: 0;">
                <label>地点描述 *</label>
                <textarea class="location-description" data-id="${loc.id}" rows="3" placeholder="描述这个地点的特点..." required>${loc.description}</textarea>
            </div>
        `;
        container.appendChild(item);
    });
    
    // 绑定输入事件
    container.querySelectorAll('.location-name').forEach(input => {
        input.addEventListener('input', (e) => {
            const id = parseInt(e.target.dataset.id);
            const loc = locations.find(l => l.id === id);
            if (loc) loc.name = e.target.value;
        });
    });
    
    container.querySelectorAll('.location-description').forEach(textarea => {
        textarea.addEventListener('input', (e) => {
            const id = parseInt(e.target.dataset.id);
            const loc = locations.find(l => l.id === id);
            if (loc) loc.description = e.target.value;
        });
    });
}

// 添加角色
window.addCharacter = function() {
    const characterId = Date.now();
    const characterItem = {
        id: characterId,
        name: '',
        description: '',
        role: ''
    };
    characters.push(characterItem);
    renderCharacters();
};

// 删除角色
function removeCharacter(id) {
    characters = characters.filter(char => char.id !== id);
    renderCharacters();
}

// 渲染角色列表
function renderCharacters() {
    const container = document.getElementById('charactersContainer');
    container.innerHTML = '';
    
    characters.forEach((char, index) => {
        const item = document.createElement('div');
        item.className = 'character-item';
        item.innerHTML = `
            <div class="character-item-header">
                <span class="character-item-title">角色 ${index + 1}</span>
                <button type="button" class="btn-remove" onclick="removeCharacter(${char.id})">删除</button>
            </div>
            <div class="form-group" style="padding: 0; margin-bottom: 1rem;">
                <label>角色名称 *</label>
                <input type="text" class="character-name" data-id="${char.id}" placeholder="例如：张三" value="${char.name}" required>
            </div>
            <div class="form-group" style="padding: 0; margin-bottom: 1rem;">
                <label>角色身份/职业</label>
                <input type="text" class="character-role" data-id="${char.id}" placeholder="例如：剑客" value="${char.role}">
            </div>
            <div class="form-group" style="padding: 0;">
                <label>角色描述 *</label>
                <textarea class="character-description" data-id="${char.id}" rows="3" placeholder="描述角色的性格、背景等..." required>${char.description}</textarea>
            </div>
        `;
        container.appendChild(item);
    });
    
    // 绑定输入事件
    container.querySelectorAll('.character-name').forEach(input => {
        input.addEventListener('input', (e) => {
            const id = parseInt(e.target.dataset.id);
            const char = characters.find(c => c.id === id);
            if (char) char.name = e.target.value;
        });
    });
    
    container.querySelectorAll('.character-role').forEach(input => {
        input.addEventListener('input', (e) => {
            const id = parseInt(e.target.dataset.id);
            const char = characters.find(c => c.id === id);
            if (char) char.role = e.target.value;
        });
    });
    
    container.querySelectorAll('.character-description').forEach(textarea => {
        textarea.addEventListener('input', (e) => {
            const id = parseInt(e.target.dataset.id);
            const char = characters.find(c => c.id === id);
            if (char) char.description = e.target.value;
        });
    });
}

// 生成预览
function generatePreview() {
    const previewContent = document.getElementById('previewContent');
    const title = document.getElementById('createScrollTitle').value;
    const language = document.getElementById('createLanguage').value;
    const description = document.getElementById('createDescription').value;
    const worldName = document.getElementById('worldName').value;
    const worldDescription = document.getElementById('worldDescription').value;
    
    previewContent.innerHTML = `
        <div class="preview-section">
            <h4>基本信息</h4>
            <p><strong>书卷名称：</strong>${title || '未填写'}</p>
            <p><strong>语言：</strong>${language === 'zh' ? '中文' : 'English'}</p>
            <p><strong>描述：</strong>${description || '无'}</p>
        </div>
        <div class="preview-section">
            <h4>世界观</h4>
            <p><strong>世界名称：</strong>${worldName || '未填写'}</p>
            <p><strong>世界观描述：</strong>${worldDescription || '未填写'}</p>
        </div>
        <div class="preview-section">
            <h4>地点 (${locations.length}个)</h4>
            <ul>
                ${locations.map(loc => `<li><strong>${loc.name || '未命名'}</strong>：${loc.description || '无描述'}</li>`).join('')}
            </ul>
        </div>
        <div class="preview-section">
            <h4>角色 (${characters.length}个)</h4>
            <ul>
                ${characters.map(char => `<li><strong>${char.name || '未命名'}</strong>${char.role ? ` (${char.role})` : ''}：${char.description || '无描述'}</li>`).join('')}
            </ul>
        </div>
    `;
}

// 提交创建书卷
window.submitCreateScroll = async function() {
    const title = document.getElementById('createScrollTitle').value.trim();
    const language = document.getElementById('createLanguage').value;
    const description = document.getElementById('createDescription').value.trim();
    const worldName = document.getElementById('worldName').value.trim();
    const worldDescription = document.getElementById('worldDescription').value.trim();
    
    // 验证
    if (!title || !worldName || !worldDescription) {
        alert('请填写完整的基本信息和世界观');
        return;
    }
    
    if (locations.length === 0) {
        alert('请至少添加一个地点');
        return;
    }
    
    if (characters.length === 0) {
        alert('请至少添加一个角色');
        return;
    }
    
    // 验证地点和角色数据
    for (const loc of locations) {
        if (!loc.name.trim() || !loc.description.trim()) {
            alert('请填写完整的地点信息');
            return;
        }
    }
    
    for (const char of characters) {
        if (!char.name.trim() || !char.description.trim()) {
            alert('请填写完整的角色信息');
            return;
        }
    }
    
    // 显示进度条
    const progressDiv = document.getElementById('createProgress');
    const progressFill = document.getElementById('createProgressFill');
    const progressText = document.getElementById('createProgressText');
    progressDiv.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '正在创建书卷...';
    
    // 构建请求数据
    const requestData = {
        title: title,
        language: language,
        description: description,
        worldName: worldName,
        worldDescription: worldDescription,
        locations: locations.map(loc => ({
            name: loc.name.trim(),
            description: loc.description.trim()
        })),
        characters: characters.map(char => ({
            name: char.name.trim(),
            role: char.role.trim(),
            description: char.description.trim()
        }))
    };
    
    try {
        progressFill.style.width = '50%';
        progressText.textContent = '正在保存配置...';
        
        const response = await fetch(`${API_BASE}/api/create-scroll`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || '创建失败');
        }
        
        progressFill.style.width = '100%';
        progressText.textContent = '书卷创建成功！';
        
        const result = await response.json();
        
        if (result.success) {
            setTimeout(() => {
                closeCreateModalFunc();
                // 跳转到书卷详情页
                if (result.scroll_id) {
                    window.location.href = `/frontend/pages/intro.html?scroll_id=${result.scroll_id}`;
                } else {
                    window.location.href = '/frontend/pages/library.html';
                }
            }, 1000);
        } else {
            throw new Error(result.message || '创建失败');
        }
    } catch (error) {
        console.error('创建书卷失败:', error);
        progressText.textContent = `错误: ${error.message}`;
        alert(`创建失败: ${error.message}`);
    }
};
