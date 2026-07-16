const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MediaCache = require('../plugins/music-bot/lib/media-cache');

function createApi(dataDir) {
  return {
    getPluginDataDir: () => dataDir,
    log: jest.fn()
  };
}

function createSuccessfulSpawn(bytes = Buffer.from('audio')) {
  const spawn = jest.fn((_command, args) => {
    const child = new EventEmitter();
    child.pid = 1234;
    child.exitCode = null;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn(() => true);
    process.nextTick(() => {
      const outputTemplate = args[args.indexOf('--output') + 1];
      const outputPath = outputTemplate.replace('%(ext)s', 'webm');
      fs.writeFileSync(outputPath, bytes);
      child.stdout.emit('data', Buffer.from(`${outputPath}\n`));
      child.exitCode = 0;
      child.emit('close', 0);
    });
    return child;
  });
  return spawn;
}

describe('music-bot media cache', () => {
  let dataDir;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'music-bot-cache-'));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('downloads a track key once and finds it from a new cache instance', async () => {
    const spawn = createSuccessfulSpawn();
    const cache = new MediaCache({}, createApi(dataDir), { spawn });

    const [first, second] = await Promise.all([
      cache.getOrDownload({ trackKey: 'youtube:abc', url: 'https://youtu.be/abc' }),
      cache.getOrDownload({ trackKey: 'youtube:abc', url: 'https://youtube.com/watch?v=abc' })
    ]);

    expect(first).toBe(second);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(first, 'utf8')).toBe('audio');

    const restarted = new MediaCache({}, createApi(dataDir), { spawn: jest.fn() });
    expect(restarted.get('youtube:abc')).toBe(first);
    await restarted.destroy();
    await cache.destroy();
  });

  it('prunes expired files before least-recently-used files by actual bytes and preserves pins', async () => {
    let now = 1_000_000;
    const cache = new MediaCache({ cacheTTLDays: 1, maxCacheSizeMB: 0.00001 }, createApi(dataDir), {
      now: () => now,
      spawn: createSuccessfulSpawn(Buffer.alloc(6))
    });
    const expired = await cache.getOrDownload({ trackKey: 'youtube:expired', url: 'https://youtu.be/expired' });
    now += 2 * 24 * 60 * 60 * 1000;
    const pinned = await cache.getOrDownload({ trackKey: 'youtube:pinned', url: 'https://youtu.be/pinned' });
    cache.pin('youtube:pinned');
    now += 1;
    const recent = await cache.getOrDownload({ trackKey: 'youtube:recent', url: 'https://youtu.be/recent' });

    const result = await cache.prune();

    expect(fs.existsSync(expired)).toBe(false);
    expect(fs.existsSync(pinned)).toBe(true);
    expect(fs.existsSync(recent)).toBe(false);
    expect(result.bytes).toBe(6);
    await cache.destroy();
  });

  it('does not publish failed or aborted work', async () => {
    const spawn = jest.fn(() => {
      const child = new EventEmitter();
      child.pid = 2222;
      child.exitCode = null;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = jest.fn(() => true);
      process.nextTick(() => {
        child.stderr.emit('data', Buffer.from('failed'));
        child.exitCode = 1;
        child.emit('close', 1);
      });
      return child;
    });
    const cache = new MediaCache({}, createApi(dataDir), { spawn });

    await expect(cache.getOrDownload({
      trackKey: 'youtube:failed',
      url: 'https://youtu.be/failed'
    })).rejects.toThrow(/failed/i);
    expect(cache.get('youtube:failed')).toBeNull();
    await cache.destroy();
  });

  it('aborts an in-flight download without publishing a cache hit', async () => {
    const spawn = jest.fn(() => {
      const child = new EventEmitter();
      child.pid = 2223;
      child.exitCode = null;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = jest.fn(() => true);
      return child;
    });
    const cache = new MediaCache({}, createApi(dataDir), { spawn });
    const controller = new AbortController();
    const pending = cache.getOrDownload({
      trackKey: 'youtube:aborted',
      url: 'https://youtu.be/aborted'
    }, { signal: controller.signal });

    controller.abort();

    await expect(pending).rejects.toThrow(/aborted/i);
    expect(cache.get('youtube:aborted')).toBeNull();
    expect(spawn.mock.results[0].value.kill).toHaveBeenCalledWith('SIGKILL');
    await cache.destroy();
  });

  it('destroy settles even when a child process never closes', async () => {
    const spawn = jest.fn(() => {
      const child = new EventEmitter();
      child.pid = 3333;
      child.exitCode = null;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = jest.fn(() => true);
      return child;
    });
    const cache = new MediaCache({}, createApi(dataDir), { spawn });
    const pending = cache.getOrDownload({
      trackKey: 'youtube:hung',
      url: 'https://youtu.be/hung'
    });

    await expect(Promise.race([
      cache.destroy().then(() => 'destroyed'),
      new Promise((resolve) => setTimeout(() => resolve('timed-out'), 250))
    ])).resolves.toBe('destroyed');
    await expect(pending).rejects.toThrow(/destroyed|aborted/i);
    expect(cache.get('youtube:hung')).toBeNull();
  });

  it('rejects instead of returning a path pruned by the configured byte limit', async () => {
    const cache = new MediaCache({ maxCacheSizeMB: 0.000001 }, createApi(dataDir), {
      spawn: createSuccessfulSpawn(Buffer.alloc(4))
    });
    const result = await Promise.race([
      cache.getOrDownload({
        trackKey: 'youtube:too-large',
        url: 'https://youtu.be/too-large'
      }).then(() => 'resolved', () => 'rejected'),
      new Promise((resolve) => setTimeout(() => resolve('timed-out'), 250))
    ]);

    expect(result).toBe('rejected');
    expect(cache.get('youtube:too-large')).toBeNull();
    await cache.destroy();
  });
});
