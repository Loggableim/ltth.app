'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'theme-manager.js'), 'utf8');
const themeStyles = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'themes.css'), 'utf8');
const locales = Object.fromEntries(['de', 'en', 'es', 'fr'].map((locale) => [
  locale,
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8'))
]));

function getValue(data, key) {
  return key.split('.').reduce((value, part) => value?.[part], data);
}

function loadThemeManager(locale = 'en', selectedTheme = 'cid') {
  const dom = new JSDOM('<!doctype html><html><body><div class="topbar-right"><button id="topbar-settings-btn" type="button">Settings</button><button id="next-control" type="button">Next</button></div></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost:3000/dashboard.html'
  });
  Object.defineProperty(dom.window.document, 'readyState', { configurable: true, value: 'complete' });
  dom.window.localStorage.setItem('dashboard-theme', selectedTheme);
  dom.window.i18n = { t: (key) => getValue(locales[locale], key) ?? key };
  dom.window.eval(`${source}\nwindow.__themeManager = themeManager;`);
  return dom;
}

function keydown(dom, element, key) {
  const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

describe('accessible dashboard theme selector', () => {
  test.each(['de', 'en', 'es', 'fr'])('localizes the control name and exposes one selected radio in %s', (locale) => {
    const dom = loadThemeManager(locale);
    const { document } = dom.window;
    const title = locales[locale].theme.selector.title;
    const toggle = document.getElementById('theme-toggle-btn');
    const group = document.getElementById('theme-dropdown');
    const options = [...group.querySelectorAll('[role="radio"]')];

    expect(toggle.localName).toBe('button');
    expect(toggle.getAttribute('aria-label')).toBe(title);
    expect(toggle.getAttribute('aria-controls')).toBe('theme-dropdown');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBe(title);
    expect(options).toHaveLength(5);
    expect(options.every((option) => option.localName === 'button' && option.type === 'button')).toBe(true);
    expect(options.filter((option) => option.getAttribute('aria-checked') === 'true').map((option) => option.dataset.themeOption)).toEqual(['cid']);
    expect(options.filter((option) => option.tabIndex === 0).map((option) => option.dataset.themeOption)).toEqual(['cid']);
    expect(options.every((option) => option.getAttribute('aria-label') === null)).toBe(true);
    dom.window.close();
  });

  test('arrow keys move, select, and wrap the roving radio focus', () => {
    const dom = loadThemeManager('en', 'cid');
    const { document } = dom.window;
    const manager = dom.window.__themeManager;
    const toggle = document.getElementById('theme-toggle-btn');
    toggle.focus();
    toggle.click();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement.dataset.themeOption).toBe('cid');
    let event = keydown(dom, document.activeElement, 'ArrowDown');
    expect(event.defaultPrevented).toBe(true);
    expect(manager.getCurrentTheme()).toBe('night');
    expect(document.activeElement.dataset.themeOption).toBe('night');
    expect(document.activeElement.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement.tabIndex).toBe(0);

    keydown(dom, document.activeElement, 'ArrowUp');
    expect(manager.getCurrentTheme()).toBe('cid');
    keydown(dom, document.activeElement, 'ArrowLeft');
    expect(manager.getCurrentTheme()).toBe('vision-impaired');
    expect(document.activeElement.dataset.themeOption).toBe('vision-impaired');
    dom.window.close();
  });

  test.each(['Enter', ' '])('%s activates the selected radio and returns focus to the trigger', (key) => {
    const dom = loadThemeManager('en', 'night');
    const { document } = dom.window;
    const toggle = document.getElementById('theme-toggle-btn');
    toggle.focus();
    toggle.click();
    const radio = document.activeElement;
    const event = keydown(dom, radio, key);

    expect(event.defaultPrevented).toBe(true);
    expect(dom.window.__themeManager.getCurrentTheme()).toBe('night');
    expect(document.getElementById('theme-dropdown').classList.contains('show')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    dom.window.close();
  });

  test('Escape closes the group and returns focus to the trigger', () => {
    const dom = loadThemeManager('en', 'day');
    const { document } = dom.window;
    const toggle = document.getElementById('theme-toggle-btn');
    toggle.focus();
    toggle.click();
    const event = keydown(dom, document.activeElement, 'Escape');

    expect(event.defaultPrevented).toBe(true);
    expect(document.getElementById('theme-dropdown').classList.contains('show')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    dom.window.close();
  });

  test('Tab focus leaving the radio group closes it without trapping focus', () => {
    const dom = loadThemeManager('en', 'cid');
    const { document } = dom.window;
    const toggle = document.getElementById('theme-toggle-btn');
    toggle.focus();
    toggle.click();
    const nextControl = document.getElementById('next-control');
    nextControl.focus();

    expect(document.activeElement).toBe(nextControl);
    expect(document.getElementById('theme-dropdown').classList.contains('show')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    dom.window.close();
  });

  test('popup visibility is immediate on open and radio transitions do not delay keyboard focus', () => {
    expect(themeStyles).toMatch(/\.theme-dropdown\s*\{[^}]*transition:\s*opacity\s+0\.2s\s+ease,\s*transform\s+0\.2s\s+ease,\s*visibility\s+0s\s+linear\s+0\.2s;/s);
    expect(themeStyles).toMatch(/\.theme-dropdown\.show\s*\{[^}]*transition:\s*opacity\s+0\.2s\s+ease,\s*transform\s+0\.2s\s+ease,\s*visibility\s+0s;/s);
    expect(themeStyles).toMatch(/\.theme-option\s*\{[^}]*transition:\s*background-color\s+0\.2s\s+ease,\s*color\s+0\.2s\s+ease;/s);
  });

  test('programmatic theme changes keep the checked radio and tab stop synchronized', () => {
    const dom = loadThemeManager('fr', 'cid');
    dom.window.__themeManager.setTheme('day');
    const options = [...dom.window.document.querySelectorAll('#theme-dropdown [role="radio"]')];

    expect(options.filter((option) => option.getAttribute('aria-checked') === 'true').map((option) => option.dataset.themeOption)).toEqual(['day']);
    expect(options.filter((option) => option.tabIndex === 0).map((option) => option.dataset.themeOption)).toEqual(['day']);
    expect(dom.window.document.getElementById('theme-toggle-btn').getAttribute('aria-label')).toBe(locales.fr.theme.selector.title);
    dom.window.close();
  });
});
