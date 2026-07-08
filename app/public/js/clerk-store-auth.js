(function() {
    const TOKEN_KEY = 'ltth_store_auth_token';
    const EXPIRY_KEY = 'ltth_store_auth_token_exp';
    const STATE_KEY = 'ltth_store_auth_state';
    const NEXT_KEY = 'ltth_store_auth_next';
    const DEFAULT_ACCOUNT_PORTAL_URL = 'https://ltth.app/auth/';

    const state = {
        initialized: false,
        initializing: null,
        config: null,
        clerk: null,
        signedIn: false,
        bridgeToken: '',
        account: null,
        listeners: []
    };

    function emitChange() {
        for (const listener of state.listeners) {
            try {
                listener({ signedIn: state.signedIn, clerk: state.clerk, account: state.account });
            } catch (error) {
                console.warn('[StoreAuth] Listener failed:', error);
            }
        }
    }

    function deriveClerkDomain(publishableKey) {
        try {
            const encoded = String(publishableKey || '').split('_')[2];
            return encoded ? atob(encoded).slice(0, -1) : '';
        } catch {
            return '';
        }
    }

    function resolveProxyUrl(proxyUrl) {
        if (!proxyUrl) return '';
        try {
            return new URL(proxyUrl, window.location.origin).toString().replace(/\/+$/, '');
        } catch {
            return '';
        }
    }

    function loadScript(src, attributes = {}) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                for (const [name, value] of Object.entries(attributes)) {
                    if (value) existing.setAttribute(name, value);
                }
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
                if (existing.dataset.loaded === 'true') resolve();
                return;
            }

            const script = document.createElement('script');
            for (const [name, value] of Object.entries(attributes)) {
                if (value) script.setAttribute(name, value);
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
            document.head.appendChild(script);
        });
    }

    async function loadClerk(config) {
        const clerkDomain = config.frontendDomain || deriveClerkDomain(config.publishableKey);
        const proxyUrl = resolveProxyUrl(config.proxyUrl);
        if (!clerkDomain) {
            throw new Error('Unable to derive Clerk Frontend API domain from publishable key');
        }

        await loadScript(`https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`);
        await loadScript(`https://${clerkDomain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, {
            'data-clerk-publishable-key': config.publishableKey,
            'data-clerk-proxy-url': proxyUrl,
            'data-clerk-domain': clerkDomain
        });

        const clerk = window.Clerk;
        if (!clerk || typeof clerk.load !== 'function') {
            throw new Error('Clerk browser bundle did not expose window.Clerk.load');
        }

        await clerk.load({
            ui: { ClerkUI: window.__internal_ClerkUICtor }
        });

        return clerk;
    }

    function getAuthRoot() {
        return document.getElementById('plugin-store-auth-root');
    }

    function getAccountRoot() {
        return document.getElementById('plugin-store-account-menu');
    }

    function buildAccountPortalUrl(rawUrl) {
        try {
            const url = new URL(rawUrl || DEFAULT_ACCOUNT_PORTAL_URL, window.location.origin);
            return url.toString();
        } catch {
            return DEFAULT_ACCOUNT_PORTAL_URL;
        }
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

    function setSplashVisible(visible) {
        const root = getAuthRoot();
        if (!root) return;
        root.style.display = visible ? 'flex' : 'none';
        root.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function renderSetupRequired(config) {
        const root = getAuthRoot();
        if (!root) return;

        const missingKey = !config.publishableKey
            ? 'CLERK_PUBLISHABLE_KEY missing'
            : config.publishableKey;
        const setupHint = !config.publishableKey
            ? 'Add the live publishable key to app/.env or app/.env.example so the app can load Clerk.'
            : (!config.secretConfigured
                ? 'Set LTTH_STORE_CLERK_SECRET_KEY or CLERK_SECRET_KEY on the server to unlock the closed store.'
                : 'Clerk configuration loaded.');

        root.innerHTML = `
            <div class="plugin-store-auth-card">
                <div class="plugin-store-auth-card__eyebrow">Account required</div>
                <h3>Clerk is not configured yet</h3>
                <p>${escapeHtml(setupHint)}</p>
                <code>${escapeHtml(missingKey)}</code>
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
                <p>Check the Clerk domain, DNS, proxy configuration, and Content Security Policy.</p>
                <code>${escapeHtml(error?.message || 'Unknown Clerk loading error')}</code>
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
        if (state.config?.authBridgeUrl) {
            renderBridgeSignedOut();
            return;
        }

        const root = getAuthRoot();
        if (!root || !state.clerk) return;

        root.innerHTML = `
            <div class="plugin-store-auth-card">
                <div class="plugin-store-auth-card__eyebrow">LTTH Account</div>
                <h3>Create your store account</h3>
                <p>Sign up or sign in to browse, install, and update official LTTH plugins.</p>
                ${renderUsernameGuidance()}
                <div class="plugin-store-auth-card__actions">
                    <button type="button" class="btn btn-primary" data-store-auth-mode="sign-up">Create account</button>
                    <button type="button" class="btn btn-ghost" data-store-auth-mode="sign-in">Sign in</button>
                </div>
                <div id="plugin-store-clerk-mount" class="plugin-store-auth-card__mount"></div>
            </div>
        `;

        root.querySelector('[data-store-auth-mode="sign-up"]')?.addEventListener('click', () => mountSignUp());
        root.querySelector('[data-store-auth-mode="sign-in"]')?.addEventListener('click', () => mountSignIn());
        mountSignIn();
        setSplashVisible(true);
    }

    function mountSignIn() {
        const mount = document.getElementById('plugin-store-clerk-mount');
        if (!mount || !state.clerk || typeof state.clerk.mountSignIn !== 'function') return;
        mount.innerHTML = '';
        state.clerk.mountSignIn(mount, {
            afterSignInUrl: window.location.href,
            afterSignUpUrl: window.location.href,
            signInUrl: getAccountSignInUrl(),
            signUpUrl: getAccountSignUpUrl()
        });
    }

    function mountSignUp() {
        const mount = document.getElementById('plugin-store-clerk-mount');
        if (!mount || !state.clerk || typeof state.clerk.mountSignUp !== 'function') return;
        mount.innerHTML = '';
        state.clerk.mountSignUp(mount, {
            afterSignInUrl: window.location.href,
            afterSignUpUrl: window.location.href,
            signInUrl: getAccountSignInUrl(),
            signUpUrl: getAccountSignUpUrl()
        });
    }

    function renderAccountMenu() {
        const root = getAccountRoot();
        if (!root) return;

        root.innerHTML = '';
        if (state.signedIn && state.clerk && typeof state.clerk.mountUserButton === 'function') {
            state.clerk.mountUserButton(root, {
                userProfileMode: 'navigation',
                userProfileUrl: getAccountManagementUrl(),
                signInUrl: getAccountSignInUrl()
            });
            return;
        }

        if (state.signedIn) {
            const accountUrl = getAccountManagementUrl();
            root.innerHTML = `
                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; justify-content: flex-end;">
                    <a href="${accountUrl}" target="_blank" rel="noopener" class="btn btn-ghost" data-store-account-manage>
                        Manage account
                    </a>
                    <button type="button" class="btn btn-ghost" data-store-account-signout>
                        Sign out
                    </button>
                </div>
            `;
            root.querySelector('[data-store-account-signout]')?.addEventListener('click', clearBridgeSession);
            return;
        }

        root.innerHTML = '<button type="button" class="btn btn-primary" data-store-account-signin>Sign in</button>';
        root.querySelector('[data-store-account-signin]')?.addEventListener('click', () => {
            if (state.config?.authBridgeUrl) {
                beginBridgeAuth('sign-in');
            } else if (state.clerk && typeof state.clerk.openSignIn === 'function') {
                state.clerk.openSignIn();
            } else {
                renderSignedOut();
            }
        });
    }

    function renderState() {
        state.signedIn = Boolean(
            state.bridgeToken ||
            state.account?.authenticated === true ||
            (state.clerk && state.clerk.isSignedIn)
        );
        renderAccountMenu();

        if (state.signedIn) {
            setSplashVisible(false);
        } else {
            renderSignedOut();
        }

        emitChange();
    }

    function clearStoredBridgeToken() {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(EXPIRY_KEY);
        sessionStorage.removeItem(STATE_KEY);
        sessionStorage.removeItem(NEXT_KEY);
        state.bridgeToken = '';
    }

    function getStoredBridgeToken() {
        const token = sessionStorage.getItem(TOKEN_KEY) || '';
        if (!token) return '';

        const expiresAt = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);
        if (expiresAt > 0 && expiresAt <= Date.now() + 10000) {
            clearStoredBridgeToken();
            return '';
        }

        return token;
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
            throw new Error('Store account verification failed');
        }

        const payload = await response.json();
        if (!payload.success || !payload.account || payload.account.authenticated !== true) {
            throw new Error('Store account is not authenticated');
        }

        return payload.account;
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
            throw new Error('Local store session could not be created');
        }

        const payload = await response.json();
        if (!payload.success || !payload.account || payload.account.authenticated !== true) {
            throw new Error('Local store session did not return an authenticated account');
        }

        return payload.account;
    }

    async function restoreBridgeSession() {
        try {
            state.account = await fetchStoreAccount('');
            state.bridgeToken = getStoredBridgeToken();
            state.signedIn = true;
            return true;
        } catch {
            return false;
        }
    }

    async function verifyBridgeToken() {
        const token = getStoredBridgeToken();
        if (!token) return false;

        try {
            state.account = await createLocalStoreSession(token);
            state.bridgeToken = token;
            return true;
        } catch {
            clearStoredBridgeToken();
            return false;
        }
    }

    function createBridgeState() {
        const bytes = new Uint8Array(24);
        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            window.crypto.getRandomValues(bytes);
        } else {
            for (let index = 0; index < bytes.length; index += 1) {
                bytes[index] = Math.floor(Math.random() * 256);
            }
        }

        return Array.from(bytes)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    function beginBridgeAuth(mode = 'sign-up') {
        if (!state.config?.authBridgeUrl) {
            renderSignedOut();
            return;
        }

        const bridgeState = createBridgeState();
        const callbackUrl = new URL(state.config.authCallbackPath || '/auth/clerk/callback.html', window.location.origin);
        const nextUrl = window.location.href;
        const bridgeUrl = new URL(state.config.authBridgeUrl);

        sessionStorage.setItem(STATE_KEY, bridgeState);
        sessionStorage.setItem(NEXT_KEY, nextUrl);

        bridgeUrl.searchParams.set('mode', mode === 'sign-in' ? 'sign-in' : 'sign-up');
        bridgeUrl.searchParams.set('state', bridgeState);
        bridgeUrl.searchParams.set('return_to', callbackUrl.toString());
        bridgeUrl.searchParams.set('next', nextUrl);

        if (state.config.authTokenTemplate) {
            bridgeUrl.searchParams.set('template', state.config.authTokenTemplate);
        }

        window.location.href = bridgeUrl.toString();
    }

    function clearBridgeSession(shouldRender = true) {
        clearStoredBridgeToken();
        fetch('/api/plugin-store/session', {
            method: 'DELETE',
            credentials: 'same-origin'
        }).catch((error) => {
            console.warn('[StoreAuth] Could not clear local store session:', error);
        });
        state.account = null;
        state.signedIn = false;

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

            if (config.authBridgeUrl) {
                const tokenVerified = await verifyBridgeToken();
                if (!tokenVerified) {
                    await restoreBridgeSession();
                }
                renderState();
                state.initialized = true;
                return state;
            }

            try {
                state.clerk = await loadClerk(config);
                if (typeof state.clerk.addListener === 'function') {
                    state.clerk.addListener(() => renderState());
                }
                renderState();
            } catch (error) {
                console.warn('[StoreAuth] Clerk failed to load:', error);
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
            renderSignedOut();
        }
        return false;
    }

    async function getToken() {
        await init();
        const bridgeToken = getStoredBridgeToken();
        if (bridgeToken) {
            return bridgeToken;
        }

        if (!state.clerk || !state.clerk.session || typeof state.clerk.session.getToken !== 'function') {
            return '';
        }
        return state.clerk.session.getToken();
    }

    async function refreshAccount() {
        await init();
        const token = await getToken();
        if (!token) {
            state.account = null;
            emitChange();
            return null;
        }

        state.account = await fetchStoreAccount(token);
        state.signedIn = true;
        emitChange();
        return state.account;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    window.StoreAuth = {
        init,
        requireAuth,
        getToken,
        beginBridgeAuth,
        get clerk() {
            return state.clerk;
        },
        get account() {
            return state.account;
        },
        get isSignedIn() {
            return state.signedIn;
        },
        onChange(listener) {
            state.listeners.push(listener);
        },
        refreshAccount,
        showSignIn: renderSignedOut,
        signOut: clearBridgeSession
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
