const fs = require('fs');
const path = require('path');

describe('documentation capture preparation evidence', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
    'utf8'
  );

  test('records whether a real local preparation changed its visible anchor', () => {
    expect(source).toContain('const preparationBefore = asset.action?.prepare');
    expect(source).toContain('before: preparationBefore');
    expect(source).toContain('changed: !preparationBefore || JSON.stringify(preparationBefore) !== JSON.stringify(observed)');
  });
});
