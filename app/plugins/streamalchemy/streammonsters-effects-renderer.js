(function attachStreamMonstersEffectsRenderer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StreamMonstersEffectsRenderer = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const SCENE_DURATIONS = Object.freeze({
    portal: 650,
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
  const QUALITY_BUDGETS = Object.freeze({
    auto: Object.freeze({ particles: 72, trailSegments: 22, layers: 3, bloom: 0.82 }),
    high: Object.freeze({ particles: 112, trailSegments: 32, layers: 4, bloom: 1 }),
    medium: Object.freeze({ particles: 56, trailSegments: 18, layers: 3, bloom: 0.66 }),
    low: Object.freeze({ particles: 24, trailSegments: 8, layers: 2, bloom: 0.38 })
  });
  const QUALITY_CODES = Object.freeze({
    auto: 2.5,
    high: 3,
    medium: 2,
    low: 1
  });
  const ELEMENT_SIGNATURES = Object.freeze({
    Ember: Object.freeze({
      code: 1,
      attack: Object.freeze(['sparks', 'flames']),
      defense: Object.freeze(['heat-ripple']),
      special: Object.freeze(['sparks', 'flames', 'heat-ripple'])
    }),
    Tide: Object.freeze({
      code: 2,
      attack: Object.freeze(['water-arcs']),
      defense: Object.freeze(['tide-rings', 'mist']),
      special: Object.freeze(['water-arcs', 'tide-rings', 'mist'])
    }),
    Grove: Object.freeze({
      code: 3,
      attack: Object.freeze(['vines', 'leaves']),
      defense: Object.freeze(['root-crystal']),
      special: Object.freeze(['vines', 'leaves', 'root-crystal'])
    }),
    Gale: Object.freeze({
      code: 4,
      attack: Object.freeze(['wind-ribbons', 'feathers']),
      defense: Object.freeze(['pressure-rings']),
      special: Object.freeze(['wind-ribbons', 'feathers', 'pressure-rings'])
    }),
    Volt: Object.freeze({
      code: 5,
      attack: Object.freeze(['branching-lightning', 'afterimage']),
      defense: Object.freeze(['afterimage']),
      special: Object.freeze(['branching-lightning', 'afterimage'])
    }),
    Lunar: Object.freeze({
      code: 6,
      attack: Object.freeze(['crescents', 'stars']),
      defense: Object.freeze(['shadow']),
      special: Object.freeze(['crescents', 'shadow', 'stars'])
    })
  });
  const SCENE_CODES = Object.freeze({
    portal: 1,
    spawn: 1,
    hatch: 2,
    attack: 3,
    defense: 4,
    special: 5
  });
  const CHOREOGRAPHY = Object.freeze({
    portal: Object.freeze(['element-portal', 'particle-swirl']),
    spawn: Object.freeze(['element-portal', 'particle-swirl', 'egg-fly-in', 'spring-landing']),
    hatch: Object.freeze(['pulse', 'cracks', 'energy-build', 'flash', 'monster-reveal']),
    attack: Object.freeze(['telegraph', 'element-strike', 'impact']),
    defense: Object.freeze(['guard-rise', 'element-barrier', 'guard-pulse']),
    special: Object.freeze(['charge', 'element-signature', 'finisher'])
  });

  const SHADER = `
struct Uniforms {
  frame: vec4<f32>,
  color: vec4<f32>,
  effect: vec4<f32>,
  placement: vec4<f32>,
  signature: vec4<f32>,
  target: vec4<f32>,
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
  let element = u.signature.x;
  let quality = max(0.32, u.signature.y / 3.0);
  let targetPoint = vec2<f32>(
    (u.target.x - u.placement.x) * u.frame.w,
    u.target.y - u.placement.y
  ) / effectScale;
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
    let direction = normalize(targetPoint + vec2<f32>(0.0001) - centered);
    let trail = 1.0 - smoothstep(
      0.01,
      0.055 + spread * 0.012,
      abs(centered.y - sin(centered.x * (9.0 + variant) - u.frame.x * (6.0 + twist)) * 0.08)
    );
    var semantic = trail;
    if (element == 1.0) {
      let sparks = abs(sin(angle * (10.0 + variant) + u.frame.x * 12.0));
      semantic = max(trail, sparks * (1.0 - smoothstep(0.05, 0.48, distance)));
    } else if (element == 2.0) {
      semantic = max(trail * 0.72, ring(centered, 0.13 + u.frame.y * 0.26, 0.026));
    } else if (element == 3.0) {
      semantic = max(trail, abs(sin(angle * 3.0 + distance * 18.0)) * 0.42);
    } else if (element == 4.0) {
      semantic = max(trail, ring(centered, 0.2 + u.frame.y * 0.18, 0.012) * 0.75);
    } else if (element == 5.0) {
      let branch = 1.0 - smoothstep(0.015, 0.045, abs(centered.y - sin(centered.x * 22.0 + u.frame.x * 18.0) * 0.12));
      semantic = max(trail * 0.5, branch);
    } else {
      let crescent = ring(centered - direction * 0.04, 0.2, 0.026);
      semantic = max(crescent, pulse * (1.0 - smoothstep(0.2, 0.42, distance)) * 0.55);
    }
    alpha = semantic * smoothstep(-0.5, 0.45, centered.x) * (1.0 - u.frame.y * 0.7) * quality;
  } else if (u.frame.z == 4.0) {
    var barrier = ring(centered, 0.25 + spread * 0.02, 0.035 + twist * 0.006);
    if (element == 1.0) {
      barrier = max(barrier, ring(centered, 0.31 + sin(u.frame.x * 8.0) * 0.02, 0.012));
    } else if (element == 2.0) {
      barrier = max(barrier, ring(centered, 0.18 + u.frame.y * 0.2, 0.02) * 0.72);
    } else if (element == 3.0) {
      barrier = max(barrier, abs(sin(angle * 6.0)) * (1.0 - smoothstep(0.12, 0.34, distance)));
    } else if (element == 4.0) {
      barrier = max(barrier, ring(centered, 0.34 + u.frame.y * 0.1, 0.01));
    } else if (element == 5.0) {
      barrier = max(barrier, pulse * ring(centered, 0.2, 0.024));
    } else {
      barrier = max(barrier, (1.0 - smoothstep(0.1, 0.31, distance)) * 0.36);
    }
    alpha = barrier * (1.0 - u.frame.y * 0.45) * quality;
  } else if (u.frame.z == 5.0) {
    var finisher = (1.0 - smoothstep(0.05, 0.48, distance)) * (0.25 + pulse * 0.45);
    if (element == 1.0) {
      finisher = max(finisher, abs(sin(angle * 12.0 + u.frame.x * 9.0)) * (1.0 - smoothstep(0.12, 0.5, distance)));
    } else if (element == 2.0) {
      finisher = max(finisher * 0.65, ring(centered, 0.12 + u.frame.y * 0.32, 0.04));
    } else if (element == 3.0) {
      finisher = max(finisher, abs(sin(angle * 7.0)) * (1.0 - smoothstep(0.04, 0.43, distance)));
    } else if (element == 4.0) {
      finisher = max(finisher * 0.6, ring(centered, 0.16 + u.frame.y * 0.38, 0.018));
    } else if (element == 5.0) {
      finisher = max(finisher, abs(sin(centered.x * 27.0 + centered.y * 17.0 + u.frame.x * 18.0)) * 0.6);
    } else {
      let crescent = ring(centered - vec2<f32>(0.08, 0.0), 0.24, 0.034);
      finisher = max(crescent, pulse * (1.0 - smoothstep(0.2, 0.46, distance)));
    }
    alpha = max(alpha, finisher * quality);
  }
  return vec4<f32>(u.color.rgb, clamp(alpha, 0.0, 0.82) * u.color.a);
}`;

  function colorForElement(element) {
    return ELEMENT_COLORS[String(element || '').trim().toLowerCase()] || '#a984ff';
  }

  function normalizeQuality(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(QUALITY_BUDGETS, normalized)
      ? normalized
      : 'auto';
  }

  function normalizeElement(value) {
    const requested = String(value || '').trim().toLowerCase();
    const canonical = Object.keys(ELEMENT_SIGNATURES)
      .find(element => element.toLowerCase() === requested);
    return canonical || 'Lunar';
  }

  function normalizedOrigin(value, fallback = { x: 0.5, y: 0.5 }) {
    const x = Number(value?.x);
    const y = Number(value?.y);
    return {
      x: Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : fallback.x,
      y: Number.isFinite(y) ? Math.max(0, Math.min(1, y)) : fallback.y
    };
  }

  function originForSlot(value) {
    const slot = Math.round(Number(value));
    if (slot === 1) return { x: 0.28, y: 0.52 };
    if (slot === 2) return { x: 0.72, y: 0.52 };
    return null;
  }

  function positiveAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }

  function sumAmounts(items, predicate, value) {
    return (Array.isArray(items) ? items : [])
      .filter(predicate)
      .reduce((total, item) => total + positiveAmount(value(item)), 0);
  }

  function readableStatus(value) {
    return String(value || '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, character => character.toUpperCase())
      .slice(0, 32);
  }

  function effectMetadata(payload = {}) {
    const hits = Array.isArray(payload.hits) ? payload.hits : [];
    const outcomes = Array.isArray(payload.outcomes) ? payload.outcomes : [];
    const damage = positiveAmount(payload.damage) ||
      positiveAmount(payload.hpDamage) ||
      sumAmounts(
        hits,
        hit => !hit?.evaded,
        hit => hit?.hpDamage
      );
    const shieldAbsorbed = positiveAmount(payload.shieldAbsorbed) || sumAmounts(
      hits,
      hit => !hit?.evaded,
      hit => hit?.shieldAbsorbed
    );
    const shield = positiveAmount(payload.shield) ||
      positiveAmount(payload.shieldGain) ||
      sumAmounts(
        outcomes,
        outcome => outcome?.type === 'shield',
        outcome => outcome?.amount
      );
    const heal = positiveAmount(payload.heal) ||
      positiveAmount(payload.healing) ||
      sumAmounts(
        outcomes,
        outcome => ['heal', 'lifesteal'].includes(outcome?.type),
        outcome => outcome?.amount
      );
    const statuses = [...new Set([
      ...(Array.isArray(payload.statuses) ? payload.statuses : []),
      ...(Array.isArray(payload.statusEffects) ? payload.statusEffects : [])
        .map(effect => effect?.label || effect?.type),
      ...(payload.evaded ? ['evade'] : []),
      ...outcomes
        .filter(outcome => ![
          'damage',
          'shield',
          'heal',
          'lifesteal'
        ].includes(outcome?.type))
        .map(outcome => outcome?.label || outcome?.type)
    ]
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean))]
      .slice(0, 4);
    const readable = [
      damage > 0 ? `Damage ${damage}` : '',
      shieldAbsorbed > 0 ? `Absorbed ${shieldAbsorbed}` : '',
      shield > 0 ? `Shield +${shield}` : '',
      heal > 0 ? `Heal +${heal}` : '',
      ...statuses.map(readableStatus)
    ].filter(Boolean).join(' · ');
    return {
      damage,
      shieldAbsorbed,
      shield,
      heal,
      statuses,
      readable
    };
  }

  function effectSignature(element, scene) {
    const canonicalElement = normalizeElement(element);
    const catalog = ELEMENT_SIGNATURES[canonicalElement];
    if (!['attack', 'defense', 'special'].includes(scene)) {
      const normalizedScene = Object.prototype.hasOwnProperty.call(CHOREOGRAPHY, scene)
        ? scene
        : 'spawn';
      return {
        id: `${canonicalElement.toLowerCase()}:${normalizedScene}`,
        code: catalog.code,
        element: canonicalElement.toLowerCase(),
        scene: normalizedScene,
        motifs: [...CHOREOGRAPHY[normalizedScene]]
      };
    }
    return {
      id: `${canonicalElement.toLowerCase()}:${scene}`,
      code: catalog.code,
      element: canonicalElement.toLowerCase(),
      scene,
      motifs: [...catalog[scene]]
    };
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
    const element = normalizeElement(
      payload.element || payload.monster?.element || payload.actor?.element
    );
    const origin = normalizedOrigin(
      payload.origin || payload.actorOrigin,
      originForSlot(payload.actorSlot) || { x: 0.5, y: 0.5 }
    );
    const targetOrigin = normalizedOrigin(
      payload.targetOrigin || payload.target?.origin,
      normalizedScene === 'defense'
        ? origin
        : (originForSlot(payload.targetSlot) || { x: 1 - origin.x, y: origin.y })
    );
    const requestedScale = Number(payload.scale);
    const quality = normalizeQuality(payload.quality);
    const requestedEffectiveQuality = normalizeQuality(payload.effectiveQuality);
    const effectiveQuality = payload.effectiveQuality == null
      ? quality
      : requestedEffectiveQuality;
    const hitCount = Math.max(
      1,
      Math.min(
        12,
        Math.round(Number(payload.hitCount) || payload.hits?.length || 1)
      )
    );
    const hitIndex = Math.max(
      1,
      Math.min(hitCount, Math.round(Number(payload.hitIndex) || 1))
    );
    return {
      scene: normalizedScene,
      steps: [...CHOREOGRAPHY[normalizedScene]],
      vfxKey,
      vfx: vfxParameters(vfxKey || `${normalizedScene}:default`),
      element,
      color: colorForElement(element),
      origin,
      targetOrigin,
      hit: {
        index: hitIndex,
        count: hitCount
      },
      signature: effectSignature(element, normalizedScene),
      metadata: effectMetadata(payload),
      quality,
      effectiveQuality,
      budget: QUALITY_BUDGETS[effectiveQuality],
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
    const diagnostics = typeof options.diagnostics === 'function'
      ? options.diagnostics
      : (typeof window === 'object' && window?.console?.info
          ? record => window.console.info(record)
          : null);
    const lowFpsThreshold = Math.max(1, Number(options.lowFpsThreshold) || 24);
    const lowFpsSampleSize = Math.max(3, Math.round(Number(options.lowFpsSampleSize) || 30));
    let qualityMode = normalizeQuality(options.quality);
    let rendererMode = 'pending';
    let fallbackReason = null;
    let reducedMotion = false;
    let deviceLost = false;
    let device = null;
    let context = null;
    let canvas2d = null;
    let pipeline = null;
    let uniformBuffer = null;
    let bindGroup = null;
    let frameHandle = null;
    let activeScene = null;
    let initialization = null;
    let lastFrameAt = null;
    let measuredFps = null;
    let fpsSamples = [];
    let fpsDegraded = false;

    function effectiveQuality() {
      if (reducedMotion) return 'low';
      if (qualityMode !== 'auto') return qualityMode;
      if (!fpsDegraded) return 'auto';
      return Number.isFinite(measuredFps) && measuredFps < lowFpsThreshold * 0.7
        ? 'low'
        : 'medium';
    }

    function qualityBudget() {
      return QUALITY_BUDGETS[effectiveQuality()];
    }

    function diagnosticRenderer(mode = rendererMode) {
      if (mode === 'webgpu' || mode === 'pending') return mode;
      return canvas2d ? 'canvas2d' : 'css';
    }

    function emitDiagnostic(event, {
      renderer = diagnosticRenderer(),
      previousRenderer = renderer,
      reason = fallbackReason,
      fps = measuredFps
    } = {}) {
      if (!diagnostics) return;
      const record = {
        component: 'streammonsters-overlay',
        subsystem: 'renderer',
        event: String(event),
        renderer: String(renderer),
        previousRenderer: String(previousRenderer),
        fallbackReason: reason == null ? null : String(reason),
        fps: Number.isFinite(fps) ? Math.round(fps) : null
      };
      try {
        diagnostics(record);
      } catch (_) {}
    }

    function markMode(nextMode, reason = null) {
      const previousRenderer = diagnosticRenderer();
      rendererMode = nextMode;
      fallbackReason = reason;
      const renderer = diagnosticRenderer();
      canvas?.classList?.toggle?.('effects-fallback', nextMode === 'fallback');
      if (canvas?.dataset) {
        canvas.dataset.renderer = nextMode;
        canvas.dataset.rendererBackend = renderer;
        if (reason) canvas.dataset.fallbackReason = reason;
        else delete canvas.dataset.fallbackReason;
      }
      emitDiagnostic(
        previousRenderer === 'pending' ? 'renderer_selected' : 'renderer_switched',
        { renderer, previousRenderer, reason }
      );
    }

    function observeFrame(timestamp) {
      const frameAt = Number(timestamp);
      if (!Number.isFinite(frameAt)) return;
      if (lastFrameAt != null) {
        const elapsed = frameAt - lastFrameAt;
        if (elapsed > 0 && elapsed <= 1000) {
          fpsSamples.push(1000 / elapsed);
          if (fpsSamples.length > lowFpsSampleSize) fpsSamples.shift();
          if (fpsSamples.length >= lowFpsSampleSize) {
            measuredFps = fpsSamples.reduce((sum, fps) => sum + fps, 0) / fpsSamples.length;
            if (canvas?.dataset) canvas.dataset.fps = String(Math.round(measuredFps));
            if (!fpsDegraded && measuredFps < lowFpsThreshold) {
              fpsDegraded = true;
              emitDiagnostic('renderer_fps_degraded', {
                renderer: diagnosticRenderer(),
                previousRenderer: diagnosticRenderer(),
                reason: 'low-fps'
              });
            } else if (fpsDegraded && measuredFps >= lowFpsThreshold + 8) {
              fpsDegraded = false;
              emitDiagnostic('renderer_fps_recovered', {
                renderer: diagnosticRenderer(),
                previousRenderer: diagnosticRenderer(),
                reason: null
              });
            }
          }
        }
      }
      lastFrameAt = frameAt;
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
      if (reason === 'device-lost') deviceLost = true;
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
          size: 96,
          usage
        });
        bindGroup = device.createBindGroup({
          label: 'Stream Monsters effect bind group',
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
        });
        deviceLost = false;
        markMode('webgpu');
        const handleDeviceLoss = () => {
          emitDiagnostic('renderer_device_lost', {
            renderer: 'webgpu',
            previousRenderer: 'webgpu',
            reason: 'device-lost'
          });
          switchToFallback('device-lost');
        };
        Promise.resolve(device.lost).then(handleDeviceLoss).catch(handleDeviceLoss);
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

    function sceneEffectiveQuality(scene) {
      if (reducedMotion) return 'low';
      const requested = normalizeQuality(scene?.quality);
      return requested === 'auto' ? effectiveQuality() : requested;
    }

    function applySurfaceContract(scene, phase) {
      if (!canvas || !scene) return;
      const resolvedQuality = sceneEffectiveQuality(scene);
      const budget = QUALITY_BUDGETS[resolvedQuality];
      if (canvas.dataset) {
        canvas.dataset.effectPhase = phase.name;
        canvas.dataset.effectSignature = scene.signature.id;
        canvas.dataset.effectScene = scene.scene;
        canvas.dataset.effectMotifs = scene.signature.motifs.join(',');
        canvas.dataset.effectHit = `${scene.hit.index}/${scene.hit.count}`;
        canvas.dataset.effectTarget = [
          scene.targetOrigin.x.toFixed(3),
          scene.targetOrigin.y.toFixed(3)
        ].join(',');
        canvas.dataset.effectQuality = resolvedQuality;
        canvas.dataset.effectMetadata = scene.metadata.readable;
        canvas.dataset.vfxVariant = `v${scene.vfx.variant}`;
        canvas.dataset.particleBudget = String(budget.particles);
      }
      canvas.style?.setProperty?.('--sm-effect-color', scene.color);
      canvas.style?.setProperty?.('--sm-effect-origin-x', String(scene.origin.x));
      canvas.style?.setProperty?.('--sm-effect-origin-y', String(scene.origin.y));
      canvas.style?.setProperty?.('--sm-effect-target-x', String(scene.targetOrigin.x));
      canvas.style?.setProperty?.('--sm-effect-target-y', String(scene.targetOrigin.y));
      canvas.style?.setProperty?.('--sm-effect-bloom', String(budget.bloom));
    }

    function renderWebGpu(scene, progress, timestamp) {
      if (!device || !pipeline || !uniformBuffer || !bindGroup || !context) {
        switchToFallback('device-lost');
        return;
      }
      resize();
      const phase = phaseForProgress(scene.scene, progress);
      applySurfaceContract(scene, phase);
      const resolvedQuality = sceneEffectiveQuality(scene);
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
        0,
        scene.signature.code,
        QUALITY_CODES[resolvedQuality],
        scene.hit.index,
        scene.hit.count,
        scene.targetOrigin.x,
        scene.targetOrigin.y,
        scene.metadata.shield,
        scene.metadata.heal
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

    function clearSurface() {
      if (rendererMode === 'webgpu' && device && context) {
        try {
          resize();
          const encoder = device.createCommandEncoder({
            label: 'Stream Monsters transparent effects clear'
          });
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: context.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store'
            }]
          });
          pass.end();
          device.queue.submit([encoder.finish()]);
        } catch (_) {}
      } else if (canvas2d && canvas) {
        canvas2d.clearRect(0, 0, canvas.width, canvas.height);
      }
      if (canvas?.dataset) {
        for (const key of [
          'effectPhase',
          'effectSignature',
          'effectScene',
          'effectMotifs',
          'effectHit',
          'effectTarget',
          'effectQuality',
          'effectMetadata',
          'vfxVariant',
          'particleBudget'
        ]) delete canvas.dataset[key];
      }
      for (const property of [
        '--sm-effect-color',
        '--sm-effect-origin-x',
        '--sm-effect-origin-y',
        '--sm-effect-target-x',
        '--sm-effect-target-y',
        '--sm-effect-bloom'
      ]) canvas?.style?.removeProperty?.(property);
    }

    function drawStar(context2d, x, y, radius) {
      context2d.moveTo(x + radius, y);
      for (let point = 1; point <= 10; point += 1) {
        const angle = point * Math.PI / 5;
        const distance = point % 2 ? radius * 0.42 : radius;
        context2d.lineTo(
          x + Math.cos(angle) * distance,
          y + Math.sin(angle) * distance
        );
      }
      context2d.closePath?.();
    }

    function drawElementSignatureFallback(context2d, scene, progress, width, height, radius) {
      const motifs = new Set(scene.signature.motifs);
      const resolvedQuality = sceneEffectiveQuality(scene);
      const budget = QUALITY_BUDGETS[resolvedQuality];
      const detail = Math.max(2, Math.ceil(budget.particles / 18));
      const targetX = (scene.targetOrigin.x - scene.origin.x) * width / scene.scale;
      const targetY = (scene.targetOrigin.y - scene.origin.y) * height / scene.scale;
      const hitOffset = (scene.hit.index - 1) / Math.max(1, scene.hit.count);
      context2d.lineWidth = Math.max(
        2,
        Math.min(width, height) * (0.004 + budget.bloom * 0.004)
      );
      context2d.setLineDash?.([]);
      context2d.beginPath();

      if (motifs.has('sparks')) {
        for (let index = 0; index < detail; index += 1) {
          const angle = (index / detail) * Math.PI * 2 + progress * 5;
          const inner = radius * (0.35 + (index % 3) * 0.08);
          const outer = radius * (0.8 + (index % 2) * 0.2);
          context2d.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
          context2d.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        }
      }
      if (motifs.has('flames')) {
        context2d.moveTo(0, radius * 0.5);
        context2d.quadraticCurveTo?.(
          radius * (0.2 + hitOffset),
          -radius * 1.3,
          targetX,
          targetY
        );
      }
      if (motifs.has('heat-ripple')) {
        for (let ring = 1; ring <= budget.layers; ring += 1) {
          context2d.moveTo(radius * ring * 0.3, 0);
          context2d.arc(0, 0, radius * ring * 0.3, 0, Math.PI * 2);
        }
      }
      if (motifs.has('water-arcs')) {
        context2d.moveTo(-radius, radius * 0.2);
        context2d.quadraticCurveTo?.(0, -radius * 1.15, targetX, targetY);
        context2d.moveTo(-radius * 0.7, radius * 0.45);
        context2d.quadraticCurveTo?.(radius * 0.15, -radius * 0.7, targetX, targetY);
      }
      if (motifs.has('tide-rings')) {
        for (let ring = 1; ring <= budget.layers; ring += 1) {
          context2d.moveTo(radius * ring * 0.28, 0);
          context2d.arc(0, 0, radius * ring * 0.28, Math.PI * 1.1, Math.PI * 2.9);
        }
      }
      if (motifs.has('mist')) {
        for (let cloud = 0; cloud < detail; cloud += 1) {
          const angle = cloud * 2.399 + progress;
          const distance = radius * (0.28 + (cloud % 4) * 0.12);
          context2d.moveTo(
            Math.cos(angle) * distance + radius * 0.14,
            Math.sin(angle) * distance
          );
          context2d.arc(
            Math.cos(angle) * distance,
            Math.sin(angle) * distance,
            radius * 0.14,
            0,
            Math.PI * 2
          );
        }
      }
      if (motifs.has('vines')) {
        context2d.moveTo(-radius, radius * 0.45);
        context2d.bezierCurveTo?.(
          -radius * 0.25,
          -radius,
          targetX * 0.6,
          radius * 0.8,
          targetX,
          targetY
        );
      }
      if (motifs.has('leaves')) {
        for (let leaf = 0; leaf < detail; leaf += 1) {
          const ratio = (leaf + 1) / (detail + 1);
          const x = -radius + (targetX + radius) * ratio;
          const y = targetY * ratio + Math.sin(ratio * Math.PI * 3) * radius * 0.2;
          context2d.moveTo(x + radius * 0.12, y);
          context2d.ellipse?.(
            x,
            y,
            radius * 0.12,
            radius * 0.055,
            ratio * Math.PI,
            0,
            Math.PI * 2
          );
        }
      }
      if (motifs.has('root-crystal')) {
        context2d.moveTo(0, -radius);
        context2d.lineTo(radius * 0.62, -radius * 0.12);
        context2d.lineTo(radius * 0.3, radius * 0.82);
        context2d.lineTo(-radius * 0.35, radius * 0.82);
        context2d.lineTo(-radius * 0.62, -radius * 0.12);
        context2d.closePath?.();
      }
      if (motifs.has('wind-ribbons')) {
        for (let ribbon = 0; ribbon < budget.layers; ribbon += 1) {
          const offset = (ribbon - budget.layers / 2) * radius * 0.18;
          context2d.moveTo(-radius, offset);
          context2d.bezierCurveTo?.(
            -radius * 0.2,
            -radius * 0.7 + offset,
            targetX * 0.55,
            radius * 0.7 + offset,
            targetX,
            targetY + offset
          );
        }
      }
      if (motifs.has('feathers')) {
        for (let feather = 0; feather < detail; feather += 1) {
          const ratio = (feather + 1) / (detail + 1);
          context2d.moveTo(targetX * ratio + radius * 0.1, targetY * ratio);
          context2d.ellipse?.(
            targetX * ratio,
            targetY * ratio,
            radius * 0.11,
            radius * 0.035,
            ratio * 2,
            0,
            Math.PI * 2
          );
        }
      }
      if (motifs.has('pressure-rings')) {
        for (let ring = 1; ring <= budget.layers + 1; ring += 1) {
          context2d.moveTo(radius * ring * 0.22, 0);
          context2d.arc(0, 0, radius * ring * 0.22, 0, Math.PI * 2);
        }
      }
      if (motifs.has('branching-lightning')) {
        const segments = Math.max(3, Math.min(10, Math.ceil(budget.trailSegments / 4)));
        let priorX = 0;
        let priorY = 0;
        for (let segment = 1; segment <= segments; segment += 1) {
          const ratio = segment / segments;
          const x = targetX * ratio;
          const y = targetY * ratio + (segment % 2 ? -1 : 1) * radius * 0.13;
          context2d.moveTo(priorX, priorY);
          context2d.lineTo(x, y);
          if (segment > 1 && segment < segments) {
            context2d.moveTo(x, y);
            context2d.lineTo(
              x - radius * 0.18,
              y + (segment % 2 ? 1 : -1) * radius * 0.28
            );
          }
          priorX = x;
          priorY = y;
        }
      }
      if (motifs.has('afterimage')) {
        for (let image = 1; image <= budget.layers; image += 1) {
          const ratio = image / (budget.layers + 1);
          context2d.moveTo(targetX * ratio - radius * 0.18, targetY * ratio);
          context2d.lineTo(targetX * ratio + radius * 0.18, targetY * ratio);
        }
      }
      if (motifs.has('crescents')) {
        context2d.moveTo(radius * 0.85, 0);
        context2d.arc(0, 0, radius * 0.85, -Math.PI * 0.55, Math.PI * 0.55);
        context2d.moveTo(radius * 0.62, 0);
        context2d.arc(radius * 0.18, 0, radius * 0.62, -Math.PI * 0.52, Math.PI * 0.52);
      }
      if (motifs.has('shadow')) {
        context2d.moveTo(radius, 0);
        context2d.ellipse?.(0, 0, radius, radius * 0.48, 0, 0, Math.PI * 2);
      }
      if (motifs.has('stars')) {
        for (let star = 0; star < detail; star += 1) {
          const angle = star * 2.399 + progress * 2;
          const distance = radius * (0.35 + (star % 4) * 0.16);
          drawStar(
            context2d,
            Math.cos(angle) * distance,
            Math.sin(angle) * distance,
            radius * 0.08
          );
        }
      }
      context2d.stroke();
    }

    function renderFallback(scene, progress) {
      if (!canvas) return;
      resize();
      const phase = phaseForProgress(scene.scene, progress);
      applySurfaceContract(scene, phase);
      if (!canvas2d) {
        try {
          canvas2d = canvas?.getContext?.('2d', { alpha: true }) || null;
        } catch (_) {
          canvas2d = null;
        }
      }
      if (!canvas2d) return;
      const width = canvas.width;
      const height = canvas.height;
      const radius = Math.min(width, height) * (0.12 + progress * 0.2);
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
      if (['portal', 'spawn'].includes(scene.scene) && phase.name === 'element-portal') {
        canvas2d.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
      } else if (['portal', 'spawn'].includes(scene.scene) && phase.name === 'particle-swirl') {
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
      if (['portal', 'special', 'spawn'].includes(scene.scene)) {
        canvas2d.globalAlpha *= 0.18;
        canvas2d.beginPath();
        canvas2d.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
        canvas2d.fill();
      }
      if (['attack', 'defense', 'special'].includes(scene.scene)) {
        drawElementSignatureFallback(canvas2d, scene, progress, width, height, radius);
      }
      canvas2d.restore();
    }

    function animate() {
      if (!activeScene) return;
      frameHandle = null;
      const timestamp = now();
      observeFrame(timestamp);
      const elapsed = Math.max(0, timestamp - activeScene.startedAt);
      const progress = Math.min(1, elapsed / activeScene.duration);
      if (rendererMode === 'webgpu') renderWebGpu(activeScene, progress, timestamp);
      else if (!reducedMotion) renderFallback(activeScene, progress);
      if (progress >= 1 || !activeScene) frameHandle = null;
      else if (frameHandle == null) frameHandle = scheduleFrame(animate);
    }

    async function play(sceneName, payload = {}) {
      if (!initialization) initialization = initialize();
      await initialization;
      const scene = sceneChoreography(sceneName, {
        ...payload,
        quality: payload.quality == null ? qualityMode : payload.quality,
        effectiveQuality: payload.effectiveQuality == null
          ? effectiveQuality()
          : payload.effectiveQuality
      });
      const completionRecord = (completedScene, extra = {}) => ({
        scene: completedScene.scene,
        duration: completedScene.duration,
        mode: rendererMode,
        reducedMotion,
        signature: completedScene.signature.id,
        hit: { ...completedScene.hit },
        metadata: {
          ...completedScene.metadata,
          statuses: [...completedScene.metadata.statuses]
        },
        quality: completedScene.quality,
        effectiveQuality: sceneEffectiveQuality(completedScene),
        ...extra
      });
      if (frameHandle != null) cancelFrame(frameHandle);
      if (activeScene?.timer != null) {
        clearTimer(activeScene.timer);
        activeScene.resolve?.(completionRecord(activeScene, { interrupted: true }));
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
            clearSurface();
            activeScene = null;
            resolve(completionRecord(scene));
          }, scene.duration)
        };
        if (rendererMode === 'webgpu' || !reducedMotion) frameHandle = scheduleFrame(animate);
        else renderFallback(activeScene, 1);
      });
    }

    function destroy() {
      if (frameHandle != null) cancelFrame(frameHandle);
      if (activeScene?.timer != null) clearTimer(activeScene.timer);
      clearSurface();
      frameHandle = null;
      activeScene = null;
      device = null;
      lastFrameAt = null;
      fpsSamples = [];
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
      resize,
      setQuality(value) {
        qualityMode = normalizeQuality(value);
        return qualityMode;
      },
      status: () => ({
        mode: rendererMode,
        renderer: diagnosticRenderer(),
        fps: Number.isFinite(measuredFps) ? Math.round(measuredFps) : null,
        fallbackReason,
        quality: qualityMode,
        effectiveQuality: effectiveQuality(),
        budget: qualityBudget(),
        reducedMotion,
        deviceLost,
        fpsDegraded
      })
    };
  }

  return {
    CHOREOGRAPHY,
    ELEMENT_COLORS,
    ELEMENT_SIGNATURES,
    QUALITY_BUDGETS,
    SCENE_DURATIONS,
    colorForElement,
    createEffectsRenderer,
    effectMetadata,
    phaseForProgress,
    sceneChoreography
  };
}));
