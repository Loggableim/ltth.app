(function registerDashboardTTSRenderer(root, factory) {
  const exports = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = exports;
  }
  root.DashboardTTSRenderer = exports.DashboardTTSRenderer;
})(typeof window !== 'undefined' ? window : globalThis, (root) => {
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  /**
   * Reports the native lifecycle of the dashboard's shared TTS audio element.
   * The server owns queue settlement; this renderer only acknowledges what the
   * browser audio element has actually done.
   */
  class DashboardTTSRenderer {
    constructor({ audio, socket, now = () => Date.now(), progressIntervalMs = 120, AudioContext: AudioContextCtor } = {}) {
      this.audio = audio || null;
      this.socket = socket || null;
      this.now = now;
      this.progressIntervalMs = Math.max(50, Number(progressIntervalMs) || 120);
      this.AudioContext = AudioContextCtor || root.AudioContext || root.webkitAudioContext || null;
      this.activePlayback = null;
      this.audioContext = null;
      this.analyser = null;
      this.analyserData = null;
      this.mediaSource = null;
      this.analyserUnavailable = false;
    }

    setAudio(audio) {
      if (audio === this.audio) return;
      this._disposeActive(true);
      this.audio = audio || null;
      this.mediaSource = null;
      this.analyser = null;
      this.analyserData = null;
      this.analyserUnavailable = false;
    }

    setSocket(socket) {
      this.socket = socket || null;
    }

    /**
     * Bind one browser playback to a server playback identifier and start it.
     * @returns {Promise<boolean>} false when native playback rejects.
     */
    async play({ playbackId, source, route, cleanup } = {}) {
      const safePlaybackId = String(playbackId || '').trim();
      if (!safePlaybackId || !this.audio) return false;

      this._disposeActive(true);
      const active = {
        playbackId: safePlaybackId,
        source: String(source || 'unknown'),
        started: false,
        terminal: false,
        lastProgressAt: -Infinity,
        cleanup: typeof cleanup === 'function' ? cleanup : null,
        handlers: null
      };
      this.activePlayback = active;
      this._bindNativeEvents(active);

      try {
        if (typeof route === 'function') {
          await route(this.audio);
        }
        const playResult = this.audio.play();
        if (playResult && typeof playResult.then === 'function') {
          await playResult;
        }
        return true;
      } catch (error) {
        this._terminal(active, 'failed', {
          reason: error?.name || 'play-rejected'
        });
        return false;
      }
    }

    dispose() {
      this._disposeActive(false);
    }

    _bindNativeEvents(active) {
      const onPlaying = () => {
        if (!this._isCurrent(active) || active.started) return;
        active.started = true;
        this._ensureAnalyser();
        this._emit('tts:renderer:started', this._payload(active));
      };
      const onTimeUpdate = () => {
        if (!this._isCurrent(active) || !active.started) return;
        const now = this.now();
        if (now - active.lastProgressAt < this.progressIntervalMs) return;
        active.lastProgressAt = now;
        this._emit('tts:renderer:progress', this._payload(active, {
          level: this._readAudioLevel()
        }));
      };
      const onEnded = () => this._terminal(active, 'ended');
      const onError = () => this._terminal(active, 'failed', { reason: 'media-error' });

      active.handlers = { onPlaying, onTimeUpdate, onEnded, onError };
      this.audio.addEventListener('playing', onPlaying);
      this.audio.addEventListener('timeupdate', onTimeUpdate);
      this.audio.addEventListener('ended', onEnded);
      this.audio.addEventListener('error', onError);
    }

    _terminal(active, phase, details = {}) {
      if (!this._isCurrent(active) || active.terminal) return false;
      active.terminal = true;
      this._emit(`tts:renderer:${phase}`, this._payload(active, details));
      this._removeNativeEvents(active);
      if (active.cleanup) active.cleanup();
      if (this.activePlayback === active) this.activePlayback = null;
      return true;
    }

    _disposeActive(emitFailure) {
      const active = this.activePlayback;
      if (!active) return;
      if (emitFailure) {
        this._terminal(active, 'failed', { reason: 'playback-replaced' });
        return;
      }
      this._removeNativeEvents(active);
      if (active.cleanup) active.cleanup();
      if (this.activePlayback === active) this.activePlayback = null;
    }

    _removeNativeEvents(active) {
      if (!this.audio || !active?.handlers) return;
      this.audio.removeEventListener('playing', active.handlers.onPlaying);
      this.audio.removeEventListener('timeupdate', active.handlers.onTimeUpdate);
      this.audio.removeEventListener('ended', active.handlers.onEnded);
      this.audio.removeEventListener('error', active.handlers.onError);
      active.handlers = null;
    }

    _isCurrent(active) {
      return this.activePlayback === active && !active.terminal;
    }

    _payload(active, details = {}) {
      const currentTime = Number(this.audio?.currentTime);
      return {
        playbackId: active.playbackId,
        currentTimeMs: Number.isFinite(currentTime) ? Math.max(0, Math.round(currentTime * 1000)) : 0,
        ...details
      };
    }

    _emit(event, payload) {
      if (this.socket && typeof this.socket.emit === 'function') {
        this.socket.emit(event, payload);
      }
    }

    _ensureAnalyser() {
      if (this.analyser || this.analyserUnavailable || !this.audio || !this.AudioContext) return;
      try {
        this.audioContext = this.audioContext || new this.AudioContext();
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 512;

        // captureStream observes the element without replacing a configured
        // element sink. Fall back to a single reusable MediaElementSource only
        // when the element is still on its default route.
        if (typeof this.audio.captureStream === 'function') {
          this.mediaSource = this.audioContext.createMediaStreamSource(this.audio.captureStream());
          this.mediaSource.connect(analyser);
        } else {
          const sinkId = String(this.audio.sinkId || 'default');
          if (sinkId !== 'default') {
            this.analyserUnavailable = true;
            return;
          }
          this.mediaSource = this.mediaSource || this.audioContext.createMediaElementSource(this.audio);
          this.mediaSource.connect(analyser);
          analyser.connect(this.audioContext.destination);
        }

        this.analyser = analyser;
        this.analyserData = new Uint8Array(analyser.fftSize);
      } catch (error) {
        // Analysis is optional; native lifecycle acknowledgements remain exact.
        this.analyserUnavailable = true;
        this.analyser = null;
        this.analyserData = null;
      }
    }

    _readAudioLevel() {
      if (!this.analyser || !this.analyserData) return null;
      try {
        this.analyser.getByteTimeDomainData(this.analyserData);
        let total = 0;
        for (const sample of this.analyserData) {
          total += Math.abs(sample - 128) / 128;
        }
        return Number(clamp((total / this.analyserData.length) * 2.2, 0, 1).toFixed(3));
      } catch (error) {
        this.analyserUnavailable = true;
        return null;
      }
    }
  }

  return { DashboardTTSRenderer };
});
