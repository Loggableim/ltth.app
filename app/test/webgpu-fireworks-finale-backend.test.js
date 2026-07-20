const fs = require('fs');
const os = require('os');
const path = require('path');

const FireworksPlugin = require('../plugins/webgpu-fireworks/main');
const { FinaleShuffleBag } = require('../plugins/webgpu-fireworks/lib/finale-shuffle-bag');
const { FINALE_STYLES } = require('../plugins/webgpu-fireworks/lib/finale-show-planner');
const { BUILT_IN_SHOW_DEFINITIONS } = require('../plugins/webgpu-fireworks/lib/built-in-shows');
const { RevisionedShowRepository } = require('../plugins/webgpu-fireworks/lib/show-repository');
const {
  ALLOWED_FINALE_LENGTHS,
  ALLOWED_FINALE_STYLES,
  DEFAULT_FIREWORKS_CONFIG,
  normalizeConfig,
  normalizeFinaleRequest
} = require('../plugins/webgpu-fireworks/lib/config-schema');

function createApi(dataDir = path.join(__dirname, '.tmp-webgpu-fireworks-finale')) {
  const routes = new Map();
  const events = new Map();
  return {
    routes,
    events,
    getPluginDataDir: () => dataDir,
    ensurePluginDataDir: jest.fn(() => fs.mkdirSync(dataDir, { recursive: true })),
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(),
    getDatabase: jest.fn(() => null),
    emit: jest.fn(),
    log: jest.fn(),
    registerMiddleware: jest.fn(),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
    registerTikTokEvent: jest.fn((event, handler) => events.set(event, handler))
  };
}

function createPlugin(config = {}, dataDir) {
  const api = createApi(dataDir);
  const plugin = new FireworksPlugin(api);
  plugin.config = normalizeConfig(config);
  return { api, plugin };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function publishCustom(repository, uuid, { name = 'Runtime Custom', autoEligible = true } = {}) {
  repository.idFactory = () => uuid;
  const definition = clone(BUILT_IN_SHOW_DEFINITIONS['classic-crescendo']);
  definition.metadata.name = name;
  definition.autoEligible = autoEligible;
  const created = repository.create(definition);
  repository.validate(created.id, created.revision);
  repository.publish(created.id, created.revision);
  return created.id;
}

function isolateInit(plugin) {
  plugin.migrateOldData = jest.fn(async () => {});
  plugin.loadConfig = jest.fn();
  plugin.migrateFireworksSettings = jest.fn(async () => {});
  plugin.registerRoutes = jest.fn();
  plugin.registerTikTokEventHandlers = jest.fn();
  plugin.registerFlowActions = jest.fn();
  plugin.cacheGiftCatalog = jest.fn(async () => {});
  plugin.registerSocketHandlers = jest.fn();
  plugin.logRoutes = jest.fn();
}

describe('WebGPU finale backend contract', () => {
  test('normalizes global finale defaults and rejects invalid style and length values', () => {
    expect(ALLOWED_FINALE_STYLES).toEqual([
      'auto',
      'classic-crescendo',
      'symmetric-salute',
      'sky-ballet',
      'thunder-finale',
      'nishiki-kamuro',
      'aurora-cathedral',
      'royal-brocade',
      'phoenix-ascension',
      'furry-celebration'
    ]);
    expect(ALLOWED_FINALE_LENGTHS).toEqual(['short', 'medium', 'long']);
    expect(DEFAULT_FIREWORKS_CONFIG).toMatchObject({
      goalFinaleStyle: 'auto',
      goalFinaleLength: 'medium',
      goalFinaleDuration: 18000
    });
    expect(normalizeConfig({
      goalFinaleStyle: 'not-a-show',
      goalFinaleLength: 'forever',
      goalFinaleDuration: 999999
    })).toMatchObject({
      goalFinaleStyle: 'auto',
      goalFinaleLength: 'medium',
      goalFinaleDuration: 30000
    });
  });

  test.each([
    [14000, 'short', 10000],
    [14001, 'medium', 18000],
    [23000, 'medium', 18000],
    [23001, 'long', 28000]
  ])('maps legacy duration %dms to %s', (duration, length, durationMs) => {
    expect(normalizeFinaleRequest({ duration })).toMatchObject({ length, duration: durationMs, durationMs });
  });

  test('treats explicit length as authoritative and preserves sanitized queue identity inputs', () => {
    expect(normalizeFinaleRequest({
      style: 'sky-ballet',
      length: 'short',
      duration: 29000,
      intensity: 99,
      seed: 0xffffffff + 10,
      bypassEnabled: true,
      eventId: 'goal:weekly-42'
    })).toEqual({
      style: 'sky-ballet',
      length: 'short',
      intensity: 10,
      seed: 9,
      bypassEnabled: true,
      eventId: 'goal:weekly-42',
      id: 'goal:weekly-42',
      duration: 10000,
      durationMs: 10000
    });

    expect(normalizeFinaleRequest({ style: 'inherit', length: 'inherit' })).toMatchObject({
      style: 'auto',
      length: 'medium',
      durationMs: 18000
    });
    expect(normalizeFinaleRequest({ style: 'invalid', length: 'invalid' })).toMatchObject({
      style: 'auto',
      length: 'medium',
      durationMs: 18000
    });
  });

  test('emits an authoritative deterministic show plan without configured shapes or colors', () => {
    const { api, plugin } = createPlugin({
      activeShapes: ['paws'],
      themeColors: ['#123456'],
      audioEnabled: false,
      audioVolume: 0.35,
      orientation: 'portrait'
    });

    const result = plugin.triggerFinale({
      style: 'sky-ballet',
      length: 'short',
      intensity: 4,
      seed: 1234,
      eventId: 'goal-123'
    });

    expect(result).toMatchObject({
      accepted: true,
      id: 'goal-123',
      eventId: 'goal-123',
      style: 'sky-ballet',
      length: 'short',
      duration: 10000,
      durationMs: 10000,
      seed: 1234
    });
    expect(result.showPlan).toMatchObject({
      planVersion: 2,
      id: 'goal-123',
      style: 'sky-ballet',
      length: 'short',
      durationMs: 10000,
      seed: 1234
    });
    expect(result).toMatchObject({
      playSound: false,
      audioVolume: 0.35,
      audioMuted: true,
      audioMasterVolume: 0.35
    });
    expect(result).not.toHaveProperty('shapes');
    expect(result).not.toHaveProperty('colors');
    expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:finale', result);

    const repeat = createPlugin({ orientation: 'portrait' }).plugin.triggerFinale({
      style: 'sky-ballet', length: 'short', intensity: 4, seed: 1234, eventId: 'goal-123'
    });
    expect(repeat.showPlan).toEqual(result.showPlan);
  });

  test('provides all nine built-ins to an injectable runtime-local Auto shuffle bag', () => {
    const first = createPlugin().plugin;
    const second = createPlugin().plugin;
    first.finaleShuffleBag = new FinaleShuffleBag(
      () => first.getAutoEligibleFinaleStyleIds(),
      () => 0.999999
    );
    second.finaleShuffleBag = new FinaleShuffleBag(
      () => second.getAutoEligibleFinaleStyleIds(),
      () => 0.999999
    );
    const styles = Array.from({ length: FINALE_STYLES.length }, (_, index) => first.triggerFinale({
      style: 'auto', length: 'short', seed: index + 1, id: `auto-${index}`
    }).style);

    expect(first.getAutoEligibleFinaleStyleIds()).toEqual(FINALE_STYLES);
    expect(new Set(styles)).toEqual(new Set(FINALE_STYLES));
    expect(second.triggerFinale({ style: 'auto', seed: 77, id: 'new-instance' }).style)
      .toBe(styles[0]);
  });

  test('accepts only canonical custom UUID finale IDs through config and request normalization', () => {
    const customId = 'custom:00000000-0000-4000-8000-000000000123';
    expect(normalizeConfig({ goalFinaleStyle: customId }).goalFinaleStyle).toBe(customId);
    expect(normalizeFinaleRequest({ style: customId }).style).toBe(customId);
    expect(normalizeFinaleRequest({ style: 'custom:not-a-uuid' }).style).toBe('auto');
    expect(normalizeFinaleRequest({ style: 'custom:00000000-0000-0000-0000-000000000123' }).style)
      .toBe('auto');
    expect(normalizeFinaleRequest({ style: `${customId}:suffix` }).style).toBe('auto');
  });

  test('uses the Auto bag for Auto, bypasses it for explicit styles, and keeps legacy payloads compatible', () => {
    const { plugin } = createPlugin();
    plugin.finaleShuffleBag = { draw: jest.fn(() => 'sky-ballet') };

    expect(plugin.triggerFinale({ style: 'auto', seed: 1, id: 'auto' }).style).toBe('sky-ballet');
    expect(plugin.triggerFinale({ style: 'thunder-finale', seed: 2, id: 'explicit' }).style)
      .toBe('thunder-finale');
    expect(plugin.triggerFinale(5, 14000, true)).toMatchObject({
      accepted: true,
      intensity: 5,
      length: 'short',
      durationMs: 10000
    });
    expect(plugin.finaleShuffleBag.draw).toHaveBeenCalledTimes(2);
  });

  test('falls back to a valid built-in when the Auto style provider is empty', () => {
    const { plugin } = createPlugin();
    plugin.getAutoEligibleFinaleStyleIds = () => [];

    const finale = plugin.triggerFinale({ style: 'auto', seed: 3, id: 'empty-provider' });

    expect(finale.style).toBe(FINALE_STYLES[0]);
    expect(finale.showPlan.style).toBe(FINALE_STYLES[0]);
  });

  test('generates unique IDs for same-millisecond finales that reuse an explicit seed', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1720000000000);
    try {
      const { plugin } = createPlugin();
      const first = plugin.triggerFinale({ style: 'classic-crescendo', seed: 99 });
      const second = plugin.triggerFinale({ style: 'classic-crescendo', seed: 99 });

      expect(first.id).not.toBe(second.id);
      expect(first.showPlan.id).toBe(first.id);
      expect(second.showPlan.id).toBe(second.id);
    } finally {
      now.mockRestore();
    }
  });

  test('uses global values for object calls with inherit and for omitted legacy duration', () => {
    const { plugin } = createPlugin({
      goalFinaleStyle: 'thunder-finale',
      goalFinaleLength: 'long',
      goalFinaleIntensity: 6
    });

    expect(plugin.triggerFinale({ style: 'inherit', length: 'inherit', seed: 1, id: 'inherit' }))
      .toMatchObject({ style: 'thunder-finale', length: 'long', intensity: 6, durationMs: 28000 });
    expect(plugin.triggerFinale(2))
      .toMatchObject({ style: 'thunder-finale', length: 'long', intensity: 2, durationMs: 28000 });
  });

  test('keeps positional legacy calls and their duration mapping compatible', () => {
    const { plugin } = createPlugin();
    expect(plugin.triggerFinale(5, 14000, true))
      .toMatchObject({ accepted: true, intensity: 5, length: 'short', durationMs: 10000 });
    expect(plugin.triggerFinale(5, 23001, true))
      .toMatchObject({ accepted: true, intensity: 5, length: 'long', durationMs: 28000 });
  });

  test('does not consume auto rotation while disabled unless bypassed', () => {
    const { api, plugin } = createPlugin({ enabled: false });
    plugin.finaleShuffleBag = { draw: jest.fn(() => 'classic-crescendo') };
    expect(plugin.triggerFinale({ style: 'auto', seed: 1, id: 'blocked' }))
      .toEqual({ accepted: false, reason: 'disabled' });
    expect(api.emit).not.toHaveBeenCalled();
    expect(plugin.finaleShuffleBag.draw).not.toHaveBeenCalled();
    expect(plugin.triggerFinale({ style: 'auto', seed: 2, id: 'allowed', bypassEnabled: true }).style)
      .toBe('classic-crescendo');
    expect(plugin.finaleShuffleBag.draw).toHaveBeenCalledTimes(1);
  });

  test('API normalizes object and legacy duration requests and returns resolved queue metadata', () => {
    const { api, plugin } = createPlugin();
    plugin.registerRoutes();
    const handler = api.routes.get('post:/api/webgpu-fireworks/finale');
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    handler({ body: { style: 'symmetric-salute', duration: 14000, seed: 44, eventId: 'api-44' } }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      accepted: true,
      id: 'api-44',
      eventId: 'api-44',
      style: 'symmetric-salute',
      length: 'short',
      durationMs: 10000,
      seed: 44
    }));
    expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:finale', expect.objectContaining({
      id: 'api-44', bypassEnabled: true
    }));
  });

  test('API returns an actionable upgrade response for a Furry test on an old ready overlay', () => {
    const { api, plugin } = createPlugin();
    plugin.overlayTelemetry.set('old-overlay', {
      registered: true,
      state: 'ready',
      visible: true,
      rendererProtocol: 2,
      capabilities: [],
      benchmark: false,
      statusUpdatedAt: Date.now()
    });
    plugin.connectedSockets.add({ id: 'old-overlay', connected: true, emit: jest.fn() });
    plugin.registerRoutes();
    const handler = api.routes.get('post:/api/webgpu-fireworks/finale');
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    handler({
      body: { style: 'furry-celebration', length: 'short', seed: 45, testRequest: true }
    }, res);

    expect(res.status).toHaveBeenCalledWith(426);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      accepted: false,
      code: 'RENDERER_UPGRADE_REQUIRED',
      error: expect.stringMatching(/refresh.*OBS browser source/i)
    }));
    expect(api.emit).not.toHaveBeenCalled();
  });

  test('generic goal events use configured global show values through the object contract', () => {
    const { api, plugin } = createPlugin({
      goalFinaleStyle: 'classic-crescendo',
      goalFinaleLength: 'long',
      goalFinaleIntensity: 7
    });
    plugin.triggerFinale = jest.fn();
    plugin.registerTikTokEventHandlers();

    api.events.get('goal_reached')({ eventId: 'goal-event' });

    expect(plugin.triggerFinale).toHaveBeenCalledWith({
      style: 'classic-crescendo',
      length: 'long',
      intensity: 7,
      eventId: 'goal-event'
    });
  });

  test('initializes the revisioned repository from plugin data and clears only in-memory state on destroy', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-finale-runtime-init-'));
    try {
      const seeded = new RevisionedShowRepository({ dataDir: tempDir });
      const customId = publishCustom(seeded, '00000000-0000-4000-8000-000000000401');
      const { api, plugin } = createPlugin({}, tempDir);
      isolateInit(plugin);
      plugin.registerRoutes = FireworksPlugin.prototype.registerRoutes.bind(plugin);

      await plugin.init();

      expect(plugin.showRepository).toBeInstanceOf(RevisionedShowRepository);
      expect(plugin.showRepositoryLoadError).toBeNull();
      expect(plugin.showApiController).toBeTruthy();
      expect(api.routes.has('get:/api/webgpu-fireworks/shows')).toBe(true);
      expect(plugin.showRepository.getPublishedDefinition(customId).id).toBe(customId);
      const storeBeforeDestroy = fs.readFileSync(path.join(tempDir, 'custom-shows.json'), 'utf8');

      await plugin.destroy();

      expect(plugin.showRepository).toBeNull();
      expect(plugin.showRepositoryLoadError).toBeNull();
      expect(plugin.showApiController).toBeNull();
      expect(fs.readFileSync(path.join(tempDir, 'custom-shows.json'), 'utf8')).toBe(storeBeforeDestroy);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('isolates a completely corrupt repository without writing and keeps built-in finales available', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-finale-runtime-corrupt-'));
    const corruptPath = path.join(tempDir, 'custom-shows.json');
    fs.writeFileSync(corruptPath, '{ definitely-not-json', 'utf8');
    const writeStore = jest.spyOn(RevisionedShowRepository.prototype, '_writeStore');
    try {
      const { api, plugin } = createPlugin({}, tempDir);
      isolateInit(plugin);

      await expect(plugin.init()).resolves.toBeUndefined();

      expect(plugin.showRepository).toBeInstanceOf(RevisionedShowRepository);
      expect(plugin.showRepositoryLoadError).toMatchObject({ code: 'STORE_CORRUPT' });
      expect(writeStore).not.toHaveBeenCalled();
      expect(fs.readFileSync(corruptPath, 'utf8')).toBe('{ definitely-not-json');
      expect(plugin.triggerFinale({ style: 'classic-crescendo', seed: 4, id: 'corrupt-built-in' }))
        .toMatchObject({ accepted: true, style: 'classic-crescendo' });
      expect(api.log).toHaveBeenCalledWith(expect.stringMatching(/repository.*STORE_CORRUPT/i), 'error');
    } finally {
      writeStore.mockRestore();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('refreshes runtime Auto membership after custom publish and archive', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-finale-runtime-auto-'));
    try {
      const { plugin } = createPlugin({}, tempDir);
      const repository = new RevisionedShowRepository({ dataDir: tempDir });
      repository.load();
      plugin.showRepository = repository;
      plugin.showRepositoryLoadError = null;
      plugin.finaleShuffleBag = new FinaleShuffleBag(
        () => plugin.getAutoEligibleFinaleStyleIds(),
        () => 0.5
      );
      const customId = publishCustom(repository, '00000000-0000-4000-8000-000000000402');

      plugin.finaleShuffleBag.draw();
      expect(JSON.parse(plugin.finaleShuffleBag.membershipSignature)).toContain(customId);

      repository.archive(customId, 1);
      plugin.finaleShuffleBag.draw();
      expect(JSON.parse(plugin.finaleShuffleBag.membershipSignature)).not.toContain(customId);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('queues a compiled custom snapshot that later draft edits and archive cannot mutate', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-finale-runtime-snapshot-'));
    try {
      const { plugin } = createPlugin({}, tempDir);
      const repository = new RevisionedShowRepository({ dataDir: tempDir });
      repository.load();
      plugin.showRepository = repository;
      plugin.showRepositoryLoadError = null;
      const customId = publishCustom(repository, '00000000-0000-4000-8000-000000000403');

      const finale = plugin.triggerFinale({ style: customId, length: 'short', seed: 403, id: 'event-403' });
      const queuedSnapshot = clone(finale.showPlan);
      const edited = clone(repository.get(customId).definition);
      edited.metadata.name = 'Later Draft Edit';
      repository.saveDraft(customId, edited, 1);
      repository.archive(customId, 2);

      expect(finale.style).toBe(customId);
      expect(finale.showPlan).toEqual(queuedSnapshot);
      expect(finale.showPlan).toMatchObject({
        id: 'event-403',
        definitionId: customId,
        style: customId,
        metadata: { name: 'Runtime Custom' }
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('falls back from missing, unpublished, and archived custom styles with a consistent warning payload', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-finale-runtime-fallback-'));
    try {
      const { api, plugin } = createPlugin({ goalFinaleStyle: 'classic-crescendo' }, tempDir);
      const repository = new RevisionedShowRepository({ dataDir: tempDir });
      repository.load();
      plugin.showRepository = repository;
      plugin.showRepositoryLoadError = null;
      repository.idFactory = () => '00000000-0000-4000-8000-000000000405';
      const unpublished = repository.create(clone(BUILT_IN_SHOW_DEFINITIONS['classic-crescendo']));
      const archivedId = publishCustom(repository, '00000000-0000-4000-8000-000000000406');
      repository.archive(archivedId, 1);
      const unavailable = [
        ['custom:00000000-0000-4000-8000-000000000404', 'SHOW_NOT_FOUND'],
        [unpublished.id, 'SHOW_NOT_PUBLISHED'],
        [archivedId, 'SHOW_ARCHIVED']
      ];

      for (const [requestedId, reason] of unavailable) {
        const finale = plugin.triggerFinale({ style: requestedId, seed: 9, id: `fallback-${reason}` });
        expect(finale).toMatchObject({ style: 'classic-crescendo' });
        expect(finale.showPlan.style).toBe(finale.style);
        expect(api.log).toHaveBeenCalledWith(expect.stringContaining(requestedId), 'warn');
        expect(api.log).toHaveBeenCalledWith(expect.stringContaining(reason), 'warn');
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('avoids unavailable-global recursion and uses Auto when the global custom is unavailable', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-finale-runtime-self-'));
    const unavailableId = 'custom:00000000-0000-4000-8000-000000000407';
    try {
      const { plugin } = createPlugin({ goalFinaleStyle: unavailableId }, tempDir);
      const repository = new RevisionedShowRepository({ dataDir: tempDir });
      repository.load();
      plugin.showRepository = repository;
      plugin.showRepositoryLoadError = null;
      plugin.finaleShuffleBag = { draw: jest.fn(() => 'sky-ballet') };

      const finale = plugin.triggerFinale({ style: 'inherit', seed: 7, id: 'self-fallback' });

      expect(finale.style).toBe('sky-ballet');
      expect(finale.showPlan.style).toBe('sky-ballet');
      expect(plugin.finaleShuffleBag.draw).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('explicit published custom styles bypass Auto resolution', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-finale-runtime-explicit-'));
    try {
      const { plugin } = createPlugin({}, tempDir);
      const repository = new RevisionedShowRepository({ dataDir: tempDir });
      repository.load();
      plugin.showRepository = repository;
      plugin.showRepositoryLoadError = null;
      const customId = publishCustom(repository, '00000000-0000-4000-8000-000000000408');
      plugin.finaleShuffleBag = { draw: jest.fn(() => 'sky-ballet') };

      const finale = plugin.triggerFinale({ style: customId, seed: 8, id: 'explicit-custom' });

      expect(finale.style).toBe(customId);
      expect(finale.showPlan.style).toBe(customId);
      expect(plugin.finaleShuffleBag.draw).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('Auto can resolve a published eligible custom style into a matching custom plan', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-finale-runtime-auto-custom-'));
    try {
      const { plugin } = createPlugin({}, tempDir);
      const repository = new RevisionedShowRepository({ dataDir: tempDir });
      repository.load();
      plugin.showRepository = repository;
      plugin.showRepositoryLoadError = null;
      const customId = publishCustom(repository, '00000000-0000-4000-8000-000000000409');
      plugin.finaleShuffleBag = { draw: jest.fn(() => customId) };

      const finale = plugin.triggerFinale({ style: 'auto', seed: 409, id: 'auto-custom' });

      expect(finale.style).toBe(customId);
      expect(finale.showPlan).toMatchObject({ style: customId, definitionId: customId });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('uses a different available configured custom style before falling back to Auto', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-finale-runtime-global-custom-'));
    try {
      const repository = new RevisionedShowRepository({ dataDir: tempDir });
      repository.load();
      const globalCustomId = publishCustom(repository, '00000000-0000-4000-8000-000000000410');
      const { plugin } = createPlugin({ goalFinaleStyle: globalCustomId }, tempDir);
      plugin.showRepository = repository;
      plugin.showRepositoryLoadError = null;
      plugin.finaleShuffleBag = { draw: jest.fn(() => 'sky-ballet') };

      const finale = plugin.triggerFinale({
        style: 'custom:00000000-0000-4000-8000-000000000411',
        seed: 410,
        id: 'global-custom-fallback'
      });

      expect(finale.style).toBe(globalCustomId);
      expect(finale.showPlan.style).toBe(globalCustomId);
      expect(plugin.finaleShuffleBag.draw).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('uses Auto when a different configured custom style is also unavailable', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-finale-runtime-global-missing-'));
    try {
      const configuredId = 'custom:00000000-0000-4000-8000-000000000412';
      const { plugin } = createPlugin({ goalFinaleStyle: configuredId }, tempDir);
      const repository = new RevisionedShowRepository({ dataDir: tempDir });
      repository.load();
      plugin.showRepository = repository;
      plugin.showRepositoryLoadError = null;
      plugin.finaleShuffleBag = { draw: jest.fn(() => 'sky-ballet') };

      const finale = plugin.triggerFinale({
        style: 'custom:00000000-0000-4000-8000-000000000413',
        seed: 412,
        id: 'global-missing-fallback'
      });

      expect(finale.style).toBe('sky-ballet');
      expect(finale.showPlan.style).toBe('sky-ballet');
      expect(plugin.finaleShuffleBag.draw).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('falls back instead of throwing when a published custom show lacks the requested variant', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-finale-runtime-variant-'));
    try {
      const { api, plugin } = createPlugin({ goalFinaleStyle: 'classic-crescendo' }, tempDir);
      const repository = new RevisionedShowRepository({ dataDir: tempDir });
      repository.load();
      repository.idFactory = () => '00000000-0000-4000-8000-000000000414';
      const longOnly = clone(BUILT_IN_SHOW_DEFINITIONS['classic-crescendo']);
      delete longOnly.variants.short;
      delete longOnly.variants.medium;
      const created = repository.create(longOnly);
      repository.validate(created.id, created.revision);
      repository.publish(created.id, created.revision);
      plugin.showRepository = repository;
      plugin.showRepositoryLoadError = null;

      let finale;
      expect(() => {
        finale = plugin.triggerFinale({
          style: created.id,
          length: 'short',
          seed: 414,
          id: 'missing-custom-variant'
        });
      }).not.toThrow();
      expect(finale.style).toBe('classic-crescendo');
      expect(finale.showPlan.style).toBe('classic-crescendo');
      expect(api.log).toHaveBeenCalledWith(expect.stringContaining('CUSTOM_VARIANT_UNAVAILABLE'), 'warn');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
