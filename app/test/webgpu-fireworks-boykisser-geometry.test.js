'use strict';

const {
  BOYKISSER_FEATURES,
  BOYKISSER_ROLES,
  BOYKISSER_COLORS,
  sampleBoykisser,
  sampleBoykisserSet,
  buildBoykisserWgsl,
  geometrySignature,
} = require('../plugins/webgpu-fireworks/gpu/boykisser-geometry');

const REQUIRED_FEATURES = [
  'head-outline',
  'forehead-tuft',
  'left-ear',
  'right-ear',
  'left-inner-ear',
  'right-inner-ear',
  'left-crescent-eye',
  'right-crescent-eye',
  'centered-nose',
  'w-smile',
  'tongue',
  'left-blush',
  'right-blush',
];

const mirrorPoints = points => points.map(([x, y]) => [-x, y]);
const featureCenterX = feature => feature.points
  .reduce((sum, [x]) => sum + x, 0) / feature.points.length;

describe('WebGPU Fireworks semantic Boykisser geometry', () => {
  test('defines every approved landmark with an explicit semantic color role', () => {
    expect(Object.keys(BOYKISSER_FEATURES)).toEqual(REQUIRED_FEATURES);
    expect(BOYKISSER_ROLES).toEqual({ HEAD: 0, FACE: 1, PINK: 2 });
    for (const feature of Object.values(BOYKISSER_FEATURES)) {
      expect(feature).toMatchObject({
        role: expect.any(Number),
        weight: expect.any(Number),
        anchor: [expect.any(Number), expect.any(Number)],
      });
      expect(Object.values(BOYKISSER_ROLES)).toContain(feature.role);
      expect(feature.points.length).toBeGreaterThan(0);
    }
    expect(BOYKISSER_COLORS).toEqual({
      HEAD: [1, 1, 1],
      FACE: [0.08, 0.08, 0.1],
      PINK: [1, 0.32, 0.58],
    });
  });

  test.each([13, 20, 32])('retains every landmark at low density %i', count => {
    const samples = sampleBoykisserSet(count, 12345);
    expect(samples).toHaveLength(count);
    expect(new Set(samples.map(sample => sample.feature))).toEqual(new Set(REQUIRED_FEATURES));
  });

  test('keeps paired features mirrored and the face centered', () => {
    const features = BOYKISSER_FEATURES;
    expect(mirrorPoints(features['left-ear'].points)).toEqual(features['right-ear'].points);
    expect(mirrorPoints(features['left-inner-ear'].points)).toEqual(features['right-inner-ear'].points);
    expect(mirrorPoints(features['left-crescent-eye'].points)).toEqual(features['right-crescent-eye'].points);
    expect(mirrorPoints(features['left-blush'].points)).toEqual(features['right-blush'].points);
    expect(featureCenterX(features['centered-nose'])).toBeCloseTo(0, 6);
    expect(featureCenterX(features['w-smile'])).toBeCloseTo(0, 6);
    expect(featureCenterX(features.tongue)).toBeCloseTo(0, 6);
  });

  test('uses one deterministic source for CPU samples and generated WGSL', () => {
    const wgsl = buildBoykisserWgsl();
    expect(geometrySignature).toMatch(/^[a-f0-9]{8}$/);
    expect(wgsl).toContain(`// geometry-signature:${geometrySignature}`);
    expect(wgsl).toContain('fn boykisserPoint(index: u32, count: u32, seed: u32) -> vec2f');
    expect(wgsl).toContain('fn boykisserRole(index: u32, count: u32, seed: u32) -> u32');
    expect(wgsl).toContain('fn boykisserCanonicalColor(role: u32) -> vec3f');
    for (const featureName of REQUIRED_FEATURES) {
      expect(wgsl).toContain(`// feature:${featureName}`);
    }
    expect(sampleBoykisser(5, 32, 12345)).toEqual(sampleBoykisserSet(32, 12345)[5]);
    expect(sampleBoykisserSet(180, 88)).toEqual(sampleBoykisserSet(180, 88));
  });
});
