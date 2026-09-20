const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  assertReservedPluginClaim,
  PLUGIN_IDENTITIES,
  canonicalizeIftttId,
  canonicalizePluginId,
  getConfigStorageKeys,
  getIdentityCandidateIds,
  getPersistentStorageId,
  getPluginIdentity,
  resolveInstalledPluginDirectory
} = require('../modules/plugin-identities');

describe('canonical plugin identity registry', () => {
  test('projects the permanent Stream Monsters identity consistently', () => {
    expect(canonicalizePluginId('streamalchemy')).toBe('stream-monsters');
    expect(canonicalizePluginId('stream-monsters')).toBe('stream-monsters');
    expect(canonicalizePluginId('soundboard')).toBe('soundboard');
    expect(getIdentityCandidateIds('streamalchemy')).toEqual([
      'stream-monsters',
      'streamalchemy'
    ]);
    expect(getPersistentStorageId('stream-monsters')).toBe('streamalchemy');
    expect(getConfigStorageKeys('streamalchemy', 'streamalchemy_config')).toEqual([
      'plugin:stream-monsters:config',
      'plugin:streamalchemy:streamalchemy_config'
    ]);
    expect(canonicalizeIftttId('streamalchemy:spawn_egg')).toBe(
      'stream-monsters:spawn_egg'
    );

    const identity = getPluginIdentity('streamalchemy');
    expect(identity).toBe(PLUGIN_IDENTITIES['stream-monsters']);
    expect(identity).toEqual(expect.objectContaining({
      id: 'stream-monsters',
      aliases: ['streamalchemy'],
      persistentStorageId: 'streamalchemy'
    }));
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity.aliases)).toBe(true);
  });

  test('permits only the byte-exact mapped historical alias package', () => {
    expect(assertReservedPluginClaim({
      manifestId: 'streamalchemy',
      version: '1.11.1',
      packagePath: 'plugin-store/packages/streamalchemy-1.11.1.zip',
      sha256: '46918c6c52bd0bcae123950e038e4db3feadd30fa1bc514758e8e411d00c3b60'
    })).toBe('stream-monsters');
    expect(() => assertReservedPluginClaim({
      manifestId: 'streamalchemy',
      version: '1.11.1',
      packagePath: 'community/streamalchemy-1.11.1.zip',
      sha256: '0'.repeat(64)
    })).toThrow(expect.objectContaining({ code: 'PLUGIN_IDENTITY_RESERVED_ALIAS' }));
    expect(assertReservedPluginClaim({
      manifestId: 'stream-monsters', version: '1.12.0'
    })).toBe('stream-monsters');
  });

  test('resolves the canonical source directory first without assuming manifest id equals directory name', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-identity-'));
    try {
      for (const [directoryName, manifestId] of [
        ['streamalchemy', 'streamalchemy'],
        ['stream-monsters', 'stream-monsters']
      ]) {
        const pluginDir = path.join(root, directoryName);
        fs.mkdirSync(pluginDir, { recursive: true });
        fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
          id: manifestId,
          name: 'Stream Monsters',
          entry: 'index.js'
        }));
      }

      expect(resolveInstalledPluginDirectory(root, 'streamalchemy')).toEqual(
        expect.objectContaining({
          canonicalId: 'stream-monsters',
          directoryName: 'stream-monsters',
          runtimeManifestId: 'stream-monsters',
          path: path.join(root, 'stream-monsters')
        })
      );

      fs.rmSync(path.join(root, 'stream-monsters'), { recursive: true, force: true });
      expect(resolveInstalledPluginDirectory(root, 'stream-monsters')).toEqual(
        expect.objectContaining({
          canonicalId: 'stream-monsters',
          directoryName: 'streamalchemy',
          runtimeManifestId: 'streamalchemy',
          path: path.join(root, 'streamalchemy')
        })
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
