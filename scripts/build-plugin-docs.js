'use strict';

const fs = require('fs');
const path = require('path');
const { LOCALES, buildGuides } = require('./plugin-tutorial-source');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'plugins');
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const key = (id, suffix) => `docs.plugin.${id}.${suffix}`;
const imagePath = (locale, id, stepId) => locale === 'en'
  ? `/screenshots/docs/plugins/${id}/${stepId}.png`
  : `/screenshots/${locale}/docs/plugins/${id}/${stepId}.png`;

const LABELS = {
  de: { contents: 'Inhalt', result: 'Dein erstes Ergebnis', requirements: 'Voraussetzungen', safety: 'Sicherheitsgrenzen', steps: 'Schritt für Schritt', expected: 'Daran erkennst du den Erfolg:', obs: 'Overlay und OBS', obsIntro: 'Füge diese URL erst in eine nicht gesendete OBS-Testszene als Browser-Quelle ein.', troubleshooting: 'Fehlerbehebung', related: 'Nächste passende Tutorials', back: 'Alle Plugin-Tutorials', status: 'Status' },
  en: { contents: 'Contents', result: 'Your first result', requirements: 'Requirements', safety: 'Safety boundaries', steps: 'Step by step', expected: 'Success signal:', obs: 'Overlay and OBS', obsIntro: 'Add this URL as a browser source in an OBS test scene that is not live first.', troubleshooting: 'Troubleshooting', related: 'Next relevant tutorials', back: 'All plugin tutorials', status: 'Status' },
  es: { contents: 'Contenido', result: 'Tu primer resultado', requirements: 'Requisitos', safety: 'Límites de seguridad', steps: 'Paso a paso', expected: 'Señal de éxito:', obs: 'Overlay y OBS', obsIntro: 'Añade primero esta URL como fuente de navegador en una escena de prueba de OBS que no esté al aire.', troubleshooting: 'Solución de problemas', related: 'Siguientes tutoriales relevantes', back: 'Todos los tutoriales de plugins', status: 'Estado' },
  fr: { contents: 'Sommaire', result: 'Votre premier résultat', requirements: 'Prérequis', safety: 'Limites de sécurité', steps: 'Pas à pas', expected: 'Signe de réussite :', obs: 'Overlay et OBS', obsIntro: 'Ajoutez d’abord cette URL comme source navigateur dans une scène de test OBS non diffusée.', troubleshooting: 'Dépannage', related: 'Tutoriels pertinents suivants', back: 'Tous les tutoriels de plugins', status: 'Statut' }
};

const STATUS_LABELS = {
  de: { 'early-version': 'Frühe Version', 'working-beta': 'Funktionsfähige Beta', available: 'Verfügbar', 'development-beta': 'Entwicklungs-Beta', stable: 'Stabil', 'admin-only': 'Nur Administration' },
  en: { 'early-version': 'Early version', 'working-beta': 'Working beta', available: 'Available', 'development-beta': 'Development beta', stable: 'Stable', 'admin-only': 'Administration only' },
  es: { 'early-version': 'Versión inicial', 'working-beta': 'Beta funcional', available: 'Disponible', 'development-beta': 'Beta de desarrollo', stable: 'Estable', 'admin-only': 'Solo administración' },
  fr: { 'early-version': 'Version précoce', 'working-beta': 'Bêta fonctionnelle', available: 'Disponible', 'development-beta': 'Bêta de développement', stable: 'Stable', 'admin-only': 'Administration uniquement' }
};

const HUB_COPY = {
  de: { metaDescription: 'Vollständige LTTH-Dokumentation mit bebilderten Schritt-für-Schritt-Tutorials für jedes Plugin.', safeTitle: 'LTTH sicher starten', installTitle: '1. Installieren', installBody: 'Nutze den Windows Launcher oder den passenden One-Line-Installer. Der Launcher richtet die Laufzeit ein und öffnet anschließend das lokale Dashboard.', profileTitle: '2. Testprofil verwenden', profileBody: 'Aktiviere und konfiguriere Plugins zuerst mit Testwerten. Externe Geräte, Konten und LIVE-Ausgaben bleiben bis zur Abnahme deaktiviert.', obsTitle: '3. In OBS übernehmen', obsBody: 'Übernimm eine Overlay-URL erst nach einer lokalen Vorschau. Prüfe Auflösung, Sichtbarkeit und Audio in einer Testszene.' },
  en: { metaDescription: 'Complete LTTH documentation with illustrated step-by-step tutorials for every plugin.', safeTitle: 'Start LTTH safely', installTitle: '1. Install', installBody: 'Use the Windows Launcher or the matching one-line installer. The launcher prepares the runtime and then opens the local dashboard.', profileTitle: '2. Use a test profile', profileBody: 'Enable and configure plugins with test values first. Keep external devices, accounts, and LIVE output disabled until review.', obsTitle: '3. Add it to OBS', obsBody: 'Use an overlay URL only after a local preview. Check resolution, visibility, and audio in a test scene.' },
  es: { metaDescription: 'Documentación completa de LTTH con tutoriales ilustrados paso a paso para cada plugin.', safeTitle: 'Inicia LTTH de forma segura', installTitle: '1. Instala', installBody: 'Usa el Launcher de Windows o el instalador de una línea correspondiente. El launcher prepara el entorno y abre el panel local.', profileTitle: '2. Usa un perfil de prueba', profileBody: 'Activa y configura primero los plugins con valores de prueba. Mantén desactivados los dispositivos externos, las cuentas y la salida LIVE hasta la revisión.', obsTitle: '3. Añádelo a OBS', obsBody: 'Usa una URL de overlay solo después de una vista previa local. Comprueba resolución, visibilidad y audio en una escena de prueba.' },
  fr: { metaDescription: 'Documentation LTTH complète avec des tutoriels illustrés pas à pas pour chaque plugin.', safeTitle: 'Démarrer LTTH en toute sécurité', installTitle: '1. Installer', installBody: 'Utilisez le Launcher Windows ou le programme d’installation en une ligne adapté. Le launcher prépare l’environnement puis ouvre le tableau de bord local.', profileTitle: '2. Utiliser un profil de test', profileBody: 'Activez et configurez d’abord les plugins avec des valeurs de test. Gardez les appareils externes, comptes et sorties LIVE désactivés jusqu’à la validation.', obsTitle: '3. Ajouter dans OBS', obsBody: 'Utilisez une URL d’overlay uniquement après un aperçu local. Vérifiez la résolution, la visibilité et l’audio dans une scène de test.' }
};

function localizedStatus(locale, status) {
  return STATUS_LABELS[locale][status] || STATUS_LABELS[locale].available;
}

function definitionLabels(locale) {
  return {
    de: { purpose: 'Zweck und Zielgruppe', activation: 'Aktivierung und Navigation', workflows: 'Verifizierte Workflows', settings: 'Referenz der sichtbaren Controls', integrations: 'Schnittstellen und Integrationen', controls: 'UI-Inventar', defaultValue: 'Standard im Testprofil', values: 'Werte und Grenzen', dependencies: 'Abhaengigkeiten', checks: 'Pruefschritte', resolution: 'Loesung', documentedIn: 'Dokumentiert in' },
    en: { purpose: 'Purpose and audience', activation: 'Activation and navigation', workflows: 'Verified workflows', settings: 'Visible-control reference', integrations: 'Interfaces and integrations', controls: 'UI inventory', defaultValue: 'Test-profile default', values: 'Values and limits', dependencies: 'Dependencies', checks: 'Checks', resolution: 'Resolution', documentedIn: 'Documented in' },
    es: { purpose: 'Objetivo y publico', activation: 'Activacion y navegacion', workflows: 'Flujos verificados', settings: 'Referencia de controles visibles', integrations: 'Interfaces e integraciones', controls: 'Inventario de la UI', defaultValue: 'Valor del perfil de prueba', values: 'Valores y limites', dependencies: 'Dependencias', checks: 'Comprobaciones', resolution: 'Solucion', documentedIn: 'Documentado en' },
    fr: { purpose: 'Objectif et public', activation: 'Activation et navigation', workflows: 'Flux verifies', settings: 'Reference des controles visibles', integrations: 'Interfaces et integrations', controls: 'Inventaire de l interface', defaultValue: 'Valeur du profil de test', values: 'Valeurs et limites', dependencies: 'Dependances', checks: 'Verifications', resolution: 'Resolution', documentedIn: 'Documente dans' }
  }[locale];
}

function add(values, name, byLocale) {
  for (const locale of LOCALES) values[locale][name] = byLocale[locale];
}

function buildLocales(guides) {
  const values = Object.fromEntries(LOCALES.map((locale) => [locale, {}]));
  for (const locale of LOCALES) {
    for (const [name, value] of Object.entries(LABELS[locale])) values[locale][`docs.plugin.${name}`] = value;
    values[locale]['docs.plugin.breadcrumb.docs'] = locale === 'de' ? 'Dokumentation' : locale === 'en' ? 'Documentation' : locale === 'es' ? 'Documentación' : 'Documentation';
    values[locale]['docs.plugin.version'] = locale === 'de' ? 'Version' : locale === 'en' ? 'Version' : locale === 'es' ? 'Versión' : 'Version';
    values[locale]['docs.plugin.breadcrumb.label'] = locale === 'de' ? 'Brotkrümelnavigation' : locale === 'en' ? 'Breadcrumb navigation' : locale === 'es' ? 'Navegación de migas de pan' : 'Fil d’Ariane';
    for (const [name, value] of Object.entries(HUB_COPY[locale])) values[locale][`docs.hub.${name}`] = value;
    for (const [name, value] of Object.entries(definitionLabels(locale))) values[locale][`docs.plugin.definition.${name}`] = value;
  }
  for (const guide of guides) {
    for (const field of ['title', 'summary', 'firstResult', 'requirements', 'safety', 'troubleshooting']) add(values, key(guide.id, field), Object.fromEntries(LOCALES.map((locale) => [locale, guide.copy[locale][field]])));
    add(values, key(guide.id, 'status'), Object.fromEntries(LOCALES.map((locale) => [locale, localizedStatus(locale, guide.devStatus)])));
    add(values, key(guide.id, 'overlay.url'), Object.fromEntries(LOCALES.map((locale) => [locale, guide.overlay || ''])));
    const definition = guide.definition;
    add(values, key(guide.id, 'purpose'), definition.metadata.purpose);
    add(values, key(guide.id, 'audience'), definition.metadata.audience);
    add(values, key(guide.id, 'activation.navigation'), definition.activation.navigation);
    for (const workflow of definition.workflows) {
      add(values, key(guide.id, `workflows.${workflow.id}.title`), workflow.title);
      add(values, key(guide.id, `workflows.${workflow.id}.summary`), workflow.summary);
    }
    for (const [index, setting] of definition.settingsReference.entries()) {
      add(values, key(guide.id, `settings.${index}.purpose`), setting.purpose);
      add(values, key(guide.id, `settings.${index}.defaultValue`), setting.defaultValue);
      add(values, key(guide.id, `settings.${index}.values`), setting.values);
      add(values, key(guide.id, `settings.${index}.dependencies`), setting.dependencies);
    }
    for (const [index, integration] of definition.integrations.entries()) {
      add(values, key(guide.id, `integrations.${index}.description`), integration.description);
    }
    for (const [index, entry] of definition.troubleshooting.entries()) {
      add(values, key(guide.id, `troubleshooting.${index}.symptom`), entry.symptom);
      add(values, key(guide.id, `troubleshooting.${index}.resolution`), entry.resolution);
      for (const locale of LOCALES) values[locale][key(guide.id, `troubleshooting.${index}.checks`)] = entry.checks[locale].join(' ');
    }
    for (const [index, control] of definition.visibleControls.entries()) {
      const step = guide.steps.find((candidate) => candidate.id === control.stepId);
      add(values, key(guide.id, `controls.${index}.mapping`), Object.fromEntries(LOCALES.map((locale) => [locale, step ? step.copy[locale].title : control.section])));
    }
    for (const [stepIndex, step] of guide.steps.entries()) {
      for (const field of ['title', 'body', 'expected', 'alt']) add(values, key(guide.id, `steps.${step.id}.${field}`), Object.fromEntries(LOCALES.map((locale) => [locale, step.copy[locale][field]])));
      add(values, key(guide.id, `steps.${step.id}.src`), Object.fromEntries(LOCALES.map((locale) => [locale, imagePath(locale, guide.id, step.id)])));
      add(values, key(guide.id, `steps.${step.id}.caption`), Object.fromEntries(LOCALES.map((locale) => [locale, `${stepIndex + 1}. ${step.copy[locale].title}`])));
    }
  }
  return values;
}

function stepMarkup(guide, step, index, values) {
  const de = values.de;
  return `<li class="plugin-doc-step" id="step-${escapeHtml(step.id)}" data-step-id="${escapeHtml(step.id)}">
    <div class="plugin-doc-step__copy"><span class="plugin-doc-step__number">${index + 1}</span><h2 data-i18n="${key(guide.id, `steps.${step.id}.title`)}">${escapeHtml(de[key(guide.id, `steps.${step.id}.title`)])}</h2><p data-i18n="${key(guide.id, `steps.${step.id}.body`)}">${escapeHtml(de[key(guide.id, `steps.${step.id}.body`)])}</p><p class="plugin-doc-step__expected"><strong data-i18n="docs.plugin.expected">${escapeHtml(de['docs.plugin.expected'])}</strong> <span data-i18n="${key(guide.id, `steps.${step.id}.expected`)}">${escapeHtml(de[key(guide.id, `steps.${step.id}.expected`)])}</span></p></div>
    <figure><img loading="lazy" width="640" height="560" class="feature-screenshot" data-i18n="${key(guide.id, `steps.${step.id}.src`)}" data-i18n-attr="src" data-i18n-alt="${key(guide.id, `steps.${step.id}.alt`)}" src="${escapeHtml(de[key(guide.id, `steps.${step.id}.src`)])}" alt="${escapeHtml(de[key(guide.id, `steps.${step.id}.alt`)])}"><figcaption data-i18n="${key(guide.id, `steps.${step.id}.caption`)}">${escapeHtml(de[key(guide.id, `steps.${step.id}.caption`)])}</figcaption></figure>
  </li>`;
}

function definitionMarkup(guide, values) {
  const de = values.de;
  const definition = guide.definition;
  const label = (name) => `docs.plugin.definition.${name}`;
  const detail = (name, value) => `<p><strong data-i18n="${label(name)}">${escapeHtml(de[label(name)])}</strong> <span data-i18n="${value}">${escapeHtml(de[value])}</span></p>`;
  const workflows = definition.workflows.map((workflow) => `<article class="plugin-doc-reference-item" data-workflow-id="${escapeHtml(workflow.id)}"><h3 data-i18n="${key(guide.id, `workflows.${workflow.id}.title`)}">${escapeHtml(de[key(guide.id, `workflows.${workflow.id}.title`)])}</h3><p data-i18n="${key(guide.id, `workflows.${workflow.id}.summary`)}">${escapeHtml(de[key(guide.id, `workflows.${workflow.id}.summary`)])}</p><ol>${workflow.stepIds.map((stepId) => `<li><a href="#step-${escapeHtml(stepId)}">${escapeHtml(stepId)}</a></li>`).join('')}</ol></article>`).join('');
  const settings = definition.settingsReference.map((setting, index) => `<article class="plugin-doc-reference-item" data-control-selector="${escapeHtml(setting.selector)}"><h3><code>${escapeHtml(setting.selector)}</code></h3>${detail('defaultValue', key(guide.id, `settings.${index}.defaultValue`))}${detail('values', key(guide.id, `settings.${index}.values`))}${detail('dependencies', key(guide.id, `settings.${index}.dependencies`))}<p data-i18n="${key(guide.id, `settings.${index}.purpose`)}">${escapeHtml(de[key(guide.id, `settings.${index}.purpose`)])}</p></article>`).join('');
  const integrations = definition.integrations.map((integration, index) => `<li><code>${escapeHtml(integration.value)}</code> - <span data-i18n="${key(guide.id, `integrations.${index}.description`)}">${escapeHtml(de[key(guide.id, `integrations.${index}.description`)])}</span></li>`).join('');
  const controls = definition.visibleControls.map((control, index) => `<li><code>${escapeHtml(control.selector)}</code> - <span data-i18n="docs.plugin.definition.documentedIn">${escapeHtml(de['docs.plugin.definition.documentedIn'])}</span> <a href="#${escapeHtml(control.section)}" data-i18n="${key(guide.id, `controls.${index}.mapping`)}">${escapeHtml(de[key(guide.id, `controls.${index}.mapping`)])}</a></li>`).join('');
  const troubleshooting = definition.troubleshooting.map((entry, index) => `<article class="plugin-doc-reference-item"><h3 data-i18n="${key(guide.id, `troubleshooting.${index}.symptom`)}">${escapeHtml(de[key(guide.id, `troubleshooting.${index}.symptom`)])}</h3>${detail('checks', key(guide.id, `troubleshooting.${index}.checks`))}${detail('resolution', key(guide.id, `troubleshooting.${index}.resolution`))}</article>`).join('');
  return `<section class="plugin-doc-section" id="guide-purpose" data-guide-section="purpose"><h2 data-i18n="docs.plugin.definition.purpose">${escapeHtml(de['docs.plugin.definition.purpose'])}</h2><p data-i18n="${key(guide.id, 'purpose')}">${escapeHtml(de[key(guide.id, 'purpose')])}</p><p data-i18n="${key(guide.id, 'audience')}">${escapeHtml(de[key(guide.id, 'audience')])}</p></section><section class="plugin-doc-section" id="guide-activation" data-guide-section="activation"><h2 data-i18n="docs.plugin.definition.activation">${escapeHtml(de['docs.plugin.definition.activation'])}</h2><p data-i18n="${key(guide.id, 'activation.navigation')}">${escapeHtml(de[key(guide.id, 'activation.navigation')])}</p><p><code>${escapeHtml(definition.activation.route)}</code></p></section><section class="plugin-doc-section" id="guide-workflows" data-guide-section="workflows"><h2 data-i18n="docs.plugin.definition.workflows">${escapeHtml(de['docs.plugin.definition.workflows'])}</h2>${workflows}</section><section class="plugin-doc-section" id="guide-settings" data-guide-section="settings"><h2 data-i18n="docs.plugin.definition.settings">${escapeHtml(de['docs.plugin.definition.settings'])}</h2>${settings}</section><section class="plugin-doc-section" id="guide-integrations" data-guide-section="integrations"><h2 data-i18n="docs.plugin.definition.integrations">${escapeHtml(de['docs.plugin.definition.integrations'])}</h2><ul>${integrations}</ul></section><section class="plugin-doc-section" id="guide-controls" data-guide-section="controls"><h2 data-i18n="docs.plugin.definition.controls">${escapeHtml(de['docs.plugin.definition.controls'])}</h2><ul>${controls}</ul></section><section class="plugin-doc-section" id="guide-troubleshooting" data-guide-section="troubleshooting"><h2 data-i18n="docs.plugin.troubleshooting">${escapeHtml(de['docs.plugin.troubleshooting'])}</h2>${troubleshooting}</section>`;
}

function legacyGuidePage(guide, values, byId) {
  const de = values.de;
  const steps = guide.steps.map((step, index) => stepMarkup(guide, step, index, values)).join('\n');
  const toc = guide.steps.map((step, index) => `<li><a href="#step-${escapeHtml(step.id)}" data-i18n="${key(guide.id, `steps.${step.id}.title`)}">${index + 1}. ${escapeHtml(de[key(guide.id, `steps.${step.id}.title`)])}</a></li>`).join('');
  const related = guide.related.filter((id) => byId.has(id)).map((id) => `<li><a href="/docs/plugins/${id}.html" data-i18n="${key(id, 'title')}">${escapeHtml(byId.get(id).name)}</a></li>`).join('');
  const overlay = guide.overlay ? `<section class="plugin-doc-section plugin-doc-obs"><h2 data-i18n="docs.plugin.obs">${escapeHtml(de['docs.plugin.obs'])}</h2><p data-i18n="docs.plugin.obsIntro">${escapeHtml(de['docs.plugin.obsIntro'])}</p><code data-i18n="${key(guide.id, 'overlay.url')}">${escapeHtml(guide.overlay)}</code></section>` : '';
  return `<!DOCTYPE html><html lang="de" data-lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${escapeHtml(guide.copy.de.summary)}"><title data-i18n="${key(guide.id, 'title')}">${escapeHtml(guide.name)} – LTTH Docs</title><link rel="canonical" href="https://ltth.app/docs/plugins/${guide.id}.html">${LOCALES.map((locale) => `<link rel="alternate" hreflang="${locale}" href="https://ltth.app/docs/plugins/${guide.id}.html?lang=${locale}">`).join('')}<link rel="alternate" hreflang="x-default" href="https://ltth.app/docs/plugins/${guide.id}.html"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(guide.name)} – LTTH Docs"><meta property="og:description" content="${escapeHtml(guide.copy.de.summary)}"><meta property="og:image" content="https://ltth.app${imagePath('en', guide.id, guide.steps[0].id)}"><link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/layout.css?v=menu-20260712a"><link rel="stylesheet" href="/css/docs.css"><link rel="stylesheet" href="/css/site-v2.css?v=site-v2-20260712a"></head><body class="site-v2"><a class="skip-to-content" href="#main-content" data-i18n="homeV2.skip">Zum Inhalt springen</a><main id="main-content" class="plugin-doc-page"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/docs.html" data-i18n="docs.plugin.breadcrumb.docs">${escapeHtml(de['docs.plugin.breadcrumb.docs'])}</a><span class="breadcrumb-sep">›</span><span class="breadcrumb-current" data-i18n="${key(guide.id, 'title')}">${escapeHtml(guide.name)}</span></nav><header class="plugin-doc-hero"><p class="plugin-doc-hero__eyebrow" data-i18n="${key(guide.id, 'status')}">${escapeHtml(de[key(guide.id, 'status')])}</p><h1 data-i18n="${key(guide.id, 'title')}">${escapeHtml(guide.name)}</h1><p data-i18n="${key(guide.id, 'summary')}">${escapeHtml(de[key(guide.id, 'summary')])}</p><dl class="plugin-doc-meta"><div><dt data-i18n="docs.plugin.status">${escapeHtml(de['docs.plugin.status'])}</dt><dd data-i18n="${key(guide.id, 'status')}">${escapeHtml(de[key(guide.id, 'status')])}</dd></div><div><dt>Version</dt><dd>${escapeHtml(guide.version)}</dd></div></dl></header><section class="plugin-doc-section plugin-doc-first-result"><h2 data-i18n="docs.plugin.result">${escapeHtml(de['docs.plugin.result'])}</h2><p data-i18n="${key(guide.id, 'firstResult')}">${escapeHtml(de[key(guide.id, 'firstResult')])}</p></section><aside class="plugin-doc-toc"><h2 data-i18n="docs.plugin.contents">${escapeHtml(de['docs.plugin.contents'])}</h2><ol>${toc}</ol></aside><section class="plugin-doc-section"><h2 data-i18n="docs.plugin.requirements">${escapeHtml(de['docs.plugin.requirements'])}</h2><p data-i18n="${key(guide.id, 'requirements')}">${escapeHtml(de[key(guide.id, 'requirements')])}</p></section><section class="plugin-doc-section plugin-doc-safety"><h2 data-i18n="docs.plugin.safety">${escapeHtml(de['docs.plugin.safety'])}</h2><p data-i18n="${key(guide.id, 'safety')}">${escapeHtml(de[key(guide.id, 'safety')])}</p></section><section class="plugin-doc-section"><h2 data-i18n="docs.plugin.steps">${escapeHtml(de['docs.plugin.steps'])}</h2><ol class="plugin-doc-steps">${steps}</ol></section>${overlay}<section class="plugin-doc-section"><h2 data-i18n="docs.plugin.troubleshooting">${escapeHtml(de['docs.plugin.troubleshooting'])}</h2><p data-i18n="${key(guide.id, 'troubleshooting')}">${escapeHtml(de[key(guide.id, 'troubleshooting')])}</p></section>${related ? `<section class="plugin-doc-section"><h2 data-i18n="docs.plugin.related">${escapeHtml(de['docs.plugin.related'])}</h2><ul>${related}</ul></section>` : ''}<p><a class="btn btn-secondary" href="/docs.html" data-i18n="docs.plugin.back">${escapeHtml(de['docs.plugin.back'])}</a></p></main><script src="/js/main.js"></script><script src="/js/i18n.js"></script><script src="/js/layout.js?v=site-v2-20260712a"></script><script>document.addEventListener('DOMContentLoaded',async()=>{if(window.LTTHLayout)await LTTHLayout.init();if(window.I18n)await I18n.init(window.__ltthLang||'de');});</script></body></html>\n`;
}

function guidePage(guide, values, byId) {
  const marker = '<section class="plugin-doc-section"><h2 data-i18n="docs.plugin.steps">';
  const withoutLegacyTroubleshooting = legacyGuidePage(guide, values, byId).replace(
    /<section class="plugin-doc-section"><h2 data-i18n="docs\.plugin\.troubleshooting">[\s\S]*?<\/section>(?=(?:<section class="plugin-doc-section"><h2 data-i18n="docs\.plugin\.related"|<p><a class="btn))/,
    ''
  );
  if (!withoutLegacyTroubleshooting.includes(marker)) throw new Error(`Plugin guide page marker is missing for ${guide.id}`);
  return withoutLegacyTroubleshooting.replace(marker, `${definitionMarkup(guide, values)}${marker}`);
}

function updateSitemap(guides) {
  const file = path.join(ROOT, 'sitemap.xml');
  const text = fs.readFileSync(file, 'utf8');
  const start = '<!-- GENERATED PLUGIN DOCS START -->';
  const end = '<!-- GENERATED PLUGIN DOCS END -->';
  const urls = guides.map((guide) => `  <url>\n    <loc>https://ltth.app/docs/plugins/${guide.id}.html</loc>\n    <lastmod>2026-07-13</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n${LOCALES.map((locale) => `    <xhtml:link rel="alternate" hreflang="${locale}" href="https://ltth.app/docs/plugins/${guide.id}.html?lang=${locale}"/>`).join('\n')}\n  </url>`).join('\n');
  const block = `${start}\n${urls}\n${end}`;
  fs.writeFileSync(file, text.includes(start) ? text.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block) : text.replace('</urlset>', `${block}\n</urlset>`), 'utf8');
}

function removeStaleGuidePages(guides) {
  const guideIds = new Set(guides.map((guide) => guide.id));
  for (const entry of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const id = entry.name.slice(0, -'.html'.length);
    if (!guideIds.has(id)) fs.rmSync(path.join(OUT, entry.name));
  }
}

function removeStaleGuideTranslations(current, guides) {
  const guideIds = new Set(guides.map((guide) => guide.id));
  for (const name of Object.keys(current)) {
    const match = name.match(/^docs\.plugin\.([a-z0-9-]+)\./);
    if (match && !guideIds.has(match[1])) delete current[name];
  }
}

function main() {
  const guides = buildGuides(ROOT);
  const values = buildLocales(guides);
  const byId = new Map(guides.map((guide) => [guide.id, guide]));
  fs.mkdirSync(OUT, { recursive: true });
  removeStaleGuidePages(guides);
  for (const guide of guides) fs.writeFileSync(path.join(OUT, `${guide.id}.html`), guidePage(guide, values, byId), 'utf8');
  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(guides.map((guide) => ({ id: guide.id, name: guide.name, category: guide.category, access: guide.devStatus, devStatus: guide.devStatus, storeAvailable: guide.id === 'store-admin' || fs.existsSync(path.join(ROOT, 'plugin-store', 'packages', `${guide.id}.zip`)), image: Object.fromEntries(LOCALES.map((locale) => [locale, imagePath(locale, guide.id, guide.steps[0].id)])), translations: Object.fromEntries(LOCALES.map((locale) => [locale, { title: guide.copy[locale].title, summary: guide.copy[locale].summary, firstResult: guide.copy[locale].firstResult }])) })), null, 2)}\n`, 'utf8');
  for (const locale of LOCALES) {
    const file = path.join(ROOT, 'locales', `${locale}.json`);
    const current = JSON.parse(fs.readFileSync(file, 'utf8'));
    removeStaleGuideTranslations(current, guides);
    Object.assign(current, values[locale]);
    fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  }
  updateSitemap(guides);
  console.log(`Built ${guides.length} detailed plugin tutorial pages in four locales.`);
}

main();
