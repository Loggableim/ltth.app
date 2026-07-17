'use strict';

const fs = require('fs');
const path = require('path');
const { LOCALES, buildGuides } = require('../plugin-tutorial-source');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function screenshotPath(root, locale, guideId, stepId) {
  const relative = path.join('docs', 'plugins', guideId, `${stepId}.png`);
  return path.join(root, 'screenshots', locale === 'en' ? relative : path.join(locale, relative));
}

function verifyPluginDocsE2e(root) {
  const errors = [];
  const guides = buildGuides(root);
  const localeValues = Object.fromEntries(LOCALES.map((locale) => [
    locale,
    {
      ...readJson(path.join(root, 'locales', `${locale}.json`)),
      ...readJson(path.join(root, 'locales', 'guides', `${locale}.json`))
    }
  ]));

  for (const guide of guides) {
    const pagePath = path.join(root, 'docs', 'plugins', `${guide.id}.html`);
    const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, 'utf8') : '';
    if (!page) {
      errors.push(`${guide.id}: missing rendered page`);
      continue;
    }
    if (!page.includes('<meta name="viewport" content="width=device-width, initial-scale=1">')) errors.push(`${guide.id}: missing responsive viewport`);
    if (!page.includes(`<link rel="canonical" href="https://ltth.app/docs/plugins/${guide.id}.html">`)) errors.push(`${guide.id}: missing canonical URL`);
    for (const locale of LOCALES) {
      if (!page.includes(`hreflang="${locale}" href="https://ltth.app/docs/plugins/${guide.id}.html?lang=${locale}"`)) errors.push(`${guide.id}/${locale}: missing hreflang`);
      const values = localeValues[locale];
      for (const field of ['title', 'summary', 'firstResult', 'requirements', 'safety', 'troubleshooting']) {
        const key = `docs.plugin.${guide.id}.${field}`;
        if (!String(values[key] || '').trim()) errors.push(`${guide.id}/${locale}: missing ${key}`);
      }
      for (const step of guide.steps) {
        const base = `docs.plugin.${guide.id}.steps.${step.id}`;
        for (const field of ['title', 'body', 'expected', 'alt', 'src', 'caption']) {
          if (!String(values[`${base}.${field}`] || '').trim()) errors.push(`${guide.id}/${locale}/${step.id}: missing ${field}`);
        }
        const expectedSrc = locale === 'en'
          ? `/screenshots/docs/plugins/${guide.id}/${step.id}.png`
          : `/screenshots/${locale}/docs/plugins/${guide.id}/${step.id}.png`;
        if (values[`${base}.src`] !== expectedSrc) errors.push(`${guide.id}/${locale}/${step.id}: unexpected screenshot URL`);
        if (!fs.existsSync(screenshotPath(root, locale, guide.id, step.id))) errors.push(`${guide.id}/${locale}/${step.id}: screenshot is missing`);
        if (!page.includes(`data-i18n="${base}.src"`)) errors.push(`${guide.id}/${step.id}: source is not localizable`);
      }
    }
  }
  return { variants: guides.length * LOCALES.length, errors };
}

module.exports = { verifyPluginDocsE2e };
