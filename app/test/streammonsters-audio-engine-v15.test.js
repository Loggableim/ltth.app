const AudioEngine = require('../plugins/stream-monsters/streammonsters-audio-engine');

function contextHarness() {
  const scheduled = [];
  const context = {
    currentTime: 4,
    destination: { id: 'destination' },
    createGain: jest.fn(() => ({
      gain: { value: 1, setValueAtTime: jest.fn() },
      connect: jest.fn()
    })),
    createDynamicsCompressor: jest.fn(() => ({
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: jest.fn()
    })),
    createBufferSource: jest.fn(() => ({
      connect: jest.fn(),
      start: jest.fn(at => scheduled.push(at))
    })),
    decodeAudioData: jest.fn(async buffer => ({ decoded: buffer.byteLength }))
  };
  return { context, scheduled };
}

const manifest = {
  cues: {
    'arena.hit': {
      channel: 'battle',
      gainDb: -8,
      variants: [
        { assetPath: 'assets/audio/cues/hit-1.wav' },
        { assetPath: 'assets/audio/cues/hit-2.wav' }
      ]
    },
    'egg.spawn': {
      channel: 'egg',
      gainDb: -6,
      variants: [{ assetPath: 'assets/audio/cues/spawn.wav' }]
    }
  }
};

describe('Stream Monsters 1.5 deterministic five-channel audio engine', () => {
  test('selects variants by stable event identity and never by runtime randomness', () => {
    expect(AudioEngine.variantIndex('battle-12:action-4', 2))
      .toBe(AudioEngine.variantIndex('battle-12:action-4', 2));
    expect(AudioEngine.variantIndex('battle-12:action-4', 2)).toBeGreaterThanOrEqual(0);
    expect(AudioEngine.variantIndex('battle-12:action-4', 2)).toBeLessThan(2);
    expect(AudioEngine.selectVariant(manifest, 'arena.hit', 'battle-12:action-4'))
      .toEqual(expect.objectContaining({ assetPath: expect.stringMatching(/hit-[12]\.wav$/) }));
  });

  test('normalizes all persisted channels and master scaling without localStorage', () => {
    const config = AudioEngine.normalizeChannelConfig({
      master: { enabled: true, volume: 0.8 },
      ui: { enabled: false, volume: 0.5 },
      egg: { enabled: true, volume: 0.6 },
      battle: { enabled: true, volume: 2 },
      reward: { enabled: true, volume: -1 }
    });
    expect(config).toEqual({
      master: { enabled: true, volume: 0.8 },
      ui: { enabled: false, volume: 0.5 },
      egg: { enabled: true, volume: 0.6 },
      battle: { enabled: true, volume: 1 },
      reward: { enabled: true, volume: 0 }
    });
  });

  test('preloads once, routes through limiter, schedules at deterministic impact time, and fails silent', async () => {
    const { context, scheduled } = contextHarness();
    const fetchAsset = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
    }));
    const engine = AudioEngine.createAudioEngine({
      context,
      manifest,
      fetchAsset,
      config: {
        master: { enabled: true, volume: 0.8 },
        battle: { enabled: true, volume: 0.7 }
      }
    });

    await engine.preload();
    await engine.preload();
    expect(fetchAsset).toHaveBeenCalledTimes(3);
    expect(context.createDynamicsCompressor).toHaveBeenCalledTimes(1);

    const played = await engine.play('arena.hit', {
      eventId: 'battle-a:action-1',
      delayMs: 1300
    });
    expect(played).toBe(true);
    expect(scheduled).toEqual([5.3]);

    engine.configure({ battle: { enabled: false, volume: 1 } });
    expect(await engine.play('arena.hit', { eventId: 'battle-a:action-2' })).toBe(false);
    expect(await engine.play('missing', { eventId: 'missing' })).toBe(false);
  });
});
