'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const Presentation = require('../plugins/stream-monsters/streammonsters-presentation');
const OverlayRuntime = require(
  '../plugins/stream-monsters/streammonsters-overlay-runtime'
);
const ArenaDirector = require(
  '../plugins/stream-monsters/streammonsters-arena-director'
);
const EggStageView = require(
  '../plugins/stream-monsters/streammonsters-egg-stage-view'
);

const pluginDir = path.join(process.cwd(), 'plugins', 'stream-monsters');
const overlayHtml = fs.readFileSync(
  path.join(pluginDir, 'streammonsters-overlay.html'),
  'utf8'
);
const localeCatalogs = Object.fromEntries(['de', 'en', 'es', 'fr'].map(locale => [
  locale,
  JSON.parse(fs.readFileSync(
    path.join(pluginDir, 'locales', `${locale}.json`),
    'utf8'
  ))
]));

const flush = () => new Promise(resolve => setImmediate(resolve));

async function createPresenterHarness({
  primaryLocale = 'de',
  locales = [primaryLocale],
  secondsPerLocale = 5,
  useRealEggStage = false
} = {}) {
  const socketHandlers = new Map();
  const timers = new Map();
  let timerId = 0;
  let currentNowMs = 1_000;
  const arenaLocales = [];
  const arenaEvents = [];
  const eggEvents = [];
  const schedule = (callback, milliseconds = 0) => {
    const id = ++timerId;
    const delayMs = Math.max(0, Number(milliseconds) || 0);
    timers.set(id, {
      callback,
      milliseconds:delayMs,
      dueAtMs:currentNowMs + delayMs
    });
    return id;
  };
  const dom = new JSDOM(overlayHtml, {
    url:'http://localhost:3000/plugins/streamalchemy/streammonsters-overlay.html',
    runScripts:'dangerously',
    beforeParse(window) {
      window.Date.now = () => currentNowMs;
      window.setTimeout = schedule;
      window.clearTimeout = id => timers.delete(id);
      window.setInterval = () => ++timerId;
      window.clearInterval = () => {};
      window.matchMedia = () => ({
        matches:false,
        addEventListener:() => {},
        removeEventListener:() => {}
      });
      window.i18n = {
        init:async () => {},
        updateDOM:() => {}
      };
      window.io = () => ({
        on:(event, handler) => socketHandlers.set(event, handler)
      });
      window.fetch = jest.fn(async input => {
        const url = String(input);
        const localeMatch = /\/locales\/(de|en|es|fr)\.json/.exec(url);
        if (localeMatch) {
          return {
            ok:true,
            status:200,
            json:async () => localeCatalogs[localeMatch[1]]
          };
        }
        if (url.includes('/assets/audio/manifest.json')) {
          return { ok:false, status:404, json:async () => ({}) };
        }
        if (url.includes('/battles/')) {
          return {
            ok:true,
            status:200,
            json:async () => ({ cursor:0, hasMore:false, events:[] })
          };
        }
        if (url.includes('/overlay/heartbeat')) {
          return { ok:true, status:200, json:async () => ({ success:true }) };
        }
        return {
          ok:true,
          status:200,
          json:async () => ({
            hype:{ points:0 },
            config:{
              hatchDurationMs:90_000,
              overlayLanguage:{ primaryLocale, locales, secondsPerLocale }
            },
            gcce:{
              commandPrefix:'!',
              registeredCommands:[],
              commandReferences:{
                adopt:'!adopt',
                hatch:'!hatch',
                eggs:'!eier'
              }
            },
            battle:{ matches:[] },
            eggStage:[]
          })
        };
      });
      window.StreamMonstersOverlayRuntime = OverlayRuntime;
      window.StreamMonstersPresentation = Presentation;
      window.StreamMonstersPortraitArena = {
        normalizeVariant:(value, fallback) => value || fallback
      };
      window.StreamMonstersArenaDirector = ArenaDirector;
      window.StreamMonstersEffectsRenderer = {
        createEffectsRenderer:() => ({
          init:async () => true,
          resize:() => {},
          play:async () => true,
          status:() => ({ backend:'canvas2d' })
        })
      };
      window.StreamMonstersAudioEngine = {
        normalizeChannelConfig:value => value
      };
      window.StreamMonstersArenaView = {
        createArenaView:() => ({
          applyMatch:() => {},
          applySnapshot:() => {},
          openChoice:() => {},
          lockChoice:() => {},
          revealChoices:() => {},
          playEvent:async (type, payload) => {
            arenaEvents.push([type, payload?.eventId]);
            return true;
          },
          playAction:async () => true,
          complete:async () => {},
          cancel:async () => {},
          destroy:() => {},
          setLocale:locale => arenaLocales.push(locale)
        })
      };
      window.StreamMonstersEggStageView = useRealEggStage
        ? {
            ...EggStageView,
            createEggStageView:options => {
              const view = EggStageView.createEggStageView({
                ...options,
                now:() => window.Date.now()
              });
              return {
                ...view,
                applyEvent:(type, payload) => {
                  eggEvents.push([type, payload?.eventId]);
                  return view.applyEvent(type, payload);
                }
              };
            }
          }
        : {
          createEggStageView:() => ({
            applyEvent:(type, payload) => {
              eggEvents.push([type, payload?.eventId]);
              return true;
            },
            applySnapshot:() => ({ total:0, visible:[], overflow:null }),
            destroy:() => {}
          }),
          buildHatchRevealNotice:EggStageView.buildHatchRevealNotice,
          buildAdoptionNotice:(type, payload) => (
            type === 'free_egg_public'
              ? {
                kind:'public',
                viewer:payload.playerName || '@viewer',
                durationMs:8_000
              }
              : null
          )
        };
      window.StreamMonstersChatView = {
        createChatView:() => ({ show:async () => {} }),
        displayName:(payload, fallback) => (
          payload?.displayName || payload?.playerName ||
          payload?.username || payload?.nickname || fallback
        )
      };
    }
  });

  for (let attempt = 0; attempt < 30 && !socketHandlers.has('connect'); attempt += 1) {
    await flush();
  }
  expect(socketHandlers.has('connect')).toBe(true);
  await socketHandlers.get('connect')();
  for (let attempt = 0; attempt < 10; attempt += 1) await flush();

  const card = () => {
    const hatchReveal = dom.window.document.getElementById('hatch-reveal');
    if (!hatchReveal.hidden) {
      return {
        visible:true,
        title:hatchReveal.querySelector('[data-hatch-name]').textContent,
        subtitle:hatchReveal.querySelector('[data-hatch-context]')?.textContent || '',
        hint:'',
        imageUrl:hatchReveal.querySelector('[data-hatch-art]').getAttribute('src') || '',
        locale:dom.window.document.documentElement.lang
      };
    }
    return {
      visible:dom.window.document.getElementById('card').classList.contains('visible'),
      title:dom.window.document.getElementById('title').textContent,
      subtitle:dom.window.document.getElementById('subtitle').textContent,
      hint:dom.window.document.getElementById('hint').textContent,
      imageUrl:dom.window.document.getElementById('art').getAttribute('src') || '',
      locale:dom.window.document.documentElement.lang
    };
  };
  const runNextTimer = async () => {
    const next = [...timers.entries()].sort((left, right) => (
      left[1].dueAtMs - right[1].dueAtMs || left[0] - right[0]
    ))[0];
    if (!next) return false;
    const [id, timer] = next;
    timers.delete(id);
    currentNowMs = Math.max(currentNowMs, timer.dueAtMs);
    timer.callback();
    for (let attempt = 0; attempt < 5; attempt += 1) await flush();
    return true;
  };
  const advanceUntil = async (predicate, maximum = 30) => {
    for (let attempt = 0; attempt < maximum; attempt += 1) {
      if (predicate(card())) return true;
      if (!await runNextTimer()) break;
    }
    return predicate(card());
  };
  const emit = async (eventName, payload) => {
    expect(socketHandlers.has(eventName)).toBe(true);
    socketHandlers.get(eventName)(payload);
    for (let attempt = 0; attempt < 8; attempt += 1) await flush();
    return card();
  };
  const emitBurst = async events => {
    for (const [eventName, payload] of events) {
      expect(socketHandlers.has(eventName)).toBe(true);
      socketHandlers.get(eventName)(payload);
    }
    for (let attempt = 0; attempt < 8; attempt += 1) await flush();
  };

  return {
    arenaLocales,
    arenaEvents,
    eggEvents,
    announcer:() => dom.window.document
      .getElementById('critical-status-announcer').textContent,
    card,
    toast:() => ({
      visible:dom.window.document.getElementById('toast').classList.contains('visible'),
      text:dom.window.document.getElementById('toast').textContent
    }),
    activateBattle:() => {
      dom.window.document.getElementById('streammonsters-overlay')
        .dataset.battleActive = 'true';
      const battle = dom.window.document.getElementById('battle');
      battle.classList.add('visible');
      battle.dataset.phase = 'choice';
    },
    arenaFeedback:() => {
      const prompt = dom.window.document.getElementById('arena-skill-prompt');
      const style = dom.window.getComputedStyle(prompt);
      return {
        visible:prompt.dataset.choiceFeedback === 'true' &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0',
        text:prompt.textContent
      };
    },
    setArenaPrompt:text => {
      dom.window.document.getElementById('arena-skill-prompt').textContent = text;
    },
    now:() => currentNowMs,
    shelf:() => ({
      total:Number(
        dom.window.document.getElementById('egg-shelf')?.dataset.total || 0
      ),
      timing:dom.window.document.querySelector('[data-egg-timing]')?.textContent || '',
      summary:dom.window.document.querySelector(
        '[data-egg-adopt-summary]:not([hidden])'
      )?.textContent || ''
    }),
    emit,
    emitBurst,
    advanceUntil,
    runNextTimer,
    pendingTimerDelays:() => [...timers.values()].map(timer => timer.milliseconds),
    stopLifecycle:() => {
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    },
    close:() => dom.window.close()
  };
}

describe('Stream Monsters 1.11 critical overlay locale presenter', () => {
  test.each([
    ['de', 'arenaChoiceSpecialNotCharged', /Special.*noch nicht/i],
    ['en', 'arenaChoiceAlreadyLocked', /already locked/i],
    ['es', 'arenaChoiceWindowClosed', /ventana.*cerrada/i],
    ['fr', 'arenaChoiceDefenseLocked', /défense.*bloquée/i]
  ])('shows localized redacted battle rejection feedback in %s', async (
    locale,
    messageKey,
    expected
  ) => {
    const harness = await createPresenterHarness({
      primaryLocale:locale,
      locales:[locale]
    });
    harness.activateBattle();

    await harness.emit('streammonsters:battle_choice_rejected', {
      eventId:`rejection-${locale}`,
      matchId:'match-public',
      round:4,
      slot:1,
      reason:'rejected',
      messageKey
    });

    expect(harness.arenaFeedback()).toEqual({
      visible:true,
      text:expect.stringMatching(expected)
    });
    expect(harness.toast().visible).toBe(false);
    expect(harness.arenaFeedback().text).not.toMatch(/\b[ABC]\b/);
    harness.close();
  });

  test('does not overwrite a newer arena prompt when rejection feedback expires', async () => {
    const harness = await createPresenterHarness({
      primaryLocale:'en',
      locales:['en']
    });
    harness.activateBattle();
    await harness.emit('streammonsters:battle_choice_rejected', {
      eventId:'rejection-restore',
      matchId:'match-public',
      round:4,
      slot:1,
      reason:'already_locked',
      messageKey:'arenaChoiceAlreadyLocked'
    });
    expect(harness.arenaFeedback().visible).toBe(true);

    harness.setArenaPrompt('Round 5 · choose your next skill');
    for (let attempt = 0; attempt < 20 && harness.arenaFeedback().visible; attempt += 1) {
      await harness.runNextTimer();
    }

    expect(harness.arenaFeedback()).toEqual({
      visible:false,
      text:'Round 5 · choose your next skill'
    });
    harness.close();
  });

  test('does not delay battle lock and reveal behind rejection feedback', async () => {
    const harness = await createPresenterHarness({
      primaryLocale:'en',
      locales:['en']
    });
    harness.activateBattle();

    await harness.emitBurst([
      ['streammonsters:battle_choice_rejected', {
        eventId:'rejection-before-lock',
        matchId:'match-public',
        round:4,
        slot:1,
        reason:'already_locked',
        messageKey:'arenaChoiceAlreadyLocked'
      }],
      ['streammonsters:battle_choice_locked', {
        eventId:'lock-after-rejection',
        matchId:'match-public',
        round:4,
        slot:1
      }],
      ['streammonsters:battle_choices_revealed', {
        eventId:'reveal-after-rejection',
        matchId:'match-public',
        round:4,
        choices:[]
      }]
    ]);

    expect(harness.arenaEvents).toEqual(expect.arrayContaining([
      ['battle_choice_locked', 'lock-after-rejection'],
      ['battle_choices_revealed', 'reveal-after-rejection']
    ]));
    harness.close();
  });

  test('clears the rejection feedback timer when the overlay lifecycle stops', async () => {
    const harness = await createPresenterHarness({
      primaryLocale:'en',
      locales:['en']
    });
    harness.activateBattle();
    await harness.emit('streammonsters:battle_choice_rejected', {
      eventId:'rejection-before-stop',
      matchId:'match-public',
      round:4,
      slot:1,
      reason:'already_locked',
      messageKey:'arenaChoiceAlreadyLocked'
    });

    expect(harness.pendingTimerDelays()).toContain(3_000);
    harness.stopLifecycle();

    expect(harness.pendingTimerDelays()).not.toContain(3_000);
    harness.close();
  });

  test('budgets both configured stat pages inside the active deadline', () => {
    const pages = OverlayRuntime.criticalLocalePages({
      primaryLocale:'de',
      locales:['de', 'en'],
      secondsPerLocale:5
    }, {
      nowMs:1_000,
      deadlineMs:11_000,
      settleMs:350
    });

    expect(OverlayRuntime.isCritical('monster_stat_prompt')).toBe(true);
    expect(OverlayRuntime.isCritical('stat_choice_opened')).toBe(true);
    expect(pages.reduce((total, page) => total + page.durationMs, 0))
      .toBeLessThanOrEqual(10_000);
  });

  test('announces one critical egg phase through the dedicated status region', async () => {
    const harness = await createPresenterHarness({
      primaryLocale:'en',
      locales:['en']
    });
    try {
      await harness.emit('streammonsters:egg_ready', {
        eventId:'ready-announcer',
        playerName:'@alpha',
        egg:{ element:'Ember' },
        eggStage:{
          visualId:'ready-announcer',
          element:'Ember',
          state:'ready'
        }
      });
      expect(harness.announcer()).toBe('egg ready');
    } finally {
      harness.close();
    }
  });

  test.each([
    {
      event:'streammonsters:egg_ready',
      payload:{
        eventId:'ready-locales',
        criticalFinal:true,
        playerName:'@alpha',
        egg:{ element:'Ember' },
        eggStage:{ visualId:'ready-locales', element:'Ember', state:'ready' }
      },
      german:/kann schlüpfen/,
      english:/ready to hatch/
    },
    {
      event:'streammonsters:free_egg_public',
      payload:{
        eventId:'public-locales',
        criticalFinal:true,
        playerName:'@alpha',
        eggStage:{ visualId:'public-egg', adoptionStatus:'public' }
      },
      german:/Gratis-Ei freigegeben/,
      english:/Free egg available/
    },
    {
      event:'streammonsters:egg_hatched',
      payload:{
        eventId:'hatch-locales',
        criticalFinal:true,
        playerName:'@alpha',
        egg:{ element:'Ember' },
        monster:{ name:'Ashfang', element:'Ember' }
      },
      german:/Hatchling Ashfang ist da/,
      english:/Hatchling Ashfang is here/
    }
  ])('presents $event in German and English without inheriting a stale locale', async ({
    event,
    payload,
    german,
    english
  }) => {
    const harness = await createPresenterHarness({
      primaryLocale:'de',
      locales:['de', 'en'],
      secondsPerLocale:5
    });
    try {
      let first = await harness.emit(event, payload);
      if (!first.visible) {
        expect(await harness.advanceUntil(state => (
          state.visible && state.locale === 'de' && german.test(state.title)
        ))).toBe(true);
        first = harness.card();
      }
      expect(first.visible).toBe(true);
      expect(first.locale).toBe('de');
      expect(first.title).toMatch(german);

      expect(await harness.advanceUntil(state => (
        state.visible && state.locale === 'en' && english.test(state.title)
      ))).toBe(true);
      if (event !== 'streammonsters:egg_hatched') {
        expect(harness.eggEvents.filter(([type]) => (
          type === event.replace(/^streammonsters:/, '')
        ))).toHaveLength(1);
      }
      if (event === 'streammonsters:egg_hatched') {
        expect(harness.arenaEvents.filter(([type]) => type === 'egg_hatched'))
          .toHaveLength(1);
      }
    } finally {
      harness.close();
    }
  });

  test('keeps the localized auto-hatch outcome on the dedicated hatch reveal', async () => {
    const harness = await createPresenterHarness({
      primaryLocale:'de',
      locales:['de']
    });
    try {
      const first = await harness.emit('streammonsters:egg_hatched', {
        eventId:'auto-hatch-reveal',
        criticalFinal:true,
        autoHatch:true,
        playerName:'@alpha',
        egg:{ element:'Ember' },
        monster:{ name:'Ashfang', element:'Ember' }
      });
      expect(first.visible).toBe(true);
      expect(first.title).toMatch(/Hatchling Ashfang ist da/);
      expect(first.subtitle).toMatch(/automatisch geschlüpft/i);
    } finally {
      harness.close();
    }
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'shows complete stat prompt, manual result, and timeout context in %s',
    async locale => {
      const harness = await createPresenterHarness({
        primaryLocale:locale,
        locales:[locale],
        secondsPerLocale:5
      });
      const imageUrl =
        '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png';
      const base = {
        playerName:'@alpha',
        userId:'1234567890123456789',
        monster:{
          name:'Ashfang',
          element:'Ember',
          level:7,
          unspentStatPoints:2,
          imageUrl
        },
        level:7,
        remainingUnspentPoints:2
      };
      try {
        const prompt = await harness.emit(
          'streammonsters:monster_stat_prompt',
          {
            ...base,
            eventId:`prompt-${locale}`,
            promptId:`prompt-${locale}`,
            criticalFinal:true,
            deadlineMs:11_000,
            choices:['1', '2', '3', '4']
          }
        );
        expect(prompt.visible).toBe(true);
        expect(`${prompt.title} ${prompt.subtitle}`).toContain('@alpha');
        expect(`${prompt.title} ${prompt.subtitle}`).toContain('Ashfang');
        expect(`${prompt.title} ${prompt.subtitle}`).toContain('7');
        expect(`${prompt.title} ${prompt.subtitle}`).toContain('2');
        for (const choice of ['1', '2', '3', '4']) {
          expect(prompt.subtitle).toContain(choice);
        }
        expect(prompt.subtitle.match(/\+1/g)).toHaveLength(4);
        expect(prompt.imageUrl).toBe(imageUrl);
        expect(`${prompt.title} ${prompt.subtitle}`).not.toContain(base.userId);

        expect(await harness.advanceUntil(state => !state.visible)).toBe(true);
        const manual = await harness.emit(
          'streammonsters:monster_stat_chosen',
          {
            ...base,
            eventId:`manual-${locale}`,
            stat:'might',
            remainingUnspentPoints:1,
            monster:{ ...base.monster, unspentStatPoints:1 }
          }
        );
        expect(`${manual.title} ${manual.subtitle}`).toEqual(
          expect.stringContaining('@alpha')
        );
        expect(`${manual.title} ${manual.subtitle}`).toEqual(
          expect.stringContaining('Ashfang')
        );
        expect(`${manual.title} ${manual.subtitle}`).toContain('7');
        expect(`${manual.title} ${manual.subtitle}`).toContain('1');
        expect(manual.title).toContain('+1');
        expect(manual.imageUrl).toBe(imageUrl);
        expect(`${manual.title} ${manual.subtitle}`).not.toContain(base.userId);

        expect(await harness.advanceUntil(state => !state.visible)).toBe(true);
        const timeout = await harness.emit(
          'streammonsters:monster_stat_auto_assigned',
          {
            ...base,
            eventId:`timeout-${locale}`,
            stat:'guard',
            source:'timeout',
            remainingUnspentPoints:1,
            monster:{ ...base.monster, unspentStatPoints:1 }
          }
        );
        expect(`${timeout.title} ${timeout.subtitle}`).toEqual(
          expect.stringContaining('@alpha')
        );
        expect(`${timeout.title} ${timeout.subtitle}`).toEqual(
          expect.stringContaining('Ashfang')
        );
        expect(`${timeout.title} ${timeout.subtitle}`).toContain('7');
        expect(`${timeout.title} ${timeout.subtitle}`).toContain('1');
        expect(timeout.title).toContain('+1');
        expect(timeout.imageUrl).toBe(imageUrl);
        expect(`${timeout.title} ${timeout.subtitle}`).not.toContain(base.userId);
      } finally {
        harness.close();
      }
    }
  );

  test('cancels an active bilingual stat prompt when its result arrives early', async () => {
    const harness = await createPresenterHarness({
      primaryLocale:'de',
      locales:['de', 'en'],
      secondsPerLocale:5
    });
    const monster = {
      name:'Ashfang',
      element:'Ember',
      level:7,
      unspentStatPoints:2,
      imageUrl:'/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png'
    };
    try {
      const prompt = await harness.emit('streammonsters:monster_stat_prompt', {
        eventId:'prompt-early',
        promptId:'allocation-early',
        playerName:'@alpha',
        monster,
        level:7,
        remainingUnspentPoints:2,
        deadlineMs:11_000,
        choices:['1', '2', '3', '4']
      });
      expect(prompt.title).toContain('@alpha');
      expect(prompt.subtitle.match(/\+1/g)).toHaveLength(4);

      const result = await harness.emit('streammonsters:monster_stat_chosen', {
        eventId:'result-early',
        promptId:'allocation-early',
        playerName:'@alpha',
        monster:{ ...monster, unspentStatPoints:1 },
        level:7,
        remainingUnspentPoints:1,
        stat:'might'
      });
      expect(result.visible).toBe(true);
      expect(result.title).toContain('@alpha');
      expect(result.title).toContain('Ashfang');
      expect(result.title).toContain('+1');
    } finally {
      harness.close();
    }
  });

  test('keeps egg_landed on the shelf without opening a fallback card', async () => {
    const harness = await createPresenterHarness({
      primaryLocale:'de',
      locales:['de', 'en'],
      secondsPerLocale:5,
      useRealEggStage:true
    });
    try {
      const card = await harness.emit('streammonsters:egg_landed', {
        eventId:'gift-landed-shelf-only',
        eggStage:{
          visualId:'gift-landed-shelf-only',
          displayName:'@alpha',
          element:'Ember',
          variant:'standard',
          provenance:'gift',
          ownershipState:'owned',
          adoptionStatus:'owned',
          adoptable:false,
          state:'incubating',
          queuePosition:0,
          timing:{ landedAtMs:1_000, readyAtMs:91_000 }
        }
      });

      expect(harness.shelf().total).toBe(1);
      expect(card.visible).toBe(false);
    } finally {
      harness.close();
    }
  });

  test('updates the live shelf locale and shares one five-second egg-offer deadline', async () => {
    const harness = await createPresenterHarness({
      primaryLocale:'de',
      locales:['de', 'en'],
      secondsPerLocale:5,
      useRealEggStage:true
    });
    const startedAtMs = harness.now();
    try {
      const first = await harness.emit('streammonsters:free_egg_public', {
        eventId:'public-offer-five-seconds',
        playerName:'@alpha',
        eggStage:{
          visualId:'public-offer-five-seconds',
          displayName:'@alpha',
          element:'Lunar',
          variant:'standard',
          provenance:'free',
          ownershipState:'shared',
          adoptionStatus:'public',
          adoptable:true,
          state:'public',
          queuePosition:0,
          timing:{ landedAtMs:1_000, expiresAtMs:61_000 }
        }
      });

      expect(first.visible).toBe(true);
      expect(first.locale).toBe('de');
      expect(harness.shelf().timing).toMatch(/^Frei /);
      expect(harness.shelf().summary).toMatch(/^1 frei /);

      expect(await harness.advanceUntil(state => (
        state.visible && state.locale === 'en'
      ))).toBe(true);
      expect(harness.shelf().timing).toMatch(/^Free /);
      expect(harness.shelf().summary).toMatch(/^1 free /);

      expect(await harness.advanceUntil(state => !state.visible)).toBe(true);
      expect(harness.now() - startedAtMs).toBe(5_000);
    } finally {
      harness.close();
    }
  });

  test('shares one five-second reserved-offer deadline across both locales', async () => {
    const harness = await createPresenterHarness({
      primaryLocale:'de',
      locales:['de', 'en'],
      secondsPerLocale:5,
      useRealEggStage:true
    });
    const startedAtMs = harness.now();
    try {
      const first = await harness.emit('streammonsters:free_egg_reserved', {
        eventId:'reserved-offer-five-seconds',
        playerName:'@alpha',
        eggStage:{
          visualId:'reserved-offer-five-seconds',
          displayName:'@alpha',
          element:'Grove',
          variant:'standard',
          provenance:'free',
          ownershipState:'shared',
          adoptionStatus:'reserved',
          adoptable:true,
          state:'reserved',
          queuePosition:0,
          timing:{ landedAtMs:1_000, publicAtMs:61_000 }
        }
      });

      expect(first.visible).toBe(true);
      expect(first.locale).toBe('de');
      expect(await harness.advanceUntil(state => (
        state.visible && state.locale === 'en'
      ))).toBe(true);
      expect(await harness.advanceUntil(state => !state.visible)).toBe(true);
      expect(harness.now() - startedAtMs).toBe(5_000);
    } finally {
      harness.close();
    }
  });
});
