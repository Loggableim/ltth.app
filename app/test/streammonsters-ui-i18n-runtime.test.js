'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const appRoot = path.resolve(__dirname, '..');
const pluginDir = path.join(appRoot, 'plugins', 'stream-monsters');
const localeDir = path.join(pluginDir, 'locales');
const pluginHtml = fs.readFileSync(
  path.join(pluginDir, 'streammonsters-ui.html'),
  'utf8'
).replace(/\r\n/g, '\n');
const externalScripts = {
  '/js/i18n-client.js': path.join(appRoot, 'public/js/i18n-client.js'),
  '/js/tiktok-studio-url.js': path.join(appRoot, 'public/js/tiktok-studio-url.js'),
  '/plugins/stream-monsters/streammonsters-presentation.js': path.join(pluginDir, 'streammonsters-presentation.js'),
  '/plugins/stream-monsters/streammonsters-layout-editor.js': path.join(pluginDir, 'streammonsters-layout-editor.js'),
  '/plugins/stream-monsters/streammonsters-overlay-runtime.js': path.join(pluginDir, 'streammonsters-overlay-runtime.js'),
  '/plugins/stream-monsters/streammonsters-creator-runtime.js': path.join(pluginDir, 'streammonsters-creator-runtime.js')
};

function replaceExactlyOnce(source, needle, replacement, label) {
  const firstIndex = source.indexOf(needle);
  if (firstIndex < 0 || source.indexOf(needle, firstIndex + needle.length) >= 0) {
    throw new Error(`Expected exactly one ${label} instrumentation point`);
  }
  return `${source.slice(0, firstIndex)}${replacement}${source.slice(firstIndex + needle.length)}`;
}

const inlinePluginScripts = pluginHtml.replace(
  /<script src="([^"]+)"><\/script>/g,
  (tag, src) => {
    const scriptPath = externalScripts[src];
    if (!scriptPath) throw new Error(`Unexpected external script in test fixture: ${src}`);
    let source = fs.readFileSync(scriptPath, 'utf8').replace(/\r\n/g, '\n');
    if (src === '/js/i18n-client.js') {
      source = replaceExactlyOnce(
        source,
        'window.i18n = i18n;',
        `window.i18n = i18n;
window.__i18nPending = 0;
const __trackedInit = i18n.init.bind(i18n);
i18n.init = async (...args) => {
  window.__i18nPending += 1;
  try { return await __trackedInit(...args); }
  finally { window.__i18nPending -= 1; }
};`
      );
    }
    return `<script>${source}</script>`;
  }
)
  ;

const instrumentedPluginScripts = replaceExactlyOnce(
  replaceExactlyOnce(
    replaceExactlyOnce(
      replaceExactlyOnce(
        inlinePluginScripts,
        'Promise.allSettled([\n        init(),',
        'window.__creatorLocaleRefreshPromise = Promise.allSettled([\n        init(),',
        'creator locale refresh'
      ),
      '  loadCatalog().catch(() => {});\n  loadLeaderboards().catch(() => {});\n  const liveCountdownTimer = setInterval(() => renderLiveCenter(), 1000);',
      '  window.__creatorGiftCatalogPromise = loadCatalog().catch(() => {});\n  loadLeaderboards().catch(() => {});\n  const liveCountdownTimer = setInterval(() => renderLiveCenter(), 1000);',
      'creator gift catalog promise'
    ),
    '  init();\n})();',
    '  window.__creatorInitialPromise = init();\n})();',
    'creator initial initialization'
  ),
  'byId(\'loadViewer\').addEventListener(\'click\', () => loadViewer().catch(error => notice(apiErrorText(error), \'error\')));',
  'byId(\'loadViewer\').addEventListener(\'click\', () => { window.__creatorViewerPromise = loadViewer().catch(error => notice(apiErrorText(error), \'error\')); });',
  'creator viewer promise'
);

const commandActions = [
  'eggs', 'adopt', 'steal', 'hatch', 'inventory', 'monsters', 'monster',
  'choose', 'evolve', 'battle', 'leavebattle', 'rank', 'quests', 'monstershelp'
];

function stateFixture({ season = null, conflictingAliases = false } = {}) {
  const commandAliases = Object.fromEntries(commandActions.map(command => [
    command,
    { enabled:[], disabled:[] }
  ]));
  if (conflictingAliases) {
    commandAliases.eggs.enabled = ['same'];
    commandAliases.hatch.enabled = ['same'];
  }
  return {
    config:{ creatorName:'Fixture Creator', enabled:true, commandAliases },
    season,
    gcce:{},
    hype:{ points:0 }
  };
}

function createCreatorDom({
  season = null,
  conflictingAliases = false,
  creatorReadFails = false,
  assetAvailable = 72,
  deferGiftCatalog = false,
  deferViewerFetch = false,
  ignoreAbortedFetches = false
} = {}) {
  const virtualConsole = new VirtualConsole();
  const jsdomErrors = [];
  const unexpectedRequests = [];
  const requestLog = [];
  const intervals = new Map();
  const pendingGiftCatalogRequests = [];
  const pendingViewerRequests = [];
  const pendingDeferredRequests = [];
  const deferredFetchPaths = new Set();
  let activeFetches = 0;
  let nextIntervalId = 0;
  virtualConsole.on('jsdomError', error => jsdomErrors.push(error));
  const dom = new JSDOM(instrumentedPluginScripts, {
    url:'http://localhost:3000/stream-monsters/ui?lang=de',
    runScripts:'dangerously',
    virtualConsole,
    beforeParse(window) {
      const state = stateFixture({ season, conflictingAliases });
      window.__creatorIntervals = intervals;
      window.setInterval = (callback, delay = 0) => {
        const id = ++nextIntervalId;
        intervals.set(id, { callback, delay });
        return id;
      };
      window.clearInterval = id => intervals.delete(id);
      const deferResponse = (url, options, pendingRequests) => {
        let resolveResponse;
        let rejectResponse;
        let settled = false;
        const promise = new Promise((resolve, reject) => {
          resolveResponse = resolve;
          rejectResponse = reject;
        });
        const record = {
          path:url.pathname,
          signal:options.signal,
          promise,
          resolve:payload => {
            if (settled) return;
            settled = true;
            options.signal?.removeEventListener('abort', onAbort);
            activeFetches -= 1;
            resolveResponse(jsonResponse(payload));
          }
        };
        const onAbort = () => {
          if (ignoreAbortedFetches || settled) return;
          settled = true;
          options.signal?.removeEventListener('abort', onAbort);
          activeFetches -= 1;
          const error = new Error('Fixture request aborted');
          error.name = 'AbortError';
          rejectResponse(error);
        };
        pendingRequests.push(record);
        if (options.signal?.aborted) onAbort();
        else options.signal?.addEventListener('abort', onAbort, { once:true });
        return promise;
      };
      window.fetch = (input, options = {}) => {
        activeFetches += 1;
        const url = new URL(String(input), window.location.href);
        const method = String(options.method || 'GET').toUpperCase();
        requestLog.push(`${method} ${url.pathname}${url.search}`);
        let response;
        const localeMatch = url.pathname.match(/^\/api\/i18n\/translations\/(de|en|es|fr)$/);
        if (method !== 'GET') {
          unexpectedRequests.push(`${method} ${url.pathname}${url.search}`);
          response = jsonResponse({ errorCode:'UNEXPECTED_TEST_REQUEST' }, 404);
        } else if (localeMatch) {
          const locale = localeMatch[1];
          const translations = JSON.parse(fs.readFileSync(
            path.join(localeDir, `${locale}.json`),
            'utf8'
          ));
          response = jsonResponse(translations);
        } else if (url.pathname === '/api/status') {
          if (deferredFetchPaths.has(url.pathname)) {
            return deferResponse(url, options, pendingDeferredRequests);
          }
          response = jsonResponse({ username:'fixture-creator', connected:false });
        } else if (url.pathname === '/api/stream-monsters/creator-state') {
          if (deferViewerFetch && url.searchParams.has('userId')) {
            return deferResponse(url, options, pendingViewerRequests);
          }
          response = creatorReadFails
            ? jsonResponse({ errorCode:'CREATOR_READ_FAILED' }, 500)
            : jsonResponse(state);
        } else if (url.pathname === '/api/stream-monsters/gift-mappings') {
          response = jsonResponse({ mappings:[] });
        } else if (url.pathname === '/api/stream-monsters/gift-catalog') {
          if (deferGiftCatalog) {
            return deferResponse(url, options, pendingGiftCatalogRequests);
          }
          const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset'), 10) || 0);
          const limit = Math.max(1, Math.min(200, Number.parseInt(url.searchParams.get('limit'), 10) || 50));
          response = jsonResponse({ success:true, gifts:[], total:0, offset, limit });
        } else if (url.pathname === '/api/stream-monsters/monster-catalog') {
          if (url.searchParams.has('offset')) {
            response = jsonResponse({
              templates:[],
              total:24,
              assetIntegrity:{
                expected:72,
                available:assetAvailable,
                healthy:assetAvailable === 72
              }
            });
          } else {
            response = jsonResponse({ templates:[], total:24 });
          }
        } else if (url.pathname === '/api/stream-monsters/creator-catalog') {
          const userId = String(url.searchParams.get('userId') || '').trim();
          response = userId
            ? jsonResponse({
              success:true,
              userId,
              templates:[],
              dex:{ owned:0, total:24 },
              essence:[],
              cosmetics:[]
            })
            : jsonResponse({ error:'viewer_id_required' }, 400);
        } else if (url.pathname === '/api/stream-monsters/leaderboard') {
          response = jsonResponse({ entries:[] });
        } else {
          unexpectedRequests.push(`${url.pathname}${url.search}`);
          response = jsonResponse({ errorCode:'UNEXPECTED_TEST_REQUEST' }, 404);
        }
        activeFetches -= 1;
        return response;
      };
    }
  });
  return {
    dom,
    intervals,
    requestLog,
    pendingGiftCatalogRequests,
    pendingViewerRequests,
    pendingDeferredRequests,
    deferredFetchPaths,
    jsdomErrors,
    unexpectedRequests,
    get activeFetches() { return activeFetches; }
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok:status >= 200 && status < 300,
    status,
    statusText:status === 200 ? 'OK' : 'Fixture failure',
    json:async () => payload
  };
}

async function waitFor(check, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function settleRenderer(harness) {
  const { dom } = harness;
  const { window } = dom;
  await Promise.all([window.i18n.ready, window.__creatorInitialPromise, window.__creatorGiftCatalogPromise]);
  if (window.__creatorLocaleRefreshPromise) {
    await window.__creatorLocaleRefreshPromise;
  }
  await waitFor(
    () => window.__i18nPending === 0 && harness.activeFetches === 0,
    'renderer and locale reads to settle'
  );
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  if (window.__creatorLocaleRefreshPromise) {
    await window.__creatorLocaleRefreshPromise;
  }
  await waitFor(
    () => window.__i18nPending === 0 && harness.activeFetches === 0,
    'follow-up renderer reads to settle'
  );
}

function badgeTexts(window) {
  const text = id => window.document.getElementById(id).textContent.trim();
  return {
    integrity:text('assetIntegrity'),
    aliases:text('aliasConflictStatus'),
    season:text('seasonCountdown')
  };
}

describe('Stream Monsters creator runtime i18n', () => {
  test('keeps rendered integrity and alias states through DE → EN → FR DOM updates', async () => {
    const harness = createCreatorDom();
    const { dom, jsdomErrors, unexpectedRequests } = harness;
    const { window } = dom;
    try {
      await waitFor(() => badgeTexts(window).integrity === '72/72 geprüft', 'German creator render');
      await settleRenderer(harness);
      expect(badgeTexts(window)).toMatchObject({
        integrity:'72/72 geprüft',
        aliases:'Keine Alias-Konflikte',
        season:'Keine aktive Saison'
      });

      for (const [locale, expected] of [
        ['en', { integrity:'72/72 verified', aliases:'No alias conflicts', season:'No active season' }],
        ['fr', { integrity:'72/72 vérifiés', aliases:'Aucun conflit d’alias', season:'Aucune saison active' }],
        ['es', { integrity:'72/72 verificados', aliases:'No hay conflictos de alias', season:'No hay ninguna temporada activa' }]
      ]) {
        await expect(window.i18n.changeLanguage(locale)).resolves.toBe(true);
        await window.__creatorLocaleRefreshPromise;
        await settleRenderer(harness);
        await waitFor(() => {
          const badges = badgeTexts(window);
          return badges.integrity === expected.integrity &&
            badges.aliases === expected.aliases &&
            badges.season === expected.season;
        }, `${locale} creator rerender`);
        window.i18n.updateDOM();
        expect(badgeTexts(window)).toEqual(expected);
      }
      expect(unexpectedRequests).toEqual([]);
      expect(jsdomErrors).toEqual([]);
    } finally {
      await settleRenderer(harness);
      dom.window.close();
    }
  });

  test('renders degraded integrity and preserves its count through DE → EN → ES', async () => {
    const harness = createCreatorDom({ assetAvailable:67 });
    const { dom, jsdomErrors, unexpectedRequests } = harness;
    const { window } = dom;
    try {
      await waitFor(
        () => badgeTexts(window).integrity === 'Bei 5 Formen des Pakets besteht Handlungsbedarf',
        'German degraded asset integrity'
      );
      await settleRenderer(harness);
      expect(badgeTexts(window).integrity).toBe('Bei 5 Formen des Pakets besteht Handlungsbedarf');
      expect(window.document.getElementById('assetFormsHealthy').textContent).toBe('67/72');
      expect(window.document.getElementById('assetIntegrity').classList.contains('good')).toBe(false);

      for (const [locale, expected] of [
        ['en', '5 packaged forms need attention'],
        ['es', 'Hay que revisar 5 formas del paquete']
      ]) {
        await expect(window.i18n.changeLanguage(locale)).resolves.toBe(true);
        await window.__creatorLocaleRefreshPromise;
        await settleRenderer(harness);
        window.i18n.updateDOM();
        expect(badgeTexts(window).integrity).toBe(expected);
        expect(window.document.getElementById('assetFormsHealthy').textContent).toBe('67/72');
        expect(window.document.getElementById('assetIntegrity').classList.contains('good')).toBe(false);
      }
      expect(unexpectedRequests).toEqual([]);
      expect(jsdomErrors).toEqual([]);
    } finally {
      await settleRenderer(harness);
      dom.window.close();
    }
  });

  test('localizes alias-conflict results after a real locale rerender', async () => {
    const harness = createCreatorDom({ conflictingAliases:true });
    const { dom, jsdomErrors, unexpectedRequests } = harness;
    const { window } = dom;
    try {
      await waitFor(() => badgeTexts(window).aliases.startsWith('Konflikte:'), 'German alias conflict');
      await settleRenderer(harness);
      expect(badgeTexts(window).aliases).toContain('same');
      await expect(window.i18n.changeLanguage('en')).resolves.toBe(true);
      await window.__creatorLocaleRefreshPromise;
      await settleRenderer(harness);
      await waitFor(() => badgeTexts(window).aliases.startsWith('Conflicts:'), 'English alias conflict');
      window.i18n.updateDOM();
      expect(badgeTexts(window).aliases).toContain('same');
      await expect(window.i18n.changeLanguage('fr')).resolves.toBe(true);
      await window.__creatorLocaleRefreshPromise;
      await settleRenderer(harness);
      await waitFor(() => badgeTexts(window).aliases.startsWith('Conflits :'), 'French alias conflict');
      window.i18n.updateDOM();
      expect(badgeTexts(window).aliases).toContain('same');
      expect(unexpectedRequests).toEqual([]);
      expect(jsdomErrors).toEqual([]);
    } finally {
      await settleRenderer(harness);
      dom.window.close();
    }
  });

  test('renders localized creator read failures', async () => {
    const failed = createCreatorDom({ creatorReadFails:true });
    try {
      await waitFor(
        () => badgeTexts(failed.dom.window).season === 'Saisonstatus konnte nicht geladen werden',
        'German creator read failure'
      );
      for (const [locale, expected] of [
        ['fr', 'Impossible de charger l’état de la saison'],
        ['es', 'No se pudo cargar el estado de la temporada']
      ]) {
        await expect(failed.dom.window.i18n.changeLanguage(locale)).resolves.toBe(true);
        await failed.dom.window.__creatorLocaleRefreshPromise;
        await settleRenderer(failed);
        await waitFor(
          () => badgeTexts(failed.dom.window).season === expected,
          `${locale} creator read failure`
        );
        failed.dom.window.i18n.updateDOM();
        expect(badgeTexts(failed.dom.window).season).toBe(expected);
      }
      expect(failed.unexpectedRequests).toEqual([]);
      expect(failed.jsdomErrors).toEqual([]);
    } finally {
      await settleRenderer(failed);
      failed.dom.window.close();
    }

  });

  test('renders and relocalizes a valid season end date', async () => {
    const endsAt = Date.UTC(2030, 2, 15, 12);
    const active = createCreatorDom({ season:{ ends_at_ms:endsAt } });
    try {
      await waitFor(
        () => badgeTexts(active.dom.window).season !== 'Saison wird geladen',
        'German active season'
      );
      await settleRenderer(active);
      const dateLabel = new Date(endsAt).toLocaleDateString();
      expect(badgeTexts(active.dom.window).season).toContain(dateLabel);
      await expect(active.dom.window.i18n.changeLanguage('fr')).resolves.toBe(true);
      await active.dom.window.__creatorLocaleRefreshPromise;
      await settleRenderer(active);
      await waitFor(
        () => badgeTexts(active.dom.window).season.includes(dateLabel),
        'French active season rerender'
      );
      active.dom.window.i18n.updateDOM();
      expect(badgeTexts(active.dom.window).season).toContain(dateLabel);
      expect(active.unexpectedRequests).toEqual([]);
      expect(active.jsdomErrors).toEqual([]);
    } finally {
      await settleRenderer(active);
      active.dom.window.close();
    }
  });

  test('preserves creator intervals and locale rendering across BFCache pagehide/pageshow', async () => {
    const harness = createCreatorDom();
    const { dom, intervals, jsdomErrors, unexpectedRequests } = harness;
    const { window } = dom;
    try {
      await settleRenderer(harness);
      expect(intervals.size).toBe(2);

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted:true }));
      window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted:true }));
      expect(intervals.size).toBe(2);

      await expect(window.i18n.changeLanguage('fr')).resolves.toBe(true);
      await window.__creatorLocaleRefreshPromise;
      await settleRenderer(harness);
      expect(window.document.documentElement.lang).toBe('fr');
      expect(badgeTexts(window)).toMatchObject({
        integrity:'72/72 vérifiés',
        aliases:'Aucun conflit d’alias',
        season:'Aucune saison active'
      });
      for (const { callback } of intervals.values()) callback();
      await settleRenderer(harness);
      expect(intervals.size).toBe(2);
      expect(unexpectedRequests).toEqual([]);
      expect(jsdomErrors).toEqual([]);
    } finally {
      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted:false }));
      expect(intervals.size).toBe(0);
      dom.window.close();
    }
  });

  test('non-persisted pagehide clears intervals and aborts the in-flight gift catalog request', async () => {
    const harness = createCreatorDom({ deferGiftCatalog:true });
    const { dom, intervals, pendingGiftCatalogRequests, jsdomErrors, unexpectedRequests } = harness;
    const { window } = dom;
    try {
      await waitFor(() => window.__creatorInitialPromise, 'creator initialization hook');
      await window.__creatorInitialPromise;
      await waitFor(() => pendingGiftCatalogRequests.length === 1, 'in-flight gift catalog request');
      const inFlightGiftCatalogPromise = pendingGiftCatalogRequests[0].promise;
      const { signal } = pendingGiftCatalogRequests[0];
      expect(signal.aborted).toBe(false);
      expect(intervals.size).toBe(2);

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted:false }));
      expect(intervals.size).toBe(0);
      expect(signal.aborted).toBe(true);
      await expect(inFlightGiftCatalogPromise).rejects.toMatchObject({ name:'AbortError' });
      await waitFor(() => harness.activeFetches === 0, 'aborted request cleanup');
      expect(unexpectedRequests).toEqual([]);
      expect(jsdomErrors).toEqual([]);
    } finally {
      dom.window.close();
    }
  });

  test('ignores queued callbacks and abort-ignoring gift/viewer responses after final pagehide', async () => {
    const harness = createCreatorDom({
      deferGiftCatalog:true,
      deferViewerFetch:true,
      ignoreAbortedFetches:true
    });
    const {
      dom,
      intervals,
      requestLog,
      pendingGiftCatalogRequests,
      pendingViewerRequests,
      jsdomErrors,
      unexpectedRequests
    } = harness;
    const { window } = dom;
    try {
      await waitFor(() => window.__creatorInitialPromise, 'creator initialization hook');
      await window.__creatorInitialPromise;
      await waitFor(() => pendingGiftCatalogRequests.length === 1, 'deferred gift catalog request');
      window.document.getElementById('viewerSearch').value = 'fixture-viewer';
      window.document.getElementById('loadViewer').click();
      await waitFor(() => pendingViewerRequests.length === 1, 'deferred viewer request');
      const inFlightGiftCatalogPromise = pendingGiftCatalogRequests[0].promise;
      const inFlightViewerPromise = pendingViewerRequests[0].promise;
      const queuedIntervalCallbacks = [...intervals.values()].map(({ callback }) => callback);
      const before = {
        giftCatalog:window.document.getElementById('giftCatalog').innerHTML,
        viewerSummary:window.document.getElementById('viewerSummary').textContent,
        viewerCollection:window.document.getElementById('viewerCollection').innerHTML,
        monsterDex:window.document.getElementById('monsterDex').innerHTML,
        liveCenter:window.document.getElementById('live-center').innerHTML,
        requestLog:[...requestLog]
      };

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted:false }));
      expect(intervals.size).toBe(0);
      expect(pendingGiftCatalogRequests[0].signal.aborted).toBe(true);
      expect(pendingViewerRequests[0].signal.aborted).toBe(true);
      queuedIntervalCallbacks.forEach(callback => callback());
      pendingGiftCatalogRequests[0].resolve({
        success:true,
        gifts:[{ giftId:777, giftName:'Late Gift', coinValue:100 }],
        total:1,
        offset:0,
        limit:100
      });
      pendingViewerRequests[0].resolve({
        viewer:{
          rank:{ rank:'Gold', points:900 },
          monsters:[{
            monster_id:777,
            name:'Late Monster',
            level:99,
            element:'Ember',
            personality:'brave',
            xp:999,
            image_url:''
          }]
        }
      });
      await Promise.allSettled([inFlightGiftCatalogPromise, inFlightViewerPromise]);
      await Promise.allSettled([window.__creatorGiftCatalogPromise, window.__creatorViewerPromise]);
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      expect(requestLog).toEqual(before.requestLog);
      expect(window.document.getElementById('giftCatalog').innerHTML).toBe(before.giftCatalog);
      expect(window.document.getElementById('viewerSummary').textContent).toBe(before.viewerSummary);
      expect(window.document.getElementById('viewerCollection').innerHTML).toBe(before.viewerCollection);
      expect(window.document.getElementById('monsterDex').innerHTML).toBe(before.monsterDex);
      expect(window.document.getElementById('live-center').innerHTML).toBe(before.liveCenter);
      expect(unexpectedRequests).toEqual([]);
      expect(jsdomErrors).toEqual([]);
    } finally {
      dom.window.close();
    }
  });

  test('does not continue a locale rerender promise after final pagehide', async () => {
    const harness = createCreatorDom();
    const { dom, requestLog, pendingDeferredRequests, deferredFetchPaths } = harness;
    const { window } = dom;
    try {
      await settleRenderer(harness);
      deferredFetchPaths.add('/api/status');
      window.document.getElementById('creatorName').value = 'sentinel-before-dispose';

      const localeChangePromise = window.i18n.changeLanguage('fr');
      await waitFor(() => pendingDeferredRequests.length === 1, 'deferred status in locale rerender');
      await waitFor(() => window.__creatorLocaleRefreshPromise, 'locale rerender promise');
      await new Promise(resolve => setImmediate(resolve));
      const beforePageHide = {
        creatorName:window.document.getElementById('creatorName').value,
        readiness:window.document.getElementById('readinessScore').textContent,
        season:window.document.getElementById('seasonCountdown').textContent,
        notice:window.document.getElementById('notice').textContent,
        requestLog:[...requestLog]
      };
      expect(window.document.documentElement.lang).toBe('fr');

      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted:false }));
      pendingDeferredRequests[0].resolve({ username:'late-status-response', connected:false });
      await localeChangePromise;
      await window.__creatorLocaleRefreshPromise;

      expect(window.document.getElementById('creatorName').value).toBe(beforePageHide.creatorName);
      expect(window.document.getElementById('readinessScore').textContent).toBe(beforePageHide.readiness);
      expect(window.document.getElementById('seasonCountdown').textContent).toBe(beforePageHide.season);
      expect(window.document.getElementById('notice').textContent).toBe(beforePageHide.notice);
      expect(requestLog).toEqual(beforePageHide.requestLog);
    } finally {
      dom.window.close();
    }
  });
});
