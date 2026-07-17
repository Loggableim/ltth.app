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

    it('includes clerk-gated appstore modes and removes community source controls', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');
        const authScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'clerk-store-auth.js'), 'utf8');
        const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');

        assert(dashboardHtml.includes('data-plugin-mode="store"'));
        assert(dashboardHtml.includes('data-plugin-mode="installed"'));
        assert(dashboardHtml.includes('data-plugin-mode="updates"'));
        assert(!dashboardHtml.includes('data-plugin-mode="sources"'));
        assert(dashboardHtml.includes('id="plugin-store-category-chips"'));
        assert(dashboardHtml.includes('id="plugin-store-filter-chips"'));
        assert(dashboardHtml.includes('id="plugin-store-detail-drawer"'));
        assert(dashboardHtml.includes('id="plugin-store-auth-root"'));
        assert(dashboardHtml.includes('id="plugin-store-account-menu"'));
        assert(dashboardHtml.includes('/js/clerk-store-auth.js'));
        assert(!dashboardHtml.includes('id="plugin-store-sources-panel"'));
        assert(!dashboardHtml.includes('id="enable-community-store-btn"'));
        assert(managerScript.includes('class="plugin-store-card"'));
        assert(managerScript.includes('data-store-drawer-action'));
        assert(managerScript.includes('/api/plugin-store?locale='));
        assert(managerScript.includes('getStoreAuthHeaders'));
        assert(managerScript.includes('window.StoreAuth'));
        assert(managerScript.includes('currentStoreMode'));
        assert(managerScript.includes('selectedStorePlugin'));
        assert(managerScript.includes('renderStoreShell'));
        assert(managerScript.includes('openStorePluginDetail'));
        assert(managerScript.includes('Catalog Only'));
        assert(managerScript.includes('getStorePluginPricing'));
        assert(managerScript.includes('Package missing'));
        assert(managerScript.includes('Free'));
        assert(authScript.includes('mountUserButton'));
        assert(authScript.includes('mountSignIn'));
        assert(authScript.includes('/api/plugin-store/config'));
        assert(authScript.includes('beginBridgeAuth'));
        assert(authScript.includes('getBridgeUrl'));
        assert(authScript.includes('createLocalStoreSession'));
        assert(authScript.includes('LTTH_STORE_CLERK_PUBLISHABLE_KEY'));
        assert(!authScript.includes('cdn.jsdelivr.net/npm/@clerk/clerk-js'));
    });

    it('uses the signed-in Store account to gate store installs', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');
        const authScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'clerk-store-auth.js'), 'utf8');

        assert(managerScript.includes('getStoreAccount'));
        assert(managerScript.includes('getStorePluginAccessInfo'));
        assert(managerScript.includes('hasStoreAccess'));
        assert(managerScript.includes('handleStorePluginAction'));
        assert(managerScript.includes('requires ${accessInfo.label.toLowerCase()} access'));
        assert(authScript.includes('response.account'));
        assert(authScript.includes('refreshAccount'));
        assert(authScript.includes('get account()'));
    });

    it('enforces subscriber and closed-beta store access groups', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');

        assert(managerScript.includes("normalizedType === 'subscriber'"));
        assert(managerScript.includes("groups.has('subscriber')"));
        assert(managerScript.includes("normalizedType === 'closed-beta'"));
        assert(managerScript.includes("groups.has('closed-beta')"));
        assert(managerScript.includes('closedBetaPlugins.has(normalizedPluginId)'));
        assert(managerScript.includes('Subscriber only'));
        assert(managerScript.includes('Closed beta'));
    });

    it('keeps the featured store plugin list aligned with the preinstalled set', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');

        assert(managerScript.includes("['chatango', 'goals', 'spotlight', 'milestone-leaderboard', 'soundboard', 'toptier', 'tts', 'webgpu-emoji-rain', 'emoji-rain']"));
    });

    it('renders detail-drawer metadata and a contextual store action', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');

        assert(managerScript.includes('renderStorePluginDetail'));
        assert(managerScript.includes('role="dialog"'));
        assert(managerScript.includes("renderStoreDetailField('Version'"));
        assert(managerScript.includes("renderStoreDetailField('Compatibility'"));
        assert(managerScript.includes('data-store-drawer-action'));
        assert(managerScript.includes('No screenshots yet'));
    });

    it('brands the appstore header with the dedicated AppStore logo asset', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');
        const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
        const logoPath = path.join(__dirname, '..', 'public', 'appstore-logo.png');

        assert(fs.existsSync(logoPath));
        assert(managerScript.includes('getPluginLogo'));
        assert(dashboardHtml.includes('plugin-store-header__brand'));
        assert(dashboardHtml.includes('plugin-store-header__logo'));
        assert(dashboardHtml.includes('/appstore-logo.png'));
    });

    it('uses App Store as the visible store name', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');
        const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');

        assert(dashboardHtml.includes('data-tooltip="App Store"'));
        assert(dashboardHtml.includes('>App Store</span>'));
        assert(dashboardHtml.includes('<!-- View: App Store -->'));
        assert(managerScript.includes('Official LTTH Plugin Store'));
        assert(!dashboardHtml.includes('data-tooltip="Plugin Store"'));
    });

    it('uses plugin logos when available and an initials fallback otherwise', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');

        assert(managerScript.includes('class="plugin-manager-logo"'));
        assert(managerScript.includes('getPluginLogo'));
        assert(managerScript.includes('getStorePluginInitials'));
        assert(managerScript.includes('onerror="this.remove(); this.parentElement.textContent'));
    });
});
