'use strict';

const express = require('express');
const request = require('supertest');
const VisualFxFrameWebGPUPlugin = require('../plugins/visual-fx-frame-webgpu/main');
const { VISUAL_FX_DEFAULT_CONFIG } = require('../plugins/visual-fx-frame-webgpu/default-config');
const Engine = require('../plugins/visual-fx-frame-webgpu/renderer/webgpu-effects-engine');
const { createPublicOverlayMiddleware, protectPublicSocket } = require('../modules/public-overlay-access');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');
const { PUBLIC_QUICK_TUNNEL_ROOM } = require('../modules/public-overlay-socket-adapter');

function fullRuntimeConfig() {
  return {
    ...JSON.parse(JSON.stringify(VISUAL_FX_DEFAULT_CONFIG)),
    triggersEnabled: true,
    triggerRules: [{ id: 'fixture-rule-id', event: 'gift', condition: 'amount > 0', action: 'flash', privateNote: 'internal' }],
    chatColorCommands: true,
    triggerCooldown: 2345,
    triggerMaxStack: 9,
    triggerPreset: 'custom',
    apiKey: 'fixture-secret'
  };
}

function createProducer() {
  const routes = new Map();
  const api = {
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(() => true),
    emit: jest.fn(),
    log: jest.fn(),
    getDatabase: jest.fn(() => null),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method.toUpperCase()} ${route}`, handler)),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    registerFlowAction: jest.fn()
  };
  const plugin = new VisualFxFrameWebGPUPlugin(api);
  plugin.loadConfig();
  plugin.config = fullRuntimeConfig();
  plugin.registerRoutes();
  return { api, plugin, routes };
}

function fakeSocket(host) {
  const originalEmit = jest.fn(() => true);
  const socket = {
    handshake: { headers: { host } },
    data: {},
    join: jest.fn(),
    use: jest.fn(),
    emit: originalEmit,
    originalEmit
  };
  return socket;
}

describe('Visual FX Frame WebGPU public config projection', () => {
  test('projects the real renderer config and excludes producer trigger state', async () => {
    const { api, plugin, routes } = createProducer();
    const original = fullRuntimeConfig();
    plugin.config = original;
    const localResponse = { json: jest.fn() };
    routes.get('GET /api/visual-fx-frame-webgpu/config')({}, localResponse);
    expect(localResponse.json).toHaveBeenCalledWith({ success: true, config: original });

    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/api/visual-fx-frame-webgpu/config', (req, res) => routes.get('GET /api/visual-fx-frame-webgpu/config')(req, res));
    const publicResponse = await request(app).get('/api/visual-fx-frame-webgpu/config').set('Host', 'fixture.trycloudflare.com');
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.config).toEqual(expect.objectContaining({
      effectType: original.effectType,
      resolutionPreset: original.resolutionPreset,
      framePositions: original.framePositions,
      designControls: original.designControls
    }));
    for (const key of ['triggerRules', 'triggersEnabled', 'triggerCooldown', 'triggerMaxStack', 'chatColorCommands', 'triggerPreset', 'apiKey', 'visualProfileVersion', 'renderer']) {
      expect(publicResponse.body.config).not.toHaveProperty(key);
    }
    expect(api.emit).not.toHaveBeenCalled();
  });

  test('fails closed on malformed renderer config and keeps local response intact', async () => {
    const { plugin, routes } = createProducer();
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/api/visual-fx-frame-webgpu/config', (req, res) => routes.get('GET /api/visual-fx-frame-webgpu/config')(req, res));
    const good = fullRuntimeConfig();
    plugin.config = { ...good, flameIntensity: 99 };
    const denied = await request(app).get('/api/visual-fx-frame-webgpu/config').set('Host', 'fixture.trycloudflare.com');
    expect(denied.status).toBe(500);
    expect(denied.body).toEqual({ error: 'Response unavailable' });

    const local = await request(app).get('/api/visual-fx-frame-webgpu/config').set('Host', '127.0.0.1:3000');
    expect(local.status).toBe(200);
    expect(local.body.config.flameIntensity).toBe(99);
    expect(local.body.config.triggerRules).toEqual(good.triggerRules);
  });

  test('projects public socket config-update but preserves full local event and consumer compatibility', () => {
    const config = fullRuntimeConfig();
    const payload = { config };
    const localSocket = protectPublicSocket({ socket: fakeSocket('127.0.0.1:3000') });
    const publicSocket = protectPublicSocket({ socket: fakeSocket('fixture.trycloudflare.com'), logger: { warn: jest.fn() } });

    localSocket.emit('visual-fx-frame-webgpu:config-update', payload);
    publicSocket.emit('visual-fx-frame-webgpu:config-update', payload);
    expect(localSocket.emit.mock.calls[0][1]).toBe(payload);
    expect(publicSocket.join).toHaveBeenCalledWith(PUBLIC_QUICK_TUNNEL_ROOM);
    expect(publicSocket.originalEmit.mock.calls[0][1].config).not.toHaveProperty('triggerRules');
    const projected = projectPublicOverlayPayload('visual-fx-frame-webgpu:config-update', payload).config;
    const engine = new Engine(null, { config: projected });
    expect(engine.config).toMatchObject({
      effectType: config.effectType,
      frameStyle: config.frameStyle,
      framePositions: config.framePositions,
      designControls: config.designControls
    });
    expect(engine.config).not.toHaveProperty('triggerRules');
  });

  test('keeps the original producer config-update emission complete for local consumers', () => {
    const { api, plugin, routes } = createProducer();
    plugin.config = fullRuntimeConfig();
    const response = { status: jest.fn(() => response), json: jest.fn() };
    routes.get('POST /api/visual-fx-frame-webgpu/config')({ body: { flameIntensity: 2 } }, response);
    expect(api.setConfig).toHaveBeenCalledWith('settings', expect.objectContaining({
      flameIntensity: 2,
      triggerRules: plugin.config.triggerRules,
      triggerCooldown: plugin.config.triggerCooldown
    }));
    expect(api.emit).toHaveBeenCalledWith('visual-fx-frame-webgpu:config-update', { config: plugin.config });
    const emittedPayload = api.emit.mock.calls[0][1];
    expect(emittedPayload.config).toHaveProperty('triggerRules');
    expect(projectPublicOverlayPayload('visual-fx-frame-webgpu:config-update', emittedPayload).config)
      .not.toHaveProperty('triggerRules');
  });

  test('rejects malformed config-update events instead of leaking their source payload', () => {
    const socket = protectPublicSocket({ socket: fakeSocket('fixture.trycloudflare.com'), logger: { warn: jest.fn() } });
    expect(socket.emit('visual-fx-frame-webgpu:config-update', { config: { ...fullRuntimeConfig(), frameThickness: -1 } })).toBe(false);
    expect(socket.originalEmit).not.toHaveBeenCalled();
  });

  test('projects only renderer-consumed trigger values for public sockets and preserves local triggers', () => {
    const payload = {
      type: 'intensity-boost',
      amount: 0.7,
      duration: 2400,
      source: 'rule:private-rule-id',
      id: 'producer-trigger-id',
      cooldownKey: 'private-cooldown-key',
      apiKey: 'fixture-secret',
      internal: { eventUserId: 'private-user-id' }
    };
    const localSocket = protectPublicSocket({ socket: fakeSocket('127.0.0.1:3000') });
    const publicSocket = protectPublicSocket({ socket: fakeSocket('fixture.trycloudflare.com'), logger: { warn: jest.fn() } });

    localSocket.emit('visual-fx-frame-webgpu:trigger', payload);
    publicSocket.emit('visual-fx-frame-webgpu:trigger', payload);

    expect(localSocket.originalEmit).toHaveBeenCalledWith('visual-fx-frame-webgpu:trigger', payload);
    expect(publicSocket.originalEmit).toHaveBeenCalledWith('visual-fx-frame-webgpu:trigger', {
      type: 'intensity-boost', amount: 0.7, duration: 2400
    });
    const projected = projectPublicOverlayPayload('visual-fx-frame-webgpu:trigger', payload);
    const engine = new Engine(null, { config: fullRuntimeConfig() });
    expect(engine.handleTrigger(projected)).toBe(true);
    expect(engine.activeTriggers[0]).toMatchObject({ type: 'intensity-boost', amount: 0.7, duration: 2400 });
    expect(engine.activeTriggers[0]).not.toHaveProperty('source');
    expect(engine.activeTriggers[0]).not.toHaveProperty('id', 'producer-trigger-id');
    expect(engine.activeTriggers[0]).not.toHaveProperty('internal');
  });

  test('rejects invalid or out-of-range public trigger contracts', () => {
    expect(projectPublicOverlayPayload('visual-fx-frame-webgpu:trigger', { type: 'unknown', duration: 500 })).toBeNull();
    expect(projectPublicOverlayPayload('visual-fx-frame-webgpu:trigger', { type: 'flash', effect: 'unknown' })).toBeNull();
    expect(projectPublicOverlayPayload('visual-fx-frame-webgpu:trigger', { type: 'flash', duration: 30001 })).toBeNull();
    expect(projectPublicOverlayPayload('visual-fx-frame-webgpu:trigger', { type: 'pulse', intensity: 5.1 })).toBeNull();
  });
});
