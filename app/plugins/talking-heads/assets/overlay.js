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
    const parts = packId === 'kenney'
      ? ['Kenney', character, options.eye]
      : packId === 'rgs'
        ? ['RGS', character, options.hair, options.eyes, options.mouth]
        : [character, options.expression];
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

  class AvatarInstance {
    constructor(data) {
      this.userId = String(data.userId || '');
      this.username = String(data.username || this.userId);
      this.playbackId = playbackKey(data);
      this.sprites = data.sprites || {};
      this.element = document.createElement('article');
      this.element.className = 'avatar';
      this.element.dataset.userId = this.userId;
      this.element.dataset.playbackId = this.playbackId;
      this.image = document.createElement('img');
      this.image.alt = this.username;
      this.image.src = this.sprites.idle_neutral || '';
      const name = document.createElement('span');
      name.className = 'avatar-name';
      name.textContent = this.username;
      this.element.append(this.image, name);
      avatarContainer?.appendChild(this.element);
      requestAnimationFrame(() => this.element.classList.add('is-visible'));
    }

    updateFrame(frame) {
      if (this.sprites[frame]) this.image.src = this.sprites[frame];
    }

    hide(fadeOutDuration, onComplete) {
      this.element.classList.remove('is-visible');
      this.element.classList.add('is-leaving');
      setTimeout(() => {
        this.element.remove();
        onComplete?.();
      }, Math.max(0, Number(fadeOutDuration) || 0));
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

  updateStageState();
})();
