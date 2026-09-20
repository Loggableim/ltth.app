const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readZipEntries } = require('./helpers/zip-reader');

const repoRoot = path.join(__dirname, '..', '..');
const expectedHistoricalHashes = {
  '1.8.0': 'c57903d9956a26ae36c404d967558178ee53ab766c78d723d95b013d6198e136',
  '1.9.0': '958424d0731f344d37bcd7ec40ebdb6709408f491e0c88dbe28108324ad28d0c',
  '1.10.0': '232b82d05e50b58aea9edda3ab994861a8145386d2c010871d6d6deee4fe3626',
  '1.11.0': '837e98a62e9023ad60e67303aaa3be57254f911faf3717044b5eda84ddb04ae4',
  '1.11.1': '46918c6c52bd0bcae123950e038e4db3feadd30fa1bc514758e8e411d00c3b60'
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function sha256(relativePath) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(repoRoot, relativePath)))
    .digest('hex');
}

describe('Stream Monsters 1.12 canonical release contract', () => {
  test('publishes one canonical Store tile with an exact 1.11.1 rollback', () => {
    const map = readJson('app/scripts/streammonsters-release-map.json');
    const release = map.releases['1.12.0'];
    const store = readJson('plugin-store.json');
    const entries = store.plugins.filter(plugin =>
      plugin.id === 'stream-monsters' || plugin.id === 'streamalchemy'
    );

    expect(map).toEqual(expect.objectContaining({
      schemaVersion: 2,
      pluginId: 'stream-monsters',
      aliases: ['streamalchemy']
    }));
    expect(release).toEqual(expect.objectContaining({
      manifestId: 'stream-monsters',
      sourcePath: 'app/plugins/stream-monsters',
      manifestVersion: '1.12.0',
      package: 'plugin-store/packages/stream-monsters-1.12.0.zip'
    }));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(expect.objectContaining({
      id: 'stream-monsters',
      aliases: ['streamalchemy'],
      replaces: ['streamalchemy'],
      version: '1.12.0',
      minLtthVersion: '1.4.2',
      sha256: release.sha256,
      rollbackVersions: [{
        version: '1.11.1',
        manifestId: 'streamalchemy',
        packageUrl: 'https://ltth.app/plugin-store/packages/streamalchemy-1.11.1.zip',
        sha256: expectedHistoricalHashes['1.11.1']
      }]
    }));
  });

  test('binds the canonical archive to its recorded source tree and manifest', async () => {
    const release = readJson('app/scripts/streammonsters-release-map.json').releases['1.12.0'];
    const entries = await readZipEntries(path.join(repoRoot, release.package));
    const expectedFiles = childProcess.execFileSync('git', [
      '-C', repoRoot, 'ls-tree', '-r', '--name-only', release.sourceTree
    ], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).sort();

    expect(sha256(release.package)).toBe(release.sha256);
    expect([...entries.keys()].sort()).toEqual(expectedFiles);
    expect(JSON.parse(entries.get('plugin.json').toString('utf8'))).toEqual(
      expect.objectContaining({ id: 'stream-monsters', version: '1.12.0', minLtthVersion: '1.4.2' })
    );
  });

  test.each(Object.entries(expectedHistoricalHashes))('preserves %s byte-for-byte', (version, hash) => {
    expect(sha256(`plugin-store/packages/streamalchemy-${version}.zip`)).toBe(hash);
  });
});
