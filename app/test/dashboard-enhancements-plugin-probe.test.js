const fs = require('fs');
const path = require('path');

describe('Dashboard quick-action plugin probes', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'dashboard-enhancements.js'),
    'utf8'
  );

  it('only probes plugin-local status routes when their plugin is active', () => {
    expect(source).toContain('async function loadQuickActionButtonStates(activePlugins = new Set())');
    expect(source).toContain('await loadQuickActionButtonStates(activePlugins);');
    expect(source).toContain("if (activePlugins.has('emoji-rain')) {");
    expect(source).toContain("if (activePlugins.has('webgpu-emoji-rain')) {");
    expect(source).toContain("if (activePlugins.has('openshock')) {");
  });
});
