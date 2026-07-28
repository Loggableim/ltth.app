(function() {
  const STATE_KEY = 'ltth_store_auth_state';
  const NEXT_KEY = 'ltth_store_auth_next';
  const SIGNED_OUT_KEY = 'ltth_store_auth_signed_out';
  const DEFAULT_ACCOUNT_PORTAL_URL = 'https://ltth.app/auth/';
  const FRESH_TOKEN_TIMEOUT_MS = 120_000;
  const FRESH_TOKEN_ACTIONS = new Set([
    'account',
    'claim',
    'restore',
    'release',
    'set_default',
    'enroll',
    'revoke_device',
    'copy_stable'
  ]);

  const state = {
    initialized: false,
    initializing: null,
    config: null,
    signedIn: false,
    bridgeToken: '',
    account: null,
    storeMode: 'store',
    listeners: [],
    autoRestoreAttempted: false,
    signedOutExplicitly: false,
    navigate: null,
    openWindow: null,
    freshTokenRequests: new Map()
  };

  function emitChange() {
    for (const listener of state.listeners) {
      try {
        listener({ signedIn: state.signedIn, account: state.account, config: state.config });
      } catch (error) {
        console.warn('[StoreAuth] Listener failed:', error);
      }
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  function buildAccountPortalUrl(rawUrl) {
    try {
      return new URL(rawUrl || DEFAULT_ACCOUNT_PORTAL_URL, window.location.origin).toString();
    } catch {
      return DEFAULT_ACCOUNT_PORTAL_URL;
    }
  }

  function getAuthRoot() {
    return document.getElementById('plugin-store-auth-root');
  }

  function getAccountRoot() {
    return document.getElementById('plugin-store-account-menu');
  }

  function getAccountManagementUrl() {
    return buildAccountPortalUrl(state.config?.accountManagementUrl || DEFAULT_ACCOUNT_PORTAL_URL);
  }

  function getAccountSignInUrl() {
    return buildAccountPortalUrl(state.config?.signInUrl || `${DEFAULT_ACCOUNT_PORTAL_URL}?mode=sign-in`);
  }

  function getAccountSignUpUrl() {
    return buildAccountPortalUrl(state.config?.signUpUrl || `${DEFAULT_ACCOUNT_PORTAL_URL}?mode=sign-up`);
  }

  function getBridgeUrl() {
    return buildAccountPortalUrl(state.config?.authBridgeUrl || state.config?.accountPortalBaseUrl || DEFAULT_ACCOUNT_PORTAL_URL);
  }

  function getCallbackUrl() {
    try {
      return new URL(state.config?.authCallbackPath || '/auth/clerk/callback.html', window.location.origin).toString();
    } catch {
      return new URL('/auth/clerk/callback.html', window.location.origin).toString();
    }
  }

  function createBridgeState() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID().replace(/-/g, '');
    }
    if (window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(24);
      window.crypto.getRandomValues(bytes);
      return Array.from(
        bytes,
        value => value.toString(16).padStart(2, '0')
      ).join('');
    }
    throw new Error('Secure authentication state is unavailable.');
  }

  function setSplashVisible(visible) {
    const root = getAuthRoot();
    if (!root) return;
    const shouldShow = visible && state.storeMode !== 'installed';
    root.style.display = shouldShow ? 'flex' : 'none';
    root.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  }

  function navigate(url) {
    if (typeof state.navigate === 'function') {
      return state.navigate(url);
    }

    return window.location.assign(url);
  }

  function openWindow(url) {
    if (typeof state.openWindow === 'function') {
      return state.openWindow(url);
    }
    return window.open(
      url,
      '_blank',
      'popup,width=520,height=720'
    );
  }

  function setStoreMode(mode) {
    state.storeMode = mode === 'installed' ? 'installed' : 'store';
    if (state.storeMode === 'installed') {
      setSplashVisible(false);
    } else if (state.initialized && !state.signedIn) {
      renderSignedOut();
    }
  }

  function renderUsernameGuidance() {
    const accountUrl = getAccountManagementUrl();
    return `
      <div style="margin: 1rem 0; padding: 0.85rem; border: 1px solid rgba(96, 165, 250, 0.35); border-radius: 14px; background: rgba(96, 165, 250, 0.12);">
        <strong style="display: block; margin-bottom: 0.35rem;">Use the same username as your TikTok @.</strong>
        <span style="display: block; color: var(--color-text-muted); line-height: 1.45;">Your LTTH username is used later for account locking and licenses. You can change it later in account management.</span>
        <a href="${accountUrl}" target="_blank" rel="noopener" data-store-account-manage style="display: inline-flex; margin-top: 0.65rem; color: #93c5fd; font-weight: 800;">Open account management</a>
      </div>
    `;
  }

  function renderSetupRequired(config) {
    const root = getAuthRoot();
    if (!root) return;

    root.innerHTML = `
      <div class="plugin-store-auth-card">
        <div class="plugin-store-auth-card__eyebrow">Account required</div>
        <h3>LTTH Store is not configured yet</h3>
        <p>Set LTTH_STORE_CLERK_PUBLISHABLE_KEY or CLERK_PUBLISHABLE_KEY so the app can open the LTTH account portal.</p>
        <code>${escapeHtml(config?.publishableKey || 'CLERK_PUBLISHABLE_KEY missing')}</code>
      </div>
    `;
    setSplashVisible(true);
  }

  function renderLoadFailed(error) {
    const root = getAuthRoot();
    if (!root) return;

    root.innerHTML = `
      <div class="plugin-store-auth-card">
        <div class="plugin-store-auth-card__eyebrow">Account required</div>
        <h3>Clerk could not be loaded</h3>
        <p>The LTTH account portal could not finish authentication.</p>
        <code>${escapeHtml(error?.message || 'Unknown authentication error')}</code>
      </div>
    `;
    setSplashVisible(true);
  }

  function renderBridgeSignedOut() {
    const root = getAuthRoot();
    if (!root) return;

    root.innerHTML = `
      <div class="plugin-store-auth-card">
        <div class="plugin-store-auth-card__eyebrow">LTTH Account</div>
        <h3>Create your store account</h3>
        <p>Sign up or sign in through ltth.app to browse, install, and update official LTTH plugins.</p>
        ${renderUsernameGuidance()}
        <div class="plugin-store-auth-card__actions">
          <button type="button" class="btn btn-primary" data-store-auth-mode="sign-up">Create account</button>
          <button type="button" class="btn btn-ghost" data-store-auth-mode="sign-in">Sign in</button>
        </div>
        <p class="text-muted small mt-3">The secure auth bridge opens on ltth.app and returns to this local app.</p>
      </div>
    `;

    root.querySelector('[data-store-auth-mode="sign-up"]')?.addEventListener('click', () => beginBridgeAuth('sign-up'));
    root.querySelector('[data-store-auth-mode="sign-in"]')?.addEventListener('click', () => beginBridgeAuth('sign-in'));
    setSplashVisible(true);
  }

  function renderSignedOut() {
    renderBridgeSignedOut();
  }

  function mountSignIn(root, options = {}) {
    const mount = root || document.getElementById('plugin-store-clerk-mount');
    if (!mount) return;

    mount.innerHTML = `
      <div class="plugin-store-auth-card" style="margin: 0;">
        <h3>Sign in with ltth.app</h3>
        <p>${escapeHtml(options.message || 'Open the LTTH account portal to continue.')}</p>
        <div class="plugin-store-auth-card__actions">
          <button type="button" class="btn btn-primary" data-store-auth-mode="sign-in">Sign in</button>
          <button type="button" class="btn btn-ghost" data-store-auth-mode="sign-up">Create account</button>
        </div>
      </div>
    `;

    mount.querySelector('[data-store-auth-mode="sign-in"]')?.addEventListener('click', () => beginBridgeAuth('sign-in'));
    mount.querySelector('[data-store-auth-mode="sign-up"]')?.addEventListener('click', () => beginBridgeAuth('sign-up'));
  }

  function mountSignUp(root, options = {}) {
    const mount = root || document.getElementById('plugin-store-clerk-mount');
    if (!mount) return;

    mount.innerHTML = `
      <div class="plugin-store-auth-card" style="margin: 0;">
        <h3>Create your LTTH account</h3>
        <p>${escapeHtml(options.message || 'Open the LTTH account portal to create an account.')}</p>
        <div class="plugin-store-auth-card__actions">
          <button type="button" class="btn btn-primary" data-store-auth-mode="sign-up">Create account</button>
          <button type="button" class="btn btn-ghost" data-store-auth-mode="sign-in">Sign in</button>
        </div>
      </div>
    `;

    mount.querySelector('[data-store-auth-mode="sign-up"]')?.addEventListener('click', () => beginBridgeAuth('sign-up'));
    mount.querySelector('[data-store-auth-mode="sign-in"]')?.addEventListener('click', () => beginBridgeAuth('sign-in'));
  }

  function mountUserButton(root, options = {}) {
    const mount = root || document.getElementById('plugin-store-account-menu');
    if (!mount) return;

    const userLabel = state.account?.userId || options.userLabel || 'Manage account';
    mount.innerHTML = `
      <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; justify-content: flex-end;">
        <a href="${getAccountManagementUrl()}" target="_blank" rel="noopener" class="btn btn-ghost" data-store-account-manage>${escapeHtml(userLabel)}</a>
        <button type="button" class="btn btn-ghost" data-store-account-signout>Sign out</button>
      </div>
    `;

    mount.querySelector('[data-store-account-manage]')?.addEventListener('click', (event) => {
      event.preventDefault();
      window.open(getAccountManagementUrl(), '_blank', 'noopener');
    });
    mount.querySelector('[data-store-account-signout]')?.addEventListener('click', () => clearBridgeSession());
  }

  function renderAccountMenu() {
    const root = getAccountRoot();
    if (!root) return;

    root.innerHTML = '';

    if (state.signedIn) {
      mountUserButton(root, { userLabel: 'Manage account' });
      return;
    }

    root.innerHTML = `
      <button type="button" class="btn btn-primary" data-store-account-signin>Sign in</button>
    `;
    root.querySelector('[data-store-account-signin]')?.addEventListener('click', () => {
      beginBridgeAuth('sign-in');
    });
  }

  function renderState() {
    state.signedIn = Boolean(state.account?.authenticated === true || state.bridgeToken);
    renderAccountMenu();

    if (state.signedIn) {
      setSplashVisible(false);
    } else {
      renderSignedOut();
    }

    emitChange();
  }

  function clearStoredBridgeToken() {
    sessionStorage.removeItem('ltth_store_auth_token');
    sessionStorage.removeItem('ltth_store_auth_token_exp');
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    state.bridgeToken = '';
  }

  function getSignedOutStorageKey() {
    const cookieName = String(state.config?.storeSessionCookieName || 'default').trim() || 'default';
    return `${SIGNED_OUT_KEY}:${cookieName}`;
  }

  function clearExplicitSignedOutState() {
    localStorage.removeItem(getSignedOutStorageKey());
    state.signedOutExplicitly = false;
  }

  function getStoredBridgeToken() {
    clearStoredBridgeToken();
    return '';
  }

  async function fetchStoreAccount(token = '') {
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch('/api/plugin-store/account', {
      credentials: 'same-origin',
      headers
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload.error || `Local store account request failed with HTTP ${response.status}`);
      error.code = payload.code || 'STORE_ACCOUNT_FAILED';
      throw error;
    }

    return response.json();
  }

  async function createLocalStoreSession(token) {
    const response = await fetch('/api/plugin-store/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload.error || `Local account verification failed with HTTP ${response.status}`);
      error.code = payload.code || 'STORE_SESSION_FAILED';
      throw error;
    }

    return response.json();
  }

  async function restoreBridgeSession() {
    try {
      const accountResponse = await fetchStoreAccount('');
      if (accountResponse.success && accountResponse.account?.authenticated) {
        state.account = accountResponse.account;
        state.signedIn = true;
        return true;
      }
    } catch {
      // Fall back to a stored bridge token or a fresh sign-in prompt.
    }

    const token = getStoredBridgeToken();
    if (!token) {
      return false;
    }

    try {
      const sessionResponse = await createLocalStoreSession(token);
      state.bridgeToken = token;
      state.account = sessionResponse.account || null;
      state.signedIn = Boolean(state.account?.authenticated);
      return state.signedIn;
    } catch {
      clearStoredBridgeToken();
      return false;
    }
  }

  function beginBridgeAuth(mode = 'sign-up', options = {}) {
    clearExplicitSignedOutState();

    const bridgeState = createBridgeState();
    const callbackUrl = getCallbackUrl();
    const nextUrl = window.location.href;
    const bridgeUrl = new URL(getBridgeUrl());

    sessionStorage.setItem(STATE_KEY, bridgeState);
    sessionStorage.setItem(NEXT_KEY, nextUrl);

    bridgeUrl.searchParams.set('mode', mode === 'sign-in' ? 'sign-in' : 'sign-up');
    bridgeUrl.searchParams.set('state', bridgeState);
    bridgeUrl.searchParams.set('return_to', callbackUrl);
    bridgeUrl.searchParams.set('next', nextUrl);

    return navigate(bridgeUrl.toString());
  }

  function settleFreshTokenRequest(requestState, outcome, value) {
    const pending = state.freshTokenRequests.get(requestState);
    if (!pending) return;
    state.freshTokenRequests.delete(requestState);
    window.clearTimeout(pending.timeoutId);
    if (outcome === 'resolve') {
      pending.resolve(value);
      return;
    }
    pending.reject(value);
  }

  function handleFreshTokenMessage(event) {
    if (event.origin !== window.location.origin) return;
    const message = event.data;
    if (
      !message ||
      message.type !== 'ltth:clerk-fresh-token' ||
      typeof message.state !== 'string'
    ) {
      return;
    }
    const pending = state.freshTokenRequests.get(message.state);
    if (
      !pending ||
      event.source !== pending.popup ||
      message.action !== pending.action ||
      typeof message.token !== 'string' ||
      !message.token ||
      message.token.length > 16 * 1024 ||
      /\s/.test(message.token)
    ) {
      return;
    }
    try {
      pending.popup.close?.();
    } catch (_) {}
    settleFreshTokenRequest(
      message.state,
      'resolve',
      message.token
    );
  }

  function cancelFreshTokenRequests() {
    for (const [requestState, pending] of [
      ...state.freshTokenRequests.entries()
    ]) {
      try {
        pending.popup.close?.();
      } catch (_) {}
      settleFreshTokenRequest(
        requestState,
        'reject',
        new Error('Fresh account access was cancelled.')
      );
    }
  }

  async function getFreshToken({ action } = {}) {
    if (!FRESH_TOKEN_ACTIONS.has(action)) {
      throw new TypeError('A supported fresh-token action is required.');
    }
    await init();
    if (
      !state.config?.success ||
      !state.config?.clerkEnabled ||
      !state.config?.publishableKey
    ) {
      throw new Error('LTTH account sign-in is unavailable.');
    }

    const requestState = createBridgeState();
    const callbackUrl = new URL(getCallbackUrl());
    callbackUrl.searchParams.set('relay', 'fresh-token');
    callbackUrl.searchParams.set('relay_action', action);
    const bridgeUrl = new URL(getBridgeUrl());
    bridgeUrl.searchParams.set('mode', 'sign-in');
    bridgeUrl.searchParams.set('state', requestState);
    bridgeUrl.searchParams.set('return_to', callbackUrl.toString());

    const popup = openWindow(bridgeUrl.toString());
    if (!popup) {
      throw new Error('The sign-in window was blocked.');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        try {
          popup.close?.();
        } catch (_) {}
        settleFreshTokenRequest(
          requestState,
          'reject',
          new Error('The sign-in window timed out.')
        );
      }, FRESH_TOKEN_TIMEOUT_MS);
      state.freshTokenRequests.set(requestState, {
        action,
        popup,
        resolve,
        reject,
        timeoutId
      });
    });
  }

  async function clearBridgeSession(shouldRender = true) {
    cancelFreshTokenRequests();
    state.signedOutExplicitly = true;
    localStorage.setItem(getSignedOutStorageKey(), '1');
    clearStoredBridgeToken();
    state.bridgeToken = '';
    state.account = null;
    state.signedIn = false;

    fetch('/api/plugin-store/session', {
      method: 'DELETE',
      credentials: 'same-origin'
    }).catch((error) => {
      console.warn('[StoreAuth] Could not clear local store session:', error);
    });

    if (shouldRender) {
      renderState();
    }
  }

  async function init() {
    if (state.initialized) return state;
    if (state.initializing) return state.initializing;

    state.initializing = (async () => {
      const response = await fetch('/api/plugin-store/config');
      const config = await response.json();
      state.config = config;

      if (!config.success || !config.clerkEnabled || !config.publishableKey) {
        renderSetupRequired(config);
        state.initialized = true;
        return state;
      }

      try {
        state.account = null;
        state.bridgeToken = getStoredBridgeToken();
        state.signedOutExplicitly = localStorage.getItem(getSignedOutStorageKey()) === '1';
        if (!state.signedOutExplicitly) {
          await restoreBridgeSession();
        }
        renderState();
      } catch (error) {
        console.warn('[StoreAuth] Bridge session restore failed:', error);
        renderLoadFailed(error);
      }

      state.initialized = true;
      return state;
    })();

    return state.initializing;
  }

  async function requireAuth() {
    await init();
    if (state.signedIn) return true;
    if (state.config && !state.config.clerkEnabled) {
      renderSetupRequired(state.config);
    } else {
      if (!state.signedOutExplicitly && !state.autoRestoreAttempted) {
        state.autoRestoreAttempted = true;
        beginBridgeAuth('sign-in', { automatic: true });
        return false;
      }
      renderSignedOut();
    }
    return false;
  }

  async function refreshAccount() {
    await init();
    try {
      const response = await fetchStoreAccount('');
      state.account = response.account || null;
      state.signedIn = Boolean(state.account?.authenticated);
      emitChange();
      renderState();
      return state.account;
    } catch (error) {
      clearStoredBridgeToken();
      state.account = null;
      state.signedIn = false;
      emitChange();
      renderState();
      return null;
    }
  }

  function getToken() {
    return getStoredBridgeToken();
  }

  function onChange(listener) {
    if (typeof listener === 'function') {
      state.listeners.push(listener);
      if (state.initialized) {
        Promise.resolve().then(() => {
          listener({ signedIn: state.signedIn, account: state.account, config: state.config });
        }).catch((error) => {
          console.warn('[StoreAuth] Immediate listener notification failed:', error);
        });
      }
    }
  }

  function showSignIn() {
    renderSignedOut();
  }

  function renderSignedIn() {
    renderAccountMenu();
    setSplashVisible(false);
  }

  function configureForTest(options = {}) {
    state.navigate = typeof options.navigate === 'function' ? options.navigate : null;
    state.openWindow = typeof options.openWindow === 'function'
      ? options.openWindow
      : null;
  }

  const api = {
    beginBridgeAuth,
    clearBridgeSession,
    configureForTest,
    config: state.config,
    get account() {
      return state.account;
    },
    get clerk() {
      return null;
    },
    get isSignedIn() {
      return state.signedIn;
    },
    getToken,
    getFreshToken,
    init,
    mountSignIn,
    mountSignUp,
    mountUserButton,
    onChange,
    refreshAccount,
    requireAuth,
    renderSignedIn,
    setStoreMode,
    showSignIn,
    signOut: clearBridgeSession
  };

  function updatePublicConfig() {
    Object.defineProperty(api, 'config', {
      configurable: true,
      enumerable: true,
      get() {
        return state.config;
      }
    });
  }

  updatePublicConfig();

  window.StoreAuth = api;
  window.ClerkStoreAuth = api;
  window.addEventListener('message', handleFreshTokenMessage);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch((error) => {
        console.warn('[StoreAuth] Initialization failed:', error);
        renderLoadFailed(error);
      });
    }, { once: true });
  } else {
    init().catch((error) => {
      console.warn('[StoreAuth] Initialization failed:', error);
      renderLoadFailed(error);
    });
  }
})();
