/**
 * Post-Processor for Multi-Pass Effects
 * Handles Bloom, Chromatic Aberration, Film Grain
 */

class PostProcessor {
    constructor(gl) {
        this.gl = gl;
        this.framebuffers = {};
        this.textures = {};
        this.programs = {};
        this.quadBuffer = null;
        this.quadTexCoordBuffer = null;
        
        this.init();
    }
    
    init() {
        this.createQuadBuffers();
        this.createBloomShaders();
        this.createCompositeShader();
    }
    
    createQuadBuffers() {
        const gl = this.gl;
        
        // Full-screen quad vertices
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
        
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        
        this.quadTexCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadTexCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    }
    
    createBloomShaders() {
        const gl = this.gl;
        
        // Vertex shader for post-processing
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            varying vec2 vTexCoord;
            
            void main() {
                gl_Position = vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
            }
        `;
        
        // Extract bright areas
        const extractFragmentSource = `
            precision highp float;
            uniform sampler2D uTexture;
            uniform float uThreshold;
            varying vec2 vTexCoord;
            
            void main() {
                vec4 color = texture2D(uTexture, vTexCoord);
                float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
                if (brightness > uThreshold) {
                    gl_FragColor = color;
                } else {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                }
            }
        `;
        
        // Dual Kawase Blur: only 4 texture fetches per pass instead of 21 (Gaussian)
        const kawaseBlurFragmentSource = `
            precision highp float;
            uniform sampler2D uTexture;
            uniform vec2 uResolution;
            uniform float uRadius;
            varying vec2 vTexCoord;
            
            void main() {
                vec2 texelSize = 1.0 / uResolution;
                float offset = uRadius;
                
                vec4 color = vec4(0.0);
                color += texture2D(uTexture, vTexCoord + vec2(-offset, -offset) * texelSize);
                color += texture2D(uTexture, vTexCoord + vec2( offset, -offset) * texelSize);
                color += texture2D(uTexture, vTexCoord + vec2(-offset,  offset) * texelSize);
                color += texture2D(uTexture, vTexCoord + vec2( offset,  offset) * texelSize);
                
                gl_FragColor = color * 0.25;
            }
        `;
        
        this.programs.extractBright = this.createProgram(vertexShaderSource, extractFragmentSource);
        this.programs.kawaseBlur = this.createProgram(vertexShaderSource, kawaseBlurFragmentSource);
    }
    
    createCompositeShader() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            varying vec2 vTexCoord;
            
            void main() {
                gl_Position = vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
            }
        `;
        
        // Final composite with bloom, chromatic aberration, and film grain
        const compositeFragmentSource = `
            precision highp float;
            uniform sampler2D uOriginalTexture;
            uniform sampler2D uBloomTexture;
            uniform float uBloomIntensity;
            uniform float uChromaticAberration;
            uniform float uFilmGrain;
            uniform float uTime;
            uniform vec2 uResolution;
            varying vec2 vTexCoord;
            
            float rand(vec2 co) {
                return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
            }
            
            void main() {
                vec2 uv = vTexCoord;
                vec2 center = vec2(0.5, 0.5);
                vec2 offset = (uv - center) * uChromaticAberration;
                
                // Chromatic aberration
                float r = texture2D(uOriginalTexture, uv + offset).r;
                float g = texture2D(uOriginalTexture, uv).g;
                float b = texture2D(uOriginalTexture, uv - offset).b;
                float a = texture2D(uOriginalTexture, uv).a;
                
                vec4 originalColor = vec4(r, g, b, a);
                
                // Add bloom
                vec4 bloomColor = texture2D(uBloomTexture, uv);
                vec4 finalColor = originalColor + bloomColor * uBloomIntensity;
                
                // Film grain
                if (uFilmGrain > 0.0) {
                    float grain = rand(uv * uTime) * uFilmGrain;
                    finalColor.rgb += vec3(grain) - uFilmGrain * 0.5;
                }
                
                gl_FragColor = finalColor;
            }
        `;
        
        this.programs.composite = this.createProgram(vertexShaderSource, compositeFragmentSource);
    }
    
    createProgram(vertexSource, fragmentSource) {
        const gl = this.gl;
        
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexSource);
        gl.compileShader(vertexShader);
        
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            console.error('Vertex shader compile error:', gl.getShaderInfoLog(vertexShader));
            return null;
        }
        
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentSource);
        gl.compileShader(fragmentShader);
        
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            console.error('Fragment shader compile error:', gl.getShaderInfoLog(fragmentShader));
            return null;
        }
        
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            return null;
        }
        
        return program;
    }
    
    createFramebuffer(width, height, name) {
        const gl = this.gl;
        
        if (width <= 0 || height <= 0) {
            console.warn(`Cannot create framebuffer '${name}': invalid dimensions ${width}x${height}`);
            return null;
        }
        
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            console.error('Framebuffer is not complete');
        }
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        this.framebuffers[name] = framebuffer;
        this.textures[name] = texture;
        
        return { framebuffer, texture };
    }
    
    resize(width, height) {
        if (width <= 0 || height <= 0) return;
        
        // Scene FB stays at full resolution
        this.deleteAndRecreate('scene', width, height);
        
        // Bloom FBs at half resolution → 75% less VRAM
        // Math.max(1, ...) prevents 0x0 framebuffers which are invalid in WebGL
        const bloomWidth = Math.max(1, Math.floor(width / 2));
        const bloomHeight = Math.max(1, Math.floor(height / 2));
        this.deleteAndRecreate('bright', bloomWidth, bloomHeight);
        this.deleteAndRecreate('blur1', bloomWidth, bloomHeight);
        this.deleteAndRecreate('blur2', bloomWidth, bloomHeight);
        
        this.bloomWidth = bloomWidth;
        this.bloomHeight = bloomHeight;
    }
    
    deleteAndRecreate(name, width, height) {
        if (this.framebuffers[name]) {
            this.gl.deleteFramebuffer(this.framebuffers[name]);
            this.gl.deleteTexture(this.textures[name]);
        }
        this.createFramebuffer(width, height, name);
    }
    
    isReady() {
        return this.framebuffers.scene && 
               this.framebuffers.bright && 
               this.framebuffers.blur1 && 
               this.framebuffers.blur2 &&
               this.programs.extractBright &&
               this.programs.kawaseBlur &&
               this.programs.composite;
    }
    
    renderToFramebuffer(framebufferName, renderCallback) {
        const gl = this.gl;
        const fb = this.framebuffers[framebufferName];
        if (!fb) {
            console.warn(`[PostProcessor] Missing framebuffer: ${framebufferName}`);
            return;
        }
        
        const isBloom = framebufferName !== 'scene';
        const width = isBloom ? this.bloomWidth : gl.canvas.width;
        const height = isBloom ? this.bloomHeight : gl.canvas.height;
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        renderCallback();
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    }
    
    applyBloom(sceneTexture, config) {
        const gl = this.gl;
        const bloomWidth = this.bloomWidth || Math.max(1, Math.floor(gl.canvas.width / 2));
        const bloomHeight = this.bloomHeight || Math.max(1, Math.floor(gl.canvas.height / 2));
        const passCount = Math.max(1, config.bloomRadius || 4);
        
        // Extract bright areas into 'bright' FB (at bloom resolution)
        this.renderToFramebuffer('bright', () => {
            gl.useProgram(this.programs.extractBright);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
            
            const uTexture = gl.getUniformLocation(this.programs.extractBright, 'uTexture');
            const uThreshold = gl.getUniformLocation(this.programs.extractBright, 'uThreshold');
            gl.uniform1i(uTexture, 0);
            gl.uniform1f(uThreshold, config.bloomThreshold || 0.6);
            
            this.drawQuad(this.programs.extractBright);
        });
        
        // Kawase multi-pass blur: ping-pong between blur1 and blur2
        // Each pass uses offset = i + 0.5 (standard Kawase offsets: 0.5, 1.5, 2.5, ...)
        let srcName = 'bright';
        let dstName = 'blur1';
        
        for (let i = 0; i < passCount; i++) {
            const offset = i + 0.5;
            const finalDstName = dstName;
            const finalSrcName = srcName;
            
            this.renderToFramebuffer(finalDstName, () => {
                gl.useProgram(this.programs.kawaseBlur);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.textures[finalSrcName]);
                
                const uTexture = gl.getUniformLocation(this.programs.kawaseBlur, 'uTexture');
                const uResolution = gl.getUniformLocation(this.programs.kawaseBlur, 'uResolution');
                const uRadius = gl.getUniformLocation(this.programs.kawaseBlur, 'uRadius');
                gl.uniform1i(uTexture, 0);
                gl.uniform2f(uResolution, bloomWidth, bloomHeight);
                gl.uniform1f(uRadius, offset);
                
                this.drawQuad(this.programs.kawaseBlur);
            });
            
            // Swap ping-pong buffers (skip 'bright' after first pass)
            srcName = dstName;
            dstName = (dstName === 'blur1') ? 'blur2' : 'blur1';
        }
        
        return this.textures[srcName];
    }
    
    composite(originalTexture, bloomTexture, config, time) {
        const gl = this.gl;
        
        gl.useProgram(this.programs.composite);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, originalTexture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, bloomTexture);
        
        const uOriginalTexture = gl.getUniformLocation(this.programs.composite, 'uOriginalTexture');
        const uBloomTexture = gl.getUniformLocation(this.programs.composite, 'uBloomTexture');
        const uBloomIntensity = gl.getUniformLocation(this.programs.composite, 'uBloomIntensity');
        const uChromaticAberration = gl.getUniformLocation(this.programs.composite, 'uChromaticAberration');
        const uFilmGrain = gl.getUniformLocation(this.programs.composite, 'uFilmGrain');
        const uTime = gl.getUniformLocation(this.programs.composite, 'uTime');
        const uResolution = gl.getUniformLocation(this.programs.composite, 'uResolution');
        
        gl.uniform1i(uOriginalTexture, 0);
        gl.uniform1i(uBloomTexture, 1);
        gl.uniform1f(uBloomIntensity, config.bloomIntensity || 0.8);
        gl.uniform1f(uChromaticAberration, config.chromaticAberration || 0.005);
        gl.uniform1f(uFilmGrain, config.filmGrain || 0.03);
        gl.uniform1f(uTime, time);
        gl.uniform2f(uResolution, gl.canvas.width, gl.canvas.height);
        
        this.drawQuad(this.programs.composite);
    }
    
    drawQuad(program) {
        const gl = this.gl;
        
        const aPosition = gl.getAttribLocation(program, 'aPosition');
        const aTexCoord = gl.getAttribLocation(program, 'aTexCoord');
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadTexCoordBuffer);
        gl.enableVertexAttribArray(aTexCoord);
        gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    
    destroy() {
        const gl = this.gl;
        
        // Delete framebuffers and textures
        Object.values(this.framebuffers).forEach(fb => gl.deleteFramebuffer(fb));
        Object.values(this.textures).forEach(tex => gl.deleteTexture(tex));
        Object.values(this.programs).forEach(prog => gl.deleteProgram(prog));
        
        if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
        if (this.quadTexCoordBuffer) gl.deleteBuffer(this.quadTexCoordBuffer);
    }
}
