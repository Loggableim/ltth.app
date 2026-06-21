const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const express = require('express');
const request = require('supertest');

const { setupPluginRoutes } = require('../routes/plugin-routes');

function writePlugin(root, id, overrides = {}) {
    const pluginDir = path.join(root, id);
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'index.js'), 'module.exports = {};\n');

    const manifest = {
        id,
        name: id,
        description: `${id} description`,
        version: '1.0.0',
        author: 'test',
        type: 'utility',
        entry: 'index.js',
        ...overrides
    };

    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2));
    return pluginDir;
}

function createTestApp(pluginsDir, loadedPlugins = new Map()) {
    const app = express();
    const passThrough = (req, res, next) => next();
    const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    };
    const pluginLoader = {
        pluginsDir,
        plugins: loadedPlugins,
        state: {},
        getLocalizedDescription: (manifest) => manifest.description
    };

    setupPluginRoutes(app, pluginLoader, passThrough, passThrough, logger);
    return { app, logger };
}

describe('Plugin Manager listing', () => {
    let tempDir;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugins-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('lists all installed dev status categories from disk', async () => {
        writePlugin(tempDir, 'stable-plugin', { devStatus: 'stable' });
        writePlugin(tempDir, 'working-plugin', { devStatus: 'working-beta' });
        writePlugin(tempDir, 'development-plugin', { devStatus: 'development-beta' });
        writePlugin(tempDir, 'early-plugin', { devStatus: 'early-version' });
        writePlugin(tempDir, 'non-working-plugin', { devStatus: 'non-working-beta' });

        const { app } = createTestApp(tempDir);
        const response = await request(app).get('/api/plugins').expect(200);

        const ids = response.body.plugins.map((plugin) => plugin.id).sort();
        assert.deepStrictEqual(ids, [
            'development-plugin',
            'early-plugin',
            'non-working-plugin',
            'stable-plugin',
            'working-plugin'
        ]);
    });

    it('hides loaded plugins that no longer exist on disk', async () => {
        writePlugin(tempDir, 'installed-plugin', { devStatus: 'stable' });

        const missingPath = path.join(tempDir, 'deleted-plugin');
        const loadedPlugins = new Map([
            ['installed-plugin', { path: path.join(tempDir, 'installed-plugin'), loadedAt: '2026-04-26T10:00:00.000Z' }],
            ['deleted-plugin', { path: missingPath, loadedAt: '2026-04-26T10:01:00.000Z' }]
        ]);

        const { app, logger } = createTestApp(tempDir, loadedPlugins);
        const response = await request(app).get('/api/plugins').expect(200);

        const ids = response.body.plugins.map((plugin) => plugin.id);
        assert.deepStrictEqual(ids, ['installed-plugin']);
        assert.strictEqual(response.body.plugins[0].loadedAt, '2026-04-26T10:00:00.000Z');
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('deleted-plugin'));
    });

    it('keeps frontend dev status filters in sync with manifest statuses', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');
        const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');

        for (const status of ['stable', 'working-beta', 'development-beta', 'early-version', 'non-working-beta']) {
            assert(managerScript.includes(`'${status}': true`), `missing ${status} default filter`);
            assert(dashboardHtml.includes(`data-status="${status}"`), `missing ${status} checkbox`);
        }

        assert(managerScript.includes('if (!(plugin.devStatus in this.devStatusFilters)) return true;'));
    });

    it('requests plugin listings with the active locale', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');

        assert(managerScript.includes("window.i18n?.currentLocale || localStorage.getItem('app_locale') || 'en'"));
        assert(managerScript.includes('/api/plugins?locale='));
        assert(managerScript.includes('encodeURIComponent(locale)'));
    });
});
