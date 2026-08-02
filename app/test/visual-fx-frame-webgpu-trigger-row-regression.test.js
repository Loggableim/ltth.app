const fs = require('fs');
const path = require('path');

const settings = fs.readFileSync(
  path.join(__dirname, '..', 'plugins', 'visual-fx-frame-webgpu', 'ui', 'settings.html'),
  'utf8'
);

test('keeps the translation helper callable while rendering trigger rows', () => {
  const rowBuilder = settings.match(/function buildRuleRow\(rule, index\) \{([\s\S]*?)\n        \}/)?.[1] || '';
  expect(rowBuilder).toContain("condInput.placeholder = tr('any'");
  expect(rowBuilder).not.toContain('const tr = document.createElement');
  expect(rowBuilder).toContain('const row = document.createElement');
});
