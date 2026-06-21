/**
 * WebGL2 Particle Engine - High-Performance Instanced Rendering
 * 
 * Renders all particles in a single draw call using WebGL2 instanced rendering.
 * Works directly with Struct-of-Arrays (SOA) particle system for maximum performance.
 * 
 * Features:
 * - Instanced rendering: 1 draw call for all particles
 * - Per-particle attributes: position, size, alpha, HSB color, rotation
 * - HSB to RGB conversion in fragment shader
 * - Soft-edge circular particles with glow effect
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
    }

    /**
     * Initialize WebGL2 context and shaders
     * @returns {boolean} True if initialization succeeded
     */
    init() {
        try {
            // Request WebGL2 context with optimal settings for OBS capture
            const contextOptions = {
                antialias: false,        // Disable AA for performance
                alpha: true,             // Enable transparency
                premultipliedAlpha: false, // Use standard alpha (easier for OBS)
                preserveDrawingBuffer: this.preserveDrawingBuffer, // Configurable: true for OBS capture, false for browser preview
                desynchronized: true,    // Default: true for better GPU performance (safe for OBS)
                powerPreference: 'high-performance' // Use discrete GPU if available
            };
            contextOptions.desynchronized = this.desynchronized;
            this.gl = this.canvas.getContext('webgl2', contextOptions);

            if (!this.gl) {
                console.warn('[WebGL] WebGL2 not available, falling back to Canvas 2D');
                return false;
            }

            const gl = this.gl;

            // Vertex shader - transforms instanced quads
            const vertexShaderSource = `#version 300 es
                precision highp float;

                // Quad vertex positions (shared by all instances)
                in vec2 a_position;

                // Per-instance attributes (8 floats per particle)
                in vec2 a_particlePos;    // x, y
                in float a_size;          // size
                in float a_alpha;         // alpha
                in vec3 a_hsb;            // hue (0-360), saturation (0-100), brightness (0-100)
                in float a_rotation;      // rotation angle

                // Output to fragment shader
                out vec2 v_uv;
                out vec4 v_color;
                out float v_alpha;

                uniform vec2 u_resolution;

                // HSB to RGB conversion
                vec3 hsb2rgb(float h, float s, float b) {
                    // Normalize inputs
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
                    clipSpace.y *= -1.0; // Flip Y axis to match Canvas
                    
                    gl_Position = vec4(clipSpace, 0.0, 1.0);
                    
                    // Pass UV coordinates for circular shape
                    v_uv = a_position;
                }
            `;

            // Fragment shader - renders soft circular particles with glow
            const fragmentShaderSource = `#version 300 es
                precision highp float;

                in vec2 v_uv;
                in vec4 v_color;
                in float v_alpha;

                out vec4 outColor;

                void main() {
                    // Calculate distance from center
                    float dist = length(v_uv);
                    
                    // Create soft-edge circle with glow
                    // Inner core (0.0 - 0.3): full brightness
                    // Middle ring (0.3 - 0.7): soft edge
                    // Outer glow (0.7 - 1.0): fade to zero
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
                        // Outside circle
                        discard;
                    }
                    
                    // Apply particle alpha
                    alpha *= v_alpha;
                    
                    // Output with brighter core for better visibility
                    vec3 finalColor = v_color.rgb * (1.0 + (1.0 - dist) * 0.5);
                    
                    // Standard alpha output for OBS transparency
                    outColor = vec4(finalColor, alpha);
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
                // Attributes
                a_position: gl.getAttribLocation(this.program, 'a_position'),
                a_particlePos: gl.getAttribLocation(this.program, 'a_particlePos'),
                a_size: gl.getAttribLocation(this.program, 'a_size'),
                a_alpha: gl.getAttribLocation(this.program, 'a_alpha'),
                a_hsb: gl.getAttribLocation(this.program, 'a_hsb'),
                a_rotation: gl.getAttribLocation(this.program, 'a_rotation'),
                // Uniforms
                u_resolution: gl.getUniformLocation(this.program, 'u_resolution')
            };

            // Create quad geometry (2 triangles = 1 quad)
            // UV coordinates from -1 to 1 (will be used for circular masking)
            const quadVertices = new Float32Array([
                -1, -1,  // Bottom-left
                 1, -1,  // Bottom-right
                -1,  1,  // Top-left
                -1,  1,  // Top-left
                 1, -1,  // Bottom-right
                 1,  1   // Top-right
            ]);

            this.buffers.quad = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quad);
            gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

            // Create particle data buffer (per-instance attributes)
            // 8 floats per particle: x, y, size, alpha, hue, saturation, brightness, rotation
            this.particleData = new Float32Array(this.maxParticles * 8);
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
            
            // Position (x, y)
            gl.enableVertexAttribArray(this.locations.a_particlePos);
            gl.vertexAttribPointer(this.locations.a_particlePos, 2, gl.FLOAT, false, 32, 0);
            gl.vertexAttribDivisor(this.locations.a_particlePos, 1);
            
            // Size
            gl.enableVertexAttribArray(this.locations.a_size);
            gl.vertexAttribPointer(this.locations.a_size, 1, gl.FLOAT, false, 32, 8);
            gl.vertexAttribDivisor(this.locations.a_size, 1);
            
            // Alpha
            gl.enableVertexAttribArray(this.locations.a_alpha);
            gl.vertexAttribPointer(this.locations.a_alpha, 1, gl.FLOAT, false, 32, 12);
            gl.vertexAttribDivisor(this.locations.a_alpha, 1);
            
            // HSB color (hue, saturation, brightness)
            gl.enableVertexAttribArray(this.locations.a_hsb);
            gl.vertexAttribPointer(this.locations.a_hsb, 3, gl.FLOAT, false, 32, 16);
            gl.vertexAttribDivisor(this.locations.a_hsb, 1);
            
            // Rotation
            gl.enableVertexAttribArray(this.locations.a_rotation);
            gl.vertexAttribPointer(this.locations.a_rotation, 1, gl.FLOAT, false, 32, 28);
            gl.vertexAttribDivisor(this.locations.a_rotation, 1);

            // Unbind VAO
            gl.bindVertexArray(null);

            // Enable blending for transparency with OBS support
            gl.enable(gl.BLEND);
            if (this.alphaPreservingBlend) {
                // Hybrid blending: additive RGB for glow, preserved alpha for OBS.
                gl.blendFuncSeparate(
                    gl.ONE, gl.ONE_MINUS_SRC_ALPHA,
                    gl.ONE, gl.ONE_MINUS_SRC_ALPHA
                );
            } else {
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            }

            // Disable depth testing (2D rendering)
            gl.disable(gl.DEPTH_TEST);

            this.initialized = true;
            console.log('[WebGL] Particle engine initialized successfully');
            return true;

        } catch (error) {
            console.error('[WebGL] Initialization failed:', error);
            return false;
        }
    }

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

    /**
     * Update particle data from SOA particle system
     * @param {ParticleSystemSOA} particleSystem - SOA particle system
     */
    updateFromSOA(particleSystem) {
        if (!this.initialized) return;
        
        // Directly fill GPU buffer from SOA system
        const activeCount = particleSystem.fillGPUBuffer(this.particleData);
        this.particleCount = activeCount;
    }

    /**
     * Update particle data from the legacy Firework object graph used by engine.js.
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
    }

    /**
     * Alpha culling and Viewport culling for WebGL particles.
     */
    shouldRenderParticle(particle) {
        if (!particle || (particle.type && particle.type !== 'circle')) {
            return false;
        }

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

    writeParticle(index, particle) {
        const offset = index * 8;
        this.particleData[offset] = particle.x || 0;
        this.particleData[offset + 1] = particle.y || 0;
        this.particleData[offset + 2] = particle.size || 1;
        this.particleData[offset + 3] = particle.alpha || 1;
        this.particleData[offset + 4] = particle.hue || 0;
        this.particleData[offset + 5] = particle.saturation ?? 100;
        this.particleData[offset + 6] = particle.brightness ?? 100;
        this.particleData[offset + 7] = particle.rotation || 0;
        return index + 1;
    }

    /**
     * Render all particles in a single draw call
     */
    render() {
        if (!this.initialized || this.particleCount === 0) return;

        const gl = this.gl;

        // Clear canvas with transparent background
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Use shader program
        gl.useProgram(this.program);

        // Update resolution uniform
        gl.uniform2f(this.locations.u_resolution, this.canvas.width, this.canvas.height);

        // Upload particle data to GPU
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.particles);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particleData.subarray(0, this.particleCount * 8));

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
        
        // Delete buffers
        if (this.buffers.quad) gl.deleteBuffer(this.buffers.quad);
        if (this.buffers.particles) gl.deleteBuffer(this.buffers.particles);
        
        // Delete VAO
        if (this.vao) gl.deleteVertexArray(this.vao);
        
        // Delete program
        if (this.program) gl.deleteProgram(this.program);

        // Lose context
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
