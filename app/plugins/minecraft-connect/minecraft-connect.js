/**
 * Minecraft Connect Dashboard JavaScript
 */

(function() {
    'use strict';

    const VALID_THEMES = new Set(['day', 'night', 'contrast', 'vision-impaired', 'cid']);
    const RUNTIME_I18N_PREFIX = 'plugins.minecraft-connect.minecraft_connect.runtime.';

    function interpolateRuntimeFallback(fallback, params = {}) {
        return String(fallback).replace(/\{(\w+)\}/g, (match, name) => (
            Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match
        ));
    }

    function runtimeText(key, fallback, params = {}) {
        const translationKey = `${RUNTIME_I18N_PREFIX}${key}`;
        const translated = window.i18n && typeof window.i18n.t === 'function'
            ? window.i18n.t(translationKey, params)
            : translationKey;
        return translated && translated !== translationKey
            ? translated
            : interpolateRuntimeFallback(fallback, params);
    }

    const state = {
        socket: null,
        dashboard: null,
        config: {
            ui: {
                theme: 'night'
            },
            websocket: {
                host: 'localhost',
                port: 25560,
                heartbeatInterval: 30000
            },
            limits: {
                maxActionsPerMinute: 30,
                commandCooldown: 1000,
                maxQueueSize: 100
            },
            overlay: {
                enabled: true,
                showUsername: true,
                showAction: true,
                animationDuration: 3000
            },
            chat: {
                enabled: false,
                mode: 'relay',
                filters: [],
                relayTargets: []
            },
            giftBars: {
                enabled: false,
                goals: []
            }
        },
        status: {
            connectionStatus: 'Disconnected',
            isConnected: false,
            availableActions: [],
            stats: {},
            queueStatus: null
        },
        mappings: [],
        events: [],
        currentMapping: null,
        currentTab: 'commands'
    };

    function init() {
        syncThemeFromEnvironment();
        try {
            if (window.parent && window.parent !== window) {
                const observer = new MutationObserver(syncThemeFromEnvironment);
                observer.observe(window.parent.document.documentElement, {
                    attributes: true,
                    attributeFilter: ['data-theme']
                });
            }
        } catch (error) {}
        window.addEventListener('storage', (event) => {
            if (event && ['ltth-theme', 'app-theme', 'dashboard-theme', 'theme', 'ui-theme'].includes(event.key)) {
                syncThemeFromEnvironment();
            }
        });
        window.addEventListener('focus', syncThemeFromEnvironment);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                syncThemeFromEnvironment();
            }
        });
        bindEvents();
        registerRuntimeI18n();
        connectSocket();
        loadDashboard();
    }

    function rerenderRuntimeCopy() {
        renderAll();
    }

    function registerRuntimeI18n() {
        if (!window.i18n) {
            return;
        }
        if (typeof window.i18n.onChange === 'function') {
            window.i18n.onChange(rerenderRuntimeCopy);
        }
        if (typeof window.i18n.onLanguageChange === 'function') {
            window.i18n.onLanguageChange(rerenderRuntimeCopy);
        }
    }

    function normalizeTheme(theme) {
        if (VALID_THEMES.has(theme)) {
            return theme;
        }
        return 'night';
    }

    function readThemeFromEnvironment() {
        try {
            if (window.parent && window.parent !== window) {
                const parentTheme = window.parent.document?.documentElement?.getAttribute('data-theme');
                if (VALID_THEMES.has(parentTheme)) {
                    return parentTheme;
                }
            }
        } catch (error) {}

        try {
            for (const key of ['ltth-theme', 'app-theme', 'dashboard-theme', 'theme', 'ui-theme']) {
                const value = localStorage.getItem(key);
                if (VALID_THEMES.has(value)) {
                    return value;
                }
            }
        } catch (error) {}

        return null;
    }

    function resolveTheme(preferredTheme) {
        return readThemeFromEnvironment() || normalizeTheme(preferredTheme);
    }

    function syncThemeFromEnvironment() {
        applyTheme(resolveTheme(state.config.ui?.theme || 'night'));
    }

    function bindEvents() {
        document.querySelectorAll('.mc-tab').forEach((tab) => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        document.querySelectorAll('[data-theme-option]').forEach((button) => {
            button.addEventListener('click', () => setTheme(button.dataset.themeOption));
        });

        document.getElementById('refreshDashboardBtn').addEventListener('click', loadDashboard);
        document.getElementById('addCommandBtn').addEventListener('click', () => openMappingModal());
        document.getElementById('modalClose').addEventListener('click', closeMappingModal);
        document.getElementById('modalCancel').addEventListener('click', closeMappingModal);
        document.getElementById('modalSave').addEventListener('click', saveMappingFromModal);
        document.getElementById('addConditionBtn').addEventListener('click', () => addCondition());
        document.getElementById('mappingAction').addEventListener('change', updateParametersForm);
        document.getElementById('saveSetupBtn').addEventListener('click', saveSettings);
        document.getElementById('saveChatBtn').addEventListener('click', saveSettings);
        document.getElementById('saveGiftBarsBtn').addEventListener('click', saveSettings);
        document.getElementById('addGiftGoalBtn').addEventListener('click', addGiftGoal);
        document.getElementById('testActionBtn').addEventListener('click', testAction);
    }

    function connectSocket() {
        state.socket = io();

        state.socket.on('connect', () => {
            state.socket.emit('minecraft-connect:get-status');
            state.socket.emit('minecraft-connect:get-mappings');
        });

        state.socket.on('minecraft-connect:status-changed', (data) => {
            applyStatus(data);
        });

        state.socket.on('minecraft-connect:actions-updated', (data) => {
            state.status.availableActions = data.availableActions || [];
            renderActions();
            updateActionDropdown();
            updateSummary();
        });

        state.socket.on('minecraft-connect:event-log', (event) => {
            state.events.unshift(event);
            if (state.events.length > 100) {
                state.events = state.events.slice(0, 100);
            }
            renderChatFeed();
            updateSummary();
        });

        state.socket.on('minecraft-connect:mappings', (data) => {
            state.mappings = data.mappings || [];
            renderCommands();
            updateSummary();
        });

        state.socket.on('minecraft-connect:action-result', (result) => {
            console.log('[Minecraft Connect] Action result:', result);
        });
    }

    async function loadDashboard() {
        try {
            const response = await fetch('/api/minecraft-connect/dashboard');
            const data = await response.json();

            if (data.success && data.dashboard) {
                applyDashboard(data.dashboard);
                return;
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to load dashboard:', error);
        }

        await Promise.all([loadStatus(), loadMappings(), loadEvents()]);
    }

    async function loadStatus() {
        try {
            const response = await fetch('/api/minecraft-connect/status');
            const data = await response.json();
            if (data.success) {
                applyStatus(data.status);
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to load status:', error);
        }
    }

    async function loadMappings() {
        try {
            const response = await fetch('/api/minecraft-connect/mappings');
            const data = await response.json();
            if (data.success) {
                state.mappings = data.mappings || [];
                renderCommands();
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to load mappings:', error);
        }
    }

    async function loadEvents() {
        try {
            const response = await fetch('/api/minecraft-connect/events');
            const data = await response.json();
            if (data.success) {
                state.events = data.events || [];
                renderChatFeed();
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to load events:', error);
        }
    }

    function applyDashboard(dashboard) {
        state.dashboard = dashboard;
        state.config = dashboard.config || state.config;
        state.status = dashboard.status || state.status;
        state.mappings = dashboard.mappings || [];
        state.events = dashboard.events || [];
        applyTheme(resolveTheme(state.config.ui?.theme || 'night'));
        fillFormsFromConfig();
        renderAll();
    }

    function applyStatus(status) {
        state.status = {
            ...state.status,
            ...status
        };
        renderStatus();
        updateSummary();
    }

    function renderAll() {
        applyTheme(resolveTheme(state.config.ui?.theme || 'night'));
        renderStatus();
        renderSummary();
        renderCommands();
        renderActions();
        renderChatSettings();
        renderChatFeed();
        renderGiftBars();
        renderSetup();
        updateActionDropdown();
    }

    function switchTab(tabName) {
        state.currentTab = tabName;

        document.querySelectorAll('.mc-tab').forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        document.querySelectorAll('.mc-tab-panel').forEach((panel) => {
            panel.classList.remove('active');
        });

        const panel = document.getElementById(`${tabName}-tab`);
        if (panel) {
            panel.classList.add('active');
        }
    }

    function applyTheme(theme) {
        const value = normalizeTheme(theme);
        document.documentElement.dataset.theme = value;
        document.documentElement.style.colorScheme = value === 'day' ? 'light' : 'dark';
        state.config.ui = state.config.ui || {};
        state.config.ui.theme = value;

        document.querySelectorAll('[data-theme-option]').forEach((button) => {
            button.classList.toggle('active', button.dataset.themeOption === value);
            if (value === 'vision-impaired') {
                const isActive = button.dataset.themeOption === value;
                button.style.setProperty('background-color', isActive ? '#facc15' : '#000', 'important');
                button.style.setProperty('color', isActive ? '#000' : '#fff7cc', 'important');
                button.style.setProperty('border-color', '#facc15', 'important');
            } else {
                button.style.removeProperty('background-color');
                button.style.removeProperty('color');
                button.style.removeProperty('border-color');
            }
        });
    }

    function persistThemeSelection(theme) {
        const value = normalizeTheme(theme);

        try {
            for (const key of ['ltth-theme', 'app-theme', 'dashboard-theme', 'theme', 'ui-theme']) {
                localStorage.setItem(key, value);
            }
        } catch (error) {}
    }

    function setTheme(theme) {
        const value = normalizeTheme(theme);
        applyTheme(value);
        persistThemeSelection(value);
        saveSettings(true);
    }

    function renderStatus() {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const connectionMeta = document.getElementById('connectionMeta');

        if (!statusDot || !statusText) {
            return;
        }

        statusDot.className = 'mc-status-dot';

        if (state.status.isConnected) {
            statusDot.classList.add('connected');
            statusText.textContent = runtimeText('status.connected', 'Connected');
        } else if (state.status.connectionStatus === 'Waiting') {
            statusDot.classList.add('waiting');
            statusText.textContent = runtimeText('status.waiting', 'Waiting for Minecraft');
        } else {
            statusText.textContent = state.status.connectionStatus === 'Disconnected' || !state.status.connectionStatus
                ? runtimeText('status.disconnected', 'Disconnected')
                : state.status.connectionStatus;
        }

        if (connectionMeta) {
            const queueSize = state.status.queueStatus?.queueSize || 0;
            connectionMeta.textContent = runtimeText(
                'status.queue_theme',
                'Queue {queue} | Theme {theme}',
                { queue: queueSize, theme: document.documentElement.dataset.theme || 'night' }
            );
        }

        const testBtn = document.getElementById('testActionBtn');
        if (testBtn) {
            testBtn.disabled = !state.status.isConnected;
        }
    }

    function renderSummary() {
        document.getElementById('statTotalEvents').textContent = state.status.stats?.totalEvents || 0;
        document.getElementById('statTotalActions').textContent = state.status.stats?.totalActions || 0;
        document.getElementById('statQueueSize').textContent = state.status.queueStatus?.queueSize || 0;
        document.getElementById('statAvailableActions').textContent = state.status.availableActions?.length || 0;
    }

    function updateSummary() {
        renderSummary();
        renderStatus();
    }

    function fillFormsFromConfig() {
        const config = state.config || {};

        document.getElementById('wsHost').value = config.websocket?.host || 'localhost';
        document.getElementById('wsPort').value = config.websocket?.port || 25560;
        document.getElementById('wsHeartbeat').value = config.websocket?.heartbeatInterval || 30000;
        document.getElementById('maxActionsPerMin').value = config.limits?.maxActionsPerMinute || 30;
        document.getElementById('commandCooldown').value = config.limits?.commandCooldown || 1000;
        document.getElementById('maxQueueSize').value = config.limits?.maxQueueSize || 100;
        document.getElementById('overlayEnabled').checked = config.overlay?.enabled !== false;
        document.getElementById('overlayShowUsername').checked = config.overlay?.showUsername !== false;
        document.getElementById('overlayShowAction').checked = config.overlay?.showAction !== false;
        document.getElementById('overlayDuration').value = config.overlay?.animationDuration || 3000;
        document.getElementById('chatEnabled').checked = config.chat?.enabled === true;
        document.getElementById('chatMode').value = config.chat?.mode || 'relay';
        document.getElementById('chatRelayTargets').value = joinList(config.chat?.relayTargets);
        document.getElementById('chatFilters').value = joinList(config.chat?.filters);
        document.getElementById('giftBarsEnabled').checked = config.giftBars?.enabled === true;
    }

    function renderCommands() {
        const container = document.getElementById('mappingsList');
        if (!container) {
            return;
        }

        if (!state.mappings.length) {
            container.innerHTML = `
                <div class="mc-empty-state">
                    <p>${escapeHtml(runtimeText('mappings.empty_title', 'No commands yet.'))}</p>
                    <p class="mc-text-muted">${escapeHtml(runtimeText('mappings.empty_hint', 'Click "Add command" to create your first TikTok to Minecraft mapping.'))}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = state.mappings.map((mapping) => {
            const conditions = (mapping.conditions || []).map((condition) => {
                return `${escapeHtml(condition.field)} ${escapeHtml(condition.operator)} ${escapeHtml(String(condition.value))}`;
            }).join(', ');

            const params = Object.entries(mapping.params || {}).map(([key, value]) => {
                return `<span class="mc-param-pill">${escapeHtml(key)}: ${escapeHtml(String(value))}</span>`;
            }).join('');

            return `
                <article class="mc-command-card">
                    <div class="mc-command-top">
                        <div>
                            <span class="mc-trigger-pill">${escapeHtml(mapping.trigger || 'trigger')}</span>
                            <span class="mc-command-arrow">${escapeHtml(runtimeText('mappings.to', 'to'))}</span>
                            <strong>${escapeHtml(mapping.action || 'action')}</strong>
                        </div>
                        <div class="mc-command-actions">
                            <button class="mc-btn mc-btn-secondary mc-btn-small" onclick="editMapping('${escapeAttr(mapping.id)}')">${escapeHtml(runtimeText('mappings.edit', 'Edit'))}</button>
                            <button class="mc-btn mc-btn-danger mc-btn-small" onclick="deleteMapping('${escapeAttr(mapping.id)}')">${escapeHtml(runtimeText('mappings.delete', 'Delete'))}</button>
                        </div>
                    </div>
                    <div class="mc-command-body">
                        ${conditions ? `<p><span>${escapeHtml(runtimeText('mappings.conditions', 'Conditions:'))}</span> ${conditions}</p>` : `<p class="mc-text-muted">${escapeHtml(runtimeText('mappings.no_conditions', 'No conditions'))}</p>`}
                        ${params ? `<div class="mc-param-row">${params}</div>` : `<p class="mc-text-muted">${escapeHtml(runtimeText('mappings.no_parameters', 'No parameters'))}</p>`}
                    </div>
                </article>
            `;
        }).join('');
    }

    function renderActions() {
        const container = document.getElementById('actionsList');
        if (!container) {
            return;
        }

        if (!state.status.availableActions.length) {
            container.innerHTML = `
                <div class="mc-empty-state">
                    <p>${escapeHtml(runtimeText('actions.empty_title', 'No Minecraft connection detected.'))}</p>
                    <p class="mc-text-muted">${escapeHtml(runtimeText('actions.empty_hint', 'Install and run the Fabric mod to see available actions.'))}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = state.status.availableActions.map((action) => {
            const params = (action.params || []).map((param) => `<span class="mc-param-pill">${escapeHtml(param)}</span>`).join('');
            return `
                <article class="mc-action-card">
                    <strong>${escapeHtml(action.name)}</strong>
                    <div class="mc-param-row">${params}</div>
                </article>
            `;
        }).join('');
    }

    function renderChatSettings() {
        const chatState = state.config.chat || {};
        document.getElementById('chatEnabled').checked = chatState.enabled === true;
        document.getElementById('chatMode').value = chatState.mode || 'relay';
        document.getElementById('chatRelayTargets').value = joinList(chatState.relayTargets);
        document.getElementById('chatFilters').value = joinList(chatState.filters);
    }

    function renderChatFeed() {
        const container = document.getElementById('chatFeed');
        if (!container) {
            return;
        }

        const chatEvents = state.events.filter((event) => event.type === 'chat').slice(0, 12);
        if (!chatEvents.length) {
            container.innerHTML = `
                <div class="mc-empty-state">
                    <p>${escapeHtml(runtimeText('chat.empty_title', 'No chat yet.'))}</p>
                    <p class="mc-text-muted">${escapeHtml(runtimeText('chat.empty_hint', 'Chat events will appear here when viewers send messages.'))}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = chatEvents.map((event) => {
            const data = event.data || {};
            const username = data.nickname || data.uniqueId || runtimeText('chat.viewer', 'Viewer');
            const message = data.comment || data.content || data.text || runtimeText('chat.message', 'Message');
            return `
                <article class="mc-feed-item">
                    <div>
                        <strong>${escapeHtml(username)}</strong>
                        <p>${escapeHtml(message)}</p>
                    </div>
                    <time>${new Date(event.timestamp || Date.now()).toLocaleTimeString()}</time>
                </article>
            `;
        }).join('');
    }

    function renderGiftBars() {
        const goals = state.config.giftBars?.goals || [];
        const list = document.getElementById('giftGoalsList');
        const empty = document.getElementById('giftGoalsEmpty');
        const preview = document.getElementById('giftBarPreview');
        const enabledCheckbox = document.getElementById('giftBarsEnabled');

        if (enabledCheckbox) {
            enabledCheckbox.checked = state.config.giftBars?.enabled === true;
        }

        if (list) {
            if (!goals.length) {
                list.innerHTML = '';
                if (empty) {
                    empty.style.display = 'block';
                }
            } else {
                if (empty) {
                    empty.style.display = 'none';
                }
                list.innerHTML = goals.map((goal, index) => {
                    return `
                        <article class="mc-goal-card" data-goal-index="${index}">
                            <div class="mc-goal-row">
                                <label>${escapeHtml(runtimeText('goals.label', 'Label'))}</label>
                                <input type="text" class="mc-input" data-goal-field="label" value="${escapeAttr(goal.label || '')}">
                            </div>
                            <div class="mc-goal-row">
                                <label>${escapeHtml(runtimeText('goals.current', 'Current'))}</label>
                                <input type="number" class="mc-input" data-goal-field="current" value="${escapeAttr(goal.current ?? 0)}">
                            </div>
                            <div class="mc-goal-row">
                                <label>${escapeHtml(runtimeText('goals.target', 'Target'))}</label>
                                <input type="number" class="mc-input" data-goal-field="target" value="${escapeAttr(goal.target ?? 100)}">
                            </div>
                            <div class="mc-goal-row">
                                <label>${escapeHtml(runtimeText('goals.reward_action', 'Reward action'))}</label>
                                <input type="text" class="mc-input" data-goal-field="rewardAction" value="${escapeAttr(goal.rewardAction || '')}" placeholder="${escapeAttr(runtimeText('goals.reward_action_placeholder', 'spawn_entity'))}">
                            </div>
                            <label class="mc-checkbox-label">
                                <input type="checkbox" data-goal-field="enabled" ${goal.enabled === false ? '' : 'checked'}>
                                ${escapeHtml(runtimeText('goals.enabled', 'Enabled'))}
                            </label>
                            <button class="mc-btn mc-btn-danger mc-btn-small" data-remove-goal="${index}">${escapeHtml(runtimeText('goals.remove', 'Remove goal'))}</button>
                        </article>
                    `;
                }).join('');

                list.querySelectorAll('[data-remove-goal]').forEach((button) => {
                    button.addEventListener('click', () => {
                        const index = parseInt(button.dataset.removeGoal, 10);
                        state.config.giftBars.goals.splice(index, 1);
                        renderGiftBars();
                    });
                });
            }
        }

        if (preview) {
            const firstGoal = goals.find((goal) => goal.enabled !== false);
            if (!firstGoal) {
                preview.innerHTML = `
                    <div class="mc-empty-state">
                        <p>${escapeHtml(runtimeText('goals.empty_preview_title', 'No gift bar preview yet.'))}</p>
                        <p class="mc-text-muted">${escapeHtml(runtimeText('goals.empty_preview_hint', 'Create at least one goal to see a preview.'))}</p>
                    </div>
                `;
                return;
            }

            const current = Number(firstGoal.current || 0);
            const target = Math.max(1, Number(firstGoal.target || 100));
            const progress = Math.min(100, Math.round((current / target) * 100));

            preview.innerHTML = `
                <div class="mc-progress-shell">
                    <div class="mc-progress-meta">
                        <strong>${escapeHtml(firstGoal.label || runtimeText('goals.default_label', 'Gift goal'))}</strong>
                        <span>${current} / ${target}</span>
                    </div>
                    <div class="mc-progress-track">
                        <div class="mc-progress-fill" style="width: ${progress}%;"></div>
                    </div>
                    <p class="mc-text-muted">${escapeHtml(firstGoal.rewardAction || runtimeText('goals.no_reward_action', 'No reward action'))}</p>
                </div>
            `;
        }
    }

    function renderSetup() {
        const checklist = document.getElementById('setupChecklist');
        if (!checklist) {
            return;
        }

        const steps = [
            { label: runtimeText('setup.websocket_bridge', 'WebSocket bridge'), done: state.status.connectionStatus && state.status.connectionStatus !== 'Disconnected' },
            { label: runtimeText('setup.minecraft_mod_connection', 'Minecraft mod connection'), done: !!state.status.isConnected },
            { label: runtimeText('setup.commands_configured', 'Commands configured'), done: state.mappings.length > 0 },
            { label: runtimeText('setup.modern_theme_selected', 'Modern theme selected'), done: VALID_THEMES.has(state.config.ui?.theme || 'night') }
        ];

        checklist.innerHTML = steps.map((step) => `
            <div class="mc-check-item ${step.done ? 'done' : ''}">
                <span></span>
                <strong>${escapeHtml(step.label)}</strong>
            </div>
        `).join('');
    }

    function updateActionDropdown() {
        const select = document.getElementById('mappingAction');
        if (!select) {
            return;
        }

        const currentValue = select.value;
        select.innerHTML = `<option value="">${escapeHtml(runtimeText('actions.select', 'Select action...'))}</option>` + state.status.availableActions.map((action) => {
            return `<option value="${escapeAttr(action.name)}">${escapeHtml(action.name)}</option>`;
        }).join('');

        if (currentValue) {
            select.value = currentValue;
        }
    }

    function openMappingModal(mapping = null) {
        state.currentMapping = mapping;
        const modal = document.getElementById('mappingModal');
        const title = document.getElementById('modalTitle');

        if (mapping) {
            title.textContent = runtimeText('mappings.edit_command', 'Edit Command');
            fillMappingForm(mapping);
        } else {
            title.textContent = runtimeText('mappings.add_command', 'Add Command');
            resetMappingForm();
        }

        modal.classList.add('active');
    }

    function closeMappingModal() {
        document.getElementById('mappingModal').classList.remove('active');
        state.currentMapping = null;
    }

    function resetMappingForm() {
        document.getElementById('mappingTrigger').value = '';
        document.getElementById('mappingAction').value = '';
        document.getElementById('mappingEnabled').checked = true;
        document.getElementById('conditionsList').innerHTML = '';
        document.getElementById('parametersList').innerHTML = '';
        document.getElementById('parametersGroup').style.display = 'none';
    }

    function fillMappingForm(mapping) {
        document.getElementById('mappingTrigger').value = mapping.trigger || '';
        document.getElementById('mappingAction').value = mapping.action || '';
        document.getElementById('mappingEnabled').checked = mapping.enabled !== false;

        const conditionsList = document.getElementById('conditionsList');
        conditionsList.innerHTML = '';
        (mapping.conditions || []).forEach((condition) => addCondition(condition));

        updateParametersForm();

        if (mapping.params) {
            Object.entries(mapping.params).forEach(([key, value]) => {
                const input = document.querySelector(`[data-param="${cssAttr(key)}"]`);
                if (input) {
                    input.value = value;
                }
            });
        }
    }

    function addCondition(condition = null) {
        const container = document.getElementById('conditionsList');
        const conditionId = Date.now() + Math.floor(Math.random() * 1000);

        const conditionHtml = `
            <div class="mc-condition" data-condition-id="${conditionId}">
                    <input type="text" class="mc-input mc-condition-field" placeholder="${escapeAttr(runtimeText('conditions.field_placeholder', 'Field (e.g., giftName)'))}"
                    value="${escapeAttr(condition ? condition.field : '')}" data-role="field">
                <select class="mc-input mc-condition-operator" data-role="operator">
                    <option value="equals" ${condition?.operator === 'equals' ? 'selected' : ''}>${escapeHtml(runtimeText('conditions.equals', 'Equals'))}</option>
                    <option value="not_equals" ${condition?.operator === 'not_equals' ? 'selected' : ''}>${escapeHtml(runtimeText('conditions.not_equals', 'Not Equals'))}</option>
                    <option value="greater_than" ${condition?.operator === 'greater_than' ? 'selected' : ''}>${escapeHtml(runtimeText('conditions.greater_than', 'Greater Than'))}</option>
                    <option value="less_than" ${condition?.operator === 'less_than' ? 'selected' : ''}>${escapeHtml(runtimeText('conditions.less_than', 'Less Than'))}</option>
                    <option value="contains" ${condition?.operator === 'contains' ? 'selected' : ''}>${escapeHtml(runtimeText('conditions.contains', 'Contains'))}</option>
                </select>
                    <input type="text" class="mc-input mc-condition-value" placeholder="${escapeAttr(runtimeText('conditions.value_placeholder', 'Value'))}"
                    value="${escapeAttr(condition ? condition.value : '')}" data-role="value">
                <button class="mc-condition-remove" onclick="removeCondition(${conditionId})">x</button>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', conditionHtml);
    }

    window.removeCondition = function(conditionId) {
        const condition = document.querySelector(`[data-condition-id="${conditionId}"]`);
        if (condition) {
            condition.remove();
        }
    };

    function updateParametersForm() {
        const actionName = document.getElementById('mappingAction').value;
        const parametersGroup = document.getElementById('parametersGroup');
        const parametersList = document.getElementById('parametersList');

        if (!actionName) {
            parametersGroup.style.display = 'none';
            return;
        }

        const action = state.status.availableActions.find((item) => item.name === actionName);
        if (!action || !action.params || action.params.length === 0) {
            parametersGroup.style.display = 'none';
            return;
        }

        parametersGroup.style.display = 'block';
        parametersList.innerHTML = action.params.map((param) => `
            <div class="mc-form-group">
                <label>${escapeHtml(param)}</label>
                <input type="text" class="mc-input" data-param="${escapeAttr(param)}" placeholder="${escapeAttr(runtimeText('parameters.placeholder', 'Enter value or use {placeholder}'))}">
            </div>
        `).join('');
    }

    async function saveMappingFromModal() {
        const trigger = document.getElementById('mappingTrigger').value;
        const action = document.getElementById('mappingAction').value;
        const enabled = document.getElementById('mappingEnabled').checked;

        if (!trigger || !action) {
            alert(runtimeText('messages.select_trigger_action', 'Please select a trigger and action'));
            return;
        }

        const conditions = [];
        document.querySelectorAll('.mc-condition').forEach((conditionEl) => {
            const field = conditionEl.querySelector('[data-role="field"]').value;
            const operator = conditionEl.querySelector('[data-role="operator"]').value;
            const value = conditionEl.querySelector('[data-role="value"]').value;

            if (field && value) {
                conditions.push({ field, operator, value });
            }
        });

        const params = {};
        document.querySelectorAll('[data-param]').forEach((input) => {
            const param = input.dataset.param;
            const value = input.value;
            if (value) {
                params[param] = value;
            }
        });

        const mapping = {
            trigger,
            action,
            conditions,
            params,
            enabled
        };

        try {
            const response = await fetch(state.currentMapping ? `/api/minecraft-connect/mappings/${state.currentMapping.id}` : '/api/minecraft-connect/mappings', {
                method: state.currentMapping ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mapping)
            });

            const data = await response.json();
            if (data.success) {
                state.mappings = data.mappings || [];
                renderCommands();
                closeMappingModal();
            } else {
                alert(runtimeText('messages.save_failed_with_error', 'Failed to save mapping: {error}', { error: data.error || '' }));
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to save mapping:', error);
            alert(runtimeText('messages.save_failed', 'Failed to save mapping'));
        }
    }

    window.editMapping = function(id) {
        const mapping = state.mappings.find((item) => item.id === id);
        if (mapping) {
            openMappingModal(mapping);
        }
    };

    window.deleteMapping = async function(id) {
        if (!confirm(runtimeText('messages.delete_confirm', 'Are you sure you want to delete this command?'))) {
            return;
        }

        try {
            const response = await fetch(`/api/minecraft-connect/mappings/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            if (data.success) {
                state.mappings = data.mappings || [];
                renderCommands();
                renderSetup();
            } else {
                alert(runtimeText('messages.delete_failed_with_error', 'Failed to delete mapping: {error}', { error: data.error || '' }));
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to delete mapping:', error);
            alert(runtimeText('messages.delete_failed', 'Failed to delete mapping'));
        }
    };

    async function testAction() {
        const actionName = prompt(runtimeText('messages.enter_action_name', 'Enter action name:'));
        if (!actionName) {
            return;
        }

        try {
            const response = await fetch('/api/minecraft-connect/test-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: actionName,
                    params: {}
                })
            });

            const data = await response.json();
            if (data.success) {
                alert(runtimeText('messages.test_success', 'Action queued successfully'));
            } else {
                alert(runtimeText('messages.test_failed_with_error', 'Failed to queue action: {error}', { error: data.error || '' }));
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to test action:', error);
            alert(runtimeText('messages.test_failed', 'Failed to test action'));
        }
    }

    function addGiftGoal() {
        state.config.giftBars = state.config.giftBars || { enabled: false, goals: [] };
        state.config.giftBars.goals.push({
            label: runtimeText('goals.new_goal', 'New goal'),
            current: 0,
            target: 100,
            rewardAction: 'spawn_entity',
            enabled: true
        });
        renderGiftBars();
    }

    function collectGiftGoals() {
        const cards = document.querySelectorAll('[data-goal-index]');
        return Array.from(cards).map((card) => {
            const enabledInput = card.querySelector('[data-goal-field="enabled"]');
            return {
                label: card.querySelector('[data-goal-field="label"]').value,
                current: parseInt(card.querySelector('[data-goal-field="current"]').value, 10) || 0,
                target: parseInt(card.querySelector('[data-goal-field="target"]').value, 10) || 0,
                rewardAction: card.querySelector('[data-goal-field="rewardAction"]').value,
                enabled: enabledInput ? enabledInput.checked : true
            };
        });
    }

    async function saveSettings(silent = false) {
        const nextConfig = {
            ...state.config,
            ui: {
                ...state.config.ui,
                theme: normalizeTheme(document.documentElement.dataset.theme || state.config.ui?.theme || 'night')
            },
            websocket: {
                ...state.config.websocket,
                host: document.getElementById('wsHost').value.trim() || 'localhost',
                port: parseInt(document.getElementById('wsPort').value, 10) || 25560,
                heartbeatInterval: parseInt(document.getElementById('wsHeartbeat').value, 10) || 30000
            },
            limits: {
                ...state.config.limits,
                maxActionsPerMinute: parseInt(document.getElementById('maxActionsPerMin').value, 10) || 30,
                commandCooldown: parseInt(document.getElementById('commandCooldown').value, 10) || 1000,
                maxQueueSize: parseInt(document.getElementById('maxQueueSize').value, 10) || 100
            },
            overlay: {
                ...state.config.overlay,
                enabled: document.getElementById('overlayEnabled').checked,
                showUsername: document.getElementById('overlayShowUsername').checked,
                showAction: document.getElementById('overlayShowAction').checked,
                animationDuration: parseInt(document.getElementById('overlayDuration').value, 10) || 3000
            },
            chat: {
                ...state.config.chat,
                enabled: document.getElementById('chatEnabled').checked,
                mode: document.getElementById('chatMode').value,
                relayTargets: splitList(document.getElementById('chatRelayTargets').value),
                filters: splitList(document.getElementById('chatFilters').value)
            },
            giftBars: {
                ...state.config.giftBars,
                enabled: document.getElementById('giftBarsEnabled').checked,
                goals: collectGiftGoals()
            }
        };

        try {
            const response = await fetch('/api/minecraft-connect/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nextConfig)
            });

            const data = await response.json();
            if (data.success) {
                state.config = data.config || nextConfig;
                const savedTheme = normalizeTheme(state.config.ui?.theme || 'night');
                persistThemeSelection(savedTheme);
                applyTheme(savedTheme);
                renderGiftBars();
                renderChatSettings();
                renderSetup();
                renderStatus();
                updateSummary();
                if (!silent) {
                    alert(runtimeText('messages.settings_saved', 'Settings saved successfully.'));
                }
            } else if (!silent) {
                alert(runtimeText('messages.settings_save_failed_with_error', 'Failed to save settings: {error}', { error: data.error || '' }));
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to save settings:', error);
            if (!silent) {
                alert(runtimeText('messages.settings_save_failed', 'Failed to save settings'));
            }
        }
    }

    function splitList(value) {
        return String(value || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    function joinList(items) {
        return Array.isArray(items) ? items.join(', ') : '';
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }

    function cssAttr(value) {
        return String(value).replace(/"/g, '\\"');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

