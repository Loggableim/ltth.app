let currentDock = null;
let currentSettings = {};
let socket = null;

// Initialize
function init() {
  // Set URLs
  const origin = window.location.origin;
  document.getElementById('chat-url').textContent = `${origin}/overlay/clarity/chat`;
  document.getElementById('full-url').textContent = `${origin}/overlay/clarity/full`;

  // Initialize Socket.IO for live updates
  socket = io();

  socket.on('connect', () => {
    console.log('Connected to Socket.IO');
  });

  // Listen for settings updates
  socket.on('clarityhud:settings:updated', (data) => {
    if (data.dock === currentDock) {
      currentSettings = data.settings;
      showToast('Settings updated from server', 'success');
    }
  });
}

// Copy URL to clipboard
function copyURL(dock) {
  const urlElement = document.getElementById(`${dock}-url`);
  const url = urlElement.textContent;

  navigator.clipboard.writeText(url).then(() => {
    showToast('URL copied to clipboard!', 'success');
  }).catch(err => {
    showToast('Failed to copy URL', 'error');
    console.error('Copy failed:', err);
  });
}

// Refresh preview
function refreshPreview(dock) {
  const iframe = document.getElementById(`${dock}-preview`);
  iframe.src = iframe.src;
  showToast('Preview refreshed', 'success');
}

// Test event
async function testEvent(dock) {
  try {
    const response = await fetch(`/api/clarityhud/test/${dock}`, {
      method: 'POST'
    });
    const data = await response.json();

    if (data.success) {
      showToast(`Test event sent to ${dock} overlay`, 'success');
    } else {
      showToast(`Test failed: ${data.error}`, 'error');
    }
  } catch (error) {
    console.error('Error testing overlay:', error);
    showToast('Error sending test event', 'error');
  }
}

// Open settings modal
async function openSettings(dock) {
  currentDock = dock;
  document.getElementById('modal-title').textContent = dock === 'chat' ? 'Chat HUD' : 'Full Activity HUD';

  // Load current settings
  try {
    const response = await fetch(`/api/clarityhud/settings/${dock}`);
    const data = await response.json();

    if (data.success) {
      currentSettings = data.settings;
      renderSettingsForm(dock);
      document.getElementById('settings-modal').classList.add('active');
    } else {
      showToast(`Error loading settings: ${data.error}`, 'error');
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    showToast('Error loading settings', 'error');
  }
}

// Close settings modal
function closeSettings() {
  document.getElementById('settings-modal').classList.remove('active');
  currentDock = null;
}

// Render settings form
function renderSettingsForm(dock) {
  const tabs = [];
  const contents = [];

  // Common tabs for both
  tabs.push({ id: 'appearance', label: 'Appearance' });

  // Dock-specific tabs
  if (dock === 'full') {
    tabs.push({ id: 'events', label: 'Events' });
  }

  tabs.push({ id: 'layout', label: 'Layout' });

  if (dock === 'full') {
    tabs.push({ id: 'animation', label: 'Animation' });
  }

  tabs.push({ id: 'styling', label: 'Styling' });
  tabs.push({ id: 'accessibility', label: 'Accessibility' });

  // Render tabs
  const tabsHtml = tabs.map((tab, index) =>
    `<div class="tab ${index === 0 ? 'active' : ''}" data-tab-id="${tab.id}">${tab.label}</div>`
  ).join('');
  document.getElementById('settings-tabs').innerHTML = tabsHtml;
  
  // Add event listeners to tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
      switchTab(this.dataset.tabId);
    });
  });

  // Render tab contents
  const contentsHtml = tabs.map((tab, index) =>
    `<div class="tab-content ${index === 0 ? 'active' : ''}" id="tab-${tab.id}">
      ${renderTabContent(dock, tab.id)}
    </div>`
  ).join('');
  document.getElementById('tab-contents').innerHTML = contentsHtml;

  // Setup color pickers
  setupColorPickers();

  // Setup range sliders
  setupRangeSliders();
}

// Switch tab
function switchTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tabId === tabId);
  });

  // Update tab contents
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');
}

// Render tab content
function renderTabContent(dock, tabId) {
  const s = currentSettings;

  switch (tabId) {
    case 'appearance':
      return `
        <div class="settings-group">
          <h3>Font Settings</h3>
          <div class="form-row">
            <div class="form-group">
              <label>Font Family</label>
              <input type="text" id="fontFamily" value="${s.fontFamily || 'Arial, sans-serif'}">
              <span class="help-text">Any web-safe font or Google Font</span>
            </div>
            <div class="form-group">
              <label>Font Size</label>
              <div class="range-group">
                <div class="range-value">
                  <label>Font Size</label>
                  <span id="fontSize-value">${s.fontSize || 16}${s.fontSize ? '' : 'px'}</span>
                </div>
                <input type="range" id="fontSize" min="10" max="48" value="${parseInt(s.fontSize) || 16}" data-range-target="fontSize" data-range-suffix="px">
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Font Color</label>
              <div class="color-input-wrapper">
                <input type="color" id="fontColor-picker" value="${s.fontColor || '#FFFFFF'}">
                <input type="text" id="fontColor" value="${s.fontColor || '#FFFFFF'}">
              </div>
            </div>
            <div class="form-group">
              <label>Background Color</label>
              <div class="color-input-wrapper">
                <input type="color" id="backgroundColor-picker" value="${s.backgroundColor || '#000000'}">
                <input type="text" id="backgroundColor" value="${s.backgroundColor || '#000000'}">
              </div>
              <span class="help-text">Use rgba() for transparency</span>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Line Height</label>
              <div class="range-group">
                <div class="range-value">
                  <label>Line Height</label>
                  <span id="lineHeight-value">${s.lineHeight || 1.5}</span>
                </div>
                <input type="range" id="lineHeight" min="1" max="3" step="0.1" value="${s.lineHeight || 1.5}" data-range-target="lineHeight">
              </div>
            </div>
            <div class="form-group">
              <label>Letter Spacing (px)</label>
              <div class="range-group">
                <div class="range-value">
                  <label>Letter Spacing</label>
                  <span id="letterSpacing-value">${s.letterSpacing || 0}${s.letterSpacing ? '' : 'px'}</span>
                </div>
                <input type="range" id="letterSpacing" min="-2" max="5" step="0.5" value="${parseFloat(s.letterSpacing) || 0}" data-range-target="letterSpacing" data-range-suffix="px">
              </div>
            </div>
          </div>
        </div>
        <div class="settings-group">
          <h3>Window Settings</h3>
          <div class="form-row">
            <div class="form-group">
              <label>Transparency</label>
              <div class="range-group">
                <div class="range-value">
                  <label>Opacity</label>
                  <span id="transparency-value">${typeof s.transparency !== 'undefined' ? s.transparency : 100}%</span>
                </div>
                <input type="range" id="transparency" min="0" max="100" value="${typeof s.transparency !== 'undefined' ? s.transparency : 100}" data-range-target="transparency" data-range-suffix="%">
              </div>
              <span class="help-text">0% = fully transparent, 100% = fully opaque. Changes apply in real-time.</span>
            </div>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="keepOnTop" ${s.keepOnTop ? 'checked' : ''}>
            <label for="keepOnTop">Keep overlay window always on top</label>
          </div>
          <span class="help-text" style="margin-left: 32px; display: block; margin-top: -10px;">Overlay will stay in front of all other windows, including fullscreen apps</span>
          <div class="checkbox-group">
            <input type="checkbox" id="useVirtualScrolling" ${s.useVirtualScrolling ? 'checked' : ''}>
            <label for="useVirtualScrolling">Enable virtual scrolling for high performance</label>
          </div>
          <span class="help-text" style="margin-left: 32px; display: block; margin-top: -10px;">Recommended for streams with 200+ messages per minute</span>
        </div>
        <div class="settings-group">
          <h3>Badge Settings</h3>
          <div class="form-row">
            <div class="form-group">
              <label>Badge Size</label>
              <select id="badgeSize">
                <option value="small" ${s.badgeSize === 'small' ? 'selected' : ''}>Small</option>
                <option value="medium" ${s.badgeSize === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="large" ${s.badgeSize === 'large' ? 'selected' : ''}>Large</option>
              </select>
            </div>
            <div class="form-group">
              <label>Team Level Style</label>
              <select id="teamLevelStyle">
                <option value="icon-color" ${s.teamLevelStyle === 'icon-color' ? 'selected' : ''}>Icon with Color</option>
                <option value="icon-glow" ${s.teamLevelStyle === 'icon-glow' ? 'selected' : ''}>Icon with Glow</option>
                <option value="number-only" ${s.teamLevelStyle === 'number-only' ? 'selected' : ''}>Number Only</option>
              </select>
              <span class="help-text">Team Level shows TikTok team hearts (NOT subscriptions)</span>
            </div>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showTeamLevel" ${s.showTeamLevel !== false ? 'checked' : ''}>
            <label for="showTeamLevel">Show Team Level (Hearts)</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showModerator" ${s.showModerator !== false ? 'checked' : ''}>
            <label for="showModerator">Show Moderator Badge</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showSubscriber" ${s.showSubscriber !== false ? 'checked' : ''}>
            <label for="showSubscriber">Show Subscriber Badge</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showGifter" ${s.showGifter !== false ? 'checked' : ''}>
            <label for="showGifter">Show Gifter Level Badge</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showFanClub" ${s.showFanClub !== false ? 'checked' : ''}>
            <label for="showFanClub">Show Fan Club Badge</label>
          </div>
        </div>
        <div class="settings-group">
          <h3>Emoji & Color Settings</h3>
          <div class="form-row">
            <div class="form-group">
              <label>Emoji Render Mode</label>
              <select id="emojiRenderMode">
                <option value="image" ${s.emojiRenderMode === 'image' ? 'selected' : ''}>TikTok Images + Unicode</option>
                <option value="unicode" ${s.emojiRenderMode === 'unicode' ? 'selected' : ''}>Unicode Only</option>
              </select>
              <span class="help-text">Image mode shows TikTok custom emotes when available</span>
            </div>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="usernameColorByTeamLevel" ${s.usernameColorByTeamLevel !== false ? 'checked' : ''}>
            <label for="usernameColorByTeamLevel">Color usernames by Team Level</label>
          </div>
          <span class="help-text" style="margin-left: 32px; display: block; margin-top: -10px;">Usernames will be colored based on their team heart level</span>
        </div>
      `;

    case 'events':
      return `
        <div class="settings-group">
          <h3>Event Visibility</h3>
          <div class="checkbox-group">
            <input type="checkbox" id="showChat" ${s.showChat !== false ? 'checked' : ''}>
            <label for="showChat">Show Chat Messages</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showFollows" ${s.showFollows !== false ? 'checked' : ''}>
            <label for="showFollows">Show Follows</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showShares" ${s.showShares !== false ? 'checked' : ''}>
            <label for="showShares">Show Shares</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showLikes" ${s.showLikes !== false ? 'checked' : ''}>
            <label for="showLikes">Show Likes</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showGifts" ${s.showGifts !== false ? 'checked' : ''}>
            <label for="showGifts">Show Gifts</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showSubs" ${s.showSubs !== false ? 'checked' : ''}>
            <label for="showSubs">Show Subscriptions</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showTreasureChests" ${s.showTreasureChests !== false ? 'checked' : ''}>
            <label for="showTreasureChests">Show Treasure Chests</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showJoins" ${s.showJoins !== false ? 'checked' : ''}>
            <label for="showJoins">Show User Joins</label>
          </div>
        </div>
      `;

    case 'layout':
      return `
        <div class="settings-group">
          <h3>Layout Options</h3>
          ${dock === 'full' ? `
            <div class="form-row">
              <div class="form-group">
                <label>Layout Mode</label>
                <select id="layoutMode">
                  <option value="singleStream" ${s.layoutMode === 'singleStream' ? 'selected' : ''}>Single Stream</option>
                  <option value="structured" ${s.layoutMode === 'structured' ? 'selected' : ''}>Structured</option>
                  <option value="adaptive" ${s.layoutMode === 'adaptive' ? 'selected' : ''}>Adaptive</option>
                </select>
                <span class="help-text">Single stream: unified feed, Structured: categorized, Adaptive: smart layout</span>
              </div>
              <div class="form-group">
                <label>Feed Direction</label>
                <select id="feedDirection">
                  <option value="newestTop" ${s.feedDirection === 'newestTop' ? 'selected' : ''}>Newest on Top</option>
                  <option value="newestBottom" ${s.feedDirection === 'newestBottom' ? 'selected' : ''}>Newest on Bottom</option>
                </select>
              </div>
            </div>
          ` : ''}
          <div class="form-row">
            <div class="form-group">
              <label>Alignment</label>
              <select id="alignment">
                <option value="left" ${s.alignLeft !== false ? 'selected' : ''}>Left</option>
                <option value="center" ${s.alignLeft === false ? 'selected' : ''}>Center</option>
              </select>
            </div>
            <div class="form-group">
              <label>Max Lines</label>
              <input type="number" id="maxLines" min="1" max="50" value="${s.maxLines || 10}">
              <span class="help-text">Maximum number of lines to display</span>
            </div>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="showTimestamps" ${s.showTimestamps ? 'checked' : ''}>
            <label for="showTimestamps">Show Timestamps</label>
          </div>
        </div>
      `;

    case 'animation':
      return `
        <div class="settings-group">
          <h3>Animation Settings</h3>
          <div class="form-row">
            <div class="form-group">
              <label>Animation In</label>
              <select id="animationIn">
                <option value="fade" ${s.animationIn === 'fade' ? 'selected' : ''}>Fade</option>
                <option value="slide" ${s.animationIn === 'slide' ? 'selected' : ''}>Slide</option>
                <option value="slideUp" ${s.animationIn === 'slideUp' ? 'selected' : ''}>Slide Up</option>
                <option value="slideDown" ${s.animationIn === 'slideDown' ? 'selected' : ''}>Slide Down</option>
                <option value="zoom" ${s.animationIn === 'zoom' ? 'selected' : ''}>Zoom</option>
                <option value="bounce" ${s.animationIn === 'bounce' ? 'selected' : ''}>Bounce</option>
                <option value="none" ${s.animationIn === 'none' ? 'selected' : ''}>None</option>
              </select>
            </div>
            <div class="form-group">
              <label>Animation Out</label>
              <select id="animationOut">
                <option value="fade" ${s.animationOut === 'fade' ? 'selected' : ''}>Fade</option>
                <option value="slide" ${s.animationOut === 'slide' ? 'selected' : ''}>Slide</option>
                <option value="slideUp" ${s.animationOut === 'slideUp' ? 'selected' : ''}>Slide Up</option>
                <option value="slideDown" ${s.animationOut === 'slideDown' ? 'selected' : ''}>Slide Down</option>
                <option value="zoom" ${s.animationOut === 'zoom' ? 'selected' : ''}>Zoom</option>
                <option value="shrink" ${s.animationOut === 'shrink' ? 'selected' : ''}>Shrink</option>
                <option value="none" ${s.animationOut === 'none' ? 'selected' : ''}>None</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Animation Speed</label>
              <select id="animationSpeed">
                <option value="slow" ${s.animationSpeed === 'slow' ? 'selected' : ''}>Slow (800ms)</option>
                <option value="medium" ${s.animationSpeed === 'medium' ? 'selected' : ''}>Medium (500ms)</option>
                <option value="fast" ${s.animationSpeed === 'fast' ? 'selected' : ''}>Fast (300ms)</option>
              </select>
            </div>
          </div>
        </div>
      `;

    case 'styling':
      return `
        <div class="settings-group">
          <h3>Text Styling</h3>
          <div class="form-row">
            <div class="form-group">
              <label>Outline Thickness (px)</label>
              <div class="range-group">
                <div class="range-value">
                  <label>Thickness</label>
                  <span id="outlineThickness-value">${s.outlineThickness || 0}${s.outlineThickness ? '' : 'px'}</span>
                </div>
                <input type="range" id="outlineThickness" min="0" max="5" step="0.5" value="${parseFloat(s.outlineThickness) || 0}" data-range-target="outlineThickness" data-range-suffix="px">
              </div>
            </div>
            <div class="form-group">
              <label>Outline Color</label>
              <div class="color-input-wrapper">
                <input type="color" id="outlineColor-picker" value="${s.outlineColor || '#000000'}">
                <input type="text" id="outlineColor" value="${s.outlineColor || '#000000'}">
              </div>
            </div>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="wrapLongWords" ${s.wrapLongWords !== false ? 'checked' : ''}>
            <label for="wrapLongWords">Wrap Long Words</label>
          </div>
        </div>
      `;

    case 'accessibility':
      return `
        <div class="settings-group">
          <h3>Quick Presets</h3>
          <div class="preset-buttons">
            <button class="preset-btn" data-preset="highContrast">
              High Contrast
            </button>
            <button class="preset-btn" data-preset="visionImpaired">
              Vision Impaired
            </button>
            <button class="preset-btn" data-preset="dyslexiaFriendly">
              Dyslexia Friendly
            </button>
            <button class="preset-btn" data-preset="motionSensitive">
              Motion Sensitive
            </button>
          </div>
        </div>
        <div class="settings-group">
          <h3>Display Mode</h3>
          <div class="form-row">
            <div class="form-group">
              <label>Mode</label>
              <select id="mode">
                <option value="day" ${s.mode === 'day' ? 'selected' : ''}>Day Mode</option>
                <option value="night" ${s.mode === 'night' ? 'selected' : ''}>Night Mode</option>
              </select>
            </div>
          </div>
        </div>
        <div class="settings-group">
          <h3>Accessibility Options</h3>
          <div class="checkbox-group">
            <input type="checkbox" id="highContrastMode" ${s.highContrastMode ? 'checked' : ''}>
            <label for="highContrastMode">High Contrast Mode</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="colorblindSafeMode" ${s.colorblindSafeMode ? 'checked' : ''}>
            <label for="colorblindSafeMode">Colorblind Safe Mode</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="reduceMotion" ${s.reduceMotion ? 'checked' : ''}>
            <label for="reduceMotion">Reduce Motion</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="dyslexiaFont" ${s.dyslexiaFont ? 'checked' : ''}>
            <label for="dyslexiaFont">Dyslexia-Friendly Font</label>
          </div>
        </div>
      `;

    default:
      return '<p>Unknown tab</p>';
  }
}

// Setup color pickers
function setupColorPickers() {
  const colorFields = ['fontColor', 'backgroundColor', 'outlineColor'];

  colorFields.forEach(field => {
    const picker = document.getElementById(`${field}-picker`);
    const input = document.getElementById(field);

    if (picker && input) {
      picker.addEventListener('input', (e) => {
        input.value = e.target.value;
      });

      input.addEventListener('input', (e) => {
        const value = e.target.value;
        if (value.startsWith('#') && value.length === 7) {
          picker.value = value;
        }
      });
    }
  });
}

// Setup range sliders
function setupRangeSliders() {
  // Use event delegation for all range inputs with data-range-target
  document.querySelectorAll('input[type="range"][data-range-target]').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const target = e.target.dataset.rangeTarget;
      const suffix = e.target.dataset.rangeSuffix || '';
      updateRangeValue(target, e.target.value + suffix);
    });
  });
  
  // Also add event listeners for preset buttons
  document.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      applyPreset(e.target.dataset.preset);
    });
  });
}

// Update range value display
function updateRangeValue(field, value) {
  const display = document.getElementById(`${field}-value`);
  if (display) {
    display.textContent = value;
  }
}

// Apply accessibility preset
function applyPreset(preset) {
  switch (preset) {
    case 'highContrast':
      setFieldValue('fontColor', '#FFFFFF');
      setFieldValue('fontColor-picker', '#FFFFFF');
      setFieldValue('backgroundColor', '#000000');
      setFieldValue('backgroundColor-picker', '#000000');
      setFieldValue('highContrastMode', true);
      setFieldValue('fontSize', 20);
      updateRangeValue('fontSize', '20px');
      break;

    case 'visionImpaired':
      setFieldValue('fontSize', 24);
      updateRangeValue('fontSize', '24px');
      setFieldValue('lineHeight', 2);
      updateRangeValue('lineHeight', '2');
      setFieldValue('letterSpacing', 2);
      updateRangeValue('letterSpacing', '2px');
      setFieldValue('highContrastMode', true);
      setFieldValue('outlineThickness', 2);
      updateRangeValue('outlineThickness', '2px');
      break;

    case 'dyslexiaFriendly':
      setFieldValue('fontFamily', 'OpenDyslexic, Arial, sans-serif');
      setFieldValue('fontSize', 18);
      updateRangeValue('fontSize', '18px');
      setFieldValue('lineHeight', 1.8);
      updateRangeValue('lineHeight', '1.8');
      setFieldValue('letterSpacing', 1);
      updateRangeValue('letterSpacing', '1px');
      setFieldValue('dyslexiaFont', true);
      break;

    case 'motionSensitive':
      setFieldValue('reduceMotion', true);
      if (document.getElementById('animationIn')) {
        setFieldValue('animationIn', 'fade');
      }
      if (document.getElementById('animationOut')) {
        setFieldValue('animationOut', 'fade');
      }
      if (document.getElementById('animationSpeed')) {
        setFieldValue('animationSpeed', 'slow');
      }
      break;
  }

  showToast(`Applied ${preset} preset`, 'success');
}

// Helper to set field value
function setFieldValue(fieldId, value) {
  const field = document.getElementById(fieldId);
  if (field) {
    if (field.type === 'checkbox') {
      field.checked = value;
    } else {
      field.value = value;
    }
  }
}

// Save settings
async function saveSettings() {
  if (!currentDock) return;

  const saveBtn = document.querySelector('.modal-footer .btn-primary');
  const originalText = saveBtn.innerHTML;
  saveBtn.innerHTML = '<span class="spinner"></span> Saving...';
  saveBtn.disabled = true;

  // Collect settings based on dock type
  const newSettings = {
    // Appearance
    fontFamily: getFieldValue('fontFamily'),
    fontSize: parseInt(getFieldValue('fontSize')),
    fontColor: getFieldValue('fontColor'),
    backgroundColor: getFieldValue('backgroundColor'),
    lineHeight: parseFloat(getFieldValue('lineHeight')),
    letterSpacing: parseFloat(getFieldValue('letterSpacing')),

    // Layout
    alignLeft: getFieldValue('alignment') === 'left',
    showTimestamps: getFieldValue('showTimestamps', 'checkbox'),
    maxLines: parseInt(getFieldValue('maxLines')),

    // Styling
    outlineThickness: parseFloat(getFieldValue('outlineThickness')),
    outlineColor: getFieldValue('outlineColor'),
    wrapLongWords: getFieldValue('wrapLongWords', 'checkbox'),

    // Accessibility
    mode: getFieldValue('mode'),
    highContrastMode: getFieldValue('highContrastMode', 'checkbox'),
    colorblindSafeMode: getFieldValue('colorblindSafeMode', 'checkbox'),
    reduceMotion: getFieldValue('reduceMotion', 'checkbox'),
    dyslexiaFont: getFieldValue('dyslexiaFont', 'checkbox'),

    // Window settings
    transparency: parseFloat(getFieldValue('transparency')), // 0-100
    keepOnTop: getFieldValue('keepOnTop', 'checkbox'),
    useVirtualScrolling: getFieldValue('useVirtualScrolling', 'checkbox'),

    // Badge settings
    badgeSize: getFieldValue('badgeSize'),
    teamLevelStyle: getFieldValue('teamLevelStyle'),
    showTeamLevel: getFieldValue('showTeamLevel', 'checkbox'),
    showModerator: getFieldValue('showModerator', 'checkbox'),
    showSubscriber: getFieldValue('showSubscriber', 'checkbox'),
    showGifter: getFieldValue('showGifter', 'checkbox'),
    showFanClub: getFieldValue('showFanClub', 'checkbox'),

    // Emoji and color settings
    emojiRenderMode: getFieldValue('emojiRenderMode'),
    usernameColorByTeamLevel: getFieldValue('usernameColorByTeamLevel', 'checkbox')
  };

  // Add full-specific settings
  if (currentDock === 'full') {
    Object.assign(newSettings, {
      showChat: getFieldValue('showChat', 'checkbox'),
      showFollows: getFieldValue('showFollows', 'checkbox'),
      showShares: getFieldValue('showShares', 'checkbox'),
      showLikes: getFieldValue('showLikes', 'checkbox'),
      showGifts: getFieldValue('showGifts', 'checkbox'),
      showSubs: getFieldValue('showSubs', 'checkbox'),
      showTreasureChests: getFieldValue('showTreasureChests', 'checkbox'),
      showJoins: getFieldValue('showJoins', 'checkbox'),
      layoutMode: getFieldValue('layoutMode'),
      feedDirection: getFieldValue('feedDirection'),
      animationIn: getFieldValue('animationIn'),
      animationOut: getFieldValue('animationOut'),
      animationSpeed: getFieldValue('animationSpeed'),
    });
  }

  try {
    const response = await fetch(`/api/clarityhud/settings/${currentDock}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newSettings)
    });

    const data = await response.json();

    if (data.success) {
      currentSettings = data.settings;
      showToast('Settings saved successfully!', 'success');
      closeSettings();

      // Refresh preview
      setTimeout(() => {
        refreshPreview(currentDock);
      }, 500);
    } else {
      showToast(`Error saving settings: ${data.error}`, 'error');
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    showToast('Error saving settings', 'error');
  } finally {
    saveBtn.innerHTML = originalText;
    saveBtn.disabled = false;
  }
}

// Get field value helper
function getFieldValue(fieldId, type = 'text') {
  const field = document.getElementById(fieldId);
  if (!field) return type === 'checkbox' ? false : '';

  if (type === 'checkbox') {
    return field.checked;
  }
  return field.value;
}

// Reset to defaults
async function resetToDefaults() {
  if (!currentDock) return;

  if (!confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
    return;
  }

  try {
    const response = await fetch(`/api/clarityhud/settings/${currentDock}/reset`, {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      currentSettings = data.settings;
      renderSettingsForm(currentDock);
      showToast('Settings reset to defaults', 'success');
    } else {
      showToast(`Error resetting settings: ${data.error}`, 'error');
    }
  } catch (error) {
    console.error('Error resetting settings:', error);
    showToast('Error resetting settings', 'error');
  }
}

// Show toast notification
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const icon = toast.querySelector('.toast-icon');
  const messageEl = toast.querySelector('.toast-message');

  icon.textContent = type === 'success' ? '✓' : '✗';
  messageEl.textContent = message;

  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Close modal on background click
window.addEventListener('click', function(event) {
  const modal = document.getElementById('settings-modal');
  if (event.target === modal) {
    closeSettings();
  }
});

// Set up event listeners with delegation for action buttons
document.addEventListener('click', function(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  
  const action = button.dataset.action;
  const type = button.dataset.type;
  
  switch(action) {
    case 'copy-url':
      copyURL(type);
      break;
    case 'open-settings':
      openSettings(type);
      break;
    case 'test-event':
      testEvent(type);
      break;
    case 'refresh-preview':
      refreshPreview(type);
      break;
  }
});

// Set up modal control event listeners
document.getElementById('close-settings-modal').addEventListener('click', closeSettings);
document.getElementById('reset-defaults-btn').addEventListener('click', resetToDefaults);
document.getElementById('cancel-settings-btn').addEventListener('click', closeSettings);
document.getElementById('save-settings-btn').addEventListener('click', saveSettings);

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
