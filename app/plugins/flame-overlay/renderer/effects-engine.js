/**
 * Enhanced WebGL Effects Engine v2.2.0
 * Supports multiple visual effects: flames, particles, energy waves, lightning
 * Features: Multi-layer flames, bloom post-processing, smoke effects, advanced animation
 * 
 * Based on modern WebGL rendering techniques and shader programming
 */

class EffectsEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        
        if (!this.canvas) {
            console.error('Canvas element not found:', canvasId);
            return;
        }
        
        this.gl = null;
        this.programs = {};
        this.currentProgram = null;
        this.textures = {};
        this.uniforms = {};
        this.buffers = {};
        this.startTime = Date.now();
        this.config = {};
        this.particles = [];
        this.lightningSegments = [];
        this.postProcessor = null;
        this.textureImages = {};
        this.animationFrameId = null;
        this.socket = null;
        this.socketListeners = [];
        this.resizeHandler = () => this.handleResize();
        this.beforeUnloadHandler = () => this.destroy();
        this.contextLostHandler = (event) => this.handleContextLost(event);
        this.contextRestoredHandler = () => this.handleContextRestored();
        this.destroyed = false;
        this.contextLost = false;
        
        // Trigger system (v3.0.0)
        this.activeTriggers = [];
        this.baseConfig = null;
        this.triggerQueue = [];
        this.triggerTimers = new Map();
        this.revertAnimationId = null;
        this.revertTimeouts = [];
        this.defaultTriggerDuration = 5000;
        this.maxTriggerDuration = 30000;
        
        this.init();
    }
    
    async init() {
        if (!this.canvas) {
            console.error('Cannot initialize: canvas is null');
            return;
        }
        
        this.setupLifecycleListeners();
        this.gl = this.createWebGLContext();
        
        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }
        
        await this.loadConfig();
        this.setupAllShaders();
        if (!this.switchEffect(this.config.effectType ?? 'flames')) {
            this.switchEffect('flames');
        }
        this.setupGeometry();
        this.loadTextures();
        this.initPostProcessor();
        this.initParticles();
        this.handleResize();
        
        window.addEventListener('resize', this.resizeHandler);
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
        
        this.setupSocketListener();
        this.scheduleRender();
    }

    createWebGLContext() {
        return this.canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance',
            desynchronized: true
        });
    }

    setupLifecycleListeners() {
        this.canvas.addEventListener('webglcontextlost', this.contextLostHandler);
        this.canvas.addEventListener('webglcontextrestored', this.contextRestoredHandler);
    }

    handleContextLost(event) {
        if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
        }

        this.contextLost = true;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    handleContextRestored() {
        if (this.destroyed) return;

        this.contextLost = false;
        this.gl = this.createWebGLContext();
        if (!this.gl) {
            console.error('WebGL context restore failed');
            return;
        }

        this.programs = {};
        this.currentProgram = null;
        this.textures = {};
        this.textureImages = {};
        this.uniforms = {};
        this.buffers = {};
        this.smokeUniforms = null;

        if (this.postProcessor) {
            this.postProcessor.destroy();
            this.postProcessor = null;
        }

        this.setupAllShaders();
        if (!this.switchEffect(this.config.effectType ?? 'flames')) {
            this.switchEffect('flames');
        }
        this.setupGeometry();
        this.loadTextures();
        this.initPostProcessor();
        this.handleResize();
        this.scheduleRender();
    }
    
    async loadConfig() {
        try {
            const response = await fetch('/api/flame-overlay/config');
            const data = await response.json();
            if (data.success) {
                this.config = data.config;
            }
        } catch (error) {
            console.error('Failed to load config:', error);
            this.config = {
                effectType: 'flames',
                qualityMode: 'obs-safe',
                resolutionPreset: 'tiktok-portrait',
                customWidth: 720,
                customHeight: 1280,
                frameMode: 'bottom',
                frameThickness: 150,
                flameColor: '#ff6600',
                flameSpeed: 0.46,
                flameIntensity: 1.18,
                flameBrightness: 0.34,
                enableGlow: true,
                enableAdditiveBlend: true,
                maskOnlyEdges: true,
                noiseOctaves: 9,
                useHighQualityTextures: true,
                detailScaleAuto: true,
                edgeFeather: 0.46,
                frameCurve: 0.1,
                frameNoiseAmount: 0.12,
                animationEasing: 'linear',
                pulseEnabled: false,
                pulseAmount: 0.16,
                pulseSpeed: 1.0,
                bloomEnabled: true,
                bloomIntensity: 0.78,
                bloomThreshold: 0.58,
                bloomRadius: 4,
                layersEnabled: true,
                layerCount: 2,
                layerParallax: 0.18,
                chromaticAberration: 0.004,
                filmGrain: 0.015,
                depthIntensity: 0.66,
                cinematicContrast: 1.12,
                coreWhiteness: 0.66,
                emberTrailAmount: 0.28,
                sparkEnabled: true,
                sparkDensity: 0.52,
                heatDistortionEnabled: true,
                heatDistortionStrength: 0.24,
                smokeEnabled: false,
                smokeIntensity: 0.18,
                smokeSpeed: 0.22,
                smokeColor: '#2d2623',
                visualProfileVersion: 3
            };
        }
    }
    
    setupSocketListener() {
        if (typeof io !== 'undefined') {
            try {
                this.socket = io();

                this.registerSocketListener('connect', () => {
                    console.log('Socket.io connected for config updates');
                });

                this.registerSocketListener('connect_error', (error) => {
                    console.warn('Socket.io connection error:', error);
                });

                this.registerSocketListener('flame-overlay:config-update', (data) => {
                    console.log('Config update received:', data);
                    this.applyConfigUpdate(data);
                });

                this.registerSocketListener('flame-overlay:trigger', (data) => {
                    this.handleTrigger(data);
                });

                this.registerSocketListener('flame-overlay:clear-triggers', () => {
                    this.clearTriggers();
                });
            } catch (error) {
                console.error('Failed to setup socket listener:', error);
            }
        } else {
            console.warn('Socket.io not available - config updates disabled');
        }
    }

    registerSocketListener(eventName, handler) {
        if (!this.socket || typeof this.socket.on !== 'function') return;
        this.socket.on(eventName, handler);
        this.socketListeners.push([eventName, handler]);
    }

    applyConfigUpdate(data) {
        const nextConfig = this.cloneConfig((data && data.config) ?? data ?? {});
        const hasActiveTriggers = this.activeTriggers.length > 0;

        if (hasActiveTriggers) {
            this.baseConfig = nextConfig;
            this.recomputeConfigFromTriggers();
        } else {
            this.config = nextConfig;
            if (!this.switchEffect(this.config.effectType ?? 'flames')) {
                this.switchEffect('flames');
            }
        }

        this.handleResize();
    }

    cloneConfig(config) {
        return JSON.parse(JSON.stringify(config ?? {}));
    }

    hasUniform(location) {
        return location !== null && location !== undefined;
    }

    valueOr(value, fallback) {
        return value ?? fallback;
    }

    numberOr(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    getResolutionPresetDimensions() {
        return {
            'tiktok-portrait': { width: 720, height: 1280 },
            'tiktok-landscape': { width: 1280, height: 720 },
            'hd-portrait': { width: 1080, height: 1920 },
            'hd-landscape': { width: 1920, height: 1080 },
            '2k-portrait': { width: 1440, height: 2560 },
            '2k-landscape': { width: 2560, height: 1440 },
            '4k-portrait': { width: 2160, height: 3840 },
            '4k-landscape': { width: 3840, height: 2160 }
        };
    }

    getConfiguredCanvasDimensions() {
        const presets = this.getResolutionPresetDimensions();
        const preset = this.config.resolutionPreset || 'tiktok-portrait';
        const dimensions = preset === 'custom'
            ? {
                width: this.numberOr(this.config.customWidth, 720),
                height: this.numberOr(this.config.customHeight, 1280)
            }
            : (presets[preset] || presets['tiktok-portrait']);

        return {
            width: Math.max(1, Math.round(this.numberOr(dimensions.width, window.innerWidth || 720))),
            height: Math.max(1, Math.round(this.numberOr(dimensions.height, window.innerHeight || 1280)))
        };
    }

    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    /**
     * Handle an incoming trigger from the backend
     * @param {object} trigger - Trigger object with type, duration, etc.
     */
    handleTrigger(trigger) {
        if (!trigger || !trigger.type) return;

        if (trigger.type === 'clear') {
            this.clearTriggers();
            return;
        }

        const duration = this.normalizeTriggerDuration(trigger.duration);
        const isPermanent = trigger.revert === false && trigger.permanent === true;
        const now = Date.now();

        // Snapshot base config on first trigger
        if (!this.baseConfig) {
            this.baseConfig = this.cloneConfig(this.config);
        }

        const triggerEntry = {
            id: trigger.id ?? (Date.now() + Math.random()),
            ...trigger,
            duration,
            permanent: isPermanent,
            startTime: now,
            endTime: isPermanent ? null : now + duration,
            prevEffect: this.config.effectType
        };

        this.activeTriggers.push(triggerEntry);
        this.recomputeConfigFromTriggers();

        if (!isPermanent) {
            this.setTriggerTimer(triggerEntry.id, duration);
        }
    }

    normalizeTriggerDuration(duration) {
        const number = Number(duration);
        if (!Number.isFinite(number) || number <= 0) return this.defaultTriggerDuration;
        return Math.max(100, Math.min(number, this.maxTriggerDuration));
    }

    setTriggerTimer(triggerId, duration) {
        const existingTimer = this.triggerTimers.get(triggerId);
        if (existingTimer) clearTimeout(existingTimer);

        const timer = setTimeout(() => {
            this.triggerTimers.delete(triggerId);
            const trigger = this.activeTriggers.find(activeTrigger => activeTrigger.id === triggerId);
            this.removeTrigger(triggerId, trigger ? trigger.revert !== false : true);
        }, this.normalizeTriggerDuration(duration));
        this.triggerTimers.set(triggerId, timer);
    }

    recomputeConfigFromTriggers() {
        if (!this.baseConfig) return;
        this.cancelRevertAnimation();
        this.config = this.cloneConfig(this.baseConfig);

        if (!this.switchEffect(this.config.effectType ?? 'flames')) {
            this.switchEffect('flames');
        }

        for (const activeTrigger of this.activeTriggers) {
            this.applyTrigger(activeTrigger, { update: false });
        }

        this.updateUniforms();
    }

    /**
     * Apply a trigger's visual effect to the current config
     * @param {object} trigger - Trigger entry
     */
    applyTrigger(trigger, options = {}) {
        const update = options.update !== false;
        const base = this.baseConfig ?? this.config;

        switch (trigger.type) {
            case 'intensity-boost':
                this.config.flameIntensity = Math.min(
                    this.numberOr(this.config.flameIntensity, this.numberOr(base.flameIntensity, 1.3)) +
                        this.numberOr(trigger.amount, 0.5),
                    3.0
                );
                break;

            case 'color-change':
            case 'color-flash':
                if (trigger.color) this.config.flameColor = trigger.color;
                if (trigger.bloom) {
                    this.config.bloomEnabled = true;
                    this.config.bloomIntensity = Math.max(this.numberOr(this.config.bloomIntensity, 0), 1.2);
                }
                break;

            case 'effect-switch':
                if (trigger.effect) this.switchEffect(trigger.effect);
                break;

            case 'dramatic':
                if (trigger.effect) this.switchEffect(trigger.effect);
                this.config.flameIntensity = Math.min(
                    this.numberOr(this.config.flameIntensity, this.numberOr(base.flameIntensity, 1.3)) +
                        this.numberOr(trigger.intensityBoost, 0.5),
                    3.0
                );
                if (trigger.bloomOverride) {
                    this.config.bloomEnabled = trigger.bloomOverride.enabled;
                    this.config.bloomIntensity = this.numberOr(trigger.bloomOverride.intensity, 1.0);
                }
                break;

            case 'pulse':
                this.config.pulseEnabled = true;
                this.config.pulseAmount = this.numberOr(trigger.intensity, 0.5);
                break;

            case 'flash':
                this.config.flameBrightness = Math.min(
                    this.numberOr(this.config.flameBrightness, this.numberOr(base.flameBrightness, 0.25)) + 0.8,
                    2.0
                );
                break;

            default:
                break;
        }

        if (update) {
            this.updateUniforms();
        }
    }

    /**
     * Remove an active trigger and revert config if no triggers remain
     * @param {string|number} triggerId - ID of the trigger to remove
     */
    removeTrigger(triggerId, animated = true) {
        const timer = this.triggerTimers.get(triggerId);
        if (timer) {
            clearTimeout(timer);
            this.triggerTimers.delete(triggerId);
        }

        this.activeTriggers = this.activeTriggers.filter(t => t.id !== triggerId);

        if (this.activeTriggers.length === 0 && this.baseConfig) {
            this.restoreBaseConfig(animated);
        } else if (this.activeTriggers.length > 0) {
            this.recomputeConfigFromTriggers();
        }
    }

    clearTriggers() {
        for (const timer of this.triggerTimers.values()) {
            clearTimeout(timer);
        }
        this.triggerTimers.clear();
        this.activeTriggers = [];
        this.restoreBaseConfig(false);
    }

    cleanupExpiredTriggers(now = Date.now()) {
        const expired = this.activeTriggers
            .filter(trigger => trigger.endTime !== null && trigger.endTime !== undefined && now >= trigger.endTime)
            .map(trigger => trigger.id);

        for (const triggerId of expired) {
            this.removeTrigger(triggerId);
        }
    }

    restoreBaseConfig(animated) {
        if (!this.baseConfig) return;

        const targetEffect = this.baseConfig.effectType;

        if (animated) {
            this.smoothRevert(500);
            return;
        }

        this.config = this.cloneConfig(this.baseConfig);
        this.baseConfig = null;
        this.switchEffect(targetEffect);
        this.updateUniforms();
    }

    cancelRevertAnimation() {
        if (this.revertAnimationId) {
            cancelAnimationFrame(this.revertAnimationId);
            this.revertAnimationId = null;
        }

        if (!Array.isArray(this.revertTimeouts)) {
            this.revertTimeouts = [];
        }

        for (const timeoutId of this.revertTimeouts) {
            clearTimeout(timeoutId);
        }
        this.revertTimeouts = [];
    }

    /**
     * Smoothly interpolate config values back to baseConfig over duration
     * @param {number} duration - Duration in ms
     */
    smoothRevert(duration) {
        if (!this.baseConfig) return;
        this.cancelRevertAnimation();

        const startConfig = this.cloneConfig(this.config);
        const targetConfig = this.cloneConfig(this.baseConfig);
        const startTime = Date.now();

        const numericFields = Object.keys(targetConfig)
            .filter(field => Number.isFinite(Number(startConfig[field])) && Number.isFinite(Number(targetConfig[field])));

        const interpolate = () => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(elapsed / duration, 1.0);
            // Quadratic ease-in-out: accelerates then decelerates
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

            for (const field of numericFields) {
                if (startConfig[field] !== undefined && targetConfig[field] !== undefined) {
                    this.config[field] = startConfig[field] + (targetConfig[field] - startConfig[field]) * ease;
                }
            }

            if (t >= 1.0) {
                this.config = this.cloneConfig(targetConfig);
                this.baseConfig = null;
                this.revertAnimationId = null;
                this.switchEffect(targetConfig.effectType);
            }

            this.updateUniforms();

            if (t < 1.0) {
                this.revertAnimationId = requestAnimationFrame(interpolate);
            }
        };

        this.revertAnimationId = requestAnimationFrame(interpolate);
    }
    
    initPostProcessor() {
        if (typeof PostProcessor === 'undefined') {
            console.warn('[EffectsEngine] PostProcessor class not available – bloom disabled');
            this.postProcessor = null;
            this.config.bloomEnabled = false;
            return;
        }
        
        try {
            this.postProcessor = new PostProcessor(this.gl);
            const width = this.gl.canvas.width ?? 720;
            const height = this.gl.canvas.height ?? 1280;
            if (width > 0 && height > 0) {
                this.postProcessor.resize(width, height);
            }
        } catch (error) {
            console.error('[EffectsEngine] PostProcessor init failed:', error);
            this.postProcessor = null;
            this.config.bloomEnabled = false;
        }
    }
    
    setupAllShaders() {
        this.setupFlameShaders();
        this.setupSmokeShaders();
        this.setupParticleShaders();
        this.setupEnergyShaders();
        this.setupLightningShaders();
    }
    
    setupFlameShaders() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelViewMatrix;
            
            varying vec2 vTexCoord;
            varying vec3 vPosition;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
                vPosition = aPosition;
            }
        `;
        
        // Inline flame.frag shader
        const fragmentShaderSource = `precision highp float;

// Uniforms
uniform float uTime;
uniform sampler2D uNoiseTexture;
uniform sampler2D uFireProfile;
uniform sampler2D uGradientLUT;
uniform vec3 uFlameColor;
uniform float uFlameSpeed;
uniform float uFlameIntensity;
uniform float uFlameBrightness;
uniform vec2 uResolution;
uniform vec4 uFrameRect;
uniform float uFrameThickness;
uniform int uFrameMode; // 0=bottom, 1=top, 2=sides, 3=all
uniform bool uMaskEdges;

// New quality settings
uniform int uNoiseOctaves; // 4-12
uniform bool uUseHighQualityTextures;
uniform float uDetailScale; // Auto-calculated from resolution

// Edge settings
uniform float uEdgeFeather; // 0.0-1.0
uniform float uFrameCurve; // 0.0-1.0
uniform float uFrameNoiseAmount; // 0.0-1.0

// Animation settings
uniform int uAnimationEasing; // 0=linear, 1=sine, 2=quad, 3=elastic
uniform bool uPulseEnabled;
uniform float uPulseAmount; // 0.0-1.0
uniform float uPulseSpeed; // 0.1-3.0

// Post-FX settings
uniform float uDepthIntensity; // 0.0-1.0

// Layer settings
uniform bool uLayersEnabled;
uniform int uLayerCount; // 1-3
uniform float uLayerParallax; // 0.0-1.0

// Cinematic HDR v3 settings
uniform float uSparkDensity;
uniform float uHeatDistortionStrength;
uniform float uCinematicContrast;
uniform float uCoreWhiteness;
uniform float uEmberTrailAmount;

varying vec2 vTexCoord;
varying vec3 vPosition;

const float modulus = 61.0;

// Include noise functions (these would be inline in actual shader)
// Simplex noise 2D
vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289_2(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
    return mod289(((x * 34.0) + 1.0) * x);
}

float simplexNoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289_2(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec2 random2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// 8-octave fBm with configurable octave count
float fbm(vec2 p, int octaves) {
    float sum = 0.0;
    float freq = 1.0;
    float amp = 1.0;
    const float lacunarity = 2.0;
    const float gain = 0.5;
    
    for (int i = 0; i < 12; i++) {
        if (i >= octaves) break;
        float n = simplexNoise(p * freq) * 0.7 + valueNoise(p * freq) * 0.3;
        sum += n * amp;
        freq *= lacunarity;
        amp *= gain;
    }
    
    return sum;
}

// Easing functions
float applyEasing(float t, int easingType) {
    if (easingType == 1) return sin(t * 1.5707963); // sine
    if (easingType == 2) return t * t; // quad
    if (easingType == 3) return pow(2.0, -10.0 * t) * sin((t - 0.075) * (6.283185 / 0.3)) + 1.0; // elastic
    return t; // linear
}

float easedCycleTime(float timeValue, int easingType) {
    float cycleTime = timeValue * 0.1;
    float cycle = floor(cycleTime);
    float phase = fract(cycleTime);
    return (cycle + applyEasing(phase, easingType)) * 10.0;
}

// Blackbody radiation
vec3 blackbodyColor(float temp) {
    temp = temp * 39000.0 + 1000.0;
    float r, g, b;
    temp /= 100.0;
    
    if (temp <= 66.0) {
        r = 1.0;
    } else {
        r = temp - 60.0;
        r = 329.698727446 * pow(r, -0.1332047592);
        r /= 255.0;
        r = clamp(r, 0.0, 1.0);
    }
    
    if (temp <= 66.0) {
        g = temp;
        g = 99.4708025861 * log(g) - 161.1195681661;
        g /= 255.0;
        g = clamp(g, 0.0, 1.0);
    } else {
        g = temp - 60.0;
        g = 288.1221695283 * pow(g, -0.0755148492);
        g /= 255.0;
        g = clamp(g, 0.0, 1.0);
    }
    
    if (temp >= 66.0) {
        b = 1.0;
    } else if (temp <= 19.0) {
        b = 0.0;
    } else {
        b = temp - 10.0;
        b = 138.5177312231 * log(b) - 305.0447927307;
        b /= 255.0;
        b = clamp(b, 0.0, 1.0);
    }
    
    return vec3(r, g, b);
}

// Curved frame with noise modulation
float getCurvedFrameDistance(vec2 pixelPos, vec2 resolution, float thickness, float curve, float noiseAmt) {
    vec2 center = resolution * 0.5;
    vec2 toEdge = abs(pixelPos - center);
    vec2 maxDist = resolution * 0.5;
    
    // Apply curve (rounded corners)
    float cornerRadius = min(resolution.x, resolution.y) * curve * 0.3;
    vec2 cornerOffset = max(toEdge - (maxDist - cornerRadius), 0.0);
    float cornerDist = length(cornerOffset);
    
    float distFromLeft = pixelPos.x;
    float distFromRight = resolution.x - pixelPos.x;
    float distFromBottom = pixelPos.y;
    float distFromTop = resolution.y - pixelPos.y;
    
    float minDist = min(min(distFromLeft, distFromRight), min(distFromBottom, distFromTop));
    minDist = max(minDist - cornerDist, 0.0);
    
    // Add noise modulation to edges
    if (noiseAmt > 0.0) {
        float noiseVal = simplexNoise(pixelPos * 0.01) * noiseAmt * thickness * 0.3;
        minDist += noiseVal;
    }
    
    return minDist;
}

// Sample fire with multiple layers
vec4 sampleFireLayer(vec3 loc, vec4 scale, float layerOffset, float speedMult, float brightnessMult) {
    loc.xz = loc.xz * 2.0 - 1.0;
    vec2 st = vec2(sqrt(dot(loc.xz, loc.xz)), loc.y);
    
    // Apply easing without resetting motion at cycle boundaries.
    float timeAdjusted = uTime;
    timeAdjusted = easedCycleTime(timeAdjusted, uAnimationEasing);
    float pulseWave = uPulseEnabled ? sin(uTime * uPulseSpeed) * uPulseAmount : 0.0;
    
    loc.y -= timeAdjusted * scale.w * uFlameSpeed * speedMult;
    loc *= scale.xyz;
    loc.y += layerOffset;
    
    // Lower octave count when high quality textures are disabled.
    int effectiveOctaves = uNoiseOctaves;
    if (!uUseHighQualityTextures && effectiveOctaves > 4) {
        effectiveOctaves = 4;
    }
    float offset = sqrt(st.y) * uFlameIntensity * fbm(loc.xy * uDetailScale, effectiveOctaves);
    st.y += offset;
    
    if (st.y > 1.0) {
        return vec4(0.0, 0.0, 0.0, 0.0);
    }
    
    vec4 result = texture2D(uFireProfile, st);
    
    // Fade bottom
    if (st.y < 0.1) {
        result *= st.y / 0.1;
    }
    
    // Apply blackbody color or custom color
    float temp = result.r; // Use red channel as temperature
    vec3 bbColor = blackbodyColor(temp);
    vec3 hotCore = mix(bbColor, vec3(1.0, 0.92, 0.68), clamp(temp * uCoreWhiteness, 0.0, 1.0));
    vec3 emberEdge = mix(vec3(0.42, 0.055, 0.012), uFlameColor, 0.58);
    result.rgb = mix(emberEdge * result.rgb, hotCore, clamp(temp * 0.76 + uCoreWhiteness * 0.18, 0.0, 1.0));
    
    // Apply brightness multiplier for this layer
    result.rgb *= brightnessMult;
    float pulseBrightness = 1.0 + pulseWave * 0.35;
    float pulseAlpha = 1.0 + pulseWave * 0.18;
    result.rgb *= pulseBrightness;
    result.a *= pulseAlpha;
    
    // Fake depth (inner glow)
    if (uDepthIntensity > 0.0) {
        float depth = result.r * uDepthIntensity;
        result.rgb += vec3(depth) * 0.5;
    }
    
    return result;
}

float cinematicSpark(vec2 pixelPos, vec2 frameResolution, float edgeDist, float seedOffset) {
    vec2 cell = vec2(38.0, 84.0);
    vec2 moving = vec2(pixelPos.x / cell.x, (pixelPos.y + uTime * (85.0 + seedOffset * 27.0)) / cell.y);
    vec2 id = floor(moving);
    vec2 gv = fract(moving) - 0.5;
    float rnd = hash(id + vec2(seedOffset));
    if (rnd > 0.18 * uSparkDensity) return 0.0;
    vec2 drift = (random2(id + vec2(seedOffset)) - 0.5) * vec2(0.72, 0.34);
    float dist = length(gv - drift);
    float lift = smoothstep(0.02, 0.82, edgeDist);
    float emberLife = smoothstep(1.0, 0.08, fract(moving.y + rnd));
    return exp(-dist * dist * 190.0) * lift * emberLife * uSparkDensity;
}

vec3 cinematicToneMap(vec3 color, float alpha, float edgeDist) {
    float contrast = max(uCinematicContrast, 0.01);
    color = pow(max(color, vec3(0.0)), vec3(1.0 / contrast));
    float rim = pow(1.0 - clamp(edgeDist, 0.0, 1.0), 2.2);
    vec3 hot = vec3(1.0, 0.9, 0.62) * rim * alpha * (0.28 + uCoreWhiteness * 0.32);
    vec3 deep = vec3(0.16, 0.012, 0.0) * (1.0 - alpha) * 0.18;
    return color + hot + deep;
}

void main() {
    vec2 uv = vTexCoord;
    vec2 pixelPos = gl_FragCoord.xy - uFrameRect.xy;
    vec2 frameResolution = uFrameRect.zw;
    
    if (pixelPos.x < 0.0 || pixelPos.y < 0.0 || pixelPos.x > frameResolution.x || pixelPos.y > frameResolution.y) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    
    // Determine if we're in a frame area
    bool inFrame = false;
    float edgeDist = 0.0;
    
    if (uFrameMode == 0) {
        // Bottom only
        if (uFrameCurve > 0.0 || uFrameNoiseAmount > 0.0) {
            float dist = getCurvedFrameDistance(pixelPos, frameResolution, uFrameThickness, uFrameCurve, uFrameNoiseAmount);
            if (pixelPos.y < uFrameThickness && dist < uFrameThickness) {
                inFrame = true;
                edgeDist = pixelPos.y / uFrameThickness;
            }
        } else {
            if (pixelPos.y < uFrameThickness) {
                inFrame = true;
                edgeDist = pixelPos.y / uFrameThickness;
            }
        }
    } else if (uFrameMode == 1) {
        // Top only
        if (pixelPos.y > frameResolution.y - uFrameThickness) {
            inFrame = true;
            edgeDist = (frameResolution.y - pixelPos.y) / uFrameThickness;
        }
    } else if (uFrameMode == 2) {
        // Sides only
        if (pixelPos.x < uFrameThickness || pixelPos.x > frameResolution.x - uFrameThickness) {
            inFrame = true;
            if (pixelPos.x < uFrameThickness) {
                edgeDist = pixelPos.x / uFrameThickness;
            } else {
                edgeDist = (frameResolution.x - pixelPos.x) / uFrameThickness;
            }
        }
    } else {
        // All edges with curve support
        float minDist;
        if (uFrameCurve > 0.0 || uFrameNoiseAmount > 0.0) {
            minDist = getCurvedFrameDistance(pixelPos, frameResolution, uFrameThickness, uFrameCurve, uFrameNoiseAmount);
        } else {
            float distFromLeft = pixelPos.x;
            float distFromRight = frameResolution.x - pixelPos.x;
            float distFromBottom = pixelPos.y;
            float distFromTop = frameResolution.y - pixelPos.y;
            minDist = min(min(distFromLeft, distFromRight), min(distFromBottom, distFromTop));
        }
        
        if (minDist < uFrameThickness) {
            inFrame = true;
            edgeDist = minDist / uFrameThickness;
        }
    }
    
    if (!inFrame) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    
    vec2 effectUv = clamp(pixelPos / frameResolution, 0.0, 1.0);
    vec2 flameUv = effectUv;
    if (uHeatDistortionStrength > 0.0) {
        float heatNoise = fbm(vec2(effectUv.x * 6.0, edgeDist * 3.0 - uTime * 0.42), 4);
        float shimmer = sin((effectUv.x + heatNoise * 0.12) * 48.0 + uTime * 6.2);
        flameUv.x += (heatNoise * 0.018 + shimmer * 0.0035) * uHeatDistortionStrength * smoothstep(0.03, 0.65, edgeDist);
        flameUv.x = clamp(flameUv.x, 0.0, 1.0);
    }

    // Multi-layer compositing
    vec4 finalColor = vec4(0.0);
    
    if (uLayersEnabled && uLayerCount > 1) {
        // Background layer: large, slow, dark
        vec3 samplePos1 = vec3(flameUv.x, edgeDist, flameUv.y);
        samplePos1.x += uLayerParallax * 0.02;
        vec4 layer1 = sampleFireLayer(samplePos1, vec4(0.8, 2.0, 0.8, 0.5), 0.0, 0.5, 0.6 * uFlameBrightness);
        finalColor = layer1;
        
        // Midground layer: normal
        vec3 samplePos2 = vec3(flameUv.x, edgeDist, flameUv.y);
        vec4 layer2 = sampleFireLayer(samplePos2, vec4(1.0, 2.0, 1.0, 0.5), 0.0, 1.0, 1.0 * uFlameBrightness);
        finalColor = mix(finalColor, layer2, layer2.a);
        
        if (uLayerCount >= 3) {
            // Foreground layer: small, fast, bright
            vec3 samplePos3 = vec3(flameUv.x, edgeDist, flameUv.y);
            samplePos3.x -= uLayerParallax * 0.02;
            vec4 layer3 = sampleFireLayer(samplePos3, vec4(1.2, 2.0, 1.2, 0.5), 0.0, 1.5, 1.2 * uFlameBrightness);
            finalColor = mix(finalColor, layer3, layer3.a);
        }
    } else {
        // Single layer
        vec3 samplePos = vec3(flameUv.x, edgeDist, flameUv.y);
        finalColor = sampleFireLayer(samplePos, vec4(1.0, 2.0, 1.0, 0.5), 0.0, 1.0, uFlameBrightness);
    }
    
    // Apply soft edge blending / feathering
    if (uEdgeFeather > 0.0) {
        float featherDist = uFrameThickness * uEdgeFeather;
        float featherNoise = simplexNoise(pixelPos * 0.02) * 0.5 + 0.5;
        float featherAmount = smoothstep(0.0, featherDist / uFrameThickness, edgeDist);
        featherAmount = mix(featherAmount, featherAmount * featherNoise, 0.3);
        finalColor.a *= featherAmount;
    } else if (uMaskEdges) {
        finalColor.a *= smoothstep(0.0, 0.3, edgeDist);
    }

    float rim = pow(1.0 - clamp(edgeDist, 0.0, 1.0), 2.4);
    float hotCore = rim * finalColor.a;
    float filament = pow(max(0.0, sin(pixelPos.x * 0.045 + uTime * 8.0)), 12.0) * rim;
    float sparkA = cinematicSpark(pixelPos, frameResolution, edgeDist, 1.0) +
        cinematicSpark(pixelPos + vec2(19.0, 7.0), frameResolution, edgeDist, 5.0) * 0.65;
    vec3 sparkColor = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.92, 0.62), clamp(sparkA * 2.2, 0.0, 1.0));
    finalColor.rgb += vec3(1.0, 0.82, 0.42) * hotCore * 0.26 * uFlameBrightness;
    finalColor.rgb += mix(uFlameColor, vec3(1.0, 0.9, 0.55), 0.45) * filament * 0.2;
    finalColor.rgb += sparkColor * sparkA * (0.65 + uEmberTrailAmount * 0.7);
    finalColor.rgb = cinematicToneMap(finalColor.rgb, finalColor.a, edgeDist);
    finalColor.a = clamp(finalColor.a + hotCore * 0.1 + filament * 0.05 + sparkA * 0.46, 0.0, 1.0);
    
    gl_FragColor = finalColor;
}
`;
        
        this.programs.flames = this.createProgram(vertexShaderSource, fragmentShaderSource, 'flames');
    }
    
    setupSmokeShaders() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelViewMatrix;
            
            varying vec2 vTexCoord;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
            }
        `;
        
        // Inline smoke.frag shader
        const fragmentShaderSource = `precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uFrameRect;
uniform float uFrameThickness;
uniform int uFrameMode;
uniform float uSmokeIntensity;
uniform float uSmokeSpeed;
uniform vec3 uSmokeColor;
uniform float uDetailScale;

varying vec2 vTexCoord;

// Simplex noise (inline for smoke shader)
vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289_2(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
    return mod289(((x * 34.0) + 1.0) * x);
}

float simplexNoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289_2(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

// Multi-octave noise for smoke
float smokeFbm(vec2 p) {
    float sum = 0.0;
    float freq = 1.0;
    float amp = 1.0;
    
    for (int i = 0; i < 6; i++) {
        sum += simplexNoise(p * freq) * amp;
        freq *= 2.0;
        amp *= 0.5;
    }
    
    return sum;
}

void main() {
    vec2 pixelPos = gl_FragCoord.xy - uFrameRect.xy;
    vec2 frameResolution = uFrameRect.zw;
    
    if (pixelPos.x < 0.0 || pixelPos.y < 0.0 || pixelPos.x > frameResolution.x || pixelPos.y > frameResolution.y) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    
    // Determine if we're in frame area (reuse same logic as flame)
    bool inFrame = false;
    float edgeDist = 0.0;
    
    if (uFrameMode == 0) {
        // Bottom only
        if (pixelPos.y < uFrameThickness) {
            inFrame = true;
            edgeDist = pixelPos.y / uFrameThickness;
        }
    } else if (uFrameMode == 1) {
        // Top only
        if (pixelPos.y > frameResolution.y - uFrameThickness) {
            inFrame = true;
            edgeDist = (frameResolution.y - pixelPos.y) / uFrameThickness;
        }
    } else if (uFrameMode == 2) {
        // Sides only
        if (pixelPos.x < uFrameThickness || pixelPos.x > frameResolution.x - uFrameThickness) {
            inFrame = true;
            if (pixelPos.x < uFrameThickness) {
                edgeDist = pixelPos.x / uFrameThickness;
            } else {
                edgeDist = (frameResolution.x - pixelPos.x) / uFrameThickness;
            }
        }
    } else {
        // All edges
        float distFromLeft = pixelPos.x;
        float distFromRight = frameResolution.x - pixelPos.x;
        float distFromBottom = pixelPos.y;
        float distFromTop = frameResolution.y - pixelPos.y;
        float minDist = min(min(distFromLeft, distFromRight), min(distFromBottom, distFromTop));
        
        if (minDist < uFrameThickness) {
            inFrame = true;
            edgeDist = minDist / uFrameThickness;
        }
    }
    
    if (!inFrame) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    
    vec2 effectUv = clamp(pixelPos / frameResolution, 0.0, 1.0);

    // Smoke moves upward slowly
    vec2 smokePos = effectUv;
    smokePos.y += uTime * uSmokeSpeed * 0.1;
    smokePos.x += simplexNoise(vec2(effectUv.y * 3.0, uTime * 0.5)) * 0.1;
    
    // Create wispy smoke pattern
    float smoke = smokeFbm(smokePos * uDetailScale * 2.0);
    smoke = smoothstep(0.3, 0.8, smoke);
    
    // Dissipate as it rises
    float dissipation = 1.0 - edgeDist;
    dissipation = pow(dissipation, 2.0);
    
    smoke *= dissipation * uSmokeIntensity;
    
    // Apply smoke color with transparency
    vec4 smokeColor = vec4(uSmokeColor, smoke * 0.5);
    
    gl_FragColor = smokeColor;
}
`;
        
        this.programs.smoke = this.createProgram(vertexShaderSource, fragmentShaderSource, 'smoke');
    }
    
    setupParticleShaders() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelViewMatrix;
            
            varying vec2 vTexCoord;
            varying vec3 vPosition;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
                vPosition = aPosition;
            }
        `;
        
        const fragmentShaderSource = `
            precision highp float;
            
            uniform float uTime;
            uniform vec3 uFlameColor;
            uniform float uFlameSpeed;
            uniform float uFlameIntensity;
            uniform float uFlameBrightness;
            uniform vec2 uResolution;
            uniform vec4 uFrameRect;
            uniform float uFrameThickness;
            uniform int uFrameMode;
            
            varying vec2 vTexCoord;
            
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }
            
            vec4 renderParticles(vec2 uv, vec2 pixelPos, vec2 frameResolution, float edgeDist) {
                vec4 color = vec4(0.0);
                
                for (int layer = 0; layer < 3; layer++) {
                    float layerF = float(layer);
                    float layerOffset = layerF * 0.37;
                    float particleCount = 16.0 + layerF * 8.0;
                    
                    for (float i = 0.0; i < 32.0; i += 1.0) {
                        if (i >= particleCount) break;
                        
                        vec2 seed = vec2(i + layerF * 100.0, layerOffset);
                        
                        // Individual phase so particles are staggered in time
                        float phase = random(seed) * 6.28318;
                        float particleTime = uTime * uFlameSpeed + phase;
                        
                        // Horizontal position: random + very slow drift
                        float x = fract(random(seed + vec2(0.1, 0.0)) + particleTime * 0.025);
                        // Vertical: rises through the frame region
                        float life = fract(particleTime * 0.35);
                        float y = life * uFrameThickness;
                        
                        vec2 particlePos = vec2(x * frameResolution.x, y);
                        
                        // Velocity direction (upward with slight random horizontal drift)
                        float vx = (random(seed + vec2(0.5, 0.0)) - 0.5) * 18.0;
                        float vy = uFrameThickness * 0.55;
                        vec2 vel = normalize(vec2(vx, vy));
                        
                        // Size: varies by layer and shrinks near end of life
                        float baseSize = (4.0 + random(seed + vec2(0.2, 0.0)) * 14.0) * uFlameIntensity;
                        float size = baseSize * (1.0 - life * 0.45);
                        float blurLen = size * 2.5;
                        
                        // Motion-blur: elongate in velocity direction
                        vec2 toParticle = pixelPos - particlePos;
                        float velProj = dot(toParticle, vel);
                        vec2 clampedProj = clamp(velProj, -blurLen * 0.5, blurLen * 0.5) * vel;
                        float closestDist = length(toParticle - clampedProj);
                        
                        // Soft Gaussian glow falloff plus a compact hot core.
                        float alpha = exp(-closestDist * closestDist / (size * size));
                        float spark = exp(-closestDist * closestDist / (size * size * 0.08));
                        alpha *= (1.0 - life * 0.8);
                        spark *= smoothstep(1.0, 0.15, life);
                        
                        if (alpha > 0.001) {
                            // Temperature-based color: hot near base, cooler at top
                            float temp = 1.0 - life * 0.7;
                            vec3 hotColor = vec3(1.0, 0.95, 0.65);
                            vec3 pColor = mix(uFlameColor, hotColor, temp * 0.55);
                            
                            color.rgb += pColor * alpha * 0.62;
                            color.rgb += hotColor * spark * 1.35;
                            color.a += alpha * 0.55 + spark * 0.35;
                        }
                    }
                }

                float rim = pow(1.0 - clamp(edgeDist, 0.0, 1.0), 3.0);
                float shimmer = pow(max(0.0, sin(pixelPos.x * 0.035 + uTime * 7.0)), 18.0) * rim;
                color.rgb += mix(uFlameColor, vec3(1.0, 0.85, 0.45), 0.55) * shimmer * 0.35;
                color.a += shimmer * 0.18;
                
                return color * uFlameBrightness * 1.8;
            }
            
            void main() {
                vec2 pixelPos = gl_FragCoord.xy - uFrameRect.xy;
                vec2 frameResolution = uFrameRect.zw;
                
                if (pixelPos.x < 0.0 || pixelPos.y < 0.0 || pixelPos.x > frameResolution.x || pixelPos.y > frameResolution.y) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                    return;
                }
                
                bool inFrame = false;
                float edgeDist = 0.0;
                
                if (uFrameMode == 0) {
                    if (pixelPos.y < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.y / uFrameThickness;
                    }
                } else if (uFrameMode == 1) {
                    if (pixelPos.y > frameResolution.y - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (frameResolution.y - pixelPos.y) / uFrameThickness;
                        pixelPos.y = frameResolution.y - pixelPos.y;
                    }
                } else if (uFrameMode == 2) {
                    if (pixelPos.x < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.x / uFrameThickness;
                        vec2 originalPos = pixelPos;
                        pixelPos.x = originalPos.y;
                        pixelPos.y = originalPos.x;
                    } else if (pixelPos.x > frameResolution.x - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (frameResolution.x - pixelPos.x) / uFrameThickness;
                        vec2 originalPos = pixelPos;
                        pixelPos.x = originalPos.y;
                        pixelPos.y = frameResolution.x - originalPos.x;
                    }
                } else {
                    float distFromLeft = pixelPos.x;
                    float distFromRight = frameResolution.x - pixelPos.x;
                    float distFromBottom = pixelPos.y;
                    float distFromTop = frameResolution.y - pixelPos.y;
                    float minDist = min(min(distFromLeft, distFromRight), min(distFromBottom, distFromTop));
                    if (minDist < uFrameThickness) {
                        inFrame = true;
                        edgeDist = minDist / uFrameThickness;
                    }
                }
                
                if (!inFrame) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                    return;
                }
                
                gl_FragColor = renderParticles(vTexCoord, pixelPos, frameResolution, edgeDist);
                gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 1.0);
            }
        `;
        
        this.programs.particles = this.createProgram(vertexShaderSource, fragmentShaderSource, 'particles');
    }

    
    setupEnergyShaders() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelViewMatrix;
            
            varying vec2 vTexCoord;
            varying vec3 vPosition;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
                vPosition = aPosition;
            }
        `;
        
        const fragmentShaderSource = `
            precision highp float;
            
            uniform float uTime;
            uniform vec3 uFlameColor;
            uniform float uFlameSpeed;
            uniform float uFlameIntensity;
            uniform float uFlameBrightness;
            uniform vec2 uResolution;
            uniform vec4 uFrameRect;
            uniform float uFrameThickness;
            uniform int uFrameMode;
            
            varying vec2 vTexCoord;
            
            // Value noise for UV distortion
            float valueNoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                float a = fract(sin(dot(i,               vec2(127.1, 311.7))) * 43758.5453);
                float b = fract(sin(dot(i + vec2(1.0,0.0), vec2(127.1, 311.7))) * 43758.5453);
                float c = fract(sin(dot(i + vec2(0.0,1.0), vec2(127.1, 311.7))) * 43758.5453);
                float d = fract(sin(dot(i + vec2(1.0,1.0), vec2(127.1, 311.7))) * 43758.5453);
                return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
            }
            
            vec4 renderEnergyWaves(vec2 uv, vec2 pixelPos, float edgeDist) {
                vec4 color = vec4(0.0);
                
                // Noise-based UV distortion to break up the wave regularity
                float distNoise = valueNoise(uv * 5.0 + uTime * 0.25) * 0.07 - 0.035;
                vec2 distUV = uv + vec2(distNoise, distNoise * 0.6);
                
                // Multiple distorted wave layers with even angular spacing
                for (int i = 0; i < 5; i++) {
                    float fi = float(i);
                    float offset = fi * 1.2566; // 2*PI/5
                    
                    float wave = sin(distUV.x * 18.0 + uTime * uFlameSpeed * 2.5 + offset) *
                                 cos(distUV.x * 13.0 - uTime * uFlameSpeed * 1.8 + offset * 1.3);
                    wave += sin(distNoise * 14.0 + uTime * 0.6) * 0.28;
                    wave *= uFlameIntensity * 0.5;
                    
                    float waveCenter = wave * 0.4 + 0.5 + fi * 0.06;
                    float waveDist = abs(edgeDist - fract(waveCenter));
                    // Gaussian band — tight, glowing lines
                    float waveIntensity = exp(-waveDist * waveDist * 220.0);
                    
                    // Fresnel-like concentration: energy concentrates where distance gradient peaks
                    float fresnel = sqrt(edgeDist) * (1.0 - edgeDist);
                    waveIntensity *= (0.6 + fresnel * 2.2);
                    
                    vec3 waveColor = mix(
                        uFlameColor * 0.4,
                        uFlameColor * 2.4,
                        fi / 4.0
                    );
                    
                    color.rgb += waveColor * waveIntensity * 0.4;
                    color.a  += waveIntensity * 0.35;
                }
                
                // Pulsing glow synchronized to wave peaks
                float pulse = (sin(uTime * uFlameSpeed * 2.0) + 1.0) * 0.5;
                
                // Fresnel edge glow: bright rim at both the inner and outer boundary
                float edgeFresnel = pow(1.0 - abs(edgeDist * 2.0 - 1.0), 3.0);
                color.rgb += uFlameColor * edgeFresnel * (0.3 + 0.2 * pulse);
                color.a  += edgeFresnel * (0.2 + 0.15 * pulse);
                
                // Flowing energy with noise distortion
                float flow = sin(distUV.x * 9.0 + uTime * uFlameSpeed * 3.5 + distNoise * 5.0) *
                             cos(distUV.y * 7.0 - uTime * uFlameSpeed * 2.2);
                flow = (flow + 1.0) * 0.5;
                color.rgb += uFlameColor * flow * 0.14;
                color.a  += flow * 0.08;
                
                // Modulate overall brightness with pulse
                color.rgb *= (0.88 + 0.12 * pulse);
                
                return color * uFlameBrightness * 2.0;
            }
            
            void main() {
                vec2 pixelPos = gl_FragCoord.xy - uFrameRect.xy;
                vec2 frameResolution = uFrameRect.zw;
                
                if (pixelPos.x < 0.0 || pixelPos.y < 0.0 || pixelPos.x > frameResolution.x || pixelPos.y > frameResolution.y) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                    return;
                }
                
                bool inFrame = false;
                float edgeDist = 0.0;
                
                if (uFrameMode == 0) {
                    if (pixelPos.y < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.y / uFrameThickness;
                    }
                } else if (uFrameMode == 1) {
                    if (pixelPos.y > frameResolution.y - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (frameResolution.y - pixelPos.y) / uFrameThickness;
                    }
                } else if (uFrameMode == 2) {
                    if (pixelPos.x < uFrameThickness || pixelPos.x > frameResolution.x - uFrameThickness) {
                        inFrame = true;
                        if (pixelPos.x < uFrameThickness) {
                            edgeDist = pixelPos.x / uFrameThickness;
                        } else {
                            edgeDist = (frameResolution.x - pixelPos.x) / uFrameThickness;
                        }
                    }
                } else {
                    float distFromLeft   = pixelPos.x;
                    float distFromRight  = frameResolution.x - pixelPos.x;
                    float distFromBottom = pixelPos.y;
                    float distFromTop    = frameResolution.y - pixelPos.y;
                    float minDist = min(min(distFromLeft, distFromRight), min(distFromBottom, distFromTop));
                    if (minDist < uFrameThickness) {
                        inFrame = true;
                        edgeDist = minDist / uFrameThickness;
                    }
                }
                
                if (!inFrame) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                    return;
                }
                
                vec2 effectUv = clamp(pixelPos / frameResolution, 0.0, 1.0);
                gl_FragColor = renderEnergyWaves(effectUv, pixelPos, edgeDist);
                gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 1.0);
            }
        `;
        
        this.programs.energy = this.createProgram(vertexShaderSource, fragmentShaderSource, 'energy');
    }

    
    setupLightningShaders() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelViewMatrix;
            
            varying vec2 vTexCoord;
            varying vec3 vPosition;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
                vPosition = aPosition;
            }
        `;
        
        const fragmentShaderSource = `
            precision highp float;
            
            uniform float uTime;
            uniform vec3 uFlameColor;
            uniform float uFlameSpeed;
            uniform float uFlameIntensity;
            uniform float uFlameBrightness;
            uniform vec2 uResolution;
            uniform vec4 uFrameRect;
            uniform float uFrameThickness;
            uniform int uFrameMode;
            
            varying vec2 vTexCoord;
            
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
            }
            
            // Multi-octave noise-based displacement along the bolt path
            float boltDisplacement(float progress, float seed, float t) {
                float disp = 0.0;
                float amp  = 0.10;
                float freq = 1.0;
                for (int oct = 0; oct < 5; oct++) {
                    disp += sin(progress * freq * 9.0 + t * 3.5 + seed * 6.3) * amp;
                    freq *= 2.0;
                    amp  *= 0.5;
                }
                return disp * uFlameIntensity;
            }
            
            vec4 renderLightning(vec2 uv, vec2 pixelPos, float edgeDist) {
                vec4 color = vec4(0.0);
                
                float boltCount = 3.0 + floor(uFlameIntensity * 3.0);
                
                for (float i = 0.0; i < 7.0; i += 1.0) {
                    if (i >= boltCount) break;
                    
                    float seed      = i * 1.7321 + 0.123;
                    float boltTime  = uTime * uFlameSpeed + i * 0.5;
                    
                    // Per-bolt random on/off flickering (different rate per bolt)
                    float flickerRate = 6.0 + random(vec2(i, 0.1)) * 6.0;
                    float flickerSeed = floor(boltTime * flickerRate) + i * 13.7;
                    float isOn = step(0.35, random(vec2(flickerSeed, flickerSeed * 0.3)));
                    if (isOn < 0.5) continue;
                    
                    // Bolt X position, changes slowly over time
                    float boltX = random(vec2(floor(boltTime * 0.4) + seed, seed * 0.7));
                    
                    // Noise-based displacement at current edgeDist (continuous along height)
                    float mainDisp = boltDisplacement(edgeDist, seed, boltTime);
                    float totalX   = boltX + mainDisp;
                    
                    float distToMain = abs(uv.x - totalX);
                    float glowRadius = 0.035 + uFlameIntensity * 0.018;
                    
                    if (distToMain < glowRadius * 5.0) {
                        // Core: very tight bright white-blue line
                        float core = exp(-distToMain * distToMain * 1200.0);
                        // Wide glow halo
                        float glow = exp(-distToMain * distToMain / (glowRadius * glowRadius));
                        // Intensity flicker (independent from on/off)
                        float flicker = 0.65 + 0.35 * sin(uTime * 18.0 + i * 2.7);
                        
                        vec3 coreColor = vec3(0.85, 0.92, 1.0);
                        color.rgb += (coreColor * core + uFlameColor * glow) * flicker;
                        color.a   += (core * 0.9 + glow * 0.55) * flicker;
                    }
                    
                    // Branch bolt: forks off from main bolt partway up
                    float branchStart = 0.2 + random(vec2(seed, 3.3)) * 0.45;
                    if (edgeDist > branchStart) {
                        float branchProg = (edgeDist - branchStart) / max(1.0 - branchStart, 0.001);
                        float branchDisp = boltDisplacement(branchProg, seed + 17.3, boltTime);
                        float branchDir  = (random(vec2(seed, 5.1)) > 0.5) ? 1.0 : -1.0;
                        float branchX    = totalX + branchDir * 0.025 + branchDisp * 0.55;
                        
                        float distToBranch = abs(uv.x - branchX);
                        float branchGlow   = exp(-distToBranch * distToBranch / (glowRadius * 0.6 * glowRadius * 0.6));
                        // Branch fades toward its tip
                        branchGlow *= (1.0 - branchProg * 0.8);
                        
                        float bFlicker = 0.55 + 0.45 * sin(uTime * 22.0 + i * 3.1);
                        color.rgb += uFlameColor * branchGlow * 0.55 * bFlicker;
                        color.a   += branchGlow * 0.35 * bFlicker;
                    }
                }
                
                // Ambient electric field with noise-based distortion
                float ambNoise = random(vec2(floor(uv.x * 30.0 + uTime * 2.0), floor(uv.y * 20.0)));
                float field = sin(uv.x * 28.0 + uTime * uFlameSpeed * 4.5 + ambNoise * 0.8) *
                              cos(edgeDist * 18.0 - uTime * uFlameSpeed * 2.8);
                field = (field + 1.0) * 0.5;
                color.rgb += uFlameColor * field * 0.07;
                color.a   += field * 0.04;
                
                return color * uFlameBrightness * 2.8;
            }
            
            void main() {
                vec2 pixelPos = gl_FragCoord.xy - uFrameRect.xy;
                vec2 frameResolution = uFrameRect.zw;
                
                if (pixelPos.x < 0.0 || pixelPos.y < 0.0 || pixelPos.x > frameResolution.x || pixelPos.y > frameResolution.y) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                    return;
                }
                
                bool inFrame = false;
                float edgeDist = 0.0;
                
                if (uFrameMode == 0) {
                    if (pixelPos.y < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.y / uFrameThickness;
                    }
                } else if (uFrameMode == 1) {
                    if (pixelPos.y > frameResolution.y - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (frameResolution.y - pixelPos.y) / uFrameThickness;
                    }
                } else if (uFrameMode == 2) {
                    if (pixelPos.x < uFrameThickness || pixelPos.x > frameResolution.x - uFrameThickness) {
                        inFrame = true;
                        if (pixelPos.x < uFrameThickness) {
                            edgeDist = pixelPos.x / uFrameThickness;
                        } else {
                            edgeDist = (frameResolution.x - pixelPos.x) / uFrameThickness;
                        }
                    }
                } else {
                    float distFromLeft   = pixelPos.x;
                    float distFromRight  = frameResolution.x - pixelPos.x;
                    float distFromBottom = pixelPos.y;
                    float distFromTop    = frameResolution.y - pixelPos.y;
                    float minDist = min(min(distFromLeft, distFromRight), min(distFromBottom, distFromTop));
                    if (minDist < uFrameThickness) {
                        inFrame = true;
                        edgeDist = minDist / uFrameThickness;
                    }
                }
                
                if (!inFrame) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                    return;
                }
                
                vec2 effectUv = clamp(pixelPos / frameResolution, 0.0, 1.0);
                gl_FragColor = renderLightning(effectUv, pixelPos, edgeDist);
                gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 1.0);
            }
        `;
        
        this.programs.lightning = this.createProgram(vertexShaderSource, fragmentShaderSource, 'lightning');
    }

    
    createProgram(vertexSource, fragmentSource, name) {
        const vertexShader = this.compileShader(vertexSource, this.gl.VERTEX_SHADER);
        const fragmentShader = this.compileShader(fragmentSource, this.gl.FRAGMENT_SHADER);
        
        if (!vertexShader || !fragmentShader) {
            console.error('Shader compilation failed for effect:', name || 'unknown');
            return null;
        }
        
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Shader program link error:', this.gl.getProgramInfoLog(program));
            return null;
        }
        
        return program;
    }
    
    compileShader(source, type) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    switchEffect(effectType) {
        const effectMap = {
            'flames': 'flames',
            'particles': 'particles',
            'energy': 'energy',
            'lightning': 'lightning'
        };

        if (!Object.prototype.hasOwnProperty.call(effectMap, effectType)) {
            console.warn(`Unknown effect '${effectType}' rejected`);
            return false;
        }

        let programKey = effectMap[effectType];
        let program = this.programs[programKey];

        if (!program) {
            const fallbackKey = Object.keys(effectMap).find(key => this.programs[effectMap[key]]);
            if (!fallbackKey) {
                console.warn(`Program '${programKey}' not available and no fallback program exists`);
                return false;
            }
            console.warn(`Program '${programKey}' not available, falling back to '${fallbackKey}'`);
            programKey = effectMap[fallbackKey];
            program = this.programs[programKey];
        }

        this.currentProgram = program;
        this.config.effectType = programKey;
        
        if (this.currentProgram) {
            this.gl.useProgram(this.currentProgram);
            this.setupUniformsForProgram(this.currentProgram);
            this.updateUniforms();
        }

        return true;
    }
    
    setupUniformsForProgram(program) {
        this.gl.useProgram(program);
        
        // Standard uniforms
        this.uniforms = {
            time: this.gl.getUniformLocation(program, 'uTime'),
            flameColor: this.gl.getUniformLocation(program, 'uFlameColor'),
            flameSpeed: this.gl.getUniformLocation(program, 'uFlameSpeed'),
            flameIntensity: this.gl.getUniformLocation(program, 'uFlameIntensity'),
            flameBrightness: this.gl.getUniformLocation(program, 'uFlameBrightness'),
            resolution: this.gl.getUniformLocation(program, 'uResolution'),
            frameRect: this.gl.getUniformLocation(program, 'uFrameRect'),
            frameThickness: this.gl.getUniformLocation(program, 'uFrameThickness'),
            frameMode: this.gl.getUniformLocation(program, 'uFrameMode'),
            maskEdges: this.gl.getUniformLocation(program, 'uMaskEdges'),
            projectionMatrix: this.gl.getUniformLocation(program, 'uProjectionMatrix'),
            modelViewMatrix: this.gl.getUniformLocation(program, 'uModelViewMatrix'),
            noiseTexture: this.gl.getUniformLocation(program, 'uNoiseTexture'),
            fireProfile: this.gl.getUniformLocation(program, 'uFireProfile'),
            // New v2.2.0 uniforms
            noiseOctaves: this.gl.getUniformLocation(program, 'uNoiseOctaves'),
            useHighQualityTextures: this.gl.getUniformLocation(program, 'uUseHighQualityTextures'),
            detailScale: this.gl.getUniformLocation(program, 'uDetailScale'),
            edgeFeather: this.gl.getUniformLocation(program, 'uEdgeFeather'),
            frameCurve: this.gl.getUniformLocation(program, 'uFrameCurve'),
            frameNoiseAmount: this.gl.getUniformLocation(program, 'uFrameNoiseAmount'),
            animationEasing: this.gl.getUniformLocation(program, 'uAnimationEasing'),
            pulseEnabled: this.gl.getUniformLocation(program, 'uPulseEnabled'),
            pulseAmount: this.gl.getUniformLocation(program, 'uPulseAmount'),
            pulseSpeed: this.gl.getUniformLocation(program, 'uPulseSpeed'),
            depthIntensity: this.gl.getUniformLocation(program, 'uDepthIntensity'),
            layersEnabled: this.gl.getUniformLocation(program, 'uLayersEnabled'),
            layerCount: this.gl.getUniformLocation(program, 'uLayerCount'),
            layerParallax: this.gl.getUniformLocation(program, 'uLayerParallax'),
            sparkDensity: this.gl.getUniformLocation(program, 'uSparkDensity'),
            heatDistortionStrength: this.gl.getUniformLocation(program, 'uHeatDistortionStrength'),
            cinematicContrast: this.gl.getUniformLocation(program, 'uCinematicContrast'),
            coreWhiteness: this.gl.getUniformLocation(program, 'uCoreWhiteness'),
            emberTrailAmount: this.gl.getUniformLocation(program, 'uEmberTrailAmount'),
            // Smoke uniforms
            smokeIntensity: this.gl.getUniformLocation(program, 'uSmokeIntensity'),
            smokeSpeed: this.gl.getUniformLocation(program, 'uSmokeSpeed'),
            smokeColor: this.gl.getUniformLocation(program, 'uSmokeColor')
        };
    }
    
    setupGeometry() {
        const vertices = new Float32Array([
            -1, -1, 0,
             1, -1, 0,
            -1,  1, 0,
             1,  1, 0
        ]);
        
        const texCoords = new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            1, 1
        ]);
        
        this.buffers.position = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        
        this.buffers.texCoord = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.texCoord);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);
    }
    
    loadTextures() {
        this.loadTexture('/plugins/flame-overlay/textures/nzw.png', 'noise', this.gl.LINEAR, this.gl.REPEAT);
        this.loadTexture('/plugins/flame-overlay/textures/firetex.png', 'fireProfile', this.gl.LINEAR, this.gl.CLAMP_TO_EDGE);
    }
    
    loadTexture(url, name, filter, wrap) {
        if (!this.textureImages) {
            this.textureImages = {};
        }

        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        
        this.gl.texImage2D(
            this.gl.TEXTURE_2D, 0, this.gl.RGBA,
            1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE,
            new Uint8Array([255, 255, 255, 255])
        );
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, filter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, wrap);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, wrap);
        
        const image = new Image();
        image.onload = () => {
            if (this.destroyed || this.contextLost) return;
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texImage2D(
                this.gl.TEXTURE_2D, 0, this.gl.RGBA,
                this.gl.RGBA, this.gl.UNSIGNED_BYTE, image
            );
            
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, filter);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, filter);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, wrap);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, wrap);
        };
        image.onerror = (error) => {
            console.warn(`Texture '${name}' failed to load, using placeholder`, error);
        };
        image.src = url;
        
        this.textures[name] = texture;
        this.textureImages[name] = image;
    }
    
    initParticles() {
        this.particles = [];
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : { r: 1, g: 0.4, b: 0 };
    }
    
    getFrameMode() {
        const modes = {
            'bottom': 0,
            'top': 1,
            'sides': 2,
            'all': 3
        };
        return modes[this.config.frameMode] ?? 0;
    }
    
    getAnimationEasing() {
        const easings = {
            'linear': 0,
            'sine': 1,
            'quad': 2,
            'elastic': 3
        };
        return easings[this.config.animationEasing] ?? 0;
    }
    
    calculateDetailScale() {
        if (!this.config.detailScaleAuto) {
            return 1.0;
        }
        // Auto-calculate based on canvas resolution
        const avgRes = (this.canvas.width + this.canvas.height) / 2;
        return Math.max(0.5, avgRes / 1000.0);
    }

    getQualitySettings() {
        const modes = {
            'low-load': {
                maxNoiseOctaves: 6,
                sparkScale: 0.35,
                bloomScale: 0.55,
                heatScale: 0.45,
                distortionSamples: 0.55
            },
            'obs-safe': {
                maxNoiseOctaves: 9,
                sparkScale: 0.82,
                bloomScale: 0.82,
                heatScale: 0.72,
                distortionSamples: 0.8
            },
            'max-quality': {
                maxNoiseOctaves: 12,
                sparkScale: 1.15,
                bloomScale: 1.05,
                heatScale: 1,
                distortionSamples: 1
            }
        };
        return modes[this.config.qualityMode] || modes['obs-safe'];
    }

    getEffectiveNoiseOctaves() {
        const quality = this.getQualitySettings();
        const configured = this.numberOr(this.config.noiseOctaves, 9);
        return Math.round(this.clamp(configured, 0, quality.maxNoiseOctaves));
    }

    getEffectiveSparkDensity() {
        if (this.config.sparkEnabled === false) return 0;
        const quality = this.getQualitySettings();
        return this.clamp(this.numberOr(this.config.sparkDensity, 0.78) * quality.sparkScale, 0, 2);
    }

    getEffectiveHeatDistortionStrength() {
        if (this.config.heatDistortionEnabled === false) return 0;
        const quality = this.getQualitySettings();
        return this.clamp(this.numberOr(this.config.heatDistortionStrength, 0.32) * quality.heatScale, 0, 1);
    }

    getEffectiveBloomIntensity() {
        const quality = this.getQualitySettings();
        return this.numberOr(this.config.bloomIntensity, 1.05) * quality.bloomScale;
    }

    getDevicePixelRatio() {
        if (!this.config.highDPI) return 1;
        return this.numberOr(window.devicePixelRatio, 1);
    }

    getScaledFrameThickness() {
        return this.numberOr(this.config.frameThickness, 150) * this.getDevicePixelRatio();
    }

    isGlowEnabled() {
        return this.config.enableGlow !== false && this.config.bloomEnabled === true;
    }

    getActiveFrameRectPixels() {
        const defaultRect = {
            x: 0,
            y: 0,
            width: this.canvas.width,
            height: this.canvas.height
        };
        const framePositions = this.config.framePositions;
        if (!Array.isArray(framePositions) || framePositions.length === 0) {
            return defaultRect;
        }

        const frame = framePositions[0] ?? {};
        const xPercent = this.clamp(this.numberOr(frame.x, 0), 0, 100);
        const yPercent = this.clamp(this.numberOr(frame.y, 0), 0, 100);
        const widthPercent = this.clamp(this.numberOr(frame.width, 100), 0, 100);
        const heightPercent = this.clamp(this.numberOr(frame.height, 100), 0, 100);
        const rightPercent = this.clamp(xPercent + widthPercent, 0, 100);
        const bottomPercent = this.clamp(yPercent + heightPercent, 0, 100);
        const resolvedWidthPercent = Math.max(0, rightPercent - xPercent);
        const resolvedHeightPercent = Math.max(0, bottomPercent - yPercent);

        if (resolvedWidthPercent <= 0 || resolvedHeightPercent <= 0) {
            return defaultRect;
        }

        const width = this.canvas.width * resolvedWidthPercent / 100;
        const height = this.canvas.height * resolvedHeightPercent / 100;

        return {
            x: this.canvas.width * xPercent / 100,
            y: this.canvas.height * (100 - yPercent - resolvedHeightPercent) / 100,
            width,
            height
        };
    }
    
    updateUniforms() {
        if (!this.gl || !this.currentProgram) return;
        
        this.gl.useProgram(this.currentProgram);
        
        const color = this.hexToRgb(this.valueOr(this.config.flameColor, '#ff6600'));
        if (this.hasUniform(this.uniforms.flameColor)) {
            this.gl.uniform3f(this.uniforms.flameColor, color.r, color.g, color.b);
        }
        
        if (this.hasUniform(this.uniforms.flameSpeed)) {
            this.gl.uniform1f(this.uniforms.flameSpeed, this.numberOr(this.config.flameSpeed, 0.5));
        }
        if (this.hasUniform(this.uniforms.flameIntensity)) {
            this.gl.uniform1f(this.uniforms.flameIntensity, this.numberOr(this.config.flameIntensity, 1.3));
        }
        if (this.hasUniform(this.uniforms.flameBrightness)) {
            this.gl.uniform1f(this.uniforms.flameBrightness, this.numberOr(this.config.flameBrightness, 0.25));
        }
        
        if (this.hasUniform(this.uniforms.frameThickness)) {
            this.gl.uniform1f(this.uniforms.frameThickness, this.getScaledFrameThickness());
        }
        if (this.hasUniform(this.uniforms.frameMode)) {
            this.gl.uniform1i(this.uniforms.frameMode, this.getFrameMode());
        }
        if (this.hasUniform(this.uniforms.maskEdges)) {
            this.gl.uniform1i(this.uniforms.maskEdges, this.config.maskOnlyEdges ? 1 : 0);
        }
        
        if (this.hasUniform(this.uniforms.resolution)) {
            this.gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        }
        if (this.hasUniform(this.uniforms.frameRect)) {
            const frameRect = this.getActiveFrameRectPixels();
            this.gl.uniform4f(this.uniforms.frameRect, frameRect.x, frameRect.y, frameRect.width, frameRect.height);
        }
        
        // New v2.2.0 uniforms
        if (this.hasUniform(this.uniforms.noiseOctaves)) {
            this.gl.uniform1i(this.uniforms.noiseOctaves, this.getEffectiveNoiseOctaves());
        }
        if (this.hasUniform(this.uniforms.useHighQualityTextures)) {
            this.gl.uniform1i(this.uniforms.useHighQualityTextures, this.config.useHighQualityTextures ? 1 : 0);
        }
        if (this.hasUniform(this.uniforms.detailScale)) {
            this.gl.uniform1f(this.uniforms.detailScale, this.calculateDetailScale());
        }
        if (this.hasUniform(this.uniforms.edgeFeather)) {
            this.gl.uniform1f(this.uniforms.edgeFeather, this.numberOr(this.config.edgeFeather, 0.0));
        }
        if (this.hasUniform(this.uniforms.frameCurve)) {
            this.gl.uniform1f(this.uniforms.frameCurve, this.numberOr(this.config.frameCurve, 0.0));
        }
        if (this.hasUniform(this.uniforms.frameNoiseAmount)) {
            this.gl.uniform1f(this.uniforms.frameNoiseAmount, this.numberOr(this.config.frameNoiseAmount, 0.0));
        }
        if (this.hasUniform(this.uniforms.animationEasing)) {
            this.gl.uniform1i(this.uniforms.animationEasing, this.getAnimationEasing());
        }
        if (this.hasUniform(this.uniforms.pulseEnabled)) {
            this.gl.uniform1i(this.uniforms.pulseEnabled, this.config.pulseEnabled ? 1 : 0);
        }
        if (this.hasUniform(this.uniforms.pulseAmount)) {
            this.gl.uniform1f(this.uniforms.pulseAmount, this.numberOr(this.config.pulseAmount, 0.0));
        }
        if (this.hasUniform(this.uniforms.pulseSpeed)) {
            this.gl.uniform1f(this.uniforms.pulseSpeed, this.numberOr(this.config.pulseSpeed, 1.0));
        }
        if (this.hasUniform(this.uniforms.depthIntensity)) {
            this.gl.uniform1f(this.uniforms.depthIntensity, this.numberOr(this.config.depthIntensity, 0.0));
        }
        if (this.hasUniform(this.uniforms.layersEnabled)) {
            this.gl.uniform1i(this.uniforms.layersEnabled, this.config.layersEnabled ? 1 : 0);
        }
        if (this.hasUniform(this.uniforms.layerCount)) {
            this.gl.uniform1i(this.uniforms.layerCount, this.numberOr(this.config.layerCount, 1));
        }
        if (this.hasUniform(this.uniforms.layerParallax)) {
            this.gl.uniform1f(this.uniforms.layerParallax, this.numberOr(this.config.layerParallax, 0.0));
        }
        if (this.hasUniform(this.uniforms.sparkDensity)) {
            this.gl.uniform1f(this.uniforms.sparkDensity, this.getEffectiveSparkDensity());
        }
        if (this.hasUniform(this.uniforms.heatDistortionStrength)) {
            this.gl.uniform1f(this.uniforms.heatDistortionStrength, this.getEffectiveHeatDistortionStrength());
        }
        if (this.hasUniform(this.uniforms.cinematicContrast)) {
            this.gl.uniform1f(this.uniforms.cinematicContrast, this.numberOr(this.config.cinematicContrast, 1.18));
        }
        if (this.hasUniform(this.uniforms.coreWhiteness)) {
            this.gl.uniform1f(this.uniforms.coreWhiteness, this.numberOr(this.config.coreWhiteness, 0.72));
        }
        if (this.hasUniform(this.uniforms.emberTrailAmount)) {
            this.gl.uniform1f(this.uniforms.emberTrailAmount, this.numberOr(this.config.emberTrailAmount, 0.42));
        }
        
        // Smoke uniforms
        if (this.hasUniform(this.uniforms.smokeIntensity)) {
            this.gl.uniform1f(this.uniforms.smokeIntensity, this.numberOr(this.config.smokeIntensity, 0.0));
        }
        if (this.hasUniform(this.uniforms.smokeSpeed)) {
            this.gl.uniform1f(this.uniforms.smokeSpeed, this.numberOr(this.config.smokeSpeed, 0.3));
        }
        if (this.hasUniform(this.uniforms.smokeColor)) {
            const smokeRgb = this.hexToRgb(this.valueOr(this.config.smokeColor, '#333333'));
            this.gl.uniform3f(this.uniforms.smokeColor, smokeRgb.r, smokeRgb.g, smokeRgb.b);
        }
        
        if (this.hasUniform(this.uniforms.noiseTexture) && this.textures.noise) {
            this.gl.uniform1i(this.uniforms.noiseTexture, 0);
        }
        if (this.hasUniform(this.uniforms.fireProfile) && this.textures.fireProfile) {
            this.gl.uniform1i(this.uniforms.fireProfile, 1);
        }
    }
    
    handleResize() {
        if (!this.canvas || !this.gl) return;

        const dpr = this.getDevicePixelRatio();
        const dimensions = this.getConfiguredCanvasDimensions();
        
        this.canvas.width = dimensions.width * dpr;
        this.canvas.height = dimensions.height * dpr;
        this.canvas.style.width = dimensions.width + 'px';
        this.canvas.style.height = dimensions.height + 'px';
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.postProcessor && this.canvas.width > 0 && this.canvas.height > 0) {
            this.postProcessor.resize(this.canvas.width, this.canvas.height);
        }
        
        this.updateUniforms();
    }
    
    renderScene() {
        const gl = this.gl;
        const time = (Date.now() - this.startTime) / 1000.0;

        const backgroundTint = this.hexToRgb(this.valueOr(this.config.backgroundTint, '#000000'));
        const backgroundTintOpacity = this.clamp(this.numberOr(this.config.backgroundTintOpacity, 0), 0, 1);
        gl.clearColor(backgroundTint.r, backgroundTint.g, backgroundTint.b, backgroundTintOpacity);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, this.config.enableAdditiveBlend ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
        
        gl.useProgram(this.currentProgram);
        
        if (this.uniforms.time) {
            gl.uniform1f(this.uniforms.time, time);
        }
        
        // Bind textures
        if (this.textures.noise) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.textures.noise);
        }
        if (this.textures.fireProfile) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.textures.fireProfile);
        }
        
        // Set matrices
        const projectionMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
        const modelViewMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
        
        if (this.uniforms.projectionMatrix) {
            gl.uniformMatrix4fv(this.uniforms.projectionMatrix, false, projectionMatrix);
        }
        if (this.uniforms.modelViewMatrix) {
            gl.uniformMatrix4fv(this.uniforms.modelViewMatrix, false, modelViewMatrix);
        }
        
        // Bind geometry
        const aPosition = gl.getAttribLocation(this.currentProgram, 'aPosition');
        if (aPosition !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
            gl.enableVertexAttribArray(aPosition);
            gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
        }
        
        const aTexCoord = gl.getAttribLocation(this.currentProgram, 'aTexCoord');
        if (aTexCoord !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
            gl.enableVertexAttribArray(aTexCoord);
            gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);
        }
        
        // Draw main effect
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        if (this.config.smokeEnabled && typeof this.renderSmoke === 'function') {
            this.renderSmoke(time);
        }
    }
    
    renderSmoke(time) {
        const gl = this.gl;
        if (!this.programs.smoke) return;
        
        const prevProgram = this.currentProgram;
        gl.useProgram(this.programs.smoke);
        
        // Cache smoke uniform locations on a dedicated property (not nested in this.uniforms)
        if (!this.smokeUniforms) {
            this.smokeUniforms = {
                time: gl.getUniformLocation(this.programs.smoke, 'uTime'),
                resolution: gl.getUniformLocation(this.programs.smoke, 'uResolution'),
                frameRect: gl.getUniformLocation(this.programs.smoke, 'uFrameRect'),
                frameThickness: gl.getUniformLocation(this.programs.smoke, 'uFrameThickness'),
                frameMode: gl.getUniformLocation(this.programs.smoke, 'uFrameMode'),
                smokeIntensity: gl.getUniformLocation(this.programs.smoke, 'uSmokeIntensity'),
                smokeSpeed: gl.getUniformLocation(this.programs.smoke, 'uSmokeSpeed'),
                smokeColor: gl.getUniformLocation(this.programs.smoke, 'uSmokeColor'),
                detailScale: gl.getUniformLocation(this.programs.smoke, 'uDetailScale'),
                projectionMatrix: gl.getUniformLocation(this.programs.smoke, 'uProjectionMatrix'),
                modelViewMatrix: gl.getUniformLocation(this.programs.smoke, 'uModelViewMatrix')
            };
        }
        
        // Set smoke-specific uniforms
        const smokeUniforms = this.smokeUniforms;
        if (this.hasUniform(smokeUniforms.time)) gl.uniform1f(smokeUniforms.time, time);
        if (this.hasUniform(smokeUniforms.resolution)) gl.uniform2f(smokeUniforms.resolution, this.canvas.width, this.canvas.height);
        if (this.hasUniform(smokeUniforms.frameRect)) {
            const frameRect = this.getActiveFrameRectPixels();
            gl.uniform4f(smokeUniforms.frameRect, frameRect.x, frameRect.y, frameRect.width, frameRect.height);
        }
        if (this.hasUniform(smokeUniforms.frameThickness)) gl.uniform1f(smokeUniforms.frameThickness, this.getScaledFrameThickness());
        if (this.hasUniform(smokeUniforms.frameMode)) gl.uniform1i(smokeUniforms.frameMode, this.getFrameMode());
        if (this.hasUniform(smokeUniforms.smokeIntensity)) gl.uniform1f(smokeUniforms.smokeIntensity, this.numberOr(this.config.smokeIntensity, 0.4));
        if (this.hasUniform(smokeUniforms.smokeSpeed)) gl.uniform1f(smokeUniforms.smokeSpeed, this.numberOr(this.config.smokeSpeed, 0.3));
        if (this.hasUniform(smokeUniforms.detailScale)) gl.uniform1f(smokeUniforms.detailScale, this.calculateDetailScale());
        
        if (this.hasUniform(smokeUniforms.smokeColor)) {
            const smokeRgb = this.hexToRgb(this.valueOr(this.config.smokeColor, '#333333'));
            gl.uniform3f(smokeUniforms.smokeColor, smokeRgb.r, smokeRgb.g, smokeRgb.b);
        }
        
        const projectionMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        const modelViewMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        if (this.hasUniform(smokeUniforms.projectionMatrix)) gl.uniformMatrix4fv(smokeUniforms.projectionMatrix, false, projectionMatrix);
        if (this.hasUniform(smokeUniforms.modelViewMatrix)) gl.uniformMatrix4fv(smokeUniforms.modelViewMatrix, false, modelViewMatrix);
        
        // Re-bind geometry for smoke
        const aSmokePosition = gl.getAttribLocation(this.programs.smoke, 'aPosition');
        if (aSmokePosition !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
            gl.enableVertexAttribArray(aSmokePosition);
            gl.vertexAttribPointer(aSmokePosition, 3, gl.FLOAT, false, 0, 0);
        }
        
        const aSmokeTexCoord = gl.getAttribLocation(this.programs.smoke, 'aTexCoord');
        if (aSmokeTexCoord !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
            gl.enableVertexAttribArray(aSmokeTexCoord);
            gl.vertexAttribPointer(aSmokeTexCoord, 2, gl.FLOAT, false, 0, 0);
        }
        
        // Additive blending for smoke on top of main effect
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // Restore standard alpha blending
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // Restore previous program
        gl.useProgram(prevProgram);
    }
    
    render() {
        if (this.destroyed || this.contextLost) {
            return;
        }

        if (!this.gl || !this.currentProgram) {
            this.scheduleRender();
            return;
        }
        
        const gl = this.gl;
        const time = (Date.now() - this.startTime) / 1000.0;
        this.cleanupExpiredTriggers();
        
        // Multi-pass rendering with bloom
        if (this.isGlowEnabled() && this.postProcessor && this.postProcessor.isReady()) {
            // Render to framebuffer
            this.postProcessor.renderToFramebuffer('scene', () => {
                this.renderScene();
            });
            
            // Apply bloom
            const bloomTexture = this.postProcessor.applyBloom(
                this.postProcessor.textures.scene,
                {
                    bloomThreshold: this.numberOr(this.config.bloomThreshold, 0.6),
                    bloomRadius: this.numberOr(this.config.bloomRadius, 4) * this.getQualitySettings().bloomScale
                }
            );
            
            // Composite to screen
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            
            this.postProcessor.composite(
                this.postProcessor.textures.scene,
                bloomTexture,
                {
                    bloomIntensity: this.getEffectiveBloomIntensity(),
                    chromaticAberration: this.numberOr(this.config.chromaticAberration, 0.005),
                    filmGrain: this.numberOr(this.config.filmGrain, 0.03)
                },
                time
            );
        } else {
            // Direct rendering without bloom
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            this.renderScene();
        }
        
        this.scheduleRender();
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.cancelRevertAnimation();

        for (const timer of this.triggerTimers.values()) {
            clearTimeout(timer);
        }
        this.triggerTimers.clear();
        this.activeTriggers = [];

        if (this.socket) {
            for (const [eventName, handler] of this.socketListeners) {
                if (typeof this.socket.off === 'function') {
                    this.socket.off(eventName, handler);
                }
            }
            if (typeof this.socket.disconnect === 'function') {
                this.socket.disconnect();
            }
            this.socket = null;
            this.socketListeners = [];
        }

        window.removeEventListener('resize', this.resizeHandler);
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        this.canvas.removeEventListener('webglcontextlost', this.contextLostHandler);
        this.canvas.removeEventListener('webglcontextrestored', this.contextRestoredHandler);

        Object.values(this.textureImages || {}).forEach(image => {
            image.onload = null;
            image.onerror = null;
        });
        this.textureImages = {};

        if (this.postProcessor) {
            this.postProcessor.destroy();
            this.postProcessor = null;
        }

        if (this.gl) {
            Object.values(this.buffers).forEach(buffer => {
                if (buffer) this.gl.deleteBuffer(buffer);
            });
            Object.values(this.textures).forEach(texture => {
                if (texture) this.gl.deleteTexture(texture);
            });
            Object.values(this.programs).forEach(program => {
                if (program) this.gl.deleteProgram(program);
            });
        }

        this.buffers = {};
        this.textures = {};
        this.programs = {};
        this.uniforms = {};
        this.currentProgram = null;
    }

    scheduleRender() {
        if (this.destroyed || this.contextLost || this.animationFrameId) return;

        this.animationFrameId = requestAnimationFrame(() => {
            this.animationFrameId = null;
            this.render();
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.effectsEngine = new EffectsEngine('flameCanvas');
});
