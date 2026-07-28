'use strict';

const {
  StableOverlayUrlError,
  buildStableOverlayUrl,
  selectStableOverlayUsername
} = require('../modules/stable-overlay-url');
const {
  listPublicEntrypoints
} = require('../modules/public-overlay-registry');

describe('stable overlay URL construction', () => {
  test('converts every registered local overlay entrypoint', () => {
    const entrypoints = listPublicEntrypoints().map(pathname => (
      pathname === '/overlay/spotlight/:type'
        ? '/overlay/spotlight/gift'
        : pathname
    ));

    for (const pathname of entrypoints) {
      expect(buildStableOverlayUrl(
        `http://127.0.0.1:3000${pathname}`,
        '@Example.Creator',
        { locationHref: 'http://127.0.0.1:3000/plugins/goals/ui' }
      )).toBe(`https://overlay.ltth.app/example.creator${pathname}`);
    }
  });

  test('preserves the registered pathname, query string, and fragment exactly', () => {
    expect(buildStableOverlayUrl(
      'http://localhost:3000/goals/overlay?id=goal%2F7&label=a+b#scene%202',
      'creator_name',
      { locationHref: 'http://127.0.0.1:3000/' }
    )).toBe(
      'https://overlay.ltth.app/creator_name/goals/overlay?id=goal%2F7&label=a+b#scene%202'
    );
  });

  test.each([
    'http://127.0.0.1:3000/dashboard.html',
    'http://127.0.0.1:3000/plugins/goals/ui.html',
    'http://127.0.0.1:3000/api/settings',
    'http://127.0.0.1:3000/goals/unknown',
    'http://127.0.0.1:3001/goals/overlay',
    'http://192.168.1.25:3000/goals/overlay',
    'https://vdo.ninja/?director=room-7',
    'https://example.com/goals/overlay',
    'http://user:pass@127.0.0.1:3000/goals/overlay',
    'file:///goals/overlay'
  ])('rejects non-registry or unauthorized target %s', rawUrl => {
    expect(() => buildStableOverlayUrl(
      rawUrl,
      'creator',
      { locationHref: 'http://127.0.0.1:3000/' }
    )).toThrow(StableOverlayUrlError);
  });

  test.each([
    '',
    '@',
    'a',
    'a'.repeat(25),
    'two words',
    'name/other',
    'name%2fother',
    'name\\other',
    '.',
    '..',
    'name..other',
    'na\u0000me',
    'ümlaut'
  ])('rejects malformed username candidate %j', username => {
    expect(() => buildStableOverlayUrl(
      'http://127.0.0.1:3000/goals/overlay',
      username,
      { locationHref: 'http://127.0.0.1:3000/' }
    )).toThrow(StableOverlayUrlError);
  });
});

describe('stable overlay username selection', () => {
  const claims = [
    { username: 'connected.creator', state: 'active' },
    { username: 'default_creator', state: 'active' },
    { username: 'cooling_down', state: 'cooldown' }
  ];

  test('prefers the connected TikTok name when it is an active claim', () => {
    expect(selectStableOverlayUsername({
      connectedUsername: '@Connected.Creator',
      defaultUsername: 'default_creator',
      claims
    })).toBe('connected.creator');
  });

  test('falls back to the selected active default claim', () => {
    expect(selectStableOverlayUsername({
      connectedUsername: 'someone_else',
      defaultUsername: '@Default_Creator',
      claims
    })).toBe('default_creator');
  });

  test.each([
    {
      connectedUsername: 'someone_else',
      defaultUsername: 'cooling_down'
    },
    {
      connectedUsername: null,
      defaultUsername: null
    },
    {
      connectedUsername: 'bad/name',
      defaultUsername: 'bad/name'
    }
  ])('returns no selection when no candidate owns an active claim', candidates => {
    expect(selectStableOverlayUsername({
      ...candidates,
      claims
    })).toBeNull();
  });
});
