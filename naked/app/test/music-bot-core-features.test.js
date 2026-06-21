const QueueManager = require('../plugins/music-bot/lib/queue-manager');
const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');

function createDbMock() {
  return {
    prepare: jest.fn(() => ({
      run: jest.fn(),
      get: jest.fn(() => ({ count: 0 })),
      all: jest.fn(() => [])
    })),
    transaction: jest.fn((fn) => fn)
  };
}

function createApiMock(db) {
  return {
    getDatabase: () => db,
    log: jest.fn()
  };
}

describe('Music Bot core features', () => {
  test('enforces max requests per user case-insensitively', () => {
    const db = createDbMock();
    const api = createApiMock(db);
    const queueManager = new QueueManager({
      queue: {
        maxLength: 50,
        maxPerUser: 3,
        maxSongDurationSeconds: 600,
        allowDuplicates: true,
        duplicateDetection: 'off',
        cooldownPerUserSeconds: 0
      }
    }, api);

    for (let i = 0; i < 3; i += 1) {
      const addResult = queueManager.addSong({
        title: `Song ${i}`,
        url: `https://example.com/song-${i}.mp3`,
        requestedBy: 'UserOne'
      });
      expect(addResult.success).toBe(true);
    }

    const blocked = queueManager.addSong({
      title: 'Fourth Song',
      url: 'https://example.com/song-4.mp3',
      requestedBy: 'userone'
    });
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain('3');
  });

  test('enforces cooldown per user case-insensitively', () => {
    const db = createDbMock();
    const api = createApiMock(db);
    const queueManager = new QueueManager({
      queue: {
        maxLength: 50,
        maxPerUser: 5,
        maxSongDurationSeconds: 600,
        allowDuplicates: true,
        duplicateDetection: 'off',
        cooldownPerUserSeconds: 30
      }
    }, api);

    const first = queueManager.addSong({
      title: 'First',
      url: 'https://example.com/first.mp3',
      requestedBy: 'ViewerA'
    });
    expect(first.success).toBe(true);

    const second = queueManager.addSong({
      title: 'Second',
      url: 'https://example.com/second.mp3',
      requestedBy: 'viewera'
    });
    expect(second.success).toBe(false);
    expect(second.error).toContain('Sekunden');
  });

  test('applies ducking and restores master volume', async () => {
    const engine = new PlaybackEngine({
      defaultVolume: 50,
      ducking: {
        enabled: true,
        targetVolumePercent: 40,
        fadeOutMs: 0,
        fadeInMs: 0,
        holdMs: 10
      },
      normalization: { enabled: false }
    }, { log: jest.fn() });

    const commands = [];
    engine.process = { exitCode: null };
    engine._sendCommand = async (cmd) => {
      commands.push(cmd);
    };

    await engine.setVolume(80);
    await engine.triggerDucking(10);
    expect(engine.getVolume()).toBe(80);
    expect(engine.volume).toBe(32);

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(engine.volume).toBe(80);
    expect(commands).toContainEqual(['set_property', 'volume', 32]);
    expect(commands).toContainEqual(['set_property', 'volume', 80]);
  });

  test('builds loudnorm filter when normalization is enabled', async () => {
    const engine = new PlaybackEngine({
      defaultVolume: 50,
      ducking: { enabled: false },
      normalization: {
        enabled: true,
        integratedLufs: -14,
        truePeakDb: -1.0,
        lra: 9
      }
    }, { log: jest.fn() });

    const commands = [];
    engine._sendCommand = async (cmd) => {
      commands.push(cmd);
    };

    await engine._applyNormalizationFilter();
    expect(commands[0][0]).toBe('af');
    expect(commands[0][1]).toBe('set');
    expect(commands[0][2]).toContain('loudnorm=I=-14:TP=-1:LRA=9');
  });
});
