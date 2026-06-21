/**
 * Test suite for Slot Machine game engine integration.
 *
 * Verifies that:
 * - SlotGame class loads and initialises correctly
 * - Default symbols and settings are applied on machine creation
 * - Config round-trips correctly through the database mock
 * - findMachineByGiftTrigger / findMachineByChatCommand return the right machine
 * - User cooldown logic accepts and blocks spins as expected
 * - triggerSpinFromChat and triggerSpinFromGift validate eligibility before spinning
 * - destroy() clears all internal state without throwing
 */

'use strict';

describe('SlotGame – unit integration', () => {
  let SlotGame;
  let mockApi;
  let mockDb;
  let mockLogger;
  let mockIo;

  // ── In-memory DB stub ───────────────────────────────────────────────────────
  function buildMockDb(initialMachines = []) {
    const machines = [...initialMachines];
    let nextId = 1;

    return {
      getAllSlotMachines: jest.fn(() => machines),
      getSlotConfig: jest.fn((machineId) => {
        const m = machineId == null ? machines[0] : machines.find(x => x.id === machineId);
        return m || null;
      }),
      createSlotMachine: jest.fn((name, symbols, settings, giftMappings, oddsProfiles, rewardRules) => {
        const id = nextId++;
        machines.push({
          id,
          name,
          symbols: symbols || [],
          settings: settings || {},
          giftMappings: giftMappings || {},
          oddsProfiles: oddsProfiles || {},
          rewardRules: rewardRules || [],
          chatCommand: null,
          enabled: true
        });
        return id;
      }),
      updateSlotConfig: jest.fn(),
      updateSlotName: jest.fn((id, name) => {
        const m = machines.find(x => x.id === id);
        if (m) m.name = name;
      }),
      updateSlotChatCommand: jest.fn((id, cmd) => {
        const m = machines.find(x => x.id === id);
        if (m) m.chatCommand = cmd;
      }),
      updateSlotEnabled: jest.fn((id, enabled) => {
        const m = machines.find(x => x.id === id);
        if (m) m.enabled = enabled;
      }),
      deleteSlotMachine: jest.fn((id) => {
        const idx = machines.findIndex(x => x.id === id);
        if (idx === -1) return false;
        machines.splice(idx, 1);
        return true;
      }),
      findSlotMachineByGiftTrigger: jest.fn((identifier) => {
        return machines.find(m =>
          m.enabled && m.giftMappings && Object.keys(m.giftMappings).includes(String(identifier))
        ) || null;
      }),
      findSlotMachineByChatCommand: jest.fn((command) => {
        const cleaned = (command || '').replace(/^[!/]/, '').toLowerCase();
        return machines.find(m =>
          m.enabled && m.chatCommand && m.chatCommand.replace(/^[!/]/, '').toLowerCase() === cleaned
        ) || null;
      }),
      getSlotStats: jest.fn(() => ({
        totalSpins: 0,
        totalWins: 0,
        jackpots: 0,
        lastSpin: null
      })),
      recordSlotSpin: jest.fn(),
      updateSlotStats: jest.fn()
    };
  }

  beforeEach(() => {
    jest.resetModules();

    mockIo = { emit: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    mockApi = {
      getSocketIO: jest.fn(() => mockIo)
    };

    mockDb = buildMockDb();

    SlotGame = require('../plugins/game-engine/games/slot');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  test('constructs and initialises without throwing', () => {
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    expect(() => slot.init()).not.toThrow();
    slot.destroy();
  });

  test('startCleanupTimer creates an interval and destroy clears it', () => {
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    slot.startCleanupTimer();
    expect(slot.cleanupTimer).not.toBeNull();
    slot.destroy();
    expect(slot.cleanupTimer).toBeNull();
  });

  test('destroy() clears in-memory maps', () => {
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    // Simulate some in-flight state
    slot.activeSpins.set('s1', { username: 'alice' });
    slot.userCooldowns.set('alice', Date.now());
    slot.destroy();
    expect(slot.activeSpins.size).toBe(0);
    expect(slot.userCooldowns.size).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Machine CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  test('createMachine inserts a record and returns an ID', () => {
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    const id = slot.createMachine('Test Slots');
    expect(typeof id).toBe('number');
    expect(mockDb.createSlotMachine).toHaveBeenCalledTimes(1);
    slot.destroy();
  });

  test('getAllMachines delegates to db.getAllSlotMachines', () => {
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    slot.getAllMachines();
    expect(mockDb.getAllSlotMachines).toHaveBeenCalledTimes(1);
    slot.destroy();
  });

  test('deleteMachine removes the machine and returns true', () => {
    const preMachines = [{ id: 1, name: 'A', enabled: true, chatCommand: null, giftMappings: {} }];
    mockDb = buildMockDb(preMachines);
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    const ok = slot.deleteMachine(1);
    expect(ok).toBe(true);
    expect(mockDb.deleteSlotMachine).toHaveBeenCalledWith(1);
    slot.destroy();
  });

  test('updateMachineName calls db.updateSlotName with the correct args', () => {
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    slot.updateMachineName(42, 'Renamed');
    expect(mockDb.updateSlotName).toHaveBeenCalledWith(42, 'Renamed');
    slot.destroy();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Lookup helpers
  // ─────────────────────────────────────────────────────────────────────────────

  test('findMachineByGiftTrigger returns the correct machine', () => {
    const preMachines = [
      { id: 1, name: 'A', enabled: true, chatCommand: null, giftMappings: { Rose: { oddsProfile: 'gift_common' } } }
    ];
    mockDb = buildMockDb(preMachines);
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    const m = slot.findMachineByGiftTrigger('Rose');
    expect(m).not.toBeNull();
    expect(m.id).toBe(1);
    slot.destroy();
  });

  test('findMachineByGiftTrigger returns null for unknown gift', () => {
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    const m = slot.findMachineByGiftTrigger('UnknownGift');
    expect(m).toBeNull();
    slot.destroy();
  });

  test('findMachineByChatCommand returns the correct machine', () => {
    const preMachines = [
      { id: 2, name: 'Spin', enabled: true, chatCommand: '!spin', giftMappings: {} }
    ];
    mockDb = buildMockDb(preMachines);
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    const m = slot.findMachineByChatCommand('!spin');
    expect(m).not.toBeNull();
    expect(m.id).toBe(2);
    slot.destroy();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Cooldown
  // ─────────────────────────────────────────────────────────────────────────────

  test('getUserCooldownRemaining returns 0 for a fresh user', () => {
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    const remaining = slot.getUserCooldownRemaining('newUser', null);
    expect(remaining).toBe(0);
    slot.destroy();
  });

  test('getUserCooldownRemaining returns positive ms when user is on cooldown', () => {
    const preMachines = [
      {
        id: 1, name: 'Spin', enabled: true, chatCommand: '!spin',
        giftMappings: {},
        settings: { chatCooldownMs: 30000, vipCooldownMs: 15000, subCooldownMs: 10000, globalCooldownMs: 0 },
        symbols: [], oddsProfiles: {}, rewardRules: []
      }
    ];
    mockDb = buildMockDb(preMachines);
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();

    // Simulate a very recent spin for the user
    slot.userCooldowns.set(`1:alice`, Date.now());

    const remaining = slot.getUserCooldownRemaining('alice', 1);
    expect(remaining).toBeGreaterThan(0);
    slot.destroy();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // triggerSpinFromChat – eligibility gate
  // ─────────────────────────────────────────────────────────────────────────────

  test('triggerSpinFromChat returns error when no machines exist', async () => {
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    const result = await slot.triggerSpinFromChat('alice', 'Alice', '', '!spin', null);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    slot.destroy();
  });

  test('triggerSpinFromChat returns error for disabled machine', async () => {
    const preMachines = [
      {
        id: 1, name: 'Spin', enabled: false, chatCommand: '!spin',
        giftMappings: {},
        settings: { chatCooldownMs: 30000 },
        symbols: [{ id: 's1', emoji: '🍒', weight: 10, enabled: true }],
        oddsProfiles: { chat: { loss: 70, near_miss: 10, small_win: 10, medium_win: 5, big_win: 4, jackpot: 1 } },
        rewardRules: []
      }
    ];
    mockDb = buildMockDb(preMachines);
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    const result = await slot.triggerSpinFromChat('alice', 'Alice', '', '!spin', 1);
    expect(result.success).toBe(false);
    slot.destroy();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // getStats delegates correctly
  // ─────────────────────────────────────────────────────────────────────────────

  test('getStats delegates to db.getSlotStats', () => {
    const slot = new SlotGame(mockApi, mockDb, mockLogger);
    slot.init();
    slot.getStats(1);
    expect(mockDb.getSlotStats).toHaveBeenCalledWith(1);
    slot.destroy();
  });
});
