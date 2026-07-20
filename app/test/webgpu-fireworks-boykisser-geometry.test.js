'use strict';

const {
  BOYKISSER_FEATURES,
  BOYKISSER_ROLES,
  BOYKISSER_COLORS,
  BOYKISSER_VECTOR,
  sampleBoykisser,
  sampleBoykisserSet,
  buildBoykisserWgsl,
  geometrySignature,
} = require('../plugins/webgpu-fireworks/gpu/boykisser-geometry');

const REQUIRED_FEATURES = [
  'outer-silhouette',
  'forehead-tuft',
  'left-long-eye',
  'right-long-eye',
  'centered-nose',
  'omega-mouth',
  'left-zigzag-cheek',
  'right-zigzag-cheek',
];

const featureCenterX = feature => feature.points
  .reduce((sum, [x]) => sum + x, 0) / feature.points.length;

describe('WebGPU Fireworks semantic Boykisser geometry', () => {
  test('defines every approved landmark with an explicit semantic color role', () => {
    expect(Object.keys(BOYKISSER_FEATURES)).toEqual(REQUIRED_FEATURES);
    expect(BOYKISSER_ROLES).toEqual({ HEAD: 0, FACE: 1, ACCENT: 2 });
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
      FACE: [0, 0, 0],
      ACCENT: [1, 0, 0],
    });
    expect(BOYKISSER_FEATURES).not.toHaveProperty('tongue');
    expect(BOYKISSER_FEATURES).not.toHaveProperty('left-inner-ear');
    expect(BOYKISSER_FEATURES).not.toHaveProperty('left-crescent-eye');
    expect(BOYKISSER_VECTOR).toMatchObject({
      aspectRatio: 2452 / 3259,
      silhouette: expect.any(Array),
      blackFills: expect.any(Array),
      blackStrokes: expect.any(Array),
      redStrokes: expect.any(Array),
    });
    expect(BOYKISSER_VECTOR.silhouette.length).toBeGreaterThanOrEqual(30);
    expect(BOYKISSER_VECTOR.blackFills.length).toBeGreaterThanOrEqual(3);
    expect(BOYKISSER_VECTOR.redStrokes).toHaveLength(2);
  });

  test.each([8, 16, 32])('retains every landmark at low density %i', count => {
    const samples = sampleBoykisserSet(count, 12345);
    expect(samples).toHaveLength(count);
    expect(new Set(samples.map(sample => sample.feature))).toEqual(new Set(REQUIRED_FEATURES));
  });

  test('preserves the reference asymmetry while keeping the face balanced', () => {
    const features = BOYKISSER_FEATURES;
    expect(featureCenterX(features['left-long-eye'])).toBeLessThan(-0.3);
    expect(featureCenterX(features['right-long-eye'])).toBeGreaterThan(0.25);
    expect(featureCenterX(features['left-zigzag-cheek'])).toBeLessThan(-0.5);
    expect(featureCenterX(features['right-zigzag-cheek'])).toBeGreaterThan(0.4);
    expect(Math.abs(featureCenterX(features['centered-nose']))).toBeLessThan(0.1);
    expect(Math.abs(featureCenterX(features['omega-mouth']))).toBeLessThan(0.05);
  });

  test('uses one deterministic source for CPU samples and generated WGSL', () => {
    const wgsl = buildBoykisserWgsl();
    expect(geometrySignature).toMatch(/^[a-f0-9]{8}$/);
    expect(wgsl).toContain(`// geometry-signature:${geometrySignature}`);
    expect(wgsl).toContain('fn boykisserPoint(index: u32, count: u32, seed: u32) -> vec2f');
    expect(wgsl).toContain('fn boykisserRole(index: u32, count: u32, seed: u32) -> u32');
    expect(wgsl).toContain('fn boykisserCanonicalColor(role: u32) -> vec3f');
    expect(wgsl).toContain('fn boykisserVectorColor(uv: vec2f) -> vec4f');
    expect(wgsl).toContain('fn boykisserSilhouetteContains(point: vec2f) -> bool');
    expect(wgsl).toContain('fn boykisserBlackCoverage(point: vec2f) -> f32');
    expect(wgsl).toContain('fn boykisserRedCoverage(point: vec2f) -> f32');
    for (const featureName of REQUIRED_FEATURES) {
      expect(wgsl).toContain(`// feature:${featureName}`);
    }
    expect(sampleBoykisser(5, 32, 12345)).toEqual(sampleBoykisserSet(32, 12345)[5]);
    expect(sampleBoykisserSet(180, 88)).toEqual(sampleBoykisserSet(180, 88));
  });
});
