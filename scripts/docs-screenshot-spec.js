'use strict';

const { LOCALES, buildGuides } = require('./plugin-tutorial-source');

const SPEC_VERSION = '2026-07-13-plugin-docs-v2';

function buildDocsSpec(repoRoot) {
  const guides = buildGuides(repoRoot);
  return {
    version: SPEC_VERSION,
    collection: 'docs',
    source: 'plugin-tutorial-source',
    theme: 'cid',
    locales: LOCALES,
    viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
    assets: guides.flatMap((guide) => guide.steps.map((step) => ({
      id: `${guide.id}__${step.id}`,
      guideId: guide.id,
      stepId: step.id,
      canonical: `/screenshots/docs/plugins/${guide.id}/${step.id}.png`,
      route: step.capture.route,
      selector: step.capture.assertVisible,
      action: step.capture.action,
      focusText: step.capture.focusText,
      expected: step.capture.expected,
      fixture: guide.capture.fixture,
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 }
    })))
  };
}

module.exports = { SPEC_VERSION, LOCALES, buildDocsSpec };
