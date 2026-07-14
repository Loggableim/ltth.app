const fs = require('fs');
const path = require('path');

describe('docs screenshot capture viewport', () => {
  test('focuses an anchor vertically without horizontally panning the page', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );

    expect(source).toContain("anchor.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })");
    expect(source).toContain("window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' })");
    expect(source).toContain("SCREENSHOT_WAIT_AFTER_LOAD_MS || 1500");
    expect(source).toContain('function screenshotClipForAnchor');
    expect(source).toContain('const width = Math.min(viewport.clientWidth, 640);');
    expect(source).toContain('x: Math.round(Math.max(0, Math.min(anchorCenterX - (width / 2), maxX)))');
    expect(source).toContain("await page.screenshot({ path: target, type: 'png', clip: screenshotClip })");
  });
});
