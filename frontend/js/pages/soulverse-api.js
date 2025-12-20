// ScrollWeaver API适配器
const API_BASE = '/api';
const token = localStorage.getItem('token');

// 为了兼容性，也创建一个api对象（在scrollWeaverAPI定义后）
let api;

const scrollWeaverAPI = {
  // 生成数字孪生画像
  async generateDigitalTwinProfile(data) {
    const response = await fetch(`${API_BASE}/generate-digital-twin-profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: '生成失败' }));
      throw new Error(errorData.detail || `API调用失败: ${response.status}`);
    }

    return response.json();
  },

  // 保存人格模型
  async savePersonaModel(profile) {
    const response = await fetch(`${API_BASE}/user/persona-model`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: `数字孪生-${profile.core_traits.mbti}-${Date.now()}`,
        profile: profile
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: '保存失败' }));
      throw new Error(errorData.detail || `保存失败: ${response.status}`);
    }

    return response.json();
  },

  // 获取当前用户
  async getCurrentUser() {
    try {
      const response = await fetch(`${API_BASE}/user/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        return { success: false, user: null };
      }
      return response.json();
    } catch (error) {
      console.error('getCurrentUser error:', error);
      return { success: false, user: null };
    }
  },

  // ===== Self-Identity API =====

  // 获取身份建议
  async suggestIdentity(scrollId, mbti, bigFive) {
    const response = await fetch(`${API_BASE}/self-identity/suggest-identity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        scroll_id: scrollId,
        mbti: mbti,
        big_five: bigFive
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: '获取身份建议失败' }));
      throw new Error(errorData.detail || `API调用失败: ${response.status}`);
    }

    return response.json();
  },

  // 获取目标建议
  async suggestGoal(scrollId, mbti, bigFive, identity) {
    const response = await fetch(`${API_BASE}/self-identity/suggest-goal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        scroll_id: scrollId,
        mbti: mbti,
        big_five: bigFive,
        identity: identity
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: '获取目标建议失败' }));
      throw new Error(errorData.detail || `API调用失败: ${response.status}`);
    }

    return response.json();
  },

  // 创建用户Agent
  async createUserAgent(scrollId, mbti, bigFive, identity, goal, nickname) {
    const response = await fetch(`${API_BASE}/self-identity/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        scroll_id: scrollId,
        mbti: mbti,
        big_five: bigFive,
        identity: identity,
        goal: goal,
        nickname: nickname
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: '创建用户Agent失败' }));
      throw new Error(errorData.detail || `API调用失败: ${response.status}`);
    }

    return response.json();
  },

};

// 为了兼容性，也创建一个api对象
api = {};

