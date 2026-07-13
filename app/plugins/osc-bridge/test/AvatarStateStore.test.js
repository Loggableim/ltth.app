const AvatarStateStore = require('../modules/AvatarStateStore');

describe('AvatarStateStore', () => {
  let api;
  let store;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T12:00:00.000Z'));
    api = { emit: jest.fn(), log: jest.fn() };
    store = new AvatarStateStore(api);
  });

  afterEach(() => {
    store.destroy();
    jest.useRealTimers();
  });

  test('tracks parameter and PhysBone updates, history, and subscribers', () => {
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    store.updateParameter('/avatar/parameters/Wave', true, 'bool');
    store.updateParameter('/avatar/physbones/Tail/Angle', 0.75, 'float');

    expect(store.getParameter('/avatar/parameters/Wave')).toEqual(expect.objectContaining({
      value: true,
      type: 'bool'
    }));
    expect(store.getPhysBone('Tail')).toEqual(expect.objectContaining({
      parameters: { Angle: 0.75 }
    }));
    expect(store.getHistory('/avatar/parameters/Wave')).toEqual([
      expect.objectContaining({ value: true })
    ]);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'parameter_update',
      address: '/avatar/physbones/Tail/Angle'
    }));

    unsubscribe();
    store.setCurrentAvatar('avtr_example', 'Example Avatar');

    expect(store.getState()).toEqual(expect.objectContaining({
      parameters: [],
      physbones: [],
      currentAvatar: expect.objectContaining({ id: 'avtr_example', name: 'Example Avatar' })
    }));
  });

  test('automatically cleans aged history on its cleanup interval and caps retained entries', () => {
    store.maxHistoryAge = 100;
    store.maxHistoryEntries = 2;

    store.updateParameter('/avatar/parameters/Value', 1, 'int');
    jest.setSystemTime(new Date('2026-07-13T12:00:00.050Z'));
    store.updateParameter('/avatar/parameters/Value', 2, 'int');
    jest.setSystemTime(new Date('2026-07-13T12:00:00.100Z'));
    store.updateParameter('/avatar/parameters/Value', 3, 'int');

    expect(store.getHistory('/avatar/parameters/Value', 1000).map(entry => entry.value)).toEqual([2, 3]);

    store.startCleanup(25);
    jest.setSystemTime(new Date('2026-07-13T12:00:00.151Z'));
    jest.advanceTimersByTime(25);

    expect(store.getHistory('/avatar/parameters/Value', 1000).map(entry => entry.value)).toEqual([3]);
  });

  test('destroy cancels lifecycle timers without delayed state emissions or cleanup updates', () => {
    const listener = jest.fn();
    store.subscribe(listener);
    store.startCleanup(25);
    store.updateParameter('/avatar/parameters/One', 1, 'int');
    jest.setSystemTime(new Date('2026-07-13T12:00:00.050Z'));
    store.updateParameter('/avatar/parameters/Two', 2, 'int');

    expect(jest.getTimerCount()).toBeGreaterThan(0);

    store.destroy();
    const emissionsAfterDestroy = api.emit.mock.calls.length;
    jest.advanceTimersByTime(1000);

    expect(store.getState()).toEqual(expect.objectContaining({
      parameters: [],
      physbones: [],
      currentAvatar: null,
      lastUpdate: null
    }));
    expect(store.listeners.size).toBe(0);
    expect(store.cleanupInterval).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
    expect(api.emit).toHaveBeenCalledTimes(emissionsAfterDestroy);
  });
});
