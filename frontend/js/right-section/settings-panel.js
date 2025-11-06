// settings-panel.js
class SettingsPanel {
    constructor() {
        this.defaultSettings = [
            {
                term: "示例设定",
                nature: "示例性质",
                detail: "这是一个示例设定说明。"
            }
        ]
        this.settings = this.defaultSettings;
        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            const container = document.querySelector('.settings-container');
            if (!container) {
                console.error('Profile Data not Found');
                return;
            }
            
            // 先渲染默认数据
            this.updateSettings(this.defaultSettings);

            // WebSocket消息处理
            window.addEventListener('websocket-message', (event) => {
                const message = event.detail;
                if (message.type === 'initial_data' && message.data.settings) {
                    this.updateSettings(message.data.settings);
                }
            });
        });
    }

    updateSettings(settings) {
        const container = document.querySelector('.settings-container');
        if (container) {
            container.innerHTML = settings.map(setting => `
                <div class="setting-item">
                    <div class="setting-term">${setting.term}</div>
                    <div class="setting-nature">${setting.nature}</div>
                    <div class="setting-detail">${setting.detail}</div>
                </div>
            `).join('');
        }
    }
}
const settingsPanel = new SettingsPanel();