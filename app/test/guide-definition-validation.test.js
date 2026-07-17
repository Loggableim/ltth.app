const {
  auditGuideDefinition,
  formatGuideContractAudit
} = require('../../scripts/lib/guide-definition-validation');
const childProcess = require('child_process');
const path = require('path');

const LOCALES = ['de', 'en', 'es', 'fr'];

function localized(value) {
  return Object.fromEntries(LOCALES.map((locale) => [locale, `${value} (${locale})`]));
}

describe('GuideDefinition contract audit', () => {
  test('reports unclassified controls, incomplete references, and omitted source integrations', () => {
    const report = auditGuideDefinition({
      id: 'sample-plugin',
      definition: {
        visibleControls: [
          { selector: '#documented', classification: 'documented', section: 'step-configure', stepId: 'configure' },
          { selector: '#decorative', classification: 'decorative' }
        ],
        settingsReference: [{
          selector: '#documented',
          purpose: localized('Purpose'),
          defaultValue: { de: 'Default', en: 'Default', es: 'Default' },
          values: localized('Values'),
          dependencies: localized('Dependencies')
        }],
        integrations: [{
          type: 'rest',
          value: '/api/sample/config',
          description: localized('REST endpoint')
        }]
      }
    }, {
      inventory: {
        controls: [
          { selector: '#documented' },
          { selector: '#decorative' },
          { selector: '#unclassified' }
        ]
      },
      integrationInventory: {
        integrations: [
          { type: 'rest', value: '/api/sample/config' },
          { type: 'socket-event', value: 'sample:update' }
        ]
      }
    });

    expect(report.compliant).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'control-reason-required', selector: '#decorative' }),
      expect.objectContaining({ code: 'control-unclassified', selector: '#unclassified' }),
      expect.objectContaining({ code: 'localized-value-missing', path: 'settingsReference.#documented.defaultValue.fr' }),
      expect.objectContaining({ code: 'integration-missing', type: 'socket-event', value: 'sample:update' })
    ]));
    expect(formatGuideContractAudit({ reports: [report] })).toContain('sample-plugin: 8 error(s)');
  });

  test('accepts a fully classified and localized contract for every supported integration type', () => {
    const sourceIntegrations = [
      { type: 'rest', value: '/api/sample/config' },
      { type: 'socket-event', value: 'sample:update' },
      { type: 'storage', value: 'api.getSetting' },
      { type: 'import-export', value: '/api/sample/export' },
      { type: 'flow-action', value: 'sample_trigger' },
      { type: 'chat-command', value: '!sample' }
    ];
    const report = auditGuideDefinition({
      id: 'complete-plugin',
      definition: {
        activation: { route: '/plugins/complete' },
        visibleControls: [
          { selector: '#save', classification: 'documented', section: 'step-save', stepId: 'save' },
          { selector: '#logo', classification: 'decorative', reason: localized('Brand mark') },
          { selector: '#csrf', classification: 'internal', reason: localized('Runtime guard') }
        ],
        settingsReference: [{
          selector: '#save',
          purpose: localized('Use "Save configuration" (#save) on /plugins/complete to run this action.'),
          defaultValue: localized('No value'),
          values: localized('One action'),
          dependencies: localized('"Save configuration" (#save) is available on /plugins/complete.')
        }],
        integrations: sourceIntegrations.map((integration) => ({ ...integration, description: localized(integration.value) }))
      }
    }, {
      inventory: { controls: [{ selector: '#save', label: 'Save configuration', route: '/plugins/complete' }, { selector: '#logo' }, { selector: '#csrf' }] },
      integrationInventory: { integrations: sourceIntegrations }
    });

    expect(report).toEqual(expect.objectContaining({
      compliant: true,
      summary: expect.objectContaining({ errors: 0, controls: 3, integrations: 6 })
    }));
  });

  test('keeps REST interfaces with the same path but different HTTP methods distinct', () => {
    const sourceIntegrations = [
      { type: 'rest', method: 'GET', value: '/api/sample/config' },
      { type: 'rest', method: 'POST', value: '/api/sample/config' }
    ];
    const report = auditGuideDefinition({
      id: 'method-aware-plugin',
      definition: {
        visibleControls: [],
        settingsReference: [],
        integrations: sourceIntegrations.map((integration) => ({ ...integration, description: localized(integration.method) }))
      }
    }, { inventory: { controls: [] }, integrationInventory: { integrations: sourceIntegrations } });

    expect(report).toEqual(expect.objectContaining({ compliant: true }));
  });

  test('rejects generic setting and troubleshooting prose that omits sourced anchors', () => {
    const report = auditGuideDefinition({
      id: 'generic-copy-plugin',
      definition: {
        activation: { route: '/plugins/sample' },
        visibleControls: [{ selector: '#sample', classification: 'documented', section: 'step-configure', stepId: 'configure' }],
        settingsReference: [{
          selector: '#sample',
          purpose: localized('Visible control on /plugins/sample.'),
          defaultValue: localized('No static value'),
          values: localized('One text value'),
          dependencies: localized('Visible on /plugins/sample.')
        }],
        integrations: [{
          type: 'rest',
          method: 'GET',
          value: '/api/sample/info',
          description: localized('Read only')
        }],
        troubleshooting: [{
          symptom: localized('The plugin is not visible.'),
          checks: Object.fromEntries(LOCALES.map((locale) => [locale, ['Check the visible control.']])),
          resolution: localized('Verify the visible field.')
        }]
      }
    }, {
      inventory: {
        controls: [{ selector: '#sample', label: 'Sample mode', route: '/plugins/sample' }]
      },
      integrationInventory: {
        integrations: [{ type: 'rest', method: 'GET', value: '/api/sample/info' }]
      }
    });

    expect(report.compliant).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'generic-guide-text' }),
      expect.objectContaining({ code: 'guide-text-source-anchor-missing', section: 'settingsReference', selector: '#sample' }),
      expect.objectContaining({ code: 'guide-text-source-anchor-missing', section: 'troubleshooting', anchorType: 'control-selector' }),
      expect.objectContaining({ code: 'guide-text-source-anchor-missing', section: 'troubleshooting', anchorType: 'integration' })
    ]));
  });

  test('rejects source-inventory boilerplate in a setting reference', () => {
    const report = auditGuideDefinition({
      id: 'source-inventory-plugin',
      definition: {
        activation: { route: '/plugins/source-inventory' },
        visibleControls: [{ selector: '#sample', classification: 'documented', section: 'step-configure', stepId: 'configure' }],
        settingsReference: [{
          selector: '#sample',
          purpose: localized('Source inventory on /plugins/source-inventory: "Sample mode" (#sample).'),
          defaultValue: localized('empty'),
          values: localized('text'),
          dependencies: localized('Source inventory on /plugins/source-inventory: "Sample mode" (#sample).')
        }],
        integrations: []
      }
    }, {
      inventory: {
        controls: [{
          selector: '#sample',
          label: 'Sample mode',
          route: '/plugins/source-inventory',
          defaultValue: 'empty',
          values: 'text'
        }]
      }
    });

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'generic-guide-text', section: 'settingsReference', selector: '#sample', field: 'purpose' }),
      expect.objectContaining({ code: 'generic-guide-text', section: 'settingsReference', selector: '#sample', field: 'dependencies' })
    ]));
  });

  test('accepts REST-backed troubleshooting when no sourced control exists', () => {
    const endpoint = '/api/sample/info';
    const report = auditGuideDefinition({
      id: 'api-only-plugin',
      definition: {
        activation: { route: '/plugins/sample' },
        visibleControls: [],
        settingsReference: [],
        integrations: [{
          type: 'rest',
          method: 'GET',
          value: endpoint,
          description: localized('Read-only endpoint')
        }],
        troubleshooting: [{
          symptom: localized('The endpoint is unavailable.'),
          checks: Object.fromEntries(LOCALES.map((locale) => [locale, [`GET ${endpoint}`]])),
          resolution: localized(`Read GET ${endpoint} again without sending a request.`)
        }]
      }
    }, {
      inventory: { controls: [] },
      integrationInventory: { integrations: [{ type: 'rest', method: 'GET', value: endpoint }] }
    });

    expect(report).toEqual(expect.objectContaining({ compliant: true }));
  });

  test('rejects identical setting prose even when the settings use different selectors', () => {
    const repeatedText = localized('Shared source text');
    const report = auditGuideDefinition({
      id: 'repeated-copy-plugin',
      definition: {
        activation: { route: '/plugins/repeated' },
        visibleControls: [
          { selector: '#first', classification: 'documented', section: 'step-configure', stepId: 'configure' },
          { selector: '#second', classification: 'documented', section: 'step-configure', stepId: 'configure' }
        ],
        settingsReference: ['#first', '#second'].map((selector) => ({
          selector,
          purpose: repeatedText,
          defaultValue: localized('No value'),
          values: localized('One text value'),
          dependencies: repeatedText
        })),
        integrations: []
      }
    }, {
      inventory: {
        controls: [
          { selector: '#first', label: 'First label', route: '/plugins/repeated' },
          { selector: '#second', label: 'Second label', route: '/plugins/repeated' }
        ]
      }
    });

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'identical-guide-text', section: 'settingsReference' })
    ]));
  });

  test('requires declared control defaults and options in the setting reference', () => {
    const sourceText = localized('Source inventory on /plugins/values: "Sample mode" (#sample).');
    const report = auditGuideDefinition({
      id: 'source-values-plugin',
      definition: {
        activation: { route: '/plugins/values' },
        visibleControls: [{ selector: '#sample', classification: 'documented', section: 'step-configure', stepId: 'configure' }],
        settingsReference: [{
          selector: '#sample',
          purpose: sourceText,
          defaultValue: localized('stale default'),
          values: localized('stale options'),
          dependencies: sourceText
        }],
        integrations: []
      }
    }, {
      inventory: {
        controls: [{
          selector: '#sample',
          kind: 'control',
          label: 'Sample mode',
          route: '/plugins/values',
          defaultValue: 'default-mode',
          values: 'default-mode, safe-mode'
        }]
      }
    });

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'guide-text-source-value-missing', selector: '#sample', field: 'defaultValue' }),
      expect.objectContaining({ code: 'guide-text-source-value-missing', selector: '#sample', field: 'values' })
    ]));
  });

  test('rejects runtime claims that are appended to an otherwise sourced setting reference', () => {
    const sourcedText = localized('Source inventory on /plugins/runtime: "Sample mode" (#sample). It connects an account.');
    const report = auditGuideDefinition({
      id: 'runtime-claim-plugin',
      definition: {
        activation: { route: '/plugins/runtime' },
        visibleControls: [{ selector: '#sample', classification: 'documented', section: 'step-configure', stepId: 'configure' }],
        settingsReference: [{
          selector: '#sample',
          purpose: sourcedText,
          defaultValue: localized('not declared'),
          values: localized('not declared'),
          dependencies: sourcedText
        }],
        integrations: []
      }
    }, {
      inventory: {
        controls: [{
          selector: '#sample',
          kind: 'control',
          label: 'Sample mode',
          route: '/plugins/runtime',
          defaultValue: 'not declared',
          values: 'not declared'
        }]
      }
    });

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported-runtime-claim', section: 'settingsReference', selector: '#sample' })
    ]));
  });

  test('rejects broader generic visibility phrases such as visible button and visible values', () => {
    const report = auditGuideDefinition({
      id: 'generic-variants-plugin',
      definition: {
        activation: { route: '/plugins/variants' },
        visibleControls: [{ selector: '#sample', classification: 'documented', section: 'step-configure', stepId: 'configure' }],
        settingsReference: [{
          selector: '#sample',
          purpose: localized('Visible button "Sample action" (#sample) on /plugins/variants.'),
          defaultValue: localized('not declared'),
          values: localized('Visible values from the page.'),
          dependencies: localized('Visible button "Sample action" (#sample) on /plugins/variants.')
        }],
        integrations: []
      }
    }, {
      inventory: {
        controls: [{
          selector: '#sample',
          kind: 'control',
          label: 'Sample action',
          route: '/plugins/variants',
          defaultValue: 'not declared',
          values: 'not declared'
        }]
      }
    });

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'generic-guide-text', selector: '#sample', field: 'purpose' }),
      expect.objectContaining({ code: 'generic-guide-text', selector: '#sample', field: 'dependencies' }),
      expect.objectContaining({ code: 'generic-guide-text', selector: '#sample', field: 'values' })
    ]));
  });

  test('requires localized WorkflowStep instructions, executable evidence, and valid workflow references', () => {
    const report = auditGuideDefinition({
      id: 'workflow-contract-plugin',
      steps: [{
        id: 'configure',
        workflow: {
          instructions: {
            de: { title: 'Konfigurieren', body: 'Einstellung setzen', expected: 'Gespeichert' },
            en: { title: 'Configure', body: 'Set the setting', expected: 'Saved' },
            es: { title: 'Configurar', body: '', expected: 'Guardado' },
            fr: { title: 'Configurer', body: 'Definir le reglage', expected: 'Enregistre' }
          },
          operations: [],
          postconditions: []
        }
      }],
      definition: {
        workflows: [{
          id: 'golden-path',
          title: localized('Golden path'),
          summary: localized('Configure the plugin'),
          stepIds: ['configure', 'missing-step']
        }],
        visibleControls: [],
        settingsReference: [],
        integrations: []
      }
    });

    expect(report.compliant).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'workflow-instructions-localization-required', path: 'steps.configure.workflow.instructions.es.body' }),
      expect.objectContaining({ code: 'workflow-operations-required', stepId: 'configure' }),
      expect.objectContaining({ code: 'workflow-postconditions-required', stepId: 'configure' }),
      expect.objectContaining({ code: 'workflow-step-reference-invalid', workflowId: 'golden-path', stepId: 'missing-step' })
    ]));
  });

  test('requires every shipped guide definition to cover its sourced controls and integrations', () => {
    const repoRoot = path.join(__dirname, '..', '..');
    const result = childProcess.spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts', 'build-plugin-docs.js'),
      '--audit-contracts'
    ], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('GuideDefinition contract audit: 38 guide(s)');
    expect(result.stdout).toContain('0 error(s)');
  });
});
