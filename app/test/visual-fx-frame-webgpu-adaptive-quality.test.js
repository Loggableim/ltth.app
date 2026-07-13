const {
  AdaptiveQualityController,
  QUALITY_PROFILES
} = require('../plugins/visual-fx-frame-webgpu/renderer/adaptive-quality');

describe('Visual FX Frame WEBGPU adaptive quality', () => {
  test('exposes the approved profile budgets', () => {
    expect(QUALITY_PROFILES).toMatchObject({
      'low-load': { maxParticles: 24000, fieldResolution: 128, bloomLevels: 2, lightningBranches: 64, minScale: 0.5 },
      'obs-safe': { maxParticles: 65536, fieldResolution: 256, bloomLevels: 3, lightningBranches: 128, minScale: 0.65 },
      'max-quality': { maxParticles: 131072, fieldResolution: 384, bloomLevels: 4, lightningBranches: 256, minScale: 0.75 }
    });
  });

  test('reduces by one step after 120 sustained slow frames', () => {
    const quality = new AdaptiveQualityController('obs-safe');
    for (let index = 0; index < 119; index += 1) quality.recordFrame(19);
    expect(quality.renderScale).toBe(1);

    quality.recordFrame(19);

    expect(quality.renderScale).toBe(0.9);
    expect(quality.budgetScale).toBe(0.9);
  });

  test('raises by one step only after cooldown and 600 stable fast frames', () => {
    const quality = new AdaptiveQualityController('obs-safe', { initialScale: 0.8 });
    for (let index = 0; index < 779; index += 1) quality.recordFrame(12);
    expect(quality.renderScale).toBe(0.8);

    quality.recordFrame(12);

    expect(quality.renderScale).toBe(0.9);
  });

  test('never crosses the selected profile floor', () => {
    const quality = new AdaptiveQualityController('max-quality');
    for (let cycle = 0; cycle < 8; cycle += 1) {
      for (let index = 0; index < 300; index += 1) quality.recordFrame(25);
    }
    expect(quality.renderScale).toBe(0.75);
  });
});
