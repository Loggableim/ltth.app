const EventEmitter = require('events');
const { randomUUID } = require('crypto');
const PlaybackEngine = require('./playback-engine');

const RAMP_STEP_MS = 50;

class TransitionAbortedError extends Error {
  constructor(reason) {
    super(`Playback transition aborted by ${reason}`);
    this.name = 'TransitionAbortedError';
    this.code = 'PLAYBACK_TRANSITION_ABORTED';
  }
}

class PlaybackController extends EventEmitter {
  constructor(config = {}, api = {}, options = {}) {
    super();
    this.config = config || {};
    this.api = api || {};

    const optionSource = options && Object.keys(options).length
      ? options
      : (api?.engineFactory || api?.timing ? api : {});
    this._engineFactory = optionSource.engineFactory || ((context) => (
      new PlaybackEngine(context.config, context.api, { timing: context.timing })
    ));
    const timing = optionSource.timing || optionSource;
    this._timing = {
      now: typeof timing.now === 'function' ? timing.now : Date.now,
      setTimeout: typeof timing.setTimeout === 'function' ? timing.setTimeout : setTimeout,
      clearTimeout: typeof timing.clearTimeout === 'function' ? timing.clearTimeout : clearTimeout
    };

    this.lifecycle = 'active';
    this.safetyLock = false;
    this._safetyReason = null;
    this._safetyLockedAt = null;
    this.transportState = 'idle';
    this.transitionGeneration = 0;
    this.activePlaybackId = null;
    this.activeSlot = null;
    this.lastTransition = null;
    this.lastError = null;

    this._slots = { A: null, B: null };
    this._slotGeneration = 0;
    this._intentTail = Promise.resolve();
    this._activeTransition = null;
    this._crossfade = null;
    this._masterVolume = this._clampVolume(this.config.defaultVolume);
    this._duckActiveCount = 0;
    this._timedDuckUntil = 0;
  }

  play(track) {
    return this._enqueueIntent('play', async (generation) => {
      this._assertCanStartPlayback();
      if (!track || (!track.url && !track.localPath && !track.streamUrl)) {
        throw new Error('Invalid track');
      }

      const playbackTrack = {
        ...track,
        id: track.id || randomUUID()
      };
      const transition = this._createTransition('play', generation);
      transition.playbackId = randomUUID();
      this._activeTransition = transition;
      try {
        const active = this._getActiveSlot();
        const crossfadeMs = this._crossfadeDuration();
        if (active?.engine.getNowPlaying?.() && active.engine.isPlaying?.() && crossfadeMs > 0) {
          return await this._playWithCrossfade(active, playbackTrack, crossfadeMs, transition);
        }
        return await this._playOnActiveSlot(active, playbackTrack, transition);
      } finally {
        if (this._activeTransition === transition) {
          this._activeTransition = null;
        }
      }
    });
  }

  pause() {
    return this._enqueueIntent('pause', async () => {
      const slot = this._getActiveSlot();
      if (!slot) return;
      await slot.engine.pause();
      if (!slot.retired) {
        slot.state = 'paused';
        this.transportState = 'paused';
      }
    });
  }

  resume() {
    return this._enqueueIntent('resume', async () => {
      this._assertCanStartPlayback();
      const slot = this._getActiveSlot();
      if (!slot) return;
      await slot.engine.resume();
      if (!slot.retired) {
        slot.state = 'playing';
        this.transportState = 'playing';
      }
    });
  }

  stop() {
    const interruptedTransition = Boolean(this._crossfade);
    this._liveSlots().forEach((slot) => this._suppressTerminalForSlot(slot));
    this._abortActiveTransition('stop');
    return this._enqueueIntent('stop', async () => {
      if (interruptedTransition) {
        await this._terminateAllSlots();
      } else {
        const slot = this._getActiveSlot();
        let stopError = null;
        try {
          if (slot) {
            await slot.engine.stop();
          }
        } catch (error) {
          stopError = error;
        } finally {
          if (slot) {
            slot.playbackId = null;
            slot.state = 'idle';
            await this._retireSlot(slot);
          }
          this.activeSlot = null;
          this.activePlaybackId = null;
          this.transportState = 'idle';
        }
        if (stopError) throw stopError;
      }
    });
  }

  skip() {
    const interruptedTransition = Boolean(this._crossfade);
    const interruptedSlot = this._getActiveSlot();
    const interruptedTrack = interruptedSlot?.engine.getNowPlaying?.() || null;
    this._abortActiveTransition('skip');
    return this._enqueueIntent('skip', async () => {
      if (interruptedTransition) {
        if (interruptedSlot && interruptedTrack) {
          this._emitTrackEndOnce(interruptedSlot, { track: interruptedTrack, reason: 'skip' });
        }
        await this._terminateAllSlots();
        return;
      }

      const slot = this._getActiveSlot();
      if (!slot) return;
      await slot.engine.skip();
      slot.playbackId = null;
      slot.state = 'idle';
      this.activePlaybackId = null;
      this.transportState = 'idle';
    });
  }

  setVolume(volume) {
    const normalized = this._clampVolume(volume);
    this._masterVolume = normalized;
    this.config.defaultVolume = normalized;
    return this._enqueueIntent('set-volume', async () => {
      await Promise.all(this._liveSlots().map((slot) => slot.engine.setVolume(normalized)));
    });
  }

  getNowPlaying() {
    return this._getActiveSlot()?.engine.getNowPlaying?.() || null;
  }

  getState() {
    return this.transportState;
  }

  isPlaying() {
    return this.transportState === 'playing' || this.transportState === 'crossfading';
  }

  async getPosition(options) {
    const slot = this._getActiveSlot();
    if (!slot?.engine.getPosition) return 0;
    return slot.engine.getPosition(options);
  }

  async beginDucking() {
    this._duckActiveCount += 1;
    await this._callOnLiveSlots('beginDucking');
  }

  async endDucking() {
    if (this._duckActiveCount === 0) return;
    this._duckActiveCount -= 1;
    await this._callOnLiveSlots('endDucking');
  }

  async triggerDucking(durationMs) {
    const durationCandidate = Number(durationMs);
    const configHold = Number(this.config?.ducking?.holdMs);
    const holdMs = Math.max(
      Number.isFinite(durationCandidate)
        ? durationCandidate
        : (Number.isFinite(configHold) ? configHold : 1000),
      0
    );
    this._timedDuckUntil = Math.max(this._timedDuckUntil, this._timing.now() + holdMs);
    await this._callOnLiveSlots('triggerDucking', durationMs);
  }

  updateConfig(config = {}) {
    const update = config && typeof config === 'object' ? config : {};
    const next = {
      ...this.config,
      ...update,
      ducking: {
        ...(this.config.ducking || {}),
        ...(update.ducking || {})
      },
      normalization: {
        ...(this.config.normalization || {}),
        ...(update.normalization || {})
      }
    };
    const liveSlots = this._liveSlots();
    liveSlots.forEach((slot) => {
      slot.engine.config = next;
    });
    this.config = next;
    this._masterVolume = this._clampVolume(next.defaultVolume);
    liveSlots.forEach((slot) => {
      if (typeof slot.engine.updateConfig === 'function') {
        slot.engine.updateConfig(next);
      }
    });
    return next;
  }

  async listAudioDevices() {
    const existing = this._getActiveSlot() || this._liveSlots()[0];
    if (existing) {
      const list = existing.engine.listAudioDevices || existing.engine.getAvailableDevices;
      return typeof list === 'function' ? list.call(existing.engine) : [];
    }

    const probe = this._createEngine('probe', ++this._slotGeneration);
    try {
      const list = probe.listAudioDevices || probe.getAvailableDevices;
      return typeof list === 'function' ? await list.call(probe) : [];
    } finally {
      await probe.shutdown?.();
    }
  }

  testTone(options = {}) {
    return this._enqueueIntent('test-tone', async (generation) => {
      this._assertCanStartPlayback();
      if (
        this.transportState !== 'idle'
        || this.getNowPlaying()
        || this._liveSlots().some((slot) => slot.engine.isPlaying?.())
      ) {
        throw new Error('Playback test tone requires an idle controller');
      }
      await this._terminateAllSlots();

      const durationCandidate = Number(options.durationMs);
      const frequencyCandidate = Number(options.frequency);
      const durationMs = Math.min(
        5000,
        Math.max(50, Number.isFinite(durationCandidate) ? durationCandidate : 500)
      );
      const frequency = Math.min(
        20000,
        Math.max(20, Number.isFinite(frequencyCandidate) ? frequencyCandidate : 440)
      );
      const volume = options.volume === undefined
        ? this._masterVolume
        : this._clampVolume(options.volume);
      const transition = this._createTransition('test-tone', generation);
      this._activeTransition = transition;
      const slot = this._createSlot('A', generation, 'test-tone');
      slot.state = 'testing';
      this.transportState = 'testing';

      try {
        await this._raceTransition(slot.engine.setVolume(volume), transition);
        await this._raceTransition(slot.engine.play({
          id: `test-tone-${randomUUID()}`,
          title: 'Audio test tone',
          source: 'internal-test-tone',
          requestedBy: 'system',
          duration: durationMs / 1000,
          url: `av://lavfi:sine=frequency=${frequency}:duration=${durationMs / 1000}`,
          _testTone: true
        }), transition);
        await this._delay(durationMs, transition);
        this._throwIfAborted(transition);
        await this._retireSlot(slot);
        this.transportState = 'idle';
        return { success: true };
      } catch (error) {
        await this._retireSlot(slot);
        this.transportState = 'idle';
        this._recordError(error, generation);
        throw error;
      } finally {
        if (this._activeTransition === transition) {
          this._activeTransition = null;
        }
      }
    });
  }

  restart() {
    return this._enqueueIntent('restart', async () => {
      this._assertCanStartPlayback();
      const slot = this._getActiveSlot();
      if (!slot?.engine.restart) return null;
      const retained = await slot.engine.restart();
      slot.state = 'idle';
      this.transportState = 'idle';
      return retained;
    });
  }

  shutdown() {
    if (this.lifecycle === 'destroyed') {
      return Promise.resolve();
    }
    this.lifecycle = 'destroying';
    this._abortActiveTransition('shutdown');
    return this._enqueueIntent('shutdown', async () => {
      await this._terminateAllSlots();
      this.lifecycle = 'destroyed';
      this.transportState = 'idle';
    });
  }

  resetPlayer({ remainLocked = this.safetyLock } = {}) {
    const finalLocked = Boolean(remainLocked);
    const preservedReason = this._safetyReason;
    const preservedLockedAt = this._safetyLockedAt;
    this._liveSlots().forEach((slot) => this._suppressTerminalForSlot(slot));
    this._abortActiveTransition('player-reset');
    return this._enqueueIntent('player-reset', async () => {
      await this._terminateAllSlots();
      this._duckActiveCount = 0;
      this._timedDuckUntil = 0;
      this.safetyLock = finalLocked;
      this._safetyReason = finalLocked ? (preservedReason || 'player-reset') : null;
      this._safetyLockedAt = finalLocked
        ? (preservedLockedAt || this._timing.now())
        : null;
      this.transportState = 'idle';
    });
  }

  emergencyStop(reason = 'emergency-stop') {
    const normalizedReason = String(reason || 'emergency-stop');
    const changed = !this.safetyLock || this._safetyReason !== normalizedReason;
    this.safetyLock = true;
    this._safetyReason = normalizedReason;
    this._safetyLockedAt = changed ? this._timing.now() : this._safetyLockedAt;
    if (changed) {
      this.emit('safety-lock-changed', {
        locked: true,
        reason: this._safetyReason,
        lockedAt: this._safetyLockedAt
      });
    }
    this._abortActiveTransition('safety-lock');
    return this._enqueueIntent('emergency-stop', async () => {
      await this._terminateAllSlots();
      this.transportState = 'idle';
    });
  }

  releaseSafetyLock() {
    if (this.lifecycle !== 'active') {
      return false;
    }
    const changed = this.safetyLock;
    this.safetyLock = false;
    this._safetyReason = null;
    this._safetyLockedAt = null;
    if (changed) {
      this.emit('safety-lock-changed', {
        locked: false,
        reason: 'released',
        lockedAt: null
      });
    }
    const generation = ++this.transitionGeneration;
    this._setLastTransition({
      name: 'safety-release',
      generation,
      status: 'completed',
      at: this._timing.now()
    });
    return true;
  }

  engageSafetyLock(reason = 'manual') {
    return this.emergencyStop(reason);
  }

  setSafetyLock(locked = true, reason = 'manual') {
    return locked ? this.engageSafetyLock(reason) : this.releaseSafetyLock();
  }

  isSafetyLocked() {
    return this.safetyLock;
  }

  clearNowPlaying(options) {
    const slot = this._getActiveSlot();
    this._suppressTerminalForSlot(slot);
    slot?.engine.clearNowPlaying?.(options);
    if (slot) {
      slot.playbackId = null;
      slot.state = 'idle';
    }
    this.activePlaybackId = null;
    this.transportState = 'idle';
  }

  getSnapshot() {
    const slots = {
      A: this._snapshotSlot(this._slots.A),
      B: this._snapshotSlot(this._slots.B)
    };
    const healthy = this.lifecycle === 'active'
      && !this.safetyLock
      && this._liveSlots().every((slot) => !slot.crashed && !slot.lastError);
    return {
      lifecycle: this.lifecycle,
      safetyLock: this.safetyLock,
      transportState: this.transportState,
      transitionGeneration: this.transitionGeneration,
      activePlaybackId: this.activePlaybackId,
      activeSlot: this.activeSlot,
      slots,
      healthy,
      lastTransition: this.lastTransition,
      lastError: this.lastError
    };
  }

  getDiagnostics() {
    return this.getSnapshot();
  }

  async probe() {
    await Promise.allSettled(this._liveSlots().map((slot) => {
      return typeof slot.engine.probe === 'function'
        ? slot.engine.probe()
        : undefined;
    }));
    return this.getSnapshot();
  }

  async _playOnActiveSlot(slot, track, transition) {
    const targetName = slot?.name || 'A';
    if (slot) {
      await this._retireSlot(slot);
    }
    const target = this._createSlot(targetName, transition.generation);
    this.activeSlot = target.name;
    this.activePlaybackId = transition.playbackId;
    target.playbackId = transition.playbackId;
    target.sourceTrackId = track.id;
    target.state = 'loading';
    this.transportState = 'loading';

    try {
      await this._applyInheritedDucking(target, transition);
      await this._raceTransition(target.engine.setVolume(this._masterVolume), transition);
      await this._raceTransition(target.engine.play(track), transition);
      this._throwIfAborted(transition);
      const activeTrack = target.engine.getNowPlaying?.() || track;
      target.state = 'playing';
      target.crashed = false;
      target.lastError = null;
      this.activePlaybackId = target.playbackId;
      this.activeSlot = target.name;
      this.transportState = 'playing';
      return activeTrack;
    } catch (error) {
      await this._retireSlot(target);
      this.activeSlot = null;
      this.activePlaybackId = null;
      this.transportState = 'idle';
      this._recordError(error, transition.generation);
      throw error;
    }
  }

  async _playWithCrossfade(outgoing, track, durationMs, transition) {
    const standbyName = outgoing.name === 'A' ? 'B' : 'A';
    if (this._slots[standbyName]) {
      await this._retireSlot(this._slots[standbyName]);
    }
    const incoming = this._createSlot(standbyName, transition.generation);
    this._crossfade = { outgoing, incoming, transition };
    incoming.playbackId = transition.playbackId;
    incoming.sourceTrackId = track.id;
    incoming.state = 'loading';
    this.transportState = 'loading';

    try {
      await this._applyInheritedDucking(incoming, transition);
      await this._raceTransition(incoming.engine.setVolume(0), transition);
      await this._raceTransition(incoming.engine.play(track), transition);
      this._throwIfAborted(transition);
      incoming.state = 'playing';
      this.transportState = 'crossfading';

      await this._rampSlots(outgoing, incoming, durationMs, transition);
      this._throwIfAborted(transition);

      const outgoingTrack = outgoing.engine.getNowPlaying?.();
      this.activeSlot = incoming.name;
      this.activePlaybackId = incoming.playbackId;
      this.transportState = 'playing';
      if (outgoingTrack) {
        this._emitTrackEndOnce(outgoing, { track: outgoingTrack, reason: 'crossfade' });
      }
      await this._retireSlot(outgoing);
      this._crossfade = null;
      return incoming.engine.getNowPlaying?.() || track;
    } catch (error) {
      await this._retireSlot(incoming);
      this._crossfade = null;
      if (!outgoing.retired && !this.safetyLock && this.lifecycle === 'active') {
        try {
          await outgoing.engine.setVolume(this._masterVolume);
        } catch (restoreError) {
          this._recordError(restoreError, transition.generation);
        }
        this.activeSlot = outgoing.name;
        this.activePlaybackId = outgoing.playbackId
          || outgoing.engine.getNowPlaying?.()?.id
          || null;
        outgoing.state = outgoing.engine.getState?.() || 'playing';
        this.transportState = outgoing.state === 'paused' ? 'paused' : 'playing';
      }
      this._recordError(error, transition.generation);
      throw error;
    }
  }

  async _rampSlots(outgoing, incoming, durationMs, transition) {
    const steps = Math.max(1, Math.ceil(Math.max(0, durationMs) / RAMP_STEP_MS));
    for (let step = 1; step <= steps; step += 1) {
      this._throwIfAborted(transition);
      const ratio = step / steps;
      const outgoingVolume = this._masterVolume * (1 - ratio);
      const incomingVolume = this._masterVolume * ratio;
      await this._raceTransition(Promise.all([
        outgoing.engine.setVolume(outgoingVolume),
        incoming.engine.setVolume(incomingVolume)
      ]), transition);
      if (step < steps) {
        await this._delay(RAMP_STEP_MS, transition);
      }
    }
  }

  _createSlot(name, transitionGeneration, kind = 'playback') {
    const generation = ++this._slotGeneration;
    const engine = this._createEngine(name, generation);
    const slot = {
      name,
      engine,
      generation,
      transitionGeneration,
      kind,
      playbackId: null,
      sourceTrackId: null,
      state: 'idle',
      retired: false,
      retirePromise: null,
      crashed: false,
      lastError: null,
      startedPlaybackIds: new Set(),
      terminalPlaybackIds: new Set(),
      suppressedPlaybackIds: new Set(),
      suppressedPlaybackId: null
    };
    this._slots[name] = slot;
    this._bindSlotEvents(slot);
    return slot;
  }

  _createEngine(slot, generation) {
    return this._engineFactory({
      slot,
      generation,
      config: this.config,
      api: this.api,
      timing: this._timing
    });
  }

  _bindSlotEvents(slot) {
    const isCurrent = () => (
      !slot.retired
      && this._slots[slot.name] === slot
      && this._slots[slot.name]?.generation === slot.generation
    );

    slot.engine.on('track-start', (track) => {
      if (!isCurrent()) return;
      if (slot.kind === 'test-tone') return;
      const playbackId = slot.playbackId;
      if (playbackId && slot.startedPlaybackIds.has(playbackId)) return;
      if (playbackId) slot.startedPlaybackIds.add(playbackId);
      slot.state = 'playing';
      if (this.activeSlot === slot.name) {
        this.activePlaybackId = slot.playbackId;
        this.transportState = 'playing';
      }
      this.emit('track-start', track);
    });

    slot.engine.on('track-end', (info) => {
      if (!isCurrent()) return;
      if (slot.kind === 'test-tone') return;
      if (this._crossfade?.incoming === slot) {
        this._abortActiveTransition('incoming-end');
        return;
      }
      const isOutgoingCrossfade = this._crossfade?.outgoing === slot;
      const terminalInfo = isOutgoingCrossfade
        ? { ...info, reason: 'crossfade' }
        : info;
      this._emitTrackEndOnce(slot, terminalInfo);
      if (!isOutgoingCrossfade && this.activeSlot === slot.name) {
        slot.playbackId = null;
        slot.state = 'idle';
        this.activePlaybackId = null;
        this.transportState = 'idle';
      }
    });

    slot.engine.on('volume-changed', (volume) => {
      if (isCurrent() && slot.kind !== 'test-tone') this.emit('volume-changed', volume);
    });
    slot.engine.on('paused', () => {
      if (!isCurrent()) return;
      if (slot.kind === 'test-tone') return;
      if (this.activeSlot === slot.name) this.transportState = 'paused';
      slot.state = 'paused';
      this.emit('paused');
    });
    slot.engine.on('resumed', () => {
      if (!isCurrent()) return;
      if (slot.kind === 'test-tone') return;
      if (this.activeSlot === slot.name) this.transportState = 'playing';
      slot.state = 'playing';
      this.emit('resumed');
    });
    slot.engine.on('error', (error) => {
      if (!isCurrent()) return;
      slot.lastError = error?.message || String(error);
      this._recordError(error, slot.transitionGeneration);
      if (slot.kind === 'test-tone') return;
      if (this.listenerCount('error') > 0) this.emit('error', error);
    });
    slot.engine.on('crashed', (info) => {
      if (!isCurrent() || slot.crashed) return;
      slot.crashed = true;
      slot.state = 'crashed';
      if (slot.kind === 'test-tone') return;
      if (this._crossfade?.incoming === slot) {
        this._abortActiveTransition('incoming-crash');
      }
      if (this.activeSlot === slot.name) this.transportState = 'idle';
      this.emit('crashed', info);
    });
    slot.engine.on('heartbeat-lock', (info = {}) => {
      if (!isCurrent()) return;
      Promise.resolve(this.engageSafetyLock(info.reason || 'heartbeat-lock'))
        .catch((error) => {
          this.api.log?.(`[music-bot] Failed to engage heartbeat safety lock: ${error.message}`, 'error');
        });
    });
  }

  _emitTrackEndOnce(slot, info = {}) {
    const playbackId = slot.playbackId || info.track?.id || 'unknown';
    if (
      (slot.suppressedPlaybackId && (
        !slot.playbackId || slot.suppressedPlaybackId === slot.playbackId
      ))
      || slot.suppressedPlaybackIds.has(slot.playbackId)
      || slot.suppressedPlaybackIds.has(info.track?.id)
    ) return false;
    if (slot.terminalPlaybackIds.has(playbackId)) return false;
    slot.terminalPlaybackIds.add(playbackId);
    this.emit('track-end', info);
    return true;
  }

  async _retireSlot(slot) {
    if (!slot) return;
    if (slot.retirePromise) return slot.retirePromise;
    slot.retired = true;
    slot.state = 'retiring';
    if (this._slots[slot.name] === slot) {
      this._slots[slot.name] = null;
    }
    const shutdown = Promise.resolve().then(() => slot.engine.shutdown?.());
    shutdown.catch(() => {});
    slot.retirePromise = new Promise((resolve) => {
      let settled = false;
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        this._timing.clearTimeout(timeout);
        if (error) {
          slot.lastError = error?.message || String(error);
          this._recordError(error, slot.transitionGeneration);
        }
        slot.state = 'retired';
        resolve();
      };
      const timeout = this._timing.setTimeout(() => {
        finish(new Error('Playback slot cleanup timed out after 2000ms'));
      }, 2000);
      shutdown.then(() => finish(), (error) => finish(error));
    });
    return slot.retirePromise;
  }

  async _terminateAllSlots() {
    const slots = this._liveSlots();
    await Promise.all(slots.map((slot) => this._retireSlot(slot)));
    this._crossfade = null;
    this.activeSlot = null;
    this.activePlaybackId = null;
    this.transportState = 'idle';
  }

  _enqueueIntent(name, operation) {
    const execute = async () => {
      const generation = ++this.transitionGeneration;
      this._setLastTransition({
        name,
        generation,
        status: 'running',
        at: this._timing.now()
      });
      try {
        const result = await operation(generation);
        this._setLastTransition({
          name,
          generation,
          status: 'completed',
          at: this._timing.now()
        });
        return result;
      } catch (error) {
        this._setLastTransition({
          name,
          generation,
          status: error?.code === 'PLAYBACK_TRANSITION_ABORTED' ? 'aborted' : 'failed',
          at: this._timing.now()
        });
        throw error;
      }
    };
    const result = this._intentTail.then(execute, execute);
    this._intentTail = result.catch(() => {});
    return result;
  }

  _setLastTransition(transition) {
    this.lastTransition = transition;
    this.emit('transition', transition);
  }

  _createTransition(name, generation) {
    return {
      name,
      generation,
      aborted: false,
      abortReason: null,
      abortWaiters: new Set(),
      timers: new Set()
    };
  }

  _abortActiveTransition(reason) {
    const transition = this._activeTransition;
    if (!transition || transition.aborted) return;
    transition.aborted = true;
    transition.abortReason = reason;
    transition.timers.forEach((timer) => this._timing.clearTimeout(timer));
    transition.timers.clear();
    transition.abortWaiters.forEach((abort) => abort(reason));
    transition.abortWaiters.clear();
  }

  _throwIfAborted(transition) {
    if (transition.aborted) {
      throw new TransitionAbortedError(transition.abortReason);
    }
  }

  async _raceTransition(promise, transition) {
    this._throwIfAborted(transition);
    let abortWaiter;
    const aborted = new Promise((resolve, reject) => {
      abortWaiter = (reason) => reject(new TransitionAbortedError(reason));
      transition.abortWaiters.add(abortWaiter);
    });
    try {
      return await Promise.race([Promise.resolve(promise), aborted]);
    } finally {
      transition.abortWaiters.delete(abortWaiter);
    }
  }

  _delay(durationMs, transition) {
    this._throwIfAborted(transition);
    return new Promise((resolve, reject) => {
      let timer;
      const abort = (reason) => {
        if (timer) this._timing.clearTimeout(timer);
        transition.timers.delete(timer);
        transition.abortWaiters.delete(abort);
        reject(new TransitionAbortedError(reason));
      };
      timer = this._timing.setTimeout(() => {
        transition.timers.delete(timer);
        transition.abortWaiters.delete(abort);
        resolve();
      }, Math.max(0, durationMs));
      transition.timers.add(timer);
      transition.abortWaiters.add(abort);
    });
  }

  _assertCanStartPlayback() {
    if (this.lifecycle !== 'active') {
      throw new Error(`Playback controller is ${this.lifecycle}`);
    }
    if (this.safetyLock) {
      throw new Error('Playback safety lock is engaged');
    }
  }

  _recordError(error, generation) {
    if (!error || error.code === 'PLAYBACK_TRANSITION_ABORTED') return;
    this.lastError = {
      message: error.message || String(error),
      generation,
      at: this._timing.now()
    };
  }

  _getActiveSlot() {
    if (!this.activeSlot) return null;
    const slot = this._slots[this.activeSlot];
    return slot && !slot.retired ? slot : null;
  }

  _liveSlots() {
    return ['A', 'B']
      .map((name) => this._slots[name])
      .filter((slot) => slot && !slot.retired);
  }

  async _callOnLiveSlots(method, ...args) {
    await Promise.all(this._liveSlots().map((slot) => {
      const call = slot.engine[method];
      return typeof call === 'function' ? call.apply(slot.engine, args) : undefined;
    }));
  }

  async _applyInheritedDucking(slot, transition) {
    const calls = [];
    for (let index = 0; index < this._duckActiveCount; index += 1) {
      if (typeof slot.engine.beginDucking === 'function') {
        calls.push(slot.engine.beginDucking());
      }
    }
    const remainingTimedDuckMs = this._timedDuckUntil - this._timing.now();
    if (remainingTimedDuckMs > 0 && typeof slot.engine.triggerDucking === 'function') {
      calls.push(slot.engine.triggerDucking(remainingTimedDuckMs));
    }
    if (calls.length) {
      await this._raceTransition(Promise.all(calls), transition);
    }
  }

  _suppressTerminalForSlot(slot) {
    if (!slot || slot.retired) return;
    slot.suppressedPlaybackId = slot.playbackId;
    if (slot.playbackId) slot.suppressedPlaybackIds.add(slot.playbackId);
    if (slot.sourceTrackId) slot.suppressedPlaybackIds.add(slot.sourceTrackId);
  }

  _snapshotSlot(slot) {
    if (!slot || slot.retired) return null;
    const diagnostics = slot.engine.getDiagnostics?.() || {};
    const ipc = diagnostics.ipc || {};
    const media = diagnostics.media || {};
    return {
      generation: slot.generation,
      kind: slot.kind,
      playbackId: slot.playbackId,
      pid: Number.isInteger(diagnostics.pid) ? diagnostics.pid : null,
      ipc: {
        connected: Boolean(ipc.connected),
        lastLatencyMs: Number.isFinite(Number(ipc.lastLatencyMs))
          ? Number(ipc.lastLatencyMs)
          : null
      },
      media: {
        title: this._sanitizeDiagnosticLabel(media.title, false),
        basename: this._sanitizeDiagnosticLabel(media.basename, true)
      },
      state: diagnostics.state || slot.engine.getState?.() || slot.state,
      healthy: !slot.crashed && !slot.lastError,
      lastError: slot.lastError
    };
  }

  _sanitizeDiagnosticLabel(value, basenameOnly) {
    if (value === null || value === undefined) return null;
    let normalized = String(value).replace(/[\r\n\t]+/g, ' ').trim();
    if (!normalized) return null;
    if (basenameOnly || /^[a-z][a-z\d+.-]*:\/\//i.test(normalized)) {
      try {
        if (/^[a-z][a-z\d+.-]*:\/\//i.test(normalized)) {
          normalized = decodeURIComponent(new URL(normalized).pathname);
        }
      } catch (_) { /* use separator-safe fallback */ }
      normalized = normalized.split(/[?#]/, 1)[0].replace(/\\/g, '/');
      normalized = normalized.split('/').filter(Boolean).at(-1) || '';
    }
    return normalized ? normalized.slice(0, 256) : null;
  }

  _crossfadeDuration() {
    const value = Number(this.config.crossfadeDuration);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  _clampVolume(volume) {
    const value = Number(volume);
    if (!Number.isFinite(value)) return 50;
    return Math.min(100, Math.max(0, value));
  }
}

module.exports = PlaybackController;
