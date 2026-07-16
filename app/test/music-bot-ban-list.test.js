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
});
