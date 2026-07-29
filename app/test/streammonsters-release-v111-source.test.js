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

describe('Stream Monsters 1.11 source-release contract', () => {
  test('binds the verified 1.11.0 Open Beta source without changing LTTH 1.4.1', () => {
    const manifest = readJson('app/plugins/streamalchemy/plugin.json');
    const releaseMap = readJson('app/scripts/streammonsters-release-map.json');
    const appPackage = readJson('app/package.json');
    const rootPackage = readJson('package.json');
    const version = readJson('version.json');
    const currentRelease = readJson('app/CURRENT_RELEASE.json');

    expect(manifest).toEqual(expect.objectContaining({
      id: 'streamalchemy',
      name: 'Stream Monsters',
      version: '1.11.0',
      devStatus: 'working-beta'
    }));
    expect(releaseMap).not.toHaveProperty('stagedRelease');
    expect(releaseMap.releases['1.11.0']).toEqual({
      sourceCommit: 'e242b808276366c2f804fdeb353d5cab9caeae98',
      sourceTree: '1478e82f9c1d0441a594a9537935e324da451692',
      manifestVersion: '1.11.0',
      package: 'plugin-store/packages/streamalchemy-1.11.0.zip',
      sha256: '837e98a62e9023ad60e67303aaa3be57254f911faf3717044b5eda84ddb04ae4'
    });
    expect(appPackage.version).toBe('1.4.1');
    expect(rootPackage.version).toBe('1.4.1');
    expect(version.version).toBe('1.4.1');
    expect(version.downloadVersion).toBe('1.4.1');
    expect(currentRelease.version).toBe('1.4.1');
  });

  test('publishes the verified package and hash in the Open Beta store', () => {
    const store = readJson('plugin-store.json');
    const entry = store.plugins.find(plugin => plugin.id === 'streamalchemy');

    expect(entry).toEqual(expect.objectContaining({
      version: '1.11.0',
      channel: 'open-beta',
      packageUrl: 'https://ltth.app/plugin-store/packages/streamalchemy-1.11.0.zip',
      sha256: '837e98a62e9023ad60e67303aaa3be57254f911faf3717044b5eda84ddb04ae4'
    }));
    expect(fs.existsSync(path.join(packageDir, 'streamalchemy-1.11.0.zip'))).toBe(true);
    expect(sha256('plugin-store/packages/streamalchemy-1.11.0.zip'))
      .toBe(entry.sha256);
  });

  test.each([
    ['1.2.0', 'b31507530333ff179a17a9951644cab0bb299f2358d98ffa0a67a9448ce38780'],
    ['1.3.0', 'c3939f09fd9ec877dd3350049eec820fe9448f2a89af812a8937a8b9ae8be0bf'],
    ['1.4.0', 'ea706b60df78a8666a5b02d7ebe75b2b595aad66a16f6a2c0587cb9ab1ff82c0'],
    ['1.10.0', '232b82d05e50b58aea9edda3ab994861a8145386d2c010871d6d6deee4fe3626']
  ])('preserves the published %s archive byte-for-byte', (release, expectedHash) => {
    expect(sha256(`plugin-store/packages/streamalchemy-${release}.zip`))
      .toBe(expectedHash);
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'exposes 1.11 Rules v8 K.O. presentation in the %s plugin locale',
    (locale) => {
      const copy = readJson(
        `app/plugins/streamalchemy/locales/${locale}.json`
      ).plugins.streamalchemy.ui.monsters;

      expect(copy.version).toContain('1.11');
      expect(copy.title).toContain('Portrait Arcade Rally');
      expect(copy.overlayTitle).toContain('Portrait Arcade Rally');
      expect(copy.rulesDynamic).toContain('Rules v8');
      expect(copy.overlayBattleKicker).toMatch(/K\.?\s*-?\s*O\.?/i);
      expect(copy.overlayBattleKicker).not.toMatch(
        /three rounds|drei Runden|tres rondas|trois manches/i
      );
    }
  );

  test('keeps the creator UI fallback label aligned with 1.11', () => {
    const creatorUi = fs.readFileSync(
      path.join(repoRoot, 'app/plugins/streamalchemy/streammonsters-ui.html'),
      'utf8'
    );
    const overlay = fs.readFileSync(
      path.join(repoRoot, 'app/plugins/streamalchemy/streammonsters-overlay.html'),
      'utf8'
    );

    expect(creatorUi).toContain('Portrait Arcade Rally · Version 1.11');
    expect(creatorUi).not.toContain('Version 1.10');
    expect(creatorUi).not.toContain('League World Hybrid');
    expect(overlay).toContain('Stream Monsters · Portrait Arcade Rally Overlay');
    expect(overlay).not.toContain('League World Hybrid');
  });

  test('marks release notes as verified without claiming an LTTH version bump', () => {
    const currentRelease = readJson('app/CURRENT_RELEASE.json');

    expect(currentRelease.notes).toContain('Stream Monsters 1.11.0');
    expect(currentRelease.notes).toContain('streamalchemy-1.11.0.zip');
    expect(currentRelease.notes).toContain(
      '837e98a62e9023ad60e67303aaa3be57254f911faf3717044b5eda84ddb04ae4'
    );
    expect(currentRelease.notes).not.toMatch(/source candidate|package pending|Quellkandidat|Paket ausstehend/i);
    expect(currentRelease.version).toBe('1.4.1');
  });
});
