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
const OverlayPublisher = require('./backend/overlay-publisher');
const CraftingEngine = require('./backend/crafting-engine');
const EventProcessor = require('./backend/event-processor');
const StreamAlchemyRoutes = require('./backend/routes');
const { DEFAULT_CONFIG } = require('./backend/constants');
const CraftingService = require('./craftingService');
const SiliconFlowService = require('./siliconFlowService');
const LightXService = require('./lightxService');

class StreamAlchemyPlugin {
  constructor(api) {
    this.api = api;
    this.pluginDir = api.pluginDir || __dirname;
    this.config = null;
  }

  async init() {
    this.api.log('[STREAMALCHEMY] Initializing relaunch runtime', 'info');
    this.config = this.loadConfig();

    const logger = {
      info: msg => this.api.log(msg, 'info'),
      warn: msg => this.api.log(msg, 'warn'),
      error: msg => this.api.log(msg, 'error'),
      debug: msg => this.api.log(msg, 'debug')
    };

    this.store = new StreamAlchemyDatabase(this.api.getDatabase(), logger);
    this.store.initialize();

    this.promptService = new PromptService({ promptVersion: this.config.promptVersion });
    this.recipeService = new RecipeService(this.store, this.promptService);
    this.inventoryService = new InventoryService(this.store);
    this.overlayPublisher = new OverlayPublisher(this.api);

    this.providers = this.createProviders(logger);
    this.localModelInstaller = new LocalModelInstaller({
      dataDir: this.getPluginDataDir(),
      logger
    });

    this.generationService = new GenerationService(this.store, logger, {
      providerOrder: this.config.providerOrder,
      providers: this.providers
    });

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

    this.systemAnalyzer = new SystemAnalyzer();
    this.routes = new StreamAlchemyRoutes({
      api: this.api,
      pluginDir: this.pluginDir,
      store: this.store,
      generationService: this.generationService,
      systemAnalyzer: this.systemAnalyzer,
      localModelInstaller: this.localModelInstaller,
      configProvider: {
        getConfig: () => this.config,
        updateConfig: updates => this.updateConfig(updates)
      }
    });
    this.routes.register();

    this.api.registerTikTokEvent('gift', async data => {
      if (!this.config.enabled) return;
      await this.eventProcessor.handleGiftEvent(data);
    });

    this.api.log('[STREAMALCHEMY] Relaunch runtime initialized', 'info');
  }

  loadConfig() {
    const stored = this.api.getConfig('streamalchemy_config') || {};
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      localGeneration: {
        ...DEFAULT_CONFIG.localGeneration,
        ...(stored.localGeneration || {})
      }
    };
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
        config: this.config.localGeneration,
        dataDir: this.getPluginDataDir(),
        logger
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

  updateConfig(updates) {
    const localGenerationUpdates = {
      ...(updates.localGeneration || {})
    };
    if (Object.prototype.hasOwnProperty.call(localGenerationUpdates, 'modelAuthToken') && !this.normalizeSecret(localGenerationUpdates.modelAuthToken)) {
      delete localGenerationUpdates.modelAuthToken;
    }

    this.config = {
      ...this.config,
      ...updates,
      localGeneration: {
        ...this.config.localGeneration,
        ...localGenerationUpdates
      }
    };
    this.api.setConfig('streamalchemy_config', this.config);
    return this.config;
  }

  async destroy() {
    this.api.log('[STREAMALCHEMY] Relaunch runtime stopped', 'info');
  }
}

module.exports = StreamAlchemyPlugin;
