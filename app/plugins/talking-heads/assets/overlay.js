/* Talking Heads speaker stage and avatar assignment overlay. */
(() => {
  'use strict';

  const socket = io();
  const activeAvatars = new Map();
  const stage = document.getElementById('speakerStage');
  const avatarContainer = document.getElementById('avatarContainer');
  const stageIdle = document.getElementById('stageIdle');
  const spawnPulse = document.getElementById('spawnPulse');
  const OVERLAY_FALLBACK_COPY = Object.freeze({
    avatar: 'Avatar',
    test_spin: 'Avatar test spin',
    assigning: 'Assigning a new avatar',
    new_voice: 'New voice',
    reels_spinning: 'Reels are spinning'
  });

  function playbackKey(data = {}) {
    const userId = String(data.userId || '').trim();
    const supplied = String(data.playbackId || '').trim();
    return supplied || `legacy:${userId}`;
  }

  function playbackMatches(avatar, data = {}) {
    const supplied = String(data.playbackId || '').trim();
    if (!supplied) return avatar.playbackId.startsWith('legacy:');
    return avatar.playbackId === supplied;
  }

  function updateStageState() {
    const speaking = activeAvatars.size > 0;
    stage?.classList.toggle('is-speaking', speaking);
    if (stageIdle) stageIdle.hidden = speaking;
  }

  function selectionLabel(selection = {}) {
    const packId = String(selection.packId || 'boba').toLowerCase();
    const character = String(selection.characterId || '').trim();
    const options = selection.options || {};
    const parts = [character, options.expression];
    return parts.filter(Boolean).join(' · ') || overlayText('avatar');
  }

  function overlayText(key, fallback = OVERLAY_FALLBACK_COPY[key]) {
    const fullKey = `plugins.talking-heads.talking_heads_ui.stream_director.overlay.${key}`;
    const value = window.i18n?.t?.(fullKey);
    return value && value !== fullKey ? value : fallback || key;
  }

  function card(selection = {}, spriteUrl = '') {
    const element = document.createElement('div');
    element.className = 'reel-card';
    const image = document.createElement('img');
    image.alt = selectionLabel(selection);
    image.src = spriteUrl || '';
    const label = document.createElement('span');
    label.textContent = selectionLabel(selection);
    element.append(image, label);
    return element;
  }

  class AvatarSlotPresenter {
    constructor() {
      this.root = document.getElementById('avatarSpinOverlay');
      this.title = document.getElementById('slotTitle');
      this.username = document.getElementById('slotUsername');
      this.winnerAvatar = document.getElementById('slotWinnerAvatar');
      this.winnerName = document.getElementById('slotWinnerName');
      this.reels = [...document.querySelectorAll('[data-slot-reel]')];
      this.timers = [];
      this.activeSpin = null;
      this.pendingPreview = null;
      this.hideTimer = null;
    }

    _clearTimers() {
      this.timers.forEach(timer => clearTimeout(timer));
      this.timers = [];
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    _show() {
      if (!this.root) return;
      this.root.hidden = false;
      requestAnimationFrame(() => this.root?.classList.add('is-visible'));
    }

    _hideAfter(delay, token) {
      this.hideTimer = setTimeout(() => {
        if (this.activeSpin?.token !== token || !this.root) return;
        this.root.classList.remove('is-visible', 'is-spinning', 'is-revealed');
        this.root.hidden = true;
        this.activeSpin = null;
        const preview = this.pendingPreview;
        this.pendingPreview = null;
        if (preview) this.start(preview);
      }, delay);
    }

    _renderReel(reel, entries, duration) {
      const track = reel?.querySelector('.reel-track');
      if (!track) return;
      track.replaceChildren(...entries.map(entry => card(entry.selection, entry.spriteUrl)));
      track.style.setProperty('--reel-duration', `${Math.max(1, duration)}ms`);
      track.classList.remove('is-stopped');
      track.classList.add('is-spinning');
    }

    _stopReel(index, entry) {
      const track = this.reels[index]?.querySelector('.reel-track');
      if (!track) return;
      track.replaceChildren(card(entry.selection, entry.spriteUrl));
      track.classList.remove('is-spinning');
      track.classList.add('is-stopped');
    }

    _acknowledge(spin) {
      if (!spin || spin.acknowledged || this.activeSpin?.token !== spin.token) return;
      if (spin.preview) return;
      if (!spin.spinId || !spin.playbackId || !spin.userId) return;
      spin.acknowledged = true;
      socket.emit('talkingheads:avatar:spin:complete', {
        playbackId: spin.playbackId,
        userId: spin.userId,
        spinId: spin.spinId
      });
    }

    start(data = {}) {
      if (!this.root || this.reels.length !== 3) return;
      const isPreview = data.preview === true;
      if (isPreview && this.activeSpin) {
        if (!this.activeSpin.preview && !this.pendingPreview) {
          this.pendingPreview = { ...data };
        }
        return;
      }
      if (!isPreview) this.pendingPreview = null;
      const winner = data.winner || {};
      const winnerEntry = {
        selection: winner.selection || {},
        spriteUrl: winner.sprites?.idle_neutral || ''
      };
      if (!winnerEntry.spriteUrl) return;

      this._clearTimers();
      const duration = Math.max(1, Math.round(Number(data.duration) || 2600));
      const candidates = Array.isArray(data.candidates)
        ? data.candidates.filter(candidate => candidate?.spriteUrl)
        : [];
      const cards = candidates.length ? candidates : [winnerEntry];
      const token = `${String(data.spinId || '')}:${Date.now()}:${Math.random()}`;
      const spin = {
        token,
        playbackId: String(data.playbackId || '').trim(),
        userId: String(data.userId || '').trim(),
        spinId: String(data.spinId || '').trim(),
        preview: isPreview,
        acknowledged: false
      };
      this.activeSpin = spin;

      this.title.textContent = data.preview === true
        ? overlayText('test_spin')
        : overlayText('assigning');
      this.username.textContent = String(data.username || overlayText('new_voice'));
      this.winnerAvatar.removeAttribute('src');
      this.winnerName.textContent = overlayText('reels_spinning');
      this.root.classList.remove('is-revealed');
      this.root.classList.add('is-spinning');
      this.reels.forEach((reel, index) => {
        const strip = [...cards, ...cards, ...cards, ...cards].map((entry, entryIndex) => (
          entryIndex === 6 + index ? winnerEntry : entry
        ));
        this._renderReel(reel, strip, duration);
      });
      this._show();

      const stops = [0.56, 0.76, 1];
      stops.forEach((fraction, index) => {
        this.timers.push(setTimeout(() => {
          if (this.activeSpin?.token !== token) return;
          this._stopReel(index, index === 1 ? winnerEntry : cards[index % cards.length]);
        }, Math.round(duration * fraction)));
      });
      this.timers.push(setTimeout(() => {
        if (this.activeSpin?.token !== token) return;
        this.root.classList.remove('is-spinning');
        this.root.classList.add('is-revealed');
        this.winnerAvatar.src = winnerEntry.spriteUrl;
        this.winnerName.textContent = selectionLabel(winnerEntry.selection);
        this._acknowledge(spin);
        this._hideAfter(5200, token);
      }, duration));
    }
  }

  let currentConfig = {
    nameplatePosition: 'below',
    nameplateFontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    nameplateFontSize: 14,
    nameplateFontColor: '#ffffff',
    nameplateBackgroundColor: '#060c1c',
    nameplateBackgroundOpacity: 0.75,
    nameplateTextShadow: 'subtle',
    nameplateTextStroke: 'none',
    headEntranceAnimation: 'slide-up',
    headExitAnimation: 'fade',
    nameplateEntranceAnimation: 'fade',
    nameplateExitAnimation: 'fade'
  };

  const SHADOW_MAP = {
    'none': 'none',
    'subtle': '0 1px 3px rgba(0, 0, 0, 0.8)',
    'medium': '0 2px 8px rgba(0, 0, 0, 0.9)',
    'glow': '0 0 8px rgba(101, 225, 255, 0.8), 0 0 14px rgba(101, 225, 255, 0.5)'
  };

  const STROKE_MAP = {
    'none': '0 transparent',
    '1px black': '1px #000000',
    '2px black': '2px #000000',
    '1px white': '1px #ffffff'
  };

  function hexToRgba(hex, opacity = 1) {
    if (!hex || typeof hex !== 'string') return 'rgba(6, 12, 28, ' + opacity + ')';
    let clean = hex.replace('#', '').trim();
    if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
    if (clean.length !== 6) return 'rgba(6, 12, 28, ' + opacity + ')';
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const a = Math.max(0, Math.min(1, Number(opacity) ?? 1));
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
  }

  function applyOverlayConfig(config = {}) {
    currentConfig = { ...currentConfig, ...config };
    if (stage) {
      if (currentConfig.nameplateFontFamily) {
        stage.style.setProperty('--th-name-font', currentConfig.nameplateFontFamily);
      }
      if (currentConfig.nameplateFontSize) {
        stage.style.setProperty('--th-name-size', currentConfig.nameplateFontSize + 'px');
      }
      if (currentConfig.nameplateFontColor) {
        stage.style.setProperty('--th-name-color', currentConfig.nameplateFontColor);
      }
      const bg = hexToRgba(currentConfig.nameplateBackgroundColor, currentConfig.nameplateBackgroundOpacity);
      stage.style.setProperty('--th-name-bg', bg);

      const shadow = SHADOW_MAP[currentConfig.nameplateTextShadow] || currentConfig.nameplateTextShadow || 'none';
      stage.style.setProperty('--th-name-shadow', shadow);

      const stroke = STROKE_MAP[currentConfig.nameplateTextStroke] || currentConfig.nameplateTextStroke || 'none';
      stage.style.setProperty('--th-name-stroke', stroke);
    }

    activeAvatars.forEach(avatar => avatar.updateConfig?.(currentConfig));
  }

  class AvatarInstance {
    constructor(data) {
      this.userId = String(data.userId || '');
      this.username = String(data.username || this.userId);
      this.playbackId = playbackKey(data);
      this.sprites = data.sprites || {};
      this.config = currentConfig;
      this.element = document.createElement('article');
      this.element.className = 'avatar nameplate-' + (this.config.nameplatePosition || 'below');
      this.element.dataset.userId = this.userId;
      this.element.dataset.playbackId = this.playbackId;

      this.headEnterClass = 'th-enter-' + (this.config.headEntranceAnimation || 'slide-up');
      this.headExitClass = 'th-exit-' + (this.config.headExitAnimation || 'fade');
      this.nameEnterClass = 'th-enter-' + (this.config.nameplateEntranceAnimation || 'fade');
      this.nameExitClass = 'th-exit-' + (this.config.nameplateExitAnimation || 'fade');

      this.image = document.createElement('img');
      this.image.alt = this.username;
      this.image.src = this.sprites.idle_neutral || '';
      this.image.classList.add(this.headEnterClass);

      this.name = document.createElement('span');
      this.name.className = 'avatar-name';
      this.name.textContent = this.username;
      this.name.classList.add(this.nameEnterClass);

      this.element.append(this.image, this.name);
      avatarContainer?.appendChild(this.element);
      requestAnimationFrame(() => this.element.classList.add('is-visible'));
    }

    updateFrame(frame) {
      if (this.sprites[frame]) this.image.src = this.sprites[frame];
    }

    updateConfig(config) {
      this.config = config;
      this.element.classList.remove('nameplate-above', 'nameplate-below', 'nameplate-hidden');
      this.element.classList.add('nameplate-' + (config.nameplatePosition || 'below'));
      this.headExitClass = 'th-exit-' + (config.headExitAnimation || 'fade');
      this.nameExitClass = 'th-exit-' + (config.nameplateExitAnimation || 'fade');
    }

    hide(fadeOutDuration, onComplete) {
      const duration = fadeOutDuration !== undefined && Number(fadeOutDuration) === 0
        ? 0
        : Math.max(0, Number(fadeOutDuration) || 300);

      this.element.style.setProperty('--th-exit-duration', duration + 'ms');
      this.image.classList.remove(this.headEnterClass);
      this.image.classList.add(this.headExitClass);
      this.name.classList.remove(this.nameEnterClass);
      this.name.classList.add(this.nameExitClass);

      this.element.classList.remove('is-visible');
      this.element.classList.add('is-leaving');
      setTimeout(() => {
        this.element.remove();
        onComplete?.();
      }, duration);
    }

    stop() {
      this.element.remove();
    }
  }

  const slotPresenter = new AvatarSlotPresenter();

  socket.on('talkingheads:avatar:spin:start', data => {
    slotPresenter.start(data || {});
  });

  socket.on('talkingheads:animation:start', data => {
    const userId = String(data?.userId || '').trim();
    if (!userId || !data?.sprites) return;
    const incomingPlaybackId = playbackKey(data);
    const existing = activeAvatars.get(userId);
    if (existing?.playbackId === incomingPlaybackId) return;
    if (existing) existing.stop();
    const avatar = new AvatarInstance(data);
    activeAvatars.set(userId, avatar);
    updateStageState();
  });

  socket.on('talkingheads:animation:frame', data => {
    const avatar = activeAvatars.get(String(data?.userId || ''));
    if (!avatar || !playbackMatches(avatar, data)) return;
    avatar.updateFrame(data.frame);
  });

  socket.on('talkingheads:animation:end', data => {
    const userId = String(data?.userId || '');
    const avatar = activeAvatars.get(userId);
    if (!avatar || !playbackMatches(avatar, data)) return;
    avatar.hide(data.fadeOutDuration, () => {
      if (activeAvatars.get(userId) !== avatar) return;
      activeAvatars.delete(userId);
      updateStageState();
    });
  });

  socket.on('talkingheads:animation:stop', data => {
    const userId = String(data?.userId || '');
    const avatar = activeAvatars.get(userId);
    if (!avatar || !playbackMatches(avatar, data)) return;
    avatar.stop();
    activeAvatars.delete(userId);
    updateStageState();
  });

  socket.on('talkingheads:avatar:spawn', () => {
    if (!spawnPulse) return;
    spawnPulse.classList.remove('is-active');
    requestAnimationFrame(() => spawnPulse.classList.add('is-active'));
  });

  socket.on('disconnect', () => {
    activeAvatars.forEach(avatar => avatar.stop());
    activeAvatars.clear();
    updateStageState();
  });

  socket.on('talkingheads:config:update', data => {
    if (data?.config) {
      applyOverlayConfig(data.config);
    }
  });

  applyOverlayConfig(currentConfig);

  fetch('/api/talkingheads/config')
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (data?.config) {
        applyOverlayConfig(data.config);
      }
    })
    .catch(() => {});

  updateStageState();
})();
