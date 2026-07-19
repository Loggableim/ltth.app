'use strict';

const { SHOW_DEFINITION_VERSION, VARIANT_PRESETS } = require('./pyrodsl');

const FINALE_LENGTHS = Object.freeze(['short', 'medium', 'long']);
const PHASE_ORDER = Object.freeze(['opening', 'build', 'highlight', 'finale']);

const LENGTH_PRESETS = Object.freeze(Object.fromEntries(FINALE_LENGTHS.map(length => [length, {
  durationMs: VARIANT_PRESETS[length].durationMs,
  windows: {
    opening: [...VARIANT_PRESETS[length].windows.opening],
    build: [...VARIANT_PRESETS[length].windows.build],
    highlight: [...VARIANT_PRESETS[length].windows.highlight],
    breath: [...VARIANT_PRESETS[length].windows.rest],
    finale: [...VARIANT_PRESETS[length].windows.finale]
  }
}])));

function layer(primitive, colors, options = {}) {
  const value = {
    primitive,
    delayMs: options.delayMs || 0,
    density: options.density || 72,
    size: options.size || 1,
    lifetimeMs: options.lifetimeMs || 900,
    gravity: options.gravity === undefined ? 0.8 : options.gravity,
    drag: options.drag === undefined ? 0.04 : options.drag,
    trail: options.trail === true,
    split: options.split === true,
    strobe: options.strobe === true,
    colors: [...colors],
    priority: options.priority || 'core',
    core: options.core === undefined ? options.priority !== 'decorative' : options.core
  };
  if (options.glyph) value.glyph = options.glyph;
  return value;
}

function legacyLayers(shape, palette) {
  const accent = { density: 36, lifetimeMs: 700, priority: 'decorative', core: false };
  if (shape === 'ring') return [layer('ring', palette.slice(0, 3)), layer('radial', palette.slice(1, 3), accent)];
  if (shape === 'spiral') return [layer('spiral', palette.slice(0, 3), { trail: true }), layer('comet', palette.slice(1, 3), accent)];
  if (shape === 'star' || shape === 'heart') {
    return [
      layer('glyph', palette.slice(0, 3), { glyph: shape }),
      layer('radial', palette.slice(1, 3), accent)
    ];
  }
  return [layer('radial', palette.slice(0, 3)), layer('ring', palette.slice(1, 3), accent)];
}

function descriptor(formation, shape, soundRole, tier, options = {}) {
  return {
    formation,
    shape,
    soundRole,
    soundRoles: options.soundRoles,
    tier,
    crackleEnabled: options.crackleEnabled === true,
    launchMode: options.launchMode || 'rocket',
    layers: options.layers
  };
}

const BLUEPRINTS = {
  'classic-crescendo': {
    name: 'Classic Crescendo',
    description: 'Warm classic bursts rising into a gold crown.',
    materialProfile: 'classic',
    palette: ['#ffd166', '#fff4d6', '#ff3b30'],
    counts: {
      short: { opening: [1], build: [2], highlight: [1, 1], finale: [3, 6] },
      medium: { opening: [1, 1], build: [2, 2, 2], highlight: [2, 2], finale: [6, 6] },
      long: { opening: [1, 1, 1], build: [2, 2, 2, 2, 2], highlight: [3, 3], finale: [5, 6, 6] }
    },
    cues: {
      opening: [descriptor('single', 'burst', 'single', 'medium')],
      build: [descriptor('alternating-pair', 'burst', 'pair', 'medium')],
      highlight: [descriptor('ring-accent', 'ring', 'accent', 'big', { crackleEnabled: true }), descriptor('star-accent', 'star', 'accent', 'big')],
      finale: [descriptor('fan', 'burst', 'crown', 'massive', { crackleEnabled: true }), descriptor('gold-crown', 'star', 'crown', 'massive', { crackleEnabled: true })]
    }
  },
  'symmetric-salute': {
    name: 'Symmetric Salute',
    description: 'Mirrored calls and responses closing as a salute wall.',
    materialProfile: 'classic',
    palette: ['#ef233c', '#ffd166', '#ffffff'],
    counts: {
      short: { opening: [1, 1], build: [2], highlight: [2, 3], finale: [3, 4] },
      medium: { opening: [1, 1], build: [2, 2, 2], highlight: [2, 3], finale: [4, 4, 5] },
      long: { opening: [1, 1, 1, 1], build: [2, 2, 2, 2, 2], highlight: [3, 3, 3], finale: [5, 6, 6] }
    },
    cues: {
      opening: [descriptor('call', 'burst', 'call', 'medium'), descriptor('response', 'burst', 'response', 'medium')],
      build: [descriptor('mirrored-pair', 'burst', null, 'big', { soundRoles: ['call', 'response'] })],
      highlight: [descriptor('centered-ring', 'ring', 'salute', 'big', { crackleEnabled: true }), descriptor('triple-salute', 'burst', 'salute', 'massive', { crackleEnabled: true })],
      finale: [descriptor('symmetric-final-wall', 'ring', 'wall', 'massive', { crackleEnabled: true })]
    }
  },
  'sky-ballet': {
    name: 'Sky Ballet',
    description: 'Crossing pastel flights with spiral and floral accents.',
    materialProfile: 'classic',
    palette: ['#9b5de5', '#35d9e8', '#ff5d8f'],
    counts: {
      short: { opening: [1], build: [2, 2], highlight: [2, 2], finale: [4] },
      medium: { opening: [1], build: [2, 2, 2], highlight: [3, 3], finale: [4, 5] },
      long: { opening: [1, 1, 1], build: [2, 2, 2, 2, 2], highlight: [3, 3, 3], finale: [6, 6] }
    },
    cues: {
      opening: [descriptor('single', 'burst', 'ballet', 'medium')],
      build: [descriptor('diagonal-pair', 'burst', 'ballet', 'medium'), descriptor('cross-pair', 'burst', 'ballet', 'medium')],
      highlight: [descriptor('spiral-accent', 'spiral', 'accent', 'big'), descriptor('star-accent', 'star', 'accent', 'big')],
      finale: [descriptor('floral-finale', 'heart', 'floral', 'massive', { crackleEnabled: true })]
    }
  },
  'thunder-finale': {
    name: 'Thunder Finale',
    description: 'Heavy gold volleys culminating in three thunder waves.',
    materialProfile: 'classic',
    palette: ['#ffb000', '#ffd166', '#ffffff'],
    counts: {
      short: { opening: [1], build: [2], highlight: [3], finale: [2, 2, 2] },
      medium: { opening: [1, 1], build: [2, 2, 2], highlight: [3], finale: [3, 3, 3] },
      long: { opening: [1, 1, 1], build: [2, 2, 2, 2], highlight: [3, 3], finale: [4, 4, 5] }
    },
    cues: {
      opening: [descriptor('heavy-single', 'burst', 'heavy', 'big', { crackleEnabled: true })],
      build: [descriptor('staggered-volley', 'burst', 'volley', 'big', { crackleEnabled: true })],
      highlight: [descriptor('triple-salute', 'burst', 'salute', 'massive', { crackleEnabled: true })],
      finale: [descriptor('finale-wave-1', 'burst', 'wave', 'massive', { crackleEnabled: true }), descriptor('finale-wave-2', 'burst', 'wave', 'massive', { crackleEnabled: true }), descriptor('finale-wave-3', 'burst', 'wave', 'massive', { crackleEnabled: true })]
    }
  },
  'nishiki-kamuro': {
    name: 'Nishiki Kamuro',
    description: 'Blue peonies, gold chrysanthemums, long willows, and a Nishiki brocade crown.',
    materialProfile: 'premium-realistic',
    palette: ['#1d4ed8', '#60a5fa', '#f6c453', '#fff1a8'],
    counts: {
      short: { opening: [1], build: [2, 2], highlight: [2], finale: [5] },
      medium: { opening: [1, 1], build: [2, 2, 2], highlight: [3], finale: [4, 5] },
      long: { opening: [1, 1, 1], build: [2, 2, 2, 2], highlight: [3, 3], finale: [4, 4, 5] }
    },
    cues: {
      opening: [descriptor('peony', 'burst', 'peony', 'medium', { layers: [layer('radial', ['#1d4ed8', '#60a5fa']), layer('ring', ['#f8fafc'], { strobe: true, density: 32, priority: 'accent' })] })],
      build: [descriptor('chrysanthemum', 'burst', 'chrysanthemum', 'big', { layers: [layer('radial', ['#f6c453', '#fff1a8'], { split: true }), layer('crossette', ['#f6c453'], { delayMs: 180, density: 48 })] })],
      highlight: [descriptor('willow', 'burst', 'willow', 'big', { layers: [layer('palm', ['#f6c453', '#fff1a8'], { lifetimeMs: 1200, gravity: 1.35, drag: 0.025, trail: true }), layer('comet', ['#60a5fa'], { density: 36, trail: true, priority: 'decorative', core: false })] })],
      finale: [descriptor('gold-crown', 'star', 'crown', 'massive', { crackleEnabled: true, layers: [layer('palm', ['#f6c453', '#fff1a8'], { lifetimeMs: 1200, trail: true }), layer('radial', ['#1d4ed8', '#60a5fa'], { split: true }), layer('ring', ['#fff1a8'], { strobe: true, density: 36, priority: 'decorative', core: false })] })]
    }
  },
  'aurora-cathedral': {
    name: 'Aurora Cathedral',
    description: 'Cool comet arches, crossette vaults, silver strobes, palms, and willows.',
    materialProfile: 'premium-realistic',
    palette: ['#60a5fa', '#67e8f9', '#c4b5fd', '#f8fafc'],
    counts: {
      short: { opening: [1], build: [2, 2], highlight: [3], finale: [6] },
      medium: { opening: [1, 1], build: [2, 2, 2], highlight: [3, 3], finale: [4, 5] },
      long: { opening: [1, 1, 1], build: [2, 2, 2, 2, 2], highlight: [3, 3], finale: [5, 5, 5] }
    },
    cues: {
      opening: [descriptor('cathedral', 'spiral', 'comet', 'medium', { layers: [layer('comet', ['#60a5fa', '#67e8f9'], { trail: true }), layer('ring', ['#f8fafc'], { strobe: true, density: 30, priority: 'decorative', core: false })] })],
      build: [descriptor('wing-fan', 'burst', 'crossette', 'big', { layers: [layer('crossette', ['#67e8f9', '#c4b5fd'], { split: true }), layer('comet', ['#f8fafc'], { delayMs: 160, trail: true, density: 42 })] })],
      highlight: [descriptor('cathedral', 'ring', 'vault', 'big', { layers: [layer('palm', ['#60a5fa', '#c4b5fd'], { trail: true, gravity: 1.1 }), layer('ring', ['#f8fafc'], { strobe: true, density: 40 })] })],
      finale: [descriptor('willow', 'burst', 'cathedral', 'massive', { crackleEnabled: true, layers: [layer('palm', ['#67e8f9', '#f8fafc'], { lifetimeMs: 1200, trail: true }), layer('crossette', ['#c4b5fd'], { split: true }), layer('ring', ['#f8fafc'], { strobe: true, density: 32, priority: 'decorative', core: false })] })]
    }
  },
  'royal-brocade': {
    name: 'Royal Brocade',
    description: 'Ruby and emerald pistils, palms, rings, and a baroque brocade wall.',
    materialProfile: 'premium-realistic',
    palette: ['#9f1239', '#ef4444', '#047857', '#34d399', '#f6c453'],
    counts: {
      short: { opening: [1], build: [2, 2], highlight: [3], finale: [3, 4] },
      medium: { opening: [1, 1], build: [2, 2, 2], highlight: [3, 3], finale: [5, 6] },
      long: { opening: [1, 1, 1], build: [2, 2, 2, 2, 2], highlight: [3, 3, 3], finale: [5, 5, 6] }
    },
    cues: {
      opening: [descriptor('centered-ring', 'ring', 'royal', 'medium', { layers: [layer('ring', ['#9f1239', '#047857']), layer('radial', ['#f6c453'], { density: 36, priority: 'accent' })] })],
      build: [descriptor('fan', 'burst', 'palm', 'big', { layers: [layer('palm', ['#ef4444', '#34d399'], { trail: true }), layer('ring', ['#f6c453'], { delayMs: 120, density: 40 })] })],
      highlight: [descriptor('ring-accent', 'ring', 'pistil', 'big', { layers: [layer('radial', ['#9f1239', '#047857'], { split: true }), layer('ring', ['#ef4444', '#34d399']), layer('comet', ['#f6c453'], { trail: true, density: 30, priority: 'decorative', core: false })] })],
      finale: [descriptor('baroque-wall', 'burst', 'brocade', 'massive', { crackleEnabled: true, layers: [layer('palm', ['#9f1239', '#047857'], { lifetimeMs: 1100, trail: true }), layer('ring', ['#ef4444', '#34d399']), layer('radial', ['#f6c453'], { strobe: true, density: 34, priority: 'decorative', core: false })] })]
    }
  },
  'phoenix-ascension': {
    name: 'Phoenix Ascension',
    description: 'Mines, rising wing fans, ember crossettes, and three final waves.',
    materialProfile: 'premium-realistic',
    palette: ['#7f1d1d', '#ef4444', '#f97316', '#facc15', '#fff7ed'],
    counts: {
      short: { opening: [1], build: [2, 2], highlight: [3], finale: [2, 3, 3] },
      medium: { opening: [1, 1], build: [2, 2, 2], highlight: [3, 3], finale: [4, 4, 5] },
      long: { opening: [1, 1, 1], build: [2, 2, 2, 2, 2], highlight: [3, 3, 3], finale: [6, 6, 6] }
    },
    cues: {
      opening: [descriptor('heavy-single', 'burst', 'mine', 'medium', { launchMode: 'ground', layers: [layer('mine', ['#7f1d1d', '#f97316'], { trail: true }), layer('comet', ['#facc15'], { density: 38, priority: 'accent' })] })],
      build: [descriptor('wing-fan', 'burst', 'wings', 'big', { layers: [layer('palm', ['#ef4444', '#f97316'], { trail: true }), layer('comet', ['#facc15'], { delayMs: 140, trail: true, density: 44 })] })],
      highlight: [descriptor('staggered-volley', 'burst', 'embers', 'big', { layers: [layer('crossette', ['#f97316', '#facc15'], { split: true }), layer('radial', ['#ef4444'], { strobe: true, density: 40 })] })],
      finale: [descriptor('finale-wave-1', 'burst', 'wave', 'massive', { crackleEnabled: true, layers: [layer('palm', ['#7f1d1d', '#ef4444'], { trail: true }), layer('crossette', ['#f97316', '#facc15'], { split: true }), layer('ring', ['#fff7ed'], { strobe: true, density: 30, priority: 'decorative', core: false })] }), descriptor('finale-wave-2', 'burst', 'wave', 'massive', { crackleEnabled: true, layers: [layer('palm', ['#ef4444', '#f97316'], { trail: true }), layer('crossette', ['#facc15'], { split: true })] }), descriptor('finale-wave-3', 'burst', 'wave', 'massive', { crackleEnabled: true, layers: [layer('radial', ['#f97316', '#facc15'], { split: true }), layer('palm', ['#fff7ed'], { trail: true }), layer('ring', ['#ef4444'], { strobe: true, density: 32, priority: 'decorative', core: false })] })]
    }
  },
  'furry-celebration': {
    name: 'Furry Celebration',
    description: 'Paws, hearts, fox, wolf, dragon wings, dragon, tail, and a rainbow crown.',
    materialProfile: 'premium-realistic',
    palette: ['#ef4444', '#f97316', '#facc15', '#22c55e', '#38bdf8', '#8b5cf6'],
    counts: {
      short: { opening: [1], build: [2, 2], highlight: [3], finale: [3, 4] },
      medium: { opening: [1, 1], build: [2, 2, 2], highlight: [3, 3], finale: [5, 6] },
      long: { opening: [1, 1, 1], build: [2, 2, 2, 2, 2], highlight: [3, 3, 3], finale: [5, 5, 6] }
    },
    cues: {
      opening: [descriptor('paw-fan', 'paws', 'paw', 'medium', { layers: [layer('glyph', ['#f97316', '#facc15'], { glyph: 'paw' }), layer('glyph', ['#ef4444'], { glyph: 'heart', density: 34, priority: 'accent' }), layer('glyph', ['#f97316', '#facc15'], { glyph: 'fox-head', density: 30, priority: 'decorative', core: false })] }), descriptor('glyph-crown', 'heart', 'heart', 'medium', { layers: [layer('glyph', ['#ef4444', '#f97316'], { glyph: 'heart' })] }), descriptor('glyph-crown', 'paws', 'fox', 'big', { layers: [layer('glyph', ['#f97316', '#facc15'], { glyph: 'fox-head' })] })],
      build: [descriptor('paw-fan', 'paws', 'wolf', 'big', { layers: [layer('glyph', ['#38bdf8', '#8b5cf6'], { glyph: 'wolf-head' }), layer('comet', ['#facc15'], { trail: true, density: 32, priority: 'decorative', core: false })] }), descriptor('wing-fan', 'burst', 'wings', 'big', { layers: [layer('glyph', ['#ef4444', '#8b5cf6'], { glyph: 'dragon-wing' }), layer('palm', ['#f97316'], { trail: true, density: 42 })] }), descriptor('arc', 'spiral', 'tail', 'big', { layers: [layer('glyph', ['#f97316', '#facc15'], { glyph: 'tail' }), layer('spiral', ['#38bdf8'], { trail: true, density: 36, priority: 'accent' })] })],
      highlight: [descriptor('glyph-crown', 'star', 'dragon', 'massive', { layers: [layer('glyph', ['#22c55e', '#38bdf8'], { glyph: 'dragon' }), layer('glyph', ['#ef4444', '#8b5cf6'], { glyph: 'dragon-wing', density: 42, priority: 'accent' }), layer('ring', ['#facc15'], { strobe: true, density: 28, priority: 'decorative', core: false })] })],
      finale: [descriptor('glyph-crown', 'star', 'celebration', 'massive', { crackleEnabled: true, layers: [layer('glyph', ['#f97316', '#facc15'], { glyph: 'tail' }), layer('glyph', ['#ef4444'], { glyph: 'heart', density: 36, priority: 'accent' }), layer('ring', ['#22c55e', '#38bdf8', '#8b5cf6'], { strobe: true, density: 32, priority: 'decorative', core: false })] }), descriptor('gold-crown', 'star', 'rainbow', 'massive', { crackleEnabled: true, layers: [layer('ring', ['#ef4444', '#f97316', '#facc15', '#22c55e'], { split: true }), layer('spiral', ['#38bdf8', '#8b5cf6'], { trail: true }), layer('glyph', ['#facc15'], { glyph: 'paw', density: 28, priority: 'decorative', core: false })] })]
    }
  }
};

function spreadEvenly(start, end, count) {
  const step = (end - start) / (count + 1);
  return Array.from({ length: count }, (_, index) => Math.round(start + step * (index + 1)));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDefinition(id, blueprint) {
  const variants = {};
  for (const length of FINALE_LENGTHS) {
    const cues = [];
    for (const phase of PHASE_ORDER) {
      const counts = blueprint.counts[length][phase];
      const times = spreadEvenly(...LENGTH_PRESETS[length].windows[phase], counts.length);
      counts.forEach((shellCount, cueIndex) => {
        const cueDescriptor = blueprint.cues[phase][cueIndex % blueprint.cues[phase].length];
        const layers = cueDescriptor.layers || legacyLayers(cueDescriptor.shape, blueprint.palette);
        cues.push({
          timeMs: times[cueIndex],
          phase,
          formation: cueDescriptor.formation,
          importance: phase === 'finale' ? 'final-wave' : phase === 'highlight' ? 'essential' : 'standard',
          shells: Array.from({ length: shellCount }, () => ({
            origin: { x: 0.5, y: 1.02 },
            target: { x: 0.5, y: 0.4 },
            launchMode: cueDescriptor.launchMode,
            tier: cueDescriptor.tier,
            palette: [...blueprint.palette],
            layers: clone(layers)
          }))
        });
      });
    }
    variants[length] = { durationMs: LENGTH_PRESETS[length].durationMs, cues };
  }
  return {
    schemaVersion: SHOW_DEFINITION_VERSION,
    id,
    metadata: {
      name: blueprint.name,
      description: blueprint.description,
      author: 'LTTH',
      tags: ['built-in', blueprint.materialProfile]
    },
    materialProfile: blueprint.materialProfile,
    autoEligible: true,
    variants
  };
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  }
  return value;
}

deepFreeze(BLUEPRINTS);
const BUILT_IN_SHOW_DEFINITIONS = deepFreeze(Object.fromEntries(
  Object.entries(BLUEPRINTS).map(([id, blueprint]) => [id, createDefinition(id, blueprint)])
));
const FINALE_STYLE_METADATA = deepFreeze(Object.entries(BLUEPRINTS).map(([id, blueprint]) => ({
  id,
  name: blueprint.name,
  description: blueprint.description,
  materialProfile: blueprint.materialProfile,
  autoEligible: true,
  builtIn: true
})));
const FINALE_STYLES = Object.freeze(FINALE_STYLE_METADATA.map(style => style.id));

module.exports = {
  BUILT_IN_SHOW_DEFINITIONS,
  FINALE_LENGTHS,
  FINALE_STYLES,
  FINALE_STYLE_METADATA,
  LENGTH_PRESETS,
  PHASE_ORDER,
  getBuiltInShowBlueprint: id => BLUEPRINTS[id]
};
