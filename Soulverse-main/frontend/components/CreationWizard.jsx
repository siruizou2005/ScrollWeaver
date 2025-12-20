import { useState, useEffect, useRef } from 'react';
import { X, ArrowRight, ArrowLeft, Fingerprint, Cpu, User, Zap, Check, Upload, MessageSquare, Shield, Heart, ListOrdered, Image as ImageIcon } from 'lucide-react';
import { api } from '../services/api';
import { MBTI_TYPES, MBTI_QUESTIONS, CORE_QUESTIONS, DEFENSE_QUESTIONS, ATTACHMENT_QUESTIONS, VALUES_LIST } from '../data/questionnaires';

export default function CreationWizard({ onClose, onComplete }) {
  // 步骤: 1=MBTI, 2=核心层(BigFive), 3=细腻层(Defense/Attach/Values), 4=风格层(聊天记录), 5=动漫化人物, 6=生成中/结果
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

  // 细腻层状态 (Phase 2)
  const [nuancedMode, setNuancedMode] = useState(null); // 'skip' | 'test'
  const [nuancedSubStep, setNuancedSubStep] = useState(0); // 0=Defense, 1=Attachment, 2=Values
  const [defenseAnswers, setDefenseAnswers] = useState(new Array(DEFENSE_QUESTIONS.length).fill(null));
  const [currentDefenseQuestion, setCurrentDefenseQuestion] = useState(0);
  const [attachmentAnswers, setAttachmentAnswers] = useState(new Array(ATTACHMENT_QUESTIONS.length).fill(null));
  const [currentAttachmentQuestion, setCurrentAttachmentQuestion] = useState(0);
  const [valuesOrder, setValuesOrder] = useState(VALUES_LIST);

  // 风格层状态
  const [styleMode, setStyleMode] = useState(null); // 'skip' | 'upload'
  const [chatHistory, setChatHistory] = useState('');
  const [wechatName, setWechatName] = useState('');
  const [relationship, setRelationship] = useState('');
  
  // 动漫化步骤状态
  const [animeMode, setAnimeMode] = useState(null); // 'skip' | 'generate'
  
  // 动漫化图片状态
  const [frontPhoto, setFrontPhoto] = useState(null);
  const [frontPhotoPreview, setFrontPhotoPreview] = useState(null);
  const [lifePhoto1, setLifePhoto1] = useState(null);
  const [lifePhoto1Preview, setLifePhoto1Preview] = useState(null);
  const [lifePhoto2, setLifePhoto2] = useState(null);
  const [lifePhoto2Preview, setLifePhoto2Preview] = useState(null);
  const [animeImages, setAnimeImages] = useState(null); // 存储动漫化后的图片URL

  // 生成结果
  const [generatedProfile, setGeneratedProfile] = useState(null);

  // 步骤标题和描述
  const steps = [
    { title: "人格基石 (MBTI)", icon: <Fingerprint className="w-5 h-5" />, desc: "确定你的 MBTI 类型，构建人格的基础框架。" },
    { title: "核心特质 (Big Five)", icon: <Cpu className="w-5 h-5" />, desc: "通过大五人格测试，深入刻画你的性格维度。" },
    { title: "深层机制", icon: <Shield className="w-5 h-5" />, desc: "探索防御机制、依恋风格和价值观。" },
    { title: "语言风格", icon: <MessageSquare className="w-5 h-5" />, desc: "上传聊天记录，让数字孪生学习你的表达习惯。" },
    { title: "动漫化形象", icon: <ImageIcon className="w-5 h-5" />, desc: "上传照片，AI 生成动漫形象。" },
    { title: "神经元构建", icon: <Zap className="w-5 h-5" />, desc: "正在生成你的数字孪生..." },
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
      setStep(3);
    } else if (step === 3) {
      // 细腻层逻辑
      if (nuancedMode === 'test') {
        if (nuancedSubStep < 2) {
          setNuancedSubStep(curr => curr + 1);
        } else {
          setStep(4);
        }
      } else {
        setStep(4);
      }
    } else if (step === 4) {
      setStep(5);
    } else if (step === 5) {
      // 步骤5：处理动漫化（可选）
      if (animeMode === 'generate') {
        if (!frontPhoto || !lifePhoto1 || !lifePhoto2) {
          alert('请上传所有三张照片（1张正面照 + 2张生活照）');
          return;
        }
        // 先上传并处理图片
        await handleAnimeGeneration();
      } else {
        // 跳过动漫化，直接生成
        setStep(6);
        await generateProfile();
      }
    }
  };

  // 处理图片上传和预览
  const handleImageUpload = (file, type) => {
    if (!file) return;
    
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return;
    }
    
    // 验证文件大小（限制为5MB）
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过5MB');
      return;
    }
    
    // 创建预览
    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === 'front') {
        setFrontPhoto(file);
        setFrontPhotoPreview(reader.result);
      } else if (type === 'life1') {
        setLifePhoto1(file);
        setLifePhoto1Preview(reader.result);
      } else if (type === 'life2') {
        setLifePhoto2(file);
        setLifePhoto2Preview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // 处理动漫化生成
  const handleAnimeGeneration = async () => {
    setLoading(true);
    setStep(6);
    setProgress(0);
    setProgressText('正在上传图片...');
    
    try {
      // 上传图片并获取动漫化结果
      const formData = new FormData();
      formData.append('front_photo', frontPhoto);
      formData.append('life_photo_1', lifePhoto1);
      formData.append('life_photo_2', lifePhoto2);
      
      setProgress(30);
      setProgressText('正在调用 AI 进行动漫化处理...');
      
      const result = await api.generateAnimeImages(formData);
      
      if (result.success && result.anime_images) {
        setAnimeImages(result.anime_images);
        setProgress(60);
        setProgressText('动漫化完成，正在生成人格画像...');
        
        // 继续生成人格画像
        await generateProfile();
      } else {
        const errorMsg = result.detail || result.error || result.message || '动漫化处理失败';
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Anime generation error:', error);
      alert('动漫化处理失败: ' + error.message);
      setStep(5);
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
        relationship: relationship,
        // 动漫化图片
        anime_images: animeMode === 'generate' ? animeImages : null
      };

      // 调用后端API生成画像
      const response = await api.generateDigitalTwinProfile(payload);

      // api.js的方法直接返回json数据，不需要再次await response.json()
      // 但我们需要检查返回结构，api.js通常直接返回解析后的JSON
      const result = response;

      clearInterval(interval);
      setProgress(100);
      setProgressText('生成完成！');

      if (result.success) {
        setGeneratedProfile(result.profile);
      } else {
        // 优先显示 detail (FastAPI 错误格式)，其次是 error，最后是未知错误
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

  // 确认并创建Agent
  const handleConfirm = async () => {
    if (!generatedProfile) return;

    setLoading(true);
    try {
      // 获取当前用户信息，用于生成agent名称
      let displayName = wechatName;
      if (!displayName) {
        try {
          const userResult = await api.getCurrentUser();
          if (userResult.success && userResult.user) {
            displayName = userResult.user.username || userResult.user.user_id;
          }
        } catch (error) {
          console.warn('Failed to get user info:', error);
        }
      }
      // 如果还是没有，使用默认格式
      if (!displayName) {
        displayName = 'User_001';
      }

      // 1. 使用生成的人格数据创建用户Agent
      // 统一使用 digital_twin_user_{user_id}_{timestamp} 格式
      const timestamp = Date.now();
      let userId = '';
      try {
        const userResult = await api.getCurrentUser();
        if (userResult.success && userResult.user) {
          userId = userResult.user.user_id;
        }
      } catch (error) {
        console.warn('Failed to get user ID:', error);
      }
      // 如果没有user_id，使用时间戳作为临时ID
      if (!userId) {
        userId = `user_${timestamp}`;
      }
      const role_code = `digital_twin_user_${userId}_${timestamp}`;

      // 构建Agent信息 - 符合UI组件期望的格式
      const agentInfo = {
        role_code: role_code,
        nickname: displayName,
        role_name: displayName,
        location: `MBTI: ${generatedProfile.core_traits.mbti}`,
        profile: `基于 ${generatedProfile.core_traits.mbti} 人格构建的数字孪生`,
        personality: generatedProfile.core_traits,
        speaking_style: generatedProfile.speaking_style,
        // 保存完整的生成数据
        generated_profile: generatedProfile,
        // 保存动漫化图片
        anime_images: animeImages || null
      };

      // 2. 保存数字孪生到用户数据
      const saveResult = await api.saveDigitalTwin(agentInfo);

      if (!saveResult.success) {
        throw new Error(saveResult.detail || saveResult.message || '保存失败');
      }

      // 3. 创建实际的ScrollWeaver agent
      try {
        const createResult = await api.createUserAgent(userId);
        if (createResult.success) {
          console.log('✓ 用户agent已创建:', createResult.agent_info);
        } else {
          console.warn('创建agent失败，但数字孪生已保存:', createResult.message);
        }
      } catch (createError) {
        console.warn('创建agent出错，但数字孪生已保存:', createError);
        // 继续流程，即使agent创建失败
      }

      // 4. 完成创建并关闭向导
      onComplete(agentInfo);
    } catch (error) {
      console.error('Save error:', error);
      alert('保存失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 渲染MBTI步骤
  const renderMbtiStep = () => {
    if (!mbtiMode) {
      return (
        <div className="grid grid-cols-2 gap-6 h-full">
          <div
            onClick={() => setMbtiMode('known')}
            className="border border-slate-700 bg-slate-800/50 rounded-xl p-6 cursor-pointer hover:border-cyan-500 hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-4 group"
          >
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Check className="w-8 h-8 text-cyan-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">我知道我的 MBTI</h3>
            <p className="text-slate-400 text-center text-sm">直接从 16 种人格类型中选择</p>
          </div>
          <div
            onClick={() => setMbtiMode('unknown')}
            className="border border-slate-700 bg-slate-800/50 rounded-xl p-6 cursor-pointer hover:border-purple-500 hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-4 group"
          >
            <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Fingerprint className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">我不知道</h3>
            <p className="text-slate-400 text-center text-sm">通过 20 题快速测试确定类型</p>
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
                ? 'bg-cyan-500/20 border-cyan-500'
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
                }`}
            >
              <div className="text-2xl mb-1">{type.icon}</div>
              <div className="font-bold text-white">{type.code}</div>
              <div className="text-xs text-slate-400">{type.name}</div>
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

  // 渲染细腻层步骤 (Phase 2)
  const renderNuancedStep = () => {
    if (!nuancedMode) {
      return (
        <div className="grid grid-cols-2 gap-6 h-full">
          <div
            onClick={() => setNuancedMode('skip')}
            className="border border-slate-700 bg-slate-800/50 rounded-xl p-6 cursor-pointer hover:border-slate-500 hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-4 group"
          >
            <div className="w-16 h-16 rounded-full bg-slate-700/30 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ArrowRight className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">跳过</h3>
            <p className="text-slate-400 text-center text-sm">暂不探索深层机制</p>
          </div>
          <div
            onClick={() => setNuancedMode('test')}
            className="border border-slate-700 bg-slate-800/50 rounded-xl p-6 cursor-pointer hover:border-cyan-500 hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-4 group"
          >
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Shield className="w-8 h-8 text-cyan-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">深层探索</h3>
            <p className="text-slate-400 text-center text-sm">防御机制、依恋风格与价值观</p>
          </div>
        </div>
      );
    }

    if (nuancedMode === 'skip') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6">
            <Check className="w-10 h-10 text-green-400" />
          </div>
          <h3 className="text-xl text-white mb-2">已准备好进入下一步</h3>
          <p className="text-slate-400 max-w-xs">我们将跳过深层机制探索。</p>
        </div>
      );
    }

    // Sub-steps: 0=Defense, 1=Attachment, 2=Values
    if (nuancedSubStep === 0) {
      // Defense Mechanism Questions
      const question = DEFENSE_QUESTIONS[currentDefenseQuestion];
      return (
        <div className="flex flex-col h-full">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span className="flex items-center gap-2"><Shield className="w-4 h-4" /> 防御机制 {currentDefenseQuestion + 1} / {DEFENSE_QUESTIONS.length}</span>
              <span>{Math.round(((currentDefenseQuestion + 1) / DEFENSE_QUESTIONS.length) * 100)}%</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${((currentDefenseQuestion + 1) / DEFENSE_QUESTIONS.length) * 100}%` }} />
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
                    const newAnswers = [...defenseAnswers];
                    newAnswers[currentDefenseQuestion] = { dimension: question.dimension, value: option.value, direction: question.direction };
                    setDefenseAnswers(newAnswers);
                    if (currentDefenseQuestion < DEFENSE_QUESTIONS.length - 1) {
                      setTimeout(() => setCurrentDefenseQuestion(curr => curr + 1), 200);
                    }
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all h-24 ${defenseAnswers[currentDefenseQuestion]?.value === option.value
                    ? 'bg-purple-500/20 border-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]'
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
            <button onClick={() => setCurrentDefenseQuestion(curr => Math.max(0, curr - 1))} disabled={currentDefenseQuestion === 0} className="text-slate-500 disabled:opacity-30 hover:text-white">上一题</button>
          </div>
        </div>
      );
    } else if (nuancedSubStep === 1) {
      // Attachment Style Questions
      const question = ATTACHMENT_QUESTIONS[currentAttachmentQuestion];
      return (
        <div className="flex flex-col h-full">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span className="flex items-center gap-2"><Heart className="w-4 h-4" /> 依恋风格 {currentAttachmentQuestion + 1} / {ATTACHMENT_QUESTIONS.length}</span>
              <span>{Math.round(((currentAttachmentQuestion + 1) / ATTACHMENT_QUESTIONS.length) * 100)}%</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-pink-500 transition-all duration-300" style={{ width: `${((currentAttachmentQuestion + 1) / ATTACHMENT_QUESTIONS.length) * 100}%` }} />
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
                    const newAnswers = [...attachmentAnswers];
                    newAnswers[currentAttachmentQuestion] = { dimension: question.dimension, value: option.value, direction: question.direction };
                    setAttachmentAnswers(newAnswers);
                    if (currentAttachmentQuestion < ATTACHMENT_QUESTIONS.length - 1) {
                      setTimeout(() => setCurrentAttachmentQuestion(curr => curr + 1), 200);
                    }
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all h-24 ${attachmentAnswers[currentAttachmentQuestion]?.value === option.value
                    ? 'bg-pink-500/20 border-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.3)]'
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
            <button onClick={() => setCurrentAttachmentQuestion(curr => Math.max(0, curr - 1))} disabled={currentAttachmentQuestion === 0} className="text-slate-500 disabled:opacity-30 hover:text-white">上一题</button>
          </div>
        </div>
      );
    } else {
      // Values Sorting
      const moveItem = (index, direction) => {
        const newOrder = [...valuesOrder];
        if (direction === 'up' && index > 0) {
          [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
        } else if (direction === 'down' && index < newOrder.length - 1) {
          [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
        }
        setValuesOrder(newOrder);
      };

      return (
        <div className="flex flex-col h-full">
          <div className="mb-4">
            <h3 className="text-xl text-white mb-2 flex items-center gap-2"><ListOrdered className="w-5 h-5" /> 价值观排序</h3>
            <p className="text-slate-400 text-sm">请将以下价值观按重要性从高到低排序（点击箭头移动）</p>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
            {valuesOrder.map((item, index) => (
              <div key={item.id} className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-cyan-400 font-bold shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="text-white font-medium">{item.text}</div>
                  <div className="text-xs text-slate-500">{item.desc}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveItem(index, 'up')}
                    disabled={index === 0}
                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveItem(index, 'down')}
                    disabled={index === valuesOrder.length - 1}
                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
  };

  // 渲染风格层步骤
  const renderStyleStep = () => {
    if (!styleMode) {
      return (
        <div className="grid grid-cols-2 gap-6 h-full">
          <div
            onClick={() => setStyleMode('skip')}
            className="border border-slate-700 bg-slate-800/50 rounded-xl p-6 cursor-pointer hover:border-slate-500 hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-4 group"
          >
            <div className="w-16 h-16 rounded-full bg-slate-700/30 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ArrowRight className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">跳过</h3>
            <p className="text-slate-400 text-center text-sm">使用默认语言风格</p>
          </div>
          <div
            onClick={() => setStyleMode('upload')}
            className="border border-slate-700 bg-slate-800/50 rounded-xl p-6 cursor-pointer hover:border-cyan-500 hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-4 group"
          >
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Upload className="w-8 h-8 text-cyan-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">上传聊天记录</h3>
            <p className="text-slate-400 text-center text-sm">AI 学习你的表达习惯</p>
          </div>
        </div>
      );
    }

    if (styleMode === 'skip') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6">
            <MessageSquare className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl text-white mb-2">已准备好生成</h3>
          <p className="text-slate-400 max-w-xs">我们将使用默认的语言风格构建您的数字孪生。</p>
        </div>
      );
    }

    if (styleMode === 'upload') {
      return (
        <div className="flex flex-col h-full gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">你在聊天中的昵称</label>
              <input
                type="text"
                value={wechatName}
                onChange={e => setWechatName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
                placeholder="例如: Alice"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">对方与你的关系</label>
              <input
                type="text"
                value={relationship}
                onChange={e => setRelationship(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
                placeholder="例如: 朋友"
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">聊天记录文本</label>
            <textarea
              value={chatHistory}
              onChange={e => setChatHistory(e.target.value)}
              className="w-full h-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-cyan-500 outline-none resize-none custom-scrollbar"
              placeholder="请粘贴聊天记录..."
            />
          </div>
        </div>
      );
    }

    return null;
  };

  // 渲染动漫化步骤
  const renderAnimeStep = () => {
    if (!animeMode) {
      return (
        <div className="grid grid-cols-2 gap-6 h-full">
          <div
            onClick={() => setAnimeMode('skip')}
            className="border border-slate-700 bg-slate-800/50 rounded-xl p-6 cursor-pointer hover:border-slate-500 hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-4 group"
          >
            <div className="w-16 h-16 rounded-full bg-slate-700/30 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ArrowRight className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">跳过</h3>
            <p className="text-slate-400 text-center text-sm">暂不生成动漫形象</p>
          </div>
          <div
            onClick={() => setAnimeMode('generate')}
            className="border border-slate-700 bg-slate-800/50 rounded-xl p-6 cursor-pointer hover:border-purple-500 hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-4 group"
          >
            <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ImageIcon className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">生成动漫化人物</h3>
            <p className="text-slate-400 text-center text-sm">上传照片，AI 生成动漫形象</p>
          </div>
        </div>
      );
    }

    if (animeMode === 'skip') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6">
            <ImageIcon className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl text-white mb-2">已准备好进入下一步</h3>
          <p className="text-slate-400 max-w-xs">将跳过动漫化形象生成。</p>
        </div>
      );
    }

    if (animeMode === 'generate') {
      return (
        <div className="flex flex-col h-full gap-4 overflow-y-auto custom-scrollbar">
          <div className="text-center mb-4">
            <h3 className="text-lg text-white mb-2">上传照片生成动漫化人物</h3>
            <p className="text-sm text-slate-400">请上传1张正面照和2张生活照（每张不超过5MB）</p>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            {/* 正面照 */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-400">正面照 *</label>
              <div className="relative border-2 border-dashed border-slate-700 rounded-lg p-4 h-32 flex items-center justify-center bg-slate-900/50 hover:border-purple-500 transition-colors">
                {frontPhotoPreview ? (
                  <div className="relative w-full h-full">
                    <img src={frontPhotoPreview} alt="正面照预览" className="w-full h-full object-cover rounded" />
                    <button
                      onClick={() => {
                        setFrontPhoto(null);
                        setFrontPhotoPreview(null);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2">
                    <ImageIcon className="w-8 h-8 text-slate-500" />
                    <span className="text-xs text-slate-400">点击上传</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e.target.files[0], 'front')}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* 生活照1 */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-400">生活照 1 *</label>
              <div className="relative border-2 border-dashed border-slate-700 rounded-lg p-4 h-32 flex items-center justify-center bg-slate-900/50 hover:border-purple-500 transition-colors">
                {lifePhoto1Preview ? (
                  <div className="relative w-full h-full">
                    <img src={lifePhoto1Preview} alt="生活照1预览" className="w-full h-full object-cover rounded" />
                    <button
                      onClick={() => {
                        setLifePhoto1(null);
                        setLifePhoto1Preview(null);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2">
                    <ImageIcon className="w-8 h-8 text-slate-500" />
                    <span className="text-xs text-slate-400">点击上传</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e.target.files[0], 'life1')}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* 生活照2 */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-400">生活照 2 *</label>
              <div className="relative border-2 border-dashed border-slate-700 rounded-lg p-4 h-32 flex items-center justify-center bg-slate-900/50 hover:border-purple-500 transition-colors">
                {lifePhoto2Preview ? (
                  <div className="relative w-full h-full">
                    <img src={lifePhoto2Preview} alt="生活照2预览" className="w-full h-full object-cover rounded" />
                    <button
                      onClick={() => {
                        setLifePhoto2(null);
                        setLifePhoto2Preview(null);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2">
                    <ImageIcon className="w-8 h-8 text-slate-500" />
                    <span className="text-xs text-slate-400">点击上传</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e.target.files[0], 'life2')}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // 渲染生成结果
  const renderResult = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="w-24 h-24 relative mb-8">
            <div className="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
            <div
              className="absolute inset-0 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"
            ></div>
            <div className="absolute inset-0 flex items-center justify-center text-cyan-400 font-bold">
              {progress}%
            </div>
          </div>
          <h3 className="text-xl text-white mb-2">{progressText}</h3>
          <p className="text-slate-500 text-sm">这可能需要 1-2 分钟，请耐心等待...</p>
        </div>
      );
    }

    if (generatedProfile) {
      return (
        <div className="h-full overflow-y-auto custom-scrollbar pr-2">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.3)]">
              <User className="w-10 h-10 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">数字孪生构建完成</h2>
            <p className="text-slate-400">MBTI: <span className="text-cyan-400 font-bold">{generatedProfile.core_traits.mbti}</span></p>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                <Cpu className="w-4 h-4" /> 核心特质
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(generatedProfile.core_traits.big_five || {}).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 capitalize">{key}</span>
                    <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500" style={{ width: `${value * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {generatedProfile.speaking_style && (
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> 语言风格
                </h3>
                <div className="flex flex-wrap gap-2">
                  {generatedProfile.speaking_style.catchphrases?.slice(0, 5).map((phrase, i) => (
                    <span key={i} className="px-2 py-1 bg-slate-700 rounded text-xs text-cyan-300">
                      {phrase}
                    </span>
                  ))}
                </div>
              </div>
            )}
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
      if (!nuancedMode) return true;
      if (nuancedMode === 'test') {
        if (nuancedSubStep === 0) {
          const answeredCount = defenseAnswers.filter(a => a).length;
          return answeredCount < DEFENSE_QUESTIONS.length;
        }
        if (nuancedSubStep === 1) {
          const answeredCount = attachmentAnswers.filter(a => a).length;
          return answeredCount < ATTACHMENT_QUESTIONS.length;
        }
        // Values sorting is always valid
      }
    }
    if (step === 4) {
      if (!styleMode) return true;
      if (styleMode === 'upload' && (!chatHistory || !wechatName)) return true;
    }
    if (step === 5) {
      if (!animeMode) return true;
      if (animeMode === 'generate' && (!frontPhoto || !lifePhoto1 || !lifePhoto2)) return true;
    }
    return false;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl w-full max-w-2xl h-[600px] overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-slate-900 to-slate-800">
          <div className="flex items-center gap-2 text-cyan-400">
            <Zap className="w-5 h-5" />
            <span className="font-bold tracking-wider">GENESIS PROTOCOL</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        {step < 6 && (
          <div className="flex border-b border-slate-800 bg-slate-950/50">
            {steps.slice(0, 5).map((s, i) => (
              <div
                key={i}
                className={`flex-1 p-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${step === i + 1
                  ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
                  : i + 1 < step
                    ? 'border-transparent text-slate-500'
                    : 'border-transparent text-slate-700'
                  }`}
              >
                {s.icon}
                <span className="text-sm font-medium hidden sm:inline">{s.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-8 overflow-hidden">
          {step === 1 && renderMbtiStep()}
          {step === 2 && renderCoreStep()}
          {step === 3 && renderNuancedStep()}
          {step === 4 && renderStyleStep()}
          {step === 5 && renderAnimeStep()}
          {step === 6 && renderResult()}
        </div>

        {/* Footer */}
        {step < 6 && (
          <div className="p-6 border-t border-slate-800 flex justify-between bg-slate-900">
            <button
              onClick={() => {
                if (step === 1 && mbtiMode) setMbtiMode(null);
                else if (step === 2 && coreMode) setCoreMode(null);
                else if (step === 3 && nuancedMode) setNuancedMode(null);
                else if (step === 4 && styleMode) setStyleMode(null);
                else if (step === 5 && animeMode) setAnimeMode(null);
                else if (step > 1) setStep(step - 1);
                else onClose();
              }}
              className="px-6 py-2 text-slate-400 hover:text-white flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {step === 1 && !mbtiMode ? '取消' : '上一步'}
            </button>

            <button
              onClick={handleNext}
              disabled={isNextDisabled()}
              className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-8 py-2 rounded-lg flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]"
            >
              {step === 5 ? '开始生成' : '下一步'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 6 && !loading && (
          <div className="p-6 border-t border-slate-800 flex justify-center bg-slate-900">
            <button
              onClick={handleConfirm}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-12 py-3 rounded-lg flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]"
            >
              <Check className="w-5 h-5" />
              确认并启动数字孪生
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

