'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function approvePluginDocsGallery({
  outputDir = path.join(ROOT, 'docs', 'plugin-docs-qa'),
  reviewer,
  confirmed = false,
  reviewedAt = new Date().toISOString()
} = {}) {
  assert.strictEqual(confirmed, true, 'Gallery approval requires explicit confirmation from the reviewer');
  assert.ok(typeof reviewer === 'string' && reviewer.trim(), 'Gallery approval requires a named reviewer');
  const reportPath = path.join(outputDir, 'report.json');
  assert.ok(fs.existsSync(reportPath), 'Missing plugin documentation QA report. Run npm run docs:gallery:build first.');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.strictEqual(report.reviewStatus, 'pending', 'Plugin documentation QA gallery has already been reviewed');

  report.reviewStatus = 'approved';
  report.reviewer = reviewer.trim();
  report.reviewedAt = reviewedAt;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

if (require.main === module) {
  const reviewer = process.env.PLUGIN_DOCS_GALLERY_REVIEWER;
  const confirmed = process.env.PLUGIN_DOCS_GALLERY_REVIEWED === 'yes';
  const report = approvePluginDocsGallery({ reviewer, confirmed });
  console.log(`Approved plugin documentation QA gallery by ${report.reviewer} at ${report.reviewedAt}.`);
}

module.exports = { approvePluginDocsGallery };
