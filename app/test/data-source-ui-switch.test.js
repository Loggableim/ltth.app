const fs = require('fs');
const path = require('path');

describe('data-source UI switching', () => {
  test('renders the selected local source from the successful REST response', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'data-source', 'ui.js'), 'utf8');

    const switchHandler = source.split("fetch('/api/data-source/switch'")[1];

    expect(switchHandler).toMatch(/if \(data\.success\) \{[\s\S]*?updateUI\(data\.newSource\);[\s\S]*?showToast\(data\.message, 'success'\);/);
  });
});
