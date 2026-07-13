'use strict';

(() => {
  const DEFAULT_ASSET = '🌧️';
  const PROFILE_PICTURE_TOKEN = '{{profilePicture}}';
  const MAX_EVENT_PARTICLES = 500;
  const MAX_IN_FLIGHT_SPAWNS = 8;
  const RATE_TICK_MS = 40;

  const locationPathname = String(globalThis.location?.pathname || '/webgpu-emoji-rain/overlay');
  const locationSearch = String(globalThis.location?.search || '');

  function getSearchParam(name) {
    const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = locationSearch.match(new RegExp(`(?:^|[?&])${escapedName}=([^&]*)`, 'i'));
    if (!match) return null;
    try {
      return decodeURIComponent(match[1].replace(/\+/g, ' '));
    } catch (_) {
      return match[1];
    }
  }

  const state = {
    renderer: null,
    rendererReady: false,
    socket: null,
    config: {},
    userMappings: {},
    overlay: {
      paused: false,
      theme: 'default',
      opacity: 1,
      speed: 1,
      boundingBox: { x: 0, y: 0, width: 1, height: 1 }
    },
    paused: false,
    enabled: true,
    queued: [],
    initQueue: [],
    rateQueue: [],
    pausedQueuedParticles: 0,
    initQueuedParticles: 0,
    rateQueuedParticles: 0,
    pendingDroppedParticles: 0,
    rate: 40,
    tokenCapacity: 80,
    tokens: 80,
    lastTokenRefillAt: performance.now(),
    rateTimer: null,
    inFlightSpawns: 0,
    lastMetricsSentAt: 0,
    isObsHud: locationPathname.split('/').includes('obs-hud'),
    debugStatus: ['1', 'true', 'yes'].includes(String(getSearchParam('debug') || '').toLowerCase())
  };
  globalThis.__webgpuEmojiRain = state;

  const OVERLAY_LAYER_ALIASES = Object.freeze({
    all: 'all',
    default: 'all',
    combined: 'all',
    full: 'all',
    alle: 'all',
    komplett: 'all',
    emoji: 'emoji',
    emojis: 'emoji',
    emojiregen: 'emoji',
    hearts: 'hearts',
    heart: 'hearts',
    'heart-balloons': 'hearts',
    herzballons: 'hearts',
    herzen: 'hearts',
    gifts: 'gifts',
    gift: 'gifts',
    'gift-balls': 'gifts',
    geschenkeregen: 'gifts',
    geschenke: 'gifts',
    'emoji-gifts': 'emoji-gifts',
    'emoji-gift': 'emoji-gifts',
    'emojis-gifts': 'emoji-gifts',
    'emojiregen-geschenkeregen': 'emoji-gifts',
    'emojiregen-geschenke': 'emoji-gifts',
    'emoji-geschenke': 'emoji-gifts'
  });

  const OVERLAY_LAYER_PERMISSIONS = Object.freeze({
    all: { emoji: true, hearts: true, gifts: true },
    emoji: { emoji: true, hearts: false, gifts: false },
    hearts: { emoji: false, hearts: true, gifts: false },
    gifts: { emoji: false, hearts: false, gifts: true },
    'emoji-gifts': { emoji: true, hearts: false, gifts: true }
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finiteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeOverlayLayer(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/_/g, '-');
    if (!raw) return 'all';

    if (raw.includes(',') || raw.includes('+')) {
      const parts = raw.split(/[,+]/).map(part => normalizeOverlayLayer(part));
      const hasEmoji = parts.includes('emoji');
      const hasGifts = parts.includes('gifts');
      const hasHearts = parts.includes('hearts');
      if (hasEmoji && hasGifts && !hasHearts) return 'emoji-gifts';
      if (hasEmoji && hasGifts && hasHearts) return 'all';
    }

    return OVERLAY_LAYER_ALIASES[raw] || 'all';
  }

  function detectOverlayLayer() {
    const explicit = getSearchParam('layer') || getSearchParam('layers') || getSearchParam('mode');
    if (explicit) return normalizeOverlayLayer(explicit);

    const pathParts = locationPathname.split('/').filter(Boolean);
    const obsIndex = pathParts.indexOf('obs-hud');
    if (obsIndex >= 0 && pathParts[obsIndex + 1]) {
      return normalizeOverlayLayer(pathParts[obsIndex + 1]);
    }
    return 'all';
  }

  function layerPermissions() {
    return OVERLAY_LAYER_PERMISSIONS[detectOverlayLayer()] || OVERLAY_LAYER_PERMISSIONS.all;
  }

  const allowed = layerPermissions();

  function toggleClass(element, className, enabled) {
    if (!element?.classList) return;
    if (typeof element.classList.toggle === 'function') {
      element.classList.toggle(className, enabled);
    } else if (enabled) {
      element.classList.add?.(className);
    } else {
      element.classList.remove?.(className);
    }
  }

  function updateStatus(status = {}) {
    const panel = document.getElementById('webgpu-status');
    const label = document.getElementById('webgpu-status-label');
    const details = document.getElementById('webgpu-status-details');
    const fallbackHint = document.getElementById('webgpu-fallback-hint');
    const statusName = String(status.state || 'initializing');
    const showReady = statusName === 'ready' && state.debugStatus;
    const showProblem = ['unsupported', 'error', 'device-lost'].includes(statusName);

    if (panel) {
      // The HTML stylesheet intentionally displays data-state="ready". Use
      // "running" outside debug mode so the production OBS output stays clean.
      panel.dataset.state = statusName === 'ready' && !showReady ? 'running' : statusName;
      toggleClass(panel, 'visible', showReady || showProblem);
    }
    if (label) {
      const labels = {
        ready: 'READY · WEBGPU',
        unsupported: 'WEBGPU NICHT VERFÜGBAR',
        'device-lost': 'WEBGPU-GERÄT VERLOREN',
        error: 'WEBGPU-FEHLER',
        initializing: 'INITIALISIERE WEBGPU'
      };
      label.textContent = labels[statusName] || statusName.toUpperCase();
    }
    if (details) {
      details.textContent = status.reason || [
        status.resolution,
        status.fps ? `${status.fps} FPS` : '',
        Number.isFinite(status.activeParticles) ? `${status.activeParticles} Partikel` : ''
      ].filter(Boolean).join(' · ');
    }
    toggleClass(fallbackHint, 'visible', statusName === 'unsupported' || statusName === 'error');
  }

  async function loadPayload(url, fallback = {}) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn(`[WebGPU EmojiRain] ${url}: ${error.message}`);
      return fallback;
    }
  }

  function getProfilePictureUrl(data = {}) {
    return data.profilePictureUrl
      || data.profilePicture
      || data.avatarUrl
      || data.avatar
      || data.user?.profilePictureUrl
      || data.user?.profilePicture
      || null;
  }

  function profilePictureAsset(profilePictureUrl) {
    const value = String(profilePictureUrl || '').trim();
    if (!/^https?:\/\//i.test(value)) return value || '👤';
    return `/api/webgpu-emoji-rain/avatar?url=${encodeURIComponent(value)}`;
  }

  function remoteAsset(asset) {
    const value = String(asset || '').trim();
    if (!/^https?:\/\//i.test(value)) return value;
    return `/api/webgpu-emoji-rain/asset?url=${encodeURIComponent(value)}`;
  }

  function findUserMapping(username) {
    const target = String(username || '').trim().toLowerCase();
    if (!target || !state.userMappings || typeof state.userMappings !== 'object') return null;

    for (const [storedUsername, mappedAsset] of Object.entries(state.userMappings)) {
      if (String(storedUsername).trim().toLowerCase() === target && typeof mappedAsset === 'string') {
        return mappedAsset.trim();
      }
    }
    return null;
  }

  function configuredEmojiFallback() {
    const emojis = Array.isArray(state.config.emoji_set)
      ? state.config.emoji_set.filter(value => typeof value === 'string' && value.trim())
      : [];
    return emojis.length ? emojis[Math.floor(Math.random() * emojis.length)] : DEFAULT_ASSET;
  }

  function configuredCustomImage() {
    if (state.config.use_custom_images !== true || !Array.isArray(state.config.image_urls)) return null;
    const images = state.config.image_urls.filter(value => typeof value === 'string' && value.trim());
    return images.length ? images[Math.floor(Math.random() * images.length)].trim() : null;
  }

  function normalizeAsset(data = {}, fallback = configuredEmojiFallback()) {
    const profilePictureUrl = getProfilePictureUrl(data);
    const mapped = findUserMapping(data.username || data.uniqueId);
    if (mapped) {
      if (mapped === PROFILE_PICTURE_TOKEN) {
        return { asset: profilePictureAsset(profilePictureUrl), fallback: '👤', isProfile: true };
      }
      return { asset: mapped, fallback, isProfile: false };
    }

    if (data.emoji === PROFILE_PICTURE_TOKEN) {
      return { asset: profilePictureAsset(profilePictureUrl), fallback: '👤', isProfile: true };
    }

    const reason = `${data.reason || ''} ${data.source || ''}`.toLowerCase();
    const explicitSticker = data.stickerImageUrl || data.emoteImageUrl || data.image_url;
    if (explicitSticker || reason.includes('sticker') || reason.includes('emote')) {
      return { asset: explicitSticker || data.emoji || '✨', fallback: '✨', isProfile: false };
    }

    const explicitGift = data.giftImageUrl || data.giftPictureUrl || data.imageUrl;
    if (explicitGift) {
      return { asset: explicitGift, fallback: '🎁', isProfile: false };
    }

    const customImage = configuredCustomImage();
    if (customImage) return { asset: customImage, fallback, isProfile: false };
    return { asset: data.emoji || fallback, fallback, isProfile: false };
  }

  function inferEventKind(data = {}, resolvedAsset = {}) {
    if (resolvedAsset.isProfile) return 'profile';
    const reason = `${data.reason || ''} ${data.source || ''} ${data.type || ''} ${data.mode || ''}`.toLowerCase();
    if (reason.includes('sticker') || reason.includes('emote')) return data.burst ? 'superfan' : 'sticker';
    if (reason.includes('gift')) return data.burst ? 'superfan' : 'gift';
    if (reason.includes('like')) return data.burst ? 'superfan' : 'like';
    if (reason.includes('follow')) return data.burst ? 'superfan' : 'follow';
    if (reason.includes('share')) return data.burst ? 'superfan' : 'share';
    if (reason.includes('subscribe')) return data.burst ? 'superfan' : 'subscribe';
    if (reason.includes('superfan')) return 'superfan';
    if (data.burst) return 'burst';
    return 'rain';
  }

  function safeCount(value, fallback = 1) {
    const parsed = Math.floor(Number(value));
    return clamp(Number.isFinite(parsed) ? parsed : fallback, 1, MAX_EVENT_PARTICLES);
  }

  function pendingParticleLimit() {
    const maxOnScreen = Math.max(32, Number(state.config.max_emojis_on_screen) || 320);
    const configuredRate = Math.max(1, Number(state.config.rate_limit_emojis_per_second) || 40);
    return clamp(Math.ceil(Math.max(maxOnScreen * 4, configuredRate * 6)), 256, 4096);
  }

  function recordDropped(count) {
    const safe = Math.max(0, Math.floor(Number(count) || 0));
    if (!safe) return;
    if (state.renderer && typeof state.renderer.recordDropped === 'function') {
      state.renderer.recordDropped(safe);
      return;
    }
    state.pendingDroppedParticles += safe;
  }

  function flushPendingDropped() {
    if (!state.pendingDroppedParticles || !state.renderer || typeof state.renderer.recordDropped !== 'function') return;
    state.renderer.recordDropped(state.pendingDroppedParticles);
    state.pendingDroppedParticles = 0;
  }

  function pushBounded(queue, countKey, options) {
    const requested = safeCount(options.count, 1);
    const available = Math.max(0, pendingParticleLimit() - state[countKey]);
    const accepted = Math.min(requested, available);
    if (accepted > 0) {
      queue.push({ ...options, count: accepted });
      state[countKey] += accepted;
    }
    if (accepted < requested) recordDropped(requested - accepted);
  }

  function clearPendingQueues() {
    state.queued.length = 0;
    state.initQueue.length = 0;
    state.rateQueue.length = 0;
    state.pausedQueuedParticles = 0;
    state.initQueuedParticles = 0;
    state.rateQueuedParticles = 0;
  }

  async function spawnWithFallback(options) {
    if (!state.rendererReady || !state.renderer || typeof state.renderer.spawn !== 'function') {
      pushBounded(state.initQueue, 'initQueuedParticles', options);
      return;
    }

    try {
      await state.renderer.spawn(options);
    } catch (error) {
      const fallback = String(options.fallbackAsset || configuredEmojiFallback());
      console.warn(`[WebGPU EmojiRain] Asset ${String(options.asset)} failed: ${error.message}; retrying with ${fallback}`);
      if (String(options.asset) !== fallback) {
        try {
          await state.renderer.spawn({ ...options, asset: fallback, fallbackAsset: fallback });
          return;
        } catch (fallbackError) {
          console.error(`[WebGPU EmojiRain] Fallback spawn failed: ${fallbackError.message}`);
        }
      }
      recordDropped(options.count);
    }
  }

  function refreshRateConfiguration() {
    const rate = clamp(Number(state.config.rate_limit_emojis_per_second) || 40, 1, 500);
    state.rate = rate;
    state.tokenCapacity = Math.max(1, rate * 2);
    state.tokens = Math.min(state.tokens, state.tokenCapacity);
    if (!Number.isFinite(state.tokens)) state.tokens = state.tokenCapacity;
    state.lastTokenRefillAt = performance.now();

    const limit = pendingParticleLimit();
    while (state.rateQueuedParticles > limit && state.rateQueue.length) {
      const removed = state.rateQueue.pop();
      state.rateQueuedParticles -= removed.count;
      recordDropped(removed.count);
    }
  }

  function enqueueRateLimited(options) {
    if (state.config.rate_limit_enabled === false) {
      state.inFlightSpawns++;
      void spawnWithFallback(options).finally(() => { state.inFlightSpawns--; });
      return;
    }
    pushBounded(state.rateQueue, 'rateQueuedParticles', options);
    drainRateQueue();
  }

  function dispatchReady(options) {
    if (!state.enabled) return;
    if (state.paused) {
      pushBounded(state.queued, 'pausedQueuedParticles', options);
      return;
    }
    enqueueRateLimited(options);
  }

  function enqueueSpawn(options) {
    if (!state.enabled) return;
    const normalized = { ...options, count: safeCount(options.count, 1) };
    if (!state.rendererReady) {
      pushBounded(state.initQueue, 'initQueuedParticles', normalized);
      return;
    }
    dispatchReady(normalized);
  }

  function drainRateQueue() {
    const now = performance.now();
    const elapsedSeconds = Math.max(0, (now - state.lastTokenRefillAt) / 1000);
    state.lastTokenRefillAt = now;
    state.tokens = Math.min(state.tokenCapacity, state.tokens + elapsedSeconds * state.rate);

    if (!state.rendererReady || !state.enabled || state.paused || state.config.rate_limit_enabled === false) return;

    while (state.tokens >= 1 && state.rateQueue.length && state.inFlightSpawns < MAX_IN_FLIGHT_SPAWNS) {
      const job = state.rateQueue[0];
      const batchCount = Math.min(job.count, Math.floor(state.tokens), 32);
      if (batchCount < 1) break;

      state.tokens -= batchCount;
      state.rateQueuedParticles -= batchCount;
      job.count -= batchCount;
      if (job.count <= 0) state.rateQueue.shift();

      state.inFlightSpawns++;
      void spawnWithFallback({ ...job, count: batchCount }).finally(() => { state.inFlightSpawns--; });
    }
  }

  function flushInitQueue() {
    if (!state.rendererReady || !state.initQueue.length) return;
    const pending = state.initQueue.splice(0);
    state.initQueuedParticles = 0;
    pending.forEach(dispatchReady);
  }

  function flushPausedQueue() {
    if (state.paused || !state.rendererReady || !state.queued.length) return;
    const pending = state.queued.splice(0);
    state.pausedQueuedParticles = 0;
    pending.forEach(dispatchReady);
  }

  function spreadCoordinate(base, index, count) {
    const numeric = Number(base);
    if (!Number.isFinite(numeric)) return Math.random();
    const centered = count <= 1 ? 0 : index / (count - 1) - 0.5;
    if (numeric >= 0 && numeric <= 1) {
      const spread = Math.min(0.42, Math.max(0.1, count * 0.018));
      return clamp(numeric + centered * spread + (Math.random() - 0.5) * 0.08, 0.02, 0.98);
    }
    return numeric + centered * Math.min(320, Math.max(80, count * 14)) + (Math.random() - 0.5) * 48;
  }

  function spawnEmoji(data = {}) {
    if (!allowed.emoji || !state.enabled) return;
    const resolved = normalizeAsset(data);
    const eventKind = inferEventKind(data, resolved);
    const requestedCount = safeCount(data.count, 1);
    const burst = Boolean(data.burst || eventKind === 'burst' || eventKind === 'superfan');
    const burstMultiplier = burst ? Math.max(1, Number(state.config.superfan_burst_intensity) || 1) : 1;
    const count = safeCount(Math.floor(requestedCount * burstMultiplier), requestedCount);

    enqueueSpawn({
      asset: resolved.asset,
      fallbackAsset: resolved.fallback,
      count,
      intensity: Math.max(0.1, Number(data.intensity) || 1),
      burst,
      burstDurationMs: Number(state.config.superfan_burst_duration) || 2000,
      kind: eventKind,
      eventKind,
      reason: data.reason || 'manual',
      source: data.source || 'manual',
      username: data.username || data.uniqueId || null,
      profilePictureUrl: getProfilePictureUrl(data),
      x: data.x,
      y: data.y,
      size: data.size,
      minSize: Number(state.config.emoji_min_size_px) || 38,
      maxSize: Number(state.config.emoji_max_size_px) || 80,
      lifetimeMs: Number(data.lifetimeMs) || Number(state.config.emoji_lifetime_ms) || 7600,
      color: data.color || null,
      glow: state.config.enable_glow !== false,
      impactParticles: state.config.enable_particles !== false,
      depth: state.config.enable_depth !== false
    });
  }

  function spawnHearts(data = {}) {
    if (!allowed.hearts || !state.enabled || state.config.heart_balloons_enabled === false) return;
    const maxHearts = Math.max(1, Number(state.config.heart_balloon_max_hearts) || 24);
    const count = Math.min(safeCount(data.count, 1), maxHearts);
    const profileEvery = Math.max(1, Number(data.profileEvery || state.config.heart_balloon_profile_every) || 5);
    const profilePictureUrl = getProfilePictureUrl(data);
    const popY = clamp(finiteNumber(data.popY, finiteNumber(state.config.heart_balloon_pop_y, 0.5)), 0.25, 0.75);
    const windStrength = clamp(finiteNumber(data.windStrength, finiteNumber(state.config.heart_balloon_wind_strength, 0.45)), 0, 1);

    for (let index = 0; index < count; index++) {
      const useProfile = Boolean(profilePictureUrl) && (index + 1) % profileEvery === 0;
      enqueueSpawn({
        asset: useProfile ? profilePictureAsset(profilePictureUrl) : '♥',
        fallbackAsset: useProfile ? '👤' : '♥',
        count: 1,
        kind: useProfile ? 'profile' : 'balloon',
        eventKind: 'balloon',
        balloon: true,
        profilePicture: useProfile,
        username: data.username || data.uniqueId || null,
        x: spreadCoordinate(data.x, index, count),
        y: Number.isFinite(Number(data.y)) ? Number(data.y) : 1,
        size: Number(data.size) || (useProfile ? 82 : 58 + Math.random() * 26),
        minSize: Number(state.config.emoji_min_size_px) || 38,
        maxSize: Number(state.config.emoji_max_size_px) || 80,
        color: data.heartColor || '#ff4d8d',
        heartColor: data.heartColor || '#ff4d8d',
        popY,
        windStrength,
        lifetimeMs: Math.max(9000, Number(data.lifetimeMs) || Number(state.config.emoji_lifetime_ms) || 7600),
        glow: state.config.enable_glow !== false,
        impactParticles: state.config.enable_particles !== false,
        depth: state.config.enable_depth !== false
      });
    }
  }

  function spawnGifts(data = {}) {
    if (!allowed.gifts || !state.enabled) return;
    const count = safeCount(data.count, 1);
    const baseX = Number.isFinite(Number(data.x)) ? Number(data.x) : Math.random();

    for (let index = 0; index < count; index++) {
      enqueueSpawn({
        asset: remoteAsset(data.giftImageUrl || data.giftPictureUrl || data.imageUrl || '🎁'),
        fallbackAsset: '🎁',
        count: 1,
        kind: 'gift',
        eventKind: 'gift',
        reason: data.reason || 'gift',
        source: data.source || 'event:gift',
        username: data.username || data.uniqueId || null,
        giftName: data.giftName || 'Gift',
        giftImageUrl: data.giftImageUrl || data.giftPictureUrl || data.imageUrl || null,
        price: Number(data.price) || 0,
        totalPrice: Number(data.totalPrice) || Number(data.price) || 0,
        seriesCount: Number(data.seriesCount) || 1,
        x: spreadCoordinate(baseX, index, count),
        y: Number.isFinite(Number(data.y)) ? Number(data.y) : 0,
        size: Number(data.sizePx || data.size) || undefined,
        minSize: Number(state.config.gift_ball_min_size_px) || 44,
        maxSize: Number(state.config.gift_ball_max_size_px) || 128,
        lifetimeMs: Number(data.despawnMs || data.lifetimeMs) || Number(state.config.gift_ball_min_despawn_ms) || 9000,
        intensity: Math.max(1, Math.log10((Number(data.totalPrice || data.price) || 0) + 10) * 0.8),
        glow: state.config.enable_glow !== false,
        impactParticles: state.config.enable_particles !== false,
        depth: state.config.enable_depth !== false
      });
    }
  }

  function applyEnabledState(enabled = state.config.enabled !== false) {
    state.config.enabled = enabled !== false;
    state.enabled = state.config.enabled !== false && (!state.isObsHud || state.config.obs_hud_enabled !== false);
    if (!state.enabled) clearPendingQueues();
    state.renderer?.setPaused?.(state.paused || !state.enabled);
  }

  function setPaused(paused) {
    state.paused = Boolean(paused);
    state.overlay.paused = state.paused;
    state.renderer?.setPaused?.(state.paused || !state.enabled);
    if (!state.paused) flushPausedQueue();
  }

  function setSpeed(speed) {
    const normalized = clamp(Number(speed) || 1, 0.1, 5);
    state.overlay.speed = normalized;
    state.config.speed = normalized;
    state.renderer?.setSpeed?.(normalized);
  }

  function setTheme(theme) {
    const normalized = String(theme || 'default').trim() || 'default';
    state.overlay.theme = normalized;
    document.body.dataset.theme = normalized;
    state.renderer?.setTheme?.(normalized);
  }

  function setBoundingBox(box = {}) {
    const normalized = {
      x: clamp(finiteNumber(box.x, 0), 0, 0.99),
      y: clamp(finiteNumber(box.y, 0), 0, 0.99),
      width: clamp(finiteNumber(box.width, 1), 0.01, 1),
      height: clamp(finiteNumber(box.height, 1), 0.01, 1)
    };
    normalized.width = Math.min(normalized.width, 1 - normalized.x);
    normalized.height = Math.min(normalized.height, 1 - normalized.y);
    state.overlay.boundingBox = normalized;
    state.renderer?.setBoundingBox?.(normalized);
  }

  function clearOverlay() {
    clearPendingQueues();
    state.renderer?.clear?.();
  }

  function applyOverlayState() {
    state.overlay.opacity = clamp(finiteNumber(state.overlay.opacity, 1), 0, 1);
    document.body.style.opacity = String(state.overlay.opacity);
    setSpeed(state.overlay.speed);
    setTheme(state.overlay.theme);
    setBoundingBox(state.overlay.boundingBox);
    if (state.paused || !state.enabled) state.renderer?.setPaused?.(true);
  }

  function handleRendererState(status = {}) {
    updateStatus(status);
    if (status.state === 'ready') {
      state.rendererReady = true;
      flushPendingDropped();
      applyOverlayState();
      flushInitQueue();
    } else if (['initializing', 'unsupported', 'device-lost'].includes(status.state)) {
      state.rendererReady = false;
    }
  }

  function connectSocket() {
    if (state.socket) return;
    state.socket = io();
    state.socket.on('webgpu-emoji-rain:spawn', spawnEmoji);
    state.socket.on('webgpu-emoji-rain:heart-balloons', spawnHearts);
    state.socket.on('webgpu-emoji-rain:gift-balls', spawnGifts);
    state.socket.on('webgpu-emoji-rain:clear', clearOverlay);
    state.socket.on('webgpu-emoji-rain:pause', () => setPaused(true));
    state.socket.on('webgpu-emoji-rain:resume', () => setPaused(false));
    state.socket.on('webgpu-emoji-rain:toggle', payload => applyEnabledState(payload?.enabled !== false));
    state.socket.on('webgpu-emoji-rain:opacity', payload => {
      state.overlay.opacity = clamp(finiteNumber(payload?.opacity, state.overlay.opacity), 0, 1);
      document.body.style.opacity = String(state.overlay.opacity);
    });
    state.socket.on('webgpu-emoji-rain:speed', payload => setSpeed(payload?.speed));
    state.socket.on('webgpu-emoji-rain:theme', payload => setTheme(payload?.theme));
    state.socket.on('webgpu-emoji-rain:bounding-box', payload => setBoundingBox(payload?.boundingBox || payload));
    state.socket.on('webgpu-emoji-rain:config-update', payload => {
      state.config = { ...state.config, ...(payload?.config || {}) };
      refreshRateConfiguration();
      state.renderer?.configure?.(state.config);
      applyEnabledState(payload?.enabled ?? state.config.enabled ?? true);
      applyOverlayState();
    });
    state.socket.on('webgpu-emoji-rain:user-mappings-update', payload => {
      state.userMappings = payload?.mappings && typeof payload.mappings === 'object' ? payload.mappings : {};
    });
  }

  async function init() {
    const [configPayload, mappingsPayload, overlayPayload] = await Promise.all([
      loadPayload('/api/webgpu-emoji-rain/config', { config: {} }),
      loadPayload('/api/webgpu-emoji-rain/user-mappings', { mappings: {} }),
      loadPayload('/api/webgpu-emoji-rain/overlay/state', { state: {} })
    ]);

    state.config = configPayload?.config && typeof configPayload.config === 'object' ? configPayload.config : {};
    state.userMappings = mappingsPayload?.mappings && typeof mappingsPayload.mappings === 'object' ? mappingsPayload.mappings : {};
    state.overlay = {
      ...state.overlay,
      ...(overlayPayload?.state && typeof overlayPayload.state === 'object' ? overlayPayload.state : {})
    };
    state.paused = state.overlay.paused === true;
    refreshRateConfiguration();
    applyEnabledState(state.config.enabled !== false);
    connectSocket();

    if (typeof globalThis.setInterval === 'function') {
      state.rateTimer = globalThis.setInterval(drainRateQueue, RATE_TICK_MS);
      state.rateTimer?.unref?.();
    }
    const canvas = document.getElementById('emoji-rain-canvas');
    state.renderer = new WebGPUEmojiEngine(canvas, {
      config: state.config,
      onState: handleRendererState,
      onMetrics: metrics => {
        if (!state.rendererReady && metrics?.state === 'ready') handleRendererState(metrics);
        else updateStatus(metrics);
        const now = performance.now();
        if (state.socket?.connected && now - state.lastMetricsSentAt > 1000) {
          state.lastMetricsSentAt = now;
          state.socket.emit('webgpu-emoji-rain:renderer-metrics', {
            ...metrics,
            layer: detectOverlayLayer(),
            queuedParticles: state.initQueuedParticles + state.pausedQueuedParticles + state.rateQueuedParticles
          });
        }
      }
    });

    applyOverlayState();
    const ready = await state.renderer.init();
    if (!ready) {
      document.getElementById('webgpu-fallback-hint')?.classList.add?.('visible');
    } else if (!state.rendererReady) {
      handleRendererState({ state: 'ready' });
    }
  }

  window.addEventListener('beforeunload', () => {
    if (state.rateTimer && typeof globalThis.clearInterval === 'function') globalThis.clearInterval(state.rateTimer);
    clearPendingQueues();
    state.renderer?.destroy?.();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else void init();
})();
