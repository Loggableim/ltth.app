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
