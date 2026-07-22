const fs = require('fs');
const path = require('path');

describe('EulerStream-only TikTok connector', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../modules/adapters/EulerstreamAdapter');
  });

  test('always creates EulerStream and removes only legacy source settings', () => {
    let adapterDb;
    jest.doMock('../modules/adapters/EulerstreamAdapter', () => class MockEulerstreamAdapter {
      constructor(io, db) {
        adapterDb = db;
        this.isConnected = false;
        this.currentUsername = null;
      }
      on() {}
      removeListener() {}
      isActive() { return false; }
    });

    const db = {
      getSetting: jest.fn((key) => key === 'tiktok_data_source' ? 'tikfinity' : null),
      deleteSetting: jest.fn()
    };
    const TikTokConnector = require('../modules/tiktok');
    const connector = new TikTokConnector({ emit: jest.fn() }, db, { info: jest.fn() });

    expect(adapterDb).toBe(db);
    expect(db.deleteSetting).toHaveBeenCalledTimes(2);
    expect(db.deleteSetting).toHaveBeenNthCalledWith(1, 'tiktok_data_source');
    expect(db.deleteSetting).toHaveBeenNthCalledWith(2, 'tikfinity_ws_port');
    expect(connector.getActiveAdapterInfo()).toEqual(expect.objectContaining({ dataSource: 'eulerstream' }));
    expect(connector.switchSourceNow).toBeUndefined();
  });

  test('does not ship the TikFinity adapter', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'modules', 'adapters', 'TikFinityAdapter.js'))).toBe(false);
  });

  test('does not expose manager controls or legacy data-source routes', () => {
    const root = path.join(__dirname, '..', '..');
    const dashboard = fs.readFileSync(path.join(root, 'app', 'public', 'dashboard.html'), 'utf8');
    const dashboardJs = fs.readFileSync(path.join(root, 'app', 'public', 'js', 'dashboard.js'), 'utf8');

    expect(fs.existsSync(path.join(root, 'app', 'plugins', 'data-source'))).toBe(false);
    expect(dashboard).not.toMatch(/datasource-|TikFinity|tiktok-data-source/i);
    expect(dashboardJs).not.toMatch(/\/api\/data-source|datasource:|TikFinity|loadDataSourceStatus/);
  });

  test('does not retain orphaned source-choice localization machinery', () => {
    const root = path.join(__dirname, '..', '..');
    const localePaths = ['de', 'en', 'es', 'fr'].map((lang) => path.join(root, 'app', 'locales', `${lang}.json`));
    const inventory = fs.readFileSync(path.join(root, 'app', 'locales', 'translation-inventory.json'), 'utf8');
    const repairScripts = [
      'scripts/repair-dashboard-i18n.js',
      'scripts/repair-dashboard-extended-i18n.js'
    ].map((relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8'));

    for (const localePath of localePaths) {
      const locale = JSON.parse(fs.readFileSync(localePath, 'utf8'));
      expect(locale.dashboard).not.toHaveProperty('tiktok_source');
      expect(locale.dashboard).not.toHaveProperty('tiktok_source_desc');
      expect(locale.common.dashboard).not.toHaveProperty('tiktok_datenquelle');
      expect(locale.common.dashboard).not.toHaveProperty('wahle_die_datenquelle_fur_tiktok_live_events_die_anderung_wird_beim_nachsten_verbinden_aktiv');
      expect(locale.settings).not.toHaveProperty('websocket_port');
      expect(locale.settings).not.toHaveProperty('websocket_hint');
    }
    expect(inventory).not.toMatch(/dashboard\.tiktok_source|settings\.websocket_(?:port|hint)/);
    for (const repairScript of repairScripts) {
      expect(repairScript).not.toMatch(/tiktok_source(?:_desc)?|settings\.websocket_(?:port|hint)|websocket_port/);
    }
  });

  test('does not publish Data Source Manager or TikFinity as a live-data option', () => {
    const root = path.join(__dirname, '..', '..');
    const thisTest = path.relative(root, __filename).replace(/\\/g, '/');
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'plugin-store.json'), 'utf8'));
    const activeFiles = [
      'app/README.md', 'app/wiki/Home.md', 'app/wiki/Wiki-Index.md',
      'docs/SNAPSHOT_STATUS.md', 'infos/llm_start_here.md',
      'features/catalog-data.js', 'plugins.html', 'sitemap.xml'
    ];
    const activeRoots = ['.github', 'app/locales', 'app/wiki', 'build-src/locales', 'docs', 'features', 'infos', 'locales', 'public/locales', 'scripts', 'screenshots'];
    const assetRoots = ['assets', 'screenshots'];
    const banned = /TikFinity|Data Source Manager|Datenquellen-Manager|plugin-data-source|#datasource-eulerstream|\/(?:api|plugins)\/data-source|datasource:|data_source\.plugin|["']data-source["']|plugin:data-source/i;
    const bannedAssetPath = /(?:^|\/)data-source(?:\/|[.-])|tikfinity/i;
    const textFiles = [];
    const assetFiles = [];
    const collectTextFiles = (relativePath) => {
      const fullPath = path.join(root, relativePath);
      for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
        const child = path.join(relativePath, entry.name);
        if (['docs_archive', 'new_patch', 'superpowers'].includes(entry.name)) continue;
        if (entry.isDirectory()) collectTextFiles(child);
        else if (/\.(?:html|js|json|md|xml)$/i.test(entry.name) && child.replace(/\\/g, '/') !== thisTest) textFiles.push(child);
      }
    };
    const collectAssetFiles = (relativePath) => {
      const fullPath = path.join(root, relativePath);
      for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
        const child = path.join(relativePath, entry.name);
        if (entry.isDirectory()) collectAssetFiles(child);
        else assetFiles.push(child.replace(/\\/g, '/'));
      }
    };
    activeRoots.forEach(collectTextFiles);
    assetRoots.forEach(collectAssetFiles);

    expect(registry.plugins.some((plugin) => plugin.id === 'data-source')).toBe(false);
    expect(fs.existsSync(path.join(root, 'plugin-store', 'packages', 'data-source-1.0.0.zip'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'screenshots', 'features', 'data-source.png'))).toBe(false);
    for (const relativePath of activeFiles) {
      expect(fs.readFileSync(path.join(root, relativePath), 'utf8')).not.toMatch(banned);
    }
    for (const relativePath of textFiles) {
      expect(fs.readFileSync(path.join(root, relativePath), 'utf8')).not.toMatch(banned);
    }
    for (const relativePath of assetFiles) {
      expect(relativePath).not.toMatch(bannedAssetPath);
    }
  });
});
