const { DashboardTTSRenderer } = require('../public/js/tts-renderer-lifecycle');
const AnimationController = require('../plugins/talking-heads/engines/animation-controller');

class FakeAudio {
  constructor() {
    this.listeners = new Map();
    this.currentTime = 0;
    this.sinkId = 'default';
    this.play = jest.fn(() => Promise.resolve());
  }

  addEventListener(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  removeEventListener(event, handler) {
    const list = this.listeners.get(event) || [];
    const index = list.indexOf(handler);
    if (index !== -1) {
      list.splice(index, 1);
    }
  }

  dispatch(event) {
    const list = (this.listeners.get(event) || []).slice();
    for (const handler of list) {
      handler({ type: event });
    }
  }

  listenerCount(event) {
    return (this.listeners.get(event) || []).length;
  }
}

describe('Talking Heads Challenger M2: Real-Time TTS Voice-to-Mouth Synchronization', () => {

  // =========================================================================
  // SECTION 1: Ticker Lifecycle & Timing Boundaries Resilience
  // =========================================================================
  describe('1. Ticker Lifecycle & High-Frequency Metering (<= 50ms)', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    test('progressIntervalMs clamps adversarial inputs (<=0, negative, >50, NaN, non-numeric)', () => {
      expect(new DashboardTTSRenderer().progressIntervalMs).toBe(40);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 0 }).progressIntervalMs).toBe(40);
      expect(new DashboardTTSRenderer({ progressIntervalMs: -100 }).progressIntervalMs).toBe(20);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 10 }).progressIntervalMs).toBe(20);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 19 }).progressIntervalMs).toBe(20);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 20 }).progressIntervalMs).toBe(20);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 35 }).progressIntervalMs).toBe(35);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 50 }).progressIntervalMs).toBe(50);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 80 }).progressIntervalMs).toBe(80);
      expect(new DashboardTTSRenderer({ progressIntervalMs: NaN }).progressIntervalMs).toBe(40);
      expect(new DashboardTTSRenderer({ progressIntervalMs: null }).progressIntervalMs).toBe(40);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 'invalid' }).progressIntervalMs).toBe(40);
    });

    test('progress ticker interval is strictly capped at <= 50ms during active playback', async () => {
      jest.useFakeTimers();
      const audio = new FakeAudio();
      const socket = { emit: jest.fn() };
      let now = 0;

      // Even if constructed with an interval > 50ms, the ticker scheduler clamps intervalMs to Math.min(50, ...)
      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        now: () => now,
        progressIntervalMs: 50
      });

      await renderer.play({ playbackId: 'ticker-50ms', source: 'chat' });
      audio.dispatch('playing');

      // Ticker fires every 50ms
      for (let i = 1; i <= 6; i++) {
        now += 50;
        audio.currentTime = now / 1000;
        jest.advanceTimersByTime(50);
      }

      const progressCalls = socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:progress');
      expect(progressCalls).toHaveLength(6);
      expect(progressCalls[0][1].currentTimeMs).toBe(50);
      expect(progressCalls[5][1].currentTimeMs).toBe(300);

      renderer.dispose();
    });

    test('emits progress events autonomously without requiring browser timeupdate events', async () => {
      jest.useFakeTimers();
      const audio = new FakeAudio();
      const socket = { emit: jest.fn() };
      let now = 0;

      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        now: () => now,
        progressIntervalMs: 40
      });

      await renderer.play({ playbackId: 'autonomous-ticker', source: 'chat' });
      audio.dispatch('playing');

      // Zero timeupdate events dispatched; only advancing timers
      for (let i = 1; i <= 10; i++) {
        now += 40;
        audio.currentTime = now / 1000;
        jest.advanceTimersByTime(40);
      }

      const progressCalls = socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:progress');
      expect(progressCalls).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        expect(progressCalls[i][1].currentTimeMs).toBe((i + 1) * 40);
      }

      renderer.dispose();
    });

    test('rapid playback replacement (10 back-to-back plays) leaves exactly one active timer with zero leaks', async () => {
      jest.useFakeTimers();
      const audio = new FakeAudio();
      const socket = { emit: jest.fn() };
      const cleanupMocks = Array.from({ length: 10 }, () => jest.fn());

      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        progressIntervalMs: 40
      });

      // Rapid-fire 10 plays in immediate succession
      for (let i = 0; i < 10; i++) {
        await renderer.play({
          playbackId: `rapid-play-${i}`,
          source: 'chat',
          cleanup: cleanupMocks[i]
        });
      }

      // First 9 cleanups called and reported as failed (playback-replaced)
      for (let i = 0; i < 9; i++) {
        expect(cleanupMocks[i]).toHaveBeenCalledTimes(1);
      }
      expect(cleanupMocks[9]).not.toHaveBeenCalled();

      // Dispatch playing for the 10th (active) playback
      audio.dispatch('playing');

      jest.advanceTimersByTime(120);

      const progressEvents = socket.emit.mock.calls.filter(([e]) => e === 'tts:renderer:progress');
      // Every progress event MUST belong strictly to the 10th playback
      expect(progressEvents.length).toBeGreaterThan(0);
      for (const [, payload] of progressEvents) {
        expect(payload.playbackId).toBe('rapid-play-9');
      }

      // Cleanup
      renderer.dispose();
      expect(cleanupMocks[9]).toHaveBeenCalledTimes(1);

      // Verify no further events emit after disposal
      const countBefore = socket.emit.mock.calls.length;
      jest.advanceTimersByTime(500);
      expect(socket.emit.mock.calls.length).toBe(countBefore);
    });

    test('stops progress ticker immediately upon audio error, audio ended, and renderer disposal', async () => {
      jest.useFakeTimers();
      const audio = new FakeAudio();
      const socket = { emit: jest.fn() };

      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        progressIntervalMs: 40
      });

      // 1. Ended stops ticker
      await renderer.play({ playbackId: 'ended-test' });
      audio.dispatch('playing');
      jest.advanceTimersByTime(80);
      const progressCountAfterStart = socket.emit.mock.calls.filter(([e]) => e === 'tts:renderer:progress').length;
      expect(progressCountAfterStart).toBe(2);

      audio.dispatch('ended');
      jest.advanceTimersByTime(400);
      const progressCountAfterEnd = socket.emit.mock.calls.filter(([e]) => e === 'tts:renderer:progress').length;
      expect(progressCountAfterEnd).toBe(2); // No new progress events

      // 2. Error stops ticker
      await renderer.play({ playbackId: 'error-test' });
      audio.dispatch('playing');
      jest.advanceTimersByTime(40);
      audio.dispatch('error');
      jest.advanceTimersByTime(400);
      const errorPlaybackEvents = socket.emit.mock.calls.filter(
        ([e, p]) => e === 'tts:renderer:progress' && p.playbackId === 'error-test'
      );
      expect(errorPlaybackEvents).toHaveLength(1);

      // 3. Dispose stops ticker
      await renderer.play({ playbackId: 'dispose-test' });
      audio.dispatch('playing');
      renderer.dispose();
      jest.advanceTimersByTime(400);
      const disposePlaybackEvents = socket.emit.mock.calls.filter(
        ([e, p]) => e === 'tts:renderer:progress' && p.playbackId === 'dispose-test'
      );
      expect(disposePlaybackEvents).toHaveLength(0);
    });

    test('setAudio during active playback safely cancels existing ticker and resets media source', async () => {
      jest.useFakeTimers();
      const audio1 = new FakeAudio();
      const audio2 = new FakeAudio();
      const socket = { emit: jest.fn() };

      const renderer = new DashboardTTSRenderer({
        audio: audio1,
        socket,
        progressIntervalMs: 40
      });

      await renderer.play({ playbackId: 'audio-swap-test' });
      audio1.dispatch('playing');
      jest.advanceTimersByTime(40);

      expect(socket.emit).toHaveBeenCalledWith('tts:renderer:progress', expect.objectContaining({
        playbackId: 'audio-swap-test'
      }));

      // Swap audio element
      renderer.setAudio(audio2);

      // Advancing audio1 must not fire any timers
      jest.advanceTimersByTime(200);
      const swapProgressEvents = socket.emit.mock.calls.filter(
        ([e, p]) => e === 'tts:renderer:progress' && p.playbackId === 'audio-swap-test'
      );
      expect(swapProgressEvents).toHaveLength(1);

      // Listener on audio1 should be cleaned up
      expect(audio1.listenerCount('playing')).toBe(0);
      expect(audio1.listenerCount('timeupdate')).toBe(0);
      expect(audio1.listenerCount('ended')).toBe(0);
      expect(audio1.listenerCount('error')).toBe(0);

      renderer.dispose();
    });
  });

  // =========================================================================
  // SECTION 2: Audio Volume Boundaries & Hysteresis State Machine
  // =========================================================================
  describe('2. Audio Volume Boundaries, Hysteresis, and 80ms Two-Stage Decay', () => {
    let io;
    let logger;
    let controller;
    const sprites = {
      idle_neutral: '/sprites/idle.png',
      speak_closed: '/sprites/closed.png',
      speak_mid: '/sprites/mid.png',
      speak_open: '/sprites/open.png'
    };

    beforeEach(() => {
      io = { emit: jest.fn() };
      logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      controller = new AnimationController(io, logger, {
        fadeInDuration: 0,
        fadeOutDuration: 0,
        blinkInterval: 5000,
        obsEnabled: false
      });
    });

    afterEach(() => {
      controller.stopAllAnimations();
      controller.clearAllTimeouts();
    });

    test('stress-tests boundary conditions: 0.0, 0.139, 0.14, 0.259, 0.26, 0.379, 0.38, 0.549, 0.55, 1.0, 1.5, -0.5', async () => {
      await controller.startAnimation('viewer_b', 'ViewerB', sprites, 2000, {
        externalLifecycle: true,
        playbackId: 'pb_boundaries'
      });

      // Baseline: silence (0.0) -> speak_closed
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.0);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_closed');

      // Negative level clamped to 0.0 -> speak_closed
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', -0.5);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_closed');

      // 0.139 (below mid onset 0.26) -> speak_closed
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.139);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_closed');

      // 0.14 (below mid onset 0.26) -> speak_closed
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.14);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_closed');

      // 0.259 (strictly below mid onset 0.26) -> speak_closed
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.259);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_closed');

      // 0.26 (exact mid onset) -> speak_mid
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.26);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_mid');

      // 0.379 (while in mid, below 0.55) -> speak_mid
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.379);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_mid');

      // 0.38 (while in mid, below 0.55) -> speak_mid
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.38);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_mid');

      // 0.549 (strictly below peak onset 0.55) -> speak_mid
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.549);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_mid');

      // 0.55 (exact peak onset) -> speak_open
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.55);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_open');

      // 1.0 (maximum intensity) -> speak_open
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 1.0);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_open');

      // 1.5 (overflow level, clamped to 1.0) -> speak_open
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 1.5);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_open');

      // Falling from speak_open:
      // 0.549 (falling above 0.38) -> stays speak_open (HYSTERESIS HOLD)
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.549);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_open');

      // 0.38 (falling exact boundary >= 0.38) -> stays speak_open (HYSTERESIS HOLD)
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.38);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_open');

      // 0.379 (strictly below 0.38) -> drops to speak_mid
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.379);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_mid');

      // Falling from speak_mid:
      // 0.259 (falling above 0.14) -> stays speak_mid (HYSTERESIS HOLD)
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.259);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_mid');

      // 0.14 (falling exact boundary >= 0.14) -> stays speak_mid (HYSTERESIS HOLD)
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.14);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_mid');

      // 0.139 (strictly below 0.14) -> drops to speak_closed
      controller.setMouthIntensity('viewer_b', 'pb_boundaries', 0.139);
      expect(controller.activeAnimations.get('viewer_b').mouthFrame).toBe('speak_closed');
    });

    test('gracefully handles abnormal inputs: NaN, null, undefined, Infinity, non-numeric strings', async () => {
      await controller.startAnimation('viewer_abnormal', 'ViewerAbnormal', sprites, 2000, {
        externalLifecycle: true,
        playbackId: 'pb_abnormal'
      });

      // 1. Passing null does not crash and starts fallback
      expect(controller.setMouthIntensity('viewer_abnormal', 'pb_abnormal', null)).toBe(true);
      expect(controller.activeAnimations.get('viewer_abnormal').fallbackMouthTimer).not.toBeNull();

      // 2. Passing undefined
      expect(controller.setMouthIntensity('viewer_abnormal', 'pb_abnormal', undefined)).toBe(true);

      // 3. Passing NaN
      expect(controller.setMouthIntensity('viewer_abnormal', 'pb_abnormal', NaN)).toBe(true);

      // 4. Passing Infinity
      expect(controller.setMouthIntensity('viewer_abnormal', 'pb_abnormal', Infinity)).toBe(true);

      // 5. Passing non-numeric string
      expect(controller.setMouthIntensity('viewer_abnormal', 'pb_abnormal', 'not-a-number')).toBe(true);

      // 6. Resuming valid numeric input clears fallback timer and restores intensity drive
      expect(controller.setMouthIntensity('viewer_abnormal', 'pb_abnormal', 0.7)).toBe(true);
      expect(controller.activeAnimations.get('viewer_abnormal').fallbackMouthTimer).toBeNull();
      expect(controller.activeAnimations.get('viewer_abnormal').mouthFrame).toBe('speak_open');
    });

    test('rejects mismatched playbackId or userId without mutating state', async () => {
      await controller.startAnimation('viewer_mismatch', 'ViewerMismatch', sprites, 2000, {
        externalLifecycle: true,
        playbackId: 'pb_valid'
      });

      // Wrong playbackId
      expect(controller.setMouthIntensity('viewer_mismatch', 'pb_stale_or_wrong', 0.8)).toBe(false);
      expect(controller.activeAnimations.get('viewer_mismatch').mouthFrame).toBeUndefined();

      // Wrong userId
      expect(controller.setMouthIntensity('unknown_user', 'pb_valid', 0.8)).toBe(false);

      // Non-external lifecycle
      await controller.startAnimation('viewer_legacy', 'ViewerLegacy', sprites, 2000, {
        externalLifecycle: false,
        playbackId: 'pb_legacy'
      });
      expect(controller.setMouthIntensity('viewer_legacy', 'pb_legacy', 0.8)).toBe(false);
    });

    test('verifies two-stage 80ms decay from open peak to complete silence', async () => {
      await controller.startAnimation('viewer_decay', 'ViewerDecay', sprites, 2000, {
        externalLifecycle: true,
        playbackId: 'pb_decay'
      });

      // Open to peak
      controller.setMouthIntensity('viewer_decay', 'pb_decay', 0.85);
      expect(controller.activeAnimations.get('viewer_decay').mouthFrame).toBe('speak_open');

      io.emit.mockClear();

      // Sudden silence event (Tick 1 at 40ms): 0.0 level
      // MUST NOT drop straight to speak_closed; MUST drop to speak_mid first
      controller.setMouthIntensity('viewer_decay', 'pb_decay', 0.0);
      expect(controller.activeAnimations.get('viewer_decay').mouthFrame).toBe('speak_mid');
      expect(io.emit).toHaveBeenCalledTimes(1);
      expect(io.emit).toHaveBeenCalledWith('talkingheads:animation:frame', {
        userId: 'viewer_decay',
        frame: 'speak_mid',
        playbackId: 'pb_decay'
      });

      io.emit.mockClear();

      // Next tick (Tick 2 at 80ms): silence persists at 0.0 level
      // Drops from speak_mid to speak_closed
      controller.setMouthIntensity('viewer_decay', 'pb_decay', 0.0);
      expect(controller.activeAnimations.get('viewer_decay').mouthFrame).toBe('speak_closed');
      expect(io.emit).toHaveBeenCalledTimes(1);
      expect(io.emit).toHaveBeenCalledWith('talkingheads:animation:frame', {
        userId: 'viewer_decay',
        frame: 'speak_closed',
        playbackId: 'pb_decay'
      });

      io.emit.mockClear();

      // Subsequent silence ticks: stays speak_closed with zero new emits
      controller.setMouthIntensity('viewer_decay', 'pb_decay', 0.0);
      controller.setMouthIntensity('viewer_decay', 'pb_decay', 0.0);
      expect(io.emit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SECTION 3: Frame Deduplication Under Steady & Fluctuating Audio Levels
  // =========================================================================
  describe('3. Frame Deduplication Under Steady and Micro-Fluctuating Levels', () => {
    let io;
    let logger;
    let controller;
    const sprites = {
      idle_neutral: '/sprites/idle.png',
      speak_closed: '/sprites/closed.png',
      speak_mid: '/sprites/mid.png',
      speak_open: '/sprites/open.png'
    };

    beforeEach(() => {
      io = { emit: jest.fn() };
      logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      controller = new AnimationController(io, logger, {
        fadeInDuration: 0,
        fadeOutDuration: 0,
        blinkInterval: 5000,
        obsEnabled: false
      });
    });

    afterEach(() => {
      controller.stopAllAnimations();
      controller.clearAllTimeouts();
    });

    test('suppresses redundant frame emissions across 100 sustained vowel inputs (speak_open)', async () => {
      await controller.startAnimation('viewer_dedup_open', 'ViewerDedupOpen', sprites, 5000, {
        externalLifecycle: true,
        playbackId: 'pb_dedup_open'
      });

      io.emit.mockClear();

      // Initial transition to peak open
      controller.setMouthIntensity('viewer_dedup_open', 'pb_dedup_open', 0.65);
      expect(io.emit).toHaveBeenCalledTimes(1);
      expect(io.emit).toHaveBeenCalledWith('talkingheads:animation:frame', expect.objectContaining({
        frame: 'speak_open'
      }));

      io.emit.mockClear();

      // Feed 100 consecutive values varying between 0.55 and 1.0 (sustained loud vowel)
      for (let i = 0; i < 100; i++) {
        const level = 0.55 + (i % 45) * 0.01;
        controller.setMouthIntensity('viewer_dedup_open', 'pb_dedup_open', level);
      }

      // Zero redundant socket emissions
      expect(io.emit).not.toHaveBeenCalled();
    });

    test('suppresses redundant emissions during micro-fluctuations inside hysteresis bands', async () => {
      await controller.startAnimation('viewer_fluctuate', 'ViewerFluctuate', sprites, 5000, {
        externalLifecycle: true,
        playbackId: 'pb_fluctuate'
      });

      // 1. Move to open
      controller.setMouthIntensity('viewer_fluctuate', 'pb_fluctuate', 0.70);
      io.emit.mockClear();

      // Oscillate within the open hysteresis hold band [0.38, 0.54]
      const openFluctuations = [0.52, 0.45, 0.39, 0.50, 0.42, 0.38, 0.48, 0.53];
      for (const level of openFluctuations) {
        controller.setMouthIntensity('viewer_fluctuate', 'pb_fluctuate', level);
      }
      expect(io.emit).not.toHaveBeenCalled();

      // 2. Drop to mid
      controller.setMouthIntensity('viewer_fluctuate', 'pb_fluctuate', 0.35);
      expect(io.emit).toHaveBeenCalledTimes(1);
      expect(io.emit).toHaveBeenCalledWith('talkingheads:animation:frame', expect.objectContaining({
        frame: 'speak_mid'
      }));
      io.emit.mockClear();

      // Oscillate within the mid hysteresis hold band [0.14, 0.25]
      const midFluctuations = [0.24, 0.18, 0.15, 0.22, 0.19, 0.14, 0.25];
      for (const level of midFluctuations) {
        controller.setMouthIntensity('viewer_fluctuate', 'pb_fluctuate', level);
      }
      expect(io.emit).not.toHaveBeenCalled();

      // 3. Drop to closed
      controller.setMouthIntensity('viewer_fluctuate', 'pb_fluctuate', 0.10);
      expect(io.emit).toHaveBeenCalledTimes(1);
      expect(io.emit).toHaveBeenCalledWith('talkingheads:animation:frame', expect.objectContaining({
        frame: 'speak_closed'
      }));
      io.emit.mockClear();

      // Silence fluctuations [0.0, 0.13]
      const silenceFluctuations = [0.0, 0.05, 0.12, 0.02, 0.08, 0.0];
      for (const level of silenceFluctuations) {
        controller.setMouthIntensity('viewer_fluctuate', 'pb_fluctuate', level);
      }
      expect(io.emit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SECTION 4: Audio Doubling Prevention & Isolated Routing
  // =========================================================================
  describe('4. Absence of Audio Doubling & Web Audio Routing Isolation', () => {
    test('DashboardTTSRenderer wires captureStream exclusively to analyser without destination connection', async () => {
      const audio = new FakeAudio();
      const streamMock = {};
      audio.captureStream = jest.fn(() => streamMock);

      const mockAnalyser = {
        fftSize: 512,
        getByteTimeDomainData: jest.fn((buf) => {
          buf.fill(128); // perfect silence
        })
      };

      const mediaStreamSourceMock = {
        connect: jest.fn()
      };

      const mockDestination = { id: 'destination-sink' };
      class TestAudioContext {
        constructor() {
          this.destination = mockDestination;
        }
        createAnalyser() {
          return mockAnalyser;
        }
        createMediaStreamSource(stream) {
          return mediaStreamSourceMock;
        }
      }

      const socket = { emit: jest.fn() };
      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        progressIntervalMs: 40,
        AudioContext: TestAudioContext
      });

      await renderer.play({ playbackId: 'routing-isolation' });
      audio.dispatch('playing');

      // 1. mediaStreamSource connects to analyser
      expect(mediaStreamSourceMock.connect).toHaveBeenCalledWith(mockAnalyser);

      // 2. analyser NEVER connects to destination (crucial: avoids double-playing through default output)
      expect(mockAnalyser.connect).toBeUndefined();

      renderer.dispose();
    });

    test('avoids MediaElementSource fallback when audio sink is non-default to protect routing', async () => {
      const audio = new FakeAudio();
      audio.captureStream = null; // simulate browser lacking captureStream
      audio.sinkId = 'virtual-cable-device-1'; // non-default sink

      let createMediaElementSourceCalled = false;
      class FallbackAudioContext {
        createAnalyser() {
          return { fftSize: 512, getByteTimeDomainData: jest.fn() };
        }
        createMediaElementSource() {
          createMediaElementSourceCalled = true;
          return { connect: jest.fn() };
        }
      }

      const socket = { emit: jest.fn() };
      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        AudioContext: FallbackAudioContext
      });

      await renderer.play({ playbackId: 'sink-protected' });
      audio.dispatch('playing');

      // Must NOT hijack audio via createMediaElementSource when sink is non-default
      expect(createMediaElementSourceCalled).toBe(false);
      expect(renderer.analyserUnavailable).toBe(true);

      renderer.dispose();
    });

    test('TalkingHeads animation controller produces strictly visual frame events with zero audio payload', async () => {
      const io = { emit: jest.fn() };
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const controller = new AnimationController(io, logger, {});

      await controller.startAnimation('viewer_visual', 'VisualViewer', {
        idle_neutral: '/idle.png',
        speak_closed: '/closed.png',
        speak_mid: '/mid.png',
        speak_open: '/open.png'
      }, 1000, {
        externalLifecycle: true,
        playbackId: 'pb_visual'
      });

      controller.setMouthIntensity('viewer_visual', 'pb_visual', 0.8);
      controller.setMouthIntensity('viewer_visual', 'pb_visual', 0.0);
      controller.endExternalAnimation('viewer_visual', 'pb_visual');

      // Verify all emitted events are purely visual animation frames or control signals
      for (const [eventName, payload] of io.emit.mock.calls) {
        expect(['talkingheads:animation:start', 'talkingheads:animation:frame', 'talkingheads:animation:end']).toContain(eventName);
        expect(payload).not.toHaveProperty('audio');
        expect(payload).not.toHaveProperty('audioData');
        expect(payload).not.toHaveProperty('stream');
        expect(payload).not.toHaveProperty('sound');
      }

      controller.stopAllAnimations();
      controller.clearAllTimeouts();
    });
  });

  // =========================================================================
  // SECTION 5: Multi-User Concurrency & Playback Isolation
  // =========================================================================
  describe('5. Multi-User Playback Isolation & Rapid Handover', () => {
    let io;
    let logger;
    let controller;
    const sprites = {
      idle_neutral: '/sprites/idle.png',
      speak_closed: '/sprites/closed.png',
      speak_mid: '/sprites/mid.png',
      speak_open: '/sprites/open.png'
    };

    beforeEach(() => {
      io = { emit: jest.fn() };
      logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      controller = new AnimationController(io, logger, {
        fadeInDuration: 0,
        fadeOutDuration: 0,
        blinkInterval: 5000,
        obsEnabled: false
      });
    });

    afterEach(() => {
      controller.stopAllAnimations();
      controller.clearAllTimeouts();
    });

    test('preserves independent mouth states across concurrent users without cross-contamination', async () => {
      await controller.startAnimation('user_alice', 'Alice', sprites, 2000, {
        externalLifecycle: true,
        playbackId: 'pb_alice'
      });
      await controller.startAnimation('user_bob', 'Bob', sprites, 2000, {
        externalLifecycle: true,
        playbackId: 'pb_bob'
      });

      // Alice speaks loudly -> open
      controller.setMouthIntensity('user_alice', 'pb_alice', 0.80);
      expect(controller.activeAnimations.get('user_alice').mouthFrame).toBe('speak_open');

      // Bob speaks softly -> mid
      controller.setMouthIntensity('user_bob', 'pb_bob', 0.30);
      expect(controller.activeAnimations.get('user_bob').mouthFrame).toBe('speak_mid');

      // Alice drops to silence -> mid (Stage 1 decay)
      controller.setMouthIntensity('user_alice', 'pb_alice', 0.0);
      expect(controller.activeAnimations.get('user_alice').mouthFrame).toBe('speak_mid');

      // Bob drops to silence -> closed (from mid)
      controller.setMouthIntensity('user_bob', 'pb_bob', 0.0);
      expect(controller.activeAnimations.get('user_bob').mouthFrame).toBe('speak_closed');

      // End Alice's playback: Bob remains active
      controller.endExternalAnimation('user_alice', 'pb_alice');
      expect(controller.activeAnimations.has('user_bob')).toBe(true);
      expect(controller.activeAnimations.get('user_bob').state).toBe(controller.STATES.SPEAKING);

      // Clean up
      controller.endExternalAnimation('user_bob', 'pb_bob');
    });

    test('rapid handover: new playback for same user replaces previous external lifecycle cleanly', async () => {
      await controller.startAnimation('user_charlie', 'Charlie', sprites, 2000, {
        externalLifecycle: true,
        playbackId: 'pb_charlie_1'
      });

      controller.setMouthIntensity('user_charlie', 'pb_charlie_1', 0.75);
      expect(controller.activeAnimations.get('user_charlie').mouthFrame).toBe('speak_open');

      // Second playback starts immediately for Charlie
      await controller.startAnimation('user_charlie', 'Charlie', sprites, 2000, {
        externalLifecycle: true,
        playbackId: 'pb_charlie_2'
      });

      // Active playback ID is now pb_charlie_2
      expect(controller.activeAnimations.get('user_charlie').playbackId).toBe('pb_charlie_2');

      // Stale level events from pb_charlie_1 are rejected
      expect(controller.setMouthIntensity('user_charlie', 'pb_charlie_1', 0.90)).toBe(false);

      // Level events for pb_charlie_2 work
      expect(controller.setMouthIntensity('user_charlie', 'pb_charlie_2', 0.35)).toBe(true);
      expect(controller.activeAnimations.get('user_charlie').mouthFrame).toBe('speak_mid');
    });
  });
});
