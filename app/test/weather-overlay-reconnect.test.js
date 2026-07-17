const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

class FakeSocket {
  constructor() {
    this.connected = false;
    this.connectCalls = 0;
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
    return this;
  }
}

function createOverlayDom(overlay, socket) {
  return new JSDOM(overlay, {
    url: 'http://localhost/weather-control/overlay',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.io = () => socket;
      window.fetch = async (url) => ({
        json: async () => url.includes('/api/weather/config')
          ? {
              success: true,
              config: {
                effects: {},
                audio: { enabled: false, effects: {} },
                maxConcurrentEffects: 1,
                qualityPreset: 'high',
                gamification: { overlay: {} }
              }
            }
          : { success: true, gamification: {} }
      });
      window.WeatherEngine = class {
        constructor(_canvas, options) {
          this.options = { renderQuality: options.renderQuality };
        }

        start() {}
        destroy() {}
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
    expect(overlay).toContain("socket.on('plugins:changed'");
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
      dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
      dom.window.close();
    }
  });
});
