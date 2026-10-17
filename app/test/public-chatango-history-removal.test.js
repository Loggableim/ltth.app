'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const publicHistoryFiles = [
  'changelog.html',
  'version.json',
  'locales/de.json',
  'locales/en.json',
  'locales/es.json',
  'locales/fr.json'
];

describe('public Chatango history removal', () => {
  test('removes old Chatango release prose from Pages changelog and metadata sources', () => {
    for (const relativePath of publicHistoryFiles) {
      expect(fs.readFileSync(path.join(root, relativePath), 'utf8')).not.toMatch(/chatango/i);
    }

    const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
    expect(JSON.stringify(version)).not.toMatch(/chatango/i);
  });

  test('retired-plugin protections remain available to the app and install validators', () => {
    const retirePolicy = fs.readFileSync(path.join(root, 'app', 'modules', 'plugin-retirement.js'), 'utf8');
    const nodeInstaller = fs.readFileSync(path.join(root, 'install', 'install.js'), 'utf8');
    const powershellInstaller = fs.readFileSync(path.join(root, 'install', 'install.ps1'), 'utf8');
    const backendRegression = fs.readFileSync(path.join(root, 'app', 'test', 'chatango-backend-removal.test.js'), 'utf8');

    expect(retirePolicy).toMatch(/RETIRED_PLUGIN_IDS.*chatango/s);
    expect(nodeInstaller).toMatch(/blocked\s*=\s*new Set\(\['chatango'\]\)/);
    expect(powershellInstaller).toMatch(/blockedIds -notcontains 'chatango'/);
    expect(backendRegression).toMatch(/preserves saved Chatango preferences/);
  });
});
