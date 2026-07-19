'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { BUILT_IN_SHOW_DEFINITIONS } = require('../plugins/webgpu-fireworks/lib/built-in-shows');
const {
  RevisionedShowRepository,
  ShowRepositoryError,
  STORE_VERSION
} = require('../plugins/webgpu-fireworks/lib/show-repository');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
