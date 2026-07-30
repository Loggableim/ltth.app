const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ArenaDirector = require(
  '../plugins/streamalchemy/streammonsters-arena-director'
);
const ArenaView = require(
  '../plugins/streamalchemy/streammonsters-arena-view'
);

const pluginDir = path.join(
  __dirname,
  '..',
  'plugins',
  'streamalchemy'
);

function fighterMarkup(slot) {
  return `
    <article id="arena-fighter-${slot}" class="arena-fighter" data-slot="${slot}">
      <div class="arena-sprite-wrap">
        <img id="arena-image-${slot}" class="arena-sprite" alt="">
      </div>
      <div id="arena-name-${slot}"></div>
      <div id="arena-owner-${slot}"></div>
      <div id="arena-choice-owner-${slot}"></div>
      <div id="arena-level-${slot}"></div>
      <div id="arena-hp-text-${slot}"></div>
      <div id="arena-hp-${slot}"></div>
      <div id="arena-shield-${slot}"></div>
      <div id="arena-charge-${slot}"></div>
      <span id="arena-shield-label-${slot}"></span>
      <span id="arena-special-label-${slot}"></span>
      <div class="arena-skill-deck" data-skill-deck="${slot}"></div>
    </article>
  `;
}

function mountArena() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.document = dom.window.document;
  document.body.innerHTML = `
    <main id="streammonsters-overlay">
      <section id="battle">
        <div id="arena-round"></div>
        <div id="arena-countdown"></div>
        <div id="arena-skill-prompt"></div>
        <div id="arena-special"></div>
        <div id="arena-impact"></div>
        <div id="arena-combo"></div>
        <div id="arena-feed"></div>
        <div id="arena-lead"></div>
        <div id="arena-element-light"></div>
        <div id="arena-action-card">
          <span id="arena-action-player"></span>
          <span id="arena-action-key"></span>
          <strong id="arena-action-skill"></strong>
          <span id="arena-action-copy"></span>
          <span id="arena-action-metrics"></span>
        </div>
        ${fighterMarkup(1)}
        ${fighterMarkup(2)}
      </section>
    </main>
  `;
  return dom;
}

const poisonedStyles = Object.freeze({
  opacity: '0.17',
  filter: 'blur(8px)',
  mask: 'linear-gradient(#000, transparent)',
  'mask-image': 'linear-gradient(#000, transparent)',
  '-webkit-mask-image': 'linear-gradient(#000, transparent)',
  animation: 'stale-fade 20s infinite',
  'animation-name': 'stale-fade',
  visibility: 'hidden',
  transform: 'scale(.2)',
  'mix-blend-mode': 'multiply',
  'clip-path': 'circle(10%)',
  'will-change': 'opacity, transform'
});

function poisonVisual(element) {
  const animation = { cancel: jest.fn() };
  for (const [property, value] of Object.entries(poisonedStyles)) {
    element.style.setProperty(property, value);
  }
  Object.defineProperty(element, 'getAnimations', {
    configurable: true,
    value: jest.fn(() => [animation])
  });
  return animation;
}

function expectVisualReset(element, animation) {
  expect(element.getAnimations).toHaveBeenCalledTimes(1);
  expect(animation.cancel).toHaveBeenCalledTimes(1);
  for (const property of Object.keys(poisonedStyles)) {
    expect(element.style.getPropertyValue(property)).toBe('');
  }
}

function fighters() {
  return [
    {
      slot: 1,
      name: 'Ashfang',
      viewerName: '@pupcid',
      templateId: 'ashfang',
      element: 'Ember',
      hp: 30,
      maxHp: 30,
      shield: 0,
      charge: 25
    },
    {
      slot: 2,
      name: 'Ripple',
      viewerName: '@mark',
      templateId: 'ripple',
      element: 'Tide',
      hp: 28,
      maxHp: 30,
      shield: 2,
      charge: 50
    }
  ];
}

describe('Stream Monsters fighter visibility and arcade pacing regressions', () => {
  test('authoritative same-match reconnect clears visual poison without resetting event dedupe', async () => {
    mountArena();
    const view = ArenaView.createArenaView({
      document,
      clock: { now: () => 1_000, wait: async () => {} }
    });
    view.applyMatch({
      matchId: 'same-match',
      state: 'action',
      roundNumber: 2,
      actionDeadlineMs: null,
      fighters: fighters()
    });
    const acceptedAction = {
      matchId: 'same-match',
      eventId: 'same-match:event:7',
      eventSequence: 7,
      rulesVersion: 8,
      round: 2,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'A',
      skill: { name: 'Flame Fang', type: 'attack', element: 'Ember' },
      hits: [{ index: 1, hpDamage: 4, shieldAbsorbed: 0, evaded: false }],
      outcomes: [],
      actorState: fighters()[0],
      targetState: { ...fighters()[1], hp: 24 },
      terminal: false
    };
    expect(await view.playAction(acceptedAction)).toBe(true);
    const layers = [1, 2].flatMap(slot => {
      const root = document.getElementById(`arena-fighter-${slot}`);
      root.classList.add(
        'telegraphing',
        'advancing',
        'hit',
        'shielding',
        'evaded',
        'knockout',
        'winner',
        'defeated'
      );
      return [
        root,
        root.querySelector('.arena-sprite-wrap'),
        document.getElementById(`arena-image-${slot}`)
      ];
    });
    const animations = layers.map(poisonVisual);

    view.applySnapshot({
      battle: {
        matches: [{
          matchId: 'same-match',
          state: 'action',
          roundNumber: 2,
          actionDeadlineMs: null,
          fighters: fighters()
        }]
      }
    });

    layers.forEach((element, index) => expectVisualReset(element, animations[index]));
    for (const slot of [1, 2]) {
      const fighter = document.getElementById(`arena-fighter-${slot}`);
      for (const className of [
        'telegraphing',
        'advancing',
        'hit',
        'shielding',
        'evaded',
        'knockout',
        'winner',
        'defeated'
      ]) {
        expect(fighter.classList).not.toContain(className);
      }
      expect(document.getElementById(`arena-image-${slot}`).src).toMatch(/\.webp$/);
    }
    expect(await view.playAction(acceptedAction)).toBe(false);
  });

  test('a new action cancels visual residue before its deterministic timeline starts', async () => {
    mountArena();
    const view = ArenaView.createArenaView({
      document,
      clock: { now: () => 1_000, wait: async () => {} }
    });
    view.applyMatch({
      matchId: 'next-action',
      state: 'action',
      roundNumber: 3,
      actionDeadlineMs: null,
      fighters: fighters()
    });
    const root = document.getElementById('arena-fighter-1');
    const wrap = root.querySelector('.arena-sprite-wrap');
    const image = document.getElementById('arena-image-1');
    const layers = [root, wrap, image];
    const animations = layers.map(poisonVisual);
    root.classList.add('defeated', 'knockout');

    await view.playAction({
      matchId: 'next-action',
      eventId: 'next-action:event:1',
      eventSequence: 1,
      rulesVersion: 8,
      round: 3,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'A',
      skill: { name: 'Flame Fang', type: 'attack', element: 'Ember' },
      hits: [{ index: 1, hpDamage: 4, shieldAbsorbed: 0, evaded: false }],
      outcomes: [],
      actorState: fighters()[0],
      targetState: { ...fighters()[1], hp: 24 },
      terminal: false
    });

    layers.forEach((element, index) => expectVisualReset(element, animations[index]));
    expect(root.classList).not.toContain('defeated');
    expect(root.classList).not.toContain('knockout');
  });

  test('an ordinary same-match state update never resets a fighter between action beats', async () => {
    mountArena();
    let releaseAction;
    const wait = jest.fn(async () => {});
    wait
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(() => new Promise(resolve => {
        releaseAction = resolve;
      }));
    const view = ArenaView.createArenaView({
      document,
      clock: { now: () => 1_000, wait }
    });
    const match = {
      matchId: 'live-action',
      state: 'action',
      roundNumber: 4,
      actionDeadlineMs: null,
      fighters: fighters()
    };
    view.applyMatch(match);
    const playback = view.playAction({
      matchId: 'live-action',
      eventId: 'live-action:event:8',
      eventSequence: 8,
      rulesVersion: 8,
      round: 4,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'A',
      skill: { name: 'Flame Fang', type: 'attack', element: 'Ember' },
      hits: [{ index: 1, hpDamage: 4, shieldAbsorbed: 0, evaded: false }],
      outcomes: [],
      actorState: fighters()[0],
      targetState: { ...fighters()[1], hp: 24 },
      terminal: false
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(wait).toHaveBeenCalledTimes(2);

    const fighter = document.getElementById('arena-fighter-1');
    const animation = poisonVisual(fighter);
    view.applyMatch(match);

    expect(fighter.getAnimations).not.toHaveBeenCalled();
    expect(animation.cancel).not.toHaveBeenCalled();
    expect(fighter.style.opacity).toBe('0.17');

    releaseAction();
    await playback;
  });

  test('K.O. and defeated fighter poses stay fully opaque in the shipped overlay', () => {
    const html = fs.readFileSync(
      path.join(pluginDir, 'streammonsters-overlay.html'),
      'utf8'
    );
    const dom = new JSDOM(html);
    const fighter = dom.window.document.getElementById('arena-fighter-1');

    fighter.classList.add('knockout');
    expect(dom.window.getComputedStyle(fighter).opacity).toBe('1');
    expect(dom.window.getComputedStyle(fighter).filter).toMatch(/brightness|grayscale/);

    fighter.classList.remove('knockout');
    fighter.classList.add('defeated');
    expect(dom.window.getComputedStyle(fighter).opacity).toBe('1');
    expect(dom.window.getComputedStyle(fighter).filter).toMatch(/brightness|grayscale/);
  });

  test.each([
    [{ templateId: 'ashfang', element: 'Ember', evolutionStage: 1 }, 'furry/ashfang.webp'],
    [
      { templateId: 'ashfang', element: 'Ember', evolutionStage: 2 },
      'furry/evolution/ember/ashfang-stage2.webp'
    ],
    [
      { templateId: 'ashfang', element: 'Ember', evolutionStage: 3 },
      'furry/evolution/ember/ashfang-stage3.webp'
    ]
  ])('canonical fighter fallback resolves to a packaged WebP asset', (fighter, suffix) => {
    const assetUrl = ArenaDirector.canonicalImageUrl(fighter);
    const relativePath = assetUrl.replace('/plugins/streamalchemy/', '');

    expect(assetUrl).toBe(`/plugins/streamalchemy/assets/streammonsters/${suffix}`);
    expect(fs.existsSync(path.join(pluginDir, relativePath))).toBe(true);
  });
});
