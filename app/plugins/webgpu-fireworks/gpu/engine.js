/**
 * WebGPU Fireworks orchestration layer.
 * TikTok/socket events and audio remain on the CPU. All visible particle
 * simulation and rendering is delegated to WebGPUParticleEngine.
 */
const DEBUG = new URLSearchParams(window.location.search).get('debug') === 'true';

class AudioManager {
    constructor() {
        this.context = null;
        this.buffers = new Map();
        this.pending = new Map();
        this.enabled = true;
        this.volume = 0.7;
        this.initialized = false;
        this.status = 'locked';
        this.BASIC_LAUNCH = ['launch-basic', 'launch-basic2'];
        this.SMOOTH_LAUNCH = ['launch-smooth', 'launch-smooth2', 'launch-whistle'];
        this.SMALL_BANG = ['explosion-small', 'explosion-alt1'];
        this.MEDIUM_BANG = ['explosion-medium', 'explosion-alt2', 'explosion-pop'];
        this.BIG_BANG = ['explosion-big', 'explosion-huge'];
        this.CRACKLE = ['crackling-medium', 'crackling-long'];
    }

    init() {
        this.initialized = true;
        window.webgpuFireworksAudioStatus = 'locked';
        this.ensureContext();
    }

    async ensureContext() {
        if (!this.initialized) return false;
        try {
            if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
            if (this.context.state === 'suspended') await this.context.resume();
            if (this.context.state !== 'running') {
                this.status = 'locked';
                window.webgpuFireworksAudioStatus = this.status;
                return false;
            }
            this.status = 'ready';
            window.webgpuFireworksAudioStatus = this.status;
            const pending = [...this.pending.entries()];
            this.pending.clear();
            await Promise.all(pending.map(([name, url]) => this.preload(url, name)));
            return true;
        } catch (error) {
            this.status = 'blocked';
            window.webgpuFireworksAudioStatus = this.status;
            if (DEBUG) console.warn('[WebGPU Fireworks Audio]', error.message);
            return false;
        }
    }

    async preload(url, name) {
        if (!this.context || this.context.state !== 'running') {
            this.pending.set(name, url);
            return;
        }
        if (this.buffers.has(name)) return;
        try {
            const response = await fetch(url, { cache: 'force-cache' });
            if (!response.ok) return;
            const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
            this.buffers.set(name, buffer);
        } catch (error) {
            if (DEBUG) console.warn(`[WebGPU Fireworks Audio] ${name}: ${error.message}`);
        }
    }

    async play(name, gain = 1) {
        if (!this.enabled || !name) return false;
        if (!await this.ensureContext()) return false;
        const buffer = this.buffers.get(name);
        if (!buffer) return false;
        const source = this.context.createBufferSource();
        const gainNode = this.context.createGain();
        source.buffer = buffer;
        gainNode.gain.value = Math.max(0, Math.min(2, this.volume * gain));
        source.connect(gainNode);
        gainNode.connect(this.context.destination);
        source.start();
        return true;
    }

    choose(tier, combo, instant) {
        const pick = values => values[Math.floor(Math.random() * values.length)];
        if (instant) {
            return {
                launch: null,
                bang: tier === 'massive' ? 'explosion-huge' : tier === 'big' ? 'explosion-big' : tier === 'medium' ? 'explosion-medium' : 'explosion-small',
                crackle: null
            };
        }
        if (combo >= 5) return { launch: pick(this.BASIC_LAUNCH), bang: pick(this.SMALL_BANG), crackle: null };
        if (tier === 'massive') return { launch: 'launch-whistle', bang: 'explosion-huge', crackle: pick(this.CRACKLE) };
        if (tier === 'big') return { launch: 'launch-whistle', bang: pick(this.BIG_BANG), crackle: Math.random() < 0.5 ? pick(this.CRACKLE) : null };
        if (tier === 'medium') return { launch: pick(this.SMOOTH_LAUNCH), bang: pick(this.MEDIUM_BANG), crackle: null };
        return { launch: pick(this.BASIC_LAUNCH), bang: pick(this.SMALL_BANG), crackle: null };
    }

    setEnabled(enabled) { this.enabled = enabled !== false; }
    setVolume(value) { this.volume = Math.max(0, Math.min(1, Number(value) || 0)); }
    destroy() { this.buffers.clear(); this.pending.clear(); this.context?.close().catch(() => {}); this.context = null; }
}

class WebGPUFireworksEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.renderer = null;
        this.rendererStatus = { state: 'initializing', backend: 'webgpu' };
        this.audio = new AudioManager();
        this.socket = null;
        this.running = false;
        this.animationFrame = null;
        this.lastFrameAt = performance.now();
        this.fpsWindowAt = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        this.fpsHistory = [];
        this.performanceMode = 'normal';
        this.scheduledExplosions = [];
        this.activeShows = new Map();
        this.imageCache = new Map();
        this.isBenchmark = new URLSearchParams(window.location.search).get('benchmark') === 'true';
        this.debug = DEBUG;
        this.config = {
            renderer: 'webgpu', enabled: true, audioEnabled: true, audioVolume: 0.7,
            resolutionPreset: '1080p', orientation: 'landscape', targetFps: 60, minFps: 24,
            maxTotalParticles: 8192, trailsEnabled: true, trailLength: 8, glowEnabled: true,
            toasterMode: false, adaptiveRenderScaleEnabled: true, minRenderScale: 0.55,
            defaultColors: ['#ff0000', '#ff8800', '#ffff00'], giftPopupEnabled: true,
            giftPopupPosition: 'bottom', avatarParticleChance: 0.3
        };
        this.baseWidth = 1920;
        this.baseHeight = 1080;
        this.renderScale = 1;
        this.resizeHandler = () => this.resize();
    }

    async init() {
        if (!this.canvas || typeof WebGPUParticleEngine === 'undefined') {
            this.setStatus({ state: 'error', reason: 'WebGPU engine script or canvas is missing', backend: 'webgpu' });
            return false;
        }
        this.audio.init();
        this.connectSocket();
        this.resize();
        this.renderer = new WebGPUParticleEngine(this.canvas, {
            maxParticles: this.config.maxTotalParticles,
            trailSamples: this.config.trailLength,
            bloomEnabled: this.config.glowEnabled,
            onStatus: status => this.setStatus(status)
        });
        const ready = await this.renderer.init();
        if (!ready) return false;
        this.renderer.setLogicalSize(this.baseWidth, this.baseHeight);
        this.applyQuality();
        window.addEventListener('resize', this.resizeHandler);
        this.running = true;
        this.lastFrameAt = performance.now();
        this.render();
        return true;
    }

    connectSocket() {
        this.socket = io({ transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1000 });
        this.socket.on('connect', () => {
            this.socket.emit('webgpu-fireworks:register-overlay', {
                benchmark: this.isBenchmark, visible: document.visibilityState !== 'hidden', backend: 'webgpu'
            });
            this.emitStatus();
            this.audio.ensureContext();
        });
        this.socket.on('webgpu-fireworks:trigger', data => this.handleTrigger(data));
        this.socket.on('webgpu-fireworks:finale', data => this.handleFinale(data));
        this.socket.on('webgpu-fireworks:follower-animation', data => this.showFollowerAnimation(data));
        this.socket.on('webgpu-fireworks:get-active-count', () => {
            const metrics = this.renderer?.getMetrics() || {};
            this.socket.emit('webgpu-fireworks:active-count-response', {
                count: this.activeShows.size, particles: metrics.activeParticles || 0
            });
        });
        this.socket.on('webgpu-fireworks:config-update', data => {
            if (!data || !data.config) return;
            this.config = { ...this.config, ...data.config, renderer: 'webgpu' };
            this.audio.setEnabled(this.config.audioEnabled);
            this.audio.setVolume(this.config.audioVolume);
            this.resize();
            this.applyQuality();
        });
    }

    setStatus(status) {
        this.rendererStatus = { ...this.rendererStatus, ...status, backend: 'webgpu', audioStatus: this.audio.status };
        if ((status.state === 'initializing' || status.state === 'ready') && !Object.prototype.hasOwnProperty.call(status, 'reason')) {
            delete this.rendererStatus.reason;
        }
        this.emitStatus();
        this.updateDebugPanel();
        if ((this.debug || this.isBenchmark) && status.state && status.state !== 'ready') this.showDiagnostic(status);
        else this.hideDiagnostic();
    }

    emitStatus() {
        if (!this.socket?.connected) return;
        this.socket.emit('webgpu-fireworks:renderer-status', {
            ...this.rendererStatus,
            backend: 'webgpu', fps: this.fps, audioStatus: this.audio.status,
            visible: document.visibilityState !== 'hidden', benchmark: this.isBenchmark,
            timestamp: Date.now()
        });
    }

    showDiagnostic(status) {
        let element = document.getElementById('webgpu-diagnostic');
        if (!element) {
            element = document.createElement('div');
            element.id = 'webgpu-diagnostic';
            element.style.cssText = 'position:fixed;left:16px;bottom:16px;max-width:620px;padding:14px 18px;border:2px solid #22d3ee;background:rgba(8,47,73,.92);color:white;font:600 16px Segoe UI,sans-serif;z-index:10000;border-radius:10px';
            document.body.appendChild(element);
        }
        element.textContent = `WebGPU Fireworks: ${status.state}${status.reason ? ` - ${status.reason}` : ''}`;
    }

    hideDiagnostic() { document.getElementById('webgpu-diagnostic')?.remove(); }

    getResolution() {
        const sizes = { '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '4k': [3840, 2160] };
        let [width, height] = sizes[this.config.resolutionPreset] || sizes['1080p'];
        if (this.config.orientation === 'portrait') [width, height] = [height, width];
        return { width, height };
    }

    resize() {
        const size = this.getResolution();
        this.baseWidth = size.width;
        this.baseHeight = size.height;
        const toasterScale = this.config.toasterMode ? 0.65 : 1;
        const scale = this.config.adaptiveRenderScaleEnabled === false ? 1 : Math.max(this.config.minRenderScale || 0.55, Math.min(toasterScale, this.renderScale));
        const width = Math.max(320, Math.round(size.width * scale));
        const height = Math.max(180, Math.round(size.height * scale));
        this.canvas.style.width = this.config.orientation === 'portrait' ? 'auto' : '100%';
        this.canvas.style.height = '100%';
        this.renderer?.resize(width, height);
        this.renderer?.setLogicalSize(size.width, size.height);
    }

    applyQuality() {
        if (!this.renderer) return;
        if (this.config.toasterMode) {
            this.renderer.setQuality({ trailSamples: 3, bloomEnabled: false, turbulence: 0.04 });
            return;
        }
        if (this.performanceMode === 'minimal') this.renderer.setQuality({ trailSamples: 3, bloomEnabled: false, turbulence: 0.06 });
        else if (this.performanceMode === 'reduced') this.renderer.setQuality({ trailSamples: 5, bloomEnabled: this.config.glowEnabled !== false, turbulence: 0.09 });
        else this.renderer.setQuality({ trailSamples: Math.max(2, Math.min(12, this.config.trailLength || 8)), bloomEnabled: this.config.glowEnabled !== false, turbulence: 0.12 });
    }

    calculateFlightDuration(targetY) {
        const travel = Math.max(0, Math.min(1, (this.baseHeight - targetY) / this.baseHeight));
        return 0.55 + travel * 1.25;
    }

    async handleTrigger(data = {}) {
        if (!this.renderer?.initialized || this.rendererStatus.state !== 'ready') return;
        const shape = ['burst', 'heart', 'paws', 'star', 'ring', 'spiral'].includes(data.shape) ? data.shape : 'burst';
        const intensity = Math.max(0.1, Math.min(5, Number(data.intensity) || 1));
        const combo = Math.max(1, Number(data.combo) || 1);
        const tier = ['small', 'medium', 'big', 'massive'].includes(data.tier) ? data.tier : 'medium';
        const colors = Array.isArray(data.colors) && data.colors.length ? data.colors.slice(0, 12) : this.config.defaultColors;
        const x = Math.max(0, Math.min(1, data.position?.x ?? 0.5)) * this.baseWidth;
        const targetY = Math.max(0, Math.min(1, data.position?.y ?? 0.5)) * this.baseHeight;
        const count = Math.max(1, Math.min(Number(data.requestedParticleCount || data.particleCount) || 50, this.config.toasterMode ? 90 : 500));
        const instant = combo >= 8;
        const skipRocket = combo >= 5;
        const flightDuration = skipRocket ? 0 : this.calculateFlightDuration(targetY);
        const assets = await this.prepareImages(data);
        const sound = this.audio.choose(tier, combo, instant);
        if (data.playSound !== false && sound.launch && !skipRocket) this.audio.play(sound.launch, 0.55);

        if (!skipRocket) {
            this.renderer.spawnRocket({
                origin: { x, y: this.baseHeight }, target: { x, y: targetY }, duration: flightDuration,
                color: colors[0], shape: assets.avatarTexture ? 'image' : 'rocket',
                textureIndex: assets.avatarTexture, size: assets.avatarTexture ? 14 : 7, gravity: 0, drag: 1
            });
        }

        const id = data.id || `${Date.now()}-${Math.random()}`;
        this.activeShows.set(id, performance.now());
        const explosion = {
            due: performance.now() + flightDuration * 1000,
            id, x, y: targetY, shape, intensity, count, colors, assets,
            playSound: data.playSound !== false, sound, tier,
            username: data.username, coins: data.coins, combo, giftImage: data.giftImage
        };
        this.scheduledExplosions.push(explosion);
        this.scheduledExplosions.sort((a, b) => a.due - b.due);
    }

    async prepareImages(data) {
        const result = { giftTexture: 0, avatarTexture: 0, avatarChance: Math.max(0, Math.min(1, Number(data.avatarParticleChance ?? this.config.avatarParticleChance ?? 0.3))) };
        if (data.giftImage) {
            const image = await this.loadImage(data.giftImage);
            if (image) result.giftTexture = await this.renderer.uploadImage(`gift:${data.giftImage}`, image);
        }
        if (data.userAvatar) {
            const image = await this.loadImage(data.userAvatar);
            if (image) result.avatarTexture = await this.renderer.uploadImage(`avatar:${data.userAvatar}`, image);
        }
        return result;
    }

    async loadImage(url) {
        if (!url || /^(javascript|data|vbscript|file|about):/i.test(url)) return null;
        if (this.imageCache.has(url)) return this.imageCache.get(url);
        const promise = new Promise(resolve => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = url;
        });
        this.imageCache.set(url, promise);
        return promise;
    }

    processExplosion(explosion) {
        const shapeSpecific = explosion.shape !== 'burst';
        let baseCount = explosion.count;
        let avatarCount = 0;
        let giftCount = 0;
        if (!shapeSpecific && explosion.assets.avatarTexture) avatarCount = Math.round(baseCount * explosion.assets.avatarChance);
        if (!shapeSpecific && explosion.assets.giftTexture) giftCount = Math.round((baseCount - avatarCount) * 0.45);
        baseCount = Math.max(1, baseCount - avatarCount - giftCount);
        const common = { origin: { x: explosion.x, y: explosion.y }, intensity: explosion.intensity, duration: 0.9 + explosion.intensity * 0.24, gravity: 85, drag: 0.985, size: 5.5 };
        this.renderer.spawnExplosion({ ...common, shape: explosion.shape, colors: explosion.colors, count: baseCount });
        if (avatarCount) this.renderer.spawnExplosion({ ...common, shape: 'image', color: explosion.colors[0], colors: [explosion.colors[0]], count: avatarCount, textureIndex: explosion.assets.avatarTexture, size: 9 });
        if (giftCount) this.renderer.spawnExplosion({ ...common, shape: 'image', color: explosion.colors[1] || explosion.colors[0], colors: [explosion.colors[1] || explosion.colors[0]], count: giftCount, textureIndex: explosion.assets.giftTexture, size: 9 });
        if (explosion.playSound) {
            this.audio.play(explosion.sound.bang, explosion.tier === 'massive' ? 1 : 0.75);
            if (explosion.sound.crackle) this.audio.play(explosion.sound.crackle, 0.35);
        }
        if (explosion.username && Number(explosion.coins) > 0) this.showGiftPopup(explosion);
        setTimeout(() => this.activeShows.delete(explosion.id), Math.min(6000, 1800 + explosion.intensity * 900));
    }

    handleFinale(data = {}) {
        const intensity = Math.max(1, Math.min(5, Number(data.intensity) || 3));
        const count = Math.min(18, Math.max(1, Number(data.burstCount) || Math.round(intensity * 5)));
        const interval = Math.max(120, Number(data.burstInterval) || 300);
        const shapes = Array.isArray(data.shapes) && data.shapes.length ? data.shapes : ['burst'];
        const colors = Array.isArray(data.colors) && data.colors.length ? data.colors : this.config.defaultColors;
        for (let i = 0; i < count; i++) {
            setTimeout(() => this.handleTrigger({
                id: `${data.id || 'finale'}-${i}`, shape: shapes[i % shapes.length], colors,
                position: { x: 0.16 + Math.random() * 0.68, y: 0.18 + Math.random() * 0.42 },
                intensity: intensity * (0.78 + Math.random() * 0.35), particleCount: Math.round(60 * intensity),
                combo: Math.max(1, Math.round(intensity)), tier: intensity >= 4 ? 'massive' : intensity >= 3 ? 'big' : 'medium',
                playSound: data.playSound !== false
            }), i * interval);
        }
    }

    showGiftPopup(data) {
        if (this.config.giftPopupEnabled === false) return;
        const popup = document.createElement('div');
        popup.className = 'gift-popup';
        popup.style.left = `${data.x / this.baseWidth * 100}%`;
        popup.style.bottom = '8%';
        if (data.giftImage) {
            const image = document.createElement('img');
            image.src = data.giftImage; image.alt = ''; image.style.cssText = 'width:32px;height:32px;object-fit:contain';
            popup.appendChild(image);
        }
        const label = document.createElement('span');
        label.textContent = `${data.username}: ${data.coins} coins${data.combo > 1 ? ` · ${data.combo}x` : ''}`;
        popup.appendChild(label);
        document.getElementById('fireworks-container')?.appendChild(popup);
        setTimeout(() => popup.remove(), 2500);
    }

    showFollowerAnimation(data = {}) {
        const root = document.getElementById('follower-animation');
        if (!root) return;
        document.getElementById('follower-username').textContent = data.username || '';
        document.getElementById('thank-you-text').textContent = data.text || 'Danke für den Follow!';
        const avatar = document.getElementById('follower-avatar');
        if (data.profilePictureUrl) { avatar.src = data.profilePictureUrl; avatar.classList.add('show'); }
        else avatar.classList.remove('show');
        root.classList.add('show');
        setTimeout(() => root.classList.remove('show'), Number(data.duration) || 3000);
    }

    adaptQuality() {
        const average = this.fpsHistory.length ? this.fpsHistory.reduce((sum, fps) => sum + fps, 0) / this.fpsHistory.length : this.fps;
        const nextMode = average < (this.config.minFps || 24) ? 'minimal' : average < (this.config.targetFps || 60) * 0.82 ? 'reduced' : 'normal';
        if (nextMode === this.performanceMode) return;
        this.performanceMode = nextMode;
        if (this.config.adaptiveRenderScaleEnabled !== false) {
            this.renderScale = nextMode === 'minimal' ? Math.max(this.config.minRenderScale || 0.55, 0.65) : nextMode === 'reduced' ? 0.82 : 1;
            this.resize();
        }
        this.applyQuality();
    }

    render() {
        if (!this.running) return;
        const now = performance.now();
        const delta = Math.min(0.05, Math.max(0.001, (now - this.lastFrameAt) / 1000));
        this.lastFrameAt = now;
        while (this.scheduledExplosions.length && this.scheduledExplosions[0].due <= now) this.processExplosion(this.scheduledExplosions.shift());
        this.renderer?.render(delta, now / 1000);
        this.frameCount++;
        if (now - this.fpsWindowAt >= 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (now - this.fpsWindowAt));
            this.frameCount = 0;
            this.fpsWindowAt = now;
            this.fpsHistory.push(this.fps);
            if (this.fpsHistory.length > 5) this.fpsHistory.shift();
            if (!this.isBenchmark) this.adaptQuality();
            this.updateDebugPanel();
            this.socket?.emit('webgpu-fireworks:fps-update', { fps: this.fps, benchmark: this.isBenchmark, visible: document.visibilityState !== 'hidden', timestamp: Date.now() });
            this.emitStatus();
        }
        this.animationFrame = requestAnimationFrame(() => this.render());
    }

    updateDebugPanel() {
        const metrics = this.renderer?.getMetrics() || {};
        const fps = document.getElementById('fps');
        const particles = document.getElementById('particle-count');
        const renderer = document.getElementById('renderer-type');
        if (fps) fps.textContent = this.fps;
        if (particles) particles.textContent = metrics.activeParticles || 0;
        if (renderer) renderer.textContent = `WEBGPU · ${this.rendererStatus.state || 'initializing'} · ${this.performanceMode}`;
        document.getElementById('debug-panel')?.classList.toggle('visible', this.debug);
    }

    toggleDebug() { this.debug = !this.debug; this.updateDebugPanel(); }

    destroy() {
        this.running = false;
        if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
        window.removeEventListener('resize', this.resizeHandler);
        this.socket?.disconnect();
        this.renderer?.destroy();
        this.audio.destroy();
        this.scheduledExplosions.length = 0;
        this.activeShows.clear();
        this.imageCache.clear();
    }
}

let engine = null;
document.addEventListener('DOMContentLoaded', async () => {
    engine = new WebGPUFireworksEngine('fireworks-canvas');
    window.fireworksEngineInstance = engine;
    await engine.init();

    const sounds = [
        ['abschussgeraeusch.mp3', 'launch-basic'], ['abschussgeraeusch2.mp3', 'launch-basic2'],
        ['explosion_small1.mp3', 'explosion-small'], ['explosion_medium.mp3', 'explosion-medium'],
        ['explosion2.mp3', 'explosion-alt1'], ['explosion3.mp3', 'explosion-alt2'],
        ['explosion_big.mp3', 'explosion-big'], ['explosion_huge.mp3', 'explosion-huge'],
        ['explosion%20Pop%2CSharp%2C.mp3', 'explosion-pop'], ['crackling.mp3', 'crackling-long'],
        ['crackling2.mp3', 'crackling-medium'], ['woosh_abheben_mit-pfeifen_no-bang.mp3', 'launch-whistle'],
        ['woosh_abheben_nocrackling_no-bang.mp3', 'launch-smooth'], ['woosh_abheben_nocrackling_no-bang2.mp3', 'launch-smooth2']
    ];
    sounds.forEach(([file, name]) => engine.audio.preload(`/plugins/webgpu-fireworks/audio/${file}`, name));

    const unlock = async () => {
        if (!await engine.audio.ensureContext()) return;
        for (const type of ['pointerdown', 'click', 'keydown', 'touchstart']) document.removeEventListener(type, unlock);
        engine.setStatus({ state: engine.rendererStatus.state, audioStatus: 'ready' });
    };
    for (const type of ['pointerdown', 'click', 'keydown', 'touchstart']) document.addEventListener(type, unlock, { passive: true });
    document.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'd') engine.toggleDebug(); });
});

window.addEventListener('pagehide', () => engine?.destroy());
