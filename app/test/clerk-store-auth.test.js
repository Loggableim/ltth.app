const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

describe('Clerk store auth', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('builds public config without requiring a secret key', () => {
    const { buildStoreAuthConfig } = require('../modules/clerk-store-auth');

    const config = buildStoreAuthConfig({
      CLERK_PUBLISHABLE_KEY: 'pk_test_public'
    });

    assert.strictEqual(config.authRequired, true);
    assert.strictEqual(config.clerkEnabled, true);
    assert.strictEqual(config.publishableKey, 'pk_test_public');
    assert.strictEqual(config.proxyUrl, '');
    assert.strictEqual(config.authBridgeUrl, '');
    assert.strictEqual(config.accountPortalBaseUrl, 'https://ltth.app/auth');
    assert.strictEqual(config.accountManagementUrl, 'https://ltth.app/auth/');
    assert.strictEqual(config.signInUrl, 'https://ltth.app/auth/?mode=sign-in');
    assert.strictEqual(config.signUpUrl, 'https://ltth.app/auth/?mode=sign-up');
    assert.strictEqual(config.unauthorizedSignInUrl, 'https://ltth.app/auth/?mode=sign-in&reason=unauthorized');
    assert.strictEqual(config.secretConfigured, false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(config, 'secretKey'), false);
  });

  it('accepts framework-prefixed publishable keys', () => {
    const { buildStoreAuthConfig } = require('../modules/clerk-store-auth');

    const config = buildStoreAuthConfig({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
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
      LTTH_ACCOUNT_MANAGEMENT_URL: 'https://ltth.app/account'
    });

    assert.strictEqual(config.accountManagementUrl, 'https://ltth.app/account');
  });

  it('prefers store-specific publishable keys over the generic publishable key', () => {
    const { buildStoreAuthConfig } = require('../modules/clerk-store-auth');

    const config = buildStoreAuthConfig({
      CLERK_PUBLISHABLE_KEY: 'pk_test_public',
      LTTH_STORE_CLERK_PUBLISHABLE_KEY: 'pk_test_store_public'
    });

    assert.strictEqual(config.clerkEnabled, true);
    assert.strictEqual(config.publishableKey, 'pk_test_store_public');
    assert.strictEqual(config.secretConfigured, false);
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
        CLERK_PUBLISHABLE_KEY: 'pk_test_public'
      }
    });
    const response = createJsonResponse();
    const next = jest.fn();

    await middleware({}, response, next);

    assert.strictEqual(response.statusCode, 401);
    assert.strictEqual(response.body.code, 'AUTH_REQUIRED');
    assert.strictEqual(next.mock.calls.length, 0);
  });

  it('attaches account context for authenticated store requests using the public JWT key', async () => {
    const { createRequireStoreAuth } = require('../modules/clerk-store-auth');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048
    });
    const token = jwt.sign({
      sub: 'user_123',
      sid: 'sess_123',
      azp: 'https://ltth.app'
    }, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
      algorithm: 'RS256',
      header: { kid: 'ltth-test-key' },
      expiresIn: '1h'
    });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
    const request = {};
    const response = createJsonResponse();
    const next = jest.fn();
    const middleware = createRequireStoreAuth({
      env: {
        CLERK_PUBLISHABLE_KEY: 'pk_test_public',
        CLERK_JWT_KEY: publicPem,
        LTTH_ACCOUNT_PORTAL_URL: 'https://ltth.app/auth/'
      }
    });
    request.headers = {
      authorization: `Bearer ${token}`,
      origin: 'https://ltth.app'
    };
    request.get = (name) => request.headers[String(name || '').toLowerCase()];

    await middleware(request, response, next);

    assert.strictEqual(next.mock.calls.length, 1);
    assert.strictEqual(request.storeAccount.userId, 'user_123');
    assert.strictEqual(request.storeAccount.sessionId, 'sess_123');
    assert.strictEqual(request.storeAccount.license.active, true);
    assert.strictEqual(request.storeAccount.license.plan, 'beta-free');
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
      hasSubscriberPluginAccess,
      hasStoreAdminAccess,
      normalizeStoreAccess
    } = require('../modules/clerk-store-auth');

    const access = normalizeStoreAccess({
      ltthAccess: {
        groups: ['admin', 'subscriber', 'closed-beta', ''],
        closedBetaPlugins: ['sidekick', 'openshock', 'sidekick']
      }
    });

    assert.deepStrictEqual(access.groups, ['admin', 'subscriber', 'closed-beta']);
    assert.deepStrictEqual(access.closedBetaPlugins, ['sidekick', 'openshock']);
    assert.strictEqual(hasStoreAdminAccess({ access }), true);
    assert.strictEqual(hasSubscriberPluginAccess({ access }), true);
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

  it('sets the local store session cookie from a verified token', () => {
    const {
      setStoreSessionCookie,
      STORE_SESSION_COOKIE
    } = require('../modules/clerk-store-auth');
    const response = createHeaderResponse();
    const ok = setStoreSessionCookie(response, {}, {
      token: 'eyJhbGciOiJSUzI1NiJ9.test.signature',
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
    assert(cookie.includes('eyJhbGciOiJSUzI1NiJ9.test.signature'));
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
