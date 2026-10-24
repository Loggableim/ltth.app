'use strict';

const GoalsWebSocket = require('../plugins/goals/backend/websocket');
const { GoalStateMachine, STATES } = require('../plugins/goals/engine/state-machine');
const { protectPublicSocket } = require('../modules/public-overlay-access');
const { isIncomingSocketEventAllowed } = require('../modules/public-overlay-registry');

const GOAL_ID = 'goal_public_ack_fixture';

function createHarness() {
  const machine = new GoalStateMachine(GOAL_ID);
  machine.initialize({
    current_value: 0,
    target_value: 10,
    start_value: 0,
    on_reach_action: 'reset'
  });
  machine.updateValue(10);
  machine.onUpdateAnimationEnd();
  expect(machine.getState()).toBe(STATES.ANIMATING_REACH);

  const handlers = new Map();
  const roomEmits = [];
  const io = {
    to: room => ({
      emit: (eventName, payload) => roomEmits.push({ room, eventName, payload })
    })
  };
  const plugin = {
    api: {
      registerSocket: (eventName, handler) => handlers.set(eventName, handler),
      getSocketIO: () => io,
      log: jest.fn()
    },
    db: { getGoal: jest.fn(() => ({ id: GOAL_ID })) },
    stateMachineManager: { getMachine: jest.fn(id => id === GOAL_ID ? machine : null) }
  };
  const websocket = new GoalsWebSocket(plugin);
  websocket.registerHandlers();

  return { machine, handlers, roomEmits };
}

function makeSocket(host) {
  let incomingMiddleware;
  return {
    handshake: { headers: { host } },
    data: {},
    join: jest.fn(),
    use: middleware => { incomingMiddleware = middleware; },
    emit: jest.fn(() => true),
    dispatch(eventName, handler, payload) {
      if (!incomingMiddleware) return handler(this, payload);
      let denied;
      incomingMiddleware([eventName, payload], error => { denied = error || null; });
      if (denied) return denied;
      return handler(this, payload);
    }
  };
}

describe('Goals animation completion public boundary', () => {
  test('the original handler proves a known public Goal ID can trigger reach behavior if invoked', () => {
    const { machine, handlers, roomEmits } = createHarness();
    const publicSocket = makeSocket('fixture.trycloudflare.com');
    protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });

    handlers.get('goals:animation-end')(publicSocket, {
      goalId: GOAL_ID,
      animationType: 'reach'
    });

    expect(machine.getState()).toBe(STATES.IDLE);
    expect(machine.getData().currentValue).toBe(0);
    expect(roomEmits).toEqual([expect.objectContaining({
      room: `goal:${GOAL_ID}`,
      eventName: 'goals:reach-complete'
    })]);
  });

  test('public socket policy denies only the state-changing animation ACK before the handler', () => {
    const { machine, handlers, roomEmits } = createHarness();
    const publicSocket = makeSocket('fixture.trycloudflare.com');
    protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });
    const handler = jest.fn(handlers.get('goals:animation-end'));

    expect(isIncomingSocketEventAllowed('goals:animation-end')).toBe(false);
    const error = publicSocket.dispatch('goals:animation-end', handler, {
      goalId: GOAL_ID,
      animationType: 'reach'
    });

    expect(error).toMatchObject({
      data: { code: 'PUBLIC_SOCKET_EVENT_NOT_ALLOWED' }
    });
    expect(handler).not.toHaveBeenCalled();
    expect(machine.getState()).toBe(STATES.ANIMATING_REACH);
    expect(machine.getData().currentValue).toBe(10);
    expect(roomEmits).toEqual([]);
  });

  test('the same original handler remains available to local overlay sockets', () => {
    const { machine, handlers, roomEmits } = createHarness();
    const localSocket = makeSocket('127.0.0.1:3000');
    protectPublicSocket({ socket: localSocket, logger: { warn: jest.fn() } });
    const handler = handlers.get('goals:animation-end');

    expect(isIncomingSocketEventAllowed('goals:subscribe')).toBe(true);
    expect(localSocket.dispatch('goals:animation-end', handler, {
      goalId: GOAL_ID,
      animationType: 'reach'
    })).toBeUndefined();

    expect(machine.getState()).toBe(STATES.IDLE);
    expect(machine.getData().currentValue).toBe(0);
    expect(roomEmits).toEqual([expect.objectContaining({
      room: `goal:${GOAL_ID}`,
      eventName: 'goals:reach-complete'
    })]);
  });
});
