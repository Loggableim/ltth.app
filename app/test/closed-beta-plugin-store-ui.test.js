'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');
const betaIds = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/config/plugin-release-policy.json'), 'utf8')).closedBeta;
const allowlist = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/public-plugin-allowlist.json'), 'utf8'));
const pageHtml = fs.readFileSync(path.join(ROOT, 'plugins.html'), 'utf8');
const storeScript = [...pageHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .find((source) => source.includes('async function fetchPublicPluginIds'));

function plugin(id) {
  return {
    id,
    name: id,
    description: `${id} description`,
    version: '1.0.0',
    packageUrl: `https://ltth.app/plugin-store/packages/${id}-1.0.0.zip`
  };
}

async function waitForCatalogRender(grid) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (grid.getAttribute('aria-busy') === 'false') return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Plugin catalog did not finish rendering');
}

describe('closed-beta plugin store UI', () => {
  test('filters beta catalog and tutorial entries before rendering package CTAs', async () => {
    expect(storeScript).toBeDefined();

    const dom = new JSDOM(pageHtml, {
      url: 'https://ltth.app/plugins.html?lang=en',
      runScripts: 'outside-only'
    });
    const allowedId = allowlist.publicPluginIds[0];
    const storePayload = { plugins: [plugin(allowedId), ...betaIds.map(plugin)] };
    const tutorialPayload = betaIds.map((id) => ({ id, name: id, category: 'plugin' }));
    const requestedPaths = [];
    const originalAddEventListener = dom.window.document.addEventListener.bind(dom.window.document);
    let onReady;
    dom.window.document.addEventListener = (type, listener, options) => {
      if (type === 'DOMContentLoaded') {
        onReady = listener;
        return;
      }
      originalAddEventListener(type, listener, options);
    };

    dom.window.fetch = async (input) => {
      const pathname = new URL(input, dom.window.location.origin).pathname;
      requestedPaths.push(pathname);
      if (pathname === '/scripts/public-plugin-allowlist.json') {
        return { ok: true, json: async () => allowlist };
      }
      if (pathname === '/plugin-store.json') {
        return { ok: true, json: async () => storePayload };
      }
      if (pathname === '/docs/plugins/index.json') {
        return { ok: true, json: async () => tutorialPayload };
      }
      return { ok: false, status: 404 };
    };

    try {
      dom.window.eval(storeScript);
      await onReady(new dom.window.Event('DOMContentLoaded'));

      const grid = dom.window.document.getElementById('plugin-store-grid');
      await waitForCatalogRender(grid);

      const renderedIds = [...grid.querySelectorAll('[data-plugin-id]')]
        .map((card) => card.getAttribute('data-plugin-id'));
      const packageLinks = [...grid.querySelectorAll('a[href*="/plugin-store/packages/"]')];
      expect(requestedPaths).toEqual([
        '/scripts/public-plugin-allowlist.json',
        '/plugin-store.json',
        '/docs/plugins/index.json'
      ]);
      expect(renderedIds).toEqual([allowedId]);
      expect(packageLinks).toHaveLength(1);
      expect(packageLinks[0].getAttribute('href')).toBe(
        `https://ltth.app/plugin-store/packages/${allowedId}-1.0.0.zip`
      );

      for (const id of betaIds) {
        expect(grid.querySelector(`[data-plugin-id="${id}"]`)).toBeNull();
        expect(packageLinks.some((link) => link.href.includes(id))).toBe(false);
      }
    } finally {
      dom.window.close();
    }
  });
});
