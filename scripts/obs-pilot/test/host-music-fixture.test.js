'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('../../../app/node_modules/jsdom');
const { io: connect } = require('../../../app/node_modules/socket.io-client');
const { createHostMusicFixture, EVENTS, LOCALES, TRACKS } = require('../host-music-fixture');

const ROOT = path.resolve(__dirname, '../../..');

function request(origin, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${origin}${pathname}`, options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
}

function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, onEvent); reject(new Error(`Timed out waiting for ${name}`)); }, 2000);
    const onEvent = payload => { clearTimeout(timer); resolve(payload); };
    socket.once(name, onEvent);
  });
}

function waitForDOM(window, predicate, description) {
  if (predicate()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const observer = new window.MutationObserver(() => {
      if (!predicate()) return;
      clearTimeout(timeout);
      observer.disconnect();
      resolve();
    });
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for ${description}; current DOM text: ${window.document.body.textContent}`));
    }, 3000);
    observer.observe(window.document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
}

function waitForFixtureEvent(fixture, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      fixture.events.off(name, onEvent);
      reject(new Error(`Timed out waiting for fixture ${name}: ${JSON.stringify(fixture.getStats())}`));
    }, 3000);
    const onEvent = value => { clearTimeout(timer); resolve(value); };
    fixture.events.once(name, onEvent);
  });
}

test('serves exact original Music Bot renderer, Socket.IO client and all four real plugin catalogs', async () => {
  const fixture = await createHostMusicFixture();
  try {
    const page = await request(fixture.origin, '/plugins/music-bot/overlay.html?lang=de&design=card');
    assert.equal(page.status, 200);
    assert.deepEqual(page.bytes, fs.readFileSync(path.join(ROOT, 'app/plugins/music-bot/overlay.html')));
    assert.match(page.headers['content-security-policy'], /img-src 'none'; media-src 'none'/);
    for (const locale of LOCALES) {
      const response = await request(fixture.origin, `/api/i18n/translations/${locale}`);
      assert.equal(response.status, 200);
      const actual = JSON.parse(response.bytes);
      const source = JSON.parse(fs.readFileSync(path.join(ROOT, `app/plugins/music-bot/locales/${locale}.json`)));
      assert.deepEqual(actual.plugins['music-bot'], source.plugins['music-bot']);
      assert.equal(actual.plugins['music-bot'].labels.waiting_for_music, source.plugins['music-bot'].labels.waiting_for_music);
      assert.equal(actual.plugins['music-bot'].music_bot.ui.controls.overlay.requestedBy, source.plugins['music-bot'].music_bot.ui.controls.overlay.requestedBy);
    }
    const client = await request(fixture.origin, '/socket.io/socket.io.js');
    assert.equal(client.status, 200);
    assert.deepEqual(client.bytes, fs.readFileSync(path.join(ROOT, 'app/node_modules/socket.io/client-dist/socket.io.js')));
    for (const denied of [
      '/api/plugins/music-bot/config', '/api/plugins/music-bot/queue', '/api/i18n/translations/it',
      '/api/i18n/locales', '/plugins/music-bot/overlay.html?profile=real',
      '/plugins/music-bot/overlay.html?lang=de&lang=en', '/uploads/private.png'
    ]) assert.equal((await request(fixture.origin, denied)).status, 404);
    assert.equal((await request(fixture.origin, '/plugins/music-bot/overlay.html', { method: 'POST' })).status, 404);
    assert.equal((await request(fixture.origin, '/plugins/music-bot/overlay.html', { headers: { Host: 'foreign.example' } })).status, 404);
    assert.equal((await request(fixture.origin, '/plugins/music-bot/overlay.html', { headers: { Origin: 'https://foreign.example' } })).status, 404);
    assert.equal(fixture.getStats().denied, 10);
  } finally { await fixture.close(); }
  await fixture.close();
  assert.equal(fixture.getStats().closed, true);
});

test('actual Socket.IO status request, track, pause/resume sync, queue and clear are bounded synthetic events', async () => {
  const fixture = await createHostMusicFixture();
  const socket = connect(fixture.origin, { transports: ['websocket'], reconnection: false });
  try {
    await event(socket, 'connect');
    const initialTrack = event(socket, EVENTS.nowPlaying);
    const initialQueue = event(socket, EVENTS.queue);
    socket.emit(EVENTS.request);
    assert.equal(await initialTrack, null);
    assert.deepEqual(await initialQueue, { queue: [], length: 0 });

    const track = event(socket, EVENTS.nowPlaying);
    const queue = event(socket, EVENTS.queue);
    const playing = await fixture.execute({ command: 'play', track: 0 });
    assert.equal((await track).id, TRACKS[0].id);
    assert.deepEqual(await queue, { queue: [TRACKS[1]], length: 1 });
    assert.equal(playing.state, 'playing');

    const paused = event(socket, EVENTS.pause);
    const pauseSync = event(socket, EVENTS.sync);
    assert.equal((await fixture.execute({ command: 'pause' })).state, 'paused');
    assert.deepEqual(await paused, {});
    const pausedPayload = await pauseSync;
    assert.equal(pausedPayload.id, TRACKS[0].id);
    assert.equal(pausedPayload.state, 'paused');
    assert.ok(pausedPayload.position >= 0);

    const resumed = event(socket, EVENTS.resume);
    const resumeSync = event(socket, EVENTS.sync);
    assert.equal((await fixture.execute({ command: 'pause' })).state, 'playing');
    assert.deepEqual(await resumed, {});
    assert.equal((await resumeSync).state, 'playing');

    const switchedTrack = event(socket, EVENTS.nowPlaying);
    const switchedQueue = event(socket, EVENTS.queue);
    assert.equal((await fixture.execute({ command: 'play', track: 1 })).track.id, TRACKS[1].id);
    assert.equal((await switchedTrack).id, TRACKS[1].id);
    assert.deepEqual(await switchedQueue, { queue: [], length: 0 });

    const stopped = event(socket, EVENTS.stop);
    const emptyQueue = event(socket, EVENTS.queue);
    const cleared = await fixture.execute({ command: 'clear' });
    assert.deepEqual(await stopped, {});
    assert.deepEqual(await emptyQueue, { queue: [], length: 0 });
    assert.equal(cleared.track, null);
    assert.equal(cleared.state, 'idle');
    assert.equal(fixture.getStats().denied, 0);
  } finally { socket.disconnect(); await fixture.close(); }
  assert.equal(fixture.getStats().clients, 0);
});

test('unknown client events and unbounded or profile-shaped commands are rejected without external events', async () => {
  const fixture = await createHostMusicFixture();
  const socket = connect(fixture.origin, { transports: ['websocket'], reconnection: false });
  try {
    await event(socket, 'connect');
    socket.emit('musicbot:skip');
    socket.emit('some-arbitrary-event', { profile: 'must not be accepted' });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(fixture.getStats().denied, 2);
    for (const command of [
      { command: 'play', track: 12 }, { command: 'play', track: '1; arbitrary' },
      { command: 'status', profile: 'real' }, { command: 'play', url: 'https://example.invalid/song.mp3' },
      { command: 'execute', event: 'musicbot:paused' }, null
    ]) await assert.rejects(fixture.execute(command), /Unsupported|track must be|JSON command object/);
    assert.equal(fixture.getStats().emitted, 0);
  } finally { socket.disconnect(); await fixture.close(); }
  assert.equal(fixture.getStats().closed, true);
});

test('original card renderer consumes real host socket and uses actual i18n plus cleanup', async () => {
  const fixture = await createHostMusicFixture();
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  let dom;
  try {
    dom = await JSDOM.fromURL(`${fixture.origin}/plugins/music-bot/overlay.html?lang=de&design=card`, {
      resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
      beforeParse(window) {
        window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      }
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('original Music Bot renderer did not finish loading')), 3000);
      const ready = async () => {
        try {
          await dom.window.i18n.ready;
          clearTimeout(timeout);
          resolve();
        } catch (error) { clearTimeout(timeout); reject(error); }
      };
      if (dom.window.document.readyState === 'loading') dom.window.document.addEventListener('DOMContentLoaded', ready, { once: true });
      else ready();
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('original Music Bot status request did not arrive')), 1000);
      const check = () => {
        if (fixture.getStats().clientEvents === 1 && fixture.getStats().emitted >= 2) { clearTimeout(timeout); resolve(); }
        else setTimeout(check, 5);
      };
      check();
    });
    assert.equal(fixture.getStats().clients, 1);

    await fixture.execute({ command: 'play', track: 0 });
    await new Promise(resolve => setTimeout(resolve, 80));
    const { document } = dom.window;
    assert.equal(document.getElementById('card-title').textContent, TRACKS[0].title);
    assert.equal(document.getElementById('card-artist').textContent, TRACKS[0].artist);
    assert.equal(document.getElementById('card-requester').textContent, 'Angefragt von @viewer-one');
    assert.ok(document.getElementById('widget-card').classList.contains('visible'));
    assert.equal(document.querySelectorAll('.up-next-item').length, 1);
    assert.equal(document.querySelector('.up-next-item').textContent, `1. ${TRACKS[1].title} – ${TRACKS[1].artist}`);

    await fixture.execute({ command: 'pause' });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(document.body.classList.contains('overlay-paused'));
    await fixture.execute({ command: 'pause' });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(!document.body.classList.contains('overlay-paused'));

    await fixture.execute({ command: 'clear' });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(!document.getElementById('widget-card').classList.contains('visible'));
    assert.equal(document.getElementById('card-time').textContent, '--:-- / --:--');
    assert.equal(document.querySelectorAll('.up-next-item').length, 0);
    assert.deepEqual(errors, []);
  } finally {
    dom?.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
    dom?.window.close();
    await fixture.close();
  }
  assert.equal(fixture.getStats().clients, 0);
  assert.equal(fixture.getStats().closed, true);
});

for (const design of ['compact', 'fullwidth', 'minimal', 'card']) {
  test(`${design}: delayed i18n and language changes preserve live title; clear restores translated idle text`, async () => {
    const fixture = await createHostMusicFixture();
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => errors.push(error.message));
    const statusRequested = waitForFixtureEvent(fixture, 'status-request');
    let dom;
    let resolveLocale;
    let deferGermanLocale = true;
    let localeRequested;
    const germanRequest = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('German locale request did not start')), 3000);
      localeRequested = () => { clearTimeout(timeout); resolve(); };
    });
    const titleId = { compact: 'compact-title', fullwidth: 'fullwidth-title', minimal: 'minimal-text', card: 'card-title' }[design];
    const trackText = design === 'minimal'
      ? `🎵 ${TRACKS[0].title} – ${TRACKS[0].artist}`
      : TRACKS[0].title;
    const localeText = locale => ({ de: 'Warte auf Musik ...', fr: 'En attente de musique...' })[locale];
    const title = () => dom.window.document.getElementById(titleId).textContent;
    try {
      dom = await JSDOM.fromURL(`${fixture.origin}/plugins/music-bot/overlay.html?lang=de&design=${design}`, {
        resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
        beforeParse(window) {
          window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
          window.fetch = input => {
            const url = new URL(String(input), fixture.origin);
            assert.equal(url.origin, fixture.origin);
            assert.match(url.pathname, /^\/api\/i18n\/translations\/(?:de|en|es|fr)$/);
            const locale = url.pathname.split('/').pop();
            if (locale !== 'de' || !deferGermanLocale) return request(fixture.origin, url.pathname).then(response => ({
              ok: response.status === 200, status: response.status, statusText: 'OK', json: async () => JSON.parse(response.bytes)
            }));
            deferGermanLocale = false;
            localeRequested();
            return new Promise(resolve => { resolveLocale = resolve; });
          };
        }
      });
      await Promise.all([germanRequest, statusRequested]);
      await fixture.execute({ command: 'play', track: 0 });
      await waitForDOM(dom.window, () => title().includes(trackText), `${design} live track title`);
      await waitForDOM(dom.window, () => Boolean(dom.window.document.querySelector('.up-next-item')), `${design} queue rendering`);
      const { document, i18n } = dom.window;
      if (design !== 'minimal') {
        const artistId = `${design}-artist`;
        const requesterId = `${design}-requester`;
        assert.equal(document.getElementById(artistId).textContent, TRACKS[0].artist);
        assert.equal(document.getElementById(requesterId).textContent, 'Angefragt von @viewer-one');
      }
      assert.equal(document.querySelector('.up-next-item').textContent, `1. ${TRACKS[1].title} – ${TRACKS[1].artist}`);

      const germanCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/plugins/music-bot/locales/de.json'), 'utf8'));
      const germanLabel = germanCatalog.plugins['music-bot'].music_bot.ui.controls.overlay.nextSongVoteHeading;
      const releaseGermanLocale = resolveLocale;
      resolveLocale = null;
      releaseGermanLocale({ ok: true, status: 200, statusText: 'OK', json: async () => ({ plugins: { 'music-bot': germanCatalog.plugins['music-bot'] } }) });
      await i18n.ready;
      assert.equal(i18n.getLocale(), 'de');
      assert.equal(document.querySelector('.next-song-vote-head').textContent, germanLabel);
      assert.ok(title().includes(trackText));
      assert.equal(document.querySelector('.up-next-item').textContent, `1. ${TRACKS[1].title} – ${TRACKS[1].artist}`);

      assert.equal(await i18n.changeLanguage('fr'), true);
      const frenchCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/plugins/music-bot/locales/fr.json'), 'utf8'));
      assert.equal(document.querySelector('.next-song-vote-head').textContent, frenchCatalog.plugins['music-bot'].music_bot.ui.controls.overlay.nextSongVoteHeading);
      assert.ok(title().includes(trackText));
      if (design !== 'minimal') {
        const frenchRequestedBy = frenchCatalog.plugins['music-bot'].music_bot.ui.controls.overlay.requestedBy;
        assert.equal(document.getElementById(`${design}-requester`).textContent, `${frenchRequestedBy} @viewer-one`);
      }
      assert.equal(document.querySelector('.up-next-item').textContent, `1. ${TRACKS[1].title} – ${TRACKS[1].artist}`);

      await fixture.execute({ command: 'clear' });
      await waitForDOM(dom.window, () => document.getElementById('idle-message').classList.contains('visible'), `${design} playback-stopped idle state`);
      assert.equal(title(), localeText('fr'));
      assert.equal(await i18n.changeLanguage('de'), true);
      assert.equal(title(), localeText('de'));
      await fixture.execute({ command: 'play', track: 0 });
      await waitForDOM(dom.window, () => title().includes(trackText), `${design} resumed live title`);
      assert.deepEqual(errors, []);
    } finally {
      if (resolveLocale) resolveLocale({ ok: false, status: 503, statusText: 'test cleanup', json: async () => ({}) });
      dom?.window.musicBotOverlay?.hide();
      dom?.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      dom?.window.close();
      await fixture.close();
    }
    assert.equal(fixture.getStats().clients, 0);
  });
}

for (const locale of LOCALES) {
  test(`fullwidth ${locale}: queue count renders and refreshes across locale changes`, async () => {
    const fixture = await createHostMusicFixture();
    let dom;
    try {
      const statusRequested = waitForFixtureEvent(fixture, 'status-request');
      dom = await JSDOM.fromURL(`${fixture.origin}/plugins/music-bot/overlay.html?lang=${locale}&design=fullwidth`, {
        resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(window) {
          window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
          window.fetch = input => {
            const url = new URL(String(input), fixture.origin);
            assert.equal(url.origin, fixture.origin);
            assert.match(url.pathname, /^\/api\/i18n\/translations\/(?:de|en|es|fr)$/);
            return request(fixture.origin, url.pathname).then(response => ({
              ok: response.status === 200,
              status: response.status,
              statusText: 'OK',
              json: async () => JSON.parse(response.bytes)
            }));
          };
        }
      });
      await Promise.all([statusRequested, new Promise((resolve, reject) => {
        const deadline = Date.now() + 3000;
        const poll = () => {
          if (dom.window.i18n?.ready) return dom.window.i18n.ready.then(resolve, reject);
          if (Date.now() >= deadline) return reject(new Error(`${locale} i18n client did not initialize`));
          setTimeout(poll, 5);
        };
        poll();
      })]);
      await fixture.execute({ command: 'play', track: 0 });
      const count = dom.window.document.getElementById('fullwidth-queue-count');
      await waitForDOM(dom.window, () => count.textContent.includes('1'), `${locale} fullwidth queue count`);
      const source = JSON.parse(fs.readFileSync(path.join(ROOT, `app/plugins/music-bot/locales/${locale}.json`), 'utf8'));
      const translatedCount = source.plugins['music-bot'].music_bot.ui.controls.overlay.queueCount.replace('{count}', '1');
      assert.equal(count.textContent, translatedCount);

      const nextLocale = locale === 'fr' ? 'de' : 'fr';
      assert.equal(await dom.window.i18n.changeLanguage(nextLocale), true);
      const nextCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, `app/plugins/music-bot/locales/${nextLocale}.json`), 'utf8'));
      assert.equal(count.textContent, nextCatalog.plugins['music-bot'].music_bot.ui.controls.overlay.queueCount.replace('{count}', '1'));

      await fixture.execute({ command: 'clear' });
      await waitForDOM(dom.window, () => count.textContent === '', `${locale} cleared fullwidth queue count`);
      const renderer = fs.readFileSync(path.join(ROOT, 'app/plugins/music-bot/overlay.html'), 'utf8');
      assert.match(renderer, /\.design-fullwidth\s+\.up-next-widget\s*\{\s*bottom:\s*108px;/);
    } finally {
      dom?.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      dom?.window.close();
      await fixture.close();
    }
    assert.equal(fixture.getStats().clients, 0);
    assert.equal(fixture.getStats().closed, true);
  });
}

test('same-tab locale-changed socket events update labels, keep clear idle and allow a fresh queue track', async () => {
  const fixture = await createHostMusicFixture();
  let dom;
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  try {
    const statusRequested = waitForFixtureEvent(fixture, 'status-request');
    dom = await JSDOM.fromURL(`${fixture.origin}/plugins/music-bot/overlay.html?lang=de&design=fullwidth`, {
      resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
      beforeParse(window) {
        window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
        window.fetch = input => {
          const url = new URL(String(input), fixture.origin);
          assert.equal(url.origin, fixture.origin);
          assert.match(url.pathname, /^\/api\/i18n\/translations\/(?:de|en|es|fr)$/);
          return request(fixture.origin, url.pathname).then(response => ({
            ok: response.status === 200, status: response.status, statusText: 'OK',
            json: async () => JSON.parse(response.bytes)
          }));
        };
      }
    });
    await Promise.all([statusRequested, new Promise((resolve, reject) => {
      const deadline = Date.now() + 3000;
      const poll = () => {
        if (dom.window.i18n?.ready) return dom.window.i18n.ready.then(resolve, reject);
        if (Date.now() >= deadline) return reject(new Error('i18n client did not initialize'));
        setTimeout(poll, 5);
      };
      poll();
    })]);

    const { document } = dom.window;
    const count = document.getElementById('fullwidth-queue-count');
    const idle = document.getElementById('idle-message');
    const widget = document.getElementById('widget-fullwidth');
    const upNext = document.getElementById('up-next-widget');
    const expectedQueueLabel = locale => {
      const source = JSON.parse(fs.readFileSync(path.join(ROOT, `app/plugins/music-bot/locales/${locale}.json`), 'utf8'));
      return source.plugins['music-bot'].music_bot.ui.controls.overlay.queueCount;
    };
    const expectedIdle = locale => {
      const source = JSON.parse(fs.readFileSync(path.join(ROOT, `app/plugins/music-bot/locales/${locale}.json`), 'utf8'));
      return `${source.plugins['music-bot'].music_bot.ui.controls.overlay.waitingForMusic}...`;
    };
    const expectedEmpty = locale => {
      const source = JSON.parse(fs.readFileSync(path.join(ROOT, `app/plugins/music-bot/locales/${locale}.json`), 'utf8'));
      return source.plugins['music-bot'].labels.queue_ist_leer_sr_um_einen_song_zu;
    };

    await fixture.execute({ command: 'play', track: 0 });
    await waitForDOM(dom.window, () => count.textContent === expectedQueueLabel('de').replace('{count}', '1'), 'German count 1');
    assert.ok(dom.window.socket, 'standalone renderer publishes its existing socket');
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(dom.window.socket.listeners('locale-changed').length, 1, 'shared i18n listener binds the existing socket');
    assert.equal(document.getElementById('fullwidth-title').textContent, TRACKS[0].title);

    await fixture.execute({ command: 'locale', locale: 'fr' });
    await waitForDOM(dom.window, () => document.documentElement.lang === 'fr' && count.textContent === expectedQueueLabel('fr').replace('{count}', '1'), 'French socket locale update');
    assert.equal(document.getElementById('fullwidth-title').textContent, TRACKS[0].title);
    assert.ok(document.querySelector('.up-next-widget.visible'));

    await fixture.execute({ command: 'clear' });
    await waitForDOM(dom.window, () => count.textContent === '' && !upNext.classList.contains('visible') && idle.classList.contains('visible'), 'cleared queue 0');
    assert.equal(document.getElementById('fullwidth-title').textContent, expectedIdle('fr'));
    assert.equal(idle.textContent, expectedEmpty('fr'));
    await fixture.execute({ command: 'locale', locale: 'es' });
    await waitForDOM(dom.window, () => document.documentElement.lang === 'es'
      && document.getElementById('fullwidth-title').textContent === expectedIdle('es')
      && idle.textContent === expectedEmpty('es'), 'Spanish socket locale while idle');
    assert.equal(count.textContent, '');
    assert.ok(!widget.classList.contains('visible'));
    assert.ok(!upNext.classList.contains('visible'));
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.ok(!widget.classList.contains('visible'), 'locale refresh must not reanimate the cleared renderer');

    await fixture.execute({ command: 'play', track: 0 });
    await waitForDOM(dom.window, () => count.textContent === expectedQueueLabel('es').replace('{count}', '1') && widget.classList.contains('visible'), 'fresh track after clear');
    assert.equal(document.getElementById('fullwidth-title').textContent, TRACKS[0].title);
    await fixture.execute({ command: 'locale', locale: 'en' });
    await waitForDOM(dom.window, () => document.documentElement.lang === 'en' && count.textContent === expectedQueueLabel('en').replace('{count}', '1'), 'English socket locale update');
    assert.equal(document.getElementById('fullwidth-title').textContent, TRACKS[0].title);
    assert.deepEqual(fixture.getStats().localeChanges, ['fr', 'es', 'en']);
    assert.deepEqual(errors, []);
  } finally {
    if (dom) {
      const pageHide = new dom.window.PageTransitionEvent('pagehide');
      Object.defineProperty(pageHide, 'persisted', { value: false });
      dom.window.dispatchEvent(pageHide);
    }
    if (dom) assert.equal(dom.window.socket, undefined, 'pagehide clears only the renderer-owned socket reference');
    dom?.window.close();
    await fixture.close();
  }
  assert.equal(fixture.getStats().clients, 0);
  assert.equal(fixture.getStats().closed, true);
});

test('Music Bot preserves an existing app-owned window.socket and does not clear it on pagehide', async () => {
  const fixture = await createHostMusicFixture();
  let dom;
  const existingSocket = { on() {}, off() {} };
  try {
    dom = await JSDOM.fromURL(`${fixture.origin}/plugins/music-bot/overlay.html?lang=de&design=fullwidth`, {
      resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(window) {
        window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
        window.socket = existingSocket;
        window.fetch = input => {
          const url = new URL(String(input), fixture.origin);
          assert.equal(url.origin, fixture.origin);
          assert.match(url.pathname, /^\/api\/i18n\/translations\/(?:de|en|es|fr)$/);
          return request(fixture.origin, url.pathname).then(response => ({
            ok: response.status === 200, status: response.status, statusText: 'OK',
            json: async () => JSON.parse(response.bytes)
          }));
        };
      }
    });
    await waitForFixtureEvent(fixture, 'status-request');
    assert.equal(dom.window.socket, existingSocket);
    assert.equal(fixture.getStats().connections, 1, 'only the renderer’s existing socket connection is created');
    const bfcachePageHide = new dom.window.PageTransitionEvent('pagehide');
    Object.defineProperty(bfcachePageHide, 'persisted', { value: true });
    dom.window.dispatchEvent(bfcachePageHide);
    assert.equal(dom.window.socket, existingSocket);
    const finalPageHide = new dom.window.PageTransitionEvent('pagehide');
    Object.defineProperty(finalPageHide, 'persisted', { value: false });
    dom.window.dispatchEvent(finalPageHide);
    assert.equal(dom.window.socket, existingSocket);
  } finally {
    dom?.window.close();
    await fixture.close();
  }
  assert.equal(fixture.getStats().clients, 0);
  assert.equal(fixture.getStats().closed, true);
});

for (const locale of LOCALES) {
  test(`${locale}: actual Music Bot translation namespace initializes in the original renderer`, async () => {
    const fixture = await createHostMusicFixture();
    let dom;
    try {
      dom = await JSDOM.fromURL(`${fixture.origin}/plugins/music-bot/overlay.html?lang=${locale}&design=minimal`, {
        resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(window) { window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} }); }
      });
      dom.window.fetch = async input => {
        const url = new URL(String(input), fixture.origin);
        assert.equal(url.origin, fixture.origin);
        assert.match(url.pathname, /^\/api\/i18n\/translations\/(?:de|en|es|fr)$/);
        const response = await request(fixture.origin, url.pathname);
        return { ok: response.status === 200, status: response.status, statusText: 'OK', json: async () => JSON.parse(response.bytes) };
      };
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Music Bot ${locale} i18n did not initialize`)), 2500);
        const check = () => {
          const client = dom.window?.i18n;
          if (client?.initialized && client.getLocale() === locale && dom.window.document.documentElement.lang === locale) {
            clearTimeout(timeout); resolve();
          } else setTimeout(check, 5);
        };
        check();
      });
      assert.equal(dom.window.document.documentElement.lang, locale);
      const key = 'plugins.music-bot.music_bot.ui.controls.overlay.requestedBy';
      assert.notEqual(dom.window.i18n.t(key), key);
    } finally {
      dom?.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      dom?.window.close();
      await fixture.close();
    }
    assert.equal(fixture.getStats().clients, 0);
  });
}

test('owned host fixture closes once, rejects commands after close and frees its loopback port', async () => {
  const fixture = await createHostMusicFixture();
  const url = new URL(fixture.origin);
  const address = await new Promise((resolve, reject) => {
    const socket = require('node:net').connect(Number(url.port), '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', reject);
  });
  assert.equal(address, true);
  assert.equal((await request(fixture.origin, '/plugins/music-bot/overlay.html?lang=fr&design=card')).status, 200);
  assert.equal((await fixture.execute({ command: 'status' })).state, 'idle');
  assert.equal((await fixture.execute({ command: 'close' })).closed, true);
  assert.equal(fixture.getStats().closed, true);
  await assert.rejects(fixture.execute({ command: 'play', track: 0 }), /Host is closed/);
  await assert.rejects(request(fixture.origin, '/plugins/music-bot/overlay.html?lang=de'));
});
