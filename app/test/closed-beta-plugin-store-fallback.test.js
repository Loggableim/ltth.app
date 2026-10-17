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

function captureReadyHandler(dom) {
  const originalAddEventListener = dom.window.document.addEventListener.bind(dom.window.document);
  let onReady;
  dom.window.document.addEventListener = (type, listener, options) => {
    if (type === 'DOMContentLoaded') {
      onReady = listener;
      return;
    }
    originalAddEventListener(type, listener, options);
  };
  return () => onReady(new dom.window.Event('DOMContentLoaded'));
}

function expectFailClosedCatalog(document) {
  const grid = document.getElementById('plugin-store-grid');
  const ids = [...grid.querySelectorAll('[data-plugin-id]')]
    .map((card) => card.getAttribute('data-plugin-id'));
  const links = [...grid.querySelectorAll('a')];
  const closedBeta = document.getElementById('plugin-store-closed-beta');

  expect(new Set(ids)).toEqual(new Set(allowlist.publicPluginIds));
  expect(links).toHaveLength(allowlist.publicPluginIds.length);
  for (const card of grid.querySelectorAll('[data-plugin-id]')) {
    const id = card.getAttribute('data-plugin-id');
    expect(card.querySelector('a')?.getAttribute('href')).toBe(`/docs/plugins/${id}.html`);
  }
  for (const id of [...betaIds, 'chatango']) {
    expect(ids).not.toContain(id);
    expect(links.some((link) => link.getAttribute('href').toLowerCase().includes(`/docs/plugins/${id}.html`))).toBe(false);
  }
  expect(grid.querySelectorAll('a[href*=".zip"], a[href*="download"], a[href*="install"]')).toHaveLength(0);

  expect(closedBeta).not.toBeNull();
  expect(closedBeta.querySelector('.plugin-closed-beta__eyebrow').textContent.trim())
    .toBe('CLOSED BETA · COMING SOON');
  expect(closedBeta.textContent).toMatch(/not available for public download/i);
  expect(closedBeta.querySelectorAll('a')).toHaveLength(0);
  const closedBetaIds = [...closedBeta.querySelectorAll('[data-closed-beta-id]')]
    .map((item) => item.getAttribute('data-closed-beta-id'));
  expect(new Set(closedBetaIds)).toEqual(new Set(betaIds));
}

function syntheticPlugin(id) {
  return {
    id,
    name: id,
    description: `${id} synthetic description`,
    version: '1.0.0',
    packageUrl: `https://ltth.app/plugin-store/packages/${id}-1.0.0.zip`
  };
}

describe('closed-beta public plugin catalog fallback', () => {
  test.each([
    ['allowlist HTTP failure', '/scripts/public-plugin-allowlist.json', 'http'],
    ['allowlist invalid JSON', '/scripts/public-plugin-allowlist.json', 'json'],
    ['store HTTP failure', '/plugin-store.json', 'http'],
    ['store invalid JSON', '/plugin-store.json', 'json']
  ])('keeps the static catalog fail-closed after %s', async (_label, failedPath, failureType) => {
    expect(storeScript).toBeDefined();
    const dom = new JSDOM(pageHtml, {
      url: 'https://ltth.app/plugins.html?lang=en',
      runScripts: 'outside-only'
    });
    const requestedPaths = [];
    const runReady = captureReadyHandler(dom);
    dom.window.fetch = async (input) => {
      const pathname = new URL(input, dom.window.location.origin).pathname;
      requestedPaths.push(pathname);
      if (pathname === failedPath) {
        if (failureType === 'json') {
          return { ok: true, json: async () => { throw new SyntaxError('synthetic invalid JSON'); } };
        }
        return { ok: false, status: 503 };
      }
      if (pathname === '/scripts/public-plugin-allowlist.json') {
        return { ok: true, json: async () => allowlist };
      }
      if (pathname === '/plugin-store.json') {
        return {
          ok: true,
          json: async () => ({ plugins: [...betaIds, 'chatango'].map(syntheticPlugin) })
        };
      }
      return { ok: false, status: 404 };
    };

    try {
      dom.window.eval(storeScript);
      await runReady();

      expectFailClosedCatalog(dom.window.document);
      expect(dom.window.document.getElementById('plugin-store-empty').style.display).toBe('block');
      expect(requestedPaths).toContain(failedPath);
      if (failedPath === '/scripts/public-plugin-allowlist.json') {
        expect(requestedPaths).toEqual([failedPath]);
      } else {
        expect(requestedPaths).toEqual([
          '/scripts/public-plugin-allowlist.json',
          '/plugin-store.json'
        ]);
      }
    } finally {
      dom.window.close();
    }
  });

  test('keeps the static fallback fail-closed with JavaScript disabled', () => {
    const dom = new JSDOM(pageHtml, { url: 'https://ltth.app/plugins.html?lang=en' });
    try {
      expectFailClosedCatalog(dom.window.document);
    } finally {
      dom.window.close();
    }
  });
});
