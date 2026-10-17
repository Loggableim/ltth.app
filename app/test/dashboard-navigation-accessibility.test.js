'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const postcss = require('postcss');

const publicDir = path.join(__dirname, '..', 'public');
const dashboardHtml = fs.readFileSync(path.join(publicDir, 'dashboard.html'), 'utf8');
const navigationScript = fs.readFileSync(path.join(publicDir, 'js', 'navigation.js'), 'utf8');
const navigationCss = fs.readFileSync(path.join(publicDir, 'css', 'navigation.css'), 'utf8');
const themesCss = fs.readFileSync(path.join(publicDir, 'css', 'themes.css'), 'utf8');
const stylesheet = postcss.parse(themesCss);

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function findRule(selectorFragment) {
  let match = null;
  stylesheet.walkRules((rule) => {
    if (!match && rule.selector.includes(selectorFragment)) match = rule;
  });
  return match;
}

function createDashboardDom(savedState = {}) {
  const dom = new JSDOM(dashboardHtml, {
    runScripts: 'outside-only',
    url: 'http://localhost/dashboard.html',
    pretendToBeVisual: true
  });
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 390 });
  Object.entries(savedState).forEach(([key, value]) => dom.window.localStorage.setItem(key, value));
  dom.window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };
  dom.window.lucide = { createIcons: jest.fn() };
  dom.window.fetch = jest.fn(async (url) => {
    if (url !== '/api/plugins') throw new Error(`Unexpected network request in navigation test: ${url}`);
    const plugins = [...dom.window.document.querySelectorAll('[data-plugin]')]
      .map((element) => element.dataset.plugin)
      .filter((id, index, all) => id && all.indexOf(id) === index)
      .map((id) => ({ id, enabled: true }));
    return {
      ok: true,
      json: async () => ({ success: true, distributionMode: 'local', plugins })
    };
  });

  const domReadyListeners = [];
  const addEventListener = dom.window.document.addEventListener.bind(dom.window.document);
  dom.window.document.addEventListener = (type, listener, ...args) => {
    if (type === 'DOMContentLoaded') {
      domReadyListeners.push(listener);
      return;
    }
    return addEventListener(type, listener, ...args);
  };
  dom.window.eval(navigationScript);
  dom.window.document.addEventListener = addEventListener;

  return {
    dom,
    async initialize() {
      for (const listener of domReadyListeners) {
        await listener.call(dom.window.document, new dom.window.Event('DOMContentLoaded'));
      }
    }
  };
}

describe('dashboard navigation accessibility', () => {
  test('keeps every real view reachable through one named navigation link', () => {
    const dom = new JSDOM(dashboardHtml);
    const { document } = dom.window;
    const links = [...document.querySelectorAll('.sidebar-item[data-view]')];
    const viewIds = new Set([...document.querySelectorAll('[id^="view-"]')].map((view) => view.id.slice(5)));
    const navIds = links.map((link) => link.dataset.view);

    expect(links).toHaveLength(42);
    expect(new Set(navIds).size).toBe(42);
    expect(new Set(navIds)).toEqual(viewIds);
    expect(links.every((link) => link.querySelector('.sidebar-item-text')?.textContent.trim())).toBe(true);
    expect(document.querySelector('.sidebar-nav').getAttribute('aria-label')).toBe('Main navigation');
    expect(document.getElementById('wiki-nav').getAttribute('aria-label')).toBe('Wiki navigation');
    expect(document.querySelectorAll('.sidebar-category-header')).toHaveLength(7);
    document.querySelectorAll('.sidebar-category-header').forEach((header) => {
      expect(header.tagName).toBe('BUTTON');
      expect(header.getAttribute('aria-controls')).toBeTruthy();
      expect(document.getElementById(header.getAttribute('aria-controls'))).not.toBeNull();
    });
    dom.window.close();
  });

  test('saved collapsed groups expose a closed state and hide their links from the focus tree', async () => {
    const { dom, initialize } = createDashboardDom({ 'sidebar-category-core': 'collapsed' });
    try {
      await initialize();
      const group = dom.window.document.querySelector('.sidebar-category[data-category="core"]');
      const header = group.querySelector('.sidebar-category-header');
      const items = group.querySelector('.sidebar-category-items');

      expect(header.tagName).toBe('BUTTON');
      expect(header.getAttribute('aria-expanded')).toBe('false');
      expect(header.getAttribute('aria-controls')).toBe(items.id);
      expect(items.hidden).toBe(true);
      expect(items.querySelector('a').closest('[hidden]')).toBe(items);

      header.click();
      expect(header.getAttribute('aria-expanded')).toBe('true');
      expect(items.hidden).toBe(false);
      header.click();
      expect(header.getAttribute('aria-expanded')).toBe('false');
      expect(items.hidden).toBe(true);
    } finally {
      dom.window.close();
    }
  });

  test('mobile navigation names and controls its drawer, transfers focus, and restores it on Escape', async () => {
    const { dom, initialize } = createDashboardDom();
    try {
      await initialize();
      const { document } = dom.window;
      const menu = document.getElementById('mobile-menu-btn');
      const sidebar = document.getElementById('sidebar');
      const firstGroup = sidebar.querySelector('.sidebar-category-header');

      expect(menu.getAttribute('aria-label')).toBeTruthy();
      expect(menu.getAttribute('aria-controls')).toBe('sidebar');
      expect(menu.getAttribute('aria-expanded')).toBe('false');

      menu.focus();
      menu.click();
      expect(menu.getAttribute('aria-expanded')).toBe('true');
      expect(sidebar.classList.contains('mobile-open')).toBe(true);
      expect(document.activeElement).toBe(firstGroup);

      firstGroup.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Escape', bubbles: true, cancelable: true
      }));
      expect(menu.getAttribute('aria-expanded')).toBe('false');
      expect(sidebar.classList.contains('mobile-open')).toBe(false);
      expect(document.activeElement).toBe(menu);
    } finally {
      dom.window.close();
    }
  });

  test('view changes set aria-current and announce the selected destination', async () => {
    const { dom, initialize } = createDashboardDom();
    try {
      await initialize();
      const { document } = dom.window;
      document.querySelector('.sidebar-item[data-view="events"]').click();

      expect(document.querySelector('.sidebar-item[data-view="events"]').getAttribute('aria-current')).toBe('page');
      expect(document.querySelector('.sidebar-item[data-view="dashboard"]').hasAttribute('aria-current')).toBe(false);
      expect(document.getElementById('navigation-view-announcement').getAttribute('role')).toBe('status');
      expect(document.getElementById('navigation-view-announcement').getAttribute('aria-live')).toBe('polite');
      expect(document.getElementById('navigation-view-announcement').textContent).toBe('Events');
    } finally {
      dom.window.close();
    }
  });

  test.each([
    ['day', '#7c3aed'],
    ['night', '#7c3aed'],
    ['cid', '#7c3aed'],
    ['contrast', '#166534']
  ])('%s active navigation text keeps 4.5:1 contrast or better', (theme, expectedBackground) => {
    const activeRule = theme === 'contrast'
      ? findRule('[data-theme="contrast"] .sidebar-item.active')
      : findRule('[data-theme="day"], [data-theme="night"], [data-theme="cid"], [data-theme="aurora"]) .sidebar-item.active');
    expect(activeRule).not.toBeNull();
    const declarations = Object.fromEntries(activeRule.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value]));
    const foreground = declarations.color;
    const rootTokens = Object.fromEntries(findRule(':root').nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value]));
    const background = theme === 'contrast' ? rootTokens['--color-action-primary'] : declarations.background;

    if (theme === 'contrast') {
      expect(declarations.background).toBe('var(--color-action-primary, #166534)');
    }
    expect(background).toBe(expectedBackground);
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  test('localizes navigation landmark and menu names in the supported dashboard locales', () => {
    const locales = ['de', 'en', 'es', 'fr'];
    const expected = {
      de: ['Hauptnavigation', 'Wiki-Navigation', 'Navigation umschalten'],
      en: ['Main navigation', 'Wiki navigation', 'Toggle navigation'],
      es: ['Navegación principal', 'Navegación de la wiki', 'Alternar navegación'],
      fr: ['Navigation principale', 'Navigation du wiki', 'Basculer la navigation']
    };

    for (const locale of locales) {
      const messages = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8'));
      expect([
        messages.navigation.main_navigation,
        messages.navigation.wiki_navigation,
        messages.navigation.toggle_navigation
      ]).toEqual(expected[locale]);
    }
  });

  test('navigation focus indicators are explicit and visible', () => {
    expect(navigationCss).toMatch(/\.sidebar-category-header:focus-visible,[\s\S]*?\.sidebar-item:focus-visible,[\s\S]*?outline:\s*3px solid var\(--color-accent-secondary\)/);
  });
});
