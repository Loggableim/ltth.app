'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const MediaCache = require('../plugins/music-bot/lib/media-cache');

describe('MediaCache external runner close polling', () => {
  let root;
  let cacheDir;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'music-bot-bounded-poll-'));
    cacheDir = path.join(root, 'cache');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('stops polling on timeout, keeps active ownership fail-closed, and retries cleanup after idle', async () => {
    let active = 1;
    let statusReads = 0;
    let runSignal;
    let partialFile;
    const runner = {
      childCloseTimeoutMs: 35,
      getStatus() {
        statusReads += 1;
        return { active, queued: 0 };
      },
      run(_executable, args, options) {
        runSignal = options.signal;
        const outputTemplate = args[args.indexOf('--output') + 1];
        partialFile = outputTemplate.replace('%(ext)s', 'part');
        fs.writeFileSync(partialFile, Buffer.from('partial-child-output'));
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      }
    };
    const cache = new MediaCache({ cacheDir }, { getPluginDataDir: () => root }, { runner });
    const download = cache.getOrDownload({ trackKey: 'test:late-close', url: 'https://example.invalid/item' });

    const startedAt = Date.now();
    await expect(cache.destroy()).rejects.toMatchObject({ code: 'YTDLP_CLOSE_TIMEOUT' });
    await expect(download).rejects.toThrow(/aborted/i);
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(runSignal.aborted).toBe(true);
    expect(active).toBe(1);
    expect(cache._deferredTemporaryPrefixes.size).toBe(1);
    expect(fs.existsSync(partialFile)).toBe(true);

    const readsAtTimeout = statusReads;
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(statusReads).toBe(readsAtTimeout);

    active = 0;
    await cache.destroy();
    expect(cache._runnerLifecycles.size).toBe(0);
    expect(cache._deferredTemporaryPrefixes.size).toBe(0);
    expect(fs.existsSync(partialFile)).toBe(false);

    const readsAfterRetry = statusReads;
    await cache.destroy();
    expect(statusReads).toBe(readsAfterRetry);
  });
  it('does not treat idle status as close until the external operation settles', async () => {
    let finishRun;
    let statusReads = 0;
    const runner = {
      childCloseTimeoutMs: 25,
      getStatus() {
        statusReads += 1;
        return { active: 0, queued: 0 };
      },
      run() {
        return new Promise((resolve) => { finishRun = resolve; });
      }
    };
    const cache = new MediaCache({ cacheDir }, { getPluginDataDir: () => root }, { runner });
    const download = cache.getOrDownload({ trackKey: 'test:operation-pending', url: 'https://example.invalid/item' });
    await new Promise((resolve) => setImmediate(resolve));
    expect([...cache._runnerLifecycles].every((entry) => !entry.settled)).toBe(true);

    await expect(cache.destroy()).rejects.toMatchObject({ code: 'YTDLP_CLOSE_TIMEOUT' });
    await expect(download).rejects.toThrow(/aborted/i);
    expect(cache._deferredTemporaryPrefixes.size).toBe(1);
    expect(statusReads).toBe(0);

    finishRun('');
    await cache.destroy();
    expect(cache._runnerLifecycles.size).toBe(0);
    expect(cache._deferredTemporaryPrefixes.size).toBe(0);
  });
});
