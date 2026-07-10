const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const repoRoot = path.join(__dirname, '..', '..');

describe('Clerk auth bridge', () => {
  it('publishes a static ltth.app account portal at /auth', () => {
    const authIndex = readRootFile('auth', 'index.html');
    const authScript = readRootFile('auth', 'bridge.js');

    assert(authIndex.includes('<script src="bridge.js"'));
    assert(authIndex.includes('id="ltth-auth-bridge-root"'));
    assert(authIndex.includes('data-auth-mode-switcher'));
    assert(authIndex.includes('Manage your LTTH account on ltth.app'));
    assert(authScript.includes('pk_live_Y2xlcmsubHR0aC5hcHAk'));
    assert(authScript.includes('https://clerk.ltth.app/npm/@clerk/clerk-js@6/dist/clerk.browser.js'));
    assert(authScript.includes('ALLOWED_RETURN_HOSTS'));
    assert(authScript.includes('127.0.0.1'));
    assert(authScript.includes('localhost'));
    assert(authScript.includes('ltth.app/auth/'));
    assert(authScript.includes('mountUserButton'));
    assert(authScript.includes('session.getToken'));
    assert(authScript.includes('redirectWithToken'));
    assert(authScript.includes('watchForAuthenticatedSession'));
    assert(authScript.includes('window.setInterval(tick, 500)'));
    assert(authScript.includes('SCRIPT_LOAD_TIMEOUT_MS = 15000'));
    assert(authScript.includes('loadScriptWithRetry'));
    assert(authScript.includes('Retrying account bridge'));
    assert(authScript.includes('Reload the page to try again.'));
    assert(authScript.includes('setModeSwitcherVisible'));
    assert(!authScript.includes('<div class="switcher">'));
    assert(!authScript.includes('clerk.addListener'));
    assert(!authScript.includes('CLERK_SECRET_KEY'));
    assert(!authScript.includes('sk_live_'));
    assert(!authScript.includes('accounts.ltth.app/user'));
  });

  it('ships a local callback page that accepts token fragments from the bridge', () => {
    const callbackHtml = readAppFile('public', 'auth', 'clerk', 'callback.html');

    assert(callbackHtml.includes('ltth_store_auth_token'));
    assert(callbackHtml.includes('location.hash'));
    assert(callbackHtml.includes('/api/plugin-store/session'));
    assert(callbackHtml.includes('Authorization'));
    assert(callbackHtml.includes("credentials: 'same-origin'"));
    assert(callbackHtml.includes('sessionStorage'));
  });

  it('exposes bridge defaults through the store auth config', () => {
    const { buildStoreAuthConfig } = require('../modules/clerk-store-auth');

    const config = buildStoreAuthConfig({
      CLERK_PUBLISHABLE_KEY: 'pk_test_public'
    });

    assert.strictEqual(config.authBridgeUrl, 'https://ltth.app/auth/');
    assert.strictEqual(config.authCallbackPath, '/auth/clerk/callback.html');
    assert.strictEqual(config.accountPortalBaseUrl, 'https://ltth.app/auth');
    assert.strictEqual(config.accountManagementUrl, 'https://ltth.app/auth/');
    assert.strictEqual(config.signInUrl, 'https://ltth.app/auth/?mode=sign-in');
    assert.strictEqual(config.signUpUrl, 'https://ltth.app/auth/?mode=sign-up');
    assert.strictEqual(config.unauthorizedSignInUrl, 'https://ltth.app/auth/?mode=sign-in&reason=unauthorized');
  });

  it('makes the dashboard StoreAuth client use bridge tokens', () => {
    const storeAuthScript = readAppFile('public', 'js', 'clerk-store-auth.js');

    assert(storeAuthScript.includes('ltth_store_auth_token'));
    assert(storeAuthScript.includes('ltth.app/auth/'));
    assert(storeAuthScript.includes('data-store-account-manage'));
    assert(storeAuthScript.includes('same username as your TikTok @'));
    assert(storeAuthScript.includes('You can change it later'));
    assert(storeAuthScript.includes('authBridgeUrl'));
    assert(storeAuthScript.includes('beginBridgeAuth'));
    assert(storeAuthScript.includes('mountUserButton'));
    assert(storeAuthScript.includes('signInUrl'));
    assert(storeAuthScript.includes('signUpUrl'));
    assert(storeAuthScript.includes('/api/plugin-store/session'));
    assert(storeAuthScript.includes('/api/plugin-store/account'));
    assert(storeAuthScript.includes('Authorization'));
    assert(storeAuthScript.includes('restoreBridgeSession'));
    assert(storeAuthScript.includes('Set LTTH_STORE_CLERK_PUBLISHABLE_KEY or CLERK_PUBLISHABLE_KEY'));
    assert(storeAuthScript.includes("credentials: 'same-origin'"));
    assert(!storeAuthScript.includes('accounts.ltth.app/user'));
    assert(!storeAuthScript.includes('LTTH_STORE_CLERK_SECRET_KEY or CLERK_SECRET_KEY'));
  });

  it('renders the signed-out store auth card when the bridge is disabled', async () => {
    const storeAuthScript = readAppFile('public', 'js', 'clerk-store-auth.js');
    const dom = new JSDOM(`<!doctype html>
      <div id="plugin-store-auth-root"></div>
      <div id="plugin-store-account-menu"></div>
    `, {
      url: 'http://127.0.0.1:3000/dashboard.html#plugins',
      runScripts: 'outside-only'
    });
    const { window } = dom;

    window.fetch = async (url) => {
      if (url === '/api/plugin-store/config') {
        return jsonResponse({
          success: true,
          clerkEnabled: true,
          publishableKey: 'pk_test_public',
          frontendDomain: 'clerk.ltth.app',
          authBridgeUrl: '',
          authCallbackPath: '/auth/clerk/callback.html'
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    window.eval(storeAuthScript);
    await window.StoreAuth.init();

    const authRoot = window.document.getElementById('plugin-store-auth-root');
    assert(authRoot.textContent.includes('Create your store account'));
    assert(authRoot.textContent.includes('Sign in'));
    assert(authRoot.querySelector('[data-store-auth-mode="sign-in"]'));
  });

  it('keeps users signed in when the local store session cookie restores the account without a bridge token', async () => {
    const storeAuthScript = readAppFile('public', 'js', 'clerk-store-auth.js');
    const dom = new JSDOM(`<!doctype html>
      <div id="plugin-store-auth-root"></div>
      <div id="plugin-store-account-menu"></div>
    `, {
      url: 'http://127.0.0.1:3000/dashboard.html#plugins',
      runScripts: 'outside-only'
    });
    const { window } = dom;
    const requests = [];

    window.fetch = async (url) => {
      requests.push(String(url));

      if (url === '/api/plugin-store/config') {
        return jsonResponse({
          success: true,
          clerkEnabled: true,
          publishableKey: 'pk_test_public',
          authBridgeUrl: 'https://ltth.app/auth/',
          authCallbackPath: '/auth/clerk/callback.html'
        });
      }

      if (url === '/api/plugin-store/account') {
        return jsonResponse({
          success: true,
          account: {
            authenticated: true,
            userId: 'user_cookie',
            license: { active: true, plan: 'beta-free' },
            access: { groups: ['admin'], closedBetaPlugins: ['sidekick'] }
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    window.eval(storeAuthScript);
    await window.StoreAuth.init();

    assert(requests.includes('/api/plugin-store/account'));
    assert.strictEqual(window.StoreAuth.isSignedIn, true);
    assert.strictEqual(window.StoreAuth.account.userId, 'user_cookie');
    assert.strictEqual(window.document.getElementById('plugin-store-auth-root').style.display, 'none');
    assert(window.document.getElementById('plugin-store-account-menu').textContent.includes('user_cookie'));
    const accountUrl = new URL(window.document.querySelector('[data-store-account-manage]').href);
    assert.strictEqual(accountUrl.origin, 'https://ltth.app');
    assert.strictEqual(accountUrl.pathname, '/auth/');
    assert.strictEqual(accountUrl.searchParams.get('redirect_url'), null);
  });

  it('shows account management and TikTok username guidance before store registration', async () => {
    const storeAuthScript = readAppFile('public', 'js', 'clerk-store-auth.js');
    const dom = new JSDOM(`<!doctype html>
      <div id="plugin-store-auth-root"></div>
      <div id="plugin-store-account-menu"></div>
    `, {
      url: 'http://127.0.0.1:3000/dashboard.html#plugins',
      runScripts: 'outside-only'
    });
    const { window } = dom;

    window.fetch = async (url) => {
      if (url === '/api/plugin-store/config') {
        return jsonResponse({
          success: true,
          clerkEnabled: true,
          publishableKey: 'pk_test_public',
          authBridgeUrl: 'https://ltth.app/auth/',
          authCallbackPath: '/auth/clerk/callback.html',
          accountManagementUrl: 'https://ltth.app/auth/'
        });
      }

      if (url === '/api/plugin-store/account') {
        return jsonResponse({ success: false }, 401);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    window.eval(storeAuthScript);
    await window.StoreAuth.init();

    const authRoot = window.document.getElementById('plugin-store-auth-root');
    const text = authRoot.textContent;

    assert(text.includes('Use the same username as your TikTok @'));
    assert(text.includes('You can change it later'));
    const accountUrl = new URL(authRoot.querySelector('[data-store-account-manage]').href);
    assert.strictEqual(accountUrl.origin, 'https://ltth.app');
    assert.strictEqual(accountUrl.pathname, '/auth/');
    assert.strictEqual(accountUrl.searchParams.get('redirect_url'), null);
  });
});

function readRootFile(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

function readAppFile(...segments) {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8');
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}
