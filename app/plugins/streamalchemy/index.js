const { createHash, randomUUID } = require('crypto');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const StreamMonstersDatabase = require('./backend/streammonsters/database');
const StreamMonstersEngine = require('./backend/streammonsters/game-engine');
const StreamMonstersRoutes = require('./backend/streammonsters/routes');
const StreamMonstersBattleService = require('./backend/streammonsters/battle-service');
const StreamMonstersBattleMatchService = require('./backend/streammonsters/battle-match-service');
const StreamMonstersChatCommands = require('./backend/streammonsters/chat-commands');
const StreamMonstersCommandIngress = require('./backend/streammonsters/command-ingress');
const FreeEggDropService = require('./backend/streammonsters/free-egg-drop-service');
const StreamMonstersPublicEventProjector = require(
  './backend/streammonsters/public-event-projector'
);
const StreamMonstersProgressionService = require('./backend/streammonsters/progression-service');
const KenneyMonsterBuilder = require('./backend/streammonsters/kenney-monster-builder');
const StreamMonstersAssetRegistry = require('./backend/streammonsters/asset-registry');
const StreamMonstersCollectionService = require('./backend/streammonsters/collection-service');
const { normalizeGiftName, isHeartMeGift } = require('./backend/streammonsters/gift-name');

const RETIRED_RUNTIME_TRUST_FIELDS = new Set([
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
const BATTLE_SOCKET_ALIASES = Object.freeze({
  'streammonsters:battle_choice_opened': 'streammonsters:battle_skill_prompt',
  'streammonsters:battle_choice_locked': 'streammonsters:battle_skill_locked',
  'streammonsters:battle_skill_used': 'streammonsters:battle_action'
});
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
  evolve: Object.freeze({ enabled: Object.freeze(['evolve']), disabled: Object.freeze([]) }),
  battle: Object.freeze({ enabled: Object.freeze(['battle']), disabled: Object.freeze([]) }),
  leavebattle: Object.freeze({ enabled: Object.freeze(['leavebattle']), disabled: Object.freeze([]) }),
  rank: Object.freeze({ enabled: Object.freeze(['rank', 'monsterrank']), disabled: Object.freeze([]) }),
  quests: Object.freeze({ enabled: Object.freeze(['quests']), disabled: Object.freeze([]) }),
  adopt: Object.freeze({ enabled: Object.freeze(['adopt', 'adoptieren']), disabled: Object.freeze([]) }),
  monstershelp: Object.freeze({ enabled: Object.freeze(['monstershelp']), disabled: Object.freeze([]) })
});

class StreamAlchemyPlugin {
  constructor(api) {
    this.api = api;
    this.pluginDir = api.pluginDir || __dirname;
    this.config = null;
    this.retiredConfigArchive = {};
    this.streamMonstersPublicEventProjector =
      new StreamMonstersPublicEventProjector();
  }

  async init() {
    this.api.log('[STREAM MONSTERS] Initializing League World Hybrid runtime', 'info');
    const storedConfig = this.api.getConfig('streamalchemy_config');
    this.config = this.loadConfig(storedConfig);
    this.persistSanitizedConfigIfNeeded(storedConfig);

    const logger = {
      info: msg => this.api.log(msg, 'info'),
      warn: msg => this.api.log(msg, 'warn'),
      error: msg => this.api.log(msg, 'error'),
      debug: msg => this.api.log(msg, 'debug')
    };

    this.streamMonstersKenneyBuilder = new KenneyMonsterBuilder({
      assetDir: path.join(this.pluginDir, 'assets', 'kenney-monster-builder'),
      dataDir: this.getPluginDataDir(),
      logger
    });
    this.streamMonstersAssetRegistry = new StreamMonstersAssetRegistry({
      pluginDir: this.pluginDir,
      kenneyBuilder: this.streamMonstersKenneyBuilder,
      logger
    });
    this.streamMonstersStore = new StreamMonstersDatabase(this.api.getDatabase(), {
      logger,
      assetRegistry: this.streamMonstersAssetRegistry
    });
    this.streamMonstersStore.initialize();
    this.streamMonstersPublicEventProjector =
      new StreamMonstersPublicEventProjector({ store: this.streamMonstersStore });
    this.streamMonstersProgression = new StreamMonstersProgressionService({
      store: this.streamMonstersStore,
      emit: (event, payload) => this.emitStreamMonsters(event, payload),
      seasonDurationDays: this.config.streamMonsters.seasonDurationDays
    });
    this.streamMonstersCollection = new StreamMonstersCollectionService({
      store: this.streamMonstersStore,
      progression: this.streamMonstersProgression,
      assetRegistry: this.streamMonstersAssetRegistry,
      emit: (event, payload) => this.emitStreamMonsters(event, payload)
    });
    this.streamMonstersEngine = new StreamMonstersEngine({
      store: this.streamMonstersStore,
      progression: this.streamMonstersProgression,
      collection: this.streamMonstersCollection,
      emit: (event, payload) => this.emitStreamMonsters(event, payload),
      getCommandReference: command => this.getStreamMonstersCommandReference(command),
      config: this.config.streamMonsters
    });
    this.streamMonstersFreeEggDrops = new FreeEggDropService({
      store: this.streamMonstersStore,
      engine: this.streamMonstersEngine,
      emit: (event, payload) => this.emitStreamMonsters(event, payload),
      config: this.config.streamMonsters
    });
    this.ensureDefaultStreamMonstersGiftMapping();
    this.streamMonstersBattleService = new StreamMonstersBattleService({ store: this.streamMonstersStore });
    this.streamMonstersBattleMatchService = new StreamMonstersBattleMatchService({
      store: this.streamMonstersStore,
      battleService: this.streamMonstersBattleService,
      progression: this.streamMonstersProgression,
      collection: this.streamMonstersCollection,
      assetRegistry: this.streamMonstersAssetRegistry,
      emit: (event, payload) => this.emitStreamMonsters(event, payload),
      getStreamKey: () => this.streamMonstersEngine?.streamKey || null,
      logger,
      seasonDurationDays: this.config.streamMonsters.seasonDurationDays
    });
    this.streamMonstersProgression.setMonsterProgressHandler(({
      userId,
      monster,
      levelsGained,
      sourceKey
    }) => {
      this.emitStreamMonsters('streammonsters:monster_level_up', {
        userId,
        levelsGained,
        monster
      });
      this.streamMonstersBattleMatchService.createStandaloneStatPrompt({
        userId,
        monsterId: monster.monster_id,
        sourceKey
      });
    });
    this.streamMonstersChatCommands = new StreamMonstersChatCommands({
      store: this.streamMonstersStore,
      engine: this.streamMonstersEngine,
      battleService: this.streamMonstersBattleService,
      battleMatchService: this.streamMonstersBattleMatchService,
      progression: this.streamMonstersProgression,
      collection: this.streamMonstersCollection,
      freeEggDropService: this.streamMonstersFreeEggDrops,
      emit: (event, payload) => this.emitStreamMonsters(event, payload),
      getCommandReference: command => this.getStreamMonstersCommandReference(command)
    });
    this.streamMonstersCommandPrefix = '!';
    this.streamMonstersGCCERegistrationState = 'fallback';
    this.streamMonstersGCCERegistrationError = null;
    this.streamMonstersGCCERegistrationConflicts = [];
    this.streamMonstersGCCERegisteredCommands = [];
    this.streamMonstersGCCEUnavailableCommands = [];
    this.streamMonstersGCCELifecycleListeners = [];
    this.streamMonstersCommandIngress = new StreamMonstersCommandIngress({
      execute: (context, commandName, args) => this.streamMonstersChatCommands.execute(context, commandName, args),
      emit: (event, payload) => this.emitStreamMonsters(event, payload),
      commandPrefix: this.streamMonstersCommandPrefix,
      resolveUserId: data => this.resolveStreamMonstersViewerId({
        platformUserId: data.userId,
        legacyUserId: data.uniqueId || data.username
      }),
      onResolved: entry => this.logStructured('alias_resolved', {
        viewerId: entry.userId,
        command: entry.commandName,
        alias: entry.alias,
        transport: entry.transport
      }, 'debug'),
      onError: entry => this.logStructured(
        entry.commandName === 'hatch' ? 'hatch_failed' : 'command_failed',
        {
          viewerId: entry.userId,
          command: entry.commandName,
          alias: entry.alias,
          transport: entry.transport
        },
        'error'
      )
    });
    this.streamMonstersCommandIngress.setCommands(
      this.buildStreamMonstersCommandDefinitions(this.streamMonstersCommandPrefix),
      this.streamMonstersCommandPrefix
    );
    this.streamMonstersEngine.kenneyBuilder = this.streamMonstersKenneyBuilder;
    this.streamMonstersEngine.hasBundledAsset = (template, stage = 1) => (
      this.streamMonstersAssetRegistry.hasBundledAsset(template, stage)
    );

    this.streamMonstersRoutes = new StreamMonstersRoutes({
      api: this.api,
      pluginDir: this.pluginDir,
      dataDir: this.getPluginDataDir(),
      store: this.streamMonstersStore,
      engine: this.streamMonstersEngine,
      progression: this.streamMonstersProgression,
      collection: this.streamMonstersCollection,
      battleMatchService: this.streamMonstersBattleMatchService,
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

    this.api.log('[STREAM MONSTERS] League World Hybrid runtime initialized', 'info');
  }

  loadConfig(storedConfig = this.api.getConfig('streamalchemy_config')) {
    this.retiredConfigArchive = this.extractRetiredConfig(storedConfig);
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
        freeEggDropsEnabled: true,
        freeEggCooldownSeconds: 86_400,
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
        freeEggDropsEnabled: storedStreamMonsters.freeEggDropsEnabled !== false,
        freeEggCooldownSeconds: this.normalizeFreeEggCooldownSeconds(
          storedStreamMonsters.freeEggCooldownSeconds
        ),
        commandAliases: this.normalizeCommandAliases(storedStreamMonsters.commandAliases),
        layouts: this.normalizeLayouts(storedStreamMonsters.layouts),
        rendererQuality: this.normalizeRendererQuality(storedStreamMonsters.rendererQuality),
        notificationDurationMs: this.normalizeNotificationDuration(
          storedStreamMonsters.notificationDurationMs
        ),
        audioChannels: this.normalizeAudioChannels(storedStreamMonsters.audioChannels),
        maxUnhatchedEggs: 3,
        visualPack: 'furry'
      }
    };
  }

  persistSanitizedConfigIfNeeded(storedConfig) {
    if (!storedConfig || typeof storedConfig !== 'object' || Array.isArray(storedConfig)) return false;
    const persistedConfig = this.composeStoredConfig(this.config);
    if (isDeepStrictEqual(storedConfig, persistedConfig)) return false;
    this.api.setConfig('streamalchemy_config', persistedConfig);
    return true;
  }

  sanitizeConfig(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const safe = {};
    for (const [key, value] of Object.entries(input)) {
      if (key === 'streamMonsters') {
        safe.streamMonsters = this.sanitizeStreamMonstersConfig(value);
      } else if (!this.isRetiredImageConfigKey(key)) {
        safe[key] = value;
      }
    }
    return safe;
  }

  sanitizeStreamMonstersConfig(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const safe = {};
    for (const [key, value] of Object.entries(input)) {
      if (!this.isRetiredImageConfigKey(key)) safe[key] = value;
    }
    return safe;
  }

  isRetiredImageConfigKey(key) {
    if (RETIRED_RUNTIME_TRUST_FIELDS.has(key)) return true;
    const normalized = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
    return [
      'provider',
      'generation',
      'model',
      'runtime',
      'comfy',
      'artlab',
      'artpool',
      'openai',
      'siliconflow',
      'lightx',
      'apikey',
      'prompt'
    ].some(marker => normalized.includes(marker));
  }

  cloneConfigValue(value) {
    if (Array.isArray(value)) return value.map(item => this.cloneConfigValue(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.cloneConfigValue(item)])
      );
    }
    return value;
  }

  extractRetiredConfig(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const retired = {};
    for (const [key, value] of Object.entries(input)) {
      if (key !== 'streamMonsters') {
        if (this.isRetiredImageConfigKey(key)) {
          retired[key] = this.cloneConfigValue(value);
        }
        continue;
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const retiredStreamMonsters = {};
      for (const [streamKey, streamValue] of Object.entries(value)) {
        if (this.isRetiredImageConfigKey(streamKey)) {
          retiredStreamMonsters[streamKey] = this.cloneConfigValue(streamValue);
        }
      }
      if (Object.keys(retiredStreamMonsters).length) {
        retired.streamMonsters = retiredStreamMonsters;
      }
    }
    return retired;
  }

  composeStoredConfig(activeConfig = this.config) {
    const retired = this.cloneConfigValue(this.retiredConfigArchive || {});
    const active = this.cloneConfigValue(activeConfig || {});
    return {
      ...retired,
      ...active,
      streamMonsters: {
        ...(retired.streamMonsters || {}),
        ...(active.streamMonsters || {})
      }
    };
  }

  normalizeSeasonDuration(value) {
    const duration = Number(value);
    return [7, 14, 28, 60, 90].includes(duration) ? duration : 28;
  }

  normalizeFreeEggCooldownSeconds(value) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds >= 60 && seconds <= 31_536_000
      ? Math.round(seconds)
      : 86_400;
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
    const normalized = Object.fromEntries(Object.entries(DEFAULT_COMMAND_ALIASES).map(([command, defaults]) => {
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
    if (
      normalized.rank.enabled.length === 1 &&
      normalized.rank.enabled[0] === 'rank' &&
      !normalized.rank.disabled.includes('monsterrank')
    ) {
      normalized.rank.enabled.push('monsterrank');
    }
    const owners = new Map();
    Object.entries(normalized).forEach(([command, aliases]) => {
      aliases.enabled.forEach(alias => {
        const owner = owners.get(alias);
        if (owner && owner !== command) throw new Error(`STREAM_MONSTERS_ALIAS_CONFLICT:${alias}`);
        owners.set(alias, command);
      });
    });
    return normalized;
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
        freeEggDropsEnabled: mergedStreamMonsters.freeEggDropsEnabled !== false,
        freeEggCooldownSeconds: this.normalizeFreeEggCooldownSeconds(
          mergedStreamMonsters.freeEggCooldownSeconds
        ),
        commandAliases: this.normalizeCommandAliases(mergedStreamMonsters.commandAliases),
        layouts: this.normalizeLayouts(mergedStreamMonsters.layouts),
        rendererQuality: this.normalizeRendererQuality(mergedStreamMonsters.rendererQuality),
        notificationDurationMs: this.normalizeNotificationDuration(
          mergedStreamMonsters.notificationDurationMs
        ),
        audioChannels: this.normalizeAudioChannels(mergedStreamMonsters.audioChannels),
        maxUnhatchedEggs: 3,
        visualPack: 'furry'
      }
    };
    this.api.setConfig('streamalchemy_config', this.composeStoredConfig(this.config));
    if (this.streamMonstersEngine) {
      this.streamMonstersEngine.config = {
        ...this.streamMonstersEngine.config,
        ...this.config.streamMonsters,
        maxUnhatchedEggs: 3
      };
    }
    if (this.streamMonstersFreeEggDrops) {
      this.streamMonstersFreeEggDrops.config = {
        freeEggDropsEnabled: this.config.streamMonsters.freeEggDropsEnabled,
        freeEggCooldownSeconds: this.config.streamMonsters.freeEggCooldownSeconds
      };
    }
    this.streamMonstersProgression?.setSeasonDurationDays?.(
      this.config.streamMonsters.seasonDurationDays
    );
    this.streamMonstersBattleMatchService?.setSeasonDurationDays?.(
      this.config.streamMonsters.seasonDurationDays
    );
    if (
      this.streamMonstersCommandIngress &&
      (
        Object.prototype.hasOwnProperty.call(safeUpdates, 'enabled') ||
        Object.prototype.hasOwnProperty.call(streamMonstersUpdates, 'enabled') ||
        Object.prototype.hasOwnProperty.call(streamMonstersUpdates, 'commandAliases')
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
    this.streamMonstersBattleMatchService?.destroy();
    this.removeStreamMonstersGCCELifecycle();
    this.deactivateStreamMonstersGCCE();
    this.streamMonstersCommandIngress?.clear();
    this.streamMonstersEngine?.recentGifts?.clear?.();
    this.streamMonstersChatCommands?.queue?.splice?.(0);
    this.api.log('[STREAM MONSTERS] League World Hybrid runtime stopped', 'info');
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
      isHeartMeGift(item.name || item.gift_name)
    ));
    const giftId = Number.parseInt(candidate?.id ?? candidate?.gift_id ?? candidate?.giftId, 10);
    if (!giftId || !isHeartMeGift(candidate?.name || candidate?.gift_name || candidate?.giftName)) {
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
    const aliases = this.normalizeCommandAliases(this.config?.streamMonsters?.commandAliases);
    return [
      ['eggs', 'Show your Stream Monsters eggs', 0, 0],
      ['hatch', 'Hatch a ready egg by slot', 0, 1],
      ['inventory', 'Show your Stream Monsters inventory', 0, 1],
      ['monsters', 'Show your Stream Monsters', 0, 1],
      ['monster', 'Show one monster by slot', 1, 1],
      ['choose', 'Choose a monster by slot', 1, 1],
      ['evolve', 'Evolve a monster cosmetically by slot', 1, 1],
      ['battle', 'Join the public queue, then choose skills with A/B/C', 0, 1],
      ['leavebattle', 'Leave the Stream Monsters battle queue', 0, 0],
      ['rank', 'Show Arena Rating and Collector Score', 0, 0],
      ['quests', 'Show daily and weekly quests', 0, 0],
      ['adopt', 'Adopt your available free Stream Monsters egg', 0, 0],
      ['monstershelp', 'Show Stream Monsters commands', 0, 0]
    ].flatMap(([command, description, minArgs, maxArgs]) => aliases[command].enabled.map(name => ({
      name,
      commandName: command,
      description,
      syntax: `${commandPrefix}${name}${minArgs ? ' <slot>' : ''}`,
      permission: 'all',
      enabled: true,
      minArgs,
      maxArgs,
      category: 'Stream Monsters',
      cooldownKey: `streamalchemy:${command}`,
      cooldown: { user: command === 'battle' ? 2000 : 1000, global: command === 'battle' ? 0 : 250 },
      handler: async (args, context = {}) => this.streamMonstersCommandIngress.executeCommand(
        command,
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
        'gcce',
        name
      )
    })));
  }

  getStreamMonstersCommandReference(command) {
    const aliases = this.normalizeCommandAliases(this.config?.streamMonsters?.commandAliases);
    const enabledAliases = aliases[command]?.enabled || [];
    const registeredCommands = new Set(this.streamMonstersGCCERegisteredCommands || []);
    const registrationIsActive = String(
      this.streamMonstersGCCERegistrationState || ''
    ).startsWith('active');
    const alias = registrationIsActive
      ? enabledAliases.find(candidate => registeredCommands.has(candidate))
      : enabledAliases[0];
    if (!alias) return '';
    return `${this.streamMonstersCommandPrefix || '!'}${alias}`;
  }

  getStreamMonstersGCCEState() {
    const active = this.streamMonstersGCCERegistrationState.startsWith('active');
    const legacyRawFallback = this.streamMonstersGCCERegistrationState
      .includes('legacy_raw_fallback');
    const aliases = this.normalizeCommandAliases(
      this.config?.streamMonsters?.commandAliases
    );
    const registeredCommands = new Set(
      this.streamMonstersGCCERegisteredCommands || []
    );
    const commandReferences = Object.fromEntries(
      Object.keys(DEFAULT_COMMAND_ALIASES)
        .map(command => [command, this.getStreamMonstersCommandReference(command)])
        .filter(([, reference]) => reference)
    );
    const commandPolicies = Object.fromEntries(
      Object.keys(DEFAULT_COMMAND_ALIASES).map(command => {
        const enabledAliases = [...(aliases[command]?.enabled || [])];
        return [command, {
          enabledAliases,
          registeredAliases: active
            ? enabledAliases.filter(alias => registeredCommands.has(alias))
            : enabledAliases,
          userCooldownMs: command === 'battle' ? 2000 : 1000,
          globalCooldownMs: command === 'battle' ? 0 : 250
        }];
      })
    );
    return {
      commandPrefix: this.streamMonstersCommandPrefix,
      commandReferences,
      commandPolicies,
      tiktokFilter: {
        status: 'not_probeable',
        probeable: false,
        recommendation: 'use_custom_aliases'
      },
      ingressMode: active
        ? (legacyRawFallback ? 'gcce_commands_direct_raw' : 'gcce_raw_handler')
        : (this.streamMonstersGCCERegistrationState === 'fallback'
            ? 'direct_fallback'
            : 'blocked'),
      registrationWarning: legacyRawFallback
        ? 'raw_response_api_unavailable'
        : null,
      registrationState: this.streamMonstersGCCERegistrationState,
      registrationError: this.streamMonstersGCCERegistrationError,
      registrationConflicts: [...(this.streamMonstersGCCERegistrationConflicts || [])],
      registeredCommands: [...(this.streamMonstersGCCERegisteredCommands || [])],
      unavailableCommands: [...(this.streamMonstersGCCEUnavailableCommands || [])],
      commandsRegistered: active
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
    if (
      !force &&
      this.streamMonstersGCCE === gcce &&
      this.streamMonstersGCCERegistrationState.startsWith('active')
    ) {
      return true;
    }

    if (this.streamMonstersGCCE && this.streamMonstersGCCE !== gcce) {
      this.deactivateStreamMonstersGCCE();
    }

    try {
      gcce.unregisterCommandsForPlugin('streamalchemy');
      gcce.unregisterRawResponseHandlerForPlugin?.('streamalchemy');
      const result = gcce.registerCommandsForPlugin('streamalchemy', definitions);
      const registered = Array.isArray(result?.registered) ? result.registered : [];
      const failed = Array.isArray(result?.failed) ? result.failed : [];
      if (!registered.length) {
        gcce.unregisterCommandsForPlugin('streamalchemy');
        gcce.unregisterRawResponseHandlerForPlugin?.('streamalchemy');
        this.streamMonstersGCCE = gcce;
        this.streamMonstersGCCERegistrationState = 'blocked';
        this.streamMonstersGCCERegistrationError = 'registration_failed';
        this.streamMonstersGCCERegistrationConflicts = failed;
        this.streamMonstersGCCERegisteredCommands = [];
        this.streamMonstersGCCEUnavailableCommands = [...new Set(
          definitions.map(definition => definition.commandName)
        )];
        return false;
      }
      const registeredSet = new Set(registered);
      const unavailableCommands = [...new Set(definitions
        .filter(definition => !definitions.some(candidate => (
          candidate.commandName === definition.commandName &&
          registeredSet.has(candidate.name)
        )))
        .map(definition => definition.commandName))];
      const rawResponseApiAvailable = (
        typeof gcce.registerRawResponseHandlerForPlugin === 'function' &&
        typeof gcce.unregisterRawResponseHandlerForPlugin === 'function'
      );
      if (rawResponseApiAvailable) {
        gcce.registerRawResponseHandlerForPlugin(
          'streamalchemy',
          (message, context) => this.handleStreamMonstersRawResponse(message, context)
        );
      }
      this.streamMonstersGCCE = gcce;
      this.streamMonstersGCCERegistrationState = rawResponseApiAvailable
        ? (failed.length ? 'active_partial' : 'active')
        : (failed.length
            ? 'active_partial_legacy_raw_fallback'
            : 'active_legacy_raw_fallback');
      this.streamMonstersGCCERegistrationError = failed.length ? 'alias_conflicts' : null;
      this.streamMonstersGCCERegistrationConflicts = failed;
      this.streamMonstersGCCERegisteredCommands = registered;
      this.streamMonstersGCCEUnavailableCommands = unavailableCommands;
      return true;
    } catch (error) {
      this.api.log(`[STREAM MONSTERS] GCCE registration failed: ${error.message}`, 'warn');
      try {
        gcce.unregisterCommandsForPlugin('streamalchemy');
        gcce.unregisterRawResponseHandlerForPlugin?.('streamalchemy');
      } catch (cleanupError) {
        this.api.log(`[STREAM MONSTERS] GCCE registration rollback failed: ${cleanupError.message}`, 'debug');
      }
      this.streamMonstersGCCE = gcce;
      this.streamMonstersGCCERegistrationState = 'blocked';
      this.streamMonstersGCCERegistrationError = 'registration_failed';
      this.streamMonstersGCCERegistrationConflicts = [];
      this.streamMonstersGCCERegisteredCommands = [];
      this.streamMonstersGCCEUnavailableCommands = [];
      return false;
    }
  }

  deactivateStreamMonstersGCCE() {
    if (this.streamMonstersGCCE?.unregisterCommandsForPlugin) {
      try {
        this.streamMonstersGCCE.unregisterCommandsForPlugin('streamalchemy');
        this.streamMonstersGCCE.unregisterRawResponseHandlerForPlugin?.('streamalchemy');
      } catch (error) {
        this.api.log(`[STREAM MONSTERS] GCCE cleanup failed: ${error.message}`, 'debug');
      }
    }
    this.streamMonstersGCCE = null;
    this.streamMonstersGCCERegistrationState = 'fallback';
    this.streamMonstersGCCERegistrationError = null;
    this.streamMonstersGCCERegistrationConflicts = [];
    this.streamMonstersGCCERegisteredCommands = [];
    this.streamMonstersGCCEUnavailableCommands = [];
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
    (this.streamMonstersGCCELifecycleListeners || []).forEach(({ event, callback }) => {
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

  handleStreamMonstersRawResponse(message, context = {}) {
    const choice = String(message || '').trim().toUpperCase();
    if (!/^[ABC1-4]$/.test(choice) || !this.streamMonstersBattleMatchService) {
      return { handled: false };
    }
    const userId = this.resolveStreamMonstersViewerId({
      platformUserId: context.rawData?.userId,
      legacyUserId: context.rawData?.uniqueId ||
        context.uniqueId ||
        context.userId ||
        context.username
    });
    if (!userId) return { handled: false };
    const providerEventId = context.rawData?.eventId ??
      context.rawData?.event_id ??
      context.rawData?.msgId ??
      context.rawData?.msg_id ??
      context.rawData?.logId ??
      context.rawData?.log_id;
    const windowKind = /^[ABC]$/.test(choice) ? 'action' : 'stat';
    const windowKey = this.streamMonstersBattleMatchService
      .getRawResponseWindowKey?.({ userId, windowKind });
    const viewerScope = this.opaqueViewerRef(userId) || 'viewer';
    const eventId = providerEventId == null
      ? createHash('sha256')
        .update(
          `${windowKey || `unclaimed:${randomUUID()}`}:${viewerScope}:${choice}`
        )
        .digest('hex')
        .slice(0, 32)
      : `raw:${String(context.source || context.transport || 'chat')}:` +
        String(providerEventId);
    if (/^[ABC]$/.test(choice)) {
      return this.streamMonstersBattleMatchService.submitChoice({
        userId,
        choice,
        eventId,
        source: 'viewer'
      });
    }
    return this.streamMonstersBattleMatchService.submitStatChoice({
      userId,
      choice,
      eventId,
      source: 'viewer'
    });
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
    count = null,
    eventId = null,
    eventType = null,
    matchId = null,
    command = null,
    alias = null,
    transport = null,
    phase = null,
    source = null,
    deadlineMs = null
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
    const safeText = (value, maximum = 96) => {
      if (typeof value !== 'string' || !value) return null;
      return value.slice(0, maximum);
    };
    for (const [key, value] of Object.entries({
      eventId: safeText(eventId, 128),
      eventType: safeText(eventType, 128),
      matchId: safeText(matchId, 128),
      command: safeText(command, 48),
      alias: safeText(alias, 48),
      transport: safeText(transport, 24),
      phase: safeText(phase, 32),
      source: safeText(source, 32)
    })) {
      if (value) payload[key] = value;
    }
    if (Number.isFinite(Number(deadlineMs)) && Number(deadlineMs) >= 0) {
      payload.deadlineMs = Number(deadlineMs);
    }
    this.api.log(JSON.stringify(payload), level);
    return correlationId;
  }

  emitStreamMonsters(eventType, inputPayload = {}) {
    const payload = inputPayload && typeof inputPayload === 'object'
      ? inputPayload
      : {};
    const projector = this.streamMonstersPublicEventProjector ||
      new StreamMonstersPublicEventProjector({
        store: this.streamMonstersStore || null
      });
    const identifiers = projector.identifiers(eventType, payload);
    const correlationId = String(identifiers.correlationId || randomUUID());
    const eventId = String(identifiers.eventId || randomUUID());
    const emitted = {
      ...projector.project(eventType, payload),
      eventId,
      correlationId
    };
    const diagnostic = {
      correlationId,
      eventId,
      eventType,
      viewerId: payload.userId || null,
      matchId: payload.matchId || payload.battleId || payload.battle?.battleId || null,
      deadlineMs: payload.deadlineMs || payload.decision?.deadlineMs || null,
      phase: payload.phase || null,
      source: payload.source || payload.decision?.source || null
    };
    let shouldEmit = true;
    if (projector.isCritical(eventType) && this.streamMonstersStore?.appendPublicEvent) {
      const persisted = this.streamMonstersStore.appendPublicEvent({
        eventId,
        correlationId,
        streamKey: this.streamMonstersEngine?.streamKey || 'offline',
        eventType,
        payload: emitted,
        createdAtMs: Date.now()
      });
      shouldEmit = Boolean(persisted.inserted);
      this.streamMonstersStore.prunePublicEvents?.(
        Date.now() - (6 * 60 * 60 * 1000),
        500
      );
    }
    if (shouldEmit) {
      this.api.emit(eventType, emitted);
      const plannedAlias = BATTLE_SOCKET_ALIASES[eventType];
      if (plannedAlias) this.api.emit(plannedAlias, emitted);
      if (
        eventType === 'streammonsters:battle_skill_used' &&
        emitted.action?.terminal === true
      ) {
        this.api.emit('streammonsters:battle_knockout', emitted);
      }
    }
    this.logStructured('socket_emit', diagnostic, 'debug');
    const domainEvents = {
      'streammonsters:egg_hatched': 'hatch_completed',
      'streammonsters:hatch_started': 'hatch_started',
      'streammonsters:battle_match_found': 'match_phase',
      'streammonsters:battle_roster_locked': 'match_phase',
      'streammonsters:battle_choice_opened': 'match_phase',
      'streammonsters:battle_choice_locked': 'skill_lock',
      'streammonsters:battle_skill_used': 'battle_action',
      'streammonsters:battle_action': 'battle_action',
      'streammonsters:battle_completed': 'match_completed',
      'streammonsters:monster_xp_awarded': 'xp_awarded',
      'streammonsters:season_rank_changed': 'collector_rank_changed'
    };
    const domainEvent = domainEvents[eventType];
    if (domainEvent) this.logStructured(domainEvent, diagnostic, 'debug');
    return emitted;
  }

  normalizeStableGiftEventTime(data = {}) {
    const rawValue = data.createTime ?? data.create_time ?? data.timestamp;
    if (rawValue === undefined || rawValue === null || rawValue === '') return null;
    let timestampMs;
    if (
      typeof rawValue === 'number' ||
      (typeof rawValue === 'string' && /^\d+(?:\.\d+)?$/.test(rawValue.trim()))
    ) {
      timestampMs = Number(rawValue);
      if (!Number.isFinite(timestampMs) || timestampMs <= 0) return null;
      if (timestampMs < 100_000_000_000) timestampMs *= 1_000;
      if (timestampMs > 100_000_000_000_000) timestampMs /= 1_000;
    } else {
      timestampMs = Date.parse(String(rawValue));
    }
    return Number.isFinite(timestampMs) && timestampMs > 0
      ? Math.trunc(timestampMs)
      : null;
  }

  createStableGiftEventPrefix(data, {
    userId,
    giftId,
    coinValue,
    repeatCount
  }) {
    const timestampMs = this.normalizeStableGiftEventTime(data);
    if (timestampMs === null) return null;
    const source = String(data.provider || data.source || 'tiktok');
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({
        version: 1,
        source,
        userId: String(userId),
        giftId: Number(giftId),
        coinValue: Number(coinValue) || 0,
        repeatCount: Number(repeatCount) || 1,
        giftType: data.giftType ?? null,
        streakEnd: data.isStreakEnd ?? data.repeatEnd ?? null,
        timestampMs
      }))
      .digest('hex')
      .slice(0, 40);
    return `${source}:stable:${fingerprint}`;
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
    const providerEventId = (
      data.eventId ??
      data.event_id ??
      data.msgId ??
      data.msg_id ??
      data.logId ??
      data.log_id
    );
    const eventPrefix = providerEventId === undefined || providerEventId === null
      ? this.createStableGiftEventPrefix(data, {
        userId,
        giftId,
        coinValue,
        repeatCount
      })
      : `${String(data.provider || data.source || 'tiktok')}:${String(providerEventId)}`;
    let processedCount = 0;
    for (let index = 0; index < repeatCount; index += 1) {
      const result = this.streamMonstersEngine.processGift({
        userId,
        giftId,
        giftName,
        coinValue,
        eventKey: eventPrefix ? `${eventPrefix}:repeat-${index + 1}` : null
      });
      if (result.type !== 'duplicate') processedCount += 1;
    }
    this.logStructured('gift_processed', {
      correlationId,
      viewerId: userId,
      count: processedCount
    });
  }

  async handleStreamMonstersChat(data = {}) {
    const correlationId = randomUUID();
    this.observeStreamMonstersFirstChat(data);
    const directCommandFallback = this.streamMonstersGCCERegistrationState === 'fallback';
    const directRawFallback = directCommandFallback ||
      this.streamMonstersGCCERegistrationState.includes('legacy_raw_fallback');
    const rawMessage = String(
      data.comment || data.message || data.text || ''
    ).trim();
    if (directRawFallback && /^[ABC1-4]$/i.test(rawMessage)) {
      const rawResult = this.handleStreamMonstersRawResponse(rawMessage, {
        userId: data.uniqueId || data.userId || data.username,
        uniqueId: data.uniqueId || data.userId,
        username: data.nickname || data.username || data.uniqueId || data.userId,
        nickname: data.nickname || data.username || data.uniqueId || data.userId,
        timestamp: data.timestamp || data.createTime || 0,
        rawData: data
      });
      if (rawResult?.handled) {
        this.logStructured('raw_response_processed', {
          correlationId,
          viewerId: data.userId || data.uniqueId,
          status: 'handled',
          source: directCommandFallback ? 'fallback' : 'legacy_gcce_raw_fallback'
        }, 'debug');
        return rawResult;
      }
    }
    if (!directCommandFallback) {
      const gcceActive = this.streamMonstersGCCERegistrationState.startsWith('active');
      const result = {
        success: false,
        status: gcceActive ? 'gcce_active' : 'gcce_blocked'
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

  observeStreamMonstersFirstChat(data = {}) {
    if (!this.streamMonstersFreeEggDrops || !this.streamMonstersEngine) return null;
    const userId = this.resolveStreamMonstersViewerId({
      platformUserId: data.userId,
      legacyUserId: data.uniqueId || data.username
    });
    if (!userId) return null;
    const providerEventId = data.eventId ?? data.event_id ?? data.msgId ?? data.msg_id;
    const streamKey = this.streamMonstersEngine.streamKey || 'offline';
    const eventId = providerEventId === undefined || providerEventId === null
      ? `chat:${createHash('sha256').update(JSON.stringify({
        streamKey,
        userId,
        message: data.comment || data.message || data.text || '',
        timestamp: data.timestamp || data.createTime || data.create_time || null
      })).digest('hex')}`
      : `chat:${String(data.provider || data.source || 'tiktok')}:${String(providerEventId)}`;
    try {
      return this.streamMonstersFreeEggDrops.onFirstChat({
        userId,
        streamKey,
        eventId,
        displayName: data.nickname || data.username || data.uniqueId || userId
      });
    } catch (error) {
      this.api.log(`[STREAM MONSTERS] Free egg observation failed: ${error.message}`, 'warn');
      return null;
    }
  }

  async handleStreamMonstersSession(data = {}) {
    const creatorName = data.username || data.uniqueId || null;
    if (!this.config.streamMonsters.creatorName && creatorName) {
      this.updateConfig({ streamMonsters: { creatorName } });
    }
    const streamKey = data.streamIdentity || `${creatorName || 'creator'}:${data.streamSessionId || data.roomId || 'session'}`;
    const previousStreamKey = this.streamMonstersEngine?.streamKey;
    if (previousStreamKey && previousStreamKey !== streamKey) {
      this.streamMonstersFreeEggDrops?.cleanupStream({ streamKey: previousStreamKey });
    }
    const event = this.streamMonstersProgression.startStreamSession({ streamKey });
    this.streamMonstersEngine.setStreamKey(streamKey);
    this.emitStreamMonsters('streammonsters:stream_started', {
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
