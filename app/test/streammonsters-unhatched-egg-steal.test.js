'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/stream-monsters/backend/streammonsters/database'
);

let UnhatchedEggStealService = null;
try {
  UnhatchedEggStealService = require(
    '../plugins/stream-monsters/backend/streammonsters/unhatched-egg-steal-service'
  );
} catch {
  // The first RED run proves the standalone service does not exist yet.
}

function createReadyEgg(store, {
  eggId = 'ready-egg',
  userId = 'owner-a',
  readyAtMs = 1_000,
  expiresAtMs = 1_000_000,
  displayName = 'Owner A'
} = {}) {
  return store.createEgg({
    eggId,
    userId,
    giftId: 77,
    giftName: 'Team Heart',
    element: 'Ember',
    eggColor: '#ff6600',
    seed: `seed-${eggId}`,
    state: 'ready',
    createdAtMs: 100,
    hatchDurationMs: 100_000,
    readyAtMs,
    expiresAtMs,
    imageUrl: '/plugins/streamalchemy/assets/eggs/ember-standard.png',
    variant: 'standard',
    visualSource: 'egg_asset',
    visualKey: 'egg:ember:standard',
    provenance: 'gift',
    displayName
  });
}

function createSubject({ nowMs = 1_000, emit = () => {}, isViewerActive = () => false } = {}) {
  expect(UnhatchedEggStealService).toEqual(expect.any(Function));
  let currentNowMs = nowMs;
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  const service = new UnhatchedEggStealService({
    store,
    now: () => currentNowMs,
    emit,
    isViewerActive,
    config: {
      unhatchedEggStealEnabled: true,
      unhatchedEggStealGraceSeconds: 600,
      unhatchedEggStealActivityWindowSeconds: 300
    }
  });
  return {
    sqlite,
    store,
    service,
    setNow(value) {
      currentNowMs = value;
    }
  };
}

describe('Stream Monsters unhatched egg steals', () => {
  test('publishes an inactive ready egg only after its configured grace', () => {
    const subject = createSubject();
    try {
      createReadyEgg(subject.store);
      subject.service.observeReadyEgg('ready-egg');

      subject.setNow(600_999);
      expect(subject.service.sweep({ isViewerActive: () => false }).published).toEqual([]);

      subject.setNow(601_000);
      expect(subject.service.sweep({ isViewerActive: () => false }).published).toHaveLength(1);
      expect(subject.service.listPublic()).toEqual([
        expect.objectContaining({
          offerType: 'steal',
          sourceOwnerDisplayName: 'Owner A',
          state: 'public',
          adoptable: true
        })
      ]);
      expect(subject.service.listPublic()[0]).not.toHaveProperty('stealId');
    } finally {
      subject.sqlite.close();
    }
  });

  test('keeps a ready egg private while its owner is active before the hard deadline', () => {
    const subject = createSubject();
    try {
      createReadyEgg(subject.store);
      subject.service.observeReadyEgg('ready-egg');
      subject.setNow(601_000);

      expect(subject.service.sweep({ isViewerActive: () => true }).published).toEqual([]);
      expect(subject.service.listPublic()).toEqual([]);
    } finally {
      subject.sqlite.close();
    }
  });

  test('makes an unhatched egg public and claimable no later than 15 minutes after ready', () => {
    const subject = createSubject({ isViewerActive: () => true });
    try {
      createReadyEgg(subject.store);
      subject.service.observeReadyEgg('ready-egg');

      subject.setNow(900_999);
      expect(subject.service.sweep({ isViewerActive: () => true }).published).toEqual([]);

      subject.setNow(901_000);
      expect(subject.service.sweep({ isViewerActive: () => true }).published).toHaveLength(1);
      expect(subject.service.steal({
        userId: 'thief-a',
        eventId: 'claim-at-hard-deadline',
        nowMs: 901_000
      })).toEqual(expect.objectContaining({ success: true, status: 'claimed' }));
      expect(subject.store.getEgg('ready-egg').user_id).toBe('thief-a');
    } finally {
      subject.sqlite.close();
    }
  });

  test('caps the configured steal grace at the 15-minute hard deadline', () => {
    expect(UnhatchedEggStealService.normalizeGraceSeconds(901)).toBe(900);
    expect(UnhatchedEggStealService.normalizeGraceSeconds(86_400)).toBe(900);

  });
  test('transfers a public steal egg once and never to its original owner', () => {
    const subject = createSubject();
    try {
      createReadyEgg(subject.store);
      subject.service.observeReadyEgg('ready-egg');
      subject.setNow(601_000);
      subject.service.sweep({ isViewerActive: () => false });

      expect(subject.service.steal({
        userId: 'owner-a',
        eventId: 'owner-cannot-steal',
        nowMs: 601_000
      })).toEqual(expect.objectContaining({
        success: false,
        status: 'no_steal'
      }));
      expect(subject.service.steal({
        userId: 'thief-a',
        eventId: 'thief-claim',
        nowMs: 601_000
      })).toEqual(expect.objectContaining({
        success: true,
        status: 'claimed',
        adoptionSource: 'steal'
      }));
      expect(subject.store.getEgg('ready-egg').user_id).toBe('thief-a');
      expect(subject.service.steal({
        userId: 'thief-b',
        eventId: 'later-claim',
        nowMs: 601_000
      })).toEqual(expect.objectContaining({
        success: false,
        status: 'no_steal'
      }));
    } finally {
      subject.sqlite.close();
    }
  });

  test('starts a fresh owner grace after a ready egg is stolen', () => {
    const subject = createSubject({
      isViewerActive: userId => userId === 'thief-a'
    });
    try {
      createReadyEgg(subject.store, { expiresAtMs: 3_000_000 });
      subject.service.observeReadyEgg('ready-egg');
      subject.setNow(601_000);
      subject.service.sweep({ isViewerActive: () => false });

      expect(subject.service.steal({
        userId: 'thief-a',
        eventId: 'first-claim',
        nowMs: 601_000
      })).toEqual(expect.objectContaining({ success: true, status: 'claimed' }));
      expect(subject.service.getStealForEgg('ready-egg')).toEqual(expect.objectContaining({
        status: 'pending',
        original_owner_id: 'thief-a',
        eligible_at_ms: 1_201_000
      }));

      subject.setNow(1_500_999);
      expect(subject.service.sweep().published).toEqual([]);

      subject.setNow(1_501_000);
      expect(subject.service.sweep().published).toHaveLength(1);
      expect(subject.service.steal({
        userId: 'thief-b',
        eventId: 'second-claim',
        nowMs: 1_501_000
      })).toEqual(expect.objectContaining({ success: true, status: 'claimed' }));
    } finally {
      subject.sqlite.close();
    }
  });

  test('requeues a legacy claimed ready egg from its claim timestamp', () => {
    const subject = createSubject();
    try {
      createReadyEgg(subject.store);
      subject.service.observeReadyEgg('ready-egg');
      subject.store.db.prepare(`
        UPDATE streammonsters_eggs
        SET user_id = ?, display_name = ?
        WHERE egg_id = ?
      `).run('thief-a', 'Thief A', 'ready-egg');
      subject.store.db.prepare(`
        UPDATE streammonsters_unhatched_egg_steals
        SET status = 'claimed', claimed_by_user_id = ?, claimed_at_ms = ?
        WHERE egg_id = ?
      `).run('thief-a', 601_000, 'ready-egg');

      subject.service.initialize();

      expect(subject.service.getStealForEgg('ready-egg')).toEqual(expect.objectContaining({
        status: 'pending',
        original_owner_id: 'thief-a',
        observed_at_ms: 601_000,
        eligible_at_ms: 1_201_000
      }));
    } finally {
      subject.sqlite.close();

    }
  });
  test('allows exactly one claimant when competing events arrive at the same instant', () => {
    const subject = createSubject();
    try {
      createReadyEgg(subject.store);
      subject.service.observeReadyEgg('ready-egg');
      subject.setNow(601_000);
      subject.service.sweep({ isViewerActive: () => false });

      const claims = ['thief-a', 'thief-b'].map(userId => subject.service.steal({
        userId,
        eventId: `${userId}-simultaneous-claim`,
        nowMs: 601_000
      }));

      expect(claims.filter(claim => claim.success)).toHaveLength(1);
      expect(claims.filter(claim => !claim.success)).toEqual([
        expect.objectContaining({ status: 'no_steal' })
      ]);
      expect(['thief-a', 'thief-b']).toContain(subject.store.getEgg('ready-egg').user_id);
    } finally {
      subject.sqlite.close();
    }
  });

  test('does not transfer a published egg while its original owner is active again', () => {
    let ownerIsActive = false;
    const subject = createSubject({
      isViewerActive: userId => userId === 'owner-a' && ownerIsActive
    });
    try {
      createReadyEgg(subject.store);
      subject.service.observeReadyEgg('ready-egg');
      subject.setNow(601_000);
      subject.service.sweep({ isViewerActive: () => false });
      ownerIsActive = true;

      expect(subject.service.steal({
        userId: 'thief-a',
        eventId: 'owner-returned',
        nowMs: 601_000
      })).toEqual({ success: false, status: 'owner_active' });
      expect(subject.store.getEgg('ready-egg').user_id).toBe('owner-a');
    } finally {
      subject.sqlite.close();
    }
  });

  test('removes a public steal offer from the overlay when the creator disables steals', () => {
    const emitted = [];
    const subject = createSubject({
      emit: (event, payload) => emitted.push({ event, payload })
    });
    try {
      createReadyEgg(subject.store);
      subject.service.observeReadyEgg('ready-egg');
      subject.setNow(601_000);
      subject.service.sweep({ isViewerActive: () => false });
      expect(subject.service.listPublic()).toHaveLength(1);

      subject.service.setConfig({
        unhatchedEggStealEnabled: false,
        unhatchedEggStealGraceSeconds: 600,
        unhatchedEggStealActivityWindowSeconds: 300
      }, 602_000);

      expect(subject.service.listPublic()).toEqual([]);
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          event: 'streammonsters:egg_stage_removed',
          payload: expect.objectContaining({ reason: 'steal_disabled' })
        })
      ]));
    } finally {
      subject.sqlite.close();
    }
  });
});
