'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  BUILT_IN_SHOW_DEFINITIONS,
  FINALE_STYLE_METADATA
} = require('../plugins/webgpu-fireworks/lib/built-in-shows');
const {
  RevisionedShowRepository,
  ShowRepositoryError,
  STORE_VERSION
} = require('../plugins/webgpu-fireworks/lib/show-repository');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function reverseObjectKeys(value) {
  return Object.fromEntries(Object.entries(value).reverse());
}

function canonicalizeForTest(value) {
  if (Array.isArray(value)) return value.map(canonicalizeForTest);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonicalizeForTest(value[key])]));
}

function makeDefinition(name = 'Custom Finale') {
  const definition = clone(BUILT_IN_SHOW_DEFINITIONS['classic-crescendo']);
  definition.id = 'external:must-not-survive';
  definition.metadata.name = name;
  return definition;
}

describe('RevisionedShowRepository 3A1', () => {
  let tempDir;
  let now;
  let repository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-show-repository-'));
    now = 1_000;
    repository = new RevisionedShowRepository({
      dataDir: tempDir,
      now: () => now++,
      idFactory: () => '00000000-0000-4000-8000-000000000001'
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('creates a versioned store and atomically updates immutable revision history', () => {
    const created = repository.create(makeDefinition());

    expect(created).toMatchObject({
      id: 'custom:00000000-0000-4000-8000-000000000001',
      builtIn: false,
      revision: 1
    });
    expect(created.definition.id).toBe(created.id);
    expect(created.revisions).toEqual([
      expect.objectContaining({ revision: 1, definition: expect.objectContaining({ id: created.id }) })
    ]);
    expect(JSON.parse(fs.readFileSync(repository.filePath, 'utf8'))).toMatchObject({
      version: STORE_VERSION,
      records: { [created.id]: { revision: 1 } }
    });
    expect(fs.existsSync(repository.tempPath)).toBe(false);

    const updated = repository.saveDraft(created.id, makeDefinition('Changed Finale'), 1);

    expect(updated.revision).toBe(2);
    expect(updated.definition.metadata.name).toBe('Changed Finale');
    expect(updated.definition.id).toBe(created.id);
    expect(updated.revisions.map(snapshot => snapshot.revision)).toEqual([1, 2]);
    expect(updated.revisions[0].definition.metadata.name).toBe('Custom Finale');
    expect(JSON.parse(fs.readFileSync(repository.backupPath, 'utf8')).records[created.id].revision).toBe(1);
  });

  test('requires expectedRevision and returns a typed 409 conflict with the current revision', () => {
    const created = repository.create(makeDefinition());

    expect(() => repository.saveDraft(created.id, makeDefinition(), undefined)).toThrow(expect.objectContaining({
      name: 'ShowRepositoryError',
      code: 'EXPECTED_REVISION_REQUIRED',
      status: 400
    }));
    expect(() => repository.saveDraft(created.id, makeDefinition(), 0)).toThrow(expect.objectContaining({
      name: 'ShowRepositoryError',
      code: 'REVISION_CONFLICT',
      status: 409,
      details: {
        id: created.id,
        expectedRevision: 0,
        currentRevision: 1
      }
    }));
  });

  test('reads and lists all built-ins but rejects built-in draft mutation', () => {
    const builtIn = repository.get('classic-crescendo');

    expect(builtIn).toMatchObject({ id: 'classic-crescendo', builtIn: true, revision: 0 });
    expect(repository.list().filter(record => record.builtIn)).toHaveLength(9);
    expect(() => repository.saveDraft('classic-crescendo', makeDefinition(), 0)).toThrow(expect.objectContaining({
      code: 'BUILT_IN_IMMUTABLE',
      status: 409,
      details: { id: 'classic-crescendo' }
    }));
    expect(() => repository.get('custom:missing')).toThrow(expect.objectContaining({
      code: 'SHOW_NOT_FOUND',
      status: 404,
      details: { id: 'custom:missing' }
    }));
  });

  test.each(['__proto__', 'constructor', 'toString'])(
    'returns typed not-found errors when get receives inherited key %s',
    id => {
      expect(() => repository.get(id)).toThrow(expect.objectContaining({
        name: 'ShowRepositoryError',
        code: 'SHOW_NOT_FOUND',
        status: 404,
        details: { id }
      }));
    }
  );

  test.each(['__proto__', 'constructor', 'toString'])(
    'returns typed not-found errors when saveDraft receives inherited key %s',
    id => {
      expect(() => repository.saveDraft(id, makeDefinition(), 0)).toThrow(expect.objectContaining({
        name: 'ShowRepositoryError',
        code: 'SHOW_NOT_FOUND',
        status: 404,
        details: { id }
      }));
    }
  );

  test('isolates injected built-ins from later mutation of the source catalog', () => {
    const injectedDefinition = makeDefinition('Injected Original');
    injectedDefinition.id = 'injected-show';
    const catalog = { 'injected-show': injectedDefinition };
    const isolated = new RevisionedShowRepository({ dataDir: tempDir, builtIns: catalog });

    catalog['injected-show'].metadata.name = 'External Mutation';

    expect(isolated.get('injected-show').definition.metadata.name).toBe('Injected Original');
  });

  test('returns defensive clones from create, save, get, list, and load', () => {
    const created = repository.create(makeDefinition());
    created.definition.metadata.name = 'Mutated create result';
    created.revisions[0].definition.metadata.name = 'Mutated create history';

    const saved = repository.saveDraft(created.id, makeDefinition('Saved Name'), 1);
    saved.definition.metadata.name = 'Mutated save result';
    const fetched = repository.get(created.id);
    fetched.definition.metadata.name = 'Mutated get result';
    const listed = repository.list();
    listed.find(record => record.id === created.id).definition.metadata.name = 'Mutated list result';

    const reloaded = new RevisionedShowRepository({ dataDir: tempDir });
    const loaded = reloaded.load();
    loaded.find(record => record.id === created.id).definition.metadata.name = 'Mutated load result';

    expect(reloaded.get(created.id).definition.metadata.name).toBe('Saved Name');
    expect(reloaded.get(created.id).revisions[0].definition.metadata.name).toBe('Custom Finale');
  });

  test('recovers deterministically from backup before temp and restores primary', () => {
    const created = repository.create(makeDefinition('Revision One'));
    repository.saveDraft(created.id, makeDefinition('Revision Two'), 1);
    const primaryText = fs.readFileSync(repository.filePath, 'utf8');
    const backupText = fs.readFileSync(repository.backupPath, 'utf8');

    fs.writeFileSync(repository.filePath, '{corrupt', 'utf8');
    fs.writeFileSync(repository.tempPath, primaryText, 'utf8');
    const recovered = new RevisionedShowRepository({ dataDir: tempDir });

    expect(recovered.load().find(record => record.id === created.id).revision).toBe(1);
    expect(fs.readFileSync(recovered.filePath, 'utf8')).toBe(backupText);
    expect(fs.existsSync(recovered.tempPath)).toBe(false);
  });

  test('recovers a valid orphaned temp when primary and backup are absent', () => {
    const created = repository.create(makeDefinition());
    fs.renameSync(repository.filePath, repository.tempPath);

    const recovered = new RevisionedShowRepository({ dataDir: tempDir });

    expect(recovered.load()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.id, revision: 1 })
    ]));
    expect(JSON.parse(fs.readFileSync(recovered.filePath, 'utf8')).records[created.id].revision).toBe(1);
    expect(fs.existsSync(recovered.tempPath)).toBe(false);
  });

  test('preserves the only valid temp when promotion to primary fails', () => {
    const created = repository.create(makeDefinition());
    fs.renameSync(repository.filePath, repository.tempPath);
    const tempText = fs.readFileSync(repository.tempPath, 'utf8');
    const originalRename = fs.renameSync;
    jest.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (source === repository.tempPath && target === repository.filePath) {
        const error = new Error('injected temp promotion failure');
        error.code = 'EIO';
        throw error;
      }
      return originalRename(source, target);
    });

    const recovered = new RevisionedShowRepository({ dataDir: tempDir });

    expect(() => recovered.load()).toThrow(expect.objectContaining({
      code: 'STORE_WRITE_FAILED',
      status: 500
    }));
    expect(fs.existsSync(recovered.filePath)).toBe(false);
    expect(fs.existsSync(recovered.backupPath)).toBe(false);
    expect(fs.readFileSync(recovered.tempPath, 'utf8')).toBe(tempText);
    expect(JSON.parse(fs.readFileSync(recovered.tempPath, 'utf8')).records[created.id].revision).toBe(1);
  });

  test('keeps a valid primary and discards an orphaned temp', () => {
    const created = repository.create(makeDefinition());
    fs.writeFileSync(repository.tempPath, JSON.stringify({ version: STORE_VERSION, records: {} }), 'utf8');

    const recovered = new RevisionedShowRepository({ dataDir: tempDir });

    expect(recovered.load()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.id, revision: 1 })
    ]));
    expect(fs.existsSync(recovered.tempPath)).toBe(false);
  });

  test('does not rotate a corrupt primary over the only valid backup on a later write', () => {
    const created = repository.create(makeDefinition('Good Copy'));
    fs.copyFileSync(repository.filePath, repository.backupPath);
    fs.writeFileSync(repository.filePath, '{corrupt', 'utf8');

    const recovered = new RevisionedShowRepository({
      dataDir: tempDir,
      now: () => now++
    });
    recovered.load();
    recovered.saveDraft(created.id, makeDefinition('After Recovery'), 1);

    const backup = JSON.parse(fs.readFileSync(recovered.backupPath, 'utf8'));
    expect(backup.records[created.id].revision).toBe(1);
    expect(backup.records[created.id].definition.metadata.name).toBe('Good Copy');
    expect(recovered.get(created.id).revision).toBe(2);
  });

  test('cleans a new temp and rolls memory back when an ordinary save promotion fails', () => {
    const created = repository.create(makeDefinition('Before Failed Save'));
    const originalRename = fs.renameSync;
    jest.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (source === repository.tempPath && target === repository.filePath) {
        const error = new Error('injected save promotion failure');
        error.code = 'EIO';
        throw error;
      }
      return originalRename(source, target);
    });

    expect(() => repository.saveDraft(created.id, makeDefinition('Must Roll Back'), 1)).toThrow(
      expect.objectContaining({ code: 'STORE_WRITE_FAILED', status: 500 })
    );
    expect(fs.existsSync(repository.tempPath)).toBe(false);
    expect(JSON.parse(fs.readFileSync(repository.filePath, 'utf8')).records[created.id].revision).toBe(1);
    expect(repository.get(created.id).definition.metadata.name).toBe('Before Failed Save');
    expect(repository.get(created.id).revision).toBe(1);
  });

  test('throws a structured storage error when no valid recovery candidate exists', () => {
    fs.writeFileSync(repository.filePath, '{bad', 'utf8');
    fs.writeFileSync(repository.backupPath, '{bad backup', 'utf8');
    fs.writeFileSync(repository.tempPath, '{bad temp', 'utf8');

    expect(() => repository.load()).toThrow(expect.objectContaining({
      name: 'ShowRepositoryError',
      code: 'STORE_CORRUPT',
      status: 500,
      details: { candidates: [repository.filePath, repository.backupPath, repository.tempPath] }
    }));
    expect(ShowRepositoryError).toBeInstanceOf(Function);
  });

  test('rejects persisted custom IDs that are not custom UUIDs', () => {
    const created = repository.create(makeDefinition());
    const store = JSON.parse(fs.readFileSync(repository.filePath, 'utf8'));
    const unsafeId = 'custom:not-a-uuid';
    const record = store.records[created.id];
    record.id = unsafeId;
    record.definition.id = unsafeId;
    record.revisions[0].definition.id = unsafeId;
    store.records = { [unsafeId]: record };
    fs.writeFileSync(repository.filePath, JSON.stringify(store), 'utf8');

    const recovered = new RevisionedShowRepository({ dataDir: tempDir });

    expect(() => recovered.load()).toThrow(expect.objectContaining({
      code: 'STORE_CORRUPT',
      status: 500
    }));
  });
});

describe('RevisionedShowRepository 3A2a lifecycle', () => {
  let tempDir;
  let now;
  let repository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-show-lifecycle-'));
    now = 2_000;
    repository = new RevisionedShowRepository({
      dataDir: tempDir,
      now: () => now++,
      idFactory: () => '00000000-0000-4000-8000-000000000002'
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('normalizes lifecycle defaults for new drafts and backward-compatible 3A1 records', () => {
    const created = repository.create(makeDefinition());
    expect(created).toMatchObject({
      validation: null,
      validatedRevision: null,
      publishedDefinition: null,
      publishedRevision: null,
      publishedAt: null,
      archived: false,
      archivedAt: null,
      restoredAt: null
    });

    const store = JSON.parse(fs.readFileSync(repository.filePath, 'utf8'));
    const legacy = clone(store.records[created.id]);
    for (const key of [
      'validation', 'validatedRevision', 'publishedDefinition', 'publishedRevision',
      'publishedAt', 'archived', 'archivedAt', 'restoredAt'
    ]) delete legacy[key];
    fs.writeFileSync(repository.filePath, JSON.stringify({ version: STORE_VERSION, records: {
      [created.id]: legacy
    } }), 'utf8');
    fs.rmSync(repository.backupPath, { force: true });

    const reloaded = new RevisionedShowRepository({ dataDir: tempDir });
    expect(reloaded.load().find(record => record.id === created.id)).toMatchObject({
      revision: 1,
      validation: null,
      validatedRevision: null,
      publishedDefinition: null,
      publishedRevision: null,
      publishedAt: null,
      archived: false,
      archivedAt: null,
      restoredAt: null
    });
  });

  test('rejects malformed persisted lifecycle fields instead of normalizing partial publication state', () => {
    const created = repository.create(makeDefinition());
    const store = JSON.parse(fs.readFileSync(repository.filePath, 'utf8'));
    store.records[created.id].publishedRevision = 1;
    store.records[created.id].publishedAt = 2_001;
    fs.writeFileSync(repository.filePath, JSON.stringify(store), 'utf8');
    fs.rmSync(repository.backupPath, { force: true });

    const reloaded = new RevisionedShowRepository({ dataDir: tempDir });
    expect(() => reloaded.load()).toThrow(expect.objectContaining({
      code: 'STORE_CORRUPT', status: 500
    }));
  });

  test('rejects forged persisted validation that does not match the referenced revision', () => {
    const invalidDefinition = makeDefinition();
    invalidDefinition.metadata.name = '';
    const created = repository.create(invalidDefinition);
    const store = JSON.parse(fs.readFileSync(repository.filePath, 'utf8'));
    store.records[created.id].validatedRevision = 1;
    store.records[created.id].validation = {
      valid: true,
      errors: [],
      diagnostics: { variants: {} }
    };
    fs.writeFileSync(repository.filePath, JSON.stringify(store), 'utf8');
    fs.rmSync(repository.backupPath, { force: true });

    const reloaded = new RevisionedShowRepository({ dataDir: tempDir });
    expect(() => reloaded.load()).toThrow(expect.objectContaining({
      code: 'STORE_CORRUPT', status: 500
    }));
  });

  test('recovers from a forged primary by falling back to the last valid backup', () => {
    const created = repository.create(makeDefinition('Backup Revision'));
    const invalidDefinition = makeDefinition('Forged Primary');
    invalidDefinition.metadata.name = '';
    repository.saveDraft(created.id, invalidDefinition, 1);
    const primary = JSON.parse(fs.readFileSync(repository.filePath, 'utf8'));
    primary.records[created.id].validatedRevision = 2;
    primary.records[created.id].validation = {
      valid: true,
      errors: [],
      diagnostics: { variants: {} }
    };
    fs.writeFileSync(repository.filePath, JSON.stringify(primary), 'utf8');

    const recovered = new RevisionedShowRepository({ dataDir: tempDir });
    const record = recovered.load().find(candidate => candidate.id === created.id);
    expect(record).toMatchObject({ revision: 1, definition: { metadata: { name: 'Backup Revision' } } });
    expect(JSON.parse(fs.readFileSync(recovered.filePath, 'utf8')).records[created.id].revision).toBe(1);
  });

  test('recovers when the current definition is detached from its latest valid revision snapshot', () => {
    const created = repository.create(makeDefinition('Revision Snapshot A'));
    repository.validate(created.id, 1);
    const primary = JSON.parse(fs.readFileSync(repository.filePath, 'utf8'));
    const detachedDefinition = makeDefinition('Detached Definition B');
    detachedDefinition.id = created.id;
    primary.records[created.id].definition = detachedDefinition;
    fs.writeFileSync(repository.filePath, JSON.stringify(primary), 'utf8');

    const recovered = new RevisionedShowRepository({ dataDir: tempDir });
    const record = recovered.load().find(candidate => candidate.id === created.id);
    expect(record).toMatchObject({
      revision: 1,
      definition: { metadata: { name: 'Revision Snapshot A' } },
      validation: null,
      validatedRevision: null
    });
    expect(JSON.parse(fs.readFileSync(recovered.filePath, 'utf8')).records[created.id]
      .definition.metadata.name).toBe('Revision Snapshot A');
  });

  test('revalidates the current definition inside publish and never snapshots an invalid forged draft', () => {
    const invalidDefinition = makeDefinition();
    invalidDefinition.metadata.name = '';
    const created = repository.create(invalidDefinition);
    repository.records[created.id].validatedRevision = 1;
    repository.records[created.id].validation = {
      valid: true,
      errors: [],
      diagnostics: { variants: {} }
    };

    expect(() => repository.publish(created.id, 1)).toThrow(expect.objectContaining({
      code: 'DRAFT_VALIDATION_FAILED',
      status: 422,
      details: expect.objectContaining({
        id: created.id,
        currentRevision: 1,
        errors: expect.arrayContaining([expect.objectContaining({ code: 'name_required' })])
      })
    }));
    expect(repository.get(created.id).publishedDefinition).toBeNull();
    expect(() => repository.getPublishedDefinition(created.id)).toThrow(expect.objectContaining({
      code: 'SHOW_NOT_PUBLISHED'
    }));
  });

  test('rejects a valid in-memory definition detached from the validated revision before publish', () => {
    const created = repository.create(makeDefinition('Validated Snapshot A'));
    repository.validate(created.id, 1);
    const detachedDefinition = makeDefinition('Detached Valid Definition B');
    detachedDefinition.id = created.id;
    repository.records[created.id].definition = detachedDefinition;

    expect(() => repository.publish(created.id, 1)).toThrow(expect.objectContaining({
      code: 'DRAFT_PROVENANCE_MISMATCH',
      status: 409,
      details: { id: created.id, currentRevision: 1 }
    }));
    expect(repository.get(created.id).publishedDefinition).toBeNull();
    expect(() => repository.getPublishedDefinition(created.id)).toThrow(expect.objectContaining({
      code: 'SHOW_NOT_PUBLISHED'
    }));
  });

  test('loads a published snapshot whose JSON object keys are reordered but semantically equal', () => {
    const created = repository.create(makeDefinition());
    repository.validate(created.id, 1);
    repository.publish(created.id, 1);
    const store = JSON.parse(fs.readFileSync(repository.filePath, 'utf8'));
    store.records[created.id].publishedDefinition = reverseObjectKeys(
      store.records[created.id].publishedDefinition
    );
    fs.writeFileSync(repository.filePath, JSON.stringify(store), 'utf8');
    fs.rmSync(repository.backupPath, { force: true });

    const reloaded = new RevisionedShowRepository({ dataDir: tempDir });
    const loaded = reloaded.load().find(record => record.id === created.id);
    expect(loaded).toMatchObject({ publishedRevision: 1 });
    expect(reloaded.getPublishedDefinition(created.id)).toEqual(created.definition);
  });

  test('validates only the expected current revision and persists the structured PyroDSL result', () => {
    const created = repository.create(makeDefinition());
    expect(() => repository.validate(created.id)).toThrow(expect.objectContaining({
      code: 'EXPECTED_REVISION_REQUIRED', status: 400
    }));
    expect(() => repository.validate(created.id, 0)).toThrow(expect.objectContaining({
      code: 'REVISION_CONFLICT', status: 409,
      details: { id: created.id, expectedRevision: 0, currentRevision: 1 }
    }));

    const validated = repository.validate(created.id, 1);
    expect(validated).toMatchObject({
      revision: 1,
      validatedRevision: 1,
      validation: { valid: true, errors: [], diagnostics: { variants: expect.any(Object) } }
    });
    expect(JSON.parse(fs.readFileSync(repository.filePath, 'utf8')).records[created.id])
      .toMatchObject({ validatedRevision: 1, validation: { valid: true, errors: [] } });

    const invalidDraft = makeDefinition('Invalid');
    invalidDraft.metadata.name = '';
    repository.saveDraft(created.id, invalidDraft, 1);
    const invalid = repository.validate(created.id, 2);
    expect(invalid.validation).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([expect.objectContaining({ code: 'name_required', path: 'metadata.name' })])
    });
  });

  test('validates built-ins read-only and keeps lifecycle mutations immutable', () => {
    const validated = repository.validate('classic-crescendo');
    expect(validated).toMatchObject({
      id: 'classic-crescendo',
      builtIn: true,
      revision: 0,
      validatedRevision: 0,
      validation: { valid: true, errors: [] }
    });
    expect(fs.existsSync(repository.filePath)).toBe(false);
    expect(() => repository.publish('classic-crescendo', 0)).toThrow(expect.objectContaining({
      code: 'BUILT_IN_IMMUTABLE', status: 409
    }));
    expect(() => repository.archive('classic-crescendo', 0)).toThrow(expect.objectContaining({
      code: 'BUILT_IN_IMMUTABLE', status: 409
    }));
    expect(() => repository.restore('classic-crescendo', 0)).toThrow(expect.objectContaining({
      code: 'BUILT_IN_IMMUTABLE', status: 409
    }));
  });

  test('publishes only a valid current validation and returns typed gate errors', () => {
    const created = repository.create(makeDefinition());
    expect(() => repository.publish(created.id, 1)).toThrow(expect.objectContaining({
      code: 'DRAFT_NOT_VALIDATED', status: 409,
      details: { id: created.id, currentRevision: 1 }
    }));

    const invalidDraft = makeDefinition();
    invalidDraft.metadata.name = '';
    repository.saveDraft(created.id, invalidDraft, 1);
    repository.validate(created.id, 2);
    expect(() => repository.publish(created.id, 2)).toThrow(expect.objectContaining({
      code: 'DRAFT_VALIDATION_FAILED', status: 422,
      details: expect.objectContaining({ id: created.id, currentRevision: 2, errors: expect.any(Array) })
    }));

    repository.saveDraft(created.id, makeDefinition('Valid Again'), 2);
    repository.records[created.id].validation = { valid: true, errors: [], diagnostics: { variants: {} } };
    repository.records[created.id].validatedRevision = 2;
    expect(() => repository.publish(created.id, 3)).toThrow(expect.objectContaining({
      code: 'DRAFT_VALIDATION_STALE', status: 409,
      details: { id: created.id, validatedRevision: 2, currentRevision: 3 }
    }));
  });

  test('snapshots the published revision while later draft saves clear only draft validation', () => {
    const created = repository.create(makeDefinition('Published Name'));
    repository.validate(created.id, 1);
    const published = repository.publish(created.id, 1);
    expect(published).toMatchObject({
      revision: 1,
      validatedRevision: 1,
      validation: { valid: true },
      publishedRevision: 1,
      publishedAt: 2_002,
      publishedDefinition: { id: created.id, metadata: { name: 'Published Name' } }
    });

    const edited = makeDefinition('Mutable Draft Name');
    edited.autoEligible = false;
    const saved = repository.saveDraft(created.id, edited, 1);
    expect(saved).toMatchObject({
      revision: 2,
      validation: null,
      validatedRevision: null,
      publishedRevision: 1,
      publishedDefinition: { metadata: { name: 'Published Name' }, autoEligible: true }
    });
    expect(repository.getPublishedDefinition(created.id).metadata.name).toBe('Published Name');

    const selectable = repository.getSelectableStyles().find(style => style.id === created.id);
    expect(selectable).toMatchObject({
      id: created.id,
      name: 'Published Name',
      autoEligible: true,
      builtIn: false,
      publishedRevision: 1
    });
    expect(selectable.name).not.toBe('Mutable Draft Name');
    expect(repository.getAutoEligibleStyleIds()).toContain(created.id);
  });

  test('returns published built-in snapshots and typed unavailable custom errors', () => {
    const builtIn = repository.getPublishedDefinition('classic-crescendo');
    builtIn.metadata.name = 'Caller Mutation';
    expect(repository.getPublishedDefinition('classic-crescendo').metadata.name).not.toBe('Caller Mutation');

    const created = repository.create(makeDefinition());
    expect(() => repository.getPublishedDefinition(created.id)).toThrow(expect.objectContaining({
      code: 'SHOW_NOT_PUBLISHED', status: 404, details: { id: created.id }
    }));
    repository.validate(created.id, 1);
    repository.publish(created.id, 1);
    repository.archive(created.id, 1);
    expect(() => repository.getPublishedDefinition(created.id)).toThrow(expect.objectContaining({
      code: 'SHOW_ARCHIVED', status: 409, details: { id: created.id }
    }));
  });

  test('selectors are stable, deduplicated, and expose only published unarchived custom metadata', () => {
    const created = repository.create(makeDefinition('Selector Custom'));
    expect(repository.getSelectableStyles()).toEqual(FINALE_STYLE_METADATA);
    expect(repository.getAutoEligibleStyleIds()).toEqual(Object.keys(BUILT_IN_SHOW_DEFINITIONS));

    repository.validate(created.id, 1);
    repository.publish(created.id, 1);
    expect(repository.getSelectableStyles()).toHaveLength(10);
    expect(repository.getAutoEligibleStyleIds()).toEqual([
      ...Object.keys(BUILT_IN_SHOW_DEFINITIONS), created.id
    ]);

    const first = repository.getSelectableStyles();
    first.find(style => style.id === created.id).name = 'Caller Mutation';
    expect(repository.getSelectableStyles().find(style => style.id === created.id).name).toBe('Selector Custom');
  });

  test('archives and restores without incrementing the guarded draft revision or deleting snapshots', () => {
    const created = repository.create(makeDefinition());
    repository.validate(created.id, 1);
    repository.publish(created.id, 1);

    expect(() => repository.archive(created.id, 0)).toThrow(expect.objectContaining({
      code: 'REVISION_CONFLICT', status: 409
    }));
    const archived = repository.archive(created.id, 1);
    expect(archived).toMatchObject({
      revision: 1,
      archived: true,
      archivedAt: 2_003,
      publishedRevision: 1,
      publishedDefinition: expect.any(Object),
      revisions: [expect.any(Object)]
    });
    expect(repository.getSelectableStyles().some(style => style.id === created.id)).toBe(false);
    expect(repository.getAutoEligibleStyleIds()).not.toContain(created.id);

    const restored = repository.restore(created.id, 1);
    expect(restored).toMatchObject({
      revision: 1,
      archived: false,
      archivedAt: 2_003,
      restoredAt: 2_004,
      publishedRevision: 1
    });
    expect(repository.getSelectableStyles().some(style => style.id === created.id)).toBe(true);
  });

  test('rolls lifecycle memory back when persistence fails and returns defensive clones', () => {
    const created = repository.create(makeDefinition());
    const originalRename = fs.renameSync;
    jest.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (source === repository.tempPath && target === repository.filePath) {
        throw new Error('injected lifecycle persistence failure');
      }
      return originalRename(source, target);
    });

    expect(() => repository.validate(created.id, 1)).toThrow(expect.objectContaining({
      code: 'STORE_WRITE_FAILED', status: 500
    }));
    expect(repository.get(created.id)).toMatchObject({ validation: null, validatedRevision: null });
    jest.restoreAllMocks();

    const validated = repository.validate(created.id, 1);
    validated.validation.valid = false;
    const published = repository.publish(created.id, 1);
    published.publishedDefinition.metadata.name = 'Caller Mutation';
    const fetched = repository.get(created.id);
    fetched.publishedDefinition.metadata.name = 'Second Mutation';
    expect(repository.getPublishedDefinition(created.id).metadata.name).toBe('Custom Finale');
  });
});

describe('RevisionedShowRepository 3A2b1 duplicate and derive', () => {
  let tempDir;
  let now;
  let nextId;
  let repository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-show-interchange-'));
    now = 3_000;
    nextId = 3;
    repository = new RevisionedShowRepository({
      dataDir: tempDir,
      now: () => now++,
      idFactory: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('duplicates a built-in into a safe unpublished non-auto custom draft without changing the source', () => {
    const sourceBefore = repository.get('classic-crescendo');
    const duplicated = repository.duplicate('classic-crescendo');

    expect(duplicated).toMatchObject({
      id: 'custom:00000000-0000-4000-8000-000000000003',
      builtIn: false,
      revision: 1,
      definition: {
        id: 'custom:00000000-0000-4000-8000-000000000003',
        metadata: { name: `${sourceBefore.definition.metadata.name} Copy` },
        autoEligible: false
      },
      validation: null,
      validatedRevision: null,
      publishedDefinition: null,
      publishedRevision: null
    });
    expect(repository.get('classic-crescendo')).toEqual(sourceBefore);
    expect(repository.getSelectableStyles().some(style => style.id === duplicated.id)).toBe(false);
  });

  test('duplicates the current custom definition with an explicit name and defensive isolation', () => {
    const source = repository.create(makeDefinition('Custom Source'));
    const sourceBefore = repository.get(source.id);
    const duplicated = repository.duplicate(source.id, { name: 'Safe Variant Copy' });

    expect(duplicated.definition).toEqual({
      ...source.definition,
      id: duplicated.id,
      metadata: { ...source.definition.metadata, name: 'Safe Variant Copy' },
      autoEligible: false
    });
    duplicated.definition.metadata.name = 'Caller Mutation';
    expect(repository.get(duplicated.id).definition.metadata.name).toBe('Safe Variant Copy');
    expect(repository.get(source.id)).toEqual(sourceBefore);
  });

  test('rejects duplicate sources that cannot produce a valid PyroDSL definition', () => {
    const invalid = makeDefinition('Invalid Source');
    invalid.repositoryOnly = true;
    const source = repository.create(invalid);

    expect(() => repository.duplicate(source.id)).toThrow(expect.objectContaining({
      code: 'DUPLICATE_VALIDATION_FAILED',
      status: 422,
      details: expect.objectContaining({
        sourceId: source.id,
        errors: expect.arrayContaining([
          expect.objectContaining({ code: 'unknown_property', path: 'repositoryOnly' })
        ])
      })
    }));
    expect(repository.list().filter(record => !record.builtIn)).toHaveLength(1);
  });

  test('derives selected ratios into one guarded draft revision while preserving existing variants by default', () => {
    const definition = makeDefinition('Derivation Source');
    const originalShort = clone(definition.variants.short);
    const originalMedium = clone(definition.variants.medium);
    const created = repository.create(definition);

    const preserved = repository.derive(created.id, {
      expectedRevision: 1,
      variants: ['short', 'medium'],
      seed: 7
    });
    expect(preserved).toMatchObject({
      revision: 2,
      validation: null,
      validatedRevision: null
    });
    expect(preserved.definition.variants.short).toEqual(originalShort);
    expect(preserved.definition.variants.medium).toEqual(originalMedium);

    const overwritten = repository.derive(created.id, 2, {
      variants: ['short', 'medium'], seed: 7, overwrite: true
    });
    expect(overwritten.revision).toBe(3);
    expect(overwritten.definition.variants.short).not.toEqual(originalShort);
    expect(overwritten.definition.variants.medium).not.toEqual(originalMedium);
    expect(overwritten.definition.variants.short.durationMs).toBe(10_000);
    expect(overwritten.definition.variants.medium.durationMs).toBe(18_000);
    expect(overwritten.definition.variants.short.cues).toHaveLength(7);
    expect(overwritten.definition.variants.medium.cues).toHaveLength(9);
  });

  test('derive keeps the published snapshot isolated and uses saveDraft conflict semantics', () => {
    const created = repository.create(makeDefinition('Published Source'));
    repository.validate(created.id, 1);
    repository.publish(created.id, 1);

    expect(() => repository.derive(created.id, 0, { variants: ['short'] })).toThrow(
      expect.objectContaining({
        code: 'REVISION_CONFLICT',
        status: 409,
        details: { id: created.id, expectedRevision: 0, currentRevision: 1 }
      })
    );
    const derived = repository.derive(created.id, 1, {
      variants: ['short'], seed: 17, overwrite: true
    });
    expect(derived).toMatchObject({
      revision: 2,
      validation: null,
      validatedRevision: null,
      publishedRevision: 1,
      publishedDefinition: { metadata: { name: 'Published Source' } }
    });
    expect(repository.getPublishedDefinition(created.id)).toEqual(created.definition);
  });

  test('derive rejects built-ins and maps PyroDSL failures to typed structured repository errors', () => {
    expect(() => repository.derive('classic-crescendo', 0, { variants: ['short'] })).toThrow(
      expect.objectContaining({ code: 'BUILT_IN_IMMUTABLE', status: 409 })
    );
    const created = repository.create(makeDefinition('Structured Failure'));
    expect(() => repository.derive(created.id, 1, { variants: ['long'] })).toThrow(
      expect.objectContaining({
        code: 'DERIVATION_FAILED',
        status: 422,
        details: expect.objectContaining({
          id: created.id,
          currentRevision: 1,
          errors: expect.arrayContaining([
            expect.objectContaining({ code: 'invalid_derivation_target', path: 'variants' })
          ]),
          diagnostics: expect.any(Object)
        })
      })
    );
    expect(repository.get(created.id).revision).toBe(1);
  });
});

describe('RevisionedShowRepository 3A2b2 validated canonical import/export', () => {
  let tempDir;
  let now;
  let nextId;
  let repository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-show-import-export-'));
    now = 4_000;
    nextId = 4;
    repository = new RevisionedShowRepository({
      dataDir: tempDir,
      now: () => now++,
      idFactory: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('import rejects malformed JSON and non-object inputs with typed safe 400 errors', () => {
    expect(() => repository.importDefinition('{"schemaVersion":'))
      .toThrow(expect.objectContaining({
        code: 'IMPORT_JSON_INVALID',
        status: 400,
        details: { inputType: 'string' }
      }));

    for (const [input, actualType] of [[null, 'null'], [[], 'array'], ['[]', 'array']]) {
      expect(() => repository.importDefinition(input)).toThrow(expect.objectContaining({
        code: 'IMPORT_DEFINITION_REQUIRED',
        status: 400,
        details: { actualType }
      }));
    }
    expect(repository.list().filter(record => !record.builtIn)).toHaveLength(0);
  });

  test('import rewrites external or missing IDs before strict PyroDSL validation', () => {
    const external = makeDefinition('External Identity');
    external.id = 'not valid whitespace id';
    const first = repository.importDefinition(external);
    expect(first.definition.id).toBe('custom:00000000-0000-4000-8000-000000000004');

    const missing = makeDefinition('Missing Identity');
    delete missing.id;
    const second = repository.importDefinition(missing);
    expect(second.definition.id).toBe('custom:00000000-0000-4000-8000-000000000005');

    const invalid = makeDefinition('');
    invalid.repositoryOnly = true;
    expect(() => repository.importDefinition(invalid)).toThrow(expect.objectContaining({
      code: 'IMPORT_VALIDATION_FAILED',
      status: 400,
      details: expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({ code: 'unknown_property', path: 'repositoryOnly' }),
          expect.objectContaining({ code: 'name_required', path: 'metadata.name' })
        ]),
        diagnostics: expect.any(Object)
      })
    }));
    expect(repository.list().filter(record => !record.builtIn)).toHaveLength(2);
  });

  test('import persists revision one as validated, unpublished, unarchived, and definition-only', () => {
    const source = makeDefinition('Authored Import');
    source.metadata.author = 'Pyro Author';
    source.metadata.tags = ['authored', 'canonical'];
    source.materialProfile = 'premium-realistic';
    source.autoEligible = true;

    const imported = repository.importDefinition(JSON.stringify(source));

    expect(imported).toMatchObject({
      builtIn: false,
      revision: 1,
      validation: { valid: true, errors: [], diagnostics: { variants: expect.any(Object) } },
      validatedRevision: 1,
      publishedDefinition: null,
      publishedRevision: null,
      publishedAt: null,
      archived: false,
      archivedAt: null,
      restoredAt: null,
      definition: {
        metadata: {
          name: 'Authored Import',
          author: 'Pyro Author',
          tags: ['authored', 'canonical']
        },
        materialProfile: 'premium-realistic',
        autoEligible: true,
        variants: source.variants
      }
    });
    expect(JSON.parse(fs.readFileSync(repository.filePath, 'utf8')).records[imported.id])
      .toMatchObject({ revision: 1, validatedRevision: 1, validation: { valid: true } });
  });

  test('import performs exactly one persistence mutation and rolls it back completely on failure', () => {
    const writeStore = jest.spyOn(repository, '_writeStore');
    const originalRename = fs.renameSync;
    jest.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (source === repository.tempPath && target === repository.filePath) {
        throw new Error('injected import persistence failure');
      }
      return originalRename(source, target);
    });

    expect(() => repository.importDefinition(makeDefinition('Atomic Import')))
      .toThrow(expect.objectContaining({ code: 'STORE_WRITE_FAILED', status: 500 }));
    expect(writeStore).toHaveBeenCalledTimes(1);
    expect(repository.records).toEqual({});
    expect(repository.list().filter(record => !record.builtIn)).toHaveLength(0);
    expect(fs.existsSync(repository.filePath)).toBe(false);
    expect(fs.existsSync(repository.tempPath)).toBe(false);
  });

  test('exports built-ins and current custom drafts as clean deterministic canonical JSON', () => {
    const custom = repository.create(makeDefinition('Canonical Draft'));
    const reversed = reverseObjectKeys(custom.definition);
    repository.saveDraft(custom.id, reversed, 1);

    for (const id of ['classic-crescendo', custom.id]) {
      const definition = repository.get(id).definition;
      const exported = repository.exportJson(id);
      expect(exported).toBe(`${JSON.stringify(canonicalizeForTest(definition), null, 2)}\n`);
      expect(exported.endsWith('\n')).toBe(true);
      expect(JSON.parse(exported)).toEqual(definition);
      expect(JSON.parse(exported)).not.toEqual(expect.objectContaining({
        revision: expect.anything(),
        validation: expect.anything(),
        publishedDefinition: expect.anything(),
        archived: expect.anything()
      }));
    }
  });

  test('exportDefinition returns defensive built-in and custom definition clones', () => {
    const custom = repository.create(makeDefinition('Defensive Export'));
    const builtInExport = repository.exportDefinition('classic-crescendo');
    const customExport = repository.exportDefinition(custom.id);
    builtInExport.metadata.name = 'Mutated Built-in Export';
    customExport.metadata.name = 'Mutated Custom Export';

    expect(repository.exportDefinition('classic-crescendo').metadata.name)
      .toBe(BUILT_IN_SHOW_DEFINITIONS['classic-crescendo'].metadata.name);
    expect(repository.exportDefinition(custom.id).metadata.name).toBe('Defensive Export');
  });

  test('export freshly validates and rejects invalid current drafts with structured typed errors', () => {
    const invalid = makeDefinition('Invalid Export');
    invalid.metadata.name = '';
    invalid.repositoryOnly = true;
    const custom = repository.create(invalid);

    for (const exportMethod of ['exportDefinition', 'exportJson']) {
      expect(() => repository[exportMethod](custom.id)).toThrow(expect.objectContaining({
        code: 'EXPORT_VALIDATION_FAILED',
        status: 422,
        details: expect.objectContaining({
          id: custom.id,
          errors: expect.arrayContaining([
            expect.objectContaining({ code: 'unknown_property', path: 'repositoryOnly' }),
            expect.objectContaining({ code: 'name_required', path: 'metadata.name' })
          ]),
          diagnostics: expect.any(Object)
        })
      }));
    }
  });

  test('export to import roundtrip preserves semantic content except the rewritten ID and lifecycle', () => {
    const source = makeDefinition('Roundtrip Authored Show');
    source.metadata.author = 'Roundtrip Author';
    source.metadata.tags = ['roundtrip'];
    source.autoEligible = false;
    const created = repository.create(source);
    const exportedJson = repository.exportJson(created.id);
    const imported = repository.importDefinition(exportedJson);

    expect(imported.id).not.toBe(created.id);
    expect(imported.definition).toEqual({
      ...created.definition,
      id: imported.id
    });
    expect(imported).toMatchObject({
      revision: 1,
      validatedRevision: 1,
      validation: { valid: true },
      publishedDefinition: null,
      publishedRevision: null,
      archived: false
    });
  });
});
