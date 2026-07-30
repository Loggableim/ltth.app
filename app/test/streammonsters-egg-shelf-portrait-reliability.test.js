'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const EggStageView = require(
  '../plugins/streamalchemy/streammonsters-egg-stage-view'
);
const ChatView = require(
  '../plugins/streamalchemy/streammonsters-chat-view'
);

const overlayPath = path.join(
  process.cwd(),
  'plugins',
  'streamalchemy',
  'streammonsters-overlay.html'
);

function egg(visualId, overrides = {}) {
  return {
    visualId,
    displayName: `Viewer ${visualId}`,
    element: 'Lunar',
    variant: 'standard',
    provenance: 'gift',
    ownershipState: 'shared',
    state: 'incubating',
    queuePosition: 0,
    timing: {
      landedAtMs: 1_000,
      readyAtMs: 600_000
    },
    ...overrides
  };
}

function shelfFixture({ nowMs = 10_000, width = 477 } = {}) {
  const dom = new JSDOM(`
    <section id="egg-shelf">
      <div data-egg-slots></div>
      <div data-egg-overflow hidden></div>
      <div data-egg-adopt-summary hidden></div>
    </section>
  `);
  let currentNowMs = nowMs;
  const intervals = new Map();
  const view = EggStageView.createEggStageView({
    document: dom.window.document,
    viewportWidth: () => width,
    now: () => currentNowMs,
    labels: {
      incubating: 'Hatches {time}',
      queued: 'Queue #{position}',
      ready: 'Ready {command}',
      reserved: 'Reserved {time}',
      public: 'Free {time}',
      adoptSummary: '{count} free · {command}',
      eggCardOwner: 'Owner: {owner}',
      eggCardElement: 'Element: {element}',
      eggCardOwned: 'OWNED',
      eggCardIncubating: 'INCUBATING',
      eggCardQueued: 'QUEUED #{position}',
      eggCardReady: 'READY · {command}',
      eggCardReserved: 'RESERVED FOR {owner} · {command}',
      eggCardPublic: 'ADOPT NOW · {command}',
      eggCardRescuePublic: 'GRACE · ADOPT NOW · {command}',
      eggCardRotTimer: 'ROT IN {time}',
      eggCardTimer: '{time}',
      eggCardTimerUnavailable: '--:--',
      eggCardAria: '{owner} · {element} · {status} · {timer}',
      eggFocusOwner: 'Owner: {owner}',
      eggFocusOpenOwner: 'Public · eligible viewers only',
      eggFocusPosition: '{position} / {total}'
    },
    getElementName: element => ({
      Ember: 'Fire',
      Tide: 'Water',
      Grove: 'Nature',
      Gale: 'Air',
      Volt: 'Lightning',
      Lunar: 'Moon'
    }[element] || element),
    getHatchReference: () => '!hatch',
    getAdoptReference: () => '!adopt',
    setTimeout: jest.fn(() => 1),
    clearTimeout: jest.fn(),
    setInterval: jest.fn((callback, milliseconds) => {
      intervals.set(milliseconds, callback);
      return milliseconds;
    }),
    clearInterval: jest.fn()
  });
  return {
    dom,
    view,
    intervals,
    setNow: value => {
      currentNowMs = value;
    }
  };
}

function styleRules(document) {
  const collected = [];
  const visit = (rules, media = '') => {
    for (const rule of Array.from(rules || [])) {
      if (rule.selectorText) {
        collected.push({
          media,
          selector: rule.selectorText,
          style: rule.style
        });
      } else if (rule.cssRules) {
        visit(rule.cssRules, rule.conditionText || rule.media?.mediaText || media);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules);
  return collected;
}

describe('Stream Monsters portrait egg shelf reliability', () => {
  test('renders safe identity, localized element, explicit state, large timer, and accessible names', () => {
    const { dom, view } = shelfFixture({ width: 1_920 });
    view.applySnapshot([
      egg('gift', {
        displayName: '\u0000Alice',
        element: 'Tide',
        ownershipState: 'owned'
      }),
      egg('reserved', {
        displayName: '@Mira',
        element: 'Ember',
        provenance: 'free',
        ownershipState: 'offered',
        state: 'reserved',
        adoptionStatus: 'reserved',
        adoptable: false,
        timing: { landedAtMs: 1_000, publicAtMs: 70_000 }
      }),
      egg('public', {
        displayName: 'Community',
        element: 'Grove',
        provenance: 'free',
        ownershipState: 'offered',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true,
        timing: { landedAtMs: 1_000, expiresAtMs: 80_000 }
      }),
      egg('rescue', {
        displayName: 'Original Owner',
        element: 'Gale',
        rescueId: 'rescue-offer',
        ownershipState: 'offered',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true,
        timing: { landedAtMs: 1_000, expiresAtMs: 90_000 }
      }),
      egg('ready', {
        displayName: 'Ready Owner',
        element: 'Volt',
        ownershipState: 'owned',
        state: 'ready',
        timing: { landedAtMs: 1_000, expiresAtMs: 100_000 }
      }),
      egg('queued', {
        displayName: 'Queue Owner',
        element: 'Lunar',
        ownershipState: 'owned',
        state: 'queued',
        queuePosition: 3,
        timing: { landedAtMs: 1_000, readyAtMs: null }
      })
    ]);

    const card = id => dom.window.document.querySelector(`[data-egg-id="${id}"]`);
    for (const id of ['gift', 'reserved', 'public', 'rescue', 'ready', 'queued']) {
      expect(card(id).querySelector('[data-egg-owner]').textContent).not.toBe('');
      expect(card(id).querySelector('[data-egg-element]').textContent).not.toBe('');
      expect(card(id).querySelector('[data-egg-status]').textContent).not.toBe('');
      expect(card(id).querySelector('[data-egg-timer]').textContent).toMatch(
        /(?:\d{2}:\d{2}|--:--)$/
      );
      expect(card(id).getAttribute('aria-label')).not.toContain(id);
      expect(card(id).getAttribute('aria-label')).toContain(
        card(id).querySelector('[data-egg-owner]').textContent.replace('Owner: ', '')
      );
    }

    expect(card('gift').textContent).toContain('Owner: Alice');
    expect(card('gift').textContent).toContain('Element: Water');
    expect(card('gift').textContent).toContain('OWNED');
    expect(card('gift').textContent).toContain('INCUBATING');
    expect(card('reserved').textContent)
      .toContain('RESERVED FOR @Mira · !adopt');
    expect(card('public').textContent).toContain('ADOPT NOW · !adopt');
    expect(card('rescue').textContent)
      .toContain('GRACE · ADOPT NOW · !adopt');
    expect(card('ready').textContent).toContain('READY · !hatch');
    expect(card('ready').textContent).toContain('ROT IN 01:30');
    expect(card('queued').textContent).toContain('QUEUED #3');
    expect(card('queued').textContent).not.toContain('!hatch');
    view.destroy();
    dom.window.close();
  });

  test('counts each card down to the deadline that belongs to its current state', () => {
    const { dom, view } = shelfFixture({ width: 1_920 });
    view.applySnapshot([
      egg('incubating-deadlines', {
        state: 'incubating',
        timing: {
          landedAtMs: 1_000,
          readyAtMs: 70_000,
          expiresAtMs: 130_000
        }
      }),
      egg('ready-deadlines', {
        state: 'ready',
        timing: {
          landedAtMs: 1_000,
          readyAtMs: 5_000,
          expiresAtMs: 100_000
        }
      }),
      egg('public-deadlines', {
        provenance: 'free',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true,
        timing: {
          landedAtMs: 1_000,
          publicAtMs: 5_000,
          expiresAtMs: 80_000
        }
      }),
      egg('reserved-deadlines', {
        provenance: 'free',
        state: 'reserved',
        adoptionStatus: 'reserved',
        adoptable: false,
        timing: {
          landedAtMs: 1_000,
          publicAtMs: 40_000,
          expiresAtMs: 80_000
        }
      }),
      egg('queued-deadlines', {
        state: 'queued',
        queuePosition: 2,
        timing: {
          landedAtMs: 1_000,
          readyAtMs: 70_000,
          expiresAtMs: 130_000
        }
      })
    ]);

    const timer = id => dom.window.document.querySelector(
      `[data-egg-id="${id}"] [data-egg-timer]`
    ).textContent;
    expect(timer('incubating-deadlines')).toBe('01:00');
    expect(timer('ready-deadlines')).toBe('01:30');
    expect(timer('public-deadlines')).toBe('01:10');
    expect(timer('reserved-deadlines')).toBe('00:30');
    expect(timer('queued-deadlines')).toBe('--:--');
    view.destroy();
    dom.window.close();
  });

  test.each([
    {
      name: 'incubating owned egg',
      stage: egg('opaque-incubating-id', {
        displayName: 'Alice',
        element: 'Tide',
        ownershipState: 'owned',
        state: 'incubating',
        timing: { landedAtMs: 1_000, readyAtMs: 70_000, expiresAtMs: 130_000 }
      }),
      owner: 'Owner: Alice',
      element: 'Element: Water',
      status: 'OWNED · INCUBATING',
      timer: '01:00',
      command: null
    },
    {
      name: 'reserved free egg',
      stage: egg('opaque-reserved-id', {
        displayName: '@Mira',
        element: 'Ember',
        provenance: 'free',
        ownershipState: 'offered',
        state: 'reserved',
        adoptionStatus: 'reserved',
        adoptable: false,
        timing: { landedAtMs: 1_000, publicAtMs: 70_000, expiresAtMs: 130_000 }
      }),
      owner: 'Owner: @Mira',
      element: 'Element: Fire',
      status: 'RESERVED FOR @Mira · !adopt',
      timer: '01:00',
      command: '!adopt'
    },
    {
      name: 'public free egg',
      stage: egg('opaque-public-id', {
        displayName: 'Source Viewer',
        element: 'Grove',
        provenance: 'free',
        ownershipState: 'offered',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true,
        timing: { landedAtMs: 1_000, expiresAtMs: 80_000 }
      }),
      owner: 'Public · eligible viewers only',
      element: 'Element: Nature',
      status: 'ADOPT NOW · !adopt',
      timer: '01:10',
      command: '!adopt'
    },
    {
      name: 'public rescue grace egg',
      stage: egg('opaque-rescue-id', {
        rescueId: 'opaque-rescue-record',
        displayName: 'Original Owner',
        element: 'Gale',
        ownershipState: 'offered',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true,
        timing: { landedAtMs: 1_000, expiresAtMs: 90_000 }
      }),
      owner: 'Owner: Original Owner',
      element: 'Element: Air',
      status: 'GRACE · ADOPT NOW · !adopt',
      timer: '01:20',
      command: '!adopt'
    },
    {
      name: 'ready owned egg',
      stage: egg('opaque-ready-id', {
        displayName: 'Ready Owner',
        element: 'Volt',
        ownershipState: 'owned',
        state: 'ready',
        timing: { landedAtMs: 1_000, readyAtMs: 5_000, expiresAtMs: 100_000 }
      }),
      owner: 'Owner: Ready Owner',
      element: 'Element: Lightning',
      status: 'OWNED · READY · !hatch · ROT IN 01:30',
      timer: '01:30',
      command: '!hatch'
    },
    {
      name: 'queued owned egg',
      stage: egg('opaque-queued-id', {
        displayName: 'Queue Owner',
        element: 'Lunar',
        ownershipState: 'owned',
        state: 'queued',
        queuePosition: 3,
        timing: { landedAtMs: 1_000, readyAtMs: null, expiresAtMs: null }
      }),
      owner: 'Owner: Queue Owner',
      element: 'Element: Moon',
      status: 'OWNED · QUEUED #3',
      timer: '--:--',
      command: null
    }
  ])(
    'renders complete portrait focus metadata for $name',
    ({ stage, owner, element, status, timer, command }) => {
      const { dom, view } = shelfFixture({ width: 477 });
      view.applySnapshot([stage]);
      const focus = dom.window.document.querySelector('[data-egg-focus]');
      const text = selector => focus.querySelector(selector)?.textContent || '';

      expect(focus.hidden).toBe(false);
      expect(text('[data-egg-focus-owner]')).toBe(owner);
      expect(text('[data-egg-focus-element]')).toBe(element);
      expect(text('[data-egg-focus-state]')).toBe(status);
      expect(text('[data-egg-focus-timer]')).toBe(timer);
      if (command) {
        expect(text('[data-egg-focus-command]')).toBe(command);
      } else {
        expect(focus.querySelector('[data-egg-focus-command]').hidden).toBe(true);
      }
      expect(focus.getAttribute('aria-label')).toContain(owner.replace('Owner: ', ''));
      expect(focus.getAttribute('aria-label')).toContain(element.replace('Element: ', ''));
      expect(focus.getAttribute('aria-label')).toContain(status);
      expect(focus.getAttribute('aria-label')).toContain(timer);
      expect(focus.getAttribute('aria-label')).not.toContain(stage.visualId);
      expect(focus.textContent).not.toContain(stage.visualId);
      view.destroy();
      dom.window.close();
    }
  );

  test('keeps the same overflow preview node across countdown ticks', () => {
    const { dom, view, intervals, setNow } = shelfFixture();
    view.applySnapshot(Array.from({ length: 6 }, (_, index) => (
      egg(`egg-${index + 1}`)
    )));

    const before = dom.window.document.querySelector(
      '[data-egg-overflow] [data-egg-id]'
    );
    const countBefore = dom.window.document.querySelector(
      '[data-egg-overflow-count]'
    );
    expect(before).not.toBeNull();
    expect(countBefore).not.toBeNull();

    setNow(11_000);
    intervals.get(1_000)();

    const after = dom.window.document.querySelector(
      '[data-egg-overflow] [data-egg-id]'
    );
    const countAfter = dom.window.document.querySelector(
      '[data-egg-overflow-count]'
    );
    expect(after).toBe(before);
    expect(countAfter).toBe(countBefore);
    expect(after.classList.contains('landing')).toBe(false);
    view.destroy();
    dom.window.close();
  });

  test('keeps 3-second landscape overflow and 5-second portrait focus rotations independent', () => {
    const { dom, view, intervals } = shelfFixture();
    view.applySnapshot([
      egg('ready', { state: 'ready' }),
      egg('public', {
        provenance: 'free',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true,
        timing: { expiresAtMs: 70_000, landedAtMs: 1_000 }
      }),
      ...Array.from({ length: 8 }, (_, index) => egg(`extra-${index}`))
    ]);
    const focus = dom.window.document.querySelector('[data-egg-focus]');
    const beforeFocusId = focus.dataset.eggId;
    const beforeOverflowId = dom.window.document.querySelector(
      '[data-egg-overflow]'
    ).dataset.previewEggId;

    expect(intervals.has(3_000)).toBe(true);
    expect(intervals.has(5_000)).toBe(true);
    intervals.get(3_000)();
    expect(focus.dataset.eggId).toBe(beforeFocusId);
    expect(dom.window.document.querySelector('[data-egg-overflow]').dataset.previewEggId)
      .not.toBe(beforeOverflowId);

    intervals.get(5_000)();
    expect(focus.dataset.eggId).toBe('ready');
    view.destroy();
    dom.window.close();
  });

  test('renders one adopt summary instead of one wide command pill per egg', () => {
    const { dom, view } = shelfFixture();
    view.applySnapshot(Array.from({ length: 5 }, (_, index) => egg(
      `free-${index + 1}`,
      {
        provenance: 'free',
        ownershipState: 'shared',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true,
        timing: {
          landedAtMs: 1_000 + index,
          expiresAtMs: 250_000
        }
      }
    )));

    const timings = [...dom.window.document.querySelectorAll('[data-egg-timing]')];
    expect(timings).toHaveLength(5);
    expect(timings.every(item => item.textContent === 'Free 04:00')).toBe(true);
    expect(dom.window.document.querySelectorAll('[data-adopt-callout]')).toHaveLength(0);

    const summaries = dom.window.document.querySelectorAll(
      '[data-egg-adopt-summary]:not([hidden])'
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0].textContent).toBe('5 free · !adopt');
    view.destroy();
    dom.window.close();
  });

  test('resolves shelf labels again on every render', () => {
    const dom = new JSDOM(`
      <section id="egg-shelf">
        <div data-egg-slots></div>
        <div data-egg-overflow hidden></div>
        <div data-egg-adopt-summary hidden></div>
      </section>
    `);
    let locale = 'de';
    const labels = {
      de:{ public:'Frei {time}', adoptSummary:'{count} frei {command}' },
      en:{ public:'Free {time}', adoptSummary:'{count} free {command}' }
    };
    const view = EggStageView.createEggStageView({
      document:dom.window.document,
      now:() => 10_000,
      viewportWidth:() => 477,
      getLabels:() => labels[locale],
      getAdoptReference:() => '!adopt'
    });
    view.applySnapshot([egg('dynamic-locale', {
      provenance:'free',
      state:'public',
      adoptionStatus:'public',
      adoptable:true,
      timing:{ landedAtMs:1_000, expiresAtMs:70_000 }
    })]);
    expect(dom.window.document.querySelector('[data-egg-timing]').textContent)
      .toBe('Frei 01:00');
    expect(dom.window.document.querySelector('[data-egg-adopt-summary]').textContent)
      .toBe('1 frei !adopt');

    locale = 'en';
    view.render();
    expect(dom.window.document.querySelector('[data-egg-timing]').textContent)
      .toBe('Free 01:00');
    expect(dom.window.document.querySelector('[data-egg-adopt-summary]').textContent)
      .toBe('1 free !adopt');
    view.destroy();
    dom.window.close();
  });

  test('removes expired eggs from the shared model', () => {
    const model = EggStageView.buildShelfModel([
      egg('expired', { state: 'expired' }),
      egg('ready', { state: 'ready' }),
      egg('incubating'),
      egg('queued', { state: 'queued', queuePosition: 2 })
    ]);

    expect(model.total).toBe(3);
    expect(model.visible.map(item => item.visualId)).toEqual([
      'ready',
      'queued',
      'incubating'
    ]);
    expect(model.visible.some(item => item.state === 'expired')).toBe(false);
  });

  test('renders compact reserved and public notices for five seconds', () => {
    expect(EggStageView.buildEventPresentation).toEqual(expect.any(Function));
    const reserved = EggStageView.buildEventPresentation(
      'free_egg_reserved',
      {
        eggStage: egg('reserved', {
          provenance: 'free',
          state: 'reserved',
          adoptionStatus: 'reserved',
          timing: { publicAtMs: 70_000 }
        })
      },
      {
        commands: { adopt: '!adopt', eggs: '!eggs' },
        nowMs: 10_000
      }
    );
    const publicNotice = EggStageView.buildEventPresentation(
      'free_egg_public',
      {
        eggStage: egg('public', {
          provenance: 'free',
          state: 'public',
          adoptionStatus: 'public',
          adoptable: true,
          timing: { expiresAtMs: 310_000 }
        })
      },
      {
        commands: { adopt: '!adopt', eggs: '!eggs' },
        nowMs: 10_000
      }
    );

    expect(reserved).toEqual(expect.objectContaining({
      placement: 'upper-third',
      size: 'compact',
      durationMs: 5_000,
      commands: []
    }));
    expect(publicNotice).toEqual(expect.objectContaining({
      placement: 'upper-third',
      size: 'compact',
      durationMs: 5_000,
      commands: ['!adopt']
    }));
    expect(reserved.titleKey).toBe('eggLifecycleFreeReservedTitle');
    expect(publicNotice.titleKey).toBe('eggLifecycleFreePublicTitle');
    expect(EggStageView.buildEventPresentation(
      'egg_landed',
      {
        eggStage: egg('gift-landed', {
          ownershipState: 'owned'
        })
      },
      { commands: { eggs: '!eggs' } }
    )).toBeNull();
    expect(EggStageView.buildEventPresentation(
      'egg_expired',
      {
        eggStage: egg('rotten', { state: 'expired' })
      },
      { commands: { eggs: '!eggs' } }
    )).toEqual(expect.objectContaining({
      kind: 'expired',
      titleKey: 'eggLifecycleExpiredTitle',
      copyKey: 'eggLifecycleExpiredCopy'
    }));
  });

  test('anchors the portrait focus shelf above chat without changing battle geometry', () => {
    const dom = new JSDOM(fs.readFileSync(overlayPath, 'utf8'));
    const rules = styleRules(dom.window.document);
    const portraitRules = rules.filter(rule => (
      rule.media.includes('orientation: portrait')
    ));
    const shelfRule = portraitRules.find(rule => rule.selector === '#egg-shelf');
    const compactCardRule = portraitRules.find(rule => (
      rule.selector ===
      '#card:not([data-presentation="hatch"]):not([data-presentation="egg-offer"])'
    ));
    const offerRule = portraitRules.find(rule => (
      rule.selector === '#card[data-presentation="egg-offer"]'
    ));
    const rootRule = portraitRules.find(rule => rule.selector === ':root');
    const focusRule = portraitRules.find(rule => (
      rule.selector === '#egg-shelf [data-egg-focus]'
    ));

    expect(rootRule?.style.getPropertyValue('--egg-shelf-lane-height')).toBe('66px');
    expect(shelfRule?.style.bottom).toBe('var(--portrait-safe-zone-height)');
    expect(shelfRule?.style.display).toBe('grid');
    expect(focusRule?.style.display).toBe('grid');
    expect(compactCardRule?.style['min-height']).toBe('250px');
    expect(offerRule?.style['min-height']).toBe('0px');
    expect(offerRule?.style.top).toBe('7%');

    const battleRule = portraitRules.find(rule => rule.selector === '#battle');
    expect(battleRule?.style.inset).toBe('0 0 var(--portrait-safe-zone-height)');
    dom.window.close();
  });

  test('reserves the complete portrait information rail for every non-battle layer', () => {
    const dom = new JSDOM(fs.readFileSync(overlayPath, 'utf8'));
    const portraitRules = styleRules(dom.window.document).filter(rule => (
      rule.media.includes('orientation: portrait')
    ));
    const bySelector = selector => portraitRules.find(rule => rule.selector === selector);
    const reservedBottom = 'calc(var(--portrait-safe-zone-height) + var(--portrait-info-rail-height))';

    expect(bySelector(':root')?.style.getPropertyValue('--portrait-safe-zone-height'))
      .toBe('26%');
    expect(bySelector(':root')?.style.getPropertyValue('--portrait-info-rail-height'))
      .toBe('clamp(146px,19vh,246px)');
    expect(bySelector('#egg-shelf')?.style.bottom)
      .toBe('var(--portrait-safe-zone-height)');
    expect(bySelector('#egg-shelf')?.style.height)
      .toBe('var(--portrait-info-rail-height)');
    for (const selector of ['#reveal-stage', '#arcade-choreography', '#chat-card', '#chat-detail']) {
      expect(bySelector(selector)?.style.bottom).toBe(reservedBottom);
    }
    expect(bySelector('#battle')?.style.inset).toBe('0 0 var(--portrait-safe-zone-height)');
    dom.window.close();
  });

  test.each([
    [477, 829, 157.51],
    [1080, 1920, 246]
  ])('keeps the focus card above chat at %ix%i', (width, height, shelfHeight) => {
    const gameplayBoundary = height * 0.74;
    const heroBottom = gameplayBoundary - shelfHeight;
    const safeZoneTop = height * 0.74;
    const shelfTop = heroBottom;
    const cardMinimum = Math.min(182, Math.max(116, height * 0.15));

    expect(width).toBeGreaterThanOrEqual(477);
    expect(heroBottom).toBeGreaterThanOrEqual(0);
    expect(heroBottom).toBeLessThan(safeZoneTop);
    expect(shelfTop).toBeCloseTo(heroBottom, 5);
    expect(shelfTop + shelfHeight).toBeCloseTo(safeZoneTop, 5);
    expect(cardMinimum).toBeLessThanOrEqual(shelfHeight);
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'ships compact egg guidance in app/locales/%s.json',
    locale => {
      const catalog = JSON.parse(fs.readFileSync(path.join(
        process.cwd(),
        'locales',
        `${locale}.json`
      ), 'utf8')).streammonsters;

      for (const key of [
        'eggShelfPublicCountdown',
        'eggShelfAdoptSummary',
        'eggLifecycleFreeReservedTitle',
        'eggLifecycleFreeReservedCopy',
        'eggLifecycleFreePublicTitle',
        'eggLifecycleFreePublicCopy',
        'eggLifecycleExpiredTitle',
        'eggLifecycleExpiredCopy',
        'eggLifecycleWaitTitle',
        'eggLifecycleWaitCopy',
        'eggLifecycleWaitQueuedCopy'
      ]) {
        expect(catalog?.[key]).toEqual(expect.any(String));
        expect(catalog[key].trim()).not.toBe('');
      }

      const pluginCatalog = JSON.parse(fs.readFileSync(path.join(
        process.cwd(),
        'plugins',
        'streamalchemy',
        'locales',
        `${locale}.json`
      ), 'utf8')).plugins.streamalchemy.ui.monsters;
      for (const key of ['eggShelfPublicCountdown', 'eggShelfAdoptSummary']) {
        expect(pluginCatalog?.[key]).toEqual(expect.any(String));
        expect(pluginCatalog[key].trim()).not.toBe('');
      }
    }
  );

  test('renders hatch wait with a safe viewer name, countdown, and queue position', async () => {
    const dom = new JSDOM(`
      <section id="chat-detail"></section>
      <aside id="chat-card"></aside>
    `);
    const detail = dom.window.document.getElementById('chat-detail');
    const compact = dom.window.document.getElementById('chat-card');
    let visibleSnapshot = null;
    const translations = {
      viewer: 'Viewer',
      eggQueued: 'Queued egg',
      eggWait: 'Egg incubating',
      eggQueuePosition: 'Queue position {position}',
      eggQueuePending: 'Incubation starts when a slot opens',
      eggWaitRemaining: '{remaining} remaining'
    };
    const translate = (key, params = {}) => Object.entries(params).reduce(
      (copy, [name, value]) => copy.replaceAll(`{${name}}`, String(value)),
      translations[key] || key
    );
    const view = ChatView.createChatView({
      document: dom.window.document,
      detailElement: detail,
      compactElement: compact,
      translate,
      wait: async () => {
        visibleSnapshot = detail.cloneNode(true);
      }
    });

    await view.show({
      displayName: '938475938475',
      viewerName: '@Mira',
      userId: '123456789',
      avatarUrl: '',
      result: {
        status: 'egg_not_ready',
        wait: {
          slot: 4,
          state: 'queued',
          remainingMs: 95_000,
          queuePosition: 3
        }
      }
    });

    expect(visibleSnapshot.dataset.placement).toBe('upper-third');
    expect(visibleSnapshot.textContent).toContain('@Mira');
    expect(visibleSnapshot.textContent).toContain('01:35');
    expect(visibleSnapshot.textContent).toContain('Queue position 3');
    expect(visibleSnapshot.textContent).not.toContain('938475938475');
    expect(visibleSnapshot.textContent).not.toContain('123456789');
    expect(visibleSnapshot.querySelector('img')).toBeNull();
    dom.window.close();
  });
});


describe('Stream Monsters portrait Smart Egg Focus presentation', () => {
  test('uses a viewport-relative focus card above the 26 percent chat boundary', () => {
    const overlayHtml = fs.readFileSync(overlayPath, 'utf8');
    expect(overlayHtml).toContain('[data-egg-focus]');
    expect(overlayHtml).toMatch(/#egg-shelf\s*\{[^}]*bottom:26%/s);
    expect(overlayHtml).toMatch(
      /@media \(orientation: portrait\)\s*\{[\s\S]*?\[data-egg-focus\]\s*\{[\s\S]*?width:clamp\(/s
    );
    expect(overlayHtml).toMatch(/\[data-egg-focus-owner\][\s\S]*?font-size:clamp\(/s);
    expect(overlayHtml).toMatch(/\[data-egg-focus-element\][\s\S]*?font-size:clamp\(/s);
    expect(overlayHtml).toMatch(/\[data-egg-focus-state\][\s\S]*?font-size:clamp\(/s);
    expect(overlayHtml).toMatch(/\[data-egg-focus-timer\][\s\S]*?font-size:clamp\(/s);
    expect(overlayHtml).toMatch(/\[data-egg-focus-command\][\s\S]*?font-size:clamp\(/s);
    expect(overlayHtml).toMatch(/\[data-egg-focus\]\[data-state="ready"\]/);
    expect(overlayHtml).toMatch(/\[data-egg-focus\]\[data-state="public"\]/);
    expect(overlayHtml).toMatch(/\[data-egg-focus\]\[data-state="queued"\]/);
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'provides non-empty %s focus labels in plugin and app locale catalogs',
    locale => {
      const pluginLocale = JSON.parse(fs.readFileSync(
        path.join(process.cwd(), 'plugins', 'streamalchemy', 'locales', `${locale}.json`),
        'utf8'
      ));
      const appLocale = JSON.parse(fs.readFileSync(
        path.join(process.cwd(), 'locales', `${locale}.json`),
        'utf8'
      ));
      const keys = [
        'eggShelfNextAction',
        'eggShelfNoAction',
        'eggCardOwner',
        'eggCardElement',
        'eggCardOwned',
        'eggCardIncubating',
        'eggCardQueued',
        'eggCardReady',
        'eggCardReserved',
        'eggCardPublic',
        'eggCardRescuePublic',
        'eggCardRotTimer',
        'eggCardTimerUnavailable',
        'eggCardAria',
        'eggFocusOwner',
        'eggFocusPosition',
        'eggFocusReady',
        'eggFocusIncubating',
        'eggFocusPublic',
        'eggFocusReserved',
        'eggFocusOpenOwner'
      ];
      const requiredTokens = {
        eggShelfNextAction: ['{command}'],
        eggCardOwner: ['{owner}'],
        eggCardElement: ['{element}'],
        eggCardQueued: ['{position}'],
        eggCardReady: ['{command}'],
        eggCardReserved: ['{owner}', '{command}'],
        eggCardPublic: ['{command}'],
        eggCardRescuePublic: ['{command}'],
        eggCardRotTimer: ['{time}'],
        eggCardAria: ['{owner}', '{element}', '{status}', '{timer}'],
        eggFocusOwner: ['{owner}'],
        eggFocusPosition: ['{position}', '{total}'],
        eggFocusReady: ['{command}'],
        eggFocusIncubating: ['{time}'],
        eggFocusPublic: ['{time}', '{command}'],
        eggFocusReserved: ['{time}', '{command}']
      };

      for (const key of keys) {
        expect(pluginLocale.plugins.streamalchemy.ui.monsters[key])
          .toEqual(expect.any(String));
        expect(pluginLocale.plugins.streamalchemy.ui.monsters[key].trim()).not.toBe('');
        expect(appLocale.streammonsters[key]).toEqual(expect.any(String));
        expect(appLocale.streammonsters[key].trim()).not.toBe('');
        for (const token of requiredTokens[key] || []) {
          expect(pluginLocale.plugins.streamalchemy.ui.monsters[key]).toContain(token);
          expect(appLocale.streammonsters[key]).toContain(token);
        }
      }
    }
  );
});
