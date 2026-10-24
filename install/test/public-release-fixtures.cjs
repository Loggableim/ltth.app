const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const api = require('../install.js');

function archive(changes = {}, method = 0) {
  const prefix = 'ltth_1.4.5/';
  const members = {
    'app/package.json': '{"version":"1.4.5"}', 'app/package-lock.json': '{}', 'app/server.js': 'server', 'app/launch.js': 'launch',
    'app/config/distribution-mode.json': '{"channel":"public"}',
    'app/config/plugin-release-policy.json': '{"schemaVersion":1,"closedBeta":["music-bot","sidekick"],"aliases":{},"publicRuntimeExcluded":[],"publicAssetPathOwners":{}}',
    ...changes
  };
  const locals = []; const directory = []; let offset = 0;
  for (const [name, text] of Object.entries(members)) {
    if (text === null) continue;
    const filename = Buffer.from(name.startsWith('ROOT:') ? name.slice(5) : prefix + name); const data = Buffer.from(text);
    const compressed = method === 8 ? require('node:zlib').deflateRawSync(data) : data;
    const crc = api.publicCRC(data); const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt16LE(method, 8); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, compressed);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt16LE(method, 10); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    directory.push(central, filename); offset += local.length + filename.length + compressed.length;
  }
  const cd = Buffer.concat(directory); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(directory.length / 2, 8); end.writeUInt16LE(directory.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
function manifest(bytes) { return { schema: 1, component: 'ltth_latest.zip', version: '1.4.5', tag: 'v1.4.5', commitSha: 'a'.repeat(40), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }; }
function temp(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-installer-fixture-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
function existing(dir) { const app = path.join(dir, 'app'); fs.mkdirSync(path.join(app, 'config'), { recursive: true }); fs.writeFileSync(path.join(app, 'package.json'), '{"version":"1.4.4"}'); fs.writeFileSync(path.join(app, 'old'), 'unchanged'); return app; }
const clean = () => { const bytes = archive(); return api.validatePublicZip(bytes, manifest(bytes)); };
process.env.LTTH_OFFLINE_UPDATE = '1';

test('public manifest accepts exact fields and rejects identity/limit errors', () => {
  const m = manifest(archive()); assert.deepEqual(api.releaseManifest(Buffer.from(JSON.stringify(m))), m);
  for (const extra of [{ tag: 'v1.4.4' }, { commitSha: 'main' }, { bytes: 0 }, { bytes: 1024 ** 3 }, { sha256: 'x' }, { extra: true }, { version: '01.4.5' }]) assert.throws(() => api.releaseManifest(Buffer.from(JSON.stringify({ ...m, ...extra }))));
});
for (const [name, changes] of Object.entries({
  root: { 'ROOT:wrong/app/file': 'bad' }, traversal: { 'app/../escape': 'bad' }, marker: { 'app/config/distribution-mode.json': '{"channel":"developer"}' },
  version: { 'app/package.json': '{"version":"1.4.4"}' }, missing: { 'app/launch.js': null }, policy: { 'app/config/plugin-release-policy.json': '{"schemaVersion":2}' },
  beta: { 'app/plugins/music-bot/main.js': 'bad' }, renamed: { 'app/plugins/vendor/plugin.json': '{"id":"sidekick"}' }, chatango: { 'app/public/js/chatango-theme-adapter.js': 'bad' }
})) test(`rejects ${name} before install`, () => { const bytes = archive(changes); assert.throws(() => api.validatePublicZip(bytes, manifest(bytes))); });
test('rejects digest and bytes mismatch', () => { const bytes = archive(); const m = manifest(bytes); assert.throws(() => api.validatePublicZip(bytes, { ...m, bytes: m.bytes + 1 })); assert.throws(() => api.validatePublicZip(bytes, { ...m, sha256: '0'.repeat(64) })); });
test('fresh public install never needs Git', (t) => { const dir = temp(t); const result = api.applyPublicEntries(clean(), dir); assert.equal(result.backup, null); assert.equal(fs.readFileSync(path.join(dir, 'app', 'server.js'), 'utf8'), 'server'); });
test('offline update preserves pointer/secrets/config bytes and old recovery copy', (t) => {
  const dir = temp(t); const app = existing(dir); const external = temp(t); const pointer = Buffer.from(external + '\r\n');
  fs.writeFileSync(path.join(app, '.config_path'), pointer); fs.writeFileSync(path.join(app, '.env'), 'SECRET=fixture'); fs.writeFileSync(path.join(app, 'config', 'settings.json'), '{"keep":true}');
  const result = api.applyPublicEntries(clean(), dir);
  assert.deepEqual(fs.readFileSync(path.join(app, '.config_path')), pointer); assert.equal(fs.readFileSync(path.join(app, '.env'), 'utf8'), 'SECRET=fixture'); assert.equal(fs.readFileSync(path.join(app, 'config', 'settings.json'), 'utf8'), '{"keep":true}'); assert.equal(fs.readFileSync(path.join(result.backup, 'old'), 'utf8'), 'unchanged');
});
for (const name of ['user_data', 'user_configs', 'uploads', 'logs', 'data']) test(`blocks legacy ${name} without changing files`, (t) => { const dir = temp(t); const app = existing(dir); fs.mkdirSync(path.join(app, name)); fs.writeFileSync(path.join(app, name, 'keep'), 'profile'); assert.throws(() => api.applyPublicEntries(clean(), dir)); assert.equal(fs.readFileSync(path.join(app, name, 'keep'), 'utf8'), 'profile'); assert.equal(fs.readFileSync(path.join(app, 'old'), 'utf8'), 'unchanged'); });
test('blocks local SQLite/WAL and in-app custom config pointer', (t) => { const dir = temp(t); const app = existing(dir); fs.writeFileSync(path.join(app, 'state.db-wal'), 'wal'); assert.throws(() => api.applyPublicEntries(clean(), dir)); fs.unlinkSync(path.join(app, 'state.db-wal')); fs.writeFileSync(path.join(app, '.config_path'), app); assert.throws(() => api.applyPublicEntries(clean(), dir)); });
test('same version and active/stale PID fail closed', (t) => { const dir = temp(t); const app = existing(dir); fs.writeFileSync(path.join(app, 'package.json'), '{"version":"1.4.5"}'); assert.throws(() => api.applyPublicEntries(clean(), dir)); fs.writeFileSync(path.join(dir, 'ltth.pid'), 'synthetic'); assert.throws(() => api.applyPublicEntries(clean(), dir)); });
test('rename failure restores old app', (t) => { const dir = temp(t); const app = existing(dir); assert.throws(() => api.applyPublicEntries(clean(), dir, (a, b) => { if (path.basename(a) === 'app' && a !== app) throw new Error('stage swap fault'); fs.renameSync(a, b); })); assert.equal(fs.readFileSync(path.join(app, 'old'), 'utf8'), 'unchanged'); });
test('restore failure is explicit and retains recovery data', (t) => { const dir = temp(t); const app = existing(dir); let retained; assert.throws(() => api.applyPublicEntries(clean(), dir, (a, b) => { if (a === app) { retained = b; fs.renameSync(a, b); } else throw new Error('fixture rename fault'); }), /RESTORE FAILED/); assert.equal(fs.readFileSync(path.join(retained, 'old'), 'utf8'), 'unchanged'); });
test('shell official branch delegates before Git; developer branch has explicit marker', () => { const source = fs.readFileSync(path.join(__dirname, '..', 'install.sh'), 'utf8'); const main = source.slice(source.indexOf('main() {')); assert.ok(main.indexOf('LTTH_DEVELOPER') < main.indexOf('ensure_git')); assert.ok(main.includes('no Git fallback')); assert.ok(main.includes('https://ltth.app/install/install.js')); assert.ok(source.includes('{"channel":"developer"}')); });

test('explicit Developer override is required for custom sources', () => {
  const { spawnSync } = require('node:child_process');
  const modulePath = path.join(__dirname, '..', 'install.js');
  const probe = (developer) => spawnSync(process.execPath, ['-e', `require(${JSON.stringify(modulePath)}).assertInstallMode()`], { env: { ...process.env, LTTH_REPO_BRANCH: 'custom-fixture', LTTH_DEVELOPER: developer }, encoding: 'utf8' });
  assert.notEqual(probe('0').status, 0); assert.equal(probe('1').status, 0);
});
test('existing app without explicit offline confirmation remains unchanged', (t) => {
  const dir = temp(t); const app = existing(dir); delete process.env.LTTH_OFFLINE_UPDATE;
  try { assert.throws(() => api.applyPublicEntries(clean(), dir), /LTTH_OFFLINE_UPDATE/); assert.equal(fs.readFileSync(path.join(app, 'old'), 'utf8'), 'unchanged'); } finally { process.env.LTTH_OFFLINE_UPDATE = '1'; }
});

test('normal bundled Quiz Show data does not falsely block an offline update', (t) => {
  const dir = temp(t); const app = existing(dir); const data = path.join(app, 'plugins', 'quiz-show', 'data'); fs.mkdirSync(data, { recursive: true }); fs.writeFileSync(path.join(data, 'allgemeinwissen-40.json'), '["old bundled quiz"]');
  const bytes = archive({ 'app/plugins/quiz-show/data/allgemeinwissen-40.json': '["current bundled quiz"]' });
  const result = api.applyPublicEntries(api.validatePublicZip(bytes, manifest(bytes)), dir);
  assert.equal(fs.readFileSync(path.join(data, 'allgemeinwissen-40.json'), 'utf8'), '["current bundled quiz"]');
  assert.equal(fs.readFileSync(path.join(result.backup, 'plugins', 'quiz-show', 'data', 'allgemeinwissen-40.json'), 'utf8'), '["old bundled quiz"]');
});
test('PID refusal explains stopped-app verification, exact PID file and offline setting', (t) => {
  const dir = temp(t); const app = existing(dir); const pid = path.join(dir, 'ltth.pid'); fs.writeFileSync(pid, 'synthetic-stale');
  assert.throws(() => api.applyPublicEntries(clean(), dir), (error) => error.message.includes(pid) && error.message.includes('never terminate an unidentified process') && error.message.includes('LTTH_OFFLINE_UPDATE=1'));
  assert.equal(fs.readFileSync(pid, 'utf8'), 'synthetic-stale'); assert.equal(fs.readFileSync(path.join(app, 'old'), 'utf8'), 'unchanged');
});

test('real release DEFLATE compression and CRC rejection are exercised', () => {
  const bytes = archive({}, 8); assert.ok(api.validatePublicZip(bytes, manifest(bytes)).has('app/server.js'));
  const corrupt = Buffer.from(bytes); const directory = corrupt.readUInt32LE(corrupt.length - 6); corrupt.writeUInt32LE((corrupt.readUInt32LE(directory + 16) ^ 1) >>> 0, directory + 16);
  assert.throws(() => api.validatePublicZip(corrupt, manifest(corrupt)), /CRC/);
});
const withdrawn = ['animazingpal', 'interactive-story', 'music-bot', 'osc-bridge', 'schnorrbecher', 'sidekick', 'stream-monsters', 'talking-heads', 'visual-fx-frame-webgpu', 'webgpu-emoji-rain', 'webgpu-weather-control'];
for (const id of [...withdrawn, 'chatango', 'streamalchemy']) test(`complete withdrawal fixture rejects ${id}`, () => {
  const bytes = archive({ 'app/config/plugin-release-policy.json': JSON.stringify({ schemaVersion: 1, closedBeta: withdrawn, aliases: { streamalchemy: 'stream-monsters' }, publicAssetPathOwners: {} }), [`app/plugins/${id}/main.js`]: 'withdrawn' });
  assert.throws(() => api.validatePublicZip(bytes, manifest(bytes)));
});

test('legacy plugin private JSON is protected even beside a release-owned asset', (t) => {
  const dir = temp(t); const app = existing(dir); const data = path.join(app, 'plugins', 'example', 'data'); fs.mkdirSync(data, { recursive: true }); const privateFile = path.join(data, 'private.json'); fs.writeFileSync(privateFile, '{"keep":"private"}');
  assert.throws(() => api.applyPublicEntries(clean(), dir), /data directory|data file/);
  assert.equal(fs.readFileSync(privateFile, 'utf8'), '{"keep":"private"}'); assert.equal(fs.readFileSync(path.join(app, 'old'), 'utf8'), 'unchanged');
  const bytes = archive({ 'app/plugins/example/data/public.json': '{"owned":true}' });
  assert.throws(() => api.applyPublicEntries(api.validatePublicZip(bytes, manifest(bytes)), dir), /data file/); assert.equal(fs.readFileSync(privateFile, 'utf8'), '{"keep":"private"}');
});
test('unexpected nested user_data and empty private data folder block safely', (t) => {
  const dir = temp(t); const app = existing(dir); const data = path.join(app, 'plugins', 'example', 'user_data'); fs.mkdirSync(data, { recursive: true }); fs.writeFileSync(path.join(data, 'private.json'), 'private');
  assert.throws(() => api.applyPublicEntries(clean(), dir)); fs.rmSync(data, { recursive: true }); fs.mkdirSync(path.join(app, 'plugins', 'example', 'data'));
  assert.throws(() => api.applyPublicEntries(clean(), dir)); assert.equal(fs.readFileSync(path.join(app, 'old'), 'utf8'), 'unchanged');
});

test('Developer non-Git target preserves bootstrap pointer, profiles and logs byte-for-byte', (t) => {
  const dir = temp(t); const pointer = Buffer.from('custom-profile-fixture\r\n'); const profile = Buffer.from([0, 255, 7, 9]);
  fs.writeFileSync(path.join(dir, '.config_path'), pointer); fs.mkdirSync(path.join(dir, 'user_configs')); fs.writeFileSync(path.join(dir, 'user_configs', 'profile.marker'), profile); fs.writeFileSync(path.join(dir, 'ltth.log'), 'keep log');
  assert.throws(() => api.assertDeveloperCloneTarget(dir), /Nonempty non-Git Developer target rejected/);
  assert.deepEqual(fs.readFileSync(path.join(dir, '.config_path')), pointer); assert.deepEqual(fs.readFileSync(path.join(dir, 'user_configs', 'profile.marker')), profile); assert.equal(fs.readFileSync(path.join(dir, 'ltth.log'), 'utf8'), 'keep log');
});
test('Developer clone target accepts existing empty and absent targets without removing them', (t) => {
  const dir = temp(t); api.assertDeveloperCloneTarget(dir); assert.ok(fs.existsSync(dir)); assert.deepEqual(fs.readdirSync(dir), []);
  const absent = path.join(dir, 'absent'); api.assertDeveloperCloneTarget(absent); assert.equal(fs.existsSync(absent), false);
});
test('Developer production download path checks target before clone and contains no non-Git deletion', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'install.js'), 'utf8'); const body = source.slice(source.indexOf('async function downloadSource()'), source.indexOf('async function installDeps()'));
  assert.ok(body.indexOf('assertDeveloperCloneTarget(cfg.dir)') < body.indexOf('await cloneRepository()')); assert.ok(!body.includes('fs.rmSync(cfg.dir'));
});

function recoveryTarget(t) {
  const parent = temp(t); const dir = path.join(parent, 'checkout'); fs.mkdirSync(dir); fs.mkdirSync(path.join(dir, '.git'));
  const pointer = Buffer.from('fixture-external-profile\r\n'); const marker = Buffer.from([255, 0, 5, 9]);
  fs.writeFileSync(path.join(dir, '.config_path'), pointer); fs.mkdirSync(path.join(dir, 'user_configs')); fs.writeFileSync(path.join(dir, 'user_configs', 'profile.marker'), marker); fs.writeFileSync(path.join(dir, 'ltth.log'), 'original log');
  const preserved = (location) => { assert.deepEqual(fs.readFileSync(path.join(location, '.config_path')), pointer); assert.deepEqual(fs.readFileSync(path.join(location, 'user_configs', 'profile.marker')), marker); assert.equal(fs.readFileSync(path.join(location, 'ltth.log'), 'utf8'), 'original log'); };
  return { dir, preserved };
}
test('Developer recovery rename failure leaves original bytes and never clones', async (t) => {
  const { dir, preserved } = recoveryTarget(t); let cloned = false;
  await assert.rejects(api.recoverDeveloperCheckout(dir, async () => { cloned = true; }, () => { throw new Error('fixture move failure'); }, 'move'), /clone was not attempted/);
  assert.equal(cloned, false); preserved(dir);
});
test('Developer failed clone restores original and preserves partial checkout', async (t) => {
  const { dir, preserved } = recoveryTarget(t);
  await assert.rejects(api.recoverDeveloperCheckout(dir, async () => { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'partial.log'), 'clone diagnostic'); throw new Error('fixture clone failure'); }, fs.renameSync, 'clone'), /original checkout restored/);
  preserved(dir); assert.equal(fs.readFileSync(path.join(`${dir}.failed-clone-clone`, 'partial.log'), 'utf8'), 'clone diagnostic');
});
test('Developer clone failure without partial checkout restores original bytes', async (t) => {
  const { dir, preserved } = recoveryTarget(t); await assert.rejects(api.recoverDeveloperCheckout(dir, async () => { throw new Error('clone failed before files'); }, fs.renameSync, 'early'), /original checkout restored/); preserved(dir);
});
test('Developer restore failure retains original backup and partial clone with exact paths', async (t) => {
  const { dir, preserved } = recoveryTarget(t); const backup = `${dir}.recovery-backup-restore`; const partial = `${dir}.failed-clone-restore`;
  await assert.rejects(api.recoverDeveloperCheckout(dir, async () => { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'partial'), 'partial'); throw new Error('clone failed'); }, (a, b) => { if (a === backup) throw new Error('restore fault'); fs.renameSync(a, b); }, 'restore'), (error) => error.message.includes('RESTORE FAILED') && error.message.includes(backup) && error.message.includes(partial));
  preserved(backup); assert.equal(fs.readFileSync(path.join(partial, 'partial'), 'utf8'), 'partial');
});
test('Developer partial-clone move failure retains both directories untouched', async (t) => {
  const { dir, preserved } = recoveryTarget(t); const backup = `${dir}.recovery-backup-partial`;
  await assert.rejects(api.recoverDeveloperCheckout(dir, async () => { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'partial'), 'keep'); throw new Error('clone failed'); }, (a, b) => { if (a === dir && b.includes('failed-clone')) throw new Error('partial move fault'); fs.renameSync(a, b); }, 'partial'), /manual recovery required/);
  preserved(backup); assert.equal(fs.readFileSync(path.join(dir, 'partial'), 'utf8'), 'keep');
});
test('Developer successful synthetic clone never removes original backup', async (t) => {
  const { dir, preserved } = recoveryTarget(t); const result = await api.recoverDeveloperCheckout(dir, async () => { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'new-source'), 'new'); }, fs.renameSync, 'success'); preserved(result.backup); assert.equal(fs.readFileSync(path.join(dir, 'new-source'), 'utf8'), 'new');
});
test('Developer recovery destination collision refuses to move/delete any copy', async (t) => {
  const { dir, preserved } = recoveryTarget(t); const backup = `${dir}.recovery-backup-collision`; fs.mkdirSync(backup); fs.writeFileSync(path.join(backup, 'keep'), 'unrelated'); let cloned = false;
  await assert.rejects(api.recoverDeveloperCheckout(dir, async () => { cloned = true; }, fs.renameSync, 'collision'), /already exists/); assert.equal(cloned, false); preserved(dir); assert.equal(fs.readFileSync(path.join(backup, 'keep'), 'utf8'), 'unrelated');
});

test('actual entry guard runs exactly once for file, pipe and node -, never require imports', (t) => {
  const { spawnSync } = require('node:child_process'); const source = fs.readFileSync(path.join(__dirname, '..', 'install.js'), 'utf8');
  const start = source.indexOf('async function main() {'); const entry = source.indexOf('// Node\'s pipe / `node -` entry');
  assert.ok(start >= 0 && entry > start);
  // Real main is excluded from the subprocess payload; no installer/net/process action occurs.
  const probe = source.slice(0, start) + 'async function main() { console.log("ENTRY-FIXTURE-MAIN"); }\n' + source.slice(entry);
  const file = path.join(temp(t), 'entry-fixture.cjs'); fs.writeFileSync(file, probe);
  for (const args of [[], ['-']]) { const result = spawnSync(process.execPath, args, { input: probe, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), 'ENTRY-FIXTURE-MAIN'); }
  const direct = spawnSync(process.execPath, [file], { encoding: 'utf8' }); assert.equal(direct.status, 0, direct.stderr); assert.equal(direct.stdout.trim(), 'ENTRY-FIXTURE-MAIN');
  const imported = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(file)})`], { encoding: 'utf8' }); assert.equal(imported.status, 0, imported.stderr); assert.equal(imported.stdout.trim(), '');
  const realImport = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(__dirname, '..', 'install.js'))})`], { encoding: 'utf8' }); assert.equal(realImport.status, 0, realImport.stderr); assert.equal(realImport.stdout.trim(), '');
});

for (const required of ['app/package.json', 'app/package-lock.json', 'app/server.js', 'app/launch.js', 'app/config/distribution-mode.json', 'app/config/plugin-release-policy.json']) test(`required file case is exact before swap: ${required}`, (t) => {
  const defaults = {
    'app/package.json': '{"version":"1.4.5"}', 'app/package-lock.json': '{}', 'app/server.js': 'server', 'app/launch.js': 'launch',
    'app/config/distribution-mode.json': '{"channel":"public"}', 'app/config/plugin-release-policy.json': '{"schemaVersion":1,"closedBeta":["music-bot"],"aliases":{},"publicAssetPathOwners":{}}'
  };
  const alternative = required.slice(0, required.lastIndexOf('/') + 1) + required.slice(required.lastIndexOf('/') + 1).toUpperCase();
  const bytes = archive({ [required]: null, [alternative]: defaults[required] }); const dir = temp(t); const app = existing(dir);
  assert.throws(() => api.applyPublicEntries(api.validatePublicZip(bytes, manifest(bytes)), dir), /noncanonical/); assert.equal(fs.readFileSync(path.join(app, 'old'), 'utf8'), 'unchanged');
});
test('APP/server.js cannot validate then disappear during extraction', () => {
  const bytes = archive({ 'app/server.js': null, 'APP/server.js': 'server' }); assert.throws(() => api.validatePublicZip(bytes, manifest(bytes)), /Noncanonical app directory/);
});
for (const pointer of ['app/.config_path', 'app/.CONFIG_PATH']) test(`public artifact bootstrap pointer is denied: ${pointer}`, (t) => {
  const bytes = archive({ [pointer]: 'C:/fixture/external-profile' }); const dir = temp(t);
  assert.throws(() => api.applyPublicEntries(api.validatePublicZip(bytes, manifest(bytes)), dir), /bootstrap config pointer/); assert.equal(fs.existsSync(path.join(dir, 'app')), false);
});
