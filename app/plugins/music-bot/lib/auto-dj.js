const { randomUUID } = require('crypto');

class AutoDJ {
  constructor(config, musicResolver, db, api, options = {}) {
    this.api = api;
    this.db = db;
    this.musicResolver = musicResolver;
    this.catalog = options.catalog || null;
    this.playlistStore = options.playlistStore || null;
    this.random = typeof options.random === 'function' ? options.random : () => Math.random();
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.isBanned = typeof options.isBanned === 'function' ? options.isBanned : () => false;
    this.playlistIndex = 0;
    this.playlistTrackIndices = new Map();
    this.relatedTrackIndices = new Map();
    this.mixSeedIndex = 0;
    this.lastPlaylistTrack = null;
    this.playedInSession = new Set();
    this.playedSongIds = new Map();
    this.consecutiveCount = 0;
    this.selectionSource = null;
    this.blockedCount = 0;
    this.lastSelection = null;
    this.lastResult = { state: 'idle', message: 'Auto-DJ bereit.' };
    this.currentRadioContext = null;
    this.manualRadioSeed = null;
    this.requestSeeds = [];
    this.recentNovelty = [];
    this.genreSelectionCounts = new Map();
    this.recentSelections = [];
    this.radioPlan = [];
    this.pendingRadioPlanSongIds = new Set();
    this.radioPlanPromise = null;
    this.radioPlanRevision = 0;
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
      mixHistoryPercent: 80,
      maxConsecutiveAutoDJ: 10,
      announceAutoDJ: true,
      repeatCooldownHours: 12,
      playlistUrls: [],
      playlistFallbackToRandom: true,
      genreFilterEnabled: true,
      selectedGenres: [],
      bpmTransitionsEnabled: true,
      artistSpacingMinutes: 90,
      albumSpacingMinutes: 360,
      noveltyBudgetPercent: 20,
      noveltyCatalogAgeDays: 10,
      requestSeedsEnabled: true,
      liveFeedbackEnabled: true,
      previewEnabled: true,
      chatVotingEnabled: false,
      chatVoteCloseBeforeEndSeconds: 20,
      ...(config || {})
    };
    this.config.enabled = typeof this.config.enabled === 'boolean' ? this.config.enabled : false;
    this.config.historyShuffled = typeof this.config.historyShuffled === 'boolean'
      ? this.config.historyShuffled
      : true;
    this.config.announceAutoDJ = typeof this.config.announceAutoDJ === 'boolean'
      ? this.config.announceAutoDJ
      : true;
    this.config.playlistFallbackToRandom = typeof this.config.playlistFallbackToRandom === 'boolean'
      ? this.config.playlistFallbackToRandom
      : true;
    this.config.genreFilterEnabled = typeof this.config.genreFilterEnabled === 'boolean'
      ? this.config.genreFilterEnabled
      : true;
    this.config.bpmTransitionsEnabled = typeof this.config.bpmTransitionsEnabled === 'boolean'
      ? this.config.bpmTransitionsEnabled
      : true;
    this.config.requestSeedsEnabled = typeof this.config.requestSeedsEnabled === 'boolean'
      ? this.config.requestSeedsEnabled
      : true;
    this.config.liveFeedbackEnabled = typeof this.config.liveFeedbackEnabled === 'boolean'
      ? this.config.liveFeedbackEnabled
      : true;
    this.config.previewEnabled = typeof this.config.previewEnabled === 'boolean'
      ? this.config.previewEnabled
      : true;
    this.config.chatVotingEnabled = typeof this.config.chatVotingEnabled === 'boolean'
      ? this.config.chatVotingEnabled
      : false;
    this.config.selectedGenres = this._normalizeGenres(this.config.selectedGenres);
    const configuredCooldownHours = Number(this.config.repeatCooldownHours);
    const cooldownHours = Number.isFinite(configuredCooldownHours)
      ? Math.floor(configuredCooldownHours)
      : 12;
    this.config.repeatCooldownHours = Math.min(Math.max(cooldownHours, 1), 168);
    const configuredMixHistoryPercent = Number(this.config.mixHistoryPercent);
    const mixHistoryPercent = Number.isFinite(configuredMixHistoryPercent)
      ? Math.floor(configuredMixHistoryPercent)
      : 80;
    this.config.mixHistoryPercent = Math.min(Math.max(mixHistoryPercent, 0), 100);
    const configuredMaxConsecutive = Number(this.config.maxConsecutiveAutoDJ);
    const maxConsecutiveAutoDJ = Number.isFinite(configuredMaxConsecutive)
      ? Math.floor(configuredMaxConsecutive)
      : 10;
    this.config.maxConsecutiveAutoDJ = Math.min(Math.max(maxConsecutiveAutoDJ, 1), 100);
    this.config.artistSpacingMinutes = this._normalizeInteger(this.config.artistSpacingMinutes, 90, 0, 24 * 60);
    this.config.albumSpacingMinutes = this._normalizeInteger(this.config.albumSpacingMinutes, 360, 0, 7 * 24 * 60);
    this.config.noveltyBudgetPercent = this._normalizeInteger(this.config.noveltyBudgetPercent, 20, 0, 100);
    this.config.noveltyCatalogAgeDays = this._normalizeInteger(this.config.noveltyCatalogAgeDays, 10, 1, 60);
    this.config.chatVoteCloseBeforeEndSeconds = this._normalizeInteger(
      this.config.chatVoteCloseBeforeEndSeconds,
      20,
      5,
      120
    );
    this.invalidateRadioPlan('config-update');
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
    this._setResult('ready', 'Auto-DJ wartet auf den naechsten freien Queue-Slot.');
  }

  deactivate() {
    this.isActive = false;
    this.consecutiveCount = 0;
    this._setResult('idle', 'Auto-DJ pausiert fuer Zuschauer-Requests.');
  }

  onSongRequested() {
    this.deactivate();
  }

  async onQueueEmpty() {
    if (!this.config.enabled && !this.hasArtistRadio()) {
      this._setResult('disabled', 'Auto-DJ ist deaktiviert.');
      return null;
    }
    this.isActive = true;
    this._setResult('selecting', 'Auto-DJ sucht den naechsten Titel.');
    return this.getNextSong();
  }

  async getNextSong(force = false) {
    if (!this.config.enabled && !this.hasArtistRadio()) {
      this._setResult('disabled', 'Auto-DJ ist deaktiviert.');
      return null;
    }
    if (!force && !this.isActive && !this.hasArtistRadio()) {
      this._setResult('idle', 'Auto-DJ wartet auf einen freien Queue-Slot.');
      return null;
    }
    if (!force && !this.hasArtistRadio() && this.consecutiveCount >= this.config.maxConsecutiveAutoDJ) {
      this.isActive = false;
      this._setResult(
        'limit-reached',
        `Auto-DJ-Limit von ${this.config.maxConsecutiveAutoDJ} aufeinanderfolgenden Titeln erreicht.`,
        { maxConsecutiveAutoDJ: this.config.maxConsecutiveAutoDJ }
      );
      return null;
    }

    const track = await this._selectTrack();
    if (!track) {
      if (!['error', 'no-playlist-context', 'no-genre-match', 'novelty-budget'].includes(this.lastResult.state)) {
        this._setResult('no-track', 'Kein passender Auto-DJ-Titel gefunden. Pruefe Playlist oder History.');
      }
      return null;
    }

    this._setResult('selected', `Ausgewaehlt: ${track.title || 'Unbekannter Titel'}`, {
      title: track.title || 'Unbekannter Titel'
    });
    return {
      song: {
        ...track,
        requestedBy: 'AutoDJ'
      },
      announce: this.config.announceAutoDJ,
      selectionSource: this.selectionSource
    };
  }

  reset() {
    this.consecutiveCount = 0;
    this.playedInSession.clear();
    this.playedSongIds.clear();
    this.playlistTrackIndices.clear();
    this.relatedTrackIndices.clear();
    this.mixSeedIndex = 0;
    this.lastPlaylistTrack = null;
    this.currentRadioContext = null;
    this.manualRadioSeed = null;
    this.requestSeeds = [];
    this.recentSelections = [];
    this.recentNovelty = [];
    this.genreSelectionCounts.clear();
    this.radioPlan = [];
    this.pendingRadioPlanSongIds.clear();
    this.radioPlanPromise = null;
    this.radioPlanRevision += 1;
  }

  markTrackStarted(track) {
    this.consecutiveCount += 1;
    this.isActive = true;
    if (track?.youtubeId) {
      this.playedInSession.add(track.youtubeId);
    }
    const songId = Number(track?.catalogSongId ?? track?.songId);
    const isReservedPlanTrack = Number(track?.radioPlanRevision) === this.radioPlanRevision;
    if (Number.isInteger(songId) && songId > 0) this.playedSongIds.set(songId, this.now());
    if (Number.isInteger(songId) && songId > 0) this.pendingRadioPlanSongIds.delete(songId);
    if (track?.radioNovelty) {
      this.recentNovelty.push(true);
      this.recentNovelty = this.recentNovelty.slice(-10);
    } else if (track?.requestedBy === 'AutoDJ') {
      this.recentNovelty.push(false);
      this.recentNovelty = this.recentNovelty.slice(-10);
    }
    if (track?.requestedBy === 'AutoDJ' || track?.radioRequestSeed) this._consumeRequestSeedInfluence();
    this._rememberDiversity(track);
    this.setRadioContext(track);
    if (!isReservedPlanTrack) this.invalidateRadioPlan('external-track-started');
    this._setResult('playing', `Spielt: ${track?.title || 'Unbekannter Titel'}`, {
      title: track?.title || 'Unbekannter Titel'
    });
  }

  setPlaybackSeed(track) {
    this.invalidateRadioPlan('playback-seed');
    this.setRadioContext(track);
    if (!track?.youtubeId) return false;
    this.lastPlaylistTrack = { ...track };
    return true;
  }

  startArtistRadio(track) {
    const provider = String(track?.provider || track?.source || 'youtube').toLowerCase();
    const youtubeId = String(track?.youtubeId || track?.providerId || '').trim();
    if (provider !== 'youtube' || !youtubeId) {
      this._setResult('artist-radio-seed-required', 'Song-Radio benoetigt einen YouTube-Titel als Startpunkt.');
      return false;
    }
    this.invalidateRadioPlan('artist-radio-start');
    this.manualRadioSeed = {
      ...track,
      youtubeId,
      startedAt: this.now()
    };
    this.isActive = true;
    this.setRadioContext(this.manualRadioSeed);
    this._setResult('artist-radio-ready', `Song-Radio startet ab: ${track?.title || youtubeId}`, {
      title: track?.title || '',
      artist: track?.artist || '',
      youtubeId
    });
    return true;
  }

  hasArtistRadio() {
    return Boolean(this.manualRadioSeed?.youtubeId);
  }

  stopArtistRadio() {
    if (!this.manualRadioSeed) return false;
    this.manualRadioSeed = null;
    this.invalidateRadioPlan('artist-radio-stop');
    this.isActive = Boolean(this.config.enabled);
    this._setResult('artist-radio-stopped', 'Song-Radio beendet.');
    return true;
  }

  setRadioContext(track) {
    if (!track || typeof track !== 'object') return false;
    const bpm = Number(track.bpm);
    this.currentRadioContext = {
      catalogSongId: Number(track.catalogSongId ?? track.songId) || null,
      title: String(track.title || '').trim(),
      artist: String(track.artist || '').trim(),
      album: String(track.album || '').trim() || null,
      bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
      genres: this._normalizeGenres(track.genres || track.categories || [])
    };
    return true;
  }

  setRequestSeed(track) {
    if (!this.config.requestSeedsEnabled || !track || typeof track !== 'object') return false;
    const artist = String(track.artist || '').trim();
    const artistKey = this._normalizeText(artist);
    const genres = this._normalizeGenres(track.genres || track.categories || []);
    if (!artistKey && genres.length === 0) return false;

    const now = this.now();
    this._pruneRequestSeeds(now);
    const key = `${artistKey}|${genres.join('|')}`;
    const existing = this.requestSeeds.find((seed) => seed.key === key);
    if (existing) {
      existing.weight = Math.min(3, Number(existing.weight || 1) + 1);
      existing.remaining = Math.max(Number(existing.remaining) || 0, 6);
      existing.addedAt = now;
      this.invalidateRadioPlan('request-seed');
      return true;
    }
    this.requestSeeds.push({
      key,
      artist,
      artistKey,
      genres,
      weight: 1,
      remaining: 6,
      addedAt: now
    });
    this.requestSeeds = this.requestSeeds.slice(-6);
    this.invalidateRadioPlan('request-seed');
    return true;
  }

  _getActiveRequestSeeds(now = this.now()) {
    const maximumAgeMs = 12 * 60 * 60 * 1000;
    return this.requestSeeds.filter((seed) => {
      const remaining = Number(seed?.remaining);
      const addedAt = Number(seed?.addedAt);
      return remaining > 0 && Number.isFinite(addedAt) && now - addedAt < maximumAgeMs;
    });
  }

  _pruneRequestSeeds(now = this.now()) {
    this.requestSeeds = this._getActiveRequestSeeds(now);
  }

  _consumeRequestSeedInfluence() {
    const now = this.now();
    this.requestSeeds = this._getActiveRequestSeeds(now).map((seed) => ({
      ...seed,
      remaining: Math.max(0, Number(seed.remaining) - 1)
    })).filter((seed) => seed.remaining > 0);
  }

  _getRequestSeedRemaining() {
    return this._getActiveRequestSeeds().reduce((remaining, seed) => (
      Math.max(remaining, Number(seed.remaining) || 0)
    ), 0);
  }

  _rememberDiversity(track) {
    if (!track || typeof track !== 'object') return;
    const artistKeys = Array.isArray(track.radioArtistKeys)
      ? track.radioArtistKeys.map((artist) => this._normalizeText(artist)).filter(Boolean)
      : String(track.artist || '').split(',').map((artist) => this._normalizeText(artist)).filter(Boolean);
    const genres = this._normalizeGenres(track.genres || track.categories || []);
    const decade = this._getDecade(track.releaseYear);
    const playlistId = String(track.radioPlaylistId || '').trim() || null;
    if (!artistKeys.length && !genres.length && !decade && !playlistId) return;
    this.recentSelections.push({ artistKeys, genres, decade, playlistId });
    this.recentSelections = this.recentSelections.slice(-12);
    if (track.radioGenreTarget) {
      this.genreSelectionCounts.set(
        track.radioGenreTarget,
        (this.genreSelectionCounts.get(track.radioGenreTarget) || 0) + 1
      );
    }
  }

  _getDecade(releaseYear) {
    const year = Number(releaseYear);
    if (!Number.isInteger(year) || year < 1880 || year > 2100) return null;
    return Math.floor(year / 10) * 10;
  }

  _getDiversityScore(candidate, playlistId = null) {
    const recent = this.recentSelections.slice(-8);
    const artistKeys = (candidate?.artists || []).map((artist) => this._normalizeText(artist.name)).filter(Boolean);
    const genres = this._normalizeGenres(candidate?.genres || []);
    const decade = this._getDecade(candidate?.releaseYear);
    const normalizedPlaylistId = String(playlistId || '').trim() || null;
    const artistRepeats = recent.filter((entry) => entry.artistKeys.some((artist) => artistKeys.includes(artist))).length;
    const genreRepeats = recent.filter((entry) => entry.genres.some((genre) => genres.includes(genre))).length;
    const decadeRepeats = decade ? recent.filter((entry) => entry.decade === decade).length : 0;
    const playlistRepeats = normalizedPlaylistId
      ? recent.filter((entry) => entry.playlistId === normalizedPlaylistId).length
      : 0;
    const artistFactor = this._clamp(0.55, 1, 1 - (artistRepeats * 0.14));
    const genreFactor = this._clamp(0.68, 1, 1 - (genreRepeats * 0.07));
    const decadeFactor = this._clamp(0.72, 1, 1 - (decadeRepeats * 0.08));
    const playlistFactor = this._clamp(0.7, 1, 1 - (playlistRepeats * 0.1));
    return {
      artistDiversityFactor: artistFactor,
      genreDiversityFactor: genreFactor,
      decadeDiversityFactor: decadeFactor,
      playlistDiversityFactor: playlistFactor,
      diversityFactor: artistFactor * genreFactor * decadeFactor * playlistFactor
    };
  }


  markPlaybackFailed(error) {
    const detail = error?.message || error || 'Unbekannter Fehler';
    this._setResult('error', `Wiedergabe fehlgeschlagen: ${detail}`, { error: detail });
  }

  getSelectionBlocks(now = this.now()) {
    const cooldownMs = this._getRepeatCooldownMs();
    const artistSpacingMs = Math.max(0, Number(this.config.artistSpacingMinutes) || 0) * 60 * 1000;
    const oldestRelevant = now - Math.max(cooldownMs, artistSpacingMs);
    const blocks = {
      youtubeIds: new Set(),
      titleKeys: new Set(),
      artistKeys: new Set(),
      now
    };

    const addTrack = (track) => {
      const youtubeId = String(track?.youtubeId || '').trim();
      const titleKey = this._normalizeText(track?.titleKey ?? track?.title);
      if (youtubeId) blocks.youtubeIds.add(youtubeId);
      if (titleKey) blocks.titleKeys.add(titleKey);
    };
    const addArtist = (track) => {
      const artistKey = this._normalizeText(track?.artistKey ?? track?.artist);
      if (artistKey) blocks.artistKeys.add(artistKey);
    };

    try {
      const history = this.db.prepare(
        `SELECT youtubeId, title, artist, finishedAt
         FROM plugin_music_bot_history
         WHERE COALESCE(skipped, 0) = 0 AND finishedAt >= ?`
      ).all(oldestRelevant);
      history.forEach((track) => {
        const finishedAt = Number(track?.finishedAt);
        const withinCooldown = !Number.isFinite(finishedAt) || finishedAt >= now - cooldownMs;
        const withinArtistSpacing = artistSpacingMs > 0 && (
          !Number.isFinite(finishedAt) || finishedAt >= now - artistSpacingMs
        );
        if (withinCooldown) addTrack(track);
        if (withinArtistSpacing) addArtist(track);
      });

      const exclusions = this.db.prepare(
        `SELECT youtubeId, titleKey, artistKey
         FROM plugin_music_bot_autodj_exclusions
         WHERE expiresAt > ?`
      ).all(now);
      exclusions.forEach(addTrack);
    } catch (error) {
      this.api.log?.(`[music-bot] AutoDJ block lookup failed: ${error.message}`, 'warn');
    }

    return blocks;
  }

  isTrackBlocked(track, blocks) {
    const youtubeId = String(track?.youtubeId || '').trim();
    const titleKey = this._normalizeText(track?.titleKey ?? track?.title);
    return Boolean(
      (youtubeId && blocks?.youtubeIds?.has(youtubeId)) ||
      (titleKey && blocks?.titleKeys?.has(titleKey))
    );
  }

  getTrackEligibility(track, { blocks, now = this.now(), checkArtistSpacing = true } = {}) {
    if (!track || typeof track !== 'object') return { eligible: false, reason: 'invalid-track' };
    const selectionBlocks = blocks || this.getSelectionBlocks(now);
    if (this.isBanned(track)) return { eligible: false, reason: 'banned' };
    if (this.isTrackBlocked(track, selectionBlocks)) return { eligible: false, reason: 'repeat-cooldown' };

    const songId = Number(track.catalogSongId ?? track.songId);
    if (songId > 0 && songId === Number(this.currentRadioContext?.catalogSongId)) {
      return { eligible: false, reason: 'current-track' };
    }
    if (Number.isInteger(songId) && songId > 0) {
      if (this._isCatalogSongRecentlyPlayed(songId, now)) {
        return { eligible: false, reason: 'session-cooldown' };
      }
    } else if (track.youtubeId && this.playedInSession.has(track.youtubeId)) {
      return { eligible: false, reason: 'session-repeat' };
    }

    if (checkArtistSpacing) {
      const artistKey = this._normalizeText(track.artist);
      if (artistKey && selectionBlocks.artistKeys.has(artistKey)) {
        return { eligible: false, reason: 'artist-spacing' };
      }
    }
    return { eligible: true, reason: null };
  }

  _isCatalogSongRecentlyPlayed(songId, now = this.now()) {
    const playedAt = Number(this.playedSongIds.get(songId));
    if (!Number.isFinite(playedAt) || playedAt <= 0) return false;
    if (playedAt >= now - this._getRepeatCooldownMs()) return true;
    this.playedSongIds.delete(songId);
    return false;
  }

  recordFailedTrack(track, reason, now = this.now()) {
    const songId = Number(track?.catalogSongId ?? track?.songId);
    if (Number.isInteger(songId) && songId > 0) this.pendingRadioPlanSongIds.delete(songId);
    this.invalidateRadioPlan('track-failed');
    const createdAt = now;
    try {
      this.db.prepare(
        `INSERT INTO plugin_music_bot_autodj_exclusions
          (id, youtubeId, titleKey, artistKey, expiresAt, reason, createdAt)
          VALUES (@id, @youtubeId, @titleKey, @artistKey, @expiresAt, @reason, @createdAt)`
      ).run({
        id: randomUUID(),
        youtubeId: String(track?.youtubeId || '').trim(),
        titleKey: this._normalizeText(track?.title),
        artistKey: this._normalizeText(track?.artist),
        expiresAt: createdAt + this._getRepeatCooldownMs(),
        reason: String(reason || ''),
        createdAt
      });
    } catch (error) {
      this.api.log?.(`[music-bot] Failed to persist AutoDJ exclusion: ${error.message}`, 'warn');
    }
  }

  getStatus() {
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      isActive: this.isActive,
      consecutiveCount: this.consecutiveCount,
      maxConsecutiveAutoDJ: this.config.maxConsecutiveAutoDJ,
      historyMinPlays: this.config.historyMinPlays,
      mixHistoryPercent: this.config.mixHistoryPercent,
      repeatCooldownHours: this.config.repeatCooldownHours,
      selectionSource: this.selectionSource,
      blockedCount: this.blockedCount,
      lastSelection: this.lastSelection,
      announceAutoDJ: this.config.announceAutoDJ,
      playlistUrls: this.config.playlistUrls,
      playlistFallbackToRandom: this.config.playlistFallbackToRandom,
      genreFilterEnabled: this.config.genreFilterEnabled,
      selectedGenres: [...this.config.selectedGenres],
      bpmTransitionsEnabled: this.config.bpmTransitionsEnabled,
      artistSpacingMinutes: this.config.artistSpacingMinutes,
      albumSpacingMinutes: this.config.albumSpacingMinutes,
      noveltyBudgetPercent: this.config.noveltyBudgetPercent,
      requestSeedsEnabled: this.config.requestSeedsEnabled,
      liveFeedbackEnabled: this.config.liveFeedbackEnabled,
      previewEnabled: this.config.previewEnabled,
      chatVotingEnabled: this.config.chatVotingEnabled,
      chatVoteCloseBeforeEndSeconds: this.config.chatVoteCloseBeforeEndSeconds,
      requestSeedRemaining: this._getRequestSeedRemaining(),
      requestProfileCount: this._getActiveRequestSeeds().length,
      artistRadio: {
        active: this.hasArtistRadio(),
        title: this.manualRadioSeed?.title || '',
        artist: this.manualRadioSeed?.artist || '',
        youtubeId: this.manualRadioSeed?.youtubeId || ''
      },
      lastPlaylistTrack: this.lastPlaylistTrack
        ? {
          title: this.lastPlaylistTrack.title,
          artist: this.lastPlaylistTrack.artist || '',
          channelName: this.lastPlaylistTrack.channelName || ''
        }
        : null,
      lastResult: this.lastResult
    };
  }

  async _selectTrack() {
    try {
      if (this.hasArtistRadio()) {
        const track = await this._pickArtistRadio();
        if (track) {
          this.selectionSource = 'artist-radio';
          return track;
        }
        return null;
      }
      if (this.radioPlanPromise) await this.radioPlanPromise;
      if (this._hasReservedRadioPlan()) {
        const planned = this._takeReservedRadioPlanTrack();
        if (planned) return planned;
      }
      switch (this.config.mode) {
        case 'playlist':
          return this._pickFromPlaylist();
        case 'random':
          return this._pickRelatedToLastPlaylistTrack();
        case 'mix':
          return this.catalog && this.playlistStore && this._hasConfiguredCatalogRadioSources()
            ? this._pickFromCatalogRadio()
            : this._pickFromMix();
        case 'history':
        default:
          return this._pickFromHistory();
      }
    } catch (error) {
      this.api.log?.(`[music-bot] AutoDJ selection failed: ${error.message}`, 'error');
      this._setResult('error', `Auswahl fehlgeschlagen: ${error.message}`, { error: error.message });
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
    const attempts = Array.isArray(playlist) ? Math.max(playlist.length, 4) : 0;
    const now = this.now();
    const blocks = this.getSelectionBlocks(now);
    for (let i = 0; i < attempts; i += 1) {
      const item = this._nextPlaylistItem();
      if (!item) break;
      try {
        const playlistItem = this.playlistTrackIndices.get(item) || 1;
        const resolved = this.musicResolver.resolvePlaylistEntry
          ? await this.musicResolver.resolvePlaylistEntry(item, playlistItem)
          : await this.musicResolver.resolve(item);
        if (!resolved?.success || !resolved.song) continue;
        this.playlistTrackIndices.set(item, playlistItem + 1);
        const eligibility = this.getTrackEligibility(resolved.song, { blocks, now });
        if (!eligibility.eligible) {
          this.blockedCount += 1;
          continue;
        }
        this.lastPlaylistTrack = resolved.song;
        return resolved.song;
      } catch (error) {
        this.api.log?.(`[music-bot] AutoDJ playlist resolve failed: ${error.message}`, 'error');
      }
    }

    if (this.config.playlistFallbackToRandom !== false) {
      this._setResult('playlist-finished', 'Playlist ist beendet oder nicht verfuegbar. Auto-DJ startet passende Titel aus dem Playlist-Radio.');
      return this._pickRelatedToLastPlaylistTrack();
    }
    return null;
  }

  async _pickRelatedToLastPlaylistTrack() {
    if (!this.lastPlaylistTrack?.youtubeId) {
      this._seedRandomModeFromHistory();
    }
    const seed = this.lastPlaylistTrack;
    if (!seed?.youtubeId || !this.musicResolver.resolvePlaylistEntry) {
      this._setResult('no-playlist-context', 'Es fehlt ein zuletzt gespielter Playlist-Titel als Stilvorlage.');
      return null;
    }

    const now = this.now();
    const blocks = this.getSelectionBlocks(now);
    const encodedId = encodeURIComponent(seed.youtubeId);
    const radioUrl = `https://www.youtube.com/watch?v=${encodedId}&list=RD${encodedId}`;
    let playlistItem = this.relatedTrackIndices.get(radioUrl) || 2;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      let resolved;
      try {
        resolved = await this.musicResolver.resolvePlaylistEntry(radioUrl, playlistItem);
      } catch (error) {
        this.api.log?.(`[music-bot] AutoDJ playlist radio lookup failed: ${error.message}`, 'warn');
        playlistItem += 1;
        continue;
      }
      playlistItem += 1;
      if (!resolved?.success || !resolved.song || resolved.song.youtubeId === seed.youtubeId) continue;
      const eligibility = this.getTrackEligibility(resolved.song, { blocks, now });
      if (!eligibility.eligible) {
        this.blockedCount += 1;
        continue;
      }
      this.relatedTrackIndices.set(radioUrl, playlistItem);
      return resolved.song;
    }

    this.relatedTrackIndices.set(radioUrl, playlistItem);
    return null;
  }

  async _pickFromCatalogRadio() {
    this.selectionSource = null;
    this.lastSelection = null;
    const familiarFirst = this.random() * 100 < this.config.mixHistoryPercent;
    if (familiarFirst) {
      const familiar = this._pickCatalogFamiliar();
      if (familiar) {
        this.selectionSource = 'familiar';
        return familiar;
      }
      const discovery = await this._pickCatalogDiscovery();
      if (discovery) this.selectionSource = 'discovery-fallback';
      return discovery;
    }

    const discovery = await this._pickCatalogDiscovery();
    if (discovery) {
      this.selectionSource = 'discovery';
      return discovery;
    }
    const familiar = this._pickCatalogFamiliar();
    if (familiar) this.selectionSource = 'familiar-fallback';
    return familiar;
  }

  _hasConfiguredCatalogRadioSources() {
    const sources = this.playlistStore?.getRadioSources?.() || [];
    return sources.some((source) => source?.enabled);
  }

  _loadCatalogPool() {
    const items = this.playlistStore?.getRadioCandidates?.() || [];
    const songIds = [...new Set(items.map((item) => Number(item.songId)).filter(Number.isInteger))];
    if (!songIds.length) {
      this.blockedCount = 0;
      return {
        items: [], candidates: [], eligible: [], bySongId: new Map(),
        genreFilterApplied: false, genreEligibleCount: 0, genreTarget: null,
        albumSpacingRelaxed: false, artistSpacingRelaxed: false, noveltyBudgetExhausted: false
      };
    }
    const now = this.now();
    const blocks = this.getSelectionBlocks(now);
    const candidates = this.catalog?.getRadioCandidates?.(songIds, { now }) || [];
    const bySongId = new Map(candidates.map((candidate) => [Number(candidate.songId), candidate]));
    const hardEligible = candidates.filter((candidate) => this._isCatalogCandidateHardEligible(candidate, now, blocks));
    this.blockedCount = candidates.length - hardEligible.length;
    const genreFilterApplied = this._hasSelectedGenres();
    const genreEligible = genreFilterApplied
      ? hardEligible.filter((candidate) => this._matchesSelectedGenre(candidate))
      : hardEligible;
    const strictSpacingEligible = genreEligible.filter((candidate) => (
      !this._isAlbumSpaced(candidate, now) && !this._isArtistSpaced(candidate, now)
    ));
    const albumRelaxedEligible = genreEligible.filter((candidate) => !this._isArtistSpaced(candidate, now));
    const albumSpacingRelaxed = strictSpacingEligible.length === 0 && albumRelaxedEligible.length > 0;
    const artistSpacingRelaxed = strictSpacingEligible.length === 0 && albumRelaxedEligible.length === 0
      && genreEligible.length > 0;
    const afterSpacing = strictSpacingEligible.length
      ? strictSpacingEligible
      : (albumRelaxedEligible.length ? albumRelaxedEligible : genreEligible);
    const noveltyEligible = afterSpacing.filter((candidate) => (
      !this._isNovelCandidate(candidate, now) || this._canSelectNovelty()
    ));
    const noveltyBudgetExhausted = noveltyEligible.length === 0 && afterSpacing.length > 0;
    const eligible = noveltyBudgetExhausted ? [] : noveltyEligible;
    const eligibleIds = new Set(eligible.map((candidate) => Number(candidate.songId)));
    return {
      items: items.filter((item) => eligibleIds.has(Number(item.songId))),
      candidates,
      eligible,
      bySongId,
      genreFilterApplied,
      genreEligibleCount: genreEligible.length,
      genreTarget: this._getBalancedGenreTarget(eligible),
      albumSpacingRelaxed,
      artistSpacingRelaxed,
      noveltyBudgetExhausted
    };
  }

  _pickCatalogFamiliar() {
    const pool = this._loadCatalogPool();
    if (!pool.items.length) {
      this.lastSelection = {
        type: 'familiar',
        genreFilterApplied: pool.genreFilterApplied,
        genreTarget: pool.genreTarget,
        albumSpacingRelaxed: pool.albumSpacingRelaxed,
        artistSpacingRelaxed: pool.artistSpacingRelaxed,
        noveltyBudgetExhausted: pool.noveltyBudgetExhausted,
        candidates: []
      };
      if (pool.genreFilterApplied && pool.candidates.length > 0 && pool.genreEligibleCount === 0) {
        this.isActive = false;
        this._setResult('no-genre-match', 'Kein Katalogtitel passt zu den gewaehlten Radio-Genres.', {
          selectedGenres: this.config.selectedGenres
        });
      }
      return null;
    }

    const groups = new Map();
    pool.items.forEach((item) => {
      const playlistId = String(item.playlistId || '');
      if (!groups.has(playlistId)) {
        groups.set(playlistId, {
          playlistId,
          weight: Math.max(1, Number(item.weight) || 1),
          mode: item.mode === 'shuffle' ? 'shuffle' : 'ordered',
          items: []
        });
      }
      groups.get(playlistId).items.push(item);
    });
    const genreTarget = pool.genreTarget;
    const genreGroups = genreTarget
      ? [...groups.values()].filter((entry) => entry.items.some((item) => (
        this._candidateHasGenre(pool.bySongId.get(Number(item.songId)), genreTarget)
      )))
      : [...groups.values()];
    const group = this._chooseWeighted(genreGroups.length ? genreGroups : [...groups.values()], (entry) => entry.weight);
    if (!group) return null;

    const scored = group.items.map((item) => {
      const candidate = pool.bySongId.get(Number(item.songId));
      return { item, candidate, ...this._scoreCatalogCandidate(candidate, { playlistId: group.playlistId }) };
    }).filter((entry) => entry.candidate && (!genreTarget || this._candidateHasGenre(entry.candidate, genreTarget)));
    const selected = group.mode === 'shuffle'
      ? this._chooseWeighted(scored, (entry) => entry.score)
      : scored[0];
    if (!selected) return null;


    if (group.mode === 'ordered') {
      const length = Math.max(1, Number(selected.item.itemCount) || group.items.length);
      const nextCursor = (Number(selected.item.position) + 1) % length;
      this.playlistStore.advanceRadioCursor?.(group.playlistId, nextCursor);
    }
    this.lastSelection = {
      type: 'familiar',
      playlistId: group.playlistId,
      playlistMode: group.mode,
      playlistWeight: group.weight,
      genreFilterApplied: pool.genreFilterApplied,
      genreTarget,
      albumSpacingRelaxed: pool.albumSpacingRelaxed,
      artistSpacingRelaxed: pool.artistSpacingRelaxed,
      noveltyBudgetExhausted: pool.noveltyBudgetExhausted,
      candidates: scored.map((entry) => ({
        songId: Number(entry.candidate.songId),
        explicitSongFactor: entry.explicitSongFactor,
        implicitSongFactor: entry.implicitSongFactor,
        songFactor: entry.songFactor,
        artistFactor: entry.artistFactor,
        genreFactor: entry.genreFactor,
        bpmFactor: entry.bpmFactor,
        requestSeedFactor: entry.requestSeedFactor,
        score: entry.score
      }))
    };
    return this._catalogCandidateToTrack(selected.candidate, {
      ...selected,
      genreTarget,
      playlistId: group.playlistId,
      albumSpacingRelaxed: pool.albumSpacingRelaxed,
      artistSpacingRelaxed: pool.artistSpacingRelaxed
    });
  }

  async _pickCatalogDiscovery() {
    const pool = this._loadCatalogPool();
    if (!pool.eligible.length) return null;
    const genreTarget = pool.genreTarget;
    const discoveryCandidates = genreTarget
      ? pool.eligible.filter((candidate) => this._candidateHasGenre(candidate, genreTarget))
      : pool.eligible;
    const discoveryEntries = discoveryCandidates.map((candidate) => {
      const playlistId = this._getCandidatePlaylistId(pool.items, candidate);
      return { candidate, playlistId, ...this._scoreCatalogCandidate(candidate, { playlistId }) };
    });
    const seedEntry = this._chooseWeighted(
      discoveryEntries,
      (entry) => entry.score
    );
    if (!seedEntry) return null;
    const seed = this._catalogCandidateToTrack(seedEntry.candidate);
    const now = this.now();
    const blocks = this.getSelectionBlocks(now);
    let discovered = await this._pickRelatedToSeed(seed, blocks, now);
    if (!discovered && this.musicResolver?.resolve) {
      const query = [seed.artist, seed.title].filter(Boolean).join(' ');
      if (query) {
        try {
          const resolved = await this.musicResolver.resolve(query);
          discovered = resolved?.success ? resolved.song : null;
        } catch (error) {
          this.api.log?.(`[music-bot] AutoDJ discovery lookup failed: ${error.message}`, 'warn');
        }
      }
    }
    if (!discovered || !this.getTrackEligibility(discovered, { blocks, now }).eligible) return null;

    try {
      const resolved = this.catalog.resolveOrUpsert(discovered);
      const songId = Number(resolved?.song?.id);
      const canonical = Number.isInteger(songId)
        ? this.catalog.getRadioCandidates?.([songId], { now })?.find((candidate) => Number(candidate.songId) === songId)
        : null;
      if (canonical && !this._isCatalogCandidateHardEligible(canonical, now, blocks)) return null;
      if (canonical && this._hasSelectedGenres() && !this._matchesSelectedGenre(canonical)) return null;
      if (canonical && genreTarget && !this._candidateHasGenre(canonical, genreTarget)) return null;
      const canonicalArtists = (canonical?.artists || []).map((artist) => artist.name).filter(Boolean);
      discovered = {
        ...discovered,
        catalogSongId: Number.isInteger(songId) ? songId : undefined,
        sourceId: resolved?.source?.id || discovered.sourceId,
        releaseYear: canonical?.releaseYear || discovered.releaseYear,
        genres: canonical?.genres || discovered.genres,
        radioArtistKeys: canonicalArtists,
        radioPlaylistId: seedEntry.playlistId,
        radioGenreTarget: genreTarget,
        radioRequestSeed: Boolean(seedEntry.requestSeedMatched)
      };
    } catch (error) {
      this.api.log?.(`[music-bot] AutoDJ discovery catalog lookup failed: ${error.message}`, 'warn');
    }
    this.lastSelection = {
      type: 'discovery',
      seedSongId: Number(seedEntry.candidate.songId),
      genreTarget,
      albumSpacingRelaxed: pool.albumSpacingRelaxed,
      artistSpacingRelaxed: pool.artistSpacingRelaxed,
      candidates: []
    };
    return discovered;
  }

  _isCatalogCandidateHardEligible(candidate, now, blocks = this.getSelectionBlocks(now)) {
    if (!candidate || candidate.feedback === 'down') return false;
    const songId = Number(candidate.songId);
    const candidateTrack = {
      title: candidate.title,
      artist: (candidate.artists || []).map((artist) => artist.name).filter(Boolean).join(', '),
      catalogSongId: songId
    };
    const eligibility = this.getTrackEligibility(candidateTrack, {
      blocks,
      now,
      checkArtistSpacing: false
    });
    if (!eligibility.eligible) return false;
    const cooldownStartedAt = now - this._getRepeatCooldownMs();
    if (candidate.lastPlayedAt !== null && candidate.lastPlayedAt !== undefined
      && Number(candidate.lastPlayedAt) >= cooldownStartedAt) return false;
    return this._eligibleCatalogSources(candidate, now).length > 0;
  }

  isTrackHardEligible(track, now = this.now()) {
    const songId = Number(track?.catalogSongId ?? track?.songId);
    const eligibility = this.getTrackEligibility(track, {
      blocks: this.getSelectionBlocks(now),
      now,
      checkArtistSpacing: !Number.isInteger(songId) || songId <= 0
    });
    if (!eligibility.eligible) return false;
    if (!Number.isInteger(songId) || songId <= 0 || !this.catalog?.getRadioCandidates) return true;
    const candidate = this.catalog.getRadioCandidates([songId], { now })
      .find((entry) => Number(entry.songId) === songId);
    if (!this._isCatalogCandidateHardEligible(candidate, now)) return false;
    const sourceId = Number(track.sourceId);
    if (!Number.isInteger(sourceId) || sourceId <= 0) return true;
    return this._eligibleCatalogSources(candidate, now)
      .some((source) => Number(source.id) === sourceId);
  }

  _isArtistSpaced(candidate, now) {
    if (this.config.artistSpacingMinutes <= 0) return false;
    const cutoff = now - (this.config.artistSpacingMinutes * 60 * 1000);
    return (candidate?.artists || []).some((artist) => (
      artist.lastPlayedAt !== null && artist.lastPlayedAt !== undefined
      && Number(artist.lastPlayedAt) >= cutoff
    ));
  }

  _isAlbumSpaced(candidate, now) {
    if (this.config.albumSpacingMinutes <= 0 || !candidate?.normalizedAlbum && !candidate?.album) return false;
    const lastPlayedAt = Number(candidate.albumLastPlayedAt);
    if (!Number.isFinite(lastPlayedAt) || lastPlayedAt <= 0) return false;
    return lastPlayedAt >= now - (this.config.albumSpacingMinutes * 60 * 1000);
  }

  _scoreCatalogCandidate(candidate, { playlistId = null } = {}) {
    const now = this.now();
    const completePlays = Math.max(0, Number(candidate?.completePlays) || 0);
    const fullCompletions = Math.min(completePlays, Math.max(0, Number(candidate?.fullCompletions) || 0));
    const earlySkips = Math.max(0, Number(candidate?.earlySkips) || 0);
    const implicitRawFactor = this._clamp(
      0.5,
      1.5,
      1 + (completePlays * 0.03) + (fullCompletions * 0.06) - (earlySkips * 0.10)
    );
    const implicitSongFactor = this._decayFactor(
      implicitRawFactor,
      candidate?.implicitEvidenceUpdatedAt,
      now
    );
    const explicitSongFactor = candidate?.feedback === 'up' ? 3 : 1;
    const songFactor = explicitSongFactor * implicitSongFactor;
    const affinities = (candidate?.artists || []).map((artist) => this._decayFeedback(
      artist.affinity,
      artist.affinityUpdatedAt,
      now
    ));
    const affinity = affinities.length ? Math.max(...affinities) : 0;
    const artistFactor = this._clamp(0.4, 2.5, 1 + (affinity * 0.25));
    const radioAffinity = this._decayFeedback(candidate?.radioAffinity, candidate?.radioAffinityUpdatedAt, now);
    const radioAffinityFactor = this._clamp(0.5, 1.6, 1 + (radioAffinity * 0.15));
    const genreScores = Object.entries(candidate?.genreAffinities || {}).map(([genre, score]) => (
      this._decayFeedback(score, candidate?.genreAffinityUpdatedAt?.[genre], now)
    )).filter(Number.isFinite);
    const genreAffinity = genreScores.length ? Math.max(...genreScores) : 0;
    const genreFactor = this._clamp(0.5, 1.6, 1 + (genreAffinity * 0.12));
    const candidateBpm = Number(candidate?.bpm);
    const contextBpm = Number(this.currentRadioContext?.bpm);
    const hasBpmTransition = this.config.bpmTransitionsEnabled
      && Number.isFinite(candidateBpm) && candidateBpm > 0
      && Number.isFinite(contextBpm) && contextBpm > 0;
    const bpmTransition = hasBpmTransition
      ? this._getBpmTransition(candidateBpm, contextBpm)
      : { distance: null, relation: null };
    const bpmFactor = hasBpmTransition
      ? this._clamp(0.65, 1.3, 1.25 - (bpmTransition.distance / 100))
      : 1;
    const longTailFactor = this._clamp(0.8, 1.2, 1 + ((10 - completePlays) * 0.02));
    const diversity = this._getDiversityScore(candidate, playlistId);
    const requestSeed = this._getRequestSeedScore(candidate);
    return {
      explicitSongFactor,
      implicitSongFactor,
      songFactor,
      artistFactor,
      radioAffinityFactor,
      genreFactor,
      bpmFactor,
      bpmDistance: bpmTransition.distance,
      bpmRelation: bpmTransition.relation,
      longTailFactor,
      ...diversity,
      requestSeedFactor: requestSeed.factor,
      requestSeedActive: requestSeed.active,
      requestSeedMatched: requestSeed.matched,
      requestSeedMatchCount: requestSeed.matchCount,
      score: songFactor * artistFactor * radioAffinityFactor * genreFactor * bpmFactor
        * longTailFactor * diversity.diversityFactor * requestSeed.factor
    };
  }

  _decayFeedback(value, updatedAt, now = this.now()) {
    const raw = Number(value) || 0;
    const timestamp = Number(updatedAt);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return raw;
    const ageMs = Math.max(0, now - timestamp);
    return raw * Math.pow(0.5, ageMs / (30 * 24 * 60 * 60 * 1000));
  }

  _decayFactor(factor, updatedAt, now = this.now()) {
    const timestamp = Number(updatedAt);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return factor;
    const ageMs = Math.max(0, now - timestamp);
    const weight = Math.pow(0.5, ageMs / (30 * 24 * 60 * 60 * 1000));
    return 1 + ((factor - 1) * weight);
  }

  _getBpmTransition(candidateBpm, contextBpm) {
    const options = [
      { relation: 'direct', distance: Math.abs(candidateBpm - contextBpm) },
      { relation: 'double-time', distance: Math.abs((candidateBpm * 2) - contextBpm) },
      { relation: 'half-time', distance: Math.abs((candidateBpm / 2) - contextBpm) }
    ];
    return options.reduce((best, option) => (
      option.distance < best.distance ? option : best
    ), options[0]);
  }

  _catalogCandidateToTrack(candidate, scoring = {}) {
    const now = this.now();
    const sources = this._eligibleCatalogSources(candidate, now);
    if (!candidate || !sources.length) return null;
    const primary = sources[0];
    const alternatives = sources.slice(1, 2).map((source) => this._sourceToTrack(source));
    return {
      title: candidate.title,
      artist: (candidate.artists || []).map((artist) => artist.name).filter(Boolean).join(', '),
      canonicalKey: candidate.canonicalKey,
      catalogSongId: Number(candidate.songId),
      album: candidate.album || null,
      bpm: Number(candidate.bpm) || null,
      releaseYear: Number(candidate.releaseYear) || null,
      genres: Array.isArray(candidate.genres) ? [...candidate.genres] : [],
      radioArtistKeys: (candidate.artists || []).map((artist) => artist.name).filter(Boolean),
      radioPlaylistId: String(scoring.playlistId || '').trim() || null,
      radioGenreTarget: scoring.genreTarget || null,
      radioNovelty: this._isNovelCandidate(candidate, now),
      radioRequestSeed: Boolean(scoring.requestSeedMatched),
      radioReasons: this._buildCandidateReasons(candidate, scoring),
      ...this._sourceToTrack(primary),
      alternativeSources: alternatives
    };
  }

  getRadioPreview(limit = 3) {
    if (!this.catalog || !this.playlistStore || !this._hasConfiguredCatalogRadioSources()) return [];
    const safeLimit = this._normalizeInteger(limit, 3, 1, 10);
    const pool = this._loadCatalogPool();
    if (!pool.eligible.length) return [];
    const target = pool.genreTarget;
    const entries = pool.eligible.map((candidate) => {
      const playlistId = this._getCandidatePlaylistId(pool.items, candidate);
      return {
        candidate,
        playlistId,
        ...this._scoreCatalogCandidate(candidate, { playlistId })
      };
    }).sort((left, right) => (
      right.score - left.score || Number(left.candidate.songId) - Number(right.candidate.songId)
    ));
    const prioritised = target
      ? [
        ...entries.filter((entry) => this._candidateHasGenre(entry.candidate, target)),
        ...entries.filter((entry) => !this._candidateHasGenre(entry.candidate, target))
      ]
      : entries;
    return prioritised.slice(0, safeLimit).map((entry) => ({
      id: `catalog:${entry.candidate.songId}:${entry.candidate.canonicalKey || ''}`,
      songId: Number(entry.candidate.songId),
      title: entry.candidate.title,
      artist: (entry.candidate.artists || []).map((artist) => artist.name).filter(Boolean).join(', '),
      album: entry.candidate.album || null,
      bpm: Number(entry.candidate.bpm) || null,
      genres: Array.isArray(entry.candidate.genres) ? [...entry.candidate.genres] : [],
      score: Number(entry.score.toFixed(4)),
      reasons: this._buildCandidateReasons(entry.candidate, { ...entry, genreTarget: target }),
      isNovel: this._isNovelCandidate(entry.candidate, this.now())
    }));
  }

  invalidateRadioPlan(_reason = 'invalidated') {
    this.radioPlan = [];
    this.pendingRadioPlanSongIds.clear();
    this.radioPlanPromise = null;
    this.radioPlanRevision += 1;
    return this.radioPlanRevision;
  }

  _canBuildRadioPlan() {
    return !this.hasArtistRadio()
      && this.config.mode === 'mix'
      && Boolean(this.catalog && this.playlistStore && this._hasConfiguredCatalogRadioSources());
  }

  _hasReservedRadioPlan() {
    return !this.hasArtistRadio()
      && this.config.mode === 'mix'
      && Array.isArray(this.radioPlan)
      && this.radioPlan.length > 0;
  }

  _clonePlanData(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  _capturePlanningState(cursorState = null) {
    return {
      playedInSession: [...this.playedInSession],
      playedSongIds: [...this.playedSongIds.entries()],
      playlistTrackIndices: [...this.playlistTrackIndices.entries()],
      relatedTrackIndices: [...this.relatedTrackIndices.entries()],
      mixSeedIndex: this.mixSeedIndex,
      lastPlaylistTrack: this._clonePlanData(this.lastPlaylistTrack),
      currentRadioContext: this._clonePlanData(this.currentRadioContext),
      requestSeeds: this._clonePlanData(this.requestSeeds),
      recentNovelty: [...this.recentNovelty],
      genreSelectionCounts: [...this.genreSelectionCounts.entries()],
      recentSelections: this._clonePlanData(this.recentSelections),
      selectionSource: this.selectionSource,
      lastSelection: this._clonePlanData(this.lastSelection),
      blockedCount: this.blockedCount,
      cursorState: cursorState ? this._clonePlanData(cursorState) : null
    };
  }

  _restorePlanningState(state) {
    if (!state || typeof state !== 'object') return;
    this.playedInSession = new Set(state.playedInSession || []);
    this.playedSongIds = new Map(state.playedSongIds || []);
    this.playlistTrackIndices = new Map(state.playlistTrackIndices || []);
    this.relatedTrackIndices = new Map(state.relatedTrackIndices || []);
    this.mixSeedIndex = Number(state.mixSeedIndex) || 0;
    this.lastPlaylistTrack = this._clonePlanData(state.lastPlaylistTrack) || null;
    this.currentRadioContext = this._clonePlanData(state.currentRadioContext) || null;
    this.requestSeeds = this._clonePlanData(state.requestSeeds) || [];
    this.recentNovelty = [...(state.recentNovelty || [])];
    this.genreSelectionCounts = new Map(state.genreSelectionCounts || []);
    this.recentSelections = this._clonePlanData(state.recentSelections) || [];
    this.selectionSource = state.selectionSource || null;
    this.lastSelection = this._clonePlanData(state.lastSelection) || null;
    this.blockedCount = Number(state.blockedCount) || 0;
  }

  _createPlanningPlaylistStore(initialCursorState = null) {
    const sourceStore = this.playlistStore;
    const cursors = new Map(Object.entries(initialCursorState || {}));
    const updates = [];
    const getPlaylistId = (source) => String(source?.playlistId || source?.id || '');
    const getSources = () => {
      const sources = typeof sourceStore?.getRadioSources === 'function'
        ? sourceStore.getRadioSources.call(sourceStore)
        : [];
      return (Array.isArray(sources) ? sources : []).map((source) => {
        const playlistId = getPlaylistId(source);
        const cursor = cursors.has(playlistId)
          ? Number(cursors.get(playlistId)) || 0
          : Number(source?.cursor) || 0;
        return { ...source, cursor };
      });
    };
    const virtualStore = Object.create(sourceStore || null);
    virtualStore.getRadioSources = getSources;
    virtualStore.getRadioCandidates = (...args) => {
      const candidates = typeof sourceStore?.getRadioCandidates === 'function'
        ? sourceStore.getRadioCandidates.apply(sourceStore, args)
        : [];
      const sourcesByPlaylist = new Map(getSources().map((source) => [getPlaylistId(source), source]));
      const grouped = new Map();
      (Array.isArray(candidates) ? candidates : []).forEach((item) => {
        const playlistId = String(item?.playlistId || '');
        if (!grouped.has(playlistId)) grouped.set(playlistId, []);
        grouped.get(playlistId).push(item);
      });
      return [...grouped.entries()].flatMap(([playlistId, items]) => {
        const ordered = items.slice().sort((left, right) => (
          Number(left?.position) - Number(right?.position)
        ));
        if (ordered.length < 2) return ordered;
        const source = sourcesByPlaylist.get(playlistId);
        const cursor = cursors.has(playlistId)
          ? Number(cursors.get(playlistId)) || 0
          : Number(source?.cursor) || 0;
        let start = ordered.findIndex((item) => Number(item?.position) >= cursor);
        if (start < 0) start = 0;
        return [...ordered.slice(start), ...ordered.slice(0, start)];
      });
    };
    virtualStore.advanceRadioCursor = (playlistId, cursor) => {
      const id = String(playlistId || '');
      const next = Math.max(0, Math.floor(Number(cursor) || 0));
      cursors.set(id, next);
      updates.push({ playlistId: id, cursor: next });
      return { playlistId: id, cursor: next };
    };
    virtualStore.getPlanningCursorState = () => Object.fromEntries(cursors.entries());
    virtualStore.getPlanningCursorUpdates = () => updates.map((update) => ({ ...update }));
    return virtualStore;
  }

  _createPlanSelector(initialState = null) {
    const playlistStore = this._createPlanningPlaylistStore(initialState?.cursorState);
    const planner = new AutoDJ(this.config, this.musicResolver, this.db, this.api, {
      catalog: this.catalog,
      playlistStore,
      now: this.now,
      random: this.random
    });
    planner._restorePlanningState(initialState || this._capturePlanningState());
    planner.isActive = true;
    return { planner, playlistStore };
  }

  _applyPlannedSelectionState(state) {
    if (!state || typeof state !== 'object') return;
    this.playlistTrackIndices = new Map(state.playlistTrackIndices || []);
    this.relatedTrackIndices = new Map(state.relatedTrackIndices || []);
    this.mixSeedIndex = Number(state.mixSeedIndex) || 0;
    this.lastPlaylistTrack = this._clonePlanData(state.lastPlaylistTrack) || null;
    this.selectionSource = state.selectionSource || null;
    this.lastSelection = this._clonePlanData(state.lastSelection) || null;
    this.blockedCount = Number(state.blockedCount) || 0;
  }

  async _buildRadioPlan(targetLength, revision) {
    const plan = Array.isArray(this.radioPlan) ? [...this.radioPlan] : [];
    const initialState = plan.length
      ? plan[plan.length - 1].stateAfterStart
      : this._capturePlanningState();
    const { planner, playlistStore } = this._createPlanSelector(initialState);

    while (plan.length < targetLength) {
      const updateStart = playlistStore.getPlanningCursorUpdates().length;
      let track;
      try {
        track = await planner._pickFromCatalogRadio();
      } catch (error) {
        this.api.log?.(`[music-bot] DJ plan selection failed: ${error.message}`, 'warn');
        break;
      }
      if (!track) break;

      const selectionState = planner._capturePlanningState(playlistStore.getPlanningCursorState());
      const selectionSource = planner.selectionSource;
      const lastSelection = planner._clonePlanData(planner.lastSelection);
      const cursorUpdates = playlistStore.getPlanningCursorUpdates().slice(updateStart);
      planner.markTrackStarted({ ...track, requestedBy: 'AutoDJ' });
      const stateAfterStart = planner._capturePlanningState(playlistStore.getPlanningCursorState());
      const songId = Number(track.catalogSongId ?? track.songId);
      const matchingScore = lastSelection?.candidates?.find((candidate) => (
        Number(candidate.songId) === songId
      ))?.score;
      const key = Number.isInteger(songId) && songId > 0
        ? `song:${songId}`
        : `source:${track.youtubeId || track.providerId || track.url || track.title || plan.length}`;
      plan.push({
        key,
        songId: Number.isInteger(songId) && songId > 0 ? songId : null,
        track: this._clonePlanData(track),
        selectionSource,
        lastSelection,
        selectionState,
        stateAfterStart,
        cursorUpdates,
        score: Number(matchingScore) || 0,
        reasons: this._clonePlanData(track.radioReasons) || [],
        isNovel: Boolean(track.radioNovelty)
      });
    }

    if (revision === this.radioPlanRevision) this.radioPlan = plan;
    return this.radioPlan;
  }

  async _ensureRadioPlan(limit = 5) {
    if (!this._canBuildRadioPlan()) return [];
    const safeLimit = this._normalizeInteger(limit, 5, 1, 10);
    const targetLength = safeLimit;
    if (this.radioPlan.length >= targetLength) return this.radioPlan;
    if (this.radioPlanPromise) {
      await this.radioPlanPromise;
      return this.radioPlan;
    }
    const revision = this.radioPlanRevision;
    const operation = this._buildRadioPlan(targetLength, revision);
    this.radioPlanPromise = operation;
    try {
      await operation;
    } finally {
      if (this.radioPlanPromise === operation) this.radioPlanPromise = null;
    }
    return this.radioPlan;
  }

  _takeReservedRadioPlanTrack() {
    while (this.radioPlan.length) {
      const entry = this.radioPlan.shift();
      const track = entry?.track;
      const songId = Number(entry?.songId);
      if (!track || !this.isTrackHardEligible(track)) {
        this.invalidateRadioPlan('reserved-plan-ineligible');
        return null;
      }
      this._applyPlannedSelectionState(entry.selectionState);
      (entry.cursorUpdates || []).forEach((update) => {
        this.playlistStore.advanceRadioCursor?.(update.playlistId, update.cursor);
      });
      if (Number.isInteger(songId) && songId > 0) this.pendingRadioPlanSongIds.add(songId);
      this.selectionSource = entry.selectionSource;
      this.lastSelection = this._clonePlanData(entry.lastSelection) || null;
      return {
        ...track,
        radioPlanRevision: this.radioPlanRevision,
        radioPlanSongId: Number.isInteger(songId) && songId > 0 ? songId : undefined
      };
    }
    return null;
  }

  async getRadioPlan(limit = 5) {
    const safeLimit = this._normalizeInteger(limit, 5, 1, 10);
    const plan = await this._ensureRadioPlan(safeLimit);
    return plan.slice(0, safeLimit).map((entry, index) => ({
      id: `plan:${this.radioPlanRevision}:${entry.key}`,
      songId: entry.songId,
      title: entry.track.title,
      artist: entry.track.artist,
      album: entry.track.album || null,
      bpm: Number(entry.track.bpm) || null,
      genres: Array.isArray(entry.track.genres) ? [...entry.track.genres] : [],
      score: entry.score,
      reasons: entry.reasons,
      isNovel: entry.isNovel,
      selectionSource: entry.selectionSource,
      position: index + 1
    }));
  }

  getTrackForPreview(previewId) {
    const match = /^catalog:(\d+):/.exec(String(previewId || ''));
    const songId = Number(match?.[1]);
    if (!Number.isInteger(songId) || songId <= 0) return null;
    const pool = this._loadCatalogPool();
    const candidate = pool.eligible.find((entry) => Number(entry.songId) === songId);
    if (!candidate) return null;
    const playlistId = this._getCandidatePlaylistId(pool.items, candidate);
    const scoring = this._scoreCatalogCandidate(candidate, { playlistId });
    const selectedGenre = this.config.selectedGenres
      .filter((genre) => this._candidateHasGenre(candidate, genre))
      .reduce((best, genre) => {
        if (!best) return genre;
        return (this.genreSelectionCounts.get(genre) || 0) < (this.genreSelectionCounts.get(best) || 0)
          ? genre
          : best;
      }, null);
    this.selectionSource = 'vote';
    this.lastSelection = {
      type: 'vote',
      songId,
      genreTarget: selectedGenre,
      albumSpacingRelaxed: pool.albumSpacingRelaxed,
      artistSpacingRelaxed: pool.artistSpacingRelaxed
    };
    return this._catalogCandidateToTrack(candidate, {
      ...scoring,
      genreTarget: selectedGenre,
      playlistId,
      albumSpacingRelaxed: pool.albumSpacingRelaxed,
      artistSpacingRelaxed: pool.artistSpacingRelaxed
    });
  }

  _hasSelectedGenres() {
    return this.config.genreFilterEnabled && this.config.selectedGenres.length > 0;
  }

  _matchesSelectedGenre(candidate) {
    return this.config.selectedGenres.some((genre) => this._candidateHasGenre(candidate, genre));
  }

  _candidateHasGenre(candidate, genre) {
    return Array.isArray(candidate?.genres) && candidate.genres.includes(genre);
  }

  _getCandidatePlaylistId(items, candidate) {
    const item = (items || []).find((entry) => Number(entry.songId) === Number(candidate?.songId));
    const playlistId = String(item?.playlistId || '').trim();
    return playlistId || null;
  }

  _getBalancedGenreTarget(candidates) {
    if (!this._hasSelectedGenres() || !Array.isArray(candidates) || !candidates.length) return null;
    const available = this.config.selectedGenres.filter((genre) => (
      candidates.some((candidate) => this._candidateHasGenre(candidate, genre))
    ));
    if (!available.length) return null;
    return available.reduce((best, genre) => {
      const bestCount = this.genreSelectionCounts.get(best) || 0;
      const genreCount = this.genreSelectionCounts.get(genre) || 0;
      return genreCount < bestCount ? genre : best;
    }, available[0]);
  }

  _isNovelCandidate(candidate, now) {
    const createdAt = Number(candidate?.createdAt);
    if (!Number.isFinite(createdAt) || createdAt <= 0) return false;
    return createdAt >= now - (this.config.noveltyCatalogAgeDays * 24 * 60 * 60 * 1000);
  }

  _canSelectNovelty() {
    const budget = Number(this.config.noveltyBudgetPercent) || 0;
    if (budget <= 0 || this.recentNovelty.at(-1) === true) return false;
    const allowedInWindow = Math.ceil((budget / 100) * 10);
    if (allowedInWindow <= 0) return false;
    return this.recentNovelty.filter(Boolean).length < allowedInWindow;
  }

  _getRequestSeedScore(candidate) {
    const now = this.now();
    const seeds = this.config.requestSeedsEnabled ? this._getActiveRequestSeeds(now) : [];
    if (!seeds.length) return { active: false, matched: false, matchCount: 0, factor: 1 };

    let boost = 0;
    let matchCount = 0;
    seeds.forEach((seed) => {
      const ageMs = Math.max(0, now - Number(seed.addedAt));
      const recency = Math.pow(0.5, ageMs / (2 * 60 * 60 * 1000));
      const remaining = this._clamp(0.2, 1, Number(seed.remaining) / 6);
      const strength = this._clamp(0.25, 3, Number(seed.weight) || 1) * recency * remaining;
      const artistMatch = seed.artistKey && (candidate?.artists || []).some((artist) => (
        this._normalizeText(artist.name) === seed.artistKey
      ));
      const genreMatch = seed.genres.some((genre) => this._candidateHasGenre(candidate, genre));
      if (artistMatch) {
        boost += 0.4 * strength;
        matchCount += 1;
      } else if (genreMatch) {
        boost += 0.22 * strength;
        matchCount += 1;
      }
    });
    return {
      active: true,
      matched: matchCount > 0,
      matchCount,
      factor: this._clamp(1, 1.75, 1 + boost)
    };
  }

  _buildCandidateReasons(candidate, scoring = {}) {
    const reasons = [];
    const matchedGenres = this.config.selectedGenres.filter((genre) => this._candidateHasGenre(candidate, genre));
    if (this._hasSelectedGenres() && matchedGenres.length) {
      reasons.push({ code: 'genre-filter', text: `Genre: ${matchedGenres.join(', ')}` });
    }
    if (scoring.genreTarget && this._candidateHasGenre(candidate, scoring.genreTarget)) {
      reasons.push({ code: 'genre-balance', text: `Ausgleich: ${scoring.genreTarget}` });
    }
    if (Number(scoring.bpmFactor) !== 1 && Number.isFinite(Number(scoring.bpmDistance))) {
      const relation = scoring.bpmRelation === 'double-time'
        ? ' (Doubletime)'
        : (scoring.bpmRelation === 'half-time' ? ' (Halftime)' : '');
      reasons.push({ code: 'bpm-transition', text: `BPM-Uebergang${relation}: ${Math.round(scoring.bpmDistance)} BPM Abstand` });
    }
    if (scoring.requestSeedMatched) {
      reasons.push({ code: 'request-seed', text: 'Stilvorlage eines Viewer-Requests' });
    }
    if (Number(scoring.longTailFactor) > 1) {
      reasons.push({ code: 'long-tail', text: 'Long-Tail-Bonus fuer selten gespielte Titel' });
    }
    if (Number(scoring.diversityFactor) < 1) {
      reasons.push({ code: 'diversity', text: 'Diversitaetsabstand zu kuerzlich gespielten Titeln' });
    }
    if (Number(candidate?.radioAffinity) > 0 || Number(scoring.radioAffinityFactor) > 1) {
      reasons.push({ code: 'live-feedback', text: 'Passt zu deinem Live-Feedback' });
    }
    if (this._isNovelCandidate(candidate, this.now())) {
      reasons.push({ code: 'novelty-budget', text: 'Innerhalb des Neuheitsbudgets' });
    }
    if (scoring.albumSpacingRelaxed) {
      reasons.push({ code: 'album-spacing-relaxed', text: 'Album-Abstand wurde bei leerem Pool gelockert' });
    }
    if (scoring.artistSpacingRelaxed) {
      reasons.push({ code: 'artist-spacing-relaxed', text: 'Kuenstler-Abstand wurde bei leerem Pool gelockert' });
    }
    return reasons;
  }

  _sourceToTrack(source) {
    const provider = source?.provider || 'youtube';
    return {
      sourceId: source?.id,
      provider,
      providerId: source?.providerId,
      source: provider,
      trackKey: source?.trackKey || `${provider}:${source?.providerId}`,
      url: source?.url,
      channelId: source?.channelId || null,
      channelName: source?.channelName || null,
      streamUrl: source?.streamUrl,
      localPath: source?.localPath,
      youtubeId: provider === 'youtube' ? source?.providerId : undefined
    };
  }

  _eligibleCatalogSources(candidate, now) {
    return (candidate?.sources || []).filter((source) => {
      if (Number(source.cooldownUntil) > now) return false;
      return !this.isBanned({ ...candidate, ...this._sourceToTrack(source) });
    });
  }

  getAlternativeSource(track) {
    const source = Array.isArray(track?.alternativeSources) ? track.alternativeSources[0] : null;
    if (!source) return null;
    const { alternativeSources, ...base } = track;
    return { ...base, ...source, alternativeSources: [] };
  }

  recordSourceFailure(track, error, now = this.now()) {
    if (!track?.sourceId || !this.catalog?.recordSourceFailure) return null;
    return this.catalog.recordSourceFailure(track.sourceId, error, now);
  }

  recordSourceSuccess(track) {
    if (!track?.sourceId || !this.catalog?.recordSourceSuccess) return null;
    return this.catalog.recordSourceSuccess(track.sourceId);
  }

  _chooseWeighted(items, weightOf) {
    if (!items.length) return null;
    const weights = items.map((item) => Math.max(0, Number(weightOf(item)) || 0));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) return items[0];
    const roll = this._clamp(0, 0.999999999, Number(this.random()) || 0) * total;
    let threshold = 0;
    for (let index = 0; index < items.length; index += 1) {
      threshold += weights[index];
      if (roll < threshold) return items[index];
    }
    return items.at(-1);
  }

  _clamp(min, max, value) {
    return Math.min(max, Math.max(min, value));
  }

  async _pickFromMix() {
    const candidates = this._loadHistoryCandidates();
    const now = this.now();
    const blocks = this.getSelectionBlocks(now);
    this.selectionSource = null;
    this.blockedCount = candidates.filter((candidate) => !this.getTrackEligibility(
      this._toTrack(candidate), { blocks, now }
    ).eligible).length;

    const pickHistory = () => this._pickFromHistoryCandidates(candidates, blocks);
    const pickRadio = async () => {
      const seed = this._nextMixSeed(candidates, blocks);
      return seed ? this._pickRelatedToSeed(seed, blocks, now) : null;
    };

    if (this.random() * 100 < this.config.mixHistoryPercent) {
      const history = pickHistory();
      if (history) {
        this.selectionSource = 'history';
        return history;
      }
      const radio = await pickRadio();
      if (radio) {
        this.selectionSource = 'radio';
        return radio;
      }
      return null;
    }

    const radio = await pickRadio();
    if (radio) {
      this.selectionSource = 'radio';
      return radio;
    }
    const history = pickHistory();
    if (history) {
      this.selectionSource = 'history-fallback';
      return history;
    }
    return null;
  }

  async _pickRelatedToSeed(seed, blocks, now = this.now()) {
    if (!seed?.youtubeId || !this.musicResolver.resolvePlaylistEntry) return null;

    const selectionBlocks = blocks || this.getSelectionBlocks(now);
    const encodedId = encodeURIComponent(seed.youtubeId);
    const radioUrl = `https://www.youtube.com/watch?v=${encodedId}&list=RD${encodedId}`;
    let playlistItem = this.relatedTrackIndices.get(radioUrl) || 2;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      let resolved;
      try {
        resolved = await this.musicResolver.resolvePlaylistEntry(radioUrl, playlistItem);
      } catch (error) {
        this.api.log?.(`[music-bot] AutoDJ mix radio lookup failed: ${error.message}`, 'warn');
        playlistItem += 1;
        continue;
      }
      playlistItem += 1;
      if (!resolved?.success || !resolved.song || resolved.song.youtubeId === seed.youtubeId) continue;
      const eligibility = this.getTrackEligibility(resolved.song, { blocks: selectionBlocks, now });
      if (!eligibility.eligible) {
        this.blockedCount += 1;
        continue;
      }
      this.relatedTrackIndices.set(radioUrl, playlistItem);
      return resolved.song;
    }

    this.relatedTrackIndices.set(radioUrl, playlistItem);
    return null;
  }

  async _pickArtistRadio() {
    const seed = this.manualRadioSeed;
    if (!seed?.youtubeId) return null;
    const now = this.now();
    const blocks = this.getSelectionBlocks(now);
    const track = await this._pickRelatedToSeed(seed, blocks, now);
    if (!track) {
      this._setResult('artist-radio-empty', 'Song-Radio fand keinen passenden Folgetitel.');
      return null;
    }
    return {
      ...track,
      radioStation: 'artist',
      radioStationSeed: seed.youtubeId,
      radioStationArtist: seed.artist || '',
      radioPlaylistId: 'artist-radio'
    };
  }

  _seedRandomModeFromHistory() {
    try {
      const seed = this.db.prepare(
        `SELECT youtubeId, title, artist, url, duration, source, thumbnail
         FROM plugin_music_bot_history
         WHERE youtubeId IS NOT NULL AND TRIM(youtubeId) != '' AND COALESCE(skipped, 0) = 0
         ORDER BY finishedAt DESC
         LIMIT 1`
      ).get();
      return this.setPlaybackSeed(seed);
    } catch (error) {
      this.api.log?.(`[music-bot] AutoDJ history seed lookup failed: ${error.message}`, 'warn');
      return false;
    }
  }

  async _pickFromHistory() {
    const candidates = this._loadHistoryCandidates();
    const now = this.now();
    const blocks = this.getSelectionBlocks(now);
    this.blockedCount = candidates.filter((candidate) => !this.getTrackEligibility(
      this._toTrack(candidate), { blocks, now }
    ).eligible).length;
    const candidate = this._pickFromHistoryCandidates(candidates, blocks);
    if (!candidate) return this._pickRelatedToLastPlaylistTrack();
    return candidate;
  }

  _loadHistoryCandidates() {
    const minPlays = Math.max(Number(this.config.historyMinPlays) || 1, 1);
    const orderClause = this.config.historyShuffled ? 'ORDER BY RANDOM()' : 'ORDER BY finishedAt DESC';
    return this.db
      .prepare(
        `SELECT youtubeId, title, artist, url, duration, source, thumbnail,
                channelId, channelName, COUNT(*) as plays
         FROM plugin_music_bot_history
         WHERE youtubeId IS NOT NULL AND COALESCE(skipped, 0) = 0
         GROUP BY youtubeId, title, artist, url, duration, source, thumbnail, channelId, channelName
         HAVING plays >= ?
         ${orderClause}
         LIMIT 20`
      )
      .all(minPlays);
  }

  _pickFromHistoryCandidates(candidates, blocks) {
    const candidate = this._getEligibleHistoryCandidates(candidates, blocks)[0] || null;
    return candidate ? this._toTrack(candidate) : null;
  }

  _nextMixSeed(candidates, blocks) {
    const eligible = this._getEligibleHistoryCandidates(candidates, blocks);
    if (eligible.length === 0) return null;

    const index = this.mixSeedIndex % eligible.length;
    this.mixSeedIndex = (index + 1) % eligible.length;
    return this._toTrack(eligible[index]);
  }

  _getEligibleHistoryCandidates(candidates, blocks) {
    const minPlays = Math.max(Number(this.config.historyMinPlays) || 1, 1);
    const blockNow = Number(blocks?.now);
    const now = Number.isFinite(blockNow) ? blockNow : this.now();
    const selectionBlocks = blocks || this.getSelectionBlocks(now);
    return candidates.filter((candidate) => (
      Number(candidate.plays) >= minPlays
      && this.getTrackEligibility(this._toTrack(candidate), { blocks: selectionBlocks, now }).eligible
    ));
  }

  _toTrack(candidate) {
    return {
      title: candidate.title,
      artist: candidate.artist,
      url: candidate.url,
      duration: candidate.duration,
      source: candidate.source || 'youtube',
      thumbnail: candidate.thumbnail,
      youtubeId: candidate.youtubeId,
      channelId: candidate.channelId || null,
      channelName: candidate.channelName || null
    };
  }

  _setResult(state, message, params = {}) {
    this.lastResult = {
      state,
      message,
      params,
      updatedAt: Date.now()
    };
  }

  _getRepeatCooldownMs() {
    return this.config.repeatCooldownHours * 60 * 60 * 1000;
  }

  _normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  _normalizeGenres(values) {
    const source = Array.isArray(values) ? values : [values];
    const genres = [];
    source.forEach((value) => {
      const normalized = String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, '-');
      if (normalized && !genres.includes(normalized)) genres.push(normalized);
    });
    return genres;
  }

  _normalizeInteger(value, fallback, minimum, maximum) {
    const numeric = Number(value);
    const safe = Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
    return this._clamp(minimum, maximum, safe);
  }
}

module.exports = AutoDJ;
