const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

class FakeSocket {
  constructor() {
    this.connected = false;
    this.connectCalls = 0;
    this.disconnectCalls = 0;
    this.emitted = [];
    this.handlers = new Map();
  }

  on(event, handler) {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  emit(event, payload) {
    this.emitted.push({ event, payload });
    return true;
  }

  trigger(event, ...args) {
    for (const handler of this.handlers.get(event) || []) handler(...args);
  }

  connect() {
    this.connectCalls += 1;
    return this;
  }

  disconnect() {
    this.disconnectCalls += 1;
    return this;
  }
}

function createOverlayDom(overlay, socket, gamification = { enabled: true, overlay: {} }, fixtureOptions = {}) {
  return new JSDOM(overlay, {
    url: 'http://localhost/weather-control/overlay',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.io = () => socket;
      window.fetch = fixtureOptions.fetch || (async (url) => ({
        json: async () => url.includes('/api/weather/config')
          ? {
              success: true,
              config: {
                effects: {},
                audio: { enabled: false, effects: {} },
                maxConcurrentEffects: 1,
                qualityPreset: 'high',
                gamification
              }
            }
          : { success: true, gamification: {} }
      }));
      if (fixtureOptions.intervalAudit) {
        const setInterval = window.setInterval.bind(window);
        const clearInterval = window.clearInterval.bind(window);
        window.setInterval = (callback, delay) => {
          const timer = setInterval(callback, delay);
          fixtureOptions.intervalAudit.add(timer);
          return timer;
        };
        window.clearInterval = timer => {
          fixtureOptions.intervalAudit.delete(timer);
          clearInterval(timer);
        };
      }
      window.WeatherEngine = class {
        constructor(_canvas, engineOptions) {
          this.options = { renderQuality: engineOptions.renderQuality };
          if (fixtureOptions.engineAudit) {
            fixtureOptions.engineAudit.constructed += 1;
            fixtureOptions.engineAudit.engineOptions = engineOptions;
          }
        }

        start() { if (fixtureOptions.engineAudit) fixtureOptions.engineAudit.started += 1; }
        setQuality(quality, adaptiveQuality) {
          if (fixtureOptions.engineAudit) {
            fixtureOptions.engineAudit.qualityChanges = fixtureOptions.engineAudit.qualityChanges || [];
            fixtureOptions.engineAudit.qualityChanges.push({ quality, adaptiveQuality });
          }
        }
        destroy() { if (fixtureOptions.engineAudit) fixtureOptions.engineAudit.destroyed += 1; }
        startEffect() { if (fixtureOptions.engineAudit) fixtureOptions.engineAudit.effectsStarted += 1; }
        getActiveEffects() { return []; }
        getFPS() { return 60; }
        getAverageFPS() { return 60; }
        getParticleCount() { return 0; }
        stopAllEffects() {}
        stopEffect() {}
      };
    }
  });
}

async function waitForSocketHandler(socket, event) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (socket.handlers.has(event)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Socket handler was not registered: ${event}`);
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error(message);
}

function dispatchFinalPageHide(window) {
  const event = new window.Event('pagehide');
  Object.defineProperty(event, 'persisted', { value: false });
  window.dispatchEvent(event);
}

describe('Weather Control overlay reconnect recovery', () => {
  let overlay;

  beforeAll(() => {
    overlay = fs.readFileSync(
      path.join(__dirname, '../plugins/weather-control/overlay.html'),
      'utf8'
    );
  });

  test('restarts the Socket.IO client after a server-initiated disconnect', () => {
    expect(overlay).toContain("reason === 'io server disconnect'");
    expect(overlay).toMatch(/reconnectTimer\s*=\s*setTimeout/);
    expect(overlay).toMatch(/socket\.connect\(\)/);
    expect(overlay).toMatch(/clearTimeout\(reconnectTimer\)/);
  });

  test('replays the ready handshake when Weather Control is reloaded', () => {
    expect(overlay).toContain("on('plugins:changed'");
    expect(overlay).toContain("payload.pluginId === 'weather-control'");
    expect(overlay).toContain("payload.action === 'reloaded_all'");
    expect(overlay).toMatch(/socket\.emit\('weather:client-ready'\)/);
  });

  test('recovers a running overlay after an app restart and plugin reload', async () => {
    const socket = new FakeSocket();
    const dom = createOverlayDom(overlay, socket);

    try {
      await waitForSocketHandler(socket, 'disconnect');
      socket.connected = true;
      socket.trigger('connect');
      const initialReadyEvents = socket.emitted.filter(({ event }) => event === 'weather:client-ready').length;

      socket.connected = false;
      socket.trigger('disconnect', 'io server disconnect');
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(socket.connectCalls).toBe(1);

      socket.connected = true;
      socket.trigger('plugins:changed', { action: 'reloaded', pluginId: 'weather-control' });
      socket.trigger('plugins:changed', { action: 'reloaded_all' });
      expect(socket.emitted.filter(({ event }) => event === 'weather:client-ready')).toHaveLength(initialReadyEvents + 2);
    } finally {
      dispatchFinalPageHide(dom.window);
      dom.window.close();
    }
  });

  test('hides the entire Community HUD or individual rows from overlay settings', async () => {
    const socket = new FakeSocket();
    const dom = createOverlayDom(overlay, socket, {
      enabled: true,
      overlay: {
        enabled: true,
        showMeter: false,
        showQuest: false,
        showStreak: true,
        showRewardFeed: false
      }
    });

    try {
      await waitForSocketHandler(socket, 'weather:gamification-state');
      socket.trigger('weather:gamification-state', {
        communityMeter: { current: 25, max: 100 },
        streaks: { current: 3 },
        rewards: { nextThreshold: { label: 'Storm', meter: 50 } }
      });

      expect(dom.window.document.getElementById('gamification-hud').classList.contains('show')).toBe(true);
      expect(dom.window.document.getElementById('gamification-meter-row').hidden).toBe(true);
      expect(dom.window.document.getElementById('gamification-quest-row').hidden).toBe(true);
      expect(dom.window.document.getElementById('gamification-streak-row').hidden).toBe(false);
      expect(dom.window.document.getElementById('gamification-reward-row').hidden).toBe(true);
    } finally {
      dispatchFinalPageHide(dom.window);
      dom.window.close();
    }

    const disabledSocket = new FakeSocket();
    const disabledDom = createOverlayDom(overlay, disabledSocket, {
      enabled: true,
      overlay: { enabled: false, showMeter: true, showQuest: true, showStreak: true, showRewardFeed: true }
    });

    try {
      await waitForSocketHandler(disabledSocket, 'weather:gamification-state');
      disabledSocket.trigger('weather:gamification-state', {});
      expect(disabledDom.window.document.getElementById('gamification-hud').classList.contains('show')).toBe(false);
    } finally {
      dispatchFinalPageHide(disabledDom.window);
      disabledDom.window.close();
    }
  });

  test('does not finish async initialization after final pagehide during config load', async () => {
    const socket = new FakeSocket();
    const engineAudit = { constructed: 0, started: 0, destroyed: 0, effectsStarted: 0 };
    const intervalAudit = new Set();
    let configRequests = 0;
    let resolveConfig;
    const configPending = new Promise(resolve => { resolveConfig = resolve; });
    const fetch = url => {
      if (url === '/api/weather/config') {
        configRequests += 1;
        return configPending;
      }
      return Promise.resolve({ json: async () => ({ success: true, gamification: {} }) });
    };
    const dom = createOverlayDom(overlay, socket, undefined, { fetch, engineAudit, intervalAudit });

    try {
      await waitFor(() => configRequests === 1, 'Weather overlay did not request config');
      expect(engineAudit.started).toBe(0);
      dispatchFinalPageHide(dom.window);
      resolveConfig({ json: async () => ({
        success: true,
        config: {
          enabled: true,
          effects: {},
          audio: { enabled: false, effects: {} },
          maxConcurrentEffects: 1,
          qualityPreset: 'low',
          gamification: { enabled: false, overlay: { enabled: false } }
        }
      }) });
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      expect(engineAudit).toEqual({ constructed: 0, started: 0, destroyed: 0, effectsStarted: 0 });
      expect(socket.handlers.size).toBe(0);
      expect(socket.disconnectCalls).toBe(0);
      expect(intervalAudit.size).toBe(0);
    } finally {
      dispatchFinalPageHide(dom.window);
      dom.window.close();
    }
  });

  test('keeps a persisted overlay alive, then performs final cleanup exactly once', async () => {
    const socket = new FakeSocket();
    const engineAudit = { constructed: 0, started: 0, destroyed: 0, effectsStarted: 0 };
    const intervalAudit = new Set();
    const dom = createOverlayDom(overlay, socket, undefined, { engineAudit, intervalAudit });

    try {
      await waitForSocketHandler(socket, 'weather:trigger');
      await waitFor(() => intervalAudit.size === 3, 'Weather overlay intervals did not start');
      const persistedHide = new dom.window.Event('pagehide');
      Object.defineProperty(persistedHide, 'persisted', { value: true });
      dom.window.dispatchEvent(persistedHide);
      expect(socket.disconnectCalls).toBe(0);
      expect(engineAudit.destroyed).toBe(0);
      expect(intervalAudit.size).toBe(3);

      const persistedShow = new dom.window.Event('pageshow');
      Object.defineProperty(persistedShow, 'persisted', { value: true });
      dom.window.dispatchEvent(persistedShow);
      socket.connected = true;
      socket.trigger('connect');
      expect(socket.emitted.filter(entry => entry.event === 'weather:client-ready')).toHaveLength(1);
      expect(intervalAudit.size).toBe(3);

      dispatchFinalPageHide(dom.window);
      dispatchFinalPageHide(dom.window);
      socket.trigger('weather:trigger', { action: 'rain', intensity: 0.5, duration: 1000 });
      expect(socket.disconnectCalls).toBe(1);
      expect(engineAudit.destroyed).toBe(1);
      expect(engineAudit.effectsStarted).toBe(0);
      expect(intervalAudit.size).toBe(0);
    } finally {
      dispatchFinalPageHide(dom.window);
      dom.window.close();
    }
  });

  test('rejects success-shaped config and gamification bodies when HTTP returns 503', async () => {
    const socket = new FakeSocket();
    const engineAudit = { constructed: 0, started: 0, destroyed: 0, effectsStarted: 0 };
    let configRequests = 0;
    let gamificationRequests = 0;
    let jsonBodiesRead = 0;
    const fetch = async url => {
      const isConfig = url.includes('/api/weather/config');
      if (isConfig) configRequests += 1;
      else gamificationRequests += 1;
      return {
        ok: false,
        status: 503,
        json: async () => {
          jsonBodiesRead += 1;
          return isConfig ? {
              success: true,
              config: {
                enabled: true,
                effects: {},
                audio: { enabled: false, effects: {} },
                maxConcurrentEffects: 1,
                qualityPreset: 'low',
                adaptiveQuality: false,
                gamification: { enabled: true, overlay: { enabled: true } }
              }
            }
          : {
              success: true,
              gamification: {
                communityMeter: { current: 73, max: 100 },
                streaks: { current: 4 },
                quest: { title: '503 snapshot', progress: 1, target: 3 },
                rewards: { nextThreshold: { label: 'Rain', meter: 80 } }
              }
            };
        }
      };
    };
    const dom = createOverlayDom(overlay, socket, undefined, { fetch, engineAudit });

    try {
      await waitForSocketHandler(socket, 'weather:trigger');
      await waitFor(() => gamificationRequests === 1, 'Gamification GET was not attempted');

      expect(configRequests).toBe(1);
      expect(gamificationRequests).toBe(1);
      expect(jsonBodiesRead).toBe(0);
      expect(engineAudit).toMatchObject({ constructed: 1, started: 1 });
      expect(engineAudit.engineOptions.renderQuality).toBe('high');
      expect(dom.window.document.getElementById('gamification-meter-value').textContent).not.toBe('73/100');
      socket.trigger('weather:trigger', { action: 'rain', intensity: 0.3, duration: 1200 });
      expect(engineAudit.effectsStarted).toBe(1);
    } finally {
      dispatchFinalPageHide(dom.window);
      dom.window.close();
    }
  });

  test('keeps socket and engine alive after network rejection and recovers on config-changed, not reconnect', async () => {
    const socket = new FakeSocket();
    const engineAudit = { constructed: 0, started: 0, destroyed: 0, effectsStarted: 0 };
    let recovered = false;
    let configRequests = 0;
    let gamificationRequests = 0;
    const fetch = async url => {
      const isConfig = url.includes('/api/weather/config');
      if (isConfig) configRequests += 1;
      else gamificationRequests += 1;
      if (!recovered) throw new Error('synthetic network rejection');
      return {
        ok: true,
        json: async () => isConfig
          ? {
              success: true,
              config: {
                enabled: true,
                effects: {},
                audio: { enabled: false, effects: {} },
                maxConcurrentEffects: 2,
                qualityPreset: 'low',
                adaptiveQuality: false,
                gamification: { enabled: true, overlay: { enabled: true } }
              }
            }
          : {
              success: true,
              gamification: {
                communityMeter: { current: 61, max: 100 },
                streaks: { current: 2 },
                quest: { title: 'Recovered', progress: 2, target: 4 },
                rewards: { nextThreshold: { label: 'Storm', meter: 90 } }
              }
            }
      };
    };
    const dom = createOverlayDom(overlay, socket, undefined, { fetch, engineAudit });

    try {
      await waitForSocketHandler(socket, 'weather:trigger');
      await waitFor(() => configRequests === 1 && gamificationRequests === 1, 'Initial GET failures were not attempted');
      expect(engineAudit).toMatchObject({ constructed: 1, started: 1 });
      expect(socket.handlers.has('weather:config-changed')).toBe(true);

      socket.connected = true;
      socket.trigger('connect');
      await new Promise(resolve => setImmediate(resolve));
      expect(configRequests).toBe(1);
      expect(gamificationRequests).toBe(1);

      recovered = true;
      socket.trigger('weather:config-changed');
      await waitFor(
        () => configRequests === 2 && gamificationRequests === 2 &&
          dom.window.document.getElementById('gamification-meter-value')?.textContent === '61/100',
        'Config-changed did not recover config and gamification GETs'
      );
      expect(engineAudit.qualityChanges).toEqual([{ quality: 'low', adaptiveQuality: false }]);
      expect(socket.emitted.some(entry => entry.event === 'weather:request-permanent-effects')).toBe(false);
      await new Promise(resolve => setTimeout(resolve, 120));
      expect(socket.emitted.some(entry => entry.event === 'weather:request-permanent-effects')).toBe(true);
    } finally {
      dispatchFinalPageHide(dom.window);
      dom.window.close();
    }
  });

  test('malformed successful config falls back, initializes listeners and recovers on config-changed', async () => {
    const socket = new FakeSocket();
    const engineAudit = { constructed: 0, started: 0, destroyed: 0, effectsStarted: 0 };
    const intervalAudit = new Set();
    let gamificationRequests = 0;
    let configRequests = 0;
    let recovered = false;
    const fetch = async url => {
      const isConfig = url.includes('/api/weather/config');
      if (isConfig) configRequests += 1;
      else gamificationRequests += 1;
      return {
        ok: true,
        json: async () => isConfig
          ? recovered
            ? {
                success: true,
                config: {
                  enabled: true,
                  effects: {},
                  audio: { enabled: false, effects: {} },
                  maxConcurrentEffects: 2,
                  qualityPreset: 'low',
                  adaptiveQuality: false,
                  gamification: { enabled: true, overlay: { enabled: true } }
                }
              }
            : { success: true, config: 'malformed-config' }
          : { success: true, gamification: {} }
      };
    };
    const dom = createOverlayDom(overlay, socket, undefined, { fetch, engineAudit, intervalAudit });

    try {
      await waitForSocketHandler(socket, 'weather:trigger');
      await waitFor(() => gamificationRequests === 1, 'Gamification request did not follow malformed config fallback');
      expect(engineAudit).toMatchObject({ constructed: 1, started: 1 });
      expect(socket.handlers.has('weather:config-changed')).toBe(true);
      expect(intervalAudit.size).toBe(3);
      socket.trigger('weather:trigger', { action: 'rain', intensity: 0.2, duration: 1500 });
      expect(engineAudit.effectsStarted).toBe(1);

      recovered = true;
      socket.trigger('weather:config-changed');
      await waitFor(() => configRequests === 2 && engineAudit.qualityChanges?.length === 1, 'Malformed config fallback did not recover on config-changed');
      expect(engineAudit.qualityChanges).toEqual([{ quality: 'low', adaptiveQuality: false }]);
    } finally {
      dispatchFinalPageHide(dom.window);
      dom.window.close();
    }
  });

  test('ignores a network rejection that settles after final pagehide', async () => {
    const socket = new FakeSocket();
    const engineAudit = { constructed: 0, started: 0, destroyed: 0, effectsStarted: 0 };
    const intervalAudit = new Set();
    let configRequests = 0;
    let rejectConfig;
    const pendingConfig = new Promise((_resolve, reject) => { rejectConfig = reject; });
    const fetch = url => {
      if (url.includes('/api/weather/config')) {
        configRequests += 1;
        return pendingConfig;
      }
      return Promise.resolve({ json: async () => ({ success: true, gamification: {} }) });
    };
    const dom = createOverlayDom(overlay, socket, undefined, { fetch, engineAudit, intervalAudit });

    try {
      await waitFor(() => configRequests === 1, 'Config request did not start');
      dispatchFinalPageHide(dom.window);
      rejectConfig(new Error('synthetic late network rejection'));
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      expect(engineAudit).toMatchObject({ constructed: 0, started: 0, destroyed: 0, effectsStarted: 0 });
      expect(socket.handlers.size).toBe(0);
      expect(socket.emitted).toHaveLength(0);
      expect(intervalAudit.size).toBe(0);
    } finally {
      dispatchFinalPageHide(dom.window);
      dom.window.close();
    }
  });
});
