const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yauzl = require('yauzl');

const {
  RELEASE_MAP_PATH,
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
  '1.8.0': '21fb84af9c3d8e898abd47290f6973e773c810b7'
});

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
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
    expect(releaseMap.releases['1.8.0']).not.toHaveProperty('manifestOverrides');
  });

  test('publishes 1.8.0 Open Beta as the current source and store version', () => {
    const manifest = readJson('app/plugins/streamalchemy/plugin.json');
    const store = readJson('plugin-store.json');
    const storeEntry = store.plugins.find(plugin => plugin.id === 'streamalchemy');

    expect(manifest).toEqual(expect.objectContaining({
      id: 'streamalchemy',
      name: 'Stream Monsters',
      version: '1.8.0',
      devStatus: 'working-beta'
    }));
    expect(storeEntry).toEqual(expect.objectContaining({
      version: '1.8.0',
      channel: 'open-beta',
      packageUrl: 'https://ltth.app/plugin-store/packages/streamalchemy-1.8.0.zip',
      sha256: loadReleaseMap().releases['1.8.0'].sha256
    }));
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'documents the complete 1.8 retention and competitive loop in %s',
    locale => {
      const localizedGuide = JSON.stringify({
        topic: guide.topic[locale],
        test: guide.test[locale],
        expected: guide.expected[locale],
        copy: guide.copy[locale],
        steps: guide.steps.map(step => step.copy[locale])
      });

      expect(localizedGuide).toMatch(/1\.8/);
      expect(localizedGuide).toMatch(/adopt|adoptier|adopta|adoptez/i);
      expect(localizedGuide).toMatch(/60/);
      expect(localizedGuide).toMatch(/24\s*(?:h|hour|Stunden|horas|heures)/i);
      expect(localizedGuide).toMatch(/10\s*(?:s|second|Sekunden)/i);
      expect(localizedGuide).toMatch(/6\s*(?:s|second|Sekunden)/i);
      expect(localizedGuide).toMatch(/15\s*(?:s|second|Sekunden)/i);
      expect(localizedGuide).toMatch(/sealed|verdeckt|sellad|scell/i);
      expect(localizedGuide).toMatch(/striker|guardian|trickster|sustain/i);
      expect(localizedGuide).toMatch(/quest|quête|misión/i);
      expect(localizedGuide).toMatch(/10.*(?:rating|wert|clasific|classement)/i);
      expect(localizedGuide).toMatch(/Art Lab/);
      expect(localizedGuide).toMatch(/image generation|Bildgenerierung|generación de imágenes|génération d.images/i);
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
      if (version === '1.8.0') {
        expect(manifest).toEqual(readJson('app/plugins/streamalchemy/plugin.json'));
      }
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
});
