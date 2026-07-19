'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const FireworksPlugin = require('../plugins/webgpu-fireworks/main');
const { BUILT_IN_SHOW_DEFINITIONS } = require('../plugins/webgpu-fireworks/lib/built-in-shows');
const { RevisionedShowRepository } = require('../plugins/webgpu-fireworks/lib/show-repository');

const CUSTOM_UUID = '00000000-0000-4000-8000-000000000501';
const SHOW_ROUTES = [
  ['get', '/api/webgpu-fireworks/shows'],
  ['post', '/api/webgpu-fireworks/shows'],
  ['post', '/api/webgpu-fireworks/shows/import'],
  ['get', '/api/webgpu-fireworks/shows/:id/export'],
  ['get', '/api/webgpu-fireworks/shows/:id'],
  ['put', '/api/webgpu-fireworks/shows/:id/draft'],
  ['post', '/api/webgpu-fireworks/shows/:id/validate'],
  ['post', '/api/webgpu-fireworks/shows/:id/publish'],
  ['post', '/api/webgpu-fireworks/shows/:id/duplicate'],
  ['post', '/api/webgpu-fireworks/shows/:id/derive'],
  ['post', '/api/webgpu-fireworks/shows/:id/preview'],
  ['post', '/api/webgpu-fireworks/shows/:id/archive'],
  ['post', '/api/webgpu-fireworks/shows/:id/restore']
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function definition(name = 'API Draft') {
  const show = clone(BUILT_IN_SHOW_DEFINITIONS['classic-crescendo']);
  show.metadata.name = name;
  return show;
}

function longOnlyDefinition(name = 'Long Master') {
  const show = definition(name);
  delete show.variants.medium;
  delete show.variants.short;
  return show;
}

function createApi(dataDir) {
  const routes = [];
  return {
    routes,
    getPluginDataDir: () => dataDir,
    ensurePluginDataDir: jest.fn(() => fs.mkdirSync(dataDir, { recursive: true })),
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(),
    getDatabase: jest.fn(() => null),
    emit: jest.fn(),
    log: jest.fn(),
    registerMiddleware: jest.fn(),
    registerRoute: jest.fn((method, route, handler) => routes.push({ method, route, handler })),
    registerTikTokEvent: jest.fn(),
    registerSocketConnection: jest.fn()
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function json(body) {
      this.body = body;
      return this;
    }),
    type: jest.fn(function type() { return this; }),
    send: jest.fn(function send(body) {
      this.body = body;
      return this;
    }),
    sendFile: jest.fn()
  };
}

function route(api, method, routePath) {
  const match = api.routes.find(candidate => (
    candidate.method === method && candidate.route === routePath
  ));
  if (!match) throw new Error(`Route not registered: ${method} ${routePath}`);
  return match.handler;
}

async function invoke(handler, { body, params } = {}) {
  const res = createResponse();
  await handler({ body, params: params || {} }, res);
  return res;
}

function createHarness() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-show-api-'));
  const api = createApi(dataDir);
  const plugin = new FireworksPlugin(api);
  let nextId = 501;
  const repository = new RevisionedShowRepository({
    dataDir,
    idFactory: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`
  });
  repository.load();
  plugin.showRepository = repository;
  plugin.showRepositoryLoadError = null;
  plugin.registerRoutes();
  return { api, dataDir, plugin, repository };
}

function createCorruptHarness() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-show-api-corrupt-'));
  const filePath = path.join(dataDir, 'custom-shows.json');
  const files = [filePath, `${filePath}.bak`, `${filePath}.tmp`];
  const contents = ['{primary-path:C:\\private', '{backup', '{temp'];
  files.forEach((candidate, index) => fs.writeFileSync(candidate, contents[index], 'utf8'));
  const api = createApi(dataDir);
  const plugin = new FireworksPlugin(api);
  plugin.initializeShowRepository();
  plugin.registerRoutes();
  return {
    api,
    dataDir,
    files,
    before: files.map(candidate => fs.readFileSync(candidate))
  };
}

describe('WebGPU Fireworks show API', () => {
  const dataDirs = [];

  afterEach(() => {
    for (const dataDir of dataDirs.splice(0)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('registers the exact public show routes with static import before dynamic id routes', () => {
    const { api, dataDir } = createHarness();
    dataDirs.push(dataDir);
    const registered = api.routes
      .map(({ method, route: routePath }) => [method, routePath])
      .filter(([, routePath]) => routePath.startsWith('/api/webgpu-fireworks/shows'));

    expect(registered).toEqual(SHOW_ROUTES);
    expect(registered.findIndex(([, routePath]) => routePath.endsWith('/import')))
      .toBeLessThan(registered.findIndex(([, routePath]) => routePath === '/api/webgpu-fireworks/shows/:id'));
  });

  test('creates a custom draft and reads it back through the API', async () => {
    const { api, dataDir } = createHarness();
    dataDirs.push(dataDir);
    const draft = definition();

    const created = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows'), {
      body: { definition: draft }
    });

    expect(created.statusCode).toBe(201);
    expect(created.body).toMatchObject({
      success: true,
      show: { id: `custom:${CUSTOM_UUID}`, revision: 1 }
    });

    const fetched = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows/:id'), {
      params: { id: created.body.show.id }
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.body).toMatchObject({
      success: true,
      show: {
        id: created.body.show.id,
        revision: 1,
        definition: { metadata: { name: 'API Draft' } }
      }
    });
  });

  test('returns an exact 409 revision conflict with currentRevision', async () => {
    const { api, dataDir } = createHarness();
    dataDirs.push(dataDir);
    const draft = definition();
    const created = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows'), {
      body: { definition: draft }
    });
    const id = created.body.show.id;

    const conflict = await invoke(route(api, 'put', '/api/webgpu-fireworks/shows/:id/draft'), {
      params: { id },
      body: { definition: draft, expectedRevision: 0 }
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.body).toEqual({
      success: false,
      error: 'The custom show draft was changed by another writer.',
      code: 'REVISION_CONFLICT',
      details: {
        id,
        expectedRevision: 0,
        currentRevision: 1
      }
    });
  });

  test('lists compact summaries with dynamic selector payloads', async () => {
    const { api, dataDir } = createHarness();
    dataDirs.push(dataDir);
    await invoke(route(api, 'post', '/api/webgpu-fireworks/shows'), {
      body: { definition: definition('Compact Draft') }
    });

    const response = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows'));

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      shows: expect.arrayContaining([
        expect.objectContaining({
          id: `custom:${CUSTOM_UUID}`,
          name: 'Compact Draft',
          builtIn: false,
          revision: 1,
          publishedRevision: null,
          archived: false
        })
      ]),
      selectableStyles: expect.any(Array),
      autoEligibleStyleIds: expect.any(Array)
    });
    for (const show of response.body.shows) {
      expect(show).not.toHaveProperty('definition');
      expect(show).not.toHaveProperty('revisions');
      expect(show).not.toHaveProperty('publishedDefinition');
      expect(show).not.toHaveProperty('validation');
    }
    expect(response.body.selectableStyles).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'classic-crescendo', builtIn: true })
    ]));
    expect(response.body.selectableStyles).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `custom:${CUSTOM_UUID}` })
    ]));
  });

  test('auto-derives a valid long master once and never overwrites derived variants implicitly', async () => {
    const { api, dataDir } = createHarness();
    dataDirs.push(dataDir);
    const created = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows'), {
      body: { definition: longOnlyDefinition() }
    });
    const id = created.body.show.id;

    const firstValidation = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/validate'), {
      params: { id },
      body: { expectedRevision: 1 }
    });

    expect(firstValidation.body).toMatchObject({
      success: true,
      autoDerived: true,
      derivedVariants: ['medium', 'short'],
      currentRevision: 2,
      show: {
        id,
        revision: 2,
        validatedRevision: 2,
        validation: { valid: true },
        definition: {
          variants: {
            long: expect.any(Object),
            medium: expect.any(Object),
            short: expect.any(Object)
          }
        }
      }
    });
    const medium = clone(firstValidation.body.show.definition.variants.medium);
    const short = clone(firstValidation.body.show.definition.variants.short);
    const edited = clone(firstValidation.body.show.definition);
    edited.metadata.name = 'Edited Long Master';
    edited.variants.long.cues[0].timeMs += 1;

    const saved = await invoke(route(api, 'put', '/api/webgpu-fireworks/shows/:id/draft'), {
      params: { id },
      body: { expectedRevision: 2, definition: edited }
    });
    const laterValidation = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/validate'), {
      params: { id },
      body: { expectedRevision: saved.body.show.revision }
    });

    expect(laterValidation.body).toMatchObject({
      success: true,
      autoDerived: false,
      derivedVariants: [],
      show: { revision: 3, validatedRevision: 3 }
    });
    expect(laterValidation.body.show.definition.variants.medium).toEqual(medium);
    expect(laterValidation.body.show.definition.variants.short).toEqual(short);
  });

  test('publish requires every variant and the current persisted validation', async () => {
    const { api, dataDir } = createHarness();
    dataDirs.push(dataDir);
    const created = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows'), {
      body: { definition: longOnlyDefinition('Publish Guard') }
    });
    const id = created.body.show.id;
    const firstValidation = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/validate'), {
      params: { id },
      body: { expectedRevision: 1 }
    });
    const stripped = clone(firstValidation.body.show.definition);
    delete stripped.variants.medium;
    delete stripped.variants.short;
    const saved = await invoke(route(api, 'put', '/api/webgpu-fireworks/shows/:id/draft'), {
      params: { id },
      body: { expectedRevision: 2, definition: stripped }
    });
    const validated = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/validate'), {
      params: { id },
      body: { expectedRevision: saved.body.show.revision }
    });
    expect(validated.body).toMatchObject({
      success: true,
      autoDerived: false,
      show: { revision: 3, validatedRevision: 3 }
    });

    const missingVariants = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/publish'), {
      params: { id },
      body: { expectedRevision: 3 }
    });
    expect(missingVariants.statusCode).toBe(422);
    expect(missingVariants.body).toEqual({
      success: false,
      error: 'Publishing requires short, medium, and long variants.',
      code: 'PUBLISH_VARIANTS_REQUIRED',
      details: { id, currentRevision: 3, missingVariants: ['medium', 'short'] }
    });

    const fullCreated = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows'), {
      body: { definition: definition('Needs Validation') }
    });
    const notValidated = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/publish'), {
      params: { id: fullCreated.body.show.id },
      body: { expectedRevision: 1 }
    });
    expect(notValidated.statusCode).toBe(409);
    expect(notValidated.body.code).toBe('DRAFT_NOT_VALIDATED');
  });

  test('requires explicit confirmation before overwriting variants through derive', async () => {
    const { api, dataDir } = createHarness();
    dataDirs.push(dataDir);
    const created = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows'), {
      body: { definition: definition('Explicit Derive') }
    });
    const id = created.body.show.id;
    const originalMedium = clone(created.body.show.definition.variants.medium);
    const originalShort = clone(created.body.show.definition.variants.short);

    const unconfirmed = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/derive'), {
      params: { id },
      body: {
        expectedRevision: 1,
        variants: ['medium', 'short'],
        overwrite: true
      }
    });
    expect(unconfirmed.statusCode).toBe(409);
    expect(unconfirmed.body).toEqual({
      success: false,
      error: 'Overwriting existing variants requires explicit confirmation.',
      code: 'DERIVE_OVERWRITE_CONFIRMATION_REQUIRED',
      details: { id, currentRevision: 1 }
    });

    const confirmed = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/derive'), {
      params: { id },
      body: {
        expectedRevision: 1,
        variants: ['medium', 'short'],
        seed: 7,
        overwrite: true,
        confirmOverwrite: true
      }
    });
    expect(confirmed.body).toMatchObject({ success: true, show: { id, revision: 2 } });
    expect(confirmed.body.show.definition.variants.medium).not.toEqual(originalMedium);
    expect(confirmed.body.show.definition.variants.short).not.toEqual(originalShort);
  });

  test('duplicates built-ins and imports and exports canonical definition-only data', async () => {
    const { api, dataDir } = createHarness();
    dataDirs.push(dataDir);
    const duplicate = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/duplicate'), {
      params: { id: 'classic-crescendo' },
      body: { expectedRevision: 0, name: 'Built-in Copy' }
    });
    expect(duplicate.statusCode).toBe(201);
    expect(duplicate.body).toMatchObject({
      success: true,
      show: {
        builtIn: false,
        revision: 1,
        definition: { metadata: { name: 'Built-in Copy' }, autoEligible: false }
      }
    });

    const defaultNamedDuplicate = await invoke(
      route(api, 'post', '/api/webgpu-fireworks/shows/:id/duplicate'),
      { params: { id: 'classic-crescendo' }, body: { expectedRevision: 0 } }
    );
    expect(defaultNamedDuplicate.statusCode).toBe(201);
    expect(defaultNamedDuplicate.body.show.definition.metadata.name).toMatch(/ Copy$/);

    const builtInExport = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows/:id/export'), {
      params: { id: 'classic-crescendo' }
    });
    expect(Object.keys(builtInExport.body).sort()).toEqual(['definition', 'success']);
    expect(builtInExport.body.definition).toEqual(BUILT_IN_SHOW_DEFINITIONS['classic-crescendo']);
    expect(JSON.stringify(builtInExport.body.definition))
      .toBe(JSON.stringify(canonicalize(BUILT_IN_SHOW_DEFINITIONS['classic-crescendo'])));

    const importedDefinition = definition('Imported Show');
    importedDefinition.id = 'external:rewritten';
    const imported = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/import'), {
      body: importedDefinition
    });
    expect(imported.statusCode).toBe(201);
    expect(imported.body).toMatchObject({
      success: true,
      show: { revision: 1, validatedRevision: 1, validation: { valid: true } }
    });
    expect(imported.body.show.id).not.toBe(importedDefinition.id);

    const importedExport = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows/:id/export'), {
      params: { id: imported.body.show.id }
    });
    expect(importedExport.body).toEqual({
      success: true,
      definition: imported.body.show.definition
    });
    expect(importedExport.body.definition).not.toEqual(expect.objectContaining({
      revisions: expect.anything(),
      validation: expect.anything(),
      archived: expect.anything()
    }));

    const stringImported = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/import'), {
      body: JSON.stringify(definition('JSON String Import'))
    });
    expect(stringImported.statusCode).toBe(201);
    expect(stringImported.body).toMatchObject({
      success: true,
      show: {
        validatedRevision: 1,
        definition: { metadata: { name: 'JSON String Import' } }
      }
    });
  });

  test('updates dynamic selectors and Auto membership across publish, archive, and restore', async () => {
    const { api, dataDir } = createHarness();
    dataDirs.push(dataDir);
    const created = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows'), {
      body: { definition: definition('Selector Lifecycle') }
    });
    const id = created.body.show.id;
    await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/validate'), {
      params: { id }, body: { expectedRevision: 1 }
    });
    const published = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/publish'), {
      params: { id }, body: { expectedRevision: 1 }
    });
    expect(published.body).toMatchObject({
      success: true,
      show: { publishedRevision: 1, archived: false }
    });

    const publishedList = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows'));
    expect(publishedList.body.selectableStyles).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, name: 'Selector Lifecycle', publishedRevision: 1 })
    ]));
    expect(publishedList.body.autoEligibleStyleIds).toContain(id);

    const archived = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/archive'), {
      params: { id }, body: { expectedRevision: 1 }
    });
    expect(archived.body).toMatchObject({ success: true, show: { archived: true, revision: 1 } });
    const archivedList = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows'));
    expect(archivedList.body.selectableStyles).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id })
    ]));
    expect(archivedList.body.autoEligibleStyleIds).not.toContain(id);

    const restored = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/restore'), {
      params: { id }, body: { expectedRevision: 1 }
    });
    expect(restored.body).toMatchObject({ success: true, show: { archived: false, revision: 1 } });
    const restoredList = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows'));
    expect(restoredList.body.selectableStyles).toEqual(expect.arrayContaining([
      expect.objectContaining({ id })
    ]));
    expect(restoredList.body.autoEligibleStyleIds).toContain(id);
  });

  test('keeps built-ins immutable while allowing read, validation, export, and duplication', async () => {
    const { api, dataDir } = createHarness();
    dataDirs.push(dataDir);
    const id = 'classic-crescendo';
    const read = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows/:id'), { params: { id } });
    expect(read.body).toMatchObject({ success: true, show: { id, builtIn: true, revision: 0 } });
    const validated = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/validate'), {
      params: { id }, body: {}
    });
    expect(validated.body).toMatchObject({
      success: true,
      autoDerived: false,
      show: { id, builtIn: true, validatedRevision: 0 }
    });

    const mutations = [
      ['put', '/api/webgpu-fireworks/shows/:id/draft', { expectedRevision: 0, definition: definition() }],
      ['post', '/api/webgpu-fireworks/shows/:id/publish', { expectedRevision: 0 }],
      ['post', '/api/webgpu-fireworks/shows/:id/derive', { expectedRevision: 0, variants: ['short'] }],
      ['post', '/api/webgpu-fireworks/shows/:id/archive', { expectedRevision: 0 }],
      ['post', '/api/webgpu-fireworks/shows/:id/restore', { expectedRevision: 0 }]
    ];
    for (const [method, routePath, body] of mutations) {
      const response = await invoke(route(api, method, routePath), { params: { id }, body });
      expect(response.statusCode).toBe(409);
      expect(response.body.code).toBe('BUILT_IN_IMMUTABLE');
    }
  });

  test('keeps corrupt repository bytes intact while serving built-ins and rejecting custom access', async () => {
    const { api, dataDir, files, before } = createCorruptHarness();
    dataDirs.push(dataDir);

    const list = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows'));
    expect(list.body).toMatchObject({
      success: true,
      shows: expect.arrayContaining([expect.objectContaining({ id: 'classic-crescendo', builtIn: true })]),
      selectableStyles: expect.arrayContaining([expect.objectContaining({ id: 'classic-crescendo' })])
    });
    const read = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows/:id'), {
      params: { id: 'classic-crescendo' }
    });
    expect(read.body).toMatchObject({ success: true, show: { id: 'classic-crescendo' } });
    const exported = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows/:id/export'), {
      params: { id: 'classic-crescendo' }
    });
    expect(exported.body).toEqual({
      success: true,
      definition: BUILT_IN_SHOW_DEFINITIONS['classic-crescendo']
    });

    const unavailableRequests = [
      invoke(route(api, 'get', '/api/webgpu-fireworks/shows/:id'), {
        params: { id: `custom:${CUSTOM_UUID}` }
      }),
      invoke(route(api, 'post', '/api/webgpu-fireworks/shows'), {
        body: { definition: definition('Blocked Create') }
      }),
      invoke(route(api, 'post', '/api/webgpu-fireworks/shows/import'), {
        body: { definition: definition('Blocked Import') }
      }),
      invoke(route(api, 'post', '/api/webgpu-fireworks/shows/:id/duplicate'), {
        params: { id: 'classic-crescendo' },
        body: { expectedRevision: 0 }
      })
    ];
    for (const request of unavailableRequests) {
      const response = await request;
      expect(response.statusCode).toBe(503);
      expect(response.body).toEqual({
        success: false,
        error: 'The custom show repository is unavailable.',
        code: 'REPOSITORY_UNAVAILABLE',
        details: {}
      });
      expect(JSON.stringify(response.body)).not.toMatch(/custom-shows|private|\\|stack/i);
    }
    files.forEach((candidate, index) => {
      expect(fs.readFileSync(candidate)).toEqual(before[index]);
    });
  });

  test('rejects malformed ids, bodies, and JSON without leaking internals', async () => {
    const { api, dataDir, repository } = createHarness();
    dataDirs.push(dataDir);
    const invalidId = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows/:id'), {
      params: { id: 'custom:not-a-uuid' }
    });
    expect(invalidId.statusCode).toBe(400);
    expect(invalidId.body).toEqual({
      success: false,
      error: 'Show ID must be a built-in ID or custom:<uuid>.',
      code: 'INVALID_SHOW_ID',
      details: {}
    });

    const created = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows'), {
      body: { definition: definition('Canonical ID') }
    });
    const canonicalRead = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows/:id'), {
      params: { id: created.body.show.id.toUpperCase() }
    });
    expect(canonicalRead.body).toMatchObject({ success: true, show: { id: created.body.show.id } });

    const malformedBody = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows'), { body: null });
    expect(malformedBody.statusCode).toBe(400);
    expect(malformedBody.body.code).toBe('INVALID_DEFINITION');
    const malformedJson = await invoke(route(api, 'post', '/api/webgpu-fireworks/shows/import'), {
      body: { definition: '{"schemaVersion":' }
    });
    expect(malformedJson.statusCode).toBe(400);
    expect(malformedJson.body.code).toBe('IMPORT_JSON_INVALID');

    repository.get = () => {
      const error = new Error('C:\\Users\\private\\custom-shows.json\nstack: sensitive');
      error.code = 'ENOENT';
      throw error;
    };
    const internal = await invoke(route(api, 'get', '/api/webgpu-fireworks/shows/:id'), {
      params: { id: 'classic-crescendo' }
    });
    expect(internal.statusCode).toBe(500);
    expect(internal.body).toEqual({
      success: false,
      error: 'The show request could not be completed.',
      code: 'INTERNAL_ERROR',
      details: {}
    });
    expect(JSON.stringify(internal.body)).not.toMatch(/custom-shows|private|\\|stack/i);
  });
});
