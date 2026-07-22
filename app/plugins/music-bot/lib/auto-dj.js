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
    this.playedSongIds = new Set();
    this.consecutiveCount = 0;
    this.selectionSource = null;
    this.blockedCount = 0;
    this.lastSelection = null;
    this.lastResult = { state: 'idle', message: 'Auto-DJ bereit.' };
    this.currentRadioContext = null;
    this.requestSeed = null;
    this.recentNovelty = [];
    this.genreSelectionCounts = new Map();
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
    if (!this.config.enabled) {
      this._setResult('disabled', 'Auto-DJ ist deaktiviert.');
      return null;
    }
    this.isActive = true;
    this._setResult('selecting', 'Auto-DJ sucht den naechsten Titel.');
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
    this.requestSeed = null;
    this.recentNovelty = [];
    this.genreSelectionCounts.clear();
  }

  markTrackStarted(track) {
    this.consecutiveCount += 1;
    this.isActive = true;
    if (track?.youtubeId) {
      this.playedInSession.add(track.youtubeId);
    }
    const songId = Number(track?.catalogSongId ?? track?.songId);
    if (Number.isInteger(songId) && songId > 0) this.playedSongIds.add(songId);
    if (track?.radioNovelty) {
      this.recentNovelty.push(true);
      this.recentNovelty = this.recentNovelty.slice(-10);
    } else if (track?.requestedBy === 'AutoDJ') {
      this.recentNovelty.push(false);
      this.recentNovelty = this.recentNovelty.slice(-10);
    }
    if (track?.radioRequestSeed && this.requestSeed?.remaining > 0) {
      this.requestSeed.remaining -= 1;
      if (this.requestSeed.remaining <= 0) this.requestSeed = null;
    }
    this.setRadioContext(track);
    this._setResult('playing', `Spielt: ${track?.title || 'Unbekannter Titel'}`, {
      title: track?.title || 'Unbekannter Titel'
    });
  }

  setPlaybackSeed(track) {
    this.setRadioContext(track);
    if (!track?.youtubeId) return false;
    this.lastPlaylistTrack = { ...track };
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
    const genres = this._normalizeGenres(track.genres || track.categories || []);
    if (!artist && genres.length === 0) return false;
    this.requestSeed = {
      artist,
      artistKey: this._normalizeText(artist),
      genres,
      remaining: 2
    };
    return true;
  }

  markPlaybackFailed(error) {
    const detail = error?.message || error || 'Unbekannter Fehler';
    this._setResult('error', `Wiedergabe fehlgeschlagen: ${detail}`, { error: detail });
  }

  getSelectionBlocks(now = Date.now()) {
    const cooldownMs = this._getRepeatCooldownMs();
    const blocks = {
      youtubeIds: new Set(),
      titleKeys: new Set(),
      artistKeys: new Set()
    };

    const addTrack = (track) => {
      const youtubeId = String(track.youtubeId || '').trim();
      const titleKey = this._normalizeText(track.titleKey ?? track.title);
      const artistKey = this._normalizeText(track.artistKey ?? track.artist);
      if (youtubeId) blocks.youtubeIds.add(youtubeId);
      if (titleKey) blocks.titleKeys.add(titleKey);
      if (artistKey) blocks.artistKeys.add(artistKey);
    };

    try {
      const history = this.db.prepare(
        `SELECT youtubeId, title, artist
         FROM plugin_music_bot_history
         WHERE COALESCE(skipped, 0) = 0 AND finishedAt >= ?`
      ).all(now - cooldownMs);
      history.forEach(addTrack);

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
    const titleKey = this._normalizeText(track?.title);
    const artistKey = this._normalizeText(track?.artist);
    return Boolean(
      (youtubeId && blocks.youtubeIds.has(youtubeId)) ||
      (titleKey && blocks.titleKeys.has(titleKey)) ||
      (artistKey && blocks.artistKeys.has(artistKey))
    );
  }

  recordFailedTrack(track, reason, now = Date.now()) {
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
      requestSeedRemaining: this.requestSeed?.remaining || 0,
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
          this.lastPlaylistTrack = resolved.song;
          return resolved.song;
        }
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

    const encodedId = encodeURIComponent(seed.youtubeId);
    const radioUrl = `https://www.youtube.com/watch?v=${encodedId}&list=RD${encodedId}`;
    let playlistItem = this.relatedTrackIndices.get(radioUrl) || 2;
    let fallback = null;

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
      if (!resolved?.success || !resolved.song) continue;

      if (resolved.song.youtubeId === seed.youtubeId) continue;
      if (!fallback) fallback = resolved.song;
      if (!resolved.song.youtubeId || !this.playedInSession.has(resolved.song.youtubeId)) {
        this.relatedTrackIndices.set(radioUrl, playlistItem);
        return resolved.song;
      }
    }

    this.relatedTrackIndices.set(radioUrl, playlistItem);
    return fallback;
  }

  async _pickFromCatalogRadio() {
    this.selectionSource = null;
    this.lastSelection = null;
    const familiarFirst = this.random() < 0.6;
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
    const candidates = this.catalog?.getRadioCandidates?.(songIds, { now }) || [];
    const bySongId = new Map(candidates.map((candidate) => [Number(candidate.songId), candidate]));
    const hardEligible = candidates.filter((candidate) => this._isCatalogCandidateHardEligible(candidate, now));
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
      return { item, candidate, ...this._scoreCatalogCandidate(candidate) };
    }).filter((entry) => entry.candidate && (!genreTarget || this._candidateHasGenre(entry.candidate, genreTarget)));
    const selected = group.mode === 'shuffle'
      ? this._chooseWeighted(scored, (entry) => entry.score)
      : scored[0];
    if (!selected) return null;

    if (genreTarget) {
      this.genreSelectionCounts.set(genreTarget, (this.genreSelectionCounts.get(genreTarget) || 0) + 1);
    }

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
    const seedEntry = this._chooseWeighted(
      discoveryCandidates.map((candidate) => ({ candidate, ...this._scoreCatalogCandidate(candidate) })),
      (entry) => entry.score
    );
    if (!seedEntry) return null;
    const seed = this._catalogCandidateToTrack(seedEntry.candidate);
    let discovered = await this._pickRelatedToSeed(seed, this.getSelectionBlocks(this.now()));
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
    if (!discovered || this.isBanned(discovered)) return null;
    if (discovered.youtubeId && this.playedInSession.has(discovered.youtubeId)) return null;

    try {
      const resolved = this.catalog.resolveOrUpsert(discovered);
      const songId = Number(resolved?.song?.id);
      const canonical = Number.isInteger(songId)
        ? this.catalog.getRadioCandidates?.([songId], { now: this.now() })?.find((candidate) => Number(candidate.songId) === songId)
        : null;
      if (canonical && !this._isCatalogCandidateHardEligible(canonical, this.now())) return null;
      if (canonical && this._hasSelectedGenres() && !this._matchesSelectedGenre(canonical)) return null;
      if (canonical && genreTarget && !this._candidateHasGenre(canonical, genreTarget)) return null;
      discovered = {
        ...discovered,
        catalogSongId: Number.isInteger(songId) ? songId : undefined,
        sourceId: resolved?.source?.id || discovered.sourceId
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
    if (genreTarget) {
      this.genreSelectionCounts.set(genreTarget, (this.genreSelectionCounts.get(genreTarget) || 0) + 1);
    }
    return discovered;
  }

  _isCatalogCandidateHardEligible(candidate, now) {
    if (!candidate || candidate.feedback === 'down') return false;
    const songId = Number(candidate.songId);
    if (songId > 0 && songId === Number(this.currentRadioContext?.catalogSongId)) return false;
    if (this.playedSongIds.has(songId)) return false;
    const cooldownStartedAt = now - this._getRepeatCooldownMs();
    if (candidate.lastPlayedAt !== null && candidate.lastPlayedAt !== undefined
      && Number(candidate.lastPlayedAt) >= cooldownStartedAt) return false;
    return this._eligibleCatalogSources(candidate, now).length > 0;
  }

  isTrackHardEligible(track, now = this.now()) {
    if (!track || this.isBanned(track)) return false;
    if (track.youtubeId && this.playedInSession.has(track.youtubeId)) return false;
    const songId = Number(track.catalogSongId ?? track.songId);
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

  _scoreCatalogCandidate(candidate) {
    const completePlays = Math.max(0, Number(candidate?.completePlays) || 0);
    const earlySkips = Math.max(0, Number(candidate?.earlySkips) || 0);
    const implicitSongFactor = this._clamp(0.5, 1.5, 1 + (completePlays * 0.03) - (earlySkips * 0.10));
    const explicitSongFactor = candidate?.feedback === 'up' ? 3 : 1;
    const songFactor = explicitSongFactor * implicitSongFactor;
    const affinities = (candidate?.artists || []).map((artist) => Number(artist.affinity) || 0);
    const affinity = affinities.length ? Math.max(...affinities) : 0;
    const artistFactor = this._clamp(0.4, 2.5, 1 + (affinity * 0.25));
    const radioAffinity = Number(candidate?.radioAffinity) || 0;
    const radioAffinityFactor = this._clamp(0.5, 1.6, 1 + (radioAffinity * 0.15));
    const genreScores = Object.values(candidate?.genreAffinities || {}).map(Number).filter(Number.isFinite);
    const genreAffinity = genreScores.length ? Math.max(...genreScores) : 0;
    const genreFactor = this._clamp(0.5, 1.6, 1 + (genreAffinity * 0.12));
    const candidateBpm = Number(candidate?.bpm);
    const contextBpm = Number(this.currentRadioContext?.bpm);
    const hasBpmTransition = this.config.bpmTransitionsEnabled
      && Number.isFinite(candidateBpm) && candidateBpm > 0
      && Number.isFinite(contextBpm) && contextBpm > 0;
    const bpmDistance = hasBpmTransition ? Math.abs(candidateBpm - contextBpm) : null;
    const bpmFactor = hasBpmTransition
      ? this._clamp(0.65, 1.3, 1.25 - (bpmDistance / 100))
      : 1;
    const requestSeed = this._getRequestSeedScore(candidate);
    return {
      explicitSongFactor,
      implicitSongFactor,
      songFactor,
      artistFactor,
      radioAffinityFactor,
      genreFactor,
      bpmFactor,
      bpmDistance,
      requestSeedFactor: requestSeed.factor,
      requestSeedActive: requestSeed.active,
      requestSeedMatched: requestSeed.matched,
      score: songFactor * artistFactor * radioAffinityFactor * genreFactor * bpmFactor * requestSeed.factor
    };
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
      genres: Array.isArray(candidate.genres) ? [...candidate.genres] : [],
      radioNovelty: this._isNovelCandidate(candidate, now),
      radioRequestSeed: Boolean(scoring.requestSeedActive),
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
    const entries = pool.eligible.map((candidate) => ({
      candidate,
      ...this._scoreCatalogCandidate(candidate)
    })).sort((left, right) => (
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

  getTrackForPreview(previewId) {
    const match = /^catalog:(\d+):/.exec(String(previewId || ''));
    const songId = Number(match?.[1]);
    if (!Number.isInteger(songId) || songId <= 0) return null;
    const pool = this._loadCatalogPool();
    const candidate = pool.eligible.find((entry) => Number(entry.songId) === songId);
    if (!candidate) return null;
    const scoring = this._scoreCatalogCandidate(candidate);
    const selectedGenre = this.config.selectedGenres
      .filter((genre) => this._candidateHasGenre(candidate, genre))
      .reduce((best, genre) => {
        if (!best) return genre;
        return (this.genreSelectionCounts.get(genre) || 0) < (this.genreSelectionCounts.get(best) || 0)
          ? genre
          : best;
      }, null);
    if (selectedGenre) {
      this.genreSelectionCounts.set(selectedGenre, (this.genreSelectionCounts.get(selectedGenre) || 0) + 1);
    }
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
    const seed = this.requestSeed;
    const active = Boolean(this.config.requestSeedsEnabled && seed?.remaining > 0);
    if (!active) return { active: false, matched: false, factor: 1 };
    const artistMatch = seed.artistKey && (candidate?.artists || []).some((artist) => (
      this._normalizeText(artist.name) === seed.artistKey
    ));
    const genreMatch = seed.genres.some((genre) => this._candidateHasGenre(candidate, genre));
    if (artistMatch) return { active: true, matched: true, factor: 1.45 };
    if (genreMatch) return { active: true, matched: true, factor: 1.25 };
    return { active: true, matched: false, factor: 1 };
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
      reasons.push({ code: 'bpm-transition', text: `BPM-Uebergang: ${Math.round(scoring.bpmDistance)} BPM Abstand` });
    }
    if (scoring.requestSeedMatched) {
      reasons.push({ code: 'request-seed', text: 'Stilvorlage eines Viewer-Requests' });
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
    const blocks = this.getSelectionBlocks();
    this.selectionSource = null;
    this.blockedCount = candidates.filter((candidate) => this.isTrackBlocked(candidate, blocks)).length;

    const pickHistory = () => this._pickFromHistoryCandidates(candidates, blocks, { allowPlayedFallback: false });
    const pickRadio = async () => {
      const seed = this._nextMixSeed(candidates, blocks);
      return seed ? this._pickRelatedToSeed(seed, blocks) : null;
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

  async _pickRelatedToSeed(seed, blocks) {
    if (!seed?.youtubeId || !this.musicResolver.resolvePlaylistEntry) return null;

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
      if (!resolved?.success || !resolved.song) continue;

      if (this.isTrackBlocked(resolved.song, blocks)) {
        this.blockedCount += 1;
        continue;
      }
      if (resolved.song.youtubeId === seed.youtubeId) continue;
      if (resolved.song.youtubeId && this.playedInSession.has(resolved.song.youtubeId)) continue;

      this.relatedTrackIndices.set(radioUrl, playlistItem);
      return resolved.song;
    }

    return null;
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
    const blocks = this.getSelectionBlocks();
    this.blockedCount = candidates.filter((candidate) => this.isTrackBlocked(candidate, blocks)).length;
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

  _pickFromHistoryCandidates(candidates, blocks, { allowPlayedFallback = true } = {}) {
    const eligible = this._getEligibleHistoryCandidates(candidates, blocks);
    const candidate = eligible.find((row) => !this.playedInSession.has(row.youtubeId))
      || (allowPlayedFallback ? eligible[0] : null);
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
    return candidates.filter((candidate) => (
      Number(candidate.plays) >= minPlays &&
      (!blocks || !this.isTrackBlocked(candidate, blocks))
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
