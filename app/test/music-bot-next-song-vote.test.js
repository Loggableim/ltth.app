const NextSongVote = require('../plugins/music-bot/lib/next-song-vote');

describe('Music Bot next-song voting', () => {
  test('keeps one replaceable vote per viewer and gives candidate one ties by radio score order', () => {
    let now = Date.UTC(2026, 6, 21, 12, 0, 0);
    const vote = new NextSongVote({ now: () => now });
    vote.open([
      { id: 'catalog:1', title: 'First' },
      { id: 'catalog:2', title: 'Second' }
    ], now + 10000);

    expect(vote.cast('Alice', 2)).toMatchObject({ accepted: true, replaced: false });
    expect(vote.cast('alice', 1)).toMatchObject({ accepted: true, replaced: true });
    expect(vote.cast('Bob', 2)).toMatchObject({ accepted: true });
    expect(vote.getStatus()).toMatchObject({ status: 'open', votes: { 1: 1, 2: 1 } });

    now += 10000;
    expect(vote.close('timer')).toMatchObject({
      status: 'closed',
      winner: expect.objectContaining({ id: 'catalog:1' }),
      votes: { 1: 1, 2: 1 }
    });
    expect(vote.cast('Cara', 2)).toMatchObject({ accepted: false, reason: 'closed' });
  });

  test('cancels an open vote without producing a winner when a viewer request enters the queue', () => {
    const now = Date.UTC(2026, 6, 21, 12, 0, 0);
    const vote = new NextSongVote({ now: () => now });
    vote.open([{ id: 'first' }, { id: 'second' }], now + 10000);

    expect(vote.cancel('viewer-request')).toEqual(expect.objectContaining({
      status: 'cancelled', reason: 'viewer-request', winner: null
    }));
  });
});
