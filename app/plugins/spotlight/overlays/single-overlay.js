/**
 * Shared Spotlight overlay client for single event overlays.
 */
(function initSharedSingleOverlay(global) {
  async function initSpotlightOverlay(overlayType) {
    if (!overlayType) {
      throw new Error('Missing Spotlight overlay type');
    }

    if (global.i18n?.ready) await global.i18n.ready;

    const container = document.getElementById('overlay-container');
    const pageWindow = global.window || global;
    const animationRegistry = new AnimationRegistry();
    const animationRenderer = new AnimationRenderer(animationRegistry);
    const state = {
      overlayType,
      container,
      settings: {},
      renderer: null,
      socket: null,
      refreshTimer: null,
      overlaySessionToken: null,
      requestGeneration: 0,
      destroyed: false
    };
    const socketHandlers = new Map();

    function isActive(requestGeneration = state.requestGeneration) {
      return !state.destroyed && requestGeneration === state.requestGeneration;
    }

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
        if (!isActive(requestGeneration)) return;
        if (!response.ok) throw new Error(`Last-user request failed (${response.status})`);
        const data = await response.json();
        if (isActive(requestGeneration) && data.success && isCurrentResponse(data, requestGeneration)) {
          await updateDisplay(data.user || null, false);
        }
      } catch (error) {
        if (isActive()) console.error('Error refreshing data:', error);
      }
    }

    function isCurrentResponse(data, requestGeneration) {
      if (!isActive(requestGeneration)) {
        return false;
      }

      if (data.overlaySessionToken && state.overlaySessionToken && data.overlaySessionToken !== state.overlaySessionToken) {
        return false;
      }

      if (data.overlaySessionToken) {
        state.overlaySessionToken = data.overlaySessionToken;
      }

      return true;
    }

    function isCurrentUser(userData) {
      if (!isActive()) return false;
      if (!userData || !userData.overlaySessionToken || !state.overlaySessionToken) {
        return true;
      }

      return userData.overlaySessionToken === state.overlaySessionToken;
    }

    function startRefreshTimer() {
      stopRefreshTimer();
      if (!isActive()) return;
      const intervalSeconds = Number.parseInt(state.settings.refreshIntervalSeconds, 10);
      if (Number.isFinite(intervalSeconds) && intervalSeconds > 0) {
        state.refreshTimer = setInterval(refreshData, intervalSeconds * 1000);
      }
    }

    async function updateDisplay(userData, animate = true) {
      const requestGeneration = state.requestGeneration;
      if (!isActive(requestGeneration) || !state.renderer) return;

      const displayElement = container.querySelector('.user-display');

      if (animate && displayElement) {
        await animationRenderer.animateOut(
          displayElement,
          state.settings.outAnimationType || 'fade',
          state.settings.animationSpeed || 'medium'
        );
        if (!isActive(requestGeneration)) return;
      }

      await state.renderer.render(userData, false);
      if (!isActive(requestGeneration)) return;

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
        if (!isActive(requestGeneration)) return;
        if (!settingsResponse.ok) throw new Error(`Settings request failed (${settingsResponse.status})`);
        const settingsData = await settingsResponse.json();
        if (!isActive(requestGeneration)) return;
        if (!settingsData?.success || !settingsData.settings || typeof settingsData.settings !== 'object') {
          throw new Error('Settings response was invalid');
        }
        state.settings = settingsData.settings || {};

        if (!state.renderer) {
          state.renderer = new TemplateRenderer(container, state.settings);
        } else {
          state.renderer.updateSettings(state.settings);
        }

        startRefreshTimer();

        const userResponse = await fetch(`/api/lastevent/last/${state.overlayType}`);
        if (!isActive(requestGeneration)) return;
        if (!userResponse.ok) throw new Error(`Last-user request failed (${userResponse.status})`);
        const userData = await userResponse.json();

        if (isActive(requestGeneration) && userData.success && isCurrentResponse(userData, requestGeneration)) {
          await updateDisplay(userData.user || null, false);
        }
      } catch (error) {
        if (isActive()) console.error('Error initializing overlay:', error);
      }
    }

    if (global.i18n?.onLanguageChange) {
      global.i18n.onLanguageChange(() => {
        if (!isActive()) return;
        if (state.renderer?.currentUser) state.renderer.render(state.renderer.currentUser, false);
        else if (state.renderer) state.renderer.render(null, false);
      });
    }

    function bindSocket(eventName, handler) {
      const guardedHandler = (...args) => {
        if (!isActive()) return undefined;
        return handler(...args);
      };
      socketHandlers.set(eventName, guardedHandler);
      state.socket.on(eventName, guardedHandler);
    }

    function cleanup() {
      if (state.destroyed) return;
      state.destroyed = true;
      state.requestGeneration += 1;
      stopRefreshTimer();
      animationRenderer.cancelAll();
      pageWindow.removeEventListener('pagehide', handlePageHide);
      for (const [eventName, handler] of socketHandlers) {
        state.socket.off?.(eventName, handler);
      }
      state.socket.disconnect?.();
    }

    function handlePageHide(event) {
      if (event?.persisted) return;
      cleanup();
    }

    state.socket = io();
    bindSocket('connect', () => {
      console.log('Connected to server');
      loadOverlayState();
    });

    bindSocket('disconnect', () => {
      console.log('Disconnected from server');
      stopRefreshTimer();
    });

    bindSocket(`lastevent.update.${state.overlayType}`, async (userData) => {
      console.log('Received user update:', userData);
      if (!isCurrentUser(userData)) return;
      await updateDisplay(userData);
    });

    bindSocket(`lastevent.settings.${state.overlayType}`, (newSettings) => {
      console.log('Received settings update:', newSettings);
      state.settings = newSettings || {};
      if (state.renderer) {
        state.renderer.updateSettings(state.settings);
      }
      startRefreshTimer();
    });

    bindSocket('lastevent.session.reset', (payload = {}) => {
      console.log('Session reset - clearing overlay');
      state.requestGeneration += 1;
      if (payload.overlaySessionToken) {
        state.overlaySessionToken = payload.overlaySessionToken;
      }
      animationRenderer.cancelAll();
      if (state.renderer && typeof state.renderer.clear === 'function') {
        state.renderer.clear();
      } else {
        container.innerHTML = '';
      }
    });

    pageWindow.addEventListener('pagehide', handlePageHide);

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
