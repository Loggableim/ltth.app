const { randomUUID } = require('crypto');
const { deriveTrackIdentity, normalizeText } = require('./track-identity');

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * ONE_DAY;
const LEGACY_DUAL_WRITE_WINDOW_MS = 1000;
const HISTORY_OUTCOMES = new Set(['completed', 'skipped', 'early_skip', 'failed']);
const HISTORY_FEEDBACK = new Set(['up', 'down', 'neutral']);
const HISTORY_BAN_FILTERS = new Set(['only', 'exclude']);
const HISTORY_SORTS = new Set(['finished_desc', 'finished_asc']);
const UNRELIABLE_ARTISTS = new Set(['', 'unknown', 'unknown artist', 'various artists', 'youtube']);

function historyDateBoundary(value, endOfDay) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value || '').trim();
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? timestamp + ONE_DAY - 1
    : timestamp;
}
const VERSION_QUALIFIER = '(?:live|remix|acoustic|instrumental|cover|karaoke|sped\\s*up|slowed|nightcore|reverb)';
const GENRE_ALIASES = {
  alternative: 'alternative', ambient: 'ambient', blues: 'blues', chill: 'chill',
  classical: 'classical', country: 'country', dance: 'dance', disco: 'dance',
  drumandbass: 'electronic', dubstep: 'electronic', edm: 'electronic', electronic: 'electronic',
  folk: 'folk', funk: 'funk', hiphop: 'hip-hop', hiphoprap: 'hip-hop', house: 'electronic',
  indie: 'indie', jazz: 'jazz', latin: 'latin', lofi: 'chill', metal: 'metal', pop: 'pop',
  punk: 'punk', rnb: 'rnb', rap: 'hip-hop', reggae: 'reggae', rock: 'rock', soul: 'rnb',
  soundtrack: 'soundtrack', techno: 'electronic', trance: 'electronic'
};
const NORMAL_UPLOAD_MARKERS = /(?:\s*[-–—]?\s*|\s*[\[(])(?:official\s*(?:music\s*)?(?:video|audio)|lyrics?|lyric\s*video)(?:\s*[\])])?/gi;

class MusicCatalogError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MusicCatalogError';
    this.code = code;
  }
}

class MusicCatalog {
  constructor(api) {
    this.api = api;
    this.db = api.getDatabase();
    this._withTransaction(() => this._ensureTables());
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
      const equivalentRuntimeEvents = this.db.prepare(
        `SELECT outcome FROM plugin_music_bot_play_events
         WHERE legacy_history_id IS NULL AND song_id = ? AND source_id = ? AND requested_by = ?
         AND COALESCE(duration, -1) = ? AND ABS(finished_at - ?) <= ?`
      );
      rows.forEach((row) => {
        if (!row.id || exists.get(String(row.id))) {
          skipped += 1;
          return;
        }
        const resolved = this._resolveOrUpsert({ ...row, id: undefined });
        const finishedAt = Number(row.finishedAt);
        const duration = Number(row.duration) || null;
        const duplicateOutcomes = row.skipped
          ? new Set(['early_skip', 'skipped', 'failed'])
          : new Set(['completed']);
        const isRuntimeDualWrite = Number.isFinite(finishedAt) && finishedAt > 0
          && equivalentRuntimeEvents.all(
            resolved.song.id,
            resolved.source.id,
            row.requestedBy || 'viewer',
            duration ?? -1,
            finishedAt,
            LEGACY_DUAL_WRITE_WINDOW_MS
          ).some((event) => duplicateOutcomes.has(event.outcome));
        if (isRuntimeDualWrite) {
          skipped += 1;
          return;
        }
        this._insertPlayEvent(resolved, row, {
          id: `legacy:${row.id}`,
          legacyHistoryId: String(row.id),
          finishedAt: finishedAt || Date.now(),
          duration,
          playedSeconds: row.skipped ? 0 : duration,
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
      const song = this.db.prepare('SELECT id FROM plugin_music_bot_songs WHERE id = ?').get(songId);
      if (!song) throw new MusicCatalogError('CATALOG_SONG_NOT_FOUND', 'Catalog song not found');
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

  setStreamerPlaylistFeedback(songId, requestedState) {
    const state = this._feedbackState(requestedState);
    return this._withTransaction(() => {
      const normalizedSongId = this._requireCatalogSong(songId);
      const previous = this.db.prepare(
        'SELECT state FROM plugin_music_bot_streamer_playlist_feedback WHERE song_id = ?'
      ).get(normalizedSongId);
      const currentState = previous ? this._feedbackName(previous.state) : 'neutral';
      const nextState = currentState === state ? 'neutral' : state;
      const now = Date.now();
      this.db.prepare(
        `INSERT INTO plugin_music_bot_streamer_playlist_feedback (song_id, state, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(song_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
      ).run(normalizedSongId, this._feedbackValue(nextState), now);
      return { songId: normalizedSongId, state: nextState, updatedAt: now };
    });
  }

  getStreamerPlaylistFeedback(songId) {
    const row = this.db.prepare(
      'SELECT state, updated_at FROM plugin_music_bot_streamer_playlist_feedback WHERE song_id = ?'
    ).get(songId);
    return { state: row ? this._feedbackName(row.state) : 'neutral', updatedAt: row?.updated_at || null };
  }

  listStreamerPlaylistLikedSeeds({ limit = 50, now = Date.now() } = {}) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
    const rows = this.db.prepare(
      `SELECT song_id AS songId, state, updated_at AS updatedAt
       FROM plugin_music_bot_streamer_playlist_feedback
       WHERE state > 0
       ORDER BY updated_at DESC, song_id ASC
       LIMIT ?`
    ).all(safeLimit);
    const candidatesById = new Map(this.getRadioCandidates(rows.map((row) => row.songId), { now })
      .map((candidate) => [Number(candidate.songId), candidate]));
    return rows.map((row) => {
      const candidate = candidatesById.get(Number(row.songId));
      if (!candidate) return null;
      return {
        ...candidate,
        streamerPlaylistFeedback: this._feedbackName(row.state),
        streamerPlaylistFeedbackUpdatedAt: Number(row.updatedAt) || null
      };
    }).filter(Boolean);
  }

  upsertStreamerPlaylistSuggestion({ songId, seedSongId = null, score, status } = {}) {
    const requestedStatus = status === undefined ? null : this._streamerPlaylistSuggestionStatus(status);
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore)) {
      throw new MusicCatalogError('CATALOG_INVALID_STREAMER_PLAYLIST_SUGGESTION', 'Suggestion score must be a finite number');
    }
    return this._withTransaction(() => {
      const normalizedSongId = this._requireCatalogSong(songId);
      const hasSeed = seedSongId !== null && seedSongId !== undefined && seedSongId !== '';
      const normalizedSeedSongId = hasSeed ? this._requireCatalogSong(seedSongId) : null;
      const existing = this.db.prepare(
        'SELECT status FROM plugin_music_bot_streamer_playlist_suggestions WHERE song_id = ?'
      ).get(normalizedSongId);
      const nextStatus = requestedStatus || existing?.status || 'pending';
      const now = Date.now();
      this.db.prepare(
        `INSERT INTO plugin_music_bot_streamer_playlist_suggestions
          (song_id, seed_song_id, score, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(song_id) DO UPDATE SET seed_song_id = excluded.seed_song_id,
           score = excluded.score, status = excluded.status, updated_at = excluded.updated_at`
      ).run(normalizedSongId, normalizedSeedSongId, numericScore, nextStatus, now, now);
      const row = this.db.prepare(
        `SELECT song_id AS songId, seed_song_id AS seedSongId, score, status,
         created_at AS createdAt, updated_at AS updatedAt
         FROM plugin_music_bot_streamer_playlist_suggestions WHERE song_id = ?`
      ).get(normalizedSongId);
      return this._mapStreamerPlaylistSuggestion(row);
    });
  }

  listStreamerPlaylistSuggestions({ status = 'pending', limit = 50, now = Date.now() } = {}) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
    const normalizedStatus = String(status || 'pending').toLowerCase();
    const statusFilter = normalizedStatus === 'all' ? null : this._streamerPlaylistSuggestionStatus(normalizedStatus);
    const rows = this.db.prepare(
      `SELECT song_id AS songId, seed_song_id AS seedSongId, score, status,
       created_at AS createdAt, updated_at AS updatedAt
       FROM plugin_music_bot_streamer_playlist_suggestions
       ${statusFilter ? 'WHERE status = ?' : ''}
       ORDER BY score DESC, updated_at DESC, song_id ASC
       LIMIT ?`
    ).all(...(statusFilter ? [statusFilter, safeLimit] : [safeLimit]));
    const candidatesById = new Map(this.getRadioCandidates(rows.map((row) => row.songId), { now })
      .map((candidate) => [Number(candidate.songId), candidate]));
    return rows.map((row) => {
      const candidate = candidatesById.get(Number(row.songId));
      if (!candidate) return null;
      return {
        ...candidate,
        ...this._mapStreamerPlaylistSuggestion(row),
        suggestionCreatedAt: Number(row.createdAt) || null,
        suggestionUpdatedAt: Number(row.updatedAt) || null
      };
    }).filter(Boolean);
  }

  updateStreamerPlaylistSuggestionStatus(songId, status) {
    const normalizedStatus = this._streamerPlaylistSuggestionStatus(status);
    return this._withTransaction(() => {
      const normalizedSongId = Number(songId);
      const existing = this.db.prepare(
        `SELECT song_id AS songId, seed_song_id AS seedSongId, score, status,
         created_at AS createdAt, updated_at AS updatedAt
         FROM plugin_music_bot_streamer_playlist_suggestions WHERE song_id = ?`
      ).get(normalizedSongId);
      if (!existing) {
        throw new MusicCatalogError('STREAMER_PLAYLIST_SUGGESTION_NOT_FOUND', 'Streamer playlist suggestion not found');
      }
      const now = Date.now();
      this.db.prepare(
        'UPDATE plugin_music_bot_streamer_playlist_suggestions SET status = ?, updated_at = ? WHERE song_id = ?'
      ).run(normalizedStatus, now, normalizedSongId);
      return { ...this._mapStreamerPlaylistSuggestion(existing), status: normalizedStatus, updatedAt: now };
    });
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
      `SELECT songs.id AS songId, songs.canonical_key AS canonicalKey, songs.title, songs.created_at AS createdAt,
       CASE WHEN COALESCE(feedback.state, 0) > 0 THEN 'up'
            WHEN COALESCE(feedback.state, 0) < 0 THEN 'down' ELSE 'neutral' END AS feedback,
       feedback.updated_at AS feedbackUpdatedAt,
       COALESCE(SUM(CASE WHEN events.outcome = 'completed'
         AND LOWER(COALESCE(events.requested_by, '')) = 'autodj' THEN 1 ELSE 0 END), 0) AS completePlays,
       COALESCE(SUM(CASE WHEN events.outcome = 'completed'
         AND LOWER(COALESCE(events.requested_by, '')) = 'autodj' AND events.duration > 0
         AND COALESCE(events.played_seconds, 0) >= events.duration * 0.9 THEN 1 ELSE 0 END), 0) AS fullCompletions,
       COALESCE(SUM(CASE WHEN events.outcome = 'early_skip'
         AND LOWER(COALESCE(events.requested_by, '')) = 'autodj' THEN 1 ELSE 0 END), 0) AS earlySkips,
       MAX(CASE WHEN events.outcome IN ('completed', 'early_skip')
         AND LOWER(COALESCE(events.requested_by, '')) = 'autodj' THEN events.finished_at ELSE NULL END) AS implicitEvidenceUpdatedAt,
       MAX(CASE WHEN events.outcome != 'failed' THEN events.finished_at ELSE NULL END) AS lastPlayedAt
       FROM plugin_music_bot_songs songs
       LEFT JOIN plugin_music_bot_feedback feedback ON feedback.song_id = songs.id
       LEFT JOIN plugin_music_bot_play_events events ON events.song_id = songs.id
       WHERE songs.id IN (${placeholders})
       GROUP BY songs.id, feedback.state, feedback.updated_at`
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
       affinity.updated_at AS affinityUpdatedAt,
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
    const metadata = this.db.prepare(
      `SELECT song_id AS songId, album, normalized_album AS normalizedAlbum, bpm, release_year AS releaseYear
       FROM plugin_music_bot_song_metadata WHERE song_id IN (${placeholders})`
    ).all(...ids);
    const albumPlays = this.db.prepare(
      `SELECT candidates.song_id AS songId, MAX(events.finished_at) AS lastPlayedAt
       FROM plugin_music_bot_song_metadata candidates
       JOIN plugin_music_bot_song_metadata album_songs
         ON album_songs.normalized_album = candidates.normalized_album
       JOIN plugin_music_bot_song_artists candidate_artists
         ON candidate_artists.song_id = candidates.song_id
       JOIN plugin_music_bot_song_artists album_artists
         ON album_artists.song_id = album_songs.song_id
        AND album_artists.artist_id = candidate_artists.artist_id
       JOIN plugin_music_bot_play_events events ON events.song_id = album_songs.song_id
       WHERE candidates.song_id IN (${placeholders})
         AND candidates.normalized_album IS NOT NULL
         AND events.outcome != 'failed'
       GROUP BY candidates.song_id`
    ).all(...ids);
    const genres = this.db.prepare(
      `SELECT links.song_id AS songId, genres.slug, links.source, COALESCE(affinity.score, 0) AS affinity,
       affinity.updated_at AS affinityUpdatedAt
       FROM plugin_music_bot_song_genres links
       JOIN plugin_music_bot_genres genres ON genres.id = links.genre_id
       LEFT JOIN plugin_music_bot_genre_affinity affinity ON affinity.genre_id = genres.id
       WHERE links.song_id IN (${placeholders}) ORDER BY links.song_id ASC, genres.slug ASC`
    ).all(...ids);
    const preferences = this.db.prepare(
      `SELECT song_id AS songId, score, updated_at AS updatedAt FROM plugin_music_bot_radio_song_affinity
       WHERE song_id IN (${placeholders})`
    ).all(...ids);
    return songs.map((song) => {
      const songId = Number(song.songId);
      const songMetadata = metadata.find((entry) => Number(entry.songId) === songId);
      const albumPlay = albumPlays.find((entry) => Number(entry.songId) === songId);
      const songGenres = genres.filter((entry) => Number(entry.songId) === songId);
      const preference = preferences.find((entry) => Number(entry.songId) === songId);
      return {
        ...song,
        createdAt: Number(song.createdAt) || null,
        feedbackUpdatedAt: song.feedbackUpdatedAt == null ? null : Number(song.feedbackUpdatedAt),
        completePlays: Number(song.completePlays) || 0,
        fullCompletions: Number(song.fullCompletions) || 0,
        earlySkips: Number(song.earlySkips) || 0,
        implicitEvidenceUpdatedAt: song.implicitEvidenceUpdatedAt == null ? null : Number(song.implicitEvidenceUpdatedAt),
        lastPlayedAt: song.lastPlayedAt || null,
        album: songMetadata?.album || null,
        normalizedAlbum: songMetadata?.normalizedAlbum || null,
        albumLastPlayedAt: albumPlay?.lastPlayedAt || null,
        bpm: Number(songMetadata?.bpm) || null,
        releaseYear: Number(songMetadata?.releaseYear) || null,
        genres: songGenres.map((entry) => entry.slug),
        genreSource: songGenres.some((entry) => entry.source === 'manual') ? 'manual' : 'automatic',
        genreAffinities: Object.fromEntries(songGenres.map((entry) => [entry.slug, Number(entry.affinity) || 0])),
        genreAffinityUpdatedAt: Object.fromEntries(songGenres.map((entry) => [
          entry.slug, entry.affinityUpdatedAt == null ? null : Number(entry.affinityUpdatedAt)
        ])),
        radioAffinity: Number(preference?.score) || 0,
        radioAffinityUpdatedAt: preference?.updatedAt == null ? null : Number(preference.updatedAt),
        sources: sources.filter((source) => Number(source.songId) === Number(song.songId)),
        artists: artists.filter((artist) => Number(artist.songId) === Number(song.songId))
          .map((artist) => ({
            id: artist.id,
            name: artist.name,
            affinity: Number(artist.affinity) || 0,
            affinityUpdatedAt: artist.affinityUpdatedAt == null ? null : Number(artist.affinityUpdatedAt),
            lastPlayedAt: artist.lastPlayedAt || null
          }))
      };
    });
  }

  getSongArtists(songId) {
    return this.db.prepare(
      `SELECT a.id, a.name FROM plugin_music_bot_song_artists links
       JOIN plugin_music_bot_artists a ON a.id = links.artist_id
       WHERE links.song_id = ? ORDER BY a.normalized_name ASC`
    ).all(songId);
  }

  getMetadataEnrichmentCandidates({ limit = 1, now = Date.now(), staleAfterMs = ONE_DAY } = {}) {
    const safeLimit = Math.max(1, Math.min(10, Number(limit) || 1));
    const cutoff = Number(now) - Math.max(1, Number(staleAfterMs) || ONE_DAY);
    const rows = this.db.prepare(
      `SELECT songs.id AS songId, songs.title, sources.id AS sourceId, sources.provider,
       sources.provider_id AS providerId, sources.track_key AS trackKey, sources.url,
       (SELECT GROUP_CONCAT(artists.name, ' & ')
        FROM plugin_music_bot_song_artists links
        JOIN plugin_music_bot_artists artists ON artists.id = links.artist_id
        WHERE links.song_id = songs.id) AS artist
       FROM plugin_music_bot_songs songs
       JOIN plugin_music_bot_sources sources ON sources.song_id = songs.id
       LEFT JOIN plugin_music_bot_song_metadata metadata ON metadata.song_id = songs.id
       WHERE sources.url IS NOT NULL AND TRIM(sources.url) != ''
         AND sources.id = (
           SELECT candidate_sources.id FROM plugin_music_bot_sources candidate_sources
           WHERE candidate_sources.song_id = songs.id AND candidate_sources.url IS NOT NULL
             AND TRIM(candidate_sources.url) != ''
           ORDER BY candidate_sources.id ASC LIMIT 1
         )
         AND (metadata.song_id IS NULL OR metadata.updated_at <= ?)
       ORDER BY COALESCE(metadata.updated_at, 0) ASC, songs.id ASC
       LIMIT ?`
    ).all(cutoff, safeLimit);
    return rows.map((row) => ({
      songId: Number(row.songId),
      sourceId: Number(row.sourceId),
      title: row.title,
      artist: row.artist || '',
      provider: row.provider,
      providerId: row.providerId,
      trackKey: row.trackKey,
      url: row.url
    }));
  }

  markMetadataEnrichmentAttempt(songId, updatedAt = Date.now()) {
    const normalizedSongId = Number(songId);
    if (!Number.isInteger(normalizedSongId) || normalizedSongId <= 0) {
      throw new MusicCatalogError('CATALOG_SONG_NOT_FOUND', 'Catalog song not found');
    }
    const song = this.db.prepare('SELECT id FROM plugin_music_bot_songs WHERE id = ?').get(normalizedSongId);
    if (!song) throw new MusicCatalogError('CATALOG_SONG_NOT_FOUND', 'Catalog song not found');
    const timestamp = Number(updatedAt) || Date.now();
    this.db.prepare(
      `INSERT INTO plugin_music_bot_song_metadata (song_id, album, normalized_album, bpm, release_year, updated_at)
       VALUES (?, NULL, NULL, NULL, NULL, ?)
       ON CONFLICT(song_id) DO UPDATE SET updated_at = excluded.updated_at`
    ).run(normalizedSongId, timestamp);
    return { songId: normalizedSongId, updatedAt: timestamp };
  }

  setSongGenres(songId, genres) {
    const normalizedSongId = Number(songId);
    if (!Number.isInteger(normalizedSongId) || normalizedSongId <= 0) {
      throw new MusicCatalogError('CATALOG_SONG_NOT_FOUND', 'Catalog song not found');
    }
    const normalizedGenres = this._normalizeGenres(genres);
    return this._withTransaction(() => {
      const song = this.db.prepare('SELECT id FROM plugin_music_bot_songs WHERE id = ?').get(normalizedSongId);
      if (!song) throw new MusicCatalogError('CATALOG_SONG_NOT_FOUND', 'Catalog song not found');
      this.db.prepare('DELETE FROM plugin_music_bot_song_genres WHERE song_id = ?').run(normalizedSongId);
      normalizedGenres.forEach((genre) => this._linkSongGenre(normalizedSongId, genre, 'manual'));
      return { songId: normalizedSongId, genres: normalizedGenres, source: 'manual' };
    });
  }

  recordLivePreference(songId, direction) {
    const normalizedSongId = Number(songId);
    const value = String(direction || '').toLowerCase();
    const delta = value === 'more' ? 1 : (value === 'less' ? -1 : 0);
    if (!Number.isInteger(normalizedSongId) || normalizedSongId <= 0 || !delta) {
      throw new MusicCatalogError('CATALOG_INVALID_PREFERENCE', 'Live preference must be more or less');
    }
    return this._withTransaction(() => {
      const song = this.db.prepare('SELECT id FROM plugin_music_bot_songs WHERE id = ?').get(normalizedSongId);
      if (!song) throw new MusicCatalogError('CATALOG_SONG_NOT_FOUND', 'Catalog song not found');
      const now = Date.now();
      this.db.prepare(
        `INSERT INTO plugin_music_bot_radio_song_affinity (song_id, score, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(song_id) DO UPDATE SET score = MIN(4, MAX(-4, score + excluded.score)), updated_at = excluded.updated_at`
      ).run(normalizedSongId, delta, now);
      this.db.prepare(
        `INSERT INTO plugin_music_bot_artist_affinity (artist_id, score, updated_at)
         SELECT artist_id, ?, ? FROM plugin_music_bot_song_artists WHERE song_id = ?
         ON CONFLICT(artist_id) DO UPDATE SET score = MIN(4, MAX(-4, score + excluded.score)), updated_at = excluded.updated_at`
      ).run(delta, now, normalizedSongId);
      this.db.prepare(
        `INSERT INTO plugin_music_bot_genre_affinity (genre_id, score, updated_at)
         SELECT genre_id, ?, ? FROM plugin_music_bot_song_genres WHERE song_id = ?
         ON CONFLICT(genre_id) DO UPDATE SET score = MIN(4, MAX(-4, score + excluded.score)), updated_at = excluded.updated_at`
      ).run(delta, now, normalizedSongId);
      const score = this.db.prepare(
        'SELECT score FROM plugin_music_bot_radio_song_affinity WHERE song_id = ?'
      ).get(normalizedSongId)?.score || 0;
      return { songId: normalizedSongId, direction: value, score: Number(score) || 0, updatedAt: now };
    });
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

  getHistory({ limit = 50, offset = 0, q = '', outcome = '', feedback = '', banned = '', from = '', to = '', sort = 'finished_desc' } = {}) {
    const safeLimit = Math.max(1, Math.min(250, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const normalizedQuery = normalizeText(q);
    const rawOutcome = String(outcome || '').trim();
    const rawFeedback = String(feedback || '').trim();
    const rawBanned = String(banned || '').trim();
    const rawSort = String(sort || '').trim();
    const normalizedOutcome = HISTORY_OUTCOMES.has(rawOutcome) ? rawOutcome : '';
    const normalizedFeedback = HISTORY_FEEDBACK.has(rawFeedback) ? rawFeedback : '';
    const normalizedBanned = HISTORY_BAN_FILTERS.has(rawBanned) ? rawBanned : '';
    const normalizedSort = HISTORY_SORTS.has(rawSort) ? rawSort : 'finished_desc';
    const fromTimestamp = historyDateBoundary(from, false);
    const toTimestamp = historyDateBoundary(to, true);
    const conditions = [];
    const parameters = [];

    if (normalizedQuery) {
      const search = `%${normalizedQuery}%`;
      conditions.push(`(
        songs.normalized_title LIKE ?
        OR LOWER(COALESCE(sources.channel_name, '')) LIKE ?
        OR LOWER(COALESCE(events.requested_by, '')) LIKE ?
        OR EXISTS (
          SELECT 1 FROM plugin_music_bot_song_artists search_links
          JOIN plugin_music_bot_artists search_artists ON search_artists.id = search_links.artist_id
          WHERE search_links.song_id = songs.id AND search_artists.normalized_name LIKE ?
        )
      )`);
      parameters.push(search, search, search, search);
    }
    if (normalizedOutcome) {
      conditions.push('events.outcome = ?');
      parameters.push(normalizedOutcome);
    }
    if (normalizedFeedback) {
      const feedbackState = normalizedFeedback === 'up' ? 1 : (normalizedFeedback === 'down' ? -1 : 0);
      conditions.push('COALESCE(feedback.state, 0) = ?');
      parameters.push(feedbackState);
    }
    if (fromTimestamp !== null) {
      conditions.push('events.finished_at >= ?');
      parameters.push(fromTimestamp);
    }
    if (toTimestamp !== null) {
      conditions.push('events.finished_at <= ?');
      parameters.push(toTimestamp);
    }

    const banExpression = this._historyBanExpression();
    if (normalizedBanned === 'only') conditions.push(`(${banExpression})`);
    if (normalizedBanned === 'exclude') conditions.push(`NOT (${banExpression})`);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = normalizedSort === 'finished_asc'
      ? 'events.finished_at ASC, events.id ASC'
      : 'events.finished_at DESC, events.id DESC';
    const fromClause = `
      FROM plugin_music_bot_play_events events JOIN plugin_music_bot_songs songs ON songs.id = events.song_id
      LEFT JOIN plugin_music_bot_sources sources ON sources.id = events.source_id
      LEFT JOIN plugin_music_bot_feedback feedback ON feedback.song_id = songs.id`;
    const total = this.db.prepare(
      `SELECT COUNT(*) AS count${fromClause} ${where}`
    ).get(...parameters).count;
    const items = this.db.prepare(
      `SELECT events.id, events.legacy_history_id AS legacyHistoryId, events.song_id AS songId,
       songs.title, events.outcome, events.started_at AS startedAt, events.finished_at AS finishedAt,
       events.duration, events.played_seconds AS playedSeconds, events.requested_by AS requestedBy,
       sources.track_key AS trackKey, sources.url, sources.channel_id AS channelId, sources.channel_name AS channelName,
       sources.provider, sources.provider_id AS providerId, COALESCE(feedback.state, 0) AS feedbackState,
       (${banExpression}) AS banned,
       (SELECT GROUP_CONCAT(artists.name, ' & ') FROM plugin_music_bot_song_artists song_artists
        JOIN plugin_music_bot_artists artists ON artists.id = song_artists.artist_id
        WHERE song_artists.song_id = songs.id) AS artist
       ${fromClause}
       ${where}
       ORDER BY ${order} LIMIT ? OFFSET ?`
    ).all(...parameters, safeLimit, safeOffset).map((item) => ({
      ...item,
      banned: Boolean(item.banned),
      feedback: item.feedbackState > 0 ? 'up' : (item.feedbackState < 0 ? 'down' : 'neutral')
    }));
    return {
      items,
      total,
      limit: safeLimit,
      offset: safeOffset,
      filters: {
        q: normalizedQuery,
        outcome: normalizedOutcome,
        feedback: normalizedFeedback,
        banned: normalizedBanned,
        from: fromTimestamp === null ? '' : String(from || '').trim(),
        to: toTimestamp === null ? '' : String(to || '').trim(),
        sort: normalizedSort
      }
    };
  }

  _historyBanExpression() {
    if (!this._hasTable('plugin_music_bot_bans')) return '0';
    return `
      EXISTS (
        SELECT 1 FROM plugin_music_bot_bans history_url_bans
        WHERE history_url_bans.type = 'url'
          AND sources.url IS NOT NULL
          AND LOWER(sources.url) LIKE '%' || LOWER(history_url_bans.value) || '%'
      )
      OR EXISTS (
        SELECT 1 FROM plugin_music_bot_bans history_track_bans
        WHERE history_track_bans.type = 'track'
          AND LOWER(COALESCE(sources.track_key, '')) = LOWER(history_track_bans.value)
      )
      OR EXISTS (
        SELECT 1 FROM plugin_music_bot_bans history_keyword_bans
        WHERE history_keyword_bans.type = 'keyword'
          AND (
            LOWER(COALESCE(songs.title, '')) LIKE '%' || LOWER(history_keyword_bans.value) || '%'
            OR LOWER(COALESCE(sources.channel_name, '')) LIKE '%' || LOWER(history_keyword_bans.value) || '%'
          )
      )
      OR EXISTS (
        SELECT 1 FROM plugin_music_bot_bans history_channel_bans
        WHERE history_channel_bans.type = 'channel'
          AND (
            COALESCE(sources.channel_id, '') = history_channel_bans.value
            OR LOWER(COALESCE(sources.channel_name, '')) = LOWER(history_channel_bans.value)
          )
      )
      OR EXISTS (
        SELECT 1 FROM plugin_music_bot_bans history_artist_bans
        JOIN plugin_music_bot_song_artists history_artist_links
          ON history_artist_links.song_id = songs.id
        JOIN plugin_music_bot_artists history_artists
          ON history_artists.id = history_artist_links.artist_id
        WHERE history_artist_bans.type = 'artist'
          AND LOWER(history_artists.name) = LOWER(history_artist_bans.value)
      )`;
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
      `SELECT songs.id, songs.title, GROUP_CONCAT(genres.slug, ',') AS genres
       FROM plugin_music_bot_songs songs
       LEFT JOIN plugin_music_bot_song_genres links ON links.song_id = songs.id
       LEFT JOIN plugin_music_bot_genres genres ON genres.id = links.genre_id
       WHERE songs.normalized_title LIKE ?
       GROUP BY songs.id
       ORDER BY songs.created_at DESC LIMIT ?`
    ).all(normalized, Math.max(1, Math.min(100, Number(limit) || 25))).map((song) => ({
      ...song,
      genres: String(song.genres || '').split(',').filter(Boolean).sort()
    }));
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
      `SELECT songs.id, songs.canonical_key AS canonicalKey, songs.title,
       songs.normalized_title AS normalizedTitle, songs.artist_reliable AS artistReliable
       FROM plugin_music_bot_sources sources
       JOIN plugin_music_bot_songs songs ON songs.id = sources.song_id
       WHERE sources.provider = ? AND sources.provider_id = ?`
    ).get(identity.provider, identity.providerId);
    if (song && reliableArtist && !song.artistReliable) {
      const canonicalOwner = this.db.prepare(
        'SELECT id FROM plugin_music_bot_songs WHERE canonical_key = ?'
      ).get(canonicalKey);
      const enrichedCanonicalKey = !canonicalOwner || Number(canonicalOwner.id) === Number(song.id)
        ? canonicalKey
        : song.canonicalKey;
      this.db.prepare(
        `UPDATE plugin_music_bot_songs SET canonical_key = ?, title = ?, normalized_title = ?, artist_reliable = 1
         WHERE id = ?`
      ).run(enrichedCanonicalKey, title, normalizedTitle, song.id);
      song = this.db.prepare(
        `SELECT id, canonical_key AS canonicalKey, title, normalized_title AS normalizedTitle,
         artist_reliable AS artistReliable FROM plugin_music_bot_songs WHERE id = ?`
      ).get(song.id);
    }
    if (!song) {
      song = this.db.prepare(
        `SELECT id, canonical_key AS canonicalKey, title, normalized_title AS normalizedTitle,
         artist_reliable AS artistReliable FROM plugin_music_bot_songs WHERE canonical_key = ?`
      ).get(canonicalKey);
    }
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
    this._upsertMetadata(song.id, track);
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
        `UPDATE plugin_music_bot_sources SET track_key = ?, url = COALESCE(?, url),
         channel_id = COALESCE(?, channel_id), channel_name = COALESCE(?, channel_name) WHERE id = ?`
      ).run(identity.trackKey, track.url || null, track.channelId || null, track.channelName || null, source.id);
      source = this.db.prepare('SELECT * FROM plugin_music_bot_sources WHERE id = ?').get(source.id);
    }
    return this._mapSource(source);
  }

  _insertPlayEvent(resolved, track, details = {}) {
    const duration = Number(details.duration ?? track.duration) || null;
    const playedSecondsValue = Number(details.playedSeconds ?? details.positionSeconds);
    const playedSeconds = Number.isFinite(playedSecondsValue) ? playedSecondsValue : null;
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

  _upsertMetadata(songId, track) {
    const album = String(track?.album || '').trim() || null;
    const normalizedAlbum = album ? normalizeText(album) : null;
    const bpmValue = Number(track?.bpm);
    const bpm = Number.isFinite(bpmValue) && bpmValue >= 40 && bpmValue <= 260 ? bpmValue : null;
    const releaseYear = this._releaseYear(track);
    if (album || bpm || releaseYear) {
      this.db.prepare(
        `INSERT INTO plugin_music_bot_song_metadata (song_id, album, normalized_album, bpm, release_year, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(song_id) DO UPDATE SET album = COALESCE(excluded.album, album),
           normalized_album = COALESCE(excluded.normalized_album, normalized_album), bpm = COALESCE(excluded.bpm, bpm),
            release_year = COALESCE(excluded.release_year, release_year),
           updated_at = excluded.updated_at`
      ).run(songId, album, normalizedAlbum, bpm, releaseYear, Date.now());
    }
    const hasManualGenres = this.db.prepare(
      "SELECT 1 FROM plugin_music_bot_song_genres WHERE song_id = ? AND source = 'manual' LIMIT 1"
    ).get(songId);
    if (hasManualGenres) return;
    const genres = this._normalizeGenres(track?.genres || track?.categories || []);
    if (!genres.length) return;
    this.db.prepare("DELETE FROM plugin_music_bot_song_genres WHERE song_id = ? AND source = 'automatic'").run(songId);
    genres.forEach((genre) => this._linkSongGenre(songId, genre, 'automatic'));
  }

  _linkSongGenre(songId, genre, source) {
    this.db.prepare(
      'INSERT INTO plugin_music_bot_genres (slug, created_at) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING'
    ).run(genre, Date.now());
    const row = this.db.prepare('SELECT id FROM plugin_music_bot_genres WHERE slug = ?').get(genre);
    this.db.prepare(
      `INSERT INTO plugin_music_bot_song_genres (song_id, genre_id, source, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(song_id, genre_id) DO UPDATE SET source = excluded.source, updated_at = excluded.updated_at`
    ).run(songId, row.id, source, Date.now());
  }

  _releaseYear(track) {
    const values = [
      track?.releaseYear,
      track?.release_year,
      track?.releaseDate,
      track?.release_date,
      track?.year,
      track?.uploadDate,
      track?.upload_date
    ];
    for (const value of values) {
      const match = String(value || '').match(/(18\d{2}|19\d{2}|20\d{2}|2100)/);
      if (match) return Number(match[1]);
    }
    return null;
  }

  _normalizeGenres(values) {
    const input = Array.isArray(values) ? values : [values];
    const genres = new Set();
    input.forEach((value) => {
      const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, '');
      const genre = GENRE_ALIASES[normalized];
      if (genre) genres.add(genre);
    });
    return [...genres].sort();
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

  _requireCatalogSong(songId) {
    const normalizedSongId = Number(songId);
    if (!Number.isInteger(normalizedSongId) || normalizedSongId <= 0) {
      throw new MusicCatalogError('CATALOG_SONG_NOT_FOUND', 'Catalog song not found');
    }
    const song = this.db.prepare('SELECT id FROM plugin_music_bot_songs WHERE id = ?').get(normalizedSongId);
    if (!song) throw new MusicCatalogError('CATALOG_SONG_NOT_FOUND', 'Catalog song not found');
    return normalizedSongId;
  }

  _streamerPlaylistSuggestionStatus(value) {
    const status = String(value || '').toLowerCase();
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
      throw new MusicCatalogError(
        'CATALOG_INVALID_STREAMER_PLAYLIST_SUGGESTION',
        'Suggestion status must be pending, accepted, or rejected'
      );
    }
    return status;
  }

  _mapStreamerPlaylistSuggestion(row) {
    return {
      songId: Number(row.songId),
      seedSongId: row.seedSongId == null ? null : Number(row.seedSongId),
      score: Number(row.score),
      status: row.status,
      createdAt: Number(row.createdAt) || null,
      updatedAt: Number(row.updatedAt) || null
    };
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
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_streamer_playlist_feedback (
        song_id INTEGER PRIMARY KEY, state INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_streamer_playlist_suggestions (
        song_id INTEGER PRIMARY KEY, seed_song_id INTEGER, score REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_artist_affinity (
        artist_id INTEGER PRIMARY KEY, score INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_song_metadata (
        song_id INTEGER PRIMARY KEY, album TEXT, normalized_album TEXT, bpm REAL, release_year INTEGER, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_genres (
        id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_song_genres (
        song_id INTEGER NOT NULL, genre_id INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'automatic', updated_at INTEGER NOT NULL,
        PRIMARY KEY (song_id, genre_id)
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_radio_song_affinity (
        song_id INTEGER PRIMARY KEY, score INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_genre_affinity (
        genre_id INTEGER PRIMARY KEY, score INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_music_bot_play_events_finished ON plugin_music_bot_play_events (finished_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_music_bot_sources_song ON plugin_music_bot_sources (song_id)',
      'CREATE INDEX IF NOT EXISTS idx_music_bot_song_genres_song ON plugin_music_bot_song_genres (song_id)',
      'CREATE INDEX IF NOT EXISTS idx_music_bot_streamer_playlist_feedback_state ON plugin_music_bot_streamer_playlist_feedback (state, updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_music_bot_streamer_playlist_suggestions_status ON plugin_music_bot_streamer_playlist_suggestions (status, score DESC, updated_at DESC)'
    ];
    statements.forEach((sql) => this.db.prepare(sql).run());
    const metadataColumns = this.db.prepare('PRAGMA table_info(plugin_music_bot_song_metadata)').all();
    if (!metadataColumns.some((column) => column.name === 'release_year')) {
      this.db.prepare('ALTER TABLE plugin_music_bot_song_metadata ADD COLUMN release_year INTEGER').run();
    }
  }
}

module.exports = MusicCatalog;
