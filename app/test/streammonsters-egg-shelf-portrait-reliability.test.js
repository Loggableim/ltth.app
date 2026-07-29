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
      adoptSummary: '{count} free · {command}'
    },
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

    for (const notice of [reserved, publicNotice]) {
      expect(notice).toEqual(expect.objectContaining({
        placement: 'upper-third',
        size: 'compact',
        durationMs: 5_000,
        commands: ['!adopt']
      }));
    }
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
    expect(shelfRule?.style.bottom).toBe('26%');
    expect(shelfRule?.style.display).toBe('grid');
    expect(focusRule?.style.display).toBe('grid');
    expect(compactCardRule?.style['min-height']).toBe('250px');
    expect(offerRule?.style['min-height']).toBe('0px');
    expect(offerRule?.style.top).toBe('7%');

    const battleRule = portraitRules.find(rule => rule.selector === '#battle');
    expect(battleRule?.style.inset).toBe('0 0 26%');
    dom.window.close();
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
    expect(overlayHtml).toMatch(/\[data-egg-focus-state\][\s\S]*?font-size:clamp\(/s);
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
        'eggFocusOwner',
        'eggFocusPosition',
        'eggFocusReady',
        'eggFocusIncubating',
        'eggFocusPublic'
      ];

      for (const key of keys) {
        expect(pluginLocale.plugins.streamalchemy.ui.monsters[key])
          .toEqual(expect.any(String));
        expect(pluginLocale.plugins.streamalchemy.ui.monsters[key].trim()).not.toBe('');
        expect(appLocale.streammonsters[key]).toEqual(expect.any(String));
        expect(appLocale.streammonsters[key].trim()).not.toBe('');
      }
    }
  );
});
