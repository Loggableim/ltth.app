const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../modules/database');

describe('WebGPU Weather Control isolated storage', () => {
  let db;
  const testDbPath = path.join(__dirname, 'test-webgpu-weather-control-storage.db');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    db = new DatabaseManager(testDbPath);
    db.updateGiftCatalog([{ id: 7, name: 'Galaxy', diamond_count: 1000 }]);
  });

  afterEach(() => {
    db?.db?.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('keeps WebGPU gift mappings independent from classic Weather Control mappings', () => {
    db.setGiftWeatherMapping(7, 'rain', 0.4, 9000, true);
    db.setWebgpuGiftWeatherMapping(7, 'aurora', 0.9, 15000, false);

    expect(db.getGiftWeatherMapping(7)).toMatchObject({
      weather_effect: 'rain',
      intensity: 0.4,
      duration: 9000,
      enabled: true
    });
    expect(db.getWebgpuGiftWeatherMapping(7)).toMatchObject({
      weather_effect: 'aurora',
      intensity: 0.9,
      duration: 15000,
      enabled: false,
      gift_name: 'Galaxy'
    });

    expect(db.deleteWebgpuGiftWeatherMapping(7).changes).toBe(1);
    expect(db.getWebgpuGiftWeatherMapping(7)).toBeNull();

    db.setWebgpuGiftWeatherMapping(7, 'aurora', 0.9, 15000, false);
    db.clearWebgpuGiftWeatherMappings();
    expect(db.getAllWebgpuGiftWeatherMappings()).toEqual([]);
    expect(db.getGiftWeatherMapping(7)).toMatchObject({ weather_effect: 'rain' });
  });
});

describe('WebGPU Weather Control bootstrap config', () => {
  test('creates an independent, safely disabled copy of the classic config', () => {
    const { createInitialWebgpuWeatherConfig } = require('../plugins/webgpu-weather-control/lib/bootstrap-config');
    const classicConfig = {
      enabled: true,
      apiKey: 'classic-key',
      qualityPreset: 'high',
      adaptiveQuality: false,
      effects: { rain: { defaultIntensity: 0.8 } },
      chatCommands: { commandNames: { weather: 'weather', weatherlist: 'weatherlist', weatherstop: 'weatherstop' } },
      gamification: {
        enabled: true,
        overlay: { enabled: true },
        state: { communityMeter: { current: 84 }, rewards: { history: [{ type: 'reward' }] } }
      }
    };

    const config = createInitialWebgpuWeatherConfig(classicConfig, () => 'webgpu-key');

    expect(config).not.toBe(classicConfig);
    expect(config.effects).not.toBe(classicConfig.effects);
    expect(config.effects.rain.defaultIntensity).toBe(0.8);
    expect(config.enabled).toBe(false);
    expect(config.qualityPreset).toBe('auto');
    expect(config.adaptiveQuality).toBe(true);
    expect(config.apiKey).toBe('webgpu-key');
    expect(config.chatCommands.commandNames).toEqual({
      weather: 'wgweather',
      weatherlist: 'wgweatherlist',
      weatherstop: 'wgweatherstop'
    });
    expect(config.gamification.enabled).toBe(false);
    expect(config.gamification.overlay.enabled).toBe(false);
    expect(config.gamification.state).toMatchObject({
      communityMeter: { current: 0, total: 0 },
      rewards: { history: [], firedThresholds: [] }
    });
  });

  test('falls back to a usable Weather Control config for malformed persisted data', () => {
    const { createInitialWebgpuWeatherConfig } = require('../plugins/webgpu-weather-control/lib/bootstrap-config');

    const config = createInitialWebgpuWeatherConfig('not a config', () => 'fallback-key');

    expect(config).toMatchObject({
      enabled: false,
      apiKey: 'fallback-key',
      qualityPreset: 'auto',
      adaptiveQuality: true,
      maxConcurrentEffects: 5
    });
    expect(config.effects.rain).toMatchObject({ enabled: true, defaultIntensity: 0.5 });
    expect(config.chatCommands.commandNames.weather).toBe('wgweather');
    expect(config.gamification.state.communityMeter.current).toBe(0);
    expect(config.presets).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Cozy Rain' })
    ]));
    expect(config.gamification.quests.pool).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'community-chat' })
    ]));
  });

  test('normalizes malformed nested persisted sections to usable defaults', () => {
    const { createInitialWebgpuWeatherConfig } = require('../plugins/webgpu-weather-control/lib/bootstrap-config');

    const config = createInitialWebgpuWeatherConfig({
      effects: null,
      gamification: null
    }, () => 'nested-fallback-key');

    expect(config.effects.rain).toMatchObject({ enabled: true, defaultIntensity: 0.5 });
    expect(config.gamification).toMatchObject({ enabled: false });
    expect(config.gamification.overlay.enabled).toBe(false);
    expect(config.gamification.state.communityMeter.current).toBe(0);
  });

  test('retains typed defaults when persisted primitive values are malformed', () => {
    const { createInitialWebgpuWeatherConfig } = require('../plugins/webgpu-weather-control/lib/bootstrap-config');

    const config = createInitialWebgpuWeatherConfig({
      maxConcurrentEffects: null,
      rateLimitPerMinute: 'unlimited',
      effects: {
        rain: {
          enabled: 'yes',
          defaultIntensity: null
        }
      },
      gamification: {
        communityMeter: {
          max: 'one-hundred'
        }
      }
    }, () => 'typed-fallback-key');

    expect(config.maxConcurrentEffects).toBe(5);
    expect(config.rateLimitPerMinute).toBe(10);
    expect(config.effects.rain.enabled).toBe(true);
    expect(config.effects.rain.defaultIntensity).toBe(0.5);
    expect(config.gamification.communityMeter.max).toBe(100);
  });
});
