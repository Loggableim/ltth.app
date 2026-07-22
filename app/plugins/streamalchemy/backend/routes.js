const path = require('path');

class StreamAlchemyRoutes {
  constructor({ api, pluginDir, store, generationService, systemAnalyzer, configProvider, localModelInstaller, modelCatalog }) {
    this.api = api;
    this.pluginDir = pluginDir;
    this.store = store;
    this.generationService = generationService;
    this.systemAnalyzer = systemAnalyzer;
    this.configProvider = configProvider;
    this.localModelInstaller = localModelInstaller;
    this.modelCatalog = modelCatalog;
  }

  register() {
    this.api.registerRoute('GET', '/streamalchemy/ui', (req, res) => {
      res.sendFile(path.join(this.pluginDir, 'streammonsters-ui.html'));
    });

    this.api.registerRoute('GET', '/streamalchemy/overlay', (req, res) => {
      res.sendFile(path.join(this.pluginDir, 'streammonsters-overlay.html'));
    });

    this.api.registerRoute('GET', '/api/streamalchemy/config', async (req, res) => {
      res.json({
        success: true,
        config: this.maskConfig(this.configProvider.getConfig())
      });
    });

    this.api.registerRoute('POST', '/api/streamalchemy/config', async (req, res) => {
      const config = this.configProvider.updateConfig(req.body || {});
      res.json({ success: true, config: this.maskConfig(config) });
    });

    this.api.registerRoute('GET', '/api/streamalchemy/items', async (req, res) => {
      res.json({ success: true, items: this.store.getAllItems() });
    });

    this.api.registerRoute('GET', '/api/streamalchemy/recipes', async (req, res) => {
      res.json({ success: true, recipes: this.store.getAllRecipes() });
    });

    this.api.registerRoute('GET', '/api/streamalchemy/generation-jobs', async (req, res) => {
      res.json({ success: true, jobs: this.store.getGenerationJobs() });
    });

    this.api.registerRoute('GET', '/api/streamalchemy/model-catalog', async (req, res) => {
      const config = this.configProvider.getConfig();
      res.json({
        success: true,
        presets: await this.modelCatalog.getUiCatalog(config.localGeneration || {})
      });
    });

    this.api.registerRoute('GET', '/api/streamalchemy/providers/status', async (req, res) => {
      res.json({ success: true, providers: await this.generationService.getProviderStatuses() });
    });

    this.api.registerRoute('GET', '/api/streamalchemy/local-model/status', async (req, res) => {
      const config = this.configProvider.getConfig();
      res.json({
        success: true,
        model: await this.localModelInstaller.getStatus(config.localGeneration || {})
      });
    });

    this.api.registerRoute('POST', '/api/streamalchemy/local-model/install', async (req, res) => {
      try {
        const config = this.configProvider.getConfig();
        const presetId = req.body?.presetId;
        const updatedConfig = presetId
          ? this.configProvider.updateConfig({
            localGeneration: {
              selectedPresetId: presetId
            }
          })
          : config;
        const nextConfig = updatedConfig || {
          ...config,
          localGeneration: {
            ...(config?.localGeneration || {}),
            ...(presetId ? { selectedPresetId: presetId } : {})
          }
        };
        res.json({
          success: true,
          model: this.localModelInstaller.startInstall(nextConfig.localGeneration || {})
        });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('GET', '/api/streamalchemy/system-analysis', async (req, res) => {
      const config = this.configProvider.getConfig();
      res.json({
        success: true,
        analysis: await this.systemAnalyzer.analyze({
          comfyUrl: config.localGeneration?.comfyUrl,
          comfyRootDir: config.localGeneration?.comfyRootDir,
          selectedPresetId: config.localGeneration?.selectedPresetId
        })
      });
    });

    this.api.registerRoute('POST', '/api/streamalchemy/local-generation/test', async (req, res) => {
      try {
        res.json({
          success: true,
          result: await this.generationService.testLocalGeneration()
        });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });
  }

  maskConfig(config) {
    const clone = JSON.parse(JSON.stringify(config || {}));
    delete clone.openaiApiKey;
    delete clone.siliconFlowApiKey;
    delete clone.lightxApiKey;
    if (clone.localGeneration) {
      delete clone.localGeneration.modelAuthToken;
    }
    return clone;
  }
}

module.exports = StreamAlchemyRoutes;
