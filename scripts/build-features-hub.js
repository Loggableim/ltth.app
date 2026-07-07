'use strict';

const fs = require('fs');
const path = require('path');

const catalog = require('../features/catalog-data.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const FEATURES_DIR = path.join(REPO_ROOT, 'features');
const OUTPUT_PAGES = {
  de: path.join(FEATURES_DIR, 'index.html'),
  en: path.join(REPO_ROOT, 'features-en.html'),
  es: path.join(REPO_ROOT, 'features-es.html'),
  fr: path.join(REPO_ROOT, 'features-fr.html'),
};
const PAGE_URLS = {
  de: '/features/',
  en: '/features-en.html',
  es: '/features-es.html',
  fr: '/features-fr.html',
};
const OG_LOCALES = {
  de: 'de_DE',
  en: 'en_US',
  es: 'es_ES',
  fr: 'fr_FR',
};
const LANGS = ['de', 'en', 'es', 'fr'];
const FEATURE_OVERVIEW_IMAGE = '/screenshots/features/dashboard-main.png';
const SITE_NAME = 'ltth.app';
const SITE_URL = 'https://ltth.app';
const SKIP_LABELS = {
  de: 'Zum Hauptinhalt springen',
  en: 'Skip to main content',
  es: 'Saltar al contenido principal',
  fr: 'Aller au contenu principal',
};

const store = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'plugin-store.json'), 'utf8'));
const storeById = new Map((store.plugins || []).map(plugin => [plugin.id, plugin]));

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    hellip: '…',
  };

  return String(value || '')
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
      if (entity[0] === '#') {
        const codePoint = entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }
      return Object.prototype.hasOwnProperty.call(named, entity) ? named[entity] : match;
    });
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripSiteSuffix(title) {
  return normalizeWhitespace(
    decodeEntities(title)
      .replace(/\s*[–-]\s*PupCid's Little TikTool Helper.*$/i, '')
      .replace(/\s*[–-]\s*ltth\.app.*$/i, '')
      .replace(/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF]+\s*/gu, '')
  );
}

function readFeatureDetail(slug) {
  const filePath = path.join(FEATURES_DIR, `${slug}.html`);
  const html = readFile(filePath);
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*class="feature-hero-title"[^>]*>([\s\S]*?)<\/h1>/i);
  const metaDescriptionMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i);
  const ogDescriptionMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i);
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)];
  const screenshots = [];

  for (const match of imgTags) {
    const tag = match[0];
    const srcMatch = tag.match(/\bsrc="([^"]+)"/i);
    if (!srcMatch) continue;
    const src = srcMatch[1];
    if (!src.includes('/screenshots/features/')) continue;
    if (screenshots.some(item => item.src === src)) continue;
    screenshots.push({ src });
  }

  return {
    slug,
    title: stripSiteSuffix(decodeEntities(h1Match ? h1Match[1] : titleMatch ? titleMatch[1] : slug)),
    metaDescription: normalizeWhitespace(decodeEntities(metaDescriptionMatch ? metaDescriptionMatch[1] : '')),
    ogDescription: normalizeWhitespace(decodeEntities(ogDescriptionMatch ? ogDescriptionMatch[1] : '')),
    screenshots: screenshots.filter(item => exists(path.join(REPO_ROOT, item.src.replace(/^\//, '')))),
  };
}

function getDescription(slug, lang, detail, storeItem) {
  const manual = catalog.manualSummaries[slug];
  if (storeItem && storeItem.description && storeItem.description[lang]) {
    return normalizeWhitespace(decodeEntities(storeItem.description[lang]));
  }
  if (manual && manual[lang]) {
    return normalizeWhitespace(decodeEntities(manual[lang]));
  }
  if (lang === 'de' && detail.metaDescription) {
    return detail.metaDescription;
  }
  if (detail.metaDescription) {
    return detail.metaDescription;
  }
  if (storeItem && storeItem.description && storeItem.description.en) {
    return normalizeWhitespace(decodeEntities(storeItem.description.en));
  }
  if (manual && manual.en) {
    return normalizeWhitespace(decodeEntities(manual.en));
  }
  return '';
}

function getTitle(detail, storeItem) {
  return normalizeWhitespace(detail.title || (storeItem && storeItem.name && storeItem.name.en) || '');
}

function screenshotDescriptor(src, lang) {
  const file = path.basename(src, path.extname(src)).toLowerCase();
  const order = [
    ['vision', { de: 'Barrierefreie Ansicht', en: 'Accessibility view', es: 'Vista de accesibilidad', fr: "Vue d'accessibilité" }],
    ['contrast', { de: 'Kontrastansicht', en: 'High-contrast view', es: 'Vista de alto contraste', fr: 'Vue à contraste élevé' }],
    ['night', { de: 'Nachtansicht', en: 'Night view', es: 'Vista nocturna', fr: 'Vue de nuit' }],
    ['admin', { de: 'Admin-Ansicht', en: 'Admin view', es: 'Vista de administración', fr: "Vue d'administration" }],
    ['settings', { de: 'Einstellungen', en: 'Settings view', es: 'Vista de ajustes', fr: 'Vue des paramètres' }],
    ['dashboard', { de: 'Dashboard-Ansicht', en: 'Dashboard view', es: 'Vista del panel', fr: 'Vue du tableau de bord' }],
    ['preview', { de: 'Vorschau', en: 'Preview', es: 'Vista previa', fr: 'Aperçu' }],
    ['overview', { de: 'Übersicht', en: 'Overview', es: 'Resumen', fr: 'Vue d’ensemble' }],
    ['main', { de: 'Hauptansicht', en: 'Main view', es: 'Vista principal', fr: 'Vue principale' }],
    ['detail', { de: 'Detailansicht', en: 'Detail view', es: 'Vista detallada', fr: 'Vue détaillée' }],
    ['editor', { de: 'Editoransicht', en: 'Editor view', es: 'Vista del editor', fr: "Vue de l’éditeur" }],
    ['overlay', { de: 'Overlay-Ansicht', en: 'Overlay view', es: 'Vista de overlay', fr: 'Vue de l’overlay' }],
    ['capture', { de: 'Capture-Ansicht', en: 'Capture view', es: 'Vista de captura', fr: 'Vue de capture' }],
    ['render', { de: 'Renderansicht', en: 'Render view', es: 'Vista de renderizado', fr: 'Vue de rendu' }],
    ['scene', { de: 'Szenenansicht', en: 'Scene view', es: 'Vista de escena', fr: 'Vue de scène' }],
    ['leaderboard', { de: 'Leaderboard-Ansicht', en: 'Leaderboard view', es: 'Vista de clasificación', fr: 'Vue du classement' }],
    ['obs', { de: 'OBS-Ansicht', en: 'OBS view', es: 'Vista OBS', fr: 'Vue OBS' }],
    ['url', { de: 'URL-Ansicht', en: 'URL view', es: 'Vista de URL', fr: "Vue de l'URL" }],
  ];

  for (const [needle, labels] of order) {
    if (file.includes(needle)) {
      return labels[lang] || labels.en;
    }
  }

  return {
    de: 'Übersicht',
    en: 'Overview',
    es: 'Resumen',
    fr: 'Vue d’ensemble',
  }[lang] || 'Overview';
}

function buildFeatureCatalog(lang) {
  const slugEntries = fs
    .readdirSync(FEATURES_DIR)
    .filter(file => file.endsWith('.html') && file !== 'index.html')
    .map(file => path.basename(file, '.html'));

  const collator = new Intl.Collator(lang, { sensitivity: 'base' });

  const items = slugEntries.map((slug) => {
    const detail = readFeatureDetail(slug);
    const storeId = catalog.storeIdBySlug[slug];
    const storeItem = storeId ? storeById.get(storeId) : null;
    const categoryId = catalog.itemCategoryBySlug[slug] || 'system';
    const category = catalog.categories.find(entry => entry.id === categoryId) || catalog.categories[0];
    const title = getTitle(detail, storeItem);
    const description = getDescription(slug, lang, detail, storeItem);
    const screenshots = detail.screenshots.slice(0, 5).map((shot, index) => {
      const label = screenshotDescriptor(shot.src, lang);
      const alt = `${title} - ${label}`;
      const caption = `${label}`;
      return {
        src: shot.src,
        alt,
        caption,
        index,
      };
    });
    const searchIndex = [
      slug,
      title,
      description,
      category.label[lang],
      category.intro[lang],
      category.benefit[lang],
      category.context[lang],
      ...screenshots.map(shot => `${shot.alt} ${shot.caption}`),
    ].join(' ').toLowerCase();

    return {
      slug,
      title,
      description,
      categoryId,
      category,
      screenshots,
      href: `/features/${slug}.html`,
      searchIndex,
    };
  });

  items.sort((a, b) => collator.compare(a.title, b.title));

  const grouped = catalog.categories.map((category) => {
    const categoryItems = items.filter(item => item.categoryId === category.id);
    return {
      ...category,
      items: categoryItems,
    };
  });

  return {
    items,
    grouped,
  };
}

function renderListItem(item, position) {
  return {
    '@type': 'ListItem',
    position,
    url: `${SITE_URL}${item.href}`,
    name: item.title,
    description: item.description,
  };
}

function renderHead(lang, page, itemCount, screenshotCount, structuredDataJson) {
  const url = `${SITE_URL}${PAGE_URLS[lang]}`;
  const alternates = LANGS.map(code => `<link rel="alternate" hreflang="${code}" href="${SITE_URL}${PAGE_URLS[code]}">`).join('\n  ');
  const localeAlternates = LANGS
    .filter(code => code !== lang)
    .map(code => `<meta property="og:locale:alternate" content="${OG_LOCALES[code]}">`)
    .join('\n  ');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeAttr(page.description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="theme-color" content="#12a116">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeAttr(page.title)}">
  <meta property="og:description" content="${escapeAttr(page.description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE_URL}${FEATURE_OVERVIEW_IMAGE}">
  <meta property="og:locale" content="${OG_LOCALES[lang]}">
  ${localeAlternates}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(page.title)}">
  <meta name="twitter:description" content="${escapeAttr(page.description)}">
  <meta name="twitter:image" content="${SITE_URL}${FEATURE_OVERVIEW_IMAGE}">
  <link rel="canonical" href="${url}">
  ${alternates}
  <link rel="alternate" hreflang="x-default" href="${SITE_URL}/features/">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="stylesheet" href="/css/layout.css">
  <link rel="stylesheet" href="/css/features-hub.css">
  <script>
    (function() {
      var params = new URLSearchParams(window.location.search);
      var lang = params.get('lang');
      var targets = { en: '/features-en.html', es: '/features-es.html', fr: '/features-fr.html' };
      if ((window.location.pathname === '/features/' || window.location.pathname === '/features' || window.location.pathname === '/features/index.html') && lang && targets[lang]) {
        window.location.replace(targets[lang]);
      }
    })();
  </script>
  <script type="application/ld+json">
  ${structuredDataJson}
  </script>
</head>`;
}

function renderHero(lang, page, itemCount, screenshotCount) {
  return `
  <section class="catalog-hero">
    <div class="catalog-hero__inner">
      <div class="catalog-hero__copy">
        <p class="catalog-eyebrow">${escapeHtml(page.eyebrow)}</p>
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="catalog-hero__lead">${escapeHtml(page.intro)}</p>
        <div class="catalog-stats" aria-label="${escapeAttr(page.itemListName)}">
          <div class="catalog-stat">
            <strong>${itemCount}</strong>
            <span>${escapeHtml(page.resultsLabel)}</span>
          </div>
          <div class="catalog-stat">
            <strong>${screenshotCount}</strong>
            <span>${escapeHtml(page.screenshotsLabel)}</span>
          </div>
          <div class="catalog-stat">
            <strong>DE/EN/ES/FR</strong>
            <span>${escapeHtml(page.tocLabel)}</span>
          </div>
        </div>
        <div class="catalog-actions">
          <a class="btn btn-primary btn-large" href="/download.html">${escapeHtml(page.ctaDownload)}</a>
          <a class="btn btn-secondary btn-large" href="/docs.html">${escapeHtml(page.ctaDocs)}</a>
          <a class="btn btn-secondary btn-large" href="/">${escapeHtml(page.ctaHome)}</a>
        </div>
      </div>
      <div class="catalog-hero__panel">
        <h2>${escapeHtml(page.itemListName)}</h2>
        <p>${escapeHtml(page.itemListDescription)}</p>
        <ul class="catalog-hero__notes">
          <li>${itemCount} ${escapeHtml(page.resultsLabel)}</li>
          <li>${screenshotCount} ${escapeHtml(page.screenshotsLabel)}</li>
          <li>DE / EN / ES / FR</li>
        </ul>
      </div>
    </div>
  </section>`;
}

function renderToolbar(lang, page, itemCount, grouped) {
  const jumpLinks = grouped
    .map(category => `<a href="#${category.id}">${escapeHtml(category.label[lang])}</a>`)
    .join('\n      ');

  return `
  <section class="catalog-toolbar">
    <div class="catalog-toolbar__inner">
      <form class="catalog-search" role="search">
        <label class="sr-only" for="catalog-search-input">${escapeHtml(page.searchLabel)}</label>
        <input id="catalog-search-input" type="search" data-catalog-search-input aria-label="${escapeAttr(page.searchLabel)}" placeholder="${escapeAttr(page.searchPlaceholder)}">
        <button type="button" class="btn btn-secondary" data-catalog-clear hidden>${escapeHtml(page.clearSearch)}</button>
      </form>
      <p class="catalog-results" aria-live="polite"><strong data-catalog-results>${itemCount}</strong> ${escapeHtml(page.resultsLabel)}</p>
      <nav class="catalog-jump" aria-label="${escapeAttr(page.jumpLabel)}">
        ${jumpLinks}
      </nav>
    </div>
  </section>`;
}

function renderToc(lang, page, grouped) {
  const tocLinks = grouped.map(category => `
        <li>
          <a href="#${category.id}">
            <span>${escapeHtml(category.label[lang])}</span>
            <span class="catalog-toc__count">${category.items.length}</span>
          </a>
        </li>`).join('');

  return `
    <aside class="catalog-toc">
      <h2>${escapeHtml(page.tocLabel)}</h2>
      <p>${escapeHtml(page.itemListDescription)}</p>
      <ul class="catalog-toc__list">
        ${tocLinks}
      </ul>
    </aside>`;
}

function renderShot(shot) {
  return `
      <figure class="catalog-shot">
        <img src="${escapeAttr(shot.src)}" alt="${escapeAttr(shot.alt)}" loading="lazy" decoding="async">
        <figcaption>${escapeHtml(shot.caption)}</figcaption>
      </figure>`;
}

function renderItem(page, lang, item, category) {
  const shotCountLabel = `${item.screenshots.length} ${escapeHtml(page.screenshotsLabel)}`;
  const gallery = item.screenshots.map(renderShot).join('');
  const searchIndex = escapeAttr(item.searchIndex);

  return `
      <article id="feature-${escapeAttr(item.slug)}" class="catalog-entry" data-catalog-entry data-search-index="${searchIndex}">
        <div class="catalog-entry__body">
          <div class="catalog-entry__header">
            <div>
              <p class="catalog-entry__kicker">${escapeHtml(category.label[lang])}</p>
              <h3>${escapeHtml(item.title)}</h3>
            </div>
            <a class="catalog-entry__link" href="${escapeAttr(item.href)}">${escapeHtml(page.deepDiveLabel)}</a>
          </div>
          <p class="catalog-entry__description">${escapeHtml(item.description)}</p>
          <dl class="catalog-entry__meta">
            <div>
              <dt>${escapeHtml(page.entryBenefitLabel)}</dt>
              <dd>${escapeHtml(category.benefit[lang])}</dd>
            </div>
            <div>
              <dt>${escapeHtml(page.entryContextLabel)}</dt>
              <dd>${escapeHtml(category.context[lang])}</dd>
            </div>
          </dl>
          <div class="catalog-entry__footer">
            <span class="catalog-entry__count">${shotCountLabel}</span>
            <a class="catalog-entry__link" href="${escapeAttr(item.href)}">${escapeHtml(page.deepDiveLabel)}</a>
          </div>
        </div>
        <div class="catalog-entry__gallery">
          ${gallery}
        </div>
      </article>`;
}

function renderSection(page, lang, section) {
  const items = section.items.map(item => renderItem(page, lang, item, section)).join('');
  return `
    <section id="${escapeAttr(section.id)}" class="catalog-section" data-catalog-section>
      <div class="catalog-section__head">
        <p class="catalog-section__eyebrow">${escapeHtml(section.label[lang])}</p>
        <h2>${escapeHtml(section.label[lang])}</h2>
        <p class="catalog-section__summary">${escapeHtml(section.intro[lang])}</p>
        <div class="catalog-section__meta">
          <span class="catalog-pill">${escapeHtml(section.benefit[lang])}</span>
          <span class="catalog-pill">${escapeHtml(section.context[lang])}</span>
          <span class="catalog-pill catalog-section__count"><span data-catalog-section-count>${section.items.length}</span> / <span data-catalog-section-total>${section.items.length}</span></span>
        </div>
      </div>
      <div class="catalog-entries">
        ${items}
      </div>
    </section>`;
}

function renderPage(lang, page, catalogData) {
  const grouped = catalogData.grouped;
  const itemCount = catalogData.items.length;
  const screenshotCount = catalogData.items.reduce((total, item) => total + item.screenshots.length, 0);
  const sectionsHtml = grouped.map(section => renderSection(page, lang, section)).join('\n');
  const tocHtml = renderToc(lang, page, grouped);
  const structuredDataJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: page.title,
        description: page.description,
        url: `${SITE_URL}${PAGE_URLS[lang]}`,
        inLanguage: lang,
        isPartOf: {
          '@type': 'WebSite',
          name: SITE_NAME,
          url: SITE_URL,
        },
      },
      {
        '@type': 'ItemList',
        name: page.itemListName,
        description: page.itemListDescription,
        inLanguage: lang,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: itemCount,
        itemListElement: catalogData.items.map((item, index) => renderListItem(item, index + 1)),
      },
    ],
  }, null, 2);
  const head = renderHead(lang, page, itemCount, screenshotCount, structuredDataJson);
  const hero = renderHero(lang, page, itemCount, screenshotCount);
  const toolbar = renderToolbar(lang, page, itemCount, grouped);

  return `${head}
<body class="features-hub">
  <a href="#main-content" class="skip-to-content">${escapeHtml(page.skipToContent || SKIP_LABELS[lang] || 'Skip to main content')}</a>
  <main id="main-content" class="catalog-root" data-catalog-root>
    ${hero}
    ${toolbar}
    <div class="catalog-layout">
      ${tocHtml}
      <div class="catalog-content">
        ${sectionsHtml}
      </div>
    </div>
    <p class="catalog-empty" data-catalog-empty hidden>${escapeHtml(page.noResults)}</p>
  </main>
  <script src="/js/main.js"></script>
  <script src="/js/i18n.js"></script>
  <script src="/js/features-hub.js"></script>
  <script src="/js/layout.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', async () => {
      if (window.LTTHLayout) await LTTHLayout.init();
      if (window.I18n) I18n.init(window.__ltthLang || '${lang}');
    });
  </script>
</body>
</html>`;
}

function writePage(lang) {
  const pageCopy = catalog.pageCopy[lang];
  const data = buildFeatureCatalog(lang);
  const html = renderPage(lang, pageCopy, data);
  fs.writeFileSync(OUTPUT_PAGES[lang], html, 'utf8');
}

function main() {
  LANGS.forEach(writePage);
  console.log(`Built features hub pages for ${LANGS.join(', ')}`);
}

main();
