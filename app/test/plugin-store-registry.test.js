const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');

const repoRoot = path.join(__dirname, '..', '..');

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
  const zipFile = await openZip(zipPath);
  const entries = [];

  return new Promise((resolve, reject) => {
    zipFile.readEntry();
    zipFile.on('entry', (entry) => {
      entries.push(entry.fileName);
      zipFile.readEntry();
    });
    zipFile.on('end', () => resolve(entries));
    zipFile.on('error', reject);
  });
}

async function readZipEntry(zipPath, entryName) {
  const zipFile = await openZip(zipPath);

  return new Promise((resolve, reject) => {
    let found = false;

    zipFile.readEntry();
    zipFile.on('entry', (entry) => {
      if (entry.fileName !== entryName) {
        zipFile.readEntry();
        return;
      }

      found = true;
      zipFile.openReadStream(entry, (streamError, stream) => {
        if (streamError) {
          zipFile.close();
          reject(streamError);
          return;
        }

        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', (error) => {
          zipFile.close();
          reject(error);
        });
        stream.on('end', () => {
          zipFile.close();
          resolve(Buffer.concat(chunks));
        });
      });
    });
    zipFile.on('end', () => {
      if (!found) {
        zipFile.close();
        reject(new Error(`ZIP entry not found: ${entryName}`));
      }
    });
    zipFile.on('error', reject);
  });
}

async function readAllZipFiles(zipPath) {
  const zipFile = await openZip(zipPath);
  const files = new Map();

  return new Promise((resolve, reject) => {
    zipFile.readEntry();
    zipFile.on('entry', (entry) => {
      if (entry.fileName.endsWith('/')) {
        zipFile.readEntry();
        return;
      }
      zipFile.openReadStream(entry, (streamError, stream) => {
        if (streamError) {
          reject(streamError);
          return;
        }
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => {
          files.set(entry.fileName, Buffer.concat(chunks));
          zipFile.readEntry();
        });
      });
    });
    zipFile.on('end', () => resolve(files));
    zipFile.on('error', reject);
  });
}

function listSourceFiles(rootDir, relativeDir = '') {
  return fs.readdirSync(path.join(rootDir, relativeDir), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDir.replace(/\\/g, '/'), entry.name);
    return entry.isDirectory() ? listSourceFiles(rootDir, relativePath) : [relativePath];
  });
}

async function assertPackagedFilesMatchSource(packagePath, sourceDir, relativeFiles) {
  for (const relativeFile of relativeFiles) {
    assert.deepStrictEqual(
      await readZipEntry(packagePath, relativeFile),
      fs.readFileSync(path.join(sourceDir, ...relativeFile.split('/'))),
      `${relativeFile} must match the release source byte-for-byte`
    );
  }
}

async function assertPackagedFilesMatchGitSource(packagePath, sourcePrefix, relativeFiles) {
  const packagedFiles = await readAllZipFiles(packagePath);
  const specs = relativeFiles.map(relativeFile => `:${path.posix.join(sourcePrefix, relativeFile)}`);
  const batch = childProcess.execFileSync('git', ['cat-file', '--batch'], {
    cwd: repoRoot,
    input: `${specs.join('\n')}\n`,
    maxBuffer: 64 * 1024 * 1024
  });
  let offset = 0;

  for (const relativeFile of relativeFiles) {
    const headerEnd = batch.indexOf(10, offset);
    const header = batch.subarray(offset, headerEnd).toString('utf8');
    const size = Number(header.split(' ').at(-1));
    const sourceStart = headerEnd + 1;
    const source = batch.subarray(sourceStart, sourceStart + size);
    offset = sourceStart + size + 1;
    assert.deepStrictEqual(
      packagedFiles.get(relativeFile),
      source,
      `${relativeFile} must match the staged release source byte-for-byte`
    );
  }
}

describe('Official plugin store registry', () => {
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
    await assertPackagedFilesMatchSource(packagePath, sourceDir, ['main.js', 'overlay.html', 'ui.html']);
  });

  it('publishes Stream Monsters 1.3.0 with source-identical Collector Arena assets and keeps 1.2.0', async () => {
    const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin-store.json'), 'utf8'));
    const storePlugin = registry.plugins.find((plugin) => plugin.id === 'streamalchemy');
    const sourceDir = path.join(repoRoot, 'app', 'plugins', 'streamalchemy');
    const sourceManifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'plugin.json'), 'utf8'));

    assert(storePlugin, 'Stream Monsters must exist in the official store registry');
    assert.strictEqual(sourceManifest.id, 'streamalchemy');
    assert.strictEqual(sourceManifest.version, '1.3.0');
    assert.strictEqual(storePlugin.version, sourceManifest.version);
    assert.strictEqual(storePlugin.packageUrl, 'https://ltth.app/plugin-store/packages/streamalchemy-1.3.0.zip');
    assert.strictEqual(storePlugin.channel, 'open-beta');
    assert(storePlugin.badges.includes('working-beta'));
    assert(fs.existsSync(path.join(repoRoot, 'plugin-store', 'packages', 'streamalchemy-1.2.0.zip')));

    const packagePath = path.join(repoRoot, 'plugin-store', 'packages', 'streamalchemy-1.3.0.zip');
    const digest = crypto.createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex');
    assert.strictEqual(storePlugin.sha256, digest);

    const entries = (await listZipEntries(packagePath)).map((entry) => entry.replace(/\\/g, '/'));
    const sourceFiles = listSourceFiles(sourceDir).sort();
    assert.strictEqual(JSON.stringify(entries.filter((entry) => !entry.endsWith('/')).sort()), JSON.stringify(sourceFiles));
    const packagedManifest = JSON.parse((await readZipEntry(packagePath, 'plugin.json')).toString('utf8'));
    assert.deepStrictEqual(packagedManifest, sourceManifest);
    await assertPackagedFilesMatchGitSource(
      packagePath,
      'app/plugins/streamalchemy',
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

  it('marks all official LTTH plugins as open beta and free for the initial store', () => {
    const registryPath = path.join(repoRoot, 'plugin-store.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    for (const plugin of registry.plugins) {
      assert.strictEqual(plugin.channel, 'open-beta', `${plugin.id} must be open beta`);
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
