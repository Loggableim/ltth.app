const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'plugins', 'game-engine', 'ui.html'),
  'utf8'
);

test('skips the optional OpenShock request when the plugin is disabled', () => {
  expect(source).toContain("fetch('/api/plugins')");
  expect(source).toContain('openshockEnabled');
  expect(source).toContain('if (!openshockEnabled)');
  expect(source).toContain('openshockDevices = [];');
});
