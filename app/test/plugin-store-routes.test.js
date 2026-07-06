const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const express = require('express');
const request = require('supertest');

const { setupPluginRoutes } = require('../routes/plugin-routes');
const { createRequireStoreAuth } = require('../modules/clerk-store-auth');

function createTestApp(pluginsDir, options = {}) {
  const app = express();
  app.use(express.json());

  const passThrough = (req, res, next) => next();
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
  const pluginLoader = {
    pluginsDir,
    plugins: new Map(),
    state: {},
    saveState: jest.fn(),
    unloadPlugin: jest.fn(),
    isPluginEnabledFromDisk: () => true,
    getLocalizedDescription: (manifest) => manifest.description,
    logger
  };

  setupPluginRoutes(app, pluginLoader, passThrough, passThrough, logger, null, null, options);
  return { app, logger, pluginLoader };
}

describe('Plugin store routes', () => {
  let tempDir;
  let originalFetch;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-store-routes-'));
    originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        schemaVersion: 1,
        plugins: [
          {
            id: 'tts',
            name: { en: 'TTS' },
            description: { en: 'Text to speech' },
            version: '1.0.0',
            packageUrl: 'https://example.com/tts.zip',
            channel: 'open-beta'
          }
        ]
      })
    }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('lists official store plugins while community is disabled', async () => {
    const { app } = createTestApp(tempDir);

    const response = await request(app).get('/api/plugin-store').expect(200);

    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.communityEnabled, false);
    assert.strictEqual(response.body.sources.length, 1);
    assert.strictEqual(response.body.sources[0].id, 'official');
    assert.strictEqual(response.body.plugins[0].id, 'tts');
    assert.strictEqual(response.body.plugins[0].official, true);
    assert.strictEqual(response.body.plugins[0].channel, 'open-beta');
  });

  it('rejects community source mutations for the closed store', async () => {
    const { app } = createTestApp(tempDir);

    const addResponse = await request(app)
      .post('/api/plugin-store/sources')
      .send({
        id: 'creator',
        name: 'Creator Store',
        url: 'https://example.com/community.json'
      })
      .expect(410);

    const enableResponse = await request(app)
      .post('/api/plugin-store/community/enable')
      .expect(410);

    assert.strictEqual(addResponse.body.code, 'COMMUNITY_SOURCES_DISABLED');
    assert.strictEqual(enableResponse.body.code, 'COMMUNITY_SOURCES_DISABLED');
  });

  it('applies injected store auth to listing and install endpoints', async () => {
    const storeAuth = jest.fn((req, res, next) => {
      if (req.get('authorization') !== 'Bearer test-session') {
        return res.status(401).json({
          success: false,
          code: 'AUTH_REQUIRED',
          error: 'Sign in to use the plugin store.'
        });
      }
      req.storeAccount = { userId: 'user_test' };
      return next();
    });
    const { app } = createTestApp(tempDir, {
      storeAuth,
      env: {
        CLERK_SECRET_KEY: 'sk_test_cookie_secret'
      }
    });

    await request(app)
      .get('/api/plugin-store')
      .expect(401);

    await request(app)
      .get('/api/plugin-store')
      .set('authorization', 'Bearer test-session')
      .expect(200);

    await request(app)
      .post('/api/plugin-store/official/tts/install')
      .expect(401);

    assert.strictEqual(storeAuth.mock.calls.length, 3);
  });

  it('claims a beta license for an authenticated store account', async () => {
    const claimBetaLicense = jest.fn(async (req) => ({
      active: true,
      status: 'active',
      plan: 'beta-free',
      licenseId: `ltth_beta_${req.storeAccount.userId}`
    }));
    const storeAuth = (req, res, next) => {
      req.storeAccount = { userId: 'user_test' };
      next();
    };
    const { app } = createTestApp(tempDir, { storeAuth, claimBetaLicense });

    const response = await request(app)
      .post('/api/plugin-store/license/claim')
      .expect(200);

    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.license.active, true);
    assert.strictEqual(response.body.license.plan, 'beta-free');
    assert.strictEqual(response.body.license.licenseId, 'ltth_beta_user_test');
    assert.strictEqual(claimBetaLicense.mock.calls.length, 1);
  });

  it('records feedback and telemetry and exposes local store health summaries', async () => {
    const storeAuth = (req, res, next) => {
      req.storeAccount = {
        userId: 'user_feedback',
        license: { active: true, status: 'active', plan: 'beta-free' },
        access: { groups: [], closedBetaPlugins: [] }
      };
      next();
    };
    const { app } = createTestApp(tempDir, {
      storeAuth,
      storeInsightsFile: path.join(tempDir, '_state', 'store-insights.json')
    });

    const feedbackResponse = await request(app)
      .post('/api/plugin-store/feedback')
      .send({
        pluginId: 'tts',
        rating: 5,
        kind: 'review',
        message: 'Works well for my stream'
      })
      .expect(201);

    await request(app)
      .post('/api/plugin-store/telemetry')
      .send({
        pluginId: 'tts',
        event: 'install_success',
        durationMs: 1234
      })
      .expect(202);

    const healthResponse = await request(app)
      .get('/api/plugin-store/health')
      .expect(200);

    assert.strictEqual(feedbackResponse.body.success, true);
    assert.strictEqual(feedbackResponse.body.feedback.pluginId, 'tts');
    assert.strictEqual(feedbackResponse.body.feedback.userId, 'user_feedback');
    assert.strictEqual(healthResponse.body.success, true);
    assert.strictEqual(healthResponse.body.summary.feedbackCount, 1);
    assert.strictEqual(healthResponse.body.summary.telemetryCount, 1);
    assert.strictEqual(healthResponse.body.summary.plugins.tts.feedbackCount, 1);
    assert.strictEqual(healthResponse.body.summary.plugins.tts.installSuccessCount, 1);
  });

  it('sets a two-week local store session cookie and restores accounts from it', async () => {
    const getUser = jest.fn(async (userId) => ({
      id: userId,
      privateMetadata: {
        ltthLicense: {
          status: 'active',
          plan: 'beta-free',
          licenseId: `ltth_beta_${userId}`
        },
        ltthAccess: {
          groups: ['admin'],
          closedBetaPlugins: ['openshock']
        }
      }
    }));
    const getAuth = jest.fn((req) => {
      if (req.get('authorization') === 'Bearer bridge-token') {
        return {
          isAuthenticated: true,
          userId: 'user_cookie',
          sessionId: 'sess_cookie'
        };
      }
      return { isAuthenticated: false };
    });
    const storeAuth = createRequireStoreAuth({
      env: {
        CLERK_PUBLISHABLE_KEY: 'pk_test_public',
        CLERK_SECRET_KEY: 'sk_test_cookie_secret'
      },
      clerkExpress: { getAuth },
      clerkClient: {
        users: { getUser }
      }
    });
    const { app } = createTestApp(tempDir, {
      storeAuth,
      env: {
        CLERK_SECRET_KEY: 'sk_test_cookie_secret'
      }
    });

    const sessionResponse = await request(app)
      .post('/api/plugin-store/session')
      .set('authorization', 'Bearer bridge-token')
      .expect(200);
    const cookie = sessionResponse.headers['set-cookie'].find((value) => value.startsWith('ltth_store_session='));

    assert(cookie.includes('Max-Age=1209600'));
    assert(cookie.includes('HttpOnly'));
    assert(cookie.includes('SameSite=Lax'));

    const accountResponse = await request(app)
      .get('/api/plugin-store/account')
      .set('Cookie', cookie)
      .expect(200);

    assert.strictEqual(accountResponse.body.account.authenticated, true);
    assert.strictEqual(accountResponse.body.account.userId, 'user_cookie');
    assert.strictEqual(accountResponse.body.account.license.active, true);
    assert.deepStrictEqual(accountResponse.body.account.access.groups, ['admin']);
    assert.deepStrictEqual(accountResponse.body.account.access.closedBetaPlugins, ['openshock']);
  });

  it('blocks plugin installs until the authenticated account has a beta license', async () => {
    const storeAuth = (req, res, next) => {
      req.storeAccount = {
        userId: 'user_test',
        license: { active: false, status: 'missing', plan: null }
      };
      next();
    };
    const { app } = createTestApp(tempDir, { storeAuth });

    const response = await request(app)
      .post('/api/plugin-store/official/tts/install')
      .expect(402);

    assert.strictEqual(response.body.success, false);
    assert.strictEqual(response.body.code, 'BETA_LICENSE_REQUIRED');
    assert.strictEqual(response.body.licenseRequired, true);
  });

  it('blocks direct installs of hidden admin plugins without admin access', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        schemaVersion: 1,
        plugins: [
          {
            id: 'store-admin',
            name: { en: 'Store Admin' },
            description: { en: 'User management' },
            version: '1.0.0',
            access: { type: 'admin', hidden: true },
            packageUrl: 'https://example.com/store-admin.zip',
            channel: 'open-beta'
          }
        ]
      })
    }));
    const storeAuth = (req, res, next) => {
      req.storeAccount = {
        userId: 'user_test',
        license: { active: true, status: 'active', plan: 'beta-free' },
        access: { groups: [], closedBetaPlugins: [] }
      };
      next();
    };
    const { app } = createTestApp(tempDir, { storeAuth });

    const response = await request(app)
      .post('/api/plugin-store/official/store-admin/install')
      .expect(403);

    assert.strictEqual(response.body.success, false);
    assert.strictEqual(response.body.code, 'ADMIN_ACCESS_REQUIRED');
  });

  it('blocks closed beta plugin installs without an invite grant', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        schemaVersion: 1,
        plugins: [
          {
            id: 'openshock',
            name: { en: 'OpenShock' },
            description: { en: 'Shock integration' },
            version: '1.1.0',
            access: { type: 'closed-beta' },
            packageUrl: 'https://example.com/openshock.zip',
            channel: 'open-beta'
          }
        ]
      })
    }));
    const storeAuth = (req, res, next) => {
      req.storeAccount = {
        userId: 'user_test',
        license: { active: true, status: 'active', plan: 'beta-free' },
        access: { groups: [], closedBetaPlugins: [] }
      };
      next();
    };
    const { app } = createTestApp(tempDir, { storeAuth });

    const response = await request(app)
      .post('/api/plugin-store/official/openshock/install')
      .expect(403);

    assert.strictEqual(response.body.success, false);
    assert.strictEqual(response.body.code, 'CLOSED_BETA_INVITE_REQUIRED');
  });
});
