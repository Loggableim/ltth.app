const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');

const repoRoot = path.join(__dirname, '..', '..');
const pluginDir = path.join(repoRoot, 'app', 'plugins', 'streamalchemy');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function listZipEntries(filename) {
  return new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true }, (error, zipFile) => {
      if (error) return reject(error);
      const entries = [];
      zipFile.on('entry', entry => {
        if (!entry.fileName.endsWith('/')) entries.push(entry.fileName);
        zipFile.readEntry();
      });
      zipFile.on('end', () => resolve(entries));
      zipFile.on('error', reject);
      zipFile.readEntry();
    });
  });
}

function listFiles(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true })
    .flatMap(entry => {
      const next = path.posix.join(relative.replace(/\\/g, '/'), entry.name);
      return entry.isDirectory() ? listFiles(root, next) : [next];
    })
    .sort();
}

describe('Stream Monsters current 1.8 release', () => {
  test('aligns the plugin, store and LTTH 1.4.1 release surfaces', () => {
    const manifest = readJson('app/plugins/streamalchemy/plugin.json');
    const store = readJson('plugin-store.json');
    const storeEntry = store.plugins.find(plugin => plugin.id === 'streamalchemy');

    expect(manifest).toEqual(expect.objectContaining({
      id: 'streamalchemy',
      name: 'Stream Monsters',
      version: '1.9.0',
      devStatus: 'working-beta'
    }));
    expect(storeEntry).toEqual(expect.objectContaining({
      version: '1.9.0',
      channel: 'open-beta',
      minLtthVersion: '1.4.1',
      packageUrl: 'https://ltth.app/plugin-store/packages/streamalchemy-1.9.0.zip',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      screenshots: [
        '/screenshots/features/stream-monsters-creator-1.5.png',
        '/screenshots/features/stream-monsters-arena-portrait-1.5.png'
      ]
    }));
    expect(readJson('package.json').version).toBe('1.4.1');
    expect(readJson('app/package.json').version).toBe('1.4.1');
    expect(readJson('app/package-lock.json')).toEqual(expect.objectContaining({
      version: '1.4.1',
      packages: expect.objectContaining({
        '': expect.objectContaining({ version: '1.4.1' })
      })
    }));
    expect(readJson('version.json')).toEqual(expect.objectContaining({
      version: '1.4.1',
      downloadVersion: '1.4.1',
      downloadUrl: 'https://github.com/Loggableim/ltth.app/releases/tag/v1.4.1'
    }));
  });

  test('preserves every published Stream Monsters archive through 1.5 byte-for-byte', () => {
    const expected = new Map([
      ['streamalchemy-1.2.0.zip', 'b31507530333ff179a17a9951644cab0bb299f2358d98ffa0a67a9448ce38780'],
      ['streamalchemy-1.3.0.zip', 'c3939f09fd9ec877dd3350049eec820fe9448f2a89af812a8937a8b9ae8be0bf'],
      ['streamalchemy-1.4.0.zip', 'ea706b60df78a8666a5b02d7ebe75b2b595aad66a16f6a2c0587cb9ab1ff82c0'],
      ['streamalchemy-1.5.0.zip', '156aa28664e177f9f9c29730c390016ad3d025e30df5c323fbf2c8394e3188fe']
    ]);
    for (const [name, digest] of expected) {
      expect(sha256(path.join(repoRoot, 'plugin-store', 'packages', name))).toBe(digest);
    }
  });

  test('publishes a source-identical bundled-only package with all 72 forms and curated audio', async () => {
    const store = readJson('plugin-store.json');
    const storeEntry = store.plugins.find(plugin => plugin.id === 'streamalchemy');
    const packagePath = path.join(
      repoRoot,
      'plugin-store',
      'packages',
      'streamalchemy-1.9.0.zip'
    );
    const manifest = readJson('app/plugins/streamalchemy/assets/streammonsters/furry/manifest.json');
    const audio = readJson('app/plugins/streamalchemy/assets/audio/manifest.json');
    const entries = (await listZipEntries(packagePath)).sort();

    expect(sha256(packagePath)).toBe(storeEntry.sha256);
    expect(entries).toEqual(listFiles(pluginDir));
    expect(manifest.assets).toHaveLength(72);
    expect(new Set(manifest.assets.map(asset => asset.sha256)).size).toBe(72);
    for (const asset of manifest.assets) expect(entries).toContain(asset.assetPath);
    expect(Object.keys(audio.cues).length).toBeGreaterThanOrEqual(22);
    for (const cue of Object.values(audio.cues)) {
      for (const variant of cue.variants) {
        expect(entries).toContain(variant.assetPath);
      }
    }
    expect(entries).toEqual(expect.arrayContaining([
      'streammonsters-arena-director.js',
      'streammonsters-arena-view.js',
      'streammonsters-audio-engine.js',
      'assets/audio/manifest.json',
      'assets/streammonsters/furry/manifest.json'
    ]));
    expect(entries.join('\n')).not.toMatch(
      /local-runtime|managed-runtime|provider-router|generation-job|art-pool/i
    );
  });

  test('ships the requested landscape Creator and portrait Arena screenshots', () => {
    const creator = fs.readFileSync(path.join(
      repoRoot,
      'screenshots',
      'features',
      'stream-monsters-creator-1.5.png'
    ));
    const arena = fs.readFileSync(path.join(
      repoRoot,
      'screenshots',
      'features',
      'stream-monsters-arena-portrait-1.5.png'
    ));
    expect([creator.readUInt32BE(16), creator.readUInt32BE(20)]).toEqual([1920, 1080]);
    expect([arena.readUInt32BE(16), arena.readUInt32BE(20)]).toEqual([1080, 1920]);
  });
});
