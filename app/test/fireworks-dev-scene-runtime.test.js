const fs = require('fs');
const path = require('path');

describe('Fireworks Dev Scene Runtime', () => {
  let fxGraphJs;
  let sceneDirectorJs;
  let encounterControllerJs;
  let performanceScalerJs;
  let themeManagerJs;
  let audioDirectorJs;
  let runtimeBootstrapJs;
  let webglSceneJs;

  beforeAll(() => {
    const gpuDir = path.join(__dirname, '..', 'plugins', 'fireworks-dev', 'gpu');
    fxGraphJs = fs.readFileSync(path.join(gpuDir, 'fx-graph.js'), 'utf8');
    sceneDirectorJs = fs.readFileSync(path.join(gpuDir, 'scene-director.js'), 'utf8');
    encounterControllerJs = fs.readFileSync(path.join(gpuDir, 'encounter-controller.js'), 'utf8');
    performanceScalerJs = fs.readFileSync(path.join(gpuDir, 'performance-scaler.js'), 'utf8');
    themeManagerJs = fs.readFileSync(path.join(gpuDir, 'theme-manager.js'), 'utf8');
    audioDirectorJs = fs.readFileSync(path.join(gpuDir, 'audio-director.js'), 'utf8');
    runtimeBootstrapJs = fs.readFileSync(path.join(gpuDir, 'runtime-bootstrap.js'), 'utf8');
    webglSceneJs = fs.readFileSync(path.join(gpuDir, 'webgl-scene.js'), 'utf8');
  });

  test('supports patterned bossfight attack choreography', () => {
    expect(fxGraphJs).toContain('buildPattern(');
    expect(fxGraphJs).toContain('generatePatternPoints(');
    expect(fxGraphJs).toContain("return 'crossfire'");
    expect(fxGraphJs).toContain("return 'nova'");
    expect(fxGraphJs).toContain("return 'paw-burst'");
    expect(fxGraphJs).toContain('queueSecondaryBurst(');
    expect(fxGraphJs).toContain('spawnLegacyShapeEffect(');
  });

  test('tracks encounter phases and richer attack classes', () => {
    expect(encounterControllerJs).toContain('phaseIndex');
    expect(encounterControllerJs).toContain("return 'cataclysm'");
    expect(encounterControllerJs).toContain('patternLabel');
    expect(encounterControllerJs).toContain('phaseLabel: `Phase ${this.phaseIndex}`');
  });

  test('applies adaptive render budgets and parallax strength by profile', () => {
    expect(performanceScalerJs).toContain('actorCap');
    expect(performanceScalerJs).toContain('secondaryBurstFactor');
    expect(performanceScalerJs).toContain('parallaxStrength');
    expect(performanceScalerJs).toContain("--parallax-strength");
  });

  test('wires theme skinning and combat telemetry into the scene director', () => {
    expect(themeManagerJs).toContain('hudShell');
    expect(themeManagerJs).toContain("this.rootEl.dataset.theme");
    expect(themeManagerJs).toContain('setBackdropOpacity(');
    expect(themeManagerJs).toContain('setLayerConfig(');
    expect(sceneDirectorJs).toContain('pickProfile(');
    expect(sceneDirectorJs).toContain('Cataclysm barrage');
    expect(sceneDirectorJs).toContain("if (typeof this.fxGraph.configure === 'function')");
    expect(sceneDirectorJs).toContain("this.hudController.updateEncounter(");
  });

  test('boots a visible WebGL2 scene renderer instead of a hidden capability gate only', () => {
    expect(runtimeBootstrapJs).toContain("document.getElementById('fireworks-dev-webgl-scene')");
    expect(runtimeBootstrapJs).toContain('new window.FireworksDevWebGLSceneRenderer(sceneCanvas)');
    expect(runtimeBootstrapJs).toContain("query.get('benchmark') === 'true'");
    expect(sceneDirectorJs).toContain('this.webglScene.render(now)');
    expect(sceneDirectorJs).toContain('this.webglScene.pulseImpact(');
  });

  test('uses shader-based arena rendering with theme and encounter uniforms', () => {
    expect(webglSceneJs).toContain('#version 300 es');
    expect(webglSceneJs).toContain('uPrimary');
    expect(webglSceneJs).toContain('uEnergy');
    expect(webglSceneJs).toContain('uImpact');
    expect(webglSceneJs).toContain('gl.drawArrays(gl.TRIANGLES, 0, 3)');
    expect(webglSceneJs).toContain('options.backdropOpacity');
  });

  test('guards benchmark audio and overlapping playback pressure', () => {
    expect(audioDirectorJs).toContain('this.activePlayers');
    expect(audioDirectorJs).toContain('this.benchmarkMode');
    expect(audioDirectorJs).toContain('this.maxSimultaneousSounds');
    expect(audioDirectorJs).toContain('this.benchmarkMuteAudio');
  });

  test('restores legacy-style special effects on top of bossfight rendering', () => {
    expect(fxGraphJs).toContain('giftVisualMappings');
    expect(fxGraphJs).toContain('finalePatternProfiles');
    expect(fxGraphJs).toContain('resolveConfiguredGiftEffectProfile(');
    expect(fxGraphJs).toContain('showGiftPopup(');
    expect(fxGraphJs).toContain('launchGiftRocket(');
    expect(fxGraphJs).toContain('resolveGiftRocketProfile(');
    expect(fxGraphJs).toContain('resolveGiftEffectProfile(');
    expect(fxGraphJs).toContain('resolveFinaleProfile(');
    expect(fxGraphJs).toContain("payload.shape === 'double-ring'");
    expect(fxGraphJs).toContain("pattern === 'double-ring'");
    expect(fxGraphJs).toContain("variant: 'dart'");
    expect(fxGraphJs).toContain("variant: 'flare'");
    expect(fxGraphJs).toContain("variant: 'comet'");
    expect(fxGraphJs).toContain("variant: 'siege'");
    expect(fxGraphJs).toContain("finalePattern: payload.finalePattern || giftProfile.finalePattern || configuredPatterns.big || 'crown-arc'");
    expect(fxGraphJs).toContain("finalePattern: 'rose-garden'");
    expect(fxGraphJs).toContain("finalePattern: 'heart-cascade'");
    expect(fxGraphJs).toContain("finalePattern: 'money-fan'");
    expect(fxGraphJs).toContain("finalePattern: 'galaxy-helix'");
    expect(fxGraphJs).toContain("finalePattern: 'siege-crown'");
    expect(fxGraphJs).toContain('resolvePalette(');
    expect(fxGraphJs).toContain('extractPaletteFromImage(');
    expect(fxGraphJs).toContain('loadImage(');
    expect(fxGraphJs).toContain("particle.renderAs = 'image'");
    expect(fxGraphJs).toContain("particle.renderAs = 'heart'");
    expect(fxGraphJs).toContain("particle.renderAs = 'paw'");
    expect(fxGraphJs).toContain('spawnHeartVolley(');
    expect(fxGraphJs).toContain('spawnPawVolley(');
    expect(fxGraphJs).toContain('spawnSecondaryMiniBurst(');
    expect(fxGraphJs).toContain('spawnSecondarySpiralBurst(');
    expect(fxGraphJs).toContain('payload.shapes');
  });
});
