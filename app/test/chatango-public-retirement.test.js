'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
test('Chatango has no active feature page, website mapping or maintenance command', () => {
  expect(fs.existsSync(path.join(root, 'features', 'plugin-chatango.html'))).toBe(false);
  expect(fs.readFileSync(path.join(root, 'plugins.html'), 'utf8')).not.toMatch(/chatango/i);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  expect(pkg.scripts['plugin:chatango:i18n']).toBeUndefined();
  const store = JSON.parse(fs.readFileSync(path.join(root, 'plugin-store.json'), 'utf8'));
  expect(store.plugins.some(p => p.id === 'chatango')).toBe(false);
});
test('current user wiki no longer offers Chatango integration or its removed API', () => {
  for (const locale of ['', 'de', 'en', 'es', 'fr']) {
    for (const name of ['Plugin-Liste.md', 'Plugin-Dokumentation.md']) {
      const file = path.join(root, 'app', 'wiki', locale, name);
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/chatango/i);
    }
  }
});
test('retirement keeps historical state protection and genuine removal regressions', () => {
  const loader = fs.readFileSync(path.join(root, 'app', 'modules', 'plugin-loader.js'), 'utf8');
  const retirement = fs.readFileSync(path.join(root, 'app', 'modules', 'plugin-retirement.js'), 'utf8');
  expect(loader).toMatch(/isRetiredPluginId\(pluginId\)/);
  expect(retirement).toMatch(/RETIRED_PLUGIN_IDS = new Set\(\['chatango'\]\)/);
  expect(fs.existsSync(path.join(__dirname, 'chatango-backend-removal.test.js'))).toBe(true);
  expect(fs.existsSync(path.join(__dirname, 'chatango-frontend-removal.test.js'))).toBe(true);
});
