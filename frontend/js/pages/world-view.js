// 世界地图页面脚本
console.log('world-view.js 脚本开始加载...');

// 全局错误处理
window.onerror = function (msg, url, line, col, error) {
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
const token = localStorage.getItem('token'); // 获取登录令牌
let socket = null; // WebSocket 连接
let messageHistory = []; // 存储收到的消息

// 通用 fetch 包装器，自动添加认证头
async function authenticatedFetch(url, options = {}) {
    if (token) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
    }
    return fetch(url, options);
}

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

        // 设置 SVG 定义（如裁剪路径）
        setupSvgDefs(svg);

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

// 设置 SVG 定义（如裁剪路径）
function setupSvgDefs(svg) {
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.appendChild(defs);
    }

    // 创建头像裁剪路径
    if (!defs.querySelector('#avatarClip')) {
        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', 'avatarClip');
        clipPath.setAttribute('clipPathUnits', 'objectBoundingBox');

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '0.5');
        circle.setAttribute('cy', '0.5');
        circle.setAttribute('r', '0.5');

        clipPath.appendChild(circle);
        defs.appendChild(clipPath);
    }
}

// 加载时间显示（随机模拟）
function loadTimeDisplay() {
    const timeText = document.getElementById('timeText');
    if (!timeText) return;

    let timeString = '';
    const ancientWorlds = ['A_Dream_in_Red_Mansions', 'Romance_of_the_Three_Kingdoms', 'Romance_of_the_Three_Kingdoms_Longzhong'];
    if (ancientWorlds.includes(worldSource)) {
        // 古代时辰格式
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
        // 用于跟踪每个角色已经分配到的地点
        const roleToLocationMap = {}; // role_code -> building_code

        // 为每个建筑物使用模拟角色数据
        for (const building of buildingsData) {
            const mockCharacters = getMockCharactersForBuilding(building.building_code);
            const assignedCharacters = [];

            // 只分配尚未分配到其他地点的角色
            for (const char of mockCharacters) {
                const roleCode = char.role_code || char.code;
                if (!roleCode) continue;

                if (!roleToLocationMap[roleCode]) {
                    // 角色尚未分配，分配到当前地点
                    roleToLocationMap[roleCode] = building.building_code;
                    assignedCharacters.push(char);
                }
                // 如果角色已经分配到其他地点，则跳过
            }

            buildingCharactersMap[building.building_code] = assignedCharacters;
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

        const centerX = (sw.x + se.x + ne.x + nw.x) / 4 + cellWidth / 2;
        const centerY = (sw.y + se.y + ne.y + nw.y) / 4 + cellHeight / 2;

        // 计算中心位置点（基于建筑物几何中心）
        const offsetX = 0;
        const offsetY = 0;

        // 圆形排列人物
        const radius = Math.max(40, characters.length * 12); // 增加半径以适应更大的头像
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
            circle.setAttribute('r', 20);
            circle.setAttribute('fill', '#fff');
            circle.setAttribute('stroke', '#8b4513');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('class', 'character-circle');

            // 创建头像图片
            const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            const roleCode = char.role_code || char.code;
            if (scrollId && roleCode) {
                const avatarUrl = `/api/scroll/${scrollId}/character/${roleCode}/avatar`;
                image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', avatarUrl);
                image.setAttribute('href', avatarUrl);
            }
            image.setAttribute('x', x - 20);
            image.setAttribute('y', y - 20);
            image.setAttribute('width', 40);
            image.setAttribute('height', 40);
            image.setAttribute('clip-path', 'url(#avatarClip)');
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
                // 真实session模式：优先尝试从crossworld API获取（新版接口）
                try {
                    console.log('正在通过 API 获取会话信息:', sessionId);
                    const crossworldResponse = await authenticatedFetch(`/api/crossworld/session/${sessionId}`);
                    if (crossworldResponse.ok) {
                        const crossworldData = await crossworldResponse.json();
                        currentScrollId = crossworldData.scroll_id;
                        console.log('从crossworld session获取scrollId成功:', currentScrollId);
                    } else {
                        console.warn(`获取 crossworld session 失败 (状态码: ${crossworldResponse.status})，尝试旧版接口...`);
                        // 兜底：尝试旧版接口（如果存在）
                        const sessionResponse = await authenticatedFetch(`/api/world/${sessionId}/info`);
                        if (sessionResponse.ok) {
                            const sessionData = await sessionResponse.json();
                            currentScrollId = sessionData.scroll_id;
                            console.log('从旧版 session API获取scrollId成功:', currentScrollId);
                        } else {
                            console.error(`所有会话获取接口均失败 (旧版状态码: ${sessionResponse.status})`);
                        }
                    }
                } catch (e) {
                    console.error('获取会话信息时发生异常:', e);
                }
            }
        }

        if (!currentScrollId) {
            console.error('无法确定书卷ID (scroll_id)，加载地图失败。SessionID:', sessionId);
            return;
        }

        // 获取书卷信息以确定背景图片
        let source = '';
        try {
            const response = await authenticatedFetch(`/api/scroll/${currentScrollId}`);
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

        // 构建背景图片路径
        // 三国演义相关地图使用根目录下的背景图
        let backgroundImageUrl;
        if (source === 'Romance_of_the_Three_Kingdoms' || source === 'Romance_of_the_Three_Kingdoms_Longzhong') {
            backgroundImageUrl = '/三国演义背景图.png';
        } else {
            // 其他地图：data/maps/{source}/background.png
            backgroundImageUrl = `/data/maps/${source}/background.png`;
        }
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
                // 真实session模式：优先尝试从crossworld API获取（新版接口）
                try {
                    const crossworldResponse = await authenticatedFetch(`/api/crossworld/session/${sessionId}`);
                    if (crossworldResponse.ok) {
                        const crossworldData = await crossworldResponse.json();
                        currentScrollId = crossworldData.scroll_id;
                        scrollId = currentScrollId; // 保存到全局变量
                        console.log('从crossworld session获取scrollId:', currentScrollId);
                    } else {
                        // 兜底：尝试旧版接口（如果存在）
                        const sessionResponse = await authenticatedFetch(`/api/world/${sessionId}/info`);
                        if (sessionResponse.ok) {
                            const sessionData = await sessionResponse.json();
                            currentScrollId = sessionData.scroll_id;
                            scrollId = currentScrollId; // 保存到全局变量
                            console.log('从旧版 session API获取scrollId:', currentScrollId);
                        }
                    }
                } catch (e) {
                    console.warn('获取session信息失败:', e);
                }
            }
        }

        if (!currentScrollId) {
            console.warn('未找到scroll_id参数');
            return;
        }

        // 从API获取建筑物数据
        const response = await authenticatedFetch(`/api/scrolls/${currentScrollId}/map-buildings`);
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
    
    // 如果是三国演义（隆中）或没有背景图，显示建筑物颜色
    const showBuildingColor = worldSource !== 'A_Dream_in_Red_Mansions';
    
    if (showBuildingColor && color) {
        polygon.setAttribute('fill', color);
        polygon.setAttribute('fill-opacity', '0.6');
        polygon.setAttribute('stroke', color);
        polygon.setAttribute('stroke-width', '2');
    } else {
        polygon.setAttribute('fill', 'transparent');
        polygon.setAttribute('fill-opacity', '0');
        polygon.setAttribute('stroke', 'transparent');
        polygon.setAttribute('stroke-width', '0');
    }
    
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

    // 如果不是红楼梦，显示图标和名称
    if (worldSource !== 'A_Dream_in_Red_Mansions') {
        const centerX = (sw.x + se.x + ne.x + nw.x) / 4;
        const centerY = (sw.y + se.y + ne.y + nw.y) / 4;

        // 添加图标
        if (icon) {
            const textIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textIcon.setAttribute('x', centerX);
            textIcon.setAttribute('y', centerY);
            textIcon.setAttribute('text-anchor', 'middle');
            textIcon.setAttribute('dominant-baseline', 'middle');
            textIcon.setAttribute('font-size', '20');
            textIcon.setAttribute('class', 'building-icon');
            textIcon.textContent = icon;
            textIcon.style.pointerEvents = 'none'; // 确保不干扰点击
            buildingGroup.appendChild(textIcon);
        }

        // 添加名称
        const textName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textName.setAttribute('x', centerX);
        textName.setAttribute('y', centerY + 20);
        textName.setAttribute('text-anchor', 'middle');
        textName.setAttribute('dominant-baseline', 'middle');
        textName.setAttribute('font-size', '12');
        textName.setAttribute('font-weight', 'bold');
        textName.setAttribute('fill', '#3d2817');
        textName.setAttribute('class', 'building-name');
        textName.textContent = building_name;
        textName.style.pointerEvents = 'none'; // 确保不干扰点击
        buildingGroup.appendChild(textName);
    }

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
            const roleCode = char.role_code || char.code;
            const avatarUrl = `/api/scroll/${scrollId}/character/${roleCode}/avatar`;
            const charItem = document.createElement('div');
            charItem.className = 'character-item';
            charItem.innerHTML = `
                <div class="character-avatar">
                    <img src="${avatarUrl}" alt="${char.role_name || char.name || ''}" 
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
        const avatarUrl = `/api/scroll/${scrollId}/character/${roleCode}/avatar`;
        charItem.innerHTML = `
            <div class="character-avatar">
                <img src="${avatarUrl}" alt="${roleName}" 
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

    // 获取当前玩家选择的角色信息（用于私语时告诉对方我是谁）
    const savedRole = localStorage.getItem('selected_role');
    let userName = '用户';
    if (savedRole) {
        try {
            const role = JSON.parse(savedRole);
            userName = role.name || role.nickname || '用户';
        } catch (e) {
            console.warn('解析已选角色失败:', e);
        }
    }

    // 跳转到私语页面，传递当前用户名
    const params = new URLSearchParams({
        scroll_id: scrollId,
        role_code: roleCode,
        user_name: userName,
        world_session_id: sessionId // 传递当前的 World Session ID
    });
    window.location.href = `/frontend/pages/chat.html?${params.toString()}`;
}

// 开始群聊
function startGroupChat(characters, buildingCode) {
    if (!sessionId || !scrollId) {
        console.error('缺少必要参数');
        return;
    }

    // 获取角色代码列表
    const roleCodes = characters.map(char => char.role_code || char.code);

    // 添加用户角色到列表（如果存在且不在列表中）
    const savedRole = localStorage.getItem('selected_role');
    if (savedRole) {
        try {
            const role = JSON.parse(savedRole);
            if (role.code && !roleCodes.includes(role.code)) {
                roleCodes.push(role.code);
                console.log('添加用户角色到群聊:', role.code);
            }
        } catch (e) {
            console.warn('解析已选角色失败:', e);
        }
    }

    // 跳转到群聊页面（入卷玩法）
    // 直接进入游戏页面，传递建筑物代码和角色列表
    // URL格式：/game?scroll_id=xxx&mode=story&location=xxx&roles=xxx,xxx,xxx
    const params = new URLSearchParams({
        scroll_id: scrollId,
        mode: 'story',
        location: buildingCode || '',
        roles: roleCodes.join(',')
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
    const fromChat = urlParams.get('from_chat') === '1';

    if (sessionId) {
        // 进入世界模式
        isSessionMode = true;
        setupSessionMode(fromChat);
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
function setupSessionMode(skipIntro = false) {
    console.log('正在设置会话模式 UI...', skipIntro ? '(跳过序章)' : '');
    try {
        // 隐藏顶部导航
        const header = document.getElementById('worldViewHeader');
        if (header) {
            header.style.display = 'none';
        }

        // 先隐藏所有游戏内 UI，等待点击“开启我的世界”后再显示
        const topOverlay = document.getElementById('sessionTopOverlay');
        const playerStatusBar = document.getElementById('playerStatusBar');

        if (topOverlay) topOverlay.style.display = 'none';
        if (playerStatusBar) playerStatusBar.style.display = 'none';

        // 设置全屏样式
        const container = document.getElementById('worldViewContainer');
        if (container) {
            container.classList.add('session-mode');
            // 默认进入“魂穿加载模式”：模糊背景，等待序章/摘要或者手动开启
            container.classList.add('intro-mode');

            // 如果是跳过模式且没有chat_session_id（异常情况），则移除模糊
            const urlParams = new URLSearchParams(window.location.search);
            if (skipIntro && !urlParams.get('chat_session_id')) {
                container.classList.remove('intro-mode');
                container.style.opacity = '1';
                if (topOverlay) topOverlay.style.display = 'flex';
                if (playerStatusBar) playerStatusBar.style.display = 'flex';
            }
        }

        // 加载玩家数据备用
        loadPlayerStatus();

        // 连接 WebSocket 以获取实时世界动态
        connectWebSocket(skipIntro);

        // 如果是从聊天返回，尝试获取并显示对话摘要
        if (skipIntro) {
            fetchChatSummary();
        }

        // 初始化通知栏点击事件（查看历史）
        const introBar = document.getElementById('worldIntroBar');
        if (introBar) {
            introBar.addEventListener('click', showWorldHistory);
        }

        console.log('会话模式 UI 设置完成');
    } catch (err) {
        console.error('设置会话模式失败:', err);
    }
}

// 连接 WebSocket
function connectWebSocket(skipStart = false) {
    if (!sessionId || !scrollId) {
        console.warn('缺少 sessionId 或 scrollId，无法连接 WebSocket');
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const clientId = 'client_' + Math.random().toString(36).substr(2, 9);
    const wsUrl = `${protocol}//${window.location.host}/ws/${clientId}`;

    console.log('正在连接 WebSocket:', wsUrl);
    socket = new WebSocket(wsUrl);

    socket.onopen = function () {
        console.log('WebSocket 连接已建立');

        // 获取当前魂穿的角色和地点（如果有）
        const savedRole = localStorage.getItem('selected_role');
        let roles = '';
        if (savedRole) {
            try {
                const role = JSON.parse(savedRole);
                roles = role.code || '';
            } catch (e) { }
        }

        // 发送初始化消息
        const initMessage = {
            type: 'init',
            scroll_id: parseInt(scrollId),
            token: token
        };

        if (roles) {
            initMessage.roles = roles;
            // 如果是在特定建筑物点击进入的，可能带有 location 信息
            // 否则后端会自动分配或保持原状
        }

        socket.send(JSON.stringify(initMessage));

        // 如果不是跳过模式，自动开始故事模拟以触发序章
        if (!skipStart) {
            setTimeout(() => {
                socket.send(JSON.stringify({ type: 'start' }));
                console.log('已发送 start 消息触发模拟');
            }, 1000);
        } else {
            console.log('跳过 start 消息发送（已从聊天返回）');
        }
    };

    socket.onmessage = function (event) {
        const message = JSON.parse(event.data);
        console.log('收到 WebSocket 消息:', message.type, message);

        if (message.type === 'message') {
            handleStoryMessage(message.data);
        } else if (message.type === 'initial_data') {
            // 处理初始数据更新（可能包含角色新位置）
            if (message.data.status && message.data.status.location) {
                console.log('收到位置更新:', message.data.status.location);
            }

            // 处理历史消息
            if (message.data.history_messages && Array.isArray(message.data.history_messages)) {
                console.log(`收到 ${message.data.history_messages.length} 条历史消息`);
                // 按顺序处理历史消息，使用 silent 模式避免触发模态框
                // 注意：history_messages 通常是时间正序的，handleStoryMessage 会 unshift 到 eventHistory
                // 所以我们反向遍历或者根据 index 处理
                const history = [...message.data.history_messages];
                history.forEach(msg => {
                    handleStoryMessage(msg, true);
                });
            }
        }
    };

    socket.onclose = function () {
        console.log('WebSocket 连接已关闭');
    };

    socket.onerror = function (error) {
        console.error('WebSocket 错误:', error);
    };
}

// 处理故事/世界消息
function handleStoryMessage(data, isSilent = false) {
    const text = data.text;
    if (!text) return;

    console.log('处理故事消息:', data.type, text.substring(0, 30) + '...');

    const introEl = document.getElementById('introText');
    const introBar = document.getElementById('worldIntroBar');

    // 记录到历史
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const historyItem = {
        time: timeStr,
        content: text,
        type: data.type,
        username: data.username
    };

    // 如果是序章（刚进入世界时的第一条 world 消息），先应用模糊背景
    const isFirstWorldMessage = data.type === 'world' && eventHistory.length === 0;
    if (isFirstWorldMessage && !isSilent) {
        const container = document.getElementById('worldViewContainer');
        if (container) {
            container.classList.add('intro-mode');
        }
    }

    eventHistory.unshift(historyItem);
    if (eventHistory.length > 100) eventHistory.pop();

    // 更新顶部通知栏（如果是世界动态消息）
    if (introEl && (data.type === 'world' || data.type === 'system')) {
        // 停止当前动画并强制重绘以立即显示新消息
        introEl.style.animation = 'none';
        void introEl.offsetWidth;

        // 如果是长文本（如序章），通知栏只显示第一句或摘要
        let summary = text;
        if (text.length > 60) {
            summary = text.split(/[。！？\n]/)[0] + '...';
        }
        introEl.textContent = summary;

        // 重新启动动画
        introEl.style.animation = 'slideInOut 8s infinite';

        // 增加一个高亮闪烁提示有新动态
        if (introBar) {
            introBar.style.borderColor = '#8b6f47';
            introBar.style.boxShadow = '0 0 15px rgba(139, 111, 71, 0.4)';
            setTimeout(() => {
                introBar.style.borderColor = '';
                introBar.style.boxShadow = '';
            }, 2000);
        }
    }

    // 如果是序章或重要剧情（type 为 world 且比较长，或者包含序章关键字），弹出模态框显示
    const isPrologue = data.type === 'world' && (text.length > 50 || text.includes('序章') || text.includes('睁开眼'));
    const isStorySummary = data.type === 'story';

    if (!isSilent && (isPrologue || isStorySummary)) {
        console.log('触发剧情焦点模态框');
        showStoryFocusModal(historyItem);
    }
}

// 显示剧情焦点模态框 (序章或重要事件)
function showStoryFocusModal(item) {
    // 检查是否已经有这个模态框，没有则创建一个简单的
    let modal = document.getElementById('storyFocusModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'storyFocusModal';
        modal.className = 'story-focus-modal';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <div class="story-content"></div>
                <div class="modal-actions" style="margin-top: 30px; text-align: center; display: none;">
                    <button class="start-world-btn" style="
                        background: #8b6f47;
                        color: #fff;
                        border: none;
                        padding: 12px 40px;
                        font-size: 18px;
                        border-radius: 30px;
                        cursor: pointer;
                        font-family: 'Noto Serif SC', serif;
                        box-shadow: 0 4px 15px rgba(139, 111, 71, 0.3);
                        transition: all 0.3s ease;
                    ">开启我的世界</button>
                </div>
                <button class="modal-close" style="display: none; position: absolute; top: 20px; right: 20px; background: transparent; border: none; font-size: 30px; color: #8b6f47; cursor: pointer;">&times;</button>
            </div>
        `;
        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('.modal-close');
        const startBtn = modal.querySelector('.start-world-btn');
        const overlay = modal.querySelector('.modal-overlay');

        const closeModal = () => {
            modal.style.display = 'none';
            // 当序章关闭时，移除模糊，展现世界
            const container = document.getElementById('worldViewContainer');
            if (container) {
                container.classList.remove('intro-mode');
                container.style.opacity = '1';
            }

            // 显示游戏内 UI
            const topOverlay = document.getElementById('sessionTopOverlay');
            if (topOverlay) topOverlay.style.display = 'flex';

            const playerStatusBar = document.getElementById('playerStatusBar');
            if (playerStatusBar) playerStatusBar.style.display = 'flex';
        };

        closeBtn.onclick = closeModal;
        startBtn.onclick = closeModal;
        overlay.onclick = () => {
            // 如果按钮可见，点击背景不关闭，必须点击按钮
            if (actionsEl.style.display === 'none') {
                closeModal();
            }
        };
    }

    const contentEl = modal.querySelector('.story-content');
    const actionsEl = modal.querySelector('.modal-actions');
    const closeBtn = modal.querySelector('.modal-close');

    // 格式化文本，将换行符转为段落
    const formattedText = item.content.split('\n').map(p => `<p>${p}</p>`).join('');
    contentEl.innerHTML = `
        <div class="story-time">${item.time}</div>
        <div class="story-text">${formattedText}</div>
    `;

    // 如果是序章，显示“开启我的世界”按钮，隐藏关闭叉号
    const isPrologue = item.content.includes('序章') || item.content.includes('睁开眼') || (item.type === 'world' && eventHistory.length <= 5);

    if (isPrologue) {
        actionsEl.style.display = 'block';
        closeBtn.style.display = 'none';
        // 确保背景处于模糊模式
        const container = document.getElementById('worldViewContainer');
        if (container) {
            container.classList.add('intro-mode');
        }
    } else {
        actionsEl.style.display = 'none';
        closeBtn.style.display = 'block';
        // 非序章弹窗，确保背景可见
        const container = document.getElementById('worldViewContainer');
        if (container) {
            container.classList.remove('intro-mode');
            container.style.opacity = '1';
        }
    }

    modal.style.display = 'flex';
}

// 世界动态消息逻辑
const eventHistory = []; // 存储所有发生过的事件

// Removed automatic world intro generation logic (startWorldIntro and worldIntros)
// The intro bar will only display real events or summaries.

// 显示世界见闻历史
function showWorldHistory() {
    const modal = document.getElementById('worldHistoryModal');
    const listEl = document.getElementById('worldHistoryList');
    const closeBtn = document.getElementById('worldHistoryClose');
    const overlay = document.getElementById('worldHistoryOverlay');

    if (!modal || !listEl) return;

    // 渲染历史记录
    if (eventHistory.length === 0) {
        listEl.innerHTML = '<div class="no-characters">暂无世界见闻记录</div>';
    } else {
        listEl.innerHTML = eventHistory.map(item => `
            <div class="history-item">
                <div class="history-item-time">${item.time}</div>
                <div class="history-item-content">${item.content}</div>
            </div>
        `).join('');
    }

    modal.style.display = 'flex';

    const closeModal = () => {
        modal.style.display = 'none';
    };

    closeBtn.onclick = closeModal;
    overlay.onclick = closeModal;
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
                console.log('已从本地缓存加载角色数据:', role);
                if (playerNameEl) playerNameEl.textContent = role.name || role.nickname || '穿越者';
                if (playerIdentityEl) playerIdentityEl.textContent = role.identity || '已魂穿';
                if (playerAvatarEl) {
                    const avatarUrl = role.avatar || `/api/scroll/${scrollId}/character/${role.code || role.role_code}/avatar`;
                    playerAvatarEl.innerHTML = `<img src="${avatarUrl}" alt="玩家头像" onerror="this.src='../assets/images/default-icon.jpg'">`;
                }
            } catch (parseError) {
                console.warn('解析localStorage中的selected_role失败:', parseError);
                if (playerNameEl) playerNameEl.textContent = '测试玩家';
            }
        } else {
            console.log('未找到本地角色缓存，使用默认状态');
            if (playerNameEl) playerNameEl.textContent = '测试玩家';
            if (playerIdentityEl) playerIdentityEl.textContent = '临时访客';
        }

        // 模拟养成数值：根据角色类型生成比较美观的初始值
        // 这些数值会在点击“开启我的世界”显示状态栏时平滑滑入
        updateStat('talent', 65);
        updateStat('bond', 45);
        updateStat('energy', 100);
        console.log('玩家状态加载完成（等待 UI 开启时显示）');
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

/**
 * 获取最近一次私语聊天的摘要，并添加到世界见闻录中
 */
async function fetchChatSummary() {
    const urlParams = new URLSearchParams(window.location.search);
    const chatSessionId = urlParams.get('chat_session_id');

    if (!chatSessionId) {
        console.log('未发现 chat_session_id，跳过摘要获取');
        return;
    }

    console.log('正在获取对话摘要, chatSessionId:', chatSessionId);

    try {
        const response = await authenticatedFetch(`/api/chat/summary/${chatSessionId}`);
        if (!response.ok) {
            throw new Error('获取摘要请求失败');
        }

        const data = await response.json();
        if (data.success && data.summary) {
            console.log('成功获取对话摘要:', data.summary);

            // 将摘要作为一条"系统/世界"动态添加到见闻录中
            // 此时应该是在 intro-mode 下，handleStoryMessage 会判断并在世界见闻录第一条时显示模态框
            // 由于我们刚从聊天回来，eventHistory 可能为空（刷新页面）或者有旧数据
            // 我们强制标记为需要显示模态框（通过特殊关键字或强制逻辑，但这里利用 prologue 逻辑）

            // 为了确保显示模态框，我们可以清空 eventHistory 或者确保 summary 足够长
            // 或者我们可以稍微 hack 一下，确保 handleStoryMessage 认为它是 prologue
            // 这里的 summary 是 "30-50字"，通常 > 50 字符 (text.length)

            handleStoryMessage({
                text: "【此前见闻】" + data.summary, // 添加前缀增加长度并标识
                type: 'world'
            });

            // 清除 URL 中的 chat_session_id 避免刷新页面重复添加
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('chat_session_id');
            window.history.replaceState({}, '', newUrl);
        } else {
            throw new Error('摘要数据为空');
        }
    } catch (e) {
        console.error('获取对话摘要失败:', e);
        // 如果失败，确保 UI 显示出来，否则用户卡在模糊界面
        const container = document.getElementById('worldViewContainer');
        const topOverlay = document.getElementById('sessionTopOverlay');
        const playerStatusBar = document.getElementById('playerStatusBar');

        if (container) {
            container.classList.remove('intro-mode');
            container.style.opacity = '1';
        }
        if (topOverlay) topOverlay.style.display = 'flex';
        if (playerStatusBar) playerStatusBar.style.display = 'flex';
    }
}
