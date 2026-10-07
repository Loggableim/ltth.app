'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ViewerXPPlugin = require('../viewer-xp-impl');
const { isHttpAllowed, isIncomingSocketEventAllowed, isOutgoingSocketEventAllowed } = require('../../../../../modules/public-overlay-registry');

const ROOT = path.resolve(__dirname, '../../../../../..');
const OVERLAY_DIR = path.join(__dirname, '../overlays');
const CLIENT_I18N = path.join(ROOT, 'app/public/js/i18n-client.js');
const VIEWER_I18N = path.join(__dirname, '../viewer-xp-i18n.js');
const LOCALES = ['de', 'en', 'es', 'fr'];

function loadLocale(locale) {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, `app/plugins/milestone-leaderboard/locales/${locale}.json`), 'utf8'));
  return catalog.plugins['milestone-leaderboard'];
}

async function createRenderer(page, locale = 'de', query = '', { realI18n = false, existingWindowSocket = null } = {}) {
  const source = fs.readFileSync(path.join(OVERLAY_DIR, `${page}.html`), 'utf8');
  const virtualConsole = new VirtualConsole();
  const consoleErrors = [];
  virtualConsole.on('jsdomError', error => consoleErrors.push(error.message));
  const dom = new JSDOM(source, {
    url: `http://fixture.local/overlay/viewer-xp/${page}${query}${query ? '&' : '?'}lang=${locale}`,
    runScripts: 'outside-only',
    virtualConsole
  });
  const { window } = dom;
  const socketListeners = new Map();
  const socketEmits = [];
  let disconnects = 0;
  const socket = {
    on(event, listener) { socketListeners.set(event, listener); return this; },
    off(event, listener) {
      if (socketListeners.get(event) === listener) socketListeners.delete(event);
      return this;
    },
    serverEmit(event, payload) { socketListeners.get(event)?.(payload); },
    emit(event, payload) { socketEmits.push([event, payload]); return this; },
    disconnect() { disconnects += 1; }
  };
  const localeRequests = [];
  if (realI18n) {
    if (existingWindowSocket) window.socket = existingWindowSocket;
    window.fetch = async input => {
      const match = String(input).match(/\/api\/i18n\/translations\/(de|en|es|fr)$/);
      if (!match) throw new Error(`Offline Viewer-XP fixture denied i18n request: ${input}`);
      localeRequests.push(match[1]);
      return {
        ok: true,
        json: async () => ({ plugins: { 'milestone-leaderboard': loadLocale(match[1]) } })
      };
    };
    window.eval(fs.readFileSync(CLIENT_I18N, 'utf8'));
    let initializationTimer;
    try {
      await Promise.race([
        window.i18n.ready,
        new Promise((_, reject) => { initializationTimer = setTimeout(() => reject(new Error('Shared i18n client did not initialize')), 1500); })
      ]);
    } finally {
      clearTimeout(initializationTimer);
    }
    if (window.i18n.getLocale() !== locale) throw new Error(`i18n selected ${window.i18n.getLocale()} instead of ${locale}`);
  } else {
    window.i18n = {
      t(key, params = {}) {
        const value = key.split('.').reduce((current, part) => current?.[part], {
          plugins: { 'milestone-leaderboard': loadLocale(locale) }
        });
        if (typeof value !== 'string') return key;
        return value.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(params, name) ? params[name] : match);
      },
      getLocale: () => locale
    };
  }
  window.io = jest.fn(() => socket);
  window.eval(fs.readFileSync(VIEWER_I18N, 'utf8'));
  const inline = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
  if (!inline) throw new Error(`Missing inline renderer in ${page}.html`);
  window.eval(inline);
  return {
    dom,
    window,
    socket,
    socketListeners,
    socketEmits,
    localeRequests,
    consoleErrors,
    get disconnects() { return disconnects; },
    close() { window.close(); }
  };
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 1500;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test('active Level-up reward labels follow actual shared locale events without restarting animation', async () => {
  const fixture = await createRenderer('level-up', 'de', '?sound=false&duration=60000', { realI18n: true });
  const timeoutSpy = jest.spyOn(fixture.window, 'setTimeout');
  try {
    await waitFor(() => fixture.socketListeners.has('locale-changed'), 'Shared locale listener did not bind');
    fixture.socket.serverEmit('viewer-xp:public-level-up', {
      username: 'Synthetic viewer', oldLevel: 1, newLevel: 2,
      rewards: { title: 'User chosen title', name_color: '#123456', announcement_message: 'User chosen message' }
    });
    const container = fixture.window.document.getElementById('levelUpContainer');
    const rewardTitle = fixture.window.document.querySelector('.reward-title');
    const colorBadge = fixture.window.document.querySelector('[data-viewer-xp-label="new_color"]');
    expect(timeoutSpy.mock.calls.filter(([, delay]) => delay === 60000)).toHaveLength(1);
    const particles = [...fixture.window.document.querySelectorAll('.particle, .confetti')];
    for (const locale of ['fr', 'en', 'es', 'de']) {
      fixture.socket.serverEmit('locale-changed', { locale });
      await waitFor(() => fixture.window.i18n.getLocale() === locale, `Locale did not reach ${locale}`);
      const runtime = loadLocale(locale).viewer_xp.runtime;
      expect(rewardTitle.textContent).toBe(runtime.rewards);
      expect(colorBadge.textContent).toBe(runtime.new_color);
      expect(fixture.window.document.querySelector('.reward-title')).toBe(rewardTitle);
      expect(container.classList.contains('show')).toBe(true);
      expect(timeoutSpy.mock.calls.filter(([, delay]) => delay === 60000)).toHaveLength(1);
      expect([...fixture.window.document.querySelectorAll('.particle, .confetti')]).toEqual(particles);
      expect(fixture.window.document.getElementById('username').textContent).toBe('Synthetic viewer');
      expect(fixture.window.document.getElementById('oldLevel').textContent).toBe('1');
      expect(fixture.window.document.getElementById('newLevel').textContent).toBe('2');
      expect(fixture.window.document.getElementById('rewards').textContent).toContain('User chosen title');
      expect(fixture.window.document.getElementById('rewards').textContent).toContain('User chosen message');
    }
    fixture.window.dispatchEvent(new fixture.window.PageTransitionEvent('pagehide', { persisted: false }));
    expect(container.classList.contains('show')).toBe(false);
    expect(fixture.consoleErrors).toEqual([]);
  } finally { timeoutSpy.mockRestore(); fixture.close(); }
});

function publicPluginDouble() {
  const connectionHandlers = [];
  const plugin = Object.create(ViewerXPPlugin.prototype);
  plugin.api = {
    getSocketIO: () => ({ on: (event, handler) => {
      if (event === 'connection') connectionHandlers.push(handler);
    } }),
    registerSocket: jest.fn(),
    log: jest.fn()
  };
  plugin.db = {
    getViewerProfile: username => ({
      username, name_color: '#1267ab', title: 'Fixture title', level: 7,
      xp_progress: 11, xp_for_next_level: 40, xp_progress_percent: 27.5,
      profilePictureUrl: 'http://fixture.local/fake-profile.png',
      user_id: 'private-fixture-id', coin_balance: 123456, apiKey: 'private-fixture-setting'
    }),
    getTopViewers: () => [{
      username: 'Fixture Viewer', name_color: '#1267ab', title: 'Fixture title',
      level: 7, total_xp_earned: 321, coin_balance: 123456,
      user_id: 'private-fixture-id', apiKey: 'private-fixture-setting'
    }]
  };
  plugin.registerWebSocketHandlers();
  const listeners = new Map();
  const emitted = [];
  const socket = {
    on: (event, handler) => listeners.set(event, handler),
    emit: (event, payload) => emitted.push([event, payload])
  };
  connectionHandlers[0](socket);
  return { listeners, emitted };
}

describe('Viewer-XP public overlay in-process renderer fixtures', () => {
  test('canonical GET, public socket registry, and actual public handlers agree on the minimal display contract', () => {
    for (const route of ['/overlay/viewer-xp/xp-bar', '/overlay/viewer-xp/leaderboard', '/overlay/viewer-xp/level-up']) {
      expect(isHttpAllowed({ method: 'GET', pathname: route })).toBe(true);
      expect(isHttpAllowed({ method: 'HEAD', pathname: route })).toBe(true);
      expect(isHttpAllowed({ method: 'POST', pathname: route })).toBe(false);
    }
    expect(isHttpAllowed({ method: 'GET', pathname: '/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html' })).toBe(true);
    expect(isHttpAllowed({ method: 'GET', pathname: '/plugins/viewer-leaderboard/viewer-xp-i18n.js' })).toBe(true);
    for (const locale of LOCALES) expect(isHttpAllowed({ method: 'GET', pathname: `/plugins/viewer-leaderboard/locales/${locale}.json` })).toBe(true);
    expect(isIncomingSocketEventAllowed('viewer-xp:public-profile:request')).toBe(true);
    expect(isIncomingSocketEventAllowed('viewer-xp:public-leaderboard:request')).toBe(true);
    for (const event of ['viewer-xp:public-profile', 'viewer-xp:public-leaderboard', 'viewer-xp:public-update', 'viewer-xp:public-level-up']) {
      expect(isOutgoingSocketEventAllowed(event)).toBe(true);
    }

    const { listeners, emitted } = publicPluginDouble();
    listeners.get('viewer-xp:public-profile:request')('Fixture Viewer');
    listeners.get('viewer-xp:public-leaderboard:request')({ limit: 10, days: null });
    expect(emitted).toEqual([
      ['viewer-xp:public-profile', {
        username: 'Fixture Viewer', name_color: '#1267ab', title: 'Fixture title', level: 7,
        xp_progress: 11, xp_for_next_level: 40, xp_progress_percent: 27.5, profilePictureUrl: null
      }],
      ['viewer-xp:public-leaderboard', [{
        username: 'Fixture Viewer', name_color: '#1267ab', title: 'Fixture title', level: 7, xp: 321, rank: 1
      }]]
    ]);
    expect(JSON.stringify(emitted)).not.toMatch(/private-fixture-id|private-fixture-setting|coin_balance|apiKey/);
  });

  test('actual public XP producer emits only the approved display projection', () => {
    const emitted = [];
    const plugin = Object.create(ViewerXPPlugin.prototype);
    plugin.api = { getSocketIO: () => ({
      emit: (event, payload) => emitted.push([event, payload]),
      to: () => ({ emit: () => {} })
    }), log: jest.fn() };
    plugin.db = {
      getViewerProfile: () => ({ username: 'Fixture Viewer', name_color: '#1267ab', title: 'Fixture title',
        level: 7, xp_progress: 11, xp_for_next_level: 40, xp_progress_percent: 27.5,
        profilePictureUrl: 'https://fixture.local/fake-profile.png', user_id: 'private-fixture-id',
        coin_balance: 123456, apiKey: 'private-fixture-setting' }),
      getCoinBalance: () => ({ coins: 123456, total_coins_earned: 999999 })
    };
    plugin.emitThrottledLeaderboardUpdate = jest.fn();
    plugin.emitIFTTTEvent = jest.fn();
    plugin.emitXPUpdate('Fixture Viewer', 12, 'fixture-only', { userId: 'private-fixture-id', apiKey: 'private-fixture-setting' });
    const publicUpdate = emitted.find(([event]) => event === 'viewer-xp:public-update');
    expect(publicUpdate).toEqual(['viewer-xp:public-update', {
      username: 'Fixture Viewer', amount: 12,
      profile: { username: 'Fixture Viewer', name_color: '#1267ab', title: 'Fixture title', level: 7,
        xp_progress: 11, xp_for_next_level: 40, xp_progress_percent: 27.5, profilePictureUrl: null }
    }]);
    expect(JSON.stringify(publicUpdate)).not.toMatch(/private-fixture-id|private-fixture-setting|coin_balance|apiKey/);
  });

  test('actual XP bar handles empty to synthetic profile/update/level transitions without private DOM fields', async () => {
    const fixture = await createRenderer('xp-bar', 'de', '?username=fixture-viewer');
    try {
      expect(fixture.socketEmits[0]).toEqual(['viewer-xp:public-profile:request', 'fixture-viewer']);
      expect(fixture.window.document.querySelector('#xpContainer').classList.contains('visible')).toBe(false);
      fixture.socketListeners.get('viewer-xp:public-profile')({
        username: 'Fixture Viewer', name_color: '#1267ab', title: 'Fixture title', level: 7,
        xp_progress: 11, xp_for_next_level: 40, xp_progress_percent: 27.5, profilePictureUrl: null
      });
      expect(fixture.window.document.querySelector('#username').textContent).toBe('Fixture Viewer');
      expect(fixture.window.document.querySelector('#title').textContent).toBe('Fixture title');
      expect(fixture.window.document.querySelector('#levelBadge').textContent).toBe('Stufe 7');
      expect(fixture.window.document.querySelector('#xpText').textContent.trim()).toBe('11 / 40 XP');
      expect(fixture.window.document.querySelector('#xpBar').style.width).toBe('27.5%');
      fixture.socketListeners.get('viewer-xp:public-update')({
        username: 'Fixture Viewer', amount: 4,
        profile: { username: 'Fixture Viewer', name_color: '#1267ab', title: 'Fixture title', level: 7,
          xp_progress: 15, xp_for_next_level: 40, xp_progress_percent: 37.5, profilePictureUrl: null }
      });
      expect(fixture.window.document.querySelector('#xpText').textContent.trim()).toBe('15 / 40 XP');
      expect(fixture.window.document.querySelector('.xp-gain').textContent).toBe('+4 XP erhalten');
      fixture.socketListeners.get('viewer-xp:public-level-up')({ username: 'Fixture Viewer', oldLevel: 7, newLevel: 8 });
      expect(fixture.socketEmits.at(-1)).toEqual(['viewer-xp:public-profile:request', 'Fixture Viewer']);
      expect(fixture.window.document.querySelector('.level-up-animation').textContent).toBe('🎉 Stufe 8! 🎉');
      expect(fixture.window.document.body.textContent).not.toMatch(/private-fixture-id|private-fixture-setting|coin_balance|apiKey/);
      expect(fixture.consoleErrors).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  test('actual leaderboard recovers from empty/malformed response and renders hostile public text as text', async () => {
    const fixture = await createRenderer('leaderboard', 'en');
    try {
      const list = fixture.window.document.querySelector('#leaderboardList');
      expect(fixture.socketEmits[0]).toEqual(['viewer-xp:public-leaderboard:request', { limit: 10, days: null }]);
      fixture.socketListeners.get('viewer-xp:public-leaderboard')([]);
      expect(list.querySelector('.no-data').textContent).toBe('No viewers yet');
      fixture.socketListeners.get('viewer-xp:public-leaderboard')([{
        username: 'Fixture <img id="injected-name" src=x onerror="window.__fixtureExecuted=true">',
        name_color: 'red; background:url(javascript:1)',
        title: '<b id="injected-title">Fixture title</b>', xp: 321, level: 7, rank: 1,
        user_id: 'private-fixture-id', coin_balance: 123456, settings: { apiKey: 'private-fixture-setting' }
      }]);
      expect(list.querySelector('#injected-name')).toBeNull();
      expect(list.querySelector('#injected-title')).toBeNull();
      expect(list.querySelector('.viewer-name').textContent.trim()).toBe('Fixture <img id="injected-name" src=x onerror="window.__fixtureExecuted=true">');
      expect(list.querySelector('.viewer-title').textContent).toBe('<b id="injected-title">Fixture title</b>');
      expect(list.querySelector('.viewer-name').style.color).toBe('rgb(255, 255, 255)');
      expect(list.textContent).toContain('Level 7');
      expect(list.textContent).toContain('321 XP');
      expect(list.textContent).not.toMatch(/private-fixture-id|private-fixture-setting|123456|apiKey/);
      fixture.socketListeners.get('viewer-xp:public-leaderboard')({ malformed: true });
      expect(list.querySelector('.no-data')).not.toBeNull();
      expect(list.querySelector('.leaderboard-item')).toBeNull();
      fixture.socketListeners.get('viewer-xp:public-leaderboard')([{
        username: 'Recovered Viewer', name_color: '#2468ac', title: 'Recovered', xp: 42, level: 3, rank: 1
      }]);
      expect(list.querySelector('.viewer-name').textContent.trim()).toBe('Recovered Viewer');
      expect(fixture.socketEmits.filter(([event]) => event === 'viewer-xp:public-leaderboard:request')).toHaveLength(1);
      expect(fixture.consoleErrors).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  test('actual level-up renderer displays synthetic presentation fields and keeps rewards as text', async () => {
    const fixture = await createRenderer('level-up', 'fr', '?sound=false');
    try {
      expect(fixture.window.document.querySelector('#levelUpContainer').classList.contains('show')).toBe(false);
      fixture.socketListeners.get('viewer-xp:public-level-up')({
        username: 'Fixture Viewer', oldLevel: 7, newLevel: 8,
        rewards: { title: '<img id="reward-injected"> Fixture title', name_color: '#2468ac',
          announcement_message: 'Bienvenue {username} — fixture' }
      });
      expect(fixture.window.document.querySelector('#username').textContent).toBe('Fixture Viewer');
      expect(fixture.window.document.querySelector('#oldLevel').textContent).toBe('7');
      expect(fixture.window.document.querySelector('#newLevel').textContent).toBe('8');
      expect(fixture.window.document.querySelector('#reward-injected')).toBeNull();
      expect(fixture.window.document.querySelector('.reward-badge').textContent).toBe('✨ <img id="reward-injected"> Fixture title');
      expect(fixture.window.document.querySelector('#levelUpContainer').classList.contains('show')).toBe(true);
      expect(fixture.window.document.body.textContent).not.toMatch(/private-fixture-id|private-fixture-setting|coin_balance|apiKey/);
      expect(fixture.consoleErrors).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  test.each(LOCALES)('actual XP renderer translates the displayed level label for %s', async locale => {
    const fixture = await createRenderer('xp-bar', locale);
    try {
      fixture.socketListeners.get('viewer-xp:public-profile')({ username: 'Locale Fixture', level: 7 });
      const expected = { de: 'Stufe 7', en: 'Level 7', es: 'Nivel 7', fr: 'Niveau 7' }[locale];
      expect(fixture.window.document.querySelector('#levelBadge').textContent).toBe(expected);
      expect(fixture.consoleErrors).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  test.each(['xp-bar', 'leaderboard', 'level-up'])('%s follows server-origin locale-changed while preserving display data and socket ownership', async page => {
    const fixture = await createRenderer(page, 'de', '?sound=false&refresh=60000', { realI18n: true });
    try {
      expect(fixture.window.socket).toBe(fixture.socket);
      expect(fixture.window.io).toHaveBeenCalledTimes(1);
      await waitFor(() => fixture.socketListeners.has('locale-changed'), `${page} i18n did not bind to its published socket`);
      fixture.window.dispatchEvent(new fixture.window.PageTransitionEvent('pagehide', { persisted: true }));
      expect(fixture.disconnects).toBe(0);

      if (page === 'xp-bar') {
        fixture.socket.serverEmit('viewer-xp:public-profile', {
          username: 'Fixture Viewer', level: 7, xp_progress: 11, xp_for_next_level: 40, xp_progress_percent: 27.5
        });
        expect(fixture.window.document.querySelector('#xpContainer').classList.contains('visible')).toBe(true);
        expect(fixture.window.document.querySelector('#levelBadge').textContent).toBe('Stufe 7');
        fixture.socket.serverEmit('locale-changed', { locale: 'fr' });
        await waitFor(() => fixture.window.i18n.getLocale() === 'fr'
          && fixture.window.document.querySelector('#levelBadge').textContent === 'Niveau 7', 'XP bar did not translate after locale-changed');
        expect(fixture.window.document.querySelector('#username').textContent).toBe('Fixture Viewer');
        expect(fixture.window.document.querySelector('#xpText').textContent.trim()).toBe('11 / 40 XP');
        expect(fixture.window.document.querySelector('#xpBar').style.width).toBe('27.5%');
      } else if (page === 'leaderboard') {
        fixture.socket.serverEmit('viewer-xp:public-leaderboard', [{
          username: 'Fixture Viewer', name_color: '#2468ac', title: 'Fixture title', level: 7, xp: 321, rank: 1
        }]);
        expect(fixture.window.document.querySelector('.leaderboard-item')).not.toBeNull();
        expect(fixture.window.document.querySelector('.level-badge').textContent).toBe('Stufe 7');
        fixture.socket.serverEmit('locale-changed', { locale: 'fr' });
        await waitFor(() => fixture.window.i18n.getLocale() === 'fr'
          && fixture.window.document.querySelector('.level-badge').textContent === 'Niveau 7', 'Leaderboard did not translate after locale-changed');
        expect(fixture.window.document.querySelector('h1').textContent).toContain('Meilleurs téléspectateurs');
        expect(fixture.window.document.querySelector('.viewer-name').textContent.trim()).toBe('Fixture Viewer');
        expect(fixture.window.document.querySelector('.xp-amount').textContent).toBe('321 XP');
      } else {
        fixture.socket.serverEmit('viewer-xp:public-level-up', { username: 'Fixture Viewer', oldLevel: 7, newLevel: 8 });
        const title = fixture.window.document.querySelector('.level-up-title');
        expect(fixture.window.document.querySelector('#levelUpContainer').classList.contains('show')).toBe(true);
        expect(title.textContent).toBe('Level aufsteigen!');
        expect(fixture.window.document.querySelector('#oldLevel').textContent).toBe('7');
        expect(fixture.window.document.querySelector('#newLevel').textContent).toBe('8');
        fixture.socket.serverEmit('locale-changed', { locale: 'fr' });
        await waitFor(() => fixture.window.i18n.getLocale() === 'fr' && title.textContent.includes('NIVEAU SUPÉRIEUR'), 'Level-up title did not translate after locale-changed');
        expect(fixture.window.document.querySelector('#username').textContent).toBe('Fixture Viewer');
        expect(fixture.window.document.querySelector('#oldLevel').textContent).toBe('7');
        expect(fixture.window.document.querySelector('#newLevel').textContent).toBe('8');
      }

      fixture.window.dispatchEvent(new fixture.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(fixture.disconnects).toBe(1);
      expect(fixture.window.socket).toBeUndefined();
      expect(fixture.socketListeners.has('locale-changed')).toBe(false);
      expect(fixture.consoleErrors).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  test.each(['xp-bar', 'leaderboard', 'level-up'])('%s preserves and does not clean up a foreign window.socket', async page => {
    const listeners = new Map();
    const foreignSocket = {
      on(event, listener) { listeners.set(event, listener); return this; },
      off(event, listener) { if (listeners.get(event) === listener) listeners.delete(event); return this; },
      serverEmit(event, payload) { listeners.get(event)?.(payload); }
    };
    const fixture = await createRenderer(page, 'de', '?sound=false&refresh=60000', {
      realI18n: true,
      existingWindowSocket: foreignSocket
    });
    try {
      expect(fixture.window.socket).toBe(foreignSocket);
      expect(fixture.window.io).toHaveBeenCalledTimes(1);
      foreignSocket.serverEmit('locale-changed', { locale: 'fr' });
      await waitFor(() => fixture.window.i18n.getLocale() === 'fr', `${page} i18n did not receive the existing socket event`);
      fixture.window.dispatchEvent(new fixture.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(fixture.disconnects).toBe(1);
      expect(fixture.window.socket).toBe(foreignSocket);
      expect(listeners.has('locale-changed')).toBe(false);
      expect(fixture.consoleErrors).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  test.each(['xp-bar', 'leaderboard', 'level-up'])('%s disconnects and ignores late socket payloads after pagehide', async page => {
    const fixture = await createRenderer(page, 'en', '?sound=false&refresh=60000');
    try {
      if (page === 'xp-bar') {
        fixture.socketListeners.get('viewer-xp:public-profile')({ username: 'Before hide', level: 2 });
        fixture.window.dispatchEvent(new fixture.window.Event('pagehide'));
        expect(fixture.disconnects).toBe(1);
        fixture.socketListeners.get('viewer-xp:public-update')({ username: 'After hide', amount: 50,
          profile: { username: 'After hide', level: 9, xp_progress_percent: 99 } });
        fixture.socketListeners.get('viewer-xp:public-profile')({ username: 'After hide', level: 9 });
        expect(fixture.window.document.querySelector('#username').textContent).toBe('Before hide');
        expect(fixture.window.document.querySelector('#xpContainer').classList.contains('visible')).toBe(false);
        expect(fixture.window.document.querySelector('.xp-gain')).toBeNull();
      } else if (page === 'leaderboard') {
        fixture.socketListeners.get('viewer-xp:public-leaderboard')([{ username: 'Before hide', level: 2, xp: 10 }]);
        fixture.window.dispatchEvent(new fixture.window.Event('pagehide'));
        expect(fixture.disconnects).toBe(1);
        const emitCount = fixture.socketEmits.length;
        fixture.socketListeners.get('viewer-xp:public-leaderboard')([{ username: 'After hide', level: 9, xp: 999 }]);
        fixture.socketListeners.get('viewer-xp:public-update')();
        fixture.socketListeners.get('viewer-xp:public-level-up')();
        expect(fixture.window.document.querySelector('.viewer-name').textContent.trim()).toBe('Before hide');
        expect(fixture.socketEmits).toHaveLength(emitCount);
      } else {
        fixture.socketListeners.get('viewer-xp:public-level-up')({ username: 'Before hide', oldLevel: 2, newLevel: 3 });
        fixture.window.dispatchEvent(new fixture.window.Event('pagehide'));
        expect(fixture.disconnects).toBe(1);
        fixture.socketListeners.get('viewer-xp:public-level-up')({ username: 'After hide', oldLevel: 8, newLevel: 9 });
        expect(fixture.window.document.querySelector('#username').textContent).toBe('Before hide');
        expect(fixture.window.document.querySelector('#levelUpContainer').classList.contains('show')).toBe(false);
        expect(fixture.window.document.querySelectorAll('.particle, .confetti')).toHaveLength(0);
      }
      expect(fixture.consoleErrors).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  test.each(LOCALES)('real i18n %s: all Viewer-XP renderers survive BFCache restore and clean up on final pagehide', async locale => {
    for (const page of ['xp-bar', 'leaderboard', 'level-up']) {
      const fixture = await createRenderer(page, locale, '?sound=false&refresh=60000', { realI18n: true });
      try {
        expect(fixture.localeRequests).toContain(locale);
        fixture.window.dispatchEvent(new fixture.window.PageTransitionEvent('pagehide', { persisted: true }));
        expect(fixture.disconnects).toBe(0);
        expect(fixture.socket.connected).not.toBe(false);
        fixture.window.dispatchEvent(new fixture.window.PageTransitionEvent('pageshow', { persisted: true }));

        if (page === 'xp-bar') {
          fixture.socketListeners.get('viewer-xp:public-profile')({ username: `Fixture ${locale}`, level: 7 });
          const level = { de: 'Stufe 7', en: 'Level 7', es: 'Nivel 7', fr: 'Niveau 7' }[locale];
          expect(fixture.window.document.querySelector('#levelBadge').textContent).toBe(level);
        } else if (page === 'leaderboard') {
          fixture.socketListeners.get('viewer-xp:public-leaderboard')([{
            username: `Fixture ${locale}`, name_color: '#2468ac', title: 'Fixture', level: 7, xp: 42, rank: 1
          }]);
          const level = { de: 'Stufe 7', en: 'Level 7', es: 'Nivel 7', fr: 'Niveau 7' }[locale];
          expect(fixture.window.document.querySelector('.level-badge').textContent).toBe(level);
        } else {
          fixture.socketListeners.get('viewer-xp:public-level-up')({
            username: `Fixture ${locale}`, oldLevel: 6, newLevel: 7
          });
          expect(fixture.window.document.querySelector('#username').textContent).toBe(`Fixture ${locale}`);
          expect(fixture.window.document.querySelector('#levelUpContainer').classList.contains('show')).toBe(true);
        }

        const displayedName = page === 'leaderboard'
          ? fixture.window.document.querySelector('.viewer-name').textContent.trim()
          : fixture.window.document.querySelector('#username').textContent;
        fixture.window.dispatchEvent(new fixture.window.PageTransitionEvent('pagehide', { persisted: false }));
        expect(fixture.disconnects).toBe(1);
        const event = page === 'xp-bar' ? 'viewer-xp:public-profile'
          : page === 'leaderboard' ? 'viewer-xp:public-leaderboard' : 'viewer-xp:public-level-up';
        const latePayload = page === 'xp-bar' ? { username: 'Late fixture', level: 99 }
          : page === 'leaderboard' ? [{ username: 'Late fixture', level: 99, xp: 999 }]
            : { username: 'Late fixture', oldLevel: 98, newLevel: 99 };
        fixture.socketListeners.get(event)(latePayload);
        const nameAfterFinalHide = page === 'leaderboard'
          ? fixture.window.document.querySelector('.viewer-name').textContent.trim()
          : fixture.window.document.querySelector('#username').textContent;
        expect(nameAfterFinalHide).toBe(displayedName);
        expect(fixture.consoleErrors).toEqual([]);
      } finally {
        fixture.close();
      }
    }
  });
});
