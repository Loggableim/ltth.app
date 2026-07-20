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

  const BOYKISSER_ROLES = Object.freeze({ HEAD: 0, FACE: 1, ACCENT: 2 });
  const boykisserColors = {
    HEAD: Object.freeze([1, 1, 1]),
    FACE: Object.freeze([0, 0, 0]),
    ACCENT: Object.freeze([1, 0, 0]),
  };
  Object.defineProperty(boykisserColors, 'PINK', {
    value: boykisserColors.ACCENT,
    enumerable: false,
  });
  const BOYKISSER_COLORS = Object.freeze(boykisserColors);

  const freezePoints = points => Object.freeze(points.map(point => Object.freeze([...point])));
  const closePoints = points => [...points, points[0]];
  const feature = (role, weight, anchor, points) => Object.freeze({
    role,
    weight,
    anchor: Object.freeze([...anchor]),
    points: freezePoints(points),
  });

  // Normalized contours traced from the user-approved 2452 x 3259 reference.
  // The original drawing is intentionally asymmetric; these points preserve it.
  const silhouette = [
    [0.8369, -0.9755], [0.3450, -0.6085], [0.3850, -0.5453],
    [0.1085, -0.7232], [-0.2007, -0.7913], [-0.1134, -0.6171],
    [-0.0489, -0.6048], [-0.3540, -0.5029], [-0.0049, -0.5035],
    [-0.0816, -0.4808], [-0.3980, -0.4894], [-0.2382, -0.5851],
    [-0.6998, -0.9736], [-0.8197, -0.8386], [-0.8940, -0.6612],
    [-0.9021, -0.4722], [-0.8393, -0.2943], [-0.7039, -0.1230],
    [-0.9690, -0.1390], [-0.9086, -0.0525], [-0.7773, 0.0107],
    [-0.8825, 0.1912], [-0.6542, 0.1801], [-0.1876, 0.2955],
    [-0.4470, 0.2765], [-0.2879, 0.3943], [-0.4038, 0.4968],
    [-0.2684, 0.4992], [-0.4323, 0.9994], [0.5873, 0.9994],
    [0.4951, 0.5410], [0.3613, 0.2863], [0.2945, 0.2519],
    [0.6069, 0.1672], [0.8891, 0.1599], [0.7463, 0.0064],
    [0.9307, -0.1513], [0.7365, -0.1476], [0.8980, -0.3145],
    [0.9698, -0.5183], [0.9478, -0.7668],
  ];
  const foreheadTuft = [
    [0.3850, -0.5453], [0.1085, -0.7232], [-0.2007, -0.7913],
    [-0.1134, -0.6171], [-0.0489, -0.6048], [-0.3540, -0.5029],
    [-0.0049, -0.5035], [-0.0816, -0.4808],
  ];
  const leftLongEye = [
    [-0.6387, -0.2673], [-0.1852, -0.2679], [-0.2031, -0.0985],
    [-0.2480, -0.0169], [-0.3173, 0.0052], [-0.3793, -0.0322],
    [-0.4103, -0.1187], [-0.4095, -0.2562], [-0.5481, -0.2550],
    [-0.5946, -0.1255], [-0.5897, -0.0611], [-0.5595, -0.0077],
    [-0.5816, 0.0028], [-0.6232, -0.1120], [-0.5791, -0.2531],
    [-0.6313, -0.2501],
  ];
  const rightLongEye = [
    [0.6142, -0.3010], [0.6052, -0.2851], [0.5408, -0.2844],
    [0.5848, -0.1580], [0.5718, -0.0316], [0.5506, -0.0390],
    [0.5555, -0.1703], [0.5106, -0.2838], [0.3793, -0.2826],
    [0.3817, -0.1335], [0.3263, -0.0476], [0.2504, -0.0267],
    [0.1958, -0.0611], [0.1558, -0.1531], [0.1713, -0.2924],
  ];
  const nose = [
    [-0.1354, -0.0095], [-0.1297, -0.0163], [-0.1183, -0.0193],
    [-0.0701, -0.0206], [-0.0318, -0.0175], [-0.0237, -0.0126],
    [-0.0220, -0.0052], [-0.0245, -0.0009], [-0.0326, 0.0034],
    [-0.0889, 0.0089], [-0.1289, 0.0040], [-0.1346, -0.0003],
  ];
  const omegaMouth = [
    [0.2047, 0.0960], [0.1860, 0.1138], [0.1150, 0.1341],
    [0.0522, 0.1353], [-0.0228, 0.1175], [-0.0808, 0.1451],
    [-0.1378, 0.1586], [-0.1900, 0.1507], [-0.2292, 0.1273],
    [-0.2276, 0.1194], [-0.2121, 0.1145], [-0.1803, 0.1316],
    [-0.1330, 0.1365], [-0.0783, 0.1206], [-0.0277, 0.0954],
    [0.0783, 0.1163], [0.1370, 0.1077], [0.1892, 0.0881],
  ];
  const leftCheek = [
    [-0.7178, 0.0482], [-0.7162, 0.0562], [-0.7023, 0.0604],
    [-0.6419, 0.0408], [-0.6493, 0.0881], [-0.6370, 0.0960],
    [-0.5155, 0.0592], [-0.5082, 0.0531], [-0.5106, 0.0439],
    [-0.5220, 0.0402], [-0.6183, 0.0690], [-0.6158, 0.0334],
    [-0.6215, 0.0206], [-0.6313, 0.0169], [-0.7088, 0.0408],
  ];
  const rightCheek = [
    [0.5987, 0.0175], [0.5832, 0.0175], [0.5147, 0.0623],
    [0.5122, 0.0156], [0.5049, 0.0095], [0.4910, 0.0095],
    [0.4274, 0.0525], [0.4258, 0.0611], [0.4331, 0.0672],
    [0.4454, 0.0666], [0.4869, 0.0365], [0.4878, 0.0875],
    [0.4959, 0.0936], [0.5049, 0.0936], [0.6020, 0.0310],
  ];

  const BOYKISSER_VECTOR = Object.freeze({
    aspectRatio: 2452 / 3259,
    viewportFraction: 0.84,
    silhouette: freezePoints(silhouette),
    blackFills: Object.freeze([
      freezePoints(leftLongEye),
      freezePoints(rightLongEye),
      freezePoints(nose),
      freezePoints(omegaMouth),
    ]),
    blackStrokes: Object.freeze([]),
    redStrokes: Object.freeze([
      freezePoints(leftCheek),
      freezePoints(rightCheek),
    ]),
  });

  // Declaration order is protocol: the first eight particles place one readable
  // anchor for every landmark before weighted detail sampling begins.
  const BOYKISSER_FEATURES = Object.freeze({
    'outer-silhouette': feature(BOYKISSER_ROLES.HEAD, 40, [0.8369, -0.9755], closePoints(silhouette)),
    'forehead-tuft': feature(BOYKISSER_ROLES.HEAD, 7, [-0.2007, -0.7913], foreheadTuft),
    'left-long-eye': feature(BOYKISSER_ROLES.FACE, 12, [-0.4103, -0.1187], closePoints(leftLongEye)),
    'right-long-eye': feature(BOYKISSER_ROLES.FACE, 12, [0.3817, -0.1335], closePoints(rightLongEye)),
    'centered-nose': feature(BOYKISSER_ROLES.FACE, 3, [-0.0783, -0.0055], closePoints(nose)),
    'omega-mouth': feature(BOYKISSER_ROLES.FACE, 8, [-0.0118, 0.1237], closePoints(omegaMouth)),
    'left-zigzag-cheek': feature(BOYKISSER_ROLES.ACCENT, 5, [-0.6126, 0.0568], closePoints(leftCheek)),
    'right-zigzag-cheek': feature(BOYKISSER_ROLES.ACCENT, 5, [0.5151, 0.0519], closePoints(rightCheek)),
  });

  const FEATURE_NAMES = Object.freeze(Object.keys(BOYKISSER_FEATURES));
  const FEATURES = Object.freeze(FEATURE_NAMES.map(name => BOYKISSER_FEATURES[name]));
  const TOTAL_WEIGHT = FEATURES.reduce((sum, entry) => sum + entry.weight, 0);
  const ROLE_COLORS = Object.freeze([
    BOYKISSER_COLORS.HEAD,
    BOYKISSER_COLORS.FACE,
    BOYKISSER_COLORS.ACCENT,
  ]);

  const canonicalGeometry = JSON.stringify({
    roles: BOYKISSER_ROLES,
    colors: BOYKISSER_COLORS,
    vector: BOYKISSER_VECTOR,
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
  const buildPolygonContainsFunction = (name, points) => `
fn ${name}(point: vec2f) -> bool {
  let vertices = array<vec2f, ${points.length}>(
    ${points.map(wgslPoint).join(',\n    ')}
  );
  var inside = false;
  var previous = ${points.length - 1}u;
  for (var current = 0u; current < ${points.length}u; current += 1u) {
    let a = vertices[current];
    let b = vertices[previous];
    let deltaY = b.y - a.y;
    let safeDeltaY = select(0.000001, deltaY, abs(deltaY) > 0.000001);
    let crossingX = (b.x - a.x) * (point.y - a.y) / safeDeltaY + a.x;
    let crosses = ((a.y > point.y) != (b.y > point.y)) && (point.x < crossingX);
    if (crosses) { inside = !inside; }
    previous = current;
  }
  return inside;
}`;

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
    const silhouetteFunction = buildPolygonContainsFunction(
      'boykisserSilhouetteContains',
      BOYKISSER_VECTOR.silhouette
    );
    const blackFunctions = BOYKISSER_VECTOR.blackFills.map((points, index) => (
      buildPolygonContainsFunction(`boykisserBlackFill${index}Contains`, points)
    )).join('\n');
    const blackCoverageChecks = BOYKISSER_VECTOR.blackFills.map((_, index) => (
      `  if (boykisserBlackFill${index}Contains(point)) { return 1.0; }`
    )).join('\n');
    const redFunctions = BOYKISSER_VECTOR.redStrokes.map((points, index) => (
      buildPolygonContainsFunction(`boykisserRedFill${index}Contains`, points)
    )).join('\n');
    const redCoverageChecks = BOYKISSER_VECTOR.redStrokes.map((_, index) => (
      `  if (boykisserRedFill${index}Contains(point)) { return 1.0; }`
    )).join('\n');

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
  if (role == ${BOYKISSER_ROLES.ACCENT}u) {
    return vec3f(${BOYKISSER_COLORS.ACCENT.map(wgslFloat).join(', ')});
  }
  return vec3f(${BOYKISSER_COLORS.HEAD.map(wgslFloat).join(', ')});
}

${silhouetteFunction}
${blackFunctions}
${redFunctions}

fn boykisserBlackCoverage(point: vec2f) -> f32 {
${blackCoverageChecks}
  return 0.0;
}

fn boykisserRedCoverage(point: vec2f) -> f32 {
${redCoverageChecks}
  return 0.0;
}

fn boykisserVectorColor(uv: vec2f) -> vec4f {
  let squarePoint = uv * 2.0 - vec2f(1.0);
  let point = vec2f(squarePoint.x / ${wgslFloat(BOYKISSER_VECTOR.aspectRatio)}, squarePoint.y);
  if (!boykisserSilhouetteContains(point)) { return vec4f(0.0); }
  if (boykisserRedCoverage(point) > 0.5) {
    return vec4f(${BOYKISSER_COLORS.ACCENT.map(wgslFloat).join(', ')}, 1.0);
  }
  if (boykisserBlackCoverage(point) > 0.5) {
    return vec4f(${BOYKISSER_COLORS.FACE.map(wgslFloat).join(', ')}, 1.0);
  }
  return vec4f(${BOYKISSER_COLORS.HEAD.map(wgslFloat).join(', ')}, 1.0);
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
    BOYKISSER_VECTOR,
    sampleBoykisser,
    sampleBoykisserSet,
    buildBoykisserWgsl,
    geometrySignature,
  });
});
