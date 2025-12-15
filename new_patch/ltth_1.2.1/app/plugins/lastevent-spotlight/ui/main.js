const overlayTypes = [
  { id: 'follower', name: 'Last Follower', icon: '👤', color: '#007bff' },
  { id: 'like', name: 'Last Like', icon: '❤️', color: '#dc3545' },
  { id: 'chatter', name: 'Last Chatter', icon: '💬', color: '#28a745' },
  { id: 'share', name: 'Last Share', icon: '🔗', color: '#17a2b8' },
  { id: 'gifter', name: 'Last Gifter', icon: '🎁', color: '#ffc107' },
  { id: 'subscriber', name: 'Last Subscriber', icon: '⭐', color: '#6f42c1' },
  { id: 'topgift', name: 'Top Gift', icon: '💎', color: '#fd7e14', description: 'Most expensive gift of the stream' },
  { id: 'giftstreak', name: 'Gift Streak', icon: '🔥', color: '#e83e8c', description: 'Longest consecutive gift streak' },
  { id: 'multihud', name: 'Multi-HUD Rotation', icon: '🔄', color: '#6610f2', description: 'Rotating display of selected events' }
];

let currentType = null;
let allSettings = {};

// Initialize UI
function init() {
  renderOverlayCards();
  loadAllSettings();
}

// Render overlay cards
function renderOverlayCards() {
  const grid = document.getElementById('overlay-grid');
  grid.innerHTML = '';

  overlayTypes.forEach(type => {
    const url = `${window.location.origin}/overlay/lastevent/${type.id}`;

    const card = document.createElement('div');
    card.className = 'overlay-card';
    card.innerHTML = `
      <h3>
        <span class="icon" style="background: ${type.color}">${type.icon}</span>
        ${type.name}
      </h3>
      ${type.description ? `<p style="font-size: 13px; color: #666; margin: 10px 0;">${type.description}</p>` : ''}

      <div class="url-container">
        ${url}
      </div>

      <div class="button-group">
        <button class="btn btn-primary btn-sm" data-action="copy" data-type="${type.id}">
          📋 Copy URL
        </button>
        <button class="btn btn-info btn-sm" data-action="preview" data-type="${type.id}">
          👁️ Preview
        </button>
        <button class="btn btn-success btn-sm" data-action="test" data-type="${type.id}">
          🧪 Test
        </button>
        <button class="btn btn-secondary btn-sm" data-action="settings" data-type="${type.id}">
          ⚙️ Settings
        </button>
      </div>
    `;

    grid.appendChild(card);
  });

  // Set up event delegation for button clicks
  setupButtonEventListeners();
}

// Setup event listeners for dynamically created buttons
function setupButtonEventListeners() {
  const grid = document.getElementById('overlay-grid');
  
  // Remove any existing listeners to prevent duplicates
  const oldGrid = grid.cloneNode(true);
  grid.parentNode.replaceChild(oldGrid, grid);
  
  // Add event delegation
  document.getElementById('overlay-grid').addEventListener('click', function(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.getAttribute('data-action');
    const type = button.getAttribute('data-type');

    switch (action) {
      case 'copy':
        copyURL(type);
        break;
      case 'preview':
        openPreview(type);
        break;
      case 'test':
        testOverlay(type);
        break;
      case 'settings':
        openSettings(type);
        break;
    }
  });
}

// Load all settings
async function loadAllSettings() {
  try {
    const response = await fetch('/api/lastevent/settings');
    const data = await response.json();
    if (data.success) {
      allSettings = data.settings;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    showToast('Error loading settings', 'error');
  }
}

// Copy URL to clipboard
function copyURL(type) {
  const url = `${window.location.origin}/overlay/lastevent/${type}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast(`URL copied to clipboard!`);
  }).catch(err => {
    showToast('Failed to copy URL', 'error');
  });
}

// Open preview
function openPreview(type) {
  const typeName = overlayTypes.find(t => t.id === type)?.name || type;
  document.getElementById('preview-title-type').textContent = typeName;

  const url = `/overlay/lastevent/${type}`;
  document.getElementById('preview-frame').src = url;

  document.getElementById('preview-modal').classList.add('active');
}

// Close preview modal
function closePreviewModal() {
  document.getElementById('preview-modal').classList.remove('active');
  document.getElementById('preview-frame').src = '';
}

// Test overlay
async function testOverlay(type) {
  try {
    const response = await fetch(`/api/lastevent/test/${type}`, {
      method: 'POST'
    });
    const data = await response.json();

    if (data.success) {
      showToast(`Test event sent for ${type}!`);
    } else {
      showToast('Test failed: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Error testing overlay:', error);
    showToast('Error testing overlay', 'error');
  }
}

// Open settings modal
function openSettings(type) {
  currentType = type;
  const typeName = overlayTypes.find(t => t.id === type)?.name || type;
  document.getElementById('modal-title-type').textContent = typeName;

  renderSettingsForm(type);
  document.getElementById('settings-modal').classList.add('active');
}

// Close settings modal
function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('active');
  currentType = null;
}

// Render settings form
function renderSettingsForm(type) {
  const settings = allSettings[type] || {};
  const container = document.getElementById('settings-form-container');

  container.innerHTML = `
    <!-- Design Variant -->
    <div class="settings-section">
      <h4>🎨 Design Variant</h4>
      <div class="form-row">
        <div class="form-group">
          <label>Choose a Design Style</label>
          <select id="designVariant">
            <option value="default" ${settings.designVariant === 'default' || !settings.designVariant ? 'selected' : ''}>Default - Clean & Modern</option>
            <option value="minimal" ${settings.designVariant === 'minimal' ? 'selected' : ''}>Minimal - Subtle & Clean</option>
            <option value="compact" ${settings.designVariant === 'compact' ? 'selected' : ''}>Compact - Small & Tight</option>
            <option value="neon" ${settings.designVariant === 'neon' ? 'selected' : ''}>Neon - Cyberpunk Glow</option>
            <option value="glassmorphism" ${settings.designVariant === 'glassmorphism' ? 'selected' : ''}>Glassmorphism - Frosted Glass</option>
            <option value="retro" ${settings.designVariant === 'retro' ? 'selected' : ''}>Retro - 8-bit Pixel Style</option>
          </select>
        </div>
      </div>
      <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 10px;">
        💡 Each design variant has its own unique look. Some variants may override certain settings like borders or fonts for the best visual effect.
      </p>
    </div>

    <!-- Font Settings -->
    <div class="settings-section">
      <h4>📝 Font Settings</h4>
      <div class="form-row">
        <div class="form-group">
          <label>Font Family</label>
          <input type="text" id="fontFamily" value="${settings.fontFamily || 'Exo 2'}">
        </div>
        <div class="form-group">
          <label>Font Size</label>
          <input type="text" id="fontSize" value="${settings.fontSize || '32px'}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Line Spacing</label>
          <input type="text" id="fontLineSpacing" value="${settings.fontLineSpacing || '1.2'}">
        </div>
        <div class="form-group">
          <label>Letter Spacing</label>
          <input type="text" id="fontLetterSpacing" value="${settings.fontLetterSpacing || 'normal'}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Font Color</label>
          <div class="color-input-wrapper">
            <input type="color" id="fontColor-picker" value="${settings.fontColor || '#FFFFFF'}">
            <input type="text" id="fontColor" value="${settings.fontColor || '#FFFFFF'}">
          </div>
        </div>
      </div>
    </div>

    <!-- Username Effects -->
    <div class="settings-section">
      <h4>✨ Username Effects</h4>
      <div class="form-row">
        <div class="form-group">
          <label>Effect Type</label>
          <select id="usernameEffect">
            <option value="none" ${settings.usernameEffect === 'none' ? 'selected' : ''}>None</option>
            <option value="wave" ${settings.usernameEffect === 'wave' ? 'selected' : ''}>Wave</option>
            <option value="wave-slow" ${settings.usernameEffect === 'wave-slow' ? 'selected' : ''}>Wave (Slow)</option>
            <option value="wave-fast" ${settings.usernameEffect === 'wave-fast' ? 'selected' : ''}>Wave (Fast)</option>
            <option value="jitter" ${settings.usernameEffect === 'jitter' ? 'selected' : ''}>Jitter</option>
            <option value="bounce" ${settings.usernameEffect === 'bounce' ? 'selected' : ''}>Bounce</option>
          </select>
        </div>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="usernameGlow" ${settings.usernameGlow ? 'checked' : ''}>
        <label for="usernameGlow">Enable Glow Effect</label>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Glow Color</label>
          <div class="color-input-wrapper">
            <input type="color" id="usernameGlowColor-picker" value="${settings.usernameGlowColor || '#00FF00'}">
            <input type="text" id="usernameGlowColor" value="${settings.usernameGlowColor || '#00FF00'}">
          </div>
        </div>
      </div>
    </div>

    <!-- Border -->
    <div class="settings-section">
      <h4>🖼️ Border</h4>
      <div class="checkbox-group">
        <input type="checkbox" id="enableBorder" ${settings.enableBorder ? 'checked' : ''}>
        <label for="enableBorder">Enable Border</label>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Border Color</label>
          <div class="color-input-wrapper">
            <input type="color" id="borderColor-picker" value="${settings.borderColor || '#FFFFFF'}">
            <input type="text" id="borderColor" value="${settings.borderColor || '#FFFFFF'}">
          </div>
        </div>
      </div>
    </div>

    <!-- Background -->
    <div class="settings-section">
      <h4>🎨 Background</h4>
      <div class="checkbox-group">
        <input type="checkbox" id="enableBackground" ${settings.enableBackground ? 'checked' : ''}>
        <label for="enableBackground">Enable Background</label>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Background Color (RGBA)</label>
          <input type="text" id="backgroundColor" value="${settings.backgroundColor || 'rgba(0, 0, 0, 0.7)'}">
        </div>
      </div>
    </div>

    <!-- Profile Picture -->
    <div class="settings-section">
      <h4>👤 Profile Picture</h4>
      <div class="checkbox-group">
        <input type="checkbox" id="showProfilePicture" ${settings.showProfilePicture !== false ? 'checked' : ''}>
        <label for="showProfilePicture">Show Profile Picture</label>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Profile Picture Size</label>
          <input type="text" id="profilePictureSize" value="${settings.profilePictureSize || '80px'}">
        </div>
      </div>
    </div>

    <!-- Layout -->
    <div class="settings-section">
      <h4>📐 Layout</h4>
      <div class="checkbox-group">
        <input type="checkbox" id="showUsername" ${settings.showUsername !== false ? 'checked' : ''}>
        <label for="showUsername">Show Username</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="alignCenter" ${settings.alignCenter !== false ? 'checked' : ''}>
        <label for="alignCenter">Center Alignment</label>
      </div>
    </div>

    <!-- Animations -->
    <div class="settings-section">
      <h4>🎬 Animations</h4>
      <div class="form-row">
        <div class="form-group">
          <label>In Animation</label>
          <select id="inAnimationType">
            <option value="fade" ${settings.inAnimationType === 'fade' ? 'selected' : ''}>Fade</option>
            <option value="slide" ${settings.inAnimationType === 'slide' ? 'selected' : ''}>Slide</option>
            <option value="pop" ${settings.inAnimationType === 'pop' ? 'selected' : ''}>Pop</option>
            <option value="zoom" ${settings.inAnimationType === 'zoom' ? 'selected' : ''}>Zoom</option>
            <option value="glow" ${settings.inAnimationType === 'glow' ? 'selected' : ''}>Glow</option>
            <option value="bounce" ${settings.inAnimationType === 'bounce' ? 'selected' : ''}>Bounce</option>
            <option value="none" ${settings.inAnimationType === 'none' ? 'selected' : ''}>None</option>
          </select>
        </div>
        <div class="form-group">
          <label>Out Animation</label>
          <select id="outAnimationType">
            <option value="fade" ${settings.outAnimationType === 'fade' ? 'selected' : ''}>Fade</option>
            <option value="slide" ${settings.outAnimationType === 'slide' ? 'selected' : ''}>Slide</option>
            <option value="pop" ${settings.outAnimationType === 'pop' ? 'selected' : ''}>Pop</option>
            <option value="zoom" ${settings.outAnimationType === 'zoom' ? 'selected' : ''}>Zoom</option>
            <option value="glow" ${settings.outAnimationType === 'glow' ? 'selected' : ''}>Glow</option>
            <option value="bounce" ${settings.outAnimationType === 'bounce' ? 'selected' : ''}>Bounce</option>
            <option value="none" ${settings.outAnimationType === 'none' ? 'selected' : ''}>None</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Animation Speed</label>
          <select id="animationSpeed">
            <option value="slow" ${settings.animationSpeed === 'slow' ? 'selected' : ''}>Slow</option>
            <option value="medium" ${settings.animationSpeed === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="fast" ${settings.animationSpeed === 'fast' ? 'selected' : ''}>Fast</option>
          </select>
        </div>
        <div class="form-group">
          <label>Fade Duration</label>
          <input type="text" id="fadeDuration" value="${settings.fadeDuration || '0.5s'}">
        </div>
      </div>
    </div>

    <!-- Behavior -->
    <div class="settings-section">
      <h4>⚙️ Behavior</h4>
      <div class="form-row">
        <div class="form-group">
          <label>Auto Refresh Interval (seconds, 0 = disabled)</label>
          <input type="number" id="refreshIntervalSeconds" value="${settings.refreshIntervalSeconds || 0}" min="0">
        </div>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="hideOnNullUser" ${settings.hideOnNullUser !== false ? 'checked' : ''}>
        <label for="hideOnNullUser">Hide When No User Data</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="preloadImages" ${settings.preloadImages !== false ? 'checked' : ''}>
        <label for="preloadImages">Preload Profile Images</label>
      </div>
    </div>

    ${type === 'multihud' ? `
    <!-- Multi-HUD Rotation Settings -->
    <div class="settings-section">
      <h4>🔄 Multi-HUD Rotation Settings</h4>
      <div class="form-row">
        <div class="form-group">
          <label>Rotation Interval (seconds)</label>
          <input type="number" id="rotationIntervalSeconds" value="${settings.rotationIntervalSeconds || 5}" min="1" max="60">
          <small style="color: var(--color-text-muted);">How often to switch between events</small>
        </div>
      </div>
      <div class="form-group" style="margin-top: 15px;">
        <label>Select Events to Display</label>
        <small style="color: var(--color-text-muted); display: block; margin-bottom: 10px;">
          Choose which events should be included in the rotation
        </small>
        <div class="checkbox-group">
          <input type="checkbox" id="event-follower" value="follower" ${!settings.selectedEvents || settings.selectedEvents.includes('follower') ? 'checked' : ''}>
          <label for="event-follower">👤 Follower</label>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="event-like" value="like" ${!settings.selectedEvents || settings.selectedEvents.includes('like') ? 'checked' : ''}>
          <label for="event-like">❤️ Like</label>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="event-chatter" value="chatter" ${!settings.selectedEvents || settings.selectedEvents.includes('chatter') ? 'checked' : ''}>
          <label for="event-chatter">💬 Chatter</label>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="event-share" value="share" ${!settings.selectedEvents || settings.selectedEvents.includes('share') ? 'checked' : ''}>
          <label for="event-share">🔗 Share</label>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="event-gifter" value="gifter" ${!settings.selectedEvents || settings.selectedEvents.includes('gifter') ? 'checked' : ''}>
          <label for="event-gifter">🎁 Gifter</label>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="event-subscriber" value="subscriber" ${!settings.selectedEvents || settings.selectedEvents.includes('subscriber') ? 'checked' : ''}>
          <label for="event-subscriber">⭐ Subscriber</label>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="event-topgift" value="topgift" ${settings.selectedEvents && settings.selectedEvents.includes('topgift') ? 'checked' : ''}>
          <label for="event-topgift">💎 Top Gift</label>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="event-giftstreak" value="giftstreak" ${settings.selectedEvents && settings.selectedEvents.includes('giftstreak') ? 'checked' : ''}>
          <label for="event-giftstreak">🔥 Gift Streak</label>
        </div>
      </div>
    </div>
    ` : ''}
  `;

  // Setup color picker sync
  setupColorPickers();
}

// Setup color pickers
function setupColorPickers() {
  const colorFields = ['fontColor', 'usernameGlowColor', 'borderColor'];

  colorFields.forEach(field => {
    const picker = document.getElementById(`${field}-picker`);
    const input = document.getElementById(field);

    if (picker && input) {
      picker.addEventListener('input', (e) => {
        input.value = e.target.value;
      });

      input.addEventListener('input', (e) => {
        if (e.target.value.startsWith('#')) {
          picker.value = e.target.value;
        }
      });
    }
  });
}

// Save settings
async function saveSettings() {
  if (!currentType) return;

  const newSettings = {
    // Design variant
    designVariant: document.getElementById('designVariant').value,

    // Font
    fontFamily: document.getElementById('fontFamily').value,
    fontSize: document.getElementById('fontSize').value,
    fontLineSpacing: document.getElementById('fontLineSpacing').value,
    fontLetterSpacing: document.getElementById('fontLetterSpacing').value,
    fontColor: document.getElementById('fontColor').value,

    // Username effects
    usernameEffect: document.getElementById('usernameEffect').value,
    usernameGlow: document.getElementById('usernameGlow').checked,
    usernameGlowColor: document.getElementById('usernameGlowColor').value,

    // Border
    enableBorder: document.getElementById('enableBorder').checked,
    borderColor: document.getElementById('borderColor').value,

    // Background
    enableBackground: document.getElementById('enableBackground').checked,
    backgroundColor: document.getElementById('backgroundColor').value,

    // Profile picture
    showProfilePicture: document.getElementById('showProfilePicture').checked,
    profilePictureSize: document.getElementById('profilePictureSize').value,

    // Layout
    showUsername: document.getElementById('showUsername').checked,
    alignCenter: document.getElementById('alignCenter').checked,

    // Animations
    inAnimationType: document.getElementById('inAnimationType').value,
    outAnimationType: document.getElementById('outAnimationType').value,
    animationSpeed: document.getElementById('animationSpeed').value,
    fadeDuration: document.getElementById('fadeDuration').value,

    // Behavior
    refreshIntervalSeconds: parseInt(document.getElementById('refreshIntervalSeconds').value) || 0,
    hideOnNullUser: document.getElementById('hideOnNullUser').checked,
    preloadImages: document.getElementById('preloadImages').checked
  };

  // Add multi-HUD specific settings if this is the multihud overlay
  if (currentType === 'multihud') {
    // Get rotation interval
    newSettings.rotationIntervalSeconds = parseInt(document.getElementById('rotationIntervalSeconds').value) || 5;
    
    // Get selected events
    const selectedEvents = [];
    const eventCheckboxes = [
      'event-follower', 'event-like', 'event-chatter', 'event-share',
      'event-gifter', 'event-subscriber', 'event-topgift', 'event-giftstreak'
    ];
    
    eventCheckboxes.forEach(checkboxId => {
      const checkbox = document.getElementById(checkboxId);
      if (checkbox && checkbox.checked) {
        selectedEvents.push(checkbox.value);
      }
    });
    
    newSettings.selectedEvents = selectedEvents;
  }

  try {
    const response = await fetch(`/api/lastevent/settings/${currentType}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newSettings)
    });

    const data = await response.json();

    if (data.success) {
      allSettings[currentType] = data.settings;
      showToast('Settings saved successfully!');
      closeSettingsModal();
    } else {
      showToast('Error saving settings: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    showToast('Error saving settings', 'error');
  }
}

// Show toast notification
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.background = type === 'error' ? '#dc3545' : '#28a745';
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Close modals on background click
window.addEventListener('click', function(event) {
  const settingsModal = document.getElementById('settings-modal');
  const previewModal = document.getElementById('preview-modal');

  if (event.target === settingsModal) {
    closeSettingsModal();
  }
  if (event.target === previewModal) {
    closePreviewModal();
  }
});

// Set up event listeners
document.getElementById('close-settings-modal').addEventListener('click', closeSettingsModal);
document.getElementById('cancel-settings-btn').addEventListener('click', closeSettingsModal);
document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
document.getElementById('close-preview-modal').addEventListener('click', closePreviewModal);
document.getElementById('close-preview-btn').addEventListener('click', closePreviewModal);

// Initialize on page load
init();
