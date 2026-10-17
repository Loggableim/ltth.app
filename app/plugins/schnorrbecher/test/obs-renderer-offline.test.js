const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function makeEmitter() {
  const listeners = new Map();
  return {
    listeners,
    on(event, handler) {
      const handlers = listeners.get(event) || [];
      handlers.push(handler);
      listeners.set(event, handlers);
    },
    off(event, handler) {
      const remaining = (listeners.get(event) || []).filter(candidate => candidate !== handler);
      listeners.set(event, remaining);
    },
    fire(event, payload) {
      for (const handler of [...(listeners.get(event) || [])]) handler(payload);
    }
  };
}

describe('Schnorrbecher offline renderer lifecycle', () => {
  test('retains the real renderer through BFCache and ignores late callbacks after final destroy', () => {
    const overlayDir = path.join(__dirname, '..', 'overlay');
    const html = fs.readFileSync(path.join(overlayDir, 'coincup.html'), 'utf8');
    const script = fs.readFileSync(path.join(overlayDir, 'coincup.js'), 'utf8');
    const socket = makeEmitter();
    const matterEvents = makeEmitter();
    const emitted = [];
    const timerCallbacks = new Map();
    const cancelledTimers = new Set();
    const frameCallbacks = new Map();
    const cancelledFrames = new Set();
    let nextTimerId = 0;
    let nextFrameId = 0;
    const audit = { runnerStarted: 0, runnerStopped: 0, engineCleared: 0, externalDisconnects: 0 };
    const socketForeign = jest.fn();
    const matterForeign = jest.fn();
    socket.on('coinJar.sync', socketForeign);
    matterEvents.on('afterUpdate', matterForeign);
    const foreignSocketHandler = socket.listeners.get('coinJar.sync')[0];
    const foreignMatterHandler = matterEvents.listeners.get('afterUpdate')[0];
    const fakeSocket = {
      on: socket.on,
      off: socket.off,
      emit(event, payload) { emitted.push({ event, payload }); },
      disconnect() { audit.externalDisconnects += 1; }
    };
    const matter = {
      Engine: {
        create: () => ({ world: {} }),
        clear: () => { audit.engineCleared += 1; }
      },
      Runner: {
        create: () => ({}),
        run: () => { audit.runnerStarted += 1; },
        stop: () => { audit.runnerStopped += 1; }
      },
      Events: {
        on(_target, event, handler) { matterEvents.on(event, handler); },
        off(_target, event, handler) { matterEvents.off(event, handler); }
      },
      Bodies: { rectangle: (...args) => ({ args }) },
      Composite: { add() {}, remove() {} }
    };
    const dom = new JSDOM(html, {
      url: 'http://127.0.0.1:3000/overlay/coincup?transparent=1&lang=de',
      runScripts: 'outside-only'
    });
    let audioPlay;

    try {
      audioPlay = jest.spyOn(dom.window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
      dom.window.Matter = matter;
      dom.window.io = () => fakeSocket;
      dom.window.eval(script);
      const overlay = new dom.window.CoinJarOverlay({
        socket: fakeSocket,
        Matter: matter,
        setTimeoutFn(callback) {
          const id = nextTimerId++;
          timerCallbacks.set(id, callback);
          return id;
        },
        clearTimeoutFn(id) { cancelledTimers.add(id); },
        requestAnimationFrame(callback) {
          const id = nextFrameId++;
          frameCallbacks.set(id, callback);
          return id;
        },
        cancelAnimationFrame(id) { cancelledFrames.add(id); }
      });
      const updateBodies = jest.spyOn(overlay, '_updateBodies').mockImplementation(() => {});
      const renderCounter = jest.spyOn(overlay, '_renderCounter');
      const createCoin = jest.spyOn(overlay, '_createCoin').mockImplementation(() => {
        const body = { plugin: { element: { remove: jest.fn() } } };
        overlay.bodies.push(body);
        return body;
      });
      const telemetryBeforeLifecycle = emitted.length;

      expect(dom.window.document.querySelector('#coin-jar-scene')).not.toBeNull();
      expect(dom.window.document.querySelector('#coin-jar-impact-sound').getAttribute('src'))
        .toBe('/plugins/schnorrbecher/assets/sounds/adriantnt_glass.mp3');
      expect(audit.runnerStarted).toBe(1);
      socket.fire('connect');
      expect(emitted).toContainEqual({ event: 'coinJar.sync.request', payload: undefined });
      socket.fire('coinJar.config', {
        jarLabel: 'Public jar',
        counterLabel: 'Gift coins',
        showCounter: true,
        showGiftPopup: true,
        showSenderName: true,
        showGiftImage: true
      });
      expect(overlay.config.jarLabel).toBe('Public jar');
      expect(overlay.config).not.toHaveProperty('remoteDebug');

      const firstFrame = [...frameCallbacks.values()][0];
      const cachedPageHide = new dom.window.Event('pagehide');
      Object.defineProperty(cachedPageHide, 'persisted', { value: true });
      dom.window.dispatchEvent(cachedPageHide);
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
      expect(overlay.destroyed).toBe(false);
      socket.fire('coinJar.config', { jarLabel: 'Still active after BFCache' });
      expect(overlay.config.jarLabel).toBe('Still active after BFCache');
      const publicSync = {
        generation: 4,
        totalCoinValue: 12,
        visualCoinCount: 1,
        recentGifts: [{ giftName: 'Rose', giftImage: '/plugins/catalog/rose.png' }]
      };
      socket.fire('coinJar.sync', publicSync);
      expect(overlay.counterTarget).toBe(12);
      expect(overlay.bodies).toHaveLength(1);
      expect(createCoin).toHaveBeenLastCalledWith(expect.objectContaining({
        totalValue: 12,
        giftName: 'Rose',
        giftImage: '/plugins/catalog/rose.png',
        generation: 4
      }), expect.objectContaining({ settled: true }));
      const firstSyncedBody = overlay.bodies[0];
      socket.fire('connect');
      expect(emitted.filter(item => item.event === 'coinJar.sync.request')).toHaveLength(2);
      socket.fire('coinJar.sync', publicSync);
      expect(overlay.bodies).toHaveLength(1);
      expect(firstSyncedBody.plugin.element.remove).toHaveBeenCalledTimes(1);
      matterEvents.fire('afterUpdate');
      expect(updateBodies).toHaveBeenCalledTimes(1);

      const timerCountBeforeStaleAdd = timerCallbacks.size;
      socket.fire('coinJar.add', { generation: 3, visualCoins: 1, totalValue: 1, giftName: 'Stale' });
      expect(timerCallbacks.size).toBe(timerCountBeforeStaleAdd);
      socket.fire('coinJar.add', { generation: 4, visualCoins: 1, totalValue: 1 });
      socket.fire('coinJar.add', {
        generation: 4,
        totalCoinValue: 13,
        visualCoins: 1,
        totalValue: 1,
        giftName: 'Tulip',
        giftImage: '',
        senderName: 'Viewer'
      });
      expect(dom.window.document.querySelector('#gift-popup').textContent).toBe('Viewer Tulip +1');
      expect(timerCallbacks.size).toBeGreaterThanOrEqual(2);
      expect(overlay.queue).toHaveLength(1);
      const queuedSpawn = timerCallbacks.get(overlay.spawnTimer);
      const popupTimer = overlay.popupTimer;
      overlay.counterTarget = overlay.counterValue + 100;
      overlay._renderCounter();
      const lateFrame = [...frameCallbacks.values()].at(-1);
      expect(frameCallbacks.size).toBeGreaterThan(0);
      overlay.config.soundEnabled = true;
      const lateSocketSync = socket.listeners.get('coinJar.sync').find(handler => handler !== foreignSocketHandler);
      const lateSocketConfig = socket.listeners.get('coinJar.config')[0];
      const lateMatterUpdate = matterEvents.listeners.get('afterUpdate').find(handler => handler !== foreignMatterHandler);
      const lateMatterCollision = matterEvents.listeners.get('collisionStart')[0];
      const handleCollisions = jest.spyOn(overlay, '_handleCollisions');
      const rendersBeforeFinalHide = renderCounter.mock.calls.length;
      const activeImpactSound = {
        currentTime: 3,
        pause: jest.fn(),
        removeEventListener: jest.fn()
      };
      const impactSoundHandler = jest.fn();
      overlay.activeImpactSounds.add(activeImpactSound);
      overlay.impactSoundListeners.set(activeImpactSound, impactSoundHandler);

      const finalPageHide = new dom.window.Event('pagehide');
      Object.defineProperty(finalPageHide, 'persisted', { value: false });
      dom.window.dispatchEvent(finalPageHide);
      expect(overlay.destroyed).toBe(true);
      expect(audit).toMatchObject({ runnerStarted: 1, runnerStopped: 1, engineCleared: 1, externalDisconnects: 0 });
      expect(cancelledTimers).toContain(0);
      expect(cancelledTimers).toContain(1);
      expect(cancelledFrames).toContain(0);
      expect(cancelledTimers.has(popupTimer)).toBe(true);
      expect(cancelledFrames.size).toBeGreaterThan(0);
      expect(activeImpactSound.pause).toHaveBeenCalledTimes(1);
      expect(activeImpactSound.currentTime).toBe(0);
      expect(activeImpactSound.removeEventListener).toHaveBeenCalledWith('ended', impactSoundHandler);
      expect(activeImpactSound.removeEventListener).toHaveBeenCalledWith('error', impactSoundHandler);
      expect(overlay.activeImpactSounds.size).toBe(0);
      expect(socket.listeners.get('coinJar.sync')).toEqual([foreignSocketHandler]);
      expect(matterEvents.listeners.get('afterUpdate')).toEqual([foreignMatterHandler]);

      const destroyedSnapshot = {
        config: { ...overlay.config },
        generation: overlay.generation,
        counterTarget: overlay.counterTarget,
        queue: [...overlay.queue],
        emissions: emitted.length,
        counterText: dom.window.document.querySelector('#coin-jar-counter').textContent
      };
      socket.fire('connect');
      socket.fire('coinJar.config', { jarLabel: 'Late config' });
      socket.fire('coinJar.sync', { generation: 9, totalCoinValue: 999, visualCoinCount: 1 });
      socket.fire('coinJar.add', { generation: 9, visualCoins: 1, totalValue: 50 });
      socket.fire('coinJar.reset', { generation: 10 });
      matterEvents.fire('afterUpdate');
      matterEvents.fire('collisionStart', { pairs: [{ bodyA: { plugin: {} }, bodyB: {} }] });
      lateSocketConfig({ jarLabel: 'Queued late config' });
      lateSocketSync({ generation: 10, totalCoinValue: 1000, visualCoinCount: 1 });
      lateMatterUpdate();
      lateMatterCollision({ pairs: [{ bodyA: { plugin: {} }, bodyB: {} }] });
      queuedSpawn();
      if (popupTimer != null) timerCallbacks.get(popupTimer)?.();
      firstFrame?.();
      lateFrame?.();
      overlay.applyConfig({ jarLabel: 'Direct late config' });
      overlay.applySync({ generation: 11, totalCoinValue: 1000, visualCoinCount: 0 });
      overlay.enqueueSpawn({ generation: 11, visualCoins: 2, totalValue: 2 });
      overlay.clear({ generation: 12 });

      expect(overlay.config).toEqual(destroyedSnapshot.config);
      expect(overlay.generation).toBe(destroyedSnapshot.generation);
      expect(overlay.counterTarget).toBe(destroyedSnapshot.counterTarget);
      expect(overlay.queue).toEqual(destroyedSnapshot.queue);
      expect(emitted).toHaveLength(destroyedSnapshot.emissions);
      expect(dom.window.document.querySelector('#coin-jar-counter').textContent).toBe(destroyedSnapshot.counterText);
      expect(updateBodies).toHaveBeenCalledTimes(1);
      expect(handleCollisions).not.toHaveBeenCalled();
      expect(createCoin).toHaveBeenCalledTimes(2);
      expect(audioPlay).not.toHaveBeenCalled();
      expect(renderCounter).toHaveBeenCalledTimes(rendersBeforeFinalHide);
      expect(socketForeign).toHaveBeenCalledTimes(3);
      expect(matterForeign).toHaveBeenCalledTimes(2);

      overlay.destroy();
      expect(audit.runnerStopped).toBe(1);
      expect(audit.engineCleared).toBe(1);
      expect(audit.externalDisconnects).toBe(0);
    } finally {
      audioPlay?.mockRestore();
      dom.window.close();
    }
  });
});
