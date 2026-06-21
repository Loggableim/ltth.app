const QueueManager = require('../plugins/music-bot/lib/queue-manager');

function createQueueManager(queueConfig = {}) {
  const stmt = {
    run: jest.fn(),
    all: jest.fn(() => []),
    get: jest.fn(() => ({ count: 0 }))
  };
  const db = {
    prepare: jest.fn(() => stmt),
    transaction: jest.fn((fn) => fn)
  };
  const api = {
    getDatabase: () => db,
    log: jest.fn()
  };
  const config = {
    queue: {
      maxLength: 50,
      maxPerUser: 5,
      maxSongDurationSeconds: 360,
      cooldownPerUserSeconds: 0,
      allowDuplicates: true,
      duplicateDetection: 'off',
      ...queueConfig
    },
    voteSkip: { minVotes: 3, thresholdPercent: 50 }
  };
  return new QueueManager(config, api);
}

function createSong(overrides = {}) {
  return {
    title: 'Test Song',
    url: 'https://youtube.com/watch?v=abc123xyz99',
    requestedBy: 'viewer',
    duration: 120,
    ...overrides
  };
}

describe('Music Bot QueueManager max song duration', () => {
  test('rejects songs when duration metadata is missing', () => {
    const queueManager = createQueueManager({ maxSongDurationSeconds: 360 });
    const result = queueManager.addSong(createSong({ duration: null }));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Songdauer konnte nicht ermittelt werden/i);
  });

  test('rejects songs that exceed configured max duration', () => {
    const queueManager = createQueueManager({ maxSongDurationSeconds: 180 });
    const result = queueManager.addSong(createSong({ duration: 181 }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('Maximum: 180s');
  });

  test('accepts songs that are within configured max duration', () => {
    const queueManager = createQueueManager({ maxSongDurationSeconds: 180 });
    const result = queueManager.addSong(createSong({ duration: 180 }));

    expect(result.success).toBe(true);
    expect(result.song.duration).toBe(180);
  });

  test('clamps too-low config values to the minimum allowed duration threshold', () => {
    const queueManager = createQueueManager({ maxSongDurationSeconds: 0 });
    const result = queueManager.addSong(createSong({ duration: 361 }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('Maximum: 30s');
  });
});
