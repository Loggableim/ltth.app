const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { setupPluginRoutes } = require('../routes/plugin-routes');

function createAuthFixture(claimOverrides = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048
  });

  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const token = jwt.sign({
    sub: 'user_123',
    sid: 'sess_123',
    azp: 'http://127.0.0.1:3000',
    ...claimOverrides
  }, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    algorithm: 'RS256',
    expiresIn: '1h'
  });

  return { publicPem, token };
}

function createTestApp(pluginsDir, envOverrides = {}, options = {}) {
  const app = express();
  app.use(express.json());

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
    loadPlugin: jest.fn(),
    registerPluginTikTokEvents: jest.fn()
  };

  const authFixture = createAuthFixture(options.claimOverrides);
  const env = {
    CLERK_PUBLISHABLE_KEY: 'pk_test_public',
    CLERK_JWT_KEY: authFixture.publicPem,
    LTTH_ACCOUNT_PORTAL_URL: 'https://ltth.app/auth/',
    ...envOverrides
  };

  setupPluginRoutes(app, pluginLoader, (req, res, next) => next(), (req, res, next) => next(), logger, null, null, {
    env,
    pluginStore: options.pluginStore
  });

  return { app, logger, pluginLoader, authFixture, env };
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
            channel: 'open-beta',
            pricing: { type: 'free', amount: 0, currency: 'EUR' }
          },
          {
            id: 'store-admin',
            name: { en: 'LTTH App Store Admin' },
            description: { en: 'Admin only store plugin' },
            version: '1.0.0',
            packageUrl: 'https://example.com/store-admin.zip',
            channel: 'open-beta',
            access: { type: 'admin', hidden: true }
          }
        ]
      })
    }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('serves store config without requiring a secret key', async () => {
    const { app } = createTestApp(tempDir);

    const response = await request(app).get('/api/plugin-store/config').expect(200);

    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.clerkEnabled, true);
    assert.strictEqual(response.body.publishableKey, 'pk_test_public');
    assert.strictEqual(response.body.accountPortalBaseUrl, 'https://ltth.app/auth');
  });

  it('requires Clerk auth for store listing and persists the local session cookie', async () => {
    const { app, authFixture } = createTestApp(tempDir);

    await request(app)
      .get('/api/plugin-store')
      .expect(401);

    const sessionResponse = await request(app)
      .post('/api/plugin-store/session')
      .set('Authorization', `Bearer ${authFixture.token}`)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(200);

    assert.strictEqual(sessionResponse.body.success, true);
    assert.strictEqual(sessionResponse.body.account.authenticated, true);
    assert.strictEqual(sessionResponse.body.account.userId, 'user_123');
    assert(sessionResponse.headers['set-cookie'].some((value) => value.includes('ltth_store_session=')));

    const listing = await request(app)
      .get('/api/plugin-store')
      .set('Authorization', `Bearer ${authFixture.token}`)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(200);

    assert.strictEqual(listing.body.success, true);
    assert.strictEqual(listing.body.communityEnabled, false);
    assert.strictEqual(listing.body.plugins.some((plugin) => plugin.id === 'tts'), true);
    assert.strictEqual(listing.body.plugins.some((plugin) => plugin.id === 'store-admin'), false);
  });

  it('rejects community source mutations in the closed store', async () => {
    const { app, authFixture } = createTestApp(tempDir);

    const headers = {
      Authorization: `Bearer ${authFixture.token}`,
      Origin: 'http://127.0.0.1:3000'
    };

    await request(app)
      .post('/api/plugin-store/community/enable')
      .set(headers)
      .expect(410);

    await request(app)
      .post('/api/plugin-store/sources')
      .set(headers)
      .send({
        id: 'community',
        name: 'Community Store',
        url: 'https://example.com/community.json'
      })
      .expect(410);

    await request(app)
      .delete('/api/plugin-store/sources/community')
      .set(headers)
      .expect(410);
  });

  it('claims the beta license for the authenticated account', async () => {
    const { app, authFixture } = createTestApp(tempDir);

    const response = await request(app)
      .post('/api/plugin-store/license/claim')
      .set('Authorization', `Bearer ${authFixture.token}`)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(200);

    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.license.active, true);
    assert.strictEqual(response.body.license.plan, 'beta-free');
  });

  it('allows a paid Billing plan to install a subscriber-only plugin', async () => {
    const { app, authFixture } = createTestApp(tempDir, {}, {
      claimOverrides: { pla: 'u:premium' },
      pluginStore: createSubscriberPluginStore()
    });

    const response = await request(app)
      .post('/api/plugin-store/official/premium-plugin/install')
      .set('Authorization', `Bearer ${authFixture.token}`)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(200);

    assert.strictEqual(response.body.plugin.id, 'premium-plugin');
  });

  it('rejects a free Billing plan for a subscriber-only plugin', async () => {
    const { app, authFixture } = createTestApp(tempDir, {}, {
      claimOverrides: { pla: 'u:free' },
      pluginStore: createSubscriberPluginStore()
    });

    const response = await request(app)
      .post('/api/plugin-store/official/premium-plugin/install')
      .set('Authorization', `Bearer ${authFixture.token}`)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(403);

    assert.strictEqual(response.body.code, 'SUBSCRIBER_ACCESS_REQUIRED');
  });
});

function createSubscriberPluginStore() {
  const plugin = {
    id: 'premium-plugin',
    name: { en: 'Premium Plugin' },
    description: { en: 'Subscriber access only' },
    version: '1.0.0',
    access: { type: 'subscriber' }
  };
  const source = { id: 'official', name: 'Official LTTH Store' };

  return {
    findPlugin: jest.fn(async () => ({ source, plugin })),
    normalizeStorePlugin: jest.fn(() => plugin),
    getInstalledPlugins: jest.fn(() => new Map()),
    installPlugin: jest.fn(async () => ({ id: plugin.id, version: plugin.version }))
  };
}
