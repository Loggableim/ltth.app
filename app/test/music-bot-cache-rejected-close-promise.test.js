'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const MediaCache = require('../plugins/music-bot/lib/media-cache');

test('keeps temporary files when childClosed rejects and retries after status confirms idle', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'music-bot-rejected-close-'));
  const cacheDir = path.join(root, 'cache');
  let active = 1;
  let partialFile;
  const runner = {
    childCloseTimeoutMs: 40,
    getStatus: () => ({ active, queued: 0 }),
    run(_executable, args, options) {
      partialFile = args[args.indexOf('--output') + 1].replace('%(ext)s', 'part');
      fs.writeFileSync(partialFile, Buffer.from('still-owned-by-running-child'));
      const operation = new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
      operation.childClosed = Promise.reject(new Error('close not confirmed'));
      return operation;
    }
  };
  const cache = new MediaCache({ cacheDir }, { getPluginDataDir: () => root }, { runner });
  const download = cache.getOrDownload({ trackKey: 'test:rejected-child-close', url: 'https://example.invalid/item' });
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await expect(cache.destroy()).rejects.toMatchObject({ code: 'YTDLP_CLOSE_TIMEOUT' });
    await expect(download).rejects.toThrow(/aborted/i);
    expect(active).toBe(1);
    expect(cache._runnerLifecycles.size).toBe(1);
    expect(cache._deferredTemporaryPrefixes.size).toBe(1);
    expect(fs.existsSync(partialFile)).toBe(true);

    active = 0;
    await cache.destroy();
    expect(cache._runnerLifecycles.size).toBe(0);
    expect(cache._deferredTemporaryPrefixes.size).toBe(0);
    expect(fs.existsSync(partialFile)).toBe(false);
    await new Promise((resolve) => setImmediate(resolve));
    expect(unhandled).toEqual([]);
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
    active = 0;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
