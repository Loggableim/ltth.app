'use strict';

(function initTikTokStudioUrl(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LTTHTikTokStudioUrl = api;
  }
})(
  typeof window !== 'undefined' ? window : null,
  function createTikTokStudioUrlApi(root) {
    const ensureRequests = new Map();

    class TikTokStudioUrlError extends Error {
      constructor(code, message) {
        super(message);
        this.name = 'TikTokStudioUrlError';
        this.code = code;
      }
    }

    function fail(code, message) {
      throw new TikTokStudioUrlError(code, message);
    }

    function isLocalHostname(hostname) {
      if (
        hostname === 'localhost' ||
        hostname === '::1' ||
        /^127\.\d+\.\d+\.\d+$/.test(hostname) ||
        /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
        /^192\.168\.\d+\.\d+$/.test(hostname)
      ) {
        return true;
      }
      const match = hostname.match(/^172\.(\d+)\.\d+\.\d+$/);
      return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
    }

    function parseCandidate(rawUrl, locationHref) {
      if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        fail('URL_UNAVAILABLE', 'Overlay URL is unavailable');
      }
      const trimmed = rawUrl.trim();
      if (!/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/)/.test(trimmed)) {
        fail('URL_INVALID', 'Overlay URL is invalid');
      }

      let parsed;
      try {
        parsed = new URL(trimmed, locationHref);
      } catch (_) {
        fail('URL_INVALID', 'Overlay URL is invalid');
      }
      if (parsed.username || parsed.password) {
        fail('URL_CREDENTIALS_NOT_ALLOWED', 'Overlay URL must not contain credentials');
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        fail('URL_PROTOCOL_NOT_ALLOWED', 'Overlay URL protocol is not supported');
      }
      return parsed;
    }

    async function ensurePublicUrl(localUrl, fetchImpl) {
      const key = localUrl.href;
      if (ensureRequests.has(key)) {
        return ensureRequests.get(key);
      }

      const request = (async () => {
        let response;
        try {
          response = await fetchImpl('/api/network/overlay-tunnel/ensure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ overlayURL: localUrl.href })
          });
        } catch (_) {
          fail('OVERLAY_TUNNEL_REQUEST_FAILED', 'Quick Tunnel request failed');
        }

        let body;
        try {
          body = await response.json();
        } catch (_) {
          fail('OVERLAY_TUNNEL_RESPONSE_INVALID', 'Quick Tunnel response was invalid');
        }
        if (!response.ok || body?.success !== true || !body.publicURL) {
          fail(
            body?.code || 'OVERLAY_TUNNEL_REQUEST_FAILED',
            body?.error || 'Quick Tunnel could not be prepared'
          );
        }

        let publicUrl;
        try {
          publicUrl = new URL(body.publicURL);
        } catch (_) {
          fail('OVERLAY_TUNNEL_RESPONSE_INVALID', 'Quick Tunnel response was invalid');
        }
        if (
          publicUrl.protocol !== 'https:' ||
          publicUrl.username ||
          publicUrl.password
        ) {
          fail('OVERLAY_TUNNEL_RESPONSE_INVALID', 'Quick Tunnel response was invalid');
        }
        return publicUrl.href;
      })();

      ensureRequests.set(key, request);
      try {
        return await request;
      } finally {
        if (ensureRequests.get(key) === request) {
          ensureRequests.delete(key);
        }
      }
    }

    async function writeClipboard(text, navigatorRef, documentRef) {
      if (navigatorRef?.clipboard?.writeText) {
        try {
          await navigatorRef.clipboard.writeText(text);
          return;
        } catch (_) {
          fail('CLIPBOARD_WRITE_FAILED', 'Clipboard write failed');
        }
      }

      if (!documentRef?.body || typeof documentRef.createElement !== 'function') {
        fail('CLIPBOARD_UNAVAILABLE', 'Clipboard is unavailable');
      }

      const textarea = documentRef.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.opacity = '0';
      documentRef.body.appendChild(textarea);
      try {
        textarea.select();
        if (!documentRef.execCommand?.('copy')) {
          fail('CLIPBOARD_WRITE_FAILED', 'Clipboard write failed');
        }
      } finally {
        textarea.remove();
      }
    }

    async function copy(rawUrl, dependencies = {}) {
      const locationHref =
        dependencies.locationHref ||
        root?.location?.href ||
        'http://127.0.0.1/';
      const navigatorRef =
        dependencies.navigatorRef !== undefined
          ? dependencies.navigatorRef
          : root?.navigator;
      const documentRef =
        dependencies.documentRef !== undefined
          ? dependencies.documentRef
          : root?.document;
      const fetchImpl =
        dependencies.fetchImpl ||
        (root?.fetch ? root.fetch.bind(root) : null);
      const candidate = parseCandidate(rawUrl, locationHref);
      const current = new URL(locationHref);
      const requiresTunnel =
        candidate.origin === current.origin ||
        (candidate.protocol === 'http:' && isLocalHostname(candidate.hostname));

      let copiedUrl;
      if (requiresTunnel) {
        if (!fetchImpl) {
          fail('OVERLAY_TUNNEL_REQUEST_FAILED', 'Quick Tunnel request is unavailable');
        }
        copiedUrl = await ensurePublicUrl(candidate, fetchImpl);
      } else {
        if (candidate.protocol !== 'https:') {
          fail('EXTERNAL_HTTP_NOT_ALLOWED', 'External overlay URL must use HTTPS');
        }
        copiedUrl = candidate.href;
      }

      await writeClipboard(copiedUrl, navigatorRef, documentRef);
      return copiedUrl;
    }

    return {
      TikTokStudioUrlError,
      copy
    };
  }
);
