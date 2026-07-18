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
        this.busNodes = { launch: null, bang: null, crackle: null };
        this.analyser = null;
        this.buffers = new Map();
        this.urls = new Map();
        this.loading = new Map();
        this.failed = new Set();
        this.activeVoices = [];
        this.htmlPools = new Map();
        this.htmlPoolSize = 4;
        this.htmlFadeTimers = new Set();
        this.pendingPlaybacks = [];
        this.flushingPending = false;
        this.maxVoices = 18;
        this.voiceBudgets = { launch: 4, bang: 8, crackle: 6 };
        this.limiterCeiling = 0.891250938; // -1 dBFS
        this.evictions = 0;
        this.missedEvents = 0;
        this.timelineEvents = [];
        this.audioPeak = 0;
        this.clockOffsetMs = 0;
        this.clockInitialized = false;
        this.crackleVolume = 0.75;
        this.crackleState = 'idle';
        this.lastAudioProfile = null;
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
        this.CUE_MANIFEST = {
            'launch-basic': { file: 'abschussgeraeusch.mp3', role: 'launch', trimStart: 0, usableEnd: 0.8, gain: 0.68, fadeOut: 0.06 },
            'launch-basic2': { file: 'abschussgeraeusch2.mp3', role: 'launch', trimStart: 0, usableEnd: 0.6, gain: 0.64, fadeOut: 0.06 },
            'launch-smooth': { file: 'woosh_abheben_nocrackling_no-bang.mp3', role: 'launch', trimStart: 0, usableEnd: 1.5, gain: 0.62, fadeOut: 0.06 },
            'launch-smooth2': { file: 'woosh_abheben_nocrackling_no-bang2.mp3', role: 'launch', trimStart: 0, usableEnd: 1.7, gain: 0.62, fadeOut: 0.06 },
            'launch-whistle': { file: 'woosh_abheben_mit-pfeifen_no-bang.mp3', role: 'launch', trimStart: 0, usableEnd: 1.3, gain: 0.58, fadeOut: 0.06 },
            'combined-whistle-tiny1': { file: 'woosh_abheben_mit-pfeifen_tiny-bang.mp3', role: 'launch', trimStart: 0, usableEnd: 0.84, embeddedBangAt: 0.88, gain: 0.58, fadeOut: 0.06 },
            'combined-whistle-tiny2': { file: 'woosh_abheben_mit-pfeifen_tiny-bang2.mp3', role: 'launch', trimStart: 0, usableEnd: 0.84, embeddedBangAt: 0.88, gain: 0.58, fadeOut: 0.06 },
            'combined-whistle-tiny3': { file: 'woosh_abheben_mit-pfeifen_tiny-bang3.mp3', role: 'launch', trimStart: 0, usableEnd: 0.84, embeddedBangAt: 0.88, gain: 0.58, fadeOut: 0.06 },
            'combined-whistle-tiny4': { file: 'woosh_abheben_mit-pfeifen_tiny-bang4.mp3', role: 'launch', trimStart: 0, usableEnd: 3.08, embeddedBangAt: 3.12, gain: 0.55, fadeOut: 0.06 },
            'combined-whistle-normal': { file: 'woosh_abheben_mit-pfeifen_normal-bang.mp3', role: 'launch', trimStart: 0, usableEnd: 3.08, embeddedBangAt: 3.12, gain: 0.55, fadeOut: 0.06 },
            'combined-crackling-bang': { file: 'woosh_abheben_crackling_bang.mp3', role: 'launch', trimStart: 0, usableEnd: 4.51, embeddedBangAt: 4.55, gain: 0.52, fadeOut: 0.06, crackleLaunch: true },
            'explosion-small': { file: 'explosion_small1.mp3', role: 'bang', trimStart: 0, usableEnd: 0.7, gain: 0.82, fadeOut: 0.1, maxDuration: 0.7 },
            'explosion-alt1': { file: 'explosion2.mp3', role: 'bang', trimStart: 0, usableEnd: 0.7, gain: 0.78, fadeOut: 0.1, maxDuration: 0.7 },
            'explosion-medium': { file: 'explosion_medium.mp3', role: 'bang', trimStart: 0, usableEnd: 0.9, gain: 0.86, fadeOut: 0.1, maxDuration: 0.9 },
            'explosion-alt2': { file: 'explosion3.mp3', role: 'bang', trimStart: 0, usableEnd: 0.9, gain: 0.82, fadeOut: 0.1, maxDuration: 0.9 },
            'explosion-pop': { file: 'explosion%20Pop%2CSharp%2C.mp3', role: 'bang', trimStart: 0, usableEnd: 0.9, gain: 0.78, fadeOut: 0.1, maxDuration: 0.9 },
            'explosion-big': { file: 'explosion_big.mp3', role: 'bang', trimStart: 0, usableEnd: 1.2, gain: 0.9, fadeOut: 0.1, maxDuration: 1.2 },
            'explosion-huge': { file: 'explosion_huge.mp3', role: 'bang', trimStart: 0, usableEnd: 1.5, gain: 0.92, fadeOut: 0.1, maxDuration: 1.5 },
            'crackling-medium': { file: 'crackling2.mp3', role: 'crackle', trimStart: 0.9, usableEnd: 1.55, gain: 0.66, fadeOut: 0.13, maxDuration: 0.65, profile: 'short' },
            'crackling-long': { file: 'crackling.mp3', role: 'crackle', trimStart: 0.1, usableEnd: 1.1, gain: 0.62, fadeOut: 0.16, maxDuration: 1, profile: 'long' }
        };
        for (const cue of Object.values(this.CUE_MANIFEST)) cue.url = `/plugins/webgpu-fireworks/audio/${cue.file}`;
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
            this.compressor.threshold.value = -1;
            this.compressor.knee.value = 0;
            this.compressor.ratio.value = 20;
            this.compressor.attack.value = 0.001;
            this.compressor.release.value = 0.12;
            this.masterGain.gain.value = this.volume * this.limiterCeiling;
            for (const bus of Object.keys(this.busNodes)) {
                this.busNodes[bus] = this.context.createGain();
                this.busNodes[bus].gain.value = 1;
                this.busNodes[bus].connect(this.compressor);
            }
            if (typeof this.context.createAnalyser === 'function') {
                this.analyser = this.context.createAnalyser();
                this.analyser.fftSize = 256;
                this.compressor.connect(this.masterGain);
                this.masterGain.connect(this.analyser);
                this.analyser.connect(this.context.destination);
            } else {
                this.compressor.connect(this.masterGain);
                this.masterGain.connect(this.context.destination);
            }
            this.syncClock(typeof performance !== 'undefined' ? performance.now() : Date.now());
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
                else await Promise.race([resume, new Promise(resolve => setTimeout(resolve, 32))]);
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

    syncClock(performanceMs) {
        if (!this.context) return;
        const measured = (Number(this.context.currentTime) || 0) * 1000 - Number(performanceMs || 0);
        this.clockOffsetMs = this.clockInitialized ? this.clockOffsetMs * 0.9 + measured * 0.1 : measured;
        this.clockInitialized = true;
        this.samplePeak();
    }

    performanceToAudioTime(performanceMs) {
        if (!this.context || !Number.isFinite(Number(performanceMs))) return 0;
        return Math.max(Number(this.context.currentTime) || 0, (Number(performanceMs) + this.clockOffsetMs) / 1000);
    }

    samplePeak() {
        if (!this.analyser || typeof this.analyser.getFloatTimeDomainData !== 'function') return this.audioPeak;
        const samples = new Float32Array(this.analyser.fftSize || 256);
        this.analyser.getFloatTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        this.audioPeak = Math.max(peak, this.audioPeak * 0.86);
        return this.audioPeak;
    }

    recordTimelineEvent(effectId, type, plannedAt, actualAt, state = 'played') {
        const planned = Number(plannedAt) || Number(actualAt) || (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const actual = Number(actualAt) || planned;
        this.timelineEvents.push({
            effectId: effectId || null,
            type: type || 'audio',
            plannedAt: Math.round(planned * 1000) / 1000,
            actualAt: Math.round(actual * 1000) / 1000,
            driftMs: Math.round((actual - planned) * 1000) / 1000,
            state
        });
        if (this.timelineEvents.length > 32) this.timelineEvents.splice(0, this.timelineEvents.length - 32);
    }

    resolvePlayback(name, gain, priority, options) {
        const cue = this.CUE_MANIFEST[name] || {};
        const bus = ['launch', 'bang', 'crackle'].includes(options.bus) ? options.bus : (cue.role || (priority >= 3 ? 'bang' : 'launch'));
        const offset = Math.max(0, Number(options.offset ?? cue.trimStart) || 0);
        const playbackRate = Math.max(0.9, Math.min(1.1, Number(options.playbackRate) || 1));
        let maxDuration = Number(options.maxDuration ?? cue.maxDuration);
        if (cue.usableEnd !== null && cue.usableEnd !== undefined && Number.isFinite(Number(cue.usableEnd))) {
            const usableDuration = Math.max(0.02, Number(cue.usableEnd) - offset) / playbackRate;
            maxDuration = Number.isFinite(maxDuration) ? Math.min(maxDuration, usableDuration) : usableDuration;
        }
        if (cue.embeddedBangAt) {
            const safeWindow = Math.max(0.04, cue.embeddedBangAt - offset - 0.04) / playbackRate;
            maxDuration = Number.isFinite(maxDuration) ? Math.min(maxDuration, safeWindow) : safeWindow;
        }
        return {
            cue,
            bus,
            offset,
            maxDuration,
            fadeOutDuration: Math.max(0.04, Math.min(0.18, Number(options.fadeOutDuration ?? cue.fadeOut) || (bus === 'launch' ? 0.06 : 0.1))),
            level: Math.max(0, Math.min(2, gain * (Number(cue.gain) || 1) * (bus === 'crackle' ? this.crackleVolume : 1))),
            playbackRate,
            plannedAt: Number(options.plannedAt),
            maxLatenessMs: Math.max(0, Number(options.maxLatenessMs) || (bus === 'launch' ? 250 : 100)),
            effectId: options.effectId || null,
            eventType: options.eventType || bus,
            priority,
            protectRatio: bus === 'crackle' ? 0.9 : 0
        };
    }

    async play(name, gain = 1, priority = 1, options = {}) {
        if (!this.enabled || !name) return false;
        const playback = this.resolvePlayback(name, gain, priority, options);
        const requestedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (Number.isFinite(playback.plannedAt) && requestedAt - playback.plannedAt > playback.maxLatenessMs) {
            this.missedEvents++;
            this.recordTimelineEvent(playback.effectId, playback.eventType, playback.plannedAt, requestedAt, 'missed-stale');
            this.updateStatus();
            return false;
        }
        if (this.loading.has(name)) await this.loading.get(name);
        await this.ensureContext(false);
        const buffer = this.buffers.get(name);
        if (buffer && this.context?.state === 'running') {
            const actualAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
            if (Number.isFinite(playback.plannedAt) && actualAt - playback.plannedAt > playback.maxLatenessMs) {
                this.missedEvents++;
                this.recordTimelineEvent(playback.effectId, playback.eventType, playback.plannedAt, actualAt, 'missed-stale');
                this.updateStatus();
                return false;
            }
            if (!this.makeVoiceRoom(playback.bus, priority)) {
                this.missedEvents++;
                this.recordTimelineEvent(playback.effectId, playback.eventType, playback.plannedAt || actualAt, actualAt, 'missed-voice-budget');
                this.updateStatus();
                return false;
            }
            const source = this.context.createBufferSource();
            const gainNode = this.context.createGain();
            const duration = Number.isFinite(playback.maxDuration)
                ? playback.maxDuration
                : Math.max(0.02, (Number(buffer.duration) - playback.offset) / playback.playbackRate);
            const voice = {
                source, gainNode, priority, bus: playback.bus, level: playback.level,
                startedAt: actualAt, protectedUntil: actualAt + duration * playback.protectRatio * 1000,
                stopTimer: null, fadeTimer: null
            };
            source.buffer = buffer;
            if (source.playbackRate) source.playbackRate.value = playback.playbackRate;
            gainNode.gain.value = playback.level;
            source.connect(gainNode);
            const output = this.busNodes[playback.bus] || this.compressor || this.context.destination;
            gainNode.connect(output);
            source.onended = () => this.releaseVoice(voice);
            this.activeVoices.push(voice);
            this.updateDucking();
            const offset = Math.min(playback.offset, Math.max(0, Number(buffer.duration) - 0.02 || playback.offset));
            const startAt = Number.isFinite(playback.plannedAt) ? this.performanceToAudioTime(playback.plannedAt) : 0;
            source.start(startAt, offset);
            if (Number.isFinite(playback.maxDuration) && playback.maxDuration > 0) {
                const now = Number(this.context.currentTime) || 0;
                const stopAt = Math.max(now, startAt || now) + playback.maxDuration;
                const fadeDuration = Math.min(playback.maxDuration, playback.fadeOutDuration);
                try {
                    gainNode.gain.setValueAtTime?.(playback.level, stopAt - fadeDuration);
                    gainNode.gain.linearRampToValueAtTime?.(0, stopAt);
                    source.stop(stopAt);
                } catch (_) {}
            }
            this.backend = 'web-audio';
            this.lastPlayed = name;
            if (playback.bus === 'crackle') {
                this.crackleState = 'playing';
                this.lastAudioProfile = playback.cue.profile || options.profile || 'short';
            }
            this.lastError = null;
            this.recordTimelineEvent(playback.effectId, playback.eventType, playback.plannedAt || actualAt, actualAt, 'played');
            this.updateStatus();
            return true;
        }
        const played = await this.playHtml(name, gain, priority, { ...options, _playback: playback });
        if (!played && this.urls.has(name) && (!Number.isFinite(playback.plannedAt) || requestedAt - playback.plannedAt <= playback.maxLatenessMs)) {
            this.queuePlayback(name, gain, priority, options);
        }
        return played;
    }

    async playHtml(name, gain, priority, options = {}) {
        const url = this.urls.get(name);
        if (!url || typeof Audio === 'undefined') {
            this.lastError = `Sound is not loaded: ${name}`;
            this.updateStatus();
            return false;
        }
        let voice = null;
        try {
            const playback = options._playback || this.resolvePlayback(name, gain, priority, options);
            const actualAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
            if (Number.isFinite(playback.plannedAt) && actualAt - playback.plannedAt > playback.maxLatenessMs) {
                this.missedEvents++;
                this.recordTimelineEvent(playback.effectId, playback.eventType, playback.plannedAt, actualAt, 'missed-stale');
                return false;
            }
            if (!this.makeVoiceRoom(playback.bus, priority)) {
                this.missedEvents++;
                this.recordTimelineEvent(playback.effectId, playback.eventType, playback.plannedAt || actualAt, actualAt, 'missed-voice-budget');
                this.updateStatus();
                return false;
            }
            const element = this.getHtmlElement(name, url);
            if (!element) {
                this.missedEvents++;
                this.recordTimelineEvent(playback.effectId, playback.eventType, playback.plannedAt || actualAt, actualAt, 'missed-pool-busy');
                return false;
            }
            const duration = Number.isFinite(playback.maxDuration) ? playback.maxDuration : 1;
            voice = {
                element, priority, bus: playback.bus, level: playback.level,
                startedAt: actualAt, protectedUntil: actualAt + duration * playback.protectRatio * 1000,
                stopTimer: null, fadeTimer: null
            };
            element.preload = 'auto';
            element.playbackRate = playback.playbackRate;
            element.volume = this.getHtmlVoiceVolume(voice);
            const playbackOffset = playback.offset;
            try { element.currentTime = playbackOffset; } catch (_) {}
            element.onended = () => this.releaseVoice(voice);
            this.activeVoices.push(voice);
            this.updateDucking();
            await element.play();
            if (playbackOffset > 0) {
                try { element.currentTime = playbackOffset; } catch (_) {}
            }
            if (Number.isFinite(playback.maxDuration) && playback.maxDuration > 0) this.scheduleHtmlFade(voice, playback.maxDuration, playback.fadeOutDuration);
            this.backend = 'html-audio';
            this.lastPlayed = name;
            if (playback.bus === 'crackle') {
                this.crackleState = 'playing';
                this.lastAudioProfile = playback.cue.profile || options.profile || 'short';
            }
            this.lastError = null;
            this.recordTimelineEvent(playback.effectId, playback.eventType, playback.plannedAt || actualAt, actualAt, 'played-html');
            this.updateStatus();
            return true;
        } catch (error) {
            if (voice) this.stopVoice(voice);
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
        return pool.find(element => !this.activeVoices.some(voice => voice.element === element)) || null;
    }

    queuePlayback(name, gain, priority, options = {}) {
        const now = Date.now();
        const bus = this.CUE_MANIFEST[name]?.role || options.bus || (priority >= 3 ? 'bang' : 'launch');
        const deadline = Math.max(0, Number(options.maxLatenessMs) || (bus === 'launch' ? 250 : 100));
        this.pendingPlaybacks = this.pendingPlaybacks
            .filter(item => now - item.queuedAt <= item.deadline)
            .slice(-15);
        this.pendingPlaybacks.push({ name, gain, priority, options: { ...options }, queuedAt: now, deadline });
    }

    async flushPending() {
        if (this.flushingPending || this.context?.state !== 'running' || !this.pendingPlaybacks.length) return;
        this.flushingPending = true;
        const now = Date.now();
        const pending = this.pendingPlaybacks.splice(0).filter(item => {
            const valid = now - item.queuedAt <= item.deadline;
            if (!valid) {
                this.missedEvents++;
                const actualAt = typeof performance !== 'undefined' ? performance.now() : now;
                this.recordTimelineEvent(item.options.effectId, item.options.eventType, item.options.plannedAt || actualAt, actualAt, 'missed-locked');
            }
            return valid;
        });
        try {
            for (const item of pending) await this.play(item.name, item.gain, item.priority, item.options);
        } finally {
            this.flushingPending = false;
        }
    }

    makeVoiceRoom(bus = 'bang', priority = 1) {
        if (typeof bus === 'number') {
            priority = bus;
            bus = priority >= 3 ? 'bang' : 'launch';
        }
        this.activeVoices = this.activeVoices.filter(voice => {
            const ended = voice.source?.playbackState === 3 || voice.element?.ended;
            return !ended;
        });
        const busCount = this.activeVoices.filter(voice => voice.bus === bus).length;
        if (this.activeVoices.length < this.maxVoices && busCount < (this.voiceBudgets[bus] || this.maxVoices)) return true;
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const sameBusFull = busCount >= (this.voiceBudgets[bus] || this.maxVoices);
        const candidate = this.activeVoices
            .filter(voice => (!sameBusFull || voice.bus === bus) && (!voice.protectedUntil || voice.protectedUntil <= now))
            .sort((left, right) => left.priority - right.priority || left.startedAt - right.startedAt)[0];
        if (candidate && candidate.priority <= priority) {
            this.evictions++;
            this.stopVoice(candidate);
            return true;
        }
        return false;
    }

    getHtmlVoiceVolume(voice) {
        const duck = voice.bus === 'bang' && this.activeVoices.some(item => item !== voice && item.bus === 'crackle') ? 0.707 : 1;
        const mixHeadroom = 1 / Math.sqrt(Math.max(1, this.activeVoices.length));
        return Math.max(0, Math.min(1, this.volume * this.limiterCeiling * voice.level * duck * mixHeadroom));
    }

    scheduleHtmlFade(voice, maxDuration, fadeDuration) {
        const fadeMs = Math.max(20, Math.min(maxDuration * 1000, fadeDuration * 1000));
        const startDelay = Math.max(0, maxDuration * 1000 - fadeMs);
        voice.stopTimer = setTimeout(() => {
            const started = Date.now();
            voice.fadeTimer = setInterval(() => {
                const progress = Math.min(1, (Date.now() - started) / fadeMs);
                if (voice.element) voice.element.volume = this.getHtmlVoiceVolume(voice) * (1 - progress);
                if (progress >= 1) this.stopVoice(voice);
            }, 16);
            this.htmlFadeTimers.add(voice.fadeTimer);
        }, startDelay);
    }

    updateDucking() {
        const crackling = this.activeVoices.some(voice => voice.bus === 'crackle');
        const now = Number(this.context?.currentTime) || 0;
        const bangGain = crackling ? 0.707 : 1;
        const parameter = this.busNodes.bang?.gain;
        try {
            parameter?.cancelScheduledValues?.(now);
            parameter?.setTargetAtTime?.(bangGain, now, crackling ? 0.012 : 0.08);
            if (parameter && typeof parameter.setTargetAtTime !== 'function') parameter.value = bangGain;
        } catch (_) {
            if (parameter) parameter.value = bangGain;
        }
        for (const voice of this.activeVoices) {
            if (voice.element) voice.element.volume = this.getHtmlVoiceVolume(voice);
        }
        this.crackleState = crackling ? 'playing' : 'idle';
    }

    releaseVoice(voice) {
        if (!voice) return;
        if (voice.stopTimer) clearTimeout(voice.stopTimer);
        if (voice.fadeTimer) {
            clearInterval(voice.fadeTimer);
            this.htmlFadeTimers.delete(voice.fadeTimer);
        }
        this.activeVoices = this.activeVoices.filter(item => item !== voice);
        if (voice.element) {
            voice.element.onended = null;
            try { voice.element.currentTime = 0; } catch (_) {}
        }
        this.updateDucking();
    }

    stopVoice(voice) {
        try { voice.source?.stop(); } catch (_) {}
        try { voice.element?.pause(); } catch (_) {}
        this.releaseVoice(voice);
    }

    createRandom(seed) {
        if (!Number.isFinite(Number(seed))) return Math.random;
        let state = (Number(seed) >>> 0) || 0x6d2b79f5;
        return () => {
            state += 0x6d2b79f5;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    choose(tier, combo, instant, options = {}) {
        const random = this.createRandom(options.seed);
        const pick = values => values[Math.floor(random() * values.length)];
        const withWindow = launch => ({ launch, launchWindow: this.LAUNCH_WINDOWS[launch] || null });
        if (instant) {
            return {
                launch: null,
                launchWindow: null,
                bang: tier === 'massive' ? 'explosion-huge' : tier === 'big' ? 'explosion-big' : tier === 'medium' ? 'explosion-medium' : 'explosion-small',
                crackle: null,
                crackleProfile: null
            };
        }
        const baseRates = { small: 0, medium: 0.2, big: 0.5, massive: 0.75 };
        const frequency = Math.max(0, Math.min(1, Number(options.crackleFrequency ?? 0.5)));
        const rate = Math.min(1, (baseRates[tier] || 0) * frequency / 0.5);
        const hasCrackle = random() < rate;
        const profile = hasCrackle && (tier === 'massive' || (tier === 'big' && random() < 0.35)) ? 'long' : (hasCrackle ? 'short' : null);
        const crackle = profile === 'long' ? 'crackling-long' : profile === 'short' ? 'crackling-medium' : null;
        let launchPool;
        let bangPool;
        if (tier === 'massive') {
            launchPool = hasCrackle ? ['combined-crackling-bang', 'combined-whistle-normal', 'launch-whistle'] : ['combined-whistle-normal', 'launch-whistle', ...this.SMOOTH_LAUNCH];
            bangPool = ['explosion-huge'];
        } else if (tier === 'big') {
            launchPool = hasCrackle ? ['combined-crackling-bang', 'combined-whistle-normal', 'launch-whistle'] : ['combined-whistle-normal', 'launch-whistle', ...this.SMOOTH_LAUNCH];
            bangPool = this.BIG_BANG;
        } else if (tier === 'medium') {
            launchPool = [...this.SMOOTH_LAUNCH, 'combined-whistle-normal', 'combined-whistle-tiny4'];
            bangPool = this.MEDIUM_BANG;
        } else {
            launchPool = [...this.BASIC_LAUNCH, ...this.TINY_WHISTLE_LAUNCH];
            bangPool = this.SMALL_BANG;
        }
        const launch = pick(launchPool);
        return { ...withWindow(launch), bang: pick(bangPool), crackle, crackleProfile: profile, combo: Math.max(1, Number(combo) || 1) };
    }

    chooseForRole(role, tier, seed) {
        const normalizedRole = String(role || 'single').toLowerCase();
        const roleSeed = (Number(seed) >>> 0) ^ (parseInt(this.hash(normalizedRole), 36) >>> 0);
        const random = this.createRandom(roleSeed);
        const pick = values => values[Math.floor(random() * values.length)];
        const profiles = {
            single: { launch: this.BASIC_LAUNCH, bang: ['explosion-medium'] },
            call: { launch: this.BASIC_LAUNCH, bang: ['explosion-medium'] },
            pair: { launch: this.SMOOTH_LAUNCH, bang: ['explosion-medium'] },
            response: { launch: this.SMOOTH_LAUNCH, bang: ['explosion-medium'] },
            ballet: { launch: this.SMOOTH_LAUNCH, bang: ['explosion-medium'] },
            accent: { launch: ['launch-whistle', 'launch-smooth2'], bang: ['explosion-big'] },
            floral: { launch: ['launch-whistle', 'launch-smooth2'], bang: ['explosion-big'] },
            volley: { launch: ['launch-whistle', 'launch-smooth2'], bang: ['explosion-big'] },
            salute: { launch: ['launch-whistle'], bang: ['explosion-huge'] },
            heavy: { launch: ['launch-whistle'], bang: ['explosion-huge'] },
            crown: { launch: ['launch-whistle'], bang: ['explosion-huge'] },
            wall: { launch: ['launch-whistle'], bang: ['explosion-huge'] },
            wave: { launch: ['launch-whistle'], bang: ['explosion-huge'] }
        };
        const fallback = ['big', 'massive'].includes(tier) ? profiles.accent : profiles.single;
        const profile = profiles[normalizedRole] || fallback;
        const launch = pick(profile.launch);
        return {
            launch,
            launchWindow: this.LAUNCH_WINDOWS[launch] || null,
            bang: pick(profile.bang),
            crackle: null,
            crackleProfile: null,
            combo: 1,
            soundRole: normalizedRole
        };
    }

    fitLaunchToFlight(selection, flightDuration, seed) {
        const duration = Math.max(0.05, Number(flightDuration) || 0);
        if (!selection?.launch || !this.CUE_MANIFEST[selection.launch]) return selection;
        const launchNames = [
            'launch-basic', 'launch-basic2', 'launch-whistle', 'launch-smooth', 'launch-smooth2',
            'combined-whistle-tiny1', 'combined-whistle-tiny2', 'combined-whistle-tiny3',
            'combined-whistle-tiny4', 'combined-whistle-normal'
        ];
        const describe = name => {
            const cue = this.CUE_MANIFEST[name];
            const sourceWindow = Number(cue?.usableEnd ?? cue?.embeddedBangAt);
            if (!cue || !Number.isFinite(sourceWindow) || sourceWindow <= 0) return null;
            const rawRate = sourceWindow / duration;
            return { name, sourceWindow, rawRate, score: Math.abs(rawRate - 1) };
        };
        const current = describe(selection.launch);
        if (current && current.rawRate >= 0.9 && current.rawRate <= 1.1) {
            selection.launchWindow = current.sourceWindow;
            return selection;
        }
        const candidates = launchNames.map(describe).filter(Boolean);
        const fitting = candidates.filter(candidate => candidate.rawRate >= 0.9 && candidate.rawRate <= 1.1);
        let chosen;
        if (fitting.length) {
            const bestScore = Math.min(...fitting.map(candidate => candidate.score));
            const best = fitting.filter(candidate => candidate.score <= bestScore + 0.035);
            chosen = best[(Number(seed) >>> 0) % best.length];
        } else {
            chosen = candidates.sort((left, right) => left.score - right.score)[0];
        }
        if (chosen) {
            selection.launch = chosen.name;
            selection.launchWindow = chosen.sourceWindow;
        }
        return selection;
    }

    applyCrackleOverride(selection, enabled, options = {}) {
        if (enabled === undefined || enabled === null) return selection;
        if (enabled === false) {
            selection.crackle = null;
            selection.crackleProfile = null;
            if (selection.launch === 'combined-crackling-bang') {
                selection.launch = 'launch-whistle';
                selection.launchWindow = null;
            }
            return selection;
        }
        const profile = options.profile || (options.tier === 'massive' ? 'long' : selection.crackleProfile || 'short');
        selection.crackleProfile = profile;
        selection.crackle = profile === 'long' ? 'crackling-long' : 'crackling-medium';
        return selection;
    }

    getTelemetry() {
        const activeVoices = {
            launch: this.activeVoices.filter(voice => voice.bus === 'launch').length,
            bang: this.activeVoices.filter(voice => voice.bus === 'bang').length,
            crackle: this.activeVoices.filter(voice => voice.bus === 'crackle').length,
            total: this.activeVoices.length
        };
        const peak = this.samplePeak();
        const peakDbfs = Math.max(-120, Math.min(0, 20 * Math.log10(Math.max(peak, 1e-6))));
        return {
            audioStatus: this.status,
            audioBackend: this.backend,
            loadedSounds: this.buffers.size,
            failedSounds: this.failed.size,
            lastPlayed: this.lastPlayed,
            lastAudioError: this.lastError,
            lastAudioProfile: this.lastAudioProfile,
            crackleState: this.crackleState,
            activeVoices,
            audioEvictions: this.evictions,
            missedAudioEvents: this.missedEvents,
            audioPeak: Math.round(peakDbfs * 10) / 10,
            timelineEvents: this.timelineEvents.slice(-32)
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

    setEnabled(enabled) {
        this.enabled = enabled !== false;
        if (!this.enabled) for (const voice of [...this.activeVoices]) this.stopVoice(voice);
        this.updateStatus();
    }
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, Number(value) || 0));
        if (this.masterGain) this.masterGain.gain.value = this.volume * this.limiterCeiling;
    }
    setCrackleVolume(value) {
        const numeric = Number(value);
        this.crackleVolume = Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0.75;
    }
    destroy() {
        for (const voice of [...this.activeVoices]) {
            this.stopVoice(voice);
        }
        this.activeVoices.length = 0;
        for (const timer of this.htmlFadeTimers) clearInterval(timer);
        this.htmlFadeTimers.clear();
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
        this.busNodes = { launch: null, bang: null, crackle: null };
        this.analyser = null;
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
        this.timelineQueue = [];
        this.effectPlans = new Map();
        this.crackleSequence = { eligible: 0, ordinal: 0, lastCrackleOrdinal: -100 };
        this.activeShows = new Map();
        this.finaleQueue = [];
        this.finaleIds = new Set();
        this.currentFinale = null;
        this.finalePhase = 'idle';
        this.finaleGeneration = 0;
        this.failingFinaleIds = new Set();
        this.transientFrameError = false;
        this.giftLaunchTimestamps = [];
        this.giftBacklog = new Map();
        this.giftDrainDue = null;
        this.imageCache = new Map();
        this.isBenchmark = new URLSearchParams(window.location.search).get('benchmark') === 'true';
        this.debug = DEBUG;
        this.config = {
            renderer: 'webgpu', enabled: true, visualStyle: 'premium-hybrid', audioEnabled: true, audioVolume: 0.7,
            crackleFrequency: 0.5, crackleVolume: 0.75,
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
                this.setStatus({ audioStatus: 'ready' });
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
            trailsEnabled: this.config.trailsEnabled !== false,
            glowEnabled: this.config.glowEnabled !== false,
            onStatus: status => this.setStatus(status)
        });
        const ready = await this.renderer.init();
        if (!ready) return false;
        // The renderer only owns a configured WebGPU canvas after init. Resize
        // once more so the backing texture and the logical orientation always
        // agree on the first frame, even before the first socket config update.
        this.resize();
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
        this.socket.on('webgpu-fireworks:trigger', data => this.handleIncomingTrigger(data));
        this.socket.on('webgpu-fireworks:finale', data => this.handleFinaleSocketEvent(data));
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
            this.audio.setCrackleVolume(this.config.crackleVolume);
            this.audio.useUrl(this.config.rocketSound, 'launch');
            this.audio.useUrl(this.config.explosionSound, 'bang');
            this.resize();
            this.applyQuality();
            this.applyInteractiveMode();
        });
    }

    setStatus(status, options = {}) {
        const previousState = this.rendererStatus?.state;
        if (options.transientFrameError === true) this.transientFrameError = true;
        else if (status.state) this.transientFrameError = false;
        const failureStates = new Set(['error', 'device-lost']);
        const entersRendererFailure = failureStates.has(status.state) && !failureStates.has(previousState);
        this.rendererStatus = {
            ...this.rendererStatus,
            ...status,
            ...this.audio.getTelemetry(),
            ...this.getFinaleTelemetry(),
            backend: 'webgpu'
        };
        if ((status.state === 'initializing' || status.state === 'ready') && !Object.prototype.hasOwnProperty.call(status, 'reason')) {
            delete this.rendererStatus.reason;
        }
        this.emitStatus();
        this.updateDebugPanel();
        if ((this.debug || this.isBenchmark) && status.state && status.state !== 'ready') this.showDiagnostic(status);
        else this.hideDiagnostic();
        if (entersRendererFailure && this.currentFinale) {
            const message = status.reason || `Renderer entered ${status.state}`;
            this.failFinale(this.currentFinale.id, new Error(message), this.getRuntimeNow());
        }
        if (status.state === 'ready' && !this.currentFinale) {
            this.startNextFinaleIfReady(this.getRuntimeNow());
        }
    }

    emitStatus() {
        if (!this.socket?.connected) return;
        this.socket.emit('webgpu-fireworks:renderer-status', {
            ...this.rendererStatus,
            ...this.audio.getTelemetry(),
            ...this.getFinaleTelemetry(),
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
        const sizes = {
            '360p': [640, 360],
            '480p': [854, 480],
            '540p': [960, 540],
            '720p': [1280, 720],
            '1080p': [1920, 1080],
            '1440p': [2560, 1440],
            '4k': [3840, 2160]
        };
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
        const visibility = {
            trailsEnabled: this.config.trailsEnabled !== false,
            glowEnabled: this.config.glowEnabled !== false
        };
        if (this.config.toasterMode) {
            this.renderer.setQuality({ ...visibility, trailSamples: Math.min(3, configuredTrails), bloomEnabled: false, turbulence: 0.04, style: style.id, glowScale: 0.5 });
            return;
        }
        if (this.performanceMode === 'minimal') this.renderer.setQuality({ ...visibility, trailSamples: Math.min(3, configuredTrails), bloomEnabled: false, turbulence: 0.06, style: style.id, glowScale: 0.58 });
        else if (this.performanceMode === 'reduced') this.renderer.setQuality({ ...visibility, trailSamples: Math.min(5, configuredTrails), bloomEnabled: this.config.glowEnabled !== false, turbulence: Math.min(style.turbulence, 0.09), style: style.id, glowScale: style.glowScale * 0.78 });
        else this.renderer.setQuality({ ...visibility, trailSamples: configuredTrails, bloomEnabled: this.config.glowEnabled !== false, turbulence: style.turbulence, style: style.id, glowScale: style.glowScale });
    }

    ensureFinaleRuntimeState() {
        if (!Array.isArray(this.finaleQueue)) this.finaleQueue = [];
        if (!(this.finaleIds instanceof Set)) this.finaleIds = new Set();
        if (!Object.prototype.hasOwnProperty.call(this, 'currentFinale')) this.currentFinale = null;
        if (typeof this.finalePhase !== 'string') this.finalePhase = 'idle';
        if (!Array.isArray(this.giftLaunchTimestamps)) this.giftLaunchTimestamps = [];
        if (!(this.giftBacklog instanceof Map)) this.giftBacklog = new Map();
        if (!Object.prototype.hasOwnProperty.call(this, 'giftDrainDue')) this.giftDrainDue = null;
        if (!Number.isFinite(this.finaleSequence)) this.finaleSequence = 0;
        if (!Number.isFinite(this.finaleGeneration)) this.finaleGeneration = 0;
        if (!(this.failingFinaleIds instanceof Set)) this.failingFinaleIds = new Set();
        if (typeof this.transientFrameError !== 'boolean') this.transientFrameError = false;
    }

    getRuntimeNow() {
        return performance.now();
    }

    getFinaleTelemetry() {
        this.ensureFinaleRuntimeState();
        return {
            finaleActive: Boolean(this.currentFinale),
            finaleId: this.currentFinale?.id || null,
            finaleStyle: this.currentFinale?.style || null,
            finaleLength: this.currentFinale?.length || null,
            finalePhase: this.currentFinale?.phase || 'idle',
            finaleQueueLength: this.finaleQueue.length
        };
    }

    emitFinaleTelemetry(extra = {}) {
        this.rendererStatus = {
            ...this.rendererStatus,
            ...this.getFinaleTelemetry(),
            ...extra
        };
        this.emitStatus();
    }

    isValidShowPlan(showPlan) {
        return Boolean(
            showPlan &&
            Number(showPlan.planVersion) >= 1 &&
            Number(showPlan.durationMs) > 0 &&
            Array.isArray(showPlan.cues)
        );
    }

    finaleIdentity(data = {}) {
        const supplied = data.eventId ?? data.id ?? data.showPlan?.id;
        if (supplied !== undefined && supplied !== null && String(supplied).trim()) return String(supplied);
        this.ensureFinaleRuntimeState();
        this.finaleSequence++;
        return `finale-runtime-${Math.round(this.getRuntimeNow())}-${this.finaleSequence}`;
    }

    isGiftTrigger(data = {}) {
        return data.reason === 'gift' || data.type === 'gift' || Boolean(
            data.giftId || data.giftName ||
            (data.giftImage && data.username && Number(data.coins || data.value) > 0)
        );
    }

    giftBundleKey(data = {}) {
        const user = data.userId ?? data.uniqueId ?? data.username ?? 'anonymous';
        const gift = data.giftId ?? data.giftName ?? data.giftImage ?? 'gift';
        return `${String(user)}::${String(gift)}`;
    }

    bundleGift(data = {}) {
        const key = this.giftBundleKey(data);
        const existing = this.giftBacklog.get(key);
        const incomingUnitValue = Math.max(0, Number(data.value ?? data.coins) || 0);
        if (!existing) {
            const bundle = {
                ...data,
                coins: Math.max(0, Number(data.coins) || 0),
                value: Math.max(0, Number(data.value ?? data.coins) || 0),
                combo: Math.max(1, Number(data.combo) || 1),
                bundleCount: 1,
                giftBundleKey: key,
                highestGiftUnitValue: incomingUnitValue
            };
            this.giftBacklog.set(key, bundle);
            return bundle;
        }

        const coins = existing.coins + Math.max(0, Number(data.coins) || 0);
        const value = existing.value + Math.max(0, Number(data.value ?? data.coins) || 0);
        const combo = existing.combo + Math.max(1, Number(data.combo) || 1);
        const bundleCount = existing.bundleCount + 1;
        if (incomingUnitValue >= existing.highestGiftUnitValue) {
            Object.assign(existing, data);
            existing.highestGiftUnitValue = incomingUnitValue;
        }
        Object.assign(existing, { coins, value, combo, bundleCount, giftBundleKey: key });
        return existing;
    }

    pruneGiftLaunches(now) {
        this.giftLaunchTimestamps = this.giftLaunchTimestamps.filter(timestamp => now - timestamp < 1000);
    }

    scheduleGiftDrain(now = this.getRuntimeNow()) {
        if (!this.giftBacklog.size || !this.giftLaunchTimestamps.length) return;
        const due = Math.min(...this.giftLaunchTimestamps) + 1000;
        if (this.giftDrainDue !== null && this.giftDrainDue <= due) return;
        this.timelineQueue = this.timelineQueue.filter(event => event.type !== 'gift-drain');
        this.giftDrainDue = Math.max(now, due);
        this.scheduleTimeline({ type: 'gift-drain', due: this.giftDrainDue, order: -10 });
    }

    launchGiftNow(data, now = this.getRuntimeNow()) {
        Promise.resolve(this.handleTrigger({
            ...data,
            deferAssets: true,
            trackGiftLaunch: true,
            forceRocket: true
        })).catch(error => {
            console.error('[WebGPU Fireworks] Gift launch failed:', error);
            this.setStatus({ giftError: error.message || String(error) });
        });
        return { accepted: true, queued: false, bundled: Number(data.bundleCount) > 1 };
    }

    drainGiftBacklog(now = this.getRuntimeNow()) {
        this.ensureFinaleRuntimeState();
        this.giftDrainDue = null;
        this.pruneGiftLaunches(now);
        while (this.giftLaunchTimestamps.length < 3 && this.giftBacklog.size) {
            const [key, gift] = [...this.giftBacklog.entries()].sort((left, right) => {
                const coinDifference = Number(right[1].coins || right[1].value) - Number(left[1].coins || left[1].value);
                return coinDifference || String(left[0]).localeCompare(String(right[0]));
            })[0];
            this.giftBacklog.delete(key);
            this.launchGiftNow(gift, now);
        }
        if (this.giftBacklog.size) this.scheduleGiftDrain(now);
    }

    handleIncomingTrigger(data = {}) {
        this.ensureFinaleRuntimeState();
        if (!this.currentFinale || !this.isGiftTrigger(data)) return this.handleTrigger(data);
        const now = this.getRuntimeNow();
        this.pruneGiftLaunches(now);
        if (this.giftBacklog.size) {
            const bundle = this.bundleGift(data);
            this.drainGiftBacklog(now);
            return {
                accepted: true,
                queued: this.giftBacklog.has(bundle.giftBundleKey),
                bundled: true,
                bundleCount: bundle.bundleCount
            };
        }
        if (this.giftLaunchTimestamps.length < 3) return this.launchGiftNow(data, now);
        const bundle = this.bundleGift(data);
        this.scheduleGiftDrain(now);
        return { accepted: true, queued: true, bundled: true, bundleCount: bundle.bundleCount };
    }

    getFinaleQualityScale() {
        if (this.config.toasterMode || this.performanceMode === 'minimal') return 0.5;
        if (this.performanceMode === 'reduced') return 0.75;
        return 1;
    }

    isFinaleRuntimeTokenValid(finaleId, runtimeToken) {
        if (!finaleId) return true;
        return Boolean(
            runtimeToken &&
            this.currentFinale?.id === finaleId &&
            this.currentFinale.runtimeToken === runtimeToken
        );
    }

    materializeFinalePayload(payload = {}) {
        if (!Number.isFinite(Number(payload.baseParticleCount))) return { ...payload };
        const qualityScale = this.getFinaleQualityScale();
        const sizeScale = Math.sqrt(qualityScale);
        const baseSize = Array.isArray(payload.baseParticleSizeRange) ? payload.baseParticleSizeRange : [4, 12];
        const ordinal = Math.max(0, Number(payload.finaleOrdinal) || 0);
        const crackleEnabled = this.config.toasterMode || this.performanceMode === 'minimal'
            ? false
            : payload.presetCrackleEnabled === true && (this.performanceMode !== 'reduced' || ordinal % 2 === 0);
        return {
            ...payload,
            particleCount: Math.max(1, Math.round(Number(payload.baseParticleCount) * qualityScale)),
            particleSizeRange: baseSize.map(value => Math.max(1, Number(value) * sizeScale)),
            crackleEnabled
        };
    }

    calculateFlightDuration(targetY) {
        const travel = Math.max(0, Math.min(1, (this.baseHeight - targetY) / this.baseHeight));
        return 0.55 + travel * 1.25;
    }

    scheduleTimeline(event) {
        this.timelineQueue.push(event);
        this.timelineQueue.sort((left, right) => left.due - right.due || (left.order || 0) - (right.order || 0));
    }

    processTimeline(now) {
        this.audio.syncClock(now);
        while (this.timelineQueue.length && this.timelineQueue[0].due <= now) {
            const event = this.timelineQueue.shift();
            try {
                if (event.type === 'finale-launch') {
                    const payload = this.materializeFinalePayload(event.payload);
                    Promise.resolve(this.handleTrigger(payload)).catch(error => this.failFinale(event.finaleId, error, now));
                } else if (event.type === 'finale-phase') {
                    this.setFinalePhase(event.finaleId, event.phase);
                } else if (event.type === 'finale-complete') {
                    this.finishFinaleVisuals(event.finaleId, now);
                } else if (event.type === 'finale-end-card-complete') {
                    this.completeFinale(event.finaleId, now);
                } else if (event.type === 'gift-drain') {
                    this.drainGiftBacklog(now);
                } else if (event.type === 'launch') {
                    this.processLaunch(event.plan, event.due, now);
                } else if (event.type === 'explode') {
                    this.processExplosion(event.plan.explosion, event.plan, event.due, now);
                } else if (event.type === 'crackle') {
                    this.processCrackle(event.plan, event.due, now);
                } else if (event.type === 'crackle-end') {
                    this.audio.updateDucking();
                } else if (event.type === 'cleanup') {
                    this.activeShows.delete(event.plan.id);
                    this.effectPlans.delete(event.plan.id);
                    this.audio.updateDucking();
                }
            } catch (error) {
                if (event.finaleId || event.plan?.finaleId) this.failFinale(event.finaleId || event.plan.finaleId, error, now);
                else {
                    console.error('[WebGPU Fireworks] Timeline event failed:', error);
                    this.setStatus({ timelineError: error.message || String(error) });
                }
            }
        }
    }

    applyCracklePolicy(sound, data, tier, seed) {
        const explicit = data.crackleEnabled;
        const eligible = tier !== 'small';
        const frequency = Math.max(0, Math.min(1, Number(data.crackleFrequency ?? this.config.crackleFrequency ?? 0.5)));
        if (eligible) {
            this.crackleSequence.ordinal++;
            this.crackleSequence.eligible++;
        }
        if (explicit === false) return this.audio.applyCrackleOverride(sound, false, { tier, seed });
        if (explicit === true) {
            const forced = this.audio.applyCrackleOverride(sound, true, { tier, seed, profile: tier === 'massive' ? 'long' : undefined });
            if (eligible) {
                this.crackleSequence.lastCrackleOrdinal = this.crackleSequence.ordinal;
                this.crackleSequence.eligible = 0;
            }
            return forced;
        }
        if (!eligible || frequency <= 0) return this.audio.applyCrackleOverride(sound, false, { tier, seed });
        const hasCooldown = this.crackleSequence.ordinal - this.crackleSequence.lastCrackleOrdinal <= 2;
        const guaranteed = this.crackleSequence.eligible >= 6;
        if (hasCooldown && !guaranteed) return this.audio.applyCrackleOverride(sound, false, { tier, seed });
        if (guaranteed && !sound.crackle) this.audio.applyCrackleOverride(sound, true, { tier, seed });
        if (sound.crackle) {
            this.crackleSequence.lastCrackleOrdinal = this.crackleSequence.ordinal;
            this.crackleSequence.eligible = 0;
        }
        return sound;
    }

    createEffectPlan(explosion, launch) {
        const createdAt = Number.isFinite(Number(launch.createdAt)) ? Number(launch.createdAt) : this.getRuntimeNow();
        const explodeAt = Number.isFinite(Number(launch.explodeAt))
            ? Number(launch.explodeAt)
            : createdAt + Math.max(0, Number(launch.flightDuration) || 0) * 1000;
        const crackleProfile = explosion.sound.crackleProfile || null;
        const crackleDelay = crackleProfile === 'long' ? 220 : 180;
        let crackleAt = crackleProfile ? explodeAt + crackleDelay : null;
        let crackleDuration = crackleProfile === 'long' ? 1 : crackleProfile === 'short' ? 0.65 : 0;
        if (crackleAt !== null && explosion.finaleEndsAt) {
            crackleDuration = Math.min(crackleDuration, Math.max(0, (explosion.finaleEndsAt - crackleAt) / 1000));
            if (crackleDuration <= 0) crackleAt = null;
        }
        return {
            id: explosion.id,
            finaleId: launch.finaleId || explosion.finaleId || null,
            seed: launch.seed,
            createdAt,
            launchAt: createdAt,
            explodeAt,
            crackleAt,
            cleanupAt: explodeAt + Math.min(6000, 1800 + explosion.intensity * 900),
            flightDuration: launch.flightDuration,
            trackGiftLaunch: launch.trackGiftLaunch === true,
            launch,
            explosion,
            crackleProfile,
            crackleDuration,
            cracklePulseCount: crackleProfile === 'long' ? 6 : crackleProfile === 'short' ? 4 : 0
        };
    }

    enqueueEffectPlan(plan) {
        this.effectPlans.set(plan.id, plan);
        this.activeShows.set(plan.id, plan.createdAt);
        if (plan.trackGiftLaunch) this.giftLaunchTimestamps.push(plan.createdAt);
        this.scheduleTimeline({ type: 'launch', due: plan.launchAt, order: 0, finaleId: plan.finaleId, plan });
        this.scheduleTimeline({ type: 'explode', due: plan.explodeAt, order: 1, finaleId: plan.finaleId, plan });
        if (plan.crackleAt !== null) {
            this.audio.crackleState = 'scheduled';
            this.audio.lastAudioProfile = plan.crackleProfile;
            this.scheduleTimeline({ type: 'crackle', due: plan.crackleAt, order: 2, finaleId: plan.finaleId, plan });
            this.scheduleTimeline({ type: 'crackle-end', due: plan.crackleAt + plan.crackleDuration * 1000, order: 3, finaleId: plan.finaleId, plan });
        }
        this.scheduleTimeline({ type: 'cleanup', due: plan.cleanupAt, order: 4, finaleId: plan.finaleId, plan });
    }

    processLaunch(plan, plannedAt, actualAt) {
        const { launch, explosion } = plan;
        const remainingShowSeconds = explosion.finaleEndsAt
            ? Math.max(0, (explosion.finaleEndsAt - actualAt) / 1000)
            : plan.flightDuration;
        if (explosion.finaleEndsAt && remainingShowSeconds <= 0) {
            this.audio.recordTimelineEvent(plan.id, 'launch-visual', plannedAt, actualAt, 'skipped-finale-ended');
            return false;
        }
        const launchDuration = Math.min(plan.flightDuration, remainingShowSeconds);
        if (!launch.skipRocket) {
            const avatarTexture = Number(explosion.assets.avatarTexture) || 0;
            this.renderer.spawnRocket({
                effectId: plan.id,
                origin: launch.origin,
                target: launch.target,
                duration: launchDuration,
                color: explosion.colors[0],
                textureIndex: explosion.avatarRocketHead ? 0 : avatarTexture,
                headTextureIndex: explosion.avatarRocketHead ? avatarTexture : 0,
                size: avatarTexture ? 18 : 8,
                gravity: 0,
                drag: 1,
                seed: plan.seed,
                style: explosion.visualStyle,
                curve: ((Number(plan.seed) || 1) % 2 === 0 ? 1 : -1) * (45 + explosion.intensity * 12)
            });
        }
        this.audio.recordTimelineEvent(plan.id, 'launch-visual', plannedAt, actualAt, 'rendered');
        if (!explosion.playSound || !explosion.sound.launch || launch.skipRocket) return;
        const cue = this.audio.CUE_MANIFEST[explosion.sound.launch] || {};
        const sourceWindow = Number(explosion.sound.launchWindow || cue.embeddedBangAt || plan.flightDuration);
        const playbackRate = Math.max(0.9, Math.min(1.1, sourceWindow / Math.max(0.05, plan.flightDuration)));
        if (remainingShowSeconds <= 0) return;
        const playbackOptions = {
            effectId: plan.id,
            eventType: 'launch-audio',
            plannedAt,
            maxLatenessMs: 250,
            bus: 'launch',
            playbackRate,
            // The selected cue is fitted to the flight at 0.9-1.1x. Let its
            // final 60 ms fade land on the separately scheduled bang.
            maxDuration: launchDuration,
            fadeOutDuration: 0.06
        };
        void this.audio.play(explosion.sound.launch, 0.82, 1, playbackOptions);
    }

    processCrackle(plan, plannedAt, actualAt) {
        const explosion = plan.explosion;
        if (!explosion.sound.crackle || !plan.crackleProfile) return;
        const remainingShowSeconds = explosion.finaleEndsAt
            ? Math.max(0, (explosion.finaleEndsAt - actualAt) / 1000)
            : plan.crackleDuration;
        if (explosion.finaleEndsAt && remainingShowSeconds <= 0) {
            this.audio.recordTimelineEvent(plan.id, 'crackle-visual', plannedAt, actualAt, 'skipped-finale-ended');
            return false;
        }
        const crackleDuration = Math.min(plan.crackleDuration, remainingShowSeconds);
        this.renderer.spawnCrackle({
            effectId: plan.id,
            profile: plan.crackleProfile,
            pulseCount: plan.cracklePulseCount,
            origin: { x: explosion.x, y: explosion.y },
            colors: explosion.colors,
            intensity: explosion.intensity,
            duration: crackleDuration,
            gravity: explosion.gravity * 520,
            drag: Math.min(0.988, explosion.friction),
            wind: explosion.wind * 280,
            style: explosion.visualStyle
        });
        this.audio.recordTimelineEvent(plan.id, 'crackle-visual', plannedAt, actualAt, 'rendered');
        if (explosion.playSound) {
            this.audio.crackleState = 'starting';
            void this.audio.play(explosion.sound.crackle, 1, 4, {
                effectId: plan.id,
                eventType: 'crackle-audio',
                plannedAt,
                maxLatenessMs: 100,
                profile: plan.crackleProfile,
                offset: this.audio.CRACKLE_OFFSETS[explosion.sound.crackle] || 0,
                maxDuration: crackleDuration,
                fadeOutDuration: Math.min(0.16, crackleDuration * 0.2),
                bus: 'crackle'
            }).then(played => {
                if (!played && this.audio.crackleState === 'starting') this.audio.crackleState = 'missed';
            });
        } else this.audio.crackleState = 'visual-only';
    }

    async handleTrigger(data = {}) {
        if (!this.renderer?.initialized || this.rendererStatus.state !== 'ready') {
            if (data.finaleId) throw new Error(`WebGPU renderer is not ready for finale ${data.finaleId}`);
            return;
        }
        const finaleId = data.finaleId || null;
        const runtimeToken = data.runtimeToken || null;
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
        let skipRocket = !forceRocket && combo >= 5;
        let flightDuration = skipRocket ? 0 : this.calculateFlightDuration(targetY);
        const deferredAssets = data.deferAssets === true;
        const assetPreparation = deferredAssets ? this.prepareImages(data) : null;
        const assets = deferredAssets
            ? {
                giftTexture: 0,
                avatarTexture: 0,
                avatarChance: Math.max(0, Math.min(1, Number(data.avatarParticleChance ?? this.config.avatarParticleChance ?? 0.3)))
            }
            : await this.prepareImages(data);
        if (finaleId && !this.isFinaleRuntimeTokenValid(finaleId, runtimeToken)) {
            return { cancelled: true, finaleId, reason: 'stale-finale-generation' };
        }
        const id = data.id || `${Date.now()}-${Math.random()}`;
        const seed = Number.isFinite(Number(data.seed)) ? Number(data.seed) : (parseInt(this.audio.hash(id), 36) >>> 0);
        // Choose the complete tier profile before applying the combo shortcut.
        // If this becomes a crackling effect it must remain a real rocket.
        let sound = data.soundRole
            ? this.audio.chooseForRole(data.soundRole, tier, seed)
            : this.audio.choose(tier, forceRocket ? 1 : combo, false, {
                seed,
                crackleFrequency: data.crackleFrequency ?? this.config.crackleFrequency
            });
        sound = this.applyCracklePolicy(sound, data, tier, seed);
        if (instant && !sound.crackle) {
            sound.launch = null;
            sound.launchWindow = null;
        }
        if (sound.crackle && skipRocket) {
            skipRocket = false;
            flightDuration = this.calculateFlightDuration(targetY);
        }
        const plannedLaunchAt = Number(data.plannedLaunchAt);
        const plannedExplodeAt = Number(data.plannedExplodeAt);
        const hasPlannedTiming = Number.isFinite(plannedLaunchAt) && Number.isFinite(plannedExplodeAt) && plannedExplodeAt >= plannedLaunchAt;
        if (hasPlannedTiming) {
            skipRocket = false;
            flightDuration = (plannedExplodeAt - plannedLaunchAt) / 1000;
        }
        const customLaunch = this.audio.useConfiguredUrl(data.rocketSound, 'launch');
        const customBang = this.audio.useConfiguredUrl(data.explosionSound, 'bang');
        if (customLaunch) {
            sound.launch = customLaunch;
            sound.launchWindow = null;
        }
        if (customBang) sound.bang = customBang;
        if (!customLaunch && sound.launch && !skipRocket) {
            sound = this.audio.fitLaunchToFlight(sound, flightDuration, seed);
        }
        const explosion = {
            id, x, y: targetY, shape, intensity, count, colors, assets, visualStyle, style,
            playSound: data.playSound !== false, sound, tier,
            finaleId: data.finaleId || null,
            finaleEndsAt: Number.isFinite(Number(data.finaleEndsAt)) ? Number(data.finaleEndsAt) : null,
            powerScale: Number(data.powerScale) || 1,
            particleScale: Number(data.particleScale) || 1,
            soundRole: data.soundRole || null,
            formation: data.formation || null,
            avatarRocketHead: data.avatarRocketHead === true,
            username: data.username, userId: data.userId, uniqueId: data.uniqueId,
            giftId: data.giftId, giftName: data.giftName, giftImage: data.giftImage,
            coins: data.coins, value: data.value, combo, bundleCount: data.bundleCount,
            gravity: Number(data.gravity ?? this.config.gravity),
            friction: Number(data.friction ?? this.config.friction),
            wind: data.windEnabled ? Number(data.windStrength ?? this.config.windStrength) : 0,
            particleSizeRange: Array.isArray(data.particleSizeRange) ? data.particleSizeRange : this.config.particleSizeRange,
            giftPopupEnabled: data.giftPopupEnabled,
            giftPopupPosition: data.giftPopupPosition,
            despawnFadeDuration: Number(data.despawnFadeDuration ?? this.config.despawnFadeDuration)
        };
        const plan = this.createEffectPlan(explosion, {
            createdAt: hasPlannedTiming ? plannedLaunchAt : this.getRuntimeNow(),
            explodeAt: hasPlannedTiming ? plannedExplodeAt : undefined,
            flightDuration,
            origin: { x: originX, y: originY },
            target: { x, y: targetY },
            skipRocket,
            seed,
            finaleId: data.finaleId || null,
            trackGiftLaunch: data.trackGiftLaunch === true
        });
        this.enqueueEffectPlan(plan);
        if (assetPreparation) {
            Promise.resolve(assetPreparation).then(preparedAssets => {
                const explosionPending = this.timelineQueue.some(event => event.type === 'explode' && event.plan === plan);
                if (this.effectPlans.get(plan.id) === plan && explosionPending) {
                    Object.assign(plan.explosion.assets, preparedAssets);
                }
            }).catch(error => {
                console.error('[WebGPU Fireworks] Deferred gift assets failed:', error);
            });
        }
        return plan;
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

    processExplosion(explosion, plan = null, plannedAt = performance.now(), actualAt = performance.now()) {
        const effectId = plan?.id || explosion.id;
        const remainingShowSeconds = explosion.finaleEndsAt
            ? Math.max(0, (explosion.finaleEndsAt - actualAt) / 1000)
            : Number.POSITIVE_INFINITY;
        if (explosion.finaleEndsAt && remainingShowSeconds <= 0) {
            this.audio.recordTimelineEvent(effectId, 'explosion-visual', plannedAt, actualAt, 'skipped-finale-ended');
            return false;
        }
        const shapeSpecific = explosion.shape !== 'burst';
        let baseCount = explosion.count;
        let avatarCount = 0;
        let giftCount = 0;
        if (!shapeSpecific && explosion.assets.avatarTexture) avatarCount = Math.round(baseCount * explosion.assets.avatarChance);
        if (!shapeSpecific && explosion.assets.giftTexture) giftCount = Math.round((baseCount - avatarCount) * 0.45);
        baseCount = Math.max(1, baseCount - avatarCount - giftCount);
        const naturalDuration = 1.15 + explosion.intensity * 0.28;
        const pressureFade = Math.max(0.25, Math.min(4, explosion.despawnFadeDuration || naturalDuration));
        const performanceDuration = this.performanceMode === 'minimal' ? Math.min(naturalDuration, pressureFade) : naturalDuration;
        const finaleTailDuration = explosion.finaleEndsAt ? remainingShowSeconds : performanceDuration;
        const duration = Math.min(performanceDuration, finaleTailDuration);
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
        this.renderer.spawnExplosion({ ...common, effectId, shape: explosion.shape, colors: explosion.colors, count: baseCount });
        if (avatarCount) this.renderer.spawnExplosion({ ...common, effectId, shape: 'image', colors: ['#ffffff'], count: avatarCount, textureIndex: explosion.assets.avatarTexture, size: 18 * explosion.style.sizeScale, nativeColor: true });
        if (giftCount) this.renderer.spawnExplosion({ ...common, effectId, shape: 'image', colors: ['#ffffff'], count: giftCount, textureIndex: explosion.assets.giftTexture, size: 18 * explosion.style.sizeScale, nativeColor: true });
        this.audio.recordTimelineEvent(effectId, 'explosion-visual', plannedAt, actualAt, 'rendered');
        if (explosion.playSound) {
            const bangDurations = { small: 0.7, medium: 0.9, big: 1.2, massive: 1.5 };
            if (remainingShowSeconds <= 0) return;
            void this.audio.play(explosion.sound.bang, explosion.tier === 'massive' ? 1 : 0.88, 3, {
                effectId,
                eventType: 'bang-audio',
                plannedAt,
                maxLatenessMs: 100,
                maxDuration: Math.min(bangDurations[explosion.tier] || 0.9, remainingShowSeconds),
                fadeOutDuration: 0.1,
                bus: 'bang'
            });
        }
        if (explosion.username && Number(explosion.coins) > 0) this.showGiftPopup(explosion);
    }

    buildPlannedFinalePayload(data, showPlan, cue, launch, startAt, ordinal = 0) {
        const targetY = Math.max(0, Math.min(1, Number(launch.position?.y) || 0.5)) * this.baseHeight;
        const flightDurationMs = this.calculateFlightDuration(targetY) * 1000;
        const plannedExplodeAt = startAt + Number(cue.beatAtMs);
        const plannedLaunchAt = plannedExplodeAt - flightDurationMs;
        const configuredSize = Array.isArray(this.config.particleSizeRange) ? this.config.particleSizeRange : [4, 12];
        const intensity = Math.max(0.1, Math.min(5, (Number(data.intensity) || 3) * (Number(launch.powerScale) || 1)));
        return {
            id: launch.id,
            finaleId: showPlan.id,
            runtimeToken: this.currentFinale?.runtimeToken,
            cueBeatAtMs: Number(cue.beatAtMs),
            phase: cue.phase,
            formation: cue.formation,
            shape: launch.shape,
            colors: Array.isArray(launch.colors) ? [...launch.colors] : [],
            position: launch.position,
            origin: launch.origin,
            seed: launch.seed,
            powerScale: Number(launch.powerScale) || 1,
            particleScale: Number(launch.particleScale) || 1,
            soundRole: launch.soundRole,
            intensity,
            baseParticleCount: Math.max(1, Math.round(60 * intensity * (Number(launch.particleScale) || 1))),
            baseParticleSizeRange: [...configuredSize],
            presetCrackleEnabled: launch.crackleEnabled === true,
            finaleOrdinal: ordinal,
            tier: launch.tier,
            forceRocket: true,
            playSound: data.playSound !== false,
            plannedLaunchAt,
            plannedExplodeAt,
            finaleEndsAt: startAt + Number(showPlan.durationMs)
        };
    }

    startPlannedFinale(entry, startAt) {
        const { data, showPlan, id } = entry;
        let order = 0;
        for (const cue of showPlan.cues) {
            for (const launch of cue.launches || []) {
                const payload = this.buildPlannedFinalePayload(data, showPlan, cue, launch, startAt, order);
                this.scheduleTimeline({
                    type: 'finale-launch',
                    due: payload.plannedLaunchAt,
                    order: order++,
                    finaleId: id,
                    payload
                });
            }
        }

        const firstBeat = phase => {
            const beats = showPlan.cues.filter(cue => cue.phase === phase).map(cue => Number(cue.beatAtMs));
            return beats.length ? Math.min(...beats) : null;
        };
        for (const phase of ['build', 'highlight']) {
            const beat = firstBeat(phase);
            if (beat !== null) this.scheduleTimeline({ type: 'finale-phase', due: startAt + beat, order: -20, finaleId: id, phase });
        }
        const highlightBeats = showPlan.cues.filter(cue => cue.phase === 'highlight').map(cue => Number(cue.beatAtMs));
        const finaleBeat = firstBeat('finale');
        if (highlightBeats.length && finaleBeat !== null) {
            const breathBeat = (Math.max(...highlightBeats) + finaleBeat) / 2;
            this.scheduleTimeline({ type: 'finale-phase', due: startAt + breathBeat, order: -20, finaleId: id, phase: 'breath' });
        }
        if (finaleBeat !== null) this.scheduleTimeline({ type: 'finale-phase', due: startAt + finaleBeat, order: -20, finaleId: id, phase: 'finale' });
        this.scheduleTimeline({
            type: 'finale-complete',
            due: startAt + Number(showPlan.durationMs),
            order: 100,
            finaleId: id
        });
        return { count: showPlan.cues.reduce((sum, cue) => sum + (cue.launches?.length || 0), 0) };
    }

    describeLegacyFinale(data = {}) {
        const intensity = Math.max(1, Math.min(5, Number(data.intensity) || 3));
        const count = Math.min(40, Math.max(1, Number(data.burstCount) || Math.round(intensity * 5)));
        const finaleDuration = Math.max(500, Number(data.duration) || 5000);
        const interval = count > 1 ? Math.max(180, Math.min(500, finaleDuration / (count - 1))) : 0;
        const shapes = Array.isArray(data.shapes) && data.shapes.length ? data.shapes : ['burst'];
        const colors = Array.isArray(data.colors) && data.colors.length ? data.colors : this.config.defaultColors;
        const bursts = Array.isArray(data.bursts) ? data.bursts : [];
        const baseSeed = Number.isFinite(Number(data.seed)) ? Number(data.seed) : Date.now();
        const random = this.audio.createRandom(baseSeed);
        const configuredFrequency = Math.max(0, Math.min(1, Number(data.crackleFrequency ?? this.config.crackleFrequency ?? 0.5)));
        const frequency = data.crackleEnabled === false
            ? 0
            : data.crackleEnabled === true ? Math.max(0.5, configuredFrequency) : configuredFrequency;
        const baseCrackleInterval = intensity >= 4 ? 3 : intensity >= 3 ? 4 : 5;
        const crackleInterval = frequency > 0
            ? Math.max(2, Math.min(12, Math.round(baseCrackleInterval * 0.5 / frequency)))
            : Number.POSITIVE_INFINITY;
        const seededPhase = Number.isFinite(crackleInterval)
            ? Math.floor(random() * Math.min(crackleInterval, count))
            : -1;
        return {
            intensity, count, finaleDuration, interval, shapes, colors, bursts, baseSeed,
            random, frequency, crackleInterval, seededPhase
        };
    }

    startLegacyFinale(entry, startAt) {
        const { data, id } = entry;
        const legacy = this.describeLegacyFinale(data);
        const {
            intensity, count, finaleDuration, interval, shapes, colors, bursts, baseSeed,
            random, frequency, crackleInterval, seededPhase
        } = legacy;
        let completeAt = startAt + finaleDuration;
        for (let i = 0; i < count; i++) {
            const plan = bursts[i] || {
                position: { x: 0.16 + ((i * 0.61803398875) % 1) * 0.68, y: 0.18 + ((i * 0.38196601125) % 1) * 0.42 },
                origin: { x: 0.08 + ((i * 0.754877666) % 1) * 0.84, y: 1.02 },
                seed: baseSeed + i * 2654435761
            };
            const crackleEnabled = frequency > 0 && (i - seededPhase) % crackleInterval === 0 && i >= seededPhase;
            const launchIntensity = Math.max(0.1, Math.min(5, intensity * (0.78 + random() * 0.35)));
            const tier = intensity >= 4 ? 'massive' : intensity >= 3 ? 'big' : 'medium';
            const launchAt = startAt + i * interval;
            const targetY = Math.max(0, Math.min(1, Number(plan.position?.y) || 0.5)) * this.baseHeight;
            const visualTail = 1.15 + launchIntensity * 0.28;
            const bangTail = data.playSound === false
                ? 0
                : ({ small: 0.7, medium: 0.9, big: 1.2, massive: 1.5 }[tier] || 0.9);
            const crackleTail = crackleEnabled ? (tier === 'massive' ? 1.22 : 0.83) : 0;
            const effectTailMs = Math.max(visualTail, bangTail, crackleTail) * 1000;
            completeAt = Math.max(completeAt, launchAt + this.calculateFlightDuration(targetY) * 1000 + effectTailMs);
            this.scheduleTimeline({
                type: 'finale-launch',
                due: launchAt,
                order: i,
                finaleId: id,
                payload: {
                id: `${id}-${i}`, finaleId: id, runtimeToken: entry.runtimeToken,
                shape: shapes[i % shapes.length], colors,
                position: plan.position, origin: plan.origin, seed: plan.seed,
                visualStyle: data.visualStyle || this.config.visualStyle,
                intensity: launchIntensity, particleCount: Math.round(60 * intensity),
                combo: Math.max(1, Math.round(intensity)), tier,
                forceRocket: true,
                crackleEnabled,
                crackleFrequency: frequency,
                playSound: data.playSound !== false, rocketSound: data.rocketSound, explosionSound: data.explosionSound
                }
            });
        }
        this.scheduleTimeline({ type: 'finale-complete', due: completeAt, order: 100, finaleId: id });
        return { count, crackleInterval, seededPhase, frequency, durationMs: completeAt - startAt };
    }

    startFinaleEntry(entry, startAt = this.getRuntimeNow()) {
        const style = entry.showPlan?.style || 'legacy';
        const length = entry.showPlan?.length || 'legacy';
        this.finaleGeneration++;
        entry.runtimeToken = `${entry.id}:${this.finaleGeneration}`;
        this.currentFinale = {
            id: entry.id,
            eventId: entry.data.eventId || null,
            style,
            length,
            phase: 'opening',
            startedAt: startAt,
            runtimeToken: entry.runtimeToken,
            legacy: entry.legacy,
            completionNotification: entry.completionNotification,
            completionNotificationShown: false
        };
        this.finalePhase = 'opening';
        const details = entry.legacy
            ? this.startLegacyFinale(entry, startAt)
            : this.startPlannedFinale(entry, startAt);
        this.emitFinaleTelemetry({ finaleError: null });
        return details;
    }

    setFinalePhase(finaleId, phase) {
        if (!this.currentFinale || this.currentFinale.id !== finaleId) return;
        this.currentFinale.phase = phase;
        this.finalePhase = phase;
        this.emitFinaleTelemetry();
    }

    finishFinaleVisuals(finaleId, now = this.getRuntimeNow()) {
        const finale = this.currentFinale;
        if (!finale || finale.id !== finaleId) return false;
        if (!finale.completionNotification) return this.completeFinale(finaleId, now);
        if (finale.completionNotificationShown) return false;

        finale.completionNotificationShown = true;
        this.setFinalePhase(finaleId, 'end-card');
        this.showFollowerAnimation(finale.completionNotification);
        this.scheduleTimeline({
            type: 'finale-end-card-complete',
            due: now + finale.completionNotification.duration,
            order: 110,
            finaleId
        });
        return true;
    }

    completeFinale(finaleId, now = this.getRuntimeNow()) {
        if (!this.currentFinale || this.currentFinale.id !== finaleId) return false;
        const controlEvents = new Set(['finale-launch', 'finale-phase', 'finale-complete', 'finale-end-card-complete']);
        this.timelineQueue = this.timelineQueue.filter(event => event.finaleId !== finaleId || !controlEvents.has(event.type));
        this.finaleIds.delete(finaleId);
        this.currentFinale = null;
        this.finalePhase = 'idle';
        this.startNextFinaleIfReady(now);
        return true;
    }

    startNextFinaleIfReady(now = this.getRuntimeNow()) {
        this.ensureFinaleRuntimeState();
        if (this.currentFinale || this.rendererStatus?.state !== 'ready' || !this.renderer?.initialized) {
            this.emitFinaleTelemetry();
            return false;
        }
        const next = this.finaleQueue.shift();
        if (!next) {
            this.emitFinaleTelemetry();
            return false;
        }
        this.startFinaleEntry(next, now);
        return true;
    }

    failFinale(finaleId, error, now = this.getRuntimeNow()) {
        this.ensureFinaleRuntimeState();
        if (!finaleId || this.failingFinaleIds.has(finaleId)) return false;
        this.failingFinaleIds.add(finaleId);
        try {
            const message = error?.message || String(error || 'Unknown finale renderer error');
            console.error(`[WebGPU Fireworks] Finale ${finaleId || 'unknown'} failed:`, error);
            this.timelineQueue = this.timelineQueue.filter(event => event.finaleId !== finaleId);
            for (const [effectId, plan] of this.effectPlans.entries()) {
                if (plan.finaleId !== finaleId) continue;
                this.effectPlans.delete(effectId);
                this.activeShows.delete(effectId);
            }
            this.finaleIds.delete(finaleId);
            if (this.currentFinale?.id === finaleId) {
                this.currentFinale = null;
                this.finalePhase = 'idle';
                this.startNextFinaleIfReady(now);
            }
            this.emitFinaleTelemetry({ finaleError: message });
            return false;
        } finally {
            this.failingFinaleIds.delete(finaleId);
        }
    }

    handleFinale(data = {}) {
        this.ensureFinaleRuntimeState();
        const id = this.finaleIdentity(data);
        if (this.finaleIds.has(id)) {
            return { accepted: false, duplicate: true, reason: 'duplicate', id, queueLength: this.finaleQueue.length };
        }
        const showPlan = this.isValidShowPlan(data.showPlan)
            ? { ...data.showPlan, id }
            : null;
        const completionNotification = this.normalizeCompletionNotification(data.completionNotification);
        const entry = { id, data: { ...data, id }, showPlan, legacy: !showPlan, completionNotification };
        const rendererKnownUnavailable = (
            (this.rendererStatus?.state && this.rendererStatus.state !== 'ready') ||
            this.renderer?.initialized === false
        );
        if (data.requiresRendererReady === true && rendererKnownUnavailable) {
            return {
                accepted: false,
                reason: 'renderer-not-ready',
                id,
                queueLength: this.finaleQueue.length
            };
        }
        const queued = Boolean(this.currentFinale || rendererKnownUnavailable);
        this.finaleIds.add(id);
        let details;
        if (queued) {
            this.finaleQueue.push(entry);
            details = showPlan
                ? { count: showPlan.cues.reduce((sum, cue) => sum + (cue.launches?.length || 0), 0) }
                : this.describeLegacyFinale(entry.data);
            this.emitFinaleTelemetry();
        } else details = this.startFinaleEntry(entry, this.getRuntimeNow());
        return {
            accepted: true,
            queued,
            legacy: entry.legacy,
            id,
            queueLength: this.finaleQueue.length,
            count: details.count,
            crackleInterval: details.crackleInterval,
            seededPhase: details.seededPhase,
            frequency: details.frequency
        };
    }

    handleFinaleSocketEvent(data = {}) {
        const rawEventId = data.eventId ?? data.id;
        const eventId = (typeof rawEventId === 'string' || typeof rawEventId === 'number')
            ? String(rawEventId).trim().slice(0, 160)
            : '';
        let result;
        try {
            result = this.handleFinale(data);
        } catch (error) {
            console.error('[WebGPU Fireworks] Finale queue rejected:', error);
            result = { accepted: false, reason: 'renderer-error', id: eventId || null };
        }
        if (data.ackRequested === true && eventId) {
            this.socket?.emit('webgpu-fireworks:finale-ack', {
                eventId,
                accepted: result.accepted === true,
                ...(result.accepted === true ? {} : { reason: result.reason || 'queue-rejected' })
            });
        }
        return result;
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
        document.getElementById('follower-username').textContent = data.usernameText || data.username || '';
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

    normalizeCompletionNotification(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const clamp = (input, min, max, fallback) => {
            const number = Number(input);
            return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
        };
        const text = (input, fallback, maxLength) => {
            const normalized = typeof input === 'string' ? input.trim() : '';
            return (normalized || fallback).slice(0, maxLength);
        };
        const username = text(value.username, 'Superfan', 80);
        const profilePictureUrl = typeof value.profilePictureUrl === 'string' &&
            /^https?:\/\//i.test(value.profilePictureUrl.trim())
            ? value.profilePictureUrl.trim().slice(0, 2048)
            : null;
        const positions = ['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'];
        const sizes = ['small', 'medium', 'large', 'custom'];
        const styles = ['gradient-purple', 'gradient-blue', 'gradient-gold', 'gradient-rainbow', 'neon', 'minimal'];
        const entrances = ['scale', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'bounce', 'rotate'];
        return {
            username,
            usernameText: text(value.usernameText, `Thank you for being a Superfan, ${username}!`, 180),
            thankYouText: text(value.thankYouText, 'This firework was for you!', 180),
            profilePictureUrl,
            duration: Math.round(clamp(value.duration, 1000, 10000, 3000)),
            position: positions.includes(value.position) ? value.position : 'center',
            size: sizes.includes(value.size) ? value.size : 'medium',
            scale: clamp(value.scale, 0.5, 2, 1),
            style: styles.includes(value.style) ? value.style : 'gradient-purple',
            entrance: entrances.includes(value.entrance) ? value.entrance : 'scale'
        };
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
        this.processTimeline(now);
        const shouldSkip = this.config.frameSkipEnabled !== false && this.performanceMode === 'minimal' && (this.skippedFrame = !this.skippedFrame);
        let renderSucceeded = false;
        try {
            if (typeof this.renderer?.render === 'function') {
                this.renderer.render(delta, now / 1000, { present: !shouldSkip });
                renderSucceeded = true;
            }
        } catch (error) {
            console.error('[WebGPU Fireworks] Renderer frame failed:', error);
            const failedFinaleId = this.currentFinale?.id || null;
            this.setStatus(
                { state: 'error', reason: error?.message || String(error) },
                { transientFrameError: true }
            );
            if (failedFinaleId && this.currentFinale?.id === failedFinaleId) {
                this.failFinale(failedFinaleId, error, now);
            }
        }
        if (renderSucceeded && this.transientFrameError && this.rendererStatus.state === 'error') {
            this.setStatus({ state: 'ready' });
        }
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
        if (this.animationFrame !== null && this.animationFrame !== undefined && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.animationFrame);
        }
        if (typeof window !== 'undefined') window.removeEventListener('resize', this.resizeHandler);
        this.canvas?.removeEventListener('pointerdown', this.clickHandler);
        this.socket?.disconnect();
        this.renderer?.destroy();
        this.audio.destroy();
        this.timelineQueue.length = 0;
        this.effectPlans.clear();
        this.activeShows.clear();
        this.imageCache.clear();
        this.finaleQueue.length = 0;
        this.finaleIds.clear();
        this.currentFinale = null;
        this.finalePhase = 'idle';
        this.finaleGeneration = 0;
        this.failingFinaleIds.clear();
        this.transientFrameError = false;
        this.giftBacklog.clear();
        this.giftLaunchTimestamps.length = 0;
        this.giftDrainDue = null;
    }
}

let engine = null;
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', async () => {
    engine = new WebGPUFireworksEngine('fireworks-canvas');
    window.fireworksEngineInstance = engine;
    await engine.init();

    const sounds = Object.entries(engine.audio.CUE_MANIFEST);
    void Promise.all(sounds.map(([name, cue]) => engine.audio.preload(cue.url, name)))
        .then(() => engine.audio.ensureContext(false));

    const unlock = async () => {
        if (!await engine.audio.ensureContext(true)) {
            if (DEBUG) console.warn('[WebGPU Fireworks Audio] Browser interaction did not unlock audio');
            return;
        }
        if (DEBUG) console.debug('[WebGPU Fireworks Audio] Audio unlocked by browser interaction');
        for (const type of ['pointerdown', 'click', 'keydown', 'touchstart']) document.removeEventListener(type, unlock, true);
        engine.applyInteractiveMode();
        engine.setStatus({ audioStatus: 'ready' });
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
