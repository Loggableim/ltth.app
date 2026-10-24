'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const publicRoot = path.join(__dirname, '..', 'public');
let rendered;
beforeAll(() => {
  // Run jsdom in Node's native loader: its installed dependencies include ESM.
  const probe = execFileSync(process.execPath, ['-e', `
    const fs = require('fs');
    const { JSDOM, VirtualConsole } = require('jsdom');
    const html = fs.readFileSync(process.argv[1], 'utf8');
    const dom = new JSDOM(html, { virtualConsole: new VirtualConsole() });
    const doc = dom.window.document;
    const modal = doc.createElement('div');
    modal.className = 'modal-overlay'; doc.body.appendChild(modal);
    console.log(JSON.stringify({
      entrypoint: !!doc.querySelector('[data-plugin="chatango"], [data-view="chatango"], #view-chatango, #chatango-widget-container, #chatango-embed-container, .shoutbox-section'),
      script: [...doc.querySelectorAll('script[src],iframe')].some(e => /chatango/i.test(e.getAttribute('src') || e.getAttribute('data-src') || '')),
      dashboard: !!doc.querySelector('#view-dashboard'),
      updates: !!doc.querySelector('#updates-section'),
      modalDisplay: dom.window.getComputedStyle(modal).display
    }));
    dom.window.close();
  `, path.join(publicRoot, 'dashboard.html')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8'
  });
  rendered = JSON.parse(probe);
});
test('parsed dashboard has no Chatango navigation, iframe, widget or script entrypoints', () => {
  expect(rendered.entrypoint).toBe(false);
  expect(rendered.script).toBe(false);
  expect(rendered.dashboard).toBe(true);
  expect(rendered.updates).toBe(true);
  expect(fs.existsSync(path.join(publicRoot, 'js', 'chatango-theme-adapter.js'))).toBe(false);
});
test('removing adjoining Chatango CSS keeps modal CSS parsed and hidden', () => {
  expect(fs.readFileSync(path.join(publicRoot, 'dashboard.html'), 'utf8')).not.toContain('}`n');
  expect(rendered.modalDisplay).toBe('none');
});
test('removed integration leaves no navigation or featured-store Chatango hooks', () => {
  for (const name of ['css/navigation.css', 'js/navigation.js', 'js/plugin-manager.js']) {
    expect(fs.readFileSync(path.join(publicRoot, name), 'utf8')).not.toMatch(/chatango|shoutbox/i);
  }
});
