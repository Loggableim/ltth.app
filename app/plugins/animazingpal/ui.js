// AnimazingPal UI JavaScript
const socket = io();
let currentConfig = {};
let animazeData = {};
let platformData = {};
let currentPlatformState = null;
let supportedPlatforms = [];
let viewerbaseState = null;
let giftCatalog = [];
let isConnected = false;
let latestStatus = null;
let animazingPalAudioUnlocked = false;
let pendingAnimazingPalTTS = [];
let animazingPalSinkWarningShown = false;
const animazingPalStreamingBuffers = new Map();
const ALLOWED_ANIMAZINGPAL_TTS_SOURCES = new Set([
  'animazingpal-host-speech-output'
]);

function isAnimazingPalTTSSource(data = {}) {
  const source = String(data?.source || '').toLowerCase();
  return ALLOWED_ANIMAZINGPAL_TTS_SOURCES.has(source);
}

window.animazingPalTTSPlaybackState = {
  status: 'idle',
  lastStartedAt: null,
  lastEndedAt: null,
  lastError: null,
  lastRouting: null,
  lastItem: null
};

// Toast queue for sequential messages
let toastQueue = [];
let toastShowing = false;

function translate(key, fallback, params = {}) {
  if (window.i18n?.initialized) {
    const translated = window.i18n.t(key, params);
    return translated === key ? fallback : translated;
  }
  return fallback;
}

function translateRuntime(key, fallback, params = {}) {
  const fullKey = key.startsWith('plugins.animazingpal.')
    ? key
    : `plugins.animazingpal.runtime.${key}`;
  return translate(fullKey, fallback, params);
}

function runtimeError(message, fallback) {
  return translateRuntime('plugins.animazingpal.runtime.toast.backend_error', fallback, { message: message || '' });
}

function runtimeEmptyMarkup(key, fallback, className = 'text-gray-400') {
  return `<p class="${className}">${escapeHtml(translateRuntime(key, fallback))}</p>`;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  if (window.i18n) {
    await window.i18n.init();
    window.i18n.updateDOM();
    window.i18n.onLanguageChange(() => {
      if (latestStatus) updateStatus(latestStatus);
    });
  }

  fetchStatus();
  loadPersonalities();
  loadGiftCatalog();
  
  // Socket events
  socket.on('animazingpal:status', (data) => {
    updateStatus(data);
  });
  
  socket.on('animazingpal:data-refreshed', (data) => {
    platformData = data || {};
    animazeData = platformData;
    updateAnimazeDataUI();
  });
  
  socket.on('tts:play', (data) => {
    if (!isAnimazingPalTTSSource(data)) return;
    playAnimazingPalTTS(data);
  });

  socket.on('tts:stream:chunk', (data) => {
    if (!isAnimazingPalTTSSource(data)) return;
    handleAnimazingPalStreamChunk(data);
  });

  socket.on('tts:stream:end', (data) => {
    if (!isAnimazingPalTTSSource(data)) return;
    handleAnimazingPalStreamEnd(data);
  });

  socket.on('tts:playback:error', (data) => {
    recordAnimazingPalTTSPlayback('error', {
      error: data?.error || data?.message || 'TTS playback error',
      item: data
    });
  });

  window.addEventListener('audio-unlocked', () => {
    animazingPalAudioUnlocked = true;
    flushPendingAnimazingPalTTS();
  });

  // Set up event listeners
  setupEventListeners();
});

function recordAnimazingPalTTSPlayback(status, details = {}) {
  const current = window.animazingPalTTSPlaybackState || {};
  const next = {
    ...current,
    status,
    lastItem: details.item || current.lastItem || null
  };

  if (status === 'started') {
    next.lastStartedAt = new Date().toISOString();
    next.lastError = null;
  }
  if (status === 'ended') {
    next.lastEndedAt = new Date().toISOString();
  }
  if (status === 'error') {
    next.lastError = String(details.error?.message || details.error || 'Unknown playback error');
  }
  if (details.routing) {
    next.lastRouting = details.routing;
  }

  window.animazingPalTTSPlaybackState = next;
  window.dispatchEvent(new CustomEvent('animazingpal:tts-playback-state', { detail: next }));
  return next;
}

function setupEventListeners() {
  const unlockOnInteraction = () => {
    unlockAnimazingPalAudio().catch(err => console.warn('[AnimazingPal] Audio unlock failed:', err));
  };

  document.body.addEventListener('click', unlockOnInteraction, { once: true });
  document.body.addEventListener('keydown', unlockOnInteraction, { once: true });

  // Connection button
  const connectBtn = document.getElementById('connectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', toggleConnection);
  }

  // Refresh buttons
  const refreshButtons = document.querySelectorAll('[data-action="refresh"]');
  refreshButtons.forEach(btn => btn.addEventListener('click', refreshData));

  // Tab switching
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Quick actions
  const calibrateBtn = document.querySelector('[data-action="calibrate"]');
  if (calibrateBtn) calibrateBtn.addEventListener('click', calibrateTracker);

  const broadcastStartBtn = document.querySelector('[data-action="broadcast-start"]');
  if (broadcastStartBtn) broadcastStartBtn.addEventListener('click', () => toggleBroadcast(true));

  const broadcastStopBtn = document.querySelector('[data-action="broadcast-stop"]');
  if (broadcastStopBtn) broadcastStopBtn.addEventListener('click', () => toggleBroadcast(false));

  const testBtn = document.querySelector('[data-action="test-connection"]');
  if (testBtn) testBtn.addEventListener('click', testConnection);

  // Settings
  const saveSettingsBtn = document.querySelector('[data-action="save-settings"]');
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

  const applyStreamReadyPresetBtn = document.querySelector('[data-action="apply-stream-ready-preset"]');
  if (applyStreamReadyPresetBtn) applyStreamReadyPresetBtn.addEventListener('click', applyStreamReadyPreset);

  const saveViewerbaseBtn = document.querySelector('[data-action="save-viewerbase"]');
  if (saveViewerbaseBtn) saveViewerbaseBtn.addEventListener('click', saveViewerbaseSettings);

  const syncViewerbaseBtn = document.querySelector('[data-action="sync-viewerbase"]');
  if (syncViewerbaseBtn) syncViewerbaseBtn.addEventListener('click', syncViewerbaseNow);

  const settingsPlatform = document.getElementById('settingsPlatform');
  if (settingsPlatform) {
    settingsPlatform.addEventListener('change', () => {
      togglePlatformSettings(settingsPlatform.value);
      updateDynamicActionTypes();
      updatePlatformActionHints();
    });
  }

  // Event actions
  ['follow', 'share', 'subscribe', 'like', 'gift', 'chat'].forEach(event => {
    const enabled = document.getElementById(`${event}Enabled`);
    if (enabled) enabled.addEventListener('change', () => updateEventAction(event));

    const actionType = document.getElementById(`${event}ActionType`);
    if (actionType) actionType.addEventListener('change', () => updateEventAction(event));

    const actionValue = document.getElementById(`${event}ActionValue`);
    if (actionValue) actionValue.addEventListener('change', () => updateEventAction(event));

    const chatMessage = document.getElementById(`${event}ChatMessage`);
    if (chatMessage) chatMessage.addEventListener('change', () => updateEventAction(event));

    const threshold = document.getElementById(`${event}Threshold`);
    if (threshold) threshold.addEventListener('change', () => updateEventAction(event));

    const echoOverride = document.getElementById(`${event}EchoOverride`);
    if (echoOverride) echoOverride.addEventListener('change', () => updateEventAction(event));
  });

  // Gift mappings
  const addGiftMappingBtn = document.querySelector('[data-action="add-gift-mapping"]');
  if (addGiftMappingBtn) addGiftMappingBtn.addEventListener('click', addGiftMapping);
  const giftMappingActionType = document.getElementById('giftMappingActionType');
  if (giftMappingActionType) giftMappingActionType.addEventListener('change', populateGiftMappingForm);

  // Memory search
  const memorySearchBtn = document.getElementById('memorySearchBtn');
  if (memorySearchBtn) memorySearchBtn.addEventListener('click', searchMemories);

  const memoryReloadBtn = document.getElementById('memoryReloadBtn');
  if (memoryReloadBtn) memoryReloadBtn.addEventListener('click', loadAllMemories);

  const memoryArchiveBtn = document.getElementById('memoryArchiveBtn');
  if (memoryArchiveBtn) memoryArchiveBtn.addEventListener('click', archiveOldMemories);

  const memorySearchInput = document.getElementById('memorySearchInput');
  if (memorySearchInput) {
    memorySearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') searchMemories();
    });
  }

  // Personality settings
  const savePersonalityBtn = document.getElementById('savePersonalityBtn');
  if (savePersonalityBtn) savePersonalityBtn.addEventListener('click', savePersonalitySettings);

  const activePersonality = document.getElementById('activePersonality');
  if (activePersonality) {
    activePersonality.addEventListener('change', async () => {
      const name = activePersonality.value;
      if (name) {
        try {
          const response = await fetch('/api/animazingpal/brain/personality/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
          });
          const result = await response.json();
          if (result.success) {
            showToast(translateRuntime('plugins.animazingpal.runtime.toast.personality_switched', 'Persönlichkeit gewechselt'));
          }
        } catch (error) {
          showToast(runtimeError(error.message, 'Fehler beim Wechseln der Persönlichkeit'), 'error');
        }
      }
    });
  }

  // Logic Matrix
  const addRuleBtn = document.getElementById('addRuleBtn');
  if (addRuleBtn) addRuleBtn.addEventListener('click', addLogicMatrixRule);

  const testLogicMatrixBtn = document.getElementById('testLogicMatrixBtn');
  if (testLogicMatrixBtn) testLogicMatrixBtn.addEventListener('click', testLogicMatrix);

  // Persona Management
  const createPersonaBtn = document.getElementById('createPersonaBtn');
  if (createPersonaBtn) createPersonaBtn.addEventListener('click', createPersona);

  const editPersonaBtn = document.getElementById('editPersonaBtn');
  if (editPersonaBtn) editPersonaBtn.addEventListener('click', editPersonaFromSelector);

  const deletePersonaBtn = document.getElementById('deletePersonaBtn');
  if (deletePersonaBtn) deletePersonaBtn.addEventListener('click', deletePersonaFromSelector);
}

async function fetchStatus() {
  try {
    const response = await fetch('/api/animazingpal/status');
    const data = await response.json();
    if (data.success) {
      updateStatus(data);
    }
  } catch (error) {
    console.error('Failed to fetch status:', error);
  }
}

function updateStatus(data) {
  latestStatus = data;
  isConnected = data.isConnected;
  currentConfig = data.config || {};
  currentPlatformState = data.platformState || null;
  supportedPlatforms = data.supportedPlatforms || currentConfig.platform?.supported || [];
  platformData = data.platformData || data.animazeData || {};
  animazeData = platformData;
  viewerbaseState = data.viewerbase || viewerbaseState;

  const activePlatformKey = currentPlatformState?.key || currentConfig.platform?.active || 'animaze';
  const activePlatformDefinition = currentPlatformState?.definition || currentConfig.platform?.definition || { label: 'Animaze', actions: ['emote', 'specialAction', 'pose', 'idle'], chat: true };
  const activeProfile = currentConfig.platform?.profile || {};
  
  // Update connection status
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const connectBtn = document.getElementById('connectBtn');
  const connectionStatus = document.getElementById('connectionStatus');
  
  if (isConnected) {
    statusDot.className = 'status-dot status-connected';
    statusText.textContent = translateRuntime('plugins.animazingpal.runtime.connection.connected', 'Verbunden');
    connectBtn.textContent = translateRuntime('plugins.animazingpal.runtime.connection.disconnect', 'Trennen');
    connectBtn.className = 'btn btn-danger';
    connectionStatus.textContent = translateRuntime('plugins.animazingpal.runtime.connection.connected', 'Verbunden');
    connectionStatus.className = 'text-green-500';
  } else {
    statusDot.className = 'status-dot status-disconnected';
    statusText.textContent = translateRuntime('plugins.animazingpal.runtime.connection.disconnected', 'Nicht verbunden');
    connectBtn.textContent = translateRuntime('plugins.animazingpal.runtime.connection.connect', 'Verbinden');
    connectBtn.className = 'btn btn-primary';
    connectionStatus.textContent = translateRuntime('plugins.animazingpal.runtime.connection.disconnected', 'Nicht verbunden');
    connectionStatus.className = 'text-red-500';
  }
  
  // Update connection info
  const host = activeProfile.host || currentConfig.host || '127.0.0.1';
  const port = activeProfile.port || currentConfig.port || 9000;
  document.getElementById('connectionHost').textContent = `${host}:${port}`;
  document.getElementById('avatarCount').textContent = getPlatformAvatarCount();
  document.getElementById('emoteCount').textContent = getPlatformEmoteCount();
  const platformNameEl = document.getElementById('activePlatformName');
  if (platformNameEl) {
    platformNameEl.textContent = activePlatformDefinition.label || activePlatformKey;
  }

  updateViewerbaseStatusUI();
  
  // Update current avatar info
  const currentAvatarInfo = document.getElementById('currentAvatarInfo');
  const currentAvatar = getCurrentAvatarLike(activePlatformKey);
  if (currentAvatar && currentAvatarInfo) {
    currentAvatarInfo.innerHTML = renderCurrentPlatformInfo(activePlatformKey, currentAvatar);
  } else if (currentAvatarInfo) {
    currentAvatarInfo.textContent = translate(
      'plugins.animazingpal.ui.messages.no_avatar_information',
      'Keine Avatar-Informationen verfügbar'
    );
  }
  
  // Update settings form
  const settingsPlatform = document.getElementById('settingsPlatform');
  if (settingsPlatform) {
    ensurePlatformOptions(settingsPlatform, supportedPlatforms, activePlatformKey);
  }
  document.getElementById('settingsHost').value = host;
  document.getElementById('settingsPort').value = port;
  document.getElementById('settingsAutoConnect').checked = activeProfile.autoConnect !== false;
  document.getElementById('settingsReconnect').checked = activeProfile.reconnectOnDisconnect !== false;
  document.getElementById('settingsReconnectDelay').value = activeProfile.reconnectDelay ?? currentConfig.reconnectDelay ?? 5000;
  document.getElementById('settingsMaxReconnectAttempts').value = activeProfile.maxReconnectAttempts ?? currentConfig.maxReconnectAttempts ?? 0;
  document.getElementById('settingsConnectionTimeoutMs').value = activeProfile.connectionTimeoutMs ?? currentConfig.connectionTimeoutMs ?? 10000;
  document.getElementById('settingsVerbose').checked = activeProfile.verboseLogging || currentConfig.verboseLogging || false;
  const settingsAuthToken = document.getElementById('settingsAuthToken');
  if (settingsAuthToken) {
    settingsAuthToken.value = activeProfile.authToken || '';
    settingsAuthToken.placeholder = activeProfile.authTokenConfigured
      ? translateRuntime('plugins.animazingpal.runtime.placeholder.token_configured', 'Token gespeichert - leer lassen, um ihn beizubehalten')
      : translateRuntime('plugins.animazingpal.runtime.placeholder.vtube_token_optional', 'Optional: nur für VTube Studio');
  }
  togglePlatformSettings(activePlatformKey);
  updateViewerbaseConfigForm(currentConfig.viewerbase || {});
  updateVrchatIntegrationForm(currentConfig.vrchatIntegration || {});
  
  // Update event actions
  updateEventActionUI('follow');
  updateEventActionUI('share');
  updateEventActionUI('subscribe');
  updateEventActionUI('like');
  updateEventActionUI('gift');
  updateEventActionUI('chat');
  
  // Update Override Behaviors UI
  updateOverridesUI(data.overrideBehaviors || []);
  
  // Update Animaze data UI
  updateAnimazeDataUI();
  renderGiftMappings();
  populateGiftMappingForm();
  updateDynamicActionTypes();
  updatePlatformActionHints();
}

function getPlatformKey() {
  return currentPlatformState?.key || currentConfig.platform?.active || 'animaze';
}

function getPlatformDefinition() {
  return currentPlatformState?.definition || supportedPlatforms.find(platform => platform.key === getPlatformKey()) || {
    key: 'animaze',
    label: 'Animaze',
    description: 'Legacy Animaze WebSocket integration',
    actions: ['emote', 'specialAction', 'pose', 'idle'],
    chat: true
  };
}

function getPlatformAvatarCount() {
  const key = getPlatformKey();
  if (key === 'vtube-studio') {
    return platformData.availableModels?.length || 0;
  }
  if (key === 'vseeface') {
    return platformData.expressions?.length || 0;
  }
  return platformData.avatars?.length || 0;
}

function getPlatformEmoteCount() {
  const key = getPlatformKey();
  if (key === 'vtube-studio') {
    return platformData.hotkeys?.length || 0;
  }
  if (key === 'vseeface') {
    return platformData.motions?.length || 0;
  }
  return platformData.emotes?.length || 0;
}

function getCurrentAvatarLike(platformKey) {
  if (platformKey === 'vtube-studio') {
    return platformData.currentModel || null;
  }
  if (platformKey === 'vseeface') {
    return platformData.currentExpression || platformData.currentMotion ? {
      friendlyName: platformData.currentExpression || platformData.currentMotion,
      description: 'VSeeFace status'
    } : null;
  }
  return platformData.currentAvatar || null;
}

function renderCurrentPlatformInfo(platformKey, value) {
  if (platformKey === 'vtube-studio') {
    return `
      <div class="space-y-2">
        <div><strong>Model:</strong> ${escapeHtml(value.modelName || value.modelID || value.vtsModelName || 'Unbekannt')}</div>
        ${value.modelID ? `<div><strong>ID:</strong> ${escapeHtml(String(value.modelID))}</div>` : ''}
      </div>
    `;
  }

  if (platformKey === 'vseeface') {
    return `
      <div class="space-y-2">
        <div><strong>Expression:</strong> ${escapeHtml(platformData.currentExpression || 'Keine')}</div>
        <div><strong>Motion:</strong> ${escapeHtml(platformData.currentMotion || 'Keine')}</div>
      </div>
    `;
  }

  return `
    <div class="space-y-2">
      <div><strong>Name:</strong> ${escapeHtml(value.friendlyName || value.itemName || 'Unbekannt')}</div>
      ${value.description ? `<div><strong>Beschreibung:</strong> ${escapeHtml(value.description)}</div>` : ''}
      ${value.props?.length ? `<div><strong>Props:</strong> ${escapeHtml(value.props.join(', '))}</div>` : ''}
    </div>
  `;
}

function ensurePlatformOptions(selectEl, platforms, activeKey) {
  if (!selectEl) return;

  const currentValue = selectEl.value || activeKey;
  selectEl.innerHTML = '';
  (platforms.length ? platforms : [{ key: 'animaze', label: 'Animaze' }]).forEach(platform => {
    const option = document.createElement('option');
    option.value = platform.key;
    option.textContent = platform.label;
    selectEl.appendChild(option);
  });
  selectEl.value = currentValue && Array.from(selectEl.options).some(option => option.value === currentValue)
    ? currentValue
    : activeKey;
}

function getAllowedActionTypes(platformKey = getPlatformKey()) {
  const definition = supportedPlatforms.find(platform => platform.key === platformKey) || getPlatformDefinition();
  const types = [...(definition.actions || [])];
  if (platformKey === 'vtube-studio' && !types.includes('loadAvatar')) {
    types.push('loadAvatar');
  }
  if (definition.chat) {
    types.push('chatMessage');
  }
  return types;
}

function getActionLabel(actionType) {
  const labels = {
    emote: translateRuntime('plugins.animazingpal.runtime.action.emote', 'Emote'),
    specialAction: translateRuntime('plugins.animazingpal.runtime.action.special_action', 'Spezialaktion'),
    pose: translateRuntime('plugins.animazingpal.runtime.action.pose', 'Pose'),
    idle: translateRuntime('plugins.animazingpal.runtime.action.idle', 'Idle Animation'),
    chatMessage: translateRuntime('plugins.animazingpal.runtime.action.chat_message', 'Host-TTS Vorlage'),
    hotkey: translateRuntime('plugins.animazingpal.runtime.action.hotkey', 'Hotkey'),
    expression: translateRuntime('plugins.animazingpal.runtime.action.expression', 'Expression'),
    motion: translateRuntime('plugins.animazingpal.runtime.action.motion', 'Motion'),
    reset: translateRuntime('plugins.animazingpal.runtime.action.reset', 'Reset'),
    loadAvatar: translateRuntime('plugins.animazingpal.runtime.action.load_avatar', 'Avatar/Model laden')
  };
  return labels[actionType] || actionType;
}

function normalizeActionValue(actionType, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return null;
  }

  if (['specialAction', 'pose', 'idle'].includes(actionType)) {
    const parsed = parseInt(rawValue, 10);
    return Number.isNaN(parsed) ? rawValue : parsed;
  }

  return rawValue;
}

function togglePlatformSettings(platformKey) {
  const authRow = document.getElementById('settingsAuthTokenRow');
  const verboseRow = document.getElementById('settingsVerboseRow');
  if (authRow) authRow.classList.toggle('hidden', platformKey !== 'vtube-studio');
  if (verboseRow) verboseRow.classList.toggle('hidden', platformKey !== 'animaze');
}

function updatePlatformActionHints() {
  const platformHint = document.getElementById('platformActionHint');
  if (!platformHint) return;

  const definition = getPlatformDefinition();
  platformHint.textContent = `${definition.label}: ${definition.description || ''}`.trim();
}

function updateViewerbaseConfigForm(viewerbaseConfig = {}) {
  const externalSync = viewerbaseConfig.externalSync || {};
  const setChecked = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  };
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  };

  setChecked('viewerbaseEnabled', viewerbaseConfig.enabled !== false);
  setChecked('viewerbaseShowInUI', viewerbaseConfig.showInUI !== false);
  setChecked('viewerbaseSyncEnabled', externalSync.enabled || false);
  setValue('viewerbaseEndpointUrl', externalSync.endpointUrl || '');
  setValue('viewerbaseSyncTimeoutMs', externalSync.timeoutMs ?? 5000);
  setValue('viewerbaseRetryLimit', externalSync.retryLimit ?? 3);
  setValue('viewerbaseRecentLimit', viewerbaseConfig.recentLimit ?? 12);
  setValue('viewerbaseSupporterLimit', viewerbaseConfig.supporterLimit ?? 10);
  setValue('viewerbaseChatterLimit', viewerbaseConfig.chatterLimit ?? 10);
  setValue('viewerbaseSyncOnEvents', Array.isArray(viewerbaseConfig.syncOnEvents) ? viewerbaseConfig.syncOnEvents.join(', ') : '');

  const authToken = document.getElementById('viewerbaseAuthToken');
  if (authToken) {
    authToken.value = '';
    authToken.placeholder = externalSync.authTokenConfigured
      ? translateRuntime('plugins.animazingpal.runtime.placeholder.token_configured', 'Token gespeichert - leer lassen, um ihn beizubehalten')
      : translateRuntime('plugins.animazingpal.runtime.placeholder.optional', 'Optional');
  }
}

function updateVrchatIntegrationForm(vrchatConfig = {}) {
  const setChecked = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  };
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  };

  setChecked('vrchatBridgeEnabled', vrchatConfig.enabled !== false && !!vrchatConfig.enabled);
  setValue('vrchatTargetPluginId', vrchatConfig.targetPluginId || 'osc-bridge');
  setChecked('vrchatForwardChat', vrchatConfig.forwardChatToChatbox !== false);
  setChecked('vrchatForwardBrain', vrchatConfig.forwardBrainResponses !== false);
  setChecked('vrchatForwardStandalone', vrchatConfig.forwardStandaloneResponses !== false);
  setChecked('vrchatSendTypingIndicator', vrchatConfig.sendTypingIndicator !== false);
}

function updateViewerbaseStatusUI() {
  const state = viewerbaseState || currentConfig.viewerbase?.summary || null;
  if (!state) {
    return;
  }

  const summary = state.summary || state;
  const statistics = summary.statistics || {};
  const viewerCounts = summary.viewerCounts || {};
  const syncState = state.syncState || summary.syncState || {};
  const externalSync = state.externalSync || currentConfig.viewerbase?.externalSync || {};

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = value ?? '-';
    }
  };

  setText('viewerbaseStreamerId', summary.streamerId || statistics.streamerId || '-');
  setText('viewerbaseTotalUsers', viewerCounts.totalUsers ?? statistics.totalUsers ?? 0);
  setText('viewerbaseTotalMemories', viewerCounts.totalMemories ?? statistics.totalMemories ?? 0);
  setText('viewerbaseTotalConversations', viewerCounts.totalConversations ?? statistics.totalConversations ?? 0);
  setText('viewerbaseTotalArchives', viewerCounts.totalArchives ?? statistics.totalArchives ?? 0);
  setText('viewerbaseLastSyncAt', syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleString('de-DE') : '-');
  setText('viewerbaseSyncStatus', syncState.lastStatus || 'idle');
  setText('viewerbaseQueueLength', syncState.queueLength ?? 0);

  const errorEl = document.getElementById('viewerbaseSyncError');
  if (errorEl) {
    if (syncState.lastError) {
      errorEl.classList.remove('hidden');
      errorEl.textContent = syncState.lastError;
    } else {
      errorEl.classList.add('hidden');
      errorEl.textContent = '';
    }
  }

  renderViewerbaseTopSupporters(summary.topSupporters || []);
  renderViewerbaseFrequentChatters(summary.frequentChatters || []);
  renderViewerbaseRecentMemories(summary.recentMemories || []);

  const syncEnabledEl = document.getElementById('viewerbaseSyncEnabled');
  if (syncEnabledEl) {
    syncEnabledEl.checked = !!externalSync.enabled;
  }
}

function renderViewerbaseTopSupporters(entries) {
  const el = document.getElementById('viewerbaseTopSupporters');
  if (!el) return;

  if (!Array.isArray(entries) || entries.length === 0) {
    el.innerHTML = runtimeEmptyMarkup('empty.no_data', 'Keine Daten verfügbar');
    return;
  }

  el.innerHTML = entries.map((entry, index) => `
    <div class="card bg-gray-800">
      <div class="flex justify-between items-start gap-3">
        <div>
          <div class="font-bold">${escapeHtml(entry.displayName || entry.username || translateRuntime('plugins.animazingpal.runtime.viewerbase.user_fallback', `User ${index + 1}`, { number: index + 1 }))}</div>
          <div class="text-xs text-gray-400">@${escapeHtml(entry.username || translateRuntime('plugins.animazingpal.runtime.viewerbase.unknown_user', 'unknown'))}</div>
        </div>
        <div class="text-right text-sm">
          <div>${translateRuntime('plugins.animazingpal.runtime.viewerbase.diamonds', `${Number(entry.total_diamonds || 0).toLocaleString('de-DE')} Diamonds`, { count: Number(entry.total_diamonds || 0).toLocaleString('de-DE') })}</div>
          <div class="text-gray-400">${translateRuntime('plugins.animazingpal.runtime.viewerbase.gifts', `${Number(entry.gift_count || 0)} Gifts`, { count: Number(entry.gift_count || 0) })}</div>
        </div>
      </div>
      <div class="text-xs text-gray-500 mt-2">${translateRuntime('plugins.animazingpal.runtime.viewerbase.streams', `Streams: ${Number(entry.stream_count || 0)}`, { count: Number(entry.stream_count || 0) })}</div>
    </div>
  `).join('');
}

function renderViewerbaseFrequentChatters(entries) {
  const el = document.getElementById('viewerbaseFrequentChatters');
  if (!el) return;

  if (!Array.isArray(entries) || entries.length === 0) {
    el.innerHTML = runtimeEmptyMarkup('empty.no_data', 'Keine Daten verfügbar');
    return;
  }

  el.innerHTML = entries.map((entry, index) => `
    <div class="card bg-gray-800">
      <div class="flex justify-between items-start gap-3">
        <div>
          <div class="font-bold">${escapeHtml(entry.displayName || entry.username || translateRuntime('plugins.animazingpal.runtime.viewerbase.user_fallback', `User ${index + 1}`, { number: index + 1 }))}</div>
          <div class="text-xs text-gray-400">@${escapeHtml(entry.username || translateRuntime('plugins.animazingpal.runtime.viewerbase.unknown_user', 'unknown'))}</div>
        </div>
        <div class="text-right text-sm">
          <div>${translateRuntime('plugins.animazingpal.runtime.viewerbase.interactions', `${Number(entry.interaction_count || 0)} Interactions`, { count: Number(entry.interaction_count || 0) })}</div>
          <div class="text-gray-400">${translateRuntime('plugins.animazingpal.runtime.viewerbase.streams', `${Number(entry.stream_count || 0)} Streams`, { count: Number(entry.stream_count || 0) })}</div>
        </div>
      </div>
      <div class="text-xs text-gray-500 mt-2">${escapeHtml(entry.last_topic || translateRuntime('plugins.animazingpal.runtime.viewerbase.no_last_topic', 'Kein letztes Thema'))}</div>
    </div>
  `).join('');
}

function renderViewerbaseRecentMemories(entries) {
  const el = document.getElementById('viewerbaseRecentMemories');
  if (!el) return;

  if (!Array.isArray(entries) || entries.length === 0) {
    el.innerHTML = runtimeEmptyMarkup('empty.no_data', 'Keine Daten verfügbar');
    return;
  }

  el.innerHTML = entries.map((entry) => {
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    const createdAt = entry.created_at ? new Date(entry.created_at).toLocaleString('de-DE') : '-';
    const context = entry.context && typeof entry.context === 'object'
      ? JSON.stringify(entry.context)
      : entry.context;
    return `
      <div class="card bg-gray-800">
        <div class="flex justify-between items-start gap-3">
          <div>
            <div class="font-bold">${escapeHtml(entry.memory_type || translateRuntime('plugins.animazingpal.runtime.viewerbase.general_memory', 'general'))}</div>
            <div class="text-xs text-gray-400">${escapeHtml(createdAt)}${entry.source_user ? ` · @${escapeHtml(entry.source_user)}` : ''}</div>
          </div>
          <div class="text-sm text-gray-300">${Number(entry.importance || 0).toFixed(2)}</div>
        </div>
        <p class="mt-2 text-white">${escapeHtml(entry.content || '')}</p>
        ${context ? `<p class="text-xs text-gray-500 mt-1">${escapeHtml(context)}</p>` : ''}
        ${tags.length ? `<div class="flex flex-wrap gap-2 mt-2">${tags.map((tag) => `<span class="text-xs bg-gray-700 px-2 py-1 rounded">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      </div>
    `;
  }).join('');
}

async function loadViewerbase() {
  try {
    const response = await fetch('/api/animazingpal/viewerbase');
    const data = await response.json();
    if (data.success) {
      viewerbaseState = data.viewerbase || null;
      updateViewerbaseStatusUI();
    }
  } catch (error) {
    console.error('Failed to load viewerbase:', error);
    showToast(runtimeError(error.message, 'Viewerbase konnte nicht geladen werden'), 'error');
  }
}

async function saveViewerbaseSettings() {
  const viewerbaseConfig = {
    enabled: document.getElementById('viewerbaseEnabled')?.checked !== false,
    showInUI: document.getElementById('viewerbaseShowInUI')?.checked !== false,
    recentLimit: parseInt(document.getElementById('viewerbaseRecentLimit')?.value, 10) || 12,
    supporterLimit: parseInt(document.getElementById('viewerbaseSupporterLimit')?.value, 10) || 10,
    chatterLimit: parseInt(document.getElementById('viewerbaseChatterLimit')?.value, 10) || 10,
    syncOnEvents: (document.getElementById('viewerbaseSyncOnEvents')?.value || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    externalSync: {
      enabled: document.getElementById('viewerbaseSyncEnabled')?.checked || false,
      endpointUrl: document.getElementById('viewerbaseEndpointUrl')?.value.trim() || '',
      timeoutMs: parseInt(document.getElementById('viewerbaseSyncTimeoutMs')?.value, 10) || 5000,
      retryLimit: Number.isNaN(parseInt(document.getElementById('viewerbaseRetryLimit')?.value, 10))
        ? 3
        : parseInt(document.getElementById('viewerbaseRetryLimit')?.value, 10),
      includeRecentMemories: true,
      includeTopSupporters: true,
      includeFrequentChatters: true
    }
  };

  const authToken = document.getElementById('viewerbaseAuthToken')?.value.trim();
  if (authToken) {
    viewerbaseConfig.externalSync.authToken = authToken;
  }

  try {
    const response = await fetch('/api/animazingpal/viewerbase/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewerbase: viewerbaseConfig })
    });
    const data = await response.json();
    if (!data.success) {
      showToast(runtimeError(data.error, `Viewerbase konnte nicht gespeichert werden: ${data.error || 'Unbekannter Fehler'}`), 'error');
      return;
    }

    viewerbaseState = data.viewerbase || viewerbaseState;
    currentConfig.viewerbase = data.config?.viewerbase || currentConfig.viewerbase;
    updateViewerbaseConfigForm(currentConfig.viewerbase || viewerbaseConfig);
    updateViewerbaseStatusUI();
    showToast(translateRuntime('plugins.animazingpal.runtime.toast.viewerbase_saved', 'Viewerbase-Einstellungen gespeichert'));
  } catch (error) {
    console.error('Failed to save viewerbase settings:', error);
    showToast(runtimeError(error.message, 'Viewerbase konnte nicht gespeichert werden'), 'error');
  }
}

async function syncViewerbaseNow() {
  try {
    const response = await fetch('/api/animazingpal/viewerbase/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'manual', immediate: true })
    });
    const data = await response.json();
    if (!data.success) {
      showToast(runtimeError(data.error, `Viewerbase Sync fehlgeschlagen: ${data.error || 'Unbekannter Fehler'}`), 'error');
      return;
    }

    viewerbaseState = data.viewerbase || viewerbaseState;
    updateViewerbaseStatusUI();
    showToast(translateRuntime('plugins.animazingpal.runtime.toast.viewerbase_sync_started', 'Viewerbase Sync ausgelöst'));
  } catch (error) {
    console.error('Failed to sync viewerbase:', error);
    showToast(runtimeError(error.message, 'Viewerbase Sync konnte nicht ausgelöst werden'), 'error');
  }
}

function updatePlatformSectionTitles() {
  const platformKey = getPlatformKey();
  const titles = {
    animaze: {
      emotes: translateRuntime('plugins.animazingpal.runtime.section.animaze.emotes', 'Emotes'),
      specialActions: translateRuntime('plugins.animazingpal.runtime.section.animaze.special_actions', 'Spezialaktionen'),
      poses: translateRuntime('plugins.animazingpal.runtime.section.animaze.poses', 'Posen'),
      idles: translateRuntime('plugins.animazingpal.runtime.section.animaze.idles', 'Idle Animationen')
    },
    'vtube-studio': {
      emotes: translateRuntime('plugins.animazingpal.runtime.section.vtube_studio.emotes', 'Hotkeys'),
      specialActions: translateRuntime('plugins.animazingpal.runtime.section.vtube_studio.special_actions', 'Modelle'),
      poses: translateRuntime('plugins.animazingpal.runtime.section.vtube_studio.poses', 'Aktionen'),
      idles: translateRuntime('plugins.animazingpal.runtime.section.vtube_studio.idles', 'Nicht unterstützt')
    },
    vseeface: {
      emotes: translateRuntime('plugins.animazingpal.runtime.section.vseeface.emotes', 'Expressions'),
      specialActions: translateRuntime('plugins.animazingpal.runtime.section.vseeface.special_actions', 'Motions'),
      poses: translateRuntime('plugins.animazingpal.runtime.section.vseeface.poses', 'Reset'),
      idles: translateRuntime('plugins.animazingpal.runtime.section.vseeface.idles', 'Nicht unterstützt')
    }
  };
  const titleSet = titles[platformKey] || titles.animaze;
  const emotesTitle = document.getElementById('emotesSectionTitle');
  const specialActionsTitle = document.getElementById('specialActionsSectionTitle');
  const posesTitle = document.getElementById('posesSectionTitle');
  const idlesTitle = document.getElementById('idlesSectionTitle');
  if (emotesTitle) emotesTitle.textContent = titleSet.emotes;
  if (specialActionsTitle) specialActionsTitle.textContent = titleSet.specialActions;
  if (posesTitle) posesTitle.textContent = titleSet.poses;
  if (idlesTitle) idlesTitle.textContent = titleSet.idles;
}

function updateAnimazeDataUI() {
  const platformKey = getPlatformKey();
  updatePlatformSectionTitles();

  // Update emotes list
  const emotesList = document.getElementById('emotesList');
  const specialActionsList = document.getElementById('specialActionsList');
  const posesList = document.getElementById('posesList');
  const idlesList = document.getElementById('idlesList');

  if (platformKey === 'vtube-studio') {
    if (platformData.hotkeys?.length > 0) {
      emotesList.innerHTML = platformData.hotkeys.map(hotkey => `
        <button class="grid-item text-sm" data-action="trigger-emote" data-value="${escapeHtml(hotkey.hotkeyID || hotkey.name || hotkey.hotkeyName || '')}">
          ${escapeHtml(hotkey.name || hotkey.hotkeyName || hotkey.description || hotkey.hotkeyID || 'Hotkey')}
        </button>
      `).join('');
      emotesList.querySelectorAll('[data-action="trigger-emote"]').forEach(btn => {
        btn.addEventListener('click', () => triggerEmote(btn.dataset.value));
      });
    } else {
      emotesList.innerHTML = runtimeEmptyMarkup('empty.no_hotkeys', 'Keine Hotkeys verfügbar', 'text-gray-400 col-span-2');
    }

    if (platformData.availableModels?.length > 0) {
      specialActionsList.innerHTML = platformData.availableModels.map(model => `
        <button class="grid-item text-sm" data-action="load-avatar" data-value="${escapeHtml(model.modelID || model.modelName || '')}">
          ${escapeHtml(model.modelName || model.vtsModelName || model.modelID || 'Model')}
        </button>
      `).join('');
      specialActionsList.querySelectorAll('[data-action="load-avatar"]').forEach(btn => {
        btn.addEventListener('click', () => loadAvatar(btn.dataset.value));
      });
    } else {
      specialActionsList.innerHTML = runtimeEmptyMarkup('empty.no_models', 'Keine Modelle verfügbar', 'text-gray-400 col-span-2');
    }

    posesList.innerHTML = runtimeEmptyMarkup('empty.vtube_uses_hotkeys', 'VTube Studio nutzt Hotkeys statt Posen', 'text-gray-400 col-span-2');
    idlesList.innerHTML = runtimeEmptyMarkup('empty.idles_unsupported', 'Idle-Animationen werden hier nicht unterstützt', 'text-gray-400 col-span-2');
  } else if (platformKey === 'vseeface') {
    if (platformData.expressions?.length > 0) {
      emotesList.innerHTML = platformData.expressions.map(expression => `
        <button class="grid-item text-sm" data-action="trigger-emote" data-value="${escapeHtml(expression)}">
          ${escapeHtml(expression)}
        </button>
      `).join('');
      emotesList.querySelectorAll('[data-action="trigger-emote"]').forEach(btn => {
        btn.addEventListener('click', () => triggerEmote(btn.dataset.value));
      });
    } else {
      emotesList.innerHTML = runtimeEmptyMarkup('empty.no_expressions', 'Keine Expressions verfügbar', 'text-gray-400 col-span-2');
    }

    if (platformData.motions?.length > 0) {
      specialActionsList.innerHTML = platformData.motions.map(motion => `
        <button class="grid-item text-sm" data-action="trigger-special" data-value="${escapeHtml(motion)}">
          ${escapeHtml(motion)}
        </button>
      `).join('');
      specialActionsList.querySelectorAll('[data-action="trigger-special"]').forEach(btn => {
        btn.addEventListener('click', () => triggerSpecialAction(btn.dataset.value));
      });
    } else {
      specialActionsList.innerHTML = runtimeEmptyMarkup('empty.no_motions', 'Keine Motions verfügbar', 'text-gray-400 col-span-2');
    }

    posesList.innerHTML = `
      <button class="grid-item text-sm" data-action="trigger-reset" data-value="reset">
        ${escapeHtml(translateRuntime('plugins.animazingpal.runtime.action.reset', 'Reset'))}
      </button>
    `;
    posesList.querySelectorAll('[data-action="trigger-reset"]').forEach(btn => {
      btn.addEventListener('click', () => triggerIdle(btn.dataset.value));
    });

    idlesList.innerHTML = runtimeEmptyMarkup('empty.idles_unsupported', 'Idle-Animationen werden hier nicht unterstützt', 'text-gray-400 col-span-2');
  } else {
    if (platformData.emotes?.length > 0) {
      emotesList.innerHTML = platformData.emotes.map(e => `
        <button class="grid-item text-sm" data-action="trigger-emote" data-value="${escapeHtml(e.itemName || '')}">
          ${escapeHtml(e.friendlyName || e.itemName || '')}
        </button>
      `).join('');
      emotesList.querySelectorAll('[data-action="trigger-emote"]').forEach(btn => {
        btn.addEventListener('click', () => triggerEmote(btn.dataset.value));
      });
    } else {
      emotesList.innerHTML = runtimeEmptyMarkup('empty.no_emotes', 'Keine Emotes verfügbar', 'text-gray-400 col-span-2');
    }
    
    if (platformData.specialActions?.length > 0) {
      specialActionsList.innerHTML = platformData.specialActions.map(a => `
        <button class="grid-item text-sm" data-action="trigger-special" data-value="${a.index}">
          ${escapeHtml(a.animName || '')}
        </button>
      `).join('');
      specialActionsList.querySelectorAll('[data-action="trigger-special"]').forEach(btn => {
        btn.addEventListener('click', () => triggerSpecialAction(parseInt(btn.dataset.value, 10)));
      });
    } else {
      specialActionsList.innerHTML = runtimeEmptyMarkup('empty.no_special_actions', 'Keine Spezialaktionen verfügbar', 'text-gray-400 col-span-2');
    }
    
    if (platformData.poses?.length > 0) {
      posesList.innerHTML = platformData.poses.map(p => `
        <button class="grid-item text-sm" data-action="trigger-pose" data-value="${p.index}">
          ${escapeHtml(p.animName || '')}
        </button>
      `).join('');
      posesList.querySelectorAll('[data-action="trigger-pose"]').forEach(btn => {
        btn.addEventListener('click', () => triggerPose(parseInt(btn.dataset.value, 10)));
      });
    } else {
      posesList.innerHTML = runtimeEmptyMarkup('empty.no_poses', 'Keine Posen verfügbar', 'text-gray-400 col-span-2');
    }
    
    if (platformData.idleAnims?.length > 0) {
      idlesList.innerHTML = platformData.idleAnims.map(i => `
        <button class="grid-item text-sm" data-action="trigger-idle" data-value="${i.index}">
          ${escapeHtml(i.animName || '')}
        </button>
      `).join('');
      idlesList.querySelectorAll('[data-action="trigger-idle"]').forEach(btn => {
        btn.addEventListener('click', () => triggerIdle(parseInt(btn.dataset.value, 10)));
      });
    } else {
      idlesList.innerHTML = runtimeEmptyMarkup('empty.no_idles', 'Keine Idle Animationen verfügbar', 'text-gray-400 col-span-2');
    }
  }
  
  // Update action value selects
  updateActionValueSelects();
}

function updateActionValueSelects() {
  const platformKey = document.getElementById('settingsPlatform')?.value || getPlatformKey();
  ['follow', 'share', 'subscribe', 'like', 'gift', 'chat'].forEach(event => {
    const typeSelect = document.getElementById(`${event}ActionType`);
    const valueSelect = document.getElementById(`${event}ActionValue`);
    
    if (!typeSelect || !valueSelect) return;
    
    const type = typeSelect.value;
    valueSelect.innerHTML = `<option value="">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.select.choose', 'Auswählen...'))}</option>`;
    
    let options = [];
    switch (type) {
      case 'emote':
        options = platformKey === 'animaze'
          ? (platformData.emotes || []).map(e => ({ value: e.itemName, label: e.friendlyName || e.itemName }))
          : platformKey === 'vseeface'
            ? (platformData.expressions || []).map(name => ({ value: name, label: name }))
            : (platformData.hotkeys || []).map(hotkey => ({ value: hotkey.hotkeyID || hotkey.name || hotkey.hotkeyName, label: hotkey.name || hotkey.hotkeyName || hotkey.description || hotkey.hotkeyID }));
        break;
      case 'specialAction':
        options = platformKey === 'animaze'
          ? (platformData.specialActions || []).map(a => ({ value: a.index, label: a.animName }))
          : platformKey === 'vseeface'
            ? (platformData.motions || []).map(name => ({ value: name, label: name }))
            : (platformData.hotkeys || []).map(hotkey => ({ value: hotkey.hotkeyID || hotkey.name || hotkey.hotkeyName, label: hotkey.name || hotkey.hotkeyName || hotkey.description || hotkey.hotkeyID }));
        break;
      case 'pose':
        options = platformKey === 'animaze'
          ? (platformData.poses || []).map(p => ({ value: p.index, label: p.animName }))
          : platformKey === 'vseeface'
            ? [{ value: 'reset', label: translateRuntime('plugins.animazingpal.runtime.action.reset', 'Reset') }]
            : [];
        break;
      case 'idle':
        options = platformKey === 'animaze'
          ? (platformData.idleAnims || []).map(i => ({ value: i.index, label: i.animName }))
          : platformKey === 'vseeface'
            ? [{ value: 'reset', label: translateRuntime('plugins.animazingpal.runtime.action.reset', 'Reset') }]
            : [];
        break;
      case 'hotkey':
        options = (platformData.hotkeys || []).map(hotkey => ({ value: hotkey.hotkeyID || hotkey.name || hotkey.hotkeyName, label: hotkey.name || hotkey.hotkeyName || hotkey.description || hotkey.hotkeyID }));
        break;
      case 'loadAvatar':
        options = (platformData.availableModels || []).map(model => ({ value: model.modelID || model.modelName || model.vtsModelName, label: model.modelName || model.vtsModelName || model.modelID }));
        break;
      case 'expression':
        options = (platformData.expressions || []).map(name => ({ value: name, label: name }));
        break;
      case 'motion':
        options = (platformData.motions || []).map(name => ({ value: name, label: name }));
        break;
      case 'reset':
        options = [];
        break;
    }
    
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      valueSelect.appendChild(option);
    });
  });
}

function updateDynamicActionTypes() {
  const platformKey = document.getElementById('settingsPlatform')?.value || getPlatformKey();
  const allowedTypes = getAllowedActionTypes(platformKey);

  ['follow', 'share', 'subscribe', 'like', 'gift', 'chat'].forEach(event => {
    const typeSelect = document.getElementById(`${event}ActionType`);
    if (!typeSelect) return;

    const currentValue = typeSelect.value || currentConfig.eventActions?.[event]?.actionType || '';
    typeSelect.innerHTML = `<option value="">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.select.no_action', 'Keine Aktion'))}</option>`;

    allowedTypes.forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = getActionLabel(type);
      typeSelect.appendChild(option);
    });

    typeSelect.value = allowedTypes.includes(currentValue) ? currentValue : '';
  });

  updateActionValueSelects();
}

function updateEventActionUI(event) {
  const action = currentConfig.eventActions?.[event] || {};
  
  const enabledEl = document.getElementById(`${event}Enabled`);
  const typeEl = document.getElementById(`${event}ActionType`);
  const valueEl = document.getElementById(`${event}ActionValue`);
  const messageEl = document.getElementById(`${event}ChatMessage`);
  const thresholdEl = document.getElementById(`${event}Threshold`);
  const echoOverrideEl = document.getElementById(`${event}EchoOverride`);
  
  if (enabledEl) enabledEl.checked = action.enabled || false;
  if (typeEl) typeEl.value = action.actionType || '';
  if (messageEl) messageEl.value = action.chatMessage || '';
  if (thresholdEl) thresholdEl.value = action.threshold || 10;
  
  // Set echo override
  if (echoOverrideEl) {
    if (action.echoOverride === true) {
      echoOverrideEl.value = 'true';
    } else if (action.echoOverride === false) {
      echoOverrideEl.value = 'false';
    } else {
      echoOverrideEl.value = '';
    }
  }
  
  updateDynamicActionTypes();
  
  if (typeEl && action.actionType) {
    typeEl.value = action.actionType;
  }
  
  // Update select options after platform/type are known
  updateDynamicActionTypes();
  
  if (valueEl && action.actionValue !== undefined && action.actionValue !== null) {
    valueEl.value = action.actionValue;
  }
}

async function toggleConnection() {
  try {
    let response;
    if (isConnected) {
      response = await fetch('/api/animazingpal/disconnect', { method: 'POST' });
    } else {
      response = await fetch('/api/animazingpal/connect', { method: 'POST' });
    }
    
    const data = await response.json();
    
    if (!data.success) {
      showToast(runtimeError(data.error, `Verbindung fehlgeschlagen: ${data.error || 'Unbekannter Fehler'}`), 'error');
    } else if (!isConnected && !data.isConnected) {
      const platformLabel = getPlatformDefinition().label || translateRuntime('plugins.animazingpal.runtime.connection.target', 'das Ziel');
      showToast(translateRuntime(
        'plugins.animazingpal.runtime.toast.connection_target_failed',
        `Verbindung zu ${platformLabel} fehlgeschlagen. Prüfe, ob die App läuft und die API aktiv ist.`,
        { platform: platformLabel }
      ), 'error');
    }
    
    fetchStatus();
  } catch (error) {
    console.error('Connection toggle error:', error);
    showToast(runtimeError(error.message, `Fehler: ${error.message}`), 'error');
  }
}

async function testConnection() {
  const response = await fetch('/api/animazingpal/test', { method: 'POST' });
  const data = await response.json();
  showToast(data.message);
  fetchStatus();
}

async function refreshData() {
  await fetch('/api/animazingpal/refresh', { method: 'POST' });
  fetchStatus();
  showToast(translateRuntime('plugins.animazingpal.runtime.toast.data_refreshed', 'Daten aktualisiert'));
}

async function calibrateTracker() {
  await fetch('/api/animazingpal/calibrate', { method: 'POST' });
  showToast(translateRuntime('plugins.animazingpal.runtime.toast.calibration_started', 'Tracker-Kalibrierung gestartet'));
}

async function toggleBroadcast(enable) {
  await fetch('/api/animazingpal/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toggle: enable })
  });
  showToast(translateRuntime(
    enable ? 'toast.broadcast_started' : 'toast.broadcast_stopped',
    enable ? 'Broadcast gestartet' : 'Broadcast gestoppt'
  ));
}

async function triggerEmote(itemName) {
  await fetch('/api/animazingpal/emote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemName })
  });
  showToast(translateRuntime('plugins.animazingpal.runtime.toast.emote_triggered', `Emote ausgelöst: ${itemName}`, { name: itemName }));
}

async function triggerSpecialAction(index) {
  await fetch('/api/animazingpal/special-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index })
  });
  showToast(translateRuntime('plugins.animazingpal.runtime.toast.special_action_triggered', 'Spezialaktion ausgelöst'));
}

async function triggerPose(index) {
  await fetch('/api/animazingpal/pose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index })
  });
  showToast(translateRuntime('plugins.animazingpal.runtime.toast.pose_triggered', 'Pose ausgelöst'));
}

async function triggerIdle(index) {
  await fetch('/api/animazingpal/idle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index })
  });
  showToast(translateRuntime('plugins.animazingpal.runtime.toast.idle_triggered', 'Idle Animation ausgelöst'));
}

async function loadAvatar(name) {
  await fetch('/api/animazingpal/avatar/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  showToast(translateRuntime('plugins.animazingpal.runtime.toast.avatar_loaded', `Avatar/Model geladen: ${name}`, { name }));
}

async function updateEventAction(event) {
  const enabled = document.getElementById(`${event}Enabled`)?.checked || false;
  const actionType = document.getElementById(`${event}ActionType`)?.value || null;
  const actionValue = document.getElementById(`${event}ActionValue`)?.value || null;
  const chatMessage = document.getElementById(`${event}ChatMessage`)?.value || null;
  const threshold = document.getElementById(`${event}Threshold`)?.value;
  const echoOverrideElement = document.getElementById(`${event}EchoOverride`);
  const echoOverride = echoOverrideElement ? echoOverrideElement.value : null;
  
  const eventActions = { ...currentConfig.eventActions };
  eventActions[event] = {
    enabled,
    actionType: actionType || null,
    actionValue: normalizeActionValue(actionType, actionValue),
    chatMessage: chatMessage || null
  };
  
  // Add echo override if set
  if (echoOverride === 'true') {
    eventActions[event].echoOverride = true;
  } else if (echoOverride === 'false') {
    eventActions[event].echoOverride = false;
  } else {
    eventActions[event].echoOverride = null;
  }
  
  if (event === 'like' && threshold) {
    eventActions[event].threshold = parseInt(threshold);
  }
  
  await fetch('/api/animazingpal/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventActions })
  });
  
  currentConfig.eventActions = eventActions;
  showToast(translateRuntime('plugins.animazingpal.runtime.toast.event_updated', `${event} Event aktualisiert`, { event }));
}

async function saveSettings() {
  const platformKey = document.getElementById('settingsPlatform')?.value || getPlatformKey();
  const host = document.getElementById('settingsHost').value;
  const port = parseInt(document.getElementById('settingsPort').value, 10);
  const profilePatch = {
    host,
    port,
    autoConnect: document.getElementById('settingsAutoConnect').checked,
    reconnectOnDisconnect: document.getElementById('settingsReconnect').checked,
    reconnectDelay: parseInt(document.getElementById('settingsReconnectDelay').value, 10) || 5000,
    maxReconnectAttempts: Number.isFinite(parseInt(document.getElementById('settingsMaxReconnectAttempts').value, 10))
      ? parseInt(document.getElementById('settingsMaxReconnectAttempts').value, 10) : 0,
    connectionTimeoutMs: parseInt(document.getElementById('settingsConnectionTimeoutMs').value, 10) || 10000,
    verboseLogging: document.getElementById('settingsVerbose').checked
  };
  const authTokenEl = document.getElementById('settingsAuthToken');
  if (authTokenEl && platformKey === 'vtube-studio' && authTokenEl.value.trim()) {
    profilePatch.authToken = authTokenEl.value.trim();
  }

  const config = {
    platform: {
      active: platformKey,
      profiles: {
        [platformKey]: profilePatch
      }
    }
  };

  if (platformKey === 'animaze') {
    config.host = host;
    config.port = port;
    config.autoConnect = profilePatch.autoConnect;
    config.reconnectOnDisconnect = profilePatch.reconnectOnDisconnect;
    config.reconnectDelay = profilePatch.reconnectDelay;
    config.maxReconnectAttempts = profilePatch.maxReconnectAttempts;
    config.connectionTimeoutMs = profilePatch.connectionTimeoutMs;
    config.verboseLogging = profilePatch.verboseLogging;
  }

  config.vrchatIntegration = {
    enabled: document.getElementById('vrchatBridgeEnabled')?.checked || false,
    targetPluginId: document.getElementById('vrchatTargetPluginId')?.value.trim() || 'osc-bridge',
    forwardChatToChatbox: document.getElementById('vrchatForwardChat')?.checked !== false,
    forwardBrainResponses: document.getElementById('vrchatForwardBrain')?.checked !== false,
    forwardStandaloneResponses: document.getElementById('vrchatForwardStandalone')?.checked !== false,
    sendTypingIndicator: document.getElementById('vrchatSendTypingIndicator')?.checked !== false
  };
  
  await fetch('/api/animazingpal/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  
  showToast(translateRuntime('plugins.animazingpal.runtime.toast.settings_saved', 'Einstellungen gespeichert'));
  fetchStatus();
}

async function applyStreamReadyPreset() {
  try {
    const response = await fetch('/api/animazingpal/presets/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset: 'stream-ready' })
    });

    const data = await response.json();
    if (!data.success) {
      showToast(runtimeError(data.error, `Preset konnte nicht angewendet werden: ${data.error || 'Unbekannter Fehler'}`), 'error');
      return;
    }

    showToast(translateRuntime('plugins.animazingpal.runtime.toast.preset_applied', `Preset angewendet: ${data.preset?.label || 'Stream Ready'}`, { preset: data.preset?.label || 'Stream Ready' }));
    fetchStatus();
  } catch (error) {
    console.error('Preset apply error:', error);
    showToast(runtimeError(error.message, `Preset konnte nicht angewendet werden: ${error.message}`), 'error');
  }
}

function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  
  // Show selected tab
  document.getElementById(`tab-${tabName}`).classList.remove('hidden');
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  
  // Load data when specific tabs are opened
  if (tabName === 'memories') {
    loadMemoryStats();
    loadAllMemories();
  } else if (tabName === 'viewerbase') {
    loadViewerbase();
  } else if (tabName === 'personalities') {
    loadPersonalitySettings();
  }
}

async function unlockAnimazingPalAudio() {
  if (animazingPalAudioUnlocked || window.audioUnlocked) {
    animazingPalAudioUnlocked = true;
    flushPendingAnimazingPalTTS();
    return true;
  }

  if (window.audioUnlockManager) {
    try {
      await window.audioUnlockManager.unlock();
      animazingPalAudioUnlocked = true;
      flushPendingAnimazingPalTTS();
      return true;
    } catch (error) {
      console.warn('[AnimazingPal] Global audio unlock failed:', error);
    }
  }

  const audio = document.getElementById('animazingpal-tts-audio');
  if (!audio) return false;

  audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
  audio.volume = 0.01;

  try {
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    animazingPalAudioUnlocked = true;
    flushPendingAnimazingPalTTS();
    return true;
  } catch (error) {
    showAnimazingPalAudioPrompt();
    return false;
  }
}

function flushPendingAnimazingPalTTS() {
  if (!animazingPalAudioUnlocked && !window.audioUnlocked) return;
  const queue = pendingAnimazingPalTTS.splice(0);
  queue.forEach(item => playAnimazingPalTTS(item));
}

function showAnimazingPalAudioPrompt() {
  if (document.getElementById('animazingpal-audio-enable-prompt')) return;

  const prompt = document.createElement('div');
  prompt.id = 'animazingpal-audio-enable-prompt';
  prompt.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-4 max-w-2xl';
  prompt.style.zIndex = '99999';
  prompt.innerHTML = `
    <span>${escapeHtml(translateRuntime('plugins.animazingpal.runtime.audio.prompt', 'Aktiviere Audio, damit Fish.audio auf das konfigurierte Animaze-Ausgabegerät geroutet wird.'))}</span>
    <button id="animazingpal-enable-audio-btn" class="bg-white text-indigo-700 px-4 py-2 rounded font-semibold hover:bg-indigo-50 transition flex-shrink-0">
      ${escapeHtml(translateRuntime('plugins.animazingpal.runtime.audio.enable', 'Audio aktivieren'))}
    </button>
  `;

  document.body.appendChild(prompt);
  document.getElementById('animazingpal-enable-audio-btn').addEventListener('click', async () => {
    await unlockAnimazingPalAudio();
    prompt.remove();
  });
}

async function playAnimazingPalTTS(data) {
  if (!animazingPalAudioUnlocked && !window.audioUnlocked) {
    pendingAnimazingPalTTS.push(data);
    showAnimazingPalAudioPrompt();
    return;
  }

  const audio = document.getElementById('animazingpal-tts-audio');
  if (!audio) {
    console.error('[AnimazingPal] TTS audio element not found');
    return;
  }

  try {
    const audioBlob = animazingPalBase64ToBlob(data.audioData, 'audio/mpeg');
    const audioUrl = URL.createObjectURL(audioBlob);

    audio.src = audioUrl;
    audio.volume = (data.volume || 80) / 100;
    audio.playbackRate = data.speed || 1.0;

    if (window.TTSOutputRouter) {
      const routing = await window.TTSOutputRouter.routeAudioElement(audio);
      console.log('[AnimazingPal] TTS output routing:', routing);
      recordAnimazingPalTTSPlayback('routing', { routing, item: data });
      showAnimazingPalSinkWarningIfNeeded(routing);
      window.TTSOutputRouter.playMonitor(audio).catch(err => console.warn('[AnimazingPal] TTS monitoring failed:', err));
    }

    await audio.play();
    recordAnimazingPalTTSPlayback('started', { item: data });

    audio.onended = () => {
      recordAnimazingPalTTSPlayback('ended', { item: data });
      URL.revokeObjectURL(audioUrl);
    };

    audio.onerror = () => {
      recordAnimazingPalTTSPlayback('error', { error: audio.error?.message || 'Audio element playback error', item: data });
      URL.revokeObjectURL(audioUrl);
    };
  } catch (error) {
    console.error('[AnimazingPal] TTS playback error:', error);
    recordAnimazingPalTTSPlayback('error', { error, item: data });
    if (error.name === 'NotAllowedError') {
      animazingPalAudioUnlocked = false;
      pendingAnimazingPalTTS.push(data);
      showAnimazingPalAudioPrompt();
    }
  }
}

function handleAnimazingPalStreamChunk(data) {
  if (!animazingPalAudioUnlocked && !window.audioUnlocked) {
    showAnimazingPalAudioPrompt();
    return;
  }

  if (!animazingPalStreamingBuffers.has(data.id)) {
    animazingPalStreamingBuffers.set(data.id, {
      chunks: [],
      volume: data.volume,
      speed: data.speed,
      format: data.format || 'mp3',
      playbackStarted: false
    });
  }

  const buffer = animazingPalStreamingBuffers.get(data.id);
  const binaryString = atob(data.chunk);
  buffer.chunks.push(Uint8Array.from(binaryString, char => char.charCodeAt(0)));

  if (data.isFirst) {
    buffer.volume = data.volume;
    buffer.speed = data.speed;
    buffer.format = data.format || 'mp3';
  }
}

function handleAnimazingPalStreamEnd(data) {
  const buffer = animazingPalStreamingBuffers.get(data.id);
  if (!buffer || buffer.playbackStarted) return;

  buffer.playbackStarted = true;
  playAnimazingPalStreamingAudio(data.id);
}

async function playAnimazingPalStreamingAudio(id) {
  const buffer = animazingPalStreamingBuffers.get(id);
  if (!buffer || buffer.chunks.length === 0) {
    animazingPalStreamingBuffers.delete(id);
    return;
  }

  const audio = document.getElementById('animazingpal-tts-audio');
  if (!audio) {
    animazingPalStreamingBuffers.delete(id);
    return;
  }

  try {
    const totalLength = buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of buffer.chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const audioUrl = URL.createObjectURL(new Blob([combined], { type: getAnimazingPalAudioMimeType(buffer.format) }));
    audio.src = audioUrl;
    audio.volume = (buffer.volume || 80) / 100;
    audio.playbackRate = buffer.speed || 1.0;

    if (window.TTSOutputRouter) {
      const routing = await window.TTSOutputRouter.routeAudioElement(audio);
      console.log('[AnimazingPal] Streaming TTS output routing:', routing);
      recordAnimazingPalTTSPlayback('routing', { routing, item: { id, streaming: true } });
      showAnimazingPalSinkWarningIfNeeded(routing);
      window.TTSOutputRouter.playMonitor(audio).catch(err => console.warn('[AnimazingPal] Streaming TTS monitoring failed:', err));
    }

    await audio.play();
    recordAnimazingPalTTSPlayback('started', { item: { id, streaming: true } });

    audio.onended = () => {
      recordAnimazingPalTTSPlayback('ended', { item: { id, streaming: true } });
      URL.revokeObjectURL(audioUrl);
      animazingPalStreamingBuffers.delete(id);
    };

    audio.onerror = () => {
      recordAnimazingPalTTSPlayback('error', { error: audio.error?.message || 'Streaming audio element playback error', item: { id, streaming: true } });
      URL.revokeObjectURL(audioUrl);
      animazingPalStreamingBuffers.delete(id);
    };
  } catch (error) {
    console.error('[AnimazingPal] Streaming TTS playback error:', error);
    recordAnimazingPalTTSPlayback('error', { error, item: { id, streaming: true } });
    animazingPalStreamingBuffers.delete(id);
  }
}

function getAnimazingPalAudioMimeType(format) {
  const mimeTypes = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    opus: 'audio/opus',
    pcm: 'audio/pcm',
    ogg: 'audio/ogg'
  };
  return mimeTypes[format] || 'audio/mpeg';
}

function animazingPalBase64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

function showAnimazingPalSinkWarningIfNeeded(routing) {
  if (animazingPalSinkWarningShown || !routing || routing.routed) return;
  if (routing.reason !== 'setSinkId_unsupported') return;

  animazingPalSinkWarningShown = true;
  showToast(translateRuntime(
    'plugins.animazingpal.runtime.toast.audio_output_unavailable',
    'Browser kann das Animaze-Ausgabegerät nicht direkt wählen. Setze Windows-Standardausgabe auf CABLE Input oder nutze einen Browser mit setSinkId.'
  ), 'error');
}

function showToast(message, type = 'info') {
  toastQueue.push({ message, type });
  if (!toastShowing) {
    processToastQueue();
  }
}

function processToastQueue() {
  if (toastQueue.length === 0) {
    toastShowing = false;
    return;
  }
  
  toastShowing = true;
  const { message, type } = toastQueue.shift();
  
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  toastMessage.textContent = message;
  
  // Add styling based on type
  if (type === 'error') {
    toast.style.backgroundColor = '#ef4444';
    toast.style.borderColor = '#dc2626';
  } else {
    toast.style.backgroundColor = '#1f2937';
    toast.style.borderColor = '#374151';
  }
  
  toast.classList.remove('hidden');
  
  setTimeout(() => {
    toast.classList.add('hidden');
    processToastQueue();
  }, type === 'error' ? 5000 : 3000);
}

function addGiftMappingPromptLegacy() {
  const giftName = prompt(translateRuntime('plugins.animazingpal.runtime.mapping.gift_catalog_prompt', 'TikTok Gift-Name oder Gift-ID für das Mapping:'));
  if (!giftName) return;

  const allowedActionTypes = new Set(getAllowedActionTypes());
  const actionType = prompt(
    translateRuntime('plugins.animazingpal.runtime.mapping.action_type_prompt', `Aktionstyp (${Array.from(allowedActionTypes).join(', ')}):`, { types: Array.from(allowedActionTypes).join(', ') }),
    Array.from(allowedActionTypes)[0] || 'emote'
  );
  if (!actionType || !allowedActionTypes.has(actionType)) {
    showToast(translateRuntime('plugins.animazingpal.runtime.mapping.invalid_action_type', 'Ungültiger Aktionstyp'), 'error');
    return;
  }

  let actionValue = null;
  if (actionType !== 'chatMessage' && actionType !== 'reset') {
    const valuePrompt = prompt(translateRuntime('plugins.animazingpal.runtime.mapping.action_value_prompt', 'Aktion-Wert (Emote-Name oder Index):'), '');
    if (valuePrompt === null) return;
    const trimmedValue = valuePrompt.trim();
    if (trimmedValue) {
      actionValue = normalizeActionValue(actionType, trimmedValue);
      if (['specialAction', 'pose', 'idle'].includes(actionType) && Number.isNaN(actionValue)) {
        showToast(translateRuntime('plugins.animazingpal.runtime.mapping.valid_number_required', 'Bitte eine gültige Zahl eingeben'), 'error');
        return;
      }
    }
  }

  const chatMessage = prompt(translateRuntime('plugins.animazingpal.runtime.mapping.chat_message_prompt', 'Optionale Chat-Nachricht (leer lassen für keine):'), '')?.trim() || null;
  const useEcho = chatMessage ? confirm(translateRuntime('plugins.animazingpal.runtime.mapping.echo_confirmation', 'Echo für diese Chat-Nachricht erzwingen?')) : null;

  const mappings = Array.isArray(currentConfig.giftMappings) ? [...currentConfig.giftMappings] : [];
  mappings.push({
    giftName: giftName.trim(),
    actionType,
    actionValue,
    chatMessage,
    useEcho
  });

  saveGiftMappings(mappings);
}

async function loadGiftCatalog() {
  try {
    const response = await fetch('/api/gift-catalog');
    const data = await response.json();
    giftCatalog = (data.catalog || []).map(item => ({
      id: String(item.id ?? item.giftId ?? item.gift_id ?? ''),
      name: item.name || item.giftName || item.gift_name || item.id || item.gift_id,
      coins: item.diamond_count ?? item.diamondCount ?? item.coins ?? item.value
    })).filter(item => item.id || item.name);
  } catch (error) {
    console.warn('Gift catalog unavailable:', error);
    giftCatalog = [];
  }
  populateGiftMappingForm();
}

function getGiftMappingActionOptions(actionType) {
  const platformKey = getPlatformKey();
  switch (actionType) {
    case 'emote':
      return platformKey === 'animaze'
        ? (platformData.emotes || []).map(item => ({ value: item.itemName, label: item.friendlyName || item.itemName }))
        : (platformData.hotkeys || platformData.expressions || []).map(item => typeof item === 'string'
          ? { value: item, label: item }
          : { value: item.hotkeyID || item.name || item.hotkeyName, label: item.name || item.hotkeyName || item.description || item.hotkeyID });
    case 'specialAction':
      return platformKey === 'animaze'
        ? (platformData.specialActions || []).map(item => ({ value: item.index, label: item.animName }))
        : (platformData.motions || []).map(item => ({ value: item, label: item }));
    case 'pose':
      return (platformData.poses || []).map(item => ({ value: item.index, label: item.animName }));
    case 'idle':
      return (platformData.idleAnims || []).map(item => ({ value: item.index, label: item.animName }));
    default:
      return [];
  }
}

function populateGiftMappingForm() {
  const giftSelect = document.getElementById('giftMappingGift');
  const typeSelect = document.getElementById('giftMappingActionType');
  const valueSelect = document.getElementById('giftMappingActionValue');
  if (!giftSelect || !typeSelect || !valueSelect) return;

  const selectedGift = giftSelect.value;
  giftSelect.innerHTML = `<option value="">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.mapping.choose_gift', 'Gift aus Katalog wählen...'))}</option>`;
  giftCatalog.forEach(gift => {
    const option = document.createElement('option');
    option.value = gift.id || gift.name;
    option.textContent = `${gift.name || gift.id}${gift.id ? ` (#${gift.id})` : ''}${gift.coins ? ` · ${gift.coins} Coins` : ''}`;
    option.dataset.giftName = gift.name || '';
    giftSelect.appendChild(option);
  });
  if ([...giftSelect.options].some(option => option.value === selectedGift)) giftSelect.value = selectedGift;

  const selectedValue = valueSelect.value;
  valueSelect.innerHTML = `<option value="">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.select.choose', 'Auswählen...'))}</option>`;
  getGiftMappingActionOptions(typeSelect.value || 'emote').forEach(item => {
    if (item.value === null || item.value === undefined || item.value === '') return;
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label || item.value;
    valueSelect.appendChild(option);
  });
  if ([...valueSelect.options].some(option => option.value === selectedValue)) valueSelect.value = selectedValue;
}

function addGiftMapping() {
  const giftSelect = document.getElementById('giftMappingGift');
  const actionType = document.getElementById('giftMappingActionType')?.value || 'emote';
  const rawActionValue = document.getElementById('giftMappingActionValue')?.value || '';
  const selectedGift = giftSelect?.selectedOptions?.[0];
  const giftId = giftSelect?.value || '';
  const giftName = selectedGift?.dataset?.giftName || selectedGift?.textContent?.replace(/\s+\(#.*$/, '').trim() || giftId;
  if (!giftId && !giftName) {
    showToast(translateRuntime('plugins.animazingpal.runtime.mapping.gift_required', 'Bitte ein Gift aus dem Katalog auswählen'), 'error');
    return;
  }
  if (!actionType || !rawActionValue) {
    showToast(translateRuntime('plugins.animazingpal.runtime.mapping.action_required', 'Bitte Aktionstyp und Aktion auswählen'), 'error');
    return;
  }

  const mappings = Array.isArray(currentConfig.giftMappings) ? [...currentConfig.giftMappings] : [];
  mappings.push({
    giftId,
    giftName,
    actionType,
    actionValue: normalizeActionValue(actionType, rawActionValue),
    chatMessage: null,
    useEcho: null
  });

  saveGiftMappings(mappings);
}

async function saveGiftMappings(mappings) {
  try {
    const response = await fetch('/api/animazingpal/gift-mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings })
    });

    const result = await response.json();
    if (!result.success) {
      showToast(translateRuntime(
        'plugins.animazingpal.runtime.mapping.save_failed',
        `Gift-Mapping konnte nicht gespeichert werden: ${result.error || 'Unbekannter Fehler'}`,
        { message: result.error || translateRuntime('plugins.animazingpal.runtime.toast.unknown_error', 'Unbekannter Fehler') }
      ), 'error');
      return;
    }

    currentConfig.giftMappings = result.mappings || mappings;
    renderGiftMappings();
    showToast(translateRuntime('plugins.animazingpal.runtime.mapping.save_success', 'Gift-Mapping gespeichert'));
  } catch (error) {
    console.error('Failed to save gift mappings:', error);
    showToast(runtimeError(error.message, 'Gift-Mapping konnte nicht gespeichert werden'), 'error');
  }
}

function renderGiftMappings() {
  const list = document.getElementById('giftMappingsList');
  if (!list) return;

  const mappings = Array.isArray(currentConfig.giftMappings) ? currentConfig.giftMappings : [];
  if (mappings.length === 0) {
    list.innerHTML = runtimeEmptyMarkup('empty.no_gift_mappings', 'Keine Gift Mappings konfiguriert');
    return;
  }

  list.innerHTML = '';

  mappings.forEach((mapping, index) => {
    const item = document.createElement('div');
    item.className = 'card bg-gray-800 flex items-start justify-between gap-3';

    const details = [];
    details.push(translateRuntime('plugins.animazingpal.runtime.mapping.type', `Typ: ${mapping.actionType || 'unbekannt'}`, { value: mapping.actionType || translateRuntime('plugins.animazingpal.runtime.mapping.unknown', 'unbekannt') }));
    if (mapping.actionValue !== null && mapping.actionValue !== undefined && mapping.actionValue !== '') {
      details.push(translateRuntime('plugins.animazingpal.runtime.mapping.value', `Wert: ${mapping.actionValue}`, { value: mapping.actionValue }));
    }
    if (mapping.chatMessage) {
      details.push(translateRuntime('plugins.animazingpal.runtime.mapping.chat', `Chat: ${mapping.chatMessage}`, { value: mapping.chatMessage }));
    }
    if (mapping.useEcho !== null && mapping.useEcho !== undefined) {
      details.push(translateRuntime('plugins.animazingpal.runtime.mapping.echo', `Echo: ${mapping.useEcho ? 'an' : 'aus'}`, {
        value: mapping.useEcho
          ? translateRuntime('plugins.animazingpal.runtime.mapping.enabled', 'an')
          : translateRuntime('plugins.animazingpal.runtime.mapping.disabled', 'aus')
      }));
    }

    item.innerHTML = `
      <div class="flex-1">
        <div class="font-bold">${escapeHtml(mapping.giftName || mapping.giftId || translateRuntime('plugins.animazingpal.runtime.mapping.fallback_name', `Mapping ${index + 1}`, { number: index + 1 }))}</div>
        <div class="text-sm text-gray-400 mt-1">${escapeHtml(details.join(' · '))}</div>
      </div>
      <button class="btn btn-danger btn-sm" data-delete-gift-mapping="${index}">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.mapping.remove', 'Entfernen'))}</button>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('[data-delete-gift-mapping]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.deleteGiftMapping, 10);
      const nextMappings = Array.isArray(currentConfig.giftMappings) ? [...currentConfig.giftMappings] : [];
      nextMappings.splice(index, 1);
      saveGiftMappings(nextMappings);
    });
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==================== Memory Search & Management ====================

let memoryStats = null;

async function loadMemoryStats() {
  try {
    const response = await fetch('/api/animazingpal/brain/status');
    const data = await response.json();
    
    if (data.success && data.statistics) {
      memoryStats = data.statistics;
      updateMemoryStatsUI();
    }
  } catch (error) {
    console.error('Failed to load memory stats:', error);
  }
}

function updateMemoryStatsUI() {
  if (!memoryStats) return;
  
  document.getElementById('memoryStatsTotal').textContent = memoryStats.totalMemories || 0;
  document.getElementById('memoryStatsUsers').textContent = memoryStats.totalUsers || 0;
  document.getElementById('memoryStatsAvgImportance').textContent = 
    (memoryStats.averageImportance || 0).toFixed(2);
  document.getElementById('memoryStatsArchives').textContent = memoryStats.totalArchives || 0;
}

async function searchMemories() {
  const query = document.getElementById('memorySearchInput').value.trim();
  const filterUser = document.getElementById('memoryFilterUser').value;
  const filterImportance = document.getElementById('memoryFilterImportance').value;
  
  try {
    let url = '/api/animazingpal/brain/memories/search?query=' + encodeURIComponent(query || '');
    
    if (filterUser) {
      url += '&username=' + encodeURIComponent(filterUser);
    }
    
    if (filterImportance) {
      url += '&minImportance=' + filterImportance;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.success) {
      displayMemories(data.memories || []);
    } else {
      showToast(runtimeError(data.error, 'Fehler beim Laden der Erinnerungen'), 'error');
    }
  } catch (error) {
    console.error('Memory search error:', error);
    showToast(runtimeError(error.message, `Fehler: ${error.message}`), 'error');
  }
}

async function loadAllMemories() {
  try {
    const response = await fetch('/api/animazingpal/brain/memories/search?query=&limit=100');
    const data = await response.json();
    
    if (data.success) {
      displayMemories(data.memories || []);
      
      // Update user filter dropdown
      const users = [...new Set(data.memories.map(m => m.source_user).filter(u => u))];
      const userSelect = document.getElementById('memoryFilterUser');
      userSelect.innerHTML = `<option value="">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.memory.all_users', 'Alle Benutzer'))}</option>`;
      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user;
        option.textContent = user;
        userSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Failed to load memories:', error);
    showToast(runtimeError(error.message, 'Fehler beim Laden'), 'error');
  }
}

function displayMemories(memories) {
  const resultsDiv = document.getElementById('memoryResults');
  
  if (memories.length === 0) {
    resultsDiv.innerHTML = runtimeEmptyMarkup('empty.no_memories', 'Keine Erinnerungen gefunden.');
    return;
  }
  
  resultsDiv.innerHTML = memories.map(memory => {
    const date = new Date(memory.created_at).toLocaleString('de-DE');
    const importanceColor = memory.importance >= 0.7 ? 'text-green-400' : 
                           memory.importance >= 0.5 ? 'text-yellow-400' : 
                           'text-gray-400';
    
    return `
      <div class="card bg-gray-800">
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1">
            ${memory.source_user ? `<div class="text-sm font-bold text-blue-400">👤 ${memory.source_user}</div>` : ''}
            <div class="text-sm text-gray-500">${date} · ${memory.memory_type || translateRuntime('plugins.animazingpal.runtime.memory.general', 'general')}</div>
          </div>
          <div class="${importanceColor} font-bold">
            ${(memory.importance || 0).toFixed(2)}
          </div>
        </div>
        <p class="text-white">${memory.content}</p>
        ${memory.context ? `<p class="text-sm text-gray-500 mt-2">${memory.context}</p>` : ''}
        ${memory.tags ? `<div class="flex gap-2 mt-2">${JSON.parse(memory.tags).map(tag => 
          `<span class="text-xs bg-gray-700 px-2 py-1 rounded">${tag}</span>`
        ).join('')}</div>` : ''}
      </div>
    `;
  }).join('');
}

async function archiveOldMemories() {
  if (!confirm(translateRuntime('plugins.animazingpal.runtime.memory.archive_confirm', 'Möchtest du alte Erinnerungen wirklich archivieren? Dies fasst alte Erinnerungen zusammen.'))) {
    return;
  }
  
  try {
    const response = await fetch('/api/animazingpal/brain/archive', { method: 'POST' });
    const data = await response.json();
    
    if (data.success) {
      showToast(translateRuntime('plugins.animazingpal.runtime.memory.archived', 'Erinnerungen archiviert'));
      loadMemoryStats();
      loadAllMemories();
    } else {
      showToast(runtimeError(data.error, `Fehler: ${data.error}`), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Fehler beim Archivieren: ${error.message}`), 'error');
  }
}

// ==================== Personality Settings Management ====================

async function loadPersonalitySettings() {
  try {
    const response = await fetch('/api/animazingpal/config');
    const data = await response.json();
    
    if (data.success && data.config.brain) {
      const brain = data.config.brain;
      
      // Personality selection
      const activePersonality = document.getElementById('activePersonality');
      if (activePersonality && brain.activePersonality) {
        activePersonality.value = brain.activePersonality;
      }
      
      // Memory settings
      document.getElementById('maxContextMemories').value = brain.maxContextMemories || 10;
      document.getElementById('memoryImportanceThreshold').value = brain.memoryImportanceThreshold || 0.3;
      document.getElementById('archiveAfterDays').value = brain.archiveAfterDays || 7;
      document.getElementById('pruneAfterDays').value = brain.pruneAfterDays || 30;
      
      // Auto-response settings
      document.getElementById('autoRespondChat').checked = brain.autoRespond?.chat || false;
      document.getElementById('autoRespondGifts').checked = brain.autoRespond?.gifts !== false;
      document.getElementById('autoRespondFollows').checked = brain.autoRespond?.follows !== false;
      document.getElementById('autoRespondShares').checked = brain.autoRespond?.shares || false;
      document.getElementById('chatResponseProbability').value = brain.chatResponseProbability || 0.3;
      document.getElementById('maxResponsesPerMinute').value = brain.maxResponsesPerMinute || 10;
    }
  } catch (error) {
    console.error('Failed to load personality settings:', error);
  }
}

async function savePersonalitySettings() {
  const personality = document.getElementById('activePersonality').value;
  const maxContextMemories = parseInt(document.getElementById('maxContextMemories').value, 10);
  const memoryImportanceThreshold = parseFloat(document.getElementById('memoryImportanceThreshold').value);
  const archiveAfterDays = parseInt(document.getElementById('archiveAfterDays').value, 10);
  const pruneAfterDays = parseInt(document.getElementById('pruneAfterDays').value, 10);
  const chatResponseProbability = parseFloat(document.getElementById('chatResponseProbability').value);
  const maxResponsesPerMinute = parseInt(document.getElementById('maxResponsesPerMinute').value, 10);
  
  const brainConfig = {
    activePersonality: personality,
    maxContextMemories,
    memoryImportanceThreshold,
    archiveAfterDays,
    pruneAfterDays,
    chatResponseProbability,
    maxResponsesPerMinute,
    autoRespond: {
      chat: document.getElementById('autoRespondChat').checked,
      gifts: document.getElementById('autoRespondGifts').checked,
      follows: document.getElementById('autoRespondFollows').checked,
      shares: document.getElementById('autoRespondShares').checked
    }
  };
  
  try {
    const response = await fetch('/api/animazingpal/brain/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(brainConfig)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(translateRuntime('plugins.animazingpal.runtime.toast.personality_settings_saved', 'Persönlichkeits-Einstellungen gespeichert'));
    } else {
      showToast(runtimeError(result.error, `Fehler: ${result.error}`), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Fehler beim Speichern: ${error.message}`), 'error');
  }
}

// ==================== Brain & Persona Management ====================

let currentPersonas = [];
let editingPersona = null;

// Add brain-related event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Brain config buttons
  const saveBrainConfigBtn = document.getElementById('saveBrainConfig');
  if (saveBrainConfigBtn) saveBrainConfigBtn.addEventListener('click', saveBrainConfig);
  
  const testBrainBtn = document.getElementById('testBrainConnection');
  if (testBrainBtn) testBrainBtn.addEventListener('click', testBrainConnection);
  
  // Persona management buttons
  const createPersonaBtn = document.getElementById('createPersonaBtn');
  if (createPersonaBtn) createPersonaBtn.addEventListener('click', showPersonaEditor);
  
  const savePersonaBtn = document.getElementById('savePersonaBtn');
  if (savePersonaBtn) savePersonaBtn.addEventListener('click', savePersona);
  
  const cancelPersonaBtn = document.getElementById('cancelPersonaBtn');
  if (cancelPersonaBtn) cancelPersonaBtn.addEventListener('click', hidePersonaEditor);
  
  const activePersonaSelect = document.getElementById('activePersonaSelect');
  if (activePersonaSelect) activePersonaSelect.addEventListener('change', setActivePersona);
  
  // Load initial data
  loadBrainConfig();
  loadPersonas();
});

async function loadBrainConfig() {
  try {
    const response = await fetch('/api/animazingpal/config');
    const data = await response.json();
    if (data.success && data.config.brain) {
      const brain = data.config.brain;
      
      const brainEnabled = document.getElementById('brainEnabled');
      if (brainEnabled) brainEnabled.checked = brain.enabled || false;
      
      const standaloneMode = document.getElementById('standaloneMode');
      if (standaloneMode) standaloneMode.checked = brain.standaloneMode || false;
      
      const brainApiKey = document.getElementById('brainApiKey');
      if (brainApiKey && brain.openaiApiKey) {
        brainApiKey.value = brain.openaiApiKey;
      }
      
      const brainModel = document.getElementById('brainModel');
      if (brainModel && brain.model) {
        brainModel.value = brain.model;
      }
    }
  } catch (error) {
    console.error('Failed to load brain config:', error);
  }
}

async function saveBrainConfig() {
  const brainConfig = {
    enabled: document.getElementById('brainEnabled').checked,
    standaloneMode: document.getElementById('standaloneMode').checked,
    openaiApiKey: document.getElementById('brainApiKey').value,
    model: document.getElementById('brainModel').value
  };
  
  try {
    const response = await fetch('/api/animazingpal/brain/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(brainConfig)
    });
    
    const result = await response.json();
    if (result.success) {
      showToast(translateRuntime('plugins.animazingpal.runtime.toast.brain_config_saved', 'Brain-Konfiguration gespeichert'));
    } else {
      showToast(runtimeError(result.error, `Fehler beim Speichern: ${result.error}`), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Fehler beim Speichern: ${error.message}`), 'error');
  }
}

async function testBrainConnection() {
  try {
    showToast(translateRuntime('plugins.animazingpal.runtime.toast.testing_connection', 'Teste Verbindung...'));
    const response = await fetch('/api/animazingpal/brain/test', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      showToast(translateRuntime('plugins.animazingpal.runtime.toast.connection_successful', 'Verbindung erfolgreich!'));
    } else {
      showToast(runtimeError(result.error, `Verbindung fehlgeschlagen: ${result.error}`), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Verbindung fehlgeschlagen: ${error.message}`), 'error');
  }
}

async function loadPersonas() {
  try {
    const response = await fetch('/api/animazingpal/brain/personalities');
    const data = await response.json();
    
    if (data.success) {
      currentPersonas = data.personalities;
      updatePersonaList();
      updateActivePersonaSelect();
    }
  } catch (error) {
    console.error('Failed to load personas:', error);
  }
}

function updatePersonaList() {
  const personaList = document.getElementById('personaList');
  if (!personaList) return;
  
  personaList.innerHTML = '';
  
  currentPersonas.forEach(persona => {
    const item = document.createElement('div');
    item.className = 'grid-item flex items-center justify-between';
    item.innerHTML = `
      <div class="flex-1">
        <div class="font-bold">${persona.display_name}</div>
        <div class="text-sm text-gray-400">${persona.description || ''}</div>
        ${persona.is_active ? `<span class="text-xs bg-green-600 text-white px-2 py-1 rounded">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.persona.active', 'Aktiv'))}</span>` : ''}
        ${persona.is_custom ? `<span class="text-xs bg-blue-600 text-white px-2 py-1 rounded ml-1">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.persona.custom', 'Custom'))}</span>` : ''}
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" onclick="editPersona('${persona.name}')">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.persona.edit', 'Bearbeiten'))}</button>
        ${persona.is_custom ? `<button class="btn btn-danger btn-sm" onclick="deletePersona('${persona.name}')">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.persona.delete', 'Löschen'))}</button>` : ''}
      </div>
    `;
    personaList.appendChild(item);
  });
}

function updateActivePersonaSelect() {
  const select = document.getElementById('activePersonaSelect');
  if (!select) return;
  
  select.innerHTML = `<option value="">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.persona.none_selected', 'Keine ausgewählt'))}</option>`;
  
  currentPersonas.forEach(persona => {
    const option = document.createElement('option');
    option.value = persona.name;
    option.textContent = persona.display_name;
    if (persona.is_active) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function showPersonaEditor(personaName = null) {
  const editor = document.getElementById('personaEditor');
  const idInput = document.getElementById('editPersonaId');
  
  if (personaName) {
    // Edit mode
    const persona = currentPersonas.find(p => p.name === personaName);
    if (!persona) return;
    
    editingPersona = persona.name;
    document.getElementById('editPersonaName').value = persona.name;
    idInput.value = persona.name;
    idInput.disabled = true;
    document.getElementById('editPersonaDisplayName').value = persona.display_name;
    document.getElementById('editPersonaDescription').value = persona.description || '';
    document.getElementById('editPersonaSystemPrompt').value = persona.system_prompt;
    document.getElementById('editPersonaVoiceStyle').value = persona.voice_style || '';
    document.getElementById('editPersonaCatchphrases').value = JSON.stringify(persona.catchphrases || []);
    document.getElementById('editPersonaTemperature').value = persona.tone_settings?.temperature || 0.7;
    document.getElementById('editPersonaPresencePenalty').value = persona.tone_settings?.presencePenalty || 0.3;
    document.getElementById('editPersonaFrequencyPenalty').value = persona.tone_settings?.frequencyPenalty || 0.2;
    document.getElementById('editPersonaDefaultEmote').value = persona.emote_config?.defaultEmote || 'smile';
    document.getElementById('editPersonaHighEnergyEmote').value = persona.emote_config?.highEnergyEmote || 'excited';
    document.getElementById('editPersonaLowEnergyEmote').value = persona.emote_config?.lowEnergyEmote || 'calm';
  } else {
    // Create mode
    editingPersona = null;
    idInput.disabled = false;
    document.getElementById('editPersonaId').value = '';
    document.getElementById('editPersonaDisplayName').value = '';
    document.getElementById('editPersonaDescription').value = '';
    document.getElementById('editPersonaSystemPrompt').value = '';
    document.getElementById('editPersonaVoiceStyle').value = '';
    document.getElementById('editPersonaCatchphrases').value = '[]';
    document.getElementById('editPersonaTemperature').value = '0.7';
    document.getElementById('editPersonaPresencePenalty').value = '0.3';
    document.getElementById('editPersonaFrequencyPenalty').value = '0.2';
    document.getElementById('editPersonaDefaultEmote').value = 'smile';
    document.getElementById('editPersonaHighEnergyEmote').value = 'excited';
    document.getElementById('editPersonaLowEnergyEmote').value = 'calm';
  }
  
  editor.classList.remove('hidden');
  editor.scrollIntoView({ behavior: 'smooth' });
}

function hidePersonaEditor() {
  document.getElementById('personaEditor').classList.add('hidden');
  editingPersona = null;
}

async function savePersona() {
  const personaData = {
    name: document.getElementById('editPersonaId').value.trim(),
    display_name: document.getElementById('editPersonaDisplayName').value.trim(),
    description: document.getElementById('editPersonaDescription').value.trim(),
    system_prompt: document.getElementById('editPersonaSystemPrompt').value.trim(),
    voice_style: document.getElementById('editPersonaVoiceStyle').value.trim(),
    tone_settings: {
      temperature: parseFloat(document.getElementById('editPersonaTemperature').value),
      presencePenalty: parseFloat(document.getElementById('editPersonaPresencePenalty').value),
      frequencyPenalty: parseFloat(document.getElementById('editPersonaFrequencyPenalty').value)
    },
    emote_config: {
      defaultEmote: document.getElementById('editPersonaDefaultEmote').value.trim(),
      highEnergyEmote: document.getElementById('editPersonaHighEnergyEmote').value.trim(),
      lowEnergyEmote: document.getElementById('editPersonaLowEnergyEmote').value.trim()
    }
  };
  
  // Parse catchphrases
  try {
    personaData.catchphrases = JSON.parse(document.getElementById('editPersonaCatchphrases').value);
  } catch (error) {
    showToast(translateRuntime('plugins.animazingpal.runtime.persona.catchphrases_json_required', 'Fehler: Catchphrases müssen ein gültiges JSON-Array sein'), 'error');
    return;
  }
  
  if (!personaData.name || !personaData.system_prompt) {
    showToast(translateRuntime('plugins.animazingpal.runtime.persona.name_and_prompt_required', 'Name und System Prompt sind erforderlich'), 'error');
    return;
  }
  
  try {
    let url, method;
    if (editingPersona) {
      // Update
      url = `/api/animazingpal/brain/personality/${editingPersona}`;
      method = 'PUT';
    } else {
      // Create
      url = '/api/animazingpal/brain/personality/create';
      method = 'POST';
    }
    
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(personaData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(translateRuntime('plugins.animazingpal.runtime.persona.saved', 'Persona gespeichert!'));
      hidePersonaEditor();
      await loadPersonas();
    } else {
      showToast(runtimeError(result.error, `Fehler: ${result.error}`), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Fehler beim Speichern: ${error.message}`), 'error');
  }
}

async function editPersona(personaName) {
  showPersonaEditor(personaName);
}

async function deletePersona(personaName) {
  if (!confirm(translateRuntime('plugins.animazingpal.runtime.persona.delete_confirm', `Persona "${personaName}" wirklich löschen?`, { name: personaName }))) {
    return;
  }
  
  try {
    const response = await fetch(`/api/animazingpal/brain/personality/${personaName}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(translateRuntime('plugins.animazingpal.runtime.persona.deleted', 'Persona gelöscht'));
      await loadPersonas();
    } else {
      showToast(runtimeError(result.error, `Fehler: ${result.error}`), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Fehler beim Löschen: ${error.message}`), 'error');
  }
}

async function setActivePersona() {
  const personaName = document.getElementById('activePersonaSelect').value;
  
  if (!personaName) return;
  
  try {
    const response = await fetch('/api/animazingpal/brain/personality/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: personaName })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(translateRuntime('plugins.animazingpal.runtime.persona.active_changed', `Aktive Persona geändert: ${result.personality.display_name}`, { name: result.personality.display_name }));
      await loadPersonas();
    } else {
      showToast(runtimeError(result.error, `Fehler: ${result.error}`), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Fehler: ${error.message}`), 'error');
  }
}

// Brain Settings
async function saveBrainSettings() {
  const standaloneMode = document.getElementById('standaloneMode').checked;
  const forceTtsOnlyOnActions = document.getElementById('forceTtsOnlyOnActions').checked;

  try {
    const response = await fetch('/api/animazingpal/brain/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        standaloneMode,
        forceTtsOnlyOnActions
      })
    });

    const result = await response.json();

    if (result.success) {
      showToast(translateRuntime('plugins.animazingpal.runtime.toast.brain_settings_saved', 'Brain Einstellungen gespeichert!'));
    } else {
      showToast(runtimeError(result.error, `Fehler: ${result.error}`), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Fehler beim Speichern: ${error.message}`), 'error');
  }
}

// Logic Matrix Functions
async function addLogicMatrixRule() {
  showToast(translateRuntime('plugins.animazingpal.runtime.toast.logic_matrix_coming_soon', 'Logic Matrix Editor wird implementiert...'), 'info');
  // Stub for future implementation
}

async function testLogicMatrix() {
  const eventType = document.getElementById('testEventType').value;
  const eventDataText = document.getElementById('testEventData').value;

  if (!eventType) {
    showToast(translateRuntime('plugins.animazingpal.runtime.toast.event_type_required', 'Bitte Event-Typ auswählen'), 'error');
    return;
  }

  let eventData;
  try {
    eventData = JSON.parse(eventDataText);
  } catch (error) {
    showToast(translateRuntime('plugins.animazingpal.runtime.toast.invalid_json', 'Ungültiges JSON-Format'), 'error');
    return;
  }

  try {
    const response = await fetch('/api/animazingpal/logic-matrix/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, eventData })
    });

    const result = await response.json();

    const resultsDiv = document.getElementById('testLogicMatrixResults');
    const outputPre = document.getElementById('testLogicMatrixOutput');

    if (result.success) {
      resultsDiv.classList.remove('hidden');
      outputPre.textContent = JSON.stringify(result, null, 2);
      showToast(translateRuntime('plugins.animazingpal.runtime.toast.test_completed', 'Test erfolgreich durchgeführt'));
    } else {
      resultsDiv.classList.remove('hidden');
      outputPre.textContent = runtimeError(result.error, `Fehler: ${result.error}`);
      showToast(translateRuntime('plugins.animazingpal.runtime.toast.test_failed', 'Test fehlgeschlagen'), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Fehler beim Test: ${error.message}`), 'error');
  }
}

// Persona Management Functions
async function createPersona() {
  const personaName = prompt(translateRuntime('plugins.animazingpal.runtime.persona.new_name_prompt', 'Neuer Persona Name:'));
  if (!personaName) return;

  const systemPrompt = prompt(translateRuntime('plugins.animazingpal.runtime.persona.system_prompt_prompt', 'System Prompt (Persönlichkeitsbeschreibung):'));
  if (!systemPrompt) return;

  try {
    const response = await fetch('/api/animazingpal/brain/personality/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: personaName,
        system_prompt: systemPrompt,
        language: 'de',
        temperature: 0.8
      })
    });

    const result = await response.json();

    if (result.success) {
      showToast(translateRuntime('plugins.animazingpal.runtime.persona.created', 'Persona erstellt'));
      // Reload personalities list
      loadPersonalities();
    } else {
      showToast(runtimeError(result.error, `Fehler: ${result.error}`), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Fehler beim Erstellen: ${error.message}`), 'error');
  }
}

async function editPersonaFromSelector() {
  const personaSelector = document.getElementById('personaSelector');
  const selectedPersona = personaSelector.value;

  if (!selectedPersona) {
    showToast(translateRuntime('plugins.animazingpal.runtime.persona.selection_required', 'Bitte eine Persona auswählen'), 'error');
    return;
  }

  const systemPrompt = prompt(translateRuntime('plugins.animazingpal.runtime.persona.update_system_prompt', `Neuer System Prompt für "${selectedPersona}":`, { name: selectedPersona }));
  if (!systemPrompt) return;

  try {
    const response = await fetch(`/api/animazingpal/brain/personality/${selectedPersona}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        system_prompt: systemPrompt
      })
    });

    const result = await response.json();

    if (result.success) {
      showToast(translateRuntime('plugins.animazingpal.runtime.persona.updated', 'Persona aktualisiert'));
    } else {
      showToast(runtimeError(result.error, `Fehler: ${result.error}`), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Fehler beim Bearbeiten: ${error.message}`), 'error');
  }
}

async function loadPersonalities() {
  try {
    const response = await fetch('/api/animazingpal/brain/personalities');
    const data = await response.json();
    
    if (data.success) {
      const personaSelector = document.getElementById('personaSelector');
      const activePersonality = document.getElementById('activePersonality');
      
      // Update persona selector
      personaSelector.innerHTML = `<option value="">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.persona.select', 'Persona auswählen...'))}</option>`;
      data.personalities.forEach(p => {
        const option = document.createElement('option');
        option.value = p.name;
        option.textContent = p.name;
        personaSelector.appendChild(option);
      });
      
      // Update active personality selector
      activePersonality.innerHTML = `<option value="">${escapeHtml(translateRuntime('plugins.animazingpal.runtime.persona.none_selected', 'Keine ausgewählt'))}</option>`;
      data.personalities.forEach(p => {
        const option = document.createElement('option');
        option.value = p.name;
        option.textContent = p.name;
        activePersonality.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Failed to load personalities:', error);
  }
}

async function deletePersonaFromSelector() {
  const personaSelector = document.getElementById('personaSelector');
  const selectedPersona = personaSelector.value;

  if (!selectedPersona) {
    showToast(translateRuntime('plugins.animazingpal.runtime.persona.selection_required', 'Bitte eine Persona auswählen'), 'error');
    return;
  }

  if (!confirm(translateRuntime('plugins.animazingpal.runtime.persona.delete_confirm', `Persona "${selectedPersona}" wirklich löschen?`, { name: selectedPersona }))) {
    return;
  }

  try {
    const response = await fetch(`/api/animazingpal/brain/personality/${selectedPersona}`, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (result.success) {
      showToast(translateRuntime('plugins.animazingpal.runtime.persona.deleted', 'Persona gelöscht'));
      personaSelector.value = '';
      loadPersonalities();
    } else {
      showToast(runtimeError(result.error, `Fehler: ${result.error}`), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Fehler beim Löschen: ${error.message}`), 'error');
  }
}

// ==================== Override Behaviors ====================

function updateOverridesUI(overrideBehaviors = []) {
  const overridesList = document.getElementById('overridesList');
  if (!overridesList) return;
  
  if (overrideBehaviors.length === 0) {
    overridesList.innerHTML = runtimeEmptyMarkup('empty.no_override_behaviors', 'Keine Override Behaviors verfügbar');
    return;
  }
  
  overridesList.innerHTML = overrideBehaviors.map(behavior => `
    <div class="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
      <span class="text-sm">${behavior}</span>
      <label class="switch">
        <input type="checkbox" data-behavior="${behavior}" onchange="toggleOverride('${behavior}', this.checked)">
        <span class="slider"></span>
      </label>
    </div>
  `).join('');
}

async function toggleOverride(behavior, enabled) {
  try {
    const response = await fetch('/api/animazingpal/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ behavior, value: enabled })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(translateRuntime('plugins.animazingpal.runtime.toast.override_updated', `${behavior}: ${enabled ? 'Aktiviert' : 'Deaktiviert'}`, {
        behavior,
        state: enabled ? translateRuntime('plugins.animazingpal.runtime.mapping.enabled', 'Aktiviert') : translateRuntime('plugins.animazingpal.runtime.mapping.disabled', 'Deaktiviert')
      }));
    } else {
      showToast(runtimeError(result.error, `Fehler: ${result.error}`), 'error');
    }
  } catch (error) {
    showToast(runtimeError(error.message, `Fehler beim Umschalten: ${error.message}`), 'error');
  }
}

// Make functions available globally
window.editPersona = editPersona;
window.deletePersona = deletePersona;
window.toggleOverride = toggleOverride;
window.playAnimazingPalTTS = playAnimazingPalTTS;

