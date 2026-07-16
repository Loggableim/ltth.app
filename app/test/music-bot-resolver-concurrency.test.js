const { EventEmitter } = require('events');

const MusicResolver = require('../plugins/music-bot/lib/music-resolver');
const YtDlpRunner = require('../plugins/music-bot/lib/yt-dlp-runner');
const {
  deriveTrackIdentity,
  normalizeRequestKey
} = require('../plugins/music-bot/lib/track-identity');

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn(() => true);
  return child;
}

function finish(child, output = 'ok', code = 0) {
  if (output) child.stdout.emit('data', Buffer.from(output));
  child.emit('close', code);
}

function youtubeSearch(entries) {
  return JSON.stringify({ entries });
}

describe('YtDlpRunner concurrency and cancellation', () => {
  test('caps active processes at two and queues a third operation', async () => {
    const children = [];
    const runner = new YtDlpRunner({
      maxConcurrent: 2,
      spawnImpl: jest.fn(() => {
        const child = makeChild(children.length + 1);
        children.push(child);
        return child;
      })
    });

    const deadline = Date.now() + 10000;
    const first = runner.run('yt-dlp', ['one'], { deadline });
    const second = runner.run('yt-dlp', ['two'], { deadline });
    const third = runner.run('yt-dlp', ['three'], { deadline });
    await flush();

    expect(children).toHaveLength(2);
    expect(runner.getStatus()).toMatchObject({ active: 2, queued: 1 });

    finish(children[0], 'first');
    await flush();
    expect(children).toHaveLength(3);
    finish(children[1], 'second');
    finish(children[2], 'third');

    await expect(Promise.all([first, second, third])).resolves.toEqual(['first', 'second', 'third']);
    await runner.destroy();
  });

  test('aborting queued work never spawns it', async () => {
    const children = [];
    const runner = new YtDlpRunner({
      maxConcurrent: 1,
      spawnImpl: jest.fn(() => {
        const child = makeChild(children.length + 1);
        children.push(child);
        return child;
      })
    });
    const deadline = Date.now() + 10000;
    const first = runner.run('yt-dlp', ['one'], { deadline });
    const controller = new AbortController();
    const queued = runner.run('yt-dlp', ['queued'], { deadline, signal: controller.signal });
    controller.abort();

    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    finish(children[0], 'first');
    await expect(first).resolves.toBe('first');
    await flush();
    expect(children).toHaveLength(1);
    await runner.destroy();
  });

  test('destroy cancels active and queued work and clears runner state', async () => {
    const children = [];
    const runner = new YtDlpRunner({
      maxConcurrent: 1,
      spawnImpl: jest.fn(() => {
        const child = makeChild(children.length + 1);
        children.push(child);
        return child;
      })
    });
    const deadline = Date.now() + 10000;
    const active = runner.run('yt-dlp', ['active'], { deadline });
    const queued = runner.run('yt-dlp', ['queued'], { deadline });
    await flush();

    const activeRejected = expect(active).rejects.toMatchObject({ name: 'AbortError' });
    const queuedRejected = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    const destroyed = runner.destroy();
    finish(children[0], '', null);
    await Promise.all([destroyed, activeRejected, queuedRejected]);
    expect(runner.getStatus()).toMatchObject({ active: 0, queued: 0, destroyed: true });
  });

  test('Windows tree cancellation invokes taskkill and falls back to direct kill', async () => {
    const taskkill = new EventEmitter();
    const child = makeChild(4242);
    const runner = new YtDlpRunner({
      platform: 'win32',
      spawnImpl: jest.fn(() => child),
      taskkillImpl: jest.fn(() => {
        process.nextTick(() => taskkill.emit('error', new Error('taskkill unavailable')));
        return taskkill;
      })
    });

    const operation = runner.run('yt-dlp', ['track'], { deadline: Date.now() + 10000 });
    await flush();
    await runner.destroy();
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });

    expect(runner.taskkillImpl).toHaveBeenCalledWith(
      'taskkill.exe',
      ['/PID', '4242', '/T', '/F'],
      expect.objectContaining({ windowsHide: true })
    );
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  test('destroy waits for an already-running process-tree termination', async () => {
    const taskkill = new EventEmitter();
    const child = makeChild(9001);
    const controller = new AbortController();
    const runner = new YtDlpRunner({
      platform: 'win32',
      spawnImpl: jest.fn(() => child),
      taskkillImpl: jest.fn(() => taskkill)
    });
    const operation = runner.run('yt-dlp', ['track'], {
      deadline: Date.now() + 10000,
      signal: controller.signal
    });
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await flush();

    controller.abort();
    await flush();
    let destroyed = false;
    const destroying = runner.destroy().then(() => { destroyed = true; });
    await flush();

    expect(destroyed).toBe(false);
    expect(runner.getStatus().active).toBe(1);
    expect(runner.taskkillImpl).toHaveBeenCalledTimes(1);

    taskkill.emit('close', 0);
    await Promise.all([destroying, rejected]);
    expect(runner.getStatus()).toMatchObject({ active: 0, queued: 0, destroyed: true });
  });
});

describe('MusicResolver provider cascade and subscribers', () => {
  function createResolver(run) {
    const runner = {
      run: jest.fn(run),
      destroy: jest.fn(async () => {}),
      getStatus: jest.fn(() => ({ active: 0, queued: 0 }))
    };
    const progress = jest.fn();
    const resolver = new MusicResolver(
      { ytdlpPath: 'yt-dlp', searchTimeout: 45000 },
      { log: jest.fn() },
      { runner, onProgress: progress }
    );
    return { resolver, runner, progress };
  }

  test('equivalent concurrent text requests share one yt-dlp operation', async () => {
    let release;
    const output = youtubeSearch([{ id: 'abc', title: 'Artist Song', uploader: 'Artist', duration: 180,
      extractor: 'youtube', webpage_url: 'https://www.youtube.com/watch?v=abc' }]);
    const { resolver, runner } = createResolver(() => new Promise((resolve) => { release = () => resolve(output); }));

    const first = resolver.resolve('  ARTIST   song ');
    const second = resolver.resolve('artist song');
    await flush();
    expect(runner.run).toHaveBeenCalledTimes(1);
    release();

    const [a, b] = await Promise.all([first, second]);
    expect(a.song.trackKey).toBe('youtube:abc');
    expect(b).toEqual(a);
    expect(resolver.getResolverStatus().inFlight).toBe(0);
  });

  test('one subscriber abort does not cancel another, while all subscribers abort once', async () => {
    let underlyingSignal;
    let abortEvents = 0;
    const { resolver, runner } = createResolver((_executable, _args, options) => {
      underlyingSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          abortEvents += 1;
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    });
    const one = new AbortController();
    const two = new AbortController();
    const first = resolver.resolve('same song', { signal: one.signal });
    const second = resolver.resolve(' same   song ', { signal: two.signal });
    await flush();

    one.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(underlyingSignal.aborted).toBe(false);

    two.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(underlyingSignal.aborted).toBe(true);
    expect(abortEvents).toBe(1);
    expect(runner.run).toHaveBeenCalledTimes(1);
  });

  test('direct supported URLs bypass the text provider cascade', async () => {
    const output = [
      '0',
      'channel-id',
      'Channel',
      "['Music']",
      JSON.stringify({
        id: 'direct-id',
        title: 'Direct song',
        uploader: 'Artist',
        duration: 180,
        extractor: 'youtube',
        webpage_url: 'https://www.youtube.com/watch?v=direct-id'
      })
    ].join('\n');
    const { resolver, runner } = createResolver(async () => output);

    const result = await resolver.resolve('https://www.youtube.com/watch?v=direct-id');

    expect(result.song.trackKey).toBe('youtube:direct-id');
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(runner.run.mock.calls[0][1].at(-1)).toBe('https://www.youtube.com/watch?v=direct-id');
  });

  test('YouTube success skips SoundCloud and reports progress', async () => {
    const { resolver, runner, progress } = createResolver(async (_executable, args) => {
      expect(args).toContain('ytsearch5:artist song');
      return youtubeSearch([{ id: 'yt1', title: 'Song', artist: 'Artist', duration: 200,
        extractor: 'youtube', webpage_url: 'https://youtube.com/watch?v=yt1' }]);
    });

    const result = await resolver.resolve('Artist Song');

    expect(result.song.trackKey).toBe('youtube:yt1');
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(progress.mock.calls.map(([event]) => event.state)).toEqual(expect.arrayContaining([
      'queued', 'searching-youtube', 'validating', 'ready'
    ]));
  });

  test('invalid YouTube candidates fall back to SoundCloud without youtubeId leakage', async () => {
    const { resolver, runner } = createResolver(async (_executable, args) => {
      const target = args.at(-1);
      if (target.startsWith('ytsearch5:')) {
        return youtubeSearch([{ id: 'same', title: 'Wrong', uploader: 'Other', duration: 0,
          extractor: 'youtube', webpage_url: 'https://youtube.com/watch?v=same' }]);
      }
      expect(target).toBe('scsearch5:artist song');
      return youtubeSearch([{ id: 'same', title: 'Artist Song', uploader: 'Artist', duration: 180,
        extractor: 'soundcloud', webpage_url: 'https://soundcloud.com/artist/song' }]);
    });

    const result = await resolver.resolve('artist song');

    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(result.song).toMatchObject({
      source: 'soundcloud', youtubeId: null, provider: 'soundcloud', trackKey: 'soundcloud:same'
    });
  });

  test('provider deadlines use one absolute 45 second budget', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValue(30000);
    const { resolver, runner } = createResolver(async (_executable, args) => {
      if (args.at(-1).startsWith('ytsearch5:')) return youtubeSearch([]);
      return youtubeSearch([{ id: 'sc', title: 'Artist Song', uploader: 'Artist', duration: 180,
        extractor: 'soundcloud', webpage_url: 'https://soundcloud.com/artist/song' }]);
    });
    try {
      await resolver.resolve('artist song');
      expect(runner.run.mock.calls[0][2].deadline).toBe(31000);
      expect(runner.run.mock.calls[1][2].deadline).toBe(46000);
    } finally {
      now.mockRestore();
    }
  });

  test('destroy cancels all shared operations and clears in-flight state', async () => {
    const { resolver } = createResolver((_executable, _args, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));
    const operation = resolver.resolve('never finishes');
    await flush();

    await resolver.destroy();
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    expect(resolver.getResolverStatus()).toMatchObject({ inFlight: 0, destroyed: true });
  });

  test('last-subscriber abort atomically detaches stale work from a new equivalent request', async () => {
    const releases = [];
    const { resolver, runner } = createResolver(() => new Promise((resolve) => releases.push(resolve)));
    const controller = new AbortController();
    const stale = resolver.resolve('artist song', { signal: controller.signal });
    const staleRejected = expect(stale).rejects.toMatchObject({ name: 'AbortError' });
    await flush();

    controller.abort();
    await staleRejected;
    const fresh = resolver.resolve(' ARTIST   SONG ');
    await flush();

    expect(runner.run).toHaveBeenCalledTimes(2);
    releases[1](youtubeSearch([{ id: 'fresh', title: 'Artist Song', uploader: 'Artist', duration: 180,
      extractor: 'youtube', webpage_url: 'https://youtube.com/watch?v=fresh' }]));
    await expect(fresh).resolves.toMatchObject({ song: { trackKey: 'youtube:fresh' } });

    releases[0](youtubeSearch([{ id: 'stale', title: 'Artist Song', uploader: 'Artist', duration: 180,
      extractor: 'youtube', webpage_url: 'https://youtube.com/watch?v=stale' }]));
    await flush();
    await expect(resolver.resolve('artist song')).resolves.toMatchObject({ song: { trackKey: 'youtube:fresh' } });
    expect(runner.run).toHaveBeenCalledTimes(2);
  });

  test('rejects metadata-only candidates without any playable locator', async () => {
    const { resolver, runner } = createResolver(async (_executable, args) => {
      if (args.at(-1).startsWith('ytsearch5:')) {
        return youtubeSearch([{ title: 'Artist Song', uploader: 'Artist', duration: 180, extractor: 'youtube' }]);
      }
      return youtubeSearch([{ id: 'playable', title: 'Artist Song', uploader: 'Artist', duration: 180,
        extractor: 'soundcloud', webpage_url: 'https://soundcloud.com/artist/song' }]);
    });

    const result = await resolver.resolve('artist song');

    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(result.song.trackKey).toBe('soundcloud:playable');
  });

  test('materializes a canonical watch URL for a validated YouTube id', async () => {
    const { resolver, runner } = createResolver(async () => youtubeSearch([{
      id: 'dQw4w9WgXcQ',
      title: 'Artist Song',
      uploader: 'Artist',
      duration: 180,
      extractor: 'youtube'
    }]));

    const result = await resolver.resolve('artist song');

    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(result.song).toMatchObject({
      trackKey: 'youtube:dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });
  });

  test('rejects an opaque SoundCloud id when no playable locator exists', async () => {
    const { resolver, runner } = createResolver(async (_executable, args) => {
      if (args.at(-1).startsWith('ytsearch5:')) return youtubeSearch([]);
      return youtubeSearch([{
        id: 'opaque-soundcloud-id',
        title: 'Artist Song',
        uploader: 'Artist',
        duration: 180,
        extractor: 'soundcloud'
      }]);
    });

    const result = await resolver.resolve('artist song');

    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ success: false, reason: 'not_found' });
  });
});

describe('track identity and resolver memory cache', () => {
  test('cross-provider equal ids have distinct canonical keys', () => {
    expect(deriveTrackIdentity({ id: 'same', extractor: 'youtube' }).trackKey).toBe('youtube:same');
    expect(deriveTrackIdentity({ id: 'same', extractor: 'soundcloud', webpage_url: 'https://soundcloud.com/a/b' }))
      .toMatchObject({ trackKey: 'soundcloud:same', youtubeId: null });
    expect(normalizeRequestKey('  ARTIST   Song ')).toBe('artist song');
  });

  test('legacy youtubeId and raw SoundCloud URLs retain canonical provider identity', () => {
    expect(deriveTrackIdentity({ youtubeId: 'legacy-video' })).toMatchObject({
      provider: 'youtube', providerId: 'legacy-video', trackKey: 'youtube:legacy-video', youtubeId: 'legacy-video'
    });
    expect(deriveTrackIdentity('https://soundcloud.com/Artist/Track?utm_source=test')).toMatchObject({
      provider: 'soundcloud',
      providerId: 'soundcloud.com/artist/track',
      trackKey: 'soundcloud:soundcloud.com/artist/track',
      youtubeId: null
    });
    expect(deriveTrackIdentity({
      extractor: 'soundcloud',
      id: 'https://soundcloud.com/Artist/Track?si=tracking'
    }).trackKey).toBe('soundcloud:soundcloud.com/artist/track');
  });

  test('cache replacement does not overcount and invalid limits use safe defaults', () => {
    const resolver = new MusicResolver(
      { ytdlpPath: 'yt-dlp', cacheTTLDays: 0, maxCacheSizeMB: -1 },
      { log: jest.fn() },
      { runner: { run: jest.fn(), destroy: jest.fn(async () => {}), getStatus: jest.fn(() => ({})) } }
    );
    expect(resolver.config.cacheTTLDays).toBe(30);
    expect(resolver.config.maxCacheSizeMB).toBe(2048);

    resolver._addToCache('Same Key', { success: true, song: { title: 'one' } });
    resolver._addToCache(' same   key ', { success: true, song: { title: 'a much longer replacement' } });
    const entries = [...resolver.cache.values()];
    expect(entries).toHaveLength(1);
    expect(resolver.cacheSizeBytes).toBe(entries[0].size);
  });
});
