'use strict';

const { LOCALES, buildGuides } = require('./plugin-tutorial-source');

const SPEC_VERSION = '2026-07-15-plugin-docs-v6';

function buildDocsSpec(repoRoot) {
  const guides = buildGuides(repoRoot);
  const defaultViewport = { width: 1440, height: 900, deviceScaleFactor: 1 };
  return {
    version: SPEC_VERSION,
    collection: 'docs',
    source: 'plugin-tutorial-source',
    theme: 'cid',
    locales: LOCALES,
    viewport: defaultViewport,
    assets: guides.flatMap((guide) => guide.steps.map((step) => {
      const workflowViewport = step.workflow?.captureRule?.viewport || {};
      const clipSelector = step.workflow?.captureRule?.clipSelector;
      return {
        id: `${guide.id}__${step.id}`,
        guideId: guide.id,
        stepId: step.id,
        canonical: `/screenshots/docs/plugins/${guide.id}/${step.id}.png`,
        route: step.capture.route,
        selector: step.capture.assertVisible,
        ...(clipSelector ? { clipSelector } : {}),
        action: step.capture.action,
        workflow: step.workflow,
        focusText: step.capture.focusText,
        expected: step.capture.expected,
        fixture: guide.capture.fixture,
        viewport: {
          ...defaultViewport,
          ...workflowViewport
        }
      };
    }))
  };
}

module.exports = { SPEC_VERSION, LOCALES, buildDocsSpec };
