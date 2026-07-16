function patternEditorText(key, fallback, params = {}) {
    return typeof window.OpenShockPatternI18n === 'function'
        ? window.OpenShockPatternI18n(key, fallback, params)
        : fallback;
}

/**
 * @file ParameterEditor.tsx.js - Parameter Editor Component
 * @description Contextual parameter controls for preset patterns
 */

class ParameterEditor {
    constructor(containerElement, store) {
        this.container = containerElement;
        this.store = store;
        this.unsubscribe = null;
    }

    /**
     * Initialize the component
     */
    init() {
        this.render();
        
        // Subscribe to store changes
        this.unsubscribe = this.store.subscribe((state) => {
            if (state.currentView === 'parameter') {
                this.render();
            }
        });
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

    /**
     * Render the component
     */
    render() {
        const state = this.store.getState();
        const pattern = state.selectedPattern;

        if (!pattern) {
            this.container.innerHTML = `
                <div class="empty-state">
                    <p class="text-gray-400 text-center py-8">${patternEditorText('parameter.empty', 'Choose a pattern from the library')}</p>
                </div>
            `;
            return;
        }

        const presetDef = this._getPresetDefinition(pattern.sourcePreset);

        this.container.innerHTML = `
            <div class="parameter-editor">
                <div class="parameter-editor-header">
                    <h3 class="text-xl font-bold text-white mb-2">${this._escapeHtml(pattern.name)}</h3>
                    <p class="text-gray-400 mb-4">${presetDef ? presetDef.description : patternEditorText('parameter.custom_pattern', 'Custom pattern')}</p>
                </div>

                ${pattern.type === 'preset' ? this._renderPresetControls(pattern, presetDef) : ''}

                <div class="parameter-editor-actions">
                    <button class="btn btn-primary btn-block" id="expertModeBtn">
                        🔧 ${patternEditorText('parameter.expert_mode', 'Expert mode (keyframe editor)')}
                    </button>
                    
                    <button class="btn btn-success btn-block" id="savePatternBtn">
                        💾 ${patternEditorText('parameter.save_as_own', 'Save as own pattern')}
                    </button>

                    <button class="btn btn-secondary btn-block" id="backToLibraryBtn">
                        ← ${patternEditorText('parameter.back_to_library', 'Back to library')}
                    </button>
                </div>
            </div>
        `;

        this._attachEventListeners();
    }

    /**
     * Render preset controls
     * @private
     */
    _renderPresetControls(pattern, presetDef) {
        if (!presetDef || !presetDef.paramDefinitions) {
            return '';
        }

        return `
            <div class="parameter-controls">
                <h4 class="text-lg font-semibold text-white mb-3">${patternEditorText('parameter.customization', 'Customization')}</h4>
                ${presetDef.paramDefinitions.map(paramDef => 
                    this._renderParameter(paramDef, pattern.params[paramDef.key])
                ).join('')}
            </div>
        `;
    }

    /**
     * Render a single parameter control
     * @private
     */
    _renderParameter(paramDef, currentValue) {
        const value = currentValue !== undefined ? currentValue : paramDef.defaultValue;

        if (paramDef.type === 'slider') {
            return `
                <div class="form-group">
                    <div class="slider-label">
                        <label class="form-label">${paramDef.label}</label>
                        <span class="slider-value" id="${paramDef.key}-value">${value}${paramDef.unit}</span>
                    </div>
                    <div class="slider-container">
                        <input 
                            type="range" 
                            class="slider" 
                            id="${paramDef.key}"
                            data-param="${paramDef.key}"
                            data-unit="${paramDef.unit}"
                            min="${paramDef.min}" 
                            max="${paramDef.max}" 
                            step="${paramDef.step}" 
                            value="${value}">
                        <input 
                            type="number" 
                            class="form-input number-input" 
                            id="${paramDef.key}-number"
                            data-param="${paramDef.key}"
                            data-unit="${paramDef.unit}"
                            min="${paramDef.min}" 
                            max="${paramDef.max}" 
                            step="${paramDef.step}" 
                            value="${value}">
                    </div>
                </div>
            `;
        } else if (paramDef.type === 'number') {
            return `
                <div class="form-group">
                    <label class="form-label">${paramDef.label}</label>
                    <div class="input-with-unit">
                        <input 
                            type="number" 
                            class="form-input" 
                            id="${paramDef.key}"
                            data-param="${paramDef.key}"
                            data-unit="${paramDef.unit}"
                            min="${paramDef.min}" 
                            max="${paramDef.max}" 
                            step="${paramDef.step}" 
                            value="${value}">
                        <span class="input-unit">${paramDef.unit}</span>
                    </div>
                </div>
            `;
        }

        return '';
    }

    /**
     * Get preset definition
     * @private
     */
    _getPresetDefinition(presetName) {
        const presets = {
            'Konstant': {
                description: patternEditorText('parameter.presets.constant.description', 'A constant intensity over time'),
                paramDefinitions: [
                    {
                        key: 'intensity',
                        label: patternEditorText('parameter.labels.intensity', 'Intensity'),
                        type: 'slider',
                        min: 0,
                        max: 100,
                        step: 1,
                        defaultValue: 50,
                        unit: '%'
                    }
                ]
            },
            'Rampe': {
                description: patternEditorText('parameter.presets.ramp.description', 'Linearly rising or falling intensity'),
                paramDefinitions: [
                    {
                        key: 'startIntensity',
                        label: patternEditorText('parameter.labels.start_intensity', 'Start intensity'),
                        type: 'slider',
                        min: 0,
                        max: 100,
                        step: 1,
                        defaultValue: 0,
                        unit: '%'
                    },
                    {
                        key: 'endIntensity',
                        label: patternEditorText('parameter.labels.end_intensity', 'End intensity'),
                        type: 'slider',
                        min: 0,
                        max: 100,
                        step: 1,
                        defaultValue: 100,
                        unit: '%'
                    },
                    {
                        key: 'duration',
                        label: patternEditorText('parameter.labels.duration', 'Duration'),
                        type: 'number',
                        min: 300,
                        max: 30000,
                        step: 100,
                        defaultValue: 5000,
                        unit: 'ms'
                    }
                ]
            },
            'Puls': {
                description: patternEditorText('parameter.presets.pulse.description', 'Repeating pulses with pauses'),
                paramDefinitions: [
                    {
                        key: 'intensity',
                        label: patternEditorText('parameter.labels.intensity', 'Intensity'),
                        type: 'slider',
                        min: 0,
                        max: 100,
                        step: 1,
                        defaultValue: 50,
                        unit: '%'
                    },
                    {
                        key: 'pulseDuration',
                        label: patternEditorText('parameter.labels.pulse_duration', 'Pulse duration'),
                        type: 'number',
                        min: 100,
                        max: 5000,
                        step: 50,
                        defaultValue: 500,
                        unit: 'ms'
                    },
                    {
                        key: 'pauseDuration',
                        label: patternEditorText('parameter.labels.pause_duration', 'Pause duration'),
                        type: 'number',
                        min: 100,
                        max: 5000,
                        step: 50,
                        defaultValue: 500,
                        unit: 'ms'
                    }
                ]
            },
            'Welle': {
                description: patternEditorText('parameter.presets.wave.description', 'Sine wave form'),
                paramDefinitions: [
                    {
                        key: 'minIntensity',
                        label: patternEditorText('parameter.labels.minimum_intensity', 'Minimum intensity'),
                        type: 'slider',
                        min: 0,
                        max: 100,
                        step: 1,
                        defaultValue: 0,
                        unit: '%'
                    },
                    {
                        key: 'maxIntensity',
                        label: patternEditorText('parameter.labels.maximum_intensity', 'Maximum intensity'),
                        type: 'slider',
                        min: 0,
                        max: 100,
                        step: 1,
                        defaultValue: 100,
                        unit: '%'
                    },
                    {
                        key: 'frequency',
                        label: patternEditorText('parameter.labels.frequency', 'Frequency'),
                        type: 'slider',
                        min: 0.1,
                        max: 5,
                        step: 0.1,
                        defaultValue: 1,
                        unit: 'Hz'
                    }
                ]
            },
            'Zufall': {
                description: patternEditorText('parameter.presets.random.description', 'Random intensity values'),
                paramDefinitions: [
                    {
                        key: 'minIntensity',
                        label: patternEditorText('parameter.labels.minimum_intensity', 'Minimum intensity'),
                        type: 'slider',
                        min: 0,
                        max: 100,
                        step: 1,
                        defaultValue: 0,
                        unit: '%'
                    },
                    {
                        key: 'maxIntensity',
                        label: patternEditorText('parameter.labels.maximum_intensity', 'Maximum intensity'),
                        type: 'slider',
                        min: 0,
                        max: 100,
                        step: 1,
                        defaultValue: 100,
                        unit: '%'
                    },
                    {
                        key: 'frequency',
                        label: patternEditorText('parameter.labels.update_frequency', 'Update frequency'),
                        type: 'slider',
                        min: 0.5,
                        max: 10,
                        step: 0.5,
                        defaultValue: 2,
                        unit: 'Hz'
                    }
                ]
            }
        };

        return presets[presetName] || null;
    }

    /**
     * Attach event listeners
     * @private
     */
    _attachEventListeners() {
        // Parameter changes
        this.container.querySelectorAll('[data-param]').forEach(input => {
            input.addEventListener('input', (e) => {
                const param = e.target.dataset.param;
                const unit = e.target.dataset.unit;
                const value = parseFloat(e.target.value);

                // Update display value
                const valueDisplay = document.getElementById(`${param}-value`);
                if (valueDisplay) {
                    valueDisplay.textContent = `${value}${unit}`;
                }

                // Sync slider and number input
                const slider = document.getElementById(param);
                const numberInput = document.getElementById(`${param}-number`);
                if (slider && numberInput) {
                    slider.value = value;
                    numberInput.value = value;
                }

                // Update store
                this.store.updatePatternParams({ [param]: value });
            });
        });

        // Expert mode button
        const expertModeBtn = this.container.querySelector('#expertModeBtn');
        if (expertModeBtn) {
            expertModeBtn.addEventListener('click', () => {
                this.store.enableExpertMode();
            });
        }

        // Save pattern button
        const savePatternBtn = this.container.querySelector('#savePatternBtn');
        if (savePatternBtn) {
            savePatternBtn.addEventListener('click', () => {
                const name = prompt(patternEditorText('parameter.name_prompt', 'Pattern name:'), patternEditorText('parameter.default_name', 'My pattern'));
                if (name) {
                    this.store.saveAsUserPattern(name);
                    alert(patternEditorText('parameter.saved', 'Pattern saved!'));
                }
            });
        }

        // Back to library button
        const backBtn = this.container.querySelector('#backToLibraryBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.store.setCurrentView('library');
                this.store.selectPattern(null);
            });
        }
    }

    /**
     * Escape HTML
     * @private
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.ParameterEditor = ParameterEditor;
}
