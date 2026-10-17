'use strict';

// Locale-only renderer regression. Fixtures contain category names and counts, never user data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const appRoot = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(appRoot, 'plugins', 'config-import', 'ui.html'), 'utf8');
const locales = ['de', 'en', 'es', 'fr'];
const ui = locale => JSON.parse(fs.readFileSync(path.join(appRoot, 'plugins', 'config-import', 'locales', `${locale}.json`), 'utf8'))
    .plugins['config-import']['config-import'].ui;
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).find(source => source.includes('window.renderBackupExportPreview'));
assert.ok(script, 'actual Config Import preview renderer script exists');

function translator(messages) {
    return (key, values = {}) => Object.entries(values).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), messages[key.split('.').at(-1)]);
}

const categories = [
    'globalSettings', 'pluginSettings', 'profileDatabases', 'userData', 'pluginFiles', 'uploads',
    'profileScopedPluginData', 'schnorrbecherPersistentState', 'credentialsAndSessions'
];
for (const language of locales) {
    const messages = ui(language);
    const dom = new JSDOM('<!doctype html><div id="preview"></div>', { runScripts: 'outside-only' });
    dom.window.eval(script);
    const container = dom.window.document.getElementById('preview');
    dom.window.renderBackupExportPreview(container, {
        categories: Object.fromEntries(categories.map((category, index) => [category, {
            selected: index !== 3, files: index, entries: index + 1, bytes: (index + 1) * 1024
        }])),
        totals: { files: 36, entries: 45, bytes: 46080 },
        fullBackupWarning: 'synthetic warning sentinel'
    }, translator(messages), bytes => `${bytes} B`);
    const output = container.textContent;
    for (const key of [
        'exportCategoryGlobalSettings', 'exportCategoryPluginSettings', 'exportCategoryProfileDatabases',
        'exportCategoryUserData', 'exportCategoryPluginFiles', 'exportCategoryUploads',
        'exportCategoryProfileScopedPluginData', 'exportCategorySchnorrbecherState',
        'exportCategoryCredentialsSessions', 'exportCategoryNotSelected', 'fullBackupUnknownContentWarning'
    ]) assert.ok(output.includes(messages[key]), `${language} renderer includes ${key}`);
    assert.ok(output.includes(translator(messages)('plugins.config-import.config-import.ui.exportCategoryCount', { files: 0, entries: 1, bytes: '1024 B' })));
    assert.ok(output.includes(translator(messages)('plugins.config-import.config-import.ui.exportSelectionEstimate', { files: 36, entries: 45, bytes: '46080 B' })));
    assert.ok(!output.includes('synthetic warning sentinel'));

    const partial = 'This is a partial backup; categories not selected at export time are absent.';
    const legacy = 'This legacy archive has no data-scope metadata; backup completeness cannot be determined.';
    assert.equal(dom.window.localizeBackupImportWarning(partial, translator(messages)), messages.partialBackupWarning);
    assert.equal(dom.window.localizeBackupImportWarning(legacy, translator(messages)), messages.legacyBackupScopeWarning);
    assert.equal(dom.window.localizeBackupImportWarning('unrelated warning', translator(messages)), 'unrelated warning');
    dom.window.close();
}

const expectedKeys = Object.keys(ui('en')).sort();
for (const language of locales) {
    assert.deepEqual(Object.keys(ui(language)).sort(), expectedKeys, `${language} Config Import UI key parity`);
}
console.log('PASS: actual backup preview renderer, all nine categories, full/partial/legacy warnings, and Config Import locale parity for DE/EN/ES/FR. Synthetic category-only fixtures; no user data.');
