const AvatarLotteryManager = require('../plugins/talking-heads/utils/avatar-lottery-manager');
const AssetSpriteLibrary = require('../plugins/talking-heads/engines/asset-sprite-library');

function createDatabase() {
  const rows = new Map();
  return {
    rows,
    prepare: jest.fn((sql) => ({
      run: (...values) => {
        if (sql.includes('INSERT INTO talking_heads_avatar_lottery')) {
          const [userId, username, selection, createdAt, updatedAt] = values;
          const existing = rows.get(userId);
          rows.set(userId, {
            user_id: userId,
            username,
            selection_json: selection,
            state: 'kept',
            created_at: existing?.created_at || createdAt,
            updated_at: updatedAt
          });
        }
        return { changes: 1 };
      },
      get: (userId) => rows.get(userId) || undefined
    }))
  };
}

describe('Talking Heads avatar lottery manager', () => {
  let manager;
  let db;

  beforeEach(() => {
    db = createDatabase();
    manager = new AvatarLotteryManager(db, { info: jest.fn(), warn: jest.fn(), error: jest.fn() });
    manager.init();
  });

  test('treats a valid legacy lottery row as an existing avatar assignment', () => {
    db.rows.set('legacy-user', {
      user_id: 'legacy-user',
      username: 'Legacy Viewer',
      selection_json: JSON.stringify({ packId: 'kenney', characterId: 'blueA', options: { eye: 'human' } }),
      state: 'pending',
      created_at: 100,
      updated_at: 200
    });

    expect(manager.getAssignment('legacy-user')).toMatchObject({
      userId: 'legacy-user',
      selection: { packId: 'kenney', characterId: 'blueA', options: { eye: 'human' } },
      createdAt: 100
    });
  });

  test('persists an assignment and only rerolls an existing avatar to a different selection', () => {
    const fox = { packId: 'boba', characterId: 'Fox', options: { expression: 'Default' } };
    const bear = { packId: 'boba', characterId: 'Bear', options: { expression: 'Happy' } };

    expect(manager.reroll('missing', 'Missing', bear)).toBeNull();
    expect(manager.assign('u1', 'Viewer', fox)).toMatchObject({ selection: fox, state: 'kept' });
    expect(manager.reroll('u1', 'Viewer', fox)).toBeNull();
    expect(manager.reroll('u1', 'Viewer', bear)).toMatchObject({ selection: bear, state: 'kept' });
    expect(manager.getAssignment('u1').selection).toEqual(bear);
  });

  test('draws uniformly from unique Boba animal-expression assignments only', () => {
    const library = new AssetSpriteLibrary({ dataDir: '/tmp/talking-heads-lottery-test' });
    const first = library.getRandomSelection(() => 0);
    const last = library.getRandomSelection(() => 0.999999);
    const all = library.getLotteryCandidates(120, () => 0);
    const reroll = library.getRandomSelection(() => 0, first);

    expect(first).toEqual({
      packId: 'boba',
      characterId: 'Axolotl',
      options: { expression: 'Default' }
    });
    expect(last).toEqual({
      packId: 'boba',
      characterId: 'Spider',
      options: { expression: 'Scared' }
    });
    expect(all).toHaveLength(120);
    expect(new Set(all.map((selection) => JSON.stringify(selection))).size).toBe(120);
    expect(all.every((selection) => selection.packId === 'boba')).toBe(true);
    expect(reroll).not.toEqual(first);
  });
});
