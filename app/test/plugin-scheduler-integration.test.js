'use strict';

/**
 * Plugin-Scheduler Integrationstests (lt-5df T3, Bead lt-4wn)
 *
 * Anders als `plugin-scheduler.test.js` (T2, reine Unit-Tests gegen Fakes)
 * fahren diese Tests den Scheduler gegen den ECHTEN `PluginLoader`
 * (`app/modules/plugin-loader.js`) ueber den Adapter `createPluginLoaderController`.
 * Damit wird der komplette Schedule/Switch-Pfad geprueft: Schaltpunkt faellig ->
 * Controller -> Loader-Enable/Disable auf der Platte -> State-Datei.
 *
 * Zusaetzlich wird die Contract-Konformitaet zwischen T1
 * (`plugin-scheduler-contract.js`) und T2 (`plugin-scheduler.js`) abgesichert.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const PluginLoader = require('../modules/plugin-loader');
const {
  createPluginScheduler,
  createPluginLoaderController,
  normalizeShowplan,
  ACTIONS,
  ENTRY_STATES,
  SKIP_REASONS,
  DEFAULT_TOLERANCE_MS
} = require('../modules/plugin-scheduler');
const contract = require('../modules/plugin-scheduler-contract');

function createClock(start = 0) {
  const state = { now: start };
  return {
    now: () => state.now,
    set: (value) => { state.now = value; },
    advance: (ms) => { state.now += ms; }
  };
}

function createLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function writePluginFixture(pluginsDir, id, options = {}) {
  const pluginDir = path.join(pluginsDir, id);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
    id,
    name: id,
    version: '1.0.0',
    entry: 'main.js',
    enabled: options.enabled === true
  }));
  const body = options.broken
    ? "module.exports = class { constructor() {} async init() { throw new Error('fixture init failure'); } };\n"
    : 'module.exports = class { constructor(api) { this.api = api; } async init() {} };\n';
  fs.writeFileSync(path.join(pluginDir, 'main.js'), body);
}

function readStateFile(pluginsDir) {
  const stateFile = path.join(pluginsDir, 'plugins_state.json');
  if (!fs.existsSync(stateFile)) return {};
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

describe('plugin scheduler ↔ PluginLoader integration', () => {
  let base;
  let pluginsDir;
  let loader;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-scheduler-int-'));
    pluginsDir = path.join(base, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    loader = new PluginLoader(
      pluginsDir,
      express(),
      { on: jest.fn(), sockets: { sockets: new Map() } },
      {},
      createLogger(),
      { getPluginDataDir: () => path.join(base, 'data') },
      'default'
    );
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  test('enables a real plugin at its scheduled time and persists the switch', async () => {
    writePluginFixture(pluginsDir, 'scheduler-alpha');
    const clock = createClock(0);
    const scheduler = createPluginScheduler({
      plan: [{ at: 1000, pluginId: 'scheduler-alpha' }],
      controller: createPluginLoaderController(loader),
      clock: clock.now,
      toleranceMs: 0
    });

    await scheduler.tick();
    expect(loader.isPluginEnabledFromDisk('scheduler-alpha')).toBe(false);

    clock.set(1000);
    const status = await scheduler.tick();

    expect(status.applied).toBe(1);
    expect(status.pending).toBe(0);
    expect(status.activePluginId).toBe('scheduler-alpha');
    expect(loader.isPluginEnabledFromDisk('scheduler-alpha')).toBe(true);
    expect(loader.plugins.has('scheduler-alpha')).toBe(true);
    expect(readStateFile(pluginsDir)['scheduler-alpha'].enabled).toBe(true);
  });

  test('disables a real plugin at its scheduled time', async () => {
    writePluginFixture(pluginsDir, 'scheduler-beta');
    await loader.enablePlugin('scheduler-beta');
    expect(loader.isPluginEnabledFromDisk('scheduler-beta')).toBe(true);

    const clock = createClock(0);
    const scheduler = createPluginScheduler({
      plan: [{ at: 50, pluginId: 'scheduler-beta', action: 'disable' }],
      controller: createPluginLoaderController(loader),
      clock: clock.now,
      toleranceMs: 0
    });

    clock.set(50);
    const status = await scheduler.tick();

    expect(status.applied).toBe(1);
    expect(loader.isPluginEnabledFromDisk('scheduler-beta')).toBe(false);
    expect(readStateFile(pluginsDir)['scheduler-beta'].enabled).toBe(false);
  });

  test('executes an ordered enable → disable → enable showplan against the loader', async () => {
    writePluginFixture(pluginsDir, 'scheduler-alpha');
    writePluginFixture(pluginsDir, 'scheduler-beta');
    const clock = createClock(0);
    const scheduler = createPluginScheduler({
      plan: [
        { at: 10, pluginId: 'scheduler-alpha', action: 'enable' },
        { at: 20, pluginId: 'scheduler-alpha', action: 'disable' },
        { at: 30, pluginId: 'scheduler-beta', action: 'enable' }
      ],
      controller: createPluginLoaderController(loader),
      clock: clock.now,
      toleranceMs: 1000
    });

    const switches = [];
    scheduler.on('switch', (payload) => switches.push(`${payload.entry.action}:${payload.entry.pluginId}`));

    clock.set(30);
    const status = await scheduler.tick();

    expect(status.applied).toBe(3);
    expect(switches).toEqual([
      'enable:scheduler-alpha',
      'disable:scheduler-alpha',
      'enable:scheduler-beta'
    ]);
    expect(loader.isPluginEnabledFromDisk('scheduler-alpha')).toBe(false);
    expect(loader.isPluginEnabledFromDisk('scheduler-beta')).toBe(true);
  });

  test('skips a switch beyond tolerance without touching the loader', async () => {
    writePluginFixture(pluginsDir, 'scheduler-alpha');
    const enableSpy = jest.spyOn(loader, 'enablePlugin');
    const clock = createClock(0);
    const scheduler = createPluginScheduler({
      plan: [{ at: 100, pluginId: 'scheduler-alpha' }],
      controller: createPluginLoaderController(loader),
      clock: clock.now,
      toleranceMs: 50
    });

    clock.set(200);
    const status = await scheduler.tick();

    expect(enableSpy).not.toHaveBeenCalled();
    expect(loader.isPluginEnabledFromDisk('scheduler-alpha')).toBe(false);
    expect(status.skipped).toBe(1);
    expect(status.entries[0].reason).toBe(SKIP_REASONS.late);
  });

  test('skips an unknown plugin and still switches a later known plugin', async () => {
    writePluginFixture(pluginsDir, 'scheduler-beta');
    const clock = createClock(0);
    const scheduler = createPluginScheduler({
      plan: [
        { at: 10, pluginId: 'scheduler-ghost' },
        { at: 20, pluginId: 'scheduler-beta' }
      ],
      controller: createPluginLoaderController(loader),
      clock: clock.now,
      toleranceMs: 1000
    });

    clock.set(20);
    const status = await scheduler.tick();

    expect(status.entries[0].reason).toBe(SKIP_REASONS.unknownPlugin);
    expect(status.applied).toBe(1);
    expect(loader.isPluginEnabledFromDisk('scheduler-beta')).toBe(true);
  });

  test('single-flight prevents overlapping loader switches', async () => {
    writePluginFixture(pluginsDir, 'scheduler-alpha');
    writePluginFixture(pluginsDir, 'scheduler-beta');
    const enableSpy = jest.spyOn(loader, 'enablePlugin');
    const clock = createClock(0);
    const scheduler = createPluginScheduler({
      plan: [
        { at: 5, pluginId: 'scheduler-alpha' },
        { at: 6, pluginId: 'scheduler-beta' }
      ],
      controller: createPluginLoaderController(loader),
      clock: clock.now,
      toleranceMs: 1000
    });

    clock.set(6);
    await Promise.all([scheduler.tick(), scheduler.tick(), scheduler.tick()]);

    expect(enableSpy).toHaveBeenCalledTimes(2);
    expect(loader.isPluginEnabledFromDisk('scheduler-alpha')).toBe(true);
    expect(loader.isPluginEnabledFromDisk('scheduler-beta')).toBe(true);
  });

  test('records a failed plugin load as error and continues with later switches', async () => {
    writePluginFixture(pluginsDir, 'scheduler-broken', { broken: true });
    writePluginFixture(pluginsDir, 'scheduler-beta');
    const clock = createClock(0);
    const scheduler = createPluginScheduler({
      plan: [
        { at: 10, pluginId: 'scheduler-broken' },
        { at: 20, pluginId: 'scheduler-beta' }
      ],
      controller: createPluginLoaderController(loader),
      clock: clock.now,
      toleranceMs: 1000
    });

    const errors = [];
    scheduler.on('error', (payload) => errors.push(payload));

    clock.set(20);
    const status = await scheduler.tick();

    expect(status.failed).toBe(1);
    expect(status.applied).toBe(1);
    expect(status.entries[0].reason).toBe('error');
    expect(errors).toHaveLength(1);
    expect(errors[0].entry.pluginId).toBe('scheduler-broken');
    expect(loader.isPluginEnabledFromDisk('scheduler-beta')).toBe(true);
  });

  test('the loader adapter satisfies the scheduler contract', () => {
    const controller = createPluginLoaderController(loader);
    expect(contract.isSchedulerController(controller)).toBe(true);
    expect(() => contract.assertSchedulerController(controller)).not.toThrow();
  });
});

describe('plugin scheduler ↔ contract conformance (T1 ↔ T2/T3)', () => {
  test('implementation constants match the contract', () => {
    expect(ACTIONS).toEqual(contract.ACTIONS);
    expect(ENTRY_STATES).toEqual(contract.ENTRY_STATES);
    expect(SKIP_REASONS).toEqual(contract.SKIP_REASONS);
    expect(DEFAULT_TOLERANCE_MS).toBe(contract.DEFAULT_TOLERANCE_MS);
  });

  test('the T1 reference controller drives the T2 scheduler end to end', async () => {
    const memory = contract.createInMemoryController({ known: ['alpha'], enabled: [] });
    const clock = createClock(0);
    const scheduler = createPluginScheduler({
      plan: [{ at: 5, pluginId: 'alpha' }],
      controller: memory.controller,
      clock: clock.now,
      toleranceMs: 0
    });

    clock.set(5);
    const status = await scheduler.tick();

    expect(status.applied).toBe(1);
    expect(memory.enabled.has('alpha')).toBe(true);
    expect(memory.calls).toEqual([{ action: 'enable', pluginId: 'alpha' }]);
  });

  test('contract and implementation resolve the same showplan switch times', () => {
    const startOfDay = 1_000_000;
    const raw = [
      { time: '20:30', pluginId: 'quiz-show' },
      { time: '08:05:30', pluginId: 'soundboard' }
    ];
    const resolved = normalizeShowplan(raw, { startOfDay });
    const expected = raw.map((entry) => {
      const parsed = contract.assertShowplanEntry(entry);
      const [hours, minutes, seconds] = parsed.time.split(':').map(Number);
      return {
        pluginId: parsed.pluginId,
        action: parsed.action,
        at: startOfDay + ((hours * 60 + minutes) * 60 + (seconds || 0)) * 1000
      };
    }).sort((left, right) => left.at - right.at);

    expect(resolved.map(({ at, pluginId, action }) => ({ at, pluginId, action }))).toEqual(expected);
  });
});
