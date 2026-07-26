const { createHash, randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const StreamMonstersDatabase = require('./backend/streammonsters/database');
const StreamMonstersEngine = require('./backend/streammonsters/game-engine');
const StreamMonstersRoutes = require('./backend/streammonsters/routes');
const StreamMonstersBattleService = require('./backend/streammonsters/battle-service');
const StreamMonstersChatCommands = require('./backend/streammonsters/chat-commands');
const StreamMonstersCommandIngress = require('./backend/streammonsters/command-ingress');
const StreamMonstersProgressionService = require('./backend/streammonsters/progression-service');
const KenneyMonsterBuilder = require('./backend/streammonsters/kenney-monster-builder');
const StreamMonstersCollectionService = require('./backend/streammonsters/collection-service');
const { normalizeGiftName } = require('./backend/streammonsters/gift-name');

const RUNTIME_TRUST_FIELDS = new Set([
  'manifest', 'archiveUrl', 'sha256', 'modelSha256', 'archiveType',
  'executableRelativePath', 'executableArgs', 'comfyRootRelativePath',
  'healthBaseUrl', 'healthUrl', 'downloadSizeBytes', 'modelSizeBytes'
]);
const STREAM_MONSTERS_RULES_VERSION = 5;
const LEGACY_HATCH_DURATION_MS = 30 * 60 * 1000;
const DEFAULT_HATCH_DURATION_MS = 2 * 60 * 1000;
const INCUBATION_PRESETS_MS = Object.freeze([
  30_000,
  60_000,
  120_000,
  300_000,
  600_000,
  1_800_000
]);
const EGG_EXPIRY_PRESETS_MS = Object.freeze([
  21_600_000,
  43_200_000,
  86_400_000,
  172_800_000
]);
const DEFAULT_LAYOUTS = Object.freeze({
  portrait: Object.freeze({ anchor: 'top-center', scale: 100 }),
  landscape: Object.freeze({ anchor: 'bottom-center', scale: 100 })
});
const DEFAULT_AUDIO_CHANNELS = Object.freeze({
  master: Object.freeze({ enabled: true, volume: 1 }),
  ui: Object.freeze({ enabled: true, volume: 0.8 }),
  egg: Object.freeze({ enabled: true, volume: 0.9 }),
  battle: Object.freeze({ enabled: true, volume: 1 }),
  reward: Object.freeze({ enabled: true, volume: 0.9 })
});
const DEFAULT_COMMAND_ALIASES = Object.freeze({
  eggs: Object.freeze({
    enabled: Object.freeze(['eier', 'eierliste', 'meineeier']),
    disabled: Object.freeze(['eggs'])
  }),
  hatch: Object.freeze({ enabled: Object.freeze(['hatch']), disabled: Object.freeze([]) }),
  inventory: Object.freeze({ enabled: Object.freeze(['inventory']), disabled: Object.freeze([]) }),
  monsters: Object.freeze({ enabled: Object.freeze(['monsters']), disabled: Object.freeze([]) }),
  monster: Object.freeze({ enabled: Object.freeze(['monster']), disabled: Object.freeze([]) }),
  choose: Object.freeze({ enabled: Object.freeze(['choose']), disabled: Object.freeze([]) }),
  battle: Object.freeze({ enabled: Object.freeze(['battle']), disabled: Object.freeze([]) }),
  leavebattle: Object.freeze({ enabled: Object.freeze(['leavebattle']), disabled: Object.freeze([]) }),
  rank: Object.freeze({ enabled: Object.freeze(['rank']), disabled: Object.freeze([]) }),
  quests: Object.freeze({ enabled: Object.freeze(['quests']), disabled: Object.freeze([]) }),
  monstershelp: Object.freeze({ enabled: Object.freeze(['monstershelp']), disabled: Object.freeze([]) })
});

class StreamAlchemyPlugin {
  constructor(api) {
    this.api = api;
    this.pluginDir = api.pluginDir || __dirname;
    this.config = null;
  }

  async init() {
    this.api.log('[STREAM MONSTERS] Initializing Collector Arena runtime', 'info');
    const storedConfig = this.api.getConfig('streamalchemy_config');
    this.config = this.loadConfig(storedConfig);
    this.persistSanitizedConfigIfNeeded(storedConfig);

    const logger = {
      info: msg => this.api.log(msg, 'info'),
      warn: msg => this.api.log(msg, 'warn'),
      error: msg => this.api.log(msg, 'error'),
      debug: msg => this.api.log(msg, 'debug')
    };

    this.streamMonstersStore = new StreamMonstersDatabase(this.api.getDatabase());
    this.streamMonstersStore.initialize();
    this.streamMonstersProgression = new StreamMonstersProgressionService({
      store: this.streamMonstersStore,
      emit: (event, payload) => this.api.emit(event, payload)
    });
    this.streamMonstersCollection = new StreamMonstersCollectionService({
      store: this.streamMonstersStore,
      emit: (event, payload) => this.api.emit(event, payload)
    });
    this.streamMonstersEngine = new StreamMonstersEngine({
      store: this.streamMonstersStore,
      progression: this.streamMonstersProgression,
      collection: this.streamMonstersCollection,
      emit: (event, payload) => this.api.emit(event, payload),
      config: this.config.streamMonsters
    });
    this.ensureDefaultStreamMonstersGiftMapping();
    this.streamMonstersBattleService = new StreamMonstersBattleService({ store: this.streamMonstersStore });
    this.streamMonstersChatCommands = new StreamMonstersChatCommands({
      store: this.streamMonstersStore,
      engine: this.streamMonstersEngine,
      battleService: this.streamMonstersBattleService,
      progression: this.streamMonstersProgression,
      collection: this.streamMonstersCollection,
      emit: (event, payload) => this.api.emit(event, payload)
    });
    this.streamMonstersCommandPrefix = '!';
    this.streamMonstersGCCERegistrationState = 'fallback';
    this.streamMonstersGCCERegistrationError = null;
    this.streamMonstersGCCELifecycleListeners = [];
    this.streamMonstersCommandIngress = new StreamMonstersCommandIngress({
      execute: (context, commandName, args) => this.streamMonstersChatCommands.execute(context, commandName, args),
      emit: (event, payload) => this.api.emit(event, payload),
      commandPrefix: this.streamMonstersCommandPrefix,
      resolveUserId: data => this.resolveStreamMonstersViewerId({
        platformUserId: data.userId,
        legacyUserId: data.uniqueId || data.username
      })
    });
    this.streamMonstersCommandIngress.setCommands(
      this.buildStreamMonstersCommandDefinitions(this.streamMonstersCommandPrefix),
      this.streamMonstersCommandPrefix
    );
    this.streamMonstersKenneyBuilder = new KenneyMonsterBuilder({
      assetDir: path.join(this.pluginDir, 'assets', 'kenney-monster-builder'),
      dataDir: this.getPluginDataDir(),
      logger
    });
    this.streamMonstersEngine.kenneyBuilder = this.streamMonstersKenneyBuilder;
    this.streamMonstersEngine.hasBundledAsset = template => fs.existsSync(
      path.join(this.pluginDir, 'assets', 'streammonsters', 'furry', `${template.templateId}.png`)
    );

    this.streamMonstersRoutes = new StreamMonstersRoutes({
      api: this.api,
      pluginDir: this.pluginDir,
      dataDir: this.getPluginDataDir(),
      store: this.streamMonstersStore,
      engine: this.streamMonstersEngine,
      progression: this.streamMonstersProgression,
      collection: this.streamMonstersCollection,
      giftCatalogProvider: locale => this.getStreamMonstersGiftCatalog(locale),
      gcceStateProvider: () => this.getStreamMonstersGCCEState(),
      configProvider: {
        getConfig: () => this.config,
        updateConfig: updates => this.updateConfig(updates)
      }
    });
    this.streamMonstersRoutes.register();
    this.setupStreamMonstersGCCELifecycle();
    this.integrateStreamMonstersGCCE();

    this.api.registerTikTokEvent('gift', async data => {
      if (!this.config.enabled || !this.config.streamMonsters.enabled) return;
      await this.handleStreamMonstersGift(data);
    });
    this.api.registerTikTokEvent('chat', async data => {
      if (!this.config.enabled || !this.config.streamMonsters.enabled) return;
      await this.handleStreamMonstersChat(data);
    });
    this.api.registerTikTokEvent('streamSessionStarted', async data => {
      if (!this.config.enabled || !this.config.streamMonsters.enabled) return;
      await this.handleStreamMonstersSession(data);
    });
    this.streamMonstersReadyTimer = setInterval(() => {
      try {
        if (!this.config.enabled || !this.config.streamMonsters.enabled) return;
        this.streamMonstersEngine.markReadyEggs();
      } catch (error) {
        this.api.log(`[STREAM MONSTERS] Ready timer failed: ${error.message}`, 'warn');
      }
    }, 1_000);
    this.streamMonstersReadyTimer.unref?.();

    this.api.log('[STREAM MONSTERS] Collector Arena runtime initialized', 'info');
  }

  loadConfig(storedConfig = this.api.getConfig('streamalchemy_config')) {
    const stored = this.sanitizeConfig(storedConfig);
    const storedStreamMonsters = stored.streamMonsters || {};
    const rulesVersionMissing = storedStreamMonsters.rulesVersion == null;
    const hatchDurationMs = rulesVersionMissing &&
      storedStreamMonsters.hatchDurationMs === LEGACY_HATCH_DURATION_MS
      ? DEFAULT_HATCH_DURATION_MS
      : (storedStreamMonsters.hatchDurationMs ?? DEFAULT_HATCH_DURATION_MS);
    return {
      enabled: true,
      ...stored,
      streamMonsters: {
        enabled: true,
        creatorName: '',
        hatchDurationMs: DEFAULT_HATCH_DURATION_MS,
        incubationPresetsMs: [...INCUBATION_PRESETS_MS],
        eggExpiryMs: 86_400_000,
        eggExpiryPresetsMs: [...EGG_EXPIRY_PRESETS_MS],
        seasonDurationDays: 28,
        commandAliases: this.normalizeCommandAliases(),
        layouts: this.normalizeLayouts(),
        rendererQuality: 'auto',
        notificationDurationMs: 12_000,
        audioChannels: this.normalizeAudioChannels(),
        maxUnhatchedEggs: 3,
        elementRules: 'deterministic',
        giftMappingCustomized: false,
        visualPack: 'furry',
        ...storedStreamMonsters,
        rulesVersion: STREAM_MONSTERS_RULES_VERSION,
        hatchDurationMs,
        incubationPresetsMs: [...INCUBATION_PRESETS_MS],
        eggExpiryMs: EGG_EXPIRY_PRESETS_MS.includes(Number(storedStreamMonsters.eggExpiryMs))
          ? Number(storedStreamMonsters.eggExpiryMs)
          : 86_400_000,
        eggExpiryPresetsMs: [...EGG_EXPIRY_PRESETS_MS],
        seasonDurationDays: this.normalizeSeasonDuration(storedStreamMonsters.seasonDurationDays),
        commandAliases: this.normalizeCommandAliases(storedStreamMonsters.commandAliases),
        layouts: this.normalizeLayouts(storedStreamMonsters.layouts),
        rendererQuality: this.normalizeRendererQuality(storedStreamMonsters.rendererQuality),
        notificationDurationMs: this.normalizeNotificationDuration(
          storedStreamMonsters.notificationDurationMs
        ),
        audioChannels: this.normalizeAudioChannels(storedStreamMonsters.audioChannels),
        visualPack: 'furry'
      }
    };
  }

  persistSanitizedConfigIfNeeded(storedConfig) {
    if (!storedConfig || typeof storedConfig !== 'object' || Array.isArray(storedConfig)) return false;
    if (JSON.stringify(storedConfig) === JSON.stringify(this.config)) return false;
    this.api.setConfig('streamalchemy_config', this.config);
    return true;
  }

  sanitizeConfig(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const safe = {};
    for (const [key, value] of Object.entries(input)) {
      if (key === 'streamMonsters') {
        safe.streamMonsters = this.sanitizeStreamMonstersConfig(value);
      } else if (key !== 'localRuntime' && !RUNTIME_TRUST_FIELDS.has(key)) {
        safe[key] = value;
      }
    }
    return safe;
  }

  sanitizeStreamMonstersConfig(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const safe = {};
    for (const [key, value] of Object.entries(input)) {
      if (key === 'localRuntime') {
        safe.localRuntime = this.sanitizeLocalRuntime(value);
      } else if (!RUNTIME_TRUST_FIELDS.has(key)) {
        safe[key] = value;
      }
    }
    return safe;
  }

  sanitizeLocalRuntime(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const safe = {};
    for (const key of ['state', 'runtimeRoot']) {
      const value = input[key];
      if (Object.prototype.hasOwnProperty.call(input, key) && typeof value === 'string' && value.trim()) {
        safe[key] = value;
      }
    }
    return safe;
  }

  normalizeSeasonDuration(value) {
    const duration = Number(value);
    return [7, 14, 28, 60, 90].includes(duration) ? duration : 28;
  }

  normalizeRendererQuality(value) {
    return ['auto', 'high', 'medium', 'low'].includes(value) ? value : 'auto';
  }

  normalizeNotificationDuration(value) {
    const duration = Number(value);
    return Number.isFinite(duration) && duration >= 8_000 && duration <= 30_000
      ? Math.round(duration)
      : 12_000;
  }

  normalizeLayouts(input = {}) {
    const anchors = new Set([
      'top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right'
    ]);
    const normalize = (name, defaults) => {
      const candidate = input?.[name];
      const anchor = anchors.has(candidate?.anchor) ? candidate.anchor : defaults.anchor;
      const rawScale = Number(candidate?.scale);
      const scale = Number.isFinite(rawScale) && rawScale >= 70 && rawScale <= 130
        ? rawScale
        : defaults.scale;
      return { anchor, scale };
    };
    return {
      portrait: normalize('portrait', DEFAULT_LAYOUTS.portrait),
      landscape: normalize('landscape', DEFAULT_LAYOUTS.landscape)
    };
  }

  normalizeAudioChannels(input = {}) {
    return Object.fromEntries(Object.entries(DEFAULT_AUDIO_CHANNELS).map(([name, defaults]) => {
      const channel = input?.[name];
      const volume = Number(channel?.volume);
      return [name, {
        enabled: typeof channel?.enabled === 'boolean' ? channel.enabled : defaults.enabled,
        volume: Number.isFinite(volume) && volume >= 0 && volume <= 1
          ? Math.round(volume * 100) / 100
          : defaults.volume
      }];
    }));
  }

  normalizeCommandAliases(input = {}) {
    const normalizeList = value => {
      if (!Array.isArray(value)) return [];
      return [...new Set(value.map(alias => String(alias).trim().toLocaleLowerCase())
        .filter(alias => /^[\p{L}\p{N}_-]{1,32}$/u.test(alias)))];
    };
    return Object.fromEntries(Object.entries(DEFAULT_COMMAND_ALIASES).map(([command, defaults]) => {
      const candidate = input?.[command];
      return [command, {
        enabled: candidate && Object.prototype.hasOwnProperty.call(candidate, 'enabled')
          ? normalizeList(candidate.enabled)
          : [...defaults.enabled],
        disabled: candidate && Object.prototype.hasOwnProperty.call(candidate, 'disabled')
          ? normalizeList(candidate.disabled)
          : [...defaults.disabled]
      }];
    }));
  }

  getPluginDataDir() {
    if (typeof this.api.ensurePluginDataDir === 'function') {
      return this.api.ensurePluginDataDir();
    }
    if (typeof this.api.getPluginDataDir === 'function') {
      return this.api.getPluginDataDir();
    }
    return this.pluginDir;
  }

  updateConfig(updates = {}) {
    const safeUpdates = this.sanitizeConfig(updates);
    const currentStreamMonsters = this.sanitizeStreamMonstersConfig(this.config.streamMonsters);
    const streamMonstersUpdates = this.sanitizeStreamMonstersConfig(safeUpdates.streamMonsters);
    const mergeNamedObjects = (current, next) => {
      const currentObject = current && typeof current === 'object' ? current : {};
      const nextObject = next && typeof next === 'object' ? next : {};
      return Object.fromEntries(
        [...new Set([...Object.keys(currentObject), ...Object.keys(nextObject)])]
          .map(name => [name, {
            ...(currentObject[name] && typeof currentObject[name] === 'object'
              ? currentObject[name]
              : {}),
            ...(nextObject[name] && typeof nextObject[name] === 'object'
              ? nextObject[name]
              : {})
          }])
      );
    };
    const mergedStreamMonsters = {
      ...currentStreamMonsters,
      ...streamMonstersUpdates,
      commandAliases: mergeNamedObjects(
        currentStreamMonsters.commandAliases,
        streamMonstersUpdates.commandAliases
      ),
      layouts: mergeNamedObjects(
        currentStreamMonsters.layouts,
        streamMonstersUpdates.layouts
      ),
      audioChannels: mergeNamedObjects(
        currentStreamMonsters.audioChannels,
        streamMonstersUpdates.audioChannels
      )
    };

    this.config = {
      ...this.config,
      ...safeUpdates,
      streamMonsters: {
        ...mergedStreamMonsters,
        rulesVersion: STREAM_MONSTERS_RULES_VERSION,
        incubationPresetsMs: [...INCUBATION_PRESETS_MS],
        eggExpiryMs: EGG_EXPIRY_PRESETS_MS.includes(Number(mergedStreamMonsters.eggExpiryMs))
          ? Number(mergedStreamMonsters.eggExpiryMs)
          : 86_400_000,
        eggExpiryPresetsMs: [...EGG_EXPIRY_PRESETS_MS],
        seasonDurationDays: this.normalizeSeasonDuration(mergedStreamMonsters.seasonDurationDays),
        commandAliases: this.normalizeCommandAliases(mergedStreamMonsters.commandAliases),
        layouts: this.normalizeLayouts(mergedStreamMonsters.layouts),
        rendererQuality: this.normalizeRendererQuality(mergedStreamMonsters.rendererQuality),
        notificationDurationMs: this.normalizeNotificationDuration(
          mergedStreamMonsters.notificationDurationMs
        ),
        audioChannels: this.normalizeAudioChannels(mergedStreamMonsters.audioChannels),
        visualPack: 'furry'
      }
    };
    this.api.setConfig('streamalchemy_config', this.config);
    if (this.streamMonstersEngine) {
      this.streamMonstersEngine.config = {
        ...this.streamMonstersEngine.config,
        ...this.config.streamMonsters
      };
    }
    if (
      this.streamMonstersCommandIngress &&
      (
        Object.prototype.hasOwnProperty.call(safeUpdates, 'enabled') ||
        Object.prototype.hasOwnProperty.call(streamMonstersUpdates, 'enabled')
      )
    ) {
      this.integrateStreamMonstersGCCE({ force: true });
    }
    return this.config;
  }

  async destroy() {
    if (this.streamMonstersReadyTimer) {
      clearInterval(this.streamMonstersReadyTimer);
      this.streamMonstersReadyTimer = null;
    }
    this.removeStreamMonstersGCCELifecycle();
    this.deactivateStreamMonstersGCCE();
    this.streamMonstersCommandIngress?.clear();
    this.streamMonstersEngine?.recentGifts?.clear?.();
    this.streamMonstersChatCommands?.queue?.splice?.(0);
    this.api.log('[STREAM MONSTERS] Collector Arena runtime stopped', 'info');
  }

  getStreamMonstersGiftCatalog(locale = null) {
    try {
      const database = this.api.getDatabase();
      if (typeof database?.getGiftCatalog === 'function') return database.getGiftCatalog(locale) || [];
      const sqlite = database?.db || database;
      if (!sqlite?.prepare) return [];
      return sqlite.prepare(`
        SELECT id, name, image_url, diamond_count
        FROM gift_catalog
        ORDER BY diamond_count DESC, id ASC
      `).all();
    } catch (error) {
      this.api.log(`[STREAM MONSTERS] Gift catalog unavailable: ${error.message}`, 'debug');
      return [];
    }
  }

  normalizeStreamMonstersGiftName(name) {
    return normalizeGiftName(name);
  }

  ensureDefaultStreamMonstersGiftMapping(gift = null) {
    if (
      this.config?.streamMonsters?.giftMappingCustomized ||
      this.streamMonstersStore?.hasGiftMappings?.()
    ) {
      return null;
    }
    const candidate = gift || this.getStreamMonstersGiftCatalog().find(item => (
      this.normalizeStreamMonstersGiftName(item.name || item.gift_name) === 'heartme'
    ));
    const giftId = Number.parseInt(candidate?.id ?? candidate?.gift_id ?? candidate?.giftId, 10);
    if (!giftId || this.normalizeStreamMonstersGiftName(candidate?.name || candidate?.gift_name || candidate?.giftName) !== 'heartme') {
      return null;
    }
    return this.streamMonstersStore.upsertGiftMapping({
      giftId,
      giftName: candidate.name || candidate.gift_name || candidate.giftName,
      coinValue: Number(candidate.diamond_count ?? candidate.coin_value ?? candidate.coinValue ?? 0),
      imageUrl: candidate.image_url || candidate.imageUrl || null,
      effect: 'spawn',
      element: 'Random',
      enabled: true
    });
  }

  buildStreamMonstersCommandDefinitions(commandPrefix = this.streamMonstersCommandPrefix) {
    return [
      ['adopt', 'Claim your one-time Stream Monsters starter egg', 0, 0],
      ['eggs', 'Show your Stream Monsters eggs', 0, 0],
      ['hatch', 'Hatch a ready egg by slot', 0, 1],
      ['inventory', 'Show your Stream Monsters inventory', 0, 0],
      ['monsters', 'Show your Stream Monsters', 0, 0],
      ['monster', 'Show one monster by slot', 1, 1],
      ['choose', 'Choose a monster by slot', 1, 1],
      ['battle', 'Join the public Stream Monsters battle queue with an optional stance', 0, 1],
      ['leavebattle', 'Leave the Stream Monsters battle queue', 0, 0],
      ['rank', 'Show the current Collector Arena rank', 0, 0],
      ['quests', 'Show daily and weekly quests', 0, 0],
      ['monstershelp', 'Show Stream Monsters commands', 0, 0]
    ].map(([name, description, minArgs, maxArgs]) => ({
      name,
      description,
      syntax: name === 'battle'
        ? `${commandPrefix}${name} [power|guard|speed]`
        : `${commandPrefix}${name}${minArgs ? ' <slot>' : ''}`,
      permission: 'all',
      enabled: true,
      minArgs,
      maxArgs,
      category: 'Stream Monsters',
      cooldown: { user: name === 'battle' ? 2000 : 1000, global: name === 'battle' ? 0 : 250 },
      handler: async (args, context = {}) => this.streamMonstersCommandIngress.executeCommand(
        name,
        Array.isArray(args) ? args : [],
        {
          ...context,
          userId: this.resolveStreamMonstersViewerId({
            platformUserId: context.rawData?.userId,
            legacyUserId: context.rawData?.uniqueId ||
              context.uniqueId ||
              context.userId ||
              context.username
          }),
          username: context.username || context.nickname || context.uniqueId || context.userId
        },
        'gcce'
      )
    }));
  }

  getStreamMonstersGCCEState() {
    return {
      commandPrefix: this.streamMonstersCommandPrefix,
      registrationState: this.streamMonstersGCCERegistrationState,
      registrationError: this.streamMonstersGCCERegistrationError,
      commandsRegistered: this.streamMonstersGCCERegistrationState === 'active'
    };
  }

  resolveStreamMonstersGCCE(candidate = null) {
    return candidate || this.api.pluginLoader?.loadedPlugins?.get('gcce')?.instance || null;
  }

  resolveStreamMonstersCommandPrefix(gcce) {
    const configured = gcce?.parser?.commandPrefix || gcce?.pluginConfig?.commandPrefix;
    return typeof configured === 'string' && configured.length > 0
      ? configured
      : this.streamMonstersCommandPrefix;
  }

  integrateStreamMonstersGCCE({ force = false, candidate = null } = {}) {
    const gcce = this.resolveStreamMonstersGCCE(candidate);
    const commandPrefix = this.resolveStreamMonstersCommandPrefix(gcce);
    this.streamMonstersCommandPrefix = commandPrefix;
    const definitions = this.buildStreamMonstersCommandDefinitions(commandPrefix);
    this.streamMonstersCommandIngress.setCommands(definitions, commandPrefix);

    const streamMonstersEnabled = Boolean(this.config?.enabled && this.config?.streamMonsters?.enabled);
    const gcceEnabled = gcce?.pluginConfig?.enabled !== false;
    const gcceAvailable = Boolean(gcce?.registerCommandsForPlugin && gcce?.unregisterCommandsForPlugin);
    if (!streamMonstersEnabled || !gcceEnabled || !gcceAvailable) {
      this.deactivateStreamMonstersGCCE();
      return false;
    }
    if (!force && this.streamMonstersGCCE === gcce && this.streamMonstersGCCERegistrationState === 'active') {
      return true;
    }

    if (this.streamMonstersGCCE && this.streamMonstersGCCE !== gcce) {
      this.deactivateStreamMonstersGCCE();
    }

    try {
      gcce.unregisterCommandsForPlugin('streamalchemy');
      const result = gcce.registerCommandsForPlugin('streamalchemy', definitions);
      const registered = Array.isArray(result?.registered) ? result.registered : [];
      if (registered.length !== definitions.length) {
        gcce.unregisterCommandsForPlugin('streamalchemy');
        this.streamMonstersGCCE = gcce;
        this.streamMonstersGCCERegistrationState = 'blocked';
        this.streamMonstersGCCERegistrationError = 'partial_registration';
        return false;
      }
      this.streamMonstersGCCE = gcce;
      this.streamMonstersGCCERegistrationState = 'active';
      this.streamMonstersGCCERegistrationError = null;
      return true;
    } catch (error) {
      this.api.log(`[STREAM MONSTERS] GCCE registration failed: ${error.message}`, 'warn');
      try {
        gcce.unregisterCommandsForPlugin('streamalchemy');
      } catch (cleanupError) {
        this.api.log(`[STREAM MONSTERS] GCCE registration rollback failed: ${cleanupError.message}`, 'debug');
      }
      this.streamMonstersGCCE = gcce;
      this.streamMonstersGCCERegistrationState = 'blocked';
      this.streamMonstersGCCERegistrationError = 'registration_failed';
      return false;
    }
  }

  deactivateStreamMonstersGCCE() {
    if (this.streamMonstersGCCE?.unregisterCommandsForPlugin) {
      try {
        this.streamMonstersGCCE.unregisterCommandsForPlugin('streamalchemy');
      } catch (error) {
        this.api.log(`[STREAM MONSTERS] GCCE cleanup failed: ${error.message}`, 'debug');
      }
    }
    this.streamMonstersGCCE = null;
    this.streamMonstersGCCERegistrationState = 'fallback';
    this.streamMonstersGCCERegistrationError = null;
  }

  setupStreamMonstersGCCELifecycle() {
    if (this.streamMonstersGCCELifecycleListeners.length || typeof this.api.on !== 'function') return;
    const pluginId = payload => typeof payload === 'string' ? payload : payload?.id;
    const activate = (eventName, payload) => {
      if (eventName !== 'gcce:ready' && pluginId(payload) !== 'gcce') return;
      this.integrateStreamMonstersGCCE({
        force: eventName === 'plugin:reloaded',
        candidate: payload?.instance || null
      });
    };
    const deactivate = payload => {
      if (pluginId(payload) === 'gcce') this.deactivateStreamMonstersGCCE();
    };
    const listeners = [
      ['gcce:ready', payload => activate('gcce:ready', payload)],
      ['plugin:loaded', payload => activate('plugin:loaded', payload)],
      ['plugin:enabled', payload => activate('plugin:enabled', payload)],
      ['plugin:reloaded', payload => activate('plugin:reloaded', payload)],
      ['plugin:unloaded', deactivate],
      ['plugin:disabled', deactivate],
      ['gcce:command_result', payload => this.handleStreamMonstersGCCECommandResult(payload)]
    ];
    listeners.forEach(([event, callback]) => {
      if (this.api.on(event, callback)) this.streamMonstersGCCELifecycleListeners.push({ event, callback });
    });
  }

  removeStreamMonstersGCCELifecycle() {
    this.streamMonstersGCCELifecycleListeners.forEach(({ event, callback }) => {
      if (typeof this.api.removeListener === 'function') this.api.removeListener(event, callback);
    });
    this.streamMonstersGCCELifecycleListeners = [];
  }

  handleStreamMonstersGCCECommandResult(payload = {}) {
    if (payload.pluginId !== 'streamalchemy') return;
    const statuses = {
      VALIDATION_ERROR: 'invalid_arguments',
      PERMISSION_DENIED: 'permission_denied',
      RATE_LIMIT_USER: 'rate_limited',
      RATE_LIMIT_GLOBAL: 'rate_limited',
      COMMAND_DISABLED: 'command_disabled',
      EXECUTION_FAILED: 'execution_failed',
      COMMAND_ON_COOLDOWN: payload.cooldownType === 'global' ? 'global_cooldown' : 'cooldown'
    };
    const status = statuses[payload.errorCode];
    if (!status) return;
    const result = {
      success: false,
      status,
      errorCode: payload.errorCode,
      message: payload.error
    };
    this.streamMonstersCommandIngress.emitResult(
      payload.commandName,
      {
        userId: payload.userId,
        username: payload.username
      },
      result,
      'gcce'
    );
  }

  resolveStreamMonstersViewerId({ platformUserId = null, legacyUserId = null } = {}) {
    return this.streamMonstersStore.resolveViewerIdentity({
      platformUserId,
      legacyUserId,
      updatedAtMs: Date.now()
    }) || legacyUserId || platformUserId;
  }

  opaqueViewerRef(viewerId) {
    if (!viewerId) return null;
    const digest = createHash('sha256')
      .update(`streammonsters:v5:${String(viewerId)}`)
      .digest('hex')
      .slice(0, 16);
    return `viewer:${digest}`;
  }

  logStructured(event, {
    correlationId = randomUUID(),
    viewerId = null,
    status = 'ok',
    count = null
  } = {}, level = 'info') {
    const payload = {
      component: 'streammonsters',
      event,
      correlationId,
      status
    };
    const viewerRef = this.opaqueViewerRef(viewerId);
    if (viewerRef) payload.viewerRef = viewerRef;
    if (Number.isInteger(count) && count >= 0) payload.count = count;
    this.api.log(JSON.stringify(payload), level);
    return correlationId;
  }

  async handleStreamMonstersGift(data = {}) {
    const correlationId = randomUUID();
    const userId = this.resolveStreamMonstersViewerId({
      platformUserId: data.userId,
      legacyUserId: data.uniqueId || data.username
    });
    const giftId = Number.parseInt(data.giftId, 10);
    const giftName = data.giftName || data.name;
    const coinValue = Number.parseInt(data.diamondCount ?? data.coins ?? 0, 10) || 0;
    const repeatCount = Math.max(Number.parseInt(data.repeatCount || 1, 10) || 1, 1);
    if (!userId || !giftId || !giftName) {
      this.logStructured('gift_ignored', {
        correlationId,
        viewerId: userId,
        status: 'invalid'
      }, 'warn');
      return;
    }
    if (!this.streamMonstersStore.getGiftMapping(giftId) && !this.config.streamMonsters.giftMappingCustomized) {
      this.ensureDefaultStreamMonstersGiftMapping({
        id: giftId,
        name: giftName,
        diamond_count: coinValue
      });
    }
    for (let index = 0; index < repeatCount; index += 1) {
      this.streamMonstersEngine.processGift({ userId, giftId, giftName, coinValue });
    }
    this.logStructured('gift_processed', {
      correlationId,
      viewerId: userId,
      count: repeatCount
    });
  }

  async handleStreamMonstersChat(data = {}) {
    const correlationId = randomUUID();
    if (this.streamMonstersGCCERegistrationState !== 'fallback') {
      const result = {
        success: false,
        status: this.streamMonstersGCCERegistrationState === 'active' ? 'gcce_active' : 'gcce_blocked'
      };
      this.logStructured('chat_ignored', {
        correlationId,
        viewerId: data.userId || data.uniqueId,
        status: result.status
      }, 'debug');
      return result;
    }
    const result = await this.streamMonstersCommandIngress.handleFallback(data);
    this.logStructured('chat_processed', {
      correlationId,
      viewerId: data.userId || data.uniqueId,
      status: result?.status || (result?.success ? 'ok' : 'ignored')
    }, 'debug');
    return result;
  }

  async handleStreamMonstersSession(data = {}) {
    const creatorName = data.username || data.uniqueId || null;
    if (!this.config.streamMonsters.creatorName && creatorName) {
      this.updateConfig({ streamMonsters: { creatorName } });
    }
    const streamKey = data.streamIdentity || `${creatorName || 'creator'}:${data.streamSessionId || data.roomId || 'session'}`;
    const event = this.streamMonstersProgression.startStreamSession({ streamKey });
    this.streamMonstersEngine.setStreamKey(streamKey);
    this.api.emit('streammonsters:stream_started', {
      creatorName: this.config.streamMonsters.creatorName || 'Creator',
      event
    });
    this.logStructured('stream_session_started', { status: 'ok' });
  }

  selectStreamEvent(data = {}) {
    const elements = ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'];
    const source = String(data.streamSessionId || data.roomId || new Date().toISOString().slice(0, 10));
    let hash = 0;
    for (const char of source) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
    return { id: `elemental-hour:${hash % elements.length}`, element: elements[hash % elements.length], boostMultiplier: 2 };
  }
}

module.exports = StreamAlchemyPlugin;
