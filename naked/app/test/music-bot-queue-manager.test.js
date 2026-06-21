const QueueManager = require('../plugins/music-bot/lib/queue-manager');

function createMockApi() {
  const stmt = {
    run: jest.fn(),
    get: jest.fn(() => null),
    all: jest.fn(() => [])
  };
  return {
    getDatabase: () => ({
      prepare: jest.fn(() => stmt)
    }),
    log: jest.fn()
  };
}

describe('music-bot queue manager', () => {
  it('persists requester avatar on queue entries', () => {
    const api = createMockApi();
    const manager = new QueueManager({
      queue: {
        maxLength: 10,
        maxPerUser: 3,
        maxSongDurationSeconds: 600,
        duplicateDetection: 'off',
        allowDuplicates: true,
        cooldownPerUserSeconds: 0
      }
    }, api);

    const result = manager.addSong({
      title: 'Test Song',
      url: 'https://example.com/song',
      requestedBy: 'tester',
      requesterAvatar: 'https://example.com/avatar.jpg'
    });

    expect(result.success).toBe(true);
    expect(result.song.requesterAvatar).toBe('https://example.com/avatar.jpg');
  });

  it('reorders queue entries by index', () => {
    const api = createMockApi();
    const manager = new QueueManager({
      queue: {
        maxLength: 10,
        maxPerUser: 3,
        maxSongDurationSeconds: 600,
        duplicateDetection: 'off',
        allowDuplicates: true,
        cooldownPerUserSeconds: 0
      }
    }, api);

    manager.addSong({ title: 'A', url: 'https://example.com/a', requestedBy: 'u1' });
    manager.addSong({ title: 'B', url: 'https://example.com/b', requestedBy: 'u2' });
    const reorder = manager.reorderSong(1, 0);

    expect(reorder.success).toBe(true);
    expect(manager.getQueue().map((entry) => entry.title)).toEqual(['B', 'A']);
  });
});
