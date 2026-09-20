'use strict';

const {
  createCachedAvatarFetcher
} = require('../plugins/stream-monsters/backend/streammonsters/avatar-proxy');

function imageResponse(byte = 1) {
  return {
    status: 200,
    ok: true,
    headers: new Headers({ 'content-type': 'image/webp', 'content-length': '1' }),
    body: {
      getReader: () => ({
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: Uint8Array.from([byte]) })
          .mockResolvedValueOnce({ done: true }),
        releaseLock: jest.fn()
      })
    }
  };
}

describe('Stream Monsters avatar cache', () => {
  test('coalesces, caps to four downloads, and expires bounded LRU entries', async () => {
    let nowMs = 0;
    const pending = [];
    const fetchImpl = jest.fn(() => new Promise(resolve => pending.push(resolve)));
    const getAvatar = createCachedAvatarFetcher({
      fetchImpl,
      now: () => nowMs,
      ttlMs: 100,
      maxEntries: 2,
      maxConcurrent: 4
    });
    const urls = ['a', 'b', 'c', 'd', 'e'].map(name => (
      `https://p16-sign-va.tiktokcdn.com/${name}.webp`
    ));
    const requests = [getAvatar(urls[0]), getAvatar(urls[0]), ...urls.slice(1).map(getAvatar)];

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    pending.splice(0, 4).forEach((resolve, index) => resolve(imageResponse(index)));
    await new Promise(resolve => setImmediate(resolve));
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    pending.splice(0).forEach(resolve => resolve(imageResponse(5)));
    await Promise.all(requests);

    const evicted = getAvatar(urls[0]);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    pending.splice(0).forEach(resolve => resolve(imageResponse(6)));
    await evicted;
    nowMs = 101;
    const expired = getAvatar(urls[4]);
    expect(fetchImpl).toHaveBeenCalledTimes(7);
    pending.splice(0).forEach(resolve => resolve(imageResponse(7)));
    await expired;
  });
  test('rejects unique requests beyond the bounded in-flight queue', async () => {
    const pending = [];
    const getAvatar = createCachedAvatarFetcher({
      fetchImpl: jest.fn(() => new Promise(resolve => pending.push(resolve))),
      maxConcurrent: 1,
      maxPending: 1
    });
    const base = 'https://p16-sign-va.tiktokcdn.com/';
    const active = getAvatar(`${base}active.webp`);
    const queued = getAvatar(`${base}queued.webp`);
    await expect(getAvatar(`${base}overflow.webp`)).rejects.toMatchObject({
      code: 'STREAM_MONSTERS_AVATAR_OVERLOADED'
    });
    pending.splice(0).forEach(resolve => resolve(imageResponse()));
    await new Promise(resolve => setImmediate(resolve));
    pending.splice(0).forEach(resolve => resolve(imageResponse()));
    await Promise.all([active, queued]);
  });
});
