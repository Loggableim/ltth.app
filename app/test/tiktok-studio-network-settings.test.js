'use strict';

const fs = require('fs');
const path = require('path');
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

  test('defines the complete four-language UI contract', () => {
    const expectedKeys = [
      ['common', 'tiktok_studio', 'copy_url'],
      ['common', 'tiktok_studio', 'starting'],
      ['common', 'tiktok_studio', 'copied'],
      ['common', 'tiktok_studio', 'copy_failed'],
      ['common', 'tiktok_studio', 'tunnel_failed'],
      ['common', 'tiktok_studio', 'url_unavailable'],
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
