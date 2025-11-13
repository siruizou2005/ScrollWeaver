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
        this.allCharacters = [];
        this.displayCharacters = [];
        this.currentSceneCharacters = [];
        this.manualSceneCharacters = [];
        this.pendingSceneContext = null;
        this.currentSceneId = null;
        this.manualSceneId = null;
        this.runtimeMode = 'all';
        this.mode = 'runtime';
        this.currentGroupMembers = [];
        this.lastRenderSignature = null;
        this.isPlaying = typeof window.getIsPlaying === 'function' ? window.getIsPlaying() : false;
        this.requestedRuntimeScene = null;
        this.container = null;
        this.viewToggle = null;
        this.toggleButtons = [];
        this.init();
    }

    t(key, fallback) {
        if (window.i18n && typeof window.i18n.get === 'function') {
            const value = window.i18n.get(key);
            if (value && value !== key) {
                return value;
            }
        }
        return fallback;
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.container = document.querySelector('.profiles-container');
            if (!this.container) {
                console.error('找不到角色档案容器元素');
                return;
            }

            this.viewToggle = document.getElementById('profilesViewToggle');
            if (this.viewToggle) {
                this.initToggleButtons();
            }

            this.updateCharacters(this.defaultCharacters);

            window.addEventListener('websocket-message', (event) => {
                const message = event.detail;
                if (!message) return;

                if (message.type === 'initial_data') {
                const statusData = message.data;
                if (statusData.characters) this.updateCharacters(statusData.characters);
                if (statusData.scene_characters) this.updateRuntimeSceneCharacters(statusData.scene_characters);
                this.updateAllStatus(statusData);
                }

                if (message.type === 'scene_characters') {
                    this.updateCharacters(message.data, true);
                }

                if (message.type === 'status_update') {
                const statusData = message.data.status || message.data;
                if (statusData.characters) this.updateCharacters(statusData.characters);
                if (statusData.scene_characters) this.updateRuntimeSceneCharacters(statusData.scene_characters);
                this.updateAllStatus(statusData);
                }
            });

        window.addEventListener('scene-update', (event) => this.handleSceneUpdate(event));
        window.addEventListener('scene-runtime-changed', (event) => this.handleRuntimeSceneChange(event));
            window.addEventListener('scene-view-state-change', (event) => this.handleSceneViewStateChange(event));
            window.addEventListener('simulation-state-change', (event) => this.handleSimulationStateChange(event));
            window.addEventListener('language-changed', () => this.updateToggleUI());
            window.addEventListener('status-sync', (event) => this.handleStatusSync(event.detail?.status, event.detail?.origin));

            this.container.addEventListener('click', (e) => this.handleCardClick(e));
        });
    }

    initToggleButtons() {
        this.toggleButtons = Array.from(this.viewToggle.querySelectorAll('button[data-mode]'));
        this.toggleButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const modeKey = button.getAttribute('data-mode');
                if (!modeKey || this.mode === 'manual') return;
                this.handleToggleChange(modeKey);
            });
        });
        this.updateToggleUI();
    }

    handleToggleChange(modeKey) {
        const runtimeMode = modeKey === 'runtime_all' ? 'all' : 'current';
        if (this.runtimeMode === runtimeMode) return;
        this.runtimeMode = runtimeMode;
        this.updateToggleUI();
        if (this.runtimeMode === 'current') {
            this.requestRuntimeSceneCharacters();
        }
        this.applyView();
        window.dispatchEvent(new CustomEvent('character-view-mode-change', {
            detail: { mode: this.runtimeMode }
        }));
    }

    updateToggleUI() {
        if (!this.toggleButtons || !this.toggleButtons.length) return;
        this.toggleButtons.forEach(button => {
            const modeKey = button.getAttribute('data-mode');
            const runtimeMode = modeKey === 'runtime_all' ? 'all' : 'current';
            button.classList.toggle('active', this.runtimeMode === runtimeMode);
            const disabled = this.mode === 'manual';
            button.disabled = disabled;
            button.classList.toggle('disabled', disabled);
        });
        if (this.viewToggle) {
            this.viewToggle.classList.toggle('manual-mode', this.mode === 'manual');
        }
    }

    handleSceneUpdate(event) {
        const { scene, source } = event.detail || {};
        if (scene === undefined) return;
        if (source === 'runtime') {
            this.currentSceneId = this.toSceneIdentifier(scene);
            if (this.mode === 'runtime' && this.runtimeMode === 'current') {
                this.requestRuntimeSceneCharacters();
            }
        }
    }

    handleRuntimeSceneChange(event) {
        const { scene } = event.detail || {};
        const normalized = this.toSceneIdentifier(scene);
        if (normalized === null) return;
        this.currentSceneId = normalized;
        if (this.mode === 'runtime' && this.runtimeMode === 'current') {
            this.requestRuntimeSceneCharacters(true);
        }
    }

    handleSceneViewStateChange(event) {
        const { mode, scene, origin } = event.detail || {};
        if (!mode) return;
        if (mode === 'manual') {
            this.mode = 'manual';
            this.manualSceneId = scene !== undefined ? scene : this.manualSceneId;
            this.updateToggleUI();
            if (this.pendingSceneContext?.type !== 'manual') {
                this.applyView();
            } else {
                this.renderCharacters([], { placeholder: this.t('loadingSelectedScene', '正在加载选定幕的角色...') });
            }
        } else if (mode === 'runtime') {
            this.mode = 'runtime';
            this.manualSceneId = null;
            this.manualSceneCharacters = [];
            this.updateToggleUI();
            if (this.runtimeMode === 'current' && origin === 'runtime') {
                this.requestRuntimeSceneCharacters();
            }
            this.applyView();
        }
    }

    handleStatusSync(statusData) {
        if (!statusData) return;
        if (statusData.current_scene !== undefined && statusData.current_scene !== null) {
            const normalized = this.toSceneIdentifier(statusData.current_scene);
            if (normalized !== null) {
                this.currentSceneId = normalized;
                if (this.mode === 'runtime' && this.runtimeMode === 'current') {
                    this.requestRuntimeSceneCharacters(true);
                }
            }
        }
    }

    handleSimulationStateChange(event) {
        const { playing } = event.detail || {};
        this.isPlaying = Boolean(playing);
        if (this.isPlaying && this.mode !== 'runtime') {
            this.mode = 'runtime';
            this.manualSceneId = null;
            this.manualSceneCharacters = [];
            this.updateToggleUI();
            if (this.runtimeMode === 'current') {
                this.requestRuntimeSceneCharacters();
            }
            this.applyView();
        }
    }

    setPendingSceneContext(context, sceneId) {
        this.pendingSceneContext = { type: context, sceneId };
        if (context === 'runtime') {
            this.requestedRuntimeScene = sceneId;
        }
    }

    toSceneIdentifier(sceneValue) {
        if (sceneValue === undefined || sceneValue === null || sceneValue === '') {
            return null;
        }
        const numeric = Number(sceneValue);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
        return sceneValue;
    }

    requestRuntimeSceneCharacters(force = false) {
        if (this.currentSceneId === null || this.currentSceneId === undefined) {
            this.currentSceneCharacters = [];
            if (typeof window.requestSceneCharacters === 'function') {
                window.requestSceneCharacters(null, 'runtime');
            }
            return;
        }
        this.currentSceneId = this.toSceneIdentifier(this.currentSceneId);
        if (!force && this.pendingSceneContext && this.pendingSceneContext.type === 'runtime' && String(this.pendingSceneContext.sceneId) === String(this.currentSceneId)) {
            return;
        }
        this.setPendingSceneContext('runtime', this.currentSceneId);
        if (typeof window.requestSceneCharacters === 'function') {
            window.requestSceneCharacters(this.currentSceneId, 'runtime');
        }
    }

    createCharacterCard(character) {
        const description = character.description || character.brief || '';
        const maxLength = 20;
        const needsExpand = description.length > maxLength;
        const shortDesc = needsExpand ? description.substring(0, maxLength) + '...' : description;
        const name = character.name || character.nickname || character.id || 'Undefined';
        const identifier = character.id ?? character.name ?? character.nickname ?? name;
        const location = character.location || 'Empty';
        const goal = character.goal || 'Empty';
        const state = character.state || character.status || 'Empty';

        return `
            <div class="character-card" data-id="${identifier}">
                <div class="character-info">
                    <div class="character-name">${name}</div>
                    <div class="character-description">
                        <span class="short-desc">${shortDesc}</span>
                        ${needsExpand ? `
                            <span class="full-desc" style="display: none;">${description}</span>
                            <span class="expand-btn">${this.t('expand', '展开')}</span>
                        ` : ''}
                    </div>
                    <div class="character-details">
                        <div class="character-location">📍 ${location}</div>
                        <div class="character-goal">🎯 ${goal}</div>
                        <div class="character-state">⚡ ${state}</div>
                    </div>
                </div>
            </div>
        `;
    }

    handleCardClick(e) {
        if (e.target.classList.contains('expand-btn')) {
            const descContainer = e.target.closest('.character-description');
            const shortDesc = descContainer.querySelector('.short-desc');
            const fullDesc = descContainer.querySelector('.full-desc');
            const expandBtn = descContainer.querySelector('.expand-btn');

            if (shortDesc.style.display !== 'none') {
                shortDesc.style.display = 'none';
                if (fullDesc) fullDesc.style.display = 'block';
                expandBtn.textContent = this.t('collapse', '收起');
                descContainer.classList.add('expanded');
            } else {
                shortDesc.style.display = 'block';
                if (fullDesc) fullDesc.style.display = 'none';
                expandBtn.textContent = this.t('expand', '展开');
                descContainer.classList.remove('expanded');
            }
            return;
        }

        const card = e.target.closest('.character-card');
        if (!card) return;
        const identifier = card.dataset.id;
        const character = (this.displayCharacters || []).find(c =>
            String(c.id) === String(identifier) ||
            String(c.name) === String(identifier) ||
            String(c.nickname) === String(identifier)
        );
        if (character) {
            this.showCharacterDetails(character);
        }
    }

    updateCharacters(charactersData, scene = false) {
        if (!scene) {
            this.allCharacters = Array.isArray(charactersData) ? [...charactersData] : [];
            if (this.mode !== 'manual') {
                this.applyView();
            }
            return;
        }

        const context = this.pendingSceneContext?.type || 'runtime';
        const sceneId = this.pendingSceneContext?.sceneId ?? null;
        if (context === 'manual') {
            this.manualSceneId = sceneId;
            this.manualSceneCharacters = Array.isArray(charactersData) ? charactersData : [];
            this.pendingSceneContext = null;
            if (this.mode === 'manual') {
                this.applyView();
            }
        } else {
            this.currentSceneId = sceneId !== null ? sceneId : this.currentSceneId;
            this.currentSceneCharacters = Array.isArray(charactersData) ? charactersData : [];
            this.requestedRuntimeScene = this.currentSceneId;
            this.pendingSceneContext = null;
            if (this.mode === 'runtime' && this.runtimeMode === 'current') {
                this.applyView();
            }
        }
    }

    updateRuntimeSceneCharacters(charactersData) {
        this.currentSceneId = this.currentSceneId ?? null;
        this.currentSceneCharacters = Array.isArray(charactersData) ? charactersData : [];
        if (this.mode === 'runtime' && this.runtimeMode === 'current') {
            this.applyView();
        }
    }

    renderCharacters(characters, options = {}) {
        if (!this.container) return;
        const list = Array.isArray(characters) ? characters : [];
        const placeholderKey = options.placeholder ? String(options.placeholder) : '';
        const signature = JSON.stringify(list.map(character => ({
            id: character?.id ?? character?.name ?? character?.nickname ?? '',
            state: character?.state ?? character?.status ?? '',
            location: character?.location ?? '',
            goal: character?.goal ?? '',
            description: character?.description ?? character?.brief ?? ''
        }))) + `|${placeholderKey}`;
        if (signature === this.lastRenderSignature) {
            return;
        }
        this.lastRenderSignature = signature;
        this.displayCharacters = list;
        this.characters = list;
        if (!list.length) {
            const placeholder = options.placeholder || this.t('noCharactersAvailable', '暂无角色信息');
            this.container.innerHTML = `<div class="profiles-empty">${placeholder}</div>`;
            return;
        }
        this.container.innerHTML = list.map(character => this.createCharacterCard(character)).join('');
    }

    applyView() {
        if (!this.container) return;

        if (this.mode === 'manual') {
            if (this.pendingSceneContext?.type === 'manual') {
                this.renderCharacters([], { placeholder: this.t('loadingSelectedScene', '正在加载选定幕的角色...') });
                return;
            }
            if (this.manualSceneCharacters && this.manualSceneCharacters.length) {
                this.renderCharacters(this.manualSceneCharacters);
                return;
            }
            if (this.manualSceneId !== null && this.manualSceneId !== undefined) {
                this.renderCharacters([], { placeholder: this.t('noSceneCharacters', '该幕暂无角色信息') });
                return;
            }
            this.renderCharacters(this.allCharacters);
            return;
        }

        if (this.runtimeMode === 'current') {
            if (this.pendingSceneContext?.type === 'runtime' && this.pendingSceneContext.sceneId === this.currentSceneId) {
                this.renderCharacters([], { placeholder: this.t('loadingCurrentScene', '正在加载当前幕的角色...') });
                return;
            }
            const groupCharacters = this.getCurrentGroupCharacters();
            if (groupCharacters && groupCharacters.length) {
                this.renderCharacters(groupCharacters);
                return;
            }
            if (this.currentSceneCharacters && this.currentSceneCharacters.length) {
                this.renderCharacters(this.currentSceneCharacters);
                return;
            }
            if (this.currentSceneId !== null && this.currentSceneId !== undefined) {
                this.requestRuntimeSceneCharacters();
                this.renderCharacters([], { placeholder: this.t('loadingCurrentScene', '正在加载当前幕的角色...') });
                return;
            }
        }

        if (this.allCharacters && this.allCharacters.length) {
            this.renderCharacters(this.allCharacters);
        } else {
            this.renderCharacters([], { placeholder: this.t('noCharactersAvailable', '暂无角色信息') });
        }
    }

    findCharacterByIdentifier(identifier) {
        if (!identifier && identifier !== 0) return null;
        const normalized = String(identifier).trim();
        if (!normalized) return null;
        const collections = [
            this.currentSceneCharacters,
            this.manualSceneCharacters,
            this.allCharacters,
            this.displayCharacters,
            this.defaultCharacters
        ];
        for (const list of collections) {
            if (!Array.isArray(list)) continue;
            for (const character of list) {
                if (!character) continue;
                const candidates = [
                    character.id,
                    character.character_id,
                    character.name,
                    character.nickname,
                    character.title
                ].map(val => (val !== undefined && val !== null) ? String(val).trim() : null).filter(Boolean);
                if (candidates.includes(normalized)) {
                    return character;
                }
            }
        }
        return null;
    }

    getCurrentGroupCharacters() {
        if (!Array.isArray(this.currentGroupMembers) || !this.currentGroupMembers.length) return null;
        const result = [];
        const seen = new Set();
        this.currentGroupMembers.forEach(member => {
            if (!member) return;
            const normalized = String(member).trim();
            if (!normalized || seen.has(normalized)) return;
            const character = this.findCharacterByIdentifier(normalized);
            if (character) {
                result.push(character);
                seen.add(normalized);
            }
        });
        return result.length ? result : null;
    }

    updateAllStatus(statusData) {
        if (!statusData) return;
        const statusList = Array.isArray(statusData)
            ? statusData
            : Object.keys(statusData).map(key => ({ key, ...statusData[key] }));

        const applyUpdates = (list) => {
            if (!Array.isArray(list)) return;
            list.forEach(item => {
                if (!item) return;
                const candidates = [
                    item.id,
                    item.name,
                    item.nickname
                ].map(val => (val !== undefined && val !== null) ? String(val) : null).filter(Boolean);

                for (const key of candidates) {
                    const update = statusList.find(s => {
                        const identifiers = [
                            s.id,
                            s.character_id,
                            s.name,
                            s.nickname,
                            s.key
                        ].map(val => (val !== undefined && val !== null) ? String(val) : null).filter(Boolean);
                        return identifiers.includes(key);
                    });
                    if (update) {
                        if (update.state) item.state = update.state;
                        if (update.status) item.state = update.status;
                        if (update.location) item.location = update.location;
                        if (update.goal) item.goal = update.goal;
                        break;
                    }
                }
            });
        };

        applyUpdates(this.allCharacters);
        applyUpdates(this.currentSceneCharacters);
        applyUpdates(this.manualSceneCharacters);
        applyUpdates(this.displayCharacters);

        this.currentGroupMembers = Array.isArray(statusData.group)
            ? statusData.group.map(member => (member !== undefined && member !== null) ? String(member).trim() : null).filter(Boolean)
            : [];

        this.applyView();
    }

    showCharacterDetails(character) {
        const modal = document.getElementById('profile-modal');
        if (!modal) return;
        const nameEl = modal.querySelector('.modal-name');
        const descEl = modal.querySelector('.modal-description');
        const locEl = modal.querySelector('.modal-location');
        const goalEl = modal.querySelector('.modal-goal');
        const stateEl = modal.querySelector('.modal-state');

        nameEl.textContent = character.name || character.nickname || character.id || 'Unknown';
        descEl.textContent = character.description || character.brief || '';
        locEl.textContent = character.location || '—';
        goalEl.textContent = character.goal || '—';
        stateEl.textContent = character.state || character.status || '—';

        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        const closeBtn = modal.querySelector('.modal-close');
        const overlay = modal.querySelector('.modal-overlay');
        function close() {
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
            closeBtn.removeEventListener('click', close);
            overlay.removeEventListener('click', close);
            document.removeEventListener('keydown', onKeyDown);
        }
        function onKeyDown(e) { if (e.key === 'Escape') close(); }
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', close);
        document.addEventListener('keydown', onKeyDown);
    }
}
const characterProfiles = new CharacterProfiles();
window.characterProfiles = characterProfiles;
