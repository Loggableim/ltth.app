const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const express = require('express');
const request = require('supertest');

const { setupPluginRoutes } = require('../routes/plugin-routes');

function createTestApp(pluginsDir) {
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

  setupPluginRoutes(app, pluginLoader, passThrough, passThrough, logger);
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

  it('requires opt-in before adding a community source', async () => {
    const { app } = createTestApp(tempDir);

    await request(app)
      .post('/api/plugin-store/sources')
      .send({
        id: 'creator',
        name: 'Creator Store',
        url: 'https://example.com/community.json'
      })
      .expect(400);

    const enabled = await request(app)
      .post('/api/plugin-store/community/enable')
      .expect(200);

    assert.strictEqual(enabled.body.communityEnabled, true);

    const added = await request(app)
      .post('/api/plugin-store/sources')
      .send({
        id: 'creator',
        name: 'Creator Store',
        url: 'https://example.com/community.json'
      })
      .expect(200);

    assert.strictEqual(added.body.sources.some((source) => source.id === 'creator'), true);
  });
});
