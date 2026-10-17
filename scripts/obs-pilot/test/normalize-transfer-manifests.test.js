'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeTransferManifests, validateHelperManifest, safeRelativePath } = require('../normalize-transfer-manifests');

const EXCLUDED = [
  ['app/plugins/sidekick/test/pilot-public-overlay-harness.test.js', 'host-side source-contract reference; not guest runtime dependency'],
  ['scripts/obs-pilot/create-isolation-receipt.js', 'host-side read-only exact-UUID VBoxManage isolation receipt producer; emits no raw config'],
  ['scripts/obs-pilot/test/contract.test.js', 'host-side in-process security and behavior tests; opens no listeners'],
  ['scripts/obs-pilot/test/stage-contract.test.js', 'source-only regression tests for stage order, duplicate/stale events, counters, and cleanup'],
];

function sha(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-transfer-normalize-'));
  const obsRoot = path.join(root, 'obs-source');
  const repositoryRoot = path.join(root, 'repo');
  fs.mkdirSync(obsRoot, { recursive: true });
  fs.mkdirSync(repositoryRoot, { recursive: true });
  const write = (base, relative, contents) => {
    const full = path.join(base, ...relative.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
    const buffer = Buffer.from(contents);
    return { path: relative, bytes: buffer.length, sha256: sha(buffer) };
  };
  const obsFiles = [write(obsRoot, 'bin/64bit/obs64.exe', 'obs'), write(obsRoot, 'data/locale.ini', 'locale')];
  const sidekickFiles = [
    write(repositoryRoot, 'runtime/node/node.exe', 'node'),
    write(repositoryRoot, 'app/plugins/sidekick/overlay/sidekick-hud.html', 'hud'),
    write(repositoryRoot, 'app/node_modules/socket.io/index.js', 'socket server'),
    write(repositoryRoot, 'scripts/obs-pilot/fixture-host.js', 'fixture'),
  ].map((entry, index) => ({ ...entry, role: [
    'bundled portable Node 22.14.0; ABI 127; selected runtime packages require no native addons',
    'pilot runtime source',
    'package socket.io@4.8.3; loopback-only synthetic fixture server',
    'guest loopback-only synthetic fixture server entrypoint',
  ][index] }));
  for (const [relative, role] of EXCLUDED) sidekickFiles.push({ ...write(repositoryRoot, relative, 'host test'), role });
  return {
    root,
    obsRoot,
    repositoryRoot,
    obsManifest: { schemaVersion: 1, status: 'inventory', createdAt: 'now', purpose: 'test', source: {}, totals: {}, files: obsFiles, peDirectImportAnalysis: {}, limitations: [] },
    sidekickManifest: {
      schemaVersion: 1, status: 'plan', createdAt: 'now', purpose: 'test', constraints: {}, runtime: {}, pilot: {},
      existingHarness: {}, requiredToAuthorBeforeTransfer: [], packageClosure: [], files: sidekickFiles,
      totals: {}, excluded: [], runtimeCommands: {}, sourceProvenance: {},
      effectiveTransfer: undefined, excludedFromGuest: undefined,
    },
    sidekickFiles,
  };
}

function normalize(data) {
  return normalizeTransferManifests({ ...data, obsRoot: data.obsRoot, repositoryRoot: data.repositoryRoot });
}

function fixtureFile(relative, contents) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-source-hash-'));
  const fullPath = path.join(tempRoot, ...relative.split('/'));
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents);
  const buffer = Buffer.from(contents);
  return { tempRoot, fullPath, bytes: buffer.length, sha256: sha(buffer) };
}

function pinnedCookieFixture({ isolateRepositoryRoot = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-cookie-normalize-'));
  const obsRoot = path.join(root, 'obs-source');
  fs.mkdirSync(obsRoot, { recursive: true });
  const repositoryRoot = isolateRepositoryRoot ? path.join(root, 'repo') : path.resolve(__dirname, '../../..');
  if (isolateRepositoryRoot) fs.mkdirSync(repositoryRoot, { recursive: true });
  const obsManifest = {
    schemaVersion: 1, status: 'fixture', createdAt: 'now', purpose: 'fixture', source: {}, totals: {},
    files: [], peDirectImportAnalysis: {}, limitations: [],
  };
  const actualRepositoryRoot = path.resolve(__dirname, '../../..');
  const sidekickManifest = JSON.parse(fs.readFileSync(path.join(actualRepositoryRoot, 'docs/coordination/obs-sidekick-pilot-transfer-manifest.json'), 'utf8'));
  const source = sidekickManifest.files.find((entry) => entry.path === 'app/node_modules/cookie/index.js');
  if (!source) throw new Error('pinned cookie source entry is missing from the current manifest');
  sidekickManifest.files = [source];
  sidekickManifest.excludedFromGuest = [];
  sidekickManifest.effectiveTransfer.files = [{
    path: `pilot/${source.path}`,
    bytes: source.bytes,
    sha256: source.sha256,
  }];
  return { root, obsRoot, repositoryRoot, obsManifest, sidekickManifest, source };
}

function updateCookieFixtureMetadata(data, field, value) {
  data.sidekickManifest.files[0][field] = value;
  data.sidekickManifest.effectiveTransfer.files[0][field] = value;
}

function validateSourceHash(root, relative, expectedBytes, expectedSha256) {
  const fullPath = path.join(root, ...relative.split('/'));
  const actual = fs.readFileSync(fullPath);
  if (actual.length !== expectedBytes || sha(actual) !== expectedSha256) throw new Error(`source hash drift: ${relative}`);
}

const cases = [];
function test(name, run) { cases.push({ name, run }); }

test('normalizes valid source mappings deterministically and records exact host-only exclusions', () => {
  const data = fixture();
  const first = normalize(data);
  const second = normalize(data);
  assert.equal(first.status, 'dry-run-only-normalization-verified');
  assert.deepEqual(first, second);
  assert.equal(first.files, 6);
  assert.deepEqual(first.manifest.files.map((file) => file.path).sort(), [
    'obs/bin/64bit/obs64.exe', 'obs/data/locale.ini', 'pilot/app/node_modules/socket.io/index.js',
    'pilot/app/plugins/sidekick/overlay/sidekick-hud.html', 'pilot/scripts/obs-pilot/fixture-host.js', 'runtime/node/node.exe',
  ].sort());
  assert.equal(first.excluded.length, EXCLUDED.length);
  fs.rmSync(data.root, { recursive: true, force: true });
});

test('rejects unknown source root, unknown properties, and unknown roles', () => {
  const data = fixture();
  data.obsManifest.files.push({ path: 'elsewhere/file', bytes: 0, sha256: sha(Buffer.alloc(0)) });
  assert.throws(() => normalize(data), /unknown path or role/);

  const second = fixture();
  second.sidekickManifest.unrecognized = true;
  assert.throws(() => normalize(second), /unknown property/);

  const third = fixture();
  third.sidekickFiles[1].role = 'plausible but unrecognized role';
  assert.throws(() => normalize(third), /unknown role/);
  for (const item of [data, second, third]) fs.rmSync(item.root, { recursive: true, force: true });
});

test('rejects traversal, case-insensitive target collision, and source hash drift', () => {
  const data = fixture();
  data.obsManifest.files[0].path = '../outside';
  assert.throws(() => normalize(data), /unsafe path segment/);

  const second = fixture();
  second.sidekickFiles.push({ ...second.sidekickFiles[3], path: 'scripts/OBS-PILOT/fixture-host.js' });
  assert.throws(() => normalize(second), /normalized target collision/);

  const third = fixture();
  fs.writeFileSync(path.join(third.obsRoot, 'bin/64bit/obs64.exe'), 'changed');
  assert.throws(() => normalize(third), /source hash drift/);
  for (const item of [data, second, third]) fs.rmSync(item.root, { recursive: true, force: true });
});

test('rejects reparse points when the platform permits a synthetic symlink', () => {
  const data = fixture();
  const target = path.join(data.obsRoot, 'bin/64bit/obs64.exe');
  const link = path.join(data.obsRoot, 'bin/64bit/linked.exe');
  try {
    fs.symlinkSync(target, link);
  } catch (error) {
    fs.rmSync(data.root, { recursive: true, force: true });
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return { skipped: true, reason: `symlink creation unavailable (${error.code})` };
    throw error;
  }
  const bytes = fs.readFileSync(target);
  data.obsManifest.files.push({ path: 'bin/64bit/linked.exe', bytes: bytes.length, sha256: sha(bytes) });
  assert.throws(() => normalize(data), /reparse source path/);
  fs.rmSync(data.root, { recursive: true, force: true });
});

test('requires explicit effectiveTransfer entries to match the effective files exactly', () => {
  const data = fixture();
  data.sidekickManifest.effectiveTransfer = {
    schemaVersion: 1,
    pathMapping: 'runtime/* remains runtime/*; app/* and scripts/* map under pilot/*.',
    rolePolicy: 'test',
    files: data.sidekickFiles.filter((entry) => !EXCLUDED.some(([file]) => file === entry.path)).map((entry) => {
      const target = entry.path.startsWith('runtime/') ? entry.path : `pilot/${entry.path}`;
      return { path: target, bytes: entry.bytes, sha256: entry.sha256 };
    }),
  };
  data.sidekickManifest.excludedFromGuest = EXCLUDED.map(([file, role]) => ({ path: file, role, reason: 'host-only' }));
  assert.equal(normalize(data).files, 6);
  data.sidekickManifest.effectiveTransfer.files.pop();
  assert.throws(() => normalize(data), /missing from effectiveTransfer allowlist/);
  fs.rmSync(data.root, { recursive: true, force: true });
});

test('validates exact helper JSON schema, allowed roots, Windows path rules, and typed values', () => {
  const good = { schemaVersion: 1, files: [{ path: 'obs/bin/obs64.exe', bytes: 7, sha256: sha(Buffer.from('1234567')) }] };
  assert.deepEqual(validateHelperManifest(good), good);
  assert.throws(() => validateHelperManifest({ ...good, extra: true }), /unknown property/);
  assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [{ ...good.files[0], path: 'other/bin/obs.exe' }] }), /allowed roots/);
  assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [{ ...good.files[0], path: 'obs/bin/CON.dll' }] }), /reserved/);
  assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [{ ...good.files[0], path: 'obs/profiles/profile.json' }] }), /sensitive/);
  assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [{ ...good.files[0], path: 'obs/bin/private-key.pem' }] }), /public-key exception|sensitive|forbidden/);
  assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [{ ...good.files[0], bytes: '7' }] }), /size\/hash/);
  assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [{ ...good.files[0], path: 'obs/bin/a.exe' }, { ...good.files[0], path: 'obs/bin/A.exe' }] }), /case-colliding/);
});

test('canonical hash covers exact serialized helper manifest format', () => {
  const data = fixture();
  const result = normalize(data);
  const serialized = JSON.stringify({ schemaVersion: 1, files: result.manifest.files });
  assert.equal(result.manifestSha256, sha(Buffer.from(serialized, 'utf8')));
  fs.rmSync(data.root, { recursive: true, force: true });
});

test('enforces aggregate helper payload byte limit', () => {
  const digest = sha(Buffer.alloc(0));
  const file = { path: 'obs/bin/part.exe', bytes: 1073741824, sha256: digest };
  assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [file, { ...file, path: 'obs/bin/part2.exe' }] }), /exceeds 2 GiB/);
});

test('permits only exact trusted cookie targets with pinned bytes and hashes', () => {
  const policy = require('../transfer-path-exceptions.json');
  for (const entry of policy.exceptions) {
    assert.equal(safeRelativePath(entry.path, true, true), entry.path);
    assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [{ path: entry.path, bytes: entry.bytes, sha256: '0'.repeat(64) }] }), /trusted path exception metadata mismatch/);
    const caseVariant = entry.path.replace(/cookie/i, 'COOKIE');
    assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [{ path: caseVariant, bytes: entry.bytes, sha256: entry.sha256 }] }), /sensitive path segment/);
    const alteredPath = entry.path.replace('/cookie/', '/cookie-shadow/');
    assert.throws(() => safeRelativePath(alteredPath), /sensitive/);
  }
  assert.throws(() => safeRelativePath('pilot/app/node_modules/my-cookie/session.json'), /sensitive/);
});

test('does not grant trusted cookie exception to tampered manifest metadata or file content', () => {
  const data = fixture();
  const policy = require('../transfer-path-exceptions.json').exceptions[0];
  const relative = 'app/node_modules/cookie/index.js';
  const contents = 'synthetic trusted library source';
  const entry = { path: `pilot/${relative}`, bytes: policy.bytes, sha256: policy.sha256 };
  validateHelperManifest({ schemaVersion: 1, files: [entry] });
  assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [{ ...entry, bytes: entry.bytes + 1 }] }), /trusted path exception metadata mismatch/);
  assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [{ ...entry, sha256: '0'.repeat(64) }] }), /trusted path exception metadata mismatch/);
  assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [{ path: 'pilot/app/node_modules/my-cookie/session.json', bytes: contents.length, sha256: sha(Buffer.from(contents)) }] }), /sensitive/);
  const normal = fixtureFile('scripts/obs-pilot/source.js', 'original');
  const normalRoot = normal.tempRoot;
  fs.writeFileSync(normal.fullPath, 'tampered');
  assert.throws(() => validateSourceHash(normalRoot, 'scripts/obs-pilot/source.js', normal.bytes, normal.sha256), /source hash drift/);
  fs.rmSync(normal.tempRoot, { recursive: true, force: true });
  fs.rmSync(data.root, { recursive: true, force: true });
});

test('does not expose the public PEM exception through the helper-manifest API or lookalike paths', () => {
  const entry = {
    path: 'obs/data/obs-studio/OBSPublicRSAKey.pem',
    bytes: 814,
    sha256: '8cb9323b3e07c62c5298842aac70bfba50613f0319faa47369c99f176efd6ab2',
  };
  assert.throws(() => validateHelperManifest({ schemaVersion: 1, files: [entry] }), /requires verified source bytes/);
  assert.throws(() => validateHelperManifest({
    schemaVersion: 1,
    files: [{ ...entry, path: 'obs/data/obs-studio/OBSPublicRSAKey-copy.pem' }],
  }), /requires verified source bytes|forbidden transfer extension/);
  assert.throws(() => validateHelperManifest({
    schemaVersion: 1,
    files: [{ ...entry, path: 'obs/data/obs-studio/obspublicrsakey.pem' }],
  }), /requires verified source bytes|forbidden transfer extension/);
});

test('normalizes the actual pinned cookie source only after reparse and source hash verification', () => {
  const data = pinnedCookieFixture();
  try {
    const result = normalize(data);
    assert.equal(result.files, 1);
    assert.deepEqual(result.manifest.files, [{
      path: 'pilot/app/node_modules/cookie/index.js',
      bytes: data.source.bytes,
      sha256: data.source.sha256,
    }]);
  } finally {
    fs.rmSync(data.root, { recursive: true, force: true });
  }
});

test('rejects a reparse point at the exact pinned cookie source path', () => {
  const data = pinnedCookieFixture({ isolateRepositoryRoot: true });
  const link = path.join(data.repositoryRoot, 'app/node_modules/cookie/index.js');
  const original = path.join(path.resolve(__dirname, '../../..'), 'app/node_modules/cookie/index.js');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  try {
    fs.symlinkSync(original, link, 'file');
  } catch (error) {
    fs.rmSync(data.root, { recursive: true, force: true });
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return { skipped: true, reason: `symlink creation unavailable (${error.code})` };
    throw error;
  }
  try {
    assert.throws(() => normalize(data), /reparse source path/);
  } finally {
    fs.rmSync(data.root, { recursive: true, force: true });
  }
});

test('rejects tampered pinned cookie bytes/hash and non-exact sensitive target paths', () => {
  const badHash = pinnedCookieFixture();
  try {
    updateCookieFixtureMetadata(badHash, 'sha256', '0'.repeat(64));
    assert.throws(() => normalize(badHash), /source hash drift/);
  } finally {
    fs.rmSync(badHash.root, { recursive: true, force: true });
  }

  const badBytes = pinnedCookieFixture();
  try {
    updateCookieFixtureMetadata(badBytes, 'bytes', badBytes.source.bytes + 1);
    assert.throws(() => normalize(badBytes), /source hash drift/);
  } finally {
    fs.rmSync(badBytes.root, { recursive: true, force: true });
  }

  for (const sourcePath of [
    'app/node_modules/my-cookie/session.json',
    'app/node_modules/COOKIE/index.js',
    'app/node_modules/cookie-shadow/index.js',
  ]) {
    const lookalike = pinnedCookieFixture();
    try {
      lookalike.sidekickManifest.files[0].path = sourcePath;
      lookalike.sidekickManifest.effectiveTransfer.files[0].path = `pilot/${sourcePath}`;
      assert.throws(() => normalize(lookalike), /sensitive path segment/);
    } finally {
      fs.rmSync(lookalike.root, { recursive: true, force: true });
    }
  }
});

let failed = 0;
for (const item of cases) {
  try {
    const result = item.run();
    process.stdout.write(`${result && result.skipped ? 'SKIP' : 'PASS'} ${item.name}${result ? `: ${result.reason || ''}` : ''}\n`);
  } catch (error) {
    failed += 1;
    process.stderr.write(`FAIL ${item.name}: ${error.stack || error}\n`);
  }
}
process.stdout.write(`${cases.length - failed}/${cases.length} passed\n`);
process.exitCode = failed ? 1 : 0;
