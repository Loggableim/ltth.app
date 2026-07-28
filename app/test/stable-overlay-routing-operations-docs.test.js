const fs = require('fs');
const path = require('path');

describe('stable overlay routing operations documentation', () => {
  test.each(['en', 'de', 'es', 'fr'])(
    'keeps the %s documentation variant in the active docs tree',
    locale => {
      const variantPath = path.join(
        __dirname,
        '..',
        '..',
        'docs',
        locale,
        'stable-overlay-routing-operations.md'
      );

      expect(fs.existsSync(variantPath)).toBe(true);
      expect(fs.readFileSync(variantPath, 'utf8').trim()).not.toBe('');
    }
  );
});
