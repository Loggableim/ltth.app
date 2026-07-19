const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

function runThemeBootstrapWithInvalidRoots(htmlPath, documentElement, parentDocumentElement) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const [, source] = html.match(/<script>\s*([\s\S]*?)<\/script>/);
  const observedRoots = [];
  const document = {
    documentElement,
    hidden: true,
    addEventListener: jest.fn(),
    querySelector: jest.fn(() => null)
  };
  const window = {
    parent: { document: { documentElement: parentDocumentElement } },
    addEventListener: jest.fn()
  };

  vm.runInNewContext(source, {
    MutationObserver: class MutationObserver {
      constructor() {}
      observe(root) {
        observedRoots.push(root);
      }
    },
    Promise,
    Set,
    Map,
    document,
    window,
    localStorage: { getItem: jest.fn(() => null) }
  });

  return observedRoots;
}

describe('Music Bot admin broadcast-console redesign', () => {
  let document;
  let script;
  let css;

  beforeAll(() => {
    const root = path.join(__dirname, '..', 'plugins', 'music-bot');
    const html = fs.readFileSync(path.join(root, 'ui.html'), 'utf8');
    script = fs.readFileSync(path.join(root, 'assets', 'ui.js'), 'utf8');
    css = fs.readFileSync(path.join(root, 'assets', 'ui-style.css'), 'utf8');
    document = new JSDOM(html).window.document;
  });

  test('uses one uniquely labelled panel for every named navigation tab', () => {
    const tabs = Array.from(document.querySelectorAll('#tab-bar [role="tab"]'));
    const panels = Array.from(document.querySelectorAll('.console-main > [role="tabpanel"]'));
    const tabControls = tabs.map((tab) => tab.getAttribute('aria-controls'));

    expect(tabs.map((tab) => tab.dataset.tab)).toEqual([
      'player',
      'queue',
      'autodj',
      'history',
      'catalog',
      'playlists',
      'settings',
      'aliases',
      'moderation',
      'overlay'
    ]);
    expect(new Set(tabControls).size).toBe(tabs.length);
    expect(tabControls.every((id) => document.getElementById(id))).toBe(true);
    expect(panels).toHaveLength(tabs.length);
    expect(panels.every((panel) => panel.getAttribute('aria-labelledby'))).toBe(true);

    tabs.forEach((tab) => {
      const name = tab.dataset.tab;
      const panel = document.getElementById(`musicbot-panel-${name}`);
      expect(tab.id).toBe(`musicbot-tab-${name}`);
      expect(tab.getAttribute('aria-controls')).toBe(panel.id);
      expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    });
  });

  test('exposes the requested shell landmarks and native inactive state', () => {
    expect(document.querySelector('.musicbot-shell > .console-header')).not.toBeNull();
    expect(document.querySelector('.musicbot-shell > .safety-strip#musicbot-safety-panel')).not.toBeNull();
    expect(document.querySelector('.console-workspace > nav.console-nav#tab-bar')).not.toBeNull();
    expect(document.querySelector('.console-workspace > main.console-main')).not.toBeNull();

    const activePanel = document.getElementById('musicbot-panel-player');
    const inactivePanels = Array.from(document.querySelectorAll('.console-main > [role="tabpanel"]'))
      .filter((panel) => panel !== activePanel);
    expect(activePanel.hidden).toBe(false);
    expect(activePanel.getAttribute('aria-hidden')).toBe('false');
    expect(inactivePanels.every((panel) => panel.hidden)).toBe(true);
    expect(inactivePanels.every((panel) => panel.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  test('keeps Player and Queue as separate accessible work areas', () => {
    expect(document.querySelector('#musicbot-panel-player #queue-panel')).toBeNull();
    expect(document.querySelector('#musicbot-panel-queue #queue-panel')).not.toBeNull();
    expect(document.querySelector('label[for="search-input"]')).not.toBeNull();
    expect(document.querySelector('label[for="request-input"]')).not.toBeNull();
  });

  test('switches exact semantic panels without Queue-to-Player remapping', () => {
    expect(script).toMatch(/function setActiveTab\(target(?:,|\))/);
    expect(script).toContain('const panelId = `musicbot-panel-${target}`;');
    expect(script).toContain("c.toggleAttribute('hidden', !isActive);");
    expect(script).toContain("c.setAttribute('aria-hidden', isActive ? 'false' : 'true');");
    expect(script).toContain("if (e.key === 'ArrowRight')");
    expect(script).toContain("if (e.key === 'ArrowLeft')");
    expect(script).toContain("if (e.key === 'Home')");
    expect(script).toContain("if (e.key === 'End')");
    expect(script).not.toContain("target === 'queue' ? 'player' : target");
    expect(script).not.toContain("document.getElementById('queue-panel')?.scrollIntoView");
  });

  test('provides responsive, touch-safe and reduced-motion console CSS', () => {
    expect(css).toMatch(/html\s*,\s*body\s*\{[^}]*overflow-x:\s*(?:clip|hidden)/s);
    expect(css).toMatch(/\.console-workspace\s*\{[^}]*grid-template-columns:/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*720px\)/);
    expect(css).toMatch(/\.console-nav\s*\{[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/(?:\.btn|\.tab)[^{]*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.checkbox-field\s+input[^\{]*\{[^}]*width:\s*(?:2\d|[3-9]\d)px[^}]*height:\s*(?:2\d|[3-9]\d)px/s);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  test('does not observe invalid theme roots during the Music Bot bootstrap', () => {
    const roots = runThemeBootstrapWithInvalidRoots(
      path.join(__dirname, '..', 'plugins', 'music-bot', 'ui.html'),
      { nodeType: 9, style: {}, setAttribute: jest.fn() },
      { nodeType: 9 }
    );

    expect(roots).toEqual([]);
  });

  test('does not observe invalid local or parent theme roots during the dashboard bootstrap', () => {
    const roots = runThemeBootstrapWithInvalidRoots(
      path.join(__dirname, '..', 'public', 'dashboard.html'),
      { nodeType: 9, dataset: {}, getAttribute: jest.fn(() => null) },
      { nodeType: 9 }
    );

    expect(roots).toEqual([]);
  });
});
