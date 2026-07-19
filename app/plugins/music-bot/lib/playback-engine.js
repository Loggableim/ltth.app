const { spawn } = require('child_process');
const EventEmitter = require('events');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const {
  SOUND_BOT_IPC_PREFIX,
  SOUND_BOT_PROCESS_MARKER
} = require('./soundbot-process-registry');

const DEFAULT_DUCKING_TARGET_PERCENT = 35;
const DEFAULT_NORMALIZATION_INTEGRATED_LUFS = -16;
const DEFAULT_NORMALIZATION_TRUE_PEAK_DB = -1.5;
const DEFAULT_NORMALIZATION_LRA = 11;
const SEEK_ERROR_CODES = new Set([
  'PLAYBACK_SEEK_INVALID_POSITION',
  'PLAYBACK_SEEK_STATE',
  'PLAYBACK_STALE_ID',
  'PLAYBACK_UNSEEKABLE',
  'PLAYBACK_UNKNOWN_DURATION',
  'MPV_IPC_DISCONNECTED'
]);

function createSeekError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

class PlaybackEngine extends EventEmitter {
  constructor(config, api, options = {}) {
    super();
    this.config = config;
    this.api = api;
    this.process = null;
    this.ipcPath = null;
    this.socket = null;
    this.nowPlaying = null;
    this.state = 'idle';
    this.masterVolume = this._clampVolume(config.defaultVolume);
    this.volume = this.masterVolume;
    this._buffer = '';
    this._fadeTimer = null;
    this._restartAttempts = 0;
    this._shuttingDown = false;
    this._duckActiveCount = 0;
    this._duckReleaseTimer = null;
    this._timedDuckActive = false;
    this._crossfadeOutgoingTrack = null;
    this._replacementOutgoingTrack = null;
    this._pendingCommands = new Map();
    this._nextCommandId = 1;
    this._skipInProgress = false;
    this._volumeCommandQueue = Promise.resolve();
    this._destroyed = false;
    this._restarting = false;
    this._processGeneration = 0;
    this._socketGeneration = 0;
    this._ownedPids = new Set();
    this._expectedProcessStops = new WeakSet();
    this._processRegistry = options.processRegistry || null;
    const timing = options.timing || options;
    this._now = typeof timing.now === 'function' ? timing.now : Date.now;
    this._setTimeout = typeof timing.setTimeout === 'function' ? timing.setTimeout : setTimeout;
    this._clearTimeout = typeof timing.clearTimeout === 'function' ? timing.clearTimeout : clearTimeout;
    this._heartbeatState = options.heartbeatState && typeof options.heartbeatState === 'object'
      ? options.heartbeatState
      : {};
    this._installHeartbeatStateAccessors();
    if (this._heartbeatWindowStartedAt === undefined) this._heartbeatWindowStartedAt = null;
    if (this._heartbeatFailuresInWindow === undefined) this._heartbeatFailuresInWindow = 0;
    if (this._heartbeatRecoveryPerformed === undefined) this._heartbeatRecoveryPerformed = false;
    if (this._heartbeatLockEmitted === undefined) this._heartbeatLockEmitted = false;
    this._heartbeatRecoveryInProgress = false;
    this._heartbeatPromise = null;
    this._lastIpcLatencyMs = null;
    this._lastProbeConnected = null;
    this._lastMediaTitle = null;
    this._lastMediaBasename = null;
  }

  _installHeartbeatStateAccessors() {
    const fields = {
      _heartbeatWindowStartedAt: 'windowStartedAt',
      _heartbeatFailuresInWindow: 'failuresInWindow',
      _heartbeatRecoveryPerformed: 'recoveryPerformed',
      _heartbeatLockEmitted: 'lockEmitted'
    };
    Object.entries(fields).forEach(([property, key]) => {
      Object.defineProperty(this, property, {
        configurable: false,
        enumerable: false,
        get: () => this._heartbeatState[key],
        set: (value) => {
          this._heartbeatState[key] = value;
        }
      });
    });
  }

  updateConfig(config = {}) {
    this.config = config;
    if (Object.prototype.hasOwnProperty.call(config, 'defaultVolume')) {
      this.masterVolume = this._clampVolume(config.defaultVolume);
      if (this.state === 'idle') {
        this.volume = this._getEffectiveVolume();
      }
    }
    return this.config;
  }

  async play(track) {
    this._assertNotDestroyed();
    if (!track || (!track.url && !track.localPath)) {
      throw new Error('Invalid track');
    }

    this._lastMediaTitle = null;
    this._lastMediaBasename = null;
    await this._ensureProcess();
    await this._applyNormalizationFilter();
    const crossfadeMs = Number(this.config.crossfadeDuration || 0);
    const hasCurrent = this.nowPlaying && this.state === 'playing';
    const playbackUrl = track.localPath || track.streamUrl || track.url;

    const newTrackPayload = {
      id: track.id || randomUUID(),
      title: track.title,
      artist: track.artist || '',
      duration: track.duration || null,
      thumbnail: track.thumbnail || null,
      requestedBy: track.requestedBy || 'viewer',
      requesterAvatar: track.requesterAvatar || null,
      source: track.source || track.provider || 'youtube',
      provider: track.provider || track.source || null,
      providerId: track.providerId || null,
      trackKey: track.trackKey || null,
      sourceId: track.sourceId || null,
      catalogSongId: track.catalogSongId || null,
      canonicalKey: track.canonicalKey || null,
      artists: Array.isArray(track.artists) ? [...track.artists] : null,
      channelId: track.channelId || null,
      channelName: track.channelName || null,
      playlistId: track.playlistId || null,
      url: track.url || playbackUrl,
      localPath: track.localPath || null,
      streamUrl: track.streamUrl || null,
      youtubeId: track.youtubeId || null,
      isGiftRequest: Boolean(track.isGiftRequest),
      startedAt: Date.now()
    };

    if (crossfadeMs > 0 && hasCurrent) {
      const currentVolume = this.volume;
      const halfFadeMs = Math.floor(crossfadeMs / 2);
      this._crossfadeOutgoingTrack = this.nowPlaying;
      try {
        await this._fadeVolume(currentVolume, 0, halfFadeMs, true);
        await this._sendCommand(['loadfile', playbackUrl, 'replace']);
        await this._setMpvVolume(0);

        this.nowPlaying = newTrackPayload;
        this.state = 'playing';
        this.emit('track-start', this.nowPlaying);

        await this._fadeVolume(0, currentVolume, halfFadeMs, true);
      } catch (error) {
        this._crossfadeOutgoingTrack = null;
        throw error;
      }
    } else {
      await this._sendCommand(['loadfile', playbackUrl, 'replace']);
      await this.setVolume(this.masterVolume);

      this.nowPlaying = newTrackPayload;
      this.state = 'playing';
      this.emit('track-start', this.nowPlaying);
    }
  }

  async pause() {
    if (!this.process) return;
    await this._sendCommand(['set_property', 'pause', true]);
    this.state = 'paused';
    this.emit('paused');
  }

  async resume() {
    if (!this.process) return;
    await this._sendCommand(['set_property', 'pause', false]);
    this.state = 'playing';
    this.emit('resumed');
  }

  async seek(positionSeconds, { timeoutMs = 1500 } = {}) {
    const target = Number(positionSeconds);
    if (!Number.isFinite(target) || target < 0) {
      throw createSeekError('PLAYBACK_SEEK_INVALID_POSITION', 'Seek position must be a non-negative number');
    }
    const activeTrack = this.nowPlaying;
    const activeTrackId = activeTrack?.id;
    if (!activeTrack || !['playing', 'paused'].includes(this.state)) {
      throw createSeekError('PLAYBACK_SEEK_STATE', 'No active track is available for seeking');
    }
    if (!this.socket || this.socket.destroyed) {
      throw createSeekError('MPV_IPC_DISCONNECTED', 'mpv IPC is not connected');
    }

    try {
      const [seekableResult, initialDurationResult] = await Promise.all([
        this._sendCommand(['get_property', 'seekable'], {
          waitForResponse: true,
          timeoutMs
        }),
        this._sendCommand(['get_property', 'duration'], {
          waitForResponse: true,
          timeoutMs
        })
      ]);
      if (seekableResult?.data !== true) {
        throw createSeekError('PLAYBACK_UNSEEKABLE', 'The active track is not seekable');
      }
      const initialDuration = Number(initialDurationResult?.data);
      if (!Number.isFinite(initialDuration) || initialDuration <= 0) {
        throw createSeekError('PLAYBACK_UNKNOWN_DURATION', 'The active track has no known duration');
      }
      this._assertSeekTargetCurrent(activeTrack, activeTrackId);
      await this._sendCommand(['seek', target, 'absolute+exact'], {
        waitForResponse: true,
        timeoutMs
      });
      this._assertSeekTargetCurrent(activeTrack, activeTrackId);
      const [positionResult, durationResult] = await Promise.all([
        this._sendCommand(['get_property', 'time-pos'], { waitForResponse: true, timeoutMs }),
        this._sendCommand(['get_property', 'duration'], { waitForResponse: true, timeoutMs })
      ]);
      const position = Number(positionResult?.data);
      const duration = Number(durationResult?.data);
      if (!Number.isFinite(duration) || duration <= 0) {
        throw createSeekError('PLAYBACK_UNKNOWN_DURATION', 'The active track has no known duration');
      }
      if (!Number.isFinite(position)) {
        throw createSeekError('MPV_IPC_DISCONNECTED', 'mpv did not confirm the seek position');
      }
      this._assertSeekTargetCurrent(activeTrack, activeTrackId);
      activeTrack.duration = duration;
      activeTrack.startedAt = Date.now() - Math.round(position * 1000);
      return {
        track: activeTrack,
        position: Math.max(0, position),
        duration,
        seekable: true,
        state: this.state
      };
    } catch (error) {
      if (SEEK_ERROR_CODES.has(error?.code)) throw error;
      throw createSeekError('MPV_IPC_DISCONNECTED', error?.message || 'mpv IPC seek failed');
    }
  }

  _assertSeekTargetCurrent(activeTrack, activeTrackId) {
    if (this.nowPlaying !== activeTrack || this.nowPlaying?.id !== activeTrackId) {
      throw createSeekError('PLAYBACK_STALE_ID', 'The active track changed while seeking');
    }
    if (!['playing', 'paused'].includes(this.state)) {
      throw createSeekError('PLAYBACK_SEEK_STATE', 'Playback changed state while seeking');
    }
  }

  async stop() {
    const child = this.process;
    let stopError = null;
    try {
      if (child && this.socket && !this.socket.destroyed) {
        await this._sendCommand(['stop'], { waitForResponse: true });
      } else if (child && this._isLiveChild(child)) {
        stopError = new Error('mpv IPC is not connected for stop');
      }
    } catch (error) {
      stopError = error;
    } finally {
      if (stopError && child && this._isLiveChild(child)) {
        const socket = this.socket;
        if (socket) {
          socket.destroy();
          if (this.socket === socket) {
            this.socket = null;
            this._socketGeneration = 0;
          }
        }
        const terminated = await this._terminateProcess(child, {
          waitForClose: true,
          timeoutMs: 2000
        });
        if (this.process === child) {
          this.process = null;
        }
        if (terminated !== false) stopError = null;
      }
      this.nowPlaying = null;
      this.state = 'idle';
      this._crossfadeOutgoingTrack = null;
      this._replacementOutgoingTrack = null;
      this._skipInProgress = false;
      this._clearMediaDiagnostics();
    }
    if (stopError) throw stopError;
  }

  async skip() {
    const skippedTrack = this.nowPlaying;
    if (!skippedTrack) return;
    this._skipInProgress = true;
    this.nowPlaying = null;
    this.state = 'idle';
    this._crossfadeOutgoingTrack = null;
    this._replacementOutgoingTrack = null;
    this._clearMediaDiagnostics();
    await this._sendCommand(['stop']);
    this.emit('track-end', { track: skippedTrack, reason: 'skip' });
  }

  async setVolume(volume) {
    this.masterVolume = this._clampVolume(volume);
    const effectiveVolume = this._getEffectiveVolume();
    this.volume = effectiveVolume;
    if (!this.process) return;
    await this._setMpvVolume(effectiveVolume);
    this.emit('volume-changed', effectiveVolume);
  }

  async triggerDucking(durationMs) {
    const duckingConfig = this.config?.ducking || {};
    if (!duckingConfig.enabled) return;

    const holdCandidate = Number(durationMs);
    const configHold = Number(duckingConfig.holdMs);
    const holdMs = Math.max(
      Number.isFinite(holdCandidate)
        ? holdCandidate
        : (Number.isFinite(configHold) ? configHold : 1000),
      0
    );
    if (!this._timedDuckActive) {
      this._timedDuckActive = true;
      await this.beginDucking();
    }
    if (this._duckReleaseTimer) {
      clearTimeout(this._duckReleaseTimer);
    }

    this._duckReleaseTimer = setTimeout(async () => {
      try {
        this._duckReleaseTimer = null;
        this._timedDuckActive = false;
        await this.endDucking();
      } catch (error) {
        this.emit('error', error);
      }
    }, holdMs);
  }

  async beginDucking() {
    const duckingConfig = this.config?.ducking || {};
    if (!duckingConfig.enabled) return;
    this._duckActiveCount += 1;
    if (this._duckActiveCount !== 1) return;
    const target = this._getEffectiveVolume();
    const cfgFadeOut = Number(duckingConfig.fadeOutMs);
    const fadeOutMs = Math.max(Number.isFinite(cfgFadeOut) ? cfgFadeOut : 250, 0);
    await this._fadeVolume(this.volume, target, fadeOutMs, true);
  }

  async endDucking() {
    const duckingConfig = this.config?.ducking || {};
    if (!duckingConfig.enabled || this._duckActiveCount === 0) return;
    this._duckActiveCount = Math.max(this._duckActiveCount - 1, 0);
    if (this._duckActiveCount !== 0) return;
    const cfgFadeIn = Number(duckingConfig.fadeInMs);
    const fadeInMs = Math.max(Number.isFinite(cfgFadeIn) ? cfgFadeIn : 700, 0);
    await this._fadeVolume(this.volume, this._getEffectiveVolume(), fadeInMs, true);
  }

  _clampRange(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  }

  async shutdown() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._shuttingDown = true;
    if (this._duckReleaseTimer) {
      clearTimeout(this._duckReleaseTimer);
      this._duckReleaseTimer = null;
    }
    if (this._fadeTimer) {
      clearInterval(this._fadeTimer);
      this._fadeTimer = null;
    }
    const socket = this.socket;
    const child = this.process;
    if (socket) {
      socket.destroy();
      if (this.socket === socket) {
        this.socket = null;
        this._socketGeneration = 0;
      }
    }
    this._rejectPendingCommands(new Error('mpv playback engine was shut down'));
    if (child && this._isLiveChild(child)) {
      this._expectedProcessStops.add(child);
      child.once?.('close', () => {
        this._shuttingDown = false;
      });
      if (this.process === child) {
        this.process = null;
      }
      await this._terminateProcess(child, {
        waitForClose: Number.isInteger(child.pid),
        timeoutMs: 2000
      });
    } else {
      this._shuttingDown = false;
      if (this.process === child) {
        this.process = null;
      }
    }
    if (this.ipcPath && fs.existsSync(this.ipcPath)) {
      fs.unlinkSync(this.ipcPath);
    }
    this.nowPlaying = null;
    this.state = 'idle';
    this._crossfadeOutgoingTrack = null;
    this._replacementOutgoingTrack = null;
    this._restartAttempts = 0;
    this._duckActiveCount = 0;
    this._timedDuckActive = false;
    this.volume = this.masterVolume;
    this._clearMediaDiagnostics();
  }

  async restart() {
    this._assertNotDestroyed();
    const currentTrack = this.nowPlaying;
    const child = this.process;
    const socket = this.socket;
    this._restarting = true;
    this._shuttingDown = true;
    if (socket) {
      socket.destroy();
      if (this.socket === socket) {
        this.socket = null;
        this._socketGeneration = 0;
      }
    }
    this._rejectPendingCommands(new Error('mpv playback engine is restarting'));

    try {
      if (child && this._isLiveChild(child)) {
        this._expectedProcessStops.add(child);
        await this._terminateProcess(child, { waitForClose: true });
      }
      if (this.process === child) {
        this.process = null;
      }
      if (this.ipcPath && fs.existsSync(this.ipcPath)) {
        fs.unlinkSync(this.ipcPath);
      }
      this.state = 'idle';
      this._crossfadeOutgoingTrack = null;
      this._replacementOutgoingTrack = null;
      return currentTrack;
    } finally {
      this._restarting = false;
      this._shuttingDown = false;
    }
  }

  _assertNotDestroyed() {
    if (this._destroyed) {
      throw new Error('mpv playback engine was shut down');
    }
  }

  _isLiveChild(child) {
    return Boolean(child && (child.exitCode === null || child.exitCode === undefined));
  }

  async _terminateProcess(child, { waitForClose = false, timeoutMs = 2000 } = {}) {
    if (!child || !this._isLiveChild(child)) return true;
    const hasPid = Number.isInteger(child.pid);
    const isOwnedPid = hasPid && this._ownedPids.has(child.pid);
    if (hasPid && !isOwnedPid) return false;
    const boundedTimeoutMs = Math.min(Math.max(Number(timeoutMs) || 2000, 1), 2000);
    let closePromise = null;
    if (waitForClose && typeof child.once === 'function') {
      closePromise = new Promise((resolve) => {
        const onClose = () => {
          this._clearTimeout(timeout);
          resolve(true);
        };
        const timeout = this._setTimeout(() => {
          child.removeListener?.('close', onClose);
          resolve(false);
        }, boundedTimeoutMs);
        child.once('close', onClose);
      });
    }

    let terminatedByTaskkill = false;
    if (process.platform === 'win32' && isOwnedPid) {
      terminatedByTaskkill = await new Promise((resolve) => {
        let settled = false;
        let timeout = null;
        const finish = (success) => {
          if (settled) return;
          settled = true;
          if (timeout) this._clearTimeout(timeout);
          resolve(success);
        };
        try {
          const killer = spawn(
            'taskkill.exe',
            ['/PID', String(child.pid), '/T', '/F'],
            { stdio: 'ignore', windowsHide: true }
          );
          killer.once('error', () => finish(false));
          killer.once('close', (code) => finish(code === 0));
          timeout = this._setTimeout(() => finish(false), Math.min(500, boundedTimeoutMs));
        } catch (_) {
          finish(false);
        }
      });
    }

    if (!terminatedByTaskkill) {
      try {
        child.kill('SIGTERM');
      } catch (_) { /* process already exited */ }
    }
    if (closePromise) {
      return closePromise;
    }
    return terminatedByTaskkill || !hasPid;
  }

  getNowPlaying() {
    return this.nowPlaying;
  }

  getDiagnostics() {
    const liveOwnedPid = this._isLiveChild(this.process)
      && Number.isInteger(this.process?.pid)
      && this._ownedPids.has(this.process.pid)
      ? this.process.pid
      : null;
    const transportConnected = Boolean(
      liveOwnedPid
      && this.socket
      && !this.socket.destroyed
    );
    return {
      pid: liveOwnedPid,
      ipc: {
        connected: transportConnected && this._lastProbeConnected !== false,
        lastLatencyMs: this._lastIpcLatencyMs
      },
      media: {
        title: this._lastMediaTitle || this._safeMediaTitle(this.nowPlaying?.title),
        basename: this._lastMediaBasename
      },
      state: this.getState()
    };
  }

  async probe({ timeoutMs = 500 } = {}) {
    if (
      !this._isLiveChild(this.process)
      || !this.socket
      || this.socket.destroyed
    ) {
      this._lastProbeConnected = false;
      return this.getDiagnostics();
    }

    const startedAt = this._now();
    try {
      const [titleResult, pathResult] = await Promise.all([
        this._sendCommand(['get_property', 'media-title'], {
          waitForResponse: true,
          timeoutMs
        }),
        this._sendCommand(['get_property', 'path'], {
          waitForResponse: true,
          timeoutMs
        })
      ]);
      this._lastIpcLatencyMs = Math.max(0, this._now() - startedAt);
      this._lastProbeConnected = true;
      this._lastMediaTitle = this._safeMediaTitle(titleResult?.data)
        || this._safeMediaTitle(this.nowPlaying?.title);
      this._lastMediaBasename = this._safeMediaBasename(pathResult?.data);
    } catch (_) {
      this._lastIpcLatencyMs = Math.max(0, this._now() - startedAt);
      this._lastProbeConnected = false;
    }
    return this.getDiagnostics();
  }

  _safeMediaTitle(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).replace(/[\r\n\t]+/g, ' ').trim();
    if (!normalized) return null;
    if (this._isUnsafeMediaTitle(normalized)) return null;
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(normalized)) {
      return this._safeMediaBasename(normalized);
    }
    return normalized.slice(0, 256);
  }

  _isUnsafeMediaTitle(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    const hasQueryParameter = /[?&][^=&\s]+=[^&\s]+/.test(normalized);
    return hasQueryParameter && (normalized.includes('?') || !/\s/.test(normalized));
  }

  _safeMediaBasename(value) {
    if (value === null || value === undefined) return null;
    let normalized = String(value).trim();
    if (!normalized) return null;
    try {
      if (/^[a-z][a-z\d+.-]*:\/\//i.test(normalized)) {
        normalized = decodeURIComponent(new URL(normalized).pathname);
      }
    } catch (_) { /* fall back to separator-safe parsing */ }
    normalized = normalized.split(/[?#]/, 1)[0].replace(/\\/g, '/');
    const basename = normalized.split('/').filter(Boolean).at(-1) || null;
    return basename ? basename.slice(0, 256) : null;
  }

  rememberReplacementOutgoing(track) {
    if (!track || this.nowPlaying !== track) return false;
    this._replacementOutgoingTrack = track;
    return true;
  }

  clearNowPlaying({ preserveReplacementOutgoing = false } = {}) {
    this.nowPlaying = null;
    this.state = 'idle';
    this._crossfadeOutgoingTrack = null;
    this._clearMediaDiagnostics();
    if (!preserveReplacementOutgoing) {
      this._replacementOutgoingTrack = null;
    }
  }

  isPlaying() {
    this._repairStalePlaybackState();
    return this.state === 'playing';
  }

  getVolume() {
    return this.masterVolume;
  }

  getState() {
    this._repairStalePlaybackState();
    return this.state;
  }

  _repairStalePlaybackState() {
    // MPV can emit a delayed start-file event after a track has already ended
    // or been stopped. Do not let that event block queue and Auto-DJ recovery.
    if (this.state === 'playing' && !this.nowPlaying) {
      this.state = 'idle';
      this._clearMediaDiagnostics();
    }
  }

  _clearMediaDiagnostics() {
    this._lastMediaTitle = null;
    this._lastMediaBasename = null;
  }

  async getPosition({ timeoutMs = 500 } = {}) {
    if (!this.socket || this.state !== 'playing') return 0;
    return new Promise((resolve, reject) => {
      const requestId = Date.now();
      const handler = (chunk) => {
        try {
          const lines = chunk.toString().split('\n').filter(Boolean);
          for (const line of lines) {
            const msg = JSON.parse(line);
            if (msg.request_id === requestId && msg.data !== undefined) {
              clearTimeout(timeout);
              this.socket.removeListener('data', handler);
              resolve(Number(msg.data) || 0);
              return;
            }
          }
        } catch (_) { /* ignore parse errors */ }
      };
      const timeout = setTimeout(() => {
        this.socket.removeListener('data', handler);
        reject(new Error('mpv did not acknowledge command: get_property'));
      }, timeoutMs);
      this.socket.on('data', handler);
      this.socket.write(`${JSON.stringify({ command: ['get_property', 'time-pos'], request_id: requestId })}\n`, (error) => {
        if (!error) return;
        clearTimeout(timeout);
        this.socket.removeListener('data', handler);
        reject(error);
      });
    });
  }

  heartbeat({ timeoutMs = 500 } = {}) {
    if (this._heartbeatPromise) return this._heartbeatPromise;
    const operation = this._runHeartbeat({ timeoutMs });
    const tracked = operation.finally(() => {
      if (this._heartbeatPromise === tracked) {
        this._heartbeatPromise = null;
      }
    });
    this._heartbeatPromise = tracked;
    return tracked;
  }

  async _runHeartbeat({ timeoutMs }) {
    this._assertNotDestroyed();
    this._resetHeartbeatWindowIfExpired();
    try {
      if (!this._isLiveChild(this.process) || !this.socket || this.socket.destroyed) {
        throw new Error('mpv IPC is not connected');
      }
      const response = await this._sendCommand(['get_property', 'time-pos'], {
        waitForResponse: true,
        timeoutMs
      });
      this._lastProbeConnected = true;
      return {
        ok: true,
        action: 'healthy',
        failures: this._heartbeatFailuresInWindow,
        position: Number(response?.data) || 0,
        diagnostics: this.getDiagnostics()
      };
    } catch (error) {
      this._lastProbeConnected = false;
      return this._handleHeartbeatFailure(error, { resumePlayback: true });
    }
  }

  _resetHeartbeatWindowIfExpired(now = this._now()) {
    if (
      this._heartbeatWindowStartedAt !== null
      && now - this._heartbeatWindowStartedAt > 60000
    ) {
      this._heartbeatWindowStartedAt = null;
      this._heartbeatFailuresInWindow = 0;
      this._heartbeatRecoveryPerformed = false;
      this._heartbeatLockEmitted = false;
    }
  }

  async _handleHeartbeatFailure(error, { resumePlayback }) {
    const failureAt = this._now();
    this._resetHeartbeatWindowIfExpired(failureAt);
    if (this._heartbeatWindowStartedAt === null) {
      this._heartbeatWindowStartedAt = failureAt;
    }
    this._heartbeatFailuresInWindow += 1;
    const failures = this._heartbeatFailuresInWindow;

    if (failures === 1) {
      this.api.log?.(`[music-bot] MPV IPC heartbeat failed (1/3): ${error.message}`, 'warn');
      return {
        ok: false,
        action: 'counted',
        failures,
        position: 0,
        diagnostics: this.getDiagnostics()
      };
    }

    if (failures === 2 && !this._heartbeatRecoveryPerformed) {
      this._heartbeatRecoveryPerformed = true;
      // A third failure is dangerous for 60 seconds after the recovery
      // attempt, regardless of how long ago the first failure happened.
      this._heartbeatWindowStartedAt = failureAt;
      const retainedTrack = this.nowPlaying;
      this.api.log?.(`[music-bot] MPV IPC heartbeat failed (2/3); requesting supervised recovery: ${error.message}`, 'warn');
      this.emit('heartbeat-failure-confirmed', {
        track: retainedTrack,
        error,
        failures,
        resumePlayback: Boolean(resumePlayback),
        failureClass: 'ipc'
      });
      return {
        ok: false,
        action: 'confirmed',
        failures,
        position: 0,
        diagnostics: this.getDiagnostics()
      };
    }

    const lockError = new Error('mpv heartbeat safety lock engaged');
    lockError.code = 'MPV_HEARTBEAT_SAFETY_LOCK';
    if (!this._heartbeatLockEmitted) {
      this._heartbeatLockEmitted = true;
      this.emit('heartbeat-lock', {
        reason: 'heartbeat-lock',
        failures,
        windowMs: 60000,
        error: error.message
      });
    }
    throw lockError;
  }

  async _ensureProcess() {
    this._assertNotDestroyed();
    if (this._heartbeatPromise && !this._heartbeatRecoveryInProgress) {
      const result = await this._heartbeatPromise;
      if (result.action === 'counted') {
        const error = new Error('mpv heartbeat failure counted');
        error.code = 'MPV_HEARTBEAT_FAILURE_COUNTED';
        throw error;
      }
    }
    if (this._isLiveChild(this.process) && !Number.isInteger(this.process.pid) && !this.socket) {
      return;
    }
    if (this._isLiveChild(this.process)) {
      try {
        await this._sendCommand(['get_property', 'idle-active'], { waitForResponse: true });
        return;
      } catch (error) {
        const result = await this._handleHeartbeatFailure(error, { resumePlayback: false });
        if (result.action === 'counted') {
          error.code = 'MPV_HEARTBEAT_FAILURE_COUNTED';
          throw error;
        }
        return;
      }
    }

    await this._startProcess();
  }

  async _startProcess() {
    this._assertNotDestroyed();
    this._lastProbeConnected = null;
    const generation = ++this._processGeneration;

    const ipcIdentity = `${Date.now()}-${randomUUID()}`;
    this.ipcPath = process.platform === 'win32'
      ? `\\\\.\\pipe\\${SOUND_BOT_IPC_PREFIX}${ipcIdentity}`
      : path.join(os.tmpdir(), `${SOUND_BOT_IPC_PREFIX}${ipcIdentity}.sock`);
    const args = [
      '--idle=yes',
      `--title=${SOUND_BOT_PROCESS_MARKER}`,
      `--input-ipc-server=${this.ipcPath}`,
      '--no-video',
      '--force-window=no',
      '--audio-display=no',
      ...this._getAudioOutputArgs(),
      `--audio-device=${this.config.audioDevice || 'auto'}`
    ];

    const child = spawn(this._getMpvExecutablePath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let childSocket = null;
    this.process = child;
    if (Number.isInteger(child.pid)) {
      this._ownedPids.add(child.pid);
      this._processRegistry?.register?.(child.pid);
    }
    this._shuttingDown = false;
    this._restartAttempts = 0;

    child.on('error', (error) => {
      if (this.process !== child || this._processGeneration !== generation) return;
      if (error.code === 'ENOENT') {
        this.emit('error', new Error(
          `mpv nicht gefunden ("${this.config.mpvPath}"). ` +
          'Installiere mpv: https://mpv.io/installation/ — oder setze den Pfad in Music Bot → Einstellungen → Playback.'
        ));
        return;
      }
      this.emit('error', error);
    });

    child.on('close', (code) => {
      this._handleProcessClose(child, childSocket, generation, code);
    });

    child.stderr?.on('data', (data) => {
      if (this.process !== child || this._processGeneration !== generation) return;
      const message = data.toString();
      if (message.toLowerCase().includes('error')) {
        this.emit('error', new Error(message));
      }
    });

    try {
      childSocket = await this._connectSocket(child, this.ipcPath, generation);
    } catch (error) {
      if (this.process === child) {
        this._expectedProcessStops.add(child);
        await this._terminateProcess(child, { waitForClose: false });
        if (this.process === child) this.process = null;
      }
      throw error;
    }
  }

  _handleProcessClose(child, childSocket, generation, code) {
    if (Number.isInteger(child?.pid)) {
      this._ownedPids.delete(child.pid);
      this._processRegistry?.unregister?.(child.pid);
    }
    if (this.process !== child || this._processGeneration !== generation) {
      return;
    }

    if (this.socket === childSocket || this._socketGeneration === generation) {
      this.socket?.destroy();
      this.socket = null;
      this._socketGeneration = 0;
    }
    this._rejectPendingCommands(new Error(`mpv exited with code ${code ?? 'unknown'}`));
    this.process = null;
    const expected = this._expectedProcessStops.has(child);
    this._expectedProcessStops.delete(child);
    if (expected || this._shuttingDown || this._restarting || this._destroyed) {
      return;
    }
    this.state = 'idle';
    this.emit('crashed', { code });
  }

  _getMpvExecutablePath() {
    const configuredPath = String(this.config.mpvPath || 'mpv').trim() || 'mpv';
    if (process.platform !== 'win32' || path.extname(configuredPath)) {
      return configuredPath;
    }
    return `${configuredPath}.exe`;
  }

  _getAudioOutputArgs() {
    return this.config?.audioOutputDriver === 'null' ? ['--ao=null'] : [];
  }

  async _connectSocket(child = this.process, ipcPath = this.ipcPath, generation = this._processGeneration) {
    const maxAttempts = 10;
    let attempts = 0;
    return new Promise((resolve, reject) => {
      const tryConnect = () => {
        if (this._destroyed || this.process !== child || this._processGeneration !== generation) {
          reject(new Error('mpv connection attempt was retired'));
          return;
        }
        attempts += 1;
        let connected = false;
        const candidate = net.createConnection(ipcPath, () => {
          connected = true;
          candidate.removeListener('error', onConnectError);
          if (this._destroyed || this.process !== child || this._processGeneration !== generation) {
            candidate.destroy();
            reject(new Error('mpv connection attempt was retired'));
            return;
          }
          candidate.setEncoding('utf8');
          candidate.on('data', (chunk) => {
            if (this.socket === candidate && this._socketGeneration === generation) {
              this._onData(chunk);
            }
          });
          candidate.on('error', (error) => {
            if (this.socket !== candidate || this._socketGeneration !== generation) return;
            this._rejectPendingCommands(error);
            this.emit('error', error);
          });
          this.socket = candidate;
          this._socketGeneration = generation;
          resolve(candidate);
        });
        const onConnectError = (err) => {
          if (connected) return;
          candidate.destroy();
          if (attempts >= maxAttempts) {
            reject(err);
          } else {
            setTimeout(tryConnect, 50);
          }
        };
        candidate.once('error', onConnectError);
      };
      tryConnect();
    });
  }

  async _sendCommand(command, { waitForResponse = false, timeoutMs = 1500 } = {}) {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('mpv IPC is not connected');
    }

    if (!waitForResponse) {
      const payload = JSON.stringify({ command });
      return new Promise((resolve, reject) => {
        this.socket.write(`${payload}\n`, (error) => (error ? reject(error) : resolve()));
      });
    }

    const requestId = this._nextCommandId++;
    const payload = JSON.stringify({ command, request_id: requestId });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._pendingCommands.delete(requestId);
        reject(new Error(`mpv did not acknowledge command: ${command[0]}`));
      }, Math.max(1, Number(timeoutMs) || 1500));
      this._pendingCommands.set(requestId, { resolve, reject, timeout });
      this.socket.write(`${payload}\n`, (error) => {
        if (!error) return;
        clearTimeout(timeout);
        this._pendingCommands.delete(requestId);
        reject(error);
      });
    });
  }

  _rejectPendingCommands(error) {
    this._pendingCommands.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(error);
    });
    this._pendingCommands.clear();
  }

  _setMpvVolume(volume) {
    const send = () => this._sendCommand(['set_property', 'volume', volume], { waitForResponse: true });
    const result = this._volumeCommandQueue.then(send, send);
    this._volumeCommandQueue = result.catch(() => {});
    return result;
  }

  _clampVolume(volume) {
    const num = Number(volume);
    if (!Number.isFinite(num)) {
      return 50;
    }
    return Math.min(100, Math.max(0, num));
  }

  _getEffectiveVolume() {
    const duckingConfig = this.config?.ducking || {};
    if (!duckingConfig.enabled || this._duckActiveCount <= 0) {
      return this._clampVolume(this.masterVolume);
    }
    const targetPercent = Number(duckingConfig.targetVolumePercent);
    const factor = Math.min(
      1,
      Math.max(
        0,
        (Number.isFinite(targetPercent) ? targetPercent : DEFAULT_DUCKING_TARGET_PERCENT) / 100
      )
    );
    return this._clampVolume(this.masterVolume * factor);
  }

  async _applyNormalizationFilter() {
    const normalization = this.config?.normalization || {};
    if (!normalization.enabled) {
      await this._sendCommand(['af', 'clr']);
      return;
    }
    const i = this._clampRange(
      normalization.integratedLufs,
      -70,
      0,
      DEFAULT_NORMALIZATION_INTEGRATED_LUFS
    );
    const tp = this._clampRange(
      normalization.truePeakDb,
      -9,
      0,
      DEFAULT_NORMALIZATION_TRUE_PEAK_DB
    );
    const lra = this._clampRange(normalization.lra, 1, 20, DEFAULT_NORMALIZATION_LRA);
    const filter = `lavfi=[loudnorm=I=${i}:TP=${tp}:LRA=${lra}]`;
    await this._sendCommand(['af', 'set', filter]);
  }

  async _fadeVolume(from, to, durationMs, emitVolumeEvent = true) {
    if (this._fadeTimer) {
      clearInterval(this._fadeTimer);
      this._fadeTimer = null;
    }
    const duration = Math.max(durationMs, 0);
    if (duration === 0 || from === to) {
      this.volume = to;
      await this._setMpvVolume(to);
      if (emitVolumeEvent) {
        this.emit('volume-changed', to);
      }
      return;
    }

    const stepInterval = 50;
    const steps = Math.ceil(duration / stepInterval);
    const delta = (to - from) / steps;
    let currentStep = 0;
    let currentVolume = from;

    await this._setMpvVolume(from);

    await new Promise((resolve) => {
      this._fadeTimer = setInterval(async () => {
        try {
          currentStep += 1;
          currentVolume = currentVolume + delta;
          if (currentStep >= steps) {
            currentVolume = to;
          }
          this.volume = currentVolume;
          await this._setMpvVolume(currentVolume);
          if (emitVolumeEvent) {
            this.emit('volume-changed', currentVolume);
          }
          if (currentStep >= steps) {
            clearInterval(this._fadeTimer);
            this._fadeTimer = null;
            resolve();
          }
        } catch (error) {
          clearInterval(this._fadeTimer);
          this._fadeTimer = null;
          this.emit('error', error);
          resolve();
        }
      }, stepInterval);
    });
  }

  async getAvailableDevices() {
    return new Promise((resolve) => {
      try {
        const proc = spawn(this.config.mpvPath, ['--audio-device=help'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        proc.on('close', () => {
          const lines = stdout.split('\n');
          const devices = [];
          lines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('Available') || trimmed.startsWith('Auto')) {
              return;
            }
            const parts = trimmed.split(':').map((p) => p.trim());
            if (parts.length >= 2) {
              devices.push({ id: parts[0], name: parts.slice(1).join(':') });
            }
          });
          resolve(devices);
        });
        proc.on('error', () => resolve([]));
      } catch (error) {
        this.api.log?.(`[music-bot] Failed to list audio devices: ${error.message}`, 'error');
        resolve([]);
      }
    });
  }

  _onData(chunk) {
    this._buffer += chunk;
    const parts = this._buffer.split('\n');
    this._buffer = parts.pop() || '';
    for (const part of parts) {
      this._handleMessage(part);
    }
  }

  _handleMessage(raw) {
    if (!raw.trim()) return;
    try {
      const msg = JSON.parse(raw);
      const pending = this._pendingCommands.get(msg.request_id);
      if (pending) {
        clearTimeout(pending.timeout);
        this._pendingCommands.delete(msg.request_id);
        if (msg.error && msg.error !== 'success') {
          pending.reject(new Error(`mpv command failed: ${msg.error}`));
        } else {
          pending.resolve(msg);
        }
        return;
      }

      if (msg.event === 'end-file') {
        if (this._skipInProgress) {
          this._skipInProgress = false;
          return;
        }
        const crossfadeOutgoingTrack = this._crossfadeOutgoingTrack;
        const replacementOutgoingTrack = this._replacementOutgoingTrack;
        const outgoingTrack = crossfadeOutgoingTrack || replacementOutgoingTrack;
        const endedTrack = outgoingTrack || this.nowPlaying;
        const mpvReason = String(msg.reason || 'unknown');
        // `loadfile ... replace` emits a stop for the outgoing playlist entry.
        // It is not a completed song and must not trigger another queue advance.
        if (replacementOutgoingTrack && mpvReason === 'stop') {
          this._replacementOutgoingTrack = null;
          return;
        }
        if (!outgoingTrack && mpvReason === 'stop') {
          return;
        }
        const expectedCrossfadeStop = Boolean(crossfadeOutgoingTrack) && mpvReason === 'stop';
        const isPlaybackError = mpvReason !== 'eof' && !expectedCrossfadeStop;
        const reason = isPlaybackError
          ? 'error'
          : (crossfadeOutgoingTrack ? 'crossfade' : 'ended');
        this._crossfadeOutgoingTrack = null;
        this._replacementOutgoingTrack = null;
        if (!outgoingTrack) {
          this.state = 'idle';
        }
        const trackEnd = { track: endedTrack, reason };
        if (isPlaybackError) {
          trackEnd.mpvReason = mpvReason;
          trackEnd.error = msg.error
            || msg.file_error
            || `MPV ended playback unexpectedly (${mpvReason})`;
        }
        this.emit('track-end', trackEnd);
        if (this.nowPlaying === endedTrack) {
          this.nowPlaying = null;
          this._clearMediaDiagnostics();
        }
      } else if (msg.event === 'property-change' && msg.name === 'volume') {
        this.volume = msg.data;
        this.emit('volume-changed', this.volume);
      } else if (msg.event === 'start-file' && this.nowPlaying) {
        // play() owns the state transition. A late MPV event must not revive a
        // "playing" state once there is no active application-level track.
        this.state = 'playing';
      }
    } catch (error) {
      this.emit('error', error);
    }
  }
}

module.exports = PlaybackEngine;
