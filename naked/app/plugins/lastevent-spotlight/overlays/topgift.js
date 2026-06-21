/**
 * Last Event Spotlight - Top Gift Overlay
 */

const OVERLAY_TYPE = 'topgift';

// Initialize
const container = document.getElementById('overlay-container');
let settings = {};
let renderer = null;
let animationRenderer = null;
let socket = null;

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
});

// Listen for user updates
socket.on(`lastevent.update.${OVERLAY_TYPE}`, async (userData) => {
  console.log('Received user update:', userData);
  await updateDisplay(userData);
});

// Listen for settings updates
socket.on(`lastevent.settings.${OVERLAY_TYPE}`, (newSettings) => {
  console.log('Received settings update:', newSettings);
  settings = newSettings;
  if (renderer) {
    renderer.updateSettings(settings);
  }
});

// Listen for session reset
socket.on('lastevent.session.reset', () => {
  console.log('Session reset - clearing top gift');
  container.innerHTML = '';
});

// Initialize overlay
async function init() {
  try {
    // Load settings (use gifter settings as template)
    const settingsResponse = await fetch(`/api/lastevent/settings/gifter`);
    const settingsData = await settingsResponse.json();
    settings = settingsData.settings || {};

    // Initialize renderer
    renderer = new TemplateRenderer(container, settings);

    // Load initial user data
    const userResponse = await fetch(`/api/lastevent/last/${OVERLAY_TYPE}`);
    const userData = await userResponse.json();

    if (userData.success && userData.user) {
      await updateDisplay(userData.user, false); // No animation on initial load
    }

    console.log('Overlay initialized');
  } catch (error) {
    console.error('Error initializing overlay:', error);
  }
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

// Auto-refresh if configured
setInterval(async () => {
  if (settings.refreshIntervalSeconds && settings.refreshIntervalSeconds > 0) {
    try {
      const response = await fetch(`/api/lastevent/last/${OVERLAY_TYPE}`);
      const data = await response.json();
      if (data.success && data.user) {
        await updateDisplay(data.user, false); // Refresh without animation
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }
}, 5000); // Check every 5 seconds
