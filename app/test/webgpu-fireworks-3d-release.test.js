'use strict';

const fs = require('fs');
const path = require('path');

const FireworksPlugin = require('../plugins/webgpu-fireworks/main');
const { normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');

const root = path.join(__dirname, '..', '..');
const pluginRoot = path.join(root, 'app', 'plugins', 'webgpu-fireworks');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function createApi() {
  const routes = new Map();
  const socketHandlers = [];
  return {
    routes,
    socketHandlers,
    getPluginDataDir: () => path.join(__dirname, '.tmp-webgpu-fireworks-3d-release'),
    getConfig: jest.fn(() => null),
    emit: jest.fn(() => true),
    log: jest.fn(),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
    registerSocketConnection: jest.fn(handler => socketHandlers.push(handler))
  };
}

function createPlugin() {
  const api = createApi();
  const plugin = new FireworksPlugin(api);
  plugin.config = normalizeConfig({ enabled: true, audioEnabled: false });
  return { api, plugin };
}

describe('WebGPU Fireworks 3D release contract', () => {
  test('overlay advertises the versioned depth and Boykisser capabilities in registration and status', () => {
    const source = read('app/plugins/webgpu-fireworks/gpu/engine.js');

    expect(source).toContain('RENDERER_PROTOCOL_VERSION = 3');
    expect(source).toContain("'depth3d-v1'");
    expect(source).toContain("'boykisser-v1'");
    expect(source.match(/rendererProtocol:\s*RENDERER_PROTOCOL_VERSION/g)).toHaveLength(2);
    expect(source.match(/capabilities:\s*RENDERER_CAPABILITIES/g)).toHaveLength(2);
  });

  test('sanitizes capability telemetry and marks an old ready OBS overlay for refresh', () => {
    const { api, plugin } = createPlugin();
    plugin.registerSocketHandlers();
    const handlers = new Map();
    const socket = {
      id: 'renderer-old',
      emit: jest.fn(),
      on: jest.fn((event, handler) => handlers.set(event, handler))
    };
    api.socketHandlers[0](socket);
    handlers.get('webgpu-fireworks:register-overlay')({
      rendererProtocol: 2,
      capabilities: ['depth3d-v1', 'invalid capability', 'depth3d-v1']
    });
    handlers.get('webgpu-fireworks:renderer-status')({ state: 'ready' });

    expect(plugin.getRendererStatus()).toMatchObject({
      state: 'ready',
      rendererProtocol: 2,
      capabilities: ['depth3d-v1'],
      upgradeRequired: true,
      missingCapabilities: ['boykisser-v1']
    });
    expect(plugin.getRendererStatus().upgradeReason).toMatch(/refresh.*OBS browser source/i);
  });

  test('keeps a capable ready renderer healthy and preserves both capabilities', () => {
    const { plugin } = createPlugin();
    plugin.overlayTelemetry.set('renderer-current', {
      state: 'ready',
      rendererProtocol: 3,
      capabilities: ['boykisser-v1', 'depth3d-v1'],
      registered: true,
      benchmark: false,
      statusUpdatedAt: Date.now()
    });

    expect(plugin.getRendererStatus()).toMatchObject({
      upgradeRequired: false,
      rendererProtocol: 3,
      capabilities: ['boykisser-v1', 'depth3d-v1'],
      missingCapabilities: []
    });
  });

  test('falls back normal Furry finales to legacy bursts on an old fresh renderer', () => {
    const { api, plugin } = createPlugin();
    plugin.overlayTelemetry.set('renderer-old', {
      state: 'ready', rendererProtocol: 2, capabilities: [], registered: true, benchmark: false, statusUpdatedAt: Date.now()
    });

    const result = plugin.triggerFinale({
      style: 'furry-celebration', length: 'short', intensity: 3, seed: 135, eventId: 'live-furry'
    });

    expect(result).toMatchObject({
      accepted: true,
      style: 'furry-celebration',
      rendererFallback: 'legacy-outdated-overlay',
      showPlan: null,
      burstCount: 15
    });
    expect(result.bursts).toHaveLength(15);
    expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:finale', result);
  });

  test('rejects a Furry test request on an old renderer with an actionable typed error', () => {
    const { api, plugin } = createPlugin();
    plugin.overlayTelemetry.set('renderer-old', {
      state: 'ready', rendererProtocol: 2, capabilities: [], registered: true, benchmark: false, statusUpdatedAt: Date.now()
    });
    plugin.connectedSockets.add({ id: 'renderer-old', connected: true, emit: jest.fn() });

    const result = plugin.triggerFinale({
      style: 'furry-celebration', length: 'short', seed: 136, testRequest: true
    });

    expect(result).toMatchObject({
      accepted: false,
      reason: 'renderer-upgrade-required',
      code: 'RENDERER_UPGRADE_REQUIRED'
    });
    expect(result.error).toMatch(/refresh.*OBS browser source/i);
    expect(api.emit).not.toHaveBeenCalled();
  });

  test('ships aligned app/plugin versions, active cache busters and source attribution', () => {
    expect(JSON.parse(read('package.json')).version).toBe('1.4.0');
    expect(JSON.parse(read('app/package.json')).version).toBe('1.4.0');
    expect(JSON.parse(read('app/package-lock.json')).version).toBe('1.4.0');
    expect(JSON.parse(read('app/package-lock.json')).packages[''].version).toBe('1.4.0');
    expect(JSON.parse(read('version.json'))).toMatchObject({ version: '1.4.0', downloadVersion: '1.4.0' });
    expect(JSON.parse(read('app/plugins/webgpu-fireworks/plugin.json')).version).toBe('3.1.1');

    for (const relative of [
      'app/plugins/webgpu-fireworks/overlay.html',
      'app/plugins/webgpu-fireworks/ui/settings.html',
      'app/plugins/webgpu-fireworks/ui/designer.html'
    ]) {
      const html = read(relative);
      expect(html).not.toContain('v=3.0.0');
      expect(html).toContain('v=3.1.1');
    }

    const readme = read('app/plugins/webgpu-fireworks/README.md');
    expect(readme).toMatch(/Boykisser|Silly Cat/);
    expect(readme).toContain('Mauzymice');
    expect(readme).toContain('https://siivagunner.fandom.com/wiki/Boykisser');
  });

  test.each(['de', 'en', 'es', 'fr'])('%s includes upgrade guidance and updated Furry copy', locale => {
    const parsed = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8'));
    const plugin = parsed.plugins['webgpu-fireworks'];
    expect(plugin.ui.renderer_upgrade_required).toEqual(expect.any(String));
    expect(plugin.ui.renderer_upgrade_required.length).toBeGreaterThan(20);
    expect(plugin.shows['furry-celebration'].description).toMatch(/Boykisser|Silly Cat/i);
  });
});
