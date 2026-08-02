(function initPublicOverlayRenderMode(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LTTHPublicOverlayRenderMode = api;
  }
})(
  typeof window !== 'undefined' ? window : null,
  function createPublicOverlayRenderMode(root) {
    'use strict';

    function isPublicQuickTunnelHostname(hostname) {
      return /^[a-z0-9-]+\.trycloudflare\.com$/i.test(
        String(hostname || '').trim()
      );
    }

    function isLocalOverlayHostname(hostname) {
      const normalized = String(hostname || '').trim().toLowerCase();
      return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
    }

    async function postJsonLocalOnly(url, body, {
      hostname = root?.location?.hostname,
      fetchImpl = root?.fetch?.bind(root)
    } = {}) {
      if (!isLocalOverlayHostname(hostname)) {
        return { skipped: true, response: null };
      }
      if (typeof fetchImpl !== 'function') {
        throw new Error('Fetch is unavailable');
      }
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { skipped: false, response };
    }

    return {
      isLocalOverlayHostname,
      isPublicQuickTunnelHostname,
      postJsonLocalOnly
    };
  }
);
