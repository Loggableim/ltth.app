'use strict';

/**
 * Tests for the Config Backup & Restore system.
 *
 * Covers:
 *  - manifest creation and validation
 *  - checksum computation
 *  - plugin discovery (settings export / import from DB)
 *  - file collector (ignore patterns, path safety)
 *  - validators (backup size, path traversal)
 *  - conflict resolver (merge vs replace)
 *  - importer (parse, preview, perform – including dry run and path traversal protection)
 *  - PluginAPI.registerBackupProvider() extension
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

console.log('🧪 Running Config Backup & Restore Tests...\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        failed++;
    }
}

async function runAsyncTest(name, fn) {
    try {
        await fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        failed++;
    }
}

// ── Module paths ──────────────────────────────────────────────────────────────
const BACKUP_DIR = path.join(__dirname, '..', 'modules', 'backup');
const { createManifest, validateManifest, FORMAT_VERSION } = require(path.join(BACKUP_DIR, 'manifest'));
const { computeChecksum, computeFileChecksum, verifyChecksum } = require(path.join(BACKUP_DIR, 'checksum'));
const {
    discoverAllPluginSettings, discoverPluginSettings, discoverGlobalSettings,
    restorePluginSettings, restoreGlobalSettings, extractPluginId, extractSubKey
} = require(path.join(BACKUP_DIR, 'plugin-discovery'));
const { collectFiles, collectPluginFiles, shouldIgnore, DEFAULT_IGNORE_PATTERNS } = require(path.join(BACKUP_DIR, 'file-collector'));
const {
    validateBackupSize, validateEntryPath, validateDestinationPath,
    sanitisePluginId, MAX_BACKUP_SIZE_BYTES
} = require(path.join(BACKUP_DIR, 'validators'));
const {
    detectSettingsConflicts, detectPluginConflicts, mergeSettings, replaceSettings
} = require(path.join(BACKUP_DIR, 'conflict-resolver'));
const { parseBackupZip, previewImport, performImport, cleanupTempDir } = require(path.join(BACKUP_DIR, 'importer'));
const BackupManager = require(path.join(__dirname, '..', 'modules', 'backup-manager'));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTestDb() {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
    return db;
}

async function createTestZip(entries) {
    const archiver = require('archiver');
    const tmpOut = path.join(os.tmpdir(), `test-backup-${Date.now()}.zip`);
    const out = fs.createWriteStream(tmpOut);
    const archive = archiver('zip');
    archive.pipe(out);
    for (const [name, content] of Object.entries(entries)) {
        archive.append(typeof content === 'string' ? content : JSON.stringify(content), { name });
    }
    await new Promise((resolve, reject) => {
        out.on('close', resolve);
        archive.on('error', reject);
        archive.finalize();
    });
    return tmpOut;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Synchronous tests (run immediately)
// ═══════════════════════════════════════════════════════════════════════════════

// 1. manifest.js
runTest('manifest: createManifest returns expected shape', () => {
    const m = createManifest({ appVersion: '1.2.3', profile: 'test', options: { a: 1 }, plugins: [], warnings: [] });
    assert.strictEqual(m.formatVersion, FORMAT_VERSION);
    assert.strictEqual(m.app.version, '1.2.3');
    assert.strictEqual(m.sourceProfile, 'test');
    assert(m.exportedAt.length > 0);
    assert(Array.isArray(m.plugins));
    assert(Array.isArray(m.warnings));
});

runTest('manifest: createManifest uses defaults when opts omitted', () => {
    const m = createManifest();
    assert.strictEqual(m.app.version, 'unknown');
    assert.strictEqual(m.sourceProfile, null);
    assert.deepStrictEqual(m.plugins, []);
});

runTest('manifest: validateManifest accepts valid manifest', () => {
    const m = createManifest({ appVersion: '1.0.0' });
    const result = validateManifest(m);
    assert.strictEqual(result.valid, true, result.errors.join(', '));
});

runTest('manifest: validateManifest rejects null', () => {
    const result = validateManifest(null);
    assert.strictEqual(result.valid, false);
});

runTest('manifest: validateManifest rejects missing formatVersion', () => {
    const m = createManifest();
    delete m.formatVersion;
    const result = validateManifest(m);
    assert.strictEqual(result.valid, false);
});

runTest('manifest: validateManifest rejects bad timestamp', () => {
    const m = createManifest();
    m.exportedAt = 'not-a-date';
    const result = validateManifest(m);
    assert.strictEqual(result.valid, false);
});

// 2. checksum.js
runTest('checksum: computeChecksum returns consistent hex string', () => {
    const cs1 = computeChecksum('hello');
    const cs2 = computeChecksum('hello');
    const cs3 = computeChecksum('world');
    assert.strictEqual(cs1, cs2);
    assert.notStrictEqual(cs1, cs3);
    assert.match(cs1, /^[0-9a-f]{64}$/);
});

runTest('checksum: verifyChecksum returns true for matching data', () => {
    const data = 'test data 123';
    const cs = computeChecksum(data);
    assert.strictEqual(verifyChecksum(data, cs), true);
    assert.strictEqual(verifyChecksum('other', cs), false);
});

runTest('checksum: computeFileChecksum works on temp file', () => {
    const tmpFile = path.join(os.tmpdir(), `ck-test-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'filedata');
    const cs = computeFileChecksum(tmpFile);
    assert.match(cs, /^[0-9a-f]{64}$/);
    assert.strictEqual(cs, computeChecksum('filedata'));
    fs.unlinkSync(tmpFile);
});

// 3. plugin-discovery.js
runTest('discovery: extractPluginId and extractSubKey work correctly', () => {
    assert.strictEqual(extractPluginId('plugin:quiz-show:config'), 'quiz-show');
    assert.strictEqual(extractSubKey('plugin:quiz-show:config'), 'config');
    assert.strictEqual(extractPluginId('global-setting'), null);
    assert.strictEqual(extractSubKey('not-a-plugin-key'), null);
});

runTest('discovery: discoverAllPluginSettings groups settings by plugin', () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO settings VALUES (?,?)").run('plugin:quiz:config', '{"enabled":true}');
    db.prepare("INSERT INTO settings VALUES (?,?)").run('plugin:quiz:score', '42');
    db.prepare("INSERT INTO settings VALUES (?,?)").run('plugin:other:key', '"val"');
    db.prepare("INSERT INTO settings VALUES (?,?)").run('global-key', '"g"');

    const result = discoverAllPluginSettings(db);
    assert.deepStrictEqual(result.quiz.config, { enabled: true });
    assert.strictEqual(result.quiz.score, 42);
    assert.strictEqual(result.other.key, 'val');
    assert(!result['global-key'], 'Global key should not be in plugin results');
});

runTest('discovery: discoverGlobalSettings excludes plugin keys', () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO settings VALUES (?,?)").run('theme', '"dark"');
    db.prepare("INSERT INTO settings VALUES (?,?)").run('plugin:x:k', '"v"');

    const result = discoverGlobalSettings(db);
    assert.strictEqual(result.theme, '"dark"');
    assert(!('plugin:x:k' in result), 'plugin key should be excluded');
});

runTest('discovery: restorePluginSettings merge mode skips existing', () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO settings VALUES (?,?)").run('plugin:myplugin:key1', '"existing"');

    const r = restorePluginSettings(db, 'myplugin', { key1: 'new', key2: 'added' }, 'merge');
    assert(r.imported.includes('key2'));
    assert(r.skipped.includes('key1'));
    const row = db.prepare("SELECT value FROM settings WHERE key='plugin:myplugin:key1'").get();
    assert.strictEqual(JSON.parse(row.value), 'existing');
});

runTest('discovery: restorePluginSettings replace mode overwrites', () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO settings VALUES (?,?)").run('plugin:p:k', '"old"');

    const r = restorePluginSettings(db, 'p', { k: 'new' }, 'replace');
    assert(r.imported.includes('k'));
    const row = db.prepare("SELECT value FROM settings WHERE key='plugin:p:k'").get();
    assert.strictEqual(JSON.parse(row.value), 'new');
});

runTest('discovery: restoreGlobalSettings merge skips existing', () => {
    const db = makeTestDb();
    db.prepare("INSERT INTO settings VALUES (?,?)").run('theme', '"light"');

    const r = restoreGlobalSettings(db, { theme: 'dark', newKey: 'x' }, 'merge');
    assert(r.skipped.includes('theme'));
    assert(r.imported.includes('newKey'));
});

runTest('discovery: restoreGlobalSettings preserves raw string values', () => {
    const db = makeTestDb();

    restoreGlobalSettings(db, {
        tts_openai_api_key: 'sk-test',
        network_external_urls: ['https://example.test']
    }, 'replace');

    const apiKey = db.prepare("SELECT value FROM settings WHERE key='tts_openai_api_key'").get();
    const urls = db.prepare("SELECT value FROM settings WHERE key='network_external_urls'").get();

    assert.strictEqual(apiKey.value, 'sk-test');
    assert.strictEqual(urls.value, '["https://example.test"]');
});

// 4. file-collector.js
runTest('file-collector: shouldIgnore matches default patterns', () => {
    assert(shouldIgnore('.hidden', DEFAULT_IGNORE_PATTERNS));
    assert(shouldIgnore('cache', DEFAULT_IGNORE_PATTERNS));
    assert(shouldIgnore('logs', DEFAULT_IGNORE_PATTERNS));
    assert(shouldIgnore('debug.log', DEFAULT_IGNORE_PATTERNS));
    assert(!shouldIgnore('data.db', DEFAULT_IGNORE_PATTERNS));
    assert(!shouldIgnore('config.json', DEFAULT_IGNORE_PATTERNS));
});

runTest('file-collector: collectFiles returns correct relative paths', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
    try {
        fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'content');
        fs.mkdirSync(path.join(tmpDir, 'sub'));
        fs.writeFileSync(path.join(tmpDir, 'sub', 'b.txt'), 'content2');
        fs.mkdirSync(path.join(tmpDir, 'cache'));
        fs.writeFileSync(path.join(tmpDir, 'cache', 'ignored.txt'), 'x');

        const { files } = collectFiles(tmpDir, tmpDir);
        const relPaths = files.map(f => f.relPath);
        assert(relPaths.some(r => r === 'a.txt' || r === path.normalize('a.txt')));
        assert(relPaths.some(r => r.includes('b.txt')));
        assert(!relPaths.some(r => r.includes('ignored.txt')), 'Cache file should be ignored');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

runTest('file-collector: collectPluginFiles returns empty for missing dir', () => {
    const { files } = collectPluginFiles('/nonexistent/dir');
    assert.strictEqual(files.length, 0);
});

// 5. validators.js
runTest('validators: validateBackupSize accepts normal sizes', () => {
    assert.strictEqual(validateBackupSize(1024).valid, true);
    assert.strictEqual(validateBackupSize(0).valid, true);
});

runTest('validators: validateBackupSize rejects oversized files', () => {
    const result = validateBackupSize(MAX_BACKUP_SIZE_BYTES + 1);
    assert.strictEqual(result.valid, false);
    assert(result.error.includes('exceeds maximum'));
});

runTest('validators: validateEntryPath accepts safe paths', () => {
    assert.strictEqual(validateEntryPath('plugins/quiz/settings.json').valid, true);
    assert.strictEqual(validateEntryPath('global/settings.json').valid, true);
});

runTest('validators: validateEntryPath rejects directory traversal', () => {
    assert.strictEqual(validateEntryPath('../etc/passwd').valid, false);
    assert.strictEqual(validateEntryPath('../../secret').valid, false);
    assert.strictEqual(validateEntryPath('/absolute/path').valid, false);
});

runTest('validators: validateEntryPath rejects null bytes', () => {
    assert.strictEqual(validateEntryPath('file\0name').valid, false);
});

runTest('validators: validateDestinationPath detects traversal after join', () => {
    const base = path.join(os.tmpdir(), 'safe-base');
    const good = path.join(base, 'sub', 'file.txt');
    const bad = path.join(base, '..', '..', 'etc', 'passwd');
    assert.strictEqual(validateDestinationPath(good, base).valid, true);
    assert.strictEqual(validateDestinationPath(bad, base).valid, false);
});

runTest('validators: sanitisePluginId rejects dangerous IDs', () => {
    assert.strictEqual(sanitisePluginId('../evil'), null);
    assert.strictEqual(sanitisePluginId('ok-plugin'), 'ok-plugin');
    assert.strictEqual(sanitisePluginId(''), null);
    assert.strictEqual(sanitisePluginId(null), null);
    assert.strictEqual(sanitisePluginId('plugin/with/slashes'), 'pluginwithslashes');
});

// 6. conflict-resolver.js
runTest('conflict-resolver: detectSettingsConflicts classifies correctly', () => {
    const backup  = { a: 1, b: 2, c: 3 };
    const current = { b: 2, c: 99, d: 4 };
    const r = detectSettingsConflicts(backup, current);
    assert(r.new.includes('a'));
    assert(r.unchanged.includes('b'));
    assert(r.conflicts.includes('c'));
    assert(!r.new.includes('d'), 'key only in current should not appear');
});

runTest('conflict-resolver: mergeSettings keeps existing values', () => {
    const merged = mergeSettings({ a: 1, b: 2 }, { b: 99 });
    assert.strictEqual(merged.a, 1);
    assert(!('b' in merged), 'existing key should be excluded from merge output');
});

runTest('conflict-resolver: replaceSettings returns all backup values', () => {
    const replaced = replaceSettings({ a: 1, b: 2 });
    assert.deepStrictEqual(replaced, { a: 1, b: 2 });
});

runTest('conflict-resolver: detectPluginConflicts returns per-plugin results', () => {
    const backupPlugins  = { quiz: { k1: 'v1', k2: 'old' } };
    const currentPlugins = { quiz: { k2: 'new' } };
    const r = detectPluginConflicts(backupPlugins, currentPlugins);
    assert(r.quiz.new.includes('k1'));
    assert(r.quiz.conflicts.includes('k2'));
});

// 9. BackupManager
runTest('BackupManager: registerBackupProvider and getBackupProvider work', () => {
    const db = makeTestDb();
    const mockLogger = { info: () => {}, warn: () => {}, error: () => {} };
    const configPathManager = { getPluginDataDir: () => os.tmpdir(), getUploadsDir: () => os.tmpdir(), getUserDataDir: () => os.tmpdir() };
    const pluginLoader = { loadedPlugins: new Map() };

    const bm = new BackupManager({ db, configPathManager, pluginLoader, logger: mockLogger });

    const provider = {
        exportConfig: async () => ({ settings: { myKey: 'myVal' }, warnings: [] }),
        importConfig: async () => ({ success: true, importedKeys: ['myKey'], warnings: [] })
    };

    bm.registerBackupProvider('test-plugin', provider);
    const got = bm.getBackupProvider('test-plugin');
    assert.strictEqual(got, provider, 'Should retrieve the same provider');
});

runTest('BackupManager: unregisterBackupProvider removes provider', () => {
    const db = makeTestDb();
    const mockLogger = { info: () => {}, warn: () => {}, error: () => {} };
    const configPathManager = { getPluginDataDir: () => os.tmpdir(), getUploadsDir: () => os.tmpdir(), getUserDataDir: () => os.tmpdir() };
    const pluginLoader = { loadedPlugins: new Map() };

    const bm = new BackupManager({ db, configPathManager, pluginLoader, logger: mockLogger });
    bm.registerBackupProvider('plugin-x', { exportConfig: async () => ({}) });
    bm.unregisterBackupProvider('plugin-x');
    assert.strictEqual(bm.getBackupProvider('plugin-x'), null, 'Provider should be removed');
});

runTest('BackupManager: getCapabilities returns expected structure', () => {
    const db = makeTestDb();
    const mockLogger = { info: () => {}, warn: () => {}, error: () => {} };
    const configPathManager = { getPluginDataDir: () => os.tmpdir(), getUploadsDir: () => os.tmpdir(), getUserDataDir: () => os.tmpdir() };
    const pluginLoader = { loadedPlugins: new Map([['plugin-a', {}], ['plugin-b', {}]]) };

    const bm = new BackupManager({ db, configPathManager, pluginLoader, logger: mockLogger });
    const caps = bm.getCapabilities();
    assert.strictEqual(caps.supportsExport, true);
    assert.strictEqual(caps.supportsImport, true);
    assert(caps.loadedPlugins.includes('plugin-a'));
    assert(caps.supportedImportModes.includes('merge'));
    assert(caps.supportedImportModes.includes('replace'));
});

// 10. Legacy backward compatibility
runTest('legacy: config-import plugin still instantiates and validates paths', () => {
    const ConfigImportPlugin = require('../plugins/config-import/main.js');
    const mockApi = {
        logs: [],
        log: function(msg, level) { this.logs.push({ msg, level }); },
        registerRoute: function() {},
        getBackupManager: function() { return null; }
    };
    const plugin = new ConfigImportPlugin(mockApi);
    assert(plugin instanceof ConfigImportPlugin);

    const goodPath = '/home/user/old-install';
    const result = plugin.sanitizePath(goodPath);
    assert(result !== null, 'Valid path should not be null');

    const traversal = plugin.sanitizePath('../../../etc/passwd');
    assert.strictEqual(traversal, null, 'Traversal must be rejected');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Async tests
// ═══════════════════════════════════════════════════════════════════════════════

async function runAllAsyncTests() {
    await runAsyncTest('importer: parseBackupZip rejects invalid ZIP', async () => {
        const tmpFile = path.join(os.tmpdir(), `bad-${Date.now()}.zip`);
        fs.writeFileSync(tmpFile, 'not a zip');
        const result = await parseBackupZip(tmpFile);
        assert(result.errors.length > 0, 'Should have errors for invalid ZIP');
        fs.unlinkSync(tmpFile);
    });

    await runAsyncTest('importer: parseBackupZip rejects ZIP without manifest', async () => {
        const zipPath = await createTestZip({ 'data.txt': 'hello' });
        const result = await parseBackupZip(zipPath);
        assert(result.errors.some(e => e.includes('manifest')), 'Should require manifest.json');
        fs.unlinkSync(zipPath);
    });

    await runAsyncTest('importer: parseBackupZip accepts valid backup ZIP', async () => {
        const manifest = createManifest({ appVersion: '1.0.0', plugins: [], warnings: [] });
        const globalSettings = { theme: 'dark' };
        const pluginSettings = { config: { apiKey: 'xxx' } };

        const zipPath = await createTestZip({
            'manifest.json': manifest,
            'global/settings.json': globalSettings,
            'plugins/test-plugin/settings.json': pluginSettings
        });

        const result = await parseBackupZip(zipPath, fs.statSync(zipPath).size);
        assert.strictEqual(result.errors.length, 0, result.errors.join('; '));
        assert(result.manifest, 'Should have manifest');
        assert.deepStrictEqual(result.globalSettings, globalSettings);
        assert.deepStrictEqual(result.pluginSettings['test-plugin'], pluginSettings);

        if (result.tmpDir) cleanupTempDir(result.tmpDir);
        fs.unlinkSync(zipPath);
    });

    await runAsyncTest('importer: previewImport returns conflict analysis', async () => {
        const manifest = createManifest({ appVersion: '1.0.0', plugins: [{ id: 'myplugin' }] });
        const zipPath = await createTestZip({
            'manifest.json': manifest,
            'global/settings.json': { existingKey: 'changed', newKey: 'added' },
            'plugins/myplugin/settings.json': { setting1: 'v1' }
        });

        const db = makeTestDb();
        db.prepare("INSERT INTO settings VALUES (?,?)").run('existingKey', '"original"');

        const parsed = await parseBackupZip(zipPath);
        assert(parsed.errors.length === 0, parsed.errors.join('; '));

        const preview = previewImport(parsed, { db });
        assert(preview.global.conflicts >= 1, 'existingKey should be a conflict');
        assert(preview.global.new >= 1, 'newKey should be new');

        if (parsed.tmpDir) cleanupTempDir(parsed.tmpDir);
        fs.unlinkSync(zipPath);
    });

    await runAsyncTest('importer: performImport merge mode preserves existing values', async () => {
        const manifest = createManifest({ appVersion: '1.0.0', plugins: [] });
        const zipPath = await createTestZip({
            'manifest.json': manifest,
            'global/settings.json': { theme: 'light', newPref: 'yes' }
        });

        const db = makeTestDb();
        db.prepare("INSERT INTO settings VALUES (?,?)").run('theme', '"dark"');

        const parsed = await parseBackupZip(zipPath);
        const configPathManager = {
            getUserDataDir: () => os.tmpdir(),
            getUploadsDir: () => os.tmpdir(),
            getPluginDataDir: () => os.tmpdir()
        };
        const result = await performImport(parsed, { db, configPathManager }, { mode: 'merge', includeGlobalSettings: true });

        assert.strictEqual(result.success, true);
        const row = db.prepare("SELECT value FROM settings WHERE key='theme'").get();
        assert.strictEqual(JSON.parse(row.value), 'dark', 'theme should remain dark in merge mode');

        const newRow = db.prepare("SELECT value FROM settings WHERE key='newPref'").get();
        assert(newRow, 'newPref should be imported');
        fs.unlinkSync(zipPath);
    });

    await runAsyncTest('importer: performImport replace mode overwrites existing values', async () => {
        const manifest = createManifest({ appVersion: '1.0.0', plugins: [] });
        const zipPath = await createTestZip({
            'manifest.json': manifest,
            'global/settings.json': { theme: 'light' }
        });

        const db = makeTestDb();
        db.prepare("INSERT INTO settings VALUES (?,?)").run('theme', '"dark"');

        const parsed = await parseBackupZip(zipPath);
        const configPathManager = {
            getUserDataDir: () => os.tmpdir(),
            getUploadsDir: () => os.tmpdir(),
            getPluginDataDir: () => os.tmpdir()
        };
        await performImport(parsed, { db, configPathManager }, { mode: 'replace', includeGlobalSettings: true });

        const row = db.prepare("SELECT value FROM settings WHERE key='theme'").get();
        assert.strictEqual(row.value, 'light', 'theme should be replaced with light');
        fs.unlinkSync(zipPath);
    });

    await runAsyncTest('importer: performImport restores user_configs and remaps active profile', async () => {
        const manifest = createManifest({
            appVersion: '1.0.0',
            options: { includeUserConfigs: true },
            plugins: []
        });
        const zipPath = await createTestZip({
            'manifest.json': manifest,
            'user_configs/default.db': 'imported-db',
            'user_configs/default_plugins_state.json': '{"soundboard":{"enabled":true}}',
            'user_configs/.active_profile': 'default'
        });

        const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'user-config-import-'));
        const userConfigsDir = path.join(tmpBase, 'user_configs');
        fs.mkdirSync(userConfigsDir, { recursive: true });
        const activeDbPath = path.join(userConfigsDir, 'default.db');
        fs.writeFileSync(activeDbPath, 'existing-active-db');

        const parsed = await parseBackupZip(zipPath);
        const configPathManager = {
            getUserConfigsDir: () => userConfigsDir,
            getUserDataDir: () => path.join(tmpBase, 'user_data'),
            getUploadsDir: () => path.join(tmpBase, 'uploads'),
            getPluginDataDir: (pluginId) => path.join(tmpBase, 'plugins', pluginId, 'data')
        };

        const result = await performImport(parsed, { db: { dbPath: activeDbPath }, configPathManager }, {
            mode: 'replace',
            includeUserConfigs: true,
            includeGlobalSettings: false,
            includePluginSettings: false,
            includePluginData: false
        });

        assert.strictEqual(result.success, true);
        assert.strictEqual(fs.readFileSync(activeDbPath, 'utf8'), 'existing-active-db');
        assert.strictEqual(result.report.userConfigs.renamed.length, 1);

        const restoredProfile = result.report.userConfigs.renamed[0].to.replace(/\.db$/, '');
        assert.strictEqual(
            fs.readFileSync(path.join(userConfigsDir, `${restoredProfile}.db`), 'utf8'),
            'imported-db'
        );
        assert(fs.existsSync(path.join(userConfigsDir, `${restoredProfile}_plugins_state.json`)));
        assert.strictEqual(fs.readFileSync(path.join(userConfigsDir, '.active_profile'), 'utf8'), restoredProfile);

        if (parsed.tmpDir) cleanupTempDir(parsed.tmpDir);
        fs.rmSync(tmpBase, { recursive: true, force: true });
        fs.unlinkSync(zipPath);
    });

    await runAsyncTest('importer: path traversal in data files is blocked', async () => {
        const manifest = createManifest({ appVersion: '1.0.0', plugins: [{ id: 'evil' }] });
        const zipPath = await createTestZip({
            'manifest.json': manifest,
            'plugins/evil/data/../../escape.txt': 'evil content'
        });

        const db = makeTestDb();
        const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'traversal-test-'));
        const configPathManager = {
            getUserDataDir: () => tmpBase,
            getUploadsDir: () => tmpBase,
            getPluginDataDir: () => path.join(tmpBase, 'plugins', 'evil', 'data')
        };

        const parsed = await parseBackupZip(zipPath);
        await performImport(parsed, { db, configPathManager }, {
            mode: 'replace',
            includePluginData: true,
            includePluginSettings: true
        });

        const escapeExists = fs.existsSync(path.join(os.tmpdir(), 'escape.txt'));
        assert(!escapeExists, 'Traversal file must not be written outside base dir');

        if (parsed.tmpDir) cleanupTempDir(parsed.tmpDir);
        try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch { /* ignore */ }
        fs.unlinkSync(zipPath);
    });

    await runAsyncTest('BackupManager: custom provider exportConfig is called during export', async () => {
        const db = makeTestDb();
        db.prepare("INSERT INTO settings VALUES (?,?)").run('plugin:provider-plugin:key1', '"val1"');
        const mockLogger = { info: () => {}, warn: () => {}, error: () => {} };
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-export-test-'));
        const configPathManager = {
            getPluginDataDir: () => tmpDir,
            getUploadsDir: () => tmpDir,
            getUserDataDir: () => tmpDir
        };
        const pluginLoader = { loadedPlugins: new Map([['provider-plugin', {}]]) };

        let customExportCalled = false;
        const bm = new BackupManager({ db, configPathManager, pluginLoader, logger: mockLogger });
        bm.registerBackupProvider('provider-plugin', {
            exportConfig: async () => {
                customExportCalled = true;
                return { settings: { customKey: 'customVal' }, warnings: ['test warning'] };
            }
        });

        const { stream } = await bm.export({
            includeGlobalSettings: false,
            includePluginSettings: true,
            includePluginData: false
        });

        // Consume stream
        await new Promise((resolve, reject) => {
            const chunks = [];
            stream.on('data', c => chunks.push(c));
            stream.on('end', resolve);
            stream.on('error', reject);
        });

        assert.strictEqual(customExportCalled, true, 'Custom exportConfig should have been called');
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    await runAsyncTest('PluginAPI: registerBackupProvider wires to BackupManager', async () => {
        const PluginLoader = require(path.join(__dirname, '..', 'modules', 'plugin-loader'));
        const db = makeTestDb();
        const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
        const configPathManager = {
            getPluginDataDir: () => os.tmpdir(),
            getUploadsDir: () => os.tmpdir(),
            getUserDataDir: () => os.tmpdir(),
            getUserConfigsDir: () => os.tmpdir(),
            getConfigDir: () => os.tmpdir()
        };
        const app = { use: () => {} };
        const io = { emit: () => {}, sockets: { sockets: new Map() } };

        const pl = new PluginLoader(os.tmpdir(), app, io, db, mockLogger, configPathManager);
        const bm = new BackupManager({ db, configPathManager, pluginLoader: pl, logger: mockLogger });
        pl.setBackupManager(bm);

        const provider = { exportConfig: async () => ({ settings: {}, warnings: [] }) };
        pl.registerBackupProvider('my-plugin', provider);
        assert.strictEqual(bm.getBackupProvider('my-plugin'), provider);

        pl.unregisterBackupProvider('my-plugin');
        assert.strictEqual(bm.getBackupProvider('my-plugin'), null);
    });
}

// ─── Entry point ─────────────────────────────────────────────────────────────
// When running under Jest use it() so Jest properly awaits the async tests.
// When running directly with Node, call the function with a plain .then() handler.
if (typeof it === 'function') {
    it('backup system async integration tests', async () => {
        await runAllAsyncTests();

        console.log('\n📊 Test Summary:');
        console.log(`   Total:  ${passed + failed}`);
        console.log(`   Passed: ${passed}`);
        console.log(`   Failed: ${failed}`);

        if (failed > 0) {
            throw new Error(`${failed} backup test(s) failed`);
        }
    }, 60000);
} else {
    runAllAsyncTests().then(() => {
        console.log('\n📊 Test Summary:');
        console.log(`   Total:  ${passed + failed}`);
        console.log(`   Passed: ${passed}`);
        console.log(`   Failed: ${failed}`);

        if (failed === 0) {
            console.log('\n✅ All tests passed!');
            process.exit(0);
        } else {
            console.log('\n❌ Some tests failed!');
            process.exit(1);
        }
    });
}
