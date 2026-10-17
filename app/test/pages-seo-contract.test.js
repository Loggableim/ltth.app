'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const sitemapDom = new JSDOM(sitemap, { contentType: 'text/xml' });
const languages = ['de', 'en', 'es', 'fr'];

function readHtml(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function links(html, selector) {
  const dom = new JSDOM(html);
  return [...dom.window.document.querySelectorAll(selector)].map((node) => ({
    language: node.getAttribute('hreflang'),
    href: node.getAttribute('href')
  }));
}

function sitemapEntry(url) {
  const urls = [...sitemapDom.window.document.getElementsByTagName('url')];
  return urls.find((entry) => entry.getElementsByTagName('loc')[0]?.textContent === url);
}

function sitemapAlternates(url) {
  const entry = sitemapEntry(url);
  if (!entry) return [];
  return [...entry.getElementsByTagName('xhtml:link')].map((node) => ({
    language: node.getAttribute('hreflang'),
    href: node.getAttribute('href')
  }));
}

function sortAlternates(alternates) {
  return [...alternates].sort((left, right) => left.language.localeCompare(right.language));
}

describe('public website SEO metadata contract', () => {
  test('every sitemap URL has exactly one non-empty loc entry', () => {
    const urls = [...sitemapDom.window.document.getElementsByTagName('url')];
    expect(urls.length).toBeGreaterThan(0);

    for (const url of urls) {
      const locs = [...url.children].filter((child) => child.localName === 'loc');
      expect(locs).toHaveLength(1);
      expect(locs[0].textContent.trim()).not.toBe('');
    }
  });

  test('localized feature pages have reciprocal HTML and sitemap language alternates', () => {
    const featureFiles = fs.readdirSync(path.join(root, 'features'))
      .filter((file) => file.endsWith('.html'))
      .filter((file) => !['index.html', 'overlays.html', 'hybridshock.html', 'plugin-leaderboard.html', 'plugin-openshock.html'].includes(file));

    for (const file of featureFiles) {
      const relativePath = `features/${file}`;
      const canonical = `https://ltth.app/${relativePath}`;
      const html = readHtml(relativePath);
      const doc = new JSDOM(html).window.document;
      const canonicalLink = doc.querySelector('link[rel="canonical"]');
      const htmlAlternates = links(html, 'link[rel="alternate"][hreflang]');

      if (!canonicalLink || canonicalLink.href !== canonical || htmlAlternates.length === 0) continue;

      expect(htmlAlternates.map((entry) => entry.language)).toEqual([...languages, 'x-default']);
      expect(htmlAlternates.map((entry) => entry.href)).toEqual([
        ...languages.map((language) => `${canonical}?lang=${language}`),
        canonical
      ]);
      expect(sortAlternates(sitemapAlternates(canonical))).toEqual(sortAlternates(htmlAlternates));
    }
  });

  test('homepage, plugin catalog, thank-you, OBS WebGPU, and TopTier alternates point at canonical routes', () => {
    const pages = [
      ['index.html', 'https://ltth.app/'],
      ['plugins.html', 'https://ltth.app/plugins.html'],
      ['thank-you.html', 'https://ltth.app/thank-you.html'],
      ['obs-webgpu.html', 'https://ltth.app/obs-webgpu.html'],
      ['features/toptier.html', 'https://ltth.app/features/toptier.html']
    ];

    for (const [relativePath, canonical] of pages) {
      const html = readHtml(relativePath);
      const doc = new JSDOM(html).window.document;
      expect(doc.querySelector('link[rel="canonical"]')?.href).toBe(canonical);
      const alternates = links(html, 'link[rel="alternate"][hreflang]');
      expect(alternates.map((entry) => entry.language).sort()).toEqual([...languages, 'x-default'].sort());
      for (const language of languages) {
        const href = alternates.find((entry) => entry.language === language)?.href;
        expect([canonical, `${canonical}?lang=${language}`]).toContain(href);
      }
      expect(alternates.find((entry) => entry.language === 'x-default')?.href).toBe(canonical);
      expect(sortAlternates(sitemapAlternates(canonical))).toEqual(sortAlternates(alternates));
    }
  });

  test('redirect and canonical-alias feature routes are not listed as independent sitemap pages', () => {
    const sitemapLocs = [...sitemapDom.window.document.getElementsByTagName('loc')]
      .map((node) => node.textContent);
    expect(sitemapLocs).not.toEqual(expect.arrayContaining([
      'https://ltth.app/features/overlays.html',
      'https://ltth.app/features/plugin-leaderboard.html',
      'https://ltth.app/features/plugin-openshock.html'
    ]));

    const redirect = new JSDOM(readHtml('features/overlays.html')).window.document;
    expect(redirect.querySelector('link[rel="canonical"]')?.href).toBe('https://ltth.app/features/');
  });
});
