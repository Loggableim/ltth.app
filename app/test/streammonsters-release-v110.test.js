const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yauzl = require('yauzl');

const {
  buildReleaseFromGit,
  loadReleaseMap
} = require('../scripts/build-streammonsters-release');

const repoRoot = path.join(__dirname, '..', '..');
const packageDir = path.join(repoRoot, 'plugin-store', 'packages');
const V19_SHA256 = '958424d0731f344d37bcd7ec40ebdb6709408f491e0c88dbe28108324ad28d0c';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
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

function readZip(filename) {
  return new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true }, (error, zipFile) => {
      if (error) return reject(error);
      const entries = new Map();
      zipFile.readEntry();
      zipFile.on('entry', entry => {
        if (entry.fileName.endsWith('/')) {
          zipFile.readEntry();
          return;
        }
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks = [];
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            entries.set(entry.fileName.replace(/\\/g, '/'), Buffer.concat(chunks));
            zipFile.readEntry();
          });
        });
      });
      zipFile.on('end', () => resolve(entries));
      zipFile.on('error', reject);
    });
  });
}

describe('Stream Monsters 1.10 Jackpot Arena release contract', () => {
  test('records Jackpot Arena as an immutable 1.10.0 Open Beta plugin', () => {
    const release = loadReleaseMap().releases['1.10.0'];

    expect(release).toEqual(expect.objectContaining({
      sourceCommit: expect.stringMatching(/^[a-f0-9]{40}$/),
      sourceTree: expect.stringMatching(/^[a-f0-9]{40}$/),
      manifestVersion: '1.10.0',
      package: 'plugin-store/packages/streamalchemy-1.10.0.zip',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(sha256(path.join(repoRoot, release.package))).toBe(release.sha256);
  });

  test('retains 1.10 as Jackpot Arena and Living Egg Shelf in release history', () => {
    const changelog = readText('app/CHANGELOG.md');
    const currentRelease = readJson('app/CURRENT_RELEASE.json');

    expect(changelog).toContain('Stream Monsters 1.10.0');
    expect(changelog).toContain('Living Egg Shelf');
    expect(changelog).toContain('Jackpot');
    expect(currentRelease.notes).toContain('archive through 1.10.0 remain preserved');
  });

  test('binds every tree-backed release to its recorded source commit', () => {
    const releaseMap = loadReleaseMap();
    for (const release of Object.values(releaseMap.releases)) {
      if (!release.sourceTree) continue;
      expect(release.sourceTree).toBe(
        git('rev-parse', `${release.sourceCommit}:${releaseMap.sourcePath}`)
      );
    }
  });

  test('keeps the published 1.9 archive byte-identical', () => {
    expect(sha256(path.join(packageDir, 'streamalchemy-1.9.0.zip'))).toBe(V19_SHA256);
  });

  test('ships and rebuilds the complete 1.10 archive byte-identically', async () => {
    const release = loadReleaseMap().releases['1.10.0'];
    const archive = path.join(repoRoot, release.package);
    const entries = await readZip(archive);
    const manifest = JSON.parse(entries.get('plugin.json').toString('utf8'));
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-v110-rebuild-'));

    expect(sha256(archive)).toBe(release.sha256);
    expect(manifest).toEqual(expect.objectContaining({
      id: 'streamalchemy',
      name: 'Stream Monsters',
      version: '1.10.0',
      devStatus: 'working-beta'
    }));
    expect([...entries.keys()]).toEqual(expect.arrayContaining([
      'index.js',
      'streammonsters-overlay.html',
      'streammonsters-overlay-runtime.js',
      'streammonsters-arena-director.js',
      'streammonsters-egg-stage-view.js',
      'assets/branding/stream-monsters-icon.png',
      'assets/branding/stream-monsters-logo.png',
      'assets/streammonsters/furry/manifest.json',
      'assets/audio/manifest.json',
      'assets/kenney-monster-builder/License.txt'
    ]));

    try {
      const rebuilt = path.join(tempDir, 'streamalchemy-1.10.0.zip');
      const result = await buildReleaseFromGit({
        repoRoot,
        version: '1.10.0',
        outputPath: rebuilt
      });
      expect(result.sha256).toBe(release.sha256);
      expect(sha256(rebuilt)).toBe(sha256(archive));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
