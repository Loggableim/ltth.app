/**
 * ClarityHUD - Stream Overlay
 *
 * Stream-side (viewer-facing) OBS overlay.
 * Displays TikTok LIVE events as animated AlertCards and HighlightCards
 * positioned in configurable screen slots.
 */

// ==================== CONSTANTS ====================

/** Maximum characters shown for chat messages in AlertCards */
const MAX_CHAT_MESSAGE_LENGTH = 80;

/** Fallback timeout (ms) to clean up a card if animationend never fires */
const ANIM_FALLBACK_MS = 600;

/** Init retry configuration */
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const EVENT_CONFIG = {
  chat:     { icon: '💬', label: 'Chat',       cssType: 'chat',     isHighlight: false, defaultSlot: 'slot-bottom-right', ttl: 8000  },
  follow:   { icon: '❤️',  label: 'Followed',   cssType: 'follow',   isHighlight: false, defaultSlot: 'slot-bottom-right', ttl: 7000  },
  share:    { icon: '🔄', label: 'Shared',     cssType: 'share',    isHighlight: false, defaultSlot: 'slot-bottom-right', ttl: 7000  },
  like:     { icon: '👍', label: 'Liked',      cssType: 'like',     isHighlight: false, defaultSlot: 'slot-bottom-right', ttl: 5000  },
  gift:     { icon: '🎁', label: 'Gift',       cssType: 'gift',     isHighlight: true,  defaultSlot: 'slot-top-center',   ttl: 9000  },
  sub:      { icon: '⭐', label: 'Subscribed', cssType: 'sub',      isHighlight: true,  defaultSlot: 'slot-top-center',   ttl: 10000 },
  treasure: { icon: '💎', label: 'Treasure',   cssType: 'treasure', isHighlight: true,  defaultSlot: 'slot-top-center',   ttl: 10000 },
  join:     { icon: '👋', label: 'Joined',     cssType: 'join',     isHighlight: false, defaultSlot: 'slot-bottom-right', ttl: 4000  },
};

// ==================== STATE ====================

const STATE = {
  settings: {},
  socket: null,
  emojiParser: null,
  messageParser: null,
  activeCards: new Map(),   // cardId → { element, slotId, timerId }
  _cardCounter: 0,
  _initialized: false,
  // Ticker state
  _tickerItems: [],
  _tickerAnimId: null,
};

// ==================== DEFAULTS ====================

function getDefaultSettings() {
  return {
    orientation: 'landscape',
    showChat: false,
    showFollows: true,
    showShares: true,
    showLikes: false,
    showGifts: true,
    showSubs: true,
    showTreasureChests: true,
    showJoins: false,
    slotChat: 'slot-right-rail',
    slotFollow: 'slot-bottom-right',
    slotShare: 'slot-bottom-right',
    slotLike: 'slot-bottom-right',
    slotGift: 'slot-top-center',
    slotSub: 'slot-top-center',
    slotTreasure: 'slot-top-center',
    slotJoin: 'slot-bottom-right',
    highlightGiftThreshold: 100,
    highlightAlwaysSub: true,
    highlightAlwaysTreasure: true,
    ttlChat: 8000,
    ttlFollow: 7000,
    ttlShare: 7000,
    ttlLike: 5000,
    ttlGift: 9000,
    ttlSub: 10000,
    ttlTreasure: 10000,
    ttlJoin: 4000,
    animIn: 'auto',
    animOut: 'auto',
    reduceMotion: false,
    opacity: 1,
    dyslexiaFont: false,
    tickerEnabled: false,
    tickerSpeed: 60,
    tickerLabel: '🔴 LIVE',
  };
}

// ==================== SETTINGS ====================

function applySettings(settings) {
  document.body.classList.toggle('portrait', settings.orientation === 'portrait');
  document.body.classList.toggle('reduce-motion', !!settings.reduceMotion);
  document.body.classList.toggle('dyslexia-font', !!settings.dyslexiaFont);
  document.documentElement.style.setProperty('--overlay-opacity', settings.opacity != null ? settings.opacity : 1);

  // Ticker
  applyTickerSettings(settings);
}

async function loadSettings() {
  try {
    const response = await fetch('/api/clarityhud/settings/stream');
    const data = await response.json();
    if (data.success && data.settings) {
      STATE.settings = { ...getDefaultSettings(), ...data.settings };
    } else {
      STATE.settings = getDefaultSettings();
    }
    applySettings(STATE.settings);
  } catch (error) {
    console.error('[CLARITY STREAM] Error loading settings:', error);
    STATE.settings = getDefaultSettings();
    applySettings(STATE.settings);
  }
}

// ==================== SOCKET ====================

function connectSocket() {
  const socket = io();
  STATE.socket = socket;

  socket.on('connect', () => {
    console.log('[CLARITY STREAM] Connected to server');
  });

  socket.on('disconnect', () => {
    console.log('[CLARITY STREAM] Disconnected from server');
  });

  socket.on('clarityhud.settings.stream', (newSettings) => {
    console.log('[CLARITY STREAM] Settings update received');
    STATE.settings = { ...getDefaultSettings(), ...newSettings };
    applySettings(STATE.settings);
  });

  socket.on('clarityhud.update.chat', (data) => {
    if (STATE.settings.showChat) {
      handleEvent('chat', data);
    }
  });

  socket.on('clarityhud.update.follow', (data) => {
    if (STATE.settings.showFollows) {
      handleEvent('follow', data);
    }
  });

  socket.on('clarityhud.update.share', (data) => {
    if (STATE.settings.showShares) {
      handleEvent('share', data);
    }
  });

  socket.on('clarityhud.update.like', (data) => {
    if (STATE.settings.showLikes) {
      handleEvent('like', data);
    }
  });

  socket.on('clarityhud.update.gift', (data) => {
    if (STATE.settings.showGifts) {
      handleEvent('gift', data);
    }
  });

  socket.on('clarityhud.update.subscribe', (data) => {
    if (STATE.settings.showSubs) {
      handleEvent('sub', data);
    }
  });

  socket.on('clarityhud.update.treasure', (data) => {
    if (STATE.settings.showTreasureChests) {
      handleEvent('treasure', data);
    }
  });

  socket.on('clarityhud.update.join', (data) => {
    if (STATE.settings.showJoins) {
      handleEvent('join', data);
    }
  });
}

// ==================== EVENT HANDLING ====================

function handleEvent(type, data) {
  const cfg = EVENT_CONFIG[type];
  if (!cfg) return;

  // Determine if this should be a HighlightCard
  let isHighlight = false;
  if (type === 'sub' && STATE.settings.highlightAlwaysSub) {
    isHighlight = true;
  } else if (type === 'treasure' && STATE.settings.highlightAlwaysTreasure) {
    isHighlight = true;
  } else if (type === 'gift') {
    const coins = data.gift?.coins || data.coins || 0;
    isHighlight = coins >= (STATE.settings.highlightGiftThreshold || 100);
  }

  // Determine slot
  const slotKey = 'slot' + capitalize(type);
  const slotId = STATE.settings[slotKey] || cfg.defaultSlot;

  // Determine TTL
  const ttlKey = 'ttl' + capitalize(type);
  const ttl = STATE.settings[ttlKey] || cfg.ttl;

  if (isHighlight) {
    showHighlightCard(type, data, slotId, ttl);
  } else {
    showAlertCard(type, data, slotId, ttl);
  }

  // Feed ticker
  addTickerItem(type, data);
}

// ==================== ALERT CARD ====================

function showAlertCard(type, data, slotId, ttl) {
  const cfg = EVENT_CONFIG[type];
  if (!cfg) return;

  const cardId = ++STATE._cardCounter;

  const card = document.createElement('div');
  card.className = `alert-card type-${cfg.cssType}`;
  card.dataset.cardId = cardId;

  // Gift image (prepend before icon if available)
  const giftImageUrl = data.gift?.image || data.giftPictureUrl || null;
  if (type === 'gift' && giftImageUrl) {
    const img = document.createElement('img');
    img.className = 'alert-gift-img';
    img.src = giftImageUrl;
    img.alt = data.gift?.name || 'Gift';
    card.appendChild(img);
  } else {
    const iconEl = document.createElement('span');
    iconEl.className = 'alert-icon';
    iconEl.textContent = cfg.icon;
    card.appendChild(iconEl);
  }

  // Content
  const content = document.createElement('div');
  content.className = 'alert-content';

  const username = document.createElement('div');
  username.className = 'alert-username';
  username.textContent = data.user?.nickname || data.nickname || data.username || 'Anonymous';
  content.appendChild(username);

  const action = document.createElement('div');
  action.className = 'alert-action';
  action.textContent = cfg.label;
  content.appendChild(action);

  if (type === 'chat') {
    const msgText = data.message || data.comment || '';
    if (msgText) {
      const detail = document.createElement('div');
      detail.className = 'alert-detail';
      detail.textContent = msgText.length > MAX_CHAT_MESSAGE_LENGTH ? msgText.slice(0, MAX_CHAT_MESSAGE_LENGTH) + '…' : msgText;
      content.appendChild(detail);
    }
  }

  card.appendChild(content);

  // Coins badge for gift type
  if (type === 'gift') {
    const coins = data.gift?.coins || data.coins || 0;
    if (coins > 0) {
      const badge = document.createElement('span');
      badge.className = 'alert-coins';
      badge.textContent = `🪙 ${coins}`;
      content.appendChild(badge);
    }
  }

  // Append to slot
  const slotEl = document.getElementById(slotId);
  if (!slotEl) {
    console.warn(`[CLARITY STREAM] Slot not found: ${slotId}`);
    return;
  }
  slotEl.appendChild(card);

  animateCardIn(card, slotId, false);

  // Schedule removal
  const timerId = setTimeout(() => {
    removeCard(cardId);
  }, ttl);

  STATE.activeCards.set(cardId, { element: card, slotId, timerId });
}

// ==================== HIGHLIGHT CARD ====================

function showHighlightCard(type, data, slotId, ttl) {
  const cfg = EVENT_CONFIG[type];
  if (!cfg) return;

  const cardId = ++STATE._cardCounter;

  const card = document.createElement('div');
  card.className = `highlight-card type-${cfg.cssType}`;
  card.dataset.cardId = cardId;

  // Gift image or icon
  const giftImageUrl = data.gift?.image || data.giftPictureUrl || null;
  if (type === 'gift' && giftImageUrl) {
    const img = document.createElement('img');
    img.className = 'highlight-gift-img';
    img.src = giftImageUrl;
    img.alt = data.gift?.name || 'Gift';
    card.appendChild(img);
  } else {
    const iconEl = document.createElement('span');
    iconEl.className = 'highlight-icon';
    iconEl.textContent = cfg.icon;
    card.appendChild(iconEl);
  }

  // Username
  const usernameEl = document.createElement('div');
  usernameEl.className = 'highlight-username';
  usernameEl.textContent = data.user?.nickname || data.nickname || data.username || 'Anonymous';
  card.appendChild(usernameEl);

  // Action label with optional count
  const actionEl = document.createElement('div');
  actionEl.className = 'highlight-action';
  const giftName = data.gift?.name || data.giftName || null;
  const giftCount = data.gift?.count || data.repeatCount || null;
  if (giftName && giftCount && giftCount > 1) {
    actionEl.textContent = `sent ${giftName} x${giftCount}`;
  } else if (giftName) {
    actionEl.textContent = `sent ${giftName}`;
  } else {
    actionEl.textContent = cfg.label;
  }
  card.appendChild(actionEl);

  // Coins badge
  const coins = data.gift?.coins || data.coins || 0;
  if (coins > 0) {
    const badge = document.createElement('span');
    badge.className = 'alert-coins';
    badge.textContent = `🪙 ${coins}`;
    card.appendChild(badge);
  }

  // Append to slot
  const slotEl = document.getElementById(slotId);
  if (!slotEl) {
    console.warn(`[CLARITY STREAM] Slot not found: ${slotId}`);
    return;
  }
  slotEl.appendChild(card);

  animateCardIn(card, slotId, true);

  // Play enhanced highlight effects (particles, confetti, flash, etc.)
  if (typeof StreamAnimations !== 'undefined') {
    // Delay effects slightly so the card entry animation is visible first
    setTimeout(() => {
      StreamAnimations.playHighlightEffects(card, type, data);
    }, 200);
  }

  // Schedule removal
  const timerId = setTimeout(() => {
    removeCard(cardId);
  }, ttl);

  STATE.activeCards.set(cardId, { element: card, slotId, timerId });
}

// ==================== ANIMATION ====================

/**
 * Determine animation class name for a given slot based on settings.
 * @param {string} slotId
 * @param {string} setting - value of animIn or animOut
 * @param {boolean} isIn - true for in, false for out
 */
function resolveAnimClass(slotId, setting, isIn) {
  if (setting === 'auto') {
    if (slotId.includes('left') && !slotId.includes('rail')) {
      return isIn ? 'anim-slide-in-left' : 'anim-slide-out-left';
    }
    if (slotId.includes('right') && !slotId.includes('rail')) {
      return isIn ? 'anim-slide-in-right' : 'anim-slide-out-right';
    }
    if (slotId.includes('center')) {
      return isIn ? 'anim-pop-in' : 'anim-pop-out';
    }
    // rail slots
    return isIn ? 'anim-fade-in' : 'anim-fade-out';
  }

  const map = {
    'fade':        isIn ? 'anim-fade-in'        : 'anim-fade-out',
    'slide-left':  isIn ? 'anim-slide-in-left'  : 'anim-slide-out-left',
    'slide-right': isIn ? 'anim-slide-in-right' : 'anim-slide-out-right',
    'slide-up':    isIn ? 'anim-slide-in-up'    : 'anim-slide-out-down',
    'pop':         isIn ? 'anim-pop-in'         : 'anim-pop-out',
    'bounce':      isIn ? 'anim-bounce-in'      : 'anim-bounce-out',
  };

  return map[setting] || (isIn ? 'anim-fade-in' : 'anim-fade-out');
}

function animateCardIn(element, slotId, isHighlight) {
  if (document.body.classList.contains('reduce-motion')) {
    element.style.opacity = '1';
    return;
  }

  const animClass = resolveAnimClass(slotId, STATE.settings.animIn || 'auto', true);
  element.classList.add(animClass);

  if (isHighlight) {
    element.addEventListener('animationend', () => {
      element.classList.remove(animClass);
      element.classList.add('glow-pulse');
    }, { once: true });
  }
}

function animateCardOut(element, slotId, onDone) {
  if (document.body.classList.contains('reduce-motion')) {
    element.style.opacity = '0';
    if (onDone) onDone();
    return;
  }

  const animClass = resolveAnimClass(slotId, STATE.settings.animOut || 'auto', false);

  // Remove glow-pulse if present
  element.classList.remove('glow-pulse');
  element.classList.add(animClass);

  // Fallback timeout in case animationend never fires (e.g. display:none)
  const fallback = setTimeout(() => {
    if (onDone) onDone();
  }, ANIM_FALLBACK_MS);

  element.addEventListener('animationend', () => {
    clearTimeout(fallback);
    if (onDone) onDone();
  }, { once: true });
}

// ==================== CARD REMOVAL ====================

function removeCard(cardId) {
  const entry = STATE.activeCards.get(cardId);
  if (!entry) return;

  const { element, slotId, timerId } = entry;
  clearTimeout(timerId);

  animateCardOut(element, slotId, () => {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
    STATE.activeCards.delete(cardId);
  });
}

// ==================== URL PARAM OVERRIDES ====================

function resolveUrlParams() {
  const params = new URLSearchParams(window.location.search);

  const orientation = params.get('orientation');
  if (orientation === 'portrait' || orientation === 'landscape') {
    STATE.settings.orientation = orientation;
  }

  const opacity = parseFloat(params.get('opacity'));
  if (!isNaN(opacity) && opacity >= 0 && opacity <= 1) {
    STATE.settings.opacity = opacity;
  }

  const animIn = params.get('animIn');
  if (animIn) STATE.settings.animIn = animIn;

  const animOut = params.get('animOut');
  if (animOut) STATE.settings.animOut = animOut;

  // Slot overrides: ?slot-gift=slot-top-center etc.
  for (const type of Object.keys(EVENT_CONFIG)) {
    const slotParam = params.get(`slot-${type}`);
    if (slotParam) {
      STATE.settings['slot' + capitalize(type)] = slotParam;
    }
  }

  // Ticker override: ?ticker=true / ?ticker=false
  const ticker = params.get('ticker');
  if (ticker === 'true') STATE.settings.tickerEnabled = true;
  if (ticker === 'false') STATE.settings.tickerEnabled = false;
}

// ==================== TICKER ====================

/** Maximum number of ticker items kept in memory */
const TICKER_MAX_ITEMS = 40;

/**
 * Apply ticker-related settings (show/hide bar, label, speed).
 */
function applyTickerSettings(settings) {
  const bar = document.getElementById('ticker-bar');
  if (!bar) return;

  if (settings.tickerEnabled) {
    bar.classList.add('active');
    document.body.classList.add('ticker-active');
  } else {
    bar.classList.remove('active');
    document.body.classList.remove('ticker-active');
  }

  const labelEl = document.getElementById('ticker-label');
  if (labelEl && settings.tickerLabel) {
    labelEl.textContent = settings.tickerLabel;
  }

  // Restart scroll animation with updated speed
  restartTickerScroll();
}

/**
 * Add a new item to the ticker from an event.
 */
function addTickerItem(type, data) {
  if (!STATE.settings.tickerEnabled) return;

  const cfg = EVENT_CONFIG[type];
  if (!cfg) return;

  const username = data.user?.nickname || data.nickname || data.username || 'Anonymous';
  let text = cfg.label;

  if (type === 'gift') {
    const giftName = data.gift?.name || data.giftName || '';
    const coins = data.gift?.coins || data.coins || 0;
    if (giftName) {
      text = `${giftName}` + (coins > 0 ? ` (${coins} 🪙)` : '');
    }
  } else if (type === 'chat') {
    const msg = data.message || data.comment || '';
    if (msg) {
      text = msg.length > 40 ? msg.slice(0, 40) + '…' : msg;
    }
  }

  STATE._tickerItems.push({ icon: cfg.icon, username, text });
  if (STATE._tickerItems.length > TICKER_MAX_ITEMS) {
    STATE._tickerItems.shift();
  }

  renderTicker();
}

/**
 * Render all ticker items into the ticker-inner element and
 * duplicate them for seamless looping.
 */
function renderTicker() {
  const inner = document.getElementById('ticker-inner');
  if (!inner) return;

  // Build item HTML
  const itemsHTML = STATE._tickerItems.map(function (item) {
    return '<span class="ticker-item">' +
      '<span class="ticker-icon">' + escapeHTML(item.icon) + '</span>' +
      '<span class="ticker-name">' + escapeHTML(item.username) + '</span>' +
      ' ' + escapeHTML(item.text) +
      '</span><span class="ticker-sep"></span>';
  }).join('');

  // Duplicate for seamless loop
  inner.innerHTML = itemsHTML + itemsHTML;

  restartTickerScroll();
}

/**
 * (Re)start the CSS scroll animation based on content width and speed.
 */
function restartTickerScroll() {
  const inner = document.getElementById('ticker-inner');
  if (!inner) return;

  // Reset animation
  inner.style.animation = 'none';

  if (STATE._tickerItems.length === 0) return;
  if (document.body.classList.contains('reduce-motion')) return;

  // Half-width = one copy of items (we duplicate, so scrolling 50% loops)
  const halfWidth = inner.scrollWidth / 2;
  if (halfWidth <= 0) return;

  const speed = STATE.settings.tickerSpeed || 60; // px per second
  const duration = halfWidth / speed;

  // Force reflow before restarting animation
  void inner.offsetWidth;
  inner.style.animation = `tickerScroll ${duration}s linear infinite`;
}

/**
 * Escape basic HTML special characters.
 */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==================== UTILITIES ====================

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ==================== INIT ====================

async function _initOnce() {
  console.log('[CLARITY STREAM] Initializing stream overlay...');

  // Inject StreamAnimations CSS
  if (typeof StreamAnimations !== 'undefined') {
    StreamAnimations.injectStyles();
  }

  // Initialize parsers if available
  if (typeof EmojiParser !== 'undefined') {
    STATE.emojiParser = new EmojiParser();
  }
  if (typeof MessageParser !== 'undefined') {
    STATE.messageParser = new MessageParser();
  }

  await loadSettings();
  resolveUrlParams();
  applySettings(STATE.settings);
  connectSocket();

  STATE._initialized = true;
  console.log('[CLARITY STREAM] Stream overlay initialized successfully');
}

async function init() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await _initOnce();
      return;
    } catch (error) {
      console.error(`[CLARITY STREAM] Init attempt ${attempt}/${MAX_RETRIES} failed:`, error);

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  console.error('[CLARITY STREAM] Failed to initialize after ' + MAX_RETRIES + ' attempts.');
}

// ==================== ENTRY POINT ====================
document.addEventListener('DOMContentLoaded', () => {
  init();
});
