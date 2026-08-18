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
        this.pendingRuntimeBackgroundScenes = new Set();
        this.currentSceneId = null;
        this.manualSceneId = null;
        this.runtimeMode = 'all';
        this.mode = 'runtime';
        this.isPlaying = typeof window.getIsPlaying === 'function' ? window.getIsPlaying() : false;
        this.requestedRuntimeScene = null;
        this.container = null;
        this.viewToggle = null;
        this.toggleButtons = [];
        this.lastRenderSignatures = null;
        this.lastPlaceholderKey = null;
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
                    const payload = message.data || {};
                    if (payload.status) {
                        this.updateAllStatus(payload.status, { origin: 'initial', fallbackCharacters: payload.characters });
                    } else if (payload.characters) {
                        this.updateCharacters(payload.characters);
                    }
                }

                if (message.type === 'scene_characters') {
                    this.updateCharacters(message.data, true);
                }

                if (message.type === 'status_update') {
                    const statusData = message.data?.status || message.data;
                    if (statusData) {
                        this.updateAllStatus(statusData, { origin: 'status_update' });
                    }
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
        const normalized = this.toSceneIdentifier(scene);
        if (normalized === null) return;
        const previousSceneId = this.currentSceneId;
        this.currentSceneId = normalized;
        if (source === 'runtime' || source === 'status-update' || source === 'status-initial') {
            if (this.mode === 'runtime') {
                if (this.runtimeMode === 'current' && previousSceneId !== this.currentSceneId) {
                    this.applyView();
                } else if (this.runtimeMode !== 'current' && previousSceneId !== this.currentSceneId) {
                    this.requestRuntimeSceneCharacters(true, true);
                }
            }
            return;
        }
        if (this.mode === 'runtime') {
            if (this.runtimeMode === 'current' && previousSceneId !== this.currentSceneId) {
                this.applyView();
            } else if (this.runtimeMode !== 'current' && previousSceneId !== this.currentSceneId) {
                this.requestRuntimeSceneCharacters(true, true);
            }
        }
    }

    handleRuntimeSceneChange(event) {
        const { scene } = event.detail || {};
        const normalized = this.toSceneIdentifier(scene);
        if (normalized === null) return;
        const previousSceneId = this.currentSceneId;
        this.currentSceneId = normalized;
        if (this.mode === 'runtime' && this.runtimeMode === 'current' && previousSceneId !== this.currentSceneId) {
            this.applyView();
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
                const previousSceneId = this.currentSceneId;
                this.currentSceneId = normalized;
                if (this.mode === 'runtime' && this.runtimeMode === 'current' && previousSceneId !== this.currentSceneId) {
                    this.applyView();
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
            this.applyView();
        }
    }

    setPendingSceneContext(context, sceneId, options = {}) {
        const { background = false } = options;
        this.pendingSceneContext = { type: context, sceneId, background };
        if (context === 'runtime') {
            this.requestedRuntimeScene = sceneId;
            if (background && sceneId !== null && sceneId !== undefined) {
                this.pendingRuntimeBackgroundScenes.add(String(sceneId));
            }
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

    requestRuntimeSceneCharacters(force = false, background = false) {
        if (this.currentSceneId === null || this.currentSceneId === undefined) {
            this.currentSceneCharacters = [];
            if (typeof window.requestSceneCharacters === 'function') {
                window.requestSceneCharacters(null, 'runtime');
            }
            return;
        }
        this.currentSceneId = this.toSceneIdentifier(this.currentSceneId);
        const sceneKey = this.currentSceneId !== null && this.currentSceneId !== undefined
            ? String(this.currentSceneId)
            : null;
        if (background && sceneKey !== null && !force && this.pendingRuntimeBackgroundScenes.has(sceneKey)) {
            return;
        }
        const pendingMatches = this.pendingSceneContext && this.pendingSceneContext.type === 'runtime' && String(this.pendingSceneContext.sceneId) === String(this.currentSceneId);
        if (!force && pendingMatches) {
            if (background && !this.pendingSceneContext.background) {
                // Upgrade to background without resending
                this.pendingSceneContext.background = true;
                if (this.currentSceneId !== null && this.currentSceneId !== undefined) {
                    this.pendingRuntimeBackgroundScenes.add(String(this.currentSceneId));
                }
            }
            return;
        }
        this.setPendingSceneContext('runtime', this.currentSceneId, { background });
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
            const changed = this.storeAllCharacters(charactersData);
            if (changed && this.mode !== 'manual') {
                this.applyView();
            } else if (!this.currentSceneCharacters.length && this.mode !== 'manual' && this.runtimeMode === 'current') {
                this.applyView();
            }
            return;
        }

        const context = this.pendingSceneContext?.type || 'runtime';
        const sceneId = this.pendingSceneContext?.sceneId ?? null;
        if (context === 'manual') {
            this.manualSceneId = sceneId;
            const normalized = this.normalizeCharacterList(charactersData);
            const hasChanged = !this.areCharacterListsEqual(this.manualSceneCharacters, normalized);
            this.manualSceneCharacters = normalized;
            this.pendingSceneContext = null;
            if (this.mode === 'manual' && hasChanged) {
                this.applyView();
            }
        } else {
            this.currentSceneId = sceneId !== null ? sceneId : this.currentSceneId;
            const normalized = this.normalizeCharacterList(charactersData);
            const hasChanged = !this.areCharacterListsEqual(this.currentSceneCharacters, normalized);
            this.currentSceneCharacters = normalized;
            this.requestedRuntimeScene = this.currentSceneId;
            if (sceneId !== null && sceneId !== undefined) {
                this.pendingRuntimeBackgroundScenes.delete(String(sceneId));
            }
            this.pendingSceneContext = null;
            if (hasChanged && this.mode === 'runtime' && this.runtimeMode === 'current') {
                this.applyView();
            }
        }
    }

    updateRuntimeSceneCharacters(charactersData) {
        this.currentSceneId = this.currentSceneId ?? null;
        const normalized = this.normalizeCharacterList(charactersData);
        const hasChanged = !this.areCharacterListsEqual(this.currentSceneCharacters, normalized);
        this.currentSceneCharacters = normalized;
        if (this.currentSceneId !== null && this.currentSceneId !== undefined) {
            this.pendingRuntimeBackgroundScenes.delete(String(this.currentSceneId));
        }
        if (hasChanged && this.mode === 'runtime' && this.runtimeMode === 'current') {
            this.applyView();
        }
    }

    renderCharacters(characters, options = {}) {
        if (!this.container) return;
        const list = Array.isArray(characters) ? characters : [];
        const placeholder = options.placeholder || this.t('noCharactersAvailable', '暂无角色信息');

        if (!list.length) {
            const placeholderKey = `empty:${placeholder}`;
            if (!this.displayCharacters.length && this.lastPlaceholderKey === placeholderKey) {
                return;
            }
            this.displayCharacters = [];
            this.characters = [];
            this.lastRenderSignatures = [];
            this.lastPlaceholderKey = placeholderKey;
            this.container.innerHTML = `<div class="profiles-empty">${placeholder}</div>`;
            return;
        }

        const signatures = list.map(character => this.characterSignature(character));
        if (Array.isArray(this.lastRenderSignatures)
            && signatures.length === this.lastRenderSignatures.length
            && signatures.every((sig, idx) => sig === this.lastRenderSignatures[idx])) {
            this.displayCharacters = list;
            this.characters = list;
            return;
        }

        this.displayCharacters = list;
        this.characters = list;
        this.lastRenderSignatures = signatures;
        this.lastPlaceholderKey = null;
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
            const isPendingRuntime = this.pendingSceneContext?.type === 'runtime' && this.pendingSceneContext.sceneId === this.currentSceneId;
            if (this.currentSceneCharacters && this.currentSceneCharacters.length) {
                this.renderCharacters(this.currentSceneCharacters);
                return;
            }
            if (this.currentSceneId !== null && this.currentSceneId !== undefined) {
                if (isPendingRuntime) {
                    if (this.pendingSceneContext.background) {
                        this.pendingSceneContext.background = false;
                        if (this.currentSceneId !== null && this.currentSceneId !== undefined) {
                            this.pendingRuntimeBackgroundScenes.delete(String(this.currentSceneId));
                        }
                    }
                } else {
                    this.requestRuntimeSceneCharacters();
                }
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

    updateAllStatus(statusData, { origin = 'status_update', fallbackCharacters = null } = {}) {
        if (!statusData) return;
        const charactersPayload = Array.isArray(statusData.characters)
            ? statusData.characters
            : Array.isArray(fallbackCharacters)
                ? fallbackCharacters
                : null;

        let dataChanged = false;
        if (charactersPayload) {
            dataChanged = this.storeAllCharacters(charactersPayload) || dataChanged;
        }

        const runtimeChanged = this.syncRuntimeCharactersFromStatus(statusData);
        dataChanged = dataChanged || runtimeChanged;

        if (this.mode === 'manual') {
            if (dataChanged && this.pendingSceneContext?.type !== 'manual') {
                this.applyView();
            }
            return;
        }

        if (this.runtimeMode === 'current') {
            if (runtimeChanged || (dataChanged && !this.currentSceneCharacters.length)) {
                this.applyView();
            }
            return;
        }

        if (dataChanged) {
            this.applyView();
        }

        if (this.mode === 'runtime' && this.runtimeMode !== 'current') {
            if (this.currentSceneId !== null && this.currentSceneId !== undefined && !this.currentSceneCharacters.length) {
                this.requestRuntimeSceneCharacters(false, true);
            }
        }
    }

    storeAllCharacters(charactersData) {
        const normalized = this.normalizeCharacterList(charactersData);
        const hasChanged = !this.areCharacterListsEqual(this.allCharacters, normalized);
        this.allCharacters = normalized;
        return hasChanged;
    }

    normalizeCharacterList(charactersData) {
        if (!Array.isArray(charactersData)) return [];
        return charactersData.map((character, index) => this.normalizeCharacterPayload(character, index));
    }

    normalizeCharacterPayload(character, fallbackIndex = 0) {
        if (!character || typeof character !== 'object') {
            return {
                id: `unknown-${fallbackIndex}`,
                name: 'Undefined',
                nickname: 'Undefined',
                description: '',
                goal: '',
                state: '',
                location: ''
            };
        }
        const normalized = { ...character };
        if (normalized.id === undefined || normalized.id === null) {
            const identifier = normalized.character_id ?? normalized.code ?? normalized.role_code ?? normalized.name ?? normalized.nickname;
            normalized.id = identifier !== undefined ? identifier : `char-${fallbackIndex}`;
        }
        if (normalized.name === undefined && normalized.nickname !== undefined) {
            normalized.name = normalized.nickname;
        }
        normalized.description = normalized.description ?? normalized.brief ?? '';
        normalized.goal = normalized.goal ?? normalized.motivation ?? '';
        normalized.state = normalized.state ?? normalized.status ?? '';
        normalized.location = normalized.location ?? '';
        return normalized;
    }

    syncRuntimeCharactersFromStatus(statusData) {
        const sceneCharacters = Array.isArray(statusData.scene_characters)
            ? statusData.scene_characters
            : null;

        if (sceneCharacters && sceneCharacters.length) {
            return this.replaceRuntimeCharacters(sceneCharacters);
        }

        const groupList = Array.isArray(statusData.group) ? statusData.group : [];
        if (!groupList.length) {
            if (this.currentSceneCharacters.length) {
                this.currentSceneCharacters = [];
                return true;
            }
            return false;
        }

        const identifiers = new Set(
            groupList
                .map(value => this.normalizeIdentifier(value))
                .filter(Boolean)
        );

        const sourceCharacters = this.allCharacters.length
            ? this.allCharacters
            : this.normalizeCharacterList(statusData.characters || []);

        const matched = [];
        const usedIndices = new Set();

        groupList.forEach((rawIdentifier, index) => {
            const normalizedIdentifier = this.normalizeIdentifier(rawIdentifier);
            if (!normalizedIdentifier) {
                matched.push(this.createStubCharacter(rawIdentifier, index));
                return;
            }

            const characterIndex = sourceCharacters.findIndex((character, candidateIdx) => {
                if (usedIndices.has(candidateIdx)) return false;
                const candidateIds = this.extractIdentifiers(character);
                return candidateIds.some(id => id === normalizedIdentifier);
            });

            if (characterIndex !== -1) {
                const character = sourceCharacters[characterIndex];
                matched.push(character);
                usedIndices.add(characterIndex);
            } else {
                matched.push(this.createStubCharacter(normalizedIdentifier, index));
            }
        });

        return this.replaceRuntimeCharacters(matched);
    }

    replaceRuntimeCharacters(charactersData) {
        const normalized = this.normalizeCharacterList(charactersData);
        const hasChanged = !this.areCharacterListsEqual(this.currentSceneCharacters, normalized);
        if (hasChanged) {
            this.currentSceneCharacters = normalized;
        }
        if (this.currentSceneId !== null && this.currentSceneId !== undefined) {
            this.pendingRuntimeBackgroundScenes.delete(String(this.currentSceneId));
        }
        return hasChanged;
    }

    normalizeIdentifier(value) {
        if (value === undefined || value === null) return '';
        return String(value).trim();
    }

    createStubCharacter(identifier, index = 0) {
        const safeId = identifier || `stub-${index}`;
        const displayName = identifier || this.t('unknownCharacter', '未知角色');
        return {
            id: safeId,
            character_id: safeId,
            code: safeId,
            role_code: safeId,
            name: displayName,
            nickname: displayName,
            description: '',
            goal: '',
            state: '',
            location: ''
        };
    }

    extractIdentifiers(character) {
        if (!character || typeof character !== 'object') return [];
        return [
            character.id,
            character.character_id,
            character.code,
            character.role_code,
            character.name,
            character.nickname
        ].map(value => this.normalizeIdentifier(value)).filter(Boolean);
    }

    characterSignature(character) {
        if (!character || typeof character !== 'object') return '';
        return [
            character.id,
            character.character_id,
            character.code,
            character.role_code,
            character.name,
            character.nickname,
            character.location,
            character.goal,
            character.state,
            character.description
        ].map(value => (value === undefined || value === null) ? '' : String(value)).join('|');
    }

    areCharacterListsEqual(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i += 1) {
            if (this.characterSignature(a[i]) !== this.characterSignature(b[i])) {
                return false;
            }
        }
        return true;
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
