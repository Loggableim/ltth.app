'use strict';

const { JSDOM } = require('jsdom');
const EggStageView = require(
  '../plugins/stream-monsters/streammonsters-egg-stage-view'
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
  test('keeps newly landed portrait rail cards at their resting size', () => {
    const document = mountShelf();
    const setTimeout = jest.fn(() => 1);
    const view = EggStageView.createEggStageView({
      document,
      now: () => 2_000,
      isPortraitLayout: () => true,
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout,
      clearTimeout: () => {}
    });

    view.applyEvent('egg_landed', { eggStage: egg('portrait-resting-card') });

    const card = document.querySelector('[data-egg-id="portrait-resting-card"]');
    expect(card.classList).not.toContain('landing');
    expect(setTimeout).not.toHaveBeenCalled();
  });

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

  test('keeps the lower egg rail full while every egg advances one card at a time', () => {
    expect(EggStageView.visibleCapacity(477)).toBe(6);
    expect(EggStageView.visibleCapacity(1_080)).toBe(6);

    const eggs = Array.from({ length: 9 }, (_, index) => egg(`egg-${index}`));
    const first = EggStageView.buildShelfModel(eggs, { maxVisible: 4, rotationIndex: 0 });
    const next = EggStageView.buildShelfModel(eggs, { maxVisible: 4, rotationIndex: 1 });

    expect(first.visible).toHaveLength(4);
    expect(next.visible.map(entry => entry.visualId)).toEqual([
      'egg-1', 'egg-2', 'egg-3', 'egg-4'
    ]);
    expect(first.pageCount).toBe(9);
    expect(next.pageIndex).toBe(1);
    expect(next.overflow).toBeNull();
  });

  test('does not reparent settled portrait cards during countdown renders', () => {
    const document = mountShelf();
    const view = EggStageView.createEggStageView({
      document,
      now: () => 2_000,
      isPortraitLayout: () => true,
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: () => 1,
      clearTimeout: () => {},
      getVisibleCount: () => 4
    });
    const slots = document.querySelector('[data-egg-slots]');

    view.applySnapshot(Array.from({ length: 4 }, (_, index) => egg(`settled-${index}`)));
    const cards = [...slots.children];
    const appendChild = jest.spyOn(slots, 'appendChild');

    view.render();

    expect([...slots.children]).toEqual(cards);
    expect(appendChild).not.toHaveBeenCalled();
  });

  test('renders only the compact countdown in a portrait rail footer', () => {
    const document = mountShelf();
    const view = EggStageView.createEggStageView({
      document,
      now: () => 2_000,
      isPortraitLayout: () => true,
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: () => 1,
      clearTimeout: () => {}
    });

    view.applySnapshot([egg('portrait-public', {
      provenance: 'free',
      ownershipState: 'offered',
      adoptionStatus: 'public',
      adoptable: true,
      state: 'public',
      timing: { landedAtMs: 1_000, expiresAtMs: 62_000 }
    })]);

    expect(document.querySelector('[data-egg-timing]').textContent).toBe(
      EggStageView.formatCountdown(60_000)
    );
  });
});
