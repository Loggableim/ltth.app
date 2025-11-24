/**
 * @file KeyframeEditor.tsx.js - Keyframe Graph Editor Component
 * @description 2D graph editor for creating and editing keyframes
 */

class KeyframeEditor {
    constructor(containerElement, store) {
        this.container = containerElement;
        this.store = store;
        this.unsubscribe = null;
        
        // Canvas state
        this.canvas = null;
        this.ctx = null;
        this.animationFrameId = null;
        
        // Interaction state
        this.isDragging = false;
        this.draggedKeyframeIndex = null;
        this.hoveredKeyframeIndex = null;
        
        // View state
        this.padding = { top: 20, right: 40, bottom: 40, left: 60 };
        this.zoom = 1;
        this.panOffset = 0;
    }

    /**
     * Initialize the component
     */
    init() {
        this.render();
        
        // Subscribe to store changes
        this.unsubscribe = this.store.subscribe((state) => {
            if (state.currentView === 'keyframe') {
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
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        this._removeCanvasListeners();
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
                    <p class="text-gray-400 text-center py-8">Kein Pattern ausgewählt</p>
                </div>
            `;
            return;
        }

        this.container.innerHTML = `
            <div class="keyframe-editor">
                <div class="keyframe-editor-header">
                    <h3 class="text-xl font-bold text-white mb-2">Keyframe Editor</h3>
                    <p class="text-gray-400 mb-4">${this._escapeHtml(pattern.name)}</p>
                </div>

                <div class="keyframe-canvas-container">
                    <canvas id="keyframeCanvas" class="keyframe-canvas"></canvas>
                </div>

                <div class="keyframe-controls">
                    <div class="form-group">
                        <label class="form-label">Gesamtdauer (ms)</label>
                        <input type="number" id="totalDuration" class="form-input" 
                               value="${state.totalDuration}" min="1000" max="60000" step="100">
                    </div>

                    <div class="btn-group">
                        <button class="btn btn-secondary" id="addKeyframeBtn">➕ Keyframe hinzufügen</button>
                        <button class="btn btn-secondary" id="deleteKeyframeBtn" ${state.selectedKeyframeIndex === null ? 'disabled' : ''}>
                            🗑️ Keyframe löschen
                        </button>
                    </div>

                    ${state.selectedKeyframeIndex !== null ? this._renderKeyframeDetails(state.keyframes[state.selectedKeyframeIndex], state.selectedKeyframeIndex) : ''}
                </div>

                <div class="keyframe-editor-actions">
                    <button class="btn btn-success btn-block" id="saveKeyframePatternBtn">
                        💾 Pattern speichern
                    </button>
                    
                    <button class="btn btn-secondary btn-block" id="exitExpertModeBtn">
                        ← Zurück zum Parameter Editor
                    </button>
                </div>
            </div>
        `;

        this._initCanvas();
        this._attachEventListeners();
        this._startAnimation();
    }

    /**
     * Render keyframe details panel
     * @private
     */
    _renderKeyframeDetails(keyframe, index) {
        return `
            <div class="keyframe-details">
                <h4 class="text-lg font-semibold text-white mb-2">Keyframe ${index + 1}</h4>
                
                <div class="form-group">
                    <label class="form-label">Zeit (ms)</label>
                    <input type="number" id="keyframeTime" class="form-input" 
                           value="${keyframe.time}" min="0" max="${this.store.getState().totalDuration}" step="10">
                </div>

                <div class="form-group">
                    <label class="form-label">Intensität (%)</label>
                    <input type="range" id="keyframeIntensity" class="slider" 
                           value="${keyframe.intensity}" min="0" max="100" step="1">
                    <span class="slider-value">${keyframe.intensity}%</span>
                </div>

                <div class="form-group">
                    <label class="form-label">Interpolation</label>
                    <select id="keyframeInterpolation" class="form-select">
                        <option value="Linear" ${keyframe.interpolation === 'Linear' ? 'selected' : ''}>Linear</option>
                        <option value="Step" ${keyframe.interpolation === 'Step' ? 'selected' : ''}>Step (Hold)</option>
                        <option value="Bezier" ${keyframe.interpolation === 'Bezier' ? 'selected' : ''}>Bezier (Ease)</option>
                    </select>
                </div>
            </div>
        `;
    }

    /**
     * Initialize canvas
     * @private
     */
    _initCanvas() {
        this.canvas = document.getElementById('keyframeCanvas');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        
        // Set canvas size
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = 400;

        this._attachCanvasListeners();
    }

    /**
     * Attach canvas event listeners
     * @private
     */
    _attachCanvasListeners() {
        if (!this.canvas) return;

        this.canvas.addEventListener('mousedown', this._handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this._handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this._handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this._handleMouseUp.bind(this));
        this.canvas.addEventListener('dblclick', this._handleDoubleClick.bind(this));
        this.canvas.addEventListener('contextmenu', this._handleRightClick.bind(this));
    }

    /**
     * Remove canvas event listeners
     * @private
     */
    _removeCanvasListeners() {
        if (!this.canvas) return;

        this.canvas.removeEventListener('mousedown', this._handleMouseDown.bind(this));
        this.canvas.removeEventListener('mousemove', this._handleMouseMove.bind(this));
        this.canvas.removeEventListener('mouseup', this._handleMouseUp.bind(this));
        this.canvas.removeEventListener('mouseleave', this._handleMouseUp.bind(this));
        this.canvas.removeEventListener('dblclick', this._handleDoubleClick.bind(this));
        this.canvas.removeEventListener('contextmenu', this._handleRightClick.bind(this));
    }

    /**
     * Handle mouse down
     * @private
     */
    _handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const keyframeIndex = this._getKeyframeAtPosition(x, y);
        
        if (keyframeIndex !== null) {
            this.isDragging = true;
            this.draggedKeyframeIndex = keyframeIndex;
            this.store.selectKeyframe(keyframeIndex);
        } else {
            this.store.selectKeyframe(null);
        }
    }

    /**
     * Handle mouse move
     * @private
     */
    _handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.isDragging && this.draggedKeyframeIndex !== null) {
            // Update keyframe position
            const { time, intensity } = this._screenToKeyframe(x, y);
            this.store.updateKeyframe(this.draggedKeyframeIndex, { time, intensity });
        } else {
            // Update hover state
            this.hoveredKeyframeIndex = this._getKeyframeAtPosition(x, y);
        }
    }

    /**
     * Handle mouse up
     * @private
     */
    _handleMouseUp() {
        this.isDragging = false;
        this.draggedKeyframeIndex = null;
    }

    /**
     * Handle double click (add keyframe)
     * @private
     */
    _handleDoubleClick(e) {
        if (this.isDragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { time, intensity } = this._screenToKeyframe(x, y);
        this.store.addKeyframe(time, intensity, 'Linear');
    }

    /**
     * Handle right click (delete keyframe)
     * @private
     */
    _handleRightClick(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const keyframeIndex = this._getKeyframeAtPosition(x, y);
        if (keyframeIndex !== null) {
            if (confirm('Keyframe löschen?')) {
                this.store.deleteKeyframe(keyframeIndex);
            }
        }
    }

    /**
     * Convert screen coordinates to keyframe values
     * @private
     */
    _screenToKeyframe(x, y) {
        const state = this.store.getState();
        const graphWidth = this.canvas.width - this.padding.left - this.padding.right;
        const graphHeight = this.canvas.height - this.padding.top - this.padding.bottom;

        const time = Math.max(0, Math.min(
            ((x - this.padding.left) / graphWidth) * state.totalDuration,
            state.totalDuration
        ));

        const intensity = Math.max(0, Math.min(
            100 - ((y - this.padding.top) / graphHeight) * 100,
            100
        ));

        return { 
            time: Math.round(time / 10) * 10, // Snap to 10ms
            intensity: Math.round(intensity) 
        };
    }

    /**
     * Convert keyframe values to screen coordinates
     * @private
     */
    _keyframeToScreen(time, intensity) {
        const state = this.store.getState();
        const graphWidth = this.canvas.width - this.padding.left - this.padding.right;
        const graphHeight = this.canvas.height - this.padding.top - this.padding.bottom;

        const x = this.padding.left + (time / state.totalDuration) * graphWidth;
        const y = this.padding.top + graphHeight - (intensity / 100) * graphHeight;

        return { x, y };
    }

    /**
     * Get keyframe at screen position
     * @private
     */
    _getKeyframeAtPosition(x, y) {
        const state = this.store.getState();
        const threshold = 10; // pixels

        for (let i = 0; i < state.keyframes.length; i++) {
            const kf = state.keyframes[i];
            const pos = this._keyframeToScreen(kf.time, kf.intensity);
            
            const distance = Math.sqrt(
                Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2)
            );

            if (distance <= threshold) {
                return i;
            }
        }

        return null;
    }

    /**
     * Start animation loop
     * @private
     */
    _startAnimation() {
        const animate = () => {
            this._drawCanvas();
            this.animationFrameId = requestAnimationFrame(animate);
        };
        animate();
    }

    /**
     * Draw canvas
     * @private
     */
    _drawCanvas() {
        if (!this.ctx) return;

        const state = this.store.getState();
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear canvas
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, width, height);

        // Draw graph area
        this._drawGrid();
        this._drawCurve(state.keyframes);
        this._drawKeyframes(state.keyframes);
        this._drawAxes();
    }

    /**
     * Draw grid
     * @private
     */
    _drawGrid() {
        const graphWidth = this.canvas.width - this.padding.left - this.padding.right;
        const graphHeight = this.canvas.height - this.padding.top - this.padding.bottom;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;

        // Horizontal lines (intensity)
        for (let i = 0; i <= 10; i++) {
            const y = this.padding.top + (graphHeight / 10) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding.left, y);
            this.ctx.lineTo(this.padding.left + graphWidth, y);
            this.ctx.stroke();
        }

        // Vertical lines (time)
        for (let i = 0; i <= 10; i++) {
            const x = this.padding.left + (graphWidth / 10) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.padding.top);
            this.ctx.lineTo(x, this.padding.top + graphHeight);
            this.ctx.stroke();
        }
    }

    /**
     * Draw curve between keyframes
     * @private
     */
    _drawCurve(keyframes) {
        if (keyframes.length < 2) return;

        const state = this.store.getState();
        this.ctx.strokeStyle = '#00d4ff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        // Sample the curve
        const samples = 200;
        const pattern = state.selectedPattern;
        
        if (!pattern) return;

        // Create temporary engine for preview
        const PatternEngine = window.PatternEngine;
        let engine;
        
        try {
            const tempPattern = {
                ...pattern,
                type: 'custom',
                keyframes: keyframes,
                duration: state.totalDuration
            };
            engine = new PatternEngine(tempPattern, () => {});
        } catch (error) {
            return;
        }

        for (let i = 0; i <= samples; i++) {
            const time = (i / samples) * state.totalDuration;
            const intensity = engine._getIntensityAtTime(time);
            const pos = this._keyframeToScreen(time, intensity);

            if (i === 0) {
                this.ctx.moveTo(pos.x, pos.y);
            } else {
                this.ctx.lineTo(pos.x, pos.y);
            }
        }

        this.ctx.stroke();
    }

    /**
     * Draw keyframes
     * @private
     */
    _drawKeyframes(keyframes) {
        const state = this.store.getState();

        keyframes.forEach((kf, index) => {
            const pos = this._keyframeToScreen(kf.time, kf.intensity);
            const isSelected = index === state.selectedKeyframeIndex;
            const isHovered = index === this.hoveredKeyframeIndex;

            // Draw keyframe point
            this.ctx.fillStyle = isSelected ? '#00ff88' : (isHovered ? '#ffaa00' : '#ff6b6b');
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, isSelected ? 8 : 6, 0, Math.PI * 2);
            this.ctx.fill();

            // Draw border
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Draw tooltip on hover
            if (isHovered || isSelected) {
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                this.ctx.fillRect(pos.x + 10, pos.y - 25, 100, 40);
                
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '12px monospace';
                this.ctx.fillText(`${Math.round(kf.time)}ms`, pos.x + 15, pos.y - 10);
                this.ctx.fillText(`${Math.round(kf.intensity)}%`, pos.x + 15, pos.y + 5);
            }
        });
    }

    /**
     * Draw axes
     * @private
     */
    _drawAxes() {
        const state = this.store.getState();
        const graphWidth = this.canvas.width - this.padding.left - this.padding.right;
        const graphHeight = this.canvas.height - this.padding.top - this.padding.bottom;

        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        
        // Y-axis
        this.ctx.beginPath();
        this.ctx.moveTo(this.padding.left, this.padding.top);
        this.ctx.lineTo(this.padding.left, this.padding.top + graphHeight);
        this.ctx.stroke();

        // X-axis
        this.ctx.beginPath();
        this.ctx.moveTo(this.padding.left, this.padding.top + graphHeight);
        this.ctx.lineTo(this.padding.left + graphWidth, this.padding.top + graphHeight);
        this.ctx.stroke();

        // Y-axis labels (intensity)
        this.ctx.fillStyle = '#aaa';
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'right';
        for (let i = 0; i <= 10; i++) {
            const y = this.padding.top + graphHeight - (graphHeight / 10) * i;
            const value = i * 10;
            this.ctx.fillText(`${value}%`, this.padding.left - 10, y + 4);
        }

        // X-axis labels (time)
        this.ctx.textAlign = 'center';
        for (let i = 0; i <= 10; i++) {
            const x = this.padding.left + (graphWidth / 10) * i;
            const value = Math.round((state.totalDuration / 10) * i);
            this.ctx.fillText(`${value}ms`, x, this.padding.top + graphHeight + 20);
        }

        // Axis titles
        this.ctx.save();
        this.ctx.translate(20, this.canvas.height / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#00d4ff';
        this.ctx.font = 'bold 14px sans-serif';
        this.ctx.fillText('Intensität (%)', 0, 0);
        this.ctx.restore();

        this.ctx.fillStyle = '#00d4ff';
        this.ctx.font = 'bold 14px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Zeit (ms)', this.padding.left + graphWidth / 2, this.canvas.height - 5);
    }

    /**
     * Attach event listeners
     * @private
     */
    _attachEventListeners() {
        // Total duration
        const durationInput = this.container.querySelector('#totalDuration');
        if (durationInput) {
            durationInput.addEventListener('change', (e) => {
                const duration = parseInt(e.target.value);
                this.store.setState({ totalDuration: duration });
            });
        }

        // Add keyframe button
        const addBtn = this.container.querySelector('#addKeyframeBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const state = this.store.getState();
                const time = state.totalDuration / 2;
                this.store.addKeyframe(time, 50, 'Linear');
            });
        }

        // Delete keyframe button
        const deleteBtn = this.container.querySelector('#deleteKeyframeBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                const state = this.store.getState();
                if (state.selectedKeyframeIndex !== null) {
                    this.store.deleteKeyframe(state.selectedKeyframeIndex);
                }
            });
        }

        // Keyframe property inputs
        const timeInput = this.container.querySelector('#keyframeTime');
        if (timeInput) {
            timeInput.addEventListener('change', (e) => {
                const state = this.store.getState();
                if (state.selectedKeyframeIndex !== null) {
                    this.store.updateKeyframe(state.selectedKeyframeIndex, {
                        time: parseInt(e.target.value)
                    });
                }
            });
        }

        const intensityInput = this.container.querySelector('#keyframeIntensity');
        if (intensityInput) {
            intensityInput.addEventListener('input', (e) => {
                const state = this.store.getState();
                if (state.selectedKeyframeIndex !== null) {
                    this.store.updateKeyframe(state.selectedKeyframeIndex, {
                        intensity: parseInt(e.target.value)
                    });
                }
            });
        }

        const interpolationInput = this.container.querySelector('#keyframeInterpolation');
        if (interpolationInput) {
            interpolationInput.addEventListener('change', (e) => {
                const state = this.store.getState();
                if (state.selectedKeyframeIndex !== null) {
                    this.store.updateKeyframe(state.selectedKeyframeIndex, {
                        interpolation: e.target.value
                    });
                }
            });
        }

        // Save button
        const saveBtn = this.container.querySelector('#saveKeyframePatternBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const name = prompt('Pattern Name:', 'Custom Pattern');
                if (name) {
                    this.store.saveAsUserPattern(name);
                    alert('Pattern gespeichert!');
                }
            });
        }

        // Exit expert mode
        const exitBtn = this.container.querySelector('#exitExpertModeBtn');
        if (exitBtn) {
            exitBtn.addEventListener('click', () => {
                this.store.disableExpertMode();
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
    window.KeyframeEditor = KeyframeEditor;
}
