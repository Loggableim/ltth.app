'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const uiPath = path.join(root, 'plugins', 'config-import', 'ui.html');
const localeDir = path.join(root, 'plugins', 'config-import', 'locales');
const i18nClientPath = path.join(root, 'public', 'js', 'i18n-client.js');
const locales = ['de', 'en', 'es', 'fr'];
const uiNamespace = 'plugins.config-import.config-import.ui';
const rendererKeys = [
  'exportCategoryGlobalSettings', 'exportCategoryPluginSettings', 'exportCategoryProfileDatabases',
  'exportCategoryUserData', 'exportCategoryPluginFiles', 'exportCategoryUploads',
  'exportCategoryProfileScopedPluginData', 'exportCategorySchnorrbecherState',
  'exportCategoryCredentialsSessions', 'exportCategoryNotSelected', 'exportCategoryCount',
  'exportSelectionEstimate', 'fullBackupUnknownContentWarning', 'unclassifiedContentWarning',
  'sensitiveContentWarning', 'confirmSensitiveExportRequired',
  'confirmUnclassifiedExport', 'confirmUnclassifiedExportRequired', 'exportPreviewExpired', 'partialBackupWarning',
  'legacyBackupScopeWarning', 'backupSensitiveIncludedWarning', 'backupSensitiveOmittedWarning',
  'backupFullUnknownContentWarning'
];

function loadLocale(language) {
  return JSON.parse(fs.readFileSync(path.join(localeDir, `${language}.json`), 'utf8').replace(/^\uFEFF/, ''))
    .plugins['config-import']['config-import'].ui;
}

function makeTranslator(messages) {
  return (key, values = {}) => Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    messages[key.split('.').at(-1)]
  );
}

function fixturePreview() {
  const categoryNames = [
    'globalSettings', 'pluginSettings', 'profileDatabases', 'userData', 'pluginFiles', 'uploads',
    'profileScopedPluginData', 'schnorrbecherPersistentState', 'credentialsAndSessions'
  ];
  return {
    categories: Object.fromEntries(categoryNames.map((name, index) => [name, {
      selected: index !== 3,
      files: index + 1,
      entries: index + 2,
      bytes: (index + 1) * 1024
    }])),
    totals: { files: 44, entries: 53, bytes: 46080 },
    fullBackupWarning: 'generic warning sentinel',
    unclassifiedContentRisk: true
  };
}

describe('config-import backup export localization renderer', () => {
  const html = fs.readFileSync(uiPath, 'utf8');
  const helperScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).find(source => source.includes('window.renderBackupExportPreview'));

  test('renders all export categories and full-backup warning in every supported locale', () => {
    expect(helperScript).toBeTruthy();
    for (const language of locales) {
      const messages = loadLocale(language);
      const dom = new JSDOM('<!doctype html><div id="preview"></div>', { runScripts: 'outside-only' });
      dom.window.eval(helperScript);
      const translate = makeTranslator(messages);
      const preview = dom.window.document.getElementById('preview');
      dom.window.renderBackupExportPreview(preview, fixturePreview(), translate, bytes => `${bytes} B`);

      const rendered = preview.textContent;
      rendererKeys.slice(0, 10).forEach(key => expect(rendered).toContain(messages[key]));
      expect(rendered).toContain(translate('plugins.config-import.config-import.ui.exportCategoryCount', { files: 1, entries: 2, bytes: '1024 B' }));
      expect(rendered).toContain(translate('plugins.config-import.config-import.ui.exportSelectionEstimate', { files: 44, entries: 53, bytes: '46080 B' }));
      expect(rendered).toContain(messages.fullBackupUnknownContentWarning);
      expect(rendered).toContain(messages.unclassifiedContentWarning);
      expect(rendered).toContain(messages.sensitiveContentWarning);
      expect(rendered).not.toContain('generic warning sentinel');
      expect(rendered).not.toContain('SYNTHETIC_');

      const unselectedPreview = fixturePreview();
      unselectedPreview.categories.credentialsAndSessions.selected = false;
      dom.window.renderBackupExportPreview(preview, unselectedPreview, translate, bytes => `${bytes} B`);
      expect(preview.textContent).not.toContain(messages.sensitiveContentWarning);
      dom.window.close();
    }
  });

  test('rerenders one existing export preview when locale changes in the same DOM', async () => {
    const html = fs.readFileSync(uiPath, 'utf8');
    const i18nSource = fs.readFileSync(i18nClientPath, 'utf8');
    const helperScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
      .map(match => match[1]).find(source => source.includes('window.renderBackupExportPreview'));
    const dom = new JSDOM('<!doctype html><html><body><div id="preview"></div></body></html>', {
      runScripts: 'outside-only', url: 'http://localhost/plugins/config-import/'
    });
    const { window } = dom;
    const localeData = Object.fromEntries(locales.map(language => [language, loadLocale(language)]));
    window.fetch = async url => {
      const language = String(url).split('/').at(-1);
      return { ok: locales.includes(language), statusText: 'Not Found', json: async () => ({
        plugins: { 'config-import': { 'config-import': { ui: localeData[language] } } }
      }) };
    };
    window.console = { log() {}, warn() {}, error() {} };
    window.eval(i18nSource);
    window.eval(helperScript);
    await window.i18n.init();

    // Exercise the same listener used by the page's preview lifecycle: retain only
    // the synthetic preview result and redraw it through the real i18n client.
    const preview = fixturePreview();
    const container = window.document.getElementById('preview');
    const render = () => window.renderBackupExportPreview(container, preview,
      (key, params) => window.i18n.t(key, params), bytes => `${bytes} B`);
    window.i18n.onLanguageChange(render);
    render();
    const expected = {};
    for (const language of locales) {
      if (window.i18n.currentLocale !== language) await window.i18n.changeLanguage(language);
      else render();
      expected[language] = loadLocale(language).exportCategoryGlobalSettings;
      expect(container.textContent).toContain(expected[language]);
      expect(container.textContent).toContain(loadLocale(language).unclassifiedContentWarning);
      expect(container.textContent).toContain(loadLocale(language).sensitiveContentWarning);
      expect(container.textContent).not.toContain('generic warning sentinel');
      expect(container.textContent).not.toContain('SYNTHETIC_');
    }
    expect(new Set(Object.values(expected)).size).toBe(4);
    dom.window.close();
  });

  test('runs the real Config Import export UI through selection, preview, locale changes, download, and reload', async () => {
    const page = fs.readFileSync(uiPath, 'utf8').replace(/<script\s+src=[^>]*><\/script>/gi, '');
    const i18nSource = fs.readFileSync(i18nClientPath, 'utf8');
    const inlineScripts = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
    const localeData = Object.fromEntries(locales.map(language => [language, loadLocale(language)]));
    const selection = {
      includeGlobalSettings: true,
      includePluginSettings: true,
      includePluginData: false,
      includeUserConfigs: true,
      includeUploads: false,
      includeUserData: false,
      includeProfileScopedPluginData: false,
      includeSchnorrbecherPersistentState: false,
      includeCredentialsSessions: true
    };
    const exportCalls = [];
    let dom;
    let deferPreviewResponse = false;
    let resolveDeferredPreview;

    async function makePage() {
      dom = new JSDOM(page, { runScripts: 'outside-only', url: 'http://localhost/plugins/config-import/' });
      const { window } = dom;
      const nativeCreateElement = window.document.createElement.bind(window.document);
      window.document.createElement = tagName => {
        const element = nativeCreateElement(tagName);
        if (String(tagName).toLowerCase() === 'a') {
          element.click = () => exportCalls.push({ href: element.href, download: element.download });
        }
        return element;
      };
      window.URL.createObjectURL = () => 'blob:synthetic-export';
      window.URL.revokeObjectURL = jest.fn();
      window.confirm = jest.fn(() => true);
      window.alert = jest.fn();
      window.console = { log() {}, warn() {}, error() {} };
      window.fetch = jest.fn(async (url, options = {}) => {
        const route = String(url);
        if (route.startsWith('/api/i18n/translations/')) {
          const language = route.split('/').at(-1);
          return { ok: locales.includes(language), statusText: 'Not Found', json: async () => ({
            plugins: { 'config-import': { 'config-import': { ui: localeData[language] } }
          } }) };
        }
        if (route === '/api/config-backup/capabilities') return { ok: true, json: async () => ({ success: true }) };
        if (route === '/api/profiles') return { ok: true, json: async () => ({ profiles: [] }) };
        if (route === '/api/config-import/discover') return { ok: true, json: async () => ({ success: true, candidates: [] }) };
        if (route === '/api/config-backup/preview-export') {
          const body = JSON.parse(options.body);
          expect(body).toMatchObject(selection);
          expect(body.includeCredentialsSessions).toBe(true);
          const result = { success: true, exportPreviewToken: 'synthetic-preview-token', unclassifiedContentRisk: true, preview: {
            categories: {
              globalSettings: { selected: true, files: 1, entries: 2, bytes: 128 },
              credentialsAndSessions: { selected: true, files: 1, entries: 1, bytes: 48 }
            },
            totals: { files: 1, entries: 2, bytes: 128 }
          } };
          if (deferPreviewResponse) {
            deferPreviewResponse = false;
            return new Promise(resolve => {
              resolveDeferredPreview = () => resolve({ ok: true, json: async () => result });
            });
          }
          return { ok: true, json: async () => result };
        }
        if (route === '/api/config-backup/export-token') {
          const body = JSON.parse(options.body);
          expect(body.exportPreviewToken).toBe('synthetic-preview-token');
          expect(body.confirmUnclassifiedData).toBe(true);
          expect(body.confirmSensitiveExport).toBe(true);
          exportCalls.push({ selection: Object.fromEntries(Object.keys(selection).map(key => [key, body[key]])) });
          return { ok: true, json: async () => ({ success: true, downloadUrl: '/api/config-backup/download/synthetic', filename: 'synthetic-backup.zip' }) };
        }
        if (route === '/api/config-backup/download/synthetic') {
          return { ok: true, blob: async () => new window.Blob(['synthetic archive bytes']) };
        }
        throw new Error(`Unexpected synthetic request: ${route}`);
      });
      window.eval(i18nSource);
      for (const script of inlineScripts) window.eval(script);
      await window.i18n.init();
      return window;
    }

    const window = await makePage();
    try {
      const selectionIds = {
        incGlobal: 'includeGlobalSettings', incPluginSettings: 'includePluginSettings',
        incPluginData: 'includePluginData', incUserConfigs: 'includeUserConfigs', incUploads: 'includeUploads',
        incUserData: 'includeUserData', incProfileScopedPluginData: 'includeProfileScopedPluginData',
        incSchnorrbecherPersistentState: 'includeSchnorrbecherPersistentState',
        incCredentialsSessions: 'includeCredentialsSessions'
      };
      for (const [id, option] of Object.entries(selectionIds)) {
        const checkbox = window.document.getElementById(id);
        checkbox.checked = selection[option];
        checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
      }
      window.document.getElementById('previewExportBtn').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(window.document.getElementById('exportPreviewSummary').textContent)
        .toContain(loadLocale('de').exportCategoryGlobalSettings);
      expect(window.document.getElementById('exportPreviewSummary').textContent)
        .toContain(loadLocale('de').unclassifiedContentWarning);
      expect(window.document.getElementById('exportPreviewSummary').textContent)
        .toContain(loadLocale('de').sensitiveContentWarning);
      expect(window.document.getElementById('exportPreviewSummary').textContent)
        .not.toContain('SYNTHETIC_SECRET_SENTINEL');
      expect(window.document.getElementById('exportPreviewSummary').textContent)
        .not.toContain('C:\\private\\synthetic.db');
      const unclassifiedConfirm = window.document.getElementById('confirmUnclassifiedExport');
      expect(unclassifiedConfirm.checked).toBe(false);
      expect(window.document.getElementById('confirmUnclassifiedExportWrap').classList.contains('hidden')).toBe(false);
      const sensitiveConfirm = window.document.getElementById('confirmSensitiveExport');
      expect(sensitiveConfirm.checked).toBe(false);
      expect(window.document.getElementById('confirmSensitiveExportWrap').classList.contains('hidden')).toBe(false);

      for (const language of locales) {
        await window.i18n.changeLanguage(language);
        expect(window.document.getElementById('exportPreviewSummary').textContent)
          .toContain(loadLocale(language).exportCategoryGlobalSettings);
        window.document.getElementById('exportBtn').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(exportCalls.filter(call => call.selection)).toHaveLength(0);
        expect(window.document.getElementById('exportAlert').textContent)
          .toContain(loadLocale(language).confirmUnclassifiedExportRequired);
        unclassifiedConfirm.checked = true;
        window.document.getElementById('exportBtn').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(exportCalls.filter(call => call.selection)).toHaveLength(0);
        expect(window.document.getElementById('exportAlert').textContent)
          .toContain(loadLocale(language).confirmSensitiveExportRequired);
        unclassifiedConfirm.checked = false;
      }

      window.open = () => null;
      window.document.getElementById('exportBtn').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(exportCalls.filter(call => call.selection)).toHaveLength(0);
      expect(window.document.getElementById('exportAlert').textContent)
        .toContain(loadLocale('fr').confirmUnclassifiedExportRequired);
      unclassifiedConfirm.checked = true;
      window.document.getElementById('exportBtn').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(exportCalls.filter(call => call.selection)).toHaveLength(0);
      expect(window.document.getElementById('exportAlert').textContent)
        .toContain(loadLocale('fr').confirmSensitiveExportRequired);
      sensitiveConfirm.checked = true;
      window.document.getElementById('exportBtn').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(exportCalls.some(call => call.selection)).toBe(true);
      expect(exportCalls.find(call => call.selection).selection).toEqual(selection);
      expect(exportCalls.some(call => call.download === 'synthetic-backup.zip')).toBe(true);
      expect(window.document.getElementById('exportResultCard').classList.contains('hidden')).toBe(false);
      expect(window.document.getElementById('exportResultMsg').textContent)
        .toContain(loadLocale('fr').backupReady);

      dom.window.close();
      const reloaded = await makePage();
      try {
        expect(reloaded.document.getElementById('exportPreviewSummary').textContent)
          .toContain(loadLocale('de').exportPreviewInitial);
        expect(reloaded.document.getElementById('exportResultMsg').textContent).toBe('');
        // No selection or one-time export token survives a page reload.
        expect(reloaded.document.getElementById('incGlobal').checked).toBe(true);
        expect(reloaded.document.getElementById('incPluginSettings').checked).toBe(true);
        expect(reloaded.document.getElementById('incUploads').checked).toBe(true);
        const tokenCallsBeforeRace = reloaded.fetch.mock.calls.filter(([url]) =>
          String(url) === '/api/config-backup/export-token').length;
        const raceSelectionIds = {
          incGlobal: 'includeGlobalSettings', incPluginSettings: 'includePluginSettings',
          incPluginData: 'includePluginData', incUserConfigs: 'includeUserConfigs', incUploads: 'includeUploads',
          incUserData: 'includeUserData', incProfileScopedPluginData: 'includeProfileScopedPluginData',
          incSchnorrbecherPersistentState: 'includeSchnorrbecherPersistentState',
          incCredentialsSessions: 'includeCredentialsSessions'
        };
        for (const [id, option] of Object.entries(raceSelectionIds)) {
          const checkbox = reloaded.document.getElementById(id);
          checkbox.checked = selection[option];
          checkbox.dispatchEvent(new reloaded.Event('change', { bubbles: true }));
        }
        deferPreviewResponse = true;
        reloaded.document.getElementById('previewExportBtn').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(resolveDeferredPreview).toBeInstanceOf(Function);
        const globalSelection = reloaded.document.getElementById('incGlobal');
        globalSelection.checked = false;
        globalSelection.dispatchEvent(new reloaded.Event('change', { bubbles: true }));
        resolveDeferredPreview();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(reloaded.document.getElementById('exportPreviewSummary').textContent)
          .toBe(loadLocale('de').exportPreviewSelectionChanged);
        expect(reloaded.document.getElementById('exportPreviewSummary').textContent)
          .not.toContain(loadLocale('de').sensitiveContentWarning);
        reloaded.document.getElementById('exportBtn').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(reloaded.fetch.mock.calls.filter(([url]) =>
          String(url) === '/api/config-backup/export-token').length).toBe(tokenCallsBeforeRace);
      } finally {
        reloaded.close();
      }
    } finally {
      if (dom?.window && !dom.window.closed) dom.window.close();
    }
  });

  test.each([
    ['sensitive', 'importSensitiveDataWarning', 'confirmSensitiveImport'],
    ['unknown', 'importUnknownDataWarning', 'confirmUnknownSensitiveImport']
  ])('shows the %s-data warning and requires explicit confirmation before the real import UI submits', async (risk, warningKey, confirmationKey) => {
    const page = fs.readFileSync(uiPath, 'utf8').replace(/<script\s+src=[^>]*><\/script>/gi, '');
    const i18nSource = fs.readFileSync(i18nClientPath, 'utf8');
    const inlineScripts = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
    const localeData = Object.fromEntries(locales.map(language => [language, loadLocale(language)]));
    const importRequests = [];
    const dom = new JSDOM(page, { runScripts: 'outside-only', url: 'http://localhost/plugins/config-import/' });
    const { window } = dom;
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
    window.console = { log() {}, warn() {}, error() {} };
    window.fetch = jest.fn(async (url, options = {}) => {
      const route = String(url);
      if (route.startsWith('/api/i18n/translations/')) {
        const language = route.split('/').at(-1);
        return { ok: locales.includes(language), statusText: 'Not Found', json: async () => ({
          plugins: { 'config-import': { 'config-import': { ui: localeData[language] } } }
        }) };
      }
      if (route === '/api/config-backup/capabilities') return { ok: true, json: async () => ({ success: true }) };
      if (route === '/api/profiles') return { ok: true, json: async () => ({ profiles: [] }) };
      if (route === '/api/config-import/discover') return { ok: true, json: async () => ({ success: true, candidates: [] }) };
      if (route === '/api/config-backup/preview-import') {
        const body = options.body;
        importRequests.push({ route, prepare: body.get('prepareImport') === 'true' });
        return { ok: true, json: async () => ({
          success: true,
          preview: {
            manifest: { exportedAt: 'synthetic', app: { version: 'fixture' } },
            global: { new: 0, conflicts: 0 }, plugins: {}, userConfigFiles: 0,
            uploadFiles: 0, userDataFiles: 0,
            profileScopedPluginData: { plugins: [], schnorrbecherPersistentStateAvailable: false }
          },
          warnings: [],
          sensitivityRisk: risk,
          importConfirmationToken: body.get('prepareImport') === 'true' ? 'synthetic-preview-token' : null
        }) };
      }
      if (route === '/api/config-backup/import') {
        importRequests.push({
          route,
          token: options.body.get('importConfirmationToken'),
          confirmSensitiveImport: options.body.get('confirmSensitiveImport')
        });
        return { ok: true, json: async () => ({ success: true, report: {}, warnings: [], errors: [] }) };
      }
      throw new Error(`Unexpected synthetic request: ${route}`);
    });
    window.eval(i18nSource);
    for (const script of inlineScripts) window.eval(script);
    await window.i18n.init();

    try {
      const input = window.document.getElementById('fileInput');
      Object.defineProperty(input, 'files', { configurable: true, value: [new window.File(['synthetic archive'], 'fixture.zip', { type: 'application/zip' })] });
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
      window.document.getElementById('validateBtn').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(window.document.getElementById('importSensitivityWarning').textContent)
        .toBe(loadLocale('de')[warningKey]);

      window.document.getElementById('doImportBtn').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(window.confirm).toHaveBeenCalledWith(loadLocale('de')[confirmationKey]);
      expect(importRequests.some(call => call.route === '/api/config-backup/preview-import' && call.prepare)).toBe(true);
      expect(importRequests.find(call => call.route === '/api/config-backup/import')).toMatchObject({
        token: 'synthetic-preview-token', confirmSensitiveImport: 'true'
      });
    } finally {
      dom.window.close();
    }
  });

  test('localizes partial, legacy, and sensitive-content restore warnings without changing unknown warnings', () => {
    const warnings = [
      ['This is a partial backup; categories not selected at export time are absent.', 'partialBackupWarning'],
      ['This legacy archive has no data-scope metadata; backup completeness cannot be determined.', 'legacyBackupScopeWarning'],
      ['[original export] Credentials and session fields/files were explicitly selected. Unclassified database or file contents may also contain personal or secret values; keep this backup secure.', 'backupSensitiveIncludedWarning'],
      ['[original export] Known credential and session fields/files were omitted. Unclassified database or file contents may still contain personal or secret values.', 'backupSensitiveOmittedWarning'],
      ['[original export] Full backup selected: generic database and file contents may include unclassified personal or secret values.', 'backupFullUnknownContentWarning']
    ];
    for (const language of locales) {
      const messages = loadLocale(language);
      const dom = new JSDOM('<!doctype html>', { runScripts: 'outside-only' });
      dom.window.eval(helperScript);
      const translate = makeTranslator(messages);
      for (const [source, key] of warnings) {
        expect(dom.window.localizeBackupImportWarning(source, translate)).toBe(messages[key]);
      }
      expect(dom.window.localizeBackupImportWarning('unrelated warning', translate)).toBe('unrelated warning');
      dom.window.close();
    }
  });

  test('all new static and renderer strings are present and non-empty in all four locales', () => {
    const requiredKeys = [
      'includeCredentialsSessions', 'exportPreviewTitle', 'exportPreviewDescription', 'exportPreviewInitial',
      'confirmSensitiveExport', 'confirmFullBackup', 'previewSelectionButton', 'exportPreviewSelectionChanged',
      'exportPreviewCalculating', 'exportPreviewFailed', 'importSensitiveDataWarning', 'importUnknownDataWarning',
      'confirmSensitiveImport', 'confirmUnknownSensitiveImport', 'importPreviewExpired', ...rendererKeys
    ];
    const expected = loadLocale('en');
    for (const language of locales) {
      const messages = loadLocale(language);
      expect(Object.keys(messages).sort()).toEqual(Object.keys(expected).sort());
      for (const key of requiredKeys) {
        expect(typeof messages[key]).toBe('string');
        expect(messages[key].trim()).not.toBe('');
        expect(html).toContain(`${uiNamespace}.${key}`);
      }
    }
  });
});
