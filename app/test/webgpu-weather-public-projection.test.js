const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const WebgpuWeatherControlPlugin = require('../plugins/webgpu-weather-control/main');
const CinematicWeatherEngine = require('../plugins/webgpu-weather-control/gpu/cinematic-weather-engine')
  .CinematicWeatherEngine;
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');
const { protectPublicSocket } = require('../modules/public-overlay-access');

function createPlugin() {
  const api = { emit: jest.fn(), log: jest.fn() };
  const plugin = new WebgpuWeatherControlPlugin(api);
  const effects = Object.fromEntries(plugin.supportedEffects.map(action => [action, {
    enabled: true,
    defaultIntensity: 0.6,
    defaultDuration: 5000,
    permanent: false,
    layer: 32,
    opacity: 0.75,
    particleScale: 1.25,
    wind: 0.2,
    directionDeg: 15,
    fogColor: 'ice',
    colorTemperature: 'sunset'
  }]));
  plugin.config = {
    effects,
    gamification: {
      enabled: true,
      communityMeter: { enabled: true, max: 100 },
      streaks: { enabled: true, windowMs: 60000 },
      quests: { enabled: true },
      rewards: { historyLimit: 10, thresholds: [] },
      overlay: {
        enabled: true,
        showMeter: true,
        showQuest: true,
        showStreak: true,
        showRewardFeed: true
      }
    }
  };
  plugin.gamification = {
    communityMeter: { current: 37, total: 987, lastUpdatedAt: 1234, lastRewardAt: 456 },
    streaks: { current: 4, best: 19, lastEventAt: 111, lastContributor: 'private-contributor', lastResetAt: 222 },
    quest: {
      active: {
        id: 'private-quest-row',
        title: 'Five gifts',
        type: 'gift_count',
        progress: 2,
        target: 5,
        eventTypes: ['gift'],
        reward: { action: 'rain', intensity: 0.7, duration: 8000 }
      },
      rotationIndex: 3,
      completedCount: 8,
      lastCompletedAt: 900
    },
    rewards: {
      history: [{ type: 'quest-complete', questId: 'private-quest-row', title: 'Five gifts', timestamp: 123 }],
      firedThresholds: [50, 75]
    },
    lastBroadcastAt: 321
  };
  return { api, plugin };
}

describe('WebGPU Weather public event projection', () => {
  test('projects actual gamification broadcasts to the fields read by the original overlay', () => {
    const { api, plugin } = createPlugin();
    const html = fs.readFileSync(
      path.resolve(__dirname, '../plugins/webgpu-weather-control/overlay.html'),
      'utf8'
    );
    expect(html).toContain("state.quest?.active?.title ?? '—'");
    expect(html).toContain('state.communityMeter?.current ?? 0');
    const raw = plugin.broadcastGamificationState('quest-progress', {
      quest: { ...plugin.gamification.quest.active }
    });
    expect(api.emit).toHaveBeenCalledWith('webgpu-weather:gamification-state', raw);
    expect(JSON.stringify(raw)).toContain('private-quest-row');

    const projected = projectPublicOverlayPayload('webgpu-weather:gamification-state', raw);
    expect(projected).toEqual({
      overlay: { enabled: true, showMeter: true, showQuest: true, showStreak: true, showRewardFeed: true },
      communityMeter: { enabled: true, current: 37, max: 100 },
      quest: { active: { title: 'Five gifts' } },
      streaks: { enabled: true, current: 4 },
      rewards: { history: [] }
    });
    expect(JSON.stringify(projected)).not.toMatch(/private-quest-row|private-contributor|eventTypes|firedThresholds|lastUpdatedAt|lastRewardAt|lastBroadcastAt|rotationIndex|completedCount/);

    const publicSocket = {
      handshake: { headers: { host: 'quiet-river.trycloudflare.com' } },
      data: {},
      join: jest.fn(),
      use: jest.fn(),
      emit: jest.fn(() => true)
    };
    const localSocket = {
      handshake: { headers: { host: '127.0.0.1:3000' } },
      data: {}, emit: jest.fn(() => true)
    };
    const publicOriginalEmit = publicSocket.emit;
    protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });
    protectPublicSocket({ socket: localSocket, logger: { warn: jest.fn() } });
    publicSocket.emit('webgpu-weather:gamification-state', raw);
    localSocket.emit('webgpu-weather:gamification-state', raw);
    expect(publicOriginalEmit).toHaveBeenCalledWith('webgpu-weather:gamification-state', projected);
    expect(localSocket.emit).toHaveBeenCalledWith('webgpu-weather:gamification-state', raw);

    const handlers = {};
    const socket = { on: jest.fn((event, handler) => { handlers[event] = handler; }), emit: jest.fn() };
    class FakeWeatherEngine {
      init() { return Promise.resolve(true); }
      resize() {}
      applyConfig() {}
      trigger() {}
      stop() {}
      getMetrics() { return { state: 'ready' }; }
    }
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse(window) {
        window.io = () => socket;
        window.CinematicWeatherEngine = FakeWeatherEngine;
        window.fetch = async () => ({ json: async () => ({ success: false }) });
        window.requestAnimationFrame = () => 0;
      }
    });
    handlers['webgpu-weather:gamification-state'](projected);
    expect(dom.window.document.querySelector('#communityHud').hidden).toBe(false);
    expect(dom.window.document.querySelector('#hudMeterValue').textContent).toBe('37');
    expect(dom.window.document.querySelector('#hudQuestValue').textContent).toBe('Five gifts');
    expect(dom.window.document.querySelector('#hudStreakValue').textContent).toBe('4');
    dom.window.close();

    const directSnapshot = projectPublicOverlayPayload(
      'webgpu-weather:gamification-state', plugin.getGamificationSnapshot()
    );
    expect(directSnapshot).toEqual(projected);
  });

  test('projects weather triggers and stop/config signals without metadata unused by the original canvas', () => {
    const { plugin } = createPlugin();
    const raw = plugin.createWeatherEvent({
      action: 'rain',
      intensity: 0.6,
      duration: 5000,
      username: 'private-trigger-user',
      meta: { triggeredBy: 'private-route', providerToken: 'private-token' },
      options: { wind: 0.4, rewardLabel: 'private-reward-label' }
    });
    const projected = projectPublicOverlayPayload('webgpu-weather:trigger', raw);
    expect(projected).toEqual({
      action: 'rain', intensity: 0.6, duration: 5000, permanent: false,
      options: { layer: 32, opacity: 0.75, particleScale: 1.25, wind: 0.4, directionDeg: 15, fogColor: 'ice', colorTemperature: 'sunset' }
    });
    expect(JSON.stringify(projected)).not.toMatch(/private-trigger-user|private-route|private-token|private-reward-label|timestamp/);
    expect(new CinematicWeatherEngine({}).trigger(projected)).toBe(true);
    expect(projectPublicOverlayPayload('webgpu-weather:trigger', { ...raw, action: 'private-action' })).toBeNull();
    expect(projectPublicOverlayPayload('webgpu-weather:config-changed', { timestamp: 123, config: { apiKey: 'private-token' } })).toEqual({});
    expect(projectPublicOverlayPayload('webgpu-weather:stop', { username: 'private-trigger-user', meta: { token: 'private-token' } })).toEqual({});
    expect(projectPublicOverlayPayload('webgpu-weather:stop-effect', { action: 'rain', username: 'private-trigger-user' })).toEqual({ action: 'rain' });
    expect(projectPublicOverlayPayload('webgpu-weather:stop-effect', { action: 'private-action' })).toBeNull();
  });
});
