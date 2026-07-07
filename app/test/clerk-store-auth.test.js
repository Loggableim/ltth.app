const assert = require('assert');

describe('Clerk store auth', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('builds public config without exposing the secret key', () => {
    const { buildStoreAuthConfig } = require('../modules/clerk-store-auth');

    const config = buildStoreAuthConfig({
      CLERK_PUBLISHABLE_KEY: 'pk_test_public',
      CLERK_SECRET_KEY: 'sk_test_secret'
    });

    assert.strictEqual(config.authRequired, true);
    assert.strictEqual(config.clerkEnabled, true);
    assert.strictEqual(config.publishableKey, 'pk_test_public');
    assert.strictEqual(config.proxyUrl, '');
    assert.strictEqual(config.accountPortalBaseUrl, 'https://accounts.ltth.app');
    assert.strictEqual(config.accountManagementUrl, 'https://accounts.ltth.app/user');
    assert.strictEqual(config.signInUrl, 'https://accounts.ltth.app/sign-in');
    assert.strictEqual(config.signUpUrl, 'https://accounts.ltth.app/sign-up');
    assert.strictEqual(config.unauthorizedSignInUrl, 'https://accounts.ltth.app/unauthorized-sign-in');
    assert.strictEqual(config.secretConfigured, true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(config, 'secretKey'), false);
  });

  it('accepts framework-prefixed publishable keys', () => {
    const { buildStoreAuthConfig } = require('../modules/clerk-store-auth');

    const config = buildStoreAuthConfig({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
      CLERK_SECRET_KEY: 'sk_test_secret',
      CLERK_PROXY_URL: '/auth-proxy'
    });

    assert.strictEqual(config.clerkEnabled, true);
    assert.strictEqual(config.publishableKey, 'pk_test_public');
    assert.strictEqual(config.proxyUrl, '/auth-proxy');
  });

  it('allows overriding the public account management URL', () => {
    const { buildStoreAuthConfig } = require('../modules/clerk-store-auth');

    const config = buildStoreAuthConfig({
      CLERK_PUBLISHABLE_KEY: 'pk_test_public',
      CLERK_SECRET_KEY: 'sk_test_secret',
      LTTH_ACCOUNT_MANAGEMENT_URL: 'https://accounts.example.test/profile'
    });

    assert.strictEqual(config.accountManagementUrl, 'https://accounts.example.test/profile');
  });

  it('derives the Clerk frontend domain from publishable keys', () => {
    const { deriveClerkFrontendDomain } = require('../modules/clerk-store-auth');

    assert.strictEqual(
      deriveClerkFrontendDomain('pk_live_Y2xlcmsubHR0aC5hcHAk'),
      'clerk.ltth.app'
    );
  });

  it('returns a setup error when Clerk is not configured', () => {
    const { createRequireStoreAuth } = require('../modules/clerk-store-auth');
    const middleware = createRequireStoreAuth({ env: {} });
    const response = createJsonResponse();
    const next = jest.fn();

    middleware({}, response, next);

    assert.strictEqual(response.statusCode, 503);
    assert.strictEqual(response.body.code, 'CLERK_NOT_CONFIGURED');
    assert.strictEqual(next.mock.calls.length, 0);
  });

  it('rejects unauthenticated store requests', async () => {
    const { createRequireStoreAuth } = require('../modules/clerk-store-auth');
    const middleware = createRequireStoreAuth({
      env: {
        CLERK_PUBLISHABLE_KEY: 'pk_test_public',
        CLERK_SECRET_KEY: 'sk_test_secret'
      },
      clerkExpress: {
        getAuth: () => ({ isAuthenticated: false })
      }
    });
    const response = createJsonResponse();
    const next = jest.fn();

    await middleware({}, response, next);

    assert.strictEqual(response.statusCode, 401);
    assert.strictEqual(response.body.code, 'AUTH_REQUIRED');
    assert.strictEqual(next.mock.calls.length, 0);
  });

  it('attaches account context for authenticated store requests', async () => {
    const { createRequireStoreAuth } = require('../modules/clerk-store-auth');
    const request = {};
    const response = createJsonResponse();
    const next = jest.fn();
    const has = jest.fn(() => true);
    const middleware = createRequireStoreAuth({
      env: {
        CLERK_PUBLISHABLE_KEY: 'pk_test_public',
        CLERK_SECRET_KEY: 'sk_test_secret'
      },
      clerkExpress: {
        getAuth: () => ({
          isAuthenticated: true,
          userId: 'user_123',
          sessionId: 'sess_123',
          has
        })
      }
    });

    await middleware(request, response, next);

    assert.strictEqual(next.mock.calls.length, 1);
    assert.strictEqual(request.storeAccount.userId, 'user_123');
    assert.strictEqual(request.storeAccount.sessionId, 'sess_123');
    assert.strictEqual(request.storeAccount.has({ plan: 'pro' }), true);
  });

  it('includes beta license status in the store account response', () => {
    const { buildStoreAccountResponse } = require('../modules/clerk-store-auth');

    const response = buildStoreAccountResponse({
      storeAccount: {
        userId: 'user_123',
        sessionId: 'sess_123',
        license: {
          active: true,
          status: 'active',
          plan: 'beta-free',
          licenseId: 'ltth_beta_user_123'
        }
      }
    });

    assert.strictEqual(response.account.license.active, true);
    assert.strictEqual(response.account.license.plan, 'beta-free');
    assert.strictEqual(response.account.license.licenseId, 'ltth_beta_user_123');
  });

  it('normalizes store access metadata for admin and closed beta grants', () => {
    const {
      hasClosedBetaPluginAccess,
      hasStoreAdminAccess,
      normalizeStoreAccess
    } = require('../modules/clerk-store-auth');

    const access = normalizeStoreAccess({
      ltthAccess: {
        groups: ['admin', 'closed-beta', ''],
        closedBetaPlugins: ['sidekick', 'openshock', 'sidekick']
      }
    });

    assert.deepStrictEqual(access.groups, ['admin', 'closed-beta']);
    assert.deepStrictEqual(access.closedBetaPlugins, ['sidekick', 'openshock']);
    assert.strictEqual(hasStoreAdminAccess({ access }), true);
    assert.strictEqual(hasClosedBetaPluginAccess({ access }, 'sidekick'), true);
    assert.strictEqual(hasClosedBetaPluginAccess({ access }, 'openshock'), true);
    assert.strictEqual(hasClosedBetaPluginAccess({ access }, 'animazingpal'), true);
  });

  it('includes access grants in the store account response', () => {
    const { buildStoreAccountResponse } = require('../modules/clerk-store-auth');

    const response = buildStoreAccountResponse({
      storeAccount: {
        userId: 'user_123',
        access: {
          groups: ['admin'],
          closedBetaPlugins: ['store-admin']
        }
      }
    });

    assert.deepStrictEqual(response.account.access.groups, ['admin']);
    assert.deepStrictEqual(response.account.access.closedBetaPlugins, ['store-admin']);
  });

  it('sets the local store session as an explicit persistent 14-day cookie', () => {
    const {
      setStoreSessionCookie,
      STORE_SESSION_COOKIE
    } = require('../modules/clerk-store-auth');
    const response = createHeaderResponse();
    const ok = setStoreSessionCookie(response, {
      userId: 'user_cookie',
      sessionId: 'sess_cookie'
    }, {
      env: {
        CLERK_SECRET_KEY: 'sk_test_secret'
      },
      now: () => new Date('2026-07-06T12:00:00.000Z')
    });
    const cookie = response.getHeader('Set-Cookie');

    assert.strictEqual(ok, true);
    assert(cookie.includes(`${STORE_SESSION_COOKIE}=`));
    assert(cookie.includes('Max-Age=1209600'));
    assert(cookie.includes('Expires=Mon, 20 Jul 2026 12:00:00 GMT'));
    assert(cookie.includes('Path=/'));
    assert(cookie.includes('HttpOnly'));
    assert(cookie.includes('SameSite=Lax'));
  });

  it('claims a free beta license through Clerk metadata', async () => {
    const { claimBetaLicenseForStoreAccount } = require('../modules/clerk-store-auth');
    const updateUserMetadata = jest.fn(async () => ({
      id: 'user_123',
      privateMetadata: {
        ltthLicense: {
          status: 'active',
          plan: 'beta-free',
          licenseId: 'ltth_beta_user_123'
        }
      },
      publicMetadata: {
        ltth: {
          hasLicense: true,
          plan: 'beta-free'
        }
      }
    }));

    const result = await claimBetaLicenseForStoreAccount({
      userId: 'user_123'
    }, {
      now: () => new Date('2026-07-06T00:00:00.000Z'),
      clerkClient: {
        users: {
          updateUserMetadata
        }
      }
    });

    assert.strictEqual(result.active, true);
    assert.strictEqual(result.plan, 'beta-free');
    assert.strictEqual(result.licenseId, 'ltth_beta_user_123');
    assert.strictEqual(updateUserMetadata.mock.calls.length, 1);
    assert.deepStrictEqual(updateUserMetadata.mock.calls[0][0], 'user_123');
    assert.strictEqual(updateUserMetadata.mock.calls[0][1].privateMetadata.ltthLicense.claimedAt, '2026-07-06T00:00:00.000Z');
    assert.strictEqual(updateUserMetadata.mock.calls[0][1].publicMetadata.ltth.hasLicense, true);
  });
});

function createJsonResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function createHeaderResponse() {
  const headers = {};
  return {
    getHeader(name) {
      return headers[name] || headers[String(name).toLowerCase()];
    },
    setHeader(name, value) {
      headers[name] = value;
      headers[String(name).toLowerCase()] = value;
    }
  };
}
