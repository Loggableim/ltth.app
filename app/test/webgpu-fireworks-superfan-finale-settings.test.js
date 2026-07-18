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

  function deferred() {
    let resolve;
    const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
    return { promise, resolve };
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

  function findRequests(fetchMock, url, method = 'POST') {
    return fetchMock.mock.calls.filter(([requestUrl, options = {}]) => (
      String(requestUrl) === url && options.method === method
    ));
  }

  async function readCurrentSuperfanSettings(window, fetchMock) {
    const requestsBefore = findRequests(fetchMock, '/api/webgpu-fireworks/test-superfan').length;
    window.document.getElementById('test-superfan-finale-btn').click();
    await waitFor(() => {
      expect(findRequests(fetchMock, '/api/webgpu-fireworks/test-superfan')).toHaveLength(requestsBefore + 1);
    });
    const requests = findRequests(fetchMock, '/api/webgpu-fireworks/test-superfan');
    return JSON.parse(requests[requests.length - 1][1].body).settings;
  }

  async function bootSettings({ initialConfig = {}, saveResponses = [], testResponse, translations = {} } = {}) {
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
    const socketHandlers = new Map();
    window.io = jest.fn(() => ({
      on: jest.fn((event, handler) => socketHandlers.set(event, handler)),
      emit: jest.fn()
    }));
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
        if (saveResponses.length > 0) return saveResponses.shift();
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

    return { window, fetchMock, socketHandlers };
  }

  test('exposes enabled, cooldown, intensity, and inherited finale controls', () => {
    for (const id of [
      'superfan-finale-toggle', 'superfan-finale-cooldown',
      'superfan-finale-intensity', 'superfan-finale-intensity-value',
      'superfan-end-card-duration', 'superfan-end-card-duration-value',
      'superfan-end-card-position', 'superfan-end-card-size',
      'superfan-end-card-scale-container', 'superfan-end-card-scale',
      'superfan-end-card-scale-value',
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

  test('loads, saves, and toggles custom Superfan end card controls', async () => {
    const { window, fetchMock } = await bootSettings({
      initialConfig: {
        superfanEndCardDuration: 4500,
        superfanEndCardPosition: 'top-right',
        superfanEndCardSize: 'custom',
        superfanEndCardScale: 1.4
      }
    });
    const document = window.document;
    const duration = document.getElementById('superfan-end-card-duration');
    const position = document.getElementById('superfan-end-card-position');
    const size = document.getElementById('superfan-end-card-size');
    const scale = document.getElementById('superfan-end-card-scale');
    const scaleContainer = document.getElementById('superfan-end-card-scale-container');

    expect(duration.value).toBe('4.5');
    expect(document.getElementById('superfan-end-card-duration-value').textContent).toBe('4.5s');
    expect(position.value).toBe('top-right');
    expect(size.value).toBe('custom');
    expect(scale.value).toBe('1.4');
    expect(document.getElementById('superfan-end-card-scale-value').textContent).toBe('1.4x');
    expect(scaleContainer.style.display).toBe('block');

    size.value = 'medium';
    size.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(scaleContainer.style.display).toBe('none');
    size.value = 'custom';
    size.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(scaleContainer.style.display).toBe('block');
    duration.value = '6.5';
    duration.dispatchEvent(new window.Event('input', { bubbles: true }));
    position.value = 'bottom-left';
    position.dispatchEvent(new window.Event('change', { bubbles: true }));
    scale.value = '1.7';
    scale.dispatchEvent(new window.Event('input', { bubbles: true }));

    document.getElementById('save-btn').click();
    await waitFor(() => expect(findRequest(fetchMock, '/api/webgpu-fireworks/config')).toBeDefined());
    const saved = JSON.parse(findRequest(fetchMock, '/api/webgpu-fireworks/config')[1].body);
    expect(saved).toMatchObject({
      superfanEndCardDuration: 6500,
      superfanEndCardPosition: 'bottom-left',
      superfanEndCardSize: 'custom',
      superfanEndCardScale: 1.7
    });
  });

  test('loads and saves false and low Superfan values without replacing them with defaults', async () => {
    const { window, fetchMock } = await bootSettings({
      initialConfig: {
        superfanFinaleEnabled: false,
        superfanFinaleCooldownHours: 6,
        superfanFinaleIntensity: 1,
        goalFinaleStyle: 'symmetric-salute',
        goalFinaleLength: 'long',
        audioVolume: 0.42,
        queueEnabled: true,
        themeColors: ['#112233', '#445566']
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
      goalFinaleLength: 'long',
      audioVolume: 0.42,
      queueEnabled: true,
      themeColors: ['#112233', '#445566']
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
    const endCardDuration = document.getElementById('superfan-end-card-duration');
    endCardDuration.value = '4.5';
    endCardDuration.dispatchEvent(new window.Event('input', { bubbles: true }));
    const endCardPosition = document.getElementById('superfan-end-card-position');
    endCardPosition.value = 'bottom-right';
    endCardPosition.dispatchEvent(new window.Event('change', { bubbles: true }));
    const endCardSize = document.getElementById('superfan-end-card-size');
    endCardSize.value = 'custom';
    endCardSize.dispatchEvent(new window.Event('change', { bubbles: true }));
    const endCardScale = document.getElementById('superfan-end-card-scale');
    endCardScale.value = '1.6';
    endCardScale.dispatchEvent(new window.Event('input', { bubbles: true }));

    document.getElementById('save-btn').click();
    await waitFor(() => expect(findRequest(fetchMock, '/api/webgpu-fireworks/config')).toBeDefined());
    const saved = JSON.parse(findRequest(fetchMock, '/api/webgpu-fireworks/config')[1].body);
    expect(saved.superfanFinaleEnabled).toBe(false);
    expect(saved.superfanFinaleCooldownHours).toBe(72);
    expect(saved.superfanFinaleIntensity).toBe(8.5);
    expect(document.getElementById('superfan-finale-intensity-value').textContent).toBe('8.5x');
  });

  test('late Save A cannot roll back newer local edits or Save B', async () => {
    const saveA = deferred();
    const saveB = deferred();
    const { window, fetchMock } = await bootSettings({
      saveResponses: [saveA.promise, saveB.promise]
    });
    const document = window.document;

    document.getElementById('save-btn').click();
    await waitFor(() => expect(findRequests(fetchMock, '/api/webgpu-fireworks/config')).toHaveLength(1));
    const bodyA = JSON.parse(findRequests(fetchMock, '/api/webgpu-fireworks/config')[0][1].body);

    document.getElementById('superfan-finale-toggle').click();
    const intensity = document.getElementById('superfan-finale-intensity');
    intensity.value = '7.5';
    intensity.dispatchEvent(new window.Event('input', { bubbles: true }));
    const mediumThreshold = document.getElementById('tier-medium');
    mediumThreshold.value = '750';
    mediumThreshold.dispatchEvent(new window.Event('change', { bubbles: true }));
    document.getElementById('save-btn').click();
    await waitFor(() => expect(findRequests(fetchMock, '/api/webgpu-fireworks/config')).toHaveLength(2));
    const bodyB = JSON.parse(findRequests(fetchMock, '/api/webgpu-fireworks/config')[1][1].body);
    expect(bodyB.escalationThresholds).toMatchObject({ medium: 750, big: 500 });
    const normalizedBodyB = normalizeConfig(bodyB);

    try {
      saveA.resolve(jsonResponse({ success: true, config: normalizeConfig(bodyA) }));
      await new Promise(resolve => setImmediate(resolve));

      expect(document.getElementById('superfan-finale-toggle').classList.contains('active')).toBe(false);
      expect(document.getElementById('superfan-finale-intensity').value).toBe('7.5');
      await expect(readCurrentSuperfanSettings(window, fetchMock)).resolves.toMatchObject({
        superfanFinaleEnabled: false,
        superfanFinaleIntensity: 7.5
      });
    } finally {
      saveB.resolve(jsonResponse({ success: true, config: normalizedBodyB }));
      await new Promise(resolve => setImmediate(resolve));
    }

    expect(document.getElementById('superfan-finale-intensity').value).toBe('7.5');
    expect(document.getElementById('tier-big').value).toBe('750');
    await expect(readCurrentSuperfanSettings(window, fetchMock)).resolves.toMatchObject({
      superfanFinaleEnabled: false,
      superfanFinaleIntensity: 7.5
    });
  });

  test('nested config edits during a save stay dirty and survive its stale response', async () => {
    const saveA = deferred();
    const { window, fetchMock } = await bootSettings({
      initialConfig: {
        escalationThresholds: { small: 0, medium: 100, big: 500, massive: 1000 }
      },
      saveResponses: [saveA.promise]
    });
    const document = window.document;

    document.getElementById('save-btn').click();
    await waitFor(() => expect(findRequests(fetchMock, '/api/webgpu-fireworks/config')).toHaveLength(1));
    const bodyA = JSON.parse(findRequests(fetchMock, '/api/webgpu-fireworks/config')[0][1].body);
    const mediumThreshold = document.getElementById('tier-medium');
    mediumThreshold.value = '275';
    mediumThreshold.dispatchEvent(new window.Event('change', { bubbles: true }));

    saveA.resolve(jsonResponse({ success: true, config: normalizeConfig(bodyA) }));
    await new Promise(resolve => setImmediate(resolve));

    expect(mediumThreshold.value).toBe('275');
    document.getElementById('save-btn').click();
    await waitFor(() => expect(findRequests(fetchMock, '/api/webgpu-fireworks/config')).toHaveLength(2));
    const bodyB = JSON.parse(findRequests(fetchMock, '/api/webgpu-fireworks/config')[1][1].body);
    expect(bodyB.escalationThresholds.medium).toBe(275);
  });

  test('save-correlated socket updates cannot roll back newer unsaved edits', async () => {
    const saveA = deferred();
    const { window, fetchMock, socketHandlers } = await bootSettings({
      saveResponses: [saveA.promise]
    });
    const document = window.document;

    document.getElementById('save-btn').click();
    await waitFor(() => expect(findRequests(fetchMock, '/api/webgpu-fireworks/config')).toHaveLength(1));
    const bodyA = JSON.parse(findRequests(fetchMock, '/api/webgpu-fireworks/config')[0][1].body);
    document.getElementById('superfan-finale-toggle').click();
    const intensity = document.getElementById('superfan-finale-intensity');
    intensity.value = '8.5';
    intensity.dispatchEvent(new window.Event('input', { bubbles: true }));

    try {
      socketHandlers.get('webgpu-fireworks:config-update')({ config: normalizeConfig(bodyA) });
      expect(document.getElementById('superfan-finale-toggle').classList.contains('active')).toBe(false);
      expect(document.getElementById('superfan-finale-intensity').value).toBe('8.5');
      await expect(readCurrentSuperfanSettings(window, fetchMock)).resolves.toMatchObject({
        superfanFinaleEnabled: false,
        superfanFinaleIntensity: 8.5
      });
    } finally {
      saveA.resolve(jsonResponse({ success: true, config: normalizeConfig(bodyA) }));
      await new Promise(resolve => setImmediate(resolve));
    }
  });

  test('socket config updates still apply while the form is clean and no save is active', async () => {
    const { window, fetchMock, socketHandlers } = await bootSettings();
    const remoteConfig = normalizeConfig({
      superfanFinaleEnabled: false,
      superfanFinaleIntensity: 5.5
    });

    socketHandlers.get('webgpu-fireworks:config-update')({ config: remoteConfig });

    expect(window.document.getElementById('superfan-finale-toggle').classList.contains('active')).toBe(false);
    expect(window.document.getElementById('superfan-finale-intensity').value).toBe('5.5');
    await expect(readCurrentSuperfanSettings(window, fetchMock)).resolves.toMatchObject({
      superfanFinaleEnabled: false,
      superfanFinaleIntensity: 5.5
    });
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
    const endCardDuration = document.getElementById('superfan-end-card-duration');
    endCardDuration.value = '4.5';
    endCardDuration.dispatchEvent(new window.Event('input', { bubbles: true }));
    const endCardPosition = document.getElementById('superfan-end-card-position');
    endCardPosition.value = 'bottom-right';
    endCardPosition.dispatchEvent(new window.Event('change', { bubbles: true }));
    const endCardSize = document.getElementById('superfan-end-card-size');
    endCardSize.value = 'custom';
    endCardSize.dispatchEvent(new window.Event('change', { bubbles: true }));
    const endCardScale = document.getElementById('superfan-end-card-scale');
    endCardScale.value = '1.6';
    endCardScale.dispatchEvent(new window.Event('input', { bubbles: true }));
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
      superfanEndCardDuration: 4500,
      superfanEndCardPosition: 'bottom-right',
      superfanEndCardSize: 'custom',
      superfanEndCardScale: 1.6,
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
