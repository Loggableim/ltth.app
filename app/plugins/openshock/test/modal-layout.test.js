const fs = require('fs');
const path = require('path');

describe('Hybridshock modal layout', () => {
  test('keeps large modals scrollable within the iframe viewport', () => {
    const stylesheet = fs.readFileSync(
      path.join(__dirname, '..', 'openshock.css'),
      'utf8'
    );
    const largeModalRule = stylesheet.match(/\.modal-content-large\s*\{([^}]*)\}/);

    expect(largeModalRule).not.toBeNull();
    expect(largeModalRule[1]).toMatch(/max-height:\s*90vh;/);
    expect(largeModalRule[1]).toMatch(/overflow-y:\s*auto;/);
  });
});
