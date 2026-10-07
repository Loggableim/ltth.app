'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
let result;
beforeAll(() => {
  // Native loader retains the original Jest config with installed jsdom ESM dependencies.
  result = JSON.parse(execFileSync(process.execPath, ['-e', `
    const fs = require('fs');
    const { JSDOM, VirtualConsole } = require('jsdom');
    const html = fs.readFileSync('plugins/milestone-leaderboard/vendor/viewer-leaderboard/ui/admin.html', 'utf8');
    const ids = ['xpBarUrl', 'leaderboardOverlayUrl', 'levelUpUrl'];
    function section(start, end) {
      const index = html.indexOf(start);
      return index < 0 ? '' : html.slice(index, html.indexOf(end, index));
    }
    async function probe(origin, overrides = {}) {
      const dom = new JSDOM(html, { url: origin + '/viewer-xp/admin', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
      const w = dom.window;
      const copied = [];
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => copied.push(text) } });
      w.showToast = () => {};
      w.adminText = (key, fallback) => fallback;
      w.loadPageData = () => {};
      w.refreshLeaderboard = () => {};
      w.alert = () => {};
      for (const [id, value] of Object.entries(overrides)) w.document.getElementById(id).textContent = value;
      w.eval(section('    function initializeOverlayUrls()', '    // Initialize on page load'));
      w.eval(section('    // Initialize on page load', '    // Socket.io connection'));
      w.eval(section('    function copyToClipboard(text)', '    function fallbackCopyToClipboard(text)'));
      w.eval(section('    function updateOverlayUrl(overlayType)', '    // Test overlay in new window'));
      w.eval(section('    // Event delegation for all buttons with data-action attribute', '    // Refresh spin history button'));
      w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
      for (const id of ids) w.document.querySelector('[data-action="copyToClipboard"][data-arg="' + id + '"]').click();
      await Promise.resolve();
      const initial = ids.map(id => w.document.getElementById(id).textContent);
      w.document.getElementById('leaderboardLimit').value = '7';
      w.document.getElementById('leaderboardDays').value = '7';
      w.document.querySelector('[data-action="updateOverlayUrl"][data-arg="leaderboard"]').click();
      const updated = w.document.getElementById('leaderboardOverlayUrl').textContent;
      w.close();
      return { origin, initial, copied, updated };
    }
    (async () => {
      const normal = [await probe('http://127.0.0.1:43219'), await probe('http://localhost:43220')];
      const custom = await probe('http://127.0.0.1:43219', {
        xpBarUrl: 'https://custom.example/overlay/viewer-xp/xp-bar?next=http://localhost:3000/overlay/viewer-xp/level-up',
        leaderboardOverlayUrl: 'http://127.0.0.1:43219/overlay/viewer-xp/leaderboard?lang=fr',
        levelUpUrl: 'http://localhost:3000/overlay/viewer-xp/level-up?lang=es&duration=7#preview'
      });
      console.log(JSON.stringify({ normal, custom }));
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000 }));
}, 35000);

test.each([0, 1])('initial real Copy delegation uses alternative loopback origin %s', (index) => {
  const row = result.normal[index];
  expect(row.copied).toEqual(row.initial);
  expect(row.initial).toEqual([
    `${row.origin}/overlay/viewer-xp/xp-bar`,
    `${row.origin}/overlay/viewer-xp/leaderboard`,
    `${row.origin}/overlay/viewer-xp/level-up`
  ]);
});

test('initial normalization preserves custom/current URL and local path/query/hash', () => {
  expect(result.custom.initial).toEqual([
    'https://custom.example/overlay/viewer-xp/xp-bar?next=http://localhost:3000/overlay/viewer-xp/level-up',
    'http://127.0.0.1:43219/overlay/viewer-xp/leaderboard?lang=fr',
    'http://127.0.0.1:43219/overlay/viewer-xp/level-up?lang=es&duration=7#preview'
  ]);
  expect(result.custom.copied).toEqual(result.custom.initial);
});

test('existing delegated Update URL action still builds current-origin query', () => {
  for (const row of result.normal) {
    const url = new URL(row.updated);
    expect(url.origin).toBe(row.origin);
    expect(url.pathname).toBe('/overlay/viewer-xp/leaderboard');
    expect(url.searchParams.get('limit')).toBe('7');
    expect(url.searchParams.get('days')).toBe('7');
  }
});
