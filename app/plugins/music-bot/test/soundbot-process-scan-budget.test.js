const { SoundbotProcessRegistry } = require('../lib/soundbot-process-registry');

describe('Soundbot process scan timeout budget', () => {
  afterEach(() => jest.useRealTimers());

  test('accepts a scan that completes within its requested five second budget', async () => {
    jest.useFakeTimers();
    const observedBudgets = [];
    const registry = new SoundbotProcessRegistry({}, {
      platform: 'linux',
      listProcesses: ({ timeoutMs }) => {
        observedBudgets.push(timeoutMs);
        return new Promise(resolve => setTimeout(() => resolve([]), 2500));
      }
    });

    const scan = registry.findMarkedProcesses({ timeoutMs: 5000 });
    await Promise.resolve();
    jest.advanceTimersByTime(2500);

    await expect(scan).resolves.toEqual([]);
    expect(observedBudgets).toEqual([5000]);
  });

  test('still rejects a provider scan that exceeds the requested five second budget', async () => {
    jest.useFakeTimers();
    const registry = new SoundbotProcessRegistry({}, {
      platform: 'linux',
      listProcesses: () => new Promise(() => {})
    });

    const scan = registry.findMarkedProcesses({ timeoutMs: 5000 });
    await Promise.resolve();
    jest.advanceTimersByTime(5000);
    await expect(scan).rejects.toThrow('Soundbot process scan timed out');
  });
});
