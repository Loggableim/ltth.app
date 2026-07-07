const fs = require('fs');
const path = require('path');

describe('root main entry', () => {
  test('routes startup through the launcher instead of loading the server directly', () => {
    const mainJs = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf8');

    expect(mainJs).toMatch(/require\(['"]\.\/app\/launch(?:\.js)?['"]\)/);
    expect(mainJs).not.toMatch(/require\(['"]\.\/app\/server(?:\.js)?['"]\)/);
  });
});
