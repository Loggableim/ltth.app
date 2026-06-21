// AnimazingPal UI JavaScript
const socket = io();
let currentConfig = {};
let animazeData = {};
let isConnected = false;

// Toast queue for sequential messages
let toastQueue = [];
let toastShowing = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  fetchStatus();
  loadPersonalities();
  
  // Socket events
  socket.on('animazingpal:status', (data) => {
    updateStatus(data);
  });
  
  socket.on('animazingpal:data-refreshed', (data) => {
    animazeData = data;
    updateAnimazeDataUI();
  });
  
  socket.on('animazingpal:chatpal-response', (data) => {
    showToast(`ChatPal: ${data.response}`);
  });

  // Set up event listeners
  setupEventListeners();
});

function setupEventListeners() {
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

  // Chat settings
  const chatEnabled = document.getElementById('chatEnabled');
  if (chatEnabled) chatEnabled.addEventListener('change', updateChatSettings);

  const chatUseEcho = document.getElementById('chatUseEcho');
  if (chatUseEcho) chatUseEcho.addEventListener('change', updateChatSettings);

  const chatPrefix = document.getElementById('chatPrefix');
  if (chatPrefix) chatPrefix.addEventListener('change', updateChatSettings);

  const chatMaxLength = document.getElementById('chatMaxLength');
  if (chatMaxLength) chatMaxLength.addEventListener('change', updateChatSettings);

  // ChatPal message
  const sendChatpalBtn = document.querySelector('[data-action="send-chatpal"]');
  if (sendChatpalBtn) sendChatpalBtn.addEventListener('click', sendChatpalMessage);

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
            showToast('Persönlichkeit gewechselt');
          }
        } catch (error) {
          showToast('Fehler beim Wechseln der Persönlichkeit', 'error');
        }
      }
    });
  }

  // Brain settings
  const saveBrainSettingsBtn = document.getElementById('saveBrainSettingsBtn');
  if (saveBrainSettingsBtn) saveBrainSettingsBtn.addEventListener('click', saveBrainSettings);

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
  isConnected = data.isConnected;
  currentConfig = data.config || {};
  animazeData = data.animazeData || {};
  
  // Update connection status
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const connectBtn = document.getElementById('connectBtn');
  const connectionStatus = document.getElementById('connectionStatus');
  
  if (isConnected) {
    statusDot.className = 'status-dot status-connected';
    statusText.textContent = 'Verbunden';
    connectBtn.textContent = 'Trennen';
    connectBtn.className = 'btn btn-danger';
    connectionStatus.textContent = 'Verbunden';
    connectionStatus.className = 'text-green-500';
  } else {
    statusDot.className = 'status-dot status-disconnected';
    statusText.textContent = 'Nicht verbunden';
    connectBtn.textContent = 'Verbinden';
    connectBtn.className = 'btn btn-primary';
    connectionStatus.textContent = 'Nicht verbunden';
    connectionStatus.className = 'text-red-500';
  }
  
  // Update connection info
  document.getElementById('connectionHost').textContent = `${currentConfig.host || '127.0.0.1'}:${currentConfig.port || 9000}`;
  document.getElementById('avatarCount').textContent = animazeData.avatars?.length || 0;
  document.getElementById('emoteCount').textContent = animazeData.emotes?.length || 0;
  
  // Update current avatar info
  if (animazeData.currentAvatar) {
    const avatar = animazeData.currentAvatar;
    document.getElementById('currentAvatarInfo').innerHTML = `
      <div class="space-y-2">
        <div><strong>Name:</strong> ${avatar.friendlyName || avatar.itemName || 'Unbekannt'}</div>
        ${avatar.description ? `<div><strong>Beschreibung:</strong> ${avatar.description}</div>` : ''}
        ${avatar.props?.length ? `<div><strong>Props:</strong> ${avatar.props.join(', ')}</div>` : ''}
      </div>
    `;
  }
  
  // Update settings form
  document.getElementById('settingsHost').value = currentConfig.host || '127.0.0.1';
  document.getElementById('settingsPort').value = currentConfig.port || 9000;
  document.getElementById('settingsAutoConnect').checked = currentConfig.autoConnect !== false;
  document.getElementById('settingsReconnect').checked = currentConfig.reconnectOnDisconnect !== false;
  document.getElementById('settingsVerbose').checked = currentConfig.verboseLogging || false;
  
  // Update chat settings
  const chatConfig = currentConfig.chatToAvatar || {};
  document.getElementById('chatEnabled').checked = chatConfig.enabled || false;
  document.getElementById('chatUseEcho').checked = chatConfig.useEcho !== false;
  document.getElementById('chatPrefix').value = chatConfig.prefix || '';
  document.getElementById('chatMaxLength').value = chatConfig.maxLength || 200;
  
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
}

function updateAnimazeDataUI() {
  // Update emotes list
  const emotesList = document.getElementById('emotesList');
  if (animazeData.emotes?.length > 0) {
    emotesList.innerHTML = animazeData.emotes.map(e => `
      <button class="grid-item text-sm" data-action="trigger-emote" data-value="${e.itemName}">
        ${e.friendlyName || e.itemName}
      </button>
    `).join('');
    // Add event listeners to dynamically created buttons
    emotesList.querySelectorAll('[data-action="trigger-emote"]').forEach(btn => {
      btn.addEventListener('click', () => triggerEmote(btn.dataset.value));
    });
  } else {
    emotesList.innerHTML = '<p class="text-gray-400 col-span-2">Keine Emotes verfügbar</p>';
  }
  
  // Update special actions list
  const specialActionsList = document.getElementById('specialActionsList');
  if (animazeData.specialActions?.length > 0) {
    specialActionsList.innerHTML = animazeData.specialActions.map(a => `
      <button class="grid-item text-sm" data-action="trigger-special" data-value="${a.index}">
        ${a.animName}
      </button>
    `).join('');
    specialActionsList.querySelectorAll('[data-action="trigger-special"]').forEach(btn => {
      btn.addEventListener('click', () => triggerSpecialAction(parseInt(btn.dataset.value)));
    });
  } else {
    specialActionsList.innerHTML = '<p class="text-gray-400 col-span-2">Keine Spezialaktionen verfügbar</p>';
  }
  
  // Update poses list
  const posesList = document.getElementById('posesList');
  if (animazeData.poses?.length > 0) {
    posesList.innerHTML = animazeData.poses.map(p => `
      <button class="grid-item text-sm" data-action="trigger-pose" data-value="${p.index}">
        ${p.animName}
      </button>
    `).join('');
    posesList.querySelectorAll('[data-action="trigger-pose"]').forEach(btn => {
      btn.addEventListener('click', () => triggerPose(parseInt(btn.dataset.value)));
    });
  } else {
    posesList.innerHTML = '<p class="text-gray-400 col-span-2">Keine Posen verfügbar</p>';
  }
  
  // Update idles list
  const idlesList = document.getElementById('idlesList');
  if (animazeData.idleAnims?.length > 0) {
    idlesList.innerHTML = animazeData.idleAnims.map(i => `
      <button class="grid-item text-sm" data-action="trigger-idle" data-value="${i.index}">
        ${i.animName}
      </button>
    `).join('');
    idlesList.querySelectorAll('[data-action="trigger-idle"]').forEach(btn => {
      btn.addEventListener('click', () => triggerIdle(parseInt(btn.dataset.value)));
    });
  } else {
    idlesList.innerHTML = '<p class="text-gray-400 col-span-2">Keine Idle Animationen verfügbar</p>';
  }
  
  // Update action value selects
  updateActionValueSelects();
}

function updateActionValueSelects() {
  ['follow', 'share', 'subscribe', 'like'].forEach(event => {
    const typeSelect = document.getElementById(`${event}ActionType`);
    const valueSelect = document.getElementById(`${event}ActionValue`);
    
    if (!typeSelect || !valueSelect) return;
    
    const type = typeSelect.value;
    valueSelect.innerHTML = '<option value="">Auswählen...</option>';
    
    let options = [];
    switch (type) {
      case 'emote':
        options = (animazeData.emotes || []).map(e => ({ value: e.itemName, label: e.friendlyName || e.itemName }));
        break;
      case 'specialAction':
        options = (animazeData.specialActions || []).map(a => ({ value: a.index, label: a.animName }));
        break;
      case 'pose':
        options = (animazeData.poses || []).map(p => ({ value: p.index, label: p.animName }));
        break;
      case 'idle':
        options = (animazeData.idleAnims || []).map(i => ({ value: i.index, label: i.animName }));
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
  
  // Update value select after type is set
  updateActionValueSelects();
  
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
      showToast(`Verbindung fehlgeschlagen: ${data.error || 'Unbekannter Fehler'}`, 'error');
    } else if (!isConnected && !data.isConnected) {
      showToast('Verbindung zu Animaze fehlgeschlagen. Prüfe ob Animaze läuft und die API aktiviert ist.', 'error');
    }
    
    fetchStatus();
  } catch (error) {
    console.error('Connection toggle error:', error);
    showToast(`Fehler: ${error.message}`, 'error');
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
  showToast('Daten aktualisiert');
}

async function calibrateTracker() {
  await fetch('/api/animazingpal/calibrate', { method: 'POST' });
  showToast('Tracker-Kalibrierung gestartet');
}

async function toggleBroadcast(enable) {
  await fetch('/api/animazingpal/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toggle: enable })
  });
  showToast(enable ? 'Broadcast gestartet' : 'Broadcast gestoppt');
}

async function triggerEmote(itemName) {
  await fetch('/api/animazingpal/emote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemName })
  });
  showToast(`Emote ausgelöst: ${itemName}`);
}

async function triggerSpecialAction(index) {
  await fetch('/api/animazingpal/special-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index })
  });
  showToast(`Spezialaktion ausgelöst`);
}

async function triggerPose(index) {
  await fetch('/api/animazingpal/pose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index })
  });
  showToast(`Pose ausgelöst`);
}

async function triggerIdle(index) {
  await fetch('/api/animazingpal/idle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index })
  });
  showToast(`Idle Animation ausgelöst`);
}

async function sendChatpalMessage() {
  const message = document.getElementById('chatpalMessage').value;
  const useEcho = document.getElementById('chatpalUseEcho').checked;
  
  if (!message) {
    showToast('Bitte eine Nachricht eingeben');
    return;
  }
  
  await fetch('/api/animazingpal/chatpal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, useEcho })
  });
  
  document.getElementById('chatpalMessage').value = '';
  showToast('Nachricht an ChatPal gesendet');
}

async function updateChatSettings() {
  const chatToAvatar = {
    enabled: document.getElementById('chatEnabled').checked,
    useEcho: document.getElementById('chatUseEcho').checked,
    prefix: document.getElementById('chatPrefix').value,
    maxLength: parseInt(document.getElementById('chatMaxLength').value) || 200
  };
  
  await fetch('/api/animazingpal/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatToAvatar })
  });
  
  showToast('Chat-Einstellungen gespeichert');
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
    actionValue: actionValue ? (actionType === 'emote' ? actionValue : parseInt(actionValue)) : null,
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
  showToast(`${event} Event aktualisiert`);
}

async function saveSettings() {
  const config = {
    host: document.getElementById('settingsHost').value,
    port: parseInt(document.getElementById('settingsPort').value),
    autoConnect: document.getElementById('settingsAutoConnect').checked,
    reconnectOnDisconnect: document.getElementById('settingsReconnect').checked,
    verboseLogging: document.getElementById('settingsVerbose').checked
  };
  
  await fetch('/api/animazingpal/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  
  showToast('Einstellungen gespeichert');
  fetchStatus();
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
  } else if (tabName === 'personalities') {
    loadPersonalitySettings();
  }
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

function addGiftMapping() {
  // TODO: Implement gift mapping modal
  showToast('Gift Mapping hinzufügen - Feature kommt bald!');
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
      showToast('Fehler beim Laden der Erinnerungen', 'error');
    }
  } catch (error) {
    console.error('Memory search error:', error);
    showToast('Fehler: ' + error.message, 'error');
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
      userSelect.innerHTML = '<option value="">Alle Benutzer</option>';
      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user;
        option.textContent = user;
        userSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Failed to load memories:', error);
    showToast('Fehler beim Laden', 'error');
  }
}

function displayMemories(memories) {
  const resultsDiv = document.getElementById('memoryResults');
  
  if (memories.length === 0) {
    resultsDiv.innerHTML = '<p class="text-gray-400">Keine Erinnerungen gefunden.</p>';
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
            <div class="text-sm text-gray-500">${date} • ${memory.memory_type || 'general'}</div>
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
  if (!confirm('Möchtest du alte Erinnerungen wirklich archivieren? Dies fasst alte Erinnerungen zusammen.')) {
    return;
  }
  
  try {
    const response = await fetch('/api/animazingpal/brain/archive', { method: 'POST' });
    const data = await response.json();
    
    if (data.success) {
      showToast('Erinnerungen archiviert');
      loadMemoryStats();
      loadAllMemories();
    } else {
      showToast('Fehler: ' + data.error, 'error');
    }
  } catch (error) {
    showToast('Fehler beim Archivieren: ' + error.message, 'error');
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
      showToast('Persönlichkeits-Einstellungen gespeichert');
    } else {
      showToast('Fehler: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('Fehler beim Speichern: ' + error.message, 'error');
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
      showToast('Brain-Konfiguration gespeichert');
    } else {
      showToast('Fehler beim Speichern: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('Fehler beim Speichern: ' + error.message, 'error');
  }
}

async function testBrainConnection() {
  try {
    showToast('Teste Verbindung...');
    const response = await fetch('/api/animazingpal/brain/test', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      showToast('✅ Verbindung erfolgreich!');
    } else {
      showToast('❌ Verbindung fehlgeschlagen: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('❌ Verbindung fehlgeschlagen: ' + error.message, 'error');
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
        ${persona.is_active ? '<span class="text-xs bg-green-600 text-white px-2 py-1 rounded">Aktiv</span>' : ''}
        ${persona.is_custom ? '<span class="text-xs bg-blue-600 text-white px-2 py-1 rounded ml-1">Custom</span>' : ''}
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" onclick="editPersona('${persona.name}')">✏️</button>
        ${persona.is_custom ? `<button class="btn btn-danger btn-sm" onclick="deletePersona('${persona.name}')">🗑️</button>` : ''}
      </div>
    `;
    personaList.appendChild(item);
  });
}

function updateActivePersonaSelect() {
  const select = document.getElementById('activePersonaSelect');
  if (!select) return;
  
  select.innerHTML = '<option value="">Keine ausgewählt</option>';
  
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
    showToast('Fehler: Catchphrases müssen ein gültiges JSON-Array sein', 'error');
    return;
  }
  
  if (!personaData.name || !personaData.system_prompt) {
    showToast('Name und System Prompt sind erforderlich', 'error');
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
      showToast('Persona gespeichert!');
      hidePersonaEditor();
      await loadPersonas();
    } else {
      showToast('Fehler: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('Fehler beim Speichern: ' + error.message, 'error');
  }
}

async function editPersona(personaName) {
  showPersonaEditor(personaName);
}

async function deletePersona(personaName) {
  if (!confirm(`Persona "${personaName}" wirklich löschen?`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/animazingpal/brain/personality/${personaName}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast('Persona gelöscht');
      await loadPersonas();
    } else {
      showToast('Fehler: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('Fehler beim Löschen: ' + error.message, 'error');
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
      showToast('Aktive Persona geändert: ' + result.personality.display_name);
      await loadPersonas();
    } else {
      showToast('Fehler: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('Fehler: ' + error.message, 'error');
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
      showToast('Brain Einstellungen gespeichert!');
    } else {
      showToast('Fehler: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('Fehler beim Speichern: ' + error.message, 'error');
  }
}

// Logic Matrix Functions
async function addLogicMatrixRule() {
  showToast('Logic Matrix Editor wird implementiert...', 'info');
  // Stub for future implementation
}

async function testLogicMatrix() {
  const eventType = document.getElementById('testEventType').value;
  const eventDataText = document.getElementById('testEventData').value;

  if (!eventType) {
    showToast('Bitte Event-Typ auswählen', 'error');
    return;
  }

  let eventData;
  try {
    eventData = JSON.parse(eventDataText);
  } catch (error) {
    showToast('Ungültiges JSON Format', 'error');
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
      showToast('Test erfolgreich durchgeführt');
    } else {
      resultsDiv.classList.remove('hidden');
      outputPre.textContent = `Fehler: ${result.error}`;
      showToast('Test fehlgeschlagen', 'error');
    }
  } catch (error) {
    showToast('Fehler beim Test: ' + error.message, 'error');
  }
}

// Persona Management Functions
async function createPersona() {
  const personaName = prompt('Neuer Persona Name:');
  if (!personaName) return;

  const systemPrompt = prompt('System Prompt (Persönlichkeitsbeschreibung):');
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
      showToast('Persona erstellt');
      // Reload personalities list
      loadPersonalities();
    } else {
      showToast('Fehler: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('Fehler beim Erstellen: ' + error.message, 'error');
  }
}

async function editPersonaFromSelector() {
  const personaSelector = document.getElementById('personaSelector');
  const selectedPersona = personaSelector.value;

  if (!selectedPersona) {
    showToast('Bitte eine Persona auswählen', 'error');
    return;
  }

  const systemPrompt = prompt(`Neuer System Prompt für "${selectedPersona}":`);
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
      showToast('Persona aktualisiert');
    } else {
      showToast('Fehler: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('Fehler beim Bearbeiten: ' + error.message, 'error');
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
      personaSelector.innerHTML = '<option value="">Persona auswählen...</option>';
      data.personalities.forEach(p => {
        const option = document.createElement('option');
        option.value = p.name;
        option.textContent = p.name;
        personaSelector.appendChild(option);
      });
      
      // Update active personality selector
      activePersonality.innerHTML = '<option value="">Keine ausgewählt</option>';
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
    showToast('Bitte eine Persona auswählen', 'error');
    return;
  }

  if (!confirm(`Persona "${selectedPersona}" wirklich löschen?`)) {
    return;
  }

  try {
    const response = await fetch(`/api/animazingpal/brain/personality/${selectedPersona}`, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (result.success) {
      showToast('Persona gelöscht');
      personaSelector.value = '';
      loadPersonalities();
    } else {
      showToast('Fehler: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('Fehler beim Löschen: ' + error.message, 'error');
  }
}

// ==================== Override Behaviors ====================

function updateOverridesUI(overrideBehaviors = []) {
  const overridesList = document.getElementById('overridesList');
  if (!overridesList) return;
  
  if (overrideBehaviors.length === 0) {
    overridesList.innerHTML = '<p class="text-gray-400">Keine Override Behaviors verfügbar</p>';
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
      showToast(`${behavior}: ${enabled ? 'Aktiviert' : 'Deaktiviert'}`);
    } else {
      showToast('Fehler: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('Fehler beim Umschalten: ' + error.message, 'error');
  }
}

// Make functions available globally
window.editPersona = editPersona;
window.deletePersona = deletePersona;
window.toggleOverride = toggleOverride;
