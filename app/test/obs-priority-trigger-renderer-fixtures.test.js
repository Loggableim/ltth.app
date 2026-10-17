'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const APP_ROOT = path.resolve(__dirname, '..');
const LOCALES = ['de', 'en', 'es', 'fr'];

function makeSocket() {
  const handlers = new Map();
  const emitted = [];
  return {
    handlers,
    emitted,
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) || []), handler]);
    },
    off(event, handler) {
      handlers.set(event, (handlers.get(event) || []).filter(item => item !== handler));
    },
    emit(event, payload) { emitted.push({ event, payload }); },
    disconnect() { this.disconnected = true; },
    deliver(event, payload) {
      for (const handler of [...(handlers.get(event) || [])]) handler(payload);
    }
  };
}

function installTimers(window) {
  let nextId = 0;
  const timers = new Map();
  window.setTimeout = (callback, delay = 0) => {
    const id = ++nextId;
    timers.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = id => timers.delete(id);
  window.requestAnimationFrame = callback => window.setTimeout(callback, 16);
  window.cancelAnimationFrame = id => window.clearTimeout(id);
  return timers;
}

async function createFlameRenderer(locale) {
  const pluginRoot = path.join(APP_ROOT, 'plugins/flame-overlay');
  const html = fs.readFileSync(path.join(pluginRoot, 'renderer/index.html'), 'utf8');
  const source = fs.readFileSync(path.join(pluginRoot, 'renderer/effects-engine.js'), 'utf8');
  const socket = makeSocket();
  const requests = [];
  const timers = new Map();
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: `http://127.0.0.1:3000/plugins/flame-overlay/renderer/index.html?lang=${locale}`,
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.document.documentElement.lang = locale;
  window.io = () => socket;
  window.fetch = async url => {
    requests.push(String(url));
    return { json: async () => ({ success: true, config: { effectType: 'flames', flameIntensity: 1.3 } }) };
  };
  window.VISUAL_FX_DEFAULT_CONFIG = { effectType: 'flames', flameIntensity: 1.3 };
  window.HTMLCanvasElement.prototype.getContext = () => ({ fixtureContext: true });
  window.setTimeout = (callback, delay = 0) => {
    const id = timers.size + 1;
    timers.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = id => timers.delete(id);
  window.requestAnimationFrame = callback => window.setTimeout(callback, 16);
  window.cancelAnimationFrame = id => window.clearTimeout(id);

  if (window.document.readyState === 'loading') {
    await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }

  window.eval(`${source}
    EffectsEngine.prototype.setupAllShaders = function () {};
    EffectsEngine.prototype.switchEffect = function (effect) { this.config.effectType = effect; return true; };
    EffectsEngine.prototype.setupGeometry = function () {};
    EffectsEngine.prototype.loadTextures = function () {};
    EffectsEngine.prototype.initPostProcessor = function () {};
    EffectsEngine.prototype.initParticles = function () {};
    EffectsEngine.prototype.handleResize = function () {};
    EffectsEngine.prototype.updateUniforms = function () { this.fixtureUniformConfig = { ...this.config }; };
    EffectsEngine.prototype.scheduleRender = function () {};
    window.EffectsEngine = EffectsEngine;
  `);

  const engine = new window.EffectsEngine('flameCanvas');
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
  return { dom, window, engine, socket, requests, timers };
}

async function createFireworksRenderer(locale) {
  const pluginRoot = path.join(APP_ROOT, 'plugins/fireworks');
  const html = fs.readFileSync(path.join(pluginRoot, 'overlay.html'), 'utf8');
  const source = fs.readFileSync(path.join(pluginRoot, 'gpu/engine.js'), 'utf8');
  const socket = makeSocket();
  const requests = [];
  const translations = {
    de: '{username}: {coins} Münzen',
    en: '{username}: {coins} coins',
    es: '{username}: {coins} monedas',
    fr: '{username} : {coins} pièces'
  };
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('error', message => errors.push(String(message)));
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
    runScripts: 'outside-only',
    url: `http://127.0.0.1:3000/plugins/fireworks/overlay.html?lang=${locale}`,
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  window.document.documentElement.lang = locale;
  window.io = () => socket;
  window.i18n = {
    t(key, params = {}) {
      if (key === 'plugins.fireworks.ui.messages.gift_coins') {
        return translations[locale].replace('{username}', params.username).replace('{coins}', params.coins);
      }
      return key;
    }
  };
  window.fetch = async url => {
    requests.push(String(url));
    throw new Error('Unexpected network request in isolated renderer fixture');
  };
  const timers = installTimers(window);
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.eval(`${source}
    FireworksEngine.prototype.init = async function fixtureInit() {
      this.width = 1280;
      this.height = 720;
      this.audioManager.enabled = false;
      this.config.audioEnabled = false;
      this.config.giftPopupEnabled = true;
      this.connectSocket();
    };
  `);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
  return { dom, window, engine: window.fireworksEngineInstance, socket, timers, requests, errors };
}

describe('public overlay trigger-to-renderer synthetic fixtures', () => {
  test.each(LOCALES)('flame-overlay %s applies the producer-shaped trigger to visible renderer state', async locale => {
    const fixture = await createFlameRenderer(locale);
    try {
      expect(fixture.requests).toEqual(['/api/flame-overlay/config']);
      const initialIntensity = fixture.engine.config.flameIntensity;
      fixture.socket.deliver('flame-overlay:trigger', {
        id: `fixture-${locale}`,
        type: 'intensity-boost',
        amount: 0.5,
        duration: 5000,
        revert: true,
        source: 'gift:100'
      });

      expect(fixture.engine.activeTriggers).toHaveLength(1);
      expect(fixture.engine.config.flameIntensity).toBe(initialIntensity + 0.5);
      expect(fixture.engine.fixtureUniformConfig.flameIntensity).toBe(initialIntensity + 0.5);
      expect(fixture.engine.triggerTimers.size).toBe(1);
      expect(fixture.requests).toEqual(['/api/flame-overlay/config']);
    } finally {
      fixture.engine.destroy();
      fixture.dom.window.close();
    }
  });

  test.each(LOCALES)('fireworks %s turns the source-shaped socket trigger into a visible gift card and firework', async locale => {
    const fixture = await createFireworksRenderer(locale);
    try {
      expect(fixture.engine).toBeTruthy();
      expect(fixture.requests).toEqual([]);
      fixture.socket.deliver('fireworks:trigger', {
        id: `fixture-${locale}`,
        timestamp: 1,
        type: 'burst',
        intensity: 0.5,
        shape: 'burst',
        colors: ['#ff4500', '#ffd700'],
        position: { x: 0.25, y: 0.4 },
        particleCount: 12,
        requestedParticleCount: 12,
        tier: 'small',
        username: 'FixtureViewer',
        coins: 10,
        combo: 1,
        playSound: false,
        giftPopupEnabled: true,
        giftPopupPosition: 'bottom'
      });

      expect(fixture.engine.fireworks).toHaveLength(1);
      expect(fixture.engine.fireworks[0].x).toBe(320);
      expect(fixture.engine.fireworks[0].targetY).toBe(288);
      expect(fixture.engine.fireworks[0].shape).toBe('burst');
      const popup = fixture.window.document.querySelector('.gift-popup');
      expect(popup).not.toBeNull();
      expect(popup.textContent).toBe(fixture.window.i18n.t(
        'plugins.fireworks.ui.messages.gift_coins',
        { username: 'FixtureViewer', coins: 10 }
      ));
      expect(fixture.requests).toEqual([]);
      expect(fixture.errors).toEqual([]);
    } finally {
      fixture.engine.destroy();
      fixture.dom.window.close();
    }
  });
});
