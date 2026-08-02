const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'plugins', 'game-engine', 'ui.html'),
  'utf8'
);

test('uses the registered gift catalog update endpoint', () => {
  expect(source).toContain("fetch('/api/gift-catalog/update'");
  expect(source).not.toContain("fetch('/api/gift-catalog/refresh'");
});
