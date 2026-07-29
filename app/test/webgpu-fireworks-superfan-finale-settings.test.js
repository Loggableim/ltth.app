const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const {
  CONFIG_ENUMS,
  CONFIG_LIMITS,
  normalizeConfig
} = require('../plugins/webgpu-fireworks/lib/config-schema');

describe('WebGPU Superfan finale settings', () => {
  const pluginDir = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
  const html = fs.readFileSync(path.join(pluginDir, 'ui', 'settings.html'), 'utf8');
  const showOptionsScript = fs.readFileSync(path.join(pluginDir, 'ui', 'show-style-options.js'), 'utf8');
  const settingsContractScript = fs.readFileSync(path.join(pluginDir, 'ui', 'settings-contract.js'), 'utf8');
  const script = fs.readFileSync(path.join(pluginDir, 'ui', 'settings.js'), 'utf8');
  const customStyle = 'custom:00000000-0000-4000-8000-000000000611';
  let dom;

  afterEach(() => {
    dom?.window.close();
    dom = null;
  });

  function jsonResponse(body, ok = true) {
    const payload = body?.config
      ? { ...body, limits: body.limits || CONFIG_LIMITS, enums: body.enums || CONFIG_ENUMS }
      : body;
    return { ok, json: async () => payload };
  }

  function deferred() {
    let resolve;
    const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
    return { promise, resolve };
  }

  async function waitFor(assertion) {
    const startedAt = Date.now();
    let lastError;
    while (Date.now() - startedAt < 5000) {
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

  async function bootSettings({
    initialConfig = {},
    saveResponses = [],
    testResponse,
    translations = {},
    showCatalog = {
      success: true,
      selectableStyles: [{ id: customStyle, name: 'Streamer Signature', builtIn: false }]
    }
  } = {}) {
    const loadedConfig = normalizeConfig(initialConfig);
    dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'http://localhost:3000/webgpu-fireworks/ui'
    });
    const { window } = dom;
    const i18nHandlers = { change: [], languageChange: [] };
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
      onChange: jest.fn(handler => i18nHandlers.change.push(handler)),
      onLanguageChange: jest.fn(handler => i18nHandlers.languageChange.push(handler)),
      t: jest.fn(key => translations[key] || key)
    };
    const socketHandlers = new Map();
    window.io = jest.fn(() => ({
      on: jest.fn((event, handler) => socketHandlers.set(event, data => handler(
        event === 'webgpu-fireworks:config-update' && data?.config
          ? { ...data, limits: data.limits || CONFIG_LIMITS, enums: data.enums || CONFIG_ENUMS }
          : data
      ))),
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
      if (requestUrl === '/api/webgpu-fireworks/shows') {
        return jsonResponse(showCatalog);
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
      if (requestUrl === '/api/webgpu-fireworks/finale' && options.method === 'POST') {
        return jsonResponse({ success: true, accepted: true });
      }
      throw new Error(`Unexpected request: ${requestUrl}`);
    });
    window.fetch = fetchMock;

    window.eval(showOptionsScript);
    window.eval(settingsContractScript);
    window.eval(script);
    await ready;
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/webgpu-fireworks/status')).toBe(true);
    });
    await new Promise(resolve => setImmediate(resolve));

    return { window, fetchMock, socketHandlers, i18nHandlers };
  }

  test('exposes fail-closed Superfan controls and applies their backend contracts', async () => {
    for (const id of [
      'superfan-finale-toggle', 'superfan-finale-cooldown',
      'superfan-finale-intensity', 'superfan-finale-intensity-value',
      'superfan-finale-style', 'superfan-finale-length',
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
    const staticDocument = new JSDOM(html).window.document;
    const staticIntensity = staticDocument.getElementById('superfan-finale-intensity');
    expect(staticIntensity.disabled).toBe(true);
    expect(staticIntensity.hasAttribute('min')).toBe(false);
    expect(staticIntensity.hasAttribute('max')).toBe(false);
    expect(staticIntensity.hasAttribute('step')).toBe(false);

    const { window } = await bootSettings();
    const intensity = window.document.getElementById('superfan-finale-intensity');
    expect(intensity.disabled).toBe(false);
    expect(Number(intensity.min)).toBe(CONFIG_LIMITS.superfanFinaleIntensity.min);
    expect(Number(intensity.max)).toBe(CONFIG_LIMITS.superfanFinaleIntensity.max);
    expect(Number(intensity.step)).toBe(CONFIG_LIMITS.superfanFinaleIntensity.step);
    expect(window.document.getElementById('superfan-finale-cooldown').disabled).toBe(false);
    expect(html).toContain('id="superfan-finale-style"');
    expect(html).toContain('id="superfan-finale-length"');
    expect(html).toContain('href="/webgpu-fireworks/designer"');
  });

  test('loads and saves exact Superfan style and length overrides', async () => {
    const { window, fetchMock } = await bootSettings({
      initialConfig: {
        superfanFinaleStyle: customStyle,
        superfanFinaleLength: 'long'
      }
    });
    const document = window.document;
    await waitFor(() => expect(document.getElementById('superfan-finale-style').value).toBe(customStyle));
    expect(document.getElementById('superfan-finale-length').value).toBe('long');

    const style = document.getElementById('superfan-finale-style');
    style.value = 'nishiki-kamuro';
    style.dispatchEvent(new window.Event('change', { bubbles: true }));
    const length = document.getElementById('superfan-finale-length');
    length.value = 'short';
    length.dispatchEvent(new window.Event('change', { bubbles: true }));

    document.getElementById('save-btn').click();
    await waitFor(() => expect(findRequest(fetchMock, '/api/webgpu-fireworks/config')).toBeDefined());
    const saved = JSON.parse(findRequest(fetchMock, '/api/webgpu-fireworks/config')[1].body);
    expect(saved.superfanFinaleStyle).toBe('nishiki-kamuro');
    expect(saved.superfanFinaleLength).toBe('short');
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
      translations: { 'plugins.webgpu-fireworks.webgpu_fireworks.superfan_finale_test_success': successText }
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
    const superfanStyle = document.getElementById('superfan-finale-style');
    superfanStyle.value = customStyle;
    superfanStyle.dispatchEvent(new window.Event('change', { bubbles: true }));
    const superfanLength = document.getElementById('superfan-finale-length');
    superfanLength.value = 'long';
    superfanLength.dispatchEvent(new window.Event('change', { bubbles: true }));

    document.getElementById('test-superfan-finale-btn').click();
    await waitFor(() => expect(findRequest(fetchMock, '/api/webgpu-fireworks/test-superfan')).toBeDefined());
    const requestBody = JSON.parse(findRequest(fetchMock, '/api/webgpu-fireworks/test-superfan')[1].body);
    expect(requestBody.settings).toEqual({
      superfanFinaleEnabled: false,
      superfanFinaleCooldownHours: 168,
      superfanFinaleIntensity: 7.5,
      superfanFinaleStyle: customStyle,
      superfanFinaleLength: 'long',
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

  test('global test button sends the exact selected dynamic style, length, and intensity', async () => {
    const { window, fetchMock } = await bootSettings({
      initialConfig: {
        goalFinaleStyle: customStyle,
        goalFinaleLength: 'long',
        goalFinaleIntensity: 4.5
      }
    });
    const document = window.document;
    await waitFor(() => expect(document.getElementById('finale-style').value).toBe(customStyle));

    document.getElementById('test-finale-btn').click();
    await waitFor(() => expect(findRequest(fetchMock, '/api/webgpu-fireworks/finale')).toBeDefined());
    expect(JSON.parse(findRequest(fetchMock, '/api/webgpu-fireworks/finale')[1].body)).toEqual({
      style: customStyle,
      length: 'long',
      intensity: 4.5,
      testRequest: true
    });
  });

  test('live language changes refresh programmatic options and status once across both i18n events', async () => {
    const translations = {
      'plugins.webgpu-fireworks.webgpu_fireworks.finale_style_auto': 'Auto EN',
      'plugins.webgpu-fireworks.webgpu_fireworks.finale_global_default': 'Global EN',
      'plugins.webgpu-fireworks.webgpu_fireworks.finale_length_short': 'Short EN',
      'plugins.webgpu-fireworks.shows.classic-crescendo.title': 'Classic EN'
    };
    const { window, fetchMock, i18nHandlers } = await bootSettings({ translations });
    const document = window.document;
    const optionText = (selectId, value) => document
      .getElementById(selectId)
      .querySelector(`option[value="${value}"]`)
      ?.textContent;

    await waitFor(() => expect(optionText('finale-style', 'auto')).toBe('Auto EN'));
    expect(optionText('superfan-finale-style', 'inherit')).toBe('Global EN');
    expect(optionText('finale-length', 'short')).toBe('Short EN');
    expect(optionText('finale-style', 'classic-crescendo')).toBe('Classic EN');
    expect(i18nHandlers.change).toHaveLength(1);
    expect(i18nHandlers.languageChange).toHaveLength(1);

    Object.assign(translations, {
      'plugins.webgpu-fireworks.webgpu_fireworks.finale_style_auto': 'Auto DE',
      'plugins.webgpu-fireworks.webgpu_fireworks.finale_global_default': 'Global DE',
      'plugins.webgpu-fireworks.webgpu_fireworks.finale_length_short': 'Kurz DE',
      'plugins.webgpu-fireworks.shows.classic-crescendo.title': 'Klassisch DE'
    });
    const statusRequestsBefore = fetchMock.mock.calls
      .filter(([url]) => String(url) === '/api/webgpu-fireworks/status').length;

    i18nHandlers.languageChange[0]();

    await waitFor(() => expect(optionText('finale-style', 'auto')).toBe('Auto DE'));
    expect(optionText('superfan-finale-style', 'inherit')).toBe('Global DE');
    expect(optionText('finale-length', 'short')).toBe('Kurz DE');
    expect(optionText('finale-style', 'classic-crescendo')).toBe('Klassisch DE');
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/webgpu-fireworks/status'))
      .toHaveLength(statusRequestsBefore + 1);

    Object.assign(translations, {
      'plugins.webgpu-fireworks.webgpu_fireworks.finale_style_auto': 'Auto FR',
      'plugins.webgpu-fireworks.webgpu_fireworks.finale_global_default': 'Global FR',
      'plugins.webgpu-fireworks.webgpu_fireworks.finale_length_short': 'Court FR',
      'plugins.webgpu-fireworks.shows.classic-crescendo.title': 'Classique FR'
    });
    const duplicateStatusRequestsBefore = fetchMock.mock.calls
      .filter(([url]) => String(url) === '/api/webgpu-fireworks/status').length;
    const updateDomCallsBefore = window.i18n.updateDOM.mock.calls.length;

    i18nHandlers.change[0]();
    i18nHandlers.languageChange[0]();

    await waitFor(() => expect(optionText('finale-style', 'auto')).toBe('Auto FR'));
    expect(optionText('superfan-finale-style', 'inherit')).toBe('Global FR');
    expect(optionText('finale-length', 'short')).toBe('Court FR');
    expect(optionText('finale-style', 'classic-crescendo')).toBe('Classique FR');
    expect(window.i18n.updateDOM).toHaveBeenCalledTimes(updateDomCallsBefore + 1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/webgpu-fireworks/status'))
      .toHaveLength(duplicateStatusRequestsBefore + 1);
  });

  test('test button shows localized failure text with a safe backend reason', async () => {
    const failureText = 'Localized Superfan failure';
    const backendReason = 'renderer-not-ready <img src=x onerror="danger()">';
    const { window } = await bootSettings({
      testResponse: { ok: true, body: { success: false, accepted: false, reason: backendReason } },
      translations: { 'plugins.webgpu-fireworks.webgpu_fireworks.superfan_finale_test_failed': failureText }
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
      'Failed to trigger Superfan finale', 'End card duration (seconds)', 'End card position',
      'Top left', 'Top center', 'Top right', 'Center', 'Bottom left', 'Bottom center', 'Bottom right',
      'End card size', 'Small', 'Medium', 'Large', 'Custom', 'Custom end card scale'
    ],
    de: [
      'Superfan-Finale', 'Superfan-Finales aktivieren', 'Wiederholung pro Superfan',
      'Alle 6 Stunden', 'Alle 12 Stunden', 'Alle 24 Stunden', 'Alle 3 Tage', 'Alle 7 Tage',
      'Finale-Intensität', 'Superfan-Finale testen', 'Superfan-Finale ausgelöst!',
      'Superfan-Finale konnte nicht ausgelöst werden', 'Dauer der Abschlussanzeige (Sekunden)',
      'Position der Abschlussanzeige', 'Oben links', 'Oben mittig', 'Oben rechts', 'Mitte',
      'Unten links', 'Unten mittig', 'Unten rechts', 'Größe der Abschlussanzeige',
      'Klein', 'Mittel', 'Groß', 'Benutzerdefiniert', 'Benutzerdefinierte Skalierung der Abschlussanzeige'
    ],
    es: [
      'Final de Superfan', 'Activar finales de Superfan', 'Repetición por Superfan',
      'Cada 6 horas', 'Cada 12 horas', 'Cada 24 horas', 'Cada 3 días', 'Cada 7 días',
      'Intensidad del final', 'Probar final de Superfan', '¡Final de Superfan activado!',
      'No se pudo activar el final de Superfan', 'Duración de la tarjeta final (segundos)',
      'Posición de la tarjeta final', 'Arriba a la izquierda', 'Arriba al centro', 'Arriba a la derecha',
      'Centro', 'Abajo a la izquierda', 'Abajo al centro', 'Abajo a la derecha',
      'Tamaño de la tarjeta final', 'Pequeño', 'Mediano', 'Grande', 'Personalizado',
      'Escala personalizada de la tarjeta final'
    ],
    fr: [
      'Finale Superfan', 'Activer les finales Superfan', 'Répétition par Superfan',
      'Toutes les 6 heures', 'Toutes les 12 heures', 'Toutes les 24 heures', 'Tous les 3 jours', 'Tous les 7 jours',
      'Intensité de la finale', 'Tester la finale Superfan', 'Finale Superfan déclenchée !',
      'Échec du déclenchement de la finale Superfan', 'Durée de la carte de fin (secondes)',
      'Position de la carte de fin', 'En haut à gauche', 'En haut au centre', 'En haut à droite',
      'Centre', 'En bas à gauche', 'En bas au centre', 'En bas à droite', 'Taille de la carte de fin',
      'Petite', 'Moyenne', 'Grande', 'Personnalisée', 'Échelle personnalisée de la carte de fin'
    ]
  };

  test.each(['de', 'en', 'es', 'fr'])('ships all Superfan finale labels in %s', locale => {
    const messages = JSON.parse(
      fs.readFileSync(path.join(pluginDir, 'locales', `${locale}.json`), 'utf8')
    ).plugins['webgpu-fireworks'];
    const keys = [
      'superfan_finale', 'enable_superfan_finale', 'superfan_finale_cooldown',
      'superfan_finale_every_6h', 'superfan_finale_every_12h', 'superfan_finale_every_24h',
      'superfan_finale_every_3d', 'superfan_finale_every_7d', 'superfan_finale_intensity',
      'test_superfan_finale', 'superfan_finale_test_success', 'superfan_finale_test_failed',
      'superfan_end_card_duration', 'superfan_end_card_position',
      'superfan_end_card_position_top_left', 'superfan_end_card_position_top_center',
      'superfan_end_card_position_top_right', 'superfan_end_card_position_center',
      'superfan_end_card_position_bottom_left', 'superfan_end_card_position_bottom_center',
      'superfan_end_card_position_bottom_right', 'superfan_end_card_size',
      'superfan_end_card_size_small', 'superfan_end_card_size_medium',
      'superfan_end_card_size_large', 'superfan_end_card_size_custom', 'superfan_end_card_scale'
    ];
    expect(keys.map(key => messages.webgpu_fireworks[key])).toEqual(localeMessages[locale]);
  });
});
