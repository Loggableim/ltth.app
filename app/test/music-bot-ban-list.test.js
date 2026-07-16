const Database = require('better-sqlite3');
const BanList = require('../plugins/music-bot/lib/ban-list');

describe('music-bot ban list', () => {
  let db;
  let banList;

  beforeEach(() => {
    db = new Database(':memory:');
    banList = new BanList({
      getDatabase: () => db,
      log: jest.fn()
    });
  });

  afterEach(() => db.close());

  it('normalizes artist whitespace and case for exact matching without substrings', () => {
    const ban = banList.addBan('artist', '  Gzuz   &   Bonez  ', 'blocked', 'admin');

    expect(banList.isArtistBanned('gzuz & bonez')).toEqual({ banned: true, ban });
    expect(banList.isArtistBanned('GZUZ   & BONEZ')).toEqual({ banned: true, ban });
    expect(banList.isArtistBanned('Best of Gzuz & Bonez')).toEqual({ banned: false, ban: null });
  });

  it('inserts normalized duplicate artist bans idempotently and supports CRUD', () => {
    const first = banList.addBan('artist', 'K.I.Z', 'first', 'admin');
    const duplicate = banList.addBan('artist', '  k.i.z  ', 'second', 'other');

    expect(duplicate.id).toBe(first.id);
    expect(banList.getBansByType('artist')).toHaveLength(1);
    expect(banList.removeBan(first.id)).toEqual({ success: true });
    expect(banList.isArtistBanned('K.I.Z')).toEqual({ banned: false, ban: null });
  });

  it('rejects oversized artist ban values', () => {
    expect(() => banList.addBan('artist', 'x'.repeat(201))).toThrow(/too long/i);
  });

  it('stores canonical track bans idempotently and matches exact provider IDs', () => {
    const first = banList.addBan('track', ' YOUTUBE:AbC123xYz_- ');
    const duplicate = banList.addBan('track', 'youtube:AbC123xYz_-');

    expect(first.value).toBe('youtube:AbC123xYz_-');
    expect(duplicate.id).toBe(first.id);
    expect(banList.isTrackBanned('youtube:AbC123xYz_-')).toEqual({ banned: true, ban: first });
    expect(banList.isTrackBanned('youtube:abc123xyz_-')).toEqual({ banned: false, ban: null });
  });

  it('normalizes URL fallback track keys without substring matching', () => {
    const ban = banList.addBan(
      'track',
      'url:https://www.example.com/Music/Song/?utm_source=share'
    );

    expect(banList.isTrackBanned('url:https://example.com/Music/Song')).toEqual({ banned: true, ban });
    expect(banList.isTrackBanned('url:https://example.com/Music/Song/live')).toEqual({
      banned: false,
      ban: null
    });
  });
});
