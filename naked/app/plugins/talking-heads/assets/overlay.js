/**
 * Talking Heads OBS Overlay JavaScript
 * Handles sprite animation synchronized with TTS audio
 */

const socket = io();

// Active avatar instances
const activeAvatars = new Map();
const SPAWN_DURATION = 1800;

/**
 * WebGL-based spawn animator for OBS HUD / overlay
 */
class SpawnAnimator {
  constructor() {
    this.duration = SPAWN_DURATION;
    this.startTime = 0;
    this.active = false;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'spawnCanvas';
    this.canvas.className = 'spawn-canvas';
    document.body.appendChild(this.canvas);

    this.mediaLayer = document.createElement('div');
    this.mediaLayer.id = 'spawnMediaLayer';
    document.body.appendChild(this.mediaLayer);

    this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: false });
    this.program = null;
    this.positionBuffer = null;
    this.timeUniform = null;
    this.resolutionUniform = null;

    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();

    if (this.gl) {
      this._initGL();
    }
  }

  _initGL() {
    const vsSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_resolution;
      void main() {
        vec2 uv = (gl_FragCoord.xy / u_resolution) * 2.0 - 1.0;
        float len = length(uv);
        float wave = 0.45 + 0.08 * sin(u_time * 4.0);
        float ring = smoothstep(0.25, 0.0, abs(len - wave));
        float glow = smoothstep(0.9, 0.1, len);
        float pulse = 0.5 + 0.5 * sin(u_time * 3.5);
        vec3 color = mix(vec3(0.16, 0.62, 1.0), vec3(0.92, 0.25, 1.0), pulse);
        float alpha = ring * glow;
        gl_FragColor = vec4(color, alpha * 0.9);
      }
    `;

    const gl = this.gl;
    const vertexShader = this._compileShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = this._compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) {
      this.program = null;
      return;
    }
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.warn('SpawnAnimator: WebGL program failed to link');
      this.program = null;
      return;
    }

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
      3, -1,
      -1, 3
    ]), gl.STATIC_DRAW);

    this.timeUniform = gl.getUniformLocation(this.program, 'u_time');
    this.resolutionUniform = gl.getUniformLocation(this.program, 'u_resolution');
  }

  _compileShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.warn('SpawnAnimator: shader compile error', this.gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  _resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  _clearMedia() {
    this.mediaLayer.innerHTML = '';
  }

  _playCustomMedia(options) {
    this._clearMedia();
    if (!options || options.mode !== 'custom' || !options.customMediaUrl) return;

    const url = options.customMediaUrl;
    const lower = url.toLowerCase();
    const isVideo = lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov');

    if (isVideo) {
      const video = document.createElement('video');
      video.src = url;
      video.autoplay = true;
      video.muted = false;
      video.playsInline = true;
      video.loop = false;
      video.volume = typeof options.volume === 'number' ? options.volume : 0.8;
      video.className = 'spawn-media';
      this.mediaLayer.appendChild(video);
      video.addEventListener('ended', () => this._clearMedia(), { once: true });
      video.play().catch(() => {
        // Autoplay with sound can fail; retry muted fallback
        video.muted = true;
        video.play().catch(() => {});
      });
    } else {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Spawn animation';
      img.className = 'spawn-media';
      this.mediaLayer.appendChild(img);
      setTimeout(() => this._clearMedia(), this.duration);
    }
  }

  trigger(options = {}) {
    this.startTime = performance.now();
    this.active = true;
    this.canvas.classList.add('active');
    this._playCustomMedia(options);
    requestAnimationFrame(() => this._renderFrame());
  }

  _renderFrame() {
    if (!this.active) {
      this.canvas.classList.remove('active');
      return;
    }

    const elapsed = performance.now() - this.startTime;
    if (elapsed > this.duration) {
      this.active = false;
      this.canvas.classList.remove('active');
      this._clearMedia();
      return;
    }

    if (this.gl && this.program) {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);

      const positionLocation = gl.getAttribLocation(this.program, 'a_position');
      gl.enableVertexAttribArray(positionLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.uniform1f(this.timeUniform, elapsed / 1000);
      gl.uniform2f(this.resolutionUniform, this.canvas.width, this.canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      // Fallback: brief CSS flash if WebGL unavailable
      this.canvas.style.background = 'radial-gradient(circle, rgba(97,197,255,0.35), transparent 60%)';
    }

    requestAnimationFrame(() => this._renderFrame());
  }
}

const spawnAnimator = new SpawnAnimator();

/**
 * Avatar instance class
 */
class AvatarInstance {
  constructor(userId, username, sprites, fadeInDuration) {
    this.userId = userId;
    this.username = username;
    this.sprites = sprites;
    this.fadeInDuration = fadeInDuration;
    
    this.element = null;
    this.currentFrame = 'idle_neutral';
    this.isActive = false;
    
    this.createElements();
  }

  /**
   * Create DOM elements for avatar
   */
  createElements() {
    // Create avatar container
    this.element = document.createElement('div');
    this.element.className = 'avatar';
    this.element.id = `avatar-${this.userId}`;
    
    // Create image element
    this.img = document.createElement('img');
    this.img.src = this.sprites.idle_neutral || '';
    this.img.alt = this.username;
    
    this.element.appendChild(this.img);
    document.getElementById('avatarContainer').appendChild(this.element);
  }

  /**
   * Show avatar with fade-in
   */
  show() {
    this.isActive = true;
    this.element.classList.add('animating-in', 'active');
    
    setTimeout(() => {
      this.element.classList.remove('animating-in');
    }, this.fadeInDuration);
  }

  /**
   * Hide avatar with fade-out
   * @param {number} fadeOutDuration - Fade out duration in ms
   */
  hide(fadeOutDuration) {
    this.isActive = false;
    this.element.classList.add('animating-out', 'fading-out');
    
    setTimeout(() => {
      this.element.remove();
    }, fadeOutDuration);
  }

  /**
   * Update displayed sprite frame
   * @param {string} frame - Frame name (idle_neutral, blink, speak_closed, etc.)
   */
  updateFrame(frame) {
    if (this.sprites[frame] && this.isActive) {
      this.currentFrame = frame;
      this.img.src = this.sprites[frame];
      // Only log in development/debug mode to avoid performance impact
      if (window.DEBUG_TALKING_HEADS) {
        console.log(`[TalkingHeads] Updated ${this.username} to frame: ${frame}`);
      }
    } else if (!this.sprites[frame]) {
      console.warn(`[TalkingHeads] Sprite not found for frame: ${frame}`);
    } else if (!this.isActive) {
      console.warn(`[TalkingHeads] Avatar ${this.username} is not active, skipping frame update`);
    }
  }

  /**
   * Stop and remove avatar
   */
  stop() {
    this.isActive = false;
    if (this.element && this.element.parentNode) {
      this.element.remove();
    }
  }
}

/**
 * Socket event handlers
 */

// Animation start event
socket.on('talkingheads:animation:start', (data) => {
  const { userId, username, sprites, fadeInDuration } = data;
  
  console.log(`[TalkingHeads] Starting animation for ${username} (${userId})`);
  console.log(`[TalkingHeads] Received sprites:`, Object.keys(sprites || {}));
  
  // Check if avatar already exists
  if (activeAvatars.has(userId)) {
    console.warn(`[TalkingHeads] Avatar already active for ${userId}`);
    return;
  }
  
  // Create new avatar instance
  const avatar = new AvatarInstance(userId, username, sprites, fadeInDuration);
  activeAvatars.set(userId, avatar);
  
  // Show avatar
  avatar.show();
  console.log(`[TalkingHeads] Avatar shown for ${username}`);
});

// Spawn animation event for new avatars
socket.on('talkingheads:avatar:spawn', (data = {}) => {
  spawnAnimator.trigger(data);
});

// Frame update event
socket.on('talkingheads:animation:frame', (data) => {
  const { userId, frame } = data;
  
  // Enable debug logging by setting window.DEBUG_TALKING_HEADS = true in console
  if (window.DEBUG_TALKING_HEADS) {
    console.log(`[TalkingHeads] Frame update for ${userId}: ${frame}`);
  }
  
  const avatar = activeAvatars.get(userId);
  if (avatar) {
    avatar.updateFrame(frame);
  } else {
    console.warn(`[TalkingHeads] No avatar found for userId ${userId}, cannot update frame`);
  }
});

// Animation end event
socket.on('talkingheads:animation:end', (data) => {
  const { userId, fadeOutDuration } = data;
  
  console.log(`[TalkingHeads] Ending animation for ${userId}`);
  
  const avatar = activeAvatars.get(userId);
  if (avatar) {
    avatar.hide(fadeOutDuration);
    
    // Remove from active avatars after fade out
    setTimeout(() => {
      activeAvatars.delete(userId);
      console.log(`[TalkingHeads] Avatar removed for ${userId}`);
    }, fadeOutDuration);
  } else {
    console.warn(`[TalkingHeads] No avatar found for userId ${userId}, cannot end animation`);
  }
});

// Animation stop event (immediate)
socket.on('talkingheads:animation:stop', (data) => {
  const { userId } = data;
  
  console.log(`Stopping animation for ${userId}`);
  
  const avatar = activeAvatars.get(userId);
  if (avatar) {
    avatar.stop();
    activeAvatars.delete(userId);
  }
});

/**
 * Connection status
 */
socket.on('connect', () => {
  console.log('[TalkingHeads] Overlay connected to server');
  console.log('[TalkingHeads] Socket ID:', socket.id);
});

socket.on('disconnect', () => {
  console.warn('[TalkingHeads] Overlay disconnected from server');
  
  // Clear all avatars on disconnect
  for (const avatar of activeAvatars.values()) {
    avatar.stop();
  }
  activeAvatars.clear();
  console.log('[TalkingHeads] All avatars cleared due to disconnect');
});

/**
 * Error handling
 */
socket.on('error', (error) => {
  console.error('[TalkingHeads] Socket error:', error);
});

/**
 * Socket connection test handler
 */
socket.on('talkingheads:test:ping', (data) => {
  console.log('[TalkingHeads] ✅ Socket test ping received!', data);
  console.log('[TalkingHeads] Connection is working correctly.');
});

// Log when overlay loads
console.log('[TalkingHeads] OBS Overlay loaded and ready');
console.log('[TalkingHeads] Waiting for socket connection...');
console.log('[TalkingHeads] To enable verbose frame logging, run: window.DEBUG_TALKING_HEADS = true');
