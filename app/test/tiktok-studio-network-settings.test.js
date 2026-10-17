'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const {
  render,
  stop,
  copyTunnelURL
} = require('../public/js/network-overlay-tunnel');

function element() {
  return {
    textContent: '',
    className: '',
    disabled: false,
    style: { display: '' }
  };
}

function harness() {
  const elements = Object.fromEntries([
    'network-overlay-tunnel-status',
    'network-overlay-tunnel-url',
    'network-overlay-tunnel-url-text',
    'network-overlay-tunnel-copy',
    'network-overlay-tunnel-stop',
    'network-overlay-tunnel-error'
  ].map(id => [id, element()]));
  const translations = {
    'network.overlay_tunnel.active': 'Aktiv',
    'network.overlay_tunnel.inactive': 'Inaktiv',
    'network.overlay_tunnel.starting': 'Wird gestartet…'
  };
  return {
    elements,
    getElementById: id => elements[id] || null,
    translate: (key, fallback) => translations[key] || fallback
  };
}

function bootNetworkSettingsDom({ configs, clipboardWrite }) {
  const settings = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'network-settings.js'),
    'utf8'
  );
  const dom = new JSDOM(`
    <select id="network-bind-mode"><option value="local">Local</option></select>
    <div id="network-overlay-tunnel-status"></div>
    <div id="network-overlay-tunnel-url"><span id="network-overlay-tunnel-url-text"></span></div>
    <button id="network-overlay-tunnel-copy"></button>
    <button id="network-overlay-tunnel-stop"></button>
    <div id="network-overlay-tunnel-error"></div>
  `, { url: 'http://127.0.0.1:3000/dashboard.html#settings', runScripts: 'outside-only' });
  const { window } = dom;
  window.setInterval = jest.fn(() => 1);
  window.clearInterval = jest.fn();
  window.fetch = jest.fn().mockImplementation(() => {
    const config = configs[Math.min(window.fetch.mock.calls.length - 1, configs.length - 1)] || configs[0];
    return Promise.resolve({ ok: true, json: async () => ({ success: true, config }) });
  });
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWrite }
  });
  window.showToast = jest.fn();
  window.LTTHNetworkOverlayTunnel = {
    render: (config, { translate }) => render(config, {
      getElementById: id => window.document.getElementById(id),
      translate
    }),
    copyTunnelURL: url => copyTunnelURL(url, { navigatorRef: window.navigator })
  };
  window.eval(settings);
  return { dom, window };
}

describe('Overlay Quick Tunnel network status', () => {
  test('renders an inactive tunnel without exposing controls that need a URL', () => {
    const deps = harness();

    render({
      active: false,
      starting: false,
      url: null,
      lastError: null
    }, deps);

    expect(deps.elements['network-overlay-tunnel-status']).toMatchObject({
      textContent: 'Inaktiv',
      className: 'text-sm text-gray-400'
    });
    expect(deps.elements['network-overlay-tunnel-url'].style.display).toBe('none');
    expect(deps.elements['network-overlay-tunnel-copy'].disabled).toBe(true);
    expect(deps.elements['network-overlay-tunnel-stop'].disabled).toBe(true);
    expect(deps.elements['network-overlay-tunnel-error'].style.display).toBe('none');
  });

  test('renders the starting state without inventing a public URL', () => {
    const deps = harness();

    render({
      active: false,
      starting: true,
      url: null,
      lastError: null
    }, deps);

    expect(deps.elements['network-overlay-tunnel-status']).toMatchObject({
      textContent: 'Wird gestartet…',
      className: 'text-sm text-yellow-400'
    });
    expect(deps.elements['network-overlay-tunnel-url'].style.display).toBe('none');
    expect(deps.elements['network-overlay-tunnel-stop'].disabled).toBe(false);
  });

  test('renders the active URL and enables stop and copy', () => {
    const deps = harness();
    const url = 'https://quiet-river.trycloudflare.com';

    render({
      active: true,
      starting: false,
      url,
      lastError: null
    }, deps);

    expect(deps.elements['network-overlay-tunnel-status']).toMatchObject({
      textContent: 'Aktiv',
      className: 'text-sm text-green-400'
    });
    expect(deps.elements['network-overlay-tunnel-url'].style.display).toBe('flex');
    expect(deps.elements['network-overlay-tunnel-url-text'].textContent).toBe(url);
    expect(deps.elements['network-overlay-tunnel-copy'].disabled).toBe(false);
    expect(deps.elements['network-overlay-tunnel-stop'].disabled).toBe(false);
  });

  test('shows a bounded server error without changing it into HTML', () => {
    const deps = harness();

    render({
      active: false,
      starting: false,
      url: null,
      lastError: '<failed>'
    }, deps);

    expect(deps.elements['network-overlay-tunnel-error'].style.display).toBe('block');
    expect(deps.elements['network-overlay-tunnel-error'].textContent).toBe('<failed>');
  });

  test('stops the overlay tunnel through the dedicated endpoint', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true })
    });

    await expect(stop({ fetchImpl })).resolves.toEqual({ success: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/network/overlay-tunnel/stop',
      { method: 'POST' }
    );
  });

  test('rejects a failed stop response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({
        success: false,
        code: 'OVERLAY_TUNNEL_STOP_FAILED'
      })
    });

    await expect(stop({ fetchImpl })).rejects.toMatchObject({
      code: 'OVERLAY_TUNNEL_STOP_FAILED'
    });
  });

  test('copies only a valid active Quick Tunnel URL', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const url = 'https://quiet-river.trycloudflare.com';

    await expect(copyTunnelURL(url, {
      navigatorRef: { clipboard: { writeText } }
    })).resolves.toBe(url);
    expect(writeText).toHaveBeenCalledWith(url);
  });

  test.each([
    '',
    'http://quiet-river.trycloudflare.com',
    'https://example.com',
    'https://user:pass@quiet-river.trycloudflare.com'
  ])('refuses to copy invalid tunnel base URL %s', async url => {
    const writeText = jest.fn();

    await expect(copyTunnelURL(url, {
      navigatorRef: { clipboard: { writeText } }
    })).rejects.toMatchObject({ code: 'OVERLAY_TUNNEL_URL_INVALID' });
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('Overlay Quick Tunnel dashboard integration', () => {
  const publicRoot = path.join(__dirname, '..', 'public');

  test('loads the status helper before network settings and provides its controls', () => {
    const dashboard = fs.readFileSync(
      path.join(publicRoot, 'dashboard.html'),
      'utf8'
    );
    const helperIndex = dashboard.indexOf(
      '<script src="/js/network-overlay-tunnel.js"></script>'
    );
    const settingsIndex = dashboard.indexOf(
      '<script src="/js/network-settings.js"></script>'
    );

    expect(helperIndex).toBeGreaterThan(-1);
    expect(helperIndex).toBeLessThan(settingsIndex);
    [
      'network-overlay-tunnel-status',
      'network-overlay-tunnel-url',
      'network-overlay-tunnel-url-text',
      'network-overlay-tunnel-copy',
      'network-overlay-tunnel-stop',
      'network-overlay-tunnel-error'
    ].forEach(id => expect(dashboard).toContain(`id="${id}"`));
  });

  test('loads the stable management helper before network settings', () => {
    const dashboard = fs.readFileSync(
      path.join(publicRoot, 'dashboard.html'),
      'utf8'
    );
    const stableIndex = dashboard.indexOf(
      '<script src="/js/stable-overlay-routing.js"></script>'
    );
    const settingsIndex = dashboard.indexOf(
      '<script src="/js/network-settings.js"></script>'
    );

    expect(stableIndex).toBeGreaterThan(-1);
    expect(stableIndex).toBeLessThan(settingsIndex);
    expect(dashboard).toContain('id="stable-overlay-routing-card"');
    expect(dashboard).toContain('data-stable-overlay-routing-root');
  });

  test('renders and stops through the helper without starting on page load', () => {
    const settings = fs.readFileSync(
      path.join(publicRoot, 'js', 'network-settings.js'),
      'utf8'
    );

    expect(settings).toContain(
      'LTTHNetworkOverlayTunnel.render(networkConfig.overlayTunnel'
    );
    expect(settings).toContain('LTTHNetworkOverlayTunnel.stop()');
    expect(settings).not.toContain(
      "fetch('/api/network/overlay-tunnel/ensure'"
    );
  });

  test('shows and copies the newly refreshed overlay tunnel address', async () => {
    const config = url => ({
      bindMode: 'local', interfaces: [], selectedIfaces: [], externalURLs: [], accessURLs: [],
      overlayTunnel: { active: true, starting: false, url, lastError: null }
    });
    const clipboardWrite = jest.fn().mockResolvedValue(undefined);
    const { dom, window } = bootNetworkSettingsDom({
      configs: [
        config('https://old-cloud.trycloudflare.com'),
        config('https://new-cloud.trycloudflare.com')
      ],
      clipboardWrite
    });
    try {
      await new Promise(resolve => setImmediate(resolve));
      expect(window.document.getElementById('network-overlay-tunnel-url-text').textContent)
        .toBe('https://old-cloud.trycloudflare.com');

      window.dispatchEvent(new window.Event('focus'));
      await new Promise(resolve => setImmediate(resolve));
      const copyButton = window.document.getElementById('network-overlay-tunnel-copy');
      expect(window.document.getElementById('network-overlay-tunnel-url-text').textContent)
        .toBe('https://new-cloud.trycloudflare.com');
      expect(copyButton.disabled).toBe(false);

      copyButton.click();
      await new Promise(resolve => setImmediate(resolve));

      expect(clipboardWrite).toHaveBeenCalledWith('https://new-cloud.trycloudflare.com');
      expect(window.showToast).toHaveBeenCalledWith('TikTok Studio URL copied', 'success');
      expect(window.fetch).toHaveBeenNthCalledWith(3, '/api/network/config', { cache: 'no-store' });
    } finally {
      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      dom.window.close();
    }
  });

  test('refreshes the overlay tunnel address before copying after a host change', async () => {
    const config = url => ({
      bindMode: 'local', interfaces: [], selectedIfaces: [], externalURLs: [], accessURLs: [],
      overlayTunnel: { active: true, starting: false, url, lastError: null }
    });
    const clipboardWrite = jest.fn().mockResolvedValue(undefined);
    const { dom, window } = bootNetworkSettingsDom({
      configs: [
        config('https://old-cloud.trycloudflare.com'),
        config('https://new-cloud.trycloudflare.com')
      ],
      clipboardWrite
    });
    try {
      await new Promise(resolve => setImmediate(resolve));
      const copyButton = window.document.getElementById('network-overlay-tunnel-copy');
      expect(window.document.getElementById('network-overlay-tunnel-url-text').textContent)
        .toBe('https://old-cloud.trycloudflare.com');

      copyButton.click();
      await new Promise(resolve => setImmediate(resolve));

      expect(window.fetch).toHaveBeenNthCalledWith(2, '/api/network/config', { cache: 'no-store' });
      expect(clipboardWrite).toHaveBeenCalledWith('https://new-cloud.trycloudflare.com');
      expect(window.showToast).toHaveBeenCalledWith('TikTok Studio URL copied', 'success');
    } finally {
      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      dom.window.close();
    }
  });

  test('does not copy a stale URL when the status read fails during copy', async () => {
    const clipboardWrite = jest.fn().mockResolvedValue(undefined);
    const config = {
      bindMode: 'local', interfaces: [], selectedIfaces: [], externalURLs: [], accessURLs: [],
      overlayTunnel: {
        active: true, starting: false,
        url: 'https://old-cloud.trycloudflare.com', lastError: null
      }
    };
    const { dom, window } = bootNetworkSettingsDom({ configs: [config], clipboardWrite });
    try {
      await new Promise(resolve => setImmediate(resolve));
      const copyButton = window.document.getElementById('network-overlay-tunnel-copy');
      expect(copyButton.disabled).toBe(false);

      window.fetch.mockRejectedValueOnce(new Error('status unavailable'));
      copyButton.click();
      await new Promise(resolve => setImmediate(resolve));

      expect(clipboardWrite).not.toHaveBeenCalled();
      expect(window.document.getElementById('network-overlay-tunnel-url').style.display).toBe('none');
      expect(copyButton.disabled).toBe(true);
      expect(window.document.getElementById('network-overlay-tunnel-error').textContent)
        .toBe('Tunnel status is unavailable');
      expect(window.showToast).toHaveBeenCalledWith('Could not copy the TikTok Studio URL', 'error');
    } finally {
      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      dom.window.close();
    }
  });

  test('shows visible error feedback when the overlay tunnel clipboard write fails', async () => {
    const config = {
      bindMode: 'local', interfaces: [], selectedIfaces: [], externalURLs: [], accessURLs: [],
      overlayTunnel: {
        active: true, starting: false,
        url: 'https://current-cloud.trycloudflare.com', lastError: null
      }
    };
    const clipboardWrite = jest.fn().mockRejectedValue(new Error('clipboard denied'));
    const { dom, window } = bootNetworkSettingsDom({ configs: [config], clipboardWrite });
    try {
      await new Promise(resolve => setImmediate(resolve));
      const copyButton = window.document.getElementById('network-overlay-tunnel-copy');
      expect(copyButton.disabled).toBe(false);
      copyButton.click();
      await new Promise(resolve => setImmediate(resolve));

      expect(clipboardWrite).toHaveBeenCalledWith('https://current-cloud.trycloudflare.com');
      expect(window.showToast).toHaveBeenCalledWith('Could not copy the TikTok Studio URL', 'error');
      expect(window.document.getElementById('network-overlay-tunnel-url-text').textContent)
        .toBe('https://current-cloud.trycloudflare.com');
    } finally {
      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
      dom.window.close();
    }
  });

  test('resumes polling after BFCache and ignores stale or final-hide responses', async () => {
    const settings = fs.readFileSync(
      path.join(publicRoot, 'js', 'network-settings.js'),
      'utf8'
    );
    const dom = new JSDOM(`
      <div>
        <select id="network-bind-mode"><option value="local">Local</option></select>
        <div id="network-overlay-tunnel-status"></div>
        <div id="network-overlay-tunnel-url"><span id="network-overlay-tunnel-url-text"></span></div>
        <button id="network-overlay-tunnel-copy"></button>
        <button id="network-overlay-tunnel-stop"></button>
        <div id="network-overlay-tunnel-error"></div>
      </div>
    `, { url: 'http://127.0.0.1:3000/dashboard.html#settings', runScripts: 'outside-only' });
    const { window } = dom;
    const timers = new Map();
    let nextTimerId = 0;
    window.setInterval = jest.fn(callback => {
      const id = ++nextTimerId;
      timers.set(id, callback);
      return id;
    });
    window.clearInterval = jest.fn();
    Object.defineProperty(window.document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
    const activeConfig = {
      bindMode: 'local', interfaces: [], selectedIfaces: [], externalURLs: [], accessURLs: {},
      overlayTunnel: { active: true, starting: false, url: 'https://quiet-river.trycloudflare.com', lastError: null }
    };
    const inactiveConfig = { ...activeConfig, overlayTunnel: { active: false, starting: false, url: null, lastError: 'Quick Tunnel process exited' } };
    const renewedConfig = { ...activeConfig, overlayTunnel: { active: true, starting: false, url: 'https://silver-cloud.trycloudflare.com', lastError: null } };
    const deferred = () => {
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      return { promise, resolve };
    };
    const reads = [deferred(), deferred(), deferred(), deferred(), deferred(), deferred()];
    const fetchImpl = jest.fn(() => reads[fetchImpl.mock.calls.length - 1].promise);
    window.fetch = fetchImpl;
    const renderTunnel = jest.fn((config, { translate }) => render(config, {
      getElementById: id => window.document.getElementById(id),
      translate
    }));
    const clipboardWrite = jest.fn().mockRejectedValue(new Error('clipboard denied'));
    window.showToast = jest.fn();
    window.LTTHNetworkOverlayTunnel = {
      render: renderTunnel,
      copyTunnelURL: url => copyTunnelURL(url, { navigatorRef: { clipboard: { writeText: clipboardWrite } } })
    };

    window.eval(settings);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    reads[0].resolve({ ok: true, json: async () => ({ success: true, config: activeConfig }) });
    await new Promise(resolve => setImmediate(resolve));
    expect(window.document.getElementById('network-overlay-tunnel-url-text').textContent)
      .toBe('https://quiet-river.trycloudflare.com');
    expect(window.document.getElementById('network-overlay-tunnel-copy').disabled).toBe(false);

    const firstTimer = [...timers.keys()][0];
    window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
    expect(window.clearInterval).toHaveBeenCalledWith(firstTimer);
    expect(timers.has(firstTimer)).toBe(true);
    window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
    expect(window.setInterval).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new window.Event('focus'));
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    reads[2].resolve({ ok: true, json: async () => ({ success: true, config: inactiveConfig }) });
    await new Promise(resolve => setImmediate(resolve));
    expect(window.document.getElementById('network-overlay-tunnel-url').style.display).toBe('none');
    expect(window.document.getElementById('network-overlay-tunnel-url-text').textContent).toBe('');
    expect(window.document.getElementById('network-overlay-tunnel-copy').disabled).toBe(true);
    expect(window.document.getElementById('network-overlay-tunnel-stop').disabled).toBe(true);
    expect(window.document.getElementById('network-overlay-tunnel-error').textContent)
      .toBe('Quick Tunnel process exited');
    reads[1].resolve({ ok: true, json: async () => ({ success: true, config: activeConfig }) });
    await new Promise(resolve => setImmediate(resolve));
    expect(window.document.getElementById('network-overlay-tunnel-url').style.display).toBe('none');

    window.dispatchEvent(new window.Event('focus'));
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    reads[3].resolve({ ok: true, json: async () => ({ success: true, config: renewedConfig }) });
    await new Promise(resolve => setImmediate(resolve));
    expect(window.document.getElementById('network-overlay-tunnel-url-text').textContent)
      .toBe('https://silver-cloud.trycloudflare.com');
    window.document.getElementById('network-overlay-tunnel-copy').click();
    reads[4].resolve({ ok: true, json: async () => ({ success: true, config: renewedConfig }) });
    await new Promise(resolve => setImmediate(resolve));
    expect(clipboardWrite).toHaveBeenCalledWith('https://silver-cloud.trycloudflare.com');
    expect(window.showToast).toHaveBeenCalledWith('Could not copy the TikTok Studio URL', 'error');

    window.dispatchEvent(new window.Event('focus'));
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    const rendersBeforeFinalHide = renderTunnel.mock.calls.length;
    window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
    reads[5].resolve({ ok: true, json: async () => ({ success: true, config: activeConfig }) });
    await new Promise(resolve => setImmediate(resolve));
    expect(renderTunnel).toHaveBeenCalledTimes(rendersBeforeFinalHide);
    window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
    window.dispatchEvent(new window.Event('focus'));
    expect(window.setInterval).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(6);

    expect(fetchImpl.mock.calls.every(([url, options]) => url === '/api/network/config' && (!options || options.method === undefined)))
      .toBe(true);
    window.close();
  });

  test.each([
    ['HTTP failure', async () => ({ ok: false, json: async () => ({ success: true, config: { overlayTunnel: { active: true, url: 'https://stale.trycloudflare.com' } } }) })],
    ['malformed response', async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } })],
    ['invalid response shape', async () => ({ ok: true, json: async () => ({ success: false }) })],
    ['unavailable endpoint', async () => { throw new Error('offline'); }]
  ])('clears stale copy state after %s', async (_label, failingFetch) => {
    const settings = fs.readFileSync(
      path.join(publicRoot, 'js', 'network-settings.js'),
      'utf8'
    );
    const dom = new JSDOM(`
      <div class="settings-card">
        <select id="network-bind-mode"><option value="local">Local</option></select>
        <div id="network-overlay-tunnel-status"></div>
        <div id="network-overlay-tunnel-url"><span id="network-overlay-tunnel-url-text"></span></div>
        <button id="network-overlay-tunnel-copy"></button>
        <button id="network-overlay-tunnel-stop"></button>
        <div id="network-overlay-tunnel-error"></div>
      </div>
    `, { url: 'http://127.0.0.1:3000/dashboard.html#settings', runScripts: 'outside-only' });
    const { window } = dom;
    window.setInterval = jest.fn(() => 1);
    window.clearInterval = jest.fn();
    Object.defineProperty(window.document, 'visibilityState', { configurable: true, value: 'visible' });
    window.document.querySelector('.settings-card').getClientRects = () => [{}];
    const config = {
      bindMode: 'local', interfaces: [], selectedIfaces: [], externalURLs: [], accessURLs: {},
      overlayTunnel: { active: true, starting: false, url: 'https://current.trycloudflare.com', lastError: null }
    };
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, config }) })
      .mockImplementationOnce(failingFetch);
    window.fetch = fetchImpl;
    window.LTTHNetworkOverlayTunnel = {
      render: (state, { translate }) => render(state, {
        getElementById: id => window.document.getElementById(id),
        translate
      })
    };

    window.eval(settings);
    await new Promise(resolve => setImmediate(resolve));
    expect(window.document.getElementById('network-overlay-tunnel-url-text').textContent)
      .toBe('https://current.trycloudflare.com');
    window.dispatchEvent(new window.Event('focus'));
    await new Promise(resolve => setImmediate(resolve));

    expect(window.document.getElementById('network-overlay-tunnel-url').style.display).toBe('none');
    expect(window.document.getElementById('network-overlay-tunnel-url-text').textContent).toBe('');
    expect(window.document.getElementById('network-overlay-tunnel-copy').disabled).toBe(true);
    expect(window.document.getElementById('network-overlay-tunnel-stop').disabled).toBe(true);
    expect(window.document.getElementById('network-overlay-tunnel-error').textContent)
      .toBe('Tunnel status is unavailable');
    expect(fetchImpl).toHaveBeenNthCalledWith(2, '/api/network/config', { cache: 'no-store' });
    expect(fetchImpl.mock.calls.every(([url, options]) => url === '/api/network/config' && (!options || options.method === undefined)))
      .toBe(true);

    window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
    window.close();
  });

  test('initializes the stable card and forwards attention without management mutations', async () => {
    const settings = fs.readFileSync(
      path.join(publicRoot, 'js', 'network-settings.js'),
      'utf8'
    );
    const dom = new JSDOM(`
      <select id="network-bind-mode"><option value="local">Local</option></select>
      <div data-stable-overlay-routing-root></div>
    `, {
      url: 'http://127.0.0.1:3000/dashboard.html#settings',
      runScripts: 'outside-only'
    });
    const { window } = dom;
    window.setInterval = jest.fn(() => 1);
    window.clearInterval = jest.fn();
    const attention = jest.fn();
    const init = jest.fn().mockResolvedValue(undefined);
    const renderStable = jest.fn();
    const createUI = jest.fn().mockReturnValue({
      attention,
      init,
      render: renderStable
    });
    const configureAccountAccess = jest.fn();
    let languageChange;
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        config: {
          bindMode: 'local',
          interfaces: [],
          overlayTunnel: {},
          externalURLs: [],
          accessURLs: {}
        }
      })
    });
    window.fetch = fetchImpl;
    window.i18n = {
      t: jest.fn(key => key),
      onLanguageChange: jest.fn(callback => {
        languageChange = callback;
      })
    };
    window.StoreAuth = {
      getFreshToken: jest.fn(),
      beginBridgeAuth: jest.fn()
    };
    window.LTTHStableOverlayRouting = {
      accountAccess: { getFreshToken: jest.fn() },
      configureAccountAccess,
      createUI
    };
    window.LTTHNetworkOverlayTunnel = {
      render: jest.fn()
    };
    window.LTTHTikTokStudioUrl = {};

    window.eval(settings);
    await Promise.resolve();
    await Promise.resolve();

    expect(configureAccountAccess).toHaveBeenCalledTimes(1);
    expect(createUI).toHaveBeenCalledWith(expect.objectContaining({
      root: window.document.querySelector(
        '[data-stable-overlay-routing-root]'
      ),
      copyApi: window.LTTHTikTokStudioUrl,
      translate: expect.any(Function),
      notify: expect.any(Function)
    }));
    expect(init).toHaveBeenCalledTimes(1);
    expect(window.i18n.onLanguageChange).toHaveBeenCalledTimes(1);
    languageChange();
    expect(renderStable).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new window.CustomEvent(
      'ltth:stable-overlay-routing-attention',
      { detail: { code: 'STABLE_OVERLAY_CLAIM_REQUIRED' } }
    ));
    expect(attention).toHaveBeenCalledWith({
      code: 'STABLE_OVERLAY_CLAIM_REQUIRED'
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('/api/network/config');
  });

  test('defines the complete four-language UI contract', () => {
    const expectedKeys = [
      ['common', 'tiktok_studio', 'copy_url'],
      ['common', 'tiktok_studio', 'starting'],
      ['common', 'tiktok_studio', 'copied'],
      ['common', 'tiktok_studio', 'copy_failed'],
      ['common', 'tiktok_studio', 'tunnel_failed'],
      ['common', 'tiktok_studio', 'url_unavailable'],
      ['common', 'tiktok_studio', 'claim_required'],
      ['common', 'tiktok_studio', 'copying'],
      ['common', 'tiktok_studio', 'preparing_stable'],
      ['network', 'overlay_tunnel', 'title'],
      ['network', 'overlay_tunnel', 'active'],
      ['network', 'overlay_tunnel', 'inactive'],
      ['network', 'overlay_tunnel', 'starting'],
      ['network', 'overlay_tunnel', 'stop'],
      ['network', 'overlay_tunnel', 'restart_notice'],
      ['network', 'overlay_tunnel', 'test_service_notice']
    ];

    for (const locale of ['en', 'de', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'locales', `${locale}.json`),
        'utf8'
      ));
      for (const keyParts of expectedKeys) {
        const value = keyParts.reduce((current, part) => current?.[part], translations);
        expect(typeof value).toBe('string');
        expect(value.trim()).not.toBe('');
      }
    }
  });
});
