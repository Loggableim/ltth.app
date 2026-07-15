'use strict';

const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'openshock');
const locales = ['de', 'en', 'es', 'fr'];
const runtimeKeys = [
  'placeholders.api_key_configured',
  'placeholders.api_key',
  'connection.connected',
  'connection.disconnected',
  'connection.online',
  'connection.offline',
  'mapping.dialog_edit',
  'mapping.dialog_add',
  'pattern.dialog_edit',
  'pattern.dialog_create',
  'safety.emergency_stop_activated',
  'safety.emergency_stop_cleared',
  'queue.paused',
  'queue.resumed',
  'queue.cleared',
  'errors.load_data',
  'accessibility.delete_share_code',
  'accessibility.test_vibrate',
  'accessibility.test_shock',
  'accessibility.test_sound',
  'pattern.move_up',
  'pattern.move_down',
  'pattern.duplicate_step',
  'pattern.edit_step',
  'pattern.delete_step'
];

function read(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function getLeaf(object, key) {
  return key.split('.').reduce((value, part) => value && value[part], object);
}

describe('OpenShock active UI runtime localization', () => {
  test('serves ui.html and ui.js as the active UI instead of the legacy duplicate', () => {
    const main = read('main.js');
    const uiHtml = read('ui.html');

    expect(main).toContain("this.api.registerRoute('get', '/openshock/ui'");
    expect(main).toContain("res.sendFile(path.join(pluginDir, 'ui.html'))");
    expect(uiHtml).toContain('<script src="/openshock/ui.js"></script>');
    expect(uiHtml).not.toContain('<script src="/openshock/openshock.js"></script>');
    expect(uiHtml).toContain('data-i18n-placeholder="plugins.openshock.runtime.placeholders.api_key"');
    expect(uiHtml).toContain('data-i18n-placeholder="plugins.openshock.runtime.placeholders.pishock_api_key"');
  });

  test('moves safety, connection, mapping, pattern, queue, status, placeholder and accessible runtime copy behind runtime keys', () => {
    const source = read('ui.js');
    const directRuntimeCopy = [
      "showNotification('EMERGENCY STOP ACTIVATED!'",
      "showNotification('Error loading Hybrid Shock data'",
      "apiKeyInput.placeholder = 'Enter your OpenShock API key'",
      "badge.innerHTML = '<i class=\"fas fa-check-circle\"></i> Connected'",
      "modalTitle.textContent = isEdit ? 'Edit Event Mapping' : 'Add Event Mapping'",
      "modalTitle.textContent = isEdit ? 'Edit Pattern' : 'Create New Pattern'",
      "showNotification('Queue paused'",
      "showNotification('Queue resumed'",
      "showNotification('Queue cleared successfully'",
      'deleteBtn.setAttribute(\'aria-label\', `Delete ShareCode ${sc.code}`)',
      'title="Test Vibrate"',
      'title="Test Shock"',
      'title="Test Sound"',
      'title="Nach oben"',
      'title="Nach unten"',
      'title="Duplizieren"',
      'title="Bearbeiten"',
      'title="Löschen"'
    ];

    directRuntimeCopy.forEach((copy) => expect(source).not.toContain(copy));
    expect(source).toContain("runtimeText('safety.emergency_stop_activated'");
    expect(source).toContain("runtimeText('mapping.dialog_edit'");
    expect(source).toContain("runtimeText('pattern.dialog_create'");
    expect(source).toContain("setRuntimeAttribute(deleteBtn, 'aria-label', 'accessibility.delete_share_code'");
    expect(source).toContain("runtimeText('accessibility.test_vibrate'");
    expect(source).toContain("runtimeText('pattern.move_up'");
    expect(source).toContain('window.i18n?.ready');
    expect(source).toContain('window.i18n.onChange(rerenderRuntimeCopy)');
    expect(source).toContain('window.i18n.onLanguageChange(rerenderRuntimeCopy)');
    expect(source).toContain('window.i18n.ready.then(rerenderRuntimeCopy)');
    expect(source).not.toContain('await window.i18n.ready');
  });

  test('provides every audited runtime key in DE, EN, ES, and FR', () => {
    const source = read('ui.js');
    const sourceRuntimeKeys = [...source.matchAll(/runtimeText\('([^']+)'/g)].map((match) => match[1]);
    const uniqueRuntimeKeys = [...new Set([...runtimeKeys, ...sourceRuntimeKeys])];

    locales.forEach((locale) => {
      const translation = JSON.parse(read(`locales/${locale}.json`));
      uniqueRuntimeKeys.forEach((key) => {
        expect(getLeaf(translation, `plugins.openshock.runtime.${key}`)).toEqual(expect.any(String));
      });
    });
  });
});
