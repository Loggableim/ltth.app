const { DashboardTTSRenderer } = require('../public/js/tts-renderer-lifecycle');

class FakeAudio {
  constructor() {
    this.listeners = new Map();
    this.currentTime = 0;
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

describe('Dashboard TTS renderer acknowledgement', () => {
  test('reports native playing, throttled progress, and ended without audio or text data', async () => {
    const audio = new FakeAudio();
    const socket = { emit: jest.fn() };
    let now = 0;
    const renderer = new DashboardTTSRenderer({
      audio,
      socket,
      now: () => now,
      progressIntervalMs: 100
    });

    await renderer.play({ playbackId: 'dashboard-playback', source: 'chat' });
    audio.dispatch('playing');
    now = 101;
    audio.currentTime = 0.5;
    audio.dispatch('timeupdate');
    audio.dispatch('ended');

    expect(socket.emit).toHaveBeenCalledWith('tts:renderer:started', expect.objectContaining({
      playbackId: 'dashboard-playback',
      currentTimeMs: 0
    }));
    expect(socket.emit).toHaveBeenCalledWith('tts:renderer:progress', expect.objectContaining({
      playbackId: 'dashboard-playback',
      currentTimeMs: 500,
      level: null
    }));
    expect(socket.emit).toHaveBeenCalledWith('tts:renderer:ended', expect.objectContaining({
      playbackId: 'dashboard-playback',
      currentTimeMs: 500
    }));
    socket.emit.mock.calls.forEach(([, payload]) => {
      expect(payload.audioData).toBeUndefined();
      expect(payload.text).toBeUndefined();
    });
  });

  test('reports an autoplay rejection as a terminal renderer failure', async () => {
    const audio = new FakeAudio();
    audio.play.mockRejectedValue(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    const socket = { emit: jest.fn() };
    const renderer = new DashboardTTSRenderer({ audio, socket });

    await expect(renderer.play({ playbackId: 'autoplay-blocked', source: 'chat' })).resolves.toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('tts:renderer:failed', expect.objectContaining({
      playbackId: 'autoplay-blocked',
      reason: 'NotAllowedError'
    }));
  });

  test('reports one terminal failure when output routing rejects before native playback', async () => {
    const audio = new FakeAudio();
    const socket = { emit: jest.fn() };
    const routingError = Object.assign(new Error('routing unavailable'), { name: 'OutputRoutingError' });
    const renderer = new DashboardTTSRenderer({ audio, socket });

    await expect(renderer.play({
      playbackId: 'routing-init-failed',
      source: 'chat',
      route: () => Promise.reject(routingError)
    })).resolves.toBe(false);

    const failures = socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:failed');
    expect(audio.play).not.toHaveBeenCalled();
    expect(failures).toEqual([
      ['tts:renderer:failed', {
        playbackId: 'routing-init-failed',
        currentTimeMs: 0,
        reason: 'OutputRoutingError'
      }]
    ]);
    expect(failures[0][1]).not.toHaveProperty('audioData');
    expect(failures[0][1]).not.toHaveProperty('text');
  });

  describe('high-frequency metering & ticker lifecycle', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    test('defaults progress interval to 40ms and clamps to at least 20ms', () => {
      const defaultRenderer = new DashboardTTSRenderer();
      expect(defaultRenderer.progressIntervalMs).toBe(40);

      const clampedLow = new DashboardTTSRenderer({ progressIntervalMs: 10 });
      expect(clampedLow.progressIntervalMs).toBe(20);

      const customInterval = new DashboardTTSRenderer({ progressIntervalMs: 35 });
      expect(customInterval.progressIntervalMs).toBe(35);

      const customFifty = new DashboardTTSRenderer({ progressIntervalMs: 50 });
      expect(customFifty.progressIntervalMs).toBe(50);
    });

    test('drives progress emissions via active ticker at <= 50ms without timeupdate events', async () => {
      jest.useFakeTimers();
      const audio = new FakeAudio();
      const socket = { emit: jest.fn() };
      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        progressIntervalMs: 40
      });

      await renderer.play({ playbackId: 'ticker-playback', source: 'chat' });
      audio.dispatch('playing');

      expect(socket.emit).toHaveBeenCalledWith('tts:renderer:started', expect.objectContaining({
        playbackId: 'ticker-playback',
        currentTimeMs: 0
      }));

      // Advance by 40ms: first progress tick occurs via interval timer
      audio.currentTime = 0.04;
      jest.advanceTimersByTime(40);

      const progressCallsAfterFirstTick = socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:progress');
      expect(progressCallsAfterFirstTick).toHaveLength(1);
      expect(progressCallsAfterFirstTick[0][1]).toEqual(expect.objectContaining({
        playbackId: 'ticker-playback',
        currentTimeMs: 40
      }));

      // Advance by another 40ms: second progress tick occurs
      audio.currentTime = 0.08;
      jest.advanceTimersByTime(40);

      const progressCallsAfterSecondTick = socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:progress');
      expect(progressCallsAfterSecondTick).toHaveLength(2);
      expect(progressCallsAfterSecondTick[1][1]).toEqual(expect.objectContaining({
        playbackId: 'ticker-playback',
        currentTimeMs: 80
      }));

      // End playback and ensure timer is cleaned up
      audio.dispatch('ended');
      expect(socket.emit).toHaveBeenCalledWith('tts:renderer:ended', expect.objectContaining({
        playbackId: 'ticker-playback'
      }));

      // Further time advancement should not trigger any new progress ticks
      jest.advanceTimersByTime(200);
      const totalProgressCalls = socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:progress');
      expect(totalProgressCalls).toHaveLength(2);
    });

    test('reads audio levels through analyser node without connecting captureStream to destination', async () => {
      jest.useFakeTimers();
      const audio = new FakeAudio();
      const streamMock = {};
      audio.captureStream = jest.fn(() => streamMock);

      const mockAnalyser = {
        fftSize: 512,
        getByteTimeDomainData: jest.fn((buffer) => {
          for (let i = 0; i < buffer.length; i++) {
            buffer[i] = 128 + (i % 2 === 0 ? 40 : -40);
          }
        })
      };

      const mediaStreamSourceMock = {
        connect: jest.fn()
      };

      const mockDestination = {};
      class MockAudioContext {
        constructor() {
          this.state = 'running';
          this.destination = mockDestination;
        }
        createAnalyser() {
          return mockAnalyser;
        }
        createMediaStreamSource(stream) {
          expect(stream).toBe(streamMock);
          return mediaStreamSourceMock;
        }
      }

      const socket = { emit: jest.fn() };
      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        progressIntervalMs: 35,
        AudioContext: MockAudioContext
      });

      await renderer.play({ playbackId: 'analyser-audio', source: 'chat' });
      audio.dispatch('playing');

      // Verify analyser was wired to captureStream but NOT to audioContext.destination
      expect(mediaStreamSourceMock.connect).toHaveBeenCalledWith(mockAnalyser);
      // Analyser must not connect to destination when captureStream is used (prevents echo/doubling)
      expect(mockAnalyser.connect).toBeUndefined();

      audio.currentTime = 0.035;
      jest.advanceTimersByTime(35);

      const progressPayload = socket.emit.mock.calls.find(([event]) => event === 'tts:renderer:progress')[1];
      expect(progressPayload.level).toBeGreaterThan(0);
      expect(typeof progressPayload.level).toBe('number');
    });

    test('cleans up progress ticker on error, replacement, and dispose', async () => {
      jest.useFakeTimers();
      const audio = new FakeAudio();
      const socket = { emit: jest.fn() };
      const renderer = new DashboardTTSRenderer({
        audio,
        socket,
        progressIntervalMs: 40
      });

      // 1. Cleanup on error
      await renderer.play({ playbackId: 'error-cleanup' });
      audio.dispatch('playing');
      audio.dispatch('error');
      jest.advanceTimersByTime(120);
      expect(socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:progress')).toHaveLength(0);

      // 2. Cleanup on playback replacement
      await renderer.play({ playbackId: 'replaced-one' });
      audio.dispatch('playing');
      jest.advanceTimersByTime(40);
      expect(socket.emit.mock.calls.filter(([event]) => event === 'tts:renderer:progress')).toHaveLength(1);

      await renderer.play({ playbackId: 'replaced-two' });
      // replaced-one timer was disposed
      jest.advanceTimersByTime(40);
      const replacedOneProgress = socket.emit.mock.calls.filter(
        ([event, p]) => event === 'tts:renderer:progress' && p.playbackId === 'replaced-one'
      );
      expect(replacedOneProgress).toHaveLength(1);

      // 3. Cleanup on renderer.dispose()
      audio.dispatch('playing');
      renderer.dispose();
      jest.advanceTimersByTime(120);
      const replacedTwoProgress = socket.emit.mock.calls.filter(
        ([event, p]) => event === 'tts:renderer:progress' && p.playbackId === 'replaced-two'
      );
      expect(replacedTwoProgress).toHaveLength(0);
    });
  });
});
