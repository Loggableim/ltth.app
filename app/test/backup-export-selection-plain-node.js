'use strict';

// Plain Node regression harness for scoped export selection and privacy metadata.
// All database and file fixtures are synthetic and removed when the harness exits.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');
const Database = require('better-sqlite3');
const { exportBackup } = require('../modules/backup/exporter');
const { createManifest, validateManifest } = require('../modules/backup/manifest');
const { parseBackupZip, cleanupTempDir } = require('../modules/backup/importer');
const {
    EXPORT_CATEGORIES,
    assertSelectionConfirmed,
    inspectSelection,
    isSensitiveFile
} = require('../modules/backup/selection');
const ConfigImportPlugin = require('../plugins/config-import/main');

const fixtureRoot = fs.mkdtempSync(path.join(__dirname, '.backup-selection-fixture-'));
const EULER_SENTINEL = 'SYNTHETIC_EULER_KEY_SENTINEL';
const SESSION_SENTINEL = 'SYNTHETIC_SESSION_VALUE_SENTINEL';
const nestedSentinel = 'SYNTHETIC_NESTED_API_KEY_SENTINEL';

class FakeArchive extends EventEmitter {
    constructor() {
        super();
        this.entries = new Map();
    }

    append(buffer, options) {
        this.entries.set(options.name, Buffer.from(buffer));
    }

    file(filePath, options) {
        this.entries.set(options.name, fs.readFileSync(filePath));
    }

    finalize() {}
}

function fakeSettingsDb() {
    const globals = [
        { key: 'theme', value: 'dark' },
        { key: 'tiktok_euler_api_key', value: EULER_SENTINEL }
    ];
    const plugins = [
        { key: 'plugin:fixture-plugin:config', value: JSON.stringify({ safe: 'kept', apiKey: nestedSentinel }) },
        { key: 'plugin:fixture-plugin:sessionId', value: SESSION_SENTINEL }
    ];
    return {
        prepare(sql) {
            if (sql.includes("key LIKE 'plugin:%'")) return { all: () => plugins };
            if (sql.includes("key NOT LIKE 'plugin:%'")) return { all: () => globals };
            throw new Error(`Unexpected synthetic query: ${sql}`);
        }
    };
}

function emptyPaths() {
    const absent = path.join(fixtureRoot, 'absent');
    return {
        getPluginsDir: () => path.join(absent, 'plugins'),
        getPluginDataDir: () => path.join(absent, 'plugin-data'),
        getUserConfigsDir: () => path.join(absent, 'user_configs'),
        getUploadsDir: () => path.join(absent, 'uploads'),
        getUserDataDir: () => path.join(absent, 'user_data')
    };
}

function fakeRequestBody() {
    return Object.fromEntries(EXPORT_CATEGORIES.map(category => [category, true]));
}

function makeRouteResponse() {
    class FakeResponse extends Writable {
        constructor() {
            super();
            this.headers = {};
            this.body = null;
            this.statusCode = 200;
            this.headersSent = false;
        }
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
        status(code) { this.statusCode = code; return this; }
        type() { return this; }
        json(body) { this.body = body; this.end(); return this; }
        _write(_chunk, _encoding, callback) { this.headersSent = true; callback(); }
    }
    return new FakeResponse();
}

async function createSyntheticZip(filePath, manifest, { withChecksums = true } = {}) {
    const archiver = require('archiver');
    const crypto = require('crypto');
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const checksums = withChecksums ? {
        formatVersion: manifest.formatVersion,
        files: {
            'manifest.json': {
                sha256: crypto.createHash('sha256').update(manifestBytes).digest('hex'),
                sizeBytes: manifestBytes.length
            }
        }
    } : null;
    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip');
    archive.pipe(output);
    archive.append(manifestBytes, { name: 'manifest.json' });
    if (checksums) archive.append(Buffer.from(JSON.stringify(checksums)), { name: 'checksums.json' });
    await new Promise((resolve, reject) => {
        output.once('close', resolve);
        archive.once('error', reject);
        archive.finalize();
    });
}

async function run() {
    assert.equal(isSensitiveFile('.tiktok-sessionid'), true);
    assert.equal(isSensitiveFile('session.json'), true);

    const databaseDir = path.join(fixtureRoot, 'user_configs');
    fs.mkdirSync(databaseDir, { recursive: true });
    const sourceDbPath = path.join(databaseDir, 'fixture-profile.db');
    const sourceDb = new Database(sourceDbPath);
    sourceDb.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE viewer_events (viewer_id TEXT)');
    sourceDb.prepare('INSERT INTO settings(key, value) VALUES (?, ?)').run('tiktok_euler_api_key', EULER_SENTINEL);
    sourceDb.prepare('INSERT INTO settings(key, value) VALUES (?, ?)').run('ui_config', JSON.stringify({ theme: 'dark', sessionId: SESSION_SENTINEL, nested: { apiKey: nestedSentinel } }));
    sourceDb.prepare('INSERT INTO viewer_events(viewer_id) VALUES (?)').run('SYNTHETIC_VIEWER_ID');
    sourceDb.close();

    let defaultArchive;
    const defaultExport = await exportBackup({
        db: fakeSettingsDb(), configPathManager: { ...emptyPaths(), getUserConfigsDir: () => databaseDir },
        archiveFactory: () => (defaultArchive = new FakeArchive()), activeProfile: 'fixture'
    }, {
        includeGlobalSettings: true, includePluginSettings: true, includePluginData: false,
        includeUserConfigs: true, includeUploads: false, includeUserData: false
    });
    const globalPayload = defaultArchive.entries.get('global/settings.json').toString('utf8');
    const pluginPayload = defaultArchive.entries.get('plugins/fixture-plugin/settings.json').toString('utf8');
    assert.doesNotMatch(globalPayload, /SYNTHETIC_EULER_KEY_SENTINEL/);
    assert.match(globalPayload, /"theme": "dark"/);
    assert.doesNotMatch(pluginPayload, /SYNTHETIC_NESTED_API_KEY_SENTINEL|SYNTHETIC_SESSION_VALUE_SENTINEL/);
    assert.match(pluginPayload, /"safe": "kept"/);
    assert.equal(defaultExport.warnings.length > 0, true);
    assert.equal(JSON.parse(defaultArchive.entries.get('manifest.json').toString('utf8')).dataSelection.partial, true);

    const exportedDbPath = path.join(fixtureRoot, 'redacted-profile.db');
    fs.writeFileSync(exportedDbPath, defaultArchive.entries.get('user_configs/fixture-profile.db'));
    const exportedDb = new Database(exportedDbPath, { readonly: true, fileMustExist: true });
    const redactedRows = exportedDb.prepare('SELECT key, value FROM settings ORDER BY key').all();
    assert.equal(redactedRows.some(row => row.key === 'tiktok_euler_api_key'), false);
    const uiConfig = JSON.parse(redactedRows.find(row => row.key === 'ui_config').value);
    assert.equal(uiConfig.theme, 'dark');
    assert.equal(Object.hasOwn(uiConfig, 'sessionId'), false);
    assert.equal(Object.hasOwn(uiConfig.nested, 'apiKey'), false);
    assert.equal(exportedDb.prepare('SELECT viewer_id FROM viewer_events').get().viewer_id, 'SYNTHETIC_VIEWER_ID');
    exportedDb.close();

    const userDataDir = path.join(fixtureRoot, 'user_data');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(path.join(userDataDir, 'session.json'), JSON.stringify({ sessionId: SESSION_SENTINEL }));
    fs.writeFileSync(path.join(userDataDir, 'notes.json'), JSON.stringify({ note: 'synthetic safe item' }));
    let noSessionArchive;
    await exportBackup({
        db: fakeSettingsDb(), configPathManager: { ...emptyPaths(), getUserDataDir: () => userDataDir },
        archiveFactory: () => (noSessionArchive = new FakeArchive())
    }, {
        includeGlobalSettings: false, includePluginSettings: false, includePluginData: false,
        includeUserConfigs: false, includeUploads: false, includeUserData: true
    });
    assert.equal(noSessionArchive.entries.has('user_data/session.json'), false);
    assert.equal(noSessionArchive.entries.has('user_data/notes.json'), true);

    let sensitiveArchive;
    await exportBackup({
        db: fakeSettingsDb(), configPathManager: { ...emptyPaths(), getUserDataDir: () => userDataDir },
        archiveFactory: () => (sensitiveArchive = new FakeArchive())
    }, {
        includeGlobalSettings: true, includePluginSettings: true, includePluginData: false,
        includeUserConfigs: false, includeUploads: false, includeUserData: true,
        includeCredentialsSessions: true, confirmSensitiveExport: true
    });
    assert.match(sensitiveArchive.entries.get('global/settings.json').toString('utf8'), /SYNTHETIC_EULER_KEY_SENTINEL/);
    assert.match(sensitiveArchive.entries.get('plugins/fixture-plugin/settings.json').toString('utf8'), /SYNTHETIC_NESTED_API_KEY_SENTINEL/);
    assert.match(sensitiveArchive.entries.get('user_data/session.json').toString('utf8'), /SYNTHETIC_SESSION_VALUE_SENTINEL/);
    const sensitiveManifest = JSON.parse(sensitiveArchive.entries.get('manifest.json').toString('utf8'));
    assert.equal(sensitiveManifest.dataSelection.sensitiveDataIncluded, true);
    assert.equal(sensitiveManifest.dataSelection.categories.includes('credentialsAndSessions'), true);

    const fullSelection = Object.fromEntries(EXPORT_CATEGORIES.map(category => [category, true]));
    assert.throws(() => assertSelectionConfirmed({ ...fullSelection }), /credentials or session data requires explicit confirmation/i);
    assert.throws(() => assertSelectionConfirmed({ ...fullSelection, confirmSensitiveExport: true }), /full backup requires explicit confirmation/i);
    assert.doesNotThrow(() => assertSelectionConfirmed({ ...fullSelection, confirmSensitiveExport: true, confirmFullBackup: true }));

    const profileScopedDataPlugins = require('../modules/backup/profile-scoped-data').PROFILE_SCOPED_PLUGIN_DATA;
    const schnorrDir = path.join(fixtureRoot, 'plugin-data', 'schnorrbecher');
    fs.mkdirSync(schnorrDir, { recursive: true });
    fs.writeFileSync(path.join(schnorrDir, 'coin-jar-state.json'), JSON.stringify({ balance: 15 }));
    fs.writeFileSync(path.join(schnorrDir, 'coin-jar-config.json'), JSON.stringify({ persistenceMode: 'session' }));
    const scopedPathManager = {
        ...emptyPaths(),
        getPluginDataDir: (pluginId, options = {}) => pluginId === 'schnorrbecher' && options.profileId ? schnorrDir : path.join(fixtureRoot, 'plugin-data', pluginId),
        getUserDataDir: () => userDataDir
    };
    const sessionStatePreview = inspectSelection({ db: fakeSettingsDb(), configPathManager: scopedPathManager, activeProfile: 'fixture' }, {
        schnorrbecherPersistentState: true
    });
    assert.equal(sessionStatePreview.categories.schnorrbecherPersistentState.files, 0);
    fs.writeFileSync(path.join(schnorrDir, 'coin-jar-config.json'), JSON.stringify({ persistenceMode: 'persistent' }));
    const persistentStatePreview = inspectSelection({ db: fakeSettingsDb(), configPathManager: scopedPathManager, activeProfile: 'fixture' }, {
        schnorrbecherPersistentState: true
    });
    assert.equal(persistentStatePreview.categories.schnorrbecherPersistentState.files, 1);

    let fullArchive;
    await exportBackup({
        db: fakeSettingsDb(),
        configPathManager: { ...scopedPathManager, getPluginsDir: () => fixtureRoot },
        archiveFactory: () => (fullArchive = new FakeArchive()),
        activeProfile: 'fixture'
    }, {
        includeGlobalSettings: true,
        includePluginSettings: true,
        includePluginData: true,
        includeUserConfigs: true,
        includeUploads: true,
        includeUserData: true,
        profileScopedDataPlugins: profileScopedDataPlugins,
        includeSchnorrbecherPersistentState: true,
        includeCredentialsSessions: true,
        confirmSensitiveExport: true,
        confirmFullBackup: true
    });
    const fullManifest = JSON.parse(fullArchive.entries.get('manifest.json').toString('utf8'));
    assert.equal(fullManifest.dataSelection.partial, false);
    assert.match(fullManifest.warnings.join(' '), /Full backup selected.*unclassified personal or secret values/i);
    assert.equal(fullArchive.entries.has('plugins/schnorrbecher/data/coin-jar-state.json'), true);

    const previewDb = fakeSettingsDb();
    const preview = inspectSelection({ db: previewDb, configPathManager: { ...emptyPaths(), getUserDataDir: () => userDataDir }, activeProfile: 'fixture' }, {
        ...fullSelection
    });
    const previewText = JSON.stringify(preview);
    assert.doesNotMatch(previewText, /SYNTHETIC_EULER_KEY_SENTINEL|SYNTHETIC_SESSION_VALUE_SENTINEL|apiKey|session\.json/);
    assert.match(preview.fullBackupWarning, /unclassified personal or secret values/i);
    assert.equal(preview.categories.credentialsAndSessions.selected, true);
    assert.equal(preview.partial, false);

    const routes = new Map();
    const routePlugin = new ConfigImportPlugin({
        log() {},
        getBackupManager: () => ({
            previewExport: selection => inspectSelection({ db: previewDb, configPathManager: emptyPaths() }, selection),
            export: async () => { throw new Error('export should not run in this gate test'); }
        }),
        registerRoute: (method, route, ...handlers) => routes.set(`${method} ${route}`, handlers.at(-1))
    });
    routePlugin.registerBackupRoutes();
    const previewResponse = makeRouteResponse();
    await routes.get('POST /api/config-backup/preview-export')({ body: fullSelection }, previewResponse);
    assert.equal(previewResponse.statusCode, 200);
    assert.doesNotMatch(JSON.stringify(previewResponse.body), /SYNTHETIC_EULER_KEY_SENTINEL|SYNTHETIC_SESSION_VALUE_SENTINEL/);
    assert.equal(previewResponse.headers['cache-control'], 'no-store');
    assert.equal(previewResponse.headers['referrer-policy'], 'no-referrer');

    const tokenResponse = makeRouteResponse();
    await routes.get('POST /api/config-backup/export-token')({ body: fullSelection }, tokenResponse);
    assert.equal(tokenResponse.statusCode, 400);
    assert.match(tokenResponse.body.error, /credentials or session data requires explicit confirmation/i);
    assert.equal(routePlugin._exportTokens.size, 0);
    const confirmedResponse = makeRouteResponse();
    await routes.get('POST /api/config-backup/export-token')({
        body: {
            ...fullSelection,
            confirmSensitiveExport: true,
            confirmFullBackup: true,
            confirmUnclassifiedData: true,
            exportPreviewToken: previewResponse.body.exportPreviewToken
        }
    }, confirmedResponse);
    assert.equal(confirmedResponse.statusCode, 200);

    const manifest = createManifest({
        appVersion: 'synthetic', plugins: [], warnings: [],
        dataSelection: { categories: ['globalSettings'], partial: true, sensitiveDataIncluded: false }
    });
    assert.equal(validateManifest(manifest).valid, true);
    assert.equal(validateManifest(createManifest({ appVersion: 'legacy', plugins: [], warnings: [] })).valid, true);

    const partialPath = path.join(fixtureRoot, 'partial.zip');
    const partialManifest = createManifest({
        appVersion: 'synthetic', plugins: [], warnings: [],
        dataSelection: { categories: ['globalSettings'], partial: true, sensitiveDataIncluded: false }
    });
    await createSyntheticZip(partialPath, partialManifest);
    const parsedPartial = await parseBackupZip(partialPath, fs.statSync(partialPath).size);
    assert.equal(parsedPartial.errors.length, 0);
    assert.match(parsedPartial.warnings.join(' '), /partial backup/i);
    cleanupTempDir(parsedPartial.tmpDir);

    const legacyPath = path.join(fixtureRoot, 'legacy.zip');
    const legacyManifest = { ...createManifest({ appVersion: 'synthetic', plugins: [], warnings: [] }), formatVersion: '0.9.0' };
    await createSyntheticZip(legacyPath, legacyManifest, { withChecksums: false });
    const parsedLegacy = await parseBackupZip(legacyPath, fs.statSync(legacyPath).size);
    assert.equal(parsedLegacy.errors.length, 0);
    assert.match(parsedLegacy.warnings.join(' '), /no data-scope metadata/i);
    cleanupTempDir(parsedLegacy.tmpDir);

    console.log('PASS: default filters, explicit credential/full confirmation, SQLite secret stripping, session-file opt-in, value-free preview, partial-manifest restore warnings, legacy restore metadata compatibility, and export-token gate');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => {
    try {
        if (path.resolve(fixtureRoot).startsWith(path.resolve(__dirname) + path.sep)) {
            fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
    } finally {
    }
});
