/**
 * Flow Wizard
 * 5-step guided flow creation wizard for IFTTT automation flows.
 *
 * Steps:
 *   1. Name & Description
 *   2. Trigger Selection
 *   3. Condition Builder (optional)
 *   4. Actions Builder
 *   5. Options (cooldown, priority, preview)
 */

(function () {
    'use strict';

    // Template variables for autocomplete hints
    const TEMPLATE_VARS = ['{{username}}', '{{nickname}}', '{{giftName}}', '{{coins}}', '{{message}}', '{{repeatCount}}'];

    // Available priority options
    const PRIORITY_OPTIONS = [
        { value: 'low', label: 'Niedrig' },
        { value: 'normal', label: 'Normal' },
        { value: 'high', label: 'Hoch' }
    ];

    // Wizard state
    let wizardState = {
        currentStep: 1,
        totalSteps: 5,
        isOpen: false,
        // Step 1
        name: '',
        description: '',
        enabled: true,
        // Step 2
        trigger_type: '',
        // Step 3
        conditions: [],        // Array of {field, operator, value}
        conditionLogic: 'and', // 'and' | 'or'
        // Step 4
        actions: [],           // Array of action objects
        // Step 5
        cooldown: 0,
        priority: 'normal',
        // Loaded data
        availableTriggers: [],
        availableConditions: [],
        availableOperators: [],
        availableActions: [],
        // Edit mode
        editFlowId: null
    };

    /**
     * Open the wizard (optionally with a pre-filled flow for editing)
     * @param {Object|null} presetFlow - Optional preset/flow data to pre-fill
     * @param {number|null} editFlowId - If editing, the flow ID
     */
    async function openWizard(presetFlow = null, editFlowId = null) {
        resetWizardState();

        if (presetFlow) {
            wizardState.name = presetFlow.name || '';
            wizardState.description = presetFlow.description || '';
            wizardState.enabled = presetFlow.enabled !== false;
            wizardState.trigger_type = presetFlow.trigger_type || '';
            wizardState.cooldown = presetFlow.cooldown || 0;
            wizardState.priority = presetFlow.priority || 'normal';
            wizardState.editFlowId = editFlowId;

            // Handle conditions
            if (presetFlow.trigger_condition) {
                const cond = presetFlow.trigger_condition;
                if (cond.logic && cond.conditions) {
                    wizardState.conditionLogic = cond.logic;
                    wizardState.conditions = cond.conditions.map(c => ({ ...c }));
                } else if (cond.field) {
                    wizardState.conditions = [{ field: cond.field, operator: cond.operator || 'equals', value: cond.value || '' }];
                }
            }

            // Handle actions
            if (Array.isArray(presetFlow.actions)) {
                wizardState.actions = presetFlow.actions.map(a => ({ ...a }));
            }
        }

        wizardState.isOpen = true;
        wizardState.currentStep = 1;

        // Fetch data from API
        await loadWizardData();

        renderWizard();
        showWizardModal();
    }

    /**
     * Reset wizard state to defaults
     */
    function resetWizardState() {
        wizardState.currentStep = 1;
        wizardState.isOpen = false;
        wizardState.name = '';
        wizardState.description = '';
        wizardState.enabled = true;
        wizardState.trigger_type = '';
        wizardState.conditions = [];
        wizardState.conditionLogic = 'and';
        wizardState.actions = [];
        wizardState.cooldown = 0;
        wizardState.priority = 'normal';
        wizardState.editFlowId = null;
    }

    /**
     * Load triggers, conditions and actions from API
     */
    async function loadWizardData() {
        try {
            const [triggersRes, conditionsRes, actionsRes] = await Promise.all([
                fetch('/api/ifttt/triggers'),
                fetch('/api/ifttt/conditions'),
                fetch('/api/ifttt/actions')
            ]);

            wizardState.availableTriggers = await triggersRes.json();
            const condData = await conditionsRes.json();
            wizardState.availableConditions = condData.conditions || [];
            wizardState.availableOperators = condData.operators || [];
            wizardState.availableActions = await actionsRes.json();
        } catch (err) {
            console.error('Flow Wizard: Failed to load wizard data', err);
        }
    }

    /**
     * Show the wizard modal
     */
    function showWizardModal() {
        const modal = document.getElementById('flow-wizard-modal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    /**
     * Hide and close the wizard
     */
    function closeWizard() {
        const modal = document.getElementById('flow-wizard-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        wizardState.isOpen = false;
    }

    /**
     * Render the current wizard step
     */
    function renderWizard() {
        const container = document.getElementById('flow-wizard-content');
        if (!container) return;

        // Render step indicator
        renderStepIndicator();

        // Render current step
        switch (wizardState.currentStep) {
            case 1: renderStep1(container); break;
            case 2: renderStep2(container); break;
            case 3: renderStep3(container); break;
            case 4: renderStep4(container); break;
            case 5: renderStep5(container); break;
        }

        // Render navigation buttons
        renderNavigation();

        // Re-init Lucide icons if available
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    /**
     * Render step indicator (1/5, 2/5, etc.)
     */
    function renderStepIndicator() {
        const el = document.getElementById('flow-wizard-steps');
        if (!el) return;

        const stepLabels = ['Name', 'Trigger', 'Bedingung', 'Aktionen', 'Optionen'];
        el.innerHTML = stepLabels.map((label, i) => {
            const step = i + 1;
            const isActive = step === wizardState.currentStep;
            const isDone = step < wizardState.currentStep;
            return `
                <button class="wizard-step-btn ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}"
                        data-wiz-action="go-to-step" data-step="${step}"
                        title="${label}">
                    <span class="step-num">${isDone ? '✓' : step}</span>
                    <span class="step-label">${label}</span>
                </button>
            `;
        }).join('<div class="wizard-step-separator"></div>');
    }

    /**
     * Render navigation buttons
     */
    function renderNavigation() {
        const nav = document.getElementById('flow-wizard-nav');
        if (!nav) return;

        const isFirst = wizardState.currentStep === 1;
        const isLast = wizardState.currentStep === wizardState.totalSteps;

        nav.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;">
                ${!isFirst ? `<button class="btn btn-ghost" data-wiz-action="prev-step">← Zurück</button>` : ''}
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                ${isLast ? `
                    <button class="btn btn-ghost" data-wiz-action="test-flow" id="wizard-test-btn">🧪 Testen</button>
                    <button class="btn btn-primary" data-wiz-action="save-flow">💾 Flow Speichern</button>
                ` : `
                    <button class="btn btn-primary" data-wiz-action="next-step">Weiter →</button>
                `}
            </div>
        `;
    }

    // ===== STEP 1: Name & Description =====

    function renderStep1(container) {
        container.innerHTML = `
            <div class="wizard-step-content">
                <h3 class="wizard-step-title">Schritt 1: Name & Beschreibung</h3>
                <p class="wizard-step-desc text-gray-400 mb-4">Gib deinem Flow einen aussagekräftigen Namen.</p>

                <div class="form-group mb-4">
                    <label class="form-label" for="wiz-name">Flow Name <span style="color:#ef4444">*</span></label>
                    <input type="text" id="wiz-name" class="form-input" placeholder="z.B. Rose Geschenk → Danke TTS"
                        value="${escapeHtmlAttr(wizardState.name)}"
                        data-wiz-field="name">
                </div>

                <div class="form-group mb-4">
                    <label class="form-label" for="wiz-desc">Beschreibung <span class="text-gray-500">(optional)</span></label>
                    <textarea id="wiz-desc" class="form-textarea" rows="2"
                        placeholder="Wofür ist dieser Flow?"
                        data-wiz-field="description">${escapeHtmlContent(wizardState.description)}</textarea>
                </div>

                <div class="form-group">
                    <label class="form-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" id="wiz-enabled" ${wizardState.enabled ? 'checked' : ''}
                            data-wiz-field="enabled"
                            style="width:16px;height:16px;">
                        Flow sofort aktivieren
                    </label>
                </div>

                <div class="wizard-presets-hint mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                    <strong style="color:#60a5fa;">💡 Tipp:</strong>
                    <span class="text-gray-300"> Du kannst auch mit einem Template starten — klicke unten auf "Presets" im Flows-Bereich.</span>
                </div>
            </div>
        `;
    }

    // ===== STEP 2: Trigger Selection =====

    function renderStep2(container) {
        const triggers = wizardState.availableTriggers;
        const grouped = groupBy(triggers, t => t.category || 'other');
        const categoryLabels = {
            tiktok: '🎵 TikTok',
            system: '⚙️ System',
            timer: '⏰ Timer',
            other: '📦 Sonstige'
        };

        container.innerHTML = `
            <div class="wizard-step-content">
                <h3 class="wizard-step-title">Schritt 2: Trigger auswählen</h3>
                <p class="wizard-step-desc text-gray-400 mb-4">Wähle das Ereignis, das diesen Flow auslöst.</p>

                ${Object.entries(grouped).map(([cat, items]) => `
                    <div class="mb-4">
                        <div class="text-sm font-semibold text-gray-400 mb-2">${categoryLabels[cat] || cat}</div>
                        <div class="wizard-trigger-grid">
                            ${items.map(t => `
                                <button class="wizard-trigger-card ${wizardState.trigger_type === t.id ? 'selected' : ''}"
                                        data-wiz-action="select-trigger" data-trigger-id="${escapeHtmlAttr(t.id)}"
                                        title="${escapeHtmlAttr(t.description || '')}">
                                    <span class="trigger-icon">${t.icon || '⚡'}</span>
                                    <span class="trigger-name">${escapeHtmlContent(t.name)}</span>
                                    ${t.description ? `<span class="trigger-desc">${escapeHtmlContent(t.description)}</span>` : ''}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}

                ${triggers.length === 0 ? `<div class="text-gray-400">Keine Trigger verfügbar (API-Verbindung prüfen).</div>` : ''}
            </div>
        `;
    }

    // ===== STEP 3: Condition Builder =====

    function renderStep3(container) {
        const conditions = wizardState.conditions;

        container.innerHTML = `
            <div class="wizard-step-content">
                <h3 class="wizard-step-title">Schritt 3: Bedingungen <span class="text-gray-500 text-sm">(optional)</span></h3>
                <p class="wizard-step-desc text-gray-400 mb-4">Optionale Bedingungen, die erfüllt sein müssen. Ohne Bedingung wird der Flow bei jedem Trigger ausgeführt.</p>

                ${conditions.length > 1 ? `
                    <div class="mb-3 flex items-center gap-3">
                        <span class="text-gray-400 text-sm">Verknüpfung:</span>
                        <label style="cursor:pointer;display:flex;align-items:center;gap:4px;">
                            <input type="radio" name="cond-logic" value="and" ${wizardState.conditionLogic === 'and' ? 'checked' : ''} data-wiz-field="conditionLogic"> UND (alle müssen zutreffen)
                        </label>
                        <label style="cursor:pointer;display:flex;align-items:center;gap:4px;">
                            <input type="radio" name="cond-logic" value="or" ${wizardState.conditionLogic === 'or' ? 'checked' : ''} data-wiz-field="conditionLogic"> ODER (mindestens eine muss zutreffen)
                        </label>
                    </div>
                ` : ''}

                <div id="wizard-conditions-list">
                    ${conditions.map((cond, i) => renderConditionRow(cond, i)).join('')}
                </div>

                <button class="btn btn-ghost mt-3" data-wiz-action="add-condition">
                    + Bedingung hinzufügen
                </button>

                ${conditions.length > 0 ? `
                    <div class="mt-4 p-3 bg-gray-800 rounded text-sm">
                        <span class="text-gray-400">Vorschau: </span>
                        <span class="text-green-400">${buildConditionPreview()}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    function renderConditionRow(cond, index) {
        // Use simple field/operator/value for the wizard (maps to field_value condition)
        const operators = wizardState.availableOperators.filter(op =>
            ['equals', 'notEquals', 'contains', 'startsWith', 'endsWith', 'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual'].includes(op.id)
        );

        return `
            <div class="wizard-condition-row mb-2 p-3 bg-gray-800 rounded flex items-center gap-2 flex-wrap">
                <div style="display:flex;gap:4px;align-items:center;flex:1;flex-wrap:wrap;min-width:0;">
                    <input type="text" class="form-input" placeholder="Feld (z.B. giftName)"
                        value="${escapeHtmlAttr(cond.field || '')}"
                        data-wiz-condition="${index}" data-key="field"
                        style="width:150px;min-width:120px;">
                    <select class="form-select" style="width:160px;min-width:130px;"
                        data-wiz-condition="${index}" data-key="operator">
                        ${operators.map(op => `
                            <option value="${escapeHtmlAttr(op.id)}" ${cond.operator === op.id ? 'selected' : ''}>${escapeHtmlContent(op.label)}</option>
                        `).join('')}
                        ${operators.length === 0 ? `
                            <option value="equals" ${cond.operator === 'equals' ? 'selected' : ''}>Gleich</option>
                            <option value="notEquals" ${cond.operator === 'notEquals' ? 'selected' : ''}>Ungleich</option>
                            <option value="contains" ${cond.operator === 'contains' ? 'selected' : ''}>Enthält</option>
                            <option value="startsWith" ${cond.operator === 'startsWith' ? 'selected' : ''}>Beginnt mit</option>
                            <option value="greaterThan" ${cond.operator === 'greaterThan' ? 'selected' : ''}>Größer als</option>
                            <option value="lessThan" ${cond.operator === 'lessThan' ? 'selected' : ''}>Kleiner als</option>
                        ` : ''}
                    </select>
                    <input type="text" class="form-input" placeholder="Wert"
                        value="${escapeHtmlAttr(cond.value || '')}"
                        data-wiz-condition="${index}" data-key="value"
                        style="width:150px;min-width:120px;">
                </div>
                <button class="btn btn-ghost" style="color:#ef4444;padding:4px 8px;"
                    data-wiz-action="remove-condition" data-index="${index}">✕</button>
            </div>
        `;
    }

    function buildConditionPreview() {
        const conds = wizardState.conditions;
        if (conds.length === 0) return 'Kein Filter – immer ausführen';

        const parts = conds.map(c => {
            const field = c.field || '?';
            const op = formatOperatorLabel(c.operator);
            const val = c.value || '?';
            return `<strong>${field}</strong> ${op} "<em>${val}</em>"`;
        });

        const joiner = wizardState.conditionLogic === 'or' ? ' <span class="text-yellow-400">ODER</span> ' : ' <span class="text-blue-400">UND</span> ';
        return parts.join(joiner);
    }

    function formatOperatorLabel(op) {
        const map = {
            equals: 'ist gleich',
            notEquals: 'ist ungleich',
            contains: 'enthält',
            notContains: 'enthält nicht',
            startsWith: 'beginnt mit',
            endsWith: 'endet mit',
            greaterThan: '>',
            lessThan: '<',
            greaterThanOrEqual: '>=',
            lessThanOrEqual: '<='
        };
        return map[op] || op;
    }

    // ===== STEP 4: Actions Builder =====

    function renderStep4(container) {
        container.innerHTML = `
            <div class="wizard-step-content">
                <h3 class="wizard-step-title">Schritt 4: Aktionen</h3>
                <p class="wizard-step-desc text-gray-400 mb-2">Lege fest, was passieren soll. Aktionen werden der Reihe nach ausgeführt.</p>
                <p class="text-xs text-gray-500 mb-4">Template-Variablen: ${TEMPLATE_VARS.map(v => `<code>${v}</code>`).join(', ')}</p>

                <div id="wizard-actions-list">
                    ${wizardState.actions.map((action, i) => renderActionCard(action, i)).join('')}
                </div>

                ${wizardState.actions.length === 0 ? '<p class="text-gray-500 text-sm mb-3">Noch keine Aktionen. Füge mindestens eine hinzu.</p>' : ''}

                <button class="btn btn-ghost mt-3" data-wiz-action="show-action-picker">
                    + Aktion hinzufügen
                </button>

                <!-- Action Picker -->
                <div id="wizard-action-picker" style="display:none;" class="mt-4 p-4 bg-gray-800 rounded-lg">
                    <h4 class="text-sm font-semibold mb-3 text-gray-200">Aktion auswählen:</h4>
                    <input type="text" class="form-input mb-3" placeholder="Aktionen suchen..."
                        data-wiz-filter-actions="">
                    <div id="wizard-action-picker-list" class="wizard-action-picker-grid">
                        ${renderActionPickerItems(wizardState.availableActions)}
                    </div>
                </div>
            </div>
        `;
    }

    function renderActionPickerItems(actions, filter = '') {
        const lf = filter.toLowerCase();
        const filtered = filter ? actions.filter(a =>
            a.name.toLowerCase().includes(lf) ||
            (a.description || '').toLowerCase().includes(lf) ||
            (a.category || '').toLowerCase().includes(lf)
        ) : actions;

        if (filtered.length === 0) return '<div class="text-gray-500 text-sm">Keine Aktionen gefunden.</div>';

        const grouped = groupBy(filtered, a => a.category || 'other');
        const catLabels = {
            tts: '🔊 TTS',
            alert: '🔔 Alert',
            audio: '🎵 Audio',
            overlay: '🖼️ Overlay',
            obs: '🎬 OBS',
            osc: '📡 OSC / VRChat',
            openshock: '⚡ OpenShock',
            logic: '🔀 Logik',
            integration: '🔗 Integrationen',
            utility: '🛠️ Hilfreich',
            plugin: '🔌 Plugin',
            goal: '🎯 Ziele',
            other: '📦 Sonstige'
        };

        return Object.entries(grouped).map(([cat, items]) => `
            <div class="mb-3">
                <div class="text-xs font-semibold text-gray-500 uppercase mb-1">${catLabels[cat] || cat}</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;">
                    ${items.map(a => `
                        <button class="wizard-action-option"
                            data-wiz-action="add-action" data-action-type="${escapeHtmlAttr(a.id)}"
                            title="${escapeHtmlAttr(a.description || '')}">
                            <span style="font-weight:600;">${escapeHtmlContent(a.name)}</span>
                            ${a.description ? `<span style="font-size:11px;color:#9ca3af;display:block;">${escapeHtmlContent(a.description.substring(0, 60))}${a.description.length > 60 ? '…' : ''}</span>` : ''}
                        </button>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }

    function renderActionCard(action, index) {
        const actionDef = wizardState.availableActions.find(a => a.id === action.type);
        const name = actionDef ? actionDef.name : action.type;
        const fields = actionDef ? (actionDef.fields || []) : [];
        const canMoveUp = index > 0;
        const canMoveDown = index < wizardState.actions.length - 1;

        return `
            <div class="wizard-action-card mb-3 p-3 bg-gray-800 rounded-lg border border-gray-600" id="wizard-action-${index}">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-semibold text-gray-200">${index + 1}. ${escapeHtmlContent(name)}</span>
                    <div style="display:flex;gap:4px;">
                        ${canMoveUp ? `<button class="btn btn-ghost" style="padding:2px 6px;font-size:12px;" data-wiz-action="move-action" data-index="${index}" data-direction="-1" title="Nach oben">▲</button>` : ''}
                        ${canMoveDown ? `<button class="btn btn-ghost" style="padding:2px 6px;font-size:12px;" data-wiz-action="move-action" data-index="${index}" data-direction="1" title="Nach unten">▼</button>` : ''}
                        <button class="btn btn-ghost" style="padding:2px 6px;color:#ef4444;" data-wiz-action="remove-action" data-index="${index}">✕</button>
                    </div>
                </div>
                ${renderActionFields(action, index, fields)}
            </div>
        `;
    }

    function renderActionFields(action, actionIndex, fields) {
        if (!fields || fields.length === 0) {
            // Render generic key-value editor for unknown actions
            return `<div class="text-gray-500 text-xs">Keine konfigurierbaren Felder.</div>`;
        }

        return fields.map(field => {
            const val = action[field.name] !== undefined ? action[field.name] : (field.default !== undefined ? field.default : '');
            const inputId = `wiz-action-${actionIndex}-${field.name}`;

            switch (field.type) {
                case 'textarea':
                    return `
                        <div class="form-group mb-2">
                            <label class="form-label text-xs" for="${inputId}">${escapeHtmlContent(field.label)}</label>
                            <textarea id="${inputId}" class="form-textarea" rows="2"
                                placeholder="${escapeHtmlAttr(field.placeholder || '')}"
                                data-wiz-action-field="${actionIndex}" data-key="${field.name}"
                                >${escapeHtmlContent(String(val))}</textarea>
                        </div>
                    `;
                case 'select':
                    return `
                        <div class="form-group mb-2">
                            <label class="form-label text-xs" for="${inputId}">${escapeHtmlContent(field.label)}</label>
                            <select id="${inputId}" class="form-select"
                                data-wiz-action-field="${actionIndex}" data-key="${field.name}">
                                ${(field.options || []).map(opt => {
                                    const optVal = typeof opt === 'object' ? opt.value : opt;
                                    const optLabel = typeof opt === 'object' ? opt.label : opt;
                                    return `<option value="${escapeHtmlAttr(String(optVal))}" ${String(val) === String(optVal) ? 'selected' : ''}>${escapeHtmlContent(optLabel)}</option>`;
                                }).join('')}
                            </select>
                        </div>
                    `;
                case 'checkbox':
                    return `
                        <div class="form-group mb-2">
                            <label class="form-label text-xs" style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                                <input type="checkbox" id="${inputId}"
                                    ${val ? 'checked' : ''}
                                    data-wiz-action-field="${actionIndex}" data-key="${field.name}"
                                    style="width:14px;height:14px;">
                                ${escapeHtmlContent(field.label)}
                            </label>
                        </div>
                    `;
                case 'number':
                    return `
                        <div class="form-group mb-2">
                            <label class="form-label text-xs" for="${inputId}">${escapeHtmlContent(field.label)}</label>
                            <input type="number" id="${inputId}" class="form-input"
                                value="${escapeHtmlAttr(String(val))}"
                                ${field.min !== undefined ? `min="${field.min}"` : ''}
                                ${field.max !== undefined ? `max="${field.max}"` : ''}
                                placeholder="${escapeHtmlAttr(field.placeholder || '')}"
                                data-wiz-action-field="${actionIndex}" data-key="${field.name}">
                        </div>
                    `;
                default: // text
                    return `
                        <div class="form-group mb-2">
                            <label class="form-label text-xs" for="${inputId}">${escapeHtmlContent(field.label)}</label>
                            <input type="text" id="${inputId}" class="form-input"
                                value="${escapeHtmlAttr(String(val))}"
                                placeholder="${escapeHtmlAttr(field.placeholder || '')}"
                                data-wiz-action-field="${actionIndex}" data-key="${field.name}">
                        </div>
                    `;
            }
        }).join('');
    }

    // ===== STEP 5: Options =====

    function renderStep5(container) {
        // Build condition summary
        const condSummary = wizardState.conditions.length > 0
            ? buildConditionPreview()
            : '<span class="text-gray-500">Keine Bedingung</span>';

        // Trigger name
        const triggerDef = wizardState.availableTriggers.find(t => t.id === wizardState.trigger_type);
        const triggerName = triggerDef ? triggerDef.name : (wizardState.trigger_type || '?');

        container.innerHTML = `
            <div class="wizard-step-content">
                <h3 class="wizard-step-title">Schritt 5: Optionen & Vorschau</h3>

                <div class="grid gap-4 mb-6" style="grid-template-columns:1fr 1fr;">
                    <div class="form-group">
                        <label class="form-label" for="wiz-cooldown">Cooldown (Sekunden)</label>
                        <input type="number" id="wiz-cooldown" class="form-input" min="0" max="3600"
                            value="${wizardState.cooldown}"
                            data-wiz-field="cooldown">
                        <p class="form-help">0 = kein Cooldown. Flow kann nicht schneller als alle N Sekunden auslösen.</p>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="wiz-priority">Priorität</label>
                        <select id="wiz-priority" class="form-select"
                            data-wiz-field="priority">
                            ${PRIORITY_OPTIONS.map(p => `
                                <option value="${p.value}" ${wizardState.priority === p.value ? 'selected' : ''}>${p.label}</option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <div class="p-4 bg-gray-800 rounded-lg border border-gray-600">
                    <h4 class="text-sm font-semibold text-gray-200 mb-3">📋 Flow-Zusammenfassung</h4>
                    <table class="w-full text-sm" style="border-collapse:collapse;">
                        <tr>
                            <td class="text-gray-400 pr-4 pb-2" style="width:120px;">Name:</td>
                            <td class="text-gray-100 pb-2"><strong>${escapeHtmlContent(wizardState.name || '(kein Name)')}</strong></td>
                        </tr>
                        ${wizardState.description ? `
                        <tr>
                            <td class="text-gray-400 pr-4 pb-2">Beschreibung:</td>
                            <td class="text-gray-100 pb-2">${escapeHtmlContent(wizardState.description)}</td>
                        </tr>
                        ` : ''}
                        <tr>
                            <td class="text-gray-400 pr-4 pb-2">Trigger:</td>
                            <td class="text-gray-100 pb-2">${escapeHtmlContent(triggerName)}</td>
                        </tr>
                        <tr>
                            <td class="text-gray-400 pr-4 pb-2">Bedingung:</td>
                            <td class="text-gray-100 pb-2">${condSummary}</td>
                        </tr>
                        <tr>
                            <td class="text-gray-400 pr-4 pb-2">Aktionen:</td>
                            <td class="text-gray-100 pb-2">
                                ${wizardState.actions.length === 0 ? '<span class="text-red-400">Keine Aktionen!</span>' :
                                    wizardState.actions.map((a, i) => {
                                        const def = wizardState.availableActions.find(x => x.id === a.type);
                                        return `<div>${i + 1}. ${escapeHtmlContent(def ? def.name : a.type)}</div>`;
                                    }).join('')
                                }
                            </td>
                        </tr>
                        <tr>
                            <td class="text-gray-400 pr-4 pb-2">Cooldown:</td>
                            <td class="text-gray-100 pb-2">${wizardState.cooldown > 0 ? `${wizardState.cooldown}s` : 'Kein'}</td>
                        </tr>
                        <tr>
                            <td class="text-gray-400 pr-4 pb-2">Status:</td>
                            <td class="pb-2">${wizardState.enabled ? '<span class="text-green-400">✅ Aktiviert</span>' : '<span class="text-gray-400">⏸️ Deaktiviert</span>'}</td>
                        </tr>
                    </table>
                </div>
            </div>
        `;
    }

    // ===== NAVIGATION =====

    function goToStep(step) {
        if (step < 1 || step > wizardState.totalSteps) return;
        // Allow jumping back freely, but forward only if validated
        if (step > wizardState.currentStep) {
            for (let s = wizardState.currentStep; s < step; s++) {
                if (!validateStep(s)) return;
            }
        }
        wizardState.currentStep = step;
        renderWizard();
    }

    function nextStep() {
        if (!validateStep(wizardState.currentStep)) return;
        if (wizardState.currentStep < wizardState.totalSteps) {
            wizardState.currentStep++;
            renderWizard();
        }
    }

    function prevStep() {
        if (wizardState.currentStep > 1) {
            wizardState.currentStep--;
            renderWizard();
        }
    }

    /**
     * Validate current step, show error if invalid
     * @param {number} step - Step number to validate
     * @returns {boolean} Valid or not
     */
    function validateStep(step) {
        switch (step) {
            case 1:
                if (!wizardState.name.trim()) {
                    showWizardError('Bitte gib einen Flow-Namen ein.');
                    return false;
                }
                return true;
            case 2:
                if (!wizardState.trigger_type) {
                    showWizardError('Bitte wähle einen Trigger aus.');
                    return false;
                }
                return true;
            case 3:
                return true; // Conditions are optional
            case 4:
                if (wizardState.actions.length === 0) {
                    showWizardError('Bitte füge mindestens eine Aktion hinzu.');
                    return false;
                }
                return true;
            case 5:
                return true;
            default:
                return true;
        }
    }

    function showWizardError(msg) {
        const container = document.getElementById('flow-wizard-content');
        if (!container) return;

        // Remove existing error
        const existing = container.querySelector('.wizard-error-banner');
        if (existing) existing.remove();

        const errEl = document.createElement('div');
        errEl.className = 'wizard-error-banner';
        errEl.style.cssText = 'background:#7f1d1d;color:#fca5a5;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:14px;';
        errEl.textContent = '⚠️ ' + msg;
        container.insertBefore(errEl, container.firstChild);

        setTimeout(() => errEl.remove(), 4000);
    }

    // ===== SAVE / TEST =====

    /**
     * Build the flow object from wizard state
     */
    function buildFlowObject() {
        let trigger_condition = null;

        if (wizardState.conditions.length === 1) {
            const c = wizardState.conditions[0];
            if (c.field && c.operator) {
                trigger_condition = { field: c.field, operator: c.operator, value: c.value };
            }
        } else if (wizardState.conditions.length > 1) {
            const validConds = wizardState.conditions.filter(c => c.field && c.operator);
            if (validConds.length > 0) {
                trigger_condition = {
                    logic: wizardState.conditionLogic,
                    conditions: validConds.map(c => ({ field: c.field, operator: c.operator, value: c.value }))
                };
            }
        }

        return {
            name: wizardState.name.trim(),
            description: wizardState.description.trim(),
            trigger_type: wizardState.trigger_type,
            trigger_condition,
            actions: wizardState.actions,
            enabled: wizardState.enabled,
            cooldown: wizardState.cooldown,
            priority: wizardState.priority
        };
    }

    async function saveFlow() {
        // Validate all steps before saving
        for (let s = 1; s <= 4; s++) {
            if (!validateStep(s)) {
                wizardState.currentStep = s;
                renderWizard();
                return;
            }
        }

        const flow = buildFlowObject();

        try {
            let response;
            if (wizardState.editFlowId) {
                response = await fetch(`/api/flows/${wizardState.editFlowId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(flow)
                });
            } else {
                response = await fetch('/api/flows', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(flow)
                });
            }

            const result = await response.json();

            if (result.success) {
                closeWizard();
                // Refresh flows list if loadFlows function is available
                if (typeof window.loadFlows === 'function') {
                    window.loadFlows();
                }
            } else {
                showWizardError('Fehler beim Speichern: ' + (result.error || 'Unbekannter Fehler'));
            }
        } catch (err) {
            console.error('Flow Wizard: Error saving flow', err);
            showWizardError('Netzwerkfehler beim Speichern.');
        }
    }

    async function testFlow() {
        if (!wizardState.editFlowId) {
            showWizardError('Flow muss zuerst gespeichert werden, um getestet zu werden.');
            return;
        }

        try {
            const response = await fetch(`/api/flows/${wizardState.editFlowId}/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const result = await response.json();
            if (result.success) {
                const btn = document.getElementById('wizard-test-btn');
                if (btn) {
                    btn.textContent = '✅ Getestet!';
                    setTimeout(() => { btn.textContent = '🧪 Testen'; }, 2000);
                }
            } else {
                showWizardError('Test fehlgeschlagen: ' + (result.error || 'Fehler'));
            }
        } catch (err) {
            showWizardError('Fehler beim Testen des Flows.');
        }
    }

    // ===== INTERNAL STATE UPDATERS =====

    function _updateState(key, value) {
        wizardState[key] = value;
    }

    function _selectTrigger(id) {
        wizardState.trigger_type = id;
        // Re-render step 2 to update selected state
        const container = document.getElementById('flow-wizard-content');
        if (container) renderStep2(container);
    }

    function _addCondition() {
        wizardState.conditions.push({ field: '', operator: 'equals', value: '' });
        const container = document.getElementById('flow-wizard-content');
        if (container) renderStep3(container);
    }

    function _removeCondition(index) {
        wizardState.conditions.splice(index, 1);
        const container = document.getElementById('flow-wizard-content');
        if (container) renderStep3(container);
    }

    function _updateCondition(index, key, value) {
        if (wizardState.conditions[index]) {
            wizardState.conditions[index][key] = value;
        }
    }

    function _showActionPicker() {
        const picker = document.getElementById('wizard-action-picker');
        if (picker) {
            picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
        }
    }

    function _filterActions(filter) {
        const list = document.getElementById('wizard-action-picker-list');
        if (list) {
            list.innerHTML = renderActionPickerItems(wizardState.availableActions, filter);
        }
    }

    function _addAction(actionType) {
        const def = wizardState.availableActions.find(a => a.id === actionType);
        // Build default action with default field values
        const action = { type: actionType };
        if (def && def.fields) {
            def.fields.forEach(f => {
                if (f.default !== undefined) {
                    action[f.name] = f.default;
                }
            });
        }
        wizardState.actions.push(action);

        // Re-render actions step
        const container = document.getElementById('flow-wizard-content');
        if (container) renderStep4(container);
    }

    function _removeAction(index) {
        wizardState.actions.splice(index, 1);
        const container = document.getElementById('flow-wizard-content');
        if (container) renderStep4(container);
    }

    function _moveAction(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= wizardState.actions.length) return;
        const tmp = wizardState.actions[index];
        wizardState.actions[index] = wizardState.actions[newIndex];
        wizardState.actions[newIndex] = tmp;
        const container = document.getElementById('flow-wizard-content');
        if (container) renderStep4(container);
    }

    function _updateAction(actionIndex, key, value) {
        if (wizardState.actions[actionIndex]) {
            wizardState.actions[actionIndex][key] = value;
        }
    }

    // ===== UTILITIES =====

    function groupBy(arr, keyFn) {
        return arr.reduce((acc, item) => {
            const key = keyFn(item);
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {});
    }

    function escapeHtmlAttr(text) {
        if (typeof text !== 'string') text = String(text);
        return text
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeHtmlContent(text) {
        if (typeof text !== 'string') text = String(text);
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // ===== EVENT DELEGATION =====

    /**
     * Handles input/change events on wizard form fields using data-* attributes.
     * Extracted as a module-level function for maintainability.
     * @param {HTMLElement} target - The event target element
     */
    function handleWizFieldChange(target) {
        if (target.dataset.wizField) {
            const field = target.dataset.wizField;
            let value;
            if (target.type === 'checkbox') {
                value = target.checked;
            } else if (target.type === 'number') {
                value = parseFloat(target.value) || 0;
            } else {
                value = target.value;
            }
            _updateState(field, value);
        }

        if (target.dataset.wizCondition !== undefined) {
            const index = parseInt(target.dataset.wizCondition);
            const key = target.dataset.key;
            _updateCondition(index, key, target.value);
        }

        if (target.dataset.wizActionField !== undefined) {
            const actionIndex = parseInt(target.dataset.wizActionField);
            const key = target.dataset.key;
            const value = target.type === 'checkbox' ? target.checked :
                target.type === 'number' ? (parseFloat(target.value) || 0) : target.value;
            _updateAction(actionIndex, key, value);
        }

        if (target.dataset.wizFilterActions !== undefined) {
            _filterActions(target.value);
        }
    }

    /**
     * Initialize event delegation for wizard modal
     * Replaces all inline onclick/oninput/onchange handlers
     */
    function initWizardEventDelegation() {
        const modal = document.getElementById('flow-wizard-modal');
        if (!modal) return;

        modal.addEventListener('click', (e) => {
            const target = e.target.closest('[data-wiz-action]');
            if (!target) return;

            const action = target.dataset.wizAction;

            switch (action) {
                case 'go-to-step':
                    goToStep(parseInt(target.dataset.step));
                    break;
                case 'prev-step':
                    prevStep();
                    break;
                case 'next-step':
                    nextStep();
                    break;
                case 'save-flow':
                    saveFlow();
                    break;
                case 'test-flow':
                    testFlow();
                    break;
                case 'select-trigger':
                    _selectTrigger(target.dataset.triggerId);
                    break;
                case 'add-condition':
                    _addCondition();
                    break;
                case 'remove-condition':
                    _removeCondition(parseInt(target.dataset.index));
                    break;
                case 'show-action-picker':
                    _showActionPicker();
                    break;
                case 'add-action':
                    _addAction(target.dataset.actionType);
                    break;
                case 'remove-action':
                    _removeAction(parseInt(target.dataset.index));
                    break;
                case 'move-action':
                    _moveAction(parseInt(target.dataset.index), parseInt(target.dataset.direction));
                    break;
            }
        });

        modal.addEventListener('input', (e) => {
            handleWizFieldChange(e.target);
        });

        modal.addEventListener('change', (e) => {
            handleWizFieldChange(e.target);
        });
    }

    // Initialize event delegation once DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWizardEventDelegation);
    } else {
        initWizardEventDelegation();
    }

    // ===== PUBLIC API =====

    window.FlowWizard = {
        open: openWizard,
        close: closeWizard,
        goToStep,
        nextStep,
        prevStep,
        saveFlow,
        testFlow,
        _updateState,
        _selectTrigger,
        _addCondition,
        _removeCondition,
        _updateCondition,
        _showActionPicker,
        _filterActions,
        _addAction,
        _removeAction,
        _moveAction,
        _updateAction
    };

})();
