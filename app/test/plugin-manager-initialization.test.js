const fs = require('fs');
const path = require('path');

describe('Plugin Manager initialization', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'plugin-manager.js'),
    'utf8'
  );
  const authSource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'clerk-store-auth.js'),
    'utf8'
  );
  const dashboardSource = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'dashboard.html'),
    'utf8'
  );

  test('initializes before navigation restores the App Store view', () => {
    expect(source).toContain('function initializePluginManager()');
    expect(source).toContain("if (!document.getElementById('view-plugins')) return null;");
    expect(source).toContain('if (!initializePluginManager())');
    expect(source).toContain("document.addEventListener('DOMContentLoaded', initializePluginManager, { once: true });");
    expect(source).not.toContain("document.addEventListener('DOMContentLoaded', () => {\n        window.pluginManager = new PluginManager();");
  });

  test('keeps disabled plugins visible for unknown development statuses', () => {
    expect(source).toContain("document.addEventListener('click', this.storeControlClickHandler, true);");
    expect(source).toContain("const nextFilter = ['all', 'active', 'inactive'].includes(filter) ? filter : 'all';");
    expect(source).toContain("} else if (this.currentFilter === 'inactive') {");
    expect(source).toContain('filtered = filtered.filter(p => !p.enabled);');
    expect(source).toContain('if (!(plugin.devStatus in this.devStatusFilters)) return true;');
  });

  test('keeps local installed plugins accessible without a Store login', () => {
    expect(source).toContain("window.StoreAuth.setStoreMode(installedMode ? 'installed' : 'store');");
    expect(authSource).toContain("const shouldShow = visible && state.storeMode !== 'installed';");
    expect(authSource).toContain('setStoreMode,');
    expect(dashboardSource).toContain('position: relative;\n            z-index: 1;');
    expect(dashboardSource).not.toContain('.plugin-store-auth-root {\n            position: fixed;');
  });
});
