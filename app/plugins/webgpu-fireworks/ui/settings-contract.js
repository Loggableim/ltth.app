(function exposeSettingsContract(root, factory) {
  const api = factory();
  if (root) root.WebGpuFireworksSettingsContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createSettingsContract() {
  'use strict';

  const RANGE_CONTROLS = Object.freeze({
    'combo-timeout': 'comboTimeout',
    'combo-max': 'comboMaxMultiplier',
    'audio-volume': 'audioVolume',
    'crackle-frequency': 'crackleFrequency',
    'crackle-volume': 'crackleVolume',
    'max-particles': 'maxParticles',
    'target-fps': 'targetFps',
    'min-fps': 'minFps',
    'despawn-fade': 'despawnFadeDuration',
    'max-rockets-per-second': 'maxRocketsPerSecond',
    'max-fireworks': 'maxConcurrentFireworks',
    'max-particles-limit': 'maxTotalParticles',
    'emergency-threshold': 'emergencyCleanupThreshold',
    'min-target-fps': 'minTargetFps',
    'avatar-chance': 'avatarParticleChance',
    'finale-intensity': 'goalFinaleIntensity',
    'superfan-finale-intensity': 'superfanFinaleIntensity',
    'superfan-end-card-duration': 'superfanEndCardDuration',
    'superfan-end-card-scale': 'superfanEndCardScale',
    'follower-rocket-count': 'followerRocketCount',
    'follower-animation-duration': 'followerAnimationDuration',
    'follower-animation-delay': 'followerAnimationDelay',
    'follower-animation-scale': 'followerAnimationScale'
  });

  const ENUM_CONTROLS = Object.freeze({
    'default-shape': Object.freeze({ contract: 'shape' }),
    'gift-style-shape': Object.freeze({ contract: 'shape' }),
    'gift-style-override': Object.freeze({ contract: 'giftVisualStyle' }),
    'color-mode': Object.freeze({ contract: 'colorMode' }),
    'resolution-preset': Object.freeze({ contract: 'resolutionPreset' }),
    'internal-max-resolution': Object.freeze({ contract: 'resolutionPreset' }),
    'internal-min-resolution': Object.freeze({ contract: 'resolutionPreset' }),
    'orientation-select': Object.freeze({ contract: 'orientation' }),
    'gift-popup-position': Object.freeze({ contract: 'giftPopupPosition' }),
    'finale-style': Object.freeze({ contract: 'finaleStyle' }),
    'finale-length': Object.freeze({ contract: 'finaleLength' }),
    'superfan-finale-cooldown': Object.freeze({ contract: 'superfanFinaleCooldown' }),
    'superfan-finale-style': Object.freeze({ contract: 'superfanFinaleStyle' }),
    'superfan-finale-length': Object.freeze({ contract: 'superfanFinaleLength' }),
    'superfan-end-card-position': Object.freeze({ contract: 'endCardPosition' }),
    'superfan-end-card-size': Object.freeze({ contract: 'endCardSize' }),
    'follower-animation-position': Object.freeze({ contract: 'followerAnimationPosition' }),
    'follower-animation-style': Object.freeze({ contract: 'followerAnimationStyle' }),
    'follower-animation-size': Object.freeze({ contract: 'followerAnimationSize' }),
    'follower-animation-entrance': Object.freeze({ contract: 'followerAnimationEntrance' })
  });

  const documentContracts = new WeakMap();

  function control(document, id, expectedTag) {
    const element = document?.getElementById?.(id);
    if (!element || element.tagName?.toLowerCase() !== expectedTag) {
      throw new Error(`Missing settings control: ${id}`);
    }
    return element;
  }

  function disableControls(document) {
    for (const id of [...Object.keys(RANGE_CONTROLS), ...Object.keys(ENUM_CONTROLS)]) {
      const element = document?.getElementById?.(id);
      if (element) element.disabled = true;
    }
    if (document && typeof document === 'object') documentContracts.delete(document);
  }

  function numericDescriptor(limits, field, id) {
    const descriptor = limits?.[field];
    const values = descriptor && [descriptor.min, descriptor.max, descriptor.step, descriptor.uiScale]
      .map(Number);
    if (!values || values.some(value => !Number.isFinite(value)) || values[0] > values[1] || values[2] <= 0 || values[3] <= 0) {
      throw new Error(`Invalid numeric contract for ${id}`);
    }
    return {
      min: values[0],
      max: values[1],
      step: values[2],
      uiScale: values[3]
    };
  }

  function enumDescriptor(enums, name, id) {
    const descriptor = enums?.[name];
    if (!descriptor || !Array.isArray(descriptor.values) || descriptor.values.some(value => typeof value !== 'string')) {
      throw new Error(`Invalid enum contract for ${id}`);
    }
    let dynamicPattern = null;
    if (descriptor.dynamicPattern !== undefined) {
      if (typeof descriptor.dynamicPattern !== 'string' || typeof (descriptor.dynamicFlags || '') !== 'string') {
        throw new Error(`Invalid dynamic enum contract for ${id}`);
      }
      try {
        dynamicPattern = new RegExp(descriptor.dynamicPattern, descriptor.dynamicFlags || '');
      } catch (error) {
        throw new Error(`Invalid dynamic enum contract for ${id}`);
      }
    }
    return { descriptor, dynamicPattern };
  }

  function matches(pattern, value) {
    if (!pattern) return false;
    pattern.lastIndex = 0;
    return pattern.test(value);
  }

  function applyConfigContracts(document, contracts = {}) {
    disableControls(document);
    const rangeUpdates = [];
    const enumUpdates = [];
    try {
      for (const [id, field] of Object.entries(RANGE_CONTROLS)) {
        rangeUpdates.push({
          input: control(document, id, 'input'),
          descriptor: numericDescriptor(contracts.limits, field, id)
        });
      }
      for (const [id, mapping] of Object.entries(ENUM_CONTROLS)) {
        const select = control(document, id, 'select');
        const { descriptor, dynamicPattern } = enumDescriptor(contracts.enums, mapping.contract, id);
        const optionValues = [...select.options].map(option => option.value);
        const staticValues = optionValues.filter(value => !matches(dynamicPattern, value));
        if (
          staticValues.length !== descriptor.values.length ||
          staticValues.some((value, index) => value !== descriptor.values[index]) ||
          optionValues.some(value => !descriptor.values.includes(value) && !matches(dynamicPattern, value))
        ) {
          throw new Error(`Settings enum options do not match contract for ${id}`);
        }
        enumUpdates.push({ select });
      }

      for (const { input, descriptor } of rangeUpdates) {
        input.min = String(descriptor.min * descriptor.uiScale);
        input.max = String(descriptor.max * descriptor.uiScale);
        input.step = String(descriptor.step * descriptor.uiScale);
      }
      documentContracts.set(document, { limits: contracts.limits, enums: contracts.enums });
      for (const { input } of rangeUpdates) input.disabled = false;
      for (const { select } of enumUpdates) select.disabled = false;
      return true;
    } catch (error) {
      disableControls(document);
      throw error;
    }
  }

  function activeContracts(document) {
    const contracts = documentContracts.get(document);
    if (!contracts) throw new Error('Settings contracts have not been applied');
    return contracts;
  }

  function writeNumericConfig(document, config = {}) {
    const { limits } = activeContracts(document);
    for (const [id, field] of Object.entries(RANGE_CONTROLS)) {
      if (!Object.prototype.hasOwnProperty.call(config, field)) continue;
      const value = Number(config[field]);
      if (!Number.isFinite(value)) continue;
      const { uiScale } = numericDescriptor(limits, field, id);
      control(document, id, 'input').value = String(value * uiScale);
    }
  }

  function readNumericConfig(document) {
    const { limits } = activeContracts(document);
    const config = {};
    for (const [id, field] of Object.entries(RANGE_CONTROLS)) {
      const value = Number(control(document, id, 'input').value);
      const { uiScale } = numericDescriptor(limits, field, id);
      if (!Number.isFinite(value)) throw new Error(`Invalid numeric value for ${id}`);
      config[field] = Number((value / uiScale).toPrecision(15));
    }
    return config;
  }

  function reconcileFpsControls(document) {
    const { limits } = activeContracts(document);
    const target = Number(control(document, 'target-fps', 'input').value);
    for (const [id, field] of [['min-fps', 'minFps'], ['min-target-fps', 'minTargetFps']]) {
      const input = control(document, id, 'input');
      const descriptor = numericDescriptor(limits, field, id);
      const effectiveMax = Math.min(descriptor.max * descriptor.uiScale, target);
      input.max = String(effectiveMax);
      if (Number(input.value) > effectiveMax) input.value = String(effectiveMax);
    }
  }

  return Object.freeze({
    RANGE_CONTROLS,
    ENUM_CONTROLS,
    applyConfigContracts,
    writeNumericConfig,
    readNumericConfig,
    reconcileFpsControls
  });
});
