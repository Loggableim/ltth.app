(function attachStreamMonstersEffectsRenderer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersEffectsRenderer = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const SCENE_DURATIONS = Object.freeze({
    spawn: 2200,
    hatch: 2800,
    attack: 1600,
    defense: 1600,
    special: 2200
  });
  const ELEMENT_COLORS = Object.freeze({
    ember: '#ff7043',
    tide: '#45c8ff',
    grove: '#68d391',
    gale: '#a7f3d0',
    volt: '#ffe066',
    lunar: '#c7a4ff'
  });
  const SCENE_CODES = Object.freeze({
    spawn: 1,
    hatch: 2,
    attack: 3,
    defense: 4,
    special: 5
  });
  const CHOREOGRAPHY = Object.freeze({
    spawn: Object.freeze(['element-portal', 'particle-swirl', 'egg-fly-in', 'spring-landing']),
    hatch: Object.freeze(['pulse', 'cracks', 'energy-build', 'flash', 'monster-reveal']),
    attack: Object.freeze(['vfx-trail']),
    defense: Object.freeze(['shield-burst']),
    special: Object.freeze(['element-color-special'])
  });

  const SHADER = `
struct Uniforms {
  time: f32,
  progress: f32,
  scene: f32,
  aspect: f32,
  color: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct Output {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> Output {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(3.0, 1.0)
  );
  var output: Output;
  output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  output.uv = output.position.xy * 0.5 + vec2<f32>(0.5);
  return output;
}

fn ring(point: vec2<f32>, radius: f32, thickness: f32) -> f32 {
  return 1.0 - smoothstep(thickness, thickness + 0.012, abs(length(point) - radius));
}

@fragment
fn fragmentMain(input: Output) -> @location(0) vec4<f32> {
  let centered = vec2<f32>((input.uv.x - 0.5) * u.aspect, input.uv.y - 0.5);
  let angle = atan2(centered.y, centered.x);
  let distance = length(centered);
  let pulse = 0.5 + 0.5 * sin(u.time * 7.0 + angle * 8.0);
  var alpha = ring(centered, 0.12 + u.progress * 0.32, 0.025);
  if (u.scene == 1.0) {
    alpha = max(alpha, (1.0 - smoothstep(0.0, 0.42, distance)) * pulse * (1.0 - u.progress));
  } else if (u.scene == 2.0) {
    alpha = max(alpha, ring(centered, 0.22, 0.018) * (0.4 + pulse * 0.6));
  } else if (u.scene == 3.0) {
    let trail = 1.0 - smoothstep(0.01, 0.08, abs(centered.y - sin(centered.x * 12.0 - u.time * 8.0) * 0.08));
    alpha = trail * smoothstep(-0.5, 0.45, centered.x) * (1.0 - u.progress);
  } else if (u.scene == 4.0) {
    alpha = ring(centered, 0.28, 0.045) * (1.0 - u.progress * 0.45);
  } else if (u.scene == 5.0) {
    alpha = max(alpha, (1.0 - smoothstep(0.05, 0.48, distance)) * (0.25 + pulse * 0.45));
  }
  return vec4<f32>(u.color.rgb, clamp(alpha, 0.0, 0.82) * u.color.a);
}`;

  function colorForElement(element) {
    return ELEMENT_COLORS[String(element || '').trim().toLowerCase()] || '#a984ff';
  }

  function hexColor(value) {
    const match = /^#([a-f0-9]{6})$/i.exec(String(value || ''));
    if (!match) return [0.66, 0.52, 1, 1];
    const numeric = Number.parseInt(match[1], 16);
    return [
      ((numeric >> 16) & 255) / 255,
      ((numeric >> 8) & 255) / 255,
      (numeric & 255) / 255,
      1
    ];
  }

  function sceneChoreography(scene, payload = {}) {
    const normalizedScene = Object.prototype.hasOwnProperty.call(CHOREOGRAPHY, scene) ? scene : 'spawn';
    return {
      scene: normalizedScene,
      steps: [...CHOREOGRAPHY[normalizedScene]],
      vfxKey: payload.vfxKey || payload.skill?.vfxKey || payload.skill?.vfx_key || null,
      element: payload.element || payload.monster?.element || payload.actor?.element || 'Lunar',
      color: colorForElement(payload.element || payload.monster?.element || payload.actor?.element),
      duration: SCENE_DURATIONS[normalizedScene]
    };
  }

  function createEffectsRenderer(options = {}) {
    const canvas = options.canvas || null;
    const navigatorLike = options.navigator || (typeof navigator === 'object' ? navigator : {});
    const mediaQuery = options.matchMedia || (query => (
      typeof matchMedia === 'function' ? matchMedia(query) : { matches: false }
    ));
    const scheduleFrame = options.requestAnimationFrame || (callback => setTimeout(() => callback(Date.now()), 16));
    const cancelFrame = options.cancelAnimationFrame || clearTimeout;
    const now = options.now || (() => (
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
    ));
    const setTimer = options.setTimeout || setTimeout;
    const clearTimer = options.clearTimeout || clearTimeout;
    let rendererMode = 'pending';
    let fallbackReason = null;
    let reducedMotion = false;
    let device = null;
    let context = null;
    let canvas2d = null;
    let pipeline = null;
    let uniformBuffer = null;
    let bindGroup = null;
    let frameHandle = null;
    let activeScene = null;
    let initialization = null;

    function markMode(nextMode, reason = null) {
      rendererMode = nextMode;
      fallbackReason = reason;
      canvas?.classList?.toggle?.('effects-fallback', nextMode === 'fallback');
      if (canvas?.dataset) {
        canvas.dataset.renderer = nextMode;
        if (reason) canvas.dataset.fallbackReason = reason;
      }
    }

    function switchToFallback(reason) {
      if (frameHandle != null) {
        cancelFrame(frameHandle);
        frameHandle = null;
      }
      device = null;
      pipeline = null;
      uniformBuffer = null;
      bindGroup = null;
      try {
        canvas2d = canvas?.getContext?.('2d', { alpha: true }) || null;
      } catch (_) {
        canvas2d = null;
      }
      markMode('fallback', reason);
      if (activeScene) renderFallback(activeScene, Math.min(1, (now() - activeScene.startedAt) / activeScene.duration));
      return rendererMode;
    }

    async function initialize() {
      reducedMotion = Boolean(mediaQuery('(prefers-reduced-motion: reduce)')?.matches);
      if (reducedMotion) return switchToFallback('reduced-motion');
      if (!canvas || !navigatorLike?.gpu?.requestAdapter) return switchToFallback('webgpu-unavailable');
      try {
        const adapter = await navigatorLike.gpu.requestAdapter();
        if (!adapter) return switchToFallback('adapter-unavailable');
        device = await adapter.requestDevice();
        context = canvas.getContext?.('webgpu');
        if (!device || !context) return switchToFallback('context-unavailable');
        const format = navigatorLike.gpu.getPreferredCanvasFormat?.() || 'bgra8unorm';
        context.configure({ device, format, alphaMode: 'premultiplied' });
        const shader = device.createShaderModule({ label: 'Stream Monsters effects shader', code: SHADER });
        pipeline = device.createRenderPipeline({
          label: 'Stream Monsters transparent effects pipeline',
          layout: 'auto',
          vertex: { module: shader, entryPoint: 'vertexMain' },
          fragment: {
            module: shader,
            entryPoint: 'fragmentMain',
            targets: [{
              format,
              blend: {
                color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
              }
            }]
          },
          primitive: { topology: 'triangle-list' }
        });
        const usage = (globalThis.GPUBufferUsage?.UNIFORM || 0x0040) |
          (globalThis.GPUBufferUsage?.COPY_DST || 0x0008);
        uniformBuffer = device.createBuffer({
          label: 'Stream Monsters effect uniforms',
          size: 32,
          usage
        });
        bindGroup = device.createBindGroup({
          label: 'Stream Monsters effect bind group',
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
        });
        markMode('webgpu');
        Promise.resolve(device.lost).then(() => switchToFallback('device-lost')).catch(() => {
          switchToFallback('device-lost');
        });
        return rendererMode;
      } catch (_) {
        return switchToFallback('initialization-failed');
      }
    }

    function resize() {
      if (!canvas) return;
      const ratio = Math.max(1, Number(globalThis.devicePixelRatio) || 1);
      const width = Math.max(1, Math.round((canvas.clientWidth || canvas.width || 1) * ratio));
      const height = Math.max(1, Math.round((canvas.clientHeight || canvas.height || 1) * ratio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }

    function renderWebGpu(scene, progress, timestamp) {
      if (!device || !pipeline || !uniformBuffer || !bindGroup || !context) {
        switchToFallback('device-lost');
        return;
      }
      resize();
      const [red, green, blue, alpha] = hexColor(scene.color);
      const values = new Float32Array([
        timestamp / 1000,
        progress,
        SCENE_CODES[scene.scene],
        Math.max(0.1, canvas.width / Math.max(1, canvas.height)),
        red,
        green,
        blue,
        alpha
      ]);
      device.queue.writeBuffer(uniformBuffer, 0, values);
      const encoder = device.createCommandEncoder({ label: 'Stream Monsters transparent effects frame' });
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
    }

    function renderFallback(scene, progress) {
      if (!canvas2d) {
        try {
          canvas2d = canvas?.getContext?.('2d', { alpha: true }) || null;
        } catch (_) {
          canvas2d = null;
        }
      }
      if (!canvas2d || !canvas) return;
      resize();
      const width = canvas.width;
      const height = canvas.height;
      const radius = Math.min(width, height) * (0.12 + progress * 0.2);
      canvas2d.clearRect(0, 0, width, height);
      canvas2d.save();
      canvas2d.translate(width / 2, height / 2);
      canvas2d.globalAlpha = reducedMotion ? 0.35 : Math.max(0.12, 1 - progress);
      canvas2d.strokeStyle = scene.color;
      canvas2d.fillStyle = scene.color;
      canvas2d.lineWidth = Math.max(3, Math.min(width, height) * 0.012);
      canvas2d.beginPath();
      if (scene.scene === 'attack') {
        canvas2d.moveTo(-radius * 1.7, radius * 0.45);
        canvas2d.lineTo(radius * 1.7, -radius * 0.45);
      } else {
        canvas2d.arc(0, 0, radius, 0, Math.PI * 2);
      }
      canvas2d.stroke();
      if (scene.scene === 'special' || scene.scene === 'spawn') {
        canvas2d.globalAlpha *= 0.18;
        canvas2d.beginPath();
        canvas2d.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
        canvas2d.fill();
      }
      canvas2d.restore();
    }

    function animate() {
      if (!activeScene) return;
      const elapsed = Math.max(0, now() - activeScene.startedAt);
      const progress = Math.min(1, elapsed / activeScene.duration);
      if (rendererMode === 'webgpu') renderWebGpu(activeScene, progress, now());
      else if (!reducedMotion) renderFallback(activeScene, progress);
      if (progress < 1 && activeScene) frameHandle = scheduleFrame(animate);
      else frameHandle = null;
    }

    async function play(sceneName, payload = {}) {
      if (!initialization) initialization = initialize();
      await initialization;
      const scene = sceneChoreography(sceneName, payload);
      if (frameHandle != null) cancelFrame(frameHandle);
      if (activeScene?.timer != null) {
        clearTimer(activeScene.timer);
        activeScene.resolve?.({
          scene: activeScene.scene,
          duration: activeScene.duration,
          mode: rendererMode,
          interrupted: true,
          reducedMotion
        });
      }
      return new Promise(resolve => {
        activeScene = {
          ...scene,
          startedAt: now(),
          resolve,
          timer: setTimer(() => {
            const completed = activeScene;
            if (!completed || completed.resolve !== resolve) return;
            if (frameHandle != null) cancelFrame(frameHandle);
            frameHandle = null;
            if (canvas2d && canvas) canvas2d.clearRect(0, 0, canvas.width, canvas.height);
            activeScene = null;
            resolve({
              scene: scene.scene,
              duration: scene.duration,
              mode: rendererMode,
              reducedMotion
            });
          }, scene.duration)
        };
        if (rendererMode === 'webgpu' || !reducedMotion) frameHandle = scheduleFrame(animate);
        else renderFallback(activeScene, 1);
      });
    }

    function destroy() {
      if (frameHandle != null) cancelFrame(frameHandle);
      if (activeScene?.timer != null) clearTimer(activeScene.timer);
      frameHandle = null;
      activeScene = null;
      device = null;
    }

    return {
      destroy,
      init() {
        if (!initialization) initialization = initialize();
        return initialization;
      },
      mode: () => rendererMode,
      play,
      reason: () => fallbackReason,
      resize
    };
  }

  return {
    CHOREOGRAPHY,
    ELEMENT_COLORS,
    SCENE_DURATIONS,
    colorForElement,
    createEffectsRenderer,
    sceneChoreography
  };
}));
