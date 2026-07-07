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
        assert(managerScript.includes('plugin-store-card__action'));
        assert(managerScript.includes('plugin-store-drawer__panel'));
        assert(managerScript.includes('/api/plugin-store?locale='));
        assert(managerScript.includes('getStoreAuthHeaders'));
        assert(managerScript.includes('window.StoreAuth'));
        assert(!managerScript.includes('/api/plugin-store/community/enable'));
        assert(!managerScript.includes('/api/plugin-store/sources'));
        assert(managerScript.includes('currentStoreMode'));
        assert(managerScript.includes('currentStoreSort'));
        assert(managerScript.includes('selectedStorePlugin'));
        assert(managerScript.includes('loadCurrentAppVersion'));
        assert(managerScript.includes('renderStoreShell'));
        assert(managerScript.includes('renderStoreDiscoverySections'));
        assert(managerScript.includes('openStorePluginDetail'));
        assert(managerScript.includes('updateAllStorePlugins'));
        assert(managerScript.includes('Catalog Only'));
        assert(managerScript.includes('getStorePluginPricing'));
        assert(managerScript.includes('getStorePluginMedia'));
        assert(managerScript.includes('getStorePluginTrustSummary'));
        assert(managerScript.includes('Package missing'));
        assert(managerScript.includes('Free'));
        assert(authScript.includes('mountUserButton'));
        assert(authScript.includes('mountSignIn'));
        assert(authScript.includes('/api/plugin-store/config'));
        assert(authScript.includes('/npm/@clerk/ui@1/dist/ui.browser.js'));
        assert(authScript.includes('/npm/@clerk/clerk-js@6/dist/clerk.browser.js'));
        assert(authScript.includes('data-clerk-publishable-key'));
        assert(authScript.includes('data-clerk-proxy-url'));
        assert(authScript.includes('resolveProxyUrl'));
        assert(!authScript.includes('cdn.jsdelivr.net/npm/@clerk/clerk-js'));
    });

    it('includes beta license claim UI and gates store installs until claimed', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');
        const authScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'clerk-store-auth.js'), 'utf8');

        assert(managerScript.includes('/api/plugin-store/license/claim'));
        assert(managerScript.includes('claimBetaLicense'));
        assert(managerScript.includes('hasStoreLicense'));
        assert(managerScript.includes('data-store-license-claim'));
        assert(managerScript.includes('Beta license required'));
        assert(managerScript.includes('BETA_LICENSE_REQUIRED'));
        assert(authScript.includes('payload.account'));
        assert(authScript.includes('refreshAccount'));
        assert(authScript.includes('get account()'));
    });

    it('includes closed beta store UI locks and invite-required errors', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');

        assert(managerScript.includes('hasSubscriberPluginAccess'));
        assert(managerScript.includes('SUBSCRIBER_ACCESS_REQUIRED'));
        assert(managerScript.includes('Subscriber required'));
        assert(managerScript.includes('Subscriber Only'));
        assert(managerScript.includes('hasClosedBetaPluginAccess'));
        assert(managerScript.includes('CLOSED_BETA_INVITE_REQUIRED'));
        assert(managerScript.includes('Invite required'));
        assert(managerScript.includes('Closed Beta'));
    });

    it('keeps the featured store plugin list aligned with the preinstalled set', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');

        assert(managerScript.includes("['chatango', 'api-bridge', 'clarityhud', 'gcce', 'goals', 'spotlight', 'soundboard', 'toptier', 'tts', 'webgpu-emoji-rain', 'emoji-rain']"));
    });

    it('includes Store v2 detail pages, feedback, telemetry and rollback messaging', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');

        assert(managerScript.includes('submitStoreFeedback'));
        assert(managerScript.includes('/api/plugin-store/feedback'));
        assert(managerScript.includes('/api/plugin-store/telemetry'));
        assert(managerScript.includes('Quality signals'));
        assert(managerScript.includes('Update notes'));
        assert(managerScript.includes('Review / Feedback'));
        assert(managerScript.includes('Rollback protected'));
        assert(managerScript.includes('Store health'));
    });

    it('brands the appstore header with the dedicated AppStore logo asset', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');
        const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
        const logoPath = path.join(__dirname, '..', 'public', 'appstore-logo.png');

        assert(fs.existsSync(logoPath));
        assert(managerScript.includes('/appstore-logo.png'));
        assert(managerScript.includes('plugin-store-header__logo'));
        assert(dashboardHtml.includes('plugin-store-header__brand'));
        assert(dashboardHtml.includes('plugin-store-header__logo'));
    });

    it('uses App Store as the visible store name', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');
        const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');

        assert(dashboardHtml.includes('data-tooltip="App Store"'));
        assert(dashboardHtml.includes('>App Store</span>'));
        assert(dashboardHtml.includes('<!-- View: App Store -->'));
        assert(managerScript.includes('Official LTTH App Store'));
        assert(managerScript.includes('Error loading App Store'));
        assert(!dashboardHtml.includes('data-tooltip="Plugin Store"'));
        assert(!managerScript.includes('Official LTTH Plugin Store'));
    });

    it('uses the sidebar app icon for store fallback artwork instead of initials', () => {
        const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'), 'utf8');
        const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');

        assert(managerScript.includes('/ltthicon.png'));
        assert(managerScript.includes('plugin-store-card__avatar-icon'));
        assert(managerScript.includes('plugin-store-drawer__avatar-icon'));
        assert(managerScript.includes('--store-icon-bg:'));
        assert(managerScript.includes('--store-icon-color:'));
        assert(dashboardHtml.includes('-webkit-mask: url("/ltthicon.png") center / contain no-repeat'));
        assert(dashboardHtml.includes('background: var(--store-icon-bg'));
        assert(dashboardHtml.includes('box-shadow: inset 0 0 0 1px var(--store-icon-border'));
        assert(!managerScript.includes('getStorePluginInitials(plugin)'));
    });
});
