const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  applyManifestVersion,
  loadReleaseMap
} = require('../scripts/build-streammonsters-release');

describe('Stream Monsters release map schema 2', () => {
  test('records manifest identity, source path, and package per release', () => {
    const releaseMap = loadReleaseMap();

    expect(releaseMap).toEqual(expect.objectContaining({
      schemaVersion: 2,
      pluginId: 'stream-monsters',
      aliases: ['streamalchemy']
    }));

    for (const [version, release] of Object.entries(releaseMap.releases)) {
      expect(release).toEqual(expect.objectContaining({
        manifestId: expect.stringMatching(/^stream(?:-monsters|alchemy)$/),
        sourcePath: expect.stringMatching(/^app\/plugins\/stream(?:-monsters|alchemy)$/),
        package: expect.stringMatching(/^plugin-store\/packages\/stream(?:-monsters|alchemy)-\d+\.\d+\.\d+\.zip$/)
      }));
      expect(release.manifestVersion).toBe(version);
    }

    expect(releaseMap.releases['1.11.1']).toEqual(expect.objectContaining({
      manifestId: 'streamalchemy',
      sourcePath: 'app/plugins/streamalchemy',
      package: 'plugin-store/packages/streamalchemy-1.11.1.zip',
      sha256: '46918c6c52bd0bcae123950e038e4db3feadd30fa1bc514758e8e411d00c3b60'
    }));
  });

  test('validates the release manifest against its mapped identity', () => {
    const files = [{
      relativePath: 'plugin.json',
      bytes: Buffer.from(JSON.stringify({ id: 'stream-monsters', version: '0.0.0' }))
    }];

    applyManifestVersion(files, '1.12.0', 'stream-monsters');
    expect(JSON.parse(files[0].bytes.toString('utf8'))).toEqual({
      id: 'stream-monsters',
      version: '1.12.0'
    });

    expect(() => applyManifestVersion(files, '1.12.0', 'streamalchemy'))
      .toThrow(/unexpected plugin id/i);
  });

  test('rejects schema-2 releases whose package identity is inconsistent', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-release-map-v2-'));
    const mapPath = path.join(tempDir, 'release-map.json');
    const releaseMap = JSON.parse(JSON.stringify(loadReleaseMap()));
    releaseMap.releases['1.11.1'].package =
      'plugin-store/packages/stream-monsters-1.11.1.zip';
    fs.writeFileSync(mapPath, `${JSON.stringify(releaseMap, null, 2)}\n`);

    try {
      expect(() => loadReleaseMap(mapPath)).toThrow(/invalid.*1\.11\.1/i);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
