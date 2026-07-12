'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const de = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', 'de.json'), 'utf8'));
const pages = {
  roadmap: ['roadmap.hero.title', 'roadmap.hero.description', 'roadmap.h2.5', 'roadmap.h2.7', 'roadmap.p.10', 'roadmap.h3.11', 'roadmap.p.12', 'roadmap.a.13'],
  thanks: ['thank-you.hero.title', 'thank-you.hero.description', 'thank-you.h2.5', 'thank-you.h3.10', 'thank-you.a.11', 'thank-you.a.14'],
  support: ['support-the-developement.hero.title', 'support-the-developement.hero.description', 'support-the-developement.h2.5', 'support-the-developement.h3.7', 'support-the-developement.a.13', 'support.h2.17', 'support.p.18', 'support.a.19'],
  faq: ['faq.h2.5', 'faq.h2.38', 'faq.h2.49', 'faq.h2.61', 'faq.h2.72', 'faq.h2.84', 'faq.p.32', 'faq.p.41', 'faq.p.45', 'faq.p.52', 'faq.p.56', 'faq.p.60', 'faq.p.64', 'faq.p.68', 'faq.p.71']
};
const errors = [];
for (const locale of ['en', 'es', 'fr']) {
  const values = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', `${locale}.json`), 'utf8'));
  for (const [page, keys] of Object.entries(pages)) {
    for (const key of keys) {
      if (!values[key]) errors.push(`Missing ${locale} ${page} copy: ${key}`);
      else if (values[key] === de[key]) errors.push(`Unlocalized ${locale} ${page} copy: ${key}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('OK: roadmap, thank-you, and development-support content is localized in EN, ES, and FR.');
}
