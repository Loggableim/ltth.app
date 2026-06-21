/**
 * WebGL Flame Overlay Renderer
 * Standalone implementation without external dependencies
 */

class FlameRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        
        if (!this.canvas) {
            console.error('Canvas element not found:', canvasId);
            return;
        }
        
        this.gl = null;
        this.program = null;
        this.textures = {};
        this.uniforms = {};
        this.buffers = {};
        this.startTime = Date.now();
        this.config = {};
        
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
        this.setupShaders();
        this.setupGeometry();
        this.loadTextures();
        
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
                this.updateUniforms();
            }
        } catch (error) {
            console.error('Failed to load config:', error);
            // Use defaults
            this.config = {
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
        }
    }
    
    setupSocketListener() {
        // Check if socket.io is available
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
                    this.config = data.config;
                    this.updateUniforms();
                });
            } catch (error) {
                console.error('Failed to setup socket listener:', error);
            }
        } else {
            console.warn('Socket.io not available - config updates disabled');
        }
    }
    
    setupShaders() {
        const vertexShader = this.compileShader(
            document.getElementById('vertex-shader').textContent,
            this.gl.VERTEX_SHADER
        );
        
        const fragmentShader = this.compileShader(
            document.getElementById('fragment-shader').textContent,
            this.gl.FRAGMENT_SHADER
        );
        
        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);
        
        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Shader program link error:', this.gl.getProgramInfoLog(this.program));
            return;
        }
        
        this.gl.useProgram(this.program);
        
        // Get uniform locations
        this.uniforms = {
            time: this.gl.getUniformLocation(this.program, 'uTime'),
            noiseTexture: this.gl.getUniformLocation(this.program, 'uNoiseTexture'),
            fireProfile: this.gl.getUniformLocation(this.program, 'uFireProfile'),
            flameColor: this.gl.getUniformLocation(this.program, 'uFlameColor'),
            flameSpeed: this.gl.getUniformLocation(this.program, 'uFlameSpeed'),
            flameIntensity: this.gl.getUniformLocation(this.program, 'uFlameIntensity'),
            flameBrightness: this.gl.getUniformLocation(this.program, 'uFlameBrightness'),
            resolution: this.gl.getUniformLocation(this.program, 'uResolution'),
            frameThickness: this.gl.getUniformLocation(this.program, 'uFrameThickness'),
            frameMode: this.gl.getUniformLocation(this.program, 'uFrameMode'),
            maskEdges: this.gl.getUniformLocation(this.program, 'uMaskEdges'),
            projectionMatrix: this.gl.getUniformLocation(this.program, 'uProjectionMatrix'),
            modelViewMatrix: this.gl.getUniformLocation(this.program, 'uModelViewMatrix')
        };
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
    
    setupGeometry() {
        // Create a fullscreen quad
        const vertices = new Float32Array([
            -1, -1, 0,  // bottom-left
             1, -1, 0,  // bottom-right
            -1,  1, 0,  // top-left
             1,  1, 0   // top-right
        ]);
        
        const texCoords = new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            1, 1
        ]);
        
        // Position buffer
        this.buffers.position = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        
        const aPosition = this.gl.getAttribLocation(this.program, 'aPosition');
        this.gl.enableVertexAttribArray(aPosition);
        this.gl.vertexAttribPointer(aPosition, 3, this.gl.FLOAT, false, 0, 0);
        
        // TexCoord buffer
        this.buffers.texCoord = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.texCoord);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);
        
        const aTexCoord = this.gl.getAttribLocation(this.program, 'aTexCoord');
        this.gl.enableVertexAttribArray(aTexCoord);
        this.gl.vertexAttribPointer(aTexCoord, 2, this.gl.FLOAT, false, 0, 0);
    }
    
    loadTextures() {
        // Load noise texture
        this.loadTexture('/plugins/flame-overlay/textures/nzw.png', 'noise', this.gl.LINEAR, this.gl.REPEAT);
        
        // Load fire profile texture
        this.loadTexture('/plugins/flame-overlay/textures/firetex.png', 'fireProfile', this.gl.LINEAR, this.gl.CLAMP_TO_EDGE);
    }
    
    loadTexture(url, name, filter, wrap) {
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        
        // Placeholder pixel while loading
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
        if (!this.gl || !this.program) return;
        
        this.gl.useProgram(this.program);
        
        // Flame color
        const color = this.hexToRgb(this.config.flameColor || '#ff6600');
        this.gl.uniform3f(this.uniforms.flameColor, color.r, color.g, color.b);
        
        // Flame parameters
        this.gl.uniform1f(this.uniforms.flameSpeed, this.config.flameSpeed || 0.5);
        this.gl.uniform1f(this.uniforms.flameIntensity, this.config.flameIntensity || 1.3);
        this.gl.uniform1f(this.uniforms.flameBrightness, this.config.flameBrightness || 0.25);
        
        // Frame settings
        this.gl.uniform1f(this.uniforms.frameThickness, this.config.frameThickness || 150);
        this.gl.uniform1i(this.uniforms.frameMode, this.getFrameMode());
        this.gl.uniform1i(this.uniforms.maskEdges, this.config.maskOnlyEdges ? 1 : 0);
        
        // Resolution
        this.gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        
        // Textures
        this.gl.uniform1i(this.uniforms.noiseTexture, 0);
        this.gl.uniform1i(this.uniforms.fireProfile, 1);
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
        // Clear with transparent background
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        
        // Enable blending for transparency
        this.gl.enable(this.gl.BLEND);
        if (this.config.enableAdditiveBlend) {
            this.gl.blendFunc(this.gl.ONE, this.gl.ONE);
        } else {
            this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        }
        
        // Update time uniform
        const time = (Date.now() - this.startTime) / 1000.0;
        this.gl.uniform1f(this.uniforms.time, time);
        
        // Set matrices (identity for fullscreen quad)
        const identityMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
        this.gl.uniformMatrix4fv(this.uniforms.projectionMatrix, false, identityMatrix);
        this.gl.uniformMatrix4fv(this.uniforms.modelViewMatrix, false, identityMatrix);
        
        // Bind textures
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.noise);
        
        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.fireProfile);
        
        // Draw
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        
        // Request next frame
        requestAnimationFrame(() => this.render());
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new FlameRenderer('flameCanvas');
    });
} else {
    // DOM already loaded
    new FlameRenderer('flameCanvas');
}
