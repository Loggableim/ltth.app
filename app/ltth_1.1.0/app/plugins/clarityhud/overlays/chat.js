/**
 * ClarityHUD - Chat Overlay
 * 
 * Enhanced with:
 * - Transparency support (0-100%)
 * - Full emoji support (TikTok emotes + Unicode)
 * - Badge system (Moderator, Subscriber, Team Level, etc.)
 * - Robust message parsing
 * - Virtual scrolling for performance
 * - Color engine based on team levels
 */

// ==================== STATE MANAGEMENT ====================
const STATE = {
  settings: {
    fontSize: '48px',
    lineHeight: 1.6,
    letterSpacing: '0.5px',
    maxMessages: 10,
    showTimestamps: false,
    textAlign: 'left',
    animationType: 'slide',
    animationSpeed: 'medium',
    reduceMotion: false,
    opacity: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    // New settings
    transparency: 100, // 0-100%
    emojiRenderMode: 'image', // 'image' or 'unicode'
    badgeSize: 'medium',
    teamLevelStyle: 'icon-glow',
    showTeamLevel: true,
    showModerator: true,
    showSubscriber: true,
    showGifter: true,
    showFanClub: true,
    useVirtualScrolling: true,
    usernameColorByTeamLevel: true
  },
  messages: [],
  socket: null,
  animationRegistry: null,
  animationRenderer: null,
  accessibilityManager: null,
  emojiParser: null,
  badgeRenderer: null,
  messageParser: null,
  virtualScroller: null,
  messagesContainer: null,
  eventCount: 0
};

// ==================== DEBUG HELPERS ====================
function updateDebugStatus(status) {
  const debugStatus = document.getElementById('debug-status');
  if (debugStatus) {
    debugStatus.textContent = `Status: ${status}`;
  }
  console.log(`[CHAT HUD] Status: ${status}`);
}

function updateDebugSocket(status) {
  const debugSocket = document.getElementById('debug-socket');
  if (debugSocket) {
    debugSocket.textContent = `Socket: ${status}`;
  }
}

function updateDebugEvents() {
  STATE.eventCount++;
  const debugEvents = document.getElementById('debug-events');
  if (debugEvents) {
    debugEvents.textContent = `Events: ${STATE.eventCount}`;
  }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[CHAT HUD] 🚀 DOMContentLoaded - Starting initialization...');
  updateDebugStatus('DOM Ready');
  
  // Get DOM elements
  STATE.messagesContainer = document.getElementById('messages');
  
  if (!STATE.messagesContainer) {
    console.error('[CHAT HUD] ❌ CRITICAL ERROR: #messages container not found in DOM!');
    updateDebugStatus('ERROR: #messages not found!');
    return;
  }
  
  console.log('[CHAT HUD] ✅ DOM elements found');
  
  // Initialize systems
  initializeSystems();
  
  // Connect to socket
  connectSocket();
  
  // Detect system preference for reduced motion
  detectSystemPreferences();
  
  // Enable debug console toggle with Ctrl+D
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'd') {
      e.preventDefault();
      const debugConsole = document.getElementById('debug-console');
      if (debugConsole) {
        debugConsole.style.display = debugConsole.style.display === 'none' ? 'block' : 'none';
      }
    }
  });
  
  console.log('[CHAT HUD] Initialization complete, waiting for socket connection...');
});

/**
 * Initialize all subsystems
 */
function initializeSystems() {
  console.log('[CHAT HUD] Initializing subsystems...');
  
  try {
    // Animation system
    if (typeof AnimationRegistry !== 'undefined') {
      STATE.animationRegistry = new AnimationRegistry();
      STATE.animationRenderer = new AnimationRenderer(STATE.animationRegistry);
      console.log('[CHAT HUD] ✅ Animation system initialized');
    } else {
      console.warn('[CHAT HUD] ⚠️ AnimationRegistry not available');
    }
    
    // Accessibility manager
    if (typeof AccessibilityManager !== 'undefined') {
      STATE.accessibilityManager = new AccessibilityManager(document.body);
      console.log('[CHAT HUD] ✅ Accessibility manager initialized');
    } else {
      console.warn('[CHAT HUD] ⚠️ AccessibilityManager not available');
    }
    
    // Emoji parser
    if (typeof EmojiParser !== 'undefined') {
      STATE.emojiParser = new EmojiParser();
      console.log('[CHAT HUD] ✅ Emoji parser initialized');
    } else {
      console.warn('[CHAT HUD] ⚠️ EmojiParser not available');
    }
    
    // Badge renderer
    if (typeof BadgeRenderer !== 'undefined') {
      STATE.badgeRenderer = new BadgeRenderer(STATE.settings);
      console.log('[CHAT HUD] ✅ Badge renderer initialized');
    } else {
      console.warn('[CHAT HUD] ⚠️ BadgeRenderer not available');
    }
    
    // Message parser
    if (typeof MessageParser !== 'undefined') {
      STATE.messageParser = new MessageParser();
      console.log('[CHAT HUD] ✅ Message parser initialized');
    } else {
      console.warn('[CHAT HUD] ⚠️ MessageParser not available');
    }
    
    console.log('[CHAT HUD] All subsystems initialized successfully');
  } catch (error) {
    console.error('[CHAT HUD] ❌ Error initializing subsystems:', error);
  }
}

/**
 * Connect to Socket.IO
 */
function connectSocket() {
  console.log('[CHAT HUD] Initializing Socket.IO connection...');
  updateDebugStatus('Connecting to Socket.IO...');
  
  STATE.socket = io();
  
  STATE.socket.on('connect', () => {
    console.log('[CHAT HUD] ✅ CONNECTED to server - Socket ID:', STATE.socket.id);
    updateDebugSocket('Connected ✅');
    updateDebugStatus('Connected, loading settings...');
    init();
  });
  
  STATE.socket.on('disconnect', () => {
    console.log('[CHAT HUD] ⚠️ DISCONNECTED from server');
    updateDebugSocket('Disconnected ⚠️');
    updateDebugStatus('Disconnected from server');
  });
  
  STATE.socket.on('connect_error', (error) => {
    console.error('[CHAT HUD] ❌ CONNECTION ERROR:', error);
    updateDebugSocket('Error ❌');
    updateDebugStatus(`Connection Error: ${error.message}`);
  });
  
  // Listen for chat updates
  STATE.socket.on('clarityhud.update.chat', (chatData) => {
    console.log('[CHAT HUD] 📨 EVENT RECEIVED - clarityhud.update.chat:', chatData);
    updateDebugEvents();
    addMessage(chatData);
  });
  
  // Listen for settings updates
  STATE.socket.on('clarityhud.settings.chat', (newSettings) => {
    console.log('[CHAT HUD] ⚙️ SETTINGS UPDATE:', newSettings);
    applySettings(newSettings);
  });
  
  console.log('[CHAT HUD] Socket listeners registered');
}

/**
 * Detect system preferences
 */
function detectSystemPreferences() {
  if (!window.matchMedia) return;

  // Detect reduced motion preference
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motionQuery.matches && !STATE.settings.reduceMotion) {
    STATE.settings.reduceMotion = true;
    if (STATE.animationRenderer) {
      STATE.animationRenderer.setReduceMotion(true);
    }
    document.body.classList.add('reduce-motion');
  }
  
  // Listen for changes
  motionQuery.addEventListener('change', (e) => {
    if (!STATE.settings.reduceMotion) {
      const shouldReduce = e.matches;
      if (STATE.animationRenderer) {
        STATE.animationRenderer.setReduceMotion(shouldReduce);
      }
      document.body.classList.toggle('reduce-motion', shouldReduce);
    }
  });
}

// ==================== INITIALIZATION ====================
async function init() {
  console.log('[CHAT HUD] 📡 Loading settings from server...');
  updateDebugStatus('Loading settings...');
  
  try {
    // Load settings
    const settingsResponse = await fetch('/api/clarityhud/settings/chat');
    const settingsData = await settingsResponse.json();

    console.log('[CHAT HUD] Settings response:', settingsData);

    if (settingsData.success && settingsData.settings) {
      console.log('[CHAT HUD] ✅ Settings loaded successfully');
      applySettings(settingsData.settings);
    } else {
      console.warn('[CHAT HUD] ⚠️ Settings response not successful, using defaults');
    }

    // Load initial state (existing messages)
    try {
      const stateResponse = await fetch('/api/clarityhud/state/chat');
      const stateData = await stateResponse.json();
      
      if (stateData.success && stateData.events && stateData.events.chat) {
        console.log('[CHAT HUD] ✅ Loading initial messages:', stateData.events.chat.length);
        // Add existing messages to the display
        stateData.events.chat.forEach(msg => {
          addMessage(msg);
        });
      }
    } catch (error) {
      console.warn('[CHAT HUD] ⚠️ Could not load initial state:', error);
      // Continue without initial messages
    }

    // Initialize virtual scrolling if enabled
    if (STATE.settings.useVirtualScrolling) {
      console.log('[CHAT HUD] Initializing virtual scrolling...');
      initializeVirtualScrolling();
    }

    console.log('[CHAT HUD] ✅ Chat overlay initialized and ready to receive events');
    updateDebugStatus('Ready - Waiting for events');
  } catch (error) {
    console.error('[CHAT HUD] ❌ Error initializing overlay:', error);
    updateDebugStatus(`Error: ${error.message}`);
  }
}

/**
 * Initialize virtual scrolling
 */
function initializeVirtualScrolling() {
  if (STATE.virtualScroller) {
    STATE.virtualScroller.destroy();
  }

  const container = document.getElementById('chat-container');
  
  STATE.virtualScroller = new VirtualScroller(container, {
    itemHeight: parseInt(STATE.settings.fontSize) * STATE.settings.lineHeight * 2.5,
    maxItems: STATE.settings.maxMessages * 2, // Keep double for smooth scrolling
    renderCallback: renderMessageElement
  });

  // Replace messages container with virtual scroller
  STATE.messagesContainer.style.display = 'none';
}

// ==================== SETTINGS ====================
function applySettings(newSettings) {
  STATE.settings = { ...STATE.settings, ...newSettings };

  // Apply CSS custom properties
  const root = document.documentElement;

  if (STATE.settings.fontSize) {
    root.style.setProperty('--chat-font-size', STATE.settings.fontSize);
  }

  if (STATE.settings.lineHeight) {
    root.style.setProperty('--chat-line-height', STATE.settings.lineHeight);
  }

  if (STATE.settings.letterSpacing) {
    root.style.setProperty('--chat-letter-spacing', STATE.settings.letterSpacing);
  }

  if (STATE.settings.textAlign) {
    root.style.setProperty('--chat-alignment', STATE.settings.textAlign);
    document.body.classList.toggle('align-center', STATE.settings.textAlign === 'center');
  }

  // Apply transparency (converts 0-100% to 0-1)
  if (typeof STATE.settings.transparency !== 'undefined') {
    const opacity = STATE.settings.transparency / 100;
    root.style.setProperty('--chat-opacity', opacity);
    
    // Also apply to background opacity if backgroundColor is rgba
    if (STATE.settings.backgroundColor) {
      const bgOpacity = opacity;
      root.style.setProperty('--chat-background-opacity', bgOpacity);
    }
  }

  // Legacy opacity support
  if (typeof STATE.settings.opacity !== 'undefined' && typeof STATE.settings.transparency === 'undefined') {
    root.style.setProperty('--chat-opacity', STATE.settings.opacity);
  }

  if (STATE.settings.backgroundColor) {
    root.style.setProperty('--chat-bg-color', STATE.settings.backgroundColor);
  }

  if (STATE.settings.textColor) {
    root.style.setProperty('--chat-text-color', STATE.settings.textColor);
  }

  if (STATE.settings.userNameColor) {
    root.style.setProperty('--chat-username-color', STATE.settings.userNameColor);
  }

  if (STATE.settings.textOutline) {
    root.style.setProperty('--chat-text-outline', STATE.settings.textOutline);
  }

  if (STATE.settings.padding) {
    root.style.setProperty('--chat-padding', STATE.settings.padding);
  }

  if (STATE.settings.messageSpacing) {
    root.style.setProperty('--chat-message-spacing', STATE.settings.messageSpacing);
  }

  // Apply keep-on-top setting (requires parent window support)
  if (typeof STATE.settings.keepOnTop !== 'undefined' && window.parent && window.parent.setAlwaysOnTop) {
    window.parent.setAlwaysOnTop(STATE.settings.keepOnTop);
  }

  // Apply accessibility settings
  if (STATE.accessibilityManager) {
    STATE.accessibilityManager.applySettings(STATE.settings);
  }

  // Update badge renderer settings
  if (STATE.badgeRenderer) {
    STATE.badgeRenderer.updateSettings(STATE.settings);
  }

  // Update reduce motion in animation renderer
  if (STATE.animationRenderer) {
    STATE.animationRenderer.setReducedMotion(STATE.settings.reduceMotion || false);
  }

  // Update body classes
  document.body.classList.toggle('high-contrast', STATE.settings.highContrastMode);
  document.body.classList.toggle('colorblind-safe', STATE.settings.colorblindSafeMode);
  document.body.classList.toggle('vision-impaired', STATE.settings.visionImpairedMode);
  document.body.classList.toggle('reduce-motion', STATE.settings.reduceMotion);

  // Reinitialize virtual scrolling if setting changed
  if (STATE.settings.useVirtualScrolling && !STATE.virtualScroller) {
    initializeVirtualScrolling();
  } else if (!STATE.settings.useVirtualScrolling && STATE.virtualScroller) {
    STATE.virtualScroller.destroy();
    STATE.virtualScroller = null;
    STATE.messagesContainer.style.display = 'flex';
  }

  // Trim messages if max changed
  trimMessages();
}

// ==================== MESSAGE HANDLING ====================
function addMessage(chatData) {
  console.log('[CHAT HUD] Received chat event:', chatData);
  
  // Normalize the data structure from backend
  // Backend sends: { user: {...}, message: "...", comment: "...", raw: {...} }
  const normalizedData = {
    user: chatData.user || {
      uniqueId: chatData.uniqueId || 'unknown',
      nickname: chatData.nickname || chatData.uniqueId || 'Anonymous',
      profilePictureUrl: chatData.profilePictureUrl || null,
      badge: chatData.badge || null
    },
    text: chatData.message || chatData.comment || '',
    emotes: [],
    raw: chatData.raw || chatData,
    timestamp: Date.now(),
    id: `chat_${Date.now()}_${Math.random()}`
  };

  console.log('[CHAT HUD] Normalized data:', normalizedData);

  if (!normalizedData.text) {
    console.warn('[CHAT HUD] Invalid chat data - no message:', chatData);
    return;
  }

  // Add to messages array
  STATE.messages.push(normalizedData);

  // Trim to max messages
  trimMessages();

  console.log('[CHAT HUD] Rendering message...');

  // Render message
  if (STATE.virtualScroller) {
    // Add to virtual scroller
    STATE.virtualScroller.addItems([normalizedData], false);
    STATE.virtualScroller.scrollToBottom('smooth');
  } else {
    // Regular rendering
    renderMessage(normalizedData);
  }
}

/**
 * Render a message element (for both regular and virtual scrolling)
 */
function renderMessageElement(messageData, index) {
  console.log('[CHAT HUD] Rendering message element:', messageData);
  
  try {
    // Create message element
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';
    messageEl.dataset.id = messageData.id || `msg_${Date.now()}`;

    // Create header with badges and username
    const headerEl = document.createElement('div');
    headerEl.className = 'chat-message-header';

    // Extract badges if badge renderer is available
    let badges = { teamLevel: 0 };
    if (STATE.badgeRenderer && messageData.raw) {
      try {
        badges = STATE.badgeRenderer.extractBadges(messageData.raw);
      } catch (badgeError) {
        console.warn('[CHAT HUD] Badge extraction error:', badgeError);
      }
    }

    // Create badge container
    if (STATE.badgeRenderer && badges) {
      try {
        const badgeContainer = document.createElement('div');
        badgeContainer.className = 'badge-container';
        STATE.badgeRenderer.renderToHTML(badges, badgeContainer);
        headerEl.appendChild(badgeContainer);
      } catch (badgeRenderError) {
        console.warn('[CHAT HUD] Badge rendering error:', badgeRenderError);
      }
    }

    // Create username span with fallback
    const usernameEl = document.createElement('span');
    usernameEl.className = 'chat-username';
    const username = messageData.user?.nickname || 
                     messageData.nickname || 
                     messageData.user?.uniqueId || 
                     'Anonymous';
    usernameEl.textContent = username;

    // Apply username color based on team level if enabled
    if (STATE.settings.usernameColorByTeamLevel && badges.teamLevel > 0 && STATE.badgeRenderer) {
      try {
        const color = STATE.badgeRenderer.getUsernameColor(badges.teamLevel);
        usernameEl.style.color = color;
      } catch (colorError) {
        console.warn('[CHAT HUD] Username color error:', colorError);
      }
    }

    headerEl.appendChild(usernameEl);

    // Add colon separator
    const colonEl = document.createElement('span');
    colonEl.textContent = ':';
    colonEl.className = 'chat-username';
    headerEl.appendChild(colonEl);

    messageEl.appendChild(headerEl);

    // Create text container with emojis
    const textEl = document.createElement('div');
    textEl.className = 'chat-text';

    // Get message text with fallback
    const messageText = messageData.text || messageData.message || messageData.comment || '';

    // Parse emojis if parser is available
    if (STATE.emojiParser) {
      try {
        const emojiSegments = STATE.emojiParser.parse(
          messageText,
          messageData.emotes || [],
          STATE.settings.emojiRenderMode || 'image'
        );
        STATE.emojiParser.renderToHTML(emojiSegments, textEl);
      } catch (emojiError) {
        console.warn('[CHAT HUD] Emoji parsing error:', emojiError);
        textEl.textContent = messageText;
      }
    } else {
      // Fallback to plain text
      textEl.textContent = messageText;
    }

    messageEl.appendChild(textEl);

    // Add timestamp if enabled
    if (STATE.settings.showTimestamps) {
      const timestampEl = document.createElement('span');
      timestampEl.className = 'chat-timestamp';
      timestampEl.textContent = formatTimestamp(messageData.timestamp || Date.now());
      messageEl.appendChild(timestampEl);
    }

    console.log('[CHAT HUD] Message element created successfully');
    return messageEl;
  } catch (error) {
    console.error('[CHAT HUD] Error rendering message element:', error);
    // Return a simple error message element
    const errorEl = document.createElement('div');
    errorEl.className = 'chat-message';
    errorEl.textContent = `Error rendering message: ${error.message}`;
    return errorEl;
  }
}

/**
 * Render a message (non-virtual scrolling mode)
 */
function renderMessage(messageData) {
  console.log('[CHAT HUD] 🎨 Rendering message to DOM:', messageData);
  
  try {
    const messageEl = renderMessageElement(messageData);

    if (!messageEl) {
      console.error('[CHAT HUD] ❌ renderMessageElement returned null/undefined');
      return;
    }

    // Add to container
    STATE.messagesContainer.appendChild(messageEl);
    console.log('[CHAT HUD] ✅ Message element added to DOM');

    // Animate in
    requestAnimationFrame(() => {
      if (STATE.animationRenderer) {
        STATE.animationRenderer.animateIn(
          messageEl,
          STATE.settings.animationType || 'slide',
          STATE.settings.animationSpeed || 'medium'
        ).then(() => {
          messageEl.classList.add('visible');
          console.log('[CHAT HUD] ✅ Message animated and visible');
        }).catch(error => {
          console.warn('[CHAT HUD] Animation error:', error);
          // Fallback: make it visible anyway
          messageEl.classList.add('visible');
          messageEl.style.opacity = '1';
        });
      } else {
        // No animation renderer, just make it visible
        messageEl.classList.add('visible');
        messageEl.style.opacity = '1';
        console.log('[CHAT HUD] ✅ Message visible (no animation)');
      }
    });

    // Trim old messages
    trimMessagesFromDOM();
  } catch (error) {
    console.error('[CHAT HUD] ❌ Error in renderMessage:', error);
  }
}

/**
 * Trim messages to max limit
 */
function trimMessages() {
  const maxMessages = STATE.settings.maxMessages || 10;

  // Remove excess messages from array
  while (STATE.messages.length > maxMessages) {
    STATE.messages.shift();
  }
}

/**
 * Trim messages from DOM (non-virtual mode)
 */
function trimMessagesFromDOM() {
  if (STATE.virtualScroller) return; // Not needed in virtual mode

  const maxMessages = STATE.settings.maxMessages || 10;
  const messageElements = STATE.messagesContainer.querySelectorAll('.chat-message');

  if (messageElements.length > maxMessages) {
    for (let i = 0; i < messageElements.length - maxMessages; i++) {
      const messageEl = messageElements[i];
      
      // Animate out then remove
      STATE.animationRenderer.animateOut(
        messageEl,
        STATE.settings.animationType || 'slide',
        STATE.settings.animationSpeed || 'medium'
      ).then(() => {
        if (messageEl.parentNode) {
          messageEl.parentNode.removeChild(messageEl);
        }
      });
    }
  }
}

/**
 * Format timestamp
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}
