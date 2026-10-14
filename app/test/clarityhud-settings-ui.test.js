'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ClarityHUDSettingsSchema = require('../plugins/clarityhud/lib/settings-schema');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginRoot = path.join(repoRoot, 'app', 'plugins', 'clarityhud');

function createSettingsPage(fetchMock) {
  const html = fs.readFileSync(path.join(pluginRoot, 'ui', 'main.html'), 'utf8');
  const script = fs.readFileSync(path.join(pluginRoot, 'ui', 'main.js'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://127.0.0.1/clarityhud/ui', runScripts: 'outside-only' });
  const addDocumentListener = dom.window.document.addEventListener.bind(dom.window.document);
  dom.window.document.addEventListener = (type, ...args) => {
    if (type === 'DOMContentLoaded') return;
    return addDocumentListener(type, ...args);
  };
  dom.window.io = () => ({ on() {}, emit() {}, close() {} });
  dom.window.fetch = fetchMock;
  dom.window.eval(script);
  return dom;
}

describe('ClarityHUD chat settings UI', () => {
  test('chat settings save payload passes the backend schema validation', async () => {
    const payloads = [];
    const dom = createSettingsPage(async (_url, options = {}) => {
      if (options.method === 'POST') {
        const payload = JSON.parse(options.body);
        payloads.push(payload);
        const validation = ClarityHUDSettingsSchema.validateSettings('chat', payload);
        return {
          json: async () => validation.valid
            ? { success: true, settings: ClarityHUDSettingsSchema.mergeSettings('chat', {}, payload).settings }
            : { success: false, error: 'Invalid ClarityHUD settings', validationErrors: validation.errors }
        };
      }
      return { json: async () => ({ success: true, settings: ClarityHUDSettingsSchema.getDefaults('chat') }) };
    });

    try {
      await dom.window.eval('(async () => openSettings("chat"))()');
      await dom.window.eval('(async () => saveSettings())()');

      expect(payloads).toHaveLength(1);
      expect(payloads[0].colorblindSafeMode).toBe(false);
      expect(payloads[0].usernameColorByTeamLevel).toBe(true);
      expect(ClarityHUDSettingsSchema.validateSettings('chat', payloads[0]).valid).toBe(true);
      expect(ClarityHUDSettingsSchema.validateSettings('chat', { fontColor: 'not-a-color' }).valid).toBe(false);
      expect(dom.window.document.getElementById('settings-modal').classList.contains('active')).toBe(false);
    } finally {
      dom.window.close();
    }
  });

  test('renders the persisted chat alignment value after settings reload', async () => {
    const persistedSettings = { ...ClarityHUDSettingsSchema.getDefaults('chat'), align: 'center' };
    const dom = createSettingsPage(async () => ({ json: async () => ({ success: true, settings: persistedSettings }) }));

    try {
      await dom.window.eval('(async () => openSettings("chat"))()');
      dom.window.eval('switchTab("layout")');
      const alignment = dom.window.document.getElementById('alignment');

      expect(alignment.value).toBe('center');
    } finally {
      dom.window.close();
    }
  });
});
