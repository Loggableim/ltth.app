const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

class FakeSocket {
  constructor() {
    this.connected = false;
    this.handlers = new Map();
    this.emitted = [];
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

  trigger(event, payload) {
    for (const handler of this.handlers.get(event) || []) handler(payload);
  }

  connect() { return this; }
  disconnect() { return this; }
}

const minimalConfig = {
  enabled: true,
  qualityPreset: 'high',
  adaptiveQuality: false,
  maxConcurrentEffects: 3,
  effects: {
    rain: {
      defaultIntensity: 0.45,
      defaultDuration: 4200,
      opacity: 0.72,
      particleScale: 1.2,
      wind: 0.3,
      directionDeg: 24,
      layer: 21,
      fogColor: 'blue',
      colorTemperature: 'golden',
      glitchRgbShift: false,
      glitchDisplacement: true,
      glitchScanlines: false,
      glitchNoise: true,
      glitchBlocks: false,
      glitchChromaticAberration: true,
      glitchIntensity: 1.4
    }
  },
  audio: { enabled: false },
  gamification: {
    enabled: true,
    overlay: {
      enabled: true,
      showMeter: true,
      showQuest: true,
      showStreak: true,
      showRewardFeed: true
    }
  }
};

const minimalGamification = {
  enabled: true,
  communityMeter: { current: 34, max: 100 },
  streaks: { current: 5 },
  quest: { title: 'Build the storm', progress: 2, target: 6 },
  rewards: { nextThreshold: { label: 'Heavy rain', meter: 50 } }
};

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

describe('Weather public payload renderer fixture', () => {
  let overlay;
  let engineSource;

  beforeAll(() => {
    overlay = fs.readFileSync(
      path.join(__dirname, '../plugins/weather-control/overlay.html'),
      'utf8'
    );
    engineSource = fs.readFileSync(
      path.join(__dirname, '../plugins/weather-control/weather-engine.js'),
      'utf8'
    );
  });

  test('consumes minimal config, trigger options and gamification snapshot at the real engine boundary', async () => {
    const socket = new FakeSocket();
    const engineCalls = [];
    const malicious = '<img src=x onerror=alert(1)>';
    const publicConfig = structuredClone(minimalConfig);
    const publicSnapshot = structuredClone(minimalGamification);
    const fixtureHtml = overlay
      .replace('<script src="/socket.io/socket.io.js"></script>', '')
      .replace(
        '<script src="/plugins/weather-control/weather-engine.js"></script>',
        `<script>${engineSource}\nWeatherEngine.prototype.start = function () {};\nconst originalWeatherStartEffect = WeatherEngine.prototype.startEffect;\nWeatherEngine.prototype.startEffect = function (...args) {\n  window.__weatherEngineCalls.push(args);\n  return originalWeatherStartEffect.apply(this, args);\n};</script>`
      );

    expect(publicConfig).not.toHaveProperty('apiKey');
    expect(publicConfig).not.toHaveProperty('permissions');
    expect(publicConfig).not.toHaveProperty('chatCommands');
    expect(publicConfig).not.toHaveProperty('presets');
    expect(publicConfig).not.toHaveProperty('sequences');
    expect(publicSnapshot.quest).not.toHaveProperty('id');
    expect(publicSnapshot).not.toHaveProperty('rewardHistory');

    const dom = new JSDOM(fixtureHtml, {
      url: 'http://localhost/weather-control/overlay',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.__weatherEngineCalls = engineCalls;
        window.io = () => socket;
        window.fetch = async url => ({
          ok: true,
          json: async () => String(url).includes('/api/weather/gamification')
            ? { success: true, gamification: publicSnapshot }
            : { success: true, config: publicConfig }
        });
        window.HTMLCanvasElement.prototype.getContext = () => ({
          scale() {},
          clearRect() {},
          setTransform() {}
        });
        window.AudioContext = class {
          constructor() { throw new Error('Audio must stay disabled in this fixture'); }
        };
      }
    });

    try {
      await waitFor(() => socket.handlers.has('weather:trigger'), 'Weather trigger listener was not registered');
      await waitFor(() => dom.window.document.getElementById('gamification-meter-value')?.textContent === '34/100', 'Gamification snapshot was not rendered');

      const publicTrigger = {
        action: 'rain',
        intensity: 0.37,
        duration: 5000,
        permanent: false,
        options: {
          opacity: 0.64,
          particleScale: 1.1,
          wind: -0.2,
          directionDeg: -18,
          layer: 12,
          fogColor: 'blue',
          colorTemperature: 'golden',
          glitchRgbShift: false,
          glitchDisplacement: true,
          glitchScanlines: false,
          glitchNoise: true,
          glitchBlocks: false,
          glitchChromaticAberration: true,
          glitchIntensity: 1.3
        }
      };
      expect(publicTrigger).not.toHaveProperty('username');
      expect(publicTrigger).not.toHaveProperty('meta');
      expect(publicTrigger).not.toHaveProperty('admin');
      socket.trigger('weather:trigger', publicTrigger);

      const call = engineCalls[0];
      expect(call).toBeDefined();
      expect(call[0]).toBe('rain');
      expect(call[1]).toBe(0.37);
      expect(call[2]).toBe(5000);
      expect(call[3]).toMatchObject({
        opacity: 0.64,
        particleScale: 1.1,
        wind: -0.2,
        directionDeg: -18,
        layer: 12,
        fogColor: 'blue',
        colorTemperature: 'golden',
        glitchRgbShift: false,
        glitchDisplacement: true,
        glitchScanlines: false,
        glitchNoise: true,
        glitchBlocks: false,
        glitchChromaticAberration: true,
        glitchIntensity: 1.3,
        permanent: false
      });
      expect(typeof call[1]).toBe('number');
      expect(Number.isFinite(call[1])).toBe(true);
      expect(typeof call[2]).toBe('number');
      expect(Number.isFinite(call[2])).toBe(true);
      expect(Object.keys(call[3])).not.toContain('username');
      expect(Object.keys(call[3])).not.toContain('meta');
      expect(Object.keys(call[3])).not.toContain('admin');

      expect(dom.window.document.getElementById('gamification-meter-value').textContent).toBe('34/100');
      expect(dom.window.document.getElementById('gamification-quest-title').textContent).toBe('Build the storm');
      expect(dom.window.document.getElementById('gamification-quest-progress').textContent).toBe('2/6');
      expect(dom.window.document.getElementById('gamification-streak-value').textContent).toBe('5');
      expect(dom.window.document.getElementById('gamification-next-reward').textContent).toContain('Heavy rain');
      expect(dom.window.document.body.innerHTML).not.toContain(malicious);
      expect(publicConfig.audio.enabled).toBe(false);
    } finally {
      dispatchFinalPageHide(dom.window);
      dom.window.close();
    }
  });
});
