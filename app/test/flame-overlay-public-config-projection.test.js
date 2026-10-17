'use strict';

const express = require('express');
const request = require('supertest');
const { VISUAL_FX_DEFAULT_CONFIG } = require('../plugins/flame-overlay/default-config');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');
const { createPublicOverlayMiddleware, protectPublicSocket } = require('../modules/public-overlay-access');

function fullRuntimeConfig() {
  return {
    ...VISUAL_FX_DEFAULT_CONFIG,
    triggersEnabled: true,
    triggerRules: [{ id: 'local-rule-id', event: 'gift', condition: 'coins >= 1', action: 'flash', enabled: true }],
    triggerCooldown: 2000,
    triggerMaxStack: 5,
    triggerPreset: 'default',
    chatColorCommands: true,
    apiKey: 'fixture-api-key',
    unknownInternalField: { private: true }
  };
}

function createSocket(host) {
  return {
    handshake: { headers: { host } },
    join: jest.fn(),
    use: jest.fn(),
    emit: jest.fn(() => true)
  };
}

describe('FlameOverlay public config projection', () => {
  test('matches every visual renderer default field while excluding engine rules and private settings', () => {
    const source = fullRuntimeConfig();
    const projected = projectPublicOverlayPayload('flame-overlay:config-update', { config: source });

    expect(projected).toEqual({ config: VISUAL_FX_DEFAULT_CONFIG });
    expect(Object.keys(projected.config).sort()).toEqual(Object.keys(VISUAL_FX_DEFAULT_CONFIG).sort());
    expect(JSON.stringify(projected)).not.toMatch(/local-rule-id|fixture-api-key|triggerCooldown|triggerMaxStack|triggerPreset|triggersEnabled|chatColorCommands|unknownInternalField/);
    expect(source).toHaveProperty('triggerRules.0.id', 'local-rule-id');
  });

  test('projects public HTTP config but preserves the local administrator response', async () => {
    const source = fullRuntimeConfig();
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/api/flame-overlay/config', (_req, res) => res.json({ success: true, config: source }));

    const publicResponse = await request(app).get('/api/flame-overlay/config').set('Host', 'quiet-river.trycloudflare.com');
    const localResponse = await request(app).get('/api/flame-overlay/config').set('Host', '127.0.0.1:3000');

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body).toEqual({ success: true, config: VISUAL_FX_DEFAULT_CONFIG });
    expect(localResponse.status).toBe(200);
    expect(localResponse.body).toEqual({ success: true, config: source });
  });

  test('projects public socket updates without changing local updates and rejects malformed public config', () => {
    const source = fullRuntimeConfig();
    const publicSocket = createSocket('quiet-river.trycloudflare.com');
    const localSocket = createSocket('127.0.0.1:3000');
    const publicOriginalEmit = publicSocket.emit;
    const localOriginalEmit = localSocket.emit;
    protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });
    protectPublicSocket({ socket: localSocket, logger: { warn: jest.fn() } });

    expect(publicSocket.emit('flame-overlay:config-update', { config: source })).toBe(true);
    expect(publicOriginalEmit.mock.calls[0]).toEqual(['flame-overlay:config-update', { config: VISUAL_FX_DEFAULT_CONFIG }]);
    expect(localSocket.emit('flame-overlay:config-update', { config: source })).toBe(true);
    expect(localOriginalEmit.mock.calls[0]).toEqual(['flame-overlay:config-update', { config: source }]);

    const invalidSocket = createSocket('quiet-river.trycloudflare.com');
    const invalidOriginalEmit = invalidSocket.emit;
    protectPublicSocket({ socket: invalidSocket, logger: { warn: jest.fn() } });
    expect(invalidSocket.emit('flame-overlay:config-update', { config: { ...VISUAL_FX_DEFAULT_CONFIG, smokeSpeed: 99 } })).toBe(false);
    expect(invalidOriginalEmit).not.toHaveBeenCalled();
  });

  test('withholds malformed public HTTP config and leaves the local response intact', async () => {
    const source = { ...VISUAL_FX_DEFAULT_CONFIG, smokeSpeed: 99, apiKey: 'fixture-api-key' };
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/api/flame-overlay/config', (_req, res) => res.json({ success: true, config: source }));

    const publicResponse = await request(app).get('/api/flame-overlay/config').set('Host', 'quiet-river.trycloudflare.com');
    const localResponse = await request(app).get('/api/flame-overlay/config').set('Host', '127.0.0.1:3000');

    expect(publicResponse.status).toBe(500);
    expect(publicResponse.body).toEqual({ error: 'Response unavailable' });
    expect(JSON.stringify(publicResponse.body)).not.toContain('fixture-api-key');
    expect(localResponse.body.config).toEqual(source);
  });

  test('pins trigger and clear event producer contracts without exposing local status data', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../plugins/flame-overlay/main.js'), 'utf8');
    expect(source).toContain('const triggerWithId = { ...trigger, id: triggerId, duration };');
    expect(source).toContain("this.api.emit('flame-overlay:trigger', triggerWithId);");
    expect(source).toContain("this.api.emit('flame-overlay:clear-triggers', {});");
    expect(projectPublicOverlayPayload('flame-overlay:trigger', {
      id: 'backend-trigger-id', type: 'flash', duration: 1000, source: 'rule:internal-id'
    })).toMatchObject({ id: expect.stringMatching(/^[0-9a-f-]{36}$/i), type: 'flash', duration: 1000 });
    expect(projectPublicOverlayPayload('flame-overlay:trigger', {
      id: 'backend-trigger-id', type: 'flash', duration: 1000, source: 'rule:internal-id'
    })).not.toHaveProperty('source');
    expect(projectPublicOverlayPayload('flame-overlay:clear-triggers', {})).toBeUndefined();
  });
});
