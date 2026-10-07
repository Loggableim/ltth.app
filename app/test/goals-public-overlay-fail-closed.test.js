'use strict';

const Database = require('better-sqlite3');
const http = require('http');
const { Server } = require('socket.io');
const { io: connectSocket } = require('socket.io-client');
const { Adapter } = require('socket.io-adapter');
const GoalsDatabase = require('../plugins/goals/backend/database');
const {
  PUBLIC_QUICK_TUNNEL_ROOM,
  createPublicOverlayAdapter
} = require('../modules/public-overlay-socket-adapter');
const { protectPublicSocket } = require('../modules/public-overlay-access');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');

class RecordingAdapter {
  constructor(namespace) {
    this.namespace = namespace;
    this.calls = [];
  }

  broadcast(packet, options) {
    this.calls.push({ packet, options });
  }
}

describe('Goals public socket events fail closed without an approved display DTO', () => {
  let sqlite;
  let goalsDb;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    goalsDb = new GoalsDatabase({ getDatabase: () => sqlite, log: () => {} });
    goalsDb.initialize();
  });

  afterAll(() => sqlite.close());

  test('withholds all current Goals and MultiGoals output events from Quick Tunnel while preserving local packets', () => {
    const goal = {
      ...goalsDb.createGoal({
        id: 'goal_public_projection_fixture',
        name: 'Synthetic local goal',
        goal_type: 'coin',
        current_value: 25,
        target_value: 100,
        theme: { primaryColor: '#123456', bgColor: 'rgba(15, 23, 42, 0.95)' },
        firework_enabled: 1,
        firework_hud_label: 'local-only-fixture'
      }),
      ownerApiKey: 'synthetic-private-canary'
    };
    const multigoal = {
      ...goalsDb.createMultiGoal({
        id: 'multigoal_public_projection_fixture',
        name: 'Synthetic local multi-goal',
        rotation_interval: 7,
        overlay_width: 640,
        overlay_height: 180
      }),
      ownerApiKey: 'synthetic-private-multigoal-canary'
    };
    const snapshot = {
      goalId: goal.id,
      state: 'idle',
      previousState: null,
      data: { currentValue: 25, targetValue: 100, startValue: 0, previousValue: 25, onReachAction: 'hide', onReachIncrement: 100, privateSnapshot: 'local-only' },
      progress: 25,
      isReached: false,
      privateSnapshot: 'local-only'
    };
    const goalPayload = { goalId: goal.id, goal, state: snapshot };
    const events = [
      ['goals:config-changed', { goal }],
      ['goals:deleted', { goalId: goal.id, privateCanary: 'local-only' }],
      ['goals:reach-complete', goalPayload],
      ['goals:reached', goalPayload],
      ['goals:reset', goalPayload],
      ['goals:subscribed', goalPayload],
      ['goals:value-changed', goalPayload],
      ['multigoals:config-changed', { multigoal }],
      ['multigoals:deleted', { multigoalId: multigoal.id, privateCanary: 'local-only' }],
      ['multigoals:subscribed', { multigoalId: multigoal.id, multigoal }]
    ];
    const Adapter = createPublicOverlayAdapter(RecordingAdapter);
    const adapter = new Adapter({ name: '/' });

    for (const [eventName, payload] of events) {
      expect(projectPublicOverlayPayload(eventName, payload)).toBeNull();
      adapter.broadcast({ data: [eventName, payload] }, { rooms: new Set(), except: new Set() });
    }

    expect(adapter.calls).toHaveLength(events.length);
    for (const [index, [eventName, payload]] of events.entries()) {
      const localCall = adapter.calls[index];
      expect(localCall.packet.data).toEqual([eventName, payload]);
      expect(localCall.packet.data[1]).toBe(payload);
      expect(localCall.options.except).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
      expect(localCall.options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)).toBe(false);
    }
    expect(adapter.calls.some(call => call.options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM))).toBe(false);
    expect(JSON.stringify(adapter.calls)).toContain('synthetic-private-canary');
  });

  test('real loopback Socket.IO room receives no Goals packet while a local socket keeps the original', async () => {
    const httpServer = http.createServer();
    const io = new Server(httpServer, { serveClient: false });
    io.adapter(createPublicOverlayAdapter(Adapter));
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${httpServer.address().port}`;
    const connect = isPublic => connectSocket(origin, {
      auth: { publicRoom: isPublic },
      transports: ['websocket'],
      reconnection: false
    });
    const local = connect(false);
    const publicSocket = connect(true);
    let publicPackets = 0;
    publicSocket.on('goals:value-changed', () => { publicPackets += 1; });
    io.on('connection', socket => {
      if (socket.handshake.auth.publicRoom) socket.join(PUBLIC_QUICK_TUNNEL_ROOM);
    });

    try {
      await Promise.all([
        new Promise((resolve, reject) => { local.once('connect', resolve); local.once('connect_error', reject); }),
        new Promise((resolve, reject) => { publicSocket.once('connect', resolve); publicSocket.once('connect_error', reject); })
      ]);
      const rawGoalRow = {
        ...goalsDb.getGoal('goal_public_projection_fixture'),
        ownerApiKey: 'loopback-private-canary'
      };
      const rawPayload = {
        goalId: rawGoalRow.id,
        goal: rawGoalRow,
        state: { goalId: rawGoalRow.id, state: 'idle', data: { currentValue: 25, privateSnapshot: 'loopback-only' } }
      };
      const localEvent = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Local socket did not receive original Goals event')), 1000);
        local.once('goals:value-changed', payload => { clearTimeout(timer); resolve(payload); });
      });

      io.emit('goals:value-changed', rawPayload);
      const received = await localEvent;
      await new Promise(resolve => setTimeout(resolve, 30));

      expect(received).toEqual(rawPayload);
      expect(received.goal.theme_json).toBe(rawGoalRow.theme_json);
      expect(received.goal.ownerApiKey).toBe('loopback-private-canary');
      expect(publicPackets).toBe(0);
    } finally {
      local.disconnect();
      publicSocket.disconnect();
      await new Promise(resolve => io.close(resolve));
    }
  });

  test('direct public socket emits for Goals and MultiGoals are withheld while local emits remain intact', () => {
    const events = [
      ['goals:subscribed', {
        goalId: 'goal_public_projection_fixture',
        goal: { ...goalsDb.getGoal('goal_public_projection_fixture'), ownerApiKey: 'synthetic-private-canary' },
        state: { state: 'idle', privateSnapshot: 'local-only' }
      }],
      ['multigoals:subscribed', {
        multigoalId: 'multigoal_public_projection_fixture',
        multigoal: { ...goalsDb.getMultiGoal('multigoal_public_projection_fixture'), privateCanary: 'local-only' }
      }]
    ];

    for (const [eventName, payload] of events) {
      const emitted = [];
      const publicSocket = {
        handshake: { headers: { host: 'fixture.trycloudflare.com' } },
        data: {},
        join: jest.fn(),
        use: jest.fn(),
        emit: (name, ...args) => { emitted.push([name, ...args]); return 'emitted'; }
      };
      protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });

      expect(publicSocket.emit(eventName, payload)).toBe(false);
      expect(emitted).toEqual([]);

      const localEmitted = [];
      const localSocket = {
        handshake: { headers: { host: '127.0.0.1:3000' } },
        data: {},
        join: jest.fn(),
        use: jest.fn(),
        emit: (name, ...args) => { localEmitted.push([name, ...args]); return 'emitted'; }
      };
      protectPublicSocket({ socket: localSocket, logger: { warn: jest.fn() } });
      expect(localSocket.emit(eventName, payload)).toBe('emitted');
      expect(localEmitted).toEqual([[eventName, payload]]);
    }
  });
});
