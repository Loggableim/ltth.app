'use strict';

const { createToptierTransport } = require('./helpers/obs-toptier-jsdom-fixture');
const LOCALES = ['de', 'en', 'es', 'fr'];
const OVERLAY_TITLES = {
  de: 'TopTier-Overlay',
  en: 'TopTier Overlay',
  es: 'Superposición de nivel superior',
  fr: 'Superposition de niveau supérieur'
};
async function waitFor(predicate, message) {
  for (let i = 0; i < 100; i += 1) { if (predicate()) return; await new Promise(resolve => setImmediate(resolve)); }
  throw new Error(message);
}
function pageLifecycleEvent(window, type, persisted) {
  const event = new window.Event(type);
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}
describe('source-backed TopTier renderer fixture', () => {
  test.each(LOCALES)('%s: fixed assets, synthetic update, local avatar fallback and cleanup', async locale => {
    const fixture = createToptierTransport({ locale }); const { dom, loaded, errors } = fixture.createDom();
    try {
      await loaded;
      await waitFor(() => dom.window.i18n?.initialized && dom.window.__fixtureSocket?.emitted.length > 0, 'TopTier renderer did not initialize');
      const socket = dom.window.__fixtureSocket;
      expect(dom.window.__fixtureSocketCreationCount()).toBe(1);
      expect(dom.window.socket).toBe(socket);
      fixture.flushTimeouts();
      expect(socket.handlers.get('locale-changed')).toHaveLength(1);
      expect(socket.handlers.get('language-changed')).toHaveLength(1);
      expect(dom.window.document.title).toBe(OVERLAY_TITLES[locale]);
      socket.deliver('locale-changed', { locale: 'fr' });
      await waitFor(() => dom.window.i18n.currentLocale === 'fr', 'TopTier i18n did not consume the shared socket event');
      expect(dom.window.document.title).toBe('Superposition de niveau supérieur');
      expect(socket.emitted).toEqual([{ event: 'toptier:get-board', payload: { board: 'likes' } }]);
      const event = { board: 'likes', entries: [{ username: 'fixture-liker', nickname: 'Fixture Liker', profile_picture_url: '', score: 42, rank: 1 }], sessionId: 'fixture-session-a' };
      socket.deliver('toptier:update', event);
      expect(dom.window.document.querySelector('.tt-spotlight-name').textContent).toBe('Fixture Liker');
      expect(dom.window.document.querySelector('.tt-spotlight-score').textContent).toBe('42');
      const avatar = dom.window.document.querySelector('.tt-spotlight-avatar');
      expect(avatar.getAttribute('src')).toBe('/plugins/toptier/assets/avatar-placeholder.svg');
      socket.deliver('toptier:update', { ...event, board: 'unlisted-board' });
      socket.deliver('toptier:update', { ...event, entries: [{ ...event.entries[0], score: -1 }] });
      expect(dom.window.document.querySelector('.tt-spotlight-score').textContent).toBe('42');
      const staleDelivery = socket.queueDelivery('toptier:update', { ...event, entries: [{ ...event.entries[0], score: 99 }] });
      const before = dom.window.document.querySelector('.tt-spotlight-score').textContent;
      dom.window.dispatchEvent(pageLifecycleEvent(dom.window, 'pagehide', true));
      expect(socket.disconnectedByRenderer).toBe(false);
      expect(dom.window.socket).toBe(socket);
      dom.window.dispatchEvent(pageLifecycleEvent(dom.window, 'pageshow', true));
      socket.deliver('toptier:update', { ...event, entries: [{ ...event.entries[0], score: 77 }] });
      expect(dom.window.document.querySelector('.tt-spotlight-score').textContent).toBe('77');
      const afterRestore = dom.window.document.querySelector('.tt-spotlight-score').textContent;
      socket.deliver('locale-changed', { locale: 'en' });
      await waitFor(() => dom.window.i18n.currentLocale === 'en', 'TopTier i18n did not resume after BFCache restore');
      expect(dom.window.document.title).toBe(OVERLAY_TITLES.en);
      const expectedLocaleReads = ['de', ...(locale === 'de' ? [] : [locale]), ...(locale === 'fr' ? [] : ['fr']), 'en'];
      expect(fixture.requests.map(item => `${item.method} ${item.path}${item.search}`).sort()).toEqual(
        expectedLocaleReads.map(value => `GET /api/i18n/translations/${value}`).sort()
      );
      expect(fixture.resources.map(item => item.path).sort()).toEqual([
        '/js/i18n-client.js', '/plugins/toptier/assets/animations.css', '/plugins/toptier/assets/overlay.css',
        '/plugins/toptier/assets/overlay.js', '/socket.io/socket.io.js'
      ].sort());
      expect(fixture.denied).toEqual([]);
      const pendingTimers = [...fixture.timers.values()];
      expect(pendingTimers.filter(timer => timer.interval).map(timer => timer.delay)).toEqual([8000]);
      expect(pendingTimers.filter(timer => !timer.interval).map(timer => timer.delay)).toEqual([500]);
      const foreignSocket = { connected: true };
      dom.window.socket = foreignSocket;
      dom.window.dispatchEvent(pageLifecycleEvent(dom.window, 'pagehide', false));
      expect(socket.disconnectedByRenderer).toBe(true);
      expect(dom.window.socket).toBe(foreignSocket);
      expect(socket.handlers.size).toBe(0);
      expect(foreignSocket.connected).toBe(true);
      expect(fixture.timers.size).toBe(0);
      staleDelivery();
      expect(dom.window.document.querySelector('.tt-spotlight-score').textContent).toBe(afterRestore);
      expect(errors).toEqual([]);
    } finally { fixture.closeDom(dom); }
    expect(fixture.isClosed()).toBe(true);
  });

  test.each(LOCALES)('%s: localized empty and filled boards survive every locale change in the same session', async initialLocale => {
    const fixture = createToptierTransport({ locale: initialLocale, board: 'both', variant: 'combined' });
    const { dom, loaded, errors } = fixture.createDom();
    try {
      await loaded;
      await waitFor(() => dom.window.i18n?.initialized && dom.window.__fixtureSocket?.emitted.length === 2, 'TopTier combined board did not initialize');
      fixture.flushTimeouts();
      const socket = dom.window.__fixtureSocket;
      const empty = { board: 'likes', entries: [], sessionId: 'same-session' };
      socket.deliver('toptier:update', empty);
      socket.deliver('toptier:update', { ...empty, board: 'gifts' });
      expect(dom.window.document.querySelectorAll('.tt-no-entries')).toHaveLength(2);

      const entries = [{ username: 'stable-viewer', nickname: 'Stable Viewer', profile_picture_url: '', score: 25, rank: 1 }];
      const filled = board => ({ board, entries, sessionId: 'same-session' });
      for (const locale of LOCALES) {
        if (dom.window.i18n.currentLocale !== locale) {
          socket.deliver('locale-changed', { locale });
          await waitFor(() => dom.window.i18n.currentLocale === locale, `TopTier locale did not switch to ${locale}`);
        }
        const catalogue = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../plugins/toptier/locales', `${locale}.json`), 'utf8'));
        const ui = catalogue.plugins.toptier.toptier.ui;
        expect([...dom.window.document.querySelectorAll('.tt-board-title')].map(node => node.textContent)).toEqual([
          `❤️ ${ui.navigation.likes}`, `🎁 ${ui.navigation.gifts}`
        ]);

        socket.deliver('toptier:update', empty);
        socket.deliver('toptier:update', { ...empty, board: 'gifts' });
        expect([...dom.window.document.querySelectorAll('.tt-no-entries')].map(node => node.textContent)).toEqual([ui.messages.no_entries, ui.messages.no_entries]);
        socket.deliver('toptier:update', filled('likes'));
        socket.deliver('toptier:update', filled('gifts'));
        expect([...dom.window.document.querySelectorAll('.tt-name')].map(node => node.textContent)).toEqual(['Stable Viewer', 'Stable Viewer']);
        expect([...dom.window.document.querySelectorAll('.tt-score')].map(node => node.textContent)).toEqual(['25', '25']);
      }

      expect(fixture.denied).toEqual([]);
      expect(errors).toEqual([]);
      dom.window.dispatchEvent(pageLifecycleEvent(dom.window, 'pagehide', false));
      expect(socket.disconnectedByRenderer).toBe(true);
    } finally { fixture.closeDom(dom); }
    expect(fixture.isClosed()).toBe(true);
  });
});

