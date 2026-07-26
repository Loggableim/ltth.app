let currentType = null;
let currentPreviewType = null;
let allSettings = {};

function interpolate(fallback, params = {}) {
  return String(fallback).replace(/\{([A-Za-z_][\w.-]*)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match
  ));
}

function translate(key, fallback, params = {}) {
  const value = window.i18n?.t?.(key, params);
  return value && value !== key ? value : interpolate(fallback, params);
}

function getOverlayTypes() {
  return [
    { id: 'follower', accent: '#22c55e', name: translate('plugins.spotlight.runtime.cards.name_follower', 'Follower Spotlight'), description: translate('plugins.spotlight.runtime.cards.description_follower', 'Highlights the most recent follower.') },
    { id: 'like', accent: '#fb7185', name: translate('plugins.spotlight.runtime.cards.name_like', 'Like Spotlight'), description: translate('plugins.spotlight.runtime.cards.description_like', 'Highlights the most recent like event.') },
    { id: 'chatter', accent: '#38bdf8', name: translate('plugins.spotlight.runtime.cards.name_chatter', 'Chat Spotlight'), description: translate('plugins.spotlight.runtime.cards.description_chatter', 'Highlights the most recent chat message.') },
    { id: 'share', accent: '#14b8a6', name: translate('plugins.spotlight.runtime.cards.name_share', 'Share Spotlight'), description: translate('plugins.spotlight.runtime.cards.description_share', 'Highlights the most recent share.') },
    { id: 'gifter', accent: '#f59e0b', name: translate('plugins.spotlight.runtime.cards.name_gifter', 'Gifter Spotlight'), description: translate('plugins.spotlight.runtime.cards.description_gifter', 'Highlights the most recent gift sender.') },
    { id: 'subscriber', accent: '#8b5cf6', name: translate('plugins.spotlight.runtime.cards.name_subscriber', 'Subscriber Spotlight'), description: translate('plugins.spotlight.runtime.cards.description_subscriber', 'Highlights the most recent subscriber.') },
    { id: 'topgift', accent: '#f97316', name: translate('plugins.spotlight.runtime.cards.name_topgift', 'Top Gift Spotlight'), description: translate('plugins.spotlight.runtime.cards.description_topgift', 'Shows the biggest gift of the stream.') },
    { id: 'giftstreak', accent: '#ec4899', name: translate('plugins.spotlight.runtime.cards.name_giftstreak', 'Gift Streak Spotlight'), description: translate('plugins.spotlight.runtime.cards.description_giftstreak', 'Shows the current streak leader.') },
    { id: 'multihud', accent: '#6366f1', name: translate('plugins.spotlight.runtime.cards.name_multihud', 'Rotation Spotlight'), description: translate('plugins.spotlight.runtime.cards.description_multihud', 'Cycles through multiple spotlight modes.') }
  ];
}

// Initialize UI after the locale bundle is available so generated controls do
// not briefly render in the fallback language.
async function init() {
  if (window.i18n?.ready) await window.i18n.ready;
  renderOverlayCards();
  loadAllSettings();
  window.i18n?.onLanguageChange?.(() => {
    renderOverlayCards();
    if (currentType) renderSettingsForm(currentType);
  });
}

// Render overlay cards
function renderOverlayCards() {
  const grid = document.getElementById('overlay-grid');
  if (!grid) {
    return;
  }

  const origin = window.location.origin;
  const overlayTypes = getOverlayTypes();
  grid.innerHTML = overlayTypes.map((type) => {
    const url = `${origin}/overlay/spotlight/${type.id}`;
    return `
      <article class="overlay-card" style="--overlay-accent: ${type.accent};">
        <div class="overlay-card__top">
          <div class="overlay-card__headline">
            <span class="overlay-card__eyebrow">${translate('plugins.spotlight.runtime.cards.live_mode', 'Live mode')}</span>
            <h3>${type.name}</h3>
            <p>${type.description}</p>
          </div>
          <span class="overlay-card__pill">${type.id}</span>
        </div>

        <div class="url-container">
          <div class="overlay-card__label">${translate('plugins.spotlight.runtime.cards.overlay_url', 'Overlay URL')}</div>
          <code>${url}</code>
        </div>

        <div class="button-group">
          <button class="btn btn-primary btn-sm" data-action="copy" data-type="${type.id}">
            ${translate('plugins.spotlight.runtime.cards.copy_url', 'Copy URL')}
          </button>
          <button type="button" class="btn btn-primary btn-sm"
                  data-copy-tiktok-studio-url
                  data-overlay-url-source="self"
                  data-overlay-url-attribute="data-url"
                  data-url="${url}"
                  data-i18n="common.tiktok_studio.copy_url">
            ${translate('common.tiktok_studio.copy_url', 'TikTok-Studio-URL kopieren')}
          </button>
          <button class="btn btn-secondary btn-sm" data-action="preview" data-type="${type.id}">
            ${translate('plugins.spotlight.runtime.cards.preview', 'Preview')}
          </button>
          <button class="btn btn-ghost btn-sm" data-action="settings" data-type="${type.id}">
            ${translate('plugins.spotlight.runtime.cards.settings', 'Settings')}
          </button>
        </div>
      </article>
    `;
  }).join('');

  const count = document.getElementById('overlay-count');
  if (count) {
    count.textContent = String(overlayTypes.length);
  }

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
    showToast(translate('plugins.spotlight.runtime.toast.settings_load_failed', 'Error loading settings'), 'error');
  }
}

// Copy URL to clipboard
function copyURL(type) {
  const url = `${window.location.origin}/overlay/spotlight/${type}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast(translate('plugins.spotlight.runtime.toast.url_copied', 'URL copied to clipboard!'));
  }).catch(err => {
    showToast(translate('plugins.spotlight.runtime.toast.url_copy_failed', 'Failed to copy URL'), 'error');
  });
}

// Open preview
function openPreview(type) {
  currentPreviewType = type;
  const typeName = getOverlayTypes().find(t => t.id === type)?.name || type;
  document.getElementById('preview-title-type').textContent = typeName;

  const url = `/overlay/spotlight/${type}`;
  document.getElementById('preview-frame').src = url;

  document.getElementById('preview-modal').classList.add('active');
}

// Close preview modal
function closePreviewModal() {
  document.getElementById('preview-modal').classList.remove('active');
  document.getElementById('preview-frame').src = '';
  currentPreviewType = null;
}

// Test overlay
async function testOverlay(type) {
  try {
    const response = await fetch(`/api/lastevent/test/${type}`, {
      method: 'POST'
    });
    const data = await response.json();

    if (data.success) {
      showToast(translate('plugins.spotlight.runtime.toast.test_sent', 'Test event sent for {type}!', { type }));
    } else {
      showToast(translate('plugins.spotlight.runtime.toast.test_failed', 'Test failed: {error}', { error: data.error || '' }), 'error');
    }
  } catch (error) {
    console.error('Error testing overlay:', error);
    showToast(translate('plugins.spotlight.runtime.toast.overlay_test_failed', 'Error testing overlay'), 'error');
  }
}

// Open settings modal
function openSettings(type) {
  currentType = type;
  const typeName = getOverlayTypes().find(t => t.id === type)?.name || type;
  document.getElementById('modal-title-type').textContent = typeName;

  renderSettingsForm(type);
  document.getElementById('settings-modal').classList.add('active');
}

// Close settings modal
function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('active');
  currentType = null;
}

function settingText(key, fallback, params = {}) {
  return translate(`plugins.spotlight.runtime.settings.${key}`, fallback, params);
}

function settingOption(value, key, fallback, selected) {
  return `<option value="${value}" ${selected ? 'selected' : ''}>${settingText(key, fallback)}</option>`;
}

function eventCheckbox(id, key, fallback, icon, checked) {
  return `<div class="checkbox-group"><input type="checkbox" id="event-${id}" value="${id}" ${checked ? 'checked' : ''}><label for="event-${id}">${icon} ${settingText(key, fallback)}</label></div>`;
}

// Render settings form without changing its stable DOM IDs or saved config keys.
function renderSettingsForm(type) {
  const settings = allSettings[type] || {};
  const container = document.getElementById('settings-form-container');
  const selectedEvents = settings.selectedEvents;
  const isSelected = (id, defaultSelected = false) => (!selectedEvents ? defaultSelected : selectedEvents.includes(id));
  const animationOptions = (currentValue) => [
    settingOption('fade', 'animation_fade', 'Fade', currentValue === 'fade'),
    settingOption('slide', 'animation_slide', 'Slide', currentValue === 'slide'),
    settingOption('pop', 'animation_pop', 'Pop', currentValue === 'pop'),
    settingOption('zoom', 'animation_zoom', 'Zoom', currentValue === 'zoom'),
    settingOption('glow', 'animation_glow', 'Glow', currentValue === 'glow'),
    settingOption('bounce', 'effect_bounce', 'Bounce', currentValue === 'bounce'),
    settingOption('none', 'effect_none', 'None', currentValue === 'none')
  ].join('');

  container.innerHTML = `
    <div class="settings-section">
      <h4>🎨 ${settingText('design_variant', 'Design Variant')}</h4>
      <div class="form-row"><div class="form-group">
        <label>${settingText('choose_design_style', 'Choose a Design Style')}</label>
        <select id="designVariant">
          ${settingOption('default', 'variant_default', 'Default - Clean & Modern', settings.designVariant === 'default' || !settings.designVariant)}
          ${settingOption('minimal', 'variant_minimal', 'Minimal - Subtle & Clean', settings.designVariant === 'minimal')}
          ${settingOption('compact', 'variant_compact', 'Compact - Small & Tight', settings.designVariant === 'compact')}
          ${settingOption('neon', 'variant_neon', 'Neon - Cyberpunk Glow', settings.designVariant === 'neon')}
          ${settingOption('glassmorphism', 'variant_glassmorphism', 'Glassmorphism - Frosted Glass', settings.designVariant === 'glassmorphism')}
          ${settingOption('retro', 'variant_retro', 'Retro - 8-bit Pixel Style', settings.designVariant === 'retro')}
        </select>
      </div></div>
      <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 10px;">💡 ${settingText('design_help', 'Each design variant has its own unique look. Some variants may override certain settings like borders or fonts for the best visual effect.')}</p>
    </div>

    <div class="settings-section">
      <h4>📝 ${settingText('font_settings', 'Font Settings')}</h4>
      <div class="form-row">
        <div class="form-group"><label>${settingText('font_family', 'Font Family')}</label><input type="text" id="fontFamily" value="${settings.fontFamily || 'Exo 2'}"></div>
        <div class="form-group"><label>${settingText('font_size', 'Font Size')}</label><input type="text" id="fontSize" value="${settings.fontSize || '32px'}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${settingText('line_spacing', 'Line Spacing')}</label><input type="text" id="fontLineSpacing" value="${settings.fontLineSpacing || '1.2'}"></div>
        <div class="form-group"><label>${settingText('letter_spacing', 'Letter Spacing')}</label><input type="text" id="fontLetterSpacing" value="${settings.fontLetterSpacing || 'normal'}"></div>
      </div>
      <div class="form-row"><div class="form-group"><label>${settingText('font_color', 'Font Color')}</label><div class="color-input-wrapper"><input type="color" id="fontColor-picker" value="${settings.fontColor || '#FFFFFF'}"><input type="text" id="fontColor" value="${settings.fontColor || '#FFFFFF'}"></div></div></div>
    </div>

    <div class="settings-section">
      <h4>✨ ${settingText('username_effects', 'Username Effects')}</h4>
      <div class="form-row"><div class="form-group"><label>${settingText('effect_type', 'Effect Type')}</label><select id="usernameEffect">
        ${settingOption('none', 'effect_none', 'None', settings.usernameEffect === 'none')}
        ${settingOption('wave', 'effect_wave', 'Wave', settings.usernameEffect === 'wave')}
        ${settingOption('wave-slow', 'effect_wave_slow', 'Wave (Slow)', settings.usernameEffect === 'wave-slow')}
        ${settingOption('wave-fast', 'effect_wave_fast', 'Wave (Fast)', settings.usernameEffect === 'wave-fast')}
        ${settingOption('jitter', 'effect_jitter', 'Jitter', settings.usernameEffect === 'jitter')}
        ${settingOption('bounce', 'effect_bounce', 'Bounce', settings.usernameEffect === 'bounce')}
      </select></div></div>
      <div class="checkbox-group"><input type="checkbox" id="usernameGlow" ${settings.usernameGlow ? 'checked' : ''}><label for="usernameGlow">${settingText('enable_glow_effect', 'Enable Glow Effect')}</label></div>
      <div class="form-row"><div class="form-group"><label>${settingText('glow_color', 'Glow Color')}</label><div class="color-input-wrapper"><input type="color" id="usernameGlowColor-picker" value="${settings.usernameGlowColor || '#00FF00'}"><input type="text" id="usernameGlowColor" value="${settings.usernameGlowColor || '#00FF00'}"></div></div></div>
    </div>

    <div class="settings-section">
      <h4>🖼️ ${settingText('border', 'Border')}</h4>
      <div class="checkbox-group"><input type="checkbox" id="enableBorder" ${settings.enableBorder ? 'checked' : ''}><label for="enableBorder">${settingText('enable_border', 'Enable Border')}</label></div>
      <div class="form-row"><div class="form-group"><label>${settingText('border_color', 'Border Color')}</label><div class="color-input-wrapper"><input type="color" id="borderColor-picker" value="${settings.borderColor || '#FFFFFF'}"><input type="text" id="borderColor" value="${settings.borderColor || '#FFFFFF'}"></div></div></div>
    </div>

    <div class="settings-section">
      <h4>🎨 ${settingText('background', 'Background')}</h4>
      <div class="checkbox-group"><input type="checkbox" id="enableBackground" ${settings.enableBackground ? 'checked' : ''}><label for="enableBackground">${settingText('enable_background', 'Enable Background')}</label></div>
      <div class="form-row"><div class="form-group"><label>${settingText('background_color', 'Background Color (RGBA)')}</label><input type="text" id="backgroundColor" value="${settings.backgroundColor || 'rgba(0, 0, 0, 0.7)'}"></div></div>
    </div>

    <div class="settings-section">
      <h4>👤 ${settingText('profile_picture', 'Profile Picture')}</h4>
      <div class="checkbox-group"><input type="checkbox" id="showProfilePicture" ${settings.showProfilePicture !== false ? 'checked' : ''}><label for="showProfilePicture">${settingText('show_profile_picture', 'Show Profile Picture')}</label></div>
      <div class="form-row"><div class="form-group"><label>${settingText('profile_picture_size', 'Profile Picture Size')}</label><input type="text" id="profilePictureSize" value="${settings.profilePictureSize || '80px'}"></div></div>
    </div>

    <div class="settings-section">
      <h4>📐 ${settingText('layout', 'Layout')}</h4>
      <div class="checkbox-group"><input type="checkbox" id="showUsername" ${settings.showUsername !== false ? 'checked' : ''}><label for="showUsername">${settingText('show_username', 'Show Username')}</label></div>
      <div class="form-row"><div class="form-group"><label>${settingText('hud_alignment', 'HUD Alignment')}</label><select id="hudAlignment">
        ${settingOption('center', 'alignment_center', 'Center', (settings.hudAlignment || 'center') === 'center')}
        ${settingOption('left', 'alignment_left', 'Left', settings.hudAlignment === 'left')}
        ${settingOption('right', 'alignment_right', 'Right', settings.hudAlignment === 'right')}
      </select></div></div>
    </div>

    <div class="settings-section">
      <h4>🎬 ${settingText('animations', 'Animations')}</h4>
      <div class="form-row">
        <div class="form-group"><label>${settingText('in_animation', 'In Animation')}</label><select id="inAnimationType">${animationOptions(settings.inAnimationType)}</select></div>
        <div class="form-group"><label>${settingText('out_animation', 'Out Animation')}</label><select id="outAnimationType">${animationOptions(settings.outAnimationType)}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${settingText('animation_speed', 'Animation Speed')}</label><select id="animationSpeed">
          ${settingOption('slow', 'speed_slow', 'Slow', settings.animationSpeed === 'slow')}
          ${settingOption('medium', 'speed_medium', 'Medium', settings.animationSpeed === 'medium')}
          ${settingOption('fast', 'speed_fast', 'Fast', settings.animationSpeed === 'fast')}
        </select></div>
        <div class="form-group"><label>${settingText('fade_duration', 'Fade Duration')}</label><input type="text" id="fadeDuration" value="${settings.fadeDuration || '0.5s'}"></div>
      </div>
    </div>

    <div class="settings-section">
      <h4>⚙️ ${settingText('behavior', 'Behavior')}</h4>
      <div class="form-row"><div class="form-group"><label>${settingText('auto_refresh_interval', 'Auto Refresh Interval (seconds, 0 = disabled)')}</label><input type="number" id="refreshIntervalSeconds" value="${settings.refreshIntervalSeconds || 0}" min="0"></div></div>
      <div class="checkbox-group"><input type="checkbox" id="hideOnNullUser" ${settings.hideOnNullUser !== false ? 'checked' : ''}><label for="hideOnNullUser">${settingText('hide_without_user_data', 'Hide When No User Data')}</label></div>
      <div class="checkbox-group"><input type="checkbox" id="preloadImages" ${settings.preloadImages !== false ? 'checked' : ''}><label for="preloadImages">${settingText('preload_profile_images', 'Preload Profile Images')}</label></div>
    </div>

    ${type === 'multihud' ? `
      <div class="settings-section">
        <h4>🔄 ${settingText('multi_hud_rotation', 'Multi-HUD Rotation Settings')}</h4>
        <div class="form-row"><div class="form-group"><label>${settingText('rotation_interval', 'Rotation Interval (seconds)')}</label><input type="number" id="rotationIntervalSeconds" value="${settings.rotationIntervalSeconds || 5}" min="1" max="60"><small style="color: var(--color-text-muted);">${settingText('rotation_interval_help', 'How often to switch between events')}</small></div></div>
        <div class="form-group" style="margin-top: 15px;"><label>${settingText('select_events', 'Select Events to Display')}</label><small style="color: var(--color-text-muted); display: block; margin-bottom: 10px;">${settingText('select_events_help', 'Choose which events should be included in the rotation')}</small>
          ${eventCheckbox('follower', 'event_follower', 'Follower', '👤', isSelected('follower', true))}
          ${eventCheckbox('like', 'event_like', 'Like', '❤️', isSelected('like', true))}
          ${eventCheckbox('chatter', 'event_chatter', 'Chatter', '💬', isSelected('chatter', true))}
          ${eventCheckbox('share', 'event_share', 'Share', '🔗', isSelected('share', true))}
          ${eventCheckbox('gifter', 'event_gifter', 'Gifter', '🎁', isSelected('gifter', true))}
          ${eventCheckbox('subscriber', 'event_subscriber', 'Subscriber', '⭐', isSelected('subscriber', true))}
          ${eventCheckbox('topgift', 'event_topgift', 'Top Gift', '💎', isSelected('topgift'))}
          ${eventCheckbox('giftstreak', 'event_gift_streak', 'Gift Streak', '🔥', isSelected('giftstreak'))}
        </div>
      </div>
    ` : ''}
  `;

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
    hudAlignment: document.getElementById('hudAlignment').value,

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

    if (selectedEvents.length === 0) {
      showToast(translate('plugins.spotlight.runtime.toast.select_rotation_event', 'Select at least one event for Multi-HUD rotation'), 'error');
      return;
    }
    
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
      showToast(translate('plugins.spotlight.runtime.toast.settings_saved', 'Settings saved successfully!'));
      closeSettingsModal();
    } else {
      showToast(translate('plugins.spotlight.runtime.toast.settings_save_failed', 'Error saving settings: {error}', { error: data.error || '' }), 'error');
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    showToast(translate('plugins.spotlight.runtime.toast.settings_save_failed', 'Error saving settings: {error}', { error: error.message || '' }), 'error');
  }
}

// Show toast notification
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.dataset.variant = type;
  toast.textContent = message;
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
document.getElementById('preview-test-btn').addEventListener('click', () => {
  if (currentPreviewType) {
    testOverlay(currentPreviewType);
  }
});
document.getElementById('close-preview-btn').addEventListener('click', closePreviewModal);

// Initialize on page load
init();
