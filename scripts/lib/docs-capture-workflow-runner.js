'use strict';

const VISIBLE_OPERATION_TYPES = new Set([
  'open-plugin-surface',
  'inspect-readonly-api',
  'inspect-safe-store-state',
  'open-overlay-preview'
]);

const INTERACTION_OPERATION_TYPES = new Set([
  'set-demo-value',
  'select-local-source',
  'save-demo-config',
  'run-local-preview',
  'open-local-settings',
  'reset-demo-state'
]);

function routePath(value) {
  try {
    return new URL(value, 'http://ltth.local').pathname;
  } catch (_) {
    return String(value || '').split('?')[0];
  }
}

function requireSelector(operation) {
  if (typeof operation.selector !== 'string' || !operation.selector.trim()) {
    throw new Error(`Documentation workflow operation ${operation.type} requires a selector`);
  }
  return operation.selector;
}

function createBlockedNetworkEvidence({ url, method, resourceType }) {
  if (typeof url !== 'string' || !url) throw new TypeError('Blocked capture request requires a URL');
  return {
    url,
    method: method || 'GET',
    resourceType: resourceType || 'other',
    attempted: true,
    disposition: 'blocked'
  };
}

function assertWorkflowOperationsExecuted({ workflow, state = {}, interactions = [], preparation = [] }) {
  if (!workflow || !Array.isArray(workflow.operations)) {
    throw new Error('Documentation workflow requires declared operations');
  }

  return workflow.operations.map((operation) => {
    if (!operation || typeof operation.type !== 'string') {
      throw new Error('Documentation workflow operation requires a type');
    }

    if (operation.type === 'goto') {
      if (typeof operation.route !== 'string' || !operation.route) {
        throw new Error('Documentation workflow goto operation requires a route');
      }
      const observedNavigation = Array.isArray(state.navigations) && state.navigations.some((entry) => (
        entry?.observed === true && routePath(entry.route) === routePath(operation.route)
      ));
      if (routePath(state.route) !== routePath(operation.route) && !observedNavigation) {
        throw new Error(`Documentation workflow goto did not reach ${operation.route}`);
      }
      return { ...operation, observed: true };
    }

    if (operation.type === 'prepare') {
      if (typeof operation.name !== 'string' || !operation.name) {
        throw new Error('Documentation workflow prepare operation requires a name');
      }
      const observedPreparation = preparation.find((entry) => entry?.type === operation.name && entry.observed === true)
        || interactions.find((entry) => entry?.type === 'prepare' && entry.name === operation.name && entry.observed === true);
      if (!observedPreparation) {
        throw new Error(`Documentation workflow preparation ${operation.name} has no observed local evidence`);
      }
      return { ...operation, observed: true };
    }

    if (VISIBLE_OPERATION_TYPES.has(operation.type)) {
      const selector = requireSelector(operation);
      if (!state.controls?.[selector]?.visible) {
        throw new Error(`Documentation workflow operation ${operation.type} did not render ${selector}`);
      }
      return { ...operation, observed: true };
    }

    if (INTERACTION_OPERATION_TYPES.has(operation.type)) {
      const selector = requireSelector(operation);
      const interaction = interactions.find((entry) => (
        entry?.type === operation.type
        && entry.selector === selector
        && entry.status === 'performed'
      ));
      if (!interaction || interaction.observed !== true) {
        throw new Error(`Documentation workflow operation ${operation.type} has no observed local interaction evidence for ${selector}`);
      }
      return { ...operation, observed: true };
    }

    throw new Error(`Unsupported documentation workflow operation: ${operation.type}`);
  });
}

module.exports = {
  INTERACTION_OPERATION_TYPES,
  VISIBLE_OPERATION_TYPES,
  assertWorkflowOperationsExecuted,
  createBlockedNetworkEvidence
};
