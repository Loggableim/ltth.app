/**
 * Tests for WebGPU Emoji Rain Herzballons like-event behavior.
 */

class MockAPI {
  constructor(config = {}) {
    this.logs = [];
    this.emissions = [];
    this.config = {
      enabled: true,
      emoji_set: ['heart'],
      max_count_per_event: 100,
      max_intensity: 3.0,
      heart_balloons_enabled: true,
      heart_balloon_like_divisor: 1,
      heart_balloon_min_hearts: 5,
      heart_balloon_max_hearts: 24,
      heart_balloon_profile_every: 5,
      heart_balloon_pop_y: 0.5,
      heart_balloon_wind_strength: 0.45,
      heart_balloon_test_count: 8,
      ...config
    };
    this.db = {
      getEmojiRainConfig: () => this.config
    };
  }

  log(message, level) {
    this.logs.push({ message, level });
  }

  emit(event, data) {
    this.emissions.push({ event, data });
  }

  getSocketIO() {
    return { emit: this.emit.bind(this) };
  }

  getDatabase() {
    return this.db;
  }

  getPluginDataDir() {
    return '/tmp/test-plugin-data';
  }

  ensurePluginDataDir() {}

  getConfigPathManager() {
    return {
      getUserConfigsDir: () => '/tmp/test-user-configs'
    };
  }

  registerRoute() {}
  registerTikTokEvent() {}
  registerFlowAction() {}
}

describe('WebGPU Emoji Rain - Herzballons', () => {
  let WebGPUEmojiRainPlugin;

  beforeEach(() => {
    jest.resetModules();
    WebGPUEmojiRainPlugin = require('../main.js');
  });

  test('assigns a stable heart color per user', () => {
    const api = new MockAPI();
    const plugin = new WebGPUEmojiRainPlugin(api);

    const first = plugin.getHeartBalloonColor('viewer-one');
    const second = plugin.getHeartBalloonColor('viewer-one');
    const other = plugin.getHeartBalloonColor('viewer-two');

    expect(first).toBe(second);
    expect(first).not.toBe(other);
  });

  test('triggerHeartBalloons emits heart-balloon spawn data', () => {
    const api = new MockAPI();
    const plugin = new WebGPUEmojiRainPlugin(api);

    const spawnData = plugin.triggerHeartBalloons({
      count: 9,
      username: 'viewer-one',
      profilePictureUrl: 'https://example.test/avatar.jpg',
      reason: 'test'
    });

    expect(api.emissions).toHaveLength(1);
    expect(api.emissions[0].event).toBe('webgpu-emoji-rain:heart-balloons');
    expect(api.emissions[0].data).toMatchObject({
      mode: 'heart-balloons',
      type: 'heart-balloons',
      count: 9,
      username: 'viewer-one',
      profilePictureUrl: 'https://example.test/avatar.jpg',
      profileEvery: 5,
      popY: 0.5,
      windStrength: 0.45,
      reason: 'test'
    });
    expect(spawnData.heartColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('like events use Herzballons and include profile picture data', () => {
    const api = new MockAPI();
    const plugin = new WebGPUEmojiRainPlugin(api);

    plugin.spawnEmojiRain('like', {
      uniqueId: 'liker',
      likeCount: 6,
      profilePictureUrl: 'https://example.test/liker.jpg'
    });

    expect(api.emissions).toHaveLength(2);
    expect(api.emissions[0].data).toMatchObject({
      mode: 'heart-balloons',
      count: 6,
      username: 'liker',
      profilePictureUrl: 'https://example.test/liker.jpg',
      source: 'event:like'
    });
  });

  test('like events extract TikTok avatar urlList for every fifth heart balloon', () => {
    const api = new MockAPI();
    const plugin = new WebGPUEmojiRainPlugin(api);

    plugin.spawnEmojiRain('like', {
      uniqueId: 'liker',
      likeCount: 6,
      user: {
        profilePictureUrl: {
          urlList: [
            'https://example.test/tiktok-avatar-small.jpg',
            'https://example.test/tiktok-avatar-large.jpg'
          ]
        }
      }
    });

    expect(api.emissions[0].data).toMatchObject({
      mode: 'heart-balloons',
      count: 6,
      username: 'liker',
      profilePictureUrl: 'https://example.test/tiktok-avatar-small.jpg',
      profileEvery: 5,
      source: 'event:like'
    });
  });

  test('like events can show Herzballons and normal emoji rain in parallel', () => {
    const api = new MockAPI();
    const plugin = new WebGPUEmojiRainPlugin(api);

    plugin.spawnEmojiRain('like', {
      uniqueId: 'parallel-liker',
      likeCount: 6,
      profilePictureUrl: 'https://example.test/parallel.jpg'
    });

    expect(api.emissions).toHaveLength(2);
    expect(api.emissions[0].event).toBe('webgpu-emoji-rain:heart-balloons');
    expect(api.emissions[0].data).toMatchObject({
      mode: 'heart-balloons',
      count: 6,
      username: 'parallel-liker'
    });
    expect(api.emissions[1].event).toBe('webgpu-emoji-rain:spawn');
    expect(api.emissions[1].data).toMatchObject({
      emoji: 'heart',
      count: 1,
      username: 'parallel-liker',
      profilePictureUrl: 'https://example.test/parallel.jpg',
      reason: 'like',
      source: 'event:like'
    });
  });

  test('falls back to normal emoji rain for likes when Herzballons are disabled', () => {
    const api = new MockAPI({ heart_balloons_enabled: false });
    const plugin = new WebGPUEmojiRainPlugin(api);

    plugin.spawnEmojiRain('like', {
      uniqueId: 'liker',
      likeCount: 6
    });

    expect(api.emissions).toHaveLength(1);
    expect(api.emissions[0].data.mode).toBeUndefined();
    expect(api.emissions[0].data.reason).toBe('like');
  });
});
