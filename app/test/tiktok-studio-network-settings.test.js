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
