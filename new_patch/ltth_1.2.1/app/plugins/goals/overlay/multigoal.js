/**
 * MULTIGOAL OVERLAY RENDERER
 * Rotates through multiple goals with WebGL transitions
 */

class MultiGoalOverlayRenderer {
    constructor() {
        this.multigoalId = null;
        this.socket = null;
        this.multigoal = null;
        this.goals = [];
        this.currentIndex = 0;
        this.rotationTimer = null;
        this.container = document.getElementById('multigoal-container');
        this.goalsWrapper = document.getElementById('goals-wrapper');
        this.canvas = document.getElementById('webgl-canvas');
        this.gl = null;
        this.webglAnimator = null;
        this.isTransitioning = false;
    }

    /**
     * Initialize overlay
     */
    async init() {
        // Get multigoal ID from URL
        const params = new URLSearchParams(window.location.search);
        this.multigoalId = params.get('id');

        if (!this.multigoalId) {
            console.error('No multigoal ID provided in URL');
            return;
        }

        // Initialize WebGL
        this.initWebGL();

        // Connect to Socket.IO
        this.connectSocket();
    }

    /**
     * Initialize WebGL context
     */
    initWebGL() {
        try {
            this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
            if (!this.gl) {
                console.error('WebGL not supported');
                return;
            }

            // Set canvas size
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());

            // Initialize WebGL animator
            this.webglAnimator = new WebGLAnimator(this.gl, this.canvas);
        } catch (error) {
            console.error('Error initializing WebGL:', error);
        }
    }

    /**
     * Resize canvas to match window size
     */
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    /**
     * Connect to WebSocket
     */
    connectSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.subscribeToMultiGoal();
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.stopRotation();
        });

        // MultiGoal subscribed
        this.socket.on('multigoals:subscribed', (data) => {
            console.log('Subscribed to multigoal:', data.multigoalId);
            this.multigoal = data.multigoal;
            this.goals = data.multigoal.goals || [];
            this.renderGoals();
            this.startRotation();
        });

        // MultiGoal config changed
        this.socket.on('multigoals:config-changed', (data) => {
            if (data.multigoal.id !== this.multigoalId) return;

            console.log('Config changed');
            this.multigoal = data.multigoal;
            this.goals = data.multigoal.goals || [];
            this.renderGoals();
            this.stopRotation();
            this.startRotation();
        });

        // MultiGoal deleted
        this.socket.on('multigoals:deleted', (data) => {
            if (data.multigoalId !== this.multigoalId) return;

            console.log('MultiGoal deleted');
            this.stopRotation();
            this.container.innerHTML = '';
        });

        // Goal value changed - update the goal in our list
        this.socket.on('goals:value-changed', (data) => {
            const goalIndex = this.goals.findIndex(g => g.id === data.goalId);
            if (goalIndex !== -1) {
                this.goals[goalIndex] = data.goal;
                // Re-render if this is the current goal
                if (goalIndex === this.currentIndex) {
                    this.renderCurrentGoal();
                }
            }
        });
    }

    /**
     * Subscribe to multigoal updates
     */
    subscribeToMultiGoal() {
        this.socket.emit('multigoals:subscribe', this.multigoalId);
    }

    /**
     * Render all goals
     */
    renderGoals() {
        if (!this.goals || this.goals.length === 0) {
            this.goalsWrapper.innerHTML = '<div style="color: white; padding: 20px;">No goals configured</div>';
            return;
        }

        // Clear existing goals
        this.goalsWrapper.innerHTML = '';

        // Render each goal
        this.goals.forEach((goal, index) => {
            const goalDiv = document.createElement('div');
            goalDiv.className = 'goal-content';
            goalDiv.id = `goal-${index}`;
            goalDiv.innerHTML = this.renderGoal(goal);
            this.goalsWrapper.appendChild(goalDiv);
        });

        // Show first goal
        if (this.goals.length > 0) {
            this.showGoal(0, false);
        }
    }

    /**
     * Render a single goal
     */
    renderGoal(goal) {
        const template = this.getTemplate(goal.template_id || 'compact-bar');
        const theme = goal.theme || {};
        const html = template.render(goal, theme);
        const styles = template.getStyles(theme);

        return `
            <style>${styles}</style>
            ${html}
        `;
    }

    /**
     * Re-render current goal (for live updates)
     */
    renderCurrentGoal() {
        const goalDiv = document.getElementById(`goal-${this.currentIndex}`);
        if (goalDiv && this.goals[this.currentIndex]) {
            goalDiv.innerHTML = this.renderGoal(this.goals[this.currentIndex]);
        }
    }

    /**
     * Start goal rotation
     */
    startRotation() {
        if (this.goals.length <= 1) return;

        const interval = (this.multigoal.rotation_interval || 5) * 1000;

        this.rotationTimer = setInterval(() => {
            this.rotateToNext();
        }, interval);
    }

    /**
     * Stop goal rotation
     */
    stopRotation() {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
            this.rotationTimer = null;
        }
    }

    /**
     * Rotate to next goal
     */
    rotateToNext() {
        if (this.isTransitioning || this.goals.length <= 1) return;

        const nextIndex = (this.currentIndex + 1) % this.goals.length;
        this.showGoal(nextIndex, true);
    }

    /**
     * Show a specific goal with optional animation
     */
    async showGoal(index, animate = true) {
        if (index < 0 || index >= this.goals.length) return;

        const currentGoalDiv = document.getElementById(`goal-${this.currentIndex}`);
        const nextGoalDiv = document.getElementById(`goal-${index}`);

        if (!nextGoalDiv) return;

        if (animate && this.webglAnimator && currentGoalDiv) {
            this.isTransitioning = true;

            // Perform WebGL transition
            const animationType = this.multigoal.animation_type || 'slide';
            await this.webglAnimator.transition(currentGoalDiv, nextGoalDiv, animationType);

            // Switch visibility
            currentGoalDiv.classList.remove('active');
            nextGoalDiv.classList.add('active');

            this.isTransitioning = false;
        } else {
            // No animation, just switch
            if (currentGoalDiv) {
                currentGoalDiv.classList.remove('active');
            }
            nextGoalDiv.classList.add('active');
        }

        this.currentIndex = index;
    }

    /**
     * Get template by ID (using client-side templates)
     */
    getTemplate(templateId) {
        // Import templates from shared file
        const templates = window.GoalTemplates || {};
        return templates[templateId] || templates['compact-bar'];
    }
}

/**
 * WebGL Animator for transitions
 */
class WebGLAnimator {
    constructor(gl, canvas) {
        this.gl = gl;
        this.canvas = canvas;
        this.shaderPrograms = {};
        this.initShaders();
    }

    /**
     * Initialize shader programs for each animation type
     */
    initShaders() {
        // Vertex shader (shared by all animations)
        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;

        // Slide animation fragment shader
        const slideFragmentShader = `
            precision mediump float;
            uniform sampler2D u_textureCurrent;
            uniform sampler2D u_textureNext;
            uniform float u_progress;
            varying vec2 v_texCoord;
            
            void main() {
                vec2 currentCoord = v_texCoord + vec2(u_progress, 0.0);
                vec2 nextCoord = v_texCoord + vec2(u_progress - 1.0, 0.0);
                
                vec4 currentColor = texture2D(u_textureCurrent, currentCoord);
                vec4 nextColor = texture2D(u_textureNext, nextCoord);
                
                if (currentCoord.x > 1.0) {
                    gl_FragColor = nextColor;
                } else if (nextCoord.x < 0.0) {
                    gl_FragColor = currentColor;
                } else {
                    gl_FragColor = mix(currentColor, nextColor, u_progress);
                }
            }
        `;

        // Fade animation fragment shader
        const fadeFragmentShader = `
            precision mediump float;
            uniform sampler2D u_textureCurrent;
            uniform sampler2D u_textureNext;
            uniform float u_progress;
            varying vec2 v_texCoord;
            
            void main() {
                vec4 currentColor = texture2D(u_textureCurrent, v_texCoord);
                vec4 nextColor = texture2D(u_textureNext, v_texCoord);
                gl_FragColor = mix(currentColor, nextColor, u_progress);
            }
        `;

        // Cube rotation fragment shader
        const cubeFragmentShader = `
            precision mediump float;
            uniform sampler2D u_textureCurrent;
            uniform sampler2D u_textureNext;
            uniform float u_progress;
            varying vec2 v_texCoord;
            
            void main() {
                float angle = u_progress * 3.14159265359;
                vec2 center = vec2(0.5, 0.5);
                vec2 offset = v_texCoord - center;
                
                float perspective = 1.0 - abs(offset.x) * 0.5;
                float scale = mix(1.0, 0.8, abs(sin(angle)));
                
                vec2 currentCoord = center + offset * scale * (1.0 - u_progress);
                vec2 nextCoord = center + offset * scale * u_progress;
                
                vec4 currentColor = texture2D(u_textureCurrent, currentCoord);
                vec4 nextColor = texture2D(u_textureNext, nextCoord);
                
                gl_FragColor = mix(currentColor, nextColor, smoothstep(0.3, 0.7, u_progress));
            }
        `;

        // Wave distortion fragment shader
        const waveFragmentShader = `
            precision mediump float;
            uniform sampler2D u_textureCurrent;
            uniform sampler2D u_textureNext;
            uniform float u_progress;
            varying vec2 v_texCoord;
            
            void main() {
                float wave = sin(v_texCoord.y * 10.0 + u_progress * 6.28318) * 0.05 * (1.0 - u_progress);
                vec2 currentCoord = vec2(v_texCoord.x + wave, v_texCoord.y);
                vec2 nextCoord = vec2(v_texCoord.x - wave, v_texCoord.y);
                
                vec4 currentColor = texture2D(u_textureCurrent, currentCoord);
                vec4 nextColor = texture2D(u_textureNext, nextCoord);
                
                gl_FragColor = mix(currentColor, nextColor, u_progress);
            }
        `;

        // Particle transition fragment shader
        const particleFragmentShader = `
            precision mediump float;
            uniform sampler2D u_textureCurrent;
            uniform sampler2D u_textureNext;
            uniform float u_progress;
            varying vec2 v_texCoord;
            
            void main() {
                vec2 pixelated = floor(v_texCoord * 50.0) / 50.0;
                float noise = fract(sin(dot(pixelated, vec2(12.9898, 78.233))) * 43758.5453);
                float threshold = smoothstep(0.0, 1.0, u_progress + (noise - 0.5) * 0.3);
                
                vec4 currentColor = texture2D(u_textureCurrent, v_texCoord);
                vec4 nextColor = texture2D(u_textureNext, v_texCoord);
                
                gl_FragColor = mix(currentColor, nextColor, threshold);
            }
        `;

        // Compile shaders for each animation type
        this.shaderPrograms.slide = this.createProgram(vertexShaderSource, slideFragmentShader);
        this.shaderPrograms.fade = this.createProgram(vertexShaderSource, fadeFragmentShader);
        this.shaderPrograms.cube = this.createProgram(vertexShaderSource, cubeFragmentShader);
        this.shaderPrograms.wave = this.createProgram(vertexShaderSource, waveFragmentShader);
        this.shaderPrograms.particle = this.createProgram(vertexShaderSource, particleFragmentShader);
    }

    /**
     * Create shader program
     */
    createProgram(vertexSource, fragmentSource) {
        const gl = this.gl;

        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

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

    /**
     * Compile shader
     */
    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    /**
     * Perform transition animation
     */
    async transition(fromElement, toElement, animationType) {
        const duration = 1000; // 1 second transition
        const program = this.shaderPrograms[animationType] || this.shaderPrograms.fade;

        if (!program) {
            console.error('Shader program not available');
            return;
        }

        // For a simpler implementation, we'll use the WebGL canvas as an overlay
        // and apply shader effects during the transition
        const startTime = Date.now();

        return new Promise((resolve) => {
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1.0);

                // Render WebGL transition effect
                this.renderTransitionEffect(program, progress);

                if (progress < 1.0) {
                    requestAnimationFrame(animate);
                } else {
                    // Clear canvas after transition
                    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
                    resolve();
                }
            };

            animate();
        });
    }

    /**
     * Render transition effect (simplified version)
     */
    renderTransitionEffect(program, progress) {
        const gl = this.gl;

        gl.useProgram(program);

        // Set up geometry (full screen quad)
        const positions = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1
        ]);

        const texCoords = new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            1, 1
        ]);

        // Position buffer
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        // TexCoord buffer
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

        const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

        // Create simple gradient textures for transition
        const texture1 = this.createGradientTexture([0.2, 0.4, 0.8, 0.3]);
        const texture2 = this.createGradientTexture([0.8, 0.2, 0.4, 0.3]);

        // Set textures
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture1);
        gl.uniform1i(gl.getUniformLocation(program, 'u_textureCurrent'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texture2);
        gl.uniform1i(gl.getUniformLocation(program, 'u_textureNext'), 1);

        // Set progress uniform
        gl.uniform1f(gl.getUniformLocation(program, 'u_progress'), progress);

        // Set blend mode for overlay effect
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Clear and draw
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Clean up
        gl.deleteBuffer(positionBuffer);
        gl.deleteBuffer(texCoordBuffer);
        gl.deleteTexture(texture1);
        gl.deleteTexture(texture2);
    }

    /**
     * Create a simple gradient texture
     */
    createGradientTexture(color) {
        const gl = this.gl;
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`);
        gradient.addColorStop(1, `rgba(${color[2] * 255}, ${color[0] * 255}, ${color[1] * 255}, ${color[3]})`);

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Create texture
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        return texture;
    }
}

// Load templates from shared file
const script = document.createElement('script');
script.src = '/plugins/goals/templates-shared.js';
script.onload = () => {
    // Initialize overlay after templates are loaded
    const renderer = new MultiGoalOverlayRenderer();
    renderer.init();
};
document.head.appendChild(script);
