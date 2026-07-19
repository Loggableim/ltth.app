'use strict';

(function exposeSpawnCommandPolicy(root, factory) {
  const policy = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = policy;
  if (root) root.WebGPUFireworksSpawnCommandPolicy = policy;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const MAX_COMMANDS = 32;
  const MAX_SHOW_COMMANDS = 28;
  const MAX_GIFT_LIVE_COMMANDS = 4;
  const LANES = new Set(['show', 'gift', 'live']);
  const PRIORITIES = new Set(['core', 'accent', 'decorative']);
  const PRIORITY_ORDER = Object.freeze({ core: 0, accent: 1, decorative: 2 });
  const DEGRADATION_KEYS = Object.freeze([
    'strobeDisabled',
    'accentReduced',
    'accentOmitted',
    'decorativeReduced',
    'decorativeOmitted',
    'splitReduced',
    'coreDensityReduced'
  ]);
  const PERFORMANCE_TIERS = Object.freeze({ normal: 0, reduced: 2, minimal: 5, toaster: 6 });
  const PARTICLE_THRESHOLDS = Object.freeze([0.5, 0.65, 0.75, 0.84, 0.92, 0.97, 0.995]);
  const LAYER_THRESHOLDS = Object.freeze([10, 14, 18, 22, 26, 29, 31]);
  const TIER_POLICIES = Object.freeze([
    Object.freeze({ tier: 0, strobeEnabled: true, splitQuality: 3, decorativeDensityScale: 1, accentDensityScale: 1, coreDensityScale: 1 }),
    Object.freeze({ tier: 1, strobeEnabled: false, splitQuality: 3, decorativeDensityScale: 1, accentDensityScale: 1, coreDensityScale: 1 }),
    Object.freeze({ tier: 2, strobeEnabled: false, splitQuality: 3, decorativeDensityScale: 1, accentDensityScale: 0.65, coreDensityScale: 1 }),
    Object.freeze({ tier: 3, strobeEnabled: false, splitQuality: 3, decorativeDensityScale: 1, accentDensityScale: 0, coreDensityScale: 1 }),
    Object.freeze({ tier: 4, strobeEnabled: false, splitQuality: 3, decorativeDensityScale: 0.5, accentDensityScale: 0, coreDensityScale: 1 }),
    Object.freeze({ tier: 5, strobeEnabled: false, splitQuality: 3, decorativeDensityScale: 0, accentDensityScale: 0, coreDensityScale: 1 }),
    Object.freeze({ tier: 6, strobeEnabled: false, splitQuality: 1, decorativeDensityScale: 0, accentDensityScale: 0, coreDensityScale: 1 }),
    Object.freeze({ tier: 7, strobeEnabled: false, splitQuality: 1, decorativeDensityScale: 0, accentDensityScale: 0, coreDensityScale: 0.7 })
  ]);

  class RequiredCoreAdmissionError extends Error {
    constructor(command, admission) {
      const correlationId = command.correlationId ?? command.effectId ?? null;
      const beatId = command.beatId ?? null;
      super(`Required core show command ${String(correlationId || 'unknown')} could not be admitted` +
        `${beatId === null ? '' : ` at beat ${String(beatId)}`}.`);
      this.name = 'RequiredCoreAdmissionError';
      this.code = 'REQUIRED_CORE_COMMAND_OVERFLOW';
      this.lane = 'show';
      this.beatId = beatId;
      this.correlationId = correlationId;
      this.admission = admission;
      this.selectedFallback = admission.selected;
      this.dropped = admission.dropped;
      this.telemetry = admission.telemetry;
    }
  }

  const emptyDegradedLayerCounts = () => Object.fromEntries(DEGRADATION_KEYS.map(key => [key, 0]));

  const emptyCommandTelemetry = () => ({
    selectedShowCommands: 0,
    droppedShowCommands: 0,
    selectedGiftCommands: 0,
    droppedGiftCommands: 0,
    selectedLiveCommands: 0,
    droppedLiveCommands: 0,
    degradedLayerCounts: emptyDegradedLayerCounts(),
    requiredCoreFailures: 0
  });

  const normalizeCommandMetadata = command => {
    const laneWasExplicit = LANES.has(command?.lane);
    const priorityWasExplicit = PRIORITIES.has(command?.priority);
    return {
      lane: laneWasExplicit ? command.lane : 'live',
      priority: priorityWasExplicit ? command.priority : 'core',
      required: command?.required === true,
      beatId: command?.beatId ?? null,
      correlationId: command?.correlationId ?? command?.effectId ?? null,
      admissionManaged: typeof command?.admissionManaged === 'boolean'
        ? command.admissionManaged
        : laneWasExplicit
    };
  };

  const commandOrder = (left, right) => {
    const priority = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
    if (priority) return priority;
    if (left.required !== right.required) return left.required ? -1 : 1;
    if (left.lane !== right.lane && left.lane !== 'show' && right.lane !== 'show') {
      return left.lane === 'gift' ? -1 : 1;
    }
    return left.index - right.index;
  };

  const countLane = (telemetry, prefix, command) => {
    const suffix = command.lane === 'show'
      ? 'ShowCommands'
      : command.lane === 'gift'
        ? 'GiftCommands'
        : 'LiveCommands';
    telemetry[`${prefix}${suffix}`]++;
  };

  const summarizeSelection = (selected, dropped) => {
    const telemetry = emptyCommandTelemetry();
    selected.forEach(command => countLane(telemetry, 'selected', command));
    dropped.forEach(command => countLane(telemetry, 'dropped', command));
    return telemetry;
  };

  const admitSpawnCommands = (commands, options = {}) => {
    const maxCommands = Number.isInteger(options.maxCommands) ? options.maxCommands : MAX_COMMANDS;
    const maxShowCommands = Number.isInteger(options.maxShowCommands)
      ? options.maxShowCommands
      : MAX_SHOW_COMMANDS;
    const maxGiftLiveCommands = Number.isInteger(options.maxGiftLiveCommands)
      ? options.maxGiftLiveCommands
      : MAX_GIFT_LIVE_COMMANDS;
    const normalized = (Array.isArray(commands) ? commands : []).map((command, index) => ({
      ...command,
      ...normalizeCommandMetadata(command),
      index
    }));

    if (!normalized.some(command => command.admissionManaged)) {
      const selected = normalized.slice(0, maxCommands);
      const dropped = normalized.slice(maxCommands);
      return {
        selected: selected.map(({ index, ...command }) => command),
        dropped: dropped.map(({ index, ...command }) => command),
        telemetry: summarizeSelection(selected, dropped),
        legacy: true
      };
    }

    const show = normalized.filter(command => command.lane === 'show').sort(commandOrder);
    const giftLive = normalized.filter(command => command.lane !== 'show').sort(commandOrder);
    const selectedShow = show.slice(0, maxShowCommands);
    const rejectedRequired = show.slice(maxShowCommands).find(command => command.required);
    if (rejectedRequired) {
      const selected = giftLive.slice(0, Math.max(0, Math.min(maxGiftLiveCommands, maxCommands)));
      const selectedIndexes = new Set(selected.map(command => command.index));
      const dropped = normalized.filter(command => !selectedIndexes.has(command.index));
      const telemetry = summarizeSelection(selected, dropped);
      telemetry.requiredCoreFailures = 1;
      const admission = {
        selected: selected.map(({ index, ...command }) => command),
        dropped: dropped.map(({ index, ...command }) => command),
        telemetry,
        legacy: false
      };
      throw new RequiredCoreAdmissionError(rejectedRequired, admission);
    }

    const selected = [
      ...selectedShow,
      ...giftLive.slice(0, maxGiftLiveCommands)
    ].sort(commandOrder).slice(0, maxCommands);
    const selectedIndexes = new Set(selected.map(command => command.index));
    const dropped = normalized.filter(command => !selectedIndexes.has(command.index));
    const telemetry = summarizeSelection(selected, dropped);

    return {
      selected: selected.map(({ index, ...command }) => command),
      dropped: dropped.map(({ index, ...command }) => command),
      telemetry,
      legacy: false
    };
  };

  const thresholdTier = (value, thresholds) => {
    let tier = 0;
    for (let index = 0; index < thresholds.length; index++) {
      if (value >= thresholds[index]) tier = index + 1;
    }
    return tier;
  };

  const deriveAdaptiveDegradationPolicy = (input = {}) => {
    const performanceMode = Object.prototype.hasOwnProperty.call(PERFORMANCE_TIERS, input.performanceMode)
      ? input.performanceMode
      : 'normal';
    const activeParticleRatio = Math.max(0, Math.min(1, Number(input.activeParticleRatio) || 0));
    const activeLayerLoad = Math.max(0, Number(input.activeLayerLoad) || 0);
    const tier = Math.max(
      PERFORMANCE_TIERS[performanceMode],
      thresholdTier(activeParticleRatio, PARTICLE_THRESHOLDS),
      thresholdTier(activeLayerLoad, LAYER_THRESHOLDS)
    );
    return {
      ...TIER_POLICIES[tier],
      performanceMode,
      activeParticleRatio,
      activeLayerLoad
    };
  };

  const degradeLayerForPolicy = (layer, policyInput = {}) => {
    const policy = Number.isInteger(policyInput.tier)
      ? { ...TIER_POLICIES[Math.max(0, Math.min(TIER_POLICIES.length - 1, policyInput.tier))], ...policyInput }
      : deriveAdaptiveDegradationPolicy(policyInput);
    const changes = [];
    const degraded = { ...layer, colors: Array.isArray(layer?.colors) ? [...layer.colors] : layer?.colors };
    if (degraded.strobe === true && policy.strobeEnabled === false) {
      degraded.strobe = false;
      changes.push('strobeDisabled');
    }
    const scale = degraded.priority === 'decorative'
      ? policy.decorativeDensityScale
      : degraded.priority === 'accent'
        ? policy.accentDensityScale
        : policy.coreDensityScale;
    const reduction = degraded.priority === 'decorative'
      ? 'decorativeReduced'
      : degraded.priority === 'accent'
        ? 'accentReduced'
        : 'coreDensityReduced';
    const omission = degraded.priority === 'decorative' ? 'decorativeOmitted' : 'accentOmitted';
    if (scale <= 0 && degraded.priority !== 'core') {
      changes.push(omission);
      const splitQuality = degraded.split === true ? policy.splitQuality : 0;
      return { layer: null, splitQuality, changes };
    }
    if (scale < 1 && degraded.priority !== 'core') {
      degraded.density = Math.max(1, Math.round(Number(degraded.density) * scale));
      changes.push(reduction);
    }
    const splitQuality = degraded.split === true ? policy.splitQuality : 0;
    if (degraded.split === true && splitQuality < 3) changes.push('splitReduced');
    if (scale < 1 && degraded.priority === 'core') {
      degraded.density = Math.max(1, Math.round(Number(degraded.density) * scale));
      changes.push(reduction);
    }
    return { layer: degraded, splitQuality, changes };
  };

  return Object.freeze({
    MAX_COMMANDS,
    MAX_SHOW_COMMANDS,
    MAX_GIFT_LIVE_COMMANDS,
    DEGRADATION_KEYS,
    RequiredCoreAdmissionError,
    admitSpawnCommands,
    degradeLayerForPolicy,
    deriveAdaptiveDegradationPolicy,
    emptyCommandTelemetry,
    emptyDegradedLayerCounts,
    normalizeCommandMetadata
  });
});
