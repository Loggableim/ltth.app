'use strict';

const { SpawnPlanner, createRandom } = require('./spawn-planner');

const FINALE_STYLES = Object.freeze([
  'classic-crescendo',
  'symmetric-salute',
  'sky-ballet',
  'thunder-finale'
]);

const FINALE_LENGTHS = Object.freeze(['short', 'medium', 'long']);
const PHASE_ORDER = Object.freeze(['opening', 'build', 'highlight', 'finale']);
const TIER_ORDER = Object.freeze(['small', 'medium', 'big', 'massive']);

const LENGTH_PRESETS = Object.freeze({
  short: {
    durationMs: 10000,
    windows: {
      opening: [1200, 2200],
      build: [2200, 5000],
      highlight: [5000, 6500],
      breath: [6500, 7100],
      finale: [7100, 9000]
    }
  },
  medium: {
    durationMs: 18000,
    windows: {
      opening: [1400, 3500],
      build: [3500, 8000],
      highlight: [8000, 11000],
      breath: [11000, 12000],
      finale: [12000, 16500]
    }
  },
  long: {
    durationMs: 28000,
    windows: {
      opening: [1500, 5000],
      build: [5000, 12500],
      highlight: [12500, 17000],
      breath: [17000, 18500],
      finale: [18500, 26500]
    }
  }
});

const CUE_LAUNCH_COUNTS = Object.freeze({
  'classic-crescendo': {
    short: { opening: [1], build: [2], highlight: [1, 1], finale: [3, 6] },
    medium: { opening: [1, 1], build: [2, 2, 2], highlight: [2, 2], finale: [6, 6] },
    long: { opening: [1, 1, 1], build: [2, 2, 2, 2, 2], highlight: [3, 3], finale: [5, 6, 6] }
  },
  'symmetric-salute': {
    short: { opening: [1, 1], build: [2], highlight: [2, 3], finale: [3, 4] },
    medium: { opening: [1, 1], build: [2, 2, 2], highlight: [2, 3], finale: [4, 4, 5] },
    long: { opening: [1, 1, 1, 1], build: [2, 2, 2, 2, 2], highlight: [3, 3, 3], finale: [5, 6, 6] }
  },
  'sky-ballet': {
    short: { opening: [1], build: [2, 2], highlight: [2, 2], finale: [4] },
    medium: { opening: [1], build: [2, 2, 2], highlight: [3, 3], finale: [4, 5] },
    long: { opening: [1, 1, 1], build: [2, 2, 2, 2, 2], highlight: [3, 3, 3], finale: [6, 6] }
  },
  'thunder-finale': {
    short: { opening: [1], build: [2], highlight: [3], finale: [2, 2, 2] },
    medium: { opening: [1, 1], build: [2, 2, 2], highlight: [3], finale: [3, 3, 3] },
    long: { opening: [1, 1, 1], build: [2, 2, 2, 2], highlight: [3, 3], finale: [4, 4, 5] }
  }
});

const STYLE_PRESETS = Object.freeze({
  'classic-crescendo': {
    palette: ['#ffd166', '#fff4d6', '#ff3b30'],
    cues: {
      opening: [{ formation: 'single', shape: 'burst', soundRole: 'single', tier: 'medium', crackleEnabled: false }],
      build: [{ formation: 'alternating-pair', shape: 'burst', soundRole: 'pair', tier: 'medium', crackleEnabled: false }],
      highlight: [
        { formation: 'ring-accent', shape: 'ring', soundRole: 'accent', tier: 'big', crackleEnabled: true },
        { formation: 'star-accent', shape: 'star', soundRole: 'accent', tier: 'big', crackleEnabled: false }
      ],
      finale: [
        { formation: 'fan', shape: 'burst', soundRole: 'crown', tier: 'massive', crackleEnabled: true },
        { formation: 'gold-crown', shape: 'star', soundRole: 'crown', tier: 'massive', crackleEnabled: true }
      ]
    }
  },
  'symmetric-salute': {
    palette: ['#ef233c', '#ffd166', '#ffffff'],
    cues: {
      opening: [
        { formation: 'call', shape: 'burst', soundRole: 'call', tier: 'medium', crackleEnabled: false },
        { formation: 'response', shape: 'burst', soundRole: 'response', tier: 'medium', crackleEnabled: false }
      ],
      build: [{
        formation: 'mirrored-pair', shape: 'burst', soundRoles: ['call', 'response'],
        tier: 'big', crackleEnabled: false
      }],
      highlight: [
        { formation: 'centered-ring', shape: 'ring', soundRole: 'salute', tier: 'big', crackleEnabled: true },
        { formation: 'triple-salute', shape: 'burst', soundRole: 'salute', tier: 'massive', crackleEnabled: true }
      ],
      finale: [{
        formation: 'symmetric-final-wall', shape: 'ring', soundRole: 'wall',
        tier: 'massive', crackleEnabled: true
      }]
    }
  },
  'sky-ballet': {
    palette: ['#9b5de5', '#35d9e8', '#ff5d8f'],
    cues: {
      opening: [{ formation: 'single', shape: 'burst', soundRole: 'ballet', tier: 'medium', crackleEnabled: false }],
      build: [
        { formation: 'diagonal-pair', shape: 'burst', soundRole: 'ballet', tier: 'medium', crackleEnabled: false },
        { formation: 'cross-pair', shape: 'burst', soundRole: 'ballet', tier: 'medium', crackleEnabled: false }
      ],
      highlight: [
        { formation: 'spiral-accent', shape: 'spiral', soundRole: 'accent', tier: 'big', crackleEnabled: false },
        { formation: 'star-accent', shape: 'star', soundRole: 'accent', tier: 'big', crackleEnabled: false }
      ],
      finale: [{
        formation: 'floral-finale', shape: 'heart', soundRole: 'floral',
        tier: 'massive', crackleEnabled: true
      }]
    }
  },
  'thunder-finale': {
    palette: ['#ffb000', '#ffd166', '#ffffff'],
    cues: {
      opening: [{ formation: 'heavy-single', shape: 'burst', soundRole: 'heavy', tier: 'big', crackleEnabled: true }],
      build: [{ formation: 'staggered-volley', shape: 'burst', soundRole: 'volley', tier: 'big', crackleEnabled: true }],
      highlight: [{ formation: 'triple-salute', shape: 'burst', soundRole: 'salute', tier: 'massive', crackleEnabled: true }],
      finale: [
        { formation: 'finale-wave-1', shape: 'burst', soundRole: 'wave', tier: 'massive', crackleEnabled: true },
        { formation: 'finale-wave-2', shape: 'burst', soundRole: 'wave', tier: 'massive', crackleEnabled: true },
        { formation: 'finale-wave-3', shape: 'burst', soundRole: 'wave', tier: 'massive', crackleEnabled: true }
      ]
    }
  }
});

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

function spreadEvenly(start, end, count) {
  const step = (end - start) / (count + 1);
  return Array.from({ length: count }, (_, index) => Math.round(start + step * (index + 1)));
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

class FinaleShowPlanner {
  plan(options = {}) {
    const style = FINALE_STYLES.includes(options.style) ? options.style : FINALE_STYLES[0];
    const length = FINALE_LENGTHS.includes(options.length) ? options.length : 'medium';
    const orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape';
    const seed = Number(options.seed) >>> 0;
    const id = options.id === undefined || options.id === null ? `finale-${seed}` : String(options.id);
    const intensity = clamp(Number(options.intensity) || 1, 1, 10);
    const powerScale = round(0.75 + ((intensity - 1) / 9) * 0.6);
    const particleScale = round(0.7 + ((intensity - 1) / 9) * 0.7);
    const lengthPreset = LENGTH_PRESETS[length];
    const stylePreset = STYLE_PRESETS[style];
    const cueCounts = CUE_LAUNCH_COUNTS[style][length];
    const spawnPlanner = new SpawnPlanner();
    const bounds = spawnPlanner.getBounds(orientation);
    const cues = [];
    let cueOrdinal = 0;

    for (const phase of PHASE_ORDER) {
      const phaseCounts = cueCounts[phase];
      const beatTimes = spreadEvenly(...lengthPreset.windows[phase], phaseCounts.length);
      const descriptors = stylePreset.cues[phase];

      phaseCounts.forEach((launchCount, phaseCueIndex) => {
        const descriptor = descriptors[phaseCueIndex % descriptors.length];
        const cueSeed = mixSeed(seed, cueOrdinal, launchCount);
        const positions = createFormationPositions(descriptor.formation, launchCount, bounds, cueSeed);
        const origins = createFormationOrigins(descriptor.formation, positions, bounds);
        const launches = positions.map((position, launchIndex) => {
          const launchSeed = mixSeed(seed, cueOrdinal, launchIndex);
          const spatialPlan = spawnPlanner.plan({
            seed: launchSeed,
            orientation,
            positionMode: 'exact',
            position,
            origin: origins?.[launchIndex]
          });
          const soundRoles = descriptor.soundRoles || [descriptor.soundRole];
          return {
            id: `${id}-cue-${cueOrdinal + 1}-launch-${launchIndex + 1}`,
            seed: launchSeed,
            position: {
              x: round(spatialPlan.position.x),
              y: round(spatialPlan.position.y)
            },
            origin: {
              x: round(spatialPlan.origin.x),
              y: round(spatialPlan.origin.y)
            },
            shape: descriptor.shape,
            colors: [...stylePreset.palette],
            powerScale,
            particleScale,
            tier: resolveTier(descriptor.tier, intensity),
            soundRole: soundRoles[launchIndex % soundRoles.length],
            crackleEnabled: descriptor.crackleEnabled
          };
        });

        cues.push({
          beatAtMs: beatTimes[phaseCueIndex],
          phase,
          formation: descriptor.formation,
          launches
        });
        cueOrdinal++;
      });
    }

    return {
      planVersion: 1,
      id,
      style,
      length,
      durationMs: lengthPreset.durationMs,
      seed,
      cues
    };
  }
}

module.exports = { FinaleShowPlanner, FINALE_STYLES, FINALE_LENGTHS };
