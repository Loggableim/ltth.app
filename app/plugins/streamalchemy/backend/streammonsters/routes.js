const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createAdminAuth } = require('../../../../modules/admin-auth');
const {
  FURRY_ASSET_VERSION,
  TEMPLATE_CATALOG,
  getTemplate,
  getEvolutionAssetPath,
  resolveStageSkill
} = require('./catalog');
const { V7_RULES_VERSION } = require('./battle-rules-v5');
const EggStageProjector = require('./egg-stage-projector');
const {
  avatarUrlFromToken,
  fetchAvatar
} = require('./avatar-proxy');
const {
  evolutionStatGrant,
  applyEvolutionGrant
} = require('./evolution-rules');

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
  ['GET', '/api/streammonsters/pool'],
  ['POST', '/api/streammonsters/pool'],
  ['POST', '/api/streammonsters/pool/prepare'],
  ['GET', '/api/streammonsters/local-runtime/status'],
  ['POST', '/api/streammonsters/local-runtime/install'],
  ['GET', '/api/streammonsters/local-runtime/install/:jobId'],
  ['DELETE', '/api/streammonsters/local-runtime/install/:jobId'],
  ['GET', '/api/streammonsters/local-runtime/jobs/:jobId'],
  ['DELETE', '/api/streammonsters/local-runtime/jobs/:jobId'],
  ['POST', '/api/streammonsters/local-runtime/start'],
  ['POST', '/api/streammonsters/local-runtime/stop'],
  ['POST', '/api/streammonsters/local-runtime/verify']
]);

class StreamMonstersRoutes {
  constructor({
    api,
    pluginDir,
    dataDir,
    store,
    engine,
    progression = null,
    collection = null,
    battleMatchService = null,
    giftCatalogProvider,
    configProvider,
    now = () => Date.now(),
    hintStateProvider = () => ({}),
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
    this.eggStageProjector = engine?.eggStageProjector ||
      new EggStageProjector({ store, now });
    this.progression = progression;
    this.collection = collection;
    this.battleMatchService = battleMatchService;
    this.giftCatalogProvider = giftCatalogProvider || (() => []);
    this.configProvider = configProvider;
    this.now = now;
    this.hintStateProvider = hintStateProvider;
    this.gcceStateProvider = gcceStateProvider;
    this.adminAuth = createAdminAuth();
    this.assetCatalogCache = null;
    this.overlayHeartbeat = null;
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
    this.api.registerRoute('GET', '/plugins/streamalchemy/ui.html', sendCreator);
    this.api.registerRoute('GET', '/plugins/streamalchemy/ui-old.html', sendCreator);
    this.api.registerRoute('GET', '/plugins/streamalchemy/overlay.html', sendOverlay);
    ART_LAB_ROUTES.forEach(([method, routePath]) => {
      this.api.registerRoute(method, routePath, (req, res) => (
        res.status(410).json({ error: 'art_lab_removed' })
      ));
    });
    this.api.registerRoute('GET', '/api/streammonsters/art/:filename', (req, res) => {
      const filename = String(req.params?.filename || '');
      if (!/^kenney-[a-f0-9]{16}\.svg$/.test(filename)) {
        return res.status(410).json({ error: 'art_lab_removed' });
      }
      const artDir = path.resolve(this.dataDir, 'streammonsters', 'monster-art');
      const absolutePath = path.resolve(artDir, filename);
      let stat = null;
      try {
        stat = fs.lstatSync(absolutePath);
      } catch (_) {
        return res.status(404).json({ error: 'kenney_art_not_found' });
      }
      if (
        path.dirname(absolutePath) !== artDir ||
        !stat.isFile() ||
        stat.isSymbolicLink()
      ) {
        return res.status(404).json({ error: 'kenney_art_not_found' });
      }
      return res.sendFile(absolutePath);
    });
    this.api.registerRoute('GET', '/api/streammonsters/avatar/:token', async (req, res) => {
      const url = avatarUrlFromToken(req.params?.token);
      if (!url) return res.status(400).json({ error: 'avatar_url_rejected' });
      try {
        const avatar = await fetchAvatar(url.href);
        res.set('Content-Type', avatar.contentType);
        res.set('Cache-Control', 'public, max-age=300');
        return res.send(avatar.body);
      } catch (error) {
        this.api.log?.(`[STREAM MONSTERS] Avatar proxy rejected: ${error.message}`, 'warn');
        return res.status(502).json({ error: 'avatar_unavailable' });
      }
    });
    this.api.registerRoute('POST', '/api/streammonsters/overlay/heartbeat', (req, res) => {
      const heartbeat = this.recordOverlayHeartbeat(req.body);
      return res.json({ success: true, acceptedAtMs: heartbeat.lastSeenAtMs });
    });
    this.api.registerRoute('GET', '/api/streammonsters/state', (req, res) => {
      const config = this.configProvider.getConfig().streamMonsters;
      const season = this.progression?.getCurrentSeason?.() || null;
      const recentEvents = this.store.getRecentPublicEvents?.(
        this.engine.streamKey || 'offline',
        { limit: 100 }
      ) || [];
      res.json({
        success: true,
        config: this.publicConfig(config),
        effectiveHatchDurationMs: this.engine.hatchDurationFor?.('standard') ?? config.hatchDurationMs,
        eggCounts: this.store.getEggStateCounts?.(null) || {
          incubating: 0,
          queued: 0,
          ready: 0
        },
        eggStage: this.eggStageProjector.snapshot(this.engine.streamKey || 'offline'),
        hype: this.publicHype(this.store.getStreamHype(this.engine.streamKey)),
        heartChain: this.publicHeartChain(
          this.collection?.getHeartChain(this.engine.streamKey || 'offline')
        ),
        streamMission: this.publicStreamMission(
          this.collection?.getStreamMission(this.engine.streamKey || 'offline')
        ),
        visualPack: 'furry',
        season,
        gcce: this.publicGcceState(this.gcceStateProvider()),
        battle: this.battleMatchService?.getPublicSnapshot?.({
          restoreReconnect: true
        }) || {
          rulesVersion: V7_RULES_VERSION,
          matches: []
        },
        recentEvents,
        eventCursor: recentEvents.at(-1)?.sequence || 0
      });
    });
    this.api.registerRoute('GET', '/api/streammonsters/battle-state', (req, res) => {
      const snapshot = this.battleMatchService?.getPublicSnapshot?.() || {
        rulesVersion: V7_RULES_VERSION,
        matches: []
      };
      res.json({ success: true, ...snapshot });
    });
    this.api.registerRoute(
      'GET',
      '/api/streammonsters/battles/:battleId/replay',
      (req, res) => {
        const rawCursor = Number(req.query?.cursor);
        const cursor = Number.isFinite(rawCursor) && rawCursor >= 0 ? rawCursor : 0;
        const rawLimit = Number.parseInt(req.query?.limit, 10);
        const limit = Number.isInteger(rawLimit) && rawLimit > 0
          ? Math.min(rawLimit, 100)
          : 50;
        const replay = this.battleMatchService?.getPublicNormalizedReplay?.(
          String(req.params?.battleId || ''),
          cursor,
          limit
        ) || null;
        if (!replay) return res.status(404).json({ error: 'battle_not_found' });
        return res.json({ success: true, ...replay });
      }
    );
    this.api.registerRoute('GET', '/api/streammonsters/creator-state', this.protectAdmin((req, res) => {
      const userId = String(req.query?.userId || '').trim();
      const config = this.configProvider.getConfig().streamMonsters;
      const overlayDiagnostics = this.getOverlayDiagnostics();
      const gcce = this.gcceStateProvider();
      const battle = this.battleMatchService?.getPublicSnapshot?.() || {
        rulesVersion: V7_RULES_VERSION,
        matches: []
      };
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
        gcce,
        battle,
        diagnostics: this.getCreatorDiagnostics({ config, gcce, battle }),
        obs: overlayDiagnostics.obs,
        renderer: overlayDiagnostics.renderer,
        audioRuntime: overlayDiagnostics.audio,
        metrics: this.engine.streamKey ? this.store.getStreamMetrics(this.engine.streamKey) : null
      });
    }));
    this.api.registerRoute('GET', '/api/streammonsters/creator-catalog', this.protectAdmin((req, res) => {
      const requestedUserId = String(req.query?.userId || '').trim();
      if (!requestedUserId) {
        return res.status(400).json({ error: 'viewer_id_required' });
      }
      const userId = this.store.resolveKnownViewerId?.(requestedUserId) || requestedUserId;
      const catalog = this.collection?.getCatalogState?.(userId) || {
        userId,
        templates: [],
        dex: { owned: 0, total: TEMPLATE_CATALOG.length },
        essence: [],
        cosmetics: []
      };
      return res.json({ success: true, ...catalog, userId });
    }));
    this.api.registerRoute('GET', '/api/streammonsters/monster-catalog', (req, res) => {
      const hasPaging = req.query?.offset !== undefined || req.query?.limit !== undefined;
      const offset = hasPaging
        ? Math.max(0, Number.parseInt(req.query?.offset, 10) || 0)
        : 0;
      const limit = hasPaging
        ? Math.max(1, Math.min(100, Number.parseInt(req.query?.limit, 10) || 24))
        : TEMPLATE_CATALOG.length;
      const stageCatalog = this.getBundledFurryStageCatalog();
      const templates = TEMPLATE_CATALOG.map(template => ({
        ...template,
        assetPath: stageCatalog.byTemplate.get(template.templateId)?.[0]?.assetPath ||
          template.assetPath,
        stages: stageCatalog.byTemplate.get(template.templateId) || [],
        owned: false,
        silhouette: true,
        mastery: null
      }));
      res.json({
        success: true,
        templates: templates.slice(offset, offset + limit),
        dex: { owned: 0, total: TEMPLATE_CATALOG.length },
        total: TEMPLATE_CATALOG.length,
        formsTotal: stageCatalog.available,
        assetIntegrity: {
          assetVersion: stageCatalog.assetVersion,
          expected: 72,
          available: stageCatalog.available,
          healthy: stageCatalog.assetVersion === FURRY_ASSET_VERSION &&
            stageCatalog.available === 72
        },
        ...(hasPaging ? { offset, limit } : {})
      });
    });
    this.api.registerRoute('POST', '/api/streammonsters/config', this.protectAdmin((req, res) => {
      const current = this.configProvider.getConfig().streamMonsters || {};
      let update = null;
      try {
        this.validateRetentionConfigUpdate(req.body);
        update = this.sanitizeConfigUpdate(req.body);
      } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
      }
      if (current.giftMappingCustomized) update.giftMappingCustomized = true;
      const next = this.configProvider.updateConfig({ streamMonsters: update });
      res.json({
        success: true,
        config: this.publicConfig(next.streamMonsters, { includeCreator: true })
      });
    }));
    this.api.registerRoute(
      'POST',
      '/api/streammonsters/repair/eggs',
      this.protectAdmin((req, res) => {
        const dryRun = req.body?.dryRun !== false;
        if (!dryRun && req.body?.confirm !== 'reconcile_eggs') {
          return res.status(400).json({ error: 'repair_confirmation_required' });
        }
        const before = this.getEggRepairPlan();
        if (!dryRun) this.engine.markReadyEggs();
        const after = this.getEggRepairPlan();
        const result = {
          success: true,
          kind: 'eggs',
          dryRun,
          before,
          after,
          repaired: dryRun
            ? 0
            : Math.max(
              0,
              before.readyDue + before.expiryDue - after.readyDue - after.expiryDue
            )
        };
        this.auditRepair(result);
        return res.json(result);
      })
    );
    this.api.registerRoute(
      'POST',
      '/api/streammonsters/repair/matches',
      this.protectAdmin((req, res) => {
        const dryRun = req.body?.dryRun !== false;
        if (!dryRun && req.body?.confirm !== 'cancel_stale_matches') {
          return res.status(400).json({ error: 'repair_confirmation_required' });
        }
        const result = {
          success: true,
          kind: 'matches',
          ...(
            this.battleMatchService?.repairStaleMatches?.({
              dryRun,
              graceMs: 60_000
            }) || { dryRun, candidates: 0, cancelled: 0 }
          )
        };
        this.auditRepair(result);
        return res.json(result);
      })
    );
    this.api.registerRoute('POST', '/api/streammonsters/demo', this.protectAdmin((req, res) => {
      let preview = null;
      try {
        preview = this.validateDemoRequest(req.body);
      } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
      }
      const config = this.configProvider.getConfig().streamMonsters;
      const roleScene = /^role_(striker|guardian|trickster|sustain)$/.exec(
        preview?.scene || ''
      );
      const selectedTemplate = roleScene
        ? (
          TEMPLATE_CATALOG.find(template => template.role === roleScene[1]) ||
          TEMPLATE_CATALOG[0]
        )
        : (getTemplate(preview?.templateId) || TEMPLATE_CATALOG[0]);
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
      const demoSkillDeck = (template, evolutionStage, charge) => (
        ['A', 'B', 'C'].map(choice => {
          const skill = resolveStageSkill(
            template.templateId,
            choice,
            evolutionStage,
            V7_RULES_VERSION
          );
          const chargeRequired = choice === 'C'
            ? Math.max(1, Number(skill.chargeRequired) || 100)
            : 0;
          return {
            choice,
            icon: skill.icon,
            name: skill.name,
            nameKey: skill.nameKey,
            shortText: skill.shortText,
            shortTextKey: skill.shortTextKey,
            available: choice !== 'C' || charge >= chargeRequired,
            ...(choice === 'C' ? { chargeRequired } : {})
          };
        })
      );
      const evolutionStage = 2;
      const statsBefore = { ...monster.stats };
      const statChanges = evolutionStatGrant(monster.element, evolutionStage);
      const statsAfter = applyEvolutionGrant(
        statsBefore,
        monster.element,
        evolutionStage
      );
      const unlockedChoice = ['striker', 'trickster'].includes(selectedTemplate.role)
        ? 'A'
        : 'B';
      const evolutionPayload = {
        monster: {
          ...monster,
          stats: statsAfter,
          evolution_stage: evolutionStage,
          image_url: getEvolutionAssetPath(selectedTemplate, evolutionStage)
        },
        evolutionStage,
        spentEssence: 3,
        statsBefore,
        statsAfter,
        statChanges,
        unlockedSkill: resolveStageSkill(
          selectedTemplate.templateId,
          unlockedChoice,
          evolutionStage,
          V7_RULES_VERSION
        )
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
      const gcceState = this.gcceStateProvider() || {};
      const commandReferences = gcceState.commandReferences || {};
      const commandPrefix = typeof gcceState.commandPrefix === 'string' &&
        gcceState.commandPrefix
        ? gcceState.commandPrefix
        : '!';
      const commandReference = command => commandReferences[command]
        || (command === 'eggs'
          ? `${commandPrefix}eier`
          : `${commandPrefix}${command}`);
      const emitAdoptionHint = (titleKey, bodyKey, title, body) => emit(
        'streammonsters:tutorial_hint',
        {
          kind: 'adopt',
          titleKey,
          bodyKey,
          title,
          body,
          command: commandReference('adopt'),
          params: { command: commandReference('adopt') }
        }
      );
      if (preview) {
        const primaryCharge = preview.scene === 'special' ? 100 : 50;
        const fighters = [
          {
            slot: 1,
            locked: true,
            name: monster.name,
            element: monster.element,
            templateId: monster.template_id,
            evolutionStage: 1,
            imageUrl: monster.image_url,
            level: monster.level,
            hp: 50,
            maxHp: 50,
            shield: 0,
            charge: primaryCharge,
            skills: demoSkillDeck(selectedTemplate, 1, primaryCharge)
          },
          {
            slot: 2,
            locked: true,
            name: opponent.name,
            element: opponent.element,
            templateId: opponent.template_id,
            evolutionStage: 1,
            imageUrl: opponent.image_url,
            level: opponent.level,
            hp: 48,
            maxHp: 52,
            shield: 3,
            charge: 50,
            skills: demoSkillDeck(opponentTemplate, 1, 50)
          }
        ];
        const publicAction = ({
          choice = 'A',
          skillType = 'attack',
          hits = [{ index: 1, requestedDamage: 8, shieldAbsorbed: 3, hpDamage: 5, evaded: false }],
          outcomes = [],
          terminal = false
        } = {}) => ({
          sequence: 1,
          eventSequence: 4,
          round: 1,
          actorSlot: 1,
          targetSlot: 2,
          requestedChoice: choice,
          choice,
          choiceFallback: null,
          skill: {
            id: `${selectedTemplate.templateId}:${choice}`,
            name: selectedTemplate.skills[skillType]?.name || `${selectedTemplate.name} Strike`,
            type: skillType,
            element: selectedTemplate.element,
            vfxKey: selectedTemplate.skills[skillType]?.vfxKey || `${selectedTemplate.templateId}:${skillType}`
          },
          hits,
          outcomes,
          retaliations: [],
          statusEffects: [],
          actorState: {
            hp: 50,
            maxHp: 50,
            shield: skillType === 'defense' ? 8 : 0,
            charge: choice === 'C' ? 0 : 75
          },
          targetState: {
            hp: terminal ? 0 : 43,
            maxHp: 52,
            shield: 0,
            charge: 75
          },
          terminal
        });
        const skillPayload = type => ({
          battleId: 'demo-battle',
          matchId: 'demo-match',
          eventId: `demo-match:${type}`,
          sequence: 4,
          actorId: monster.monster_id,
          targetId: opponent.monster_id,
          monster,
          target: opponent,
          element: monster.element,
          skill: { ...selectedTemplate.skills[type], type },
          action: publicAction({
            choice: type === 'special' ? 'C' : (type === 'defense' ? 'B' : 'A'),
            skillType: type
          })
        });
        const isolatedBattleScenes = new Set([
          'attack',
          'defense',
          'skill',
          'multihit',
          'special',
          'ko',
          'role_striker',
          'role_guardian',
          'role_trickster',
          'role_sustain'
        ]);
        if (isolatedBattleScenes.has(preview.scene)) {
          emit('streammonsters:battle_choice_opened', {
            matchId: 'demo-match',
            eventId: `demo-match:${preview.scene}:roster`,
            sequence: 1,
            round: 1,
            deadlineMs: this.now() + 8_000,
            choices: ['A', 'B', 'C'],
            fighters
          });
        }
        if (preview.scene === 'free_offer') {
          emit('streammonsters:free_egg_offered', {
            offerId: 'demo-offer',
            reservedUntilMs: this.now() + 60_000,
            hint: commandReference('adopt')
          });
          emitAdoptionHint(
            'tutorialHintFreeOfferTitle',
            'tutorialHintFreeOfferBody',
            'Free egg reserved',
            'Claim your reserved egg before it becomes public.'
          );
        } else if (preview.scene === 'free_release') {
          emit('streammonsters:free_egg_released', {
            offerId: 'demo-offer',
            releasedAtMs: this.now(),
            hint: commandReference('adopt')
          });
          emitAdoptionHint(
            'tutorialHintFreeReleaseTitle',
            'tutorialHintFreeReleaseBody',
            'Free egg available',
            'The released egg can now be adopted by the next viewer.'
          );
        } else if (preview.scene === 'free_claim') {
          emit('streammonsters:free_egg_claimed', {
            offerId: 'demo-offer',
            egg,
            hint: commandReference('adopt')
          });
          emitAdoptionHint(
            'tutorialHintFreeClaimTitle',
            'tutorialHintFreeClaimBody',
            'Free egg adopted',
            'The egg is now incubating in the viewer collection.'
          );
        } else if (preview.scene === 'sealed_lock') {
          emit('streammonsters:battle_choice_locked', {
            matchId: 'demo-match',
            decision: {
              sequence: 3,
              round: 1,
              slot: 1,
              locked: true,
              source: 'viewer',
              deadlineMs: this.now() + 6_000
            }
          });
        } else if (preview.scene === 'sealed_reveal') {
          for (const slot of [1, 2]) {
            emit('streammonsters:battle_choice_locked', {
              matchId: 'demo-match',
              decision: {
                sequence: slot + 2,
                round: 1,
                slot,
                locked: true,
                source: 'viewer',
                deadlineMs: this.now() + 6_000
              }
            });
          }
          emit('streammonsters:battle_choices_revealed', {
            matchId: 'demo-match',
            round: 1,
            choices: [
              { slot: 1, choice: 'A', source: 'viewer' },
              { slot: 2, choice: 'B', source: 'viewer' }
            ]
          });
        } else if (preview.scene === 'spawn') {
          emit('streammonsters:egg_spawned', {
            userId: 'demo-viewer',
            egg,
            gift,
            hint: commandReference('inventory')
          });
        } else if (preview.scene === 'ready') {
          emit('streammonsters:egg_ready', {
            userId: 'demo-viewer',
            egg: { ...egg, state: 'ready' },
            hint: `${commandReference('hatch')} [slot]`
          });
        } else if (preview.scene === 'hatch') {
          emit('streammonsters:hatch_started', { userId: 'demo-viewer', egg, slot: 1 });
          emit('streammonsters:egg_hatched', { userId: 'demo-viewer', egg, monster });
        } else if (preview.scene === 'collection') {
          emit('streammonsters:collection_shown', {
            cards: TEMPLATE_CATALOG.slice(0, 7).map((template, index) => ({
              slot: index + 1,
              name: template.name,
              element: template.element,
              templateId: template.templateId,
              imageUrl: template.assetPath,
              level: index + 1
            })),
            rotate: true
          });
        } else if (preview.scene === 'evolution') {
          emit('streammonsters:monster_evolved', evolutionPayload);
        } else if (preview.scene === 'match') {
          emit('streammonsters:battle_match_found', {
            matchId: 'demo-match',
            deadlineMs: this.now() + 15_000
          });
          emit('streammonsters:battle_choice_opened', {
            matchId: 'demo-match',
            round: 1,
            deadlineMs: this.now() + 8_000,
            choices: ['A', 'B', 'C'],
            fighters
          });
        } else if (preview.scene === 'skill') {
          emit('streammonsters:battle_choice_locked', {
            matchId: 'demo-match',
            decision: { sequence: 3, round: 1, slot: 1, choice: 'A', source: 'viewer', timeout: false }
          });
          emit('streammonsters:battle_skill_used', skillPayload('attack'));
        } else if (preview.scene === 'multihit') {
          emit('streammonsters:battle_skill_used', {
            ...skillPayload('attack'),
            action: publicAction({
              choice: 'A',
              skillType: 'attack',
              hits: [
                { index: 1, requestedDamage: 4, shieldAbsorbed: 3, hpDamage: 1, evaded: false },
                { index: 2, requestedDamage: 4, shieldAbsorbed: 0, hpDamage: 4, evaded: false },
                { index: 3, requestedDamage: 4, shieldAbsorbed: 0, hpDamage: 4, evaded: false }
              ],
              outcomes: [{ type: 'multihit', hits: 3 }]
            })
          });
        } else if (preview.scene === 'special') {
          emit('streammonsters:battle_special_charged', {
            battleId: 'demo-battle',
            matchId: 'demo-match',
            monsterId: monster.monster_id,
            monster,
            element: monster.element,
            skill: selectedTemplate.skills.special
          });
          emit('streammonsters:battle_skill_used', skillPayload('special'));
        } else if (preview.scene === 'ko') {
          emit('streammonsters:battle_skill_used', {
            ...skillPayload('special'),
            action: publicAction({
              choice: 'C',
              skillType: 'special',
              hits: [{ index: 1, requestedDamage: 52, shieldAbsorbed: 3, hpDamage: 48, evaded: false }],
              terminal: true
            })
          });
          emit('streammonsters:battle_completed', {
            matchId: 'demo-match',
            winnerSlot: 1
          });
        } else if (preview.scene === 'xp') {
          emit('streammonsters:monster_xp_awarded', {
            monster: { ...monster, xp: 105 },
            amount: 15
          });
          emit('streammonsters:monster_level_up', {
            monster: { ...monster, level: 5, xp: 5, unspent_stat_points: 1 },
            levelsGained: 1
          });
        } else if (preview.scene === 'rankup') {
          emit('streammonsters:arena_rating_changed', {
            before: { rating: 995, tier: 'Bronze' },
            after: { rating: 1011, tier: 'Silver' },
            delta: 16
          });
          emit('streammonsters:season_rank_changed', {
            before: 'Silver',
            after: 'Gold',
            score: {
              points: 275,
              rank: 'Gold',
              title: 'Gold Collector',
              badge: 'gold',
              frame: 'gold'
            }
          });
        } else if (roleScene) {
          const roleSkillType = {
            striker: 'attack',
            guardian: 'defense',
            trickster: 'attack',
            sustain: 'special'
          }[roleScene[1]];
          emit('streammonsters:battle_skill_used', skillPayload(roleSkillType));
        } else {
          emit('streammonsters:battle_skill_used', skillPayload(preview.scene));
        }
        return res.json({ success: true, demo: true, ...preview });
      }
      emit('streammonsters:stream_started', {
        event: { element: 'Volt' },
        element: 'Volt'
      });
      emit('streammonsters:egg_spawned', {
        userId: 'demo-viewer',
        egg,
        gift,
        hint: commandReference('inventory')
      });
      emit('streammonsters:hype_changed', {
        userId: 'demo-viewer',
        hype: { points: 0, charged_eggs: 1 }
      });
      emit('streammonsters:hype_milestone', {
        userId: 'demo-viewer',
        points: 100,
        hype: { points: 100, charged_eggs: 1 }
      });
      emit('streammonsters:egg_ready', {
        userId: 'demo-viewer',
        egg: { ...egg, state: 'ready' },
        hint: `${commandReference('hatch')} [slot]`
      });
      emit('streammonsters:hatch_started', { userId: 'demo-viewer', egg, slot: 1 });
      emit('streammonsters:egg_hatched', { userId: 'demo-viewer', egg, monster });
      emit('streammonsters:monster_evolved', {
        userId: 'demo-viewer',
        ...evolutionPayload
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
      emit('streammonsters:arena_rating_changed', {
        userId: 'demo-viewer',
        before: { rating: 995, tier: 'Bronze' },
        after: { rating: 1011, tier: 'Silver' },
        delta: 16
      });
      emit('streammonsters:season_rank_changed', {
        userId: 'demo-viewer',
        before: 'Silver',
        after: 'Gold',
        score: {
          points: 275,
          rank: 'Gold',
          title: 'Gold Collector',
          badge: 'gold',
          frame: 'gold'
        }
      });
      emit('streammonsters:chat_result', {
        userId: 'demo-viewer',
        result: {
          status: 'rank',
          messageKey: 'chatResultRank',
          message: 'Arena Rating: Silver · 1011. Collector Score: Gold · 275.',
          arena: { rating: 1011, tier: 'Silver' },
          collector: { points: 275, rank: 'Gold' },
          score: { points: 275, rank: 'Gold' }
        }
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
      const type = req.query?.type === 'arena' ? 'arena' : 'collector';
      const entries = type === 'arena'
        ? this.getArenaLeaderboard(limit)
        : (this.progression?.getLeaderboard?.(limit) || []);
      res.json({
        success: true,
        type,
        entries: entries.map(entry => this.publicLeaderboardEntry(entry, type))
      });
    });
  }

  protectAdmin(handler) {
    return (req, res, next) => this.adminAuth(req, res, () => handler(req, res, next));
  }

  recordOverlayHeartbeat(input = {}) {
    const allowedBackends = new Set(['webgpu', 'canvas2d', 'css', 'waiting']);
    const allowedQualities = new Set(['auto', 'high', 'medium', 'low']);
    const allowedLayouts = new Set(['portrait', 'landscape']);
    const backend = allowedBackends.has(input?.renderer?.backend)
      ? input.renderer.backend
      : 'waiting';
    const quality = allowedQualities.has(input?.renderer?.quality)
      ? input.renderer.quality
      : 'auto';
    const fpsValue = Number(input?.renderer?.fps);
    const fps = Number.isFinite(fpsValue)
      ? Math.max(0, Math.min(240, Math.round(fpsValue)))
      : 0;
    const rawReason = String(input?.renderer?.fallbackReason || '').trim();
    const fallbackReason = /^[a-z0-9_-]{1,48}$/i.test(rawReason)
      ? rawReason.toLowerCase()
      : null;
    const volumeValue = Number(input?.audio?.masterVolume);
    this.overlayHeartbeat = {
      lastSeenAtMs: this.now(),
      layout: allowedLayouts.has(input.layout) ? input.layout : null,
      renderer: {
        backend,
        quality,
        fps,
        deviceLost: Boolean(input?.renderer?.deviceLost),
        fallbackReason
      },
      audio: {
        muted: Boolean(input?.audio?.muted),
        masterVolume: Number.isFinite(volumeValue)
          ? Math.max(0, Math.min(1, Math.round(volumeValue * 100) / 100))
          : 1
      }
    };
    return this.overlayHeartbeat;
  }

  getOverlayDiagnostics() {
    const heartbeat = this.overlayHeartbeat;
    const ageMs = heartbeat
      ? Math.max(0, this.now() - heartbeat.lastSeenAtMs)
      : null;
    const status = ageMs === null
      ? 'disconnected'
      : (ageMs <= 15_000 ? 'connected' : (ageMs <= 60_000 ? 'stale' : 'disconnected'));
    return {
      obs: {
        status,
        lastSeenAtMs: heartbeat?.lastSeenAtMs || null,
        ageMs
      },
      renderer: heartbeat
        ? { ...heartbeat.renderer, status }
        : {
          backend: 'waiting',
          quality: 'auto',
          fps: 0,
          deviceLost: false,
          fallbackReason: 'overlay_disconnected',
          status
        },
      audio: heartbeat
        ? { ...heartbeat.audio, status }
        : { muted: false, masterVolume: 1, status }
    };
  }

  getCreatorDiagnostics({ config = {}, gcce = {}, battle = {} } = {}) {
    const streamKey = this.engine.streamKey || 'offline';
    const offerRows = this.store.db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM streammonsters_free_egg_offers
      WHERE stream_key = ?
      GROUP BY status
    `).all(streamKey);
    const offers = { reserved: 0, public: 0, claimed: 0, total: 0 };
    for (const row of offerRows) {
      if (Object.prototype.hasOwnProperty.call(offers, row.status)) {
        offers[row.status] = Math.max(0, Number(row.count) || 0);
      }
    }
    offers.total = offers.reserved + offers.public + offers.claimed;
    const claims = this.store.db.prepare(`
      SELECT COUNT(*) AS count
      FROM streammonsters_free_egg_claims
      WHERE stream_key = ?
    `).get(streamKey).count;
    const nextCleanup = this.store.db.prepare(`
      SELECT MIN(reserved_until_ms) AS at_ms
      FROM streammonsters_free_egg_offers
      WHERE stream_key = ? AND status = 'reserved'
    `).get(streamKey);
    const matches = Array.isArray(battle.matches) ? battle.matches : [];
    const activeMatch = matches[0] || null;
    const deadlineMs = Number(
      activeMatch?.deadlineMs ??
      activeMatch?.deadline_ms ??
      activeMatch?.rosterDeadlineMs ??
      activeMatch?.actionDeadlineMs ??
      0
    );
    const hintState = this.hintStateProvider() || {};
    const aliasConflicts = Array.isArray(gcce.registrationConflicts)
      ? gcce.registrationConflicts
        .map(value => String(value || '').slice(0, 96))
        .filter(Boolean)
      : [];
    return {
      freeEggs: {
        enabled: config.freeEggDropsEnabled !== false,
        cooldownSeconds: this.normalizeFreeEggCooldownSeconds(
          config.freeEggCooldownSeconds
        ),
        offers,
        claims: Math.max(0, Number(claims) || 0),
        nextCleanupAtMs: Number(nextCleanup?.at_ms) || null
      },
      ingress: {
        transport: gcce.commandsRegistered ? 'gcce' : 'fallback',
        prefix: typeof gcce.commandPrefix === 'string' && gcce.commandPrefix
          ? gcce.commandPrefix
          : '!',
        registrationState: String(gcce.registrationState || 'fallback'),
        commandsRegistered: Boolean(gcce.commandsRegistered),
        aliasConflicts,
        unavailableCommands: Array.isArray(gcce.unavailableCommands)
          ? gcce.unavailableCommands
            .map(value => String(value || '').slice(0, 64))
            .filter(Boolean)
          : [],
        filterStatus: String(gcce.tiktokFilter?.status || 'unavailable'),
        commandPolicies: this.publicCommandPolicies(gcce.commandPolicies)
      },
      hints: {
        enabled: config.tutorialHintsEnabled !== false,
        intervalSeconds: this.normalizeTutorialHintIntervalSeconds(
          config.tutorialHintIntervalSeconds
        ),
        nextAllowedAtMs: Number(hintState.nextAllowedAtMs) || null,
        pending: Boolean(hintState.pendingKind)
      },
      match: {
        phase: String(activeMatch?.phase || activeMatch?.state || 'idle'),
        deadlineMs: deadlineMs > 0 ? deadlineMs : null,
        activeMatches: matches.length
      }
    };
  }

  publicCommandPolicies(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const result = {};
    for (const [command, policy] of Object.entries(input)) {
      if (!/^[a-z][a-z0-9_-]{0,31}$/.test(command) || !policy || typeof policy !== 'object') {
        continue;
      }
      result[command] = {
        enabledAliases: Array.isArray(policy.enabledAliases)
          ? policy.enabledAliases.map(value => String(value).slice(0, 32)).slice(0, 16)
          : [],
        registeredAliases: Array.isArray(policy.registeredAliases)
          ? policy.registeredAliases.map(value => String(value).slice(0, 32)).slice(0, 16)
          : [],
        userCooldownMs: Math.max(0, Number(policy.userCooldownMs) || 0),
        globalCooldownMs: Math.max(0, Number(policy.globalCooldownMs) || 0)
      };
    }
    return result;
  }

  normalizeFreeEggCooldownSeconds(value) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds >= 60 && seconds <= 31_536_000
      ? Math.round(seconds)
      : 86_400;
  }

  normalizeTutorialHintIntervalSeconds(value) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds >= 60 && seconds <= 300
      ? Math.round(seconds)
      : 90;
  }

  validateRetentionConfigUpdate(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return;
    if (
      Object.prototype.hasOwnProperty.call(input, 'freeEggDropsEnabled') &&
      typeof input.freeEggDropsEnabled !== 'boolean'
    ) {
      throw new Error('STREAM_MONSTERS_FREE_EGG_ENABLED_INVALID');
    }
    if (Object.prototype.hasOwnProperty.call(input, 'freeEggCooldownSeconds')) {
      const seconds = Number(input.freeEggCooldownSeconds);
      if (!Number.isFinite(seconds) || seconds < 60 || seconds > 31_536_000) {
        throw new Error('STREAM_MONSTERS_FREE_EGG_COOLDOWN_INVALID');
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(input, 'tutorialHintsEnabled') &&
      typeof input.tutorialHintsEnabled !== 'boolean'
    ) {
      throw new Error('STREAM_MONSTERS_TUTORIAL_HINTS_ENABLED_INVALID');
    }
    if (Object.prototype.hasOwnProperty.call(input, 'tutorialHintIntervalSeconds')) {
      const seconds = Number(input.tutorialHintIntervalSeconds);
      if (!Number.isFinite(seconds) || seconds < 60 || seconds > 300) {
        throw new Error('STREAM_MONSTERS_TUTORIAL_HINT_INTERVAL_INVALID');
      }
    }
  }

  getEggRepairPlan() {
    const nowMs = this.now();
    const expiryMs = Number(
      this.configProvider.getConfig().streamMonsters?.eggExpiryMs
    ) || 86_400_000;
    const readyDue = this.store.db.prepare(`
      SELECT COUNT(*) AS count
      FROM streammonsters_eggs
      WHERE state = 'incubating' AND ready_at_ms IS NOT NULL AND ready_at_ms <= ?
    `).get(nowMs).count;
    const expiryDue = this.store.db.prepare(`
      SELECT COUNT(*) AS count
      FROM streammonsters_eggs
      WHERE state = 'ready'
        AND COALESCE(expires_at_ms, ready_at_ms + ?) <= ?
    `).get(expiryMs, nowMs).count;
    const queued = this.store.db.prepare(`
      SELECT COUNT(*) AS count
      FROM streammonsters_eggs
      WHERE state = 'queued'
    `).get().count;
    return {
      readyDue: Math.max(0, Number(readyDue) || 0),
      expiryDue: Math.max(0, Number(expiryDue) || 0),
      queued: Math.max(0, Number(queued) || 0)
    };
  }

  auditRepair(result) {
    this.api.log?.(JSON.stringify({
      component: 'streammonsters',
      event: 'creator_repair',
      kind: result.kind,
      dryRun: Boolean(result.dryRun),
      repaired: Math.max(0, Number(result.repaired ?? result.cancelled) || 0),
      candidates: Math.max(
        0,
        Number(result.candidates ?? result.before?.readyDue ?? 0) || 0
      )
    }), 'info');
  }

  getArenaLeaderboard(limit = 50) {
    const sqlite = this.store?.db;
    if (!sqlite?.prepare) return [];
    let seasonId = null;
    try {
      seasonId = this.battleMatchService?.getCurrentArenaSeason?.()?.seasonId || null;
    } catch (_) {
      seasonId = null;
    }
    if (!seasonId) return [];
    const rows = sqlite.prepare(`
      SELECT
        ratings.viewer_id AS user_id,
        ratings.rating,
        ratings.battles_rated
      FROM streammonsters_arena_ratings AS ratings
      WHERE ratings.season_id = ?
      ORDER BY ratings.rating DESC, ratings.battles_rated DESC, ratings.viewer_id ASC
      LIMIT ?
    `).all(seasonId, Math.max(1, Math.min(100, Number(limit) || 50)));
    return rows.map(row => ({
      ...row,
      tier: row.rating >= 1500
        ? 'Monster Master'
        : (row.rating >= 1300
          ? 'Crystal'
          : (row.rating >= 1150 ? 'Gold' : (row.rating >= 1000 ? 'Silver' : 'Bronze')))
    }));
  }

  publicLeaderboardEntry(entry = {}, type = 'collector') {
    const viewerId = entry.user_id ?? entry.viewer_id;
    const rawDisplayName = this.store?.getViewerDisplayName?.(viewerId) || 'Viewer';
    const displayName = String(rawDisplayName)
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 64) || 'Viewer';
    if (type === 'arena') {
      return {
        displayName,
        rating: Math.max(0, Number(entry.rating) || 0),
        battles_rated: Math.max(0, Number(entry.battles_rated) || 0),
        tier: String(entry.tier || 'Bronze').slice(0, 32)
      };
    }
    const result = {
      displayName,
      points: Math.max(0, Number(entry.points) || 0),
      rank: String(entry.rank || 'Bronze').slice(0, 32)
    };
    for (const key of ['title', 'badge', 'frame']) {
      if (entry[key] !== null && entry[key] !== undefined) {
        result[key] = String(entry[key]).slice(0, 96);
      }
    }
    return result;
  }

  getBundledFurryStageCatalog() {
    const byTemplate = new Map();
    let parsed = null;
    let manifestBuffer = null;
    let manifestStat = null;
    const manifestPath = path.join(
      this.pluginDir,
      'assets',
      'streammonsters',
      'furry',
      'manifest.json'
    );
    try {
      manifestStat = fs.lstatSync(manifestPath);
      if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
        return { byTemplate, available: 0, assetVersion: null };
      }
      manifestBuffer = fs.readFileSync(manifestPath);
      parsed = JSON.parse(manifestBuffer.toString('utf8'));
    } catch (_) {
      parsed = null;
    }
    if (
      parsed?.schemaVersion !== 2 ||
      parsed?.productionMode !== 'bundled-only' ||
      parsed?.assetVersion !== FURRY_ASSET_VERSION ||
      !Array.isArray(parsed.assets)
    ) {
      return { byTemplate, available: 0, assetVersion: null };
    }
    const assetRoot = path.resolve(
      this.pluginDir,
      'assets',
      'streammonsters',
      'furry'
    );
    const candidates = [];
    parsed.assets.forEach(asset => {
      const templateId = String(asset?.templateId || '').toLocaleLowerCase();
      const stage = Number(asset?.stage);
      const relativePath = String(asset?.assetPath || '').replace(/\\/g, '/');
      const dimensions = Array.isArray(asset?.dimensions)
        ? asset.dimensions.map(Number)
        : [];
      if (
        !getTemplate(templateId) ||
        ![1, 2, 3].includes(stage) ||
        !/^assets\/streammonsters\/furry\/[a-z0-9/-]+\.png$/.test(relativePath) ||
        dimensions[0] !== 1024 ||
        dimensions[1] !== 1024 ||
        !/^[a-f0-9]{64}$/i.test(String(asset?.sha256 || ''))
      ) {
        return;
      }
      const absolutePath = path.resolve(this.pluginDir, relativePath);
      if (
        absolutePath !== assetRoot &&
        !absolutePath.startsWith(`${assetRoot}${path.sep}`)
      ) {
        return;
      }
      let stat = null;
      try {
        stat = fs.lstatSync(absolutePath);
      } catch (_) {
        stat = null;
      }
      candidates.push({
        asset,
        absolutePath,
        dimensions,
        relativePath,
        stage,
        stat,
        templateId
      });
    });
    const manifestHash = crypto
      .createHash('sha256')
      .update(manifestBuffer)
      .digest('hex');
    const cacheKey = JSON.stringify({
      manifestHash,
      manifestSize: manifestStat.size,
      manifestMtimeMs: manifestStat.mtimeMs,
      files: candidates.map(candidate => ({
        path: candidate.relativePath,
        size: candidate.stat?.size ?? null,
        mtimeMs: candidate.stat?.mtimeMs ?? null,
        ctimeMs: candidate.stat?.ctimeMs ?? null
      }))
    });
    if (this.assetCatalogCache?.key === cacheKey) {
      return this.assetCatalogCache.value;
    }
    candidates.forEach(candidate => {
      const {
        asset,
        absolutePath,
        dimensions,
        relativePath,
        stage,
        stat,
        templateId
      } = candidate;
      if (!stat?.isFile() || stat.isSymbolicLink()) return;
      let fileBuffer = null;
      try {
        fileBuffer = fs.readFileSync(absolutePath);
      } catch (_) {
        return;
      }
      if (
        fileBuffer.length < 24 ||
        !fileBuffer.subarray(0, 8).equals(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        ) ||
        fileBuffer.readUInt32BE(8) !== 13 ||
        fileBuffer.subarray(12, 16).toString('ascii') !== 'IHDR' ||
        fileBuffer.readUInt32BE(16) !== dimensions[0] ||
        fileBuffer.readUInt32BE(20) !== dimensions[1] ||
        crypto.createHash('sha256').update(fileBuffer).digest('hex') !==
          String(asset.sha256).toLocaleLowerCase()
      ) {
        return;
      }
      if (!byTemplate.has(templateId)) byTemplate.set(templateId, []);
      const stages = byTemplate.get(templateId);
      if (stages.some(existing => existing.stage === stage)) return;
      stages.push({
        stage,
        element: asset.element,
        species: asset.species,
        assetPath: `/plugins/streamalchemy/${relativePath}`,
        dimensions,
        sha256: String(asset.sha256).toLocaleLowerCase(),
        trimRect: asset.trimRect || null,
        pivot: asset.pivot || null,
        facing: asset.facing || 'center',
        hitAnchor: asset.hitAnchor || null,
        effectAnchor: asset.effectAnchor || null
      });
    });
    byTemplate.forEach(stages => stages.sort((left, right) => left.stage - right.stage));
    const available = [...byTemplate.values()].reduce((sum, stages) => (
      sum + new Set(stages.map(stage => stage.stage)).size
    ), 0);
    const value = {
      byTemplate,
      available,
      assetVersion: parsed.assetVersion
    };
    this.assetCatalogCache = { key: cacheKey, value };
    return value;
  }

  sanitizeConfigUpdate(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const safe = {};
    for (const key of ['enabled', 'creatorName', 'elementRules']) {
      if (Object.prototype.hasOwnProperty.call(input, key)) safe[key] = input[key];
    }
    if (typeof input.giftMappingCustomized === 'boolean') safe.giftMappingCustomized = input.giftMappingCustomized;
    if (typeof input.freeEggDropsEnabled === 'boolean') {
      safe.freeEggDropsEnabled = input.freeEggDropsEnabled;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'freeEggCooldownSeconds')) {
      safe.freeEggCooldownSeconds = this.normalizeFreeEggCooldownSeconds(
        input.freeEggCooldownSeconds
      );
    }
    if (typeof input.tutorialHintsEnabled === 'boolean') {
      safe.tutorialHintsEnabled = input.tutorialHintsEnabled;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'tutorialHintIntervalSeconds')) {
      safe.tutorialHintIntervalSeconds = this.normalizeTutorialHintIntervalSeconds(
        input.tutorialHintIntervalSeconds
      );
    }
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
    const scenes = new Set([
      'spawn',
      'ready',
      'hatch',
      'collection',
      'evolution',
      'match',
      'attack',
      'defense',
      'skill',
      'multihit',
      'special',
      'ko',
      'xp',
      'rankup',
      'free_offer',
      'free_release',
      'free_claim',
      'sealed_lock',
      'sealed_reveal',
      'role_striker',
      'role_guardian',
      'role_trickster',
      'role_sustain'
    ]);
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
      rulesVersion: V7_RULES_VERSION,
      hatchDurationMs: config.hatchDurationMs,
      incubationPresetsMs: [30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000],
      eggExpiryMs: [21_600_000, 43_200_000, 86_400_000, 172_800_000].includes(
        Number(config.eggExpiryMs)
      ) ? Number(config.eggExpiryMs) : 86_400_000,
      eggExpiryPresetsMs: [21_600_000, 43_200_000, 86_400_000, 172_800_000],
      seasonDurationDays: [7, 14, 28, 60, 90].includes(Number(config.seasonDurationDays))
        ? Number(config.seasonDurationDays)
        : 28,
      maxUnhatchedEggs: 3,
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
    if (includeCreator) {
      result.creatorName = config.creatorName || '';
      result.freeEggDropsEnabled = config.freeEggDropsEnabled !== false;
      result.freeEggCooldownSeconds = this.normalizeFreeEggCooldownSeconds(
        config.freeEggCooldownSeconds
      );
      result.tutorialHintsEnabled = config.tutorialHintsEnabled !== false;
      result.tutorialHintIntervalSeconds = this.normalizeTutorialHintIntervalSeconds(
        config.tutorialHintIntervalSeconds
      );
    }
    return result;
  }

  publicGcceState(state = {}) {
    return {
      commandPrefix: typeof state.commandPrefix === 'string' && state.commandPrefix
        ? state.commandPrefix
        : '!',
      commandReferences: state.commandReferences && typeof state.commandReferences === 'object'
        ? { ...state.commandReferences }
        : {},
      registrationState: String(state.registrationState || 'fallback'),
      registeredCommands: Array.isArray(state.registeredCommands)
        ? [...state.registeredCommands]
        : [],
      commandsRegistered: Boolean(state.commandsRegistered)
    };
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
