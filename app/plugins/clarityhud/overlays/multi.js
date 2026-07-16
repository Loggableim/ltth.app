/**
 * ClarityHUD - Multi-Stream Overlay
 * 
 * Displays up to 3 additional TikTok livestream chats alongside the primary stream
 * Optimized for compact VRChat usage with customizable layouts and styles
 */

function createClarityHUDLogger(scope) {
  const params = new URLSearchParams(window.location.search);
  const debugEnabled = params.get('debug') === '1' ||
    params.get('debug') === 'true' ||
    localStorage.getItem('clarityhud.debug') === '1';
  const prefix = `[${scope}]`;

  return {
    debug: (...args) => { if (debugEnabled) console.debug(prefix, ...args); },
    warn: (...args) => { if (debugEnabled) console.warn(prefix, ...args); },
    error: (...args) => console.error(prefix, ...args)
  };
}

const HUD_LOG = createClarityHUDLogger('MULTI HUD');

// ==================== STATE MANAGEMENT ====================
const STATE = {
  settings: {
    enabled: false,
    streams: [],
    layout: 'mixed',
    columns: 'auto',
    primarySpan2: false,
    messageStyle: 'stripe',
    density: 'compact',
    showAvatars: false,
    showTimestamps: false,
    highlightPrimary: true,
    primaryOpacity: 1.2,
    maxMessages: 300,
    autoContrast: true,
    pulseOnNew: false
  },
  messages: [],
  socket: null,
  emojiParser: null,
  badgeRenderer: null,
  messageParser: null,
  virtualScroller: null,
  messagesContainer: null,
  multiContainer: null,
  eventCount: 0,
  activeStreams: 0
};

// ==================== DEBUG HELPERS ====================
function updateDebugStatus(status) {
  const debugStatus = document.getElementById('debug-status');
  if (debugStatus) {
    debugStatus.textContent = ClarityHUDI18n.text('debug.status', 'Status: {status}', { status });
  }
  HUD_LOG.debug(`[MULTI HUD] Status: ${status}`);
}

function updateDebugSocket(status) {
  const debugSocket = document.getElementById('debug-socket');
  if (debugSocket) {
    debugSocket.textContent = ClarityHUDI18n.text('debug.socket', 'Socket: {status}', { status });
  }
}

function updateDebugEvents() {
  STATE.eventCount++;
  const debugEvents = document.getElementById('debug-events');
  if (debugEvents) {
    debugEvents.textContent = ClarityHUDI18n.text('debug.events', 'Events: {count}', { count: STATE.eventCount });
  }
}

function updateDebugStreams(count) {
  const debugStreams = document.getElementById('debug-streams');
  if (debugStreams) {
    debugStreams.textContent = ClarityHUDI18n.text('debug.streams', 'Streams: {count}', { count });
  }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  HUD_LOG.debug('[MULTI HUD] 🚀 DOMContentLoaded - Starting initialization...');
  updateDebugStatus('DOM Ready');
  
  // Get DOM elements
  STATE.messagesContainer = document.getElementById('messages');
  STATE.multiContainer = document.getElementById('multi-container');
  
  if (!STATE.messagesContainer || !STATE.multiContainer) {
    HUD_LOG.error('[MULTI HUD] ❌ CRITICAL ERROR: Required containers not found in DOM!');
    updateDebugStatus('ERROR: Containers not found!');
    return;
  }
  
  HUD_LOG.debug('[MULTI HUD] ✅ DOM elements found');
  
  // Initialize systems
  initializeSystems();
  
  // Connect to socket
  connectSocket();
  
  // Detect system preference for reduced motion
  detectSystemPreferences();
});

// ==================== SYSTEM INITIALIZATION ====================
function initializeSystems() {
  HUD_LOG.debug('[MULTI HUD] Initializing subsystems...');
  
  try {
    // Initialize emoji parser (if available)
    if (typeof EmojiParser !== 'undefined') {
      STATE.emojiParser = new EmojiParser();
      HUD_LOG.debug('[MULTI HUD] ✅ EmojiParser initialized');
    }
    
    // Initialize badge renderer (if available)
    if (typeof BadgeRenderer !== 'undefined') {
      STATE.badgeRenderer = new BadgeRenderer();
      HUD_LOG.debug('[MULTI HUD] ✅ BadgeRenderer initialized');
    }
    
    // Initialize message parser (if available)
    if (typeof MessageParser !== 'undefined') {
      STATE.messageParser = new MessageParser(STATE.emojiParser, STATE.badgeRenderer);
      HUD_LOG.debug('[MULTI HUD] ✅ MessageParser initialized');
    }
    
    updateDebugStatus('Systems initialized');
  } catch (error) {
    HUD_LOG.error('[MULTI HUD] ❌ Error initializing systems:', error);
    updateDebugStatus(`Init error: ${error.message}`);
  }
}

// ==================== SOCKET CONNECTION ====================
function connectSocket() {
  HUD_LOG.debug('[MULTI HUD] 📡 Connecting to Socket.io...');
  updateDebugSocket('Connecting...');
  
  try {
    STATE.socket = io();
    
    STATE.socket.on('connect', () => {
      HUD_LOG.debug('[MULTI HUD] ✅ Socket connected');
      updateDebugSocket('Connected');
      loadSettings();
    });
    
    STATE.socket.on('disconnect', () => {
      HUD_LOG.debug('[MULTI HUD] ⚠️ Socket disconnected');
      updateDebugSocket('Disconnected');
    });
    
    STATE.socket.on('reconnect', () => {
      HUD_LOG.debug('[MULTI HUD] 🔄 Socket reconnected');
      updateDebugSocket('Reconnected');
      loadSettings();
    });
    
    // Listen for multi-stream chat events
    STATE.socket.on('clarityhud:multi:chat', (event) => {
      HUD_LOG.debug('[MULTI HUD] 📨 Multi-stream chat event received:', event);
      handleChatEvent(event);
      updateDebugEvents();
    });
    
    // Listen for multi-stream gift events
    STATE.socket.on('clarityhud:multi:gift', (event) => {
      HUD_LOG.debug('[MULTI HUD] 🎁 Multi-stream gift event received:', event);
      handleGiftEvent(event);
      updateDebugEvents();
    });
    
    // Listen for settings updates
    STATE.socket.on('clarityhud.settings.multi', (settings) => {
      HUD_LOG.debug('[MULTI HUD] ⚙️ Settings update received');
      applySettings(settings);
    });
    
  } catch (error) {
    HUD_LOG.error('[MULTI HUD] ❌ Error connecting socket:', error);
    updateDebugSocket(`Error: ${error.message}`);
  }
}

// ==================== SETTINGS MANAGEMENT ====================
async function loadSettings() {
  try {
    HUD_LOG.debug('[MULTI HUD] 📥 Loading settings from API...');
    const response = await fetch('/api/clarityhud/settings/multi');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.settings) {
      HUD_LOG.debug('[MULTI HUD] ✅ Settings loaded:', data.settings);
      applySettings(data.settings);
    } else {
      HUD_LOG.warn('[MULTI HUD] ⚠️ Invalid settings response:', data);
      updateDebugStatus('Invalid settings');
    }
  } catch (error) {
    HUD_LOG.error('[MULTI HUD] ❌ Error loading settings:', error);
    updateDebugStatus(`Settings error: ${error.message}`);
  }
}

function applySettings(settings) {
  HUD_LOG.debug('[MULTI HUD] 🎨 Applying settings...');
  
  // Merge with current settings
  STATE.settings = { ...STATE.settings, ...settings };
  
  // Apply layout
  STATE.multiContainer.className = `layout-${STATE.settings.layout}`;
  if (STATE.settings.layout === 'split') {
    STATE.multiContainer.classList.add(`columns-${STATE.settings.columns}`);
  }
  
  // Apply message style
  document.body.className = '';
  document.body.classList.add(`style-${STATE.settings.messageStyle}`);
  document.body.classList.add(`density-${STATE.settings.density}`);
  
  if (STATE.settings.showAvatars) {
    document.body.classList.add('show-avatars');
  }
  
  if (STATE.settings.showTimestamps) {
    document.body.classList.add('show-timestamps');
  }
  
  if (STATE.settings.highlightPrimary) {
    document.body.classList.add('highlight-primary');
  }
  
  if (STATE.settings.autoContrast) {
    document.body.classList.add('auto-contrast');
  }
  
  // Count active streams
  STATE.activeStreams = STATE.settings.streams.filter(s => s.enabled && s.username).length;
  updateDebugStreams(STATE.activeStreams);
  
  HUD_LOG.debug('[MULTI HUD] ✅ Settings applied');
  updateDebugStatus('Ready');
}

// ==================== EVENT HANDLING ====================
function handleChatEvent(event) {
  try {
    // Add to messages array
    STATE.messages.unshift(event);
    
    // Trim to max messages
    if (STATE.messages.length > STATE.settings.maxMessages) {
      STATE.messages = STATE.messages.slice(0, STATE.settings.maxMessages);
    }
    
    // Render the message
    renderChatMessage(event);
    
    HUD_LOG.debug(`[MULTI HUD] ✅ Chat from ${event.sourceLabel}: ${event.user.nickname}`);
  } catch (error) {
    HUD_LOG.error('[MULTI HUD] ❌ Error handling chat event:', error);
  }
}

function handleGiftEvent(event) {
  try {
    // Add to messages array
    STATE.messages.unshift(event);
    
    // Trim to max messages
    if (STATE.messages.length > STATE.settings.maxMessages) {
      STATE.messages = STATE.messages.slice(0, STATE.settings.maxMessages);
    }
    
    // Render the gift as a special message
    renderGiftMessage(event);
    
    HUD_LOG.debug(`[MULTI HUD] ✅ Gift from ${event.sourceLabel}: ${event.user.nickname} sent ${event.gift.name} x${event.gift.count}`);
  } catch (error) {
    HUD_LOG.error('[MULTI HUD] ❌ Error handling gift event:', error);
  }
}

function renderChatMessage(event) {
  // Create message element
  const messageEl = document.createElement('div');
  messageEl.className = `chat-message style-${STATE.settings.messageStyle}`;
  
  // Add primary stream class if this is from the primary stream (streamIndex 0 or sourceId 'primary')
  if (event.streamIndex === 0 || event.sourceId === 'primary') {
    messageEl.classList.add('primary-stream');
  }
  
  // Set color custom properties
  messageEl.style.setProperty('--source-text', event.colors.text);
  messageEl.style.setProperty('--source-bg', event.colors.bg);
  messageEl.style.setProperty('--source-accent', event.colors.accent);
  
  // Create header
  const headerEl = document.createElement('div');
  headerEl.className = 'chat-message-header';
  
  // Add source badge (for badge style)
  if (STATE.settings.messageStyle === 'badge') {
    const badgeEl = document.createElement('span');
    badgeEl.className = 'source-badge';
    badgeEl.textContent = event.sourceLabel;
    badgeEl.style.background = event.colors.accent;
    headerEl.appendChild(badgeEl);
  }
  
  // Add avatar if enabled
  if (STATE.settings.showAvatars && event.user.profilePictureUrl) {
    const avatarEl = document.createElement('img');
    avatarEl.className = 'chat-avatar';
    avatarEl.src = event.user.profilePictureUrl;
    avatarEl.alt = event.user.nickname;
    headerEl.appendChild(avatarEl);
  }
  
  // Add badges (if badge renderer available)
  if (STATE.badgeRenderer && event.user.badge) {
    const badgeContainerEl = document.createElement('div');
    badgeContainerEl.className = 'badge-container';
    if (typeof STATE.badgeRenderer.renderToHTML === 'function') {
      STATE.badgeRenderer.renderToHTML(event.user.badge, badgeContainerEl);
    } else {
      badgeContainerEl.textContent = String(event.user.badge);
    }
    headerEl.appendChild(badgeContainerEl);
  }
  
  // Add username
  const usernameEl = document.createElement('span');
  usernameEl.className = 'chat-username';
  usernameEl.textContent = event.user.nickname;
  usernameEl.style.color = event.colors.text;
  headerEl.appendChild(usernameEl);
  
  // Add timestamp if enabled
  if (STATE.settings.showTimestamps) {
    const timestampEl = document.createElement('span');
    timestampEl.className = 'chat-timestamp';
    const date = new Date(event.timestamp);
    timestampEl.textContent = date.toLocaleTimeString();
    headerEl.appendChild(timestampEl);
  }
  
  messageEl.appendChild(headerEl);
  
  // Add message text
  const textEl = document.createElement('div');
  textEl.className = 'chat-text';
  
  if (STATE.messageParser && typeof STATE.messageParser.parseMessage === 'function') {
    const parsed = STATE.messageParser.parseMessage(event.raw || { message: event.message });
    if (STATE.emojiParser && typeof STATE.emojiParser.renderToHTML === 'function') {
      const segments = STATE.emojiParser.parse(
        parsed.text || event.message || '',
        parsed.emotes || [],
        STATE.settings.emojiRenderMode || 'image'
      );
      STATE.emojiParser.renderToHTML(segments, textEl);
    } else {
      textEl.textContent = parsed.text || event.message || '';
    }
  } else {
    textEl.textContent = event.message;
  }
  
  messageEl.appendChild(textEl);
  
  // Add to container
  STATE.messagesContainer.insertBefore(messageEl, STATE.messagesContainer.firstChild);
  
  // Trigger animation
  requestAnimationFrame(() => {
    messageEl.classList.add('visible');
    
    if (STATE.settings.pulseOnNew) {
      messageEl.classList.add('pulse-new');
      setTimeout(() => {
        messageEl.classList.remove('pulse-new');
      }, 500);
    }
  });
  
  // Trim old messages from DOM
  const maxDOMMessages = Math.min(STATE.settings.maxMessages, 100);
  while (STATE.messagesContainer.children.length > maxDOMMessages) {
    STATE.messagesContainer.removeChild(STATE.messagesContainer.lastChild);
  }
}

function renderGiftMessage(event) {
  // Create message element
  const messageEl = document.createElement('div');
  messageEl.className = `chat-message style-${STATE.settings.messageStyle}`;
  
  // Add primary stream class if this is from the primary stream
  if (event.streamIndex === 0 || event.sourceId === 'primary') {
    messageEl.classList.add('primary-stream');
  }
  
  // Set color custom properties
  messageEl.style.setProperty('--source-text', event.colors.text);
  messageEl.style.setProperty('--source-bg', event.colors.bg);
  messageEl.style.setProperty('--source-accent', event.colors.accent);
  
  // Create header
  const headerEl = document.createElement('div');
  headerEl.className = 'chat-message-header';
  
  // Add source badge (for badge style)
  if (STATE.settings.messageStyle === 'badge') {
    const badgeEl = document.createElement('span');
    badgeEl.className = 'source-badge';
    badgeEl.textContent = event.sourceLabel;
    badgeEl.style.background = event.colors.accent;
    headerEl.appendChild(badgeEl);
  }
  
  // Add avatar if enabled
  if (STATE.settings.showAvatars && event.user.profilePictureUrl) {
    const avatarEl = document.createElement('img');
    avatarEl.className = 'chat-avatar';
    avatarEl.src = event.user.profilePictureUrl;
    avatarEl.alt = event.user.nickname;
    headerEl.appendChild(avatarEl);
  }
  
  // Add username
  const usernameEl = document.createElement('span');
  usernameEl.className = 'chat-username';
  usernameEl.textContent = event.user.nickname;
  usernameEl.style.color = event.colors.text;
  headerEl.appendChild(usernameEl);
  
  // Add timestamp if enabled
  if (STATE.settings.showTimestamps) {
    const timestampEl = document.createElement('span');
    timestampEl.className = 'chat-timestamp';
    const date = new Date(event.timestamp);
    timestampEl.textContent = date.toLocaleTimeString();
    headerEl.appendChild(timestampEl);
  }
  
  messageEl.appendChild(headerEl);
  
  // Add gift message text
  const textEl = document.createElement('div');
  textEl.className = 'chat-text';
  textEl.textContent = ClarityHUDI18n.text('overlay.multi_gift_sent', '🎁 Sent {gift} x{count}', {
    gift: event.gift.name,
    count: event.gift.count
  });
  if (event.gift.diamondCount > 0) {
    textEl.textContent += ` (${event.gift.diamondCount} 💎)`;
  }
  
  messageEl.appendChild(textEl);
  
  // Add to container
  STATE.messagesContainer.insertBefore(messageEl, STATE.messagesContainer.firstChild);
  
  // Trigger animation
  requestAnimationFrame(() => {
    messageEl.classList.add('visible');
    
    if (STATE.settings.pulseOnNew) {
      messageEl.classList.add('pulse-new');
      setTimeout(() => {
        messageEl.classList.remove('pulse-new');
      }, 500);
    }
  });
  
  // Trim old messages from DOM
  const maxDOMMessages = Math.min(STATE.settings.maxMessages, 100);
  while (STATE.messagesContainer.children.length > maxDOMMessages) {
    STATE.messagesContainer.removeChild(STATE.messagesContainer.lastChild);
  }
}

// ==================== SYSTEM PREFERENCES ====================
function detectSystemPreferences() {
  // Detect reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  
  if (prefersReducedMotion.matches) {
    document.body.classList.add('reduce-motion');
    HUD_LOG.debug('[MULTI HUD] Reduced motion enabled (system preference)');
  }
  
  // Listen for changes
  prefersReducedMotion.addEventListener('change', (e) => {
    if (e.matches) {
      document.body.classList.add('reduce-motion');
      HUD_LOG.debug('[MULTI HUD] Reduced motion enabled');
    } else {
      document.body.classList.remove('reduce-motion');
      HUD_LOG.debug('[MULTI HUD] Reduced motion disabled');
    }
  });
}

// ==================== UTILITY FUNCTIONS ====================
function getContrastColor(bgColor) {
  // Convert hex/rgb to luminance and return black or white for best contrast
  if (!bgColor || typeof bgColor !== 'string') {
    return '#FFFFFF';
  }
  
  // Remove # if present
  const color = bgColor.replace('#', '');
  
  // Handle 3-character hex colors
  let r, g, b;
  if (color.length === 3) {
    r = parseInt(color[0] + color[0], 16);
    g = parseInt(color[1] + color[1], 16);
    b = parseInt(color[2] + color[2], 16);
  } else if (color.length === 6) {
    r = parseInt(color.substring(0, 2), 16);
    g = parseInt(color.substring(2, 4), 16);
    b = parseInt(color.substring(4, 6), 16);
  } else {
    // Invalid format, default to white
    return '#FFFFFF';
  }
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

// ==================== ERROR HANDLING ====================
window.addEventListener('error', (event) => {
  HUD_LOG.error('[MULTI HUD] ❌ Global error:', event.error);
  updateDebugStatus(`Error: ${event.error?.message || 'Unknown error'}`);
});

window.addEventListener('unhandledrejection', (event) => {
  HUD_LOG.error('[MULTI HUD] ❌ Unhandled promise rejection:', event.reason);
  updateDebugStatus(`Promise error: ${event.reason?.message || 'Unknown error'}`);
});

HUD_LOG.debug('[MULTI HUD] 📦 Multi-stream overlay script loaded');
window.addEventListener('message', (event) => {
  const payload = event.data || {};
  if (payload.source !== 'clarityhud-ui' || payload.type !== 'settings-preview' || payload.dock !== 'multi') {
    return;
  }
  applySettings(payload.settings);
});
