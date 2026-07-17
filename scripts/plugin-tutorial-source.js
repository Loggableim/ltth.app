'use strict';

// The public tutorial catalog is assembled from the complete contracts that
// live in scripts/plugin-guides/<id>.js. This file intentionally performs
// inventory validation and runtime composition only; no guide prose, selectors
// or workflow steps belong here.
const { createGuideDefinition } = require('./plugin-guides/definition');
const { collectGuideUiInventory, collectPluginIntegrationInventory } = require('./lib/plugin-guide-ui-inventory');
const { loadPublishedPluginCatalog } = require('./lib/published-plugin-catalog');

const LOCALES = ['de', 'en', 'es', 'fr'];
const GUIDE_MODULES = require('./plugin-guides');

function assertLocalized(contract, name, valueType = 'object') {
  for (const locale of LOCALES) {
    if (!contract[locale] || typeof contract[locale] !== valueType) {
      throw new Error(`Guide contract ${name} is missing locale ${locale}`);
    }
  }
}

function assertGuideContract(guide) {
  if (!guide || !guide.id || !guide.route || !guide.copy || !Array.isArray(guide.steps)) {
    throw new Error(`Incomplete guide contract for ${guide?.id || 'unknown guide'}`);
  }
  assertLocalized(guide.copy, `${guide.id}.copy`);
  assertLocalized(guide.topic, `${guide.id}.topic`, 'string');
  assertLocalized(guide.test, `${guide.id}.test`, 'string');
  if (!guide.steps.length) throw new Error(`Guide contract ${guide.id} has no workflow steps`);
  for (const step of guide.steps) {
    if (!step.id || !step.capture?.route || !step.capture?.assertVisible || !step.capture?.action) {
      throw new Error(`Incomplete workflow step in ${guide.id}`);
    }
    assertLocalized(step.copy, `${guide.id}.${step.id}.copy`);
  }
}

function interactionCondition(step) {
  const action = step.capture.action || {};
  if (action.type === 'set-demo-value') {
    return {
      type: 'interaction',
      selector: action.inputSelector || step.capture.assertVisible,
      expected: { type: 'set-demo-value', changed: true }
    };
  }
  if (action.allowClick) {
    return {
      type: 'interaction',
      selector: action.clickSelector || step.capture.assertVisible,
      expected: { type: action.type, changed: true }
    };
  }
  if (action.prepare) {
    return {
      type: 'interaction',
      selector: action.preparationEvidenceSelector || action.inputSelector || action.clickSelector || step.capture.assertVisible,
      expected: { type: 'prepare', changed: true }
    };
  }
  return null;
}

function captureEvidenceStep(step) {
  const condition = interactionCondition(step);
  const stateChange = Boolean(step.workflow.captureRule?.stateChange);
  if (!stateChange) return step;
  if (!condition) {
    return {
      ...step,
      workflow: {
        ...step.workflow,
        captureRule: { ...step.workflow.captureRule, stateChange: false }
      }
    };
  }
  if (step.workflow.postconditions.some((postcondition) => postcondition.type === 'interaction')) return step;
  return {
    ...step,
    workflow: {
      ...step.workflow,
      postconditions: [...step.workflow.postconditions, condition]
    }
  };
}

function buildGuides(repoRoot) {
  const catalog = loadPublishedPluginCatalog(repoRoot);
  const manifests = catalog.plugins;
  const byId = new Map(GUIDE_MODULES.map((guide) => [guide.id, guide]));
  const expectedIds = catalog.guideIds;
  const definedIds = [...byId.keys()].sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(definedIds)) {
    const missing = expectedIds.filter((id) => !byId.has(id));
    const stale = definedIds.filter((id) => !expectedIds.includes(id));
    throw new Error(`Tutorial definition inventory mismatch. Missing: ${missing.join(', ') || 'none'}; stale: ${stale.join(', ') || 'none'}`);
  }

  const storeAdmin = catalog.storeAdmin;
  return [...manifests, storeAdmin].map((record) => {
    const contract = byId.get(record.id);
    assertGuideContract(contract);
    const name = contract.copy.en.title;
    const overlay = contract.overlay || null;
    const steps = contract.steps.map(captureEvidenceStep);
    const copy = contract.copy;
    return {
      id: record.id,
      name,
      version: record.version || 'current',
      devStatus: record.devStatus || record.accessType || 'available',
      category: record.category || 'plugin',
      copy,
      related: contract.related || [],
      overlay,
      capture: { fixture: { profile: `docs-${record.id}`, externalPolicy: 'blocked', mode: contract.mode || 'ui' } },
      steps,
      definition: createGuideDefinition({
        name,
        version: record.version || 'current',
        entry: contract,
        copy,
        steps,
        overlay,
        inventory: collectGuideUiInventory(repoRoot, { id: record.id, definition: { activation: { route: contract.route } } }),
        integrationInventory: collectPluginIntegrationInventory(repoRoot, record.id, contract.route)
      })
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

module.exports = { LOCALES, buildGuides };
