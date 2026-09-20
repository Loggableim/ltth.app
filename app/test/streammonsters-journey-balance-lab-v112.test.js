'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/stream-monsters/backend/streammonsters/database'
);
const ViewerOnboardingService = require(
  '../plugins/stream-monsters/backend/streammonsters/viewer-onboarding-service'
);
const StreamMonstersRoutes = require(
  '../plugins/stream-monsters/backend/streammonsters/routes'
);
const CreatorRuntime = require(
  '../plugins/stream-monsters/streammonsters-creator-runtime'
);
const { projectBattleFighter } = require(
  '../plugins/stream-monsters/backend/streammonsters/public-event-projector'
);
const StreamMonstersBattleMatchService = require(
  '../plugins/stream-monsters/backend/streammonsters/battle-match-service'
);

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function createRouteHarness({ balanceReportProvider } = {}) {
  const registered = [];
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const onboarding = new ViewerOnboardingService({ store });
  const routes = new StreamMonstersRoutes({
    api: { registerRoute: (method, routePath, handler) => registered.push({ method, routePath, handler }) },
    pluginDir: __dirname,
    store,
    engine: { streamKey: 'stream-current', hatchDurationFor: () => 90_000 },
    onboarding,
    balanceReportProvider,
    configProvider: {
      getConfig: () => ({ streamMonsters: { rulesVersion: 8 } }),
      updateConfig: jest.fn()
    }
  });
  routes.register();
  return {
    store,
    onboarding,
    find: (method, routePath) => registered.find(entry => (
      entry.method === method && entry.routePath === routePath
    ))?.handler
  };
}

describe('Stream Monsters 1.12 Journey Balance Lab', () => {
  test('keeps the funnel to viewers whose first journey step began in this stream', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const onboarding = new ViewerOnboardingService({ store });

    onboarding.recordStep('viewer-current', 'egg_received', 1_000, 'stream-current');
    onboarding.recordStep('viewer-current', 'egg_hatched', 2_000, 'stream-current');
    onboarding.recordStep('viewer-earlier', 'egg_received', 500, 'stream-earlier');
    onboarding.recordStep('viewer-earlier', 'egg_hatched', 2_500, 'stream-current');

    expect(onboarding.getCohortFunnel('stream-current')).toEqual({
      streamKey: 'stream-current',
      cohortSize: 1,
      steps: [
        { stepKey: 'egg_received', completed: 1 },
        { stepKey: 'egg_hatched', completed: 1 },
        { stepKey: 'monster_selected', completed: 0 },
        { stepKey: 'battle_joined', completed: 0 },
        { stepKey: 'battle_completed', completed: 0 }
      ]
    });
  });

  test('serves the protected balance report without mutating cohort or gameplay data', async () => {
    const balanceReportProvider = jest.fn(() => ({
      skillBudget: { choices: ['A', 'B', 'C'], specialChargeRequired: 100 },
      effectComponents: { attack: ['damage'], defense: ['shield'], special: ['damage'] },
      representative: { battleCount: 5_184, templateResults: [] },
      allPairs: { battleCount: 19_872, pairResults: [] }
    }));
    const harness = createRouteHarness({ balanceReportProvider });
    harness.onboarding.recordStep('viewer-current', 'egg_received', 1_000, 'stream-current');
    const before = harness.store.db.prepare(`
      SELECT user_id, stream_key, started_at_ms
      FROM streammonsters_viewer_journey_cohorts
    `).all();

    const denied = response();
    await harness.find('GET', '/api/stream-monsters/balance-report')({
      ip: '203.0.113.9', socket: { remoteAddress: '203.0.113.9' }, headers: {}
    }, denied);
    expect(denied.statusCode).toBe(403);

    const allowed = response();
    await harness.find('GET', '/api/stream-monsters/balance-report')({
      ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, headers: {}
    }, allowed);
    expect(allowed.payload).toEqual(expect.objectContaining({
      success: true,
      report: expect.objectContaining({
        skillBudget: expect.any(Object),
        effectComponents: expect.any(Object),
        representative: expect.objectContaining({ battleCount: 5_184 }),
        allPairs: expect.objectContaining({ battleCount: 19_872 })
      })
    }));
    expect(balanceReportProvider).toHaveBeenCalledTimes(1);
    expect(harness.store.db.prepare(`
      SELECT user_id, stream_key, started_at_ms
      FROM streammonsters_viewer_journey_cohorts
    `).all()).toEqual(before);
  });

  test('exposes stable creator diagnosis action codes for existing safe controls', () => {
    expect(CreatorRuntime.CREATOR_DIAGNOSTIC_ACTIONS).toEqual({
      copyOverlayUrl: 'copy_overlay_url',
      applySafeLayout: 'apply_safe_layout',
      openRepairDialog: 'open_repair_dialog'
    });
  });

  test('projects a fighter title, combat metadata and mechanical evolution deltas', () => {
    expect(projectBattleFighter({
      slot: 1,
      locked: true,
      name: 'Ashfang',
      viewerName: 'Viewer',
      species: 'Wolf',
      role: 'striker',
      fighterTitle: 'Ashfang · Wolf · striker',
      element: 'Ember',
      level: 12,
      combatPower: 87,
      evolutionStage: 2,
      evolutionDeltas: { vitality: 0, might: 2, guard: 0, agility: 1 },
      imageUrl: '/plugins/stream-monsters/assets/streammonsters/furry/ashfang.webp'
    })).toEqual(expect.objectContaining({
      fighterTitle: 'Ashfang · Wolf · striker',
      species: 'Wolf',
      role: 'striker',
      element: 'Ember',
      level: 12,
      combatPower: 87,
      evolutionStage: 2,
      evolutionDeltas: { vitality: 0, might: 2, guard: 0, agility: 1 }
    }));
  });
  test('derives presentation metadata from the locked battle monster', () => {
    const service = Object.create(StreamMonstersBattleMatchService.prototype);
    service.chargeWindow = () => null;
    service.projectPublicSkillDeck = () => [];
    service.publicViewerName = viewerId => viewerId;
    service.resolveFighterImage = () => (
      '/plugins/stream-monsters/assets/streammonsters/furry/ashfang.webp'
    );
    const [fighter] = service.projectPublicFighters({
      participants: [{
        slot: 1,
        viewerId: 'Viewer',
        lockedMonsterId: 'monster-1',
        roster: {
          name: 'Ashfang',
          element: 'Ember',
          template_id: 'ashfang',
          evolution_stage: 2,
          level: 12,
          stats: { vitality: 8, might: 12, guard: 8, agility: 9 }
        },
        combatState: { hp: 50, maxHp: 50, charge: 25, shield: 0 }
      }]
    });

    expect(fighter).toEqual(expect.objectContaining({
      fighterTitle: 'Ashfang \u00b7 Wolf \u00b7 striker',
      species: 'Wolf',
      role: 'striker',
      combatPower: 88,
      evolutionDeltas: { vitality: 0, might: 2, guard: 0, agility: 1 }
    }));
  });
});
