const path = require('path');

const { LOCALES, buildGuides } = require('../../scripts/plugin-tutorial-source');
const {
  collectGuideUiInventory,
  collectPluginIntegrationInventory
} = require('../../scripts/lib/plugin-guide-ui-inventory');

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
      expect(guide.definition.settingsReference.length).toBeGreaterThanOrEqual(guide.steps.length);
      expect(guide.definition.settingsReference.every((setting) => (
        setting.selector && setting.purpose && setting.defaultValue && setting.values && setting.dependencies
      ))).toBe(true);
      expect(guide.definition.settingsReference.every((setting) => (
        LOCALES.every((locale) => !/text or value shown|not declared/i.test(setting.values[locale]))
      ))).toBe(true);
      expect(guide.definition.troubleshooting.every((entry) => (
        entry.symptom && entry.checks && entry.resolution
        && LOCALES.every((locale) => Array.isArray(entry.checks[locale]) && entry.checks[locale].length)
      ))).toBe(true);

      const documentedSelectors = new Set(guide.definition.visibleControls
        .filter((control) => control.classification === 'documented')
        .map((control) => control.selector));
      const settingsSelectors = new Set(guide.definition.settingsReference.map((setting) => setting.selector));
      const inventory = collectGuideUiInventory(repoRoot, guide);
      expect(guide.definition.visibleControls.length).toBeGreaterThanOrEqual(guide.steps.length);
      for (const step of guide.steps) expect(documentedSelectors).toContain(step.capture.assertVisible);
      for (const control of inventory.controls) {
        expect(documentedSelectors).toContain(control.selector);
        expect(settingsSelectors).toContain(control.selector);
      }
      const sourcedIntegrations = collectPluginIntegrationInventory(repoRoot, guide.id, guide.definition.activation.route).integrations;
      const documentedIntegrations = new Set(guide.definition.integrations.map((integration) => `${integration.type}:${integration.value}`));
      for (const integration of sourcedIntegrations) {
        expect(documentedIntegrations).toContain(`${integration.type}:${integration.value}`);
      }
    }
  });

  test('derives workflow, setting, and troubleshooting prose from shipped source anchors', () => {
    const guides = buildGuides(repoRoot);

    for (const guide of guides) {
      const inventory = collectGuideUiInventory(repoRoot, guide);
      const sourceIntegrations = collectPluginIntegrationInventory(repoRoot, guide.id, guide.definition.activation.route).integrations;
      const primaryControl = inventory.controls[0];

      for (const workflow of guide.definition.workflows) {
        for (const locale of LOCALES) {
          expect(workflow.summary[locale]).toContain(guide.definition.activation.route);
          if (primaryControl) {
            expect(workflow.summary[locale]).toContain(primaryControl.selector);
            if (primaryControl.label) expect(workflow.summary[locale]).toContain(primaryControl.label);
          } else if (sourceIntegrations.length) {
            expect(sourceIntegrations.some((integration) => workflow.summary[locale].includes(integration.value))).toBe(true);
          }
          expect(workflow.summary[locale]).not.toMatch(/(?:connects?\s+(?:an?\s+)?account|LIVE output|OBS test scene|local result)/i);
        }
      }

      for (const control of inventory.controls) {
        const setting = guide.definition.settingsReference.find((candidate) => candidate.selector === control.selector);
        expect(setting).toBeDefined();
        for (const locale of LOCALES) {
          const text = `${setting.purpose[locale]}\n${setting.dependencies[locale]}`;
          expect(text).toContain(control.selector);
          expect(text).toContain(control.route);
          if (control.label) expect(text).toContain(control.label);
          expect(text).not.toMatch(/\bvisible\s+(?:control|field)\b|\bvisible\s+action(?:\s+(?:on|in|for|at)\b|\s*["“]|[.,;:]|$)|\bvisible\s+on\s+\//i);
          const step = guide.steps.find((candidate) => candidate.capture.assertVisible === control.selector);
          if (step) {
            expect(setting.purpose[locale]).not.toContain(step.copy[locale].body);
            expect(setting.dependencies[locale]).not.toContain(step.copy[locale].expected);
          }
        }
      }

      for (const entry of guide.definition.troubleshooting) {
        for (const locale of LOCALES) {
          const text = [entry.symptom[locale], ...entry.checks[locale], entry.resolution[locale]].join('\n');
          if (inventory.controls.length) {
            expect(inventory.controls.some((control) => (
              text.includes(control.selector)
              && (!control.label || text.includes(control.label))
              && text.includes(control.route)
            ))).toBe(true);
          }
          if (sourceIntegrations.length) {
            expect(sourceIntegrations.some((integration) => text.includes(integration.value))).toBe(true);
          }
          expect(text).not.toContain(guide.copy[locale].requirements);
          expect(text).not.toContain(guide.copy[locale].troubleshooting);
        }
      }
    }
  });

  test('uses a declared REST endpoint as the API Bridge source anchor', () => {
    const apiBridge = buildGuides(repoRoot).find((guide) => guide.id === 'api-bridge');
    const inventory = collectGuideUiInventory(repoRoot, apiBridge);
    const integrations = collectPluginIntegrationInventory(repoRoot, apiBridge.id, apiBridge.definition.activation.route).integrations;

    expect(inventory.controls).toHaveLength(0);
    expect(integrations.some((integration) => integration.type === 'rest')).toBe(true);
    for (const locale of LOCALES) {
      const text = apiBridge.definition.troubleshooting
        .flatMap((entry) => [entry.symptom[locale], ...entry.checks[locale], entry.resolution[locale]])
        .join('\n');
      expect(integrations.some((integration) => integration.type === 'rest' && text.includes(integration.value))).toBe(true);
    }
  });
});
