const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');

function readRootPage(filename) {
  return fs.readFileSync(path.join(rootDir, filename), 'utf8');
}

describe('TikTok Login Kit legal pages', () => {
  test('publish the required Login Kit policy pages and footer links', () => {
    const terms = readRootPage('terms-of-service.html');
    const privacy = readRootPage('privacy-policy.html');
    const footer = readRootPage('_partials/footer.html');

    expect(terms).toContain('ltth.app');
    expect(terms).toContain('TikTok Login Kit');
    expect(privacy).toContain('ltth.app');
    expect(privacy).toContain('TikTok Login Kit');
    expect(terms).toContain('LTTHLayout.init()');
    expect(privacy).toContain('LTTHLayout.init()');
    expect(footer).toContain('href="/terms-of-service.html"');
    expect(footer).toContain('href="/privacy-policy.html"');
  });
});
