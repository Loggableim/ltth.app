(function(root) {
  const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

  function getDefaultNext(origin) {
    try {
      const url = new URL(origin);
      return LOOPBACK_HOSTS.has(url.hostname) ? '/dashboard.html' : '/auth/';
    } catch {
      return '/auth/';
    }
  }

  function getSafeNext(raw, origin) {
    const fallback = getDefaultNext(origin);
    const value = String(raw || '').trim();
    if (!value) {
      return fallback;
    }

    try {
      const next = new URL(value, origin);
      if (next.origin !== origin) {
        return fallback;
      }

      return `${next.pathname}${next.search}${next.hash}`;
    } catch {
      return fallback;
    }
  }

  function relayFreshToken({
    hash,
    search,
    origin,
    opener,
    close = () => {}
  } = {}) {
    const query = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    if (query.get('relay') !== 'fresh-token') {
      return false;
    }

    const fragment = new URLSearchParams(
      String(hash || '').replace(/^#/, '')
    );
    const token = String(fragment.get('token') || '');
    const state = String(fragment.get('state') || '');
    const action = String(query.get('relay_action') || '');
    if (
      !token ||
      token.length > 16 * 1024 ||
      /\s/.test(token) ||
      !/^[A-Za-z0-9._~-]{24,160}$/.test(state) ||
      !/^[a-z_]{2,32}$/.test(action)
    ) {
      throw new Error('Invalid fresh-token callback.');
    }

    let openerOrigin;
    try {
      openerOrigin = opener?.location?.origin;
    } catch (_) {
      throw new Error('Fresh-token callback requires a same-origin opener.');
    }
    if (
      !opener ||
      typeof opener.postMessage !== 'function' ||
      openerOrigin !== origin
    ) {
      throw new Error('Fresh-token callback requires a same-origin opener.');
    }

    opener.postMessage({
      type: 'ltth:clerk-fresh-token',
      state,
      action,
      token
    }, origin);
    close();
    return true;
  }

  const api = {
    getDefaultNext,
    getSafeNext,
    relayFreshToken
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.LTTHAccountCallbackUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
