const API_BASE = '/api';

export const api = {
  // 用户认证
  async login(userId, password, isGuest = false) {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user_id: userId, password, is_guest: isGuest })
    });
    return response.json();
  },

  async register(userId, password, username) {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user_id: userId, password, username })
    });
    return response.json();
  },

  async getCurrentUser() {
    try {
      const response = await fetch(`${API_BASE}/user/me`, {
        credentials: 'include'
      });
      if (!response.ok) {
        // 401 或其他错误，返回未登录状态
        return { success: false, user: null };
      }
      return response.json();
    } catch (error) {
      console.error('getCurrentUser error:', error);
      // 网络错误或其他错误，返回未登录状态
      return { success: false, user: null };
    }
  },

  async logout() {
    try {
      const response = await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      return response.json();
    } catch (error) {
      console.error('logout error:', error);
      return { success: false, error: error.message };
    }
  },

  // 数字孪生
  async saveDigitalTwin(agentInfo) {
    const response = await fetch(`${API_BASE}/user/digital-twin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ agent_info: agentInfo })
    });
    return response.json();
  },

  async generateDigitalTwinProfile(data) {
    const response = await fetch(`${API_BASE}/generate-digital-twin-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    return response.json();
  },

  async generateAnimeImages(formData) {
    const response = await fetch(`${API_BASE}/generate-anime-images`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = '动漫化处理失败';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorJson.message || errorMessage;
      } catch (e) {
        errorMessage = errorText || `服务器错误: ${response.status}`;
      }
      return { success: false, error: errorMessage, detail: errorMessage };
    }

    return response.json();
  },

  async getDigitalTwin() {
    const response = await fetch(`${API_BASE}/user/digital-twin`, {
      credentials: 'include'
    });
    return response.json();
  },

  // 神经元匹配
  async neuralMatch() {
    const response = await fetch(`${API_BASE}/neural-match`, {
      method: 'POST',
      credentials: 'include'
    });
    return response.json();
  },

  // Agent 创建
  async createAgentFromText(userId, text) {
    const response = await fetch(`${API_BASE}/create-agent-from-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, text })
    });
    return response.json();
  },

  async createAgentFromQA(userId, answers) {
    const response = await fetch(`${API_BASE}/create-agent-from-qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, answers })
    });
    return response.json();
  },

  async createAgentFromFile(userId, file, roomId = null) {
    const formData = new FormData();
    formData.append('file', file);
    if (userId) formData.append('user_id', userId);
    if (roomId) formData.append('room_id', roomId);

    const response = await fetch(`${API_BASE}/create-agent-from-file`, {
      method: 'POST',
      body: formData
    });
    return response.json();
  },

  async createUserAgent(userId, roomId = null) {
    // 生成唯一的role_code
    const roleCode = `user_${userId}_${Date.now()}`;
    const body = {
      user_id: userId,
      role_code: roleCode
    };
    if (roomId) body.room_id = roomId;

    const response = await fetch(`${API_BASE}/create-user-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  },

  // 恢复用户 agent 到沙盒（从已保存的数字孪生数据）
  async restoreUserAgent(roomId = null) {
    // role_code现在从服务器端的用户数字孪生数据中获取，无需传递
    const body = {};
    if (roomId) body.room_id = roomId;

    const response = await fetch(`${API_BASE}/restore-user-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    return response.json();
  },

  // 添加预设NPC到沙盒
  async addPresetNPC(presetId, customName = null, roomId = null) {
    const body = {
      preset_id: presetId,
      custom_name: customName
    };
    if (roomId) body.room_id = roomId;

    const response = await fetch(`${API_BASE}/add-preset-npc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  },

  // 检查房间是否存在
  async checkRoomExists(roomId) {
    const response = await fetch(`${API_BASE}/room-exists?room_id=${roomId}`, {
      credentials: 'include'
    });
    return response.json();
  },

  // 创建新房间
  async createRoom(roomId) {
    const response = await fetch(`${API_BASE}/create-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ room_id: roomId })
    });
    return response.json();
  },

  // 获取房间中的agents列表
  async getCharacters(roomId = null) {
    const url = roomId
      ? `${API_BASE}/characters?room_id=${roomId}`
      : `${API_BASE}/characters`;
    const response = await fetch(url, {
      credentials: 'include'
    });
    return response.json();
  },

  // 清空预设agents
  async clearPresetAgents(roomId = null) {
    const body = {};
    if (roomId) body.room_id = roomId;

    const response = await fetch(`${API_BASE}/clear-preset-agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // Added content-type for body
      credentials: 'include',
      body: JSON.stringify(body)
    });
    return response.json();
  },

  // 动态切换Agent沙盒状态
  async toggleAgentSandbox(roleCode, enabled, presetId, roomId = null) {
    const body = {
      role_code: roleCode,
      enabled: enabled,
      preset_id: presetId
    };
    if (roomId) body.room_id = roomId;

    const response = await fetch(`${API_BASE}/toggle-agent-sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  },

  // 开启1对1聊天
  async start1on1Chat(targetRoleCode, presetId, roomId = null) {
    const body = {
      target_role_code: targetRoleCode,
      preset_id: presetId
    };
    if (roomId) body.room_id = roomId;

    const response = await fetch(`${API_BASE}/start-1on1-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    return response.json();
  },

  // 重置沙盒
  // 重置沙盒
  async resetSandbox(roomId = null) {
    const body = {};
    if (roomId) body.room_id = roomId;

    const response = await fetch(`${API_BASE}/reset-sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // Added content-type
      credentials: 'include',
      body: JSON.stringify(body)
    });
    return response.json();
  },

  // Clear chat history
  async clearChatHistory(roomId = null) {
    const body = {};
    if (roomId) body.room_id = roomId;

    const response = await fetch(`${API_BASE}/clear-chat-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    return response.json();
  }
};

