(function registerWebGPUEffectsEngine(root, factory) {
  const dependencies = {
    AdaptiveQualityController: root?.VisualFxAdaptiveQuality?.AdaptiveQualityController,
    GPUResourceArena: root?.VisualFxGPUResources,
    effectPipelines: root?.VisualFxEffectPipelines,
    HDRPostProcessor: root?.VisualFxHDRPostProcessor
  };
  if (typeof module !== 'undefined' && module.exports) {
    dependencies.AdaptiveQualityController = require('./adaptive-quality').AdaptiveQualityController;
    dependencies.GPUResourceArena = require('./gpu-resources');
    dependencies.effectPipelines = require('./effect-pipelines');
    dependencies.HDRPostProcessor = require('./hdr-post-processor');
  }
  const Engine = factory(root, dependencies);
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  if (root) root.WebGPUVisualFxEngine = Engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEngine(root, dependencies) {
  const EFFECT_IDS = Object.freeze({ flames: 0, particles: 1, energy: 2, lightning: 3 });
  const STYLE_IDS = Object.freeze({ realistic: 0, neon: 1, hybrid: 2 });
  const FRAME_MODE_IDS = Object.freeze({ bottom: 0, top: 1, sides: 2, all: 3 });

  class WebGPUVisualFxEngine {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.onStatus = options.onStatus || (() => {});
      this.config = {
        renderer: 'webgpu',
        effectType: 'flames',
        visualStyle: 'hybrid',
        qualityMode: 'obs-safe',
        frameMode: 'bottom',
        frameThickness: 150,
        framePositions: [{ x: 0, y: 0, width: 100, height: 100 }],
        flameColor: '#ff6600',
        backgroundTint: '#000000',
        flameIntensity: 1.3,
        flameSpeed: 0.5,
        bloomIntensity: 0.78,
        bloomThreshold: 0.58,
        ...options.config
      };
      this.adapter = null;
      this.device = null;
      this.context = null;
      this.format = null;
      this.resources = null;
      this.buffers = null;
      this.pipelines = null;
      this.bindGroups = null;
      this.post = null;
      this.quality = new dependencies.AdaptiveQualityController(this.config.qualityMode);
      this.activeTriggers = [];
      this.running = false;
      this.destroyed = false;
      this.recoveryAttempted = false;
      this.frameHandle = null;
      this.startedAt = 0;
      this.lastFrameAt = 0;
      this.frameCount = 0;
      this.frameSamples = [];
      this.metrics = {
        backend: 'webgpu',
        state: 'initializing',
        fps: 0,
        cpuFrameTimeMs: 0,
        gpuFrameTimeMs: null,
        adapter: null
      };
      this.boundFrame = time => this._frame(time);
    }

    async init() {
      this.destroyed = false;
      this._status('initializing');
      if (!root.navigator?.gpu) {
        this._status('unsupported', { reason: 'navigator.gpu is unavailable' });
        return false;
      }
      try {
        this.adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!this.adapter) throw new Error('No WebGPU adapter available');
        this.device = await this.adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu');
        if (!this.context) throw new Error('WebGPU canvas context is unavailable');
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
          device: this.device,
          format: this.format,
          alphaMode: 'premultiplied'
        });
        this.resources?.destroy?.();
        this.resources = new dependencies.GPUResourceArena(this.device);
        this.resize(true);
        await this._createRenderer();
        await this._readAdapterInfo();
        this._watchDevice();
        this.startedAt = root.performance?.now?.() || Date.now();
        this.lastFrameAt = this.startedAt;
        this.running = true;
        this._status('ready');
        if (typeof root.requestAnimationFrame === 'function') {
          this.frameHandle = root.requestAnimationFrame(this.boundFrame);
        }
        return true;
      } catch (error) {
        this.running = false;
        this._status('error', { reason: error.message });
        return false;
      }
    }

    async _createRenderer() {
      const state = this.quality.getState();
      this.buffers = this.resources.createSimulationBuffers(state);
      this.pipelines = await dependencies.effectPipelines.createEffectPipelines(this.device);
      this.bindGroups = {
        simulateField: this._createBindGroup(this.pipelines.simulateField, [[0, this.buffers.uniforms], [1, this.buffers.field]]),
        updateParticles: this._createBindGroup(this.pipelines.updateParticles, [[0, this.buffers.uniforms], [2, this.buffers.particles]]),
        buildLightning: this._createBindGroup(this.pipelines.buildLightning, [[0, this.buffers.uniforms], [3, this.buffers.lightning]]),
        scene: this._createBindGroup(this.pipelines.scene, [[0, this.buffers.uniforms], [1, this.buffers.field]]),
        particles: this._createBindGroup(this.pipelines.particles, [[0, this.buffers.uniforms], [2, this.buffers.particles]])
      };
      this.post = new dependencies.HDRPostProcessor(this.device, this.format, this.resources);
      this.post.resize(this.canvas.width, this.canvas.height, state.bloomLevels);
    }

    _createBindGroup(pipeline, bindings) {
      return this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: bindings.map(([binding, buffer]) => ({ binding, resource: { buffer } }))
      });
    }

    updateConfig(config = {}) {
      const previousProfile = this.config.qualityMode;
      this.config = {
        ...this.config,
        ...config,
        renderer: 'webgpu',
        effectType: EFFECT_IDS[config.effectType] === undefined ? this.config.effectType : config.effectType,
        visualStyle: STYLE_IDS[config.visualStyle] === undefined ? this.config.visualStyle : config.visualStyle
      };
      if (previousProfile !== this.config.qualityMode) {
        this.quality = new dependencies.AdaptiveQualityController(this.config.qualityMode);
      }
    }

    handleTrigger(trigger = {}) {
      if (!trigger || typeof trigger !== 'object') return false;
      if (trigger.type === 'clear') {
        this.clearTriggers();
        return true;
      }
      const duration = Math.max(100, Math.min(30000, Number(trigger.duration) || 5000));
      const entry = {
        ...trigger,
        id: trigger.id ?? `${Date.now()}-${this.activeTriggers.length}`,
        startedAt: Date.now(),
        endsAt: Date.now() + duration
      };
      this.activeTriggers.push(entry);
      if (EFFECT_IDS[trigger.effect] !== undefined) this.config.effectType = trigger.effect;
      if (typeof trigger.color === 'string') this.config.flameColor = trigger.color;
      return true;
    }

    clearTriggers() {
      this.activeTriggers = [];
    }

    getMetrics() {
      const quality = this.quality.getState();
      return {
        ...this.metrics,
        backend: 'webgpu',
        effectType: this.config.effectType,
        visualStyle: this.config.visualStyle,
        qualityMode: this.config.qualityMode,
        renderScale: quality.renderScale,
        budgets: {
          maxParticles: quality.maxParticles,
          fieldResolution: quality.fieldResolution,
          bloomLevels: quality.bloomLevels,
          lightningBranches: quality.lightningBranches
        }
      };
    }

    resize(force = false) {
      const dimensions = this._configuredDimensions();
      const quality = this.quality.getState();
      const width = Math.max(1, Math.round(dimensions.width * quality.renderScale));
      const height = Math.max(1, Math.round(dimensions.height * quality.renderScale));
      if (!force && this.canvas.width === width && this.canvas.height === height) return false;
      this.canvas.style && (this.canvas.style.width = '100%');
      this.canvas.style && (this.canvas.style.height = '100%');
      this.canvas.width = width;
      this.canvas.height = height;
      this.post?.resize(width, height, quality.bloomLevels);
      return true;
    }

    _configuredDimensions() {
      const presets = {
        'tiktok-portrait': [720, 1280], 'tiktok-landscape': [1280, 720],
        'hd-portrait': [1080, 1920], 'hd-landscape': [1920, 1080],
        '2k-portrait': [1440, 2560], '2k-landscape': [2560, 1440],
        '4k-portrait': [2160, 3840], '4k-landscape': [3840, 2160]
      };
      const preset = presets[this.config.resolutionPreset];
      if (preset) return { width: preset[0], height: preset[1] };
      if (this.config.resolutionPreset === 'custom') {
        return {
          width: Math.max(160, Number(this.config.customWidth) || 1920),
          height: Math.max(160, Number(this.config.customHeight) || 1080)
        };
      }
      return {
        width: Math.max(1, this.canvas.clientWidth || 1920),
        height: Math.max(1, this.canvas.clientHeight || 1080)
      };
    }

    _frame(now) {
      if (!this.running || this.destroyed) return;
      const started = root.performance?.now?.() || Date.now();
      const deltaMs = Math.min(100, Math.max(0.1, now - this.lastFrameAt));
      this.lastFrameAt = now;
      this._expireTriggers();
      const beforeScale = this.quality.renderScale;
      this.quality.recordFrame(deltaMs);
      if (beforeScale !== this.quality.renderScale) this.resize(true);
      this._writeUniforms(now, deltaMs / 1000);
      this._encodeFrame();
      const ended = root.performance?.now?.() || Date.now();
      this._updateMetrics(deltaMs, ended - started);
      this.frameHandle = root.requestAnimationFrame(this.boundFrame);
    }

    _encodeFrame() {
      const state = this.quality.getState();
      const encoder = this.device.createCommandEncoder({ label: 'visual-fx-frame' });
      const compute = encoder.beginComputePass({ label: 'visual-fx-compute' });
      compute.setPipeline(this.pipelines.simulateField);
      compute.setBindGroup(0, this.bindGroups.simulateField);
      compute.dispatchWorkgroups(Math.ceil(state.fieldResolution / 8), Math.ceil(state.fieldResolution / 8));
      compute.setPipeline(this.pipelines.updateParticles);
      compute.setBindGroup(0, this.bindGroups.updateParticles);
      compute.dispatchWorkgroups(Math.ceil(state.maxParticles / 64));
      compute.setPipeline(this.pipelines.buildLightning);
      compute.setBindGroup(0, this.bindGroups.buildLightning);
      compute.dispatchWorkgroups(Math.ceil(state.lightningBranches / 64));
      compute.end();

      const scene = encoder.beginRenderPass({
        label: 'visual-fx-hdr-scene',
        colorAttachments: [{
          view: this.post.sceneView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      scene.setPipeline(this.pipelines.scene);
      scene.setBindGroup(0, this.bindGroups.scene);
      scene.draw(3);
      scene.setPipeline(this.pipelines.particles);
      scene.setBindGroup(0, this.bindGroups.particles);
      scene.drawIndirect(this.buffers.particleIndirect, 0);
      scene.end();

      this.post.encode(encoder, this.context.getCurrentTexture().createView(), this.config);
      this.device.queue.submit([encoder.finish()]);
    }

    _writeUniforms(now, deltaSeconds) {
      const state = this.quality.getState();
      const frame = this.config.framePositions?.[0] || { x: 0, y: 0, width: 100, height: 100 };
      const color = this._hex(this.config.flameColor, [1, 0.4, 0, 1]);
      const background = this._hex(this.config.backgroundTint, [0, 0, 0, 0]);
      const pulse = Math.min(2, this.activeTriggers.reduce((sum, trigger) => sum + (Number(trigger.intensityBoost ?? trigger.amount ?? trigger.intensity) || 0.25), 0));
      const bytes = new ArrayBuffer(128);
      const view = new DataView(bytes);
      const f32 = (offset, value) => view.setFloat32(offset, Number(value) || 0, true);
      const u32 = (offset, value) => view.setUint32(offset, Math.max(0, Number(value) || 0), true);
      f32(0, this.canvas.width); f32(4, this.canvas.height);
      f32(8, state.fieldResolution); f32(12, state.fieldResolution);
      f32(16, now / 1000); f32(20, deltaSeconds);
      u32(24, EFFECT_IDS[this.config.effectType] ?? 0); u32(28, STYLE_IDS[this.config.visualStyle] ?? 2);
      u32(32, FRAME_MODE_IDS[this.config.frameMode] ?? 0); f32(36, this.config.frameThickness);
      f32(40, this.config.flameIntensity); f32(44, this.config.flameSpeed);
      f32(48, state.renderScale); f32(52, pulse);
      color.forEach((value, index) => f32(64 + index * 4, value));
      background.forEach((value, index) => f32(80 + index * 4, value));
      [frame.x / 100, frame.y / 100, frame.width / 100, frame.height / 100]
        .forEach((value, index) => f32(96 + index * 4, value));
      u32(112, state.maxParticles); u32(116, state.lightningBranches);
      u32(120, state.bloomLevels); u32(124, this.activeTriggers.length);
      this.device.queue.writeBuffer(this.buffers.uniforms, 0, bytes);
    }

    _expireTriggers() {
      const now = Date.now();
      this.activeTriggers = this.activeTriggers.filter(trigger => trigger.endsAt > now || trigger.permanent === true);
    }

    _updateMetrics(frameTimeMs, cpuFrameTimeMs) {
      this.frameCount += 1;
      this.frameSamples.push(frameTimeMs);
      if (this.frameSamples.length > 120) this.frameSamples.shift();
      const average = this.frameSamples.reduce((sum, value) => sum + value, 0) / this.frameSamples.length;
      const sorted = [...this.frameSamples].sort((left, right) => left - right);
      const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
      const slowFrameRatio = this.frameSamples.filter(value => value > 25).length / this.frameSamples.length;
      this.metrics = {
        ...this.metrics,
        state: 'ready',
        fps: average > 0 ? Math.round(10000 / average) / 10 : 0,
        cpuFrameTimeMs: Math.round(cpuFrameTimeMs * 100) / 100,
        p95FrameTimeMs: Math.round(sorted[p95Index] * 100) / 100,
        slowFrameRatio: Math.round(slowFrameRatio * 1000) / 1000,
        frameCount: this.frameCount
      };
      if (this.frameCount % 30 === 0) this._status('ready');
    }

    async _readAdapterInfo() {
      try {
        const info = typeof this.adapter.requestAdapterInfo === 'function'
          ? await this.adapter.requestAdapterInfo()
          : this.adapter.info;
        this.metrics.adapter = info ? {
          vendor: info.vendor || 'unknown',
          architecture: info.architecture || 'unknown',
          device: info.device || 'unknown',
          description: info.description || 'WebGPU adapter'
        } : { description: 'WebGPU adapter' };
      } catch (_) {
        this.metrics.adapter = { description: 'WebGPU adapter' };
      }
    }

    _watchDevice() {
      this.device.addEventListener?.('uncapturederror', event => {
        this._status('error', { reason: event.error?.message || 'Uncaptured WebGPU error' });
      });
      this.device.lost.then(info => this._handleDeviceLost(info));
    }

    async _handleDeviceLost(info = {}) {
      if (this.destroyed) return;
      this.running = false;
      this._status('device-lost', { reason: info.message || 'WebGPU device lost' });
      if (this.recoveryAttempted) {
        this._status('error', { reason: info.message || 'WebGPU recovery failed' });
        return;
      }
      this.recoveryAttempted = true;
      this._status('recovering');
      this.resources?.destroy?.();
      this.post?.destroy?.();
      const recovered = await this.init();
      if (!recovered) this._status('error', { reason: info.message || 'WebGPU recovery failed' });
    }

    _hex(value, fallback) {
      const match = /^#([0-9a-f]{6})$/i.exec(String(value || ''));
      if (!match) return fallback;
      const number = parseInt(match[1], 16);
      return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255, 1];
    }

    _status(state, extra = {}) {
      this.metrics = { ...this.metrics, state, ...extra };
      this.onStatus({ ...this.getMetrics(), state, ...extra });
    }

    destroy() {
      this.destroyed = true;
      this.running = false;
      if (this.frameHandle !== null && root.cancelAnimationFrame) root.cancelAnimationFrame(this.frameHandle);
      this.post?.destroy?.();
      this.resources?.destroy?.();
      this.context?.unconfigure?.();
      this.device?.destroy?.();
      this.activeTriggers = [];
    }
  }

  return WebGPUVisualFxEngine;
});
