/**
 * Enhanced WebGL Effects Engine
 * Supports multiple visual effects: flames, particles, energy waves, lightning
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
        this.programs = {}; // Multiple shader programs for different effects
        this.currentProgram = null;
        this.textures = {};
        this.uniforms = {};
        this.buffers = {};
        this.startTime = Date.now();
        this.config = {};
        this.particles = [];
        this.lightningSegments = [];
        
        this.init();
    }
    
    init() {
        if (!this.canvas) {
            console.error('Cannot initialize: canvas is null');
            return;
        }
        
        // Initialize WebGL context
        this.gl = this.canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: true,
            preserveDrawingBuffer: false
        });
        
        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }
        
        // Load initial config
        this.loadConfig();
        
        // Setup WebGL
        this.setupAllShaders();
        this.setupGeometry();
        this.loadTextures();
        
        // Initialize particle system
        this.initParticles();
        
        // Start render loop
        this.render();
        
        // Listen for config updates via socket.io
        this.setupSocketListener();
        
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
        this.handleResize();
    }
    
    async loadConfig() {
        try {
            const response = await fetch('/api/flame-overlay/config');
            const data = await response.json();
            if (data.success) {
                this.config = data.config;
                this.switchEffect(this.config.effectType || 'flames');
            }
        } catch (error) {
            console.error('Failed to load config:', error);
            // Use defaults
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
                flameBrightness: 0.25,
                enableGlow: true,
                enableAdditiveBlend: true,
                maskOnlyEdges: true
            };
            this.switchEffect('flames');
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
                    
                    // Switch effect if changed
                    if (oldEffect !== this.config.effectType) {
                        this.switchEffect(this.config.effectType);
                    }
                    
                    this.updateUniforms();
                });
            } catch (error) {
                console.error('Failed to setup socket listener:', error);
            }
        } else {
            console.warn('Socket.io not available - config updates disabled');
        }
    }
    
    setupAllShaders() {
        // Setup shader programs for each effect
        this.setupFlameShaders();
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
        
        const fragmentShaderSource = `
            precision highp float;
            
            uniform float uTime;
            uniform sampler2D uNoiseTexture;
            uniform sampler2D uFireProfile;
            uniform vec3 uFlameColor;
            uniform float uFlameSpeed;
            uniform float uFlameIntensity;
            uniform float uFlameBrightness;
            uniform vec2 uResolution;
            uniform float uFrameThickness;
            uniform int uFrameMode;
            uniform bool uMaskEdges;
            
            varying vec2 vTexCoord;
            varying vec3 vPosition;
            
            const float modulus = 61.0;
            
            vec2 mBBS(vec2 val, float modulus) {
                val = mod(val, modulus);
                return mod(val * val, modulus);
            }
            
            float mnoise(vec3 pos) {
                float intArg = floor(pos.z);
                float fracArg = fract(pos.z);
                vec2 hash = mBBS(intArg * 3.0 + vec2(0.0, 3.0), modulus);
                vec4 g = vec4(
                    texture2D(uNoiseTexture, vec2(pos.x, pos.y + hash.x) / modulus).xy,
                    texture2D(uNoiseTexture, vec2(pos.x, pos.y + hash.y) / modulus).xy
                ) * 2.0 - 1.0;
                return mix(
                    g.x + g.y * fracArg,
                    g.z + g.w * (fracArg - 1.0),
                    smoothstep(0.0, 1.0, fracArg)
                );
            }
            
            float turbulence(vec3 pos) {
                float sum = 0.0;
                float freq = 1.0;
                float amp = 1.0;
                
                for(int i = 0; i < 5; i++) {
                    sum += abs(mnoise(pos * freq)) * amp;
                    freq *= 2.0;
                    amp *= 0.5;
                }
                return sum;
            }
            
            vec4 sampleFire(vec3 loc, vec4 scale) {
                loc.xz = loc.xz * 2.0 - 1.0;
                vec2 st = vec2(sqrt(dot(loc.xz, loc.xz)), loc.y);
                
                loc.y -= uTime * scale.w * uFlameSpeed;
                loc *= scale.xyz;
                
                float offset = sqrt(st.y) * uFlameIntensity * turbulence(loc);
                st.y += offset;
                
                if (st.y > 1.0) {
                    return vec4(0.0, 0.0, 0.0, 0.0);
                }
                
                vec4 result = texture2D(uFireProfile, st);
                
                if (st.y < 0.1) {
                    result *= st.y / 0.1;
                }
                
                // Enhanced color with better gradient
                vec3 flameGradient = mix(
                    uFlameColor * 0.5,
                    uFlameColor * 1.5,
                    st.y
                );
                result.rgb *= flameGradient;
                
                // Add glow effect
                result.rgb += vec3(0.2, 0.1, 0.0) * (1.0 - st.y) * result.a;
                
                return result;
            }
            
            void main() {
                vec2 uv = vTexCoord;
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
                
                vec3 samplePos = vec3(uv.x, edgeDist, uv.y);
                vec4 fireColor = sampleFire(samplePos, vec4(1.0, 2.0, 1.0, 0.5));
                
                fireColor.rgb *= uFlameBrightness * 2.0;
                
                if (uMaskEdges) {
                    fireColor.a *= smoothstep(0.0, 0.3, edgeDist);
                }
                
                gl_FragColor = fireColor;
            }
        `;
        
        this.programs.flames = this.createProgram(vertexShaderSource, fragmentShaderSource);
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
            
            // Pseudo-random function
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }
            
            vec4 renderParticles(vec2 uv, vec2 pixelPos, float edgeDist) {
                vec4 color = vec4(0.0);
                
                // Create multiple layers of particles - optimized for performance
                for (int layer = 0; layer < 2; layer++) {
                    float layerOffset = float(layer) * 0.5;
                    float particleCount = 12.0 + float(layer) * 6.0;
                    
                    for (float i = 0.0; i < 18.0; i += 1.0) {
                        if (i >= particleCount) break;
                        
                        // Particle position
                        float particleTime = uTime * uFlameSpeed + i * 0.1 + layerOffset;
                        float x = fract(random(vec2(i, layerOffset)) + particleTime * 0.05);
                        float y = fract(random(vec2(i + 100.0, layerOffset)) + particleTime * 0.3);
                        
                        vec2 particlePos = vec2(x * uResolution.x, y * uFrameThickness);
                        
                        // Particle size based on intensity
                        float size = (5.0 + random(vec2(i, i)) * 15.0) * uFlameIntensity;
                        
                        // Distance to particle
                        float dist = length(pixelPos - particlePos);
                        
                        // Particle glow
                        if (dist < size) {
                            float alpha = 1.0 - (dist / size);
                            alpha = pow(alpha, 2.0);
                            
                            // Color variation
                            vec3 particleColor = mix(
                                uFlameColor * 0.8,
                                uFlameColor * 1.5,
                                random(vec2(i, particleTime))
                            );
                            
                            color.rgb += particleColor * alpha * 0.4;
                            color.a += alpha * 0.4;
                        }
                    }
                }
                
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
                        pixelPos.y = uResolution.y - pixelPos.y;
                    }
                } else if (uFrameMode == 2) {
                    if (pixelPos.x < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.x / uFrameThickness;
                        vec2 temp = pixelPos;
                        pixelPos.x = temp.y;
                        pixelPos.y = temp.x;
                    } else if (pixelPos.x > uResolution.x - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (uResolution.x - pixelPos.x) / uFrameThickness;
                        vec2 temp = pixelPos;
                        pixelPos.x = temp.y;
                        pixelPos.y = uResolution.x - temp.x;
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
        
        this.programs.particles = this.createProgram(vertexShaderSource, fragmentShaderSource);
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
            
            float noise(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            
            vec4 renderEnergyWaves(vec2 uv, vec2 pixelPos, float edgeDist) {
                vec4 color = vec4(0.0);
                
                // Multiple wave layers
                for (int i = 0; i < 4; i++) {
                    float offset = float(i) * 0.25;
                    float wave = sin(uv.x * 20.0 + uTime * uFlameSpeed * 2.0 + offset) * 
                                 cos(uv.x * 15.0 - uTime * uFlameSpeed * 1.5 + offset);
                    
                    wave *= uFlameIntensity * 0.5;
                    
                    // Wave pattern based on edge distance
                    float waveIntensity = abs(wave - edgeDist + 0.5);
                    waveIntensity = 1.0 - smoothstep(0.0, 0.2, waveIntensity);
                    
                    // Color based on wave layer
                    vec3 waveColor = mix(
                        uFlameColor * 0.5,
                        uFlameColor * 2.0,
                        float(i) / 3.0
                    );
                    
                    color.rgb += waveColor * waveIntensity * 0.3;
                    color.a += waveIntensity * 0.3;
                }
                
                // Add flowing energy effect
                float flow = sin(uv.x * 10.0 + uTime * uFlameSpeed * 3.0) * 
                            cos(uv.y * 8.0 - uTime * uFlameSpeed * 2.0);
                flow = (flow + 1.0) * 0.5;
                
                color.rgb += uFlameColor * flow * 0.2;
                color.a += flow * 0.1;
                
                return color * uFlameBrightness * 2.5;
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
                
                gl_FragColor = renderEnergyWaves(vTexCoord, pixelPos, edgeDist);
                gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 1.0);
            }
        `;
        
        this.programs.energy = this.createProgram(vertexShaderSource, fragmentShaderSource);
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
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }
            
            vec4 renderLightning(vec2 uv, vec2 pixelPos, float edgeDist) {
                vec4 color = vec4(0.0);
                
                // Electric arc effect - optimized for performance
                float boltCount = 3.0 + floor(uFlameIntensity * 4.0);
                
                for (float i = 0.0; i < 7.0; i += 1.0) {
                    if (i >= boltCount) break;
                    
                    float boltTime = uTime * uFlameSpeed + i * 0.3;
                    float boltX = fract(random(vec2(i, floor(boltTime))) + boltTime * 0.1);
                    
                    // Lightning bolt path with jagged movement - reduced segments
                    float segments = 6.0;
                    
                    for (float s = 0.0; s < 6.0; s += 1.0) {
                        if (s >= segments) break;
                        
                        float segmentProgress = s / segments;
                        float nextSegmentProgress = (s + 1.0) / segments;
                        
                        if (uv.x >= boltX - 0.05 && uv.x <= boltX + 0.05) {
                            float zigzag = (random(vec2(i, s + floor(boltTime * 10.0))) - 0.5) * 0.1 * uFlameIntensity;
                            
                            float lineY = mix(segmentProgress, nextSegmentProgress, 
                                            fract((uv.x - boltX + 0.05) * 10.0)) + zigzag;
                            
                            float dist = abs(edgeDist - lineY);
                            
                            if (dist < 0.05) {
                                float intensity = 1.0 - (dist / 0.05);
                                intensity = pow(intensity, 2.0);
                                
                                // Flickering effect
                                float flicker = 0.7 + 0.3 * sin(uTime * 20.0 + i);
                                
                                color.rgb += uFlameColor * intensity * flicker * 0.6;
                                color.a += intensity * flicker * 0.6;
                                
                                // Glow around bolt
                                if (dist < 0.1) {
                                    float glow = 1.0 - (dist / 0.1);
                                    glow = pow(glow, 3.0);
                                    color.rgb += uFlameColor * glow * 0.25;
                                    color.a += glow * 0.15;
                                }
                            }
                        }
                    }
                }
                
                // Add ambient electric field
                float field = sin(uv.x * 30.0 + uTime * uFlameSpeed * 5.0) * 
                             cos(edgeDist * 20.0 - uTime * uFlameSpeed * 3.0);
                field = (field + 1.0) * 0.5;
                
                color.rgb += uFlameColor * field * 0.1;
                color.a += field * 0.05;
                
                return color * uFlameBrightness * 3.0;
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
                
                gl_FragColor = renderLightning(vTexCoord, pixelPos, edgeDist);
                gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 1.0);
            }
        `;
        
        this.programs.lightning = this.createProgram(vertexShaderSource, fragmentShaderSource);
    }
    
    createProgram(vertexSource, fragmentSource) {
        const vertexShader = this.compileShader(vertexSource, this.gl.VERTEX_SHADER);
        const fragmentShader = this.compileShader(fragmentSource, this.gl.FRAGMENT_SHADER);
        
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
        this.currentProgram = this.programs[programKey];
        
        if (this.currentProgram) {
            this.gl.useProgram(this.currentProgram);
            this.setupUniformsForProgram(this.currentProgram);
            this.updateUniforms();
        }
    }
    
    setupUniformsForProgram(program) {
        this.gl.useProgram(program);
        
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
            fireProfile: this.gl.getUniformLocation(program, 'uFireProfile')
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
        this.updateUniforms();
    }
    
    render() {
        if (!this.gl || !this.currentProgram) {
            requestAnimationFrame(() => this.render());
            return;
        }
        
        const time = (Date.now() - this.startTime) / 1000.0;
        
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        
        this.gl.useProgram(this.currentProgram);
        
        if (this.uniforms.time) {
            this.gl.uniform1f(this.uniforms.time, time);
        }
        
        // Bind textures
        if (this.textures.noise) {
            this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.noise);
        }
        if (this.textures.fireProfile) {
            this.gl.activeTexture(this.gl.TEXTURE1);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.fireProfile);
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
            this.gl.uniformMatrix4fv(this.uniforms.projectionMatrix, false, projectionMatrix);
        }
        if (this.uniforms.modelViewMatrix) {
            this.gl.uniformMatrix4fv(this.uniforms.modelViewMatrix, false, modelViewMatrix);
        }
        
        // Bind geometry
        const aPosition = this.gl.getAttribLocation(this.currentProgram, 'aPosition');
        if (aPosition !== -1) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
            this.gl.enableVertexAttribArray(aPosition);
            this.gl.vertexAttribPointer(aPosition, 3, this.gl.FLOAT, false, 0, 0);
        }
        
        const aTexCoord = this.gl.getAttribLocation(this.currentProgram, 'aTexCoord');
        if (aTexCoord !== -1) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.texCoord);
            this.gl.enableVertexAttribArray(aTexCoord);
            this.gl.vertexAttribPointer(aTexCoord, 2, this.gl.FLOAT, false, 0, 0);
        }
        
        // Draw
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        
        requestAnimationFrame(() => this.render());
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Store engine instance globally for debugging and external control
    window.effectsEngine = new EffectsEngine('flameCanvas');
});
