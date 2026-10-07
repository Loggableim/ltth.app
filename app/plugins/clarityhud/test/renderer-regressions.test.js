const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const BadgeRenderer = require('../lib/badge-renderer');
const VirtualScroller = require('../lib/virtual-scroller');

function withDom(run) {
  const dom = new JSDOM('<!doctype html><body><div id="feed"></div></body>', { url: 'http://localhost/' });
  const previous = {
    window: global.window,
    document: global.document,
    localStorage: global.localStorage,
    requestAnimationFrame: global.requestAnimationFrame,
    cancelAnimationFrame: global.cancelAnimationFrame,
    ResizeObserver: global.ResizeObserver,
    ClarityHUDI18n: global.ClarityHUDI18n
  };
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  global.requestAnimationFrame = callback => setTimeout(callback, 0);
  global.cancelAnimationFrame = clearTimeout;
  global.ResizeObserver = undefined;
  global.ClarityHUDI18n = { text: (_key, fallback) => fallback };
  try {
    return run(dom);
  } finally {
    dom.window.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete global[key];
      else global[key] = value;
    }
  }
}

describe('ClarityHUD renderer regressions', () => {
  test('newestTop keeps the latest limit and orders newest first; newestBottom orders newest last', () => {
    withDom(() => {
      let selectFeedEvents;
      jest.isolateModules(() => {
        ({ selectFeedEvents } = require('../overlays/full'));
      });
      const events = [1, 2, 3, 4].map(timestamp => ({ timestamp }));

      const fullHtml = fs.readFileSync(path.join(__dirname, '../overlays/full.html'), 'utf8');
      expect(fullHtml).toContain('flex-direction: column-reverse');
      expect(fullHtml.match(/(?:^|\n)\s*\.event-item\s*\{([^}]+)\}/)?.[1]).toMatch(/opacity:\s*1/);
      const fullSource = fs.readFileSync(path.join(__dirname, '../overlays/full.js'), 'utf8');
      expect(fullSource).toContain("!['none', 'default'].includes(s.accessibilityPreset)");
      expect(selectFeedEvents(events, 'newestTop', 2, false).map(event => event.timestamp)).toEqual([3, 4]);
      expect(selectFeedEvents(events, 'newestTop', 2, true).map(event => event.timestamp)).toEqual([4, 3]);
      expect(selectFeedEvents(events, 'newestBottom', 2, false).map(event => event.timestamp)).toEqual([3, 4]);
    });
  });

  test('virtual scroller reinitialization restores the chat history into the renderer', () => {
    const chatSource = fs.readFileSync(path.join(__dirname, '../overlays/chat.js'), 'utf8');
    expect(chatSource).toContain('STATE.virtualScroller.setItems(STATE.messages)');
    withDom(() => {
      const container = document.getElementById('feed');
      const rendered = [];
      const scroller = new VirtualScroller(container, {
        itemHeight: 20,
        maxItems: 20,
        renderCallback: item => {
          rendered.push(item.id);
          const element = document.createElement('div');
          element.dataset.id = item.id;
          return element;
        }
      });
      const initialHistory = [{ id: 'history-1' }, { id: 'history-2' }];
      scroller.setItems(initialHistory);
      scroller.viewportHeight = 100;
      scroller.update();
      expect(scroller.items).toEqual(initialHistory);
      expect(rendered).toEqual(['history-1', 'history-2']);
      scroller.destroy();
    });
  });

  test('badge renderer preserves normalized moderator and subscriber flags without promoting team members', () => {
    const multiSource = fs.readFileSync(path.join(__dirname, '../overlays/multi.js'), 'utf8');
    expect(multiSource).toContain('extractBadges(event.raw || event)');
    withDom(() => {
      const renderer = new BadgeRenderer({ showModerator: true, showSubscriber: true, showTeamLevel: true });
      const normalized = renderer.extractBadges({ isModerator: true, isSubscriber: true, teamMemberLevel: 1 });
      expect(normalized).toMatchObject({ isModerator: true, isSubscriber: true, teamLevel: 10 });
      const container = document.createElement('div');
      renderer.renderToHTML(normalized, container);
      expect(container.querySelector('.badge-moderator')).not.toBeNull();
      expect(container.querySelector('.badge-subscriber')).not.toBeNull();

      const teamMember = renderer.extractBadges({ teamMemberLevel: 4 });
      expect(teamMember).toMatchObject({ isModerator: false, isSubscriber: false, teamLevel: 4 });
    });
  });

  test('fallback-key consent has an explicit UI action and localized prompt copy', () => {
    const mainJs = fs.readFileSync(path.join(__dirname, '../ui/main.js'), 'utf8');
    const mainHtml = fs.readFileSync(path.join(__dirname, '../ui/main.html'), 'utf8');
    const confirmHandler = mainJs.slice(
      mainJs.indexOf('async function confirmMultiFallback'),
      mainJs.indexOf('function requestFallbackConfirmation')
    );
    expect(mainJs).toContain('confirmMultiFallback');
    expect(mainJs).toContain('/api/clarityhud/multi/confirm-fallback/');
    expect(mainJs).toContain('body: JSON.stringify({ confirmed: true })');
    expect(confirmHandler).toContain('await requestFallbackConfirmation()');
    expect(confirmHandler).not.toContain('confirm(');
    expect(mainHtml).toContain('<dialog id="fallback-confirmation-dialog"');
    expect(mainHtml).toContain('id="fallback-confirmation-cancel"');
    expect(mainHtml).toContain('id="fallback-confirmation-confirm"');
    expect(mainHtml).toContain('id="fallback-confirmation-cancel" class="btn btn-secondary" autofocus');
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const messages = JSON.parse(fs.readFileSync(path.join(__dirname, `../locales/${locale}.json`), 'utf8'));
      expect(messages.plugins.clarityhud.runtime.fallback).toMatchObject({
        confirm_button: expect.any(String),
        confirm_title: expect.any(String),
        confirm_prompt: expect.any(String),
        cancel: expect.any(String),
        confirm: expect.any(String),
        confirm_failed: expect.any(String)
      });
    }
  });
});
