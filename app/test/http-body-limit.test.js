const fs = require('fs');
const path = require('path');

describe('HTTP JSON body limit', () => {
  test('accepts avatar capability profiles larger than Express default limit', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

    expect(serverSource).toMatch(/app\.use\(express\.json\(\{\s*limit:\s*['"]2mb['"]\s*}\)\);/);
  });
});
