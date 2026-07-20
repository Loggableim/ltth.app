const LikesPointsSystem = require('../backend/likes-points');

describe('LikesPointsSystem remainder accumulation', () => {
  test('turns 100 separate likes into one gameplay point', () => {
    const db = { prepare: () => ({ run: jest.fn() }) };
    const system = new LikesPointsSystem(db, { info: jest.fn(), debug: jest.fn(), error: jest.fn() });
    system.config.enabled = true;

    const results = Array.from({ length: 100 }, () => (
      system.processLikeEvent(7, 'viewer-1', 1)
    ));

    expect(results.slice(0, 99).every(result => result.points === 0)).toBe(true);
    expect(results[99].points).toBe(1);
    expect(system.processLikeEvent(7, 'viewer-1', 1).points).toBe(0);
  });

  test('keeps remainders separate for users and event types', () => {
    const db = { prepare: () => ({ run: jest.fn() }) };
    const system = new LikesPointsSystem(db, { info: jest.fn(), debug: jest.fn(), error: jest.fn() });
    system.config.enabled = true;
    system.config.sharesPerPoint = 2;

    expect(system.processLikeEvent(7, 'viewer-1', 50).points).toBe(0);
    expect(system.processLikeEvent(7, 'viewer-2', 50).points).toBe(0);
    expect(system.processShareEvent(7, 'viewer-1', 1).points).toBe(0);
    expect(system.processShareEvent(7, 'viewer-1', 1).points).toBe(1);
  });
});

