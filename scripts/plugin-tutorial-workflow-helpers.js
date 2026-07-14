'use strict';

const LOCALES = ['de', 'en', 'es', 'fr'];

function L(de, en, es, fr) {
  return { de, en, es, fr };
}

function localized(value, label) {
  for (const locale of LOCALES) {
    if (!value || typeof value[locale] !== 'string' || !value[locale].trim()) {
      throw new Error(`${label} is missing ${locale}`);
    }
  }
  return value;
}

function localizedStepCopy(value, label) {
  for (const locale of LOCALES) {
    const copy = value && value[locale];
    for (const field of ['title', 'body', 'expected', 'alt']) {
      if (!copy || typeof copy[field] !== 'string' || !copy[field].trim()) {
        throw new Error(`${label} is missing ${locale} ${field}`);
      }
    }
  }
  return value;
}

function step(id, route, selector, copy, options = {}) {
  localizedStepCopy(copy, `Step ${id} copy`);
  const operations = options.operations || [{ type: 'inspect', selector }];
  const postconditions = options.postconditions || [{ type: 'visible', selector }];
  return {
    id,
    copy,
    capture: {
      route,
      assertVisible: selector,
      focusText: Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale].title])),
      action: { type: 'run-browser-workflow', stepId: id },
      operations,
      postconditions,
      expected: Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale].expected]))
    }
  };
}

function guide(definition) {
  const required = ['id', 'route', 'requirement', 'safety', 'mode', 'copy', 'steps'];
  for (const key of required) {
    if (definition[key] === undefined || definition[key] === null) throw new Error(`Guide is missing ${key}`);
  }
  for (const locale of LOCALES) {
    const copy = definition.copy[locale];
    for (const field of ['title', 'summary', 'firstResult', 'requirements', 'safety', 'troubleshooting']) {
      if (!copy || typeof copy[field] !== 'string' || !copy[field].trim()) {
        throw new Error(`${definition.id} guide copy is missing ${locale} ${field}`);
      }
    }
  }
  if (definition.steps.length < 5 || definition.steps.length > 9) {
    throw new Error(`${definition.id} must define 5–9 workflow steps`);
  }
  return { ...definition, explicit: true };
}

module.exports = { LOCALES, L, step, guide };
