const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yauzl = require('yauzl');

const {
  RELEASE_MAP_PATH,
  buildArchiveFromFiles,
  buildReleaseFromGit,
  loadReleaseMap
} = require('../scripts/build-streammonsters-release-v18');

const repoRoot = path.join(__dirname, '..', '..');
const packageDir = path.join(repoRoot, 'plugin-store', 'packages');
const guide = require('../../scripts/plugin-guides/streamalchemy');

const LEGACY_ARCHIVES = Object.freeze({
  '1.0.0': '100e98aa4e8b6df3f435502686e120c2f7949edd275503897e3478a325fe6fe3',
  '1.1.1': '4ef2dee6386ef3760f4f18171d69f9de11b4bf766192aca25673b763ba921e26',
  '1.1.2': 'c1d75fcc2fb1ccd18bfa6c7be0c108fafd32cbcd651b8852a8f3e3e9e8a9d83d',
  '1.2.0': 'b31507530333ff179a17a9951644cab0bb299f2358d98ffa0a67a9448ce38780',
  '1.3.0': 'c3939f09fd9ec877dd3350049eec820fe9448f2a89af812a8937a8b9ae8be0bf',
  '1.4.0': 'ea706b60df78a8666a5b02d7ebe75b2b595aad66a16f6a2c0587cb9ab1ff82c0',
  '1.5.0': '156aa28664e177f9f9c29730c390016ad3d025e30df5c323fbf2c8394e3188fe'
});

const RELEASE_COMMITS = Object.freeze({
  '1.6.0': 'c4c0eca7a0a04617da3db042a0964d904f62a2c7',
  '1.7.0': '66b28c67972ada5774935eab447194700c06dc09',
  '1.8.0': 'b2e267b205622287e9738c4cf9f629c9f5b0d391'
});

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

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

describe('Stream Monsters 1.6-1.8 release integrity', () => {
  test('preserves every published Stream Monsters archive through 1.5 byte-for-byte', () => {
    for (const [version, expectedHash] of Object.entries(LEGACY_ARCHIVES)) {
      const archive = path.join(packageDir, `streamalchemy-${version}.zip`);
      expect(fs.existsSync(archive)).toBe(true);
      expect(sha256(archive)).toBe(expectedHash);
    }
  });

  test('maps every release to its audited source commit without claiming a tag', () => {
    expect(RELEASE_MAP_PATH).toBe(path.join(
      repoRoot,
      'app',
      'scripts',
      'streammonsters-release-map.json'
    ));
    const releaseMap = loadReleaseMap();
    expect(releaseMap).toEqual(expect.objectContaining({
      schemaVersion: 1,
      pluginId: 'streamalchemy',
      sourcePath: 'app/plugins/streamalchemy'
    }));
    for (const [version, sourceCommit] of Object.entries(RELEASE_COMMITS)) {
      expect(releaseMap.releases[version]).toEqual(expect.objectContaining({
        sourceCommit,
        manifestVersion: version,
        package: `plugin-store/packages/streamalchemy-${version}.zip`,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(releaseMap.releases[version]).not.toHaveProperty('tag');
    }
    expect(releaseMap.releases['1.8.0']).toEqual(expect.objectContaining({
      sourceTree: expect.stringMatching(/^[a-f0-9]{40}$/)
    }));
    expect(releaseMap.releases['1.8.0'].sourceTree).toBe(git(
      'rev-parse',
      `${releaseMap.releases['1.8.0'].sourceCommit}:app/plugins/streamalchemy`
    ));
    expect(releaseMap.releases['1.8.0']).not.toHaveProperty('manifestOverrides');
  });

  test('keeps LTTH 1.4.1 fixed while plugin releases advance independently', () => {
    const currentRelease = readJson('app/CURRENT_RELEASE.json');
    const publicRelease = readJson('version.json');
    const bundleSource = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'build_release_bundle.py'),
      'utf8'
    );

    expect(currentRelease.version).toBe('1.4.1');
    expect(currentRelease.notes).toMatch(/Stream Monsters 1\.11\.0/);
    expect(publicRelease.downloadNote).toMatch(/Stream Monsters 1\.11\.0/);
    expect(publicRelease.changelog['1.4.1'].changes.join('\n')).toMatch(
      /Stream Monsters 1\.5\.0/
    );
    expect(bundleSource).toContain('"1.4.1": "1.5.0"');
  });

  test('keeps 1.8.0 registered as an immutable historical Open Beta release', () => {
    const release = loadReleaseMap().releases['1.8.0'];
    expect(release).toEqual(expect.objectContaining({
      manifestVersion: '1.8.0',
      package: 'plugin-store/packages/streamalchemy-1.8.0.zip',
      sha256: 'c57903d9956a26ae36c404d967558178ee53ab766c78d723d95b013d6198e136'
    }));
    expect(sha256(path.join(repoRoot, release.package))).toBe(release.sha256);
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'documents the complete current retention and competitive loop in %s',
    locale => {
      const localizedGuide = JSON.stringify({
        topic: guide.topic[locale],
        test: guide.test[locale],
        expected: guide.expected[locale],
        copy: guide.copy[locale],
        steps: guide.steps.map(step => step.copy[locale])
      });

      expect(localizedGuide).toMatch(/1\.11/);
      expect(localizedGuide).toMatch(/adopt|adoptier|adopta|adoptez/i);
      expect(localizedGuide).toMatch(/60/);
      expect(localizedGuide).toMatch(/90/);
      expect(localizedGuide).toMatch(/8/);
      expect(localizedGuide).toMatch(/6/);
      expect(localizedGuide).toMatch(/10/);
      expect(localizedGuide).toMatch(/sealed|verdeckt|sellad|scell/i);
      expect(localizedGuide).toMatch(/role|Rollen|roles|rôles/i);
      expect(localizedGuide).toMatch(/quest|quête|misión/i);
      expect(localizedGuide).toMatch(/10.*(?:rating|wert|clasific|classement)/i);
      expect(localizedGuide).toMatch(/Art Lab/);
      expect(localizedGuide).toMatch(
        /no Art Lab|kein Art Lab|sin Art Lab|sans Art Lab|no incluye Art Lab|ne comprend ni Art Lab/i
      );
    }
  );

  test.each(Object.keys(RELEASE_COMMITS))(
    '%s has an exact root manifest and includes canonical assets and license evidence',
    async version => {
      const release = loadReleaseMap().releases[version];
      const archive = path.join(repoRoot, release.package);
      const entries = await readZip(archive);
      const names = [...entries.keys()].sort();
      const manifest = JSON.parse(entries.get('plugin.json').toString('utf8'));

      expect(sha256(archive)).toBe(release.sha256);
      expect(manifest).toEqual(expect.objectContaining({
        id: 'streamalchemy',
        name: 'Stream Monsters',
        version
      }));
      expect(names.every(name => (
        !name.startsWith('/')
        && !name.startsWith('../')
        && !name.startsWith('streamalchemy/')
      ))).toBe(true);
      expect(names).toEqual(expect.arrayContaining([
        'index.js',
        'streammonsters-overlay.html',
        'assets/branding/stream-monsters-icon.png',
        'assets/branding/stream-monsters-logo.png',
        'assets/streammonsters/furry/manifest.json',
        'assets/kenney-monster-builder/License.txt'
      ]));
      expect(names.join('\n')).not.toMatch(
        /local-runtime|managed-runtime|provider-router|generation-job|art-pool/i
      );
      if (version !== '1.6.0') {
        expect(names).toEqual(expect.arrayContaining([
          'streammonsters-arena-director.js',
          'streammonsters-arena-view.js',
          'streammonsters-audio-engine.js',
          'assets/audio/manifest.json',
          'assets/audio/LICENSE-CC0-1.0.txt'
        ]));
      }
    }
  );

  test.each(Object.keys(RELEASE_COMMITS))(
    '%s rebuilds byte-identically from its mapped Git source',
    async version => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `streammonsters-${version}-`));
      try {
        const outputPath = path.join(tempDir, `streamalchemy-${version}.zip`);
        const result = await buildReleaseFromGit({
          repoRoot,
          version,
          outputPath
        });
        const committed = path.join(packageDir, `streamalchemy-${version}.zip`);
        expect(result.sha256).toBe(loadReleaseMap().releases[version].sha256);
        expect(sha256(outputPath)).toBe(sha256(committed));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  );

  test('ships release-specific retention guidance in the 1.6 and 1.7 root READMEs', async () => {
    const release16 = await readZip(path.join(packageDir, 'streamalchemy-1.6.0.zip'));
    const release17 = await readZip(path.join(packageDir, 'streamalchemy-1.7.0.zip'));
    const readme16 = release16.get('README.md').toString('utf8');
    const readme17 = release17.get('README.md').toString('utf8');

    expect(readme16).toMatch(/Stream Monsters 1\.6/);
    expect(readme16).toMatch(/optional recurring free egg/i);
    expect(readme16).toMatch(/60[- ]second/i);
    expect(readme16).toMatch(/public.*adopt|adopt.*public/is);
    expect(readme16).toMatch(/claim.*`!adopt`|`!adopt`.*claim/is);
    expect(readme16).toMatch(/claim.*before.*hatch|hatch.*after.*claim/is);
    expect(readme16).not.toMatch(/reservation to hatch/i);
    expect(readme16).not.toMatch(/only source of new eggs|gift-only eggs/i);
    expect(readme16).not.toMatch(
      /creators can (?:enable|disable)|configure (?:the |its )?cooldown|creator (?:toggle|control)/i
    );

    expect(readme17).toMatch(/Stream Monsters 1\.7/);
    expect(readme17).toMatch(/optional recurring free egg/i);
    expect(readme17).toMatch(/claim.*`!adopt`|`!adopt`.*claim/is);
    expect(readme17).toMatch(/claim.*before.*hatch|hatch.*after.*claim/is);
    expect(readme17).toMatch(/sealed A\/B\/C/i);
    expect(readme17).toMatch(/Striker.*Guardian.*Trickster.*Sustain/is);
    expect(readme17).toMatch(/portrait.*arcade|arcade.*portrait/is);
    expect(readme17).not.toMatch(/only source of new eggs|gift-only eggs/i);
    expect(readme17).not.toMatch(
      /creators can (?:enable|disable)|configure (?:the |its )?cooldown|creator (?:toggle|control)/i
    );
  });

  test('keeps active guide and wiki copy consistent with optional free eggs', () => {
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const automation = guide.steps.find(step => step.id === 'automation-rule').copy[locale];
      const retention = guide.steps.find(step => step.id === 'retention-rules').copy[locale];
      const copy = JSON.stringify({ automation, retention });
      expect(copy).not.toMatch(
        /Gifts-only|gifts-only|huevos solo por regalos|uniquement par cadeaux|Ohne aktiviertes Gift entsteht kein Ei|No egg is created without an enabled gift/i
      );
      expect(retention.body).toMatch(/90/);
      expect(retention.body).toMatch(/60/);
    }

    for (const relativePath of [
      'app/wiki/Plugin-Liste.md',
      'app/wiki/de/Plugin-Liste.md',
      'app/wiki/en/Plugin-Liste.md',
      'app/wiki/es/Plugin-Liste.md',
      'app/wiki/fr/Plugin-Liste.md'
    ]) {
      const copy = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
      expect(copy).not.toMatch(
        /Gift-only Eier|Gift-only eggs|Huevos solo por regalos|Œufs uniquement par cadeaux/i
      );
    }
  });

  test('documents the current plugin release without rewriting fixed LTTH history', () => {
    const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
    const unreleased = changelog.split('## [1.4.1]')[0];
    const fixedRelease = changelog.split('## [1.4.1]')[1].split('## [1.4.0]')[0];

    expect(unreleased).toMatch(/Stream Monsters 1\.9\.0/);
    expect(unreleased).toMatch(/Rules v7/i);
    expect(unreleased).toMatch(/sealed.*A\/B\/C/i);
    expect(fixedRelease).toMatch(/Stream Monsters 1\.5\.0/);
    expect(fixedRelease).not.toMatch(/Stream Monsters 1\.9\.0/);
  });

  test('refuses an existing release archive unless overwrite is explicit', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-protected-'));
    try {
      const pluginDir = path.join(tempDir, 'app', 'plugins', 'streamalchemy');
      const packagePath = path.join(
        tempDir,
        'plugin-store',
        'packages',
        'streamalchemy-9.9.9.zip'
      );
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.mkdirSync(path.dirname(packagePath), { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, 'plugin.json'),
        JSON.stringify({ id: 'streamalchemy', name: 'Stream Monsters', version: '9.9.9' })
      );
      fs.writeFileSync(path.join(pluginDir, 'README.md'), '# Test release\n');
      fs.writeFileSync(packagePath, 'published-sentinel');
      childProcess.execFileSync('git', ['-C', tempDir, 'init', '--quiet']);
      childProcess.execFileSync('git', ['-C', tempDir, 'config', 'user.email', 'test@example.invalid']);
      childProcess.execFileSync('git', ['-C', tempDir, 'config', 'user.name', 'Release Test']);
      childProcess.execFileSync('git', ['-C', tempDir, 'add', '.']);
      childProcess.execFileSync('git', ['-C', tempDir, 'commit', '--quiet', '-m', 'fixture']);
      const sourceCommit = childProcess.execFileSync(
        'git',
        ['-C', tempDir, 'rev-parse', 'HEAD'],
        { encoding: 'utf8' }
      ).trim();
      const releaseMap = {
        schemaVersion: 1,
        pluginId: 'streamalchemy',
        sourcePath: 'app/plugins/streamalchemy',
        releases: {
          '9.9.9': {
            sourceCommit,
            manifestVersion: '9.9.9',
            package: 'plugin-store/packages/streamalchemy-9.9.9.zip',
            sha256: '0'.repeat(64)
          }
        }
      };

      await expect(buildReleaseFromGit({
        repoRoot: tempDir,
        version: '9.9.9',
        releaseMap
      })).rejects.toThrow(/overwrite.*explicit|explicit.*overwrite/i);
      expect(fs.readFileSync(packagePath, 'utf8')).toBe('published-sentinel');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('keeps an existing archive intact when an explicit atomic rebuild fails', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-atomic-'));
    try {
      const outputPath = path.join(tempDir, 'streamalchemy.zip');
      fs.writeFileSync(outputPath, 'published-sentinel');
      await expect(buildArchiveFromFiles({
        files: [
          { relativePath: 'README.md', bytes: Buffer.from('first') },
          { relativePath: 'broken.bin', bytes: null }
        ],
        outputPath,
        overwrite: true
      })).rejects.toThrow();
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('published-sentinel');
      expect(fs.readdirSync(tempDir)).toEqual(['streamalchemy.zip']);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
