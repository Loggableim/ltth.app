'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { BUILT_IN_SHOW_DEFINITIONS } = require('./built-in-shows');
const {
  deriveShowVariants,
  PyroDSLValidationError,
  validateShowDefinition
} = require('./pyrodsl');
const {
  assertCurrentDefinitionProvenance,
  assertValidPersistedLifecycle,
  canonicalJson,
  lifecycleDefaults,
  normalizeLifecycleRecord
} = require('./show-repository-lifecycle');

const STORE_VERSION = 1;
const STORE_FILE_NAME = 'custom-shows.json';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  }
  return value;
}

class ShowRepositoryError extends Error {
  constructor(code, status, message, details = {}) {
    super(message);
    this.name = 'ShowRepositoryError';
    this.code = code;
    this.status = status;
    this.details = cloneJson(details);
  }
}

class RevisionedShowRepository {
  constructor(options = {}) {
    if (typeof options.dataDir !== 'string' || !options.dataDir.trim()) {
      throw new ShowRepositoryError(
        'DATA_DIRECTORY_REQUIRED',
        500,
        'A plugin data directory is required for the show repository.'
      );
    }

    this.dataDir = options.dataDir;
    this.filePath = path.join(this.dataDir, options.fileName || STORE_FILE_NAME);
    this.backupPath = `${this.filePath}.bak`;
    this.tempPath = `${this.filePath}.tmp`;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.idFactory = typeof options.idFactory === 'function' ? options.idFactory : () => crypto.randomUUID();
    this.logger = options.logger || (() => {});
    this.builtIns = isObject(options.builtIns)
      ? deepFreeze(cloneJson(options.builtIns))
      : BUILT_IN_SHOW_DEFINITIONS;
    this.records = {};
    this.loaded = false;
  }

  load() {
    const candidates = [this.filePath, this.backupPath, this.tempPath]
      .map(candidatePath => this._readCandidate(candidatePath));
    const selected = candidates.find(candidate => candidate.valid);
    const existing = candidates.filter(candidate => candidate.exists);

    if (!selected) {
      if (existing.length > 0) {
        throw new ShowRepositoryError(
          'STORE_CORRUPT',
          500,
          'No valid custom show repository file could be recovered.',
          { candidates: candidates.map(candidate => candidate.path) }
        );
      }
      this.records = {};
      this.loaded = true;
      return this.list();
    }

    this.records = cloneJson(selected.value.records);
    this.loaded = true;
    if (selected.path !== this.filePath) {
      this._writeStore(this._snapshotStore(), {
        preserveTempOnFailure: selected.path === this.tempPath
      });
    } else {
      fs.rmSync(this.tempPath, { force: true });
    }
    return this.list();
  }

  list() {
    this._ensureLoaded();
    const builtIns = Object.entries(this.builtIns).map(([id, definition]) => (
      this._builtInRecord(id, definition)
    ));
    const custom = Object.keys(this.records).sort().map(id => cloneJson(this.records[id]));
    return cloneJson([...builtIns, ...custom]);
  }

  get(id) {
    this._ensureLoaded();
    if (hasOwn(this.builtIns, id)) {
      return cloneJson(this._builtInRecord(id, this.builtIns[id]));
    }
    if (!hasOwn(this.records, id)) {
      throw new ShowRepositoryError(
        'SHOW_NOT_FOUND',
        404,
        'Show definition was not found.',
        { id }
      );
    }
    const record = this.records[id];
    return cloneJson(record);
  }

  create(definition) {
    this._ensureLoaded();
    if (!isObject(definition)) {
      throw new ShowRepositoryError(
        'INVALID_DEFINITION',
        400,
        'A custom show draft must be a JSON object.'
      );
    }

    const id = this._nextCustomId();
    const ownedDefinition = this._ownedDefinition(definition, id);
    return this._createCustomRecord(id, ownedDefinition);
  }

  duplicate(sourceId, options = {}) {
    this._ensureLoaded();
    const duplicateOptions = isObject(options) ? options : {};
    const source = this.get(sourceId);
    const id = this._nextCustomId();
    const definition = this._ownedDefinition(source.definition, id);
    const sourceName = isObject(definition.metadata) && typeof definition.metadata.name === 'string'
      ? definition.metadata.name
      : 'Untitled Show';
    if (!isObject(definition.metadata)) definition.metadata = {};
    definition.metadata.name = hasOwn(duplicateOptions, 'name')
      ? duplicateOptions.name
      : `${sourceName} Copy`;
    definition.autoEligible = false;

    const validation = validateShowDefinition(definition);
    if (!validation.valid) {
      throw new ShowRepositoryError(
        'DUPLICATE_VALIDATION_FAILED',
        422,
        'The duplicated show definition did not pass PyroDSL validation.',
        {
          sourceId,
          errors: validation.errors,
          diagnostics: validation.diagnostics
        }
      );
    }
    return this._createCustomRecord(id, definition);
  }

  derive(id, expectedRevision, options = {}) {
    this._ensureLoaded();
    if (isObject(expectedRevision)) {
      options = expectedRevision;
      expectedRevision = options.expectedRevision;
    }
    if (!isObject(options)) options = {};
    if (hasOwn(this.builtIns, id)) {
      throw new ShowRepositoryError(
        'BUILT_IN_IMMUTABLE',
        409,
        'Built-in show definitions are immutable.',
        { id }
      );
    }

    const current = this._customRecord(id);
    this._assertExpectedRevision(current, expectedRevision);
    let definition;
    try {
      definition = deriveShowVariants(current.definition, {
        variants: options.variants,
        seed: options.seed,
        overwrite: options.overwrite
      });
    } catch (error) {
      if (!(error instanceof PyroDSLValidationError)) throw error;
      throw new ShowRepositoryError(
        'DERIVATION_FAILED',
        422,
        'The custom show variants could not be derived.',
        {
          id,
          currentRevision: current.revision,
          errors: error.errors,
          diagnostics: error.diagnostics
        }
      );
    }
    return this.saveDraft(id, definition, expectedRevision);
  }

  importDefinition(input) {
    this._ensureLoaded();
    let definition = input;
    if (typeof input === 'string') {
      try {
        definition = JSON.parse(input);
      } catch {
        throw new ShowRepositoryError(
          'IMPORT_JSON_INVALID',
          400,
          'The imported show is not valid JSON.',
          { inputType: 'string' }
        );
      }
    }
    if (!isObject(definition)) {
      throw new ShowRepositoryError(
        'IMPORT_DEFINITION_REQUIRED',
        400,
        'The imported show definition must be a JSON object.',
        { actualType: jsonType(definition) }
      );
    }

    let importedDefinition;
    try {
      importedDefinition = cloneJson(definition);
    } catch {
      throw new ShowRepositoryError(
        'IMPORT_DEFINITION_INVALID',
        400,
        'The imported show definition must be JSON serializable.',
        { inputType: 'object' }
      );
    }
    if (!isObject(importedDefinition)) {
      throw new ShowRepositoryError(
        'IMPORT_DEFINITION_REQUIRED',
        400,
        'The imported show definition must be a JSON object.',
        { actualType: jsonType(importedDefinition) }
      );
    }

    const id = this._nextCustomId();
    const ownedDefinition = this._ownedDefinition(importedDefinition, id);
    const validation = validateShowDefinition(ownedDefinition);
    if (!validation.valid) {
      throw new ShowRepositoryError(
        'IMPORT_VALIDATION_FAILED',
        400,
        'The imported show definition did not pass PyroDSL validation.',
        {
          errors: validation.errors,
          diagnostics: validation.diagnostics
        }
      );
    }
    return this._createCustomRecord(id, ownedDefinition, {
      validation,
      validatedRevision: 1
    });
  }

  exportDefinition(id) {
    const definition = this.get(id).definition;
    const validation = validateShowDefinition(definition);
    if (!validation.valid) {
      throw new ShowRepositoryError(
        'EXPORT_VALIDATION_FAILED',
        422,
        'The show definition did not pass PyroDSL validation and cannot be exported.',
        {
          id,
          errors: validation.errors,
          diagnostics: validation.diagnostics
        }
      );
    }
    return cloneJson(definition);
  }

  exportJson(id) {
    return `${JSON.stringify(canonicalJson(this.exportDefinition(id)), null, 2)}\n`;
  }

  saveDraft(id, definition, expectedRevision) {
    this._ensureLoaded();
    if (hasOwn(this.builtIns, id)) {
      throw new ShowRepositoryError(
        'BUILT_IN_IMMUTABLE',
        409,
        'Built-in show definitions are immutable.',
        { id }
      );
    }

    if (!hasOwn(this.records, id)) {
      throw new ShowRepositoryError(
        'SHOW_NOT_FOUND',
        404,
        'Show definition was not found.',
        { id }
      );
    }
    const current = this.records[id];
    if (!Number.isInteger(expectedRevision)) {
      throw new ShowRepositoryError(
        'EXPECTED_REVISION_REQUIRED',
        400,
        'expectedRevision must be an integer.',
        { id, currentRevision: current.revision }
      );
    }
    if (expectedRevision !== current.revision) {
      throw new ShowRepositoryError(
        'REVISION_CONFLICT',
        409,
        'The custom show draft was changed by another writer.',
        { id, expectedRevision, currentRevision: current.revision }
      );
    }
    if (!isObject(definition)) {
      throw new ShowRepositoryError(
        'INVALID_DEFINITION',
        400,
        'A custom show draft must be a JSON object.',
        { id }
      );
    }

    const previous = cloneJson(current);
    const ownedDefinition = this._ownedDefinition(definition, id);
    const revision = current.revision + 1;
    const timestamp = this.now();
    current.revision = revision;
    current.definition = cloneJson(ownedDefinition);
    current.revisions.push({
      revision,
      savedAt: timestamp,
      definition: cloneJson(ownedDefinition)
    });
    current.updatedAt = timestamp;
    current.validation = null;
    current.validatedRevision = null;

    this._persistOrRollback(() => {
      this.records[id] = previous;
    });
    return cloneJson(current);
  }

  validate(id, expectedRevision) {
    this._ensureLoaded();
    if (hasOwn(this.builtIns, id)) {
      const record = this._builtInRecord(id, this.builtIns[id]);
      record.validation = validateShowDefinition(record.definition);
      record.validatedRevision = 0;
      return cloneJson(record);
    }

    const current = this._customRecord(id);
    this._assertExpectedRevision(current, expectedRevision);
    const previous = cloneJson(current);
    current.validation = validateShowDefinition(current.definition);
    current.validatedRevision = current.revision;
    current.updatedAt = this.now();
    this._persistOrRollback(() => {
      this.records[id] = previous;
    });
    return cloneJson(current);
  }

  publish(id, expectedRevision) {
    this._ensureLoaded();
    if (hasOwn(this.builtIns, id)) {
      throw new ShowRepositoryError(
        'BUILT_IN_IMMUTABLE',
        409,
        'Built-in show definitions are already published and immutable.',
        { id }
      );
    }

    const current = this._customRecord(id);
    this._assertExpectedRevision(current, expectedRevision);
    try {
      assertCurrentDefinitionProvenance(current);
    } catch {
      throw new ShowRepositoryError(
        'DRAFT_PROVENANCE_MISMATCH',
        409,
        'The current custom show draft is detached from its revision history.',
        { id, currentRevision: current.revision }
      );
    }
    if (!current.validation || current.validatedRevision === null) {
      throw new ShowRepositoryError(
        'DRAFT_NOT_VALIDATED',
        409,
        'The current custom show draft has not been validated.',
        { id, currentRevision: current.revision }
      );
    }
    if (current.validatedRevision !== current.revision) {
      throw new ShowRepositoryError(
        'DRAFT_VALIDATION_STALE',
        409,
        'The saved validation does not match the current custom show revision.',
        { id, validatedRevision: current.validatedRevision, currentRevision: current.revision }
      );
    }
    const freshValidation = validateShowDefinition(current.definition);
    if (current.validation.valid !== true || freshValidation.valid !== true) {
      throw new ShowRepositoryError(
        'DRAFT_VALIDATION_FAILED',
        422,
        'The current custom show draft did not pass PyroDSL validation.',
        {
          id,
          currentRevision: current.revision,
          errors: freshValidation.valid ? current.validation.errors : freshValidation.errors
        }
      );
    }

    const previous = cloneJson(current);
    const timestamp = this.now();
    current.publishedDefinition = cloneJson(current.definition);
    current.publishedRevision = current.revision;
    current.publishedAt = timestamp;
    current.updatedAt = timestamp;
    this._persistOrRollback(() => {
      this.records[id] = previous;
    });
    return cloneJson(current);
  }

  getPublishedDefinition(id) {
    this._ensureLoaded();
    if (hasOwn(this.builtIns, id)) return cloneJson(this.builtIns[id]);
    const current = this._customRecord(id);
    if (current.archived) {
      throw new ShowRepositoryError(
        'SHOW_ARCHIVED',
        409,
        'The requested custom show is archived.',
        { id }
      );
    }
    if (!current.publishedDefinition) {
      throw new ShowRepositoryError(
        'SHOW_NOT_PUBLISHED',
        404,
        'The requested custom show has not been published.',
        { id }
      );
    }
    return cloneJson(current.publishedDefinition);
  }

  getSelectableStyles() {
    this._ensureLoaded();
    const selectable = Object.entries(this.builtIns).map(([id, definition]) => (
      this._styleMetadata(id, definition, true, 0)
    ));
    for (const id of Object.keys(this.records).sort()) {
      const record = this.records[id];
      if (record.archived || !record.publishedDefinition) continue;
      selectable.push(this._styleMetadata(
        id,
        record.publishedDefinition,
        false,
        record.publishedRevision
      ));
    }
    return cloneJson(selectable);
  }

  getAutoEligibleStyleIds() {
    const seen = new Set();
    const result = [];
    for (const style of this.getSelectableStyles()) {
      if (style.autoEligible !== true || seen.has(style.id)) continue;
      seen.add(style.id);
      result.push(style.id);
    }
    return result;
  }

  archive(id, expectedRevision) {
    return this._setArchived(id, expectedRevision, true);
  }

  restore(id, expectedRevision) {
    return this._setArchived(id, expectedRevision, false);
  }

  _ensureLoaded() {
    if (!this.loaded) this.load();
  }

  _builtInRecord(id, definition) {
    const ownedDefinition = cloneJson(definition);
    return {
      id,
      builtIn: true,
      revision: 0,
      definition: ownedDefinition,
      revisions: []
    };
  }

  _customRecord(id) {
    if (!hasOwn(this.records, id)) {
      throw new ShowRepositoryError(
        'SHOW_NOT_FOUND',
        404,
        'Show definition was not found.',
        { id }
      );
    }
    return this.records[id];
  }

  _assertExpectedRevision(record, expectedRevision) {
    const id = record.id;
    if (!Number.isInteger(expectedRevision)) {
      throw new ShowRepositoryError(
        'EXPECTED_REVISION_REQUIRED',
        400,
        'expectedRevision must be an integer.',
        { id, currentRevision: record.revision }
      );
    }
    if (expectedRevision !== record.revision) {
      throw new ShowRepositoryError(
        'REVISION_CONFLICT',
        409,
        'The custom show draft was changed by another writer.',
        { id, expectedRevision, currentRevision: record.revision }
      );
    }
  }

  _styleMetadata(id, definition, builtIn, publishedRevision) {
    const metadata = {
      id,
      name: definition.metadata.name,
      description: definition.metadata.description,
      materialProfile: definition.materialProfile,
      autoEligible: definition.autoEligible === true,
      builtIn
    };
    if (!builtIn) metadata.publishedRevision = publishedRevision;
    return metadata;
  }

  _setArchived(id, expectedRevision, archived) {
    this._ensureLoaded();
    if (hasOwn(this.builtIns, id)) {
      throw new ShowRepositoryError(
        'BUILT_IN_IMMUTABLE',
        409,
        'Built-in show definitions are immutable.',
        { id }
      );
    }
    const current = this._customRecord(id);
    this._assertExpectedRevision(current, expectedRevision);
    if (current.archived === archived) return cloneJson(current);

    const previous = cloneJson(current);
    const timestamp = this.now();
    current.archived = archived;
    if (archived) current.archivedAt = timestamp;
    else current.restoredAt = timestamp;
    current.updatedAt = timestamp;
    this._persistOrRollback(() => {
      this.records[id] = previous;
    });
    return cloneJson(current);
  }

  _nextCustomId() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const factoryValue = String(this.idFactory());
      const uuid = factoryValue.startsWith('custom:') ? factoryValue.slice(7) : factoryValue;
      if (!UUID_PATTERN.test(uuid)) {
        throw new ShowRepositoryError(
          'INVALID_CUSTOM_ID',
          500,
          'The custom show ID factory did not return a UUID.',
          { factoryValue }
        );
      }
      const id = `custom:${uuid.toLowerCase()}`;
      if (!hasOwn(this.records, id) && !hasOwn(this.builtIns, id)) return id;
    }
    throw new ShowRepositoryError(
      'CUSTOM_ID_COLLISION',
      500,
      'The custom show ID factory repeatedly returned existing IDs.'
    );
  }

  _ownedDefinition(definition, id) {
    let cloned;
    try {
      cloned = cloneJson(definition);
    } catch (error) {
      throw new ShowRepositoryError(
        'INVALID_DEFINITION',
        400,
        'A custom show draft must be JSON serializable.',
        { reason: error.message }
      );
    }
    cloned.id = id;
    return cloned;
  }

  _createCustomRecord(id, ownedDefinition, {
    validation = null,
    validatedRevision = null
  } = {}) {
    const timestamp = this.now();
    const record = {
      id,
      builtIn: false,
      revision: 1,
      definition: cloneJson(ownedDefinition),
      revisions: [{
        revision: 1,
        savedAt: timestamp,
        definition: cloneJson(ownedDefinition)
      }],
      createdAt: timestamp,
      updatedAt: timestamp,
      ...lifecycleDefaults(),
      validation: validation === null ? null : cloneJson(validation),
      validatedRevision
    };

    this.records[id] = record;
    this._persistOrRollback(() => {
      delete this.records[id];
    });
    return cloneJson(record);
  }

  _snapshotStore() {
    const records = {};
    for (const id of Object.keys(this.records).sort()) records[id] = cloneJson(this.records[id]);
    return { version: STORE_VERSION, records };
  }

  _persistOrRollback(rollback) {
    try {
      this._writeStore(this._snapshotStore());
    } catch (error) {
      rollback();
      throw error;
    }
  }

  _writeStore(store, { preserveTempOnFailure = false } = {}) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const serialized = `${JSON.stringify(store, null, 2)}\n`;
    let primaryRotated = false;
    let committed = false;

    try {
      const reusableTemp = preserveTempOnFailure && this._readCandidate(this.tempPath).valid;
      if (!reusableTemp) fs.writeFileSync(this.tempPath, serialized, 'utf8');
      const primary = this._readCandidate(this.filePath);
      if (primary.exists && primary.valid) {
        fs.rmSync(this.backupPath, { force: true });
        fs.renameSync(this.filePath, this.backupPath);
        primaryRotated = true;
      } else if (primary.exists) {
        fs.rmSync(this.filePath, { force: true });
      }

      try {
        fs.renameSync(this.tempPath, this.filePath);
        committed = true;
      } catch (error) {
        if (primaryRotated && fs.existsSync(this.backupPath)) {
          try {
            fs.rmSync(this.filePath, { force: true });
            fs.copyFileSync(this.backupPath, this.filePath);
          } catch (restoreError) {
            this._warn(`Failed to restore custom show repository backup: ${restoreError.message}`);
          }
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof ShowRepositoryError) throw error;
      throw new ShowRepositoryError(
        'STORE_WRITE_FAILED',
        500,
        'Failed to persist the custom show repository.',
        { reason: error.message }
      );
    } finally {
      const durableCopyExists = !committed && preserveTempOnFailure
        && (this._readCandidate(this.filePath).valid || this._readCandidate(this.backupPath).valid);
      if (!preserveTempOnFailure || committed || durableCopyExists) {
        fs.rmSync(this.tempPath, { force: true });
      }
    }
  }

  _readCandidate(candidatePath) {
    if (!fs.existsSync(candidatePath)) {
      return { path: candidatePath, exists: false, valid: false, value: null };
    }
    try {
      const value = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
      this._assertValidStore(value);
      return { path: candidatePath, exists: true, valid: true, value };
    } catch (error) {
      this._warn(`Ignoring invalid custom show repository candidate ${candidatePath}: ${error.message}`);
      return { path: candidatePath, exists: true, valid: false, value: null };
    }
  }

  _assertValidStore(store) {
    if (!isObject(store) || store.version !== STORE_VERSION || !isObject(store.records)) {
      throw new Error(`Expected custom show store version ${STORE_VERSION}.`);
    }
    for (const [id, rawRecord] of Object.entries(store.records)) {
      const record = normalizeLifecycleRecord(rawRecord);
      const validRecord = id.startsWith('custom:')
        && UUID_PATTERN.test(id.slice(7))
        && isObject(record)
        && record.id === id
        && record.builtIn === false
        && Number.isInteger(record.revision)
        && record.revision >= 1
        && isObject(record.definition)
        && record.definition.id === id
        && Array.isArray(record.revisions)
        && record.revisions.length === record.revision;
      if (!validRecord) throw new Error(`Invalid custom show record: ${id}`);
      record.revisions.forEach((snapshot, index) => {
        const validSnapshot = isObject(snapshot)
          && snapshot.revision === index + 1
          && isObject(snapshot.definition)
          && snapshot.definition.id === id;
        if (!validSnapshot) throw new Error(`Invalid custom show revision: ${id}@${index + 1}`);
      });
      assertValidPersistedLifecycle(record);
      store.records[id] = record;
    }
  }

  _warn(message) {
    if (typeof this.logger === 'function') this.logger(message);
    else if (typeof this.logger.warn === 'function') this.logger.warn(message);
  }
}

module.exports = {
  RevisionedShowRepository,
  ShowRepositoryError,
  STORE_FILE_NAME,
  STORE_VERSION
};
