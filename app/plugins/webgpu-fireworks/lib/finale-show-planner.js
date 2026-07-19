'use strict';

const { compileShowDefinition } = require('./pyrodsl');
const {
  materializeBuiltInVariantGeometry,
  mixSeed
} = require('./finale-formation-layout');
const {
  BUILT_IN_SHOW_DEFINITIONS,
  FINALE_LENGTHS,
  FINALE_STYLES,
  FINALE_STYLE_METADATA,
  PHASE_ORDER,
  getBuiltInShowBlueprint
} = require('./built-in-shows');

const TIER_ORDER = Object.freeze(['small', 'medium', 'big', 'massive']);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = value => Number(value.toFixed(6));

function resolveTier(baseTier, intensity) {
  const baseIndex = Math.max(0, TIER_ORDER.indexOf(baseTier));
  const intensityShift = intensity <= 3 ? -1 : intensity >= 8 ? 1 : 0;
  return TIER_ORDER[clamp(baseIndex + intensityShift, 0, TIER_ORDER.length - 1)];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function intensityScales(intensityValue) {
  const intensity = clamp(Number(intensityValue) || 1, 1, 10);
  return {
    intensity,
    powerScale: round(0.75 + ((intensity - 1) / 9) * 0.6),
    particleScale: round(0.7 + ((intensity - 1) / 9) * 0.7)
  };
}

function customSoundRole(phase, tier, primitive) {
  if (phase === 'finale') return primitive === 'glyph' ? 'crown' : 'wave';
  if (tier === 'massive') return 'heavy';
  if (phase === 'highlight' || tier === 'big') return 'accent';
  if (phase === 'build') return ['comet', 'crossette', 'palm'].includes(primitive) ? 'volley' : 'pair';
  return primitive === 'mine' ? 'heavy' : 'single';
}

class FinaleShowPlanner {
  plan(options = {}) {
    const style = FINALE_STYLES.includes(options.style) ? options.style : FINALE_STYLES[0];
    const length = FINALE_LENGTHS.includes(options.length) ? options.length : 'medium';
    const orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape';
    const seed = Number(options.seed) >>> 0;
    const id = options.id === undefined || options.id === null ? `finale-${seed}` : String(options.id);
    const { intensity, powerScale, particleScale } = intensityScales(options.intensity);
    const definition = clone(BUILT_IN_SHOW_DEFINITIONS[style]);
    const blueprint = getBuiltInShowBlueprint(style);
    definition.variants[length] = materializeBuiltInVariantGeometry(
      definition.variants[length],
      blueprint,
      { length, orientation, seed, phaseOrder: PHASE_ORDER }
    );
    const variant = definition.variants[length];
    let cueOrdinal = 0;

    for (const phase of PHASE_ORDER) {
      const phaseCounts = blueprint.counts[length][phase];
      const descriptors = blueprint.cues[phase];
      phaseCounts.forEach((_, phaseCueIndex) => {
        const cue = variant.cues[cueOrdinal];
        const cueDescriptor = descriptors[phaseCueIndex % descriptors.length];
        cue.shells.forEach(shell => {
          shell.tier = resolveTier(cueDescriptor.tier, intensity);
        });
        cueOrdinal++;
      });
    }

    const compiled = compileShowDefinition(definition, { variant: length, seed });
    const cues = compiled.cues.map((cue, index) => {
      const phaseCueIndex = compiled.cues.slice(0, index).filter(candidate => candidate.phase === cue.phase).length;
      const cueDescriptor = blueprint.cues[cue.phase][phaseCueIndex % blueprint.cues[cue.phase].length];
      const shells = cue.shells.map((shell, launchIndex) => {
        const launchSeed = mixSeed(seed, index, launchIndex);
        const soundRoles = cueDescriptor.soundRoles || [cueDescriptor.soundRole];
        return {
          ...shell,
          id: `${id}-cue-${index + 1}-launch-${launchIndex + 1}`,
          seed: launchSeed,
          shape: cueDescriptor.shape,
          powerScale,
          particleScale,
          soundRole: soundRoles[launchIndex % soundRoles.length],
          crackleEnabled: cueDescriptor.crackleEnabled
        };
      });
      return {
        ...cue,
        id: `${id}-cue-${index + 1}`,
        beatAtMs: cue.timeMs,
        shells,
        launches: shells
      };
    });

    return {
      ...compiled,
      id,
      style,
      variant: length,
      length,
      cues
    };
  }

  planDefinition(definition, options = {}) {
    const length = FINALE_LENGTHS.includes(options.length) ? options.length : 'medium';
    const seed = Number(options.seed) >>> 0;
    const id = options.id === undefined || options.id === null ? `finale-${seed}` : String(options.id);
    const style = String(options.style || definition?.id || FINALE_STYLES[0]);
    const { intensity, powerScale, particleScale } = intensityScales(options.intensity);
    const compiled = compileShowDefinition(definition, { variant: length, seed });
    const cues = compiled.cues.map((cue, cueIndex) => {
      const cueId = `${id}-cue-${cueIndex + 1}`;
      const shells = cue.shells.map((shell, launchIndex) => {
        const primaryPrimitive = shell.layers[0]?.primitive || shell.shape || 'radial';
        return {
          ...shell,
          id: `${cueId}-launch-${launchIndex + 1}`,
          seed: mixSeed(seed, cueIndex, launchIndex),
          tier: resolveTier(shell.tier, intensity),
          powerScale,
          particleScale,
          soundRole: customSoundRole(cue.phase, shell.tier, primaryPrimitive),
          crackleEnabled: false
        };
      });
      return {
        ...cue,
        id: cueId,
        beatAtMs: cue.timeMs,
        shells,
        launches: shells
      };
    });

    return {
      ...compiled,
      id,
      style,
      variant: length,
      length,
      cues
    };
  }
}

module.exports = {
  FinaleShowPlanner,
  FINALE_STYLES,
  FINALE_LENGTHS,
  FINALE_STYLE_METADATA
};
