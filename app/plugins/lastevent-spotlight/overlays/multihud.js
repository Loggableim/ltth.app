/**
 * Last Event Spotlight - Multi-HUD Rotation Overlay
 * 
 * Displays multiple event types in a single overlay with automatic rotation
 */

const OVERLAY_TYPE = 'multihud';

// Initialize
const container = document.getElementById('overlay-container');
let settings = {};
let renderer = null;
let animationRenderer = null;
let socket = null;

// Multi-HUD state
let allEventData = {};
let selectedEvents = [];
let rotationIntervalSeconds = 5;
let currentEventIndex = 0;
let rotationTimer = null;
let sessionId = null;
let requestGeneration = 0;

// Initialize animation system
const animationRegistry = new AnimationRegistry();
animationRenderer = new AnimationRenderer(animationRegistry);

// Connect to socket
socket = io();

socket.on('connect', () => {
  console.log('Connected to server');
  init();
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  stopRotation();
});

// Listen for individual event updates
socket.on('lastevent.multihud.update', async (data) => {
  console.log('Received multihud update:', data);
  if (data && data.type && data.user) {
    const incomingSessionId = data.sessionId || data.user.sessionId;
    if (incomingSessionId && sessionId && incomingSessionId !== sessionId) {
      return;
    }
    if (incomingSessionId) {
      sessionId = incomingSessionId;
    }

    // Update our local event data
    allEventData[data.type] = data.user;

    if (selectedEvents.includes(data.type)) {
      const rotationEvents = getRotatableEvents();

      if (rotationTimer === null && rotationEvents.length > 0) {
        // Rotation not running yet — start it, showing the new event first
        startRotation(data.type);
      } else if (rotationEvents.length > 0 && rotationEvents[currentEventIndex] === data.type) {
        // Currently showing this event type — refresh the display with latest data
        showCurrentEvent();
      }
      // Otherwise: data is updated, let the existing rotation continue naturally
      // without resetting the timer or jumping to this event
    }
  }
});

// Listen for settings updates
socket.on(`lastevent.settings.${OVERLAY_TYPE}`, async (newSettings) => {
  console.log('Received settings update:', newSettings);
  settings = newSettings;
  
  // Update selected events and rotation interval
  if (settings.selectedEvents && Array.isArray(settings.selectedEvents)) {
    selectedEvents = settings.selectedEvents.filter(e => e !== 'multihud');
  }
  if (settings.rotationIntervalSeconds) {
    rotationIntervalSeconds = settings.rotationIntervalSeconds;
  }
  
  if (renderer) {
    renderer.updateSettings(settings);
  }
  
  // Restart rotation with new settings
  stopRotation();
  const loaded = await loadAllEventData();
  if (loaded) {
    startRotation();
  }
});

// Listen for session reset (new stream started)
socket.on('lastevent.session.reset', (payload = {}) => {
  console.log('Session reset - clearing overlay');
  requestGeneration += 1;
  if (payload.sessionId) {
    sessionId = payload.sessionId;
  }
  allEventData = {};
  if (renderer && typeof renderer.clear === 'function') {
    renderer.clear();
  } else {
    container.innerHTML = '';
  }
  stopRotation();
});

// Initialize overlay
async function init() {
  try {
    // Load settings
    const settingsResponse = await fetch(`/api/lastevent/settings/${OVERLAY_TYPE}`);
    const settingsData = await settingsResponse.json();
    settings = settingsData.settings || {};

    // Extract multi-HUD specific settings
    selectedEvents = settings.selectedEvents || ['follower', 'like', 'chatter', 'share', 'gifter', 'subscriber'];
    rotationIntervalSeconds = settings.rotationIntervalSeconds || 5;
    
    // Filter out multihud itself from selected events
    selectedEvents = selectedEvents.filter(e => e !== 'multihud');

    // Initialize renderer
    renderer = new TemplateRenderer(container, settings);

    // Load all event data
    const loaded = await loadAllEventData();

    // Start rotation
    if (loaded) {
      startRotation();
    }

    console.log('Multi-HUD overlay initialized with events:', selectedEvents);
  } catch (error) {
    console.error('Error initializing overlay:', error);
  }
}

// Load all event data from server
async function loadAllEventData() {
  try {
    const currentGeneration = requestGeneration;
    const selectedQuery = selectedEvents.length > 0
      ? `?selected=${encodeURIComponent(selectedEvents.join(','))}`
      : '';
    const response = await fetch(`/api/lastevent/all${selectedQuery}`);
    const data = await response.json();

    if (currentGeneration !== requestGeneration) {
      return false;
    }

    if (data.sessionId && sessionId && data.sessionId !== sessionId) {
      return false;
    }
    
    if (data.success && data.users) {
      if (data.sessionId) {
        sessionId = data.sessionId;
      }
      allEventData = data.users;
      console.log('Loaded all event data:', allEventData);
    }

    return true;
  } catch (error) {
    console.error('Error loading event data:', error);
    return false;
  }
}

// Start rotation timer
function startRotation(preferredEventType = null) {
  if (selectedEvents.length === 0) {
    console.log('No events selected for rotation');
    container.innerHTML = '<div class="no-data">No events selected for rotation</div>';
    return;
  }

  // Clear any existing timer
  stopRotation();

  const rotationEvents = getRotatableEvents();

  if (rotationEvents.length === 0) {
    currentEventIndex = 0;
    showCurrentEvent();
    console.log('No event data available for selected Multi-HUD events');
    return;
  }

  if (preferredEventType && rotationEvents.includes(preferredEventType)) {
    currentEventIndex = rotationEvents.indexOf(preferredEventType);
  } else if (currentEventIndex >= rotationEvents.length) {
    currentEventIndex = 0;
  }

  // Show first event immediately
  showCurrentEvent();

  // Set up rotation timer
  if (rotationEvents.length > 1) {
    rotationTimer = setInterval(() => {
      const currentRotationEvents = getRotatableEvents();
      if (currentRotationEvents.length === 0) {
        stopRotation();
        showCurrentEvent();
        return;
      }
      currentEventIndex = (currentEventIndex + 1) % currentRotationEvents.length;
      showCurrentEvent();
    }, rotationIntervalSeconds * 1000);
  }

  console.log(`Rotation started: ${rotationEvents.length} active events, ${rotationIntervalSeconds}s interval`);
}

// Stop rotation timer
function stopRotation() {
  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
}

// Show the current event in rotation
async function showCurrentEvent() {
  if (selectedEvents.length === 0) return;

  const rotationEvents = getRotatableEvents();

  if (rotationEvents.length === 0) {
    await updateDisplay(null);
    return;
  }

  if (currentEventIndex >= rotationEvents.length) {
    currentEventIndex = 0;
  }

  const eventType = rotationEvents[currentEventIndex];
  const userData = allEventData[eventType];

  console.log(`Showing event ${currentEventIndex + 1}/${rotationEvents.length}: ${eventType}`, userData);

  await updateDisplay(userData);
}

// Get selected events that have data available for display
function getRotatableEvents() {
  return selectedEvents.filter(eventType => allEventData[eventType]);
}

// Update display with animation
async function updateDisplay(userData, animate = true) {
  if (!renderer || !animationRenderer) return;

  const displayElement = container.querySelector('.user-display');

  // Animate out if there's existing content
  if (animate && displayElement) {
    await animationRenderer.animateOut(
      displayElement,
      settings.outAnimationType || 'fade',
      settings.animationSpeed || 'medium'
    );
  }

  // Render new content
  await renderer.render(userData, false);

  // Animate in
  const newDisplayElement = container.querySelector('.user-display');
  if (animate && newDisplayElement) {
    await animationRenderer.animateIn(
      newDisplayElement,
      settings.inAnimationType || 'fade',
      settings.animationSpeed || 'medium'
    );
  }
}
