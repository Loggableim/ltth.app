/**
 * Talking Heads Admin UI JavaScript
 */

const socket = io();
let currentConfig = null;
let styleTemplates = {};
let logPollInterval = null;
let logCache = [];
const LOG_POLL_INTERVAL = 3000;
const MAX_ACTIVE_USERS = 1000; // Maximum active users to load initially
const MAX_SEARCH_RESULTS = 5000; // Maximum search results (supports larger communities)
let i18nClient = null;

// Default placeholder SVG as data URI (gray silhouette) - used when TikTok profile picture is not available
const DEFAULT_AVATAR_PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ccircle cx="50" cy="50" r="50" fill="%23374151"/%3E%3Ccircle cx="50" cy="35" r="18" fill="%236B7280"/%3E%3Cellipse cx="50" cy="75" rx="28" ry="22" fill="%236B7280"/%3E%3C/svg%3E';

// Style descriptions (fallbacks)
const styleDescriptions = {
  furry: 'Animal-inspired, soft and lively',
  tech: 'Futuristic neon/metallic look',
  medieval: 'Fantasy/medieval armor styling',
  noble: 'Elegant, aristocratic portrait',
  cartoon: 'Comic-style with bold colors',
  whimsical: 'Playful, fairytale vibe',
  realistic: 'Realistic portrait look'
};

const styleI18nKeys = {
  furry: {
    name: 'talking_heads_ui.styles.names.furry',
    description: 'talking_heads_ui.styles.descriptions.furry'
  },
  tech: {
    name: 'talking_heads_ui.styles.names.tech',
    description: 'talking_heads_ui.styles.descriptions.tech'
  },
  medieval: {
    name: 'talking_heads_ui.styles.names.medieval',
    description: 'talking_heads_ui.styles.descriptions.medieval'
  },
  noble: {
    name: 'talking_heads_ui.styles.names.noble',
    description: 'talking_heads_ui.styles.descriptions.noble'
  },
  cartoon: {
    name: 'talking_heads_ui.styles.names.cartoon',
    description: 'talking_heads_ui.styles.descriptions.cartoon'
  },
  whimsical: {
    name: 'talking_heads_ui.styles.names.whimsical',
    description: 'talking_heads_ui.styles.descriptions.whimsical'
  },
  realistic: {
    name: 'talking_heads_ui.styles.names.realistic',
    description: 'talking_heads_ui.styles.descriptions.realistic'
  }
};

const providerLabelKeys = {
  openai: 'talking_heads_ui.providers.openai',
  siliconflow: 'talking_heads_ui.providers.siliconflow',
  auto: 'talking_heads_ui.providers.auto'
};

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  await initI18n();
  applyTranslations();
  await loadConfig();
  setupEventListeners();
  startAnimationPolling();
  await loadAvailableSprites(); // Load sprites for manual assignment dropdown
  if (currentConfig?.debugLogging) {
    startLogPolling();
  }
  
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});

/**
 * Initialize client-side i18n
 */
async function initI18n() {
  if (typeof I18nClient === 'undefined') {
    return;
  }

  i18nClient = new I18nClient();
  await i18nClient.init();

  i18nClient.onLanguageChange(() => {
    applyTranslations();
    populateStyleGrid();
    renderLogEntries(logCache);
    if (currentConfig && typeof currentConfig.apiConfigured !== 'undefined') {
      updateApiStatus(currentConfig.apiConfigured, currentConfig.apiKeySource || 'none');
    }
  });
}

/**
 * Translate helper with fallback
 */
function t(key, fallback = null, params = {}) {
  if (i18nClient && typeof i18nClient.t === 'function') {
    const translated = i18nClient.t(key, params);
    if (translated && translated !== key) {
      return translated;
    }
  }

  if (fallback) {
    return fallback.replace(/\{\{?(\w+)\}?\}/g, (match, k) => (k in params ? params[k] : match));
  }

  return key;
}

/**
 * Apply translations to elements with data-i18n
 */
function applyTranslations() {
  if (!i18nClient) return;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const translation = t(key);
    if (translation && translation !== key) {
      if (el.dataset.i18nHtml === 'true') {
        el.innerHTML = translation;
      } else if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
        el.setAttribute('placeholder', translation);
      } else {
        el.textContent = translation;
      }
    }
  });
}

function getProviderLabel(provider) {
  const normalized = provider || 'auto';
  return t(providerLabelKeys[normalized], normalized === 'siliconflow' ? 'SiliconFlow' : normalized === 'openai' ? 'OpenAI' : 'Auto');
}

function getObsHudUrl() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/overlay/talking-heads/obs-hud`;
}

function toggleCustomSpawnInput(mode) {
  const wrapper = document.getElementById('customSpawnWrapper');
  if (!wrapper) return;
  wrapper.style.display = mode === 'custom' ? 'block' : 'none';
}

function copyObsHudUrl() {
  const input = document.getElementById('obsHudUrl');
  if (!input) return;
  input.select();
  input.setSelectionRange(0, input.value.length);
  navigator.clipboard.writeText(input.value).then(() => {
    showNotification(t('talking_heads_ui.notifications.copy_success', 'OBS HUD URL kopiert'), 'success');
  }).catch(() => {
    showNotification(t('talking_heads_ui.notifications.copy_failed', 'Konnte OBS HUD URL nicht kopieren'), 'error');
  });
}

/**
 * Load configuration from server
 */
async function loadConfig() {
  try {
    const response = await fetch('/api/talkingheads/config');
    const data = await response.json();

    if (data.success) {
      currentConfig = data.config;
      if (data.provider) {
        currentConfig.activeProvider = data.provider;
      }
      currentConfig.apiConfigured = data.apiConfigured;
      currentConfig.apiKeySource = data.apiKeySource;
      styleTemplates = data.styleTemplates;
      
      // Populate form fields
      populateForm(currentConfig);
      
      // Populate style grid
      populateStyleGrid();
      
      // Update API status
      updateApiStatus(data.apiConfigured, data.apiKeySource);
      
      // Load cache stats
      await loadCacheStats();
      await loadAvatarList();
      applyTranslations();
      
      // Enable save button now that config is loaded
      const saveBtn = document.getElementById('saveConfigBtn');
      if (saveBtn) {
        saveBtn.disabled = false;
      }
    } else {
      console.error('Failed to load config:', data);
      showNotification(t('talking_heads_ui.notifications.load_failed', 'Fehler beim Laden der Konfiguration: {{error}}', { error: data.error || 'Unbekannter Fehler' }), 'error');
    }
  } catch (error) {
    console.error('Failed to load config:', error);
    showNotification(t('talking_heads_ui.notifications.load_failed', 'Fehler beim Laden der Konfiguration: {{error}}', { error: error.message }), 'error');
  }
}

/**
 * Populate form with configuration
 */
function populateForm(config) {
  if (!config) {
    console.warn('No config provided to populateForm');
    return;
  }
  
  document.getElementById('enabledSwitch').checked = config.enabled || false;
  document.getElementById('debugLoggingSwitch').checked = config.debugLogging || false;
  document.getElementById('rolePermission').value = config.rolePermission || 'all';
  document.getElementById('minTeamLevel').value = config.minTeamLevel || 0;
  document.getElementById('fadeInDuration').value = config.fadeInDuration || 300;
  document.getElementById('fadeOutDuration').value = config.fadeOutDuration || 300;
  document.getElementById('blinkInterval').value = config.blinkInterval || 3000;
  document.getElementById('spawnAnimationMode').value = config.spawnAnimationMode || 'standard';
  document.getElementById('spawnAnimationUrl').value = config.spawnAnimationUrl || '';
  document.getElementById('spawnAnimationVolume').value = typeof config.spawnAnimationVolume === 'number' ? config.spawnAnimationVolume : 0.8;
  document.getElementById('obsHudEnabled').checked = config.obsHudEnabled !== false;
  const obsHudUrlInput = document.getElementById('obsHudUrl');
  if (obsHudUrlInput) {
    obsHudUrlInput.value = getObsHudUrl();
  }
  toggleCustomSpawnInput(config.spawnAnimationMode || 'standard');
  document.getElementById('obsEnabled').checked = config.obsEnabled || false;
  document.getElementById('cacheEnabled').checked = config.cacheEnabled || false;
  const providerSelect = document.getElementById('imageProvider');
  if (providerSelect) {
    providerSelect.value = config.imageProvider || 'auto';
  }
  
  // Convert cache duration from ms to days
  const cacheDays = Math.floor((config.cacheDuration || 2592000000) / 86400000);
  document.getElementById('cacheDuration').value = cacheDays;

  // Show/hide team level input
  toggleTeamLevelInput(config.rolePermission || 'all');
  
  // Show/hide debug log section
  toggleDebugLogSection(config.debugLogging || false);
}

/**
 * Populate style grid
 */
function populateStyleGrid() {
  const grid = document.getElementById('styleGrid');
  grid.innerHTML = '';
  
  Object.keys(styleTemplates).forEach(styleKey => {
    const style = styleTemplates[styleKey];
    const card = document.createElement('div');
    card.className = 'style-card';
    card.dataset.style = styleKey;
    
    if (currentConfig.defaultStyle === styleKey) {
      card.classList.add('selected');
    }
    
    const name = t(styleI18nKeys[styleKey]?.name, style.name || styleKey);
    const description = t(styleI18nKeys[styleKey]?.description, styleDescriptions[styleKey] || style.description || styleKey);

    card.innerHTML = `
      <div class="style-name">${name}</div>
      <div class="style-desc">${description}</div>
    `;
    
    card.addEventListener('click', () => selectStyle(styleKey));
    grid.appendChild(card);
  });
}

/**
 * Select a style
 */
function selectStyle(styleKey) {
  currentConfig.defaultStyle = styleKey;
  
  // Update visual selection
  document.querySelectorAll('.style-card').forEach(card => {
    if (card.dataset.style === styleKey) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Save button
  document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
  
  // Test API button
  document.getElementById('testApiBtn').addEventListener('click', testApi);
  
  // Test generation button
  const testGenBtn = document.getElementById('testGenerateBtn');
  if (testGenBtn) {
    testGenBtn.addEventListener('click', testGenerate);
  }

  const previewBtn = document.getElementById('previewTtsBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', previewTalkingHead);
  }

  const testAnimationBtn = document.getElementById('testAnimationBtn');
  if (testAnimationBtn) {
    testAnimationBtn.addEventListener('click', testAnimation);
  }

  const spawnModeSelect = document.getElementById('spawnAnimationMode');
  if (spawnModeSelect) {
    spawnModeSelect.addEventListener('change', (e) => toggleCustomSpawnInput(e.target.value));
  }

  const copyHudBtn = document.getElementById('copyObsHudUrlBtn');
  if (copyHudBtn) {
    copyHudBtn.addEventListener('click', copyObsHudUrl);
  }
  
  // Clear cache button
  document.getElementById('clearCacheBtn').addEventListener('click', clearCache);
  
  // Manual sprite assignment
  const sourceAvatarSelect = document.getElementById('sourceAvatarSelect');
  if (sourceAvatarSelect) {
    sourceAvatarSelect.addEventListener('change', handleSourceAvatarChange);
  }
  
  const assignSpriteBtn = document.getElementById('assignSpriteBtn');
  if (assignSpriteBtn) {
    assignSpriteBtn.addEventListener('click', assignManualSprite);
  }
  
  // Debug log controls
  const refreshLogsBtn = document.getElementById('refreshLogsBtn');
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', loadLogs);
  }
  
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', clearDebugLogs);
  }
  
  const autoRefreshLogs = document.getElementById('autoRefreshLogs');
  if (autoRefreshLogs) {
    autoRefreshLogs.addEventListener('change', (e) => {
      if (e.target.checked) {
        startLogPolling();
      } else {
        stopLogPolling();
      }
    });
  }
  
  // Debug logging toggle
  document.getElementById('debugLoggingSwitch').addEventListener('change', (e) => {
    toggleDebugLogSection(e.target.checked);
    if (e.target.checked) {
      showNotification(t('talking_heads_ui.notifications.debug_enabled', 'Debug-Logging aktiviert'), 'info');
      startLogPolling();
    } else {
      stopLogPolling();
    }
  });
  
  // Role permission change
  document.getElementById('rolePermission').addEventListener('change', (e) => {
    toggleTeamLevelInput(e.target.value);
  });

  // User assignment functionality
  const loadUsersBtn = document.getElementById('loadUsersBtn');
  if (loadUsersBtn) {
    loadUsersBtn.addEventListener('click', loadStreamUsers);
  }

  const userSearchInput = document.getElementById('userSearchInput');
  if (userSearchInput) {
    userSearchInput.addEventListener('input', (e) => filterUserList(e.target.value));
  }

  const userFilterSelect = document.getElementById('userFilterSelect');
  if (userFilterSelect) {
    userFilterSelect.addEventListener('change', (e) => filterUserList());
  }
  
  // Permission test button
  const testPermissionsBtn = document.getElementById('testPermissionsBtn');
  if (testPermissionsBtn) {
    testPermissionsBtn.addEventListener('click', testPermissions);
  }

  // Socket listener for auto-refresh when new avatars are generated
  socket.on('talkingheads:avatar:generated', (data) => {
    console.log('New avatar generated:', data);
    // Reload avatar list to show the new avatar
    loadAvatarList().catch(err => console.error('Failed to reload avatar list:', err));
    // Show notification
    showNotification(t('talking_heads_ui.notifications.avatar_generated', `Avatar for ${data.username} generated`), 'success');
  });
}

/**
 * Save configuration
 */
async function saveConfig() {
  try {
    // Wait for config to load if not ready
    if (!currentConfig) {
      showNotification(t('talking_heads_ui.notifications.config_loading', 'Bitte warten Sie, bis die Konfiguration geladen ist...'), 'info');
      return;
    }
    
    const config = {
      enabled: document.getElementById('enabledSwitch').checked,
      debugLogging: document.getElementById('debugLoggingSwitch').checked,
      defaultStyle: currentConfig.defaultStyle || 'cartoon',
      rolePermission: document.getElementById('rolePermission').value,
      minTeamLevel: parseInt(document.getElementById('minTeamLevel').value) || 0,
      fadeInDuration: parseInt(document.getElementById('fadeInDuration').value) || 300,
      fadeOutDuration: parseInt(document.getElementById('fadeOutDuration').value) || 300,
      blinkInterval: parseInt(document.getElementById('blinkInterval').value) || 3000,
      spawnAnimationMode: document.getElementById('spawnAnimationMode').value,
      spawnAnimationUrl: document.getElementById('spawnAnimationUrl').value.trim(),
      spawnAnimationVolume: Math.min(1, Math.max(0, parseFloat(document.getElementById('spawnAnimationVolume').value) || 0.8)),
      obsHudEnabled: document.getElementById('obsHudEnabled').checked,
      obsEnabled: document.getElementById('obsEnabled').checked,
      cacheEnabled: document.getElementById('cacheEnabled').checked,
      cacheDuration: parseInt(document.getElementById('cacheDuration').value) * 86400000,
      imageProvider: document.getElementById('imageProvider')?.value || 'auto'
    };

    const response = await fetch('/api/talkingheads/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    const data = await response.json();

    if (data.success) {
      currentConfig = data.config;
      currentConfig.apiConfigured = data.apiConfigured;
      currentConfig.apiKeySource = data.apiKeySource;
      showNotification(t('talking_heads_ui.notifications.save_success', 'Konfiguration gespeichert'), 'success');
      appendClientLog(t('talking_heads_ui.notifications.save_success', 'Konfiguration gespeichert'), 'info');
      if (currentConfig.debugLogging) {
        startLogPolling();
      } else {
        stopLogPolling();
      }
      
      // Refresh icons
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    } else {
      showNotification(t('talking_heads_ui.notifications.save_failed', 'Fehler beim Speichern: {{error}}', { error: data.error || 'Unbekannter Fehler' }), 'error');
      appendClientLog(t('talking_heads_ui.notifications.save_failed', 'Fehler beim Speichern: {{error}}', { error: data.error || 'Unbekannter Fehler' }), 'warn');
      console.error('Config save error:', data);
    }
  } catch (error) {
    console.error('Failed to save config:', error);
    showNotification(t('talking_heads_ui.notifications.save_failed', 'Fehler beim Speichern der Konfiguration: {{error}}', { error: error.message }), 'error');
    appendClientLog(t('talking_heads_ui.notifications.save_failed', 'Fehler beim Speichern der Konfiguration: {{error}}', { error: error.message }), 'error');
  }
}

/**
 * Test API connection
 */
async function testApi() {
  const btn = document.getElementById('testApiBtn');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="inline-block w-4 h-4 mr-2 animate-spin"></i> ${t('talking_heads_ui.buttons.testing', 'Teste...')}`;
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  try {
    const response = await fetch('/api/talkingheads/test-api', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      if (!currentConfig) {
        currentConfig = {};
      }
      if (data.provider) {
        currentConfig.activeProvider = data.provider;
      }
      showNotification(t('talking_heads_ui.notifications.api_test_success', 'API-Verbindung erfolgreich'), 'success');
      appendClientLog(t('talking_heads_ui.notifications.api_test_success', 'API-Verbindung erfolgreich'), 'info');
      updateApiStatus(true, data.apiKeySource || 'global_settings');
    } else {
      showNotification(t('talking_heads_ui.notifications.api_test_failed', 'API-Verbindung fehlgeschlagen: {{error}}', { error: data.error || 'Unbekannter Fehler' }), 'error');
      appendClientLog(t('talking_heads_ui.notifications.api_test_failed', 'API-Verbindung fehlgeschlagen: {{error}}', { error: data.error || 'Unbekannter Fehler' }), 'error');
      updateApiStatus(false, 'none');
    }
  } catch (error) {
    console.error('API test failed:', error);
    showNotification(t('talking_heads_ui.notifications.api_test_error', 'API-Test fehlgeschlagen: {{error}}', { error: error.message }), 'error');
    appendClientLog(t('talking_heads_ui.notifications.api_test_error', 'API-Test fehlgeschlagen: {{error}}', { error: error.message }), 'error');
    updateApiStatus(false, 'none');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

/**
 * Test avatar generation
 */
async function testGenerate() {
  const btn = document.getElementById('testGenerateBtn');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="inline-block w-4 h-4 mr-2 animate-spin"></i> ${t('talking_heads_ui.buttons.generating', 'Generiere...')}`;
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  try {
    const styleKey = currentConfig?.defaultStyle || 'cartoon';
    
    const startMessage = t('talking_heads_ui.notifications.generate_start', 'Starte Test-Generierung... (kann 15-30 Sekunden dauern)');
    showNotification(`🎨 ${startMessage}`, 'info');
    appendClientLog(startMessage, 'info');
    
    const response = await fetch('/api/talkingheads/test-generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ styleKey })
    });

    const data = await response.json();

    if (data.success) {
      const spriteCount = typeof data.sprites === 'number' ? data.sprites : 0;
      showNotification(t('talking_heads_ui.notifications.generate_success', 'Test-Avatar erfolgreich generiert! ({{sprites}} Sprites erstellt)', { sprites: spriteCount }), 'success');
      appendClientLog(t('talking_heads_ui.notifications.generate_success', 'Test-Avatar erfolgreich generiert! ({{sprites}} Sprites erstellt)', { sprites: spriteCount }), 'info');
      await loadAvatarList();
    } else {
      showNotification(t('talking_heads_ui.notifications.generate_failed', 'Avatar-Generierung fehlgeschlagen: {{error}}', { error: data.error || 'Unbekannter Fehler' }), 'error');
      appendClientLog(t('talking_heads_ui.notifications.generate_failed', 'Avatar-Generierung fehlgeschlagen: {{error}}', { error: data.error || 'Unbekannter Fehler' }), 'error');
    }
  } catch (error) {
    console.error('Test generation failed:', error);
    showNotification(t('talking_heads_ui.notifications.generate_error', 'Test-Generierung fehlgeschlagen: {{error}}', { error: error.message }), 'error');
    appendClientLog(t('talking_heads_ui.notifications.generate_error', 'Test-Generierung fehlgeschlagen: {{error}}', { error: error.message }), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

/**
 * Preview Talking Head with local TTS
 */
async function previewTalkingHead() {
  const btn = document.getElementById('previewTtsBtn');
  const input = document.getElementById('previewTtsText');
  if (!btn) return;

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="inline-block w-4 h-4 mr-2 animate-spin"></i> Wird vorbereitet...`;
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  try {
    const text = (input?.value || '').trim() || 'Hallo! Dies ist eine Talking Heads Vorschau.';
    
    showNotification('Vorschau wird vorbereitet...', 'info');
    
    const response = await fetch('/api/talkingheads/preview-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await response.json();
    
    if (data.success) {
      if (data.avatarGenerated) {
        showNotification('Test-Avatar wurde generiert! Vorschau läuft im OBS HUD.', 'success');
      } else {
        showNotification('Vorschau gestartet – bitte im OBS HUD prüfen.', 'info');
      }
    } else {
      // Show specific error message with details if available
      let errorMsg = data.error || 'Unbekannter Fehler';
      if (data.details) {
        errorMsg += ` - ${data.details}`;
      }
      showNotification(`Vorschau fehlgeschlagen: ${errorMsg}`, 'error');
      appendClientLog(`Preview fehlgeschlagen: ${errorMsg}`, 'error');
    }
  } catch (error) {
    console.error('Preview failed:', error);
    showNotification(`Vorschau fehlgeschlagen: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

/**
 * Test animation without TTS (for debugging)
 */
async function testAnimation() {
  const btn = document.getElementById('testAnimationBtn');
  if (!btn) return;

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="inline-block w-4 h-4 mr-2 animate-spin"></i> Starte Animation...`;
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  try {
    showNotification('Starte Test-Animation (ohne TTS)...', 'info');
    
    const response = await fetch('/api/talkingheads/test-animation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId: 'test_animation_user',
        username: 'Animation Test',
        duration: 5000 
      })
    });
    const data = await response.json();
    
    if (data.success) {
      showNotification('Animation gestartet! Prüfen Sie das OBS HUD (Browser-Konsole für Details).', 'success');
      appendClientLog(`Test-Animation gestartet (${data.duration}ms)`, 'info');
    } else {
      showNotification(`Animation fehlgeschlagen: ${data.error || 'Unbekannter Fehler'}`, 'error');
      appendClientLog(`Animation fehlgeschlagen: ${data.error}`, 'error');
    }
  } catch (error) {
    console.error('Test animation failed:', error);
    showNotification(`Animation fehlgeschlagen: ${error.message}`, 'error');
    appendClientLog(`Animation fehlgeschlagen: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

/**
 * Clear cache
 */
async function clearCache() {
  if (!confirm(t('talking_heads_ui.notifications.cache_clear_confirm', 'Möchten Sie wirklich alle gecachten Avatare löschen?'))) {
    return;
  }

  try {
    const response = await fetch('/api/talkingheads/cache/clear', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      showNotification(t('talking_heads_ui.notifications.cache_cleared', '{{count}} Avatare gelöscht', { count: data.deleted }), 'success');
      appendClientLog(t('talking_heads_ui.notifications.cache_cleared', '{{count}} Avatare gelöscht', { count: data.deleted }), 'info');
      await loadCacheStats();
      await loadAvatarList();
    } else {
      showNotification(t('talking_heads_ui.notifications.cache_clear_failed', 'Fehler beim Löschen des Cache'), 'error');
      appendClientLog(t('talking_heads_ui.notifications.cache_clear_failed', 'Fehler beim Löschen des Cache'), 'error');
    }
  } catch (error) {
    console.error('Failed to clear cache:', error);
    showNotification(t('talking_heads_ui.notifications.cache_clear_failed', 'Fehler beim Löschen des Cache'), 'error');
    appendClientLog(t('talking_heads_ui.notifications.cache_clear_failed', 'Fehler beim Löschen des Cache'), 'error');
  }
}

/**
 * Load cache statistics
 */
async function loadCacheStats() {
  try {
    const response = await fetch('/api/talkingheads/cache/stats');
    const data = await response.json();

    if (data.success) {
      const stats = data.stats;
      document.getElementById('cacheCount').textContent = stats.totalAvatars || 0;
    }
  } catch (error) {
    console.error('Failed to load cache stats:', error);
  }
}

/**
 * Load cached avatars for preview grid
 */
async function loadAvatarList() {
  const container = document.getElementById('avatarList');
  if (!container) return;

  try {
    const response = await fetch('/api/talkingheads/cache/list');
    const data = await response.json();
    if (data.success) {
      renderAvatarList(data.avatars || []);
    }
  } catch (error) {
    console.error('Failed to load avatar list:', error);
  }
}

function renderAvatarList(avatars = []) {
  const container = document.getElementById('avatarList');
  if (!container) return;

  if (!avatars.length) {
    container.innerHTML = '<div class="form-help">Noch keine Avatare generiert.</div>';
    return;
  }

  container.innerHTML = avatars.map((avatar) => {
    const idleSrc = avatar.sprites?.idle_neutral || '';
    const blinkSrc = avatar.sprites?.blink || '';
    const speakOpenSrc = avatar.sprites?.speak_open || '';
    const createdLabel = avatar.createdAt ? new Date(avatar.createdAt).toLocaleDateString() : '';
    
    return `
      <div class="avatar-card">
        <div class="avatar-sprites-row">
          <div style="text-align: center;">
            <img src="${idleSrc}" alt="${escapeHtml(avatar.username)} - Idle" class="avatar-sprite-mini">
            <div class="sprite-label">Idle</div>
          </div>
          <div style="text-align: center;">
            <img src="${blinkSrc}" alt="${escapeHtml(avatar.username)} - Blink" class="avatar-sprite-mini">
            <div class="sprite-label">Blink</div>
          </div>
          <div style="text-align: center;">
            <img src="${speakOpenSrc}" alt="${escapeHtml(avatar.username)} - Speak" class="avatar-sprite-mini">
            <div class="sprite-label">Speak</div>
          </div>
        </div>
        <div class="style-name">${escapeHtml(avatar.username)}</div>
        <div class="style-desc">${escapeHtml(avatar.styleKey || '')}</div>
        <div class="log-meta">${createdLabel}</div>
        <div style="margin-top: 8px;">
          <a href="/api/talkingheads/export/${encodeURIComponent(avatar.userId)}" 
             class="btn btn-secondary" 
             style="font-size: 0.75rem; padding: 4px 8px; display: inline-flex; align-items: center; gap: 4px;"
             download>
            <i data-lucide="download" style="width: 14px; height: 14px;"></i>
            ZIP Download
          </a>
        </div>
      </div>
    `;
  }).join('');
  
  // Re-initialize Lucide icons for new elements
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/**
 * Load available sprites for manual assignment
 */
async function loadAvailableSprites() {
  try {
    const response = await fetch('/api/talkingheads/available-sprites?limit=200');
    const data = await response.json();
    
    if (data.success) {
      const select = document.getElementById('sourceAvatarSelect');
      if (!select) return;
      
      // Clear and populate dropdown
      select.innerHTML = '<option value="">-- Bitte Avatar wählen --</option>';
      
      data.sprites.forEach(sprite => {
        const option = document.createElement('option');
        option.value = sprite.userId;
        option.textContent = `${sprite.username} (${sprite.styleKey})`;
        option.dataset.previewUrl = sprite.previewUrl;
        option.dataset.username = sprite.username;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Failed to load available sprites:', error);
  }
}

/**
 * Handle source avatar selection change
 */
function handleSourceAvatarChange(e) {
  const select = e.target;
  const selectedOption = select.options[select.selectedIndex];
  const previewArea = document.getElementById('spritePreviewArea');
  const previewImg = document.getElementById('spritePreviewImg');
  const assignBtn = document.getElementById('assignSpriteBtn');
  
  if (selectedOption.value && selectedOption.dataset.previewUrl) {
    previewImg.src = selectedOption.dataset.previewUrl;
    previewArea.style.display = 'block';
    assignBtn.disabled = false;
  } else {
    previewArea.style.display = 'none';
    assignBtn.disabled = true;
  }
}

/**
 * Assign sprites manually from one user to another
 */
async function assignManualSprite() {
  const targetUserInput = document.getElementById('targetUserSearch');
  const sourceSelect = document.getElementById('sourceAvatarSelect');
  
  if (!targetUserInput || !sourceSelect) return;
  
  const targetUser = targetUserInput.value.trim();
  const sourceUserId = sourceSelect.value;
  const selectedOption = sourceSelect.options[sourceSelect.selectedIndex];
  
  if (!targetUser) {
    showNotification('Bitte Ziel-User eingeben', 'error');
    return;
  }
  
  if (!sourceUserId) {
    showNotification('Bitte Quell-Avatar auswählen', 'error');
    return;
  }
  
  try {
    appendClientLog(`Assigning sprites from ${selectedOption.dataset.username} to ${targetUser}...`, 'info');
    
    const response = await fetch('/api/talkingheads/assign-manual-sprite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: targetUser,
        username: targetUser,
        targetUserId: sourceUserId
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showNotification(`Sprites erfolgreich zugewiesen: ${data.sourceUsername} → ${data.username}`, 'success');
      appendClientLog(`Sprites assigned: ${data.sourceUsername} → ${data.username}`, 'success');
      
      // Reload avatar list
      await loadAvatarList();
      await loadCacheStats();
      
      // Clear inputs
      targetUserInput.value = '';
      sourceSelect.selectedIndex = 0;
      document.getElementById('spritePreviewArea').style.display = 'none';
      document.getElementById('assignSpriteBtn').disabled = true;
    } else {
      throw new Error(data.error || 'Sprite assignment failed');
    }
  } catch (error) {
    console.error('Failed to assign sprite:', error);
    showNotification(`Fehler: ${error.message}`, 'error');
    appendClientLog(`Sprite assignment failed: ${error.message}`, 'error');
  }
}

/**
 * Clear debug logs display
 */
function clearDebugLogs() {
  const output = document.getElementById('debugLogOutput');
  if (output) {
    output.innerHTML = '';
    showNotification('Debug-Logs geleert', 'info');
  }
}

/**
 * Update API status indicator
 */
function updateApiStatus(configured, source) {
  const statusBadge = document.getElementById('apiStatus');
  const warning = document.getElementById('apiKeyWarning');
  if (!statusBadge) return;
  const provider = currentConfig?.activeProvider || currentConfig?.imageProvider || 'auto';
  const providerLabel = getProviderLabel(provider);
  if (currentConfig) {
    currentConfig.apiConfigured = configured;
    currentConfig.apiKeySource = source;
  }
  
  if (configured) {
    statusBadge.className = 'status-badge badge-success';
    statusBadge.innerHTML = `<i data-lucide="check-circle" class="inline-block w-4 h-4"></i> ${t('talking_heads_ui.status.api_configured', 'API konfiguriert ({{provider}})', { provider: providerLabel })}`;
    if (warning) {
      warning.style.display = 'none';
    }
  } else {
    statusBadge.className = 'status-badge badge-warning';
    statusBadge.innerHTML = `<i data-lucide="alert-triangle" class="inline-block w-4 h-4"></i> ${t('talking_heads_ui.status.api_missing', 'Kein API-Key ({{provider}})', { provider: providerLabel })}`;
    if (warning) {
      warning.style.display = 'block';
    }
  }
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/**
 * Toggle debug log section visibility
 */
function toggleDebugLogSection(show) {
  const section = document.getElementById('debugLogSection');
  if (section) {
    section.style.display = show ? 'block' : 'none';
  }

  if (show) {
    startLogPolling();
  } else {
    stopLogPolling();
  }
}

/**
 * Toggle team level input visibility
 */
function toggleTeamLevelInput(permission) {
  const wrapper = document.getElementById('minTeamLevelWrapper');
  wrapper.style.display = permission === 'team' ? 'block' : 'none';
}

/**
 * Load active animations
 */
async function loadActiveAnimations() {
  try {
    const response = await fetch('/api/talkingheads/animations');
    
    // Silently ignore 404 errors (endpoint might not be available during initialization)
    if (response.status === 404) {
      return;
    }
    
    const data = await response.json();

    if (data.success) {
      const container = document.getElementById('animationList');
      const section = document.getElementById('activeAnimationsSection');
      const countElement = document.getElementById('activeAnimations');
      
      countElement.textContent = data.animations.length;
      
      if (data.animations.length === 0) {
        section.style.display = 'none';
      } else {
        section.style.display = 'block';
        container.innerHTML = data.animations.map(anim => `
          <div class="animation-item">
            <div>
              <strong>${anim.username}</strong> <span style="color: var(--color-text-secondary);">(${anim.userId})</span>
            </div>
            <div>
              <span class="status-badge badge-info">${anim.state}</span>
              <span style="color: var(--color-text-secondary); margin-left: 8px;">${Math.floor(anim.duration / 1000)}s</span>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (error) {
    // Silently ignore errors during polling
    // console.error('Failed to load active animations:', error);
  }
}

/**
 * Start polling for active animations
 */
function startAnimationPolling() {
  loadActiveAnimations();
  setInterval(loadActiveAnimations, 2000);
}

/**
 * Test permission settings with different user types
 */
async function testPermissions() {
  const btn = document.getElementById('testPermissionsBtn');
  const resultDiv = document.getElementById('permissionTestResult');
  
  if (!btn || !resultDiv) return;
  
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="inline-block w-4 h-4 mr-2 animate-spin"></i> Teste...';
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  try {
    const response = await fetch('/api/talkingheads/test-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rolePermission: currentConfig?.rolePermission || 'all',
        minTeamLevel: currentConfig?.minTeamLevel || 0
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Display test results in a formatted way
      let html = '<div style="margin-top: 8px;"><strong>Berechtigungs-Test:</strong></div>';
      html += '<div style="margin-top: 8px; font-size: 0.875rem;">';
      
      data.testResults.forEach(test => {
        const icon = test.eligible ? '✅' : '❌';
        const color = test.eligible ? 'color: #10b981;' : 'color: #ef4444;';
        html += `<div style="margin-bottom: 4px;"><span style="${color}">${icon}</span> <strong>${test.userType}:</strong> ${test.reason}</div>`;
      });
      
      html += '</div>';
      
      resultDiv.innerHTML = html;
      resultDiv.className = 'alert alert-info';
      resultDiv.style.display = 'block';
      
      showNotification('Berechtigungs-Test abgeschlossen', 'info');
    } else {
      resultDiv.innerHTML = `<strong>Fehler:</strong> ${data.error}`;
      resultDiv.className = 'alert alert-warning';
      resultDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Permission test failed:', error);
    resultDiv.innerHTML = `<strong>Fehler:</strong> ${error.message}`;
    resultDiv.className = 'alert alert-warning';
    resultDiv.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

function escapeHtml(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadLogs() {
  try {
    const response = await fetch('/api/talkingheads/logs?limit=150');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.success && Array.isArray(data.logs)) {
      logCache = data.logs;
      renderLogEntries(logCache);
    }
  } catch (error) {
    console.error('Failed to load logs:', error);
  }
}

function renderLogEntries(logs = []) {
  const container = document.getElementById('debugLogOutput');
  if (!container) return;

  if (!logs.length) {
    container.textContent = t('talking_heads_ui.logs.empty', 'Noch keine Log-Einträge verfügbar.');
    return;
  }

  // Color mapping for log levels
  const levelColors = {
    error: '#f48771',
    warn: '#dcdcaa',
    info: '#4ec9b0',
    debug: '#858585'
  };

  container.innerHTML = logs.map((log) => {
    const level = (log.level || 'info').toLowerCase();
    const color = levelColors[level] || '#d4d4d4';
    const timeLabel = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';
    const message = escapeHtml(log.message || '');
    
    return `<div style="color: ${color}; margin-bottom: 4px;">[${timeLabel}] [${level.toUpperCase()}] ${message}</div>`;
  }).join('');
  
  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function appendClientLog(message, level = 'info') {
  const entry = {
    level,
    message: `[UI] ${message}`,
    timestamp: new Date().toISOString()
  };
  logCache.push(entry);
  if (logCache.length > 200) {
    logCache.shift();
  }
  renderLogEntries(logCache);
}

function startLogPolling() {
  if (logPollInterval) return;
  loadLogs();
  logPollInterval = setInterval(loadLogs, LOG_POLL_INTERVAL);
}

function stopLogPolling() {
  if (logPollInterval) {
    clearInterval(logPollInterval);
    logPollInterval = null;
  }
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `alert ${type === 'error' ? 'alert-warning' : 'alert-info'}`;
  toast.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px; animation: slideIn 0.3s ease-out;';
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// User assignment functionality
let allUsers = [];
let filteredUsers = [];
let currentFilterMode = 'active'; // Track current filter mode
let searchInProgress = false; // Track if a search is in progress

/**
 * Load users from stream database
 */
async function loadStreamUsers() {
  const loadBtn = document.getElementById('loadUsersBtn');
  const userListContainer = document.getElementById('userListContainer');
  const userCountLabel = document.getElementById('userCountLabel');
  const userFilterSelect = document.getElementById('userFilterSelect');
  const userSearchInput = document.getElementById('userSearchInput');
  
  try {
    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i data-lucide="loader" class="inline-block w-4 h-4 mr-2 animate-spin"></i> Lade...';
    
    currentFilterMode = userFilterSelect?.value || 'active';
    const limit = currentFilterMode === 'active' ? MAX_ACTIVE_USERS : MAX_SEARCH_RESULTS;
    
    const response = await fetch(`/api/talkingheads/users?limit=${limit}&filter=${currentFilterMode}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Fehler beim Laden der User');
    }
    
    allUsers = data.users || [];
    filteredUsers = [...allUsers];
    
    const filterLabel = currentFilterMode === 'active' ? ' (aktiver Stream)' : ' (global)';
    userCountLabel.textContent = `${allUsers.length} User geladen${filterLabel}`;
    userListContainer.style.display = 'block';
    
    // Clear search input when loading
    if (userSearchInput) {
      userSearchInput.value = '';
    }
    
    renderUserList(filteredUsers);
    showNotification(`${allUsers.length} User erfolgreich geladen`, 'info');
    
  } catch (error) {
    console.error('Failed to load users:', error);
    showNotification('Fehler beim Laden der User: ' + error.message, 'error');
  } finally {
    loadBtn.disabled = false;
    loadBtn.innerHTML = '<i data-lucide="refresh-cw" class="inline-block w-4 h-4 mr-2"></i> User aus Stream laden';
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

/**
 * Filter user list based on search input
 * When user types, search globally across all users
 */
async function filterUserList(searchTerm) {
  const userSearchInput = document.getElementById('userSearchInput');
  const userCountLabel = document.getElementById('userCountLabel');
  const term = (searchTerm !== undefined ? searchTerm : userSearchInput?.value || '').toLowerCase().trim();
  
  // If no search term, show current loaded users
  if (!term) {
    filteredUsers = [...allUsers];
    renderUserList(filteredUsers);
    return;
  }
  
  // If user is searching, always search globally (not just in current list)
  // This allows finding offline users via search
  if (!searchInProgress) {
    searchInProgress = true;
    
    try {
      // Search globally with a higher limit
      const response = await fetch(`/api/talkingheads/users?limit=${MAX_SEARCH_RESULTS}&filter=all&search=${encodeURIComponent(term)}`);
      const data = await response.json();
      
      if (data.success) {
        filteredUsers = data.users || [];
        userCountLabel.textContent = `${filteredUsers.length} User gefunden (Suche: "${term}")`;
        renderUserList(filteredUsers);
      }
    } catch (error) {
      console.error('Search failed:', error);
      // Fallback to local filtering if search fails
      filteredUsers = allUsers.filter(user => 
        user.username.toLowerCase().includes(term) ||
        (user.uniqueId && user.uniqueId.toLowerCase().includes(term))
      );
      renderUserList(filteredUsers);
    } finally {
      searchInProgress = false;
    }
  }
}

/**
 * Render user list
 */
function renderUserList(users) {
  const container = document.getElementById('userList');
  if (!container) return;
  
  if (!users || users.length === 0) {
    container.innerHTML = '<div class="form-help" style="text-align: center; padding: 20px;">Keine User gefunden</div>';
    return;
  }
  
  container.innerHTML = users.map(user => {
    // Use TikTok profile picture URL, fallback to placeholder
    const avatarUrl = user.profilePictureUrl || DEFAULT_AVATAR_PLACEHOLDER;
    const hasAvatar = user.hasAvatar;
    const avatarStatus = hasAvatar ? `<span class="avatar-status">✓ Avatar vorhanden</span>` : '';
    const itemClass = hasAvatar ? 'user-item has-avatar' : 'user-item';
    
    return `
      <div class="${itemClass}" data-user-id="${escapeHtml(user.userId)}">
        <img src="${avatarUrl}" 
             alt="${escapeHtml(user.username)}" 
             class="user-avatar" 
             data-fallback="${DEFAULT_AVATAR_PLACEHOLDER}">
        <div class="user-info">
          <div class="user-name">${escapeHtml(user.username)}</div>
          <div class="user-stats">
            💎 ${user.totalCoins} Coins | 🎁 ${user.totalGifts} Gifts | 💬 ${user.totalComments} Comments
          </div>
        </div>
        <div class="user-actions">
          ${avatarStatus}
          <button class="btn-assign" 
                  data-user-id="${escapeHtml(user.userId)}" 
                  data-username="${escapeHtml(user.username)}" 
                  data-profile-url="${escapeHtml(user.profilePictureUrl || '')}" 
                  data-has-avatar="${hasAvatar ? 'true' : 'false'}"
                  ${hasAvatar ? 'title="Avatar neu generieren"' : ''}>
            ${hasAvatar ? 'Neu generieren' : 'Avatar generieren'}
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  // Add event listeners for image error handling
  const avatarImages = container.querySelectorAll('.user-avatar');
  avatarImages.forEach(img => {
    img.addEventListener('error', function() {
      // Use the global placeholder constant
      this.src = this.dataset.fallback || DEFAULT_AVATAR_PLACEHOLDER;
    });
  });
  
  // Add event listeners to all assign buttons
  const assignButtons = container.querySelectorAll('.btn-assign');
  assignButtons.forEach(button => {
    button.addEventListener('click', () => {
      const userId = button.dataset.userId;
      const username = button.dataset.username;
      const profileUrl = button.dataset.profileUrl;
      const hasAvatar = button.dataset.hasAvatar === 'true';
      assignTalkingHead(userId, username, profileUrl, hasAvatar);
    });
  });
}

/**
 * Assign/generate talking head for a user
 */
async function assignTalkingHead(userId, username, profileImageUrl, isRegeneration) {
  try {
    const confirmMsg = isRegeneration
      ? `Möchtest du den Talking Head für "${username}" neu generieren? Dies kann bis zu 30 Sekunden dauern.`
      : `Möchtest du einen Talking Head für "${username}" generieren? Dies kann bis zu 30 Sekunden dauern.`;
    
    if (!confirm(confirmMsg)) {
      return;
    }
    
    showNotification(`Generiere Talking Head für ${username}...`, 'info');
    
    const response = await fetch('/api/talkingheads/assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        username,
        profileImageUrl,
        styleKey: currentConfig?.defaultStyle || 'cartoon'
      })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Fehler bei der Generierung');
    }
    
    // Show appropriate success message with LLM feedback
    let message = `Talking Head für ${username} erfolgreich generiert`;
    if (data.llmAnalysisUsed) {
      message += ' (mit LLM-Analyse)';
    } else if (data.llmFallbackReason) {
      message += ` (Standard-Prompt: ${data.llmFallbackReason})`;
    }
    showNotification(message + '!', 'info');
    
    // Reload user list and avatar list
    await loadStreamUsers();
    await loadAvatarList();
    
  } catch (error) {
    console.error('Failed to assign talking head:', error);
    showNotification('Fehler: ' + error.message, 'error');
  }
}

