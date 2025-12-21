/**
 * 书卷前言页 JavaScript
 * 处理页面交互和API调用
 */

// 从URL获取scroll_id
const urlParams = new URLSearchParams(window.location.search);
const scrollId = urlParams.get('scroll_id');
const token = localStorage.getItem('token');

// 模态框打开时间戳，防止点击穿透
let lastCharacterModalOpenTime = 0;

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

        // 更新共享按钮状态
        const shareBtn = document.getElementById('shareBtn');
        if (shareBtn && scrollData.is_public) {
            shareBtn.classList.add('shared');
            shareBtn.title = '已共享';
        } else if (shareBtn) {
            shareBtn.classList.remove('shared');
            shareBtn.title = '分享';
        }

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

        // 加载角色列表（用于显示登场人物）
        await loadCharacters(scrollId);

        // 加载地图预览
        await loadMapPreview(scrollId, scrollData.source);

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
 * 加载角色列表（用于显示登场人物）
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

        // 显示角色卡
        displayCharacterCards(characters);

        console.log(`成功加载 ${characters.length} 个角色`);

    } catch (error) {
        console.error('加载角色列表失败:', error);
        // 显示错误状态
        const charactersGrid = document.getElementById('charactersGrid');
        if (charactersGrid) {
            charactersGrid.innerHTML = `
                <div class="characters-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>加载失败，请刷新重试</p>
                </div>
            `;
        }
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
        lastCharacterModalOpenTime = Date.now(); // 记录打开时间
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
        overlay.addEventListener('click', () => {
            const timeSinceOpen = Date.now() - lastCharacterModalOpenTime;
            if (timeSinceOpen < 200) {
                console.log('忽略点击 - 模态框刚打开');
                return;
            }
            closeCharacterModal();
        });
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
 * 绑定事件监听器
 */
function bindEventListeners() {
    // 返回按钮
    document.getElementById('backBtn').addEventListener('click', () => {
        // 检查是否有来源页面（referrer）
        const referrer = document.referrer;
        const currentOrigin = window.location.origin;
        
        // 如果有来源页面且来源页面在当前域名下
        if (referrer && referrer.startsWith(currentOrigin)) {
            try {
                const referrerUrl = new URL(referrer);
                const referrerPath = referrerUrl.pathname;
                const currentPath = window.location.pathname;
                
                // 如果来源页面是地图页，跳转到广场页而不是返回地图页
                if (referrerPath.includes('world-view.html')) {
                    window.location.href = '/frontend/pages/plaza.html';
                    return;
                }
                
                // 如果来源页面不是当前页面，且不是地图页，直接返回上一页
                if (referrerPath !== currentPath) {
                    window.history.back();
                    return;
                }
            } catch (e) {
                console.warn('解析referrer失败:', e);
            }
        }
        
        // 如果没有有效的来源页面，或者来源页面是当前页面，跳转到广场页
        window.location.href = '/frontend/pages/plaza.html';
    });

    // 共享按钮
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('共享按钮被点击');
            try {
                await handleShareScroll();
            } catch (error) {
                console.error('共享操作出错:', error);
                alert('操作失败：' + (error.message || '未知错误'));
            }
        });
    } else {
        console.warn('共享按钮未找到');
    }

    // 进入世界按钮
    const enterWorldBtn = document.getElementById('enterWorldBtn');
    if (enterWorldBtn) {
        enterWorldBtn.addEventListener('click', () => {
            // 跳转到穿越方式选择页面（做自己/魂穿）
            window.location.href = `/frontend/pages/crossworld-select.html?scroll_id=${scrollId}`;
        });
    }

    // 查看地图按钮
    const viewMapBtn = document.getElementById('viewMapBtn');
    if (viewMapBtn) {
        viewMapBtn.addEventListener('click', () => {
            // 跳转到世界视图页面（地图）
            window.location.href = `/frontend/pages/world-view.html?scroll_id=${scrollId}`;
        });
    }

    // 进入世界-测试按钮
    const enterWorldTestBtn = document.getElementById('enterWorldTestBtn');
    if (enterWorldTestBtn) {
        enterWorldTestBtn.addEventListener('click', () => {
            // 测试模式：直接跳转到世界视图页面（使用scroll_id作为session_id进行测试）
            window.location.href = `/frontend/pages/world-view.html?session_id=test_${scrollId}`;
        });
    }

    // 组局模式（如果元素存在）
    const createRoomBtn = document.getElementById('createRoomBtn');
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            createGameRoom();
        });
    }

    const joinRoomBtn = document.getElementById('joinRoomBtn');
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            const input = document.getElementById('roomCodeInput');
            if (input) {
                input.style.display = input.style.display === 'none' ? 'block' : 'none';
                if (input.style.display === 'block') {
                    input.focus();
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            joinGameRoom(input.value);
                        }
                    });
                }
            }
        });
    }
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
 * 生成并预览事件链
 */
function generateAndPreviewEventChain(actCount, act, multiplayer) {
    // 立即跳转到预览页面，参数通过URL传递
    const params = new URLSearchParams({
        scroll_id: scrollId,
        act_count: actCount,
        language: 'zh'
    });
    if (act) params.set('act', act);
    if (multiplayer) params.set('multiplayer', 'true');

    // 跳转到预览页面（预览页面会处理生成逻辑）
    window.location.href = `/frontend/pages/event-chain-preview.html?${params.toString()}`;
}

// 事件链预览功能已移至新页面 event-chain-preview.html

/**
 * 创建联机房间
 */
async function createMultiplayerRoom(password) {
    try {
        showLoading(true);
        
        const response = await fetch('/api/multiplayer/create-room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                scroll_id: scrollId,
                password: password
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: '创建房间失败' }));
            throw new Error(errorData.detail || '创建房间失败');
        }

        const data = await response.json();
        
        // 关闭对话框
        document.getElementById('multiplayerPasswordModal').classList.remove('active');
        showLoading(false);
        
        // 跳转到匹配页
        window.location.href = `/frontend/pages/matching.html?room_id=${data.room_id}&scroll_id=${scrollId}&is_host=true`;
    } catch (error) {
        console.error('创建联机房间失败:', error);
        showLoading(false);
        alert(error.message || '创建房间失败，请重试');
    }
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
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        if (show) {
            loadingOverlay.style.display = 'flex';
            loadingOverlay.style.opacity = '1';
        } else {
            // 添加淡出动画
            loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
                loadingOverlay.style.opacity = '1'; // 恢复透明度，以便下次显示
            }, 300);
        }
    }
}

/**
 * 处理书卷共享
 */
async function handleShareScroll() {
    try {
        // 先获取当前书卷信息，检查是否已共享
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
        const isCurrentlyShared = scrollData.is_public || false;

        // 显示确认对话框
        const message = isCurrentlyShared
            ? '确定要取消共享此书卷吗？取消后其他用户将无法在"阅卷共享书卷"中看到此书卷。'
            : '确定要共享此书卷吗？共享后其他用户可以在"阅卷共享书卷"中看到此书卷。';

        // 修改确认对话框标题
        const confirmModal = document.getElementById('confirmModal');
        const modalHeader = confirmModal?.querySelector('.modal-header h2');
        const originalTitle = modalHeader ? modalHeader.innerHTML : null;

        if (modalHeader) {
            // 根据操作类型设置标题
            if (isCurrentlyShared) {
                modalHeader.innerHTML = '<i class="fas fa-share-alt"></i> 取消共享';
            } else {
                modalHeader.innerHTML = '<i class="fas fa-share-alt"></i> 确认共享';
            }
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

        // 执行共享/取消共享操作
        showLoading(true);

        const shareResponse = await fetch(`/api/scroll/${scrollId}/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                is_public: !isCurrentlyShared
            })
        });

        if (!shareResponse.ok) {
            const errorData = await shareResponse.json().catch(() => ({ detail: '操作失败' }));
            throw new Error(errorData.detail || '共享操作失败');
        }

        const result = await shareResponse.json();

        // 先关闭loading，再显示成功消息（避免同时显示造成显示异常）
        showLoading(false);

        // 显示成功消息（使用页面内提示）
        if (typeof showSuccess === 'function') {
            showSuccess(result.message || (isCurrentlyShared ? '已取消共享' : '共享成功'));
        } else {
            // 回退到 alert
            alert(result.message || (isCurrentlyShared ? '已取消共享' : '共享成功'));
        }

        // 更新按钮状态（可选：改变图标或文字）
        const shareBtn = document.getElementById('shareBtn');
        if (shareBtn) {
            if (!isCurrentlyShared) {
                shareBtn.classList.add('shared');
                shareBtn.title = '已共享';
            } else {
                shareBtn.classList.remove('shared');
                shareBtn.title = '分享';
            }
        }

    } catch (error) {
        console.error('共享书卷失败:', error);
        showLoading(false);
        // 显示错误消息（使用页面内提示）
        if (typeof showError === 'function') {
            showError(error.message || '共享操作失败，请重试');
        } else {
            // 回退到 alert
            alert(error.message || '共享操作失败，请重试');
        }
    }
}


/**
 * 加载地图预览
 */
async function loadMapPreview(scrollId, source) {
    const mapPreview = document.getElementById('mapPreview');
    const mapPreviewContainer = document.getElementById('mapPreviewContainer');
    if (!mapPreview || !mapPreviewContainer) return;

    try {
        // 使用新 API 获取完整地图数据
        const response = await fetch(`/api/scrolls/${scrollId}/map`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.warn('获取地图数据失败，尝试旧接口');
            // 兜底逻辑
            const oldResponse = await fetch(`/api/scrolls/${scrollId}/map-buildings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (oldResponse.ok) {
                const oldData = await oldResponse.json();
                renderMapPreview(oldData.buildings || [], null);
            }
            return;
        }

        const mapData = await response.json();
        const buildings = (mapData.locations || []).map(loc => ({
            building_code: loc.code,
            building_name: loc.name,
            coordinates: loc.view_config,
            color: loc.color
        })).filter(b => b.coordinates && Object.keys(b.coordinates).length > 0);

        const backgroundImageUrl = mapData.metadata ? mapData.metadata.background_url : null;
        renderMapPreview(buildings, backgroundImageUrl, source);

    } catch (error) {
        console.error('加载地图预览失败:', error);
    }
}

/**
 * 渲染地图预览
 */
function renderMapPreview(buildings, backgroundImageUrl, source) {
    const mapPreview = document.getElementById('mapPreview');
    const mapPreviewContainer = document.getElementById('mapPreviewContainer');
    
    if (!mapPreview || !mapPreviewContainer) return;

    // 清空现有内容
    mapPreview.innerHTML = '';
    
    // 默认显示“暂无数据”，如果后续有背景图或建筑物则移除
    if (buildings.length === 0 && !backgroundImageUrl) {
        mapPreviewContainer.innerHTML = '<div class="map-empty"><i class="fas fa-map-marked"></i><p>暂无地图数据</p></div>';
        return;
    } else {
        // 先移除旧的空提示（如果有）
        const oldEmpty = mapPreviewContainer.querySelector('.map-empty');
        if (oldEmpty) oldEmpty.remove();
    }

    // 设置背景图
    if (backgroundImageUrl) {
        const testImg = new Image();
        testImg.onload = () => {
            mapPreviewContainer.style.backgroundImage = `url(${backgroundImageUrl})`;
            mapPreviewContainer.style.backgroundSize = 'cover';
            mapPreviewContainer.style.backgroundPosition = 'center';
            mapPreviewContainer.classList.add('has-background');
            // 加载成功后确保移除空提示
            const emptyHint = mapPreviewContainer.querySelector('.map-empty');
            if (emptyHint) emptyHint.remove();
        };
        testImg.src = backgroundImageUrl;
    } else {
        mapPreviewContainer.style.backgroundImage = 'none';
        mapPreviewContainer.classList.remove('has-background');
    }

    if (buildings.length === 0) return;

    // 获取容器尺寸
    const width = mapPreviewContainer.clientWidth || 300;
    const height = mapPreviewContainer.clientHeight || 200;
    
    const GRID_COLS = 24;
    const GRID_ROWS = 12;
    const cellWidth = width / GRID_COLS;
    const cellHeight = height / GRID_ROWS;

    // 设置SVG视口
    mapPreview.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // 绘制建筑物预览
    buildings.forEach(building => {
        const { coordinates, color } = building;
        if (!coordinates || Object.keys(coordinates).length === 0) return;

        const convert = (ux, uy) => ({
            x: (ux - 1) * cellWidth,
            y: (GRID_ROWS - uy) * cellHeight
        });

        const sw = convert(coordinates.sw[0], coordinates.sw[1]);
        const se = convert(coordinates.se[0], coordinates.se[1]);
        const ne = convert(coordinates.ne[0], coordinates.ne[1]);
        const nw = convert(coordinates.nw[0], coordinates.nw[1]);

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const points = [`${sw.x},${sw.y}`, `${se.x},${se.y}`, `${ne.x},${ne.y}`, `${nw.x},${nw.y}`].join(' ');
        polygon.setAttribute('points', points);
        
        // 如果是三国演义（隆中）或没有背景图，显示建筑物颜色
        const showBuildingColor = source !== 'A_Dream_in_Red_Mansions';
        
        if (showBuildingColor && color) {
            polygon.setAttribute('fill', color);
            polygon.setAttribute('fill-opacity', '0.5');
            polygon.setAttribute('stroke', color);
            polygon.setAttribute('stroke-width', '1');
        } else {
            polygon.setAttribute('fill', 'transparent');
            polygon.setAttribute('stroke', 'rgba(255,255,255,0.2)');
            polygon.setAttribute('stroke-width', '0.5');
        }
        
        mapPreview.appendChild(polygon);
    });
}
