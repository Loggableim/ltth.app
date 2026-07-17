'use strict';

const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'gcce');
const locales = ['de', 'en', 'es', 'fr'];

function read(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function getLeaf(object, key) {
  return key.split('.').reduce((value, part) => value && value[part], object);
}

describe('GCCE active UI runtime localization', () => {
  test('serves ui.html as the active GCCE surface', () => {
    const main = read('index.js');
    const ui = read('ui.html');

    expect(main).toContain("this.api.registerRoute('GET', '/gcce/ui'");
    expect(main).toContain("res.sendFile(path.join(this.pluginDir, 'ui.html'))");
    expect(ui).toContain('<script src="/js/i18n-client.js"></script>');
  });

  test('moves dynamic status, dialogs, toasts, list states and accessible controls behind runtime keys', () => {
    const source = read('ui.html');
    const directRuntimeCopy = [
      "showMessage('Failed to toggle command', 'error')",
      "showMessage('Configuration saved successfully!', 'success')",
      "showMessage('Please enter media name and URL', 'error')",
      "showMessage('Media library saved', 'success')",
      "showMessage('Failed to save media library', 'error')",
      "showMessage('Please enter test text', 'error')",
      "showMessage('All HUD elements cleared', 'success')",
      "status.textContent = 'Failed to load gift catalog'",
      "msgDiv.textContent = 'No gifts available. Click \"Load Gift Catalog\" to fetch gifts.'",
      "msgDiv.textContent = 'No gifts match your search.'",
      "showMessage('Gift rotator saved', 'success')",
      "showMessage('Overlay URL copied to clipboard', 'success')",
      "showMessage('Failed to clear cache', 'error')",
      "showMessage('Failed to load history', 'error')",
      "prompt('Enter command name to test (without /):')",
      "tbody.innerHTML = '<tr><td colspan=\"5\" style=\"text-align: center;\">No command data yet</td></tr>'"
    ];

    directRuntimeCopy.forEach((copy) => expect(source).not.toContain(copy));
    expect(source).toContain("runtimeText('status.command_enabled'");
    expect(source).toContain("runtimeText('hud.media_library_saved'");
    expect(source).toContain("runtimeText('gift_catalog.load_failed'");
    expect(source).toContain("runtimeText('dialogs.history_search_placeholder'");
    expect(source).toContain("runtimeText('accessibility.remove_media'");
    expect(source).toContain("runtimeText('accessibility.remove_rotator_entry'");
    expect(source).toContain('window.i18n?.onChange');
  });

  test('provides every used GCCE runtime key in DE, EN, ES, and FR', () => {
    const source = read('ui.html');
    const keys = [...new Set(
      [...source.matchAll(/runtimeText\('([^']+)'/g)].map((match) => match[1])
    )];

    expect(keys.length).toBeGreaterThan(35);
    locales.forEach((locale) => {
      const translation = JSON.parse(read(`locales/${locale}.json`));
      keys.forEach((key) => {
        expect(getLeaf(translation, `plugins.gcce.runtime.${key}`)).toEqual(expect.any(String));
      });
    });
  });

  test('localizes overlay command-detail labels and the rotator card fallback', () => {
    const ui = read('ui.html');
    const overlay = read('overlay.html');

    expect(overlay).not.toContain('<strong>Syntax:</strong>');
    expect(overlay).not.toContain('<strong>Permission:</strong>');
    expect(overlay).not.toContain('<strong>Plugin:</strong>');
    expect(overlay).not.toContain('Available commands: ${commandNames}');
    expect(overlay).toContain("overlayText('syntax'");
    expect(overlay).toContain("overlayText('permission'");
    expect(overlay).toContain("overlayText('plugin'");
    expect(overlay).toContain("overlayText('available_commands'");
    expect(ui).not.toContain("entry.template || 'card'");
    expect(ui).toContain("t('plugins.gcce.ui.template_card', 'Card')");

    locales.forEach((locale) => {
      const translation = JSON.parse(read(`locales/${locale}.json`));
      ['syntax', 'permission', 'plugin', 'available_commands'].forEach((key) => {
        expect(getLeaf(translation, `plugins.gcce.runtime.overlay.${key}`)).toEqual(expect.any(String));
      });
      expect(getLeaf(translation, 'plugins.gcce.ui.template_card')).toEqual(expect.any(String));
    });
  });
});
