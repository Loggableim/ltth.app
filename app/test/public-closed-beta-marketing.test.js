'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'app/config/plugin-release-policy.json'), 'utf8'));
const localeFiles = Object.fromEntries(['de', 'en', 'es', 'fr'].map((lang) => [
  lang,
  JSON.parse(fs.readFileSync(path.join(root, `locales/${lang}.json`), 'utf8'))
]));
const page = fs.readFileSync(path.join(root, 'streammonsters/index.html'), 'utf8');
const guide = fs.readFileSync(path.join(root, 'js/streammonsters-guide.js'), 'utf8');
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const featureHub = fs.readFileSync(path.join(root, 'features/index.html'), 'utf8');
const betaFeaturePages = [
  'features/animazingpal.html',
  'features/interactive-story.html',
  'features/plugin-music-bot.html',
  'features/osc-bridge.html',
  'features/talking-heads.html',
  'features/emoji-rain.html',
  'features/plugin-stream-alchemy.html'
].map((relative) => ({ relative, html: fs.readFileSync(path.join(root, relative), 'utf8') }));
const i18nSource = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pluginStore = JSON.parse(fs.readFileSync(path.join(root, 'plugin-store.json'), 'utf8'));
const pluginStorePage = fs.readFileSync(path.join(root, 'plugins.html'), 'utf8');
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');

function startServiceWorker(fetchImpl) {
  const handlers = {};
  const calls = [];
  const deletedCaches = [];
  const caches = {
    match: async () => {
      calls.push('cache');
      return { source: 'cached', ok: true };
    },
    open: async () => ({ put: async () => {} }),
    keys: async () => ['ltth-v1.3.3', 'coinbattle-overlay-v1'],
    delete: async (name) => {
      deletedCaches.push(name);
      return true;
    }
  };
  const context = vm.createContext({
    caches,
    fetch: fetchImpl,
    Promise,
    URL,
    self: {
      location: { origin: 'https://ltth.test' },
      clients: { claim: async () => {} },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: async () => {}
    }
  });
  vm.runInContext(serviceWorker, context);
  return { handlers, calls, deletedCaches };
}

describe('public closed-beta marketing contract', () => {
  test('keeps the requested apps in explicit closed beta policy', () => {
    expect(policy.closedBeta).toHaveLength(11);
    expect(policy.closedBeta).toEqual(expect.arrayContaining([
      'animazingpal', 'interactive-story', 'music-bot', 'osc-bridge', 'schnorrbecher',
      'sidekick', 'stream-monsters', 'talking-heads', 'visual-fx-frame-webgpu',
      'webgpu-emoji-rain', 'webgpu-weather-control'
    ]));
  });

  test('Stream Monsters public page has no package or runtime script delivery path', () => {
    expect(page).toContain('id="availability-notice"');
    expect(page).toContain('id="availability-footer"');
    expect(page.match(/href="\/features\/plugin-stream-alchemy\.html"/g)).toHaveLength(2);
    expect(page).not.toContain('/docs/plugins/stream-monsters.html');
    expect(page).not.toContain('/download.html');
    expect(page).not.toContain('stream-monsters-1.12.0.zip');
    expect(page).not.toContain('/app/plugins/stream-monsters/');
    expect(page).not.toContain('data-streammonsters-access');
    expect(guide).not.toContain('packageFilename');
    expect(guide).not.toContain('active LTTH subscription');
    expect(guide).not.toContain('StreamMonstersRulesV8Pacing');
    expect(guide).toContain("availability:'Closed Beta");
    expect(guide).toContain('Public availability and downloads will follow later.');
  });

  test('homepage names all 11 beta apps in a status section', () => {
    const section = homepage.match(/<section class="home-closed-beta"[\s\S]*?<\/section>/)?.[0] || '';
    expect(section).toContain('aria-labelledby="closed-beta-title"');
    expect(section).toContain('homeV2.closedBeta.title');
    expect(section.match(/<li\b/g)).toHaveLength(11);
    expect(section.match(/data-i18n="homeV2\.closedBeta\.apps\.[A-Za-z]+"/g)).toHaveLength(11);
    expect(section).not.toContain('/download.html');
  });

  test('store listing and its static fallback contain no closed-beta apps or Chatango', () => {
    const betaIds = new Set(policy.closedBeta);
    expect(pluginStore.plugins).toHaveLength(24);
    expect(pluginStore.plugins.map((plugin) => plugin.id).filter((id) => betaIds.has(id))).toEqual([]);
    expect(pluginStore.plugins.some((plugin) => plugin.id === 'chatango')).toBe(false);
    const staticFallback = pluginStorePage.match(/<div class="plugin-catalog-grid" data-static-plugin-catalog>([\s\S]*?)<\/div>/)?.[0] || '';
    expect(staticFallback).not.toBe('');
    for (const id of [...policy.closedBeta, 'chatango']) {
      expect(staticFallback).not.toContain(`data-plugin-id="${id}"`);
    }
  });

  test('current homepage, feature hub, store, and sitemap do not surface Chatango', () => {
    for (const content of [homepage, featureHub, pluginStorePage, JSON.stringify(pluginStore), sitemap]) {
      expect(content.toLowerCase()).not.toContain('chatango');
    }
  });

  test('closed-beta Stream Monsters and alias routes are not advertised', () => {
    expect(sitemap).not.toContain('https://ltth.app/streammonsters/');
    expect(sitemap).not.toContain('https://ltth.app/stream-monsters/');
    expect(sitemap).not.toContain('https://ltth.app/streamalchemy/');
    expect(pluginStorePage).not.toContain("'streamalchemy': '/features/plugin-stream-alchemy.html'");
    expect(pluginStorePage).not.toContain("'stream-monsters': '/features/plugin-stream-alchemy.html'");
  });

  test('feature hub hides beta cards while local source pages retain their availability notice', () => {
    const cardIds = [
      'animazingpal', 'interactive-story', 'talking-heads', 'plugin-music-bot',
      'emoji-rain', 'plugin-stream-alchemy', 'osc-bridge'
    ];
    for (const id of cardIds) {
      expect(featureHub).not.toContain(`id="feature-${id}"`);
      expect(featureHub).not.toContain(`/features/${id}.html`);
    }

    for (const page of betaFeaturePages) {
      expect(page.html).toContain('features.closedBeta.notice');
      expect(page.html).toContain('role="status"');
      expect(page.html).not.toMatch(/<a\b[^>]*href=["'][^"']*download/i);
      expect(page.html).not.toMatch(/<a\b[^>]*>[^<]*(?:download|herunterladen|descargar|télécharger)/i);
      expect(page.html).not.toMatch(/ltth_latest\.zip|(?:animazingpal|interactive-story|music-bot|osc-bridge|talking-heads|emoji-rain)-[0-9][^"'\s]*\.zip/i);
    }
  });

  test.each(['de', 'en', 'es', 'fr'])('%s homepage copy resolves through the actual i18n runtime', async (lang) => {
    const dom = new JSDOM('', { url: 'https://ltth.test/index.html', runScripts: 'outside-only' });
    dom.window.fetch = async (url) => {
      const pathname = new URL(url, 'https://ltth.test').pathname;
      const localeMatch = pathname.match(/^\/locales\/(de|en|es|fr)\.json$/);
      if (localeMatch) return { ok: true, json: async () => localeFiles[localeMatch[1]] };
      return { ok: false, status: 404 };
    };
    dom.window.eval(i18nSource);
    await dom.window.I18n.init(lang);
    expect(dom.window.I18n.t('homeV2.closedBeta.title'))
      .toBe(localeFiles[lang].homeV2.closedBeta.title);
    const appLabels = localeFiles[lang].homeV2.closedBeta.apps;
    expect(Object.keys(appLabels)).toHaveLength(11);
    for (const [key, label] of Object.entries(appLabels)) {
      expect(label).toBeTruthy();
      expect(dom.window.I18n.t(`homeV2.closedBeta.apps.${key}`)).toBe(label);
    }
    expect(localeFiles[lang].home.closedBeta).toBeUndefined();
    dom.window.close();
  });

  test('service worker refreshes locale JSON over the network and retires its previous cache', () => {
    expect(serviceWorker).toContain("const CACHE_NAME = 'ltth-v1.3.4'");
    expect(serviceWorker).toContain("requestUrl.pathname.startsWith('/locales/')");
    expect(serviceWorker).toContain("cacheName.startsWith('ltth-') && cacheName !== CACHE_NAME");
    const localeNetworkFirst = serviceWorker.indexOf("requestUrl.pathname.startsWith('/locales/')");
    const genericCacheFirst = serviceWorker.indexOf('caches.match(event.request)');
    expect(localeNetworkFirst).toBeGreaterThan(-1);
    expect(genericCacheFirst).toBeGreaterThan(localeNetworkFirst);
  });

  test('service worker uses network-first locale lookup and only deletes its own old caches', async () => {
    const worker = startServiceWorker(async () => {
      worker.calls.push('network');
      return { ok: true, source: 'network', clone() { return this; } };
    });
    let localeResponse;
    worker.handlers.fetch({
      request: { method: 'GET', url: 'https://ltth.test/locales/de.json' },
      respondWith: (promise) => { localeResponse = promise; }
    });
    expect((await localeResponse).source).toBe('network');
    expect(worker.calls).toEqual(['network']);

    let activation;
    worker.handlers.activate({ waitUntil: (promise) => { activation = promise; } });
    await activation;
    expect(worker.deletedCaches).toEqual(['ltth-v1.3.3']);
  });

  test('canonical Stream Monsters store alias has no feature-hub route mapping', () => {
    expect(featureHub).not.toContain('id="feature-plugin-stream-alchemy"');
    expect(pluginStorePage).not.toContain("'streamalchemy': '/features/plugin-stream-alchemy.html'");
    expect(pluginStorePage).not.toContain("'stream-monsters': '/features/plugin-stream-alchemy.html'");
  });

  test('beta detail source routes remain unlisted from the public sitemap', () => {
    const languages = ['de', 'en', 'es', 'fr'];

    for (const feature of betaFeaturePages) {
      const canonical = `https://ltth.app/${feature.relative}`;
      const canonicalMatch = feature.html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
      const alternates = [...feature.html.matchAll(/<link\b(?=[^>]*\brel=["']alternate["'])[^>]*\bhreflang=["']([^"']+)["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
        .map((match) => [match[1], match[2]]);

      expect(canonicalMatch?.[1]).toBe(canonical);
      expect(sitemap).not.toContain(`<loc>${canonical}</loc>`);
      expect(alternates).toEqual([
        ...languages.map((lang) => [lang, `${canonical}?lang=${lang}`]),
        ['x-default', canonical]
      ]);
      expect(feature.html).toContain('features.closedBeta.notice');
      expect(feature.html).toContain('role="status"');
      expect(feature.html).not.toMatch(/<a\b[^>]*href=["'][^"']*(?:download|plugin-store|\/dashboard\.html\?view=plugins|\/plugins\.html(?:#|["']))/i);

      for (const lang of languages) {
        const notice = localeFiles[lang]['features.closedBeta.notice'];
        expect(notice).toMatch(/closed beta|geschlossene beta|beta cerrada|bêta fermée/i);
        expect(notice).toMatch(/not available for public|nicht öffentlich|descarga pública|téléchargeable publiquement/i);
      }
    }

    const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    const betaRoutesInSitemap = betaFeaturePages
      .map((feature) => `https://ltth.app/${feature.relative}`)
      .filter((canonical) => sitemapLocs.includes(canonical));
    expect(betaRoutesInSitemap).toEqual([]);
  });

  test('Stream Monsters local source has canonical metadata but is not a public sitemap route', () => {
    const canonical = 'https://ltth.app/streammonsters/';
    const canonicalMatch = page.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
    const ogUrl = page.match(/<meta\b(?=[^>]*\bproperty=["']og:url["'])[^>]*\bcontent=["']([^"']+)["'][^>]*>/i);
    const alternates = [...page.matchAll(/<link\b(?=[^>]*\brel=["']alternate["'])[^>]*\bhreflang=["']([^"']+)["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
      .map((match) => [match[1], match[2]]);

    expect(canonicalMatch?.[1]).toBe(canonical);
    expect(ogUrl?.[1]).toBe(canonical);
    expect(sitemap).not.toContain(`<loc>${canonical}</loc>`);
    expect(alternates).toEqual([
      ...['de', 'en', 'es', 'fr'].map((lang) => [lang, `${canonical}?lang=${lang}`]),
      ['x-default', canonical]
    ]);
    expect(page).not.toMatch(/<a\b[^>]*href=["'][^"']*(?:download|plugin-store|\/dashboard\.html\?view=plugins)/i);
  });
});
