const fs = require('fs');
const path = require('path');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
const navigation = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'navigation.js'), 'utf8');
const releasePolicy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'plugin-release-policy.json'), 'utf8'));

describe('Sidekick dashboard entry', () => {
  test('exposes its local UI only through plugin-gated navigation and content nodes', () => {
    expect(dashboard).toMatch(/<a href="#" class="sidebar-item" data-view="sidekick" data-plugin="sidekick"/);
    expect(dashboard).toMatch(/<div id="view-sidekick" class="content-view" data-plugin="sidekick">[\s\S]*?<iframe data-src="\/sidekick\/ui" title="Sidekick"><\/iframe>/);
    expect(releasePolicy.closedBeta).toContain('sidekick');
  });

  test('retains the inventory allowlist gate for public and invalid distribution modes', () => {
    expect(navigation).toContain("!['public', 'local'].includes(data.distributionMode)");
    expect(navigation).toContain("pluginInventoryMode === 'public' && !isInstalled");
    expect(navigation).toContain("if (isSidebarItem && !isEnabled)");
  });
});
