const path = require('path');
const { createAdminAuth } = require('../../../../modules/admin-auth');
const { TEMPLATE_CATALOG, getTemplate } = require('./catalog');

function stableRuntimeErrorCode(error) {
  const code = String(error?.errorCode || error?.code || error?.message || error || '').trim();
  if (!code) return null;
  return /^STREAM_MONSTERS_[A-Z0-9_]+$/.test(code)
    ? code
    : 'STREAM_MONSTERS_RUNTIME_UNKNOWN';
}

function publicRuntimeProgress(payload = {}) {
  const progress = payload.progress && typeof payload.progress === 'object'
    ? payload.progress
    : payload;
  const result = {};
  for (const key of ['jobId', 'state', 'phase', 'adapterId', 'profileId']) {
    const value = payload[key] ?? progress[key];
    if (typeof value === 'string' && value) result[key] = value;
  }
  for (const key of ['completedBytes', 'totalBytes', 'width', 'height']) {
    const value = Number(progress[key] ?? payload[key]);
    if (Number.isFinite(value) && value >= 0) result[key] = value;
  }
  const errorCode = stableRuntimeErrorCode(
    payload.errorCode || progress.errorCode || payload.error || progress.error
  );
  if (errorCode) result.errorCode = errorCode;
  return result;
}

function publicSmokeTest(smokeTest) {
  if (!smokeTest) return null;
  return {
    state: smokeTest.state || null,
    width: Math.max(0, Number(smokeTest.width) || 0),
    height: Math.max(0, Number(smokeTest.height) || 0),
    adapterId: smokeTest.adapterId || null,
    profileId: smokeTest.profileId || null,
    runtimeVersion: smokeTest.runtimeVersion || null,
    completedAt: smokeTest.completedAt || null
  };
}

function publicRuntimeEvent(payload = {}) {
  const result = {
    state: String(payload.state || 'stopped')
  };
  for (const key of ['jobId', 'adapterId', 'profileId']) {
    if (typeof payload[key] === 'string' && payload[key]) result[key] = payload[key];
  }
  if (payload.progress) result.progress = publicRuntimeProgress(payload);
  const errorCode = stableRuntimeErrorCode(payload.errorCode || payload.error);
  if (errorCode) result.errorCode = errorCode;
  if (payload.result) {
    result.result = {
      state: payload.result.state || null,
      verified: Boolean(payload.result.verified)
    };
  }
  if (payload.smokeTest) result.smokeTest = publicSmokeTest(payload.smokeTest);
  return result;
}

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
    collection = null,
    systemAnalyzer,
    managedRuntime,
    localModelInstaller,
    giftCatalogProvider,
    configProvider,
    gcceStateProvider = () => ({
      commandPrefix: '!',
      registrationState: 'fallback',
      registrationError: null,
      commandsRegistered: false
    })
  }) {
    this.api = api;
    this.pluginDir = pluginDir;
    this.dataDir = dataDir || pluginDir;
    this.store = store;
    this.engine = engine;
    this.generationPool = generationPool;
    this.artPool = artPool;
    this.progression = progression;
    this.collection = collection;
    this.systemAnalyzer = systemAnalyzer;
    this.managedRuntime = managedRuntime;
    this.localModelInstaller = localModelInstaller;
    this.giftCatalogProvider = giftCatalogProvider || (() => []);
    this.configProvider = configProvider;
    this.gcceStateProvider = gcceStateProvider;
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
        effectiveHatchDurationMs: this.engine.hatchDurationFor?.('standard') ?? config.hatchDurationMs,
        queue: userId ? this.store.getQueuedEggs(userId) : this.store.getQueuedEggs(),
        eggCounts: this.store.getEggStateCounts?.(userId || null) || {
          incubating: 0,
          queued: 0,
          ready: 0
        },
        viewer: userId ? this.viewerState(userId) : null,
        pool: this.artPool?.coverage?.(config.artPoolTarget) || this.store.getArtPoolCoverage(),
        hype: this.store.getStreamHype(this.engine.streamKey),
        dex: userId ? (this.collection?.getCatalogState(userId).dex || null) : null,
        heartChain: this.collection?.getHeartChain(this.engine.streamKey || 'offline') || null,
        streamMission: this.collection?.getStreamMission(this.engine.streamKey || 'offline') || null,
        visualPack: this.publicConfig(config).visualPack,
        season,
        gcce: this.gcceStateProvider(),
        metrics: this.engine.streamKey ? this.store.getStreamMetrics(this.engine.streamKey) : null
      });
    });
    this.api.registerRoute('GET', '/api/streammonsters/monster-catalog', (req, res) => {
      const userId = String(req.query?.userId || '').trim();
      const catalog = this.collection?.getCatalogState(userId) || {
        templates: TEMPLATE_CATALOG.map(template => ({ ...template, owned: false, silhouette: true, mastery: null })),
        dex: { owned: 0, total: TEMPLATE_CATALOG.length }, essence: [], cosmetics: []
      };
      res.json({ success: true, ...catalog });
    });
    this.api.registerRoute('POST', '/api/streammonsters/config', this.protectAdmin((req, res) => {
      const next = this.configProvider.updateConfig({ streamMonsters: this.sanitizeConfigUpdate(req.body) });
      res.json({ success: true, config: this.publicConfig(next.streamMonsters) });
    }));
    this.api.registerRoute('POST', '/api/streammonsters/demo', this.protectAdmin((req, res) => {
      let preview = null;
      try {
        preview = this.validateDemoRequest(req.body);
      } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
      }
      const config = this.configProvider.getConfig().streamMonsters;
      const selectedTemplate = getTemplate(preview?.templateId) || TEMPLATE_CATALOG[0];
      const gift = {
        giftId: 0,
        giftName: 'Demo Heart',
        coinValue: 1,
        element: selectedTemplate.element,
        eggColor: '#f1ca43',
        effect: 'spawn'
      };
      const egg = {
        egg_id: 'demo-egg', user_id: 'demo-viewer', gift_id: 0, gift_name: gift.giftName,
        element: gift.element, egg_color: gift.eggColor, state: 'incubating', variant: 'charged',
        hatch_duration_ms: config.hatchDurationMs, boost_ms: 0,
        image_url: `/plugins/streamalchemy/assets/eggs/${gift.element.toLowerCase()}-charged.png`
      };
      const monster = {
        monster_id: 'demo-monster',
        template_id: selectedTemplate.templateId,
        name: selectedTemplate.name,
        element: gift.element,
        personality: 'Mischievous',
        rarity: 'Charged',
        level: 4,
        stats: { vitality: 7, might: 8, guard: 6, agility: 7 },
        image_url: selectedTemplate.assetPath,
        skills: selectedTemplate.skills
      };
      const opponentTemplate = TEMPLATE_CATALOG.find(entry => entry.element !== selectedTemplate.element) || TEMPLATE_CATALOG[1];
      const opponent = {
        monster_id: 'demo-opponent',
        template_id: opponentTemplate.templateId,
        name: opponentTemplate.name,
        element: opponentTemplate.element,
        personality: 'Brave',
        level: 5,
        image_url: opponentTemplate.assetPath,
        skills: opponentTemplate.skills
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
      const emit = (event, payload) => this.api.emit(event, {
        ...payload,
        demo: true,
        ...(preview ? { preview: {
          scene: preview.scene,
          layout: preview.layout,
          anchor: preview.anchor,
          scale: preview.scale
        } } : {})
      });
      if (preview) {
        const skillPayload = type => ({
          battleId: 'demo-battle',
          actorId: monster.monster_id,
          targetId: opponent.monster_id,
          monster,
          target: opponent,
          element: monster.element,
          skill: { ...selectedTemplate.skills[type], type },
          action: { type, actorId: monster.monster_id, targetId: opponent.monster_id }
        });
        if (preview.scene === 'spawn') {
          emit('streammonsters:egg_spawned', { userId: 'demo-viewer', egg, gift, hint: '!eggs' });
        } else if (preview.scene === 'hatch') {
          emit('streammonsters:hatch_started', { userId: 'demo-viewer', egg, slot: 1 });
          emit('streammonsters:egg_hatched', { userId: 'demo-viewer', egg, monster });
        } else if (preview.scene === 'special') {
          emit('streammonsters:battle_special_charged', {
            battleId: 'demo-battle',
            monsterId: monster.monster_id,
            monster,
            element: monster.element,
            skill: selectedTemplate.skills.special
          });
          emit('streammonsters:battle_skill_used', skillPayload('special'));
        } else {
          emit('streammonsters:battle_skill_used', skillPayload(preview.scene));
        }
        return res.json({ success: true, demo: true, ...preview });
      }
      emit('streammonsters:stream_started', {
        event: { element: 'Volt' },
        element: 'Volt'
      });
      emit('streammonsters:egg_spawned', { userId: 'demo-viewer', egg, gift, hint: '!eggs' });
      emit('streammonsters:hype_changed', {
        userId: 'demo-viewer',
        hype: { points: 0, charged_eggs: 1 }
      });
      emit('streammonsters:hype_milestone', {
        userId: 'demo-viewer',
        points: 100,
        hype: { points: 100, charged_eggs: 1 }
      });
      emit('streammonsters:starter_claimed', { userId: 'demo-viewer', egg, monster });
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
        achievement: {
          achievement_key: 'charged_hatch',
          titleKey: 'achievementChargedHatch'
        },
        messageKey: 'achievementChargedHatch'
      });
      emit('streammonsters:battle_started', {
        battleId: battle.battleId,
        challenger: monster,
        defender: opponent,
        seed: battle.seed,
        stanceA: 'speed',
        stanceB: 'power',
        elementAdvantageMonsterId: monster.monster_id
      });
      emit('streammonsters:stance_revealed', {
        userId: 'demo-viewer',
        monster,
        stance: 'speed',
        battleId: battle.battleId
      });
      emit('streammonsters:stance_revealed', {
        userId: 'demo-rival',
        monster: opponent,
        stance: 'power',
        battleId: battle.battleId
      });
      emit('streammonsters:battle_skill_used', {
        battleId: battle.battleId,
        actorId: monster.monster_id,
        targetId: opponent.monster_id,
        monster,
        target: opponent,
        element: monster.element,
        skill: { ...selectedTemplate.skills.attack, type: 'attack' },
        action: { type: 'attack', actorId: monster.monster_id, targetId: opponent.monster_id }
      });
      emit('streammonsters:battle_skill_used', {
        battleId: battle.battleId,
        actorId: opponent.monster_id,
        targetId: monster.monster_id,
        monster: opponent,
        target: monster,
        element: opponent.element,
        skill: { ...opponentTemplate.skills.defense, type: 'defense' },
        action: { type: 'defense', actorId: opponent.monster_id, targetId: monster.monster_id }
      });
      emit('streammonsters:battle_special_charged', {
        battleId: battle.battleId,
        monsterId: monster.monster_id,
        monster,
        element: monster.element,
        skill: selectedTemplate.skills.special
      });
      emit('streammonsters:battle_skill_used', {
        battleId: battle.battleId,
        actorId: monster.monster_id,
        targetId: opponent.monster_id,
        monster,
        target: opponent,
        element: monster.element,
        skill: { ...selectedTemplate.skills.special, type: 'special' },
        action: { type: 'special', actorId: monster.monster_id, targetId: opponent.monster_id }
      });
      rounds.forEach(round => emit('streammonsters:battle_round', { battleId: battle.battleId, round }));
      emit('streammonsters:battle_completed', { battle, winner: monster });
      emit('streammonsters:win_streak', { userId: 'demo-viewer', monster, count: 3, battleId: battle.battleId });
      emit('streammonsters:upset', { userId: 'demo-viewer', winner: monster, loser: opponent, battleId: battle.battleId });
      emit('streammonsters:rivalry', { left: monster, right: opponent, count: 2, battleId: battle.battleId });
      emit('streammonsters:quest_completed', {
        userId: 'demo-viewer',
        quest: {
          quest_key: 'weekly:battle',
          title: 'Fight a battle',
          titleKey: 'questWeeklyBattle'
        },
        messageKey: 'questWeeklyBattle'
      });
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
        result: { status: 'rank', messageKey: 'chatResultRank', message: 'Silver · 100 season points.' }
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
        if (effect === 'spawn' && !['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar', 'Random'].includes(element)) {
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
        this.configProvider.updateConfig({ streamMonsters: { giftMappingCustomized: true } });
        res.json({ success: true, mapping });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    }));
    this.api.registerRoute('DELETE', '/api/streammonsters/gift-mappings/:giftId', this.protectAdmin((req, res) => {
      const giftId = Number.parseInt(req.params?.giftId, 10);
      const removed = giftId ? this.store.deleteGiftMapping(giftId) : false;
      if (giftId) this.configProvider.updateConfig({ streamMonsters: { giftMappingCustomized: true } });
      res.json({ success: true, removed });
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
        const templateIds = Array.isArray(req.body?.templateIds)
          ? [...new Set(req.body.templateIds.map(value => String(value || '').trim()))]
          : null;
        if (templateIds && (templateIds.length !== req.body.templateIds.length || templateIds.some(id => !TEMPLATE_CATALOG.some(template => template.templateId === id)))) {
          throw new Error('STREAM_MONSTERS_TEMPLATE_IDS_INVALID');
        }
        this.api.emit(
          'local_runtime_progress',
          StreamMonstersRoutes.publicRuntimeProgress({ phase: 'pool_prepare', state: 'checking' })
        );
        if (this.managedRuntime.installation?.verified) {
          const analysis = await this.systemAnalyzer.analyze({
            comfyUrl: this.configProvider.getConfig().localGeneration?.comfyUrl,
            comfyRootDir: this.configProvider.getConfig().localGeneration?.comfyRootDir
          });
          const adapter = this.selectAdapter(analysis.adapters, this.managedRuntime.installation.adapterId);
          const processState = await this.managedRuntime.startManagedRuntime({ adapter });
          this.api.emit('local_runtime_state', StreamMonstersRoutes.publicRuntimeEvent(processState));
        }
        this.api.emit('art_pool_progress', { state: 'running', targetPerVariant });
        const result = this.artPool
          ? await this.artPool.prepare({ targetPerVariant, ...(templateIds ? { templateIds } : {}) })
          : { entries: await this.generationPool.preparePending() };
        this.api.emit('art_pool_progress', { state: 'complete', targetPerVariant });
        res.json({ success: true, ...result });
      } catch (error) {
        this.api.emit('art_pool_progress', StreamMonstersRoutes.publicRuntimeProgress({
          state: 'failed',
          phase: 'pool_prepare',
          errorCode: error.message
        }));
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
      const adapters = analysis.adapters || (analysis.gpu?.id ? [analysis.gpu] : []);
      const requestedAdapter = String(req.query?.adapterId || '').trim();
      const installedAdapter = adapters.find(
        adapter => adapter.id === this.managedRuntime.installation?.adapterId
      );
      const selectedAdapter = adapters.find(adapter => adapter.id === requestedAdapter) ||
        installedAdapter ||
        analysis.gpu ||
        adapters[0] ||
        null;
      const recommendation = this.managedRuntime.recommend(selectedAdapter || {});
      const catalog = this.managedRuntime.getCatalog?.() || { profiles: [], model: null };
      const profiles = this.managedRuntime.getPublicProfiles?.() || [];
      const processState = this.managedRuntime.getProcessState?.();
      const installationMatchesAdapter = Boolean(
        this.managedRuntime.installation?.adapterId &&
        this.managedRuntime.installation.adapterId === selectedAdapter?.id
      );
      const activeProfileId = recommendation.supported ? recommendation.profileId : null;
      const activeProfile = profiles.find(profile => profile.id === activeProfileId) || null;
      const smokeTest = this.managedRuntime.lastSmokeTest || this.managedRuntime.installation?.smokeTest || null;
      const smokeMatchesSelection = Boolean(
        smokeTest?.adapterId &&
        smokeTest.adapterId === selectedAdapter?.id &&
        smokeTest.profileId === activeProfileId &&
        (
          !activeProfile?.version ||
          smokeTest.runtimeVersion === activeProfile.version
        )
      );
      let disk = analysis.disk || null;
      try {
        if (recommendation.supported && this.managedRuntime.getDiskStatus) {
          disk = await this.managedRuntime.getDiskStatus(recommendation.profileId);
        }
      } catch (_) {}
      res.json({
        success: true,
        runtime: this.publicRuntime(installationMatchesAdapter
          ? (this.managedRuntime.current || processState || { state: 'stopped' })
          : { state: recommendation.supported ? 'ready_to_install' : 'expert_or_remote' }),
        recommendation: this.publicRecommendation(recommendation),
        manifestAvailable: Boolean(manifest || profiles.length),
        installDetails: profiles.length && recommendation.supported
          ? this.publicCatalogInstallDetails(
            catalog,
            recommendation.profileId
          )
          : (profiles.length ? null : this.publicInstallDetails(manifest)),
        adapters: adapters.map(adapter => this.publicAdapter(adapter)),
        selectedAdapterId: selectedAdapter?.id || null,
        profiles: profiles.map(profile => this.publicProfile(profile)),
        installation: this.publicInstallation(this.managedRuntime.installation),
        model: this.publicModel({
          ...catalog.model,
          verified: Boolean(this.managedRuntime.installation?.model?.verified)
        }),
        smokeTest: this.publicSmokeTest(smokeTest),
        runtimeDetails: {
          profileId: activeProfileId || null,
          backend: activeProfile?.backend || null,
          adapterId: selectedAdapter?.id || null,
          device: selectedAdapter?.name || null,
          driverVersion: selectedAdapter?.driverVersion || selectedAdapter?.driver || null,
          vramMb: Math.max(0, Number(selectedAdapter?.vramMb) || 0),
          verifiedOnDevice: Boolean(
            installationMatchesAdapter &&
            this.managedRuntime.installation?.profileId === activeProfileId &&
            this.managedRuntime.installation?.verified &&
            smokeMatchesSelection &&
            smokeTest?.state === 'passed' &&
            smokeTest?.width === 256 &&
            smokeTest?.height === 256
          )
        },
        disk: this.publicDisk(disk)
      });
    });
    this.api.registerRoute('POST', '/api/streammonsters/local-runtime/install', this.protectAdmin(async (req, res) => {
      try {
        const current = this.configProvider.getConfig();
        const analysis = await this.systemAnalyzer.analyze({
          comfyUrl: current.localGeneration?.comfyUrl,
          comfyRootDir: current.localGeneration?.comfyRootDir
        });
        const accepted = this.managedRuntime.createInstallJob(req.body, analysis.adapters || [analysis.gpu].filter(Boolean));
        res.status(202).json(accepted);
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    }));
    this.api.registerRoute('GET', '/api/streammonsters/local-runtime/install/:jobId', this.protectAdmin((req, res) => {
      const job = this.managedRuntime.getInstallJob(req.params?.jobId);
      if (!job) return res.status(404).json({ success: false, error: 'STREAM_MONSTERS_RUNTIME_JOB_NOT_FOUND' });
      return res.json(job);
    }));
    this.api.registerRoute('DELETE', '/api/streammonsters/local-runtime/install/:jobId', this.protectAdmin(async (req, res) => {
      try {
        const job = await this.managedRuntime.cancelInstallJob(req.params?.jobId);
        if (!job) return res.status(404).json({ success: false, error: 'STREAM_MONSTERS_RUNTIME_JOB_NOT_FOUND' });
        return res.json(job);
      } catch (error) {
        return res.status(409).json({ success: false, error: error.message });
      }
    }));
    this.api.registerRoute('POST', '/api/streammonsters/local-runtime/start', this.protectAdmin(async (req, res) => {
      try {
        const analysis = await this.systemAnalyzer.analyze();
        const adapter = this.selectAdapter(
          analysis.adapters || [analysis.gpu].filter(Boolean),
          req.body?.adapterId || this.managedRuntime.installation?.adapterId
        );
        const runtime = await this.managedRuntime.startManagedRuntime({ adapter });
        const publicRuntime = this.publicRuntime(runtime);
        this.api.emit('local_runtime_state', StreamMonstersRoutes.publicRuntimeEvent(runtime));
        res.json({ success: true, runtime: publicRuntime });
      } catch (error) {
        this.api.emit('local_runtime_progress', StreamMonstersRoutes.publicRuntimeProgress({
          phase: 'start',
          state: 'failed',
          errorCode: error.message
        }));
        res.status(409).json({ success: false, error: error.message });
      }
    }));
    this.api.registerRoute('POST', '/api/streammonsters/local-runtime/stop', this.protectAdmin(async (req, res) => {
      const runtime = await this.managedRuntime.stopManagedRuntime();
      const publicRuntime = this.publicRuntime(runtime);
      this.api.emit('local_runtime_state', StreamMonstersRoutes.publicRuntimeEvent(runtime));
      res.json({ success: true, runtime: publicRuntime });
    }));
    this.api.registerRoute('POST', '/api/streammonsters/local-runtime/verify', this.protectAdmin(async (req, res) => {
      try {
        this.api.emit('local_runtime_progress', StreamMonstersRoutes.publicRuntimeProgress({
          phase: 'verify',
          state: 'checking'
        }));
        const installation = this.managedRuntime.installation;
        if (!installation?.verified || installation.state !== 'ready') {
          throw new Error('STREAM_MONSTERS_RUNTIME_NOT_INSTALLED');
        }
        const requestedAdapterId = req.body?.adapterId || installation.adapterId;
        const requestedProfileId = req.body?.profileId || installation.profileId;
        if (requestedAdapterId !== installation.adapterId) {
          throw new Error('STREAM_MONSTERS_RUNTIME_VERIFY_ADAPTER_MISMATCH');
        }
        if (requestedProfileId !== installation.profileId) {
          throw new Error('STREAM_MONSTERS_RUNTIME_VERIFY_PROFILE_MISMATCH');
        }
        const analysis = await this.systemAnalyzer.analyze();
        const adapter = this.selectAdapter(
          analysis.adapters || [analysis.gpu].filter(Boolean),
          requestedAdapterId
        );
        if (!adapter || adapter.id !== installation.adapterId) {
          throw new Error('STREAM_MONSTERS_RUNTIME_VERIFY_ADAPTER_MISMATCH');
        }
        const profile = this.managedRuntime.getProfile?.(requestedProfileId)
          || (this.managedRuntime.getPublicProfiles?.() || [])
            .find(entry => entry.id === requestedProfileId);
        if (!profile || profile.id !== installation.profileId) {
          throw new Error('STREAM_MONSTERS_RUNTIME_VERIFY_PROFILE_MISMATCH');
        }
        const smokeTest = await this.managedRuntime.forceVerifyManagedRuntime({
          adapter,
          profile
        });
        if (
          !smokeTest ||
          smokeTest.state !== 'passed' ||
          smokeTest.adapterId !== adapter.id ||
          smokeTest.profileId !== profile.id
        ) {
          throw new Error('STREAM_MONSTERS_RUNTIME_SMOKE_TEST_FAILED');
        }
        this.api.emit('local_runtime_progress', StreamMonstersRoutes.publicRuntimeProgress({
          phase: 'verify',
          state: 'passed',
          width: smokeTest.width,
          height: smokeTest.height
        }));
        res.json({ success: true, smokeTest: this.publicSmokeTest(smokeTest) });
      } catch (error) {
        this.api.emit('local_runtime_progress', StreamMonstersRoutes.publicRuntimeProgress({
          phase: 'verify',
          state: 'failed',
          errorCode: error.message
        }));
        res.status(409).json({ success: false, error: error.message });
      }
    }));
  }

  protectAdmin(handler) {
    return (req, res, next) => this.adminAuth(req, res, () => handler(req, res, next));
  }

  sanitizeConfigUpdate(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const safe = {};
    for (const key of ['enabled', 'creatorName', 'maxUnhatchedEggs', 'elementRules']) {
      if (Object.prototype.hasOwnProperty.call(input, key)) safe[key] = input[key];
    }
    if (typeof input.giftMappingCustomized === 'boolean') safe.giftMappingCustomized = input.giftMappingCustomized;
    const allowedHatchDurations = new Set([30_000, 60_000, 2, 5, 10, 30].map(value => (
      value < 1_000 ? value * 60_000 : value
    )));
    const hatchDurationMs = Number(input.hatchDurationMs);
    if (allowedHatchDurations.has(hatchDurationMs)) safe.hatchDurationMs = hatchDurationMs;
    if (['furry', 'art_lab', 'kenney'].includes(input.visualPack)) safe.visualPack = input.visualPack;
    const anchors = new Set([
      'top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right'
    ]);
    for (const key of ['landscapeAnchor', 'portraitAnchor']) {
      if (anchors.has(input[key])) safe[key] = input[key];
    }
    for (const key of ['landscapeScale', 'portraitScale']) {
      const value = Number(input[key]);
      if (Number.isFinite(value) && value >= 70 && value <= 130) safe[key] = value;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'artPoolTarget')) {
      safe.artPoolTarget = Math.max(1, Math.min(8, Number.parseInt(input.artPoolTarget, 10) || 3));
    }
    return safe;
  }

  validateDemoRequest(input) {
    if (input == null) return null;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('STREAM_MONSTERS_DEMO_REQUEST_INVALID');
    }
    if (!Object.keys(input).length) return null;
    const scenes = new Set(['spawn', 'hatch', 'attack', 'defense', 'special']);
    if (!scenes.has(input.scene)) throw new Error('STREAM_MONSTERS_DEMO_SCENE_INVALID');
    const template = input.templateId ? getTemplate(input.templateId) : TEMPLATE_CATALOG[0];
    if (!template) throw new Error('STREAM_MONSTERS_DEMO_TEMPLATE_INVALID');
    const layout = input.layout || 'auto';
    if (!['auto', 'landscape', 'portrait'].includes(layout)) {
      throw new Error('STREAM_MONSTERS_DEMO_LAYOUT_INVALID');
    }
    const anchors = new Set([
      'top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right'
    ]);
    const defaultAnchor = layout === 'portrait' ? 'center' : 'bottom-center';
    const anchor = input.anchor || defaultAnchor;
    if (!anchors.has(anchor)) throw new Error('STREAM_MONSTERS_DEMO_ANCHOR_INVALID');
    const scale = input.scale === undefined ? 100 : Number(input.scale);
    if (!Number.isFinite(scale) || scale < 70 || scale > 130) {
      throw new Error('STREAM_MONSTERS_DEMO_SCALE_INVALID');
    }
    return {
      scene: input.scene,
      templateId: template.templateId,
      layout,
      anchor,
      scale
    };
  }

  viewerState(userId) {
    const resolvedUserId = this.store.resolveKnownViewerId?.(userId) || userId;
    return {
      progress: this.store.getViewerProgress(resolvedUserId),
      eggs: this.store.getViewerEggs(resolvedUserId),
      monsters: this.store.getViewerMonsters(resolvedUserId),
      selectedMonster: this.store.getSelectedMonster(resolvedUserId),
      achievements: this.store.getViewerAchievements(resolvedUserId).map(achievement => ({
        ...achievement,
        titleKey: this.progression?.achievementTitleKey?.(achievement.achievement_key) || 'achievementUnknown'
      })),
      rank: this.progression?.getViewerSeason?.(resolvedUserId) || null,
      dex: this.collection?.getCatalogState(resolvedUserId).dex || null
    };
  }

  publicConfig(config = {}) {
    return {
      enabled: Boolean(config.enabled),
      creatorName: config.creatorName || '',
      rulesVersion: 3,
      hatchDurationMs: config.hatchDurationMs,
      maxUnhatchedEggs: config.maxUnhatchedEggs,
      elementRules: config.elementRules || 'deterministic',
      artPoolTarget: Math.max(1, Math.min(8, Number(config.artPoolTarget) || 3)),
      giftMappingCustomized: Boolean(config.giftMappingCustomized),
      visualPack: ['furry', 'art_lab', 'kenney'].includes(config.visualPack) ? config.visualPack : 'furry',
      landscapeAnchor: config.landscapeAnchor || null,
      portraitAnchor: config.portraitAnchor || null,
      landscapeScale: Number.isFinite(Number(config.landscapeScale)) ? Number(config.landscapeScale) : null,
      portraitScale: Number.isFinite(Number(config.portraitScale)) ? Number(config.portraitScale) : null
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

  selectAdapter(adapters = [], adapterId = null) {
    const selected = adapterId
      ? adapters.find(adapter => adapter.id === adapterId)
      : adapters[0];
    if (!selected) throw new Error('STREAM_MONSTERS_RUNTIME_ADAPTER_NOT_FOUND');
    return selected;
  }

  publicInstallation(installation) {
    if (!installation) return null;
    return {
      state: installation.state,
      verified: Boolean(installation.verified),
      profileId: installation.profileId,
      adapterId: installation.adapterId
    };
  }

  publicRuntime(runtime = {}) {
    return {
      state: String(runtime.state || 'stopped')
    };
  }

  publicRecommendation(recommendation = {}) {
    return {
      supported: Boolean(recommendation.supported),
      mode: recommendation.mode || null,
      reasonCode: recommendation.reasonCode || null,
      profileId: recommendation.profileId || null,
      presetId: recommendation.presetId || null,
      width: Math.max(0, Number(recommendation.width) || 0),
      height: Math.max(0, Number(recommendation.height) || 0),
      steps: Math.max(0, Number(recommendation.steps) || 0),
      experimental: Boolean(recommendation.experimental)
    };
  }

  publicAdapter(adapter = {}) {
    const vramMb = Math.max(0, Number(adapter.vramMb) || 0);
    return {
      id: adapter.id || null,
      name: adapter.name || null,
      vendor: adapter.vendor || null,
      vramMb,
      vramGb: Number.isFinite(Number(adapter.vramGb))
        ? Number(adapter.vramGb)
        : Math.round((vramMb / 1024) * 10) / 10,
      driverVersion: adapter.driverVersion || adapter.driver || null,
      supportState: adapter.supportState || adapter.backendSelectionState || null
    };
  }

  publicProfile(profile = {}) {
    return {
      id: profile.id || null,
      label: profile.label || null,
      backend: profile.backend || null,
      version: profile.version || null,
      experimental: Boolean(profile.experimental),
      recommendationState: profile.recommendationState || null
    };
  }

  publicSmokeTest(smokeTest) {
    return publicSmokeTest(smokeTest);
  }

  publicDisk(disk) {
    if (!disk) return null;
    return {
      freeGb: Number.isFinite(Number(disk.freeGb)) ? Number(disk.freeGb) : null,
      runtimeDownloadBytes: Math.max(0, Number(disk.runtimeDownloadBytes) || 0),
      runtimeInstalledBytes: Math.max(0, Number(disk.runtimeInstalledBytes) || 0),
      modelDownloadBytes: Math.max(0, Number(disk.modelDownloadBytes) || 0),
      modelCopyBytes: Math.max(0, Number(disk.modelCopyBytes) || 0),
      safetyMarginBytes: Math.max(0, Number(disk.safetyMarginBytes) || 0),
      requiredBytes: Math.max(0, Number(disk.requiredBytes) || 0),
      freeBytes: Number.isFinite(Number(disk.freeBytes)) ? Number(disk.freeBytes) : null,
      sufficient: typeof disk.sufficient === 'boolean' ? disk.sufficient : null
    };
  }

  publicModel(model) {
    if (!model) return null;
    return {
      id: model.id,
      fileName: model.fileName,
      sizeBytes: Math.max(0, Number(model.sizeBytes) || 0),
      license: model.license,
      verified: Boolean(model.verified)
    };
  }

  publicCatalogInstallDetails(catalog = {}, profileId = null) {
    const selectedProfile = catalog.profiles?.find(profile => profile.id === profileId)
      || catalog.profiles?.[0]
      || null;
    return {
      runtimeDownloadBytes: Math.max(0, Number(selectedProfile?.downloadSizeBytes) || 0),
      runtimeInstalledBytes: Math.max(0, Number(selectedProfile?.installedSizeBytes) || 0),
      modelDownloadBytes: Math.max(0, Number(catalog.model?.sizeBytes) || 0)
    };
  }

  publicInstallDetails(manifest) {
    if (!manifest) return null;
    return {
      runtimeDownloadBytes: Math.max(0, Number(manifest.downloadSizeBytes) || 0),
      modelDownloadBytes: Math.max(0, Number(manifest.modelSizeBytes) || 0)
    };
  }
}

StreamMonstersRoutes.publicRuntimeEvent = publicRuntimeEvent;
StreamMonstersRoutes.publicRuntimeProgress = publicRuntimeProgress;
StreamMonstersRoutes.stableRuntimeErrorCode = stableRuntimeErrorCode;

module.exports = StreamMonstersRoutes;
