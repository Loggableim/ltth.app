const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');
const zlib = require('zlib');

const repoRoot = path.join(__dirname, '..', '..');
const canonicalTextExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.svg', '.txt']);

jest.setTimeout(120000);

function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipFile) => {
      if (error) {
        reject(error);
      } else {
        resolve(zipFile);
      }
    });
  });
}

async function listZipEntries(zipPath) {
  const entries = await listZipFileEntries(zipPath);
  return entries.map((entry) => entry.fileName);
}

async function listZipFileEntries(zipPath) {
  const zipFile = await openZip(zipPath);
  const entries = [];

  return new Promise((resolve, reject) => {
    zipFile.readEntry();
    zipFile.on('entry', (entry) => {
      entries.push(entry);
      zipFile.readEntry();
    });
    zipFile.on('end', () => resolve(entries));
    zipFile.on('error', reject);
  });
}

function readZipEntryBytes(descriptor, entry) {
  const localHeader = Buffer.alloc(30);
  const headerBytesRead = fs.readSync(
    descriptor,
    localHeader,
    0,
    localHeader.length,
    entry.relativeOffsetOfLocalHeader
  );
  assert.strictEqual(headerBytesRead, localHeader.length, `${entry.fileName} must have a complete local ZIP header`);
  assert.strictEqual(localHeader.readUInt32LE(0), 0x04034b50, `${entry.fileName} must have a local ZIP header`);

  const fileNameLength = localHeader.readUInt16LE(26);
  const extraFieldLength = localHeader.readUInt16LE(28);
  const dataStart = entry.relativeOffsetOfLocalHeader + localHeader.length + fileNameLength + extraFieldLength;
  const compressedBytes = Buffer.alloc(entry.compressedSize);
  const bytesRead = fs.readSync(descriptor, compressedBytes, 0, compressedBytes.length, dataStart);
  assert.strictEqual(bytesRead, compressedBytes.length, `${entry.fileName} must have complete ZIP entry data`);

  let bytes;
  if (entry.compressionMethod === 0) {
    bytes = compressedBytes;
  } else if (entry.compressionMethod === 8) {
    bytes = zlib.inflateRawSync(compressedBytes);
  } else {
    throw new Error(`${entry.fileName} uses unsupported ZIP compression method ${entry.compressionMethod}`);
  }

  assert.strictEqual(bytes.length, entry.uncompressedSize, `${entry.fileName} must match its declared ZIP size`);
  return bytes;
}

function readZipFileEntries(zipPath, entries) {
  const descriptor = fs.openSync(zipPath, 'r');
  try {
    return entries
      .filter((entry) => !entry.fileName.endsWith('/'))
      .map((entry) => [entry.fileName, readZipEntryBytes(descriptor, entry)]);
  } finally {
    fs.closeSync(descriptor);
  }
}

async function readZipEntry(zipPath, entryName) {
  const entries = await listZipFileEntries(zipPath);
  const entry = entries.find((candidate) => candidate.fileName === entryName);
  if (!entry) {
    throw new Error(`ZIP entry not found: ${entryName}`);
  }

  return readZipFileEntries(zipPath, [entry])[0][1];
}

async function readAllZipFiles(zipPath) {
  const entries = await listZipFileEntries(zipPath);
  return new Map(readZipFileEntries(zipPath, entries));
}

function listSourceFiles(rootDir, relativeDir = '') {
  return fs.readdirSync(path.join(rootDir, relativeDir), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDir.replace(/\\/g, '/'), entry.name);
    return entry.isDirectory() ? listSourceFiles(rootDir, relativePath) : [relativePath];
  });
}

function listGitTreeFiles(sourceTree) {
  return childProcess.execFileSync('git', ['ls-tree', '-r', '--name-only', sourceTree], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  }).split(/\r?\n/).filter(Boolean);
}

function canonicalSourceBytes(relativeFile, bytes) {
  if (!canonicalTextExtensions.has(path.extname(relativeFile).toLowerCase())) {
    return bytes;
  }
  return Buffer.from(
    bytes.toString('utf8').replace(/\r+\n/g, '\n').replace(/\r/g, '\n'),
    'utf8'
  );
}

async function assertPackagedFilesMatchGitSource(packagePath, source, relativeFiles) {
  const packagedFiles = await readAllZipFiles(packagePath);
  const specs = relativeFiles.map((relativeFile) => (
    source.sourceTree
      ? `${source.sourceTree}:${relativeFile}`
      : `:${path.posix.join(source.sourcePath, relativeFile)}`
  ));
  const batch = childProcess.execFileSync('git', ['cat-file', '--batch'], {
    cwd: repoRoot,
    input: `${specs.join('\n')}\n`,
    maxBuffer: 256 * 1024 * 1024
  });
  let offset = 0;

  for (const relativeFile of relativeFiles) {
    const headerEnd = batch.indexOf(10, offset);
    const header = batch.subarray(offset, headerEnd).toString('utf8');
    const size = Number(header.split(' ').at(-1));
    const sourceStart = headerEnd + 1;
    const source = batch.subarray(sourceStart, sourceStart + size);
    offset = sourceStart + size + 1;
    const packagedEntry = packagedFiles.get(relativeFile);
    assert(packagedEntry, `${relativeFile} must exist in the release package`);
    const packaged = canonicalSourceBytes(relativeFile, packagedEntry);
    const canonicalSource = canonicalSourceBytes(relativeFile, source);
    assert.strictEqual(
      packaged.length,
      canonicalSource.length,
      `${relativeFile} must match the canonical staged source byte length`
    );
    assert.strictEqual(
      crypto.createHash('sha256').update(packaged).digest('hex'),
      crypto.createHash('sha256').update(canonicalSource).digest('hex'),
      `${relativeFile} must match the canonical staged source SHA-256`
    );
  }
}

describe('Official plugin store registry', () => {
  it('reads consecutive compressed Stream Monsters entries without stalling', async () => {
    const packagePath = path.join(repoRoot, 'plugin-store', 'packages', 'streamalchemy-1.11.1.zip');
    const files = await readAllZipFiles(packagePath);
    const first = files.get('assets/audio/cues/arena-heal-1.wav');
    const second = files.get('assets/audio/cues/arena-hit-1.wav');

    assert(first);
    assert(second);
    assert.strictEqual(first.length, 11592);
    assert.strictEqual(second.length, 41410);
  }, 5000);

  it('uses the Stream Monsters release-map source tree for package verification', () => {
    const releaseMap = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'app', 'scripts', 'streammonsters-release-map.json'),
      'utf8'
    ));
    const release = releaseMap.releases['1.11.1'];
    const sourceFiles = listGitTreeFiles(release.sourceTree);

    assert(sourceFiles.includes('backend/streammonsters/avatar-proxy.js'));
    assert.strictEqual(sourceFiles.length, 523);
  });

  it('publishes the WebGPU Weather Control open beta as a source-identical 1080p package', async () => {
    const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin-store.json'), 'utf8'));
    const storePlugin = registry.plugins.find((plugin) => plugin.id === 'webgpu-weather-control');
    const sourceDir = path.join(repoRoot, 'app', 'plugins', 'webgpu-weather-control');
    const sourceManifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'plugin.json'), 'utf8'));

    assert(storePlugin, 'WebGPU Weather Control must exist in the official store registry');
    assert.strictEqual(sourceManifest.version, '1.0.0');
    assert.strictEqual(storePlugin.version, sourceManifest.version);
    assert.strictEqual(storePlugin.channel, 'open-beta');
    assert(storePlugin.badges.includes('working-beta'));
    assert.strictEqual(storePlugin.packageUrl, 'https://ltth.app/plugin-store/packages/webgpu-weather-control-1.0.0.zip');
    assert.deepStrictEqual(storePlugin.screenshots, ['/screenshots/features/webgpu-weather-control.png']);

    const screenshot = fs.readFileSync(path.join(repoRoot, 'screenshots', 'features', 'webgpu-weather-control.png'));
    assert.strictEqual(screenshot.readUInt32BE(16), 1920, 'store screenshot must be 1080p wide');
    assert.strictEqual(screenshot.readUInt32BE(20), 1080, 'store screenshot must be 1080p high');

    const packagePath = path.join(repoRoot, 'plugin-store', 'packages', 'webgpu-weather-control-1.0.0.zip');
    assert(fs.existsSync(packagePath), 'WebGPU Weather Control package must exist');
    const digest = crypto.createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex');
    assert.strictEqual(storePlugin.sha256, digest);

    const entries = (await listZipEntries(packagePath)).map((entry) => entry.replace(/\\/g, '/'));
    const sourceFiles = listSourceFiles(sourceDir).sort();
    assert.strictEqual(JSON.stringify(entries.filter((entry) => !entry.endsWith('/')).sort()), JSON.stringify(sourceFiles));
    const packagedManifest = JSON.parse((await readZipEntry(packagePath, 'plugin.json')).toString('utf8'));
    assert.deepStrictEqual(packagedManifest, sourceManifest);
    await assertPackagedFilesMatchGitSource(
      packagePath,
      { sourcePath: 'app/plugins/webgpu-weather-control' },
      ['main.js', 'overlay.html', 'ui.html']
    );
  });

  it('keeps the historical Stream Monsters 1.11.0 package byte-for-byte unchanged', () => {
    const packagePath = path.join(repoRoot, 'plugin-store', 'packages', 'streamalchemy-1.11.0.zip');

    assert(fs.existsSync(packagePath), 'streamalchemy-1.11.0.zip must remain available');
    assert.strictEqual(
      crypto.createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex'),
      '837e98a62e9023ad60e67303aaa3be57254f911faf3717044b5eda84ddb04ae4'
    );
  });

  it('keeps Stream Monsters 1.11.1 stable for LTTH 1.4.1 while the next source release is prepared', async () => {
    const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin-store.json'), 'utf8'));
    const storePlugin = registry.plugins.find((plugin) => plugin.id === 'streamalchemy');
    const releaseMap = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'app', 'scripts', 'streammonsters-release-map.json'),
      'utf8'
    ));
    const release = releaseMap.releases['1.11.1'];
    const sourceManifest = JSON.parse(childProcess.execFileSync(
      'git',
      ['show', `${release.sourceTree}:plugin.json`],
      { cwd: repoRoot, encoding: 'utf8', windowsHide: true }
    ));

    assert(storePlugin, 'Stream Monsters must exist in the official store registry');
    assert.strictEqual(sourceManifest.id, 'streamalchemy');
    assert.strictEqual(sourceManifest.version, '1.11.1');
    assert.strictEqual(sourceManifest.devStatus, 'stable');
    assert.strictEqual(storePlugin.version, sourceManifest.version);
    assert.strictEqual(storePlugin.minLtthVersion, '1.4.1');
    assert.strictEqual(storePlugin.packageUrl, 'https://ltth.app/plugin-store/packages/streamalchemy-1.11.1.zip');
    assert.strictEqual(storePlugin.channel, 'stable');
    assert(storePlugin.badges.includes('subscriber-only'));
    assert(!storePlugin.badges.includes('working-beta'));
    assert.strictEqual(release.manifestVersion, storePlugin.version);
    assert.strictEqual(
      childProcess.execFileSync(
        'git',
        ['rev-parse', `${release.sourceCommit}:app/plugins/streamalchemy`],
        { cwd: repoRoot, encoding: 'utf8', windowsHide: true }
      ).trim(),
      release.sourceTree
    );
    const legacyPackages = new Map([
      ['streamalchemy-1.2.0.zip', 'b31507530333ff179a17a9951644cab0bb299f2358d98ffa0a67a9448ce38780'],
      ['streamalchemy-1.3.0.zip', 'c3939f09fd9ec877dd3350049eec820fe9448f2a89af812a8937a8b9ae8be0bf'],
      ['streamalchemy-1.4.0.zip', 'ea706b60df78a8666a5b02d7ebe75b2b595aad66a16f6a2c0587cb9ab1ff82c0'],
      ['streamalchemy-1.5.0.zip', '156aa28664e177f9f9c29730c390016ad3d025e30df5c323fbf2c8394e3188fe'],
      ['streamalchemy-1.10.0.zip', '232b82d05e50b58aea9edda3ab994861a8145386d2c010871d6d6deee4fe3626']
    ]);
    for (const [fileName, expectedHash] of legacyPackages) {
      const legacyPath = path.join(repoRoot, 'plugin-store', 'packages', fileName);
      assert(fs.existsSync(legacyPath), `${fileName} must remain available`);
      const legacyDigest = crypto.createHash('sha256').update(fs.readFileSync(legacyPath)).digest('hex');
      assert.strictEqual(legacyDigest, expectedHash, `${fileName} must remain byte-for-byte unchanged`);
    }

    const packagePath = path.join(repoRoot, 'plugin-store', 'packages', 'streamalchemy-1.11.1.zip');
    const digest = crypto.createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex');
    assert.strictEqual(
      digest,
      '46918c6c52bd0bcae123950e038e4db3feadd30fa1bc514758e8e411d00c3b60',
      'the historical Stream Monsters 1.11.1 archive must remain byte-identical'
    );
    assert.strictEqual(storePlugin.sha256, digest);
    assert.strictEqual(release.sha256, digest);

    const entries = (await listZipEntries(packagePath)).map((entry) => entry.replace(/\\/g, '/'));
    const sourceFiles = listGitTreeFiles(release.sourceTree).sort();
    assert.strictEqual(JSON.stringify(entries.filter((entry) => !entry.endsWith('/')).sort()), JSON.stringify(sourceFiles));
    const packagedManifest = JSON.parse((await readZipEntry(packagePath, 'plugin.json')).toString('utf8'));
    assert.deepStrictEqual(packagedManifest, sourceManifest);
    await assertPackagedFilesMatchGitSource(
      packagePath,
      { sourceTree: release.sourceTree },
      sourceFiles
    );
  });

  it('publishes the Schnorrbecher package with a matching manifest and checksum', async () => {
    const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin-store.json'), 'utf8'));
    const storePlugin = registry.plugins.find((plugin) => plugin.id === 'schnorrbecher');
    const sourceManifest = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'app', 'plugins', 'schnorrbecher', 'plugin.json'),
      'utf8'
    ));

    assert(storePlugin, 'Schnorrbecher must exist in the official store registry');
    assert.strictEqual(storePlugin.version, sourceManifest.version);
    assert.strictEqual(storePlugin.packageUrl, 'https://ltth.app/plugin-store/packages/schnorrbecher-1.0.0.zip');

    const packagePath = path.join(repoRoot, 'plugin-store', 'packages', 'schnorrbecher-1.0.0.zip');
    assert(fs.existsSync(packagePath), 'Schnorrbecher package must exist');
    const digest = crypto.createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex');
    assert.strictEqual(storePlugin.sha256, digest);

    const packagedManifest = JSON.parse((await readZipEntry(packagePath, 'plugin.json')).toString('utf8'));
    assert.strictEqual(packagedManifest.id, 'schnorrbecher');
    assert.strictEqual(packagedManifest.version, sourceManifest.version);

    const entries = await listZipEntries(packagePath);
    for (const asset of [
      'assets/branding/schnorrbecher-icon.png',
      'assets/branding/schnorrbecher-logo.png',
      'assets/jars/classic.png',
      'assets/jars/mason.png',
      'assets/jars/arcade.png'
    ]) {
      assert(entries.includes(asset), `Schnorrbecher package must include ${asset}`);
    }
  });

  it('publishes the Hybridshock 1.2.0 package with matching manifest and documentation metadata', async () => {
    const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin-store.json'), 'utf8'));
    const hybridShock = registry.plugins.find((plugin) => plugin.id === 'openshock');
    const sourceManifest = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'app', 'plugins', 'openshock', 'plugin.json'),
      'utf8'
    ));

    assert(hybridShock, 'Hybridshock must exist in the official store registry');
    assert.strictEqual(sourceManifest.name, 'Hybridshock');
    assert.strictEqual(sourceManifest.version, '1.2.0');
    assert.strictEqual(hybridShock.name.en, 'Hybridshock');
    assert.strictEqual(hybridShock.version, '1.2.0');
    assert.strictEqual(
      hybridShock.packageUrl,
      'https://ltth.app/plugin-store/packages/openshock-1.2.0.zip'
    );

    const packagePath = path.join(repoRoot, 'plugin-store', 'packages', 'openshock-1.2.0.zip');
    const packagedManifest = JSON.parse((await readZipEntry(packagePath, 'plugin.json')).toString('utf8'));
    assert.strictEqual(packagedManifest.name, 'Hybridshock');
    assert.strictEqual(packagedManifest.version, '1.2.0');

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(path.join(repoRoot, 'locales', `${locale}.json`), 'utf8'));
      assert.strictEqual(translations['docs.plugin.openshock.title'], 'Hybridshock');
    }
  });

  it('publishes installable HTTPS packages with matching SHA-256 checksums', async () => {
    const registryPath = path.join(repoRoot, 'plugin-store.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    assert.strictEqual(registry.source.id, 'official');
    assert(registry.plugins.length >= 30, 'expected official registry to include LTTH plugins');

    for (const plugin of registry.plugins) {
      assert(plugin.packageUrl.startsWith('https://ltth.app/plugin-store/packages/'), `${plugin.id} has no LTTH package URL`);
      assert.match(plugin.sha256, /^[a-f0-9]{64}$/, `${plugin.id} has no SHA-256 checksum`);

      const packagePath = path.join(repoRoot, plugin.packageUrl.replace('https://ltth.app/', ''));
      assert(fs.existsSync(packagePath), `${plugin.id} package is missing`);

      const digest = crypto.createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex');
      assert.strictEqual(digest, plugin.sha256, `${plugin.id} checksum mismatch`);

      const entries = await listZipEntries(packagePath);
      assert(entries.includes('plugin.json'), `${plugin.id} package must contain plugin.json at the root`);
      assert(!entries.some((entry) => /(^|\/)(data|uploads|logs|node_modules)(\/|$)/.test(entry)), `${plugin.id} package contains runtime data`);
      assert(!entries.some((entry) => /\.(db|sqlite|sqlite3|log)$/i.test(entry)), `${plugin.id} package contains runtime files`);
    }
  });

  it('marks Stream Monsters as the stable official store release', () => {
    const registryPath = path.join(repoRoot, 'plugin-store.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const streamMonsters = registry.plugins.find((plugin) => plugin.id === 'streamalchemy');

    assert(streamMonsters, 'Stream Monsters must exist in the official store registry');
    assert.strictEqual(streamMonsters.channel, 'stable');
    assert(streamMonsters.badges.includes('subscriber-only'));
    assert.strictEqual(streamMonsters.access?.type, 'subscriber');
    assert.deepStrictEqual(streamMonsters.pricing, {
      type: 'free',
      amount: 0,
      currency: 'EUR'
    });
    for (const locale of ['de', 'en', 'es', 'fr']) {
      assert(
        streamMonsters.access?.description?.[locale],
        `Stream Monsters must explain subscriber access in ${locale}`
      );
    }
    assert.match(
      streamMonsters.access.description.en,
      /Included with an active LTTH subscription/
    );
    assert(!streamMonsters.badges.includes('working-beta'));
  });

  it('keeps every other official LTTH plugin open beta and all official plugins free', () => {
    const registryPath = path.join(repoRoot, 'plugin-store.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    for (const plugin of registry.plugins) {
      if (plugin.id !== 'streamalchemy') {
        assert.strictEqual(plugin.channel, 'open-beta', `${plugin.id} must be open-beta`);
      }
      assert.strictEqual(plugin.pricing?.type, 'free', `${plugin.id} must be free`);
      assert.strictEqual(plugin.pricing?.amount, 0, `${plugin.id} free price amount must be 0`);
      assert.strictEqual(plugin.pricing?.currency, 'EUR', `${plugin.id} free price currency must be EUR`);
    }
  });

  it('marks invite-only and admin-only store entries with access metadata', () => {
    const registryPath = path.join(repoRoot, 'plugin-store.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.plugins.map((plugin) => [plugin.id, plugin]));
    const preinstalledIds = [
      'chatango',
      'goals',
      'milestone-leaderboard',
      'spotlight',
      'soundboard',
      'toptier',
      'tts',
      'emoji-rain',
      'gcce',
      'api-bridge',
      'clarityhud'
    ];
    const closedBetaIds = [
      'interactive-story',
      'openshock'
    ];
    const subscriberIds = [
      'animazingpal',
      'streamalchemy',
      'talking-heads',
      'vdoninja',
      'visual-fx-frame-webgpu'
    ];

    for (const id of preinstalledIds) {
      const plugin = byId.get(id);
      assert(plugin, `${id} must exist in the official store registry`);
      assert(plugin.badges.includes('preinstalled'), `${id} must include the preinstalled badge`);
    }

    for (const id of closedBetaIds) {
      const plugin = byId.get(id);
      assert(plugin, `${id} must exist in the official store registry`);
      assert.strictEqual(plugin.access?.type, 'closed-beta', `${id} must be closed beta`);
      assert(plugin.badges.includes('closed-beta'), `${id} must include the closed-beta badge`);
    }

    for (const id of subscriberIds) {
      const plugin = byId.get(id);
      assert(plugin, `${id} must exist in the official store registry`);
      assert.strictEqual(plugin.access?.type, 'subscriber', `${id} must be subscriber-only`);
      assert(plugin.badges.includes('subscriber-only'), `${id} must include the subscriber-only badge`);
    }

    const adminPlugin = byId.get('store-admin');
    assert(adminPlugin, 'store-admin must exist in the official store registry');
    assert.strictEqual(adminPlugin.access?.type, 'admin');
    assert.strictEqual(adminPlugin.access?.hidden, true);
    assert(adminPlugin.badges.includes('admin-only'));
  });
});
