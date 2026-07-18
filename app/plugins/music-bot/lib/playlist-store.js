const { randomUUID } = require('crypto');

const VIEWER_RADIO_ID = 'viewer-radio';
const VIEWER_RADIO_NAME = 'Viewer Radio';

class PlaylistError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlaylistError';
    this.code = code;
  }
}

class PlaylistStore {
  constructor(api, catalog) {
    this.api = api;
    this.db = api.getDatabase();
    this.catalog = catalog;
    this._ensureTables();
    this._ensureViewerRadio();
  }

  create({ name, mode = 'ordered' } = {}) {
    const cleanName = this._name(name);
    const cleanMode = this._mode(mode);
    return this._withTransaction(() => {
      const now = Date.now();
      const id = randomUUID();
      try {
        this.db.prepare(
          `INSERT INTO plugin_music_bot_playlists
           (id, name, normalized_name, mode, is_protected, revision, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, 1, ?, ?)`
        ).run(id, cleanName, cleanName.toLocaleLowerCase(), cleanMode, now, now);
      } catch (error) {
        if (/unique/i.test(error.message)) throw new PlaylistError('PLAYLIST_NAME_CONFLICT', 'Playlist name already exists');
        throw error;
      }
      return this.get(id);
    });
  }

  list() {
    return this.db.prepare(
      `SELECT p.id, p.name, p.mode, p.is_protected AS isProtected, p.revision,
       p.created_at AS createdAt, p.updated_at AS updatedAt, COUNT(i.song_id) AS itemCount
       FROM plugin_music_bot_playlists p
       LEFT JOIN plugin_music_bot_playlist_items i ON i.playlist_id = p.id
       GROUP BY p.id ORDER BY p.is_protected DESC, p.created_at ASC, p.id ASC`
    ).all().map((row) => ({ ...row, isProtected: Boolean(row.isProtected) }));
  }

  get(id) {
    const playlist = this._playlist(id);
    const items = this.db.prepare(
      `SELECT i.song_id AS songId, i.position, i.request_count AS requestCount,
       i.last_requested_at AS lastRequestedAt, i.added_at AS addedAt,
       s.title, s.canonical_key AS canonicalKey
       FROM plugin_music_bot_playlist_items i
       JOIN plugin_music_bot_songs s ON s.id = i.song_id
       WHERE i.playlist_id = ? ORDER BY i.position ASC`
    ).all(playlist.id);
    return { ...playlist, items, importProvenance: this._provenance(playlist.id) };
  }

  getViewerRadio() {
    return this.get(VIEWER_RADIO_ID);
  }

  rename(id, name, revision) {
    return this.update(id, { name }, revision);
  }

  update(id, changes = {}, revision) {
    const hasName = Object.prototype.hasOwnProperty.call(changes, 'name');
    const hasMode = Object.prototype.hasOwnProperty.call(changes, 'mode');
    if (!hasName && !hasMode) throw new PlaylistError('INVALID_PLAYLIST_UPDATE', 'Playlist name or mode is required');
    return this._withTransaction(() => {
      const playlist = this._playlist(id);
      if (hasName) this._assertMutable(playlist);
      this._assertRevision(playlist, revision);
      const cleanName = hasName ? this._name(changes.name) : playlist.name;
      const cleanMode = hasMode ? this._mode(changes.mode) : playlist.mode;
      const now = Date.now();
      try {
        this.db.prepare(
          `UPDATE plugin_music_bot_playlists SET name = ?, normalized_name = ?, mode = ?, revision = revision + 1, updated_at = ?
           WHERE id = ?`
        ).run(cleanName, cleanName.toLocaleLowerCase(), cleanMode, now, id);
      } catch (error) {
        if (/unique/i.test(error.message)) throw new PlaylistError('PLAYLIST_NAME_CONFLICT', 'Playlist name already exists');
        throw error;
      }
      return this.get(id);
    });
  }

  delete(id, revision) {
    return this._withTransaction(() => {
      const playlist = this._playlist(id);
      this._assertMutable(playlist);
      this._assertRevision(playlist, revision);
      this.db.prepare('DELETE FROM plugin_music_bot_radio_playlist_sources WHERE playlist_id = ?').run(id);
      this.db.prepare('DELETE FROM plugin_music_bot_playlist_imported_songs WHERE playlist_id = ?').run(id);
      this.db.prepare('DELETE FROM plugin_music_bot_playlist_import_provenance WHERE playlist_id = ?').run(id);
      this.db.prepare('DELETE FROM plugin_music_bot_playlist_items WHERE playlist_id = ?').run(id);
      this.db.prepare('DELETE FROM plugin_music_bot_playlists WHERE id = ?').run(id);
      return { id, deleted: true };
    });
  }

  addItem(id, songId, revision) {
    return this._withTransaction(() => {
      const playlist = this._playlist(id);
      this._assertRevision(playlist, revision);
      this._song(songId);
      const existing = this.db.prepare(
        'SELECT song_id FROM plugin_music_bot_playlist_items WHERE playlist_id = ? AND song_id = ?'
      ).get(id, songId);
      if (existing) return { added: false, duplicate: true, playlist: this.get(id) };
      const position = this.db.prepare(
        'SELECT COUNT(*) AS count FROM plugin_music_bot_playlist_items WHERE playlist_id = ?'
      ).get(id).count;
      this.db.prepare(
        `INSERT INTO plugin_music_bot_playlist_items
         (playlist_id, song_id, position, request_count, last_requested_at, added_at)
         VALUES (?, ?, ?, 0, NULL, ?)`
      ).run(id, songId, position, Date.now());
      this._touch(id);
      return { added: true, duplicate: false, playlist: this.get(id) };
    });
  }

  removeItem(id, songId, revision) {
    return this._withTransaction(() => {
      const playlist = this._playlist(id);
      this._assertRevision(playlist, revision);
      const item = this.db.prepare(
        'SELECT position FROM plugin_music_bot_playlist_items WHERE playlist_id = ? AND song_id = ?'
      ).get(id, songId);
      if (!item) throw new PlaylistError('PLAYLIST_ITEM_NOT_FOUND', 'Playlist item not found');
      this.db.prepare('DELETE FROM plugin_music_bot_playlist_items WHERE playlist_id = ? AND song_id = ?').run(id, songId);
      this.db.prepare(
        `UPDATE plugin_music_bot_playlist_imported_songs SET removed_at = ?
         WHERE playlist_id = ? AND song_id = ?`
      ).run(Date.now(), id, songId);
      this.db.prepare(
        'UPDATE plugin_music_bot_playlist_items SET position = position - 1 WHERE playlist_id = ? AND position > ?'
      ).run(id, item.position);
      this._touch(id);
      return { removed: true, playlist: this.get(id) };
    });
  }

  reorder(id, songIds, revision) {
    if (!Array.isArray(songIds)) throw new PlaylistError('INVALID_PLAYLIST_ITEMS', 'songIds must be an array');
    return this._withTransaction(() => {
      const playlist = this._playlist(id);
      this._assertRevision(playlist, revision);
      const current = this.db.prepare(
        'SELECT song_id AS songId FROM plugin_music_bot_playlist_items WHERE playlist_id = ? ORDER BY position ASC'
      ).all(id).map((item) => item.songId);
      const proposed = songIds.map((songId) => Number(songId));
      if (new Set(proposed).size !== proposed.length || proposed.length !== current.length
        || proposed.some((songId) => !current.includes(songId))) {
        throw new PlaylistError('INVALID_PLAYLIST_ITEMS', 'Reorder must contain every playlist item exactly once');
      }
      this.db.prepare(
        'UPDATE plugin_music_bot_playlist_items SET position = position + ? WHERE playlist_id = ?'
      ).run(current.length + 1, id);
      const update = this.db.prepare(
        'UPDATE plugin_music_bot_playlist_items SET position = ? WHERE playlist_id = ? AND song_id = ?'
      );
      proposed.forEach((songId, position) => update.run(position, id, songId));
      this._touch(id);
      return this.get(id);
    });
  }

  recordViewerCompletion(songId, details = {}) {
    const requestedBy = String(details.requestedBy || '').toLowerCase();
    if (requestedBy === 'autodj' || details.outcome !== 'completed' || details.error) return null;
    return this._withTransaction(() => {
      this._song(songId);
      const current = this._playlist(VIEWER_RADIO_ID);
      const now = Date.now();
      const item = this.db.prepare(
        'SELECT request_count AS requestCount FROM plugin_music_bot_playlist_items WHERE playlist_id = ? AND song_id = ?'
      ).get(VIEWER_RADIO_ID, songId);
      if (item) {
        this.db.prepare(
          `UPDATE plugin_music_bot_playlist_items SET request_count = request_count + 1, last_requested_at = ?
           WHERE playlist_id = ? AND song_id = ?`
        ).run(now, VIEWER_RADIO_ID, songId);
        this._touch(VIEWER_RADIO_ID, now);
        return { added: false, requestCount: Number(item.requestCount) + 1, playlist: this.get(VIEWER_RADIO_ID) };
      }
      const position = this.db.prepare(
        'SELECT COUNT(*) AS count FROM plugin_music_bot_playlist_items WHERE playlist_id = ?'
      ).get(VIEWER_RADIO_ID).count;
      this.db.prepare(
        `INSERT INTO plugin_music_bot_playlist_items
         (playlist_id, song_id, position, request_count, last_requested_at, added_at)
         VALUES (?, ?, ?, 1, ?, ?)`
      ).run(VIEWER_RADIO_ID, songId, position, now, now);
      this._touch(current.id, now);
      return { added: true, requestCount: 1, playlist: this.get(VIEWER_RADIO_ID) };
    });
  }

  importSnapshot(id, entries, provenance = {}) {
    if (!Array.isArray(entries)) throw new PlaylistError('INVALID_IMPORT', 'Playlist snapshot entries must be an array');
    return this._withTransaction(() => {
      const playlist = this._playlist(id);
      const known = new Set(this.db.prepare(
        'SELECT song_id AS songId FROM plugin_music_bot_playlist_items WHERE playlist_id = ?'
      ).all(id).map((item) => item.songId));
      let position = known.size;
      let added = 0;
      let duplicatesSkipped = 0;
      const seen = new Set();
      entries.forEach((entry) => {
        const resolved = this.catalog._resolveOrUpsert(entry);
        const songId = resolved.song.id;
        const imported = this.db.prepare(
          `SELECT song_id FROM plugin_music_bot_playlist_imported_songs
           WHERE playlist_id = ? AND song_id = ?`
        ).get(id, songId);
        if (known.has(songId) || seen.has(songId) || imported) {
          this._markImportedSong(id, songId);
          duplicatesSkipped += 1;
          seen.add(songId);
          return;
        }
        this.db.prepare(
          `INSERT INTO plugin_music_bot_playlist_items
           (playlist_id, song_id, position, request_count, last_requested_at, added_at)
           VALUES (?, ?, ?, 0, NULL, ?)`
        ).run(id, songId, position, Date.now());
        this._markImportedSong(id, songId);
        known.add(songId);
        seen.add(songId);
        position += 1;
        added += 1;
      });
      this._setProvenance(id, provenance);
      if (added) this._touch(playlist.id);
      return { added, duplicatesSkipped, playlist: this.get(id) };
    });
  }

  setRadioSources(sources) {
    if (!Array.isArray(sources)) throw new PlaylistError('INVALID_RADIO_SOURCES', 'sources must be an array');
    return this._withTransaction(() => {
      const ids = new Set();
      const normalized = sources.map((source) => {
        const playlistId = String(source?.playlistId || '');
        if (!playlistId || ids.has(playlistId)) throw new PlaylistError('INVALID_RADIO_SOURCES', 'Playlist sources must be unique');
        ids.add(playlistId);
        this._playlist(playlistId);
        const weight = Number(source.weight ?? 1);
        if (!Number.isInteger(weight) || weight < 1 || weight > 10) {
          throw new PlaylistError('INVALID_RADIO_WEIGHT', 'Playlist source weight must be an integer from 1 to 10');
        }
        return { playlistId, weight, enabled: source.enabled !== false };
      });
      this.db.prepare('UPDATE plugin_music_bot_radio_playlist_sources SET enabled = 0, updated_at = ?').run(Date.now());
      const upsert = this.db.prepare(
        `INSERT INTO plugin_music_bot_radio_playlist_sources (playlist_id, enabled, weight, cursor, updated_at)
         VALUES (?, ?, ?, 0, ?)
         ON CONFLICT(playlist_id) DO UPDATE SET enabled = excluded.enabled, weight = excluded.weight, updated_at = excluded.updated_at`
      );
      const now = Date.now();
      normalized.forEach((source) => upsert.run(source.playlistId, source.enabled ? 1 : 0, source.weight, now));
      return this.getRadioSources();
    });
  }

  getRadioSources() {
    return this.db.prepare(
      `SELECT p.id AS playlistId, p.name, p.mode, p.is_protected AS isProtected,
       COALESCE(s.enabled, 0) AS enabled, COALESCE(s.weight, 1) AS weight, COALESCE(s.cursor, 0) AS cursor,
       COUNT(i.song_id) AS itemCount
       FROM plugin_music_bot_playlists p
       LEFT JOIN plugin_music_bot_radio_playlist_sources s ON s.playlist_id = p.id
       LEFT JOIN plugin_music_bot_playlist_items i ON i.playlist_id = p.id
       GROUP BY p.id ORDER BY p.is_protected DESC, p.created_at ASC`
    ).all().map((source) => ({ ...source, enabled: Boolean(source.enabled), isProtected: Boolean(source.isProtected) }));
  }

  getRadioCandidates({ isAllowed = () => true } = {}) {
    const sources = this.getRadioSources().filter((source) => source.enabled && source.itemCount > 0);
    return sources.flatMap((source) => {
      const items = this.get(source.playlistId).items;
      if (!items.length) return [];
      const start = Number(source.cursor || 0) % items.length;
      return [...items.slice(start), ...items.slice(0, start)]
        .filter((item) => isAllowed(item.songId, item, source))
        .map((item) => ({
          ...item,
          playlistId: source.playlistId,
          weight: source.weight,
          mode: source.mode,
          cursor: source.cursor,
          itemCount: items.length
        }));
    });
  }

  chooseRadioSource({ random = Math.random, isAllowed = () => true } = {}) {
    const choices = this.getRadioSources().filter((source) => source.enabled && source.itemCount > 0)
      .map((source) => {
        const items = this.get(source.playlistId).items;
        const start = Number(source.cursor || 0) % items.length;
        const ordered = [...items.slice(start), ...items.slice(0, start)];
        const item = ordered.find((candidate) => isAllowed(candidate.songId, candidate, source));
        return item ? { source, item, length: items.length } : null;
      }).filter(Boolean);
    if (!choices.length) return null;
    const totalWeight = choices.reduce((total, choice) => total + Number(choice.source.weight), 0);
    const roll = Math.max(0, Math.min(0.999999999, Number(random()) || 0)) * totalWeight;
    let threshold = 0;
    const choice = choices.find((candidate) => {
      threshold += Number(candidate.source.weight);
      return roll < threshold;
    }) || choices.at(-1);
    const nextCursor = (Number(choice.item.position) + 1) % choice.length;
    this.advanceRadioCursor(choice.source.playlistId, nextCursor);
    return { ...choice.item, playlistId: choice.source.playlistId, weight: choice.source.weight, cursor: nextCursor };
  }

  advanceRadioCursor(playlistId, cursor) {
    this._playlist(playlistId);
    const next = Math.max(0, Math.floor(Number(cursor) || 0));
    this.db.prepare(
      `INSERT INTO plugin_music_bot_radio_playlist_sources (playlist_id, enabled, weight, cursor, updated_at)
       VALUES (?, 0, 1, ?, ?)
       ON CONFLICT(playlist_id) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`
    ).run(playlistId, next, Date.now());
    return this.getRadioSources().find((source) => source.playlistId === playlistId);
  }

  _ensureTables() {
    [
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_playlists (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE, mode TEXT NOT NULL,
        is_protected INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_playlist_items (
        playlist_id TEXT NOT NULL, song_id INTEGER NOT NULL, position INTEGER NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 0, last_requested_at INTEGER, added_at INTEGER NOT NULL,
        PRIMARY KEY (playlist_id, song_id), UNIQUE (playlist_id, position)
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_radio_playlist_sources (
        playlist_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, weight INTEGER NOT NULL DEFAULT 1,
        cursor INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_playlist_imported_songs (
        playlist_id TEXT NOT NULL, song_id INTEGER NOT NULL, first_imported_at INTEGER NOT NULL,
        last_imported_at INTEGER NOT NULL, removed_at INTEGER, PRIMARY KEY (playlist_id, song_id)
      )`,
      `CREATE TABLE IF NOT EXISTS plugin_music_bot_playlist_import_provenance (
        playlist_id TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_url TEXT NOT NULL,
        external_playlist_id TEXT, imported_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_music_bot_playlist_items_order ON plugin_music_bot_playlist_items (playlist_id, position)'
    ].forEach((sql) => this.db.prepare(sql).run());
  }

  _ensureViewerRadio() {
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO plugin_music_bot_playlists
       (id, name, normalized_name, mode, is_protected, revision, created_at, updated_at)
       VALUES (?, ?, ?, 'ordered', 1, 1, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    ).run(VIEWER_RADIO_ID, VIEWER_RADIO_NAME, VIEWER_RADIO_NAME.toLowerCase(), now, now);
  }

  _playlist(id) {
    const row = this.db.prepare(
      `SELECT id, name, mode, is_protected AS isProtected, revision, created_at AS createdAt, updated_at AS updatedAt
       FROM plugin_music_bot_playlists WHERE id = ?`
    ).get(id);
    if (!row) throw new PlaylistError('PLAYLIST_NOT_FOUND', 'Playlist not found');
    return { ...row, isProtected: Boolean(row.isProtected) };
  }

  _provenance(id) {
    const row = this.db.prepare(
      `SELECT source_type AS sourceType, source_url AS sourceUrl, external_playlist_id AS externalPlaylistId,
       imported_at AS importedAt FROM plugin_music_bot_playlist_import_provenance WHERE playlist_id = ?`
    ).get(id);
    return row || null;
  }

  _setProvenance(id, provenance = {}) {
    const sourceType = String(provenance.sourceType || '').trim();
    const sourceUrl = String(provenance.sourceUrl || '').trim();
    if (!sourceType || !sourceUrl) return;
    this.db.prepare(
      `INSERT INTO plugin_music_bot_playlist_import_provenance
       (playlist_id, source_type, source_url, external_playlist_id, imported_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(playlist_id) DO UPDATE SET source_type = excluded.source_type, source_url = excluded.source_url,
       external_playlist_id = excluded.external_playlist_id, imported_at = excluded.imported_at`
    ).run(id, sourceType, sourceUrl, provenance.externalPlaylistId || null, Date.now());
  }

  _markImportedSong(playlistId, songId) {
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO plugin_music_bot_playlist_imported_songs
       (playlist_id, song_id, first_imported_at, last_imported_at, removed_at)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(playlist_id, song_id) DO UPDATE SET last_imported_at = excluded.last_imported_at`
    ).run(playlistId, songId, now, now);
  }

  _song(songId) {
    const row = this.db.prepare('SELECT id FROM plugin_music_bot_songs WHERE id = ?').get(songId);
    if (!row) throw new PlaylistError('SONG_NOT_FOUND', 'Catalog song not found');
    return row;
  }

  _touch(id, now = Date.now()) {
    this.db.prepare(
      'UPDATE plugin_music_bot_playlists SET revision = revision + 1, updated_at = ? WHERE id = ?'
    ).run(now, id);
  }

  _assertRevision(playlist, revision) {
    if (revision === undefined || revision === null) return;
    if (Number(revision) !== Number(playlist.revision)) {
      throw new PlaylistError('PLAYLIST_REVISION_CONFLICT', 'Playlist was modified by another edit');
    }
  }

  _assertMutable(playlist) {
    if (playlist.isProtected) throw new PlaylistError('PLAYLIST_PROTECTED', 'Viewer Radio cannot be renamed or deleted');
  }

  _name(value) {
    const name = String(value || '').trim();
    if (!name || name.length > 120) throw new PlaylistError('INVALID_PLAYLIST_NAME', 'Playlist name must be 1 to 120 characters');
    return name;
  }

  _mode(value) {
    const mode = String(value || 'ordered').toLowerCase();
    if (!['ordered', 'shuffle'].includes(mode)) throw new PlaylistError('INVALID_PLAYLIST_MODE', 'Playlist mode must be ordered or shuffle');
    return mode;
  }

  _withTransaction(fn) {
    const transaction = this.db.transaction || this.db.db?.transaction;
    if (typeof transaction !== 'function') return fn();
    return transaction.call(this.db.transaction ? this.db : this.db.db, fn)();
  }
}

PlaylistStore.PlaylistError = PlaylistError;
PlaylistStore.VIEWER_RADIO_ID = VIEWER_RADIO_ID;

module.exports = PlaylistStore;
