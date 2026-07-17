'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const pluginRoot = path.join(repoRoot, 'app', 'plugins', 'osc-bridge');
const locales = ['de', 'en', 'es', 'fr'];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function getLeaf(object, key) {
  return key.split('.').reduce((value, part) => value && value[part], object);
}

describe('OSC-Bridge active runtime localization', () => {
  test('serves the settings surface that loads the shared OSC-Bridge UI runtime', () => {
    const main = read('app/plugins/osc-bridge/main.js');
    const markup = read('app/plugins/osc-bridge/ui.html');

    expect(main).toContain("this.api.registerRoute('GET', '/osc-bridge/ui'");
    expect(main).toContain("res.sendFile(path.join(this.api.getPluginDir(), 'ui.html'))");
    expect(markup).toContain('<script src="/js/osc-bridge-ui.js"></script>');
    expect(markup).toContain('<script src="/js/i18n-client.js"></script>');
  });

  test('moves runtime status, dialogs, alerts, loading states, empty states, and accessible actions behind i18n keys', () => {
    const source = read('app/public/js/osc-bridge-ui.js');
    const directRuntimeCopy = [
      "statusText.textContent = 'Aktiv'",
      "statusText.textContent = 'Startet...'",
      "alert('Konfiguration gespeichert!')",
      "alert('Chat command settings saved!')",
      "alert('Preset gespeichert!')",
      "confirm('Preset löschen?')",
      "tbody.innerHTML = '<tr><td colspan=\"5\" class=\"empty-state\">No gift mappings configured yet. Add one below.</td></tr>'",
      "tbody.innerHTML = '<tr><td colspan=\"4\" class=\"empty-state\">No avatars configured yet. Add one below.</td></tr>'",
      "tbody.innerHTML = '<tr><td colspan=\"6\" class=\"empty-state\">No commands configured yet.</td></tr>'",
      "alert('Please enter both Avatar Name and Avatar ID')",
      "alert('Cannot remove predefined commands. You can disable them instead.')",
      "refreshBtn.textContent = '⏳ Loading...'",
      "btn.textContent = '🔄 Aktualisiere...'",
      "const typeLabel = cmd.actionType === 'predefined' ? 'Predefined' : 'Custom'"
    ];

    directRuntimeCopy.forEach((copy) => expect(source).not.toContain(copy));
    expect(source).toContain("translateOscBridge('runtime.ui.status.running'");
    expect(source).toContain("translateOscBridge('runtime.ui.dialogs.remove_command'");
    expect(source).toContain("translateOscBridge('runtime.ui.empty.gift_mappings'");
    expect(source).toContain("translateOscBridge('runtime.ui.accessibility.remove_avatar'");
    expect(source).toContain('window.i18n?.onChange');
  });

  test('provides every used OSC-Bridge runtime UI key in DE, EN, ES, and FR', () => {
    const source = read('app/public/js/osc-bridge-ui.js');
    const keys = [...new Set(
      [...source.matchAll(/translateOscBridge\('([^']+)'/g)]
        .map((match) => match[1])
        .filter((key) => key.startsWith('runtime.ui.'))
    )];

    expect(keys.length).toBeGreaterThan(45);
    locales.forEach((locale) => {
      const translations = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8'));
      keys.forEach((key) => {
        expect(getLeaf(translations, `plugins.osc-bridge.osc_bridge.${key}`)).toEqual(expect.any(String));
      });
    });
  });
});
