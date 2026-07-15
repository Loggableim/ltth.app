const fs = require('fs');
const path = require('path');

describe('docs screenshot specification version', () => {
  test('verifies the current v6 workflow receipt specification', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'verify-docs-screenshot-spec.js'),
      'utf8'
    );

    expect(source).toContain("assert.match(SPEC_VERSION, /v6$/");
  });
});
