'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const OpenShockPlugin = require('../main');
const ZappieHellManager = require('../helpers/zappieHellManager');
const {
  isHttpAllowed,
  isOutgoingSocketEventAllowed
} = require('../../../modules/public-overlay-registry');
const { projectPublicOverlayPayload } = require('../../../modules/public-overlay-payload-projection');

async function createOverlayHarness() {
  const handlers = new Map();
  const socket = {
    on: jest.fn((eventName, handler) => {
      handlers.set(eventName, handler);
      return socket;
    }),
    off: jest.fn((eventName, handler) => {
      if (handlers.get(eventName) === handler) handlers.delete(eventName);
      return socket;
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connect: jest.fn(),
    connected: true
  };
  const io = jest.fn(() => socket);
  const logs = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const source = fs.readFileSync(path.join(__dirname, '../overlay/zappiehell-overlay.html'), 'utf8');
  const dom = new JSDOM(source, {
    runScripts: 'dangerously',
    url: 'http://localhost/openshock/zappiehell/overlay',
    beforeParse(window) {
      window.io = io;
      Object.defineProperty(window, 'console', { configurable: true, value: logs });
    }
  });

  if (dom.window.document.readyState !== 'complete') {
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
  }

  let nextTimerId = 0;
  const timers = new Map();
  dom.window.setTimeout = jest.fn((callback, delay) => {
    const id = ++nextTimerId;
    timers.set(id, { callback, delay });
    return id;
  });
  dom.window.clearTimeout = jest.fn(id => timers.delete(id));

  return { dom, handlers, io, logs, socket, timers };
}

function pageTransition(window, eventName, persisted) {
  const event = new window.Event(eventName);
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
}

describe('public ZappieHell original overlay renderer', () => {
  test('uses only the existing public entrypoint and animation event registration', () => {
    expect(isHttpAllowed({ method: 'GET', pathname: '/openshock/zappiehell/overlay' })).toBe(true);
    expect(isOutgoingSocketEventAllowed('zappiehell:overlay:animate')).toBe(true);
    expect(isHttpAllowed({ method: 'GET', pathname: '/openshock/overlay' })).toBe(false);
  });

  test('projects a synthetic manager event through the public relay into the original renderer', async () => {
    const publicSocket = { emit: jest.fn() };
    const plugin = new OpenShockPlugin({
      log: jest.fn(),
      getSocketIO: jest.fn(() => publicSocket)
    });
    const manager = new ZappieHellManager({}, { info: jest.fn(), warn: jest.fn(), error: jest.fn() }, null, null, null, null);
    manager.on('overlay:animate', data => plugin._broadcastZappieHellOverlayAnimation(data));
    const step = {
      animationType: '<img id="private-animation-type">',
      duration: 1400,
      data: {
        deviceId: 'private-device-id',
        userId: 'private-user-id',
        apiKey: 'private-api-key',
        settings: { patternId: 'private-pattern-id' }
      }
    };

    await manager._executeOverlayStep(step);

    expect(isHttpAllowed({ method: 'GET', pathname: '/openshock/zappiehell/overlay' })).toBe(true);
    expect(isOutgoingSocketEventAllowed('zappiehell:overlay:animate')).toBe(true);
    expect(publicSocket.emit).toHaveBeenCalledTimes(1);
    expect(publicSocket.emit).toHaveBeenCalledWith('zappiehell:overlay:animate', { duration: 1400 });
    expect(JSON.stringify(publicSocket.emit.mock.calls)).not.toContain('private-device-id');
    expect(JSON.stringify(publicSocket.emit.mock.calls)).not.toContain('private-user-id');
    expect(JSON.stringify(publicSocket.emit.mock.calls)).not.toContain('private-api-key');
    expect(JSON.stringify(publicSocket.emit.mock.calls)).not.toContain('private-pattern-id');
    expect(JSON.stringify(publicSocket.emit.mock.calls)).not.toContain('private-animation-type');

    const renderer = await createOverlayHarness();
    try {
      const [, publicPayload] = publicSocket.emit.mock.calls[0];
      renderer.handlers.get('zappiehell:overlay:animate')(publicPayload);
      expect([...renderer.timers.values()].map(timer => timer.delay)).toEqual([1400]);
    } finally {
      renderer.dom.window.close();
    }

    for (const duration of [-1, 0, 99, 10001, 1e30, Number.NaN, Number.POSITIVE_INFINITY, '1000']) {
      expect(plugin._broadcastZappieHellOverlayAnimation({ ...step, duration })).toBe(false);
    }
    expect(plugin._broadcastZappieHellOverlayAnimation({ ...step, duration: null })).toBe(true);
    expect(publicSocket.emit.mock.calls.at(-1)).toEqual([
      'zappiehell:overlay:animate',
      { duration: 500 }
    ]);
    expect(publicSocket.emit).toHaveBeenCalledTimes(2);
  });

  test('projects opaque display tokens and matches completion without exposing internal IDs', async () => {
    const fullGoal = {
      id: 'internal-goal-id',
      name: '<img id="goal-xss" src=x>',
      targetCoins: 100,
      currentCoins: 25,
      type: 'stream',
      active: true,
      chainId: 'internal-chain-id',
      apiKey: 'private-setting'
    };
    const update = projectPublicOverlayPayload('zappiehell:goals:update', {
      goals: [fullGoal],
      coinsAdded: 25,
      internalMetadata: 'private'
    });
    const completion = projectPublicOverlayPayload('zappiehell:goals:completed', { goal: fullGoal });

    expect(update).toEqual({ goals: [{
      displayToken: expect.any(String),
      name: '<img id="goal-xss" src=x>',
      targetCoins: 100,
      currentCoins: 25,
      type: 'stream',
      active: true
    }] });
    expect(completion).toEqual({ goal: { displayToken: update.goals[0].displayToken } });
    expect(JSON.stringify({ update, completion })).not.toContain('internal-goal-id');

    const renderer = await createOverlayHarness();
    try {
      renderer.handlers.get('zappiehell:goals:update')(update);
      const cardId = `goal-${update.goals[0].displayToken}`;
      expect(renderer.dom.window.document.getElementById(cardId)).not.toBeNull();
      expect(renderer.dom.window.document.querySelector('#goal-xss')).toBeNull();
      expect(renderer.dom.window.document.querySelector('.goal-name span:nth-child(2)').textContent)
        .toBe('<img id="goal-xss" src=x>');
      renderer.handlers.get('zappiehell:goals:completed')(completion);
      expect(renderer.dom.window.document.getElementById(cardId).classList.contains('completed')).toBe(true);
    } finally {
      renderer.dom.window.close();
    }
  });

  test('public audio projection keeps only fields consumed by the overlay without playback', () => {
    expect(projectPublicOverlayPayload('zappiehell:audio:play', {
      audioId: 'internal-audio-id',
      text: 'Fixture speech text',
      voice: 'Fixture Voice',
      settings: { apiKey: 'private-setting' }
    })).toEqual({ text: 'Fixture speech text', voice: 'Fixture Voice' });
  });

  test('animation payload only drives a bounded flash and raw fields never reach DOM or logs', async () => {
    const { dom, handlers, io, logs, timers } = await createOverlayHarness();
    try {
      expect(io).toHaveBeenCalledTimes(1);
      const animation = {
        animationType: '<img id="animation-xss" src=x>',
        duration: 1200,
        data: {
          deviceId: 'private-device-id',
          userId: 'private-user-id',
          apiKey: 'private-api-key',
          settings: { intensity: 99, pattern: 'private-pattern' },
          label: '<svg id="data-xss">'
        }
      };

      handlers.get('zappiehell:overlay:animate')(animation);

      expect(dom.window.document.getElementById('completionFlash').classList.contains('active')).toBe(true);
      expect([...timers.values()].map(timer => timer.delay)).toEqual([1200]);
      expect(dom.window.document.querySelector('#animation-xss, #data-xss')).toBeNull();
      const logOutput = logs.log.mock.calls.flat().join(' ');
      expect(logOutput).not.toContain('private-device-id');
      expect(logOutput).not.toContain('private-user-id');
      expect(logOutput).not.toContain('private-api-key');
      expect(logOutput).not.toContain('private-pattern');
      expect(logOutput).not.toContain('<img');
      expect(logOutput).not.toContain('<svg');
    } finally {
      dom.window.close();
    }
  });

  test('goal display strings remain text and raw goal metadata is not logged', async () => {
    const { dom, handlers, logs } = await createOverlayHarness();
    try {
      handlers.get('zappiehell:goals:update')({
        goals: [{
          id: 'fixture-goal-id',
          name: '<img id="goal-name-xss" src=x>',
          targetCoins: 100,
          currentCoins: 25,
          type: 'stream',
          active: true,
          chainId: 'fixture-private-chain-id',
          apiKey: 'fixture-private-api-key'
        }]
      });

      expect(dom.window.document.querySelector('#goal-name-xss')).toBeNull();
      expect(dom.window.document.querySelector('.goal-name span:nth-child(2)').textContent)
        .toBe('<img id="goal-name-xss" src=x>');
      const logOutput = logs.log.mock.calls.flat().join(' ');
      expect(logOutput).not.toContain('fixture-private-chain-id');
      expect(logOutput).not.toContain('fixture-private-api-key');
    } finally {
      dom.window.close();
    }
  });

  test('rejects malformed, nonnumeric, negative, and oversized animation durations', async () => {
    const { dom, handlers, timers } = await createOverlayHarness();
    try {
      const animationHandler = handlers.get('zappiehell:overlay:animate');
      for (const duration of [-1, 0, 99, 10001, 1e30, Number.NaN, Number.POSITIVE_INFINITY, '1000', null]) {
        animationHandler({ animationType: 'flash', duration, data: {} });
      }

      expect(timers.size).toBe(0);
      expect(dom.window.document.getElementById('completionFlash').classList.contains('active')).toBe(false);

      animationHandler({ animationType: 'unrecognized-but-ignored', duration: 100, data: {} });
      expect([...timers.values()].map(timer => timer.delay)).toEqual([100]);
    } finally {
      dom.window.close();
    }
  });

  test('preserves BFCache state, reconnects once, and performs final cleanup idempotently', async () => {
    const { dom, handlers, socket, timers } = await createOverlayHarness();
    try {
      const animationHandler = handlers.get('zappiehell:overlay:animate');
      animationHandler({ duration: 1000 });
      const timerIds = [...timers.keys()];

      dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
      pageTransition(dom.window, 'pagehide', true);
      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(handlers.get('zappiehell:overlay:animate')).toBe(animationHandler);
      expect([...timers.keys()]).toEqual(timerIds);

      socket.connected = false;
      pageTransition(dom.window, 'pageshow', true);
      expect(socket.connect).toHaveBeenCalledTimes(1);
      expect(socket.disconnect).not.toHaveBeenCalled();

      pageTransition(dom.window, 'pagehide', false);
      dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
      pageTransition(dom.window, 'pagehide', false);
      expect(socket.disconnect).toHaveBeenCalledTimes(1);
      expect(handlers.size).toBe(0);
      expect(timers.size).toBe(0);

      animationHandler({ duration: 500 });
      expect(timers.size).toBe(0);
      expect(dom.window.document.getElementById('completionFlash').classList.contains('active')).toBe(true);
    } finally {
      dom.window.close();
    }
  });
});
