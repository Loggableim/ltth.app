'use strict';

// Host port to the Music Bot control routes. transport is injected.
// No network, no mpv, no HostCore import. Failures stay inside { ok: false }.
const QUERY_PATTERN = /^[a-z0-9_-]{1,20}$/;

const MESSAGE_CODES = {
  queueFull: 'queue-full',
  queueInvalidSong: 'invalid-song',
  queueDurationUnknown: 'duration',
  queueDurationTooLong: 'duration',
  queueDuplicate: 'duplicate',
  queueUserLimit: 'user-limit',
  queueCooldown: 'cooldown',
  requestUserBlocked: 'banned',
  banSong: 'banned',
  banArtist: 'banned',
  banKeyword: 'banned',
  banChannel: 'banned',
  requestPending: 'busy',
  resolveFailed: 'resolve',
  safetyLock: 'locked',
  idle: 'idle',
  stale: 'stale',
  badIndex: 'bad-index',
  player: 'player'
};

function fail(code, text) {
  return { ok: false, code, text };
}

function mapFailure(response) {
  const body = response?.body || {};
  const code = MESSAGE_CODES[body.messageKey];
  if (code) return fail(code, body.error || 'Music-Bot hat abgelehnt.');
  if (response?.status === 423) return fail('locked', body.error || 'Der Soundbot ist durch den Safety-Lock gesperrt.');
  if (response?.status === 409) return fail('stale', body.error || 'Der ausgewählte Titel ist nicht mehr in der Queue.');
  return fail('player', body.error || 'Der Player ist nicht erreichbar.');
}

function createMusicBotAdapter({ transport } = {}) {
  if (typeof transport !== 'function') {
    throw new Error('music-bot adapter: transport is required');
  }

  async function call(method, path, body) {
    try {
      return await transport({ method, path, body });
    } catch (error) {
      return null;
    }
  }

  return {
    async queue() {
      const response = await call('GET', '/api/plugins/music-bot/queue');
      if (!response || response.status !== 200 || !response.body?.success) return mapFailure(response);
      return { ok: true, length: Array.isArray(response.body.queue) ? response.body.queue.length : 0 };
    },
    async enqueue({ query, requestedBy } = {}) {
      if (typeof query !== 'string' || !QUERY_PATTERN.test(query) || typeof requestedBy !== 'string' || !requestedBy) {
        return fail('invalid-song', 'Ungültiger Song-Wunsch.');
      }
      const response = await call('POST', '/api/plugins/music-bot/request', { query, username: requestedBy });
      if (!response) return fail('player', 'Der Player ist nicht erreichbar.');
      if (response.status === 200 && response.body?.success) {
        return { ok: true, position: response.body.position, title: response.body.song.title };
      }
      return mapFailure(response);
    },
    async play({ index, songId } = {}) {
      if (!Number.isInteger(index)) return fail('bad-index', 'Invalid queue position');
      const response = await call('POST', `/api/plugins/music-bot/queue/${index}/play`, { songId });
      if (!response) return fail('player', 'Der Player ist nicht erreichbar.');
      if (response.status === 200 && response.body?.success) {
        return { ok: true, title: response.body.track.title };
      }
      return mapFailure(response);
    },
    async skip({ reason } = {}) {
      if (reason !== 'host') return fail('player', 'Skip-Grund ist nicht erlaubt.');
      const response = await call('POST', '/api/plugins/music-bot/skip', { reason });
      if (!response) return fail('player', 'Der Player ist nicht erreichbar.');
      if (response.status === 200 && response.body?.success) {
        return { ok: true, nextTitle: response.body.next?.title || null };
      }
      return mapFailure(response);
    },
    async status() {
      const response = await call('GET', '/api/plugins/music-bot/status');
      if (!response || response.status !== 200 || !response.body?.success) return mapFailure(response);
      const body = response.body;
      return {
        nowPlayingTitle: body.nowPlaying?.title || null,
        queueLength: body.queueLength,
        playbackState: body.playbackState,
        locked: Boolean(body.locked)
      };
    }
  };
}

module.exports = { createMusicBotAdapter };
