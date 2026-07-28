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
});
