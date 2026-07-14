'use strict';

function pathWithoutSearch(value) {
  try {
    const url = new URL(value, 'http://ltth.local');
    return url.pathname;
  } catch (_) {
    return String(value || '').split('?')[0];
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
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) return expected[locale];
  return expected;
}

function evaluatePostcondition(condition, { httpStatus, state, consoleErrors, locale }) {
  const expected = localizedExpected(condition.expected, locale);
  const evaluated = { ...condition, expected };
  switch (condition.type) {
    case 'http-status':
      return { ...evaluated, actual: httpStatus, passed: httpStatus < 400 };
    case 'url': {
      const actual = pathWithoutSearch(state.route);
      return { ...evaluated, actual, passed: actual === pathWithoutSearch(expected) };
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
    default:
      return { ...evaluated, actual: null, passed: false, error: `Unsupported postcondition type: ${condition.type}` };
  }
}

function createCaptureReceipt({ asset, locale, appVersion, screenshotPath, sha256, httpStatus, state, consoleErrors = [], preparation = [] }) {
  const workflow = asset.workflow;
  if (!workflow || !Array.isArray(workflow.operations) || !Array.isArray(workflow.postconditions)) {
    throw new Error(`Capture asset ${asset.id || asset.guideId} is missing a WorkflowStep contract`);
  }
  return {
    schemaVersion: 1,
    plugin: asset.guideId,
    language: locale,
    appVersion,
    route: asset.route,
    operations: workflow.operations,
    postconditions: [
      ...workflow.postconditions.map((condition) => evaluatePostcondition(condition, { httpStatus, state, consoleErrors, locale })),
      { type: 'screenshot-hash', actual: sha256, passed: Boolean(sha256) }
    ],
    screenshotPath,
    sha256,
    preparation
  };
}

module.exports = { createCaptureReceipt, evaluatePostcondition };
