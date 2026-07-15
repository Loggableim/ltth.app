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
});
