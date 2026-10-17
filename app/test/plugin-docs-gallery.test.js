'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildPluginDocsGallery } = require('../../scripts/build-plugin-docs-gallery');
const { verifyPluginDocsGallery } = require('../../scripts/verify-plugin-docs-gallery');

describe('plugin documentation QA gallery', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  let outputDir = null;

  beforeEach(() => {
    outputDir = null;
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-docs-gallery-'));
  });

  afterEach(() => {
    if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true });
    outputDir = null;
  });

  test('indexes all current validated receipts while keeping human review pending', () => {
    const result = buildPluginDocsGallery({ repoRoot, outputDir });
    const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'report.json'), 'utf8'));
    const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');

    expect(result).toEqual(expect.objectContaining({ screenshotCount: 612, guideCount: 27 }));
    expect(report).toEqual(expect.objectContaining({
      reviewStatus: 'pending',
      guides: 27,
      locales: ['de', 'en', 'es', 'fr'],
      screenshots: 612,
      receipts: 612,
      rawOutputs: 612,
      expected: 612,
      currentValid: 612,
      stale: 0,
      missing: 0,
      invalid: 0,
      incomplete: 0,
      captureFailures: 0,
      coverageComplete: true,
      obs: expect.objectContaining({ expected: 68, records: 0 })
    }));
    expect(html).toContain('data-plugin');
    expect(html).toContain('data-locale');
    expect(html).toContain('reviewStatus');
    expect(html).toContain('612/612 current valid screenshots');
    expect(html).toContain('0 stale');
    expect(html).not.toContain('streamalchemy');
    expect(html).not.toContain('visual-fx-frame-webgpu');
    expect(html).not.toContain('webgpu-weather-control');
    expect(html).toContain('rel="icon"');
    expect(() => verifyPluginDocsGallery({ repoRoot, outputDir })).toThrow('not approved');
  });

  test('requires explicit human confirmation and still blocks while OBS coverage is missing', () => {
    buildPluginDocsGallery({ repoRoot, outputDir });
    const approve = (options) => require('../../scripts/approve-plugin-docs-gallery').approvePluginDocsGallery(options);

    expect(() => approve({ outputDir, reviewer: 'QA reviewer', confirmed: false })).toThrow('explicit confirmation');
    const result = approve({ outputDir, reviewer: 'QA reviewer', confirmed: true });
    const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'report.json'), 'utf8'));

    expect(result.reviewStatus).toBe('approved');
    expect(report).toEqual(expect.objectContaining({ reviewStatus: 'approved', reviewer: 'QA reviewer' }));
    expect(report.reviewedAt).toEqual(expect.any(String));
    expect(() => verifyPluginDocsGallery({ repoRoot, outputDir })).toThrow(/OBS capture count is incomplete/);
  });

  test('recomputes manifest counts instead of trusting an edited gallery report', () => {
    buildPluginDocsGallery({ repoRoot, outputDir });
    const reportPath = path.join(outputDir, 'report.json');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    Object.assign(report, {
      reviewStatus: 'approved',
      expected: 612,
      screenshots: 612,
      receipts: 612,
      currentValid: 612,
      stale: 0,
      missing: 0,
      invalid: 0,
      incomplete: 0,
      rawOutputs: 613,
      coverageComplete: true
    });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(() => verifyPluginDocsGallery({ repoRoot, outputDir }))
      .toThrow('Plugin documentation QA gallery raw manifest count is stale');
  });
});
