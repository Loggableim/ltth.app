const { spawn } = require('child_process');
const EventEmitter = require('events');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');

const DEFAULT_DUCKING_TARGET_PERCENT = 35;
const DEFAULT_NORMALIZATION_INTEGRATED_LUFS = -16;
const DEFAULT_NORMALIZATION_TRUE_PEAK_DB = -1.5;
const DEFAULT_NORMALIZATION_LRA = 11;

class PlaybackEngine extends EventEmitter {
  constructor(config, api) {
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
    this._pendingCommands = new Map();
    this._nextCommandId = 1;
    this._skipInProgress = false;
    this._volumeCommandQueue = Promise.resolve();
  }

  async play(track) {
    if (!track || (!track.url && !track.localPath)) {
      throw new Error('Invalid track');
    }

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
      source: track.source || 'youtube',
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

  async stop() {
    if (!this.process) return;
    await this._sendCommand(['stop'], { waitForResponse: true });
    this.state = 'stopped';
  }

  async skip() {
    const skippedTrack = this.nowPlaying;
    if (!skippedTrack) return;
    this._skipInProgress = true;
    this.nowPlaying = null;
    this.state = 'idle';
    this._crossfadeOutgoingTrack = null;
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
    this._shuttingDown = true;
    if (this._duckReleaseTimer) {
      clearTimeout(this._duckReleaseTimer);
      this._duckReleaseTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this._rejectPendingCommands(new Error('mpv playback engine was shut down'));
    const process = this.process;
    this.process = null;
    if (process && (process.exitCode === null || process.exitCode === undefined)) {
      process.once('close', () => {
        this._shuttingDown = false;
      });
      process.kill('SIGTERM');
    } else {
      this._shuttingDown = false;
    }
    if (this.ipcPath && fs.existsSync(this.ipcPath)) {
      fs.unlinkSync(this.ipcPath);
    }
    this.nowPlaying = null;
    this.state = 'idle';
    this._restartAttempts = 0;
    this._duckActiveCount = 0;
    this._timedDuckActive = false;
    this.volume = this.masterVolume;
  }

  async restart() {
    const currentTrack = this.nowPlaying;
    const child = this.process;
    this._shuttingDown = true;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this._rejectPendingCommands(new Error('mpv playback engine is restarting'));

    try {
      if (child && (child.exitCode === null || child.exitCode === undefined)) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('mpv did not stop for restart'));
          }, 5000);
          child.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
          child.kill('SIGTERM');
        });
      }
      if (this.process === child) {
        this.process = null;
      }
      if (this.ipcPath && fs.existsSync(this.ipcPath)) {
        fs.unlinkSync(this.ipcPath);
      }
      this.state = 'idle';
      this._crossfadeOutgoingTrack = null;
      return currentTrack;
    } finally {
      this._shuttingDown = false;
    }
  }

  getNowPlaying() {
    return this.nowPlaying;
  }

  clearNowPlaying() {
    this.nowPlaying = null;
    this.state = 'idle';
    this._crossfadeOutgoingTrack = null;
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
    }
  }

  async getPosition() {
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
      }, 500);
      this.socket.on('data', handler);
      this.socket.write(`${JSON.stringify({ command: ['get_property', 'time-pos'], request_id: requestId })}\n`, (error) => {
        if (!error) return;
        clearTimeout(timeout);
        this.socket.removeListener('data', handler);
        reject(error);
      });
    });
  }

  async _ensureProcess() {
    if (this.process && this.process.exitCode === null) return;

    this.ipcPath = process.platform === 'win32'
      ? `\\\\.\\pipe\\music-bot-mpv-${Date.now()}`
      : path.join(os.tmpdir(), `music-bot-mpv-${Date.now()}.sock`);
    const args = [
      '--idle=yes',
      `--input-ipc-server=${this.ipcPath}`,
      '--no-video',
      '--force-window=no',
      '--audio-display=no',
      `--audio-device=${this.config.audioDevice || 'auto'}`
    ];

    this.process = spawn(this._getMpvExecutablePath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this._shuttingDown = false;
    this._restartAttempts = 0;

    this.process.on('error', (error) => {
      if (error.code === 'ENOENT') {
        this.emit('error', new Error(
          `mpv nicht gefunden ("${this.config.mpvPath}"). ` +
          'Installiere mpv: https://mpv.io/installation/ — oder setze den Pfad in Music Bot → Einstellungen → Playback.'
        ));
        return;
      }
      this.emit('error', error);
    });

    this.process.on('close', (code) => {
      this.socket?.destroy();
      this.socket = null;
      this._rejectPendingCommands(new Error(`mpv exited with code ${code ?? 'unknown'}`));
      this.process = null;
      if (this._shuttingDown) {
        return;
      }
      this.state = 'idle';
      this.emit('crashed', { code });
    });

    this.process.stderr.on('data', (data) => {
      const message = data.toString();
      if (message.toLowerCase().includes('error')) {
        this.emit('error', new Error(message));
      }
    });

    await this._connectSocket();
  }

  _getMpvExecutablePath() {
    const configuredPath = String(this.config.mpvPath || 'mpv').trim() || 'mpv';
    if (process.platform !== 'win32' || path.extname(configuredPath)) {
      return configuredPath;
    }
    return `${configuredPath}.exe`;
  }

  async _connectSocket() {
    const maxAttempts = 10;
    let attempts = 0;
    await new Promise((resolve, reject) => {
      const tryConnect = () => {
        attempts += 1;
        this.socket = net.createConnection(this.ipcPath, () => {
          this.socket.setEncoding('utf8');
          this.socket.on('data', (chunk) => this._onData(chunk));
          this.socket.on('error', (error) => {
            this._rejectPendingCommands(error);
            this.emit('error', error);
          });
          resolve();
        });
        this.socket.on('error', (err) => {
          if (attempts >= maxAttempts) {
            reject(err);
          } else {
            setTimeout(tryConnect, 50);
          }
        });
      };
      tryConnect();
    });
  }

  async _sendCommand(command, { waitForResponse = false } = {}) {
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
      }, 1500);
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
        const outgoingTrack = this._crossfadeOutgoingTrack;
        const endedTrack = outgoingTrack || this.nowPlaying;
        const mpvReason = String(msg.reason || 'unknown');
        // `loadfile ... replace` emits a stop for the outgoing playlist entry.
        // It is not a completed song and must not trigger another queue advance.
        if (!outgoingTrack && mpvReason === 'stop') {
          return;
        }
        const isPlaybackError = mpvReason === 'error';
        const reason = outgoingTrack ? 'crossfade' : (isPlaybackError ? 'error' : 'ended');
        this._crossfadeOutgoingTrack = null;
        if (!outgoingTrack) {
          this.state = 'idle';
        }
        const trackEnd = { track: endedTrack, reason };
        if (isPlaybackError) {
          trackEnd.mpvReason = mpvReason;
          trackEnd.error = msg.error || msg.file_error || 'MPV could not play this stream';
        }
        this.emit('track-end', trackEnd);
        if (this.nowPlaying?.id === endedTrack?.id) {
          this.nowPlaying = null;
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
