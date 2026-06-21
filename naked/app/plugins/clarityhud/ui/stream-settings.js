/**
 * ClarityHUD - Stream Overlay Settings Tab
 *
 * Standalone JS module for the Stream Overlay Settings tab.
 * Loaded in main.html, consumed by main.js when dock === 'stream'.
 *
 * Exposes window.StreamSettingsTab with:
 *   - getStreamTabHTML(settings)
 *   - initStreamTab(settings)
 *   - collectStreamSettings()
 *   - loadStreamSettings() → Promise<settings>
 *   - saveStreamSettings(settings) → Promise
 */

(function () {
  'use strict';

  // Slot options used by slot-assignment dropdowns
  const SLOT_OPTIONS = [
    { value: 'slot-top-left',      label: 'Top Left' },
    { value: 'slot-top-center',    label: 'Top Center' },
    { value: 'slot-top-right',     label: 'Top Right' },
    { value: 'slot-bottom-left',   label: 'Bottom Left' },
    { value: 'slot-bottom-center', label: 'Bottom Center' },
    { value: 'slot-bottom-right',  label: 'Bottom Right' },
    { value: 'slot-left-rail',     label: 'Left Rail' },
    { value: 'slot-right-rail',    label: 'Right Rail' },
  ];

  // Event types for the visibility / TTL / slot tables
  const EVENTS = [
    { key: 'Chat',           settingShow: 'showChat',            settingTtl: 'ttlChat',      settingSlot: 'slotChat',      icon: '💬' },
    { key: 'Follow',         settingShow: 'showFollows',         settingTtl: 'ttlFollow',    settingSlot: 'slotFollow',    icon: '❤️' },
    { key: 'Share',          settingShow: 'showShares',          settingTtl: 'ttlShare',     settingSlot: 'slotShare',     icon: '🔄' },
    { key: 'Like',           settingShow: 'showLikes',           settingTtl: 'ttlLike',      settingSlot: 'slotLike',      icon: '👍' },
    { key: 'Gift',           settingShow: 'showGifts',           settingTtl: 'ttlGift',      settingSlot: 'slotGift',      icon: '🎁' },
    { key: 'Sub',            settingShow: 'showSubs',            settingTtl: 'ttlSub',       settingSlot: 'slotSub',       icon: '⭐' },
    { key: 'Treasure',       settingShow: 'showTreasureChests',  settingTtl: 'ttlTreasure',  settingSlot: 'slotTreasure',  icon: '💎' },
    { key: 'Join',           settingShow: 'showJoins',           settingTtl: 'ttlJoin',      settingSlot: 'slotJoin',      icon: '👋' },
  ];

  // Animation options
  const ANIM_OPTIONS = [
    { value: 'auto',        label: 'Auto (slot-based)' },
    { value: 'fade',        label: 'Fade' },
    { value: 'slide-left',  label: 'Slide Left' },
    { value: 'slide-right', label: 'Slide Right' },
    { value: 'slide-up',    label: 'Slide Up' },
    { value: 'pop',         label: 'Pop' },
    { value: 'bounce',      label: 'Bounce' },
  ];

  /**
   * Build a <select> options string
   */
  function optionsHTML(options, selectedValue) {
    return options.map(o =>
      `<option value="${o.value}"${o.value === selectedValue ? ' selected' : ''}>${o.label}</option>`
    ).join('');
  }

  // ==================== TAB HTML ====================

  /**
   * Returns the full HTML string for the stream settings tab content.
   * @param {object} s - Current stream settings
   * @returns {string}
   */
  function getStreamTabHTML(s) {
    return `
      <!-- FORMAT & LAYOUT -->
      <div class="settings-group">
        <h3>Format &amp; Layout</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Orientation</label>
            <div style="display:flex;gap:16px;margin-top:4px;">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:500;">
                <input type="radio" name="stream-orientation" value="landscape" ${s.orientation !== 'portrait' ? 'checked' : ''}> Landscape
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:500;">
                <input type="radio" name="stream-orientation" value="portrait" ${s.orientation === 'portrait' ? 'checked' : ''}> Portrait
              </label>
            </div>
          </div>
          <div class="form-group">
            <label>Opacity</label>
            <div class="range-group">
              <div class="range-value">
                <label>Overlay Opacity</label>
                <span id="stream-opacity-value">${s.opacity != null ? s.opacity : 1}</span>
              </div>
              <input type="range" id="stream-opacity" min="0" max="1" step="0.01" value="${s.opacity != null ? s.opacity : 1}">
            </div>
          </div>
        </div>
      </div>

      <!-- EVENT VISIBILITY -->
      <div class="settings-group">
        <h3>Event Visibility</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="text-align:left;border-bottom:2px solid #667eea;">
              <th style="padding:8px;">Event</th>
              <th style="padding:8px;text-align:center;">Active</th>
              <th style="padding:8px;">TTL (ms)</th>
            </tr>
          </thead>
          <tbody>
            ${EVENTS.map(ev => `
              <tr style="border-bottom:1px solid var(--color-border,#e0e0e0);">
                <td style="padding:8px;">${ev.icon} ${ev.key}</td>
                <td style="padding:8px;text-align:center;">
                  <input type="checkbox" id="stream-${ev.settingShow}" ${s[ev.settingShow] ? 'checked' : ''}>
                </td>
                <td style="padding:8px;">
                  <input type="number" id="stream-${ev.settingTtl}" min="1000" max="60000" step="500" value="${s[ev.settingTtl] || 5000}"
                    style="width:100px;padding:6px 10px;border:2px solid var(--color-border,#e0e0e0);border-radius:6px;">
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- SLOT ASSIGNMENT -->
      <div class="settings-group">
        <h3>Slot Assignment</h3>
        <span class="help-text">Choose where each event type appears on screen</span>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
          <thead>
            <tr style="text-align:left;border-bottom:2px solid #667eea;">
              <th style="padding:8px;">Event</th>
              <th style="padding:8px;">Slot</th>
            </tr>
          </thead>
          <tbody>
            ${EVENTS.map(ev => `
              <tr style="border-bottom:1px solid var(--color-border,#e0e0e0);">
                <td style="padding:8px;">${ev.icon} ${ev.key}</td>
                <td style="padding:8px;">
                  <select id="stream-${ev.settingSlot}" style="padding:6px 10px;border:2px solid var(--color-border,#e0e0e0);border-radius:6px;">
                    ${optionsHTML(SLOT_OPTIONS, s[ev.settingSlot] || 'slot-bottom-right')}
                  </select>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- HIGHLIGHT -->
      <div class="settings-group">
        <h3>Highlight Rules</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Gift Highlight Threshold (coins)</label>
            <input type="number" id="stream-highlightGiftThreshold" min="0" max="100000" step="10"
              value="${s.highlightGiftThreshold != null ? s.highlightGiftThreshold : 100}"
              style="padding:10px 14px;border:2px solid var(--color-border,#e0e0e0);border-radius:8px;font-size:14px;">
            <span class="help-text">Gifts above this value appear as HighlightCards</span>
          </div>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="stream-highlightAlwaysSub" ${s.highlightAlwaysSub !== false ? 'checked' : ''}>
          <label for="stream-highlightAlwaysSub">Always highlight Subscriptions</label>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="stream-highlightAlwaysTreasure" ${s.highlightAlwaysTreasure !== false ? 'checked' : ''}>
          <label for="stream-highlightAlwaysTreasure">Always highlight Treasure Chests</label>
        </div>
      </div>

      <!-- ANIMATION -->
      <div class="settings-group">
        <h3>Animation</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Entry Animation</label>
            <select id="stream-animIn" style="padding:10px 14px;border:2px solid var(--color-border,#e0e0e0);border-radius:8px;font-size:14px;">
              ${optionsHTML(ANIM_OPTIONS, s.animIn || 'auto')}
            </select>
          </div>
          <div class="form-group">
            <label>Exit Animation</label>
            <select id="stream-animOut" style="padding:10px 14px;border:2px solid var(--color-border,#e0e0e0);border-radius:8px;font-size:14px;">
              ${optionsHTML(ANIM_OPTIONS, s.animOut || 'auto')}
            </select>
          </div>
        </div>
      </div>

      <!-- TICKER -->
      <div class="settings-group">
        <h3>Ticker Bar</h3>
        <div class="checkbox-group">
          <input type="checkbox" id="stream-tickerEnabled" ${s.tickerEnabled ? 'checked' : ''}>
          <label for="stream-tickerEnabled">Enable Ticker Bar</label>
        </div>
        <span class="help-text">Scrolling text bar at the bottom showing recent events</span>
        <div class="form-row" style="margin-top:12px;">
          <div class="form-group">
            <label>Ticker Speed (px/s)</label>
            <input type="number" id="stream-tickerSpeed" min="10" max="300" step="5"
              value="${s.tickerSpeed || 60}"
              style="padding:10px 14px;border:2px solid var(--color-border,#e0e0e0);border-radius:8px;font-size:14px;">
          </div>
          <div class="form-group">
            <label>Ticker Label</label>
            <input type="text" id="stream-tickerLabel" value="${escapeAttr(s.tickerLabel || '🔴 LIVE')}"
              style="padding:10px 14px;border:2px solid var(--color-border,#e0e0e0);border-radius:8px;font-size:14px;">
          </div>
        </div>
      </div>

      <!-- ACCESSIBILITY -->
      <div class="settings-group">
        <h3>Accessibility</h3>
        <div class="checkbox-group">
          <input type="checkbox" id="stream-reduceMotion" ${s.reduceMotion ? 'checked' : ''}>
          <label for="stream-reduceMotion">Reduce Motion</label>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="stream-dyslexiaFont" ${s.dyslexiaFont ? 'checked' : ''}>
          <label for="stream-dyslexiaFont">Dyslexia-Friendly Font (OpenDyslexic)</label>
        </div>
      </div>
    `;
  }

  /**
   * Escape string for use in HTML attribute values.
   */
  function escapeAttr(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ==================== TAB INIT ====================

  /**
   * Set up interactive behaviors (range slider live-update, etc.) after
   * the tab HTML has been inserted into the DOM.
   * @param {object} settings - Current stream settings
   */
  function initStreamTab(settings) {
    // Opacity slider live preview
    const opacitySlider = document.getElementById('stream-opacity');
    const opacityDisplay = document.getElementById('stream-opacity-value');
    if (opacitySlider && opacityDisplay) {
      opacitySlider.addEventListener('input', function () {
        opacityDisplay.textContent = this.value;
      });
    }
  }

  // ==================== COLLECT ====================

  /**
   * Read all stream setting values from the DOM and return them as an object.
   * @returns {object}
   */
  function collectStreamSettings() {
    const settings = {};

    // Orientation
    const orientationRadio = document.querySelector('input[name="stream-orientation"]:checked');
    settings.orientation = orientationRadio ? orientationRadio.value : 'landscape';

    // Opacity
    settings.opacity = parseFloat(getVal('stream-opacity')) || 1;

    // Event visibility + TTL + Slot
    EVENTS.forEach(function (ev) {
      settings[ev.settingShow] = getChecked('stream-' + ev.settingShow);
      settings[ev.settingTtl] = parseInt(getVal('stream-' + ev.settingTtl), 10) || 5000;
      settings[ev.settingSlot] = getVal('stream-' + ev.settingSlot) || 'slot-bottom-right';
    });

    // Highlight
    settings.highlightGiftThreshold = parseInt(getVal('stream-highlightGiftThreshold'), 10) || 100;
    settings.highlightAlwaysSub = getChecked('stream-highlightAlwaysSub');
    settings.highlightAlwaysTreasure = getChecked('stream-highlightAlwaysTreasure');

    // Animation
    settings.animIn = getVal('stream-animIn') || 'auto';
    settings.animOut = getVal('stream-animOut') || 'auto';

    // Ticker
    settings.tickerEnabled = getChecked('stream-tickerEnabled');
    settings.tickerSpeed = parseInt(getVal('stream-tickerSpeed'), 10) || 60;
    settings.tickerLabel = getVal('stream-tickerLabel') || '🔴 LIVE';

    // Accessibility
    settings.reduceMotion = getChecked('stream-reduceMotion');
    settings.dyslexiaFont = getChecked('stream-dyslexiaFont');

    return settings;
  }

  // ==================== LOAD / SAVE ====================

  /**
   * Load stream settings from the backend.
   * @returns {Promise<object>}
   */
  async function loadStreamSettings() {
    const response = await fetch('/api/clarityhud/settings/stream');
    const data = await response.json();
    if (data.success) {
      return data.settings;
    }
    throw new Error(data.error || 'Failed to load stream settings');
  }

  /**
   * Save stream settings to the backend.
   * @param {object} settings
   * @returns {Promise<object>}
   */
  async function saveStreamSettings(settings) {
    const response = await fetch('/api/clarityhud/settings/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const data = await response.json();
    if (data.success) {
      return data.settings;
    }
    throw new Error(data.error || 'Failed to save stream settings');
  }

  // ==================== HELPERS ====================

  function getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function getChecked(id) {
    var el = document.getElementById(id);
    return el ? el.checked : false;
  }

  // ==================== EXPORT ====================

  window.StreamSettingsTab = {
    getStreamTabHTML: getStreamTabHTML,
    initStreamTab: initStreamTab,
    collectStreamSettings: collectStreamSettings,
    loadStreamSettings: loadStreamSettings,
    saveStreamSettings: saveStreamSettings,
  };
})();
