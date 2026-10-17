'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ClarityHUDBackend = require('../backend/api');
const schema = require('../lib/settings-schema');
const {
  projectClaritySettingsResponse,
  projectClarityStateResponse,
  projectPublicOverlayPayload
} = require('../../../modules/public-overlay-payload-projection');

const UI_SOURCE = path.join(__dirname, '..', 'ui', 'main.js');
const FULL_OVERLAY_SOURCE = path.join(__dirname, '..', 'overlays', 'full.js');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

function createBackend(config = {}) {
  const routes = new Map();
  const api = {
    getConfig: jest.fn(async key => config[key] ?? null),
    setConfig: jest.fn(async (key, value) => { config[key] = value; }),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method.toLowerCase()} ${route}`, handler)),
    emit: jest.fn(),
    log: jest.fn(),
    getSocketIO: jest.fn(() => ({})),
    getDatabase: jest.fn(() => ({
      getSetting: jest.fn(() => null),
      getGift: jest.fn(() => null),
      getGiftCatalog: jest.fn(() => [])
    }))
  };
  const backend = new ClarityHUDBackend(api);
  backend.registerRoutes();
  return { backend, api, routes, config };
}

async function callRoute(routes, routeKey, req = {}) {
  const handler = routes.get(routeKey);
  expect(handler).toBeDefined();
  const res = response();
  await handler({ params: {}, body: {}, ...req }, res);
  return res;
}

describe('ClarityHUD local SuperFan setting contract', () => {
  test('Full UI setting is accepted, persisted, reloaded, and controls the server-side event filter', async () => {
    expect(schema.getDefaults('full').showSuperFans).toBe(true);
    expect(schema.validateSettings('full', { showSuperFans: false })).toMatchObject({ valid: true, sanitized: { showSuperFans: false } });
    expect(fs.readFileSync(UI_SOURCE, 'utf8')).toMatch(/showSuperFans:\s*getFieldValue\('showSuperFans',\s*'checkbox'\)/);

    const first = createBackend();
    const disabledSave = await callRoute(first.routes, 'post /api/clarityhud/settings/:dock', {
      params: { dock: 'full' },
      body: { showSuperFans: false }
    });
    expect(disabledSave.statusCode).toBe(200);
    expect(disabledSave.body.settings.showSuperFans).toBe(false);
    expect(first.config['clarityhud.settings.full'].showSuperFans).toBe(false);

    const afterReload = createBackend(first.config);
    await afterReload.backend.initialize();
    expect(afterReload.backend.settings.full.showSuperFans).toBe(false);
    await afterReload.backend.handleSuperFanDisplayEvent({ eventType: 'superfan', displayName: 'Disabled Fixture' });
    expect(afterReload.backend.eventQueues['superfan-display']).toHaveLength(0);
    expect(afterReload.api.emit).not.toHaveBeenCalledWith('clarityhud.update.superfan-display', expect.anything());

    const enabledSave = await callRoute(afterReload.routes, 'post /api/clarityhud/settings/:dock', {
      params: { dock: 'full' },
      body: { showSuperFans: true }
    });
    expect(enabledSave.statusCode).toBe(200);
    await afterReload.backend.handleSuperFanDisplayEvent({ eventType: 'superfan', displayName: 'Enabled Fixture' });
    expect(afterReload.backend.eventQueues['superfan-display']).toHaveLength(1);
    expect(afterReload.api.emit).toHaveBeenCalledWith('clarityhud.update.superfan-display', {
      eventType: 'superfan', displayName: 'Enabled Fixture'
    });
  });

  test('Full preference round-trips profiles while legacy Stream setting data is preserved', async () => {
    const oldStream = { ...schema.getDefaults('stream'), showSuperFans: false };
    const imported = createBackend();
    const importResult = await callRoute(imported.routes, 'post /api/clarityhud/profile/import', {
      body: { plugin: 'clarityhud', settings: { full: { showSuperFans: false }, stream: oldStream } }
    });

    expect(importResult.statusCode).toBe(200);
    expect(imported.backend.settings.full.showSuperFans).toBe(false);
    expect(imported.backend.settings.stream.showSuperFans).toBe(false);
    expect(imported.config['clarityhud.settings.full'].showSuperFans).toBe(false);

    const exported = await callRoute(imported.routes, 'get /api/clarityhud/profile/export');
    expect(exported.body.profile.settings.full.showSuperFans).toBe(false);
    expect(exported.body.profile.settings.stream.showSuperFans).toBe(false);

    const validation = schema.validateProfile(exported.body.profile);
    expect(validation.valid).toBe(true);
    expect(validation.settings.full.showSuperFans).toBe(false);
    expect(validation.settings.stream.showSuperFans).toBe(false);
  });

  test('public settings DTOs omit the preference and disabled Full state hides queued display events', () => {
    const full = { ...schema.getDefaults('full'), showSuperFans: false };
    const publicSettings = projectClaritySettingsResponse('full', {
      success: true, dock: 'full', settings: full
    });
    const publicSocketSettings = projectPublicOverlayPayload('clarityhud.settings.full', full);
    const publicState = projectClarityStateResponse('full', {
      success: true,
      dock: 'full',
      settings: full,
      events: {
        'superfan-display': [{
          type: 'superfan-display', timestamp: Date.now(),
          eventType: 'superfan', displayName: 'Hidden Fixture'
        }]
      }
    });

    expect(publicSettings.settings).not.toHaveProperty('showSuperFans');
    expect(publicSocketSettings).not.toHaveProperty('showSuperFans');
    expect(publicState.settings).not.toHaveProperty('showSuperFans');
    expect(publicState.events['superfan-display']).toEqual([]);
  });

  test('Full overlay honors the setting on both live events and profile/state hydration', () => {
    const dom = new JSDOM('<div id="overlay-container"><div class="feed-container"></div></div>', {
      runScripts: 'outside-only',
      url: 'http://127.0.0.1:3000/overlay/clarity/full',
      pretendToBeVisual: true
    });
    const { window } = dom;
    const handlers = new Map();
    const socket = {
      connected: false,
      on(event, handler) {
        const list = handlers.get(event) || [];
        list.push(handler);
        handlers.set(event, list);
      },
      off() {},
      disconnect() {},
      deliver(event, payload) { (handlers.get(event) || []).forEach(handler => handler(payload)); }
    };
    try {
      window.i18n = { ready: new Promise(() => {}) };
      window.io = () => socket;
      window.requestAnimationFrame = callback => window.setTimeout(callback, 0);
      window.eval(`${fs.readFileSync(FULL_OVERLAY_SOURCE, 'utf8')}\nwindow.__settingsTest = { STATE, connectSocket, render };`);
      const { STATE, connectSocket, render } = window.__settingsTest;
      STATE.container = window.document.getElementById('overlay-container');
      STATE.settings = { ...schema.getDefaults('full'), showSuperFans: false, useVirtualScrolling: false, animationIn: 'none' };
      STATE.events.superfanDisplay = [];
      connectSocket();

      socket.deliver('clarityhud.settings.full', { ...STATE.settings, showSuperFans: false });
      STATE.events.superfanDisplay = [{
        type: 'superfanDisplay',
        data: { eventType: 'superfan', displayName: 'Hydrated but hidden' },
        timestamp: Date.now(),
        id: 'fixture-history'
      }];
      render();
      expect(window.document.querySelectorAll('.event-item')).toHaveLength(0);

      socket.deliver('clarityhud.update.superfan-display', { eventType: 'superfan', displayName: 'Live hidden' });
      expect(STATE.events.superfanDisplay).toHaveLength(1);

      socket.deliver('clarityhud.settings.full', { ...STATE.settings, showSuperFans: true });
      expect(window.document.querySelector('.event-username')?.textContent).toBe('Hydrated but hidden');
      socket.deliver('clarityhud.update.superfan-display', { eventType: 'superfan', displayName: 'Live shown' });
      expect(STATE.events.superfanDisplay).toHaveLength(2);
      expect(STATE.events.superfanDisplay[0].data.displayName).toBe('Live shown');
    } finally {
      window.close();
    }
  });
});
