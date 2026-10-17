'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const {
  isHttpAllowed,
  isIncomingSocketEventAllowed,
  isOutgoingSocketEventAllowed
} = require('../modules/public-overlay-registry');
const {
  projectPublicOverlayPayload,
  projectWeatherConfigResponse
} = require('../modules/public-overlay-payload-projection');

const APP_ROOT = path.resolve(__dirname, '..');
const PLUGIN_ROOT = path.join(APP_ROOT, 'plugins/webgpu-weather-control');
const HTML_PATH = path.join(PLUGIN_ROOT, 'overlay.html');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('WebGPU Weather Control original overlay lifecycle', () => {
  test('refreshes existing public config, survives BFCache and disposes its loop and socket handlers', async () => {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const assets = [...html.matchAll(/<(?:script|link|img)\b[^>]*\bsrc="([^"]+)"/gi)]
      .map((match) => match[1]);
    for (const asset of assets) {
      expect(isHttpAllowed({ method: 'GET', pathname: new URL(asset, 'http://127.0.0.1').pathname })).toBe(true);
    }
    expect(isHttpAllowed({ method: 'GET', pathname: '/api/webgpu-weather/overlay-config' })).toBe(true);
    expect(isHttpAllowed({ method: 'POST', pathname: '/api/webgpu-weather/overlay-config' })).toBe(false);
    expect(projectWeatherConfigResponse({ success: true, config: {
      enabled: true, qualityPreset: 'high', adaptiveQuality: true, maxConcurrentEffects: 4,
      effects: { rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, layer: 20 } },
      gamification: { enabled: true, overlay: { enabled: true, showMeter: true, showQuest: true, showStreak: false, showRewardFeed: true } }
    } })).toEqual({ success: true, config: {
      enabled: true, qualityPreset: 'high', adaptiveQuality: true, maxConcurrentEffects: 4,
      effects: { rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, layer: 20 } },
      gamification: { enabled: true, overlay: { enabled: true, showMeter: true, showQuest: true, showStreak: false, showRewardFeed: true } }
    } });
    const projectedEventSamples = {
      'webgpu-weather:trigger': { action: 'rain', intensity: 0.7, duration: 5000, permanent: false, options: { layer: 32, wind: 0.4, opacity: 0.75, particleScale: 0.9 } },
      'webgpu-weather:stop-effect': { action: 'rain' },
      'webgpu-weather:stop': {},
      'webgpu-weather:config-changed': {},
      'webgpu-weather:gamification-state': {
        overlay: { enabled: true, showMeter: true, showQuest: true, showStreak: true, showRewardFeed: true },
        communityMeter: { current: 6, max: 10 }, quest: { active: { title: 'Rain goal' } },
        streaks: { current: 3 }, rewards: { history: [{ label: 'Umbrella' }, { label: 'private tail ignored' }] }
      }
    };
    for (const [eventName, sample] of Object.entries(projectedEventSamples)) {
      expect(isOutgoingSocketEventAllowed(eventName)).toBe(true);
      const projected = projectPublicOverlayPayload(eventName, sample);
      expect(projected).not.toBeNull();
      expect(projected).not.toBeUndefined();
      if (eventName === 'webgpu-weather:trigger') {
        expect(projected).toEqual({ action: 'rain', intensity: 0.7, duration: 5000, permanent: false, options: { layer: 32, wind: 0.4, opacity: 0.75, particleScale: 0.9 } });
      }
      if (eventName === 'webgpu-weather:gamification-state') {
        expect(projected).toEqual({
          overlay: sample.overlay,
          communityMeter: { enabled: true, current: 6, max: 10 },
          quest: { active: { title: 'Rain goal' } },
          streaks: { enabled: true, current: 3 },
          rewards: { history: [{ label: 'Umbrella' }] }
        });
      }
    }
    for (const eventName of ['webgpu-weather:client-ready', 'webgpu-weather:request-permanent-effects', 'webgpu-weather:overlay-state']) {
      expect(isIncomingSocketEventAllowed(eventName)).toBe(true);
    }

    const handlers = new Map();
    const outgoing = [];
    const socket = {
      connected: false,
      on(eventName, handler) { handlers.set(eventName, [...(handlers.get(eventName) || []), handler]); },
      off(eventName, handler) { handlers.set(eventName, (handlers.get(eventName) || []).filter((item) => item !== handler)); },
      emit(eventName, payload) { outgoing.push({ eventName, payload }); },
      disconnect() { this.connected = false; this.disconnectCalls = (this.disconnectCalls || 0) + 1; },
      deliver(eventName, ...args) { for (const handler of [...(handlers.get(eventName) || [])]) handler(...args); }
    };
    const requests = [];
    const responses = [];
    const raf = new Map();
    let rafId = 0;
    const rendererErrors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (error) => rendererErrors.push(error.message));
    const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
      url: 'http://127.0.0.1:3000/webgpu-weather-control/overlay',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window) {
        window.io = () => socket;
        window.navigator.gpu = undefined;
        window.HTMLCanvasElement.prototype.getContext = () => null;
        window.requestAnimationFrame = (callback) => { const id = ++rafId; raf.set(id, callback); return id; };
        window.cancelAnimationFrame = (id) => raf.delete(id);
        window.fetch = (input, options = {}) => {
          const url = new URL(String(input), window.location.href);
          requests.push({ method: String(options.method || 'GET').toUpperCase(), path: url.pathname });
          const response = deferred();
          responses.push(response);
          return response.promise;
        };
      }
    });

    try {
      const framegraph = fs.readFileSync(path.join(PLUGIN_ROOT, 'gpu/weather-framegraph.js'), 'utf8');
      const engineSource = fs.readFileSync(path.join(PLUGIN_ROOT, 'gpu/cinematic-weather-engine.js'), 'utf8');
      const inlineScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
        .map((match) => match[1]).find((source) => source.includes('new CinematicWeatherEngine'));
      dom.window.eval(framegraph);
      dom.window.eval(engineSource);
      dom.window.eval(`${inlineScript}\nwindow.__fixture = { engine, socket, loadOverlayConfig, handlePageHide, handlePageShow, handleConnect };`);
      await nextTurn();

      const fixture = dom.window.__fixture;
      expect(fixture.engine.state).toBe('unsupported');
      expect(fixture.engine.gpu).toBeNull();
      void fixture.loadOverlayConfig();
      await nextTurn();
      expect(requests).toEqual([{ method: 'GET', path: '/api/webgpu-weather/overlay-config' }]);
      expect(raf.size).toBe(1);

      const oldConfig = responses[0];
      socket.connected = true;
      socket.deliver('connect');
      expect(requests).toHaveLength(1);
      socket.deliver('webgpu-weather:config-changed', { config: {} });
      expect(requests).toHaveLength(2);
      oldConfig.resolve({ ok: true, json: async () => ({ success: true, config: { qualityPreset: 'low' } }) });
      responses[1].resolve({ ok: true, json: async () => ({ success: true, config: { qualityPreset: 'high', adaptiveQuality: false, effects: {} } }) });
      await nextTurn();
      await nextTurn();
      expect(fixture.engine.qualityName).toBe('high');

      socket.deliver('webgpu-weather:trigger', projectPublicOverlayPayload(
        'webgpu-weather:trigger', projectedEventSamples['webgpu-weather:trigger']
      ));
      expect(fixture.engine.getEffectState().map((effect) => effect.action)).toEqual(['rain']);
      expect(fixture.engine.getEffectState()[0].intensity).toBe(0.7);
      expect(fixture.engine.getEffectState()[0].layer).toBe(32);
      expect(fixture.engine.getEffectState()[0].wind).toBe(0.4);
      expect(fixture.engine.getEffectState()[0].opacity).toBe(0.75);
      expect(fixture.engine.getEffectState()[0].particleScale).toBe(0.9);

      socket.connected = false;
      socket.deliver('disconnect', 'transport close');
      expect(fixture.engine.getEffectState().map((effect) => effect.action)).toEqual(['rain']);
      socket.connected = true;
      socket.deliver('connect');
      await nextTurn();
      expect(requests).toHaveLength(3);
      responses[2].resolve({ ok: true, json: async () => ({ success: true, config: { qualityPreset: 'medium', effects: {} } }) });
      await nextTurn();
      await nextTurn();
      expect(fixture.engine.qualityName).toBe('medium');
      expect(fixture.engine.getEffectState().map((effect) => effect.action)).toEqual(['rain']);

      socket.deliver('webgpu-weather:gamification-state', {
        overlay: { enabled: true, showMeter: true, showQuest: true, showStreak: true, showRewardFeed: true },
        communityMeter: { current: 6, max: 10 },
        quest: { active: { title: 'Rain goal' } },
        streaks: { current: 3 },
        rewards: { history: [{ label: 'Umbrella' }, { label: 'ignored' }] }
      });
      expect(dom.window.document.querySelector('#communityHud').hidden).toBe(false);
      expect(dom.window.document.querySelector('#hudMeterValue').textContent).toBe('6');
      expect(dom.window.document.querySelector('#hudQuestValue').textContent).toBe('Rain goal');
      expect(dom.window.document.querySelector('#hudStreakValue').textContent).toBe('3');
      expect(dom.window.document.querySelector('#hudRewardValue').textContent).toBe('Umbrella');

      const cachedHide = new dom.window.Event('pagehide');
      Object.defineProperty(cachedHide, 'persisted', { value: true });
      dom.window.dispatchEvent(cachedHide);
      expect(fixture.engine.state).toBe('unsupported');
      expect(raf.size).toBe(0);
      expect(fixture.engine.qualityName).toBe('medium');

      const restore = new dom.window.Event('pageshow');
      Object.defineProperty(restore, 'persisted', { value: true });
      dom.window.dispatchEvent(restore);
      expect(raf.size).toBe(1);
      expect(requests).toHaveLength(4);
      responses[3].resolve({ ok: true, json: async () => ({ success: true, config: { qualityPreset: 'medium', effects: {} } }) });
      await nextTurn();
      await nextTurn();
      expect(fixture.engine.qualityName).toBe('medium');

      const finalHide = new dom.window.Event('pagehide');
      Object.defineProperty(finalHide, 'persisted', { value: false });
      dom.window.dispatchEvent(finalHide);
      expect(fixture.engine.state).toBe('destroyed');
      expect(socket.disconnectCalls).toBe(1);
      expect(raf.size).toBe(0);
      expect([...handlers.values()].every((items) => items.length === 0)).toBe(true);
      const afterDispose = fixture.engine.qualityName;
      fixture.handleConnect();
      socket.connected = true;
      socket.deliver('webgpu-weather:trigger', { action: 'snow' });
      expect(fixture.engine.qualityName).toBe(afterDispose);
      expect(fixture.engine.getEffectState().map((effect) => effect.action)).toEqual([]);
      expect(rendererErrors).toEqual([]);
    } finally {
      dom.window.close();
    }
  });
});
