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

  function randomSequence(...values) {
    let index = 0;
    return () => values[index++] ?? 0;
  }

  test('builds canonical three-pack pools and chooses each eligible pack uniformly', () => {
    const library = new AssetSpriteLibrary({ dataDir: '/tmp/talking-heads-lottery-test' });
    const pools = library.getLotterySelectionPools();
    const boba = { packId: 'boba', characterId: 'Axolotl', options: { expression: 'Default' } };
    const kenney = { packId: 'kenney', characterId: 'blueA', options: { eye: 'angry_blue' } };
    const rgs = { packId: 'rgs', characterId: 'head1', options: { hair: 'hair1', eyes: 'eyes1', mouth: 'mouth1' } };

    expect(Object.fromEntries(Object.entries(pools).map(([packId, selections]) => [packId, selections.length])))
      .toEqual({ boba: 90, kenney: 540, rgs: 504 });
    expect(library.getRandomSelection(randomSequence(0, 0))).toEqual(boba);
    expect(library.getRandomSelection(randomSequence(0.34, 0))).toEqual(kenney);
    expect(library.getRandomSelection(randomSequence(0.67, 0))).toEqual(rgs);
  });

  test('excludes the exact current selection and keeps zero-RNG candidates unique inside Boba', () => {
    const library = new AssetSpriteLibrary({ dataDir: '/tmp/talking-heads-lottery-test' });
    const current = { packId: 'boba', characterId: 'Axolotl', options: { expression: 'Default' } };
    const reroll = library.getRandomSelection(randomSequence(0, 0), current);
    const candidates = library.getLotteryCandidates(
      3,
      randomSequence(0, 0, 0, 0, 0, 0),
      [current]
    );

    expect(reroll).toEqual({
      packId: 'boba',
      characterId: 'Axolotl',
      options: { expression: 'Angry' }
    });
    expect(candidates).toEqual([
      { packId: 'boba', characterId: 'Axolotl', options: { expression: 'Angry' } },
      { packId: 'boba', characterId: 'Axolotl', options: { expression: 'Annoyed' } },
      { packId: 'boba', characterId: 'Axolotl', options: { expression: 'Cry' } }
    ]);
    expect(new Set(candidates.map(selection => JSON.stringify(selection))).size).toBe(3);
  });

  test('every three-pack automatic selection resolves usable idle, blink, and speaking frames', async () => {
    const library = new AssetSpriteLibrary();
    const selections = Object.values(library.getLotterySelectionPools()).flat();

    expect(selections).toHaveLength(1134);
    for (const selection of selections) {
      const frames = await library._getFrameLayers(selection);
      expect(['idle_neutral', 'blink', 'speak_closed', 'speak_mid', 'speak_open']
        .every(frameName => Array.isArray(frames[frameName]) && frames[frameName].length > 0)).toBe(true);
      const speakingSignatures = ['speak_closed', 'speak_mid', 'speak_open']
        .map(frameName => frames[frameName].filter(Boolean).join('|'));
      expect(new Set(speakingSignatures).size).toBe(3);
    }
  });
});
