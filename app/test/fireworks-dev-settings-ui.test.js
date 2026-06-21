const fs = require('fs');
const path = require('path');

describe('Fireworks Dev Settings UI', () => {
  let settingsHtml;
  let settingsJs;

  beforeAll(() => {
    settingsHtml = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'fireworks-dev', 'ui', 'settings.html'),
      'utf8'
    );
    settingsJs = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'fireworks-dev', 'ui', 'settings.js'),
      'utf8'
    );
  });

  test('offers curated bossfight theme selection', () => {
    expect(settingsHtml).toContain('id="dev-theme"');
    expect(settingsHtml).toContain('value="inferno-siege"');
    expect(settingsHtml).toContain('value="neon-reactor"');
    expect(settingsHtml).toContain('value="celestial-titan"');
  });

  test('offers encounter and quality selectors', () => {
    expect(settingsHtml).toContain('id="encounter-mode"');
    expect(settingsHtml).toContain('id="quality-profile"');
    expect(settingsHtml).toContain('value="skirmish"');
    expect(settingsHtml).toContain('value="raid"');
    expect(settingsHtml).toContain('value="finale"');
    expect(settingsHtml).toContain('value="ultra"');
  });

  test('supports a dual-layer streamer/pro mode UI', () => {
    expect(settingsHtml).toContain('id="pro-mode-toggle"');
    expect(settingsHtml).toContain('data-panel-mode="pro"');
    expect(settingsJs).toContain('toggleModePanels(');
    expect(settingsJs).toContain('config.proMode');
  });

  test('exposes benchmark audio mute and editable backdrop layer controls', () => {
    expect(settingsHtml).toContain('id="benchmark-audio-toggle"');
    expect(settingsHtml).toContain('id="scene-backdrop-opacity"');
    expect(settingsHtml).toContain('id="scene-layer-sky-toggle"');
    expect(settingsHtml).toContain('id="scene-layer-grid-opacity"');
    expect(settingsHtml).toContain('id="scene-layer-fog-opacity"');
    expect(settingsJs).toContain('config.benchmarkMuteAudio');
    expect(settingsJs).toContain('config.sceneBackdropOpacity');
    expect(settingsJs).toContain('config.sceneLayerVisibility');
    expect(settingsJs).toContain('config.sceneLayerOpacity');
  });

  test('supports config-driven finale and gift mapping editors plus benchmark parity scenes', () => {
    expect(settingsHtml).toContain('id="test-shape-double-ring-btn"');
    expect(settingsHtml).toContain('id="finale-pattern-profiles"');
    expect(settingsHtml).toContain('id="gift-visual-mappings"');
    expect(settingsJs).toContain("updateJsonEditor('finale-pattern-profiles'");
    expect(settingsJs).toContain("updateJsonEditor('gift-visual-mappings'");
    expect(settingsJs).toContain("setupJsonTextarea('finale-pattern-profiles'");
    expect(settingsJs).toContain("setupJsonTextarea('gift-visual-mappings'");
    expect(settingsJs).toContain("shape: 'double-ring'");
    expect(settingsJs).toContain("giftName: 'Corgi'");
  });

  test('sends dev scene payload fields during manual tests', () => {
    expect(settingsJs).toContain('theme: config.theme');
    expect(settingsJs).toContain('encounterMode: config.encounterMode');
    expect(settingsJs).toContain('qualityProfile: config.qualityProfile');
    expect(settingsJs).toContain('hudLabel:');
  });
});
