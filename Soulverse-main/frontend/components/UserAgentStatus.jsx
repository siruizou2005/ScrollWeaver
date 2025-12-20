import { useState, useEffect } from 'react';
import { User, X, Brain, Shield, Sparkles, MessageSquare } from 'lucide-react';
import { api } from '../services/api';
import PersonalityRadar from './PersonalityRadar';

export default function UserAgentStatus({ isOpen, onClose, agentData = null }) {
  const [agentInfo, setAgentInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      if (agentData) {
        // agentData could be either:
        // 1. Full agent_info from backend (has personality, generated_profile, etc.)
        // 2. Simple matched agent data (minimal info)
        // UserAgentStatus will handle both gracefully
        setAgentInfo(agentData);
        setLoading(false);
      } else {
        // Load user's own digital twin
        loadAgentInfo();
      }
    }
  }, [isOpen, agentData]);

  const loadAgentInfo = async () => {
    try {
      setLoading(true);
      const result = await api.getDigitalTwin();
      if (result.success) {
        setAgentInfo(result.agent_info);
      }
    } catch (error) {
      console.error('Error loading agent info:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Helper to safely get nested data
  const getPersonalityData = () => {
    if (!agentInfo) return null;
    return agentInfo.generated_profile?.core_traits?.big_five ||
      agentInfo.personality?.big_five ||
      agentInfo.preset?.big_five || // Fallback to preset data
      null;
  };

  const getValues = () => {
    if (!agentInfo) return [];
    return agentInfo.generated_profile?.core_traits?.values ||
      agentInfo.personality?.values ||
      agentInfo.preset?.values || // Fallback to preset data
      [];
  };

  const getDefenseMechanism = () => {
    if (!agentInfo) return null;
    return agentInfo.generated_profile?.core_traits?.defense_mechanism ||
      agentInfo.personality?.defense_mechanism ||
      agentInfo.preset?.defense_mechanism; // Fallback to preset data
  };

  const getMbti = () => {
    if (!agentInfo) return null;
    return agentInfo.generated_profile?.core_traits?.mbti ||
      agentInfo.personality?.mbti ||
      agentInfo.preset?.mbti || // Fallback to preset data
      (agentInfo.location ? agentInfo.location.replace('MBTI: ', '') : null);
  };

  const bigFiveData = getPersonalityData();
  const speakingStyle = agentInfo?.generated_profile?.speaking_style || agentInfo?.speaking_style;

  const DEFENSE_MECHANISMS = {
    'Rationalization': { name: '合理化', desc: '为行为寻找逻辑理由以掩饰真实动机' },
    'Projection': { name: '投射', desc: '将自己的冲动或欲望归咎于他人' },
    'Denial': { name: '否认', desc: '拒绝承认痛苦的现实或事实' },
    'Repression': { name: '压抑', desc: '将痛苦的想法排斥到潜意识中' },
    'Sublimation': { name: '升华', desc: '将本能冲动转化为社会可接受的行为' },
    'Displacement': { name: '转移', desc: '将情绪发泄到较安全的替代对象上' },
    'ReactionFormation': { name: '反向形成', desc: '表现出与内心冲动相反的行为' },
    'Humor': { name: '幽默', desc: '以幽默的方式处理压力和冲突' },
    'Intellectualization': { name: '理智化', desc: '用理性的分析回避情感痛苦' }
  };

  const defense = getDefenseMechanism();
  const defenseInfo = DEFENSE_MECHANISMS[defense] || { name: defense, desc: '心理防御模式' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="bg-slate-900/90 border border-cyan-500/30 rounded-2xl w-full max-w-5xl h-[90vh] overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-slate-900 to-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">{agentData ? 'Agent档案' : '我的数字孪生'}</h2>
              <p className="text-xs text-cyan-400 font-mono tracking-wider">{agentData ? 'AGENT PROFILE' : 'DIGITAL TWIN PROFILE'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="font-mono text-sm animate-pulse">LOADING NEURAL DATA...</p>
              </div>
            </div>
          ) : agentInfo ? (
            <div className="flex flex-col md:flex-row h-full min-h-0">
              {/* Left Column: Visuals */}
              <div className="w-full md:w-5/12 p-8 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/50 flex flex-col items-center min-h-0">
                <div className="text-center mb-10">
                  <h3 className="text-4xl font-bold text-white mb-4 tracking-tight">{agentInfo.nickname || agentInfo.role_name}</h3>
                  <div className="inline-block px-6 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-xl font-bold tracking-widest shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                    {getMbti() || 'UNKNOWN TYPE'}
                  </div>
                </div>

                {/* 动漫化图片展示 */}
                {agentInfo.anime_images && (
                  <div className="w-full mb-6">
                    <h4 className="text-sm text-slate-400 mb-3 text-center">动漫化形象</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {agentInfo.anime_images.front && (
                        <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-purple-500/30">
                          <img 
                            src={agentInfo.anime_images.front} 
                            alt="正面照" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      {agentInfo.anime_images.life1 && (
                        <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-purple-500/30">
                          <img 
                            src={agentInfo.anime_images.life1} 
                            alt="生活照1" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      {agentInfo.anime_images.life2 && (
                        <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-purple-500/30">
                          <img 
                            src={agentInfo.anime_images.life2} 
                            alt="生活照2" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
                  {bigFiveData ? (
                    <PersonalityRadar data={bigFiveData} />
                  ) : (
                    <div className="text-slate-500 text-sm">暂无详细人格数据</div>
                  )}
                </div>

                <div className="w-full mt-8 grid grid-cols-2 gap-4 flex-shrink-0">
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                    <div className="text-slate-400 text-xs mb-1">
                      {agentInfo.match !== undefined ? '匹配度' : '同步率'}
                    </div>
                    <div className={`text-2xl font-bold ${agentInfo.match !== undefined
                      ? agentInfo.match >= 70 ? 'text-green-400' : agentInfo.match >= 50 ? 'text-yellow-400' : 'text-orange-400'
                      : 'text-cyan-400'
                      }`}>
                      {agentInfo.match !== undefined ? `${agentInfo.match}%` : '98.4%'}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                    <div className="text-slate-400 text-xs mb-1">状态</div>
                    <div className="text-green-400 text-sm font-mono flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                      ONLINE
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Details */}
              <div className="w-full md:w-7/12 overflow-y-auto custom-scrollbar min-h-0">
                <div className="p-8 space-y-8">
                {/* Match Breakdown - Only show for matched agents */}
                {agentInfo.match_breakdown && (
                  <section>
                    <h4 className="flex items-center gap-2 text-base font-bold text-white mb-3">
                      <Brain className="w-4 h-4 text-cyan-400" />
                      <span>匹配度分析</span>
                    </h4>
                    <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
                      <div className="grid grid-cols-2 gap-3">
                        {/* Personality */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-xs">性格共鸣</span>
                            <span className={`text-xs font-bold ${agentInfo.match_breakdown.personality >= 70 ? 'text-green-400' :
                                agentInfo.match_breakdown.personality >= 40 ? 'text-yellow-400' : 'text-orange-400'
                              }`}>
                              {agentInfo.match_breakdown.personality}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${agentInfo.match_breakdown.personality >= 70 ? 'bg-green-400' :
                                  agentInfo.match_breakdown.personality >= 40 ? 'bg-yellow-400' : 'bg-orange-400'
                                }`}
                              style={{ width: `${agentInfo.match_breakdown.personality}%` }}
                            />
                          </div>
                        </div>

                        {/* Values */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-xs">价值观契合</span>
                            <span className={`text-xs font-bold ${agentInfo.match_breakdown.values >= 70 ? 'text-green-400' :
                                agentInfo.match_breakdown.values >= 40 ? 'text-yellow-400' : 'text-orange-400'
                              }`}>
                              {agentInfo.match_breakdown.values}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${agentInfo.match_breakdown.values >= 70 ? 'bg-green-400' :
                                  agentInfo.match_breakdown.values >= 40 ? 'bg-yellow-400' : 'bg-orange-400'
                                }`}
                              style={{ width: `${agentInfo.match_breakdown.values}%` }}
                            />
                          </div>
                        </div>

                        {/* Interests */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-xs">兴趣重叠</span>
                            <span className={`text-xs font-bold ${agentInfo.match_breakdown.interests >= 70 ? 'text-green-400' :
                                agentInfo.match_breakdown.interests >= 40 ? 'text-yellow-400' : 'text-orange-400'
                              }`}>
                              {agentInfo.match_breakdown.interests}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${agentInfo.match_breakdown.interests >= 70 ? 'bg-green-400' :
                                  agentInfo.match_breakdown.interests >= 40 ? 'bg-yellow-400' : 'bg-orange-400'
                                }`}
                              style={{ width: `${agentInfo.match_breakdown.interests}%` }}
                            />
                          </div>
                        </div>

                        {/* Goals */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-xs">社交目标</span>
                            <span className={`text-xs font-bold ${agentInfo.match_breakdown.goals >= 70 ? 'text-green-400' :
                                agentInfo.match_breakdown.goals >= 40 ? 'text-yellow-400' : 'text-orange-400'
                              }`}>
                              {agentInfo.match_breakdown.goals}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${agentInfo.match_breakdown.goals >= 70 ? 'bg-green-400' :
                                  agentInfo.match_breakdown.goals >= 40 ? 'bg-yellow-400' : 'bg-orange-400'
                                }`}
                              style={{ width: `${agentInfo.match_breakdown.goals}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Profile */}
                <section>
                  <h4 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                    <Brain className="w-5 h-5 text-purple-400" />
                    <span>核心档案</span>
                  </h4>
                  <div className="p-6 rounded-2xl bg-slate-800/30 border border-slate-700/50 text-slate-300 leading-relaxed">
                    {agentInfo.profile || agentInfo.description || '暂无描述'}
                  </div>
                </section>

                {/* Values */}
                <section>
                  <h4 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                    <Sparkles className="w-5 h-5 text-yellow-400" />
                    <span>核心价值观</span>
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {getValues().map((value, i) => (
                      <span key={i} className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm hover:border-cyan-500/50 transition-colors">
                        {value}
                      </span>
                    ))}
                    {getValues().length === 0 && <span className="text-slate-500 text-sm">未定义</span>}
                  </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Defense Mechanism */}
                  <section>
                    <h4 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                      <Shield className="w-5 h-5 text-red-400" />
                      <span>防御机制</span>
                    </h4>
                    <div className="p-6 rounded-xl bg-red-500/5 border border-red-500/20 h-full flex flex-col justify-center min-h-[160px]">
                      <div className="text-red-200 font-bold text-2xl mb-3 text-center">
                        {defenseInfo.name || '未检测到'}
                      </div>
                      <div className="text-base text-red-400/80 leading-relaxed text-center">
                        {defenseInfo.desc}
                      </div>
                      {defense && (
                        <div className="mt-4 text-xs font-mono text-red-500/40 uppercase text-center tracking-widest">
                          {defense}
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Speaking Style */}
                  <section>
                    <h4 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                      <MessageSquare className="w-5 h-5 text-green-400" />
                      <span>语言风格</span>
                    </h4>
                    <div className="p-6 rounded-xl bg-green-500/5 border border-green-500/20 h-full flex flex-col justify-center min-h-[160px] space-y-4">
                      {speakingStyle ? (
                        <>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-green-500/10 rounded-lg px-3 py-2 text-green-300 text-center">
                              <span className="text-green-500/50 text-xs block mb-1 uppercase tracking-wider">句长</span>
                              <span className="font-medium text-lg">{speakingStyle.sentence_length || '未知'}</span>
                            </div>
                            <div className="bg-green-500/10 rounded-lg px-3 py-2 text-green-300 text-center">
                              <span className="text-green-500/50 text-xs block mb-1 uppercase tracking-wider">词汇</span>
                              <span className="font-medium text-lg">{speakingStyle.vocabulary_level || speakingStyle.vocabulary || '未知'}</span>
                            </div>
                          </div>

                          {speakingStyle.catchphrases && speakingStyle.catchphrases.length > 0 && (
                            <div className="text-center">
                              <div className="text-xs text-green-500/60 mb-2 uppercase tracking-wider">口头禅</div>
                              <div className="flex flex-wrap gap-2 justify-center">
                                {speakingStyle.catchphrases.map((phrase, i) => (
                                  <span key={i} className="text-sm px-3 py-1 rounded-full border border-green-500/30 text-green-300 bg-green-500/5">
                                    {phrase}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-green-400/60 text-sm text-center">
                          暂无语言风格数据，请在创建时上传聊天记录。
                        </div>
                      )}
                    </div>
                  </section>
                </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <div className="w-24 h-24 rounded-full bg-slate-800 mb-4 flex items-center justify-center">
                <User className="w-12 h-12 text-slate-600" />
              </div>
              <p className="text-lg">尚未创建数字孪生</p>
              <p className="text-sm text-slate-600 mt-2">请先完成人格构建流程</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

