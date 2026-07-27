'use strict';

(function initTikTokStudioUrl(root, factory) {
  let stableUrlApi = null;
  if (typeof module === 'object' && module.exports) {
    stableUrlApi = require('../../modules/stable-overlay-url');
  }
  const api = factory(root, stableUrlApi);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LTTHTikTokStudioUrl = api;
    const install = () => api.install({
      documentRef: root.document,
      windowRef: root
    });
    if (root.document?.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
      install();
    }
  }
})(
  typeof window !== 'undefined' ? window : null,
  function createTikTokStudioUrlApi(root, sharedStableUrlApi) {
    const ensureRequests = new Map();
    const installedDocuments = new WeakSet();
    const embeddedEntrypoints = new Set([
      '/animation-overlay.html',
      '/advanced-timer/overlay',
      '/overlay/animazingpal/stream-assistant',
      '/overlay/clarity/chat',
      '/overlay/clarity/full',
      '/overlay/clarity/multi',
      '/overlay/clarity/stream',
      '/plugins/coinbattle/overlay',
      '/emoji-rain/obs-hud',
      '/fireworks/overlay',
      '/flame-overlay/overlay',
      '/overlay/game-engine/arena',
      '/overlay/game-engine/chess',
      '/overlay/game-engine/connect4',
      '/overlay/game-engine/hud',
      '/overlay/game-engine/plinko',
      '/overlay/game-engine/slot',
      '/overlay/game-engine/unified',
      '/overlay/game-engine/wheel',
      '/plugins/gcce/overlay-hud',
      '/goals/overlay',
      '/goals/multigoal-overlay',
      '/interactive-story/overlay',
      '/plugins/music-bot/overlay.html',
      '/openshock/zappiehell/overlay',
      '/quiz-show/overlay',
      '/quiz-show/overlay/splitscreen',
      '/quiz-show/leaderboard-overlay',
      '/overlay/coincup',
      '/streammonsters/overlay',
      '/overlay/stt-ticker',
      '/plugins/toptier/overlay.html',
      '/visual-fx-frame-webgpu/overlay',
      '/weather-control/overlay',
      '/webgpu-emoji-rain/obs-hud',
      '/webgpu-fireworks/overlay',
      '/webgpu-weather-control/overlay'
    ]);

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
      const normalized = String(hostname || '').toLowerCase();
      if (
        normalized === 'localhost' ||
        normalized === '::1' ||
        normalized === '[::1]' ||
        /^127\.\d+\.\d+\.\d+$/.test(normalized) ||
        /^10\.\d+\.\d+\.\d+$/.test(normalized) ||
        /^192\.168\.\d+\.\d+$/.test(normalized)
      ) {
        return true;
      }
      const match = normalized.match(/^172\.(\d+)\.\d+\.\d+$/);
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

    function localOriginAliases(origin) {
      const allowed = new Set([origin.origin]);
      if (
        !['localhost', '127.0.0.1', '::1', '[::1]'].includes(origin.hostname)
      ) {
        return allowed;
      }
      const port = origin.port ? `:${origin.port}` : '';
      allowed.add(`${origin.protocol}//localhost${port}`);
      allowed.add(`${origin.protocol}//127.0.0.1${port}`);
      allowed.add(`${origin.protocol}//[::1]${port}`);
      return allowed;
    }

    function normalizeEmbeddedUsername(value) {
      if (typeof value !== 'string') {
        throw new Error('invalid username');
      }
      let normalized = value.trim();
      if (normalized.startsWith('@')) normalized = normalized.slice(1);
      normalized = normalized.normalize('NFKC').toLowerCase();
      if (
        normalized.length < 2 ||
        normalized.length > 24 ||
        !/^[a-z0-9_.]+$/.test(normalized) ||
        normalized.split('.').some(segment => segment.length === 0)
      ) {
        throw new Error('invalid username');
      }
      return normalized;
    }

    function normalizeEmbeddedPublicPath(pathname) {
      if (
        typeof pathname !== 'string' ||
        !pathname.startsWith('/') ||
        /%(?:00|2e|2f|5c)/i.test(pathname)
      ) {
        throw new Error('invalid path');
      }
      let decoded;
      try {
        decoded = decodeURIComponent(pathname);
      } catch (_) {
        throw new Error('invalid path');
      }
      if (
        decoded.includes('\0') ||
        decoded.includes('\\') ||
        decoded.includes('//') ||
        decoded.split('/').some(segment => segment === '.' || segment === '..')
      ) {
        throw new Error('invalid path');
      }
      return decoded;
    }

    function createEmbeddedStableUrlApi() {
      return {
        buildStableOverlayUrl(rawUrl, username, options = {}) {
          const current = new URL(
            options.locationHref || 'http://127.0.0.1/'
          );
          const parsed = new URL(
            rawUrl,
            current
          );
          if (
            parsed.username ||
            parsed.password ||
            !['http:', 'https:'].includes(parsed.protocol) ||
            !isLocalHostname(current.hostname) ||
            !localOriginAliases(current).has(parsed.origin)
          ) {
            throw new Error('invalid authority');
          }
          const pathname = normalizeEmbeddedPublicPath(parsed.pathname);
          if (
            !embeddedEntrypoints.has(pathname) &&
            !/^\/overlay\/spotlight\/[A-Za-z0-9_-]+$/.test(pathname)
          ) {
            throw new Error('unregistered entrypoint');
          }
          const canonical = normalizeEmbeddedUsername(username);
          return (
            `https://overlay.ltth.app/${encodeURIComponent(canonical)}` +
            `${parsed.pathname}${parsed.search}${parsed.hash}`
          );
        },
        selectStableOverlayUsername({
          connectedUsername,
          defaultUsername,
          claims
        } = {}) {
          const active = new Set();
          if (Array.isArray(claims)) {
            for (const claim of claims) {
              if (!claim || claim.state !== 'active') continue;
              try {
                active.add(normalizeEmbeddedUsername(claim.username));
              } catch (_) {
                // Ignore malformed account data.
              }
            }
          }
          for (const candidate of [connectedUsername, defaultUsername]) {
            try {
              const normalized = normalizeEmbeddedUsername(candidate);
              if (active.has(normalized)) return normalized;
            } catch (_) {
              // Try the next explicit candidate.
            }
          }
          return null;
        }
      };
    }

    const stableUrlApi =
      sharedStableUrlApi ||
      createEmbeddedStableUrlApi();

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

    function dependencyContext(dependencies) {
      const locationHref =
        dependencies.locationHref ||
        root?.location?.href ||
        'http://127.0.0.1/';
      return {
        locationHref,
        navigatorRef:
          dependencies.navigatorRef !== undefined
            ? dependencies.navigatorRef
            : root?.navigator,
        documentRef:
          dependencies.documentRef !== undefined
            ? dependencies.documentRef
            : root?.document,
        fetchImpl:
          dependencies.fetchImpl ||
          (root?.fetch ? root.fetch.bind(root) : null)
      };
    }

    function safeValue(owner, key, fallback = null) {
      try {
        return owner?.[key] ?? fallback;
      } catch (_) {
        return fallback;
      }
    }

    function sameOriginTopRoutingApi() {
      try {
        const topWindow = root?.top;
        if (!topWindow || topWindow === root) return null;
        const currentOrigin = root?.location?.origin;
        if (
          !currentOrigin ||
          topWindow.location?.origin !== currentOrigin
        ) {
          return null;
        }
        return safeValue(topWindow, 'LTTHStableOverlayRouting');
      } catch (_) {
        return null;
      }
    }

    function resolveAccountAccess(dependencies, fetchImpl) {
      const injected = safeValue(dependencies, 'accountAccess', {});
      const currentRouting = safeValue(root, 'LTTHStableOverlayRouting');
      const currentAccess = safeValue(currentRouting, 'accountAccess', {});
      const topRouting = sameOriginTopRoutingApi();
      const topAccess = safeValue(topRouting, 'accountAccess', {});
      const getFreshToken =
        safeValue(injected, 'getFreshToken') ||
        safeValue(currentAccess, 'getFreshToken') ||
        safeValue(currentRouting, 'getFreshClerkToken') ||
        safeValue(topAccess, 'getFreshToken') ||
        safeValue(topRouting, 'getFreshClerkToken');
      const getAccount =
        safeValue(injected, 'getAccount') ||
        safeValue(currentAccess, 'getAccount') ||
        safeValue(topAccess, 'getAccount') ||
        (async ({ token }) => {
          if (!fetchImpl) throw new Error('account unavailable');
          const response = await fetchImpl('/api/stable-overlay-routing/account', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          if (!response.ok) throw new Error('account unavailable');
          return response.json();
        });
      const getConnectedUsername =
        safeValue(injected, 'getConnectedUsername') ||
        safeValue(currentAccess, 'getConnectedUsername') ||
        safeValue(topAccess, 'getConnectedUsername') ||
        (async () => {
          if (!fetchImpl) return null;
          const response = await fetchImpl('/api/status', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store'
          });
          if (!response.ok) return null;
          const payload = await response.json();
          return payload?.isConnected === true ? payload.username : null;
        });
      return { getFreshToken, getAccount, getConnectedUsername };
    }

    async function defaultFocusNetworkSettings({ code } = {}, windowRef = root) {
      const safeDetail = {
        code: code === 'STABLE_OVERLAY_CLAIM_REQUIRED'
          ? code
          : 'STABLE_OVERLAY_CONFIGURATION_REQUIRED'
      };
      try {
        const targetWindow = windowRef?.top || windowRef;
        if (targetWindow?.NavigationManager?.switchView) {
          targetWindow.NavigationManager.switchView('settings');
          targetWindow.document
            ?.getElementById?.('network-overlay-tunnel-status')
            ?.scrollIntoView?.({ block: 'center' });
          targetWindow.dispatchEvent?.(
            new targetWindow.CustomEvent(
              'ltth:stable-overlay-routing-attention',
              { detail: safeDetail }
            )
          );
          targetWindow.focus?.();
          return;
        }
        windowRef?.open?.('/dashboard.html#settings', '_blank', 'noopener');
      } catch (_) {
        // Focusing settings is best-effort and must not reveal failure details.
      }
    }

    function focusNetworkSettings(dependencies, code) {
      const focus =
        dependencies.focusNetworkSettings ||
        (details => defaultFocusNetworkSettings(details, root));
      try {
        const result = focus({ code });
        Promise.resolve(result).catch(() => {});
      } catch (_) {
        // Copy errors stay sanitized even when the focus hook fails.
      }
    }

    function stableInvalid(error) {
      if (error instanceof TikTokStudioUrlError) return error;
      return new TikTokStudioUrlError(
        'STABLE_OVERLAY_INVALID',
        'A registered local overlay URL is required'
      );
    }

    function claimRequired() {
      return new TikTokStudioUrlError(
        'STABLE_OVERLAY_CLAIM_REQUIRED',
        'An active TikTok username claim is required'
      );
    }

    async function resolveStableCopyUrl(rawUrl, dependencies, context) {
      const candidate = parseCandidate(rawUrl, context.locationHref);
      try {
        stableUrlApi.buildStableOverlayUrl(
          candidate.href,
          'validation',
          { locationHref: context.locationHref }
        );
      } catch (error) {
        throw stableInvalid(error);
      }

      const accountAccess = resolveAccountAccess(
        dependencies,
        context.fetchImpl
      );
      if (typeof accountAccess.getFreshToken !== 'function') {
        throw claimRequired();
      }

      let token;
      let payload;
      try {
        token = await accountAccess.getFreshToken();
        if (typeof token !== 'string' || !token) throw new Error('auth unavailable');
        payload = await accountAccess.getAccount({
          token,
          fetchImpl: context.fetchImpl
        });
      } catch (_) {
        throw claimRequired();
      }

      const claims = payload?.account?.claims;
      if (payload?.success !== true || !Array.isArray(claims)) {
        throw claimRequired();
      }

      let connectedUsername = null;
      try {
        connectedUsername = await accountAccess.getConnectedUsername({
          fetchImpl: context.fetchImpl
        });
      } catch (_) {
        connectedUsername = null;
      }
      const username = stableUrlApi.selectStableOverlayUsername({
        connectedUsername,
        defaultUsername: payload.defaultUsername,
        claims
      });
      if (!username) throw claimRequired();

      try {
        return stableUrlApi.buildStableOverlayUrl(
          candidate.href,
          username,
          { locationHref: context.locationHref }
        );
      } catch (error) {
        throw stableInvalid(error);
      }
    }

    async function copy(rawUrl, dependencies = {}) {
      const context = dependencyContext(dependencies);
      let copiedUrl;
      try {
        copiedUrl = await resolveStableCopyUrl(
          rawUrl,
          dependencies,
          context
        );
      } catch (error) {
        const safeError = error instanceof TikTokStudioUrlError
          ? error
          : stableInvalid(error);
        focusNetworkSettings(dependencies, safeError.code);
        throw safeError;
      }
      await writeClipboard(
        copiedUrl,
        context.navigatorRef,
        context.documentRef
      );
      return copiedUrl;
    }

    async function copyTemporary(rawUrl, dependencies = {}) {
      const context = dependencyContext(dependencies);
      const candidate = parseCandidate(rawUrl, context.locationHref);
      if (!isLocalHostname(candidate.hostname)) {
        fail(
          'TEMPORARY_OVERLAY_LOCAL_REQUIRED',
          'Temporary Quick Tunnel copy requires a local overlay URL'
        );
      }
      if (!context.fetchImpl) {
        fail('OVERLAY_TUNNEL_REQUEST_FAILED', 'Quick Tunnel request is unavailable');
      }
      const copiedUrl = await ensurePublicUrl(candidate, context.fetchImpl);
      await writeClipboard(
        copiedUrl,
        context.navigatorRef,
        context.documentRef
      );
      return copiedUrl;
    }

    function canonicalVdoDirectorUrl(rawUrl, locationHref) {
      const candidate = parseCandidate(rawUrl, locationHref);
      const raw = typeof rawUrl === 'string' ? rawUrl : '';
      const entries = [...candidate.searchParams.entries()];
      const director = entries[0]?.[1] || '';
      const password = entries[1]?.[1] || '';
      const canonical = (
        /^[0-9a-f]{12}$/.test(director) &&
        /^[0-9a-f]{16}$/.test(password) &&
        entries.length === 4 &&
        entries[0]?.[0] === 'director' &&
        entries[1]?.[0] === 'password' &&
        entries[2]?.[0] === 'cleanoutput' &&
        entries[2]?.[1] === '' &&
        entries[3]?.[0] === 'api' &&
        entries[3]?.[1] === director
      )
        ? `https://vdo.ninja/?director=${director}` +
          `&password=${password}&cleanoutput&api=${director}`
        : '';
      if (
        raw !== raw.trim() ||
        !canonical ||
        raw !== canonical ||
        candidate.href !== canonical
      ) {
        fail(
          'EXTERNAL_VDO_DIRECTOR_URL_REQUIRED',
          'External copy requires a canonical VDO.Ninja Director URL'
        );
      }
      return canonical;
    }

    function activeVdoUnavailable() {
      return new TikTokStudioUrlError(
        'EXTERNAL_VDO_ACTIVE_ROOM_UNAVAILABLE',
        'Current VDO.Ninja Director URL is unavailable'
      );
    }

    async function loadActiveVdoDirectorUrl(dependencies, fetchImpl) {
      const injected = safeValue(
        dependencies,
        'getActiveVdoDirectorUrl'
      );
      if (typeof injected === 'function') {
        try {
          const activeUrl = await injected();
          if (typeof activeUrl !== 'string') throw new Error('invalid active room');
          return activeUrl;
        } catch (_) {
          throw activeVdoUnavailable();
        }
      }
      if (!fetchImpl) throw activeVdoUnavailable();

      let response;
      let payload;
      try {
        response = await fetchImpl('/api/vdoninja/room/active', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        });
        if (!response?.ok) throw new Error('active room unavailable');
        payload = await response.json();
      } catch (_) {
        throw activeVdoUnavailable();
      }
      if (
        payload?.success !== true ||
        !payload.activeRoom ||
        typeof payload.activeRoom !== 'object' ||
        Array.isArray(payload.activeRoom) ||
        typeof payload.activeRoom.directorUrl !== 'string'
      ) {
        throw activeVdoUnavailable();
      }
      return payload.activeRoom.directorUrl;
    }

    async function copyExternal(rawUrl, dependencies = {}) {
      const context = dependencyContext(dependencies);
      const candidateUrl = canonicalVdoDirectorUrl(
        rawUrl,
        context.locationHref
      );
      const activeRawUrl = await loadActiveVdoDirectorUrl(
        dependencies,
        context.fetchImpl
      );
      let activeUrl;
      try {
        activeUrl = canonicalVdoDirectorUrl(
          activeRawUrl,
          context.locationHref
        );
      } catch (_) {
        throw activeVdoUnavailable();
      }
      if (candidateUrl !== activeUrl) {
        fail(
          'EXTERNAL_VDO_ACTIVE_ROOM_MISMATCH',
          'VDO.Ninja Director URL does not match the active room'
        );
      }
      await writeClipboard(
        candidateUrl,
        context.navigatorRef,
        context.documentRef
      );
      return candidateUrl;
    }

    function readButtonURL(button, {
      documentRef = root?.document
    } = {}) {
      const selector = button?.getAttribute?.('data-overlay-url-source');
      if (!selector || !documentRef?.querySelector) return '';
      const source = selector === 'self'
        ? button
        : documentRef.querySelector(selector);
      if (!source) return '';

      const attribute = button.getAttribute('data-overlay-url-attribute');
      if (attribute) {
        return String(source.getAttribute?.(attribute) || '').trim();
      }
      if (typeof source.value === 'string') {
        return source.value.trim();
      }
      return String(source.textContent || '').trim();
    }

    function defaultTranslate(key, fallback, windowRef) {
      if (!windowRef?.i18n) return fallback;
      const translated = windowRef.i18n.t(key);
      return translated && translated !== key ? translated : fallback;
    }

    function defaultReporter(documentRef, windowRef) {
      return (state, message) => {
        if (typeof windowRef?.showToast === 'function') {
          windowRef.showToast(message, state === 'error' ? 'error' : 'success');
          return;
        }
        if (!documentRef?.body || !documentRef.createElement) return;
        let region = documentRef.getElementById?.('tiktok-studio-copy-status');
        if (!region) {
          region = documentRef.createElement('div');
          region.id = 'tiktok-studio-copy-status';
          region.setAttribute('role', 'status');
          region.setAttribute('aria-live', 'polite');
          region.style.position = 'fixed';
          region.style.right = '16px';
          region.style.bottom = '16px';
          region.style.zIndex = '10000';
          region.style.maxWidth = '360px';
          region.style.padding = '10px 14px';
          region.style.borderRadius = '8px';
          region.style.background = 'rgba(17, 24, 39, 0.96)';
          region.style.color = '#f9fafb';
          documentRef.body.appendChild(region);
        }
        region.dataset.state = state;
        region.textContent = message;
      };
    }

    function errorTranslation(error) {
      if (error?.code === 'URL_UNAVAILABLE') {
        return [
          'common.tiktok_studio.url_unavailable',
          'Overlay URL is unavailable'
        ];
      }
      if (error?.code === 'STABLE_OVERLAY_CLAIM_REQUIRED') {
        return [
          'common.tiktok_studio.claim_required',
          'Claim a TikTok username in Network Settings first'
        ];
      }
      if (
        String(error?.code || '').startsWith('OVERLAY_') ||
        String(error?.code || '').startsWith('PUBLIC_OVERLAY_')
      ) {
        return [
          'common.tiktok_studio.tunnel_failed',
          'Quick Tunnel could not be started'
        ];
      }
      return [
        'common.tiktok_studio.copy_failed',
        'Could not copy the TikTok Studio URL'
      ];
    }

    function buttonAction(button) {
      if (button?.hasAttribute?.('data-copy-tiktok-studio-temporary-url')) {
        return 'temporary';
      }
      if (button?.getAttribute?.('data-tiktok-studio-url-mode') === 'external') {
        return 'external';
      }
      return 'stable';
    }

    function actionStartingMessage(action, translate) {
      if (action === 'temporary') {
        return translate(
          'common.tiktok_studio.starting',
          'Starting Quick Tunnel...'
        );
      }
      if (action === 'external') {
        return translate(
          'common.tiktok_studio.copying',
          'Copying TikTok Studio URL...'
        );
      }
      return translate(
        'common.tiktok_studio.preparing_stable',
        'Preparing stable TikTok Studio URL...'
      );
    }

    async function handleButtonClick(button, {
      documentRef = root?.document,
      windowRef = root,
      copyImpl = copy,
      copyTemporaryImpl = copyTemporary,
      copyExternalImpl = copyExternal,
      translate = (key, fallback) =>
        defaultTranslate(key, fallback, windowRef),
      report = defaultReporter(documentRef, windowRef)
    } = {}) {
      if (!button || button.disabled) return null;
      const action = buttonAction(button);
      const implementation = action === 'temporary'
        ? copyTemporaryImpl
        : action === 'external'
          ? copyExternalImpl
          : copyImpl;
      button.disabled = true;
      button.setAttribute?.('aria-busy', 'true');
      report('starting', actionStartingMessage(action, translate));
      try {
        const copiedUrl = await implementation(
          readButtonURL(button, { documentRef })
        );
        report(
          'success',
          translate(
            'common.tiktok_studio.copied',
            'TikTok Studio URL copied'
          )
        );
        return copiedUrl;
      } catch (error) {
        const [key, fallback] = errorTranslation(error);
        report('error', translate(key, fallback));
        return null;
      } finally {
        button.disabled = false;
        button.removeAttribute?.('aria-busy');
      }
    }

    function install({
      documentRef = root?.document,
      windowRef = root
    } = {}) {
      if (
        !documentRef?.addEventListener ||
        installedDocuments.has(documentRef)
      ) {
        return;
      }
      installedDocuments.add(documentRef);
      documentRef.addEventListener('click', event => {
        const button = event.target?.closest?.(
          '[data-copy-tiktok-studio-url], ' +
          '[data-copy-tiktok-studio-temporary-url]'
        );
        if (!button) return;
        event.preventDefault?.();
        handleButtonClick(button, { documentRef, windowRef });
      });
    }

    return {
      TikTokStudioUrlError,
      copy,
      copyExternal,
      copyTemporary,
      handleButtonClick,
      install,
      readButtonURL
    };
  }
);
