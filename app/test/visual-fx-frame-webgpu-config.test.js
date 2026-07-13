const {
  DEFAULT_WEBGPU_CONFIG,
  normalizeConfig,
  normalizeImportedFlameConfig
} = require('../plugins/visual-fx-frame-webgpu/lib/config-schema');

describe('Visual FX Frame WEBGPU configuration', () => {
  test('forces WebGPU and defaults to hybrid OBS-safe rendering', () => {
    expect(normalizeConfig({ renderer: 'webgl', visualStyle: 'invalid' })).toMatchObject({
      renderer: 'webgpu',
      visualStyle: 'hybrid',
      qualityMode: 'obs-safe',
      visualProfileVersion: 4
    });
    expect(DEFAULT_WEBGPU_CONFIG.renderer).toBe('webgpu');
  });

  test.each(['realistic', 'neon', 'hybrid'])('accepts the %s visual style', visualStyle => {
    expect(normalizeConfig({ visualStyle }).visualStyle).toBe(visualStyle);
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
      visualProfileVersion: 4
    });
    expect(imported).not.toHaveProperty('unknownSecret');
  });
});
