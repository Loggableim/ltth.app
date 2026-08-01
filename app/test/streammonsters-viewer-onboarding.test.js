'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/stream-monsters/backend/streammonsters/database'
);
const ViewerOnboardingService = require(
  '../plugins/stream-monsters/backend/streammonsters/viewer-onboarding-service'
);
const StreamMonstersEngine = require(
  '../plugins/stream-monsters/backend/streammonsters/game-engine'
);
const StreamMonstersRoutes = require(
  '../plugins/stream-monsters/backend/streammonsters/routes'
);
const StreamAlchemyPlugin = require('../plugins/stream-monsters');

const pluginDir = require('path').join(
  process.cwd(),
  'plugins',
  'stream-monsters'
);

function createStore() {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    sendFile: jest.fn()
  };
}

function createRouteHarness() {
  const registered = [];
  const { sqlite, store } = createStore();
  const onboarding = new ViewerOnboardingService({ store });
  const engine = new StreamMonstersEngine({
    store,
    config: { hatchDurationMs: 90_000, eggExpiryMs: 86_400_000 }
  });
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => {
        registered.push({ method, routePath, handler });
      },
      emit: jest.fn(),
      log: jest.fn()
    },
    pluginDir,
    store,
    engine,
    onboarding,
    configProvider: {
      getConfig: () => ({ streamMonsters: {} }),
      updateConfig: () => ({ streamMonsters: {} })
    }
  });
  routes.register();
  return {
    sqlite,
    store,
    onboarding,
    find(method, routePath) {
      return registered.find(entry => (
        entry.method === method && entry.routePath === routePath
      )).handler;
    }
  };
}

describe('Stream Monsters per-viewer onboarding migration', () => {
  test('creates the additive compound-key journey table idempotently', () => {
    const { sqlite, store } = createStore();

    store.initialize();

    const columns = sqlite.prepare(
      'PRAGMA table_info(streammonsters_viewer_onboarding)'
    ).all();
    expect(columns.map(column => ({
      name: column.name,
      type: column.type,
      notnull: column.notnull,
      pk: column.pk
    }))).toEqual([
      { name: 'user_id', type: 'TEXT', notnull: 1, pk: 1 },
      { name: 'step_key', type: 'TEXT', notnull: 1, pk: 2 },
      { name: 'completed_at_ms', type: 'INTEGER', notnull: 1, pk: 0 }
    ]);
    sqlite.close();
  });
});

describe('Stream Monsters per-viewer onboarding service', () => {
  test('records each first-session step once and resumes from persisted progress', () => {
    const { sqlite, store } = createStore();
    const onboarding = new ViewerOnboardingService({ store });

    expect(onboarding.recordStep('viewer-a', 'egg_received', 1_000)).toBe(true);
    expect(onboarding.recordStep('viewer-a', 'egg_received', 9_000)).toBe(false);
    expect(onboarding.recordStep('viewer-a', 'egg_hatched', 2_000)).toBe(true);

    const resumed = new ViewerOnboardingService({ store });
    expect(resumed.getJourney('viewer-a')).toEqual({
      completedSteps: ['egg_received', 'egg_hatched'],
      nextStep: 'monster_selected',
      complete: false
    });
    expect(resumed.nextStep('viewer-a')).toBe('monster_selected');
    expect(sqlite.prepare(`
      SELECT step_key, completed_at_ms
      FROM streammonsters_viewer_onboarding
      WHERE user_id = ?
      ORDER BY completed_at_ms, step_key
    `).all('viewer-a')).toEqual([
      { step_key: 'egg_received', completed_at_ms: 1_000 },
      { step_key: 'egg_hatched', completed_at_ms: 2_000 }
    ]);
    sqlite.close();
  });

  test('finishes at battle_completed without requiring a stat allocation', () => {
    const { sqlite, store } = createStore();
    const onboarding = new ViewerOnboardingService({ store });
    const steps = [
      'egg_received',
      'egg_hatched',
      'monster_selected',
      'battle_joined',
      'battle_completed'
    ];

    steps.forEach((step, index) => {
      expect(onboarding.recordStep('viewer-b', step, 10_000 + index)).toBe(true);
    });

    expect(onboarding.getJourney('viewer-b')).toEqual({
      completedSteps: steps,
      nextStep: null,
      complete: true
    });
    expect(onboarding.nextStep('viewer-b')).toBeNull();
    expect(onboarding.recordStep('viewer-b', 'stat_allocated', 99_000)).toBe(false);
    sqlite.close();
  });

  test('keeps onboarding-only legacy identities canonical', () => {
    const { sqlite, store } = createStore();
    const onboarding = new ViewerOnboardingService({ store });
    onboarding.recordStep('legacy-viewer', 'egg_received', 1_000);

    expect(store.viewerDataExists('legacy-viewer')).toBe(true);
    expect(store.resolveViewerIdentity({
      platformUserId: '998877665544',
      legacyUserId: 'legacy-viewer',
      updatedAtMs: 2_000
    })).toBe('legacy-viewer');
    sqlite.close();
  });

  test('returns a sanitized empty journey for missing or unknown viewers', () => {
    const { sqlite, store } = createStore();
    const onboarding = new ViewerOnboardingService({ store });

    expect(onboarding.getJourney('unknown-viewer')).toEqual({
      completedSteps: [],
      nextStep: 'egg_received',
      complete: false
    });
    expect(onboarding.getJourney('')).toEqual({
      completedSteps: [],
      nextStep: 'egg_received',
      complete: false
    });
    expect(JSON.stringify(onboarding.getJourney('unknown-viewer')))
      .not.toContain('unknown-viewer');
    sqlite.close();
  });
});

describe('Stream Monsters per-viewer onboarding state', () => {
  test('exposes only the selected viewer sanitized journey in creator state', async () => {
    const harness = createRouteHarness();
    harness.onboarding.recordStep('viewer-private-a', 'egg_received', 1_000);
    harness.onboarding.recordStep('viewer-private-b', 'battle_completed', 2_000);
    const res = response();

    await harness.find('GET', '/api/streammonsters/creator-state')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      query: { userId: 'viewer-private-a' }
    }, res);

    expect(res.payload.viewer.onboarding).toEqual({
      completedSteps: ['egg_received'],
      nextStep: 'egg_hatched',
      complete: false
    });
    expect(JSON.stringify(res.payload.viewer.onboarding))
      .not.toMatch(/viewer-private|userId|user_id/);
    harness.sqlite.close();
  });
});

describe('Stream Monsters authoritative onboarding wiring', () => {
  test('records only successful choose and accepted battle command results', async () => {
    const plugin = new StreamAlchemyPlugin({ emit: jest.fn() });
    plugin.streamMonstersOnboarding = {
      recordStep: jest.fn(() => true)
    };
    plugin.streamMonstersChatCommands = {
      execute: jest.fn()
        .mockReturnValueOnce({ success: true, status: 'selected' })
        .mockReturnValueOnce({ success: false, status: 'invalid_slot' })
        .mockReturnValueOnce({ success: true, status: 'queued' })
    };

    await plugin.executeStreamMonstersOnboardingCommand(
      { userId: 'viewer-command' },
      'choose',
      ['1']
    );
    await plugin.executeStreamMonstersOnboardingCommand(
      { userId: 'viewer-command' },
      'choose',
      ['99']
    );
    await plugin.executeStreamMonstersOnboardingCommand(
      { userId: 'viewer-command' },
      'battle',
      []
    );

    expect(plugin.streamMonstersOnboarding.recordStep.mock.calls.map(call => (
      call.slice(0, 2)
    ))).toEqual([
      ['viewer-command', 'monster_selected'],
      ['viewer-command', 'battle_joined']
    ]);
  });

  test('records private participants before projecting legitimate lifecycle events', () => {
    const emitted = [];
    const plugin = new StreamAlchemyPlugin({
      emit: (event, payload) => emitted.push({ event, payload }),
      log: jest.fn()
    });
    plugin.config = {
      streamMonsters: {
        tutorialHintsEnabled: false
      }
    };
    plugin.streamMonstersOnboarding = {
      recordStep: jest.fn(() => true)
    };
    plugin.streamMonstersBattleMatchService = {
      getMatch: matchId => matchId === 'match-real'
        ? {
          state: 'completed',
          completedAtMs: 9_000,
          result: { terminalReason: 'knockout' },
          participants: [
            { viewerId: 'viewer-private-a' },
            { viewerId: '998877665544' }
          ]
        }
        : matchId === 'match-pending'
          ? {
            state: 'action',
            result: null,
            participants: [{ viewerId: 'viewer-pending' }]
          }
        : null
    };
    plugin.streamMonstersStore = {
      getBattle: battleId => battleId === 'battle-real'
        ? {
          user_a_id: 'viewer-legacy-a',
          user_b_id: 'viewer-legacy-b',
          result: { terminalReason: 'knockout' }
        }
        : battleId === 'battle-pending'
          ? {
            user_a_id: 'viewer-legacy-pending',
            user_b_id: 'viewer-legacy-pending-b',
            result: null
          }
        : null
    };
    plugin.streamMonstersPublicEventProjector = {
      identifiers: () => ({
        eventId: 'event-public',
        correlationId: 'correlation-public'
      }),
      project: (eventType, payload) => ({
        matchId: payload.matchId,
        battleId: payload.battleId
      }),
      isCritical: () => false
    };

    plugin.emitStreamMonsters('streammonsters:egg_spawned', {
      userId: 'viewer-private-a',
      egg: { egg_id: 'egg-private' }
    });
    plugin.emitStreamMonsters('streammonsters:egg_hatched', {
      userId: 'viewer-private-a',
      egg: { egg_id: 'egg-private' }
    });
    plugin.emitStreamMonsters('streammonsters:free_egg_claimed', {
      userId: 'viewer-adopter',
      egg: { egg_id: 'egg-adopted' }
    });
    plugin.emitStreamMonsters('streammonsters:battle_completed', {
      matchId: 'match-real'
    });
    plugin.emitStreamMonsters('streammonsters:battle_completed', {
      battleId: 'battle-real'
    });
    plugin.emitStreamMonsters('streammonsters:battle_completed', {
      userId: 'viewer-spoofed',
      matchId: 'match-missing'
    });
    plugin.emitStreamMonsters('streammonsters:battle_completed', {
      matchId: 'match-pending'
    });
    plugin.emitStreamMonsters('streammonsters:battle_completed', {
      battleId: 'battle-pending'
    });

    expect(plugin.streamMonstersOnboarding.recordStep.mock.calls.map(call => (
      call.slice(0, 2)
    ))).toEqual([
      ['viewer-private-a', 'egg_received'],
      ['viewer-private-a', 'egg_hatched'],
      ['viewer-adopter', 'egg_received'],
      ['viewer-private-a', 'battle_completed'],
      ['998877665544', 'battle_completed'],
      ['viewer-legacy-a', 'battle_completed'],
      ['viewer-legacy-b', 'battle_completed']
    ]);
    expect(JSON.stringify(emitted)).not.toMatch(
      /viewer-private|viewer-legacy|viewer-spoofed|998877665544/
    );
  });

  test('passes a private viewer only into the director and emits a sanitized hint', () => {
    const emitted = [];
    const plugin = new StreamAlchemyPlugin({
      emit: (event, payload) => emitted.push({ event, payload })
    });
    plugin.config = {
      streamMonsters: {
        tutorialHintsEnabled: true,
        tutorialHintIntervalSeconds: 90
      }
    };
    plugin.streamMonstersTutorialHintDirector = {
      setIntervalSeconds: jest.fn(),
      nextHint: jest.fn(() => ({
        kind: 'hatch',
        stepKey: 'egg_hatched',
        command: '!hatch'
      }))
    };

    plugin.emitStreamMonstersTutorialHint(
      'streammonsters:egg_ready',
      false,
      { userId: '998877665544' }
    );

    expect(plugin.streamMonstersTutorialHintDirector.nextHint)
      .toHaveBeenCalledWith({
        eventType: 'streammonsters:egg_ready',
        criticalSequence: false,
        viewerId: '998877665544'
      }, expect.any(Number));
    expect(emitted).toEqual([{
      event: 'streammonsters:tutorial_hint',
      payload: {
        kind: 'hatch',
        stepKey: 'egg_hatched',
        command: '!hatch'
      }
    }]);
    expect(JSON.stringify(emitted)).not.toContain('998877665544');
  });
});
