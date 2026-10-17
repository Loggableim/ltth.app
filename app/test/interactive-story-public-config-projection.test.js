'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const InteractiveStoryPlugin = require('../plugins/interactive-story/main');
const { createPublicOverlayMiddleware } = require('../modules/public-overlay-access');
const { projectInteractiveStoryConfigResponse } = require('../modules/public-overlay-payload-projection');

const secretConfig = {
  llmProvider: 'openrouter',
  imageProvider: 'siliconflow',
  openaiModel: 'fixture-model',
  openRouterApiKey: '***configured***',
  openRouterBaseUrl: 'https://provider.invalid/v1',
  openRouterModel: 'private-model',
  ollamaApiKey: '***configured***',
  ttsEngine: 'fishaudio',
  fishaudioModel: 'private-tts-model',
  votingDuration: 60,
  minVotes: 5,
  debugLogging: true,
  apiLogging: true,
  llmTimeout: 120000,
  llmMaxRetries: 3,
  llmRetryDelay: 2000,
  storyLanguage: 'German',
  overlayOrientation: 'portrait',
  overlayResolution: '1080x1920',
  overlayDisplayMode: 'sentence',
  overlayFontFamily: 'Georgia, serif',
  overlayFontSize: 1.4,
  overlayTitleFontSize: 3,
  overlayTextColor: '#ffffff',
  overlayTitleColor: '#e94560',
  overlayBackgroundGradient: 'rgba(0,0,0,0)',
  generatingAnimationMode: 'custom',
  generatingAnimationUrl: 'https://tracking.invalid/animation.mp4',
  apiKey: 'fixture-secret'
};

function createProducer() {
  const routes = new Map();
  const api = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({
      prepare: () => ({ get: () => undefined }),
      getSetting: () => null
    }),
    getPluginDataDir: () => 'unused-fixture-path',
    ensurePluginDataDir: jest.fn(),
    log: jest.fn(),
    getConfig: jest.fn(() => secretConfig),
    setConfig: jest.fn(),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn()
  };
  const plugin = new InteractiveStoryPlugin(api);
  plugin._registerRoutes();
  return { api, plugin, routes };
}

describe('Interactive Story public config projection', () => {
  test('projects the real config route to overlay-read fields and preserves localhost response', async () => {
    const { routes } = createProducer();
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/api/interactive-story/config', (req, res) => routes.get('get:/api/interactive-story/config')(req, res));

    const publicResponse = await request(app).get('/api/interactive-story/config').set('Host', 'fixture.trycloudflare.com');
    const localResponse = await request(app).get('/api/interactive-story/config').set('Host', '127.0.0.1:3000');
    const expectedPublicConfig = {
      overlayOrientation: 'portrait',
      overlayResolution: '1080x1920',
      overlayDisplayMode: 'sentence',
      overlayFontFamily: 'Georgia, serif',
      overlayFontSize: 1.4,
      overlayTitleFontSize: 3,
      overlayTextColor: '#ffffff',
      overlayTitleColor: '#e94560',
      overlayBackgroundGradient: 'rgba(0,0,0,0)',
      generatingAnimationMode: 'default'
    };

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body).toEqual(expectedPublicConfig);
    expect(JSON.stringify(publicResponse.body)).not.toMatch(/provider|model|key|debug|voting|German|tracking\.invalid/i);
    expect(localResponse.status).toBe(200);
    expect(localResponse.body).toMatchObject(secretConfig);
    expect(localResponse.body).toHaveProperty('apiKeyConfigured', false);

    const overlaySource = fs.readFileSync(path.join(__dirname, '../plugins/interactive-story/overlay.html'), 'utf8');
    const readFields = [
      'overlayOrientation', 'overlayResolution', 'overlayDisplayMode', 'overlayFontFamily',
      'overlayFontSize', 'overlayTitleFontSize', 'overlayTextColor', 'overlayTitleColor',
      'overlayBackgroundGradient', 'generatingAnimationMode', 'generatingAnimationUrl'
    ];
    for (const field of readFields) expect(overlaySource).toContain(`cfg.${field}`);
    expect(projectInteractiveStoryConfigResponse(localResponse.body)).toEqual(expectedPublicConfig);
  });

  test('fails closed on malformed visual config and does not pass through private settings', () => {
    expect(projectInteractiveStoryConfigResponse({ ...secretConfig, overlayResolution: 'javascript:alert(1)' })).toBeNull();
    expect(projectInteractiveStoryConfigResponse({ ...secretConfig, overlayFontFamily: 'url(https://private.invalid)' })).toBeNull();
    expect(projectInteractiveStoryConfigResponse({ ...secretConfig, overlayBackgroundGradient: 'url(https://private.invalid)' })).toBeNull();
    expect(projectInteractiveStoryConfigResponse({ ...secretConfig, overlayFontSize: 20 })).toBeNull();
  });
});
