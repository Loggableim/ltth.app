const fs = require('fs');
const path = require('path');

const { LOCALES, buildGuides } = require('../../scripts/plugin-tutorial-source');

describe('plugin guide source ownership', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const guidesRoot = path.join(repoRoot, 'scripts', 'plugin-guides');

  test('keeps editorial copy and workflow steps in the individual guide modules', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'plugin-tutorial-source.js'), 'utf8');
    const renderer = fs.readFileSync(path.join(repoRoot, 'scripts', 'build-plugin-docs.js'), 'utf8');

    for (const legacyToken of [
      'MANUAL_GUIDES',
      'localizedGuideCopy',
      'localizedStepCopy',
      'contextualizeStepCopy',
      'GUIDE_STEP_IDS',
      'UI_ANCHORS'
    ]) {
      expect(source).not.toContain(legacyToken);
    }
    expect(renderer).not.toContain('legacyGuidePage');

    for (const guide of buildGuides(repoRoot)) {
      const module = require(path.join(guidesRoot, `${guide.id}.js`));
      expect(module.copy).toEqual(expect.any(Object));
      expect(module.steps).toEqual(expect.any(Array));
      expect(module.steps).toHaveLength(guide.steps.length);

      for (const locale of LOCALES) {
        expect(module.copy[locale]).toEqual(expect.objectContaining({
          title: expect.any(String),
          summary: expect.any(String),
          firstResult: expect.any(String),
          requirements: expect.any(String),
          safety: expect.any(String),
          troubleshooting: expect.any(String)
        }));
        expect(module.steps.every((step) => step.copy && step.copy[locale]
          && step.copy[locale].title && step.copy[locale].body && step.copy[locale].expected)).toBe(true);
      }
    }
  });

  test('does not reuse generic editorial copy between guide contracts', () => {
    const guides = buildGuides(repoRoot);
    for (const locale of LOCALES) {
      for (const field of ['summary', 'requirements', 'safety', 'troubleshooting']) {
        const values = guides.map((guide) => guide.copy[locale][field]);
        expect(new Set(values).size).toBe(values.length);
      }
      const stepBodies = guides.flatMap((guide) => guide.steps.map((step) => step.copy[locale].body));
      expect(new Set(stepBodies).size).toBe(stepBodies.length);
    }
  });

  test('keeps GuideDefinition narrative sections specific to their plugin', () => {
    const guides = buildGuides(repoRoot);
    for (const locale of LOCALES) {
      const audiences = guides.map((guide) => guide.definition.metadata.audience[locale]);
      const symptoms = guides.map((guide) => guide.definition.troubleshooting[0].symptom[locale]);
      const resolutions = guides.map((guide) => guide.definition.troubleshooting[0].resolution[locale]);
      expect(new Set(audiences).size).toBe(audiences.length);
      expect(new Set(symptoms).size).toBe(symptoms.length);
      expect(new Set(resolutions).size).toBe(resolutions.length);
    }
  });
});
