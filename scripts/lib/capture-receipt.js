'use strict';

function pathWithSearch(value) {
  try {
    const url = new URL(value, 'http://ltth.local');
    return `${url.pathname}${url.search}`;
  } catch (_) {
    return String(value || '').split('#')[0];
  }
}

function controlState(state, selector) {
  if (selector && state.controls && state.controls[selector]) return state.controls[selector];
  return {
    visible: Boolean(state.anchorRect),
    text: state.anchorText || '',
    value: state.anchorValue,
    checked: state.anchorChecked,
    overlay: Boolean(state.overlayVisible)
  };
}

function matchesValue(actual, expected) {
  return expected === 'non-empty' ? Boolean(actual) : actual === expected;
}

function localizedExpected(expected, locale) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && Object.hasOwn(expected, locale)) return expected[locale];
  return expected;
}

function concreteHttpStatuses(expected) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.length || !statuses.every((status) => Number.isInteger(status) && status >= 100 && status <= 599)) {
    return null;
  }
  return statuses;
}

function matchesStructuredUrl(actual, expected, locale) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)
    || typeof expected.path !== 'string' || !expected.path.startsWith('/')) {
    return { passed: false, error: 'URL expectation requires an exact path' };
  }
  if (expected.exactQuery !== true || !expected.query || typeof expected.query !== 'object' || Array.isArray(expected.query)) {
    return { passed: false, error: 'URL expectation requires exactQuery: true and a query object' };
  }
  const queryEntries = Object.entries(expected.query);
  if (!queryEntries.every(([, value]) => typeof value === 'string')) {
    return { passed: false, error: 'URL query expectation values must be concrete strings, $locale, or non-empty' };
  }

  const url = new URL(actual, 'http://ltth.local');
  if (url.pathname !== expected.path || [...url.searchParams.keys()].length !== queryEntries.length) {
    return { passed: false };
  }
  const passed = queryEntries.every(([key, expectedValue]) => {
    const actualValues = url.searchParams.getAll(key);
    if (actualValues.length !== 1) return false;
    const actualValue = actualValues[0];
    if (expectedValue === '$locale') return actualValue === locale;
    if (expectedValue === 'non-empty') return actualValue.length > 0;
    return actualValue === expectedValue;
  });
  return { passed };
}

function normalizeNetworkEvidence(network = []) {
  if (!Array.isArray(network)) throw new Error('Capture network evidence must be an array');
  return network.map((entry) => {
    if (typeof entry === 'string') return { url: entry };
    if (!entry || typeof entry.url !== 'string') throw new Error('Capture network evidence requires a request URL');
    const normalized = { url: entry.url };
    for (const key of ['method', 'resourceType', 'status']) {
      if (entry[key] !== undefined) normalized[key] = entry[key];
    }
    return normalized;
  });
}

function isAllowedCaptureNetworkUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'data:') return true;
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch (_) {
    return false;
  }
}

function assertCaptureEvidence({ network = [], consoleErrors = [] }) {
  const normalizedNetwork = normalizeNetworkEvidence(network);
  const invalidRequest = normalizedNetwork.find((entry) => !isAllowedCaptureNetworkUrl(entry.url));
  if (invalidRequest) {
    throw new Error(`CaptureReceipt contains a non-local network request: ${invalidRequest.url}`);
  }
  if (!Array.isArray(consoleErrors)) throw new Error('Capture console evidence must be an array');
  if (consoleErrors.length) {
    throw new Error(`CaptureReceipt contains browser console errors: ${consoleErrors.join(' | ')}`);
  }
  return { network: normalizedNetwork, console: [...consoleErrors] };
}

function assertNoBlockedNetworkAttempts(blockedNetwork = []) {
  if (!Array.isArray(blockedNetwork)) throw new Error('Capture blocked-network evidence must be an array');
  const attempt = blockedNetwork[0];
  if (attempt) {
    throw new Error(`CaptureReceipt contains a blocked external network attempt: ${attempt.url || 'unknown URL'}`);
  }
}

function evaluatePostcondition(condition, { httpStatus, state, consoleErrors, interactions, locale }) {
  const expected = localizedExpected(condition.expected, locale);
  const evaluated = { ...condition, expected };
  switch (condition.type) {
    case 'http-status': {
      const statuses = concreteHttpStatuses(expected);
      if (!statuses) {
        return { ...evaluated, actual: httpStatus, passed: false, error: 'HTTP status expectation requires concrete HTTP status code(s)' };
      }
      return { ...evaluated, actual: httpStatus, passed: statuses.includes(httpStatus) };
    }
    case 'url': {
      const actual = pathWithSearch(state.route);
      if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        const result = matchesStructuredUrl(actual, expected, locale);
        return { ...evaluated, actual, ...result };
      }
      return { ...evaluated, actual, passed: actual === pathWithSearch(expected) };
    }
    case 'visible': {
      const actual = Boolean(controlState(state, condition.selector).visible);
      return { ...evaluated, actual, passed: actual };
    }
    case 'text': {
      const actual = controlState(state, condition.selector).text || '';
      return { ...evaluated, actual, passed: actual.includes(expected || '') };
    }
    case 'input-value':
    case 'field-value':
      {
        const actual = controlState(state, condition.selector).value;
        return { ...evaluated, actual, passed: matchesValue(actual, expected) };
      }
    case 'checked':
    case 'checkbox':
      {
        const actual = controlState(state, condition.selector).checked;
        return { ...evaluated, actual, passed: actual === expected };
      }
    case 'overlay-output': {
      const actual = Boolean(controlState(state, condition.selector).overlay);
      return { ...evaluated, actual, passed: expected === undefined ? actual : actual === expected };
    }
    case 'console': {
      const actual = consoleErrors || [];
      return { ...evaluated, actual, passed: actual.length === 0 };
    }
    case 'interaction': {
      const interactionExpected = expected && typeof expected === 'object' ? expected : {};
      const actual = (interactions || []).find((interaction) => (
        interaction.selector === condition.selector
        && (!interactionExpected.type || interaction.type === interactionExpected.type)
      )) || null;
      const passed = Boolean(
        actual
        && actual.status === 'performed'
        && (interactionExpected.changed === undefined || actual.changed === interactionExpected.changed)
      );
      return { ...evaluated, actual, passed };
    }
    default:
      return { ...evaluated, actual: null, passed: false, error: `Unsupported postcondition type: ${condition.type}` };
  }
}

function createCaptureReceipt({ asset, locale, appVersion, screenshotPath, sha256, httpStatus, state, consoleErrors = [], interactions = [], network = [], preparation = [] }) {
  const workflow = asset.workflow;
  if (!workflow || !Array.isArray(workflow.operations) || !Array.isArray(workflow.postconditions)) {
    throw new Error(`Capture asset ${asset.id || asset.guideId} is missing a WorkflowStep contract`);
  }
  const evidence = assertCaptureEvidence({ network, consoleErrors });
  return {
    schemaVersion: 2,
    plugin: asset.guideId,
    language: locale,
    appVersion,
    route: asset.route,
    operations: workflow.operations,
    postconditions: [
      ...workflow.postconditions.map((condition) => evaluatePostcondition(condition, { httpStatus, state, consoleErrors, interactions, locale })),
      { type: 'screenshot-hash', actual: sha256, passed: typeof sha256 === 'string' && /^[a-f0-9]{64}$/i.test(sha256) }
    ],
    screenshotPath,
    sha256,
    preparation,
    network: evidence.network,
    console: evidence.console,
    interactions: [...interactions]
  };
}

module.exports = {
  assertCaptureEvidence,
  assertNoBlockedNetworkAttempts,
  createCaptureReceipt,
  evaluatePostcondition,
  isAllowedCaptureNetworkUrl,
  normalizeNetworkEvidence
};
