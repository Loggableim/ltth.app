/**
 * Advanced Fireworks Engine - Professional Grade Particle System
 * 
 * Inspired by OpenProcessing sketch 1539861 but taken to the next level
 * 
 * Advanced Features:
 * - Multi-stage firework rockets with realistic physics
 * - Secondary explosions and sparkle effects
 * - Advanced color palettes with smooth gradients
 * - High-performance particle management with object pooling
 * - Custom explosion shapes with mathematical precision
 * - Trail effects with Path2D optimization
 * - Gift image integration with proper blending and XSS protection
 * - HSB color mode for vibrant displays
 * - Batch rendering for maximum FPS
 * - Efficient Canvas 2D rendering optimized for OBS
 * - Configurable toaster mode for low-end systems
 * 
 * Architecture:
 * - Particle: Individual physics-based particle
 * - Firework: Manages rocket launch, explosion, and particle lifecycle
 * - FireworksEngine: Main engine handling rendering and orchestration
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

// Debug flag - set to true to enable console.log statements
const DEBUG = false;

const CONFIG = {
    maxFireworks: 100,
    maxParticlesPerExplosion: 200,
    targetFps: 60,
    minFps: 24, // Adaptive performance threshold - user configurable down to 24 FPS
    gravity: 0.08,
    airResistance: 0.99,
    rocketSpeed: -12,
    rocketAcceleration: -0.08,
    trailLength: 20,
    trailFadeAlpha: 10,
    trailFadeSpeed: 0.02,
    sparkleChance: 0.15,
    secondaryExplosionChance: 0.1,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    resolution: 1.0, // Legacy - Canvas resolution multiplier (0.5 = half res, 1.0 = full res)
    resolutionPreset: '1080p', // Resolution preset: 360p, 540p, 720p, 1080p, 1440p, 4k
    orientation: 'landscape', // 'landscape' or 'portrait'
    giftPopupPosition: 'bottom', // 'top', 'middle', 'bottom', 'none', or {x, y} coordinates
    giftPopupEnabled: true, // Whether to show gift popup at all
    despawnFadeDuration: 1.5, // Duration in seconds for rocket despawn fade effect (when rockets are removed due to overload)
    defaultColors: ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'],
    colorPalettes: {
        classic: ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'],
        neon: ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff'],
        pastel: ['#ffc2d1', '#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff'],
        fire: ['#ff0000', '#ff4500', '#ff8c00', '#ffd700', '#ffff00'],
        ice: ['#00ffff', '#00ccff', '#0099ff', '#0066ff', '#0033ff'],
        rainbow: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#9400d3']
    },
    // Combo throttling to prevent extreme lag
    comboThrottleMinInterval: 100, // Minimum ms between combo triggers
    comboSkipRocketsThreshold: 5, // Skip rockets when combo >= this value
    comboInstantExplodeThreshold: 8, // Instant explosions (no rockets) when combo >= this
    // Performance constants
    IDEAL_FRAME_TIME: 16.67, // Ideal frame time for 60 FPS (1000ms / 60fps)
    FPS_TIMING_TOLERANCE: 1, // Tolerance in ms for FPS throttling timing jitter
    ALPHA_CULL_THRESHOLD: 0.01 // Alpha threshold below which particles are not rendered
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
// OBJECT POOLING - High-performance particle reuse system
// ============================================================================

class ParticlePool {
    constructor(initialSize = 5000) {
        this.pool = [];
        this.active = [];
        
        // Pre-allocate particles
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(new Particle());
        }
        
        if (DEBUG) console.log(`[ParticlePool] Initialized with ${initialSize} particles`);
    }
    
    acquire(args) {
        let particle;
        if (this.pool.length > 0) {
            particle = this.pool.pop();
            particle.reset(args);
        } else {
            // Pool exhausted, create new particle
            particle = new Particle(args);
        }
        this.active.push(particle);
        return particle;
    }
    
    release(particle) {
        const idx = this.active.indexOf(particle);
        if (idx > -1) {
            this.active.splice(idx, 1);
            particle.reset();
            this.pool.push(particle);
        }
    }
    
    releaseAll(particles) {
        for (const particle of particles) {
            const idx = this.active.indexOf(particle);
            if (idx > -1) {
                this.active.splice(idx, 1);
                particle.reset();
                this.pool.push(particle);
            }
        }
    }
    
    getStats() {
        return {
            pooled: this.pool.length,
            active: this.active.length,
            total: this.pool.length + this.active.length
        };
    }
}

// Global particle pool instance
let globalParticlePool = null;

// ============================================================================
// PARTICLE CLASS - Advanced physics-based particle
// ============================================================================

class Particle {
    constructor(args = {}) {
        const defaults = {
            x: 0,
            y: 0,
            vx: 0,
            vy: -10,
            ax: 0,
            ay: 0,
            mass: 1,
            drag: CONFIG.airResistance,
            gravity: CONFIG.gravity,
            size: 3,
            hue: 360,
            saturation: 100,
            brightness: 100,
            alpha: 1.0,
            lifespan: 1.0,
            decay: 0.01,
            isSeed: true,
            isSparkle: false,
            color: '#ffffff',
            image: null,
            type: 'circle',
            rotation: 0,
            rotationSpeed: 0,
            isDespawning: false, // Flag for despawn fade effect
            despawnStartTime: 0, // When despawn started
            // Secondary explosion properties
            willBurst: false,      // Will create mini-burst (for burst shape)
            burstDelay: 0,         // Delay before mini-burst
            burstTime: 0,          // Time when particle was created
            hasBurst: false,       // Already triggered burst
            willSpiral: false,     // Will create spiral burst (for spiral shape)
            spiralDelay: 0,        // Delay before spiral burst
            hasSpiraled: false     // Already triggered spiral
        };
        
        Object.assign(this, defaults, args);
        this.maxLifespan = this.lifespan;
        this.trail = [];
        this.age = 0;
        
        // Record creation time for secondary explosions
        if (this.willBurst || this.willSpiral) {
            this.burstTime = performance.now();
        }
    }
    
    applyForce(fx, fy) {
        this.ax += fx / this.mass;
        this.ay += fy / this.mass;
    }
    
    applyGravity() {
        this.ay += this.gravity;
    }
    
    update(deltaTime = 1.0) {
        // Handle despawn fade effect
        if (this.isDespawning) {
            const despawnDuration = CONFIG.despawnFadeDuration * 1000; // Convert to ms
            const elapsed = performance.now() - this.despawnStartTime;
            const fadeProgress = Math.min(elapsed / despawnDuration, 1.0);
            
            // Fade out alpha smoothly
            this.alpha = Math.max(0, 1.0 - fadeProgress);
            
            // If fade is complete, mark as done
            if (fadeProgress >= 1.0) {
                this.lifespan = 0;
            }
        }
        
        // Apply air resistance (frame-independent)
        const dragFactor = Math.pow(this.drag, deltaTime);
        this.vx *= dragFactor;
        this.vy *= dragFactor;
        
        // Update velocity with deltaTime
        this.vx += this.ax * deltaTime;
        this.vy += this.ay * deltaTime;
        
        // Update position with deltaTime
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        
        // Clear acceleration
        this.ax = 0;
        this.ay = 0;
        
        // Update rotation with deltaTime
        this.rotation += this.rotationSpeed * deltaTime;
        
        // Update lifespan for explosion particles with deltaTime
        if (!this.isSeed && !this.isDespawning) {
            this.lifespan -= this.decay * deltaTime;
            this.alpha = Math.max(0, this.lifespan / this.maxLifespan);
            
            // Add sparkle flicker effect
            if (this.isSparkle && Math.random() < 0.3) {
                this.brightness = 80 + Math.random() * 20;
            }
        }
        
        // Store trail with fading based on age
        if (this.trail.length > CONFIG.trailLength) {
            this.trail.shift();
        }
        
        // Fade trail points based on their age (frame-independent)
        const trailFadeFactor = 1 - (CONFIG.trailFadeSpeed * deltaTime);
        for (let i = 0; i < this.trail.length; i++) {
            if (this.trail[i].alpha) {
                this.trail[i].alpha *= trailFadeFactor;
            }
        }
        
        this.trail.push({ 
            x: this.x, 
            y: this.y, 
            alpha: this.alpha * 0.6,
            size: this.size * 0.7
        });
        
        this.age += deltaTime;
    }
    
    isDone() {
        return this.lifespan <= 0 || this.y > window.innerHeight + 100;
    }
    
    /**
     * Start despawn fade effect
     * Called when particle needs to be removed due to performance
     */
    startDespawn() {
        if (!this.isDespawning) {
            this.isDespawning = true;
            this.despawnStartTime = performance.now();
        }
    }
    
    /**
     * Reset particle to default state for object pooling
     * Can optionally reinitialize with new args
     */
    reset(args = null) {
        if (args) {
            // Reinitialize with new values
            const defaults = {
                x: 0,
                y: 0,
                vx: 0,
                vy: -10,
                ax: 0,
                ay: 0,
                mass: 1,
                drag: CONFIG.airResistance,
                gravity: CONFIG.gravity,
                size: 3,
                hue: 360,
                saturation: 100,
                brightness: 100,
                alpha: 1.0,
                lifespan: 1.0,
                decay: 0.01,
                isSeed: true,
                isSparkle: false,
                color: '#ffffff',
                image: null,
                type: 'circle',
                rotation: 0,
                rotationSpeed: 0,
                isDespawning: false,
                despawnStartTime: 0,
                willBurst: false,
                burstDelay: 0,
                burstTime: 0,
                hasBurst: false,
                willSpiral: false,
                spiralDelay: 0,
                hasSpiraled: false
            };
            Object.assign(this, defaults, args);
            this.maxLifespan = this.lifespan;
            this.trail.length = 0; // Clear trail array without reallocating
            this.age = 0;
            
            if (this.willBurst || this.willSpiral) {
                this.burstTime = performance.now();
            }
        } else {
            // Just clear to defaults
            this.x = 0;
            this.y = 0;
            this.vx = 0;
            this.vy = -10;
            this.ax = 0;
            this.ay = 0;
            this.mass = 1;
            this.drag = CONFIG.airResistance;
            this.gravity = CONFIG.gravity;
            this.size = 3;
            this.hue = 360;
            this.saturation = 100;
            this.brightness = 100;
            this.alpha = 1.0;
            this.lifespan = 1.0;
            this.maxLifespan = 1.0;
            this.decay = 0.01;
            this.isSeed = true;
            this.isSparkle = false;
            this.color = '#ffffff';
            this.image = null;
            this.type = 'circle';
            this.rotation = 0;
            this.rotationSpeed = 0;
            this.isDespawning = false;
            this.despawnStartTime = 0;
            this.willBurst = false;
            this.burstDelay = 0;
            this.burstTime = 0;
            this.hasBurst = false;
            this.willSpiral = false;
            this.spiralDelay = 0;
            this.hasSpiraled = false;
            this.trail.length = 0;
            this.age = 0;
        }
    }
}

// ============================================================================
// FIREWORK CLASS - Advanced multi-stage firework system
// ============================================================================

class Firework {
    constructor(args = {}) {
        const defaults = {
            x: Math.random() * window.innerWidth,
            y: window.innerHeight,
            targetY: 100 + Math.random() * 300,
            shape: 'burst',
            colors: CONFIG.colorPalettes.classic,
            intensity: 1.0,
            giftImage: null,
            userAvatar: null,
            avatarParticleChance: 0.3,
            useImages: false,
            tier: 'medium',
            combo: 1,
            skipRocket: false, // Skip rocket animation for high combos
            instantExplode: false, // Explode immediately without delay
            engineFps: 60 // Current engine FPS for performance-based decisions
        };
        
        Object.assign(this, defaults, args);
        
        // State management
        this.particles = [];
        this.secondaryExplosions = [];
        
        // If instant explode, skip rocket creation entirely
        if (this.instantExplode) {
            this.rocket = null;
            this.exploded = false; // Will be set to true in update() when explode() is called
            this.shouldExplodeImmediately = true;
        } else if (this.skipRocket) {
            // Create a dummy rocket at target position, will explode immediately
            this.exploded = false;
            this.rocket = new Particle({
                x: this.x,
                y: this.y, // Already at target from handleTrigger
                vx: 0,
                vy: 0,
                size: 1,
                hue: 0,
                saturation: 0,
                brightness: 0,
                color: '#000000',
                isSeed: true,
                gravity: 0,
                drag: 1,
                type: 'circle',
                image: null,
                lifespan: 0.01 // Very short lifespan
            });
        } else {
            // Normal mode: Create rocket particle
            this.exploded = false;
            // If user avatar is available, use it as the rocket head
            const rocketType = this.userAvatar ? 'image' : 'circle';
            const rocketImage = this.userAvatar;
            const rocketSize = this.userAvatar ? 8 + this.intensity : 3 + this.intensity;
            
            this.rocket = new Particle({
                x: this.x,
                y: this.y,
                vx: (Math.random() - 0.5) * 1.5,
                vy: CONFIG.rocketSpeed + (Math.random() - 0.5) * 2,
                size: rocketSize,
                hue: Math.random() * 360,
                saturation: 80,
                brightness: 100,
                color: this.colors[Math.floor(Math.random() * this.colors.length)],
                isSeed: true,
                gravity: CONFIG.rocketAcceleration,
                drag: 0.995,
                type: rocketType,
                image: rocketImage
            });
        }
        
        // Color palette for explosion
        this.baseHue = Math.random() * 360;
        this.hueRange = 60 + Math.random() * 60;
    }
    
    /**
     * Calculate approximate flight time for a rocket based on physics
     * Used to synchronize combined audio files
     * @param {number} startY - Starting Y position (usually canvas height)
     * @param {number} targetY - Target Y position
     * @param {number} initialVy - Initial vertical velocity (negative = upward)
     * @param {number} acceleration - Acceleration (positive = deceleration for upward movement)
     * @returns {number} Estimated flight time in seconds
     */
    calculateRocketFlightTime(startY, targetY, initialVy = CONFIG.rocketSpeed, acceleration = -CONFIG.rocketAcceleration) {
        // Physics: Using kinematic equations
        // v^2 = v0^2 + 2a(y - y0)
        // For upward motion with deceleration
        const distance = Math.abs(targetY - startY);
        
        // Time to reach target height (may hit target before reaching peak)
        // y = y0 + v0*t + 0.5*a*t^2
        // Rearrange: 0.5*a*t^2 + v0*t + (y0 - y) = 0
        // Solve quadratic equation
        const a = 0.5 * acceleration;
        const b = initialVy;
        const c = distance;
        
        if (Math.abs(a) < 0.001) {
            // No acceleration, constant velocity
            return distance / Math.abs(initialVy);
        }
        
        const discriminant = b*b - 4*a*c;
        if (discriminant < 0) {
            // Target unreachable, will reach peak first
            // Time to reach peak: v = v0 + at, when v=0: t = -v0/a
            return Math.abs(initialVy / acceleration);
        }
        
        // Take the positive root
        const t1 = (-b + Math.sqrt(discriminant)) / (2*a);
        const t2 = (-b - Math.sqrt(discriminant)) / (2*a);
        const t = Math.max(t1, t2);
        
        // Convert from frames to seconds (assuming 60 FPS)
        return t / 60;
    }

    shouldExplode() {
        // Instant explode mode
        if (this.shouldExplodeImmediately) {
            return true;
        }
        // Skip rocket mode - explode immediately
        if (this.skipRocket) {
            return true;
        }
        // Normal mode - explode when rocket velocity becomes downward OR reaches target height
        if (this.rocket) {
            return (this.rocket.vy >= 0 || this.rocket.y <= this.targetY) && !this.exploded;
        }
        return false;
    }
    
    explode() {
        this.exploded = true;
        
        // Play explosion sound if callback is set
        if (this.onExplodeSound) {
            if (DEBUG) console.log('[Fireworks] Explosion callback triggered - playing explosion sound');
            this.onExplodeSound(this.intensity);
        } else {
            if (DEBUG) console.log('[Fireworks] Explosion occurred but no audio callback set');
        }
        
        // For instant explode, use the position from constructor
        const explosionX = this.rocket ? this.rocket.x : this.x;
        const explosionY = this.rocket ? this.rocket.y : this.y;
        
        // Calculate particle count based on intensity and tier
        const tierMultipliers = {
            small: 0.5,
            medium: 1.0,
            big: 1.5,
            massive: 2.0
        };
        const tierMult = tierMultipliers[this.tier] || 1.0;
        const comboMult = 1 + (this.combo - 1) * 0.2;
        
        // Reduce particles for high combos to improve performance
        // Aggressive combo reduction for better FPS
        let baseParticles = 40 + Math.random() * 60;
        if (this.combo >= 20) {
            baseParticles *= 0.2; // 80% reduction for combo >= 20
        } else if (this.combo >= 10) {
            baseParticles *= 0.5; // 50% particles for combo >= 10
        } else if (this.combo >= 5) {
            baseParticles *= 0.7; // 70% particles for combo >= 5
        }
        
        // Additional FPS-based reduction - reduce particles when FPS is low
        if (this.engineFps < 30) {
            baseParticles *= 0.5; // 50% reduction when FPS < 30
        } else if (this.engineFps < 45) {
            baseParticles *= 0.75; // 25% reduction when FPS < 45
        }
        
        const particleCount = Math.floor(baseParticles * this.intensity * tierMult * comboMult);
        
        // Get velocities from shape generator
        const generator = ShapeGenerators[this.shape] || ShapeGenerators.burst;
        const velocities = generator(particleCount, this.intensity);
        
        // Create explosion particles
        for (let i = 0; i < velocities.length; i++) {
            const vel = velocities[i];
            const hue = this.baseHue + (Math.random() * this.hueRange);
            const isSparkle = Math.random() < CONFIG.sparkleChance;
            
            // Determine particle appearance
            // Priority: shape-specific particle types > gift images > standard circles
            let particleType = vel.particleType || 'circle'; // Use shape-specific type if provided
            let particleImage = null;
            
            // Override with gift/avatar images for non-shape-specific particles
            if (particleType === 'circle' && !isSparkle && this.giftImage) {
                // Use gift image for explosion particles (70% chance when available)
                if (Math.random() < 0.7) {
                    particleType = 'image';
                    particleImage = this.giftImage;
                }
            } else if (particleType === 'circle' && !isSparkle && this.userAvatar && Math.random() < 0.3) {
                // Use avatar occasionally if no gift image (30% chance)
                particleType = 'image';
                particleImage = this.userAvatar;
            }
            
            const particle = globalParticlePool ? globalParticlePool.acquire({
                x: explosionX,
                y: explosionY,
                vx: vel.vx,
                vy: vel.vy,
                size: isSparkle ? 2 + Math.random() * 2 : (particleType === 'image' ? 4 + Math.random() * 4 : 3 + Math.random() * 4),
                hue: hue,
                saturation: isSparkle ? 100 : 90,
                brightness: isSparkle ? 100 : 95,
                lifespan: isSparkle ? 0.6 + Math.random() * 0.4 : 0.8 + Math.random() * 0.6,
                decay: isSparkle ? 0.015 : 0.008,
                isSeed: false,
                isSparkle: isSparkle,
                type: particleType,
                image: particleImage,
                mass: isSparkle ? 0.5 : 1,
                drag: isSparkle ? 0.97 : 0.98,
                gravity: isSparkle ? CONFIG.gravity * 0.8 : CONFIG.gravity,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.1,
                // Pass through secondary explosion properties from velocity data
                willBurst: vel.willBurst || false,
                burstDelay: vel.burstDelay || 0,
                willSpiral: vel.willSpiral || false,
                spiralDelay: vel.spiralDelay || 0
            }) : new Particle({
                x: explosionX,
                y: explosionY,
                vx: vel.vx,
                vy: vel.vy,
                size: isSparkle ? 2 + Math.random() * 2 : (particleType === 'image' ? 4 + Math.random() * 4 : 3 + Math.random() * 4),
                hue: hue,
                saturation: isSparkle ? 100 : 90,
                brightness: isSparkle ? 100 : 95,
                lifespan: isSparkle ? 0.6 + Math.random() * 0.4 : 0.8 + Math.random() * 0.6,
                decay: isSparkle ? 0.015 : 0.008,
                isSeed: false,
                isSparkle: isSparkle,
                type: particleType,
                image: particleImage,
                mass: isSparkle ? 0.5 : 1,
                drag: isSparkle ? 0.97 : 0.98,
                gravity: isSparkle ? CONFIG.gravity * 0.8 : CONFIG.gravity,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.1,
                // Pass through secondary explosion properties from velocity data
                willBurst: vel.willBurst || false,
                burstDelay: vel.burstDelay || 0,
                willSpiral: vel.willSpiral || false,
                spiralDelay: vel.spiralDelay || 0
            });
            
            this.particles.push(particle);
            
            // Chance for secondary explosion (only for non-image particles to avoid lag)
            // Disable for high combos or low FPS to improve performance
            // Only allow secondary explosions when combo < 5 AND fps > 40
            if (this.combo < 5 && this.engineFps > 40 && Math.random() < CONFIG.secondaryExplosionChance && !isSparkle && particleType === 'circle') {
                particle.willExplode = true;
                particle.explosionDelay = 20 + Math.floor(Math.random() * 30);
            }
        }
    }
    
    update(deltaTime = 1.0) {
        // Handle instant explode mode
        if (this.shouldExplodeImmediately && !this.exploded) {
            this.explode();
            this.shouldExplodeImmediately = false;
            return;
        }
        
        // Update rocket (if exists and not exploded)
        if (!this.exploded && this.rocket) {
            this.rocket.applyGravity();
            this.rocket.update(deltaTime);
            
            if (this.shouldExplode()) {
                this.explode();
            }
        }
        
        // Update explosion particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.applyGravity();
            p.update(deltaTime);
            
            // Check for secondary mini-burst (burst shape)
            if (p.willBurst && !p.hasBurst && performance.now() - p.burstTime >= p.burstDelay) {
                p.hasBurst = true;
                this.createMiniBurst(p);
                // Trigger crackling sound callback
                if (this.onSecondaryExplosionSound && !this.secondaryAudioPlayed) {
                    this.secondaryAudioPlayed = true;
                    this.onSecondaryExplosionSound();
                }
            }
            
            // Check for secondary spiral burst (spiral shape)
            if (p.willSpiral && !p.hasSpiraled && performance.now() - p.burstTime >= p.spiralDelay) {
                p.hasSpiraled = true;
                this.createSpiralBurst(p);
                // Trigger crackling sound callback
                if (this.onSecondaryExplosionSound && !this.secondaryAudioPlayed) {
                    this.secondaryAudioPlayed = true;
                    this.onSecondaryExplosionSound();
                }
            }
            
            // Check for secondary explosions
            if (p.willExplode && p.age >= p.explosionDelay && !p.exploded) {
                p.exploded = true;
                this.createSecondaryExplosion(p);
            }
            
            // Remove dead particles
            if (p.isDone()) {
                if (globalParticlePool) {
                    globalParticlePool.release(p);
                }
                this.particles.splice(i, 1);
            }
        }
        
        // Update secondary explosions
        for (let i = this.secondaryExplosions.length - 1; i >= 0; i--) {
            const p = this.secondaryExplosions[i];
            p.applyGravity();
            p.update(deltaTime);
            
            if (p.isDone()) {
                if (globalParticlePool) {
                    globalParticlePool.release(p);
                }
                this.secondaryExplosions.splice(i, 1);
            }
        }
    }
    
    createSecondaryExplosion(sourceParticle) {
        const count = 8 + Math.floor(Math.random() * 12);
        
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = 1 + Math.random() * 2;
            
            const particle = globalParticlePool ? globalParticlePool.acquire({
                x: sourceParticle.x,
                y: sourceParticle.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 1 + Math.random() * 2,
                hue: sourceParticle.hue + (Math.random() - 0.5) * 30,
                saturation: 100,
                brightness: 100,
                lifespan: 0.4 + Math.random() * 0.3,
                decay: 0.02,
                isSeed: false,
                isSparkle: true,
                mass: 0.3,
                drag: 0.96,
                gravity: CONFIG.gravity * 0.6
            }) : new Particle({
                x: sourceParticle.x,
                y: sourceParticle.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 1 + Math.random() * 2,
                hue: sourceParticle.hue + (Math.random() - 0.5) * 30,
                saturation: 100,
                brightness: 100,
                lifespan: 0.4 + Math.random() * 0.3,
                decay: 0.02,
                isSeed: false,
                isSparkle: true,
                mass: 0.3,
                drag: 0.96,
                gravity: CONFIG.gravity * 0.6
            });
            
            this.secondaryExplosions.push(particle);
        }
    }
    
    createMiniBurst(sourceParticle) {
        // Mini-burst: particle bursts into smaller dots
        const count = 4 + Math.floor(Math.random() * 5); // 4-8 mini particles
        
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
            const speed = 0.8 + Math.random() * 1.2;
            
            const particle = globalParticlePool ? globalParticlePool.acquire({
                x: sourceParticle.x,
                y: sourceParticle.y,
                vx: sourceParticle.vx * 0.3 + Math.cos(angle) * speed,
                vy: sourceParticle.vy * 0.3 + Math.sin(angle) * speed,
                size: 1 + Math.random() * 1.5,
                hue: sourceParticle.hue + (Math.random() - 0.5) * 20,
                saturation: 90,
                brightness: 95,
                lifespan: 0.3 + Math.random() * 0.2,
                decay: 0.025,
                isSeed: false,
                isSparkle: true,
                mass: 0.2,
                drag: 0.95,
                gravity: CONFIG.gravity * 0.5
            }) : new Particle({
                x: sourceParticle.x,
                y: sourceParticle.y,
                vx: sourceParticle.vx * 0.3 + Math.cos(angle) * speed,
                vy: sourceParticle.vy * 0.3 + Math.sin(angle) * speed,
                size: 1 + Math.random() * 1.5,
                hue: sourceParticle.hue + (Math.random() - 0.5) * 20,
                saturation: 90,
                brightness: 95,
                lifespan: 0.3 + Math.random() * 0.2,
                decay: 0.025,
                isSeed: false,
                isSparkle: true,
                mass: 0.2,
                drag: 0.95,
                gravity: CONFIG.gravity * 0.5
            });
            
            this.secondaryExplosions.push(particle);
        }
    }
    
    createSpiralBurst(sourceParticle) {
        // Spiral burst: particle emits spiral mini-burst
        const count = 3 + Math.floor(Math.random() * 4); // 3-6 spiral particles
        const spiralTurns = 1.5;
        
        for (let i = 0; i < count; i++) {
            const t = (i / count) * spiralTurns * Math.PI * 2;
            const radius = 0.5 + (i / count) * 0.8;
            const speed = 1.0 + Math.random() * 0.8;
            
            const particle = globalParticlePool ? globalParticlePool.acquire({
                x: sourceParticle.x,
                y: sourceParticle.y,
                vx: sourceParticle.vx * 0.2 + Math.cos(t) * radius * speed,
                vy: sourceParticle.vy * 0.2 + Math.sin(t) * radius * speed,
                size: 1.2 + Math.random() * 1.5,
                hue: sourceParticle.hue + (Math.random() - 0.5) * 25,
                saturation: 85,
                brightness: 90,
                lifespan: 0.35 + Math.random() * 0.25,
                decay: 0.022,
                isSeed: false,
                isSparkle: true,
                mass: 0.25,
                drag: 0.94,
                gravity: CONFIG.gravity * 0.4,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.15
            }) : new Particle({
                x: sourceParticle.x,
                y: sourceParticle.y,
                vx: sourceParticle.vx * 0.2 + Math.cos(t) * radius * speed,
                vy: sourceParticle.vy * 0.2 + Math.sin(t) * radius * speed,
                size: 1.2 + Math.random() * 1.5,
                hue: sourceParticle.hue + (Math.random() - 0.5) * 25,
                saturation: 85,
                brightness: 90,
                lifespan: 0.35 + Math.random() * 0.25,
                decay: 0.022,
                isSeed: false,
                isSparkle: true,
                mass: 0.25,
                drag: 0.94,
                gravity: CONFIG.gravity * 0.4,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.15
            });
            
            this.secondaryExplosions.push(particle);
        }
    }
    
    isDone() {
        return this.exploded && 
               this.particles.length === 0 && 
               this.secondaryExplosions.length === 0;
    }
}

// ============================================================================
// SHAPE GENERATORS - Mathematical patterns for explosions
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
                    willBurst: true, // Mark for secondary mini-burst
                    burstDelay: 500 + Math.random() * 300 // 0.5-0.8s delay
                });
            }
        }
        return particles;
    },

    heart: (count, intensity) => {
        const particles = [];
        const layers = 4; // More layers for denser, more recognizable heart
        const particlesPerLayer = Math.floor(count / layers);
        
        for (let layer = 0; layer < layers; layer++) {
            const layerScale = 0.5 + (layer * 0.15); // Tighter sizing for better shape
            for (let i = 0; i < particlesPerLayer; i++) {
                const t = (i / particlesPerLayer) * Math.PI * 2;
                // Enhanced parametric heart equation for better recognition
                const x = 16 * Math.pow(Math.sin(t), 3);
                const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
                
                const mag = Math.max(Math.sqrt(x*x + y*y), 1);
                const speed = (0.15 + Math.random() * 0.05) * intensity * layerScale; // Tighter speed for clustering
                particles.push({
                    vx: (x / mag) * speed * 8, // Reduced multiplier for tighter clustering
                    vy: (y / mag) * speed * 8,
                    particleType: 'heart' // Mark as heart-shaped particles
                });
            }
        }
        return particles;
    },

    star: (count, intensity) => {
        const particles = [];
        const points = 5; // 5-pointed star
        const layers = 2; // Inner and outer layers for better definition
        const particlesPerPoint = Math.floor(count / (points * 2)); // Particles per point tip
        
        for (let point = 0; point < points; point++) {
            // Outer point angle
            const outerAngle = (Math.PI * 2 * point) / points - Math.PI / 2;
            // Inner valley angle (between two points)
            const innerAngle = outerAngle + (Math.PI / points);
            
            // Outer point (star tip)
            for (let i = 0; i < particlesPerPoint; i++) {
                const t = i / particlesPerPoint;
                const spread = (Math.random() - 0.5) * 0.15; // Slight spread
                const angle = outerAngle + spread;
                const radiusMix = 0.8 + t * 0.4; // Gradient from center to tip
                const speed = (2 + Math.random() * 1) * intensity * radiusMix;
                particles.push({
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed
                });
            }
            
            // Inner valley (between points)
            for (let i = 0; i < particlesPerPoint / 2; i++) {
                const t = i / (particlesPerPoint / 2);
                const spread = (Math.random() - 0.5) * 0.1;
                const angle = innerAngle + spread;
                const radiusMix = 0.3 + t * 0.3; // Shorter for valley
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
                willSpiral: true, // Mark for secondary spiral burst
                spiralDelay: 600 + Math.random() * 400 // 0.6-1.0s delay
            });
        }
        return particles;
    },
    
    paws: (count, intensity) => {
        const particles = [];
        // Paw print layout: 1 large center pad + 4 toe pads
        const centerPadParticles = Math.floor(count * 0.4); // 40% for center
        const toeParticles = Math.floor((count - centerPadParticles) / 4); // Split rest among 4 toes
        
        // Center pad (large, bottom-center)
        for (let i = 0; i < centerPadParticles; i++) {
            const angle = (Math.PI * 2 * i) / centerPadParticles + Math.random() * 0.3;
            const radius = 0.3 + Math.random() * 0.2;
            const speed = (0.8 + Math.random() * 0.4) * intensity;
            const offsetY = 0.6; // Position lower for center pad
            particles.push({
                vx: Math.cos(angle) * radius * speed,
                vy: (Math.sin(angle) * radius * speed) + (offsetY * intensity),
                particleType: 'paw' // Paw emoji particles
            });
        }
        
        // 4 toe pads (smaller, arranged around top in arc)
        const toePositions = [
            { angle: -2.4, distance: 1.2 }, // Top-left
            { angle: -1.8, distance: 1.4 }, // Mid-left
            { angle: -1.3, distance: 1.4 }, // Mid-right
            { angle: -0.7, distance: 1.2 }  // Top-right
        ];
        
        for (let toe = 0; toe < 4; toe++) {
            const toePos = toePositions[toe];
            for (let i = 0; i < toeParticles; i++) {
                const localAngle = (Math.PI * 2 * i) / toeParticles;
                const radius = 0.15 + Math.random() * 0.1;
                const speed = (0.6 + Math.random() * 0.3) * intensity;
                
                // Calculate toe pad position
                const basex = Math.cos(toePos.angle) * toePos.distance;
                const basey = Math.sin(toePos.angle) * toePos.distance;
                
                particles.push({
                    vx: (basex + Math.cos(localAngle) * radius) * speed,
                    vy: (basey + Math.sin(localAngle) * radius) * speed,
                    particleType: 'paw' // Paw emoji particles
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
                vy: Math.sin(angle) * speed - 1 // Downward bias for willow effect
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
        
        // Audio selection constants for performance
        this.TINY_BANG_SOUNDS = ['combined-whistle-tiny1', 'combined-whistle-tiny2', 'combined-whistle-tiny3', 'combined-whistle-tiny4'];
        this.SMALL_SOUNDS = ['combined-whistle-tiny1', 'combined-whistle-tiny2', 'combined-whistle-tiny3'];
        
        // Launch sound variations for more variety
        this.BASIC_LAUNCH_SOUNDS = ['launch-basic', 'launch-basic2', 'rocket-basic'];
        this.SMOOTH_LAUNCH_SOUNDS = ['launch-smooth', 'launch-smooth2'];
        this.ALL_LAUNCH_SOUNDS = ['launch-basic', 'launch-basic2', 'rocket-basic', 'launch-whistle', 'launch-smooth', 'launch-smooth2'];
        
        // Explosion sounds organized by tier for better matching with firework size
        this.EXPLOSION_SMALL = ['explosion-basic', 'explosion-small', 'explosion-alt1']; // Short, quick explosions
        this.EXPLOSION_MEDIUM = ['explosion-medium', 'explosion-alt2', 'explosion-pop']; // Medium explosions
        this.EXPLOSION_BIG = ['explosion-big', 'explosion-huge']; // Big, powerful explosions
        this.EXPLOSION_ALL = ['explosion-basic', 'explosion-small', 'explosion-medium', 'explosion-alt1', 'explosion-alt2', 'explosion-big', 'explosion-huge', 'explosion-pop'];
        
        // Crackling sounds for atmospheric effects (can be layered with explosions)
        this.CRACKLING_SOUNDS = ['crackling-medium', 'crackling-long'];
        
        // Volume constants for consistent audio levels (updated for better balance)
        this.COMBINED_AUDIO_VOLUME = 0.65;       // Volume for combined (launch+explosion) audio
        this.LAUNCH_AUDIO_VOLUME = 0.45;         // Volume for separate launch sounds
        this.NORMAL_EXPLOSION_VOLUME = 0.7;      // Volume for normal explosions
        this.INSTANT_EXPLODE_VOLUME = 0.25;      // Volume for instant explosions (high combos)
        this.CRACKLING_VOLUME = 0.35;            // Volume for crackling effects (layered, so quieter)
        
        // Per-file volume multipliers for balancing inherent loudness differences
        // Analyzed based on file size and perceived loudness
        this.AUDIO_VOLUME_MULTIPLIERS = {
            // Loud explosions - reduce volume
            'explosion-huge': 0.7,      // Very loud, long explosion
            'explosion-big': 0.8,       // Loud explosion
            'explosion-pop': 0.75,      // Sharp, loud pop
            
            // Quiet sounds - boost volume
            'explosion-basic': 1.3,     // Very short, quiet pop
            'explosion-alt1': 1.1,      // Slightly quiet
            'rocket-basic': 1.2,        // Short launch sound
            
            // Crackling - reduce for layering
            'crackling-long': 0.6,      // Very long, loud atmospheric
            'crackling-medium': 0.7,    // Medium atmospheric
            
            // Launch sounds - slight boost for presence
            'launch-basic': 1.1,
            'launch-basic2': 1.1,
            'launch-whistle': 1.0,
            'launch-smooth': 1.0,
            'launch-smooth2': 1.0,
            
            // Combined audio - standard
            'combined-crackling-bang': 1.0,
            'combined-whistle-normal': 1.0,
            'combined-whistle-tiny1': 1.0,
            'combined-whistle-tiny2': 1.0,
            'combined-whistle-tiny3': 1.0,
            'combined-whistle-tiny4': 0.9,  // Longer file (3.42s vs 1.15s), slightly reduced volume
            
            // Medium explosions - standard to slight boost
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
            
            // Apply per-file volume multiplier if exists
            const volumeMultiplier = this.AUDIO_VOLUME_MULTIPLIERS[name] || 1.0;
            gainNode.gain.value = this.volume * volume * volumeMultiplier;
            
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            source.start(0);
        } catch (e) {
            console.warn('[Fireworks Audio] Playback error:', e.message);
        }
    }

    /**
     * Play a sound with automatic fade-out after a specified duration.
     * Perfect for crackling sounds that should fade out when visual effects end.
     * 
     * @param {string} name - The name of the sound to play (must be preloaded)
     * @param {number} volume - Volume multiplier (0.0 to 1.0), will be multiplied by global volume
     * @param {number} duration - Total duration in seconds before fade starts
     * @param {number} fadeOutDuration - Duration of the fade-out in seconds (default: 0.5s)
     * 
     * @example
     * // Play crackling for 2 seconds, then fade out over 0.5 seconds
     * await audioManager.playWithFadeOut('crackling-long', 0.35, 2.0, 0.5);
     */
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
            
            // Apply per-file volume multiplier if exists
            const volumeMultiplier = this.AUDIO_VOLUME_MULTIPLIERS[name] || 1.0;
            const finalVolume = this.volume * volume * volumeMultiplier;
            
            // Set initial volume
            gainNode.gain.value = finalVolume;
            
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Start playback
            const startTime = this.audioContext.currentTime;
            source.start(0);
            
            // Schedule fade-out
            const fadeStartTime = startTime + duration;
            const fadeEndTime = fadeStartTime + fadeOutDuration;
            
            // Exponential fade-out for more natural sound
            gainNode.gain.setValueAtTime(finalVolume, fadeStartTime);
            gainNode.gain.exponentialRampToValueAtTime(0.00001, fadeEndTime); // Very small value to avoid audio artifacts
            gainNode.gain.setValueAtTime(0, fadeEndTime); // Ensure complete silence
            
            // Stop the source after fade completes
            source.stop(fadeEndTime + 0.1);
            
            if (CONFIG.debugMode) {
                if (DEBUG) console.log(`[Fireworks Audio] Playing ${name} with fade-out: duration=${duration}s, fade=${fadeOutDuration}s`);
            }
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

    /**
     * Play a sound after a specified delay (in seconds).
     * Useful for synchronizing explosion sounds with visual explosions when using separate audio files.
     * 
     * @param {string} name - The name of the sound to play (must be preloaded)
     * @param {number} delay - Delay in seconds before playing the sound
     * @param {number} [volume=1.0] - Volume multiplier (0.0 to 1.0), will be multiplied by global volume
     * 
     * @example
     * // Play explosion sound after 2 seconds
     * await audioManager.playDelayed('explosion-basic', 2.0, 0.8);
     */
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
            
            // Schedule playback after delay
            const startTime = this.audioContext.currentTime + delay;
            source.start(startTime);
        } catch (e) {
            console.warn('[Fireworks Audio] Delayed playback error:', e.message);
        }
    }

    /**
     * Select appropriate audio based on firework tier and combo.
     * Returns an object with audio configuration for synchronized playback.
     * 
     * SYNCHRONIZATION STRATEGY (FINAL FIX - 100% CALLBACK-BASED):
     * - Launch sound plays immediately when rocket fires
     * - Explosion sound triggers via onExplodeSound callback EXACTLY when visual explodes
     * - **Perfect synchronization guaranteed** regardless of rocket flight time variations
     * 
     * WHY CALLBACK-ONLY:
     * - Combined audio files have FIXED explosion timing (1.0s, 3.3s, 4.8s)
     * - Rocket flight times VARY (0.8s to 5.5s) based on physics and target position
     * - Using combined audio caused delays when flight time didn't match audio timing
     * - Callback ensures explosion sound always matches visual explosion perfectly
     * 
     * @param {string} tier - Firework tier: 'small', 'medium', 'big', or 'massive'
     * @param {number} combo - Current combo count (affects audio selection)
     * @param {boolean} [instantExplode=false] - Whether firework explodes instantly (no rocket animation)
     * @returns {Object} Audio configuration with sound names (always callback-based)
     */
    selectAudio(tier, combo, instantExplode = false) {
        // For instant explosions (high combo), use appropriate explosion based on tier
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

        // For high combos (5-7), use quick sounds for rapid bursts
        if (combo >= 5 && combo < 8) {
            return {
                useCombinedAudio: false,
                launchSound: this.BASIC_LAUNCH_SOUNDS[Math.floor(Math.random() * this.BASIC_LAUNCH_SOUNDS.length)],
                explosionSound: this.EXPLOSION_SMALL[Math.floor(Math.random() * this.EXPLOSION_SMALL.length)],
                cracklingSound: null
            };
        }

        // Random value for variety
        const rand = Math.random();

        switch (tier) {
            case 'small':
                // Small rockets: varied launch sounds + small explosions
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
                // Medium rockets: smooth/whistle launches + medium explosions
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
                // Big rockets: whistle launches + big explosions + crackling (40%)
                return {
                    useCombinedAudio: false,
                    launchSound: 'launch-whistle',
                    explosionSound: this.EXPLOSION_BIG[Math.floor(Math.random() * this.EXPLOSION_BIG.length)],
                    cracklingSound: Math.random() < 0.4 ? this.CRACKLING_SOUNDS[Math.floor(Math.random() * this.CRACKLING_SOUNDS.length)] : null
                };

            case 'massive':
                // Massive rockets: whistle launches + huge explosions + crackling (70%)
                return {
                    useCombinedAudio: false,
                    launchSound: 'launch-whistle',
                    explosionSound: 'explosion-huge',
                    cracklingSound: Math.random() < 0.7 ? this.CRACKLING_SOUNDS[Math.floor(Math.random() * this.CRACKLING_SOUNDS.length)] : null
                };

            default:
                // Fallback to small if tier is unknown
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
// FIREWORKS ENGINE - Main rendering and orchestration
// ============================================================================

class FireworksEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.fireworks = [];
        this.audioManager = new AudioManager();
        
        // Initialize particle pool for high performance
        if (!globalParticlePool) {
            globalParticlePool = new ParticlePool(5000);
        }
        this.particlePool = globalParticlePool;
        
        this.lastTime = performance.now();
        this.lastRenderTime = performance.now(); // Track last actual render time for FPS limiting
        this.frameCount = 0;
        this.fps = 0;
        this.fpsUpdateTime = performance.now();
        this.fpsHistory = []; // Track FPS history for adaptive performance
        this.performanceMode = 'normal'; // 'normal', 'reduced', 'minimal'
        
        // Freeze detection and failsafe
        this.freezeDetectionEnabled = true; // Can be disabled for debugging
        this.frozenFrameCount = 0; // Count consecutive frames with 0 FPS
        this.maxFrozenFrames = 3; // Reload after 3 consecutive seconds of 0 FPS
        this.freezeWarningShown = false;
        
        // Combo throttling to prevent extreme lag
        this.lastComboTriggerTime = 0;
        this.comboTriggerQueue = [];
        
        this.config = { 
            ...CONFIG,
            toasterMode: false,
            audioEnabled: true,
            audioVolume: 0.7,
            trailsEnabled: true,
            glowEnabled: true,
            resolution: CONFIG.resolution,
            resolutionPreset: CONFIG.resolutionPreset,
            orientation: CONFIG.orientation,
            targetFps: CONFIG.targetFps,
            minFps: CONFIG.minFps,
            giftPopupPosition: CONFIG.giftPopupPosition
        };
        
        this.running = false;
        this.socket = null;
        this.imageCache = new Map();
        this.debugMode = false;
        
        this.width = 0;
        this.height = 0;
    }

    async init() {
        // Setup canvas
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Initialize audio
        await this.audioManager.init();

        // Connect to Socket.io
        this.connectSocket();

        // Start render loop
        this.running = true;
        this.render();

        if (DEBUG) console.log('[Fireworks Engine] Initialized with Canvas 2D');
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        // Get resolution from preset
        const resolutionPreset = this.config.resolutionPreset || '1080p';
        const orientation = this.config.orientation || 'landscape';
        const targetResolution = this.getResolutionFromPreset(resolutionPreset, orientation);
        
        // Apply target resolution
        this.canvas.width = targetResolution.width;
        this.canvas.height = targetResolution.height;
        
        this.width = targetResolution.width;
        this.height = targetResolution.height;
        
        if (DEBUG) console.log(`[Fireworks] Canvas resolution: ${this.canvas.width}x${this.canvas.height} (${resolutionPreset}, ${orientation})`);
    }
    
    getResolutionFromPreset(preset, orientation) {
        const resolutions = {
            '360p': { landscape: { width: 640, height: 360 }, portrait: { width: 360, height: 640 } },
            '540p': { landscape: { width: 960, height: 540 }, portrait: { width: 540, height: 960 } },
            '720p': { landscape: { width: 1280, height: 720 }, portrait: { width: 720, height: 1280 } },
            '1080p': { landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 } },
            '1440p': { landscape: { width: 2560, height: 1440 }, portrait: { width: 1440, height: 2560 } },
            '4k': { landscape: { width: 3840, height: 2160 }, portrait: { width: 2160, height: 3840 } }
        };
        
        const presetData = resolutions[preset] || resolutions['1080p'];
        return orientation === 'portrait' ? presetData.portrait : presetData.landscape;
    }

    connectSocket() {
        try {
            this.socket = io({
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000
            });

            this.socket.on('connect', () => {
                if (DEBUG) console.log('[Fireworks Engine] Connected to server');
            });

            this.socket.on('fireworks:trigger', (data) => {
                this.handleTrigger(data);
            });

            this.socket.on('fireworks:finale', (data) => {
                this.handleFinale(data);
            });

            this.socket.on('fireworks:follower-animation', (data) => {
                this.showFollowerAnimation(data);
            });

            this.socket.on('fireworks:config-update', (data) => {
                if (data.config) {
                    const oldResolution = this.config.resolution;
                    const oldPreset = this.config.resolutionPreset;
                    const oldOrientation = this.config.orientation;
                    
                    Object.assign(this.config, data.config);
                    this.audioManager.setEnabled(this.config.audioEnabled);
                    this.audioManager.setVolume(this.config.audioVolume);
                    
                    // Update CONFIG values for despawn and FPS
                    if (data.config.despawnFadeDuration !== undefined) {
                        CONFIG.despawnFadeDuration = data.config.despawnFadeDuration;
                    }
                    if (data.config.minFps !== undefined) {
                        CONFIG.minFps = data.config.minFps;
                    }
                    if (data.config.targetFps !== undefined) {
                        CONFIG.targetFps = data.config.targetFps;
                    }
                    if (data.config.giftPopupEnabled !== undefined) {
                        CONFIG.giftPopupEnabled = data.config.giftPopupEnabled;
                    }
                    if (data.config.giftPopupPosition !== undefined) {
                        CONFIG.giftPopupPosition = data.config.giftPopupPosition;
                    }
                    
                    // Resize canvas if resolution or orientation changed
                    if (oldResolution !== this.config.resolution || 
                        oldPreset !== this.config.resolutionPreset ||
                        oldOrientation !== this.config.orientation) {
                        this.resize();
                    }
                    
                    if (DEBUG) console.log('[Fireworks] Config updated:', data.config);
                }
            });

            this.socket.on('disconnect', () => {
                if (DEBUG) console.log('[Fireworks Engine] Disconnected from server');
            });
        } catch (e) {
            console.error('[Fireworks Engine] Socket connection error:', e);
        }
    }

    showFollowerAnimation(data) {
        const animationEl = document.getElementById('follower-animation');
        const contentEl = animationEl?.querySelector('.follower-content');
        const usernameEl = document.getElementById('follower-username');
        const avatarEl = document.getElementById('follower-avatar');
        
        if (!animationEl || !contentEl || !usernameEl || !avatarEl) return;
        
        // Remove all previous position, style, size, and entrance classes
        animationEl.className = 'follower-animation';
        contentEl.className = 'follower-content';
        contentEl.style.transform = ''; // Clear inline transform
        
        // Set position class
        const position = data.position || 'center';
        animationEl.classList.add(`pos-${position}`);
        
        // Set size class
        const size = data.size || 'medium';
        animationEl.classList.add(`size-${size}`);
        
        // Apply custom scale if size is 'custom'
        if (size === 'custom') {
            const scale = data.scale || 1.0;
            contentEl.style.transform = `scale(${scale})`;
        }
        
        // Set style class
        const style = data.style || 'gradient-purple';
        contentEl.classList.add(`style-${style}`);
        
        // Set entrance animation class
        const entrance = data.entrance || 'scale';
        animationEl.classList.add(`entrance-${entrance}`);
        
        // Set username
        usernameEl.textContent = data.username || 'Unknown';
        
        // Set avatar if provided
        if (data.profilePictureUrl) {
            avatarEl.src = data.profilePictureUrl;
            avatarEl.classList.add('show');
        } else {
            avatarEl.classList.remove('show');
        }
        
        // Show animation
        animationEl.classList.add('show');
        
        // Hide after duration
        const duration = data.duration || 3000;
        setTimeout(() => {
            animationEl.classList.remove('show');
            // Clean up after animation completes
            setTimeout(() => {
                animationEl.className = 'follower-animation';
                contentEl.className = 'follower-content';
                contentEl.style.transform = '';
            }, 500); // Wait for exit animation
        }, duration);
    }

    async handleTrigger(data) {
        const {
            position = { x: 0.5, y: 0.5 },
            shape = 'burst',
            colors = this.config.defaultColors,
            intensity = 1.0,
            particleCount = 50,
            giftImage = null,
            userAvatar = null,
            avatarParticleChance = 0.3,
            tier = 'medium',
            username = null,
            coins = 0,
            combo = 1,
            playSound = true,
            // New config values from trigger
            targetFps = null,
            minFps = null,
            despawnFadeDuration = null,
            giftPopupEnabled = null,
            giftPopupPosition = null
        } = data;

        // Update config values if provided
        if (targetFps !== null) {
            this.config.targetFps = targetFps;
            CONFIG.targetFps = targetFps;
        }
        if (minFps !== null) {
            this.config.minFps = minFps;
            CONFIG.minFps = minFps;
        }
        if (despawnFadeDuration !== null) {
            this.config.despawnFadeDuration = despawnFadeDuration;
            CONFIG.despawnFadeDuration = despawnFadeDuration;
        }
        if (giftPopupEnabled !== null) {
            this.config.giftPopupEnabled = giftPopupEnabled;
            CONFIG.giftPopupEnabled = giftPopupEnabled;
        }
        if (giftPopupPosition !== null) {
            this.config.giftPopupPosition = giftPopupPosition;
            CONFIG.giftPopupPosition = giftPopupPosition;
        }

        // Combo throttling: prevent extreme lag from rapid combos
        const now = performance.now();
        const timeSinceLastTrigger = now - this.lastComboTriggerTime;
        const minInterval = CONFIG.comboThrottleMinInterval;
        
        // Skip if triggered too quickly (except for first trigger)
        if (this.lastComboTriggerTime > 0 && timeSinceLastTrigger < minInterval) {
            if (DEBUG) console.log('[Fireworks] Combo throttled (too fast)');
            return;
        }
        
        this.lastComboTriggerTime = now;
        
        // High combo optimization: skip rockets entirely for very high combos
        const skipRockets = combo >= CONFIG.comboSkipRocketsThreshold;
        const instantExplode = combo >= CONFIG.comboInstantExplodeThreshold;
        
        if (instantExplode) {
            if (DEBUG) console.log(`[Fireworks] Instant explosion mode (combo: ${combo})`);
        } else if (skipRockets) {
            if (DEBUG) console.log(`[Fireworks] Skipping rocket animation (combo: ${combo})`);
        }

        // Launch position at bottom, target at specified position
        const startX = position.x * this.width;
        const targetY = position.y * this.height;

        // Load images if provided
        let giftImg = null;
        let avatarImg = null;
        if (giftImage) giftImg = await this.loadImage(giftImage);
        if (userAvatar) avatarImg = await this.loadImage(userAvatar);

        // Create firework
        const firework = new Firework({
            x: startX,
            y: skipRockets ? targetY : this.height, // Start at target if skipping rockets
            targetY: targetY,
            shape: shape,
            colors: colors,
            intensity: intensity,
            giftImage: giftImg,
            userAvatar: avatarImg,
            avatarParticleChance: avatarParticleChance,
            useImages: !!(giftImg || avatarImg),
            tier: tier,
            combo: combo,
            skipRocket: skipRockets, // Pass flag to Firework class
            instantExplode: instantExplode, // Explode immediately without any delay
            engineFps: this.fps // Pass current FPS for performance-based decisions
        });
        
        // Calculate expected rocket flight time for audio synchronization
        let expectedFlightTime = 1.5; // Default
        if (!skipRockets && !instantExplode && firework.rocket) {
            expectedFlightTime = firework.calculateRocketFlightTime(
                firework.y,
                firework.targetY,
                CONFIG.rocketSpeed,
                -CONFIG.rocketAcceleration
            );
            if (DEBUG) console.log(`[Fireworks] Calculated flight time: ${expectedFlightTime.toFixed(2)}s for targetY: ${targetY}`);
        }
        
        // Audio selection and playback with synchronization
        if (playSound && this.audioManager.enabled) {
            const audioConfig = this.audioManager.selectAudio(tier, combo, instantExplode, expectedFlightTime);
            
            if (DEBUG) console.log(`[Fireworks] Audio strategy: ${audioConfig.useCombinedAudio ? 'Combined' : 'Callback'}`);
            
            if (audioConfig.useCombinedAudio) {
                // COMBINED AUDIO PLAYBACK
                // Single file contains both launch and explosion (pre-synchronized)
                if (audioConfig.combinedSound && !skipRockets) {
                    if (DEBUG) console.log(`[Fireworks] Combined audio: ${audioConfig.combinedSound}`);
                    this.audioManager.play(audioConfig.combinedSound, this.audioManager.COMBINED_AUDIO_VOLUME);
                }
                
            } else {
                // CALLBACK AUDIO PLAYBACK
                // Launch plays immediately, explosion/crackling trigger via callback when visual explodes
                if (audioConfig.launchSound && !skipRockets) {
                    if (DEBUG) console.log(`[Fireworks] Launch: ${audioConfig.launchSound}`);
                    this.audioManager.play(audioConfig.launchSound, this.audioManager.LAUNCH_AUDIO_VOLUME);
                }
                
                // Set explosion sound callback to trigger when firework explodes
                const soundVolume = instantExplode 
                    ? this.audioManager.INSTANT_EXPLODE_VOLUME 
                    : this.audioManager.NORMAL_EXPLOSION_VOLUME;
                    
                if (audioConfig.explosionSound) {
                    if (DEBUG) console.log(`[Fireworks] Setting explosion callback: ${audioConfig.explosionSound}`);
                    firework.onExplodeSound = (intensity) => {
                        if (DEBUG) console.log(`[Fireworks] Explosion callback triggered: ${audioConfig.explosionSound}`);
                        this.audioManager.play(audioConfig.explosionSound, intensity * soundVolume);
                        
                        // Add crackling layer with explosion for perfect sync
                        // Use fade-out to match visual particle lifetime (typical: 0.8-1.4s)
                        if (audioConfig.cracklingSound) {
                            if (DEBUG) console.log(`[Fireworks] Crackling with explosion: ${audioConfig.cracklingSound}`);
                            // Duration based on tier: bigger fireworks = longer crackling
                            const cracklingDuration = tier === 'massive' ? 2.0 : 
                                                    tier === 'big' ? 1.5 : 
                                                    1.2;
                            const fadeOutDuration = 0.8; // Smooth fade-out
                            this.audioManager.playWithFadeOut(
                                audioConfig.cracklingSound, 
                                this.audioManager.CRACKLING_VOLUME,
                                cracklingDuration,
                                fadeOutDuration
                            );
                        }
                    };
                    
                    // Set secondary explosion sound callback for burst/spiral secondary effects
                    if (shape === 'burst' || shape === 'spiral') {
                        firework.onSecondaryExplosionSound = () => {
                            // Play crackling sound for secondary burst/spiral with fade-out
                            const cracklingSound = Math.random() < 0.5 ? 'crackling-medium' : 'crackling-long';
                            if (DEBUG) console.log(`[Fireworks] Secondary explosion crackling: ${cracklingSound}`);
                            // Secondary crackling is shorter and quieter
                            this.audioManager.playWithFadeOut(
                                cracklingSound, 
                                this.audioManager.CRACKLING_VOLUME * 0.4,
                                1.0, // Shorter duration for secondary
                                0.5  // Quick fade-out
                            );
                        };
                    }
                } else if (instantExplode) {
                    if (DEBUG) console.log('[Fireworks] Instant explode - no launch sound needed');
                }
            }
        }

        this.fireworks.push(firework);

        // Show gift popup (always show, even for instant explosions)
        if (username && coins > 0) {
            this.showGiftPopup(startX, this.height - 100, username, coins, combo, giftImage);
        }
    }

    handleFinale(data) {
        const {
            intensity = 3.0,
            duration = 5000,
            burstCount = 15,
            burstInterval = 300,
            shapes = ['burst', 'heart', 'star', 'ring', 'spiral', 'paws'],
            colors = this.config.defaultColors
        } = data;

        // Performance optimization: reduce particles and increase interval
        const optimizedBurstCount = Math.min(burstCount, 10); // Max 10 bursts
        const optimizedInterval = Math.max(burstInterval, 500); // At least 500ms between bursts
        const optimizedIntensity = Math.min(intensity, 2.0); // Cap intensity at 2.0

        let bursts = 0;
        const interval = setInterval(() => {
            if (bursts >= optimizedBurstCount) {
                clearInterval(interval);
                return;
            }

            const position = {
                x: 0.2 + Math.random() * 0.6,
                y: 0.2 + Math.random() * 0.4
            };

            const shape = shapes[Math.floor(Math.random() * shapes.length)];

            this.handleTrigger({
                position,
                shape,
                colors,
                intensity: optimizedIntensity * (0.8 + Math.random() * 0.4),
                particleCount: Math.round(50 * optimizedIntensity), // Reduced from 80
                playSound: true // FIXED: Every rocket should have audio
            });

            bursts++;
        }, optimizedInterval);
    }

    async loadImage(url) {
        if (this.imageCache.has(url)) {
            return this.imageCache.get(url);
        }

        // Validate URL to prevent XSS - check for dangerous protocols
        if (!url || typeof url !== 'string') return null;
        const lowerUrl = url.toLowerCase();
        const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:'];
        if (dangerousProtocols.some(protocol => lowerUrl.startsWith(protocol))) {
            console.warn('[Fireworks] Invalid image URL blocked:', url);
            return null;
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = async () => {
                // Use async image decoding for better performance
                try {
                    if (img.decode) {
                        await img.decode();
                    }
                } catch (error) {
                    if (DEBUG) console.warn('[Fireworks] Image decode failed, using fallback:', error);
                }
                this.imageCache.set(url, img);
                resolve(img);
            };
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }
    
    /**
     * Preload multiple images for better performance
     * @param {Array<string>} urls - Array of image URLs to preload
     */
    async preloadImages(urls) {
        const promises = urls.map(url => this.loadImage(url));
        await Promise.all(promises);
        if (DEBUG) console.log(`[Fireworks] Preloaded ${urls.length} images`);
    }

    showGiftPopup(x, y, username, coins, combo, giftImage) {
        // Check if popups are disabled
        const popupPosition = this.config.giftPopupPosition;
        const popupEnabled = this.config.giftPopupEnabled !== false; // Default to true
        
        if (popupPosition === 'none' || !popupEnabled) return;
        
        // Calculate position based on configuration
        let finalX = x;
        let finalY = y;
        
        if (typeof popupPosition === 'string') {
            switch (popupPosition) {
                case 'top':
                    finalX = this.width / 2;
                    finalY = 100;
                    break;
                case 'middle':
                    finalX = this.width / 2;
                    finalY = this.height / 2;
                    break;
                case 'bottom':
                    finalX = x; // Keep horizontal position
                    finalY = this.height - 100;
                    break;
                default:
                    // Use provided coordinates
                    break;
            }
        } else if (typeof popupPosition === 'object' && popupPosition.x !== undefined) {
            // Custom coordinates (normalized 0-1 or pixels)
            finalX = popupPosition.x < 2 ? popupPosition.x * this.width : popupPosition.x;
            finalY = popupPosition.y < 2 ? popupPosition.y * this.height : popupPosition.y;
        }
        
        const popup = document.createElement('div');
        popup.className = 'gift-popup';
        popup.style.cssText = `
            position: absolute;
            left: ${finalX}px;
            top: ${finalY}px;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            font-size: 18px;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: popIn 0.3s ease-out, fadeOut 0.5s ease-in 2s forwards;
            pointer-events: none;
            z-index: 100;
            border: 2px solid rgba(255, 255, 255, 0.3);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;
        
        if (giftImage) {
            const img = document.createElement('img');
            img.src = giftImage;
            img.style.cssText = 'width: 32px; height: 32px; object-fit: contain;';
            popup.appendChild(img);
        }
        
        const text = document.createElement('span');
        text.textContent = `${username}: ${coins} coins`;
        popup.appendChild(text);
        
        if (combo > 1) {
            const comboSpan = document.createElement('span');
            comboSpan.style.color = '#ffcc00';
            comboSpan.textContent = ` ${combo}x COMBO!`;
            popup.appendChild(comboSpan);
        }
        
        document.getElementById('fireworks-container').appendChild(popup);
        
        setTimeout(() => popup.remove(), 2500);
    }

    render() {
        if (!this.running) return;

        const now = performance.now();
        
        // FPS Throttling: Calculate target frame time based on targetFps
        const targetFps = this.config.targetFps || CONFIG.targetFps;
        const targetFrameTime = 1000 / targetFps; // ms per frame
        const timeSinceLastRender = now - this.lastRenderTime;
        
        // Skip this frame if we're rendering too fast (with tolerance for timing jitter)
        if (timeSinceLastRender < targetFrameTime - CONFIG.FPS_TIMING_TOLERANCE) {
            requestAnimationFrame(() => this.render());
            return;
        }
        
        // Calculate deltaTime for frame-independent physics (capped at 3x normal for extreme lag)
        const deltaTime = Math.min((now - this.lastTime) / CONFIG.IDEAL_FRAME_TIME, 3);
        this.lastTime = now;
        this.lastRenderTime = now;

        // Clear with configurable background for trail effect
        const bgColor = this.config.backgroundColor || CONFIG.backgroundColor;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Update and render all fireworks with deltaTime for frame-independent physics
        for (let i = this.fireworks.length - 1; i >= 0; i--) {
            this.fireworks[i].update(deltaTime);
            this.renderFirework(this.fireworks[i]);
            
            if (this.fireworks[i].isDone()) {
                this.fireworks.splice(i, 1);
            }
        }

        // Update FPS and adaptive performance
        this.frameCount++;
        if (now - this.fpsUpdateTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsUpdateTime = now;
            
            // Track FPS history for adaptive performance
            this.fpsHistory.push(this.fps);
            if (this.fpsHistory.length > 5) {
                this.fpsHistory.shift();
            }
            
            // Freeze detection failsafe
            if (this.freezeDetectionEnabled) {
                if (this.fps === 0) {
                    this.frozenFrameCount++;
                    
                    // Show warning after first frozen frame
                    if (this.frozenFrameCount === 1 && !this.freezeWarningShown) {
                        console.warn('[Fireworks] ⚠️ FPS dropped to 0, monitoring for freeze...');
                        this.freezeWarningShown = true;
                    }
                    
                    // Auto-reload after sustained freeze
                    if (this.frozenFrameCount >= this.maxFrozenFrames) {
                        console.error(`[Fireworks] 🔄 FPS frozen for ${this.maxFrozenFrames} seconds, auto-reloading overlay to recover...`);
                        // Show visual warning before reload
                        this.showFreezeWarning();
                        // Reload after 2 seconds to allow warning to be visible
                        setTimeout(() => {
                            window.location.reload();
                        }, 2000);
                        return; // Stop processing this frame
                    }
                } else {
                    // FPS recovered, reset freeze counter
                    if (this.frozenFrameCount > 0) {
                        console.log(`[Fireworks] ✅ FPS recovered (was frozen for ${this.frozenFrameCount}s)`);
                    }
                    this.frozenFrameCount = 0;
                    this.freezeWarningShown = false;
                }
            }
            
            // Calculate average FPS over last 5 seconds
            const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
            
            // Adaptive Trail-Length based on FPS (Enhanced)
            if (avgFps > 50) {
                CONFIG.trailLength = 20; // Full quality
            } else if (avgFps > 40) {
                CONFIG.trailLength = 12; // Good performance
            } else if (avgFps > 30) {
                CONFIG.trailLength = 8; // Medium performance
            } else if (avgFps > 25) {
                CONFIG.trailLength = 5; // Low performance
            } else {
                CONFIG.trailLength = 3; // Minimal performance
            }
            
            // Adaptive performance mode
            const targetFps = this.config.targetFps || CONFIG.targetFps;
            const minFps = this.config.minFps || CONFIG.minFps;
            
            if (avgFps < minFps) {
                // Performance is suffering - enter minimal mode
                if (this.performanceMode !== 'minimal') {
                    this.performanceMode = 'minimal';
                    this.applyPerformanceMode();
                    if (DEBUG) console.log('[Fireworks] Adaptive Performance: MINIMAL mode (FPS:', avgFps.toFixed(1), ')');
                }
            } else if (avgFps < targetFps * 0.8) {
                // Performance is degraded - enter reduced mode
                if (this.performanceMode !== 'reduced') {
                    this.performanceMode = 'reduced';
                    this.applyPerformanceMode();
                    if (DEBUG) console.log('[Fireworks] Adaptive Performance: REDUCED mode (FPS:', avgFps.toFixed(1), ')');
                }
            } else if (avgFps >= targetFps * 0.95) {
                // Performance is good - return to normal mode
                if (this.performanceMode !== 'normal') {
                    this.performanceMode = 'normal';
                    this.applyPerformanceMode();
                    if (DEBUG) console.log('[Fireworks] Adaptive Performance: NORMAL mode (FPS:', avgFps.toFixed(1), ')');
                }
            }
            
            if (this.debugMode) {
                const fpsEl = document.getElementById('fps');
                const particleEl = document.getElementById('particle-count');
                const modeEl = document.getElementById('performance-mode');
                if (fpsEl) fpsEl.textContent = this.fps;
                if (particleEl) particleEl.textContent = this.getTotalParticles();
                if (modeEl) modeEl.textContent = this.performanceMode.toUpperCase();
            }

            // Emit FPS to server for benchmark tracking
            if (this.socket && this.socket.connected) {
                this.socket.emit('fireworks:fps-update', { fps: this.fps, timestamp: now });
            }
        }

        requestAnimationFrame(() => this.render());
    }
    
    applyPerformanceMode() {
        // Adjust CONFIG based on performance mode
        switch (this.performanceMode) {
            case 'minimal':
                // Extreme reduction for very low FPS
                CONFIG.maxParticlesPerExplosion = 50;
                CONFIG.trailLength = 5;
                CONFIG.sparkleChance = 0.05;
                CONFIG.secondaryExplosionChance = 0;
                this.config.glowEnabled = false;
                this.config.trailsEnabled = false;
                // Limit active fireworks with graceful despawn
                while (this.fireworks.length > 5) {
                    const fw = this.fireworks[this.fireworks.length - 1];
                    // Start despawn fade for rocket
                    if (!fw.exploded && fw.rocket) {
                        fw.rocket.startDespawn();
                    }
                    // Start despawn fade for all particles
                    fw.particles.forEach(p => p.startDespawn());
                    fw.secondaryExplosions.forEach(p => p.startDespawn());
                    // Don't remove immediately - let despawn effect complete
                    // Only remove if already despawning for enough time
                    // Using half of despawn duration ensures smooth fade without premature removal
                    const minDespawnTime = (CONFIG.despawnFadeDuration * 1000) / 2;
                    if (fw.rocket && fw.rocket.isDespawning && 
                        performance.now() - fw.rocket.despawnStartTime > minDespawnTime) {
                        this.fireworks.pop();
                    } else {
                        break; // Wait for despawn to complete
                    }
                }
                break;
                
            case 'reduced':
                // Moderate reduction for low FPS
                CONFIG.maxParticlesPerExplosion = 100;
                CONFIG.trailLength = 10;
                CONFIG.sparkleChance = 0.08;
                CONFIG.secondaryExplosionChance = 0.05;
                this.config.glowEnabled = true;
                this.config.trailsEnabled = true;
                // Limit active fireworks with graceful despawn
                while (this.fireworks.length > 15) {
                    const fw = this.fireworks[this.fireworks.length - 1];
                    // Start despawn fade for rocket
                    if (!fw.exploded && fw.rocket) {
                        fw.rocket.startDespawn();
                    }
                    // Start despawn fade for all particles
                    fw.particles.forEach(p => p.startDespawn());
                    fw.secondaryExplosions.forEach(p => p.startDespawn());
                    // Don't remove immediately - let despawn effect complete
                    // Only remove if already despawning for enough time
                    // Using half of despawn duration ensures smooth fade without premature removal
                    const minDespawnTime = (CONFIG.despawnFadeDuration * 1000) / 2;
                    if (fw.rocket && fw.rocket.isDespawning && 
                        performance.now() - fw.rocket.despawnStartTime > minDespawnTime) {
                        this.fireworks.pop();
                    } else {
                        break; // Wait for despawn to complete
                    }
                }
                break;
                
            case 'normal':
                // Full quality
                CONFIG.maxParticlesPerExplosion = 200;
                CONFIG.trailLength = 20;
                CONFIG.sparkleChance = 0.15;
                CONFIG.secondaryExplosionChance = 0.1;
                this.config.glowEnabled = true;
                this.config.trailsEnabled = true;
                break;
        }
    }
    
    showFreezeWarning() {
        // Create a visual warning overlay
        const warning = document.createElement('div');
        warning.id = 'freeze-warning';
        warning.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 30px 50px;
            border-radius: 15px;
            font-size: 24px;
            font-weight: bold;
            text-align: center;
            z-index: 10000;
            border: 3px solid white;
            box-shadow: 0 0 30px rgba(255, 0, 0, 0.8);
        `;
        warning.innerHTML = `
            <div>⚠️ OVERLAY FROZEN ⚠️</div>
            <div style="font-size: 18px; margin-top: 10px;">Auto-reloading in 2 seconds...</div>
        `;
        document.body.appendChild(warning);
    }

    renderFirework(firework) {
        const ctx = this.ctx;
        
        // Collect particles by type for batch rendering
        const circles = [];
        const images = [];
        const hearts = [];
        const paws = [];
        
        // Add rocket if not exploded
        if (!firework.exploded && firework.rocket) {
            const p = firework.rocket;
            if (this.isParticleVisible(p)) {
                if (p.type === 'image' && p.image) {
                    images.push(p);
                } else {
                    circles.push(p);
                }
            }
        }
        
        // Collect explosion particles
        for (const p of firework.particles) {
            if (!this.isParticleVisible(p)) continue;
            
            if (p.type === 'image' && p.image) {
                images.push(p);
            } else if (p.type === 'heart') {
                hearts.push(p);
            } else if (p.type === 'paw') {
                paws.push(p);
            } else {
                circles.push(p);
            }
        }
        
        // Collect secondary explosions
        for (const p of firework.secondaryExplosions) {
            if (!this.isParticleVisible(p)) continue;
            circles.push(p); // Secondary explosions are always circles
        }
        
        // Batch render circles (most common type)
        if (circles.length > 0) {
            this.batchRenderCircles(circles);
        }
        
        // Batch render images
        if (images.length > 0) {
            this.batchRenderImages(images);
        }
        
        // Batch render hearts
        if (hearts.length > 0) {
            this.batchRenderHearts(hearts);
        }
        
        // Batch render paws
        if (paws.length > 0) {
            this.batchRenderPaws(paws);
        }
    }
    
    isParticleVisible(p) {
        // Alpha culling - skip nearly invisible particles
        if (p.alpha < CONFIG.ALPHA_CULL_THRESHOLD) return false;
        
        // Viewport Culling - skip particles outside viewport with margin
        const margin = 100;
        return !(p.x < -margin || p.x > this.width + margin || p.y < -margin || p.y > this.height + margin);
    }
    
    batchRenderCircles(particles) {
        const ctx = this.ctx;
        
        // Render all trails in one batch with Path2D
        if (this.config.trailsEnabled) {
            for (const p of particles) {
                if (p.trail.length > 1) {
                    const trailPath = new Path2D();
                    trailPath.moveTo(p.trail[0].x, p.trail[0].y);
                    
                    for (let i = 1; i < p.trail.length; i++) {
                        trailPath.lineTo(p.trail[i].x, p.trail[i].y);
                    }
                    
                    const rgb = hslToRgb(p.hue, p.saturation, p.brightness);
                    ctx.save();
                    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha * 0.3})`;
                    ctx.lineWidth = p.size * 0.5;
                    ctx.lineCap = 'round';
                    ctx.stroke(trailPath);
                    ctx.restore();
                }
            }
        }
        
        // Render all glows in one batch (if enabled)
        if (this.config.glowEnabled) {
            for (const p of particles) {
                const rgb = hslToRgb(p.hue, p.saturation, p.brightness);
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.globalAlpha = p.alpha;
                
                const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2);
                gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha})`);
                gradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha * 0.5})`);
                gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(0, 0, p.size * 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
        
        // Render all core particles in one batch
        for (const p of particles) {
            const rgb = hslToRgb(p.hue, p.saturation, p.brightness);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
    
    batchRenderImages(particles) {
        const ctx = this.ctx;
        
        for (const p of particles) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = p.alpha;
            const size = p.size * 3;
            ctx.drawImage(p.image, -size/2, -size/2, size, size);
            ctx.restore();
        }
    }
    
    batchRenderHearts(particles) {
        const ctx = this.ctx;
        
        for (const p of particles) {
            const rgb = hslToRgb(p.hue, p.saturation, p.brightness);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha})`;
            ctx.font = `${p.size * 4}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('❤', 0, 0);
            ctx.restore();
        }
    }
    
    batchRenderPaws(particles) {
        const ctx = this.ctx;
        
        for (const p of particles) {
            const rgb = hslToRgb(p.hue, p.saturation, p.brightness);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha})`;
            ctx.font = `${p.size * 4}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🐾', 0, 0);
            ctx.restore();
        }
    }

    getTotalParticles() {
        let count = 0;
        for (const fw of this.fireworks) {
            count += fw.particles.length + fw.secondaryExplosions.length;
            if (!fw.exploded) count++;
        }
        return count;
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
    
    engine = new FireworksEngine('fireworks-canvas');
    await engine.init();

    // Preload sounds - fireworks plugin audio files with synchronized timing
    
    // Basic launch sounds (short)
    await engine.audioManager.preload('/plugins/fireworks/audio/abschussgeraeusch.mp3', 'launch-basic');
    await engine.audioManager.preload('/plugins/fireworks/audio/abschussgeraeusch2.mp3', 'launch-basic2');
    
    // Basic explosion and rocket sounds
    await engine.audioManager.preload('/plugins/fireworks/audio/explosion.mp3', 'explosion-basic');
    await engine.audioManager.preload('/plugins/fireworks/audio/rocket.mp3', 'rocket-basic');
    
    // NEW: Additional explosion sounds with varying intensities
    await engine.audioManager.preload('/plugins/fireworks/audio/explosion_small1.mp3', 'explosion-small');
    await engine.audioManager.preload('/plugins/fireworks/audio/explosion_medium.mp3', 'explosion-medium');
    await engine.audioManager.preload('/plugins/fireworks/audio/explosion2.mp3', 'explosion-alt1');
    await engine.audioManager.preload('/plugins/fireworks/audio/explosion3.mp3', 'explosion-alt2');
    await engine.audioManager.preload('/plugins/fireworks/audio/explosion_big.mp3', 'explosion-big');
    await engine.audioManager.preload('/plugins/fireworks/audio/explosion_huge.mp3', 'explosion-huge');
    await engine.audioManager.preload('/plugins/fireworks/audio/explosion%20Pop%2CSharp%2C.mp3', 'explosion-pop'); // URL encoded filename
    
    // NEW: Crackling sounds for atmospheric effects
    await engine.audioManager.preload('/plugins/fireworks/audio/crackling.mp3', 'crackling-long');
    await engine.audioManager.preload('/plugins/fireworks/audio/crackling2.mp3', 'crackling-medium');
    
    // Combined sounds - synchronized launch + explosion in one file
    // These play the entire sequence from launch to explosion
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_crackling_bang.mp3', 'combined-crackling-bang');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_normal-bang.mp3', 'combined-whistle-normal');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang.mp3', 'combined-whistle-tiny1');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang2.mp3', 'combined-whistle-tiny2');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang3.mp3', 'combined-whistle-tiny3');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang4.mp3', 'combined-whistle-tiny4');
    
    // Launch-only sounds (no explosion) - for when we want to play explosion separately
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_mit-pfeifen_no-bang.mp3', 'launch-whistle');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_nocrackling_no-bang.mp3', 'launch-smooth');
    await engine.audioManager.preload('/plugins/fireworks/audio/woosh_abheben_nocrackling_no-bang2.mp3', 'launch-smooth2');
    
    // Enable audio context on first user interaction
    const enableAudio = async () => {
        await engine.audioManager.ensureAudioContext();
        document.removeEventListener('click', enableAudio);
        document.removeEventListener('keydown', enableAudio);
    };
    document.addEventListener('click', enableAudio);
    document.addEventListener('keydown', enableAudio);

    // Debug mode toggle
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'd') {
            engine.toggleDebug();
        }
    });

    if (DEBUG) console.log('[Fireworks] Advanced engine ready');
});

// Only expose engine after initialization
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'FireworksEngine', {
        get: () => engine,
        configurable: false,
        enumerable: true
    });
}
