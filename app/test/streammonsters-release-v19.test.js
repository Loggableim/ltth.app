const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yauzl = require('yauzl');

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

describe('Stream Monsters 1.9 Rules-v7 release contract', () => {
  test('exposes the version-agnostic builder through the v18 compatibility path', () => {
    const genericBuilder = require('../scripts/build-streammonsters-release');
    const compatibilityBuilder = require('../scripts/build-streammonsters-release-v18');

    expect(compatibilityBuilder.buildReleaseFromGit).toBe(
      genericBuilder.buildReleaseFromGit
    );
    expect(typeof genericBuilder.main).toBe('function');
  });

  test('records Rules-v7 as the immutable 1.9.0 Open Beta release', () => {
    const release = loadReleaseMap().releases['1.9.0'];

    expect(release).toEqual(expect.objectContaining({
      sourceCommit: expect.stringMatching(/^[a-f0-9]{40}$/),
      sourceTree: expect.stringMatching(/^[a-f0-9]{40}$/),
      manifestVersion: '1.9.0',
      package: 'plugin-store/packages/streamalchemy-1.9.0.zip',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
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

  test('refuses a source tree that does not belong to the recorded source commit', async () => {
    const { buildReleaseFromGit } = require('../scripts/build-streammonsters-release');
    const releaseMap = loadReleaseMap();
    const mismatched = JSON.parse(JSON.stringify(releaseMap));
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-v19-mismatch-'));
    mismatched.releases['1.8.0'].sourceTree = git(
      'rev-parse',
      'HEAD:app/plugins/streamalchemy'
    );

    try {
      await expect(buildReleaseFromGit({
        repoRoot,
        version: '1.8.0',
        releaseMap: mismatched,
        outputPath: path.join(tempDir, 'streamalchemy-1.8.0.zip')
      })).rejects.toThrow(/source tree.*source commit/i);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('keeps the published 1.8 archive byte-identical', () => {
    expect(sha256(path.join(packageDir, 'streamalchemy-1.8.0.zip'))).toBe(V18_SHA256);
  });

  test('ships and rebuilds the complete 1.9 archive byte-identically', async () => {
    const { buildReleaseFromGit } = require('../scripts/build-streammonsters-release');
    const release = loadReleaseMap().releases['1.9.0'];
    const archive = path.join(repoRoot, release.package);
    const entries = await readZip(archive);
    const manifest = JSON.parse(entries.get('plugin.json').toString('utf8'));
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-v19-rebuild-'));

    expect(sha256(archive)).toBe(release.sha256);
    expect(manifest).toEqual(expect.objectContaining({
      id: 'streamalchemy',
      name: 'Stream Monsters',
      version: '1.9.0',
      devStatus: 'working-beta'
    }));
    expect([...entries.keys()]).toEqual(expect.arrayContaining([
      'index.js',
      'streammonsters-overlay.html',
      'streammonsters-arena-director.js',
      'assets/branding/stream-monsters-icon.png',
      'assets/branding/stream-monsters-logo.png',
      'assets/streammonsters/furry/manifest.json',
      'assets/audio/manifest.json',
      'assets/kenney-monster-builder/License.txt'
    ]));

    try {
      const rebuilt = path.join(tempDir, 'streamalchemy-1.9.0.zip');
      const result = await buildReleaseFromGit({
        repoRoot,
        version: '1.9.0',
        outputPath: rebuilt
      });
      expect(result.sha256).toBe(release.sha256);
      expect(sha256(rebuilt)).toBe(sha256(archive));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
