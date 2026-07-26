'use strict';

const {
  HATCH_PRESETS,
  EGG_EXPIRY_PRESETS,
  RENDERER_QUALITIES,
  SEASON_DURATIONS,
  buildConfigPayload,
  buildDexSlots,
  eggReadinessCounts,
  normalizeDemoRequest
} = require('../plugins/streamalchemy/streammonsters-creator-runtime');

describe('Stream Monsters creator controls', () => {
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
});
