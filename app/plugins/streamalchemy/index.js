const StreamAlchemyDatabase = require('./backend/database');
const PromptService = require('./backend/prompt-service');
const RecipeService = require('./backend/recipe-service');
const InventoryService = require('./backend/inventory-service');
const PlaceholderProvider = require('./backend/providers/placeholder-provider');
const LocalComfyProvider = require('./backend/providers/local-comfy-provider');
const { ExistingServiceProvider } = require('./backend/providers/remote-provider-adapters');
const GenerationService = require('./backend/generation-service');
const LocalModelInstaller = require('./backend/local-model-installer');
const SystemAnalyzer = require('./backend/system-analyzer');
const ModelCatalog = require('./backend/model-catalog');
const OverlayPublisher = require('./backend/overlay-publisher');
const CraftingEngine = require('./backend/crafting-engine');
const EventProcessor = require('./backend/event-processor');
const StreamAlchemyRoutes = require('./backend/routes');
const { DEFAULT_CONFIG } = require('./backend/constants');
const CraftingService = require('./craftingService');
const SiliconFlowService = require('./siliconFlowService');
const LightXService = require('./lightxService');
const StreamMonstersDatabase = require('./backend/streammonsters/database');
const StreamMonstersEngine = require('./backend/streammonsters/game-engine');
const StreamMonstersRoutes = require('./backend/streammonsters/routes');
const StreamMonstersBattleService = require('./backend/streammonsters/battle-service');
const StreamMonstersChatCommands = require('./backend/streammonsters/chat-commands');
const StreamMonstersGenerationPool = require('./backend/streammonsters/generation-pool');
const StreamMonstersProgressionService = require('./backend/streammonsters/progression-service');
const StreamMonstersManagedRuntimeInstaller = require('./backend/streammonsters/managed-runtime-installer');
const StreamMonstersArtPoolService = require('./backend/streammonsters/art-pool-service');
const KenneyMonsterBuilder = require('./backend/streammonsters/kenney-monster-builder');

const RUNTIME_TRUST_FIELDS = new Set([
  'manifest', 'archiveUrl', 'sha256', 'modelSha256', 'archiveType',
  'executableRelativePath', 'executableArgs', 'comfyRootRelativePath',
  'healthBaseUrl', 'healthUrl', 'downloadSizeBytes', 'modelSizeBytes'
]);
const DEFAULT_STREAM_MONSTERS_COMMAND_ALIASES = Object.freeze({
  eggs: ['eierliste', 'meineeier'],
  hatch: ['schluepfen', 'ausbrueten'],
  monsters: ['meinemonster'],
  monster: ['zeigmonster'],
  choose: ['waehlen'],
  battle: ['kampf'],
  leavebattle: ['kampfabbruch'],
  rank: [],
  quests: ['monsterquests'],
  monstershelp: ['monsterhilfe']
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

    this.store = new StreamAlchemyDatabase(this.api.getDatabase(), logger);
    this.store.initialize();
    this.streamMonstersStore = new StreamMonstersDatabase(this.api.getDatabase());
    this.streamMonstersStore.initialize();
    this.streamMonstersProgression = new StreamMonstersProgressionService({
      store: this.streamMonstersStore,
      emit: (event, payload) => this.api.emit(event, payload)
    });
    this.streamMonstersEngine = new StreamMonstersEngine({
      store: this.streamMonstersStore,
      progression: this.streamMonstersProgression,
      emit: (event, payload) => this.api.emit(event, payload),
      config: this.config.streamMonsters
    });
    this.streamMonstersBattleService = new StreamMonstersBattleService({ store: this.streamMonstersStore });
    this.streamMonstersChatCommands = new StreamMonstersChatCommands({
      store: this.streamMonstersStore,
      engine: this.streamMonstersEngine,
      battleService: this.streamMonstersBattleService,
      progression: this.streamMonstersProgression,
      emit: (event, payload) => this.api.emit(event, payload)
    });
    this.streamMonstersCommandPrefix = '!';
    this.streamMonstersGCCELifecycleListeners = [];
    this.modelCatalog = new ModelCatalog();

    this.promptService = new PromptService({ promptVersion: this.config.promptVersion });
    this.recipeService = new RecipeService(this.store, this.promptService);
    this.inventoryService = new InventoryService(this.store);
    this.overlayPublisher = new OverlayPublisher(this.api);

    this.providers = this.createProviders(logger);
    this.localModelInstaller = new LocalModelInstaller({
      dataDir: this.getPluginDataDir(),
      logger,
      catalog: this.modelCatalog
    });
    this.streamMonstersManagedRuntime = new StreamMonstersManagedRuntimeInstaller({
      dataDir: this.getPluginDataDir()
    });

    this.generationService = new GenerationService(this.store, logger, {
      providerOrder: this.config.providerOrder,
      providers: this.providers,
      getConfig: () => this.config
    });
    this.streamMonstersGenerationPool = new StreamMonstersGenerationPool({
      store: this.streamMonstersStore,
      generationService: this.generationService
    });
    this.streamMonstersArtPool = new StreamMonstersArtPoolService({
      store: this.streamMonstersStore,
      generationService: this.generationService,
      dataDir: this.getPluginDataDir(),
      logger,
      emit: (event, payload) => this.api.emit(event, payload)
    });
    this.streamMonstersKenneyBuilder = new KenneyMonsterBuilder({
      assetDir: require('path').join(this.pluginDir, 'assets', 'kenney-monster-builder'),
      dataDir: this.getPluginDataDir(),
      logger
    });
    this.streamMonstersEngine.artPool = this.streamMonstersArtPool;
    this.streamMonstersEngine.kenneyBuilder = this.streamMonstersKenneyBuilder;
    this.streamMonstersEngine.hasBundledAsset = template => require('fs').existsSync(
      require('path').join(this.pluginDir, 'assets', 'streammonsters', 'furry', `${template.templateId}.png`)
    );

    this.craftingEngine = new CraftingEngine({
      store: this.store,
      promptService: this.promptService,
      recipeService: this.recipeService,
      inventoryService: this.inventoryService,
      generationService: this.generationService,
      overlayPublisher: this.overlayPublisher,
      logger,
      config: this.config
    });

    this.eventProcessor = new EventProcessor({
      engine: this.craftingEngine,
      logger
    });

    this.systemAnalyzer = new SystemAnalyzer({ catalog: this.modelCatalog });
    this.routes = new StreamAlchemyRoutes({
      api: this.api,
      pluginDir: this.pluginDir,
      store: this.store,
      generationService: this.generationService,
      systemAnalyzer: this.systemAnalyzer,
      localModelInstaller: this.localModelInstaller,
      modelCatalog: this.modelCatalog,
      configProvider: {
        getConfig: () => this.config,
        updateConfig: updates => this.updateConfig(updates)
      }
    });
    this.routes.register();
    this.streamMonstersRoutes = new StreamMonstersRoutes({
      api: this.api,
      pluginDir: this.pluginDir,
      dataDir: this.getPluginDataDir(),
      store: this.streamMonstersStore,
      engine: this.streamMonstersEngine,
      generationPool: this.streamMonstersGenerationPool,
      artPool: this.streamMonstersArtPool,
      progression: this.streamMonstersProgression,
      systemAnalyzer: this.systemAnalyzer,
      managedRuntime: this.streamMonstersManagedRuntime,
      localModelInstaller: this.localModelInstaller,
      giftCatalogProvider: locale => this.getStreamMonstersGiftCatalog(locale),
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
    const storedCommandAliases = storedStreamMonsters.commandAliases || {};
    const commandAliases = Object.fromEntries(
      Object.entries(DEFAULT_STREAM_MONSTERS_COMMAND_ALIASES).map(([action, defaults]) => [
        action,
        Object.prototype.hasOwnProperty.call(storedCommandAliases, action)
          ? storedCommandAliases[action]
          : [...defaults]
      ])
    );
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      localGeneration: {
        ...DEFAULT_CONFIG.localGeneration,
        ...(stored.localGeneration || {})
      },
      streamMonsters: {
        enabled: true,
        creatorName: '',
        hatchDurationMs: 5 * 60 * 1000,
        maxUnhatchedEggs: 3,
        elementRules: 'deterministic',
        artPoolTarget: 3,
        bottomOverlayDurationMs: 8_000,
        visualPack: 'furry',
        ...storedStreamMonsters,
        commandAliases,
        localRuntime: {
          state: 'not_installed',
          ...(storedStreamMonsters.localRuntime || {})
        }
      }
    };
  }

  persistSanitizedConfigIfNeeded(storedConfig) {
    if (!storedConfig || typeof storedConfig !== 'object' || Array.isArray(storedConfig)) return false;
    const sanitizedStored = this.sanitizeConfig(storedConfig);
    if (JSON.stringify(storedConfig) === JSON.stringify(sanitizedStored)) return false;
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
      } else if (key === 'commandAliases') {
        safe.commandAliases = this.sanitizeStreamMonstersCommandAliases(value);
      } else if (!RUNTIME_TRUST_FIELDS.has(key)) {
        safe[key] = value;
      }
    }
    return safe;
  }

  sanitizeStreamMonstersCommandAliases(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const safe = {};
    for (const action of Object.keys(DEFAULT_STREAM_MONSTERS_COMMAND_ALIASES)) {
      if (!Object.prototype.hasOwnProperty.call(input, action)) continue;
      const aliases = Array.isArray(input[action])
        ? input[action]
        : String(input[action] || '').split(',');
      safe[action] = Array.from(new Set(aliases
        .map(alias => String(alias).trim().toLowerCase().replace(/^[!/]+/, ''))
        .filter(alias => /^[a-z0-9_-]{1,32}$/.test(alias))))
        .slice(0, 8);
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

  createProviders(logger) {
    const openaiKey = this.getFirstSetting([
      'openai_api_key',
      'tts_openai_api_key'
    ]) || this.normalizeSecret(this.config.openaiApiKey) || process.env.OPENAI_API_KEY || null;

    const siliconFlowKey = this.getFirstSetting([
      'siliconflow_api_key',
      'tts_fishspeech_api_key',
      'streamalchemy_siliconflow_api_key'
    ]) || this.normalizeSecret(this.config.siliconFlowApiKey) || process.env.SILICONFLOW_API_KEY || null;

    const lightxKey = this.getFirstSetting([
      'lightx_api_key',
      'streamalchemy_lightx_api_key'
    ]) || this.normalizeSecret(this.config.lightxApiKey) || process.env.LIGHTX_API_KEY || null;

    const dalleService = new CraftingService(this.store, logger, openaiKey, null, 'Common');
    const siliconFlowService = new SiliconFlowService(logger, siliconFlowKey);
    const lightxService = new LightXService(logger, lightxKey);

    return {
      localComfy: new LocalComfyProvider({
        getConfig: () => this.config.localGeneration,
        dataDir: this.getPluginDataDir(),
        logger,
        catalog: this.modelCatalog
      }),
      siliconflow: new ExistingServiceProvider({
        id: 'siliconflow',
        model: siliconFlowService.model || 'black-forest-labs/FLUX.1-schnell',
        hasApiKey: () => siliconFlowService.hasApiKey(),
        generate: input => siliconFlowService.generateFusionImage(
          this.normalizeLegacyItem(input.itemA),
          this.normalizeLegacyItem(input.itemB),
          input.prompt,
          this.createRemoteOptions(input)
        )
      }),
      openai: new ExistingServiceProvider({
        id: 'openai',
        model: 'dall-e-3',
        hasApiKey: () => !!dalleService.apiKey,
        generate: input => dalleService.queueAIGeneration(input.prompt)
      }),
      lightx: new ExistingServiceProvider({
        id: 'lightx',
        model: 'lightx-text2image',
        hasApiKey: () => lightxService.hasApiKey(),
        generate: input => lightxService.generateFusionImage(
          this.normalizeLegacyItem(input.itemA),
          this.normalizeLegacyItem(input.itemB),
          input.prompt,
          this.createRemoteOptions(input)
        )
      }),
      placeholder: new PlaceholderProvider()
    };
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

  getFirstSetting(keys) {
    for (const key of keys) {
      const value = this.getCentralSetting(key);
      if (value) return value;
    }
    return null;
  }

  getCentralSetting(key) {
    try {
      const db = this.api.getDatabase();
      if (db && typeof db.getSetting === 'function') {
        return this.normalizeSecret(db.getSetting(key));
      }
      if (db && typeof db.prepare === 'function') {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return this.normalizeSecret(row?.value);
      }
    } catch (error) {
      this.api.log(`[STREAM MONSTERS] Central setting ${key} unavailable: ${error.message}`, 'debug');
    }
    return null;
  }

  normalizeSecret(value) {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed === '***REDACTED***') return null;
    return trimmed;
  }

  normalizeLegacyItem(item) {
    if (!item) return {};
    return {
      ...item,
      itemId: item.itemId || item.item_id,
      imageURL: item.imageURL || item.image_url || item.imageUrl,
      coinValue: item.coinValue || item.coin_value
    };
  }

  createRemoteOptions(input) {
    return {
      negativePrompt: input.negativePrompt,
      imageSize: '1024x1024',
      steps: Math.max(1, Math.min(4, Number(this.config.localGeneration?.steps) || 4))
    };
  }

  updateConfig(updates = {}) {
    const safeUpdates = this.sanitizeConfig(updates);
    const localGenerationUpdates = {
      ...(safeUpdates.localGeneration || {})
    };
    if (Object.prototype.hasOwnProperty.call(localGenerationUpdates, 'modelAuthToken') && !this.normalizeSecret(localGenerationUpdates.modelAuthToken)) {
      delete localGenerationUpdates.modelAuthToken;
    }
    const preset = this.modelCatalog.resolveConfigPreset({
      ...this.config.localGeneration,
      ...localGenerationUpdates
    });
    localGenerationUpdates.selectedPresetId = preset.id;
    localGenerationUpdates.workflowId = preset.workflowId;
    localGenerationUpdates.modelInstallMethod = preset.installMethod;
    localGenerationUpdates.model = preset.source;
    localGenerationUpdates.modelFile = preset.fileName;
    localGenerationUpdates.modelDownloadUrl = preset.downloadUrl;

    const currentStreamMonsters = this.sanitizeStreamMonstersConfig(this.config.streamMonsters);
    const streamMonstersUpdates = this.sanitizeStreamMonstersConfig(safeUpdates.streamMonsters);
    const currentLocalRuntime = {
      state: 'not_installed',
      ...(currentStreamMonsters.localRuntime || {})
    };
    const nextLocalRuntime = Object.prototype.hasOwnProperty.call(streamMonstersUpdates, 'localRuntime')
      ? { ...currentLocalRuntime, ...streamMonstersUpdates.localRuntime }
      : currentLocalRuntime;

    this.config = {
      ...this.config,
      ...safeUpdates,
      localGeneration: {
        ...this.config.localGeneration,
        ...localGenerationUpdates
      },
      streamMonsters: {
        ...currentStreamMonsters,
        ...streamMonstersUpdates,
        localRuntime: nextLocalRuntime
      }
    };
    this.api.setConfig('streamalchemy_config', this.config);
    if (
      this.streamMonstersChatCommands
      && Object.prototype.hasOwnProperty.call(streamMonstersUpdates, 'commandAliases')
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

  buildStreamMonstersGCCECommandDefinitions(commandPrefix = this.streamMonstersCommandPrefix || '!') {
    return [
      ['eggs', 'eggs', 'Show your Stream Monsters eggs', 0, 0],
      ['hatch', 'hatch', 'Hatch a ready egg by slot', 0, 1],
      ['monsters', 'monsters', 'Show your Stream Monsters', 0, 0],
      ['monster', 'monster', 'Show one monster by slot', 1, 1],
      ['choose', 'choose', 'Choose a monster by slot', 1, 1],
      ['battle', 'battle', 'Join the public Stream Monsters battle queue', 0, 0],
      ['leavebattle', 'leavebattle', 'Leave the Stream Monsters battle queue', 0, 0],
      ['monsterrank', 'rank', 'Show the current Collector Arena rank', 0, 0],
      ['quests', 'quests', 'Show daily and weekly quests', 0, 0],
      ['monstershelp', 'monstershelp', 'Show Stream Monsters commands', 0, 0]
    ].map(([name, action, description, minArgs, maxArgs]) => ({
      name,
      streamMonstersAction: action,
      aliases: [
        ...(this.config?.streamMonsters?.commandAliases?.[action]
          ?? DEFAULT_STREAM_MONSTERS_COMMAND_ALIASES[action]
          ?? [])
      ],
      description,
      syntax: `${commandPrefix}${name}${minArgs ? ' <slot>' : ''}`,
      permission: 'all',
      enabled: true,
      minArgs,
      maxArgs,
      category: 'Stream Monsters',
      cooldown: {
        user: name === 'battle' ? 2000 : 1000,
        global: name === 'battle' || name === 'hatch' ? 0 : 250
      },
      handler: async (args, context) => {
        const userId = context?.rawData?.uniqueId
          || context?.rawData?.username
          || context?.uniqueId
          || context?.username
          || context?.userId;
        const result = this.streamMonstersChatCommands.handle(
          { username: userId, skipCooldowns: true },
          `!${action}${Array.isArray(args) && args.length ? ` ${args.join(' ')}` : ''}`
        );
        if (result.status !== 'ignored') {
          this.api.emit('streammonsters:chat_result', {
            userId,
            result,
            bottomOverlayDurationMs: this.config.streamMonsters.bottomOverlayDurationMs
          });
        }
        return result;
      }
    }));
  }

  integrateStreamMonstersGCCE({ force = false, candidate = null } = {}) {
    const gcce = candidate || this.api.pluginLoader?.loadedPlugins?.get('gcce')?.instance;
    const configuredPrefix = gcce?.parser?.commandPrefix || gcce?.pluginConfig?.commandPrefix;
    if (typeof configuredPrefix === 'string' && configuredPrefix.length) {
      this.streamMonstersCommandPrefix = configuredPrefix;
    }
    if (
      gcce?.pluginConfig?.enabled === false
      || !gcce?.registerCommandsForPlugin
      || !gcce?.unregisterCommandsForPlugin
    ) {
      this.deactivateStreamMonstersGCCE();
      return false;
    }
    if (!force && this.streamMonstersGCCE === gcce) return true;
    if (this.streamMonstersGCCE && this.streamMonstersGCCE !== gcce) {
      this.deactivateStreamMonstersGCCE();
    }

    const rawDefinitions = this.buildStreamMonstersGCCECommandDefinitions(this.streamMonstersCommandPrefix);
    const canonicalNames = new Set(rawDefinitions.map(definition => definition.name));
    const definitions = rawDefinitions.map(definition => ({
      ...definition,
      aliases: definition.aliases.filter(alias => {
        if (canonicalNames.has(alias)) return false;
        const owner = gcce.registry?.getCommand?.(alias);
        if (!owner || owner.pluginId === 'streamalchemy') return true;
        this.api.log(
          `[STREAM MONSTERS] GCCE alias ${alias} is already owned by ${owner.pluginId}; alias skipped`,
          'warn'
        );
        return false;
      })
    }));
    try {
      gcce.unregisterCommandsForPlugin('streamalchemy');
      const registration = gcce.registerCommandsForPlugin('streamalchemy', definitions);
      if (!Array.isArray(registration?.registered) || registration.registered.length !== definitions.length) {
        gcce.unregisterCommandsForPlugin('streamalchemy');
        this.streamMonstersGCCE = null;
        this.api.log('[STREAM MONSTERS] GCCE command registration was incomplete; direct fallback remains active', 'warn');
        return false;
      }
      this.streamMonstersGCCE = gcce;
      return true;
    } catch (error) {
      this.api.log(`[STREAM MONSTERS] GCCE command registration failed: ${error.message}`, 'warn');
      try {
        gcce.unregisterCommandsForPlugin('streamalchemy');
      } catch {
        // The direct fallback remains available even if GCCE cleanup fails.
      }
      this.streamMonstersGCCE = null;
      return false;
    }
  }

  deactivateStreamMonstersGCCE() {
    if (this.streamMonstersGCCE?.unregisterCommandsForPlugin) {
      this.streamMonstersGCCE.unregisterCommandsForPlugin('streamalchemy');
    }
    this.streamMonstersGCCE = null;
  }

  setupStreamMonstersGCCELifecycle() {
    if (this.streamMonstersGCCELifecycleListeners.length || typeof this.api.on !== 'function') return;
    const pluginId = payload => typeof payload === 'string' ? payload : payload?.id;
    const activate = (eventName, payload) => {
      if (pluginId(payload) !== 'gcce') return;
      this.integrateStreamMonstersGCCE({
        force: eventName === 'plugin:reloaded',
        candidate: payload?.instance || null
      });
    };
    const deactivate = payload => {
      if (pluginId(payload) === 'gcce') this.deactivateStreamMonstersGCCE();
    };
    const listeners = [
      ['plugin:loaded', payload => activate('plugin:loaded', payload)],
      ['plugin:enabled', payload => activate('plugin:enabled', payload)],
      ['plugin:reloaded', payload => activate('plugin:reloaded', payload)],
      ['plugin:disabled', deactivate],
      ['plugin:unloaded', deactivate]
    ];
    listeners.forEach(([event, callback]) => {
      if (this.api.on(event, callback)) {
        this.streamMonstersGCCELifecycleListeners.push({ event, callback });
      }
    });
  }

  removeStreamMonstersGCCELifecycle() {
    for (const { event, callback } of this.streamMonstersGCCELifecycleListeners || []) {
      if (typeof this.api.removeListener === 'function') this.api.removeListener(event, callback);
    }
    this.streamMonstersGCCELifecycleListeners = [];
  }

  normalizeStreamMonstersFallbackCommand(message) {
    const rawMessage = String(message || '').trim();
    const prefix = this.streamMonstersCommandPrefix || '!';
    if (!rawMessage.startsWith(prefix)) return rawMessage;
    const [rawCommand, ...args] = rawMessage.split(/\s+/);
    const requested = rawCommand.slice(prefix.length).toLowerCase();
    const definition = this.buildStreamMonstersGCCECommandDefinitions(prefix).find(command => (
      command.name === requested || command.aliases.includes(requested)
    ));
    if (!definition) return rawMessage;
    return `!${definition.streamMonstersAction}${args.length ? ` ${args.join(' ')}` : ''}`;
  }

  async handleStreamMonstersGift(data = {}) {
    const userId = data.uniqueId || data.userId || data.username;
    const giftId = Number.parseInt(data.giftId, 10);
    const giftName = data.giftName || data.name;
    const coinValue = Number.parseInt(data.diamondCount ?? data.coins ?? 0, 10) || 0;
    const repeatCount = Math.max(Number.parseInt(data.repeatCount || 1, 10) || 1, 1);
    if (!userId || !giftId || !giftName) {
      this.api.log('[STREAMMONSTERS] Ignored invalid gift event', 'warn');
      return;
    }
    const eventTimeMs = Date.now();
    for (let index = 0; index < repeatCount; index += 1) {
      this.streamMonstersEngine.processGift({
        userId,
        giftId,
        giftName,
        coinValue,
        eventTimeMs: eventTimeMs + index
      });
    }
  }

  async handleStreamMonstersChat(data = {}) {
    if (this.streamMonstersGCCE) return { success: false, status: 'gcce_active' };
    const userId = data.uniqueId || data.userId || data.username;
    if (!userId) return;
    const message = data.comment || data.message || data.text || '';
    const normalizedMessage = this.normalizeStreamMonstersFallbackCommand(message);
    const result = this.streamMonstersChatCommands.handle({ userId, username: userId }, normalizedMessage);
    if (result.status !== 'ignored') {
      this.api.emit('streammonsters:chat_result', {
        userId,
        result,
        bottomOverlayDurationMs: this.config.streamMonsters.bottomOverlayDurationMs
      });
    }
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
