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
        
        // Trigger system (v3.0.0)
        this.activeTriggers = [];
        this.baseConfig = null;
        this.triggerQueue = [];
        this.triggerTimers = new Map();
        this.revertAnimationId = null;
        this.defaultTriggerDuration = 5000;
        this.maxTriggerDuration = 30000;
        
        this.init();
    }
    
    async init() {
        if (!this.canvas) {
            console.error('Cannot initialize: canvas is null');
            return;
        }
        
        this.gl = this.canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance',
            desynchronized: true
        });
        
        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }
        
        await this.loadConfig();
        this.setupAllShaders();
        this.switchEffect(this.config.effectType || 'flames');
        this.setupGeometry();
        this.loadTextures();
        this.initPostProcessor();
        this.initParticles();
        this.handleResize();
        
        window.addEventListener('resize', () => this.handleResize());
        
        this.render();
        this.setupSocketListener();
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
                resolutionPreset: 'tiktok-portrait',
                customWidth: 720,
                customHeight: 1280,
                frameMode: 'bottom',
                frameThickness: 150,
                flameColor: '#ff6600',
                flameSpeed: 0.5,
                flameIntensity: 1.3,
                flameBrightness: 0.38,
                enableGlow: true,
                enableAdditiveBlend: true,
                maskOnlyEdges: true,
                noiseOctaves: 8,
                useHighQualityTextures: true,
                detailScaleAuto: true,
                edgeFeather: 0.42,
                frameCurve: 0.08,
                frameNoiseAmount: 0.12,
                animationEasing: 'linear',
                pulseEnabled: false,
                pulseAmount: 0.2,
                pulseSpeed: 1.0,
                bloomEnabled: true,
                bloomIntensity: 0.8,
                bloomThreshold: 0.6,
                bloomRadius: 4,
                layersEnabled: true,
                layerCount: 3,
                layerParallax: 0.3,
                chromaticAberration: 0.005,
                filmGrain: 0.03,
                depthIntensity: 0.65,
                smokeEnabled: true,
                smokeIntensity: 0.4,
                smokeSpeed: 0.3,
                smokeColor: '#333333'
            };
        }
    }
    
    setupSocketListener() {
        if (typeof io !== 'undefined') {
            try {
                const socket = io();
                
                socket.on('connect', () => {
                    console.log('Socket.io connected for config updates');
                });
                
                socket.on('connect_error', (error) => {
                    console.warn('Socket.io connection error:', error);
                });
                
                socket.on('flame-overlay:config-update', (data) => {
                    console.log('Config update received:', data);
                    const oldEffect = this.config.effectType;
                    this.config = data.config;
                    
                    if (oldEffect !== this.config.effectType) {
                        this.switchEffect(this.config.effectType);
                    }
                    
                    this.updateUniforms();
                    
                    // Resize post-processor if bloom settings changed
                    if (this.postProcessor && this.config.bloomEnabled) {
                        this.postProcessor.resize(this.canvas.width, this.canvas.height);
                    }
                });

                socket.on('flame-overlay:trigger', (data) => {
                    this.handleTrigger(data);
                });

                socket.on('flame-overlay:clear-triggers', () => {
                    this.clearTriggers();
                });
            } catch (error) {
                console.error('Failed to setup socket listener:', error);
            }
        } else {
            console.warn('Socket.io not available - config updates disabled');
        }
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

        // Snapshot base config on first trigger
        if (!this.baseConfig) {
            this.baseConfig = JSON.parse(JSON.stringify(this.config));
        }

        const triggerEntry = {
            id: trigger.id || (Date.now() + Math.random()),
            ...trigger,
            duration,
            startTime: Date.now(),
            endTime: Date.now() + duration,
            prevEffect: this.config.effectType
        };

        this.activeTriggers.push(triggerEntry);
        this.applyTrigger(triggerEntry);

        // Auto-revert after duration
        if (trigger.revert !== false) {
            const existingTimer = this.triggerTimers.get(triggerEntry.id);
            if (existingTimer) clearTimeout(existingTimer);

            const timer = setTimeout(() => {
                this.triggerTimers.delete(triggerEntry.id);
                this.removeTrigger(triggerEntry.id);
            }, duration);
            this.triggerTimers.set(triggerEntry.id, timer);
        }
    }

    normalizeTriggerDuration(duration) {
        const number = Number(duration);
        if (!Number.isFinite(number) || number <= 0) return this.defaultTriggerDuration;
        return Math.max(100, Math.min(number, this.maxTriggerDuration));
    }

    /**
     * Apply a trigger's visual effect to the current config
     * @param {object} trigger - Trigger entry
     */
    applyTrigger(trigger) {
        const base = this.baseConfig || this.config;

        switch (trigger.type) {
            case 'intensity-boost':
                this.config.flameIntensity = Math.min(
                    (base.flameIntensity || 1.3) + (trigger.amount || 0.5),
                    3.0
                );
                break;

            case 'color-change':
            case 'color-flash':
                if (trigger.color) this.config.flameColor = trigger.color;
                if (trigger.bloom) {
                    this.config.bloomEnabled = true;
                    this.config.bloomIntensity = Math.max(this.config.bloomIntensity || 0, 1.2);
                }
                break;

            case 'effect-switch':
                if (trigger.effect) this.switchEffect(trigger.effect);
                break;

            case 'dramatic':
                if (trigger.effect) this.switchEffect(trigger.effect);
                this.config.flameIntensity = Math.min(
                    (base.flameIntensity || 1.3) + (trigger.intensityBoost || 0.5),
                    3.0
                );
                if (trigger.bloomOverride) {
                    this.config.bloomEnabled = trigger.bloomOverride.enabled;
                    this.config.bloomIntensity = trigger.bloomOverride.intensity || 1.0;
                }
                break;

            case 'pulse':
                this.config.pulseEnabled = true;
                this.config.pulseAmount = trigger.intensity || 0.5;
                break;

            case 'flash':
                this.config.flameBrightness = Math.min(
                    (base.flameBrightness || 0.25) + 0.8,
                    2.0
                );
                break;

            default:
                break;
        }

        this.updateUniforms();
    }

    /**
     * Remove an active trigger and revert config if no triggers remain
     * @param {string|number} triggerId - ID of the trigger to remove
     */
    removeTrigger(triggerId) {
        const timer = this.triggerTimers.get(triggerId);
        if (timer) {
            clearTimeout(timer);
            this.triggerTimers.delete(triggerId);
        }

        this.activeTriggers = this.activeTriggers.filter(t => t.id !== triggerId);

        if (this.activeTriggers.length === 0 && this.baseConfig) {
            this.restoreBaseConfig(true);
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
            .filter(trigger => trigger.endTime && now >= trigger.endTime)
            .map(trigger => trigger.id);

        for (const triggerId of expired) {
            this.removeTrigger(triggerId);
        }
    }

    restoreBaseConfig(animated) {
        if (!this.baseConfig) return;

        const oldEffect = this.config.effectType;
        const targetEffect = this.baseConfig.effectType;

        if (animated) {
            this.smoothRevert(500);
            if (oldEffect !== targetEffect) {
                setTimeout(() => {
                    this.switchEffect(targetEffect);
                }, 250);
            }
            return;
        }

        this.config = JSON.parse(JSON.stringify(this.baseConfig));
        this.baseConfig = null;
        if (oldEffect !== targetEffect) this.switchEffect(targetEffect);
        this.updateUniforms();
    }

    /**
     * Smoothly interpolate config values back to baseConfig over duration
     * @param {number} duration - Duration in ms
     */
    smoothRevert(duration) {
        if (!this.baseConfig) return;
        if (this.revertAnimationId) {
            cancelAnimationFrame(this.revertAnimationId);
            this.revertAnimationId = null;
        }

        const startConfig = JSON.parse(JSON.stringify(this.config));
        const targetConfig = this.baseConfig;
        const startTime = Date.now();

        const numericFields = [
            'flameIntensity', 'flameBrightness', 'flameSpeed',
            'bloomIntensity', 'bloomThreshold', 'pulseAmount'
        ];

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

            // Restore boolean / string fields immediately at end
            if (t >= 1.0) {
                this.config.flameColor = targetConfig.flameColor;
                this.config.bloomEnabled = targetConfig.bloomEnabled;
                this.config.pulseEnabled = targetConfig.pulseEnabled;
                this.baseConfig = null;
                this.revertAnimationId = null;
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
            const width = this.gl.canvas.width || 720;
            const height = this.gl.canvas.height || 1280;
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
    
    // Apply easing and pulse
    float timeAdjusted = uTime;
    if (uPulseEnabled) {
        timeAdjusted += sin(uTime * uPulseSpeed) * uPulseAmount;
    }
    timeAdjusted = applyEasing(fract(timeAdjusted * 0.1), uAnimationEasing) * 10.0;
    
    loc.y -= timeAdjusted * scale.w * uFlameSpeed * speedMult;
    loc *= scale.xyz;
    loc.y += layerOffset;
    
    // Use configurable octave fBm instead of simple turbulence
    float offset = sqrt(st.y) * uFlameIntensity * fbm(loc.xy * uDetailScale, uNoiseOctaves);
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
    result.rgb = mix(uFlameColor * result.rgb, bbColor, 0.3);
    
    // Apply brightness multiplier for this layer
    result.rgb *= brightnessMult;
    
    // Fake depth (inner glow)
    if (uDepthIntensity > 0.0) {
        float depth = result.r * uDepthIntensity;
        result.rgb += vec3(depth) * 0.5;
    }
    
    return result;
}

void main() {
    vec2 uv = vTexCoord;
    vec2 pixelPos = gl_FragCoord.xy;
    
    // Determine if we're in a frame area
    bool inFrame = false;
    float edgeDist = 0.0;
    
    if (uFrameMode == 0) {
        // Bottom only
        if (uFrameCurve > 0.0 || uFrameNoiseAmount > 0.0) {
            float dist = getCurvedFrameDistance(pixelPos, uResolution, uFrameThickness, uFrameCurve, uFrameNoiseAmount);
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
        if (pixelPos.y > uResolution.y - uFrameThickness) {
            inFrame = true;
            edgeDist = (uResolution.y - pixelPos.y) / uFrameThickness;
        }
    } else if (uFrameMode == 2) {
        // Sides only
        if (pixelPos.x < uFrameThickness || pixelPos.x > uResolution.x - uFrameThickness) {
            inFrame = true;
            if (pixelPos.x < uFrameThickness) {
                edgeDist = pixelPos.x / uFrameThickness;
            } else {
                edgeDist = (uResolution.x - pixelPos.x) / uFrameThickness;
            }
        }
    } else {
        // All edges with curve support
        float minDist;
        if (uFrameCurve > 0.0 || uFrameNoiseAmount > 0.0) {
            minDist = getCurvedFrameDistance(pixelPos, uResolution, uFrameThickness, uFrameCurve, uFrameNoiseAmount);
        } else {
            float distFromLeft = pixelPos.x;
            float distFromRight = uResolution.x - pixelPos.x;
            float distFromBottom = pixelPos.y;
            float distFromTop = uResolution.y - pixelPos.y;
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
    
    // Multi-layer compositing
    vec4 finalColor = vec4(0.0);
    
    if (uLayersEnabled && uLayerCount > 1) {
        // Background layer: large, slow, dark
        vec3 samplePos1 = vec3(uv.x, edgeDist, uv.y);
        samplePos1.x += uLayerParallax * 0.02;
        vec4 layer1 = sampleFireLayer(samplePos1, vec4(0.8, 2.0, 0.8, 0.5), 0.0, 0.5, 0.6 * uFlameBrightness);
        finalColor = layer1;
        
        // Midground layer: normal
        vec3 samplePos2 = vec3(uv.x, edgeDist, uv.y);
        vec4 layer2 = sampleFireLayer(samplePos2, vec4(1.0, 2.0, 1.0, 0.5), 0.0, 1.0, 1.0 * uFlameBrightness);
        finalColor = mix(finalColor, layer2, layer2.a);
        
        if (uLayerCount >= 3) {
            // Foreground layer: small, fast, bright
            vec3 samplePos3 = vec3(uv.x, edgeDist, uv.y);
            samplePos3.x -= uLayerParallax * 0.02;
            vec4 layer3 = sampleFireLayer(samplePos3, vec4(1.2, 2.0, 1.2, 0.5), 0.0, 1.5, 1.2 * uFlameBrightness);
            finalColor = mix(finalColor, layer3, layer3.a);
        }
    } else {
        // Single layer
        vec3 samplePos = vec3(uv.x, edgeDist, uv.y);
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
    finalColor.rgb += vec3(1.0, 0.82, 0.42) * hotCore * 0.22 * uFlameBrightness;
    finalColor.rgb += mix(uFlameColor, vec3(1.0, 0.9, 0.55), 0.45) * filament * 0.18;
    finalColor.a = clamp(finalColor.a + hotCore * 0.08 + filament * 0.05, 0.0, 1.0);
    
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
    vec2 pixelPos = gl_FragCoord.xy;
    vec2 uv = vTexCoord;
    
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
        if (pixelPos.y > uResolution.y - uFrameThickness) {
            inFrame = true;
            edgeDist = (uResolution.y - pixelPos.y) / uFrameThickness;
        }
    } else if (uFrameMode == 2) {
        // Sides only
        if (pixelPos.x < uFrameThickness || pixelPos.x > uResolution.x - uFrameThickness) {
            inFrame = true;
            if (pixelPos.x < uFrameThickness) {
                edgeDist = pixelPos.x / uFrameThickness;
            } else {
                edgeDist = (uResolution.x - pixelPos.x) / uFrameThickness;
            }
        }
    } else {
        // All edges
        float distFromLeft = pixelPos.x;
        float distFromRight = uResolution.x - pixelPos.x;
        float distFromBottom = pixelPos.y;
        float distFromTop = uResolution.y - pixelPos.y;
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
    
    // Smoke moves upward slowly
    vec2 smokePos = uv;
    smokePos.y += uTime * uSmokeSpeed * 0.1;
    smokePos.x += simplexNoise(vec2(uv.y * 3.0, uTime * 0.5)) * 0.1;
    
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
            uniform float uFrameThickness;
            uniform int uFrameMode;
            
            varying vec2 vTexCoord;
            
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }
            
            vec4 renderParticles(vec2 uv, vec2 pixelPos, float edgeDist) {
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
                        
                        vec2 particlePos = vec2(x * uResolution.x, y);
                        
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
                vec2 pixelPos = gl_FragCoord.xy;
                
                bool inFrame = false;
                float edgeDist = 0.0;
                
                if (uFrameMode == 0) {
                    if (pixelPos.y < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.y / uFrameThickness;
                    }
                } else if (uFrameMode == 1) {
                    if (pixelPos.y > uResolution.y - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (uResolution.y - pixelPos.y) / uFrameThickness;
                        pixelPos.y = uResolution.y - pixelPos.y;
                    }
                } else if (uFrameMode == 2) {
                    if (pixelPos.x < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.x / uFrameThickness;
                        vec2 originalPos = pixelPos;
                        pixelPos.x = originalPos.y;
                        pixelPos.y = originalPos.x;
                    } else if (pixelPos.x > uResolution.x - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (uResolution.x - pixelPos.x) / uFrameThickness;
                        vec2 originalPos = pixelPos;
                        pixelPos.x = originalPos.y;
                        pixelPos.y = uResolution.x - originalPos.x;
                    }
                } else {
                    float distFromLeft = pixelPos.x;
                    float distFromRight = uResolution.x - pixelPos.x;
                    float distFromBottom = pixelPos.y;
                    float distFromTop = uResolution.y - pixelPos.y;
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
                
                gl_FragColor = renderParticles(vTexCoord, pixelPos, edgeDist);
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
                vec2 pixelPos = gl_FragCoord.xy;
                
                bool inFrame = false;
                float edgeDist = 0.0;
                
                if (uFrameMode == 0) {
                    if (pixelPos.y < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.y / uFrameThickness;
                    }
                } else if (uFrameMode == 1) {
                    if (pixelPos.y > uResolution.y - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (uResolution.y - pixelPos.y) / uFrameThickness;
                    }
                } else if (uFrameMode == 2) {
                    if (pixelPos.x < uFrameThickness || pixelPos.x > uResolution.x - uFrameThickness) {
                        inFrame = true;
                        if (pixelPos.x < uFrameThickness) {
                            edgeDist = pixelPos.x / uFrameThickness;
                        } else {
                            edgeDist = (uResolution.x - pixelPos.x) / uFrameThickness;
                        }
                    }
                } else {
                    float distFromLeft   = pixelPos.x;
                    float distFromRight  = uResolution.x - pixelPos.x;
                    float distFromBottom = pixelPos.y;
                    float distFromTop    = uResolution.y - pixelPos.y;
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
                
                gl_FragColor = renderEnergyWaves(vTexCoord, pixelPos, edgeDist);
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
                vec2 pixelPos = gl_FragCoord.xy;
                
                bool inFrame = false;
                float edgeDist = 0.0;
                
                if (uFrameMode == 0) {
                    if (pixelPos.y < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.y / uFrameThickness;
                    }
                } else if (uFrameMode == 1) {
                    if (pixelPos.y > uResolution.y - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (uResolution.y - pixelPos.y) / uFrameThickness;
                    }
                } else if (uFrameMode == 2) {
                    if (pixelPos.x < uFrameThickness || pixelPos.x > uResolution.x - uFrameThickness) {
                        inFrame = true;
                        if (pixelPos.x < uFrameThickness) {
                            edgeDist = pixelPos.x / uFrameThickness;
                        } else {
                            edgeDist = (uResolution.x - pixelPos.x) / uFrameThickness;
                        }
                    }
                } else {
                    float distFromLeft   = pixelPos.x;
                    float distFromRight  = uResolution.x - pixelPos.x;
                    float distFromBottom = pixelPos.y;
                    float distFromTop    = uResolution.y - pixelPos.y;
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
                
                gl_FragColor = renderLightning(vTexCoord, pixelPos, edgeDist);
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
        
        const programKey = effectMap[effectType] || 'flames';
        let program = this.programs[programKey];
        
        // Fall back to any available program if the requested one failed to compile
        if (!program) {
            console.warn(`Program '${programKey}' not available, falling back`);
            program = this.programs.flames || this.programs.particles ||
                      this.programs.energy || this.programs.lightning || null;
        }
        
        this.currentProgram = program;
        
        if (this.currentProgram) {
            this.gl.useProgram(this.currentProgram);
            this.setupUniformsForProgram(this.currentProgram);
            this.updateUniforms();
        }
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
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        
        this.gl.texImage2D(
            this.gl.TEXTURE_2D, 0, this.gl.RGBA,
            1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE,
            new Uint8Array([255, 255, 255, 255])
        );
        
        const image = new Image();
        image.onload = () => {
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
        image.src = url;
        
        this.textures[name] = texture;
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
        return modes[this.config.frameMode] || 0;
    }
    
    getAnimationEasing() {
        const easings = {
            'linear': 0,
            'sine': 1,
            'quad': 2,
            'elastic': 3
        };
        return easings[this.config.animationEasing] || 0;
    }
    
    calculateDetailScale() {
        if (!this.config.detailScaleAuto) {
            return 1.0;
        }
        // Auto-calculate based on canvas resolution
        const avgRes = (this.canvas.width + this.canvas.height) / 2;
        return Math.max(0.5, avgRes / 1000.0);
    }
    
    updateUniforms() {
        if (!this.gl || !this.currentProgram) return;
        
        this.gl.useProgram(this.currentProgram);
        
        const color = this.hexToRgb(this.config.flameColor || '#ff6600');
        if (this.uniforms.flameColor) {
            this.gl.uniform3f(this.uniforms.flameColor, color.r, color.g, color.b);
        }
        
        if (this.uniforms.flameSpeed) {
            this.gl.uniform1f(this.uniforms.flameSpeed, this.config.flameSpeed || 0.5);
        }
        if (this.uniforms.flameIntensity) {
            this.gl.uniform1f(this.uniforms.flameIntensity, this.config.flameIntensity || 1.3);
        }
        if (this.uniforms.flameBrightness) {
            this.gl.uniform1f(this.uniforms.flameBrightness, this.config.flameBrightness || 0.25);
        }
        
        if (this.uniforms.frameThickness) {
            this.gl.uniform1f(this.uniforms.frameThickness, this.config.frameThickness || 150);
        }
        if (this.uniforms.frameMode) {
            this.gl.uniform1i(this.uniforms.frameMode, this.getFrameMode());
        }
        if (this.uniforms.maskEdges) {
            this.gl.uniform1i(this.uniforms.maskEdges, this.config.maskOnlyEdges ? 1 : 0);
        }
        
        if (this.uniforms.resolution) {
            this.gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        }
        
        // New v2.2.0 uniforms
        if (this.uniforms.noiseOctaves) {
            this.gl.uniform1i(this.uniforms.noiseOctaves, this.config.noiseOctaves || 8);
        }
        if (this.uniforms.useHighQualityTextures) {
            this.gl.uniform1i(this.uniforms.useHighQualityTextures, this.config.useHighQualityTextures ? 1 : 0);
        }
        if (this.uniforms.detailScale) {
            this.gl.uniform1f(this.uniforms.detailScale, this.calculateDetailScale());
        }
        if (this.uniforms.edgeFeather) {
            this.gl.uniform1f(this.uniforms.edgeFeather, this.config.edgeFeather || 0.0);
        }
        if (this.uniforms.frameCurve) {
            this.gl.uniform1f(this.uniforms.frameCurve, this.config.frameCurve || 0.0);
        }
        if (this.uniforms.frameNoiseAmount) {
            this.gl.uniform1f(this.uniforms.frameNoiseAmount, this.config.frameNoiseAmount || 0.0);
        }
        if (this.uniforms.animationEasing) {
            this.gl.uniform1i(this.uniforms.animationEasing, this.getAnimationEasing());
        }
        if (this.uniforms.pulseEnabled) {
            this.gl.uniform1i(this.uniforms.pulseEnabled, this.config.pulseEnabled ? 1 : 0);
        }
        if (this.uniforms.pulseAmount) {
            this.gl.uniform1f(this.uniforms.pulseAmount, this.config.pulseAmount || 0.0);
        }
        if (this.uniforms.pulseSpeed) {
            this.gl.uniform1f(this.uniforms.pulseSpeed, this.config.pulseSpeed || 1.0);
        }
        if (this.uniforms.depthIntensity) {
            this.gl.uniform1f(this.uniforms.depthIntensity, this.config.depthIntensity || 0.0);
        }
        if (this.uniforms.layersEnabled) {
            this.gl.uniform1i(this.uniforms.layersEnabled, this.config.layersEnabled ? 1 : 0);
        }
        if (this.uniforms.layerCount) {
            this.gl.uniform1i(this.uniforms.layerCount, this.config.layerCount || 1);
        }
        if (this.uniforms.layerParallax) {
            this.gl.uniform1f(this.uniforms.layerParallax, this.config.layerParallax || 0.0);
        }
        
        // Smoke uniforms
        if (this.uniforms.smokeIntensity) {
            this.gl.uniform1f(this.uniforms.smokeIntensity, this.config.smokeIntensity || 0.0);
        }
        if (this.uniforms.smokeSpeed) {
            this.gl.uniform1f(this.uniforms.smokeSpeed, this.config.smokeSpeed || 0.3);
        }
        if (this.uniforms.smokeColor) {
            const smokeRgb = this.hexToRgb(this.config.smokeColor || '#333333');
            this.gl.uniform3f(this.uniforms.smokeColor, smokeRgb.r, smokeRgb.g, smokeRgb.b);
        }
        
        if (this.uniforms.noiseTexture && this.textures.noise) {
            this.gl.uniform1i(this.uniforms.noiseTexture, 0);
        }
        if (this.uniforms.fireProfile && this.textures.fireProfile) {
            this.gl.uniform1i(this.uniforms.fireProfile, 1);
        }
    }
    
    handleResize() {
        const dpr = this.config.highDPI ? (window.devicePixelRatio || 1) : 1;
        
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.postProcessor && this.canvas.width > 0 && this.canvas.height > 0) {
            this.postProcessor.resize(this.canvas.width, this.canvas.height);
        }
        
        this.updateUniforms();
    }
    
    renderScene() {
        const gl = this.gl;
        const time = (Date.now() - this.startTime) / 1000.0;
        
        gl.clearColor(0, 0, 0, 0);
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
        if (smokeUniforms.time) gl.uniform1f(smokeUniforms.time, time);
        if (smokeUniforms.resolution) gl.uniform2f(smokeUniforms.resolution, this.canvas.width, this.canvas.height);
        if (smokeUniforms.frameThickness) gl.uniform1f(smokeUniforms.frameThickness, this.config.frameThickness || 150);
        if (smokeUniforms.frameMode) gl.uniform1i(smokeUniforms.frameMode, this.getFrameMode());
        if (smokeUniforms.smokeIntensity) gl.uniform1f(smokeUniforms.smokeIntensity, this.config.smokeIntensity || 0.4);
        if (smokeUniforms.smokeSpeed) gl.uniform1f(smokeUniforms.smokeSpeed, this.config.smokeSpeed || 0.3);
        if (smokeUniforms.detailScale) gl.uniform1f(smokeUniforms.detailScale, this.calculateDetailScale());
        
        if (smokeUniforms.smokeColor) {
            const smokeRgb = this.hexToRgb(this.config.smokeColor || '#333333');
            gl.uniform3f(smokeUniforms.smokeColor, smokeRgb.r, smokeRgb.g, smokeRgb.b);
        }
        
        const projectionMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        const modelViewMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        if (smokeUniforms.projectionMatrix) gl.uniformMatrix4fv(smokeUniforms.projectionMatrix, false, projectionMatrix);
        if (smokeUniforms.modelViewMatrix) gl.uniformMatrix4fv(smokeUniforms.modelViewMatrix, false, modelViewMatrix);
        
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
        if (!this.gl || !this.currentProgram) {
            requestAnimationFrame(() => this.render());
            return;
        }
        
        const gl = this.gl;
        const time = (Date.now() - this.startTime) / 1000.0;
        this.cleanupExpiredTriggers();
        
        // Multi-pass rendering with bloom
        if (this.config.bloomEnabled && this.postProcessor && this.postProcessor.isReady()) {
            // Render to framebuffer
            this.postProcessor.renderToFramebuffer('scene', () => {
                this.renderScene();
            });
            
            // Apply bloom
            const bloomTexture = this.postProcessor.applyBloom(
                this.postProcessor.textures.scene,
                {
                    bloomThreshold: this.config.bloomThreshold || 0.6,
                    bloomRadius: this.config.bloomRadius || 4
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
                    bloomIntensity: this.config.bloomIntensity || 0.8,
                    chromaticAberration: this.config.chromaticAberration || 0.005,
                    filmGrain: this.config.filmGrain || 0.03
                },
                time
            );
        } else {
            // Direct rendering without bloom
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            this.renderScene();
        }
        
        requestAnimationFrame(() => this.render());
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.effectsEngine = new EffectsEngine('flameCanvas');
});
