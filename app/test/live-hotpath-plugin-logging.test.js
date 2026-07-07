const LastEventSpotlightPlugin = require('../plugins/spotlight/main');
const { Timer } = require('../plugins/advanced-timer/engine/timer-engine');

function createLastEventApi() {
  return {
    getConfig: jest.fn(async () => null),
    setConfig: jest.fn(async () => true),
    getDatabase: jest.fn(() => null),
    emit: jest.fn(),
    log: jest.fn()
  };
}

describe('live hotpath plugin logging', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('debounces high-volume last-like persistence while updating memory immediately', async () => {
    jest.useFakeTimers();
    const api = createLastEventApi();
    const plugin = new LastEventSpotlightPlugin(api);

    await plugin.saveLastUser('like', { nickname: 'First Like' });
    await plugin.saveLastUser('like', { nickname: 'Second Like' });

    expect(plugin.lastUsers.like).toEqual(expect.objectContaining({
      nickname: 'Second Like'
    }));
    expect(api.setConfig).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(plugin.chatterPersistDelayMs);

    expect(api.setConfig).toHaveBeenCalledTimes(1);
    expect(api.setConfig).toHaveBeenCalledWith('lastuser:like', expect.objectContaining({
      nickname: 'Second Like'
    }));
  });

  test('logs last-like overlay updates at debug level', async () => {
    jest.useFakeTimers();
    const api = createLastEventApi();
    const plugin = new LastEventSpotlightPlugin(api);

    await plugin.handleEvent('like', 'like', {
      user: {
        uniqueId: 'liker1',
        nickname: 'Liker One'
      },
      likeCount: 5
    });

    expect(api.emit).toHaveBeenCalledWith('lastevent.update.like', expect.objectContaining({
      nickname: 'Liker One'
    }));
    expect(api.log).toHaveBeenCalledWith('Updated last like: Liker One', 'debug');
  });

  test('logs timer add-time updates at debug level for high-volume sources', () => {
    const api = { log: jest.fn() };
    const timer = new Timer({
      id: 'timer-1',
      name: 'Test Timer',
      mode: 'countdown',
      current_value: 10,
      config: {}
    }, api);

    timer.addTime(15, 'like:undefined');

    expect(timer.currentValue).toBe(25);
    expect(api.log).toHaveBeenCalledWith(
      'Added 15s to timer Test Timer (source: like:undefined)',
      'debug'
    );
  });
});
