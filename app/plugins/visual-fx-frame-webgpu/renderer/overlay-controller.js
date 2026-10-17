(function startVisualFxFrameWebGPU() {
  const debug = new URLSearchParams(window.location.search).get('debug') === 'true';
  const debugElement = document.getElementById('webgpu-debug');
  const socket = typeof io === 'function' ? io() : null;
  const socketHandlers = [];
  const pendingEvents = [];
  let engine = null;
  let disposed = false;
  let bootGeneration = 0;
  let configRequestGeneration = 0;
  let publicStateRevision = 0;
  let connectionsBeforeReady = 0;

  function report(status) {
    if (disposed) return;
    socket?.emit('visual-fx-frame-webgpu:renderer-status', status);
    if (debug && debugElement) {
      debugElement.textContent = `${status.state}${status.reason ? `: ${status.reason}` : ''}`;
      debugElement.classList.add('visible');
    }
  }

  function registerSocketHandler(eventName, handler, updatesPublicState = false) {
    if (!socket) return;
    const guardedHandler = payload => {
      if (disposed) return;
      if (updatesPublicState) {
        publicStateRevision++;
        configRequestGeneration++;
      }
      handler(payload);
    };
    socket.on(eventName, guardedHandler);
    socketHandlers.push([eventName, guardedHandler]);
  }

  function applyOrQueue(eventName, payload) {
    if (!engine) {
      if (eventName === 'clear-triggers') {
        pendingEvents.length = 0;
      } else {
        pendingEvents.push([eventName, payload]);
        if (pendingEvents.length > 64) pendingEvents.shift();
      }
      return;
    }
    if (eventName === 'config-update') engine.updateConfig(payload?.config || {});
    else if (eventName === 'trigger') engine.handleTrigger(payload);
    else if (eventName === 'clear-triggers') engine.clearTriggers();
  }

  async function loadConfig(generation, requestGeneration = null) {
    const expectedRequest = requestGeneration ?? ++configRequestGeneration;
    const expectedRevision = publicStateRevision;
    const response = await fetch('/api/visual-fx-frame-webgpu/config');
    const payload = response.ok ? await response.json() : {};
    if (
      disposed ||
      generation !== bootGeneration ||
      expectedRequest !== configRequestGeneration ||
      expectedRevision !== publicStateRevision
    ) return null;
    return payload.config || window.VISUAL_FX_DEFAULT_CONFIG || {};
  }

  async function refreshConfig() {
    if (disposed || !engine) return;
    const generation = bootGeneration;
    const requestGeneration = ++configRequestGeneration;
    try {
      const config = await loadConfig(generation, requestGeneration);
      if (!disposed && engine && config) engine.updateConfig(config);
    } catch (error) {
      if (!disposed) report({ state:'error', reason:error.message });
    }
  }

  function handleResize() {
    if (!disposed) engine?.resize();
  }

  function handlePageHide(event) {
    if (event?.persisted === true || disposed) return;
    disposed = true;
    bootGeneration++;
    configRequestGeneration++;
    socketHandlers.forEach(([eventName, handler]) => socket?.off?.(eventName, handler));
    socketHandlers.length = 0;
    pendingEvents.length = 0;
    socket?.disconnect?.();
    engine?.destroy();
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('pagehide', handlePageHide);
    window.removeEventListener('pageshow', handlePageShow);
  }

  function handlePageShow(event) {
    if (event?.persisted !== true || disposed || !socket?.connected) return;
    void refreshConfig();
  }

  registerSocketHandler('connect', () => {
    if (!engine) connectionsBeforeReady++;
    else void refreshConfig();
  });
  registerSocketHandler('visual-fx-frame-webgpu:config-update', data => {
    applyOrQueue('config-update', data);
  }, true);
  registerSocketHandler('visual-fx-frame-webgpu:trigger', data => {
    applyOrQueue('trigger', data);
  });
  registerSocketHandler('visual-fx-frame-webgpu:clear-triggers', () => {
    applyOrQueue('clear-triggers');
  });

  async function boot() {
    const generation = ++bootGeneration;
    let config = await loadConfig(generation);
    if (disposed || generation !== bootGeneration) return;
    if (!config) config = window.VISUAL_FX_DEFAULT_CONFIG || {};
    engine = new window.WebGPUVisualFxEngine(
      document.getElementById('visualFxCanvas'),
      { config, onStatus:report }
    );
    const createdEngine = engine;
    await createdEngine.init();
    if (disposed || generation !== bootGeneration || engine !== createdEngine) {
      createdEngine.destroy();
      return;
    }
    pendingEvents.splice(0).forEach(([eventName, payload]) => {
      if (eventName === 'config-update') createdEngine.updateConfig(payload?.config || {});
      else if (eventName === 'trigger') createdEngine.handleTrigger(payload);
    });
    if (connectionsBeforeReady > 0 && socket?.connected) {
      connectionsBeforeReady = 0;
      void refreshConfig();
    }
  }

  window.addEventListener('resize', handleResize);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('pageshow', handlePageShow);
  void boot().catch(error => report({ state:'error', reason:error.message }));
})();
