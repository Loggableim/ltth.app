const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const websiteRoot = path.join(__dirname, '..', '..');
const headerHtml = fs.readFileSync(path.join(websiteRoot, '_partials', 'header.html'), 'utf8');
const layoutSource = fs.readFileSync(path.join(websiteRoot, 'js', 'layout.js'), 'utf8')
  .replace('window.LTTHLayout = { init, detectLanguage, applyScreenshotLocale, localizedScreenshotUrl };', 'window.__initMegaMenu = initMegaMenu;');

describe('website mega-menu interaction', () => {
  test('a desktop click keeps the menu open when pointer entry opened it first', () => {
    const dom = new JSDOM(headerHtml, { runScripts: 'outside-only', url: 'https://ltth.app/' });
    const { document, MouseEvent } = dom.window;

    dom.window.eval(layoutSource);
    dom.window.__initMegaMenu();

    const mega = document.getElementById('featuresMega');
    const toggle = document.getElementById('featuresMenuToggle');
    mega.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(mega.classList.contains('open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    dom.window.close();
  });
});
