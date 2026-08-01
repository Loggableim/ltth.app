const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');
const StreamMonstersRoutes = require('../plugins/stream-monsters/backend/streammonsters/routes');

function createSubject({
  now = () => Date.now(),
  gcceStateProvider
} = {}) {
  const registered = [];
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const config = {
    enabled: true,
    creatorName: 'private-creator',
    rulesVersion: 8,
    hatchDurationMs: 120_000,
    visualPack: 'furry'
  };
  const engine = {
    streamKey: null,
    hatchDurationFor: () => 120_000,
    markReadyEggs: jest.fn(() => {
      store.markReadyEggs(now());
      store.expireReadyEggs(now(), 86_400_000);
    })
  };
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => registered.push({ method, routePath, handler }),
      emit: jest.fn()
    },
    pluginDir: __dirname,
    store,
    engine,
    progression: { getCurrentSeason: () => null, getLeaderboard: () => [] },
    collection: { getHeartChain: () => null, getStreamMission: () => null },
    gcceStateProvider,
    now,
    configProvider: {
      getConfig: () => ({ streamMonsters: config }),
      updateConfig: updates => ({ streamMonsters: { ...config, ...updates.streamMonsters } })
    }
  });
  routes.register();
  return {
    routes,
    store,
    engine,
    find: (method, routePath) => registered.find(route => (
      route.method === method && route.routePath === routePath
    )).handler
  };
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
    }
  };
}

describe('Stream Monsters Rules v5 route security', () => {
  test('projects mission localization and population context for overlays', () => {
    const { routes } = createSubject();

    expect(routes.publicStreamMission({
      mission_key: 'six_hatches',
      target: 4,
      progress: 1,
      completed_at_ms: null,
      population_band: 'party',
      population_peak: 9
    })).toEqual({
      missionKey: 'six_hatches',
      titleKey: 'missionSixHatches',
      explanationKey: 'missionPopulationParty',
      target: 4,
      progress: 1,
      completed: false,
      populationBand: 'party',
      populationPeak: 9
    });
  });

  test('rejects unauthenticated remote creator-state reads', async () => {
    const { find } = createSubject();
    const res = response();
    await find('GET', '/api/streammonsters/creator-state')({
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' },
      headers: {},
      query: {}
    }, res);
    expect(res.statusCode).toBe(403);
  });

  test('keeps the public snapshot free of creator and viewer identity fields', async () => {
    const { find } = createSubject();
    const res = response();
    await find('GET', '/api/streammonsters/state')({
      query: { userId: 'arbitrary-viewer' }
    }, res);
    expect(JSON.stringify(res.payload)).not.toMatch(/private-creator|arbitrary-viewer|user_id/);
    expect(res.payload.config.visualPack).toBe('furry');
    expect(res.payload.config.rulesVersion).toBe(8);
    expect(res.payload.battle).toEqual({
      rulesVersion: 8,
      gameplayPace: 'arcade',
      portraitBattleMode: 'takeover-74',
      portraitArenaVariant: 'classic',
      matches: []
    });
  });

  test('keeps creator-only GCCE diagnostics out of the public overlay snapshot', async () => {
    const gcce = {
      commandPrefix: '!',
      commandReferences: { eggs: '!eier', battle: '!battle' },
      commandPolicies: {
        eggs: { userCooldownMs: 1000, globalCooldownMs: 250 }
      },
      tiktokFilter: {
        status: 'not_probeable',
        probeable: false,
        recommendation: 'use_custom_aliases'
      },
      registrationState: 'active',
      registrationError: 'creator-only detail',
      registrationConflicts: ['private-conflict'],
      registeredCommands: ['eier', 'battle'],
      unavailableCommands: ['rank'],
      commandsRegistered: true
    };
    const { find } = createSubject({ gcceStateProvider: () => gcce });

    const publicState = response();
    await find('GET', '/api/streammonsters/state')({ query: {} }, publicState);
    expect(publicState.payload.gcce).toEqual({
      commandPrefix: '!',
      commandReferences: { eggs: '!eier', battle: '!battle' },
      registrationState: 'active',
      registeredCommands: ['eier', 'battle'],
      commandsRegistered: true
    });
    expect(JSON.stringify(publicState.payload.gcce)).not.toMatch(
      /commandPolicies|tiktokFilter|creator-only|private-conflict|unavailableCommands/
    );

    const creatorState = response();
    await find('GET', '/api/streammonsters/creator-state')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      query: {}
    }, creatorState);
    expect(creatorState.payload.gcce).toBe(gcce);
  });

  test('includes only projected eggStage fields in the creator diagnostics state', async () => {
    const { find, store } = createSubject();
    const created = store.createEgg({
      userId: 'private-viewer-id',
      giftId: 7,
      giftName: 'Private Gift',
      element: 'Ember',
      eggColor: '#ef6b45',
      seed: 'creator-stage-seed',
      createdAtMs: 1_000,
      hatchDurationMs: 120_000,
      readyAtMs: 121_000,
      expiresAtMs: 86_521_000,
      state: 'incubating',
      provenance: 'gift',
      displayName: 'Public Viewer'
    });
    const creatorState = response();

    await find('GET', '/api/streammonsters/creator-state')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      query: {}
    }, creatorState);

    expect(creatorState.payload.eggStage).toEqual([
      expect.objectContaining({
        visualId: expect.stringMatching(/^egg-[a-f0-9]{24}$/),
        provenance: 'gift',
        state: 'incubating',
        displayName: 'Public Viewer',
        adoptable: false
      })
    ]);
    expect(JSON.stringify(creatorState.payload.eggStage)).not.toMatch(
      new RegExp(`${created.egg_id}|private-viewer-id|user_id|gift_id`, 'i')
    );
  });

  test('accepts a bounded overlay heartbeat but exposes diagnostics only to the creator route', async () => {
    let nowMs = 10_000;
    const { find } = createSubject({ now: () => nowMs });
    const heartbeat = response();
    await find('POST', '/api/streammonsters/overlay/heartbeat')({
      body: {
        view: 'full',
        profile: 'streammonsters-full-v1',
        layout: 'portrait',
        renderer: {
          backend: 'webgpu',
          quality: 'high',
          fps: 59.4,
          deviceLost: false,
          fallbackReason: 'private path and token'
        },
        audio: { muted: true, masterVolume: 0.42 }
      }
    }, heartbeat);
    expect(heartbeat.payload).toEqual({ success: true, acceptedAtMs: 10_000 });

    const creator = response();
    await find('GET', '/api/streammonsters/creator-state')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      query: {}
    }, creator);
    expect(creator.payload).toEqual(expect.objectContaining({
      obs: { status: 'connected', lastSeenAtMs: 10_000, ageMs: 0 },
      renderer: expect.objectContaining({
        backend: 'webgpu',
        quality: 'high',
        fps: 59,
        fallbackReason: null,
        status: 'connected'
      }),
      audioRuntime: {
        muted: true,
        masterVolume: 0.42,
        status: 'connected'
      }
    }));

    const publicState = response();
    await find('GET', '/api/streammonsters/state')({ query: {} }, publicState);
    expect(publicState.payload.renderer).toBeUndefined();
    expect(publicState.payload.obs).toBeUndefined();
    expect(publicState.payload.audioRuntime).toBeUndefined();

    nowMs = 30_000;
    const stale = response();
    await find('GET', '/api/streammonsters/creator-state')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      query: {}
    }, stale);
    expect(stale.payload.obs.status).toBe('stale');
  });

  test('repairs only due eggs behind admin auth with dry-run and explicit confirmation', async () => {
    let nowMs = 200_000;
    const { find, store, engine } = createSubject({ now: () => nowMs });
    store.createEgg({
      userId: 'viewer-repair',
      giftId: 1,
      giftName: 'Team Heart',
      element: 'Ember',
      eggColor: '#ef6b45',
      seed: 'repair-seed',
      createdAtMs: 1,
      hatchDurationMs: 100,
      readyAtMs: 101,
      expiresAtMs: 86_400_101,
      state: 'incubating'
    });
    const localRequest = body => ({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body
    });

    const dry = response();
    await find('POST', '/api/streammonsters/repair/eggs')(
      localRequest({ dryRun: true }),
      dry
    );
    expect(dry.payload).toEqual(expect.objectContaining({
      success: true,
      dryRun: true,
      before: { readyDue: 1, expiryDue: 0, queued: 0 },
      repaired: 0
    }));
    expect(engine.markReadyEggs).not.toHaveBeenCalled();

    const missingConfirmation = response();
    await find('POST', '/api/streammonsters/repair/eggs')(
      localRequest({ dryRun: false }),
      missingConfirmation
    );
    expect(missingConfirmation.statusCode).toBe(400);
    expect(engine.markReadyEggs).not.toHaveBeenCalled();

    const repaired = response();
    await find('POST', '/api/streammonsters/repair/eggs')(
      localRequest({ dryRun: false, confirm: 'reconcile_eggs' }),
      repaired
    );
    expect(repaired.payload).toEqual(expect.objectContaining({
      success: true,
      dryRun: false,
      repaired: 1,
      after: { readyDue: 0, expiryDue: 0, queued: 0 }
    }));
    expect(store.getViewerEggs('viewer-repair', 'ready')).toHaveLength(1);
  });

  test.each([
    ['GET', '/api/streammonsters/pool'],
    ['POST', '/api/streammonsters/pool/prepare'],
    ['GET', '/api/streammonsters/local-runtime/status'],
    ['POST', '/api/streammonsters/local-runtime/install'],
    ['GET', '/api/streammonsters/local-runtime/jobs/:jobId'],
    ['DELETE', '/api/streammonsters/local-runtime/jobs/:jobId'],
    ['GET', '/api/streamalchemy/providers/status']
  ])('returns the same unauthenticated 410 contract for retired %s %s', async (method, routePath) => {
    const { find } = createSubject();
    const res = response();
    await find(method, routePath)({
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' },
      headers: {},
      body: {}
    }, res);
    expect(res.statusCode).toBe(410);
    expect(res.payload).toEqual({ error: 'art_lab_removed' });
  });

  test('canonicalizes retired visual-pack updates to Furry', () => {
    const { routes } = createSubject();
    expect(routes.sanitizeConfigUpdate({ visualPack: 'art_lab' })).toEqual({
      visualPack: 'furry'
    });
    expect(routes.sanitizeConfigUpdate({ visualPack: 'kenney' })).toEqual({
      visualPack: 'furry'
    });
  });
  test('returns stable correlation-bearing public errors for rejected avatar tokens', async () => {
    const { find } = createSubject();
    const res = response();
    await find('GET', '/api/streammonsters/avatar/:token')({
      params: { token: 'invalid' },
      headers: {}
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({
      success: false,
      code: 'STREAM_MONSTERS_AVATAR_URL_REJECTED',
      correlationId: expect.any(String)
    });
  });
});
