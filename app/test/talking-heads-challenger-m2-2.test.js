const fs = require('fs');
const path = require('path');
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
    this.listeners.set(event, handler);
  }

  removeEventListener(event, handler) {
    if (this.listeners.get(event) === handler) this.listeners.delete(event);
  }

  dispatch(event) {
    this.listeners.get(event)?.({ type: event });
  }
}

describe('Talking Heads Challenger M2.2: Adversarial Stress & Verification Suite', () => {
  const overlayHtmlPath = path.resolve(__dirname, '../plugins/talking-heads/overlay.html');
  const overlayJsPath = path.resolve(__dirname, '../plugins/talking-heads/assets/overlay.js');

  describe('Adversarial Objective 1: Audio Doubling & Routing Integrity', () => {
    test('overlay.html contains zero audio/video elements or embedded sound sources', () => {
      const htmlContent = fs.readFileSync(overlayHtmlPath, 'utf8');
      expect(htmlContent).not.toMatch(/<audio\b[^>]*>/i);
      expect(htmlContent).not.toMatch(/<video\b[^>]*>/i);
      expect(htmlContent).not.toMatch(/<embed\b[^>]*>/i);
      expect(htmlContent).not.toMatch(/<object\b[^>]*>/i);
      expect(htmlContent).not.toMatch(/<source\b[^>]*>/i);
    });

    test('overlay.js contains zero Web Audio creation or audio element playback references', () => {
      const jsContent = fs.readFileSync(overlayJsPath, 'utf8');
      expect(jsContent).not.toMatch(/AudioContext/i);
      expect(jsContent).not.toMatch(/webkitAudioContext/i);
      expect(jsContent).not.toMatch(/new\s+Audio\b/);
      expect(jsContent).not.toMatch(/createElement\s*\(\s*['"]audio['"]\s*\)/i);
      expect(jsContent).not.toMatch(/captureStream/i);
      expect(jsContent).not.toMatch(/createMediaStreamSource/i);
      expect(jsContent).not.toMatch(/createMediaElementSource/i);
      expect(jsContent).not.toMatch(/\.destination\b/);
    });

    test('DashboardTTSRenderer with captureStream connects exclusively to analyser and NEVER to destination', async () => {
      const audio = new FakeAudio();
      const mockStream = { id: 'media-stream-mock' };
      audio.captureStream = jest.fn(() => mockStream);

      const mockAnalyser = {
        fftSize: 512,
        connect: jest.fn(),
        getByteTimeDomainData: jest.fn((buf) => buf.fill(128))
      };

      const mediaStreamSourceMock = {
        connect: jest.fn()
      };

      const mockDestination = { id: 'audio-context-destination' };
      class MockAudioContext {
        constructor() {
          this.state = 'running';
          this.destination = mockDestination;
        }
        createAnalyser() {
          return mockAnalyser;
        }
        createMediaStreamSource(stream) {
          expect(stream).toBe(mockStream);
          return mediaStreamSourceMock;
        }
      }

      const socket = { emit: jest.fn() };
      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        progressIntervalMs: 40,
        AudioContext: MockAudioContext
      });

      await renderer.play({ playbackId: 'routing-integrity-test', source: 'chat' });
      audio.dispatch('playing');

      // 1. mediaSource connects to analyser
      expect(mediaStreamSourceMock.connect).toHaveBeenCalledTimes(1);
      expect(mediaStreamSourceMock.connect).toHaveBeenCalledWith(mockAnalyser);

      // 2. mediaSource must NOT connect to destination
      expect(mediaStreamSourceMock.connect).not.toHaveBeenCalledWith(mockDestination);

      // 3. Analyser must NEVER connect to destination when captureStream is used
      expect(mockAnalyser.connect).not.toHaveBeenCalled();

      renderer.dispose();
    });

    test('DashboardTTSRenderer gracefully handles captureStream exceptions without breaking playback', async () => {
      const audio = new FakeAudio();
      audio.captureStream = jest.fn(() => {
        throw new Error('NotSupportedError: captureStream is blocked');
      });

      const socket = { emit: jest.fn() };
      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        progressIntervalMs: 40,
        AudioContext: class {
          constructor() {
            this.state = 'running';
          }
          createAnalyser() {
            return { fftSize: 512 };
          }
        }
      });

      // Playback must succeed even if analysis initialisation throws
      const started = await renderer.play({ playbackId: 'safe-fallback', source: 'chat' });
      expect(started).toBe(true);
      audio.dispatch('playing');

      expect(renderer.analyserUnavailable).toBe(true);
      expect(renderer.analyser).toBeNull();
      expect(socket.emit).toHaveBeenCalledWith('tts:renderer:started', expect.objectContaining({
        playbackId: 'safe-fallback'
      }));

      renderer.dispose();
    });

    test('DashboardTTSRenderer refuses fallback to destination when audio has non-default sinkId', async () => {
      const audio = new FakeAudio();
      delete audio.captureStream;
      audio.sinkId = 'virtual-cable-device-id';

      const mockAnalyser = {
        connect: jest.fn()
      };
      const mockDestination = {};
      class MockAudioContext {
        constructor() {
          this.destination = mockDestination;
        }
        createAnalyser() {
          return mockAnalyser;
        }
      }

      const socket = { emit: jest.fn() };
      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        AudioContext: MockAudioContext
      });

      await renderer.play({ playbackId: 'sink-check' });
      audio.dispatch('playing');

      // Analyser must be marked unavailable so audio is not hijacked to default destination
      expect(renderer.analyserUnavailable).toBe(true);
      expect(mockAnalyser.connect).not.toHaveBeenCalled();

      renderer.dispose();
    });
  });

  describe('Adversarial Objective 2: High-Frequency Metering Load & Stability', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('clamps progress interval strictly across edge and out-of-range inputs', () => {
      // 1. Extreme low and negative values clamp to 20ms
      expect(new DashboardTTSRenderer({ progressIntervalMs: -100 }).progressIntervalMs).toBe(20);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 0 }).progressIntervalMs).toBe(40);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 1 }).progressIntervalMs).toBe(20);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 19 }).progressIntervalMs).toBe(20);

      // 2. Legitimate range preserved
      expect(new DashboardTTSRenderer({ progressIntervalMs: 20 }).progressIntervalMs).toBe(20);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 33 }).progressIntervalMs).toBe(33);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 50 }).progressIntervalMs).toBe(50);

      // 3. Falsy and invalid values default safely to 40ms
      expect(new DashboardTTSRenderer({ progressIntervalMs: NaN }).progressIntervalMs).toBe(40);
      expect(new DashboardTTSRenderer({ progressIntervalMs: 'invalid' }).progressIntervalMs).toBe(40);
      expect(new DashboardTTSRenderer({ progressIntervalMs: null }).progressIntervalMs).toBe(40);
      expect(new DashboardTTSRenderer({ progressIntervalMs: undefined }).progressIntervalMs).toBe(40);
    });

    test('stress-tests rapid playback churn (100 rapid play calls) with zero timer accumulation', async () => {
      const audio = new FakeAudio();
      const socket = { emit: jest.fn() };
      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        progressIntervalMs: 25
      });

      // Rapidly trigger 100 play calls without waiting for previous ones to finish
      for (let i = 0; i < 100; i++) {
        renderer.play({ playbackId: `rapid-churn-${i}`, source: 'chat' });
        if (i % 2 === 0) {
          audio.dispatch('playing');
        }
      }

      // Only the final playback must be active
      expect(renderer.activePlayback.playbackId).toBe('rapid-churn-99');
      audio.dispatch('playing');

      // Advance by 25ms: exactly 1 progress tick occurs for rapid-churn-99
      jest.advanceTimersByTime(25);

      const progressCalls = socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:progress');
      expect(progressCalls.length).toBeGreaterThanOrEqual(1);
      const lastCall = progressCalls[progressCalls.length - 1];
      expect(lastCall[1].playbackId).toBe('rapid-churn-99');

      // Dispose cleans up completely
      renderer.dispose();
      expect(renderer.activePlayback).toBeNull();

      // Advancing time further produces zero emissions
      const countBefore = socket.emit.mock.calls.length;
      jest.advanceTimersByTime(500);
      expect(socket.emit.mock.calls.length).toBe(countBefore);
    });

    test('suppresses high-frequency timeupdate floods between ticker intervals', async () => {
      const audio = new FakeAudio();
      const socket = { emit: jest.fn() };
      let mockNow = 1000;
      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        now: () => mockNow,
        progressIntervalMs: 40
      });

      await renderer.play({ playbackId: 'flood-test' });
      audio.dispatch('playing');

      // Simulate 50 rapid timeupdate calls in a 5ms window
      for (let i = 0; i < 50; i++) {
        mockNow += 0.1;
        audio.currentTime += 0.001;
        audio.dispatch('timeupdate');
      }

      // Initial tick fires on first event, then subsequent 49 events are throttled
      const progressCalls = socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:progress');
      expect(progressCalls).toHaveLength(1);

      // Advance mockNow by 40ms to allow the next interval to emit
      mockNow += 40;
      audio.currentTime = 0.045;
      audio.dispatch('timeupdate');

      const progressCallsAfter = socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:progress');
      expect(progressCallsAfter).toHaveLength(2);

      renderer.dispose();
    });

    test('simulates sustained 10-second playback (250 ticks at 40ms) with deterministic delivery', async () => {
      const audio = new FakeAudio();
      const socket = { emit: jest.fn() };
      let mockNow = 10000;
      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        now: () => mockNow,
        progressIntervalMs: 40
      });

      await renderer.play({ playbackId: 'long-session' });
      audio.dispatch('playing');

      // Run 250 iterations of 40ms (10,000ms total)
      for (let tick = 1; tick <= 250; tick++) {
        mockNow += 40;
        audio.currentTime = tick * 0.04;
        jest.advanceTimersByTime(40);
      }

      const progressCalls = socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:progress');
      expect(progressCalls).toHaveLength(250);

      // Check timestamps are strictly monotonic and match 40ms steps
      for (let i = 0; i < 250; i++) {
        expect(progressCalls[i][1].currentTimeMs).toBe((i + 1) * 40);
      }

      audio.dispatch('ended');
      expect(socket.emit).toHaveBeenCalledWith('tts:renderer:ended', expect.objectContaining({
        playbackId: 'long-session'
      }));

      renderer.dispose();
    });
  });

  describe('Adversarial Objective 3: State Machine Edge Flapping & Hysteresis Dampening', () => {
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
        blinkInterval: 1000,
        obsEnabled: false
      });
    });

    afterEach(() => {
      controller.stopAllAnimations();
      controller.clearAllTimeouts();
    });

    test('dampens rapid flapping around onset threshold 0.26 (oscillating between 0.25 and 0.27)', async () => {
      await controller.startAnimation('viewer_onset', 'ViewerOnset', sprites, 5000, {
        externalLifecycle: true,
        playbackId: 'onset-flap'
      });

      io.emit.mockClear();

      // Start at silence
      controller.setMouthIntensity('viewer_onset', 'onset-flap', 0.0);
      expect(controller.activeAnimations.get('viewer_onset').mouthFrame).toBe('speak_closed');
      io.emit.mockClear();

      // Flap 100 times between 0.25 (below 0.26) and 0.27 (above 0.26)
      // When jumping to 0.27: triggers transition to speak_mid (1 emit)
      // When jumping back to 0.25: falling threshold is 0.14, so it stays speak_mid (0 emits)
      // All subsequent oscillations produce 0 socket emits!
      for (let i = 0; i < 100; i++) {
        const level = i % 2 === 0 ? 0.27 : 0.25;
        controller.setMouthIntensity('viewer_onset', 'onset-flap', level);
      }

      const frameEmits = io.emit.mock.calls.filter(([event]) => event === 'talkingheads:animation:frame');
      expect(frameEmits).toHaveLength(1);
      expect(frameEmits[0][1].frame).toBe('speak_mid');
      expect(controller.activeAnimations.get('viewer_onset').mouthFrame).toBe('speak_mid');
    });

    test('dampens rapid flapping around peak threshold 0.55 (oscillating between 0.54 and 0.56)', async () => {
      await controller.startAnimation('viewer_peak', 'ViewerPeak', sprites, 5000, {
        externalLifecycle: true,
        playbackId: 'peak-flap'
      });

      // Establish speak_mid state first
      controller.setMouthIntensity('viewer_peak', 'peak-flap', 0.30);
      expect(controller.activeAnimations.get('viewer_peak').mouthFrame).toBe('speak_mid');
      io.emit.mockClear();

      // Flap 100 times between 0.54 (below 0.55) and 0.56 (above 0.55)
      // When jumping to 0.56: transitions to speak_open (1 emit)
      // When jumping back to 0.54: falling threshold from open is 0.38, so it stays speak_open (0 emits)
      // All subsequent oscillations produce 0 socket emits!
      for (let i = 0; i < 100; i++) {
        const level = i % 2 === 0 ? 0.56 : 0.54;
        controller.setMouthIntensity('viewer_peak', 'peak-flap', level);
      }

      const frameEmits = io.emit.mock.calls.filter(([event]) => event === 'talkingheads:animation:frame');
      expect(frameEmits).toHaveLength(1);
      expect(frameEmits[0][1].frame).toBe('speak_open');
      expect(controller.activeAnimations.get('viewer_peak').mouthFrame).toBe('speak_open');
    });

    test('dampens rapid flapping around falling threshold 0.38 (oscillating between 0.37 and 0.39)', async () => {
      await controller.startAnimation('viewer_fall_open', 'ViewerFallOpen', sprites, 5000, {
        externalLifecycle: true,
        playbackId: 'fall-open-flap'
      });

      // Establish speak_open state
      controller.setMouthIntensity('viewer_fall_open', 'fall-open-flap', 0.80);
      expect(controller.activeAnimations.get('viewer_fall_open').mouthFrame).toBe('speak_open');
      io.emit.mockClear();

      // Flap 100 times between 0.37 (below 0.38) and 0.39 (above 0.38)
      // When dropping to 0.37: transitions from speak_open to speak_mid (1 emit)
      // When jumping back to 0.39: rising threshold from mid is 0.55, so it stays speak_mid (0 emits)
      // All subsequent oscillations produce 0 socket emits!
      for (let i = 0; i < 100; i++) {
        const level = i % 2 === 0 ? 0.37 : 0.39;
        controller.setMouthIntensity('viewer_fall_open', 'fall-open-flap', level);
      }

      const frameEmits = io.emit.mock.calls.filter(([event]) => event === 'talkingheads:animation:frame');
      expect(frameEmits).toHaveLength(1);
      expect(frameEmits[0][1].frame).toBe('speak_mid');
      expect(controller.activeAnimations.get('viewer_fall_open').mouthFrame).toBe('speak_mid');
    });

    test('dampens rapid flapping around falling threshold 0.14 (oscillating between 0.13 and 0.15)', async () => {
      await controller.startAnimation('viewer_fall_mid', 'ViewerFallMid', sprites, 5000, {
        externalLifecycle: true,
        playbackId: 'fall-mid-flap'
      });

      // Establish speak_mid state
      controller.setMouthIntensity('viewer_fall_mid', 'fall-mid-flap', 0.30);
      expect(controller.activeAnimations.get('viewer_fall_mid').mouthFrame).toBe('speak_mid');
      io.emit.mockClear();

      // Flap 100 times between 0.13 (below 0.14) and 0.15 (above 0.14)
      // When dropping to 0.13: transitions from speak_mid to speak_closed (1 emit)
      // When jumping back to 0.15: rising threshold from closed is 0.26, so it stays speak_closed (0 emits)
      // All subsequent oscillations produce 0 socket emits!
      for (let i = 0; i < 100; i++) {
        const level = i % 2 === 0 ? 0.13 : 0.15;
        controller.setMouthIntensity('viewer_fall_mid', 'fall-mid-flap', level);
      }

      const frameEmits = io.emit.mock.calls.filter(([event]) => event === 'talkingheads:animation:frame');
      expect(frameEmits).toHaveLength(1);
      expect(frameEmits[0][1].frame).toBe('speak_closed');
      expect(controller.activeAnimations.get('viewer_fall_mid').mouthFrame).toBe('speak_closed');
    });

    test('stress-tests 1,000 randomized fluctuating audio samples with frame deduplication', async () => {
      await controller.startAnimation('viewer_noise', 'ViewerNoise', sprites, 5000, {
        externalLifecycle: true,
        playbackId: 'noise-stress'
      });

      io.emit.mockClear();

      let transitions = 0;
      let lastRecordedFrame = controller.activeAnimations.get('viewer_noise').mouthFrame;

      for (let i = 0; i < 1000; i++) {
        let level;
        const phase = Math.floor(i / 50) % 4;
        if (phase === 0) level = 0.05 + Math.sin(i) * 0.04;
        else if (phase === 1) level = 0.20 + Math.sin(i) * 0.03;
        else if (phase === 2) level = 0.40 + Math.sin(i) * 0.08;
        else level = 0.75 + Math.sin(i) * 0.15;

        controller.setMouthIntensity('viewer_noise', 'noise-stress', level);
        const currentFrame = controller.activeAnimations.get('viewer_noise').mouthFrame;
        if (currentFrame !== lastRecordedFrame) {
          transitions++;
          lastRecordedFrame = currentFrame;
        }
      }

      const frameEmits = io.emit.mock.calls.filter(([event]) => event === 'talkingheads:animation:frame');
      expect(frameEmits.length).toBe(transitions);
      expect(frameEmits.length).toBeLessThan(35);
    });

    test('handles pathological, infinite, and out-of-bounds intensity levels robustly', async () => {
      await controller.startAnimation('viewer_pathological', 'ViewerPathological', sprites, 5000, {
        externalLifecycle: true,
        playbackId: 'path-stress'
      });

      // 1. Level > 1.0 clamps cleanly to 1.0 -> speak_open
      controller.setMouthIntensity('viewer_pathological', 'path-stress', 999.0);
      expect(controller.activeAnimations.get('viewer_pathological').mouthFrame).toBe('speak_open');

      // 2. Level < 0.0 clamps cleanly to 0.0 -> drops to speak_mid (step 1 of 80ms decay)
      controller.setMouthIntensity('viewer_pathological', 'path-stress', -50.0);
      expect(controller.activeAnimations.get('viewer_pathological').mouthFrame).toBe('speak_mid');

      // Step 2 of decay: drops to speak_closed
      controller.setMouthIntensity('viewer_pathological', 'path-stress', -50.0);
      expect(controller.activeAnimations.get('viewer_pathological').mouthFrame).toBe('speak_closed');

      // 3. Non-finite values (Infinity, -Infinity, NaN, null, undefined) safely trigger fallback timer
      expect(controller.setMouthIntensity('viewer_pathological', 'path-stress', Infinity)).toBe(true);
      expect(controller.activeAnimations.get('viewer_pathological').fallbackMouthTimer).not.toBeNull();

      expect(controller.setMouthIntensity('viewer_pathological', 'path-stress', -Infinity)).toBe(true);
      expect(controller.setMouthIntensity('viewer_pathological', 'path-stress', null)).toBe(true);
      expect(controller.setMouthIntensity('viewer_pathological', 'path-stress', undefined)).toBe(true);
      expect(controller.setMouthIntensity('viewer_pathological', 'path-stress', NaN)).toBe(true);

      // 4. Resuming valid level clears fallback timer
      controller.setMouthIntensity('viewer_pathological', 'path-stress', 0.65);
      expect(controller.activeAnimations.get('viewer_pathological').fallbackMouthTimer).toBeNull();
      expect(controller.activeAnimations.get('viewer_pathological').mouthFrame).toBe('speak_open');

      // 5. Mismatched playbackId returns false and alters nothing
      expect(controller.setMouthIntensity('viewer_pathological', 'wrong-id', 0.1)).toBe(false);
      expect(controller.activeAnimations.get('viewer_pathological').mouthFrame).toBe('speak_open');

      // 6. Non-existent user returns false
      expect(controller.setMouthIntensity('nobody', 'path-stress', 0.1)).toBe(false);
    });

    test('recycles timeout tracking to prevent unbounded memory growth during continuous operation', async () => {
      for (let i = 0; i < 250; i++) {
        await controller.startAnimation(`streamer_${i}`, `Streamer${i}`, sprites, 50, {
          externalLifecycle: false
        });
        controller.stopAnimation(`streamer_${i}`);
      }

      expect(controller.animationTimeouts.length).toBeLessThanOrEqual(100);
      expect(controller.activeAnimations.size).toBe(0);
    });
  });
});
