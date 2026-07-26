const path = require('path');
const { createAdminAuth } = require('../../../../modules/admin-auth');
const { TEMPLATE_CATALOG, getTemplate } = require('./catalog');

const ART_LAB_ROUTES = Object.freeze([
  ['GET', '/api/streamalchemy/config'],
  ['POST', '/api/streamalchemy/config'],
  ['GET', '/api/streamalchemy/items'],
  ['GET', '/api/streamalchemy/recipes'],
  ['GET', '/api/streamalchemy/generation-jobs'],
  ['GET', '/api/streamalchemy/model-catalog'],
  ['GET', '/api/streamalchemy/providers/status'],
  ['GET', '/api/streamalchemy/local-model/status'],
  ['POST', '/api/streamalchemy/local-model/install'],
  ['GET', '/api/streamalchemy/system-analysis'],
  ['POST', '/api/streamalchemy/local-generation/test'],
  ['GET', '/api/streammonsters/art/:filename'],
  ['GET', '/api/streammonsters/pool'],
  ['POST', '/api/streammonsters/pool'],
  ['POST', '/api/streammonsters/pool/prepare'],
  ['GET', '/api/streammonsters/local-runtime/status'],
  ['POST', '/api/streammonsters/local-runtime/install'],
  ['GET', '/api/streammonsters/local-runtime/install/:jobId'],
  ['DELETE', '/api/streammonsters/local-runtime/install/:jobId'],
  ['POST', '/api/streammonsters/local-runtime/start'],
  ['POST', '/api/streammonsters/local-runtime/stop'],
  ['POST', '/api/streammonsters/local-runtime/verify']
]);

class StreamMonstersRoutes {
  constructor({
    api,
    pluginDir,
    store,
    engine,
    progression = null,
    collection = null,
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
    this.store = store;
    this.engine = engine;
    this.progression = progression;
    this.collection = collection;
    this.giftCatalogProvider = giftCatalogProvider || (() => []);
    this.configProvider = configProvider;
    this.gcceStateProvider = gcceStateProvider;
    this.adminAuth = createAdminAuth();
  }

  register() {
    const sendCreator = (req, res) => {
      res.sendFile(path.join(this.pluginDir, 'streammonsters-ui.html'));
    };
    const sendOverlay = (req, res) => {
      res.sendFile(path.join(this.pluginDir, 'streammonsters-overlay.html'));
    };
    this.api.registerRoute('GET', '/streammonsters/ui', sendCreator);
    this.api.registerRoute('GET', '/streammonsters/overlay', sendOverlay);
    this.api.registerRoute('GET', '/streamalchemy/ui', sendCreator);
    this.api.registerRoute('GET', '/streamalchemy/overlay', sendOverlay);
    ART_LAB_ROUTES.forEach(([method, routePath]) => {
      this.api.registerRoute(method, routePath, (req, res) => (
        res.status(410).json({ error: 'art_lab_removed' })
      ));
    });
    this.api.registerRoute('GET', '/api/streammonsters/state', (req, res) => {
      const config = this.configProvider.getConfig().streamMonsters;
      const season = this.progression?.getCurrentSeason?.() || null;
      res.json({
        success: true,
        config: this.publicConfig(config),
        effectiveHatchDurationMs: this.engine.hatchDurationFor?.('standard') ?? config.hatchDurationMs,
        eggCounts: this.store.getEggStateCounts?.(null) || {
          incubating: 0,
          queued: 0,
          ready: 0
        },
        hype: this.publicHype(this.store.getStreamHype(this.engine.streamKey)),
        heartChain: this.publicHeartChain(
          this.collection?.getHeartChain(this.engine.streamKey || 'offline')
        ),
        streamMission: this.publicStreamMission(
          this.collection?.getStreamMission(this.engine.streamKey || 'offline')
        ),
        visualPack: 'furry',
        season,
        gcce: this.gcceStateProvider()
      });
    });
    this.api.registerRoute('GET', '/api/streammonsters/creator-state', this.protectAdmin((req, res) => {
      const userId = String(req.query?.userId || '').trim();
      const config = this.configProvider.getConfig().streamMonsters;
      res.json({
        success: true,
        config: this.publicConfig(config, { includeCreator: true }),
        effectiveHatchDurationMs: this.engine.hatchDurationFor?.('standard') ?? config.hatchDurationMs,
        queue: userId ? this.store.getQueuedEggs(userId) : this.store.getQueuedEggs(),
        eggCounts: this.store.getEggStateCounts?.(userId || null) || {
          incubating: 0,
          queued: 0,
          ready: 0
        },
        viewer: userId ? this.viewerState(userId) : null,
        giftMappings: this.store.getGiftMappings(),
        hype: this.store.getStreamHype(this.engine.streamKey),
        dex: userId ? (this.collection?.getCatalogState(userId).dex || null) : null,
        heartChain: this.collection?.getHeartChain(this.engine.streamKey || 'offline') || null,
        streamMission: this.collection?.getStreamMission(this.engine.streamKey || 'offline') || null,
        visualPack: 'furry',
        season: this.progression?.getCurrentSeason?.() || null,
        gcce: this.gcceStateProvider(),
        metrics: this.engine.streamKey ? this.store.getStreamMetrics(this.engine.streamKey) : null
      });
    }));
    this.api.registerRoute('GET', '/api/streammonsters/monster-catalog', (req, res) => {
      res.json({
        success: true,
        templates: TEMPLATE_CATALOG.map(template => ({
          ...template,
          owned: false,
          silhouette: true,
          mastery: null
        })),
        dex: { owned: 0, total: TEMPLATE_CATALOG.length }
      });
    });
    this.api.registerRoute('POST', '/api/streammonsters/config', this.protectAdmin((req, res) => {
      const current = this.configProvider.getConfig().streamMonsters || {};
      const update = this.sanitizeConfigUpdate(req.body);
      if (current.giftMappingCustomized) update.giftMappingCustomized = true;
      const next = this.configProvider.updateConfig({ streamMonsters: update });
      res.json({
        success: true,
        config: this.publicConfig(next.streamMonsters, { includeCreator: true })
      });
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
    if (Object.prototype.hasOwnProperty.call(input, 'visualPack')) safe.visualPack = 'furry';
    const eggExpiryMs = Number(input.eggExpiryMs);
    if ([21_600_000, 43_200_000, 86_400_000, 172_800_000].includes(eggExpiryMs)) {
      safe.eggExpiryMs = eggExpiryMs;
    }
    const seasonDurationDays = Number(input.seasonDurationDays);
    if ([7, 14, 28, 60, 90].includes(seasonDurationDays)) {
      safe.seasonDurationDays = seasonDurationDays;
    }
    if (['auto', 'high', 'medium', 'low'].includes(input.rendererQuality)) {
      safe.rendererQuality = input.rendererQuality;
    }
    const notificationDurationMs = Number(input.notificationDurationMs);
    if (
      Number.isFinite(notificationDurationMs) &&
      notificationDurationMs >= 8_000 &&
      notificationDurationMs <= 30_000
    ) {
      safe.notificationDurationMs = Math.round(notificationDurationMs);
    }
    const anchors = new Set([
      'top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right'
    ]);
    const layouts = {};
    for (const name of ['portrait', 'landscape']) {
      const candidate = input.layouts?.[name];
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
      const layout = {};
      if (anchors.has(candidate.anchor)) layout.anchor = candidate.anchor;
      const scale = Number(candidate.scale);
      if (Number.isFinite(scale) && scale >= 70 && scale <= 130) layout.scale = scale;
      if (Object.keys(layout).length) layouts[name] = layout;
    }
    for (const key of ['landscapeAnchor', 'portraitAnchor']) {
      if (!anchors.has(input[key])) continue;
      const name = key.startsWith('portrait') ? 'portrait' : 'landscape';
      layouts[name] = { ...(layouts[name] || {}), anchor: input[key] };
    }
    for (const key of ['landscapeScale', 'portraitScale']) {
      const value = Number(input[key]);
      if (!Number.isFinite(value) || value < 70 || value > 130) continue;
      const name = key.startsWith('portrait') ? 'portrait' : 'landscape';
      layouts[name] = { ...(layouts[name] || {}), scale: value };
    }
    if (Object.keys(layouts).length) safe.layouts = layouts;
    const normalizeAliases = value => {
      if (!Array.isArray(value)) return [];
      return [...new Set(value.map(alias => String(alias).trim().toLocaleLowerCase())
        .filter(alias => /^[\p{L}\p{N}_-]{1,32}$/u.test(alias)))];
    };
    if (input.commandAliases && typeof input.commandAliases === 'object' && !Array.isArray(input.commandAliases)) {
      safe.commandAliases = {};
      for (const [command, aliases] of Object.entries(input.commandAliases)) {
        if (!/^[a-z][a-z0-9_-]{0,31}$/.test(command) || !aliases || typeof aliases !== 'object') continue;
        safe.commandAliases[command] = {
          enabled: normalizeAliases(aliases.enabled),
          disabled: normalizeAliases(aliases.disabled)
        };
      }
    }
    if (input.audioChannels && typeof input.audioChannels === 'object' && !Array.isArray(input.audioChannels)) {
      safe.audioChannels = {};
      for (const name of ['master', 'ui', 'egg', 'battle', 'reward']) {
        const channel = input.audioChannels[name];
        if (!channel || typeof channel !== 'object' || Array.isArray(channel)) continue;
        const normalized = {};
        if (typeof channel.enabled === 'boolean') normalized.enabled = channel.enabled;
        const volume = Number(channel.volume);
        if (Number.isFinite(volume) && volume >= 0 && volume <= 1) {
          normalized.volume = Math.round(volume * 100) / 100;
        }
        if (Object.keys(normalized).length) safe.audioChannels[name] = normalized;
      }
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

  publicConfig(config = {}, { includeCreator = false } = {}) {
    const result = {
      enabled: Boolean(config.enabled),
      rulesVersion: 5,
      hatchDurationMs: config.hatchDurationMs,
      incubationPresetsMs: [30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000],
      eggExpiryMs: [21_600_000, 43_200_000, 86_400_000, 172_800_000].includes(
        Number(config.eggExpiryMs)
      ) ? Number(config.eggExpiryMs) : 86_400_000,
      eggExpiryPresetsMs: [21_600_000, 43_200_000, 86_400_000, 172_800_000],
      seasonDurationDays: [7, 14, 28, 60, 90].includes(Number(config.seasonDurationDays))
        ? Number(config.seasonDurationDays)
        : 28,
      maxUnhatchedEggs: config.maxUnhatchedEggs,
      elementRules: config.elementRules || 'deterministic',
      giftMappingCustomized: Boolean(config.giftMappingCustomized),
      visualPack: 'furry',
      commandAliases: config.commandAliases || {},
      layouts: config.layouts || {
        portrait: { anchor: 'top-center', scale: 100 },
        landscape: { anchor: 'bottom-center', scale: 100 }
      },
      rendererQuality: ['auto', 'high', 'medium', 'low'].includes(config.rendererQuality)
        ? config.rendererQuality
        : 'auto',
      notificationDurationMs: Number(config.notificationDurationMs) || 12_000,
      audioChannels: config.audioChannels || {}
    };
    if (includeCreator) result.creatorName = config.creatorName || '';
    return result;
  }

  publicHype(hype = null) {
    if (!hype) return null;
    return {
      points: Math.max(0, Number(hype.points) || 0),
      chargedEggs: Math.max(0, Number(hype.charged_eggs) || 0)
    };
  }

  publicHeartChain(chain = null) {
    if (!chain) return null;
    return {
      chainLength: Math.max(0, Number(chain.chain_length) || 0)
    };
  }

  publicStreamMission(mission = null) {
    if (!mission) return null;
    return {
      target: Math.max(0, Number(mission.target) || 0),
      progress: Math.max(0, Number(mission.progress) || 0),
      completed: Boolean(mission.completed_at_ms)
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

}

module.exports = StreamMonstersRoutes;
