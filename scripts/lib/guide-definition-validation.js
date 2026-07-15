'use strict';

const LOCALES = ['de', 'en', 'es', 'fr'];
const GUIDE_CONTROL_CLASSIFICATIONS = new Set(['documented', 'decorative', 'internal']);
const GUIDE_INTEGRATION_TYPES = new Set([
  'local-surface',
  'overlay-url',
  'rest',
  'socket-event',
  'storage',
  'import-export',
  'flow-action',
  'chat-command'
]);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function entries(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : [];
}

function addIssue(issues, code, details = {}) {
  issues.push({ severity: 'error', code, ...details });
}

function requireLocalizedValue(issues, value, path, missingCode = 'localized-value-missing', details = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    addIssue(issues, missingCode, { path, ...details });
    return;
  }
  for (const locale of LOCALES) {
    if (!nonEmptyString(value[locale])) addIssue(issues, 'localized-value-missing', { path: `${path}.${locale}`, ...details });
  }
}

function integrationKey(entry) {
  return `${entry.type}:${entry.method || ''}:${entry.value}`;
}

const UNDECLARED_INVENTORY_VALUE = /^(?:text or value shown in the control|not declared)$/i;
const GENERIC_GUIDE_TEXT = /\b(?:visible\s+(?:control|controls?|field|fields?|button|buttons?|values?|actions?)\b|visible\s+on\s+\/|sichtbare(?:n|s)?\s+(?:feld(?:er)?|steuerelemente?|schaltflache(?:n)?|werte?|aktionen?)\b|sichtbar\s+auf\s+\/|control(?:es)?\s+visible(?:s)?|campo(?:s)?\s+visible(?:s)?|bot[oó]n(?:es)?\s+visible(?:s)?|valor(?:es)?\s+visible(?:s)?|contr[ôo]le(?:s)?\s+visible(?:s)?|champ(?:s)?\s+visible(?:s)?|bouton(?:s)?\s+visible(?:s)?|valeur(?:s)?\s+visible(?:s)?)\b/iu;
const UNSUPPORTED_RUNTIME_CLAIM = /\b(?:connects?\s+(?:an?\s+)?account|LIVE\s+output|OBS\s+test\s+scene|local\s+result|production\s+data|not\s+populated\s+as\s+expected)\b/iu;

function localizedText(value, locale) {
  return nonEmptyString(value?.[locale]) ? value[locale] : '';
}

function troubleshootingText(entry, locale) {
  return [
    localizedText(entry.symptom, locale),
    ...(Array.isArray(entry.checks?.[locale]) ? entry.checks[locale].filter(nonEmptyString) : []),
    localizedText(entry.resolution, locale)
  ].join('\n');
}

function addGenericTextIssues(issues, value, section, details = {}) {
  for (const locale of LOCALES) {
    const text = localizedText(value, locale);
    if (GENERIC_GUIDE_TEXT.test(text)) {
      addIssue(issues, 'generic-guide-text', { section, locale, ...details });
    }
  }
}

function addUnsupportedRuntimeClaimIssue(issues, text, section, details = {}) {
  if (UNSUPPORTED_RUNTIME_CLAIM.test(text)) {
    addIssue(issues, 'unsupported-runtime-claim', { section, ...details });
  }
}

function addMissingAnchorIssue(issues, section, details = {}) {
  addIssue(issues, 'guide-text-source-anchor-missing', { section, ...details });
}

function controlTextIsAnchored(text, controls, fallbackRoute) {
  return controls.some((control) => (
    text.includes(control.selector)
    && (!nonEmptyString(control.label) || text.includes(control.label))
    && (!nonEmptyString(control.route || fallbackRoute) || text.includes(control.route || fallbackRoute))
  ));
}

function auditRepeatedLocalizedText(issues, records, section) {
  for (const locale of LOCALES) {
    const firstRecordByText = new Map();
    for (const record of records) {
      const text = record.text(locale).replace(/\s+/g, ' ').trim().toLocaleLowerCase();
      if (!text) continue;
      const first = firstRecordByText.get(text);
      if (first) {
        addIssue(issues, 'identical-guide-text', { section, locale, first, duplicate: record.id });
      } else {
        firstRecordByText.set(text, record.id);
      }
    }
  }
}

function auditEditorialQuality(issues, definition, controls, sourceIntegrations) {
  const route = definition.activation?.route;
  const controlsBySelector = new Map(controls.map((control) => [control.selector, control]));

  for (const workflow of entries(definition.workflows)) {
    for (const locale of LOCALES) {
      const text = localizedText(workflow.summary, locale);
      if (GENERIC_GUIDE_TEXT.test(text)) {
        addIssue(issues, 'generic-guide-text', { section: 'workflows', locale, workflowId: workflow.id });
      }
      addUnsupportedRuntimeClaimIssue(issues, text, 'workflows', { locale, workflowId: workflow.id });
      if (nonEmptyString(route) && !text.includes(route)) {
        addMissingAnchorIssue(issues, 'workflows', { locale, workflowId: workflow.id, anchorType: 'route' });
      }
      if (controls.length && !controlTextIsAnchored(text, controls, route)) {
        addMissingAnchorIssue(issues, 'workflows', { locale, workflowId: workflow.id, anchorType: 'control-selector' });
      } else if (!controls.length && sourceIntegrations.length && !sourceIntegrations.some((integration) => text.includes(integration.value))) {
        addMissingAnchorIssue(issues, 'workflows', { locale, workflowId: workflow.id, anchorType: 'integration' });
      }
    }
  }

  for (const setting of entries(definition.settingsReference)) {
    addGenericTextIssues(issues, setting.purpose, 'settingsReference', { selector: setting.selector, field: 'purpose' });
    addGenericTextIssues(issues, setting.dependencies, 'settingsReference', { selector: setting.selector, field: 'dependencies' });
    addGenericTextIssues(issues, setting.values, 'settingsReference', { selector: setting.selector, field: 'values' });
    const control = controlsBySelector.get(setting.selector);
    for (const locale of LOCALES) {
      addUnsupportedRuntimeClaimIssue(issues, localizedText(setting.purpose, locale), 'settingsReference', {
        selector: setting.selector,
        field: 'purpose',
        locale
      });
      addUnsupportedRuntimeClaimIssue(issues, localizedText(setting.dependencies, locale), 'settingsReference', {
        selector: setting.selector,
        field: 'dependencies',
        locale
      });
    }
    if (!control) continue;
    for (const locale of LOCALES) {
      const text = `${localizedText(setting.purpose, locale)}\n${localizedText(setting.dependencies, locale)}`;
      if (!text.includes(control.selector)) {
        addMissingAnchorIssue(issues, 'settingsReference', { selector: setting.selector, locale, anchorType: 'control-selector' });
      }
      const controlRoute = nonEmptyString(control.route) ? control.route : route;
      if (nonEmptyString(controlRoute) && !text.includes(controlRoute)) {
        addMissingAnchorIssue(issues, 'settingsReference', { selector: setting.selector, locale, anchorType: 'route' });
      }
      if (nonEmptyString(control.label) && !text.includes(control.label)) {
        addMissingAnchorIssue(issues, 'settingsReference', { selector: setting.selector, locale, anchorType: 'control-label' });
      }
      for (const field of ['defaultValue', 'values']) {
        const sourceValue = control[field];
        if (nonEmptyString(sourceValue) && !UNDECLARED_INVENTORY_VALUE.test(sourceValue) && !localizedText(setting[field], locale).includes(sourceValue)) {
          addIssue(issues, 'guide-text-source-value-missing', { selector: setting.selector, field, locale });
        }
      }
    }
  }

  for (const entry of entries(definition.troubleshooting)) {
    for (const locale of LOCALES) {
      const text = troubleshootingText(entry, locale);
      if (GENERIC_GUIDE_TEXT.test(text)) {
        addIssue(issues, 'generic-guide-text', { section: 'troubleshooting', locale });
      }
      addUnsupportedRuntimeClaimIssue(issues, text, 'troubleshooting', { locale });
      if (controls.length) {
        if (!controlTextIsAnchored(text, controls, route)) {
          addMissingAnchorIssue(issues, 'troubleshooting', { locale, anchorType: 'control-selector' });
        }
      }
      if (sourceIntegrations.length && !sourceIntegrations.some((integration) => text.includes(integration.value))) {
        addMissingAnchorIssue(issues, 'troubleshooting', { locale, anchorType: 'integration' });
      }
    }
  }

  auditRepeatedLocalizedText(issues, entries(definition.workflows).map((workflow) => ({
    id: workflow.id || 'unknown-workflow',
    text: (locale) => localizedText(workflow.summary, locale)
  })), 'workflows');
  auditRepeatedLocalizedText(issues, entries(definition.settingsReference).map((setting) => ({
    id: setting.selector || 'unknown-setting',
    text: (locale) => `${localizedText(setting.purpose, locale)}\n${localizedText(setting.dependencies, locale)}`
  })), 'settingsReference');
  auditRepeatedLocalizedText(issues, entries(definition.troubleshooting).map((entry, index) => ({
    id: `troubleshooting-${index}`,
    text: (locale) => troubleshootingText(entry, locale)
  })), 'troubleshooting');
}

function auditWorkflowContracts(issues, guide, definition) {
  const steps = entries(guide?.steps);
  const workflows = entries(definition.workflows);
  const stepIds = new Set();
  const referencedStepIds = new Set();

  for (const step of steps) {
    if (!nonEmptyString(step.id)) {
      addIssue(issues, 'workflow-step-id-required');
      continue;
    }
    if (stepIds.has(step.id)) {
      addIssue(issues, 'workflow-step-id-duplicated', { stepId: step.id });
      continue;
    }
    stepIds.add(step.id);

    if (!step.workflow || typeof step.workflow !== 'object' || Array.isArray(step.workflow)) {
      addIssue(issues, 'workflow-step-contract-required', { stepId: step.id });
      continue;
    }

    for (const locale of LOCALES) {
      for (const field of ['title', 'body', 'expected']) {
        if (!nonEmptyString(step.workflow.instructions?.[locale]?.[field])) {
          addIssue(issues, 'workflow-instructions-localization-required', {
            stepId: step.id,
            path: `steps.${step.id}.workflow.instructions.${locale}.${field}`
          });
        }
      }
    }
    if (!entries(step.workflow.operations).length) {
      addIssue(issues, 'workflow-operations-required', { stepId: step.id });
    }
    if (!entries(step.workflow.postconditions).length) {
      addIssue(issues, 'workflow-postconditions-required', { stepId: step.id });
    }
  }

  if (steps.length && !workflows.length) addIssue(issues, 'workflow-definition-required');
  for (const workflow of workflows) {
    const workflowId = nonEmptyString(workflow.id) ? workflow.id : null;
    if (!workflowId) addIssue(issues, 'workflow-id-required');
    requireLocalizedValue(issues, workflow.title, `workflows.${workflowId || 'unknown'}.title`, 'workflow-localization-required', { workflowId });
    requireLocalizedValue(issues, workflow.summary, `workflows.${workflowId || 'unknown'}.summary`, 'workflow-localization-required', { workflowId });
    if (!Array.isArray(workflow.stepIds) || !workflow.stepIds.length) {
      addIssue(issues, 'workflow-step-references-required', { workflowId });
      continue;
    }
    for (const stepId of workflow.stepIds) {
      if (!nonEmptyString(stepId) || !stepIds.has(stepId)) {
        addIssue(issues, 'workflow-step-reference-invalid', { workflowId, stepId: stepId || null });
        continue;
      }
      referencedStepIds.add(stepId);
    }
  }

  for (const stepId of stepIds) {
    if (!referencedStepIds.has(stepId)) addIssue(issues, 'workflow-step-unreferenced', { stepId });
  }
}

function auditGuideDefinition(guide, { inventory = {}, integrationInventory = {} } = {}) {
  const issues = [];
  const definition = guide?.definition || {};
  const guideId = guide?.id || 'unknown-guide';
  const controls = entries(inventory.controls);
  const visibleControls = entries(definition.visibleControls);
  const settingsReference = entries(definition.settingsReference);
  const integrations = entries(definition.integrations);
  const sourceIntegrations = entries(integrationInventory.integrations);
  const classifications = new Map();

  auditWorkflowContracts(issues, guide, definition);

  for (const control of visibleControls) {
    if (!nonEmptyString(control.selector)) {
      addIssue(issues, 'control-selector-required', { guideId });
      continue;
    }
    if (classifications.has(control.selector)) {
      addIssue(issues, 'control-classified-more-than-once', { selector: control.selector });
      continue;
    }
    classifications.set(control.selector, control);
    if (!GUIDE_CONTROL_CLASSIFICATIONS.has(control.classification)) {
      addIssue(issues, 'control-classification-invalid', { selector: control.selector, classification: control.classification || null });
      continue;
    }
    if (control.classification === 'documented') {
      if (!nonEmptyString(control.section) || !nonEmptyString(control.stepId)) {
        addIssue(issues, 'control-documentation-reference-required', { selector: control.selector });
      }
    } else {
      requireLocalizedValue(issues, control.reason, `visibleControls.${control.selector}.reason`, 'control-reason-required', { selector: control.selector });
    }
  }

  for (const control of controls) {
    if (!nonEmptyString(control.selector)) continue;
    if (!classifications.has(control.selector)) addIssue(issues, 'control-unclassified', { selector: control.selector });
  }

  const documentedSelectors = new Set([...classifications.values()]
    .filter((control) => control.classification === 'documented')
    .map((control) => control.selector));
  const settingsBySelector = new Map();
  for (const setting of settingsReference) {
    if (!nonEmptyString(setting.selector)) {
      addIssue(issues, 'setting-selector-required', { guideId });
      continue;
    }
    if (settingsBySelector.has(setting.selector)) {
      addIssue(issues, 'setting-duplicated', { selector: setting.selector });
      continue;
    }
    settingsBySelector.set(setting.selector, setting);
    if (!documentedSelectors.has(setting.selector)) {
      addIssue(issues, 'setting-without-documented-control', { selector: setting.selector });
    }
    for (const field of ['purpose', 'defaultValue', 'values', 'dependencies']) {
      requireLocalizedValue(issues, setting[field], `settingsReference.${setting.selector}.${field}`, 'setting-localization-required', { selector: setting.selector, field });
    }
  }
  for (const selector of documentedSelectors) {
    if (!settingsBySelector.has(selector)) addIssue(issues, 'setting-missing', { selector });
  }

  const integrationKeys = new Set();
  for (const integration of integrations) {
    if (!GUIDE_INTEGRATION_TYPES.has(integration.type)) {
      addIssue(issues, 'integration-type-invalid', { type: integration.type || null, value: integration.value || null });
      continue;
    }
    if (!nonEmptyString(integration.value)) {
      addIssue(issues, 'integration-value-required', { type: integration.type });
      continue;
    }
    const key = integrationKey(integration);
    if (integrationKeys.has(key)) addIssue(issues, 'integration-duplicated', { type: integration.type, value: integration.value });
    integrationKeys.add(key);
    requireLocalizedValue(issues, integration.description, `integrations.${integration.type}.${integration.value}.description`, 'integration-localization-required', { type: integration.type, value: integration.value });
  }
  for (const integration of sourceIntegrations) {
    if (!nonEmptyString(integration.type) || !nonEmptyString(integration.value)) continue;
    if (!integrationKeys.has(integrationKey(integration))) {
      addIssue(issues, 'integration-missing', { type: integration.type, value: integration.value });
    }
  }

  auditEditorialQuality(issues, definition, controls, sourceIntegrations);

  return {
    guideId,
    compliant: issues.length === 0,
    issues,
    summary: {
      errors: issues.length,
      controls: controls.length,
      classifications: visibleControls.length,
      settings: settingsReference.length,
      integrations: sourceIntegrations.length
    }
  };
}

function auditGuideDefinitions(guides, options = {}) {
  const reports = entries(guides).map((guide) => auditGuideDefinition(guide, {
    inventory: typeof options.inventoryForGuide === 'function' ? options.inventoryForGuide(guide) : {},
    integrationInventory: typeof options.integrationInventoryForGuide === 'function' ? options.integrationInventoryForGuide(guide) : {}
  }));
  const errors = reports.reduce((count, report) => count + report.summary.errors, 0);
  return {
    compliant: errors === 0,
    reports,
    summary: { guides: reports.length, errors }
  };
}

function formatGuideContractAudit(audit) {
  const reports = entries(audit?.reports);
  const errors = reports.reduce((count, report) => count + (report.summary?.errors || 0), 0);
  const lines = [`GuideDefinition contract audit: ${reports.length} guide(s), ${errors} error(s).`];
  for (const report of reports.filter((entry) => entry.summary?.errors)) {
    lines.push(`${report.guideId}: ${report.summary.errors} error(s)`);
    for (const issue of report.issues) {
      const target = issue.selector || issue.path || issue.value || '';
      lines.push(`  - ${issue.code}${target ? `: ${target}` : ''}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  GUIDE_CONTROL_CLASSIFICATIONS,
  GUIDE_INTEGRATION_TYPES,
  auditGuideDefinition,
  auditGuideDefinitions,
  formatGuideContractAudit
};
