/**
 * Shared Spotlight overlay client for single event overlays.
 */
(function initSharedSingleOverlay(global) {
  async function initSpotlightOverlay(overlayType) {
    if (!overlayType) {
      throw new Error('Missing Spotlight overlay type');
    }

    const container = document.getElementById('overlay-container');
    const animationRegistry = new AnimationRegistry();
    const animationRenderer = new AnimationRenderer(animationRegistry);
    const state = {
      overlayType,
      container,
      settings: {},
      renderer: null,
      socket: null,
      refreshTimer: null,
      sessionId: null,
      requestGeneration: 0
    };

    function stopRefreshTimer() {
      if (state.refreshTimer) {
        clearInterval(state.refreshTimer);
        state.refreshTimer = null;
      }
    }

    async function refreshData() {
      try {
        const requestGeneration = state.requestGeneration;
        const response = await fetch(`/api/lastevent/last/${state.overlayType}`);
        const data = await response.json();
        if (data.success && isCurrentResponse(data, requestGeneration)) {
          await updateDisplay(data.user || null, false);
        }
      } catch (error) {
        console.error('Error refreshing data:', error);
      }
    }

    function isCurrentResponse(data, requestGeneration) {
      if (requestGeneration !== state.requestGeneration) {
        return false;
      }

      if (data.sessionId && state.sessionId && data.sessionId !== state.sessionId) {
        return false;
      }

      if (data.sessionId) {
        state.sessionId = data.sessionId;
      }

      return true;
    }

    function isCurrentUser(userData) {
      if (!userData || !userData.sessionId || !state.sessionId) {
        return true;
      }

      return userData.sessionId === state.sessionId;
    }

    function startRefreshTimer() {
      stopRefreshTimer();
      const intervalSeconds = Number.parseInt(state.settings.refreshIntervalSeconds, 10);
      if (Number.isFinite(intervalSeconds) && intervalSeconds > 0) {
        state.refreshTimer = setInterval(refreshData, intervalSeconds * 1000);
      }
    }

    async function updateDisplay(userData, animate = true) {
      if (!state.renderer) return;

      const displayElement = container.querySelector('.user-display');

      if (animate && displayElement) {
        await animationRenderer.animateOut(
          displayElement,
          state.settings.outAnimationType || 'fade',
          state.settings.animationSpeed || 'medium'
        );
      }

      await state.renderer.render(userData, false);

      const newDisplayElement = container.querySelector('.user-display');
      if (animate && newDisplayElement) {
        await animationRenderer.animateIn(
          newDisplayElement,
          state.settings.inAnimationType || 'fade',
          state.settings.animationSpeed || 'medium'
        );
      }
    }

    async function loadOverlayState() {
      try {
        const requestGeneration = state.requestGeneration;
        const settingsResponse = await fetch(`/api/lastevent/settings/${state.overlayType}`);
        const settingsData = await settingsResponse.json();
        if (requestGeneration !== state.requestGeneration) return;
        state.settings = settingsData.settings || {};

        if (!state.renderer) {
          state.renderer = new TemplateRenderer(container, state.settings);
        } else {
          state.renderer.updateSettings(state.settings);
        }

        startRefreshTimer();

        const userResponse = await fetch(`/api/lastevent/last/${state.overlayType}`);
        const userData = await userResponse.json();

        if (userData.success && isCurrentResponse(userData, requestGeneration)) {
          await updateDisplay(userData.user || null, false);
        }
      } catch (error) {
        console.error('Error initializing overlay:', error);
      }
    }

    state.socket = io();
    state.socket.on('connect', () => {
      console.log('Connected to server');
      loadOverlayState();
    });

    state.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      stopRefreshTimer();
    });

    state.socket.on(`lastevent.update.${state.overlayType}`, async (userData) => {
      console.log('Received user update:', userData);
      if (!isCurrentUser(userData)) return;
      await updateDisplay(userData);
    });

    state.socket.on(`lastevent.settings.${state.overlayType}`, (newSettings) => {
      console.log('Received settings update:', newSettings);
      state.settings = newSettings || {};
      if (state.renderer) {
        state.renderer.updateSettings(state.settings);
      }
      startRefreshTimer();
    });

    state.socket.on('lastevent.session.reset', (payload = {}) => {
      console.log('Session reset - clearing overlay');
      state.requestGeneration += 1;
      if (payload.sessionId) {
        state.sessionId = payload.sessionId;
      }
      animationRenderer.cancelAll();
      if (state.renderer && typeof state.renderer.clear === 'function') {
        state.renderer.clear();
      } else {
        container.innerHTML = '';
      }
    });

    await loadOverlayState();
    global.__lastEventSingleOverlay = state;
    return state;
  }

  global.initSpotlightOverlay = initSpotlightOverlay;
  global.initLastEventOverlay = initSpotlightOverlay;

  if (typeof window !== 'undefined') {
    window.initSpotlightOverlay = initSpotlightOverlay;
    window.initLastEventOverlay = initSpotlightOverlay;
    const script = document.currentScript;
    const overlayType = script?.dataset?.overlayType;
    if (overlayType) {
      initSpotlightOverlay(overlayType);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
