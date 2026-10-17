const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const TalkingHeadsPlugin = require('../plugins/talking-heads/main.js');
const AssetSpriteLibrary = require('../plugins/talking-heads/engines/asset-sprite-library.js');
const AvatarLotteryManager = require('../plugins/talking-heads/utils/avatar-lottery-manager.js');

describe('Talking Heads Challenger M1: Boba Animals Exclusivity & Legacy SQLite Migration', () => {
  let tmpDir;
  let realDb;
  let lotteryManager;
  let spriteLibrary;

  const BOBA_ANIMALS = [
    'Axolotl', 'Bear', 'Bunny', 'Dog', 'Fox', 'Frog', 'Giraffe', 'Goat',
    'Monkey', 'Octopus', 'Otter', 'Pinguin', 'Raccoon', 'Seal', 'Snake', 'Spider'
  ];
  const BOBA_EXPRESSIONS = ['Default', 'Angry', 'Annoyed', 'Cry', 'Happy', 'Scared'];

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-challenger-m1-'));
  });

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    realDb = new Database(':memory:');
    lotteryManager = new AvatarLotteryManager(realDb, {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    });
    lotteryManager.init();
    spriteLibrary = new AssetSpriteLibrary({ dataDir: tmpDir });
  });

  afterEach(() => {
    if (realDb && realDb.open) {
      realDb.close();
    }
  });

  function createTestPlugin(dbInstance) {
    const io = { on: jest.fn(), emit: jest.fn() };
    const api = {
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      getSocketIO: jest.fn(() => io),
      getDatabase: jest.fn(() => dbInstance),
      getConfig: jest.fn(() => ({
        enabled: true,
        assetPack: 'boba',
        assetCharacter: 'Fox',
        firstAssignmentEnabled: true,
        avatarLotteryEnabled: true
      })),
      setConfig: jest.fn(),
      getPluginDataDir: jest.fn(() => tmpDir),
      ensurePluginDataDir: jest.fn(async () => {}),
      registerRoute: jest.fn(),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn(),
      pluginLoader: { on: jest.fn(), removeListener: jest.fn() }
    };

    const plugin = new TalkingHeadsPlugin(api);
    plugin.avatarLotteryManager = new AvatarLotteryManager(dbInstance, api.logger);
    plugin.avatarLotteryManager.init();
    plugin.roleManager = { checkEligibility: jest.fn(() => ({ eligible: true })) };
    plugin.cacheManager = {
      getAvatar: jest.fn(() => null),
      getManualSet: jest.fn(() => null),
      registerGeneratedAssets: jest.fn(async () => {}),
      releaseGeneratedAssetOwner: jest.fn(async () => {})
    };
    plugin.animationController = {
      startAnimation: jest.fn(),
      stopAnimation: jest.fn()
    };
    plugin.assetSpriteLibrary = new AssetSpriteLibrary({
      dataDir: tmpDir,
      logger: api.logger
    });

    return { plugin, api, io };
  }

  // =========================================================================
  // SECTION 1: Adversarial Testing of Catalog, Pools, and Selection Exclusivity
  // =========================================================================
  describe('1. Catalog, Selection Pools, and Random Candidate Exclusivity', () => {
    test('getCatalog() returns strictly and exclusively the Boba pack with zero Kenney or RGS', () => {
      const catalog = spriteLibrary.getCatalog();
      expect(catalog).toBeDefined();
      expect(catalog.packs).toHaveLength(1);
      expect(catalog.packs[0].id).toBe('boba');
      expect(catalog.packs[0].name).toBe('Boba Animals');

      // Verify every character listed belongs to Boba Animals
      for (const char of catalog.packs[0].characters) {
        expect(BOBA_ANIMALS).toContain(char);
      }

      // Check for zero remnants of Kenney or RGS
      const packIds = catalog.packs.map(p => p.id);
      expect(packIds).not.toContain('kenney');
      expect(packIds).not.toContain('rgs');
    });

    test('getLotterySelectionPools() contains strictly "boba" key with exactly 90 selections', () => {
      const pools = spriteLibrary.getLotterySelectionPools();
      const keys = Object.keys(pools);
      expect(keys).toEqual(['boba']);

      const bobaPool = pools.boba;
      expect(bobaPool).toHaveLength(90);

      // Verify each item in the pool
      for (const item of bobaPool) {
        expect(item.packId).toBe('boba');
        expect(BOBA_ANIMALS).toContain(item.characterId);
        expect(BOBA_EXPRESSIONS).toContain(item.options.expression);
      }
    });

    test('1,000 random draws (getRandomSelection) yield 100% Boba candidates (0% non-Boba)', () => {
      const totalDraws = 1000;
      const seenCharacters = new Set();
      const seenExpressions = new Set();

      for (let i = 0; i < totalDraws; i++) {
        const selection = spriteLibrary.getRandomSelection();
        expect(selection).toBeDefined();
        expect(selection.packId).toBe('boba');
        expect(BOBA_ANIMALS).toContain(selection.characterId);
        expect(BOBA_EXPRESSIONS).toContain(selection.options.expression);

        seenCharacters.add(selection.characterId);
        seenExpressions.add(selection.options.expression);
      }

      // Over 1,000 draws, should sample across multiple characters and expressions
      expect(seenCharacters.size).toBeGreaterThanOrEqual(10);
      expect(seenExpressions.size).toBe(6);
    });

    test('500 candidate reel generations (getLotteryCandidates(3)) yield 100% Boba candidates (0% non-Boba)', () => {
      const totalReels = 500;
      let totalCandidates = 0;
      let nonBobaCount = 0;

      for (let i = 0; i < totalReels; i++) {
        const reel = spriteLibrary.getLotteryCandidates(3);
        expect(reel).toHaveLength(3);

        // Verify each candidate in the reel
        for (const candidate of reel) {
          totalCandidates++;
          if (candidate.packId !== 'boba' || !BOBA_ANIMALS.includes(candidate.characterId)) {
            nonBobaCount++;
          }
          expect(candidate.packId).toBe('boba');
          expect(BOBA_ANIMALS).toContain(candidate.characterId);
          expect(BOBA_EXPRESSIONS).toContain(candidate.options.expression);
        }

        // Candidates within the same reel must be distinct
        const reelKeys = reel.map(c => JSON.stringify(c));
        expect(new Set(reelKeys).size).toBe(3);
      }

      expect(totalCandidates).toBe(1500);
      expect(nonBobaCount).toBe(0);
    });

    test('adversarial exclusion handling: passing legacy or corrupted exclusions does not pollute draws', () => {
      // Exclude Kenney selection
      const kenneyExcluded = { packId: 'kenney', characterId: 'blueA', options: { eye: 'human' } };
      const draw1 = spriteLibrary.getRandomSelection(Math.random, kenneyExcluded);
      expect(draw1.packId).toBe('boba');
      expect(BOBA_ANIMALS).toContain(draw1.characterId);

      // Exclude RGS selection
      const rgsExcluded = { packId: 'rgs', characterId: 'head2', options: { hair: 'hair1' } };
      const draw2 = spriteLibrary.getRandomSelection(Math.random, rgsExcluded);
      expect(draw2.packId).toBe('boba');
      expect(BOBA_ANIMALS).toContain(draw2.characterId);

      // Exclude corrupted / alien pack
      const alienExcluded = { packId: 'alien_monster', characterId: 'xenomorph', options: {} };
      const draw3 = spriteLibrary.getRandomSelection(Math.random, alienExcluded);
      expect(draw3.packId).toBe('boba');

      // Reel generation with array of adversarial exclusions
      const reel = spriteLibrary.getLotteryCandidates(3, Math.random, [
        kenneyExcluded,
        rgsExcluded,
        alienExcluded,
        null,
        undefined
      ]);
      expect(reel).toHaveLength(3);
      for (const cand of reel) {
        expect(cand.packId).toBe('boba');
        expect(BOBA_ANIMALS).toContain(cand.characterId);
      }
    });

    test('normalizeSelection strictly sanitizes legacy, unknown, and malformed inputs to Boba', () => {
      // Kenney input -> coerced to Boba Fox Default
      const normKenney = spriteLibrary.normalizeSelection({
        packId: 'kenney',
        characterId: 'blueA',
        options: { eye: 'angry_blue' }
      });
      expect(normKenney).toEqual({
        packId: 'boba',
        characterId: 'Fox',
        options: { expression: 'Default' }
      });

      // RGS input -> coerced to Boba Fox Default
      const normRgs = spriteLibrary.normalizeSelection({
        packId: 'rgs',
        characterId: 'head3',
        options: { hair: 'hair2', mouth: 'mouth5' }
      });
      expect(normRgs).toEqual({
        packId: 'boba',
        characterId: 'Fox',
        options: { expression: 'Default' }
      });

      // Valid Boba input with mixed case expression
      const normBobaCase = spriteLibrary.normalizeSelection({
        packId: 'boba',
        characterId: 'Bear',
        options: { expression: 'haPpy' }
      });
      expect(normBobaCase).toEqual({
        packId: 'boba',
        characterId: 'Bear',
        options: { expression: 'Happy' }
      });

      // Missing or undefined inputs
      expect(spriteLibrary.normalizeSelection()).toEqual({
        packId: 'boba',
        characterId: 'Fox',
        options: { expression: 'Default' }
      });
      expect(spriteLibrary.normalizeSelection(undefined)).toEqual({
        packId: 'boba',
        characterId: 'Fox',
        options: { expression: 'Default' }
      });
      expect(spriteLibrary.normalizeSelection(null)).toEqual({
        packId: 'boba',
        characterId: 'Fox',
        options: { expression: 'Default' }
      });
      expect(spriteLibrary.normalizeSelection({})).toEqual({
        packId: 'boba',
        characterId: 'Fox',
        options: { expression: 'Default' }
      });
    });
  });

  // =========================================================================
  // SECTION 2: Real SQLite Database Legacy Migration & Persistence Verification
  // =========================================================================
  describe('2. Real SQLite Legacy Migration and Persistence on Speech Events', () => {
    test('auto-migrates legacy Kenney and RGS records in real SQLite via prepareAvatarAssignment', () => {
      const { plugin } = createTestPlugin(realDb);

      // Seed legacy records directly into SQLite
      const now = Date.now() - 50000;
      realDb.prepare(`
        INSERT INTO talking_heads_avatar_lottery (user_id, username, selection_json, state, created_at, updated_at)
        VALUES (?, ?, ?, 'kept', ?, ?)
      `).run(
        'viewer_kenney_001',
        'KenneyViewer',
        JSON.stringify({ packId: 'kenney', characterId: 'blueB', options: { eye: 'human' } }),
        now,
        now
      );

      realDb.prepare(`
        INSERT INTO talking_heads_avatar_lottery (user_id, username, selection_json, state, created_at, updated_at)
        VALUES (?, ?, ?, 'kept', ?, ?)
      `).run(
        'viewer_rgs_002',
        'RgsViewer',
        JSON.stringify({ packId: 'rgs', characterId: 'head2', options: { hair: 'hair1', mouth: 'mouth3' } }),
        now,
        now
      );

      // Verify baseline legacy rows exist in SQLite
      const preKenney = realDb.prepare('SELECT * FROM talking_heads_avatar_lottery WHERE user_id = ?').get('viewer_kenney_001');
      expect(JSON.parse(preKenney.selection_json).packId).toBe('kenney');

      const preRgs = realDb.prepare('SELECT * FROM talking_heads_avatar_lottery WHERE user_id = ?').get('viewer_rgs_002');
      expect(JSON.parse(preRgs.selection_json).packId).toBe('rgs');

      // 1. Trigger prepareAvatarAssignment for Kenney user
      const resultKenney1 = plugin.prepareAvatarAssignment({
        userId: 'viewer_kenney_001',
        username: 'KenneyViewer',
        hasAssignedVoice: true
      });

      expect(resultKenney1.created).toBe(false);
      expect(resultKenney1.reason).toBe('migrated');
      expect(resultKenney1.selection).toBeDefined();
      expect(resultKenney1.selection.packId).toBe('boba');
      expect(BOBA_ANIMALS).toContain(resultKenney1.selection.characterId);
      expect(BOBA_EXPRESSIONS).toContain(resultKenney1.selection.options.expression);

      // VERIFY DB WRITE IN REAL SQLITE
      const postKenney1 = realDb.prepare('SELECT * FROM talking_heads_avatar_lottery WHERE user_id = ?').get('viewer_kenney_001');
      const dbSelection1 = JSON.parse(postKenney1.selection_json);
      expect(dbSelection1.packId).toBe('boba');
      expect(dbSelection1.characterId).toBe(resultKenney1.selection.characterId);
      expect(postKenney1.updated_at).toBeGreaterThan(now);

      // 2. Subsequent call for the same user must be stable without re-rolling
      const resultKenney2 = plugin.prepareAvatarAssignment({
        userId: 'viewer_kenney_001',
        username: 'KenneyViewer',
        hasAssignedVoice: true
      });

      expect(resultKenney2.created).toBe(false);
      expect(resultKenney2.reason).toBe('existing');
      expect(resultKenney2.selection).toEqual(resultKenney1.selection);

      // Verify DB row remains intact and unchanged
      const postKenney2 = realDb.prepare('SELECT * FROM talking_heads_avatar_lottery WHERE user_id = ?').get('viewer_kenney_001');
      expect(JSON.parse(postKenney2.selection_json)).toEqual(dbSelection1);
      expect(postKenney2.updated_at).toBe(postKenney1.updated_at);

      // 3. Trigger prepareAvatarAssignment for RGS user
      const resultRgs1 = plugin.prepareAvatarAssignment({
        userId: 'viewer_rgs_002',
        username: 'RgsViewer',
        hasAssignedVoice: true
      });

      expect(resultRgs1.created).toBe(false);
      expect(resultRgs1.reason).toBe('migrated');
      expect(resultRgs1.selection.packId).toBe('boba');
      expect(BOBA_ANIMALS).toContain(resultRgs1.selection.characterId);

      // VERIFY DB WRITE IN REAL SQLITE
      const postRgs1 = realDb.prepare('SELECT * FROM talking_heads_avatar_lottery WHERE user_id = ?').get('viewer_rgs_002');
      expect(JSON.parse(postRgs1.selection_json).packId).toBe('boba');
    });

    test('auto-migrates legacy records on speech event (_handleTTSEvent), updates DB, and preserves across subsequent speech', async () => {
      const { plugin } = createTestPlugin(realDb);

      const now = Date.now() - 3600000;
      realDb.prepare(`
        INSERT INTO talking_heads_avatar_lottery (user_id, username, selection_json, state, created_at, updated_at)
        VALUES (?, ?, ?, 'kept', ?, ?)
      `).run(
        'tts_legacy_user',
        'LegacySpeaker',
        JSON.stringify({ packId: 'rgs', characterId: 'head3', options: { hair: 'hair3', mouth: 'mouth8' } }),
        now,
        now
      );

      // First TTS event: triggers migration in SQLite
      await plugin._handleTTSEvent({
        userId: 'tts_legacy_user',
        username: 'LegacySpeaker',
        duration: 2000,
        userData: { hasAssignedVoice: true }
      });

      // 1. Verify DB was overwritten in SQLite
      const rowAfterSpeech1 = realDb.prepare('SELECT * FROM talking_heads_avatar_lottery WHERE user_id = ?').get('tts_legacy_user');
      expect(rowAfterSpeech1).toBeDefined();
      const migratedSelection = JSON.parse(rowAfterSpeech1.selection_json);
      expect(migratedSelection.packId).toBe('boba');
      expect(BOBA_ANIMALS).toContain(migratedSelection.characterId);
      expect(rowAfterSpeech1.updated_at).toBeGreaterThan(now);

      // Verify animation was started with new Boba sprites
      expect(plugin.animationController.startAnimation).toHaveBeenCalledTimes(1);
      const firstCallArgs = plugin.animationController.startAnimation.mock.calls[0];
      expect(firstCallArgs[0]).toBe('tts_legacy_user');
      expect(firstCallArgs[1]).toBe('LegacySpeaker');
      expect(firstCallArgs[2].idle_neutral).toMatch(/asset_boba_/);

      // Second TTS event: should retrieve the existing migrated Boba assignment without re-rolling
      await plugin._handleTTSEvent({
        userId: 'tts_legacy_user',
        username: 'LegacySpeaker',
        duration: 1500,
        userData: { hasAssignedVoice: true }
      });

      expect(plugin.animationController.startAnimation).toHaveBeenCalledTimes(2);
      const secondCallArgs = plugin.animationController.startAnimation.mock.calls[1];
      expect(secondCallArgs[2].idle_neutral).toBe(firstCallArgs[2].idle_neutral);

      // Confirm DB record remains identical to the first migration write
      const rowAfterSpeech2 = realDb.prepare('SELECT * FROM talking_heads_avatar_lottery WHERE user_id = ?').get('tts_legacy_user');
      expect(JSON.parse(rowAfterSpeech2.selection_json)).toEqual(migratedSelection);
      expect(rowAfterSpeech2.updated_at).toBe(rowAfterSpeech1.updated_at);
    });

    test('existing Boba user is NOT migrated or modified upon speech events', async () => {
      const { plugin } = createTestPlugin(realDb);

      const bobaSelection = { packId: 'boba', characterId: 'Otter', options: { expression: 'Happy' } };
      const createdAt = 1600000000000;
      const updatedAt = 1600000000000;

      realDb.prepare(`
        INSERT INTO talking_heads_avatar_lottery (user_id, username, selection_json, state, created_at, updated_at)
        VALUES (?, ?, ?, 'kept', ?, ?)
      `).run(
        'boba_veteran',
        'BobaVeteran',
        JSON.stringify(bobaSelection),
        createdAt,
        updatedAt
      );

      // 1. prepareAvatarAssignment
      const prep = plugin.prepareAvatarAssignment({
        userId: 'boba_veteran',
        username: 'BobaVeteran',
        hasAssignedVoice: true
      });
      expect(prep.reason).toBe('existing');
      expect(prep.selection).toEqual(bobaSelection);

      // 2. _handleTTSEvent
      await plugin._handleTTSEvent({
        userId: 'boba_veteran',
        username: 'BobaVeteran',
        duration: 1000,
        userData: { hasAssignedVoice: true }
      });

      // Verify row was NOT mutated in SQLite
      const row = realDb.prepare('SELECT * FROM talking_heads_avatar_lottery WHERE user_id = ?').get('boba_veteran');
      expect(JSON.parse(row.selection_json)).toEqual(bobaSelection);
      expect(row.updated_at).toBe(updatedAt);
    });

    test('high-throughput stress test: 50 rapid sequential speech events across 20 legacy users maintain transactional SQLite integrity', async () => {
      const { plugin } = createTestPlugin(realDb);

      // Seed 20 legacy users
      for (let i = 1; i <= 20; i++) {
        const pack = i % 2 === 0 ? 'kenney' : 'rgs';
        const char = pack === 'kenney' ? 'blueA' : 'head1';
        realDb.prepare(`
          INSERT INTO talking_heads_avatar_lottery (user_id, username, selection_json, state, created_at, updated_at)
          VALUES (?, ?, ?, 'kept', 1000, 1000)
        `).run(`legacy_bulk_${i}`, `BulkUser_${i}`, JSON.stringify({ packId: pack, characterId: char, options: {} }));
      }

      // Execute 50 rapid speech events interleaving users
      for (let eventIndex = 0; eventIndex < 50; eventIndex++) {
        const userId = `legacy_bulk_${(eventIndex % 20) + 1}`;
        await plugin._handleTTSEvent({
          userId,
          username: `BulkUser_${(eventIndex % 20) + 1}`,
          duration: 500,
          userData: { hasAssignedVoice: true }
        });
      }

      // Verify all 20 users are now in 'boba' pack with valid Boba characters
      const allRows = realDb.prepare('SELECT * FROM talking_heads_avatar_lottery').all();
      expect(allRows).toHaveLength(20);

      for (const row of allRows) {
        const sel = JSON.parse(row.selection_json);
        expect(sel.packId).toBe('boba');
        expect(BOBA_ANIMALS).toContain(sel.characterId);
        expect(BOBA_EXPRESSIONS).toContain(sel.options.expression);
        expect(row.updated_at).toBeGreaterThan(1000);
      }
    });

    test('_emitAvatarSpin emits candidate reels containing strictly 100% Boba animals with 0% non-Boba', async () => {
      const { plugin, io } = createTestPlugin(realDb);

      const winnerSelection = { packId: 'boba', characterId: 'Bear', options: { expression: 'Happy' } };
      const payload = await plugin._emitAvatarSpin({
        userId: 'spin_user',
        username: 'SpinUser',
        playbackId: 'pb_123',
        winnerSelection,
        reason: 'initial-assignment'
      });

      expect(payload).toBeDefined();
      expect(io.emit).toHaveBeenCalledWith('talkingheads:avatar:spin:start', expect.any(Object));

      // Assert winner is Boba
      expect(payload.winner.selection.packId).toBe('boba');
      expect(payload.winner.selection.characterId).toBe('Bear');
      expect(payload.winner.sprites.idle_neutral).toMatch(/\/api\/talkingheads\/sprite\/asset_boba_/);

      // Assert every reel candidate is strictly Boba
      expect(payload.candidates).toHaveLength(3);
      for (const candidate of payload.candidates) {
        expect(candidate.selection.packId).toBe('boba');
        expect(BOBA_ANIMALS).toContain(candidate.selection.characterId);
        expect(candidate.spriteUrl).toMatch(/\/api\/talkingheads\/sprite\/asset_boba_/);
      }
    });

    test('preserves original created_at timestamp during legacy migration while updating updated_at', () => {
      const { plugin } = createTestPlugin(realDb);

      const originalCreatedAt = 1500000000000;
      realDb.prepare(`
        INSERT INTO talking_heads_avatar_lottery (user_id, username, selection_json, state, created_at, updated_at)
        VALUES (?, ?, ?, 'kept', ?, ?)
      `).run(
        'timestamp_test_user',
        'TimestampViewer',
        JSON.stringify({ packId: 'kenney', characterId: 'darkB', options: {} }),
        originalCreatedAt,
        originalCreatedAt
      );

      const result = plugin.prepareAvatarAssignment({
        userId: 'timestamp_test_user',
        username: 'TimestampViewer',
        hasAssignedVoice: false // even without hasAssignedVoice, legacy migration must trigger
      });

      expect(result.reason).toBe('migrated');
      expect(result.selection.packId).toBe('boba');

      const row = realDb.prepare('SELECT * FROM talking_heads_avatar_lottery WHERE user_id = ?').get('timestamp_test_user');
      expect(row.created_at).toBe(originalCreatedAt);
      expect(row.updated_at).toBeGreaterThan(originalCreatedAt);
      expect(row.username).toBe('TimestampViewer');
      expect(row.state).toBe('kept');
    });
  });

  // =========================================================================
  // SECTION 3: Boba Mouth Aperture Differentiability Across All 16 Animals
  // =========================================================================
  describe('3. Boba Mouth Aperture Differentiability (speak_open != speak_mid != speak_closed)', () => {
    const ANIMALS_TO_VERIFY = [
      'Axolotl', 'Bear', 'Bunny', 'Dog', 'Fox', 'Frog', 'Giraffe', 'Goat',
      'Monkey', 'Octopus', 'Otter', 'Pinguin', 'Raccoon', 'Seal', 'Snake', 'Spider'
    ];

    test('all 16 Boba Animals produce 3 strictly distinct SVGs for closed, mid, and open apertures', async () => {
      for (const characterId of ANIMALS_TO_VERIFY) {
        const result = await spriteLibrary.getSpriteSet({
          packId: 'boba',
          characterId,
          options: { expression: 'Default' }
        });

        expect(result.sprites.speak_closed).toBeDefined();
        expect(result.sprites.speak_mid).toBeDefined();
        expect(result.sprites.speak_open).toBeDefined();

        const closedPath = path.join(tmpDir, 'avatars', path.basename(result.sprites.speak_closed));
        const midPath = path.join(tmpDir, 'avatars', path.basename(result.sprites.speak_mid));
        const openPath = path.join(tmpDir, 'avatars', path.basename(result.sprites.speak_open));

        expect(fs.existsSync(closedPath)).toBe(true);
        expect(fs.existsSync(midPath)).toBe(true);
        expect(fs.existsSync(openPath)).toBe(true);

        const closedSvg = fs.readFileSync(closedPath, 'utf8');
        const midSvg = fs.readFileSync(midPath, 'utf8');
        const openSvg = fs.readFileSync(openPath, 'utf8');

        // Verify valid SVG structures
        expect(closedSvg).toMatch(/<svg/);
        expect(midSvg).toMatch(/<svg/);
        expect(openSvg).toMatch(/<svg/);

        // Strict differentiability assertion
        expect(closedSvg).not.toEqual(midSvg);
        expect(midSvg).not.toEqual(openSvg);
        expect(closedSvg).not.toEqual(openSvg);
      }
    }, 60000);
  });
});
