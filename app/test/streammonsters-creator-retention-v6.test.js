'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { JSDOM } = require('jsdom');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const StreamMonstersEngine = require(
  '../plugins/streamalchemy/backend/streammonsters/game-engine'
);
const StreamMonstersRoutes = require(
  '../plugins/streamalchemy/backend/streammonsters/routes'
);
const { getTemplate } = require(
  '../plugins/streamalchemy/backend/streammonsters/catalog'
);
const creatorRuntime = require(
  '../plugins/streamalchemy/streammonsters-creator-runtime'
);
const overlayRuntime = require(
  '../plugins/streamalchemy/streammonsters-overlay-runtime'
);
const TutorialHintDirector = require(
  '../plugins/streamalchemy/backend/streammonsters/tutorial-hint-director'
);

const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');

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

function localRequest(body = undefined, query = {}) {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    body,
    query
  };
}

function createRouteHarness({
  now = () => 100_000,
  gcceStateProvider,
  hintStateProvider,
  battleMatchService = {
    getPublicSnapshot: () => ({
      rulesVersion: 6,
      matches: [{
        matchId: 'opaque-match',
        phase: 'action',
        deadlineMs: 106_000
      }]
    })
  }
} = {}) {
  const registered = [];
  const emitted = [];
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const engine = new StreamMonstersEngine({
    store,
    now,
    config: { hatchDurationMs: 120_000, eggExpiryMs: 86_400_000 }
  });
  engine.setStreamKey('creator:live-1');
  let config = {
    enabled: true,
    creatorName: 'private-creator',
    hatchDurationMs: 120_000,
    providerApiKey: 'private-provider-token',
    gpuAdapter: 'private-gpu',
    diskPath: 'private-disk'
  };
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => {
        registered.push({ method, routePath, handler });
      },
      emit: (event, payload) => emitted.push({ event, payload }),
      log: jest.fn()
    },
    pluginDir,
    dataDir: pluginDir,
    store,
    engine,
    progression: { getCurrentSeason: () => null, getLeaderboard: () => [] },
    collection: {
      getHeartChain: () => null,
      getStreamMission: () => null
    },
    battleMatchService,
    gcceStateProvider: gcceStateProvider || (() => ({
      commandPrefix: '/',
      commandReferences: {
        adopt: '/adoptieren',
        battle: '/kampf'
      },
      commandPolicies: {
        adopt: {
          enabledAliases: ['adoptieren'],
          registeredAliases: ['adoptieren'],
          userCooldownMs: 0,
          globalCooldownMs: 0
        }
      },
      tiktokFilter: {
        status: 'not_probeable',
        probeable: false,
        recommendation: 'use_custom_aliases'
      },
      registrationState: 'active',
      registrationConflicts: ['eggs:rank'],
      registeredCommands: ['adoptieren', 'kampf'],
      unavailableCommands: ['eggs'],
      commandsRegistered: true
    })),
    hintStateProvider: hintStateProvider || (() => ({
      nextAllowedAtMs: 140_000,
      pendingKind: 'hatch'
    })),
    now,
    configProvider: {
      getConfig: () => ({ streamMonsters: config }),
      updateConfig: update => {
        config = { ...config, ...update.streamMonsters };
        return { streamMonsters: config };
      }
    }
  });
  routes.register();
  return {
    emitted,
    routes,
    store,
    find(method, routePath) {
      return registered.find(entry => (
        entry.method === method && entry.routePath === routePath
      )).handler;
    }
  };
}

describe('Stream Monsters Rules v6 retention creator API', () => {
  test('normalizes retention defaults and accepts both inclusive timer boundaries', async () => {
    const harness = createRouteHarness();
    expect(harness.routes.publicConfig({}, { includeCreator: true }))
      .toEqual(expect.objectContaining({
        freeEggDropsEnabled: true,
        freeEggCooldownSeconds: 86_400,
        autoHatchActiveViewers: true,
        autoHatchActiveWindowSeconds: 300,
        tutorialHintsEnabled: true,
        tutorialHintIntervalSeconds: 90
      }));

    const low = response();
    await harness.find('POST', '/api/streammonsters/config')(
      localRequest({
        freeEggDropsEnabled: false,
        freeEggCooldownSeconds: 60,
        autoHatchActiveViewers: false,
        autoHatchActiveWindowSeconds: 30,
        tutorialHintsEnabled: false,
        tutorialHintIntervalSeconds: 60
      }),
      low
    );
    expect(low.payload.config).toEqual(expect.objectContaining({
      freeEggDropsEnabled: false,
      freeEggCooldownSeconds: 60,
      autoHatchActiveViewers: false,
      autoHatchActiveWindowSeconds: 30,
      tutorialHintsEnabled: false,
      tutorialHintIntervalSeconds: 60
    }));

    const high = response();
    await harness.find('POST', '/api/streammonsters/config')(
      localRequest({
        freeEggCooldownSeconds: 31_536_000,
        autoHatchActiveWindowSeconds: 900,
        tutorialHintIntervalSeconds: 300
      }),
      high
    );
    expect(high.payload.config).toEqual(expect.objectContaining({
      freeEggCooldownSeconds: 31_536_000,
      autoHatchActiveWindowSeconds: 900,
      tutorialHintIntervalSeconds: 300
    }));
  });

  test.each([
    [{ freeEggDropsEnabled: 'yes' }, 'STREAM_MONSTERS_FREE_EGG_ENABLED_INVALID'],
    [{ freeEggCooldownSeconds: 59 }, 'STREAM_MONSTERS_FREE_EGG_COOLDOWN_INVALID'],
    [{ freeEggCooldownSeconds: 31_536_001 }, 'STREAM_MONSTERS_FREE_EGG_COOLDOWN_INVALID'],
    [{ autoHatchActiveViewers: 'yes' }, 'STREAM_MONSTERS_AUTO_HATCH_ENABLED_INVALID'],
    [{ autoHatchActiveWindowSeconds: 29 }, 'STREAM_MONSTERS_AUTO_HATCH_WINDOW_INVALID'],
    [{ autoHatchActiveWindowSeconds: 901 }, 'STREAM_MONSTERS_AUTO_HATCH_WINDOW_INVALID'],
    [{ tutorialHintsEnabled: 1 }, 'STREAM_MONSTERS_TUTORIAL_HINTS_ENABLED_INVALID'],
    [{ tutorialHintIntervalSeconds: 59 }, 'STREAM_MONSTERS_TUTORIAL_HINT_INTERVAL_INVALID'],
    [{ tutorialHintIntervalSeconds: 301 }, 'STREAM_MONSTERS_TUTORIAL_HINT_INTERVAL_INVALID']
  ])('rejects an unsafe retention update %#', async (body, error) => {
    const harness = createRouteHarness();
    const res = response();
    await harness.find('POST', '/api/streammonsters/config')(
      localRequest(body),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ success: false, error });
  });

  test('returns aggregate retention/live diagnostics only to the creator route', async () => {
    const harness = createRouteHarness();
    harness.store.createFreeEggOffer({
      offerId: 'offer-reserved',
      streamKey: 'creator:live-1',
      sourceUserId: 'private-viewer-a',
      sourceDisplayName: 'Private A',
      offerEventId: 'event-a',
      offeredAtMs: 90_000,
      reservedUntilMs: 130_000
    });
    harness.store.createFreeEggOffer({
      offerId: 'offer-public',
      streamKey: 'creator:live-1',
      sourceUserId: 'private-viewer-b',
      sourceDisplayName: 'Private B',
      offerEventId: 'event-b',
      offeredAtMs: 80_000,
      reservedUntilMs: 90_000
    });
    harness.store.releaseExpiredFreeEggOffers('creator:live-1', 100_000);

    const creator = response();
    await harness.find('GET', '/api/streammonsters/creator-state')(
      localRequest(undefined),
      creator
    );
    expect(creator.payload.diagnostics).toEqual({
      freeEggs: {
        enabled: true,
        cooldownSeconds: 86_400,
        offers: {
          reserved: 1,
          public: 1,
          claimed: 0,
          total: 2
        },
        claims: 0,
        nextCleanupAtMs: 130_000
      },
      ingress: expect.objectContaining({
        transport: 'gcce',
        prefix: '/',
        aliasConflicts: ['eggs:rank'],
        filterStatus: 'not_probeable',
        commandsRegistered: true
      }),
      hints: {
        enabled: true,
        intervalSeconds: 90,
        nextAllowedAtMs: 140_000,
        pending: true
      },
      match: {
        phase: 'action',
        deadlineMs: 106_000,
        activeMatches: 1
      }
    });
    expect(JSON.stringify(creator.payload.diagnostics))
      .not.toMatch(/private-viewer|private-provider|private-gpu|private-disk/);

    const publicState = response();
    await harness.find('GET', '/api/streammonsters/state')(
      { query: {} },
      publicState
    );
    const publicJson = JSON.stringify(publicState.payload);
    expect(publicState.payload.diagnostics).toBeUndefined();
    expect(publicState.payload.renderer).toBeUndefined();
    expect(publicState.payload.audioRuntime).toBeUndefined();
    expect(publicJson).not.toMatch(
      /freeEggCooldownSeconds|tutorialHintIntervalSeconds|private-creator|private-provider|private-gpu|private-disk/
    );
  });

  test('reports current Rules v8 on public and creator surfaces including fallback snapshots', async () => {
    const harness = createRouteHarness({ battleMatchService: null });
    const publicState = response();
    await harness.find('GET', '/api/streammonsters/state')(
      { query: {} },
      publicState
    );
    const creatorState = response();
    await harness.find('GET', '/api/streammonsters/creator-state')(
      localRequest(),
      creatorState
    );
    const battleState = response();
    await harness.find('GET', '/api/streammonsters/battle-state')(
      { query: {} },
      battleState
    );

    expect(publicState.payload.config.rulesVersion).toBe(8);
    expect(publicState.payload.battle).toEqual({ rulesVersion: 8, matches: [] });
    expect(creatorState.payload.config.rulesVersion).toBe(8);
    expect(creatorState.payload.battle).toEqual({ rulesVersion: 8, matches: [] });
    expect(battleState.payload).toEqual({
      success: true,
      rulesVersion: 8,
      matches: []
    });
  });
});

describe('Stream Monsters Rules v6 retention creator runtime', () => {
  test('builds bounded retention settings and uses their documented defaults', () => {
    expect(creatorRuntime.buildConfigPayload({ values: {} }))
      .toEqual(expect.objectContaining({
        freeEggDropsEnabled: true,
        freeEggCooldownSeconds: 86_400,
        autoHatchActiveViewers: true,
        autoHatchActiveWindowSeconds: 300,
        tutorialHintsEnabled: true,
        tutorialHintIntervalSeconds: 90
      }));
    expect(creatorRuntime.buildConfigPayload({
      values: {
        freeEggDropsEnabled: false,
        freeEggCooldownSeconds: '60',
        autoHatchActiveViewers: false,
        autoHatchActiveWindowSeconds: '30',
        tutorialHintsEnabled: false,
        tutorialHintIntervalSeconds: '300'
      }
    })).toEqual(expect.objectContaining({
      freeEggDropsEnabled: false,
      freeEggCooldownSeconds: 60,
      autoHatchActiveViewers: false,
      autoHatchActiveWindowSeconds: 30,
      tutorialHintsEnabled: false,
      tutorialHintIntervalSeconds: 300
    }));
    expect(creatorRuntime.buildConfigPayload({
      values: {
        freeEggCooldownSeconds: '1',
        autoHatchActiveWindowSeconds: '901',
        tutorialHintIntervalSeconds: '500'
      }
    })).toEqual(expect.objectContaining({
      freeEggCooldownSeconds: 86_400,
      autoHatchActiveWindowSeconds: 300,
      tutorialHintIntervalSeconds: 90
    }));
  });

  test('includes adoption in alias diagnostics and every deterministic retention demo', () => {
    expect(creatorRuntime.COMMAND_ACTIONS).toContain('adopt');
    expect(creatorRuntime.DEMO_SCENES).toEqual(expect.arrayContaining([
      'free_offer',
      'free_release',
      'free_claim',
      'sealed_lock',
      'sealed_reveal',
      'role_striker',
      'role_guardian',
      'role_trickster',
      'role_sustain',
      'multihit',
      'special',
      'ko',
      'xp',
      'rankup'
    ]));
  });

  test.each([
    ['free_offer', 'demoFreeOffer'],
    ['free_release', 'demoFreeRelease'],
    ['free_claim', 'demoFreeClaim'],
    ['sealed_lock', 'demoSealedLock'],
    ['role_striker', 'demoRoleStriker']
  ])('maps the %s demo scene to the visible locale key %s', (scene, expected) => {
    expect(creatorRuntime.demoTranslationKey(scene)).toBe(expected);
  });

  test('does not emit tutorial hints while the creator has disabled them', () => {
    const plugin = new StreamAlchemyPlugin({ emit: jest.fn() });
    plugin.config = {
      streamMonsters: {
        tutorialHintsEnabled: false,
        tutorialHintIntervalSeconds: 90
      }
    };
    plugin.streamMonstersTutorialHintDirector = {
      setIntervalSeconds: jest.fn(),
      nextHint: jest.fn(() => ({ command: '!adopt' }))
    };

    expect(plugin.emitStreamMonstersTutorialHint(
      'streammonsters:free_egg_offered',
      false
    )).toBeNull();
    expect(plugin.streamMonstersTutorialHintDirector.nextHint)
      .not.toHaveBeenCalled();
  });

  test('emits stable localized fallback metadata through the production hint path', () => {
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
    plugin.streamMonstersTutorialHintDirector = new TutorialHintDirector({
      getCommandReference: () => '!adoptieren'
    });

    plugin.emitStreamMonstersTutorialHint(
      'streammonsters:free_egg_offered',
      false
    );

    expect(emitted).toEqual([{
      event: 'streammonsters:tutorial_hint',
      payload: expect.objectContaining({
        titleKey: 'tutorialHintAdoptTitle',
        bodyKey: 'tutorialHintAdoptBody',
        params: { command: '!adoptieren' },
        title: expect.any(String),
        body: expect.any(String)
      })
    }]);
  });

  test('cancels a pending post-sequence hint when hints are disabled before flush', () => {
    jest.useFakeTimers();
    const emit = jest.fn();
    const plugin = new StreamAlchemyPlugin({ emit });
    plugin.config = {
      streamMonsters: {
        notificationDurationMs: 8_000,
        tutorialHintsEnabled: false
      }
    };
    plugin.streamMonstersTutorialHintDirector = {
      nextHint: jest.fn(() => ({ command: '!adopt' }))
    };
    plugin.scheduleStreamMonstersTutorialHintFlush();
    jest.advanceTimersByTime(8_000);

    expect(plugin.streamMonstersTutorialHintDirector.nextHint)
      .not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('Stream Monsters Rules v6 retention creator UI and locales', () => {
  const html = fs.readFileSync(
    path.join(pluginDir, 'streammonsters-ui.html'),
    'utf8'
  );
  const document = new JSDOM(html).window.document;

  test('shows retention toggles, seconds timers, aggregate warnings and portrait preview', () => {
    for (const id of [
      'freeEggDropsEnabled',
      'freeEggCooldownSeconds',
      'autoHatchActiveViewers',
      'autoHatchActiveWindowSeconds',
      'tutorialHintsEnabled',
      'tutorialHintIntervalSeconds',
      'freeEggOfferCounts',
      'freeEggNextCleanup',
      'tutorialHintState',
      'retentionTimerWarning',
      'portraitStagePreview'
    ]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(document.getElementById('freeEggCooldownSeconds').type).toBe('number');
    expect(document.getElementById('freeEggCooldownSeconds').min).toBe('60');
    expect(document.getElementById('freeEggCooldownSeconds').max).toBe('31536000');
    expect(document.getElementById('autoHatchActiveWindowSeconds').min).toBe('30');
    expect(document.getElementById('autoHatchActiveWindowSeconds').max).toBe('900');
    expect(document.getElementById('tutorialHintIntervalSeconds').min).toBe('60');
    expect(document.getElementById('tutorialHintIntervalSeconds').max).toBe('300');
    expect(document.querySelector('[data-command-alias="adopt"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Rules v7');
  });

  test('ships creator copy for all new controls and live diagnostics in four locales', () => {
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(
        path.join(pluginDir, 'locales', `${locale}.json`),
        'utf8'
      )).plugins.streamalchemy.ui.monsters;
      for (const key of [
        'freeEggDropsEnabled',
        'freeEggCooldownSeconds',
        'freeEggCooldownHelp',
        'autoHatchActiveViewers',
        'autoHatchActiveWindowSeconds',
        'autoHatchActiveHelp',
        'tutorialHintsEnabled',
        'tutorialHintIntervalSeconds',
        'tutorialHintHelp',
        'freeEggOfferCounts',
        'freeEggNextCleanup',
        'retentionTimerWarning',
        'commandAdopt',
        'demoFreeOffer',
        'demoFreeRelease',
        'demoFreeClaim',
        'demoSealedLock',
        'demoSealedReveal',
        'demoRoleStriker',
        'demoRoleGuardian',
        'demoRoleTrickster',
        'demoRoleSustain'
      ]) {
        expect(translations[key]).toEqual(expect.any(String));
        expect(translations[key].trim()).not.toHaveLength(0);
      }
      expect(translations.rulesDynamic).toContain('v7');
    }
  });

  test('ships localized production and free-demo hint copy in all four locales', () => {
    const productionHint = new TutorialHintDirector({
      getCommandReference: () => '!adoptieren'
    }).nextHint({ eventType: 'streammonsters:free_egg_offered' }, 1_000);
    expect(productionHint).toEqual(expect.objectContaining({
      titleKey: 'tutorialHintAdoptTitle',
      bodyKey: 'tutorialHintAdoptBody',
      params: { command: '!adoptieren' },
      title: expect.any(String),
      body: expect.any(String)
    }));

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(
        path.join(pluginDir, 'locales', `${locale}.json`),
        'utf8'
      )).plugins.streamalchemy.ui.monsters;
      const translate = (key, params) => String(translations[key] || key)
        .replace(/\{\{(\w+)\}\}/g, (match, name) => params[name] ?? match);
      const title = overlayRuntime.localizedPayloadField(
        productionHint,
        'title',
        translate
      );
      const body = overlayRuntime.localizedPayloadField(
        productionHint,
        'body',
        translate
      );
      expect(title).toBe(translations.tutorialHintAdoptTitle);
      expect(body).toContain('!adoptieren');
      expect(title).not.toBe(productionHint.titleKey);
      expect(body).not.toBe(productionHint.bodyKey);
    }
  });

  test('localizes every production tutorial kind and preserves old or missing-key fallbacks', () => {
    const eventKeys = [
      ['streammonsters:free_egg_offered', 'tutorialHintAdoptTitle'],
      ['streammonsters:egg_spawned', 'tutorialHintEggsTitle'],
      ['streammonsters:egg_ready', 'tutorialHintHatchTitle'],
      ['streammonsters:egg_hatched', 'tutorialHintMonsterTitle'],
      ['streammonsters:monster_discovered', 'tutorialHintCollectionTitle'],
      ['streammonsters:battle_match_found', 'tutorialHintBattleTitle'],
      ['streammonsters:battle_roster_locked', 'tutorialHintRosterTitle'],
      ['streammonsters:battle_choice_opened', 'tutorialHintSkillsTitle'],
      ['streammonsters:monster_stat_prompt', 'tutorialHintStatsTitle']
    ];
    for (const [eventType, expectedTitleKey] of eventKeys) {
      const hint = new TutorialHintDirector({
        getCommandReference: command => `!${command}`
      }).nextHint({ eventType }, 1_000);
      expect(hint.titleKey).toBe(expectedTitleKey);
      for (const locale of ['de', 'en', 'es', 'fr']) {
        const translations = JSON.parse(fs.readFileSync(
          path.join(pluginDir, 'locales', `${locale}.json`),
          'utf8'
        )).plugins.streamalchemy.ui.monsters;
        expect(overlayRuntime.localizedPayloadField(
          hint,
          'title',
          key => translations[key] || key
        )).toBe(translations[expectedTitleKey]);
      }
    }

    expect(overlayRuntime.localizedPayloadField(
      { title: 'Legacy fallback' },
      'title',
      () => 'unused'
    )).toBe('Legacy fallback');
    expect(overlayRuntime.localizedPayloadField(
      { titleKey: 'missingTitle', title: 'Compatible fallback' },
      'title',
      key => `plugins.streamalchemy.ui.monsters.${key}`
    )).toBe('Compatible fallback');
  });
});

describe('Stream Monsters Rules v6 deterministic retention demos', () => {
  test.each(['match', 'role_striker', 'role_guardian', 'role_trickster', 'role_sustain'])(
    'uses the injected fixed clock for deterministic %s payloads',
    async scene => {
      const run = async () => {
        const harness = createRouteHarness({ now: () => 456_000 });
        const res = response();
        await harness.find('POST', '/api/streammonsters/demo')(
          localRequest({ scene, layout: 'portrait' }),
          res
        );
        return harness.emitted;
      };

      expect(await run()).toEqual(await run());
      const deadlines = (await run())
        .map(entry => entry.payload.deadlineMs)
        .filter(Number.isFinite);
      expect(deadlines).toEqual(expect.arrayContaining([
        scene === 'match' ? 471_000 : 464_000
      ]));
    }
  );

  test.each([
    ['free_offer', 'tutorialHintFreeOfferTitle', 'tutorialHintFreeOfferBody'],
    ['free_release', 'tutorialHintFreeReleaseTitle', 'tutorialHintFreeReleaseBody'],
    ['free_claim', 'tutorialHintFreeClaimTitle', 'tutorialHintFreeClaimBody']
  ])('emits localized compatible fallback copy for the %s demo', async (
    scene,
    titleKey,
    bodyKey
  ) => {
    const harness = createRouteHarness();
    const res = response();
    await harness.find('POST', '/api/streammonsters/demo')(
      localRequest({ scene, layout: 'portrait' }),
      res
    );
    const hint = harness.emitted.find(entry => (
      entry.event === 'streammonsters:tutorial_hint'
    )).payload;
    expect(hint).toEqual(expect.objectContaining({
      titleKey,
      bodyKey,
      params: { command: '/adoptieren' },
      title: expect.any(String),
      body: expect.any(String)
    }));
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(
        path.join(pluginDir, 'locales', `${locale}.json`),
        'utf8'
      )).plugins.streamalchemy.ui.monsters;
      const translate = (key, params) => String(translations[key] || key)
        .replace(/\{\{(\w+)\}\}/g, (match, name) => params[name] ?? match);
      expect(overlayRuntime.localizedPayloadField(hint, 'title', translate))
        .toBe(translations[titleKey]);
      expect(overlayRuntime.localizedPayloadField(hint, 'body', translate))
        .toContain('/adoptieren');
    }
  });

  test.each([
    ['free_offer', ['streammonsters:free_egg_offered', 'streammonsters:tutorial_hint'], null],
    ['free_release', ['streammonsters:free_egg_released', 'streammonsters:tutorial_hint'], null],
    ['free_claim', ['streammonsters:free_egg_claimed', 'streammonsters:tutorial_hint'], null],
    ['sealed_lock', ['streammonsters:battle_choice_locked'], null],
    [
      'sealed_reveal',
      [
        'streammonsters:battle_choice_locked',
        'streammonsters:battle_choice_locked',
        'streammonsters:battle_choices_revealed'
      ],
      null
    ],
    ['role_striker', ['streammonsters:battle_choice_opened', 'streammonsters:battle_skill_used'], 'striker'],
    ['role_guardian', ['streammonsters:battle_choice_opened', 'streammonsters:battle_skill_used'], 'guardian'],
    ['role_trickster', ['streammonsters:battle_choice_opened', 'streammonsters:battle_skill_used'], 'trickster'],
    ['role_sustain', ['streammonsters:battle_choice_opened', 'streammonsters:battle_skill_used'], 'sustain']
  ])('emits the isolated %s scene with the active GCCE prefix', async (scene, events, expectedRole) => {
    const harness = createRouteHarness();
    const res = response();
    await harness.find('POST', '/api/streammonsters/demo')(
      localRequest({ scene, layout: 'portrait' }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(harness.emitted.map(entry => entry.event)).toEqual(events);
    expect(harness.emitted.every(entry => (
      entry.payload.demo === true &&
      entry.payload.preview.scene === scene
    ))).toBe(true);
    if (scene.startsWith('free_')) {
      expect(JSON.stringify(harness.emitted)).toContain('/adoptieren');
    }
    if (expectedRole) {
      const skill = harness.emitted.find(entry => (
        entry.event === 'streammonsters:battle_skill_used'
      ));
      expect(skill.payload.monster.template_id).toEqual(expect.any(String));
      expect(skill.payload.monster.skills).toEqual(expect.any(Object));
      const template = getTemplate(skill.payload.monster.template_id);
      expect(template.role).toBe(expectedRole);
    }
  });
});
