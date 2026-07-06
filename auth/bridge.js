(function() {
  const CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsubHR0aC5hcHAk';
  const CLERK_FRONTEND_DOMAIN = 'clerk.ltth.app';
  const CLERK_UI_SCRIPT = 'https://clerk.ltth.app/npm/@clerk/ui@1/dist/ui.browser.js';
  const CLERK_BROWSER_SCRIPT = 'https://clerk.ltth.app/npm/@clerk/clerk-js@6/dist/clerk.browser.js';
  const ALLOWED_RETURN_HOSTS = ['127.0.0.1', 'localhost', '::1'];
  const ALLOWED_RETURN_PATH = '/auth/clerk/callback.html';

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
      for (const [key, value] of Object.entries(attributes)) {
        if (value) script.setAttribute(key, value);
      }
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.type = 'text/javascript';
      script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      if (!existing) document.head.appendChild(script);
    });
  }

  function getMode() {
    return params.get('mode') === 'sign-in' ? 'sign-in' : 'sign-up';
  }

  function getState() {
    const state = String(params.get('state') || '').trim();
    if (!/^[A-Za-z0-9._~-]{24,160}$/.test(state)) {
      throw new Error('Missing or invalid auth state.');
    }
    return state;
  }

  function getReturnUrl() {
    const raw = params.get('return_to');
    if (!raw) {
      throw new Error('Missing return_to URL.');
    }

    const url = new URL(raw);
    const hostAllowed = ALLOWED_RETURN_HOSTS.includes(url.hostname);
    const protocolAllowed = url.protocol === 'http:' || url.protocol === 'https:';
    const pathAllowed = url.pathname === ALLOWED_RETURN_PATH;

    if (!hostAllowed || !protocolAllowed || !pathAllowed) {
      throw new Error('Return URL is not allowed for the LTTH desktop bridge.');
    }

    return url;
  }

  function getSafeNext() {
    const raw = params.get('next');
    if (!raw) return '';

    try {
      const next = new URL(raw);
      if (!ALLOWED_RETURN_HOSTS.includes(next.hostname)) return '';
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

  function mountAuth(clerk, mode) {
    if (!root) return;
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

  function withMode(mode) {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', mode);
    return url.toString();
  }

  async function completeIfSignedIn(clerk, returnUrl, state) {
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

  async function init() {
    try {
      const mode = getMode();
      const state = getState();
      const returnUrl = getReturnUrl();
      updateModeLinks(mode);

      await loadScript(CLERK_UI_SCRIPT);
      await loadScript(CLERK_BROWSER_SCRIPT, {
        'data-clerk-publishable-key': CLERK_PUBLISHABLE_KEY,
        'data-clerk-domain': CLERK_FRONTEND_DOMAIN
      });

      const clerk = window.Clerk;
      if (!clerk || typeof clerk.load !== 'function') {
        throw new Error('Clerk browser SDK did not initialize.');
      }

      await clerk.load({
        ui: { ClerkUI: window.__internal_ClerkUICtor }
      });

      if (await completeIfSignedIn(clerk, returnUrl, state)) {
        return;
      }

      if (typeof clerk.addListener === 'function') {
        clerk.addListener(async () => {
          try {
            await completeIfSignedIn(clerk, returnUrl, state);
          } catch (error) {
            setStatus('Could not finish login', error.message, 'error');
          }
        });
      }

      mountAuth(clerk, mode);
    } catch (error) {
      setStatus('Account bridge failed', error.message || 'Unknown authentication error.', 'error');
    }
  }

  init();
})();
