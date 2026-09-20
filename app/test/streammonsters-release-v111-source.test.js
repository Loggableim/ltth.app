const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const packageDir = path.join(repoRoot, 'plugin-store', 'packages');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function sha256(relativePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(repoRoot, relativePath)))
    .digest('hex');
}

describe('Stream Monsters 1.12 source-release contract', () => {
  test('publishes the canonical 1.12 source on LTTH 1.4.2', () => {
    const manifest = readJson('app/plugins/stream-monsters/plugin.json');
    const releaseMap = readJson('app/scripts/streammonsters-release-map.json');
    const appPackage = readJson('app/package.json');
    const rootPackage = readJson('package.json');
    const version = readJson('version.json');
    const currentRelease = readJson('app/CURRENT_RELEASE.json');

    expect(manifest).toEqual(expect.objectContaining({
      id: 'stream-monsters',
      name: 'Stream Monsters',
      version: '1.12.0',
      minLtthVersion: '1.4.2',
      devStatus: 'stable'
    }));
    expect(releaseMap).toEqual(expect.objectContaining({
      schemaVersion: 2,
      pluginId: 'stream-monsters',
      aliases: ['streamalchemy']
    }));
    expect(appPackage.version).toBe('1.4.2');
    expect(rootPackage.version).toBe('1.4.2');
    expect(version).toEqual(expect.objectContaining({
      version: '1.4.2',
      downloadVersion: '1.4.2'
    }));
    expect(currentRelease.version).toBe('1.4.2');
  });

  test('publishes one canonical 1.12 Store tile with the historical 1.11.1 rollback', () => {
    const store = readJson('plugin-store.json');
    const releaseMap = readJson('app/scripts/streammonsters-release-map.json');
    const release = releaseMap.releases['1.12.0'];
    const tiles = store.plugins.filter(plugin =>
      plugin.id === 'stream-monsters' || plugin.id === 'streamalchemy'
    );

    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toEqual(expect.objectContaining({
      id: 'stream-monsters',
      version: '1.12.0',
      minLtthVersion: '1.4.2',
      channel: 'stable',
      packageUrl: 'https://ltth.app/plugin-store/packages/stream-monsters-1.12.0.zip',
      sha256: release.sha256
    }));
    expect(tiles[0].rollbackVersions).toContainEqual({
      version: '1.11.1',
      manifestId: 'streamalchemy',
      packageUrl: 'https://ltth.app/plugin-store/packages/streamalchemy-1.11.1.zip',
      sha256: '46918c6c52bd0bcae123950e038e4db3feadd30fa1bc514758e8e411d00c3b60'
    });
    expect(release).toEqual(expect.objectContaining({
      manifestId: 'stream-monsters',
      sourcePath: 'app/plugins/stream-monsters',
      manifestVersion: '1.12.0',
      package: 'plugin-store/packages/stream-monsters-1.12.0.zip'
    }));
    expect(fs.existsSync(path.join(packageDir, 'stream-monsters-1.12.0.zip'))).toBe(true);
    expect(sha256(release.package)).toBe(release.sha256);
  });

  test('keeps the verified 1.11 source, package and rollback hash immutable', () => {
    const releaseMap = readJson('app/scripts/streammonsters-release-map.json');

    expect(releaseMap.releases['1.11.0']).toEqual(expect.objectContaining({
      sourceCommit: 'e242b808276366c2f804fdeb353d5cab9caeae98',
      sourceTree: '1478e82f9c1d0441a594a9537935e324da451692',
      manifestVersion: '1.11.0',
      package: 'plugin-store/packages/streamalchemy-1.11.0.zip',
      sha256: '837e98a62e9023ad60e67303aaa3be57254f911faf3717044b5eda84ddb04ae4'
    }));
    expect(releaseMap.releases['1.11.1']).toEqual(expect.objectContaining({
      manifestId: 'streamalchemy',
      sourcePath: 'app/plugins/streamalchemy',
      manifestVersion: '1.11.1',
      package: 'plugin-store/packages/streamalchemy-1.11.1.zip',
      sha256: '46918c6c52bd0bcae123950e038e4db3feadd30fa1bc514758e8e411d00c3b60'
    }));
    expect(sha256('plugin-store/packages/streamalchemy-1.11.1.zip'))
      .toBe('46918c6c52bd0bcae123950e038e4db3feadd30fa1bc514758e8e411d00c3b60');
  });

  test.each([
    ['1.2.0', 'b31507530333ff179a17a9951644cab0bb299f2358d98ffa0a67a9448ce38780'],
    ['1.3.0', 'c3939f09fd9ec877dd3350049eec820fe9448f2a89af812a8937a8b9ae8be0bf'],
    ['1.4.0', 'ea706b60df78a8666a5b02d7ebe75b2b595aad66a16f6a2c0587cb9ab1ff82c0'],
    ['1.10.0', '232b82d05e50b58aea9edda3ab994861a8145386d2c010871d6d6deee4fe3626'],
    ['1.11.0', '837e98a62e9023ad60e67303aaa3be57254f911faf3717044b5eda84ddb04ae4']
  ])('preserves the published %s archive byte-for-byte', (release, expectedHash) => {
    expect(sha256(`plugin-store/packages/streamalchemy-${release}.zip`))
      .toBe(expectedHash);
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'exposes the current 1.12 Stream Monsters UI in %s',
    (locale) => {
      const copy = readJson(
        `app/plugins/stream-monsters/locales/${locale}.json`
      ).plugins.streamalchemy.ui.monsters;

      expect(copy.version).toMatch(/1\.12/);
      expect(copy.title).toContain('Stream Monsters');
      expect(copy.overlayTitle).toContain('Portrait Arcade Rally');
      expect(copy.rulesDynamic).toContain('Rules v8');
      expect(copy.overlayBattleKicker).toMatch(/K\.?\s*-?\s*O\.?/i);
      expect(Object.values(copy).join(' ')).not.toMatch(/template(?:s)?/i);
    }
  );

  test('keeps the creator and overlay fallback labels aligned with 1.12', () => {
    const creatorUi = fs.readFileSync(
      path.join(repoRoot, 'app/plugins/stream-monsters/streammonsters-ui.html'),
      'utf8'
    );
    const overlay = fs.readFileSync(
      path.join(repoRoot, 'app/plugins/stream-monsters/streammonsters-overlay.html'),
      'utf8'
    );

    expect(creatorUi).toMatch(/Portrait Arcade Rally.*Version 1.12/);
    expect(creatorUi).not.toContain('Version 1.11');
    expect(creatorUi).not.toContain('League World Hybrid');
    expect(overlay).toMatch(/Stream Monsters.*Portrait Arcade Rally Overlay/);
    expect(overlay).not.toContain('League World Hybrid');
  });

  test('documents 1.12 and the byte-identical 1.11.1 rollback artifact', () => {
    const currentRelease = readJson('app/CURRENT_RELEASE.json');

    expect(currentRelease.version).toBe('1.4.2');
    expect(currentRelease.notes).toContain('Stream Monsters 1.12.0');
    expect(currentRelease.notes).toContain('streamalchemy-1.11.1.zip');
    expect(currentRelease.notes).toContain('46918c6c52bd0bcae123950e038e4db3feadd30fa1bc514758e8e411d00c3b60');
    expect(currentRelease.notes).toMatch(/byte-identical/i);
    expect(currentRelease.notes).not.toMatch(/source candidate|package pending|Quellkandidat|Paket ausstehend/i);
  });
});
