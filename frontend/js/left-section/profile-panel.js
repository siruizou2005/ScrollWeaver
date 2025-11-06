// profile-script.js
class CharacterProfiles {
    constructor() {
        this.defaultCharacters = [
            {
                id: 1,
                name: 'Undefined',
                icon: './frontend/assets/images/default-icon.jpg',
                description: 'Undefined'
            }
        ];
        this.characters = this.defaultCharacters;
        this.allCharacters = []; // 存储所有角色信息
        this.init();
    }
    init() {
        document.addEventListener('DOMContentLoaded', () => {
            const container = document.querySelector('.profiles-container');
            if (!container) {
                console.error('找不到角色档案容器元素');
                return;
            }
            
            // 先渲染默认数据
            this.updateCharacters(this.defaultCharacters);

            // WebSocket消息处理
            window.addEventListener('websocket-message', (event) => {
                const message = event.detail;
                if (message.type === 'initial_data' && message.data.characters) {
                    this.updateCharacters(message.data.characters);
                }

                if (message.type === 'scene_characters') {
                    // 处理服务器返回的场景角色数据
                    this.updateCharacters(message.data, true);
                }

                if (message.type === 'status_update' && message.data.characters) {
                    this.updateCharacters(message.data.characters);
                }

                window.addEventListener('websocket-message', (event) => {
            const message = event.detail;
            
            if (message.type === 'status_update') {
                this.updateAllStatus(message.data);
            }
            
            if (message.type === 'initial_data' && message.data.status) {
                this.updateAllStatus(message.data.status);
            }
        });
            });

            // 绑定点击事件
            container.addEventListener('click', (e) => this.handleCardClick(e));
        });
    }
    createCharacterCard(character) {
        const maxLength = 20; // 设置折叠时显示的最大字符数
        const needsExpand = character.description.length > maxLength;
        const shortDesc = needsExpand ? character.description.substring(0, maxLength) + '...' : character.description;
        
        return `
            <div class="character-card" data-id="${character.id}">
                <div class="character-icon">
                    <img src="${character.icon}" alt="${character.name}">
                </div>
                <div class="character-info">
                    <div class="character-name">${character.name}</div>
                    <div class="character-description">
                        <span class="short-desc">${shortDesc}</span>
                        ${needsExpand ? `
                            <span class="full-desc" style="display: none;">${character.description}</span>
                            <span class="expand-btn">展开</span>
                        ` : ''}
                    </div>
                    <div class="character-details">
                        <div class="character-location">📍 ${character.location || 'Empty'}</div>
                        <div class="character-goal">🎯 ${character.goal || 'Empty'}</div>
                        <div class="character-state">⚡ ${character.state || 'Empty'}</div>
                    </div>
                </div>
            </div>
        `;
    }

    handleCardClick(e) {
        // 处理展开/收起按钮点击
        if (e.target.classList.contains('expand-btn')) {
            const descContainer = e.target.closest('.character-description');
            const shortDesc = descContainer.querySelector('.short-desc');
            const fullDesc = descContainer.querySelector('.full-desc');
            const expandBtn = descContainer.querySelector('.expand-btn');

            if (shortDesc.style.display !== 'none') {
                shortDesc.style.display = 'none';
                fullDesc.style.display = 'inline';
                expandBtn.textContent = '收起';
            } else {
                shortDesc.style.display = 'inline';
                fullDesc.style.display = 'none';
                expandBtn.textContent = '展开';
            }
            return; // 防止触发卡片的其他点击事件
        }

        // 原有的卡片点击处理逻辑
        const card = e.target.closest('.character-card');
        if (card) {
            const characterId = card.dataset.id;
            const character = this.characters.find(c => c.id === parseInt(characterId));
            if (character) {
                this.showCharacterDetails(character);
            }
        }
    }
    updateCharacters(charactersData, scene = false) {
        if (scene) {
            if (charactersData) {
                this.renderCharacters(charactersData);
            }
            else{
                this.renderCharacters(this.allCharacters);
            }
        }
        else {
            this.characters = charactersData;
            this.allCharacters = [...charactersData];
            this.renderCharacters(this.characters);
        }

    }
    renderCharacters(characters) {
        const container = document.querySelector('.profiles-container');
        if (container) {
            container.innerHTML = '';
            characters.forEach(character => {
                container.innerHTML += this.createCharacterCard(character);
            });
        }
    }


    
}
const characterProfiles = new CharacterProfiles();
