function patternEditorText(key, fallback, params = {}) {
    return typeof window.OpenShockPatternI18n === 'function'
        ? window.OpenShockPatternI18n(key, fallback, params)
        : fallback;
}

/**
 * @file LiveControls.tsx.js - Live Controls Component
 * @description Test/Loop buttons and shocker selector
 */

class LiveControls {
    constructor(containerElement, store, apiClient) {
        this.container = containerElement;
        this.store = store;
        this.apiClient = apiClient;
        this.unsubscribe = null;
        this.patternEngine = null;
        this.loopTimeout = null;
        this.devices = [];
    }

    /**
     * Initialize the component
     */
    init() {
        this.render();
        
        // Subscribe to store changes
        this.unsubscribe = this.store.subscribe((state) => {
            this.render();
        });
    }

    /**
     * Set available devices
     */
    setDevices(devices) {
        this.devices = devices;
        this.render();
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        
        if (this.patternEngine) {
            this.patternEngine.stop();
        }
        
        if (this.loopTimeout) {
            clearTimeout(this.loopTimeout);
        }
    }

    /**
     * Render the component
     */
    render() {
        const state = this.store.getState();
        const pattern = state.selectedPattern;

        this.container.innerHTML = `
            <div class="live-controls">
                <h3 class="text-lg font-semibold text-white mb-3">🎮 ${patternEditorText('live.title', 'Live controls')}</h3>

                <!-- Shocker Selection -->
                <div class="form-group">
                    <label class="form-label">${patternEditorText('live.shocker_selection', 'Shocker selection (multiple)')}</label>
                    <select multiple id="shockerSelect" class="form-select" size="4">
                        ${this._renderShockerOptions()}
                    </select>
                    <small class="text-gray-400">${patternEditorText('live.multi_select_hint', 'Hold Ctrl/Cmd to select multiple')}</small>
                </div>

                <!-- Preview -->
                ${pattern ? `
                    <div class="pattern-preview-live">
                        <canvas id="livePreviewCanvas" width="400" height="100"></canvas>
                        <div class="live-preview-info">
                            <span class="text-gray-400">${patternEditorText('live.duration', 'Duration: {duration}', { duration: this._formatDuration(pattern.duration) })}</span>
                        </div>
                    </div>
                ` : ''}

                <!-- Control Buttons -->
                <div class="btn-group-vertical">
                    <button class="btn btn-success btn-lg" id="testBtn" 
                            ${!pattern || state.selectedShockers.length === 0 ? 'disabled' : ''}>
                        ▶️ ${patternEditorText('live.play_test', 'Play test')}
                    </button>
                    
                    <button class="btn ${state.isLooping ? 'btn-danger' : 'btn-primary'} btn-lg" id="loopBtn"
                            ${!pattern || state.selectedShockers.length === 0 ? 'disabled' : ''}>
                        ${state.isLooping ? `⏸️ ${patternEditorText('live.stop_loop', 'Stop loop')}` : `🔁 ${patternEditorText('live.loop', 'Loop')}`}
                    </button>
                    
                    <button class="btn btn-danger" id="stopBtn" ${!state.isPlaying ? 'disabled' : ''}>
                        ⏹️ ${patternEditorText('live.stop', 'Stop')}
                    </button>
                </div>

                <!-- Status -->
                <div class="live-status">
                    <div class="status-item">
                        <span class="status-label">${patternEditorText('live.status', 'Status:')}</span>
                        <span class="status-value ${state.isPlaying ? 'text-green-400' : 'text-gray-400'}">
                            ${state.isPlaying ? `▶️ ${patternEditorText('live.playing', 'Playing')}` : `⏸️ ${patternEditorText('live.ready', 'Ready')}`}
                        </span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">${patternEditorText('live.shockers', 'Shockers:')}</span>
                        <span class="status-value">${patternEditorText('live.selected_count', '{count} selected', { count: state.selectedShockers.length })}</span>
                    </div>
                </div>
            </div>
        `;

        this._attachEventListeners();
        
        if (pattern) {
            this._startPreviewAnimation();
        }
    }

    /**
     * Render shocker options
     * @private
     */
    _renderShockerOptions() {
        if (this.devices.length === 0) {
            return `<option disabled>${patternEditorText('live.no_devices', 'No devices connected')}</option>`;
        }

        const state = this.store.getState();
        const options = [];

        for (const device of this.devices) {
            for (const shocker of device.shockers) {
                const selected = state.selectedShockers.includes(shocker.id);
                options.push(`
                    <option value="${shocker.id}" ${selected ? 'selected' : ''}>
                        ${device.name} - ${shocker.name || patternEditorText('live.shocker_fallback', 'Shocker {id}', { id: shocker.id })}
                    </option>
                `);
            }
        }

        return options.join('');
    }

    /**
     * Attach event listeners
     * @private
     */
    _attachEventListeners() {
        // Shocker selection
        const shockerSelect = this.container.querySelector('#shockerSelect');
        if (shockerSelect) {
            shockerSelect.addEventListener('change', (e) => {
                const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
                this.store.setSelectedShockers(selected);
            });
        }

        // Test button
        const testBtn = this.container.querySelector('#testBtn');
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                this._playPattern(false);
            });
        }

        // Loop button
        const loopBtn = this.container.querySelector('#loopBtn');
        if (loopBtn) {
            loopBtn.addEventListener('click', () => {
                const state = this.store.getState();
                if (state.isLooping) {
                    this._stopLoop();
                } else {
                    this._playPattern(true);
                }
            });
        }

        // Stop button
        const stopBtn = this.container.querySelector('#stopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this._stopPlayback();
            });
        }
    }

    /**
     * Play pattern
     * @private
     */
    async _playPattern(loop = false) {
        const state = this.store.getState();
        const pattern = state.selectedPattern;

        if (!pattern || state.selectedShockers.length === 0) {
            alert(patternEditorText('live.selection_required', 'Select a pattern and at least one shocker.'));
            return;
        }

        if (!this.apiClient) {
            alert(patternEditorText('live.api_unavailable', 'API client unavailable. Connect first.'));
            return;
        }

        this.store.setPlaying(true);
        this.store.setLooping(loop);

        // Create pattern engine
        const PatternEngine = window.PatternEngine;
        this.patternEngine = new PatternEngine(pattern, async (intensity) => {
            await this._sendIntensity(intensity);
        });

        // Play pattern
        this.patternEngine.play();

        // Wait for pattern to complete
        const duration = pattern.duration;
        
        if (loop) {
            // Schedule next loop
            this.loopTimeout = setTimeout(() => {
                if (this.store.getState().isLooping) {
                    this._playPattern(true); // Continue looping
                }
            }, duration);
        } else {
            // Stop after completion
            setTimeout(() => {
                this._stopPlayback();
            }, duration);
        }
    }

    /**
     * Send intensity to selected shockers
     * @private
     */
    async _sendIntensity(intensity) {
        if (!this.apiClient) return;

        const state = this.store.getState();
        const shockerIds = state.selectedShockers;

        if (shockerIds.length === 0) return;

        // Determine control type based on intensity
        // For pattern playback, we'll use vibration as it's safer for continuous control
        const type = intensity > 0 ? 2 : 0; // 2 = Vibrate, 0 = Stop
        const duration = 100; // Short duration for real-time control

        try {
            await Promise.all(
                shockerIds.map(shockerId => 
                    this.apiClient.sendControl(shockerId, type, Math.round(intensity), duration)
                )
            );
        } catch (error) {
            console.error('Error sending intensity:', error);
        }
    }

    /**
     * Stop loop
     * @private
     */
    _stopLoop() {
        this.store.setLooping(false);
        
        if (this.loopTimeout) {
            clearTimeout(this.loopTimeout);
            this.loopTimeout = null;
        }
    }

    /**
     * Stop playback
     * @private
     */
    _stopPlayback() {
        this.store.setPlaying(false);
        this._stopLoop();

        if (this.patternEngine) {
            this.patternEngine.stop();
            this.patternEngine = null;
        }

        // Send stop command to all selected shockers
        const state = this.store.getState();
        if (this.apiClient && state.selectedShockers.length > 0) {
            state.selectedShockers.forEach(async (shockerId) => {
                try {
                    await this.apiClient.sendControl(shockerId, 0, 0, 100);
                } catch (error) {
                    console.error('Error stopping shocker:', error);
                }
            });
        }
    }

    /**
     * Start preview animation
     * @private
     */
    _startPreviewAnimation() {
        const canvas = this.container.querySelector('#livePreviewCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const state = this.store.getState();
        const pattern = state.selectedPattern;

        if (!pattern) return;

        // Create pattern engine for preview
        const PatternEngine = window.PatternEngine;
        let engine;
        
        try {
            engine = new PatternEngine(pattern, () => {});
        } catch (error) {
            console.error('Failed to create pattern engine:', error);
            return;
        }

        const animate = () => {
            const width = canvas.width;
            const height = canvas.height;

            // Clear
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, width, height);

            // Draw waveform
            ctx.strokeStyle = '#00d4ff';
            ctx.lineWidth = 2;
            ctx.beginPath();

            const samples = 100;
            for (let i = 0; i <= samples; i++) {
                const time = (i / samples) * pattern.duration;
                const intensity = engine._getIntensityAtTime(time);
                const x = (i / samples) * width;
                const y = height - (intensity / 100) * height;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            // Draw timeline
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 10; i++) {
                const x = (i / 10) * width;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
        };

        animate();
    }

    /**
     * Format duration
     * @private
     */
    _formatDuration(ms) {
        if (ms < 1000) {
            return `${ms}ms`;
        } else {
            return `${(ms / 1000).toFixed(1)}s`;
        }
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.LiveControls = LiveControls;
}
