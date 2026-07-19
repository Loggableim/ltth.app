'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { BUILT_IN_SHOW_DEFINITIONS } = require('./built-in-shows');

const STORE_VERSION = 1;
const STORE_FILE_NAME = 'custom-shows.json';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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
    this.builtIns = isObject(options.builtIns) ? options.builtIns : BUILT_IN_SHOW_DEFINITIONS;
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
    if (selected.path !== this.filePath) this._writeStore(this._snapshotStore());
    else fs.rmSync(this.tempPath, { force: true });
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
    if (Object.prototype.hasOwnProperty.call(this.builtIns, id)) {
      return cloneJson(this._builtInRecord(id, this.builtIns[id]));
    }
    const record = this.records[id];
    if (!record) {
      throw new ShowRepositoryError(
        'SHOW_NOT_FOUND',
        404,
        'Show definition was not found.',
        { id }
      );
    }
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
    const timestamp = this.now();
    const snapshot = {
      revision: 1,
      savedAt: timestamp,
      definition: cloneJson(ownedDefinition)
    };
    const record = {
      id,
      builtIn: false,
      revision: 1,
      definition: cloneJson(ownedDefinition),
      revisions: [snapshot],
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.records[id] = record;
    this._persistOrRollback(() => {
      delete this.records[id];
    });
    return cloneJson(record);
  }

  saveDraft(id, definition, expectedRevision) {
    this._ensureLoaded();
    if (Object.prototype.hasOwnProperty.call(this.builtIns, id)) {
      throw new ShowRepositoryError(
        'BUILT_IN_IMMUTABLE',
        409,
        'Built-in show definitions are immutable.',
        { id }
      );
    }

    const current = this.records[id];
    if (!current) {
      throw new ShowRepositoryError(
        'SHOW_NOT_FOUND',
        404,
        'Show definition was not found.',
        { id }
      );
    }
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

    this._persistOrRollback(() => {
      this.records[id] = previous;
    });
    return cloneJson(current);
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
      if (!this.records[id] && !Object.prototype.hasOwnProperty.call(this.builtIns, id)) return id;
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

  _writeStore(store) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const serialized = `${JSON.stringify(store, null, 2)}\n`;
    let primaryRotated = false;

    try {
      fs.writeFileSync(this.tempPath, serialized, 'utf8');
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
      fs.rmSync(this.tempPath, { force: true });
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
    for (const [id, record] of Object.entries(store.records)) {
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
