'use strict';

const { JSDOM } = require('jsdom');
const EggStageView = require(
  '../plugins/streamalchemy/streammonsters-egg-stage-view'
);

function egg(visualId, overrides = {}) {
  return {
    visualId,
    displayName: `@${visualId}`,
    element: 'Lunar',
    variant: 'standard',
    provenance: 'gift',
    ownershipState: 'owned',
    state: 'incubating',
    timing: { readyAtMs: 61_000, landedAtMs: 1_000 },
    ...overrides
  };
}

describe('Stream Monsters 1.11 portrait Smart Egg Focus', () => {
  test('alternates a public adoption egg with ready and incubating eggs', () => {
    const stage = [
      egg('ready', { state: 'ready' }),
      egg('incubating'),
      egg('queued', { state: 'queued', queuePosition: 2 }),
      egg('free-public', {
        provenance: 'free',
        ownershipState: 'unowned',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true
      })
    ];

    expect(EggStageView.buildPortraitFocusModel(stage, { rotationIndex: 0 }))
      .toEqual(expect.objectContaining({
        focus: expect.objectContaining({ visualId: 'free-public' }),
        total: 4
      }));
    expect(EggStageView.buildPortraitFocusModel(stage, { rotationIndex: 1 }))
      .toEqual(expect.objectContaining({
        focus: expect.objectContaining({ visualId: 'ready' })
      }));
    expect(EggStageView.buildPortraitFocusModel(stage, { rotationIndex: 2 }))
      .toEqual(expect.objectContaining({
        focus: expect.objectContaining({ visualId: 'free-public' })
      }));
    expect(EggStageView.buildPortraitFocusModel(stage, { rotationIndex: 3 }))
      .toEqual(expect.objectContaining({
        focus: expect.objectContaining({ visualId: 'incubating' })
      }));
  });

  test('alternates a reserved free egg with active owned eggs on every second turn', () => {
    const stage = [
      egg('ready', { state: 'ready' }),
      egg('reserved-free', {
        provenance: 'free',
        ownershipState: 'unowned',
        state: 'reserved',
        adoptionStatus: 'reserved',
        timing: { publicAtMs: 61_000, landedAtMs: 1_000 }
      })
    ];

    expect([0, 1, 2, 3].map(rotationIndex => (
      EggStageView.buildPortraitFocusModel(stage, { rotationIndex }).focus.visualId
    ))).toEqual(['reserved-free', 'ready', 'reserved-free', 'ready']);
  });

  test('omits claimed and expired eggs while keeping the landscape multi-egg shelf', () => {
    const stage = [
      egg('ready', { state: 'ready' }),
      egg('incubating'),
      egg('expired', { state: 'expired' }),
      egg('claimed-free', {
        provenance: 'free',
        ownershipState: 'owned',
        state: 'incubating'
      })
    ];

    expect(EggStageView.buildPortraitFocusModel(stage, { rotationIndex: 1 }))
      .toEqual(expect.objectContaining({
        total: 2,
        focus: expect.objectContaining({ visualId: 'ready' })
      }));
    expect(EggStageView.buildShelfModel(stage, { maxVisible: 8 })).toEqual(
      expect.objectContaining({
        total: 2,
        visible: expect.arrayContaining([
          expect.objectContaining({ visualId: 'ready' }),
          expect.objectContaining({ visualId: 'incubating' })
        ])
      })
    );
  });

  test('updates one keyed focus card on timer ticks without replaying landing', () => {
    const dom = new JSDOM(`
      <section id="egg-shelf">
        <div data-egg-slots></div>
        <div data-egg-overflow></div>
        <article data-egg-focus hidden></article>
      </section>
    `);
    let now = 1_000;
    const view = EggStageView.createEggStageView({
      document: dom.window.document,
      now: () => now,
      labels: {
        eggFocusOwner: 'Owner: {owner}',
        eggFocusPosition: '{position} / {total}',
        eggFocusReady: 'Ready · {command}',
        eggFocusIncubating: 'Hatches in {time}'
      },
      getHatchReference: () => '!hatch'
    });

    view.applySnapshot([egg('ready', { state: 'ready' })]);
    const focus = dom.window.document.querySelector('[data-egg-focus]');
    expect(focus.dataset.eggId).toBe('ready');
    expect(focus.querySelector('[data-egg-focus-owner]').textContent)
      .toBe('Owner: @ready');
    expect(focus.querySelector('[data-egg-focus-state]').textContent)
      .toBe('Ready · !hatch');
    expect(focus.querySelector('[data-egg-focus-position]').textContent)
      .toBe('1 / 1');

    now += 1_000;
    view.render();
    expect(dom.window.document.querySelector('[data-egg-focus]')).toBe(focus);
    expect(focus.classList.contains('landing')).toBe(false);
    view.destroy();
  });

  test('renders localized free and reserved state lines with timer and adopt command', () => {
    const dom = new JSDOM(`
      <section id="egg-shelf"><article data-egg-focus hidden></article></section>
    `);
    const view = EggStageView.createEggStageView({
      document: dom.window.document,
      now: () => 1_000,
      labels: {
        eggFocusOwner: 'Besitzer: {owner}',
        eggFocusOpenOwner: 'Öffentlich · nur berechtigte Viewer',
        eggFocusPosition: '{position} / {total}',
        eggFocusPublic: 'Gratis-Ei · {time} · {command}',
        eggFocusReserved: 'Reserviert · {time} · {command}'
      },
      getAdoptReference: () => '!adoptieren'
    });
    const focus = dom.window.document.querySelector('[data-egg-focus]');

    view.applySnapshot([egg('public', {
      provenance: 'free',
      ownershipState: 'unowned',
      state: 'public',
      adoptionStatus: 'public',
      adoptable: true,
      timing: { expiresAtMs: 61_000, landedAtMs: 1_000 }
    })]);
    expect(focus.querySelector('[data-egg-focus-owner]').textContent)
      .toBe('Öffentlich · nur berechtigte Viewer');
    expect(focus.querySelector('[data-egg-focus-state]').textContent)
      .toBe('Gratis-Ei · 01:00 · !adoptieren');

    view.applySnapshot([egg('reserved', {
      displayName: '@Mira',
      provenance: 'free',
      ownershipState: 'unowned',
      state: 'reserved',
      adoptionStatus: 'reserved',
      timing: { publicAtMs: 61_000, landedAtMs: 1_000 }
    })]);
    expect(focus.querySelector('[data-egg-focus-owner]').textContent)
      .toBe('Besitzer: @Mira');
    expect(focus.querySelector('[data-egg-focus-state]').textContent)
      .toBe('Reserviert · 01:00 · !adoptieren');
    view.destroy();
  });

  test('replaces a focus fallback with its sanitized egg art', () => {
    const dom = new JSDOM(`
      <section id="egg-shelf"><article data-egg-focus hidden></article></section>
    `);
    const view = EggStageView.createEggStageView({ document: dom.window.document });
    view.applySnapshot([egg('art', { state: 'ready' })]);
    view.applyEvent('egg_stage_updated', {
      eggStage: egg('art', {
        state: 'ready',
        imageUrl: '/plugins/streamalchemy/assets/eggs/lunar.png'
      })
    });

    const art = dom.window.document.querySelector('[data-egg-focus-art]');
    expect(art.children).toHaveLength(1);
    expect(art.querySelector('img')?.getAttribute('src'))
      .toBe('/plugins/streamalchemy/assets/eggs/lunar.png');
    expect(art.textContent).toBe('');
    view.destroy();
  });

  test.each([
    'https://example.test/egg.png',
    '//example.test/egg.png',
    'data:image/png;base64,AAAA',
    '/plugins/streamalchemy/assets/../../private.png'
  ])('keeps an unsafe focus image URL on the emoji fallback: %s', imageUrl => {
    const dom = new JSDOM(`
      <section id="egg-shelf"><article data-egg-focus hidden></article></section>
    `);
    const view = EggStageView.createEggStageView({ document: dom.window.document });
    view.applySnapshot([egg('unsafe', { state: 'ready', imageUrl })]);

    const art = dom.window.document.querySelector('[data-egg-focus-art]');
    expect(art.dataset.fallback).toBe('true');
    expect(art.querySelector('img')).toBeNull();
    expect(art.textContent).toBe('🥚');
    view.destroy();
  });
});
