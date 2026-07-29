'use strict';

const { JSDOM } = require('jsdom');
const EggStageView = require(
  '../plugins/streamalchemy/streammonsters-egg-stage-view'
);

function mountShelf() {
  const dom = new JSDOM(`
    <!doctype html>
    <section id="egg-shelf">
      <div data-egg-slots></div>
      <div data-egg-overflow></div>
    </section>
  `);
  return dom.window.document;
}

function egg(visualId, overrides = {}) {
  return {
    visualId,
    provenance: 'gift',
    ownershipState: 'owned',
    adoptionStatus: 'owned',
    adoptable: false,
    displayName: 'Viewer',
    element: 'Volt',
    variant: 'standard',
    state: 'incubating',
    timing: { landedAtMs: 1_000, readyAtMs: 91_000 },
    ...overrides
  };
}

describe('Stream Monsters 1.11 living shelf animation lifecycle', () => {
  test('keeps the same landing node through timer and stage updates until animationend', () => {
    const document = mountShelf();
    const intervals = [];
    const view = EggStageView.createEggStageView({
      document,
      now: () => 2_000,
      setInterval: callback => {
        intervals.push(callback);
        return intervals.length;
      },
      clearInterval: () => {},
      setTimeout: () => 1,
      clearTimeout: () => {}
    });

    expect(view.applyEvent('egg_landed', { eggStage: egg('egg-flight') })).toBe(true);
    const landing = document.querySelector('[data-egg-id="egg-flight"]');
    expect(landing.classList).toContain('landing');

    intervals[1]();
    expect(document.querySelector('[data-egg-id="egg-flight"]')).toBe(landing);
    expect(landing.classList).toContain('landing');

    view.applyEvent('egg_stage_updated', {
      eggStage: egg('egg-flight', {
        timing: { landedAtMs: 1_000, readyAtMs: 80_000 }
      })
    });
    expect(document.querySelector('[data-egg-id="egg-flight"]')).toBe(landing);
    expect(landing.classList).toContain('landing');

    landing.dispatchEvent(new document.defaultView.Event('animationend'));
    expect(landing.classList).not.toContain('landing');
  });

  test('does not let the one-second countdown tick cut off a longer keyed landing', () => {
    const document = mountShelf();
    const intervals = [];
    let nowMs = 2_000;
    const visualId = Array.from({ length: 200 }, (_, index) => `long-flight-${index}`)
      .find(candidate => {
        const motion = EggStageView.deterministicEggMotion(candidate);
        return motion.delayMs + motion.durationMs > 1_000;
      });
    expect(visualId).toEqual(expect.any(String));

    const view = EggStageView.createEggStageView({
      document,
      now: () => nowMs,
      setInterval: callback => {
        intervals.push(callback);
        return intervals.length;
      },
      clearInterval: () => {},
      setTimeout: () => 1,
      clearTimeout: () => {}
    });

    view.applyEvent('egg_landed', { eggStage: egg(visualId) });
    const landing = document.querySelector(`[data-egg-id="${visualId}"]`);
    expect(landing.classList).toContain('landing');

    nowMs += 1_000;
    intervals[1]();

    expect(document.querySelector(`[data-egg-id="${visualId}"]`)).toBe(landing);
    expect(landing.classList).toContain('landing');
  });

  test('settles only on the keyed landing animation or its motion-aware safety timer', () => {
    const document = mountShelf();
    const timers = [];
    const view = EggStageView.createEggStageView({
      document,
      now: () => 2_000,
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length;
      },
      clearTimeout: () => {}
    });

    view.applyEvent('egg_landed', { eggStage: egg('egg-animation-event') });
    const eventEgg = document.querySelector('[data-egg-id="egg-animation-event"]');
    const unrelated = new document.defaultView.Event('animationend');
    Object.defineProperty(unrelated, 'animationName', { value: 'free-egg-jump' });
    eventEgg.dispatchEvent(unrelated);
    expect(eventEgg.classList).toContain('landing');

    const landingEnd = new document.defaultView.Event('animationend');
    Object.defineProperty(landingEnd, 'animationName', { value: 'egg-shelf-land' });
    eventEgg.dispatchEvent(landingEnd);
    expect(eventEgg.classList).not.toContain('landing');

    view.applyEvent('egg_landed', { eggStage: egg('egg-safety-timer') });
    const timerEgg = document.querySelector('[data-egg-id="egg-safety-timer"]');
    const motion = EggStageView.deterministicEggMotion('egg-safety-timer');
    const safetyTimer = timers.find(timer => (
      timer.delay === motion.delayMs + motion.durationMs + 180
    ));
    expect(safetyTimer).toBeDefined();
    expect(timerEgg.classList).toContain('landing');

    safetyTimer.callback();
    expect(timerEgg.classList).not.toContain('landing');
  });

  test('keeps settled motion stable when another egg changes priority', () => {
    const before = EggStageView.buildShelfModel([
      egg('egg-a'),
      egg('egg-b', { state: 'queued', queuePosition: 1 })
    ]);
    const after = EggStageView.buildShelfModel([
      egg('egg-a', { state: 'ready' }),
      egg('egg-b', { state: 'queued', queuePosition: 1 })
    ]);

    const beforeMotion = before.visible.find(item => item.visualId === 'egg-b').motion;
    const afterMotion = after.visible.find(item => item.visualId === 'egg-b').motion;
    expect(afterMotion).toEqual(beforeMotion);
  });

  test('uses responsive visible capacity so countdown chips cannot crowd narrow shelves', () => {
    expect(EggStageView.visibleCapacity(477)).toBeLessThan(8);
    expect(EggStageView.visibleCapacity(1_080)).toBe(8);

    const narrow = EggStageView.buildShelfModel(
      Array.from({ length: 9 }, (_, index) => egg(`egg-${index}`)),
      { maxVisible: EggStageView.visibleCapacity(477) }
    );
    expect(narrow.visible).toHaveLength(EggStageView.visibleCapacity(477));
    expect(narrow.overflow?.label).toBe(`+${9 - narrow.visible.length}`);
  });
});
