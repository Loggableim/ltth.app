const {
  DEFAULT_WEBGPU_CONFIG,
  normalizeConfig,
  normalizeImportedFlameConfig
} = require('../../plugin-store/sources/visual-fx-frame-webgpu/lib/config-schema');

describe('Visual FX Frame WEBGPU configuration', () => {
  test('forces WebGPU and defaults to hybrid OBS-safe rendering', () => {
    expect(normalizeConfig({ renderer: 'webgl', visualStyle: 'invalid' })).toMatchObject({
      renderer: 'webgpu',
      visualStyle: 'hybrid',
      qualityMode: 'obs-safe',
      visualVariant: 'custom',
      visualProfileVersion: 5
    });
    expect(DEFAULT_WEBGPU_CONFIG.renderer).toBe('webgpu');
  });

  test.each(['realistic', 'neon', 'hybrid'])('accepts the %s visual style', visualStyle => {
    expect(normalizeConfig({ visualStyle }).visualStyle).toBe(visualStyle);
  });

  test.each(['classic', 'organic', 'double', 'segmented', 'portal'])('accepts the %s frame style', frameStyle => {
    expect(normalizeConfig({ frameStyle }).frameStyle).toBe(frameStyle);
  });

  test.each(['breathe', 'heartbeat', 'ripple'])('accepts the %s pulse pattern', pulsePattern => {
    expect(normalizeConfig({ pulsePattern }).pulsePattern).toBe(pulsePattern);
  });

  test('normalizes the new visual controls and preserves migrated looks as custom', () => {
    expect(normalizeConfig({
      visualProfileVersion: 4,
      frameThickness: 1,
      frameGap: 150,
      segmentCount: 2,
      secondaryColor: '#12ABef',
      flameColor: '#123456'
    })).toMatchObject({
      visualVariant: 'custom',
      visualProfileVersion: 5,
      frameThickness: 5,
      frameGap: 100,
      segmentCount: 4,
      secondaryColor: '#12abef',
      flameColor: '#123456'
    });
  });

  test('imports compatible flame settings without preserving unknown fields', () => {
    const imported = normalizeImportedFlameConfig({
      effectType: 'lightning',
      frameMode: 'all',
      flameColor: '#12abef',
      qualityMode: 'max-quality',
      renderer: 'webgl',
      unknownSecret: 'discard-me'
    });

    expect(imported).toMatchObject({
      effectType: 'lightning',
      frameMode: 'all',
      flameColor: '#12abef',
      qualityMode: 'max-quality',
      renderer: 'webgpu',
      visualStyle: 'hybrid',
      visualVariant: 'custom',
      visualProfileVersion: 5
    });
    expect(imported).not.toHaveProperty('unknownSecret');
  });
});
