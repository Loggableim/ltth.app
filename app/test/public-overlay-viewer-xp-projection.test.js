'use strict';

const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');
const { isIncomingSocketEventAllowed, isOutgoingSocketEventAllowed } = require('../modules/public-overlay-registry');

const AVATAR_URL = 'https://p16-common-sign.tiktokcdn-eu.com/avatar.webp';
const PRIVATE_CANARY = 'viewer-xp-private-canary';

describe('Viewer-XP public DTO projections', () => {
  test('keeps only the explicitly approved profile display fields', () => {
    expect(projectPublicOverlayPayload('viewer-xp:public-profile', {
      username: 'Public Viewer', name_color: '#12abef', title: 'Supporter', level: 8,
      xp_progress: 45, xp_for_next_level: 100, xp_progress_percent: 45, profilePictureUrl: AVATAR_URL,
      user_id: PRIVATE_CANARY, coin_balance: 7654, total_xp_earned: 9876,
      settings: { private: PRIVATE_CANARY }, apiKey: PRIVATE_CANARY
    })).toEqual({
      username: 'Public Viewer', name_color: '#12abef', title: 'Supporter', level: 8,
      xp_progress: 45, xp_for_next_level: 100, xp_progress_percent: 45, profilePictureUrl: AVATAR_URL
    });
    expect(projectPublicOverlayPayload('viewer-xp:public-profile', {
      username: 'Public Viewer', profilePictureUrl: 'https://user:secret@p16.tiktokcdn.com/avatar.webp'
    }).profilePictureUrl).toBeNull();
  });

  test('projects only display values for XP updates and level-up announcements', () => {
    expect(projectPublicOverlayPayload('viewer-xp:public-update', {
      username: 'Public Viewer', amount: 15, eventType: 'gift', userId: PRIVATE_CANARY,
      profile: {
        username: 'Public Viewer', name_color: '#abc', title: 'Supporter', level: 9,
        xp_progress: 10, xp_for_next_level: 120, xp_progress_percent: 8, profilePictureUrl: null,
        user_id: PRIVATE_CANARY, settings: PRIVATE_CANARY
      }, metadata: { token: PRIVATE_CANARY }
    })).toEqual({
      username: 'Public Viewer', amount: 15,
      profile: {
        username: 'Public Viewer', name_color: '#abc', title: 'Supporter', level: 9,
        xp_progress: 10, xp_for_next_level: 120, xp_progress_percent: 8, profilePictureUrl: null
      }
    });
    expect(projectPublicOverlayPayload('viewer-xp:public-level-up', {
      username: 'Public Viewer', oldLevel: 8, newLevel: 9,
      rewards: { title: 'Champion', name_color: '#123456', announcement_message: PRIVATE_CANARY, coin_reward: 99 },
      user_id: PRIVATE_CANARY, settings: PRIVATE_CANARY
    })).toEqual({
      username: 'Public Viewer', oldLevel: 8, newLevel: 9,
      rewards: { title: 'Champion', name_color: '#123456' }
    });
    expect(projectPublicOverlayPayload('viewer-xp:public-update', { username: 'Public Viewer', amount: 1 })).toBeNull();
  });

  test('bounds leaderboard DTOs and derives rank from position', () => {
    expect(projectPublicOverlayPayload('viewer-xp:public-leaderboard', [{
      username: 'Public Viewer', name_color: '#123', title: 'Supporter', level: 8,
      xp: 450, rank: 99, xp_period: 450, total_xp_earned: 8000,
      user_id: PRIVATE_CANARY, coins: 9000, profilePictureUrl: AVATAR_URL
    }])).toEqual([{
      username: 'Public Viewer', name_color: '#123', title: 'Supporter', level: 8,
      xp: 450, rank: 1, xp_period: 450
    }]);
    expect(projectPublicOverlayPayload('viewer-xp:public-leaderboard', Array.from({ length: 51 }, () => ({})))).toBeNull();
  });

  test('keeps the existing exact Viewer-XP event allowlist and rejects raw/admin names', () => {
    expect(isIncomingSocketEventAllowed('viewer-xp:public-profile:request')).toBe(true);
    expect(isIncomingSocketEventAllowed('viewer-xp:public-leaderboard:request')).toBe(true);
    for (const eventName of [
      'viewer-xp:public-profile', 'viewer-xp:public-update',
      'viewer-xp:public-level-up', 'viewer-xp:public-leaderboard'
    ]) expect(isOutgoingSocketEventAllowed(eventName)).toBe(true);
    for (const eventName of ['viewer-xp:profile', 'viewer-xp:update', 'viewer-xp:get-profile', 'viewer-xp:delete-profile']) {
      expect(isIncomingSocketEventAllowed(eventName)).toBe(false);
      expect(isOutgoingSocketEventAllowed(eventName)).toBe(false);
    }
  });
});
