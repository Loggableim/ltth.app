(() => {
  const MIN_SONG_DURATION_LIMIT_SECONDS = 30;
  const MAX_SONG_DURATION_LIMIT_SECONDS = 7200;
  const DEFAULT_SONG_DURATION_LIMIT_SECONDS = 360;

  function debounce(fn, delay = 200) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function setActiveTab(target) {
    if (!target) return;
    const contentTarget = target === 'queue' ? 'player' : target;
    document.querySelectorAll('.tab').forEach((t) => {
      const isActive = t.getAttribute('data-tab') === target;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      if (isActive) t.setAttribute('tabindex', '0');
    });
    document.querySelectorAll('.tab-content').forEach((c) => {
      const isActive = c.getAttribute('data-tab-content') === contentTarget;
      c.classList.toggle('active', isActive);
      c.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });
    if (target === 'queue') {
      document.getElementById('queue-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tab.setAttribute('aria-controls', `tab-content-${target === 'queue' ? 'player' : target}`);
    tab.setAttribute('tabindex', isActive ? '0' : '-1');
    tab.addEventListener('click', () => {
      setActiveTab(target);
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
        setActiveTab(next.getAttribute('data-tab'));
      }
    });
  });
  document.querySelectorAll('[data-tab-content]').forEach((panel) => {
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('id', `tab-content-${panel.getAttribute('data-tab-content')}`);
    panel.setAttribute('aria-hidden', panel.classList.contains('active') ? 'false' : 'true');
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
  const crossfadeInput = document.getElementById('crossfade-input');
  const crossfadeValue = document.getElementById('crossfade-value');
  const duplicateDetection = document.getElementById('duplicate-detection');
  const cooldownSecondsInput = document.getElementById('cooldown-seconds');
  const maxSongDurationInput = document.getElementById('max-song-duration-seconds');
  const cooldownBypassGifts = document.getElementById('cooldown-bypass-gifts');
  const skipImmunityGifts = document.getElementById('skip-immunity-gifts');
  const autoDjEnabled = document.getElementById('auto-dj-enabled');
  const autoDjMode = document.getElementById('auto-dj-mode');
  const autoDjHistoryPlays = document.getElementById('auto-dj-history-plays');
  const autoDjMaxConsecutive = document.getElementById('auto-dj-max-consecutive');
  const autoDjAnnounce = document.getElementById('auto-dj-announce');
  const autoDjStatus = document.getElementById('auto-dj-status');
  const autoDjDetail = document.getElementById('auto-dj-detail');
  const autoDjSave = document.getElementById('auto-dj-save');
  const autoDjSkip = document.getElementById('auto-dj-skip');
  const autoDjRandomKeywords = document.getElementById('auto-dj-random-keywords');
  const autoDjPlaylistUrls = document.getElementById('auto-dj-playlist-urls');
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
  const npProgressFill = document.getElementById('np-progress-fill');
  const npElapsed = document.getElementById('np-elapsed');
  const npDuration = document.getElementById('np-duration');
  const toastContainer = document.getElementById('musicbot-toast-container');
  const onboardingPanel = document.getElementById('musicbot-onboarding');
  const onboardingStatus = document.getElementById('musicbot-onboarding-status');
  const onboardingSteps = document.getElementById('musicbot-onboarding-steps');
  const onboardingHelp = document.getElementById('musicbot-onboarding-help');
  const onboardingSettings = document.getElementById('musicbot-onboarding-settings');
  const onboardingOverlay = document.getElementById('musicbot-onboarding-overlay');
  const onboardingComplete = document.getElementById('musicbot-onboarding-complete');

  // Progress timer state
  let progressTimer = null;
  let progressCurrentPos = 0;
  let progressDuration = 0;
  let draggedQueueIndex = null;
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

  function setPreviewVideo(youtubeId) {
    if (!previewFrame || !youtubeId) return;
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
    previewSource.textContent = 'YouTube';
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
    previewSource.textContent = 'YouTube';
  }

  function buildOnboardingSteps(issues = []) {
    const baseSteps = [
      {
        title: 'Einstellungen prüfen',
        meta: 'Hier liegen mpv, yt-dlp, Request-Limits und die zentrale Queue-Konfiguration.'
      },
      {
        title: 'OBS-Overlay sichern',
        meta: 'Im Overlay-Tab findest du die Browser-Source-URL für Streamlabs oder OBS.'
      },
      {
        title: 'Player testen',
        meta: 'Im Player kannst du einen ersten Song suchen und direkt in die Queue legen.'
      }
    ];

    const issueSteps = issues.slice(0, 2).map((issue) => ({
      title: issue?.title || 'Setup-Hinweis',
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
      onboardingStatus.textContent = currentSetupIssues.length ? 'Setup offen' : 'Bereit';
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
        ? 'Wenn mpv fehlt, setze den Pfad unter Einstellungen. Wenn yt-dlp fehlt, bleibt die Suche eingeschränkt, bis du den Resolver anpasst.'
        : 'Die Basis ist da. Starte mit den Einstellungen, kopiere danach die OBS-URL und teste einen ersten Request.';
    }
  }

  function renderSetupIssues(issues = []) {
    if (!setupIssuesBanner || !setupIssuesList) return;
    const list = Array.isArray(issues) ? issues : [];
    if (heroMpvStatus) {
      const mpvIssue = list.find((issue) => String(issue?.title || '').toLowerCase().includes('mpv'));
      heroMpvStatus.textContent = mpvIssue ? 'Nicht installiert' : 'Bereit';
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
        const instructions = Array.isArray(issue?.installInstructions) ? issue.installInstructions : [];
        const instructionsHtml = instructions.length
          ? `<ul>${instructions.map((instr) => `<li><code>${escapeHtml(instr)}</code></li>`).join('')}</ul>`
          : '';
        const installStatus = issue?.installStatus;
        const installStatusHtml = installStatus?.message
          ? `<p class="setup-install-status ${escapeHtml(installStatus.state || 'info')}">${escapeHtml(installStatus.message)}${installStatus.command ? ` <code>${escapeHtml(installStatus.command)}</code>` : ''}</p>`
          : '';
        const installButtonHtml = issue?.oneClickInstall && issue?.installAction === 'mpv'
          ? `<div class="setup-issue-actions">
              <button class="btn primary small" type="button" data-setup-action="install-mpv" ${installStatus?.state === 'installing' ? 'disabled' : ''}>
                ${escapeHtml(issue.installButtonLabel || 'Installieren')}
              </button>
            </div>`
          : '';
        return `
          <div class="setup-issue ${issue?.severity === 'error' ? 'error' : 'warning'}">
            <strong>${icon} ${escapeHtml(issue?.title || 'Setup-Hinweis')}</strong><br>
            <span style="font-size:0.9em;">${escapeHtml(issue?.description || '')}</span>
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
      showToast('success', 'MPV Installation', 'mpv wurde gefunden und ist bereit.');
      return;
    }

    if (installStatus?.state === 'failed' || installStatus?.state === 'unavailable') {
      stopMpvInstallPolling();
      showToast('error', 'MPV Installation', installStatus.message || 'Installation fehlgeschlagen.');
      return;
    }

    if (mpvInstallPollAttempts >= 130) {
      stopMpvInstallPolling();
      showToast('warn', 'MPV Installation', 'Die Installation laeuft ungewoehnlich lange. Pruefe den Paketmanager oder setze den mpv Pfad manuell.');
    }
  }

  function startMpvInstallPolling() {
    stopMpvInstallPolling();
    mpvInstallPollTimer = setInterval(() => {
      pollMpvInstallStatus().catch((error) => {
        stopMpvInstallPolling();
        showToast('error', 'MPV Installation', error?.message || 'Status konnte nicht geprueft werden.');
      });
    }, 3000);
    pollMpvInstallStatus().catch(() => {});
  }

  async function installMpvFromSetup(button) {
    if (button) {
      button.disabled = true;
      button.textContent = 'Installiere...';
    }

    const result = await post('/install/mpv');
    const status = result?.installStatus || {};
    if (Array.isArray(result?.issues)) {
      applySetupStatus(result);
    }

    if (result?.mpvAvailable || status.state === 'installed') {
      showToast('success', 'MPV Installation', status.message || 'mpv ist bereit.');
      return;
    }

    if (status.state === 'installing' || result?.pending) {
      showToast('info', 'MPV Installation', status.message || 'Installation wurde gestartet. Status wird automatisch geprueft.');
      startMpvInstallPolling();
      return;
    }

    showToast('error', 'MPV Installation', result?.error || status.message || 'Installation konnte nicht gestartet werden.');
    if (button) {
      button.disabled = false;
      button.textContent = 'MPV installieren';
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
      showToast('success', 'Assistent abgeschlossen', 'Clip bleibt still, bis du ihn wieder brauchst.');
    } else {
      showToast('error', 'Setup', result?.error || 'Der Abschluss konnte nicht gespeichert werden.');
    }
  }

  document.getElementById('pause-btn').addEventListener('click', () => {
    post('/pause');
  });
  document.getElementById('resume-btn').addEventListener('click', () => {
    post('/resume');
  });
  document.getElementById('skip-btn').addEventListener('click', () => {
    post('/skip');
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
      searchFeedback.textContent = '⏳ Lade Informationen...';
    } else {
      searchFeedback.textContent = '🔍 Suche...';
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
      searchFeedback.textContent = `⚠️ ${res?.error || 'Kein Ergebnis.'}`;
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
    requestFeedback.textContent = '⏳ Wird zur Queue hinzugefügt...';
    const result = await post('/request', { query });
    if (result?.success) {
      requestFeedback.textContent = `✅ Hinzugefügt: ${result.song.title}`;
      renderQueueFromServer();
      showToast('success', 'Song hinzugefügt', result.song.title);
    } else {
      requestFeedback.textContent = `⚠️ ${result?.error || 'Fehler beim Request.'}`;
      showToast('warn', 'Song-Request abgelehnt', result?.error || 'Fehler beim Request.');
    }
  });

  // Debounced volume/crossfade POSTs — the label updates immediately for responsiveness,
  // but the server request (which also persists config) only fires after the user stops dragging.
  const postMasterVolume = debounce((vol) => post('/volume', { masterVolume: vol }));
  masterVolumeInput?.addEventListener('input', () => {
    const vol = Number(masterVolumeInput.value);
    if (masterVolumeValue) masterVolumeValue.textContent = vol;
    postMasterVolume(vol);
  });

  const postSourceVolume = debounce((vol) => post('/volume', { sourceVolume: vol }));
  volumeInput.addEventListener('input', () => {
    const vol = Number(volumeInput.value);
    volumeValue.textContent = vol;
    postSourceVolume(vol);
  });

  const postCrossfade = debounce((ms) => post('/config', { playback: { crossfadeDuration: ms } }));
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
        overlayCopy.textContent = '✅ Kopiert!';
        setTimeout(() => { overlayCopy.textContent = orig; }, 2000);
      }).catch(() => {
        if (overlayUrl) { overlayUrl.select(); }
        alert('URL in die Zwischenablage kopieren fehlgeschlagen. Bitte manuell kopieren.');
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
    const mode = playlistUrls.length ? 'playlist' : autoDjMode.value;
    autoDjMode.value = mode;
    const payload = {
      enabled: autoDjEnabled.checked,
      mode,
      historyMinPlays: Number(autoDjHistoryPlays.value) || 1,
      maxConsecutiveAutoDJ: Number(autoDjMaxConsecutive.value) || 1,
      announceAutoDJ: autoDjAnnounce.checked,
      randomKeywords: parseList(autoDjRandomKeywords?.value || ''),
      playlistUrls
    };
    const result = await post('/auto-dj/toggle', payload);
    if (result?.track) {
      showToast('success', 'Auto-DJ gestartet', result.track.title || 'Nächster Titel läuft.');
    } else if (payload.enabled) {
      showToast('warn', 'Auto-DJ wartet', result?.status?.lastResult?.message || 'Kein Titel verfügbar.');
    }
    await refreshAutoDjStatus();
  });

  autoDjSkip.addEventListener('click', async () => {
    const result = await post('/auto-dj/skip');
    if (result?.success) {
      showToast('success', 'Auto-DJ', result.track?.title || 'Nächster Titel läuft.');
    } else {
      showToast('warn', 'Auto-DJ', result?.status?.lastResult?.message || 'Kein Titel verfügbar.');
    }
    await refreshAutoDjStatus();
  });

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
      playback: { mpvPath: (mpvPathInput?.value || '').trim() || 'mpv' },
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
    showFeedback(settingsFeedback, result?.success ? '✅ Gespeichert' : '❌ Fehler');
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
    showFeedback(moderationFeedback, result?.success ? '✅ Gespeichert' : '❌ Fehler');
  });

  banAdd?.addEventListener('click', async () => {
    if (!banType || !banValue) return;
    const type = banType.value;
    const value = banValue.value.trim();
    const reason = banReason?.value?.trim();
    if (!value) {
      showBanFeedback('Bitte einen Wert eingeben.', true);
      return;
    }
    const result = await post('/bans', { type, value, reason });
    if (result?.success) {
      showBanFeedback('Ban hinzugefügt.', false);
      banValue.value = '';
      if (banReason) banReason.value = '';
      await refreshBans();
    } else {
      showBanFeedback(result?.error || 'Ban konnte nicht hinzugefügt werden.', true);
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
      showBanFeedback('Ban konnte nicht entfernt werden.', true);
    }
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
    refreshHistory();
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
    showToast(payload?.type || 'info', payload?.title || 'Music Bot', payload?.message || '');
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
    showToast('error', 'API-Fehler', payload?.message || 'Unbekannter Fehler');
  });
  socket.on('connect_error', () => {
    showToast('error', 'Netzwerk', 'Verbindung zum Music Bot unterbrochen.');
  });
  socket.on('disconnect', () => {
    showToast('warn', 'Netzwerk', 'Socket-Verbindung getrennt.');
  });

  socket.on('musicbot:paused', () => {
    updateState('Paused');
    stopProgressTimer();
  });
  socket.on('musicbot:resumed', () => {
    updateState('Playing');
    startProgressTimer();
  });
  socket.on('musicbot:playback-stopped', () => {
    updateState('Idle');
    stopProgressTimer();
    if (npProgressWrapper) npProgressWrapper.style.display = 'none';
  });
  socket.on('musicbot:playback-sync', (payload) => {
    if (typeof payload.position === 'number') {
      progressCurrentPos = payload.position;
      updateProgressBar();
    }
    if (typeof payload.duration === 'number') {
      progressDuration = payload.duration;
      if (npDuration) npDuration.textContent = formatDuration(payload.duration);
    }
  });
  socket.on('musicbot:song-skipped', () => refreshHistory());

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
    }
    const queueData = await get('/queue');
    if (queueData?.queue) {
      renderQueue(queueData.queue, queueData.queue.length);
    }
    const historyData = await get('/history');
    if (historyData?.history) {
      renderHistory(historyData.history);
    }

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
      autoDjMaxConsecutive.value = configData.config.autoDJ.maxConsecutiveAutoDJ || 1;
      autoDjAnnounce.checked = Boolean(configData.config.autoDJ.announceAutoDJ);
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
    await refreshBans();
    await refreshGiftCatalog();
  }

  async function refreshHistory() {
    const historyData = await get('/history');
    if (historyData?.history) {
      renderHistory(historyData.history);
    }
  }

  async function get(path) {
    try {
      const res = await fetch(`/api/plugins/music-bot${path}`);
      return await res.json();
    } catch (error) {
      showToast('error', 'Netzwerk', 'GET-Anfrage fehlgeschlagen.');
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
      showToast('error', 'Netzwerk', 'POST-Anfrage fehlgeschlagen.');
      return null;
    }
  }

  async function del(path) {
    try {
      const res = await fetch(`/api/plugins/music-bot${path}`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (error) {
      showToast('error', 'Netzwerk', 'DELETE-Anfrage fehlgeschlagen.');
      return null;
    }
  }

  function renderNowPlaying(track) {
    if (!track) {
      nowPlayingEl.classList.add('empty');
      nowPlayingEl.innerHTML = '<p>Aktuell läuft nichts.</p>';
      updateState('Idle');
      stopProgressTimer();
      if (npProgressWrapper) npProgressWrapper.style.display = 'none';
      return;
    }
    nowPlayingEl.classList.remove('empty');
    const dur = formatDuration(track.duration);
    nowPlayingEl.innerHTML = `
      <p class="title">🎵 ${escapeHtml(track.title)}</p>
      <p class="meta">${escapeHtml(track.artist || '')} • Angefragt von <strong>${escapeHtml(track.requestedBy || 'Viewer')}</strong>${dur !== '—' ? ' • ' + dur : ''}</p>
    `;
    const actualState = track.state || 'playing';
    updateState(actualState === 'paused' ? 'Paused' : 'Playing');

    if (npProgressWrapper && track.duration) {
      npProgressWrapper.style.display = 'block';
      progressDuration = track.duration;
      progressCurrentPos = track.startedAt
        ? Math.max(0, Math.floor((Date.now() - track.startedAt) / 1000))
        : 0;
      if (npDuration) npDuration.textContent = formatDuration(track.duration);
      if (actualState !== 'paused') {
        startProgressTimer();
      }
    }
  }

  function renderQueue(queue = [], length = 0) {
    queueLengthEl.textContent = length ?? queue.length;
    if (heroQueueCount) heroQueueCount.textContent = length ?? queue.length;
    if (!queue || queue.length === 0) {
      queueListEl.classList.add('empty');
      queueListEl.innerHTML = `
        <div class="queue-empty-state">
          <img src="/plugins/music-bot/assets/soundbot.png" alt="" aria-hidden="true">
          <strong>Die Warteschlange ist leer</strong>
          <p>Sei der/die Erste und fordere einen Song an.</p>
        </div>
      `;
      return;
    }
    queueListEl.classList.remove('empty');
    queueListEl.innerHTML = queue
      .map((item, idx) => {
        const thumb = item.youtubeId
          ? `<img src="https://i.ytimg.com/vi/${item.youtubeId}/default.jpg" class="queue-thumb" alt="">`
          : '<span class="queue-thumb-placeholder">🎵</span>';
        const dur = item.duration ? ` • ${formatDuration(item.duration)}` : '';
        const giftBadge = item.isGiftRequest ? ' <span class="gift-badge">🎁</span>' : '';
        return `<div class="item queue-item" draggable="true" data-queue-index="${idx}">
          <span class="queue-pos">#${idx + 1}</span>
          ${thumb}
          <div class="queue-info">
            <span class="queue-title"><strong>${escapeHtml(item.title)}</strong>${giftBadge}</span>
            <span class="queue-meta">${escapeHtml(item.requestedBy || 'Viewer')}${dur}</span>
          </div>
          <div class="queue-actions">
            <button class="btn danger small" data-queue-action="remove" data-idx="${idx}" title="Entfernen">✕</button>
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
    const btn = event.target.closest('[data-queue-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.queueAction;
    const idx = Number(btn.dataset.idx);
    if (!Number.isFinite(idx)) return;
    if (action === 'remove') {
      await del(`/queue/${idx}`);
      await renderQueueFromServer();
      showToast('info', 'Queue', 'Track wurde entfernt.');
    }
  });

  queueListEl?.addEventListener('dragstart', (event) => {
    const item = event.target.closest('.queue-item');
    if (!item) return;
    draggedQueueIndex = Number(item.dataset.queueIndex);
    item.classList.add('dragging');
  });

  queueListEl?.addEventListener('dragend', (event) => {
    const item = event.target.closest('.queue-item');
    if (item) item.classList.remove('dragging');
    queueListEl.querySelectorAll('.queue-item.drop-target').forEach((el) => el.classList.remove('drop-target'));
    draggedQueueIndex = null;
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
    await post('/queue/reorder', { fromIndex: draggedQueueIndex, toIndex });
    await renderQueueFromServer();
    showToast('success', 'Queue', `Track #${draggedQueueIndex + 1} wurde an Position #${toIndex + 1} verschoben.`);
  });

  function startProgressTimer() {
    stopProgressTimer();
    if (!progressDuration) return;
    progressTimer = setInterval(() => {
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
    if (!npProgressFill || !npElapsed) return;
    const pct = progressDuration > 0 ? Math.min(100, (progressCurrentPos / progressDuration) * 100) : 0;
    npProgressFill.style.width = `${pct}%`;
    npElapsed.textContent = formatDuration(progressCurrentPos);
  }

  function showFeedback(el, message) {
    if (!el) return;
    el.textContent = message;
    setTimeout(() => { el.textContent = ''; }, 4000);
  }

  function showToast(type = 'info', title = 'Music Bot', message = '') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `musicbot-toast ${type}`;
    toast.innerHTML = `
      <div class="musicbot-toast-title">${escapeHtml(title)}</div>
      <div class="musicbot-toast-message">${escapeHtml(message)}</div>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 4500);
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
    previewSource.textContent = song.source || 'YouTube';
  }

  function buildEmbedUrl(song) {
    if (!song) return '';
    if (song.youtubeId) {
      return `https://www.youtube.com/embed/${song.youtubeId}`;
    }
    if (song.url && song.url.includes('youtube.com/watch')) {
      try {
        const url = new URL(song.url);
        const id = url.searchParams.get('v');
        if (id) return `https://www.youtube.com/embed/${id}`;
      } catch (error) {
        return '';
      }
    }
    if (song.url && song.url.includes('youtu.be/')) {
      const id = song.url.split('youtu.be/')[1]?.split('?')[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    return song.url || '';
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function renderHistory(history = []) {
    if (!history.length) {
      historyListEl.classList.add('empty');
      historyListEl.innerHTML = '<p>Noch keine History.</p>';
      return;
    }
    historyListEl.classList.remove('empty');
    historyListEl.innerHTML = history
      .slice(-10)
      .reverse()
      .map((item) => {
        const thumb = item.youtubeId
          ? `<img src="https://i.ytimg.com/vi/${item.youtubeId}/default.jpg" class="queue-thumb" alt="">`
          : '<span class="queue-thumb-placeholder">🎵</span>';
        return `<div class="item queue-item">${thumb}<span class="queue-title">${escapeHtml(item.title)}</span><span class="text-secondary queue-by">${escapeHtml(item.requestedBy || 'Viewer')}</span></div>`;
      })
      .join('');
  }

  function updateState(state) {
    stateEl.textContent = state || 'Idle';
  }

  async function refreshAutoDjStatus() {
    const statusRes = await get('/auto-dj/status');
    const status = statusRes?.status;
    if (!status) return;
    autoDjEnabled.checked = Boolean(status.enabled);
    autoDjMode.value = status.mode || 'history';
    autoDjHistoryPlays.value = status.historyMinPlays || 1;
    autoDjMaxConsecutive.value = status.maxConsecutiveAutoDJ || 1;
    autoDjAnnounce.checked = Boolean(status.announceAutoDJ);
    if (autoDjRandomKeywords) autoDjRandomKeywords.value = (status.randomKeywords || []).join(', ');
    if (autoDjPlaylistUrls) autoDjPlaylistUrls.value = (status.playlistUrls || []).join('\n');
    autoDjStatus.textContent = status.enabled ? (status.lastResult?.state === 'playing' ? 'Spielt' : 'Aktiv') : 'Deaktiviert';
    autoDjStatus.title = status.lastResult?.message || '';
    if (autoDjDetail) autoDjDetail.textContent = status.lastResult?.message || '';
    if (heroAutodjStatus) heroAutodjStatus.textContent = status.enabled ? 'Ein' : 'Aus';
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
    const localeText = giftCatalogMeta.locales.length ? `Locales: ${giftCatalogMeta.locales.join(', ')}` : 'Locales: default';
    const regionText = giftCatalogMeta.region ? `Region: ${giftCatalogMeta.region}` : null;
    const updatedText = giftCatalogMeta.lastUpdate
      ? `Aktualisiert: ${new Date(giftCatalogMeta.lastUpdate).toLocaleString()}`
      : null;
    const countText = apiCount !== uniqueCount
      ? `${uniqueCount} Gifts geladen (${apiCount} API-Einträge)`
      : `${uniqueCount} Gifts geladen`;

    return [
      `${visible}/${uniqueCount} Gifts sichtbar`,
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
      : '<option value="" disabled>Keine Gifts gefunden</option>';

    Array.from(giftCatalogList.options).forEach((option) => {
      option.selected = giftCatalogSelectedValues.has(option.value);
    });

    if (giftCatalogCount) {
      giftCatalogCount.textContent = `${giftCatalogEntries.length} Gifts`;
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
        giftCatalogStatus.textContent = 'Bitte zuerst Gifts auswählen.';
      }
      return;
    }

    const existing = parseList(targetField.value);
    targetField.value = Array.from(new Set([...existing, ...selected])).join(', ');

    const response = await post('/config', configBody);
    if (response?.success === false) {
      if (giftCatalogStatus) {
        giftCatalogStatus.textContent = `${label} konnte nicht gespeichert werden.`;
      }
      return;
    }

    if (giftCatalogStatus) {
      giftCatalogStatus.textContent = `${selected.length} Gifts in ${label} übernommen.`;
    }
    if (typeof showToast === 'function') {
      showToast('success', 'Geschenkekatalog', `${label} aktualisiert.`);
    }
  }

  async function refreshGiftCatalog() {
    if (!giftCatalogList) return;
    try {
      if (giftCatalogStatus) {
        giftCatalogStatus.textContent = 'Geschenkekatalog wird geladen...';
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
        giftCatalogStatus.textContent = 'Geschenkekatalog konnte nicht geladen werden.';
      }
      if (giftCatalogCount) {
        giftCatalogCount.textContent = '0 Gifts';
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
      tbody.innerHTML = '<tr><td colspan="4" class="text-secondary">Keine Einträge.</td></tr>';
      return;
    }
    tbody.innerHTML = bans
      .map(
        (ban) => `
        <tr>
          <td>${escapeHtml(ban.type)}</td>
          <td>${escapeHtml(ban.value)}</td>
          <td>${escapeHtml(ban.reason || '')}</td>
          <td><button class="btn ghost small" data-ban-id="${escapeHtml(ban.id)}">Löschen</button></td>
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

  init();
})();
