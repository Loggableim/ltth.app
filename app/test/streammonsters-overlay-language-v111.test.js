'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const StreamAlchemyPlugin = require('../plugins/stream-monsters');
const StreamMonstersRoutes = require(
  '../plugins/stream-monsters/backend/streammonsters/routes'
);
const StreamMonstersBattleMatchService = require(
  '../plugins/stream-monsters/backend/streammonsters/battle-match-service'
);
const overlayRuntime = require(
  '../plugins/stream-monsters/streammonsters-overlay-runtime'
);
const creatorRuntime = require(
  '../plugins/stream-monsters/streammonsters-creator-runtime'
);
const ArenaView = require(
  '../plugins/stream-monsters/streammonsters-arena-view'
);

const pluginDir = path.join(process.cwd(), 'plugins', 'stream-monsters');

describe('Stream Monsters 1.11 overlay language configuration', () => {
  test('defaults to German and English without overwriting valid saved choices', () => {
    const plugin = new StreamAlchemyPlugin({
      getConfig: () => null,
      setConfig: jest.fn()
    });

    expect(plugin.loadConfig(null).streamMonsters.overlayLanguage).toEqual({
      primaryLocale: 'de',
      locales: ['de', 'en'],
      secondsPerLocale: 5
    });

    expect(plugin.loadConfig({
      enabled: true,
      streamMonsters: {
        creatorName: 'Arcade Host',
        overlayLanguage: {
          primaryLocale: 'es',
          locales: ['fr', 'es'],
          secondsPerLocale: 4
        }
      }
    }).streamMonsters).toEqual(expect.objectContaining({
      creatorName: 'Arcade Host',
      overlayLanguage: {
        primaryLocale: 'es',
        locales: ['es', 'fr'],
        secondsPerLocale: 4
      }
    }));
  });

  test('rejects unsupported, duplicate, and out-of-range overlay language values', () => {
    const plugin = new StreamAlchemyPlugin({
      getConfig: () => null,
      setConfig: jest.fn()
    });

    expect(plugin.normalizeOverlayLanguage({
      primaryLocale: 'xx',
      locales: ['en', 'en', 'xx', 'fr'],
      secondsPerLocale: 8
    })).toEqual({
      primaryLocale: 'en',
      locales: ['en', 'fr'],
      secondsPerLocale: 5
    });
    expect(plugin.normalizeOverlayLanguage({
      primaryLocale: 'fr',
      locales: [],
      secondsPerLocale: 6
    })).toEqual({
      primaryLocale: 'fr',
      locales: ['fr'],
      secondsPerLocale: 6
    });
  });

  test('updates battle timing from the effective overlay language settings', () => {
    const plugin = new StreamAlchemyPlugin({
      getConfig: () => null,
      setConfig: jest.fn()
    });
    plugin.config = plugin.loadConfig(null);
    plugin.streamMonstersBattleMatchService = {
      setLanguageTiming: jest.fn(),
      setSeasonDurationDays: jest.fn()
    };

    plugin.updateConfig({
      streamMonsters: {
        overlayLanguage: {
          primaryLocale: 'fr',
          locales: ['fr'],
          secondsPerLocale: 4
        }
      }
    });

    expect(plugin.streamMonstersBattleMatchService.setLanguageTiming)
      .toHaveBeenCalledWith({
        localeCount: 1,
        secondsPerLocale: 4
      });
  });

  test('preserves saved locales when an API update changes only page duration', () => {
    const plugin = new StreamAlchemyPlugin({
      getConfig: () => null,
      setConfig: jest.fn()
    });
    plugin.config = plugin.loadConfig({
      streamMonsters: {
        overlayLanguage: {
          primaryLocale: 'es',
          locales: ['es', 'fr'],
          secondsPerLocale: 5
        }
      }
    });

    plugin.updateConfig({
      streamMonsters: {
        overlayLanguage: { secondsPerLocale: 4 }
      }
    });

    expect(plugin.config.streamMonsters.overlayLanguage).toEqual({
      primaryLocale: 'es',
      locales: ['es', 'fr'],
      secondsPerLocale: 4
    });
  });

  test('keeps the Rules v8 action window at four seconds regardless of overlay language cadence', () => {
    const service = Object.create(StreamMonstersBattleMatchService.prototype);
    service.rulesVersion = 8;
    service.localeCount = 1;
    service.secondsPerLocale = 5;

    service.setLanguageTiming({ localeCount: 1, secondsPerLocale: 5 });
    expect(service.actionWindowMs({ rulesVersion: 8 })).toBe(4_000);

    service.setLanguageTiming({ localeCount: 2, secondsPerLocale: 5 });
    expect(service.actionWindowMs({ rulesVersion: 8 })).toBe(4_000);
  });

  test('sanitizes and publishes overlay language config through the creator API contract', () => {
    const routes = new StreamMonstersRoutes({
      api: {},
      pluginDir,
      store: {},
      engine: {},
      configProvider: {}
    });

    expect(routes.sanitizeConfigUpdate({
      overlayLanguage: {
        primaryLocale: 'fr',
        locales: ['fr', 'fr', 'de', 'it'],
        secondsPerLocale: 4
      }
    })).toEqual(expect.objectContaining({
      overlayLanguage: {
        primaryLocale: 'fr',
        locales: ['fr', 'de'],
        secondsPerLocale: 4
      }
    }));

    expect(routes.publicConfig({})).toEqual(expect.objectContaining({
      overlayLanguage: {
        primaryLocale: 'de',
        locales: ['de', 'en'],
        secondsPerLocale: 5
      }
    }));
  });
});

describe('Stream Monsters 1.11 overlay-local resolver', () => {
  test('loads each selected locale once and falls back to the primary locale without raw keys', async () => {
    const catalogs = {
      de: { ready: 'Bereit', onlyPrimary: 'Nur Deutsch' },
      en: { ready: 'Ready' }
    };
    const loadLocale = jest.fn(async locale => catalogs[locale]);
    const resolver = overlayRuntime.createOverlayLocaleResolver({
      config: {
        primaryLocale: 'de',
        locales: ['de', 'en'],
        secondsPerLocale: 5
      },
      loadLocale
    });

    await Promise.all([resolver.ready(), resolver.ready()]);

    expect(resolver.translate('ready', {}, 'en')).toBe('Ready');
    expect(resolver.translate('onlyPrimary', {}, 'en')).toBe('Nur Deutsch');
    expect(resolver.translate('missing.key', {}, 'en')).toBe('');
    expect(loadLocale).toHaveBeenCalledTimes(2);
  });

  test('builds sequential critical pages and reports an unshown translation for early action', () => {
    const config = overlayRuntime.normalizeOverlayLanguage({
      primaryLocale: 'de',
      locales: ['de', 'en'],
      secondsPerLocale: 5
    });

    expect(overlayRuntime.criticalLocalePages(config)).toEqual([
      { locale: 'de', durationMs: 5_000 },
      { locale: 'en', durationMs: 5_000 }
    ]);
    expect(overlayRuntime.pendingCriticalLocales(config, ['de'])).toEqual(['en']);
    expect(overlayRuntime.pendingCriticalLocales(config, ['de', 'en'])).toEqual([]);
  });

  test('selects noncritical event languages deterministically from stable event IDs', () => {
    const config = {
      primaryLocale: 'de',
      locales: ['de', 'en'],
      secondsPerLocale: 5
    };

    expect(overlayRuntime.localeForStableEvent('event-a', config)).toBe('de');
    expect(overlayRuntime.localeForStableEvent('event-b', config)).toBe('en');
    expect(overlayRuntime.localeForStableEvent('event-a', config)).toBe('de');
  });
});

describe('Stream Monsters 1.11 creator command usability', () => {
  test('builds four command groups with prefix, aliases, conflicts, filter truth, cooldowns, and outcomes', () => {
    const groups = creatorRuntime.buildCommandGroups({
      gcce: {
        commandPrefix: '/',
        commandReferences: { eggs: '/eier' },
        commandPolicies: {
          eggs: {
            enabledAliases: ['eier', 'eierliste'],
            registeredAliases: ['eier'],
            userCooldownMs: 1_000,
            globalCooldownMs: 250
          }
        },
        registrationConflicts: ['eierliste'],
        tiktokFilter: {
          status: 'not_probeable',
          probeable: false,
          recommendation: 'use_custom_aliases'
        }
      },
      commandAliases: {
        eggs: {
          enabled: ['eier', 'eierliste'],
          disabled: ['eggs']
        }
      }
    });

    expect(groups.map(group => group.id)).toEqual([
      'eggs',
      'collection',
      'arena',
      'progress'
    ]);
    expect(groups[0].commands[0]).toEqual(expect.objectContaining({
      command: 'eggs',
      prefix: '/',
      reference: '/eier',
      primaryAlias: 'eier',
      enabledAliases: ['eier', 'eierliste'],
      disabledAliases: ['eggs'],
      gcceConflict: true,
      tiktokFilterStatus: 'not_probeable',
      tiktokFilterProbeable: false,
      userCooldownMs: 1_000,
      globalCooldownMs: 250,
      outcomeKey: 'commandOutcomeEggs'
    }));
  });

  test('persists the language controls and renders grouped command diagnostics without global switching', () => {
    const html = fs.readFileSync(
      path.join(pluginDir, 'streammonsters-ui.html'),
      'utf8'
    );
    const overlay = fs.readFileSync(
      path.join(pluginDir, 'streammonsters-overlay.html'),
      'utf8'
    );

    for (const id of [
      'overlayPrimaryLocale',
      'overlayLocaleDe',
      'overlayLocaleEn',
      'overlayLocaleEs',
      'overlayLocaleFr',
      'overlaySecondsPerLocale'
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('buildCommandGroups');
    expect(overlay).toContain('createOverlayLocaleResolver');
    expect(overlay).not.toMatch(/\.(?:changeLanguage|setLanguage)\s*\(/);
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'ships complete language and command-group copy in %s',
    locale => {
      const catalog = JSON.parse(fs.readFileSync(
        path.join(pluginDir, 'locales', `${locale}.json`),
        'utf8'
      )).plugins.streamalchemy.ui.monsters;
      for (const key of [
        'overlayLanguagesTitle',
        'overlayLanguagesCopy',
        'overlayPrimaryLocale',
        'overlayActiveLocales',
        'overlaySecondsPerLocale',
        'commandGroupEggs',
        'commandGroupCollection',
        'commandGroupArena',
        'commandGroupProgress',
        'commandPrimaryAlias',
        'commandAliasesLabel',
        'commandGcceConflict',
        'commandTikTokFilter',
        'commandCooldowns',
        'commandOutcome',
        'commandOutcomeEggs',
        'commandOutcomeBattle'
      ]) {
        expect(catalog[key]).toEqual(expect.any(String));
        expect(catalog[key].trim()).not.toBe('');
      }
    }
  );

  test.each(['de', 'en', 'es', 'fr'])(
    'identifies the eligible player and monster in the %s stat prompt',
    locale => {
      const catalog = JSON.parse(fs.readFileSync(
        path.join(pluginDir, 'locales', `${locale}.json`),
        'utf8'
      )).plugins.streamalchemy.ui.monsters;
      const overlay = fs.readFileSync(
        path.join(pluginDir, 'streammonsters-overlay.html'),
        'utf8'
      );
      const promptSource = overlay.slice(
        overlay.indexOf("if (type === 'stat_choice_opened'"),
        overlay.indexOf("if (type === 'monster_stat_chosen'")
      );

      expect(catalog.monsterStatTitle).toContain('{player}');
      expect(catalog.monsterStatTitle).toContain('{monster}');
      expect(promptSource).toContain('player:publicDisplayName(data)');
      expect(promptSource).toContain('monster:itemName(data?.monster)');
      expect(promptSource).toContain('imageUrl:itemImageUrl(data?.monster)');
      expect(overlay).toContain(
        'displayName:data?.displayName || data?.playerName'
      );
    }
  );
});

describe('Stream Monsters 1.11 live arena locale transitions', () => {
  test('rerenders the complete visible choice page from German to English', () => {
    const html = fs.readFileSync(
      path.join(pluginDir, 'streammonsters-overlay.html'),
      'utf8'
    );
    const dom = new JSDOM(html);
    let locale = 'de';
    const catalogs = Object.fromEntries(['de', 'en'].map(language => [
      language,
      JSON.parse(fs.readFileSync(
        path.join(pluginDir, 'locales', `${language}.json`),
        'utf8'
      )).plugins.streamalchemy.ui.monsters
    ]));
    const localize = (key, params = {}) => String(
      catalogs[locale][key] || ''
    ).replace(/\{(\w+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : match
    ));
    const view = ArenaView.createArenaView({
      document:dom.window.document,
      clock:{ now:() => 1_000 },
      localize,
      choiceKeys:{
        A:'skillAttack',
        B:'skillDefense',
        C:'skillSpecial'
      },
      labelKeys:{
        monster:'arenaMonsterLabel',
        level:'arenaLevelLabel',
        round:'arenaRoundLabel',
        roster:'arenaRosterChoice',
        skill:'arenaSkillFallback',
        evaded:'arenaEvaded',
        knockout:'arenaKnockout',
        winner:'arenaWinnerLabel',
        viewer:'arenaViewerLabel',
        battleEnded:'arenaBattleEnded',
        cancelledRoster:'arenaCancelledRoster',
        cancelled:'arenaCancelled',
        shield:'arenaShieldLabel',
        special:'arenaSpecialLabel'
      }
    });
    const fighters = [1, 2].map(slot => ({
      slot,
      name:slot === 1 ? 'Ashfang' : 'Ripple',
      viewerName:slot === 1 ? '@alpha' : '@beta',
      level:5,
      hp:48,
      maxHp:52,
      shield:4,
      charge:50,
      skills:[{
        choice:'A',
        icon:'🔥',
        name:'RAW BACKEND ATTACK',
        nameKey:'skillNameAshfangAStage1',
        shortText:'RAW BACKEND EFFECT',
        shortTextKey:'skillEffectAshfangAStage1',
        available:true
      }]
    }));

    view.applyMatch({
      matchId:'locale-match',
      state:'action',
      roundNumber:2,
      fighters
    });
    view.openChoice({
      matchId:'locale-match',
      round:2,
      choices:['A', 'B', 'C'],
      fighters
    });

    const text = selector => dom.window.document.querySelector(selector).textContent;
    expect(text('#arena-round')).toBe('Runde 2');
    expect(text('#arena-skill-prompt')).toContain('A Angriff');
    expect(text('[data-skill-deck="1"] [data-skill="A"] .skill-name'))
      .toBe('Ashfang: Flammenzahn');
    expect(text('[data-skill-deck="1"] [data-skill="A"] .skill-copy'))
      .toBe('Verursacht Schaden und hinterlässt Brand für die nächste Runde.');
    expect(text('#arena-shield-label-1')).toBe('Schild');

    locale = 'en';
    view.setLocale('en');

    expect(text('#arena-round')).toBe('Round 2');
    expect(text('#arena-skill-prompt')).toContain('A Attack');
    expect(text('[data-skill-deck="1"] [data-skill="A"] .skill-name'))
      .toBe('Ashfang: Flamefang');
    expect(text('[data-skill-deck="1"] [data-skill="A"] .skill-copy'))
      .toBe('Deals damage and leaves Burn for the next round.');
    expect(text('#arena-shield-label-1')).toBe('Shield');
    expect(dom.window.document.body.textContent).not.toContain('RAW BACKEND');
    dom.window.close();
  });
});
