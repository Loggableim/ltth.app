'use strict';

(function exposeVisibleEnvelope(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WebGPUFireworksVisibleEnvelope = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const SHAPE_IDS = Object.freeze(Array.from({ length: 27 }, (_, index) => index));
  const V2_PRIMITIVE_IDS = Object.freeze({
    radial: 10,
    ring: 11,
    spiral: 12,
    palm: 13,
    crossette: 14,
    comet: 15,
    mine: 16,
  });
  const V2_GLYPH_IDS = Object.freeze({
    paw: 17,
    heart: 18,
    star: 19,
    'fox-head': 20,
    'wolf-head': 21,
    dragon: 22,
    'dragon-wing': 23,
    tail: 24,
    boykisser: 25,
    'trans-flag': 26,
  });
  const ROCKET_VARIANTS = Object.freeze(['standard', 'avatar-head', 'decal']);
  const ENVELOPE_FLAG_BITS = Object.freeze({
    TRAIL: 1 << 0,
    SPLIT_REQUESTED: 1 << 1,
    STROBE: 1 << 3,
    ROCKET_AVATAR_HEAD: 1 << 14,
    V2_MARKER: 1 << 15,
  });

  // These values are also injected into WGSL by webgpu-particle-engine.js.
  // Keeping them on the immutable registry avoids a second numeric authority.
  const PROJECTION = Object.freeze({
    cameraDistance: 4,
    minimumDenominator: 2,
    maximumPerspective: 2,
    velocityUnit: 218,
    maximumTurbulenceAcceleration: 60,
    bloomGuardPixelsAt1080: 48,
  });

  const deepFreeze = value => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  };

  // Multipliers include the actual spawn jitter/offset branches and secondary
  // child velocities. They intentionally err outward: admission may reduce a
  // whole formation, but it must never crop an unknown renderer branch.
  const shapeOverrides = {
    0: { speed: 1.8, spawnLead: 0.08, quad: 2.75 },
    1: { speed: 1.15, quad: 1.5 },
    2: { speed: 1.25, spawnLead: 0.3, quad: 1.7 },
    3: { speed: 1.2, quad: 1.5 },
    4: { speed: 1.18, quad: 1.5 },
    5: { speed: 1.35, spawnLead: 0.1, quad: 1.6 },
    6: { speed: 1.8, quad: 1.5, texture: true },
    7: { speed: 1.8, spawnLead: 0.105, quad: 2.75 },
    8: { speed: 1.8, quad: 1.7 },
    9: { speed: 0.42, quad: 3.0 },
    10: { speed: 1.45, quad: 1.5 },
    11: { speed: 1.08, quad: 1.5, planarDepth: true },
    12: { speed: 1.45, quad: 1.5 },
    13: { speed: 1.48, quad: 1.5 },
    14: { speed: 1.2, quad: 1.5 },
    15: { speed: 1.18, quad: 1.5 },
    16: { speed: 1.5, quad: 1.5 },
  };
  for (let shape = 17; shape <= 26; shape++) {
    shapeOverrides[shape] = { speed: 1.12, quad: 1.6, planarDepth: shape <= 24 };
  }

  const shapeProfiles = {};
  for (const shapeId of SHAPE_IDS) {
    shapeProfiles[shapeId] = deepFreeze({
      category: 'shape',
      shapeId,
      speedMultiplier: shapeOverrides[shapeId].speed,
      spawnLeadSeconds: shapeOverrides[shapeId].spawnLead || 0,
      quadAxisFactor: shapeOverrides[shapeId].quad,
      textureExtent: shapeOverrides[shapeId].texture === true,
      planarDepth: shapeOverrides[shapeId].planarDepth === true,
      splitChildSpeed: 180,
      rotationFactor: Math.SQRT2,
    });
  }
  const rocketProfiles = {
    standard: deepFreeze({ category: 'rocket', variant: 'standard', bodyAxis: 1.5, flameAxis: 1.62 }),
    'avatar-head': deepFreeze({ category: 'rocket', variant: 'avatar-head', bodyAxis: 1.82, flameAxis: 1.62 }),
    decal: deepFreeze({ category: 'rocket', variant: 'decal', bodyAxis: 1.55, flameAxis: 1.25 }),
  };
  const ENVELOPE_PROFILES = deepFreeze({
    projection: PROJECTION,
    shapes: shapeProfiles,
    rockets: rocketProfiles,
  });

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const positive = (value, fallback = 0) => Math.max(0, finite(value, fallback));
  const point = (value, fallback = { x: 0, y: 0 }) => ({
    x: finite(value?.x, fallback.x),
    y: finite(value?.y, fallback.y),
  });

  function envelopeError(message, code = 'UNREGISTERED_VISIBLE_ENVELOPE') {
    const error = new RangeError(message);
    error.code = code;
    return error;
  }

  function classifyEnvelopeCommand(command) {
    const kind = Number(command?.kind);
    const shape = Number(command?.shape);
    const flags = Number(command?.flags) >>> 0;
    const textureIndex = Math.max(0, Number(command?.textureIndex) || 0);
    if (kind === 2 && Number.isInteger(shape) && SHAPE_IDS.includes(shape)) {
      return { category: 'shape', shapeId: shape };
    }
    if (kind === 1 && shape === 8) {
      const avatar = textureIndex > 0 && (flags & ENVELOPE_FLAG_BITS.ROCKET_AVATAR_HEAD) !== 0;
      return { category: 'rocket', variant: avatar ? 'avatar-head' : 'standard' };
    }
    if (kind === 1 && shape === 6 && textureIndex > 0) {
      return { category: 'rocket', variant: 'decal' };
    }
    throw envelopeError(`No visible-envelope profile for kind ${kind}, shape ${shape}.`);
  }

  function getEnvelopeProfile(command) {
    const classification = classifyEnvelopeCommand(command);
    return classification.category === 'shape'
      ? ENVELOPE_PROFILES.shapes[classification.shapeId]
      : ENVELOPE_PROFILES.rockets[classification.variant];
  }

  const quantizedDepth = depth => {
    const packed = Math.round((Math.max(-1, Math.min(1, finite(depth))) + 1) * 127.5 + 1e-7);
    return packed / 127.5 - 1;
  };

  const perspectiveAt = depth => PROJECTION.cameraDistance / Math.max(
    PROJECTION.minimumDenominator,
    PROJECTION.cameraDistance - finite(depth)
  );

  const projectPoint = (source, depth, viewport) => {
    const scale = perspectiveAt(depth);
    const centerX = viewport.width * 0.5;
    const centerY = viewport.height * 0.5;
    return {
      x: centerX + (source.x - centerX) * scale,
      y: centerY + (source.y - centerY) * scale,
      scale,
    };
  };

  function resistanceIntegral(command, seconds) {
    const duration = Math.max(0, seconds);
    const drag = Math.max(0, Math.min(1, finite(command.drag, 0.985)));
    const isV2 = ((Number(command.flags) >>> 0) & ENVELOPE_FLAG_BITS.V2_MARKER) !== 0;
    const decay = isV2 ? drag * 60 : (drag > 0 ? -Math.log(drag) * 60 : Number.POSITIVE_INFINITY);
    if (!Number.isFinite(decay)) return 0;
    if (decay < 1e-7) return duration;
    return (1 - Math.exp(-decay * duration)) / decay;
  }

  function logicalPostRadius(command, viewport, scale) {
    const physicalMinimum = Math.max(1, finite(viewport.renderMinimum, Math.min(viewport.width, viewport.height)));
    const logicalRatio = Math.max(viewport.width, viewport.height) /
      Math.max(1, finite(viewport.renderMaximum, Math.max(viewport.width, viewport.height)));
    const resolutionFactor = Math.max(1, logicalRatio, Math.min(viewport.width, viewport.height) / physicalMinimum);
    const glow = positive(command.glowRadius, positive(command.size, 6) * 1.4);
    const bloom = positive(command.bloomRadius, PROJECTION.bloomGuardPixelsAt1080 *
      Math.max(0.5, Math.min(viewport.width, viewport.height) / 1080));
    // Glow follows particle size. Kawase bloom has a fixed screen-space floor
    // and therefore must remain conservative even when admission scales down.
    return glow * scale + bloom * resolutionFactor;
  }

  function shapeEnvelope(command, viewport, profile, scale) {
    const origin = point(command.origin);
    const depth = quantizedDepth(command.burstDepth);
    const duration = positive(command.particleDuration, positive(command.duration, 1.2));
    const intensity = positive(command.intensity, 1) * scale;
    const explicitVelocity = Array.isArray(command.velocity) ? command.velocity : null;
    const speedX = explicitVelocity
      ? Math.abs(finite(explicitVelocity[0])) * scale
      : PROJECTION.velocityUnit * profile.speedMultiplier * intensity + Math.abs(finite(command.wind)) * scale;
    const speedY = explicitVelocity
      ? Math.abs(finite(explicitVelocity[1])) * scale
      : PROJECTION.velocityUnit * profile.speedMultiplier * intensity;
    const integral = resistanceIntegral(command, duration);
    const spawnLead = profile.spawnLeadSeconds * Math.max(speedX, speedY);
    // The renderer's turbulence uniform and split-child launch speeds are not
    // part of the 112-byte spawn ABI; retain them as unscaled fit floors.
    const turbulenceValue = positive(command.turbulence, 0.12);
    const turbulence = turbulenceValue <= 1
      ? turbulenceValue * PROJECTION.maximumTurbulenceAcceleration
      : turbulenceValue;
    const gravity = Math.abs(finite(command.gravity, 90)) * scale;
    const accelerationDisplacement = (gravity + turbulence) * duration * duration * 0.5;
    const split = ((Number(command.flags) >>> 0) & ENVELOPE_FLAG_BITS.SPLIT_REQUESTED) !== 0
      ? profile.splitChildSpeed * Math.max(0.08, duration * 0.46)
      : 0;
    const xTravel = speedX * integral + spawnLead + turbulence * duration * duration * 0.5 + split;
    const yTravel = speedY * integral + spawnLead + accelerationDisplacement + split;
    const depthMotion = command.depthEnabled === true && !profile.planarDepth
      ? Math.min(3, Math.abs(depth) + 0.9 * intensity * duration + 0.7 * duration * 0.46)
      : Math.abs(depth);
    const perspective = Math.max(perspectiveAt(depth), perspectiveAt(depthMotion));
    const projected = projectPoint(origin, depth >= 0 ? depthMotion : -depthMotion, viewport);
    const size = positive(command.size, 6) * scale;
    const quad = size * profile.quadAxisFactor * profile.rotationFactor * perspective;
    const trail = ((Number(command.flags) >>> 0) & ENVELOPE_FLAG_BITS.TRAIL) !== 0
      ? Math.max(size * 0.62, Math.max(speedX, speedY) * Math.min(duration, 0.2)) * perspective
      : 0;
    const post = logicalPostRadius(command, viewport, scale);
    const radiusX = (xTravel * perspective) + quad + trail + post;
    const radiusY = (yTravel * perspective) + quad + trail + post;
    const components = ['motion', 'rotated-quad', 'glow', 'bloom'];
    if (trail > 0) components.push('trail');
    if (split > 0) components.push('split');
    if (profile.textureExtent) components.push('texture');
    return {
      left: projected.x - radiusX,
      top: projected.y - radiusY,
      right: projected.x + radiusX,
      bottom: projected.y + radiusY,
      components,
      responseScale: projected.scale,
    };
  }

  function rocketEnvelope(command, viewport, profile, scale) {
    const origin = point(command.origin);
    const target = point(command.target, origin);
    const launchDepth = quantizedDepth(command.launchDepth);
    const burstDepth = quantizedDepth(command.burstDepth);
    const projectedTarget = projectPoint(target, burstDepth, viewport);
    const projectedOrigin = projectPoint(origin, launchDepth, viewport);
    const size = positive(command.size, 22) * scale;
    const worldAxis = Math.max(size * profile.bodyAxis, size * profile.flameAxis, size * 1.15);
    const curve = Math.abs(finite(command.curve)) * scale *
      Math.max(projectedOrigin.scale, projectedTarget.scale);
    const post = logicalPostRadius(command, viewport, scale);
    const endpointBounds = projected => {
      const axis = worldAxis * projected.scale + post;
      return {
        left: projected.x - axis - curve,
        top: projected.y - axis,
        right: projected.x + axis + curve,
        bottom: projected.y + axis,
        responseScale: projected.scale,
      };
    };
    const originBounds = endpointBounds(projectedOrigin);
    const targetBounds = endpointBounds(projectedTarget);
    const belowCanvasLaunch = origin.y > viewport.height;
    const constraints = [
      {
        ...originBounds,
        bottom: belowCanvasLaunch ? null : originBounds.bottom,
      },
      targetBounds,
    ];
    return {
      // The authored launch may intentionally begin below-canvas. Its bottom
      // edge is exempt while ascending, but the complete path still constrains
      // top and both sides. Target state always constrains all four edges.
      left: Math.min(originBounds.left, targetBounds.left),
      top: Math.min(originBounds.top, targetBounds.top),
      right: Math.max(originBounds.right, targetBounds.right),
      bottom: belowCanvasLaunch
        ? targetBounds.bottom
        : Math.max(originBounds.bottom, targetBounds.bottom),
      components: profile.variant === 'decal'
        ? ['body', 'decal', 'trail', 'glow', 'bloom']
        : ['body', 'flame', 'trail', 'glow', 'bloom'],
      responseScale: projectedTarget.scale,
      constraints,
    };
  }

  function calculateEnvelope(command, viewport) {
    const width = Math.max(1, finite(viewport?.width, 1));
    const height = Math.max(1, finite(viewport?.height, 1));
    const normalizedViewport = { ...viewport, width, height };
    const profile = getEnvelopeProfile(command);
    const scale = command.admissionScaleApplied === true
      ? 1
      : Math.max(Number.EPSILON, Math.min(1, positive(command.admissionScale, 1) || 1));
    return profile.category === 'rocket'
      ? rocketEnvelope(command, normalizedViewport, profile, scale)
      : shapeEnvelope(command, normalizedViewport, profile, scale);
  }

  function projectVisualEnvelope(command, viewport) {
    const bounds = calculateEnvelope(command, viewport);
    return {
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      components: [...bounds.components],
    };
  }

  const unionBounds = (commands, viewport) => commands.reduce((union, command) => {
    const bounds = projectVisualEnvelope(command, viewport);
    return {
      left: Math.min(union.left, bounds.left),
      top: Math.min(union.top, bounds.top),
      right: Math.max(union.right, bounds.right),
      bottom: Math.max(union.bottom, bounds.bottom),
    };
  }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });

  function transformCommands(commands, translation, scale, positionTransform = null) {
    return commands.map(command => {
      const origin = point(command.origin);
      const target = point(command.target, origin);
      const positionScale = positionTransform?.scale ?? 1;
      const pivot = positionTransform?.pivot ?? { x: 0, y: 0 };
      const scaledOrigin = {
        x: pivot.x + (origin.x - pivot.x) * positionScale,
        y: pivot.y + (origin.y - pivot.y) * positionScale,
      };
      const scaledTarget = {
        x: pivot.x + (target.x - pivot.x) * positionScale,
        y: pivot.y + (target.y - pivot.y) * positionScale,
      };
      const velocity = Array.isArray(command.velocity)
        ? command.velocity.map(component => finite(component) * scale)
        : command.velocity;
      return {
        ...command,
        origin: { x: scaledOrigin.x + translation.dx, y: scaledOrigin.y + translation.dy },
        target: { x: scaledTarget.x + translation.dx, y: scaledTarget.y + translation.dy },
        intensity: finite(command.intensity, 1) * scale,
        size: positive(command.size, 6) * scale,
        gravity: finite(command.gravity, 90) * scale,
        wind: finite(command.wind) * scale,
        curve: finite(command.curve) * scale,
        glowRadius: command.glowRadius === undefined ? undefined : positive(command.glowRadius) * scale,
        trailLength: command.trailLength === undefined ? undefined : positive(command.trailLength) * scale,
        velocity,
        admissionScale: scale,
        admissionScaleApplied: true,
      };
    });
  }

  const within = (bounds, viewport, padding) => (
    bounds.left >= padding - 1e-5 && bounds.top >= padding - 1e-5 &&
    bounds.right <= viewport.width - padding + 1e-5 &&
    bounds.bottom <= viewport.height - padding + 1e-5
  );

  function solveAtScale(commands, viewport, padding, scale, scaleFormation = false) {
    const positionTransform = scaleFormation
      ? { scale, pivot: { x: viewport.width * 0.5, y: viewport.height * 0.5 } }
      : null;
    const scaled = transformCommands(commands, { dx: 0, dy: 0 }, scale, positionTransform);
    let minimumDx = -Infinity;
    let maximumDx = Infinity;
    let minimumDy = -Infinity;
    let maximumDy = Infinity;
    for (const command of scaled) {
      const bounds = calculateEnvelope(command, viewport);
      for (const constraint of bounds.constraints || [bounds]) {
        const response = Math.max(0.5, constraint.responseScale || bounds.responseScale);
        if (Number.isFinite(constraint.left)) {
          minimumDx = Math.max(minimumDx, (padding - constraint.left) / response);
        }
        if (Number.isFinite(constraint.right)) {
          maximumDx = Math.min(maximumDx, (viewport.width - padding - constraint.right) / response);
        }
        if (Number.isFinite(constraint.top)) {
          minimumDy = Math.max(minimumDy, (padding - constraint.top) / response);
        }
        if (Number.isFinite(constraint.bottom)) {
          maximumDy = Math.min(maximumDy, (viewport.height - padding - constraint.bottom) / response);
        }
      }
    }
    if (minimumDx > maximumDx + 1e-7 || minimumDy > maximumDy + 1e-7) return null;
    const translation = {
      dx: Math.max(minimumDx, Math.min(maximumDx, 0)),
      dy: Math.max(minimumDy, Math.min(maximumDy, 0)),
    };
    const transformed = transformCommands(commands, translation, scale, positionTransform);
    const bounds = unionBounds(transformed, viewport);
    return within(bounds, viewport, padding)
      ? { commands: transformed, translation, bounds, positionTransform }
      : null;
  }

  function fitCorrelatedCommands(commands, viewport, options = {}) {
    if (!Array.isArray(commands) || commands.length === 0) {
      throw envelopeError('A visible-envelope fit requires at least one command.', 'ENVELOPE_CANNOT_FIT');
    }
    commands.forEach(getEnvelopeProfile);
    const normalizedViewport = {
      ...viewport,
      width: Math.max(1, finite(viewport?.width, 1)),
      height: Math.max(1, finite(viewport?.height, 1)),
    };
    const padding = Math.max(0, finite(options.paddingPx, 2));
    let solved = solveAtScale(commands, normalizedViewport, padding, 1);
    let scale = 1;
    if (!solved) {
      let low = 0;
      let high = 1;
      for (let iteration = 0; iteration < 36; iteration++) {
        const candidate = (low + high) * 0.5;
        const candidateFit = solveAtScale(commands, normalizedViewport, padding, candidate);
        if (candidateFit) {
          low = candidate;
          solved = candidateFit;
        } else {
          high = candidate;
        }
      }
      scale = low;
    }
    if (!solved) {
      let low = 0;
      let high = 1;
      for (let iteration = 0; iteration < 36; iteration++) {
        const candidate = (low + high) * 0.5;
        const candidateFit = solveAtScale(commands, normalizedViewport, padding, candidate, true);
        if (candidateFit) {
          low = candidate;
          solved = candidateFit;
        } else {
          high = candidate;
        }
      }
      scale = low;
    }
    if (!solved || !Number.isFinite(scale) || scale <= 0) {
      throw envelopeError('The correlated visible envelope cannot fit the active viewport.', 'ENVELOPE_CANNOT_FIT');
    }
    const translated = Math.abs(solved.translation.dx) > 1e-7 || Math.abs(solved.translation.dy) > 1e-7;
    return {
      commands: solved.commands,
      strategy: scale < 1 - 1e-7 ? 'uniform-scale' : translated ? 'translate' : 'none',
      translation: Object.freeze({ ...solved.translation }),
      scale,
      bounds: Object.freeze({ ...solved.bounds }),
      positionTransform: solved.positionTransform
        ? Object.freeze({
            scale: solved.positionTransform.scale,
            pivot: Object.freeze({ ...solved.positionTransform.pivot }),
          })
        : null,
      vertexClampApplied: false,
    };
  }

  function applyCorrelationTransform(commands, fit) {
    if (!fit || !fit.translation || !Number.isFinite(fit.scale) || fit.scale <= 0) {
      throw envelopeError('Invalid cached correlation fit.', 'ENVELOPE_CANNOT_FIT');
    }
    return transformCommands(commands, fit.translation, fit.scale, fit.positionTransform);
  }

  return Object.freeze({
    SHAPE_IDS,
    V2_PRIMITIVE_IDS,
    V2_GLYPH_IDS,
    ROCKET_VARIANTS,
    ENVELOPE_FLAG_BITS,
    ENVELOPE_PROFILES,
    classifyEnvelopeCommand,
    getEnvelopeProfile,
    projectVisualEnvelope,
    fitCorrelatedCommands,
    applyCorrelationTransform,
  });
});
