'use strict';

const path = require('node:path');
const { createSttTickerFixture, LOCALES, HTML_PATH } = require('./helpers/obs-stt-renderer-fixture');

const ROOT = path.resolve(__dirname, '../..');

function fireSocketSyncRetry(fixture) {
  const [id, timeout] = fixture.timers.timeouts.entries().next().value || [];
  expect(timeout).toBeDefined();
  expect(timeout.delay).toBe(100);
  fixture.timers.timeouts.delete(id);
  timeout.callback(...timeout.args);
}

function lifecycleEvent(window, type, persisted) {
  const event = new window.Event(type);
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}

describe('STT Ticker source-backed renderer fixture', () => {
  test('uses the canonical static HTML and shared i18n entry', () => {
    const html = require('node:fs').readFileSync(HTML_PATH, 'utf8');
    expect(html).toContain('<script src="/js/i18n-client.js"></script>');
    expect(html).toContain('<script src="/socket.io/socket.io.js"></script>');
    expect(html).not.toContain('/stt-ticker/capture');
    const routeSource = require('node:fs').readFileSync(path.join(ROOT, 'app/plugins/stt-ticker/main.js'), 'utf8');
    expect(routeSource).toContain("this.api.registerRoute('get', '/overlay/stt-ticker'");
  });

  test('late Socket.IO binds the original renderer socket and final pagehide cleans the binding', async () => {
    const fixture = createSttTickerFixture({ locale: 'de' });
    try {
      await fixture.loaded;
      await fixture.waitForI18n();
      expect(fixture.dom.window.__sttFixtureI18nSawIo).toBe(false);
      expect(typeof fixture.dom.window.io).toBe('function');
      const socket = fixture.dom.window.__sttFixtureSocket;
      expect(fixture.dom.window.socket).toBe(socket);
      expect(fixture.timers.timeouts.size).toBe(1);
      fireSocketSyncRetry(fixture);
      expect(fixture.timers.timeouts.size).toBe(0);
      expect(socket.handlers.get('locale-changed')).toHaveLength(1);
      expect(socket.handlers.get('language-changed')).toHaveLength(1);

      fixture.dom.window.dispatchEvent(lifecycleEvent(fixture.dom.window, 'pagehide', true));
      expect(fixture.dom.window.socket).toBe(socket);
      expect(socket.disconnected).toBe(false);
      socket.deliver('stt-ticker:transcript', { text: 'still live in BFCache' });
      expect(fixture.dom.window.document.getElementById('line-0').textContent).toBe('still live in BFCache');
      fixture.dom.window.dispatchEvent(lifecycleEvent(fixture.dom.window, 'pageshow', true));

      fixture.dom.window.dispatchEvent(lifecycleEvent(fixture.dom.window, 'pagehide', false));
      expect(fixture.dom.window.socket).toBeUndefined();
      expect(socket.disconnected).toBe(true);
      expect([...socket.handlers.values()].flat()).toHaveLength(0);
      expect(fixture.timers.intervals.size).toBe(0);
    } finally {
      fixture.close();
    }
    expect(fixture.timers.timeouts.size).toBe(0);
    expect(fixture.timers.intervals.size).toBe(0);
  });

  test('preserves a preexisting window.socket and only tears down the renderer-owned socket', async () => {
    const handlers = new Map();
    const existingSocket = {
      on(event, handler) { handlers.set(event, handler); return this; },
      off(event, handler) { if (handlers.get(event) === handler) handlers.delete(event); return this; }
    };
    const fixture = createSttTickerFixture({ locale: 'de', existingSocket });
    try {
      await fixture.loaded;
      await fixture.waitForI18n();
      const rendererSocket = fixture.dom.window.__sttFixtureSocket;
      expect(fixture.dom.window.socket).toBe(existingSocket);
      expect(rendererSocket).not.toBe(existingSocket);
      expect(fixture.timers.timeouts.size).toBe(0, 'the already-published app socket requires no late-socket retry');
      expect(handlers.has('locale-changed')).toBe(true);

      fixture.dom.window.dispatchEvent(lifecycleEvent(fixture.dom.window, 'pagehide', false));
      expect(fixture.dom.window.socket).toBe(existingSocket);
      expect(handlers.size).toBe(0);
      expect(rendererSocket.disconnected).toBe(true);
    } finally {
      fixture.close();
    }
  });

  test('final pagehide never deletes a replacement global socket', async () => {
    const fixture = createSttTickerFixture({ locale: 'de' });
    try {
      await fixture.loaded;
      await fixture.waitForI18n();
      const socket = fixture.dom.window.__sttFixtureSocket;
      fireSocketSyncRetry(fixture);
      const replacementSocket = { owner: 'another-app-surface' };
      fixture.dom.window.socket = replacementSocket;

      fixture.dom.window.dispatchEvent(lifecycleEvent(fixture.dom.window, 'pagehide', false));
      expect(fixture.dom.window.socket).toBe(replacementSocket);
      expect(socket.disconnected).toBe(true);
      expect([...socket.handlers.values()].flat()).toHaveLength(0);
    } finally {
      fixture.close();
    }
  });

  test.each(LOCALES)('%s: empty baseline, partial/final transcript, clear, bounded malformed input and cleanup', async locale => {
    const fixture = createSttTickerFixture({ locale });
    try {
      await fixture.loaded;
      await fixture.waitForI18n();
      const { document, __sttFixtureSocket: socket } = fixture.dom.window;
      expect(fixture.dom.window.__sttFixtureI18nSawIo).toBe(false);
      expect(fixture.dom.window.socket).toBe(socket);
      fireSocketSyncRetry(fixture);
      expect(fixture.timers.timeouts.size).toBe(0);
      expect(socket.handlers.get('locale-changed')).toHaveLength(1);
      expect(fixture.timers.intervals.size).toBe(0);
      expect(document.getElementById('line-0').textContent).toBe('');
      expect(document.getElementById('line-1').textContent).toBe('');
      expect(document.getElementById('line-2').textContent).toBe('');
      expect(fixture.resources.map(item => new URL(item.url).pathname)).toEqual([
        '/js/i18n-client.js', '/socket.io/socket.io.js'
      ]);
      expect(fixture.requests.every(item => item.method === 'GET')).toBe(true);
      expect(fixture.requests.map(item => item.path)).toEqual([
        '/api/i18n/translations/de',
        ...(locale === 'de' ? [] : [`/api/i18n/translations/${locale}`])
      ]);
      expect(document.documentElement.lang).toBe(locale);
      expect(fixture.denied).toEqual([]);

      socket.deliver('stt-ticker:interim', { text: 'Grüße – 世界 💬', isFinal: false });
      expect(document.getElementById('line-0').textContent).toBe('Grüße – 世界 💬');
      socket.deliver('stt-ticker:interim', { text: '', isFinal: true });
      socket.deliver('stt-ticker:transcript', {
        text: 'Grüße – 世界 💬',
        segments: [{ id: 1, text: 'Grüße – 世界 💬' }]
      });
      expect(document.getElementById('line-0').textContent).toBe('Grüße – 世界 💬');
      expect(document.documentElement.lang).toBe(locale);

      socket.deliver('stt-ticker:interim', { text: 'partial after final', isFinal: false });
      expect(document.getElementById('line-0').textContent).toBe('partial after final');
      socket.deliver('stt-ticker:interim', { text: '', isFinal: true });
      expect(document.getElementById('line-0').textContent).toBe('Grüße – 世界 💬');
      socket.deliver('stt-ticker:clear');
      expect(document.getElementById('line-0').textContent).toBe('');
      expect(document.getElementById('line-1').textContent).toBe('');
      expect(document.getElementById('line-2').textContent).toBe('');

      socket.deliver('stt-ticker:transcript', null);
      socket.deliver('stt-ticker:transcript', { segments: 'bad-shape' });
      socket.deliver('stt-ticker:transcript', { segments: [{ id: 2, text: { invalid: true } }, { id: 3, text: ['invalid'] }] });
      socket.deliver('stt-ticker:transcript', { multi: { lines: 'bad-shape' }, text: 'fallback must be ignored' });
      socket.deliver('stt-ticker:interim', {});
      for (const text of [{ invalid: true }, ['array'], 42, null]) {
        socket.deliver('stt-ticker:interim', { text });
        socket.deliver('stt-ticker:transcript', { text });
      }
      expect(document.getElementById('line-0').textContent).toBe('');
      expect(fixture.socketEmits).toEqual([]);
      expect(fixture.errors).toEqual([]);

      fixture.dom.window.dispatchEvent(new fixture.dom.window.Event('pagehide'));
      fixture.dom.window.dispatchEvent(new fixture.dom.window.Event('pagehide'));
      const before = [...document.querySelectorAll('.line')].map(line => line.textContent).join('|');
      socket.deliver('stt-ticker:transcript', { text: 'late transcript', segments: [{ id: 2, text: 'late transcript' }] });
      const after = [...document.querySelectorAll('.line')].map(line => line.textContent).join('|');
      socket.deliver('stt-ticker:interim', { text: 'late interim' });
      socket.deliver('stt-ticker:clear');
      document.documentElement.setAttribute('data-theme', 'day');
      const domAfterEvents = [...document.querySelectorAll('.line')].map(line => line.textContent).join('|');
      expect(after).toBe(before);
      expect(domAfterEvents).toBe(before);
      expect([...socket.handlers.values()].flat()).toHaveLength(0);
      expect(socket.disconnected).toBe(true);
      expect(fixture.dom.window.socket).toBeUndefined();
      expect(socket.disconnectCount).toBe(1);
      expect(fixture.observerState.created).toBeGreaterThan(0);
      expect(fixture.observerState.disconnected).toBe(fixture.observerState.created);
      expect([...fixture.timers.timeouts.values()].every(timer => timer.delay === 100)).toBe(true);
      expect(fixture.timers.intervals.size).toBe(0);
      fixture.close();
      expect(fixture.timers.timeouts.size).toBe(0);
      expect(fixture.timers.intervals.size).toBe(0);
    } finally {
      fixture.close();
    }
  });

  test('starts multiple locale changes before i18n.ready and ignores late socket events after pagehide', async () => {
    const fixture = createSttTickerFixture({ locale: 'de', deferTranslations: true });
    try {
      await fixture.loaded;
      const { document, i18n, __sttFixtureSocket: socket } = fixture.dom.window;
      let ready = false;
      const readyPromise = fixture.waitForI18n().then(() => { ready = true; });
      expect(ready).toBe(false);
      expect(fixture.pendingTranslations.map(item => item.locale)).toContain('de');

      const englishChange = i18n.changeLanguage('en');
      const frenchChange = i18n.changeLanguage('fr');
      expect(fixture.requests.map(request => request.path)).toEqual(expect.arrayContaining([
        '/api/i18n/translations/de',
        '/api/i18n/translations/en',
        '/api/i18n/translations/fr'
      ]));

      fixture.dom.window.dispatchEvent(new fixture.dom.window.Event('pagehide'));
      expect(fixture.dom.window.socket).toBeUndefined();
      expect(socket.disconnected).toBe(true);
      const before = [...document.querySelectorAll('.line')].map(line => line.textContent).join('|');
      socket.deliver('stt-ticker:transcript', { text: 'late locale-change transcript' });
      socket.deliver('stt-ticker:interim', { text: 'late locale-change interim' });
      fixture.releaseTranslations();
      await Promise.all([englishChange, frenchChange, readyPromise]);
      await Promise.resolve();

      expect(ready).toBe(true);
      expect([...document.querySelectorAll('.line')].map(line => line.textContent).join('|')).toBe(before);
      expect(fixture.timers.timeouts.size).toBe(0);
      expect(fixture.timers.intervals.size).toBe(0);
    } finally {
      fixture.close();
    }
    expect(fixture.timers.timeouts.size).toBe(0);
    expect(fixture.timers.intervals.size).toBe(0);
  });

  test('unknown routes and unsupported socket events fail closed; renderer has no socket error event contract', async () => {
    const fixture = createSttTickerFixture({ locale: 'en' });
    try {
      await fixture.loaded;
      await fixture.waitForI18n();
      fireSocketSyncRetry(fixture);
      const response = await fixture.dom.window.fetch('/api/stt-ticker/provider/secret');
      const localeDiscovery = await fixture.dom.window.fetch('/api/i18n/locales');
      expect(response.status).toBe(404);
      expect(localeDiscovery.status).toBe(404);
      fixture.dom.window.__sttFixtureSocket.emit('stt-ticker:clear', { unauthorized: true });
      fixture.dom.window.__sttFixtureSocket.deliver('stt-ticker:error', { message: 'synthetic error' });
      expect(fixture.denied).toEqual([
        { method: 'GET', url: 'http://127.0.0.1:3000/api/stt-ticker/provider/secret', reason: 'unknown-route' },
        { method: 'GET', url: 'http://127.0.0.1:3000/api/i18n/locales', reason: 'unknown-route' }
      ]);
      expect(fixture.socketEmits).toEqual([{ event: 'stt-ticker:clear', payload: { unauthorized: true } }]);
      expect(fixture.dom.window.__sttFixtureSocket.handlers.has('stt-ticker:error')).toBe(false);
    } finally {
      fixture.close();
    }
  });

  test('locale translation fetch failure is contained by i18n client and does not contact providers', async () => {
    const fixture = createSttTickerFixture({ locale: 'fr', localeStatus: 'locale' });
    try {
      await fixture.loaded;
      await fixture.waitForI18n();
      fireSocketSyncRetry(fixture);
      expect(fixture.requests.every(item => item.path.startsWith('/api/i18n/translations/'))).toBe(true);
      expect(fixture.requests).toContainEqual({ method: 'GET', path: '/api/i18n/translations/de', search: '' });
      expect(fixture.requests).toContainEqual({ method: 'GET', path: '/api/i18n/translations/fr', search: '' });
      expect(fixture.dom.window.document.documentElement.lang).toBe('de');
      expect(fixture.denied).toEqual([]);
      expect(fixture.resources.every(item => new URL(item.url).origin === 'http://127.0.0.1:3000')).toBe(true);
      expect(fixture.socketEmits).toEqual([]);
      expect(fixture.errors).toEqual(['❌ [i18n] Failed to load translations for fr: Error: Failed to load translations: Service Unavailable']);
    } finally {
      fixture.close();
    }
  });
});
