import { useState, useEffect } from 'react';
import { Sparkles, Globe, MessageSquare, User, Users } from 'lucide-react';
import { api } from '../services/api';

export default function NeuralMatching({ matchedTwins = [], randomTwins = [], onToggleAgent, onStartChat, onViewProfile, chatStarted = false, isDisabled = false, userAgents = [], roomAgents = [] }) {
  const [userDisplayName, setUserDisplayName] = useState('User_001');

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      // 先尝试获取数字孪生信息
      const twinResult = await api.getDigitalTwin();
      if (twinResult.success && twinResult.agent_info) {
        const agentInfo = twinResult.agent_info;
        // 优先级：nickname > role_name，如果nickname是"My Digital Twin"则尝试获取username
        let displayName = agentInfo.nickname || agentInfo.role_name;
        if (displayName === 'My Digital Twin') {
          // 如果nickname是默认值，尝试获取用户名
          const userResult = await api.getCurrentUser();
          if (userResult.success && userResult.user && userResult.user.username) {
            displayName = userResult.user.username;
          } else {
            displayName = agentInfo.role_name || 'User_001';
          }
        }
        setUserDisplayName(displayName || 'User_001');
        return;
      }

      // 如果没有数字孪生，尝试获取当前用户信息
      const userResult = await api.getCurrentUser();
      if (userResult.success && userResult.user) {
        setUserDisplayName(userResult.user.username || userResult.user.user_id || 'User_001');
      }
    } catch (error) {
      console.error('Error loading user info:', error);
    }
  };

  return (
    <div className="w-80 h-full bg-slate-950/80 backdrop-blur-md border-r border-slate-800 z-20 flex flex-col transform transition-transform duration-300">
      <div className="p-6 border-b border-slate-800">
        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400">
          神经元匹配
        </h2>
        <p className="text-xs text-slate-500 mt-1">基于你的数字指纹</p>
        {isDisabled && (
          <p className="text-xs text-amber-500 mt-2">⚠️ 加入已有房间 - 匹配agents已禁用</p>
        )}
        {chatStarted && !isDisabled && (
          <p className="text-xs text-amber-500 mt-2">⚠️ 聊天进行中 - Toggle已禁用</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* 最佳匹配 */}
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-yellow-500" /> 完美共鸣 (Top 3)
          </h3>
          <div className="space-y-3">
            {isDisabled && matchedTwins.length === 0 && randomTwins.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-900/50 border border-dashed border-slate-700 text-center">
                <p className="text-xs text-slate-500 mb-2">加入已有房间模式</p>
                <p className="text-xs text-slate-600">匹配agents已禁用</p>
                <p className="text-xs text-slate-600 mt-1">只能使用房间中已有的agents</p>
              </div>
            ) : (
              matchedTwins.map(twin => (
                <div
                  key={twin.id}
                  className={`group p-3 rounded-xl bg-slate-900 border border-slate-800 transition-all ${
                    isDisabled || chatStarted 
                      ? 'cursor-not-allowed opacity-40' 
                      : 'hover:border-cyan-500/50 hover:bg-slate-800 cursor-pointer opacity-100'
                  } ${twin.disabled ? 'opacity-30 grayscale' : ''}`}
                  onClick={() => !isDisabled && !chatStarted && onToggleAgent && onToggleAgent(twin)}
                >
                <div className="flex items-center gap-3">
                  {twin.anime_images?.front ? (
                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-purple-500/30 flex items-center justify-center shadow-lg">
                      <img 
                        src={twin.anime_images.front} 
                        alt={twin.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className={`w-10 h-10 rounded-full ${twin.avatar} flex items-center justify-center text-xs font-bold shadow-lg`}>
                      {twin.name.substring(0, 2)}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm text-slate-200">{twin.name}</span>
                      <span className="text-xs font-mono text-cyan-400">{twin.match}%</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{twin.role}</div>
                  </div>
                </div>
                {/* Interaction Bar */}
                <div className={`mt-3 flex gap-2 transition-opacity ${twin.disabled || chatStarted || isDisabled ? 'hidden' : 'opacity-100'}`}>
                  <button
                    className="flex-1 py-1 text-xs bg-cyan-500/20 text-cyan-300 rounded hover:bg-cyan-500/40"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartChat && onStartChat(twin);
                    }}
                  >
                    私密对话
                  </button>
                  <button
                    className="flex-1 py-1 text-xs bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/40"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewProfile && onViewProfile(twin);
                    }}
                  >
                    查看档案
                  </button>
                </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 随机遭遇 */}
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Globe className="w-3 h-3 text-slate-400" /> 随机遭遇
          </h3>
          <div className="space-y-3">
            {randomTwins.map(twin => (
              <div
                key={twin.id}
                className={`p-3 rounded-xl bg-slate-900/50 border border-dashed border-slate-800 transition-all ${
                  isDisabled || chatStarted 
                    ? 'cursor-not-allowed opacity-30' 
                    : 'hover:border-slate-600 cursor-pointer opacity-75 hover:opacity-100'
                } ${twin.disabled ? 'opacity-20 grayscale' : ''}`}
                onClick={() => !isDisabled && !chatStarted && onToggleAgent && onToggleAgent(twin)}
              >
                <div className="flex items-center gap-3">
                  {twin.anime_images?.front ? (
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-purple-500/30 grayscale group-hover:grayscale-0 flex items-center justify-center">
                      <img 
                        src={twin.anime_images.front} 
                        alt={twin.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className={`w-8 h-8 rounded-full ${twin.avatar} grayscale group-hover:grayscale-0 flex items-center justify-center text-[10px] font-bold`}>
                      {twin.name.substring(0, 1)}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="text-sm text-slate-300">{twin.name}</div>
                    <div className="text-[10px] text-slate-600">匹配度: {twin.match}%</div>
                  </div>
                  <button
                    className="px-2 py-1 text-[10px] bg-slate-800 text-slate-400 rounded hover:bg-slate-700 hover:text-slate-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewProfile && onViewProfile(twin);
                    }}
                  >
                    档案
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 房间中的预设agents（加入已有房间时显示） */}
      {isDisabled && roomAgents && roomAgents.length > 0 && (() => {
        const presetAgents = roomAgents.filter(a => !a.role_code?.startsWith('digital_twin_user_'));
        return presetAgents.length > 0 ? (
          <div className="p-4 border-t border-slate-800">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Globe className="w-3 h-3 text-slate-400" /> 房间中的NPC Agents ({presetAgents.length})
            </h3>
            <p className="text-xs text-amber-500/80 mb-3 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded">
              ⚠️ 注意：这些是房间中已有的agents，不是匹配结果
            </p>
            <div className="space-y-2">
              {presetAgents.map((agent, index) => (
                <div
                  key={agent.code || agent.role_code || index}
                  className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 flex items-center gap-2 opacity-75 hover:opacity-100 hover:border-slate-600 transition-all"
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-xs font-bold">
                    {(agent.name || agent.nickname || agent.role_name || 'N').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-300 truncate">
                      {agent.name || agent.nickname || agent.role_name || 'Unknown'}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {agent.code || agent.role_code || ''}
                    </div>
                  </div>
                  {onViewProfile && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewProfile(agent);
                      }}
                      className="px-2 py-1 text-[10px] bg-slate-700 text-slate-300 rounded hover:bg-slate-600 hover:text-white transition-colors"
                      title="查看档案"
                    >
                      档案
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null;
      })()}

      {/* 房间中的用户agents */}
      {userAgents.length > 0 && (
        <div className="p-4 border-t border-slate-800">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users className="w-3 h-3 text-purple-400" /> 房间中的用户 ({userAgents.length})
          </h3>
          <div className="space-y-2">
            {userAgents.map((agent, index) => (
              <div
                key={agent.role_code || index}
                className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center gap-2"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-xs font-bold">
                  {agent.nickname?.charAt(0) || agent.role_name?.charAt(0) || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-purple-300 truncate">
                    {agent.nickname || agent.role_name || 'Unknown'}
                  </div>
                  <div className="text-[10px] text-purple-500/70 truncate">
                    {agent.role_code?.replace('digital_twin_user_', '') || ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 用户状态 */}
      <div className="p-4 border-t border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-white to-slate-400 flex items-center justify-center">
            <User className="w-4 h-4 text-black" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold">{userDisplayName}</div>
            <div className="text-xs text-cyan-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
              链接稳定
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

