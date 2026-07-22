'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildPluginDocsGallery } = require('../../scripts/build-plugin-docs-gallery');
const { verifyPluginDocsGallery } = require('../../scripts/verify-plugin-docs-gallery');

describe('plugin documentation QA gallery', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  let outputDir;

  beforeEach(() => {
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-docs-gallery-'));
  });

  afterEach(() => fs.rmSync(outputDir, { recursive: true, force: true }));

  test('indexes every localized CaptureReceipt and remains pending until human visual review', () => {
    const result = buildPluginDocsGallery({ repoRoot, outputDir });
    const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'report.json'), 'utf8'));
    const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');

    expect(result).toEqual(expect.objectContaining({ screenshotCount: 848, guideCount: 38 }));
    expect(report).toEqual(expect.objectContaining({
      reviewStatus: 'pending',
      guides: 38,
      locales: ['de', 'en', 'es', 'fr'],
      screenshots: 848,
      receipts: 848,
      obs: expect.objectContaining({ expected: 104, records: 0 })
    }));
    expect(html).toContain('data-plugin');
    expect(html).toContain('data-locale');
    expect(html).toContain('reviewStatus');
    expect(html).toContain('rel="icon"');
    expect(() => verifyPluginDocsGallery({ repoRoot, outputDir })).toThrow('not approved');
  });

  test('requires an explicit named human confirmation before approving the gallery', () => {
    buildPluginDocsGallery({ repoRoot, outputDir });
    const approve = (options) => require('../../scripts/approve-plugin-docs-gallery').approvePluginDocsGallery(options);

    expect(() => approve({ outputDir, reviewer: 'QA reviewer', confirmed: false })).toThrow('explicit confirmation');
    const result = approve({ outputDir, reviewer: 'QA reviewer', confirmed: true });
    const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'report.json'), 'utf8'));

    expect(result.reviewStatus).toBe('approved');
    expect(report).toEqual(expect.objectContaining({ reviewStatus: 'approved', reviewer: 'QA reviewer' }));
    expect(report.reviewedAt).toEqual(expect.any(String));
  });
});
