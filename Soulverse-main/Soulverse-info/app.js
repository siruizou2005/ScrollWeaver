// Gemini API配置
const GEMINI_API_KEY = 'AIzaSyAlumoIbI9x2uU11pEpfYF0_guZUx2BVPI';
const GEMINI_MODEL = 'gemini-2.5-flash';
// 使用官方 REST API 端点
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// MBTI类型数据
const MBTI_TYPES = [
    { code: 'INTJ', name: '建筑师', desc: '独立、理性、有远见的战略家', icon: '🏗️', color: '#6366f1' },
    { code: 'INTP', name: '逻辑学家', desc: '好奇、逻辑、创新的思想家', icon: '🔬', color: '#8b5cf6' },
    { code: 'ENTJ', name: '指挥官', desc: '果断、自信、有领导力的指挥官', icon: '👑', color: '#ec4899' },
    { code: 'ENTP', name: '辩论家', desc: '聪明、创新、喜欢挑战传统', icon: '💡', color: '#f59e0b' },
    { code: 'INFJ', name: '提倡者', desc: '理想主义、有洞察力、富有同理心', icon: '🌟', color: '#10b981' },
    { code: 'INFP', name: '调停者', desc: '理想主义、忠诚、富有创造力', icon: '🎨', color: '#3b82f6' },
    { code: 'ENFJ', name: '主人公', desc: '热情、有魅力、天生的领导者', icon: '🎭', color: '#ef4444' },
    { code: 'ENFP', name: '竞选者', desc: '热情、自由、富有创造力的活动家', icon: '🎪', color: '#f97316' },
    { code: 'ISTJ', name: '物流师', desc: '实际、可靠、有责任感的检查员', icon: '📋', color: '#64748b' },
    { code: 'ISFJ', name: '守卫者', desc: '温暖、负责、保护性的守护者', icon: '🛡️', color: '#06b6d4' },
    { code: 'ESTJ', name: '总经理', desc: '务实、果断、有组织能力的执行官', icon: '💼', color: '#14b8a6' },
    { code: 'ESFJ', name: '执政官', desc: '外向、友好、关心他人的执政官', icon: '🤝', color: '#a855f7' },
    { code: 'ISTP', name: '鉴赏家', desc: '大胆、实用、实验性的冒险家', icon: '🔧', color: '#84cc16' },
    { code: 'ISFP', name: '探险家', desc: '灵活、迷人、艺术性的探险家', icon: '🎯', color: '#eab308' },
    { code: 'ESTP', name: '企业家', desc: '聪明、精力充沛、感知力强', icon: '🚀', color: '#f43f5e' },
    { code: 'ESFP', name: '表演者', desc: '自发的、精力充沛的、热情的表演者', icon: '🎬', color: '#fb923c' }
];

// 应用状态
const appState = {
    currentStep: 'mbti',
    mbti: null,
    mbtiAnswers: [],
    coreAnswers: [],
    chatHistory: null,
    wechatName: '',  // 自己的微信名称
    relationship: '',  // 与对方的关系
    personalityProfile: null,
    currentMBTIQuestionIndex: 0,
    currentCoreQuestionIndex: 0
};

// MBTI问卷题目（20题，参考16Personalities）
const MBTI_QUESTIONS = [
    { id: 1, text: "在聚会中，你更倾向于：", options: [
        { text: "与很多人交流，认识新朋友", value: "E" },
        { text: "与几个熟悉的朋友深入交谈", value: "I" }
    ]},
    { id: 2, text: "你更倾向于：", options: [
        { text: "先行动，再思考", value: "S" },
        { text: "先思考，再行动", value: "N" }
    ]},
    { id: 3, text: "做决定时，你更依赖：", options: [
        { text: "逻辑和分析", value: "T" },
        { text: "价值观和感受", value: "F" }
    ]},
    { id: 4, text: "你更喜欢：", options: [
        { text: "有计划的、有序的生活", value: "J" },
        { text: "灵活的、随性的生活", value: "P" }
    ]},
    { id: 5, text: "面对新环境，你：", options: [
        { text: "很快适应，感到兴奋", value: "E" },
        { text: "需要时间适应，感到紧张", value: "I" }
    ]},
    { id: 6, text: "你更关注：", options: [
        { text: "具体的事实和细节", value: "S" },
        { text: "可能性和整体概念", value: "N" }
    ]},
    { id: 7, text: "在争论中，你更重视：", options: [
        { text: "客观真理和正确性", value: "T" },
        { text: "和谐和人际关系", value: "F" }
    ]},
    { id: 8, text: "你更喜欢：", options: [
        { text: "提前完成工作", value: "J" },
        { text: "在截止日期前完成", value: "P" }
    ]},
    { id: 9, text: "社交活动后，你：", options: [
        { text: "感到精力充沛", value: "E" },
        { text: "感到疲惫，需要独处", value: "I" }
    ]},
    { id: 10, text: "你更倾向于：", options: [
        { text: "关注现实和实际", value: "S" },
        { text: "关注未来和可能性", value: "N" }
    ]},
    { id: 11, text: "做决定时，你更看重：", options: [
        { text: "公平和一致性", value: "T" },
        { text: "个人价值观和特殊情况", value: "F" }
    ]},
    { id: 12, text: "你更喜欢：", options: [
        { text: "有明确的结构和计划", value: "J" },
        { text: "保持开放和灵活", value: "P" }
    ]},
    { id: 13, text: "在团队中，你：", options: [
        { text: "主动发言，分享想法", value: "E" },
        { text: "先倾听，再表达", value: "I" }
    ]},
    { id: 14, text: "你更相信：", options: [
        { text: "经验和传统", value: "S" },
        { text: "创新和新方法", value: "N" }
    ]},
    { id: 15, text: "面对冲突，你：", options: [
        { text: "直接面对，寻求解决方案", value: "T" },
        { text: "考虑他人感受，寻求妥协", value: "F" }
    ]},
    { id: 16, text: "你更喜欢：", options: [
        { text: "完成后再开始新任务", value: "J" },
        { text: "同时处理多个任务", value: "P" }
    ]},
    { id: 17, text: "你的能量来源主要是：", options: [
        { text: "与他人互动", value: "E" },
        { text: "独处和反思", value: "I" }
    ]},
    { id: 18, text: "你更关注：", options: [
        { text: "现在正在发生的事情", value: "S" },
        { text: "未来可能发生的事情", value: "N" }
    ]},
    { id: 19, text: "评价事物时，你更看重：", options: [
        { text: "逻辑性和效率", value: "T" },
        { text: "情感价值和意义", value: "F" }
    ]},
    { id: 20, text: "你更喜欢：", options: [
        { text: "有明确的规则和程序", value: "J" },
        { text: "自由和自发性", value: "P" }
    ]}
];

// 核心层问卷题目（20题）
const CORE_QUESTIONS = [
    { id: 1, text: "你有多愿意尝试新事物？", dimension: "openness", options: [
        { text: "非常愿意，我喜欢探索", value: 0.9 },
        { text: "比较愿意", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太愿意", value: 0.3 },
        { text: "很不愿意，我更喜欢熟悉的事物", value: 0.1 }
    ]},
    { id: 2, text: "你做事有多有条理？", dimension: "conscientiousness", options: [
        { text: "非常有条理，我计划一切", value: 0.9 },
        { text: "比较有条理", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太有条理", value: 0.3 },
        { text: "很随意，很少计划", value: 0.1 }
    ]},
    { id: 3, text: "你在社交场合有多活跃？", dimension: "extraversion", options: [
        { text: "非常活跃，我是焦点", value: 0.9 },
        { text: "比较活跃", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太活跃", value: 0.3 },
        { text: "很安静，喜欢观察", value: 0.1 }
    ]},
    { id: 4, text: "你有多信任他人？", dimension: "agreeableness", options: [
        { text: "非常信任，我相信人性本善", value: 0.9 },
        { text: "比较信任", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太信任", value: 0.3 },
        { text: "很不信任，我比较谨慎", value: 0.1 }
    ]},
    { id: 5, text: "你有多容易感到焦虑？", dimension: "neuroticism", options: [
        { text: "很少焦虑，我很平静", value: 0.1 },
        { text: "偶尔焦虑", value: 0.3 },
        { text: "有时焦虑", value: 0.5 },
        { text: "经常焦虑", value: 0.7 },
        { text: "总是焦虑，我很容易担心", value: 0.9 }
    ]},
    { id: 6, text: "你对艺术和美的敏感度？", dimension: "openness", options: [
        { text: "非常敏感，我热爱艺术", value: 0.9 },
        { text: "比较敏感", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太敏感", value: 0.3 },
        { text: "不敏感，我更关注实用", value: 0.1 }
    ]},
    { id: 7, text: "你完成任务的可靠性？", dimension: "conscientiousness", options: [
        { text: "非常可靠，我总是按时完成", value: 0.9 },
        { text: "比较可靠", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太可靠", value: 0.3 },
        { text: "不可靠，我经常拖延", value: 0.1 }
    ]},
    { id: 8, text: "你在人群中感到舒适吗？", dimension: "extraversion", options: [
        { text: "非常舒适，我享受人群", value: 0.9 },
        { text: "比较舒适", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太舒适", value: 0.3 },
        { text: "很不舒适，我更喜欢小群体", value: 0.1 }
    ]},
    { id: 9, text: "你有多愿意帮助他人？", dimension: "agreeableness", options: [
        { text: "非常愿意，我乐于助人", value: 0.9 },
        { text: "比较愿意", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太愿意", value: 0.3 },
        { text: "不愿意，我更关注自己", value: 0.1 }
    ]},
    { id: 10, text: "你处理压力的能力？", dimension: "neuroticism", options: [
        { text: "很强，我很少被压力影响", value: 0.1 },
        { text: "比较强", value: 0.3 },
        { text: "一般", value: 0.5 },
        { text: "比较弱", value: 0.7 },
        { text: "很弱，压力让我很困扰", value: 0.9 }
    ]},
    { id: 11, text: "你对抽象概念的兴趣？", dimension: "openness", options: [
        { text: "非常感兴趣，我热爱思考", value: 0.9 },
        { text: "比较感兴趣", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太感兴趣", value: 0.3 },
        { text: "不感兴趣，我更喜欢具体事物", value: 0.1 }
    ]},
    { id: 12, text: "你的组织能力？", dimension: "conscientiousness", options: [
        { text: "非常强，我很有条理", value: 0.9 },
        { text: "比较强", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "比较弱", value: 0.3 },
        { text: "很弱，我比较混乱", value: 0.1 }
    ]},
    { id: 13, text: "你主动发起对话的频率？", dimension: "extraversion", options: [
        { text: "经常，我总是主动", value: 0.9 },
        { text: "比较经常", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太经常", value: 0.3 },
        { text: "很少，我通常等待他人", value: 0.1 }
    ]},
    { id: 14, text: "你对他人感受的敏感度？", dimension: "agreeableness", options: [
        { text: "非常敏感，我能察觉细微变化", value: 0.9 },
        { text: "比较敏感", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太敏感", value: 0.3 },
        { text: "不敏感，我更关注事实", value: 0.1 }
    ]},
    { id: 15, text: "你的情绪稳定性？", dimension: "neuroticism", options: [
        { text: "非常稳定，我很少波动", value: 0.1 },
        { text: "比较稳定", value: 0.3 },
        { text: "一般", value: 0.5 },
        { text: "不太稳定", value: 0.7 },
        { text: "很不稳定，我情绪波动大", value: 0.9 }
    ]},
    { id: 16, text: "你对新想法的接受度？", dimension: "openness", options: [
        { text: "非常高，我欢迎新想法", value: 0.9 },
        { text: "比较高", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "比较低", value: 0.3 },
        { text: "很低，我更喜欢传统", value: 0.1 }
    ]},
    { id: 17, text: "你的自律能力？", dimension: "conscientiousness", options: [
        { text: "非常强，我很有自制力", value: 0.9 },
        { text: "比较强", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "比较弱", value: 0.3 },
        { text: "很弱，我容易分心", value: 0.1 }
    ]},
    { id: 18, text: "你在社交中的主导性？", dimension: "extraversion", options: [
        { text: "非常主导，我经常领导", value: 0.9 },
        { text: "比较主导", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太主导", value: 0.3 },
        { text: "很少主导，我更喜欢跟随", value: 0.1 }
    ]},
    { id: 19, text: "你的合作意愿？", dimension: "agreeableness", options: [
        { text: "非常愿意，我热爱合作", value: 0.9 },
        { text: "比较愿意", value: 0.7 },
        { text: "一般", value: 0.5 },
        { text: "不太愿意", value: 0.3 },
        { text: "不愿意，我更喜欢独立", value: 0.1 }
    ]},
    { id: 20, text: "你应对挫折的能力？", dimension: "neuroticism", options: [
        { text: "很强，我很快恢复", value: 0.1 },
        { text: "比较强", value: 0.3 },
        { text: "一般", value: 0.5 },
        { text: "比较弱", value: 0.7 },
        { text: "很弱，挫折让我很沮丧", value: 0.9 }
    ]}
];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('页面加载完成，开始初始化...');
    try {
        initMBTIStep();
        initEntryStep();
        initStyleStep();
        console.log('初始化完成');
    } catch (error) {
        console.error('初始化错误:', error);
        alert('初始化失败，请刷新页面重试。错误: ' + error.message);
    }
});

// MBTI步骤初始化
function initMBTIStep() {
    const knownOption = document.querySelector('.option-card[data-option="known"]');
    const unknownOption = document.querySelector('.option-card[data-option="unknown"]');
    const mbtiNextBtn = document.getElementById('mbti-next-btn');

    if (!knownOption || !unknownOption) {
        console.error('MBTI元素未找到，请检查HTML结构');
        return;
    }

    // 重置MBTI选择状态（返回到初始选择页面）
    function resetMBTISelection() {
        knownOption.classList.remove('selected');
        unknownOption.classList.remove('selected');
        // 恢复两个卡片的显示
        knownOption.style.display = '';
        unknownOption.style.display = '';
        // 恢复卡片宽度
        knownOption.style.width = '';
        knownOption.style.maxWidth = '';
        unknownOption.style.width = '';
        unknownOption.style.maxWidth = '';
        // 隐藏MBTI网格和问卷
        document.getElementById('mbti-grid-container').classList.add('hidden');
        document.getElementById('mbti-questionnaire').classList.add('hidden');
        // 重置状态
        appState.mbti = null;
        appState.mbtiAnswers = [];
        appState.currentMBTIQuestion = 0;
        updateMBTINextButton();
        // 隐藏"上一步"按钮
        updateMBTIPrevButton();
    }

    // 更新"上一步"按钮的显示状态
    function updateMBTIPrevButton() {
        const mbtiPrevBtn = document.getElementById('mbti-prev-btn');
        if (mbtiPrevBtn) {
            const hasSelection = knownOption.classList.contains('selected') || 
                                unknownOption.classList.contains('selected');
            if (hasSelection) {
                mbtiPrevBtn.style.display = 'block';
            } else {
                mbtiPrevBtn.style.display = 'none';
            }
        }
    }

    // 绑定"上一步"按钮
    const mbtiPrevBtn = document.getElementById('mbti-prev-btn');
    if (mbtiPrevBtn) {
        // 初始状态隐藏"上一步"按钮
        mbtiPrevBtn.style.display = 'none';
        mbtiPrevBtn.addEventListener('click', () => {
            resetMBTISelection();
        });
    }

    knownOption.addEventListener('click', (e) => {
        // 阻止事件冒泡，避免点击MBTI卡片或网格容器时触发外层卡片点击
        if (e.target.closest('.mbti-card') || 
            e.target.closest('.mbti-grid-container')) {
            return;
        }
        console.log('点击了"我知道我的MBTI"选项');
        knownOption.classList.add('selected');
        unknownOption.classList.remove('selected');
        // 隐藏右侧的"我不知道我的MBTI"卡片
        unknownOption.style.display = 'none';
        // 调整左侧卡片宽度，使其居中或占据更多空间
        knownOption.style.width = '100%';
        knownOption.style.maxWidth = '100%';
        document.getElementById('mbti-grid-container').classList.remove('hidden');
        document.getElementById('mbti-questionnaire').classList.add('hidden');
        appState.mbtiAnswers = [];
        // 渲染MBTI卡片
        renderMBTICards();
        // 重置选择
        appState.mbti = null;
        updateMBTINextButton();
        updateMBTIPrevButton();
    });

    unknownOption.addEventListener('click', () => {
        console.log('点击了"我不知道我的MBTI"选项');
        unknownOption.classList.add('selected');
        knownOption.classList.remove('selected');
        // 隐藏左侧的"我知道我的MBTI"卡片
        knownOption.style.display = 'none';
        // 调整右侧卡片宽度
        unknownOption.style.width = '100%';
        unknownOption.style.maxWidth = '100%';
        document.getElementById('mbti-grid-container').classList.add('hidden');
        document.getElementById('mbti-questionnaire').classList.remove('hidden');
        renderMBTIQuestionnaire();
        updateMBTIPrevButton();
    });

    mbtiNextBtn.addEventListener('click', () => {
        if (knownOption.classList.contains('selected') && appState.mbti) {
            console.log('进入下一步，MBTI:', appState.mbti);
            goToStep('entry');
        } else if (unknownOption.classList.contains('selected') && appState.mbtiAnswers.length === MBTI_QUESTIONS.length) {
            calculateMBTI();
            goToStep('entry');
        } else {
            console.log('无法进入下一步:', {
                knownSelected: knownOption.classList.contains('selected'),
                mbti: appState.mbti,
                unknownSelected: unknownOption.classList.contains('selected'),
                answersCount: appState.mbtiAnswers.length
            });
        }
    });
}

// 渲染MBTI卡片
function renderMBTICards() {
    const grid = document.getElementById('mbti-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    MBTI_TYPES.forEach(mbti => {
        const card = document.createElement('div');
        card.className = 'mbti-card';
        card.dataset.mbti = mbti.code;
        
        if (appState.mbti === mbti.code) {
            card.classList.add('selected');
        }
        
        card.innerHTML = `
            <div class="mbti-card-icon" style="color: ${mbti.color}">${mbti.icon}</div>
            <div class="mbti-card-code" style="color: ${mbti.color}">${mbti.code}</div>
            <div class="mbti-card-name">${mbti.name}</div>
            <div class="mbti-card-desc">${mbti.desc}</div>
        `;
        
        card.addEventListener('click', () => {
            // 移除其他卡片的选中状态
            document.querySelectorAll('.mbti-card').forEach(c => {
                c.classList.remove('selected');
            });
            card.classList.add('selected');
            appState.mbti = mbti.code;
            console.log('选择的MBTI:', appState.mbti);
            updateMBTINextButton();
        });
        
        grid.appendChild(card);
    });
}


// 渲染MBTI问卷
function renderMBTIQuestionnaire() {
    const container = document.getElementById('mbti-questions-container');
    container.innerHTML = '';
    
    // 重置当前题目索引
    appState.currentMBTIQuestionIndex = 0;

    MBTI_QUESTIONS.forEach((question, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-item';
        questionDiv.style.display = index === 0 ? 'block' : 'none';
        questionDiv.dataset.index = index;

        const questionText = document.createElement('div');
        questionText.className = 'question-text';
        questionText.textContent = `${question.id}. ${question.text}`;

        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'question-options';

        question.options.forEach(option => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'question-option';
            optionDiv.textContent = option.text;
            optionDiv.dataset.value = option.value;
            
            // 如果之前已回答过，标记为选中
            if (appState.mbtiAnswers[index] === option.value) {
                optionDiv.classList.add('selected');
            }
            
            optionDiv.addEventListener('click', () => {
                // 移除其他选项的选中状态
                optionsDiv.querySelectorAll('.question-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                optionDiv.classList.add('selected');
                
                // 保存答案
                appState.mbtiAnswers[index] = option.value;
                
                // 延迟显示下一题
                setTimeout(() => {
                    showNextMBTIQuestion(index);
                }, 300);
            });
            optionsDiv.appendChild(optionDiv);
        });
        
        // 添加导航按钮
        const navButtons = document.createElement('div');
        navButtons.className = 'question-nav-buttons';
        
        const prevButton = document.createElement('button');
        prevButton.className = 'btn-nav btn-nav-prev';
        prevButton.textContent = '← 上一题';
        prevButton.disabled = index === 0;
        prevButton.addEventListener('click', (e) => {
            e.stopPropagation();
            showPrevMBTIQuestion(index);
        });
        
        const nextButton = document.createElement('button');
        nextButton.className = 'btn-nav btn-nav-next';
        nextButton.textContent = '下一题 →';
        nextButton.disabled = index === MBTI_QUESTIONS.length - 1;
        nextButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (appState.mbtiAnswers[index]) {
                showNextMBTIQuestion(index);
            } else {
                alert('请先选择答案');
            }
        });
        
        navButtons.appendChild(prevButton);
        navButtons.appendChild(nextButton);
        
        questionDiv.appendChild(questionText);
        questionDiv.appendChild(optionsDiv);
        questionDiv.appendChild(navButtons);
        container.appendChild(questionDiv);
    });

    updateMBTIProgress();
    updateMBTIQuestionNav();
}

// 显示上一题（MBTI）
function showPrevMBTIQuestion(currentIndex) {
    if (currentIndex > 0) {
        const questions = document.querySelectorAll('#mbti-questions-container .question-item');
        questions[currentIndex].style.display = 'none';
        questions[currentIndex - 1].style.display = 'block';
        appState.currentMBTIQuestionIndex = currentIndex - 1;
        updateMBTIProgress();
        updateMBTIQuestionNav();
    }
}

// 更新MBTI问卷导航按钮状态
function updateMBTIQuestionNav() {
    const questions = document.querySelectorAll('#mbti-questions-container .question-item');
    questions.forEach((question, index) => {
        const prevBtn = question.querySelector('.btn-nav-prev');
        const nextBtn = question.querySelector('.btn-nav-next');
        
        if (prevBtn) {
            prevBtn.disabled = index === 0;
        }
        if (nextBtn) {
            nextBtn.disabled = index === MBTI_QUESTIONS.length - 1;
        }
    });
}

// 显示下一题（MBTI）
function showNextMBTIQuestion(currentIndex) {
    const questions = document.querySelectorAll('#mbti-questions-container .question-item');
    questions[currentIndex].style.display = 'none';
    
    if (currentIndex < questions.length - 1) {
        questions[currentIndex + 1].style.display = 'block';
        appState.currentMBTIQuestionIndex = currentIndex + 1;
        updateMBTIProgress();
        updateMBTIQuestionNav();
    } else {
        // 所有题目完成
        updateMBTIProgress();
        updateMBTINextButton();
    }
}

// 更新MBTI进度
function updateMBTIProgress() {
    const answeredCount = appState.mbtiAnswers.filter(a => a !== undefined && a !== null).length;
    const progress = (answeredCount / MBTI_QUESTIONS.length) * 100;
    document.getElementById('mbti-progress').style.width = `${progress}%`;
    document.getElementById('mbti-current').textContent = appState.currentMBTIQuestionIndex + 1;
}

// 更新MBTI下一步按钮
function updateMBTINextButton() {
    const btn = document.getElementById('mbti-next-btn');
    const knownOption = document.querySelector('.option-card[data-option="known"]');
    const unknownOption = document.querySelector('.option-card[data-option="unknown"]');
    
    if (!btn || !knownOption || !unknownOption) {
        console.error('按钮或选项元素未找到');
        return;
    }
    
    const knownSelected = knownOption.classList.contains('selected');
    const unknownSelected = unknownOption.classList.contains('selected');
    
    if (knownSelected && appState.mbti) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    } else if (unknownSelected && appState.mbtiAnswers.length === MBTI_QUESTIONS.length) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    }
    
    console.log('按钮状态更新:', {
        knownSelected,
        unknownSelected,
        mbti: appState.mbti,
        answersCount: appState.mbtiAnswers.length,
        disabled: btn.disabled
    });
}

// 计算MBTI类型
function calculateMBTI() {
    const counts = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
    
    appState.mbtiAnswers.forEach(answer => {
        if (answer) counts[answer]++;
    });
    
    const mbti = 
        (counts.E >= counts.I ? 'E' : 'I') +
        (counts.S >= counts.N ? 'S' : 'N') +
        (counts.T >= counts.F ? 'T' : 'F') +
        (counts.J >= counts.P ? 'J' : 'P');
    
    appState.mbti = mbti;
    console.log('计算的MBTI类型:', mbti);
}

// 进入方式步骤初始化
function initEntryStep() {
    const directCard = document.querySelector('.entry-card[data-entry="direct"]');
    const deepCard = document.querySelector('.entry-card[data-entry="deep"]');
    const entryNextBtn = document.getElementById('entry-next-btn');
    const entryBackBtn = document.getElementById('entry-back-btn');

    directCard.addEventListener('click', () => {
        directCard.classList.add('selected');
        deepCard.classList.remove('selected');
        document.getElementById('core-questionnaire').classList.add('hidden');
        appState.coreAnswers = [];
        entryNextBtn.disabled = false;
    });

    deepCard.addEventListener('click', () => {
        deepCard.classList.add('selected');
        directCard.classList.remove('selected');
        document.getElementById('core-questionnaire').classList.remove('hidden');
        renderCoreQuestionnaire();
        entryNextBtn.disabled = true;
    });

    entryNextBtn.addEventListener('click', () => {
        const directSelected = directCard.classList.contains('selected');
        const deepSelected = deepCard.classList.contains('selected');
        
        if (directSelected) {
            goToStep('style');
        } else if (deepSelected && appState.coreAnswers.length === CORE_QUESTIONS.length) {
            goToStep('style');
        }
    });

    entryBackBtn.addEventListener('click', () => {
        goToStep('mbti');
    });
}

// 渲染核心层问卷
function renderCoreQuestionnaire() {
    const container = document.getElementById('core-questions-container');
    container.innerHTML = '';
    
    // 重置当前题目索引
    appState.currentCoreQuestionIndex = 0;

    CORE_QUESTIONS.forEach((question, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-item';
        questionDiv.style.display = index === 0 ? 'block' : 'none';
        questionDiv.dataset.index = index;

        const questionText = document.createElement('div');
        questionText.className = 'question-text';
        questionText.textContent = `${question.id}. ${question.text}`;

        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'question-options';

        question.options.forEach(option => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'question-option';
            optionDiv.textContent = option.text;
            optionDiv.dataset.value = option.value;
            
            // 如果之前已回答过，标记为选中
            if (appState.coreAnswers[index] && appState.coreAnswers[index].value === option.value) {
                optionDiv.classList.add('selected');
            }
            
            optionDiv.addEventListener('click', () => {
                optionsDiv.querySelectorAll('.question-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                optionDiv.classList.add('selected');
                
                appState.coreAnswers[index] = {
                    dimension: question.dimension,
                    value: option.value
                };
                
                setTimeout(() => {
                    showNextCoreQuestion(index);
                }, 300);
            });
            optionsDiv.appendChild(optionDiv);
        });
        
        // 添加导航按钮
        const navButtons = document.createElement('div');
        navButtons.className = 'question-nav-buttons';
        
        const prevButton = document.createElement('button');
        prevButton.className = 'btn-nav btn-nav-prev';
        prevButton.textContent = '← 上一题';
        prevButton.disabled = index === 0;
        prevButton.addEventListener('click', (e) => {
            e.stopPropagation();
            showPrevCoreQuestion(index);
        });
        
        const nextButton = document.createElement('button');
        nextButton.className = 'btn-nav btn-nav-next';
        nextButton.textContent = '下一题 →';
        nextButton.disabled = index === CORE_QUESTIONS.length - 1;
        nextButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (appState.coreAnswers[index]) {
                showNextCoreQuestion(index);
            } else {
                alert('请先选择答案');
            }
        });
        
        navButtons.appendChild(prevButton);
        navButtons.appendChild(nextButton);
        
        questionDiv.appendChild(questionText);
        questionDiv.appendChild(optionsDiv);
        questionDiv.appendChild(navButtons);
        container.appendChild(questionDiv);
    });

    updateCoreProgress();
    updateCoreQuestionNav();
}

// 显示上一题（核心层）
function showPrevCoreQuestion(currentIndex) {
    if (currentIndex > 0) {
        const questions = document.querySelectorAll('#core-questions-container .question-item');
        questions[currentIndex].style.display = 'none';
        questions[currentIndex - 1].style.display = 'block';
        appState.currentCoreQuestionIndex = currentIndex - 1;
        updateCoreProgress();
        updateCoreQuestionNav();
    }
}

// 更新核心层问卷导航按钮状态
function updateCoreQuestionNav() {
    const questions = document.querySelectorAll('#core-questions-container .question-item');
    questions.forEach((question, index) => {
        const prevBtn = question.querySelector('.btn-nav-prev');
        const nextBtn = question.querySelector('.btn-nav-next');
        
        if (prevBtn) {
            prevBtn.disabled = index === 0;
        }
        if (nextBtn) {
            nextBtn.disabled = index === CORE_QUESTIONS.length - 1;
        }
    });
}

// 显示下一题（核心层）
function showNextCoreQuestion(currentIndex) {
    const questions = document.querySelectorAll('#core-questions-container .question-item');
    questions[currentIndex].style.display = 'none';
    
    if (currentIndex < questions.length - 1) {
        questions[currentIndex + 1].style.display = 'block';
        appState.currentCoreQuestionIndex = currentIndex + 1;
        updateCoreProgress();
        updateCoreQuestionNav();
    } else {
        updateCoreProgress();
        document.getElementById('entry-next-btn').disabled = false;
    }
}

// 更新核心层进度
function updateCoreProgress() {
    const answeredCount = appState.coreAnswers.filter(a => a !== undefined && a !== null).length;
    const progress = (answeredCount / CORE_QUESTIONS.length) * 100;
    document.getElementById('core-progress').style.width = `${progress}%`;
    document.getElementById('core-current').textContent = appState.currentCoreQuestionIndex + 1;
}

// 风格步骤初始化
function initStyleStep() {
    const skipCard = document.querySelector('.style-card[data-style="skip"]');
    const uploadCard = document.querySelector('.style-card[data-style="upload"]');
    const chatInput = document.getElementById('chat-input');
    const wechatNameInput = document.getElementById('wechat-name');
    const relationshipSelect = document.getElementById('relationship-select');
    const customRelationshipInput = document.getElementById('custom-relationship');
    const customRelationshipGroup = document.getElementById('custom-relationship-group');
    const styleNextBtn = document.getElementById('style-next-btn');
    const styleBackBtn = document.getElementById('style-back-btn');

    // 关系选择变化时显示/隐藏自定义关系输入框
    relationshipSelect.addEventListener('change', () => {
        if (relationshipSelect.value === '其他') {
            customRelationshipGroup.classList.remove('hidden');
        } else {
            customRelationshipGroup.classList.add('hidden');
            customRelationshipInput.value = '';
        }
        updateStyleNextButton();
    });

    // 更新"生成数字孪生"按钮状态
    function updateStyleNextButton() {
        if (skipCard.classList.contains('selected')) {
            styleNextBtn.disabled = false;
        } else if (uploadCard.classList.contains('selected')) {
            const hasWechatName = wechatNameInput.value.trim() !== '';
            const hasRelationship = relationshipSelect.value !== '';
            const hasCustomRelationship = relationshipSelect.value !== '其他' || customRelationshipInput.value.trim() !== '';
            const hasChatHistory = chatInput.value.trim() !== '';
            styleNextBtn.disabled = !(hasWechatName && hasRelationship && hasCustomRelationship && hasChatHistory);
        } else {
            styleNextBtn.disabled = true;
        }
    }

    skipCard.addEventListener('click', () => {
        skipCard.classList.add('selected');
        uploadCard.classList.remove('selected');
        document.getElementById('chat-upload-section').classList.add('hidden');
        appState.chatHistory = null;
        appState.wechatName = '';
        appState.relationship = '';
        updateStyleNextButton();
    });

    uploadCard.addEventListener('click', () => {
        uploadCard.classList.add('selected');
        skipCard.classList.remove('selected');
        document.getElementById('chat-upload-section').classList.remove('hidden');
        updateStyleNextButton();
    });

    wechatNameInput.addEventListener('input', updateStyleNextButton);
    customRelationshipInput.addEventListener('input', updateStyleNextButton);
    chatInput.addEventListener('input', updateStyleNextButton);

    styleNextBtn.addEventListener('click', async () => {
        if (uploadCard.classList.contains('selected')) {
            appState.chatHistory = chatInput.value.trim();
            appState.wechatName = wechatNameInput.value.trim();
            const relationship = relationshipSelect.value === '其他' 
                ? customRelationshipInput.value.trim() 
                : relationshipSelect.value;
            appState.relationship = relationship;
        }
        await generateDigitalTwin();
    });

    styleBackBtn.addEventListener('click', () => {
        goToStep('entry');
    });
}

// 步骤切换
function goToStep(step) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${step}`).classList.add('active');
    appState.currentStep = step;
}

// 解析微信聊天记录
function parseWeChatChat(chatText) {
    const lines = chatText.trim().split('\n');
    const messages = [];
    let currentDate = null;
    
    const datePattern = /—————\s*(\d{4}-\d{2}-\d{2})\s*—————/;
    const messagePattern = /^(.+?)\s+(\d{1,2}:\d{2})$/;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const dateMatch = line.match(datePattern);
        if (dateMatch) {
            currentDate = dateMatch[1];
            continue;
        }
        
        const messageMatch = line.match(messagePattern);
        if (messageMatch && currentDate) {
            const sender = messageMatch[1].trim();
            const time = messageMatch[2].trim();
            
            // 收集消息内容
            const contentLines = [];
            i++;
            while (i < lines.length) {
                const nextLine = lines[i].trim();
                if (!nextLine || nextLine.match(datePattern) || nextLine.match(messagePattern)) {
                    i--;
                    break;
                }
                contentLines.push(nextLine);
                i++;
            }
            
            const content = contentLines.join('\n');
            if (content) {
                messages.push({
                    sender,
                    content,
                    timestamp: `${currentDate} ${time}`
                });
            }
        }
    }
    
    return messages;
}

// 提取JSON字符串（处理markdown代码块）
function extractJSON(text) {
    if (!text) return null;
    
    // 移除首尾空白
    text = text.trim();
    
    // 如果包含markdown代码块，提取其中的内容
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
        text = jsonBlockMatch[1].trim();
    }
    
    // 查找第一个 { 和最后一个 }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        text = text.substring(firstBrace, lastBrace + 1);
    }
    
    return text;
}

// 定义期望的JSON Schema（用于严格JSON输出）
// 注意：Gemini API不支持数组形式的type（如["object", "null"]），所以可空字段通过不在required中来实现
function getResponseJsonSchema() {
    return {
        "type": "object",
        "properties": {
            "core_traits": {
                "type": "object",
                "properties": {
                    "mbti": {"type": "string"},
                    "big_five": {
                        "type": "object",
                        "properties": {
                            "openness": {"type": "number", "minimum": 0, "maximum": 1},
                            "conscientiousness": {"type": "number", "minimum": 0, "maximum": 1},
                            "extraversion": {"type": "number", "minimum": 0, "maximum": 1},
                            "agreeableness": {"type": "number", "minimum": 0, "maximum": 1},
                            "neuroticism": {"type": "number", "minimum": 0, "maximum": 1}
                        },
                        "required": ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"]
                    },
                    "values": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    "defense_mechanism": {"type": "string"}
                },
                "required": ["mbti"]
            },
            "speaking_style": {
                "type": "object",
                "properties": {
                    "sentence_length": {"type": "string", "enum": ["short", "medium", "long", "mixed"]},
                    "vocabulary_level": {"type": "string", "enum": ["academic", "casual", "network", "mixed"]},
                    "punctuation_habit": {"type": "string", "enum": ["minimal", "standard", "excessive", "mixed"]},
                    "emoji_usage": {
                        "type": "object",
                        "properties": {
                            "frequency": {"type": "string", "enum": ["none", "low", "medium", "high"]},
                            "preferred": {
                                "type": "array",
                                "items": {"type": "string"}
                            },
                            "avoided": {
                                "type": "array",
                                "items": {"type": "string"}
                            }
                        },
                        "required": ["frequency", "preferred", "avoided"]
                    },
                    "catchphrases": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    "tone_markers": {
                        "type": "array",
                        "items": {"type": "string"}
                    }
                },
                "required": ["sentence_length", "vocabulary_level", "punctuation_habit", "emoji_usage", "catchphrases", "tone_markers"]
            }
        },
        "required": ["core_traits"]
    };
}

// 保存原始输出到本地存储和文件
function saveRawOutput(prompt, response, parsedData) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logEntry = {
        timestamp: new Date().toISOString(),
        prompt: prompt,
        rawResponse: response,
        parsedData: parsedData
    };
    
    // 保存到 localStorage（保留最近10次）
    try {
        const logs = JSON.parse(localStorage.getItem('gemini_logs') || '[]');
        logs.unshift(logEntry);
        if (logs.length > 10) {
            logs.pop(); // 只保留最近10次
        }
        localStorage.setItem('gemini_logs', JSON.stringify(logs));
        console.log('✅ 日志已保存到 localStorage');
    } catch (e) {
        console.warn('保存到 localStorage 失败:', e);
    }
    
    // 下载为JSON文件
    try {
        const blob = new Blob([JSON.stringify(logEntry, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gemini_output_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('✅ 原始输出已下载为文件');
    } catch (e) {
        console.warn('下载文件失败:', e);
    }
}

// 调用Gemini API（使用官方 REST API，严格JSON输出）
async function callGeminiAPI(prompt, systemInstruction = null, useStrictJson = false) {
    try {
        // 构建请求体，符合官方 API 格式
        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };

        // 添加系统指令（如果提供）
        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{
                    text: systemInstruction
                }]
            };
        }
        
        // 如果启用严格JSON模式，添加响应配置（参考官方文档）
        if (useStrictJson) {
            requestBody.generationConfig = {
                response_mime_type: "application/json",
                response_schema: getResponseJsonSchema()
            };
            console.log('🔒 启用严格JSON输出模式，使用JSON Schema验证');
        }

        console.log('调用 Gemini API:', {
            model: GEMINI_MODEL,
            url: GEMINI_API_URL.replace(GEMINI_API_KEY, '***'),
            promptLength: prompt.length
        });

        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API 错误响应:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`API调用失败: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('Gemini API 响应数据:', data);
        
        // 检查响应格式
        if (!data.candidates || !data.candidates[0]) {
            console.error('API 响应格式错误 - 无 candidates:', data);
            throw new Error('API返回格式错误: 无 candidates');
        }

        const candidate = data.candidates[0];
        
        // 检查是否有安全过滤
        if (candidate.finishReason === 'SAFETY') {
            throw new Error('内容被安全过滤器拦截，请修改提示词后重试');
        }

        if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
            console.error('API 响应格式错误 - 无 content/parts:', candidate);
            throw new Error('API返回格式错误: 无 content/parts');
        }
        
        const responseText = candidate.content.parts[0].text;
        console.log('Gemini API 成功返回，文本长度:', responseText.length);
        
        // 保存原始响应（用于后续保存功能）
        window.lastGeminiRawResponse = {
            rawResponse: data,
            textResponse: responseText,
            timestamp: new Date().toISOString()
        };
        
        return responseText;
    } catch (error) {
        console.error('Gemini API调用错误:', error);
        // 提供更友好的错误信息
        if (error.message.includes('Failed to fetch')) {
            throw new Error('网络连接失败，请检查网络连接后重试');
        } else if (error.message.includes('401') || error.message.includes('403')) {
            throw new Error('API 密钥无效或权限不足，请检查 API 配置');
        } else if (error.message.includes('429')) {
            throw new Error('API 调用频率过高，请稍后再试');
        }
        throw error;
    }
}

// MBTI到价值观和防御机制的映射
const MBTI_VALUES_MAP = {
    'INTJ': ['独立', '效率', '创新', '逻辑', '远见'],
    'INTP': ['真理', '逻辑', '创新', '自由', '知识'],
    'ENTJ': ['效率', '成就', '领导力', '战略', '成功'],
    'ENTP': ['创新', '自由', '挑战', '探索', '辩论'],
    'INFJ': ['理想', '深度', '真诚', '成长', '意义'],
    'INFP': ['审美', '真诚', '自由', '创造力', '深度'],
    'ENFJ': ['和谐', '成长', '影响', '合作', '意义'],
    'ENFP': ['自由', '创造力', '热情', '可能性', '成长'],
    'ISTJ': ['责任', '秩序', '可靠', '传统', '稳定'],
    'ISFJ': ['责任', '和谐', '关怀', '传统', '稳定'],
    'ESTJ': ['效率', '秩序', '责任', '成就', '传统'],
    'ESFJ': ['和谐', '关怀', '合作', '责任', '传统'],
    'ISTP': ['自由', '实用', '独立', '效率', '探索'],
    'ISFP': ['审美', '和谐', '自由', '创造力', '个人价值'],
    'ESTP': ['行动', '自由', '刺激', '实用', '冒险'],
    'ESFP': ['快乐', '自由', '体验', '社交', '当下']
};

const MBTI_DEFENSE_MECHANISM_MAP = {
    'INTJ': 'Intellectualization',
    'INTP': 'Intellectualization',
    'ENTJ': 'Rationalization',
    'ENTP': 'Rationalization',
    'INFJ': 'Intellectualization',
    'INFP': 'Sublimation',
    'ENFJ': 'Sublimation',
    'ENFP': 'Sublimation',
    'ISTJ': 'Repression',
    'ISFJ': 'Repression',
    'ESTJ': 'Rationalization',
    'ESFJ': 'Sublimation',
    'ISTP': 'Displacement',
    'ISFP': 'Sublimation',
    'ESTP': 'Denial',
    'ESFP': 'Humor'
};

// 根据Big Five分数调整价值观
function adjustValuesByBigFive(baseValues, bigFiveScores) {
    const adjustedValues = [...baseValues];
    
    // 根据Big Five分数添加或调整价值观
    if (bigFiveScores.openness > 0.7) {
        if (!adjustedValues.includes('创新')) adjustedValues.push('创新');
        if (!adjustedValues.includes('探索')) adjustedValues.push('探索');
    }
    if (bigFiveScores.conscientiousness > 0.7) {
        if (!adjustedValues.includes('责任')) adjustedValues.push('责任');
        if (!adjustedValues.includes('秩序')) adjustedValues.push('秩序');
    }
    if (bigFiveScores.extraversion > 0.7) {
        if (!adjustedValues.includes('社交')) adjustedValues.push('社交');
        if (!adjustedValues.includes('合作')) adjustedValues.push('合作');
    }
    if (bigFiveScores.agreeableness > 0.7) {
        if (!adjustedValues.includes('和谐')) adjustedValues.push('和谐');
        if (!adjustedValues.includes('关怀')) adjustedValues.push('关怀');
    }
    if (bigFiveScores.neuroticism < 0.3) {
        if (!adjustedValues.includes('稳定')) adjustedValues.push('稳定');
    }
    
    // 返回3-5个价值观
    return adjustedValues.slice(0, 5);
}

// 根据Big Five分数调整防御机制
function adjustDefenseMechanismByBigFive(baseDefenseMechanism, bigFiveScores) {
    // 如果神经质分数很高，可能更倾向于使用某些防御机制
    if (bigFiveScores.neuroticism > 0.7) {
        // 高神经质可能更倾向于使用否认或压抑
        if (baseDefenseMechanism === 'Intellectualization') {
            return 'Repression';
        }
    }
    
    // 如果开放性很高，可能更倾向于使用升华
    if (bigFiveScores.openness > 0.8 && baseDefenseMechanism !== 'Sublimation') {
        return 'Sublimation';
    }
    
    return baseDefenseMechanism;
}

// 本地生成核心层数据
function generateCoreTraitsLocally(mbti, bigFiveScores) {
    // 获取基础价值观
    const baseValues = MBTI_VALUES_MAP[mbti] || ['真诚', '自由', '成长'];
    
    // 根据Big Five调整价值观
    const values = adjustValuesByBigFive(baseValues, bigFiveScores);
    
    // 获取基础防御机制
    let defenseMechanism = MBTI_DEFENSE_MECHANISM_MAP[mbti] || 'Rationalization';
    
    // 根据Big Five调整防御机制
    defenseMechanism = adjustDefenseMechanismByBigFive(defenseMechanism, bigFiveScores);
    
    return {
        mbti: mbti,
        big_five: {
            openness: parseFloat(bigFiveScores.openness.toFixed(2)),
            conscientiousness: parseFloat(bigFiveScores.conscientiousness.toFixed(2)),
            extraversion: parseFloat(bigFiveScores.extraversion.toFixed(2)),
            agreeableness: parseFloat(bigFiveScores.agreeableness.toFixed(2)),
            neuroticism: parseFloat(bigFiveScores.neuroticism.toFixed(2))
        },
        values: values,
        defense_mechanism: defenseMechanism
    };
}

// 生成数字孪生
async function generateDigitalTwin() {
    goToStep('generating');
    
    // 判断用户完成了哪些任务
    const knownOption = document.querySelector('.option-card[data-option="known"]');
    const unknownOption = document.querySelector('.option-card[data-option="unknown"]');
    const directCard = document.querySelector('.entry-card[data-entry="direct"]');
    const deepCard = document.querySelector('.entry-card[data-entry="deep"]');
    const skipCard = document.querySelector('.style-card[data-style="skip"]');
    const uploadCard = document.querySelector('.style-card[data-style="upload"]');
    
    const hasKnownMBTI = knownOption && knownOption.classList.contains('selected');
    const hasUnknownMBTI = unknownOption && unknownOption.classList.contains('selected');
    const hasDirectEntry = directCard && directCard.classList.contains('selected');
    const hasDeepEntry = deepCard && deepCard.classList.contains('selected');
    const hasSkippedStyle = skipCard && skipCard.classList.contains('selected');
    const hasUploadedStyle = uploadCard && uploadCard.classList.contains('selected');
    
    const hasCoreAnswers = appState.coreAnswers.length > 0;
    const hasChatHistory = appState.chatHistory && appState.wechatName;
    
    // 如果只完成了MBTI（直接选择或问卷），不调用AI
    if ((hasKnownMBTI || hasUnknownMBTI) && hasDirectEntry && hasSkippedStyle) {
        console.log('用户只完成了MBTI，不调用AI，直接返回结果');
        appState.personalityProfile = {
            core_traits: {
                mbti: appState.mbti,
                big_five: null,
                values: null,
                defense_mechanism: null
            },
            speaking_style: null,
            dynamic_state: {
                current_mood: "neutral",
                energy_level: 70,
                relationship_map: {}
            },
            interests: [],
            social_goals: [],
            long_term_goals: []
        };
        
        // 等待进度条完成
        await new Promise(resolve => setTimeout(resolve, 1000));
        displayResult();
        return;
    }
    
    // 需要调用AI的情况
    // 进度条逻辑：先快速到99%，然后等待AI响应，最后到100%
    const progressSteps = [
        { text: '正在分析用户数据...', progress: 20 },
        { text: '正在生成完整人格画像...', progress: 60 },
        { text: '正在等待AI分析结果...', progress: 99 }  // 停在99%等待AI
    ];
    
    let currentStep = 0;
    let progressComplete = false;  // 标记进度是否完成
    
    const updateProgress = () => {
        if (currentStep < progressSteps.length) {
            const step = progressSteps[currentStep];
            document.getElementById('generating-title').textContent = step.text;
            document.getElementById('generating-progress-bar').style.width = `${step.progress}%`;
            currentStep++;
            if (currentStep < progressSteps.length) {
                setTimeout(updateProgress, 1500);
            } else {
                // 到达99%后，标记为等待AI响应
                progressComplete = false;
            }
        }
    };
    
    updateProgress();
    
    // 完成进度条的函数（在AI响应后调用）
    const completeProgress = () => {
        if (!progressComplete) {
            progressComplete = true;
            document.getElementById('generating-title').textContent = '生成完成！';
            document.getElementById('generating-progress-bar').style.width = '100%';
        }
    };
    
    try {
        // 计算Big Five评分（如果有核心层问卷）
        let bigFiveScores = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 };
        
        if (hasCoreAnswers) {
            const dimensionScores = { openness: [], conscientiousness: [], extraversion: [], agreeableness: [], neuroticism: [] };
            
            appState.coreAnswers.forEach(answer => {
                if (answer && answer.dimension && answer.value !== undefined) {
                    dimensionScores[answer.dimension].push(answer.value);
                }
            });
            
            Object.keys(dimensionScores).forEach(dim => {
                if (dimensionScores[dim].length > 0) {
                    bigFiveScores[dim] = dimensionScores[dim].reduce((a, b) => a + b, 0) / dimensionScores[dim].length;
                }
            });
        }
        
        // 构建完整的prompt
        let prompt = `你是一位专业的数字孪生人格分析师。请基于以下所有信息，生成用户的完整人格画像。

## 一、MBTI类型信息
`;
        
        // MBTI部分
        if (hasKnownMBTI) {
            prompt += `**用户自己选择的MBTI类型**: ${appState.mbti}

**重要**: 这是用户自己确定的MBTI类型，你必须使用这个类型，不可更改。`;
        } else if (hasUnknownMBTI && appState.mbtiAnswers.length > 0) {
            prompt += `**MBTI问卷答案**（共${appState.mbtiAnswers.length}题）:\n`;
            appState.mbtiAnswers.forEach((answer, index) => {
                if (answer && MBTI_QUESTIONS[index]) {
                    prompt += `问题${index + 1}: ${MBTI_QUESTIONS[index].text}\n`;
                    prompt += `答案: ${answer.text} (值: ${answer.value})\n\n`;
                }
            });
            prompt += `\n请根据以上MBTI问卷答案，确定用户的MBTI类型。`;
        } else {
            prompt += `**MBTI类型**: ${appState.mbti}`;
        }
        
        // 核心层问卷部分（如果用户选择了深入构建）
        if (hasDeepEntry && hasCoreAnswers) {
            prompt += `\n\n## 二、核心层问卷答案
**Big Five评分**（基于问卷计算）: ${JSON.stringify(bigFiveScores, null, 2)}

**核心层问卷答案**（共${appState.coreAnswers.length}题）:\n`;
            appState.coreAnswers.forEach((answer, index) => {
                if (answer && CORE_QUESTIONS[index]) {
                    prompt += `问题${index + 1}: ${CORE_QUESTIONS[index].text}\n`;
                    prompt += `答案: ${answer.text} (值: ${answer.value}, 维度: ${answer.dimension})\n\n`;
                }
            });
        } else {
            prompt += `\n\n## 二、核心层信息
用户选择了直接进入，未完成核心层问卷。`;
            if (hasChatHistory) {
                prompt += `\n**注意**: 虽然没有核心层问卷数据，但你可以基于后续提供的聊天记录，推断用户的Big Five人格特征、价值观和防御机制。`;
            }
        }
        
        // 聊天记录部分（如果用户上传了）- 直接传入所有聊天记录和相关信息
        if (hasChatHistory) {
            const messages = parseWeChatChat(appState.chatHistory);
            const relationshipInfo = appState.relationship ? `\n**聊天对象关系**: ${appState.relationship}` : '';
            
            // 构建完整的聊天记录信息（包括所有消息，不仅仅是用户自己的）
            let chatRecordsText = '';
            if (messages.length > 0) {
                chatRecordsText = `**完整聊天记录**（共${messages.length}条消息）:\n\n`;
                messages.forEach((msg, index) => {
                    chatRecordsText += `[${msg.timestamp}] ${msg.sender}: ${msg.content}\n\n`;
                });
            } else {
                // 如果解析失败，直接使用原始文本
                chatRecordsText = `**原始聊天记录文本**:\n\n${appState.chatHistory}`;
            }
            
            prompt += `\n\n## 三、用户聊天记录
**用户微信名称**: ${appState.wechatName}${relationshipInfo}

${chatRecordsText}

**重要说明**:
- 以上是用户与${appState.relationship || '对方'}的完整聊天记录
- 请识别出用户自己发送的消息（发送者为"${appState.wechatName}"的消息）
- 基于用户自己的消息，分析语言风格特征（表象层）
- 基于完整聊天记录（包括双方的对话），分析用户的性格特征（核心层，如果未完成问卷）
- 聊天记录中的语言风格、表达方式、话题选择、情绪表达等都能反映用户的深层人格特征`;
            
            // 如果用户没有完成核心层问卷，提示AI可以从聊天记录推断
            if (!hasDeepEntry || !hasCoreAnswers) {
                prompt += `\n\n**特别提示**: 用户未完成核心层问卷，请基于以上完整聊天记录，深入分析用户的性格特征，推断Big Five人格评分、价值观和防御机制。`;
            }
        } else {
            prompt += `\n\n## 三、语言风格信息
用户跳过了语言风格提取，未上传聊天记录。`;
        }
        
        // 生成要求
        prompt += `\n\n## 四、生成要求

请生成一个完整的JSON对象，包含以下所有字段：

{
  "core_traits": {
    "mbti": "${hasKnownMBTI ? appState.mbti : '[根据MBTI问卷答案确定]'}",
    "big_five": ${hasDeepEntry && hasCoreAnswers ? JSON.stringify(bigFiveScores, null, 2) : (hasChatHistory ? '{"openness": 0.5, "conscientiousness": 0.5, "extraversion": 0.5, "agreeableness": 0.5, "neuroticism": 0.5}' : 'null')},
    "values": ${hasDeepEntry && hasCoreAnswers ? '["价值观1", "价值观2", "价值观3"]' : (hasChatHistory ? '["价值观1", "价值观2", "价值观3"]' : 'null')},
    "defense_mechanism": ${hasDeepEntry && hasCoreAnswers ? '"防御机制名称"' : (hasChatHistory ? '"防御机制名称"' : 'null')}
  },
  "speaking_style": ${hasChatHistory ? `{
    "sentence_length": "short/medium/long/mixed",
    "vocabulary_level": "academic/casual/network/mixed",
    "punctuation_habit": "minimal/standard/excessive/mixed",
    "emoji_usage": {
      "frequency": "none/low/medium/high",
      "preferred": ["表情1", "表情2", "..."],
      "avoided": ["表情1", "表情2", "..."]
    },
    "catchphrases": ["口头禅1", "口头禅2", "..."],
    "tone_markers": ["语气词1", "语气词2", "..."]
  }` : 'null'}
}

**重要规则**:
1. **MBTI类型**: ${hasKnownMBTI ? `必须使用 "${appState.mbti}"，不可更改` : hasUnknownMBTI ? '根据MBTI问卷答案确定，必须是一个有效的MBTI类型（16种之一）' : `使用 "${appState.mbti}"`}
2. **核心层数据**: 
   - ${hasDeepEntry && hasCoreAnswers ? '根据核心层问卷答案和Big Five评分，生成big_five对象、values数组（3-5个中文词汇）和defense_mechanism字符串（从以下选择：Rationalization, Projection, Denial, Repression, Sublimation, Displacement, ReactionFormation, Humor, Intellectualization）' : ''}
   - ${!hasDeepEntry || !hasCoreAnswers ? (hasChatHistory ? '虽然用户未完成核心层问卷，但你可以基于聊天记录深入分析用户的性格特征，推断big_five对象（包含openness, conscientiousness, extraversion, agreeableness, neuroticism五个0-1之间的数值）、values数组（3-5个中文词汇）和defense_mechanism字符串（从以下选择：Rationalization, Projection, Denial, Repression, Sublimation, Displacement, ReactionFormation, Humor, Intellectualization）。聊天记录中的语言风格、表达方式、话题选择、情绪表达等都能反映用户的深层人格特征。' : '如果信息不足，可以不包含big_five、values和defense_mechanism字段') : ''}
3. **表象层数据**: ${hasChatHistory ? `根据聊天记录进行深度分析，提取语言风格特征。**必须**包含speaking_style对象，其中包含以下所有字段：
   - sentence_length: 句长偏好（short/medium/long/mixed之一）
   - vocabulary_level: 词汇等级（academic/casual/network/mixed之一）
   - punctuation_habit: 标点习惯（minimal/standard/excessive/mixed之一）
   - emoji_usage: 对象，包含frequency（none/low/medium/high之一）、preferred数组（**必须**提取至少5个偏好表情，最好10-15个）、avoided数组
   - catchphrases: **必须**提取至少5个口头禅（最好8-10个），仔细分析聊天记录中重复出现的短语、词汇、句式
   - tone_markers: **必须**提取至少5个语气词（最好6-8个），分析聊天记录中频繁使用的语气词（如：啊、呢、吧、呀、哦、嗯、哈、诶、嘛、呗、捏等）

   **重要**：即使聊天记录较少，也要尽可能提取这些信息。如果确实无法提取，数组可以为空[]，但必须包含所有必需的字段。` : '如果没有聊天记录，不要包含speaking_style字段'}
4. 所有数据必须基于提供的信息，不要编造
5. 如果某个部分信息不足且无法推断，可以不包含对应字段（而不是设置为null）。数组字段如果存在但无数据，应设置为空数组[]

只返回JSON对象，不要包含任何markdown代码块标记或其他文字说明。`;

        console.log('完整的AI Prompt:', prompt);
        
        // 调用Gemini API，启用严格JSON输出模式
        const response = await callGeminiAPI(prompt, null, true);
        
        // 如果使用严格JSON模式，响应应该已经是纯JSON
        let responseJson;
        let fullProfile;
        
        if (response) {
            // 尝试直接解析（严格JSON模式）
            try {
                fullProfile = JSON.parse(response);
                responseJson = response;
                console.log('✅ 使用严格JSON模式，直接解析成功');
            } catch (e) {
                // 如果不是纯JSON，尝试提取JSON
                console.warn('严格JSON模式解析失败，尝试提取JSON:', e);
                responseJson = extractJSON(response);
                if (!responseJson) {
                    throw new Error('无法从API响应中提取JSON数据');
                }
                fullProfile = JSON.parse(responseJson);
            }
        } else {
            throw new Error('API返回为空');
        }
        
        console.log('提取的完整JSON:', responseJson);
        
        // 保存原始输出（prompt、原始响应、解析后的数据）
        if (window.lastGeminiRawResponse) {
            saveRawOutput(prompt, window.lastGeminiRawResponse, fullProfile);
        } else {
            // 如果没有保存原始响应，使用当前响应
            saveRawOutput(prompt, { 
                textResponse: response, 
                rawResponse: null,
                timestamp: new Date().toISOString()
            }, fullProfile);
        }
        console.log('AI返回的完整数据:', JSON.stringify(fullProfile, null, 2));
        console.log('表象层原始数据:', fullProfile.speaking_style);
        
        // 检测和验证AI返回的数据结构
        function validateAIResponse(data) {
            const issues = [];
            
            // 检查核心层数据
            if (!data.core_traits) {
                issues.push('缺少 core_traits 字段');
            } else {
                if (!data.core_traits.mbti) {
                    issues.push('缺少 core_traits.mbti');
                }
            }
            
            // 检查表象层数据
            if (hasChatHistory) {
                if (!data.speaking_style) {
                    issues.push('缺少 speaking_style 字段（用户上传了聊天记录）');
                } else {
                    const style = data.speaking_style;
                    
                    // 检查基本字段
                    if (!style.sentence_length) issues.push('缺少 sentence_length');
                    if (!style.vocabulary_level) issues.push('缺少 vocabulary_level');
                    if (!style.punctuation_habit) issues.push('缺少 punctuation_habit');
                    
                    // 检查emoji_usage
                    if (!style.emoji_usage) {
                        issues.push('缺少 emoji_usage 对象');
                    } else {
                        if (!style.emoji_usage.frequency) issues.push('缺少 emoji_usage.frequency');
                        if (!Array.isArray(style.emoji_usage.preferred)) {
                            issues.push('emoji_usage.preferred 不是数组');
                        } else if (style.emoji_usage.preferred.length === 0) {
                            issues.push('emoji_usage.preferred 是空数组（AI未提取到偏好表情）');
                        } else {
                            console.log(`✓ 提取到 ${style.emoji_usage.preferred.length} 个偏好表情:`, style.emoji_usage.preferred);
                        }
                        
                        if (!Array.isArray(style.emoji_usage.avoided)) {
                            issues.push('emoji_usage.avoided 不是数组');
                        }
                    }
                    
                    // 检查catchphrases
                    if (!Array.isArray(style.catchphrases)) {
                        issues.push('catchphrases 不是数组');
                    } else if (style.catchphrases.length === 0) {
                        issues.push('catchphrases 是空数组（AI未提取到口头禅）');
                    } else {
                        console.log(`✓ 提取到 ${style.catchphrases.length} 个口头禅:`, style.catchphrases);
                    }
                    
                    // 检查tone_markers
                    if (!Array.isArray(style.tone_markers)) {
                        issues.push('tone_markers 不是数组');
                    } else if (style.tone_markers.length === 0) {
                        issues.push('tone_markers 是空数组（AI未提取到语气词）');
                    } else {
                        console.log(`✓ 提取到 ${style.tone_markers.length} 个语气词:`, style.tone_markers);
                    }
                }
            }
            
            if (issues.length > 0) {
                console.warn('⚠️ AI返回数据检测发现问题:');
                issues.forEach(issue => console.warn('  -', issue));
                return false;
            } else {
                console.log('✅ AI返回数据检测通过');
                return true;
            }
        }
        
        const isValid = validateAIResponse(fullProfile);
        if (!isValid && hasChatHistory) {
            console.warn('⚠️ 表象层数据可能不完整，请检查AI返回的数据');
        }
        
        // 处理返回的数据
        let coreTraits = {
            mbti: hasKnownMBTI ? appState.mbti : (fullProfile.core_traits?.mbti || appState.mbti),
            // 如果有核心层问卷，使用问卷数据；如果没有但上传了聊天记录，使用AI推断的数据
            big_five: hasDeepEntry && hasCoreAnswers 
                ? (fullProfile.core_traits?.big_five || bigFiveScores)
                : (hasChatHistory && fullProfile.core_traits?.big_five ? fullProfile.core_traits.big_five : null),
            values: hasDeepEntry && hasCoreAnswers 
                ? (fullProfile.core_traits?.values || null)
                : (hasChatHistory && fullProfile.core_traits?.values ? fullProfile.core_traits.values : null),
            defense_mechanism: hasDeepEntry && hasCoreAnswers 
                ? (fullProfile.core_traits?.defense_mechanism || null)
                : (hasChatHistory && fullProfile.core_traits?.defense_mechanism ? fullProfile.core_traits.defense_mechanism : null)
        };
        
        let speakingStyle = null;
        if (hasChatHistory && fullProfile.speaking_style) {
            const parsedStyle = fullProfile.speaking_style;
            console.log('解析前的表象层数据:', parsedStyle);
            console.log('preferred数组:', parsedStyle.emoji_usage?.preferred);
            console.log('catchphrases数组:', parsedStyle.catchphrases);
            console.log('tone_markers数组:', parsedStyle.tone_markers);
            
            speakingStyle = {
                sentence_length: parsedStyle.sentence_length || "medium",
                vocabulary_level: parsedStyle.vocabulary_level || "casual",
                punctuation_habit: parsedStyle.punctuation_habit || "standard",
                emoji_usage: {
                    frequency: parsedStyle.emoji_usage?.frequency || "medium",
                    preferred: Array.isArray(parsedStyle.emoji_usage?.preferred) 
                        ? parsedStyle.emoji_usage.preferred.filter(item => item && item.trim()).slice(0, 15)
                        : [],
                    avoided: Array.isArray(parsedStyle.emoji_usage?.avoided) 
                        ? parsedStyle.emoji_usage.avoided.filter(item => item && item.trim()).slice(0, 10)
                        : []
                },
                catchphrases: Array.isArray(parsedStyle.catchphrases) 
                    ? parsedStyle.catchphrases.filter(item => item && item.trim()).slice(0, 10)
                    : [],
                tone_markers: Array.isArray(parsedStyle.tone_markers) 
                    ? parsedStyle.tone_markers.filter(item => item && item.trim()).slice(0, 8)
                    : []
            };
            console.log('处理后的表象层数据:', speakingStyle);
            
            // 详细分析报告
            console.log('\n📊 表象层数据分析报告:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`句长偏好: ${speakingStyle.sentence_length}`);
            console.log(`词汇等级: ${speakingStyle.vocabulary_level}`);
            console.log(`标点习惯: ${speakingStyle.punctuation_habit}`);
            console.log(`表情频率: ${speakingStyle.emoji_usage.frequency}`);
            console.log(`偏好表情数量: ${speakingStyle.emoji_usage.preferred.length}`);
            if (speakingStyle.emoji_usage.preferred.length > 0) {
                console.log(`  具体表情: ${speakingStyle.emoji_usage.preferred.join(', ')}`);
            } else {
                console.log('  ⚠️ 未提取到偏好表情');
            }
            console.log(`避免表情数量: ${speakingStyle.emoji_usage.avoided.length}`);
            console.log(`口头禅数量: ${speakingStyle.catchphrases.length}`);
            if (speakingStyle.catchphrases.length > 0) {
                console.log(`  具体口头禅: ${speakingStyle.catchphrases.join(', ')}`);
            } else {
                console.log('  ⚠️ 未提取到口头禅');
            }
            console.log(`语气词数量: ${speakingStyle.tone_markers.length}`);
            if (speakingStyle.tone_markers.length > 0) {
                console.log(`  具体语气词: ${speakingStyle.tone_markers.join(', ')}`);
            } else {
                console.log('  ⚠️ 未提取到语气词');
            }
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        }
        
        // 构建完整的人格画像
        appState.personalityProfile = {
            core_traits: coreTraits,
            speaking_style: speakingStyle,
            dynamic_state: {
                current_mood: "neutral",
                energy_level: 70,
                relationship_map: {}
            },
            interests: [],
            social_goals: [],
            long_term_goals: []
        };
        
        // 完成进度条（AI响应后，从99%到100%）
        completeProgress();
        
        // 等待一下让用户看到100%
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 显示结果
        displayResult();
        
    } catch (error) {
        console.error('生成数字孪生失败:', error);
        alert('生成失败，请重试。错误: ' + error.message);
        goToStep('style');
    }
}

// 显示结果
function displayResult() {
    goToStep('result');
    
    const resultContent = document.getElementById('result-content');
    const profile = appState.personalityProfile;
    
    // 安全检查
    if (!profile || !profile.core_traits) {
        console.error('Profile数据不完整:', profile);
        resultContent.innerHTML = '<div class="result-item">数据加载失败，请重试。</div>';
        return;
    }
    
    let html = `
        <div class="result-section">
            <div class="result-section-title">内核层（CoreTraits）</div>
            <div class="result-item"><strong>MBTI类型:</strong> ${profile.core_traits.mbti || '未知'}</div>`;
    
    // 显示Big Five（如果有且所有属性都存在）
    if (profile.core_traits.big_five && 
        typeof profile.core_traits.big_five.openness === 'number' &&
        typeof profile.core_traits.big_five.conscientiousness === 'number' &&
        typeof profile.core_traits.big_five.extraversion === 'number' &&
        typeof profile.core_traits.big_five.agreeableness === 'number' &&
        typeof profile.core_traits.big_five.neuroticism === 'number') {
        html += `
            <div class="result-item"><strong>Big Five人格:</strong></div>
            <div class="result-item" style="margin-left: 20px;">
                开放性: ${profile.core_traits.big_five.openness.toFixed(2)}<br>
                尽责性: ${profile.core_traits.big_five.conscientiousness.toFixed(2)}<br>
                外向性: ${profile.core_traits.big_five.extraversion.toFixed(2)}<br>
                宜人性: ${profile.core_traits.big_five.agreeableness.toFixed(2)}<br>
                神经质: ${profile.core_traits.big_five.neuroticism.toFixed(2)}
            </div>`;
    } else {
        html += `<div class="result-item"><strong>Big Five人格:</strong> 未完成核心层问卷</div>`;
    }
    
    // 显示价值观（如果有）
    if (profile.core_traits.values && Array.isArray(profile.core_traits.values)) {
        html += `<div class="result-item"><strong>价值观:</strong> ${profile.core_traits.values.join(', ')}</div>`;
    } else {
        html += `<div class="result-item"><strong>价值观:</strong> 未完成核心层问卷</div>`;
    }
    
    // 显示防御机制（如果有）
    if (profile.core_traits.defense_mechanism) {
        html += `<div class="result-item"><strong>防御机制:</strong> ${profile.core_traits.defense_mechanism}</div>`;
    } else {
        html += `<div class="result-item"><strong>防御机制:</strong> 未完成核心层问卷</div>`;
    }
    
    html += `</div>`;
    
    // 显示表象层（如果有）
    if (profile.speaking_style && typeof profile.speaking_style === 'object') {
        const style = profile.speaking_style;
        html += `
        <div class="result-section">
            <div class="result-section-title">表象层（SpeakingStyle）</div>
            <div class="result-item"><strong>句长偏好:</strong> ${style.sentence_length || '未知'}</div>
            <div class="result-item"><strong>词汇等级:</strong> ${style.vocabulary_level || '未知'}</div>
            <div class="result-item"><strong>标点习惯:</strong> ${style.punctuation_habit || '未知'}</div>`;
        
        if (style.emoji_usage && typeof style.emoji_usage === 'object') {
            html += `<div class="result-item"><strong>表情使用频率:</strong> ${style.emoji_usage.frequency || '未知'}</div>`;
            if (Array.isArray(style.emoji_usage.preferred) && style.emoji_usage.preferred.length > 0) {
                html += `<div class="result-item"><strong>偏好表情:</strong> ${style.emoji_usage.preferred.join(' ')} (${style.emoji_usage.preferred.length}个)</div>`;
            } else {
                html += `<div class="result-item" style="color: var(--text-secondary); font-size: 14px;">偏好表情: 未提取到</div>`;
            }
            if (Array.isArray(style.emoji_usage.avoided) && style.emoji_usage.avoided.length > 0) {
                html += `<div class="result-item"><strong>避免表情:</strong> ${style.emoji_usage.avoided.join(' ')}</div>`;
            }
        }
        
        if (Array.isArray(style.catchphrases) && style.catchphrases.length > 0) {
            html += `<div class="result-item"><strong>口头禅 (${style.catchphrases.length}个):</strong> ${style.catchphrases.join('、')}</div>`;
        } else {
            html += `<div class="result-item" style="color: var(--text-secondary); font-size: 14px;">口头禅: 未提取到</div>`;
        }
        
        if (Array.isArray(style.tone_markers) && style.tone_markers.length > 0) {
            html += `<div class="result-item"><strong>语气词 (${style.tone_markers.length}个):</strong> ${style.tone_markers.join('、')}</div>`;
        } else {
            html += `<div class="result-item" style="color: var(--text-secondary); font-size: 14px;">语气词: 未提取到</div>`;
        }
        
        // 调试信息（开发时可见）
        console.log('显示时的表象层数据:', style);
        console.log('preferred长度:', style.emoji_usage?.preferred?.length);
        console.log('catchphrases长度:', style.catchphrases?.length);
        console.log('tone_markers长度:', style.tone_markers?.length);
        
        html += `</div>`;
    } else {
        html += `
        <div class="result-section">
            <div class="result-section-title">表象层（SpeakingStyle）</div>
            <div class="result-item">未上传聊天记录，跳过语言风格提取</div>
        </div>`;
    }
    
    html += `
        <div class="result-section">
            <div class="result-section-title">动态状态（DynamicState）</div>
            <div class="result-item"><strong>当前心情:</strong> ${profile.dynamic_state.current_mood}</div>
            <div class="result-item"><strong>能量值:</strong> ${profile.dynamic_state.energy_level}/100</div>
        </div>
    `;
    
    resultContent.innerHTML = html;
    
    // 绑定下载按钮
    document.getElementById('result-download-btn').addEventListener('click', () => {
        const dataStr = JSON.stringify(appState.personalityProfile, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `digital_twin_${appState.mbti}_${Date.now()}.json`;
        link.click();
    });
    
    // 绑定进入按钮
    document.getElementById('result-enter-btn').addEventListener('click', () => {
        alert('功能开发中，敬请期待！');
    });
}

