'use strict';

// Contract tests for the read-only Eulerstream source (lt-6qo T2).
// Everything runs against an in-memory fake source and a fake clock. No key, no network,
// no real viewers.

const {
  createLiveReadSource,
  toRawEvent,
  isFollowSocial,
  DEFAULT_RECONNECT_DELAYS
} = require('../sidekick-host/adapters/live-read-source');
const { createFakeLiveSource } = require('../sidekick-host/testing/fake-live-source');
const {
  resolveLiveReadKeys,
  describeKeySource,
  redactKey,
  parseKeys
} = require('../sidekick-host/adapters/live-read-keys');
const { playEulerstreamFixture, formatSummary } = require('../sidekick-host/live-read-eulerstream-play');
const { FIXTURE_PATH, readFixture } = require('../sidekick-host/testing/live-read-fixture');

const FORBIDDEN = ['send', 'reply', 'post', 'comment', 'moderate', 'action', 'emit', 'write'];

function functionNames(value) {
  const names = new Set();
  let current = value;
  while (current && current !== Object.prototype && current !== Function.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (descriptor && typeof descriptor.value === 'function') names.add(name);
    }
    current = Object.getPrototypeOf(current);
  }
  return [...names];
}

describe('read-only eulerstream source', () => {
  test('bridges chat, gift and follows and drops everything else', async () => {
    const source = createFakeLiveSource();
    const stream = createLiveReadSource({ source });
    await stream.connect();
    source.chat('hallo');
    source.gift({ giftName: 'rose' });
    source.follow({ action: 1 });
    source.share({ action: 2 });
    expect(await stream.read()).toEqual([
      { type: 'chat', text: 'hallo' },
      { type: 'gift', text: '' },
      { type: 'follow', text: '' }
    ]);
    expect(stream.getStats().events).toBe(3);
  });

  test('is read-only: no outbound method and no outbound source call', async () => {
    const source = createFakeLiveSource();
    const stream = createLiveReadSource({ source });
    const names = functionNames(stream);
    for (const name of FORBIDDEN) {
      expect(names).not.toContain(name);
      expect(typeof stream[name]).not.toBe('function');
    }
    expect(Object.isFrozen(stream)).toBe(true);

    await stream.connect();
    source.chat('nur lesen');
    await stream.read();
    await stream.close();

    for (const call of source.methodsCalled()) {
      expect(['connect', 'disconnect']).toContain(call);
    }
  });

  test('connect and close are safe without a source', async () => {
    const stream = createLiveReadSource({});
    await expect(stream.connect()).resolves.toBeUndefined();
    expect(await stream.read()).toEqual([]);
    await expect(stream.close()).resolves.toBeUndefined();
  });

  test('close detaches, disconnects once and keeps a final drain', async () => {
    const source = createFakeLiveSource();
    const stream = createLiveReadSource({ source });
    await stream.connect();
    source.chat('vor dem schliessen');
    await stream.close();
    expect(source.methodsCalled().filter(method => method === 'disconnect')).toHaveLength(1);

    // Handlers are detached: late events are not buffered.
    source.chat('nach dem schliessen');
    expect(await stream.read()).toEqual([{ type: 'chat', text: 'vor dem schliessen' }]);
    expect(await stream.read()).toEqual([]);

    await stream.close();
    expect(source.methodsCalled().filter(method => method === 'disconnect')).toHaveLength(1);
  });

  test('reconnects on disconnected using the bounded delay ladder', async () => {
    const source = createFakeLiveSource();
    const scheduled = [];
    const stream = createLiveReadSource({
      source,
      reconnect: {
        enabled: true,
        maxAttempts: 2,
        delays: [10, 20],
        schedule: (run, delay) => {
          scheduled.push({ run, delay });
          return scheduled.length;
        },
        cancel: () => {}
      }
    });
    await stream.connect();
    expect(stream.getStats().connects).toBe(1);

    source.disconnectEvent();
    expect(scheduled.map(entry => entry.delay)).toEqual([10]);
    expect(stream.getStats().reconnects).toBe(1);

    await scheduled[0].run();
    expect(stream.getStats().connects).toBe(2);
    expect(stream.isConnected()).toBe(true);
  });

  test('stops reconnecting after maxAttempts', async () => {
    const source = createFakeLiveSource();
    const scheduled = [];
    const stream = createLiveReadSource({
      source,
      reconnect: {
        enabled: true,
        maxAttempts: 3,
        delays: [10, 20, 30],
        schedule: (run, delay) => {
          scheduled.push({ run, delay });
          return scheduled.length;
        },
        cancel: () => {}
      }
    });
    await stream.connect();
    // From here the source refuses every reconnect attempt.
    source.connectBehavior = 'fail';

    source.disconnectEvent();
    for (let index = 0; index < 3; index += 1) {
      const next = scheduled[index];
      expect(next).toBeDefined();
      await next.run();
    }
    expect(scheduled.map(entry => entry.delay)).toEqual([10, 20, 30]);
    expect(stream.getStats().reconnects).toBe(3);
    expect(stream.getStats().lastError).toBe('connect refused');
    expect(scheduled).toHaveLength(3);
  });

  test('reconnect is off by default', async () => {
    const source = createFakeLiveSource();
    const stream = createLiveReadSource({ source });
    await stream.connect();
    source.disconnectEvent();
    expect(stream.getStats().reconnects).toBe(0);
  });

  test('never touches the network', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('network must not be used');
    });
    try {
      const source = createFakeLiveSource();
      const stream = createLiveReadSource({ source });
      await stream.connect();
      source.chat('offline');
      await stream.read();
      await stream.close();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('follow detection reads only action and display type', () => {
    expect(isFollowSocial({ action: 1 })).toBe(true);
    expect(isFollowSocial({ action: 2 })).toBe(false);
    expect(isFollowSocial({ displayType: 'pm_mt_guidance_viewer_follow' })).toBe(true);
    expect(isFollowSocial({ displayType: 'pm_main_follow_message_viewer_2' })).toBe(true);
    expect(isFollowSocial({ common: { displayText: { displayType: 'follow_viewer_x' } } })).toBe(true);
    expect(isFollowSocial({ username: 'viewer_1' })).toBe(false);
    expect(toRawEvent('social', { action: 2 })).toBeNull();
    expect(toRawEvent('like', { count: 3 })).toBeNull();
    expect(DEFAULT_RECONNECT_DELAYS.length).toBeGreaterThan(0);
  });
});

describe('external key source', () => {
  test('reads keys from the environment and redacts them', () => {
    const result = resolveLiveReadKeys({
      env: { EULER_FALLBACK_API_KEY: 'euler_aaaa1111, euler_bbbb2222' }
    });
    expect(result).toEqual({
      keys: ['euler_aaaa1111', 'euler_bbbb2222'],
      source: 'env',
      configured: true
    });
    expect(JSON.stringify(describeKeySource(result))).not.toContain('euler_');
    expect(describeKeySource(result)).toEqual({ configured: true, source: 'env', count: 2 });
  });

  test('reads keys from an external file and never logs the location', () => {
    const result = resolveLiveReadKeys({
      keyFile: '/outside/repo/euler.key',
      readFileSync: () => 'euler_filekey123\n'
    });
    expect(result.keys).toEqual(['euler_filekey123']);
    expect(result.source).toBe('file');
    expect(JSON.stringify(describeKeySource(result))).not.toContain('euler_');
    expect(JSON.stringify(describeKeySource(result))).not.toContain('/outside/repo');
  });

  test('a missing file or empty environment is not an error and leaks nothing', () => {
    const missing = resolveLiveReadKeys({
      keyFile: '/outside/repo/euler.key',
      readFileSync: () => {
        throw new Error('ENOENT: /outside/repo/euler.key');
      }
    });
    expect(missing).toEqual({ keys: [], source: 'file-missing', configured: false });
    expect(JSON.stringify(missing)).not.toContain('/outside/repo');

    const empty = resolveLiveReadKeys({ env: {} });
    expect(empty).toEqual({ keys: [], source: 'env', configured: false });
  });

  test('redacts short and long keys without exposing them', () => {
    expect(redactKey('')).toBe('');
    expect(redactKey('short')).toBe('*****');
    expect(redactKey('euler_1234567890')).toBe('euler_...7890');
    expect(redactKey('euler_1234567890')).not.toContain('12345');
    expect(parseKeys(' a , b\nc ')).toEqual(['a', 'b', 'c']);
  });
});

describe('offline eulerstream fixture playback', () => {
  test('replays the fixture through the source and normalizes it', async () => {
    const result = await playEulerstreamFixture();
    expect(result.fixture).toBe(readFixture(FIXTURE_PATH).length);
    expect(result.replayed).toBe(8);
    expect(result.skipped).toBe(2);
    expect(result.normalized).toBe(8);
    expect(result.byType).toEqual({ chat: 5, gift: 2, follow: 1 });
    expect(result.sourceStats.connects).toBe(1);
    expect(JSON.stringify(result)).not.toContain('viewer_');
    expect(formatSummary(result)).toBe(
      '[live-read-eulerstream] fixture=10 replayed=8 skipped=2 normalized=8 '
      + 'types=chat=5,follow=1,gift=2'
    );
  });
});
