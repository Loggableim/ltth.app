'use strict';

const {
  COMMAND_ACTIONS,
  CREATOR_SECTIONS,
  DEMO_SCENES,
  HATCH_PRESETS,
  EGG_EXPIRY_PRESETS,
  REPAIR_ACTIONS,
  RENDERER_QUALITIES,
  SEASON_DURATIONS,
  buildAliasDiagnostics,
  buildAssetStageEntries,
  buildCommandDiagnostics,
  buildConfigPayload,
  buildCreatorLiveView,
  buildDexSlots,
  buildRepairRequest,
  eggReadinessCounts,
  leaderboardDisplayName,
  liveStatusTranslationKey,
  normalizeDemoRequest,
  previewGeometry,
  resolveCommandReference,
  summarizeRepairResult,
  summarizeAssetLibrary
} = require('../plugins/streamalchemy/streammonsters-creator-runtime');

describe('Stream Monsters creator controls', () => {
  test('defines the six League World Hybrid creator areas and complete command/demo catalogs', () => {
    expect(CREATOR_SECTIONS.map(section => section.id)).toEqual([
      'live-center',
      'gameplay',
      'gifts-chat',
      'overlay-studio',
      'asset-library',
      'community-seasons'
    ]);
    expect(COMMAND_ACTIONS).toEqual([
      'eggs',
      'hatch',
      'inventory',
      'monsters',
      'monster',
      'choose',
      'evolve',
      'battle',
      'leavebattle',
      'rank',
      'quests',
      'monstershelp'
    ]);
    expect(DEMO_SCENES).toEqual([
      'spawn',
      'ready',
      'hatch',
      'collection',
      'evolution',
      'match',
      'skill',
      'multihit',
      'special',
      'ko',
      'xp',
      'rankup',
      'attack',
      'defense'
    ]);
  });

  test('offers Rules v5 presets, canonical Furry and preserves mapping customization', () => {
    expect(HATCH_PRESETS).toEqual([30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000]);
    expect(EGG_EXPIRY_PRESETS).toEqual([21_600_000, 43_200_000, 86_400_000, 172_800_000]);
    expect(SEASON_DURATIONS).toEqual([7, 14, 28, 60, 90]);
    expect(RENDERER_QUALITIES).toEqual(['auto', 'high', 'medium', 'low']);
    expect(buildConfigPayload({
      currentConfig: { giftMappingCustomized: true },
      values: {
        creatorName: 'Creator',
        hatchDurationMs: '300000',
        eggExpiryMs: '86400000',
        seasonDurationDays: '60',
        visualPack: 'art_lab',
        landscapeAnchor: 'middle-right',
        landscapeScale: '110',
        portraitAnchor: 'center',
        portraitScale: '90',
        rendererQuality: 'low',
        notificationDurationMs: 12_000,
        commandAliases: { eggs: { enabled: ['eier'], disabled: ['eggs'] } },
        audioChannels: { master: { enabled: true, volume: 0.8 } }
      }
    })).toEqual({
      creatorName: 'Creator',
      hatchDurationMs: 300_000,
      eggExpiryMs: 86_400_000,
      seasonDurationDays: 60,
      visualPack: 'furry',
      layouts: {
        landscape: { anchor: 'middle-right', scale: 110 },
        portrait: { anchor: 'center', scale: 90 }
      },
      rendererQuality: 'low',
      notificationDurationMs: 12_000,
      commandAliases: { eggs: { enabled: ['eier'], disabled: ['eggs'] } },
      audioChannels: { master: { enabled: true, volume: 0.8 } },
      giftMappingCustomized: true
    });
  });

  test('formats command cooldown diagnostics and localizable live states', () => {
    expect(buildCommandDiagnostics({
      commandPrefix: '!',
      commandReferences: { eggs: '!eier', battle: '!battle' },
      commandPolicies: {
        eggs: {
          enabledAliases: ['eier'],
          registeredAliases: ['eier'],
          userCooldownMs: 1000,
          globalCooldownMs: 250
        },
        battle: {
          enabledAliases: ['battle'],
          registeredAliases: ['battle'],
          userCooldownMs: 2000,
          globalCooldownMs: 0
        }
      }
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        command: 'eggs',
        reference: '!eier',
        enabled: true,
        userCooldownMs: 1000,
        globalCooldownMs: 250
      }),
      expect.objectContaining({
        command: 'battle',
        reference: '!battle',
        enabled: true,
        userCooldownMs: 2000,
        globalCooldownMs: 0
      })
    ]));
    expect(liveStatusTranslationKey('connected')).toBe('statusConnected');
    expect(liveStatusTranslationKey('active_partial')).toBe('statusActivePartial');
    expect(liveStatusTranslationKey('roster')).toBe('statusRoster');
    expect(liveStatusTranslationKey('webgpu · 59 FPS')).toBe('');
  });

  test('builds a complete 24-slot Dex from the real points/unlocks mastery payload', () => {
    const templates = Array.from({ length: 24 }, (_, index) => ({
      templateId: `monster-${index}`,
      name: `Monster ${index}`,
      element: index < 4 ? 'Ember' : 'Tide',
      owned: index === 0,
      silhouette: index !== 0,
      mastery: index === 0 ? { points: 17, unlocks: ['title'] } : null
    }));
    const slots = buildDexSlots({
      templates,
      essence: [{ element: 'Ember', amount: 5, unlocks: ['aura'] }],
      cosmetics: ['season_badge:offline']
    });

    expect(slots).toHaveLength(24);
    expect(slots[0]).toEqual(expect.objectContaining({
      locked: false,
      firstFound: true,
      masteryLevel: 1,
      masteryPoints: 17,
      masteryNextThreshold: 25,
      masteryProgressLabel: '17/25',
      masteryUnlocks: ['title'],
      essence: 5,
      cosmetic: true
    }));
    expect(buildDexSlots({
      templates: [{ ...templates[0], mastery: { points: 75, unlocks: ['title', 'trail', 'frame'] } }]
    })[0]).toEqual(expect.objectContaining({
      masteryLevel: 3,
      masteryPoints: 75,
      masteryNextThreshold: null,
      masteryProgressLabel: '50/50'
    }));
    expect(slots[1]).toEqual(expect.objectContaining({ locked: true }));
  });

  test('reflects real incubating, queued and ready egg counts plus effective duration', () => {
    expect(eggReadinessCounts({
      eggCounts: { incubating: 2, queued: 5, ready: 3 },
      effectiveHatchDurationMs: 120_000
    })).toEqual({ active: 2, queued: 5, ready: 3, durationMs: 120_000 });
  });

  test('requires a successful preview and explicit confirmation before a repair execute request', () => {
    expect(REPAIR_ACTIONS).toEqual({
      eggs: {
        route: '/api/streammonsters/repair/eggs',
        confirmation: 'reconcile_eggs'
      },
      matches: {
        route: '/api/streammonsters/repair/matches',
        confirmation: 'cancel_stale_matches'
      }
    });
    expect(buildRepairRequest('eggs')).toEqual({
      url: '/api/streammonsters/repair/eggs',
      body: { dryRun: true }
    });
    expect(() => buildRepairRequest('eggs', {
      execute: true,
      previewed: false,
      confirmed: true
    })).toThrow('STREAM_MONSTERS_REPAIR_PREVIEW_REQUIRED');
    expect(() => buildRepairRequest('matches', {
      execute: true,
      previewed: true,
      confirmed: false
    })).toThrow('STREAM_MONSTERS_REPAIR_CONFIRMATION_REQUIRED');
    expect(buildRepairRequest('matches', {
      execute: true,
      previewed: true,
      confirmed: true
    })).toEqual({
      url: '/api/streammonsters/repair/matches',
      body: {
        dryRun: false,
        confirm: 'cancel_stale_matches'
      }
    });
  });

  test('reduces repair responses to aggregate counts without retaining IDs or arbitrary server fields', () => {
    const eggSummary = summarizeRepairResult('eggs', {
      success: true,
      dryRun: true,
      before: { readyDue: 2, expiryDue: 1, queued: 4 },
      repaired: 0,
      viewerId: 'private-viewer',
      matchId: 'private-match'
    });
    expect(eggSummary).toEqual({
      kind: 'eggs',
      dryRun: true,
      candidates: 3,
      repaired: 0,
      readyDue: 2,
      expiryDue: 1,
      queued: 4
    });
    expect(JSON.stringify(eggSummary)).not.toMatch(/private-viewer|private-match/);

    const matchSummary = summarizeRepairResult('matches', {
      success: true,
      dryRun: false,
      candidates: 3,
      cancelled: 2,
      matches: [{ matchId: 'private-match' }]
    });
    expect(matchSummary).toEqual({
      kind: 'matches',
      dryRun: false,
      candidates: 3,
      repaired: 2
    });
    expect(JSON.stringify(matchSummary)).not.toContain('private-match');
  });

  test('builds full or targeted demo payloads without inventing fields', () => {
    expect(normalizeDemoRequest({ scene: 'full' })).toBeNull();
    expect(normalizeDemoRequest({
      scene: 'special',
      templateId: 'selene',
      layout: 'portrait',
      anchor: 'top-center',
      scale: '115'
    })).toEqual({
      scene: 'special',
      templateId: 'selene',
      layout: 'portrait',
      anchor: 'top-center',
      scale: 115
    });
  });

  test('finds enabled alias collisions without flagging disabled language variants', () => {
    expect(buildAliasDiagnostics({
      eggs: { enabled: ['eier', 'eggs'], disabled: ['huevos'] },
      hatch: { enabled: ['schlupf', 'eggs'], disabled: ['eclosion'] },
      battle: { enabled: ['kampf'], disabled: ['eggs'] }
    }, {
      registrationConflicts: ['rank'],
      unavailableCommands: ['quests']
    })).toEqual({
      conflicts: [{ alias: 'eggs', commands: ['eggs', 'hatch'] }],
      registrationConflicts: ['rank'],
      unavailableCommands: ['quests'],
      healthy: false
    });
  });

  test('renders the privacy-projected leaderboard name and never an empty identity', () => {
    expect(leaderboardDisplayName({
      displayName: '  CollectorHero  ',
      user_id: 'legacy-private-id'
    })).toBe('CollectorHero');
    expect(leaderboardDisplayName({
      display_name: 'ArenaMaster'
    })).toBe('ArenaMaster');
    expect(leaderboardDisplayName({
      user_id: 'legacy-viewer'
    })).toBe('legacy-viewer');
    expect(leaderboardDisplayName({ displayName: '\u0000\u0007  ' }))
      .toBe('Viewer');
    expect(leaderboardDisplayName({})).toBe('Viewer');
  });

  test('resolves only enabled command references and never invents a disabled default', () => {
    expect(resolveCommandReference('eggs', {
      gcce: {
        commandPrefix: '/',
        commandReferences: { eggs: '/eier' },
        registrationState: 'active',
        registeredCommands: ['eier']
      },
      commandAliases: {
        eggs: { enabled: ['meineeier'], disabled: ['eggs'] }
      }
    })).toBe('/eier');
    expect(resolveCommandReference('eggs', {
      gcce: {
        commandPrefix: '/',
        registrationState: 'active',
        registeredCommands: ['eier']
      },
      commandAliases: {
        eggs: { enabled: ['meineeier', 'eier'], disabled: ['eggs'] }
      }
    })).toBe('/eier');
    expect(resolveCommandReference('eggs', {
      gcce: {
        commandPrefix: '/',
        registrationState: 'fallback',
        registeredCommands: []
      },
      commandAliases: {
        eggs: { enabled: ['meineeier'], disabled: ['eggs'] }
      }
    })).toBe('/meineeier');
    expect(resolveCommandReference('eggs', {
      gcce: {
        commandPrefix: '/',
        registrationState: 'active',
        registeredCommands: []
      },
      commandAliases: {
        eggs: { enabled: [], disabled: ['eier', 'eggs'] }
      }
    })).toBe('');
  });

  test('derives a privacy-safe live center view with countdown and warnings', () => {
    expect(buildCreatorLiveView({
      status: { isConnected: true, username: 'creator', restarting: false },
      state: {
        config: {
          enabled: true,
          rendererQuality: 'high',
          audioChannels: { master: { enabled: false, volume: 0.7 } }
        },
        eggCounts: { incubating: 2, queued: 4, ready: 1 },
        hype: { points: 75 },
        gcce: {
          commandPrefix: '/',
          registrationState: 'active',
          commandsRegistered: true,
          registrationConflicts: ['rank']
        },
        battle: {
          matches: [{ phase: 'skill_selection', deadlineMs: 15_000 }]
        },
        obs: { status: 'connected' },
        audioRuntime: { muted: true, status: 'connected' },
        renderer: {
          backend: 'webgpu',
          fps: 59,
          fallbackReason: null
        }
      },
      now: 12_250
    })).toEqual({
      tiktok: 'connected',
      plugin: 'enabled',
      gcce: 'active',
      obs: 'connected',
      prefix: '/',
      queue: 4,
      hype: 75,
      battlePhase: 'skill_selection',
      countdownMs: 2_750,
      renderer: 'webgpu · 59 FPS',
      audio: 'muted',
      warnings: ['alias_conflicts']
    });
  });

  test('derives roster and action countdowns from the public battle snapshot fields', () => {
    expect(buildCreatorLiveView({
      state: {
        battle: {
          matches: [{ state: 'roster', rosterDeadlineMs: 20_000 }]
        }
      },
      now: 15_000
    }).countdownMs).toBe(5_000);
    expect(buildCreatorLiveView({
      state: {
        battle: {
          matches: [{ state: 'action', actionDeadlineMs: 23_000 }]
        }
      },
      now: 15_000
    }).countdownMs).toBe(8_000);
  });

  test('reserves exactly the lower 26 percent for chat in both preview formats', () => {
    expect(previewGeometry('portrait')).toEqual({
      width: 1080,
      height: 1920,
      gameplayPercent: 74,
      chatPercent: 26
    });
    expect(previewGeometry('landscape')).toEqual({
      width: 1920,
      height: 1080,
      gameplayPercent: 74,
      chatPercent: 26
    });
  });

  test('summarizes all 72 bundled forms and exposes Kenney only as emergency fallback', () => {
    expect(summarizeAssetLibrary({
      templates: Array.from({ length: 24 }, (_, index) => ({
        templateId: `monster-${index}`,
        stages: [
          { stage: 1, integrity: 'ok' },
          { stage: 2, integrity: 'ok' },
          { stage: 3, integrity: index === 23 ? 'missing' : 'ok' }
        ]
      }))
    })).toEqual({
      templates: 24,
      expectedForms: 72,
      healthyForms: 71,
      damagedForms: 1,
      integrity: 'degraded',
      fallback: 'kenney_emergency_only'
    });
  });

  test('builds a stable 72-card asset library from safe manifest fields', () => {
    const assets = Array.from({ length: 24 }, (_, templateIndex) => (
      [1, 2, 3].map(stage => ({
        templateId: `monster-${templateIndex}`,
        name: `Monster ${templateIndex}`,
        element: 'Ember',
        species: 'Wolf',
        stage,
        assetPath: stage === 1
          ? `assets/streammonsters/furry/monster-${templateIndex}.png`
          : `assets/streammonsters/furry/evolution/ember/monster-${templateIndex}-stage${stage}.png`,
        dimensions: [1024, 1024],
        sha256: String(templateIndex * 3 + stage).padStart(64, 'a')
      }))
    )).flat();
    const entries = buildAssetStageEntries({ assets });

    expect(entries).toHaveLength(72);
    expect(entries[0]).toEqual({
      templateId: 'monster-0',
      name: 'Monster 0',
      element: 'Ember',
      species: 'Wolf',
      stage: 1,
      assetUrl: '/plugins/streamalchemy/assets/streammonsters/furry/monster-0.png',
      healthy: true
    });
    expect(entries.at(-1)).toEqual(expect.objectContaining({
      templateId: 'monster-23',
      stage: 3,
      healthy: true
    }));
  });
});
