const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const Sqlite = require('better-sqlite3');

const { setupPluginRoutes } = require('../routes/plugin-routes');
const StoreSessionStore = require('../modules/store-session-store');
const { buildStoreSessionCookieName } = require('../modules/clerk-store-auth');

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const sessionSqlite = options.sessionSqlite || new Sqlite(':memory:');
  const storeSessionStore = options.storeSessionStore || new StoreSessionStore(sessionSqlite);

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
    pluginStore: options.pluginStore,
    profileId: options.profileId || 'streamer-a',
    storeSessionStore
  });

  return { app, logger, pluginLoader, authFixture, env, sessionSqlite, storeSessionStore };
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
    assert.strictEqual(Object.hasOwn(response.body, 'automaticAuthDisabled'), false);
  });

  it('keeps the public Store config unchanged in the isolated docs profile', async () => {
    const { app } = createTestApp(tempDir, {
      LTTH_DOCS_CAPTURE: 'true'
    });

    const response = await request(app).get('/api/plugin-store/config').expect(200);

    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.clerkEnabled, true);
    assert.strictEqual(Object.hasOwn(response.body, 'automaticAuthDisabled'), false);
  });

  it('continues to require Clerk auth in the isolated docs profile', async () => {
    const { app } = createTestApp(tempDir, {
      LTTH_DOCS_CAPTURE: 'true'
    });

    const response = await request(app)
      .get('/api/plugin-store/account')
      .expect(401);

    assert.strictEqual(response.body.code, 'AUTH_REQUIRED');
  });

  it('continues to require Clerk auth for the store account outside the docs profile', async () => {
    const { app } = createTestApp(tempDir);

    const response = await request(app)
      .get('/api/plugin-store/account')
      .expect(401);

    assert.strictEqual(response.body.code, 'AUTH_REQUIRED');
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
    assert(sessionResponse.headers['set-cookie'].some((value) => value.includes('ltth_store_session_')));

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

  it('replaces the Clerk JWT with an opaque profile-local session cookie', async () => {
    const sqlite = new Sqlite(':memory:');
    const storeSessionStore = new StoreSessionStore(sqlite);
    const { app, authFixture } = createTestApp(tempDir, {}, {
      profileId: 'streamer-a',
      storeSessionStore
    });

    const sessionResponse = await request(app)
      .post('/api/plugin-store/session')
      .set('Authorization', `Bearer ${authFixture.token}`)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(200);

    const setCookie = sessionResponse.headers['set-cookie'].find((value) => value.includes('ltth_store_session_'));
    const cookie = setCookie.split(';', 1)[0];
    assert(!setCookie.includes(authFixture.token));

    const listing = await request(app)
      .get('/api/plugin-store')
      .set('Cookie', cookie)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(200);

    assert.strictEqual(listing.body.success, true);
    sqlite.close();
  });

  it('rotates and revokes the previous profile session after a fresh Clerk confirmation', async () => {
    const sqlite = new Sqlite(':memory:');
    const storeSessionStore = new StoreSessionStore(sqlite);
    const previous = storeSessionStore.issue({
      userId: 'user_123',
      sessionId: 'sess_previous',
      license: { active: true, status: 'active', plan: 'beta-free' },
      access: {}
    });
    const { app, authFixture } = createTestApp(tempDir, {}, {
      profileId: 'streamer-a',
      storeSessionStore
    });
    const previousCookie = `${buildStoreSessionCookieName('streamer-a')}=${previous.token}`;

    const response = await request(app)
      .post('/api/plugin-store/session')
      .set('Authorization', `Bearer ${authFixture.token}`)
      .set('Cookie', previousCookie)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(200);

    const replacementCookie = response.headers['set-cookie']
      .find((value) => value.includes(`${buildStoreSessionCookieName('streamer-a')}=`))
      .split(';', 1)[0];
    assert.deepStrictEqual(storeSessionStore.read(previous.token), { status: 'missing' });
    assert.notStrictEqual(replacementCookie, previousCookie);
    sqlite.close();
  });

  it('clears a legacy JWT cookie when issuing a fresh profile-local session', async () => {
    const sqlite = new Sqlite(':memory:');
    const storeSessionStore = new StoreSessionStore(sqlite);
    const { app, authFixture } = createTestApp(tempDir, {}, {
      profileId: 'streamer-a',
      storeSessionStore
    });

    const response = await request(app)
      .post('/api/plugin-store/session')
      .set('Authorization', `Bearer ${authFixture.token}`)
      .set('Cookie', `ltth_store_session=${encodeURIComponent(authFixture.token)}`)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(200);

    assert(response.headers['set-cookie'].some((value) => value.startsWith('ltth_store_session=; Max-Age=0')));
    sqlite.close();
  });

  it('requires a weekly Clerk confirmation without deleting the local session', async () => {
    let now = new Date('2026-07-21T12:00:00.000Z');
    const sqlite = new Sqlite(':memory:');
    const storeSessionStore = new StoreSessionStore(sqlite, { now: () => now });
    const issued = storeSessionStore.issue({
      userId: 'user_123',
      sessionId: 'sess_123',
      license: { active: true, status: 'active', plan: 'beta-free' },
      access: { groups: [], closedBetaPlugins: [], features: [] }
    });
    const { app } = createTestApp(tempDir, {}, {
      profileId: 'streamer-a',
      storeSessionStore
    });
    const cookie = `${buildStoreSessionCookieName('streamer-a')}=${issued.token}`;

    now = new Date(now.getTime() + (7 * DAY_MS));
    const response = await request(app)
      .get('/api/plugin-store/account')
      .set('Cookie', cookie)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(401);

    assert.strictEqual(response.body.code, 'STORE_SESSION_REVALIDATION_REQUIRED');
    assert.strictEqual(sqlite.prepare('SELECT COUNT(*) AS count FROM store_sessions').get().count, 1);
    sqlite.close();
  });

  it('keeps profile-local sessions isolated even when both cookies are sent by the browser', async () => {
    const sqliteA = new Sqlite(':memory:');
    const sqliteB = new Sqlite(':memory:');
    const storeA = new StoreSessionStore(sqliteA);
    const storeB = new StoreSessionStore(sqliteB);
    const issuedA = storeA.issue({
      userId: 'user_a',
      license: { active: true, status: 'active', plan: 'beta-free' },
      access: {}
    });
    const issuedB = storeB.issue({
      userId: 'user_b',
      license: { active: true, status: 'active', plan: 'beta-free' },
      access: {}
    });
    const { app: appA } = createTestApp(tempDir, {}, {
      profileId: 'streamer-a',
      storeSessionStore: storeA
    });
    const { app: appB } = createTestApp(tempDir, {}, {
      profileId: 'streamer-b',
      storeSessionStore: storeB
    });
    const bothCookies = [
      `${buildStoreSessionCookieName('streamer-a')}=${issuedA.token}`,
      `${buildStoreSessionCookieName('streamer-b')}=${issuedB.token}`
    ].join('; ');

    const accountA = await request(appA)
      .get('/api/plugin-store/account')
      .set('Cookie', bothCookies)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(200);
    const accountB = await request(appB)
      .get('/api/plugin-store/account')
      .set('Cookie', bothCookies)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(200);

    assert.strictEqual(accountA.body.account.userId, 'user_a');
    assert.strictEqual(accountB.body.account.userId, 'user_b');
    sqliteA.close();
    sqliteB.close();
  });

  it('migrates a valid legacy Clerk cookie to the opaque profile-local session', async () => {
    const sqlite = new Sqlite(':memory:');
    const storeSessionStore = new StoreSessionStore(sqlite);
    const { app, authFixture } = createTestApp(tempDir, {}, {
      profileId: 'streamer-a',
      storeSessionStore
    });

    const response = await request(app)
      .get('/api/plugin-store/account')
      .set('Cookie', `ltth_store_session=${encodeURIComponent(authFixture.token)}`)
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(200);

    const setCookies = response.headers['set-cookie'];
    assert(setCookies.some((value) => value.includes(`${buildStoreSessionCookieName('streamer-a')}=`)));
    assert(setCookies.some((value) => value.startsWith('ltth_store_session=; Max-Age=0')));
    assert.strictEqual(sqlite.prepare('SELECT COUNT(*) AS count FROM store_sessions').get().count, 1);
    sqlite.close();
  });

  it('revokes only the active profile session on local sign-out', async () => {
    const sqlite = new Sqlite(':memory:');
    const storeSessionStore = new StoreSessionStore(sqlite);
    const first = storeSessionStore.issue({ userId: 'user_a', license: {}, access: {} });
    const second = storeSessionStore.issue({ userId: 'user_b', license: {}, access: {} });
    const { app } = createTestApp(tempDir, {}, {
      profileId: 'streamer-a',
      storeSessionStore
    });
    const firstCookie = `${buildStoreSessionCookieName('streamer-a')}=${first.token}`;

    await request(app)
      .delete('/api/plugin-store/session')
      .set('Cookie', firstCookie)
      .expect(200);

    assert.deepStrictEqual(storeSessionStore.read(first.token), { status: 'missing' });
    assert.strictEqual(storeSessionStore.read(second.token).status, 'active');
    sqlite.close();
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
