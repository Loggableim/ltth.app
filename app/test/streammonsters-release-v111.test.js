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
const expectedSourceCommit = 'e242b808276366c2f804fdeb353d5cab9caeae98';
const expectedSourceTree = '1478e82f9c1d0441a594a9537935e324da451692';
const canonicalTextExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.svg',
  '.txt'
]);
const historicalArchives = new Map([
  ['1.2.0', 'b31507530333ff179a17a9951644cab0bb299f2358d98ffa0a67a9448ce38780'],
  ['1.3.0', 'c3939f09fd9ec877dd3350049eec820fe9448f2a89af812a8937a8b9ae8be0bf'],
  ['1.4.0', 'ea706b60df78a8666a5b02d7ebe75b2b595aad66a16f6a2c0587cb9ab1ff82c0'],
  ['1.10.0', '232b82d05e50b58aea9edda3ab994861a8145386d2c010871d6d6deee4fe3626']
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function git(...args) {
  return childProcess.execFileSync(
    'git',
    ['-C', repoRoot, ...args],
    { encoding: 'utf8', windowsHide: true }
  ).trim();
}

function canonicalBytes(relativePath, bytes) {
  if (!canonicalTextExtensions.has(path.extname(relativePath).toLowerCase())) {
    return bytes;
  }
  return Buffer.from(
    bytes.toString('utf8').replace(/\r+\n/g, '\n').replace(/\r/g, '\n'),
    'utf8'
  );
}

function readGitFiles(sourceCommit, relativeFiles) {
  const specs = relativeFiles.map(relativePath => (
    `${sourceCommit}:app/plugins/streamalchemy/${relativePath}`
  ));
  const batch = childProcess.execFileSync(
    'git',
    ['-C', repoRoot, 'cat-file', '--batch'],
    {
      encoding: null,
      input: Buffer.from(`${specs.join('\n')}\n`, 'utf8'),
      maxBuffer: 256 * 1024 * 1024,
      windowsHide: true
    }
  );
  const files = new Map();
  let offset = 0;
  for (const relativePath of relativeFiles) {
    const headerEnd = batch.indexOf(10, offset);
    const header = batch.subarray(offset, headerEnd).toString('utf8');
    const size = Number(header.split(' ').at(-1));
    const sourceStart = headerEnd + 1;
    files.set(relativePath, batch.subarray(sourceStart, sourceStart + size));
    offset = sourceStart + size + 1;
  }
  return files;
}

function readZip(filename) {
  return new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true }, (error, zipFile) => {
      if (error) return reject(error);
      const entries = new Map();
      zipFile.readEntry();
      zipFile.on('entry', entry => {
        const name = entry.fileName.replace(/\\/g, '/');
        if (name.endsWith('/')) {
          zipFile.readEntry();
          return;
        }
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks = [];
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            entries.set(name, Buffer.concat(chunks));
            zipFile.readEntry();
          });
        });
      });
      zipFile.on('end', () => resolve(entries));
      zipFile.on('error', reject);
    });
  });
}

describe('Stream Monsters 1.11 Portrait Arcade Rally release contract', () => {
  test('publishes the verified 1.11.0 Open Beta package without changing LTTH 1.4.1', () => {
    const manifest = readJson('app/plugins/streamalchemy/plugin.json');
    const releaseMap = loadReleaseMap();
    const release = releaseMap.releases['1.11.0'];
    const store = readJson('plugin-store.json');
    const storeEntry = store.plugins.find(plugin => plugin.id === 'streamalchemy');

    expect(releaseMap).not.toHaveProperty('stagedRelease');
    expect(release).toEqual({
      sourceCommit: expectedSourceCommit,
      sourceTree: expectedSourceTree,
      manifestVersion: '1.11.0',
      package: 'plugin-store/packages/streamalchemy-1.11.0.zip',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(manifest).toEqual(expect.objectContaining({
      id: 'streamalchemy',
      name: 'Stream Monsters',
      version: '1.11.0',
      devStatus: 'working-beta'
    }));
    expect(storeEntry).toEqual(expect.objectContaining({
      version: '1.11.0',
      channel: 'open-beta',
      minLtthVersion: '1.4.1',
      packageUrl: 'https://ltth.app/plugin-store/packages/streamalchemy-1.11.0.zip',
      sha256: release.sha256
    }));
    expect(readJson('package.json').version).toBe('1.4.1');
    expect(readJson('app/package.json').version).toBe('1.4.1');
    const version = readJson('version.json');
    const currentRelease = readJson('app/CURRENT_RELEASE.json');
    expect(version.version).toBe('1.4.1');
    expect(version.downloadNote).toContain('Stream Monsters 1.11.0');
    expect(version.downloadNote).not.toMatch(/pending|ausstehend|source candidate/i);
    expect(currentRelease.version).toBe('1.4.1');
    expect(currentRelease.notes).toContain('streamalchemy-1.11.0.zip');
    expect(currentRelease.notes).toContain(release.sha256);
    expect(currentRelease.notes).not.toMatch(/pending|ausstehend|source candidate/i);
    expect(fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8'))
      .toMatch(/current published Stream Monsters release is \*\*1\.11\.0/i);
  });

  test('ships a path-safe, source-identical package with current assets, locales and licenses', async () => {
    const release = loadReleaseMap().releases['1.11.0'];
    const archive = path.join(repoRoot, release.package);
    const entries = await readZip(archive);
    const expectedFiles = git(
      'ls-tree',
      '-r',
      '--name-only',
      release.sourceTree
    ).split(/\r?\n/).filter(Boolean).sort();
    const actualFiles = [...entries.keys()].sort();
    const sourceFiles = readGitFiles(release.sourceCommit, actualFiles);

    expect(sha256(archive)).toBe(release.sha256);
    expect(actualFiles).toEqual(expectedFiles);
    for (const entryName of actualFiles) {
      expect(entryName).not.toMatch(/(?:^|\/)\.\.(?:\/|$)/);
      expect(entryName).not.toMatch(/^[a-zA-Z]:|^\/|\\/);
      expect(entryName).not.toMatch(
        /(?:^|\/)(?:data|runtime|models|jobs|cache)(?:\/|$)/i
      );
      expect(entryName).not.toMatch(
        /(?:art[-_]?lab|art[-_]?pool|generation-manager|local-runtime|provider-manager|job-manager)/i
      );
      const packaged = canonicalBytes(entryName, entries.get(entryName));
      const source = canonicalBytes(entryName, sourceFiles.get(entryName));
      expect(packaged.length).toBe(source.length);
      expect(crypto.createHash('sha256').update(packaged).digest('hex')).toBe(
        crypto.createHash('sha256').update(source).digest('hex')
      );
    }

    expect(actualFiles).toEqual(expect.arrayContaining([
      'plugin.json',
      'README.md',
      'index.js',
      'streammonsters-overlay.html',
      'streammonsters-ui.html',
      'locales/de.json',
      'locales/en.json',
      'locales/es.json',
      'locales/fr.json',
      'assets/branding/stream-monsters-icon.png',
      'assets/branding/stream-monsters-logo.png',
      'assets/streammonsters/furry/manifest.json',
      'assets/audio/manifest.json',
      'assets/audio/LICENSE-CC0-1.0.txt',
      'assets/kenney-monster-builder/License.txt'
    ]));
    expect(JSON.parse(entries.get('plugin.json').toString('utf8')).version).toBe('1.11.0');
  });

  test('rebuilds byte-identically from the recorded source commit and tree', async () => {
    const release = loadReleaseMap().releases['1.11.0'];
    const archive = path.join(repoRoot, release.package);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-v111-rebuild-'));

    try {
      const rebuilt = path.join(tempDir, 'streamalchemy-1.11.0.zip');
      const result = await buildReleaseFromGit({
        repoRoot,
        version: '1.11.0',
        outputPath: rebuilt
      });
      expect(result).toEqual(expect.objectContaining({
        sourceCommit: expectedSourceCommit,
        sourceTree: expectedSourceTree,
        manifestVersion: '1.11.0',
        sha256: release.sha256
      }));
      expect(sha256(rebuilt)).toBe(sha256(archive));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test.each([...historicalArchives])(
    'preserves the published %s archive byte-for-byte',
    (version, expectedHash) => {
      expect(sha256(path.join(packageDir, `streamalchemy-${version}.zip`)))
        .toBe(expectedHash);
    }
  );
});
