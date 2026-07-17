const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');

describe('WebGPU Superfan finale settings', () => {
  const pluginDir = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
  const html = fs.readFileSync(path.join(pluginDir, 'ui', 'settings.html'), 'utf8');
  const script = fs.readFileSync(path.join(pluginDir, 'ui', 'settings.js'), 'utf8');
  let dom;

  afterEach(() => {
    dom?.window.close();
    dom = null;
  });

  function jsonResponse(body, ok = true) {
    return { ok, json: async () => body };
  }

  async function waitFor(assertion) {
    const startedAt = Date.now();
    let lastError;
    while (Date.now() - startedAt < 1000) {
      try {
        assertion();
        return;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    throw lastError;
  }

  function findRequest(fetchMock, url, method = 'POST') {
    return fetchMock.mock.calls.find(([requestUrl, options = {}]) => (
      String(requestUrl) === url && options.method === method
    ));
  }

  async function bootSettings({ initialConfig = {}, testResponse, translations = {} } = {}) {
    const loadedConfig = normalizeConfig(initialConfig);
    dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'http://localhost:3000/webgpu-fireworks/ui'
    });
    const { window } = dom;
    const ready = new Promise(resolve => {
      window.document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });

    window.console = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    window.i18n = {
      init: jest.fn(async () => {}),
      updateDOM: jest.fn(),
      onChange: jest.fn(),
      t: jest.fn(key => translations[key] || key)
    };
    window.io = jest.fn(() => ({ on: jest.fn(), emit: jest.fn() }));
    window.setInterval = jest.fn(() => 1);
    window.clearInterval = jest.fn();
    window.setTimeout = jest.fn(() => 1);
    window.clearTimeout = jest.fn();
    window.navigator.clipboard = { writeText: jest.fn(async () => {}) };

    const fetchMock = jest.fn(async (url, options = {}) => {
      const requestUrl = String(url);
      if (requestUrl === '/api/webgpu-fireworks/config' && options.method !== 'POST') {
        return jsonResponse({ success: true, config: loadedConfig });
      }
      if (requestUrl === '/api/webgpu-fireworks/status') {
        return jsonResponse({ success: false });
      }
      if (requestUrl === '/api/webgpu-fireworks/config' && options.method === 'POST') {
        return jsonResponse({
          success: true,
          config: normalizeConfig(JSON.parse(options.body || '{}'))
        });
      }
      if (requestUrl === '/api/webgpu-fireworks/test-superfan' && options.method === 'POST') {
        const response = testResponse || { ok: true, body: { success: true, accepted: true } };
        return jsonResponse(response.body, response.ok);
      }
      throw new Error(`Unexpected request: ${requestUrl}`);
    });
    window.fetch = fetchMock;

    window.eval(script);
    await ready;
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/webgpu-fireworks/status')).toBe(true);
    });
    await new Promise(resolve => setImmediate(resolve));

    return { window, fetchMock };
  }

  test('exposes enabled, cooldown, intensity, and inherited finale controls', () => {
    for (const id of [
      'superfan-finale-toggle', 'superfan-finale-cooldown',
      'superfan-finale-intensity', 'superfan-finale-intensity-value',
      'test-superfan-finale-btn'
    ]) expect(html).toContain(`id="${id}"`);
    for (const value of ['6', '12', '24', '72', '168']) {
      expect(html).toContain(`<option value="${value}"`);
    }
    expect(html).toMatch(/id="superfan-finale-toggle"[^>]*class="[^"]*active[^"]*"[^>]*data-config="superfanFinaleEnabled"/);
    expect(html).toMatch(/<option value="24"[^>]*selected/);
    expect(html).toMatch(/id="superfan-finale-intensity"[^>]*min="1"[^>]*max="10"[^>]*step="0\.5"[^>]*value="3"/);
    expect(html).not.toContain('id="superfan-finale-style"');
    expect(html).not.toContain('id="superfan-finale-length"');
  });

  test('loads and saves false and low Superfan values without replacing them with defaults', async () => {
    const { window, fetchMock } = await bootSettings({
      initialConfig: {
        superfanFinaleEnabled: false,
        superfanFinaleCooldownHours: 6,
        superfanFinaleIntensity: 1,
        goalFinaleStyle: 'symmetric-salute',
        goalFinaleLength: 'long'
      }
    });
    const document = window.document;

    expect(document.getElementById('superfan-finale-toggle').classList.contains('active')).toBe(false);
    expect(document.getElementById('superfan-finale-cooldown').value).toBe('6');
    expect(document.getElementById('superfan-finale-intensity').value).toBe('1');
    expect(document.getElementById('superfan-finale-intensity-value').textContent).toBe('1x');

    document.getElementById('save-btn').click();
    await waitFor(() => expect(findRequest(fetchMock, '/api/webgpu-fireworks/config')).toBeDefined());
    const saved = JSON.parse(findRequest(fetchMock, '/api/webgpu-fireworks/config')[1].body);
    expect(saved).toMatchObject({
      superfanFinaleEnabled: false,
      superfanFinaleCooldownHours: 6,
      superfanFinaleIntensity: 1,
      goalFinaleStyle: 'symmetric-salute',
      goalFinaleLength: 'long'
    });
  });

  test('converts toggle, select, and slider interactions before saving', async () => {
    const { window, fetchMock } = await bootSettings();
    const document = window.document;
    document.getElementById('superfan-finale-toggle').click();
    const cooldown = document.getElementById('superfan-finale-cooldown');
    cooldown.value = '72';
    cooldown.dispatchEvent(new window.Event('change', { bubbles: true }));
    const intensity = document.getElementById('superfan-finale-intensity');
    intensity.value = '8.5';
    intensity.dispatchEvent(new window.Event('input', { bubbles: true }));

    document.getElementById('save-btn').click();
    await waitFor(() => expect(findRequest(fetchMock, '/api/webgpu-fireworks/config')).toBeDefined());
    const saved = JSON.parse(findRequest(fetchMock, '/api/webgpu-fireworks/config')[1].body);
    expect(saved.superfanFinaleEnabled).toBe(false);
    expect(saved.superfanFinaleCooldownHours).toBe(72);
    expect(saved.superfanFinaleIntensity).toBe(8.5);
    expect(document.getElementById('superfan-finale-intensity-value').textContent).toBe('8.5x');
  });

  test('test button sends the currently visible unsaved Superfan and inherited finale settings', async () => {
    const successText = 'Localized Superfan success';
    const { window, fetchMock } = await bootSettings({
      translations: { 'webgpu_fireworks.superfan_finale_test_success': successText }
    });
    const document = window.document;
    document.getElementById('superfan-finale-toggle').click();
    const cooldown = document.getElementById('superfan-finale-cooldown');
    cooldown.value = '168';
    cooldown.dispatchEvent(new window.Event('change', { bubbles: true }));
    const intensity = document.getElementById('superfan-finale-intensity');
    intensity.value = '7.5';
    intensity.dispatchEvent(new window.Event('input', { bubbles: true }));
    const style = document.getElementById('finale-style');
    style.value = 'sky-ballet';
    style.dispatchEvent(new window.Event('change', { bubbles: true }));
    const length = document.getElementById('finale-length');
    length.value = 'short';
    length.dispatchEvent(new window.Event('change', { bubbles: true }));

    document.getElementById('test-superfan-finale-btn').click();
    await waitFor(() => expect(findRequest(fetchMock, '/api/webgpu-fireworks/test-superfan')).toBeDefined());
    const requestBody = JSON.parse(findRequest(fetchMock, '/api/webgpu-fireworks/test-superfan')[1].body);
    expect(requestBody.settings).toEqual({
      superfanFinaleEnabled: false,
      superfanFinaleCooldownHours: 168,
      superfanFinaleIntensity: 7.5,
      goalFinaleStyle: 'sky-ballet',
      goalFinaleLength: 'short'
    });
    expect(findRequest(fetchMock, '/api/webgpu-fireworks/config')).toBeUndefined();
    await waitFor(() => expect(document.getElementById('toast').textContent).toBe(successText));
    expect(document.getElementById('toast').classList.contains('success')).toBe(true);
  });

  test('test button shows localized failure text with a safe backend reason', async () => {
    const failureText = 'Localized Superfan failure';
    const backendReason = 'renderer-not-ready <img src=x onerror="danger()">';
    const { window } = await bootSettings({
      testResponse: { ok: true, body: { success: false, accepted: false, reason: backendReason } },
      translations: { 'webgpu_fireworks.superfan_finale_test_failed': failureText }
    });
    const document = window.document;

    document.getElementById('test-superfan-finale-btn').click();
    await waitFor(() => expect(document.getElementById('toast').textContent).toContain('renderer-not-ready'));
    expect(document.getElementById('toast').textContent).toBe(`${failureText}: ${backendReason}`);
    expect(document.getElementById('toast').querySelector('img')).toBeNull();
    expect(document.getElementById('toast').classList.contains('error')).toBe(true);
  });

  const localeMessages = {
    en: [
      'Superfan Finale', 'Enable Superfan Finales', 'Repeat per Superfan',
      'Every 6 hours', 'Every 12 hours', 'Every 24 hours', 'Every 3 days', 'Every 7 days',
      'Finale intensity', 'Test Superfan Finale', 'Superfan finale triggered!',
      'Failed to trigger Superfan finale'
    ],
    de: [
      'Superfan-Finale', 'Superfan-Finales aktivieren', 'Wiederholung pro Superfan',
      'Alle 6 Stunden', 'Alle 12 Stunden', 'Alle 24 Stunden', 'Alle 3 Tage', 'Alle 7 Tage',
      'Finale-Intensität', 'Superfan-Finale testen', 'Superfan-Finale ausgelöst!',
      'Superfan-Finale konnte nicht ausgelöst werden'
    ],
    es: [
      'Final de Superfan', 'Activar finales de Superfan', 'Repetición por Superfan',
      'Cada 6 horas', 'Cada 12 horas', 'Cada 24 horas', 'Cada 3 días', 'Cada 7 días',
      'Intensidad del final', 'Probar final de Superfan', '¡Final de Superfan activado!',
      'No se pudo activar el final de Superfan'
    ],
    fr: [
      'Finale Superfan', 'Activer les finales Superfan', 'Répétition par Superfan',
      'Toutes les 6 heures', 'Toutes les 12 heures', 'Toutes les 24 heures', 'Tous les 3 jours', 'Tous les 7 jours',
      'Intensité de la finale', 'Tester la finale Superfan', 'Finale Superfan déclenchée !',
      'Échec du déclenchement de la finale Superfan'
    ]
  };

  test.each(['de', 'en', 'es', 'fr'])('ships all Superfan finale labels in %s', locale => {
    const messages = JSON.parse(fs.readFileSync(path.join(pluginDir, 'locales', `${locale}.json`), 'utf8'));
    const keys = [
      'superfan_finale', 'enable_superfan_finale', 'superfan_finale_cooldown',
      'superfan_finale_every_6h', 'superfan_finale_every_12h', 'superfan_finale_every_24h',
      'superfan_finale_every_3d', 'superfan_finale_every_7d', 'superfan_finale_intensity',
      'test_superfan_finale', 'superfan_finale_test_success', 'superfan_finale_test_failed'
    ];
    expect(keys.map(key => messages.webgpu_fireworks[key])).toEqual(localeMessages[locale]);
  });
});
