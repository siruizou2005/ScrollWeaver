// 世界地图页面脚本

// 网格配置
const GRID_COLS = 24;
const GRID_ROWS = 12;
const TOTAL_CELLS = GRID_COLS * GRID_ROWS; // 288个格子

// 全局变量
let cellWidth = 0;
let cellHeight = 0;
let buildingsData = [];

// 初始化地图
async function initWorldMap() {
    const mapContainer = document.getElementById('mapContainer');
    const svg = document.getElementById('worldMap');
    
    if (!mapContainer || !svg) {
        console.error('地图容器或SVG元素未找到');
        return;
    }

    // 获取容器尺寸
    const containerWidth = mapContainer.clientWidth;
    const containerHeight = mapContainer.clientHeight;
    
    // 设置SVG尺寸
    svg.setAttribute('width', containerWidth);
    svg.setAttribute('height', containerHeight);
    svg.setAttribute('viewBox', `0 0 ${containerWidth} ${containerHeight}`);

    // 计算每个格子的尺寸
    cellWidth = containerWidth / GRID_COLS;
    cellHeight = containerHeight / GRID_ROWS;

    // 加载背景图片
    await loadBackgroundImage(svg, containerWidth, containerHeight);
    
    // 先加载建筑物数据（需要在绘制网格前加载，以便网格能检测建筑物）
    await loadAndDrawBuildings(svg);
    
    // 绘制网格线（隐藏但保留用于调试）
    drawGridLines(svg, containerWidth, containerHeight, cellWidth, cellHeight);
    
    // 绘制网格单元格（保留交互功能，会根据建筑物数据显示对应信息）
    drawGridCells(svg, containerWidth, containerHeight, cellWidth, cellHeight);
    
    // 绘制建筑物（透明多边形，仅用于交互）
    drawBuildings(svg);
}

// 加载背景图片
async function loadBackgroundImage(svg, width, height) {
    try {
        // 从URL获取scroll_id
        const urlParams = new URLSearchParams(window.location.search);
        const scrollId = urlParams.get('scroll_id');
        
        if (!scrollId) {
            console.warn('未找到scroll_id参数');
            return;
        }

        // 获取书卷信息以确定背景图片
        let source = '';
        try {
            const response = await fetch(`/api/scroll/${scrollId}`);
            if (response.ok) {
                const scrollData = await response.json();
                source = scrollData.source || '';
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
        // 从URL获取scroll_id
        const urlParams = new URLSearchParams(window.location.search);
        const scrollId = urlParams.get('scroll_id');
        
        if (!scrollId) {
            console.warn('未找到scroll_id参数');
            return;
        }

        // 从API获取建筑物数据
        const response = await fetch(`/api/scrolls/${scrollId}/map-buildings`);
        if (!response.ok) {
            console.warn('获取建筑物数据失败:', response.statusText);
            return;
        }

        const data = await response.json();
        buildingsData = data.buildings || [];
        
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
    polygon.addEventListener('click', () => {
        handleBuildingClick(building);
    });

    buildingGroup.appendChild(polygon);

    // 不显示图标和名称（已隐藏）

    return buildingGroup;
}

// 处理建筑物点击
function handleBuildingClick(building) {
    console.log('点击了建筑物:', building.building_name);
    // 这里可以添加点击后的逻辑，比如显示建筑物详情等
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

    // 定位提示框
    const rect = event.target.getBoundingClientRect();
    tooltipElement.style.left = `${rect.left + rect.width / 2}px`;
    tooltipElement.style.top = `${rect.top - 10}px`;
    tooltipElement.style.transform = 'translate(-50%, -100%)';
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
                // 如果属于建筑物，显示建筑物信息
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
                // 普通单元格不显示任何提示
                // 移除点击和悬停事件，保持静默
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
    cellTooltipElement.style.left = `${rect.left + rect.width / 2}px`;
    cellTooltipElement.style.top = `${rect.top - 10}px`;
    cellTooltipElement.style.transform = 'translate(-50%, -100%)';
    
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
            // 获取scroll_id参数
            const urlParams = new URLSearchParams(window.location.search);
            const scrollId = urlParams.get('scroll_id');
            
            if (scrollId) {
                window.location.href = `/frontend/pages/intro.html?scroll_id=${scrollId}`;
            } else {
                window.history.back();
            }
        });
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
document.addEventListener('DOMContentLoaded', () => {
    initWorldMap();
    bindEventListeners();
});

