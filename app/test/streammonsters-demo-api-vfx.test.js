'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const StreamMonstersRoutes = require('../plugins/streamalchemy/backend/streammonsters/routes');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    sendFile: jest.fn()
  };
}

function harness() {
  const registered = [];
  const emitted = [];
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => registered.push({ method, routePath, handler }),
      emit: (event, payload) => emitted.push({ event, payload })
    },
    pluginDir: process.cwd(),
    store,
    engine: new StreamMonstersEngine({ store }),
    generationPool: {},
    systemAnalyzer: {},
    managedRuntime: {},
    localModelInstaller: {},
    configProvider: {
      getConfig: () => ({ streamMonsters: { hatchDurationMs: 120_000 } }),
      updateConfig: jest.fn()
    }
  });
  routes.register();
  return {
    emitted,
    demo: registered.find(entry => entry.method === 'POST' && entry.routePath === '/api/streammonsters/demo').handler
  };
}

function localRequest(body) {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    body
  };
}

describe('Stream Monsters targeted demo API', () => {
  test('keeps a bodyless request backward compatible and adds spawn, hatch and skill cards', () => {
    const { demo, emitted } = harness();
    const res = response();
    demo(localRequest(undefined), res);

    expect(res.body).toEqual({ success: true, demo: true });
    expect(emitted.map(entry => entry.event)).toEqual(expect.arrayContaining([
      'streammonsters:egg_spawned',
      'streammonsters:hatch_started',
      'streammonsters:egg_hatched',
      'streammonsters:battle_skill_used',
      'streammonsters:battle_special_charged'
    ]));
  });

  test.each(['spawn', 'hatch', 'attack', 'defense', 'special'])(
    'emits only the requested %s preview sequence with validated catalog/layout metadata',
    scene => {
      const { demo, emitted } = harness();
      const res = response();
      demo(localRequest({
        scene,
        templateId: 'ashfang',
        layout: 'portrait',
        anchor: 'middle-left',
        scale: 115
      }), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({
        success: true,
        demo: true,
        scene,
        templateId: 'ashfang',
        layout: 'portrait',
        anchor: 'middle-left',
        scale: 115
      }));
      expect(emitted.length).toBeGreaterThan(0);
      for (const entry of emitted) {
        expect(entry.payload).toEqual(expect.objectContaining({
          demo: true,
          preview: { scene, layout: 'portrait', anchor: 'middle-left', scale: 115 }
        }));
      }
      const allowed = {
        spawn: ['streammonsters:egg_spawned'],
        hatch: ['streammonsters:hatch_started', 'streammonsters:egg_hatched'],
        attack: ['streammonsters:battle_skill_used'],
        defense: ['streammonsters:battle_skill_used'],
        special: ['streammonsters:battle_special_charged', 'streammonsters:battle_skill_used']
      };
      expect(emitted.map(entry => entry.event)).toEqual(allowed[scene]);
    }
  );

  test.each([
    [{ scene: 'unknown' }, 'STREAM_MONSTERS_DEMO_SCENE_INVALID'],
    [{ scene: 'attack', templateId: 'missing' }, 'STREAM_MONSTERS_DEMO_TEMPLATE_INVALID'],
    [{ scene: 'attack', layout: 'square' }, 'STREAM_MONSTERS_DEMO_LAYOUT_INVALID'],
    [{ scene: 'attack', anchor: 'left' }, 'STREAM_MONSTERS_DEMO_ANCHOR_INVALID'],
    [{ scene: 'attack', scale: 131 }, 'STREAM_MONSTERS_DEMO_SCALE_INVALID']
  ])('rejects invalid targeted demo input %#', (body, error) => {
    const { demo, emitted } = harness();
    const res = response();
    demo(localRequest(body), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error });
    expect(emitted).toEqual([]);
  });
});
