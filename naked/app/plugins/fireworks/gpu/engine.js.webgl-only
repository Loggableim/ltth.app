/**
 * Advanced Fireworks Engine - WebGL2 SOA Particle System
 * 
 * High-Performance GPU-Accelerated Fireworks with Struct-of-Arrays (SOA) architecture
 * 
 * Features:
 * - WebGL2 instanced rendering with batched draw calls
 * - SOA particle system with TypedArrays for cache-friendly memory layout
 * - Custom explosion shapes with mathematical precision
 * - Realistic physics simulation (gravity, drag, rotation)
 * - Advanced color palettes with HSL color space
 * - Audio synchronization with callback-based explosion sounds
 * - Socket.io integration for remote control and FPS monitoring
 * 
 * Architecture:
 * - ParticleSystemSOA: High-performance particle storage with TypedArrays
 * - WebGLParticleEngine: GPU-accelerated instanced rendering
 * - Firework: Rocket launch and explosion state management
 * - FireworksEngine: Main engine coordinating physics and rendering
 * - AudioManager: Audio playback with tier-based sound selection
 * 
 * Requirements:
 * - WebGL2 support (mandatory, no fallback)
 * - particle-system-soa.js
 * - webgl-particle-engine.js
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEBUG = false;

const CONFIG = {
    maxFireworks: 100,
    maxParticlesPerExplosion: 200,
    targetFps: 60,
    minFps: 24,
    gravity: 0.08,
    airResistance: 0.99,
    rocketSpeed: -12,
    rocketAcceleration: -0.08,
    sparkleChance: 0.15,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    resolutionPreset: '1080p',
    orientation: 'landscape',
    defaultColors: ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'],
    colorPalettes: {
        classic: ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'],
        neon: ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff'],
        pastel: ['#ffc2d1', '#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff'],
        fire: ['#ff0000', '#ff4500', '#ff8c00', '#ffd700', '#ffff00'],
        ice: ['#00ffff', '#00ccff', '#0099ff', '#0066ff', '#0033ff'],
        rainbow: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#9400d3']
    },
    comboThrottleMinInterval: 100,
    comboSkipRocketsThreshold: 5,
    comboInstantExplodeThreshold: 8,
    IDEAL_FRAME_TIME: 16.67,
    FPS_TIMING_TOLERANCE: 1
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function hslToRgb(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;
    let r, g, b;
    
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
}

// ============================================================================
// SHAPE GENERATORS - Velocity patterns for explosion shapes
// ============================================================================

const ShapeGenerators = {
    burst: (count, intensity) => {
        const particles = [];
        const rings = 2 + Math.floor(intensity);
        const particlesPerRing = Math.floor(count / rings);
        
        for (let ring = 0; ring < rings; ring++) {
            const ringSpeed = (2 + Math.random() * 2) * (1 + ring * 0.3) * intensity;
            for (let i = 0; i < particlesPerRing; i++) {
                const angle = (Math.PI * 2 * i) / particlesPerRing + (Math.random() - 0.5) * 0.2;
                particles.push({
                    vx: Math.cos(angle) * ringSpeed,
                    vy: Math.sin(angle) * ringSpeed,
                    willBurst: true,  // Mark for secondary mini-burst
                    burstDelay: 500 + Math.random() * 300  // 0.5-0.8s delay
                });
            }
        }
        return particles;
    },

    heart: (count, intensity) => {
        const particles = [];
        const layers = 4;
        const particlesPerLayer = Math.floor(count / layers);
        
        for (let layer = 0; layer < layers; layer++) {
            const layerScale = 0.5 + (layer * 0.15);
            for (let i = 0; i < particlesPerLayer; i++) {
                const t = (i / particlesPerLayer) * Math.PI * 2;
                const x = 16 * Math.pow(Math.sin(t), 3);
                const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
                
                const mag = Math.max(Math.sqrt(x*x + y*y), 1);
                const speed = (0.15 + Math.random() * 0.05) * intensity * layerScale;
                particles.push({
                    vx: (x / mag) * speed * 8,
                    vy: (y / mag) * speed * 8
                });
            }
        }
        return particles;
    },

    star: (count, intensity) => {
        const particles = [];
        const points = 5;
        const particlesPerPoint = Math.floor(count / (points * 2));
        
        for (let point = 0; point < points; point++) {
            const outerAngle = (Math.PI * 2 * point) / points - Math.PI / 2;
            const innerAngle = outerAngle + (Math.PI / points);
            
            for (let i = 0; i < particlesPerPoint; i++) {
                const t = i / particlesPerPoint;
                const spread = (Math.random() - 0.5) * 0.15;
                const angle = outerAngle + spread;
                const radiusMix = 0.8 + t * 0.4;
                const speed = (2 + Math.random() * 1) * intensity * radiusMix;
                particles.push({
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed
                });
            }
            
            for (let i = 0; i < particlesPerPoint / 2; i++) {
                const t = i / (particlesPerPoint / 2);
                const spread = (Math.random() - 0.5) * 0.1;
                const angle = innerAngle + spread;
                const radiusMix = 0.3 + t * 0.3;
                const speed = (1.5 + Math.random() * 0.8) * intensity * radiusMix;
                particles.push({
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed
                });
            }
        }
        return particles;
    },

    spiral: (count, intensity) => {
        const particles = [];
        const turns = 4;
        const arms = 3;
        
        for (let i = 0; i < count; i++) {
            const t = (i / count) * turns * Math.PI * 2;
            const armOffset = (Math.floor(i * arms / count) * Math.PI * 2) / arms;
            const radius = (i / count) * intensity * 0.8;
            const speed = 1.5 + Math.random() * 1.5;
            particles.push({
                vx: Math.cos(t + armOffset) * radius * speed,
                vy: Math.sin(t + armOffset) * radius * speed,
                willSpiral: true,  // Mark for secondary spiral burst
                spiralDelay: 600 + Math.random() * 400  // 0.6-1.0s delay
            });
        }
        return particles;
    },
    
    paws: (count, intensity) => {
        const particles = [];
        const centerPadParticles = Math.floor(count * 0.4);
        const toeParticles = Math.floor((count - centerPadParticles) / 4);
        
        for (let i = 0; i < centerPadParticles; i++) {
            const angle = (Math.PI * 2 * i) / centerPadParticles + Math.random() * 0.3;
            const radius = 0.3 + Math.random() * 0.2;
            const speed = (0.8 + Math.random() * 0.4) * intensity;
            const offsetY = 0.6;
            particles.push({
                vx: Math.cos(angle) * radius * speed,
                vy: (Math.sin(angle) * radius * speed) + (offsetY * intensity)
            });
        }
        
        const toePositions = [
            { angle: -2.4, distance: 1.2 },
            { angle: -1.8, distance: 1.4 },
            { angle: -1.3, distance: 1.4 },
            { angle: -0.7, distance: 1.2 }
        ];
        
        for (let toe = 0; toe < 4; toe++) {
            const toePos = toePositions[toe];
            for (let i = 0; i < toeParticles; i++) {
                const localAngle = (Math.PI * 2 * i) / toeParticles;
                const radius = 0.15 + Math.random() * 0.1;
                const speed = (0.6 + Math.random() * 0.3) * intensity;
                
                const basex = Math.cos(toePos.angle) * toePos.distance;
                const basey = Math.sin(toePos.angle) * toePos.distance;
                
                particles.push({
                    vx: (basex + Math.cos(localAngle) * radius) * speed,
                    vy: (basey + Math.sin(localAngle) * radius) * speed
                });
            }
        }
        
        return particles;
    },

    ring: (count, intensity) => {
        const particles = [];
        const rings = 2 + Math.floor(intensity * 0.5);
        
        for (let ring = 0; ring < rings; ring++) {
            const ringParticles = Math.floor(count / rings);
            const ringRadius = (ring + 1) / rings;
            
            for (let i = 0; i < ringParticles; i++) {
                const angle = (Math.PI * 2 * i) / ringParticles;
                const speed = (3 + Math.random()) * intensity * ringRadius;
                particles.push({
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed
                });
            }
        }
        return particles;
    },

    fountain: (count, intensity) => {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const angle = -Math.PI/2 + (Math.random() - 0.5) * Math.PI * 0.6;
            const speed = (2 + Math.random() * 3) * intensity;
            particles.push({
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed
            });
        }
        return particles;
    },

    willow: (count, intensity) => {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speedVariation = 0.7 + Math.random() * 0.6;
            const speed = 2 * intensity * speedVariation;
            particles.push({
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1
            });
        }
        return particles;
    }
};

// ============================================================================
// AUDIO MANAGER
// ============================================================================

class AudioManager {
    constructor() {
        this.sounds = new Map();
        this.audioContext = null;
        this.volume = 0.7;
        this.enabled = true;
        this.initialized = false;
        this.pendingSounds = new Map();
        
        this.TINY_BANG_SOUNDS = ['combined-whistle-tiny1', 'combined-whistle-tiny2', 'combined-whistle-tiny3', 'combined-whistle-tiny4'];
        this.SMALL_SOUNDS = ['combined-whistle-tiny1', 'combined-whistle-tiny2', 'combined-whistle-tiny3'];
        
        this.BASIC_LAUNCH_SOUNDS = ['launch-basic', 'launch-basic2', 'rocket-basic'];
        this.SMOOTH_LAUNCH_SOUNDS = ['launch-smooth', 'launch-smooth2'];
        this.ALL_LAUNCH_SOUNDS = ['launch-basic', 'launch-basic2', 'rocket-basic', 'launch-whistle', 'launch-smooth', 'launch-smooth2'];
        
        this.EXPLOSION_SMALL = ['explosion-basic', 'explosion-small', 'explosion-alt1'];
        this.EXPLOSION_MEDIUM = ['explosion-medium', 'explosion-alt2', 'explosion-pop'];
        this.EXPLOSION_BIG = ['explosion-big', 'explosion-huge'];
        this.EXPLOSION_ALL = ['explosion-basic', 'explosion-small', 'explosion-medium', 'explosion-alt1', 'explosion-alt2', 'explosion-big', 'explosion-huge', 'explosion-pop'];
        
        this.CRACKLING_SOUNDS = ['crackling-medium', 'crackling-long'];
        
        this.COMBINED_AUDIO_VOLUME = 0.65;
        this.LAUNCH_AUDIO_VOLUME = 0.45;
        this.NORMAL_EXPLOSION_VOLUME = 0.7;
        this.INSTANT_EXPLODE_VOLUME = 0.25;
        this.CRACKLING_VOLUME = 0.35;
        
        this.AUDIO_VOLUME_MULTIPLIERS = {
            'explosion-huge': 0.7,
            'explosion-big': 0.8,
            'explosion-pop': 0.75,
            'explosion-basic': 1.3,
            'explosion-alt1': 1.1,
            'rocket-basic': 1.2,
            'crackling-long': 0.6,
            'crackling-medium': 0.7,
            'launch-basic': 1.1,
            'launch-basic2': 1.1,
            'launch-whistle': 1.0,
            'launch-smooth': 1.0,
            'launch-smooth2': 1.0,
            'combined-crackling-bang': 1.0,
            'combined-whistle-normal': 1.0,
            'combined-whistle-tiny1': 1.0,
            'combined-whistle-tiny2': 1.0,
            'combined-whistle-tiny3': 1.0,
            'combined-whistle-tiny4': 0.9,
            'explosion-medium': 1.0,
            'explosion-small': 1.0,
            'explosion-alt2': 1.0
        };
    }

    async init() {
        this.initialized = true;
        if (DEBUG) console.log('[Fireworks Audio] Audio manager ready');
    }

    async ensureAudioContext() {
        if (!this.audioContext && this.initialized) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
                
                for (const [name, url] of this.pendingSounds.entries()) {
                    await this.preload(url, name);
                }
                this.pendingSounds.clear();
                
                if (DEBUG) console.log('[Fireworks Audio] AudioContext created');
            } catch (e) {
                console.warn('[Fireworks Audio] AudioContext not available:', e.message);
            }
        }
    }

    async preload(url, name) {
        if (!this.audioContext) {
            this.pendingSounds.set(name, url);
            return;
        }
        
        if (this.sounds.has(name)) return;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.info(`[Fireworks Audio] Audio file not found: ${url} (this is normal if not yet added)`);
                return;
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.sounds.set(name, audioBuffer);
            if (DEBUG) console.log(`[Fireworks Audio] Loaded: ${name}`);
        } catch (e) {
            console.info(`[Fireworks Audio] Could not load ${url}:`, e.message, '(add audio files to enable sounds)');
        }
    }

    async play(name, volume = 1.0) {
        if (!this.enabled) return;
        
        await this.ensureAudioContext();
        
        if (!this.audioContext || !this.sounds.has(name)) return;
        
        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            source.buffer = this.sounds.get(name);
            
            const volumeMultiplier = this.AUDIO_VOLUME_MULTIPLIERS[name] || 1.0;
            gainNode.gain.value = this.volume * volume * volumeMultiplier;
            
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            source.start(0);
        } catch (e) {
            console.warn('[Fireworks Audio] Playback error:', e.message);
        }
    }

    async playWithFadeOut(name, volume = 1.0, duration = 2.0, fadeOutDuration = 0.5) {
        if (!this.enabled) return;
        
        await this.ensureAudioContext();
        
        if (!this.audioContext || !this.sounds.has(name)) return;
        
        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            source.buffer = this.sounds.get(name);
            
            const volumeMultiplier = this.AUDIO_VOLUME_MULTIPLIERS[name] || 1.0;
            const finalVolume = this.volume * volume * volumeMultiplier;
            
            gainNode.gain.value = finalVolume;
            
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            const startTime = this.audioContext.currentTime;
            source.start(0);
            
            const fadeStartTime = startTime + duration;
            const fadeEndTime = fadeStartTime + fadeOutDuration;
            
            gainNode.gain.setValueAtTime(finalVolume, fadeStartTime);
            gainNode.gain.exponentialRampToValueAtTime(0.00001, fadeEndTime);
            gainNode.gain.setValueAtTime(0, fadeEndTime);
            
            source.stop(fadeEndTime + 0.1);
        } catch (e) {
            console.warn('[Fireworks Audio] Fade-out playback error:', e.message);
        }
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    async playDelayed(name, delay, volume = 1.0) {
        if (!this.enabled) return;
        
        await this.ensureAudioContext();
        
        if (!this.audioContext || !this.sounds.has(name)) return;
        
        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            source.buffer = this.sounds.get(name);
            gainNode.gain.value = this.volume * volume;
            
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            const startTime = this.audioContext.currentTime + delay;
            source.start(startTime);
        } catch (e) {
            console.warn('[Fireworks Audio] Delayed playback error:', e.message);
        }
    }

    selectAudio(tier, combo, instantExplode = false) {
        if (instantExplode) {
            return {
                useCombinedAudio: false,
                launchSound: null,
                explosionSound: tier === 'massive' ? 'explosion-huge' :
                               tier === 'big' ? 'explosion-big' :
                               tier === 'medium' ? 'explosion-medium' :
                               'explosion-basic',
                cracklingSound: null
            };
        }

        if (combo >= 5 && combo < 8) {
            return {
                useCombinedAudio: false,
                launchSound: this.BASIC_LAUNCH_SOUNDS[Math.floor(Math.random() * this.BASIC_LAUNCH_SOUNDS.length)],
                explosionSound: this.EXPLOSION_SMALL[Math.floor(Math.random() * this.EXPLOSION_SMALL.length)],
                cracklingSound: null
            };
        }

        const rand = Math.random();

        switch (tier) {
            case 'small':
                const smallLaunch = rand < 0.7
                    ? this.BASIC_LAUNCH_SOUNDS[Math.floor(Math.random() * this.BASIC_LAUNCH_SOUNDS.length)]
                    : 'launch-whistle';
                
                return {
                    useCombinedAudio: false,
                    launchSound: smallLaunch,
                    explosionSound: this.EXPLOSION_SMALL[Math.floor(Math.random() * this.EXPLOSION_SMALL.length)],
                    cracklingSound: null
                };

            case 'medium':
                const mediumLaunch = rand < 0.6
                    ? this.SMOOTH_LAUNCH_SOUNDS[Math.floor(Math.random() * this.SMOOTH_LAUNCH_SOUNDS.length)]
                    : 'launch-whistle';
                
                return {
                    useCombinedAudio: false,
                    launchSound: mediumLaunch,
                    explosionSound: this.EXPLOSION_MEDIUM[Math.floor(Math.random() * this.EXPLOSION_MEDIUM.length)],
                    cracklingSound: null
                };

            case 'big':
                return {
                    useCombinedAudio: false,
                    launchSound: 'launch-whistle',
                    explosionSound: this.EXPLOSION_BIG[Math.floor(Math.random() * this.EXPLOSION_BIG.length)],
                    cracklingSound: Math.random() < 0.4 ? this.CRACKLING_SOUNDS[Math.floor(Math.random() * this.CRACKLING_SOUNDS.length)] : null
                };

            case 'massive':
                return {
                    useCombinedAudio: false,
                    launchSound: 'launch-whistle',
                    explosionSound: 'explosion-huge',
                    cracklingSound: Math.random() < 0.7 ? this.CRACKLING_SOUNDS[Math.floor(Math.random() * this.CRACKLING_SOUNDS.length)] : null
                };

            default:
                return {
                    useCombinedAudio: false,
                    launchSound: this.BASIC_LAUNCH_SOUNDS[0],
                    explosionSound: this.EXPLOSION_SMALL[0],
                    cracklingSound: null
                };
        }
    }
}

// ============================================================================
// FIREWORK - Manages individual firework state
// ============================================================================

class Firework {
    constructor(x, y, targetY, shape, intensity, particleCount, baseHue, hueRange, id, onExplodeSound) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.targetY = targetY;
        this.shape = shape;
        this.intensity = intensity;
        this.particleCount = particleCount;
        this.baseHue = baseHue;
        this.hueRange = hueRange;
        this.exploded = false;
        this.done = false;
        this.onExplodeSound = onExplodeSound;
        
        this.rocketVy = CONFIG.rocketSpeed;
        this.rocketParticleId = null;
    }
}

// ============================================================================
// FIREWORKS ENGINE - Main rendering and orchestration
// ============================================================================

class FireworksEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        
        this.webgl = null;
        this.particles = null;
        
        this.fireworks = [];
        this.nextFireworkId = 1;
        this.audioManager = new AudioManager();
        
        this.fps = 60;
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.lastTime = performance.now();
        
        this.config = { ...CONFIG };
        this.running = false;
        this.socket = null;
        this.debugMode = false;
    }

    async init() {
        if (typeof WebGLParticleEngine === 'undefined') {
            throw new Error('WebGLParticleEngine not loaded - include webgl-particle-engine.js');
        }
        if (typeof ParticleSystemSOA === 'undefined') {
            throw new Error('ParticleSystemSOA not loaded - include particle-system-soa.js');
        }
        
        this.webgl = new WebGLParticleEngine(this.canvas);
        if (!this.webgl.init()) {
            throw new Error('WebGL2 not supported - this browser cannot run the fireworks plugin');
        }
        
        this.particles = new ParticleSystemSOA(100000);
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        await this.audioManager.init();
        this.connectSocket();
        
        this.running = true;
        this.render();
        
        if (DEBUG) console.log('[Fireworks] Engine initialized with WebGL2 + SOA');
    }

    resize() {
        const container = this.canvas.parentElement;
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        if (this.webgl) {
            this.webgl.resize(width, height);
        }
    }

    update(deltaTime) {
        for (let i = this.fireworks.length - 1; i >= 0; i--) {
            const fw = this.fireworks[i];
            this.updateFirework(fw, deltaTime);
            
            if (fw.done) {
                this.fireworks.splice(i, 1);
            }
        }
        
        this.particles.updatePositions(deltaTime);
        this.particles.updateAlphas(deltaTime);
        this.particles.updateRotations(deltaTime);
        this.particles.updateTrails(deltaTime);
        
        // Check for and trigger secondary explosions, bursts, and spirals
        const { explosions, bursts, spirals } = this.particles.updateSecondaryExplosions();
        
        for (const explosion of explosions) {
            this.particles.createSecondaryExplosion(explosion);
        }
        
        for (const burst of bursts) {
            this.particles.createMiniBurst(burst);
        }
        
        for (const spiral of spirals) {
            this.particles.createSpiralBurst(spiral);
        }
        
        if (this.frameCount % 60 === 0) {
            this.particles.compact();
        }
    }

    updateFirework(fw, dt) {
        if (!fw.exploded) {
            fw.rocketVy += CONFIG.rocketAcceleration * dt;
            fw.y += fw.rocketVy * dt;
            
            // Update rocket particle position if it exists
            if (fw.rocketParticleId !== null && fw.rocketParticleId < this.particles.count) {
                const i = fw.rocketParticleId;
                if (this.particles.active[i]) {
                    this.particles.x[i] = fw.x;
                    this.particles.y[i] = fw.y;
                    this.particles.vy[i] = fw.rocketVy;
                }
            }
            
            if (fw.y <= fw.targetY) {
                // Mark rocket particle as done before explosion
                if (fw.rocketParticleId !== null && fw.rocketParticleId < this.particles.count) {
                    this.particles.active[fw.rocketParticleId] = 0;
                }
                this.explode(fw);
            }
        }
        
        if (fw.exploded && this.particles.countByFirework(fw.id) === 0) {
            fw.done = true;
        }
    }

    explode(fw) {
        fw.exploded = true;
        
        const generator = ShapeGenerators[fw.shape] || ShapeGenerators.burst;
        const velocities = generator(fw.particleCount, fw.intensity);
        
        for (const vel of velocities) {
            // Add trails to a subset of particles for visual effect without lag
            const shouldEmitTrail = Math.random() < 0.3; // 30% of particles emit trails
            
            // Sparkle particles - smaller, brighter, no trails
            const isSparkle = Math.random() < CONFIG.sparkleChance;
            
            // Add secondary explosions to a small subset for extra sparkle (10% chance, not on sparkles)
            const shouldExplode = !isSparkle && Math.random() < 0.1;
            
            this.particles.emit({
                x: fw.x,
                y: fw.y,
                vx: vel.vx,
                vy: vel.vy,
                size: isSparkle ? (2 + Math.random() * 2) : (3 + Math.random() * 4),
                alpha: 1,
                hue: fw.baseHue + Math.random() * fw.hueRange,
                saturation: isSparkle ? 100 : 90,
                brightness: isSparkle ? 100 : 95,
                decay: isSparkle ? 0.015 : (0.008 + Math.random() * 0.005),
                gravity: isSparkle ? (CONFIG.gravity * 0.8) : CONFIG.gravity,
                drag: isSparkle ? 0.97 : 0.98,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.1,
                fireworkId: fw.id,
                emitTrail: !isSparkle && shouldEmitTrail, // Sparkles don't emit trails
                willExplode: shouldExplode,
                explosionDelay: 0.3 + Math.random() * 0.3, // Explode after 0.3-0.6 seconds
                isSparkle: isSparkle,  // Pass sparkle flag for flicker effect
                willBurst: vel.willBurst || false,  // From shape generator
                willSpiral: vel.willSpiral || false,  // From shape generator
                burstDelay: vel.burstDelay || 500,
                spiralDelay: vel.spiralDelay || 600
            });
        }
        
        if (fw.onExplodeSound) {
            fw.onExplodeSound(fw.intensity);
        }
    }

    render() {
        if (!this.running) return;
        
        const now = performance.now();
        // Cap delta time to prevent physics explosions during lag spikes
        const deltaTime = Math.min((now - this.lastTime) / CONFIG.IDEAL_FRAME_TIME, 2.0);
        this.lastTime = now;
        
        this.update(deltaTime);
        
        this.webgl.updateFromSOA(this.particles);
        this.webgl.render();
        
        this.frameCount++;
        if (now - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = now;
            
            if (this.socket) {
                this.socket.emit('fireworks:fps-update', { fps: this.fps, timestamp: now });
            }
        }
        
        requestAnimationFrame(() => this.render());
    }

    trigger(options = {}) {
        const x = (options.position?.x || 0.5) * this.canvas.width;
        const y = (options.position?.y || 1.0) * this.canvas.height;
        const targetY = 100 + Math.random() * 300;
        
        const shape = options.shape || 'burst';
        const intensity = options.intensity || 1;
        const particleCount = Math.min(options.particleCount || 100, CONFIG.maxParticlesPerExplosion);
        
        const baseHue = options.baseHue !== undefined ? options.baseHue : Math.random() * 360;
        const hueRange = options.hueRange || 60;
        
        const id = this.nextFireworkId++;
        
        const fw = new Firework(x, y, targetY, shape, intensity, particleCount, baseHue, hueRange, id, options.onExplodeSound);
        
        // Create rocket particle with trail
        const rocketParticleId = this.particles.emit({
            x: fw.x,
            y: fw.y,
            vx: 0,
            vy: fw.rocketVy,
            size: 4 + intensity * 2,
            alpha: 1,
            hue: baseHue,
            saturation: 80,
            brightness: 100,
            decay: 0, // Rocket doesn't decay until explosion
            gravity: CONFIG.rocketAcceleration,
            drag: 1.0, // No drag on rocket
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.2,
            fireworkId: id,
            emitTrail: true, // Rockets emit trails!
            willExplode: false
        });
        fw.rocketParticleId = rocketParticleId;
        
        this.fireworks.push(fw);
        
        // Limit concurrent fireworks to prevent memory issues
        if (this.fireworks.length > CONFIG.maxFireworks) {
            // Remove oldest firework using splice for explicit intent and O(n) efficiency
            this.fireworks.splice(0, 1);
        }
        
        return id;
    }

    connectSocket() {
        if (typeof io === 'undefined') {
            console.warn('[Fireworks] Socket.io not loaded');
            return;
        }
        
        try {
            this.socket = io();
            
            this.socket.on('connect', () => {
                if (DEBUG) console.log('[Fireworks] Connected to server');
            });
            
            this.socket.on('fireworks:trigger', (data) => {
                this.handleTrigger(data);
            });
            
            this.socket.on('fireworks:finale', (data) => {
                this.handleFinale(data);
            });
            
            this.socket.on('fireworks:get-active-count', () => {
                const stats = this.particles.getStats();
                this.socket.emit('fireworks:active-count-response', { 
                    count: stats.active,
                    fireworks: this.fireworks.length
                });
            });
            
            this.socket.on('fireworks:config-update', (data) => {
                this.handleConfigUpdate(data);
            });
            
            this.socket.on('disconnect', () => {
                if (DEBUG) console.log('[Fireworks] Disconnected from server');
            });
        } catch (e) {
            console.warn('[Fireworks] Socket.io connection failed:', e.message);
        }
    }

    handleTrigger(data) {
        const tier = data.tier || 'small';
        const combo = data.combo || 0;
        const instantExplode = combo >= CONFIG.comboInstantExplodeThreshold;
        
        const audio = this.audioManager.selectAudio(tier, combo, instantExplode);
        
        if (audio.launchSound) {
            this.audioManager.play(audio.launchSound, this.audioManager.LAUNCH_AUDIO_VOLUME);
        }
        
        const onExplodeSound = (intensity) => {
            if (audio.explosionSound) {
                const volume = instantExplode ? this.audioManager.INSTANT_EXPLODE_VOLUME : this.audioManager.NORMAL_EXPLOSION_VOLUME;
                this.audioManager.play(audio.explosionSound, volume);
            }
            if (audio.cracklingSound) {
                this.audioManager.play(audio.cracklingSound, this.audioManager.CRACKLING_VOLUME);
            }
        };
        
        this.trigger({
            position: data.position,
            shape: data.shape,
            intensity: data.intensity || 1,
            particleCount: data.particleCount || 100,
            baseHue: data.baseHue,
            hueRange: data.hueRange,
            onExplodeSound
        });
    }

    handleFinale(data) {
        const count = data.count || 10;
        const delay = data.delay || 100;
        const tier = data.tier || 'big';  // Finales typically use bigger effects
        
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                // Select audio for this firework
                const audio = this.audioManager.selectAudio(tier, 0, false);
                
                if (audio.launchSound) {
                    this.audioManager.play(audio.launchSound, this.audioManager.LAUNCH_AUDIO_VOLUME);
                }
                
                const onExplodeSound = (intensity) => {
                    if (audio.explosionSound) {
                        this.audioManager.play(audio.explosionSound, this.audioManager.NORMAL_EXPLOSION_VOLUME);
                    }
                    if (audio.cracklingSound) {
                        this.audioManager.play(audio.cracklingSound, this.audioManager.CRACKLING_VOLUME);
                    }
                };
                
                this.trigger({
                    position: { x: 0.2 + Math.random() * 0.6, y: 1.0 },
                    shape: ['burst', 'star', 'heart'][Math.floor(Math.random() * 3)],
                    intensity: 1.5 + Math.random() * 0.5,
                    particleCount: 150 + Math.floor(Math.random() * 50),
                    onExplodeSound  // Pass audio callback for explosion sounds
                });
            }, i * delay);
        }
    }

    handleConfigUpdate(data) {
        if (data.gravity !== undefined) CONFIG.gravity = data.gravity;
        if (data.airResistance !== undefined) CONFIG.airResistance = data.airResistance;
        if (data.volume !== undefined) this.audioManager.setVolume(data.volume);
        if (data.audioEnabled !== undefined) this.audioManager.setEnabled(data.audioEnabled);
        
        if (DEBUG) console.log('[Fireworks] Config updated:', data);
    }

    getActiveCount() {
        return this.particles.getStats().active;
    }

    getFireworkCount() {
        return this.fireworks.length;
    }

    toggleDebug() {
        this.debugMode = !this.debugMode;
        const panel = document.getElementById('debug-panel');
        if (panel) {
            panel.classList.toggle('visible', this.debugMode);
        }
    }

    destroy() {
        this.running = false;
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let engine = null;

document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('fireworks-canvas');
    if (!canvas) {
        console.error('[Fireworks] Canvas element not found');
        return;
    }
    
    try {
        engine = new FireworksEngine('fireworks-canvas');
        await engine.init();

        await engine.audioManager.preload('/plugins/fireworks/audio/abschussgeraeusch.mp3', 'launch-basic');
        await engine.audioManager.preload('/plugins/fireworks/audio/abschussgeraeusch2.mp3', 'launch-basic2');
        await engine.audioManager.preload('/plugins/fireworks/audio/explosion.mp3', 'explosion-basic');
        await engine.audioManager.preload('/plugins/fireworks/audio/rocket.mp3', 'rocket-basic');
        await engine.audioManager.preload('/plugins/fireworks/audio/explosion_small1.mp3', 'explosion-small');
        await engine.audioManager.preload('/plugins/fireworks/audio/explosion_medium.mp3', 'explosion-medium');
        await engine.audioManager.preload('/plugins/fireworks/audio/explosion2.mp3', 'explosion-alt1');
        await engine.audioManager.preload('/plugins/fireworks/audio/explosion3.mp3', 'explosion-alt2');
        await engine.audioManager.preload('/plugins/fireworks/audio/explosion_big.mp3', 'explosion-big');
        await engine.audioManager.preload('/plugins/fireworks/audio/explosion_huge.mp3', 'explosion-huge');
        await engine.audioManager.preload('/plugins/fireworks/audio/explosion%20Pop%2CSharp%2C.mp3', 'explosion-pop');
        await engine.audioManager.preload('/plugins/fireworks/audio/crackling.mp3', 'crackling-long');
        await engine.audioManager.preload('/plugins/fireworks/audio/crackling2.mp3', 'crackling-medium');
        await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_crackling_bang.mp3', 'combined-crackling-bang');
        await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_normal-bang.mp3', 'combined-whistle-normal');
        await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang.mp3', 'combined-whistle-tiny1');
        await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang2.mp3', 'combined-whistle-tiny2');
        await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang3.mp3', 'combined-whistle-tiny3');
        await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang4.mp3', 'combined-whistle-tiny4');
        await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_no-bang.mp3', 'launch-whistle');
        await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_nocrackling_no-bang.mp3', 'launch-smooth');
        await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_nocrackling_no-bang2.mp3', 'launch-smooth2');

        const enableAudio = async () => {
            await engine.audioManager.ensureAudioContext();
            document.removeEventListener('click', enableAudio);
            document.removeEventListener('keydown', enableAudio);
        };
        document.addEventListener('click', enableAudio);
        document.addEventListener('keydown', enableAudio);

        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'd') {
                engine.toggleDebug();
            }
        });

        if (DEBUG) console.log('[Fireworks] WebGL2 SOA engine ready');
    } catch (error) {
        console.error('[Fireworks] Initialization failed:', error.message);
        const canvas = document.getElementById('fireworks-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#ff0000';
                ctx.font = '24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('WebGL2 not supported', canvas.width / 2, canvas.height / 2);
                ctx.font = '16px Arial';
                ctx.fillText('Please use a modern browser with WebGL2 support', canvas.width / 2, canvas.height / 2 + 30);
            }
        }
    }
});

if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'FireworksEngine', {
        get: () => engine,
        configurable: false,
        enumerable: true
    });
}
