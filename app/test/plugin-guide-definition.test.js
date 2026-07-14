const path = require('path');

const { LOCALES, buildGuides } = require('../../scripts/plugin-tutorial-source');

describe('plugin guide definitions', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  test('requires complete, localized guide contracts instead of renderer-generated prose', () => {
    const guides = buildGuides(repoRoot);

    expect(guides).toHaveLength(38);
    for (const guide of guides) {
      expect(guide.definition).toEqual(expect.objectContaining({
        metadata: expect.objectContaining({
          purpose: expect.any(Object),
          audience: expect.any(Object),
          version: expect.any(String),
          prerequisites: expect.any(Object),
          safetyBoundaries: expect.any(Object)
        }),
        activation: expect.objectContaining({
          route: expect.stringMatching(/^\//),
          navigation: expect.any(Object)
        }),
        workflows: expect.any(Array),
        settingsReference: expect.any(Array),
        integrations: expect.any(Array),
        troubleshooting: expect.any(Array),
        visibleControls: expect.any(Array)
      }));

      for (const locale of LOCALES) {
        expect(guide.definition.metadata.purpose[locale]).toEqual(expect.any(String));
        expect(guide.definition.metadata.audience[locale]).toEqual(expect.any(String));
        expect(guide.definition.metadata.prerequisites[locale]).toEqual(expect.any(String));
        expect(guide.definition.metadata.safetyBoundaries[locale]).toEqual(expect.any(String));
        expect(guide.definition.activation.navigation[locale]).toEqual(expect.any(String));
      }

      expect(guide.definition.workflows.length).toBeGreaterThanOrEqual(1);
      expect(guide.definition.workflows.some((workflow) => workflow.kind === 'golden-path')).toBe(true);
      expect(guide.definition.workflows.every((workflow) => (
        workflow.id && workflow.title && workflow.summary && Array.isArray(workflow.stepIds) && workflow.stepIds.length
      ))).toBe(true);
      expect(guide.definition.settingsReference.length).toBeGreaterThanOrEqual(1);
      expect(guide.definition.settingsReference.every((setting) => (
        setting.selector && setting.purpose && setting.defaultValue && setting.values && setting.dependencies
      ))).toBe(true);
      expect(guide.definition.troubleshooting.every((entry) => (
        entry.symptom && entry.checks && entry.resolution
        && LOCALES.every((locale) => Array.isArray(entry.checks[locale]) && entry.checks[locale].length)
      ))).toBe(true);

      const documentedSelectors = new Set(guide.definition.visibleControls
        .filter((control) => control.classification === 'documented')
        .map((control) => control.selector));
      for (const step of guide.steps) expect(documentedSelectors).toContain(step.capture.assertVisible);
    }
  });
});
