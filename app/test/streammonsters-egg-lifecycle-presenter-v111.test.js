'use strict';

const EggStageView = require(
  '../plugins/streamalchemy/streammonsters-egg-stage-view'
);
const EggStageProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/egg-stage-projector'
);
const PublicEventProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/public-event-projector'
);
const fs = require('fs');
const path = require('path');

describe('Stream Monsters 1.11 egg lifecycle cards', () => {
  const commands = {
    adopt: '!adopt',
    eggs: '!eier',
    hatch: '!hatch',
    monsters: '!monster'
  };

  const card = (type, payload = {}, nowMs = 10_000) => (
    EggStageView.buildLifecycleNotice(type, payload, { commands, nowMs })
  );

  test('gift landings explicitly say that the egg is already owned', () => {
    const eggStage = new EggStageProjector().projectEgg({
      egg_id: 'gift-contract',
      user_id: 'viewer-contract',
      provenance: 'gift',
      element: 'Volt',
      state: 'incubating',
      display_name: 'Luna',
      ready_at_ms: 100_000
    });
    expect(card('egg_landed', {
      eggStage
    })).toMatchObject({
      kind: 'gift_owned',
      viewer: 'Luna',
      titleKey: 'eggLifecycleGiftOwnedTitle',
      copyKey: 'eggLifecycleGiftOwnedCopy',
      placement: 'upper-third',
      durationMs: 12_000,
      commands: ['!eier']
    });
  });

  test('free offers distinguish reservation, public release, and claim', () => {
    expect(card('free_egg_reserved', {
      eggStage: {
        visualId: 'free-1',
        provenance: 'free',
        state: 'reserved',
        adoptionStatus: 'reserved',
        displayName: '@mira',
        timing: { publicAtMs: 70_000 }
      }
    })).toMatchObject({
      kind: 'free_reserved',
      viewer: '@mira',
      commands: ['!adopt'],
      durationMs: 12_000
    });

    expect(card('free_egg_public', {
      eggStage: {
        visualId: 'free-1',
        provenance: 'free',
        state: 'public',
        adoptionStatus: 'public',
        adoptable: true,
        displayName: 'Mira',
        timing: { expiresAtMs: 90_000 }
      }
    })).toMatchObject({
      kind: 'free_public',
      commands: ['!adopt'],
      durationMs: 12_000
    });

    expect(card('free_egg_claimed', {
      eggStage: {
        visualId: 'free-1',
        provenance: 'free',
        state: 'claimed',
        displayName: 'Nova'
      }
    })).toMatchObject({
      kind: 'free_claimed',
      viewer: 'Nova',
      commands: ['!eier']
    });
  });

  test('derives NEXT from egg state instead of advertising an unavailable hatch', () => {
    expect(card('egg_landed', {
      eggStage: {
        visualId: 'gift-ready',
        provenance: 'gift',
        ownershipState: 'owned',
        state: 'ready',
        displayName: 'Luna'
      }
    })).toMatchObject({
      kind: 'gift_owned',
      commands: ['!hatch']
    });
    expect(card('free_egg_claimed', {
      eggStage: {
        visualId: 'free-queued',
        provenance: 'free',
        state: 'queued',
        queuePosition: 2,
        displayName: 'Nova'
      }
    })).toMatchObject({
      kind: 'free_claimed',
      queuePosition: 2,
      commands: ['!eier']
    });
  });

  test('an unready hatch shows exact time and queue position', () => {
    expect(card('hatch_not_ready', {
      egg: {
        visualId: 'queued-1',
        state: 'queued',
        queuePosition: 4,
        displayName: 'Kris',
        timing: { readyAtMs: 133_456 }
      },
      remainingMs: 123_456
    })).toMatchObject({
      kind: 'hatch_wait',
      viewer: 'Kris',
      remaining: '02:04',
      queuePosition: 4,
      params: expect.objectContaining({
        time: '02:04',
        position: 4
      }),
      commands: ['!eier']
    });
  });

  test('ready, auto-hatch, and expiry use distinct readable cards', () => {
    expect(card('egg_ready', {
      eggStage: {
        visualId: 'egg-ready',
        state: 'ready',
        displayName: 'Kris'
      }
    })).toMatchObject({
      kind: 'ready',
      commands: ['!hatch'],
      durationMs: 12_000
    });
    expect(card('egg_auto_hatched', {
      eggStage: {
        visualId: 'egg-auto',
        state: 'hatched',
        displayName: 'Kris'
      },
      monster: { name: 'Ashfang' }
    })).toMatchObject({
      kind: 'auto_hatched',
      params: expect.objectContaining({ monster: 'Ashfang' }),
      commands: ['!monster']
    });
    const projectedAutoHatch = new PublicEventProjector().project(
      'streammonsters:egg_hatched',
      {
        autoHatch: true,
        displayName: 'Kris',
        egg: {
          egg_id: 'private-auto-egg',
          state: 'hatched',
          element: 'Ember'
        },
        monster: {
          monster_id: 'private-auto-monster',
          name: 'Ashfang',
          element: 'Ember'
        }
      }
    );
    expect(projectedAutoHatch.egg.visualId).toBeUndefined();
    expect(EggStageView.buildHatchRevealNotice(projectedAutoHatch, {
      commands
    })).toMatchObject({
      automatic: true,
      titleKey: 'eggLifecycleAutoHatchedTitle',
      copyKey: 'eggLifecycleAutoHatchedCopy',
      params: expect.objectContaining({ monster: 'Ashfang' }),
      commands: ['!monster']
    });
    expect(EggStageView.buildHatchRevealNotice({
      ...projectedAutoHatch,
      autoHatch: false
    }, {
      commands
    })).toMatchObject({
      automatic: false,
      titleKey: 'hatchedTitle',
      copyKey: 'hatchedCopy',
      commands: ['!monster']
    });
    expect(card('egg_hatched', {
      autoHatch: true,
      egg: {
        visualId: 'egg-auto-real-event',
        state: 'hatched',
        displayName: 'Kris'
      },
      monster: { name: 'Ashfang' }
    })).toMatchObject({
      kind: 'auto_hatched',
      titleKey: 'eggLifecycleAutoHatchedTitle',
      params: expect.objectContaining({ monster: 'Ashfang' }),
      commands: ['!monster']
    });
    expect(card('egg_expired', {
      eggStage: {
        visualId: 'egg-old',
        state: 'expired',
        displayName: 'Kris'
      }
    })).toMatchObject({
      kind: 'expired',
      commands: ['!eier']
    });
  });

  test('deadline wins over the twelve-second minimum and identity is sanitized', () => {
    const notice = card('free_egg_reserved', {
      eggStage: {
        visualId: 'free-short',
        provenance: 'free',
        state: 'reserved',
        adoptionStatus: 'reserved',
        displayName: '938475938475',
        timing: { publicAtMs: 14_500 }
      }
    });
    expect(notice.durationMs).toBe(4_500);
    expect(notice.viewer).toBe('');
    expect(notice.commands).toHaveLength(1);
  });

  test('gift eggs can never produce adoption copy or commands', () => {
    const notice = card('free_egg_public', {
      eggStage: {
        visualId: 'gift-wrong-event',
        provenance: 'gift',
        ownershipState: 'owned',
        state: 'incubating',
        displayName: 'Luna'
      }
    });
    expect(notice).toBeNull();
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'ships every lifecycle card in %s',
    locale => {
      const translations = JSON.parse(fs.readFileSync(path.join(
        __dirname,
        '..',
        'plugins',
        'streamalchemy',
        'locales',
        `${locale}.json`
      ), 'utf8')).plugins.streamalchemy.ui.monsters;
      for (const key of [
        'eggLifecycleGiftOwnedTitle',
        'eggLifecycleGiftOwnedCopy',
        'eggLifecycleFreeReservedTitle',
        'eggLifecycleFreeReservedCopy',
        'eggLifecycleFreePublicTitle',
        'eggLifecycleFreePublicCopy',
        'eggLifecycleFreeClaimedTitle',
        'eggLifecycleFreeClaimedCopy',
        'eggLifecycleWaitTitle',
        'eggLifecycleWaitCopy',
        'eggLifecycleWaitQueuedCopy',
        'eggLifecycleReadyTitle',
        'eggLifecycleReadyCopy',
        'eggLifecycleAutoHatchedTitle',
        'eggLifecycleAutoHatchedCopy',
        'eggLifecycleExpiredTitle',
        'eggLifecycleExpiredCopy'
      ]) {
        expect(translations[key]).toEqual(expect.any(String));
        expect(translations[key].trim()).not.toBe('');
      }
    }
  );
});
