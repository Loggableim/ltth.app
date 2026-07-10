const DEFAULT_RANDOM_KEYWORDS = ['lofi hip hop', 'chill music', 'gaming music', 'study mix'];

class AutoDJ {
  constructor(config, musicResolver, db, api) {
    this.api = api;
    this.db = db;
    this.musicResolver = musicResolver;
    this.playlistIndex = 0;
    this.playlistTrackIndices = new Map();
    this.playedInSession = new Set();
    this.consecutiveCount = 0;
    this.lastResult = { state: 'idle', message: 'Auto-DJ bereit.' };
    this.updateConfig(config);
    this.isActive = this.config.enabled;
  }

  updateConfig(config) {
    const wasEnabled = Boolean(this.config?.enabled);
    this.config = {
      enabled: false,
      mode: 'history',
      historyMinPlays: 2,
      historyShuffled: true,
      maxConsecutiveAutoDJ: 10,
      announceAutoDJ: true,
      randomKeywords: DEFAULT_RANDOM_KEYWORDS,
      playlistUrls: [],
      ...(config || {})
    };
    if (!this.config.enabled) {
      this.isActive = false;
      this._setResult('disabled', 'Auto-DJ ist deaktiviert.');
    } else if (!wasEnabled) {
      this.activate();
    }
  }

  activate() {
    this.isActive = true;
    this.consecutiveCount = 0;
    this._setResult('ready', 'Auto-DJ wartet auf den nächsten freien Queue-Slot.');
  }

  deactivate() {
    this.isActive = false;
    this.consecutiveCount = 0;
    this._setResult('idle', 'Auto-DJ pausiert für Zuschauer-Requests.');
  }

  onSongRequested() {
    this.deactivate();
    this.playedInSession.clear();
  }

  async onQueueEmpty() {
    if (!this.config.enabled) {
      this._setResult('disabled', 'Auto-DJ ist deaktiviert.');
      return null;
    }
    this.isActive = true;
    this._setResult('selecting', 'Auto-DJ sucht den nächsten Titel.');
    return this.getNextSong();
  }

  async getNextSong(force = false) {
    if (!this.config.enabled) {
      this._setResult('disabled', 'Auto-DJ ist deaktiviert.');
      return null;
    }
    if (!force && !this.isActive) {
      this._setResult('idle', 'Auto-DJ wartet auf einen freien Queue-Slot.');
      return null;
    }

    if (!force && this.consecutiveCount >= this.config.maxConsecutiveAutoDJ) {
      this._setResult('limit-reached', `Auto-DJ-Limit von ${this.config.maxConsecutiveAutoDJ} Titeln erreicht.`);
      return null;
    }

    const track = await this._selectTrack();
    if (!track) {
      if (this.lastResult.state !== 'error') {
        this._setResult('no-track', 'Kein passender Auto-DJ-Titel gefunden. Prüfe Playlist oder Suchbegriffe.');
      }
      return null;
    }

    this._setResult('selected', `Ausgewählt: ${track.title || 'Unbekannter Titel'}`);

    return {
      song: {
        ...track,
        requestedBy: 'AutoDJ'
      },
      announce: this.config.announceAutoDJ
    };
  }

  reset() {
    this.consecutiveCount = 0;
    this.playedInSession.clear();
    this.playlistTrackIndices.clear();
  }

  markTrackStarted(track) {
    this.consecutiveCount += 1;
    this.isActive = true;
    if (track?.youtubeId) {
      this.playedInSession.add(track.youtubeId);
    }
    this._setResult('playing', `Spielt: ${track?.title || 'Unbekannter Titel'}`);
  }

  markPlaybackFailed(error) {
    this._setResult('error', `Wiedergabe fehlgeschlagen: ${error?.message || error || 'Unbekannter Fehler'}`);
  }

  getStatus() {
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      isActive: this.isActive,
      consecutiveCount: this.consecutiveCount,
      maxConsecutiveAutoDJ: this.config.maxConsecutiveAutoDJ,
      historyMinPlays: this.config.historyMinPlays,
      announceAutoDJ: this.config.announceAutoDJ,
      randomKeywords: this.config.randomKeywords,
      playlistUrls: this.config.playlistUrls,
      lastResult: this.lastResult
    };
  }

  async _selectTrack() {
    try {
      switch (this.config.mode) {
        case 'playlist':
          return this._pickFromPlaylist();
        case 'random':
          return this._pickRandom();
        case 'history':
        default:
          return this._pickFromHistory();
      }
    } catch (error) {
      this.api.log?.(`[music-bot] AutoDJ selection failed: ${error.message}`, 'error');
      this._setResult('error', `Auswahl fehlgeschlagen: ${error.message}`);
      return null;
    }
  }

  _nextPlaylistItem() {
    const playlist = this.config.playlist || this.config.playlistUrls;
    if (!Array.isArray(playlist) || playlist.length === 0) return null;
    const item = playlist[this.playlistIndex % playlist.length];
    this.playlistIndex = (this.playlistIndex + 1) % playlist.length;
    return item;
  }

  async _pickFromPlaylist() {
    const playlist = this.config.playlist || this.config.playlistUrls;
    const attempts = Array.isArray(playlist) ? playlist.length : 0;
    for (let i = 0; i < attempts; i += 1) {
      const item = this._nextPlaylistItem();
      if (!item) break;
      try {
        const playlistItem = this.playlistTrackIndices.get(item) || 1;
        const resolved = this.musicResolver.resolvePlaylistEntry
          ? await this.musicResolver.resolvePlaylistEntry(item, playlistItem)
          : await this.musicResolver.resolve(item);
        if (resolved?.success) {
          this.playlistTrackIndices.set(item, playlistItem + 1);
          return resolved.song;
        }
      } catch (error) {
        this.api.log?.(`[music-bot] AutoDJ playlist resolve failed: ${error.message}`, 'error');
        this._setResult('error', `Playlist konnte nicht geladen werden: ${error.message}`);
      }
    }
    return null;
  }

  async _pickRandom() {
    const keywords =
      Array.isArray(this.config.randomKeywords) && this.config.randomKeywords.length
        ? this.config.randomKeywords
        : DEFAULT_RANDOM_KEYWORDS;
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];
    const resolved = await this.musicResolver.resolve(keyword);
    return resolved?.success ? resolved.song : null;
  }

  async _pickFromHistory() {
    const minPlays = Math.max(Number(this.config.historyMinPlays) || 1, 1);
    const orderClause = this.config.historyShuffled ? 'ORDER BY RANDOM()' : 'ORDER BY finishedAt DESC';
    const rows = this.db
      .prepare(
        `SELECT youtubeId, title, artist, url, duration, source, thumbnail, COUNT(*) as plays
         FROM plugin_music_bot_history
         WHERE youtubeId IS NOT NULL
         GROUP BY youtubeId, title, artist, url, duration, source, thumbnail
         HAVING plays >= ?
         ${orderClause}
         LIMIT 20`
      )
      .all(minPlays);

    const candidate = rows.find((row) => !this.playedInSession.has(row.youtubeId)) || rows[0];
    if (!candidate) return this._pickRandom();

    return {
      title: candidate.title,
      artist: candidate.artist,
      url: candidate.url,
      duration: candidate.duration,
      source: candidate.source || 'youtube',
      thumbnail: candidate.thumbnail,
      youtubeId: candidate.youtubeId
    };
  }

  _setResult(state, message) {
    this.lastResult = {
      state,
      message,
      updatedAt: Date.now()
    };
  }
}

module.exports = AutoDJ;
