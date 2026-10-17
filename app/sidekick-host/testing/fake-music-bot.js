'use strict';

// In-memory stand-in for the music-bot control routes.
// Not production code. Nothing here starts mpv, opens a socket, or reads a key.
const CATALOG = {
  titel_ok: { title: 'Titel Ok', url: 'https://example.invalid/ok', duration: 180, artist: 'Ada', channelName: 'Kanal Eins', trackKey: 'track-ok' },
  titel_b: { title: 'Titel B', url: 'https://example.invalid/b', duration: 120, artist: 'Bea', channelName: 'Kanal Zwei', trackKey: 'track-b' },
  titel_c: { title: 'Titel C', url: 'https://example.invalid/c', duration: 90, artist: 'Cleo', channelName: 'Kanal Drei', trackKey: 'track-c' },
  titel_lang: { title: 'Titel Lang', url: 'https://example.invalid/lang', duration: 9999, artist: 'Ada', channelName: 'Kanal Eins', trackKey: 'track-lang' },
  titel_unk: { title: 'Titel Unbekannt', url: 'https://example.invalid/unk', duration: 0, artist: 'Ada', channelName: 'Kanal Eins', trackKey: 'track-unk' },
  titel_leer: { title: '', url: '', duration: 30, artist: '', channelName: '', trackKey: '' },
  titel_trackban: { title: 'Titel Trackban', url: 'https://example.invalid/bt', duration: 100, artist: 'Ada', channelName: 'Kanal Eins', trackKey: 'banned-track' },
  titel_artist: { title: 'Titel Artist', url: 'https://example.invalid/ba', duration: 100, artist: 'Gesperrt', channelName: 'Kanal Eins', trackKey: 'track-artist' },
  titel_kw: { title: 'lied mit verboten', url: 'https://example.invalid/kw', duration: 100, artist: 'Ada', channelName: 'Kanal Eins', trackKey: 'track-kw' },
  titel_chan: { title: 'Titel Kanal', url: 'https://example.invalid/ch', duration: 100, artist: 'Ada', channelName: 'Kanal Gesperrt', trackKey: 'track-chan' }
};

function createFakeMusicBot(options = {}) {
  const now = options.now || (() => 0);
  const state = {
    maxLength: options.maxLength ?? 50,
    maxPerUser: options.maxPerUser ?? 3,
    maxSongDurationSeconds: options.maxSongDurationSeconds ?? 360,
    cooldownPerUserSeconds: options.cooldownPerUserSeconds ?? 30,
    locked: false,
    mpvAvailable: options.mpvAvailable !== false,
    queue: [],
    nowPlaying: null,
    playbackState: 'idle',
    lastRequest: new Map(),
    pending: new Set(),
    bans: {
      users: new Set(options.bannedUsers || []),
      tracks: new Set(options.bannedTracks || ['banned-track']),
      artists: new Set(options.bannedArtists || ['gesperrt']),
      keywords: options.bannedKeywords || ['verboten'],
      channels: new Set(options.bannedChannels || ['kanal gesperrt'])
    },
    events: [],
    playCalls: 0,
    resolveCalls: 0,
    nextId: 1
  };

  function emit(name, payload) {
    state.events.push({ name, payload });
  }

  function publicSong(song) {
    return { id: song.id, title: song.title, position: song.position };
  }

  function resolve(query) {
    state.resolveCalls += 1;
    if (query === 'titel_fail') {
      return { success: false, message: 'Song konnte nicht geladen werden.', messageKey: 'resolveFailed' };
    }
    const found = CATALOG[query];
    if (!found) {
      return { success: false, message: 'Song konnte nicht geladen werden.', messageKey: 'resolveFailed' };
    }
    return { success: true, song: { ...found } };
  }

  function reject(status, messageKey, error, extra = {}) {
    return { status, body: { success: false, messageKey, error, ...extra } };
  }

  function enqueue(body) {
    const username = String(body?.username || '');
    const query = String(body?.query || '');
    if (state.pending.has(username)) {
      return reject(400, 'requestPending', 'Dein vorheriger Request wird noch verarbeitet.');
    }
    if (state.bans.users.has(username.toLowerCase())) {
      return reject(400, 'requestUserBlocked', 'Dieser Nutzer darf keine Songs anfragen.');
    }
    const resolved = resolve(query);
    if (!resolved.success) {
      return reject(400, resolved.messageKey, resolved.message);
    }
    const song = resolved.song;
    if (!song.title || !song.url) {
      return reject(400, 'queueInvalidSong', 'Invalid song data');
    }
    if (state.queue.length >= state.maxLength) {
      return reject(400, 'queueFull', 'Queue is full');
    }
    if (!Number.isFinite(song.duration) || song.duration <= 0) {
      return reject(400, 'queueDurationUnknown', 'Songdauer konnte nicht ermittelt werden. Bitte einen anderen Song wählen.');
    }
    if (song.duration > state.maxSongDurationSeconds) {
      return reject(400, 'queueDurationTooLong', `Song ist zu lang (${Math.ceil(song.duration)}s). Maximum: ${state.maxSongDurationSeconds}s.`);
    }
    if (state.bans.tracks.has(song.trackKey)) {
      return reject(400, 'banSong', 'Dieser Song ist gesperrt.');
    }
    if (state.bans.artists.has(String(song.artist || '').toLowerCase())) {
      return reject(400, 'banArtist', 'Dieser Künstler ist gesperrt.');
    }
    if (state.bans.keywords.some(keyword => String(song.title).toLowerCase().includes(keyword))) {
      return reject(400, 'banKeyword', 'Dieser Song ist geblockt (Keyword).');
    }
    if (state.bans.channels.has(String(song.channelName || '').toLowerCase())) {
      return reject(400, 'banChannel', 'Dieser Kanal ist gesperrt.');
    }
    const duplicateAt = state.queue.findIndex(entry => entry.trackKey === song.trackKey);
    if (duplicateAt !== -1) {
      return reject(400, 'queueDuplicate', `Song bereits in der Queue (#${duplicateAt + 1} – ${state.queue[duplicateAt].title})`);
    }
    const own = state.queue.filter(entry => entry.requestedBy === username).length;
    if (own >= state.maxPerUser) {
      return reject(400, 'queueUserLimit', `Maximal ${state.maxPerUser} aktive Requests pro User erlaubt.`);
    }
    const last = state.lastRequest.get(username);
    if (last !== undefined) {
      const elapsed = (now() - last) / 1000;
      if (elapsed < state.cooldownPerUserSeconds) {
        const remaining = Math.ceil(state.cooldownPerUserSeconds - elapsed);
        return reject(400, 'queueCooldown', `@${username}, du kannst in ${remaining} Sekunden wieder requesten.`);
      }
    }
    const entry = {
      id: `song-${state.nextId++}`,
      title: song.title,
      trackKey: song.trackKey,
      requestedBy: username
    };
    state.queue.push(entry);
    state.lastRequest.set(username, now());
    const position = state.queue.length;
    emit('song-added', { title: entry.title, position });
    emit('queue-update', { length: state.queue.length });
    return { status: 200, body: { success: true, song: publicSong({ ...entry, position }), position } };
  }

  function play(index, body) {
    if (state.locked) {
      return reject(423, 'safetyLock', 'Der Soundbot ist durch den Safety-Lock gesperrt.', { locked: true });
    }
    if (!Number.isInteger(index) || index < 0) {
      return reject(400, 'badIndex', 'Invalid queue position');
    }
    const songId = typeof body?.songId === 'string' ? body.songId : '';
    const currentIndex = songId ? state.queue.findIndex(song => song.id === songId) : index;
    if (songId && currentIndex === -1) {
      if (state.nowPlaying?.id === songId) {
        return { status: 200, body: { success: true, track: { title: state.nowPlaying.title }, alreadyPlaying: true } };
      }
      return reject(409, 'stale', 'Der ausgewählte Titel ist nicht mehr in der Queue.', { staleQueue: true });
    }
    if (currentIndex < 0 || currentIndex >= state.queue.length) {
      return reject(400, 'badIndex', 'Invalid queue position');
    }
    const [song] = state.queue.splice(currentIndex, 1);
    state.queue.unshift(song);
    if (!state.mpvAvailable) {
      emit('error', { message: 'mpv nicht gefunden ("mpv").' });
      return reject(503, 'player', 'mpv nicht gefunden ("mpv").');
    }
    state.playCalls += 1;
    state.queue.shift();
    state.nowPlaying = song;
    state.playbackState = 'playing';
    emit('playback-advancing', { reason: 'queue-play' });
    emit('now-playing', { title: song.title });
    emit('queue-update', { length: state.queue.length });
    return { status: 200, body: { success: true, track: { title: song.title } } };
  }

  function skip(body) {
    if (body?.reason !== 'host') {
      return reject(400, 'badReason', 'Skip-Grund ist nicht erlaubt.');
    }
    if (state.locked) {
      return reject(423, 'safetyLock', 'Der Soundbot ist durch den Safety-Lock gesperrt.', { locked: true });
    }
    if (!state.nowPlaying) {
      return reject(400, 'idle', 'Nothing is playing');
    }
    const skipped = state.nowPlaying;
    emit('song-skipped', { title: skipped.title, reason: 'host' });
    if (!state.mpvAvailable) {
      state.nowPlaying = null;
      state.playbackState = 'idle';
      state.queue.unshift(skipped);
      emit('error', { message: 'mpv nicht gefunden ("mpv").' });
      return reject(503, 'player', 'mpv nicht gefunden ("mpv").');
    }
    state.playCalls += 1;
    if (state.queue.length > 0) {
      const next = state.queue.shift();
      state.nowPlaying = next;
      state.playbackState = 'playing';
      emit('playback-advancing', { reason: 'skip' });
      emit('now-playing', { title: next.title });
      emit('queue-update', { length: state.queue.length });
      return { status: 200, body: { success: true, next: { title: next.title } } };
    }
    state.nowPlaying = null;
    state.playbackState = 'idle';
    emit('playback-advancing', { reason: 'skip' });
    return { status: 200, body: { success: true, next: null } };
  }

  async function request({ method, path, body } = {}) {
    if (method === 'GET' && path === '/api/plugins/music-bot/queue') {
      return {
        status: 200,
        body: { success: true, queue: state.queue.map(song => ({ id: song.id, title: song.title })) }
      };
    }
    if (method === 'GET' && path === '/api/plugins/music-bot/status') {
      return {
        status: 200,
        body: {
          success: true,
          nowPlaying: state.nowPlaying ? { title: state.nowPlaying.title } : null,
          queueLength: state.queue.length,
          playbackState: state.playbackState,
          locked: state.locked
        }
      };
    }
    if (method === 'POST' && path === '/api/plugins/music-bot/request') return enqueue(body);
    if (method === 'POST' && path === '/api/plugins/music-bot/skip') return skip(body);
    const playMatch = /^\/api\/plugins\/music-bot\/queue\/(-?\d+)\/play$/.exec(path || '');
    if (method === 'POST' && playMatch) return play(Number(playMatch[1]), body);
    return reject(404, 'player', 'Unbekannte Music-Bot-Route.');
  }

  return {
    request,
    events: state.events,
    hold(username) { state.pending.add(username); },
    setLocked(locked) { state.locked = Boolean(locked); },
    setMpvAvailable(available) { state.mpvAvailable = Boolean(available); },
    playCalls() { return state.playCalls; },
    resolveCalls() { return state.resolveCalls; },
    queueLength() { return state.queue.length; }
  };
}

module.exports = { createFakeMusicBot };
