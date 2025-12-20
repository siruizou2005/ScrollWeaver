/**
 * 穿越方式选择页 JavaScript
 * 处理穿越方式选择和会话创建
 */

// 从URL获取scroll_id
const urlParams = new URLSearchParams(window.location.search);
const scrollId = urlParams.get('scroll_id');
const token = localStorage.getItem('token');

// 当前选中的角色代码和数据
let selectedCharacterCode = null;
let selectedCharacterData = null;

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    if (!scrollId) {
        alert('缺少书卷ID，返回广场');
        window.location.href = '/frontend/pages/plaza.html';
        return;
    }

    if (!token) {
        alert('请先登录');
        window.location.href = '/frontend/pages/login.html';
        return;
    }

    // 加载书卷信息和角色列表
    await loadScrollInfo();
    await loadCharacters();

    // 绑定事件监听器
    bindEventListeners();
});

/**
 * 加载书卷信息
 */
async function loadScrollInfo() {
    try {
        const response = await fetch(`/api/scroll/${scrollId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('获取书卷信息失败');
        }

        const scroll = await response.json();
        const scrollData = scroll.scroll || scroll;

        // 更新页面标题
        document.getElementById('scrollTitle').textContent = `${scrollData.title || '未知书卷'} - 选择穿越方式`;
    } catch (error) {
        console.error('加载书卷信息失败:', error);
        alert('加载书卷信息失败，请重试');
    }
}

/**
 * 加载角色列表
 */
async function loadCharacters() {
    try {
        const charactersList = document.getElementById('charactersList');

        const response = await fetch(`/api/scroll/${scrollId}/characters`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        let characters = [];
        if (response.ok) {
            const data = await response.json();
            characters = data.characters || [];
        } else {
            console.warn('获取角色列表失败，使用空列表');
        }

        if (characters.length === 0) {
            charactersList.innerHTML = `
                <div class="characters-empty">
                    <i class="fas fa-user-slash"></i>
                    <p>暂无角色可选</p>
                </div>
            `;
            return;
        }

        // 显示角色列表
        charactersList.innerHTML = characters.map(char => {
            const displayName = char.name || char.nickname || char.code;
            const description = char.description || char.persona || '暂无描述';
            const avatar = char.avatar || '';

            return `
                <div class="character-item" data-role-code="${char.code}">
                    <div class="character-item-avatar">
                        ${avatar ? `<img src="${avatar}" alt="${displayName}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>'">` : '<i class="fas fa-user"></i>'}
                    </div>
                    <div class="character-item-info">
                        <h4 class="character-item-name">${displayName}</h4>
                        <p class="character-item-desc">${description.length > 80 ? description.substring(0, 80) + '...' : description}</p>
                    </div>
                    <div class="character-item-arrow">
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>
            `;
        }).join('');

        // 为每个角色项添加点击事件
        const characterItems = charactersList.querySelectorAll('.character-item');
        characterItems.forEach(item => {
            item.addEventListener('click', () => {
                const roleCode = item.getAttribute('data-role-code');
                showCharacterDetail(roleCode, characters.find(c => c.code === roleCode));
            });
        });

    } catch (error) {
        console.error('加载角色列表失败:', error);
        document.getElementById('charactersList').innerHTML = `
            <div class="characters-empty">
                <i class="fas fa-exclamation-triangle"></i>
                <p>加载失败，请刷新重试</p>
            </div>
        `;
    }
}

/**
 * 显示角色详情
 */
async function showCharacterDetail(roleCode, characterData) {
    try {
        const modal = document.getElementById('characterDetailModal');

        // 如果没有传入角色数据，从API获取
        if (!characterData) {
            const response = await fetch(`/api/scroll/${scrollId}/character/${roleCode}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                characterData = data.character || data;
            }
        }

        if (!characterData) {
            alert('获取角色信息失败');
            return;
        }

        // 更新模态框内容
        const displayName = characterData.name || characterData.nickname || roleCode;
        const description = characterData.description || characterData.persona || '暂无描述';
        const avatar = characterData.avatar || '';

        document.getElementById('detailName').textContent = displayName;
        document.getElementById('detailNickname').textContent = characterData.nickname ? `（${characterData.nickname}）` : '';
        document.getElementById('detailProfile').textContent = description;

        const avatarEl = document.getElementById('detailAvatar');
        if (avatar) {
            avatarEl.innerHTML = `<img src="${avatar}" alt="${displayName}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>'">`;
        } else {
            avatarEl.innerHTML = '<i class="fas fa-user"></i>';
        }

        // 显示模态框
        modal.style.display = 'flex';
        selectedCharacterCode = roleCode;
        selectedCharacterData = characterData;

    } catch (error) {
        console.error('显示角色详情失败:', error);
        alert('加载角色详情失败');
    }
}

/**
 * 绑定事件监听器
 */
function bindEventListeners() {
    console.log('bindEventListeners called');

    // 返回按钮
    document.getElementById('backBtn').addEventListener('click', () => {
        window.history.back();
    });

    // 真实身份模式 - 使用浏览器prompt获取名字
    const selfRealMode = document.getElementById('selfRealMode');
    if (selfRealMode) {
        selfRealMode.addEventListener('click', async () => {
            const name = prompt('请输入你在这个世界中的名字：', '');
            if (name && name.trim()) {
                await createRealIdentityAndEnterWorld(name.trim());
            }
        });
    }

    // Soulverse模式 - 跳转到创建页面
    document.getElementById('selfSoulverseMode').addEventListener('click', () => {
        // 检查URL参数中是否有新创建的模型ID
        const urlParams = new URLSearchParams(window.location.search);
        const newModelId = urlParams.get('persona_model_id');

        if (newModelId) {
            // 如果URL中有新创建的模型ID，直接使用它创建会话
            createWorldSession('soulverse', null, newModelId);
        } else {
            // 否则跳转到创建数字孪生页面
            window.location.href = `/frontend/pages/soulverse-create.html?scroll_id=${scrollId}`;
        }
    });

    // 角色详情模态框关闭
    document.getElementById('modalClose').addEventListener('click', () => {
        closeCharacterDetailModal();
    });

    document.getElementById('modalOverlay').addEventListener('click', () => {
        closeCharacterDetailModal();
    });

    document.getElementById('detailCancelBtn').addEventListener('click', () => {
        closeCharacterDetailModal();
    });

    // 确认魂穿
    document.getElementById('detailConfirmBtn').addEventListener('click', () => {
        if (selectedCharacterCode) {
            createWorldSession('character', selectedCharacterCode);
        }
    });

    // Soulverse模态框
    document.getElementById('closeSoulverseModal').addEventListener('click', () => {
        document.getElementById('soulverseModal').style.display = 'none';
    });

    document.getElementById('soulverseCancelBtn').addEventListener('click', () => {
        document.getElementById('soulverseModal').style.display = 'none';
    });

    document.getElementById('soulverseConfirmBtn').addEventListener('click', () => {
        const personaModelId = document.getElementById('soulverseSelect').value;
        if (personaModelId) {
            createWorldSession('soulverse', null, personaModelId);
        } else {
            alert('请选择一个人格模型');
        }
    });
}

/**
 * 创建真实身份用户agent并进入世界
 * 使用默认的人格参数，只需要用户输入名字
 */
async function createRealIdentityAndEnterWorld(name) {
    try {
        // 显示加载提示
        const loadingMessage = '正在创建身份并进入世界...';
        console.log(loadingMessage);

        // 1. 创建简单的用户agent（使用默认值）
        const createResponse = await fetch('/api/self-identity/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                scroll_id: parseInt(scrollId),
                mbti: 'INFP',  // 默认MBTI
                big_five: {    // 默认Big Five（平均值）
                    openness: 0.5,
                    conscientiousness: 0.5,
                    extraversion: 0.5,
                    agreeableness: 0.5,
                    neuroticism: 0.5
                },
                identity: '旅行者',  // 默认身份
                goal: '探索这个神奇的世界',  // 默认目标
                nickname: name   // 用户输入的名字
            })
        });

        if (!createResponse.ok) {
            const errorData = await createResponse.json().catch(() => ({ detail: '创建失败' }));
            throw new Error(errorData.detail || '创建用户失败');
        }

        const createData = await createResponse.json();
        const roleCode = createData.role_code;

        // 2. 创建世界会话
        const sessionResponse = await fetch('/api/crossworld/create-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                scroll_id: parseInt(scrollId),
                cross_type: 'self',
                character_code: roleCode
            })
        });

        if (!sessionResponse.ok) {
            const errorData = await sessionResponse.json().catch(() => ({ detail: '创建会话失败' }));
            throw new Error(errorData.detail || '创建会话失败');
        }

        const sessionData = await sessionResponse.json();
        const sessionId = sessionData.session_id;

        // 3. 保存角色信息到localStorage
        localStorage.setItem('selected_role', JSON.stringify({
            code: roleCode,
            name: name,
            nickname: name,
            identity: '旅行者',
            goal: '探索这个神奇的世界',
            avatar: '../assets/images/default-icon.jpg'
        }));

        // 清除所有之前的私语聊天会话
        clearAllChatSessions();

        // 4. 跳转到世界视图
        window.location.href = `/frontend/pages/world-view.html?session_id=${sessionId}&scroll_id=${scrollId}`;

    } catch (error) {
        console.error('创建真实身份失败:', error);
        alert('进入世界失败: ' + error.message);
    }
}

/**
 * 关闭角色详情模态框
 */
function closeCharacterDetailModal() {
    document.getElementById('characterDetailModal').style.display = 'none';
    selectedCharacterCode = null;
}

/**
 * 显示Soulverse模态框
 */
async function showSoulverseModal() {
    try {
        // 检查URL参数中是否有新创建的模型ID
        const urlParams = new URLSearchParams(window.location.search);
        const newModelId = urlParams.get('persona_model_id');

        if (newModelId) {
            // 如果URL中有新创建的模型ID，直接使用它
            createWorldSession('soulverse', null, newModelId);
            return;
        }

        // 加载Soulverse人格模型列表
        const response = await fetch('/api/user/persona-models', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const select = document.getElementById('soulverseSelect');

        if (response.ok) {
            const data = await response.json();
            const models = data.models || [];

            if (models.length === 0) {
                // 如果没有模型，跳转到创建页面
                const createUrl = `/frontend/pages/soulverse-create.html?scroll_id=${scrollId}`;
                if (confirm('您还没有创建Soulverse人格模型，是否现在创建？')) {
                    window.location.href = createUrl;
                }
                return;
            }

            select.innerHTML = '<option value="">请选择一个人格模型</option>' +
                models.map(model =>
                    `<option value="${model.id}">${model.name || `模型 ${model.id}`}</option>`
                ).join('');
        } else {
            select.innerHTML = '<option value="">加载失败</option>';
        }

        document.getElementById('soulverseModal').style.display = 'flex';
    } catch (error) {
        console.error('加载Soulverse模型失败:', error);
        alert('加载人格模型失败，请重试');
    }
}

/**
 * 创建世界会话
 */
async function createWorldSession(crossType, characterCode = null, personaModelId = null) {
    try {
        const requestBody = {
            scroll_id: parseInt(scrollId),
            cross_type: crossType
        };

        if (crossType === 'character' && characterCode) {
            requestBody.character_code = characterCode;
        } else if (crossType === 'soulverse' && personaModelId) {
            requestBody.persona_model_id = parseInt(personaModelId);
        }

        const response = await fetch('/api/crossworld/create-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: '创建会话失败' }));
            throw new Error(errorData.detail || '创建会话失败');
        }

        const data = await response.json();
        const sessionId = data.session_id;
        const respScrollId = data.scroll_id || scrollId;

        // 如果是角色魂穿，保存角色信息到localStorage以便在世界界面显示
        if (crossType === 'character' && selectedCharacterData) {
            localStorage.setItem('selected_role', JSON.stringify({
                code: selectedCharacterCode,
                name: selectedCharacterData.name || selectedCharacterData.nickname,
                nickname: selectedCharacterData.nickname,
                avatar: selectedCharacterData.avatar,
                identity: selectedCharacterData.identity || '',
                profile: selectedCharacterData.profile || selectedCharacterData.description || ''
            }));
        } else if (crossType === 'self') {
            localStorage.setItem('selected_role', JSON.stringify({
                name: '真实自我',
                identity: '本尊降临',
                profile: '用户以真实身份降临到这个世界，可以自由探索和互动。',
                avatar: '../assets/images/default-icon.jpg'
            }));
        } else if (crossType === 'soulverse') {
            localStorage.setItem('selected_role', JSON.stringify({
                name: '数字孪生',
                identity: 'Soulverse数字孪生',
                profile: '用户的数字孪生体，拥有与用户相似的性格和思维方式。',
                avatar: '../assets/images/default-icon.jpg'
            }));
        }

        // 清除所有之前的私语聊天会话
        clearAllChatSessions();

        // 跳转到世界界面，同时带上 session_id 和 scroll_id
        window.location.href = `/frontend/pages/world-view.html?session_id=${sessionId}&scroll_id=${respScrollId}`;

    } catch (error) {
        console.error('创建世界会话失败:', error);
        alert('创建会话失败：' + (error.message || '未知错误'));
    }
}

/**
 * 清除所有私语聊天会话
 * 当用户选择新角色时，清除之前角色的聊天历史
 */
function clearAllChatSessions() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            // 清除所有以 chat_session_ 开头的项
            if (key && key.startsWith('chat_session_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            console.log('清除聊天会话:', key);
        });
        if (keysToRemove.length > 0) {
            console.log(`已清除 ${keysToRemove.length} 个聊天会话`);
        }
    } catch (e) {
        console.warn('清除聊天会话失败:', e);
    }
}
