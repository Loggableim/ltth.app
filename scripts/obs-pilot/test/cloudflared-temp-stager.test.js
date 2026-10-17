'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { CLOUDFLARED_MANIFEST, CLOUDFLARED_VERSION, CloudflaredBinaryManager } = require('../../../app/modules/cloudflared-binary-manager');
const { stagePinnedCloudflared, resolvePinnedSource } = require('../lib/cloudflared-temp-stager');
const release = CLOUDFLARED_MANIFEST['win32:x64'];
function scratch() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cloudflared-stage-test-')); }
function pinnedFixture(root) {
  const source = path.join(root, 'source.exe');
  const pinnedBytes = Buffer.from('synthetic test fixture');
  const hash = crypto.createHash('sha256').update(pinnedBytes).digest('hex');
  fs.writeFileSync(source, pinnedBytes);
  return { source, pinnedBytes, hash, testRelease: { asset: release.asset, sha256: hash, archive: false } };
}
test('stages a present source only with the matching pin and manager accepts it without network', async () => {
  const root = scratch();
  try {
    const fixture = pinnedFixture(root);
    const staged = stagePinnedCloudflared({ sourcePath: fixture.source, toolsRoot: path.join(root, 'temp-tools'), release: fixture.testRelease });
    assert.equal(staged.sha256, fixture.hash);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(staged.executablePath)).digest('hex'), fixture.hash);
    const metadata = JSON.parse(fs.readFileSync(staged.metadataPath, 'utf8'));
    assert.deepEqual(metadata, { version: CLOUDFLARED_VERSION, releaseAsset: release.asset, releaseSha256: fixture.hash, executableSha256: fixture.hash });
    let networkCalls = 0;
    const manager = new CloudflaredBinaryManager({ toolsRoot: path.join(root, 'temp-tools'), httpsGet() { networkCalls += 1; throw new Error('NETWORK_FORBIDDEN'); }, platform: 'win32', arch: 'x64', manifest: { 'win32:x64': fixture.testRelease } });
    assert.equal(await manager.ensureInstalled(), staged.executablePath);
    assert.equal(networkCalls, 0);
    const home = path.join(root, 'home');
    const homeSource = path.join(home, 'AppData/Local/ltth.app/runtime-tools/cloudflared', CLOUDFLARED_VERSION, 'cloudflared.exe');
    fs.mkdirSync(path.dirname(homeSource), { recursive: true }); fs.copyFileSync(fixture.source, homeSource);
    assert.equal(resolvePinnedSource({ homeDir: home, localAppData: path.join(root, 'different') }), homeSource);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('rejects a missing source without staging artifacts', () => {
  const root = scratch();
  try {
    assert.throws(() => stagePinnedCloudflared({ sourcePath: path.join(root, 'missing.exe'), toolsRoot: path.join(root, 'tools') }), { code: 'CLOUDFLARED_SOURCE_MISSING' });
    assert.equal(fs.existsSync(path.join(root, 'tools')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('rejects a source hash mismatch without staging artifacts', () => {
  const root = scratch();
  try {
    const fixture = pinnedFixture(root);
    assert.throws(() => stagePinnedCloudflared({ sourcePath: fixture.source, toolsRoot: path.join(root, 'tools'), release: { ...fixture.testRelease, sha256: '0'.repeat(64) } }), { code: 'CLOUDFLARED_SOURCE_HASH_MISMATCH' });
    assert.equal(fs.existsSync(path.join(root, 'tools')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
