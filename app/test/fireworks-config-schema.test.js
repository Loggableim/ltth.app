const {
  ALLOWED_SHAPES,
  DEFAULT_FIREWORKS_CONFIG,
  normalizeConfig,
  normalizeFireworkTrigger,
  normalizeFinaleRequest,
  normalizeGiftMapping
} = require('../plugins/fireworks/lib/config-schema');

describe('Fireworks config schema', () => {
  test('falls back to safe defaults when saved config is not an object', () => {
    const config = normalizeConfig('broken');

    expect(config.enabled).toBe(DEFAULT_FIREWORKS_CONFIG.enabled);
    expect(config.maxConcurrentFireworks).toBe(DEFAULT_FIREWORKS_CONFIG.maxConcurrentFireworks);
    expect(config.maxTotalParticles).toBe(DEFAULT_FIREWORKS_CONFIG.maxTotalParticles);
    expect(config.defaultShape).toBe(DEFAULT_FIREWORKS_CONFIG.defaultShape);
  });

  test('clamps performance numbers to safe streaming bounds', () => {
    const config = normalizeConfig({
      maxConcurrentFireworks: 999,
      maxTotalParticles: 99999,
      maxRocketsPerSecond: -50,
      targetFps: 240,
      minFps: 1,
      particleCount: {
        small: -10,
        medium: 99999,
        big: 120,
        massive: 5000
      }
    });

    expect(config.maxConcurrentFireworks).toBe(20);
    expect(config.maxTotalParticles).toBe(3000);
    expect(config.maxRocketsPerSecond).toBe(1);
    expect(config.targetFps).toBe(120);
    expect(config.minFps).toBe(15);
    expect(config.particleCount.small).toBe(1);
    expect(config.particleCount.medium).toBe(3000);
    expect(config.particleCount.big).toBe(120);
    expect(config.particleCount.massive).toBe(3000);
  });

  test('sanitizes shapes, colors, and active shape arrays', () => {
    const config = normalizeConfig({
      defaultShape: 'invalid',
      activeShapes: ['heart', 'invalid', 'spiral', 'heart'],
      themeColors: ['#ff0000', 'not-a-color', 'hsl(120, 100%, 50%)', 'hsl(120.5, 100%, 50%)', '#abc']
    });

    expect(config.defaultShape).toBe(DEFAULT_FIREWORKS_CONFIG.defaultShape);
    expect(config.activeShapes).toEqual(['heart', 'spiral']);
    expect(config.themeColors).toEqual(['#ff0000', 'hsl(120, 100%, 50%)', 'hsl(120.5, 100%, 50%)', '#abc']);
    expect(ALLOWED_SHAPES).toContain(config.defaultShape);
  });

  test('normalizes manual trigger payloads before emitting them', () => {
    const trigger = normalizeFireworkTrigger({
      intensity: 50,
      duration: -5,
      shape: 'not-real',
      colors: ['#00ff00', 'bad'],
      position: { x: 20, y: -4 },
      particleCount: 99999
    }, normalizeConfig());

    expect(trigger.intensity).toBe(10);
    expect(trigger.duration).toBe(250);
    expect(trigger.shape).toBe(DEFAULT_FIREWORKS_CONFIG.defaultShape);
    expect(trigger.colors).toEqual(['#00ff00']);
    expect(trigger.position).toEqual({ x: 1, y: 0 });
    expect(trigger.particleCount).toBe(DEFAULT_FIREWORKS_CONFIG.maxTotalParticles);
  });

  test('normalizes finale and gift mapping API payloads', () => {
    const finale = normalizeFinaleRequest({ intensity: 0, duration: 999999 });
    const mapping = normalizeGiftMapping({
      giftId: '../bad',
      shape: 'spiral',
      colors: ['#ffffff', 'nope'],
      intensity: 99
    });

    expect(finale).toEqual({ intensity: 0.1, duration: 30000 });
    expect(mapping).toEqual({
      giftId: '..bad',
      shape: 'spiral',
      colors: ['#ffffff'],
      intensity: 10
    });
  });
});
