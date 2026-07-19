const { ShowDesignerApi, ShowDesignerApiError } = require('../plugins/webgpu-fireworks/ui/show-designer-api');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

describe('WebGPU Fireworks Show Designer API client', () => {
  test('uses revision-safe lifecycle and preview request contracts', async () => {
    const fetchImpl = jest.fn(async () => response({ success: true, show: { revision: 8 } }));
    const api = new ShowDesignerApi({ fetchImpl });

    await api.saveDraft('custom:abc', { schemaVersion: 1 }, 7);
    await api.derive('custom:abc', 8, {
      variants: ['medium', 'short'], seed: 7, overwrite: true, confirmOverwrite: true
    });
    await api.preview('custom:abc', 8, {
      variant: 'long', scope: 'phase', phase: 'finale', intensity: 4, seed: 9
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, '/api/webgpu-fireworks/shows/custom%3Aabc/draft', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ definition: { schemaVersion: 1 }, expectedRevision: 7 })
    }));
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({
      expectedRevision: 8,
      variants: ['medium', 'short'],
      seed: 7,
      overwrite: true,
      confirmOverwrite: true
    });
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body)).toEqual({
      expectedRevision: 8,
      variant: 'long',
      scope: 'phase',
      phase: 'finale',
      intensity: 4,
      seed: 9
    });
  });

  test('normalizes structured backend failures and preserves conflict details', async () => {
    const fetchImpl = jest.fn(async () => response({
      success: false,
      error: 'The draft changed.',
      code: 'REVISION_CONFLICT',
      details: { currentRevision: 9 }
    }, 409));
    const api = new ShowDesignerApi({ fetchImpl });

    await expect(api.getShow('custom:abc')).rejects.toMatchObject({
      name: 'ShowDesignerApiError',
      status: 409,
      code: 'REVISION_CONFLICT',
      details: { currentRevision: 9 }
    });
    await api.getShow('custom:abc').catch(error => {
      expect(error).toBeInstanceOf(ShowDesignerApiError);
      expect(error.message).toBe('The draft changed.');
    });
  });

  test('supports catalog, CRUD, validate, publish, archive, restore, duplicate and JSON import/export', async () => {
    const fetchImpl = jest.fn(async () => response({ success: true, shows: [] }));
    const api = new ShowDesignerApi({ fetchImpl });
    await api.listShows();
    await api.createShow({ schemaVersion: 1 });
    await api.validate('custom:abc', 1);
    await api.publish('custom:abc', 2);
    await api.archive('custom:abc', 3);
    await api.restore('custom:abc', 4);
    await api.duplicate('classic-crescendo', 0, 'My Copy');
    await api.importDefinition({ schemaVersion: 1 });
    await api.exportDefinition('custom:abc');

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      '/api/webgpu-fireworks/shows',
      '/api/webgpu-fireworks/shows',
      '/api/webgpu-fireworks/shows/custom%3Aabc/validate',
      '/api/webgpu-fireworks/shows/custom%3Aabc/publish',
      '/api/webgpu-fireworks/shows/custom%3Aabc/archive',
      '/api/webgpu-fireworks/shows/custom%3Aabc/restore',
      '/api/webgpu-fireworks/shows/classic-crescendo/duplicate',
      '/api/webgpu-fireworks/shows/import',
      '/api/webgpu-fireworks/shows/custom%3Aabc/export'
    ]);
  });
});
