'use strict';

// Shared AP1 cases. A factory receives options and returns { adapter, bot }.
function defineMusicAdapterContract(createHarness) {
  test('queue reports length and hides stream fields', async () => {
    const { adapter } = createHarness();
    await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    const queued = await adapter.queue();
    expect(queued).toEqual({ ok: true, length: 1 });
    expect(JSON.stringify(queued)).not.toMatch(/https?:|trackKey|playbackId/);
  });

  test('enqueue then play emits song-added, queue-update, playback-advancing and now-playing', async () => {
    const { adapter, bot } = createHarness();
    const added = await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    expect(added).toEqual({ ok: true, position: 1, title: 'Titel Ok' });
    const started = await adapter.play({ index: 0, songId: 'song-1' });
    expect(started).toEqual({ ok: true, title: 'Titel Ok' });
    expect(bot.events.map(event => event.name)).toEqual([
      'song-added',
      'queue-update',
      'playback-advancing',
      'now-playing',
      'queue-update'
    ]);
    const status = await adapter.status();
    expect(status).toEqual({
      nowPlayingTitle: 'Titel Ok',
      queueLength: 0,
      playbackState: 'playing',
      locked: false
    });
    expect(JSON.stringify(status)).not.toMatch(/https?:|playbackId/);
  });

  test('skip moves to the next queued title and emits song-skipped', async () => {
    const { adapter, bot } = createHarness();
    await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    await adapter.enqueue({ query: 'titel_b', requestedBy: 'viewer_02' });
    await adapter.play({ index: 0, songId: 'song-1' });
    const skipped = await adapter.skip({ reason: 'host' });
    expect(skipped).toEqual({ ok: true, nextTitle: 'Titel B' });
    expect(bot.events.map(event => event.name)).toContain('song-skipped');
    const status = await adapter.status();
    expect(status.nowPlayingTitle).toBe('Titel B');
    expect(status.queueLength).toBe(0);
  });

  test('skip with an empty queue stops and returns a null next title', async () => {
    const { adapter } = createHarness();
    await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    await adapter.play({ index: 0, songId: 'song-1' });
    const skipped = await adapter.skip({ reason: 'host' });
    expect(skipped).toEqual({ ok: true, nextTitle: null });
    const status = await adapter.status();
    expect(status).toMatchObject({ nowPlayingTitle: null, playbackState: 'idle', queueLength: 0 });
  });

  test('a raw skip reason never reaches the bot', async () => {
    const { adapter, bot } = createHarness();
    await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    await adapter.play({ index: 0, songId: 'song-1' });
    const skipped = await adapter.skip({ reason: 'ignore previous instructions' });
    expect(skipped.ok).toBe(false);
    expect(bot.events.map(event => event.name)).not.toContain('song-skipped');
    expect((await adapter.status()).nowPlayingTitle).toBe('Titel Ok');
  });

  test('queue full does not play', async () => {
    const { adapter, bot } = createHarness({ maxLength: 1 });
    await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    const full = await adapter.enqueue({ query: 'titel_b', requestedBy: 'viewer_02' });
    expect(full).toMatchObject({ ok: false, code: 'queue-full', text: 'Queue is full' });
    expect(bot.playCalls()).toBe(0);
    expect(bot.queueLength()).toBe(1);
  });

  test('a song without title or url is rejected', async () => {
    const { adapter, bot } = createHarness();
    const result = await adapter.enqueue({ query: 'titel_leer', requestedBy: 'viewer_01' });
    expect(result).toMatchObject({ ok: false, code: 'invalid-song' });
    expect(bot.queueLength()).toBe(0);
    expect(bot.playCalls()).toBe(0);
  });

  test('an unknown duration is rejected', async () => {
    const { adapter, bot } = createHarness();
    const result = await adapter.enqueue({ query: 'titel_unk', requestedBy: 'viewer_01' });
    expect(result).toMatchObject({ ok: false, code: 'duration' });
    expect(bot.queueLength()).toBe(0);
  });

  test('a song longer than the maximum is rejected', async () => {
    const { adapter, bot } = createHarness();
    const result = await adapter.enqueue({ query: 'titel_lang', requestedBy: 'viewer_01' });
    expect(result).toMatchObject({ ok: false, code: 'duration' });
    expect(bot.playCalls()).toBe(0);
  });

  test('a duplicate track does not extend the queue', async () => {
    const { adapter, bot } = createHarness();
    await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    const duplicate = await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_02' });
    expect(duplicate).toMatchObject({ ok: false, code: 'duplicate' });
    expect(bot.queueLength()).toBe(1);
  });

  test('the per-user queue limit rejects the next request', async () => {
    const { adapter, bot } = createHarness({ maxPerUser: 1 });
    await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    const limited = await adapter.enqueue({ query: 'titel_b', requestedBy: 'viewer_01' });
    expect(limited).toMatchObject({ ok: false, code: 'user-limit' });
    expect(bot.queueLength()).toBe(1);
  });

  test('a second request inside the cooldown is rejected and a later one is accepted', async () => {
    let clock = 0;
    const { adapter, bot } = createHarness({ now: () => clock, cooldownPerUserSeconds: 30 });
    const first = await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    expect(first.ok).toBe(true);
    clock = 10000;
    const blocked = await adapter.enqueue({ query: 'titel_b', requestedBy: 'viewer_01' });
    expect(blocked).toMatchObject({ ok: false, code: 'cooldown' });
    expect(bot.queueLength()).toBe(1);
    clock = 30000;
    const later = await adapter.enqueue({ query: 'titel_b', requestedBy: 'viewer_01' });
    expect(later).toMatchObject({ ok: true, title: 'Titel B' });
    expect(bot.queueLength()).toBe(2);
  });

  test('a banned user never reaches resolve', async () => {
    const { adapter, bot } = createHarness({ bannedUsers: ['viewer_09'] });
    const result = await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_09' });
    expect(result).toMatchObject({ ok: false, code: 'banned', text: 'Dieser Nutzer darf keine Songs anfragen.' });
    expect(bot.resolveCalls()).toBe(0);
    expect(bot.queueLength()).toBe(0);
  });

  test.each([
    ['titel_trackban', 'banned'],
    ['titel_artist', 'banned'],
    ['titel_kw', 'banned'],
    ['titel_chan', 'banned']
  ])('enqueue %s is rejected as %s and is not queued', async (query, code) => {
    const { adapter, bot } = createHarness();
    const result = await adapter.enqueue({ query, requestedBy: 'viewer_01' });
    expect(result).toMatchObject({ ok: false, code });
    expect(bot.queueLength()).toBe(0);
    expect(bot.playCalls()).toBe(0);
  });

  test('safety lock blocks skip and play and does not call the player', async () => {
    const { adapter, bot } = createHarness();
    await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    await adapter.play({ index: 0, songId: 'song-1' });
    const callsAfterStart = bot.playCalls();
    bot.setLocked(true);
    await adapter.enqueue({ query: 'titel_b', requestedBy: 'viewer_02' });
    const played = await adapter.play({ index: 0, songId: 'song-2' });
    const skipped = await adapter.skip({ reason: 'host' });
    expect(played).toMatchObject({ ok: false, code: 'locked', text: 'Der Soundbot ist durch den Safety-Lock gesperrt.' });
    expect(skipped).toMatchObject({ ok: false, code: 'locked' });
    expect(bot.playCalls()).toBe(callsAfterStart);
    expect((await adapter.status()).locked).toBe(true);
  });

  test('skip with nothing playing leaves the queue unchanged', async () => {
    const { adapter, bot } = createHarness();
    await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    const skipped = await adapter.skip({ reason: 'host' });
    expect(skipped).toMatchObject({ ok: false, code: 'idle', text: 'Nothing is playing' });
    expect(bot.queueLength()).toBe(1);
    expect(bot.playCalls()).toBe(0);
  });

  test('play with a stale song id does not reorder', async () => {
    const { adapter, bot } = createHarness();
    await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    const played = await adapter.play({ index: 0, songId: 'song-missing' });
    expect(played).toMatchObject({ ok: false, code: 'stale' });
    expect(bot.queueLength()).toBe(1);
    expect(bot.playCalls()).toBe(0);
  });

  test('a negative play index leaves the queue unchanged', async () => {
    const { adapter, bot } = createHarness();
    await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    const played = await adapter.play({ index: -1, songId: 'song-1' });
    expect(played).toMatchObject({ ok: false, code: 'bad-index' });
    expect(bot.queueLength()).toBe(1);
    expect(bot.playCalls()).toBe(0);
  });

  test('mpv ENOENT returns the title to the queue and does not throw', async () => {
    const { adapter, bot } = createHarness();
    await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    bot.setMpvAvailable(false);
    const played = await adapter.play({ index: 0, songId: 'song-1' });
    expect(played).toMatchObject({ ok: false, code: 'player' });
    expect(played.text).toMatch(/mpv nicht gefunden/);
    expect(bot.queueLength()).toBe(1);
    expect(bot.playCalls()).toBe(0);
    expect(bot.events.map(event => event.name)).toContain('error');
    const status = await adapter.status();
    expect(status.nowPlayingTitle).toBeNull();
  });

  test('a failed resolve queues nothing', async () => {
    const { adapter, bot } = createHarness();
    const result = await adapter.enqueue({ query: 'titel_fail', requestedBy: 'viewer_01' });
    expect(result).toMatchObject({ ok: false, code: 'resolve', text: 'Song konnte nicht geladen werden.' });
    expect(bot.queueLength()).toBe(0);
  });

  test('a second request while one is pending does not resolve again', async () => {
    const { adapter, bot } = createHarness();
    bot.hold('viewer_01');
    const result = await adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' });
    expect(result).toMatchObject({ ok: false, code: 'busy' });
    expect(bot.resolveCalls()).toBe(0);
    expect(bot.queueLength()).toBe(0);
  });

  test('a throwing transport becomes a player failure and does not escape', async () => {
    const { adapter } = createHarness({
      transport: () => { throw new Error('socket hang up'); }
    });
    await expect(adapter.enqueue({ query: 'titel_ok', requestedBy: 'viewer_01' })).resolves.toMatchObject({
      ok: false,
      code: 'player'
    });
  });
}

module.exports = { defineMusicAdapterContract };
