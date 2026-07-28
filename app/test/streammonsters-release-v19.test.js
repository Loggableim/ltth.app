const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  loadReleaseMap
} = require('../scripts/build-streammonsters-release-v18');

const repoRoot = path.join(__dirname, '..', '..');
const packageDir = path.join(repoRoot, 'plugin-store', 'packages');
const V18_SHA256 = 'c57903d9956a26ae36c404d967558178ee53ab766c78d723d95b013d6198e136';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function git(...args) {
  return childProcess.execFileSync(
    'git',
    ['-C', repoRoot, ...args],
    { encoding: 'utf8', windowsHide: true }
  ).trim();
}

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

describe('Stream Monsters 1.9 Rules-v7 release contract', () => {
  test('exposes the version-agnostic builder through the v18 compatibility path', () => {
    const genericBuilder = require('../scripts/build-streammonsters-release');
    const compatibilityBuilder = require('../scripts/build-streammonsters-release-v18');

    expect(compatibilityBuilder.buildReleaseFromGit).toBe(
      genericBuilder.buildReleaseFromGit
    );
    expect(typeof genericBuilder.main).toBe('function');
  });

  test('publishes Rules-v7 as the current 1.9.0 Open Beta plugin', () => {
    const manifest = readJson('app/plugins/streamalchemy/plugin.json');
    const store = readJson('plugin-store.json');
    const storeEntry = store.plugins.find(plugin => plugin.id === 'streamalchemy');
    const release = loadReleaseMap().releases['1.9.0'];

    expect(manifest).toEqual(expect.objectContaining({
      id: 'streamalchemy',
      name: 'Stream Monsters',
      version: '1.9.0',
      devStatus: 'working-beta'
    }));
    expect(release).toEqual(expect.objectContaining({
      sourceCommit: expect.stringMatching(/^[a-f0-9]{40}$/),
      sourceTree: expect.stringMatching(/^[a-f0-9]{40}$/),
      manifestVersion: '1.9.0',
      package: 'plugin-store/packages/streamalchemy-1.9.0.zip',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(storeEntry).toEqual(expect.objectContaining({
      version: '1.9.0',
      channel: 'open-beta',
      packageUrl: 'https://ltth.app/plugin-store/packages/streamalchemy-1.9.0.zip',
      sha256: release.sha256
    }));
  });

  test('binds every tree-backed release to its own source commit instead of HEAD', () => {
    const releaseMap = loadReleaseMap();
    for (const release of Object.values(releaseMap.releases)) {
      if (!release.sourceTree) continue;
      expect(release.sourceTree).toBe(
        git('rev-parse', `${release.sourceCommit}:${releaseMap.sourcePath}`)
      );
    }
  });

  test('keeps the published 1.8 archive byte-identical', () => {
    expect(sha256(path.join(packageDir, 'streamalchemy-1.8.0.zip'))).toBe(V18_SHA256);
  });
});
