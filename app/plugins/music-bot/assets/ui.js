(() => {
  const MIN_SONG_DURATION_LIMIT_SECONDS = 30;
  const MAX_SONG_DURATION_LIMIT_SECONDS = 7200;
  const DEFAULT_SONG_DURATION_LIMIT_SECONDS = 360;
  const I18N_PREFIX = 'plugins.music-bot.music_bot.ui';
  const RUNTIME_I18N_SECTIONS = Object.fromEntries(Object.entries({
    shell: 'networkTitle connectionLost socketDisconnected apiError unknownError saved error onboardingSettingsTitle onboardingSettingsMeta onboardingOverlayTitle onboardingOverlayMeta onboardingPlayerTitle onboardingPlayerMeta setupHint setupOpen onboardingHelpWithIssues onboardingHelpReady mpvNotInstalled install mpvInstallation mpvReady installationFailed installationSlow statusCheckFailed installing installationStarted installationStartFailed installMpv assistantCompleted assistantCompletedMessage setup onboardingSaveFailed viewerFallback toastDefaultTitle setupYtdlpMissingTitle setupYtdlpMissingDescription setupYtdlpInstallNpm setupYtdlpInstallManual setupYtdlpConfigurePath setupMpvMissingTitle setupMpvMissingDescription setupMpvInstallWindows setupMpvInstallLinux setupMpvInstallMacos setupMpvConfigurePath mpvInstallIdle mpvAlreadyAvailable mpvInstalledReady mpvInstallFailed mpvPackageManagerUnavailable mpvInstallTimedOut mpvInstallWindowsPrompt mpvInstallStartFailed mpvInstallChocolateyLock mpvInstallAdminConfirmation mpvInstallPermissionDenied mpvInstallCommandUnavailable mpvInstallExited mpvInstallMissingAfterExit',
    player: 'seekUnavailable seekFailed nowPlayingEmpty stateIdle statePaused statePlaying stateUnknown playbackAdvancing loading skip pauseTitle noActiveTrack playbackResumed playbackStarted nextTrackPlaying resumeTitle noStartableTrack skipTitle playingNow searchLoading searching noResult queueAdding queueAdded songAddedTitle requestAdded requestFailed requestRejectedTitle requestRequired requestUserBlocked requestLikesRequired requestGiftRequired songBlockedTitle songSkipped banSong banArtist banKeyword banChannel queueInvalidSong queueFull queueDurationUnknown queueDurationTooLong queueDuplicate queueUserLimit queueCooldown payToPlayTitle payToPlayCredits payToSkipTitle payToSkipGift masterVolumeTitle sourceVolumeTitle volumeSetFailed crossfadeSaveFailed crossfadeSaving crossfadeApplied requestedBy selectedTitle playerToastTitle sourceYoutube sourceSoundCloud sourceOther',
    queue: 'queueEmptyTitle queueEmptyHint playNow moveUp moveDown queueUpdated trackRemoved queueTitle alreadyPlaying titleStartFailed orderUpdated queueRefreshRetry trackMoved remove',
    autoDj: 'autoDjPlaying autoDjActive autoDjDisabled autoDjOn autoDjOff autoDjSelected autoDjSource autoDjBlocked consecutiveProgress autoDjLimitReached autoDjStarted autoDjWaiting noTrackAvailable autoDjToastTitle sourceFamiliar sourceDiscoveryFallback sourceDiscovery sourceFamiliarFallback sourceHistory sourceRadio sourceHistoryFallback sourceUnknown radioPreviewDisabled radioCandidateCount radioNoCandidates radioPreviewDisabledHint radioPreviewEmptyHint radioUnknownTitle radioScore radioScoreReason radioFeedbackSaving radioFeedbackFailed radioFeedbackMoreSaved radioFeedbackLessSaved',
    moderation: 'banAdded banAddFailed banRemoveFailed enterTitleKeyword banFailed moderationTitle queueMatchesRemoved banLabel trackBanLabel enterValue noEntries delete url keyword channel user artist exactTrack titleKeyword unknownBanType',
    history: 'historyLoadFailed historyFeedbackFailed historyToastTitle',
    playlists: 'playlistSaveFailed playlistConflict importRunning',
    settings: 'giftNoResults giftsCount giftSelectFirst giftSaveFailed giftApplied giftCatalogTitle giftUpdated giftLoading giftLoadFailed giftVisible giftLoaded giftLoadedApi giftUpdatedAt giftLocales giftLocalesDefault giftRegion crossfadeTitle',
    safety: 'emergencyDone safetyUnlocked emergencyFailed unlockFailed playerReset playerResetFailed diagnosticsExportFailed diagnosticsExported safetyLocked safetyReady testToneCompleted testToneFailed',
    health: 'unavailable ipcDegraded ready files none resolverActiveQueued resolverQueued resolverYoutube resolverSoundCloud resolverValidating resolverReady resolverFailed resolverUnknownState healthLoadFailed',
    overlay: 'copyFailed copySuccess'
  }).flatMap(([section, keys]) => keys.split(' ').map((key) => [key, section])));
  Object.assign(RUNTIME_I18N_SECTIONS, Object.fromEntries([
    ['streamerPlaylistFeedbackAria', 'player'],
    ['streamerPlaylistUp', 'player'],
    ['streamerPlaylistDown', 'player'],
    ['streamerPlaylistOnly', 'player'],
    ['streamerPlaylistSaving', 'player'],
    ['streamerPlaylistSaved', 'player'],
    ['streamerPlaylistNeutral', 'player'],
    ['streamerPlaylistFailed', 'player'],
    ['songRadioStart', 'player'],
    ['songRadioStop', 'player'],
    ['songRadioUnavailable', 'player'],
    ['songRadioStarted', 'player'],
    ['songRadioStopped', 'player'],
    ['songRadioFailed', 'player'],
    ['radioPlanTitle', 'autoDj'],
    ['radioPlanCount', 'autoDj'],
    ['streamerPlaylistTitle', 'autoDj'],
    ['streamerPlaylistDescription', 'autoDj'],
    ['streamerPlaylistCount', 'autoDj'],
    ['streamerPlaylistEmpty', 'autoDj'],
    ['streamerSuggestionAccept', 'autoDj'],
    ['streamerSuggestionReject', 'autoDj'],
    ['streamerSuggestionSaving', 'autoDj'],
    ['streamerSuggestionFailed', 'autoDj'],
    ['streamerSuggestionAccepted', 'autoDj'],
    ['streamerSuggestionRejected', 'autoDj']
  ]));
  const CATALOG_I18N_SECTIONS = Object.fromEntries(Object.entries({
    player: 'seek seekAria',
    history: 'historyMore historyBanned historyEmpty banTrack voteUp voteDown voteNeutral toolbarLabel searchLabel searchPlaceholder periodLabel periodAll period24h period7d period30d outcomeLabel outcomeAll outcomeCompleted outcomeSkipped outcomeEarlySkip outcomeFailed feedbackFilterLabel feedbackAll bannedFilterLabel bannedAll bannedOnly bannedExclude sortLabel sortNewest sortOldest reset previous next pageStatus replayQueue replayPlay copyLink addToPlaylist playlistSelect playlistProtected replaySuccess queueSuccess playSuccess copySuccess playlistSuccess actionFailed',
    catalog: 'catalogSearch catalogDescription addToPlaylist catalogEmpty networkTitle postFailed getFailed deleteFailed requestFailed genres genrePlaceholder saveGenres genresSaved genresSaveFailed',
    playlists: 'playlistsDescription newPlaylist playbackMode ordered shuffle create radioDescription saveRadioSources playlistName save delete importUrl import protected playlistEmpty playlistItemsEmpty remove radioWeight importQueued importCompleted importFailed importAborted importError playlistConflict viewerRadio radioSources importRunning'
  }).flatMap(([section, keys]) => keys.split(' ').map((key) => [key, section])));

  function tr(key, fallback, params = {}) {
    const section = RUNTIME_I18N_SECTIONS[key] || 'shell';
    const fullKey = `${I18N_PREFIX}.${section}.${key}`;
    const translated = window.i18n?.t(fullKey, params);
    const value = translated && translated !== fullKey ? translated : fallback;
    return String(value).replace(/\{(\w+)\}/g, (_match, name) => params[name] ?? `{${name}}`);
  }

  function translateRuntimeMessageKey(messageKey, fallback, params = {}) {
    const key = String(messageKey || '');
    if (!Object.prototype.hasOwnProperty.call(RUNTIME_I18N_SECTIONS, key)) return fallback;
    return tr(key, fallback, params);
  }

  function localizedProducerText(payload, field, fallback = '') {
    const source = payload || {};
    const key = source[`${field}Key`];
    if (key) {
      const translated = translateRuntimeMessageKey(key, fallback || source[field] || '', source.params || {});
      return source.params?.detail ? `${translated} ${source.params.detail}` : translated;
    }
    return source[field] || fallback;
  }

  function localizedApiError(payload, fallback = '') {
    return localizedProducerText(payload, 'message', payload?.error || fallback);
  }

  function runtimeStateLabel(state) {
    const normalized = String(state || 'idle').toLowerCase();
    if (normalized === 'paused' || normalized === 'pausiert') return tr('statePaused', 'Pausiert');
    if (['playing', 'playback', 'wiedergabe'].includes(normalized)) return tr('statePlaying', 'Wiedergabe');
    if (['loading', 'buffering', 'crossfading', 'recovering'].includes(normalized)) {
      return tr('playbackAdvancing', 'Lädt den nächsten Titel …');
    }
    if (normalized === 'locked') return tr('safetyLocked', 'Safety-Lock aktiv');
    if (normalized === 'idle') return tr('stateIdle', 'Bereit');
    return tr('stateUnknown', 'Unbekannter Status');
  }

  function mediaSourceLabel(source) {
    const normalized = String(source || 'youtube').toLowerCase();
    if (normalized === 'youtube') return tr('sourceYoutube', 'YouTube');
    if (normalized === 'soundcloud') return tr('sourceSoundCloud', 'SoundCloud');
    return tr('sourceOther', 'Andere Quelle');
  }

  function autoDjSourceLabel(source) {
    const labels = {
      familiar: () => tr('sourceFamiliar', 'Vertraute Titel'),
      'discovery-fallback': () => tr('sourceDiscoveryFallback', 'Entdeckungen (Fallback)'),
      discovery: () => tr('sourceDiscovery', 'Entdeckungen'),
      'familiar-fallback': () => tr('sourceFamiliarFallback', 'Vertraute Titel (Fallback)'),
      history: () => tr('sourceHistory', 'Verlauf'),
      radio: () => tr('sourceRadio', 'Radio'),
      'history-fallback': () => tr('sourceHistoryFallback', 'Verlauf (Fallback)')
    };
    return labels[String(source || '').toLowerCase()]?.() || tr('sourceUnknown', 'Unbekannte Quelle');
  }

  function banTypeLabel(type) {
    const labels = {
      url: () => tr('url', 'URL'),
      keyword: () => tr('keyword', 'Schlüsselwort'),
      channel: () => tr('channel', 'Kanal'),
      user: () => tr('user', 'Nutzer'),
      artist: () => tr('artist', 'Künstler'),
      track: () => tr('exactTrack', 'Exakter Titel'),
      'exact-track': () => tr('exactTrack', 'Exakter Titel'),
      exacttrack: () => tr('exactTrack', 'Exakter Titel'),
      title: () => tr('titleKeyword', 'Titelbegriff'),
      'title-keyword': () => tr('titleKeyword', 'Titelbegriff')
    };
    return labels[String(type || '').toLowerCase()]?.() || tr('unknownBanType', 'Unbekannter Typ');
  }

  function playlistModeLabel(mode) {
    return mode === 'shuffle'
      ? catalogTr('shuffle', 'Zufällig')
      : catalogTr('ordered', 'Geordnet');
  }

  function playlistImportStatusLabel(status) {
    if (status === 'queued') return catalogTr('importQueued', 'Import wartet …');
    if (status === 'completed') return catalogTr('importCompleted', 'Import abgeschlossen');
    if (status === 'failed') return catalogTr('importFailed', 'Import fehlgeschlagen');
    if (status === 'aborted') return catalogTr('importAborted', 'Import abgebrochen');
    return catalogTr('importRunning', 'Import läuft …');
  }

  function debounce(fn, delay = 200) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function setActiveTab(target, { focusPanel = true } = {}) {
    if (!target) return;
    const panelId = `musicbot-panel-${target}`;
    document.querySelectorAll('.tab').forEach((t) => {
      const isActive = t.getAttribute('data-tab') === target;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      t.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    document.querySelectorAll('.tab-content').forEach((c) => {
      const isActive = c.id === panelId;
      c.classList.toggle('active', isActive);
      c.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      c.toggleAttribute('hidden', !isActive);
    });

    const activePanel = document.getElementById(panelId);
    activePanel?.scrollIntoView?.({ behavior: 'auto', block: 'start' });
    if (focusPanel) {
      activePanel?.focus({ preventScroll: true });
    }
  }

  // ── Tab switching ──
  const tabList = document.getElementById('tab-bar');
  if (tabList) {
    tabList.setAttribute('role', 'tablist');
  }
  document.querySelectorAll('.tab').forEach((tab) => {
    const target = tab.getAttribute('data-tab');
    const isActive = tab.classList.contains('active');
    tab.setAttribute('id', `musicbot-tab-${target}`);
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tab.setAttribute('aria-controls', `musicbot-panel-${target}`);
    tab.setAttribute('tabindex', isActive ? '0' : '-1');
    tab.addEventListener('click', () => {
      setActiveTab(target, { focusPanel: false });
    });
    tab.addEventListener('keydown', (e) => {
      const tabs = Array.from(document.querySelectorAll('.tab'));
      const idx = tabs.indexOf(tab);
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
      if (e.key === 'ArrowLeft') next = tabs[(idx - 1 + tabs.length) % tabs.length];
      if (e.key === 'Home') next = tabs[0];
      if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        next.focus();
        setActiveTab(next.getAttribute('data-tab'), { focusPanel: false });
      }
    });
  });
  document.querySelectorAll('[data-tab-content]').forEach((panel) => {
    const target = panel.getAttribute('data-tab-content');
    const isActive = panel.classList.contains('active');
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('id', `musicbot-panel-${target}`);
    panel.setAttribute('aria-labelledby', `musicbot-tab-${target}`);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    panel.toggleAttribute('hidden', !isActive);
  });

  const socket = io();
  const stateEl = document.getElementById('playback-state');
  const nowPlayingEl = document.getElementById('now-playing');
  const queueListEl = document.getElementById('queue-list');
  const queueLengthEl = document.getElementById('queue-length');
  const heroQueueCount = document.getElementById('hero-queue-count');
  const heroMpvStatus = document.getElementById('hero-mpv-status');
  const heroAutodjStatus = document.getElementById('hero-autodj-status');
  const historyListEl = document.getElementById('history-list');
  const historySearch = document.getElementById('history-search');
  const historyPeriod = document.getElementById('history-period');
  const historyOutcome = document.getElementById('history-outcome');
  const historyFeedbackFilter = document.getElementById('history-feedback-filter');
  const historyBanned = document.getElementById('history-banned');
  const historySort = document.getElementById('history-sort');
  const historyReset = document.getElementById('history-reset');
  const historyPrevious = document.getElementById('history-previous');
  const historyNext = document.getElementById('history-next');
  const historyPlaylistMenu = document.getElementById('history-playlist-menu');
  const requestFeedback = document.getElementById('request-feedback');
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const requestBtn = document.getElementById('request-btn');
  const searchFeedback = document.getElementById('search-feedback');
  const previewFrame = document.getElementById('preview-frame');
  const playerFrameBox = document.getElementById('player-frame-box');
  const previewSource = document.getElementById('preview-source');
  const previewVolumeInput = document.getElementById('preview-volume-input');
  const previewVolumeValue = document.getElementById('preview-volume-value');
  const masterVolumeInput = document.getElementById('master-volume-input');
  const masterVolumeValue = document.getElementById('master-volume-value');
  const volumeInput = document.getElementById('volume-input');
  const volumeValue = document.getElementById('volume-value');
  const skipButton = document.getElementById('skip-btn');
  const crossfadeInput = document.getElementById('crossfade-input');
  const crossfadeValue = document.getElementById('crossfade-value');
  const crossfadeSaveStatus = document.getElementById('crossfade-save-status');
  const duplicateDetection = document.getElementById('duplicate-detection');
  const cooldownSecondsInput = document.getElementById('cooldown-seconds');
  const maxSongDurationInput = document.getElementById('max-song-duration-seconds');
  const cooldownBypassGifts = document.getElementById('cooldown-bypass-gifts');
  const skipImmunityGifts = document.getElementById('skip-immunity-gifts');
  const autoDjEnabled = document.getElementById('auto-dj-enabled');
  const autoDjMode = document.getElementById('auto-dj-mode');
  const autoDjHistoryPlays = document.getElementById('auto-dj-history-plays');
  const autoDjMixHistoryPercent = document.getElementById('auto-dj-mix-history-percent');
  const autoDjRepeatCooldownHours = document.getElementById('auto-dj-repeat-cooldown-hours');
  const autoDjMaxConsecutive = document.getElementById('auto-dj-max-consecutive');
  const autoDjAnnounce = document.getElementById('auto-dj-announce');
  const autoDjStatus = document.getElementById('auto-dj-status');
  const autoDjDetail = document.getElementById('auto-dj-detail');
  const autoDjSave = document.getElementById('auto-dj-save');
  const autoDjSkip = document.getElementById('auto-dj-skip');
  const autoDjPlaylistUrls = document.getElementById('auto-dj-playlist-urls');
  const autoDjGenreFilter = document.getElementById('auto-dj-genre-filter');
  const autoDjGenres = document.getElementById('auto-dj-genres');
  const autoDjBpmTransitions = document.getElementById('auto-dj-bpm-transitions');
  const autoDjArtistSpacing = document.getElementById('auto-dj-artist-spacing');
  const autoDjAlbumSpacing = document.getElementById('auto-dj-album-spacing');
  const autoDjNoveltyBudget = document.getElementById('auto-dj-novelty-budget');
  const autoDjRequestSeeds = document.getElementById('auto-dj-request-seeds');
  const autoDjLiveFeedback = document.getElementById('auto-dj-live-feedback');
  const autoDjPreviewEnabled = document.getElementById('auto-dj-preview-enabled');
  const autoDjChatVoting = document.getElementById('auto-dj-chat-voting');
  const autoDjVoteCloseBefore = document.getElementById('auto-dj-vote-close-before');
  const radioPreviewList = document.getElementById('radio-preview-list');
  const radioPreviewStatus = document.getElementById('radio-preview-status');
  const radioFeedbackMore = document.getElementById('radio-feedback-more');
  const radioFeedbackLess = document.getElementById('radio-feedback-less');
  const radioFeedbackStatus = document.getElementById('radio-feedback-status');
  const streamerPlaylistCuration = document.getElementById('streamer-playlist-curation');
  const streamerPlaylistSummary = document.getElementById('streamer-playlist-summary');
  const streamerPlaylistSuggestions = document.getElementById('streamer-playlist-suggestions');
  const aliasInputs = document.querySelectorAll('.alias-input');
  const aliasSave = document.getElementById('alias-save');
  const rejectAge = document.getElementById('reject-age');
  const rejectExplicit = document.getElementById('reject-explicit');
  const blockedKeywords = document.getElementById('blocked-keywords');
  const banType = document.getElementById('ban-type');
  const banValue = document.getElementById('ban-value');
  const banReason = document.getElementById('ban-reason');
  const banAdd = document.getElementById('ban-add');
  const banFeedback = document.getElementById('ban-feedback');
  const banTable = document.getElementById('ban-table');
  const ytdlpPathInput = document.getElementById('ytdlp-path');
  const mpvPathInput = document.getElementById('mpv-path');
  const normalizationEnabled = document.getElementById('normalization-enabled');
  const normalizationLufs = document.getElementById('normalization-lufs');
  const requireSuperfan = document.getElementById('require-superfan');
  const payToPlayEnabled = document.getElementById('pay-to-play-enabled');
  const payToPlayGifts = document.getElementById('pay-to-play-gifts');
  const payToPlayMinCoins = document.getElementById('pay-to-play-min-coins');
  const payToSkipEnabled = document.getElementById('pay-to-skip-enabled');
  const payToSkipGifts = document.getElementById('pay-to-skip-gifts');
  const giftCatalogList = document.getElementById('gift-catalog-list');
  const giftCatalogSearch = document.getElementById('gift-catalog-search');
  const giftCatalogRefresh = document.getElementById('gift-catalog-refresh');
  const giftCatalogStatus = document.getElementById('gift-catalog-status');
  const giftCatalogCount = document.getElementById('gift-catalog-count');
  const giftCatalogApplyPayToPlay = document.getElementById('gift-catalog-apply-pay-to-play');
  const giftCatalogApplyPayToSkip = document.getElementById('gift-catalog-apply-pay-to-skip');
  const giftCatalogApplySkipImmunity = document.getElementById('gift-catalog-apply-skip-immunity');
  const likeGateEnabled = document.getElementById('like-gate-enabled');
  const minLikesPerUser = document.getElementById('min-likes-per-user');
  const overlayDesign = document.getElementById('overlay-design');
  const overlayTheme = document.getElementById('overlay-theme');
  const overlayPosition = document.getElementById('overlay-position');
  const overlayUrl = document.getElementById('overlay-url');
  const overlayCopy = document.getElementById('overlay-copy');
  const overlayOpen = document.getElementById('overlay-open');
  const settingsSave = document.getElementById('settings-save');
  const settingsFeedback = document.getElementById('settings-feedback');
  const moderationSave = document.getElementById('moderation-save');
  const moderationFeedback = document.getElementById('moderation-feedback');
  const setupIssuesBanner = document.getElementById('setup-issues-banner');
  const setupIssuesList = document.getElementById('setup-issues-list');
  const npProgressWrapper = document.getElementById('np-progress-wrapper');
  const npSeekInput = document.getElementById('np-seek-input');
  const npElapsed = document.getElementById('np-elapsed');
  const npDuration = document.getElementById('np-duration');
  const historyLoadMore = document.getElementById('history-load-more');
  const historyPageStatus = document.getElementById('history-page-status');
  const catalogSearchInput = document.getElementById('catalog-search-input');
  const catalogSearchResults = document.getElementById('catalog-search-results');
  const playlistCreateName = document.getElementById('playlist-create-name');
  const playlistCreateMode = document.getElementById('playlist-create-mode');
  const playlistCreateButton = document.getElementById('playlist-create-btn');
  const playlistList = document.getElementById('playlist-list');
  const playlistEditor = document.getElementById('playlist-editor');
  const playlistNameInput = document.getElementById('playlist-name-input');
  const playlistModeInput = document.getElementById('playlist-mode-input');
  const playlistSaveButton = document.getElementById('playlist-save-btn');
  const playlistDeleteButton = document.getElementById('playlist-delete-btn');
  const playlistItems = document.getElementById('playlist-items');
  const playlistImportUrl = document.getElementById('playlist-import-url');
  const playlistImportButton = document.getElementById('playlist-import-btn');
  const playlistImportProgress = document.getElementById('playlist-import-progress');
  const playlistConflictFeedback = document.getElementById('playlist-conflict-feedback');
  const playlistRadioSources = document.getElementById('playlist-radio-sources');
  const playlistRadioSave = document.getElementById('playlist-radio-save');
  const toastContainer = document.getElementById('musicbot-toast-container');
  const onboardingPanel = document.getElementById('musicbot-onboarding');
  const onboardingStatus = document.getElementById('musicbot-onboarding-status');
  const onboardingSteps = document.getElementById('musicbot-onboarding-steps');
  const onboardingHelp = document.getElementById('musicbot-onboarding-help');
  const onboardingSettings = document.getElementById('musicbot-onboarding-settings');
  const onboardingOverlay = document.getElementById('musicbot-onboarding-overlay');
  const onboardingComplete = document.getElementById('musicbot-onboarding-complete');
  const safetyPanel = document.getElementById('musicbot-safety-panel');
  const safetyLockStatus = document.getElementById('safety-lock-status');
  const emergencyStopButton = document.getElementById('emergency-stop-btn');
  const safetyUnlockButton = document.getElementById('safety-unlock-btn');
  const playerResetButton = document.getElementById('player-reset-btn');
  const testToneButton = document.getElementById('test-tone-btn');
  const healthRefreshButton = document.getElementById('health-refresh-btn');
  const diagnosticsExportButton = document.getElementById('diagnostics-export-btn');
  const safetyFeedback = document.getElementById('safety-feedback');
  const healthState = document.getElementById('health-state');
  const healthPlayers = document.getElementById('health-players');
  const healthMpv = document.getElementById('health-mpv');
  const healthIpcLatency = document.getElementById('health-ipc-latency');
  const healthMediaTitle = document.getElementById('health-media-title');
  const healthResolver = document.getElementById('health-resolver');
  const healthCache = document.getElementById('health-cache');
  const healthLastError = document.getElementById('health-last-error');
  const healthCheckedAt = document.getElementById('health-checked-at');
  const trackBanMenu = document.getElementById('track-ban-menu');
  const trackBanMenuClose = document.getElementById('track-ban-menu-close');
  const trackBanKeywordField = document.getElementById('track-ban-keyword-field');
  const trackBanKeyword = document.getElementById('track-ban-keyword');
  const trackBanStopCurrent = document.getElementById('track-ban-stop-current');
  const trackBanRemoveQueued = document.getElementById('track-ban-remove-queued');
  const trackBanSubmit = document.getElementById('track-ban-submit');
  const trackBanFeedback = document.getElementById('track-ban-feedback');

  // Progress timer state
  let progressTimer = null;
  let progressCurrentPos = 0;
  let progressDuration = 0;
  let activePlaybackId = null;
  let lastConfirmedSeekPosition = 0;
  let seekPreviewActive = false;
  let seekInFlight = false;
  let seekTransitioning = false;
  let historyOffset = 0;
  let historyTotal = 0;
  let historyRequestGeneration = 0;
  const historyFilters = {
    q: '',
    outcome: '',
    feedback: '',
    banned: '',
    from: '',
    to: '',
    sort: 'finished_desc'
  };
  const HISTORY_PAGE_SIZE = 50;
  const canonicalSongState = new Map();
  let selectedPlaylist = null;
  let playlists = [];
  let playlistDragSongId = null;
  let draggedQueueIndex = null;
  let draggedQueueSongId = null;
  let giftCatalogTargetField = null;
  let giftCatalogEntries = [];
  let giftCatalogFilter = '';
  let giftCatalogSelectedValues = new Set();
  let giftCatalogMeta = {
    locales: [],
    region: null,
    lastUpdate: null,
    count: 0
  };
  let currentSetupIssues = [];
  let currentOnboarding = { completed: false, completedAt: null };
  let mpvInstallPollTimer = null;
  let mpvInstallPollAttempts = 0;
  let skipInProgress = false;
  let musicbotSafetyLocked = false;
  let latestRuntime = null;
  let latestResolver = null;
  let latestNowPlayingTrack = null;
  let latestQueueTracks = [];
  let latestQueueLength = 0;
  let latestHistoryTracks = [];
  let latestAutoDjStatus = null;
  let latestRadioSources = [];
  let latestHealth = null;
  const activeToastRecords = [];
  let trackBanTargetId = null;
  let trackBanCatalogEventId = null;
  let trackBanScope = 'track';
  let trackBanReturnFocus = null;

  // Client-side YouTube ID extraction (no server call needed for direct links)
  function extractYouTubeId(url) {
    try {
      const parsed = new URL(url.trim());
      const h = parsed.hostname.replace(/^www\./, '');
      if (h === 'youtu.be') {
        return parsed.pathname.slice(1).split('?')[0] || null;
      }
      if (h === 'youtube.com' || h === 'm.youtube.com') {
        if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || null;
        if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.slice(7).split('?')[0] || null;
        if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.slice(8).split('?')[0] || null;
      }
    } catch (e) {
      // not a valid URL
    }
    return null;
  }

  function isValidYouTubeId(value) {
    return /^[A-Za-z0-9_-]{6,20}$/.test(String(value || ''));
  }

  function setPreviewVideo(youtubeId) {
    if (!previewFrame || !isValidYouTubeId(youtubeId)) return;
    const params = new URLSearchParams({
      controls: '0',
      enablejsapi: '1',
      origin: window.location.origin,
      playsinline: '1',
      rel: '0'
    });
    previewFrame.onload = () => setPreviewVolume(previewVolumeInput?.value);
    previewFrame.src = `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
    playerFrameBox?.classList.add('has-video');
    previewSource.textContent = tr('sourceYoutube', 'YouTube');
  }

  function setPreviewVolume(value) {
    const volume = Math.max(0, Math.min(100, Number(value) || 0));
    if (previewVolumeValue) previewVolumeValue.value = String(volume);
    if (!previewFrame?.contentWindow || !previewFrame.src) return;
    previewFrame.contentWindow.postMessage(JSON.stringify({
      event: 'command',
      func: 'setVolume',
      args: [volume]
    }), 'https://www.youtube.com');
  }

  function clearPreview() {
    if (!previewFrame) return;
    previewFrame.src = '';
    playerFrameBox?.classList.remove('has-video');
    previewSource.textContent = tr('sourceYoutube', 'YouTube');
  }

  function buildOnboardingSteps(issues = []) {
    const baseSteps = [
      {
        title: tr('onboardingSettingsTitle', 'Einstellungen prüfen'),
        meta: tr('onboardingSettingsMeta', 'Hier liegen mpv, yt-dlp, Request-Limits und die zentrale Queue-Konfiguration.')
      },
      {
        title: tr('onboardingOverlayTitle', 'OBS-Overlay sichern'),
        meta: tr('onboardingOverlayMeta', 'Im Overlay-Tab findest du die Browser-Source-URL für Streamlabs oder OBS.')
      },
      {
        title: tr('onboardingPlayerTitle', 'Player testen'),
        meta: tr('onboardingPlayerMeta', 'Im Player kannst du einen ersten Song suchen und direkt in die Queue legen.')
      }
    ];

    const issueSteps = issues.slice(0, 2).map((issue) => ({
      title: issue?.title || tr('setupHint', 'Setup-Hinweis'),
      meta: issue?.description || ''
    }));

    return [baseSteps[0], ...issueSteps, ...baseSteps.slice(1)];
  }

  function renderOnboarding(onboarding = {}, issues = []) {
    if (!onboardingPanel) return;
    currentOnboarding = {
      completed: Boolean(onboarding?.completed),
      completedAt: onboarding?.completedAt || null
    };
    currentSetupIssues = Array.isArray(issues) ? issues : [];

    if (currentOnboarding.completed) {
      onboardingPanel.hidden = true;
      return;
    }

    onboardingPanel.hidden = false;
    if (onboardingStatus) {
      onboardingStatus.textContent = currentSetupIssues.length ? tr('setupOpen', 'Setup offen') : tr('ready', 'Bereit');
    }
    if (onboardingSteps) {
      onboardingSteps.innerHTML = buildOnboardingSteps(currentSetupIssues)
        .map((step) => `
          <li class="onboarding-step">
            <span class="onboarding-step-title">${escapeHtml(step.title)}</span>
            ${step.meta ? `<span class="onboarding-step-meta">${escapeHtml(step.meta)}</span>` : ''}
          </li>
        `)
        .join('');
    }
    if (onboardingHelp) {
      onboardingHelp.textContent = currentSetupIssues.length
        ? tr('onboardingHelpWithIssues', 'Wenn mpv fehlt, setze den Pfad unter Einstellungen. Wenn yt-dlp fehlt, bleibt die Suche eingeschränkt, bis du den Resolver anpasst.')
        : tr('onboardingHelpReady', 'Die Basis ist da. Starte mit den Einstellungen, kopiere danach die OBS-URL und teste einen ersten Request.');
    }
  }

  function renderSetupIssues(issues = []) {
    if (!setupIssuesBanner || !setupIssuesList) return;
    const list = Array.isArray(issues) ? issues : [];
    if (heroMpvStatus) {
      const mpvIssue = list.find((issue) => String(issue?.title || '').toLowerCase().includes('mpv'));
      heroMpvStatus.textContent = mpvIssue ? tr('mpvNotInstalled', 'Nicht installiert') : tr('ready', 'Bereit');
    }
    if (!list.length) {
      setupIssuesBanner.style.display = 'none';
      setupIssuesList.innerHTML = '';
      return;
    }

    setupIssuesBanner.style.display = 'block';
    setupIssuesList.innerHTML = list
      .map((issue) => {
        const icon = issue?.severity === 'error' ? '❌' : '⚠️';
        const instructions = Array.isArray(issue?.installInstructionKeys)
          ? issue.installInstructionKeys.map((key) => translateRuntimeMessageKey(key, key))
          : (Array.isArray(issue?.installInstructions) ? issue.installInstructions : []);
        const instructionsHtml = instructions.length
          ? `<ul>${instructions.map((instr) => `<li><code>${escapeHtml(instr)}</code></li>`).join('')}</ul>`
          : '';
        const installStatus = issue?.installStatus;
        const installStatusMessage = localizedProducerText(installStatus, 'message');
        const installStatusHtml = installStatusMessage
          ? `<p class="setup-install-status ${escapeHtml(installStatus.state || 'info')}">${escapeHtml(installStatusMessage)}${installStatus.command ? ` <code>${escapeHtml(installStatus.command)}</code>` : ''}</p>`
          : '';
        const installButtonHtml = issue?.oneClickInstall && issue?.installAction === 'mpv'
          ? `<div class="setup-issue-actions">
              <button class="btn primary small" type="button" data-setup-action="install-mpv" ${installStatus?.state === 'installing' ? 'disabled' : ''}>
                ${escapeHtml(localizedProducerText(issue, 'installButton', tr('install', 'Installieren')))}
              </button>
            </div>`
          : '';
        return `
          <div class="setup-issue ${issue?.severity === 'error' ? 'error' : 'warning'}">
            <strong>${icon} ${escapeHtml(localizedProducerText(issue, 'title', tr('setupHint', 'Setup-Hinweis')))}</strong><br>
            <span style="font-size:0.9em;">${escapeHtml(localizedProducerText(issue, 'description', ''))}</span>
            ${installButtonHtml}
            ${installStatusHtml}
            ${instructionsHtml}
          </div>
        `;
      })
      .join('');
  }

  function getMpvStatusFromPayload(payload = {}) {
    if (payload.mpvInstallStatus) return payload.mpvInstallStatus;
    const mpvIssue = Array.isArray(payload.issues)
      ? payload.issues.find((issue) => issue?.installAction === 'mpv' || String(issue?.title || '').toLowerCase().includes('mpv'))
      : null;
    return mpvIssue?.installStatus || null;
  }

  function applySetupStatus(payload = {}) {
    currentSetupIssues = Array.isArray(payload?.issues) ? payload.issues : [];
    renderSetupIssues(currentSetupIssues);
    renderOnboarding(currentOnboarding, currentSetupIssues);
    return getMpvStatusFromPayload(payload);
  }

  function stopMpvInstallPolling() {
    if (mpvInstallPollTimer) {
      clearInterval(mpvInstallPollTimer);
      mpvInstallPollTimer = null;
    }
    mpvInstallPollAttempts = 0;
  }

  async function pollMpvInstallStatus() {
    mpvInstallPollAttempts += 1;
    const setupStatus = await get('/setup-status');
    const installStatus = applySetupStatus(setupStatus);

    if (setupStatus?.mpvAvailable || installStatus?.state === 'installed') {
      stopMpvInstallPolling();
      showToast('success', tr('mpvInstallation', 'MPV Installation'), tr('mpvReady', 'mpv wurde gefunden und ist bereit.'));
      return;
    }

    if (installStatus?.state === 'failed' || installStatus?.state === 'unavailable') {
      stopMpvInstallPolling();
      showToast('error', tr('mpvInstallation', 'MPV Installation'), localizedProducerText(installStatus, 'message', tr('installationFailed', 'Installation fehlgeschlagen.')));
      return;
    }

    if (mpvInstallPollAttempts >= 130) {
      stopMpvInstallPolling();
      showToast('warn', tr('mpvInstallation', 'MPV Installation'), tr('installationSlow', 'Die Installation laeuft ungewoehnlich lange. Pruefe den Paketmanager oder setze den mpv Pfad manuell.'));
    }
  }

  function startMpvInstallPolling() {
    stopMpvInstallPolling();
    mpvInstallPollTimer = setInterval(() => {
      pollMpvInstallStatus().catch((error) => {
        stopMpvInstallPolling();
        showToast('error', tr('mpvInstallation', 'MPV Installation'), error?.message || tr('statusCheckFailed', 'Status konnte nicht geprueft werden.'));
      });
    }, 3000);
    pollMpvInstallStatus().catch(() => {});
  }

  async function installMpvFromSetup(button) {
    if (button) {
      button.disabled = true;
      button.textContent = tr('installing', 'Installiere...');
    }

    const result = await post('/install/mpv');
    const status = result?.installStatus || {};
    if (Array.isArray(result?.issues)) {
      applySetupStatus(result);
    }

    if (result?.mpvAvailable || status.state === 'installed') {
      showToast('success', tr('mpvInstallation', 'MPV Installation'), localizedProducerText(status, 'message', tr('mpvReady', 'mpv ist bereit.')));
      return;
    }

    if (status.state === 'installing' || result?.pending) {
      showToast('info', tr('mpvInstallation', 'MPV Installation'), localizedProducerText(status, 'message', tr('installationStarted', 'Installation wurde gestartet. Status wird automatisch geprueft.')));
      startMpvInstallPolling();
      return;
    }

    showToast('error', tr('mpvInstallation', 'MPV Installation'), result?.error || localizedProducerText(status, 'message', tr('installationStartFailed', 'Installation konnte nicht gestartet werden.')));
    if (button) {
      button.disabled = false;
      button.textContent = tr('installMpv', 'MPV installieren');
    }
  }

  setupIssuesList?.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-setup-action="install-mpv"]');
    if (!actionButton) return;
    installMpvFromSetup(actionButton);
  });

  async function completeOnboarding() {
    if (!onboardingComplete) return;
    onboardingComplete.disabled = true;
    const result = await post('/onboarding/complete');
    onboardingComplete.disabled = false;
    if (result?.success) {
      renderOnboarding(result.onboarding || { completed: true }, currentSetupIssues);
      showToast('success', tr('assistantCompleted', 'Assistent abgeschlossen'), tr('assistantCompletedMessage', 'Clip bleibt still, bis du ihn wieder brauchst.'));
    } else {
      showToast('error', tr('setup', 'Einrichtung'), result?.error || tr('onboardingSaveFailed', 'Der Abschluss konnte nicht gespeichert werden.'));
    }
  }

  document.getElementById('pause-btn').addEventListener('click', async () => {
    const result = await post('/pause');
    if (result?.success) {
      updateState('paused');
      stopProgressTimer();
    } else {
      showToast('warn', tr('pauseTitle', 'Pause'), result?.error || tr('noActiveTrack', 'Aktuell läuft kein Titel.'));
    }
  });
  document.getElementById('resume-btn').addEventListener('click', async () => {
    const result = await post('/resume');
    if (result?.success && result.track) {
      renderNowPlaying(result.track);
      showToast(
        'success',
        result.resumed ? tr('playbackResumed', 'Wiedergabe fortgesetzt') : tr('playbackStarted', 'Wiedergabe gestartet'),
        result.track.title || tr('nextTrackPlaying', 'Nächster Titel läuft.')
      );
    } else if (!result?.success) {
      showToast('warn', tr('resumeTitle', 'Fortsetzen'), result?.error || tr('noStartableTrack', 'Queue und Auto-DJ enthalten keinen startbaren Titel.'));
    }
  });
  skipButton?.addEventListener('click', async () => {
    if (skipInProgress) return;
    skipInProgress = true;
    setSkipLoading(true);
    try {
    const result = await post('/skip');
    if (result?.success && result.next) {
      renderNowPlaying(result.next);
      showToast('success', tr('skipTitle', 'Überspringen'), tr('playingNow', 'Spielt jetzt: {title}', {
        title: result.next.title || tr('selectedTitle', 'Ausgewählter Titel')
      }));
    } else if (result?.success && result.nextError) {
      showToast('warn', tr('autoDjToastTitle', 'Auto-DJ'), result.nextError);
    }
    if (!result?.success) {
      showToast('warn', tr('skipTitle', 'Überspringen'), result?.error || tr('noActiveTrack', 'Aktuell läuft kein Titel.'));
    }
    } finally {
      skipInProgress = false;
      setSkipLoading(false);
    }
  });
  document.getElementById('clear-btn').addEventListener('click', () => {
    post('/clear');
  });

  previewVolumeInput?.addEventListener('input', () => {
    setPreviewVolume(previewVolumeInput.value);
  });

  // Auto-detect YouTube URLs as the user types/pastes
  searchInput?.addEventListener('input', () => {
    const val = searchInput.value.trim();
    const ytId = extractYouTubeId(val);
    if (ytId) {
      setPreviewVideo(ytId);
      searchFeedback.textContent = '';
    }
  });

  async function resolvePreview() {
    const query = searchInput.value.trim();
    if (!query) return;

    // For YouTube URLs: show the player immediately client-side, then fetch metadata
    const ytId = extractYouTubeId(query);
    if (ytId) {
      setPreviewVideo(ytId);
      searchFeedback.textContent = `⏳ ${tr('searchLoading', 'Lade Informationen…')}`;
    } else {
      searchFeedback.textContent = `🔍 ${tr('searching', 'Suche…')}`;
    }

    const res = await get(`/resolve?q=${encodeURIComponent(query)}`);
    if (res?.success) {
      const dur = formatDuration(res.song.duration);
      const channel = res.song.channelName || res.song.artist || '';
      searchFeedback.textContent = `🎵 ${res.song.title}${channel ? ' • ' + channel : ''}${dur !== '—' ? ' • ' + dur : ''}`;
      if (!ytId) {
        updatePreviewFrame(res.song);
      }
    } else {
      searchFeedback.textContent = `⚠️ ${res?.error || tr('noResult', 'Kein Ergebnis.')}`;
      if (!ytId) {
        clearPreview();
      }
    }
  }

  searchBtn?.addEventListener('click', resolvePreview);
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      resolvePreview();
    }
  });

  requestBtn?.addEventListener('click', async () => {
    const query = searchInput.value.trim();
    if (!query) return;
    requestFeedback.textContent = `⏳ ${tr('queueAdding', 'Wird zur Queue hinzugefügt…')}`;
    const result = await post('/request', { query });
    if (result?.success) {
      requestFeedback.textContent = `✅ ${tr('queueAdded', 'Hinzugefügt: {title}', { title: result.song.title })}`;
      renderQueueFromServer();
      showToast('success', tr('songAddedTitle', 'Song hinzugefügt'), result.song.title);
    } else {
      const errorMessage = localizedApiError(result, tr('requestFailed', 'Fehler beim Request.'));
      requestFeedback.textContent = `⚠️ ${errorMessage}`;
      showToast('warn', tr('requestRejectedTitle', 'Song-Request abgelehnt'), errorMessage);
    }
  });

  // Debounced volume/crossfade POSTs — the label updates immediately for responsiveness,
  // but the server request (which also persists config) only fires after the user stops dragging.
  const postMasterVolume = debounce(async (vol) => {
    const result = await post('/volume', { masterVolume: vol });
    if (!result?.success) {
      showToast('error', tr('masterVolumeTitle', 'Master-Lautstärke'), result?.error || tr('volumeSetFailed', 'Lautstärke konnte nicht gesetzt werden.'));
    }
  });
  masterVolumeInput?.addEventListener('input', () => {
    const vol = Number(masterVolumeInput.value);
    if (masterVolumeValue) masterVolumeValue.textContent = vol;
    postMasterVolume(vol);
  });

  const postSourceVolume = debounce(async (vol) => {
    const result = await post('/volume', { sourceVolume: vol });
    if (!result?.success) {
      showToast('error', tr('sourceVolumeTitle', 'Quell-Lautstärke'), result?.error || tr('volumeSetFailed', 'Lautstärke konnte nicht gesetzt werden.'));
    }
  });
  volumeInput.addEventListener('input', () => {
    const vol = Number(volumeInput.value);
    volumeValue.textContent = vol;
    postSourceVolume(vol);
  });

  const postCrossfade = debounce(async (ms) => {
    crossfadeInput?.setAttribute('aria-busy', 'true');
    if (crossfadeSaveStatus) crossfadeSaveStatus.textContent = tr('crossfadeSaving', 'Wird gespeichert ...');
    try {
      const result = await post('/config', { playback: { crossfadeDuration: ms } });
      if (!result?.success) {
        showToast('error', tr('crossfadeTitle', 'Crossfade'), result?.error || tr('crossfadeSaveFailed', 'Crossfade konnte nicht gespeichert werden.'));
        if (crossfadeSaveStatus) crossfadeSaveStatus.textContent = tr('crossfadeSaveFailed', 'Crossfade konnte nicht gespeichert werden.');
        return;
      }
      if (crossfadeSaveStatus) crossfadeSaveStatus.textContent = tr('crossfadeApplied', 'Aktiv');
    } finally {
      crossfadeInput?.removeAttribute('aria-busy');
    }
  });
  crossfadeInput.addEventListener('input', () => {
    const seconds = Number(crossfadeInput.value);
    crossfadeValue.textContent = `${seconds}s`;
    postCrossfade(seconds * 1000);
  });

  duplicateDetection.addEventListener('change', async () => {
    await post('/config', { queue: { duplicateDetection: duplicateDetection.value } });
  });

  cooldownSecondsInput.addEventListener('change', async () => {
    const seconds = Math.max(0, Number(cooldownSecondsInput.value) || 0);
    cooldownSecondsInput.value = seconds;
    await post('/config', { queue: { cooldownPerUserSeconds: seconds } });
  });

  maxSongDurationInput?.addEventListener('change', async () => {
    const seconds = clampSongDuration(maxSongDurationInput.value);
    maxSongDurationInput.value = seconds;
    await post('/config', { queue: { maxSongDurationSeconds: seconds } });
  });

  cooldownBypassGifts.addEventListener('change', async () => {
    await post('/config', { queue: { cooldownBypassForGifts: cooldownBypassGifts.checked } });
  });

  skipImmunityGifts.addEventListener('blur', async () => {
    const gifts = parseList(skipImmunityGifts.value);
    await post('/config', { giftIntegration: { skipImmunityGifts: gifts } });
  });

  requireSuperfan?.addEventListener('change', async () => {
    await post('/config', { permissions: { requireSuperfanForRequest: requireSuperfan.checked } });
  });

  payToPlayEnabled?.addEventListener('change', async () => {
    await post('/config', { monetization: { payToPlayEnabled: payToPlayEnabled.checked } });
  });

  payToSkipEnabled?.addEventListener('change', async () => {
    await post('/config', { monetization: { payToSkipEnabled: payToSkipEnabled.checked } });
  });

  likeGateEnabled?.addEventListener('change', async () => {
    await post('/config', { monetization: { likeGateEnabled: likeGateEnabled.checked } });
  });

  giftCatalogList?.addEventListener('change', () => {
    const visibleOptions = Array.from(giftCatalogList.options || []).filter((option) => option.value);
    visibleOptions.forEach((option) => {
      if (option.selected) {
        giftCatalogSelectedValues.add(option.value);
      } else {
        giftCatalogSelectedValues.delete(option.value);
      }
    });

    const selected = collectGiftCatalogSelection();
    if (!selected.length) {
      renderGiftCatalogList();
      return;
    }

    const target = giftCatalogTargetField;
    if (target) {
      const existing = parseList(target.value);
      const merged = Array.from(new Set([...existing, ...selected]));
      target.value = merged.join(', ');
    }

    renderGiftCatalogList();
  });

  payToPlayGifts?.addEventListener('focus', () => {
    giftCatalogTargetField = payToPlayGifts;
  });
  payToSkipGifts?.addEventListener('focus', () => {
    giftCatalogTargetField = payToSkipGifts;
  });
  skipImmunityGifts?.addEventListener('focus', () => {
    giftCatalogTargetField = skipImmunityGifts;
  });

  const clearGiftTarget = (target) => {
    if (giftCatalogTargetField === target) {
      giftCatalogTargetField = null;
    }
  };

  payToPlayGifts?.addEventListener('blur', async () => {
    await post('/config', { monetization: { payToPlayGiftCatalog: parseList(payToPlayGifts.value) } });
    clearGiftTarget(payToPlayGifts);
  });
  payToSkipGifts?.addEventListener('blur', async () => {
    await post('/config', { monetization: { payToSkipGiftCatalog: parseList(payToSkipGifts.value) } });
    clearGiftTarget(payToSkipGifts);
  });
  skipImmunityGifts?.addEventListener('blur', async () => {
    await post('/config', { giftIntegration: { skipImmunityGifts: parseList(skipImmunityGifts.value) } });
    clearGiftTarget(skipImmunityGifts);
  });

  giftCatalogSearch?.addEventListener('input', () => {
    giftCatalogFilter = giftCatalogSearch.value || '';
    renderGiftCatalogList();
  });

  giftCatalogRefresh?.addEventListener('click', () => {
    refreshGiftCatalog();
  });

  giftCatalogApplyPayToPlay?.addEventListener('click', async () => {
    giftCatalogSelectedValues = new Set(collectGiftCatalogSelection());
    await applyGiftCatalogSelection(
      payToPlayGifts,
      { monetization: { payToPlayGiftCatalog: parseList(payToPlayGifts.value) } },
      'Pay-to-Play'
    );
  });

  giftCatalogApplyPayToSkip?.addEventListener('click', async () => {
    giftCatalogSelectedValues = new Set(collectGiftCatalogSelection());
    await applyGiftCatalogSelection(
      payToSkipGifts,
      { monetization: { payToSkipGiftCatalog: parseList(payToSkipGifts.value) } },
      'Pay-to-Skip'
    );
  });

  giftCatalogApplySkipImmunity?.addEventListener('click', async () => {
    giftCatalogSelectedValues = new Set(collectGiftCatalogSelection());
    await applyGiftCatalogSelection(
      skipImmunityGifts,
      { giftIntegration: { skipImmunityGifts: parseList(skipImmunityGifts.value) } },
      'Skip-Immunity'
    );
  });

  function buildOverlayUrl() {
    const design = overlayDesign?.value || 'compact';
    const theme = overlayTheme?.value || 'default';
    const position = overlayPosition?.value || 'bottom-left';
    const base = `${window.location.protocol}//${window.location.host}/plugins/music-bot/overlay.html`;
    return `${base}?design=${design}&theme=${theme}&position=${position}`;
  }

  function refreshOverlayUrl() {
    if (overlayUrl) overlayUrl.value = buildOverlayUrl();
  }

  // Persist overlay design/theme/position to config (debounced) and refresh the URL locally.
  const persistOverlay = debounce(() => {
    post('/config', {
      overlay: {
        design: overlayDesign?.value || 'compact',
        theme: overlayTheme?.value || 'default',
        position: overlayPosition?.value || 'bottom-left'
      }
    });
  });

  function onOverlayChange() {
    refreshOverlayUrl();
    persistOverlay();
  }

  overlayDesign?.addEventListener('change', onOverlayChange);
  overlayTheme?.addEventListener('change', onOverlayChange);
  overlayPosition?.addEventListener('change', onOverlayChange);

  overlayCopy?.addEventListener('click', () => {
    const url = buildOverlayUrl();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        const orig = overlayCopy.textContent;
        overlayCopy.textContent = tr('copySuccess', '✅ Kopiert!');
        setTimeout(() => { overlayCopy.textContent = orig; }, 2000);
      }).catch(() => {
        if (overlayUrl) { overlayUrl.select(); }
        alert(tr('copyFailed', 'URL konnte nicht kopiert werden. Bitte manuell kopieren.'));
      });
    } else {
      if (overlayUrl) { overlayUrl.select(); }
    }
  });

  overlayOpen?.addEventListener('click', () => {
    window.open(buildOverlayUrl(), '_blank');
  });

  onboardingSettings?.addEventListener('click', () => {
    setActiveTab('settings');
  });

  onboardingOverlay?.addEventListener('click', () => {
    setActiveTab('overlay');
  });

  onboardingComplete?.addEventListener('click', completeOnboarding);

  autoDjSave.addEventListener('click', async () => {
    const playlistUrls = parseList(autoDjPlaylistUrls?.value || '');
    const selectedGenres = Array.from(autoDjGenres?.selectedOptions || []).map((option) => option.value);
    const mixHistoryPercent = Number(autoDjMixHistoryPercent.value);
    const normalizedMixHistoryPercent = autoDjMixHistoryPercent.value.trim() === '' || !Number.isFinite(mixHistoryPercent)
      ? 80
      : Math.min(100, Math.max(0, mixHistoryPercent));
    const payload = {
      enabled: autoDjEnabled.checked,
      mode: autoDjMode.value,
      historyMinPlays: Number(autoDjHistoryPlays.value) || 1,
      mixHistoryPercent: normalizedMixHistoryPercent,
      repeatCooldownHours: Math.min(168, Math.max(1, Number(autoDjRepeatCooldownHours.value) || 12)),
      maxConsecutiveAutoDJ: Number(autoDjMaxConsecutive.value) || 1,
      announceAutoDJ: autoDjAnnounce.checked,
      playlistUrls,
      playlistFallbackToRandom: true,
      genreFilterEnabled: Boolean(autoDjGenreFilter?.checked),
      selectedGenres,
      bpmTransitionsEnabled: Boolean(autoDjBpmTransitions?.checked),
      artistSpacingMinutes: Math.min(1440, Math.max(0, Number(autoDjArtistSpacing?.value) || 0)),
      albumSpacingMinutes: Math.min(10080, Math.max(0, Number(autoDjAlbumSpacing?.value) || 0)),
      noveltyBudgetPercent: Math.min(100, Math.max(0, Number(autoDjNoveltyBudget?.value) || 0)),
      requestSeedsEnabled: Boolean(autoDjRequestSeeds?.checked),
      liveFeedbackEnabled: Boolean(autoDjLiveFeedback?.checked),
      previewEnabled: Boolean(autoDjPreviewEnabled?.checked),
      chatVotingEnabled: Boolean(autoDjChatVoting?.checked),
      chatVoteCloseBeforeEndSeconds: Math.min(120, Math.max(5, Number(autoDjVoteCloseBefore?.value) || 20))
    };
    const result = await post('/auto-dj/toggle', payload);
    if (result?.track) {
      showToast('success', tr('autoDjStarted', 'Auto-DJ gestartet'), result.track.title || tr('nextTrackPlaying', 'Nächster Titel läuft.'));
    } else if (payload.enabled) {
      showToast('warn', tr('autoDjWaiting', 'Auto-DJ wartet'), tr('noTrackAvailable', 'Kein Titel verfügbar.'));
    }
    await refreshAutoDjStatus();
  });

  autoDjSkip.addEventListener('click', async () => {
    const result = await post('/auto-dj/skip');
    if (result?.success) {
      showToast('success', tr('autoDjToastTitle', 'Auto-DJ'), result.track?.title || tr('nextTrackPlaying', 'Nächster Titel läuft.'));
    } else {
      showToast('warn', tr('autoDjToastTitle', 'Auto-DJ'), tr('noTrackAvailable', 'Kein Titel verfügbar.'));
    }
    await refreshAutoDjStatus();
  });

  radioFeedbackMore?.addEventListener('click', () => sendLiveRadioFeedback('more'));
  radioFeedbackLess?.addEventListener('click', () => sendLiveRadioFeedback('less'));

  aliasSave.addEventListener('click', async () => {
    const aliases = {};
    aliasInputs.forEach((input) => {
      aliases[input.dataset.command] = parseList(input.value);
    });
    await post('/config', { commandAliases: aliases });
  });

  ytdlpPathInput?.addEventListener('blur', async () => {
    const value = (ytdlpPathInput.value || '').trim();
    await post('/config', { resolver: { ytdlpPath: value || 'yt-dlp' } });
  });

  mpvPathInput?.addEventListener('blur', async () => {
    const value = (mpvPathInput.value || '').trim();
    await post('/config', { playback: { mpvPath: value || 'mpv' } });
  });

  settingsSave?.addEventListener('click', async () => {
    const payload = {
      queue: {
        duplicateDetection: duplicateDetection.value,
        cooldownPerUserSeconds: Math.max(0, Number(cooldownSecondsInput.value) || 0),
        maxSongDurationSeconds: clampSongDuration(maxSongDurationInput?.value),
        cooldownBypassForGifts: cooldownBypassGifts.checked
      },
      resolver: { ytdlpPath: (ytdlpPathInput?.value || '').trim() || 'yt-dlp' },
      playback: {
        mpvPath: (mpvPathInput?.value || '').trim() || 'mpv',
        normalization: {
          enabled: Boolean(normalizationEnabled?.checked),
          integratedLufs: Math.max(-30, Math.min(-8, Number(normalizationLufs?.value) || -16))
        }
      },
      giftIntegration: { skipImmunityGifts: parseList(skipImmunityGifts.value) },
      permissions: { requireSuperfanForRequest: requireSuperfan?.checked || false },
      audio: {
        masterVolume: Math.max(0, Math.min(100, Number(masterVolumeInput?.value) || 0)),
        sourceVolume: Math.max(0, Math.min(100, Number(volumeInput?.value) || 0))
      },
      monetization: {
        payToPlayEnabled: payToPlayEnabled?.checked || false,
        payToPlayGiftCatalog: parseList(payToPlayGifts?.value || ''),
        payToPlayMinCoins: Math.max(0, Number(payToPlayMinCoins?.value) || 0),
        payToSkipEnabled: payToSkipEnabled?.checked || false,
        payToSkipGiftCatalog: parseList(payToSkipGifts?.value || ''),
        likeGateEnabled: likeGateEnabled?.checked || false,
        minLikesPerUser: Math.max(1, Number(minLikesPerUser?.value) || 1)
      }
    };
    const result = await post('/config', payload);
    showFeedback(settingsFeedback, result?.success ? `✅ ${tr('saved', 'Gespeichert')}` : `❌ ${tr('error', 'Fehler')}`);
  });

  rejectAge?.addEventListener('change', async () => {
    await post('/config', { moderation: { rejectAgeRestricted: rejectAge.checked } });
  });

  rejectExplicit?.addEventListener('change', async () => {
    await post('/config', { moderation: { rejectExplicit: rejectExplicit.checked } });
  });

  blockedKeywords?.addEventListener('blur', async () => {
    const keywords = parseList(blockedKeywords.value, true);
    await post('/config', { moderation: { blockedKeywords: keywords } });
  });

  moderationSave?.addEventListener('click', async () => {
    const keywords = parseList(blockedKeywords.value, true);
    const result = await post('/config', {
      moderation: {
        rejectAgeRestricted: rejectAge.checked,
        rejectExplicit: rejectExplicit.checked,
        blockedKeywords: keywords
      }
    });
    showFeedback(moderationFeedback, result?.success ? `✅ ${tr('saved', 'Gespeichert')}` : `❌ ${tr('error', 'Fehler')}`);
  });

  banAdd?.addEventListener('click', async () => {
    if (!banType || !banValue) return;
    const type = banType.value;
    const value = banValue.value.trim();
    const reason = banReason?.value?.trim();
    if (!value) {
      showBanFeedback(tr('enterValue', 'Bitte einen Wert eingeben.'), true);
      return;
    }
    const result = await post('/bans', { type, value, reason });
    if (result?.success) {
      showBanFeedback(tr('banAdded', 'Ban hinzugefügt.'), false);
      banValue.value = '';
      if (banReason) banReason.value = '';
      await refreshBans();
    } else {
      showBanFeedback(result?.error || tr('banAddFailed', 'Ban konnte nicht hinzugefügt werden.'), true);
    }
  });

  banTable?.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-ban-id]');
    if (!btn) return;
    const id = btn.dataset.banId;
    const result = await del(`/bans/${id}`);
    if (result?.success) {
      await refreshBans();
    } else {
      showBanFeedback(tr('banRemoveFailed', 'Ban konnte nicht entfernt werden.'), true);
    }
  });

  function findClientTrack(trackId) {
    const id = String(trackId || '');
    if (String(latestNowPlayingTrack?.id || '') === id) return latestNowPlayingTrack;
    return [...latestQueueTracks, ...latestHistoryTracks]
      .find((track) => String(track?.id || '') === id) || null;
  }

  function selectTrackBanScope(scope) {
    trackBanScope = ['track', 'artist', 'channel', 'keyword'].includes(scope) ? scope : 'track';
    trackBanMenu?.querySelectorAll('[data-track-ban-scope]').forEach((button) => {
      button.setAttribute('aria-checked', String(button.dataset.trackBanScope === trackBanScope));
    });
    if (trackBanKeywordField) trackBanKeywordField.hidden = trackBanScope !== 'keyword';
    if (trackBanScope === 'keyword') trackBanKeyword?.focus();
  }

  function openTrackBanMenu(trigger) {
    const id = String(trigger?.dataset?.trackId || '');
    const catalogEventId = String(trigger?.dataset?.catalogEventId || '');
    if (!id || (!catalogEventId && !findClientTrack(id)) || !trackBanMenu) return;
    document.querySelectorAll('[data-track-ban-trigger][aria-expanded="true"]').forEach((button) => {
      button.setAttribute('aria-expanded', 'false');
    });
    trackBanTargetId = id;
    trackBanCatalogEventId = catalogEventId || null;
    trackBanReturnFocus = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    trackBanMenu.hidden = false;
    if (trackBanKeyword) trackBanKeyword.value = '';
    if (trackBanFeedback) trackBanFeedback.textContent = '';
    selectTrackBanScope('track');
    trackBanMenu.querySelector('[data-track-ban-scope="track"]')?.focus();
  }

  function closeTrackBanMenu() {
    if (!trackBanMenu || trackBanMenu.hidden) return;
    trackBanMenu.hidden = true;
    trackBanReturnFocus?.setAttribute('aria-expanded', 'false');
    trackBanReturnFocus?.focus();
    trackBanTargetId = null;
    trackBanCatalogEventId = null;
    trackBanReturnFocus = null;
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-track-ban-trigger]');
    if (trigger) {
      event.preventDefault();
      event.stopPropagation();
      openTrackBanMenu(trigger);
      return;
    }
    if (!trackBanMenu?.hidden && !event.target.closest('#track-ban-menu')) closeTrackBanMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeTrackBanMenu();
      return;
    }
    if (!trackBanMenu || trackBanMenu.hidden) return;
    const scopeOptions = Array.from(trackBanMenu.querySelectorAll('[data-track-ban-scope]'));
    const scopeIndex = scopeOptions.indexOf(document.activeElement);
    if (scopeIndex >= 0 && ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) {
      event.preventDefault();
      const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
      scopeOptions[(scopeIndex + direction + scopeOptions.length) % scopeOptions.length]?.focus();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = Array.from(trackBanMenu.querySelectorAll('button:not([disabled]), input:not([disabled])'))
        .filter((element) => !element.closest('[hidden]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  trackBanMenuClose?.addEventListener('click', closeTrackBanMenu);
  trackBanMenu?.addEventListener('click', (event) => {
    const option = event.target.closest('[data-track-ban-scope]');
    if (option) selectTrackBanScope(option.dataset.trackBanScope);
  });
  trackBanSubmit?.addEventListener('click', async () => {
    if (!trackBanTargetId) return;
    const keyword = trackBanKeyword?.value?.trim() || '';
    if (trackBanScope === 'keyword' && !keyword) {
      if (trackBanFeedback) trackBanFeedback.textContent = tr('enterTitleKeyword', 'Bitte einen Titelbegriff eingeben.');
      return;
    }
    setSafetyBusy(trackBanSubmit, true);
    const result = await post('/bans/from-track', {
      trackId: trackBanTargetId,
      catalogEventId: trackBanCatalogEventId || undefined,
      scope: trackBanScope,
      keyword: trackBanScope === 'keyword' ? keyword : undefined,
      stopCurrent: trackBanStopCurrent?.checked !== false,
      removeQueued: trackBanRemoveQueued?.checked !== false
    });
    setSafetyBusy(trackBanSubmit, false);
    if (!result?.success) {
      if (trackBanFeedback) trackBanFeedback.textContent = result?.error || tr('banFailed', 'Ban fehlgeschlagen.');
      return;
    }
    closeTrackBanMenu();
    await Promise.all([renderQueueFromServer(), refreshHistory(), refreshBans()]);
    showToast('success', tr('moderationTitle', 'Moderation'), tr('queueMatchesRemoved', '{count} Queue-Treffer entfernt.', {
      count: result.removedQueued || 0
    }));
  });

  emergencyStopButton?.addEventListener('click', async () => {
    setSafetyBusy(emergencyStopButton, true);
    const result = await post('/emergency-stop', {});
    setSafetyBusy(emergencyStopButton, false);
    if (result?.success) {
      renderSafetyState({ safetyLock: true });
      renderHealth(result.health || { locked: true, state: 'locked' });
      showSafetyFeedback(tr('emergencyDone', 'Not-Aus ausgeführt. Die Queue bleibt erhalten.'));
      renderNowPlaying(null);
    } else {
      showSafetyFeedback(result?.error || tr('emergencyFailed', 'Not-Aus fehlgeschlagen.'), true);
    }
  });

  safetyUnlockButton?.addEventListener('click', async () => {
    setSafetyBusy(safetyUnlockButton, true);
    const result = await post('/safety-lock', { locked: false });
    setSafetyBusy(safetyUnlockButton, false);
    if (result?.success) {
      renderSafetyState({ safetyLock: false });
      renderHealth(result.health || { locked: false, state: 'idle' });
      showSafetyFeedback(tr('safetyUnlocked', 'Safety-Lock gelöst. Wiedergabe startet erst nach einer separaten Aktion.'));
    } else {
      showSafetyFeedback(result?.error || tr('unlockFailed', 'Entsperren fehlgeschlagen.'), true);
    }
  });

  playerResetButton?.addEventListener('click', async () => {
    setSafetyBusy(playerResetButton, true);
    const result = await post('/player/reset', {});
    setSafetyBusy(playerResetButton, false);
    if (result?.success) {
      renderNowPlaying(null);
      renderHealth(result.health || {});
      showSafetyFeedback(tr('playerReset', 'Soundbot-Player wurde zurückgesetzt.'));
    } else {
      showSafetyFeedback(result?.error || tr('playerResetFailed', 'Player-Reset fehlgeschlagen.'), true);
    }
  });

  testToneButton?.addEventListener('click', async () => {
    setSafetyBusy(testToneButton, true);
    const result = await post('/player/test-tone', {});
    setSafetyBusy(testToneButton, false);
    showSafetyFeedback(
      result?.success ? tr('testToneCompleted', 'Testton abgeschlossen.') : (result?.error || tr('testToneFailed', 'Testton fehlgeschlagen.')),
      !result?.success
    );
  });

  healthRefreshButton?.addEventListener('click', () => refreshDiagnostics());
  diagnosticsExportButton?.addEventListener('click', async () => {
    const diagnostics = await get('/diagnostics');
    if (!diagnostics?.success) {
      showSafetyFeedback(diagnostics?.error || tr('diagnosticsExportFailed', 'Diagnoseexport fehlgeschlagen.'), true);
      return;
    }
    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `musicbot-diagnostics-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    showSafetyFeedback(tr('diagnosticsExported', 'Diagnose wurde exportiert.'));
  });

  socket.on('connect', () => {
    socket.emit('musicbot:request-status');
  });

  socket.on('musicbot:now-playing', (payload) => {
    renderNowPlaying(payload);
    // If the currently-playing track is a YouTube video, show it in the player.
    // Only overwrite the search input when it is empty or untouched by the user,
    // so we don't clobber a query the user is actively typing.
    if (payload?.youtubeId) {
      setPreviewVideo(payload.youtubeId);
      if (searchInput && !searchInput.value.trim()) {
        searchInput.value = payload.url || '';
      }
    }
    refreshHistory({ reset: true });
    refreshRadioPreview();
  });

  socket.on('musicbot:queue-update', ({ queue, length }) => {
    renderQueue(queue, length);
  });

  socket.on('musicbot:volume-changed', ({ volume, masterVolume, sourceVolume }) => {
    if (typeof volume === 'number') {
      if (typeof sourceVolume === 'number') {
        volumeInput.value = sourceVolume;
        volumeValue.textContent = sourceVolume;
      } else {
        volumeInput.value = volume;
        volumeValue.textContent = volume;
      }
      if (typeof masterVolume === 'number' && masterVolumeInput && masterVolumeValue) {
        masterVolumeInput.value = masterVolume;
        masterVolumeValue.textContent = masterVolume;
      }
    }
  });
  socket.on('musicbot:status-toast', (payload) => {
    showToast(
      payload?.type || 'info',
      localizedProducerText(payload, 'title', tr('toastDefaultTitle', 'Musik-Bot')),
      localizedProducerText(payload, 'message', ''),
      payload
    );
  });
  socket.on('music-bot:setup-status', (payload) => {
    const installStatus = applySetupStatus(payload);
    if (payload?.mpvAvailable || ['installed', 'failed', 'unavailable'].includes(installStatus?.state)) {
      stopMpvInstallPolling();
    }
  });
  socket.on('music-bot:onboarding-updated', (payload) => {
    renderOnboarding(payload || { completed: true }, currentSetupIssues);
  });
  socket.on('musicbot:error', (payload) => {
    showToast('error', tr('apiError', 'API-Fehler'), payload?.message || tr('unknownError', 'Unbekannter Fehler'));
  });
  socket.on('connect_error', () => {
    showToast('error', tr('networkTitle', 'Netzwerk'), tr('connectionLost', 'Verbindung zum Music Bot unterbrochen.'));
  });
  socket.on('disconnect', () => {
    showToast('warn', tr('networkTitle', 'Netzwerk'), tr('socketDisconnected', 'Socket-Verbindung getrennt.'));
  });

  socket.on('musicbot:paused', () => {
    updateState('paused');
    stopProgressTimer();
  });
  socket.on('musicbot:resumed', () => {
    updateState('playing');
    startProgressTimer();
  });
  socket.on('musicbot:playback-stopped', () => {
    renderNowPlaying(null);
  });
  socket.on('musicbot:playback-advancing', (payload) => {
    seekTransitioning = true;
    latestRuntime = { ...(latestRuntime || {}), transportState: payload?.state || 'loading' };
    updateSeekControl();
    const message = payload?.messageKey
      ? translateRuntimeMessageKey(payload?.messageKey, payload?.message || tr('playbackAdvancing', 'Lädt den nächsten Titel …'))
      : payload?.message;
    setSkipLoading(true, message);
  });
  socket.on('musicbot:playback-sync', (payload) => {
    if (payload?.playbackId && activePlaybackId && payload.playbackId !== activePlaybackId) return;
    if (payload?.playbackId) activePlaybackId = payload.playbackId;
    if (typeof payload.position === 'number') {
      progressCurrentPos = payload.position;
      lastConfirmedSeekPosition = payload.position;
      seekPreviewActive = false;
      updateProgressBar();
    }
    if (typeof payload.duration === 'number') {
      progressDuration = payload.duration;
      if (npDuration) npDuration.textContent = formatDuration(payload.duration);
    }
    if (payload?.seekable !== undefined && latestNowPlayingTrack) latestNowPlayingTrack.seekable = Boolean(payload.seekable);
    if (payload?.state && latestNowPlayingTrack) latestNowPlayingTrack.state = payload.state;
    updateSeekControl();
  });
  socket.on('musicbot:song-skipped', () => refreshHistory({ reset: true }));
  socket.on('musicbot:history-update', (payload) => {
    const songId = String(payload?.songId || '');
    if (!songId) return;
    const previous = canonicalSongState.get(songId) || {};
    canonicalSongState.set(songId, {
      ...previous,
      ...(payload.feedback || {}),
      ...(payload.feedback?.state ? { feedback: payload.feedback.state } : {})
    });
    if (payload?.refresh) {
      refreshHistory({ reset: true });
      return;
    }
    renderHistory(latestHistoryTracks);
  });
  socket.on('musicbot:radio-feedback', () => refreshRadioPreview());
  socket.on('musicbot:streamer-playlist', () => {
    refreshStreamerPlaylistCuration();
    refreshPlaylists();
  });
  socket.on('musicbot:artist-radio', (payload) => {
    if (payload?.status) latestAutoDjStatus = payload.status;
    renderNowPlaying(latestNowPlayingTrack);
    refreshRadioPreview();
  });
  socket.on('musicbot:playlist-import-progress', async (payload) => {
    const status = payload?.status || 'running';
    if (playlistImportProgress) {
      const label = playlistImportStatusLabel(status);
      const progress = Number.isFinite(Number(payload?.progress)) ? ` (${Math.round(Number(payload.progress))}%)` : '';
      playlistImportProgress.textContent = payload?.error
        ? catalogTr('importError', 'Import error: {error}', { error: payload.error })
        : `${label}${progress}`;
    }
    if (payload?.playlistId && selectedPlaylist?.id === payload.playlistId && ['completed', 'failed', 'aborted'].includes(status)) {
      await selectPlaylist(payload.playlistId);
      await refreshPlaylists();
    }
  });
  socket.on('musicbot:playlist-update', () => refreshPlaylists());
  socket.on('musicbot:runtime', (runtime) => {
    latestRuntime = runtime || null;
    if (Object.prototype.hasOwnProperty.call(runtime || {}, 'activePlaybackId')) {
      activePlaybackId = runtime.activePlaybackId || null;
    }
    seekTransitioning = ['loading', 'buffering', 'crossfading', 'recovering', 'stopping', 'error'].includes(
      String(runtime?.transportState || '').toLowerCase()
    );
    renderSafetyState(runtime || {});
    renderHealth({ ...runtime, resolver: latestResolver });
    updateSeekControl();
  });
  socket.on('musicbot:resolver', (resolver) => {
    latestResolver = resolver || null;
    renderResolverHealth(resolver || {});
  });
  socket.on('musicbot:health', (health) => renderHealth(health || {}));
  socket.on('musicbot:safety-lock-changed', (safety) => {
    renderSafetyState({ safetyLock: Boolean(safety?.locked) });
  });

  function setSafetyBusy(button, busy) {
    if (!button) return;
    button.disabled = Boolean(busy);
    button.setAttribute('aria-busy', String(Boolean(busy)));
  }

  function showSafetyFeedback(message, isError = false) {
    if (!safetyFeedback) return;
    safetyFeedback.textContent = String(message || '');
    safetyFeedback.classList.toggle('error', Boolean(isError));
  }

  function renderSafetyState(runtime = {}) {
    const locked = Boolean(runtime.safetyLock ?? runtime.locked);
    musicbotSafetyLocked = locked;
    latestRuntime = { ...(latestRuntime || {}), ...runtime, safetyLock: locked };
    document.documentElement.toggleAttribute('data-musicbot-locked', locked);
    safetyPanel?.classList.toggle('is-locked', locked);
    safetyLockStatus?.classList.toggle('is-locked', locked);
    safetyLockStatus?.classList.toggle('is-ready', !locked);
    if (safetyLockStatus) {
      safetyLockStatus.textContent = locked
        ? tr('safetyLocked', 'Safety-Lock aktiv')
        : tr('safetyReady', 'Entsperrt – wartet auf Start');
    }
    if (safetyUnlockButton) safetyUnlockButton.disabled = !locked;
    document.querySelectorAll('[data-playback-action]').forEach((control) => {
      control.disabled = locked;
      control.setAttribute('aria-disabled', String(locked));
    });
    document.querySelectorAll('[data-history-replay="play"]').forEach((control) => {
      control.disabled = locked;
      control.setAttribute('aria-disabled', String(locked));
    });
    updateSeekControl();
  }

  function catalogTr(key, fallback, params = {}) {
    const section = CATALOG_I18N_SECTIONS[key] || 'catalog';
    const fullKey = `${I18N_PREFIX}.${section}.${key}`;
    const translated = window.i18n?.t(fullKey, params);
    const value = translated && translated !== fullKey ? translated : fallback;
    return String(value).replace(/\{(\w+)\}/g, (_match, name) => params[name] ?? `{${name}}`);
  }

  function slotLabel(slot) {
    if (!slot) return '–';
    const pid = Number(slot.pid);
    const state = runtimeStateLabel(slot.state || slot.transportState || 'playing');
    return Number.isFinite(pid) && pid > 0 ? `${state} (PID ${pid})` : state;
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
  }

  function renderResolverHealth(resolver = {}) {
    latestResolver = resolver;
    if (!healthResolver) return;
    const active = Number(resolver.active ?? resolver.runner?.active ?? 0);
    const queued = Number(resolver.queued ?? resolver.runner?.queued ?? 0);
    const resolverStateLabels = {
      queued: () => tr('resolverQueued', 'Request wartet …'),
      'searching-youtube': () => tr('resolverYoutube', 'Suche auf YouTube …'),
      'searching-soundcloud': () => tr('resolverSoundCloud', 'Suche auf SoundCloud …'),
      validating: () => tr('resolverValidating', 'Treffer werden geprüft …'),
      ready: () => tr('resolverReady', 'Treffer bereit.'),
      failed: () => tr('resolverFailed', 'Suche fehlgeschlagen.')
    };
    const progressState = String(resolver.progress?.state || '').toLowerCase();
    const progressLabel = progressState
      ? (resolverStateLabels[progressState]?.() || tr('resolverUnknownState', 'Unbekannter Resolver-Status'))
      : '';
    const progress = progressLabel ? ` · ${progressLabel}` : '';
    healthResolver.textContent = tr('resolverActiveQueued', '{active} aktiv / {queued} wartend{progress}', {
      active, queued, progress
    });
    if (searchFeedback && progressState) {
      searchFeedback.textContent = progressLabel;
    }
  }

  function renderHealth(health = {}) {
    latestHealth = health;
    const runtime = health.runtime || latestRuntime || health;
    const slots = health.players || runtime?.slots || {};
    if (healthState) healthState.textContent = runtimeStateLabel(health.state || runtime?.transportState || (musicbotSafetyLocked ? 'locked' : 'idle'));
    if (healthPlayers) healthPlayers.textContent = `${slotLabel(slots.A)} / ${slotLabel(slots.B)}`;
    if (healthMpv) {
      const mpv = health.mpvAvailable === false
        ? tr('unavailable', 'nicht verfügbar')
        : (health.controllerHealthy === false ? tr('ipcDegraded', 'IPC gestört') : tr('ready', 'bereit'));
      healthMpv.textContent = mpv;
    }
    const slotEntries = Object.entries(slots).filter(([, slot]) => Boolean(slot));
    if (healthIpcLatency) {
      const latency = slotEntries
        .map(([name, slot]) => {
          const value = Number(slot?.ipc?.lastLatencyMs);
          return Number.isFinite(value) ? `${name}: ${Math.round(value)} ms` : null;
        })
        .filter(Boolean);
      healthIpcLatency.textContent = latency.join(' / ') || '–';
    }
    if (healthMediaTitle) {
      const titles = slotEntries
        .map(([name, slot]) => slot?.media?.title ? `${name}: ${slot.media.title}` : null)
        .filter(Boolean);
      healthMediaTitle.textContent = titles.join(' / ') || '–';
    }
    renderResolverHealth(health.resolver || latestResolver || {});
    if (healthCache) {
      const cache = health.cache || {};
      healthCache.textContent = `${formatBytes(cache.bytes)} / ${tr('files', '{count} Dateien', { count: Number(cache.files) || 0 })}`;
    }
    if (healthLastError) healthLastError.textContent = String(health.lastError?.message || health.lastError || tr('none', 'Keiner'));
    if (healthCheckedAt) {
      const checkedAt = Number(health.checkedAt || Date.now());
      healthCheckedAt.textContent = new Date(checkedAt).toLocaleTimeString();
    }
    if (typeof health.locked === 'boolean') renderSafetyState({ safetyLock: health.locked });
  }

  async function refreshDiagnostics() {
    setSafetyBusy(healthRefreshButton, true);
    const diagnostics = await get('/diagnostics');
    setSafetyBusy(healthRefreshButton, false);
    if (!diagnostics?.success) {
      showSafetyFeedback(diagnostics?.error || tr('healthLoadFailed', 'Health konnte nicht geladen werden.'), true);
      return null;
    }
    latestRuntime = diagnostics.runtime || null;
    latestResolver = diagnostics.resolver || null;
    renderSafetyState(diagnostics.runtime || {});
    renderHealth({ ...diagnostics.health, players: diagnostics.players, resolver: diagnostics.resolver });
    return diagnostics;
  }

  async function init() {
    const status = await get('/status');
    if (status?.success) {
      renderNowPlaying(status.nowPlaying);
      updateState(status.playbackState);
      if (typeof status.sourceVolume === 'number') {
        volumeInput.value = status.sourceVolume;
        volumeValue.textContent = status.sourceVolume;
      } else {
        volumeInput.value = status.volume;
        volumeValue.textContent = status.volume;
      }
      if (typeof status.masterVolume === 'number' && masterVolumeInput && masterVolumeValue) {
        masterVolumeInput.value = status.masterVolume;
        masterVolumeValue.textContent = status.masterVolume;
      }
      renderQueue([], status.queueLength);
      // Show currently playing video
      if (status.nowPlaying?.youtubeId) {
        setPreviewVideo(status.nowPlaying.youtubeId);
        if (searchInput) searchInput.value = status.nowPlaying.url || '';
      }
      renderOnboarding(status.onboarding || {}, currentSetupIssues);
      latestRuntime = status.runtime || null;
      activePlaybackId = status.runtime?.activePlaybackId || activePlaybackId;
      latestResolver = status.resolver || null;
      renderSafetyState(status.runtime || { safetyLock: status.health?.locked });
      renderHealth({ ...status.health, players: status.players, resolver: status.resolver });
      updateSeekControl();
    }
    const queueData = await get('/queue');
    if (queueData?.queue) {
      renderQueue(queueData.queue, queueData.queue.length);
    }
    await refreshHistory({ reset: true });

    const configData = await get('/config');
    const crossfadeMs = configData?.config?.playback?.crossfadeDuration;
    if (typeof crossfadeMs === 'number') {
      const seconds = Math.round(crossfadeMs / 1000);
      crossfadeInput.value = seconds;
      crossfadeValue.textContent = `${seconds}s`;
    }

    if (configData?.config?.queue?.duplicateDetection) {
      duplicateDetection.value = configData.config.queue.duplicateDetection;
    }
    if (configData?.config?.queue?.cooldownPerUserSeconds !== undefined) {
      cooldownSecondsInput.value = configData.config.queue.cooldownPerUserSeconds;
    }
    if (configData?.config?.queue?.maxSongDurationSeconds !== undefined && maxSongDurationInput) {
      maxSongDurationInput.value = clampSongDuration(configData.config.queue.maxSongDurationSeconds);
    }
    if (configData?.config?.queue?.cooldownBypassForGifts !== undefined) {
      cooldownBypassGifts.checked = Boolean(configData.config.queue.cooldownBypassForGifts);
    }
    if (Array.isArray(configData?.config?.giftIntegration?.skipImmunityGifts)) {
      skipImmunityGifts.value = configData.config.giftIntegration.skipImmunityGifts.join(', ');
    }
    if (configData?.config?.commandAliases) {
      aliasInputs.forEach((input) => {
        const list = configData.config.commandAliases[input.dataset.command] || [];
        input.value = list.join(', ');
      });
    }

    if (configData?.config?.autoDJ) {
      autoDjEnabled.checked = Boolean(configData.config.autoDJ.enabled);
      autoDjMode.value = configData.config.autoDJ.mode || 'history';
      autoDjHistoryPlays.value = configData.config.autoDJ.historyMinPlays || 1;
      autoDjMixHistoryPercent.value = configData.config.autoDJ.mixHistoryPercent ?? 80;
      autoDjRepeatCooldownHours.value = configData.config.autoDJ.repeatCooldownHours ?? 12;
      autoDjMaxConsecutive.value = configData.config.autoDJ.maxConsecutiveAutoDJ || 1;
      autoDjAnnounce.checked = Boolean(configData.config.autoDJ.announceAutoDJ);
      if (autoDjPlaylistUrls) {
        autoDjPlaylistUrls.value = (configData.config.autoDJ.playlistUrls || []).join('\n');
      }
    }

    if (configData?.config?.moderation) {
      rejectAge.checked = Boolean(configData.config.moderation.rejectAgeRestricted);
      rejectExplicit.checked = Boolean(configData.config.moderation.rejectExplicit);
      if (Array.isArray(configData.config.moderation.blockedKeywords)) {
        blockedKeywords.value = configData.config.moderation.blockedKeywords.join('\n');
      }
    }
    if (configData?.config?.resolver?.ytdlpPath) {
      ytdlpPathInput.value = configData.config.resolver.ytdlpPath;
    }
    if (configData?.config?.playback?.mpvPath && mpvPathInput) {
      mpvPathInput.value = configData.config.playback.mpvPath;
    }
    if (configData?.config?.playback?.normalization) {
      if (normalizationEnabled) normalizationEnabled.checked = Boolean(configData.config.playback.normalization.enabled);
      if (normalizationLufs) normalizationLufs.value = configData.config.playback.normalization.integratedLufs ?? -16;
    }
    if (configData?.config?.audio) {
      if (typeof configData.config.audio.masterVolume === 'number' && masterVolumeInput && masterVolumeValue) {
        masterVolumeInput.value = configData.config.audio.masterVolume;
        masterVolumeValue.textContent = configData.config.audio.masterVolume;
      }
      if (typeof configData.config.audio.sourceVolume === 'number') {
        volumeInput.value = configData.config.audio.sourceVolume;
        volumeValue.textContent = configData.config.audio.sourceVolume;
      }
    }
    if (configData?.config?.permissions?.requireSuperfanForRequest !== undefined && requireSuperfan) {
      requireSuperfan.checked = Boolean(configData.config.permissions.requireSuperfanForRequest);
    }
    if (configData?.config?.monetization) {
      payToPlayEnabled.checked = Boolean(configData.config.monetization.payToPlayEnabled);
      payToPlayGifts.value = (configData.config.monetization.payToPlayGiftCatalog || []).join(', ');
      payToPlayMinCoins.value = Number(configData.config.monetization.payToPlayMinCoins) || 0;
      payToSkipEnabled.checked = Boolean(configData.config.monetization.payToSkipEnabled);
      payToSkipGifts.value = (configData.config.monetization.payToSkipGiftCatalog || []).join(', ');
      likeGateEnabled.checked = Boolean(configData.config.monetization.likeGateEnabled);
      minLikesPerUser.value = Math.max(1, Number(configData.config.monetization.minLikesPerUser) || 1);
    }

    renderOnboarding(configData?.config?.onboarding || {}, currentSetupIssues);

    if (configData?.config?.overlay) {
      if (configData.config.overlay.design && overlayDesign) overlayDesign.value = configData.config.overlay.design;
      if (configData.config.overlay.theme && overlayTheme) overlayTheme.value = configData.config.overlay.theme;
      if (configData.config.overlay.position && overlayPosition) overlayPosition.value = configData.config.overlay.position;
    }
    refreshOverlayUrl();

    const setupStatus = await get('/setup-status');
    if (setupStatus?.issues) {
      applySetupStatus(setupStatus);
    }

    await refreshAutoDjStatus();
    await refreshRadioPreview();
    await refreshBans();
    await refreshGiftCatalog();
    await refreshPlaylists();
    await refreshStreamerPlaylistCuration();
  }

  function syncHistoryFilters() {
    const period = historyPeriod?.value || '';
    const now = Date.now();
    const periodMs = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 }[period] || 0;
    historyFilters.q = historySearch?.value?.trim() || '';
    historyFilters.outcome = historyOutcome?.value || '';
    historyFilters.feedback = historyFeedbackFilter?.value || '';
    historyFilters.banned = historyBanned?.value || '';
    historyFilters.sort = historySort?.value || 'finished_desc';
    historyFilters.from = periodMs ? new Date(now - periodMs).toISOString() : '';
    historyFilters.to = periodMs ? new Date(now).toISOString() : '';
  }

  function historyQueryString() {
    const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE), offset: String(historyOffset) });
    Object.entries(historyFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }

  function updateHistoryPagination(pageLength = latestHistoryTracks.length) {
    const start = historyTotal > 0 ? historyOffset + 1 : 0;
    const end = historyTotal > 0 ? Math.min(historyOffset + pageLength, historyTotal) : 0;
    if (historyPageStatus) {
      historyPageStatus.textContent = catalogTr('pageStatus', '{from}–{to} / {total}', {
        from: start, to: end, total: historyTotal
      });
    }
    if (historyPrevious) historyPrevious.disabled = historyOffset <= 0;
    if (historyNext) historyNext.disabled = historyOffset + pageLength >= historyTotal || pageLength === 0;
    if (historyLoadMore) historyLoadMore.disabled = true;
  }

  async function refreshHistory({ reset = false, offset = null } = {}) {
    if (Number.isInteger(offset) && offset >= 0) historyOffset = offset;
    else if (reset) historyOffset = 0;
    syncHistoryFilters();
    const requestGeneration = ++historyRequestGeneration;
    const historyData = await get(`/history?${historyQueryString()}`);
    if (requestGeneration !== historyRequestGeneration) return;
    const rows = historyData?.history || historyData?.items;
    if (!Array.isArray(rows)) {
      showToast('warn', tr('historyToastTitle', 'Verlauf'), tr('historyLoadFailed', 'History konnte nicht geladen werden.'));
      return;
    }
    historyTotal = Number(historyData.total) || rows.length;
    renderHistory(rows, { initializeCanonical: reset || historyOffset === 0 });
    updateHistoryPagination(rows.length);
  }

  async function get(path) {
    try {
      const res = await fetch(`/api/plugins/music-bot${path}`);
      return { ...(await res.json()), httpStatus: res.status };
    } catch (error) {
      showToast('error', catalogTr('networkTitle', 'Network'), catalogTr('getFailed', 'GET request failed.'));
      return null;
    }
  }

  async function post(path, body) {
    try {
      const res = await fetch(`/api/plugins/music-bot${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      return await res.json();
    } catch (error) {
      showToast('error', catalogTr('networkTitle', 'Network'), catalogTr('postFailed', 'POST request failed.'));
      return { success: false, networkError: true };
    }
  }

  async function del(path, body) {
    try {
      const res = await fetch(`/api/plugins/music-bot${path}`, {
        method: 'DELETE',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      return { ...(await res.json()), httpStatus: res.status };
    } catch (error) {
      showToast('error', catalogTr('networkTitle', 'Network'), catalogTr('deleteFailed', 'DELETE request failed.'));
      return null;
    }
  }

  function renderNowPlaying(track) {
    latestNowPlayingTrack = track || null;
    activePlaybackId = track?.playbackId || null;
    seekTransitioning = false;
    if (!skipInProgress) {
      setSkipLoading(false);
    }
    if (!track) {
      nowPlayingEl.classList.add('empty');
      nowPlayingEl.innerHTML = `<p>${escapeHtml(tr('nowPlayingEmpty', 'Aktuell läuft nichts.'))}</p>`;
      updateState('idle');
      stopProgressTimer();
      if (npProgressWrapper) npProgressWrapper.style.display = 'none';
      updateSeekControl();
      return;
    }
    nowPlayingEl.classList.remove('empty');
    const dur = formatDuration(track.duration);
    const banButton = track.id
      ? `<button class="btn danger small track-ban-trigger" type="button" data-track-ban-trigger data-track-id="${escapeHtml(track.id)}" aria-haspopup="dialog" aria-expanded="false">${escapeHtml(tr('banLabel', 'Sperren'))}</button>`
      : '';
    const artistRadioActive = Boolean(latestAutoDjStatus?.artistRadio?.active);
    const canStartSongRadio = Boolean(track.youtubeId || track.provider === 'youtube' || track.source === 'youtube'
      || String(track.url || '').includes('youtube.com') || String(track.url || '').includes('youtu.be'));
    const radioAction = artistRadioActive ? 'stop' : 'start';
    const radioLabel = artistRadioActive
      ? tr('songRadioStop', 'Song-Radio stoppen')
      : tr('songRadioStart', 'Song-Radio aus diesem Titel starten');
    const radioDisabled = !artistRadioActive && !canStartSongRadio;
    const nowPlayingActions = `
      <div class="now-playing-actions">
        <span class="now-playing-curation-hint">${escapeHtml(tr('streamerPlaylistOnly', 'Nur fuer Streamer Playlist'))}</span>
        <div class="now-playing-action-buttons" role="group" aria-label="${escapeHtml(tr('streamerPlaylistFeedbackAria', 'Streamer Playlist Bewertung und Song-Radio'))}">
          <button class="btn ghost small" type="button" data-streamer-playlist-feedback="up" aria-label="${escapeHtml(tr('streamerPlaylistUp', 'Fuer Streamer Playlist: gefaellt mir'))}">&#128077;</button>
          <button class="btn ghost small" type="button" data-streamer-playlist-feedback="down" aria-label="${escapeHtml(tr('streamerPlaylistDown', 'Nicht fuer Streamer Playlist'))}">&#128078;</button>
          <button class="btn ghost small" type="button" data-artist-radio-action="${radioAction}"${radioDisabled ? ' disabled' : ''}>${escapeHtml(radioDisabled ? tr('songRadioUnavailable', 'Song-Radio nur fuer YouTube-Titel') : radioLabel)}</button>
        </div>
        <span class="text-secondary now-playing-action-status" data-streamer-playlist-status aria-live="polite"></span>
      </div>`;
    nowPlayingEl.innerHTML = `
      <p class="title">🎵 ${escapeHtml(track.title)}</p>
      <p class="meta">${escapeHtml(track.artist || '')} • ${escapeHtml(tr('requestedBy', 'Angefragt von'))} <strong>${escapeHtml(track.requestedBy || tr('viewerFallback', 'Zuschauer'))}</strong>${dur !== '—' ? ' • ' + dur : ''}</p>
      ${nowPlayingActions}
      ${banButton}
    `;
    const actualState = track.state || 'playing';
    updateState(actualState);

    if (npProgressWrapper) {
      npProgressWrapper.style.display = 'block';
      progressDuration = Number(track.duration) || 0;
      progressCurrentPos = track.startedAt
        ? Math.max(0, Math.floor((Date.now() - track.startedAt) / 1000))
        : 0;
      lastConfirmedSeekPosition = progressCurrentPos;
      if (npDuration) npDuration.textContent = formatDuration(progressDuration);
      if (actualState !== 'paused') {
        startProgressTimer();
      }
      updateSeekControl();
    }
  }
  function setNowPlayingActionStatus(message) {
    const status = nowPlayingEl?.querySelector('[data-streamer-playlist-status]');
    if (status) status.textContent = message || '';
  }

  nowPlayingEl?.addEventListener('click', async (event) => {
    const feedbackButton = event.target.closest('[data-streamer-playlist-feedback]');
    if (feedbackButton) {
      if (feedbackButton.disabled) return;
      const direction = feedbackButton.dataset.streamerPlaylistFeedback;
      feedbackButton.disabled = true;
      setNowPlayingActionStatus(tr('streamerPlaylistSaving', 'Wird fuer die Streamer Playlist gespeichert ...'));
      const result = await post('/streamer-playlist/feedback', { direction });
      feedbackButton.disabled = false;
      if (!result?.success) {
        setNowPlayingActionStatus(result?.error || tr('streamerPlaylistFailed', 'Streamer-Playlist-Bewertung konnte nicht gespeichert werden.'));
        return;
      }
      const feedbackState = result.feedback?.state || direction;
      const message = feedbackState === 'neutral'
        ? tr('streamerPlaylistNeutral', 'Streamer-Playlist-Bewertung entfernt.')
        : tr('streamerPlaylistSaved', 'Streamer Playlist aktualisiert.');
      setNowPlayingActionStatus(message);
      showToast('success', tr('playerToastTitle', 'Player'), message);
      await Promise.all([refreshStreamerPlaylistCuration(), refreshPlaylists()]);
      return;
    }

    const radioButton = event.target.closest('[data-artist-radio-action]');
    if (!radioButton || radioButton.disabled) return;
    const action = radioButton.dataset.artistRadioAction;
    radioButton.disabled = true;
    const result = action === 'stop'
      ? await post('/artist-radio/stop')
      : await post('/artist-radio/start');
    radioButton.disabled = false;
    if (!result?.success) {
      setNowPlayingActionStatus(result?.error || tr('songRadioFailed', 'Song-Radio konnte nicht geaendert werden.'));
      return;
    }
    latestAutoDjStatus = result.status || latestAutoDjStatus;
    renderNowPlaying(latestNowPlayingTrack);
    const message = action === 'stop'
      ? tr('songRadioStopped', 'Song-Radio beendet.')
      : tr('songRadioStarted', 'Song-Radio aus diesem Titel gestartet.');
    setNowPlayingActionStatus(message);
    showToast('success', tr('playerToastTitle', 'Player'), message);
    await refreshRadioPreview();
  });


  async function patch(path, body) {
    return request(path, 'PATCH', body);
  }

  async function put(path, body) {
    return request(path, 'PUT', body);
  }

  async function request(path, method, body) {
    try {
      const res = await fetch(`/api/plugins/music-bot${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await res.json();
      return { ...payload, httpStatus: res.status };
    } catch (_error) {
      showToast('error', catalogTr('networkTitle', 'Network'), catalogTr('requestFailed', '{method} request failed.', { method }));
      return null;
    }
  }

  function renderQueue(queue = [], length = 0) {
    latestQueueTracks = Array.isArray(queue) ? queue.slice() : [];
    latestQueueLength = Number(length ?? queue.length) || 0;
    queueLengthEl.textContent = length ?? queue.length;
    if (heroQueueCount) heroQueueCount.textContent = length ?? queue.length;
    if (!queue || queue.length === 0) {
      queueListEl.classList.add('empty');
      queueListEl.innerHTML = `
        <div class="queue-empty-state">
          <img src="/plugins/music-bot/assets/soundbot.png" alt="" aria-hidden="true">
          <strong>${escapeHtml(tr('queueEmptyTitle', 'Die Warteschlange ist leer'))}</strong>
          <p>${escapeHtml(tr('queueEmptyHint', 'Sei die erste Person und fordere einen Song an.'))}</p>
        </div>
      `;
      return;
    }
    queueListEl.classList.remove('empty');
    queueListEl.innerHTML = queue
      .map((item, idx) => {
        const thumb = isValidYouTubeId(item.youtubeId)
          ? `<img src="https://i.ytimg.com/vi/${item.youtubeId}/default.jpg" class="queue-thumb" alt="">`
          : '<span class="queue-thumb-placeholder">🎵</span>';
        const dur = item.duration ? ` • ${formatDuration(item.duration)}` : '';
        const giftBadge = item.isGiftRequest ? ' <span class="gift-badge">🎁</span>' : '';
        const songId = escapeHtml(item.id || '');
        const previousSongId = escapeHtml(queue[idx - 1]?.id || '');
        const nextSongId = escapeHtml(queue[idx + 1]?.id || '');
        return `<div class="item queue-item" draggable="true" data-queue-index="${idx}" data-song-id="${songId}">
          <span class="queue-pos">#${idx + 1}</span>
          ${thumb}
          <div class="queue-info">
            <span class="queue-title"><strong>${escapeHtml(item.title)}</strong>${giftBadge}</span>
            <span class="queue-meta">${escapeHtml(item.requestedBy || tr('viewerFallback', 'Zuschauer'))}${dur}</span>
          </div>
          <div class="queue-actions">
            <button class="btn danger small track-ban-trigger" type="button" data-track-ban-trigger data-track-id="${songId}" aria-haspopup="dialog" aria-expanded="false" title="${escapeHtml(tr('banLabel', 'Sperren'))}" aria-label="${escapeHtml(tr('trackBanLabel', 'Track sperren'))}">!</button>
            <button class="btn primary small" data-playback-action data-queue-action="play" data-idx="${idx}" data-song-id="${songId}" title="${escapeHtml(tr('playNow', 'Jetzt spielen'))}" aria-label="${escapeHtml(tr('playNow', 'Jetzt spielen'))}" ${musicbotSafetyLocked ? 'disabled aria-disabled="true"' : ''}>▶</button>
            <button class="btn ghost small" data-queue-action="move-up" data-idx="${idx}" data-song-id="${songId}" data-target-song-id="${previousSongId}" title="${escapeHtml(tr('moveUp', 'Nach oben'))}" aria-label="${escapeHtml(tr('moveUp', 'Nach oben'))}" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn ghost small" data-queue-action="move-down" data-idx="${idx}" data-song-id="${songId}" data-target-song-id="${nextSongId}" title="${escapeHtml(tr('moveDown', 'Nach unten'))}" aria-label="${escapeHtml(tr('moveDown', 'Nach unten'))}" ${idx === queue.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn danger small" data-queue-action="remove" data-idx="${idx}" title="${escapeHtml(tr('remove', 'Entfernen'))}" aria-label="${escapeHtml(tr('remove', 'Entfernen'))}">✕</button>
          </div>
        </div>`;
      })
      .join('');
  }

  async function renderQueueFromServer() {
    const queueData = await get('/queue');
    if (queueData?.queue) {
      renderQueue(queueData.queue, queueData.queue.length);
    }
  }

  queueListEl?.addEventListener('click', async (event) => {
    if (event.target.closest('[data-track-ban-trigger]')) return;
    const btn = event.target.closest('[data-queue-action]');
    const item = event.target.closest('.queue-item');
    const action = btn?.dataset.queueAction || (item ? 'play' : null);
    const idx = Number(btn?.dataset.idx ?? item?.dataset.queueIndex);
    const songId = btn?.dataset.songId || item?.dataset.songId;
    if (!action || btn?.disabled || !Number.isFinite(idx)) return;
    if (action === 'play') {
      const result = await post(`/queue/${idx}/play`, { songId });
      if (result?.success && result.track) {
        renderNowPlaying(result.track);
        const selectedTitle = result.track.title || tr('selectedTitle', 'Ausgewählter Titel');
        if (result.alreadyPlaying) {
          showToast('info', tr('queueTitle', 'Queue'), tr('alreadyPlaying', 'Läuft bereits: {title}', { title: selectedTitle }));
        } else {
          showToast('success', tr('queueTitle', 'Queue'), tr('playingNow', 'Spielt jetzt: {title}', { title: selectedTitle }));
        }
      } else if (!result?.success) {
        showToast('warn', tr('queueTitle', 'Queue'), result?.error || tr('titleStartFailed', 'Titel konnte nicht gestartet werden.'));
      }
      await renderQueueFromServer();
      return;
    }
    if (action === 'move-up' || action === 'move-down') {
      const toIndex = action === 'move-up' ? idx - 1 : idx + 1;
      const result = await post('/queue/reorder', {
        fromIndex: idx,
        toIndex,
        sourceSongId: songId,
        targetSongId: btn.dataset.targetSongId
      });
      if (result?.success) {
        showToast('success', tr('queueTitle', 'Queue'), tr('orderUpdated', 'Reihenfolge aktualisiert.'));
      } else {
        showToast('warn', tr('queueTitle', 'Queue'), result?.error || tr('queueRefreshRetry', 'Queue wurde aktualisiert. Bitte versuche es erneut.'));
      }
      await renderQueueFromServer();
      return;
    }
    if (action === 'remove') {
      await del(`/queue/${idx}`);
      await renderQueueFromServer();
      showToast('info', tr('queueTitle', 'Queue'), tr('trackRemoved', 'Track wurde entfernt.'));
    }
  });

  queueListEl?.addEventListener('dragstart', (event) => {
    const item = event.target.closest('.queue-item');
    if (!item) return;
    draggedQueueIndex = Number(item.dataset.queueIndex);
    draggedQueueSongId = item.dataset.songId || null;
    item.classList.add('dragging');
  });

  queueListEl?.addEventListener('dragend', (event) => {
    const item = event.target.closest('.queue-item');
    if (item) item.classList.remove('dragging');
    queueListEl.querySelectorAll('.queue-item.drop-target').forEach((el) => el.classList.remove('drop-target'));
    draggedQueueIndex = null;
    draggedQueueSongId = null;
  });

  queueListEl?.addEventListener('dragover', (event) => {
    event.preventDefault();
    const item = event.target.closest('.queue-item');
    if (!item) return;
    queueListEl.querySelectorAll('.queue-item.drop-target').forEach((el) => el.classList.remove('drop-target'));
    item.classList.add('drop-target');
  });

  queueListEl?.addEventListener('drop', async (event) => {
    event.preventDefault();
    const item = event.target.closest('.queue-item');
    if (!item || draggedQueueIndex === null) return;
    const toIndex = Number(item.dataset.queueIndex);
    item.classList.remove('drop-target');
    if (!Number.isFinite(toIndex) || toIndex === draggedQueueIndex) return;
    const result = await post('/queue/reorder', {
      fromIndex: draggedQueueIndex,
      toIndex,
      sourceSongId: draggedQueueSongId,
      targetSongId: item.dataset.songId
    });
    await renderQueueFromServer();
    if (result?.success) {
      showToast('success', tr('queueTitle', 'Queue'), tr('trackMoved', 'Track #{from} wurde an Position #{to} verschoben.', {
        from: draggedQueueIndex + 1,
        to: toIndex + 1
      }));
    } else {
      showToast('warn', tr('queueTitle', 'Queue'), result?.error || tr('queueRefreshRetry', 'Queue wurde aktualisiert. Bitte versuche es erneut.'));
    }
  });

  function startProgressTimer() {
    stopProgressTimer();
    if (!progressDuration) return;
    progressTimer = setInterval(() => {
      if (seekPreviewActive) return;
      progressCurrentPos = Math.min(progressCurrentPos + 1, progressDuration);
      updateProgressBar();
    }, 1000);
    updateProgressBar();
  }

  function stopProgressTimer() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function updateProgressBar() {
    if (!npElapsed) return;
    npElapsed.textContent = formatDuration(progressCurrentPos);
    if (!seekPreviewActive && npSeekInput) npSeekInput.value = String(Math.min(progressCurrentPos, progressDuration || 0));
    if (npSeekInput) npSeekInput.setAttribute('aria-valuetext', catalogTr('seekAria', '{current} of {duration}', {
      current: formatDuration(progressCurrentPos), duration: formatDuration(progressDuration)
    }));
  }

  function isSeekAvailable() {
    const state = String(latestRuntime?.transportState || latestNowPlayingTrack?.state || '').toLowerCase();
    return Boolean(
      !musicbotSafetyLocked
      && !seekInFlight
      && !seekTransitioning
      && activePlaybackId
      && Number.isFinite(progressDuration) && progressDuration > 0
      && latestNowPlayingTrack?.seekable !== false
      && ['playing', 'paused'].includes(state)
    );
  }

  function updateSeekControl() {
    if (!npSeekInput) return;
    const enabled = isSeekAvailable();
    npSeekInput.max = String(Math.max(0, progressDuration || 0));
    npSeekInput.disabled = !enabled;
    npSeekInput.setAttribute('aria-disabled', String(!enabled));
    npSeekInput.title = enabled ? '' : tr('seekUnavailable', 'Diese Wiedergabe kann derzeit nicht gespult werden.');
    updateProgressBar();
  }

  async function confirmSeek() {
    if (!npSeekInput || !isSeekAvailable()) return;
    const playbackId = activePlaybackId;
    const positionSeconds = Math.max(0, Math.min(progressDuration, Number(npSeekInput.value) || 0));
    seekPreviewActive = false;
    seekInFlight = true;
    updateSeekControl();
    try {
      const result = await post('/seek', { playbackId, positionSeconds });
      if (activePlaybackId !== playbackId) return;
      if (!result?.success || (result.playbackId && result.playbackId !== playbackId)) {
        progressCurrentPos = lastConfirmedSeekPosition;
        updateProgressBar();
        if (!result?.networkError) showToast('warn', tr('playerToastTitle', 'Wiedergabe'), result?.error || tr('seekFailed', 'Position konnte nicht geändert werden.'));
        return;
      }
      lastConfirmedSeekPosition = Number(result.position ?? positionSeconds);
      progressCurrentPos = lastConfirmedSeekPosition;
      if (Number.isFinite(Number(result.duration))) progressDuration = Number(result.duration);
    } finally {
      seekInFlight = false;
      updateSeekControl();
    }
  }

  npSeekInput?.addEventListener('input', () => {
    if (!isSeekAvailable()) return;
    seekPreviewActive = true;
    progressCurrentPos = Number(npSeekInput.value) || 0;
    updateProgressBar();
  });
  npSeekInput?.addEventListener('change', confirmSeek);

  function showFeedback(el, message) {
    if (!el) return;
    el.textContent = message;
    setTimeout(() => { el.textContent = ''; }, 4000);
  }

  function renderToastRecord(record) {
    if (!record?.element) return;
    const payload = record.semanticPayload;
    const title = payload
      ? localizedProducerText(payload, 'title', record.title)
      : record.title;
    const message = payload
      ? localizedProducerText(payload, 'message', record.message)
      : record.message;
    record.element.className = `musicbot-toast ${record.type}`;
    record.element.innerHTML = `
      <div class="musicbot-toast-title">${escapeHtml(title || tr('toastDefaultTitle', 'Musik-Bot'))}</div>
      <div class="musicbot-toast-message">${escapeHtml(message || '')}</div>
    `;
  }

  function showToast(type = 'info', title = '', message = '', semanticPayload = null) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    const record = { type, title, message, semanticPayload, element: toast };
    renderToastRecord(record);
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
      const index = activeToastRecords.indexOf(record);
      if (index >= 0) activeToastRecords.splice(index, 1);
    }, 4500);
    activeToastRecords.push(record);
  }

  function updatePreviewFrame(song) {
    if (!previewFrame) return;
    if (!song) {
      clearPreview();
      return;
    }
    const embedUrl = buildEmbedUrl(song);
    if (embedUrl) {
      previewFrame.src = embedUrl;
      playerFrameBox?.classList.add('has-video');
    }
    previewSource.textContent = mediaSourceLabel(song.source);
  }

  function buildEmbedUrl(song) {
    if (!song) return '';
    if (isValidYouTubeId(song.youtubeId)) {
      return `https://www.youtube.com/embed/${song.youtubeId}`;
    }
    if (song.url && song.url.includes('youtube.com/watch')) {
      try {
        const url = new URL(song.url);
        const id = url.searchParams.get('v');
        if (isValidYouTubeId(id)) return `https://www.youtube.com/embed/${id}`;
      } catch (error) {
        return '';
      }
    }
    if (song.url && song.url.includes('youtu.be/')) {
      const id = song.url.split('youtu.be/')[1]?.split('?')[0];
      if (isValidYouTubeId(id)) return `https://www.youtube.com/embed/${id}`;
    }
    return '';
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function historyUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_error) {
      return '';
    }
  }

  function historyDateLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(window.i18n?.currentLocale || document.documentElement.lang || 'de', {
        dateStyle: 'short', timeStyle: 'short'
      }).format(date);
    } catch (_error) {
      return date.toLocaleString();
    }
  }

  function historyOutcomeLabel(outcome) {
    const labels = {
      completed: catalogTr('outcomeCompleted', 'Abgeschlossen'),
      skipped: catalogTr('outcomeSkipped', 'Übersprungen'),
      early_skip: catalogTr('outcomeEarlySkip', 'Früh übersprungen'),
      failed: catalogTr('outcomeFailed', 'Fehlgeschlagen')
    };
    return labels[String(outcome || '').toLowerCase()] || String(outcome || '');
  }

  function renderHistory(history = [], { initializeCanonical = false } = {}) {
    const rows = Array.isArray(history) ? history.slice() : [];
    latestHistoryTracks = rows;
    if (initializeCanonical) canonicalSongState.clear();
    rows.forEach((item) => {
      const songId = String(item.songId || item.id);
      if (!canonicalSongState.has(songId)) {
        canonicalSongState.set(songId, { feedback: item.feedback || 'neutral' });
      }
    });
    if (!latestHistoryTracks.length) {
      historyListEl.classList.add('empty');
      historyListEl.innerHTML = `<p>${escapeHtml(catalogTr('historyEmpty', 'No history yet.'))}</p>`;
      updateHistoryPagination(0);
      return;
    }
    historyListEl.classList.remove('empty');
    historyListEl.innerHTML = latestHistoryTracks
      .map((item) => {
        const songId = String(item.songId || item.id || '');
        const canonical = canonicalSongState.get(songId) || { feedback: 'neutral' };
        const eventId = String(item.id || '');
        const url = historyUrl(item.url);
        const durationSeconds = Number(item.playedSeconds ?? item.duration);
        const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? formatDuration(durationSeconds) : '';
        const date = historyDateLabel(item.finishedAt || item.startedAt);
        const artist = item.artist || item.channelName || item.provider || '';
        const thumb = isValidYouTubeId(item.youtubeId)
          ? `<img src="https://i.ytimg.com/vi/${escapeHtml(item.youtubeId)}/default.jpg" class="history-item-thumb" alt="">`
          : '<span class="history-item-thumb-placeholder" aria-hidden="true">&#9835;</span>';
        const banButton = eventId
          ? `<button class="btn danger small track-ban-trigger" type="button" data-track-ban-trigger data-track-id="${escapeHtml(songId)}" data-catalog-event-id="${escapeHtml(eventId)}" aria-haspopup="dialog" aria-expanded="false" aria-label="${escapeHtml(catalogTr('banTrack', 'Ban track'))}">!</button>`
          : '';
        const vote = (state, symbol, label) => `<button class="btn ghost small history-feedback ${canonical.feedback === state ? 'is-active' : ''}" type="button" data-history-feedback="${state}" data-song-id="${escapeHtml(songId)}" aria-pressed="${canonical.feedback === state}">${symbol}<span class="sr-only">${escapeHtml(label)}</span></button>`;
        const banBadge = item.banned ? `<span class="history-ban-badge" aria-label="${escapeHtml(catalogTr('historyBanned', 'Banned'))}">${escapeHtml(catalogTr('historyBanned', 'Banned'))}</span>` : '';
        const outcomeBadge = item.outcome ? `<span class="history-item-badge">${escapeHtml(historyOutcomeLabel(item.outcome))}</span>` : '';
        const copyButton = url
          ? `<button class="btn ghost small" type="button" data-history-copy="${escapeHtml(url)}" aria-label="${escapeHtml(catalogTr('copyLink', 'Link kopieren'))}">${escapeHtml(catalogTr('copyLink', 'Link kopieren'))}</button>`
          : '';
        const playlistButton = Number.isInteger(Number(songId)) && Number(songId) > 0
          ? `<button class="btn ghost small" type="button" data-history-playlist="${escapeHtml(songId)}" aria-label="${escapeHtml(catalogTr('addToPlaylist', 'Zur Playlist'))}">${escapeHtml(catalogTr('addToPlaylist', 'Zur Playlist'))}</button>`
          : '';
        const replayQueue = eventId
          ? `<button class="btn ghost small" type="button" data-history-replay="queue" data-history-event-id="${escapeHtml(eventId)}">${escapeHtml(catalogTr('replayQueue', 'In Queue'))}</button>`
          : '';
        const replayPlay = eventId
          ? `<button class="btn primary small" type="button" data-history-replay="play" data-history-event-id="${escapeHtml(eventId)}" ${musicbotSafetyLocked ? 'disabled aria-disabled="true"' : ''}>${escapeHtml(catalogTr('replayPlay', 'Jetzt spielen'))}</button>`
          : '';
        const upLabel = catalogTr('voteUp', 'Like');
        const downLabel = catalogTr('voteDown', 'Not for radio');
        const neutralLabel = catalogTr('voteNeutral', 'Neutral');
        const meta = [item.requestedBy || tr('viewerFallback', 'Zuschauer'), artist, date, duration]
          .filter(Boolean)
          .map((value) => `<span>${escapeHtml(value)}</span>`)
          .join('');
        return `<article class="item history-item" data-song-id="${escapeHtml(songId)}" data-history-event-id="${escapeHtml(eventId)}">
          ${thumb}
          <div class="history-item-main">
            <div class="history-item-heading">
              <strong class="history-item-title">${escapeHtml(item.title || 'Untitled')}</strong>
              <div class="history-item-badges">${outcomeBadge}${banBadge}</div>
            </div>
            <div class="history-item-meta">${meta}</div>
          </div>
          <div class="history-item-actions">
            ${replayQueue}${replayPlay}${copyButton}${playlistButton}
            ${vote('up', '↑', upLabel)}${vote('down', '↓', downLabel)}${vote('neutral', '•', neutralLabel)}${banButton}
          </div>
        </article>`;
      })
      .join('');
    updateHistoryPagination(latestHistoryTracks.length);
  }

  async function replayHistory(eventId, mode) {
    const result = await post(`/history/${encodeURIComponent(eventId)}/replay`, { mode });
    if (!result?.success) {
      showToast('warn', tr('historyToastTitle', 'Verlauf'), result?.error || catalogTr('actionFailed', 'Aktion konnte nicht ausgeführt werden.'));
      return;
    }
    const message = mode === 'play'
      ? catalogTr('playSuccess', 'Titel wird jetzt gespielt.')
      : catalogTr('queueSuccess', 'Titel zur Queue hinzugefügt.');
    showToast('success', tr('historyToastTitle', 'Verlauf'), message);
    await renderQueueFromServer();
    await refreshHistory({ reset: true });
  }

  async function copyHistoryLink(url) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url);
      showToast('success', tr('historyToastTitle', 'Verlauf'), catalogTr('copySuccess', 'Link kopiert.'));
    } catch (_error) {
      showToast('warn', tr('historyToastTitle', 'Verlauf'), catalogTr('actionFailed', 'Aktion konnte nicht ausgeführt werden.'));
    }
  }

  async function openHistoryPlaylistMenu(songId, trigger) {
    if (!historyPlaylistMenu) return;
    if (historyPlaylistMenu.dataset.songId === String(songId) && !historyPlaylistMenu.hidden) {
      historyPlaylistMenu.hidden = true;
      return;
    }
    if (!playlists.length) await refreshPlaylists();
    const available = playlists.filter((playlist) => !playlist.isProtected || playlist.id === 'streamer-playlist');
    historyPlaylistMenu.dataset.songId = String(songId);
    historyPlaylistMenu.innerHTML = available.length
      ? `<label class="history-playlist-picker"><span>${escapeHtml(catalogTr('playlistSelect', 'Playlist auswählen'))}</span><select data-history-playlist-select><option value="">${escapeHtml(catalogTr('playlistSelect', 'Playlist auswählen'))}</option>${available.map((playlist) => `<option value="${escapeHtml(playlist.id)}">${escapeHtml(playlist.name)}</option>`).join('')}</select></label>`
      : `<p class="text-secondary">${escapeHtml(catalogTr('playlistProtected', 'Keine bearbeitbare Playlist vorhanden.'))}</p>`;
    historyPlaylistMenu.hidden = false;
    historyPlaylistMenu.style.anchorName = trigger ? '--history-playlist-trigger' : '';
    historyPlaylistMenu.querySelector('select')?.focus();
  }

  async function addHistoryToPlaylist(playlistId, songId) {
    let playlist = playlists.find((candidate) => String(candidate.id) === String(playlistId));
    if (!playlist || !Number.isInteger(Number(playlist.revision))) {
      const result = await get(`/playlists/${encodeURIComponent(playlistId)}`);
      playlist = result?.playlist;
    }
    if (!playlist || (playlist.isProtected && playlist.id !== 'streamer-playlist')) return;
    const result = await post(`/playlists/${encodeURIComponent(playlist.id)}/items`, {
      songId: Number(songId), revision: playlist.revision
    });
    if (!result?.success) {
      showToast('warn', tr('historyToastTitle', 'Verlauf'), result?.error || catalogTr('actionFailed', 'Aktion konnte nicht ausgeführt werden.'));
      return;
    }
    showToast('success', tr('historyToastTitle', 'Verlauf'), catalogTr('playlistSuccess', 'Titel zur Playlist hinzugefügt.'));
    historyPlaylistMenu.hidden = true;
    await refreshPlaylists();
  }

  historyListEl?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-history-feedback]');
    if (button) {
      const songId = button.dataset.songId;
      const state = button.dataset.historyFeedback;
      const result = await post(`/catalog/songs/${songId}/feedback`, { state });
      if (!result?.success) {
        showToast('warn', tr('historyToastTitle', 'Verlauf'), result?.error || tr('historyFeedbackFailed', 'Bewertung konnte nicht gespeichert werden.'));
        return;
      }
      const previous = canonicalSongState.get(songId) || {};
      canonicalSongState.set(songId, { ...previous, feedback: result.feedback?.state || result.state || 'neutral' });
      renderHistory(latestHistoryTracks);
      return;
    }
    const replayButton = event.target.closest('[data-history-replay]');
    if (replayButton && !replayButton.disabled) {
      await replayHistory(replayButton.dataset.historyEventId, replayButton.dataset.historyReplay);
      return;
    }
    const copyButton = event.target.closest('[data-history-copy]');
    if (copyButton) {
      await copyHistoryLink(copyButton.dataset.historyCopy);
      return;
    }
    const playlistButton = event.target.closest('[data-history-playlist]');
    if (playlistButton) await openHistoryPlaylistMenu(playlistButton.dataset.historyPlaylist, playlistButton);
  });

  historyPlaylistMenu?.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-history-playlist-select]');
    if (!select?.value) return;
    await addHistoryToPlaylist(select.value, historyPlaylistMenu.dataset.songId);
  });

  const requestHistoryRefresh = () => refreshHistory({ reset: true });
  historySearch?.addEventListener('input', debounce(requestHistoryRefresh));
  [historyPeriod, historyOutcome, historyFeedbackFilter, historyBanned, historySort].forEach((control) => {
    control?.addEventListener('change', requestHistoryRefresh);
  });
  historyReset?.addEventListener('click', () => {
    if (historySearch) historySearch.value = '';
    [historyPeriod, historyOutcome, historyFeedbackFilter, historyBanned].forEach((control) => { if (control) control.value = ''; });
    if (historySort) historySort.value = 'finished_desc';
    requestHistoryRefresh();
  });
  historyPrevious?.addEventListener('click', () => refreshHistory({ offset: Math.max(0, historyOffset - HISTORY_PAGE_SIZE) }));
  historyNext?.addEventListener('click', () => refreshHistory({ offset: historyOffset + HISTORY_PAGE_SIZE }));

  async function searchCatalog(query = catalogSearchInput?.value || '') {
    if (!catalogSearchResults) return;
    if (!query.trim()) {
      catalogSearchResults.classList.add('empty');
      catalogSearchResults.textContent = '';
      return;
    }
    const result = await get(`/catalog/search?q=${encodeURIComponent(query)}`);
    const songs = result?.songs || [];
    catalogSearchResults.classList.toggle('empty', songs.length === 0);
    catalogSearchResults.innerHTML = songs.length
      ? songs.map((song) => {
        const genres = Array.isArray(song.genres) ? song.genres.join(', ') : '';
        return `<div class="item playlist-item"><span class="queue-title">${escapeHtml(song.title)}</span><label class="catalog-genre-editor"><span class="sr-only">${escapeHtml(catalogTr('genres', 'Genres'))}</span><input type="text" value="${escapeHtml(genres)}" placeholder="${escapeHtml(catalogTr('genrePlaceholder', 'e.g. rock, pop'))}" data-catalog-genre-input></label><button class="btn ghost small" type="button" data-catalog-save-genres="${escapeHtml(song.id)}">${escapeHtml(catalogTr('saveGenres', 'Save genres'))}</button><button class="btn ghost small" type="button" data-catalog-add-song="${escapeHtml(song.id)}">${escapeHtml(catalogTr('addToPlaylist', 'Add to playlist'))}</button></div>`;
      }).join('')
      : `<p>${escapeHtml(catalogTr('catalogEmpty', 'No titles found.'))}</p>`;
  }

  const debouncedCatalogSearch = debounce(() => searchCatalog());
  catalogSearchInput?.addEventListener('input', debouncedCatalogSearch);
  catalogSearchResults?.addEventListener('click', async (event) => {
    const genreButton = event.target.closest('[data-catalog-save-genres]');
    if (genreButton) {
      const input = genreButton.parentElement?.querySelector('[data-catalog-genre-input]');
      const result = await put(`/catalog/songs/${genreButton.dataset.catalogSaveGenres}/genres`, {
        genres: parseList(input?.value || '')
      });
      if (!result?.success) {
        showToast('warn', tr('autoDjToastTitle', 'Auto-DJ'), result?.error || catalogTr('genresSaveFailed', 'Genres could not be saved.'));
        return;
      }
      if (input) input.value = (result.genres || []).join(', ');
      showToast('success', tr('autoDjToastTitle', 'Auto-DJ'), catalogTr('genresSaved', 'Genres saved.'));
      await refreshRadioPreview();
      return;
    }
    const button = event.target.closest('[data-catalog-add-song]');
    if (!button || !selectedPlaylist) return;
    const result = await post(`/playlists/${selectedPlaylist.id}/items`, {
      songId: Number(button.dataset.catalogAddSong), revision: selectedPlaylist.revision
    });
    if (!result?.success) return handlePlaylistFailure(result);
    selectedPlaylist = result.playlist;
    renderPlaylistEditor();
    await refreshPlaylists();
  });

  async function refreshPlaylists({ keepSelection = true } = {}) {
    const result = await get('/playlists');
    if (!result?.success) return;
    playlists = result.playlists || [];
    if (keepSelection && selectedPlaylist) {
      const current = playlists.find((playlist) => playlist.id === selectedPlaylist.id);
      if (!current) selectedPlaylist = null;
    }
    renderPlaylistList();
    await refreshRadioSources();
  }

  function renderPlaylistList() {
    if (!playlistList) return;
    playlistList.classList.toggle('empty', playlists.length === 0);
    playlistList.innerHTML = playlists.length
      ? playlists.map((playlist) => `<button class="item playlist-item ${selectedPlaylist?.id === playlist.id ? 'active' : ''}" type="button" data-playlist-id="${escapeHtml(playlist.id)}"><span class="queue-title">${escapeHtml(playlist.name)}</span><span class="text-secondary">${escapeHtml(playlistModeLabel(playlist.mode))} · ${playlist.itemCount || 0}${playlist.isProtected ? ` · ${escapeHtml(catalogTr('protected', 'protected'))}` : ''}</span></button>`).join('')
      : `<p>${escapeHtml(catalogTr('playlistEmpty', 'No playlists yet.'))}</p>`;
  }

  async function selectPlaylist(playlistId) {
    const result = await get(`/playlists/${playlistId}`);
    if (!result?.success) return;
    selectedPlaylist = result.playlist;
    renderPlaylistList();
    renderPlaylistEditor();
  }

  function renderPlaylistEditor() {
    if (!playlistEditor) return;
    const playlist = selectedPlaylist;
    playlistEditor.hidden = !playlist;
    if (!playlist) return;
    const protectedPlaylist = Boolean(playlist.isProtected);
    playlistNameInput.value = playlist.name || '';
    playlistNameInput.disabled = protectedPlaylist;
    playlistModeInput.value = playlist.mode || 'ordered';
    playlistSaveButton.disabled = false;
    playlistDeleteButton.disabled = protectedPlaylist;
    playlistDeleteButton.hidden = protectedPlaylist;
    playlistItems.innerHTML = (playlist.items || []).map((item) => `<div class="item playlist-item" draggable="true" data-playlist-song-id="${escapeHtml(item.songId)}"><span class="queue-pos">☰</span><span class="queue-title">${escapeHtml(item.title)}</span><button class="btn danger small" type="button" data-playlist-remove-song="${escapeHtml(item.songId)}" aria-label="${escapeHtml(catalogTr('remove', 'Remove'))}">×</button></div>`).join('') || `<p>${escapeHtml(catalogTr('playlistItemsEmpty', 'No titles in this playlist.'))}</p>`;
  }

  async function handlePlaylistFailure(result) {
    if (result?.httpStatus === 409 || result?.code === 'PLAYLIST_REVISION_CONFLICT') {
      if (playlistConflictFeedback) playlistConflictFeedback.textContent = tr('playlistConflict', 'Playlist wurde anderswo geändert. Ansicht wird aktualisiert.');
      if (selectedPlaylist) await selectPlaylist(selectedPlaylist.id);
      await refreshPlaylists();
      return;
    }
    if (playlistConflictFeedback) playlistConflictFeedback.textContent = result?.error || tr('playlistSaveFailed', 'Playlist konnte nicht gespeichert werden.');
  }

  playlistCreateButton?.addEventListener('click', async () => {
    const name = playlistCreateName?.value?.trim();
    if (!name) return;
    const result = await post('/playlists', { name, mode: playlistCreateMode?.value || 'ordered' });
    if (!result?.success) return handlePlaylistFailure(result);
    playlistCreateName.value = '';
    await refreshPlaylists({ keepSelection: false });
    await selectPlaylist(result.playlist.id);
  });
  playlistList?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-playlist-id]');
    if (button) selectPlaylist(button.dataset.playlistId);
  });
  playlistSaveButton?.addEventListener('click', async () => {
    if (!selectedPlaylist) return;
    const changes = { mode: playlistModeInput.value, revision: selectedPlaylist.revision };
    if (!selectedPlaylist.isProtected) changes.name = playlistNameInput.value;
    const result = await patch(`/playlists/${selectedPlaylist.id}`, changes);
    if (!result?.success) return handlePlaylistFailure(result);
    selectedPlaylist = result.playlist;
    renderPlaylistEditor();
    await refreshPlaylists();
  });
  playlistDeleteButton?.addEventListener('click', async () => {
    if (!selectedPlaylist || selectedPlaylist.isProtected) return;
    const result = await del(`/playlists/${selectedPlaylist.id}`, { revision: selectedPlaylist.revision });
    if (!result?.success) return handlePlaylistFailure(result);
    selectedPlaylist = null;
    renderPlaylistEditor();
    await refreshPlaylists({ keepSelection: false });
  });
  playlistItems?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-playlist-remove-song]');
    if (!button || !selectedPlaylist) return;
    const result = await del(`/playlists/${selectedPlaylist.id}/items/${button.dataset.playlistRemoveSong}`, { revision: selectedPlaylist.revision });
    if (!result?.success) return handlePlaylistFailure(result);
    selectedPlaylist = result.playlist;
    renderPlaylistEditor();
    await refreshPlaylists();
  });
  playlistItems?.addEventListener('dragstart', (event) => { playlistDragSongId = event.target.closest('[data-playlist-song-id]')?.dataset.playlistSongId || null; });
  playlistItems?.addEventListener('dragover', (event) => event.preventDefault());
  playlistItems?.addEventListener('drop', async (event) => {
    event.preventDefault();
    const target = event.target.closest('[data-playlist-song-id]');
    if (!target || !selectedPlaylist || !playlistDragSongId || playlistDragSongId === target.dataset.playlistSongId) return;
    const songIds = selectedPlaylist.items.map((item) => String(item.songId));
    const from = songIds.indexOf(playlistDragSongId);
    const to = songIds.indexOf(target.dataset.playlistSongId);
    songIds.splice(to, 0, songIds.splice(from, 1)[0]);
    const result = await put(`/playlists/${selectedPlaylist.id}/items`, { songIds, revision: selectedPlaylist.revision });
    playlistDragSongId = null;
    if (!result?.success) return handlePlaylistFailure(result);
    selectedPlaylist = result.playlist;
    renderPlaylistEditor();
    await refreshPlaylists();
  });
  playlistImportButton?.addEventListener('click', async () => {
    if (!selectedPlaylist || !playlistImportUrl?.value?.trim()) return;
    const result = await post('/playlist-imports', { playlistId: selectedPlaylist.id, url: playlistImportUrl.value.trim() });
    if (!result?.success) return handlePlaylistFailure(result);
    if (playlistImportProgress) playlistImportProgress.textContent = tr('importRunning', 'Import läuft …');
  });

  async function refreshRadioSources() {
    const result = await get('/radio/playlist-sources');
    if (!result?.success || !playlistRadioSources) return;
    latestRadioSources = Array.isArray(result.sources) ? result.sources.slice() : [];
    renderRadioSources(latestRadioSources);
  }

  function renderRadioSources(sources = []) {
    if (!playlistRadioSources) return;
    playlistRadioSources.innerHTML = sources.map((source) => `<label class="playlist-source"><input type="checkbox" data-radio-playlist-id="${escapeHtml(source.playlistId)}" ${source.enabled ? 'checked' : ''}><span>${escapeHtml(source.name || source.playlistId)}</span><input type="number" min="1" max="10" step="1" value="${Math.max(1, Math.min(10, Math.round(Number(source.weight) || 1)))}" data-radio-weight="${escapeHtml(source.playlistId)}" aria-label="${escapeHtml(catalogTr('radioWeight', 'Weight'))}"></label>`).join('');
  }
  playlistRadioSave?.addEventListener('click', async () => {
    const sources = Array.from(playlistRadioSources?.querySelectorAll('[data-radio-playlist-id]') || []).map((checkbox) => ({
      playlistId: checkbox.dataset.radioPlaylistId,
      enabled: checkbox.checked,
      weight: Math.max(1, Math.min(10, Math.round(Number(Array.from(playlistRadioSources.querySelectorAll('[data-radio-weight]')).find((input) => input.dataset.radioWeight === checkbox.dataset.radioPlaylistId)?.value) || 1)))
    }));
    const result = await put('/radio/playlist-sources', { sources });
    if (!result?.success) return handlePlaylistFailure(result);
    await refreshRadioSources();
  });

  function updateState(state) {
    stateEl.textContent = runtimeStateLabel(state);
  }

  function setSkipLoading(active, message) {
    if (skipButton) {
      skipButton.disabled = Boolean(active);
      skipButton.setAttribute('aria-busy', String(Boolean(active)));
      skipButton.textContent = active ? tr('loading', 'Lädt …') : tr('skip', 'Überspringen');
    }
    if (active) {
      stateEl.textContent = message || runtimeStateLabel('loading');
    }
  }

  async function refreshAutoDjStatus() {
    const statusRes = await get('/auto-dj/status');
    const status = statusRes?.status;
    if (!status) return;
    latestAutoDjStatus = status;
    renderAutoDjStatus(status);
    await refreshRadioPreview();
  }

  function renderAutoDjStatus(status = {}) {
    autoDjEnabled.checked = Boolean(status.enabled);
    autoDjMode.value = status.mode || 'history';
    autoDjHistoryPlays.value = status.historyMinPlays || 1;
    autoDjMixHistoryPercent.value = status.mixHistoryPercent ?? 80;
    autoDjRepeatCooldownHours.value = status.repeatCooldownHours ?? 12;
    if (document.activeElement !== autoDjMaxConsecutive) {
      autoDjMaxConsecutive.value = status.maxConsecutiveAutoDJ || 1;
    }
    autoDjAnnounce.checked = Boolean(status.announceAutoDJ);
    if (autoDjPlaylistUrls) autoDjPlaylistUrls.value = (status.playlistUrls || []).join('\n');
    if (autoDjGenreFilter) autoDjGenreFilter.checked = Boolean(status.genreFilterEnabled);
    if (autoDjGenres) {
      const selectedGenres = new Set(status.selectedGenres || []);
      Array.from(autoDjGenres.options).forEach((option) => { option.selected = selectedGenres.has(option.value); });
    }
    if (autoDjBpmTransitions) autoDjBpmTransitions.checked = Boolean(status.bpmTransitionsEnabled);
    if (autoDjArtistSpacing) autoDjArtistSpacing.value = status.artistSpacingMinutes ?? 90;
    if (autoDjAlbumSpacing) autoDjAlbumSpacing.value = status.albumSpacingMinutes ?? 360;
    if (autoDjNoveltyBudget) autoDjNoveltyBudget.value = status.noveltyBudgetPercent ?? 20;
    if (autoDjRequestSeeds) autoDjRequestSeeds.checked = Boolean(status.requestSeedsEnabled);
    if (autoDjLiveFeedback) autoDjLiveFeedback.checked = Boolean(status.liveFeedbackEnabled);
    if (autoDjPreviewEnabled) autoDjPreviewEnabled.checked = Boolean(status.previewEnabled);
    if (autoDjChatVoting) autoDjChatVoting.checked = Boolean(status.chatVotingEnabled);
    if (autoDjVoteCloseBefore) autoDjVoteCloseBefore.value = status.chatVoteCloseBeforeEndSeconds ?? 20;
    const legacyAutoDjTitle = String(status.lastResult?.message || '').split(':').slice(1).join(':').trim();
    const autoDjMessage = status.lastResult?.state === 'selected'
      ? tr('autoDjSelected', 'Ausgewählt: {title}', { title: status.lastResult?.params?.title || legacyAutoDjTitle })
      : '';
    autoDjStatus.textContent = status.enabled
      ? (status.lastResult?.state === 'limit-reached'
        ? tr('autoDjLimitReached', 'Limit erreicht')
        : (status.lastResult?.state === 'playing' ? tr('autoDjPlaying', 'Spielt') : tr('autoDjActive', 'Aktiv')))
      : tr('autoDjDisabled', 'Deaktiviert');
    autoDjStatus.title = autoDjMessage;
    if (autoDjDetail) {
      const diagnostics = [];
      if (typeof status.consecutiveCount === 'number' && typeof status.maxConsecutiveAutoDJ === 'number') {
        diagnostics.push(tr('consecutiveProgress', 'Auto-DJ-Folge: {current}/{limit}', {
          current: status.consecutiveCount,
          limit: status.maxConsecutiveAutoDJ
        }));
      }
      if (status.selectionSource) diagnostics.push(tr('autoDjSource', 'Quelle: {source}', { source: autoDjSourceLabel(status.selectionSource) }));
      if (typeof status.blockedCount === 'number') diagnostics.push(tr('autoDjBlocked', 'Gesperrt: {count}', { count: status.blockedCount }));
      if (status.requestSeedRemaining) diagnostics.push(`Request-Seed: ${status.requestSeedRemaining} Titel`);
      autoDjDetail.textContent = [autoDjMessage, diagnostics.join(' · ')].filter(Boolean).join(' · ');
    }
    if (heroAutodjStatus) heroAutodjStatus.textContent = status.enabled ? tr('autoDjOn', 'Ein') : tr('autoDjOff', 'Aus');
  }

  async function refreshRadioPreview() {
    if (!radioPreviewList) return;
    const result = await get('/radio/plan');
    renderRadioPreview(result?.plan || [], Boolean(result?.disabled));
  }

  function renderRadioPreview(candidates = [], disabled = false) {
    if (!radioPreviewList) return;
    if (radioPreviewStatus) {
      radioPreviewStatus.textContent = disabled
        ? tr('radioPreviewDisabled', 'Vorschau deaktiviert')
        : (candidates.length
          ? tr('radioPlanCount', '{count} geplante Titel', { count: candidates.length })
          : tr('radioNoCandidates', 'Keine passenden Kandidaten'));
    }
    if (disabled) {
      radioPreviewList.innerHTML = `<p class="text-secondary">${escapeHtml(tr('radioPreviewDisabledHint', 'Aktiviere die Vorschau, um die nächsten Radio-Kandidaten mit ihren Gründen zu sehen.'))}</p>`;
      return;
    }
    if (!candidates.length) {
      radioPreviewList.innerHTML = `<p class="text-secondary">${escapeHtml(tr('radioPreviewEmptyHint', 'Noch keine Kandidaten verfügbar. Prüfe Radio-Quellen oder die gewählten Genres.'))}</p>`;
      return;
    }
    radioPreviewList.innerHTML = candidates.map((candidate, index) => {
      const title = escapeHtml(candidate.title || tr('radioUnknownTitle', 'Unbekannter Titel'));
      const artist = escapeHtml(candidate.artist || '');
      const details = [candidate.album, candidate.bpm ? `${Math.round(candidate.bpm)} BPM` : null]
        .filter(Boolean).map(escapeHtml).join(' · ');
      const reasons = (candidate.reasons || []).map((reason) => escapeHtml(reason.text || reason.code)).join(' · ');
      const score = escapeHtml(tr('radioScore', 'Score {score}', { score: Number(candidate.score || 0).toFixed(2) }));
      const fallbackReason = escapeHtml(tr('radioScoreReason', 'Radio-Score'));
      return `<article class="radio-preview-item"><div><strong>${candidate.position || index + 1}. ${title}</strong><span>${artist}</span><span class="text-secondary">${details}</span></div><span class="pill">${score}</span><div class="radio-preview-reasons">${reasons || fallbackReason}</div></article>`;
    }).join('');
  }
  async function refreshStreamerPlaylistCuration() {
    if (!streamerPlaylistCuration) return;
    const result = await get('/streamer-playlist');
    if (!result?.success) {
      if (streamerPlaylistSummary) streamerPlaylistSummary.textContent = result?.error || '';
      return;
    }
    renderStreamerPlaylistCuration(result.playlist || {}, result.suggestions || []);
  }

  function renderStreamerPlaylistCuration(playlist = {}, suggestions = []) {
    if (streamerPlaylistSummary) {
      const count = Number(playlist.itemCount ?? playlist.items?.length ?? 0);
      streamerPlaylistSummary.textContent = tr('streamerPlaylistCount', '{count} kuratierte Titel', { count });
    }
    if (!streamerPlaylistSuggestions) return;
    const pending = suggestions.filter((suggestion) => suggestion?.songId !== undefined && suggestion?.songId !== null);
    if (!pending.length) {
      streamerPlaylistSuggestions.innerHTML = `<p class="text-secondary">${escapeHtml(tr('streamerPlaylistEmpty', 'Noch keine offenen Vorschlaege.'))}</p>`;
      return;
    }
    streamerPlaylistSuggestions.innerHTML = pending.map((suggestion) => {
      const songId = Number(suggestion.songId);
      if (!Number.isInteger(songId)) return '';
      const title = escapeHtml(suggestion.title || tr('radioUnknownTitle', 'Unbekannter Titel'));
      const artist = escapeHtml(suggestion.artist || '');
      return `<article class="streamer-playlist-suggestion"><div><strong>${title}</strong><span class="text-secondary">${artist}</span></div><div class="streamer-suggestion-actions"><button class="btn ghost small" type="button" data-streamer-suggestion-action="accept" data-streamer-suggestion-song-id="${songId}">${escapeHtml(tr('streamerSuggestionAccept', 'Uebernehmen'))}</button><button class="btn ghost small" type="button" data-streamer-suggestion-action="reject" data-streamer-suggestion-song-id="${songId}">${escapeHtml(tr('streamerSuggestionReject', 'Ablehnen'))}</button></div></article>`;
    }).join('');
  }

  streamerPlaylistSuggestions?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-streamer-suggestion-action]');
    if (!button || button.disabled) return;
    const songId = Number(button.dataset.streamerSuggestionSongId);
    const action = button.dataset.streamerSuggestionAction;
    if (!Number.isInteger(songId) || !['accept', 'reject'].includes(action)) return;
    button.disabled = true;
    if (streamerPlaylistSummary) streamerPlaylistSummary.textContent = tr('streamerSuggestionSaving', 'Vorschlag wird gespeichert ...');
    const result = await post(`/streamer-playlist/suggestions/${songId}`, { action });
    button.disabled = false;
    if (!result?.success) {
      if (streamerPlaylistSummary) streamerPlaylistSummary.textContent = result?.error || tr('streamerSuggestionFailed', 'Vorschlag konnte nicht aktualisiert werden.');
      return;
    }
    const message = action === 'accept'
      ? tr('streamerSuggestionAccepted', 'Vorschlag zur Streamer Playlist hinzugefuegt.')
      : tr('streamerSuggestionRejected', 'Vorschlag abgelehnt.');
    showToast('success', tr('playerToastTitle', 'Player'), message);
    await Promise.all([refreshStreamerPlaylistCuration(), refreshPlaylists()]);
  });


  async function sendLiveRadioFeedback(direction) {
    if (radioFeedbackStatus) radioFeedbackStatus.textContent = tr('radioFeedbackSaving', 'Wird gespeichert …');
    const result = await post('/radio/live-feedback', { direction });
    if (!result?.success) {
      if (radioFeedbackStatus) radioFeedbackStatus.textContent = result?.error || tr('radioFeedbackFailed', 'Feedback konnte nicht gespeichert werden.');
      return;
    }
    if (radioFeedbackStatus) radioFeedbackStatus.textContent = direction === 'more'
      ? tr('radioFeedbackMoreSaved', 'Mehr davon gespeichert.')
      : tr('radioFeedbackLessSaved', 'Weniger davon gespeichert.');
    await refreshRadioPreview();
  }

  function parseList(value = '', keepNewLinesOnly = false) {
    const splitter = keepNewLinesOnly ? /\n/ : /[,\n]/;
    return value
      .split(splitter)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeGiftCatalogEntry(gift = {}) {
    const name = String(gift.name || gift.giftName || gift.gift_name || '').trim();
    if (!name) return null;

    return {
      name,
      diamond_count: Number(gift.diamond_count || gift.diamondCount || gift.diamond) || 0
    };
  }

  function extractGiftCatalogFromResponse(payload = {}) {
    const collected = [];
    const seen = new Set();

    const addEntries = (entries) => {
      if (!Array.isArray(entries)) return;
      entries.forEach((gift) => {
        const normalized = normalizeGiftCatalogEntry(gift);
        if (!normalized || seen.has(normalized.name)) return;
        seen.add(normalized.name);
        collected.push(normalized);
      });
    };

    addEntries(payload.catalog);

    if (payload.catalogsByLocale && typeof payload.catalogsByLocale === 'object') {
      Object.values(payload.catalogsByLocale).forEach(addEntries);
    }

    if (!collected.length) {
      addEntries(payload?.data?.catalog);
    }

    if (!collected.length && Array.isArray(payload)) {
      addEntries(payload);
    }

    return collected;
  }

  function getGiftCatalogMeta(payload = {}, catalog = []) {
    const locales = Array.isArray(payload.locales) ? payload.locales.filter(Boolean) : [];
    const lastUpdate = payload.lastUpdate || null;
    const region = payload.region || null;
    const count = Number(payload.count ?? payload.countByLocale ?? catalog.length) || catalog.length;

    return {
      locales,
      lastUpdate,
      region,
      count
    };
  }

  function formatGiftCatalogStatus() {
    const uniqueCount = giftCatalogEntries.length;
    const apiCount = giftCatalogMeta.count || uniqueCount;
    const visible = giftCatalogFilter
      ? giftCatalogEntries.filter((gift) => gift.name.toLowerCase().includes(giftCatalogFilter.toLowerCase())).length
      : uniqueCount;
    const localeText = giftCatalogMeta.locales.length
      ? tr('giftLocales', 'Katalogsprachen: {locales}', { locales: giftCatalogMeta.locales.join(', ') })
      : tr('giftLocalesDefault', 'Katalogsprache: automatisch');
    const regionText = giftCatalogMeta.region
      ? tr('giftRegion', 'Region: {region}', { region: giftCatalogMeta.region })
      : null;
    const updatedText = giftCatalogMeta.lastUpdate
      ? tr('giftUpdatedAt', 'Aktualisiert: {date}', { date: new Date(giftCatalogMeta.lastUpdate).toLocaleString() })
      : null;
    const countText = apiCount !== uniqueCount
      ? tr('giftLoadedApi', '{count} Gifts geladen ({apiCount} API-Einträge)', { count: uniqueCount, apiCount })
      : tr('giftLoaded', '{count} Gifts geladen', { count: uniqueCount });

    return [
      tr('giftVisible', '{visible}/{total} Gifts sichtbar', { visible, total: uniqueCount }),
      countText,
      localeText,
      regionText,
      updatedText
    ].filter(Boolean).join(' · ');
  }

  function renderGiftCatalogList() {
    if (!giftCatalogList) return;

    const filter = giftCatalogFilter.trim().toLowerCase();
    const visibleCatalog = filter
      ? giftCatalogEntries.filter((gift) => gift.name.toLowerCase().includes(filter))
      : giftCatalogEntries;

    giftCatalogList.innerHTML = visibleCatalog.length
      ? visibleCatalog
        .map((gift) => `<option value="${escapeHtml(gift.name)}">${escapeHtml(gift.name)} (${gift.diamond_count}💎)</option>`)
        .join('')
      : `<option value="" disabled>${escapeHtml(tr('giftNoResults', 'Keine Gifts gefunden'))}</option>`;

    Array.from(giftCatalogList.options).forEach((option) => {
      option.selected = giftCatalogSelectedValues.has(option.value);
    });

    if (giftCatalogCount) {
      giftCatalogCount.textContent = tr('giftsCount', '{count} Gifts', { count: giftCatalogEntries.length });
    }

    if (giftCatalogStatus) {
      giftCatalogStatus.textContent = formatGiftCatalogStatus();
    }
  }

  function collectGiftCatalogSelection() {
    return Array.from(giftCatalogSelectedValues);
  }

  async function applyGiftCatalogSelection(targetField, configBody, label) {
    if (!targetField) return;

    const selected = collectGiftCatalogSelection();
    if (!selected.length) {
      if (giftCatalogStatus) {
        giftCatalogStatus.textContent = tr('giftSelectFirst', 'Bitte zuerst Gifts auswählen.');
      }
      return;
    }

    const existing = parseList(targetField.value);
    targetField.value = Array.from(new Set([...existing, ...selected])).join(', ');

    const response = await post('/config', configBody);
    if (response?.success === false) {
      if (giftCatalogStatus) {
        giftCatalogStatus.textContent = tr('giftSaveFailed', '{label} konnte nicht gespeichert werden.', { label });
      }
      return;
    }

    if (giftCatalogStatus) {
      giftCatalogStatus.textContent = tr('giftApplied', '{count} Gifts in {label} übernommen.', {
        count: selected.length,
        label
      });
    }
    if (typeof showToast === 'function') {
      showToast('success', tr('giftCatalogTitle', 'Geschenkekatalog'), tr('giftUpdated', '{label} aktualisiert.', { label }));
    }
  }

  async function refreshGiftCatalog() {
    if (!giftCatalogList) return;
    try {
      if (giftCatalogStatus) {
        giftCatalogStatus.textContent = tr('giftLoading', 'Geschenkekatalog wird geladen…');
      }

      const res = await fetch('/api/gift-catalog');
      const data = await res.json();
      const previousSelection = new Set(giftCatalogSelectedValues);

      giftCatalogEntries = extractGiftCatalogFromResponse(data);
      giftCatalogMeta = getGiftCatalogMeta(data, giftCatalogEntries);
      giftCatalogSelectedValues = new Set(
        giftCatalogEntries
          .filter((gift) => previousSelection.has(gift.name))
          .map((gift) => gift.name)
      );

      renderGiftCatalogList();
    } catch (_) {
      giftCatalogEntries = [];
      giftCatalogMeta = {
        locales: [],
        region: null,
        lastUpdate: null,
        count: 0
      };
      giftCatalogSelectedValues = new Set();
      if (giftCatalogList) {
        giftCatalogList.innerHTML = '';
      }
      if (giftCatalogStatus) {
        giftCatalogStatus.textContent = tr('giftLoadFailed', 'Geschenkekatalog konnte nicht geladen werden.');
      }
      if (giftCatalogCount) {
        giftCatalogCount.textContent = tr('giftsCount', '{count} Gifts', { count: 0 });
      }
    }
  }

  function clampSongDuration(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_SONG_DURATION_LIMIT_SECONDS;
    return Math.min(
      MAX_SONG_DURATION_LIMIT_SECONDS,
      Math.max(MIN_SONG_DURATION_LIMIT_SECONDS, Math.round(numeric))
    );
  }

  async function refreshBans() {
    const res = await get('/bans');
    if (res?.bans) {
      renderBans(res.bans);
    }
  }

  async function refreshGiftCatalogLegacyUnused() {
    if (!giftCatalogList) return;
    try {
      const res = await fetch('/api/gift-catalog-manager/catalog');
      const data = await res.json();
      const gifts = extractGiftCatalogFromResponse(data).map((gift) => ({
        name: getGiftName(gift),
        diamond_count: Number(gift.diamond_count || gift.diamondCount || gift.diamond) || 0
      }));
      giftCatalogList.innerHTML = gifts
        .slice(0, 200)
        .map((gift) => `<option value="${escapeHtml(gift.name)}">${escapeHtml(gift.name)} (${Number(gift.diamond_count) || 0}💎)</option>`)
        .join('');
    } catch (_) {
      giftCatalogList.innerHTML = '';
    }
  }

  function renderBans(bans = []) {
    if (!banTable) return;
    const tbody = banTable.querySelector('tbody');
    if (!tbody) return;
    if (!bans.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-secondary">${escapeHtml(tr('noEntries', 'Keine Einträge.'))}</td></tr>`;
      return;
    }
    tbody.innerHTML = bans
      .map(
        (ban) => `
        <tr>
          <td>${escapeHtml(banTypeLabel(ban.type))}</td>
          <td>${escapeHtml(ban.value)}</td>
          <td>${escapeHtml(ban.reason || '')}</td>
          <td><button class="btn ghost small" data-ban-id="${escapeHtml(ban.id)}">${escapeHtml(tr('delete', 'Löschen'))}</button></td>
        </tr>`
      )
      .join('');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showBanFeedback(message, isError = false) {
    if (!banFeedback) return;
    banFeedback.textContent = message;
    banFeedback.style.color = isError ? '#ef4444' : 'var(--color-text-secondary)';
  }

  function captureLocalizedTransientState() {
    const radioSources = Object.fromEntries(Array.from(
      playlistRadioSources?.querySelectorAll('[data-radio-playlist-id]') || []
    ).map((checkbox) => {
      const id = checkbox.dataset.radioPlaylistId;
      const escapedId = String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const weight = playlistRadioSources.querySelector(`[data-radio-weight="${escapedId}"]`);
      return [id, { enabled: checkbox.checked, ...(weight ? { weight: weight.value } : {}) }];
    }));
    return {
      playlist: selectedPlaylist ? {
        id: String(selectedPlaylist.id),
        name: playlistNameInput?.value,
        mode: playlistModeInput?.value
      } : null,
      radioSources,
      autoDj: {
        enabled: autoDjEnabled?.checked,
        mode: autoDjMode?.value,
        historyPlays: autoDjHistoryPlays?.value,
        mixHistoryPercent: autoDjMixHistoryPercent?.value,
        repeatCooldownHours: autoDjRepeatCooldownHours?.value,
        maxConsecutive: autoDjMaxConsecutive?.value,
        announce: autoDjAnnounce?.checked,
        playlistUrls: autoDjPlaylistUrls?.value
      }
    };
  }

  function restoreLocalizedTransientState(snapshot) {
    if (!snapshot) return;
    if (snapshot.playlist && String(selectedPlaylist?.id || '') === snapshot.playlist.id) {
      if (playlistNameInput && !playlistNameInput.disabled) playlistNameInput.value = snapshot.playlist.name || '';
      if (playlistModeInput && snapshot.playlist.mode) playlistModeInput.value = snapshot.playlist.mode;
    }
    Object.entries(snapshot.radioSources || {}).forEach(([id, source]) => {
      const escapedId = String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const checkbox = playlistRadioSources?.querySelector(`[data-radio-playlist-id="${escapedId}"]`);
      const weight = playlistRadioSources?.querySelector(`[data-radio-weight="${escapedId}"]`);
      if (checkbox) checkbox.checked = Boolean(source.enabled);
      if (weight && Object.hasOwn(source, 'weight')) weight.value = source.weight;
    });
    const autoDj = snapshot.autoDj || {};
    if (autoDjEnabled && typeof autoDj.enabled === 'boolean') autoDjEnabled.checked = autoDj.enabled;
    if (autoDjMode && Object.hasOwn(autoDj, 'mode')) autoDjMode.value = autoDj.mode;
    if (autoDjHistoryPlays && Object.hasOwn(autoDj, 'historyPlays')) autoDjHistoryPlays.value = autoDj.historyPlays;
    if (autoDjMixHistoryPercent && Object.hasOwn(autoDj, 'mixHistoryPercent')) autoDjMixHistoryPercent.value = autoDj.mixHistoryPercent;
    if (autoDjRepeatCooldownHours && Object.hasOwn(autoDj, 'repeatCooldownHours')) autoDjRepeatCooldownHours.value = autoDj.repeatCooldownHours;
    if (autoDjMaxConsecutive && Object.hasOwn(autoDj, 'maxConsecutive')) autoDjMaxConsecutive.value = autoDj.maxConsecutive;
    if (autoDjAnnounce && typeof autoDj.announce === 'boolean') autoDjAnnounce.checked = autoDj.announce;
    if (autoDjPlaylistUrls && typeof autoDj.playlistUrls === 'string') autoDjPlaylistUrls.value = autoDj.playlistUrls;
  }

  const UNSAFE_LOCALE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  function cloneStaticLocaleNode(value) {
    if (Array.isArray(value)) return value.map(cloneStaticLocaleNode);
    if (!value || typeof value !== 'object') return value;
    const clone = {};
    Object.keys(value).forEach((key) => {
      if (!UNSAFE_LOCALE_KEYS.has(key)) clone[key] = cloneStaticLocaleNode(value[key]);
    });
    return clone;
  }

  async function hydrateStaticPluginLocale() {
    const i18n = window.i18n;
    const locale = String(i18n?.currentLocale || document.documentElement.lang || 'de').toLowerCase();
    if (!i18n?.translations || !/^(de|en|es|fr)$/.test(locale)) return false;
    try {
      const response = await fetch(`/plugins/music-bot/locales/${locale}.json`, { cache: 'no-store' });
      if (!response || response.ok === false) return false;
      const catalog = await response.json();
      if (!catalog?.music_bot || typeof catalog.music_bot !== 'object') return false;
      const legacyCatalog = cloneStaticLocaleNode(catalog.music_bot);
      const localeCatalog = i18n.translations[locale] ||= {};
      const pluginsCatalog = localeCatalog.plugins ||= {};
      const pluginCatalog = pluginsCatalog['music-bot'] ||= {};
      localeCatalog.music_bot = legacyCatalog;
      pluginCatalog.music_bot = legacyCatalog;
      return true;
    } catch (error) {
      console.warn('[music-bot] Static locale hydration failed', error);
      return false;
    }
  }

  function rerenderLocalizedDynamicSurfaces() {
    const transientState = captureLocalizedTransientState();
    window.i18n?.updateDOM?.();
    renderSetupIssues(currentSetupIssues);
    renderOnboarding(currentOnboarding, currentSetupIssues);
    renderNowPlaying(latestNowPlayingTrack);
    renderQueue(latestQueueTracks, latestQueueLength);
    renderHistory(latestHistoryTracks);
    renderPlaylistList();
    renderPlaylistEditor();
    renderRadioSources(latestRadioSources);
    if (latestAutoDjStatus) renderAutoDjStatus(latestAutoDjStatus);
    if (latestResolver) renderResolverHealth(latestResolver);
    if (latestHealth) renderHealth(latestHealth);
    renderGiftCatalogList();
    restoreLocalizedTransientState(transientState);
    activeToastRecords.forEach(renderToastRecord);
  }

  async function handleLanguageChange() {
    await hydrateStaticPluginLocale();
    rerenderLocalizedDynamicSurfaces();
  }

  window.i18n?.onLanguageChange?.(handleLanguageChange);
  window.i18n?.onChange?.(rerenderLocalizedDynamicSurfaces);

  async function boot() {
    if (window.i18n?.ready) await window.i18n.ready;
    await hydrateStaticPluginLocale();
    window.i18n?.updateDOM?.();
    await init();
  }

  boot().catch((error) => {
    console.error('[music-bot] UI initialization failed', error);
  });
})();
