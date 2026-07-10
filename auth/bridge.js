(function() {
  const CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsubHR0aC5hcHAk';
  const CLERK_FRONTEND_DOMAIN = 'clerk.ltth.app';
  const CLERK_UI_SCRIPT = 'https://clerk.ltth.app/npm/@clerk/ui@1/dist/ui.browser.js';
  const CLERK_BROWSER_SCRIPT = 'https://clerk.ltth.app/npm/@clerk/clerk-js@6/dist/clerk.browser.js';
  const SCRIPT_LOAD_TIMEOUT_MS = 15000;
  const DEFAULT_ACCOUNT_PORTAL_URL = 'https://ltth.app/auth/';
  const LEGACY_LOCAL_CALLBACK_PATH = '/auth/clerk/callback.html';
  const ALLOWED_RETURN_HOSTS = new Set([
    '127.0.0.1',
    'localhost',
    '::1',
    'ltth.app',
    'www.ltth.app'
  ]);

  const params = new URLSearchParams(window.location.search);
  const root = document.getElementById('ltth-auth-bridge-root');

  function setStatus(title, message, type = 'info') {
    if (!root) return;
    root.innerHTML = `
      <div class="status ${type === 'error' ? 'error' : ''}">
        <strong>${escapeHtml(title)}</strong>
        ${escapeHtml(message)}
      </div>
    `;
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
  }

  function loadScript(src, attributes = {}) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing?.dataset.loaded === 'true') {
        resolve();
        return;
      }

      const script = existing || document.createElement('script');
      let settled = false;
      let timeoutId = null;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        callback(value);
      };

      for (const [key, value] of Object.entries(attributes)) {
        if (value) script.setAttribute(key, value);
      }
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.type = 'text/javascript';
      script.onload = () => {
        script.dataset.loaded = 'true';
        finish(resolve);
      };
      script.onerror = () => finish(reject, new Error(`Failed to load ${src}`));
      if (!existing) document.head.appendChild(script);

      timeoutId = window.setTimeout(() => {
        finish(reject, new Error(`Timed out while loading ${src}`));
      }, SCRIPT_LOAD_TIMEOUT_MS);
    });
  }

  async function loadScriptWithRetry(src, attributes = {}, label = 'authentication component') {
    try {
      await loadScript(src, attributes);
    } catch (firstError) {
      const failedScript = document.querySelector(`script[src="${src}"]`);
      if (failedScript?.dataset.loaded !== 'true') {
        failedScript.remove();
      }

      setStatus('Retrying account bridge', `The ${label} was slow to load. Trying once more...`);
      await loadScript(src, attributes);
    }
  }

  function getMode() {
    return params.get('mode') === 'sign-up' ? 'sign-up' : 'sign-in';
  }

  function hasReturnFlow() {
    return Boolean(String(params.get('return_to') || '').trim());
  }

  function getState() {
    const state = String(params.get('state') || '').trim();
    if (hasReturnFlow() && !/^[A-Za-z0-9._~-]{24,160}$/.test(state)) {
      throw new Error('Missing or invalid auth state.');
    }
    return state;
  }

  function getReturnUrl() {
    const raw = String(params.get('return_to') || '').trim();
    if (!raw) {
      return null;
    }

    const url = new URL(raw);
    const protocolAllowed = url.protocol === 'http:' || url.protocol === 'https:';
    if (!protocolAllowed) {
      throw new Error('Return URL must use http or https.');
    }

    if (ALLOWED_RETURN_HOSTS.has(url.hostname)) {
      if (['127.0.0.1', 'localhost', '::1'].includes(url.hostname) && url.pathname !== LEGACY_LOCAL_CALLBACK_PATH) {
        throw new Error('Return URL is not allowed for the LTTH local bridge.');
      }
      return url;
    }

    throw new Error('Return URL is not allowed for the LTTH account portal.');
  }

  function getSafeNext() {
    const raw = String(params.get('next') || '').trim();
    if (!raw) return '';

    try {
      const next = new URL(raw);
      if (!ALLOWED_RETURN_HOSTS.has(next.hostname)) return '';
      if (next.protocol !== 'http:' && next.protocol !== 'https:') return '';
      return next.toString();
    } catch {
      return '';
    }
  }

  function parseJwtExpiry(token) {
    try {
      const payload = token.split('.')[1];
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = JSON.parse(atob(normalized));
      return Number.isFinite(json.exp) ? json.exp * 1000 : 0;
    } catch {
      return 0;
    }
  }

  function redirectWithToken(token, returnUrl, state) {
    const fragment = new URLSearchParams();
    fragment.set('token', token);
    fragment.set('state', state);
    fragment.set('source', 'ltth-auth-bridge');

    const expiresAt = parseJwtExpiry(token);
    if (expiresAt > 0) {
      fragment.set('expires_at', String(expiresAt));
    }

    const next = getSafeNext();
    if (next) {
      fragment.set('next', next);
    }

    returnUrl.hash = fragment.toString();
    window.location.replace(returnUrl.toString());
  }

  function updateModeLinks(mode) {
    document.querySelectorAll('[data-mode-link]').forEach((link) => {
      const linkMode = link.getAttribute('data-mode-link');
      const url = new URL(window.location.href);
      url.searchParams.set('mode', linkMode);
      link.href = url.toString();
      link.classList.toggle('active', linkMode === mode);
    });
  }

  function setModeSwitcherVisible(visible) {
    const switcher = document.querySelector('[data-auth-mode-switcher]');
    if (switcher) {
      switcher.hidden = !visible;
    }
  }

  function withMode(mode) {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', mode);
    return url.toString();
  }

  function mountAuth(clerk, mode) {
    if (!root) return;
    setModeSwitcherVisible(true);
    root.innerHTML = '';

    const options = {
      afterSignInUrl: window.location.href,
      afterSignUpUrl: window.location.href,
      forceRedirectUrl: window.location.href,
      fallbackRedirectUrl: window.location.href,
      signInUrl: withMode('sign-in'),
      signUpUrl: withMode('sign-up')
    };

    if (mode === 'sign-in' && typeof clerk.mountSignIn === 'function') {
      clerk.mountSignIn(root, options);
      return;
    }

    if (typeof clerk.mountSignUp === 'function') {
      clerk.mountSignUp(root, options);
      return;
    }

    throw new Error('Clerk auth components are unavailable.');
  }

  function mountAccountPortal(clerk, returnUrl) {
    if (!root) return;
    root.innerHTML = `
      <div class="status">
        <strong>Signed in on ltth.app</strong>
        <span>You can manage your LTTH profile here. The app store uses inline login, so you only need this page for web account management and optional return flows.</span>
        <div id="ltth-auth-account-root" style="margin-top: 18px;"></div>
      </div>
    `;

    const accountRoot = document.getElementById('ltth-auth-account-root');
    if (accountRoot && typeof clerk.mountUserButton === 'function') {
      clerk.mountUserButton(accountRoot, {
        userProfileMode: 'navigation',
        userProfileUrl: returnUrl ? returnUrl.toString() : DEFAULT_ACCOUNT_PORTAL_URL,
        signInUrl: withMode('sign-in')
      });
    } else if (accountRoot) {
      accountRoot.innerHTML = `
        <a href="${escapeHtml(DEFAULT_ACCOUNT_PORTAL_URL)}" style="color: #6ee7b7; font-weight: 800;">Open the LTTH account portal</a>
      `;
    }

    setModeSwitcherVisible(false);
  }

  async function completeIfSignedIn(clerk, returnUrl, state) {
    if (!returnUrl) {
      return false;
    }

    const session = clerk.session;
    if (!session || typeof session.getToken !== 'function') {
      return false;
    }

    const template = params.get('template') || undefined;
    const token = await session.getToken(template ? { template } : undefined);
    if (!token) {
      return false;
    }

    redirectWithToken(token, returnUrl, state);
    return true;
  }

  async function renderPortal(clerk, mode, returnUrl, state) {
    if (await completeIfSignedIn(clerk, returnUrl, state)) {
      return true;
    }

    if (!returnUrl && clerk.session) {
      mountAccountPortal(clerk, null);
      return true;
    }

    mountAuth(clerk, mode);
    return false;
  }

  function watchForAuthenticatedSession(clerk, mode, returnUrl, state) {
    let settled = false;
    let intervalId = null;

    const stop = () => {
      if (settled) {
        return;
      }

      settled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const tick = async () => {
      if (settled) {
        return;
      }

      try {
        if (returnUrl) {
          if (await completeIfSignedIn(clerk, returnUrl, state)) {
            stop();
          }
          return;
        }

        if (clerk.session) {
          stop();
          mountAccountPortal(clerk, null);
        }
      } catch (error) {
        stop();
        setStatus('Could not finish login', error.message, 'error');
      }
    };

    intervalId = window.setInterval(tick, 500);
    window.addEventListener('beforeunload', stop, { once: true });
    void tick();
  }

  async function init() {
    try {
      const mode = getMode();
      const returnUrl = getReturnUrl();
      const state = returnUrl ? getState() : '';
      updateModeLinks(mode);

      setStatus('Loading account bridge', 'Loading secure sign-in components...');
      await loadScriptWithRetry(CLERK_UI_SCRIPT, {}, 'Clerk interface');
      await loadScriptWithRetry(CLERK_BROWSER_SCRIPT, {
        'data-clerk-publishable-key': CLERK_PUBLISHABLE_KEY,
        'data-clerk-domain': CLERK_FRONTEND_DOMAIN
      }, 'Clerk session service');

      const clerk = window.Clerk;
      if (!clerk || typeof clerk.load !== 'function') {
        throw new Error('Clerk browser SDK did not initialize.');
      }

      await clerk.load({
        ui: { ClerkUI: window.__internal_ClerkUICtor }
      });

      if (await renderPortal(clerk, mode, returnUrl, state)) {
        return;
      }

      watchForAuthenticatedSession(clerk, mode, returnUrl, state);
    } catch (error) {
      setStatus('Account bridge failed', `${error.message || 'Unknown authentication error.'} Reload the page to try again.`, 'error');
    }
  }

  init();
})();
