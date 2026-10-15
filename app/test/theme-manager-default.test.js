const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const themeManagerSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'theme-manager.js'),
  'utf8'
);
const themeStyles = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'css', 'themes.css'),
  'utf8'
);

function loadThemeManager(savedTheme) {
  const dom = new JSDOM('<!doctype html><html><body><div class="topbar-right"></div></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost:3000/dashboard.html'
  });
  if (savedTheme) {
    dom.window.localStorage.setItem('dashboard-theme', savedTheme);
  }
  dom.window.eval(`${themeManagerSource}\nwindow.__themeManager = themeManager;`);
  return dom;
}

describe('ThemeManager default theme', () => {
  test('uses Cid when a new installation has no saved theme', () => {
    const dom = loadThemeManager();

    expect(dom.window.document.documentElement.getAttribute('data-theme')).toBe('cid');
  });

  test('keeps an existing user theme selection', () => {
    const dom = loadThemeManager('night');

    expect(dom.window.document.documentElement.getAttribute('data-theme')).toBe('night');
  });

  test('keeps the Cid theme identity and exposes the green white violet brand palette', () => {
    const dom = loadThemeManager();
    const cid = dom.window.__themeManager.themes.cid;

    expect(dom.window.__themeManager.getCurrentTheme()).toBe('cid');
    expect(cid.swatches).toEqual(['#166534', '#ffffff', '#7c3aed']);
    expect(cid.description).toMatch(/neutral dark/i);
  });

  test('uses active-theme background, border, and text tokens for the theme panel', () => {
    expect(themeStyles).toMatch(/\.theme-dropdown\s*\{[^}]*background:\s*var\(--color-bg-secondary\)/s);
    expect(themeStyles).toMatch(/\.theme-dropdown\s*\{[^}]*border:\s*1px solid var\(--color-border\)/s);
    expect(themeStyles).toMatch(/\.theme-option-name\s*\{[^}]*color:\s*var\(--color-text-primary\)/s);
    expect(themeStyles).toMatch(/\.theme-option-description\s*\{[^}]*color:\s*var\(--color-text-muted\)/s);

    const dom = loadThemeManager();
    dom.window.__themeManager.setupUI();
    const options = [...dom.window.document.querySelectorAll('.theme-option')];
    expect(options.map(option => option.dataset.themeOption)).toContain('day');
    expect(options.every(option => !option.hasAttribute('data-theme'))).toBe(true);
  });
});
