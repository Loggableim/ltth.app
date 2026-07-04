const assert = require('assert');
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

describe('Official plugin store registry', () => {
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
});
