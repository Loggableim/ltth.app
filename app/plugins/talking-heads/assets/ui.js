(() => {
  'use strict';

  const state = {
    config: {},
    catalog: { packs: [] },
    status: null,
    manualSets: [],
    viewerBar: null,
    framePreviewKey: '',
    framePreviewRequest: null
  };
  const messages = {
    configSaved: 'Director settings saved.',
    framesPrepared: 'Boba frame preview prepared.',
    previewStarted: 'TTS preview started.',
    animationStarted: 'Speaker stage test started.',
    testSpinStarted: 'Safe Boba test spin sent to the overlay.',
    statusUnavailable: 'Bridge health is currently unavailable.',
    expression: 'Expression',
    bobaAnimals: 'Boba Animals',
    idle: 'Idle',
    audioLive: 'Audio live',
    bridgeReady: 'Bridge ready',
    bridgeWaiting: 'Bridge waiting',
    bridgeUnavailable: 'Bridge unavailable',
    enabled: 'Enabled',
    disabled: 'Disabled',
    healthUpdated: 'Live bridge health updated.',
    directorReady: 'Boba library and director settings are ready.',
    requestFailed: 'Request failed: {message}',
    framePreviewUnavailable: 'The selected Boba frame preview is unavailable.',
    chooseManualZip: 'Choose a set name and ZIP first.',
    manualSetUploaded: 'Manual set {setName} uploaded.',
    manualSetDeleted: 'Manual set deleted.',
    manualSetAssigned: 'Manual set assigned.',
    cacheCleared: 'Generated cache cleared.',
    viewerBarSaved: 'Viewer Bar saved locally.',
    copyUnavailable: 'Copy is unavailable in this browser.',
    urlCopied: 'URL copied.',
    noManualSets: 'No manual sets yet.',
    delete: 'Delete',
    cacheSummary: '{count} cached avatars - {bytes} bytes',
    noCache: 'No generated avatars in cache.',
    noLocalLog: 'No local log entries.',
    confirmDeleteManualSet: 'Delete manual set {setName}?',
    confirmClearCache: 'Clear generated avatar cache?'
  };
  const el = id => document.getElementById(id);
  let initialized = false;

  function directorText(key, fallback, params = {}) {
    const fullKey = `plugins.talking-heads.talking_heads_ui.stream_director.messages.${key}`;
    const value = window.i18n?.t?.(fullKey, params);
    const text = value && value !== fullKey ? value : fallback || messages[key] || key;
    return String(text).replace(/\{([\w]+)\}/g, (match, name) => (
      Object.hasOwn(params, name) ? String(params[name]) : match
    ));
  }

  function errorText(error, fallbackKey = 'requestFailed') {
    const message = String(error?.message || directorText('statusUnavailable')).trim();
    return directorText(fallbackKey, undefined, { message });
  }

  function showError(error, { toast = false } = {}) {
    const message = errorText(error);
    setStatus(message, true);
    if (toast) notify(message, 'error');
    return message;
  }

  function setStatus(text, isError = false) {
    const target = el('assetStatus');
    if (!target) return;
    target.textContent = text || '';
    target.classList.toggle('is-error', isError);
  }

  function notify(text, type = 'success') {
    const toast = el('toast');
    if (!toast) return;
    toast.textContent = text;
    toast.className = `director-toast ${type === 'error' ? 'error' : ''}`;
    toast.style.display = 'block';
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { toast.style.display = 'none'; }, 3800);
  }

  async function readJson(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data.error || directorText('statusUnavailable'));
    }
    return data;
  }

  async function getJson(url) {
    return readJson(await fetch(url, { headers: { Accept: 'application/json' } }));
  }

  async function postJson(url, body = {}) {
    return readJson(await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }));
  }

  function currentPack() {
    const packId = el('assetPack')?.value || 'boba';
    return state.catalog.packs.find(pack => pack.id === packId) || state.catalog.packs[0] || null;
  }

  function option(value, label = value) {
    const element = document.createElement('option');
    element.value = value;
    element.textContent = label;
    return element;
  }

  function readSelection() {
    const options = {};
    document.querySelectorAll('[data-asset-option]').forEach(input => {
      options[input.dataset.assetOption] = input.value;
    });
    return {
      assetPack: el('assetPack')?.value || 'boba',
      assetCharacter: el('assetCharacter')?.value || 'Fox',
      assetOptions: options
    };
  }

  function selectionKey(selection = {}) {
    return JSON.stringify({
      assetPack: selection.assetPack || 'boba',
      assetCharacter: selection.assetCharacter || 'Fox',
      assetOptions: selection.assetOptions || {}
    });
  }

  function bobaThumbnailUrl(character) {
    const safeCharacter = encodeURIComponent(String(character || 'Fox'));
    return `/plugins/talking-heads/assets/asset-packs/boba/animals/${safeCharacter}/Ready-To-Use/${safeCharacter}.png`;
  }

  function setFramePreview(selection, spriteUrl) {
    const preview = el('assetPreview');
    if (!preview || !spriteUrl) return;
    preview.src = spriteUrl;
    preview.alt = [selection.assetCharacter, selection.assetOptions?.expression]
      .filter(Boolean)
      .join(' ');
  }

  function materializeSelectedFrame({ force = false } = {}) {
    const preview = el('assetPreview');
    const selection = readSelection();
    if (!preview) return Promise.resolve(null);

    const key = selectionKey(selection);
    if (state.framePreviewRequest?.key === key) return state.framePreviewRequest.promise;
    if (!force && state.framePreviewKey === key && preview.getAttribute('src')) {
      return Promise.resolve({ spriteUrls: { idle_neutral: preview.getAttribute('src') } });
    }

    const request = postJson('/api/talkingheads/test-generate', selection).then((data) => {
      const spriteUrl = data.spriteUrls?.idle_neutral;
      if (!spriteUrl) throw new Error(directorText('framePreviewUnavailable'));
      if (selectionKey(readSelection()) === key) {
        setFramePreview(selection, spriteUrl);
        state.framePreviewKey = key;
      }
      return data;
    });
    state.framePreviewRequest = { key, promise: request };
    request.then(
      () => {
        if (state.framePreviewRequest?.promise === request) state.framePreviewRequest = null;
      },
      () => {
        if (state.framePreviewRequest?.promise === request) state.framePreviewRequest = null;
      }
    );
    return request;
  }

  function renderOptions(preferred = {}) {
    const container = el('assetOptions');
    const pack = currentPack();
    if (!container || !pack) return;
    container.replaceChildren();
    Object.entries(pack.options || {}).forEach(([key, values]) => {
      if (key === 'body' || key === 'head' || !Array.isArray(values)) return;
      const label = document.createElement('label');
      label.textContent = key === 'expression' ? directorText('expression') : key;
      const select = document.createElement('select');
      select.dataset.assetOption = key;
      values.forEach(value => select.append(option(value)));
      select.value = preferred[key] || values[0] || '';
      select.addEventListener('change', updateSelectionSummary);
      label.append(select);
      container.append(label);
    });
  }

  function renderCharacters(preferredCharacter) {
    const select = el('assetCharacter');
    const pack = currentPack();
    if (!select || !pack) return;
    select.replaceChildren();
    (pack.characters || []).forEach(character => select.append(option(character)));
    select.value = preferredCharacter || pack.characters?.[0] || '';
    if (!select.value && select.options.length) select.selectedIndex = 0;
    renderOptions(state.config.assetOptions || {});
    renderBobaThumbnails();
    updateSelectionSummary();
  }

  function renderPacks() {
    const select = el('assetPack');
    if (!select) return;
    select.replaceChildren();
    state.catalog.packs.forEach(pack => select.append(option(pack.id, pack.name)));
    select.value = state.config.assetPack || 'boba';
    if (!select.value && select.options.length) select.selectedIndex = 0;
    renderCharacters(state.config.assetCharacter);
  }

  function renderBobaThumbnails() {
    const grid = el('bobaThumbnailGrid');
    const boba = state.catalog.packs.find(pack => pack.id === 'boba');
    if (!grid || !boba) return;
    grid.replaceChildren();
    (boba.characters || []).forEach(character => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'boba-thumbnail';
      button.setAttribute('aria-label', character);
      const image = document.createElement('img');
      image.src = bobaThumbnailUrl(character);
      image.alt = '';
      image.loading = 'lazy';
      const label = document.createElement('span');
      label.textContent = character;
      button.append(image, label);
      button.classList.toggle('is-selected', el('assetCharacter')?.value === character && el('assetPack')?.value === 'boba');
      button.addEventListener('click', () => {
        const packSelect = el('assetPack');
        const characterSelect = el('assetCharacter');
        if (!packSelect || !characterSelect) return;
        packSelect.value = 'boba';
        renderCharacters(character);
        characterSelect.value = character;
        updateSelectionSummary();
      });
      grid.append(button);
    });
  }

  function updateSelectionSummary() {
    const selection = readSelection();
    const pack = currentPack();
    const summary = [pack?.name, selection.assetCharacter, ...Object.values(selection.assetOptions)]
      .filter(Boolean)
      .join(' · ');
    if (el('assetSelectionSummary')) el('assetSelectionSummary').textContent = summary || directorText('bobaAnimals');
    renderBobaThumbnails();
    void materializeSelectedFrame().catch(showError);
  }

  function readConfig() {
    return {
      ...readSelection(),
      enabled: Boolean(el('enabled')?.checked),
      firstAssignmentEnabled: el('firstAssignmentEnabled')?.checked !== false,
      rerollGiftEnabled: el('rerollGiftEnabled')?.checked !== false,
      rerollGiftId: el('rerollGiftId')?.value.trim() || '',
      rerollGiftNames: (el('rerollGiftNames')?.value || '')
        .split(',')
        .map(name => name.trim())
        .filter(Boolean),
      spinDurationMs: Number(el('spinDurationMs')?.value) || 2600,
      animationDuration: Number(el('animationDuration')?.value) || 5000,
      rolePermission: el('rolePermission')?.value || 'all',
      requireSubscriber: Boolean(el('requireSubscriber')?.checked),
      requireCustomVoice: Boolean(el('requireCustomVoice')?.checked),
      cacheEnabled: el('cacheEnabled')?.checked !== false,
      cacheDuration: Number(el('cacheDuration')?.value) || state.config.cacheDuration,
      spriteMode: el('spriteMode')?.value || state.config.spriteMode || 'asset-library',
      manualFallback: el('manualFallback')?.checked !== false,
      debugLogging: Boolean(el('debugLogging')?.checked)
    };
  }

  function applyConfig(config = {}) {
    state.config = { ...state.config, ...config };
    const bind = (id, value) => { if (el(id)) el(id).value = value; };
    const check = (id, value) => { if (el(id)) el(id).checked = Boolean(value); };
    check('enabled', state.config.enabled);
    check('firstAssignmentEnabled', state.config.firstAssignmentEnabled !== false);
    check('rerollGiftEnabled', state.config.rerollGiftEnabled !== false);
    bind('rerollGiftId', state.config.rerollGiftId || '');
    bind('rerollGiftNames', (state.config.rerollGiftNames || []).join(', '));
    bind('spinDurationMs', state.config.spinDurationMs || 2600);
    bind('animationDuration', state.config.animationDuration || 5000);
    bind('rolePermission', state.config.rolePermission || 'all');
    check('requireSubscriber', state.config.requireSubscriber);
    check('requireCustomVoice', state.config.requireCustomVoice);
    check('cacheEnabled', state.config.cacheEnabled !== false);
    bind('cacheDuration', state.config.cacheDuration || 2592000000);
    bind('spriteMode', state.config.spriteMode || 'asset-library');
    check('manualFallback', state.config.manualFallback !== false);
    check('debugLogging', state.config.debugLogging);
    renderPacks();
  }

  function renderHealth(status = {}) {
    state.status = status;
    const bridge = status.rendererBridge || {};
    const set = (id, value) => { if (el(id)) el(id).textContent = value; };
    set('enabledHealth', status.enabled ? directorText('enabled') : directorText('disabled'));
    set('rendererHealth', bridge.state === 'playing'
      ? directorText('audioLive')
      : bridge.available ? directorText('bridgeReady') : directorText('bridgeWaiting'));
    set('activeSpeakerHealth', status.activeSpeaker?.userId || directorText('idle'));
    set('activeSpinHealth', status.activeSpin?.userId || directorText('idle'));
    const statePill = el('directorState');
    if (statePill) {
      statePill.textContent = bridge.state === 'playing'
        ? directorText('audioLive')
        : bridge.available ? directorText('bridgeReady') : directorText('bridgeWaiting');
      statePill.dataset.state = bridge.available ? 'ready' : 'loading';
    }
  }

  async function refreshStatus({ quiet = false } = {}) {
    try {
      const data = await getJson('/api/talkingheads/status');
      renderHealth(data.status || {});
      if (!quiet) setStatus(directorText('healthUpdated'));
    } catch (error) {
      const statePill = el('directorState');
      if (statePill) {
        statePill.textContent = directorText('bridgeUnavailable');
        statePill.dataset.state = 'error';
      }
      if (!quiet) showError(error);
    }
  }

  async function loadConfig() {
    const data = await getJson('/api/talkingheads/config');
    state.catalog = data.assetCatalog || { packs: [] };
    applyConfig(data.config || {});
    setStatus(directorText('directorReady'));
  }

  async function saveConfig({ quiet = false } = {}) {
    const button = el('saveConfigBtn');
    if (button) button.disabled = true;
    try {
      const data = await postJson('/api/talkingheads/config', readConfig());
      state.catalog = data.assetCatalog || state.catalog;
      applyConfig(data.config || {});
      if (!quiet) {
        setStatus(directorText('configSaved'));
        notify(directorText('configSaved'));
      }
      return data;
    } catch (error) {
      if (!quiet) showError(error, { toast: true });
      throw error;
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function prepareAssets() {
    const button = el('prepareAssetBtn');
    if (button) button.disabled = true;
    try {
      await materializeSelectedFrame({ force: true });
      setStatus(directorText('framesPrepared'));
      notify(directorText('framesPrepared'));
    } catch (error) {
      showError(error, { toast: true });
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function testSpin() {
    const button = el('testSpinBtn');
    if (button) button.disabled = true;
    try {
      await postJson('/api/talkingheads/test-spin');
      setStatus(directorText('testSpinStarted'));
      notify(directorText('testSpinStarted'));
    } catch (error) {
      showError(error, { toast: true });
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function previewTts() {
    const button = el('previewTtsBtn');
    if (button) button.disabled = true;
    try {
      await saveConfig({ quiet: true });
      await postJson('/api/talkingheads/preview-tts', {
        ...readSelection(),
        text: el('previewText')?.value || ''
      });
      setStatus(directorText('previewStarted'));
      notify(directorText('previewStarted'));
    } catch (error) {
      showError(error, { toast: true });
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function testAnimation() {
    const button = el('testAnimationBtn');
    if (button) button.disabled = true;
    try {
      await postJson('/api/talkingheads/test-animation', {
        ...readSelection(),
        userId: 'talkingheads_local_stage_test',
        username: 'Boba Stage Test',
        duration: Number(el('animationDuration')?.value) || 5000
      });
      setStatus(directorText('animationStarted'));
      notify(directorText('animationStarted'));
    } catch (error) {
      showError(error, { toast: true });
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function copyText(value) {
    if (!value) throw new Error(directorText('copyUnavailable'));
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.readOnly = true;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand?.('copy');
    textarea.remove();
    if (!copied) throw new Error(directorText('copyUnavailable'));
  }

  async function copyField(id) {
    try {
      await copyText(el(id)?.value || '');
      notify(directorText('urlCopied'));
    } catch (error) {
      notify(errorText(error), 'error');
    }
  }

  function renderManualSets(sets = []) {
    state.manualSets = sets;
    const list = el('manualSetList');
    const select = el('manualSetSelect');
    if (list) list.replaceChildren();
    if (select) select.replaceChildren();
    if (!sets.length && list) list.textContent = directorText('noManualSets');
    sets.forEach(set => {
      if (select) select.append(option(set.setId, set.setName || set.setId));
      if (!list) return;
      const row = document.createElement('div');
      const title = document.createElement('span');
      title.textContent = set.setName || set.setId;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'director-button danger';
      remove.textContent = directorText('delete');
      remove.addEventListener('click', () => deleteManualSet(set.setId));
      row.append(title, remove);
      list.append(row);
    });
  }

  async function loadManualSets() {
    try {
      const data = await getJson('/api/talkingheads/manual-templates');
      renderManualSets(data.sets || []);
    } catch (error) {
      showError(error);
    }
  }

  async function uploadManualSet() {
    const file = el('manualZip')?.files?.[0];
    const setName = el('manualSetName')?.value.trim();
    if (!file || !setName) {
      setStatus(directorText('chooseManualZip'), true);
      return;
    }
    const formData = new FormData();
    formData.append('setName', setName);
    formData.append('zip', file);
    try {
      const data = await readJson(await fetch('/api/talkingheads/manual-upload', {
        method: 'POST',
        body: formData
      }));
      setStatus(directorText('manualSetUploaded', undefined, { setName: data.setName || setName }));
      await loadManualSets();
    } catch (error) {
      showError(error);
    }
  }

  async function deleteManualSet(setId) {
    if (!window.confirm?.(directorText('confirmDeleteManualSet', undefined, { setName: setId }))) return;
    try {
      await readJson(await fetch(`/api/talkingheads/manual-upload/${encodeURIComponent(setId)}`, {
        method: 'DELETE'
      }));
      await loadManualSets();
      setStatus(directorText('manualSetDeleted'));
    } catch (error) {
      showError(error);
    }
  }

  async function assignManualSet() {
    try {
      await postJson('/api/talkingheads/manual-assign', {
        userId: el('manualUserId')?.value.trim() || '',
        username: el('manualUsername')?.value.trim() || '',
        setId: el('manualSetSelect')?.value || ''
      });
      setStatus(directorText('manualSetAssigned'));
    } catch (error) {
      showError(error);
    }
  }

  async function loadCache() {
    try {
      const [stats, entries] = await Promise.all([
        getJson('/api/talkingheads/cache/stats'),
        getJson('/api/talkingheads/cache/list')
      ]);
      const summary = el('cacheSummary');
      if (summary) {
        summary.textContent = directorText('cacheSummary', undefined, {
          count: stats.stats?.count ?? 0,
          bytes: stats.stats?.totalSize ?? 0
        });
      }
      const list = el('cacheList');
      if (!list) return;
      list.replaceChildren();
      const rows = entries.avatars || entries.entries || [];
      if (!rows.length) list.textContent = directorText('noCache');
      rows.slice(0, 25).forEach(entry => {
        const row = document.createElement('div');
        row.textContent = `${entry.username || entry.userId || 'Avatar'} · ${entry.styleKey || 'local'}`;
        list.append(row);
      });
    } catch (error) {
      showError(error);
    }
  }

  async function clearCache() {
    if (!window.confirm?.(directorText('confirmClearCache'))) return;
    try {
      await postJson('/api/talkingheads/cache/clear');
      await loadCache();
      setStatus(directorText('cacheCleared'));
    } catch (error) {
      showError(error);
    }
  }

  async function loadViewerBar() {
    try {
      const data = await getJson('/api/talkingheads/viewer-bar/config');
      state.viewerBar = data.config || {};
      if (el('viewerBarUrl')) el('viewerBarUrl').value = data.overlayUrl || viewerBarUrl();
      if (el('viewerBarEnabled')) el('viewerBarEnabled').checked = Boolean(state.viewerBar.enabled);
      if (el('viewerBarMaxVisible')) el('viewerBarMaxVisible').value = state.viewerBar.maxVisibleViewers || 20;
      if (el('viewerBarAvatarSize')) el('viewerBarAvatarSize').value = state.viewerBar.avatarSize || 64;
    } catch (error) {
      showError(error);
    }
  }

  async function saveViewerBar() {
    try {
      const data = await postJson('/api/talkingheads/viewer-bar/config', {
        ...(state.viewerBar || {}),
        enabled: Boolean(el('viewerBarEnabled')?.checked),
        maxVisibleViewers: Number(el('viewerBarMaxVisible')?.value) || 20,
        avatarSize: Number(el('viewerBarAvatarSize')?.value) || 64
      });
      state.viewerBar = data.config || state.viewerBar;
      setStatus(directorText('viewerBarSaved'));
    } catch (error) {
      showError(error);
    }
  }

  async function loadLogs() {
    try {
      const data = await getJson('/api/talkingheads/logs');
      const logs = data.logs || [];
      if (el('logList')) el('logList').textContent = logs.map(entry => (
        `${entry.timestamp || ''} ${entry.level || 'info'} ${entry.message || ''}`
      )).join('\n') || directorText('noLocalLog');
    } catch (error) {
      showError(error);
    }
  }

  function localOverlayUrl() {
    return `${window.location.origin}/overlay/talking-heads`;
  }

  function viewerBarUrl() {
    return `${window.location.origin}/talking-heads/viewer-bar`;
  }

  function setOverlayUrls() {
    const local = localOverlayUrl();
    if (el('localOverlayUrl')) el('localOverlayUrl').value = local;
    // The shared TikTok Studio helper resolves the active creator claim when
    // the operator clicks this field’s dedicated action.
    if (el('publicOverlayUrl')) el('publicOverlayUrl').value = local;
    if (el('viewerBarUrl')) el('viewerBarUrl').value = viewerBarUrl();
  }

  function bindEvents() {
    el('assetPack')?.addEventListener('change', () => renderCharacters());
    el('assetCharacter')?.addEventListener('change', updateSelectionSummary);
    el('saveConfigBtn')?.addEventListener('click', () => saveConfig().catch(() => {}));
    el('prepareAssetBtn')?.addEventListener('click', prepareAssets);
    el('testSpinBtn')?.addEventListener('click', testSpin);
    el('previewTtsBtn')?.addEventListener('click', previewTts);
    el('testAnimationBtn')?.addEventListener('click', testAnimation);
    el('refreshStatusBtn')?.addEventListener('click', refreshStatus);
    el('copyLocalOverlayUrl')?.addEventListener('click', () => copyField('localOverlayUrl'));
    el('copyViewerBarUrl')?.addEventListener('click', () => copyField('viewerBarUrl'));
    el('refreshManualSetsBtn')?.addEventListener('click', loadManualSets);
    el('manualUploadBtn')?.addEventListener('click', uploadManualSet);
    el('manualAssignBtn')?.addEventListener('click', assignManualSet);
    el('saveAdvancedConfigBtn')?.addEventListener('click', () => saveConfig().catch(() => {}));
    el('refreshCacheBtn')?.addEventListener('click', loadCache);
    el('clearCacheBtn')?.addEventListener('click', clearCache);
    el('loadViewerBarBtn')?.addEventListener('click', loadViewerBar);
    el('saveViewerBarBtn')?.addEventListener('click', saveViewerBar);
    el('refreshLogsBtn')?.addEventListener('click', loadLogs);
    el('advancedSettings')?.addEventListener('toggle', event => {
      if (!event.target.open) return;
      loadManualSets();
      loadCache();
      loadViewerBar();
      loadLogs();
    });
  }

  async function initialize() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    setOverlayUrls();
    try {
      await loadConfig();
    } catch (error) {
      showError(error, { toast: true });
    }
    await refreshStatus({ quiet: true });
  }

  document.addEventListener('DOMContentLoaded', initialize);
})();
