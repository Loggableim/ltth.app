(function initNetworkOverlayTunnel(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LTTHNetworkOverlayTunnel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNetworkOverlayTunnel() {
  'use strict';

  class NetworkOverlayTunnelError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'NetworkOverlayTunnelError';
      this.code = code;
    }
  }

  function isQuickTunnelURL(rawURL) {
    if (typeof rawURL !== 'string' || !rawURL.trim()) return false;
    try {
      const parsed = new URL(rawURL);
      return (
        parsed.protocol === 'https:' &&
        !parsed.username &&
        !parsed.password &&
        parsed.port === '' &&
        parsed.pathname === '/' &&
        parsed.search === '' &&
        parsed.hash === '' &&
        /^[a-z0-9-]+\.trycloudflare\.com$/i.test(parsed.hostname)
      );
    } catch (_) {
      return false;
    }
  }

  function render(config = {}, {
    getElementById = id => document.getElementById(id),
    translate = (_key, fallback) => fallback
  } = {}) {
    const status = getElementById('network-overlay-tunnel-status');
    const urlRow = getElementById('network-overlay-tunnel-url');
    const urlText = getElementById('network-overlay-tunnel-url-text');
    const copyButton = getElementById('network-overlay-tunnel-copy');
    const stopButton = getElementById('network-overlay-tunnel-stop');
    const error = getElementById('network-overlay-tunnel-error');
    const hasURL = isQuickTunnelURL(config.url);

    if (config.starting) {
      if (status) {
        status.textContent = translate(
          'network.overlay_tunnel.starting',
          'Starting…'
        );
        status.className = 'text-sm text-yellow-400';
      }
    } else if (config.active && hasURL) {
      if (status) {
        status.textContent = translate(
          'network.overlay_tunnel.active',
          'Active'
        );
        status.className = 'text-sm text-green-400';
      }
    } else if (status) {
      status.textContent = translate(
        'network.overlay_tunnel.inactive',
        'Inactive'
      );
      status.className = 'text-sm text-gray-400';
    }

    if (urlRow) urlRow.style.display = hasURL ? 'flex' : 'none';
    if (urlText) urlText.textContent = hasURL ? config.url : '';
    if (copyButton) copyButton.disabled = !hasURL;
    if (stopButton) {
      stopButton.disabled = !(config.starting || (config.active && hasURL));
    }

    const lastError = typeof config.lastError === 'string'
      ? config.lastError.trim()
      : '';
    if (error) {
      error.textContent = lastError;
      error.style.display = lastError ? 'block' : 'none';
    }
  }

  async function stop({
    fetchImpl = fetch
  } = {}) {
    const response = await fetchImpl(
      '/api/network/overlay-tunnel/stop',
      { method: 'POST' }
    );
    const body = await response.json();
    if (!response.ok || !body?.success) {
      throw new NetworkOverlayTunnelError(
        body?.code || 'OVERLAY_TUNNEL_STOP_FAILED',
        'Quick Tunnel could not be stopped'
      );
    }
    return body;
  }

  async function copyTunnelURL(rawURL, {
    navigatorRef = navigator
  } = {}) {
    if (!isQuickTunnelURL(rawURL)) {
      throw new NetworkOverlayTunnelError(
        'OVERLAY_TUNNEL_URL_INVALID',
        'Overlay Quick Tunnel URL is invalid'
      );
    }
    if (!navigatorRef?.clipboard?.writeText) {
      throw new NetworkOverlayTunnelError(
        'CLIPBOARD_UNAVAILABLE',
        'Clipboard API is unavailable'
      );
    }
    await navigatorRef.clipboard.writeText(rawURL);
    return rawURL;
  }

  return {
    NetworkOverlayTunnelError,
    copyTunnelURL,
    isQuickTunnelURL,
    render,
    stop
  };
});
