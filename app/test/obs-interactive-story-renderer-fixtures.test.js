'use strict';

const { createInteractiveStoryTransport } = require('./helpers/obs-interactive-story-jsdom-fixture');
const LOCALES = ['de', 'en', 'es', 'fr'];
async function waitFor(predicate, message) {
  for (let i = 0; i < 300; i += 1) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error(message);
}
describe('source-backed Interactive Story renderer fixture', () => {
  test.each(LOCALES)('%s: synthetic chapter, bounded routes, media disabled and teardown', async locale => {
    const fixture = createInteractiveStoryTransport({ locale }); const { dom, loaded, errors } = fixture.createDom();
    try {
      await loaded;
      await waitFor(() => dom.window.i18n?.initialized && fixture.requests.some(item => item.path === '/api/interactive-story/overlay-positions'), 'Interactive Story renderer did not initialize');
      expect(fixture.requests.map(item => `GET ${item.path}`).sort()).toEqual([
        '/api/i18n/translations/de', ...(locale === 'de' ? [] : [`/api/i18n/translations/${locale}`]),
        '/api/interactive-story/config', '/api/interactive-story/participants', '/api/interactive-story/overlay-positions'
      ].map(path => `GET ${path}`).sort());
      expect(fixture.resources.map(item => item.path).sort()).toEqual([
        '/js/i18n-client.js', '/js/public-overlay-render-mode.js', '/socket.io/socket.io.js'
      ].sort());
      expect(dom.window.document.documentElement.dataset.publicRenderMode).toBeUndefined();
      dom.window.__fixtureSocket.deliver('story:chapter-display', {
        mode: 'immediate', chapter: { title: 'Synthetic chapter', content: 'Synthetic chapter text.' }
      });
      expect(dom.window.document.querySelector('.immediate-title').textContent).toBe('Synthetic chapter');
      expect(dom.window.document.querySelector('.immediate-content').textContent).toBe('Synthetic chapter text.');
      expect(dom.window.socket).toBe(dom.window.__fixtureSocket);
      await waitFor(() => dom.window.__fixtureSocket.handlers.has('locale-changed'), 'i18n did not bind to the Interactive Story socket');
      const voteLabel = dom.window.document.querySelector('.voting-header').textContent;
      const emptyRosterLabel = dom.window.document.querySelector('.participant-roster-empty').textContent;
      const nextLocale = locale === 'fr' ? 'en' : 'fr';
      dom.window.__fixtureSocket.deliver('locale-changed', { locale: nextLocale });
      await waitFor(() => dom.window.i18n?.getLocale?.() === nextLocale, `Interactive Story did not switch to ${nextLocale}`);
      await waitFor(() => dom.window.document.querySelector('.participant-roster-empty')?.textContent !== emptyRosterLabel, 'participant empty label did not follow the locale');
      expect(fixture.requests.some(item => item.path === `/api/i18n/translations/${nextLocale}`)).toBe(true);
      expect(dom.window.document.querySelector('.participant-roster-empty').textContent).toBe(
        nextLocale === 'fr' ? "Aucun joueur n'a encore rejoint." : 'No players have joined yet.'
      );
      expect(dom.window.document.querySelector('.voting-header').textContent).not.toBe(voteLabel);
      expect(dom.window.document.querySelector('.immediate-content').textContent).toBe('Synthetic chapter text.');
      expect(dom.window.document.getElementById('storyImage').hasAttribute('src')).toBe(false);
      expect(dom.window.document.getElementById('imageContainer').classList.contains('visible')).toBe(false);
      expect(dom.window.document.getElementById('generatingVideo').getAttribute('src')).toBeNull();
      expect(dom.window.__fixtureSocket.emitted).toEqual([]);
      expect(fixture.denied).toEqual([]);
      const dynamicImage = await dom.window.fetch('/api/interactive-story/image/unlisted-fixture.svg');
      const external = await dom.window.fetch('https://example.invalid/pixel');
      expect(dynamicImage.status).toBe(404);
      expect(external.status).toBe(404);
      expect(fixture.denied).toEqual([
        { url: 'http://127.0.0.1:3000/api/interactive-story/image/unlisted-fixture.svg', method: 'GET', reason: 'unknown-route' },
        { url: 'https://example.invalid/pixel', method: 'GET', reason: 'origin-or-method' }
      ]);
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
      expect(dom.window.__fixtureSocket.disconnectedByRenderer).toBe(false);
      expect(dom.window.__fixtureSocket.handlers.size).toBeGreaterThan(0);
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(dom.window.__fixtureSocket.disconnectedByRenderer).toBe(true);
      expect(dom.window.__fixtureSocket.handlers.size).toBe(0);
      expect(dom.window.socket).toBeNull();
      expect(errors).toEqual([]);
    } finally { fixture.closeDom(dom); }
    expect(fixture.isClosed()).toBe(true);
  });

  test('final pagehide cancels active story timers and ignores their late work', async () => {
    const fixture = createInteractiveStoryTransport({ locale: 'de' }); const { dom, loaded, errors } = fixture.createDom();
    try {
      await loaded;
      await waitFor(() => dom.window.i18n?.initialized && fixture.requests.some(item => item.path === '/api/interactive-story/overlay-positions'), 'Interactive Story renderer did not initialize');
      dom.window.__fixtureSocket.deliver('story:chapter-display', {
        mode: 'immediate', chapter: { title: 'Timer chapter', content: 'Keep this chapter text.' }
      });
      dom.window.__fixtureSocket.deliver('story:voting-started', { choices: ['First', 'Second'], duration: 30 });
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(fixture.intervals.size).toBe(1);
      dom.window.__fixtureSocket.deliver('story:chapter-tts-start', {});
      const content = dom.window.document.getElementById('chapterContent').textContent;
      const imageClasses = dom.window.document.getElementById('imageContainer').className;
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(fixture.intervals.size).toBe(0);
      expect(dom.window.__fixtureSocket.handlers.size).toBe(0);
      await new Promise(resolve => setTimeout(resolve, 450));
      expect(dom.window.document.getElementById('chapterContent').textContent).toBe(content);
      expect(dom.window.document.getElementById('imageContainer').className).toBe(imageClasses);
      expect(fixture.intervals.size).toBe(0);
      expect(errors).toEqual([]);
    } finally { fixture.closeDom(dom); }
    expect(fixture.isClosed()).toBe(true);
  });

  test('final pagehide prevents a delayed configuration response from mutating or starting follow-up reads', async () => {
    const fixture = createInteractiveStoryTransport({ locale: 'de', deferConfig: true }); const { dom, loaded, errors } = fixture.createDom();
    try {
      await loaded;
      await waitFor(() => fixture.requests.some(item => item.path === '/api/interactive-story/config'), 'configuration request did not start');
      const widthBefore = dom.window.document.documentElement.style.getPropertyValue('--overlay-width');
      const readsBeforeRelease = fixture.requests.map(item => `${item.method} ${item.path}`);
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(dom.window.__fixtureSocket.disconnectedByRenderer).toBe(true);
      expect(dom.window.socket).toBeNull();
      fixture.releaseDeferredConfig();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(dom.window.document.documentElement.style.getPropertyValue('--overlay-width')).toBe(widthBefore);
      expect(fixture.requests.map(item => `${item.method} ${item.path}`)).toEqual(readsBeforeRelease);
      expect(fixture.requests.some(item => item.path === '/api/interactive-story/participants')).toBe(false);
      expect(errors).toEqual([]);
    } finally { fixture.closeDom(dom); }
    expect(fixture.isClosed()).toBe(true);
  });
});
