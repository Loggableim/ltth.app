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
    // Update our local event data
    allEventData[data.type] = data.user;
    
    // If we're currently showing this event, update the display immediately
    if (selectedEvents.length > 0 && selectedEvents[currentEventIndex] === data.type) {
      await updateDisplay(data.user);
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
  await loadAllEventData();
  startRotation();
});

// Listen for session reset (new stream started)
socket.on('lastevent.session.reset', () => {
  console.log('Session reset - clearing overlay');
  allEventData = {};
  container.innerHTML = '';
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
    await loadAllEventData();

    // Start rotation
    startRotation();

    console.log('Multi-HUD overlay initialized with events:', selectedEvents);
  } catch (error) {
    console.error('Error initializing overlay:', error);
  }
}

// Load all event data from server
async function loadAllEventData() {
  try {
    const response = await fetch('/api/lastevent/all');
    const data = await response.json();
    
    if (data.success && data.users) {
      allEventData = data.users;
      console.log('Loaded all event data:', allEventData);
    }
  } catch (error) {
    console.error('Error loading event data:', error);
  }
}

// Start rotation timer
function startRotation() {
  if (selectedEvents.length === 0) {
    console.log('No events selected for rotation');
    container.innerHTML = '<div class="no-data">No events selected for rotation</div>';
    return;
  }

  // Clear any existing timer
  stopRotation();

  // Show first event immediately
  currentEventIndex = 0;
  showCurrentEvent();

  // Set up rotation timer
  if (selectedEvents.length > 1) {
    rotationTimer = setInterval(() => {
      currentEventIndex = (currentEventIndex + 1) % selectedEvents.length;
      showCurrentEvent();
    }, rotationIntervalSeconds * 1000);
  }

  console.log(`Rotation started: ${selectedEvents.length} events, ${rotationIntervalSeconds}s interval`);
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

  const eventType = selectedEvents[currentEventIndex];
  const userData = allEventData[eventType];

  console.log(`Showing event ${currentEventIndex + 1}/${selectedEvents.length}: ${eventType}`, userData);

  // Always call updateDisplay to let TemplateRenderer handle null userData
  // The renderer will respect hideOnNullUser setting
  await updateDisplay(userData);
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
