/**
 * @file PatternEngine.ts.js - Enhanced Pattern Engine with Keyframe Support
 * @description Backend logic for pattern playback with high-resolution timing
 * 
 * @typedef {Object} Keyframe
 * @property {number} time - Time in milliseconds
 * @property {number} intensity - Intensity value (0-100)
 * @property {'Linear'|'Step'|'Bezier'} interpolation - Interpolation type
 * @property {Object} [bezierControls] - Bezier control points (optional)
 * @property {number} [bezierControls.cp1x] - Control point 1 x
 * @property {number} [bezierControls.cp1y] - Control point 1 y
 * @property {number} [bezierControls.cp2x] - Control point 2 x
 * @property {number} [bezierControls.cp2y] - Control point 2 y
 * 
 * @typedef {Object} PresetParams
 * @property {number} [intensity] - For Konstant
 * @property {number} [startIntensity] - For Rampe
 * @property {number} [endIntensity] - For Rampe
 * @property {number} [duration] - For Rampe
 * @property {number} [pulseDuration] - For Puls
 * @property {number} [pauseDuration] - For Puls
 * @property {number} [minIntensity] - For Welle, Zufall
 * @property {number} [maxIntensity] - For Welle, Zufall
 * @property {number} [frequency] - For Welle, Zufall (Hz)
 * 
 * @typedef {Object} PatternObject
 * @property {string} id - Unique pattern ID (uuid-v4)
 * @property {string} name - Pattern name
 * @property {'custom'|'preset'} type - Pattern type
 * @property {string} [sourcePreset] - Source preset name if derived from preset
 * @property {PresetParams} [params] - Preset parameters (only for type='preset')
 * @property {Keyframe[]} [keyframes] - Keyframes (only for type='custom')
 * @property {number} duration - Total pattern duration in ms
 */

class PatternEngine {
    /**
     * @param {PatternObject} pattern - Pattern configuration
     * @param {function(number): void} onTick - Callback for intensity updates
     */
    constructor(pattern, onTick) {
        this.pattern = pattern;
        this.onTick = onTick;
        this.isPlaying = false;
        this.isPaused = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.currentTime = 0;
        this.animationFrameId = null;
        this.lastTickTime = 0;
        this.tickInterval = 50; // Tick every 50ms for smooth playback
        
        // Generate keyframes if preset-based
        if (pattern.type === 'preset' && pattern.params) {
            this.keyframes = this._generateKeyframesFromPreset(
                pattern.sourcePreset,
                pattern.params
            );
        } else if (pattern.type === 'custom' && pattern.keyframes) {
            this.keyframes = [...pattern.keyframes].sort((a, b) => a.time - b.time);
        } else {
            throw new Error('Invalid pattern configuration');
        }
    }

    /**
     * Generate keyframes from preset parameters
     * @private
     * @param {string} presetName - Name of the preset
     * @param {PresetParams} params - Preset parameters
     * @returns {Keyframe[]} Generated keyframes
     */
    _generateKeyframesFromPreset(presetName, params) {
        switch (presetName) {
            case 'Konstant':
                return this._generateKonstant(params);
            case 'Rampe':
                return this._generateRampe(params);
            case 'Puls':
                return this._generatePuls(params);
            case 'Welle':
                return this._generateWelle(params);
            case 'Zufall':
                return this._generateZufall(params);
            default:
                throw new Error(`Unknown preset: ${presetName}`);
        }
    }

    /**
     * Generate Konstant (Constant) pattern
     * @private
     */
    _generateKonstant(params) {
        const { intensity = 50 } = params;
        return [
            { time: 0, intensity, interpolation: 'Step' },
            { time: 1000, intensity, interpolation: 'Step' }
        ];
    }

    /**
     * Generate Rampe (Ramp) pattern
     * @private
     */
    _generateRampe(params) {
        const { startIntensity = 0, endIntensity = 100, duration = 5000 } = params;
        return [
            { time: 0, intensity: startIntensity, interpolation: 'Linear' },
            { time: duration, intensity: endIntensity, interpolation: 'Linear' }
        ];
    }

    /**
     * Generate Puls (Pulse) pattern
     * @private
     */
    _generatePuls(params) {
        const { intensity = 50, pulseDuration = 500, pauseDuration = 500 } = params;
        const keyframes = [];
        const cycles = 5; // Number of pulses
        
        for (let i = 0; i < cycles; i++) {
            const cycleStart = i * (pulseDuration + pauseDuration);
            keyframes.push(
                { time: cycleStart, intensity, interpolation: 'Step' },
                { time: cycleStart + pulseDuration, intensity: 0, interpolation: 'Step' }
            );
        }
        
        return keyframes;
    }

    /**
     * Generate Welle (Wave) pattern
     * @private
     */
    _generateWelle(params) {
        const { minIntensity = 0, maxIntensity = 100, frequency = 1 } = params;
        const duration = 5000; // 5 seconds default
        const samples = Math.max(20, Math.floor(frequency * duration / 100)); // Sample points
        const keyframes = [];
        
        for (let i = 0; i <= samples; i++) {
            const t = (i / samples) * duration;
            const phase = (i / samples) * frequency * 2 * Math.PI;
            const intensity = minIntensity + (maxIntensity - minIntensity) * 
                            (Math.sin(phase) + 1) / 2;
            keyframes.push({
                time: t,
                intensity: Math.round(intensity),
                interpolation: 'Linear'
            });
        }
        
        return keyframes;
    }

    /**
     * Generate Zufall (Random) pattern
     * @private
     */
    _generateZufall(params) {
        const { minIntensity = 0, maxIntensity = 100, frequency = 2 } = params;
        const duration = 5000; // 5 seconds default
        const numPoints = Math.max(5, Math.floor(frequency * 5)); // Based on frequency
        const keyframes = [];
        
        for (let i = 0; i <= numPoints; i++) {
            const t = (i / numPoints) * duration;
            const intensity = minIntensity + 
                            Math.random() * (maxIntensity - minIntensity);
            keyframes.push({
                time: t,
                intensity: Math.round(intensity),
                interpolation: 'Step'
            });
        }
        
        return keyframes;
    }

    /**
     * Calculate interpolated intensity at a given time
     * @private
     * @param {number} time - Current time in ms
     * @returns {number} Interpolated intensity (0-100)
     */
    _getIntensityAtTime(time) {
        if (!this.keyframes || this.keyframes.length === 0) {
            return 0;
        }

        // Clamp time to pattern duration
        time = Math.max(0, Math.min(time, this.pattern.duration));

        // Find surrounding keyframes
        let prevKeyframe = this.keyframes[0];
        let nextKeyframe = this.keyframes[this.keyframes.length - 1];

        for (let i = 0; i < this.keyframes.length - 1; i++) {
            if (time >= this.keyframes[i].time && time <= this.keyframes[i + 1].time) {
                prevKeyframe = this.keyframes[i];
                nextKeyframe = this.keyframes[i + 1];
                break;
            }
        }

        // If time is before first keyframe
        if (time < this.keyframes[0].time) {
            return this.keyframes[0].intensity;
        }

        // If time is after last keyframe
        if (time >= this.keyframes[this.keyframes.length - 1].time) {
            return this.keyframes[this.keyframes.length - 1].intensity;
        }

        // Interpolate based on type
        return this._interpolate(prevKeyframe, nextKeyframe, time);
    }

    /**
     * Interpolate between two keyframes
     * @private
     * @param {Keyframe} k1 - First keyframe
     * @param {Keyframe} k2 - Second keyframe
     * @param {number} time - Current time
     * @returns {number} Interpolated intensity
     */
    _interpolate(k1, k2, time) {
        const timeDelta = k2.time - k1.time;
        if (timeDelta === 0) return k1.intensity;

        const progress = (time - k1.time) / timeDelta;

        switch (k1.interpolation) {
            case 'Step':
                return k1.intensity;

            case 'Linear':
                return k1.intensity + (k2.intensity - k1.intensity) * progress;

            case 'Bezier':
                if (k1.bezierControls) {
                    const { cp1x, cp1y, cp2x, cp2y } = k1.bezierControls;
                    const t = this._solveBezierX(progress, cp1x, cp2x);
                    const y = this._cubicBezier(t, 0, cp1y, cp2y, 1);
                    return k1.intensity + (k2.intensity - k1.intensity) * y;
                }
                // Fallback to linear if no bezier controls
                return k1.intensity + (k2.intensity - k1.intensity) * progress;

            default:
                return k1.intensity;
        }
    }

    /**
     * Cubic Bezier curve calculation
     * @private
     */
    _cubicBezier(t, p0, p1, p2, p3) {
        const oneMinusT = 1 - t;
        return oneMinusT ** 3 * p0 +
               3 * oneMinusT ** 2 * t * p1 +
               3 * oneMinusT * t ** 2 * p2 +
               t ** 3 * p3;
    }

    /**
     * Solve cubic Bezier X for given x value (Newton-Raphson)
     * @private
     */
    _solveBezierX(x, cp1x, cp2x, epsilon = 0.001) {
        let t = x;
        for (let i = 0; i < 8; i++) {
            const xt = this._cubicBezier(t, 0, cp1x, cp2x, 1);
            const dt = xt - x;
            if (Math.abs(dt) < epsilon) return t;
            
            const derivative = 3 * (1 - t) ** 2 * cp1x +
                             6 * (1 - t) * t * (cp2x - cp1x) +
                             3 * t ** 2 * (1 - cp2x);
            if (Math.abs(derivative) < 1e-6) break;
            
            t -= dt / derivative;
        }
        return t;
    }

    /**
     * Start pattern playback
     */
    play() {
        if (this.isPlaying && !this.isPaused) {
            return; // Already playing
        }

        if (this.isPaused) {
            // Resume from pause
            const pauseDuration = performance.now() - this.pauseTime;
            this.startTime += pauseDuration;
            this.isPaused = false;
        } else {
            // Start new playback
            this.startTime = performance.now();
            this.currentTime = 0;
        }

        this.isPlaying = true;
        this._tick();
    }

    /**
     * Pause playback
     */
    pause() {
        if (!this.isPlaying || this.isPaused) {
            return;
        }

        this.isPaused = true;
        this.pauseTime = performance.now();
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Stop and reset playback
     */
    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentTime = 0;
        this.startTime = 0;
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // Send zero intensity
        if (this.onTick) {
            this.onTick(0);
        }
    }

    /**
     * Animation tick for pattern playback
     * @private
     */
    _tick() {
        if (!this.isPlaying || this.isPaused) {
            return;
        }

        const now = performance.now();
        this.currentTime = now - this.startTime;

        // Check if pattern has finished
        if (this.currentTime >= this.pattern.duration) {
            this.stop();
            return;
        }

        // Only emit tick at specified interval
        if (now - this.lastTickTime >= this.tickInterval) {
            const intensity = this._getIntensityAtTime(this.currentTime);
            
            if (this.onTick) {
                this.onTick(intensity);
            }
            
            this.lastTickTime = now;
        }

        // Schedule next tick
        this.animationFrameId = requestAnimationFrame(() => this._tick());
    }

    /**
     * Get current playback state
     * @returns {Object} Current state
     */
    getState() {
        return {
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            currentTime: this.currentTime,
            duration: this.pattern.duration,
            progress: this.pattern.duration > 0 
                ? this.currentTime / this.pattern.duration 
                : 0
        };
    }

    /**
     * Convert preset-based pattern to keyframe-based pattern
     * @param {PatternObject} presetPattern - Preset pattern
     * @returns {PatternObject} Keyframe-based pattern
     */
    static convertPresetToKeyframes(presetPattern) {
        if (presetPattern.type !== 'preset') {
            return presetPattern; // Already keyframe-based
        }

        const tempEngine = new PatternEngine(presetPattern, () => {});
        
        return {
            ...presetPattern,
            type: 'custom',
            keyframes: tempEngine.keyframes,
            params: undefined // Remove params when converting to custom
        };
    }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PatternEngine;
} else if (typeof window !== 'undefined') {
    window.PatternEngine = PatternEngine;
}
