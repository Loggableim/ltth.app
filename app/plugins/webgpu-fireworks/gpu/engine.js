/**
 * WebGPU Fireworks orchestration layer.
 * TikTok/socket events and audio remain on the CPU. All visible particle
 * simulation and rendering is delegated to WebGPUParticleEngine.
 */
const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true';

class AudioManager {
    constructor(onStatus = null) {
        this.context = null;
        this.masterGain = null;
        this.compressor = null;
        this.buffers = new Map();
        this.urls = new Map();
        this.loading = new Map();
        this.failed = new Set();
        this.activeVoices = [];
        this.htmlPools = new Map();
        this.htmlPoolSize = 3;
        this.pendingPlaybacks = [];
        this.flushingPending = false;
        this.maxVoices = 16;
        this.enabled = true;
        this.volume = 0.7;
        this.initialized = false;
        this.status = 'loading';
        this.backend = 'none';
        this.lastPlayed = null;
        this.lastError = null;
        this.onStatus = onStatus;
        this.BASIC_LAUNCH = ['launch-basic', 'launch-basic2'];
        this.SMOOTH_LAUNCH = ['launch-smooth', 'launch-smooth2', 'launch-whistle'];
        this.TINY_WHISTLE_LAUNCH = ['combined-whistle-tiny1', 'combined-whistle-tiny2', 'combined-whistle-tiny3'];
        this.CINEMATIC_LAUNCH = ['combined-whistle-normal', 'combined-whistle-tiny4', 'combined-crackling-bang'];
        this.LAUNCH_WINDOWS = {
            'combined-whistle-tiny1': 0.88,
            'combined-whistle-tiny2': 0.88,
            'combined-whistle-tiny3': 0.88,
            'combined-whistle-tiny4': 3.12,
            'combined-whistle-normal': 3.12,
            'combined-crackling-bang': 4.55
        };
        this.AUTO_LIBRARY_DEFAULTS = {
            launch: '/plugins/webgpu-fireworks/audio/abschussgeraeusch.mp3',
            bang: '/plugins/webgpu-fireworks/audio/explosion_small1.mp3'
        };
        this.SMALL_BANG = ['explosion-small', 'explosion-alt1'];
        this.MEDIUM_BANG = ['explosion-medium', 'explosion-alt2', 'explosion-pop'];
        this.BIG_BANG = ['explosion-big', 'explosion-huge'];
        this.CRACKLE = ['crackling-medium', 'crackling-long'];
        this.CRACKLE_OFFSETS = {
            'crackling-medium': 0.9,
            'crackling-long': 0.1
        };
    }

    init() {
        this.initialized = true;
        this.createContext();
        this.updateStatus();
        void this.ensureContext(false);
    }

    createContext() {
        if (this.context) return this.context;
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return null;
        try {
            this.context = new Context({ latencyHint: 'interactive' });
            this.masterGain = this.context.createGain();
            this.compressor = this.context.createDynamicsCompressor();
            this.compressor.threshold.value = -12;
            this.compressor.knee.value = 18;
            this.compressor.ratio.value = 6;
            this.compressor.attack.value = 0.003;
            this.compressor.release.value = 0.22;
            this.masterGain.gain.value = this.volume;
            this.compressor.connect(this.masterGain);
            this.masterGain.connect(this.context.destination);
            this.context.onstatechange = () => {
                this.updateStatus();
                if (this.context?.state === 'running') void this.flushPending();
            };
        } catch (error) {
            this.lastError = error.message;
            this.context = null;
        }
        return this.context;
    }

    async ensureContext(userGesture = false) {
        if (!this.initialized) return false;
        const context = this.createContext();
        if (!context) {
            this.updateStatus();
            return false;
        }
        if (context.state === 'suspended') {
            try {
                const resume = Promise.resolve(context.resume());
                if (userGesture) await resume;
                else await Promise.race([resume, new Promise(resolve => setTimeout(resolve, 80))]);
            } catch (error) {
                this.lastError = error.message;
            }
        }
        this.updateStatus();
        const running = context.state === 'running';
        if (running) void this.flushPending();
        return running;
    }

    async preload(url, name) {
        if (!url || !name) return false;
        this.urls.set(name, url);
        this.primeHtmlPool(name, url);
        if (this.buffers.has(name)) return true;
        if (this.loading.has(name)) return this.loading.get(name);
        const task = (async () => {
            try {
                const response = await fetch(url, { cache: 'force-cache' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const bytes = await response.arrayBuffer();
                const context = this.createContext();
                if (context) {
                    const buffer = await context.decodeAudioData(bytes.slice(0));
                    this.buffers.set(name, buffer);
                }
                this.failed.delete(name);
                return true;
            } catch (error) {
                this.failed.add(name);
                this.lastError = `${name}: ${error.message}`;
                if (DEBUG) console.warn(`[WebGPU Fireworks Audio] ${this.lastError}`);
                return false;
            } finally {
                this.loading.delete(name);
                this.updateStatus();
            }
        })();
        this.loading.set(name, task);
        this.updateStatus();
        return task;
    }

    useUrl(url, role) {
        if (!url || typeof url !== 'string') return null;
        const decodedUrl = decodeURIComponent(url).toLowerCase();
        const bundledSounds = {
            '/plugins/webgpu-fireworks/audio/abschussgeraeusch.mp3': 'launch-basic',
            '/plugins/webgpu-fireworks/audio/abschussgeraeusch2.mp3': 'launch-basic2',
            '/plugins/webgpu-fireworks/audio/explosion_small1.mp3': 'explosion-small',
            '/plugins/webgpu-fireworks/audio/explosion_medium.mp3': 'explosion-medium',
            '/plugins/webgpu-fireworks/audio/explosion_big.mp3': 'explosion-big',
            '/plugins/webgpu-fireworks/audio/explosion_huge.mp3': 'explosion-huge',
            '/plugins/webgpu-fireworks/audio/crackling.mp3': 'crackling-long',
            '/plugins/webgpu-fireworks/audio/crackling2.mp3': 'crackling-medium',
            '/plugins/webgpu-fireworks/audio/woosh_abheben_mit-pfeifen_no-bang.mp3': 'launch-whistle',
            '/plugins/webgpu-fireworks/audio/woosh_abheben_crackling_bang.mp3': 'combined-crackling-bang',
            '/plugins/webgpu-fireworks/audio/woosh_abheben_mit-pfeifen_normal-bang.mp3': 'combined-whistle-normal',
            '/plugins/webgpu-fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang.mp3': 'combined-whistle-tiny1',
            '/plugins/webgpu-fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang2.mp3': 'combined-whistle-tiny2',
            '/plugins/webgpu-fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang3.mp3': 'combined-whistle-tiny3',
            '/plugins/webgpu-fireworks/audio/woosh_abheben_mit-pfeifen_tiny-bang4.mp3': 'combined-whistle-tiny4',
            '/plugins/webgpu-fireworks/audio/woosh_abheben_nocrackling_no-bang.mp3': 'launch-smooth',
            '/plugins/webgpu-fireworks/audio/woosh_abheben_nocrackling_no-bang2.mp3': 'launch-smooth2'
        };
        if (bundledSounds[decodedUrl]) return bundledSounds[decodedUrl];
        const key = `custom-${role}-${this.hash(url)}`;
        if (!this.urls.has(key)) void this.preload(url, key);
        return key;
    }

    useConfiguredUrl(url, role) {
        if (!url || url === this.AUTO_LIBRARY_DEFAULTS[role]) return null;
        return this.useUrl(url, role);
    }

    hash(value) {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index++) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    async play(name, gain = 1, priority = 1, options = {}) {
        if (!this.enabled || !name) return false;
        if (this.loading.has(name)) await this.loading.get(name);
        await this.ensureContext(false);
        const buffer = this.buffers.get(name);
        if (buffer && this.context?.state === 'running') {
            this.makeVoiceRoom(priority);
            const source = this.context.createBufferSource();
            const gainNode = this.context.createGain();
            const voice = { source, priority, startedAt: performance.now(), stopTimer: null };
            source.buffer = buffer;
            const level = Math.max(0, Math.min(2, gain));
            gainNode.gain.value = level;
            source.connect(gainNode);
            const output = options.bus === 'crackle'
                ? (this.masterGain || this.context.destination)
                : (this.compressor || this.context.destination);
            gainNode.connect(output);
            source.onended = () => { this.activeVoices = this.activeVoices.filter(item => item !== voice); };
            this.activeVoices.push(voice);
            const requestedOffset = Math.max(0, Number(options.offset) || 0);
            const offset = Math.min(requestedOffset, Math.max(0, Number(buffer.duration) - 0.02 || requestedOffset));
            source.start(0, offset);
            const maxDuration = Number(options.maxDuration);
            if (Number.isFinite(maxDuration) && maxDuration > 0) {
                const now = Number(this.context.currentTime) || 0;
                const fadeDuration = Math.max(0, Math.min(maxDuration, Number(options.fadeOutDuration) || 0.08));
                try {
                    gainNode.gain.setValueAtTime?.(level, Math.max(now, now + maxDuration - fadeDuration));
                    gainNode.gain.linearRampToValueAtTime?.(0, now + maxDuration);
                    source.stop(now + maxDuration);
                } catch (_) {}
            }
            this.backend = 'web-audio';
            this.lastPlayed = name;
            this.lastError = null;
            this.updateStatus();
            return true;
        }
        const played = await this.playHtml(name, gain, priority, options);
        if (!played && this.urls.has(name)) this.queuePlayback(name, gain, priority, options);
        return played;
    }

    async playHtml(name, gain, priority, options = {}) {
        const url = this.urls.get(name);
        if (!url || typeof Audio === 'undefined') {
            this.lastError = `Sound is not loaded: ${name}`;
            this.updateStatus();
            return false;
        }
        try {
            this.makeVoiceRoom(priority);
            const element = this.getHtmlElement(name, url);
            if (!element) return false;
            const voice = { element, priority, startedAt: performance.now(), stopTimer: null };
            element.preload = 'auto';
            element.volume = Math.max(0, Math.min(1, this.volume * gain));
            const playbackOffset = Math.max(0, Number(options.offset) || 0);
            try { element.currentTime = playbackOffset; } catch (_) {}
            const releaseVoice = () => {
                if (voice.stopTimer) clearTimeout(voice.stopTimer);
                this.activeVoices = this.activeVoices.filter(item => item !== voice);
            };
            element.onended = releaseVoice;
            this.activeVoices.push(voice);
            await element.play();
            if (playbackOffset > 0) {
                try { element.currentTime = playbackOffset; } catch (_) {}
            }
            const maxDuration = Number(options.maxDuration);
            if (Number.isFinite(maxDuration) && maxDuration > 0) {
                voice.stopTimer = setTimeout(() => {
                    try { element.pause(); } catch (_) {}
                    releaseVoice();
                }, maxDuration * 1000);
            }
            this.backend = 'html-audio';
            this.lastPlayed = name;
            this.lastError = null;
            this.updateStatus();
            return true;
        } catch (error) {
            this.lastError = error.message;
            this.status = 'locked';
            this.updateStatus();
            return false;
        }
    }

    primeHtmlPool(name, url) {
        if (typeof Audio === 'undefined' || !name || !url) return;
        const pool = this.htmlPools.get(name) || [];
        while (pool.length < this.htmlPoolSize) {
            const element = new Audio(url);
            element.preload = 'auto';
            element.src = url;
            try { element.load?.(); } catch (_) {}
            pool.push(element);
        }
        this.htmlPools.set(name, pool);
    }

    getHtmlElement(name, url) {
        this.primeHtmlPool(name, url);
        const pool = this.htmlPools.get(name) || [];
        return pool.find(element => element.paused || element.ended) || pool[0] || null;
    }

    queuePlayback(name, gain, priority, options = {}) {
        const now = Date.now();
        this.pendingPlaybacks = this.pendingPlaybacks
            .filter(item => now - item.queuedAt < 1600)
            .slice(-15);
        this.pendingPlaybacks.push({ name, gain, priority, options: { ...options }, queuedAt: now });
    }

    async flushPending() {
        if (this.flushingPending || this.context?.state !== 'running' || !this.pendingPlaybacks.length) return;
        this.flushingPending = true;
        const now = Date.now();
        const pending = this.pendingPlaybacks.splice(0).filter(item => now - item.queuedAt < 1600);
        try {
            for (const item of pending) await this.play(item.name, item.gain, item.priority, item.options);
        } finally {
            this.flushingPending = false;
        }
    }

    makeVoiceRoom(priority) {
        this.activeVoices = this.activeVoices.filter(voice => {
            const ended = voice.source?.playbackState === 3 || voice.element?.ended;
            return !ended;
        });
        if (this.activeVoices.length < this.maxVoices) return;
        const candidate = [...this.activeVoices]
            .sort((left, right) => left.priority - right.priority || left.startedAt - right.startedAt)[0];
        if (candidate && candidate.priority <= priority) {
            if (candidate.stopTimer) clearTimeout(candidate.stopTimer);
            try { candidate.source?.stop(); } catch (_) {}
            try { candidate.element?.pause(); } catch (_) {}
            this.activeVoices = this.activeVoices.filter(voice => voice !== candidate);
        }
    }

    choose(tier, combo, instant) {
        const pick = values => values[Math.floor(Math.random() * values.length)];
        const withWindow = launch => ({ launch, launchWindow: this.LAUNCH_WINDOWS[launch] || null });
        if (instant) {
            return {
                launch: null,
                launchWindow: null,
                bang: tier === 'massive' ? 'explosion-huge' : tier === 'big' ? 'explosion-big' : tier === 'medium' ? 'explosion-medium' : 'explosion-small',
                crackle: null
            };
        }
        if (combo >= 5) {
            const launch = pick([...this.BASIC_LAUNCH, ...this.TINY_WHISTLE_LAUNCH]);
            return { ...withWindow(launch), bang: pick(this.SMALL_BANG), crackle: null };
        }
        if (tier === 'massive') {
            const launch = Math.random() < 0.78 ? 'combined-crackling-bang' : pick(this.CINEMATIC_LAUNCH);
            return { ...withWindow(launch), bang: 'explosion-huge', crackle: pick(this.CRACKLE) };
        }
        if (tier === 'big') {
            const launch = Math.random() < 0.68 ? pick(this.CINEMATIC_LAUNCH) : 'launch-whistle';
            const crackles = launch === 'combined-crackling-bang' || Math.random() < 0.6;
            return { ...withWindow(launch), bang: pick(this.BIG_BANG), crackle: crackles ? pick(this.CRACKLE) : null };
        }
        if (tier === 'medium') {
            const launch = pick([...this.SMOOTH_LAUNCH, 'combined-whistle-normal', 'combined-whistle-tiny4']);
            return { ...withWindow(launch), bang: pick(this.MEDIUM_BANG), crackle: Math.random() < 0.2 ? pick(this.CRACKLE) : null };
        }
        const launch = pick([...this.BASIC_LAUNCH, ...this.TINY_WHISTLE_LAUNCH]);
        return { ...withWindow(launch), bang: pick(this.SMALL_BANG), crackle: null };
    }

    applyCrackleOverride(selection, enabled) {
        if (enabled === undefined || enabled === null) return selection;
        if (enabled === false) {
            selection.crackle = null;
            if (selection.launch === 'combined-crackling-bang') {
                selection.launch = 'launch-whistle';
                selection.launchWindow = null;
            }
            return selection;
        }
        if (!selection.crackle) selection.crackle = this.CRACKLE[Math.floor(Math.random() * this.CRACKLE.length)];
        return selection;
    }

    getTelemetry() {
        return {
            audioStatus: this.status,
            audioBackend: this.backend,
            loadedSounds: this.buffers.size,
            failedSounds: this.failed.size,
            lastPlayed: this.lastPlayed,
            lastAudioError: this.lastError
        };
    }

    updateStatus() {
        if (!this.enabled) this.status = 'disabled';
        else if (this.loading.size > 0 && this.buffers.size === 0) this.status = 'loading';
        else if (this.context?.state === 'running' && this.buffers.size > 0) this.status = 'ready-web-audio';
        else if (this.backend === 'html-audio') this.status = 'ready-html-audio';
        else if (this.buffers.size > 0 || this.urls.size > 0) this.status = 'locked';
        else if (this.failed.size > 0) this.status = 'error';
        else this.status = 'loading';
        if (typeof window !== 'undefined') window.webgpuFireworksAudioStatus = this.status;
        this.onStatus?.(this.getTelemetry());
    }

    setEnabled(enabled) { this.enabled = enabled !== false; this.updateStatus(); }
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, Number(value) || 0));
        if (this.masterGain) this.masterGain.gain.value = this.volume;
    }
    destroy() {
        for (const voice of this.activeVoices) {
            if (voice.stopTimer) clearTimeout(voice.stopTimer);
            try { voice.source?.stop(); } catch (_) {}
            try { voice.element?.pause(); } catch (_) {}
        }
        this.activeVoices.length = 0;
        for (const pool of this.htmlPools.values()) {
            for (const element of pool) {
                try { element.pause(); } catch (_) {}
                element.src = '';
            }
        }
        this.htmlPools.clear();
        this.pendingPlaybacks.length = 0;
        this.buffers.clear();
        this.urls.clear();
        this.loading.clear();
        if (this.context) this.context.onstatechange = null;
        this.context?.close().catch(() => {});
        this.context = null;
    }
}

class WebGPUFireworksEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.renderer = null;
        this.rendererStatus = { state: 'initializing', backend: 'webgpu' };
        this.audio = new AudioManager(() => {
            this.applyInteractiveMode();
            if (this.socket?.connected) this.emitStatus();
        });
        this.socket = null;
        this.running = false;
        this.animationFrame = null;
        this.lastFrameAt = performance.now();
        this.fpsWindowAt = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        this.fpsHistory = [];
        this.performanceMode = 'normal';
        this.skippedFrame = false;
        this.scheduledExplosions = [];
        this.activeShows = new Map();
        this.imageCache = new Map();
        this.isBenchmark = new URLSearchParams(window.location.search).get('benchmark') === 'true';
        this.debug = DEBUG;
        this.config = {
            renderer: 'webgpu', enabled: true, visualStyle: 'premium-hybrid', audioEnabled: true, audioVolume: 0.7,
            resolutionPreset: '1080p', orientation: 'landscape', targetFps: 60, minFps: 24,
            maxTotalParticles: 8192, trailsEnabled: true, trailLength: 8, glowEnabled: true,
            toasterMode: false, adaptiveRenderScaleEnabled: true, minRenderScale: 0.55,
            defaultColors: ['#ff0000', '#ff8800', '#ffff00'], giftPopupEnabled: true,
            giftPopupPosition: 'bottom', avatarParticleChance: 0.3,
            particleSizeRange: [4, 12], gravity: 0.1, friction: 0.98,
            windEnabled: false, windStrength: 0.02, interactiveEnabled: false,
            clickTriggerEnabled: false, adaptivePerformance: true, frameSkipEnabled: true
        };
        this.baseWidth = 1920;
        this.baseHeight = 1080;
        this.renderScale = 1;
        this.resizeHandler = () => this.resize();
        this.clickHandler = event => {
            void this.audio.ensureContext(true).then(unlocked => {
                if (!unlocked) return;
                if (DEBUG) console.debug('[WebGPU Fireworks Audio] Audio unlocked by canvas interaction');
                this.applyInteractiveMode();
                this.setStatus({ state: this.rendererStatus.state, audioStatus: 'ready' });
            });
            if (!this.config.interactiveEnabled || !this.config.clickTriggerEnabled || !this.socket?.connected) return;
            const bounds = this.canvas.getBoundingClientRect();
            this.socket.emit('webgpu-fireworks:interactive-trigger', {
                position: {
                    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
                    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)))
                },
                visualStyle: this.config.visualStyle
            });
        };
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
        this.canvas.addEventListener('pointerdown', this.clickHandler);
        this.applyInteractiveMode();
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
            this.audio.useUrl(this.config.rocketSound, 'launch');
            this.audio.useUrl(this.config.explosionSound, 'bang');
            this.resize();
            this.applyQuality();
            this.applyInteractiveMode();
        });
    }

    setStatus(status) {
        this.rendererStatus = { ...this.rendererStatus, ...status, ...this.audio.getTelemetry(), backend: 'webgpu' };
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
            ...this.audio.getTelemetry(),
            backend: 'webgpu', fps: this.fps, visualStyle: this.config.visualStyle,
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

    applyInteractiveMode() {
        if (!this.canvas) return;
        const clickTrigger = this.config.interactiveEnabled && this.config.clickTriggerEnabled;
        const audioUnlock = this.config.audioEnabled !== false && this.audio.status === 'locked';
        const pointerEvents = clickTrigger || audioUnlock ? 'auto' : 'none';
        this.canvas.style.pointerEvents = pointerEvents;
        if (this.canvas.parentElement) this.canvas.parentElement.style.pointerEvents = pointerEvents;
    }

    getStyleProfile(style = this.config.visualStyle) {
        if (style === 'realistic') {
            return { id: 'realistic', sizeScale: 0.92, glowScale: 0.72, trailScale: 1.15, turbulence: 0.1, smoke: 1 };
        }
        if (style === 'stylized-neon') {
            return { id: 'stylized-neon', sizeScale: 1.3, glowScale: 1.35, trailScale: 0.82, turbulence: 0.07, smoke: 0.15 };
        }
        return { id: 'premium-hybrid', sizeScale: 1.08, glowScale: 1, trailScale: 1, turbulence: 0.12, smoke: 0.45 };
    }

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
        const style = this.getStyleProfile();
        const configuredTrails = this.config.trailsEnabled === false ? 2 : Math.max(2, Math.min(12, this.config.trailLength || 8));
        if (this.config.toasterMode) {
            this.renderer.setQuality({ trailSamples: Math.min(3, configuredTrails), bloomEnabled: false, turbulence: 0.04, style: style.id, glowScale: 0.5 });
            return;
        }
        if (this.performanceMode === 'minimal') this.renderer.setQuality({ trailSamples: Math.min(3, configuredTrails), bloomEnabled: false, turbulence: 0.06, style: style.id, glowScale: 0.58 });
        else if (this.performanceMode === 'reduced') this.renderer.setQuality({ trailSamples: Math.min(5, configuredTrails), bloomEnabled: this.config.glowEnabled !== false, turbulence: Math.min(style.turbulence, 0.09), style: style.id, glowScale: style.glowScale * 0.78 });
        else this.renderer.setQuality({ trailSamples: configuredTrails, bloomEnabled: this.config.glowEnabled !== false, turbulence: style.turbulence, style: style.id, glowScale: style.glowScale });
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
        const visualStyle = ['premium-hybrid', 'realistic', 'stylized-neon'].includes(data.visualStyle)
            ? data.visualStyle
            : this.config.visualStyle;
        const style = this.getStyleProfile(visualStyle);
        const colors = Array.isArray(data.colors) && data.colors.length ? data.colors.slice(0, 12) : this.config.defaultColors;
        const x = Math.max(0, Math.min(1, data.position?.x ?? 0.5)) * this.baseWidth;
        const targetY = Math.max(0, Math.min(1, data.position?.y ?? 0.5)) * this.baseHeight;
        const originX = Math.max(0, Math.min(1, data.origin?.x ?? data.position?.x ?? 0.5)) * this.baseWidth;
        const originY = Math.max(0.9, Math.min(1.08, data.origin?.y ?? 1.02)) * this.baseHeight;
        if (DEBUG) console.debug('[WebGPU Fireworks] launch coordinates', JSON.stringify({
            origin: { x: originX, y: originY },
            target: { x, y: targetY },
            logicalSize: { width: this.baseWidth, height: this.baseHeight }
        }));
        const particleLimit = Math.min(Number(this.config.maxParticles) || 1000, this.config.toasterMode ? 140 : 600);
        const count = Math.max(1, Math.min(Number(data.requestedParticleCount || data.particleCount) || 50, particleLimit));
        const forceRocket = data.forceRocket === true;
        const instant = !forceRocket && combo >= 8;
        const skipRocket = !forceRocket && combo >= 5;
        const flightDuration = skipRocket ? 0 : this.calculateFlightDuration(targetY);
        const assets = await this.prepareImages(data);
        const sound = this.audio.applyCrackleOverride(
            this.audio.choose(tier, forceRocket ? 1 : combo, instant),
            data.crackleEnabled
        );
        const customLaunch = this.audio.useConfiguredUrl(data.rocketSound, 'launch');
        const customBang = this.audio.useConfiguredUrl(data.explosionSound, 'bang');
        if (customLaunch) {
            sound.launch = customLaunch;
            sound.launchWindow = null;
        }
        if (customBang) sound.bang = customBang;
        if (data.playSound !== false && sound.launch && !skipRocket) {
            const playbackOptions = sound.launchWindow
                ? { maxDuration: Math.min(flightDuration, sound.launchWindow), fadeOutDuration: 0.08 }
                : {};
            void this.audio.play(sound.launch, 0.55, 1, playbackOptions);
        }

        if (!skipRocket) {
            this.renderer.spawnRocket({
                origin: { x: originX, y: originY }, target: { x, y: targetY }, duration: flightDuration,
                color: colors[0], shape: assets.avatarTexture ? 'image' : 'rocket',
                textureIndex: assets.avatarTexture, size: assets.avatarTexture ? 18 : 8,
                gravity: 0, drag: 1, seed: data.seed, style: visualStyle,
                curve: ((Number(data.seed) || 1) % 2 === 0 ? 1 : -1) * (45 + intensity * 12)
            });
        }

        const id = data.id || `${Date.now()}-${Math.random()}`;
        this.activeShows.set(id, performance.now());
        const explosion = {
            due: performance.now() + flightDuration * 1000,
            id, x, y: targetY, shape, intensity, count, colors, assets, visualStyle, style,
            playSound: data.playSound !== false, sound, tier,
            username: data.username, coins: data.coins, combo, giftImage: data.giftImage,
            gravity: Number(data.gravity ?? this.config.gravity),
            friction: Number(data.friction ?? this.config.friction),
            wind: data.windEnabled ? Number(data.windStrength ?? this.config.windStrength) : 0,
            particleSizeRange: Array.isArray(data.particleSizeRange) ? data.particleSizeRange : this.config.particleSizeRange,
            giftPopupEnabled: data.giftPopupEnabled,
            giftPopupPosition: data.giftPopupPosition,
            despawnFadeDuration: Number(data.despawnFadeDuration ?? this.config.despawnFadeDuration)
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
        const naturalDuration = 1.15 + explosion.intensity * 0.28;
        const pressureFade = Math.max(0.25, Math.min(4, explosion.despawnFadeDuration || naturalDuration));
        const duration = this.performanceMode === 'minimal' ? Math.min(naturalDuration, pressureFade) : naturalDuration;
        const minSize = Math.max(2, Number(explosion.particleSizeRange?.[0]) || 4);
        const maxSize = Math.max(minSize, Number(explosion.particleSizeRange?.[1]) || 12);
        const configuredSize = (minSize + maxSize) * 0.5;
        const requestedScale = Math.max(0.72, Math.min(1.35, Math.sqrt(configuredSize / 8)));
        const shapeSizeProfiles = {
            burst: { base: 6, min: 4, max: 10 },
            heart: { base: 19, min: 14, max: 28 },
            star: { base: 20, min: 14, max: 28 },
            ring: { base: 18, min: 14, max: 28 },
            paws: { base: 43, min: 36, max: 56 },
            spiral: { base: 33, min: 28, max: 46 }
        };
        const sizeProfile = shapeSizeProfiles[explosion.shape] || shapeSizeProfiles.burst;
        const semanticSize = Math.max(
            sizeProfile.min,
            Math.min(sizeProfile.max, sizeProfile.base * requestedScale * explosion.style.sizeScale)
        );
        const common = {
            origin: { x: explosion.x, y: explosion.y }, intensity: explosion.intensity,
            duration, gravity: explosion.gravity * 850, drag: explosion.friction,
            wind: explosion.wind * 420, size: semanticSize,
            style: explosion.visualStyle
        };
        this.renderer.spawnExplosion({ ...common, shape: explosion.shape, colors: explosion.colors, count: baseCount });
        if (avatarCount) this.renderer.spawnExplosion({ ...common, shape: 'image', colors: ['#ffffff'], count: avatarCount, textureIndex: explosion.assets.avatarTexture, size: 18 * explosion.style.sizeScale, nativeColor: true });
        if (giftCount) this.renderer.spawnExplosion({ ...common, shape: 'image', colors: ['#ffffff'], count: giftCount, textureIndex: explosion.assets.giftTexture, size: 18 * explosion.style.sizeScale, nativeColor: true });
        if (explosion.playSound) void this.audio.play(explosion.sound.bang, explosion.tier === 'massive' ? 1 : 0.75, 3);
        if (explosion.sound.crackle) {
            const crackleDelay = explosion.tier === 'massive' ? 240 : 210;
            const crackleDuration = explosion.tier === 'massive'
                ? Math.min(1.05, Math.max(0.72, duration * 0.46))
                : Math.min(0.82, Math.max(0.56, duration * 0.38));
            setTimeout(() => {
                this.renderer.spawnCrackle({
                    origin: { x: explosion.x, y: explosion.y },
                    colors: explosion.colors,
                    intensity: explosion.intensity,
                    duration: crackleDuration,
                    gravity: explosion.gravity * 520,
                    drag: Math.min(0.988, explosion.friction),
                    wind: explosion.wind * 280,
                    style: explosion.visualStyle
                });
                if (explosion.playSound) {
                    void this.audio.play(explosion.sound.crackle, 0.5, 2, {
                        offset: this.audio.CRACKLE_OFFSETS[explosion.sound.crackle] || 0,
                        maxDuration: crackleDuration,
                        fadeOutDuration: Math.min(0.18, crackleDuration * 0.24),
                        bus: 'crackle'
                    });
                }
            }, crackleDelay);
        }
        if (explosion.username && Number(explosion.coins) > 0) this.showGiftPopup(explosion);
        setTimeout(() => this.activeShows.delete(explosion.id), Math.min(6000, 1800 + explosion.intensity * 900));
    }

    handleFinale(data = {}) {
        const intensity = Math.max(1, Math.min(5, Number(data.intensity) || 3));
        const count = Math.min(40, Math.max(1, Number(data.burstCount) || Math.round(intensity * 5)));
        const interval = Math.max(120, Number(data.burstInterval) || 300);
        const shapes = Array.isArray(data.shapes) && data.shapes.length ? data.shapes : ['burst'];
        const colors = Array.isArray(data.colors) && data.colors.length ? data.colors : this.config.defaultColors;
        const bursts = Array.isArray(data.bursts) ? data.bursts : [];
        for (let i = 0; i < count; i++) {
            const plan = bursts[i] || {
                position: { x: 0.16 + ((i * 0.61803398875) % 1) * 0.68, y: 0.18 + ((i * 0.38196601125) % 1) * 0.42 },
                origin: { x: 0.08 + ((i * 0.754877666) % 1) * 0.84, y: 1.02 },
                seed: (Number(data.seed) || Date.now()) + i * 2654435761
            };
            setTimeout(() => this.handleTrigger({
                id: `${data.id || 'finale'}-${i}`, shape: shapes[i % shapes.length], colors,
                position: plan.position, origin: plan.origin, seed: plan.seed,
                visualStyle: data.visualStyle || this.config.visualStyle,
                intensity: intensity * (0.78 + Math.random() * 0.35), particleCount: Math.round(60 * intensity),
                combo: Math.max(1, Math.round(intensity)), tier: intensity >= 4 ? 'massive' : intensity >= 3 ? 'big' : 'medium',
                forceRocket: true,
                crackleEnabled: intensity >= 4 ? i % 3 === 0 : intensity >= 3 ? i % 4 === 0 : false,
                playSound: data.playSound !== false, rocketSound: data.rocketSound, explosionSound: data.explosionSound
            }), i * interval);
        }
    }

    showGiftPopup(data) {
        if (data.giftPopupEnabled === false || this.config.giftPopupEnabled === false) return;
        const popupPosition = data.giftPopupPosition || this.config.giftPopupPosition || 'bottom';
        if (popupPosition === 'none') return;
        const popup = document.createElement('div');
        popup.className = 'gift-popup';
        popup.style.left = `${data.x / this.baseWidth * 100}%`;
        if (popupPosition === 'top') popup.style.top = '8%';
        else if (popupPosition === 'middle') popup.style.top = '48%';
        else popup.style.bottom = '8%';
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
        document.getElementById('thank-you-text').textContent = data.thankYouText || data.text || 'Danke für den Follow!';
        root.className = `follower-animation pos-${data.position || 'center'} size-${data.size || 'medium'} style-${data.style || 'gradient-purple'} entrance-${data.entrance || 'scale'}`;
        const scale = data.size === 'small' ? 0.8 : data.size === 'large' ? 1.25 : data.size === 'custom' ? Number(data.scale) || 1 : 1;
        root.style.setProperty('--follower-scale', String(Math.max(0.5, Math.min(2, scale))));
        const content = root.querySelector('.follower-content');
        if (content && data.size === 'custom') content.style.transform = `scale(${Math.max(0.5, Math.min(2, scale))})`;
        else if (content) content.style.transform = '';
        const avatar = document.getElementById('follower-avatar');
        if (data.profilePictureUrl) { avatar.src = data.profilePictureUrl; avatar.classList.add('show'); }
        else avatar.classList.remove('show');
        root.classList.add('show');
        setTimeout(() => root.classList.remove('show'), Number(data.duration) || 3000);
    }

    adaptQuality() {
        if (this.config.adaptivePerformance === false) return;
        const average = this.fpsHistory.length ? this.fpsHistory.reduce((sum, fps) => sum + fps, 0) / this.fpsHistory.length : this.fps;
        const minimumFps = Math.max(Number(this.config.minFps) || 24, Number(this.config.minTargetFps) || 24);
        const nextMode = average < minimumFps ? 'minimal' : average < (this.config.targetFps || 60) * 0.82 ? 'reduced' : 'normal';
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
        const shouldSkip = this.config.frameSkipEnabled !== false && this.performanceMode === 'minimal' && (this.skippedFrame = !this.skippedFrame);
        if (!shouldSkip) this.renderer?.render(delta, now / 1000);
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
        this.canvas?.removeEventListener('pointerdown', this.clickHandler);
        this.socket?.disconnect();
        this.renderer?.destroy();
        this.audio.destroy();
        this.scheduledExplosions.length = 0;
        this.activeShows.clear();
        this.imageCache.clear();
    }
}

let engine = null;
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', async () => {
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
        ['woosh_abheben_crackling_bang.mp3', 'combined-crackling-bang'],
        ['woosh_abheben_mit-pfeifen_normal-bang.mp3', 'combined-whistle-normal'],
        ['woosh_abheben_mit-pfeifen_tiny-bang.mp3', 'combined-whistle-tiny1'],
        ['woosh_abheben_mit-pfeifen_tiny-bang2.mp3', 'combined-whistle-tiny2'],
        ['woosh_abheben_mit-pfeifen_tiny-bang3.mp3', 'combined-whistle-tiny3'],
        ['woosh_abheben_mit-pfeifen_tiny-bang4.mp3', 'combined-whistle-tiny4'],
        ['woosh_abheben_nocrackling_no-bang.mp3', 'launch-smooth'], ['woosh_abheben_nocrackling_no-bang2.mp3', 'launch-smooth2']
    ];
    void Promise.all(sounds.map(([file, name]) => engine.audio.preload(`/plugins/webgpu-fireworks/audio/${file}`, name)))
        .then(() => engine.audio.ensureContext(false));

    const unlock = async () => {
        if (!await engine.audio.ensureContext(true)) {
            if (DEBUG) console.warn('[WebGPU Fireworks Audio] Browser interaction did not unlock audio');
            return;
        }
        if (DEBUG) console.debug('[WebGPU Fireworks Audio] Audio unlocked by browser interaction');
        for (const type of ['pointerdown', 'click', 'keydown', 'touchstart']) document.removeEventListener(type, unlock, true);
        engine.applyInteractiveMode();
        engine.setStatus({ state: engine.rendererStatus.state, audioStatus: 'ready' });
    };
    for (const type of ['pointerdown', 'click', 'keydown', 'touchstart']) document.addEventListener(type, unlock, { passive: true, capture: true });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void engine.audio.ensureContext(false);
    });
    document.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'd') engine.toggleDebug(); });
});

if (typeof window !== 'undefined') window.addEventListener('pagehide', () => engine?.destroy());

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioManager, WebGPUFireworksEngine };
}
