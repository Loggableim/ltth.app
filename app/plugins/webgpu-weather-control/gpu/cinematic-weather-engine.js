(function cinematicWeatherModule(root, factory) {
  const exported = factory(root.WebGPUWeatherFramegraph);
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  root.CinematicWeatherEngine = exported.CinematicWeatherEngine;
})(globalThis, (BrowserFramegraph) => {
  'use strict';

  const framegraphModule = typeof require === 'function' ? require('./weather-framegraph') : { WeatherFramegraph: BrowserFramegraph };
  const { WeatherFramegraph } = framegraphModule;
  const WEATHER_EFFECTS = Object.freeze(['rain', 'snow', 'storm', 'fog', 'thunder', 'sunbeam', 'glitchclouds', 'aurora', 'fireflies', 'meteors', 'sakura', 'embers', 'heatwave']);
  const PARTICLE_EFFECTS = new Set(['rain', 'snow', 'storm', 'fireflies', 'meteors', 'sakura', 'embers']);
  const QUALITY_PRESETS = Object.freeze({
    low: { particleBudget: 1200, volumetricSamples: 8, bloomPasses: 1, temporalStability: 0.35 },
    medium: { particleBudget: 2800, volumetricSamples: 16, bloomPasses: 2, temporalStability: 0.55 },
    high: { particleBudget: 5200, volumetricSamples: 28, bloomPasses: 3, temporalStability: 0.72 },
    ultra: { particleBudget: 9000, volumetricSamples: 48, bloomPasses: 5, temporalStability: 0.88 },
    auto: { particleBudget: 4200, volumetricSamples: 24, bloomPasses: 3, temporalStability: 0.68 }
  });
  const TARGET_FRAME_MS = 16.67;

  function cloneQuality(name) { return { ...QUALITY_PRESETS[name] || QUALITY_PRESETS.auto }; }
  function clamp(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; }

  class CinematicWeatherEngine {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.gpu = options.gpu || globalThis.navigator?.gpu || null;
      this.requestAnimationFrame = options.requestAnimationFrame || globalThis.requestAnimationFrame || (() => 0);
      this.cancelAnimationFrame = options.cancelAnimationFrame || globalThis.cancelAnimationFrame || (() => {});
      this.onDiagnostic = options.onDiagnostic || (() => {});
      this.effects = new Map();
      this.state = 'idle';
      this.transparent = true;
      this.qualityName = 'auto';
      this.quality = cloneQuality('auto');
      this.adaptiveQuality = true;
      this.metrics = { fps: 0, frameMs: 0, gpuFrameMs: 0, gpuTimeSource: 'queue-latency', activeParticles: 0, state: this.state, transparent: this.transparent, resolution: { width: 1, height: 1 }, quality: this.quality };
      this.framegraph = null;
      this.device = null;
      this.context = null;
      this.adapter = null;
      this.frameHandle = 0;
      this.lastFrameAt = 0;
      this.lastQueueAt = 0;
    }

    async init() {
      if (!this.gpu || !this.canvas?.getContext) return this.fail('unsupported', 'WebGPU is unavailable');
      try {
        this.adapter = await this.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!this.adapter) return this.fail('unsupported', 'No WebGPU adapter');
        const timestampEnabled = this.adapter.features?.has('timestamp-query') === true;
        this.device = await this.adapter.requestDevice({ requiredFeatures: timestampEnabled ? ['timestamp-query'] : [] });
        this.context = this.canvas.getContext('webgpu');
        if (!this.context) return this.fail('unsupported', 'No WebGPU canvas context');
        this.format = this.gpu.getPreferredCanvasFormat();
        this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });
        this.framegraph = new WeatherFramegraph(this.device, this.format, { timestampEnabled, capacity: QUALITY_PRESETS.ultra.particleBudget });
        this.framegraph.initialize();
        this.resize(this.canvas.clientWidth || this.canvas.width || 1920, this.canvas.clientHeight || this.canvas.height || 1080);
        this.state = 'ready'; this.transparent = false; this.metrics.gpuTimeSource = timestampEnabled ? 'timestamp-query' : 'queue-latency';
        this.device.lost?.then((info) => this.handleDeviceLost(info?.message || 'WebGPU device lost')).catch((error) => this.fail('error', error?.message || String(error)));
        this.publishDiagnostic('ready');
        return true;
      } catch (error) { return this.fail('error', error?.message || String(error)); }
    }

    fail(state, reason) { this.state = state; this.transparent = true; this.destroyGpuResources(); this.metrics.state = state; this.metrics.transparent = true; this.metrics.reason = reason; this.publishDiagnostic(reason); return false; }
    handleDeviceLost(reason) { this.fail('device-lost', reason || 'WebGPU device lost'); }

    destroyGpuResources() {
      this.cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
      this.framegraph?.destroy(); this.framegraph = null;
      this.context?.unconfigure?.();
      this.device = null; this.context = null;
    }

    destroy() { this.state = 'destroyed'; this.transparent = true; this.destroyGpuResources(); this.publishDiagnostic('destroyed'); }

    resize(width, height) {
      const w = Math.min(1920, Math.max(1, Math.floor(width || 1)));
      const h = Math.min(1080, Math.max(1, Math.floor(height || 1)));
      if (this.canvas) { this.canvas.width = w; this.canvas.height = h; }
      this.framegraph?.resize(w, h);
      this.metrics.resolution = { width: w, height: h };
    }

    setQuality(name) { this.qualityName = QUALITY_PRESETS[name] ? name : 'auto'; this.quality = cloneQuality(this.qualityName); this.metrics.quality = { ...this.quality }; this.publishDiagnostic('quality-changed'); }

    recordFrameTime(frameMs) {
      this.metrics.frameMs = clamp(frameMs, 0, 1000, 0);
      this.metrics.fps = this.metrics.frameMs ? 1000 / this.metrics.frameMs : 0;
      if (this.qualityName !== 'auto' || !this.adaptiveQuality) return;
      const measuredFrameMs = Math.max(this.metrics.frameMs, this.metrics.gpuFrameMs || 0);
      const scale = measuredFrameMs > TARGET_FRAME_MS ? 0.82 : measuredFrameMs < TARGET_FRAME_MS * 0.7 ? 1.08 : 1;
      if (scale !== 1) {
        this.quality.particleBudget = Math.round(clamp(this.quality.particleBudget * scale, QUALITY_PRESETS.low.particleBudget, QUALITY_PRESETS.ultra.particleBudget, this.quality.particleBudget));
        this.quality.volumetricSamples = Math.round(clamp(this.quality.volumetricSamples * scale, QUALITY_PRESETS.low.volumetricSamples, QUALITY_PRESETS.ultra.volumetricSamples, this.quality.volumetricSamples));
        this.quality.bloomPasses = Math.round(clamp(this.quality.bloomPasses * scale, QUALITY_PRESETS.low.bloomPasses, QUALITY_PRESETS.ultra.bloomPasses, this.quality.bloomPasses));
        this.quality.temporalStability = clamp(this.quality.temporalStability * scale, QUALITY_PRESETS.low.temporalStability, QUALITY_PRESETS.ultra.temporalStability, this.quality.temporalStability);
        this.metrics.quality = { ...this.quality };
      }
    }

    trigger(event = {}) {
      if (!WEATHER_EFFECTS.includes(event.action)) return false;
      const effect = {
        action: event.action, intensity: clamp(event.intensity, 0, 1, 0.5), duration: clamp(event.duration, 0, 600000, 10000), permanent: event.permanent === true,
        layer: clamp(event.layer, 0, 100, 50), opacity: clamp(event.opacity, 0, 1, 1), particleScale: clamp(event.particleScale, 0.25, 2, 1), wind: clamp(event.wind, -1, 1, 0), directionDeg: clamp(event.directionDeg, -180, 180, 0),
        fogColor: event.fogColor || 'default', colorTemperature: event.colorTemperature || 'default', glitchRgbShift: event.glitchRgbShift === true, glitchDisplacement: event.glitchDisplacement === true, glitchScanlines: event.glitchScanlines === true, glitchNoise: event.glitchNoise === true, glitchBlocks: event.glitchBlocks === true, glitchChromaticAberration: event.glitchChromaticAberration === true, glitchIntensity: clamp(event.glitchIntensity, 0, 3, 1), effectIndex: WEATHER_EFFECTS.indexOf(event.action), startedAt: performance.now ? performance.now() : Date.now()
      };
      this.effects.set(effect.action, effect);
      this.metrics.activeParticles = [...this.effects.values()].filter((item) => PARTICLE_EFFECTS.has(item.action)).length * Math.round(180 * effect.intensity * effect.particleScale);
      this.publishDiagnostic('effect-triggered');
      return true;
    }

    stop(action) { if (action) this.effects.delete(action); else this.effects.clear(); this.metrics.activeParticles = 0; this.publishDiagnostic('effect-stopped'); }
    applyConfig(config = {}) { this.adaptiveQuality = config.adaptiveQuality !== false; this.setQuality(config.qualityPreset || this.qualityName); Object.entries(config.effects || {}).forEach(([action, effect]) => { if (config.enabled !== false && effect.enabled !== false && effect.permanent) this.trigger({ action, ...effect, permanent: true }); }); }
    getEffectState() { return [...this.effects.values()].sort((a, b) => a.layer - b.layer); }

    render(frameMs = TARGET_FRAME_MS) {
      if (this.state !== 'ready' || !this.framegraph || !this.context) return;
      this.recordFrameTime(frameMs);
      const now = performance.now ? performance.now() : Date.now();
      const alive = this.getEffectState().filter((effect) => effect.permanent || now - effect.startedAt < effect.duration);
      this.effects = new Map(alive.map((effect) => [effect.action, effect]));
      this.framegraph.uploadEffectState(alive, this.quality, now / 1000, Math.max(0, frameMs) / 1000);
      const encoder = this.device.createCommandEncoder({ label: 'weather-cinematic-frame' });
      this.framegraph.encode(encoder, this.context.getCurrentTexture().createView(), this.metrics);
      this.device.queue.submit([encoder.finish()]);
      if (this.metrics.gpuTimeSource === 'timestamp-query') this.measureTimestamp();
      else this.measureQueueLatency();
      this.publishDiagnostic('frame');
    }

    async measureTimestamp() { const value = await this.framegraph.readTimestampMs(); if (value !== null) this.metrics.gpuFrameMs = value; }
    async measureQueueLatency() { const started = performance.now ? performance.now() : Date.now(); await this.device.queue.onSubmittedWorkDone?.(); this.metrics.gpuFrameMs = Math.max(0, (performance.now ? performance.now() : Date.now()) - started); }
    getMetrics() { return { ...this.metrics, quality: { ...this.metrics.quality }, resolution: { ...this.metrics.resolution } }; }
    publishDiagnostic(reason) { this.onDiagnostic({ ...this.getMetrics(), reason, effects: this.getEffectState().map((effect) => effect.action) }); }
  }

  return { CinematicWeatherEngine, WEATHER_EFFECTS, QUALITY_PRESETS, TARGET_FRAME_MS };
});
