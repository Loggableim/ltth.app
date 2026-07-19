'use strict';

const { validateShowDefinition } = require('./pyrodsl');

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJson(value[key])]));
}

function jsonDeepEqual(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function lifecycleDefaults() {
  return {
    validation: null,
    validatedRevision: null,
    publishedDefinition: null,
    publishedRevision: null,
    publishedAt: null,
    archived: false,
    archivedAt: null,
    restoredAt: null
  };
}

function normalizeLifecycleRecord(record) {
  return {
    ...record,
    ...Object.fromEntries(Object.entries(lifecycleDefaults())
      .filter(([key]) => !hasOwn(record, key)))
  };
}

function assertValidPersistedLifecycle(record) {
  const hasValidation = record.validation !== null;
  const validationValid = !hasValidation || (
    isObject(record.validation)
    && typeof record.validation.valid === 'boolean'
    && Array.isArray(record.validation.errors)
    && isObject(record.validation.diagnostics)
  );
  const validatedRevisionValid = record.validatedRevision === null || (
    Number.isInteger(record.validatedRevision)
    && record.validatedRevision >= 1
    && record.validatedRevision <= record.revision
  );
  if (!validationValid || !validatedRevisionValid
    || hasValidation !== (record.validatedRevision !== null)) {
    throw new Error(`Invalid custom show validation lifecycle: ${record.id}`);
  }
  if (hasValidation) {
    const validatedSnapshot = record.revisions[record.validatedRevision - 1];
    const expectedValidation = validateShowDefinition(validatedSnapshot.definition);
    if (!jsonDeepEqual(record.validation, expectedValidation)) {
      throw new Error(`Forged or stale custom show validation result: ${record.id}`);
    }
  }

  const hasPublishedDefinition = record.publishedDefinition !== null;
  const publishedRevisionValid = record.publishedRevision === null || (
    Number.isInteger(record.publishedRevision)
    && record.publishedRevision >= 1
    && record.publishedRevision <= record.revision
  );
  const publishedAtValid = record.publishedAt === null || Number.isFinite(record.publishedAt);
  if (!publishedRevisionValid || !publishedAtValid
    || hasPublishedDefinition !== (record.publishedRevision !== null)
    || hasPublishedDefinition !== (record.publishedAt !== null)) {
    throw new Error(`Invalid custom show publication lifecycle: ${record.id}`);
  }
  if (hasPublishedDefinition) {
    const publishedSnapshot = record.revisions[record.publishedRevision - 1];
    const publishedValidation = validateShowDefinition(record.publishedDefinition);
    const publishedValid = isObject(record.publishedDefinition)
      && record.publishedDefinition.id === record.id
      && jsonDeepEqual(record.publishedDefinition, publishedSnapshot.definition)
      && publishedValidation.valid;
    if (!publishedValid) throw new Error(`Invalid published custom show snapshot: ${record.id}`);
  }

  const archiveValid = typeof record.archived === 'boolean'
    && (record.archivedAt === null || Number.isFinite(record.archivedAt))
    && (record.restoredAt === null || Number.isFinite(record.restoredAt))
    && (!record.archived || record.archivedAt !== null);
  if (!archiveValid) throw new Error(`Invalid custom show archive lifecycle: ${record.id}`);
}

module.exports = {
  assertValidPersistedLifecycle,
  canonicalJson,
  jsonDeepEqual,
  lifecycleDefaults,
  normalizeLifecycleRecord
};
