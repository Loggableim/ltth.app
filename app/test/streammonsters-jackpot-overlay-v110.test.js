'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');
const loadShelf = () => require('../plugins/streamalchemy/streammonsters-egg-stage-view');

function egg(visualId, overrides = {}) {
  return {
    visualId,
    provenance: 'gift',
    element: 'Ember',
    variant: 'standard',
    state: 'incubating',
    displayName: 'Viewer',
    imageUrl: '/plugins/streamalchemy/assets/streammonsters/eggs/ember-standard.png',
    timing: { landedAtMs: 1_000, readyAtMs: 5_000, expiresAtMs: 50_000 },
    adoptionStatus: 'owned',
    adoptable: false,
    ...overrides
  };
}

describe('Stream Monsters 1.10 living egg shelf', () => {
  test('prioritizes public free offers, ready eggs, then incubating eggs in a stable 8 +N shelf', () => {
    const Shelf = loadShelf();
    const eggs = [
      ...Array.from({ length: 7 }, (_, index) => egg(`incubating-${index}`)),
      egg('ready-a', { state: 'ready' }),
      egg('public-a', {
        provenance: 'free',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true
      }),
      egg('ready-b', { state: 'ready' }),
      egg('public-b', {
        provenance: 'free',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true
      })
    ];

    const first = Shelf.buildShelfModel(eggs, { maxVisible: 8, rotationIndex: 0 });
    const rotated = Shelf.buildShelfModel(eggs, { maxVisible: 8, rotationIndex: 1 });

    expect(first.visible.map(entry => entry.visualId).slice(0, 4)).toEqual([
      'public-a',
      'public-b',
      'ready-a',
      'ready-b'
    ]);
    expect(first.visible).toHaveLength(8);
    expect(first.overflow).toEqual(expect.objectContaining({
      count: 3,
      label: '+3',
      preview: expect.objectContaining({ visualId: 'incubating-4' })
    }));
    expect(rotated.overflow.preview.visualId).toBe('incubating-5');
    expect(Shelf.buildShelfModel(eggs, { maxVisible: 8, rotationIndex: 0 })).toEqual(first);
    expect(first.visible[0].motion).toEqual(
      Shelf.deterministicEggMotion('public-a', 0)
    );
  });

  test('keeps public free eggs visible through the persistent portrait focus instead of a transient card callout', () => {
    const Shelf = loadShelf();
    const dom = new JSDOM(`
      <section id="egg-shelf"><div data-egg-slots></div><div data-egg-overflow></div></section>
    `);
    const view = Shelf.createEggStageView({
      document: dom.window.document,
      now: () => 10_000,
      labels: {
        eggFocusOpenOwner: 'Open to eligible viewers',
        eggFocusPublic: 'Free egg · {time} · {command}'
      }
    });
    view.applySnapshot([
      egg('gift-owned'),
      egg('free-public', {
        provenance: 'free',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true
      })
    ]);

    const free = dom.window.document.querySelector('[data-egg-id="free-public"]');
    const gift = dom.window.document.querySelector('[data-egg-id="gift-owned"]');
    const focus = dom.window.document.querySelector('[data-egg-focus]');
    expect(free.dataset.adoptable).toBe('true');
    expect(free.classList.contains('gold-ring')).toBe(true);
    expect(free.querySelector('[data-adopt-callout]')).toBeNull();
    expect(focus.hidden).toBe(false);
    expect(focus.dataset.eggId).toBe('free-public');
    expect(focus.dataset.adoptable).toBe('true');
    expect(focus.querySelector('[data-egg-focus-owner]').textContent)
      .toBe('Open to eligible viewers');
    expect(focus.querySelector('[data-egg-focus-state]').textContent)
      .toBe('Free egg · 00:40 · !adopt');
    expect(gift.dataset.adoptable).toBe('false');
    expect(gift.classList.contains('gold-ring')).toBe(false);
    expect(gift.querySelector('[data-adopt-callout]')).toBeNull();

    view.applyEvent('free_egg_claimed', {
      eggStage: egg('free-public', {
        provenance: 'free',
        state: 'incubating',
        adoptionStatus: 'owned',
        adoptable: false
      }),
      removedEggStage: { visualId: 'free-public' }
    });
    expect(dom.window.document.querySelector('[data-egg-id="free-public"]')).toBeNull();
  });

  test('refreshes exact countdown, queue, ready and free-offer status without replaying landing', () => {
    const Shelf = loadShelf();
    const dom = new JSDOM(`
      <section id="egg-shelf"><div data-egg-slots></div><div data-egg-overflow></div></section>
    `);
    let now = 1_000;
    const intervals = [];
    const view = Shelf.createEggStageView({
      document: dom.window.document,
      now: () => now,
      setInterval: (callback, milliseconds) => {
        intervals.push({ callback, milliseconds });
        return intervals.length;
      },
      clearInterval: () => {},
      labels: {
        incubating: 'Schlüpft in {time}',
        queued: 'Warteschlange #{position}',
        ready: 'Bereit · {command}',
        expired: 'Verrottet',
        reserved: 'Reserviert · {time}',
        public: 'Gratis · {time}'
      },
      getHatchReference: () => '!schlupf',
      getAdoptReference: () => '!adoptieren'
    });

    view.applySnapshot([
      egg('owned-incubating'),
      egg('owned-queued', {
        state: 'queued',
        queuePosition: 2,
        timing: { landedAtMs: 1_000 }
      }),
      egg('owned-ready', { state: 'ready' }),
      egg('owned-expired', { state: 'expired' }),
      egg('free-reserved', {
        provenance: 'free',
        state: 'reserved',
        adoptionStatus: 'reserved',
        timing: { landedAtMs: 1_000, publicAtMs: 61_000 }
      }),
      egg('free-public', {
        provenance: 'free',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true
      })
    ]);

    const item = id => dom.window.document.querySelector(`[data-egg-id="${id}"]`);
    const label = id => item(id)?.querySelector('[data-egg-timing]')?.textContent;
    expect(label('owned-incubating')).toBe('Schlüpft in 00:04');
    expect(label('owned-queued')).toBe('Warteschlange #2');
    expect(label('owned-ready')).toBe('Bereit · !schlupf');
    expect(item('owned-expired')).toBeNull();
    expect(label('free-reserved')).toBe('Reserviert · 01:00');
    expect(label('free-public')).toBe('Gratis · 00:49');
    expect(item('owned-incubating').classList.contains('landing')).toBe(false);

    view.applyEvent('egg_landed', { eggStage: egg('fresh-landing') });
    expect(item('fresh-landing').classList.contains('landing')).toBe(true);
    now = 2_000;
    intervals.find(entry => entry.milliseconds === 1_000).callback();
    expect(label('owned-incubating')).toBe('Schlüpft in 00:03');
    const landingEnd = new dom.window.Event('animationend');
    Object.defineProperty(landingEnd, 'animationName', {
      configurable: true,
      value: 'egg-shelf-land'
    });
    item('fresh-landing').dispatchEvent(landingEnd);
    expect(item('fresh-landing').classList.contains('landing')).toBe(false);

    view.applySnapshot(view.model().visible);
    expect(item('fresh-landing').classList.contains('landing')).toBe(false);
    view.destroy();
  });

  test('plays the shelf landing animation only once per egg id', () => {
    const Shelf = loadShelf();
    const dom = new JSDOM(`
      <section id="egg-shelf"><div data-egg-slots></div><div data-egg-overflow></div></section>
    `);
    const view = Shelf.createEggStageView({
      document: dom.window.document
    });

    view.applySnapshot([egg('existing-egg')]);
    expect(dom.window.document.querySelector('[data-egg-id="existing-egg"]')
      .classList.contains('landing')).toBe(false);

    view.applyEvent('egg_landed', {
      eggStage: egg('stable-egg')
    });
    expect(dom.window.document.querySelector('[data-egg-id="stable-egg"]')
      .classList.contains('landing')).toBe(true);

    view.applyEvent('egg_landed', {
      eggStage: egg('stable-egg', { state: 'ready' })
    });
    expect(dom.window.document.querySelector('[data-egg-id="stable-egg"]')
      .classList.contains('landing')).toBe(false);

    view.rotateOverflow();
    expect(dom.window.document.querySelector('[data-egg-id="stable-egg"]')
      .classList.contains('landing')).toBe(false);
    view.destroy();
  });

  test('removes an expired egg from the rendered shelf while preserving the authoritative stage model', () => {
    const Shelf = loadShelf();
    const dom = new JSDOM(`
      <section id="egg-shelf"><div data-egg-slots></div><div data-egg-overflow></div></section>
    `);
    const view = Shelf.createEggStageView({
      document: dom.window.document,
      labels: { expired: 'Rotten' }
    });
    view.applySnapshot([egg('rotten-live', { state: 'ready' })]);

    view.applyEvent('egg_stage_updated', {
      eggStage: egg('rotten-live', { state: 'expired' })
    });

    const item = dom.window.document.querySelector('[data-egg-id="rotten-live"]');
    expect(item).toBeNull();
    expect(view.model().visible).toEqual([]);
    view.destroy();
  });

  test('builds compact adoption notices only for reserved and public free eggs', () => {
    const Shelf = loadShelf();
    expect(Shelf.buildAdoptionNotice('free_egg_reserved', {
      eggStage: egg('reserved-free', {
        provenance: 'free',
        state: 'reserved',
        adoptionStatus: 'reserved',
        displayName: '@viewer_one'
      })
    })).toEqual({
      kind: 'reserved',
      viewer: '@viewer_one',
      placement: 'upper-third',
      size: 'compact',
      durationMs: 5_000
    });
    expect(Shelf.buildAdoptionNotice('free_egg_public', {
      eggStage: egg('public-free', {
        provenance: 'free',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true
      })
    })).toEqual({
      kind: 'public',
      viewer: 'Viewer',
      placement: 'upper-third',
      size: 'compact',
      durationMs: 5_000
    });
    expect(Shelf.buildAdoptionNotice('egg_landed', {
      eggStage: egg('gift-owned')
    })).toBeNull();
  });

  test('keeps deterministic fly, bounce, collision and settle metadata under reduced motion', () => {
    const Shelf = loadShelf();
    const motion = Shelf.deterministicEggMotion('egg-abc', 4);
    expect(motion).toEqual(expect.objectContaining({
      phase: 'settled',
      lane: expect.any(Number),
      flyFromX: expect.any(Number),
      bounceHeight: expect.any(Number),
      settleRotation: expect.any(Number)
    }));
    expect(motion.lane).toBeGreaterThanOrEqual(0);
    expect(motion.lane).toBeLessThan(4);

    const reduced = Shelf.buildShelfModel([egg('egg-abc')], {
      reducedMotion: true
    });
    expect(reduced.visible[0].motion.durationMs).toBe(0);
    expect(reduced.visible[0].motion.phase).toBe('settled');
  });

  test('keeps the gold ring on an overflowing public egg without rendering a per-egg callout', () => {
    const Shelf = loadShelf();
    const dom = new JSDOM(`
      <section id="egg-shelf"><div data-egg-slots></div><div data-egg-overflow></div></section>
    `);
    const view = Shelf.createEggStageView({
      document: dom.window.document,
      now: () => 20_000
    });
    view.applySnapshot(Array.from({ length: 9 }, (_, index) => egg(`public-${index}`, {
      provenance: 'free',
      state: 'public',
      adoptionStatus: 'public',
      adoptable: true
    })));
    const overflow = dom.window.document.querySelector('[data-egg-overflow]');

    expect(overflow.querySelector('[data-adopt-callout]')).toBeNull();
    expect(overflow.querySelector('.gold-ring')).not.toBeNull();
    expect(overflow.querySelector('.gold-ring')).not.toBeNull();
    view.destroy();
  });
});

describe('Stream Monsters 1.10 overlay and creator surfaces', () => {
  const overlayHtml = fs.readFileSync(
    path.join(pluginDir, 'streammonsters-overlay.html'),
    'utf8'
  );
  const creatorHtml = fs.readFileSync(
    path.join(pluginDir, 'streammonsters-ui.html'),
    'utf8'
  );
  const overlay = new JSDOM(overlayHtml).window.document;
  const creator = new JSDOM(creatorHtml).window.document;

  test('mounts the shelf on the 74 percent gameplay boundary without entering chat space', () => {
    const shelf = overlay.getElementById('egg-shelf');
    expect(shelf).not.toBeNull();
    expect(shelf.dataset.gameplayBoundary).toBe('74');
    expect(shelf.querySelector('[data-egg-slots]')).not.toBeNull();
    expect(shelf.querySelector('[data-egg-overflow]')).not.toBeNull();
    expect(overlayHtml).toContain('streammonsters-egg-stage-view.js');
    expect(overlayHtml).toContain(
      "'streammonsters:free_egg_reserved':'free_egg_reserved'"
    );
    expect(overlayHtml).toContain('buildAdoptionNotice(type, data)');
    expect(overlayHtml).toContain("if (data?.kind === 'adopt') return;");
  });

  test('exposes Jackpot combo and element-lighting surfaces beside full-monster HUDs', () => {
    expect(overlay.getElementById('arena-combo')).not.toBeNull();
    expect(overlay.getElementById('arena-element-light')).not.toBeNull();
    for (const slot of [1, 2]) {
      expect(overlay.getElementById(`arena-image-${slot}`).classList).toContain('arena-sprite');
      expect(overlay.getElementById(`arena-hp-${slot}`)).not.toBeNull();
      expect(overlay.getElementById(`arena-shield-${slot}`)).not.toBeNull();
      expect(overlay.getElementById(`arena-charge-${slot}`)).not.toBeNull();
      expect(overlay.querySelector(`[data-skill-deck="${slot}"]`)).not.toBeNull();
    }
  });

  test('offers creator shelf previews and live shelf, renderer, match, GCCE and alias diagnostics', () => {
    expect(creator.getElementById('creatorEggShelfPreview')).not.toBeNull();
    expect(creator.getElementById('liveEggShelf')).not.toBeNull();
    expect(creator.getElementById('liveRenderer')).not.toBeNull();
    expect(creator.getElementById('liveBattlePhase')).not.toBeNull();
    expect(creator.getElementById('liveGcce')).not.toBeNull();
    expect(creator.getElementById('aliasConflictStatus')).not.toBeNull();
    expect(creator.getElementById('elementalHourExplanation')).not.toBeNull();
  });
});
