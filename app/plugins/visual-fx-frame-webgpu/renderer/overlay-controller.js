(function startVisualFxFrameWebGPU() {
  const debug = new URLSearchParams(window.location.search).get('debug') === 'true';
  const debugElement = document.getElementById('webgpu-debug');
  const socket = typeof io === 'function' ? io() : null;
  let engine = null;

  function report(status) {
    socket?.emit('visual-fx-frame-webgpu:renderer-status', status);
    if (debug && debugElement) {
      debugElement.textContent = `${status.state}${status.reason ? `: ${status.reason}` : ''}`;
      debugElement.classList.add('visible');
    }
  }

  async function boot() {
    const response = await fetch('/api/visual-fx-frame-webgpu/config');
    const payload = response.ok ? await response.json() : {};
    const config = payload.config || window.VISUAL_FX_DEFAULT_CONFIG || {};
    engine = new window.WebGPUVisualFxEngine(document.getElementById('visualFxCanvas'), { config, onStatus: report });
    await engine.init();
    socket?.on('visual-fx-frame-webgpu:config-update', data => engine?.updateConfig(data?.config || {}));
    socket?.on('visual-fx-frame-webgpu:trigger', data => engine?.handleTrigger(data));
    socket?.on('visual-fx-frame-webgpu:clear-triggers', () => engine?.clearTriggers());
  }

  window.addEventListener('resize', () => engine?.resize());
  window.addEventListener('pagehide', () => engine?.destroy());
  boot().catch(error => report({ state: 'error', reason: error.message }));
})();
