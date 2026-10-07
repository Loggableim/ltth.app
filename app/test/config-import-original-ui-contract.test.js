'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const sourceRoot = path.resolve(__dirname, '../plugins/config-import');
const markup = fs.readFileSync(path.join(sourceRoot, 'ui.html'), 'utf8');
const prefix = 'plugins.config-import.config-import.ui.';
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

async function load(language = 'en') {
  const messages = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'locales', language + '.json'), 'utf8'));
  const dom = new JSDOM(markup, { url: 'http://localhost/config-import', runScripts: 'outside-only' });
  const window = dom.window;
  const calls = [];
  let preview = { manifest: { sourceProfile: 'archive_source' }, plugins: {}, userConfigFiles: 2,
    profileScopedPluginData: { plugins: ['schnorrbecher'], sourceProfile: 'archive_source', schnorrbecherPersistentStateAvailable: true } };
  window.i18n = { initialized: true, ready: Promise.resolve(), updateDOM() {}, t(key, params = {}) {
    let value = key.split('.').reduce((object, piece) => object?.[piece], messages) || key;
    for (const [name, text] of Object.entries(params)) value = value.replaceAll('{' + name + '}', text);
    return value;
  } };
  window.confirm = jest.fn(() => true);
  window.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const data = url === '/api/profiles' ? { profiles: [{ username: 'active', isActive: true }, { username: 'other' }], activeProfile: 'active' }
      : url === '/api/config-backup/preview-import' ? { success: true, preview }
      : url === '/api/config-backup/import' ? { success: false, errors: ['rollback failed; recovery data retained at C:/synthetic/<img src=x onerror=alert(1)>'] }
      : { success: true, candidates: [] };
    return { json: async () => data };
  };
  const scripts = [...window.document.querySelectorAll('script:not([src])')];
  scripts.forEach(script => window.eval(script.textContent));
  await tick();
  const file = new window.File(['synthetic'], 'backup.zip', { type: 'application/zip' });
  const input = window.document.getElementById('fileInput');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new window.Event('change'));
  return { dom, window, calls, setPreview(value) { preview = value; }, async validate() {
    window.document.getElementById('validateBtn').click();
    await tick();
  } };
}

test('archive metadata cannot select destination and import handler sends selected profile and explicit flags', async () => {
  const { dom, window, calls, validate } = await load();
  try {
    await validate();
    const doc = window.document;
    expect(doc.getElementById('profileScopedTarget').value).toBe('active');
    doc.getElementById('profileScopedTarget').value = 'other';
    doc.getElementById('profileScopedTarget').dispatchEvent(new window.Event('change'));
    expect(doc.getElementById('impGlobal').disabled).toBe(true);
    expect(doc.getElementById('impPluginSettings').checked).toBe(false);
    doc.getElementById('impProfileScopedPluginData').checked = true;
    doc.getElementById('impProfileScopedPluginData').dispatchEvent(new window.Event('change'));
    doc.getElementById('doImportBtn').click();
    await tick();
    const request = calls.find(call => call.url === '/api/config-backup/import');
    expect(request.options.body.get('targetProfile')).toBe('other');
    expect(request.options.body.get('includeProfileScopedPluginData')).toBe('true');
    expect(request.options.body.get('includeSchnorrbecherPersistentState')).toBe('false');
  } finally { dom.window.close(); }
});

test('user-config profile files remain opt-in and are sent false until explicitly checked', async () => {
  const { dom, window, calls, validate } = await load();
  try {
    await validate();
    expect(window.document.getElementById('impUserConfigs').checked).toBe(false);
    window.document.getElementById('doImportBtn').click();
    await tick();
    expect(calls.find(call => call.url === '/api/config-backup/import').options.body.get('includeUserConfigs')).toBe('false');
  } finally { dom.window.close(); }
});

test('new preview clears scoped consent and state requires scoped opt-in', async () => {
  const { dom, window, validate } = await load();
  try {
    await validate();
    expect(window.document.getElementById('impProfileScopedPluginData').checked).toBe(false);
    expect(window.document.getElementById('impSchnorrbecherPersistentState').disabled).toBe(true);
    window.document.getElementById('impProfileScopedPluginData').checked = true;
    window.document.getElementById('impProfileScopedPluginData').dispatchEvent(new window.Event('change'));
    expect(window.document.getElementById('impSchnorrbecherPersistentState').disabled).toBe(false);
    window.document.getElementById('impSchnorrbecherPersistentState').checked = true;
    await validate();
    expect(window.document.getElementById('impProfileScopedPluginData').checked).toBe(false);
    expect(window.document.getElementById('impSchnorrbecherPersistentState').checked).toBe(false);
    expect(window.document.getElementById('impSchnorrbecherPersistentState').disabled).toBe(true);
  } finally { dom.window.close(); }
});

for (const language of ['de', 'en', 'es', 'fr']) {
  test(`${language}: orphan state option produces localized error`, async () => {
    const { dom, window, calls, validate } = await load(language);
    try {
      await validate();
      window.document.getElementById('impSchnorrbecherPersistentState').checked = true;
      window.document.getElementById('doImportBtn').click();
      await tick();
      expect(calls.some(call => call.url === '/api/config-backup/import')).toBe(false);
      expect(window.document.getElementById('importAlert').textContent).toBe(window.i18n.t(prefix + 'persistentStateRequiresScoped'));
    } finally { dom.window.close(); }
  });
}

for (const language of ['de', 'en', 'es', 'fr']) {
  test(`${language}: recovery hint is localized and path rendered as safe text`, async () => {
    const { dom, window, validate } = await load(language);
    try {
      await validate();
      window.document.getElementById('doImportBtn').click();
      await tick();
      const result = window.document.getElementById('importResultMsg');
      expect(result.querySelector('.alert-warn').textContent).toBe(
        window.i18n.t(prefix + 'recoveryRetainedHint') + ' C:/synthetic/<img src=x onerror=alert(1)>');
      expect(result.querySelector('img')).toBeNull();
    } finally { dom.window.close(); }
  });
}

test('explicit user-config checkbox is sent true, cancel clears all profile consent', async () => {
  const { dom, window, calls, validate } = await load();
  try {
    await validate();
    const doc = window.document;
    doc.getElementById('impUserConfigs').checked = true;
    doc.getElementById('impProfileScopedPluginData').checked = true;
    doc.getElementById('impProfileScopedPluginData').dispatchEvent(new window.Event('change'));
    doc.getElementById('impSchnorrbecherPersistentState').checked = true;
    doc.getElementById('doImportBtn').click();
    await tick();
    const request = calls.find(call => call.url === '/api/config-backup/import');
    expect(request.options.body.get('includeUserConfigs')).toBe('true');
    expect(request.options.body.get('includeSchnorrbecherPersistentState')).toBe('true');
    doc.getElementById('cancelImportBtn').click();
    expect(doc.getElementById('impUserConfigs').checked).toBe(false);
    expect(doc.getElementById('impProfileScopedPluginData').checked).toBe(false);
    expect(doc.getElementById('impSchnorrbecherPersistentState').checked).toBe(false);
    expect(doc.getElementById('impSchnorrbecherPersistentState').disabled).toBe(true);
  } finally { dom.window.close(); }
});

for (const language of ['de', 'en', 'es', 'fr']) {
  test(`${language}: scoped selection visibly enables Merge, explicit Replace blocks before HTTP`, async () => {
    const { dom, window, calls, validate } = await load(language);
    try {
      await validate();
      const doc = window.document;
      doc.getElementById('impProfileScopedPluginData').checked = true;
      doc.getElementById('impProfileScopedPluginData').dispatchEvent(new window.Event('change'));
      expect(doc.querySelector('.mode-btn[data-mode="merge"]').classList.contains('selected')).toBe(true);
      doc.querySelector('.mode-btn[data-mode="replace"]').click();
      doc.getElementById('doImportBtn').click();
      await tick();
      expect(calls.some(call => call.url === '/api/config-backup/import')).toBe(false);
      expect(doc.getElementById('importAlert').textContent).toBe(window.i18n.t(prefix + 'scopedMergeRequired'));
      expect(window.confirm).not.toHaveBeenCalled();
      doc.querySelector('.mode-btn[data-mode="merge"]').click();
      doc.getElementById('doImportBtn').click();
      await tick();
      expect(calls.find(call => call.url === '/api/config-backup/import').options.body.get('mode')).toBe('merge');
      expect(doc.getElementById('importAlert').classList.contains('hidden')).toBe(true);
      expect(doc.getElementById('importResultMsg').textContent).toContain('rollback failed');
      expect(doc.querySelector('#importResultMsg .alert-warn').textContent).toContain(window.i18n.t(prefix + 'recoveryRetainedHint'));
    } finally { dom.window.close(); }
  });
}

test('mode changes retain unrelated ZIP validation error', async () => {
  const { dom, window } = await load();
  try {
    const doc = window.document;
    const input = doc.getElementById('fileInput');
    Object.defineProperty(input, 'files', { configurable: true, value: [new window.File(['x'], 'wrong.txt', { type: 'text/plain' })] });
    input.dispatchEvent(new window.Event('change'));
    const text = doc.getElementById('importAlert').textContent;
    expect(doc.getElementById('importAlert').classList.contains('hidden')).toBe(false);
    doc.querySelector('.mode-btn[data-mode="merge"]').click();
    expect(doc.getElementById('importAlert').textContent).toBe(text);
    expect(doc.getElementById('importAlert').classList.contains('hidden')).toBe(false);
  } finally { dom.window.close(); }
});
