const fs = require('fs');
const path = require('path');

describe('Weather Control gamification', () => {
  const pluginPath = path.join(__dirname, '../plugins/weather-control/main.js');
  const uiPath = path.join(__dirname, '../plugins/weather-control/ui.html');
  const overlayPath = path.join(__dirname, '../plugins/weather-control/overlay.html');
  const manifestPath = path.join(__dirname, '../plugins/weather-control/plugin.json');
  const readmePath = path.join(__dirname, '../plugins/weather-control/README.md');

  let WeatherControlPlugin;
  let mockApi;
  let registeredTikTokEvents;
  let registeredRoutes;
  let plugin;

  function createMockApi() {
    registeredTikTokEvents = {};
    registeredRoutes = [];
    const socketHandlers = {};
    const mockSocketIO = {
      on: jest.fn((event, handler) => {
        socketHandlers[event] = handler;
      }),
      emit: jest.fn()
    };

    const mockDb = {
      prepare: jest.fn(() => ({
        get: jest.fn(() => ({
          username: 'alice',
          is_follower: true,
          team_member_level: 1,
          gifts_sent: 0,
          coins_sent: 0
        })),
        all: jest.fn(() => [])
      }))
    };

    return {
      log: jest.fn(),
      emit: jest.fn(),
      getConfig: jest.fn().mockResolvedValue(null),
      setConfig: jest.fn().mockResolvedValue(true),
      registerRoute: jest.fn((method, route, ...handlers) => {
        registeredRoutes.push({ method, route, handlers });
      }),
      registerTikTokEvent: jest.fn((event, handler) => {
        registeredTikTokEvents[event] = handler;
      }),
      registerFlowAction: jest.fn(),
      getDatabase: jest.fn().mockReturnValue(mockDb),
      getSocketIO: jest.fn().mockReturnValue(mockSocketIO),
      pluginLoader: {
        loadedPlugins: new Map()
      }
    };
  }

  beforeEach(() => {
    jest.resetModules();
    WeatherControlPlugin = require(pluginPath);
    mockApi = createMockApi();
    plugin = new WeatherControlPlugin(mockApi);
  });

  test('loads gamification defaults into config', async () => {
    await plugin.loadConfig();

    expect(plugin.config.gamification).toBeDefined();
    expect(plugin.config.gamification.enabled).toBe(true);
    expect(plugin.config.gamification.communityMeter.enabled).toBe(true);
    expect(plugin.config.gamification.quests.enabled).toBe(true);
    expect(plugin.config.gamification.streaks.windowMs).toBeGreaterThan(0);
    expect(plugin.config.gamification.rewards.thresholds.length).toBeGreaterThan(0);
    expect(plugin.config.gamification.overlay.showMeter).toBe(true);
    expect(mockApi.setConfig).toHaveBeenCalledWith(
      'weather_config',
      expect.objectContaining({
        gamification: expect.any(Object)
      })
    );
  });

  test('applies community meter progress, quest completion and reward thresholds', async () => {
    await plugin.loadConfig();
    plugin.gamification = plugin.createDefaultGamificationRuntimeState();
    plugin.config.gamification.rewards.thresholds = [
      { meter: 1, action: 'rain', intensity: 0.3, duration: 5000, label: 'Tiny drizzle' }
    ];
    plugin.config.gamification.rewards.carryOver = true;
    plugin.config.gamification.quests.pool = [
      {
        id: 'chat-quest',
        title: 'Chat Sprint',
        type: 'chat_count',
        target: 2,
        eventTypes: ['chat'],
        reward: { action: 'snow', intensity: 0.4, duration: 4000 }
      }
    ];

    const first = plugin.applyGamificationEvent('chat', { username: 'alice', amount: 1 });
    const second = plugin.applyGamificationEvent('chat', { username: 'bob', amount: 1 });

    expect(first.contribution.total).toBeGreaterThan(0);
    expect(plugin.gamification.communityMeter.current).toBeGreaterThanOrEqual(1);
    expect(plugin.gamification.rewards.firedThresholds).toContain(1);
    expect(mockApi.emit).toHaveBeenCalledWith(
      'weather:trigger',
      expect.objectContaining({ action: 'rain' })
    );
    expect(second.quest.status).toBe('completed');
    expect(plugin.gamification.quest.completedCount).toBe(1);
    expect(mockApi.emit).toHaveBeenCalledWith(
      'weather:gamification-quest',
      expect.objectContaining({ reason: 'completed' })
    );
  });

  test('completes a non-rotating quest and emits its configured weather reward only once', async () => {
    await plugin.loadConfig();
    plugin.gamification = plugin.createDefaultGamificationRuntimeState();
    plugin.config.gamification.quests.rotateOnCompletion = false;
    plugin.config.gamification.quests.pool = [{
      id: 'once', title: 'One time', type: 'chat_count', target: 1, eventTypes: ['chat'],
      reward: { action: 'snow', intensity: 0.4, duration: 4000 }
    }];
    const quest = plugin.createNextQuest();

    expect(plugin.advanceQuestProgress('chat')).toMatchObject({ id: quest.id, status: 'completed' });
    plugin.advanceQuestProgress('chat');

    const rewardCalls = mockApi.emit.mock.calls.filter(([event]) => event === 'weather:trigger');
    expect(rewardCalls).toHaveLength(1);
    expect(rewardCalls[0][1]).toMatchObject({
      action: 'snow', intensity: 0.4, duration: 4000, username: 'community-quest',
      meta: { triggeredBy: 'gamification-quest', label: 'One time', questId: 'once' }
    });
    expect(plugin.gamification.quest.completedCount).toBe(1);
    expect(mockApi.emit.mock.calls.filter(([event, payload]) => (
      event === 'weather:gamification-quest' && payload.reason === 'completed'
    ))).toHaveLength(1);
  });

  test('rotates after completion without duplicate rewards from events before rotation', async () => {
    jest.useFakeTimers();
    try {
      await plugin.loadConfig();
      plugin.gamification = plugin.createDefaultGamificationRuntimeState();
      plugin.config.gamification.quests.rotateOnCompletion = true;
      plugin.config.gamification.quests.pool = [
        { id: 'first', title: 'First', type: 'chat_count', target: 1, eventTypes: ['chat'], reward: { action: 'rain', intensity: 0.3, duration: 3000 } },
        { id: 'second', title: 'Second', type: 'chat_count', target: 1, eventTypes: ['chat'], reward: { action: 'fog', intensity: 0.5, duration: 3000 } }
      ];
      plugin.createNextQuest();

      plugin.advanceQuestProgress('chat');
      plugin.advanceQuestProgress('chat');
      expect(plugin.gamification.quest.completedCount).toBe(1);
      expect(mockApi.emit.mock.calls.filter(([event]) => event === 'weather:trigger')).toHaveLength(1);

      jest.advanceTimersByTime(0);
      expect(plugin.gamification.quest.active).toMatchObject({ id: 'second', status: 'active', progress: 0 });
      expect(mockApi.emit.mock.calls.filter(([event]) => event === 'weather:trigger')).toHaveLength(1);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test('uses the normalized fallback action and suppresses quest weather rewards when rewards are disabled', async () => {
    await plugin.loadConfig();
    plugin.gamification = plugin.createDefaultGamificationRuntimeState();
    plugin.config.gamification.quests.rotateOnCompletion = false;
    plugin.config.gamification.quests.pool = [{
      id: 'fallback', title: 'Fallback', type: 'chat_count', target: 1, eventTypes: ['chat'],
      reward: { action: 'not-a-weather-effect', intensity: 0.2, duration: 2000 }
    }];
    expect(plugin.createNextQuest().reward.action).toBe('rain');
    plugin.advanceQuestProgress('chat');
    expect(mockApi.emit).toHaveBeenCalledWith('weather:trigger', expect.objectContaining({ action: 'rain' }));

    plugin.config.gamification.rewards.enabled = false;
    plugin.createNextQuest();
    plugin.advanceQuestProgress('chat');
    expect(mockApi.emit.mock.calls.filter(([event]) => event === 'weather:trigger')).toHaveLength(1);
  });

  test('registers gamification routes and TikTok handlers during init', async () => {
    await plugin.init();

    expect(registeredTikTokEvents.chat).toEqual(expect.any(Function));
    expect(registeredTikTokEvents.gift).toEqual(expect.any(Function));
    expect(registeredRoutes.some((entry) => entry.route === '/api/weather/gamification')).toBe(true);
    expect(registeredRoutes.some((entry) => entry.route === '/api/weather/gamification/reset')).toBe(true);
  });

  test('UI and overlay expose gamification controls and HUD hooks', () => {
    const ui = fs.readFileSync(uiPath, 'utf8');
    const overlay = fs.readFileSync(overlayPath, 'utf8');
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    const readme = fs.readFileSync(readmePath, 'utf8');

    expect(ui).toContain('Weather Gamification');
    expect(ui).toContain('gamificationMeterMax');
    expect(ui).toContain('gamificationQuestPool');
    expect(ui).toContain('refreshGamificationBtn');
    expect(ui).toContain('resetGamificationBtn');
    expect(overlay).toContain('gamification-hud');
    expect(overlay).toContain('weather:gamification-state');
    expect(overlay).toContain('weather:request-gamification-state');
    expect(manifest).toContain('community gamification');
    expect(readme).toContain('Community Gamification');
  });

  test('persists the Community HUD master switch independently from gamification', () => {
    const ui = fs.readFileSync(uiPath, 'utf8');

    expect(ui).toContain('id="gamificationOverlayEnabled"');
    expect(ui).toContain("enabled: document.getElementById('gamificationOverlayEnabled')?.checked !== false");
    expect(ui).toContain("document.getElementById('gamificationOverlayEnabled').checked = gamification.overlay?.enabled !== false");
  });

  test('does not create quests, process events, rewards, or timers when gamification is disabled', async () => {
    jest.useFakeTimers();
    try {
      mockApi.getConfig.mockResolvedValue({
        enabled: true,
        gamification: {
          enabled: false,
          quests: {
            enabled: true,
            pool: [{ id: 'disabled-quest', title: 'Disabled', type: 'chat_count', target: 1, eventTypes: ['chat'] }]
          },
          rewards: {
            enabled: true,
            thresholds: [{ meter: 1, action: 'rain', intensity: 0.5, duration: 1000, label: 'Disabled reward' }]
          }
        }
      });

      await plugin.loadConfig();

      expect(plugin.gamification.quest.active).toBeNull();
      expect(jest.getTimerCount()).toBe(0);
      expect(plugin.applyGamificationEvent('chat', { username: 'alice' })).toBeNull();
      expect(plugin.resolveRewardThreshold({ meter: 100 })).toEqual([]);
      expect(mockApi.emit).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
