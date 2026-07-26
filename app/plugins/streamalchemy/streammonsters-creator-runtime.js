(function attachStreamMonstersCreatorRuntime(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersCreatorRuntime = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const HATCH_PRESETS = Object.freeze([30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000]);
  const EGG_EXPIRY_PRESETS = Object.freeze([21_600_000, 43_200_000, 86_400_000, 172_800_000]);
  const SEASON_DURATIONS = Object.freeze([7, 14, 28, 60, 90]);
  const RENDERER_QUALITIES = Object.freeze(['auto', 'high', 'medium', 'low']);
  const MASTERY_THRESHOLDS = Object.freeze([10, 25, 50]);

  function buildConfigPayload({ currentConfig = {}, values = {} } = {}) {
    const notificationDurationMs = Number(values.notificationDurationMs);
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
      commandAliases: values.commandAliases || currentConfig.commandAliases || {},
      audioChannels: values.audioChannels || currentConfig.audioChannels || {},
      giftMappingCustomized: Boolean(currentConfig.giftMappingCustomized)
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

  function normalizeDemoRequest(input = {}) {
    if (!input || input.scene === 'full' || !input.scene) return null;
    const result = { scene: input.scene };
    if (input.templateId) result.templateId = input.templateId;
    if (input.layout) result.layout = input.layout;
    if (input.anchor) result.anchor = input.anchor;
    if (input.scale !== undefined && input.scale !== '') result.scale = Number(input.scale);
    return result;
  }

  return {
    HATCH_PRESETS,
    EGG_EXPIRY_PRESETS,
    MASTERY_THRESHOLDS,
    RENDERER_QUALITIES,
    SEASON_DURATIONS,
    buildConfigPayload,
    buildDexSlots,
    eggReadinessCounts,
    normalizeDemoRequest
  };
}));
