const KingOfTheHillMode = require('../engine/koth-mode');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

describe('King of the Hill lifecycle and scoring', () => {
  let mode;
  let io;
  let db;

  beforeEach(() => {
    io = { emit: jest.fn() };
    db = {
      addMatchParticipantCoins: jest.fn(() => 1)
    };
    mode = new KingOfTheHillMode(db, io, logger);
  });

  afterEach(() => {
    mode.destroy();
  });

  test('requires a normal match and reports inactive state before start', () => {
    expect(() => mode.start()).toThrow('KOTH requires an active normal match');
    expect(mode.updateLeaderboard([{ userId: 'viewer-1' }])).toBeNull();
    expect(mode.getStats().active).toBe(false);
  });

  test('returns the actual previous king and writes reign bonus to match score', () => {
    mode.start(42);
    mode.updateLeaderboard([{ userId: 'viewer-1', nickname: 'First', coins: 10 }]);
    mode.kingStartTime = Date.now() - 14000;

    const result = mode.updateLeaderboard([{ userId: 'viewer-2', nickname: 'Second', coins: 20 }]);

    expect(result.oldKing).toBe('viewer-1');
    expect(db.addMatchParticipantCoins).toHaveBeenCalledWith(42, 'viewer-1', 2);
  });

  test('ends cleanly and emits inactive final stats', () => {
    mode.start(42);
    mode.updateLeaderboard([{ userId: 'viewer-1', nickname: 'First', coins: 10 }]);

    const finalStats = mode.end();
    const endedEvent = io.emit.mock.calls.find(([event]) => event === 'coinbattle:koth-ended');

    expect(finalStats.active).toBe(false);
    expect(finalStats.currentKing.userId).toBe('viewer-1');
    expect(endedEvent[1].active).toBe(false);
    expect(mode.getStats().active).toBe(false);
  });
});
