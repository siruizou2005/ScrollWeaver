/**
 * 事件链预览页面 JavaScript
 */

// 从URL获取参数
const urlParams = new URLSearchParams(window.location.search);
const scrollId = urlParams.get('scroll_id');
const actCount = parseInt(urlParams.get('act_count') || '5');
const act = urlParams.get('act') ? parseInt(urlParams.get('act')) : null;
const multiplayer = urlParams.get('multiplayer') === 'true';
const language = urlParams.get('language') || 'zh';
const token = localStorage.getItem('token');

document.addEventListener('DOMContentLoaded', () => {
    // 检查是否有必要参数
    if (!scrollId || !actCount) {
        showError('缺少必要参数（scroll_id 或 act_count）');
        return;
    }
    
    // 开始生成事件链
    generateEventChain();
});

/**
 * 生成事件链
 */
async function generateEventChain() {
    const loadingDiv = document.getElementById('loadingDiv');
    const previewContent = document.getElementById('previewContent');
    
    if (!loadingDiv || !previewContent) {
        console.error('找不到必要的DOM元素');
        return;
    }
    
    try {
        // 确保加载状态显示
        loadingDiv.style.display = 'flex';
        // 不要清空 previewContent，因为 loadingDiv 在里面
        console.log('显示加载状态');
        
        // 禁用按钮，防止重复点击
        const confirmBtn = document.querySelector('.btn-primary');
        const cancelBtn = document.querySelector('.btn-secondary');
        if (confirmBtn) confirmBtn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = true;
        
        console.log('开始生成事件链，参数:', { scrollId, actCount, language });
        
        // 调用 API 生成事件链（设置超时）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2分钟超时
        
        let response;
        try {
            response = await fetch(`/api/scroll/${scrollId}/generate-event-chain`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    total_acts: actCount,
                    language: language
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                throw new Error('请求超时，请稍后重试');
            }
            throw fetchError;
        }
        
        console.log('API响应状态:', response.status, response.ok);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: '未知错误' }));
            console.error('API错误:', errorData);
            throw new Error(errorData.detail || '生成事件链失败');
        }
        
        const result = await response.json();
        console.log('API返回结果:', result);
        
        const eventChain = result.event_chain;
        
        if (!eventChain) {
            throw new Error('事件链数据为空');
        }
        
        // 调试：打印事件链数据
        console.log('生成的事件链数据:', JSON.stringify(eventChain, null, 2));
        
        // 保存到全局变量
        window.previewData = {
            eventChain: eventChain,
            act: act,
            multiplayer: multiplayer,
            actCount: actCount,
            scrollId: scrollId
        };
        
        // 隐藏加载状态
        loadingDiv.style.display = 'none';
        console.log('隐藏加载状态');
        
        // 显示事件链预览（这会替换整个 previewContent 的内容）
        displayEventChainPreview(eventChain);
        console.log('显示事件链预览完成');
        
        // 重新启用按钮
        const confirmBtn2 = document.querySelector('.btn-primary');
        const cancelBtn2 = document.querySelector('.btn-secondary');
        if (confirmBtn2) confirmBtn2.disabled = false;
        if (cancelBtn2) cancelBtn2.disabled = false;
        
    } catch (error) {
        console.error('生成事件链失败:', error);
        console.error('错误堆栈:', error.stack);
        
        // 隐藏加载状态
        loadingDiv.style.display = 'none';
        
        // 重新启用按钮
        const confirmBtn = document.querySelector('.btn-primary');
        const cancelBtn = document.querySelector('.btn-secondary');
        if (confirmBtn) confirmBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        
        showError(`生成事件链失败: ${error.message}`);
    }
}

/**
 * 显示错误信息
 */
function showError(message) {
    const previewContent = document.getElementById('previewContent');
    previewContent.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
            <button class="btn btn-secondary" onclick="window.history.back()">返回</button>
        </div>
    `;
}

/**
 * 显示事件链预览
 */
function displayEventChainPreview(eventChain) {
    const previewContent = document.getElementById('previewContent');
    
    if (!previewContent) {
        console.error('找不到 previewContent 元素');
        return;
    }
    
    const acts = eventChain.acts || [];
    
    if (acts.length === 0) {
        previewContent.innerHTML = '<div class="error-message">事件链数据为空</div>';
        return;
    }
    
    console.log('开始渲染事件链预览，共', acts.length, '幕');
    
    let html = '<div class="event-chain-preview">';
    
    // 显示总体主题
    if (eventChain.overall_theme) {
        html += `<div class="overall-theme">
            <h3><i class="fas fa-star"></i> 总体主题</h3>
            <p>${eventChain.overall_theme}</p>
        </div>`;
    }
    
    // 显示每一幕
    acts.forEach((act, index) => {
        html += `<div class="act-preview">`;
        html += `<div class="act-header">`;
        html += `<h4><span class="act-number">第 ${act.act_number || (index + 1)} 幕</span>`;
        html += `<span class="act-title">${act.title || `幕 ${index + 1}`}</span></h4>`;
        html += `</div>`;
        
        html += `<div class="act-content">`;
        
        // 明线
        const mainPlot = act.main_plot || '';
        if (mainPlot && mainPlot.trim() && mainPlot !== '剧情发展') {
            html += `<div class="plot-section main-plot">`;
            html += `<h5><i class="fas fa-sun"></i> 明线</h5>`;
            html += `<p>${mainPlot}</p>`;
            html += `</div>`;
        }
        
        // 暗线
        const subPlot = act.sub_plot || '';
        if (subPlot && subPlot.trim() && subPlot !== '隐藏线索') {
            html += `<div class="plot-section sub-plot">`;
            html += `<h5><i class="fas fa-moon"></i> 暗线</h5>`;
            html += `<p>${subPlot}</p>`;
            html += `</div>`;
        }
        
        // 关键事件
        if (act.key_events && Array.isArray(act.key_events) && act.key_events.length > 0) {
            html += `<div class="plot-section key-events">`;
            html += `<h5><i class="fas fa-key"></i> 关键事件</h5>`;
            html += `<ul>`;
            act.key_events.forEach(event => {
                if (event && event.trim()) {
                    html += `<li>${event}</li>`;
                }
            });
            html += `</ul>`;
            html += `</div>`;
        }
        
        // 关系变化
        if (act.relationship_changes && act.relationship_changes.trim()) {
            html += `<div class="plot-section relationship">`;
            html += `<h5><i class="fas fa-users"></i> 关系变化</h5>`;
            html += `<p>${act.relationship_changes}</p>`;
            html += `</div>`;
        }
        
        html += `</div>`; // act-content
        html += `</div>`; // act-preview
    });
    
    html += '</div>';
    previewContent.innerHTML = html;
}

/**
 * 确认并进入对话
 */
function confirmAndEnter() {
    if (!window.previewData) {
        alert('预览数据不存在');
        return;
    }
    
    const { act, multiplayer, actCount, scrollId } = window.previewData;
    
    // 构建跳转参数
    const params = new URLSearchParams({
        scroll_id: scrollId,
        mode: 'story'
    });
    
    if (act) params.set('act', act);
    if (multiplayer) params.set('multiplayer', 'true');
    if (actCount) {
        params.set('event_chain', 'true');
        params.set('act_count', actCount);
    }
    
    // 跳转到游戏页面
    window.location.href = `/game?${params.toString()}`;
}

/**
 * 取消预览
 */
function cancelPreview() {
    // 返回上一页
    window.history.back();
}

