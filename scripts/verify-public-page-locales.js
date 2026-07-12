'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const de = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', 'de.json'), 'utf8'));
function getValue(values, key) {
  if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
  return key.split('.').reduce((current, segment) => current && current[segment], values);
}
const pages = {
  roadmap: ['roadmap.hero.title', 'roadmap.hero.description', 'roadmap.h2.5', 'roadmap.h2.6', 'roadmap.p.6', 'roadmap.h2.7', 'roadmap.next.bugfixing', 'roadmap.next.performance', 'roadmap.next.documentation', 'roadmap.next.security', 'roadmap.next.features', 'roadmap.h2.8', 'roadmap.h2.9', 'roadmap.p.10', 'roadmap.h3.11', 'roadmap.p.12', 'roadmap.a.13'],
  thanks: ['thank-you.hero.title', 'thank-you.span.3', 'thank-you.hero.description', 'thank-you.h2.5', 'thank-you.p.6', 'thank-you.p.7', 'thank-you.p.8', 'thank-you.a.9', 'thank-you.h3.10', 'thank-you.a.11', 'thank-you.a.12', 'thank-you.p.13', 'thank-you.a.14', 'thank-you.a.15', 'thank-you.a.16', 'thank-you.p.17', 'thank-you.p.18'],
  support: ['support-the-developement.hero.title', 'support-the-developement.prefix', 'support-the-developement.span.3', 'support-the-developement.hero.description', 'support-the-developement.h2.5', 'support-the-developement.p.6', 'support-the-developement.h3.7', 'support-the-developement.h3.8', 'support-the-developement.p.9', 'support-the-developement.paypal.button', 'support-the-developement.p.10', 'support-the-developement.a.11', 'support-the-developement.a.12', 'support-the-developement.a.13', 'support-the-developement.p.14', 'generated.8e57fee25af2', 'generated.58d83dd8d869', 'generated.87c2ca5af795', 'generated.3cf85b0b5e8c', 'generated.754737f98c6d', 'support.h2.17', 'support.p.18', 'support.a.19'],
  download: ['generated.a53cfd65051f', 'generated.f9f38fb586ec', 'generated.3fb09a299dd9', 'generated.0478c88a023b', 'generated.5e535d52d364', 'generated.c9ece29182cd', 'generated.0b254578d1f1', 'generated.19f28bcc7cd0', 'generated.d66428ba7dd0', 'generated.7b22e5989c8c', 'generated.4de73f440f03', 'generated.71dd8d4beffc', 'generated.a35fa060a254', 'generated.e39780be321c', 'generated.d68a81ea3124', 'generated.0381a283429c', 'generated.a941f7f345fd', 'generated.af1519e73e3e', 'generated.fb2c6423ac1c'],
  faq: ['faq.h2.5', 'faq.h2.38', 'faq.h2.49', 'faq.h2.61', 'faq.h2.72', 'faq.h2.84', 'faq.p.32', 'faq.p.41', 'faq.p.45', 'faq.p.52', 'faq.p.56', 'faq.p.60', 'faq.p.64', 'faq.p.68', 'faq.p.71', 'faq.p.78', 'faq.p.82', 'faq.p.87', 'faq.p.90', 'faq.p.93', 'faq.p.95', 'faq.a.21', 'faq.a.26', 'faq.a.37', 'faq.a.42', 'faq.a.53', 'faq.a.57', 'faq.a.65', 'faq.a.96', 'faq.a.98', 'faq.h2.100', 'faq.h3.101', 'faq.p.102', 'faq.h3.103', 'faq.p.104']
};
const errors = [];
const expectedValues = {
  de: { 'thank-you.a.1': 'Zum Inhalt springen', 'support-the-developement.a.1': 'Zum Inhalt springen', 'support.a.1': 'Zum Inhalt springen' },
  en: { 'thank-you.a.1': 'Skip to main content', 'support-the-developement.a.1': 'Skip to main content', 'support.a.1': 'Skip to main content' },
  es: { 'thank-you.a.1': 'Ir al contenido principal', 'support-the-developement.a.1': 'Ir al contenido principal', 'support.a.1': 'Ir al contenido principal' },
  fr: { 'thank-you.a.1': 'Aller au contenu principal', 'support-the-developement.a.1': 'Aller au contenu principal', 'support.a.1': 'Aller au contenu principal' }
};
for (const [locale, expectations] of Object.entries(expectedValues)) {
  const values = locale === 'de' ? de : JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', `${locale}.json`), 'utf8'));
  for (const [key, expected] of Object.entries(expectations)) {
    if (values[key] !== expected) errors.push(`Incorrect ${locale} skip-navigation copy: ${key}`);
  }
}
const structuralChecks = [
  ['thank-you.html', /<p[^>]*data-i18n="thank-you\.p\.8"[^>]*data-i18n-html/, 'required', 'must render the roadmap sentence as trusted HTML so its link is preserved'],
  ['thank-you.html', /<p\s+data-i18n="thank-you\.p\.7"/, 'forbidden', 'must not translate the paragraph and its nested strong element with the same key'],
  ['thank-you.html', /<p\s+data-i18n="thank-you\.p\.17"/, 'forbidden', 'must not translate the paragraph and its nested strong element with the same key'],
  ['support-the-developement.html', /<p\s+data-i18n="support-the-developement\.(p\.10|p\.14)"/, 'forbidden', 'must not translate a paragraph and its nested strong element with the same key'],
  ['thank-you.html', /<h1[^>]*data-i18n="thank-you\.hero\.title"/, 'forbidden', 'must not translate a hero heading and its nested highlight with overlapping keys'],
  ['support-the-developement.html', /<h1[^>]*data-i18n="support-the-developement\.hero\.title"/, 'forbidden', 'must not translate a hero heading and its nested highlight with overlapping keys'],
  ['support-the-developement.html', /<input[^>]+paypalobjects\.com[^>]+btn_donate_LG\.gif/, 'forbidden', 'must use a localizable PayPal submit button instead of a language-locked image'],
  ['faq.html', /<h2[^>]*data-i18n="faq\.h2\.100"/, 'required', 'must localize the follow-up FAQ section heading'],
  ['faq.html', /<h3[^>]*data-i18n="faq\.h3\.101"/, 'required', 'must localize the tutorial follow-up question'],
  ['faq.html', /<h3[^>]*data-i18n="faq\.h3\.103"/, 'required', 'must localize the support follow-up question']
  ,['roadmap.html', /<p[^>]*data-i18n="roadmap\.p\.6"/, 'required', 'must localize the current project status']
];
for (const [file, pattern, mode, reason] of structuralChecks) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (mode === 'required' ? !pattern.test(source) : pattern.test(source)) {
    errors.push(`${file} ${reason}`);
  }
}
for (const locale of ['en', 'es', 'fr']) {
  const values = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', `${locale}.json`), 'utf8'));
  for (const [page, keys] of Object.entries(pages)) {
    for (const key of keys) {
      const value = getValue(values, key);
      const source = getValue(de, key);
      if (!value) errors.push(`Missing ${locale} ${page} copy: ${key}`);
      else if (value === source) errors.push(`Unlocalized ${locale} ${page} copy: ${key}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('OK: roadmap, thank-you, development-support, and FAQ content is localized in EN, ES, and FR.');
}
