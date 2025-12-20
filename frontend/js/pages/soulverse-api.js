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

};

// 为了兼容性，也创建一个api对象
api = {};

