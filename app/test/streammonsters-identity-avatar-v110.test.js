'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const StreamMonstersPublicEventProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/public-event-projector'
);
const chatView = require('../plugins/streamalchemy/streammonsters-chat-view');
const {
  avatarProxyReference,
  fetchAvatar
} = require('../plugins/streamalchemy/backend/streammonsters/avatar-proxy');

describe('Stream Monsters 1.10 public owner identity and avatar security', () => {
  test('keeps the stored unique id when a later event contains only a numeric platform id', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const canonical = store.resolveViewerIdentity({
      platformUserId: '7392847109283746102',
      legacyUserId: 'real_viewer',
      updatedAtMs: 10
    });

    expect(store.resolveViewerIdentity({
      platformUserId: '7392847109283746102',
      legacyUserId: '7392847109283746102',
      updatedAtMs: 20
    })).toBe(canonical);
    expect(store.getViewerDisplayName(canonical)).toBe('real_viewer');
  });

  test('projects a permanent hatch owner as @username with proxy avatar and initials', () => {
    const store = {
      getViewerDisplayName: jest.fn(() => 'real_viewer')
    };
    const projector = new StreamMonstersPublicEventProjector({ store });
    const avatarUrl = avatarProxyReference(
      'https://p16-sign-va.tiktokcdn.com/tos-useast2a-avt-0068/test.webp'
    );

    const payload = projector.project('streammonsters:egg_hatched', {
      userId: 'tiktok:7392847109283746102',
      displayName: '7392847109283746102',
      egg: {
        element: 'ember',
        avatar_ref: avatarUrl
      },
      monster: { name: 'Flare', element: 'ember' }
    });

    expect(payload.displayName).toBe('@real_viewer');
    expect(payload.owner).toEqual({
      displayName: '@real_viewer',
      avatarUrl,
      initials: 'RV'
    });
    expect(JSON.stringify(payload)).not.toContain('7392847109283746102');
  });

  test('normalizes the hatch owner for an avatar image or initials fallback', () => {
    const avatarUrl = avatarProxyReference(
      'https://p16-sign-va.tiktokcdn.com/a.webp'
    );
    expect(chatView.normalizeOwner({
      displayName: '@real_viewer',
      avatarUrl,
      initials: 'RV'
    })).toEqual({
      displayName: '@real_viewer',
      avatarUrl,
      initials: 'RV'
    });
    expect(chatView.normalizeOwner({
      displayName: '@real_viewer',
      avatarUrl: 'https://attacker.invalid/a.png',
      initials: ''
    })).toEqual({
      displayName: '@real_viewer',
      avatarUrl: '',
      initials: 'RV'
    });
  });

  test('accepts only HTTPS TikTok avatar hosts and validates image responses', async () => {
    expect(avatarProxyReference('http://p16-sign-va.tiktokcdn.com/a.webp')).toBeNull();
    expect(avatarProxyReference('https://127.0.0.1/a.webp')).toBeNull();
    expect(avatarProxyReference('https://tiktokcdn.com.attacker.example/a.webp')).toBeNull();
    expect(avatarProxyReference('https://p16-sign-va.tiktokcdn.com/a.webp'))
      .toMatch(/^\/api\/streammonsters\/avatar\/[a-z0-9_-]{16,1024}$/i);

    const fetchImpl = jest.fn(async () => ({
      status: 200,
      headers: new Headers({
        'content-type': 'image/webp',
        'content-length': '4'
      }),
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer
    }));
    await expect(fetchAvatar(
      'https://p16-sign-va.tiktokcdn.com/a.webp',
      { fetchImpl }
    )).resolves.toEqual({
      body: Buffer.from([1, 2, 3, 4]),
      contentType: 'image/webp'
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://p16-sign-va.tiktokcdn.com/a.webp',
      expect.objectContaining({ redirect: 'manual' })
    );
  });
});
