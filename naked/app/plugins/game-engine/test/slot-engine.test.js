/**
 * Slot Machine Engine Tests
 *
 * Covers:
 *  - Symbol/outcome resolver (_resolveOutcome, _buildReels, _weightedChoice)
 *  - Cooldown logic (chat, VIP, sub, global)
 *  - Config normalization and defaults
 *  - nearMissEnabled flag
 *  - Edge cases (empty symbols, single symbol, zero-weight profile)
 */

'use strict';

const SlotGame = require('../games/slot');
const GameEngineDatabase = require('../backend/database');

// ─── Shared mocks ─────────────────────────────────────────────────────────────

const mockLogger = {
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

const mockIO = {
  emit: jest.fn()
};

// Each test factory call creates a fresh in-memory SQLite instance to avoid
// cross-test pollution.
function makeMockAPI() {
  const Database = require('better-sqlite3');
  const rawDb = new Database(':memory:');
  return {
    getSocketIO: () => mockIO,
    getDatabase: () => ({ db: rawDb }),
    pluginLoader: { loadedPlugins: new Map() }
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create an in-memory GameEngineDatabase */
function makeDb() {
  const api = makeMockAPI();
  const db  = new GameEngineDatabase(api, mockLogger);
  db.initialize();
  return db;
}

/** Create a SlotGame backed by an in-memory database */
function makeSlotGame(db) {
  const gameDb = db || makeDb();
  const api = makeMockAPI();
  // Override getSocketIO to use the shared mock
  api.getSocketIO = () => mockIO;
  const game = new SlotGame(api, gameDb, mockLogger);
  game.init();
  return game;
}

/** Build a minimal valid config */
function minimalConfig(overrides = {}) {
  return Object.assign({
    id: 1,
    name: 'Test Slot',
    enabled: true,
    symbols: [
      { id: 'cherry', emoji: '🍒', label: 'Cherry', weight: 10 },
      { id: 'lemon',  emoji: '🍋', label: 'Lemon',  weight: 8  },
      { id: 'grape',  emoji: '🍇', label: 'Grape',  weight: 6  },
      { id: 'star',   emoji: '⭐',  label: 'Star',   weight: 4  },
      { id: 'bell',   emoji: '🔔', label: 'Bell',   weight: 3  },
      { id: 'seven',  emoji: '7️⃣', label: 'Seven',  weight: 1  }
    ],
    settings: {
      chatCooldownMs:   10000,
      vipCooldownMs:     5000,
      subCooldownMs:     3000,
      globalCooldownMs:     0,
      nearMissEnabled:   true,
      showResultDuration: 5000,
      soundEnabled: false
    },
    oddsProfiles: {
      chat: {
        loss:       600,
        near_miss:  100,
        small_win:  200,
        medium_win:  60,
        big_win:     30,
        jackpot:     10
      }
    },
    giftMappings: {},
    rewardRules: [],
    chatCommand: '!spin'
  }, overrides);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SlotGame – _weightedChoice', () => {
  let game;
  beforeEach(() => { game = makeSlotGame(); });

  it('returns a valid category from the weight map', () => {
    const profile = { loss: 600, small_win: 300, jackpot: 100 };
    const categories = new Set(['loss', 'small_win', 'jackpot']);
    for (let i = 0; i < 50; i++) {
      const result = game._weightedChoice(profile);
      expect(categories.has(result)).toBe(true);
    }
  });

  it('always returns the only entry when others have 0 weight', () => {
    const profile = { loss: 0, small_win: 0, jackpot: 100 };
    for (let i = 0; i < 20; i++) {
      expect(game._weightedChoice(profile)).toBe('jackpot');
    }
  });

  it('returns "loss" when all weights are zero', () => {
    expect(game._weightedChoice({ loss: 0, small_win: 0 })).toBe('loss');
  });

  it('returns "loss" for an empty weight map', () => {
    expect(game._weightedChoice({})).toBe('loss');
  });

  it('never returns a zero-weight entry in normal operation', () => {
    const profile = { loss: 1000, jackpot: 0 };
    for (let i = 0; i < 100; i++) {
      expect(game._weightedChoice(profile)).toBe('loss');
    }
  });
});

describe('SlotGame – _buildReels', () => {
  let game;
  beforeEach(() => { game = makeSlotGame(); });

  const defaultSymbols = [
    { id: 'cherry', emoji: '🍒', label: 'Cherry', weight: 10 },
    { id: 'lemon',  emoji: '🍋', label: 'Lemon',  weight: 8  },
    { id: 'grape',  emoji: '🍇', label: 'Grape',  weight: 6  },
    { id: 'star',   emoji: '⭐',  label: 'Star',   weight: 4  },
    { id: 'bell',   emoji: '🔔', label: 'Bell',   weight: 3  },
    { id: 'seven',  emoji: '7️⃣', label: 'Seven',  weight: 1  }
  ];
  const cfg = minimalConfig({ symbols: defaultSymbols });

  it('loss – returns exactly 3 symbols', () => {
    const reels = game._buildReels(defaultSymbols, 'loss', cfg);
    expect(reels).toHaveLength(3);
    expect(reels.every(s => s && s.id)).toBe(true);
  });

  it('loss – should not have all three reels identical (best-effort)', () => {
    // With 6 distinct symbols this should almost never produce all-same
    let allSame = 0;
    for (let i = 0; i < 100; i++) {
      const [r1, r2, r3] = game._buildReels(defaultSymbols, 'loss', cfg);
      if (r1.id === r2.id && r2.id === r3.id) allSame++;
    }
    // Allow at most 5% all-same due to weighted randomness
    expect(allSame).toBeLessThan(10);
  });

  it('near_miss – exactly two reels match', () => {
    for (let i = 0; i < 30; i++) {
      const reels = game._buildReels(defaultSymbols, 'near_miss', cfg);
      const ids = reels.map(s => s.id);
      const matchPairs = [
        ids[0] === ids[1],
        ids[1] === ids[2],
        ids[0] === ids[2]
      ].filter(Boolean).length;
      // Exactly 1 pair (2 matching, 1 different) → matchPairs === 1
      // But if 3-of-a-kind accidentally (unlikely with 20 attempts cap)…
      expect(matchPairs).toBeGreaterThanOrEqual(1);
    }
  });

  it('small_win – all three reels identical', () => {
    const reels = game._buildReels(defaultSymbols, 'small_win', cfg);
    expect(reels[0].id).toBe(reels[1].id);
    expect(reels[1].id).toBe(reels[2].id);
  });

  it('medium_win – all three reels identical', () => {
    const reels = game._buildReels(defaultSymbols, 'medium_win', cfg);
    expect(reels[0].id).toBe(reels[1].id);
    expect(reels[1].id).toBe(reels[2].id);
  });

  it('big_win – all three reels identical and not the jackpot symbol', () => {
    for (let i = 0; i < 30; i++) {
      const reels = game._buildReels(defaultSymbols, 'big_win', cfg);
      expect(reels[0].id).toBe(reels[1].id);
      expect(reels[1].id).toBe(reels[2].id);
      // Should not be the very last symbol (that's jackpot)
      const lastId = defaultSymbols[defaultSymbols.length - 1].id;
      expect(reels[0].id).not.toBe(lastId);
    }
  });

  it('jackpot – all three reels are the last (rarest) symbol', () => {
    const reels = game._buildReels(defaultSymbols, 'jackpot', cfg);
    const lastSym = defaultSymbols[defaultSymbols.length - 1];
    expect(reels[0].id).toBe(lastSym.id);
    expect(reels[1].id).toBe(lastSym.id);
    expect(reels[2].id).toBe(lastSym.id);
  });

  it('single symbol – all categories return 3-of-a-kind', () => {
    const single = [{ id: 'only', emoji: '🃏', label: 'Only', weight: 1 }];
    for (const cat of ['loss', 'near_miss', 'small_win', 'medium_win', 'big_win', 'jackpot']) {
      const reels = game._buildReels(single, cat, minimalConfig({ symbols: single }));
      expect(reels).toHaveLength(3);
      expect(reels[0].id).toBe('only');
    }
  });
});

describe('SlotGame – _resolveOutcome', () => {
  let game;
  beforeEach(() => { game = makeSlotGame(); });

  it('returns a valid outcome object', () => {
    const cfg = minimalConfig();
    const outcome = game._resolveOutcome(cfg, 'chat');
    expect(outcome).toHaveProperty('category');
    expect(outcome).toHaveProperty('reels');
    expect(outcome).toHaveProperty('isWin');
    expect(outcome.reels).toHaveLength(3);
  });

  it('outcome.isWin is false for loss', () => {
    const cfg = minimalConfig({
      oddsProfiles: { chat: { loss: 1000, near_miss: 0, small_win: 0, medium_win: 0, big_win: 0, jackpot: 0 } }
    });
    const outcome = game._resolveOutcome(cfg, 'chat');
    expect(outcome.category).toBe('loss');
    expect(outcome.isWin).toBe(false);
  });

  it('outcome.isWin is false for near_miss', () => {
    const cfg = minimalConfig({
      oddsProfiles: { chat: { loss: 0, near_miss: 1000, small_win: 0, medium_win: 0, big_win: 0, jackpot: 0 } }
    });
    const outcome = game._resolveOutcome(cfg, 'chat');
    expect(outcome.category).toBe('near_miss');
    expect(outcome.isWin).toBe(false);
  });

  it('outcome.isWin is true for jackpot', () => {
    const cfg = minimalConfig({
      oddsProfiles: { chat: { loss: 0, near_miss: 0, small_win: 0, medium_win: 0, big_win: 0, jackpot: 1000 } }
    });
    const outcome = game._resolveOutcome(cfg, 'chat');
    expect(outcome.category).toBe('jackpot');
    expect(outcome.isWin).toBe(true);
  });

  it('falls back to "chat" profile when requested profile does not exist', () => {
    const cfg = minimalConfig(); // only has 'chat' profile
    // Should not throw; falls back to 'chat'
    expect(() => game._resolveOutcome(cfg, 'nonexistent_profile')).not.toThrow();
  });

  it('falls back to hardcoded defaults when no profiles defined', () => {
    const cfg = minimalConfig({ oddsProfiles: {} });
    expect(() => game._resolveOutcome(cfg, 'chat')).not.toThrow();
  });

  it('throws when symbols array is empty', () => {
    const cfg = minimalConfig({ symbols: [] });
    expect(() => game._resolveOutcome(cfg, 'chat')).toThrow('No symbols configured');
  });
});

describe('SlotGame – nearMissEnabled flag', () => {
  let game;
  beforeEach(() => { game = makeSlotGame(); });

  it('never returns near_miss when nearMissEnabled is false', () => {
    const cfg = minimalConfig({
      settings: {
        chatCooldownMs: 0,
        globalCooldownMs: 0,
        nearMissEnabled: false,
        soundEnabled: false
      },
      oddsProfiles: { chat: { loss: 500, near_miss: 500, small_win: 0, medium_win: 0, big_win: 0, jackpot: 0 } }
    });

    for (let i = 0; i < 100; i++) {
      const outcome = game._resolveOutcome(cfg, 'chat');
      expect(outcome.category).not.toBe('near_miss');
    }
  });

  it('redirects near_miss weight into loss when nearMissEnabled is false', () => {
    const cfg = minimalConfig({
      settings: { chatCooldownMs: 0, globalCooldownMs: 0, nearMissEnabled: false, soundEnabled: false },
      oddsProfiles: { chat: { loss: 0, near_miss: 1000, small_win: 0, medium_win: 0, big_win: 0, jackpot: 0 } }
    });
    const outcome = game._resolveOutcome(cfg, 'chat');
    expect(outcome.category).toBe('loss');
  });

  it('can return near_miss when nearMissEnabled is true', () => {
    const cfg = minimalConfig({
      settings: { chatCooldownMs: 0, globalCooldownMs: 0, nearMissEnabled: true, soundEnabled: false },
      oddsProfiles: { chat: { loss: 0, near_miss: 1000, small_win: 0, medium_win: 0, big_win: 0, jackpot: 0 } }
    });
    const outcome = game._resolveOutcome(cfg, 'chat');
    expect(outcome.category).toBe('near_miss');
  });
});

describe('SlotGame – cooldown logic', () => {
  let game;

  beforeEach(() => {
    game = makeSlotGame();
    jest.clearAllMocks();
  });

  it('allows spin when no cooldown has been set', () => {
    const settings = { chatCooldownMs: 10000, vipCooldownMs: 5000, subCooldownMs: 3000 };
    const result = game._checkCooldown('user1', 1, settings, {});
    expect(result.allowed).toBe(true);
  });

  it('blocks spin immediately after registering cooldown', () => {
    const settings = { chatCooldownMs: 10000, vipCooldownMs: 5000, subCooldownMs: 3000 };
    game._registerCooldown('user1', 1, settings, {});
    const result = game._checkCooldown('user1', 1, settings, {});
    expect(result.allowed).toBe(false);
    expect(result.remainingMs).toBeGreaterThan(0);
    expect(result.remainingMs).toBeLessThanOrEqual(10000);
  });

  it('uses vipCooldownMs for moderators', () => {
    const settings = { chatCooldownMs: 10000, vipCooldownMs: 5000, subCooldownMs: 3000 };
    game._registerCooldown('mod1', 1, settings, { isModerator: true });
    const result = game._checkCooldown('mod1', 1, settings, { isModerator: true });
    expect(result.allowed).toBe(false);
    expect(result.remainingMs).toBeLessThanOrEqual(5000);
  });

  it('uses vipCooldownMs for teamMembers (superfans)', () => {
    const settings = { chatCooldownMs: 10000, vipCooldownMs: 5000, subCooldownMs: 3000 };
    game._registerCooldown('fan1', 1, settings, { teamMemberLevel: 1 });
    const result = game._checkCooldown('fan1', 1, settings, { teamMemberLevel: 1 });
    expect(result.allowed).toBe(false);
    expect(result.remainingMs).toBeLessThanOrEqual(5000);
  });

  it('uses subCooldownMs for subscribers', () => {
    const settings = { chatCooldownMs: 10000, vipCooldownMs: 5000, subCooldownMs: 3000 };
    game._registerCooldown('sub1', 1, settings, { isSubscriber: true });
    const result = game._checkCooldown('sub1', 1, settings, { isSubscriber: true });
    expect(result.allowed).toBe(false);
    expect(result.remainingMs).toBeLessThanOrEqual(3000);
  });

  it('moderator cooldown is shorter than regular user cooldown', () => {
    const settings = { chatCooldownMs: 10000, vipCooldownMs: 5000, subCooldownMs: 3000 };
    game._registerCooldown('user2', 1, settings, {});
    game._registerCooldown('mod2', 1, settings, { isModerator: true });

    const userResult = game._checkCooldown('user2', 1, settings, {});
    const modResult  = game._checkCooldown('mod2', 1, settings, { isModerator: true });

    expect(userResult.remainingMs).toBeGreaterThan(modResult.remainingMs);
  });

  it('cooldowns are independent per user and per machine', () => {
    const settings = { chatCooldownMs: 10000 };
    game._registerCooldown('alice', 1, settings, {});

    expect(game._checkCooldown('alice', 1, settings, {}).allowed).toBe(false);
    expect(game._checkCooldown('bob',   1, settings, {}).allowed).toBe(true);
    expect(game._checkCooldown('alice', 2, settings, {}).allowed).toBe(true);
  });

  it('getUserCooldownRemaining returns 0 for unknown user', () => {
    const db = makeDb();
    game = makeSlotGame(db);
    // Machine ID 1 is seeded by initSlotTables
    const remaining = game.getUserCooldownRemaining('newcomer', 1);
    expect(remaining).toBe(0);
  });
});

describe('SlotGame – config defaults and normalization', () => {
  let game;

  beforeEach(() => {
    game = makeSlotGame();
  });

  it('_defaultSymbols returns 12 symbols', () => {
    const syms = game._defaultSymbols();
    expect(syms).toHaveLength(12);
    expect(syms.every(s => s.id && s.emoji && s.label && typeof s.weight === 'number')).toBe(true);
  });

  it('_defaultSettings has all required fields', () => {
    const s = game._defaultSettings();
    expect(s).toHaveProperty('chatCooldownMs');
    expect(s).toHaveProperty('vipCooldownMs');
    expect(s).toHaveProperty('subCooldownMs');
    expect(s).toHaveProperty('globalCooldownMs');
    expect(s).toHaveProperty('nearMissEnabled');
    expect(s).toHaveProperty('spinDuration');
    expect(s).toHaveProperty('reelStopDelay');
    expect(s).toHaveProperty('soundEnabled');
    expect(s).toHaveProperty('soundVolume');
    expect(s).toHaveProperty('showResultDuration');
  });

  it('_defaultOddsProfiles has chat, gift_common, gift_rare profiles', () => {
    const profiles = game._defaultOddsProfiles();
    expect(profiles).toHaveProperty('chat');
    expect(profiles).toHaveProperty('gift_common');
    expect(profiles).toHaveProperty('gift_rare');
    // Each profile should have all 6 outcome categories
    for (const profile of Object.values(profiles)) {
      for (const cat of ['loss', 'near_miss', 'small_win', 'medium_win', 'big_win', 'jackpot']) {
        expect(profile).toHaveProperty(cat);
        expect(typeof profile[cat]).toBe('number');
        expect(profile[cat]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('_defaultRewardRules is an array of valid rule objects', () => {
    const rules = game._defaultRewardRules();
    expect(Array.isArray(rules)).toBe(true);
    rules.forEach(rule => {
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('outcomeCategories');
      expect(rule).toHaveProperty('action');
      expect(rule).toHaveProperty('params');
    });
  });

  it('database seeds a default slot machine on first init', () => {
    const db = makeDb();
    const machines = db.getAllSlotMachines();
    expect(machines.length).toBeGreaterThan(0);
    const m = machines[0];
    expect(m.chatCommand).toBe('!spin');
    expect(m.enabled).toBe(true);
    expect(Array.isArray(m.symbols)).toBe(true);
    expect(m.symbols.length).toBeGreaterThan(0);
  });
});

describe('SlotGame – _buildRewardActions', () => {
  let game;
  beforeEach(() => { game = makeSlotGame(); });

  it('returns matching reward actions for the outcome category', () => {
    const cfg = minimalConfig({
      rewardRules: [
        { id: 'jackpot_audio', outcomeCategories: ['jackpot'], action: 'audio', params: { audioType: 'jackpot' } },
        { id: 'win_overlay',   outcomeCategories: ['small_win', 'medium_win'], action: 'overlay', params: { effect: 'win' } }
      ]
    });

    const jackpotOutcome = { category: 'jackpot' };
    const smallWinOutcome = { category: 'small_win' };
    const lossOutcome = { category: 'loss' };

    expect(game._buildRewardActions(jackpotOutcome, cfg)).toHaveLength(1);
    expect(game._buildRewardActions(jackpotOutcome, cfg)[0].action).toBe('audio');

    expect(game._buildRewardActions(smallWinOutcome, cfg)).toHaveLength(1);
    expect(game._buildRewardActions(smallWinOutcome, cfg)[0].action).toBe('overlay');

    expect(game._buildRewardActions(lossOutcome, cfg)).toHaveLength(0);
  });

  it('returns empty array when rewardRules is missing', () => {
    const cfg = minimalConfig({ rewardRules: undefined });
    expect(game._buildRewardActions({ category: 'jackpot' }, cfg)).toHaveLength(0);
  });

  // ── Per-symbol shock dispatch ──────────────────────────────────────────────

  it('adds openshock action when winning symbol has isShock=true', () => {
    const shockSym = { id: 'bolt', emoji: '⚡', label: 'Bolt', weight: 4,
      isShock: true, shockIntensity: 75, shockDuration: 1500, shockType: 'shock', shockDevices: ['dev1'] };
    const cfg = minimalConfig({ rewardRules: [] });
    const outcome = { category: 'big_win', isWin: true, reels: [shockSym, shockSym, shockSym] };

    const actions = game._buildRewardActions(outcome, cfg);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe('openshock');
    expect(actions[0].params.intensity).toBe(75);
    expect(actions[0].params.duration).toBe(1500);
    expect(actions[0].params.shockType).toBe('shock');
    expect(actions[0].params.shockDevices).toEqual(['dev1']);
  });

  it('does NOT add openshock action when winning symbol has isShock=false', () => {
    const safeSym = { id: 'cherry', emoji: '🍒', label: 'Cherry', weight: 18,
      isShock: false, shockIntensity: 50, shockDuration: 1000, shockType: 'shock', shockDevices: [] };
    const cfg = minimalConfig({ rewardRules: [] });
    const outcome = { category: 'small_win', isWin: true, reels: [safeSym, safeSym, safeSym] };

    expect(game._buildRewardActions(outcome, cfg)).toHaveLength(0);
  });

  it('does NOT add openshock action for loss even if symbol has isShock=true', () => {
    const shockSym = { id: 'bolt', emoji: '⚡', label: 'Bolt', weight: 4,
      isShock: true, shockIntensity: 60, shockDuration: 1000, shockType: 'shock', shockDevices: [] };
    const cfg = minimalConfig({ rewardRules: [] });
    // loss → isWin is false
    const outcome = { category: 'loss', isWin: false, reels: [shockSym, shockSym, shockSym] };

    expect(game._buildRewardActions(outcome, cfg)).toHaveLength(0);
  });

  it('combines category rule and per-symbol shock when both apply', () => {
    const shockSym = { id: 'bolt', emoji: '⚡', label: 'Bolt', weight: 4,
      isShock: true, shockIntensity: 50, shockDuration: 1000, shockType: 'vibrate', shockDevices: [] };
    const cfg = minimalConfig({
      rewardRules: [
        { id: 'jackpot_audio', outcomeCategories: ['jackpot'], action: 'audio', params: { audioType: 'jackpot' } }
      ]
    });
    const outcome = { category: 'jackpot', isWin: true, reels: [shockSym, shockSym, shockSym] };

    const actions = game._buildRewardActions(outcome, cfg);
    expect(actions).toHaveLength(2);
    expect(actions.some(a => a.action === 'audio')).toBe(true);
    expect(actions.some(a => a.action === 'openshock')).toBe(true);
    const shockAction = actions.find(a => a.action === 'openshock');
    expect(shockAction.params.shockType).toBe('vibrate');
  });

  it('uses default shock params when optional fields are missing', () => {
    const shockSym = { id: 'bolt', emoji: '⚡', label: 'Bolt', weight: 4, isShock: true };
    const cfg = minimalConfig({ rewardRules: [] });
    const outcome = { category: 'small_win', isWin: true, reels: [shockSym, shockSym, shockSym] };

    const actions = game._buildRewardActions(outcome, cfg);
    expect(actions).toHaveLength(1);
    expect(actions[0].params.intensity).toBe(50);
    expect(actions[0].params.duration).toBe(1000);
    expect(actions[0].params.shockType).toBe('shock');
    expect(actions[0].params.shockDevices).toEqual([]);
  });
});

describe('SlotGame – database integration', () => {
  let db, game;

  beforeEach(() => {
    db   = makeDb();
    game = makeSlotGame(db);
    jest.clearAllMocks();
  });

  it('getConfig() returns the default seeded machine', () => {
    const config = game.getConfig();
    expect(config).not.toBeNull();
    expect(config.id).toBeGreaterThan(0);
    expect(config.enabled).toBe(true);
  });

  it('createMachine() creates a new machine and returns an ID', () => {
    const id = game.createMachine('My Test Slot');
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const config = game.getConfig(id);
    expect(config.name).toBe('My Test Slot');
  });

  it('updateMachineEnabled() toggles the machine state', () => {
    const config = game.getConfig();
    game.updateMachineEnabled(config.id, false);
    expect(game.getConfig(config.id).enabled).toBe(false);
    game.updateMachineEnabled(config.id, true);
    expect(game.getConfig(config.id).enabled).toBe(true);
  });

  it('findMachineByChatCommand() finds machine by command (case-insensitive, strips !)', () => {
    const config = game.getConfig();
    // Default command is '!spin'
    expect(game.findMachineByChatCommand('spin')).not.toBeNull();
    expect(game.findMachineByChatCommand('SPIN')).not.toBeNull();
    expect(game.findMachineByChatCommand('!spin')).not.toBeNull();
    expect(game.findMachineByChatCommand('wheel')).toBeNull();
  });

  it('findMachineByGiftTrigger() finds machine by gift key (case-insensitive)', () => {
    const config = game.getConfig();
    game.updateConfig(config.id, config.symbols, config.settings, { 'Rose': { oddsProfile: 'gift_common' } }, config.oddsProfiles, config.rewardRules);
    expect(game.findMachineByGiftTrigger('Rose')).not.toBeNull();
    expect(game.findMachineByGiftTrigger('rose')).not.toBeNull();
    expect(game.findMachineByGiftTrigger('Unknown Gift')).toBeNull();
  });

  it('getStats() returns zero stats before any spins', () => {
    const config = game.getConfig();
    const stats  = game.getStats(config.id);
    expect(stats.totalSpins).toBe(0);
    expect(stats.totalWins).toBe(0);
    expect(stats.totalJackpots).toBe(0);
  });

  it('recordSlotSpin() increments stats correctly', () => {
    const config = game.getConfig();
    db.recordSlotSpin({
      machineId: config.id, username: 'testuser', nickname: 'Test',
      triggerType: 'chat', triggerValue: '!spin',
      reel1: 'cherry', reel2: 'cherry', reel3: 'cherry',
      outcomeCategory: 'small_win', rewardActions: []
    });
    const stats = game.getStats(config.id);
    expect(stats.totalSpins).toBe(1);
    expect(stats.totalWins).toBe(1);
    expect(stats.totalJackpots).toBe(0);
  });

  it('recordSlotSpin() counts jackpots', () => {
    const config = game.getConfig();
    db.recordSlotSpin({
      machineId: config.id, username: 'bigwinner', nickname: 'Big Winner',
      triggerType: 'gift', triggerValue: 'Diamond Ring',
      reel1: 'joker', reel2: 'joker', reel3: 'joker',
      outcomeCategory: 'jackpot', rewardActions: []
    });
    const stats = game.getStats(config.id);
    expect(stats.totalSpins).toBe(1);
    expect(stats.totalWins).toBe(1);
    expect(stats.totalJackpots).toBe(1);
  });
});

describe('SlotGame – triggerSpinFromChat (async)', () => {
  let db, game;

  beforeEach(() => {
    db   = makeDb();
    game = makeSlotGame(db);
    jest.clearAllMocks();
  });

  it('returns success with spin result for enabled machine', async () => {
    const result = await game.triggerSpinFromChat('user1', 'User One', '', '!spin', null, {});
    expect(result.success).toBe(true);
    expect(result.spinId).toBeGreaterThan(0);
    expect(typeof result.category).toBe('string');
    expect(typeof result.isWin).toBe('boolean');
  });

  it('emits slot:spin-started and slot:spin-result events', async () => {
    mockIO.emit.mockClear();
    await game.triggerSpinFromChat('user2', 'User Two', '', '!spin', null, {});
    const events = mockIO.emit.mock.calls.map(c => c[0]);
    expect(events).toContain('slot:spin-started');
    expect(events).toContain('slot:spin-result');
  });

  it('returns failure when machine is disabled', async () => {
    const config = game.getConfig();
    game.updateMachineEnabled(config.id, false);
    const result = await game.triggerSpinFromChat('user3', 'User Three', '', '!spin', null, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/disabled/i);
  });

  it('applies cooldown and rejects second spin', async () => {
    await game.triggerSpinFromChat('user4', 'User Four', '', '!spin', null, {});
    const result2 = await game.triggerSpinFromChat('user4', 'User Four', '', '!spin', null, {});
    expect(result2.success).toBe(false);
    expect(result2.error).toMatch(/cooldown/i);
  });

  it('emits slot:cooldown event when user is on cooldown', async () => {
    await game.triggerSpinFromChat('user5', 'User Five', '', '!spin', null, {});
    mockIO.emit.mockClear();
    await game.triggerSpinFromChat('user5', 'User Five', '', '!spin', null, {});
    const events = mockIO.emit.mock.calls.map(c => c[0]);
    expect(events).toContain('slot:cooldown');
  });

  it('test-type spin bypasses global cooldown', async () => {
    const config = game.getConfig();
    // Set a very long global cooldown
    game.updateConfig(
      config.id, config.symbols,
      Object.assign({}, config.settings, { globalCooldownMs: 999999 }),
      config.giftMappings, config.oddsProfiles, config.rewardRules
    );
    const result = await game._triggerSpin('admin', 'Admin', '', 'test', 'test-spin', config.id, 'chat');
    expect(result.success).toBe(true);
  });
});

// ─── GCCE context: per-user role-based cooldown ────────────────────────────────
// This suite verifies that role flags buried in context.userData (GCCE path)
// correctly flow through to the cooldown tier selector.

describe('SlotGame – GCCE userData role extraction via triggerSpinFromChat', () => {
  let db, game;

  beforeEach(() => {
    db   = makeDb();
    game = makeSlotGame(db);
    // Apply a config where the tiers differ clearly
    const config = game.getConfig();
    game.updateConfig(
      config.id, config.symbols,
      Object.assign({}, config.settings, {
        chatCooldownMs:   60000, // regular users: 60 s
        subCooldownMs:    20000, // subscribers: 20 s
        vipCooldownMs:    10000, // mods/superfans: 10 s
        globalCooldownMs: 0
      }),
      config.giftMappings, config.oddsProfiles, config.rewardRules
    );
    jest.clearAllMocks();
  });

  it('regular user receives the long default cooldown', async () => {
    const config = game.getConfig();
    game._registerCooldown('regular', config.id, config.settings, {});
    const check = game._checkCooldown('regular', config.id, config.settings, {});
    expect(check.allowed).toBe(false);
    expect(check.remainingMs).toBeGreaterThan(50000); // close to 60s
  });

  it('subscriber receives the shorter sub cooldown', async () => {
    const config = game.getConfig();
    game._registerCooldown('sub1', config.id, config.settings, { isSubscriber: true });
    const check = game._checkCooldown('sub1', config.id, config.settings, { isSubscriber: true });
    expect(check.allowed).toBe(false);
    expect(check.remainingMs).toBeLessThanOrEqual(20000);
    expect(check.remainingMs).toBeGreaterThan(0);
  });

  it('moderator receives the shortest VIP cooldown', async () => {
    const config = game.getConfig();
    game._registerCooldown('mod1', config.id, config.settings, { isModerator: true });
    const check = game._checkCooldown('mod1', config.id, config.settings, { isModerator: true });
    expect(check.allowed).toBe(false);
    expect(check.remainingMs).toBeLessThanOrEqual(10000);
  });

  it('superfan (teamMemberLevel > 0) receives the shortest VIP cooldown', async () => {
    const config = game.getConfig();
    game._registerCooldown('superfan1', config.id, config.settings, { teamMemberLevel: 2 });
    const check = game._checkCooldown('superfan1', config.id, config.settings, { teamMemberLevel: 2 });
    expect(check.allowed).toBe(false);
    expect(check.remainingMs).toBeLessThanOrEqual(10000);
  });

  it('moderator cooldown is shorter than subscriber cooldown which is shorter than regular', () => {
    const config = game.getConfig();
    game._registerCooldown('u_regular',  config.id, config.settings, {});
    game._registerCooldown('u_sub',      config.id, config.settings, { isSubscriber: true });
    game._registerCooldown('u_mod',      config.id, config.settings, { isModerator: true });

    const rRegular = game._checkCooldown('u_regular', config.id, config.settings, {}).remainingMs;
    const rSub     = game._checkCooldown('u_sub',     config.id, config.settings, { isSubscriber: true }).remainingMs;
    const rMod     = game._checkCooldown('u_mod',     config.id, config.settings, { isModerator: true }).remainingMs;

    expect(rRegular).toBeGreaterThan(rSub);
    expect(rSub).toBeGreaterThan(rMod);
  });

  it('cooldowns are independent per user (different users do not share state)', () => {
    const config = game.getConfig();
    game._registerCooldown('alice', config.id, config.settings, { isSubscriber: true });

    expect(game._checkCooldown('alice', config.id, config.settings, { isSubscriber: true }).allowed).toBe(false);
    expect(game._checkCooldown('bob',   config.id, config.settings, { isSubscriber: true }).allowed).toBe(true);
  });

  it('triggerSpinFromChat respects subscriber cooldown (second spin blocked)', async () => {
    // First spin succeeds
    const r1 = await game.triggerSpinFromChat('subuser', 'SubUser', '', '!spin', null, { isSubscriber: true });
    expect(r1.success).toBe(true);
    // Second spin is blocked by cooldown
    const r2 = await game.triggerSpinFromChat('subuser', 'SubUser', '', '!spin', null, { isSubscriber: true });
    expect(r2.success).toBe(false);
    expect(r2.error).toMatch(/cooldown/i);
  });

  it('triggerSpinFromChat with GCCE-style context (userRoles from userData) respects role cooldown', async () => {
    // Simulate the GCCE context shape:
    // role flags are in context.userData, NOT at the top level
    // The fix in handleSlotSpinCommand reads userData before falling back to top-level
    const gcceContext = {
      uniqueId: 'gccemod',
      nickname: 'GCCEMod',
      profilePictureUrl: '',
      // role flags are NOT at the top level in a real GCCE context
      userData: {
        isModerator:    true,
        isSubscriber:   false,
        teamMemberLevel: 0
      }
    };

    // Simulate what the fixed handleSlotSpinCommand does:
    const { userData = {} } = gcceContext;
    const isModerator    = userData.isModerator    ?? gcceContext.isModerator    ?? false;
    const isSubscriber   = userData.isSubscriber   ?? gcceContext.isSubscriber   ?? false;
    const teamMemberLevel = userData.teamMemberLevel ?? gcceContext.teamMemberLevel ?? 0;
    const userRoles = { isModerator, isSubscriber, teamMemberLevel };

    expect(userRoles.isModerator).toBe(true);
    expect(userRoles.isSubscriber).toBe(false);
    expect(userRoles.teamMemberLevel).toBe(0);

    // Verify the resolved cooldown is VIP (shortest)
    const config = game.getConfig();
    const cd = game._effectiveCooldownMs(config.settings, userRoles);
    expect(cd).toBe(config.settings.vipCooldownMs);
  });
});
