'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const localeFiles = Object.fromEntries(['de', 'en', 'es', 'fr'].map((lang) => [
  lang,
  JSON.parse(fs.readFileSync(path.join(root, `locales/${lang}.json`), 'utf8'))
]));
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const i18nSource = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

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

describe('closed-beta homepage and locale cache contract', () => {
  test('homepage lists the eleven beta apps without app download links', () => {
    const section = homepage.match(/<section class="home-closed-beta"[\s\S]*?<\/section>/)?.[0] || '';
    expect(section).toContain('homeV2.closedBeta.title');
    expect(section.match(/<li>/g)).toHaveLength(11);
    expect(section).not.toMatch(/href\s*=/i);
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
    expect(localeFiles[lang].home.closedBeta).toBeUndefined();
    dom.window.close();
  });

  test('service worker uses network-first locale lookup and keeps its own old cache namespace', async () => {
    expect(serviceWorker).toContain("const CACHE_NAME = 'ltth-v1.3.4'");
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

  test('service worker falls back to its cached locale when network fetch fails', async () => {
    const worker = startServiceWorker(async () => { throw new Error('offline'); });
    let localeResponse;
    worker.handlers.fetch({
      request: { method: 'GET', url: 'https://ltth.test/locales/fr.json' },
      respondWith: (promise) => { localeResponse = promise; }
    });
    expect((await localeResponse).source).toBe('cached');
    expect(worker.calls).toEqual(['cache']);
  });
});
