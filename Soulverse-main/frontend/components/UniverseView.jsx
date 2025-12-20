import { useState, useEffect, useRef } from 'react';
import { Atom, ChevronRight, Play, User, LogOut, Loader, Users, ArrowRight, Hash } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import CosmicBackground from './CosmicBackground';
import NeuralMatching from './NeuralMatching';
import ChatInterface from './ChatInterface';
import CreationWizard from './CreationWizard';
import UserAgentStatus from './UserAgentStatus';
import { api } from '../services/api';

export default function UniverseView({ user }) {
  const searchParams = useSearchParams();
  const [showWizard, setShowWizard] = useState(false);
  const [showUserStatus, setShowUserStatus] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [chatStarted, setChatStarted] = useState(false);
  const [hasDigitalTwin, setHasDigitalTwin] = useState(false);
  const [ws, setWs] = useState(null);
  const [agentsAdded, setAgentsAdded] = useState(false); // 跟踪是否已添加agents
  const [is1on1, setIs1on1] = useState(false);
  const [targetAgent, setTargetAgent] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [viewingAgent, setViewingAgent] = useState(null); // Track which agent profile to view
  const [isAddingAgents, setIsAddingAgents] = useState(false); // 正在添加agents到沙盒

  const [roomId, setRoomId] = useState(null); // Initialize as null to show selection
  const [roomInput, setRoomInput] = useState('');
  const [isNewRoom, setIsNewRoom] = useState(false); // 标记是否是新建房间
  const [roomAgents, setRoomAgents] = useState([]); // 房间中所有agents（包括用户agents和预设agents）
  const [userAgents, setUserAgents] = useState([]); // 房间中的用户agents（数字孪生）

  const initRef = useRef(false); // 防止 StrictMode 重复执行

  // Initialize Room ID
  useEffect(() => {
    const rid = searchParams.get('room_id');
    if (rid) {
      // 通过URL参数进入，检查房间是否存在
      api.checkRoomExists(rid).then(result => {
        if (result.exists) {
          setIsNewRoom(false); // 加入已有房间
        } else {
          setIsNewRoom(true); // 房间不存在，创建新房间
        }
        setRoomId(rid);
      }).catch(error => {
        console.error('检查房间失败:', error);
        setIsNewRoom(true); // 默认作为新建房间
        setRoomId(rid);
      });
    }
  }, [searchParams]);

  useEffect(() => {
    if (!roomId) return; // Wait for room_id

    // 重置初始化标志和状态
    initRef.current = false;
    setHasDigitalTwin(false);
    setAgentsAdded(false);
    setSelectedAgents([]);
    setRoomAgents([]);
    setUserAgents([]);

    // 延迟一点再初始化，确保状态已重置
    const timer = setTimeout(() => {
      if (initRef.current) return; // 防止重复初始化
      initRef.current = true;
      checkDigitalTwin();
    }, 100);

    // 初始化 WebSocket 连接（用于接收角色列表更新）
    // Use room-specific WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const isDev = process.env.NODE_ENV === 'development';
    const clientId = Math.random().toString(36).substring(7);

    // /ws/{room_id}/{client_id}
    const websocketUrl = isDev
      ? `${protocol}//${host}:8001/ws/${roomId}/${clientId}`
      : `${protocol}//${host}/ws/${roomId}/${clientId}`;

    const websocket = new WebSocket(websocketUrl);

    websocket.onopen = () => {
      console.log('UniverseView WebSocket connected');
      setWs(websocket);
      // 请求角色列表
      websocket.send(JSON.stringify({ type: 'request_characters' }));
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'characters_list') {
        console.log('角色列表已更新:', data.data.characters);
        // 更新房间agents列表
        if (data.data.characters) {
          setRoomAgents(data.data.characters);
          const userAgentsList = data.data.characters.filter(
            char => char.role_code?.startsWith('digital_twin_user_')
          );
          setUserAgents(userAgentsList);
        }
      }
    };

    websocket.onerror = (error) => {
      console.error('UniverseView WebSocket error:', error);
    };

    websocket.onclose = () => {
      console.log('UniverseView WebSocket disconnected');
      setWs(null);
    };

    // Cleanup function: clear timer and close websocket
    return () => {
      clearTimeout(timer);
      websocket.close();
    };
  }, [roomId]);

  const checkDigitalTwin = async () => {
    try {
      console.log('检查数字孪生...');
      console.log(`房间模式: ${isNewRoom ? '新建房间' : '加入已有房间'}`);

      const result = await api.getDigitalTwin();
      if (result && result.success && result.agent_info) {
        console.log('发现已有数字孪生，role_code:', result.agent_info.role_code);
        setHasDigitalTwin(true);

        // 注意：用户agent不再立即恢复，而是在点击"开始对话"时恢复

        // 只有在新建房间时才加载匹配结果（但不添加到沙盒）
        if (isNewRoom) {
          console.log('新建房间模式：加载匹配结果并添加预设agents');
          // 清空沙盒中的旧预设agents（新建房间时）
          try {
            const clearResult = await api.clearPresetAgents(roomId);
            if (clearResult.success) {
              console.log(`✓ 已清空 ${clearResult.removed_count || 0} 个旧预设agents`);
            }
          } catch (clearError) {
            console.warn('清空旧预设agents时出错:', clearError);
          }
          await loadMatches();
        } else {
          console.log('加入已有房间模式：不加载匹配agents，匹配列表将保持为空且禁用');
          // 加入已有房间时，获取房间中现有的agents信息
          try {
            const charactersResult = await api.getCharacters(roomId);
            if (charactersResult && charactersResult.characters) {
              // 提取预设agents（非用户数字孪生）
              const presetAgents = charactersResult.characters.filter(
                char => !char.role_code?.startsWith('digital_twin_user_')
              );
              // 提取用户agents（数字孪生）
              const userAgentsList = charactersResult.characters.filter(
                char => char.role_code?.startsWith('digital_twin_user_')
              );

              setRoomAgents(charactersResult.characters);
              setUserAgents(userAgentsList);
              setSelectedAgents([]); // 匹配列表保持为空，不显示匹配结果
              setAgentsAdded(false); // 用户agent还未加入
              console.log(`✓ 加入已有房间模式：房间中有 ${presetAgents.length} 个预设agents，${userAgentsList.length} 个用户agents`);
            }
          } catch (error) {
            console.error('获取房间agents列表失败:', error);
            setRoomAgents([]);
            setUserAgents([]);
          }
        }
      } else {
        console.log('未发现数字孪生');
        setHasDigitalTwin(false);
        setAgentsAdded(false);
      }
    } catch (error) {
      console.error('Error checking digital twin:', error);
      setHasDigitalTwin(false);
      setAgentsAdded(false);
    }
  };

  const loadMatches = async () => {
    try {
      setIsConnecting(true); // Start connection status

      // 检查房间中是否已有agents（其他用户可能已经添加了）
      // 只有在房间为空时才清空预设agents
      console.log('检查房间状态...');
      let shouldClearAgents = false;
      try {
        // 获取当前房间的agents列表
        const charactersResult = await api.getCharacters(roomId);
        if (charactersResult && charactersResult.characters) {
          const existingAgents = charactersResult.characters.filter(
            char => !char.role_code?.startsWith('digital_twin_user_')
          );
          if (existingAgents.length === 0) {
            // 房间为空，可以清空
            shouldClearAgents = true;
            console.log('房间为空，将清空旧预设agents');
          } else {
            // 房间中已有其他用户的agents，不清空
            console.log(`房间中已有 ${existingAgents.length} 个预设agents，保留它们`);
          }
        } else {
          // 无法获取列表，保守处理：不清空
          console.warn('无法获取房间agents列表，不清空agents');
        }
      } catch (error) {
        console.warn('检查房间状态时出错，不清空agents:', error);
      }

      // 只有在房间为空时才清空预设agents
      if (shouldClearAgents) {
        try {
          const clearResult = await api.clearPresetAgents(roomId);
          if (clearResult.success) {
            console.log(`✓ 已清空 ${clearResult.removed_count || 0} 个旧预设agents`);
          }
        } catch (clearError) {
          console.warn('清空旧预设agents时出错:', clearError);
        }
      }

      // 重置agentsAdded标志，允许重新添加
      setAgentsAdded(false);

      // 调用神经匹配接口
      const result = await api.neuralMatch(); // Neural match reads profile, room agnostic for reading profile, but embedding might need room? No, API updated to use default room for embedding model access. 
      // Wait, neural match API uses default room. But maybe we pass roomId if we want to use room-specific settings?
      // Currently neural_match doesn't take room_id because it just matches vs preset templates (global).
      // So no change needed here.

      if (result.success) {
        // 后端返回的是 matched_twins 和 random_twins，不是 matches
        const matchedTwins = result.matched_twins || [];
        const randomTwins = result.random_twins || [];

        // 合并并转换数据格式
        const allMatches = [...matchedTwins, ...randomTwins];

        const formattedAgents = allMatches.map(match => ({
          id: match.id,
          name: match.name,
          role: match.role,
          match: match.match,
          match_breakdown: match.match_breakdown, // 保留详细匹配数据
          avatar: match.avatar || 'bg-gradient-to-br from-purple-500 to-indigo-600',
          description: match.role,
          role_code: null,  // ← 初始为 null，将由 addMatchedAgentsToSandbox 更新
          preset_id: match.preset?.id,
          disabled: false,
          anime_images: match.anime_images || null // 保留动漫化图片信息
        }));

        // 确保我们有5个推荐
        const allAgents = formattedAgents.slice(0, 5);

        setSelectedAgents(allAgents);
        // 注意：不立即添加到沙盒，只显示匹配结果供用户选择
        setAgentsAdded(false); // 标记为未添加到沙盒
        console.log('✓ 匹配结果已加载，等待用户点击"开始对话"时添加agents');
      }
    } catch (error) {
      console.error('加载匹配结果失败:', error);
    } finally {
      setIsConnecting(false); // End connection status
    }
  };


  const addMatchedAgentsToSandbox = async (agents) => {
    // 首先获取房间中现有的agents列表，检查哪些preset_id已存在
    let existingPresetIds = new Set();
    try {
      const charactersResult = await api.getCharacters(roomId);
      if (charactersResult && charactersResult.characters) {
        // 提取所有预设agents的preset_id（通过role_code前缀匹配preset_id）
        charactersResult.characters.forEach(char => {
          if (char.role_code && !char.role_code.startsWith('digital_twin_user_')) {
            // role_code格式: preset_XXX_YYYYYY，提取preset_id部分
            const parts = char.role_code.split('_');
            if (parts.length >= 2) {
              const presetId = `${parts[0]}_${parts[1]}`;
              existingPresetIds.add(presetId);
            }
          }
        });
        console.log(`房间中已存在的preset_ids:`, Array.from(existingPresetIds));
      }
    } catch (error) {
      console.warn('获取现有agents列表失败，将尝试添加所有agents:', error);
    }

    // 遍历添加预设agent到沙盒，并更新role_code和完整的agent_info
    const updatedAgents = [];
    for (const agent of agents) {
      try {
        if (agent.preset_id) {
          // 检查是否已存在相同preset_id的agent
          if (existingPresetIds.has(agent.preset_id)) {
            console.log(`Agent ${agent.name} (preset_id: ${agent.preset_id}) 已存在，跳过添加`);
            // 尝试从现有agents中找到对应的role_code
            try {
              const charactersResult = await api.getCharacters(roomId);
              if (charactersResult && charactersResult.characters) {
                const existingAgent = charactersResult.characters.find(char => {
                  if (char.role_code && !char.role_code.startsWith('digital_twin_user_')) {
                    const parts = char.role_code.split('_');
                    if (parts.length >= 2) {
                      return `${parts[0]}_${parts[1]}` === agent.preset_id;
                    }
                  }
                  return false;
                });
                if (existingAgent) {
                  updatedAgents.push({
                    ...agent,
                    role_code: existingAgent.role_code,
                    disabled: agent.disabled || false,
                    fullAgentInfo: {
                      ...existingAgent,
                      match: agent.match,
                      match_breakdown: agent.match_breakdown
                    }
                  });
                  console.log(`✓ 使用已存在的agent ${agent.name} (role_code: ${existingAgent.role_code})`);
                  continue;
                }
              }
            } catch (e) {
              console.warn(`查找已存在的agent失败:`, e);
            }
            // 如果找不到，仍然添加到列表（但不会重复添加）
            updatedAgents.push(agent);
            continue;
          }

          // 添加新的agent
          const result = await api.addPresetNPC(agent.preset_id, agent.name, roomId);
          if (result.success && result.agent_info) {
            // 保存完整的agent_info，同时保留匹配度信息
            updatedAgents.push({
              ...agent,
              role_code: result.agent_info.role_code,
              disabled: agent.disabled || false,  // 明确保留disabled字段
              // Store complete agent info for profile viewing, but preserve match data
              fullAgentInfo: {
                ...result.agent_info,
                match: agent.match,  // 保留匹配度
                match_breakdown: agent.match_breakdown  // 保留详细breakdown
              }
            });
            console.log(`✓ Added agent ${agent.name} with complete profile data`);
          } else {
            updatedAgents.push(agent);  // 如果失败，保留原始信息
          }
        } else {
          updatedAgents.push(agent);
        }
      } catch (e) {
        console.error(`添加Agent ${agent.name} 失败:`, e);
        updatedAgents.push(agent);  // 即使失败也保留agent
      }
    }

    // 更新selectedAgents为包含真实role_code的列表
    setSelectedAgents(updatedAgents);
    console.log('✓ All agents added to sandbox. Updated agents:', updatedAgents);
    console.log('✓ Enabled agents count:', updatedAgents.filter(a => !a.disabled).length);

  };

  const handleWizardComplete = async (agentInfo) => {
    console.log('数字孪生创建完成，agentInfo:', agentInfo);
    setShowWizard(false);
    setHasDigitalTwin(true);
    console.log('等待1秒，确保用户agent已经被创建并添加到沙盒...');
    // 等待一下，确保用户agent已经被创建并添加到沙盒
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('开始加载匹配结果...');
    // 加载匹配结果（会自动添加预设agents到沙盒）
    await loadMatches();
  };

  const handleStartChat = async () => {
    console.log('handleStartChat called');
    console.log('房间模式:', isNewRoom ? '新建房间' : '加入已有房间');

    setIsAddingAgents(true);

    try {
      if (isNewRoom) {
        // 新建房间：添加用户agent + 选中的匹配agents
        console.log('新建房间模式：添加用户agent和选中的匹配agents');

        // 1. 先恢复用户agent到沙盒
        console.log('恢复用户agent到沙盒...');
        try {
          const restoreResult = await api.restoreUserAgent(roomId);
          if (restoreResult.success) {
            console.log('✓ 用户agent已恢复到沙盒:', restoreResult.agent_info.nickname);
          } else {
            console.warn('用户agent恢复失败（可能已存在）:', restoreResult.message);
          }
        } catch (error) {
          console.error('恢复用户agent时出错:', error);
          alert('恢复用户agent失败: ' + error.message);
          setIsAddingAgents(false);
          return;
        }

        // 2. 添加选中的匹配agents（只添加未禁用的）
        const agentsToAdd = selectedAgents.filter(a => !a.disabled);
        if (agentsToAdd.length > 0) {
          console.log(`添加 ${agentsToAdd.length} 个选中的匹配agents到沙盒...`);
          await addMatchedAgentsToSandbox(agentsToAdd);
          setAgentsAdded(true);
        } else {
          console.warn('没有选中的agents，无法开始对话');
          alert('请至少选择一个agent');
          setIsAddingAgents(false);
          return;
        }
      } else {
        // 加入已有房间：只添加用户agent，使用房间中已有的agents
        console.log('加入已有房间模式：只添加用户agent');

        // 检查房间中是否有agents (只要有任何agent，包括其他用户，就可以加入)
        if (roomAgents.length === 0) {
          alert('房间中没有agents，无法加入对话');
          setIsAddingAgents(false);
          return;
        }

        // 恢复用户agent到沙盒
        console.log('恢复用户agent到沙盒...');
        try {
          const restoreResult = await api.restoreUserAgent(roomId);
          if (restoreResult.success) {
            console.log('✓ 用户agent已恢复到沙盒:', restoreResult.agent_info.nickname);
          } else {
            console.warn('用户agent恢复失败（可能已存在）:', restoreResult.message);
          }
        } catch (error) {
          console.error('恢复用户agent时出错:', error);
          alert('恢复用户agent失败: ' + error.message);
          setIsAddingAgents(false);
          return;
        }
      }

      // 3. 更新房间agents列表
      try {
        const charactersResult = await api.getCharacters(roomId);
        if (charactersResult && charactersResult.characters) {
          setRoomAgents(charactersResult.characters);
          const userAgentsList = charactersResult.characters.filter(
            char => char.role_code?.startsWith('digital_twin_user_')
          );
          setUserAgents(userAgentsList);
        }
      } catch (error) {
        console.error('更新房间agents列表失败:', error);
      }

      // 4. 开始对话
      console.log('✓ 所有agents已添加，开始对话...');
      setChatStarted(true);
      setIs1on1(false);
      setTargetAgent(null);
    } catch (error) {
      console.error('开始对话时出错:', error);
      alert('开始对话失败: ' + error.message);
    } finally {
      setIsAddingAgents(false);
    }
  };

  const handleBackToMatching = async () => {
    try {
      // 重置沙盒状态
      console.log('Resetting sandbox...');
      const resetResult = await api.resetSandbox(roomId);

      if (resetResult.success) {
        console.log('Sandbox reset successful');
        // 重置UI状态
        setChatStarted(false);
        setIs1on1(false);
        setTargetAgent(null);

        // 重新加载匹配列表
        await loadMatches();
      } else {
        alert('重置沙盒失败: ' + (resetResult.error || '未知错误'));
      }
    } catch (error) {
      console.error('重置沙盒时出错:', error);
      alert('重置沙盒时出错: ' + error.message);
    }
  };

  const handleLogout = async () => {
    try {
      const result = await api.logout();
      if (result.success) {
        // 跳转到登录页
        router.push('/login');
      } else {
        alert('退出登录失败: ' + (result.error || '未知错误'));
      }
    } catch (error) {
      console.error('退出登录时出错:', error);
      alert('退出登录时出错');
    }
  };

  const handleToggleAgent = async (agent) => {
    const newDisabledState = !agent.disabled;

    // 乐观更新 UI
    setSelectedAgents(prev => prev.map(a =>
      a.id === agent.id ? { ...a, disabled: newDisabledState } : a
    ));

    try {
      await api.toggleAgentSandbox(agent.role_code, !newDisabledState, agent.preset_id, roomId);
    } catch (error) {
      console.error('Toggle failed', error);
      // 失败回滚
      setSelectedAgents(prev => prev.map(a =>
        a.id === agent.id ? { ...a, disabled: !newDisabledState } : a
      ));
      alert('操作失败: ' + error.message);
    }
  };

  const handleStart1on1Chat = async (agent) => {
    try {
      console.log('[1on1] Starting 1-on-1 chat with agent:', agent);

      // 验证agent有有效的role_code
      if (!agent.role_code) {
        console.error('[1on1] Agent missing role_code:', agent);
        alert('Agent尚未完全加载，请稍后再试');
        return;
      }

      console.log(`[1on1] Calling API with role_code: ${agent.role_code}, preset_id: ${agent.preset_id}, roomId: ${roomId}`);
      await api.start1on1Chat(agent.role_code, agent.preset_id, roomId);

      setTargetAgent(agent);
      setIs1on1(true);
      setChatStarted(true);
      console.log('[1on1] 1-on-1 chat started successfully');
    } catch (error) {
      console.error('Start 1-on-1 chat failed', error);
      alert('无法开启私密对话: ' + error.message);
    }
  };

  const handleViewProfile = async (agent) => {
    console.log('Viewing agent profile:', agent);

    // Try to find if this agent is already loaded in the sandbox with full info
    // Match by role_code or preset_id (agent.id from neural match is the preset_id)
    const loadedAgent = selectedAgents.find(a =>
      (a.role_code && agent.role_code && a.role_code === agent.role_code) ||
      (a.preset_id && agent.id && a.preset_id === agent.id) ||
      (a.code && agent.code && a.code === agent.code) ||
      (a.role_code && agent.code && a.role_code === agent.code)
    );

    // If found in selectedAgents, use fullAgentInfo
    if (loadedAgent?.fullAgentInfo) {
      setViewingAgent(loadedAgent.fullAgentInfo);
      return;
    }

    // Also check roomAgents for NPC agents in the room
    if (!loadedAgent) {
      const roomAgent = roomAgents.find(a =>
        (a.code && agent.code && a.code === agent.code) ||
        (a.role_code && agent.code && a.role_code === agent.code) ||
        (a.code && agent.role_code && a.code === agent.role_code)
      );
      if (roomAgent) {
        // Extract preset_id from role_code (format: preset_XXX_YYYYYY)
        const roleCode = roomAgent.code || roomAgent.role_code;
        if (roleCode && roleCode.startsWith('preset_')) {
          const parts = roleCode.split('_');
          if (parts.length >= 2) {
            const presetId = `${parts[0]}_${parts[1]}`;
            try {
              // Construct agent info similar to matched agents format
              // get_characters_info returns: mbti, interests, personality, traits, social_goals
              // We need to map this to the format expected by UserAgentStatus
              const agentInfo = {
                ...roomAgent,
                role_code: roleCode,
                nickname: roomAgent.name || roomAgent.nickname,
                role_name: roomAgent.name || roomAgent.role_name,
                description: roomAgent.description || roomAgent.goal,
                profile: roomAgent.description || roomAgent.goal,
                // Map to preset format (same as matched agents)
                preset: {
                  mbti: roomAgent.mbti,
                  big_five: roomAgent.personality?.big_five || (roomAgent.personality && typeof roomAgent.personality === 'object' ? roomAgent.personality.big_five : null),
                  values: roomAgent.interests || [],
                  defense_mechanism: roomAgent.personality?.defense_mechanism || null
                },
                // Also provide personality at root level for compatibility
                personality: roomAgent.personality || {
                  mbti: roomAgent.mbti,
                  big_five: null,
                  values: roomAgent.interests || [],
                  defense_mechanism: null
                }
              };
              setViewingAgent(agentInfo);
              return;
            } catch (error) {
              console.error('Error processing room agent profile:', error);
            }
          }
        }
        // Fallback: use basic roomAgent data
        setViewingAgent({
          ...roomAgent,
          role_code: roomAgent.code || roomAgent.role_code,
          nickname: roomAgent.name || roomAgent.nickname,
          role_name: roomAgent.name || roomAgent.role_name,
          description: roomAgent.description || roomAgent.goal,
          profile: roomAgent.description || roomAgent.goal
        });
        return;
      }
    }

    // Use basic agent data as fallback
    setViewingAgent(agent);
  };

  /* Room Selection UI */
  if (!roomId) {
    return (
      <div className="relative w-full h-screen bg-black text-white overflow-hidden flex items-center justify-center">
        <CosmicBackground intensity={0.6} />
        <div className="z-10 w-full max-w-md p-8 backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/20 mb-4 animate-pulse">
              <Users className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400">
              进入平行世界
            </h1>
            <p className="text-slate-400 mt-2">Create or join a timeline connection</p>
          </div>

          <div className="space-y-6">
            <button
              onClick={async () => {
                const newId = Math.random().toString(36).substring(2, 8);
                try {
                  const result = await api.createRoom(newId);
                  if (result.success) {
                    setIsNewRoom(true); // 标记为新建房间
                    setRoomId(newId);
                  } else {
                    alert('创建房间失败: ' + (result.message || '未知错误'));
                  }
                } catch (error) {
                  console.error('创建房间出错:', error);
                  alert('创建房间出错');
                }
              }}
              className="w-full py-4 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 rounded-xl font-bold text-lg shadow-lg shadow-cyan-500/20 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              <Atom className="w-5 h-5" />
              创建新房间
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-black text-slate-500">OR</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  placeholder="输入房间号..."
                  className="w-full bg-slate-900/50 border border-white/10 focus:border-purple-500 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 outline-none transition-all"
                />
              </div>
              <button
                onClick={async () => {
                  if (!roomInput.trim()) return;

                  // 检查房间是否存在
                  try {
                    const checkResult = await api.checkRoomExists(roomInput.trim());
                    if (!checkResult.exists) {
                      alert('房间不存在，请检查房间号是否正确');
                      return;
                    }
                    setIsNewRoom(false); // 标记为加入房间
                    setRoomId(roomInput.trim());
                  } catch (error) {
                    console.error('检查房间失败:', error);
                    alert('检查房间失败: ' + error.message);
                  }
                }}
                disabled={!roomInput.trim()}
                className="w-full py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 rounded-xl font-medium text-slate-300 transition-all flex items-center justify-center gap-2"
              >
                加入房间
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={() => setRoomId("default")}
              className="text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
            >
              Enter Default Public Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasDigitalTwin) {
    return (
      <div className="relative w-full h-screen bg-black text-white overflow-hidden flex items-center justify-center">
        <CosmicBackground intensity={0.8} />
        <div className="z-10 text-center">
          <p className="text-slate-400 mb-6">请先创建你的数字孪生</p>
          <button
            onClick={() => setShowWizard(true)}
            className="px-8 py-4 bg-gradient-to-r from-cyan-600 to-purple-600 rounded-full shadow-lg hover:shadow-xl transition-all"
          >
            创建数字孪生
          </button>
        </div>
        {showWizard && (
          <CreationWizard
            onClose={() => setShowWizard(false)}
            onComplete={handleWizardComplete}
          />
        )}
      </div>
    );
  }

  if (chatStarted) {
    return (
      <div className="relative w-full h-screen bg-black text-white overflow-hidden flex">
        <CosmicBackground intensity={0.8} />
        <NeuralMatching
          matchedTwins={selectedAgents.slice(0, 3)}
          randomTwins={selectedAgents.slice(3)}
          onToggleAgent={handleToggleAgent}
          onStartChat={handleStart1on1Chat}
          onViewProfile={handleViewProfile}
          chatStarted={chatStarted}
        />
        <ChatInterface
          selectedAgents={is1on1 && targetAgent ? [targetAgent] : selectedAgents.filter(a => !a.disabled)}
          onUserClick={() => setShowUserStatus(true)}
          onBackToMatching={handleBackToMatching}
          onLogout={handleLogout}
          isPrivateChat={is1on1}
          roomId={roomId}
          roomAgents={roomAgents}
          userAgents={userAgents}
          onViewProfile={handleViewProfile}
          canControlPlayback={isNewRoom}
          onUpdateAgents={(agents) => {
            setRoomAgents(agents);
            const userAgentsList = agents.filter(
              char => char.role_code?.startsWith('digital_twin_user_') || char.code?.startsWith('digital_twin_user_')
            );
            setUserAgents(userAgentsList);
          }}
        />
        {showUserStatus && (
          <UserAgentStatus
            isOpen={showUserStatus}
            onClose={() => setShowUserStatus(false)}
          />
        )}
        {viewingAgent && (
          <UserAgentStatus
            isOpen={!!viewingAgent}
            onClose={() => setViewingAgent(null)}
            agentData={viewingAgent}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black text-white overflow-hidden flex">
      <CosmicBackground intensity={0.8} />

      {/* 左侧边栏：匹配系统 */}
      <NeuralMatching
        matchedTwins={isNewRoom ? selectedAgents.slice(0, 3) : []}
        randomTwins={isNewRoom ? selectedAgents.slice(3) : []}
        onToggleAgent={isNewRoom ? handleToggleAgent : undefined}
        onStartChat={isNewRoom ? handleStart1on1Chat : undefined}
        onViewProfile={handleViewProfile}
        chatStarted={chatStarted}
        isDisabled={!isNewRoom} // 加入已有房间时禁用
        userAgents={userAgents} // 传递用户agents列表
        roomAgents={roomAgents} // 传递房间中所有agents列表
      />

      {/* 中央视图：宇宙 */}
      <div className="flex-1 relative z-10 flex flex-col">
        {/* 顶部导航栏 */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-4 text-sm text-slate-400 font-mono">
            <span>SECTOR: {is1on1 ? 'PRIVATE' : 'ALPHA'}</span>
            <span className="text-slate-700">|</span>
            <span className="text-cyan-400 font-bold flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {roomId}
            </span>
            <span className="text-slate-700">|</span>
            <span>NODES: {isNewRoom ? selectedAgents.filter(a => !a.disabled).length : roomAgents.filter(a => !a.role_code?.startsWith('digital_twin_user_')).length}</span>
            {userAgents.length > 0 && (
              <>
                <span className="text-slate-700">|</span>
                <span className="text-purple-400 flex items-center gap-1" title={`房间中的用户: ${userAgents.map(a => a.nickname || a.role_name).join(', ')}`}>
                  <User className="w-3 h-3" />
                  USERS: {userAgents.length}
                </span>
              </>
            )}
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setShowUserStatus(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              title="我的数字孪生"
            >
              <User className="w-5 h-5" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors"
              title="退出登录"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* 主体交互区 */}
        <main className="flex-1 relative overflow-hidden flex items-center justify-center">
          {/* 中央视觉元素 */}
          <div className="relative w-64 h-64 md:w-96 md:h-96 flex items-center justify-center">
            {/* 轨道圈动画 */}
            <div className={`absolute inset-0 border border-cyan-500/20 rounded-full ${isConnecting ? 'animate-[spin_2s_linear_infinite]' : 'animate-[spin_10s_linear_infinite]'}`}></div>
            <div className={`absolute inset-4 border border-purple-500/20 rounded-full ${isConnecting ? 'animate-[spin_3s_linear_infinite_reverse]' : 'animate-[spin_15s_linear_infinite_reverse]'}`}></div>
            <div className={`absolute inset-12 border-2 border-dashed border-slate-700/50 rounded-full ${isConnecting ? 'animate-[spin_5s_linear_infinite]' : 'animate-[spin_30s_linear_infinite]'}`}></div>

            {/* 核心文本 */}
            <div className="text-center z-10 p-8 backdrop-blur-sm rounded-full bg-black/20">
              <p className={`font-mono text-xs tracking-[0.2em] mb-2 ${isConnecting ? 'text-yellow-400 animate-pulse' : 'text-cyan-400'}`}>
                {isConnecting ? 'ESTABLISHING LINK...' : 'CONNECTION ESTABLISHED'}
              </p>
              <h1 className="text-4xl font-bold text-white mb-2 tracking-tighter">
                {isConnecting ? '连接中...' : (
                  isNewRoom ? (
                    selectedAgents.length > 1
                      ? '已连接'
                      : (selectedAgents.length > 0 ? selectedAgents[0].name : '等待匹配')
                  ) : (
                    roomAgents.length > 0
                      ? `已加入房间 (${roomAgents.filter(a => !a.role_code?.startsWith('digital_twin_user_')).length} agents)`
                      : '已加入房间'
                  )
                )}
              </h1>
              <button
                onClick={handleStartChat}
                disabled={isConnecting || isAddingAgents || (isNewRoom ? selectedAgents.filter(a => !a.disabled).length === 0 : roomAgents.length === 0)}
                className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-sm backdrop-blur-md transition-all flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? (
                  <><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-loader w-3 h-3 animate-spin"><path d="M12 2v4" /><path d="m16.2 7.8 2.9-2.9" /><path d="M18 12h4" /><path d="m16.2 16.2 2.9 2.9" /><path d="M12 18v4" /><path d="m7.8 16.2-2.9 2.9" /><path d="M6 12H2" /><path d="m7.8 7.8-2.9-2.9" /></svg> 正在连接...</>
                ) : isAddingAgents ? (
                  <><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-loader w-3 h-3 animate-spin"><path d="M12 2v4" /><path d="m16.2 7.8 2.9-2.9" /><path d="M18 12h4" /><path d="m16.2 16.2 2.9 2.9" /><path d="M12 18v4" /><path d="m7.8 16.2-2.9 2.9" /><path d="M6 12H2" /><path d="m7.8 7.8-2.9-2.9" /></svg> 正在添加agents...</>
                ) : (
                  <><Play className="w-3 h-3 fill-current" /> 开始对话</>
                )}
              </button>
            </div>
          </div>
        </main>

        {/* 底部交互指引区 */}
        <div className="p-8 pb-12 flex justify-center pointer-events-none">
          <button
            onClick={() => setShowWizard(true)}
            className="pointer-events-auto group relative flex items-center gap-4 px-8 py-4 bg-gradient-to-r from-cyan-600 to-purple-600 rounded-full shadow-[0_0_40px_rgba(6,182,212,0.4)] hover:shadow-[0_0_60px_rgba(6,182,212,0.6)] hover:-translate-y-1 transition-all duration-300"
          >
            <div className="relative">
              <Atom className="w-8 h-8 text-white animate-spin-slow" />
              <div className="absolute inset-0 bg-white rounded-full blur-md opacity-30 animate-pulse"></div>
            </div>
            <div className="text-left">
              <div className="text-white font-bold text-lg">{hasDigitalTwin ? '重新创造数字孪生' : '创造数字孪生'}</div>
              <div className="text-cyan-200 text-xs font-mono">{hasDigitalTwin ? 'RE-GENERATE DIGITAL TWIN' : 'GENERATE DIGITAL TWIN'}</div>
            </div>
            <ChevronRight className="w-5 h-5 text-white/50 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* 模态框 */}
      {showWizard && (
        <CreationWizard
          onClose={() => setShowWizard(false)}
          onComplete={handleWizardComplete}
        />
      )}
      {showUserStatus && (
        <UserAgentStatus
          isOpen={showUserStatus}
          onClose={() => setShowUserStatus(false)}
        />
      )}
      {viewingAgent && (
        <UserAgentStatus
          isOpen={!!viewingAgent}
          onClose={() => setViewingAgent(null)}
          agentData={viewingAgent}
        />
      )}
    </div>
  );
}

