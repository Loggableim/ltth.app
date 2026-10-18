'use strict';

const {
  CONTRACT_VERSION,
  ACTIONS,
  ENTRY_STATES,
  SKIP_REASONS,
  SCHEDULER_EVENTS,
  DEFAULT_TOLERANCE_MS,
  REQUIRED_CONTROLLER_METHODS,
  isTimeOfDay,
  assertShowplanEntry,
  isSchedulerController,
  assertSchedulerController,
  createInMemoryController
} = require('../modules/plugin-scheduler-contract');

describe('plugin-scheduler-contract constants', () => {
  test('exposes a version and the documented constants', () => {
    expect(typeof CONTRACT_VERSION).toBe('string');
    expect(CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ACTIONS).toEqual(['enable', 'disable']);
    expect(ENTRY_STATES).toEqual({
      pending: 'pending',
      applied: 'applied',
      skipped: 'skipped',
      failed: 'failed'
    });
    expect(SKIP_REASONS).toEqual({
      beforeStart: 'before-start',
      late: 'late',
      unknownPlugin: 'unknown-plugin',
      alreadyEnabled: 'already-enabled',
      alreadyDisabled: 'already-disabled'
    });
    expect(SCHEDULER_EVENTS).toEqual(['switch', 'skip', 'error']);
    expect(DEFAULT_TOLERANCE_MS).toBe(60000);
  });

  test('freezes every exported constant', () => {
    for (const value of [ACTIONS, ENTRY_STATES, SKIP_REASONS, SCHEDULER_EVENTS]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });
});

describe('plugin-scheduler-contract isTimeOfDay', () => {
  test('accepts HH:MM and HH:MM:SS', () => {
    expect(isTimeOfDay('20:30')).toBe(true);
    expect(isTimeOfDay('08:05:30')).toBe(true);
    expect(isTimeOfDay('8:05')).toBe(true);
    expect(isTimeOfDay(' 23:59 ')).toBe(true);
    expect(isTimeOfDay('00:00:00')).toBe(true);
  });

  test('rejects out-of-range and malformed values', () => {
    for (const value of ['24:00', '12:60', '12:00:60', '8:5', 'abc', '', '20', null, undefined, 123, {}]) {
      expect(isTimeOfDay(value)).toBe(false);
    }
  });
});

describe('plugin-scheduler-contract assertShowplanEntry', () => {
  test('normalizes a valid entry and defaults action to enable', () => {
    const entry = assertShowplanEntry({ pluginId: ' soundboard ', time: '20:30' });
    expect(entry).toEqual({ pluginId: 'soundboard', action: 'enable', at: null, time: '20:30' });
    expect(Object.isFrozen(entry)).toBe(true);
  });

  test('accepts absolute switch times and explicit disable', () => {
    const entry = assertShowplanEntry({ pluginId: 'quiz-show', action: 'disable', at: 1760000000000 });
    expect(entry).toEqual({ pluginId: 'quiz-show', action: 'disable', at: 1760000000000, time: null });
  });

  test('includes the entry index in validation errors', () => {
    expect(() => assertShowplanEntry({ pluginId: '' }, 2)).toThrow(/#2/);
  });

  test('rejects entries that break the contract', () => {
    expect(() => assertShowplanEntry(null)).toThrow(TypeError);
    expect(() => assertShowplanEntry([])).toThrow(TypeError);
    expect(() => assertShowplanEntry({ pluginId: '' })).toThrow(/pluginId/);
    expect(() => assertShowplanEntry({ pluginId: 'x', action: 'toggle' })).toThrow(/action/);
    expect(() => assertShowplanEntry({ pluginId: 'x' })).toThrow(/exactly one/);
    expect(() => assertShowplanEntry({ pluginId: 'x', at: 1, time: '10:00' })).toThrow(/exactly one/);
    expect(() => assertShowplanEntry({ pluginId: 'x', at: 'soon' })).toThrow(/finite number/);
    expect(() => assertShowplanEntry({ pluginId: 'x', time: '25:00' })).toThrow(/HH:MM/);
  });
});

describe('plugin-scheduler-contract controller validation', () => {
  const validController = {
    isKnown: () => true,
    enable: async () => {},
    disable: async () => {}
  };

  test('isSchedulerController accepts a structurally valid controller', () => {
    expect(isSchedulerController(validController)).toBe(true);
    expect(isSchedulerController(createInMemoryController().controller)).toBe(true);
  });

  test('isSchedulerController rejects missing or malformed controllers', () => {
    expect(isSchedulerController(null)).toBe(false);
    expect(isSchedulerController(undefined)).toBe(false);
    expect(isSchedulerController('controller')).toBe(false);
    expect(isSchedulerController({})).toBe(false);
    expect(isSchedulerController({ isKnown: true, enable() {}, disable() {} })).toBe(false);
  });

  test('assertSchedulerController returns the controller and lists missing methods', () => {
    expect(assertSchedulerController(validController)).toBe(validController);
    expect(() => assertSchedulerController(null)).toThrow(/must be an object/);
    expect(() => assertSchedulerController({ enable() {}, disable() {} })).toThrow(/isKnown/);
    expect(() => assertSchedulerController({ isKnown() {}, disable() {} })).toThrow(/\benable\b/);
    expect(() => assertSchedulerController({ isKnown() {}, enable() {} })).toThrow(/disable/);
  });

  test('REQUIRED_CONTROLLER_METHODS matches the documented interface', () => {
    expect(REQUIRED_CONTROLLER_METHODS).toEqual(['isKnown', 'enable', 'disable']);
  });
});

describe('plugin-scheduler-contract createInMemoryController', () => {
  test('seeds known and enabled sets from options', () => {
    const { controller } = createInMemoryController({ known: ['a', 'b'], enabled: ['b'] });
    expect(controller.isKnown('a')).toBe(true);
    expect(controller.isKnown('c')).toBe(false);
    expect(controller.isEnabled('b')).toBe(true);
    expect(controller.isEnabled('a')).toBe(false);
  });

  test('enable/disable mutate state and report whether something changed', async () => {
    const { controller } = createInMemoryController({ known: ['a'] });

    await expect(controller.enable('a')).resolves.toBe(true);
    expect(controller.isEnabled('a')).toBe(true);
    await expect(controller.enable('a')).resolves.toBe(false);

    await expect(controller.disable('a')).resolves.toBe(true);
    expect(controller.isEnabled('a')).toBe(false);
    await expect(controller.disable('a')).resolves.toBe(false);
  });

  test('records switch calls in order', async () => {
    const { controller, calls } = createInMemoryController({ known: ['a', 'b'] });

    await controller.enable('a');
    await controller.disable('b');

    expect(calls).toEqual([
      { action: 'enable', pluginId: 'a' },
      { action: 'disable', pluginId: 'b' }
    ]);
  });

  test('failFor rejects the switch, keeps state unchanged and still records the call', async () => {
    const { controller, calls, enabled } = createInMemoryController({ known: ['a'], failFor: ['a'] });

    await expect(controller.enable('a')).rejects.toThrow(/enable failed for 'a'/);
    expect(enabled.has('a')).toBe(false);
    expect(calls).toEqual([{ action: 'enable', pluginId: 'a' }]);
  });

  test('setKnown/setEnabled/reset support test arrangement', async () => {
    const helper = createInMemoryController();

    helper.setKnown('a', true);
    expect(helper.controller.isKnown('a')).toBe(true);
    helper.setKnown('a', false);
    expect(helper.controller.isKnown('a')).toBe(false);

    helper.setEnabled('a', true);
    expect(helper.controller.isEnabled('a')).toBe(true);
    helper.setEnabled('a', false);
    expect(helper.controller.isEnabled('a')).toBe(false);

    await helper.controller.enable('a');
    expect(helper.calls).toHaveLength(1);
    helper.reset();
    expect(helper.calls).toHaveLength(0);
  });

  test('the returned controller satisfies the scheduler contract', () => {
    const { controller } = createInMemoryController();
    expect(assertSchedulerController(controller)).toBe(controller);
  });
});
