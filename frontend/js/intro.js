/**
 * 书卷前言页 JavaScript
 * 处理页面交互和API调用
 */

// 从URL获取scroll_id
const urlParams = new URLSearchParams(window.location.search);
const scrollId = urlParams.get('scroll_id');
const token = localStorage.getItem('token');

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    if (!scrollId) {
        alert('缺少书卷ID，返回广场');
        window.location.href = '/frontend/pages/plaza.html';
        return;
    }

    // 加载书卷信息
    await loadScrollInfo();
    
    // 绑定事件监听器
    bindEventListeners();
});

/**
 * 加载书卷信息
 */
async function loadScrollInfo() {
    try {
        showLoading(true);
        
        // 获取书卷详情
        const response = await fetch(`/api/scroll/${scrollId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: '未知错误' }));
            console.error('API 错误:', errorData);
            throw new Error(errorData.detail || '获取书卷信息失败');
        }
        
        const scroll = await response.json();
        
        // 如果返回的是包装格式，提取实际数据
        const scrollData = scroll.scroll || scroll;
        
        // 更新页面信息
        document.getElementById('scrollTitle').textContent = scrollData.title || '未知书卷';
        
        // 显示世界观描述（过滤掉文件名等无关信息）
        let description = scrollData.description || '暂无描述';
        // 如果描述包含"从文档自动生成"等字样，尝试提取更有意义的内容
        if (description.includes('从文档自动生成') || description.includes('.pdf')) {
            // 尝试从预设文件加载世界观信息
            if (scrollData.preset_path) {
                try {
                    const presetResponse = await fetch(`/api/scroll/${scrollId}/world-info`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    if (presetResponse.ok) {
                        const worldData = await presetResponse.json();
                        if (worldData.world_description) {
                            description = worldData.world_description;
                        }
                    }
                } catch (e) {
                    console.warn('加载世界观信息失败:', e);
                }
            }
        }
        document.getElementById('worldSummary').innerHTML = `<p>${description}</p>`;
        
        // 加载角色列表（仅用于私语模式的下拉选择）
        await loadCharacters(scrollId);
        
        // 加载历史进度
        await loadHistory(scrollId);
        
    } catch (error) {
        console.error('加载书卷信息失败:', error);
        const errorMessage = error.message || '加载书卷信息失败，请重试';
        console.error('错误详情:', errorMessage);
        alert(errorMessage);
        // 如果是因为认证失败，跳转到登录页
        if (errorMessage.includes('401') || errorMessage.includes('未提供token') || errorMessage.includes('无效的token')) {
            window.location.href = '/frontend/pages/login.html';
        }
    } finally {
        showLoading(false);
    }
}

/**
 * 加载角色列表（仅用于私语模式的下拉选择）
 */
async function loadCharacters(scrollId) {
    try {
        // 调用API获取角色列表
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
            // 如果API失败，显示详细错误信息
            const errorData = await response.json().catch(() => ({ detail: '未知错误' }));
            console.error('获取角色列表失败:', errorData);
            console.warn('使用空列表');
        }
        
        const chatSelect = document.getElementById('chatRoleSelect');
        
        chatSelect.innerHTML = '<option value="">选择角色...</option>';
        
        if (characters.length === 0) {
            chatSelect.innerHTML = '<option value="">暂无角色可选</option>';
            document.getElementById('enterChatBtn').disabled = true;
            console.warn('角色列表为空');
            return;
        }
        
        // 添加到下拉选择
        characters.forEach(char => {
            const option = document.createElement('option');
            option.value = char.code;
            const displayName = char.nickname || char.name || char.code;
            option.textContent = displayName;
            chatSelect.appendChild(option);
        });
        
        // 显示角色卡
        displayCharacterCards(characters);
        
        console.log(`成功加载 ${characters.length} 个角色`);
        
        // 监听下拉选择变化
        chatSelect.addEventListener('change', (e) => {
            document.getElementById('enterChatBtn').disabled = !e.target.value;
        });
        
    } catch (error) {
        console.error('加载角色列表失败:', error);
        document.getElementById('chatRoleSelect').innerHTML = '<option value="">加载失败</option>';
        document.getElementById('enterChatBtn').disabled = true;
    }
}

/**
 * 显示角色卡
 */
function displayCharacterCards(characters) {
    const charactersGrid = document.getElementById('charactersGrid');
    
    if (!charactersGrid) {
        console.warn('角色卡容器不存在');
        return;
    }
    
    if (characters.length === 0) {
        charactersGrid.innerHTML = `
            <div class="characters-empty">
                <i class="fas fa-user-slash"></i>
                <p>暂无角色</p>
            </div>
        `;
        return;
    }
    
    charactersGrid.innerHTML = characters.map(char => {
        // 优先显示名字，如果没有名字则显示昵称，最后显示code
        const displayName = char.name || char.nickname || char.code;
        const description = char.description || char.persona || '暂无描述';
        const avatar = char.avatar || '';
        
        return `
            <div class="character-card" data-role-code="${char.code}">
                ${avatar ? `<div class="character-avatar"><img src="${avatar}" alt="${displayName}" onerror="this.style.display='none'"></div>` : ''}
                <div class="character-info">
                    <h4 class="character-name">${displayName}</h4>
                    <p class="character-desc">${description.length > 100 ? description.substring(0, 100) + '...' : description}</p>
                </div>
            </div>
        `;
    }).join('');
    
    // 为每个角色卡添加点击事件
    const characterCards = charactersGrid.querySelectorAll('.character-card');
    characterCards.forEach(card => {
        card.addEventListener('click', () => {
            const roleCode = card.getAttribute('data-role-code');
            showCharacterDetail(roleCode);
        });
    });
}

/**
 * 显示角色详情
 */
async function showCharacterDetail(roleCode) {
    try {
        const modal = document.getElementById('characterModal');
        const modalContent = modal.querySelector('.modal-content');
        
        // 显示模态框
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // 显示加载状态
        document.getElementById('detailName').textContent = '加载中...';
        document.getElementById('detailProfile').textContent = '正在加载角色信息...';
        
        // 获取角色详细信息
        const response = await fetch(`/api/scroll/${scrollId}/character/${roleCode}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('获取角色信息失败');
        }
        
        const data = await response.json();
        const character = data.character;
        
        // 更新头像
        const avatarContainer = document.getElementById('detailAvatar');
        if (character.avatar) {
            avatarContainer.innerHTML = `<img src="${character.avatar}" alt="${character.name}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>'">`;
        } else {
            avatarContainer.innerHTML = '<i class="fas fa-user"></i>';
        }
        
        // 更新名称和昵称
        document.getElementById('detailName').textContent = character.name || character.code;
        const nicknameEl = document.getElementById('detailNickname');
        if (character.nickname && character.nickname !== character.name) {
            nicknameEl.textContent = character.nickname;
            nicknameEl.style.display = 'block';
        } else {
            nicknameEl.style.display = 'none';
        }
        
        // 更新简介
        document.getElementById('detailProfile').textContent = character.profile || '暂无简介';
        
        // 更新性格设定
        const personaSection = document.getElementById('personaSection');
        const detailPersona = document.getElementById('detailPersona');
        if (character.persona) {
            detailPersona.textContent = character.persona;
            personaSection.style.display = 'block';
        } else {
            personaSection.style.display = 'none';
        }
        
        // 更新场景设定
        const scenarioSection = document.getElementById('scenarioSection');
        const detailScenario = document.getElementById('detailScenario');
        if (character.scenario) {
            detailScenario.textContent = character.scenario;
            scenarioSection.style.display = 'block';
        } else {
            scenarioSection.style.display = 'none';
        }
        
        // 更新人物关系
        const relationSection = document.getElementById('relationSection');
        const detailRelation = document.getElementById('detailRelation');
        if (character.relation && Object.keys(character.relation).length > 0) {
            let relationText = '';
            if (character.relation.relation) {
                relationText += `关系：${character.relation.relation}\n`;
            }
            if (character.relation.target) {
                relationText += `对象：${character.relation.target}\n`;
            }
            if (character.relation.description) {
                relationText += `描述：${character.relation.description}`;
            }
            detailRelation.textContent = relationText || '暂无关系信息';
            relationSection.style.display = 'block';
        } else {
            relationSection.style.display = 'none';
        }
        
    } catch (error) {
        console.error('加载角色详情失败:', error);
        document.getElementById('detailProfile').textContent = '加载失败，请稍后重试';
    }
}

/**
 * 关闭角色详情模态框
 */
function closeCharacterModal() {
    const modal = document.getElementById('characterModal');
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

// 绑定模态框关闭事件
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('characterModal');
    const overlay = document.getElementById('modalOverlay');
    const closeBtn = document.getElementById('modalClose');
    
    if (overlay) {
        overlay.addEventListener('click', closeCharacterModal);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeCharacterModal);
    }
    
    // ESC键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            closeCharacterModal();
        }
    });
});

/**
 * 加载历史进度
 */
async function loadHistory(scrollId) {
    try {
        // TODO: 调用API获取历史记录
        const timeline = document.getElementById('historyTimeline');
        
        // 模拟数据
        const acts = [
            { act: 1, title: '第一幕：缘起', date: '2024-01-01' },
            { act: 2, title: '第二幕：冲突', date: '2024-01-02' }
        ];
        
        if (acts.length === 0) {
            timeline.innerHTML = `
                <div class="timeline-empty">
                    <i class="fas fa-clock"></i>
                    <p>暂无历史记录</p>
                </div>
            `;
            return;
        }
        
        timeline.innerHTML = '';
        acts.forEach(act => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.innerHTML = `
                <h4>${act.title}</h4>
                <p>${act.date}</p>
            `;
            item.addEventListener('click', () => {
                enterStoryMode(act.act, false, false, null);
            });
            timeline.appendChild(item);
        });
        
    } catch (error) {
        console.error('加载历史进度失败:', error);
    }
}

/**
 * 绑定事件监听器
 */
function bindEventListeners() {
    // 返回按钮
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = '/frontend/pages/plaza.html';
    });
    
    // 私语模式
    document.getElementById('enterChatBtn').addEventListener('click', () => {
        const roleCode = document.getElementById('chatRoleSelect').value;
        if (roleCode) {
            enterChatMode(roleCode);
        }
    });
    
    // 入卷模式
    document.getElementById('enterStoryBtn').addEventListener('click', () => {
        const actSelect = document.getElementById('actSelect');
        const act = actSelect.value === 'new' ? null : parseInt(actSelect.value);
        const multiplayer = document.getElementById('enableMultiplayerStory').checked;
        const eventChain = document.getElementById('enableEventChain').checked;
        const actCount = eventChain ? parseInt(document.getElementById('actCountSelect').value) : null;
        
        enterStoryMode(act, multiplayer, eventChain, actCount);
    });
    
    // 事件链开关
    document.getElementById('enableEventChain').addEventListener('change', (e) => {
        document.getElementById('actCountSelect').disabled = !e.target.checked;
    });
    
    // 组局模式
    document.getElementById('createRoomBtn').addEventListener('click', () => {
        createGameRoom();
    });
    
    document.getElementById('joinRoomBtn').addEventListener('click', () => {
        const input = document.getElementById('roomCodeInput');
        input.style.display = input.style.display === 'none' ? 'block' : 'none';
        if (input.style.display === 'block') {
            input.focus();
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    joinGameRoom(input.value);
                }
            });
        }
    });
}

/**
 * 进入私语模式
 */
function enterChatMode(roleCode) {
    if (!roleCode) {
        alert('请先选择角色');
        return;
    }
    
    console.log('进入私语模式，角色:', roleCode, 'scroll_id:', scrollId);
    
    // 跳转到聊天页面
    const params = new URLSearchParams({
        scroll_id: scrollId,
        role_code: roleCode
    });
    window.location.href = `/frontend/pages/chat.html?${params.toString()}`;
}

/**
 * 进入入卷模式
 */
function enterStoryMode(act = null, multiplayer = false, eventChain = false, actCount = null) {
    console.log('进入入卷模式，参数:', { act, multiplayer, eventChain, actCount, scrollId });
    
    // TODO: Phase 2 创建 story.html 页面
    // 暂时跳转到游戏页面，并传递参数
    const params = new URLSearchParams({
        scroll_id: scrollId,
        mode: 'story'
    });
    
    if (act) params.set('act', act);
    if (multiplayer) params.set('multiplayer', 'true');
    if (eventChain && actCount) {
        params.set('event_chain', 'true');
        params.set('act_count', actCount);
    }
    
    // 跳转到现有的游戏页面
    window.location.href = `/game?${params.toString()}`;
}

/**
 * 创建游戏房间
 */
async function createGameRoom() {
    try {
        const gameType = document.getElementById('gameTypeSelect').value;
        
        const response = await fetch('/api/game/create-room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                scroll_id: scrollId,
                game_type: gameType
            })
        });
        
        if (!response.ok) {
            throw new Error('创建房间失败');
        }
        
        const data = await response.json();
        alert(`房间创建成功！房间代码：${data.room_code}`);
        
        // 进入游戏房间
        // TODO: Phase 3 创建 game.html 页面
        // 暂时跳转到游戏页面
        console.log('房间创建成功，跳转到游戏页面');
        window.location.href = `/game?room_id=${data.room_id}&mode=game&scroll_id=${scrollId}`;
        
    } catch (error) {
        console.error('创建房间失败:', error);
        alert('创建房间失败，请重试');
    }
}

/**
 * 加入游戏房间
 */
async function joinGameRoom(roomCode) {
    try {
        const response = await fetch(`/api/game/join-room/${roomCode}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('加入房间失败');
        }
        
        const data = await response.json();
        // TODO: Phase 3 创建 game.html 页面
        // 暂时跳转到游戏页面
        console.log('加入房间成功，跳转到游戏页面');
        window.location.href = `/game?room_id=${data.room_id}&mode=game&scroll_id=${scrollId}`;
        
    } catch (error) {
        console.error('加入房间失败:', error);
        alert('加入房间失败，请检查房间代码');
    }
}

/**
 * 显示/隐藏加载提示
 */
function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

