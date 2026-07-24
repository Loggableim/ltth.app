(function attachStreamMonstersCreatorRuntime(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersCreatorRuntime = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const HATCH_PRESETS = Object.freeze([30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000]);
  const VISUAL_PACKS = Object.freeze(['furry', 'art_lab', 'kenney']);

  function buildConfigPayload({ currentConfig = {}, values = {} } = {}) {
    return {
      creatorName: String(values.creatorName || '').trim(),
      artPoolTarget: Math.max(1, Math.min(8, Number.parseInt(values.artPoolTarget, 10) || 3)),
      hatchDurationMs: HATCH_PRESETS.includes(Number(values.hatchDurationMs))
        ? Number(values.hatchDurationMs)
        : 120_000,
      visualPack: VISUAL_PACKS.includes(values.visualPack) ? values.visualPack : 'furry',
      landscapeAnchor: values.landscapeAnchor || 'bottom-center',
      landscapeScale: Number(values.landscapeScale) || 100,
      portraitAnchor: values.portraitAnchor || 'center',
      portraitScale: Number(values.portraitScale) || 100,
      giftMappingCustomized: Boolean(currentConfig.giftMappingCustomized)
    };
  }

  function buildDexSlots({ templates = [], essence = [], cosmetics = [] } = {}) {
    const essenceByElement = new Map(essence.map(entry => [entry.element, entry]));
    return templates.slice(0, 24).map(template => {
      const elementEssence = essenceByElement.get(template.element) || { amount: 0, unlocks: [] };
      const masteryLevel = Number(template.mastery?.level) || 0;
      return {
        ...template,
        locked: template.silhouette !== false || !template.owned,
        firstFound: Boolean(template.owned),
        masteryLevel,
        masteryPoints: Number(template.mastery?.points) || 0,
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
    VISUAL_PACKS,
    buildConfigPayload,
    buildDexSlots,
    eggReadinessCounts,
    normalizeDemoRequest
  };
}));
