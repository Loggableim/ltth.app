'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { LOCALES, buildGuides } = require('../plugin-tutorial-source');

const ROOT = path.resolve(__dirname, '..', '..');
const CANONICAL_BASE_URL = 'https://ltth.app';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizedBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    throw new Error('Live documentation base URL must be an HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Live documentation base URL must be an HTTP(S) URL');
  return url;
}

function localeValues(repoRoot, locale) {
  return {
    ...readJson(path.join(repoRoot, 'locales', `${locale}.json`)),
    ...readJson(path.join(repoRoot, 'locales', 'guides', `${locale}.json`))
  };
}

function targetUrl(baseUrl, guideId, locale) {
  const url = new URL(`/docs/plugins/${guideId}.html`, normalizedBaseUrl(baseUrl));
  url.searchParams.set('lang', locale);
  return url.toString();
}

function screenshotPath(locale, guideId, stepId) {
  return locale === 'en'
    ? `/screenshots/docs/plugins/${guideId}/${stepId}.png`
    : `/screenshots/${locale}/docs/plugins/${guideId}/${stepId}.png`;
}

function buildLiveTargets(repoRoot = ROOT, { baseUrl = CANONICAL_BASE_URL } = {}) {
  normalizedBaseUrl(baseUrl);
  return buildGuides(repoRoot).flatMap((guide) => LOCALES.map((locale) => {
    const values = localeValues(repoRoot, locale);
    const prefix = `docs.plugin.${guide.id}`;
    const fields = Object.fromEntries(['title', 'summary', 'firstResult', 'requirements', 'safety', 'troubleshooting']
      .map((field) => [`${prefix}.${field}`, values[`${prefix}.${field}`]]));
    const steps = guide.steps.map((step) => {
      const stepPrefix = `${prefix}.steps.${step.id}`;
      return {
        id: step.id,
        titleKey: `${stepPrefix}.title`,
        bodyKey: `${stepPrefix}.body`,
        expectedKey: `${stepPrefix}.expected`,
        captionKey: `${stepPrefix}.caption`,
        src: screenshotPath(locale, guide.id, step.id),
        title: values[`${stepPrefix}.title`],
        body: values[`${stepPrefix}.body`],
        expected: values[`${stepPrefix}.expected`],
        caption: values[`${stepPrefix}.caption`],
        alt: values[`${stepPrefix}.alt`]
      };
    });
    const canonicalUrl = `${CANONICAL_BASE_URL}/docs/plugins/${guide.id}.html`;
    return {
      guideId: guide.id,
      locale,
      url: targetUrl(baseUrl, guide.id, locale),
      canonicalUrl,
      alternates: Object.fromEntries([
        ...LOCALES.map((alternateLocale) => [alternateLocale, `${canonicalUrl}?lang=${alternateLocale}`]),
        ['x-default', canonicalUrl]
      ]),
      fields,
      steps
    };
  }));
}

function urlParts(value) {
  const url = new URL(value);
  return { origin: url.origin, pathname: url.pathname, search: url.search };
}

function expectedRelativePath(value, baseUrl) {
  const url = new URL(value, baseUrl);
  return `${url.pathname}${url.search}`;
}

function validateRenderedTarget({ target, responseStatus, finalUrl, runtime }) {
  const errors = [];
  if (responseStatus !== 200) errors.push(`HTTP ${responseStatus}`);
  try {
    const expected = urlParts(target.url);
    const actual = urlParts(finalUrl);
    if (actual.origin !== expected.origin || actual.pathname !== expected.pathname || actual.search !== expected.search) {
      errors.push('redirect or language URL drifted');
    }
  } catch (_) {
    errors.push('final URL is invalid');
  }
  if (runtime.htmlLang !== target.locale) errors.push(`html lang is ${runtime.htmlLang || 'missing'} instead of ${target.locale}`);
  if (runtime.currentLang !== target.locale) errors.push(`I18n current language is ${runtime.currentLang || 'missing'} instead of ${target.locale}`);
  if (runtime.canonicalUrl !== target.canonicalUrl) errors.push('canonical URL drifted');
  for (const [locale, url] of Object.entries(target.alternates)) {
    if (runtime.alternates?.[locale] !== url) errors.push(`hreflang ${locale} drifted`);
  }
  for (const [key, expected] of Object.entries(target.fields)) {
    if (runtime.fields?.[key] !== expected) errors.push(`${key}: localized text drifted`);
  }
  if (!Array.isArray(runtime.steps) || runtime.steps.length !== target.steps.length) {
    errors.push('rendered tutorial step count drifted');
  }
  for (const expected of target.steps) {
    const actual = runtime.steps?.find((step) => step.id === expected.id);
    if (!actual) {
      errors.push(`${expected.id}: rendered tutorial step is missing`);
      continue;
    }
    for (const field of ['title', 'body', 'expected', 'caption']) {
      if (actual[field] !== expected[field]) errors.push(`${expected.id}: localized ${field} drifted`);
    }
    if (actual.alt !== expected.alt) errors.push(`${expected.id}: localized screenshot alt drifted`);
    try {
      if (expectedRelativePath(actual.src, finalUrl) !== expectedRelativePath(expected.src, target.url)) {
        errors.push(`${expected.id}: localized screenshot URL drifted`);
      }
    } catch (_) {
      errors.push(`${expected.id}: localized screenshot URL is invalid`);
    }
    if (actual.complete !== true || Number(actual.naturalWidth) <= 1 || Number(actual.naturalHeight) <= 1) {
      errors.push(`${expected.id}: localized screenshot did not render`);
    }
  }
  if ((runtime.consoleErrors || []).length) errors.push(`console errors: ${runtime.consoleErrors.length}`);
  if ((runtime.failedRequests || []).length) errors.push(`failed requests: ${runtime.failedRequests.length}`);
  if ((runtime.screenshotResponses || []).some((entry) => entry.status < 200 || entry.status >= 300)) errors.push('localized screenshot request failed');
  return errors;
}

async function collectRuntime(page, target, { timeoutMs }) {
  await page.waitForFunction(
    (locale) => window.I18n?.currentLang === locale && document.documentElement.lang === locale,
    { timeout: timeoutMs },
    target.locale
  );
  return page.evaluate(async (payload) => {
    const text = (selector) => document.querySelector(selector)?.textContent.trim() || '';
    const byKey = (key) => text(`[data-i18n="${key}"]`);
    const images = Array.from(document.querySelectorAll('.plugin-doc-step img'));
    for (const image of images) image.scrollIntoView({ block: 'center' });
    await Promise.all(images.map((image) => image.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      })
    ));
    return {
      htmlLang: document.documentElement.lang,
      currentLang: window.I18n?.currentLang || '',
      canonicalUrl: document.querySelector('link[rel="canonical"]')?.href || '',
      alternates: Object.fromEntries(Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'))
        .map((element) => [element.hreflang, element.href])),
      fields: Object.fromEntries(payload.fieldKeys.map((key) => [key, byKey(key)])),
      steps: payload.steps.map((step) => {
        const root = document.querySelector(`.plugin-doc-step[data-step-id="${step.id}"]`);
        const image = root?.querySelector('img');
        return {
          id: step.id,
          title: byKey(step.titleKey),
          body: byKey(step.bodyKey),
          expected: byKey(step.expectedKey),
          caption: byKey(step.captionKey),
          src: image?.src || '',
          alt: image?.alt || '',
          complete: image?.complete === true,
          naturalWidth: image?.naturalWidth || 0,
          naturalHeight: image?.naturalHeight || 0
        };
      })
    };
  }, { fieldKeys: Object.keys(target.fields), steps: target.steps });
}

function verifyRenderedPng(filePath) {
  const image = fs.readFileSync(filePath);
  if (image.length < 2048 || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Rendered live documentation screenshot is invalid');
  }
  return { bytes: image.length, sha256: crypto.createHash('sha256').update(image).digest('hex') };
}

async function captureLiveTarget({ target, browser, outputDir, timeoutMs = 60000 }) {
  const page = await browser.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  const screenshotResponses = [];
  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCacheEnabled(false);
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'failed' }));
    page.on('response', (response) => {
      if (new URL(response.url()).pathname.includes('/screenshots/')) screenshotResponses.push({ url: response.url(), status: response.status() });
    });
    const response = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const runtime = await collectRuntime(page, target, { timeoutMs });
    runtime.consoleErrors = consoleErrors;
    runtime.failedRequests = failedRequests;
    runtime.screenshotResponses = screenshotResponses;
    const errors = validateRenderedTarget({ target, responseStatus: response?.status(), finalUrl: page.url(), runtime });
    const screenshotPath = path.join(outputDir, target.guideId, `${target.locale}.png`);
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, type: 'png' });
    const render = verifyRenderedPng(screenshotPath);
    return {
      target,
      success: errors.length === 0,
      errors,
      responseStatus: response?.status() || null,
      finalUrl: page.url(),
      render: { path: path.relative(outputDir, screenshotPath).replace(/\\/g, '/'), ...render }
    };
  } catch (error) {
    return { target, success: false, errors: [error.message] };
  } finally {
    await page.close();
  }
}

async function runPluginDocsLiveVerification({
  repoRoot = ROOT,
  baseUrl = CANONICAL_BASE_URL,
  outputDir,
  browser,
  capture
} = {}) {
  if (!outputDir) throw new Error('Live documentation verifier requires an output directory');
  const targets = buildLiveTargets(repoRoot, { baseUrl });
  const results = [];
  const captureTarget = capture || ((target) => captureLiveTarget({ target, browser, outputDir }));
  for (const target of targets) {
    try {
      results.push(await captureTarget(target));
    } catch (error) {
      results.push({ target, success: false, errors: [error.message] });
    }
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseUrl: normalizedBaseUrl(baseUrl).toString(),
    targetCount: targets.length,
    completedCount: results.length,
    success: results.length === targets.length && results.every((result) => result.success),
    results
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

module.exports = {
  buildLiveTargets,
  captureLiveTarget,
  runPluginDocsLiveVerification,
  validateRenderedTarget
};
