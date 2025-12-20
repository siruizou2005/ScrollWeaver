// 世界地图页面脚本
console.log('world-view.js 脚本开始加载...');

// 全局错误处理
window.onerror = function(msg, url, line, col, error) {
    console.error('全局错误:', msg, 'at', url, ':', line);
    // alert('页面加载出错: ' + msg); // 开发调试时开启
    return false;
};

// 网格配置
const GRID_COLS = 24;
const GRID_ROWS = 12;
const TOTAL_CELLS = GRID_COLS * GRID_ROWS; // 288个格子

// 全局变量
let cellWidth = 0;
let cellHeight = 0;
let buildingsData = [];
let isSessionMode = false; // 是否为进入世界模式
let sessionId = null;
let scrollId = null;
let worldSource = ''; // 世界source（用于判断时间格式）
let buildingCharactersMap = {}; // 建筑物代码 -> 角色列表的映射

// 初始化地图
async function initWorldMap() {
    console.log('开始初始化地图...');
    try {
        const mapContainer = document.getElementById('mapContainer');
        const svg = document.getElementById('worldMap');
        
        if (!mapContainer || !svg) {
            console.error('地图容器或SVG元素未找到');
            return;
        }

        // 获取容器尺寸
        let containerWidth = mapContainer.clientWidth;
        let containerHeight = mapContainer.clientHeight;
        
        // 兜底尺寸：如果由于某种原因尺寸为0，使用窗口尺寸或默认比例
        if (containerWidth === 0 || containerHeight === 0) {
            console.warn('地图容器尺寸异常(0)，尝试使用视口尺寸兜底');
            containerWidth = window.innerWidth;
            containerHeight = window.innerHeight;
        }
        
        console.log(`初始化地图尺寸: ${containerWidth}x${containerHeight}`);
        
        // 设置SVG尺寸
        svg.setAttribute('width', containerWidth);
        svg.setAttribute('height', containerHeight);
        svg.setAttribute('viewBox', `0 0 ${containerWidth} ${containerHeight}`);

        // 计算每个格子的尺寸
        cellWidth = containerWidth / GRID_COLS;
        cellHeight = containerHeight / GRID_ROWS;

        // 先加载建筑物数据（需要在绘制网格前加载，以便网格能检测建筑物）
        await loadAndDrawBuildings(svg);
        
        // 加载背景图片（需要在获取scroll_id后）
        await loadBackgroundImage(svg, containerWidth, containerHeight);
        
        // 如果是session模式，加载时间显示（需要在获取worldSource后）
        if (isSessionMode) {
            loadTimeDisplay();
        }
        
        // 绘制网格线（隐藏但保留用于调试）
        drawGridLines(svg, containerWidth, containerHeight, cellWidth, cellHeight);
        
        // 绘制网格单元格（保留交互功能，会根据建筑物数据显示对应信息）
        // 注意：在session模式下，grid cells不应该阻止建筑物的点击事件
        drawGridCells(svg, containerWidth, containerHeight, cellWidth, cellHeight);
        
        // 绘制建筑物（透明多边形，仅用于交互）
        // 必须在grid cells之后绘制，这样建筑物在上层，可以接收点击事件
        drawBuildings(svg);
        
        // 如果是session模式，等待角色数据加载完成后绘制人物
        if (isSessionMode) {
            // 确保角色数据已加载
            await loadBuildingCharacters();
            drawCharacters(svg);
        }
        console.log('地图初始化成功');
    } catch (err) {
        console.error('地图初始化发生错误:', err);
    }
}

// 加载时间显示（随机模拟）
function loadTimeDisplay() {
    const timeText = document.getElementById('timeText');
    if (!timeText) return;
    
    let timeString = '';
    if (worldSource === 'A_Dream_in_Red_Mansions') {
        // 红楼梦：古代时辰格式
        const shichen = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', 
                        '午时', '未时', '申时', '酉时', '戌时', '亥时'];
        const randomShichen = shichen[Math.floor(Math.random() * shichen.length)];
        timeString = randomShichen;
    } else {
        // 其他世界：24小时格式
        const hour = Math.floor(Math.random() * 24);
        const minute = Math.floor(Math.random() * 60);
        timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }
    
    timeText.textContent = timeString;
}

// 加载建筑物位置的角色数据
async function loadBuildingCharacters() {
    if (!sessionId) {
        console.warn('未找到session_id，无法加载角色数据');
        return;
    }
    
    try {
        // 为每个建筑物使用模拟角色数据
        for (const building of buildingsData) {
            buildingCharactersMap[building.building_code] = getMockCharactersForBuilding(building.building_code);
        }
    } catch (error) {
        console.error('加载建筑物角色数据时出错:', error);
    }
}

// 获取建筑物的模拟角色数据（根据红楼梦刘姥姥进大观园路线）
function getMockCharactersForBuilding(buildingCode) {
    // 红楼梦角色分配（按照刘姥姥进大观园路线）
    const redMansionsCharacters = {
        'QinfangTing': [
            { role_code: 'JiaMu-zh', role_name: '贾母' },
            { role_code: 'liulaolao-zh', role_name: '刘姥姥' },
            { role_code: 'WangXifeng-zh', role_name: '王熙凤' }
        ],
        'XiaoxiangGuan': [
            { role_code: 'LinDaiyu-zh', role_name: '林黛玉' }
        ],
        'QiushuangZhai': [
            { role_code: 'LiWan-zh', role_name: '李纨' },
            { role_code: 'JiaMu-zh', role_name: '贾母' },
            { role_code: 'liulaolao-zh', role_name: '刘姥姥' }
        ],
        'HengwuYuan': [
            { role_code: 'XueBaochai-zh', role_name: '薛宝钗' }
        ],
        'OuxiangXie': [
            { role_code: 'JiaMu-zh', role_name: '贾母' },
            { role_code: 'liulaolao-zh', role_name: '刘姥姥' }
        ],
        'LongcuiAn': [
            { role_code: 'Miaoyu-zh', role_name: '妙玉' }
        ],
        'YihongYuan': [
            { role_code: 'JiaBaoyu-zh', role_name: '贾宝玉' }
        ]
    };
    
    if (worldSource === 'A_Dream_in_Red_Mansions' && redMansionsCharacters[buildingCode]) {
        return redMansionsCharacters[buildingCode];
    }
    
    // 其他世界：随机分配角色（这里需要根据实际角色列表来分配）
    // 暂时返回空数组，等后端API实现后再填充
    return [];
}

// 绘制人物（建筑物旁边圆形排列）
function drawCharacters(svg) {
    const charactersGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    charactersGroup.setAttribute('class', 'characters-group');
    
    buildingsData.forEach(building => {
        const characters = buildingCharactersMap[building.building_code] || [];
        if (characters.length === 0) return;
        
        // 计算建筑物中心位置
        const coords = building.coordinates;
        const convertCoords = (userX, userY) => {
            const svgX = (userX - 1) * cellWidth;
            const svgY = (GRID_ROWS - userY) * cellHeight;
            return { x: svgX, y: svgY };
        };
        
        const sw = convertCoords(coords.sw[0], coords.sw[1]);
        const se = convertCoords(coords.se[0], coords.se[1]);
        const ne = convertCoords(coords.ne[0], coords.ne[1]);
        const nw = convertCoords(coords.nw[0], coords.nw[1]);
        
        const centerX = (sw.x + se.x + ne.x + nw.x) / 4;
        const centerY = (sw.y + se.y + ne.y + nw.y) / 4;
        
        // 计算偏移位置（建筑物旁边）
        const offsetX = (se.x - sw.x) / 2 + 20; // 向右偏移
        const offsetY = 0;
        
        // 圆形排列人物
        const radius = Math.max(30, characters.length * 8); // 根据人数调整半径
        const angleStep = (2 * Math.PI) / characters.length;
        
        characters.forEach((char, index) => {
            const angle = index * angleStep;
            const x = centerX + offsetX + Math.cos(angle) * radius;
            const y = centerY + offsetY + Math.sin(angle) * radius;
            
            // 创建人物组
            const charGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            charGroup.setAttribute('class', 'character-marker');
            charGroup.setAttribute('data-role-code', char.role_code);
            charGroup.setAttribute('data-role-name', char.role_name);
            
            // 创建头像圆圈
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            circle.setAttribute('r', 15);
            circle.setAttribute('fill', '#fff');
            circle.setAttribute('stroke', '#8b4513');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('class', 'character-circle');
            
            // 创建头像图片
            const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '/frontend/assets/images/default-icon.jpg');
            image.setAttribute('href', '/frontend/assets/images/default-icon.jpg');
            image.setAttribute('x', x - 12);
            image.setAttribute('y', y - 12);
            image.setAttribute('width', 24);
            image.setAttribute('height', 24);
            image.setAttribute('clip-path', `circle(12px at ${x}px ${y}px)`);
            image.setAttribute('class', 'character-avatar');
            
            // 添加悬停事件显示人名（但不响应点击）
            let nameTooltip = null;
            const showName = (e) => {
                if (nameTooltip) {
                    nameTooltip.remove();
                }
                nameTooltip = document.createElement('div');
                nameTooltip.className = 'character-name-tooltip';
                nameTooltip.textContent = char.role_name;
                document.body.appendChild(nameTooltip);
                
                const rect = e.target.getBoundingClientRect();
                const tooltipRect = nameTooltip.getBoundingClientRect();
                const padding = 10;
                
                let left = rect.left + rect.width / 2;
                let top = rect.top - 10;
                let transformY = '-100%';

                // 如果上方空间不足，改为向下弹出
                if (rect.top - tooltipRect.height - padding < 0) {
                    top = rect.bottom + 10;
                    transformY = '0';
                }

                // 修正横向溢出
                const halfWidth = tooltipRect.width / 2;
                if (left - halfWidth < padding) {
                    left = halfWidth + padding;
                } else if (left + halfWidth > window.innerWidth - padding) {
                    left = window.innerWidth - halfWidth - padding;
                }

                nameTooltip.style.left = `${left}px`;
                nameTooltip.style.top = `${top}px`;
                nameTooltip.style.transform = `translate(-50%, ${transformY})`;
            };
            
            const hideName = () => {
                if (nameTooltip) {
                    nameTooltip.remove();
                    nameTooltip = null;
                }
            };
            
            // 只添加悬停事件，不添加点击事件
            circle.addEventListener('mouseenter', showName);
            circle.addEventListener('mouseleave', hideName);
            image.addEventListener('mouseenter', showName);
            image.addEventListener('mouseleave', hideName);
            
            // 确保点击时不会有任何反应
            circle.addEventListener('click', (e) => {
                e.stopPropagation();
                // 不执行任何操作
            });
            image.addEventListener('click', (e) => {
                e.stopPropagation();
                // 不执行任何操作
            });
            
            charGroup.appendChild(circle);
            charGroup.appendChild(image);
            charactersGroup.appendChild(charGroup);
        });
    });
    
    svg.appendChild(charactersGroup);
}

// 加载背景图片
async function loadBackgroundImage(svg, width, height) {
    try {
        // 获取scroll_id（可能是从session_id获取）
        let currentScrollId = scrollId;
        
        if (!currentScrollId && sessionId) {
            // 如果是session模式，尝试从session获取scroll_id
            // 测试模式：sessionId格式为 test_${scrollId}
            if (sessionId.startsWith('test_')) {
                currentScrollId = sessionId.replace('test_', '');
                console.log('从测试sessionId提取scrollId:', currentScrollId);
            } else {
                // 真实session模式：尝试从API获取
                try {
                    const sessionResponse = await fetch(`/api/world/${sessionId}/info`);
                    if (sessionResponse.ok) {
                        const sessionData = await sessionResponse.json();
                        currentScrollId = sessionData.scroll_id;
                        console.log('从session API获取scrollId:', currentScrollId);
                    }
                } catch (e) {
                    console.warn('获取session信息失败:', e);
                    // 如果API不存在，尝试从crossworld session获取
                    try {
                        const crossworldResponse = await fetch(`/api/crossworld/session/${sessionId}`);
                        if (crossworldResponse.ok) {
                            const crossworldData = await crossworldResponse.json();
                            currentScrollId = crossworldData.scroll_id;
                            console.log('从crossworld session获取scrollId:', currentScrollId);
                        }
                    } catch (e2) {
                        console.warn('获取crossworld session信息失败:', e2);
                    }
                }
            }
        }
        
        if (!currentScrollId) {
            console.warn('未找到scroll_id参数，无法加载背景图片');
            return;
        }

        // 获取书卷信息以确定背景图片
        let source = '';
        try {
            const response = await fetch(`/api/scroll/${currentScrollId}`);
            if (response.ok) {
                const scrollData = await response.json();
                source = scrollData.source || '';
                worldSource = source; // 保存source用于时间格式判断
                console.log('获取到的source:', source);
            } else {
                console.warn('获取书卷信息失败:', response.status);
                return;
            }
        } catch (error) {
            console.error('获取书卷信息时出错:', error);
            return;
        }
        
        // 根据source确定背景图片路径 - 从data/maps/{source}/background.png读取
        if (!source) {
            console.log('未找到source，不显示背景图片');
            return;
        }
        
        // 构建背景图片路径：data/maps/{source}/background.png
        const backgroundImageUrl = `/data/maps/${source}/background.png`;
        console.log('背景图片URL:', backgroundImageUrl);
        
        // 方法1: 使用CSS背景图片（更可靠）
        const mapContainer = document.getElementById('mapContainer');
        if (mapContainer) {
            // 先测试图片是否可以加载
            const testImg = new Image();
            testImg.onload = () => {
                console.log('背景图片加载成功，设置CSS背景');
                mapContainer.style.backgroundImage = `url(${backgroundImageUrl})`;
                mapContainer.style.backgroundSize = 'cover';
                mapContainer.style.backgroundPosition = 'center';
                mapContainer.style.backgroundRepeat = 'no-repeat';
                mapContainer.classList.add('has-background');
            };
            testImg.onerror = () => {
                console.log('背景图片不存在，使用默认背景:', backgroundImageUrl);
                // 图片不存在时，不设置背景，保持默认样式
                // 不添加SVG image元素，避免显示错误图片
            };
            testImg.src = backgroundImageUrl;
        }
    } catch (error) {
        console.error('加载背景图片时出错:', error);
    }
}

// 添加SVG背景图片（备选方法）
function addSVGBackgroundImage(svg, url, width, height) {
    const imageGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    imageGroup.setAttribute('class', 'background-image-group');
    
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
    image.setAttribute('href', url); // 现代浏览器
    image.setAttribute('width', width);
    image.setAttribute('height', height);
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    image.setAttribute('opacity', '1');
    image.setAttribute('class', 'map-background-image');
    
    imageGroup.appendChild(image);
    
    // 插入到SVG的最前面（最底层）
    if (svg.firstChild) {
        svg.insertBefore(imageGroup, svg.firstChild);
    } else {
        svg.appendChild(imageGroup);
    }
}

// 加载建筑物数据并绘制
async function loadAndDrawBuildings(svg) {
    try {
        // 获取scroll_id（可能是从session_id获取）
        let currentScrollId = scrollId;
        
        if (!currentScrollId && sessionId) {
            // 如果是session模式，尝试从session获取scroll_id
            // 测试模式：sessionId格式为 test_${scrollId}
            if (sessionId.startsWith('test_')) {
                currentScrollId = sessionId.replace('test_', '');
                scrollId = currentScrollId; // 保存到全局变量
                console.log('从测试sessionId提取scrollId:', currentScrollId);
            } else {
                // 真实session模式：尝试从API获取
                try {
                    const sessionResponse = await fetch(`/api/world/${sessionId}/info`);
                    if (sessionResponse.ok) {
                        const sessionData = await sessionResponse.json();
                        currentScrollId = sessionData.scroll_id;
                        scrollId = currentScrollId; // 保存到全局变量
                        console.log('从session API获取scrollId:', currentScrollId);
                    }
                } catch (e) {
                    console.warn('获取session信息失败:', e);
                    // 如果API不存在，尝试从crossworld session获取
                    try {
                        const crossworldResponse = await fetch(`/api/crossworld/session/${sessionId}`);
                        if (crossworldResponse.ok) {
                            const crossworldData = await crossworldResponse.json();
                            currentScrollId = crossworldData.scroll_id;
                            scrollId = currentScrollId; // 保存到全局变量
                            console.log('从crossworld session获取scrollId:', currentScrollId);
                        }
                    } catch (e2) {
                        console.warn('获取crossworld session信息失败:', e2);
                    }
                }
            }
        }
        
        if (!currentScrollId) {
            console.warn('未找到scroll_id参数');
            return;
        }

        // 从API获取建筑物数据
        const response = await fetch(`/api/scrolls/${currentScrollId}/map-buildings`);
        if (!response.ok) {
            console.warn('获取建筑物数据失败:', response.statusText);
            return;
        }

        const data = await response.json();
        buildingsData = data.buildings || [];
        
        // 如果是session模式，加载建筑物位置的角色数据（在setupSessionMode中已经调用，这里不需要重复调用）
        
        // 不在这里绘制建筑物，让initWorldMap统一处理
    } catch (error) {
        console.error('加载建筑物数据时出错:', error);
    }
}

// 绘制建筑物
function drawBuildings(svg) {
    const buildingsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    buildingsGroup.setAttribute('class', 'buildings-group');

    buildingsData.forEach(building => {
        const buildingElement = createBuildingElement(building);
        buildingsGroup.appendChild(buildingElement);
    });

    svg.appendChild(buildingsGroup);
}

// 创建建筑物元素
function createBuildingElement(building) {
    const { coordinates, building_name, description, color, icon } = building;
    
    // 坐标转换：从用户坐标系（左下角为(1,1)）转换为SVG坐标系（左上角为(0,0)）
    const convertCoords = (userX, userY) => {
        const svgX = (userX - 1) * cellWidth;
        const svgY = (GRID_ROWS - userY) * cellHeight;
        return { x: svgX, y: svgY };
    };

    // 获取四个顶点的SVG坐标（按逆时针顺序：SW -> SE -> NE -> NW）
    const sw = convertCoords(coordinates.sw[0], coordinates.sw[1]);
    const se = convertCoords(coordinates.se[0], coordinates.se[1]);
    const ne = convertCoords(coordinates.ne[0], coordinates.ne[1]);
    const nw = convertCoords(coordinates.nw[0], coordinates.nw[1]);

    // 创建建筑物组
    const buildingGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    buildingGroup.setAttribute('class', 'building');
    buildingGroup.setAttribute('data-building-code', building.building_code);
    buildingGroup.setAttribute('data-building-name', building_name);

    // 创建建筑物多边形（完全透明，仅用于交互）
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const points = [
        `${sw.x},${sw.y}`,
        `${se.x},${se.y}`,
        `${ne.x},${ne.y}`,
        `${nw.x},${nw.y}`
    ].join(' ');
    
    polygon.setAttribute('points', points);
    polygon.setAttribute('fill', 'transparent');
    polygon.setAttribute('fill-opacity', '0');
    polygon.setAttribute('stroke', 'transparent');
    polygon.setAttribute('stroke-width', '0');
    polygon.setAttribute('class', 'building-polygon');
    polygon.setAttribute('data-building-name', building_name);
    polygon.setAttribute('data-building-description', description);
    
    // 添加悬停效果
    polygon.addEventListener('mouseenter', (e) => {
        showBuildingTooltip(e, building_name, description);
    });
    
    polygon.addEventListener('mouseleave', () => {
        hideBuildingTooltip();
    });

    // 添加点击事件
    polygon.addEventListener('click', (e) => {
        e.stopPropagation(); // 阻止事件冒泡
        console.log('建筑物polygon被点击:', building.building_name, 'isSessionMode:', isSessionMode);
        handleBuildingClick(building);
    });

    buildingGroup.appendChild(polygon);

    // 不显示图标和名称（已隐藏）

    return buildingGroup;
}

// 处理建筑物点击
function handleBuildingClick(building) {
    console.log('handleBuildingClick被调用:', building.building_name, 'isSessionMode:', isSessionMode);
    
    if (isSessionMode) {
        // 进入世界模式：显示建筑物卡片（人物列表和操作按钮）
        console.log('准备显示建筑物模态框');
        showBuildingModal(building);
    } else {
        // 查看模式：显示建筑物介绍（已有功能）
        // 这个功能已经在showBuildingTooltip中实现了
        console.log('查看模式，不显示模态框');
    }
}

// 显示建筑物模态框
function showBuildingModal(building) {
    console.log('showBuildingModal被调用:', building.building_name);
    const modal = document.getElementById('buildingModal');
    const title = document.getElementById('buildingModalTitle');
    const charactersList = document.getElementById('buildingCharactersList');
    const actionsSection = document.getElementById('actionsSection');
    
    if (!modal || !title || !charactersList || !actionsSection) {
        console.error('建筑物模态框元素未找到', {
            modal: !!modal,
            title: !!title,
            charactersList: !!charactersList,
            actionsSection: !!actionsSection
        });
        return;
    }
    
    console.log('模态框元素找到，准备显示');
    
    // 设置标题
    title.textContent = building.building_name || '建筑物';
    
    // 获取该建筑物位置的角色列表
    const characters = buildingCharactersMap[building.building_code] || [];
    console.log('建筑物角色列表:', building.building_code, characters);
    
    // 清空并填充人物列表
    charactersList.innerHTML = '';
    if (characters.length === 0) {
        charactersList.innerHTML = '<div class="no-characters">此处暂无人物</div>';
    } else {
        characters.forEach(char => {
            const charItem = document.createElement('div');
            charItem.className = 'character-item';
            charItem.innerHTML = `
                <div class="character-avatar">
                    <img src="/frontend/assets/images/default-icon.jpg" alt="${char.role_name || char.name || ''}" 
                         onerror="this.src='/frontend/assets/images/default-icon.jpg'">
                </div>
                <div class="character-name">${char.role_name || char.name || '未知角色'}</div>
            `;
            charactersList.appendChild(charItem);
        });
    }
    
    // 清空并填充操作按钮
    actionsSection.innerHTML = '';
    if (characters.length === 0) {
        // 没有人物，不显示操作按钮
    } else if (characters.length === 1) {
        // 只有一个人，显示私语按钮
        const chatBtn = document.createElement('button');
        chatBtn.className = 'action-btn chat-btn';
        chatBtn.innerHTML = '<i class="fas fa-comments"></i> 私语';
        chatBtn.addEventListener('click', () => {
            startChat(characters[0].role_code);
        });
        actionsSection.appendChild(chatBtn);
    } else {
        // 多个人，显示私语和群聊按钮
        const chatBtn = document.createElement('button');
        chatBtn.className = 'action-btn chat-btn';
        chatBtn.innerHTML = '<i class="fas fa-comments"></i> 私语';
        chatBtn.addEventListener('click', () => {
            showCharacterSelectModal(characters);
        });
        actionsSection.appendChild(chatBtn);
        
        const groupBtn = document.createElement('button');
        groupBtn.className = 'action-btn group-btn';
        groupBtn.innerHTML = '<i class="fas fa-users"></i> 群聊';
        groupBtn.addEventListener('click', () => {
            startGroupChat(characters, building.building_code);
        });
        actionsSection.appendChild(groupBtn);
    }
    
    // 显示模态框
    modal.style.display = 'flex';
}

// 隐藏建筑物模态框
function hideBuildingModal() {
    const modal = document.getElementById('buildingModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 显示角色选择模态框
function showCharacterSelectModal(characters) {
    const modal = document.getElementById('characterSelectModal');
    const list = document.getElementById('characterSelectList');
    
    if (!modal || !list) {
        console.error('角色选择模态框元素未找到');
        return;
    }
    
    // 先关闭建筑物模态框
    hideBuildingModal();
    
    // 清空并填充角色列表
    list.innerHTML = '';
    characters.forEach(char => {
        const charItem = document.createElement('div');
        charItem.className = 'character-select-item';
        const roleName = char.role_name || char.name || '未知角色';
        const roleCode = char.role_code || char.code;
        charItem.innerHTML = `
            <div class="character-avatar">
                <img src="/frontend/assets/images/default-icon.jpg" alt="${roleName}" 
                     onerror="this.src='/frontend/assets/images/default-icon.jpg'">
            </div>
            <div class="character-name">${roleName}</div>
        `;
        charItem.addEventListener('click', () => {
            if (roleCode) {
                startChat(roleCode);
                hideCharacterSelectModal();
            } else {
                console.error('角色代码不存在:', char);
            }
        });
        list.appendChild(charItem);
    });
    
    // 显示模态框
    modal.style.display = 'flex';
}

// 隐藏角色选择模态框
function hideCharacterSelectModal() {
    const modal = document.getElementById('characterSelectModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 开始私语
function startChat(roleCode) {
    if (!sessionId || !scrollId) {
        console.error('缺少必要参数');
        return;
    }
    
    // 跳转到私语页面
    window.location.href = `/frontend/pages/chat.html?scroll_id=${scrollId}&role_code=${roleCode}`;
}

// 开始群聊
function startGroupChat(characters, buildingCode) {
    if (!sessionId || !scrollId) {
        console.error('缺少必要参数');
        return;
    }
    
    // 获取角色代码列表
    const roleCodes = characters.map(char => char.role_code || char.code).join(',');
    
    // 跳转到群聊页面（入卷玩法）
    // 直接进入游戏页面，传递建筑物代码和角色列表
    // URL格式：/game?scroll_id=xxx&mode=story&location=xxx&roles=xxx,xxx,xxx
    const params = new URLSearchParams({
        scroll_id: scrollId,
        mode: 'story',
        location: buildingCode || '',
        roles: roleCodes
    });
    
    window.location.href = `/game?${params.toString()}`;
}

// 显示建筑物提示
let tooltipElement = null;
function showBuildingTooltip(event, buildingName, description) {
    // 移除旧的提示框
    if (tooltipElement) {
        tooltipElement.remove();
    }

    // 创建提示框
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'building-tooltip';
    tooltipElement.innerHTML = `
        <div class="tooltip-title">${buildingName}</div>
        <div class="tooltip-description">${description}</div>
    `;
    document.body.appendChild(tooltipElement);

    // 智能定位逻辑：检测视口边界
    const rect = event.target.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const padding = 15;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let left = rect.left + rect.width / 2;
    let top = rect.top - 10;
    let transformY = '-100%'; // 默认向上弹出

    // 1. 处理垂直方向溢出：如果上方空间不足，改为向下弹出
    if (rect.top - tooltipRect.height - padding < 0) {
        top = rect.bottom + 10;
        transformY = '0';
    }

    // 2. 处理水平方向溢出：确保提示框不超出屏幕左右边缘
    const halfWidth = tooltipRect.width / 2;
    if (left - halfWidth < padding) {
        // 太靠左
        left = halfWidth + padding;
    } else if (left + halfWidth > windowWidth - padding) {
        // 太靠右
        left = windowWidth - halfWidth - padding;
    }

    // 3. 处理玩家状态栏遮挡 (左上角区域)
    // 玩家状态栏大约宽260px，高200px
    if (left - halfWidth < 300 && top < 250 && transformY === '-100%') {
        // 如果在左上角区域且向上弹出可能被遮挡，尝试向下弹出
        top = rect.bottom + 10;
        transformY = '0';
    }

    tooltipElement.style.left = `${left}px`;
    tooltipElement.style.top = `${top}px`;
    tooltipElement.style.transform = `translate(-50%, ${transformY})`;
}

// 隐藏建筑物提示
function hideBuildingTooltip() {
    if (tooltipElement) {
        tooltipElement.remove();
        tooltipElement = null;
    }
}

// 绘制网格线
function drawGridLines(svg, width, height, cellWidth, cellHeight) {
    const gridLinesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gridLinesGroup.setAttribute('class', 'grid-lines');

    // 绘制垂直线
    for (let col = 0; col <= GRID_COLS; col++) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const x = col * cellWidth;
        line.setAttribute('x1', x);
        line.setAttribute('y1', 0);
        line.setAttribute('x2', x);
        line.setAttribute('y2', height);
        line.setAttribute('class', 'grid-line');
        gridLinesGroup.appendChild(line);
    }

    // 绘制水平线
    for (let row = 0; row <= GRID_ROWS; row++) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const y = row * cellHeight;
        line.setAttribute('x1', 0);
        line.setAttribute('y1', y);
        line.setAttribute('x2', width);
        line.setAttribute('y2', y);
        line.setAttribute('class', 'grid-line');
        gridLinesGroup.appendChild(line);
    }

    svg.appendChild(gridLinesGroup);
}

// 绘制网格单元格
function drawGridCells(svg, width, height, cellWidth, cellHeight) {
    const cellsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cellsGroup.setAttribute('class', 'grid-cells');

    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const cell = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const x = col * cellWidth;
            const y = row * cellHeight;
            
            cell.setAttribute('x', x);
            cell.setAttribute('y', y);
            cell.setAttribute('width', cellWidth);
            cell.setAttribute('height', cellHeight);
            cell.setAttribute('class', 'grid-cell');
            cell.setAttribute('data-row', row);
            cell.setAttribute('data-col', col);
            
            // 检查这个单元格是否属于某个建筑物
            const building = findBuildingAtCell(row, col);
            if (building) {
                // 如果属于建筑物，在session模式下不添加事件（让建筑物polygon处理）
                // 在查看模式下，grid cell可以显示tooltip
                if (!isSessionMode) {
                    cell.addEventListener('mouseenter', (e) => {
                        showBuildingTooltip(e, building.building_name, building.description);
                    });
                    cell.addEventListener('mouseleave', () => {
                        hideBuildingTooltip();
                    });
                    cell.addEventListener('click', () => {
                        handleBuildingClick(building);
                    });
                } else {
                    // session模式下，grid cell不阻止事件，让建筑物polygon处理
                    cell.style.pointerEvents = 'none';
                }
            } else {
                // 普通单元格不显示任何提示
                // 在session模式下，也不响应点击
                if (isSessionMode) {
                    cell.style.pointerEvents = 'none';
                }
            }

            cellsGroup.appendChild(cell);
        }
    }

    svg.appendChild(cellsGroup);
}

// 查找指定单元格所属的建筑物
function findBuildingAtCell(row, col) {
    // 将SVG坐标转换为用户坐标
    const userRow = GRID_ROWS - row; // Y轴反转
    const userCol = col + 1; // X轴从1开始
    
    for (const building of buildingsData) {
        const coords = building.coordinates;
        const minX = Math.min(coords.sw[0], coords.se[0], coords.ne[0], coords.nw[0]);
        const maxX = Math.max(coords.sw[0], coords.se[0], coords.ne[0], coords.nw[0]);
        const minY = Math.min(coords.sw[1], coords.se[1], coords.ne[1], coords.nw[1]);
        const maxY = Math.max(coords.sw[1], coords.se[1], coords.ne[1], coords.nw[1]);
        
        if (userCol >= minX && userCol <= maxX && userRow >= minY && userRow <= maxY) {
            return building;
        }
    }
    return null;
}

// 处理单元格点击
function handleCellClick(row, col) {
    console.log(`点击了第 ${row + 1} 行，第 ${col + 1} 列的格子`);
    // 这里可以添加点击后的逻辑，比如显示地点信息等
}

// 显示单元格提示
let cellTooltipElement = null;
function showCellTooltip(event, row, col) {
    // 移除旧的提示框
    if (cellTooltipElement) {
        cellTooltipElement.remove();
    }

    // 创建提示框
    cellTooltipElement = document.createElement('div');
    cellTooltipElement.className = 'cell-tooltip';
    cellTooltipElement.innerHTML = `
        <div class="tooltip-content">第 ${row + 1} 行，第 ${col + 1} 列</div>
    `;
    document.body.appendChild(cellTooltipElement);

    // 定位提示框
    const rect = event.target.getBoundingClientRect();
    const tooltipRect = cellTooltipElement.getBoundingClientRect();
    const padding = 10;
    
    let left = rect.left + rect.width / 2;
    let top = rect.top - 10;
    let transformY = '-100%';

    // 如果上方空间不足，改为向下弹出
    if (rect.top - tooltipRect.height - padding < 0) {
        top = rect.bottom + 10;
        transformY = '0';
    }

    // 修正横向溢出
    const halfWidth = tooltipRect.width / 2;
    if (left - halfWidth < padding) {
        left = halfWidth + padding;
    } else if (left + halfWidth > window.innerWidth - padding) {
        left = window.innerWidth - halfWidth - padding;
    }

    cellTooltipElement.style.left = `${left}px`;
    cellTooltipElement.style.top = `${top}px`;
    cellTooltipElement.style.transform = `translate(-50%, ${transformY})`;
    
    // 单元格高亮
    const cell = event.target;
    cell.style.fill = 'rgba(139, 111, 71, 0.2)';
}

// 隐藏单元格提示
function hideCellTooltip() {
    // 移除提示框
    if (cellTooltipElement) {
        cellTooltipElement.remove();
        cellTooltipElement = null;
    }
    
    // 恢复单元格样式
    const cells = document.querySelectorAll('.grid-cell');
    cells.forEach(cell => {
        cell.style.fill = 'transparent';
    });
}

// 返回按钮事件
function bindEventListeners() {
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (scrollId) {
                window.location.href = `/frontend/pages/intro.html?scroll_id=${scrollId}`;
            } else {
                window.history.back();
            }
        });
    }
    
    // 建筑物模态框关闭
    const modalClose = document.getElementById('modalClose');
    const modalOverlay = document.getElementById('modalOverlay');
    if (modalClose) {
        modalClose.addEventListener('click', hideBuildingModal);
    }
    if (modalOverlay) {
        modalOverlay.addEventListener('click', hideBuildingModal);
    }
    
    // 角色选择模态框关闭
    const characterSelectClose = document.getElementById('characterSelectClose');
    const characterSelectOverlay = document.getElementById('characterSelectOverlay');
    if (characterSelectClose) {
        characterSelectClose.addEventListener('click', hideCharacterSelectModal);
    }
    if (characterSelectOverlay) {
        characterSelectOverlay.addEventListener('click', hideCharacterSelectModal);
    }
}

// 窗口大小改变时重新绘制地图
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
        const svg = document.getElementById('worldMap');
        if (svg) {
            // 清空SVG内容
            svg.innerHTML = '';
            // 重新初始化地图
            await initWorldMap();
        }
    }, 250);
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 检测页面模式
    const urlParams = new URLSearchParams(window.location.search);
    sessionId = urlParams.get('session_id');
    scrollId = urlParams.get('scroll_id');
    
    if (sessionId) {
        // 进入世界模式
        isSessionMode = true;
        setupSessionMode();
    } else if (scrollId) {
        // 查看模式
        isSessionMode = false;
        setupViewMode();
    } else {
        console.error('缺少必要参数：scroll_id 或 session_id');
        return;
    }
    
    await initWorldMap();
    bindEventListeners();
});

// 设置进入世界模式
function setupSessionMode() {
    console.log('正在设置会话模式 UI...');
    try {
        // 隐藏顶部导航
        const header = document.getElementById('worldViewHeader');
        if (header) {
            header.style.display = 'none';
        }
        
        // 显示时间显示
        const timeDisplay = document.getElementById('timeDisplay');
        if (timeDisplay) {
            timeDisplay.style.display = 'block';
        }

        // 显示玩家状态栏
        const playerStatusBar = document.getElementById('playerStatusBar');
        if (playerStatusBar) {
            console.log('找到玩家状态栏元素，准备初始化');
            playerStatusBar.style.display = 'flex';
            // 不阻塞主流程
            setTimeout(() => loadPlayerStatus(), 0);
        }
        
        // 设置全屏样式
        const container = document.getElementById('worldViewContainer');
        if (container) {
            container.classList.add('session-mode');
        }
        console.log('会话模式 UI 设置完成');
    } catch (err) {
        console.error('设置会话模式失败:', err);
    }
}

// 加载玩家状态
async function loadPlayerStatus() {
    try {
        console.log('开始加载玩家状态...');
        // 尝试从localStorage获取已选角色信息
        const savedRole = localStorage.getItem('selected_role');
        const playerNameEl = document.getElementById('playerName');
        const playerIdentityEl = document.getElementById('playerIdentity');
        const playerAvatarEl = document.getElementById('playerAvatar');

        if (savedRole && savedRole !== 'undefined' && savedRole !== 'null') {
            try {
                const role = JSON.parse(savedRole);
                if (playerNameEl) playerNameEl.textContent = role.name || role.nickname || '穿越者';
                if (playerIdentityEl) playerIdentityEl.textContent = '已魂穿';
                if (playerAvatarEl && role.avatar) {
                    playerAvatarEl.innerHTML = `<img src="${role.avatar}" alt="玩家头像" onerror="this.src='../assets/images/default-icon.jpg'">`;
                }
            } catch (parseError) {
                console.warn('解析localStorage中的selected_role失败:', parseError);
                if (playerNameEl) playerNameEl.textContent = '测试玩家';
            }
        } else {
            if (playerNameEl) playerNameEl.textContent = '测试玩家';
            if (playerIdentityEl) playerIdentityEl.textContent = '临时访客';
        }

        // 模拟养成数值（实际可从后端获取）
        updateStat('talent', Math.floor(Math.random() * 40) + 40); // 40-80
        updateStat('bond', Math.floor(Math.random() * 30) + 20);   // 20-50
        updateStat('energy', 100);
        console.log('玩家状态加载完成');
    } catch (e) {
        console.error('加载玩家状态发生严重错误:', e);
    }
}

// 更新养成数值UI
function updateStat(type, value) {
    const bar = document.getElementById(`${type}Bar`);
    const val = document.getElementById(`${type}Val`);
    if (bar) bar.style.width = `${value}%`;
    if (val) val.textContent = value;
}

// 设置查看模式
function setupViewMode() {
    // 显示顶部导航
    const header = document.getElementById('worldViewHeader');
    if (header) {
        header.style.display = 'flex';
    }
    
    // 隐藏时间显示
    const timeDisplay = document.getElementById('timeDisplay');
    if (timeDisplay) {
        timeDisplay.style.display = 'none';
    }
}

