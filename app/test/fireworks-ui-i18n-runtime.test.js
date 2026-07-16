'use strict';

const fs = require('fs');
const path = require('path');

describe('Fireworks settings runtime localization', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'plugins', 'fireworks', 'ui', 'settings.js'),
    'utf8'
  );

  test('refreshes computed status values after a language change', () => {
    expect(source).toContain('refreshLocalizedRuntimeState()');
    expect(source).toContain('function refreshLocalizedRuntimeState()');
  });

  test('uses stable Fireworks keys for computed connection and performance state', () => {
    expect(source).toContain("plugins.fireworks.ui.status.enabled");
    expect(source).toContain("plugins.fireworks.ui.summary.performance");
    expect(source).toContain("plugins.fireworks.ui.impact.${info.impact}");
  });

  test('uses stable localized messages for settings toasts and overlay feedback', () => {
    const engineSource = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'fireworks', 'gpu', 'engine.js'),
      'utf8'
    );

    expect(source).toContain("plugins.fireworks.ui.messages.settings_saved");
    expect(source).toContain("plugins.fireworks.ui.messages.trigger_failed");
    expect(source).toContain("plugins.fireworks.ui.messages.color_remove_hint");
    expect(engineSource).toContain("plugins.fireworks.ui.messages.overlay_frozen");
    expect(engineSource).toContain("plugins.fireworks.ui.messages.follower_thanks");
    expect(engineSource).toContain("plugins.fireworks.ui.messages.gift_coins");
  });
});
