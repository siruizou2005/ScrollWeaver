// character-first-flow.js
// 角色优先选择流程和全屏地图逻辑

(function () {
    'use strict';

    // 状态管理
    let selectedCharacter = null;
    let allCharacters = [];
    let mapData = null;

    // DOM 元素引用
    const characterSelectOverlay = document.getElementById('character-select-overlay');
    const characterSelectGrid = document.getElementById('characterSelectGrid');
    const fullscreenMapOverlay = document.getElementById('fullscreen-map-overlay');
    const fullscreenMapContainer = document.getElementById('fullscreenMapContainer');
    const mapOverlayTitle = document.getElementById('mapOverlayTitle');
    const mapOverlaySubtitle = document.getElementById('mapOverlaySubtitle');
    const mapLegend = document.getElementById('mapLegend');
    const backToCharacterSelectBtn = document.getElementById('backToCharacterSelect');

    // 检查是否在新流程模式下（通过检测 overlay 是否存在）
    function isNewFlowEnabled() {
        return characterSelectOverlay !== null;
    }

    // 初始化
    function init() {
        if (!isNewFlowEnabled()) {
            console.log('[CharacterFirstFlow] 遮罩层未找到，跳过新流程初始化');
            return;
        }

        console.log('[CharacterFirstFlow] 初始化角色优先选择流程');

        // 检查URL参数，如果有location和roles，跳过选择流程
        const urlParams = new URLSearchParams(window.location.search);
        const location = urlParams.get('location');
        const roles = urlParams.get('roles');

        if (location && roles) {
            console.log('[CharacterFirstFlow] 检测到location和roles参数，跳过角色和地点选择');
            // 隐藏所有遮罩层
            hideCharacterSelectOverlay();
            hideFullscreenMapOverlay();
            // 标记为已跳过选择流程
            window.skipCharacterLocationSelection = true;

            // 同时检查localStorage中是否有已选角色，用于显示右侧栏
            const savedRole = localStorage.getItem('selected_role');
            if (savedRole) {
                try {
                    const role = JSON.parse(savedRole);
                    if (role && role.code) {
                        selectedCharacter = {
                            name: role.name || role.nickname,
                            nickname: role.nickname || role.name,
                            code: role.code,
                            icon: role.avatar || './frontend/assets/images/default-icon.jpg'
                        };
                        window.selectedCharacterForMap = selectedCharacter;
                        console.log('[CharacterFirstFlow] 从localStorage恢复已选角色:', selectedCharacter.name);
                    }
                } catch (e) {
                    console.warn('[CharacterFirstFlow] 解析localStorage中的selected_role失败:', e);
                }
            }
            return;
        }

        // 监听 WebSocket 消息以获取角色和地图数据
        window.addEventListener('websocket-message', handleWebSocketMessage);

        // 绑定返回按钮
        if (backToCharacterSelectBtn) {
            backToCharacterSelectBtn.addEventListener('click', showCharacterSelectOverlay);
        }

        // 确保遮罩层显示
        showCharacterSelectOverlay();
    }

    // 处理 WebSocket 消息
    function handleWebSocketMessage(event) {
        const message = event.detail;

        if (message.type === 'initial_data') {
            console.log('[CharacterFirstFlow] 收到初始数据');

            // 存储角色数据
            if (message.data.characters && message.data.characters.length > 0) {
                allCharacters = message.data.characters;
                console.log('[CharacterFirstFlow] 更新角色数据，共', allCharacters.length, '个角色');

                // 如果在角色选择界面，刷新网格
                if (characterSelectOverlay && characterSelectOverlay.classList.contains('active')) {
                    renderCharacterSelectGrid();
                }

                // 如果已选择角色且全屏地图显示中，重新渲染地图头像
                if (selectedCharacter && fullscreenMapOverlay && fullscreenMapOverlay.classList.contains('active')) {
                    console.log('[CharacterFirstFlow] 全屏地图显示中，重新渲染角色头像');
                    renderFullscreenMap();
                }
            }

            // 存储地图数据
            if (message.data.map) {
                mapData = message.data.map;
            }
        }

        // 处理角色选择成功消息 - 此时后端已初始化位置，马上会收到带位置的 initial_data
        if (message.type === 'role_selected') {
            console.log('[CharacterFirstFlow] 角色选择成功:', message.data);
            // 显示全屏地图（initial_data 会紧随其后更新角色位置数据）
            showFullscreenMapOverlay();
        }

        // 处理角色移动成功消息
        if (message.type === 'character_moved') {
            console.log('[CharacterFirstFlow] 角色移动成功:', message.data.message);

            // 确保遮罩层已隐藏
            hideCharacterSelectOverlay();
            hideFullscreenMapOverlay();

            // 显示系统消息
            if (typeof window.addSystemMessage === 'function') {
                window.addSystemMessage(message.data.message);
            }
        }
    }

    // 显示角色选择遮罩层
    function showCharacterSelectOverlay() {
        if (!characterSelectOverlay) return;

        // 隐藏地图遮罩
        if (fullscreenMapOverlay) {
            fullscreenMapOverlay.classList.remove('active');
            fullscreenMapOverlay.setAttribute('aria-hidden', 'true');
        }

        // 显示角色选择遮罩
        characterSelectOverlay.classList.add('active');
        characterSelectOverlay.setAttribute('aria-hidden', 'false');

        // 重置选中的角色
        selectedCharacter = null;

        // 如果已有角色数据，渲染网格
        if (allCharacters.length > 0) {
            renderCharacterSelectGrid();
        }
    }

    // 隐藏角色选择遮罩层
    function hideCharacterSelectOverlay() {
        if (!characterSelectOverlay) return;

        characterSelectOverlay.classList.remove('active');
        characterSelectOverlay.setAttribute('aria-hidden', 'true');
    }

    // 显示全屏地图遮罩层
    function showFullscreenMapOverlay() {
        if (!fullscreenMapOverlay) return;

        // 隐藏角色选择遮罩
        hideCharacterSelectOverlay();

        // 更新标题
        if (mapOverlayTitle && selectedCharacter) {
            const charName = selectedCharacter.name || selectedCharacter.nickname || '角色';
            mapOverlayTitle.textContent = `选择目的地`;
            if (mapOverlaySubtitle) {
                mapOverlaySubtitle.textContent = `点击地图上的地点，让 ${charName} 前往`;
            }
        }

        // 显示地图遮罩
        fullscreenMapOverlay.classList.add('active');
        fullscreenMapOverlay.setAttribute('aria-hidden', 'false');

        // 渲染全屏地图
        renderFullscreenMap();
    }

    // 渲染角色选择网格
    function renderCharacterSelectGrid() {
        if (!characterSelectGrid) return;

        // 清空网格
        characterSelectGrid.innerHTML = '';

        if (allCharacters.length === 0) {
            characterSelectGrid.innerHTML = `
                <div class="loading-placeholder">
                    <div class="loading-spinner"></div>
                    <p>正在加载角色...</p>
                </div>
            `;
            return;
        }

        // 创建角色卡片
        allCharacters.forEach((character, index) => {
            const card = createCharacterCard(character, index);
            characterSelectGrid.appendChild(card);
        });
    }

    // 创建角色选择卡片
    function createCharacterCard(character, index) {
        const card = document.createElement('div');
        card.className = 'character-select-card';
        card.dataset.index = index;

        const name = character.name || character.nickname || 'Unknown';
        const description = character.description || character.brief || '';
        const icon = character.icon || './frontend/assets/images/default-icon.jpg';
        const location = character.location || '';

        card.innerHTML = `
            <div class="avatar">
                <img src="${icon}" alt="${name}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>';">
            </div>
            <div class="name">${name}</div>
            ${description ? `<div class="description">${description}</div>` : ''}
            ${location ? `<div class="location"><i class="fas fa-map-marker-alt"></i> ${location}</div>` : ''}
        `;

        // 点击事件
        card.addEventListener('click', () => handleCharacterSelection(character, card));

        return card;
    }

    // 处理角色选择
    function handleCharacterSelection(character, cardElement) {
        console.log('[CharacterFirstFlow] 选择了角色:', character.name || character.nickname);

        // 存储选中的角色
        selectedCharacter = character;
        window.selectedCharacterForMap = character;

        // 向服务器发送角色选择消息
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({
                type: 'select_role',
                role_name: character.name || character.nickname
            }));
        }

        // 不在这里立即显示地图，等待 role_selected 消息确认后端已初始化位置
        // 标记为等待状态，在 role_selected 消息回调中显示地图
        console.log('[CharacterFirstFlow] 等待后端确认角色选择并初始化位置...');
    }

    // 渲染全屏地图
    function renderFullscreenMap() {
        if (!fullscreenMapContainer) return;

        // 清空容器
        fullscreenMapContainer.innerHTML = '';

        // 获取容器尺寸
        const width = fullscreenMapContainer.clientWidth;
        const height = fullscreenMapContainer.clientHeight;

        if (width === 0 || height === 0) {
            // 容器尚未显示，延迟渲染
            setTimeout(renderFullscreenMap, 100);
            return;
        }

        // 创建 SVG
        const svg = d3.select(fullscreenMapContainer)
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .style("display", "block");

        // 创建缩放行为
        const zoom = d3.zoom()
            .scaleExtent([0.3, 5])
            .on("zoom", (event) => {
                mainGroup.attr("transform", event.transform);
            });

        svg.call(zoom);

        // 创建主容器
        const mainGroup = svg.append("g").attr("class", "main-zoom-group");

        // 加载背景图
        const bgImage = mainGroup.append("image")
            .attr("class", "map-background")
            .attr("xlink:href", "./frontend/assets/images/universal-map-bg.png")
            .attr("width", width * 4)
            .attr("height", height * 4)
            .attr("x", -width * 1.5)
            .attr("y", -height * 1.5)
            .attr("preserveAspectRatio", "xMidYMid slice")
            .style("opacity", 0.7);

        // 节点容器
        const nodeContainer = mainGroup.append("g").attr("class", "nodes-container");

        // 准备数据
        if (!mapData || !mapData.places || mapData.places.length === 0) {
            console.warn('[CharacterFirstFlow] 没有地图数据');
            return;
        }

        const nodes = mapData.places.map(place => ({ id: place }));
        const links = mapData.distances ? mapData.distances.map(d => ({
            source: d.source,
            target: d.target,
            distance: d.distance
        })) : [];

        // 创建力导向图
        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(d => (d.distance || 50) * 10))
            .force("charge", d3.forceManyBody().strength(-3000))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(80));

        // 创建连线
        const link = nodeContainer.append("g")
            .selectAll("line")
            .data(links)
            .enter()
            .append("line")
            .attr("class", "link")
            .style("stroke", "#8d6e63")
            .style("stroke-opacity", 0.35)
            .style("stroke-width", 2)
            .style("stroke-dasharray", "6, 4");

        // 创建节点组
        const node = nodeContainer.append("g")
            .selectAll(".location-node")
            .data(nodes)
            .enter()
            .append("g")
            .attr("class", "location-node")
            .style("cursor", "pointer")
            .call(d3.drag()
                .on("start", (event, d) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on("drag", (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on("end", (event, d) => {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }));

        // 添加地点圆形
        node.append("circle")
            .attr("r", 25)
            .style("fill", "#fff9f0")
            .style("stroke", "#8b4513")
            .style("stroke-width", 3)
            .style("filter", "drop-shadow(0 4px 8px rgba(0,0,0,0.15))");

        // 添加地点名称
        node.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "45px")
            .style("font-family", "'Noto Serif SC', serif")
            .style("font-size", "14px")
            .style("font-weight", "600")
            .style("fill", "#3e2723")
            .style("text-shadow", "0 0 6px #fff, 0 0 6px #fff, 0 0 6px #fff")
            .text(d => d.id);

        // 添加地点上的角色头像
        addCharacterAvatarsToNodes(node, nodes);

        // 点击地点事件
        node.on("click", (event, d) => {
            event.stopPropagation();
            handleLocationSelection(d.id);
        });

        // 鼠标悬停效果
        node.on("mouseenter", function (event, d) {
            d3.select(this).select("circle")
                .transition()
                .duration(200)
                .attr("r", 30)
                .style("stroke", "#d84315")
                .style("stroke-width", 4);
        }).on("mouseleave", function (event, d) {
            d3.select(this).select("circle")
                .transition()
                .duration(200)
                .attr("r", 25)
                .style("stroke", "#8b4513")
                .style("stroke-width", 3);
        });

        // 更新力导向图
        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node.attr("transform", d => `translate(${d.x},${d.y})`);
        });

        // 渲染图例
        renderMapLegend();
    }

    // 在节点上添加角色头像
    function addCharacterAvatarsToNodes(nodeSelection, nodes) {
        // 创建位置到角色的映射
        const locationCharacterMap = {};
        allCharacters.forEach(char => {
            const loc = char.location || '';
            if (loc) {
                if (!locationCharacterMap[loc]) {
                    locationCharacterMap[loc] = [];
                }
                locationCharacterMap[loc].push(char);
            }
        });

        // 为每个节点添加角色头像
        nodeSelection.each(function (d) {
            const nodeGroup = d3.select(this);
            const chars = locationCharacterMap[d.id] || [];

            if (chars.length === 0) return;

            // 计算头像位置（围绕节点排列）
            const avatarRadius = 16;
            const nodeRadius = 25;
            const angleStep = (2 * Math.PI) / Math.max(chars.length, 4);

            chars.slice(0, 6).forEach((char, i) => { // 最多显示6个
                const angle = -Math.PI / 2 + i * angleStep;
                const x = (nodeRadius + avatarRadius + 5) * Math.cos(angle);
                const y = (nodeRadius + avatarRadius + 5) * Math.sin(angle);

                const avatarGroup = nodeGroup.append("g")
                    .attr("class", "character-avatar-group")
                    .attr("transform", `translate(${x}, ${y})`);

                // 头像背景圆
                avatarGroup.append("circle")
                    .attr("r", avatarRadius)
                    .style("fill", "#8b4513")
                    .style("stroke", "#faf8f3")
                    .style("stroke-width", 2);

                // 头像图片
                const icon = char.icon || './frontend/assets/images/default-icon.jpg';
                avatarGroup.append("clipPath")
                    .attr("id", `clip-avatar-${d.id}-${i}`)
                    .append("circle")
                    .attr("r", avatarRadius - 2);

                avatarGroup.append("image")
                    .attr("xlink:href", icon)
                    .attr("width", avatarRadius * 2 - 4)
                    .attr("height", avatarRadius * 2 - 4)
                    .attr("x", -(avatarRadius - 2))
                    .attr("y", -(avatarRadius - 2))
                    .attr("clip-path", `url(#clip-avatar-${d.id}-${i})`)
                    .attr("preserveAspectRatio", "xMidYMid slice");

                // 标记当前选中的角色
                if (selectedCharacter &&
                    (char.name === selectedCharacter.name || char.nickname === selectedCharacter.nickname)) {
                    avatarGroup.append("circle")
                        .attr("r", avatarRadius + 3)
                        .style("fill", "none")
                        .style("stroke", "#d84315")
                        .style("stroke-width", 3)
                        .style("stroke-dasharray", "4, 2");
                }
            });

            // 如果有更多角色，显示数字
            if (chars.length > 6) {
                nodeGroup.append("text")
                    .attr("x", 0)
                    .attr("y", -nodeRadius - 10)
                    .attr("text-anchor", "middle")
                    .style("font-size", "12px")
                    .style("fill", "#6b4423")
                    .text(`+${chars.length - 6}`);
            }
        });
    }

    // 渲染地图图例
    function renderMapLegend() {
        if (!mapLegend) return;

        mapLegend.innerHTML = '<h4>在场角色</h4>';

        // 按位置分组
        const locationCharacterMap = {};
        allCharacters.forEach(char => {
            const loc = char.location || '未知位置';
            if (!locationCharacterMap[loc]) {
                locationCharacterMap[loc] = [];
            }
            locationCharacterMap[loc].push(char);
        });

        // 创建图例项
        Object.entries(locationCharacterMap).forEach(([location, chars]) => {
            chars.forEach(char => {
                const item = document.createElement('div');
                item.className = 'legend-item';
                const isSelected = selectedCharacter &&
                    (char.name === selectedCharacter.name || char.nickname === selectedCharacter.nickname);
                item.innerHTML = `
                    <div class="legend-avatar" ${isSelected ? 'style="border: 2px solid #d84315;"' : ''}>
                        <img src="${char.icon || './frontend/assets/images/default-icon.jpg'}" 
                             alt="${char.name || char.nickname}"
                             onerror="this.src='./frontend/assets/images/default-icon.jpg'">
                    </div>
                    <span>${char.name || char.nickname}${isSelected ? ' (你)' : ''}</span>
                `;
                mapLegend.appendChild(item);
            });
        });
    }

    // 处理地点选择
    function handleLocationSelection(locationName) {
        if (!selectedCharacter) {
            console.warn('[CharacterFirstFlow] 未选择角色');
            return;
        }

        const charName = selectedCharacter.name || selectedCharacter.nickname;
        console.log(`[CharacterFirstFlow] ${charName} 前往 ${locationName}`);

        // 发送移动消息到服务器
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({
                type: 'move_character',
                role_name: charName,
                target_location: locationName
            }));
        }

        // 隐藏地图遮罩，进入正常模式
        hideFullscreenMapOverlay();

        // 更新左侧栏显示已选角色
        if (typeof showSelectedCharacter === 'function') {
            showSelectedCharacter(selectedCharacter);
        }
    }

    // 隐藏全屏地图遮罩层
    function hideFullscreenMapOverlay() {
        if (!fullscreenMapOverlay) return;

        fullscreenMapOverlay.classList.remove('active');
        fullscreenMapOverlay.setAttribute('aria-hidden', 'true');
    }

    // 暴露 API 到全局
    window.CharacterFirstFlow = {
        init,
        showCharacterSelectOverlay,
        hideCharacterSelectOverlay,
        showFullscreenMapOverlay,
        hideFullscreenMapOverlay,
        getSelectedCharacter: () => selectedCharacter,
        getAllCharacters: () => allCharacters,
        setCharacters: (chars) => {
            allCharacters = chars;
            renderCharacterSelectGrid();
        },
        setMapData: (data) => {
            mapData = data;
        }
    };

    // DOM 加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
