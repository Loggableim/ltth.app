'use strict';

const { SpawnPlanner, createRandom } = require('./spawn-planner');
const { compileShowDefinition } = require('./pyrodsl');
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

function mixSeed(seed, cueIndex, launchIndex) {
  let mixed = (seed ^ Math.imul(cueIndex + 1, 0x9e3779b1)) >>> 0;
  mixed = (mixed ^ Math.imul(launchIndex + 1, 0x85ebca6b)) >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d) >>> 0;
  mixed ^= mixed >>> 15;
  return mixed >>> 0;
}

function resolveTier(baseTier, intensity) {
  const baseIndex = Math.max(0, TIER_ORDER.indexOf(baseTier));
  const intensityShift = intensity <= 3 ? -1 : intensity >= 8 ? 1 : 0;
  return TIER_ORDER[clamp(baseIndex + intensityShift, 0, TIER_ORDER.length - 1)];
}

function createFormationPositions(formation, count, bounds, seed) {
  const random = createRandom(seed);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const centerX = (bounds.minX + bounds.maxX) / 2 + (random() - 0.5) * width * 0.12;
  const centerY = bounds.minY + height * (0.3 + random() * 0.35);
  const positions = [];

  for (let index = 0; index < count; index++) {
    const centeredIndex = index - (count - 1) / 2;
    let x = centerX;
    let y = centerY;

    if (formation === 'call') x = bounds.minX + width * (0.24 + random() * 0.08);
    if (formation === 'response') x = bounds.minX + width * (0.68 + random() * 0.08);
    if (/pair|salute|wall|fan|crown|volley|wave/.test(formation)) {
      const spacing = width * Math.min(0.19, 0.66 / Math.max(1, count - 1));
      x += centeredIndex * spacing;
    }
    if (/diagonal|volley/.test(formation)) y += centeredIndex * height * 0.11;
    if (/cross/.test(formation)) y -= centeredIndex * height * 0.11;
    if (/fan|crown/.test(formation)) y -= Math.abs(centeredIndex) * height * 0.045;
    if (/wave-2/.test(formation)) y -= height * 0.12;
    if (/wave-3/.test(formation)) y += height * 0.08;
    if (/accent|centered-ring|floral/.test(formation) && count > 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
      x += Math.cos(angle) * width * 0.11;
      y += Math.sin(angle) * height * 0.13;
    }
    if (count === 1) {
      x += (random() - 0.5) * width * 0.2;
      y += (random() - 0.5) * height * 0.16;
    }

    positions.push({
      x: round(clamp(x, bounds.minX, bounds.maxX)),
      y: round(clamp(y, bounds.minY, bounds.maxY))
    });
  }
  return positions;
}

function createFormationOrigins(formation, positions, bounds) {
  if (formation === 'diagonal-pair') {
    const offset = (bounds.maxX - bounds.minX) * 0.22;
    return positions.map(position => ({
      x: clamp(position.x - offset, 0.04, 0.96),
      y: 1.02
    }));
  }
  if (formation === 'cross-pair') {
    return positions.map((position, index) => ({
      x: positions[positions.length - 1 - index].x,
      y: 1.02
    }));
  }
  return null;
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
    const variant = definition.variants[length];
    const spawnPlanner = new SpawnPlanner();
    const bounds = spawnPlanner.getBounds(orientation);
    let cueOrdinal = 0;

    for (const phase of PHASE_ORDER) {
      const phaseCounts = blueprint.counts[length][phase];
      const descriptors = blueprint.cues[phase];
      phaseCounts.forEach((launchCount, phaseCueIndex) => {
        const cue = variant.cues[cueOrdinal];
        const cueDescriptor = descriptors[phaseCueIndex % descriptors.length];
        const cueSeed = mixSeed(seed, cueOrdinal, launchCount);
        const positions = createFormationPositions(cueDescriptor.formation, launchCount, bounds, cueSeed);
        const origins = createFormationOrigins(cueDescriptor.formation, positions, bounds);
        cue.shells.forEach((shell, launchIndex) => {
          const spatialPlan = spawnPlanner.plan({
            seed: mixSeed(seed, cueOrdinal, launchIndex),
            orientation,
            positionMode: 'exact',
            position: positions[launchIndex],
            origin: origins?.[launchIndex]
          });
          shell.target = { x: round(spatialPlan.position.x), y: round(spatialPlan.position.y) };
          shell.origin = { x: round(spatialPlan.origin.x), y: round(spatialPlan.origin.y) };
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
