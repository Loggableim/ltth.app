'use strict';

const { EventEmitter } = require('events');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MediaCache = require('../plugins/music-bot/lib/media-cache');

function createSpawn(mediaBytes) {
  return jest.fn((_command, args) => {
    const child = new EventEmitter();
    child.pid = 7791;
    child.exitCode = null;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn(() => true);
    process.nextTick(() => {
      const outputTemplate = args[args.indexOf('--output') + 1];
      const mediaPath = outputTemplate.replace('%(ext)s', 'fixture');
      fs.writeFileSync(mediaPath, mediaBytes);
      child.stdout.emit('data', Buffer.from(`${mediaPath}\n`));
      child.exitCode = 0;
      child.emit('close', 0);
    });
    return child;
  });
}

describe('Music Bot global media cache data contract', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-global-cache-contract-'));
  });

  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    root = null;
  });

  test('shares hashed media bytes across profile cache instances without persisting requester or profile metadata', async () => {
    const globalCacheDir = path.join(root, 'plugins', 'music-bot', 'data', 'cache');
    const mediaBytes = Buffer.from('synthetic audio payload');
    const spawn = createSpawn(mediaBytes);
    const profileAApi = { getPluginDataDir: () => path.dirname(globalCacheDir), log: jest.fn() };
    const profileBApi = { getPluginDataDir: () => path.dirname(globalCacheDir), log: jest.fn() };
    const cacheA = new MediaCache({ cacheDir: globalCacheDir }, profileAApi, { spawn });
    const cacheB = new MediaCache({ cacheDir: globalCacheDir }, profileBApi, { spawn: jest.fn() });

    try {
      const track = {
        trackKey: 'youtube:synthetic-shared-track',
        url: 'https://youtu.be/synthetic-shared-track',
        requestedBy: 'fixture-requester-must-not-persist',
        profileId: 'fixture-profile-must-not-persist'
      };
      const cachedPathA = await cacheA.getOrDownload(track);
      const cachedPathB = cacheB.get(track.trackKey);
      const fileNames = fs.readdirSync(globalCacheDir);
      const expectedPrefix = crypto.createHash('sha256').update(track.trackKey).digest('hex');

      expect(cacheA.cacheDir).toBe(cacheB.cacheDir);
      expect(cachedPathB).toBe(cachedPathA);
      expect(path.basename(cachedPathA)).toMatch(new RegExp(`^${expectedPrefix}\\.[^.]+$`));
      expect(fs.readFileSync(cachedPathA)).toEqual(mediaBytes);
      expect(fileNames).toEqual([path.basename(cachedPathA)]);
      expect(fileNames.join('\n')).not.toContain(track.requestedBy);
      expect(fileNames.join('\n')).not.toContain(track.profileId);
      expect(spawn).toHaveBeenCalledTimes(1);
    } finally {
      await Promise.all([cacheA.destroy(), cacheB.destroy()]);
    }
  });
});
