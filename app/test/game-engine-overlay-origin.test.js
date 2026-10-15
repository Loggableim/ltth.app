'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
let result;
beforeAll(() => {
  // Native Node loader supports installed jsdom ESM dependencies; no Jest config override.
  result = JSON.parse(execFileSync(process.execPath, ['-e', `
    const fs = require('fs');
    const path = require('path');
    const { JSDOM, VirtualConsole } = require('jsdom');
    const { readButtonURL } = require('./public/js/tiktok-studio-url');
    const pluginRoot = path.resolve('plugins/game-engine');
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    const helper = fs.readFileSync(path.join(pluginRoot, 'tiktok-studio-ui.js'), 'utf8');
    function createUi(origin, values = {}) {
      const dom = new JSDOM(html, { url: origin + '/plugins/game-engine/ui.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
      for (const [id, value] of Object.entries(values)) {
        dom.window.document.getElementById(id).value = value;
      }
      dom.window.eval(helper);
      dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
      return dom;
    }
    (async () => {
      const origins = ['http://127.0.0.1:43219', 'http://localhost:43220'];
      const sources = origins.map(origin => {
        const dom = createUi(origin);
        try {
          const buttons = [...dom.window.document.querySelectorAll('[data-tiktok-studio-source]')];
          return { origin, urls: buttons.map(button => readButtonURL(button, { documentRef: dom.window.document })) };
        } finally { dom.window.close(); }
      });
      const dom = createUi(origins[0]);
      const window = dom.window;
      const copied = [], opened = [];
      Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async value => copied.push(value) } });
      window.showMessage = () => {};
      window.open = (...args) => opened.push(args);
      const start = html.indexOf('    function copyOverlayURL(');
      const originalFunctions = html.slice(start, html.indexOf('    let arenaConfig =', start));
      window.eval(originalFunctions);
      window.copyOverlayURL('overlay-url-hud');
      await Promise.resolve();
      window.previewOverlay(window.document.getElementById('overlay-url-hud').value);
      const source = window.document.getElementById('overlay-url-chess-mode');
      const modeURL = origins[0] + '/overlay/game-engine/chess?lang=fr&theme=night';
      source.setAttribute('data-overlay-url', modeURL);
      window.eval(helper);
      window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
      const button = window.document.querySelector('[data-tiktok-studio-source="#overlay-url-chess-mode"]');
      const repeat = { url: readButtonURL(button, { documentRef: window.document }), buttonCount: window.document.querySelectorAll('[data-tiktok-studio-source]').length };
      window.close();
      const customURL = 'https://custom.example/overlay/game-engine/hud?next=http://localhost:3000/overlay/game-engine/chess';
      const currentURL = origins[0] + '/overlay/game-engine/chess?lang=fr';
      const customDom = createUi(origins[0], { 'overlay-url-hud': customURL, 'overlay-url-chess': currentURL });
      const custom = ['#overlay-url-hud', '#overlay-url-chess'].map(selector => readButtonURL(customDom.window.document.querySelector('[data-tiktok-studio-source="' + selector + '"]'), { documentRef: customDom.window.document }));
      customDom.window.close();
      console.log(JSON.stringify({ sources, copied, opened, repeat, custom }));
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000 }));
}, 35000);

test.each([0, 1])('all 19 existing copy sources preserve alternative loopback origin %s before settings load', (index) => {
  const { origin, urls } = result.sources[index];
  expect(urls).toHaveLength(19);
  for (const value of urls) {
    const url = new URL(value);
    expect(url.origin).toBe(origin);
    expect(url.pathname.startsWith('/overlay/game-engine/')).toBe(true);
  }
});

test('original HUD clipboard and preview functions consume corrected real DOM value', () => {
  expect(result.copied).toEqual(['http://127.0.0.1:43219/overlay/game-engine/hud']);
  expect(result.opened).toEqual([['http://127.0.0.1:43219/overlay/game-engine/hud', '_blank', 'width=1200,height=800']]);
});

test('repeat install preserves current mode path/query without duplicate actions', () => {
  expect(result.repeat).toEqual({ url: 'http://127.0.0.1:43219/overlay/game-engine/chess?lang=fr&theme=night', buttonCount: 19 });
});

test('initial install preserves custom-origin query contents and already-current URL', () => {
  expect(result.custom).toEqual([
    'https://custom.example/overlay/game-engine/hud?next=http://localhost:3000/overlay/game-engine/chess',
    'http://127.0.0.1:43219/overlay/game-engine/chess?lang=fr'
  ]);
});
