const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('Fireworks overlay lifecycle', () => {
  test('preserves the renderer across BFCache and destroys it on final pagehide', async () => {
    const html = fs.readFileSync(path.join(__dirname, '../overlay.html'), 'utf8');
    const engineSource = fs.readFileSync(path.join(__dirname, '../gpu/engine.js'), 'utf8');
    const dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'http://127.0.0.1/plugins/fireworks/overlay.html'
    });
    const { window } = dom;

    // Keep the original renderer and DOMContentLoaded bootstrap, while replacing
    // its render/audio initialization with local lifecycle spies.
    window.eval(`${engineSource}\nFireworksEngine.prototype.init = async function () {
      this.destroy = () => { window.destroyCalls = (window.destroyCalls || 0) + 1; };
    };`);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(window.FireworksEngine).toBeTruthy();
    expect(window.destroyCalls || 0).toBe(0);

    const bfcacheHide = new window.PageTransitionEvent('pagehide', { persisted: true });
    window.dispatchEvent(bfcacheHide);
    expect(window.destroyCalls || 0).toBe(0);

    const finalHide = new window.PageTransitionEvent('pagehide', { persisted: false });
    window.dispatchEvent(finalHide);
    expect(window.destroyCalls).toBe(1);

    dom.window.close();
  });
});
