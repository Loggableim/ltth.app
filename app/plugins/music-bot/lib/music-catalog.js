const { randomUUID } = require('crypto');
const { deriveTrackIdentity, normalizeText } = require('./track-identity');

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * ONE_DAY;
const UNRELIABLE_ARTISTS = new Set(['', 'unknown', 'unknown artist', 'various artists', 'youtube']);
const VERSION_QUALIFIER = '(?:live|remix|acoustic|instrumental|cover|karaoke|sped\\s*up|slowed|nightcore|reverb)';
const NORMAL_UPLOAD_MARKERS = /(?:\s*[-–—]?\s*|\s*[\[(])(?:official\s*(?:music\s*)?(?:video|audio)|lyrics?|lyric\s*video)(?:\s*[\])])?/gi;

class MusicCatalog {
  constructor(api) {
    this.api = api;
    this.db = api.getDatabase();
    this._ensureTables();
  }

  resolveOrUpsert(track = {}) {
    return this._withTransaction(() => this._resolveOrUpsert(track));
  }

  migrateLegacyHistory() {
    if (!this._hasTable('plugin_music_bot_history')) return { imported: 0, skipped: 0 };
    const rows = this.db.prepare('SELECT * FROM plugin_music_bot_history').all();
    return this._withTransaction(() => {
      let imported = 0;
      let skipped = 0;
      const exists = this.db.prepare(
        'SELECT 1 FROM plugin_music_bot_play_events WHERE legacy_history_id = ? LIMIT 1'
      );
      rows.forEach((row) => {
        if (!row.id || exists.get(String(row.id))) {
          skipped += 1;
          return;
        }
        const resolved = this._resolveOrUpsert({ ...row, id: undefined });
        this._insertPlayEvent(resolved, row, {
          id: `legacy:${row.id}`,
          legacyHistoryId: String(row.id),
          finishedAt: Number(row.finishedAt) || Date.now(),
          duration: Number(row.duration) || null,
          playedSeconds: row.skipped ? 0 : (Number(row.duration) || null),
          outcome: row.skipped ? 'early_skip' : 'completed',
          requestedBy: row.requestedBy || 'viewer',
          source: row.source || null
        });
        imported += 1;
      });
      return { imported, skipped };
    });
  }

  recordCompleted(track, details = {}) {
    return this._recordPlayback(track, { ...details, outcome: 'completed' });
  }

  recordFailed(track, details = {}) {
    return this._recordPlayback(track, { ...details, outcome: 'failed' });
  }

  recordSkipped(track, details = {}) {
    const duration = Number(details.duration || track.duration) || null;
    const playedSeconds = Number(details.playedSeconds ?? details.positionSeconds) || 0;
    const outcome = duration && playedSeconds < duration * 0.5 ? 'early_skip' : 'skipped';
    return this._recordPlayback(track, { ...details, duration, playedSeconds, outcome });
  }

  setFeedback(songId, requestedState) {
    const state = this._feedbackState(requestedState);
    return this._withTransaction(() => {
      const previous = this.db.prepare(
        'SELECT state FROM plugin_music_bot_feedback WHERE song_id = ?'
      ).get(songId);
      const currentState = previous ? this._feedbackName(previous.state) : 'neutral';
      const nextState = currentState === state ? 'neutral' : state;
      const beforeUp = currentState === 'up';
      const afterUp = nextState === 'up';
      const delta = Number(afterUp) - Number(beforeUp);
      const now = Date.now();
      this.db.prepare(
        `INSERT INTO plugin_music_bot_feedback (song_id, state, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(song_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
      ).run(songId, this._feedbackValue(nextState), now);
      if (delta) {
        this.db.prepare(
          `INSERT INTO plugin_music_bot_artist_affinity (artist_id, score, updated_at)
           SELECT artist_id, ?, ? FROM plugin_music_bot_song_artists WHERE song_id = ?
           ON CONFLICT(artist_id) DO UPDATE SET score = score + excluded.score, updated_at = excluded.updated_at`
        ).run(delta, now, songId);
      }
      return { songId, state: nextState, updatedAt: now };
    });
  }

  getFeedback(songId) {
    const row = this.db.prepare(
      'SELECT state, updated_at FROM plugin_music_bot_feedback WHERE song_id = ?'
    ).get(songId);
    return { state: row ? this._feedbackName(row.state) : 'neutral', updatedAt: row?.updated_at || null };
  }

  getScoringInputs(songId) {
    const feedback = this.getFeedback(songId).state;
    return {
      songId,
      feedback,
      songFactor: feedback === 'up' ? 3 : (feedback === 'down' ? 0 : 1),
      radioAllowed: feedback !== 'down',
      requestAllowed: true
    };
  }

  getArtistAffinity(songId) {
    const rows = this.db.prepare(
      `SELECT a.name, COALESCE(affinity.score, 0) AS score
       FROM plugin_music_bot_song_artists links
       JOIN plugin_music_bot_artists a ON a.id = links.artist_id
       LEFT JOIN plugin_music_bot_artist_affinity affinity ON affinity.artist_id = a.id
       WHERE links.song_id = ? ORDER BY a.normalized_name ASC`
    ).all(songId);
    return Object.fromEntries(rows.map((row) => [row.name, row.score]));
  }

  getRadioCandidates(songIds, { now = Date.now() } = {}) {
    const ids = [...new Set((songIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const songs = this.db.prepare(
      `SELECT songs.id AS songId, songs.canonical_key AS canonicalKey, songs.title,
       CASE WHEN COALESCE(feedback.state, 0) > 0 THEN 'up'
            WHEN COALESCE(feedback.state, 0) < 0 THEN 'down' ELSE 'neutral' END AS feedback,
       COALESCE(SUM(CASE WHEN events.outcome = 'completed'
         AND LOWER(COALESCE(events.requested_by, '')) = 'autodj' THEN 1 ELSE 0 END), 0) AS completePlays,
       COALESCE(SUM(CASE WHEN events.outcome = 'early_skip'
         AND LOWER(COALESCE(events.requested_by, '')) = 'autodj' THEN 1 ELSE 0 END), 0) AS earlySkips,
       MAX(CASE WHEN events.outcome != 'failed' THEN events.finished_at ELSE NULL END) AS lastPlayedAt
       FROM plugin_music_bot_songs songs
       LEFT JOIN plugin_music_bot_feedback feedback ON feedback.song_id = songs.id
       LEFT JOIN plugin_music_bot_play_events events ON events.song_id = songs.id
       WHERE songs.id IN (${placeholders})
       GROUP BY songs.id, feedback.state`
    ).all(...ids);
    const sources = this.db.prepare(
      `SELECT id, song_id AS songId, provider, provider_id AS providerId, track_key AS trackKey,
       url, channel_id AS channelId, channel_name AS channelName, failure_count AS failureCount,
       failure_class AS failureClass, cooldown_until AS cooldownUntil
       FROM plugin_music_bot_sources WHERE song_id IN (${placeholders})
       ORDER BY song_id ASC, CASE WHEN cooldown_until IS NULL OR cooldown_until <= ? THEN 0 ELSE 1 END ASC,
       failure_count ASC, id ASC`
    ).all(...ids, now);
    const artists = this.db.prepare(
      `SELECT links.song_id AS songId, artists.id, artists.name,
       COALESCE(affinity.score, 0) AS affinity,
       (SELECT MAX(events.finished_at)
        FROM plugin_music_bot_song_artists played_links
        JOIN plugin_music_bot_play_events events ON events.song_id = played_links.song_id
        WHERE played_links.artist_id = artists.id AND events.outcome != 'failed') AS lastPlayedAt
       FROM plugin_music_bot_song_artists links
       JOIN plugin_music_bot_artists artists ON artists.id = links.artist_id
       LEFT JOIN plugin_music_bot_artist_affinity affinity ON affinity.artist_id = artists.id
       WHERE links.song_id IN (${placeholders})
       ORDER BY links.song_id ASC, artists.normalized_name ASC`
    ).all(...ids);
    return songs.map((song) => ({
      ...song,
      completePlays: Number(song.completePlays) || 0,
      earlySkips: Number(song.earlySkips) || 0,
      lastPlayedAt: song.lastPlayedAt || null,
      sources: sources.filter((source) => Number(source.songId) === Number(song.songId)),
      artists: artists.filter((artist) => Number(artist.songId) === Number(song.songId))
        .map((artist) => ({
          id: artist.id,
          name: artist.name,
          affinity: Number(artist.affinity) || 0,
          lastPlayedAt: artist.lastPlayedAt || null
        }))
    }));
  }

  getSongArtists(songId) {
    return this.db.prepare(
      `SELECT a.id, a.name FROM plugin_music_bot_song_artists links
       JOIN plugin_music_bot_artists a ON a.id = links.artist_id
       WHERE links.song_id = ? ORDER BY a.normalized_name ASC`
    ).all(songId);
  }

  recordSourceFailure(sourceId, error, now = Date.now()) {
    return this._withTransaction(() => {
      const source = this.db.prepare('SELECT * FROM plugin_music_bot_sources WHERE id = ?').get(sourceId);
      if (!source) throw new Error('Unknown music source');
      const inWindow = source.failure_window_started_at && now - source.failure_window_started_at < ONE_DAY;
      const failureCount = inWindow ? Number(source.failure_count || 0) + 1 : 1;
      const failureClass = this._classifyFailure(error);
      const cooldown = failureCount >= 3 ? SEVEN_DAYS : (failureClass === 'long' ? ONE_DAY : FIFTEEN_MINUTES);
      const failureWindowStartedAt = inWindow ? source.failure_window_started_at : now;
      const cooldownUntil = now + cooldown;
      this.db.prepare(
        `UPDATE plugin_music_bot_sources
         SET failure_count = ?, failure_window_started_at = ?, last_failure_at = ?,
             failure_class = ?, cooldown_until = ? WHERE id = ?`
      ).run(failureCount, failureWindowStartedAt, now, failureClass, cooldownUntil, sourceId);
      return { sourceId, failureCount, cooldownUntil, failureClass };
    });
  }

  recordSourceSuccess(sourceId) {
    this.db.prepare(
      `UPDATE plugin_music_bot_sources SET failure_count = 0, failure_window_started_at = NULL,
       last_failure_at = NULL, failure_class = NULL, cooldown_until = NULL WHERE id = ?`
    ).run(sourceId);
    return { sourceId, failureCount: 0, cooldownUntil: null };
  }

  getHistory({ limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(250, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const items = this.db.prepare(
      `SELECT events.id, events.legacy_history_id AS legacyHistoryId, events.song_id AS songId,
       songs.title, events.outcome, events.started_at AS startedAt, events.finished_at AS finishedAt,
       events.duration, events.played_seconds AS playedSeconds, events.requested_by AS requestedBy,
       sources.track_key AS trackKey, sources.url, sources.channel_id AS channelId, sources.channel_name AS channelName,
       sources.provider, sources.provider_id AS providerId, COALESCE(feedback.state, 0) AS feedbackState,
       (SELECT GROUP_CONCAT(artists.name, ' & ') FROM plugin_music_bot_song_artists song_artists
        JOIN plugin_music_bot_artists artists ON artists.id = song_artists.artist_id
        WHERE song_artists.song_id = songs.id) AS artist
       FROM plugin_music_bot_play_events events JOIN plugin_music_bot_songs songs ON songs.id = events.song_id
       LEFT JOIN plugin_music_bot_sources sources ON sources.id = events.source_id
       LEFT JOIN plugin_music_bot_feedback feedback ON feedback.song_id = songs.id
       ORDER BY events.finished_at DESC, events.id DESC LIMIT ? OFFSET ?`
    ).all(safeLimit, safeOffset).map((item) => ({
      ...item,
      feedback: item.feedbackState > 0 ? 'up' : (item.feedbackState < 0 ? 'down' : 'neutral')
    }));
    const total = this.db.prepare('SELECT COUNT(*) AS count FROM plugin_music_bot_play_events').get().count;
    return { items, total, limit: safeLimit, offset: safeOffset };
  }

  getHistoryEvent(eventId) {
    const id = String(eventId || '').trim();
    if (!id) return null;
    const item = this.db.prepare(
      `SELECT events.id, events.song_id AS songId, songs.title, sources.track_key AS trackKey, sources.url,
       sources.channel_id AS channelId, sources.channel_name AS channelName, sources.provider, sources.provider_id AS providerId,
       (SELECT GROUP_CONCAT(artists.name, ' & ') FROM plugin_music_bot_song_artists song_artists
        JOIN plugin_music_bot_artists artists ON artists.id = song_artists.artist_id
        WHERE song_artists.song_id = songs.id) AS artist
       FROM plugin_music_bot_play_events events JOIN plugin_music_bot_songs songs ON songs.id = events.song_id
       LEFT JOIN plugin_music_bot_sources sources ON sources.id = events.source_id WHERE events.id = ? LIMIT 1`
    ).get(id);
    return item || null;
  }

  searchSongs(query, limit = 25) {
    const normalized = `%${normalizeText(query)}%`;
    return this.db.prepare(
      `SELECT id, title FROM plugin_music_bot_songs WHERE normalized_title LIKE ?
       ORDER BY created_at DESC LIMIT ?`
    ).all(normalized, Math.max(1, Math.min(100, Number(limit) || 25)));
  }

  _recordPlayback(track, details) {
    return this._withTransaction(() => {
      const resolved = this._resolveOrUpsert(track);
      const event = this._insertPlayEvent(resolved, track, details);
      return { ...resolved, event };
    });
  }

  _resolveOrUpsert(track) {
    const identity = deriveTrackIdentity(track, track.url);
    const artists = this._creditedArtists(track);
    const reliableArtist = artists.length > 0;
    const title = String(track.title || '').trim() || identity.providerId;
    const normalizedTitle = this._canonicalTitle(title);
    const canonicalKey = reliableArtist
      ? `meta:${artists.map((artist) => artist.normalized).join('|')}:${normalizedTitle}`
      : `provider:${identity.provider}:${identity.providerId}`;
    let song = this.db.prepare(
      'SELECT id, canonical_key AS canonicalKey, title, normalized_title AS normalizedTitle FROM plugin_music_bot_songs WHERE canonical_key = ?'
    ).get(canonicalKey);
    if (!song) {
      const info = this.db.prepare(
        `INSERT INTO plugin_music_bot_songs (canonical_key, title, normalized_title, artist_reliable, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(canonicalKey, title, normalizedTitle, reliableArtist ? 1 : 0, Date.now());
      song = this.db.prepare(
        'SELECT id, canonical_key AS canonicalKey, title, normalized_title AS normalizedTitle FROM plugin_music_bot_songs WHERE id = ?'
      ).get(info.lastInsertRowid);
    }
    artists.forEach((artist) => this._linkArtist(song.id, artist));
    const source = this._upsertSource(song.id, identity, track);
    return { song, source, identity };
  }

  _upsertSource(songId, identity, track) {
    let source = this.db.prepare(
      'SELECT * FROM plugin_music_bot_sources WHERE provider = ? AND provider_id = ?'
    ).get(identity.provider, identity.providerId);
    if (!source) {
      const info = this.db.prepare(
        `INSERT INTO plugin_music_bot_sources
         (song_id, provider, provider_id, track_key, url, channel_id, channel_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(songId, identity.provider, identity.providerId, identity.trackKey, track.url || null,
        track.channelId || null, track.channelName || null, Date.now());
      source = this.db.prepare('SELECT * FROM plugin_music_bot_sources WHERE id = ?').get(info.lastInsertRowid);
    } else {
      this.db.prepare(
        `UPDATE plugin_music_bot_sources SET song_id = ?, track_key = ?, url = COALESCE(?, url),
         channel_id = COALESCE(?, channel_id), channel_name = COALESCE(?, channel_name) WHERE id = ?`
      ).run(songId, identity.trackKey, track.url || null, track.channelId || null, track.channelName || null, source.id);
      source = this.db.prepare('SELECT * FROM plugin_music_bot_sources WHERE id = ?').get(source.id);
    }
    return this._mapSource(source);
  }

  _insertPlayEvent(resolved, track, details = {}) {
    const duration = Number(details.duration ?? track.duration) || null;
    const playedSeconds = Number(details.playedSeconds ?? details.positionSeconds) || null;
    const id = details.id || randomUUID();
    const result = this.db.prepare(
      `INSERT OR IGNORE INTO plugin_music_bot_play_events
       (id, legacy_history_id, song_id, source_id, outcome, started_at, finished_at, duration,
        played_seconds, requested_by, request_source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, details.legacyHistoryId || null, resolved.song.id, resolved.source.id,
      details.outcome || 'completed', Number(details.startedAt) || null,
      Number(details.finishedAt) || Date.now(), duration, playedSeconds,
      details.requestedBy || track.requestedBy || 'viewer', details.source || track.source || null, Date.now());
    return { id, inserted: result.changes > 0, outcome: details.outcome || 'completed' };
  }

  _linkArtist(songId, artist) {
    let row = this.db.prepare(
      'SELECT id, name FROM plugin_music_bot_artists WHERE normalized_name = ?'
    ).get(artist.normalized);
    if (!row) {
      const info = this.db.prepare(
        'INSERT INTO plugin_music_bot_artists (name, normalized_name, created_at) VALUES (?, ?, ?)'
      ).run(artist.name, artist.normalized, Date.now());
      row = { id: info.lastInsertRowid, name: artist.name };
    }
    this.db.prepare(
      'INSERT OR IGNORE INTO plugin_music_bot_song_artists (song_id, artist_id) VALUES (?, ?)'
    ).run(songId, row.id);
  }

  _creditedArtists(track) {
    const values = Array.isArray(track.artists) ? track.artists : [track.artist];
    const artists = values.flatMap((value) => String(value || '')
      .split(/\s*(?:,|&|\+|\b(?:feat(?:uring)?|ft|with|x)\.?\s+)/i));
    const unique = new Map();
    artists.forEach((name) => {
      const clean = String(name || '').trim();
      const normalized = normalizeText(clean);
      if (normalized && !UNRELIABLE_ARTISTS.has(normalized) && !unique.has(normalized)) {
        unique.set(normalized, { name: clean, normalized });
      }
    });
    return [...unique.values()].sort((left, right) => left.normalized.localeCompare(right.normalized));
  }

  _canonicalTitle(title) {
    const normalized = normalizeText(title);
    const explicitVersion = new RegExp(
      `(?:[\\[(]\\s*${VERSION_QUALIFIER}\\s*[\\])]|\\s[-â€“â€”]\\s*${VERSION_QUALIFIER})\\s*$`,
      'i'
    );
    if (explicitVersion.test(String(title))) return normalized;
    const stripped = normalizeText(String(title).replace(NORMAL_UPLOAD_MARKERS, ''));
    return stripped || normalized;
  }

  _classifyFailure(error) {
    return /drm|format|unavailable|private|removed|not available/i.test(String(error || '')) ? 'long' : 'transient';
  }

  _feedbackState(value) {
    const state = String(value || '').toLowerCase();
    if (!['up', 'down', 'neutral'].includes(state)) throw new Error('Invalid feedback state');
    return state;
  }

  _feedbackValue(state) {
    return state === 'up' ? 1 : (state === 'down' ? -1 : 0);
  }

  _feedbackName(value) {
    return Number(value) > 0 ? 'up' : (Number(value) < 0 ? 'down' : 'neutral');
  }

  _mapSource(source) {
    return {
      id: source.id,
      songId: source.song_id,
      provider: source.provider,
      providerId: source.provider_id,
      trackKey: source.track_key,
      url: source.url,
      channelId: source.channel_id,
      channelName: source.channel_name,
      failureCount: source.failure_count || 0,
      cooldownUntil: source.cooldown_until || null
    };
  }

  _hasTable(name) {
    return Boolean(this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(name));
  }

  _withTransaction(fn) {
    const transaction = this.db.transaction || this.db.db?.transaction;
    if (typeof transaction !== 'function') return fn();
    return transaction.call(this.db.transaction ? this.db : this.db.db, fn)();
  }

  _ensureTables() {
    const statements = [
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, canonical_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
        normalized_title TEXT NOT NULL, artist_reliable INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_song_artists (
        song_id INTEGER NOT NULL, artist_id INTEGER NOT NULL, PRIMARY KEY (song_id, artist_id)
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT, song_id INTEGER NOT NULL, provider TEXT NOT NULL, provider_id TEXT NOT NULL,
        track_key TEXT NOT NULL, url TEXT, channel_id TEXT, channel_name TEXT, failure_count INTEGER NOT NULL DEFAULT 0,
        failure_window_started_at INTEGER, last_failure_at INTEGER, failure_class TEXT, cooldown_until INTEGER,
        created_at INTEGER NOT NULL, UNIQUE(provider, provider_id)
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_play_events (
        id TEXT PRIMARY KEY, legacy_history_id TEXT UNIQUE, song_id INTEGER NOT NULL, source_id INTEGER,
        outcome TEXT NOT NULL, started_at INTEGER, finished_at INTEGER NOT NULL, duration INTEGER,
        played_seconds INTEGER, requested_by TEXT, request_source TEXT, created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_feedback (
        song_id INTEGER PRIMARY KEY, state INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_artist_affinity (
        artist_id INTEGER PRIMARY KEY, score INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_music_bot_play_events_finished ON plugin_music_bot_play_events (finished_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_music_bot_sources_song ON plugin_music_bot_sources (song_id)'
    ];
    statements.forEach((sql) => this.db.prepare(sql).run());
  }
}

module.exports = MusicCatalog;
