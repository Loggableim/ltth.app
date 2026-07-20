const fs = require('fs');
const path = require('path');

const overlayDir = path.join(__dirname, '..', 'overlay');

describe('Schnorrbecher OBS overlay markup', () => {
  test('uses a transparent, scroll-free scene with local Matter and Socket.IO assets', () => {
    const html = fs.readFileSync(path.join(overlayDir, 'coincup.html'), 'utf8');
    const css = fs.readFileSync(path.join(overlayDir, 'coincup.css'), 'utf8');
    const script = fs.readFileSync(path.join(overlayDir, 'coincup.js'), 'utf8');

    expect(html).toContain('id="coin-jar-scene"');
    expect(html).toContain('id="coin-jar"');
    expect(html).toContain('id="coin-jar-impact-sound"');
    expect(html).toContain('/plugins/schnorrbecher/assets/sounds/adriantnt_glass.mp3');
    expect(html).toContain('src="/js/matter.min.js"');
    expect(html).toContain('src="/socket.io/socket.io.js"');
    expect(css).toContain('background: transparent');
    expect(css).toContain('overflow: hidden');
    expect(css).toContain('border: 0;');
    expect(css).toContain('background-image: var(--jar-artwork);');
    expect(css).toContain('box-shadow: none;');
    expect(css).toContain('--jar-artwork');
    expect(css).toContain('.gift-sprite');
    expect(css).not.toContain('border-right: 5px solid');
    expect(css).not.toContain('.jar-rim');
    expect(css).not.toContain('border: 1px solid rgba(255, 255, 255, .6)');
    expect(css).not.toContain('background: rgba(10, 22, 42, .16)');
    expect(css).not.toContain('.gift-fallback');
    expect(script).not.toContain("textContent = '🎁'");
    expect(html).not.toContain('class="jar-rim"');
    expect(css).not.toContain('background: radial-gradient(circle at 32% 28%');
  });
});
