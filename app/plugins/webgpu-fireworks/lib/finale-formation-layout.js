'use strict';

const { SpawnPlanner, createRandom } = require('./spawn-planner');

const BUILT_IN_DUPLICATE_LAYOUT_SEED = 2026;
const DEFAULT_PHASE_ORDER = Object.freeze(['opening', 'build', 'highlight', 'finale']);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = value => Number(value.toFixed(6));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mixSeed(seed, cueIndex, launchIndex) {
  let mixed = (seed ^ Math.imul(cueIndex + 1, 0x9e3779b1)) >>> 0;
  mixed = (mixed ^ Math.imul(launchIndex + 1, 0x85ebca6b)) >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d) >>> 0;
  mixed ^= mixed >>> 15;
  return mixed >>> 0;
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

function materializeBuiltInVariantGeometry(variant, blueprint, options = {}) {
  const materialized = clone(variant);
  const length = String(options.length || 'medium');
  const orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape';
  const seed = Number(options.seed) >>> 0;
  const phaseOrder = Array.isArray(options.phaseOrder) ? options.phaseOrder : DEFAULT_PHASE_ORDER;
  const spawnPlanner = new SpawnPlanner();
  const bounds = spawnPlanner.getBounds(orientation);
  let cueOrdinal = 0;

  for (const phase of phaseOrder) {
    const phaseCounts = blueprint.counts[length][phase];
    const descriptors = blueprint.cues[phase];
    phaseCounts.forEach((shellCount, phaseCueIndex) => {
      const cue = materialized.cues[cueOrdinal];
      const cueDescriptor = descriptors[phaseCueIndex % descriptors.length];
      const cueSeed = mixSeed(seed, cueOrdinal, shellCount);
      const positions = createFormationPositions(cueDescriptor.formation, shellCount, bounds, cueSeed);
      const origins = createFormationOrigins(cueDescriptor.formation, positions, bounds);

      cue.shells.forEach((shell, shellIndex) => {
        const shellDescriptor = cueDescriptor.shellVariants?.[
          shellIndex % cueDescriptor.shellVariants.length
        ] || cueDescriptor;
        const spatialPlan = spawnPlanner.plan({
          seed: mixSeed(seed, cueOrdinal, shellIndex),
          orientation,
          positionMode: 'exact',
          position: shellDescriptor.exactTarget || positions[shellIndex],
          origin: shellDescriptor.exactOrigin || origins?.[shellIndex]
        });
        shell.target = { x: round(spatialPlan.position.x), y: round(spatialPlan.position.y) };
        shell.origin = { x: round(spatialPlan.origin.x), y: round(spatialPlan.origin.y) };
      });
      cueOrdinal++;
    });
  }

  return materialized;
}

function materializeBuiltInDefinitionGeometry(definition, blueprint, options = {}) {
  const materialized = clone(definition);
  const lengths = Array.isArray(options.lengths) ? options.lengths : Object.keys(materialized.variants || {});
  for (const length of lengths) {
    if (!materialized.variants?.[length]) continue;
    materialized.variants[length] = materializeBuiltInVariantGeometry(
      materialized.variants[length],
      blueprint,
      { ...options, length }
    );
  }
  return materialized;
}

module.exports = {
  BUILT_IN_DUPLICATE_LAYOUT_SEED,
  createFormationOrigins,
  createFormationPositions,
  materializeBuiltInDefinitionGeometry,
  materializeBuiltInVariantGeometry,
  mixSeed
};
