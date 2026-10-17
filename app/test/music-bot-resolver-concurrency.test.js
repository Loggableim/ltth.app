const { EventEmitter } = require('events');

const MusicResolver = require('../plugins/music-bot/lib/music-resolver');
const YtDlpRunner = require('../plugins/music-bot/lib/yt-dlp-runner');
const {
  deriveTrackIdentity,
  extractYouTubeId,
  providerFromTrack,
  normalizeRequestKey
} = require('../plugins/music-bot/lib/track-identity');

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.closed = false;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn(() => true);
  return child;
}

function finish(child, output = 'ok', code = 0) {
  if (output) child.stdout.emit('data', Buffer.from(output));
  child.exitCode = code;
  child.signalCode = code === null ? 'SIGKILL' : null;
  child.closed = true;
  child.emit('close', code, child.signalCode);
}

function youtubeSearch(entries) {
  return JSON.stringify({ entries });
}

function directYtDlp(data) {
  return ['0', 'channel-id', 'Channel', "['Music']", JSON.stringify(data)].join('\n');
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

  test('terminates a process that exceeds the configured combined output limit', async () => {
    const child = makeChild(8181);
    const processKill = jest.fn((_pid, signal) => {
      if (signal === 'SIGKILL') process.nextTick(() => finish(child, '', null));
    });
    const runner = new YtDlpRunner({
      maxConcurrent: 1,
      maxOutputBytes: 1024,
      platform: 'linux',
      processKill,
      spawnImpl: jest.fn(() => child)
    });

    const operation = runner.run('yt-dlp', ['verbose'], { deadline: Date.now() + 10000 });
    await flush();
    child.stderr.emit('data', Buffer.alloc(1025, 'x'));

    await expect(operation).rejects.toMatchObject({ code: 'YTDLP_OUTPUT_LIMIT' });
    expect(processKill).toHaveBeenCalledWith(-8181, 'SIGTERM');
    expect(runner.getStatus()).toMatchObject({ active: 0, queued: 0 });
  });

  test('aborting queued work never spawns it', async () => {
    const children = [];
    const runner = new YtDlpRunner({
      maxConcurrent: 1,
      platform: 'linux',
      processKill: jest.fn(),
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
      platform: 'linux',
      processKill: jest.fn((_pid, signal) => {
        if (signal === 'SIGKILL') process.nextTick(() => finish(children[0], '', null));
      }),
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
    child.kill.mockImplementation(() => {
      process.nextTick(() => finish(child, '', null));
      return true;
    });
    const runner = new YtDlpRunner({
      platform: 'win32',
      childCloseTimeoutMs: 50,
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

  test('waits for a delayed child close after successful Windows taskkill', async () => {
    const taskkill = new EventEmitter();
    const child = makeChild(4343);
    const runner = new YtDlpRunner({
      platform: 'win32',
      childCloseTimeoutMs: 100,
      spawnImpl: jest.fn(() => child),
      taskkillImpl: jest.fn(() => taskkill)
    });
    const operation = runner.run('yt-dlp', ['track'], { deadline: Date.now() + 10000 });
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await flush();

    const destroying = runner.destroy();
    taskkill.emit('close', 0);
    await flush();
    expect(runner.getStatus().active).toBe(1);
    expect(child.kill).not.toHaveBeenCalled();

    setTimeout(() => finish(child, '', null), 20);
    await Promise.all([destroying, rejected]);
    expect(runner.getStatus()).toMatchObject({ active: 0, queued: 0, destroyed: true });
  });

  test('bounds a child that never closes and retries the owned-child kill once', async () => {
    const taskkill = new EventEmitter();
    const child = makeChild(4444);
    const logger = { log: jest.fn() };
    const spawnImpl = jest.fn(() => child);
    const controller = new AbortController();
    const runner = new YtDlpRunner({
      platform: 'win32',
      maxConcurrent: 1,
      childCloseTimeoutMs: 20,
      logger,
      spawnImpl,
      taskkillImpl: jest.fn(() => {
        process.nextTick(() => taskkill.emit('error', new Error('fixture taskkill failure')));
        return taskkill;
      })
    });
    const operation = runner.run('yt-dlp', ['active'], {
      deadline: Date.now() + 10000,
      signal: controller.signal
    });
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    const queued = runner.run('yt-dlp', ['queued'], { deadline: Date.now() + 10000 });
    const queuedRejected = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    await flush();

    const startedAt = Date.now();
    controller.abort();
    await rejected;

    expect(Date.now() - startedAt).toBeLessThan(250);
    expect(child.kill).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenCalledWith(
      '[music-bot] yt-dlp child close was not confirmed (YTDLP_CLOSE_TIMEOUT)',
      'warn'
    );
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(runner.getStatus()).toMatchObject({ active: 1, queued: 1, destroyed: false });

    await expect(runner.destroy()).rejects.toMatchObject({ code: 'YTDLP_CLOSE_TIMEOUT' });
    await queuedRejected;
    expect(runner.getStatus()).toMatchObject({ active: 1, queued: 0, destroyed: true });

    finish(child, '', null);
    expect(runner.getStatus()).toMatchObject({ active: 0, queued: 0, destroyed: true });
    await expect(runner.destroy()).resolves.toBeUndefined();
  });

  test('duplicate abort and destroy share one termination and one close wait', async () => {
    const taskkill = new EventEmitter();
    const child = makeChild(4545);
    const controller = new AbortController();
    const taskkillImpl = jest.fn(() => taskkill);
    const runner = new YtDlpRunner({
      platform: 'win32',
      childCloseTimeoutMs: 100,
      spawnImpl: jest.fn(() => child),
      taskkillImpl
    });
    const operation = runner.run('yt-dlp', ['track'], {
      deadline: Date.now() + 10000,
      signal: controller.signal
    });
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await flush();

    controller.abort();
    await flush();
    const destroying = runner.destroy();
    expect(taskkillImpl).toHaveBeenCalledTimes(1);
    taskkill.emit('close', 0);
    await flush();
    finish(child, '', null);

    await Promise.all([destroying, rejected]);
    expect(taskkillImpl).toHaveBeenCalledTimes(1);
    expect(runner.getStatus()).toMatchObject({ active: 0, queued: 0, destroyed: true });
  });

  test('POSIX cancellation spawns a dedicated process group and kills the full group', async () => {
    const child = makeChild(5151);
    const processKill = jest.fn((_pid, signal) => {
      if (signal === 'SIGKILL') process.nextTick(() => finish(child, '', null));
    });
    const spawnImpl = jest.fn(() => child);
    const runner = new YtDlpRunner({
      platform: 'linux',
      spawnImpl,
      processKill
    });

    const operation = runner.run('yt-dlp', ['track'], { deadline: Date.now() + 10000 });
    await flush();
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await runner.destroy();
    await rejected;

    expect(spawnImpl).toHaveBeenCalledWith(
      'yt-dlp',
      ['track'],
      expect.objectContaining({ detached: true })
    );
    expect(processKill).toHaveBeenCalledWith(-5151, 'SIGKILL');
    expect(child.kill).not.toHaveBeenCalled();
  });

  test('destroy waits for an already-running process-tree termination', async () => {
    const taskkill = new EventEmitter();
    const child = makeChild(9001);
    const controller = new AbortController();
    const runner = new YtDlpRunner({
      platform: 'win32',
      childCloseTimeoutMs: 100,
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
    finish(child, '', null);
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

  test('does not report an oEmbed-only YouTube URL as a playable song when yt-dlp is unavailable', async () => {
    const missingYtDlp = new Error('yt-dlp missing');
    missingYtDlp.ytdlpNotFound = true;
    const { resolver } = createResolver(async () => { throw missingYtDlp; });
    resolver._getJson = jest.fn(async () => ({
      title: 'Metadata only',
      author_name: 'Artist'
    }));

    const result = await resolver.resolve('https://www.youtube.com/watch?v=abc123def45');

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'resolver_unavailable',
      message: expect.stringContaining('yt-dlp')
    }));
    expect(result.song).toBeUndefined();
  });

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

  test.each([
    ['is_live flag and unknown duration', { is_live: true, live_status: 'is_live', duration: null }, 'live_stream_unsupported'],
    ['was_live flag with finite duration', { was_live: true, duration: 240 }, 'live_stream_unsupported'],
    ['upcoming live status with finite duration', { live_status: 'is_upcoming', duration: 240 }, 'live_stream_unsupported'],
    ['post-live status with finite duration', { live_status: 'post_live', duration: 240 }, 'live_stream_unsupported'],
    ['missing duration without live flags', { duration: null }, 'unknown_duration'],
    ['infinite duration without live flags', { duration: Infinity }, 'unknown_duration']
  ])('rejects direct live or unbounded metadata (%s)', async (_label, metadata, reason) => {
    const { resolver } = createResolver(async () => directYtDlp({
      id: 'direct-live-01',
      title: 'Direct Live Track',
      uploader: 'Artist',
      duration: 180,
      extractor: 'youtube',
      webpage_url: 'https://www.youtube.com/watch?v=direct-live-01',
      ...metadata
    }));

    await expect(resolver.resolve('https://www.youtube.com/watch?v=direct-live-01'))
      .resolves.toMatchObject({ success: false, reason });
  });

  test('search skips live candidates but selects an ordinary finite track', async () => {
    const { resolver, runner } = createResolver(async (_executable, args) => {
      expect(args.at(-1)).toBe('ytsearch5:artist song');
      return youtubeSearch([
        {
          id: 'live-track', title: 'Artist Song', uploader: 'Artist', duration: null,
          is_live: true, live_status: 'is_live', extractor: 'youtube',
          webpage_url: 'https://www.youtube.com/watch?v=live-track'
        },
        {
          id: 'was-live-track', title: 'Artist Song', uploader: 'Artist', duration: 180,
          was_live: true, live_status: 'was_live', extractor: 'youtube',
          webpage_url: 'https://www.youtube.com/watch?v=was-live-track'
        },
        {
          id: 'finite-track', title: 'Artist Song', uploader: 'Artist', duration: 180,
          is_live: false, was_live: false, live_status: 'not_live', extractor: 'youtube',
          webpage_url: 'https://www.youtube.com/watch?v=finite-track'
        }
      ]);
    });

    const result = await resolver.resolve('artist song');

    expect(result).toMatchObject({ success: true, song: { trackKey: 'youtube:finite-track', duration: 180 } });
    expect(runner.run).toHaveBeenCalledTimes(1);
  });

  test('accepts direct finite metadata explicitly marked not_live', async () => {
    const { resolver } = createResolver(async () => directYtDlp({
      id: 'finite-direct-01',
      title: 'Finite Direct Track',
      uploader: 'Artist',
      duration: 180,
      live_status: 'not_live',
      is_live: false,
      was_live: false,
      extractor: 'youtube',
      webpage_url: 'https://www.youtube.com/watch?v=finite-direct-01'
    }));

    await expect(resolver.resolve('https://www.youtube.com/watch?v=finite-direct-01'))
      .resolves.toMatchObject({ success: true, song: { trackKey: 'youtube:finite-direct-01', duration: 180 } });
  });

  test('preserves provider album, BPM, and genre metadata for the catalog', () => {
    const { resolver } = createResolver(async () => '');

    const song = resolver._songFromData({
      id: 'metadata-id',
      title: 'Metadata Song',
      uploader: 'Artist',
      duration: 180,
      extractor: 'youtube',
      webpage_url: 'https://www.youtube.com/watch?v=metadata-id',
      album: 'Neon Roads',
      upload_date: '19981008',
      bpm: 127.5,
      genres: ['Electronic', 'Dance'],
      categories: ['Music']
    });

    expect(song).toMatchObject({
      album: 'Neon Roads',
      bpm: 127.5,
      genres: ['Electronic', 'Dance'],
      releaseYear: 1998,
      categories: ['Music']
    });
  });

  test.each([
    ['https://www.youtube.com/live/AbC123xYz_-?si=share', 'AbC123xYz_-'],
    ['https://www.youtube-nocookie.com/embed/NoCookie123', 'NoCookie123']
  ])('resolves supported YouTube URL aliases directly: %s', async (url, videoId) => {
    const output = [
      '0',
      'channel-id',
      'Channel',
      "['Music']",
      JSON.stringify({
        id: videoId,
        title: 'Direct song',
        uploader: 'Artist',
        duration: 180,
        extractor: 'youtube',
        webpage_url: url
      })
    ].join('\n');
    const { resolver, runner } = createResolver(async () => output);

    const result = await resolver.resolve(url);

    expect(result.song.trackKey).toBe(`youtube:${videoId}`);
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(runner.run.mock.calls[0][1].at(-1)).toBe(url);
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

  test('uses the configured resolver timeout and max concurrent process limit', async () => {
    const runner = {
      maxConcurrent: 1,
      run: jest.fn(async () => youtubeSearch([{
        id: 'timeout-track',
        title: 'Timeout Track',
        uploader: 'Artist',
        duration: 180,
        extractor: 'youtube',
        webpage_url: 'https://www.youtube.com/watch?v=timeout-track'
      }])),
      destroy: jest.fn(async () => {}),
      getStatus: jest.fn(() => ({ active: 0, queued: 0 }))
    };
    const resolver = new MusicResolver({
      ytdlpPath: 'yt-dlp',
      searchTimeout: 12000,
      maxConcurrentProcesses: 3
    }, { log: jest.fn() }, { runner });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);

    try {
      const result = await resolver.resolve('timeout track');

      expect(result.success).toBe(true);
      expect(resolver.config.searchTimeout).toBe(12000);
      expect(runner.maxConcurrent).toBe(3);
      expect(runner.run.mock.calls[0][2].deadline).toBe(9000);
    } finally {
      now.mockRestore();
    }
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
  test.each([
    ['https://www.youtube.com/live/AbC123xYz_-?si=share', 'AbC123xYz_-'],
    ['https://www.youtube-nocookie.com/embed/NoCookie123', 'NoCookie123']
  ])('recognizes YouTube aliases in shared identity helpers: %s', (url, videoId) => {
    expect(extractYouTubeId(url)).toBe(videoId);
    expect(providerFromTrack({ url })).toBe('youtube');
    expect(deriveTrackIdentity({ url })).toMatchObject({
      provider: 'youtube',
      providerId: videoId,
      trackKey: `youtube:${videoId}`,
      youtubeId: videoId
    });
  });

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

describe('music resolver moderation default isolation', () => {
  test.each([
    ['omitted moderation', {}],
    ['partial moderation', { moderation: { rejectExplicit: true } }]
  ])('does not share default blockedKeywords across resolver instances with %s', async (_label, config) => {
    const createRunner = () => ({
      run: jest.fn(),
      destroy: jest.fn(async () => {}),
      getStatus: jest.fn(() => ({}))
    });
    const resolverA = new MusicResolver(config, { log: jest.fn() }, { runner: createRunner() });
    const resolverB = new MusicResolver(config, { log: jest.fn() }, { runner: createRunner() });

    try {
      expect(resolverA.config.moderation.blockedKeywords)
        .not.toBe(resolverB.config.moderation.blockedKeywords);
      resolverA.config.moderation.blockedKeywords.push('profile-a-only');
      expect(resolverB.config.moderation.blockedKeywords).toEqual([]);
      if (config.moderation) {
        expect(resolverB.config.moderation.rejectExplicit).toBe(true);
      }
    } finally {
      await Promise.all([resolverA.destroy(), resolverB.destroy()]);
    }
  });
});
