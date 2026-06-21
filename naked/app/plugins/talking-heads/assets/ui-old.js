/**
 * Talking Heads Admin UI JavaScript
 */

const socket = io();
let currentConfig = null;
let styleTemplates = {};

// Style descriptions
const styleDescriptions = {
  furry: 'Animierter tierischer Charakter, weich, lebendig',
  tech: 'Futuristischer High-Tech-Look, Neon/Metallic',
  medieval: 'Fantasy/Mittelalter, Stoff/Leder/Armor',
  noble: 'Edler aristokratischer Stil',
  cartoon: 'Cartoon-Look, kräftige Farben',
  whimsical: 'Märchenhafte, verspielte Gestaltung',
  realistic: 'Realistischer Portrait-Look'
};

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  setupEventListeners();
  startAnimationPolling();
});

/**
 * Load configuration from server
 */
async function loadConfig() {
  try {
    const response = await fetch('/api/talkingheads/config');
    const data = await response.json();

    if (data.success) {
      currentConfig = data.config;
      styleTemplates = data.styleTemplates;
      
      // Populate form fields
      populateForm(currentConfig);
      
      // Update API status
      updateApiStatus(data.apiConfigured);
      
      // Load cache stats
      await loadCacheStats();
    }
  } catch (error) {
    console.error('Failed to load config:', error);
    showNotification('Fehler beim Laden der Konfiguration', 'error');
  }
}

/**
 * Populate form with configuration
 */
function populateForm(config) {
  document.getElementById('enabledSwitch').checked = config.enabled || false;
  document.getElementById('debugLoggingSwitch').checked = config.debugLogging || false;
  document.getElementById('imageApiUrl').value = config.imageApiUrl || '';
  document.getElementById('imageApiKey').value = config.imageApiKey || '';
  document.getElementById('defaultStyle').value = config.defaultStyle || 'cartoon';
  document.getElementById('rolePermission').value = config.rolePermission || 'all';
  document.getElementById('minTeamLevel').value = config.minTeamLevel || 0;
  document.getElementById('fadeInDuration').value = config.fadeInDuration || 300;
  document.getElementById('fadeOutDuration').value = config.fadeOutDuration || 300;
  document.getElementById('blinkInterval').value = config.blinkInterval || 3000;
  document.getElementById('obsEnabled').checked = config.obsEnabled || false;
  document.getElementById('cacheEnabled').checked = config.cacheEnabled || false;
  
  // Convert cache duration from ms to days
  const cacheDays = Math.floor((config.cacheDuration || 2592000000) / 86400000);
  document.getElementById('cacheDuration').value = cacheDays;

  // Update style description
  updateStyleDescription(config.defaultStyle);
  
  // Show/hide team level input
  toggleTeamLevelInput(config.rolePermission);
  
  // Show/hide debug log section
  toggleDebugLogSection(config.debugLogging);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Save button
  document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
  
  // Test API button
  document.getElementById('testApiBtn').addEventListener('click', testApi);
  
  // Debug logging toggle
  document.getElementById('debugLoggingSwitch').addEventListener('change', (e) => {
    toggleDebugLogSection(e.target.checked);
    if (e.target.checked) {
      showNotification('Debug-Logging aktiviert - Details werden in Log-Datei geschrieben', 'info');
    }
  });
  
  // Clear cache button
  document.getElementById('clearCacheBtn').addEventListener('click', clearCache);
  
  // Style change
  document.getElementById('defaultStyle').addEventListener('change', (e) => {
    updateStyleDescription(e.target.value);
  });
  
  // Role permission change
  document.getElementById('rolePermission').addEventListener('change', (e) => {
    toggleTeamLevelInput(e.target.value);
  });
}

/**
 * Save configuration
 */
async function saveConfig() {
  try {
    const config = {
      enabled: document.getElementById('enabledSwitch').checked,
      debugLogging: document.getElementById('debugLoggingSwitch').checked,
      imageApiUrl: document.getElementById('imageApiUrl').value,
      imageApiKey: document.getElementById('imageApiKey').value,
      defaultStyle: document.getElementById('defaultStyle').value,
      rolePermission: document.getElementById('rolePermission').value,
      minTeamLevel: parseInt(document.getElementById('minTeamLevel').value) || 0,
      fadeInDuration: parseInt(document.getElementById('fadeInDuration').value) || 300,
      fadeOutDuration: parseInt(document.getElementById('fadeOutDuration').value) || 300,
      blinkInterval: parseInt(document.getElementById('blinkInterval').value) || 3000,
      obsEnabled: document.getElementById('obsEnabled').checked,
      cacheEnabled: document.getElementById('cacheEnabled').checked,
      cacheDuration: parseInt(document.getElementById('cacheDuration').value) * 86400000 // Convert days to ms
    };

    const response = await fetch('/api/talkingheads/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    const data = await response.json();

    if (data.success) {
      currentConfig = data.config;
      showNotification('Konfiguration gespeichert', 'success');
    } else {
      showNotification('Fehler beim Speichern', 'error');
    }
  } catch (error) {
    console.error('Failed to save config:', error);
    showNotification('Fehler beim Speichern der Konfiguration', 'error');
  }
}

/**
 * Test API connection
 */
async function testApi() {
  const btn = document.getElementById('testApiBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Teste...';

  try {
    const response = await fetch('/api/talkingheads/test-api', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      updateApiStatus(true);
      showNotification('API-Verbindung erfolgreich', 'success');
    } else {
      updateApiStatus(false);
      showNotification('API-Verbindung fehlgeschlagen: ' + (data.error || 'Unbekannter Fehler'), 'error');
    }
  } catch (error) {
    console.error('API test failed:', error);
    updateApiStatus(false);
    showNotification('API-Test fehlgeschlagen', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle"></i> API testen';
  }
}

/**
 * Clear cache
 */
async function clearCache() {
  if (!confirm('Möchten Sie wirklich alle gecachten Avatare löschen?')) {
    return;
  }

  try {
    const response = await fetch('/api/talkingheads/cache/clear', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      showNotification(`${data.deleted} Avatare aus dem Cache gelöscht`, 'success');
      await loadCacheStats();
    } else {
      showNotification('Fehler beim Löschen des Cache', 'error');
    }
  } catch (error) {
    console.error('Failed to clear cache:', error);
    showNotification('Fehler beim Löschen des Cache', 'error');
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
      document.getElementById('cacheStats').textContent = 
        `Cache: ${stats.totalAvatars} Avatare`;
    }
  } catch (error) {
    console.error('Failed to load cache stats:', error);
  }
}

/**
 * Update API status indicator
 */
function updateApiStatus(configured) {
  const statusBadge = document.getElementById('apiStatus');
  
  if (configured) {
    statusBadge.className = 'badge bg-success';
    statusBadge.textContent = 'API konfiguriert';
  } else {
    statusBadge.className = 'badge bg-warning';
    statusBadge.textContent = 'API nicht konfiguriert';
  }
}

/**
 * Update style description
 */
function updateStyleDescription(styleKey) {
  const description = styleDescriptions[styleKey] || 'Unbekannter Stil';
  document.getElementById('styleDescription').textContent = description;
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
    const data = await response.json();

    if (data.success) {
      const container = document.getElementById('activeAnimations');
      
      if (data.animations.length === 0) {
        container.innerHTML = '<div class="text-muted">Keine aktiven Animationen</div>';
      } else {
        container.innerHTML = data.animations.map(anim => `
          <div class="list-group-item">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <strong>${anim.username}</strong> (${anim.userId})
              </div>
              <div>
                <span class="badge bg-primary">${anim.state}</span>
                <span class="text-muted">${Math.floor(anim.duration / 1000)}s</span>
              </div>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (error) {
    console.error('Failed to load active animations:', error);
  }
}

/**
 * Start polling for active animations
 */
function startAnimationPolling() {
  loadActiveAnimations();
  setInterval(loadActiveAnimations, 2000); // Update every 2 seconds
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  // Create toast notification
  const toast = document.createElement('div');
  toast.className = `alert alert-${type === 'error' ? 'danger' : type} position-fixed top-0 end-0 m-3`;
  toast.style.zIndex = '9999';
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

/**
 * Toggle debug log section visibility
 */
function toggleDebugLogSection(show) {
  const section = document.getElementById('debugLogSection');
  if (section) {
    section.style.display = show ? 'block' : 'none';
  }
}

/**
 * Toggle team level input visibility
 */
function toggleTeamLevelInput(permission) {
  const wrapper = document.getElementById('minTeamLevelWrapper');
  wrapper.style.display = permission === 'team' ? 'block' : 'none';
}
    toast.remove();
  }, 3000);
}
