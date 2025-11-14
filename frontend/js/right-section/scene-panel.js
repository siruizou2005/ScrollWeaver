class ScenesPanel {
    constructor() {
        this.scenes = new Set();
        this.currentScene = null;
        this.runtimeScene = null;
        this.manualMode = false;
        this.lastBlockedNotice = 0;
        this.container = document.querySelector('.scene-buttons');
        this.clearBtn = document.querySelector('.clear-selection-btn');
        this.isPlaying = typeof window.getIsPlaying === 'function' ? window.getIsPlaying() : false;
        this.init();
    }

    init() {
        this.initEventListeners();
        window.addEventListener('scene-update', (event) => this.handleSceneUpdate(event));
        window.addEventListener('websocket-message', (event) => this.handleWebsocketMessage(event));
        window.addEventListener('simulation-state-change', (event) => this.handleSimulationStateChange(event));
        window.addEventListener('language-changed', () => this.renderSceneButtons());
        window.addEventListener('status-sync', (event) => this.syncFromStatus(event.detail?.status, event.detail?.origin));
        this.updateButtonsInteractivity();
        if (window.__lastStatusData) {
            this.syncFromStatus(window.__lastStatusData, 'cached');
        }
    }

    initEventListeners() {
        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => {
                this.clearSelection({ origin: this.isPlaying ? 'runtime' : 'manual-clear' });
            });
        }
    }

    normalizeScene(sceneValue) {
        if (sceneValue === undefined || sceneValue === null || sceneValue === '') {
            return null;
        }
        const numeric = Number(sceneValue);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
        return sceneValue;
    }

    syncFromStatus(statusData) {
        if (!statusData) return;
        const scenesArray = Array.isArray(statusData.available_scenes) ? statusData.available_scenes : null;
        if (scenesArray) {
            const normalizedScenes = scenesArray
                .map(value => this.normalizeScene(value))
                .filter(value => value !== null);
            const existingScenes = Array.from(this.scenes);
            const hasChange = normalizedScenes.length !== existingScenes.length ||
                normalizedScenes.some(scene => !this.scenes.has(scene));
            if (hasChange) {
                this.scenes = new Set(normalizedScenes);
                this.renderSceneButtons();
            } else {
                this.applyRuntimeHighlight();
            }
        }
        if (statusData.current_scene !== undefined && statusData.current_scene !== null) {
            const runtimeScene = this.normalizeScene(statusData.current_scene);
            if (runtimeScene !== null) {
                this.runtimeScene = runtimeScene;
                if (!this.manualMode) {
                    this.applyRuntimeHighlight();
                }
            }
        }
    }

    handleSceneUpdate(event) {
        const detail = event.detail || {};
        const sceneNumber = this.normalizeScene(detail.scene);
        if (sceneNumber !== null) {
            this.addScene(sceneNumber);
            if (detail.source !== 'manual') {
                const previousScene = this.runtimeScene;
                this.runtimeScene = sceneNumber;
                if (!this.manualMode) {
                    if (previousScene !== this.runtimeScene) {
                        window.dispatchEvent(new CustomEvent('scene-runtime-changed', {
                            detail: {
                                scene: this.runtimeScene,
                                origin: detail.source || 'runtime'
                            }
                        }));
                    }
                    this.applyRuntimeHighlight();
                }
            }
        }
    }

    handleWebsocketMessage(event) {
        const message = event.detail;
        if (!message) return;
        if (message.type === 'initial_data' && message.data?.history_messages) {
            message.data.history_messages.forEach(msg => this.addScene(msg.scene));
        }
        if (message.type === 'message' && message.data?.scene !== undefined) {
            this.addScene(message.data.scene);
        }
        if (message.type === 'initial_data' && message.data?.status) {
            this.syncFromStatus(message.data.status);
        }
        if (message.type === 'status_update' && message.data) {
            this.syncFromStatus(message.data);
        }
    }

    handleSimulationStateChange(event) {
        const detail = event.detail || {};
        const nextPlaying = Boolean(detail.playing);
        if (this.isPlaying === nextPlaying) {
            return;
        }
        this.isPlaying = nextPlaying;
        this.updateButtonsInteractivity();
        if (this.isPlaying) {
            this.exitManualMode({ origin: 'runtime' });
        }

        window.dispatchEvent(new CustomEvent('scene-runtime-changed', {
            detail: {
                scene: this.runtimeScene,
                origin: 'simulation-state'
            }
        }));
    }

    addScene(sceneNumber) {
        const normalizedScene = this.normalizeScene(sceneNumber);
        if (normalizedScene === null) return;
        if (!this.scenes.has(normalizedScene)) {
            this.scenes.add(normalizedScene);
            this.renderSceneButtons();
        } else {
            this.applyRuntimeHighlight();
        }
    }

    renderSceneButtons() {
        if (!this.container) return;
        this.container.innerHTML = '';
        const labelPrefix = (window.i18n?.currentLang === 'zh') ? '场景' : 'Scene';
        const sortedScenes = Array.from(this.scenes).sort((a, b) => {
            const aNum = Number(a);
            const bNum = Number(b);
            const aIsNum = Number.isFinite(aNum);
            const bIsNum = Number.isFinite(bNum);
            if (aIsNum && bIsNum) return aNum - bNum;
            if (aIsNum) return -1;
            if (bIsNum) return 1;
            return String(a).localeCompare(String(b));
        });
        sortedScenes.forEach(scene => {
            const button = document.createElement('button');
            button.className = 'scene-btn';
            button.dataset.scene = scene;
            button.textContent = `${labelPrefix} ${scene}`;
            if (this.currentScene !== null && Number(this.currentScene) === Number(scene)) {
                button.classList.add('active');
            }
            if (this.runtimeScene !== null && String(this.runtimeScene) === String(scene)) {
                button.classList.add('runtime-current');
            }
            if (this.isPlaying) {
                button.disabled = true;
                button.classList.add('disabled');
                button.title = (window.i18n?.currentLang === 'zh') ? '运行中无法切换场景，暂停后查看历史场景' : 'Pause the story to inspect scenes';
            }
            button.addEventListener('click', () => {
                if (button.disabled) return;
                this.selectScene(scene);
            });
            this.container.appendChild(button);
        });
        this.updateButtonsInteractivity();
        this.applyRuntimeHighlight();
    }

    updateButtonsInteractivity() {
        const buttons = this.container ? this.container.querySelectorAll('.scene-btn') : [];
        buttons.forEach(btn => {
            const disabled = this.isPlaying;
            btn.disabled = disabled;
            btn.classList.toggle('disabled', disabled);
            if (disabled) {
                btn.title = (window.i18n?.currentLang === 'zh') ? '运行中无法切换场景，暂停后查看历史场景' : 'Pause the story to inspect scenes';
            } else {
                btn.removeAttribute('title');
            }
        });
        if (this.clearBtn) {
            this.clearBtn.disabled = !this.manualMode;
            this.clearBtn.classList.toggle('disabled', !this.manualMode);
        }
        this.applyRuntimeHighlight();
    }

    selectScene(sceneNumber) {
        if (this.isPlaying) {
            this.maybeWarnBlocked();
            return;
        }
        if (this.currentScene !== null && Number(this.currentScene) === Number(sceneNumber) && this.manualMode) {
            this.clearSelection({ origin: 'manual-clear' });
            return;
        }
        this.currentScene = sceneNumber;
        this.manualMode = true;
        this.updateActiveButton();
        this.updateButtonsInteractivity();
        this.notifySceneSelected(sceneNumber, 'manual');
        this.notifyViewState('manual', sceneNumber, 'select');
        if (window.characterProfiles && typeof window.characterProfiles.setPendingSceneContext === 'function') {
            window.characterProfiles.setPendingSceneContext('manual', sceneNumber);
        }
        if (typeof window.requestSceneCharacters === 'function') {
            window.requestSceneCharacters(sceneNumber, 'manual');
        }
    }

    clearSelection({ origin = 'manual-clear' } = {}) {
        const hadManual = this.manualMode;
        const hadSceneSelected = this.currentScene !== null;
        this.currentScene = null;
        this.manualMode = false;
        this.updateActiveButton();
        this.updateButtonsInteractivity();
        const viewOrigin = origin === 'runtime' ? 'runtime' : 'manual-clear';
        this.notifySceneSelected(null, viewOrigin);
        this.notifyViewState('runtime', null, viewOrigin);
        if (window.characterProfiles && typeof window.characterProfiles.setPendingSceneContext === 'function') {
            window.characterProfiles.setPendingSceneContext('manual', null);
            window.characterProfiles.setPendingSceneContext('runtime', null);
        }
        if ((hadManual || hadSceneSelected || origin === 'runtime') && typeof window.requestSceneCharacters === 'function') {
            window.requestSceneCharacters(null, 'runtime');
        }
    }

    exitManualMode({ origin = 'runtime' } = {}) {
        this.clearSelection({ origin });
    }

    updateActiveButton() {
        const buttons = this.container ? this.container.querySelectorAll('.scene-btn') : [];
        buttons.forEach(btn => {
            const btnScene = this.normalizeScene(btn.dataset.scene);
            btn.classList.toggle('active', this.currentScene !== null && String(this.currentScene) === String(btnScene));
        });
        this.applyRuntimeHighlight();
    }

    notifySceneSelected(scene, origin) {
        window.dispatchEvent(new CustomEvent('scene-selected', {
            detail: { scene, origin }
        }));
    }

    notifyViewState(mode, scene, origin) {
        window.dispatchEvent(new CustomEvent('scene-view-state-change', {
            detail: { mode, scene, origin, isPlaying: this.isPlaying }
        }));
    }

    applyRuntimeHighlight() {
        const buttons = this.container ? this.container.querySelectorAll('.scene-btn') : [];
        buttons.forEach(btn => {
            const btnScene = this.normalizeScene(btn.dataset.scene);
            const isRuntime = this.runtimeScene !== null && btnScene !== null && String(this.runtimeScene) === String(btnScene);
            if (!this.manualMode || !btn.classList.contains('active')) {
                btn.classList.toggle('runtime-current', isRuntime);
            } else {
                btn.classList.remove('runtime-current');
            }
        });
    }

    maybeWarnBlocked() {
        if (!window.addSystemMessage) return;
        const now = Date.now();
        if (now - (this.lastBlockedNotice || 0) < 3000) return;
        this.lastBlockedNotice = now;
        const message = (window.i18n?.currentLang === 'zh')
            ? '运行中无法切换场景，请先暂停。'
            : 'Pause the story before switching scenes.';
        window.addSystemMessage(message);
    }
}
const scenesPanel = new ScenesPanel();