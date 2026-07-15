'use strict';

const fs = require('fs');
const path = require('path');

describe('AnimazingPal settings UI localization', () => {
  const pluginRoot = path.join(__dirname, '..', 'plugins', 'animazingpal');
  const source = fs.readFileSync(
    path.join(pluginRoot, 'ui.js'),
    'utf8'
  );
  const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
  const runtimeKeys = [
    'plugins.animazingpal.runtime.connection.connect',
    'plugins.animazingpal.runtime.empty.no_data',
    'plugins.animazingpal.runtime.mapping.gift_catalog_prompt',
    'plugins.animazingpal.runtime.mapping.save_failed',
    'plugins.animazingpal.runtime.memory.archive_confirm',
    'plugins.animazingpal.runtime.persona.delete_confirm',
    'plugins.animazingpal.runtime.audio.enable',
    'plugins.animazingpal.runtime.toast.backend_error',
    'plugins.animazingpal.runtime.aria.memory_search',
    'plugins.animazingpal.runtime.placeholder.memory_search'
  ];

  test('initializes the i18n client before loading live UI state', () => {
    expect(source).toContain('await window.i18n.init()');
    expect(source).toContain('window.i18n.updateDOM()');
  });

  test('translates dynamic connection-state labels through stable plugin keys', () => {
    expect(source).toContain("translateRuntime('connection.connected'");
    expect(source).toContain("translateRuntime('connection.disconnected'");
    expect(source).toContain("translateRuntime('connection.disconnect'");
  });

  test('routes runtime dialogs, feedback, empty states, and accessible names through stable keys', () => {
    expect(source).toContain('function translateRuntime(key, fallback, params = {})');
    expect(source).toContain("translateRuntime('connection.connect'");
    expect(source).toContain("runtimeEmptyMarkup('empty.no_data'");
    expect(source).toContain("translateRuntime('mapping.gift_catalog_prompt'");
    expect(source).toMatch(/translateRuntime\(\s*'mapping\.save_failed'/);
    expect(source).toContain("translateRuntime('memory.archive_confirm'");
    expect(source).toContain("'persona.delete_confirm'");
    expect(source).toContain("translateRuntime('toast.backend_error'");
    expect(source).toContain("translateRuntime('audio.enable'");
    expect(html).toContain('data-i18n-aria-label="plugins.animazingpal.runtime.aria.memory_search"');
    expect(html).toContain('data-i18n-placeholder="plugins.animazingpal.runtime.placeholder.memory_search"');
  });

  test.each(['de', 'en', 'es', 'fr'])('provides the runtime i18n keys in %s', (locale) => {
    const translations = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8'));
    const get = (key) => key.split('.').reduce((value, part) => value && value[part], translations);

    for (const key of runtimeKeys) {
      expect(get(key)).toEqual(expect.any(String));
      expect(get(key)).not.toBe('');
    }
  });
});
