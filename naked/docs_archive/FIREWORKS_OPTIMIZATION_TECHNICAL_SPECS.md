# Fireworks Plugin - Technische Spezifikationen für Top-Optimierungen
## Detaillierte Implementierungs-Guides für maximale Performance

---

## 🎯 Top 10 Optimierungen - Detaillierte Specs

---

### 1. Object Pooling System ⭐⭐⭐⭐⭐
**Impact:** 30-40% FPS | **Aufwand:** Mittel | **Priorität:** KRITISCH

#### Problem:
```javascript
// AKTUELL: Ständige Object-Creation/Deletion
for (let i = 0; i < 100; i++) {
    const particle = new Particle({...}); // Allocation
    particles.push(particle);
}
// ... später
particles.splice(i, 1); // GC-Druck
```

#### Lösung - Object Pool Implementation:

```javascript
/**
 * High-Performance Object Pool für Particles
 * Reduziert GC-Pressure und Memory-Allocation
 */
class ParticlePool {
    constructor(initialSize = 5000, maxSize = 10000) {
        this.pool = [];
        this.active = new Set();
        this.maxSize = maxSize;
        this.stats = {
            created: 0,
            reused: 0,
            peak: 0
        };
        
        // Pre-allocate particles
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this._createParticle());
        }
    }
    
    _createParticle() {
        this.stats.created++;
        return {
            // Position & Velocity
            x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0,
            
            // Visual Properties
            size: 3, hue: 0, saturation: 100, brightness: 100,
            alpha: 1.0, color: '#ffffff',
            
            // Physics
            mass: 1, drag: CONFIG.airResistance, gravity: CONFIG.gravity,
            
            // Lifecycle
            lifespan: 1.0, maxLifespan: 1.0, decay: 0.01, age: 0,
            
            // Type
            isSeed: false, isSparkle: false, type: 'circle',
            image: null, rotation: 0, rotationSpeed: 0,
            
            // Despawn
            isDespawning: false, despawnStartTime: 0,
            
            // Secondary Explosion
            willBurst: false, burstDelay: 0, burstTime: 0, hasBurst: false,
            willSpiral: false, spiralDelay: 0, hasSpiraled: false,
            
            // Trail
            trail: [],
            
            // Pool-specific
            _inUse: false,
            _poolId: this.stats.created
        };
    }
    
    acquire(args = {}) {
        let particle;
        
        if (this.pool.length > 0) {
            particle = this.pool.pop();
            this.stats.reused++;
        } else if (this.active.size < this.maxSize) {
            particle = this._createParticle();
        } else {
            console.warn('[ParticlePool] Max size reached, reusing oldest');
            // Force-recycle oldest particle
            particle = Array.from(this.active)[0];
            this.active.delete(particle);
        }
        
        // Reset particle
        this._resetParticle(particle);
        
        // Apply new properties
        Object.assign(particle, args);
        
        // Mark as in-use
        particle._inUse = true;
        this.active.add(particle);
        
        // Track peak usage
        if (this.active.size > this.stats.peak) {
            this.stats.peak = this.active.size;
        }
        
        return particle;
    }
    
    release(particle) {
        if (!particle._inUse) return;
        
        particle._inUse = false;
        this.active.delete(particle);
        
        // Clear trail to free memory
        particle.trail.length = 0;
        
        // Return to pool
        this.pool.push(particle);
    }
    
    _resetParticle(p) {
        // Reset all properties to defaults
        p.x = p.y = p.vx = p.vy = p.ax = p.ay = 0;
        p.size = 3;
        p.hue = 0;
        p.saturation = 100;
        p.brightness = 100;
        p.alpha = 1.0;
        p.color = '#ffffff';
        p.mass = 1;
        p.drag = CONFIG.airResistance;
        p.gravity = CONFIG.gravity;
        p.lifespan = 1.0;
        p.maxLifespan = 1.0;
        p.decay = 0.01;
        p.age = 0;
        p.isSeed = false;
        p.isSparkle = false;
        p.type = 'circle';
        p.image = null;
        p.rotation = 0;
        p.rotationSpeed = 0;
        p.isDespawning = false;
        p.despawnStartTime = 0;
        p.willBurst = false;
        p.burstDelay = 0;
        p.burstTime = 0;
        p.hasBurst = false;
        p.willSpiral = false;
        p.spiralDelay = 0;
        p.hasSpiraled = false;
        p.trail.length = 0;
    }
    
    getStats() {
        return {
            poolSize: this.pool.length,
            activeCount: this.active.size,
            created: this.stats.created,
            reused: this.stats.reused,
            reuseRate: (this.stats.reused / (this.stats.created + this.stats.reused) * 100).toFixed(1) + '%',
            peak: this.stats.peak
        };
    }
}

/**
 * Usage in FireworksEngine:
 */
class FireworksEngine {
    constructor(canvasId) {
        // ...existing code...
        this.particlePool = new ParticlePool(5000, 10000);
        this.fireworkPool = new ParticlePool(200, 500); // Smaller pool for fireworks
    }
    
    // In Firework.explode():
    explode() {
        // OLD: const particle = new Particle({...});
        // NEW:
        const particle = engine.particlePool.acquire({
            x: explosionX,
            y: explosionY,
            vx: vel.vx,
            vy: vel.vy,
            // ... other properties
        });
        this.particles.push(particle);
    }
    
    // In render loop:
    update() {
        for (let i = this.fireworks.length - 1; i >= 0; i--) {
            const fw = this.fireworks[i];
            
            // Update particles
            for (let j = fw.particles.length - 1; j >= 0; j--) {
                const p = fw.particles[j];
                p.update();
                
                if (p.isDone()) {
                    // Release to pool instead of splice
                    this.particlePool.release(p);
                    fw.particles.splice(j, 1);
                }
            }
            
            if (fw.isDone()) {
                // Release all remaining particles
                fw.particles.forEach(p => this.particlePool.release(p));
                fw.secondaryExplosions.forEach(p => this.particlePool.release(p));
                if (fw.rocket) this.particlePool.release(fw.rocket);
                
                this.fireworks.splice(i, 1);
            }
        }
    }
}
```

#### Erwartete Verbesserung:
- **Memory Allocations:** -90%
- **GC Pauses:** -80%
- **FPS:** +30-40%
- **Reuse Rate:** >95% nach Warmup

---

### 2. Batch-Rendering System ⭐⭐⭐⭐
**Impact:** 25-35% FPS | **Aufwand:** Mittel | **Priorität:** KRITISCH

#### Problem:
```javascript
// AKTUELL: Ein Draw-Call pro Partikel
for (const particle of particles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.beginPath();
    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
// = 1000 Partikel = 1000 Draw-Calls!
```

#### Lösung - Batch-Rendering:

```javascript
/**
 * Batch-Renderer für Canvas 2D
 * Gruppiert Partikel nach Typ und rendert in einem Durchgang
 */
class BatchRenderer {
    constructor(ctx) {
        this.ctx = ctx;
        this.batches = {
            circles: [],      // Standard colored circles
            images: [],       // Gift/Avatar images
            hearts: [],       // Heart emoji particles
            paws: [],         // Paw emoji particles
            glows: []         // Glow effects
        };
    }
    
    clear() {
        this.batches.circles.length = 0;
        this.batches.images.length = 0;
        this.batches.hearts.length = 0;
        this.batches.paws.length = 0;
        this.batches.glows.length = 0;
    }
    
    addParticle(particle, enableGlow = true) {
        // Classify particle type
        switch (particle.type) {
            case 'image':
                this.batches.images.push(particle);
                break;
            case 'heart':
                this.batches.hearts.push(particle);
                break;
            case 'paw':
                this.batches.paws.push(particle);
                break;
            default:
                this.batches.circles.push(particle);
                if (enableGlow && particle.alpha > 0.1) {
                    this.batches.glows.push(particle);
                }
        }
    }
    
    render() {
        // 1. Render glows first (under everything)
        this._renderGlows();
        
        // 2. Render circles (most common)
        this._renderCircles();
        
        // 3. Render images
        this._renderImages();
        
        // 4. Render hearts
        this._renderHearts();
        
        // 5. Render paws
        this._renderPaws();
    }
    
    _renderGlows() {
        const ctx = this.ctx;
        const glows = this.batches.glows;
        
        if (glows.length === 0) return;
        
        // Group by approximate color for better batching
        const colorGroups = new Map();
        
        for (const p of glows) {
            // Round hue to nearest 30 degrees for grouping
            const hueKey = Math.round(p.hue / 30) * 30;
            if (!colorGroups.has(hueKey)) {
                colorGroups.set(hueKey, []);
            }
            colorGroups.get(hueKey).push(p);
        }
        
        // Render each color group
        for (const [hue, particles] of colorGroups) {
            const rgb = hslToRgb(hue, 100, 60);
            
            for (const p of particles) {
                const gradient = ctx.createRadialGradient(
                    p.x, p.y, 0, 
                    p.x, p.y, p.size * 2
                );
                gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha})`);
                gradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha * 0.5})`);
                gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
                
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    _renderCircles() {
        const ctx = this.ctx;
        const circles = this.batches.circles;
        
        if (circles.length === 0) return;
        
        // Group by similar color for better batching
        const colorGroups = new Map();
        
        for (const p of circles) {
            const hueKey = Math.round(p.hue / 30) * 30;
            const satKey = Math.round(p.saturation / 25) * 25;
            const brightKey = Math.round(p.brightness / 25) * 25;
            const key = `${hueKey}-${satKey}-${brightKey}`;
            
            if (!colorGroups.has(key)) {
                colorGroups.set(key, []);
            }
            colorGroups.get(key).push(p);
        }
        
        // Render each color group in one path
        for (const [key, particles] of colorGroups) {
            if (particles.length === 0) continue;
            
            const p0 = particles[0];
            const rgb = hslToRgb(p0.hue, p0.saturation, p0.brightness);
            
            // Create path for all particles in this color
            ctx.beginPath();
            for (const p of particles) {
                if (p.alpha < 0.01) continue;
                ctx.moveTo(p.x + p.size, p.y);
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            }
            
            // Fill all at once
            ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
            ctx.globalAlpha = particles.reduce((sum, p) => sum + p.alpha, 0) / particles.length;
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
    
    _renderImages() {
        const ctx = this.ctx;
        const images = this.batches.images;
        
        if (images.length === 0) return;
        
        // Group by image URL
        const imageGroups = new Map();
        
        for (const p of images) {
            if (!p.image) continue;
            
            const key = p.image.src || p.image;
            if (!imageGroups.has(key)) {
                imageGroups.set(key, []);
            }
            imageGroups.get(key).push(p);
        }
        
        // Render each image group
        for (const [_, particles] of imageGroups) {
            for (const p of particles) {
                if (p.alpha < 0.01) continue;
                
                ctx.save();
                ctx.globalAlpha = p.alpha;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                
                const size = p.size * 3;
                ctx.drawImage(p.image, -size/2, -size/2, size, size);
                
                ctx.restore();
            }
        }
        
        ctx.globalAlpha = 1.0;
    }
    
    _renderHearts() {
        this._renderEmoji(this.batches.hearts, '❤');
    }
    
    _renderPaws() {
        this._renderEmoji(this.batches.paws, '🐾');
    }
    
    _renderEmoji(particles, emoji) {
        if (particles.length === 0) return;
        
        const ctx = this.ctx;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Group by size for better font caching
        const sizeGroups = new Map();
        for (const p of particles) {
            const sizeKey = Math.round(p.size);
            if (!sizeGroups.has(sizeKey)) {
                sizeGroups.set(sizeKey, []);
            }
            sizeGroups.get(sizeKey).push(p);
        }
        
        for (const [size, group] of sizeGroups) {
            ctx.font = `${size * 4}px Arial`;
            
            for (const p of group) {
                if (p.alpha < 0.01) continue;
                
                const rgb = hslToRgb(p.hue, p.saturation, p.brightness);
                ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha})`;
                
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillText(emoji, 0, 0);
                ctx.restore();
            }
        }
    }
}

/**
 * Usage in FireworksEngine:
 */
class FireworksEngine {
    constructor(canvasId) {
        // ...existing code...
        this.batchRenderer = new BatchRenderer(this.ctx);
    }
    
    render() {
        // ... clear canvas ...
        
        // Collect particles for batching
        this.batchRenderer.clear();
        
        for (const fw of this.fireworks) {
            if (!fw.exploded && fw.rocket) {
                this.batchRenderer.addParticle(fw.rocket, false); // No glow for rockets
            }
            
            for (const p of fw.particles) {
                this.batchRenderer.addParticle(p, this.config.glowEnabled);
            }
            
            for (const p of fw.secondaryExplosions) {
                this.batchRenderer.addParticle(p, this.config.glowEnabled);
            }
        }
        
        // Render all batches
        this.batchRenderer.render();
        
        // ... continue with trails if needed ...
    }
}
```

#### Erwartete Verbesserung:
- **Draw-Calls:** -90% (1000→100)
- **State Changes:** -95%
- **FPS:** +25-35%
- **CPU:** -40%

---

### 3. Trail-Rendering mit Path2D ⭐⭐⭐⭐
**Impact:** 20-30% FPS | **Aufwand:** Niedrig | **Priorität:** HOCH

#### Problem:
```javascript
// AKTUELL: Jeder Trail-Punkt einzeln
for (let i = 1; i < p.trail.length; i++) {
    ctx.lineTo(p.trail[i].x, p.trail[i].y);
}
ctx.stroke(); // Langsam bei vielen Trails
```

#### Lösung:

```javascript
/**
 * Optimized Trail Renderer mit Path2D
 */
class TrailRenderer {
    constructor(ctx) {
        this.ctx = ctx;
        this.trailPath = new Path2D();
    }
    
    render(particles, trailsEnabled) {
        if (!trailsEnabled) return;
        
        const ctx = this.ctx;
        
        // Group trails by color
        const colorGroups = new Map();
        
        for (const p of particles) {
            if (p.trail.length < 2) continue;
            
            const hueKey = Math.round(p.hue / 60) * 60;
            if (!colorGroups.has(hueKey)) {
                colorGroups.set(hueKey, []);
            }
            colorGroups.get(hueKey).push(p);
        }
        
        // Render each color group
        for (const [hue, group] of colorGroups) {
            const trailPath = new Path2D();
            
            for (const p of group) {
                const trail = p.trail;
                if (trail.length < 2) continue;
                
                trailPath.moveTo(trail[0].x, trail[0].y);
                for (let i = 1; i < trail.length; i++) {
                    trailPath.lineTo(trail[i].x, trail[i].y);
                }
            }
            
            const rgb = hslToRgb(hue, 80, 60);
            ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.stroke(trailPath);
        }
    }
}
```

#### Erwartete Verbesserung:
- **Trail-Rendering:** +200-300%
- **FPS:** +20-30%
- **State Changes:** -80%

---

### 4. TypedArrays für Partikel-Daten ⭐⭐⭐⭐
**Impact:** 15-25% FPS | **Aufwand:** Mittel | **Priorität:** HOCH

#### Konzept - Structure of Arrays (SoA):

```javascript
/**
 * SoA Particle System mit TypedArrays
 * Bessere Cache-Lokalität und SIMD-fähig
 */
class ParticleSystemSoA {
    constructor(maxParticles = 10000) {
        this.maxParticles = maxParticles;
        this.count = 0;
        
        // Position & Velocity (Float32)
        this.x = new Float32Array(maxParticles);
        this.y = new Float32Array(maxParticles);
        this.vx = new Float32Array(maxParticles);
        this.vy = new Float32Array(maxParticles);
        this.ax = new Float32Array(maxParticles);
        this.ay = new Float32Array(maxParticles);
        
        // Visual (Float32 for colors, Uint8 for discrete values)
        this.size = new Float32Array(maxParticles);
        this.hue = new Uint16Array(maxParticles);      // 0-360
        this.saturation = new Uint8Array(maxParticles); // 0-100
        this.brightness = new Uint8Array(maxParticles); // 0-100
        this.alpha = new Float32Array(maxParticles);    // 0-1
        
        // Physics
        this.mass = new Float32Array(maxParticles);
        this.drag = new Float32Array(maxParticles);
        this.gravity = new Float32Array(maxParticles);
        
        // Lifecycle
        this.lifespan = new Float32Array(maxParticles);
        this.maxLifespan = new Float32Array(maxParticles);
        this.decay = new Float32Array(maxParticles);
        this.age = new Uint16Array(maxParticles);
        
        // Rotation
        this.rotation = new Float32Array(maxParticles);
        this.rotationSpeed = new Float32Array(maxParticles);
        
        // Type & Flags (Uint8 for booleans/enums)
        this.type = new Uint8Array(maxParticles);      // 0=circle, 1=image, 2=heart, 3=paw
        this.flags = new Uint8Array(maxParticles);     // Bitfield for isSeed, isSparkle, etc.
        
        // Image reference (separate array for objects)
        this.images = new Array(maxParticles);
        
        // Free indices pool
        this.freeIndices = [];
        for (let i = maxParticles - 1; i >= 0; i--) {
            this.freeIndices.push(i);
        }
    }
    
    spawn(args) {
        if (this.freeIndices.length === 0) {
            console.warn('[ParticleSystemSoA] No free particles');
            return -1;
        }
        
        const idx = this.freeIndices.pop();
        
        // Initialize particle
        this.x[idx] = args.x || 0;
        this.y[idx] = args.y || 0;
        this.vx[idx] = args.vx || 0;
        this.vy[idx] = args.vy || 0;
        this.ax[idx] = args.ax || 0;
        this.ay[idx] = args.ay || 0;
        
        this.size[idx] = args.size || 3;
        this.hue[idx] = args.hue || 0;
        this.saturation[idx] = args.saturation || 100;
        this.brightness[idx] = args.brightness || 100;
        this.alpha[idx] = args.alpha || 1.0;
        
        this.mass[idx] = args.mass || 1;
        this.drag[idx] = args.drag || CONFIG.airResistance;
        this.gravity[idx] = args.gravity || CONFIG.gravity;
        
        this.lifespan[idx] = args.lifespan || 1.0;
        this.maxLifespan[idx] = args.lifespan || 1.0;
        this.decay[idx] = args.decay || 0.01;
        this.age[idx] = 0;
        
        this.rotation[idx] = args.rotation || 0;
        this.rotationSpeed[idx] = args.rotationSpeed || 0;
        
        // Type: 0=circle, 1=image, 2=heart, 3=paw
        const typeMap = { circle: 0, image: 1, heart: 2, paw: 3 };
        this.type[idx] = typeMap[args.type] || 0;
        
        // Flags bitfield
        let flags = 0;
        if (args.isSeed) flags |= 0x01;
        if (args.isSparkle) flags |= 0x02;
        this.flags[idx] = flags;
        
        this.images[idx] = args.image || null;
        
        this.count++;
        return idx;
    }
    
    despawn(idx) {
        this.images[idx] = null; // Free reference
        this.freeIndices.push(idx);
        this.count--;
    }
    
    /**
     * SIMD-friendly update loop
     * Process multiple particles per iteration for better vectorization
     */
    update() {
        // Process 4 particles at once (SIMD width)
        const batchSize = 4;
        const totalParticles = this.maxParticles;
        
        for (let i = 0; i < totalParticles; i += batchSize) {
            // Check if particles are alive (batch check)
            const alive = new Array(batchSize);
            for (let j = 0; j < batchSize && (i + j) < totalParticles; j++) {
                alive[j] = !this.freeIndices.includes(i + j);
            }
            
            // Update physics (vectorizable)
            for (let j = 0; j < batchSize && (i + j) < totalParticles; j++) {
                if (!alive[j]) continue;
                
                const idx = i + j;
                
                // Apply drag
                this.vx[idx] *= this.drag[idx];
                this.vy[idx] *= this.drag[idx];
                
                // Update velocity
                this.vx[idx] += this.ax[idx];
                this.vy[idx] += this.ay[idx] + this.gravity[idx];
                
                // Update position
                this.x[idx] += this.vx[idx];
                this.y[idx] += this.vy[idx];
                
                // Clear acceleration
                this.ax[idx] = 0;
                this.ay[idx] = 0;
                
                // Update rotation
                this.rotation[idx] += this.rotationSpeed[idx];
                
                // Update lifespan
                if (!(this.flags[idx] & 0x01)) { // Not a seed
                    this.lifespan[idx] -= this.decay[idx];
                    this.alpha[idx] = Math.max(0, this.lifespan[idx] / this.maxLifespan[idx]);
                }
                
                this.age[idx]++;
            }
        }
    }
    
    /**
     * Check if particle is done
     */
    isDone(idx) {
        return this.lifespan[idx] <= 0 || this.y[idx] > window.innerHeight + 100;
    }
    
    /**
     * Get active particle indices for rendering
     */
    getActiveIndices() {
        const active = [];
        for (let i = 0; i < this.maxParticles; i++) {
            if (!this.freeIndices.includes(i)) {
                active.push(i);
            }
        }
        return active;
    }
}
```

#### Erwartete Verbesserung:
- **Memory:** -50% (kompaktere Daten)
- **Cache-Misses:** -70%
- **FPS:** +15-25%
- **SIMD-Beschleunigung:** +10-20% (moderne Browser)

---

### 5. Adaptive Quality System ⭐⭐⭐⭐
**Impact:** 20-40% auf Low-End | **Aufwand:** Mittel | **Priorität:** HOCH

#### Implementation:

```javascript
/**
 * Hardware-aware Adaptive Quality System
 */
class AdaptiveQualityManager {
    constructor(engine) {
        this.engine = engine;
        this.currentQuality = 'high';
        this.hardwareProfile = this.detectHardware();
        this.performanceHistory = [];
        this.adjustmentCooldown = 0;
    }
    
    detectHardware() {
        const profile = {
            cpuCores: navigator.hardwareConcurrency || 4,
            memory: navigator.deviceMemory || 4, // GB
            gpuTier: 'unknown',
            isMobile: /mobile/i.test(navigator.userAgent),
            pixelRatio: window.devicePixelRatio || 1
        };
        
        // Detect GPU tier (rough estimation)
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                    profile.gpuRenderer = renderer;
                    
                    // Simple tier detection
                    if (/intel/i.test(renderer) && /hd/i.test(renderer)) {
                        profile.gpuTier = 'low';
                    } else if (/nvidia|amd|radeon/i.test(renderer)) {
                        profile.gpuTier = 'high';
                    } else {
                        profile.gpuTier = 'medium';
                    }
                }
            }
        } catch (e) {
            console.warn('[AdaptiveQuality] GPU detection failed');
        }
        
        return profile;
    }
    
    getInitialQuality() {
        const hw = this.hardwareProfile;
        
        // Mobile devices
        if (hw.isMobile) {
            if (hw.cpuCores >= 8 && hw.memory >= 6) return 'medium';
            return 'low';
        }
        
        // Desktop
        if (hw.cpuCores >= 8 && hw.memory >= 8 && hw.gpuTier === 'high') {
            return 'ultra';
        } else if (hw.cpuCores >= 4 && hw.memory >= 4) {
            return 'high';
        } else if (hw.cpuCores >= 2) {
            return 'medium';
        } else {
            return 'low';
        }
    }
    
    getQualityPreset(quality) {
        const presets = {
            ultra: {
                maxParticles: 10000,
                maxParticlesPerExplosion: 300,
                trailLength: 25,
                trailsEnabled: true,
                glowEnabled: true,
                resolution: 1.0,
                targetFps: 60,
                sparkleChance: 0.2,
                secondaryExplosionChance: 0.15,
                shadows: true,
                antialiasing: true
            },
            high: {
                maxParticles: 5000,
                maxParticlesPerExplosion: 200,
                trailLength: 20,
                trailsEnabled: true,
                glowEnabled: true,
                resolution: 1.0,
                targetFps: 60,
                sparkleChance: 0.15,
                secondaryExplosionChance: 0.1,
                shadows: false,
                antialiasing: true
            },
            medium: {
                maxParticles: 2000,
                maxParticlesPerExplosion: 100,
                trailLength: 12,
                trailsEnabled: true,
                glowEnabled: true,
                resolution: 0.75,
                targetFps: 45,
                sparkleChance: 0.1,
                secondaryExplosionChance: 0.05,
                shadows: false,
                antialiasing: false
            },
            low: {
                maxParticles: 800,
                maxParticlesPerExplosion: 50,
                trailLength: 6,
                trailsEnabled: true,
                glowEnabled: false,
                resolution: 0.5,
                targetFps: 30,
                sparkleChance: 0.05,
                secondaryExplosionChance: 0,
                shadows: false,
                antialiasing: false
            },
            potato: {
                maxParticles: 300,
                maxParticlesPerExplosion: 25,
                trailLength: 3,
                trailsEnabled: false,
                glowEnabled: false,
                resolution: 0.5,
                targetFps: 24,
                sparkleChance: 0,
                secondaryExplosionChance: 0,
                shadows: false,
                antialiasing: false
            }
        };
        
        return presets[quality] || presets.medium;
    }
    
    update(fps) {
        this.performanceHistory.push(fps);
        if (this.performanceHistory.length > 60) {
            this.performanceHistory.shift();
        }
        
        // Don't adjust too frequently
        if (this.adjustmentCooldown > 0) {
            this.adjustmentCooldown--;
            return;
        }
        
        // Check if adjustment needed
        const avgFps = this.performanceHistory.reduce((a, b) => a + b, 0) / this.performanceHistory.length;
        const preset = this.getQualityPreset(this.currentQuality);
        
        if (avgFps < preset.targetFps * 0.7) {
            // Performance too low, downgrade
            this.downgradeQuality();
            this.adjustmentCooldown = 300; // 5 seconds at 60fps
        } else if (avgFps > preset.targetFps * 1.2 && this.currentQuality !== 'ultra') {
            // Performance headroom, upgrade
            this.upgradeQuality();
            this.adjustmentCooldown = 300;
        }
    }
    
    downgradeQuality() {
        const levels = ['ultra', 'high', 'medium', 'low', 'potato'];
        const currentIndex = levels.indexOf(this.currentQuality);
        if (currentIndex < levels.length - 1) {
            this.currentQuality = levels[currentIndex + 1];
            this.applyQuality();
            console.log('[AdaptiveQuality] Downgraded to:', this.currentQuality);
        }
    }
    
    upgradeQuality() {
        const levels = ['potato', 'low', 'medium', 'high', 'ultra'];
        const currentIndex = levels.indexOf(this.currentQuality);
        if (currentIndex < levels.length - 1) {
            this.currentQuality = levels[currentIndex + 1];
            this.applyQuality();
            console.log('[AdaptiveQuality] Upgraded to:', this.currentQuality);
        }
    }
    
    applyQuality() {
        const preset = this.getQualityPreset(this.currentQuality);
        Object.assign(CONFIG, preset);
        Object.assign(this.engine.config, preset);
        
        // Resize canvas if needed
        if (this.engine.canvas) {
            const scale = preset.resolution;
            this.engine.canvas.width = window.innerWidth * scale;
            this.engine.canvas.height = window.innerHeight * scale;
        }
    }
}
```

---

## 📊 Benchmark-Template

```javascript
/**
 * Performance Benchmark Suite
 */
class FireworksBenchmark {
    constructor(engine) {
        this.engine = engine;
        this.results = {
            fps: [],
            particleCount: [],
            renderTime: [],
            updateTime: []
        };
    }
    
    async run() {
        console.log('[Benchmark] Starting...');
        
        // Warmup
        await this.warmup();
        
        // Test scenarios
        await this.testLowLoad();
        await this.testMediumLoad();
        await this.testHighLoad();
        await this.testExtreme Load();
        
        // Report
        this.report();
    }
    
    async warmup() {
        console.log('[Benchmark] Warmup...');
        for (let i = 0; i < 60; i++) {
            await this.waitFrame();
        }
    }
    
    async testLowLoad() {
        console.log('[Benchmark] Testing Low Load (100 particles)...');
        this.engine.trigger({ particleCount: 100 });
        await this.measure(120);
    }
    
    async testMediumLoad() {
        console.log('[Benchmark] Testing Medium Load (500 particles)...');
        this.engine.trigger({ particleCount: 500 });
        await this.measure(120);
    }
    
    async testHighLoad() {
        console.log('[Benchmark] Testing High Load (2000 particles)...');
        this.engine.trigger({ particleCount: 2000 });
        await this.measure(120);
    }
    
    async testExtremeLoad() {
        console.log('[Benchmark] Testing Extreme Load (5000 particles)...');
        this.engine.trigger({ particleCount: 5000 });
        await this.measure(120);
    }
    
    async measure(frames) {
        for (let i = 0; i < frames; i++) {
            const start = performance.now();
            await this.waitFrame();
            const end = performance.now();
            
            this.results.fps.push(1000 / (end - start));
            this.results.particleCount.push(this.engine.getTotalParticles());
            this.results.renderTime.push(end - start);
        }
    }
    
    waitFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    report() {
        const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
        const min = arr => Math.min(...arr);
        const max = arr => Math.max(...arr);
        
        console.log('[Benchmark] Results:');
        console.log('  FPS: avg =', avg(this.results.fps).toFixed(1),
                    'min =', min(this.results.fps).toFixed(1),
                    'max =', max(this.results.fps).toFixed(1));
        console.log('  Particles: avg =', avg(this.results.particleCount).toFixed(0),
                    'max =', max(this.results.particleCount));
        console.log('  Frame Time: avg =', avg(this.results.renderTime).toFixed(2), 'ms');
    }
}
```

---

## 🎯 Zusammenfassung

Diese technischen Spezifikationen zeigen die wichtigsten Optimierungen im Detail. Die Implementierung sollte schrittweise erfolgen:

1. **Object Pooling** zuerst (größter Impact)
2. **Batch-Rendering** zweitens
3. **TypedArrays** drittens
4. **Adaptive Quality** viertens
5. **Trail-Optimierung** fünftens

Jede Optimierung ist unabhängig testbar und kann einzeln aktiviert/deaktiviert werden.

**Erwartete Gesamt-Verbesserung bei Top 5:** +150-250% FPS
