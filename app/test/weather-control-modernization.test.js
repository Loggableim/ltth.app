const fs = require('fs');
const path = require('path');

describe('Weather Control modernization', () => {
  const pluginDir = path.join(__dirname, '../plugins/weather-control');
  const mainPath = path.join(pluginDir, 'main.js');
  const enginePath = path.join(pluginDir, 'weather-engine.js');
  const overlayPath = path.join(pluginDir, 'overlay.html');
  const uiPath = path.join(pluginDir, 'ui.html');
  const manifestPath = path.join(pluginDir, 'plugin.json');
  const readmePath = path.join(pluginDir, 'README.md');

  let main;
  let engine;
  let overlay;
  let ui;
  let manifest;
  let readme;

  beforeAll(() => {
    main = fs.readFileSync(mainPath, 'utf8');
    engine = fs.readFileSync(enginePath, 'utf8');
    overlay = fs.readFileSync(overlayPath, 'utf8');
    ui = fs.readFileSync(uiPath, 'utf8');
    manifest = fs.readFileSync(manifestPath, 'utf8');
    readme = fs.readFileSync(readmePath, 'utf8');
  });

  test('documents all thirteen supported effects', () => {
    const expectedEffects = [
      'rain',
      'snow',
      'storm',
      'fog',
      'thunder',
      'sunbeam',
      'glitchclouds',
      'aurora',
      'fireflies',
      'meteors',
      'sakura',
      'embers',
      'heatwave'
    ];

    expectedEffects.forEach((effect) => {
      expect(manifest).toContain(effect);
      expect(readme).toContain(effect);
      expect(main).toContain(`'${effect}'`);
    });
  });

  test('overlay uses the shared weather engine instead of duplicating effect code', () => {
    expect(overlay).toContain('/plugins/weather-control/weather-engine.js');
    expect(overlay).toContain('new window.WeatherEngine');
    expect(overlay).not.toContain('function generateSnowflakeVariants');
    expect(overlay).not.toContain('class Particle');
  });

  test('backend exposes config fields and endpoints for the requested expansion', () => {
    expect(main).toContain('qualityPreset');
    expect(main).toContain('adaptiveQuality');
    expect(main).toContain('effectLayerOrder');
    expect(main).toContain('audio');
    expect(main).toContain('triggerEvents');
    expect(main).toContain('sequences');
    expect(main).toContain("'/api/weather/stop'");
    expect(main).toContain("'/api/weather/sequence/trigger'");
  });

  test('engine supports quality switching, layers, advanced options and heatwave', () => {
    expect(engine).toContain('setQuality(level');
    expect(engine).toContain('sortEffectsForRender');
    expect(engine).toContain('particleScale');
    expect(engine).toContain('directionDeg');
    expect(engine).toContain("type === 'heatwave'");
    expect(engine).toContain('drawHeatwave(effect)');
  });

  test('particle-based ambient effects keep their parent effect context', () => {
    ['fireflies', 'sakura', 'embers'].forEach((effectName) => {
      const acquireBlock = engine.match(new RegExp(`this\\.pools\\.${effectName}\\.acquire\\(\\{[\\s\\S]{0,300}?\\}\\)`));
      expect(acquireBlock).toBeTruthy();
      expect(acquireBlock[0]).toContain('parentEffect: effect');
    });
  });

  test('sunbeam rendering uses soft volumetric light without lens flare artifacts', () => {
    expect(engine).toContain('drawSoftSunbeams(effect)');
    expect(engine).toContain('drawAmbientLightHaze(effect)');
    expect(engine).not.toContain('this.drawLensFlare(effect)');
  });

  test('UI exposes compact controls for presets, sequences, active effects, import/export, audio, triggers and filtering', () => {
    expect(ui).toContain('effectSearch');
    expect(ui).toContain('effectCategoryFilter');
    expect(ui).toContain('presetSelect');
    expect(ui).toContain('sequenceSteps');
    expect(ui).toContain('activeEffectsList');
    expect(ui).toContain('exportConfigBtn');
    expect(ui).toContain('importConfigInput');
    expect(ui).toContain('audioEnabled');
    expect(ui).toContain('trigger-follow-enabled');
    expect(ui).toContain('effect-heatwave-enabled');
  });

  test('UI copies the OBS overlay URL with Clipboard API and fallback selection', () => {
    expect(ui).toContain('navigator.clipboard.writeText');
    expect(ui).toContain('copyWithSelectionFallback(input)');
    expect(ui).toContain('input.removeAttribute(\'readonly\')');
    expect(ui).toContain('input.setSelectionRange(0, input.value.length)');
  });
});
