const path = require('path');
const { createAdminAuth } = require('../../../../modules/admin-auth');
const COMMAND_ALIAS_ACTIONS = new Set([
  'eggs', 'hatch', 'monsters', 'monster', 'choose',
  'battle', 'leavebattle', 'rank', 'quests', 'monstershelp'
]);

class StreamMonstersRoutes {
  constructor({
    api,
    pluginDir,
    dataDir,
    store,
    engine,
    generationPool,
    artPool = null,
    progression = null,
    systemAnalyzer,
    managedRuntime,
    localModelInstaller,
    giftCatalogProvider,
    configProvider
  }) {
    this.api = api;
    this.pluginDir = pluginDir;
    this.dataDir = dataDir || pluginDir;
    this.store = store;
    this.engine = engine;
    this.generationPool = generationPool;
    this.artPool = artPool;
    this.progression = progression;
    this.systemAnalyzer = systemAnalyzer;
    this.managedRuntime = managedRuntime;
    this.localModelInstaller = localModelInstaller;
    this.giftCatalogProvider = giftCatalogProvider || (() => []);
    this.configProvider = configProvider;
    this.adminAuth = createAdminAuth();
  }

  register() {
    this.api.registerRoute('GET', '/streammonsters/ui', (req, res) => {
      res.sendFile(path.join(this.pluginDir, 'streammonsters-ui.html'));
    });
    this.api.registerRoute('GET', '/streammonsters/overlay', (req, res) => {
      res.sendFile(path.join(this.pluginDir, 'streammonsters-overlay.html'));
    });
    this.api.registerRoute('GET', '/api/streammonsters/art/:filename', (req, res) => {
      const filename = String(req.params?.filename || '');
      if (!/^(?:ai|kenney)-[a-z0-9.-]+\.(?:png|jpg|jpeg|webp|svg)$/i.test(filename) || path.basename(filename) !== filename) {
        return res.status(400).json({ success: false, error: 'STREAM_MONSTERS_ART_PATH_INVALID' });
      }
      return res.sendFile(path.join(this.dataDir, 'streammonsters', 'monster-art', filename));
    });
    this.api.registerRoute('GET', '/api/streammonsters/state', (req, res) => {
      const userId = String(req.query?.userId || '').trim();
      const config = this.configProvider.getConfig().streamMonsters;
      const season = this.progression?.getCurrentSeason?.() || null;
      res.json({
        success: true,
        config: this.publicConfig(config),
        viewer: userId ? this.viewerState(userId) : null,
        pool: this.artPool?.coverage?.(config.artPoolTarget) || this.store.getArtPoolCoverage(),
        hype: this.store.getStreamHype(this.engine.streamKey),
        season,
        metrics: this.engine.streamKey ? this.store.getStreamMetrics(this.engine.streamKey) : null
      });
    });
    this.api.registerRoute('POST', '/api/streammonsters/config', this.protectAdmin((req, res) => {
      const next = this.configProvider.updateConfig({ streamMonsters: this.sanitizeConfigUpdate(req.body) });
      res.json({ success: true, config: this.publicConfig(next.streamMonsters) });
    }));
    this.api.registerRoute('POST', '/api/streammonsters/demo', this.protectAdmin((req, res) => {
      const config = this.configProvider.getConfig().streamMonsters;
      const gift = {
        giftId: 0,
        giftName: 'Demo Crystal',
        coinValue: 1,
        element: 'Volt',
        eggColor: '#f1ca43',
        effect: 'spawn'
      };
      const egg = {
        egg_id: 'demo-egg', user_id: 'demo-viewer', gift_id: 0, gift_name: gift.giftName,
        element: gift.element, egg_color: gift.eggColor, state: 'incubating', variant: 'charged',
        hatch_duration_ms: config.hatchDurationMs, boost_ms: 0,
        image_url: '/plugins/streamalchemy/assets/eggs/volt-charged.png'
      };
      const monster = {
        monster_id: 'demo-monster',
        name: 'Sparkfin',
        element: gift.element,
        personality: 'Mischievous',
        rarity: 'Charged',
        level: 4,
        stats: { vitality: 7, might: 8, guard: 6, agility: 7 },
        image_url: '/plugins/streamalchemy/assets/branding/stream-monsters-icon.png'
      };
      const opponent = {
        monster_id: 'demo-opponent',
        name: 'Mossbit',
        element: 'Grove',
        personality: 'Brave',
        level: 5
      };
      const rounds = [
        { number: 1, firstDamage: 8, secondDamage: 6, hpA: 50, hpB: 48, elementAdvantageMonsterId: monster.monster_id },
        { number: 2, firstDamage: 7, secondDamage: 9, hpA: 41, hpB: 41, elementAdvantageMonsterId: monster.monster_id },
        { number: 3, firstDamage: 10, secondDamage: 6, hpA: 35, hpB: 31, elementAdvantageMonsterId: monster.monster_id }
      ];
      const battle = {
        battleId: 'demo-battle',
        seed: 'collector-arena-demo-seed',
        monsterAId: monster.monster_id,
        monsterBId: opponent.monster_id,
        winnerId: monster.monster_id,
        elementAdvantageMonsterId: monster.monster_id,
        rounds
      };
      const emit = (event, payload) => this.api.emit(event, { ...payload, demo: true });
      emit('streammonsters:egg_spawned', { userId: 'demo-viewer', egg, gift, hint: '!eggs' });
      emit('streammonsters:hype_changed', {
        userId: 'demo-viewer',
        hype: { points: 0, charged_eggs: 1 }
      });
      emit('streammonsters:egg_ready', {
        userId: 'demo-viewer',
        egg: { ...egg, state: 'ready' },
        hint: '!hatch 1'
      });
      emit('streammonsters:hatch_started', { userId: 'demo-viewer', egg, slot: 1 });
      emit('streammonsters:egg_hatched', { userId: 'demo-viewer', egg, monster });
      emit('streammonsters:monster_visual_evolved', {
        userId: 'demo-viewer',
        monster: { ...monster, image_url: '/plugins/streamalchemy/assets/branding/stream-monsters-logo.png' },
        previousVisualSource: 'kenney',
        visualSource: 'ai'
      });
      emit('streammonsters:achievement_unlocked', {
        userId: 'demo-viewer',
        achievement: { achievement_key: 'charged_hatch' }
      });
      emit('streammonsters:battle_started', {
        challenger: monster,
        defender: opponent,
        seed: battle.seed,
        elementAdvantageMonsterId: monster.monster_id
      });
      rounds.forEach(round => emit('streammonsters:battle_round', { battleId: battle.battleId, round }));
      emit('streammonsters:battle_completed', { battle, winner: monster });
      emit('streammonsters:season_rank_changed', {
        userId: 'demo-viewer',
        before: 'Bronze',
        after: 'Silver',
        score: {
          points: 100,
          rank: 'Silver',
          title: 'Silver Collector',
          badge: 'silver',
          frame: 'silver'
        }
      });
      emit('streammonsters:chat_result', {
        userId: 'demo-viewer',
        result: { status: 'rank', message: 'Silver · 100 season points.' }
      });
      res.json({ success: true, demo: true });
    }));
    this.api.registerRoute('GET', '/api/streammonsters/gift-catalog', (req, res) => {
      const normalized = this.normalizedGiftCatalog(req.query?.locale);
      const query = String(req.query?.q || '').trim().toLocaleLowerCase();
      const filtered = query
        ? normalized.filter(gift => (
          gift.giftName.toLocaleLowerCase().includes(query) ||
          String(gift.giftId).includes(query)
        ))
        : normalized;
      const hasPaging = req.query?.offset !== undefined || req.query?.limit !== undefined;
      const offset = hasPaging ? Math.max(0, Number.parseInt(req.query?.offset, 10) || 0) : 0;
      const limit = hasPaging
        ? Math.max(1, Math.min(200, Number.parseInt(req.query?.limit, 10) || 50))
        : filtered.length;
      res.json({
        success: true,
        gifts: filtered.slice(offset, offset + limit),
        total: filtered.length,
        offset,
        limit
      });
    });
    this.api.registerRoute('GET', '/api/streammonsters/gift-mappings', (req, res) => {
      res.json({ success: true, mappings: this.store.getGiftMappings() });
    });
    this.api.registerRoute('PUT', '/api/streammonsters/gift-mappings/:giftId', this.protectAdmin((req, res) => {
      try {
        const giftId = Number.parseInt(req.params?.giftId, 10);
        const input = req.body || {};
        const effect = input.effect;
        const element = input.element;
        if (!giftId || !['spawn', 'boost'].includes(effect)) {
          throw new Error('STREAM_MONSTERS_GIFT_MAPPING_INVALID');
        }
        if (effect === 'spawn' && !['Random', 'Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'].includes(element)) {
          throw new Error('STREAM_MONSTERS_GIFT_ELEMENT_INVALID');
        }
        const catalogGift = this.normalizedGiftCatalog().find(gift => gift.giftId === giftId);
        const mapping = this.store.upsertGiftMapping({
          giftId,
          giftName: catalogGift?.giftName || `Gift ${giftId}`,
          coinValue: catalogGift?.coinValue || 0,
          imageUrl: catalogGift?.imageUrl || null,
          enabled: input.enabled !== false,
          effect,
          element: effect === 'spawn' ? element : (element || null)
        });
        res.json({ success: true, mapping });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    }));
    this.api.registerRoute('DELETE', '/api/streammonsters/gift-mappings/:giftId', this.protectAdmin((req, res) => {
      const giftId = Number.parseInt(req.params?.giftId, 10);
      res.json({ success: true, removed: giftId ? this.store.deleteGiftMapping(giftId) : false });
    }));
    this.api.registerRoute('GET', '/api/streammonsters/pool', (req, res) => {
      const config = this.configProvider.getConfig().streamMonsters;
      res.json({
        success: true,
        coverage: this.artPool?.coverage?.(config.artPoolTarget) || this.store.getArtPoolCoverage()
      });
    });
    this.api.registerRoute('POST', '/api/streammonsters/pool', this.protectAdmin((req, res) => {
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
    }));
    this.api.registerRoute('POST', '/api/streammonsters/pool/prepare', this.protectAdmin(async (req, res) => {
      try {
        const targetPerVariant = Math.max(1, Math.min(
          8,
          Number.parseInt(req.body?.targetPerVariant, 10) || 3
        ));
        const result = this.artPool
          ? await this.artPool.prepare({ targetPerVariant })
          : { entries: await this.generationPool.preparePending() };
        res.json({ success: true, ...result });
      } catch (error) {
        res.status(409).json({ success: false, error: error.message });
      }
    }));
    this.api.registerRoute('GET', '/api/streammonsters/season', (req, res) => {
      res.json({ success: true, season: this.progression?.getCurrentSeason?.() || null });
    });
    this.api.registerRoute('GET', '/api/streammonsters/leaderboard', (req, res) => {
      const limit = Math.max(1, Math.min(100, Number.parseInt(req.query?.limit, 10) || 50));
      res.json({
        success: true,
        entries: this.progression?.getLeaderboard?.(limit) || []
      });
    });
    this.api.registerRoute('GET', '/api/streammonsters/local-runtime/status', async (req, res) => {
      const manifest = this.managedRuntime.getTrustedManifest();
      const analysis = await this.systemAnalyzer.analyze({
        comfyUrl: this.configProvider.getConfig().localGeneration?.comfyUrl,
        comfyRootDir: this.configProvider.getConfig().localGeneration?.comfyRootDir
      });
      const recommendation = this.managedRuntime.recommend(analysis.gpu);
      res.json({
        success: true,
        runtime: this.managedRuntime.current || { state: recommendation.supported ? 'ready_to_install' : 'expert_or_remote' },
        recommendation,
        manifestAvailable: Boolean(manifest),
        installDetails: this.publicInstallDetails(manifest)
      });
    });
    this.api.registerRoute('POST', '/api/streammonsters/local-runtime/install', this.protectAdmin(async (req, res) => {
      try {
        const current = this.configProvider.getConfig();
        const analysis = await this.systemAnalyzer.analyze({
          comfyUrl: current.localGeneration?.comfyUrl,
          comfyRootDir: current.localGeneration?.comfyRootDir
        });
        const manifest = this.managedRuntime.getTrustedManifest();
        if (!manifest) throw new Error('STREAM_MONSTERS_RUNTIME_MANIFEST_UNAVAILABLE');
        const runtime = await this.managedRuntime.install(analysis.gpu);
        const comfyRootDir = runtime.comfyRootDir || this.managedRuntime.resolveExistingInside(
          runtime.runtimeRoot,
          manifest.comfyRootRelativePath || 'ComfyUI'
        );
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
            localRuntime: { state: runtime.state, runtimeRoot: runtime.runtimeRoot }
          },
          localGeneration
        });
        res.json({ success: true, runtime, model, config: this.publicConfig(next.streamMonsters) });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    }));
  }

  protectAdmin(handler) {
    return (req, res, next) => this.adminAuth(req, res, () => handler(req, res, next));
  }

  sanitizeConfigUpdate(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const safe = {};
    for (const key of ['enabled', 'creatorName', 'hatchDurationMs', 'maxUnhatchedEggs', 'elementRules']) {
      if (Object.prototype.hasOwnProperty.call(input, key)) safe[key] = input[key];
    }
    if (['furry', 'art_lab', 'kenney'].includes(input.visualPack)) safe.visualPack = input.visualPack;
    if (Object.prototype.hasOwnProperty.call(input, 'artPoolTarget')) {
      safe.artPoolTarget = Math.max(1, Math.min(8, Number.parseInt(input.artPoolTarget, 10) || 3));
    }
    if (Object.prototype.hasOwnProperty.call(input, 'bottomOverlayDurationMs')) {
      safe.bottomOverlayDurationMs = Math.max(
        4_000,
        Math.min(20_000, Number.parseInt(input.bottomOverlayDurationMs, 10) || 8_000)
      );
    }
    if (Object.prototype.hasOwnProperty.call(input, 'commandAliases')) {
      safe.commandAliases = this.sanitizeCommandAliases(input.commandAliases);
    }
    return safe;
  }

  sanitizeCommandAliases(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const safe = {};
    for (const [action, inputAliases] of Object.entries(input)) {
      if (!COMMAND_ALIAS_ACTIONS.has(action)) continue;
      const aliases = Array.isArray(inputAliases)
        ? inputAliases
        : String(inputAliases || '').split(',');
      safe[action] = Array.from(new Set(aliases
        .map(alias => String(alias).trim().toLowerCase().replace(/^[!/]+/, ''))
        .filter(alias => /^[a-z0-9_-]{1,32}$/.test(alias))))
        .slice(0, 8);
    }
    return safe;
  }

  viewerState(userId) {
    return {
      progress: this.store.getViewerProgress(userId),
      eggs: this.store.getViewerEggs(userId),
      monsters: this.store.getViewerMonsters(userId),
      selectedMonster: this.store.getSelectedMonster(userId),
      achievements: this.store.getViewerAchievements(userId),
      rank: this.progression?.getViewerSeason?.(userId) || null
    };
  }

  publicConfig(config = {}) {
    return {
      enabled: Boolean(config.enabled),
      creatorName: config.creatorName || '',
      hatchDurationMs: config.hatchDurationMs,
      maxUnhatchedEggs: config.maxUnhatchedEggs,
      elementRules: config.elementRules || 'deterministic',
      artPoolTarget: Math.max(1, Math.min(8, Number(config.artPoolTarget) || 3)),
      bottomOverlayDurationMs: Math.max(4_000, Math.min(20_000, Number(config.bottomOverlayDurationMs) || 8_000)),
      visualPack: ['furry', 'art_lab', 'kenney'].includes(config.visualPack) ? config.visualPack : 'furry',
      commandAliases: this.sanitizeCommandAliases(config.commandAliases)
    };
  }

  normalizedGiftCatalog(locale = null) {
    return (this.giftCatalogProvider(locale) || []).map(gift => ({
      giftId: Number(gift.id ?? gift.gift_id),
      giftName: gift.name || gift.gift_name || `Gift ${gift.id ?? gift.gift_id}`,
      coinValue: Number(gift.diamond_count ?? gift.coin_value ?? gift.coinValue ?? 0),
      imageUrl: gift.image_url || gift.imageUrl || null
    })).filter(gift => Number.isInteger(gift.giftId) && gift.giftId > 0);
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
