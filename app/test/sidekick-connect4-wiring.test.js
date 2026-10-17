'use strict';

const fs = require('fs');
const path = require('path');

const { HostCore } = require('../sidekick-host/host-core');
const { ShowPlanner } = require('../sidekick-host/show-planner');
const { RateLimiter } = require('../sidekick-host/rate-limiter');
const { createReplyEngine } = require('../sidekick-host/llm-reply');
const { createTextAdapter } = require('../sidekick-host/adapters/text-adapter');
const { createConnect4Adapter } = require('../sidekick-host/adapters/connect4-adapter');
const { createFakeGameEngine } = require('../sidekick-host/testing/fake-game-engine');
const { createDemoPorts } = require('../sidekick-host/demo-plugins');

function hostFor(ports) {
  const spoken = [];
  const host = new HostCore({
    planner: new ShowPlanner(ports),
    output: createTextAdapter({ write: text => spoken.push(text) }),
    replyEngine: createReplyEngine({ apiKey: '' }),
    rateLimiter: new RateLimiter({ maxEvents: 50, windowMs: 60000, now: () => 0 })
  });
  return { host, spoken };
}

describe('connect4 adapter', () => {
  test('requires a transport', () => {
    expect(() => createConnect4Adapter({})).toThrow(/transport is required/);
  });

  test('start posts to the manual start route and returns the session id', async () => {
    const calls = [];
    const engine = createFakeGameEngine();
    const adapter = createConnect4Adapter({
      transport: async (req) => {
        calls.push(req);
        return engine.request(req);
      }
    });

    const started = await adapter.start({ player1Name: 'Streamer', player2Name: 'Chat' });
    expect(started).toMatchObject({ ok: true, gameType: 'connect4' });
    expect(Number.isInteger(started.sessionId)).toBe(true);
    expect(calls).toEqual([{
      method: 'POST',
      path: '/api/game-engine/manual/start',
      body: { gameType: 'connect4', opponentType: 'manual', player1Name: 'Streamer', player2Name: 'Chat' }
    }]);
  });

  test('a second start while a game is active fails closed', async () => {
    const engine = createFakeGameEngine();
    const adapter = createConnect4Adapter({ transport: engine.request });
    await adapter.start({});
    expect(await adapter.start({})).toMatchObject({ ok: false, code: 'active' });
  });

  test('move rejects an invalid column before any request', async () => {
    let called = 0;
    const adapter = createConnect4Adapter({
      transport: async () => {
        called += 1;
        return { status: 200, body: { success: true } };
      }
    });
    expect(await adapter.move({ sessionId: 1, column: 'H' })).toMatchObject({ ok: false, code: 'invalid-column' });
    expect(await adapter.move({ sessionId: 0, column: 'A' })).toMatchObject({ ok: false, code: 'no-session' });
    expect(called).toBe(0);
  });

  test('a transport failure is reported as { ok: false }', async () => {
    const adapter = createConnect4Adapter({ transport: async () => { throw new Error('offline'); } });
    expect(await adapter.start({})).toMatchObject({ ok: false, code: 'engine' });
    expect(await adapter.move({ sessionId: 1, column: 'A' })).toMatchObject({ ok: false, code: 'engine' });
  });
});

describe('connect4 wiring through the host', () => {
  test('HostCore has no direct quiz/connect4 plugin import', () => {
    const src = fs.readFileSync(path.join(__dirname, '../sidekick-host/host-core.js'), 'utf8');
    expect(src).not.toMatch(/connect4|quiz-show|game-engine/);
  });

  test('!connect4 starts a game and !connect4 A-G makes a move without network', async () => {
    const engine = createFakeGameEngine();
    const adapter = createConnect4Adapter({ transport: engine.request });
    const { host, spoken } = hostFor(createDemoPorts({ connect4Adapter: adapter }));
    host.planner.switchTo('connect4');

    const started = await host.handleChat({ user: 'viewer_01', text: '!connect4' });
    expect(started.type).toBe('command');
    expect(started.emitted).toBe(true);
    expect(spoken[0]).toMatch(/Vier gewinnt/i);
    expect(engine.activeSessions()).toBe(1);

    const move = await host.handleChat({ user: 'viewer_02', text: '!connect4 a' });
    expect(move.type).toBe('command');
    expect(move.emitted).toBe(true);
    expect(spoken[1]).toMatch(/Zug gesetzt/i);
    expect(engine.activeSessions()).toBe(1);
  });

  test('an invalid column is answered without moving', async () => {
    const engine = createFakeGameEngine();
    const adapter = createConnect4Adapter({ transport: engine.request });
    const { host, spoken } = hostFor(createDemoPorts({ connect4Adapter: adapter }));
    host.planner.switchTo('connect4');

    await host.handleChat({ user: 'viewer_01', text: '!connect4' });
    await host.handleChat({ user: 'viewer_02', text: '!connect4 hard' });
    expect(spoken[1]).toMatch(/A-G/);
    expect(engine.activeSessions()).toBe(1);
  });

  test('a full game reports the winner, resets and restarts cleanly', async () => {
    const engine = createFakeGameEngine();
    const adapter = createConnect4Adapter({ transport: engine.request });
    const { host, spoken } = hostFor(createDemoPorts({ connect4Adapter: adapter }));
    host.planner.switchTo('connect4');

    await host.handleChat({ user: 'viewer_01', text: '!connect4' });
    await host.handleChat({ user: 'viewer_01', text: '!connect4 a' }); // P1
    await host.handleChat({ user: 'viewer_02', text: '!connect4 a' }); // P2
    await host.handleChat({ user: 'viewer_01', text: '!connect4 b' }); // P1
    await host.handleChat({ user: 'viewer_02', text: '!connect4 b' }); // P2
    await host.handleChat({ user: 'viewer_01', text: '!connect4 c' }); // P1
    await host.handleChat({ user: 'viewer_02', text: '!connect4 c' }); // P2

    const winning = await host.handleChat({ user: 'viewer_01', text: '!connect4 d' }); // P1 wins
    expect(winning.emitted).toBe(true);
    expect(spoken[spoken.length - 1]).toMatch(/Spieler 1 gewinnt/);
    expect(engine.activeSessions()).toBe(0);

    await host.handleChat({ user: 'viewer_01', text: '!connect4' });
    expect(engine.activeSessions()).toBe(1);
  });
});

describe('quiz gap', () => {
  test('GAP.md records the missing quiz start/answer surfaces', () => {
    const gap = fs.readFileSync(path.join(__dirname, '../sidekick-host/GAP.md'), 'utf8');
    expect(gap).toMatch(/quiz-show:start/);
    expect(gap).toMatch(/handleAnswer/);
    expect(gap).toMatch(/Socket\.IO/);
  });
});
