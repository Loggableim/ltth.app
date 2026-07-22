const AvatarLotteryManager = require('../plugins/talking-heads/utils/avatar-lottery-manager');
const AssetSpriteLibrary = require('../plugins/talking-heads/engines/asset-sprite-library');

function createDatabase() {
  const rows = new Map();
  return {
    prepare: jest.fn((sql) => ({
      run: (...values) => {
        if (sql.includes('INSERT INTO talking_heads_avatar_lottery')) {
          const [userId, username, selection, createdAt, updatedAt] = values;
          rows.set(userId, { user_id: userId, username, selection_json: selection, state: 'pending', created_at: createdAt, updated_at: updatedAt });
        }
        if (sql.includes('UPDATE talking_heads_avatar_lottery SET state')) {
          const [state, now, userId] = values;
          const row = rows.get(userId);
          if (row) rows.set(userId, { ...row, state, updated_at: now });
        }
        return { changes: 1 };
      },
      get: (userId) => rows.get(userId) || undefined
    }))
  };
}

describe('Talking Heads avatar lottery manager', () => {
  let manager;

  beforeEach(() => {
    manager = new AvatarLotteryManager(createDatabase(), { info: jest.fn(), warn: jest.fn(), error: jest.fn() });
    manager.init();
  });

  test('rerolls by default until !keep, then redraws after !reroll', () => {
    expect(manager.shouldDraw(null)).toBe(true);

    const drawn = manager.draw('u1', 'Viewer', { packId: 'boba', characterId: 'Fox', options: {} });
    expect(drawn.state).toBe('pending');
    expect(manager.shouldDraw(manager.getChoice('u1'))).toBe(true);

    expect(manager.applyCommand('u1', '!keep').state).toBe('kept');
    expect(manager.shouldDraw(manager.getChoice('u1'))).toBe(false);

    expect(manager.applyCommand('u1', '!reroll').state).toBe('reroll_armed');
    expect(manager.shouldDraw(manager.getChoice('u1'))).toBe(true);
  });

  test('accepts only exact keep and reroll commands', () => {
    manager.draw('u1', 'Viewer', { packId: 'boba', characterId: 'Fox', options: {} });

    expect(manager.applyCommand('u1', '!keeper')).toBeNull();
    expect(manager.applyCommand('u1', ' !KEEP ')).toMatchObject({ state: 'kept' });
    expect(manager.applyCommand('u1', 'hello !reroll')).toBeNull();
    expect(manager.applyCommand('u1', '!ReRoLl')).toMatchObject({ state: 'reroll_armed' });
  });

  test('creates deterministic and valid random local asset selections', () => {
    const library = new AssetSpriteLibrary({ dataDir: '/tmp/talking-heads-lottery-test' });
    const first = library.getRandomSelection(() => 0);
    const last = library.getRandomSelection(() => 0.999999);
    const candidates = library.getLotteryCandidates(3, () => 0.4);

    expect(first).toMatchObject({ packId: 'boba', characterId: 'Axolotl' });
    expect(last).toHaveProperty('packId');
    expect(candidates).toHaveLength(3);
    expect(candidates.every((selection) => selection.packId && selection.characterId)).toBe(true);
  });
});
