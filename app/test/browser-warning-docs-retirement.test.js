const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

test('current browser-warning docs do not describe retired embeds as active', () => {
  for (const locale of ['', 'de', 'en', 'es', 'fr']) {
    const file = path.join(root, 'docs', locale, 'BROWSER_CONSOLE_WARNINGS.md');
    const source = fs.readFileSync(file, 'utf8');
    expect(source).not.toMatch(/chatango|shoutbox|chatango\.com|id\.html/i);
  }
});
