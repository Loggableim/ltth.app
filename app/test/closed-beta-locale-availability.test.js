'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');
const LANGS = ['de', 'en', 'es', 'fr'];
const localeFiles = Object.fromEntries(LANGS.map((lang) => [
  lang,
  JSON.parse(fs.readFileSync(path.join(ROOT, `locales/${lang}.json`), 'utf8'))
]));
const homepage = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const headerTemplate = fs.readFileSync(path.join(ROOT, '_partials/header.html'), 'utf8');
const i18nSource = fs.readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/config/plugin-release-policy.json'), 'utf8'));
const store = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin-store.json'), 'utf8'));
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const featureCatalog = require('../../features/catalog-data.js');
const featureHubPages = {
  de: 'features/index.html',
  en: 'features-en.html',
  es: 'features-es.html',
  fr: 'features-fr.html',
};
const expectedNames = [
  'AnimazingPal',
  'Interactive Story',
  'Music Bot',
  'OSC Bridge',
  'Schnorrbecher',
  'Sidekick',
  'Stream Monsters',
  'Talking Heads',
  'Visual FX Frame WebGPU',
  'WebGPU EmojiRain',
  'WebGPU Weather Control',
];
const availabilityCopy = {
  de: { local: /lokal entwickelt/i, unavailable: /nicht öffentlich zum Download verfügbar/i },
  en: { local: /local builds/i, unavailable: /not available for public download/i },
  es: { local: /compilaciones locales/i, unavailable: /no están disponibles para descarga pública/i },
  fr: { local: /versions locales/i, unavailable: /ne sont pas disponibles au téléchargement public/i },
};

function localizeHomepage(lang) {
  const dom = new JSDOM(homepage, {
    url: 'https://ltth.test/index.html',
    runScripts: 'outside-only',
  });
  dom.window.fetch = async (url) => {
    const pathname = new URL(url, 'https://ltth.test').pathname;
    const match = pathname.match(/^\/locales\/(de|en|es|fr)\.json$/);
    if (match) return { ok: true, json: async () => localeFiles[match[1]] };
    return { ok: false, status: 404 };
  };
  dom.window.eval(i18nSource);
  return dom;
}

describe('closed-beta localized public availability', () => {
  test('homepage keeps the exact eleven beta app names together without download links', () => {
    const section = homepage.match(/<section class="home-closed-beta"[\s\S]*?<\/section>/)?.[0] || '';
    const names = [...section.matchAll(/<li>([^<]+)<\/li>/g)].map((match) => match[1].trim());

    expect(policy.closedBeta).toHaveLength(11);
    expect(names).toEqual(expectedNames);
    expect(section).not.toMatch(/<a\b|href\s*=/i);
  });

  test.each(LANGS)('%s homepage explicitly distinguishes local development from public downloads', async (lang) => {
    const dom = localizeHomepage(lang);
    try {
      await dom.window.I18n.init(lang);
      const section = dom.window.document.querySelector('.home-closed-beta');
      const title = section.querySelector('h2').textContent.trim();
      const description = section.querySelector('.home-closed-beta__description').textContent.trim();

      expect(title).toContain('11');
      expect(description).toBe(localeFiles[lang].homeV2.closedBeta.description);
      expect(description).toMatch(availabilityCopy[lang].local);
      expect(description).toMatch(availabilityCopy[lang].unavailable);
      expect(localeFiles[lang].homeV2.closedBeta).toBeDefined();
    } finally {
      dom.window.close();
    }
  });

  test.each(LANGS)('%s feature hub marks every listed closed-beta app as unavailable without a beta download link', (lang) => {
    const page = fs.readFileSync(path.join(ROOT, featureHubPages[lang]), 'utf8');
    const cards = [...page.matchAll(/<article\b[^>]*id="feature-([^"]+)"[^>]*>[\s\S]*?<\/article>/g)];
    const betaIds = new Set(policy.closedBeta);
    const aliases = policy.aliases || {};
    const betaCards = cards.filter((match) => {
      const id = featureCatalog.storeIdBySlug[match[1]] || match[1];
      return betaIds.has(aliases[id] || id);
    });
    const copy = featureCatalog.pageCopy[lang];

    expect(betaCards.length).toBeGreaterThan(0);
    for (const match of betaCards) {
      const card = match[0];
      expect(card).toContain('catalog-entry__availability');
      expect(card).toContain(copy.closedBetaBadge);
      expect(card).toContain(copy.closedBetaNotice);
      expect(card).not.toMatch(/<a\b/i);
    }
  });

  test('closed-beta apps have no feature-hub or mega-menu navigation CTAs; four without detail pages stay only in the homepage notice', () => {
    const aliases = policy.aliases || {};
    const canonicalId = (slug) => {
      const id = featureCatalog.storeIdBySlug[slug] || slug;
      return aliases[id] || id;
    };
    const deCards = [...fs.readFileSync(path.join(ROOT, featureHubPages.de), 'utf8')
      .matchAll(/<article\b[^>]*id="feature-([^" ]+)"[^>]*>([\s\S]*?)<\/article>/g)];
    const detailBetaIds = new Set(deCards
      .map(([, slug]) => canonicalId(slug))
      .filter((id) => policy.closedBeta.includes(id)));
    const missingDetails = policy.closedBeta.filter((id) => !detailBetaIds.has(id)).sort();
    expect(missingDetails).toEqual([
      'schnorrbecher',
      'sidekick',
      'visual-fx-frame-webgpu',
      'webgpu-weather-control',
    ]);

    const missingDetailPages = {
      schnorrbecher: 'schnorrbecher',
      sidekick: 'sidekick',
      'visual-fx-frame-webgpu': 'visual-fx-frame-webgpu',
      'webgpu-weather-control': 'webgpu-weather-control',
    };
    for (const [id, slug] of Object.entries(missingDetailPages)) {
      expect(fs.existsSync(path.join(ROOT, 'features', `${slug}.html`))).toBe(false);
      expect(homepage).toContain(expectedNames.find((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') === id) || id);
    }

    const navHrefs = [...headerTemplate.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map(([, href]) => href);
    for (const href of navHrefs) {
      const featurePath = href.match(/^\/features\/([^/.]+)\.html$/i);
      const slug = featurePath?.[1] || (href === '/streammonsters/' ? 'plugin-stream-alchemy' : null);
      if (!slug) continue;
      expect(policy.closedBeta).not.toContain(canonicalId(slug));
    }
  });

  test('sitemap-listed closed-beta detail routes keep their availability notice and never link beta packages', () => {
    const detailRoutes = [
      ['animazingpal', 'features/animazingpal.html', 'https://ltth.app/features/animazingpal.html'],
      ['interactive-story', 'features/interactive-story.html', 'https://ltth.app/features/interactive-story.html'],
      ['music-bot', 'features/plugin-music-bot.html', 'https://ltth.app/features/plugin-music-bot.html'],
      ['osc-bridge', 'features/osc-bridge.html', 'https://ltth.app/features/osc-bridge.html'],
      ['stream-monsters', 'features/plugin-stream-alchemy.html', 'https://ltth.app/features/plugin-stream-alchemy.html'],
      ['talking-heads', 'features/talking-heads.html', 'https://ltth.app/features/talking-heads.html'],
      ['webgpu-emoji-rain', 'features/emoji-rain.html', 'https://ltth.app/features/emoji-rain.html'],
      ['stream-monsters', 'streammonsters/index.html', 'https://ltth.app/streammonsters/'],
    ];

    for (const [id, relativePath, publicUrl] of detailRoutes) {
      expect(policy.closedBeta).toContain(id);
      expect(sitemap).toContain(`<loc>${publicUrl}</loc>`);
      const page = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
      expect(page).toMatch(/Closed Beta|Beta cerrada|Bêta fermée|Geschlossene Beta/i);
      const hrefs = [...page.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map(([, href]) => href);
      expect(hrefs.filter((href) => /plugin-store\/packages\/|\.zip(?:$|[?#])/i.test(href))).toEqual([]);
      expect(hrefs.some((href) => new RegExp(`${id}[^/]*\\.zip`, 'i').test(href))).toBe(false);
    }

    for (const id of ['schnorrbecher', 'sidekick', 'visual-fx-frame-webgpu', 'webgpu-weather-control']) {
      expect(policy.closedBeta).toContain(id);
      expect(sitemap.toLowerCase()).not.toContain(`/${id}.html`);
    }
    expect(sitemap.toLowerCase()).not.toContain('/streamalchemy/');
  });

  test('every localized public plugin catalog variant resolves to the same beta-free registry', () => {
    const ids = new Set(store.plugins.map((plugin) => plugin.id));
    const withdrawnIds = [...policy.closedBeta, ...Object.keys(policy.aliases), 'chatango'];

    for (const id of withdrawnIds) {
      expect(ids.has(id)).toBe(false);
      expect(store.plugins.some((plugin) => plugin.packageUrl?.toLowerCase().includes(id))).toBe(false);
    }

    for (const lang of ['en', 'es', 'fr']) {
      const page = fs.readFileSync(path.join(ROOT, `plugins-${lang}.html`), 'utf8');
      expect(page).toContain(`url=/plugins.html?lang=${lang}`);
      expect(page).not.toMatch(/plugin-store\/packages\/|\.zip/i);
    }
  });
});
