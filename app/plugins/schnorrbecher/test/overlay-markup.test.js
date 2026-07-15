const fs = require('fs');
const path = require('path');

const overlayDir = path.join(__dirname, '..', 'overlay');

describe('Schnorrbecher OBS overlay markup', () => {
  test('uses a transparent, scroll-free scene with local Matter and Socket.IO assets', () => {
    const html = fs.readFileSync(path.join(overlayDir, 'coincup.html'), 'utf8');
    const css = fs.readFileSync(path.join(overlayDir, 'coincup.css'), 'utf8');

    expect(html).toContain('id="coin-jar-scene"');
    expect(html).toContain('id="coin-jar"');
    expect(html).toContain('src="/js/matter.min.js"');
    expect(html).toContain('src="/socket.io/socket.io.js"');
    expect(css).toContain('background: transparent');
    expect(css).toContain('overflow: hidden');
    expect(css).toContain('border-top: 0');
    expect(css).toContain('--jar-artwork');
    expect(css).toContain('.gift-sprite');
    expect(css).not.toContain('background: radial-gradient(circle at 32% 28%');
  });
});
