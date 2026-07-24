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
  frame: vec4<f32>,
  color: vec4<f32>,
  effect: vec4<f32>,
  placement: vec4<f32>,
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
  let effectScale = max(0.1, u.placement.z);
  let centered = vec2<f32>(
    (input.uv.x - u.placement.x) * u.frame.w,
    input.uv.y - u.placement.y
  ) / effectScale;
  let angle = atan2(centered.y, centered.x);
  let distance = length(centered);
  let phase = u.effect.x;
  let variant = u.effect.y;
  let twist = u.effect.z;
  let spread = u.effect.w;
  let pulse = 0.5 + 0.5 * sin(u.frame.x * (5.0 + variant) + angle * (6.0 + twist));
  var alpha = ring(centered, 0.1 + u.frame.y * 0.34 + spread * 0.025, 0.018 + phase * 0.003);
  if (u.frame.z == 1.0) {
    if (phase == 1.0) {
      alpha = max(alpha, ring(centered, 0.15 + u.frame.y * 0.12, 0.045));
    } else if (phase == 2.0) {
      alpha = max(alpha, pulse * (1.0 - smoothstep(0.08, 0.42, distance)));
    } else if (phase == 3.0) {
      let egg = length(centered - vec2<f32>(-0.5 + u.frame.y, sin(u.frame.y * 3.14159) * -0.15));
      alpha = max(alpha, 1.0 - smoothstep(0.04, 0.1, egg));
    } else {
      alpha = max(alpha, ring(centered, 0.2 + sin(u.frame.y * 18.0) * 0.03, 0.04));
    }
  } else if (u.frame.z == 2.0) {
    if (phase == 2.0) {
      alpha = max(alpha, abs(sin(angle * (5.0 + variant))) * (1.0 - smoothstep(0.05, 0.38, distance)));
    } else if (phase == 4.0) {
      alpha = max(alpha, (1.0 - u.frame.y) * (1.0 - smoothstep(0.0, 0.55, distance)));
    } else {
      alpha = max(alpha, ring(centered, 0.18 + phase * 0.025, 0.02) * (0.4 + pulse * 0.6));
    }
  } else if (u.frame.z == 3.0) {
    let trail = 1.0 - smoothstep(0.01, 0.055 + spread * 0.012, abs(centered.y - sin(centered.x * (9.0 + variant) - u.frame.x * (6.0 + twist)) * 0.08));
    alpha = trail * smoothstep(-0.5, 0.45, centered.x) * (1.0 - u.frame.y);
  } else if (u.frame.z == 4.0) {
    alpha = ring(centered, 0.25 + spread * 0.02, 0.035 + twist * 0.006) * (1.0 - u.frame.y * 0.45);
  } else if (u.frame.z == 5.0) {
    alpha = max(alpha, (1.0 - smoothstep(0.05, 0.48, distance)) * (0.25 + pulse * 0.45));
  }
  return vec4<f32>(u.color.rgb, clamp(alpha, 0.0, 0.82) * u.color.a);
}`;

  function colorForElement(element) {
    return ELEMENT_COLORS[String(element || '').trim().toLowerCase()] || '#a984ff';
  }

  function phaseForProgress(scene, progress) {
    const steps = CHOREOGRAPHY[scene] || CHOREOGRAPHY.spawn;
    const bounded = Math.max(0, Math.min(1, Number(progress) || 0));
    const scaled = Math.min(steps.length - Number.EPSILON, bounded * steps.length);
    const index = Math.min(steps.length - 1, Math.floor(scaled));
    return {
      name: steps[index],
      index,
      code: index + 1,
      progress: Math.max(0, Math.min(1, scaled - index))
    };
  }

  function vfxParameters(vfxKey) {
    let hash = 2166136261;
    for (const character of String(vfxKey || 'streammonsters:default')) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    const unsigned = hash >>> 0;
    return {
      variant: (unsigned % 7) + 1,
      twist: ((unsigned >>> 8) % 5) + 1,
      spread: ((unsigned >>> 16) % 4) + 1
    };
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
    const vfxKey = payload.vfxKey || payload.skill?.vfxKey || payload.skill?.vfx_key || null;
    const originX = Number(payload.origin?.x);
    const originY = Number(payload.origin?.y);
    const requestedScale = Number(payload.scale);
    return {
      scene: normalizedScene,
      steps: [...CHOREOGRAPHY[normalizedScene]],
      vfxKey,
      vfx: vfxParameters(vfxKey || `${normalizedScene}:default`),
      element: payload.element || payload.monster?.element || payload.actor?.element || 'Lunar',
      color: colorForElement(payload.element || payload.monster?.element || payload.actor?.element),
      origin: {
        x: Number.isFinite(originX) ? Math.max(0, Math.min(1, originX)) : 0.5,
        y: Number.isFinite(originY) ? Math.max(0, Math.min(1, originY)) : 0.5
      },
      scale: Number.isFinite(requestedScale)
        ? Math.max(0.7, Math.min(1.3, requestedScale))
        : 1,
      duration: SCENE_DURATIONS[normalizedScene]
    };
  }

  function createEffectsRenderer(options = {}) {
    let canvas = options.canvas || null;
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
      context = null;
      pipeline = null;
      uniformBuffer = null;
      bindGroup = null;
      try {
        canvas2d = canvas?.getContext?.('2d', { alpha: true }) || null;
      } catch (_) {
        canvas2d = null;
      }
      if (!canvas2d && canvas?.cloneNode && canvas?.replaceWith) {
        const previousCanvas = canvas;
        const replacement = previousCanvas.cloneNode(false);
        replacement.width = previousCanvas.width;
        replacement.height = previousCanvas.height;
        previousCanvas.replaceWith(replacement);
        canvas = replacement;
        try {
          canvas2d = canvas.getContext?.('2d', { alpha: true }) || null;
        } catch (_) {
          canvas2d = null;
        }
      }
      markMode('fallback', reason);
      if (activeScene) {
        const progress = Math.min(1, (now() - activeScene.startedAt) / activeScene.duration);
        renderFallback(activeScene, progress);
        if (!reducedMotion && progress < 1) frameHandle = scheduleFrame(animate);
      }
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
          size: 64,
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
      const phase = phaseForProgress(scene.scene, progress);
      canvas.dataset.effectPhase = phase.name;
      canvas.dataset.vfxVariant = `v${scene.vfx.variant}`;
      const [red, green, blue, alpha] = hexColor(scene.color);
      const values = new Float32Array([
        timestamp / 1000,
        progress,
        SCENE_CODES[scene.scene],
        Math.max(0.1, canvas.width / Math.max(1, canvas.height)),
        red,
        green,
        blue,
        alpha,
        phase.code,
        scene.vfx.variant,
        scene.vfx.twist,
        scene.vfx.spread,
        scene.origin.x,
        scene.origin.y,
        scene.scale,
        0
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
      const phase = phaseForProgress(scene.scene, progress);
      canvas.dataset.effectPhase = phase.name;
      canvas.dataset.vfxVariant = `v${scene.vfx.variant}`;
      canvas2d.clearRect(0, 0, width, height);
      canvas2d.save();
      canvas2d.translate(width * scene.origin.x, height * scene.origin.y);
      canvas2d.scale?.(scene.scale, scene.scale);
      canvas2d.rotate((scene.vfx.twist - 3) * 0.035);
      canvas2d.globalAlpha = reducedMotion ? 0.35 : Math.max(0.12, 1 - progress);
      canvas2d.strokeStyle = scene.color;
      canvas2d.fillStyle = scene.color;
      canvas2d.lineWidth = Math.max(3, Math.min(width, height) * 0.012);
      canvas2d.setLineDash?.([]);
      canvas2d.beginPath();
      if (scene.scene === 'spawn' && phase.name === 'element-portal') {
        canvas2d.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
      } else if (scene.scene === 'spawn' && phase.name === 'particle-swirl') {
        for (let particle = 0; particle < 5 + scene.vfx.variant; particle += 1) {
          const angle = (particle / (5 + scene.vfx.variant)) * Math.PI * 2 + phase.progress * 4;
          canvas2d.moveTo(Math.cos(angle) * radius * 0.4, Math.sin(angle) * radius * 0.4);
          canvas2d.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
      } else if (scene.scene === 'spawn' && phase.name === 'egg-fly-in') {
        const x = -width * 0.45 + width * 0.45 * phase.progress;
        const y = -Math.sin(phase.progress * Math.PI) * radius;
        canvas2d.ellipse?.(x, y, radius * 0.32, radius * 0.45, 0, 0, Math.PI * 2);
      } else if (scene.scene === 'spawn') {
        const bounce = Math.abs(Math.sin(phase.progress * Math.PI * 2)) * radius * 0.28;
        canvas2d.ellipse?.(0, -bounce, radius * 0.36, radius * 0.48, 0, 0, Math.PI * 2);
      } else if (scene.scene === 'hatch' && phase.name === 'pulse') {
        canvas2d.arc(0, 0, radius * (0.65 + phase.progress * 0.2), 0, Math.PI * 2);
      } else if (scene.scene === 'hatch' && phase.name === 'cracks') {
        for (let crack = 0; crack < 6; crack += 1) {
          const angle = crack * Math.PI / 3;
          canvas2d.moveTo(Math.cos(angle) * radius * 0.1, Math.sin(angle) * radius * 0.1);
          canvas2d.lineTo(Math.cos(angle + 0.18) * radius, Math.sin(angle + 0.18) * radius);
        }
      } else if (scene.scene === 'hatch' && phase.name === 'energy-build') {
        canvas2d.arc(0, 0, radius * 0.65, 0, Math.PI * 2);
        canvas2d.moveTo(radius * 0.9, 0);
        canvas2d.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
      } else if (scene.scene === 'hatch' && phase.name === 'flash') {
        canvas2d.fillRect?.(-width / 2, -height / 2, width, height);
      } else if (scene.scene === 'hatch') {
        canvas2d.ellipse?.(0, 0, radius * 0.48, radius * 0.72, 0, 0, Math.PI * 2);
      } else if (scene.scene === 'attack') {
        canvas2d.moveTo(-radius * 1.7, radius * 0.45);
        canvas2d.lineTo(radius * (1.4 + scene.vfx.spread * 0.12), -radius * (0.25 + scene.vfx.twist * 0.08));
      } else if (scene.scene === 'defense') {
        canvas2d.setLineDash?.([scene.vfx.variant * 2, scene.vfx.spread * 3]);
        canvas2d.arc(0, 0, radius * (0.75 + scene.vfx.spread * 0.04), Math.PI, Math.PI * 2);
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
      frameHandle = null;
      const elapsed = Math.max(0, now() - activeScene.startedAt);
      const progress = Math.min(1, elapsed / activeScene.duration);
      if (rendererMode === 'webgpu') renderWebGpu(activeScene, progress, now());
      else if (!reducedMotion) renderFallback(activeScene, progress);
      if (progress >= 1 || !activeScene) frameHandle = null;
      else if (frameHandle == null) frameHandle = scheduleFrame(animate);
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
    phaseForProgress,
    sceneChoreography
  };
}));
