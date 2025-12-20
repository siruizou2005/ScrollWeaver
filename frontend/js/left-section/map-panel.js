// map-script.js
class WorldMap {
    constructor() {
        // 示例地图数据
        this.defaultMapData = {
            places: ["未知区域"],
            distances: []
        };

        this.mapData = null;
        this.selectedNode = null;
        this.svg = null;
        this.simulation = null;
        this.container = null;
        this.width = 0;
        this.height = 0;

        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            // 初始化地图容器
            this.initMapContainer();

            // 监听窗口调整
            window.addEventListener('resize', () => this.handleResize());

            // 先使用默认数据
            this.updateMap(this.defaultMapData);

            // 监听WebSocket消息
            window.addEventListener('websocket-message', (event) => {
                const message = event.detail;
                if (message.type === 'initial_data' && message.data.map) {
                    this.updateMap(message.data.map);
                }
            });
        });
    }

    initMapContainer() {
        const container = document.getElementById('map-container');
        if (!container) return;

        this.width = container.clientWidth;
        this.height = container.clientHeight;

        // 创建缩放行为
        const zoom = d3.zoom()
            .scaleExtent([0.5, 5])
            .on("zoom", (event) => this.zoomed(event));

        // 清空容器
        d3.select("#map").selectAll("*").remove();

        // 创建SVG画布
        this.svg = d3.select("#map")
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", `0 0 ${this.width} ${this.height}`)
            .style("display", "block") // 移除间隙
            .call(zoom);

        // 创建主缩放容器 (包含背景和节点)
        this.mainGroup = this.svg.append("g")
            .attr("class", "main-zoom-group");

        // 创建背景层 (在主容器内)
        const backgroundLayer = this.mainGroup.append("g")
            .attr("class", "background-layer");

        // 加载通用的高级感地图背景
        this.loadBackgroundImage("./frontend/assets/images/universal-map-bg.png", backgroundLayer);

        // 创建节点容器 (在主容器内)
        this.container = this.mainGroup.append("g")
            .attr("class", "nodes-container");

        // 定义阴影过滤器
        const defs = this.svg.append("defs");
        const filter = defs.append("filter")
            .attr("id", "drop-shadow")
            .attr("height", "130%");

        filter.append("feGaussianBlur")
            .attr("in", "SourceAlpha")
            .attr("stdDeviation", 3)
            .attr("result", "blur");

        filter.append("feOffset")
            .attr("in", "blur")
            .attr("dx", 0)
            .attr("dy", 2)
            .attr("result", "offsetBlur");

        const feMerge = filter.append("feMerge");
        feMerge.append("feMergeNode").attr("in", "offsetBlur");
        feMerge.append("feMergeNode").attr("in", "SourceGraphic");
    }

    updateMap(mapData) {
        if (!mapData || !mapData.places) return;
        this.mapData = mapData;

        // 准备数据
        const nodes = mapData.places.map(place => ({ id: place }));
        const links = mapData.distances ? mapData.distances.map(d => ({
            source: d.source,
            target: d.target,
            distance: d.distance
        })) : [];

        // 重置容器
        if (this.container) {
            this.container.selectAll("*").remove();
        } else {
            return;
        }

        // 创建力导向图
        this.simulation = d3.forceSimulation()
            .force("link", d3.forceLink().id(d => d.id).distance(d => (d.distance || 50) * 8))
            .force("charge", d3.forceManyBody().strength(-2000))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("collision", d3.forceCollide().radius(60));

        // 创建连线和节点
        this.createLinks(links);
        this.createNodes(nodes);

        // 更新力导向图
        this.simulation
            .nodes(nodes)
            .on("tick", () => this.ticked());

        this.simulation.force("link")
            .links(links);

        // 自动缩放以适应内容
        this.simulation.alpha(1).restart();
    }

    zoomed(event) {
        this.mainGroup.attr("transform", event.transform);
    }

    createLinks(links) {
        // 创建连线
        this.link = this.container.append("g")
            .selectAll("line")
            .data(links)
            .enter()
            .append("line")
            .attr("class", "link");

        // 隐藏距离标签逻辑
    }

    createNodes(nodes) {
        // 创建节点组
        this.node = this.container.append("g")
            .selectAll(".node")
            .data(nodes)
            .enter()
            .append("g")
            .attr("class", "node")
            .call(d3.drag()
                .on("start", (event, d) => this.dragstarted(event, d))
                .on("drag", (event, d) => this.dragged(event, d))
                .on("end", (event, d) => this.dragended(event, d)))
            .on("click", (event, d) => this.handleNodeClick(event, d));

        // 添加节点圆形
        this.node.append("circle")
            .attr("r", 15)
            .style("filter", "url(#drop-shadow)");

        // 添加节点文本
        this.node.append("text")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("dy", "30px") // 文字在圆圈下方
            .text(d => d.id);

        this.node.append("title")
            .text(d => d.id);

        // 创建弹出框
        if (!this.popup) {
            this.popup = d3.select("body")
                .append("div")
                .attr("class", "popup")
                .style("opacity", 0);
        }

        // 添加全局点击事件
        d3.select("body").on("click", (event) => {
            if (this.selectedNode && !event.target.closest('.node')) {
                this.deselectNode();
            }
        });
    }

    ticked() {
        if (this.link) {
            this.link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
        }

        if (this.node) {
            this.node
                .attr("transform", d => `translate(${d.x},${d.y})`);
        }
    }

    dragstarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d) {
        const transform = d3.zoomTransform(this.svg.node());
        d.fx = (event.x - transform.x) / transform.k;
        d.fy = (event.y - transform.y) / transform.k;
    }

    dragended(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    handleNodeClick(event, d) {
        event.stopPropagation();

        if (this.selectedNode === event.currentTarget) {
            this.deselectNode();
        } else {
            if (this.selectedNode) {
                this.deselectNode();
            }

            this.selectedNode = event.currentTarget;

            d3.select(this.selectedNode)
                .select("circle")
                .classed("selected", true)
                .transition()
                .duration(300)
                .attr("r", 22);

            this.link.transition()
                .duration(300)
                .style("stroke-opacity", l =>
                    (l.source.id === d.id || l.target.id === d.id) ? 0.9 : 0.1
                )
                .style("stroke", l =>
                    (l.source.id === d.id || l.target.id === d.id) ? "#d84315" : "#8d6e63"
                )
                .style("stroke-width", l =>
                    (l.source.id === d.id || l.target.id === d.id) ? 3 : 1.5
                );

            this.popup.transition()
                .duration(300)
                .style("opacity", 1);

            this.popup.html(`
                <h3>${d.id}</h3>
                <p><strong>连接数:</strong> ${this.getConnectedLinks(d.id).length}</p>
                <p><strong>相邻节点:</strong> ${this.getConnectedNodes(d.id).join(", ") || "无"}</p>
            `)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 15) + "px");
        }
    }

    deselectNode() {
        if (!this.selectedNode) return;

        d3.select(this.selectedNode)
            .select("circle")
            .classed("selected", false)
            .transition()
            .duration(300)
            .attr("r", 15);

        this.link.transition()
            .duration(300)
            .style("stroke-opacity", 0.35)
            .style("stroke", "#8d6e63")
            .style("stroke-width", 1.5);

        this.popup.transition()
            .duration(300)
            .style("opacity", 0);

        this.selectedNode = null;
    }

    formatNodeName(name, maxLength = 6) {
        if (name.length <= maxLength) return name;
        return name.substring(0, maxLength - 1) + '…';
    }

    getConnectedNodes(nodeId) {
        if (!this.mapData || !this.mapData.distances) return [];
        return this.mapData.distances
            .filter(l => l.source === nodeId || l.target === nodeId)
            .map(l => l.source === nodeId ? l.target : l.source);
    }

    getConnectedLinks(nodeId) {
        if (!this.mapData || !this.mapData.distances) return [];
        return this.mapData.distances
            .filter(l => l.source === nodeId || l.target === nodeId);
    }

    loadBackgroundImage(url, backgroundLayer) {
        const img = new Image();
        img.onload = () => {
            backgroundLayer.selectAll("*").remove();
            const background = backgroundLayer.append("image")
                .attr("class", "map-background")
                .attr("xlink:href", url)
                .attr("width", this.width * 4) // 极大覆盖范围以防缩放出界
                .attr("height", this.height * 4)
                .attr("x", -this.width * 1.5)
                .attr("y", -this.height * 1.5)
                .attr("preserveAspectRatio", "xMidYMid slice")
                .style("opacity", 0.7);
        };
        img.onerror = () => {
            console.error("Failed to load background image:", url);
            backgroundLayer.append("rect")
                .attr("width", this.width)
                .attr("height", this.height)
                .attr("fill", "#f0f0f0")
                .style("opacity", 0.3);
        };
        img.src = url;
    }

    handleResize() {
        const container = document.getElementById('map-container');
        if (!container) return;

        this.width = container.clientWidth;
        this.height = container.clientHeight;

        if (this.svg) {
            this.svg.attr("viewBox", `0 0 ${this.width} ${this.height}`);
            this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
            this.simulation.alpha(0.3).restart();
        }
    }
}

const worldMap = new WorldMap();
