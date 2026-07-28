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

  test('never promotes a persisted numeric or platform-like identity to hatch owner text', () => {
    const store = {
      getViewerDisplayName: jest.fn()
        .mockReturnValueOnce('7392847109283746102')
        .mockReturnValueOnce('tiktok:7392847109283746102')
    };
    const projector = new StreamMonstersPublicEventProjector({ store });
    const numeric = projector.project('streammonsters:egg_hatched', {
      userId: 'tiktok:7392847109283746102',
      displayName: '7392847109283746102',
      egg: { display_name: '7392847109283746102', element: 'ember' },
      monster: { name: 'Flare', element: 'ember' }
    });
    const platformLike = projector.project('streammonsters:egg_hatched', {
      userId: 'tiktok:7392847109283746102',
      egg: { element: 'ember' },
      monster: { name: 'Flare', element: 'ember' }
    });

    expect(numeric.displayName).toBe('Viewer');
    expect(numeric.owner.initials).toBe('V');
    expect(platformLike.displayName).toBe('Viewer');
    expect(JSON.stringify([numeric, platformLike])).not.toContain('7392847109283746102');
  });

  test('rejects @-prefixed numeric and platform-like hatch owner candidates', () => {
    const store = {
      getViewerDisplayName: jest.fn()
        .mockReturnValueOnce('@7392847109283746102')
        .mockReturnValueOnce('@tiktok:7392847109283746102')
    };
    const projector = new StreamMonstersPublicEventProjector({ store });
    const direct = projector.project('streammonsters:egg_hatched', {
      userId: 'tiktok:7392847109283746102',
      displayName: '@7392847109283746102',
      egg: { display_name: '@7392847109283746102', element: 'ember' },
      monster: { name: 'Flare', element: 'ember' }
    });
    const stored = projector.project('streammonsters:egg_hatched', {
      userId: 'tiktok:7392847109283746102',
      egg: { element: 'ember' },
      monster: { name: 'Flare', element: 'ember' }
    });

    expect(direct.displayName).toBe('Viewer');
    expect(stored.displayName).toBe('Viewer');
    expect(JSON.stringify([direct, stored])).not.toContain('7392847109283746102');
  });

  test('database display lookup rejects numeric current ids and aliases', () => {
    const database = new Database(':memory:');
    const store = new StreamMonstersDatabase(database);
    store.initialize();
    database.prepare(`
      INSERT INTO streammonsters_viewer_identities (
        platform_user_id, canonical_user_id, current_unique_id, updated_at_ms
      ) VALUES (?, ?, ?, ?)
    `).run(
      '7392847109283746102',
      'tiktok:7392847109283746102',
      '7392847109283746102',
      10
    );
    database.prepare(`
      INSERT INTO streammonsters_viewer_aliases (
        alias_id, canonical_user_id, updated_at_ms
      ) VALUES (?, ?, ?)
    `).run(
      'known_viewer',
      'tiktok:7392847109283746102',
      10
    );
    database.prepare(`
      INSERT INTO streammonsters_viewer_aliases (
        alias_id, canonical_user_id, updated_at_ms
      ) VALUES (?, ?, ?)
    `).run(
      '8392847109283746103',
      'tiktok:7392847109283746102',
      20
    );

    expect(store.getViewerDisplayName('tiktok:7392847109283746102'))
      .toBe('known_viewer');
  });

  test('database display lookup rejects @-prefixed numeric current ids and aliases', () => {
    const database = new Database(':memory:');
    const store = new StreamMonstersDatabase(database);
    store.initialize();
    database.prepare(`
      INSERT INTO streammonsters_viewer_identities (
        platform_user_id, canonical_user_id, current_unique_id, updated_at_ms
      ) VALUES (?, ?, ?, ?)
    `).run(
      '7392847109283746102',
      'tiktok:7392847109283746102',
      '@7392847109283746102',
      10
    );
    database.prepare(`
      INSERT INTO streammonsters_viewer_aliases (
        alias_id, canonical_user_id, updated_at_ms
      ) VALUES (?, ?, ?)
    `).run(
      'known_viewer',
      'tiktok:7392847109283746102',
      10
    );
    database.prepare(`
      INSERT INTO streammonsters_viewer_aliases (
        alias_id, canonical_user_id, updated_at_ms
      ) VALUES (?, ?, ?)
    `).run(
      '@8392847109283746103',
      'tiktok:7392847109283746102',
      20
    );

    expect(store.getViewerDisplayName('tiktok:7392847109283746102'))
      .toBe('known_viewer');
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

    const arrayBuffer = jest.fn(async () => Uint8Array.from([1, 2, 3, 4]).buffer);
    const read = jest.fn()
      .mockResolvedValueOnce({ done: false, value: Uint8Array.from([1, 2, 3, 4]) })
      .mockResolvedValueOnce({ done: true });
    const fetchImpl = jest.fn(async () => ({
      status: 200,
      headers: new Headers({
        'content-type': 'image/webp',
        'content-length': '4'
      }),
      body: {
        getReader: () => ({
          read,
          cancel: jest.fn(async () => {}),
          releaseLock: jest.fn()
        })
      },
      arrayBuffer
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
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  test('stops reading a chunked avatar as soon as decompressed bytes exceed 2 MiB', async () => {
    const mebibyte = 1024 * 1024;
    const read = jest.fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(mebibyte) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(mebibyte + 1) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array([9]) });
    const cancel = jest.fn(async () => {});
    const arrayBuffer = jest.fn(async () => new ArrayBuffer((3 * mebibyte) + 1));
    let signal = null;
    const fetchImpl = jest.fn(async (_url, options) => {
      signal = options.signal;
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'image/webp' }),
        body: {
          getReader: () => ({ read, cancel })
        },
        arrayBuffer
      };
    });

    await expect(fetchAvatar(
      'https://p16-sign-va.tiktokcdn.com/chunked.webp',
      { fetchImpl }
    )).rejects.toThrow('STREAM_MONSTERS_AVATAR_TOO_LARGE');
    expect(read).toHaveBeenCalledTimes(2);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(signal.aborted).toBe(true);
  });
});
