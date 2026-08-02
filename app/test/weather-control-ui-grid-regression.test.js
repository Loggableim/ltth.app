const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'plugins', 'weather-control', 'ui.html'),
  'utf8'
);

test('anchors the weather effect grid for optional effect cards', () => {
  expect(source).toContain('class="grid grid-2" id="weatherEffectsGrid"');
  expect(source).toContain("document.getElementById('weatherEffectsGrid')");
});
