'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { JSDOM } = require('jsdom');
const GCCEPlugin = require('../plugins/gcce');
const HUDManager = require('../plugins/gcce/utils/HUDManager');
const { createPublicOverlayMiddleware, protectPublicSocket } = require('../modules/public-overlay-access');
const { isHttpAllowed } = require('../modules/public-overlay-registry');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');

const pluginDir = path.resolve(__dirname, '../plugins/gcce');
const publicHost = 'fixture-overlay.trycloudflare.com';

function createSocketPair() {
  const local = [];
  const publicPackets = [];
  const publicSocket = {
    handshake: { headers: { host: publicHost } },
    join: jest.fn(),
    use: jest.fn(),
    emit(eventName, ...args) { publicPackets.push({ eventName, args }); }
  };
  protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });
  const io = {
    emit(eventName, ...args) {
      local.push({ eventName, args });
      publicSocket.emit(eventName, ...args);
    }
  };
  return { local, publicPackets, io };
}

function createRouteFixture(rotator) {
  const routes = new Map();
  const api = {
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method.toUpperCase()} ${route}`, handler)),
    log: jest.fn(),
    getSocketIO: jest.fn()
  };
  const plugin = Object.assign(Object.create(GCCEPlugin.prototype), {
    api,
    pluginDir,
    socketBatcher: null,
    hudManager: {
      getGiftRotator: jest.fn(() => rotator),
      updateGiftRotator: jest.fn(async value => value)
    }
  });
  plugin.registerRoutes();
  const getHandler = routes.get('GET /api/gcce/hud/rotator');
  const postHandler = routes.get('POST /api/gcce/hud/rotator');
  const app = express();
  app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
  app.get('/api/gcce/hud/rotator', getHandler);
  app.post('/api/gcce/hud/rotator', postHandler);
  app.get('/api/gcce/hud/media/:filename', (_req, res) => res.type('image/png').send('fixture media'));
  return { app, plugin, routes };
}

function createOverlayFixture(fetchPayload) {
  const source = fs.readFileSync(path.join(pluginDir, 'overlay-hud.html'), 'utf8');
  const inlineScript = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .find(([, attributes, contents]) => !/\bsrc\s*=/.test(attributes) && contents.includes("socket.on('gcce:hud:show'"));
  if (!inlineScript) throw new Error('GCCE HUD inline renderer script was not found');
  const dom = new JSDOM(source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
    runScripts: 'outside-only',
    url: 'http://localhost/plugins/gcce/overlay-hud'
  });
  const { window } = dom;
  const handlers = new Map();
  const timers = new Map();
  let nextTimerId = 1;
  window.io = jest.fn(() => ({
    on: jest.fn((eventName, handler) => handlers.set(eventName, handler))
  }));
  window.console.log = jest.fn();
  window.fetch = jest.fn(async () => ({ json: async () => fetchPayload }));
  window.setTimeout = jest.fn((callback, delay) => {
    const id = nextTimerId++;
    timers.set(id, { callback, delay });
    return id;
  });
  window.clearTimeout = jest.fn(id => timers.delete(id));
  window.setInterval = jest.fn(() => nextTimerId++);
  window.clearInterval = jest.fn();
  window.eval(inlineScript[2]);
  return {
    dom,
    window,
    handlers,
    timers,
    fire(eventName, ...args) { return handlers.get(eventName)?.(...args); },
    close() { dom.window.close(); }
  };
}

function makeHudManager(io) {
  return new HUDManager({
    getSocketIO: () => io,
    setConfig: jest.fn(async () => {})
  }, null, null, null, null, null);
}

describe('GCCE public HUD typed projections', () => {
  test('projects actual show/remove/clear producers for the original renderer, with local payloads intact', async () => {
    const sockets = createSocketPair();
    const manager = makeHudManager(sockets.io);
    const textId = manager.createTextElement('Fixture announcement', 10, {
      username: 'fixture-viewer', userId: 'private-user-id'
    });
    const localAssetId = manager.createImageElement('/uploads/animations/fixture.png', 10, {
      username: 'fixture-viewer', userId: 'private-user-id'
    });
    const remoteImageId = manager.createImageElement('https://tracker.invalid/pixel.png', 10, {
      username: 'fixture-viewer', userId: 'private-user-id'
    });
    const privateUploadId = manager.createMediaElement('/api/gcce/hud/media/fixture.mp4', 10, 'video', {
      username: 'fixture-viewer', userId: 'private-user-id'
    }, 'private label');

    expect(sockets.local.slice(0, 2)).toEqual([
      { eventName: 'gcce:hud:show', args: [expect.objectContaining({ id: textId, type: 'text', username: 'fixture-viewer', userId: 'private-user-id' })] },
      { eventName: 'gcce:hud:show', args: [expect.objectContaining({ id: localAssetId, type: 'image', content: '/uploads/animations/fixture.png' })] }
    ]);
    expect(sockets.publicPackets.map(packet => packet.eventName)).toEqual(['gcce:hud:show', 'gcce:hud:show']);
    expect(sockets.publicPackets[0].args[0]).toEqual({
      id: textId, type: 'text', content: 'Fixture announcement', duration: 10000,
      style: {
        position: 'top-center', fontSize: 48, fontFamily: 'Arial, sans-serif', textColor: '#FFFFFF',
        backgroundColor: 'rgba(0, 0, 0, 0.7)', maxWidth: 800
      }
    });
    expect(sockets.publicPackets[1].args[0]).toEqual({
      id: localAssetId, type: 'image', content: '/uploads/animations/fixture.png', duration: 10000,
      style: { position: 'top-center', maxWidth: 400, maxHeight: 400 }
    });
    expect(JSON.stringify(sockets.publicPackets)).not.toMatch(/private-user-id|fixture-viewer|tracker\.invalid|api\/gcce\/hud\/media|private label|timestamp|expiresAt/);

    const overlay = createOverlayFixture({ success: true, rotator: { enabled: false, intervalSeconds: 10, entries: [] } });
    overlay.fire('gcce:hud:show', sockets.publicPackets[0].args[0]);
    overlay.fire('gcce:hud:show', sockets.publicPackets[1].args[0]);
    expect(overlay.window.document.querySelector('.hud-text').textContent).toBe('Fixture announcement');
    expect(overlay.window.document.querySelector('.hud-image img').getAttribute('src')).toBe('/uploads/animations/fixture.png');

    manager.removeElement(textId);
    const removeLocal = sockets.local.find(packet => packet.eventName === 'gcce:hud:remove');
    const removePublic = sockets.publicPackets.find(packet => packet.eventName === 'gcce:hud:remove');
    expect(removeLocal.args).toEqual([{ id: textId }]);
    expect(removePublic.args).toEqual([{ id: textId }]);
    overlay.fire('gcce:hud:remove', ...removePublic.args);
    const textElement = overlay.window.document.getElementById(`hud-${textId}`);
    expect(textElement.classList.contains('fade-out')).toBe(true);
    const cleanup = [...overlay.timers.values()].find(timer => timer.delay === 400);
    cleanup.callback();
    expect(overlay.window.document.getElementById(`hud-${textId}`)).toBeNull();

    manager.clearAllElements();
    const clearLocal = sockets.local.find(packet => packet.eventName === 'gcce:hud:clear');
    const clearPublic = sockets.publicPackets.find(packet => packet.eventName === 'gcce:hud:clear');
    expect(clearLocal.args).toEqual([]);
    expect(clearPublic.args).toEqual([]);
    expect(projectPublicOverlayPayload('gcce:hud:clear', undefined)).toBeUndefined();
    overlay.fire('gcce:hud:clear');
    expect(overlay.window.document.querySelectorAll('.hud-element.fade-out').length).toBeGreaterThan(0);
    overlay.close();
    expect(manager.activeElements.size).toBe(0);
    expect(manager.elementIdCounter).toBeGreaterThan(0);
  });

  test('projects the actual rotator GET and update route, and preserves local configuration', async () => {
    const sockets = createSocketPair();
    const manager = makeHudManager(sockets.io);
    const config = manager.normalizeGiftRotator({
      enabled: true,
      intervalSeconds: 12,
      internalConfigId: 'private-config-id',
      entries: [
        {
          type: 'media', id: 'private-entry-id', mediaUrl: '/api/gcce/hud/media/fixture.gif', mediaKind: 'image',
          mimetype: 'image/gif', poster: 'file:///secret/poster.png', title: 'Fixture media', info: 'Fixture info',
          template: 'modern', animation: 'zoom', fontFamily: 'Inter, sans-serif', textColor: '#ffffff',
          accentColor: '#ff5f9e', backgroundColor: 'rgba(0, 0, 0, 0.65)'
        },
        {
          giftId: 'private-gift-id', giftName: 'Fixture Rose', giftImage: 'https://cdn.invalid/rose.png',
          title: 'Gift fixture', info: 'Public fallback remains', template: 'banner', animation: 'fade'
        },
        {
          type: 'media', mediaUrl: '/uploads/animations/fixture.mp4', mediaKind: 'video',
          title: 'Registered fixture asset', template: 'card', animation: 'fade'
        }
      ]
    });
    const routes = createRouteFixture(config);
    routes.plugin.hudManager = manager;
    manager.config.giftRotator = config;

    const publicResponse = await request(routes.app).get('/api/gcce/hud/rotator').set('Host', publicHost);
    const localResponse = await request(routes.app).get('/api/gcce/hud/rotator').set('Host', '127.0.0.1:3000');
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body).toEqual({
      success: true,
      rotator: {
        enabled: true,
        intervalSeconds: 12,
        entries: [
          {
            type: 'media', template: 'modern', animation: 'zoom', fontFamily: 'Inter, sans-serif',
            textColor: '#ffffff', accentColor: '#ff5f9e', backgroundColor: 'rgba(0, 0, 0, 0.65)',
            title: 'Fixture media', info: 'Fixture info', mediaKind: 'image', mediaUrl: ''
          },
          {
            type: 'gift', template: 'banner', animation: 'fade', fontFamily: 'Inter, sans-serif',
            textColor: '#ffffff', accentColor: '#ff5f9e', backgroundColor: 'rgba(0, 0, 0, 0.65)',
            giftName: 'Fixture Rose', title: 'Gift fixture', info: 'Public fallback remains', giftImage: ''
          },
          {
            type: 'media', template: 'card', animation: 'fade', fontFamily: 'Inter, sans-serif',
            textColor: '#ffffff', accentColor: '#ff5f9e', backgroundColor: 'rgba(0, 0, 0, 0.65)',
            title: 'Registered fixture asset', info: '', mediaKind: 'video', mediaUrl: '/uploads/animations/fixture.mp4'
          }
        ]
      }
    });
    expect(localResponse.body).toEqual({ success: true, rotator: config });
    expect(JSON.stringify(publicResponse.body)).not.toMatch(/private-config-id|private-entry-id|private-gift-id|cdn\.invalid|api\/gcce\/hud\/media|file:/);

    const updateHandler = routes.routes.get('POST /api/gcce/hud/rotator');
    routes.plugin.api.getSocketIO.mockReturnValue(sockets.io);
    const routeResponse = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await updateHandler({ body: { rotator: config } }, routeResponse);
    expect(routeResponse.body).toEqual({ success: true, rotator: config });
    expect(sockets.local).toEqual([{ eventName: 'gcce:hud:rotator:update', args: [config] }]);
    expect(sockets.publicPackets).toEqual([{ eventName: 'gcce:hud:rotator:update', args: [publicResponse.body.rotator] }]);

    const publicOverlay = createOverlayFixture(publicResponse.body);
    const localOverlay = createOverlayFixture(localResponse.body);
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    const publicRotator = publicOverlay.window.document.getElementById('gift-rotator-container');
    const localRotator = localOverlay.window.document.getElementById('gift-rotator-container');
    expect(publicRotator.querySelector('.rotator-copy').textContent).toContain('Fixture media');
    expect(publicRotator.querySelector('.rotator-gift-thumb').textContent).toContain('📁');
    expect(localRotator.querySelector('.rotator-gift-thumb img').getAttribute('src')).toBe('/api/gcce/hud/media/fixture.gif');
    publicOverlay.close();
    localOverlay.close();
  });

  test('neutralizes unsafe media URLs and rejects malformed event, route, and cleanup payloads', async () => {
    const unsafeUrls = [
      'https://tracker.invalid/image.png',
      '//tracker.invalid/image.png',
      'data:image/png;base64,AAAA',
      'file:///secret/image.png',
      'https://user:password@tracker.invalid/image.png',
      '/api/gcce/hud/media/fixture.png',
      '/uploads/animations/%2e%2e/secret.png',
      '/uploads/animations/fixture.png?token=secret'
    ];
    for (const mediaUrl of unsafeUrls) {
      expect(projectPublicOverlayPayload('gcce:hud:rotator:update', {
        enabled: true, intervalSeconds: 10,
        entries: [{ type: 'media', mediaKind: 'image', mediaUrl, title: 'Fixture' }]
      }).entries[0].mediaUrl).toBe('');
      expect(projectPublicOverlayPayload('gcce:hud:show', {
        id: 'image-1', type: 'image', content: mediaUrl, duration: 5000, style: { position: 'top-center' }
      })).toBeNull();
    }
    expect(isHttpAllowed({ method: 'GET', pathname: '/uploads/animations/fixture.png' })).toBe(true);
    expect(isHttpAllowed({ method: 'GET', pathname: '/api/gcce/hud/media/fixture.png' })).toBe(false);
    expect(projectPublicOverlayPayload('gcce:hud:show', {
      id: 'text-1', type: 'text', content: 'safe', duration: 5000, username: 'private', userId: 'private-id',
      timestamp: Date.now(), expiresAt: Date.now() + 5000, style: { position: 'top-center', privateStyle: 'drop' }
    })).toEqual({ id: 'text-1', type: 'text', content: 'safe', duration: 5000, style: { position: 'top-center', fontFamily: 'Arial, sans-serif', textColor: '#FFFFFF', backgroundColor: 'rgba(0, 0, 0, 0.7)' } });
    expect(projectPublicOverlayPayload('gcce:hud:remove', { id: 'text-1', username: 'private' })).toEqual({ id: 'text-1' });
    expect(projectPublicOverlayPayload('gcce:hud:remove', { id: 'persisted-user-id' })).toBeNull();
    expect(projectPublicOverlayPayload('gcce:hud:clear', { internal: true })).toEqual({});
    expect(projectPublicOverlayPayload('gcce:hud:show', {
      id: 'text-1', type: 'text', content: 'x', duration: 5000, style: { position: 'unknown position' }
    })).toBeNull();
    expect(projectPublicOverlayPayload('gcce:hud:rotator:update', { enabled: true, intervalSeconds: 2, entries: [] })).toBeNull();

    const config = { success: true, rotator: { enabled: true, intervalSeconds: 10, entries: [] }, secret: 'private' };
    const routes = createRouteFixture(config.rotator);
    const malformed = createRouteFixture({ enabled: 'yes', intervalSeconds: 10, entries: [] });
    const badGet = await request(malformed.app).get('/api/gcce/hud/rotator').set('Host', publicHost);
    const publicWrite = await request(routes.app).post('/api/gcce/hud/rotator').set('Host', publicHost).send({ rotator: { enabled: false } });
    const publicUpload = await request(routes.app).get('/api/gcce/hud/media/fixture.png').set('Host', publicHost);
    const localUpload = await request(routes.app).get('/api/gcce/hud/media/fixture.png').set('Host', '127.0.0.1:3000');
    expect(badGet.status).toBe(500);
    expect(badGet.body).toEqual({ error: 'Response unavailable' });
    expect(publicWrite.status).toBe(404);
    expect(routes.plugin.hudManager.updateGiftRotator).not.toHaveBeenCalled();
    expect(publicUpload.status).toBe(404);
    expect(localUpload.status).toBe(200);
    expect(projectPublicOverlayPayload('gcce:hud:clear', null)).toBeNull();
  });
});
