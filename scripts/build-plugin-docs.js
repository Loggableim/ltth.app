'use strict';

const fs = require('fs');
const path = require('path');
const { LOCALES, buildCatalog, localizedAccess, localizedCategory } = require('./plugin-tutorial-catalog');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'plugins');
const BASE = 'docs.plugin';

function esc(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function key(id, suffix) { return `${BASE}.${id}.${suffix}`; }
function imagePath(locale, id, step) { return locale === 'en' ? `/screenshots/docs/plugins/${id}/${step}.png` : `/screenshots/${locale}/docs/plugins/${id}/${step}.png`; }

function put(locales, name, values) { for (const locale of LOCALES) locales[locale][name] = values[locale]; }

function buildLocales(catalog) {
  const values = Object.fromEntries(LOCALES.map((locale) => [locale, {}]));
  put(values, 'docs.hub.metaTitle', { de: 'LTTH Dokumentation und Plugin-Tutorials', en: 'LTTH documentation and plugin tutorials', es: 'Documentación y tutoriales de plugins de LTTH', fr: 'Documentation et tutoriels de plugins LTTH' });
  put(values, 'docs.hub.title', { de: 'Plugin-Tutorials', en: 'Plugin tutorials', es: 'Tutoriales de plugins', fr: 'Tutoriels des plugins' });
  put(values, 'docs.hub.intro', { de: 'Wähle ein Plugin und folge jeder bebilderten Aktion von der Aktivierung bis zum sicheren Test.', en: 'Choose a plugin and follow every illustrated action from activation through safe testing.', es: 'Elige un plugin y sigue cada acción ilustrada desde la activación hasta la prueba segura.', fr: 'Choisissez un plugin et suivez chaque action illustrée, de l’activation au test sécurisé.' });
  put(values, 'docs.hub.search', { de: 'Plugin-Tutorial suchen…', en: 'Search plugin tutorials…', es: 'Buscar tutoriales de plugins…', fr: 'Rechercher des tutoriels de plugins…' });
  put(values, 'docs.hub.all', { de: 'Alle Kategorien', en: 'All categories', es: 'Todas las categorías', fr: 'Toutes les catégories' });
  put(values, 'docs.hub.none', { de: 'Kein Tutorial passt zu dieser Suche.', en: 'No tutorial matches this search.', es: 'Ningún tutorial coincide con esta búsqueda.', fr: 'Aucun tutoriel ne correspond à cette recherche.' });
  put(values, 'docs.hub.open', { de: 'Tutorial öffnen', en: 'Open tutorial', es: 'Abrir tutorial', fr: 'Ouvrir le tutoriel' });
  put(values, 'docs.plugin.breadcrumb.docs', { de: 'Dokumentation', en: 'Documentation', es: 'Documentación', fr: 'Documentation' });
  put(values, 'docs.plugin.overview', { de: 'Überblick', en: 'Overview', es: 'Resumen', fr: 'Aperçu' });
  put(values, 'docs.plugin.requirements', { de: 'Voraussetzungen und Sicherheit', en: 'Requirements and safety', es: 'Requisitos y seguridad', fr: 'Prérequis et sécurité' });
  put(values, 'docs.plugin.steps', { de: 'Schritt für Schritt', en: 'Step by step', es: 'Paso a paso', fr: 'Pas à pas' });
  put(values, 'docs.plugin.expected', { de: 'Erwartetes Ergebnis', en: 'Expected result', es: 'Resultado esperado', fr: 'Résultat attendu' });
  put(values, 'docs.plugin.troubleshooting', { de: 'Troubleshooting', en: 'Troubleshooting', es: 'Solución de problemas', fr: 'Dépannage' });
  put(values, 'docs.plugin.back', { de: 'Alle Plugin-Tutorials', en: 'All plugin tutorials', es: 'Todos los tutoriales de plugins', fr: 'Tous les tutoriels de plugins' });

  for (const tutorial of catalog) {
    const local = tutorial.localized;
    put(values, key(tutorial.id, 'title'), Object.fromEntries(LOCALES.map((locale) => [locale, tutorial.name])));
    put(values, key(tutorial.id, 'summary'), Object.fromEntries(LOCALES.map((locale) => [locale, local[locale].summary])));
    put(values, key(tutorial.id, 'requirements'), Object.fromEntries(LOCALES.map((locale) => [locale, local[locale].requirements])));
    put(values, key(tutorial.id, 'troubleshooting'), Object.fromEntries(LOCALES.map((locale) => [locale, local[locale].trouble])));
    put(values, key(tutorial.id, 'status'), Object.fromEntries(LOCALES.map((locale) => [locale, `${localizedCategory(tutorial.category, locale)} · ${localizedAccess(tutorial.access, locale)}`])));
    for (const [index, [stepId, copy]] of Object.entries(Object.entries(tutorial.steps))) {
      const ordinal = Number(index) + 1;
      put(values, key(tutorial.id, `steps.${stepId}.title`), Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale][stepId][0]])));
      put(values, key(tutorial.id, `steps.${stepId}.body`), Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale][stepId][1]])));
      put(values, key(tutorial.id, `steps.${stepId}.expected`), Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale][stepId][2]])));
      put(values, key(tutorial.id, `steps.${stepId}.caption`), Object.fromEntries(LOCALES.map((locale) => [locale, `${ordinal}. ${copy[locale][stepId][0]}`])));
      put(values, key(tutorial.id, `steps.${stepId}.alt`), Object.fromEntries(LOCALES.map((locale) => [locale, `${tutorial.name}: ${copy[locale][stepId][0]}`])));
      put(values, key(tutorial.id, `steps.${stepId}.src`), Object.fromEntries(LOCALES.map((locale) => [locale, imagePath(locale, tutorial.id, stepId)])));
    }
  }
  return values;
}

function page(tutorial, locales) {
  const de = locales.de;
  const steps = Object.keys(tutorial.steps).map((stepId, index) => `
        <li class="plugin-doc-step">
          <div class="plugin-doc-step__copy"><span class="plugin-doc-step__number">${index + 1}</span><h2 data-i18n="${key(tutorial.id, `steps.${stepId}.title`)}">${esc(de[key(tutorial.id, `steps.${stepId}.title`)])}</h2><p data-i18n="${key(tutorial.id, `steps.${stepId}.body`)}">${esc(de[key(tutorial.id, `steps.${stepId}.body`)])}</p><p class="plugin-doc-step__expected"><strong data-i18n="docs.plugin.expected">${esc(de['docs.plugin.expected'])}</strong> <span data-i18n="${key(tutorial.id, `steps.${stepId}.expected`)}">${esc(de[key(tutorial.id, `steps.${stepId}.expected`)])}</span></p></div>
          <figure><img loading="lazy" width="1280" height="800" class="feature-screenshot" data-i18n="${key(tutorial.id, `steps.${stepId}.src`)}" data-i18n-attr="src" data-i18n-alt="${key(tutorial.id, `steps.${stepId}.alt`)}" src="${esc(de[key(tutorial.id, `steps.${stepId}.src`)])}" alt="${esc(de[key(tutorial.id, `steps.${stepId}.alt`)])}"><figcaption data-i18n="${key(tutorial.id, `steps.${stepId}.caption`)}">${esc(de[key(tutorial.id, `steps.${stepId}.caption`)])}</figcaption></figure>
        </li>`).join('');
  return `<!DOCTYPE html>
<html lang="de" data-lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title data-i18n="${key(tutorial.id, 'title')}">${esc(tutorial.name)} – LTTH Docs</title>
<meta name="description" content="${esc(de[key(tutorial.id, 'summary')])}">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32x32.png">
<link rel="canonical" href="https://ltth.app/docs/plugins/${tutorial.id}.html">
${LOCALES.map((locale) => `<link rel="alternate" hreflang="${locale}" href="https://ltth.app/docs/plugins/${tutorial.id}.html?lang=${locale}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="https://ltth.app/docs/plugins/${tutorial.id}.html">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(tutorial.name)} – LTTH Docs"><meta property="og:description" content="${esc(de[key(tutorial.id, 'summary')])}"><meta property="og:image" content="https://ltth.app${imagePath('en', tutorial.id, Object.keys(tutorial.steps)[0])}">
<link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/layout.css?v=menu-20260712a"><link rel="stylesheet" href="/css/docs.css"><link rel="stylesheet" href="/css/site-v2.css?v=site-v2-20260712a"></head>
<body class="site-v2"><a class="skip-to-content" href="#main-content" data-i18n="homeV2.skip">${esc(de['homeV2.skip'])}</a><main id="main-content" class="plugin-doc-page"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/docs.html" data-i18n="docs.plugin.breadcrumb.docs">${esc(de['docs.plugin.breadcrumb.docs'])}</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current" data-i18n="${key(tutorial.id, 'title')}">${esc(tutorial.name)}</span></nav>
<header class="plugin-doc-hero"><p class="plugin-doc-hero__eyebrow" data-i18n="${key(tutorial.id, 'status')}">${esc(de[key(tutorial.id, 'status')])}</p><h1 data-i18n="${key(tutorial.id, 'title')}">${esc(tutorial.name)}</h1><p data-i18n="${key(tutorial.id, 'summary')}">${esc(de[key(tutorial.id, 'summary')])}</p></header>
<section class="plugin-doc-section"><h2 data-i18n="docs.plugin.requirements">${esc(de['docs.plugin.requirements'])}</h2><p data-i18n="${key(tutorial.id, 'requirements')}">${esc(de[key(tutorial.id, 'requirements')])}</p></section>
<section class="plugin-doc-section"><h2 data-i18n="docs.plugin.steps">${esc(de['docs.plugin.steps'])}</h2><ol class="plugin-doc-steps">${steps}</ol></section>
<section class="plugin-doc-section"><h2 data-i18n="docs.plugin.troubleshooting">${esc(de['docs.plugin.troubleshooting'])}</h2><p data-i18n="${key(tutorial.id, 'troubleshooting')}">${esc(de[key(tutorial.id, 'troubleshooting')])}</p></section>
<p><a class="btn btn-secondary" href="/docs.html" data-i18n="docs.plugin.back">${esc(de['docs.plugin.back'])}</a></p></main><script src="/js/main.js"></script><script src="/js/i18n.js"></script><script src="/js/layout.js?v=site-v2-20260712a"></script><script>document.addEventListener('DOMContentLoaded',async()=>{if(window.LTTHLayout)await LTTHLayout.init();if(window.I18n)await I18n.init(window.__ltthLang||'de');});</script></body></html>\n`;
}

function updateSitemap(catalog) {
  const file = path.join(ROOT, 'sitemap.xml');
  const text = fs.readFileSync(file, 'utf8');
  const start = '<!-- GENERATED PLUGIN DOCS START -->';
  const end = '<!-- GENERATED PLUGIN DOCS END -->';
  const urls = catalog.map((tutorial) => `  <url>\n    <loc>https://ltth.app/docs/plugins/${tutorial.id}.html</loc>\n    <lastmod>2026-07-11</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n${LOCALES.map((locale) => `    <xhtml:link rel="alternate" hreflang="${locale}" href="https://ltth.app/docs/plugins/${tutorial.id}.html?lang=${locale}"/>`).join('\n')}\n  </url>`).join('\n');
  const block = `${start}\n${urls}\n${end}`;
  const next = text.includes(start) ? text.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block) : text.replace('</urlset>', `${block}\n</urlset>`);
  fs.writeFileSync(file, next, 'utf8');
}

function main() {
  const catalog = buildCatalog(ROOT);
  if (catalog.length !== 37) throw new Error(`Expected 37 tutorials, received ${catalog.length}`);
  const locales = buildLocales(catalog);
  fs.mkdirSync(OUT, { recursive: true });
  for (const tutorial of catalog) fs.writeFileSync(path.join(OUT, `${tutorial.id}.html`), page(tutorial, locales), 'utf8');
  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(catalog.map((tutorial) => ({ id: tutorial.id, name: tutorial.name, category: tutorial.category, access: tutorial.access, devStatus: tutorial.devStatus, storeAvailable: tutorial.storeAvailable, image: Object.fromEntries(LOCALES.map((locale) => [locale, imagePath(locale, tutorial.id, 'activate')])), translations: Object.fromEntries(LOCALES.map((locale) => [locale, { title: tutorial.name, summary: tutorial.localized[locale].summary }])) })), null, 2)}\n`, 'utf8');
  for (const locale of LOCALES) {
    const file = path.join(ROOT, 'locales', `${locale}.json`);
    const current = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [name, value] of Object.entries(locales[locale])) current[name] = value;
    fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  }
  updateSitemap(catalog);
  console.log(`Built ${catalog.length} plugin tutorial pages in four locales.`);
}

main();
