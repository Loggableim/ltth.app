const path = require('path');

const { verifyPluginDocsE2e } = require('../../scripts/lib/plugin-docs-e2e');

describe('plugin documentation e2e verifier', () => {
  test('proves every guide-language variant has localized content and real screenshots', () => {
    const result = verifyPluginDocsE2e(path.join(__dirname, '..', '..'));

    expect(result.variants).toBe(152);
    expect(result.errors).toEqual([]);
  });
});
