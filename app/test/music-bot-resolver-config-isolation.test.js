const { EventEmitter } = require('events');
const MusicResolver = require('../plugins/music-bot/lib/music-resolver');
const YtDlpRunner = require('../plugins/music-bot/lib/yt-dlp-runner');

function createChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn(() => true);
  return child;
}

const fixtureSong = {
  id: 'fixture-video-001',
  title: 'Synthetic Fixture Track',
  uploader: 'Fixture Artist',
  duration: 30,
  extractor: 'youtube',
  webpage_url: 'https://video.fixture.invalid/watch/fixture-video-001',
  url: 'https://media.fixture.invalid/audio'
};

const directAndPlaylistOutput = [
  '0',
  'fixture-channel-id',
  'Fixture Channel',
  '[]',
  JSON.stringify(fixtureSong)
].join('\n');

const resolverPaths = [
  [
    'text search',
    (resolver) => resolver.resolve('Synthetic Fixture Track'),
    JSON.stringify({ entries: [fixtureSong] }),
    'ytsearch5:synthetic fixture track'
  ],
  [
    'direct URL resolution',
    (resolver) => {
      resolver._isSupportedSourceUrl = jest.fn(() => true);
      return resolver.resolve('https://video.fixture.invalid/watch/fixture-video-001');
    },
    directAndPlaylistOutput,
    'https://video.fixture.invalid/watch/fixture-video-001'
  ],
  [
    'playlist entry resolution',
    (resolver) => {
      resolver._isYouTubePlaylistUrl = jest.fn(() => true);
      return resolver.resolvePlaylistEntry('https://playlist.fixture.invalid/PLFixtureOnly', 2);
    },
    directAndPlaylistOutput,
    'https://playlist.fixture.invalid/PLFixtureOnly'
  ]
];

describe.each(resolverPaths)('MusicResolver yt-dlp config isolation: %s', (_label, resolve, output, expectedTarget) => {
  test('passes --ignore-config to the actual YtDlpRunner spawn without cookie flags or network', async () => {
    const spawnCalls = [];
    const runner = new YtDlpRunner({
      maxConcurrent: 1,
      spawnImpl: jest.fn((executable, args, options) => {
        const child = createChild(9100 + spawnCalls.length);
        spawnCalls.push({ executable, args: [...args], options, child });
        setImmediate(() => {
          child.stdout.emit('data', Buffer.from(output));
          child.emit('close', 0);
        });
        return child;
      })
    });
    const resolver = new MusicResolver(
      { ytdlpPath: 'fixture-yt-dlp', searchTimeout: 5000 },
      { log: jest.fn() },
      { runner }
    );

    try {
      const result = await resolve(resolver);

      expect(result.success).toBe(true);
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].executable).toBe('fixture-yt-dlp');
      expect(spawnCalls[0].args[0]).toBe('--ignore-config');
      expect(spawnCalls[0].args.filter((arg) => arg === '--ignore-config')).toHaveLength(1);
      expect(spawnCalls[0].args.at(-1)).toBe(expectedTarget);
      expect(spawnCalls[0].args).toContain('--skip-download');
      expect(spawnCalls[0].args).not.toContain('--cookies');
      expect(spawnCalls[0].args).not.toContain('--cookies-from-browser');
      expect(spawnCalls[0].options).toEqual(expect.objectContaining({ windowsHide: true }));
    } finally {
      await resolver.destroy();
    }
  });
});
