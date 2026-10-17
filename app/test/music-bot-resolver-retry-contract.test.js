'use strict';

const MusicResolver = require('../plugins/music-bot/lib/music-resolver');

function searchResult(entries) {
  return JSON.stringify({ entries });
}

function createResolver(run) {
  const runner = {
    run: jest.fn(run),
    destroy: jest.fn(async () => {}),
    getStatus: jest.fn(() => ({ active: 0, queued: 0 }))
  };
  const resolver = new MusicResolver(
    { ytdlpPath: 'mock-yt-dlp', searchTimeout: 45000 },
    { log: jest.fn() },
    { runner }
  );
  return { resolver, runner };
}

describe('MusicResolver retry contract', () => {
  test('retries a transient provider failure once, then falls through to the next provider', async () => {
    const transient = Object.assign(new Error('temporary provider failure'), { code: 'ECONNRESET' });
    const { resolver, runner } = createResolver(async (_executable, args) => {
      const target = args.at(-1);
      if (target.startsWith('ytsearch5:')) throw transient;
      return searchResult([{
        id: 'fixture-track',
        title: 'Fixture Artist Song',
        uploader: 'Fixture Artist',
        duration: 120,
        extractor: 'soundcloud',
        webpage_url: 'https://soundcloud.com/fixture/track'
      }]);
    });

    try {
      const result = await resolver.resolve('Fixture Artist Song');

      expect(result).toMatchObject({ success: true, song: { provider: 'soundcloud' } });
      expect(runner.run.mock.calls.map(([, args]) => args.at(-1))).toEqual([
        'ytsearch5:fixture artist song',
        'ytsearch5:fixture artist song',
        'scsearch5:fixture artist song'
      ]);
    } finally {
      await resolver.destroy();
    }
  });

  test('does not repeat a non-transient provider failure before the bounded fallback', async () => {
    const permanent = Object.assign(new Error('provider rejected request'), { code: 'EINVAL' });
    const { resolver, runner } = createResolver(async (_executable, args) => {
      if (args.at(-1).startsWith('ytsearch5:')) throw permanent;
      return searchResult([]);
    });

    try {
      await expect(resolver.resolve('Fixture Artist Song')).resolves.toMatchObject({
        success: false,
        reason: 'not_found'
      });
      expect(runner.run.mock.calls.map(([, args]) => args.at(-1))).toEqual([
        'ytsearch5:fixture artist song',
        'scsearch5:fixture artist song'
      ]);
    } finally {
      await resolver.destroy();
    }
  });
});
