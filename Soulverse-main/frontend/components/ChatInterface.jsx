import { useState, useEffect, useRef } from 'react';
import { Play, Square, User, Bot, UserCircle, FileText, X, Loader, LogOut, ArrowLeft, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api } from '../services/api';

export default function ChatInterface({ selectedAgents = [], onUserClick, onBackToMatching, onLogout, roomId, roomAgents = [], userAgents = [], onViewProfile, onUpdateAgents, canControlPlayback = true }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [aiControlEnabled, setAiControlEnabled] = useState(true); // true=用户控制, false=AI自由行动
  const [waitingForInput, setWaitingForInput] = useState(false); // 是否正在等待用户输入
  const [waitingRoleName, setWaitingRoleName] = useState(''); // 等待输入的角色名称
  const [countdownEnd, setCountdownEnd] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [ws, setWs] = useState(null);
  const [userAgentRoleCode, setUserAgentRoleCode] = useState(null); // 用户agent的role_code
  const [reportData, setReportData] = useState(null); // 社交报告数据
  const [showReport, setShowReport] = useState(false); // 是否显示报告模态框
  const [generatingReport, setGeneratingReport] = useState(false); // 是否正在生成报告
  const [aiSuggestions, setAiSuggestions] = useState(null); // AI建议的选项
  const [loadingSuggestions, setLoadingSuggestions] = useState(false); // 是否正在加载建议
  const messagesEndRef = useRef(null);
  const clientId = useRef(Math.random().toString(36).substring(7));

  useEffect(() => {
    // 初始化 WebSocket 连接
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    // 开发环境使用8001端口，生产环境使用当前页面的域名（通过反向代理）
    const isDev = process.env.NODE_ENV === 'development';
    const websocketUrl = isDev
      ? `${protocol}//${host}:8001/ws/${roomId || 'default'}/${clientId.current}`
      : `${protocol}//${host}/ws/${roomId || 'default'}/${clientId.current}`;
    const websocket = new WebSocket(websocketUrl);

    websocket.onopen = async () => {
      console.log('WebSocket connected');
      setWs(websocket);

      // 1. 首先发送用户身份确认，并获取当前用户的role_code
      try {
        const userResult = await fetch('/api/user/me', { credentials: 'include' });
        if (userResult.ok) {
          const userData = await userResult.json();
          if (userData.success && userData.user) {
            console.log('发送用户身份确认:', userData.user.user_id);
            websocket.send(JSON.stringify({
              type: 'identify_user',
              user_id: userData.user.user_id
            }));
            
            // 获取当前用户的role_code
            try {
              const twinResult = await fetch('/api/user/digital-twin', { credentials: 'include' });
              if (twinResult.ok) {
                const twinData = await twinResult.json();
                if (twinData.success && twinData.agent_info && twinData.agent_info.role_code) {
                  setUserAgentRoleCode(twinData.agent_info.role_code);
                  console.log('当前用户role_code:', twinData.agent_info.role_code);
                }
              }
            } catch (error) {
              console.error('获取数字孪生信息失败:', error);
            }
          }
        }
      } catch (error) {
        console.error('获取用户信息失败:', error);
      }

      // 2. 然后发送初始的 possession_mode 设置
      websocket.send(JSON.stringify({
        type: 'set_possession_mode',
        enabled: aiControlEnabled
      }));
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setWs(null);
    };

    return () => {
      websocket.close();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 倒计时 effect：当 countdownEnd 被设置时，启动 interval 更新剩余秒数
  useEffect(() => {
    if (!countdownEnd) {
      setRemainingSeconds(null);
      return;
    }

    const updateRemaining = () => {
      const diff = Math.ceil((new Date(countdownEnd).getTime() - Date.now()) / 1000);
      setRemainingSeconds(diff > 0 ? diff : 0);
      if (diff <= 0) {
        setCountdownEnd(null);
      }
    };

    updateRemaining();
    const id = setInterval(updateRemaining, 500);
    return () => clearInterval(id);
  }, [countdownEnd]);

  const handleWebSocketMessage = (data) => {
    if (data.type === 'message') {
      setMessages(prev => [...prev, {
        username: data.data.username,
        text: data.data.text,
        timestamp: data.data.timestamp,
        is_user: data.data.is_user || false,
        is_timeout_replacement: data.data.is_timeout_replacement || false,
        role_code: data.data.role_code || null  // 保存role_code用于区分不同用户
      }]);

      // 如果收到用户消息，取消等待状态
      if (data.data.is_user) {
        setWaitingForInput(false);
        setWaitingRoleName('');
      }
    } else if (data.type === 'characters_list') {
      // 处理角色列表更新
      console.log('Characters updated:', data.data.characters);
      // 更新roomAgents和userAgents（如果props中有更新函数）
      if (data.data.characters && onUpdateAgents) {
        onUpdateAgents(data.data.characters);
      }
    } else if (data.type === 'no_digital_twin') {
      // 用户没有数字孪生，需要创建
      console.log('⚠️ 用户没有数字孪生:', data.data);
      alert('请先创建数字孪生');
    } else if (data.type === 'waiting_for_user_input') {
      // 等待用户输入
      console.log('⏳ 等待用户输入:', data.data);
      setWaitingForInput(true);
      setWaitingRoleName(data.data.role_name || '你的角色');
    } else if (data.type === 'input_countdown_start') {
      // 后端告知应该开始本地倒计时（不会每秒推送），前端自己跑计时器
      console.log('🔔 倒计时开始:', data.data);
      setWaitingForInput(true);
      setWaitingRoleName(data.data.role_name || '你的角色');
      if (data.data.deadline) {
        try {
          setCountdownEnd(new Date(data.data.deadline));
        } catch (e) {
          // fallback: use duration
          const dur = parseInt(data.data.duration || 60, 10);
          setCountdownEnd(new Date(Date.now() + dur * 1000));
        }
      } else if (data.data.duration) {
        const dur = parseInt(data.data.duration || 60, 10);
        setCountdownEnd(new Date(Date.now() + dur * 1000));
      }
    } else if (data.type === 'input_countdown_cancel') {
      // 用户已回复，取消倒计时显示
      console.log('🔕 倒计时取消:', data.data);
      setCountdownEnd(null);
      setRemainingSeconds(null);
    } else if (data.type === 'input_countdown_timeout') {
      // 倒计时到期，后端已跳过
      console.log('⏱️ 倒计时超时:', data.data);
      setCountdownEnd(null);
      setRemainingSeconds(null);
      setWaitingForInput(false);
    } else if (data.type === 'possession_mode_updated') {
      // Possession mode 已更新
      console.log('🔄 控制模式已更新:', data.data);
      // 如果切换到AI自由行动模式，取消等待状态
      if (!data.data.enabled) {
        setWaitingForInput(false);
        setWaitingRoleName('');
      }
    } else if (data.type === 'social_report_exported') {
      // 社交报告已生成
      console.log('✓ 社交报告已生成:', data.data);
      setReportData(data.data);
      setShowReport(true);
      setGeneratingReport(false);
    } else if (data.type === 'error') {
      // 错误消息，可能需要保持等待状态或取消
      console.error('错误:', data.data);
      if (generatingReport) {
        setGeneratingReport(false);
      }
      if (loadingSuggestions) {
        setLoadingSuggestions(false);
      }
    } else if (data.type === 'auto_complete_options') {
      // AI建议选项已生成
      console.log('✓ AI建议已生成:', data.data);
      setAiSuggestions(data.data.options);
      setLoadingSuggestions(false);
    } else if (data.type === 'conversation_ended') {
      // 对话已结束（所有用户退出）
      console.log('对话已结束:', data.data);
      setWaitingForInput(false);
      setWaitingRoleName('');
      // 可以显示提示信息
      alert('所有用户已退出，对话已结束');
    } else if (data.type === 'agent_restore_needed') {
      // Agent恢复需要
      console.log('Agent恢复需要:', data.data);
      alert(data.data.message || 'Agent恢复失败，请重试');
    }
  };

  const handleTogglePlayPause = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (isPlaying) {
      // 当前正在播放，点击停止
      setIsPlaying(false);
      ws.send(JSON.stringify({
        type: 'control_command',
        command: 'stop'
      }));
    } else {
      // 当前已停止，点击开始
      setIsPlaying(true);
      ws.send(JSON.stringify({
        type: 'control_command',
        command: 'start'
      }));
    }
  };

  const handleToggleAiControl = () => {
    const newValue = !aiControlEnabled;
    setAiControlEnabled(newValue);

    // 发送模式切换到后端
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'set_possession_mode',
        enabled: newValue
      }));
    }

    console.log(`切换到${newValue ? '用户控制' : 'AI自由行动'}模式`);
  };

  const handleSend = () => {
    // 只有在等待输入时才能发送
    if (!waitingForInput) {
      console.warn('当前不是用户输入时间，无法发送消息');
      return;
    }

    if (!inputText.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;

    // 发送用户输入
    ws.send(JSON.stringify({
      type: 'user_input',  // 后端期望的是 'user_input'
      text: inputText.trim()
    }));

    setInputText('');
    // 注意：等待状态会在收到服务器确认消息后取消
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleGenerateReport = async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket未连接');
      return;
    }

    // 如果没有role_code，尝试从API获取
    let roleCode = userAgentRoleCode;
    if (!roleCode) {
      try {
        const userResult = await fetch('/api/user/me', { credentials: 'include' });
        if (userResult.ok) {
          const userData = await userResult.json();
          if (userData.success && userData.user) {
            // 尝试从数字孪生获取role_code
            const twinResult = await fetch('/api/user/digital-twin', { credentials: 'include' });
            if (twinResult.ok) {
              const twinData = await twinResult.json();
              if (twinData.success && twinData.agent_info && twinData.agent_info.role_code) {
                roleCode = twinData.agent_info.role_code;
                setUserAgentRoleCode(roleCode);
              }
            }
          }
        }
      } catch (error) {
        console.error('获取用户agent信息失败:', error);
      }
    }

    if (!roleCode) {
      alert('无法获取用户agent信息，请确保已创建数字孪生');
      return;
    }

    // 发送生成报告请求
    setGeneratingReport(true);
    ws.send(JSON.stringify({
      type: 'generate_social_report',
      agent_code: roleCode,
      format: 'text'
    }));
  };

  const handleClearMessages = async () => {
    if (window.confirm('确定要清除所有聊天消息吗？这将完全重置对话历史。')) {
      try {
        const response = await api.clearChatHistory(roomId);
        /*
        const response = await fetch('/api/clear-chat-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ room_id: roomId })
        });
        */

        if (response.success) {
          setMessages([]);
          console.log('Chat history cleared successfully');
        } else {
          console.error('Failed to clear chat history');
          alert('清除历史失败，请重试');
        }
      } catch (error) {
        console.error('Error clearing chat history:', error);
        alert('清除历史出错');
      }
    }
  };

  const handleBackToMatching = () => {
    if (window.confirm('确定要返回匹配页吗？这将暂停当前对话。')) {
      onBackToMatching?.();
    }
  };

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      onLogout?.();
    }
  };

  const handleRequestSuggestions = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!waitingForInput) return;

    setLoadingSuggestions(true);
    ws.send(JSON.stringify({
      type: 'auto_complete'
    }));
  };

  const handleSelectSuggestion = (text) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'select_auto_option',
      selected_text: text
    }));

    setAiSuggestions(null); // 清除建议
  };

  const handleCloseSuggestions = () => {
    setAiSuggestions(null);
    setLoadingSuggestions(false);
  };

  return (
    <div className="flex-1 relative z-10 flex flex-col bg-black">
      {/* 顶部导航栏 */}
      <header className="h-16 flex items-center justify-between px-8 border-b border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-4 text-sm text-slate-400 font-mono">
          <span>SECTOR: ALPHA</span>
          <span className="text-slate-700">|</span>
          <span>NODES: {roomAgents.length > 0 ? roomAgents.length : selectedAgents.length}</span>
        </div>
        <div className="flex gap-2 items-center">
          {/* AI控制模式切换 */}
          <button
            onClick={handleToggleAiControl}
            className={`px-3 py-1.5 text-xs font-mono rounded-full transition-all flex items-center gap-1.5 ${aiControlEnabled
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30'
              : 'bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30'
              }`}
            title={aiControlEnabled ? "当前：用户控制模式（点击切换为AI自由行动）" : "当前：AI自由行动模式（点击切换为用户控制）"}
          >
            {aiControlEnabled ? (
              <>
                <UserCircle className="w-3.5 h-3.5" />
                <span>用户控制</span>
              </>
            ) : (
              <>
                <Bot className="w-3.5 h-3.5" />
                <span>AI行动</span>
              </>
            )}
          </button>

          {canControlPlayback ? (
            <button
              onClick={handleTogglePlayPause}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              title={isPlaying ? "停止" : "开始"}
            >
              {isPlaying ? (
                <Square className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </button>
          ) : (
            <div 
              className="p-2 rounded-full flex items-center gap-2"
              title={isPlaying ? "对话进行中（仅房间创建者可控制）" : "对话已暂停（仅房间创建者可控制）"}
            >
              <div className={`relative ${isPlaying ? 'text-green-400' : 'text-slate-500'}`}>
                {isPlaying ? (
                  <Square className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
                <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-800 ${
                  isPlaying ? 'bg-green-400 animate-pulse' : 'bg-slate-500'
                }`} />
              </div>
            </div>
          )}
          {/* 生成社交报告按钮 */}
          <button
            onClick={handleGenerateReport}
            disabled={generatingReport}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={generatingReport ? "正在生成报告..." : "生成社交报告"}
          >
            {generatingReport ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <FileText className="w-5 h-5" />
            )}
          </button>
          {/* 清除聊天内容按钮 */}
          <button
            onClick={handleClearMessages}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            title="清除聊天内容"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          {/* 返回匹配页按钮 */}
          {onBackToMatching && (
            <button
              onClick={handleBackToMatching}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              title="返回匹配页"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          {/* 退出登录按钮 */}
          {onLogout && (
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors"
              title="退出登录"
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
          {onUserClick && (
            <button
              onClick={onUserClick}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              title="我的数字孪生"
            >
              <User className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* 聊天消息区域 */}
      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <div className="text-center">
              <p className="text-lg mb-2">开始对话</p>
              <p className="text-sm">选择角色并点击开始按钮</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, index) => {
              // 判断消息来源
              const isCurrentUser = msg.role_code && userAgentRoleCode && msg.role_code === userAgentRoleCode;
              const isOtherUser = msg.role_code && msg.role_code.startsWith('digital_twin_user_') && !isCurrentUser;
              const isNPC = !msg.role_code || (!msg.role_code.startsWith('digital_twin_user_'));
              
              // 根据role_code生成颜色（用于其他用户的消息）
              const getUserColor = (roleCode) => {
                if (!roleCode) return { bg: 'bg-slate-900/50', border: 'border-slate-800', text: 'text-slate-200' };
                // 预定义的颜色数组，用于区分不同用户
                const colors = [
                  { bg: 'bg-purple-500/20', border: 'border-purple-500/30', text: 'text-purple-200' },
                  { bg: 'bg-pink-500/20', border: 'border-pink-500/30', text: 'text-pink-200' },
                  { bg: 'bg-indigo-500/20', border: 'border-indigo-500/30', text: 'text-indigo-200' },
                  { bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-200' },
                  { bg: 'bg-orange-500/20', border: 'border-orange-500/30', text: 'text-orange-200' },
                  { bg: 'bg-teal-500/20', border: 'border-teal-500/30', text: 'text-teal-200' },
                  { bg: 'bg-rose-500/20', border: 'border-rose-500/30', text: 'text-rose-200' },
                  { bg: 'bg-violet-500/20', border: 'border-violet-500/30', text: 'text-violet-200' },
                ];
                // 使用role_code的hash值选择颜色
                let hash = 0;
                for (let i = 0; i < roleCode.length; i++) {
                  hash = roleCode.charCodeAt(i) + ((hash << 5) - hash);
                }
                const colorIndex = Math.abs(hash % colors.length);
                return colors[colorIndex];
              };
              
              const userColor = isOtherUser ? getUserColor(msg.role_code) : null;
              
              return (
                <div
                  key={index}
                  className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[75%] rounded-lg p-4 ${
                    isCurrentUser
                      ? 'bg-cyan-500/20 border border-cyan-500/30 text-white'
                      : isOtherUser
                        ? `${userColor.bg} border ${userColor.border} ${userColor.text}`
                        : 'bg-slate-900/50 border border-slate-800 text-slate-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{msg.username}</span>
                      {msg.is_timeout_replacement && (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">
                          AI自动回复
                        </span>
                      )}
                      <span className="text-xs text-slate-500">{msg.timestamp}</span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{msg.text}</div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* 底部输入区域 */}
      <div className="p-6 border-t border-white/5 relative">
        {/* AI建议选项卡片 - 绝对定位在按钮上方 */}
        {aiSuggestions && aiSuggestions.length > 0 && (
          <div className="absolute bottom-24 left-6 z-20 w-96 bg-slate-900/95 backdrop-blur-md border border-purple-500/30 rounded-xl p-4 shadow-[0_0_30px_rgba(168,85,247,0.15)] animate-in slide-in-from-bottom-2 fade-in duration-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
                <Bot className="w-4 h-4" />
                ✨ AI建议 - 选择一个回复
              </h3>
              <button
                onClick={handleCloseSuggestions}
                className="text-slate-400 hover:text-white transition-colors"
                title="关闭建议"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {aiSuggestions.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectSuggestion(typeof option.text === 'object' ? option.text.speech : option.text)}
                  className="w-full text-left p-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 hover:border-purple-500/50 rounded-lg transition-all group"
                >
                  <div className="flex items-start gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${option.style === 'aggressive'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                      : option.style === 'balanced'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'bg-green-500/20 text-green-300 border border-green-500/40'
                      }`}>
                      {option.name}
                    </span>
                    <span className="text-xs text-slate-400 flex-1">{option.description}</span>
                  </div>
                  <p className="text-sm text-slate-200 group-hover:text-white transition-colors leading-relaxed">
                    {typeof option.text === 'object' ? option.text.speech : option.text}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {waitingForInput ? (
          <div className="mb-3 px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
            <p className="text-sm text-cyan-400 flex items-center gap-2">
              <span>⏳ 轮到 <span className="font-semibold">{waitingRoleName}</span> 发言，请输入内容...</span>
              {remainingSeconds !== null && (
                <span className="ml-3 inline-block text-xs bg-black/40 px-2 py-0.5 rounded text-cyan-200">
                  剩余: {remainingSeconds}s
                </span>
              )}
            </p>
          </div>
        ) : (
          <div className="mb-3 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg">
            <p className="text-sm text-slate-400">
              {aiControlEnabled ? '💬 等待轮到你的角色发言...' : '🤖 AI自由行动模式，观察对话中...'}
            </p>
          </div>
        )}

        <div className="flex gap-4 items-end">
          {/* AI建议按钮 - 移至左侧 */}
          {waitingForInput && aiControlEnabled && (
            <button
              onClick={handleRequestSuggestions}
              disabled={loadingSuggestions}
              className={`h-[50px] px-4 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap ${loadingSuggestions ? 'w-[120px]' : 'w-[100px]'
                }`}
              title="让AI生成三个回复建议"
            >
              {loadingSuggestions ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>生成中...</span>
                </>
              ) : (
                <>
                  <Bot className="w-5 h-5" />
                  <span>AI建议</span>
                </>
              )}
            </button>
          )}

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={waitingForInput ? `为 ${waitingRoleName} 输入消息...` : '等待轮到你的角色发言...'}
            disabled={!waitingForInput}
            className={`flex-1 bg-slate-900/50 border rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none resize-none transition-all h-[50px] leading-relaxed custom-scrollbar ${waitingForInput
              ? 'border-cyan-500/50 focus:border-cyan-500'
              : 'border-slate-700 opacity-50 cursor-not-allowed'
              }`}
            style={{ minHeight: '50px', maxHeight: '150px' }}
          />

          <button
            onClick={handleSend}
            disabled={!waitingForInput || !inputText.trim() || !ws || ws.readyState !== WebSocket.OPEN}
            className={`h-[50px] px-6 font-bold rounded-lg transition-all ${waitingForInput && inputText.trim()
              ? 'bg-cyan-500 hover:bg-cyan-400 text-black'
              : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50'
              }`}
          >
            发送
          </button>
        </div>
      </div>

      {/* 社交报告模态框 */}
      {showReport && reportData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col">
            {/* 模态框头部 */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white">社交报告</h2>
                <p className="text-sm text-slate-400 mt-1">
                  {reportData.agent_code || '用户Agent'} · {reportData.timestamp || new Date().toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowReport(false);
                  setReportData(null);
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 报告内容 */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="prose prose-invert prose-slate max-w-none">
                <ReactMarkdown
                  className="text-slate-200 leading-relaxed"
                  components={{
                    h1: ({ node, ...props }) => <h1 className="text-2xl font-bold text-white mb-4 mt-6" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="text-xl font-bold text-cyan-400 mb-3 mt-5" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="text-lg font-semibold text-cyan-300 mb-2 mt-4" {...props} />,
                    p: ({ node, ...props }) => <p className="mb-3 text-slate-200" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-3 text-slate-200 space-y-1" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-3 text-slate-200 space-y-1" {...props} />,
                    li: ({ node, ...props }) => <li className="ml-4" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-semibold text-white" {...props} />,
                    em: ({ node, ...props }) => <em className="italic text-slate-300" {...props} />,
                  }}
                >
                  {reportData.report_text || reportData.report || '报告内容为空'}
                </ReactMarkdown>
              </div>
            </div>

            {/* 模态框底部 */}
            <div className="p-6 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => {
                  setShowReport(false);
                  setReportData(null);
                }}
                className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg font-medium transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

