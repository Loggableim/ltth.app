const fs = require('fs');
const path = require('path');

test('public docs retire only Chatango while retaining the QA gallery and other cards', () => {
  const root = path.join(__dirname, '../..');
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'docs/plugins/index.json'), 'utf8'));
  expect(JSON.stringify(catalog)).not.toMatch(/chatango/i);
  const qa = fs.readFileSync(path.join(root, 'docs/plugin-docs-qa/index.html'), 'utf8');
  const cards = [...qa.matchAll(/<article class="capture-card" data-plugin="([^"]+)" data-locale="([^"]+)"/g)]
    .map(match => [match[1], match[2]]);
  expect(cards).toHaveLength(836);
  expect(cards.some(([plugin]) => plugin === "chatango")).toBe(false);
  expect(qa).toContain('LTTH Plugin Documentation QA');
});
