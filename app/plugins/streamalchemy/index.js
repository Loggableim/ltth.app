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

const RUNTIME_TRUST_FIELDS = new Set([
  'manifest', 'archiveUrl', 'sha256', 'modelSha256', 'archiveType',
  'executableRelativePath', 'executableArgs', 'comfyRootRelativePath',
  'healthBaseUrl', 'healthUrl', 'downloadSizeBytes', 'modelSizeBytes'
]);

class StreamAlchemyPlugin {
  constructor(api) {
    this.api = api;
    this.pluginDir = api.pluginDir || __dirname;
    this.config = null;
  }

  async init() {
    this.api.log('[STREAMALCHEMY] Initializing relaunch runtime', 'info');
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
    this.streamMonstersProgression = new StreamMonstersProgressionService({ store: this.streamMonstersStore });
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
    this.streamMonstersEngine.generationPool = this.streamMonstersGenerationPool;

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
      store: this.streamMonstersStore,
      engine: this.streamMonstersEngine,
      generationPool: this.streamMonstersGenerationPool,
      systemAnalyzer: this.systemAnalyzer,
      managedRuntime: this.streamMonstersManagedRuntime,
      localModelInstaller: this.localModelInstaller,
      giftCatalogProvider: () => this.getStreamMonstersGiftCatalog(),
      configProvider: {
        getConfig: () => this.config,
        updateConfig: updates => this.updateConfig(updates)
      }
    });
    this.streamMonstersRoutes.register();
    this.integrateStreamMonstersGCCE();

    this.api.registerTikTokEvent('gift', async data => {
      if (!this.config.enabled) return;
      await this.handleStreamMonstersGift(data);
    });
    this.api.registerTikTokEvent('chat', async data => this.handleStreamMonstersChat(data));
    this.api.registerTikTokEvent('streamSessionStarted', async data => this.handleStreamMonstersSession(data));

    this.api.log('[STREAMALCHEMY] Relaunch runtime initialized', 'info');
  }

  loadConfig(storedConfig = this.api.getConfig('streamalchemy_config')) {
    const stored = this.sanitizeConfig(storedConfig);
    const storedStreamMonsters = stored.streamMonsters || {};
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
        hatchDurationMs: 30 * 60 * 1000,
        maxUnhatchedEggs: 3,
        elementRules: 'deterministic',
        ...storedStreamMonsters,
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
      this.api.log(`[STREAMALCHEMY] Central setting ${key} unavailable: ${error.message}`, 'debug');
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
    return this.config;
  }

  async destroy() {
    if (this.streamMonstersGCCE?.unregisterCommandsForPlugin) {
      this.streamMonstersGCCE.unregisterCommandsForPlugin('streamalchemy');
    }
    this.api.log('[STREAMALCHEMY] Relaunch runtime stopped', 'info');
  }

  getStreamMonstersGiftCatalog() {
    try {
      const database = this.api.getDatabase();
      if (typeof database?.getGiftCatalog === 'function') return database.getGiftCatalog() || [];
      const sqlite = database?.db || database;
      if (!sqlite?.prepare) return [];
      return sqlite.prepare(`
        SELECT id, name, image_url, diamond_count
        FROM gift_catalog
        ORDER BY diamond_count DESC, id ASC
        LIMIT 100
      `).all();
    } catch (error) {
      this.api.log(`[STREAM MONSTERS] Gift catalog unavailable: ${error.message}`, 'debug');
      return [];
    }
  }

  integrateStreamMonstersGCCE() {
    const gcce = this.api.pluginLoader?.loadedPlugins?.get('gcce')?.instance;
    if (!gcce?.registerCommandsForPlugin || !gcce?.unregisterCommandsForPlugin) return false;
    const definitions = [
      ['inventory', 'Show your Stream Monsters inventory', 0, 0],
      ['monsters', 'Show your Stream Monsters', 0, 0],
      ['choose', 'Choose a monster by slot', 1, 1],
      ['battle', 'Join the public Stream Monsters battle queue', 0, 0],
      ['leavebattle', 'Leave the Stream Monsters battle queue', 0, 0],
      ['monstershelp', 'Show Stream Monsters commands', 0, 0]
    ].map(([name, description, minArgs, maxArgs]) => ({
      name,
      description,
      syntax: `!${name}${minArgs ? ' <slot>' : ''}`,
      permission: 'all',
      enabled: true,
      minArgs,
      maxArgs,
      category: 'Stream Monsters',
      cooldown: { user: name === 'battle' ? 2000 : 1000, global: 250 },
      handler: async (args, context) => this.streamMonstersChatCommands.handle(
        { username: context?.username || context?.uniqueId || context?.userId },
        `!${name}${Array.isArray(args) && args.length ? ` ${args.join(' ')}` : ''}`
      )
    }));
    gcce.unregisterCommandsForPlugin('streamalchemy');
    gcce.registerCommandsForPlugin('streamalchemy', definitions);
    this.streamMonstersGCCE = gcce;
    return true;
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
    for (let index = 0; index < repeatCount; index += 1) {
      this.streamMonstersEngine.processGift({ userId, giftId, giftName, coinValue });
    }
    this.streamMonstersEngine.hatchReadyEggs(userId);
  }

  async handleStreamMonstersChat(data = {}) {
    const userId = data.uniqueId || data.userId || data.username;
    if (!userId) return;
    const message = data.comment || data.message || data.text || '';
    const result = this.streamMonstersChatCommands.handle({ userId, username: userId }, message);
    if (result.status !== 'ignored') {
      this.api.emit('streammonsters:chat_result', { userId, result });
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
