// 使用立即执行函数包装，避免变量冲突
(function () {
  'use strict';

  // 使用全局React和ReactDOM
  const { useState, useEffect, useRef, createElement } = React;

  // 创建简单的SVG图标组件（替代lucide-react）
  const createIcon = (name, props = {}) => {
    const { className = 'w-5 h-5', ...rest } = props;
    const icons = {
      X: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('line', { x1: 18, y1: 6, x2: 6, y2: 18 }), createElement('line', { x1: 6, y1: 6, x2: 18, y2: 18 })),
      ArrowRight: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('line', { x1: 5, y1: 12, x2: 19, y2: 12 }), createElement('polyline', { points: '12 5 19 12 12 19' })),
      ArrowLeft: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('line', { x1: 19, y1: 12, x2: 5, y2: 12 }), createElement('polyline', { points: '12 19 5 12 12 5' })),
      Fingerprint: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('path', { d: 'M12 10v2' }), createElement('path', { d: 'M10.268 3a2 2 0 0 1 3.464 0' }), createElement('path', { d: 'M14 12h2' }), createElement('path', { d: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' })),
      Cpu: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('rect', { x: 4, y: 4, width: 16, height: 16, rx: 2, ry: 2 }), createElement('rect', { x: 9, y: 9, width: 6, height: 6 }), createElement('line', { x1: 9, y1: 1, x2: 9, y2: 4 }), createElement('line', { x1: 15, y1: 1, x2: 15, y2: 4 }), createElement('line', { x1: 9, y1: 20, x2: 9, y2: 23 }), createElement('line', { x1: 15, y1: 20, x2: 15, y2: 23 }), createElement('line', { x1: 20, y1: 9, x2: 23, y2: 9 }), createElement('line', { x1: 20, y1: 14, x2: 23, y2: 14 }), createElement('line', { x1: 1, y1: 9, x2: 4, y2: 9 }), createElement('line', { x1: 1, y1: 14, x2: 4, y2: 14 })),
      User: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }), createElement('circle', { cx: 12, cy: 7, r: 4 })),
      Zap: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })),
      Check: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('polyline', { points: '20 6 9 17 4 12' })),
      Upload: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }), createElement('polyline', { points: '17 8 12 3 7 8' }), createElement('line', { x1: 12, y1: 3, x2: 12, y2: 15 })),
      MessageSquare: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' })),
      Shield: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' })),
      Heart: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('path', { d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' })),
      ListOrdered: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('line', { x1: 10, y1: 6, x2: 21, y2: 6 }), createElement('line', { x1: 10, y1: 12, x2: 21, y2: 12 }), createElement('line', { x1: 10, y1: 18, x2: 21, y2: 18 }), createElement('line', { x1: 4, y1: 6, x2: 4.5, y2: 6 }), createElement('line', { x1: 4, y1: 12, x2: 4.5, y2: 12 }), createElement('line', { x1: 4, y1: 18, x2: 4.5, y2: 18 })),
      Image: () => createElement('svg', { ...rest, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, createElement('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2, ry: 2 }), createElement('circle', { cx: 8.5, cy: 8.5, r: 1.5 }), createElement('polyline', { points: '21 15 16 10 5 21' }))
    };
    return icons[name] ? icons[name]() : createElement('div', { className }, '?');
  };

  // 创建图标组件
  const X = (props) => createIcon('X', props);
  const ArrowRight = (props) => createIcon('ArrowRight', props);
  const ArrowLeft = (props) => createIcon('ArrowLeft', props);
  const Fingerprint = (props) => createIcon('Fingerprint', props);
  const Cpu = (props) => createIcon('Cpu', props);
  const User = (props) => createIcon('User', props);
  const Zap = (props) => createIcon('Zap', props);
  const Check = (props) => createIcon('Check', props);
  const Upload = (props) => createIcon('Upload', props);
  const MessageSquare = (props) => createIcon('MessageSquare', props);
  const Shield = (props) => createIcon('Shield', props);
  const Heart = (props) => createIcon('Heart', props);
  const ListOrdered = (props) => createIcon('ListOrdered', props);
  const ImageIcon = (props) => createIcon('Image', props);

  // 直接使用window对象，避免重复声明（在函数内部创建局部引用）
  const w = window;
  const MBTI_TYPES = w.MBTI_TYPES || [];
  const MBTI_QUESTIONS = w.MBTI_QUESTIONS || [];
  const CORE_QUESTIONS = w.CORE_QUESTIONS || [];
  const DEFENSE_QUESTIONS = w.DEFENSE_QUESTIONS || [];
  const ATTACHMENT_QUESTIONS = w.ATTACHMENT_QUESTIONS || [];
  const VALUES_LIST = w.VALUES_LIST || [];
  const scrollWeaverAPI = w.scrollWeaverAPI;

  function CreationWizard({ onClose, onComplete }) {
    // 步骤: 1=MBTI, 2=核心层(BigFive), 3=身份选择, 4=目标选择, 5=生成中/结果
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressText, setProgressText] = useState('');

    // MBTI 状态
    const [mbtiMode, setMbtiMode] = useState(null); // 'known' | 'unknown'
    const [selectedMbti, setSelectedMbti] = useState(null);
    const [mbtiAnswers, setMbtiAnswers] = useState(new Array(MBTI_QUESTIONS.length).fill(null));
    const [currentMbtiQuestion, setCurrentMbtiQuestion] = useState(0);

    // 核心层状态
    const [coreMode, setCoreMode] = useState(null); // 'skip' | 'test'
    const [coreAnswers, setCoreAnswers] = useState(new Array(CORE_QUESTIONS.length).fill(null));
    const [currentCoreQuestion, setCurrentCoreQuestion] = useState(0);

    // 身份选择状态 (新增)
    const [identitySuggestions, setIdentitySuggestions] = useState([]);
    const [selectedIdentity, setSelectedIdentity] = useState('');
    const [customIdentity, setCustomIdentity] = useState('');
    const [loadingIdentity, setLoadingIdentity] = useState(false);

    // 目标选择状态 (新增)
    const [goalSuggestions, setGoalSuggestions] = useState([]);
    const [selectedGoal, setSelectedGoal] = useState('');
    const [customGoal, setCustomGoal] = useState('');
    const [loadingGoal, setLoadingGoal] = useState(false);

    // 获取scroll_id
    const urlParams = new URLSearchParams(window.location.search);
    const scrollId = parseInt(urlParams.get('scroll_id') || '0');

    // 生成结果
    const [generatedProfile, setGeneratedProfile] = useState(null);

    // 步骤标题和描述
    const steps = [
      { title: "人格基石 (MBTI)", icon: <Fingerprint className="w-5 h-5" />, desc: "确定你的 MBTI 类型，构建人格的基础框架。" },
      { title: "核心特质 (Big Five)", icon: <Cpu className="w-5 h-5" />, desc: "通过大五人格测试，深入刻画你的性格维度。" },
      { title: "选择身份", icon: <User className="w-5 h-5" />, desc: "选择或输入你在这个世界中的身份。" },
      { title: "设定目标", icon: <Zap className="w-5 h-5" />, desc: "设定你在这个世界中想要达成的目标。" },
      { title: "启程", icon: <Check className="w-5 h-5" />, desc: "准备进入世界..." },
    ];

    // 计算MBTI结果 (Updated for Likert)
    const calculateMbti = () => {
      const scores = { EI: 0, SN: 0, TF: 0, JP: 0 };

      mbtiAnswers.forEach((value, index) => {
        if (!value) return;
        const question = MBTI_QUESTIONS[index];

        // 计算得分：如果direction为正，value直接加；如果为负，(6-value)加
        // 范围 1-5
        let score = value;
        if (question.direction === -1) {
          score = 6 - value;
        }
        scores[question.dimension] += score;
      });

      // 每维度5题，满分25，中值15
      // >15 为正向维度 (E, N, F, P)
      // <=15 为负向维度 (I, S, T, J)
      return (
        (scores.EI > 15 ? 'E' : 'I') +
        (scores.SN > 15 ? 'N' : 'S') +
        (scores.TF > 15 ? 'F' : 'T') +
        (scores.JP > 15 ? 'P' : 'J')
      );
    };

    // 处理下一步
    const handleNext = async () => {
      if (step === 1) {
        if (mbtiMode === 'unknown' && mbtiAnswers.filter(a => a).length === MBTI_QUESTIONS.length) {
          const calculated = calculateMbti();
          setSelectedMbti(calculated);
        }
        setStep(2);
      } else if (step === 2) {
        // 进入身份选择步骤，先加载AI建议
        setStep(3);
        await loadIdentitySuggestions();
      } else if (step === 3) {
        // 身份选择完成，进入目标选择
        setStep(4);
        await loadGoalSuggestions();
      } else if (step === 4) {
        // 目标选择完成，创建用户Agent
        setStep(5);
        await createUserAgentAndFinish();
      }
    };

    // 加载身仼AI建议
    const loadIdentitySuggestions = async () => {
      if (identitySuggestions.length > 0) return; // 已加载
      setLoadingIdentity(true);
      try {
        const bigFive = calculateBigFive();
        const result = await scrollWeaverAPI.suggestIdentity(scrollId, selectedMbti, bigFive);
        setIdentitySuggestions(result.suggestions || []);
      } catch (error) {
        console.error('Failed to load identity suggestions:', error);
        // 使用默认建议
        setIdentitySuggestions(['旅行者', '学者', '探险家', '观察者']);
      } finally {
        setLoadingIdentity(false);
      }
    };

    // 加载目标AI建议
    const loadGoalSuggestions = async () => {
      if (goalSuggestions.length > 0) return; // 已加载
      setLoadingGoal(true);
      try {
        const identity = selectedIdentity || customIdentity;
        const bigFive = calculateBigFive();
        const result = await scrollWeaverAPI.suggestGoal(scrollId, selectedMbti, bigFive, identity);
        setGoalSuggestions(result.suggestions || []);
      } catch (error) {
        console.error('Failed to load goal suggestions:', error);
        // 使用默认建议
        setGoalSuggestions(['探索这个世界', '结识有趣的人', '寻找未知的秘密', '体验新的冒险']);
      } finally {
        setLoadingGoal(false);
      }
    };

    // 计算Big Five分数
    const calculateBigFive = () => {
      if (coreMode !== 'test') {
        // 默认值
        return { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 };
      }
      const scores = { O: 0, C: 0, E: 0, A: 0, N: 0 };
      coreAnswers.forEach((answer, index) => {
        if (answer && CORE_QUESTIONS[index]) { // Ensure question exists
          let value = answer; // Assuming answer is the value directly
          const question = CORE_QUESTIONS[index];
          if (question.direction === -1) value = 6 - value;
          scores[question.dimension] += value;
        }
      });
      // 归一化到0-1范围
      const maxScore = 20; // 4题/维度 * 5分 (assuming 4 questions per dimension, max score 5 per question)
      return {
        openness: scores.O / maxScore,
        conscientiousness: scores.C / maxScore,
        extraversion: scores.E / maxScore,
        agreeableness: scores.A / maxScore,
        neuroticism: scores.N / maxScore
      };
    };

    // 创建用户Agent并完成
    const createUserAgentAndFinish = async () => {
      setLoading(true);
      try {
        const identity = selectedIdentity || customIdentity;
        const goal = selectedGoal || customGoal;
        const bigFive = calculateBigFive();

        const result = await scrollWeaverAPI.createUserAgent(
          scrollId,
          selectedMbti,
          bigFive,
          identity,
          goal,
          null // nickname使用默认
        );

        if (result.success) {
          // 设置生成的profile用于显示
          setGeneratedProfile({
            core_traits: { mbti: selectedMbti, big_five: bigFive },
            identity: identity,
            goal: goal,
            role_code: result.role_code
          });
          setProgress(100);
          setProgressText('创建完成！');
          setLoading(false);
        } else {
          throw new Error(result.detail || '创建失败');
        }
      } catch (error) {
        console.error('Create user agent error:', error);
        alert('创建失败: ' + error.message);
        setStep(4); // 返回上一步
        setLoading(false);
      }
    };

    // 生成画像
    const generateProfile = async () => {
      setLoading(true);
      const progressSteps = [
        { p: 20, t: '正在分析人格数据...' },
        { p: 40, t: '正在构建思维模型...' },
        { p: 60, t: '正在提取语言特征...' },
        { p: 80, t: '正在生成完整画像...' },
      ];

      let currentStep = 0;
      const interval = setInterval(() => {
        if (currentStep < progressSteps.length) {
          setProgress(progressSteps[currentStep].p);
          setProgressText(progressSteps[currentStep].t);
          currentStep++;
        }
      }, 800);

      try {
        const payload = {
          mbti_type: selectedMbti,
          mbti_answers: mbtiMode === 'unknown' ? mbtiAnswers : null,
          big_five_answers: coreMode === 'test' ? coreAnswers : null,
          // 新增 Phase 2 数据
          defense_answers: nuancedMode === 'test' ? defenseAnswers : null,
          attachment_answers: nuancedMode === 'test' ? attachmentAnswers : null,
          values_order: nuancedMode === 'test' ? valuesOrder.map(v => v.text) : null,

          chat_history: styleMode === 'upload' ? (chatHistory.length > 50000 ? chatHistory.substring(0, 50000) : chatHistory) : null,
          user_name: wechatName,
          relationship: relationship
        };

        // 调用ScrollWeaver后端API生成画像
        const result = await scrollWeaverAPI.generateDigitalTwinProfile(payload);

        clearInterval(interval);
        setProgress(100);
        setProgressText('生成完成！');

        if (result.success) {
          setGeneratedProfile(result.profile);
        } else {
          const errorMessage = result.detail || result.error || '未知错误';
          console.error('Generation failed:', result);
          alert('生成失败: ' + errorMessage);
          setStep(4); // 返回上一步
        }
      } catch (error) {
        clearInterval(interval);
        console.error('Generation error:', error);
        alert('生成出错: ' + error.message);
        setStep(4);
      } finally {
        setLoading(false);
      }
    };

    // 确认并进入世界
    const handleConfirm = async () => {
      if (!generatedProfile) return;

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const currentScrollId = urlParams.get('scroll_id') || scrollId;
        const roleCode = generatedProfile.role_code;

        // 跳转到世界视图页面
        if (roleCode && currentScrollId) {
          window.location.href = `/frontend/pages/world-view.html?scroll_id=${currentScrollId}&role_code=${roleCode}&cross_type=self`;
        } else if (onComplete) {
          onComplete({ roleCode, profile: generatedProfile });
        } else {
          // 回退到crossworld-select
          window.location.href = `/frontend/pages/crossworld-select.html?scroll_id=${currentScrollId}`;
        }
      } catch (error) {
        console.error('Redirect error:', error);
        alert('跳转失败: ' + error.message);
      }
    };

    // 渲染MBTI步骤
    const renderMbtiStep = () => {
      if (!mbtiMode) {
        return (
          <div className="grid grid-cols-2 gap-6 h-full">
            <div
              onClick={() => setMbtiMode('known')}
              className="border border-[#d4c4b0] bg-white/50 rounded-xl p-6 cursor-pointer hover:border-[#8b6f47] hover:bg-white transition-all flex flex-col items-center justify-center gap-4 group"
            >
              <div className="w-16 h-16 rounded-full bg-[#8b6f47]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Check className="w-8 h-8 text-[#8b6f47]" />
              </div>
              <h3 className="text-xl font-semibold text-[#6b5537]">我知道我的 MBTI</h3>
              <p className="text-[#a08060] text-center text-sm">直接从 16 种人格类型中选择</p>
            </div>
            <div
              onClick={() => setMbtiMode('unknown')}
              className="border border-[#d4c4b0] bg-white/50 rounded-xl p-6 cursor-pointer hover:border-[#8b6f47] hover:bg-white transition-all flex flex-col items-center justify-center gap-4 group"
            >
              <div className="w-16 h-16 rounded-full bg-[#a08060]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Fingerprint className="w-8 h-8 text-[#a08060]" />
              </div>
              <h3 className="text-xl font-semibold text-[#6b5537]">我不知道</h3>
              <p className="text-[#a08060] text-center text-sm">通过 20 题快速测试确定类型</p>
            </div>
          </div>
        );
      }

      if (mbtiMode === 'known') {
        return (
          <div className="grid grid-cols-4 gap-3 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
            {MBTI_TYPES.map(type => (
              <div
                key={type.code}
                onClick={() => setSelectedMbti(type.code)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedMbti === type.code
                  ? 'bg-[#8b6f47]/20 border-[#8b6f47]'
                  : 'bg-white/50 border-[#d4c4b0] hover:border-[#a08060]'
                  }`}
              >
                <div className="text-2xl mb-1">{type.icon}</div>
                <div className="font-bold text-[#6b5537]">{type.code}</div>
                <div className="text-xs text-[#a08060]">{type.name}</div>
              </div>
            ))}
          </div>
        );
      }

      // 问卷模式
      const question = MBTI_QUESTIONS[currentMbtiQuestion];
      return (
        <div className="flex flex-col h-full">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span>问题 {currentMbtiQuestion + 1} / {MBTI_QUESTIONS.length}</span>
              <span>已回答: {mbtiAnswers.filter(a => a).length}/{MBTI_QUESTIONS.length}</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-300"
                style={{ width: `${((currentMbtiQuestion + 1) / MBTI_QUESTIONS.length) * 100}%` }}
              />
            </div>
          </div>

          <h3 className="text-xl text-white mb-8">{question.text}</h3>

          <div className="space-y-6">
            <div className="flex justify-between px-2 text-slate-400 text-sm mb-2">
              <span>非常不同意</span>
              <span>非常同意</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {question.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const newAnswers = [...mbtiAnswers];
                    newAnswers[currentMbtiQuestion] = option.value;
                    setMbtiAnswers(newAnswers);
                    if (currentMbtiQuestion < MBTI_QUESTIONS.length - 1) {
                      setTimeout(() => setCurrentMbtiQuestion(curr => curr + 1), 200);
                    }
                  }}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all h-24 ${mbtiAnswers[currentMbtiQuestion] === option.value
                    ? 'bg-cyan-500/20 border-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                    : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-500'
                    }`}
                >
                  <span className="text-xl font-bold mb-1">{option.value}</span>
                  <span className="text-xs text-center opacity-70">{option.text}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto flex justify-between pt-6">
            <button
              onClick={() => setCurrentMbtiQuestion(curr => Math.max(0, curr - 1))}
              disabled={currentMbtiQuestion === 0}
              className="text-slate-500 disabled:opacity-30 hover:text-white"
            >
              上一题
            </button>
          </div>
        </div>
      );
    };

    // 渲染核心层步骤
    const renderCoreStep = () => {
      if (!coreMode) {
        return (
          <div className="grid grid-cols-2 gap-6 h-full">
            <div
              onClick={() => setCoreMode('skip')}
              className="border border-slate-700 bg-slate-800/50 rounded-xl p-6 cursor-pointer hover:border-slate-500 hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-4 group"
            >
              <div className="w-16 h-16 rounded-full bg-slate-700/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                <ArrowRight className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">直接生成</h3>
              <p className="text-slate-400 text-center text-sm">跳过详细测试，基于 MBTI 生成</p>
            </div>
            <div
              onClick={() => setCoreMode('test')}
              className="border border-slate-700 bg-slate-800/50 rounded-xl p-6 cursor-pointer hover:border-cyan-500 hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-4 group"
            >
              <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Cpu className="w-8 h-8 text-cyan-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">深度构建</h3>
              <p className="text-slate-400 text-center text-sm">通过 Big Five 测试精确刻画</p>
            </div>
          </div>
        );
      }

      if (coreMode === 'skip') {
        return (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6">
              <Zap className="w-10 h-10 text-yellow-400" />
            </div>
            <h3 className="text-xl text-white mb-2">已准备好进入下一步</h3>
            <p className="text-slate-400 max-w-xs">我们将基于您的 MBTI 类型 ({selectedMbti}) 构建核心人格。</p>
          </div>
        );
      }

      // 问卷模式
      const question = CORE_QUESTIONS[currentCoreQuestion];
      return (
        <div className="flex flex-col h-full">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span>问题 {currentCoreQuestion + 1} / {CORE_QUESTIONS.length}</span>
              <span>{Math.round(((currentCoreQuestion + 1) / CORE_QUESTIONS.length) * 100)}%</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-300"
                style={{ width: `${((currentCoreQuestion + 1) / CORE_QUESTIONS.length) * 100}%` }}
              />
            </div>
          </div>

          <h3 className="text-xl text-white mb-8">{question.text}</h3>

          <div className="space-y-6">
            <div className="flex justify-between px-2 text-slate-400 text-sm mb-2">
              <span>非常不同意</span>
              <span>非常同意</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {question.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const newAnswers = [...coreAnswers];
                    // Store value and dimension for backend processing
                    newAnswers[currentCoreQuestion] = {
                      dimension: question.dimension,
                      value: option.value,
                      direction: question.direction
                    };
                    setCoreAnswers(newAnswers);
                    if (currentCoreQuestion < CORE_QUESTIONS.length - 1) {
                      setTimeout(() => setCurrentCoreQuestion(curr => curr + 1), 200);
                    }
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all h-24 ${coreAnswers[currentCoreQuestion]?.value === option.value
                    ? 'bg-cyan-500/20 border-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                    : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-500'
                    }`}
                >
                  <span className="text-xl font-bold mb-1">{option.value}</span>
                  <span className="text-xs text-center opacity-70">{option.text}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto flex justify-between pt-4">
            <button
              onClick={() => setCurrentCoreQuestion(curr => Math.max(0, curr - 1))}
              disabled={currentCoreQuestion === 0}
              className="text-slate-500 disabled:opacity-30 hover:text-white"
            >
              上一题
            </button>
          </div>
        </div>
      );
    };

    // 渲染身份选择步骤
    const renderIdentityStep = () => {
      return (
        <div className="flex flex-col h-full">
          <div className="text-center mb-6">
            <h3 className="text-xl text-[#6b5537] mb-2">选择你的身份</h3>
            <p className="text-[#a08060] text-sm">基于你的人格特点，AI为你推荐了以下身份</p>
          </div>

          {loadingIdentity ? (
            <div className="flex items-center justify-center flex-1">
              <div className="w-12 h-12 border-4 border-[#d4c4b0] border-t-[#8b6f47] rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {identitySuggestions.map((identity, index) => (
                  <div
                    key={index}
                    onClick={() => {
                      setSelectedIdentity(identity);
                      setCustomIdentity('');
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedIdentity === identity
                      ? 'bg-[#8b6f47]/20 border-[#8b6f47] text-[#6b5537]'
                      : 'bg-white/50 border-[#d4c4b0] text-[#8b6f47] hover:border-[#a08060]'
                      }`}
                  >
                    <span className="font-medium">{identity}</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto">
                <label className="block text-xs text-[#a08060] mb-2">或者输入自定义身份</label>
                <input
                  type="text"
                  value={customIdentity}
                  onChange={e => {
                    setCustomIdentity(e.target.value);
                    if (e.target.value) setSelectedIdentity('');
                  }}
                  className="w-full bg-white border border-[#d4c4b0] rounded-lg px-4 py-3 text-[#6b5537] focus:border-[#8b6f47] outline-none placeholder:text-[#c4b49a]"
                  placeholder="例如: 游吟诗人、商队护卫、落魄贵族..."
                />
              </div>
            </>
          )}
        </div>
      );
    };

    // 渲染目标选择步骤
    const renderGoalStep = () => {
      return (
        <div className="flex flex-col h-full">
          <div className="text-center mb-6">
            <h3 className="text-xl text-[#6b5537] mb-2">设定你的目标</h3>
            <p className="text-[#a08060] text-sm">作为 {selectedIdentity || customIdentity}，你想要达成什么？</p>
          </div>

          {loadingGoal ? (
            <div className="flex items-center justify-center flex-1">
              <div className="w-12 h-12 border-4 border-[#d4c4b0] border-t-[#8b6f47] rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-6">
                {goalSuggestions.map((goal, index) => (
                  <div
                    key={index}
                    onClick={() => {
                      setSelectedGoal(goal);
                      setCustomGoal('');
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedGoal === goal
                      ? 'bg-[#8b6f47]/20 border-[#8b6f47] text-[#6b5537]'
                      : 'bg-white/50 border-[#d4c4b0] text-[#8b6f47] hover:border-[#a08060]'
                      }`}
                  >
                    <span>{goal}</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto">
                <label className="block text-xs text-[#a08060] mb-2">或者输入自定义目标</label>
                <input
                  type="text"
                  value={customGoal}
                  onChange={e => {
                    setCustomGoal(e.target.value);
                    if (e.target.value) setSelectedGoal('');
                  }}
                  className="w-full bg-white border border-[#d4c4b0] rounded-lg px-4 py-3 text-[#6b5537] focus:border-[#8b6f47] outline-none placeholder:text-[#c4b49a]"
                  placeholder="例如: 揭开家族的秘密、建立商业帝国..."
                />
              </div>
            </>
          )}
        </div>
      );
    };

    // 渲染生成结果
    const renderResult = () => {
      if (loading) {
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-24 h-24 relative mb-8">
              <div className="absolute inset-0 border-4 border-[#d4c4b0] rounded-full"></div>
              <div
                className="absolute inset-0 border-4 border-[#8b6f47] border-t-transparent rounded-full animate-spin"
              ></div>
              <div className="absolute inset-0 flex items-center justify-center text-[#8b6f47] font-bold">
                {progress}%
              </div>
            </div>
            <h3 className="text-xl text-[#6b5537] mb-2">{progressText}</h3>
            <p className="text-[#a08060] text-sm">正在创建你的身份...</p>
          </div>
        );
      }

      if (generatedProfile) {
        return (
          <div className="h-full overflow-y-auto custom-scrollbar pr-2">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-[#8b6f47]/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#8b6f47]/50">
                <User className="w-10 h-10 text-[#8b6f47]" />
              </div>
              <h2 className="text-2xl font-bold text-[#6b5537] mb-2">身份创建完成</h2>
              <p className="text-[#a08060]">你已准备好进入这个世界</p>
            </div>

            <div className="space-y-4">
              <div className="bg-white/70 rounded-xl p-4 border border-[#d4c4b0]">
                <h3 className="text-sm font-bold text-[#6b5537] mb-2">人格类型</h3>
                <p className="text-[#8b6f47] font-bold text-lg">{generatedProfile.core_traits?.mbti || selectedMbti}</p>
              </div>

              <div className="bg-white/70 rounded-xl p-4 border border-[#d4c4b0]">
                <h3 className="text-sm font-bold text-[#6b5537] mb-2">你的身份</h3>
                <p className="text-[#8b6f47]">{generatedProfile.identity}</p>
              </div>

              <div className="bg-white/70 rounded-xl p-4 border border-[#d4c4b0]">
                <h3 className="text-sm font-bold text-[#6b5537] mb-2">你的目标</h3>
                <p className="text-[#8b6f47]">{generatedProfile.goal}</p>
              </div>
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={handleConfirm}
                className="bg-gradient-to-r from-[#8b6f47] to-[#a08060] hover:from-[#6b5537] hover:to-[#8b6f47] text-white font-bold px-12 py-3 rounded-lg flex items-center gap-2 transition-all shadow-md hover:shadow-lg mx-auto"
              >
                <Check className="w-5 h-5" />
                进入世界
              </button>
            </div>
          </div>
        );
      }

      return null;
    };

    // 底部按钮状态
    const isNextDisabled = () => {
      if (step === 1) {
        if (!mbtiMode) return true;
        if (mbtiMode === 'known' && !selectedMbti) return true;
        if (mbtiMode === 'unknown') {
          const answeredCount = mbtiAnswers.filter(a => a).length;
          return answeredCount < MBTI_QUESTIONS.length;
        }
      }
      if (step === 2) {
        if (!coreMode) return true;
        if (coreMode === 'test') {
          const answeredCount = coreAnswers.filter(a => a).length;
          return answeredCount < CORE_QUESTIONS.length;
        }
      }
      if (step === 3) {
        // 身份选择：需要选择或输入身份
        if (loadingIdentity) return true;
        return !selectedIdentity && !customIdentity;
      }
      if (step === 4) {
        // 目标选择：需要选择或输入目标
        if (loadingGoal) return true;
        return !selectedGoal && !customGoal;
      }
      return false;
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-[#f5f1e8] border border-[#d4c4b0] rounded-2xl w-full max-w-2xl h-[600px] overflow-hidden shadow-xl flex flex-col" style={{ fontFamily: "'Noto Serif SC', 'Ma Shan Zheng', serif" }}>
          {/* Header */}
          <div className="p-6 border-b border-[#d4c4b0] flex justify-between items-center bg-gradient-to-r from-[#8b6f47] to-[#a08060]">
            <div className="flex items-center gap-2 text-white">
              <Zap className="w-5 h-5" />
              <span className="font-bold tracking-wider">身份绘卷</span>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Bar */}
          {step < 5 && (
            <div className="flex border-b border-[#d4c4b0] bg-[#faf7f2]">
              {steps.slice(0, 4).map((s, i) => (
                <div
                  key={i}
                  className={`flex-1 p-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${step === i + 1
                    ? 'border-[#8b6f47] text-[#6b5537] bg-[#8b6f47]/10'
                    : i + 1 < step
                      ? 'border-transparent text-[#a08060]'
                      : 'border-transparent text-[#c4b49a]'
                    }`}
                >
                  {s.icon}
                  <span className="text-sm font-medium hidden sm:inline">{s.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 p-8 overflow-hidden bg-[#faf7f2]">
            {step === 1 && renderMbtiStep()}
            {step === 2 && renderCoreStep()}
            {step === 3 && renderIdentityStep()}
            {step === 4 && renderGoalStep()}
            {step === 5 && renderResult()}
          </div>

          {/* Footer */}
          {step < 5 && (
            <div className="p-6 border-t border-[#d4c4b0] flex justify-between bg-[#f5f1e8]">
              <button
                onClick={() => {
                  if (step === 1 && mbtiMode) setMbtiMode(null);
                  else if (step === 2 && coreMode) setCoreMode(null);
                  else if (step > 1) setStep(step - 1);
                  else onClose();
                }}
                className="px-6 py-2 text-[#8b6f47] hover:text-[#6b5537] flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                {step === 1 && !mbtiMode ? '取消' : '上一步'}
              </button>

              <button
                onClick={handleNext}
                disabled={isNextDisabled()}
                className="bg-gradient-to-r from-[#8b6f47] to-[#a08060] hover:from-[#6b5537] hover:to-[#8b6f47] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-8 py-2 rounded-lg flex items-center gap-2 transition-all shadow-md hover:shadow-lg"
              >
                {step === 5 ? '开始生成' : '下一步'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div >
    );
  }

  // 将CreationWizard暴露到全局作用域
  window.CreationWizard = CreationWizard;

})(); // 立即执行函数结束
