/**
 * @file PatternLibrary.tsx.js - Pattern Library Component
 * @description Displays preset and user patterns in a grid with animated previews
 */

class PatternLibrary {
    constructor(containerElement, store) {
        this.container = containerElement;
        this.store = store;
        this.unsubscribe = null;
        
        // Animation canvases for previews
        this.previewCanvases = new Map();
        this.animationFrames = new Map();
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
     * Cleanup
     */
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        
        // Stop all animations
        this.animationFrames.forEach(frameId => cancelAnimationFrame(frameId));
        this.animationFrames.clear();
        this.previewCanvases.clear();
    }

    /**
     * Render the component
     */
    render() {
        const state = this.store.getState();
        
        this.container.innerHTML = `
            <div class="pattern-library">
                <div class="pattern-library-header">
                    <h2 class="text-2xl font-bold text-white mb-2">Pattern Bibliothek</h2>
                    <p class="text-gray-400 mb-4">Wähle ein Preset oder erstelle ein eigenes Pattern</p>
                </div>

                <!-- Default Presets -->
                <div class="mb-6">
                    <h3 class="text-lg font-semibold text-white mb-3">📦 Standard Presets</h3>
                    <div class="pattern-grid">
                        ${state.defaultPresets.map(pattern => this._renderPatternCard(pattern)).join('')}
                    </div>
                </div>

                <!-- User Patterns -->
                <div class="mb-6">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="text-lg font-semibold text-white">✨ Meine Patterns</h3>
                        <button class="btn btn-sm btn-success" id="createNewPattern">
                            ➕ Neu erstellen
                        </button>
                    </div>
                    <div class="pattern-grid">
                        ${state.userPatterns.length > 0 
                            ? state.userPatterns.map(pattern => this._renderPatternCard(pattern, true)).join('')
                            : '<p class="text-gray-500 text-center col-span-full py-8">Noch keine eigenen Patterns. Erstelle dein erstes Pattern!</p>'
                        }
                    </div>
                </div>
            </div>
        `;

        // Attach event listeners
        this._attachEventListeners();
        
        // Start preview animations
        this._startPreviewAnimations();
    }

    /**
     * Render a pattern card
     * @private
     */
    _renderPatternCard(pattern, isUserPattern = false) {
        const presetInfo = this._getPresetInfo(pattern.sourcePreset);
        const icon = presetInfo?.icon || '🎵';
        
        return `
            <div class="pattern-card ${pattern.id === this.store.getState().selectedPattern?.id ? 'selected' : ''}"
                 data-pattern-id="${pattern.id}">
                <div class="pattern-card-header">
                    <span class="pattern-icon">${icon}</span>
                    <h4 class="pattern-name">${this._escapeHtml(pattern.name)}</h4>
                </div>
                
                <div class="pattern-preview">
                    <canvas 
                        class="pattern-preview-canvas" 
                        id="preview-${pattern.id}"
                        width="200" 
                        height="80">
                    </canvas>
                </div>
                
                <div class="pattern-card-footer">
                    <span class="pattern-duration">${this._formatDuration(pattern.duration)}</span>
                    ${isUserPattern ? `
                        <div class="pattern-actions">
                            <button class="btn-icon" data-action="edit" data-pattern-id="${pattern.id}" title="Bearbeiten">
                                ✏️
                            </button>
                            <button class="btn-icon" data-action="delete" data-pattern-id="${pattern.id}" title="Löschen">
                                🗑️
                            </button>
                        </div>
                    ` : ''}
                </div>
                
                <button class="btn btn-primary btn-block mt-2" data-action="select" data-pattern-id="${pattern.id}">
                    Auswählen
                </button>
            </div>
        `;
    }

    /**
     * Get preset information
     * @private
     */
    _getPresetInfo(presetName) {
        const presets = {
            'Konstant': { icon: '📊', description: 'Konstante Intensität' },
            'Rampe': { icon: '📈', description: 'Linear ansteigend' },
            'Puls': { icon: '💓', description: 'Wiederkehrende Pulse' },
            'Welle': { icon: '🌊', description: 'Sinuswelle' },
            'Zufall': { icon: '🎲', description: 'Zufällig' }
        };
        return presets[presetName] || null;
    }

    /**
     * Attach event listeners
     * @private
     */
    _attachEventListeners() {
        // Select pattern
        this.container.querySelectorAll('[data-action="select"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const patternId = e.target.dataset.patternId;
                this.store.selectPattern(patternId);
            });
        });

        // Edit pattern
        this.container.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const patternId = e.target.dataset.patternId;
                this.store.selectPattern(patternId);
                this.store.enableExpertMode();
            });
        });

        // Delete pattern
        this.container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const patternId = e.target.dataset.patternId;
                if (confirm('Möchten Sie dieses Pattern wirklich löschen?')) {
                    this.store.deleteUserPattern(patternId);
                }
            });
        });

        // Create new pattern
        const createBtn = this.container.querySelector('#createNewPattern');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                // Create a blank custom pattern
                const newPattern = {
                    id: this.store._generateId(),
                    name: 'Neues Pattern',
                    type: 'custom',
                    keyframes: [
                        { time: 0, intensity: 0, interpolation: 'Linear' },
                        { time: 5000, intensity: 100, interpolation: 'Linear' }
                    ],
                    duration: 5000,
                    isUserPattern: true,
                    createdAt: new Date().toISOString()
                };
                
                this.store.setState({
                    selectedPattern: newPattern,
                    currentView: 'keyframe',
                    isExpertMode: true,
                    keyframes: newPattern.keyframes
                });
            });
        }
    }

    /**
     * Start preview animations for all patterns
     * @private
     */
    _startPreviewAnimations() {
        const state = this.store.getState();
        const allPatterns = [...state.defaultPresets, ...state.userPatterns];
        
        allPatterns.forEach(pattern => {
            const canvas = document.getElementById(`preview-${pattern.id}`);
            if (canvas) {
                this._animatePreview(canvas, pattern);
            }
        });
    }

    /**
     * Animate a pattern preview
     * @private
     */
    _animatePreview(canvas, pattern) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const duration = pattern.duration || 5000;
        
        // Create a pattern engine instance for preview
        const PatternEngine = window.PatternEngine;
        let engine;
        
        try {
            engine = new PatternEngine(pattern, () => {});
        } catch (error) {
            console.error('Failed to create pattern engine for preview:', error);
            return;
        }

        const startTime = performance.now();
        
        const animate = () => {
            const elapsed = (performance.now() - startTime) % (duration + 1000); // Loop with 1s pause
            const time = Math.min(elapsed, duration);
            
            // Clear canvas
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, width, height);
            
            // Draw grid lines
            ctx.strokeStyle = '#2a2a3e';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = (height / 4) * i;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
            
            // Draw pattern curve
            ctx.strokeStyle = '#00d4ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            const samples = 100;
            for (let i = 0; i <= samples; i++) {
                const t = (i / samples) * duration;
                const intensity = engine._getIntensityAtTime(t);
                const x = (t / duration) * width;
                const y = height - (intensity / 100) * height;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            
            // Draw current position indicator
            if (elapsed < duration) {
                const x = (time / duration) * width;
                const currentIntensity = engine._getIntensityAtTime(time);
                const y = height - (currentIntensity / 100) * height;
                
                // Vertical line
                ctx.strokeStyle = '#ff6b6b';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
                
                // Current point
                ctx.fillStyle = '#ff6b6b';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Continue animation
            const frameId = requestAnimationFrame(animate);
            this.animationFrames.set(pattern.id, frameId);
        };
        
        animate();
    }

    /**
     * Format duration in ms to readable string
     * @private
     */
    _formatDuration(ms) {
        if (ms < 1000) {
            return `${ms}ms`;
        } else {
            return `${(ms / 1000).toFixed(1)}s`;
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
    window.PatternLibrary = PatternLibrary;
}
