/**
 * ViewerBarManager – Client-side logic for the Talking Heads Viewer Bar overlay
 * Manages a scrolling bar of viewer avatars and pop-up speaking animations.
 */

/* global io */

class ViewerBarManager {
  /**
   * @param {object} socket - Socket.IO client instance
   */
  constructor(socket) {
    this.socket = socket;

    /** @type {Map<string, ViewerEntry>} userId → viewer entry */
    this.viewers = new Map();

    this.config = {
      avatarSize: 64,
      scrollSpeed: 30,
      scrollDirection: 'left',
      popUpDuration: 5000,
      popUpHeight: 150,
      showChatBubble: true,
      chatBubbleDuration: 4000,
      idleBlinkEnabled: true,
      idleBlinkInterval: 3000,
      barBackground: 'rgba(0,0,0,0.3)',
      barBorderRadius: 12,
      showUsername: true,
      maxVisibleViewers: 20,
      pauseScrollOnSpeak: true
    };

    this._scrollOffset = 0;
    this._scrollRafId = null;
    this._lastScrollTime = null;
    this._isSpeaking = false;

    this._applyConfigToCss();
    this._startScrollLoop();
  }

  // ================================================================
  // Config
  // ================================================================

  /**
   * Update config and re-apply CSS variables
   * @param {object} newConfig
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this._applyConfigToCss();
  }

  _applyConfigToCss() {
    const root = document.documentElement;
    root.style.setProperty('--avatar-size', `${this.config.avatarSize || 64}px`);
    root.style.setProperty('--popup-height', `${this.config.popUpHeight || 150}px`);
    root.style.setProperty('--bar-height', `${(this.config.avatarSize || 64) + 16}px`);
    root.style.setProperty('--bar-bg', this.config.barBackground || 'rgba(0,0,0,0.3)');
    root.style.setProperty('--bar-radius', `${this.config.barBorderRadius || 12}px`);
  }

  // ================================================================
  // Viewer management
  // ================================================================

  /**
   * Add a viewer to the bar (or update an existing one)
   * @param {string} userId
   * @param {string} username
   * @param {object|null} sprites - Relative URL sprite map
   */
  addViewer(userId, username, sprites) {
    if (this.viewers.has(userId)) {
      // Update sprites if they arrive later
      const entry = this.viewers.get(userId);
      if (sprites && !entry.sprites) {
        entry.sprites = sprites;
        if (entry.imgElement && sprites.idle_neutral) {
          entry.imgElement.src = sprites.idle_neutral;
        }
      }
      return;
    }

    // Enforce max visible viewers
    if (this.viewers.size >= (this.config.maxVisibleViewers || 20)) {
      return;
    }

    const element = this._createAvatarElement(userId, username, sprites);
    const imgElement = element.querySelector('img');

    /** @type {ViewerEntry} */
    const entry = {
      userId,
      username,
      sprites: sprites || null,
      element,
      imgElement,
      isSpeaking: false,
      speakTimer: null,
      returnTimer: null,
      blinkTimer: null
    };

    this.viewers.set(userId, entry);

    const inner = document.getElementById('viewerBarInner');
    if (inner) inner.appendChild(element);

    if (this.config.idleBlinkEnabled) {
      this._scheduleIdleBlink(entry);
    }
  }

  /**
   * Remove a viewer from the bar
   * @param {string} userId
   */
  removeViewer(userId) {
    const entry = this.viewers.get(userId);
    if (!entry) return;

    if (entry.isSpeaking) {
      this.stopSpeaking(userId);
    }

    this._clearBlinkTimer(entry);
    entry.element.style.opacity = '0';
    entry.element.style.transition = 'opacity 0.4s ease';
    setTimeout(() => {
      if (entry.element.parentNode) {
        entry.element.parentNode.removeChild(entry.element);
      }
    }, 400);

    this.viewers.delete(userId);
  }

  /**
   * Full state sync – replaces current viewer list
   * @param {Array<{userId, username, sprites}>} viewers
   */
  syncState(viewers) {
    // Remove viewers not in new state
    const newIds = new Set(viewers.map((v) => v.userId));
    for (const userId of this.viewers.keys()) {
      if (!newIds.has(userId)) this.removeViewer(userId);
    }
    // Add / update
    for (const v of viewers) {
      this.addViewer(v.userId, v.username, v.sprites);
    }
  }

  // ================================================================
  // Speaking animation
  // ================================================================

  /**
   * Animate a viewer into the speaking zone with mouth animation
   * @param {string} userId
   * @param {string} message
   * @param {number} duration - ms before returning to bar
   */
  startSpeaking(userId, message, duration) {
    const viewer = this.viewers.get(userId);
    if (!viewer || viewer.isSpeaking) return;

    viewer.isSpeaking = true;
    this._isSpeaking = this.config.pauseScrollOnSpeak;

    const speakingZone = document.getElementById('speakingZone');
    if (!speakingZone) return;

    // 1. Insert ghost placeholder in bar
    const ghost = document.createElement('div');
    ghost.className = 'viewer-avatar ghost-placeholder';
    ghost.style.width = `${this.config.avatarSize || 64}px`;
    ghost.style.height = `${this.config.avatarSize || 64}px`;
    ghost.setAttribute('data-ghost-for', userId);
    if (viewer.element.parentNode) {
      viewer.element.parentNode.insertBefore(ghost, viewer.element);
    }

    // 2. Move avatar to speaking zone
    speakingZone.appendChild(viewer.element);
    viewer.element.classList.add('speaking-active');

    // Position the avatar near its ghost location
    const ghostRect = ghost.getBoundingClientRect();
    viewer.element.style.left = `${ghostRect.left}px`;

    // 3. Trigger pop-up animation (next frame so transition fires)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        viewer.element.classList.add('pop-up');
      });
    });

    // 4. Stop idle blink
    this._clearBlinkTimer(viewer);

    // 5. Start mouth animation cycle
    const speakFrames = ['speak_closed', 'speak_mid', 'speak_open', 'speak_mid'];
    let frameIndex = 0;
    viewer.speakTimer = setInterval(() => {
      if (viewer.imgElement && viewer.sprites && viewer.sprites[speakFrames[frameIndex]]) {
        viewer.imgElement.src = viewer.sprites[speakFrames[frameIndex]];
      }
      frameIndex = (frameIndex + 1) % speakFrames.length;
    }, 150);

    // 6. Chat bubble
    if (this.config.showChatBubble && message) {
      this._showChatBubble(viewer.element, message);
    }

    // 7. Username label
    if (this.config.showUsername) {
      this._showUsernameLabel(viewer.element, viewer.username);
    }

    // 8. Schedule return
    const effectiveDuration = duration || this.config.popUpDuration || 5000;
    viewer.returnTimer = setTimeout(() => {
      this.stopSpeaking(userId);
    }, effectiveDuration);
  }

  /**
   * Return a speaking viewer back to the bar
   * @param {string} userId
   */
  stopSpeaking(userId) {
    const viewer = this.viewers.get(userId);
    if (!viewer || !viewer.isSpeaking) return;

    viewer.isSpeaking = false;
    clearInterval(viewer.speakTimer);
    clearTimeout(viewer.returnTimer);
    viewer.speakTimer = null;
    viewer.returnTimer = null;

    // Check if any other viewer is still speaking
    let anyStillSpeaking = false;
    for (const v of this.viewers.values()) {
      if (v.isSpeaking) { anyStillSpeaking = true; break; }
    }
    if (!anyStillSpeaking) this._isSpeaking = false;

    // Remove overlays
    const bubble = viewer.element.querySelector('.chat-bubble');
    if (bubble) bubble.remove();
    const label = viewer.element.querySelector('.speaking-label');
    if (label) label.remove();

    // Return to idle sprite
    if (viewer.imgElement && viewer.sprites) {
      viewer.imgElement.src = viewer.sprites.idle_neutral || viewer.sprites.speak_closed || '';
    }

    // Animate back to bar
    viewer.element.classList.remove('pop-up');
    viewer.element.classList.add('returning');

    setTimeout(() => {
      const ghost = document.querySelector(`[data-ghost-for="${userId}"]`);
      if (ghost && ghost.parentNode) {
        ghost.parentNode.insertBefore(viewer.element, ghost);
        ghost.remove();
      } else {
        const inner = document.getElementById('viewerBarInner');
        if (inner) inner.appendChild(viewer.element);
      }

      viewer.element.classList.remove('speaking-active', 'returning');
      viewer.element.style.left = '';

      // Resume idle blink
      if (this.config.idleBlinkEnabled) {
        this._scheduleIdleBlink(viewer);
      }
    }, 400);
  }

  // ================================================================
  // Scroll loop
  // ================================================================

  _startScrollLoop() {
    const tick = (timestamp) => {
      if (this._lastScrollTime == null) this._lastScrollTime = timestamp;
      const delta = timestamp - this._lastScrollTime;
      this._lastScrollTime = timestamp;

      if (!this._isSpeaking && this.config.scrollSpeed > 0) {
        const inner = document.getElementById('viewerBarInner');
        if (inner) {
          const direction = this.config.scrollDirection === 'right' ? -1 : 1;
          this._scrollOffset += direction * (this.config.scrollSpeed / 1000) * delta;

          const totalWidth = inner.scrollWidth;
          const containerWidth = inner.parentElement ? inner.parentElement.clientWidth : 0;

          // Wrap when we've scrolled past the full content width
          if (totalWidth > containerWidth) {
            if (direction > 0 && this._scrollOffset > totalWidth) {
              this._scrollOffset = 0;
            } else if (direction < 0 && this._scrollOffset < -totalWidth) {
              this._scrollOffset = 0;
            }
          }

          inner.style.transform = `translateX(${-this._scrollOffset}px)`;
        }
      }

      this._scrollRafId = requestAnimationFrame(tick);
    };

    this._scrollRafId = requestAnimationFrame(tick);
  }

  // ================================================================
  // Idle blink
  // ================================================================

  _scheduleIdleBlink(viewer) {
    this._clearBlinkTimer(viewer);
    const interval = (this.config.idleBlinkInterval || 3000) + Math.random() * 2000;
    viewer.blinkTimer = setTimeout(() => {
      if (!viewer.isSpeaking && viewer.imgElement && viewer.sprites && viewer.sprites.blink) {
        viewer.imgElement.src = viewer.sprites.blink;
        setTimeout(() => {
          if (!viewer.isSpeaking && viewer.imgElement && viewer.sprites) {
            viewer.imgElement.src = viewer.sprites.idle_neutral || viewer.sprites.speak_closed || '';
          }
          this._scheduleIdleBlink(viewer);
        }, 120);
      } else {
        this._scheduleIdleBlink(viewer);
      }
    }, interval);
  }

  _clearBlinkTimer(viewer) {
    if (viewer.blinkTimer) {
      clearTimeout(viewer.blinkTimer);
      viewer.blinkTimer = null;
    }
  }

  // ================================================================
  // DOM helpers
  // ================================================================

  _createAvatarElement(userId, username, sprites) {
    const wrapper = document.createElement('div');
    wrapper.className = 'viewer-avatar';
    wrapper.setAttribute('data-user-id', userId);

    const img = document.createElement('img');
    img.alt = username;
    img.src = (sprites && sprites.idle_neutral) ? sprites.idle_neutral : '';
    img.onerror = function () { this.style.visibility = 'hidden'; };
    wrapper.appendChild(img);

    if (this.config.showUsername) {
      const label = document.createElement('div');
      label.className = 'viewer-username';
      label.textContent = username;
      wrapper.appendChild(label);
    }

    return wrapper;
  }

  _showChatBubble(element, message) {
    const existing = element.querySelector('.chat-bubble');
    if (existing) existing.remove();

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = message.length > 80 ? message.slice(0, 77) + '…' : message;
    element.appendChild(bubble);

    const duration = this.config.chatBubbleDuration || 4000;
    setTimeout(() => {
      if (bubble.parentNode) bubble.remove();
    }, duration);
  }

  _showUsernameLabel(element, username) {
    const existing = element.querySelector('.speaking-label');
    if (existing) existing.remove();

    const label = document.createElement('div');
    label.className = 'speaking-label';
    label.textContent = username;
    element.appendChild(label);
  }
}
