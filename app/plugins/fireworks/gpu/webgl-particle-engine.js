/**
 * WebGL2 Particle Engine - High-Performance Instanced Rendering with Texture Atlas
 * 
 * Renders all particles in a single draw call using WebGL2 instanced rendering.
 * Features a texture atlas for heart, paw, and dynamic gift/avatar images.
 * Circle particles are rendered procedurally in the shader (no texture needed).
 * 
 * Features:
 * - Instanced rendering: 1 draw call for all particles
 * - Per-particle attributes: position, size, alpha, HSB color, rotation, textureIndex
 * - Texture atlas: heart, paw, and dynamic gift/avatar images
 * - HSB to RGB conversion in fragment shader
 * - Soft-edge circular particles with glow effect (procedural)
 * - Additive blending for realistic light effects
 * - Direct SOA integration for zero-copy data transfer
 */

class WebGLParticleEngine {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.gl = null;
        this.program = null;
        this.buffers = {};
        this.locations = {};
        this.particleData = null;
        this.particleCount = 0;
        this.maxParticles = 10000;
        if (Number.isFinite(options.maxParticles) && options.maxParticles > 0) {
            this.maxParticles = options.maxParticles;
        }
        this.initialized = false;
        this.preserveDrawingBuffer = options.preserveDrawingBuffer !== undefined ? options.preserveDrawingBuffer : true;
        this.desynchronized = options.desynchronized !== undefined ? options.desynchronized : true;
        this.alphaPreservingBlend = options.alphaPreservingBlend !== undefined ? options.alphaPreservingBlend : true;
        this.activeUploadView = null;
        this.lastUploadFloatCount = 0;
        this.pendingAtlasUploads = [];
        this.pendingAtlasKeys = new Set();
        this.maxAtlasUploadsPerFrame = options.maxAtlasUploadsPerFrame || 1;

        // ── Texture Atlas ──────────────────────────────────────────────
        this.atlasSize = 1024;
        this.slotSize = 128;
        this.slotsPerRow = this.atlasSize / this.slotSize; // 8
        this.maxSlots = this.slotsPerRow * this.slotsPerRow; // 64
        this.atlasTexture = null;
        this.freeSlots = [];
        this.slotUsage = new Map(); // key (image src string) → slotIndex
        this.SLOT_HEART = 0;
        this.SLOT_PAW = 1;
        // 9 floats per particle: x, y, size, alpha, hue, sat, bright, rotation, textureIndex
        this.FLOATS_PER_PARTICLE = 9;
        this.STRIDE_BYTES = this.FLOATS_PER_PARTICLE * 4;
    }

    /**
     * Initialize WebGL2 context, shaders, and texture atlas
     * @returns {boolean} True if initialization succeeded
     */
    init() {
        try {
            // Request WebGL2 context with optimal settings for OBS capture
            const contextOptions = {
                antialias: false,
                alpha: true,
                premultipliedAlpha: false,
                preserveDrawingBuffer: this.preserveDrawingBuffer,
                desynchronized: true,
                powerPreference: 'high-performance'
            };
            contextOptions.desynchronized = this.desynchronized;
            this.gl = this.canvas.getContext('webgl2', contextOptions);

            if (!this.gl) {
                console.warn('[WebGL] WebGL2 not available, falling back to Canvas 2D');
                return false;
            }

            const gl = this.gl;

            // ── Vertex Shader ──────────────────────────────────────────
            const vertexShaderSource = `#version 300 es
                precision highp float;

                // Quad vertex positions (shared by all instances)
                in vec2 a_position;

                // Per-instance attributes (9 floats per particle)
                in vec2 a_particlePos;    // x, y
                in float a_size;          // size
                in float a_alpha;         // alpha
                in vec3 a_hsb;            // hue (0-360), saturation (0-100), brightness (0-100)
                in float a_rotation;      // rotation angle
                in float a_textureIndex;  // 0=circle(procedural), 1=heart, 2=paw, 3+=atlas

                // Output to fragment shader
                out vec2 v_uv;
                out vec4 v_color;
                out float v_alpha;
                out float v_textureIndex;
                out vec2 v_texCoord;

                uniform vec2 u_resolution;
                uniform float u_slotsPerRow;
                uniform float u_slotSize; // 1.0 / u_slotsPerRow

                // HSB to RGB conversion
                vec3 hsb2rgb(float h, float s, float b) {
                    h = h / 360.0;
                    s = s / 100.0;
                    b = b / 100.0;
                    vec3 rgb = clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0, 0.0, 1.0);
                    rgb = rgb*rgb*(3.0-2.0*rgb);
                    return b * mix(vec3(1.0), rgb, s);
                }

                void main() {
                    // Convert HSB to RGB
                    vec3 rgb = hsb2rgb(a_hsb.x, a_hsb.y, a_hsb.z);
                    v_color = vec4(rgb, 1.0);
                    v_alpha = a_alpha;
                    v_textureIndex = a_textureIndex;

                    // Calculate texture coordinates for atlas lookup
                    if (a_textureIndex > 0.5) {
                        float slotIdx = a_textureIndex - 1.0;
                        float slotX = mod(slotIdx, u_slotsPerRow);
                        float slotY = floor(slotIdx / u_slotsPerRow);
                        // Transform quad UV from [-1,1] to [0,1] and offset into atlas slot
                        v_texCoord = (a_position * 0.5 + 0.5) * u_slotSize + vec2(slotX * u_slotSize, slotY * u_slotSize);
                    } else {
                        v_texCoord = vec2(0.0);
                    }

                    // Apply rotation
                    float c = cos(a_rotation);
                    float s = sin(a_rotation);
                    mat2 rotation = mat2(c, -s, s, c);

                    // Scale quad by particle size and rotate
                    vec2 scaledPos = rotation * (a_position * a_size);

                    // Translate to particle position
                    vec2 worldPos = a_particlePos + scaledPos;

                    // Convert to clip space (-1 to 1)
                    vec2 clipSpace = (worldPos / u_resolution) * 2.0 - 1.0;
                    clipSpace.y *= -1.0;

                    gl_Position = vec4(clipSpace, 0.0, 1.0);

                    // Pass UV coordinates for circular masking
                    v_uv = a_position;
                }
            `;

            // ── Fragment Shader ────────────────────────────────────────
            const fragmentShaderSource = `#version 300 es
                precision highp float;

                in vec2 v_uv;
                in vec4 v_color;
                in float v_alpha;
                in float v_textureIndex;
                in vec2 v_texCoord;

                uniform sampler2D u_atlas;

                out vec4 outColor;

                void main() {
                    float finalAlpha = v_alpha;

                    if (v_textureIndex > 0.5) {
                        // ── Texture-sampled particle (heart, paw, image) ──
                        vec4 texColor = texture(u_atlas, v_texCoord);
                        finalAlpha *= texColor.a;
                        // Modulate texture RGB with particle color for tinting
                        vec3 tinted = texColor.rgb * v_color.rgb;
                        // Boost brightness for glow effect
                        outColor = vec4(tinted, finalAlpha);
                    } else {
                        // ── Procedural circle particle ──
                        float dist = length(v_uv);

                        // Create soft-edge circle with glow
                        float alpha = 0.0;

                        if (dist < 0.3) {
                            // Bright core
                            alpha = 1.0;
                        } else if (dist < 0.7) {
                            // Soft edge transition
                            alpha = smoothstep(0.7, 0.3, dist);
                        } else if (dist < 1.0) {
                            // Outer glow
                            alpha = smoothstep(1.0, 0.7, dist) * 0.5;
                        } else {
                            discard;
                        }

                        finalAlpha *= alpha;

                        // Brighter core for better visibility
                        vec3 finalColor = v_color.rgb * (1.0 + (1.0 - dist) * 0.5);
                        outColor = vec4(finalColor, finalAlpha);
                    }
                }
            `;

            // Compile shaders
            const vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
            const fragmentShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

            if (!vertexShader || !fragmentShader) {
                console.error('[WebGL] Shader compilation failed');
                return false;
            }

            // Link program
            this.program = gl.createProgram();
            gl.attachShader(this.program, vertexShader);
            gl.attachShader(this.program, fragmentShader);
            gl.linkProgram(this.program);

            if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
                console.error('[WebGL] Program linking failed:', gl.getProgramInfoLog(this.program));
                return false;
            }

            // Get attribute and uniform locations
            this.locations = {
                a_position: gl.getAttribLocation(this.program, 'a_position'),
                a_particlePos: gl.getAttribLocation(this.program, 'a_particlePos'),
                a_size: gl.getAttribLocation(this.program, 'a_size'),
                a_alpha: gl.getAttribLocation(this.program, 'a_alpha'),
                a_hsb: gl.getAttribLocation(this.program, 'a_hsb'),
                a_rotation: gl.getAttribLocation(this.program, 'a_rotation'),
                a_textureIndex: gl.getAttribLocation(this.program, 'a_textureIndex'),
                u_resolution: gl.getUniformLocation(this.program, 'u_resolution'),
                u_atlas: gl.getUniformLocation(this.program, 'u_atlas'),
                u_slotsPerRow: gl.getUniformLocation(this.program, 'u_slotsPerRow'),
                u_slotSize: gl.getUniformLocation(this.program, 'u_slotSize')
            };

            // Create quad geometry (2 triangles = 1 quad)
            const quadVertices = new Float32Array([
                -1, -1,
                 1, -1,
                -1,  1,
                -1,  1,
                 1, -1,
                 1,  1
            ]);

            this.buffers.quad = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quad);
            gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

            // Create particle data buffer (per-instance attributes)
            // 9 floats per particle: x, y, size, alpha, hue, saturation, brightness, rotation, textureIndex
            this.particleData = new Float32Array(this.maxParticles * this.FLOATS_PER_PARTICLE);
            this.buffers.particles = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.particles);
            gl.bufferData(gl.ARRAY_BUFFER, this.particleData, gl.DYNAMIC_DRAW);

            // Setup vertex array object (VAO)
            this.vao = gl.createVertexArray();
            gl.bindVertexArray(this.vao);

            // Setup quad vertex attribute (shared by all instances)
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quad);
            gl.enableVertexAttribArray(this.locations.a_position);
            gl.vertexAttribPointer(this.locations.a_position, 2, gl.FLOAT, false, 0, 0);

            // Setup per-instance attributes
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.particles);

            const stride = this.STRIDE_BYTES;

            // Position (x, y)
            gl.enableVertexAttribArray(this.locations.a_particlePos);
            gl.vertexAttribPointer(this.locations.a_particlePos, 2, gl.FLOAT, false, stride, 0);
            gl.vertexAttribDivisor(this.locations.a_particlePos, 1);

            // Size
            gl.enableVertexAttribArray(this.locations.a_size);
            gl.vertexAttribPointer(this.locations.a_size, 1, gl.FLOAT, false, stride, 8);
            gl.vertexAttribDivisor(this.locations.a_size, 1);

            // Alpha
            gl.enableVertexAttribArray(this.locations.a_alpha);
            gl.vertexAttribPointer(this.locations.a_alpha, 1, gl.FLOAT, false, stride, 12);
            gl.vertexAttribDivisor(this.locations.a_alpha, 1);

            // HSB color (hue, saturation, brightness)
            gl.enableVertexAttribArray(this.locations.a_hsb);
            gl.vertexAttribPointer(this.locations.a_hsb, 3, gl.FLOAT, false, stride, 16);
            gl.vertexAttribDivisor(this.locations.a_hsb, 1);

            // Rotation
            gl.enableVertexAttribArray(this.locations.a_rotation);
            gl.vertexAttribPointer(this.locations.a_rotation, 1, gl.FLOAT, false, stride, 28);
            gl.vertexAttribDivisor(this.locations.a_rotation, 1);

            // Texture Index (NEW)
            gl.enableVertexAttribArray(this.locations.a_textureIndex);
            gl.vertexAttribPointer(this.locations.a_textureIndex, 1, gl.FLOAT, false, stride, 32);
            gl.vertexAttribDivisor(this.locations.a_textureIndex, 1);

            // Unbind VAO
            gl.bindVertexArray(null);

            // Enable blending for transparency with OBS support
            gl.enable(gl.BLEND);
            if (this.alphaPreservingBlend) {
                gl.blendFuncSeparate(
                    gl.ONE, gl.ONE_MINUS_SRC_ALPHA,
                    gl.ONE, gl.ONE_MINUS_SRC_ALPHA
                );
            } else {
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            }

            gl.disable(gl.DEPTH_TEST);

            // ── Initialize Texture Atlas ───────────────────────────────
            this.initAtlas();

            this.initialized = true;
            console.log('[WebGL] Particle engine initialized with texture atlas');
            return true;

        } catch (error) {
            console.error('[WebGL] Initialization failed:', error);
            return false;
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // TEXTURE ATLAS MANAGEMENT
    // ════════════════════════════════════════════════════════════════════

    /**
     * Initialize the texture atlas with pre-rendered heart and paw slots.
     */
    initAtlas() {
        const gl = this.gl;

        // Create atlas texture (1024x1024, RGBA8)
        this.atlasTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, this.atlasSize, this.atlasSize);

        // Set filtering
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Initialize free slots (skip 0=heart and 1=paw which are pre-allocated)
        this.freeSlots = [];
        for (let i = this.maxSlots - 1; i >= 2; i--) {
            this.freeSlots.push(i);
        }

        // Pre-render heart and paw emoji into atlas
        this._renderEmojiToSlot(this.SLOT_HEART, '❤');
        this._renderEmojiToSlot(this.SLOT_PAW, '🐾');

        if (typeof console !== 'undefined' && console.log) {
            console.log(`[WebGL] Atlas initialized: ${this.maxSlots} slots (${this.slotsPerRow}x${this.slotsPerRow}), ${this.freeSlots.length} free`);
        }
    }

    /**
     * Render an emoji character into an atlas slot.
     * @param {number} slotIndex - Atlas slot index
     * @param {string} emoji - Single emoji character
     */
    _renderEmojiToSlot(slotIndex, emoji) {
        const gl = this.gl;
        const size = this.slotSize;
        const row = Math.floor(slotIndex / this.slotsPerRow);
        const col = slotIndex % this.slotsPerRow;

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // White emoji on transparent background — tinted by shader
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = `${size * 0.75}px Arial, sans-serif`;
        ctx.fillText(emoji, size / 2, size / 2);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
        gl.texSubImage2D(
            gl.TEXTURE_2D, 0,
            col * size, row * size,
            size, size,
            gl.RGBA, gl.UNSIGNED_BYTE,
            canvas
        );
    }

    /**
     * Allocate a slot in the atlas for a given image key.
     * @param {string} key - Unique identifier (e.g. image.src)
     * @returns {number} Slot index, or -1 if atlas is full
     */
    allocateSlot(key) {
        if (this.slotUsage.has(key)) {
            return this.slotUsage.get(key);
        }
        if (this.freeSlots.length === 0) {
            console.warn('[WebGL] Atlas is full, cannot allocate more slots');
            return -1;
        }
        const slot = this.freeSlots.pop();
        this.slotUsage.set(key, slot);
        return slot;
    }

    /**
     * Free an atlas slot by key.
     * @param {string} key - The key used when allocating
     */
    freeSlot(key) {
        if (!this.slotUsage.has(key)) return;
        const slot = this.slotUsage.get(key);
        this.slotUsage.delete(key);
        this.freeSlots.push(slot);
    }

    /**
     * Upload an HTML Image element into an atlas slot.
     * @param {number} slotIndex - Target atlas slot
     * @param {HTMLImageElement} image - The image to upload
     */
    uploadImageToSlot(slotIndex, image) {
        const gl = this.gl;
        const size = this.slotSize;
        const row = Math.floor(slotIndex / this.slotsPerRow);
        const col = slotIndex % this.slotsPerRow;

        // Draw image onto a temporary canvas, scaled to slot size
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Cover the slot while maintaining aspect ratio
        const scale = Math.max(size / image.width, size / image.height);
        const drawW = image.width * scale;
        const drawH = image.height * scale;
        const drawX = (size - drawW) / 2;
        const drawY = (size - drawH) / 2;
        ctx.drawImage(image, drawX, drawY, drawW, drawH);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
        gl.texSubImage2D(
            gl.TEXTURE_2D, 0,
            col * size, row * size,
            size, size,
            gl.RGBA, gl.UNSIGNED_BYTE,
            canvas
        );
    }

    queueImageUpload(key, image) {
        if (!key || !image) return -1;

        const slot = this.allocateSlot(key);
        if (slot < 0) return -1;

        if (!this.pendingAtlasKeys.has(key)) {
            this.pendingAtlasUploads.push({ key, slot, image });
            this.pendingAtlasKeys.add(key);
        }

        return slot;
    }

    processAtlasUploads() {
        if (!this.initialized || this.pendingAtlasUploads.length === 0) return;

        const uploadCount = Math.min(this.maxAtlasUploadsPerFrame, this.pendingAtlasUploads.length);
        for (let i = 0; i < uploadCount; i++) {
            const upload = this.pendingAtlasUploads.shift();
            this.pendingAtlasKeys.delete(upload.key);
            this.uploadImageToSlot(upload.slot, upload.image);
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // SHADER COMPILATION
    // ════════════════════════════════════════════════════════════════════

    /**
     * Compile a shader
     */
    compileShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('[WebGL] Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    // ════════════════════════════════════════════════════════════════════
    // PARTICLE DATA UPLOAD
    // ════════════════════════════════════════════════════════════════════

    /**
     * Update particle data from SOA particle system
     * @param {ParticleSystemSOA} particleSystem - SOA particle system
     */
    updateFromSOA(particleSystem) {
        if (!this.initialized) return;
        const activeCount = particleSystem.fillGPUBuffer(this.particleData);
        this.particleCount = activeCount;
        this.lastUploadFloatCount = 0;
    }

    /**
     * Update particle data from the Firework object graph used by engine.js.
     * @param {Array} fireworks - Active Firework instances
     */
    updateParticles(fireworks) {
        if (!this.initialized || !Array.isArray(fireworks)) {
            this.particleCount = 0;
            return;
        }

        let index = 0;
        for (const firework of fireworks) {
            if (!firework) continue;

            if (firework.rocket && this.shouldRenderParticle(firework.rocket)) {
                index = this.writeParticle(index, firework.rocket);
            }

            const particles = firework.particles || [];
            for (const particle of particles) {
                if (index >= this.maxParticles) break;
                if (this.shouldRenderParticle(particle)) {
                    index = this.writeParticle(index, particle);
                }
            }

            const secondary = firework.secondaryExplosions || [];
            for (const particle of secondary) {
                if (index >= this.maxParticles) break;
                if (this.shouldRenderParticle(particle)) {
                    index = this.writeParticle(index, particle);
                }
            }

            if (index >= this.maxParticles) break;
        }

        this.particleCount = index;
        this.lastUploadFloatCount = 0;
    }

    getActiveUploadView() {
        const floatCount = this.particleCount * this.FLOATS_PER_PARTICLE;
        if (this.lastUploadFloatCount !== floatCount || !this.activeUploadView) {
            this.activeUploadView = this.particleData.subarray(0, floatCount);
            this.lastUploadFloatCount = floatCount;
        }
        return this.activeUploadView;
    }

    /**
     * Alpha culling and Viewport culling for WebGL particles.
     * Now allows all particle types (circle, heart, paw, image) since
     * the texture atlas handles non-circle rendering.
     */
    shouldRenderParticle(particle) {
        if (!particle) return false;

        if ((particle.alpha || 0) <= 0.01 || (particle.size || 0) <= 0) {
            return false;
        }

        const margin = 100;
        const width = this.canvas.width || this.canvas.clientWidth || 0;
        const height = this.canvas.height || this.canvas.clientHeight || 0;
        return !(
            particle.x < -margin ||
            particle.x > width + margin ||
            particle.y < -margin ||
            particle.y > height + margin
        );
    }

    /**
     * Write a single particle's data into the GPU buffer.
     * 9 floats per particle: x, y, size, alpha, hue, sat, bright, rotation, textureIndex
     */
    writeParticle(index, particle) {
        const offset = index * this.FLOATS_PER_PARTICLE;
        this.particleData[offset] = particle.x || 0;
        this.particleData[offset + 1] = particle.y || 0;
        this.particleData[offset + 2] = particle.size || 1;
        this.particleData[offset + 3] = particle.alpha || 1;
        this.particleData[offset + 4] = particle.hue || 0;
        this.particleData[offset + 5] = particle.saturation ?? 100;
        this.particleData[offset + 6] = particle.brightness ?? 100;
        this.particleData[offset + 7] = particle.rotation || 0;
        this.particleData[offset + 8] = particle.textureIndex ?? 0;
        return index + 1;
    }

    // ════════════════════════════════════════════════════════════════════
    // RENDERING
    // ════════════════════════════════════════════════════════════════════

    /**
     * Render all particles in a single draw call
     */
    render() {
        if (!this.initialized || this.particleCount === 0) return;

        const gl = this.gl;
        this.processAtlasUploads();

        // Clear canvas with transparent background
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Use shader program
        gl.useProgram(this.program);

        // Update uniforms
        gl.uniform2f(this.locations.u_resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.locations.u_slotsPerRow, this.slotsPerRow);
        gl.uniform1f(this.locations.u_slotSize, 1.0 / this.slotsPerRow);

        // Bind atlas texture to texture unit 0
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
        gl.uniform1i(this.locations.u_atlas, 0);

        // Upload particle data to GPU
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.particles);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.getActiveUploadView());

        // Bind VAO and draw
        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.particleCount);
        gl.bindVertexArray(null);
    }

    /**
     * Resize canvas and update viewport
     */
    resize(width, height) {
        if (!this.initialized) return;

        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
    }

    /**
     * Cleanup WebGL resources
     */
    destroy() {
        if (!this.initialized) return;

        const gl = this.gl;

        if (this.buffers.quad) gl.deleteBuffer(this.buffers.quad);
        if (this.buffers.particles) gl.deleteBuffer(this.buffers.particles);
        if (this.vao) gl.deleteVertexArray(this.vao);
        if (this.program) gl.deleteProgram(this.program);
        if (this.atlasTexture) gl.deleteTexture(this.atlasTexture);

        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();

        this.initialized = false;
        console.log('[WebGL] Particle engine destroyed');
    }
}

// Export for use in engine.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebGLParticleEngine;
}
