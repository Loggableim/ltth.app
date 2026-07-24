'use strict';

const {
  HATCH_PRESETS,
  VISUAL_PACKS,
  buildConfigPayload,
  buildDexSlots,
  eggReadinessCounts,
  normalizeDemoRequest
} = require('../plugins/streamalchemy/streammonsters-creator-runtime');

describe('Stream Monsters creator controls', () => {
  test('offers exactly six hatch durations, three visual packs and preserves mapping customization', () => {
    expect(HATCH_PRESETS).toEqual([30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000]);
    expect(VISUAL_PACKS).toEqual(['furry', 'art_lab', 'kenney']);
    expect(buildConfigPayload({
      currentConfig: { giftMappingCustomized: true },
      values: {
        creatorName: 'Creator',
        artPoolTarget: '4',
        hatchDurationMs: '300000',
        visualPack: 'art_lab',
        landscapeAnchor: 'middle-right',
        landscapeScale: '110',
        portraitAnchor: 'center',
        portraitScale: '90'
      }
    })).toEqual({
      creatorName: 'Creator',
      artPoolTarget: 4,
      hatchDurationMs: 300_000,
      visualPack: 'art_lab',
      landscapeAnchor: 'middle-right',
      landscapeScale: 110,
      portraitAnchor: 'center',
      portraitScale: 90,
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
