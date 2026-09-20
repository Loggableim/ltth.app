const Database = require('better-sqlite3');
const { EventEmitter } = require('events');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const Presentation = require('../plugins/stream-monsters/streammonsters-presentation');
const LayoutEditor = require('../plugins/stream-monsters/streammonsters-layout-editor');
const os = require('os');
const path = require('path');
const StreamAlchemyPlugin = require('../plugins/stream-monsters');
const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');
const StreamMonstersRoutes = require('../plugins/stream-monsters/backend/streammonsters/routes');
const StreamMonstersCollectionService = require('../plugins/stream-monsters/backend/streammonsters/collection-service');
const {
  TEMPLATE_CATALOG,
  FURRY_ASSET_VERSION
} = require('../plugins/stream-monsters/backend/streammonsters/catalog');
const overlayRuntime = require('../plugins/stream-monsters/streammonsters-overlay-runtime');
const creatorRuntime = require('../plugins/stream-monsters/streammonsters-creator-runtime');

const ART_LAB_ROUTES = [
  ['GET', '/api/streamalchemy/config'],
  ['POST', '/api/streamalchemy/config'],
  ['GET', '/api/streamalchemy/items'],
  ['GET', '/api/streamalchemy/recipes'],
  ['GET', '/api/streamalchemy/generation-jobs'],
  ['GET', '/api/streamalchemy/model-catalog'],
  ['GET', '/api/streamalchemy/providers/status'],
  ['GET', '/api/streamalchemy/local-model/status'],
  ['POST', '/api/streamalchemy/local-model/install'],
  ['GET', '/api/streamalchemy/system-analysis'],
  ['POST', '/api/streamalchemy/local-generation/test'],
  ['GET', '/api/streammonsters/pool'],
  ['POST', '/api/streammonsters/pool'],
  ['POST', '/api/streammonsters/pool/prepare'],
  ['GET', '/api/streammonsters/local-runtime/status'],
  ['POST', '/api/streammonsters/local-runtime/install'],
  ['GET', '/api/streammonsters/local-runtime/install/:jobId'],
  ['DELETE', '/api/streammonsters/local-runtime/install/:jobId'],
  ['POST', '/api/streammonsters/local-runtime/start'],
  ['POST', '/api/streammonsters/local-runtime/stop'],
  ['POST', '/api/streammonsters/local-runtime/verify']
];

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

function createRouteSubject({ dataDir = os.tmpdir() } = {}) {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  store.upsertGiftMapping({
    giftId: 901,
    giftName: 'Heart Me',
    element: 'Random',
    effect: 'spawn',
    enabled: true
  });
  const registered = [];
  const config = new StreamAlchemyPlugin({
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    log: jest.fn()
  }).loadConfig({
    streamMonsters: {
      creatorName: 'creator-secret',
      visualPack: 'art_lab'
    }
  });
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => registered.push({ method, routePath, handler }),
      emit: jest.fn()
    },
    pluginDir: path.join(process.cwd(), 'plugins', 'stream-monsters'),
    dataDir,
    store,
    engine: {
      streamKey: 'stream-secret',
      hatchDurationFor: () => 120_000
    },
    progression: {
      getCurrentSeason: () => ({ season_id: 'season-public', ends_at_ms: 1234 }),
      getLeaderboard: () => [],
      getViewerSeason: userId => ({ user_id: userId, points: 42 }),
      achievementTitleKey: () => 'achievementUnknown'
    },
    collection: {
      getCatalogState: userId => ({
        userId,
        templates: [],
        dex: { owned: 1, total: 24 },
        essence: [],
        cosmetics: []
      }),
      getHeartChain: () => ({ chain_length: 2 }),
      getStreamMission: () => ({ mission_key: 'secret-mission' })
    },
    giftCatalogProvider: () => [],
    gcceStateProvider: () => ({
      commandPrefix: '!',
      registrationState: 'active',
      registrationError: null,
      commandsRegistered: true
    }),
    configProvider: {
      getConfig: () => config,
      updateConfig: updates => ({
        ...config,
        streamMonsters: { ...config.streamMonsters, ...updates.streamMonsters }
      })
    }
  });
  routes.register();
  return {
    routes,
    store,
    registered,
    find: (method, routePath) => registered.find(route => (
      route.method === method && route.routePath === routePath
    ))?.handler
  };
}

function createApi(storedConfig = {}) {
  const settings = new Map([['streamalchemy_config', storedConfig]]);
  const routes = [];
  const events = [];
  const logs = [];
  const emitter = new EventEmitter();
  return {
    routes,
    events,
    logs,
    api: {
      pluginDir: path.join(process.cwd(), 'plugins', 'stream-monsters'),
      getDatabase: () => new Database(':memory:'),
      getConfig: key => settings.get(key),
      setConfig: (key, value) => settings.set(key, value),
      ensurePluginDataDir: () => require('os').tmpdir(),
      registerRoute: (method, routePath, handler) => routes.push({ method, routePath, handler }),
      registerTikTokEvent: (event, handler) => events.push({ event, handler }),
      emit: jest.fn(),
      log: (message, level) => logs.push({ message, level }),
      on: (event, handler) => {
        emitter.on(event, handler);
        return true;
      },
      removeListener: (event, handler) => emitter.removeListener(event, handler),
      pluginLoader: { loadedPlugins: new Map() }
    }
  };
}

describe('Stream Monsters Rules v5 and Art Lab retirement', () => {
  test('migrates Rules v5 additively, canonicalizes Furry and exposes all safe persisted defaults', () => {
    const api = { getConfig: jest.fn(), setConfig: jest.fn(), log: jest.fn() };
    const plugin = new StreamAlchemyPlugin(api);
    const config = plugin.loadConfig({
      enabled: false,
      historicalProviderSetting: 'preserved-but-unused',
      streamMonsters: {
        rulesVersion: 3,
        hatchDurationMs: 300_000,
        creatorName: 'creator',
        visualPack: 'art_lab',
        customLegacyFlag: 'keep'
      }
    });

    expect(config.enabled).toBe(false);
    expect(config).not.toHaveProperty('historicalProviderSetting');
    expect(plugin.composeStoredConfig(config).historicalProviderSetting)
      .toBe('preserved-but-unused');
    expect(config.streamMonsters).toEqual(expect.objectContaining({
      rulesVersion: 8,
      hatchDurationMs: 300_000,
      incubationPresetsMs: [
        30_000,
        60_000,
        90_000,
        120_000,
        300_000,
        600_000,
        1_800_000
      ],
      eggExpiryMs: 86_400_000,
      eggExpiryPresetsMs: [21_600_000, 43_200_000, 86_400_000, 172_800_000],
      seasonDurationDays: 28,
      rendererQuality: 'auto',
      notificationDurationMs: 12_000,
      visualPack: 'furry',
      customLegacyFlag: 'keep'
    }));
    expect(config.streamMonsters.layouts).toEqual({
      portrait: { anchor: 'top-center', scale: 100 },
      landscape: { anchor: 'bottom-center', scale: 100 }
    });
    expect(config.streamMonsters.audioChannels).toEqual({
      master: { enabled: true, volume: 1 },
      ui: { enabled: true, volume: 0.8 },
      egg: { enabled: true, volume: 0.9 },
      battle: { enabled: true, volume: 1 },
      reward: { enabled: true, volume: 0.9 }
    });
    expect(config.streamMonsters.commandAliases.eggs).toEqual({
      enabled: ['eier', 'eierliste', 'meineeier'],
      disabled: ['eggs']
    });
  });

  test('partial nested config updates preserve unrelated creator settings', () => {
    const api = { getConfig: jest.fn(), setConfig: jest.fn(), log: jest.fn() };
    const plugin = new StreamAlchemyPlugin(api);
    plugin.config = plugin.loadConfig({
      streamMonsters: {
        commandAliases: {
          eggs: { enabled: ['eier', 'meineeier'], disabled: ['eggs'] },
          hatch: { enabled: ['schluepfen'], disabled: ['hatch'] }
        },
        layouts: {
          portrait: { anchor: 'top-left', scale: 90 },
          landscape: { anchor: 'bottom-right', scale: 110 }
        },
        audioChannels: {
          master: { enabled: false, volume: 0.5 },
          battle: { enabled: true, volume: 0.7 }
        }
      }
    });
    plugin.streamMonstersProgression = {
      setSeasonDurationDays: jest.fn()
    };
    plugin.streamMonstersBattleMatchService = {
      setSeasonDurationDays: jest.fn()
    };

    const updated = plugin.updateConfig({
      streamMonsters: {
        seasonDurationDays: 60,
        commandAliases: {
          eggs: { enabled: ['eierliste'], disabled: ['eggs'] }
        },
        layouts: {
          portrait: { anchor: 'top-center', scale: 100 }
        },
        audioChannels: {
          battle: { enabled: false, volume: 0.4 }
        }
      }
    });

    expect(updated.streamMonsters.commandAliases.hatch).toEqual({
      enabled: ['schluepfen'],
      disabled: ['hatch']
    });
    expect(updated.streamMonsters.layouts.landscape).toEqual({
      anchor: 'bottom-right',
      scale: 110
    });
    expect(updated.streamMonsters.audioChannels.master).toEqual({
      enabled: false,
      volume: 0.5
    });
    expect(plugin.streamMonstersProgression.setSeasonDurationDays).toHaveBeenCalledWith(60);
    expect(plugin.streamMonstersBattleMatchService.setSeasonDurationDays).toHaveBeenCalledWith(60);
  });

  test('keeps legacy egg timing, battle replay, generation pool and art pool rows byte-for-byte', () => {
    const sqlite = new Database(':memory:');
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    sqlite.prepare(`
      INSERT INTO streammonsters_eggs (
        egg_id, user_id, gift_id, gift_name, element, egg_color, seed, state,
        created_at_ms, hatch_duration_ms, boost_ms, ready_at_ms, variant
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('legacy-egg', 'viewer-private', 1, 'Old gift', 'Ember', '#fff', 'seed', 'incubating',
      10, 1_800_000, 123, 1_799_887, 'standard');
    sqlite.prepare(`
      INSERT INTO streammonsters_battles (
        battle_id, seed, monster_a_id, monster_b_id, winner_monster_id,
        result_json, created_at_ms, rules_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('legacy-battle', 'seed', 'a', 'b', 'a', '{"rounds":[{"damage":7}]}', 20, 3);
    sqlite.prepare(`
      INSERT INTO streammonsters_generation_pool (
        pool_key, gift_id, gift_name, element, egg_color, status, attempts,
        prompt, image_url, error, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('legacy-pool', 1, 'Gift', 'Ember', '#fff', 'ready', 1,
      'historical prompt', 'file:///historical.png', null, 30, 31);
    sqlite.prepare(`
      INSERT INTO streammonsters_art_pool (
        art_id, element, variant, provider, status, image_url, visual_key, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('legacy-art', 'Ember', 'standard', 'comfy', 'ready',
      '/historical/art.png', 'legacy:key', 40);
    const before = {
      egg: sqlite.prepare('SELECT * FROM streammonsters_eggs WHERE egg_id = ?').get('legacy-egg'),
      battle: sqlite.prepare('SELECT * FROM streammonsters_battles WHERE battle_id = ?').get('legacy-battle'),
      pool: sqlite.prepare('SELECT * FROM streammonsters_generation_pool WHERE pool_key = ?').get('legacy-pool'),
      art: sqlite.prepare('SELECT * FROM streammonsters_art_pool WHERE art_id = ?').get('legacy-art')
    };

    store.initialize();

    expect({
      egg: sqlite.prepare('SELECT * FROM streammonsters_eggs WHERE egg_id = ?').get('legacy-egg'),
      battle: sqlite.prepare('SELECT * FROM streammonsters_battles WHERE battle_id = ?').get('legacy-battle'),
      pool: sqlite.prepare('SELECT * FROM streammonsters_generation_pool WHERE pool_key = ?').get('legacy-pool'),
      art: sqlite.prepare('SELECT * FROM streammonsters_art_pool WHERE art_id = ?').get('legacy-art')
    }).toEqual(before);
  });

  test.each(ART_LAB_ROUTES)('%s %s is a non-mutating exact Art Lab tombstone', async (method, routePath) => {
    const { find } = createRouteSubject();
    const handler = find(method, routePath);
    const res = response();

    expect(handler).toEqual(expect.any(Function));
    await handler({
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' },
      headers: {},
      params: { filename: 'ai-old.png', jobId: 'old-job' },
      query: {},
      body: { destructive: true }
    }, res);

    expect(res.statusCode).toBe(410);
    expect(res.payload).toEqual({ error: 'art_lab_removed' });
  });

  test('serves only generated Kenney fallback art and tombstones other legacy art files', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-v5-art-'));
    const artDir = path.join(dataDir, 'streammonsters', 'monster-art');
    const filename = 'kenney-0123456789abcdef.svg';
    fs.mkdirSync(artDir, { recursive: true });
    fs.writeFileSync(path.join(artDir, filename), '<svg/>', 'utf8');
    const { find } = createRouteSubject({ dataDir });
    const handler = find('GET', '/api/streammonsters/art/:filename');

    const served = response();
    handler({ params: { filename } }, served);
    expect(served.sendFile).toHaveBeenCalledWith(path.join(artDir, filename));

    const retired = response();
    handler({ params: { filename: 'art-lab-output.png' } }, retired);
    expect(retired.statusCode).toBe(410);
    expect(retired.payload).toEqual({ error: 'art_lab_removed' });
  });

  test('ships no executable Art Lab modules and maps legacy UI URLs to the creator UI', () => {
    const pluginDir = path.join(process.cwd(), 'plugins', 'stream-monsters');
    for (const relativePath of [
      'ui.html',
      'ui-old.html',
      'overlay.html',
      'backend/routes.js',
      'backend/generation-service.js',
      'backend/local-model-installer.js',
      'backend/providers/local-comfy-provider.js',
      'backend/streammonsters/art-pool-service.js',
      'backend/streammonsters/generation-pool.js',
      'backend/streammonsters/managed-runtime-installer.js'
    ]) {
      expect(fs.existsSync(path.join(pluginDir, relativePath))).toBe(false);
    }

    const { find } = createRouteSubject();
    for (const legacyPath of [
      '/streamalchemy/ui',
      '/plugins/streamalchemy/ui.html',
      '/plugins/streamalchemy/ui-old.html'
    ]) {
      const res = response();
      find('GET', legacyPath)({}, res);
      expect(res.sendFile).toHaveBeenCalledWith(path.join(pluginDir, 'streammonsters-ui.html'));
    }

    const overlay = response();
    find('GET', '/plugins/streamalchemy/overlay.html')({}, overlay);
    expect(overlay.sendFile).toHaveBeenCalledWith(
      path.join(pluginDir, 'streammonsters-overlay.html')
    );
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'localizes every Rules v5 creator control in %s',
    locale => {
      const pluginDir = path.join(process.cwd(), 'plugins', 'stream-monsters');
      const translations = JSON.parse(fs.readFileSync(
        path.join(pluginDir, 'locales', `${locale}.json`),
        'utf8'
      )).plugins.streamalchemy.ui.monsters;
      const source = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');
      const keys = [
        'eggExpiry', 'duration6Hours', 'duration12Hours', 'duration24Hours', 'duration48Hours',
        'seasonDuration', 'duration7Days', 'duration14Days', 'duration28Days', 'duration60Days',
        'duration90Days', 'rendererQuality', 'rendererAuto', 'rendererHigh', 'rendererMedium',
        'rendererLow', 'notificationDuration', 'aliasEggsEnabled', 'aliasEggsDisabled',
        'serverAudio', 'audioMaster', 'audioMasterVolume', 'audioUi', 'audioUiVolume',
        'audioEgg', 'audioEggVolume', 'audioBattle', 'audioBattleVolume', 'audioReward',
        'audioRewardVolume'
      ];
      for (const key of keys) {
        expect(translations[key]).toEqual(expect.any(String));
        expect(translations[key].trim()).not.toBe('');
        expect(source).toContain(`plugins.streamalchemy.ui.monsters.${key}`);
      }
    }
  );

  test('keeps the public state aggregate-only and protects viewer creator state with admin auth', async () => {
    const { store, find } = createRouteSubject();
    store.createEgg({
      eggId: 'private-egg',
      userId: 'viewer-private',
      giftId: 901,
      giftName: 'Heart Me',
      element: 'Ember',
      eggColor: '#fff',
      seed: 'seed',
      createdAtMs: 10,
      hatchDurationMs: 120_000,
      readyAtMs: 120_010
    });

    const publicRes = response();
    await find('GET', '/api/streammonsters/state')({
      query: { userId: 'viewer-private' }
    }, publicRes);
    expect(JSON.stringify(publicRes.payload)).not.toContain('viewer-private');
    expect(publicRes.payload).not.toHaveProperty('viewer');
    expect(publicRes.payload).not.toHaveProperty('pool');
    expect(publicRes.payload).not.toHaveProperty('metrics');
    expect(publicRes.payload.config).not.toHaveProperty('creatorName');
    expect(publicRes.payload.config.visualPack).toBe('furry');

    const denied = response();
    await find('GET', '/api/streammonsters/creator-state')({
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' },
      headers: {},
      query: { userId: 'viewer-private' }
    }, denied);
    expect(denied.statusCode).toBe(403);

    const allowed = response();
    await find('GET', '/api/streammonsters/creator-state')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      query: { userId: 'viewer-private' }
    }, allowed);
    expect(allowed.payload.viewer.eggs).toEqual([
      expect.objectContaining({ egg_id: 'private-egg', user_id: 'viewer-private' })
    ]);
    expect(allowed.payload.config.creatorName).toBe('creator-secret');

    const catalogDenied = response();
    await find('GET', '/api/streammonsters/creator-catalog')({
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' },
      headers: {},
      query: { userId: 'viewer-private' }
    }, catalogDenied);
    expect(catalogDenied.statusCode).toBe(403);

    const catalogAllowed = response();
    await find('GET', '/api/streammonsters/creator-catalog')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      query: { userId: 'viewer-private' }
    }, catalogAllowed);
    expect(catalogAllowed.payload).toEqual(expect.objectContaining({
      success: true,
      userId: 'viewer-private',
      dex: { owned: 1, total: 24 }
    }));
  });

  test('always chooses bundled Furry and uses Kenney only when the bundled file is missing', () => {
    const service = new StreamMonstersCollectionService({ store: {} });
    const template = TEMPLATE_CATALOG[0];
    const egg = { seed: 'seed', element: template.element, variant: 'standard' };
    const artPool = {
      consumeForTemplate: jest.fn(() => ({
        image_url: '/forbidden-generated.png',
        visual_key: 'ai:forbidden'
      }))
    };
    const kenneyBuilder = {
      build: jest.fn(() => ({
        publicUrl: '/kenney-fallback.png',
        visualSource: 'kenney',
        visualKey: 'kenney:fallback'
      }))
    };

    expect(service.selectVisual({
      template,
      egg,
      visualPack: 'art_lab',
      artPool,
      kenneyBuilder,
      hasBundledAsset: () => true
    })).toEqual({
      imageUrl: template.assetPath,
      visualSource: 'furry',
      visualKey: `furry:${template.templateId}`,
      assetVersion: FURRY_ASSET_VERSION
    });
    expect(artPool.consumeForTemplate).not.toHaveBeenCalled();
    expect(kenneyBuilder.build).not.toHaveBeenCalled();

    expect(service.selectVisual({
      template,
      egg,
      visualPack: 'kenney',
      artPool,
      kenneyBuilder,
      hasBundledAsset: () => false
    })).toEqual({
      imageUrl: '/kenney-fallback.png',
      visualSource: 'kenney',
      visualKey: 'kenney:fallback',
      assetVersion: 'kenney-cc0-v1'
    });
  });

  test('starts without provider, generation, model or managed-runtime services and logs opaque correlations', async () => {
    const { api, events, routes, logs } = createApi({
      enabled: true,
      openaiApiKey: 'secret-openai-key',
      streamMonsters: { enabled: true, visualPack: 'kenney' }
    });
    const plugin = new StreamAlchemyPlugin(api);

    await plugin.init();

    for (const property of [
      'providers',
      'generationService',
      'localModelInstaller',
      'modelCatalog',
      'systemAnalyzer',
      'streamMonstersManagedRuntime',
      'streamMonstersGenerationPool',
      'streamMonstersArtPool',
      'craftingEngine',
      'eventProcessor'
    ]) {
      expect(plugin[property]).toBeUndefined();
    }
    expect(routes.map(route => `${route.method} ${route.routePath}`)).toEqual(expect.arrayContaining(
      ART_LAB_ROUTES.map(([method, routePath]) => `${method} ${routePath}`)
    ));
    plugin.streamMonstersStore.upsertGiftMapping({
      giftId: 901,
      giftName: 'Heart Me',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });
    await events.find(entry => entry.event === 'gift').handler({
      userId: 'viewer-direct-id',
      uniqueId: 'viewer_raw_name',
      giftId: 901,
      giftName: 'Heart Me',
      diamondCount: 1
    });

    const structured = logs
      .map(entry => {
        try {
          return JSON.parse(entry.message);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
    expect(structured).toEqual(expect.arrayContaining([
      expect.objectContaining({
        component: 'streammonsters',
        event: 'gift_processed',
        correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        viewerRef: expect.stringMatching(/^viewer:[0-9a-f]{16}$/)
      })
    ]));
    expect(JSON.stringify(logs)).not.toMatch(
      /viewer-direct-id|viewer_raw_name|secret-openai-key|Heart Me/
    );
    await plugin.destroy();
  });

  test('creator UI loads only creator/gameplay APIs and persists the Rules v5 controls', async () => {
    const html = fs.readFileSync(
      path.join(process.cwd(), 'plugins', 'stream-monsters', 'streammonsters-ui.html'),
      'utf8'
    );
    const requests = [];
    const config = new StreamAlchemyPlugin({
      getConfig: jest.fn(),
      setConfig: jest.fn(),
      log: jest.fn()
    }).loadConfig({ streamMonsters: {} }).streamMonsters;
    const fetchMock = jest.fn(async (url, options = {}) => {
      requests.push({ url, options });
      const payload = url === '/api/status'
        ? { username: 'creator' }
        : url === '/api/stream-monsters/creator-state'
          ? {
            success: true,
            config,
            eggCounts: { incubating: 0, queued: 0, ready: 0 },
            giftMappings: [],
            hype: { points: 0 },
            season: null
          }
          : url.startsWith('/api/stream-monsters/gift-catalog')
            ? { success: true, gifts: [], total: 0, offset: 0, limit: 40 }
            : url === '/api/stream-monsters/gift-mappings'
              ? { success: true, mappings: [] }
              : url.startsWith('/api/stream-monsters/monster-catalog')
                ? {
                  success: true,
                  templates: [],
                  total: 24,
                  formsTotal: 72,
                  assetIntegrity: { expected: 72, available: 72, healthy: true }
                }
              : url.startsWith('/api/stream-monsters/creator-catalog')
                ? { success: true, templates: [], dex: { owned: 0, total: 24 } }
                : url.startsWith('/api/stream-monsters/leaderboard')
                  ? { success: true, entries: [] }
                  : url === '/api/stream-monsters/config' && options.method === 'POST'
                    ? { success: true, config: JSON.parse(options.body) }
                    : { error: 'unexpected_request' };
      return { ok: !payload.error, json: async () => payload };
    });
    const dom = new JSDOM(html, {
      url: 'http://localhost:3000/streammonsters/ui',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.fetch = fetchMock;
        window.StreamMonstersOverlayRuntime = overlayRuntime;
        window.StreamMonstersPresentation = Presentation;
        window.StreamMonstersLayoutEditor = LayoutEditor;
        window.StreamMonstersCreatorRuntime = creatorRuntime;
        window.i18n = {
          init: async () => {},
          updateDOM: () => {},
          t: key => key
        };
      }
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    for (const id of [
      'eggExpiry',
      'seasonDuration',
      'rendererQuality',
      'notificationDuration',
      'aliasEggsEnabled',
      'aliasEggsDisabled',
      'audioMasterEnabled',
      'audioMasterVolume',
      'audioUiEnabled',
      'audioUiVolume',
      'audioEggEnabled',
      'audioEggVolume',
      'audioBattleEnabled',
      'audioBattleVolume',
      'audioRewardEnabled',
      'audioRewardVolume'
    ]) {
      expect(dom.window.document.getElementById(id)).not.toBeNull();
    }
    expect(dom.window.document.getElementById('art-lab')).toBeNull();
    expect(dom.window.document.getElementById('runtimeWizard')).toBeNull();
    expect(requests.map(entry => entry.url)).not.toEqual(expect.arrayContaining([
      '/api/streamalchemy/providers/status',
      '/api/stream-monsters/pool',
      '/api/stream-monsters/local-runtime/status'
    ]));
    expect(requests.map(entry => entry.url)).toContain(
      '/api/stream-monsters/creator-catalog?userId=creator'
    );

    dom.window.document.getElementById('seasonDuration').value = '60';
    dom.window.document.getElementById('rendererQuality').value = 'low';
    dom.window.document.getElementById('audioBattleVolume').value = '0.55';
    dom.window.document.getElementById('saveSetup').click();
    await new Promise(resolve => setTimeout(resolve, 20));
    const save = requests.find(entry => (
      entry.url === '/api/stream-monsters/config' && entry.options.method === 'POST'
    ));
    expect(JSON.parse(save.options.body)).toEqual(expect.objectContaining({
      visualPack: 'furry',
      seasonDurationDays: 60,
      rendererQuality: 'low',
      audioChannels: expect.objectContaining({
        battle: { enabled: true, volume: 0.55 }
      })
    }));
    dom.window.close();
  });
});
