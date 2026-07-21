const path = require('path');

class StreamMonstersRoutes {
  constructor({ api, pluginDir, store, engine, generationPool, systemAnalyzer, managedRuntime, localModelInstaller, giftCatalogProvider, configProvider }) {
    this.api = api;
    this.pluginDir = pluginDir;
    this.store = store;
    this.engine = engine;
    this.generationPool = generationPool;
    this.systemAnalyzer = systemAnalyzer;
    this.managedRuntime = managedRuntime;
    this.localModelInstaller = localModelInstaller;
    this.giftCatalogProvider = giftCatalogProvider || (() => []);
    this.configProvider = configProvider;
  }

  register() {
    this.api.registerRoute('GET', '/streammonsters/ui', (req, res) => {
      res.sendFile(path.join(this.pluginDir, 'streammonsters-ui.html'));
    });
    this.api.registerRoute('GET', '/streammonsters/overlay', (req, res) => {
      res.sendFile(path.join(this.pluginDir, 'streammonsters-overlay.html'));
    });
    this.api.registerRoute('GET', '/api/streammonsters/state', (req, res) => {
      const userId = String(req.query?.userId || '').trim();
      const config = this.configProvider.getConfig().streamMonsters;
      res.json({
        success: true,
        config: this.publicConfig(config),
        viewer: userId ? this.viewerState(userId) : null,
        pool: this.store.getGenerationPool(),
        metrics: this.engine.streamKey ? this.store.getStreamMetrics(this.engine.streamKey) : null
      });
    });
    this.api.registerRoute('POST', '/api/streammonsters/config', (req, res) => {
      const next = this.configProvider.updateConfig({ streamMonsters: req.body || {} });
      res.json({ success: true, config: this.publicConfig(next.streamMonsters) });
    });
    this.api.registerRoute('POST', '/api/streammonsters/demo', (req, res) => {
      const config = this.configProvider.getConfig().streamMonsters;
      const gift = this.engine.describeGift({ giftId: 0, giftName: 'Demo Spark', coinValue: 0 });
      const egg = {
        egg_id: 'demo-egg', user_id: 'demo-viewer', gift_id: 0, gift_name: 'Demo Spark',
        element: gift.element, egg_color: gift.eggColor, state: 'incubating',
        hatch_duration_ms: config.hatchDurationMs, boost_ms: 0
      };
      this.api.emit('streammonsters:egg_spawned', { userId: 'demo-viewer', egg, gift, demo: true, hint: '!inventory' });
      this.api.emit('streammonsters:egg_hatched', {
        userId: 'demo-viewer', egg, demo: true,
        monster: { monster_id: 'demo-monster', name: `${gift.element}ling`, element: gift.element, rarity: 'Rare' }
      });
      res.json({ success: true, demo: true });
    });
    this.api.registerRoute('GET', '/api/streammonsters/gift-catalog', (req, res) => {
      const gifts = this.giftCatalogProvider().slice(0, 100).map(gift => ({
        giftId: Number(gift.id ?? gift.gift_id),
        giftName: gift.name || gift.gift_name || `Gift ${gift.id ?? gift.gift_id}`,
        coinValue: Number(gift.diamond_count ?? gift.coin_value ?? gift.coinValue ?? 0),
        imageUrl: gift.image_url || gift.imageUrl || null
      })).filter(gift => Number.isInteger(gift.giftId) && gift.giftId > 0);
      res.json({ success: true, gifts });
    });
    this.api.registerRoute('GET', '/api/streammonsters/pool', (req, res) => {
      res.json({ success: true, entries: this.store.getGenerationPool() });
    });
    this.api.registerRoute('POST', '/api/streammonsters/pool', (req, res) => {
      try {
        const gifts = Array.isArray(req.body?.gifts) ? req.body.gifts : [req.body || {}];
        const entries = gifts.map(input => {
          const giftId = Number.parseInt(input.giftId, 10);
          if (!giftId) throw new Error('STREAM_MONSTERS_GIFT_ID_REQUIRED');
          const gift = this.engine.describeGift({
            giftId,
            giftName: input.giftName || input.name || `Gift ${giftId}`,
            coinValue: input.coinValue || input.diamondCount || 0
          });
          if (input.effect === 'boost') {
            this.store.upsertGiftMapping({ ...gift, effect: 'boost' });
          }
          return this.generationPool.queueGift(gift);
        });
        res.json({ success: true, entries });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });
    this.api.registerRoute('POST', '/api/streammonsters/pool/prepare', async (req, res) => {
      try {
        const entries = await this.generationPool.preparePending();
        res.json({ success: true, entries });
      } catch (error) {
        res.status(409).json({ success: false, error: error.message });
      }
    });
    this.api.registerRoute('GET', '/api/streammonsters/local-runtime/status', async (req, res) => {
      const config = this.configProvider.getConfig().streamMonsters;
      const analysis = await this.systemAnalyzer.analyze({
        comfyUrl: this.configProvider.getConfig().localGeneration?.comfyUrl,
        comfyRootDir: this.configProvider.getConfig().localGeneration?.comfyRootDir
      });
      const recommendation = this.managedRuntime.recommend(analysis.gpu);
      res.json({
        success: true,
        runtime: this.managedRuntime.current || { state: recommendation.supported ? 'ready_to_install' : 'expert_or_remote' },
        recommendation,
        manifestAvailable: Boolean(config.localRuntime?.manifest),
        installDetails: this.publicInstallDetails(config.localRuntime?.manifest)
      });
    });
    this.api.registerRoute('POST', '/api/streammonsters/local-runtime/install', async (req, res) => {
      try {
        const current = this.configProvider.getConfig();
        const analysis = await this.systemAnalyzer.analyze({
          comfyUrl: current.localGeneration?.comfyUrl,
          comfyRootDir: current.localGeneration?.comfyRootDir
        });
        const manifest = current.streamMonsters?.localRuntime?.manifest;
        if (!/^[a-f0-9]{64}$/i.test(manifest?.modelSha256 || '')) {
          throw new Error('STREAM_MONSTERS_MODEL_CHECKSUM_REQUIRED');
        }
        const runtime = await this.managedRuntime.install(analysis.gpu, manifest);
        const comfyRootDir = path.resolve(runtime.runtimeRoot, manifest.comfyRootRelativePath || 'ComfyUI');
        const localGeneration = {
          enabled: true,
          generationMode: 'local_strict',
          comfyUrl: manifest.healthBaseUrl || 'http://127.0.0.1:8188',
          comfyRootDir,
          selectedPresetId: runtime.recommendation.presetId,
          width: runtime.recommendation.width,
          height: runtime.recommendation.height,
          steps: runtime.recommendation.steps,
          concurrency: 1,
          modelChecksumSha256: manifest.modelSha256
        };
        const model = this.localModelInstaller?.startInstall(localGeneration) || null;
        const next = this.configProvider.updateConfig({
          streamMonsters: {
            localRuntime: { ...current.streamMonsters?.localRuntime, state: runtime.state, runtimeRoot: runtime.runtimeRoot }
          },
          localGeneration
        });
        res.json({ success: true, runtime, model, config: this.publicConfig(next.streamMonsters) });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });
  }

  viewerState(userId) {
    return {
      progress: this.store.getViewerProgress(userId),
      eggs: this.store.getViewerEggs(userId),
      monsters: this.store.getViewerMonsters(userId),
      selectedMonster: this.store.getSelectedMonster(userId)
    };
  }

  publicConfig(config = {}) {
    return {
      enabled: Boolean(config.enabled),
      creatorName: config.creatorName || '',
      hatchDurationMs: config.hatchDurationMs,
      maxUnhatchedEggs: config.maxUnhatchedEggs,
      elementRules: config.elementRules || 'deterministic'
    };
  }

  publicInstallDetails(manifest) {
    if (!manifest) return null;
    let targetDir = null;
    try { targetDir = this.managedRuntime.resolveRuntimeRoot(); } catch (_) {}
    return {
      runtimeDownloadBytes: Math.max(0, Number(manifest.downloadSizeBytes) || 0),
      modelDownloadBytes: Math.max(0, Number(manifest.modelSizeBytes) || 0),
      targetDir
    };
  }
}

module.exports = StreamMonstersRoutes;
