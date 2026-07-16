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
      const visibleControls = new Map(guide.definition.visibleControls
        .map((control) => [control.selector, control]));
      const settingsSelectors = new Set(guide.definition.settingsReference.map((setting) => setting.selector));
      const inventory = collectGuideUiInventory(repoRoot, guide);
      expect(guide.definition.visibleControls.length).toBeGreaterThanOrEqual(guide.steps.length);
      for (const step of guide.steps) expect(documentedSelectors).toContain(step.capture.assertVisible);
      for (const control of inventory.controls) {
        const visible = visibleControls.get(control.selector);
        expect(visible).toBeDefined();
        if (visible.classification === 'documented') {
          expect(settingsSelectors).toContain(control.selector);
          continue;
        }
        expect(visible.classification).toMatch(/^(?:decorative|internal)$/);
        expect(visible.section).toBe('guide-controls');
        for (const locale of LOCALES) expect(visible.reason[locale]).toEqual(expect.any(String));
        expect(settingsSelectors).not.toContain(control.selector);
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
            const primaryLabel = primaryControl.labels?.[locale] || primaryControl.label;
            if (primaryLabel) expect(workflow.summary[locale]).toContain(primaryLabel);
          } else if (sourceIntegrations.length) {
            expect(sourceIntegrations.some((integration) => workflow.summary[locale].includes(integration.value))).toBe(true);
          }
          expect(workflow.summary[locale]).not.toMatch(/(?:connects?\s+(?:an?\s+)?account|LIVE output|OBS test scene|local result)/i);
        }
      }

      for (const control of inventory.controls) {
        const setting = guide.definition.settingsReference.find((candidate) => candidate.selector === control.selector);
        const visible = guide.definition.visibleControls.find((candidate) => candidate.selector === control.selector);
        expect(visible).toBeDefined();
        if (visible.classification !== 'documented') {
          expect(setting).toBeUndefined();
          for (const locale of LOCALES) expect(visible.reason[locale]).toEqual(expect.any(String));
          continue;
        }
        expect(setting).toBeDefined();
        for (const locale of LOCALES) {
          const text = `${setting.purpose[locale]}\n${setting.dependencies[locale]}`;
          expect(text).toContain(control.selector);
          expect(text).toContain(control.route);
          const localizedLabel = control.labels?.[locale] || control.label;
          if (localizedLabel) expect(text).toContain(localizedLabel);
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
              && (!(control.labels?.[locale] || control.label) || text.includes(control.labels?.[locale] || control.label))
              && text.includes(control.route)
            ))).toBe(true);
          }
          if (sourceIntegrations.length) {
            expect(sourceIntegrations.some((integration) => text.includes(integration.value))).toBe(true);
          }
          expect(text).not.toContain(guide.copy[locale].requirements);
          // The symptom is deliberately guide-specific.  It is the source copy
          // users see in the tutorial, while checks and resolution provide the
          // anchored, actionable follow-up rather than a second generic message.
          expect(entry.symptom[locale]).toBe(guide.copy[locale].troubleshooting);
          expect([...entry.checks[locale], entry.resolution[locale]].join('\n'))
            .not.toContain(guide.copy[locale].troubleshooting);
        }
      }
    }
  });

  test('uses reader-facing setting and integration prose instead of source-inventory fallbacks', () => {
    const guides = buildGuides(repoRoot);

    for (const guide of guides) {
      for (const setting of guide.definition.settingsReference) {
        for (const locale of LOCALES) {
          const text = [
            setting.purpose[locale],
            setting.defaultValue[locale],
            setting.values[locale],
            setting.dependencies[locale]
          ].join('\n');
          expect(text).not.toMatch(/(?:source inventory|quellinventar|inventario fuente|inventaire source|no static (?:default|option) value|kein statischer (?:standard|options)wert|no se declara ning[úu]n|aucune valeur (?:par d[ée]faut|d['’]option) statique)/i);
        }
      }

      for (const integration of guide.definition.integrations) {
        for (const locale of LOCALES) {
          expect(integration.description[locale]).toContain(integration.value);
          if (integration.method) expect(integration.description[locale]).toContain(integration.method);
        }
      }
    }
  });

  test('does not render shared workflow or setting prose templates', () => {
    const genericByLocale = {
      de: /Workflow-Referenz|konfigurierst du diese Einstellung/,
      en: /Workflow reference|Use .* to configure this setting/,
      es: /Referencia de flujo|para configurar este ajuste/,
      fr: /Référence du flux|pour configurer ce réglage/
    };

    for (const guide of buildGuides(repoRoot)) {
      for (const locale of LOCALES) {
        for (const workflow of guide.definition.workflows) {
          expect(workflow.summary[locale]).not.toMatch(genericByLocale[locale]);
        }
        for (const setting of guide.definition.settingsReference) {
          expect(setting.purpose[locale]).not.toMatch(genericByLocale[locale]);
        }
      }
    }
  });

  test('binds every declared overlay to exactly one source-backed OBS workflow', () => {
    const overlayGuides = buildGuides(repoRoot).filter((guide) => guide.overlay);

    expect(overlayGuides).toHaveLength(25);
    for (const guide of overlayGuides) {
      const obsWorkflows = guide.definition.workflows.filter((workflow) => workflow.kind === 'obs');
      expect(obsWorkflows).toHaveLength(1);
      expect(obsWorkflows[0].stepIds).not.toHaveLength(0);
      for (const stepId of obsWorkflows[0].stepIds) {
        expect(guide.steps.some((step) => step.id === stepId)).toBe(true);
      }
    }
  });

  test('uses the visible Minecraft overlay setting as its OBS workflow entry point', () => {
    const minecraft = buildGuides(repoRoot).find((guide) => guide.id === 'minecraft-connect');
    const workflow = minecraft.definition.workflows.find((candidate) => candidate.kind === 'obs');
    const step = minecraft.steps.find((candidate) => candidate.id === workflow.stepIds[0]);

    expect(step.capture.assertVisible).toBe('#overlayEnabled');
    expect(step.capture.action).toEqual(expect.objectContaining({
      type: 'set-demo-value',
      prepare: 'open-minecraft-setup-tab'
    }));
    expect(step.workflow.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'prepare', name: 'open-minecraft-setup-tab' }),
      expect.objectContaining({ type: 'set-demo-value', selector: '#overlayEnabled' })
    ]));
  });

  test('classifies every raw inventory value as an explicit technical exception', () => {
    for (const guide of buildGuides(repoRoot)) {
      const inventory = collectGuideUiInventory(repoRoot, guide);
      const visibleControls = new Map(guide.definition.visibleControls.map((control) => [control.selector, control]));
      const settings = new Set(guide.definition.settingsReference.map((setting) => setting.selector));

      for (const control of inventory.controls) {
        const hasEveryLocaleLabel = LOCALES.every((locale) => typeof control.labels?.[locale] === 'string' && control.labels[locale].trim());
        const visible = visibleControls.get(control.selector);
        expect(visible).toBeDefined();
        if (hasEveryLocaleLabel) {
          expect(visible.classification).toBe('documented');
          expect(settings).toContain(control.selector);
          continue;
        }

        if (visible.classification === 'documented') {
          expect(settings).toContain(control.selector);
          expect(guide.steps.some((step) => step.capture.assertVisible === control.selector)).toBe(true);
          continue;
        }

        expect(visible.classification).toMatch(/^(?:decorative|internal)$/);
        expect(visible.section).toBe('guide-controls');
        for (const locale of LOCALES) expect(visible.reason[locale]).toEqual(expect.any(String));
        expect(settings).not.toContain(control.selector);
      }
    }
  });

  test('uses each plugin locale label in the corresponding setting reference', () => {
    const advancedTimer = buildGuides(repoRoot).find((guide) => guide.id === 'advanced-timer');
    const timerMode = advancedTimer.definition.settingsReference.find((setting) => setting.selector === '#timer-mode');

    expect(timerMode.purpose).toEqual(expect.objectContaining({
      de: expect.stringContaining('Timer-Modus'),
      en: expect.stringContaining('Timer Mode'),
      es: expect.stringContaining('Modo del temporizador'),
      fr: expect.stringContaining('Mode du minuteur')
    }));
    expect(timerMode.purpose.de).not.toContain('Timer Mode');
    expect(timerMode.purpose.es).not.toContain('Timer Mode');
    expect(timerMode.purpose.fr).not.toContain('Timer Mode');
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
