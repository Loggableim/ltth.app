(function initializeBoykisserGeometry(root, factory) {
  'use strict';

  const geometry = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = geometry;
  } else if (root) {
    root.WebGPUFireworksBoykisserGeometry = geometry;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBoykisserGeometry() {
  'use strict';

  const BOYKISSER_ROLES = Object.freeze({ HEAD: 0, FACE: 1, PINK: 2 });
  const BOYKISSER_COLORS = Object.freeze({
    HEAD: Object.freeze([1, 1, 1]),
    FACE: Object.freeze([0.08, 0.08, 0.1]),
    PINK: Object.freeze([1, 0.32, 0.58]),
  });

  const freezePoints = points => Object.freeze(points.map(point => Object.freeze([...point])));
  const mirrorPoints = points => points.map(([x, y]) => [-x, y]);
  const feature = (role, weight, anchor, points) => Object.freeze({
    role,
    weight,
    anchor: Object.freeze([...anchor]),
    points: freezePoints(points),
  });

  const leftEar = [
    [-0.67, -0.46], [-0.59, -0.96], [-0.25, -0.58], [-0.67, -0.46],
  ];
  const leftInnerEar = [
    [-0.59, -0.51], [-0.56, -0.82], [-0.36, -0.59], [-0.59, -0.51],
  ];
  const leftEye = [
    [-0.47, -0.08], [-0.43, -0.16], [-0.35, -0.21], [-0.27, -0.20],
    [-0.20, -0.14], [-0.17, -0.07], [-0.24, -0.12], [-0.32, -0.15],
    [-0.40, -0.13], [-0.47, -0.08],
  ];
  const leftBlush = [
    [-0.60, 0.22], [-0.54, 0.16], [-0.49, 0.25], [-0.43, 0.18], [-0.37, 0.26],
  ];

  // Declaration order is protocol: the first 13 particles place one readable
  // anchor for every landmark before weighted detail sampling begins.
  const BOYKISSER_FEATURES = Object.freeze({
    'head-outline': feature(BOYKISSER_ROLES.HEAD, 30, [0, 0.84], [
      [-0.36, -0.58], [-0.55, -0.52], [-0.70, -0.38], [-0.79, -0.14],
      [-0.80, 0.16], [-0.72, 0.42], [-0.56, 0.64], [-0.30, 0.78],
      [0, 0.84], [0.30, 0.78], [0.56, 0.64], [0.72, 0.42],
      [0.80, 0.16], [0.79, -0.14], [0.70, -0.38], [0.55, -0.52],
      [0.36, -0.58], [0, -0.64], [-0.36, -0.58],
    ]),
    'forehead-tuft': feature(BOYKISSER_ROLES.HEAD, 6, [-0.03, -0.72], [
      [-0.30, -0.55], [-0.16, -0.70], [-0.09, -0.51], [-0.03, -0.72],
      [0.07, -0.51], [0.18, -0.66], [0.31, -0.54],
    ]),
    'left-ear': feature(BOYKISSER_ROLES.HEAD, 8, [-0.59, -0.96], leftEar),
    'right-ear': feature(BOYKISSER_ROLES.HEAD, 8, [0.59, -0.96], mirrorPoints(leftEar)),
    'left-inner-ear': feature(BOYKISSER_ROLES.PINK, 5, [-0.56, -0.82], leftInnerEar),
    'right-inner-ear': feature(BOYKISSER_ROLES.PINK, 5, [0.56, -0.82], mirrorPoints(leftInnerEar)),
    'left-crescent-eye': feature(BOYKISSER_ROLES.FACE, 8, [-0.35, -0.21], leftEye),
    'right-crescent-eye': feature(BOYKISSER_ROLES.FACE, 8, [0.35, -0.21], mirrorPoints(leftEye)),
    'centered-nose': feature(BOYKISSER_ROLES.FACE, 3, [0, 0.05], [
      [-0.055, 0.02], [0, 0.075], [0.055, 0.02], [0, 0.11], [0, 0.02],
    ]),
    'w-smile': feature(BOYKISSER_ROLES.FACE, 9, [0, 0.22], [
      [-0.25, 0.18], [-0.17, 0.25], [-0.08, 0.30], [0, 0.22],
      [0.08, 0.30], [0.17, 0.25], [0.25, 0.18],
    ]),
    tongue: feature(BOYKISSER_ROLES.PINK, 4, [0, 0.45], [
      [0, 0.31], [-0.09, 0.31], [-0.08, 0.39], [0, 0.45],
      [0.08, 0.39], [0.09, 0.31], [0, 0.31],
    ]),
    'left-blush': feature(BOYKISSER_ROLES.PINK, 4, [-0.49, 0.25], leftBlush),
    'right-blush': feature(BOYKISSER_ROLES.PINK, 4, [0.49, 0.25], mirrorPoints(leftBlush)),
  });

  const FEATURE_NAMES = Object.freeze(Object.keys(BOYKISSER_FEATURES));
  const FEATURES = Object.freeze(FEATURE_NAMES.map(name => BOYKISSER_FEATURES[name]));
  const TOTAL_WEIGHT = FEATURES.reduce((sum, entry) => sum + entry.weight, 0);
  const ROLE_COLORS = Object.freeze([
    BOYKISSER_COLORS.HEAD,
    BOYKISSER_COLORS.FACE,
    BOYKISSER_COLORS.PINK,
  ]);

  const canonicalGeometry = JSON.stringify({
    roles: BOYKISSER_ROLES,
    colors: BOYKISSER_COLORS,
    features: FEATURE_NAMES.map(name => ({ name, ...BOYKISSER_FEATURES[name] })),
  });

  function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  const geometrySignature = fnv1a(canonicalGeometry).toString(16).padStart(8, '0');

  function hash32(value) {
    let result = value >>> 0;
    result = Math.imul((result >>> 16) ^ result, 0x045d9f3b) >>> 0;
    result = Math.imul((result >>> 16) ^ result, 0x045d9f3b) >>> 0;
    return ((result >>> 16) ^ result) >>> 0;
  }

  function featureIndexFor(index, count, seed) {
    if (index < FEATURE_NAMES.length) return index;
    const mixed = hash32(
      (seed >>> 0) ^
      Math.imul((index + 1) >>> 0, 0x9e3779b9) ^
      Math.imul(count >>> 0, 0x85ebca6b)
    );
    const ticket = mixed % TOTAL_WEIGHT;
    let cumulative = 0;
    for (let featureIndex = 0; featureIndex < FEATURES.length; featureIndex += 1) {
      cumulative += FEATURES[featureIndex].weight;
      if (ticket < cumulative) return featureIndex;
    }
    return FEATURES.length - 1;
  }

  function sampleSeedFor(index, count, seed, featureIndex) {
    return hash32(
      (seed >>> 0) ^
      Math.imul((index + 1) >>> 0, 0x27d4eb2d) ^
      Math.imul((featureIndex + 1) >>> 0, 0x165667b1) ^
      Math.imul(count >>> 0, 0x85ebca6b)
    );
  }

  function sampleBoykisser(index, count, seed = 0) {
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError('Boykisser sample count must be a positive integer.');
    }
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new RangeError('Boykisser sample index must be inside the requested sample set.');
    }

    const featureIndex = featureIndexFor(index, count, seed);
    const entry = FEATURES[featureIndex];
    let point;
    if (index < FEATURE_NAMES.length) {
      point = entry.anchor;
    } else {
      const sampleSeed = sampleSeedFor(index, count, seed, featureIndex);
      const segment = sampleSeed % Math.max(1, entry.points.length - 1);
      const fractionSeed = hash32(sampleSeed ^ 0xa5a5a5a5);
      const fraction = ((fractionSeed >>> 8) & 0xffff) / 0xffff;
      const start = entry.points[segment];
      const end = entry.points[Math.min(segment + 1, entry.points.length - 1)];
      point = [
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
      ];
    }

    return Object.freeze({
      x: point[0],
      y: point[1],
      feature: FEATURE_NAMES[featureIndex],
      role: entry.role,
      color: Object.freeze([...ROLE_COLORS[entry.role]]),
    });
  }

  function sampleBoykisserSet(count, seed = 0) {
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError('Boykisser sample count must be a positive integer.');
    }
    return Object.freeze(Array.from({ length: count }, (_, index) => (
      sampleBoykisser(index, count, seed)
    )));
  }

  const wgslFloat = value => {
    const normalized = Object.is(value, -0) ? 0 : value;
    return Number(normalized).toFixed(6);
  };
  const wgslPoint = ([x, y]) => `vec2f(${wgslFloat(x)}, ${wgslFloat(y)})`;

  function buildBoykisserWgsl() {
    const featureWeightCases = FEATURE_NAMES.map((name, index) => (
      `    case ${index}u: { return ${BOYKISSER_FEATURES[name].weight}u; }`
    )).join('\n');
    const featureRoleCases = FEATURE_NAMES.map((name, index) => (
      `    case ${index}u: { return ${BOYKISSER_FEATURES[name].role}u; }`
    )).join('\n');
    const featureAnchorCases = FEATURE_NAMES.map((name, index) => (
      `    case ${index}u: { return ${wgslPoint(BOYKISSER_FEATURES[name].anchor)}; }`
    )).join('\n');
    const featurePointCases = FEATURE_NAMES.map((name, index) => {
      const points = BOYKISSER_FEATURES[name].points;
      return `    // feature:${name}\n` +
        `    case ${index}u: {\n` +
        `      let points = array<vec2f, ${points.length}>(\n` +
        `        ${points.map(wgslPoint).join(',\n        ')}\n` +
        '      );\n' +
        `      let segment = sampleSeed % ${Math.max(1, points.length - 1)}u;\n` +
        '      return mix(points[segment], points[segment + 1u], fraction);\n' +
        '    }';
    }).join('\n');

    return `
// geometry-signature:${geometrySignature}
const BOYKISSER_FEATURE_COUNT = ${FEATURE_NAMES.length}u;
const BOYKISSER_TOTAL_WEIGHT = ${TOTAL_WEIGHT}u;

fn boykisserHash(value: u32) -> u32 {
  var result = value;
  result = ((result >> 16u) ^ result) * 0x045d9f3bu;
  result = ((result >> 16u) ^ result) * 0x045d9f3bu;
  return (result >> 16u) ^ result;
}

fn boykisserFeatureWeight(feature: u32) -> u32 {
  switch feature {
${featureWeightCases}
    default: { return 1u; }
  }
}

fn boykisserFeature(index: u32, count: u32, seed: u32) -> u32 {
  if (index < BOYKISSER_FEATURE_COUNT) { return index; }
  let mixed = boykisserHash(
    seed ^ ((index + 1u) * 0x9e3779b9u) ^ (count * 0x85ebca6bu)
  );
  let ticket = mixed % BOYKISSER_TOTAL_WEIGHT;
  var cumulative = 0u;
  for (var candidate = 0u; candidate < BOYKISSER_FEATURE_COUNT; candidate += 1u) {
    cumulative += boykisserFeatureWeight(candidate);
    if (ticket < cumulative) { return candidate; }
  }
  return BOYKISSER_FEATURE_COUNT - 1u;
}

fn boykisserRole(index: u32, count: u32, seed: u32) -> u32 {
  let feature = boykisserFeature(index, count, seed);
  switch feature {
${featureRoleCases}
    default: { return ${BOYKISSER_ROLES.HEAD}u; }
  }
}

fn boykisserCanonicalColor(role: u32) -> vec3f {
  if (role == ${BOYKISSER_ROLES.FACE}u) {
    return vec3f(${BOYKISSER_COLORS.FACE.map(wgslFloat).join(', ')});
  }
  if (role == ${BOYKISSER_ROLES.PINK}u) {
    return vec3f(${BOYKISSER_COLORS.PINK.map(wgslFloat).join(', ')});
  }
  return vec3f(${BOYKISSER_COLORS.HEAD.map(wgslFloat).join(', ')});
}

fn boykisserAnchor(feature: u32) -> vec2f {
  switch feature {
${featureAnchorCases}
    default: { return vec2f(0.0); }
  }
}

fn boykisserSampleSeed(index: u32, count: u32, seed: u32, feature: u32) -> u32 {
  return boykisserHash(
    seed ^ ((index + 1u) * 0x27d4eb2du) ^
    ((feature + 1u) * 0x165667b1u) ^ (count * 0x85ebca6bu)
  );
}

fn boykisserFeaturePoint(feature: u32, sampleSeed: u32) -> vec2f {
  let fractionSeed = boykisserHash(sampleSeed ^ 0xa5a5a5a5u);
  let fraction = f32((fractionSeed >> 8u) & 0xffffu) / 65535.0;
  switch feature {
${featurePointCases}
    default: { return vec2f(0.0); }
  }
}

fn boykisserPoint(index: u32, count: u32, seed: u32) -> vec2f {
  let feature = boykisserFeature(index, count, seed);
  if (index < BOYKISSER_FEATURE_COUNT) { return boykisserAnchor(feature); }
  return boykisserFeaturePoint(feature, boykisserSampleSeed(index, count, seed, feature));
}
`;
  }

  return Object.freeze({
    BOYKISSER_FEATURES,
    BOYKISSER_ROLES,
    BOYKISSER_COLORS,
    sampleBoykisser,
    sampleBoykisserSet,
    buildBoykisserWgsl,
    geometrySignature,
  });
});
