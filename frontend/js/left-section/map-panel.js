// map-script.js
class WorldMap {
    constructor() {
        // 示例地图数据
        this.defaultMapData = {
            places: ["Unknown"],
            distances: [
            ]
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
        this.width = container.clientWidth;
        this.height = container.clientHeight;

        // 创建缩放行为
        const zoom = d3.zoom()
            .scaleExtent([0.8, 2])
            .on("zoom", (event) => this.zoomed(event));

        // 创建SVG画布
        this.svg = d3.select("#map")
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height)
            .call(zoom);

        // 创建背景层
        const backgroundLayer = this.svg.append("g")
            .attr("class", "background-layer");

        // 加载背景图片
        this.loadBackgroundImage("./frontend/assets/images/fantasy-map.png", backgroundLayer);

        // 创建容器
        this.container = this.svg.append("g")
            .attr("class", "nodes-container");
    }

    updateMap(mapData) {
        this.mapData = mapData;

        // 准备数据
        const nodes = mapData.places.map(place => ({id: place}));
        const links = mapData.distances.map(d => ({
            source: d.source,
            target: d.target,
            distance: d.distance
        }));

        // 重置容器
        this.container.selectAll("*").remove();

        // 创建力导向图
        this.simulation = d3.forceSimulation()
            .force("link", d3.forceLink().id(d => d.id).distance(d => d.distance * 5))
            .force("charge", d3.forceManyBody().strength(-2000))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("collision", d3.forceCollide().radius(40));

        // 创建连线和节点
        this.createLinks(links);
        this.createNodes(nodes);

        // 更新力导向图
        this.simulation
            .nodes(nodes)
            .on("tick", () => this.ticked());

        this.simulation.force("link")
            .links(links);
    }

    zoomed(event) {
        this.container.attr("transform", event.transform);
    }

    createLinks(links) {
        // 创建连线
        this.link = this.container.append("g")
            .selectAll("line")
            .data(links)
            .enter()
            .append("line")
            .attr("class", "link");

        // 创建距离标签
        this.distanceLabels = this.container.append("g")
            .selectAll("text")
            .data(links)
            .enter()
            .append("text")
            .attr("class", "distance-label")
            .text(d => d.distance)
            .attr("stroke", "white")
            .attr("stroke-width", "2px")
            .attr("paint-order", "stroke");
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
            .attr("r", 20);

        // 添加节点文本
        this.node.append("text")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .text(d => this.formatNodeName(d.id));

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
        d3.select("body").on("click", () => {
            if (this.selectedNode) {
                this.deselectNode();
            }
        });
    }

    ticked() {
        this.link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        this.distanceLabels
            .attr("x", d => (d.source.x + d.target.x) / 2)
            .attr("y", d => (d.source.y + d.target.y) / 2);

        this.node
            .attr("transform", d => `translate(${d.x},${d.y})`);
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
                .duration(200)
                .attr("r", 30);

            this.link.transition()
                .duration(200)
                .style("stroke-opacity", l => 
                    (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.2
                )
                .style("stroke", l => 
                    (l.source.id === d.id || l.target.id === d.id) ? "#ff0000" : "#999"
                );

            this.popup.transition()
                .duration(200)
                .style("opacity", .9);
            
            this.popup.html(`
                <h3>${d.id}</h3>
                <p>连接数: ${this.getConnectedLinks(d.id).length}</p>
                <p>相邻节点: ${this.getConnectedNodes(d.id).join(", ")}</p>
            `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
        }
    }

    deselectNode() {
        d3.select(this.selectedNode)
            .select("circle")
            .classed("selected", false)
            .transition()
            .duration(200)
            .attr("r", 20);
        
        this.link.transition()
            .duration(200)
            .style("stroke-opacity", 0.6)
            .style("stroke", "#999");
        
        this.popup.transition()
            .duration(200)
            .style("opacity", 0);
        
        this.selectedNode = null;
    }

    formatNodeName(name, maxLength = 3) {
        if (name.length <= maxLength) return name;
        
        if (/^[\u4e00-\u9fa5]+$/.test(name)) {
            return name.substring(0, maxLength - 1) + '…';
        } else {
            return name.substring(0, maxLength) + '...';
        }
    }

    getConnectedNodes(nodeId) {
        return this.mapData.distances
            .filter(l => l.source === nodeId || l.target === nodeId)
            .map(l => l.source === nodeId ? l.target : l.source);
    }

    getConnectedLinks(nodeId) {
        return this.mapData.distances
            .filter(l => l.source === nodeId || l.target === nodeId);
    }

    loadBackgroundImage(url, backgroundLayer) {
        const img = new Image();
        img.onload = () => {
            const background = this.svg.append("image")
                .attr("class", "map-background")
                .attr("xlink:href", url)
                .attr("width", this.width)
                .attr("height", this.height);
            backgroundLayer.append(() => background.node());
        };
        img.onerror = () => {
            backgroundLayer.append("rect")
                .attr("width", this.width)
                .attr("height", this.height)
                .attr("fill", "#f0f0f0");
        };
        img.src = url;
    }

    handleResize() {
        const container = document.getElementById('map-container');
        this.width = container.clientWidth;
        this.height = container.clientHeight;
        
        this.svg
            .attr('width', this.width)
            .attr('height', this.height);
        
        this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
        this.simulation.alpha(0.3).restart();
    }
}

const worldMap = new WorldMap();
