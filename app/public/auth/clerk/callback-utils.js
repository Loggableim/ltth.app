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

  const api = {
    getDefaultNext,
    getSafeNext
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.LTTHAccountCallbackUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
