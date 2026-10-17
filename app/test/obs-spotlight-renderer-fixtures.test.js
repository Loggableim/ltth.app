'use strict';

const { createSpotlightTransport, readChatterHtml } = require('./helpers/obs-spotlight-jsdom-fixture');

const LOCALES = ['de', 'en', 'es', 'fr'];
async function waitFor(predicate, message) {
  for (let i = 0; i < 300; i += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

describe('source-backed Spotlight Chatter renderer fixture', () => {
  test('uses the exact pinned Chatter entry and dependencies', () => {
    const html = readChatterHtml();
    expect(html).toContain('/plugins/spotlight/overlays/single-overlay.js" data-overlay-type="chatter"');
    expect(html).toContain('/plugins/spotlight/lib/template-renderer.js');
  });

  test.each(LOCALES)('%s: synthetic load/update/session reset, fixed routes and cleanup', async locale => {
    const fixture = createSpotlightTransport({ locale });
    const { dom, loaded, errors } = fixture.createDom();
    const socket = () => dom.window.__fixtureSocket;
    try {
      await loaded;
      await waitFor(() => dom.window.__lastEventSingleOverlay?.renderer?.currentUser, 'Spotlight did not render its synthetic chatter user');
      expect(dom.window.socket).toBe(socket());
      expect(dom.window.document.querySelector('.username').textContent).toBe('Synthetic Chatter');
      expect(dom.window.document.querySelectorAll('img')).toHaveLength(0);
      expect(fixture.requests.map(item => item.path)).toEqual([
        '/api/i18n/translations/de',
        ...(locale === 'de' ? [] : [`/api/i18n/translations/${locale}`]),
        '/api/lastevent/settings/chatter', '/api/lastevent/settings/chatter',
        '/api/lastevent/last/chatter', '/api/lastevent/last/chatter'
      ]);
      expect(fixture.resources.map(item => item.path).sort()).toEqual([
        '/fonts/exo-2.css', '/js/i18n-client.js', '/plugins/spotlight/lib/animations.js',
        '/plugins/spotlight/lib/template-renderer.js', '/plugins/spotlight/lib/text-effects.js',
        '/plugins/spotlight/overlays/single-overlay.js', '/socket.io/socket.io.js'
      ].sort());
      socket().deliver('lastevent.update.chatter', { nickname: 'Wrong Session', eventType: 'chat', overlaySessionToken: 'wrong-session' });
      expect(dom.window.document.querySelector('.username').textContent).toBe('Synthetic Chatter');
      socket().deliver('lastevent.update.chatter', { nickname: 'Updated Synthetic Chatter', eventType: 'chat', overlaySessionToken: 'fixture-session' });
      await waitFor(() => dom.window.document.querySelector('.username')?.textContent === 'Updated Synthetic Chatter', 'matching synthetic update was not rendered');
      socket().deliver('lastevent.update.chatter', { nickname: 'Preserved User Content', eventType: 'unknown', overlaySessionToken: 'fixture-session' });
      await waitFor(() => dom.window.document.querySelector('.username')?.textContent === 'Preserved User Content', 'Spotlight did not render locale fixture user');
      const eventLabel = dom.window.document.querySelector('.event-label').textContent.trim();
      await waitFor(() => socket().handlers.has('locale-changed'), 'i18n did not bind to Spotlight socket');
      socket().deliver('locale-changed', { locale: locale === 'fr' ? 'en' : 'fr' });
      await waitFor(() => dom.window.i18n?.getLocale?.() === (locale === 'fr' ? 'en' : 'fr'), 'Spotlight did not switch locale');
      expect(dom.window.document.querySelector('.event-label').textContent.trim()).not.toBe(eventLabel);
      expect(dom.window.document.querySelector('.username').textContent).toBe('Preserved User Content');
      socket().deliver('lastevent.session.reset', { overlaySessionToken: 'fixture-session-next' });
      socket().deliver('lastevent.update.chatter', { nickname: 'Stale After Reset', eventType: 'chat', overlaySessionToken: 'fixture-session' });
      expect(dom.window.document.querySelector('.username')).toBeNull();
      expect(fixture.denied).toEqual([]);
      expect(fixture.intervals.size).toBe(0);
      expect(errors).toEqual([]);
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
      expect(socket().disconnectedByRenderer).toBe(false);
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket().disconnectedByRenderer).toBe(true);
      expect(socket().handlers.size).toBe(0);
    } finally {
      fixture.closeDom(dom);
    }
    expect(fixture.isClosed()).toBe(true);
  });
});

