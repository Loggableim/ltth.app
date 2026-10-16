'use strict';

const { createPluginPort } = require('../plugin-port');
const { createFakeClock } = require('./fake-clock');

// AP2 cases. createHarness(options) returns { schedule, clock, replyCalls, handles }.
// Named exception in the default config: !sound does not change the block.
// Cooldown is open when elapsed >= the configured duration, closed when elapsed is smaller.
// Check order is global, then command, then user.

function defaultConfig(overrides = {}) {
  return {
    blockMs: 1000,
    idleMs: 5000,
    plugins: [
      { id: 'quiz-show', focus: 'quiz' },
      { id: 'music-sound', focus: 'music' },
      { id: 'connect4', focus: 'game' }
    ],
    cooldowns: {
      globalMs: 1000,
      perUserMs: 4000,
      commands: {
        '!quiz': 3000,
        '!song': 2000,
        '!sound': 1500,
        '!connect4': 3500
      }
    },
    idleTemplates: ['Moderation eins.', 'Moderation zwei.'],
    priority: { exceptions: ['!sound'] },
    ...overrides
  };
}

function defaultPorts(handles) {
  return [
    createPluginPort({
      id: 'quiz-show',
      commands: ['!quiz'],
      handle: async (command) => {
        handles.push({ id: 'quiz-show', command });
        return { text: 'Quiz' };
      }
    }),
    createPluginPort({
      id: 'music-sound',
      commands: ['!song', '!sound'],
      handle: async (command) => {
        handles.push({ id: 'music-sound', command });
        return { text: command === '!sound' ? 'Sound abgespielt.' : 'Song' };
      }
    }),
    createPluginPort({
      id: 'connect4',
      commands: ['!connect4'],
      handle: async (command) => {
        handles.push({ id: 'connect4', command });
        return { text: 'Vier gewinnt' };
      }
    })
  ];
}

function createScheduleHarness(factory, options = {}) {
  const clock = createFakeClock(0);
  const replyCalls = [];
  const handles = [];
  const schedule = factory({
    config: options.config || defaultConfig(),
    now: clock.now,
    ports: options.ports || defaultPorts(handles),
    replyEngine: {
      async reply() {
        replyCalls.push('reply');
        throw new Error('llm');
      }
    }
  });
  return { schedule, clock, replyCalls, handles };
}

function defineShowScheduleContract(createHarness) {
  test('block length comes from config', async () => {
    const short = createHarness();
    const started = short.schedule.start();
    expect(started).toMatchObject({ pluginId: 'quiz-show', focus: 'quiz', blockEndsAt: 1000 });
    short.clock.set(999);
    expect(short.schedule.active()).toEqual({ pluginId: 'quiz-show', focus: 'quiz' });
    expect(short.schedule.tick()).toMatchObject({ switched: false, pluginId: 'quiz-show' });
    short.clock.set(1000);
    expect(short.schedule.tick()).toMatchObject({ switched: true, pluginId: 'music-sound', focus: 'music' });

    const longer = createHarness({ config: defaultConfig({ blockMs: 2500 }) });
    longer.schedule.start();
    longer.clock.set(1000);
    expect(longer.schedule.tick()).toMatchObject({ switched: false, pluginId: 'quiz-show' });
    longer.clock.set(2499);
    expect(longer.schedule.tick()).toMatchObject({ switched: false, pluginId: 'quiz-show' });
    longer.clock.set(2500);
    expect(longer.schedule.tick()).toMatchObject({ switched: true, pluginId: 'music-sound' });
  });

  test('a tick inside the block does not switch and the next boundary does', async () => {
    const { schedule, clock } = createHarness();
    schedule.start();
    clock.set(1000);
    expect(schedule.tick().pluginId).toBe('music-sound');
    clock.set(1999);
    expect(schedule.tick()).toMatchObject({ switched: false, pluginId: 'music-sound' });
    clock.set(2000);
    expect(schedule.tick()).toMatchObject({ switched: true, pluginId: 'connect4', focus: 'game' });
  });

  test('one tick catches up every missed boundary and then waits for the next block', async () => {
    const { schedule, clock } = createHarness();
    schedule.start();
    clock.set(2000);
    expect(schedule.active().pluginId).toBe('quiz-show');
    expect(schedule.tick()).toMatchObject({ switched: true, pluginId: 'connect4', focus: 'game' });
    clock.set(2001);
    expect(schedule.tick()).toMatchObject({ switched: false, pluginId: 'connect4' });
  });

  test('the schedule does not read Date.now', async () => {
    const spy = jest.spyOn(Date, 'now').mockReturnValue(999999);
    try {
      const { schedule, clock } = createHarness();
      schedule.start();
      clock.set(1000);
      schedule.tick();
      await schedule.command({ user: 'viewer_01', text: '!quiz' });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test('a rotation never repeats a plugin or a focus', async () => {
    const { schedule, clock } = createHarness();
    schedule.start();
    const seen = [schedule.active()];
    for (const at of [1000, 2000, 3000, 4000, 5000]) {
      clock.set(at);
      seen.push(schedule.tick());
    }
    const ids = seen.map(item => item.pluginId);
    expect(ids).toEqual([
      'quiz-show',
      'music-sound',
      'connect4',
      'quiz-show',
      'music-sound',
      'connect4'
    ]);
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).not.toBe(ids[i - 1]);
      expect(seen[i].focus).not.toBe(seen[i - 1].focus);
    }
  });

  test('the same focus is skipped even when it is the next configured plugin', async () => {
    const handles = [];
    const harness = createHarness({
      config: defaultConfig({
        plugins: [
          { id: 'quiz-show', focus: 'quiz' },
          { id: 'quiz-extra', focus: 'quiz' },
          { id: 'music-sound', focus: 'music' }
        ]
      }),
      ports: [
        ...defaultPorts(handles),
        createPluginPort({
          id: 'quiz-extra',
          commands: ['!quiz'],
          handle: async () => ({ text: 'Extra' })
        })
      ]
    });
    harness.schedule.start();
    harness.clock.set(1000);
    expect(harness.schedule.tick()).toMatchObject({ pluginId: 'music-sound', focus: 'music' });
    harness.clock.set(2000);
    expect(harness.schedule.tick()).toMatchObject({ pluginId: 'quiz-show', focus: 'quiz' });
    expect(harness.schedule.active().pluginId).not.toBe('quiz-extra');
  });

  test('a schedule that cannot alternate focus does not start', async () => {
    const { schedule } = createHarness({
      config: defaultConfig({
        plugins: [
          { id: 'quiz-show', focus: 'quiz' },
          { id: 'quiz-extra', focus: 'quiz' }
        ]
      })
    });
    let caught = null;
    try {
      schedule.start();
    } catch (error) {
      caught = error;
    }
    expect(caught && caught.code).toBe('no-alternating-focus');
  });

  test('global cooldown closes one millisecond early and opens on the configured instant', async () => {
    const { schedule, clock, handles } = createHarness();
    schedule.start();
    await schedule.command({ user: 'viewer_01', text: '!quiz' });
    clock.set(999);
    const closed = await schedule.command({ user: 'viewer_02', text: '!song' });
    expect(closed).toMatchObject({
      accepted: false,
      code: 'cooldown-global',
      interrupted: false,
      pluginId: 'quiz-show'
    });
    clock.set(1000);
    const opened = await schedule.command({ user: 'viewer_02', text: '!song' });
    expect(opened).toMatchObject({
      accepted: true,
      interrupted: true,
      pluginId: 'music-sound',
      text: 'Song'
    });
    expect(handles.map(item => item.command)).toEqual(['!quiz', '!song']);
  });

  test('command cooldown is independent and opens on its own configured instant', async () => {
    const { schedule, clock } = createHarness();
    schedule.start();
    await schedule.command({ user: 'viewer_01', text: '!quiz' });
    clock.set(2999);
    const closed = await schedule.command({ user: 'viewer_02', text: '!quiz' });
    expect(closed).toMatchObject({ accepted: false, code: 'cooldown-command', pluginId: 'quiz-show' });
    clock.set(3000);
    const opened = await schedule.command({ user: 'viewer_02', text: '!quiz' });
    expect(opened).toMatchObject({ accepted: true, interrupted: false, pluginId: 'quiz-show', text: 'Quiz' });
  });

  test('a second config moves the command boundary', async () => {
    const { schedule, clock } = createHarness({
      config: defaultConfig({
        cooldowns: {
          globalMs: 100,
          perUserMs: 100,
          commands: { '!quiz': 8000, '!song': 100, '!sound': 100, '!connect4': 100 }
        }
      })
    });
    schedule.start();
    await schedule.command({ user: 'viewer_01', text: '!quiz' });
    clock.set(3000);
    expect(await schedule.command({ user: 'viewer_02', text: '!quiz' })).toMatchObject({
      accepted: false,
      code: 'cooldown-command'
    });
    clock.set(8000);
    expect(await schedule.command({ user: 'viewer_02', text: '!quiz' })).toMatchObject({ accepted: true });
  });

  test('user cooldown holds only that user and opens on the configured instant', async () => {
    const { schedule, clock } = createHarness();
    schedule.start();
    await schedule.command({ user: 'viewer_01', text: '!quiz' });
    clock.set(1000);
    expect(await schedule.command({ user: 'viewer_02', text: '!song' })).toMatchObject({
      accepted: true,
      pluginId: 'music-sound'
    });
    clock.set(3999);
    expect(await schedule.command({ user: 'viewer_01', text: '!connect4' })).toMatchObject({
      accepted: false,
      code: 'cooldown-user',
      interrupted: false,
      pluginId: 'music-sound'
    });
    clock.set(4000);
    expect(await schedule.command({ user: 'viewer_01', text: '!connect4' })).toMatchObject({
      accepted: true,
      interrupted: true,
      pluginId: 'connect4',
      text: 'Vier gewinnt'
    });
  });

  test('a shorter per-user config opens that user sooner', async () => {
    const { schedule, clock } = createHarness({
      config: defaultConfig({
        cooldowns: {
          globalMs: 100,
          perUserMs: 2500,
          commands: { '!quiz': 100, '!song': 100, '!sound': 100, '!connect4': 100 }
        }
      })
    });
    schedule.start();
    await schedule.command({ user: 'viewer_01', text: '!quiz' });
    clock.set(2499);
    expect(await schedule.command({ user: 'viewer_01', text: '!quiz' })).toMatchObject({ code: 'cooldown-user' });
    clock.set(2500);
    expect(await schedule.command({ user: 'viewer_01', text: '!quiz' })).toMatchObject({ accepted: true });
  });

  test('overlapping cooldowns report global, then command, then user', async () => {
    const { schedule, clock } = createHarness();
    schedule.start();
    await schedule.command({ user: 'viewer_01', text: '!quiz' });
    clock.set(50);
    expect(await schedule.command({ user: 'viewer_02', text: '!connect4' })).toMatchObject({ code: 'cooldown-global' });
    clock.set(1000);
    expect(await schedule.command({ user: 'viewer_02', text: '!quiz' })).toMatchObject({ code: 'cooldown-command' });
    clock.set(3000);
    expect(await schedule.command({ user: 'viewer_01', text: '!song' })).toMatchObject({
      code: 'cooldown-user',
      pluginId: 'quiz-show'
    });
  });

  test('idle text appears on the configured instant and uses the next template later', async () => {
    const { schedule, clock, replyCalls } = createHarness({
      config: defaultConfig({ blockMs: 100000 })
    });
    schedule.start();
    clock.set(4999);
    expect(schedule.tick()).toMatchObject({ switched: false, idle: null, pluginId: 'quiz-show' });
    clock.set(5000);
    expect(schedule.tick()).toMatchObject({
      switched: false,
      pluginId: 'quiz-show',
      idle: { text: 'Moderation eins.' }
    });
    clock.set(9999);
    expect(schedule.tick().idle).toBeNull();
    clock.set(10000);
    expect(schedule.tick().idle).toEqual({ text: 'Moderation zwei.' });
    expect(replyCalls).toEqual([]);
  });

  test('chat and a refused command restart the idle timer without calling the reply engine', async () => {
    const { schedule, clock, replyCalls } = createHarness({
      config: defaultConfig({ blockMs: 100000 })
    });
    schedule.start();
    clock.set(3000);
    expect(schedule.chat()).toMatchObject({ interrupted: false, pluginId: 'quiz-show' });
    clock.set(7999);
    expect(schedule.tick().idle).toBeNull();
    clock.set(8000);
    expect(schedule.tick().idle).toEqual({ text: 'Moderation eins.' });
    clock.set(9000);
    await schedule.command({ user: 'viewer_01', text: 'hallo' });
    clock.set(13999);
    expect(schedule.tick().idle).toBeNull();
    clock.set(14000);
    expect(schedule.tick().idle).toEqual({ text: 'Moderation zwei.' });
    expect(replyCalls).toEqual([]);
  });

  test('idle templates come from config and do not change the plugin', async () => {
    const { schedule, clock } = createHarness({
      config: defaultConfig({
        blockMs: 100000,
        idleMs: 2000,
        idleTemplates: ['Eigener Leerlauf.']
      })
    });
    schedule.start();
    clock.set(2000);
    const ticked = schedule.tick();
    expect(ticked.idle).toEqual({ text: 'Eigener Leerlauf.' });
    expect(ticked).toMatchObject({ switched: false, pluginId: 'quiz-show', focus: 'quiz' });
  });

  test('a command for another focus interrupts the block and restarts its timer', async () => {
    const { schedule, clock, handles } = createHarness();
    schedule.start();
    clock.set(400);
    const interrupted = await schedule.command({ user: 'viewer_01', text: '!connect4' });
    expect(interrupted).toMatchObject({
      accepted: true,
      interrupted: true,
      pluginId: 'connect4',
      focus: 'game',
      text: 'Vier gewinnt'
    });
    expect(handles).toEqual([{ id: 'connect4', command: '!connect4' }]);
    clock.set(1399);
    expect(schedule.tick()).toMatchObject({ switched: false, pluginId: 'connect4' });
    clock.set(1400);
    expect(schedule.tick()).toMatchObject({ switched: true, pluginId: 'quiz-show' });
  });

  test('!sound is the named exception and does not change the block', async () => {
    const { schedule, clock, handles } = createHarness();
    schedule.start();
    clock.set(100);
    const refused = await schedule.command({ user: 'viewer_01', text: '!sound' });
    expect(refused).toMatchObject({
      accepted: false,
      code: 'not-in-active-plugin',
      interrupted: false,
      pluginId: 'quiz-show'
    });
    expect(handles).toEqual([]);
    clock.set(1000);
    schedule.tick();
    const played = await schedule.command({ user: 'viewer_01', text: '!sound' });
    expect(played).toMatchObject({
      accepted: true,
      interrupted: false,
      pluginId: 'music-sound',
      text: 'Sound abgespielt.'
    });
  });

  test('free chat and the active command do not leave the block', async () => {
    const { schedule, clock } = createHarness();
    schedule.start();
    expect(schedule.chat()).toMatchObject({ interrupted: false, pluginId: 'quiz-show' });
    const again = await schedule.command({ user: 'viewer_01', text: '!quiz' });
    expect(again).toMatchObject({ accepted: true, interrupted: false, pluginId: 'quiz-show' });
    clock.set(1000);
    expect(schedule.tick()).toMatchObject({ switched: true, pluginId: 'music-sound' });
  });

  test('a cooldown rejection does not interrupt the block', async () => {
    const { schedule, clock } = createHarness();
    schedule.start();
    await schedule.command({ user: 'viewer_01', text: '!quiz' });
    clock.set(10);
    const rejected = await schedule.command({ user: 'viewer_02', text: '!connect4' });
    expect(rejected).toMatchObject({
      accepted: false,
      code: 'cooldown-global',
      interrupted: false,
      pluginId: 'quiz-show'
    });
  });

  test('removing !sound from the exception list lets it interrupt', async () => {
    const { schedule } = createHarness({
      config: defaultConfig({ priority: { exceptions: [] } })
    });
    schedule.start();
    const played = await schedule.command({ user: 'viewer_01', text: '!sound' });
    expect(played).toMatchObject({
      accepted: true,
      interrupted: true,
      pluginId: 'music-sound',
      text: 'Sound abgespielt.'
    });
  });

  test('an exception listed in config no longer interrupts', async () => {
    const { schedule, clock } = createHarness({
      config: defaultConfig({ priority: { exceptions: ['!sound', '!connect4'] } })
    });
    schedule.start();
    clock.set(100);
    expect(await schedule.command({ user: 'viewer_01', text: '!connect4' })).toMatchObject({
      accepted: false,
      code: 'not-in-active-plugin',
      interrupted: false,
      pluginId: 'quiz-show'
    });
  });

  test('a command that would repeat the current focus does not switch', async () => {
    const handles = [];
    const { schedule } = createHarness({
      config: defaultConfig({
        plugins: [
          { id: 'quiz-extra', focus: 'quiz' },
          { id: 'quiz-show', focus: 'quiz' },
          { id: 'music-sound', focus: 'music' }
        ]
      }),
      ports: [
        createPluginPort({
          id: 'quiz-show',
          commands: ['!quiz'],
          handle: async () => {
            handles.push('quiz-show');
            return { text: 'Quiz' };
          }
        }),
        createPluginPort({
          id: 'quiz-extra',
          commands: ['!quiz'],
          handle: async () => {
            handles.push('quiz-extra');
            return { text: 'Extra' };
          }
        }),
        createPluginPort({
          id: 'music-sound',
          commands: ['!song', '!sound'],
          handle: async () => ({ text: 'Song' })
        })
      ]
    });
    schedule.start();
    const refused = await schedule.command({ user: 'viewer_01', text: '!quiz' });
    expect(refused).toMatchObject({
      accepted: false,
      code: 'same-focus',
      interrupted: false,
      pluginId: 'quiz-extra'
    });
    expect(handles).toEqual([]);
  });
}

module.exports = {
  defineShowScheduleContract,
  createScheduleHarness,
  defaultConfig
};
