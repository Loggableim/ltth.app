'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildLiveTargets, runPluginDocsLiveVerification, validateRenderedTarget } = require('../../scripts/lib/plugin-docs-live-verifier');

describe('deployed plugin documentation verifier', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  test('plans exactly one localized live page for every guide and language', () => {
    const targets = buildLiveTargets(repoRoot, { baseUrl: 'https://ltth.app' });

    expect(targets).toHaveLength(152);
    expect(new Set(targets.map((target) => `${target.guideId}:${target.locale}`)).size).toBe(152);
    expect(targets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        guideId: 'emoji-rain',
        locale: 'fr',
        url: 'https://ltth.app/docs/plugins/emoji-rain.html?lang=fr',
        canonicalUrl: 'https://ltth.app/docs/plugins/emoji-rain.html'
      })
    ]));
  });

  test('rejects a rendered target when runtime locale, canonical metadata, or a localized screenshot drifts', () => {
    const target = buildLiveTargets(repoRoot, { baseUrl: 'https://ltth.app' })
      .find((candidate) => candidate.guideId === 'emoji-rain' && candidate.locale === 'en');
    const runtime = {
      htmlLang: target.locale,
      currentLang: target.locale,
      canonicalUrl: target.canonicalUrl,
      alternates: target.alternates,
      fields: target.fields,
      steps: target.steps.map((step) => ({ ...step, complete: true, naturalWidth: 640, naturalHeight: 560 })),
      consoleErrors: [],
      failedRequests: [],
      screenshotResponses: []
    };

    expect(validateRenderedTarget({ target, responseStatus: 200, finalUrl: target.url, runtime })).toEqual([]);
    expect(validateRenderedTarget({
      target,
      responseStatus: 200,
      finalUrl: target.url,
      runtime: {
        ...runtime,
        htmlLang: 'de',
        canonicalUrl: 'https://ltth.app/docs/plugins/wrong.html',
        steps: runtime.steps.map((step, index) => index === 0 ? { ...step, src: '/screenshots/docs/plugins/wrong.png' } : step)
      }
    })).toEqual(expect.arrayContaining([
      'html lang is de instead of en',
      'canonical URL drifted',
      `${target.steps[0].id}: localized screenshot URL drifted`
    ]));
  });

  test('writes an incomplete report when any of the 152 deployed variants fails', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-docs-live-'));
    try {
      const report = await runPluginDocsLiveVerification({
        repoRoot,
        baseUrl: 'https://ltth.app',
        outputDir,
        capture: async (target) => ({
          target,
          success: target.locale !== 'fr',
          errors: target.locale === 'fr' ? ['simulated deployed page failure'] : []
        })
      });

      expect(report).toEqual(expect.objectContaining({ targetCount: 152, completedCount: 152, success: false }));
      expect(report.results.filter((result) => !result.success)).toHaveLength(38);
      expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'report.json'), 'utf8')).success).toBe(false);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
