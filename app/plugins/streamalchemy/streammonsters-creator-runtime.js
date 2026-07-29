(function attachStreamMonstersCreatorRuntime(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersCreatorRuntime = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const CREATOR_SECTIONS = Object.freeze([
    Object.freeze({ id: 'live-center', titleKey: 'liveCenterTitle' }),
    Object.freeze({ id: 'gameplay', titleKey: 'gameplayTitle' }),
    Object.freeze({ id: 'gifts-chat', titleKey: 'giftsChatTitle' }),
    Object.freeze({ id: 'languages', titleKey: 'overlayLanguagesTitle' }),
    Object.freeze({ id: 'overlay-studio', titleKey: 'overlayStudioTitle' }),
    Object.freeze({ id: 'asset-library', titleKey: 'assetLibraryTitle' }),
    Object.freeze({ id: 'community-seasons', titleKey: 'communitySeasonsTitle' })
  ]);
  const PORTRAIT_PREVIEW_ZONES = Object.freeze({
    logo: Object.freeze({ x: 4, y: 2, width: 24, height: 6 }),
    music: Object.freeze({ x: 5, y: 14.5, width: 58, height: 4.5 }),
    notification: Object.freeze({ x: 4, y: 20, width: 92, height: 5 }),
    avatar: Object.freeze({ x: 2, y: 26.5, width: 96, height: 31 }),
    likes: Object.freeze({ x: 2, y: 58.5, width: 96, height: 6 }),
    shelf: Object.freeze({ x: 3, y: 66.5, width: 94, height: 7 }),
    xp: Object.freeze({ x: 4, y: 82.5, width: 92, height: 11 }),
    battle: Object.freeze({ x: 0, y: 0, width: 100, height: 74 }),
    safe: Object.freeze({ x: 0, y: 74, width: 100, height: 26 })
  });
  const LANDSCAPE_PREVIEW_ZONES = Object.freeze({
    battle: Object.freeze({ x: 0, y: 0, width: 100, height: 74 }),
    safe: Object.freeze({ x: 0, y: 74, width: 100, height: 26 })
  });
  const COMMAND_ACTIONS = Object.freeze([
    'eggs',
    'adopt',
    'hatch',
    'inventory',
    'monsters',
    'monster',
    'choose',
    'evolve',
    'battle',
    'leavebattle',
    'rank',
    'quests',
    'monstershelp'
  ]);
  const COMMAND_GROUPS = Object.freeze([
    Object.freeze({
      id: 'eggs',
      titleKey: 'commandGroupEggs',
      commands: Object.freeze(['eggs', 'hatch', 'adopt'])
    }),
    Object.freeze({
      id: 'collection',
      titleKey: 'commandGroupCollection',
      commands: Object.freeze(['inventory', 'monsters', 'monster', 'evolve'])
    }),
    Object.freeze({
      id: 'arena',
      titleKey: 'commandGroupArena',
      commands: Object.freeze(['choose', 'battle', 'leavebattle'])
    }),
    Object.freeze({
      id: 'progress',
      titleKey: 'commandGroupProgress',
      commands: Object.freeze(['rank', 'quests', 'monstershelp'])
    })
  ]);
  const DEMO_SCENES = Object.freeze([
    'spawn',
    'ready',
    'hatch',
    'collection',
    'evolution',
    'match',
    'skill',
    'multihit',
    'special',
    'ko',
    'xp',
    'rankup',
    'attack',
    'defense',
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
  const HATCH_PRESETS = Object.freeze([30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000]);
  const EGG_EXPIRY_PRESETS = Object.freeze([21_600_000, 43_200_000, 86_400_000, 172_800_000]);
  const SEASON_DURATIONS = Object.freeze([7, 14, 28, 60, 90]);
  const RENDERER_QUALITIES = Object.freeze(['auto', 'high', 'medium', 'low']);
  const MASTERY_THRESHOLDS = Object.freeze([10, 25, 50]);
  const REPAIR_ACTIONS = Object.freeze({
    eggs: Object.freeze({
      route: '/api/streammonsters/repair/eggs',
      confirmation: 'reconcile_eggs'
    }),
    matches: Object.freeze({
      route: '/api/streammonsters/repair/matches',
      confirmation: 'cancel_stale_matches'
    })
  });

  function normalizeOverlayLanguage(input = {}) {
    const supported = ['de', 'en', 'es', 'fr'];
    const candidate = input && typeof input === 'object' && !Array.isArray(input)
      ? input
      : {};
    const requested = Array.isArray(candidate.locales) ? candidate.locales : [];
    const locales = [...new Set(requested
      .map(locale => String(locale || '').trim().toLowerCase())
      .filter(locale => supported.includes(locale)))]
      .slice(0, 2);
    const rawPrimary = String(candidate.primaryLocale || '').trim().toLowerCase();
    if (!rawPrimary && !requested.length) {
      return {
        primaryLocale: 'de',
        locales: ['de', 'en'],
        secondsPerLocale: 5
      };
    }
    const primaryLocale = supported.includes(rawPrimary)
      ? rawPrimary
      : (locales[0] || 'de');
    const seconds = Number(candidate.secondsPerLocale);
    return {
      primaryLocale,
      locales: [primaryLocale, ...locales.filter(locale => locale !== primaryLocale)]
        .slice(0, 2),
      secondsPerLocale: Number.isFinite(seconds) && seconds >= 4 && seconds <= 6
        ? Math.round(seconds)
        : 5
    };
  }

  function buildConfigPayload({ currentConfig = {}, values = {} } = {}) {
    const notificationDurationMs = Number(values.notificationDurationMs);
    const freeEggCooldownSeconds = Number(values.freeEggCooldownSeconds);
    const tutorialHintIntervalSeconds = Number(values.tutorialHintIntervalSeconds);
    const autoHatchActiveWindowSeconds = Number(values.autoHatchActiveWindowSeconds);
    return {
      creatorName: String(values.creatorName || '').trim(),
      hatchDurationMs: HATCH_PRESETS.includes(Number(values.hatchDurationMs))
        ? Number(values.hatchDurationMs)
        : 120_000,
      eggExpiryMs: EGG_EXPIRY_PRESETS.includes(Number(values.eggExpiryMs))
        ? Number(values.eggExpiryMs)
        : 86_400_000,
      seasonDurationDays: SEASON_DURATIONS.includes(Number(values.seasonDurationDays))
        ? Number(values.seasonDurationDays)
        : 28,
      visualPack: 'furry',
      layouts: {
        landscape: {
          anchor: values.landscapeAnchor || 'bottom-center',
          scale: Number(values.landscapeScale) || 100
        },
        portrait: {
          anchor: values.portraitAnchor || 'top-center',
          scale: Number(values.portraitScale) || 100
        }
      },
      rendererQuality: RENDERER_QUALITIES.includes(values.rendererQuality)
        ? values.rendererQuality
        : 'auto',
      notificationDurationMs: Number.isFinite(notificationDurationMs)
        ? notificationDurationMs
        : 12_000,
      freeEggDropsEnabled: values.freeEggDropsEnabled !== false,
      freeEggCooldownSeconds: Number.isFinite(freeEggCooldownSeconds) &&
        freeEggCooldownSeconds >= 60 &&
        freeEggCooldownSeconds <= 31_536_000
        ? Math.round(freeEggCooldownSeconds)
        : 86_400,
      autoHatchActiveViewers: values.autoHatchActiveViewers !== false,
      autoHatchActiveWindowSeconds: Number.isFinite(autoHatchActiveWindowSeconds) &&
        autoHatchActiveWindowSeconds >= 30 &&
        autoHatchActiveWindowSeconds <= 900
        ? Math.round(autoHatchActiveWindowSeconds)
        : 300,
      tutorialHintsEnabled: values.tutorialHintsEnabled !== false,
      tutorialHintIntervalSeconds: Number.isFinite(tutorialHintIntervalSeconds) &&
        tutorialHintIntervalSeconds >= 60 &&
        tutorialHintIntervalSeconds <= 300
        ? Math.round(tutorialHintIntervalSeconds)
        : 90,
      overlayLanguage: normalizeOverlayLanguage(
        values.overlayLanguage || currentConfig.overlayLanguage
      ),
      commandAliases: values.commandAliases || currentConfig.commandAliases || {},
      audioChannels: values.audioChannels || currentConfig.audioChannels || {},
      giftMappingCustomized: Boolean(currentConfig.giftMappingCustomized)
    };
  }

  function buildAliasDiagnostics(commandAliases = {}, gcce = {}) {
    const owners = new Map();
    Object.entries(commandAliases).forEach(([command, aliases]) => {
      const enabled = Array.isArray(aliases?.enabled) ? aliases.enabled : [];
      enabled.forEach(rawAlias => {
        const alias = String(rawAlias || '').trim().toLocaleLowerCase();
        if (!alias) return;
        if (!owners.has(alias)) owners.set(alias, new Set());
        owners.get(alias).add(command);
      });
    });
    const conflicts = [...owners.entries()]
      .filter(([, commands]) => commands.size > 1)
      .map(([alias, commands]) => ({ alias, commands: [...commands].sort() }))
      .sort((left, right) => left.alias.localeCompare(right.alias));
    const registrationConflicts = Array.isArray(gcce.registrationConflicts)
      ? [...gcce.registrationConflicts]
      : [];
    const unavailableCommands = Array.isArray(gcce.unavailableCommands)
      ? [...gcce.unavailableCommands]
      : [];
    return {
      conflicts,
      registrationConflicts,
      unavailableCommands,
      healthy: conflicts.length === 0 &&
        registrationConflicts.length === 0 &&
        unavailableCommands.length === 0
    };
  }

  function leaderboardDisplayName(entry = {}) {
    return String(
      entry.displayName ??
      entry.display_name ??
      entry.user_id ??
      entry.viewer_id ??
      'Viewer'
    )
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 64) || 'Viewer';
  }

  function resolveCommandReference(command, {
    gcce = {},
    commandAliases = {}
  } = {}) {
    const publishedReference = String(
      gcce.commandReferences?.[command] || ''
    ).trim();
    if (publishedReference) return publishedReference;

    const enabledAliases = Array.isArray(commandAliases?.[command]?.enabled)
      ? commandAliases[command].enabled
        .map(alias => String(alias || '').trim().toLocaleLowerCase())
        .filter(Boolean)
      : [];
    const registeredCommands = new Set(
      (Array.isArray(gcce.registeredCommands) ? gcce.registeredCommands : [])
        .map(alias => String(alias || '').trim().toLocaleLowerCase())
        .filter(Boolean)
    );
    const registrationIsActive = String(gcce.registrationState || '')
      .startsWith('active');
    const alias = registrationIsActive
      ? enabledAliases.find(candidate => registeredCommands.has(candidate))
      : enabledAliases[0];
    if (!alias) return '';

    const prefix = typeof gcce.commandPrefix === 'string' &&
      gcce.commandPrefix.length > 0
      ? gcce.commandPrefix
      : '!';
    return `${prefix}${alias}`;
  }

  function buildCommandDiagnostics(gcce = {}) {
    const policies = gcce.commandPolicies && typeof gcce.commandPolicies === 'object'
      ? gcce.commandPolicies
      : {};
    return COMMAND_ACTIONS.map(command => {
      const policy = policies[command] || {};
      const reference = String(gcce.commandReferences?.[command] || '').trim();
      const enabledAliases = Array.isArray(policy.enabledAliases)
        ? policy.enabledAliases.map(alias => String(alias || '').trim()).filter(Boolean)
        : [];
      const registeredAliases = Array.isArray(policy.registeredAliases)
        ? policy.registeredAliases.map(alias => String(alias || '').trim()).filter(Boolean)
        : [];
      return {
        command,
        reference,
        enabled: Boolean(reference || registeredAliases.length),
        enabledAliases,
        registeredAliases,
        userCooldownMs: Math.max(0, Number(policy.userCooldownMs) || 0),
        globalCooldownMs: Math.max(0, Number(policy.globalCooldownMs) || 0)
      };
    });
  }

  function buildCommandGroups({ gcce = {}, commandAliases = {} } = {}) {
    const prefix = typeof gcce.commandPrefix === 'string' && gcce.commandPrefix
      ? gcce.commandPrefix
      : '!';
    const policies = new Map(
      buildCommandDiagnostics(gcce).map(policy => [policy.command, policy])
    );
    const conflicts = Array.isArray(gcce.registrationConflicts)
      ? gcce.registrationConflicts
      : [];
    const tiktokFilter = gcce.tiktokFilter && typeof gcce.tiktokFilter === 'object'
      ? gcce.tiktokFilter
      : {};
    const conflictsWith = (command, aliases) => conflicts.some(conflict => {
      const serialized = typeof conflict === 'string'
        ? conflict.toLowerCase()
        : JSON.stringify(conflict || {}).toLowerCase();
      return serialized.includes(command.toLowerCase()) ||
        aliases.some(alias => serialized.includes(alias.toLowerCase()));
    });
    return COMMAND_GROUPS.map(group => ({
      id: group.id,
      titleKey: group.titleKey,
      commands: group.commands.map(command => {
        const policy = policies.get(command) || {
          command,
          reference: '',
          enabled: false,
          enabledAliases: [],
          registeredAliases: [],
          userCooldownMs: 0,
          globalCooldownMs: 0
        };
        const configured = commandAliases?.[command] || {};
        const enabledAliases = policy.enabledAliases.length
          ? [...policy.enabledAliases]
          : (Array.isArray(configured.enabled) ? [...configured.enabled] : []);
        const disabledAliases = Array.isArray(configured.disabled)
          ? [...configured.disabled]
          : [];
        const primaryAlias = String(policy.reference || '').startsWith(prefix)
          ? String(policy.reference).slice(prefix.length).split(/\s+/)[0]
          : (enabledAliases[0] || '');
        return {
          ...policy,
          prefix,
          primaryAlias,
          enabledAliases,
          disabledAliases,
          gcceConflict: conflictsWith(command, [...enabledAliases, ...disabledAliases]),
          tiktokFilterStatus: String(tiktokFilter.status || 'unavailable'),
          tiktokFilterProbeable: Boolean(tiktokFilter.probeable),
          tiktokFilterRecommendation: String(
            tiktokFilter.recommendation || 'use_custom_aliases'
          ),
          outcomeKey: `commandOutcome${command.charAt(0).toUpperCase()}${command.slice(1)}`
        };
      })
    }));
  }

  const LIVE_STATUS_TRANSLATIONS = Object.freeze({
    connected: 'statusConnected',
    disconnected: 'statusDisconnected',
    enabled: 'statusEnabled',
    disabled: 'statusDisabled',
    active: 'statusActive',
    active_partial: 'statusActivePartial',
    inactive: 'statusInactive',
    fallback: 'statusFallback',
    stale: 'statusStale',
    idle: 'statusIdle',
    waiting: 'statusWaiting',
    muted: 'statusMuted',
    roster: 'statusRoster',
    action: 'statusAction',
    resolving: 'statusResolving',
    complete: 'statusComplete',
    completed: 'statusComplete',
    cancelled: 'statusCancelled',
    canceled: 'statusCancelled',
    queued: 'statusQueued',
    searching: 'statusSearching'
  });

  function liveStatusTranslationKey(value) {
    const normalized = String(value || '')
      .trim()
      .toLocaleLowerCase()
      .replace(/[\s-]+/g, '_');
    return LIVE_STATUS_TRANSLATIONS[normalized] || '';
  }

  function buildCreatorLiveView({ status = {}, state = {}, now = Date.now() } = {}) {
    const match = Array.isArray(state.battle?.matches) ? state.battle.matches[0] : null;
    const deadlineMs = Number(
      match?.deadlineMs ??
      match?.deadline_ms ??
      (match?.state === 'roster' ? match?.rosterDeadlineMs : match?.actionDeadlineMs) ??
      (match?.state === 'roster' ? match?.roster_deadline_ms : match?.action_deadline_ms) ??
      match?.deadline ??
      0
    );
    const rendererBackend = state.renderer?.backend || state.renderer?.renderer || 'waiting';
    const rendererFps = Number(state.renderer?.fps);
    const renderer = Number.isFinite(rendererFps) && rendererFps > 0
      ? `${rendererBackend} · ${Math.round(rendererFps)} FPS`
      : rendererBackend;
    const warnings = [];
    if (status.restarting) warnings.push('restart_pending');
    if (state.gcce?.registrationError) warnings.push('gcce_error');
    if ((state.gcce?.registrationConflicts || []).length) warnings.push('alias_conflicts');
    if (state.renderer?.fallbackReason) warnings.push('renderer_fallback');
    if (state.renderer?.deviceLost) warnings.push('renderer_device_lost');
    if (state.obs?.status === 'stale') warnings.push('obs_stale');
    if (state.obs?.status === 'disconnected') warnings.push('obs_disconnected');
    return {
      tiktok: status.isConnected ? 'connected' : 'disconnected',
      plugin: state.config?.enabled === false ? 'disabled' : 'enabled',
      gcce: state.gcce?.commandsRegistered
        ? 'active'
        : (state.gcce?.registrationState || 'fallback'),
      obs: state.obs?.status || 'disconnected',
      prefix: state.gcce?.commandPrefix || '!',
      queue: Math.max(0, Number(state.eggCounts?.queued ?? state.queue?.length) || 0),
      hype: Math.max(0, Number(state.hype?.points) || 0),
      battlePhase: match?.phase || match?.state || 'idle',
      countdownMs: deadlineMs > 0 ? Math.max(0, deadlineMs - Number(now || 0)) : 0,
      renderer,
      audio: state.audioRuntime?.muted ||
        state.config?.audioChannels?.master?.enabled === false
        ? 'muted'
        : (state.audioRuntime?.status === 'connected' ? 'active' : 'waiting'),
      warnings
    };
  }

  function previewGeometry(layout) {
    const portrait = layout === 'portrait';
    const sourceZones = portrait ? PORTRAIT_PREVIEW_ZONES : LANDSCAPE_PREVIEW_ZONES;
    return {
      width: portrait ? 1080 : 1920,
      height: portrait ? 1920 : 1080,
      gameplayPercent: 74,
      chatPercent: 26,
      zones: Object.fromEntries(
        Object.entries(sourceZones).map(([name, rectangle]) => [name, { ...rectangle }])
      )
    };
  }

  function buildEggShelfDiagnostics(eggStage = []) {
    const eggs = Array.isArray(eggStage) ? eggStage : [];
    const publicFree = eggs.filter(egg => (
      egg?.provenance === 'free' &&
      egg?.state === 'public' &&
      egg?.adoptable === true
    )).length;
    const ready = eggs.filter(egg => egg?.state === 'ready').length;
    const incubating = eggs.filter(egg => (
      egg?.state === 'incubating' || egg?.state === 'queued'
    )).length;
    return {
      total: eggs.length,
      visible: Math.min(8, eggs.length),
      overflow: Math.max(0, eggs.length - 8),
      publicFree,
      ready,
      incubating
    };
  }

  function buildAssetStageEntries({ assets = [] } = {}) {
    const seen = new Set();
    return assets.flatMap(asset => {
      const templateId = String(asset?.templateId || '').toLocaleLowerCase();
      const stage = Number(asset?.stage);
      const assetPath = String(asset?.assetPath || '').replace(/\\/g, '/');
      const key = `${templateId}:${stage}`;
      if (
        !templateId ||
        ![1, 2, 3].includes(stage) ||
        !/^assets\/streammonsters\/furry\/[a-z0-9/-]+\.png$/.test(assetPath) ||
        seen.has(key)
      ) {
        return [];
      }
      seen.add(key);
      return [{
        templateId,
        name: String(asset?.name || templateId),
        element: String(asset?.element || ''),
        species: String(asset?.species || ''),
        stage,
        assetUrl:`/plugins/streamalchemy/${assetPath}`,
        healthy:Number(asset?.dimensions?.[0]) === 1024 &&
          Number(asset?.dimensions?.[1]) === 1024 &&
          /^[a-f0-9]{64}$/i.test(String(asset?.sha256 || ''))
      }];
    });
  }

  function summarizeAssetLibrary({ templates = [], assets = [] } = {}) {
    const expectedTemplates = 24;
    const expectedForms = expectedTemplates * 3;
    const stages = assets.length
      ? assets.map(asset => ({
        stage: asset?.stage,
        integrity: asset?.integrity || (
          asset?.assetPath &&
          Number(asset?.dimensions?.[0] ?? asset?.width) === 1024 &&
          Number(asset?.dimensions?.[1] ?? asset?.height) === 1024 &&
          /^[a-f0-9]{64}$/i.test(String(asset?.sha256 || ''))
            ? 'ok'
            : 'missing'
        )
      }))
      : templates.flatMap(template => (
        Array.isArray(template?.stages)
          ? template.stages
          : [1, 2, 3].map(stage => ({
            stage,
            integrity: template?.integrity || (template?.assetPath ? 'ok' : 'missing')
          }))
      ));
    const healthyForms = Math.min(
      expectedForms,
      stages.filter(stage => stage?.integrity === 'ok').length
    );
    const damagedForms = Math.max(0, expectedForms - healthyForms);
    return {
      templates: Math.min(
        expectedTemplates,
        templates.length || new Set(assets.map(asset => asset?.templateId).filter(Boolean)).size
      ),
      expectedForms,
      healthyForms,
      damagedForms,
      integrity: damagedForms === 0 ? 'healthy' : 'degraded',
      fallback: 'kenney_emergency_only'
    };
  }

  function buildDexSlots({ templates = [], essence = [], cosmetics = [] } = {}) {
    const essenceByElement = new Map(essence.map(entry => [entry.element, entry]));
    return templates.slice(0, 24).map(template => {
      const elementEssence = essenceByElement.get(template.element) || { amount: 0, unlocks: [] };
      const masteryPoints = Math.max(0, Number(template.mastery?.points) || 0);
      const masteryLevel = MASTERY_THRESHOLDS.filter(threshold => masteryPoints >= threshold).length;
      const masteryNextThreshold = MASTERY_THRESHOLDS.find(threshold => masteryPoints < threshold) || null;
      const masteryProgressThreshold = masteryNextThreshold || MASTERY_THRESHOLDS.at(-1);
      return {
        ...template,
        locked: template.silhouette !== false || !template.owned,
        firstFound: Boolean(template.owned),
        masteryLevel,
        masteryPoints,
        masteryNextThreshold,
        masteryProgressLabel: `${Math.min(masteryPoints, masteryProgressThreshold)}/${masteryProgressThreshold}`,
        masteryUnlocks: [...(template.mastery?.unlocks || [])],
        essence: Number(elementEssence.amount) || 0,
        essenceUnlocks: [...(elementEssence.unlocks || [])],
        cosmetics: [...cosmetics],
        cosmetic: masteryLevel > 0 || (elementEssence.unlocks || []).length > 0 || cosmetics.length > 0
      };
    });
  }

  function eggReadinessCounts(state = {}) {
    const counts = state.eggCounts || {};
    return {
      active: Math.max(0, Number(counts.incubating) || 0),
      queued: Math.max(0, Number(counts.queued) || 0),
      ready: Math.max(0, Number(counts.ready) || 0),
      durationMs: Math.max(0, Number(state.effectiveHatchDurationMs ?? state.config?.hatchDurationMs) || 0)
    };
  }

  function buildRepairRequest(kind, {
    execute = false,
    previewed = false,
    confirmed = false
  } = {}) {
    const action = REPAIR_ACTIONS[kind];
    if (!action) throw new Error('STREAM_MONSTERS_REPAIR_KIND_INVALID');
    if (execute && !previewed) {
      throw new Error('STREAM_MONSTERS_REPAIR_PREVIEW_REQUIRED');
    }
    if (execute && !confirmed) {
      throw new Error('STREAM_MONSTERS_REPAIR_CONFIRMATION_REQUIRED');
    }
    return {
      url: action.route,
      body: execute
        ? { dryRun: false, confirm: action.confirmation }
        : { dryRun: true }
    };
  }

  function summarizeRepairResult(kind, payload = {}) {
    if (!REPAIR_ACTIONS[kind]) {
      throw new Error('STREAM_MONSTERS_REPAIR_KIND_INVALID');
    }
    const count = value => Math.max(0, Number(value) || 0);
    if (kind === 'eggs') {
      const plan = payload.before || {};
      const readyDue = count(plan.readyDue);
      const expiryDue = count(plan.expiryDue);
      return {
        kind,
        dryRun: payload.dryRun !== false,
        candidates: readyDue + expiryDue,
        repaired: count(payload.repaired),
        readyDue,
        expiryDue,
        queued: count(plan.queued)
      };
    }
    return {
      kind,
      dryRun: payload.dryRun !== false,
      candidates: count(payload.candidates),
      repaired: count(payload.cancelled)
    };
  }

  function normalizeDemoRequest(input = {}) {
    if (!input || input.scene === 'full' || !input.scene) return null;
    const result = { scene: input.scene };
    if (input.templateId) result.templateId = input.templateId;
    if (input.layout) result.layout = input.layout;
    if (input.anchor) result.anchor = input.anchor;
    if (input.scale !== undefined && input.scale !== '') result.scale = Number(input.scale);
    return result;
  }

  function demoTranslationKey(scene) {
    const suffix = String(scene || '')
      .trim()
      .split(/[_-]+/)
      .filter(Boolean)
      .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join('');
    return suffix ? `demo${suffix}` : 'demo';
  }

  return {
    COMMAND_ACTIONS,
    COMMAND_GROUPS,
    CREATOR_SECTIONS,
    DEMO_SCENES,
    HATCH_PRESETS,
    EGG_EXPIRY_PRESETS,
    MASTERY_THRESHOLDS,
    REPAIR_ACTIONS,
    RENDERER_QUALITIES,
    SEASON_DURATIONS,
    buildAliasDiagnostics,
    buildAssetStageEntries,
    buildCommandDiagnostics,
    buildCommandGroups,
    buildConfigPayload,
    buildCreatorLiveView,
    buildEggShelfDiagnostics,
    buildDexSlots,
    buildRepairRequest,
    demoTranslationKey,
    eggReadinessCounts,
    leaderboardDisplayName,
    liveStatusTranslationKey,
    normalizeDemoRequest,
    normalizeOverlayLanguage,
    previewGeometry,
    resolveCommandReference,
    summarizeRepairResult,
    summarizeAssetLibrary
  };
}));
