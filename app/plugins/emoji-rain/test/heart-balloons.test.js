/**
 * Tests for EmojiRain Herzballons like-event behavior.
 */

class MockAPI {
  constructor(config = {}) {
    this.logs = [];
    this.emissions = [];
    this.tikTokHandlers = {};
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
  registerTikTokEvent(event, handler) {
    this.tikTokHandlers[event] = handler;
  }
  registerFlowAction() {}
}

describe('EmojiRain - Herzballons', () => {
  let EmojiRainPlugin;

  beforeEach(() => {
    jest.resetModules();
    EmojiRainPlugin = require('../main.js');
  });

  test('assigns a stable heart color per user', () => {
    const api = new MockAPI();
    const plugin = new EmojiRainPlugin(api);

    const first = plugin.getHeartBalloonColor('viewer-one');
    const second = plugin.getHeartBalloonColor('viewer-one');
    const other = plugin.getHeartBalloonColor('viewer-two');

    expect(first).toBe(second);
    expect(first).not.toBe(other);
  });

  test('shuffles every heart color and uses each before repeating within a stream', () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    const plugin = new EmojiRainPlugin(new MockAPI());
    random.mockRestore();
    const colors = plugin.heartBalloonPalette.map((_, index) =>
      plugin.getHeartBalloonColor(`viewer-${index}`)
    );

    expect(plugin.heartBalloonColorPool).toEqual(expect.any(Array));
    expect(plugin.heartBalloonColorPool).not.toEqual(plugin.heartBalloonPalette);
    expect(new Set(colors).size).toBe(plugin.heartBalloonPalette.length);
    expect(plugin.getHeartBalloonColor('viewer-after-palette')).toBe(colors[0]);
  });

  test('resets user colors only for a confirmed new stream session', () => {
    const plugin = new EmojiRainPlugin(new MockAPI());
    const firstColor = plugin.getHeartBalloonColor('viewer-one');
    const initialColorPool = plugin.heartBalloonColorPool;

    expect(plugin.handleHeartBalloonStreamSession({
      streamIdentity: 'streamer:room-1',
      isNewStream: false
    })).toBe(false);
    expect(plugin.getHeartBalloonColor('viewer-one')).toBe(firstColor);

    expect(plugin.handleHeartBalloonStreamSession({
      streamIdentity: 'streamer:room-2'
    })).toBe(true);
    expect(plugin.heartBalloonUserColors.size).toBe(0);
    expect(plugin.heartBalloonColorPool).not.toBe(initialColorPool);
    expect(plugin.heartBalloonColorIndex).toBe(0);
  });

  test('clears the overlay and heart colors for a confirmed new stream only once', () => {
    const api = new MockAPI();
    const plugin = new EmojiRainPlugin(api);
    plugin.registerTikTokEventHandlers();
    plugin.getHeartBalloonColor('viewer-one');
    plugin.spawnQueue.push({ count: 3 });

    api.tikTokHandlers.streamSessionStarted({ streamIdentity: 'streamer:room-2' });

    expect(plugin.heartBalloonUserColors.size).toBe(0);
    expect(plugin.heartBalloonColorIndex).toBe(0);
    expect(plugin.spawnQueue).toEqual([]);
    expect(api.emissions).toEqual([{ event: 'emoji-rain:clear', data: {} }]);

    api.tikTokHandlers.streamSessionStarted({ streamIdentity: 'streamer:room-2' });
    expect(api.emissions).toHaveLength(1);
  });

  test('triggerHeartBalloons emits heart-balloon spawn data', () => {
    const api = new MockAPI();
    const plugin = new EmojiRainPlugin(api);

    const spawnData = plugin.triggerHeartBalloons({
      count: 9,
      username: 'viewer-one',
      profilePictureUrl: 'https://example.test/avatar.jpg',
      reason: 'test'
    });

    expect(api.emissions).toHaveLength(1);
    expect(api.emissions[0].event).toBe('emoji-rain:heart-balloons');
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
    const plugin = new EmojiRainPlugin(api);

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
    const plugin = new EmojiRainPlugin(api);

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
    const plugin = new EmojiRainPlugin(api);

    plugin.spawnEmojiRain('like', {
      uniqueId: 'parallel-liker',
      likeCount: 6,
      profilePictureUrl: 'https://example.test/parallel.jpg'
    });

    expect(api.emissions).toHaveLength(2);
    expect(api.emissions[0].event).toBe('emoji-rain:heart-balloons');
    expect(api.emissions[0].data).toMatchObject({
      mode: 'heart-balloons',
      count: 6,
      username: 'parallel-liker'
    });
    expect(api.emissions[1].event).toBe('emoji-rain:spawn');
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
    const plugin = new EmojiRainPlugin(api);

    plugin.spawnEmojiRain('like', {
      uniqueId: 'liker',
      likeCount: 6
    });

    expect(api.emissions).toHaveLength(1);
    expect(api.emissions[0].data.mode).toBeUndefined();
    expect(api.emissions[0].data.reason).toBe('like');
  });
});
