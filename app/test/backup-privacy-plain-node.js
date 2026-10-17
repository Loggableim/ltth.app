'use strict';

// Dependency-free smoke verification for environments where Jest cannot start.
// This harness uses only synthetic in-memory requests/responses and absent temp paths.
const assert = require('node:assert/strict');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { Readable, Writable } = require('node:stream');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'better-sqlite3') {
        return function SyntheticDatabase() {
            throw new Error('Database access is forbidden in this synthetic harness');
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const { redactLocalPaths } = require('../modules/backup/redact-local-paths');
const { exportBackup } = require('../modules/backup/exporter');
const ConfigImportPlugin = require('../plugins/config-import/main');

class FakeArchive extends EventEmitter {
    constructor() {
        super();
        this.entries = new Map();
    }

    append(buffer, options) {
        this.entries.set(options.name, Buffer.from(buffer));
    }

    file() {
        throw new Error('Filesystem reads are forbidden in this synthetic harness');
    }

    finalize() {}
}

class FakeResponse extends Writable {
    constructor() {
        super();
        this.headers = {};
        this.body = undefined;
        this.statusCode = 200;
        this.headersSent = false;
    }

    setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
    }

    status(code) {
        this.statusCode = code;
        return this;
    }

    type() {
        return this;
    }

    json(body) {
        this.body = body;
        this.headersSent = true;
        this.end();
        return this;
    }

    _write(_chunk, _encoding, callback) {
        this.headersSent = true;
        callback();
    }
}

function assertSensitiveHeaders(response) {
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
}

async function run() {
    assert.equal(redactLocalPaths('EACCES: C:\\Users\\fixture\\private.db'), 'EACCES: [local path redacted]');
    assert.equal(redactLocalPaths('ENOENT: /home/fixture/private.db'), 'ENOENT: [local path redacted]');
    assert.equal(redactLocalPaths('See https://example.test/docs'), 'See https://example.test/docs');

    let archive;
    const exportResult = await exportBackup({
        db: null,
        pluginLoader: { loadedPlugins: new Map([['fixture-plugin', {}]]) },
        backupProviders: {
            'fixture-plugin': {
                exportConfig: async () => ({ warnings: ['ENOENT: C:\\Users\\fixture\\secret.json'] })
            }
        },
        configPathManager: {
            getPluginsDir: () => path.join(os.tmpdir(), 'ltth-privacy-smoke-absent-plugins'),
            getPluginDataDir: () => path.join(os.tmpdir(), 'ltth-privacy-smoke-absent-data')
        },
        archiveFactory: () => (archive = new FakeArchive())
    }, {
        includeGlobalSettings: false,
        includePluginSettings: false,
        includePluginData: true,
        includeUserConfigs: false,
        includeUploads: false,
        includeUserData: false
    });
    assert.match(exportResult.warnings[0], /ENOENT: \[local path redacted\]/);
    assert.doesNotMatch(exportResult.warnings.join(' '), /C:\\Users|fixture\\secret/);
    const manifest = JSON.parse(archive.entries.get('manifest.json').toString('utf8'));
    assert.match(manifest.warnings[0], /ENOENT: \[local path redacted\]/);
    assert.doesNotMatch(JSON.stringify(manifest), /C:\\Users|fixture\\secret/);

    const routes = new Map();
    const logs = [];
    let backupManager = {
        previewExport: () => ({ categories: {}, totals: {} }),
        export: async () => ({
            stream: Readable.from(['synthetic archive bytes']),
            warnings: ['EACCES: C:\\Users\\fixture\\private.json']
        })
    };
    const plugin = new ConfigImportPlugin({
        log: message => logs.push(message),
        getBackupManager: () => backupManager,
        registerRoute: (method, route, ...handlers) => routes.set(`${method} ${route}`, handlers.at(-1))
    });
    plugin.registerBackupRoutes();

    async function invoke(method, route, request) {
        const response = new FakeResponse();
        const completion = new Promise(resolve => response.once('finish', resolve));
        await routes.get(`${method} ${route}`)(request, response);
        if (!response.writableFinished) await completion;
        return response;
    }

    const exportSelection = {
        includeGlobalSettings: false,
        includePluginSettings: false,
        includePluginData: true,
        includeUserConfigs: false,
        includeUploads: false,
        includeUserData: false,
        includeProfileScopedPluginData: false,
        includeSchnorrbecherPersistentState: false,
        includeCredentialsSessions: false
    };
    const successfulExport = await invoke('POST', '/api/config-backup/export', {
        body: { ...exportSelection, confirmUnclassifiedData: true }
    });
    assertSensitiveHeaders(successfulExport);
    assert.equal(successfulExport.statusCode, 200);
    assert.match(successfulExport.headers['x-backup-warnings'], /\[local path redacted\]/);
    assert.doesNotMatch(successfulExport.headers['x-backup-warnings'], /C:\\Users|fixture\\private/);

    const exportPreview = await invoke('POST', '/api/config-backup/preview-export', { body: exportSelection });
    assertSensitiveHeaders(exportPreview);
    assert.equal(exportPreview.statusCode, 200);
    assert.equal(exportPreview.body.unclassifiedContentRisk, true);
    assert.match(exportPreview.body.exportPreviewToken, /^[a-f0-9]{64}$/);

    const missingUnclassifiedConfirmation = await invoke('POST', '/api/config-backup/export-token', {
        body: { ...exportSelection, exportPreviewToken: exportPreview.body.exportPreviewToken }
    });
    assertSensitiveHeaders(missingUnclassifiedConfirmation);
    assert.equal(missingUnclassifiedConfirmation.statusCode, 400);

    const tokenResponse = await invoke('POST', '/api/config-backup/export-token', {
        body: {
            ...exportSelection,
            confirmUnclassifiedData: true,
            exportPreviewToken: exportPreview.body.exportPreviewToken
        }
    });
    assertSensitiveHeaders(tokenResponse);
    assert.equal(tokenResponse.statusCode, 200);
    assert.equal(tokenResponse.body.success, true);

    const successfulDownload = await invoke('GET', '/api/config-backup/download', {
        query: { token: tokenResponse.body.token }
    });
    assertSensitiveHeaders(successfulDownload);
    assert.equal(successfulDownload.statusCode, 200);
    assert.match(successfulDownload.headers['x-backup-warnings'], /\[local path redacted\]/);
    assert.doesNotMatch(successfulDownload.headers['x-backup-warnings'], /C:\\Users|fixture\\private/);

    const replayedDownload = await invoke('GET', '/api/config-backup/download', {
        query: { token: tokenResponse.body.token }
    });
    assertSensitiveHeaders(replayedDownload);
    assert.equal(replayedDownload.statusCode, 404);

    backupManager = {
        export: async () => { throw new Error('ENOENT: C:\\Users\\fixture\\private.db'); }
    };
    const failedExport = await invoke('POST', '/api/config-backup/export', {
        body: { ...exportSelection, confirmUnclassifiedData: true }
    });
    assertSensitiveHeaders(failedExport);
    assert.equal(failedExport.statusCode, 500);
    assert.match(logs.join(' '), /ENOENT/);
    assert.doesNotMatch(logs.join(' '), /C:\\Users|fixture\\private/);

    const failedDownload = await invoke('GET', '/api/config-backup/download', { query: { token: 'absent-token' } });
    assertSensitiveHeaders(failedDownload);
    assert.equal(failedDownload.statusCode, 404);

    console.log('PASS: warning helper, returned warnings, archive manifest, HTTP warning header, successful/error export headers, token response headers, and invalid download headers');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => {
    Module._load = originalLoad;
});
