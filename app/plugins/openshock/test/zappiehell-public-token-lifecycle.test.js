'use strict';

const OpenShockPlugin = require('../main');
const ZappieHellManager = require('../helpers/zappieHellManager');
const {
  PUBLIC_QUICK_TUNNEL_ROOM,
  createPublicOverlayAdapter
} = require('../../../modules/public-overlay-socket-adapter');

class RecordingAdapter {
  constructor() {
    this.calls = [];
  }

  broadcast(packet, options) {
    this.calls.push({ packet, options });
  }
}

function createResponse() {
  return {
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

describe('ZappieHell public goal token lifecycle', () => {
  test('keeps a late completion from matching a recreated goal with the same ID', async () => {
    jest.useFakeTimers();
    try {
      const SocketAdapter = createPublicOverlayAdapter(RecordingAdapter);
      const adapter = new SocketAdapter({ name: '/' });
      const localEmits = [];
      const routes = new Map();
      const api = {
        log: jest.fn(),
        emit: jest.fn((eventName, payload) => {
          localEmits.push({ eventName, payload });
          adapter.broadcast({ data: [eventName, payload] }, {
            rooms: new Set(),
            except: new Set()
          });
          return true;
        }),
        registerRoute: jest.fn((method, routePath, handler) => {
          routes.set(`${method}:${routePath}`, handler);
        })
      };
      const db = {
        prepare: jest.fn(() => ({
          run: jest.fn(),
          all: jest.fn(() => [])
        }))
      };
      const manager = new ZappieHellManager(
        db,
        { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        null,
        null,
        null,
        null
      );
      manager.eventChains.set('delay-chain', {
        id: 'delay-chain',
        name: 'Synthetic delay',
        steps: [{ type: 'delay', durationMs: 25 }]
      });

      const plugin = new OpenShockPlugin(api);
      plugin.zappieHellManager = manager;
      plugin._registerRoutes();
      manager.on('goals:update', data => plugin._broadcastZappieHellUpdate(data));
      manager.on('goals:completed', data => plugin._broadcastZappieHellCompleted(data));

      const goalId = 'same-id-after-delete-fixture';
      const create = routes.get('post:/api/openshock/zappiehell/goals');
      const remove = routes.get('delete:/api/openshock/zappiehell/goals/:id');
      const oldResponse = createResponse();
      create({ body: {
        id: goalId,
        name: 'Old goal',
        targetCoins: 1,
        currentCoins: 0,
        type: 'stream',
        active: true,
        chainId: 'delay-chain'
      } }, oldResponse);
      const oldGoal = manager.goals.get(goalId);
      const oldPublicToken = adapter.calls.find(call =>
        call.options.rooms?.has(PUBLIC_QUICK_TUNNEL_ROOM)
        && call.packet.data[0] === 'zappiehell:goals:update'
      ).packet.data[1].goals[0].displayToken;

      const completedGoalsPromise = manager.addCoins(1, 'synthetic-fixture');
      expect(jest.getTimerCount()).toBe(1);

      const deleteResponse = createResponse();
      remove({ params: { id: goalId } }, deleteResponse);
      expect(deleteResponse.payload.success).toBe(true);

      const newResponse = createResponse();
      create({ body: {
        id: goalId,
        name: 'New goal',
        targetCoins: 100,
        currentCoins: 0,
        type: 'stream',
        active: true
      } }, newResponse);
      const newGoal = manager.goals.get(goalId);
      expect(newGoal).not.toBe(oldGoal);
      const newPublicToken = adapter.calls
        .filter(call => call.options.rooms?.has(PUBLIC_QUICK_TUNNEL_ROOM))
        .map(call => call.packet)
        .filter(packet => packet.data[0] === 'zappiehell:goals:update')
        .at(-1).data[1].goals[0].displayToken;
      expect(newPublicToken).not.toBe(oldPublicToken);

      await jest.advanceTimersByTimeAsync(25);
      await completedGoalsPromise;

      const managerUpdate = localEmits.findLast(entry => entry.eventName === 'zappiehell:goals:update');
      const managerCompletion = localEmits.find(entry => entry.eventName === 'zappiehell:goals:completed');
      expect(managerUpdate.payload.goals[0]).toBe(newGoal);
      expect(managerCompletion.payload.goal).toBe(oldGoal);

      const publicCompletion = adapter.calls.find(call =>
        call.options.rooms?.has(PUBLIC_QUICK_TUNNEL_ROOM)
        && call.packet.data[0] === 'zappiehell:goals:completed'
      );
      expect(publicCompletion).toBeUndefined();
      const localCompletion = adapter.calls.find(call =>
        call.packet.data[0] === 'zappiehell:goals:completed'
      );
      expect(localCompletion.packet.data[1].goal.id).toBe(goalId);
      expect([...localCompletion.options.except]).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
    } finally {
      jest.useRealTimers();
    }
  });
});
