'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const StreamMonstersRoutes = require(
  '../plugins/stream-monsters/backend/streammonsters/routes'
);

function createSubject() {
  const registered = [];
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute(method, routePath, handler) {
        registered.push({ method, routePath, handler });
      },
      emit: jest.fn()
    },
    pluginDir: path.join(process.cwd(), 'plugins', 'stream-monsters'),
    store: {
      getEggStateCounts: () => ({}),
      getStreamHype: () => null,
      getQueuedEggs: () => [],
      getGiftMappings: () => []
    },
    engine: { streamKey: null, hatchDurationFor: () => 120_000 },
    configProvider: {
      getConfig: () => ({ streamMonsters: { hatchDurationMs: 120_000 } }),
      updateConfig: jest.fn()
    }
  });
  routes.register();
  return registered.find(route => (
    route.method === 'GET' &&
    route.routePath === '/api/streammonsters/monster-catalog'
  )).handler;
}

function response() {
  return {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

describe('Stream Monsters bundled monster catalog', () => {
  test('keeps the legacy all-template response while attaching three verified stages each', () => {
    const handler = createSubject();
    const res = response();
    handler({ query: { userId: 'must-not-be-resolved' } }, res);

    expect(res.payload.templates).toHaveLength(24);
    expect(res.payload.templates.find(template => template.templateId === 'cinder'))
      .toEqual(expect.objectContaining({
        name: 'Cinderfox',
        species: 'Fox',
        epithet: 'Smoke Dancer',
        season: 'season-1'
      }));
    expect(res.payload.total).toBe(24);
    expect(res.payload.formsTotal).toBe(72);
    expect(res.payload.assetIntegrity).toEqual({
      assetVersion: 'furry-1.12.0',
      expected: 72,
      available: 72,
      healthy: true
    });
    expect(res.payload.templates[0]).toEqual(expect.objectContaining({
      owned: false,
      silhouette: true,
      mastery: null,
      stages: [
        expect.objectContaining({
          stage: 1,
          assetPath: expect.stringMatching(/^\/plugins\/stream-monsters\/assets\//),
          dimensions: [1024, 1024],
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
        }),
        expect.objectContaining({ stage: 2 }),
        expect.objectContaining({ stage: 3 })
      ]
    }));
    expect(JSON.stringify(res.payload)).not.toContain('must-not-be-resolved');
  });

  test('bounds paging and never turns a public userId into viewer collection data', () => {
    const handler = createSubject();
    const res = response();
    handler({
      query: {
        userId: 'private-viewer',
        offset: '5',
        limit: '4'
      }
    }, res);

    expect(res.payload).toEqual(expect.objectContaining({
      success: true,
      total: 24,
      offset: 5,
      limit: 4,
      formsTotal: 72
    }));
    expect(res.payload.templates).toHaveLength(4);
    expect(res.payload.templates.every(template => (
      template.owned === false &&
      template.silhouette === true &&
      template.mastery === null
    ))).toBe(true);
    expect(JSON.stringify(res.payload)).not.toContain('private-viewer');
  });

  test('projects canonical persisted defaults without changing custom names', () => {
    const cinder = { monster_id: 'cinder-1', template_id: 'cinder', name: 'Cinder' };
    const axi = { monster_id: 'axi-1', template_id: 'axi', name: 'Axi' };
    const pulse = { monster_id: 'pulse-1', template_id: 'pulse', name: 'Pulse' };
    const custom = { monster_id: 'custom-1', template_id: 'cinder', name: 'Captain Cinder' };
    const persisted = [cinder, axi, pulse, custom];
    const before = JSON.parse(JSON.stringify(persisted));
    const routes = new StreamMonstersRoutes({
      api: {},
      pluginDir: path.join(process.cwd(), 'plugins', 'stream-monsters'),
      store: {
        resolveKnownViewerId: userId => userId,
        getViewerProgress: () => null,
        getViewerEggs: () => [],
        getViewerMonsters: () => persisted,
        getSelectedMonster: () => cinder,
        getViewerAchievements: () => []
      },
      engine: {},
      configProvider: {}
    });

    const state = routes.viewerState('viewer-1');

    expect(state.monsters.map(monster => monster.name)).toEqual([
      'Cinderfox',
      'Axolume',
      'Pulsebyte',
      'Captain Cinder'
    ]);
    expect(state.selectedMonster.name).toBe('Cinderfox');
    expect(persisted).toEqual(before);
  });

  test('rejects missing and hash-mismatched package assets from integrity totals', () => {
    const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-catalog-'));
    const furryDir = path.join(
      pluginDir,
      'assets',
      'streammonsters',
      'furry'
    );
    fs.mkdirSync(furryDir, { recursive: true });
    const malformedPng = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(malformedPng, 0);
    malformedPng.writeUInt32BE(13, 8);
    malformedPng.write('IHDR', 12, 'ascii');
    malformedPng.writeUInt32BE(1024, 16);
    malformedPng.writeUInt32BE(1024, 20);
    fs.writeFileSync(path.join(furryDir, 'hash-mismatch.png'), malformedPng);
    fs.writeFileSync(path.join(furryDir, 'manifest.json'), JSON.stringify({
      schemaVersion: 2,
      productionMode: 'bundled-only',
      assets: [
        {
          templateId: 'ashfang',
          stage: 1,
          element: 'Ember',
          species: 'Wolf',
          assetPath: 'assets/streammonsters/furry/missing.png',
          dimensions: [1024, 1024],
          sha256: 'a'.repeat(64)
        },
        {
          templateId: 'ashfang',
          stage: 2,
          element: 'Ember',
          species: 'Wolf',
          assetPath: 'assets/streammonsters/furry/hash-mismatch.png',
          dimensions: [1024, 1024],
          sha256: 'b'.repeat(64)
        }
      ]
    }));

    try {
      const routes = new StreamMonstersRoutes({
        api: { registerRoute: jest.fn(), emit: jest.fn() },
        pluginDir,
        store: {},
        engine: {},
        configProvider: {
          getConfig: () => ({ streamMonsters: {} }),
          updateConfig: jest.fn()
        }
      });

      const result = routes.getBundledFurryStageCatalog();
      expect(result.available).toBe(0);
      expect(result.byTemplate.get('ashfang')).toBeUndefined();
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
  });
});
