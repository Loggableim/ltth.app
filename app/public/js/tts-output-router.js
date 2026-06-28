(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TTSOutputRouter = api.createTTSOutputRouter();
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  async function defaultLoadConfig() {
    const response = await fetch('/api/animazingpal/live-host/config');
    if (!response.ok) throw new Error(`Audio routing config failed: HTTP ${response.status}`);
    const payload = await response.json();
    return payload.config || {};
  }

  function createTTSOutputRouter(options = {}) {
    const loadConfig = options.loadConfig || defaultLoadConfig;
    let cachedConfig = null;
    let cacheTime = 0;
    const cacheTtlMs = options.cacheTtlMs ?? 5000;

    async function getConfig(force = false) {
      if (!force && cachedConfig && Date.now() - cacheTime < cacheTtlMs) return cachedConfig;
      cachedConfig = await loadConfig();
      cacheTime = Date.now();
      return cachedConfig;
    }

    async function routeAudioElement(audio, force = false) {
      if (!audio) return { routed: false, reason: 'audio_element_missing' };
      const config = await getConfig(force);
      const animazeConfig = config.animaze || {};
      const audioConfig = config.audio || {};
      const deviceId = animazeConfig.audioOutputDeviceId || animazeConfig.outputDeviceId || audioConfig.outputDeviceId || '';
      const fallback = audioConfig.missingDeviceBehavior || 'mute';

      if (!deviceId) {
        audio.muted = false;
        return { routed: true, deviceId: '', fallback: 'default' };
      }

      if (deviceId.startsWith('system:')) {
        audio.muted = false;
        return { routed: false, deviceId, fallback: 'default', reason: 'system_output_requires_default_device' };
      }

      if (typeof audio.setSinkId !== 'function') {
        if (fallback === 'error') throw new Error('setSinkId is not supported by this browser');
        if (fallback === 'default') {
          audio.muted = false;
          return { routed: false, deviceId, fallback: 'default', reason: 'setSinkId_unsupported' };
        }
        audio.muted = true;
        return { routed: false, deviceId, fallback: 'mute', reason: 'setSinkId_unsupported' };
      }

      try {
        await audio.setSinkId(deviceId);
        audio.muted = false;
        return { routed: true, deviceId };
      } catch (error) {
        if (fallback === 'error') throw error;
        if (fallback === 'default') {
          await audio.setSinkId('');
          audio.muted = false;
          return { routed: false, deviceId, fallback: 'default', reason: error.message };
        }
        audio.muted = true;
        return { routed: false, deviceId, fallback: 'mute', reason: error.message };
      }
    }

    async function playMonitor(audio, force = false) {
      if (!audio || typeof audio.cloneNode !== 'function') return { playing: false, reason: 'audio_element_missing' };
      const config = await getConfig(force);
      const audioConfig = config.audio || {};
      if (!audioConfig.monitoringEnabled || !audioConfig.outputDeviceId) {
        return { playing: false, reason: 'monitoring_disabled' };
      }

      const monitor = audio.cloneNode(true);
      monitor.volume = Math.min(1, Math.max(0, Number(audio.volume || 0) * (Number(audioConfig.monitoringVolume ?? 30) / 100)));
      if (typeof monitor.setSinkId === 'function') await monitor.setSinkId('');
      await monitor.play();
      return { playing: true, monitor };
    }

    return { getConfig, routeAudioElement, playMonitor, refresh: () => getConfig(true) };
  }

  return { createTTSOutputRouter };
});
