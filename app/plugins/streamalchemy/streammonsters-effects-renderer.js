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
  const MAX_BACKING_PIXELS = 2073600;
  const ELEMENT_PALETTES = Object.freeze({
    Ember: Object.freeze(['#ff5a36', '#ffb347', '#fff2b0']),
    Tide: Object.freeze(['#2bbcff', '#70f5ff', '#dffbff']),
    Grove: Object.freeze(['#48d17c', '#a8e65c', '#f4ffb0']),
    Gale: Object.freeze(['#8ef3e2', '#d7ffff', '#b9cfff']),
    Volt: Object.freeze(['#ffe45e', '#7efcff', '#ffffff']),
    Lunar: Object.freeze(['#b98cff', '#6e5bff', '#f4e7ff'])
  });
  const ELEMENT_COLORS = Object.freeze(Object.fromEntries(
    Object.entries(ELEMENT_PALETTES)
      .map(([element, palette]) => [element.toLowerCase(), palette[0]])
  ));
  const EFFECT_RECIPES = Object.freeze({
    Ember: Object.freeze({
      attack: Object.freeze({
        id: 'ember:attack',
        element: 'Ember',
        action: 'attack',
        motifCode: 1,
        palette: ELEMENT_PALETTES.Ember,
        description: 'directional flame tongues + rising sparks',
        motifs: Object.freeze(['flame-tongues', 'rising-sparks'])
      }),
      defense: Object.freeze({
        id: 'ember:defense',
        element: 'Ember',
        action: 'defense',
        motifCode: 2,
        palette: ELEMENT_PALETTES.Ember,
        description: 'heat-distortion rings + ember guard',
        motifs: Object.freeze(['heat-distortion-rings', 'ember-guard'])
      }),
      special: Object.freeze({
        id: 'ember:special',
        element: 'Ember',
        action: 'special',
        motifCode: 3,
        palette: ELEMENT_PALETTES.Ember,
        description: 'fire vortex + radial sparks + hot core',
        motifs: Object.freeze(['fire-vortex', 'radial-sparks', 'hot-core'])
      })
    }),
    Tide: Object.freeze({
      attack: Object.freeze({
        id: 'tide:attack',
        element: 'Tide',
        action: 'attack',
        motifCode: 4,
        palette: ELEMENT_PALETTES.Tide,
        description: 'curved water ribbon + droplets',
        motifs: Object.freeze(['curved-water-ribbon', 'droplets'])
      }),
      defense: Object.freeze({
        id: 'tide:defense',
        element: 'Tide',
        action: 'defense',
        motifCode: 5,
        palette: ELEMENT_PALETTES.Tide,
        description: 'concentric tide rings + mist',
        motifs: Object.freeze(['concentric-tide-rings', 'mist'])
      }),
      special: Object.freeze({
        id: 'tide:special',
        element: 'Tide',
        action: 'special',
        motifCode: 6,
        palette: ELEMENT_PALETTES.Tide,
        description: 'cresting wave arcs + foam/mist burst',
        motifs: Object.freeze(['cresting-wave-arcs', 'foam-mist-burst'])
      })
    }),
    Grove: Object.freeze({
      attack: Object.freeze({
        id: 'grove:attack',
        element: 'Grove',
        action: 'attack',
        motifCode: 7,
        palette: ELEMENT_PALETTES.Grove,
        description: 'winding vine + leaf shards',
        motifs: Object.freeze(['winding-vine', 'leaf-shards'])
      }),
      defense: Object.freeze({
        id: 'grove:defense',
        element: 'Grove',
        action: 'defense',
        motifCode: 8,
        palette: ELEMENT_PALETTES.Grove,
        description: 'root/crystal barrier',
        motifs: Object.freeze(['root-crystal-barrier'])
      }),
      special: Object.freeze({
        id: 'grove:special',
        element: 'Grove',
        action: 'special',
        motifCode: 9,
        palette: ELEMENT_PALETTES.Grove,
        description: 'root eruption + leaf spiral + crystal bloom',
        motifs: Object.freeze(['root-eruption', 'leaf-spiral', 'crystal-bloom'])
      })
    }),
    Gale: Object.freeze({
      attack: Object.freeze({
        id: 'gale:attack',
        element: 'Gale',
        action: 'attack',
        motifCode: 10,
        palette: ELEMENT_PALETTES.Gale,
        description: 'fast wind ribbons + feathers',
        motifs: Object.freeze(['fast-wind-ribbons', 'feathers'])
      }),
      defense: Object.freeze({
        id: 'gale:defense',
        element: 'Gale',
        action: 'defense',
        motifCode: 11,
        palette: ELEMENT_PALETTES.Gale,
        description: 'pressure rings',
        motifs: Object.freeze(['pressure-rings'])
      }),
      special: Object.freeze({
        id: 'gale:special',
        element: 'Gale',
        action: 'special',
        motifCode: 12,
        palette: ELEMENT_PALETTES.Gale,
        description: 'cyclone ribbons + feather burst',
        motifs: Object.freeze(['cyclone-ribbons', 'feather-burst'])
      })
    }),
    Volt: Object.freeze({
      attack: Object.freeze({
        id: 'volt:attack',
        element: 'Volt',
        action: 'attack',
        motifCode: 13,
        palette: ELEMENT_PALETTES.Volt,
        description: 'branching lightning + afterimage',
        motifs: Object.freeze(['branching-lightning', 'afterimage'])
      }),
      defense: Object.freeze({
        id: 'volt:defense',
        element: 'Volt',
        action: 'defense',
        motifCode: 14,
        palette: ELEMENT_PALETTES.Volt,
        description: 'static afterimage shell',
        motifs: Object.freeze(['static-afterimage-shell'])
      }),
      special: Object.freeze({
        id: 'volt:special',
        element: 'Volt',
        action: 'special',
        motifCode: 15,
        palette: ELEMENT_PALETTES.Volt,
        description: 'chain-lightning storm + white flash',
        motifs: Object.freeze(['chain-lightning-storm', 'white-flash'])
      })
    }),
    Lunar: Object.freeze({
      attack: Object.freeze({
        id: 'lunar:attack',
        element: 'Lunar',
        action: 'attack',
        motifCode: 16,
        palette: ELEMENT_PALETTES.Lunar,
        description: 'travelling crescents + stars',
        motifs: Object.freeze(['travelling-crescents', 'stars'])
      }),
      defense: Object.freeze({
        id: 'lunar:defense',
        element: 'Lunar',
        action: 'defense',
        motifCode: 17,
        palette: ELEMENT_PALETTES.Lunar,
        description: 'shadow veil',
        motifs: Object.freeze(['shadow-veil'])
      }),
      special: Object.freeze({
        id: 'lunar:special',
        element: 'Lunar',
        action: 'special',
        motifCode: 18,
        palette: ELEMENT_PALETTES.Lunar,
        description: 'eclipse disc + crescents + orbiting stars',
        motifs: Object.freeze(['eclipse-disc', 'crescents', 'orbiting-stars'])
      })
    })
  });
  const PARTICLE_PROFILES = Object.freeze({
    'ember:attack': Object.freeze([1, 1, 0.32, 0.78, 0.2, 1.65, 3, 0.12]),
    'ember:defense': Object.freeze([2, 1, 0.18, 0.54, 0.42, 1.3, 4, 0.28]),
    'ember:special': Object.freeze([3, 1, 0.72, 0.92, 0.16, 1.85, 6, 0.46]),
    'tide:attack': Object.freeze([1, 2, 0.86, 0.36, 0.48, 1.9, 2, 0.2]),
    'tide:defense': Object.freeze([2, 2, 0.52, 0.28, 0.64, 1.45, 5, 0.34]),
    'tide:special': Object.freeze([3, 2, 0.94, 0.48, 0.34, 2.05, 4, 0.58]),
    'grove:attack': Object.freeze([1, 3, 0.68, 0.44, 0.58, 1.5, 3, 0.26]),
    'grove:defense': Object.freeze([2, 3, 0.24, 0.18, 0.82, 1.18, 5, 0.4]),
    'grove:special': Object.freeze([3, 3, 0.58, 0.62, 0.72, 1.7, 7, 0.64]),
    'gale:attack': Object.freeze([1, 4, 0.42, 0.88, 0.3, 2.2, 2, 0.32]),
    'gale:defense': Object.freeze([2, 4, 0.36, 0.7, 0.54, 1.82, 4, 0.48]),
    'gale:special': Object.freeze([3, 4, 0.84, 0.96, 0.38, 2.35, 8, 0.7]),
    'volt:attack': Object.freeze([1, 5, 0.12, 1, 0.14, 2.45, 5, 0.38]),
    'volt:defense': Object.freeze([2, 5, 0.08, 0.84, 0.36, 2, 6, 0.54]),
    'volt:special': Object.freeze([3, 5, 0.28, 1, 0.2, 2.6, 9, 0.76]),
    'lunar:attack': Object.freeze([1, 6, 0.74, 0.3, 0.66, 1.62, 4, 0.44]),
    'lunar:defense': Object.freeze([2, 6, 0.46, 0.22, 0.9, 1.28, 3, 0.6]),
    'lunar:special': Object.freeze([3, 6, 0.9, 0.52, 0.78, 1.92, 10, 0.82])
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
      attack: EFFECT_RECIPES.Ember.attack.motifs,
      defense: EFFECT_RECIPES.Ember.defense.motifs,
      special: EFFECT_RECIPES.Ember.special.motifs
    }),
    Tide: Object.freeze({
      code: 2,
      attack: EFFECT_RECIPES.Tide.attack.motifs,
      defense: EFFECT_RECIPES.Tide.defense.motifs,
      special: EFFECT_RECIPES.Tide.special.motifs
    }),
    Grove: Object.freeze({
      code: 3,
      attack: EFFECT_RECIPES.Grove.attack.motifs,
      defense: EFFECT_RECIPES.Grove.defense.motifs,
      special: EFFECT_RECIPES.Grove.special.motifs
    }),
    Gale: Object.freeze({
      code: 4,
      attack: EFFECT_RECIPES.Gale.attack.motifs,
      defense: EFFECT_RECIPES.Gale.defense.motifs,
      special: EFFECT_RECIPES.Gale.special.motifs
    }),
    Volt: Object.freeze({
      code: 5,
      attack: EFFECT_RECIPES.Volt.attack.motifs,
      defense: EFFECT_RECIPES.Volt.defense.motifs,
      special: EFFECT_RECIPES.Volt.special.motifs
    }),
    Lunar: Object.freeze({
      code: 6,
      attack: EFFECT_RECIPES.Lunar.attack.motifs,
      defense: EFFECT_RECIPES.Lunar.defense.motifs,
      special: EFFECT_RECIPES.Lunar.special.motifs
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

  const PARTICLE_SHADER = `
struct Uniforms {
  frame: vec4<f32>,
  primary: vec4<f32>,
  secondary: vec4<f32>,
  tertiary: vec4<f32>,
  effect: vec4<f32>,
  placement: vec4<f32>,
  basis: vec4<f32>,
  target: vec4<f32>,
  outcome: vec4<f32>,
  detail: vec4<f32>,
  motion: vec4<f32>,
  shape: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct Output {
  @builtin(position) position: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) tint: vec4<f32>,
};

fn hash11(value: f32) -> f32 {
  return fract(sin(value * 127.1 + u.effect.y * 311.7) * 43758.5453);
}

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> Output {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0)
  );
  let index = f32(instanceIndex);
  let count = max(1.0, u.detail.z);
  let lane = (index + 0.5) / count;
  let jitter = hash11(index + 3.0) - 0.5;
  let phase = fract(lane + u.frame.y * (0.42 + hash11(index + 9.0) * 0.58));
  let motionCode = u.motion.x;
  let shapeCode = u.motion.y;
  let curvature = u.motion.z;
  let turbulence = u.motion.w;
  var center = u.placement.xy;
  var size = (0.009 + hash11(index + 21.0) * 0.014) *
    (0.82 + min(3.0, u.effect.x) * 0.08);
  if (motionCode == 1.0) {
    center = mix(u.placement.xy, u.target.xy, phase);
    let arc = sin(phase * 3.141593) * curvature * 0.075;
    let ripple = sin(phase * (5.0 + u.shape.z) + u.frame.x * 8.0 + u.shape.w);
    center += u.basis.zw * (arc + ripple * turbulence * 0.018);
    center += u.basis.zw * jitter * turbulence * 0.04;
    size *= (0.66 + 0.72 * (1.0 - abs(phase - 0.72))) * u.shape.y;
  } else if (motionCode == 2.0) {
    let angle = lane * 6.283185 + u.frame.x * (0.3 + turbulence) + u.shape.w;
    let radius = 0.1 + 0.16 * curvature + 0.07 * hash11(index + 5.0) +
      u.outcome.x * 0.002;
    center += vec2<f32>(cos(angle), sin(angle)) * radius;
    size *= 0.72 + u.shape.x * 0.58;
  } else if (motionCode == 3.0) {
    let angle = lane * 6.283185 * max(1.0, u.shape.z * 0.5) +
      u.frame.x * (0.65 + turbulence) + u.shape.w;
    let radius = 0.035 + (0.18 + curvature * 0.17) * phase;
    center += vec2<f32>(cos(angle), sin(angle)) * radius;
    center += u.basis.zw * sin(angle * 0.5) * turbulence * 0.025;
    size *= (0.78 + u.outcome.y * 0.025) * u.shape.y;
  } else {
    let angle = lane * 6.283185 + u.frame.x;
    center += vec2<f32>(cos(angle), sin(angle)) * (0.05 + phase * 0.26);
  }
  center.y = min(center.y, 0.735);
  let aspect = max(0.1, u.frame.w);
  var profileScale = vec2<f32>(1.0, 1.0);
  if (shapeCode == 1.0) {
    profileScale = vec2<f32>(0.72, 1.35);
  } else if (shapeCode == 2.0) {
    profileScale = vec2<f32>(0.78, 1.18);
  } else if (shapeCode == 3.0) {
    profileScale = vec2<f32>(1.0, 1.0 + u.shape.x * 0.24);
  } else if (shapeCode == 4.0) {
    profileScale = vec2<f32>(1.45, 0.48);
  } else if (shapeCode == 5.0) {
    profileScale = vec2<f32>(1.65, 0.34);
  }
  let local = corners[vertexIndex] * size * profileScale;
  let clip = vec2<f32>(
    (center.x + local.x / aspect) * 2.0 - 1.0,
    1.0 - (center.y + local.y) * 2.0
  );
  var output: Output;
  output.position = vec4<f32>(clip, 0.0, 1.0);
  output.local = corners[vertexIndex];
  let colorMix = hash11(index + u.effect.z);
  output.tint = mix(u.primary, mix(u.secondary, u.tertiary, colorMix), colorMix * 0.72);
  return output;
}

@fragment
fn fragmentMain(input: Output) -> @location(0) vec4<f32> {
  let radius = length(input.local);
  let shapeCode = u.motion.y;
  let softDisc = 1.0 - smoothstep(0.25, 1.0, radius);
  let taper = clamp(u.shape.x, 0.05, 0.95);
  var shape = softDisc;
  if (shapeCode == 1.0) {
    let flameWidth = mix(0.68, 0.16, clamp((input.local.y + 1.0) * 0.5, 0.0, 1.0));
    shape = 1.0 - smoothstep(flameWidth * 0.55, flameWidth, abs(input.local.x));
    shape *= 1.0 - smoothstep(0.72, 1.0, abs(input.local.y));
  } else if (shapeCode == 2.0) {
    let droplet = length(vec2<f32>(input.local.x, input.local.y + taper * 0.35));
    shape = 1.0 - smoothstep(0.42, 0.88, droplet);
  } else if (shapeCode == 3.0) {
    let crystal = abs(input.local.x) + abs(input.local.y) * mix(0.72, 1.2, taper);
    shape = 1.0 - smoothstep(0.58, 0.96, crystal);
  } else if (shapeCode == 4.0) {
    let feather = 1.0 - smoothstep(0.1, 0.42, abs(input.local.y));
    shape = feather * (1.0 - smoothstep(0.72, 1.0, abs(input.local.x)));
  } else if (shapeCode == 5.0) {
    let bolt = abs(input.local.y - sin(input.local.x * u.shape.z) * 0.18);
    shape = 1.0 - smoothstep(0.08, 0.24, bolt);
  } else if (shapeCode == 6.0) {
    let outer = 1.0 - smoothstep(0.7, 0.96, radius);
    let cutout = 1.0 - smoothstep(0.42, 0.7, length(input.local - vec2<f32>(0.28, 0.0)));
    let star = 1.0 - smoothstep(0.14, 0.34, min(abs(input.local.x), abs(input.local.y)));
    shape = max(outer * (1.0 - cutout), star * 0.74);
  }
  let cadence = 0.72 + 0.28 * sin(
    u.frame.x * 12.0 + u.target.z * 2.1 + u.target.w + u.outcome.w
  );
  let outcomeEnergy = min(
    1.0,
    (u.outcome.x + u.outcome.y + u.detail.x + u.detail.y) * 0.018 +
      u.outcome.z * 0.32
  );
  let alpha = clamp(shape * cadence * (0.46 + outcomeEnergy), 0.0, 0.78);
  return vec4<f32>(input.tint.rgb * alpha, alpha);
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
    const recipe = EFFECT_RECIPES[canonicalElement][scene];
    return {
      id: recipe.id,
      code: catalog.code,
      element: canonicalElement.toLowerCase(),
      scene,
      motifCode: recipe.motifCode,
      description: recipe.description,
      palette: [...recipe.palette],
      motifs: [...recipe.motifs]
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

  function hashKey(vfxKey) {
    let hash = 2166136261;
    for (const character of String(vfxKey || 'streammonsters:default')) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function vfxParameters(vfxKey) {
    const unsigned = hashKey(vfxKey);
    return {
      variant: (unsigned % 7) + 1,
      twist: ((unsigned >>> 8) % 5) + 1,
      spread: ((unsigned >>> 16) % 4) + 1,
      accentSeed: unsigned / 4294967295
    };
  }

  function resolveEffectRecipe(payload = {}) {
    const element = normalizeElement(
      payload.element || payload.monster?.element || payload.actor?.element
    );
    const requestedAction = String(
      payload.action || payload.scene || payload.skill?.type || ''
    ).trim().toLowerCase();
    const action = ['attack', 'defense', 'special'].includes(requestedAction)
      ? requestedAction
      : 'attack';
    const recipe = EFFECT_RECIPES[element][action];
    const vfxKey = payload.vfxKey || payload.skill?.vfxKey || payload.skill?.vfx_key ||
      `${element.toLowerCase()}:${action}`;
    return {
      ...recipe,
      palette: [...recipe.palette],
      motifs: [...recipe.motifs],
      accentSeed: vfxParameters(vfxKey).accentSeed
    };
  }

  function attackBasis(origin, target) {
    const safeOrigin = normalizedOrigin(origin);
    const safeTarget = normalizedOrigin(target, safeOrigin);
    const dx = safeTarget.x - safeOrigin.x;
    const dy = safeTarget.y - safeOrigin.y;
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance < 0.000001) {
      return {
        longitudinal: { x: 1, y: 0 },
        lateral: { x: 0, y: 1 },
        distance: 0
      };
    }
    const longitudinal = {
      x: dx / distance,
      y: dy / distance
    };
    return {
      longitudinal,
      lateral: {
        x: longitudinal.y === 0 ? 0 : -longitudinal.y,
        y: longitudinal.x
      },
      distance: Number(distance.toFixed(6))
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
    const requestedDuration = Number(payload.durationMs);
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
    const recipe = ['attack', 'defense', 'special'].includes(normalizedScene)
      ? resolveEffectRecipe({
          element,
          action: normalizedScene,
          vfxKey
        })
      : null;
    const basis = attackBasis(origin, targetOrigin);
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
      recipe,
      basis,
      metadata: effectMetadata(payload),
      role: payload.role || payload.skill?.role || null,
      skillEffects: Array.isArray(payload.skillEffects)
        ? [...payload.skillEffects]
        : (Array.isArray(payload.skill?.effects) ? [...payload.skill.effects] : []),
      quality,
      effectiveQuality,
      budget: QUALITY_BUDGETS[effectiveQuality],
      scale: Number.isFinite(requestedScale)
        ? Math.max(0.7, Math.min(1.3, requestedScale))
        : 1,
      duration: Number.isFinite(requestedDuration)
        ? Math.max(250, Math.min(SCENE_DURATIONS[normalizedScene], Math.round(requestedDuration)))
        : SCENE_DURATIONS[normalizedScene]
    };
  }

  function primaryStatusCode(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (!normalized) return 0;
    const known = {
      burn: 1,
      shock: 2,
      weaken: 3,
      thorns: 4,
      reflect: 5,
      evade: 6,
      lifesteal: 7,
      poison: 8,
      shield: 9
    };
    return known[normalized] || ((hashKey(normalized) % 7) + 10);
  }

  function buildEffectUniforms(scene, frame = {}) {
    const timestamp = Number(frame.timestamp) || 0;
    const progress = Math.max(0, Math.min(1, Number(frame.progress) || 0));
    const phaseCode = Math.max(0, Number(frame.phaseCode) || 0);
    const aspect = Math.max(0.1, Number(frame.aspect) || 1);
    const recipe = scene.recipe || resolveEffectRecipe({
      element: scene.element,
      action: scene.scene,
      vfxKey: scene.vfxKey
    });
    const palette = recipe.palette || ELEMENT_PALETTES[scene.element] ||
      ELEMENT_PALETTES.Lunar;
    const primary = hexColor(palette[0]);
    const secondary = hexColor(palette[1]);
    const tertiary = hexColor(palette[2]);
    const basis = scene.basis || attackBasis(scene.origin, scene.targetOrigin);
    const statuses = Array.isArray(scene.metadata?.statuses)
      ? scene.metadata.statuses
      : [];
    const primaryStatus = statuses.find(status => status !== 'evade') || statuses[0] || '';
    const resolvedQuality = normalizeQuality(frame.quality || scene.effectiveQuality || scene.quality);
    const budget = QUALITY_BUDGETS[resolvedQuality];
    const accentSeed = Number(recipe.accentSeed) || scene.vfx?.accentSeed || 0;
    const particleProfile = PARTICLE_PROFILES[recipe.id] ||
      PARTICLE_PROFILES['lunar:attack'];
    const semantic = {
      recipeId: recipe.id,
      motifCode: recipe.motifCode,
      accentSeed,
      origin: { ...scene.origin },
      targetOrigin: { ...scene.targetOrigin },
      basis,
      hitIndex: scene.hit.index,
      hitCount: scene.hit.count,
      shield: scene.metadata.shield,
      heal: scene.metadata.heal,
      evade: statuses.includes('evade') ? 1 : 0,
      primaryStatus,
      statusCode: primaryStatusCode(primaryStatus),
      particleCount: budget.particles,
      particleProfile: [...particleProfile]
    };
    const values = new Float32Array([
      timestamp / 1000,
      progress,
      SCENE_CODES[scene.scene],
      aspect,
      ...primary,
      ...secondary,
      ...tertiary,
      phaseCode,
      accentSeed,
      recipe.motifCode,
      QUALITY_CODES[resolvedQuality],
      scene.origin.x,
      scene.origin.y,
      scene.scale,
      basis.distance,
      basis.longitudinal.x,
      basis.longitudinal.y,
      basis.lateral.x,
      basis.lateral.y,
      scene.targetOrigin.x,
      scene.targetOrigin.y,
      scene.hit.index,
      scene.hit.count,
      scene.metadata.shield,
      scene.metadata.heal,
      semantic.evade,
      semantic.statusCode,
      scene.metadata.damage,
      scene.metadata.shieldAbsorbed,
      budget.particles,
      0,
      ...particleProfile
    ]);
    return { values, semantic };
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
    let ownedDevice = null;
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
    let destroyed = false;
    let initializationGeneration = 0;

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
      if (destroyed) return rendererMode;
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
      const generation = ++initializationGeneration;
      if (destroyed) return rendererMode;
      reducedMotion = Boolean(mediaQuery('(prefers-reduced-motion: reduce)')?.matches);
      if (reducedMotion) return switchToFallback('reduced-motion');
      if (!canvas || !navigatorLike?.gpu?.requestAdapter) return switchToFallback('webgpu-unavailable');
      try {
        const adapter = await navigatorLike.gpu.requestAdapter();
        if (destroyed || generation !== initializationGeneration) return rendererMode;
        if (!adapter) return switchToFallback('adapter-unavailable');
        const acquiredDevice = await adapter.requestDevice();
        if (destroyed || generation !== initializationGeneration) {
          try {
            acquiredDevice?.destroy?.();
          } catch (_) {}
          return rendererMode;
        }
        ownedDevice = acquiredDevice;
        device = acquiredDevice;
        context = canvas.getContext?.('webgpu');
        if (!device || !context) return switchToFallback('context-unavailable');
        const format = navigatorLike.gpu.getPreferredCanvasFormat?.() || 'bgra8unorm';
        context.configure({ device, format, alphaMode: 'premultiplied' });
        const shader = device.createShaderModule({
          label: 'Stream Monsters instanced particle shader',
          code: PARTICLE_SHADER
        });
        pipeline = device.createRenderPipeline({
          label: 'Stream Monsters instanced particle pipeline',
          layout: 'auto',
          vertex: { module: shader, entryPoint: 'vertexMain', buffers: [] },
          fragment: {
            module: shader,
            entryPoint: 'fragmentMain',
            targets: [{
              format,
              blend: {
                color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
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
          size: 192,
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
        if (destroyed || generation !== initializationGeneration) return rendererMode;
        return switchToFallback('initialization-failed');
      }
    }

    function resize() {
      if (!canvas) return;
      const ratio = Math.max(1, Number(globalThis.devicePixelRatio) || 1);
      const requestedWidth = Math.max(
        1,
        Math.round((canvas.clientWidth || canvas.width || 1) * ratio)
      );
      const requestedHeight = Math.max(
        1,
        Math.round((canvas.clientHeight || canvas.height || 1) * ratio)
      );
      const pixelScale = Math.min(
        1,
        Math.sqrt(MAX_BACKING_PIXELS / (requestedWidth * requestedHeight))
      );
      const width = Math.max(1, Math.floor(requestedWidth * pixelScale));
      const height = Math.max(1, Math.floor(requestedHeight * pixelScale));
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
      canvas.style?.setProperty?.('--sm-effect-color-secondary', scene.recipe?.palette?.[1] || scene.color);
      canvas.style?.setProperty?.('--sm-effect-color-tertiary', scene.recipe?.palette?.[2] || '#ffffff');
      canvas.style?.setProperty?.('--sm-effect-origin-x', `${scene.origin.x * 100}%`);
      canvas.style?.setProperty?.('--sm-effect-origin-y', `${scene.origin.y * 100}%`);
      canvas.style?.setProperty?.('--sm-effect-target-x', `${scene.targetOrigin.x * 100}%`);
      canvas.style?.setProperty?.('--sm-effect-target-y', `${scene.targetOrigin.y * 100}%`);
      canvas.style?.setProperty?.('--sm-effect-bloom', String(budget.bloom));
      canvas.style?.setProperty?.(
        '--sm-effect-angle',
        `${Math.atan2(
          scene.targetOrigin.y - scene.origin.y,
          scene.targetOrigin.x - scene.origin.x
        ) * 180 / Math.PI}deg`
      );
    }

    function renderWebGpu(scene, progress, timestamp) {
      if (!device || !pipeline || !uniformBuffer || !bindGroup || !context) {
        switchToFallback('device-lost');
        return;
      }
      try {
        resize();
        const phase = phaseForProgress(scene.scene, progress);
        applySurfaceContract(scene, phase);
        const resolvedQuality = sceneEffectiveQuality(scene);
        const uniforms = buildEffectUniforms(scene, {
          timestamp,
          progress,
          phaseCode: phase.code,
          aspect: Math.max(0.1, canvas.width / Math.max(1, canvas.height)),
          quality: resolvedQuality
        });
        device.queue.writeBuffer(uniformBuffer, 0, uniforms.values);
        const encoder = device.createCommandEncoder({
          label: 'Stream Monsters transparent particle frame'
        });
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
        pass.draw(6, uniforms.semantic.particleCount);
        pass.end();
        device.queue.submit([encoder.finish()]);
      } catch (_) {
        switchToFallback('frame-error');
      }
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
          '--sm-effect-color-secondary',
          '--sm-effect-color-tertiary',
          '--sm-effect-origin-x',
        '--sm-effect-origin-y',
        '--sm-effect-target-x',
        '--sm-effect-target-y',
          '--sm-effect-bloom',
          '--sm-effect-angle'
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
      const hasMotif = (...names) => names.some(name => motifs.has(name));
      const resolvedQuality = sceneEffectiveQuality(scene);
      const budget = QUALITY_BUDGETS[resolvedQuality];
      const detail = Math.max(2, Math.ceil(budget.particles / 18));
      const basis = scene.basis || attackBasis(scene.origin, scene.targetOrigin);
      const targetX = basis.longitudinal.x * basis.distance * width / scene.scale;
      const targetY = basis.longitudinal.y * basis.distance * height / scene.scale;
      const hitOffset = (scene.hit.index - 1) / Math.max(1, scene.hit.count);
      context2d.lineWidth = Math.max(
        2,
        Math.min(width, height) * (0.007 + budget.bloom * 0.006)
      );
      context2d.setLineDash?.([]);
      context2d.beginPath();

      if (hasMotif('rising-sparks', 'radial-sparks')) {
        for (let index = 0; index < detail; index += 1) {
          const angle = (index / detail) * Math.PI * 2 + progress * 5;
          const inner = radius * (0.35 + (index % 3) * 0.08);
          const outer = radius * (0.8 + (index % 2) * 0.2);
          context2d.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
          context2d.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        }
      }
      if (hasMotif('flame-tongues', 'fire-vortex', 'hot-core')) {
        for (let tongue = -1; tongue <= 1; tongue += 1) {
          const offset = tongue * radius * 0.22;
          context2d.moveTo(0, radius * 0.5 + offset);
          context2d.quadraticCurveTo?.(
            targetX * (0.34 + tongue * 0.04) + radius * (0.2 + hitOffset),
            -radius * (1.3 - Math.abs(tongue) * 0.22) + offset,
            targetX,
            targetY + offset * 0.18
          );
        }
      }
      if (hasMotif('heat-distortion-rings', 'ember-guard')) {
        for (let ring = 1; ring <= budget.layers; ring += 1) {
          context2d.moveTo(radius * ring * 0.3, 0);
          context2d.arc(0, 0, radius * ring * 0.3, 0, Math.PI * 2);
        }
      }
      if (hasMotif('curved-water-ribbon', 'cresting-wave-arcs', 'foam-mist-burst')) {
        context2d.moveTo(0, radius * 0.2);
        context2d.quadraticCurveTo?.(0, -radius * 1.15, targetX, targetY);
        context2d.moveTo(0, radius * 0.45);
        context2d.quadraticCurveTo?.(radius * 0.15, -radius * 0.7, targetX, targetY);
      }
      if (hasMotif('concentric-tide-rings')) {
        for (let ring = 1; ring <= budget.layers; ring += 1) {
          context2d.moveTo(radius * ring * 0.28, 0);
          context2d.arc(0, 0, radius * ring * 0.28, Math.PI * 1.1, Math.PI * 2.9);
        }
      }
      if (hasMotif('mist', 'foam-mist-burst')) {
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
      if (hasMotif('winding-vine', 'root-eruption')) {
        context2d.moveTo(0, radius * 0.45);
        context2d.bezierCurveTo?.(
          radius * 0.25,
          -radius,
          targetX * 0.6,
          radius * 0.8,
          targetX,
          targetY
        );
      }
      if (hasMotif('leaf-shards', 'leaf-spiral')) {
        for (let leaf = 0; leaf < detail; leaf += 1) {
          const ratio = (leaf + 1) / (detail + 1);
          const x = targetX * ratio;
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
      if (hasMotif('root-crystal-barrier', 'crystal-bloom')) {
        context2d.moveTo(0, -radius);
        context2d.lineTo(radius * 0.62, -radius * 0.12);
        context2d.lineTo(radius * 0.3, radius * 0.82);
        context2d.lineTo(-radius * 0.35, radius * 0.82);
        context2d.lineTo(-radius * 0.62, -radius * 0.12);
        context2d.closePath?.();
      }
      if (hasMotif('fast-wind-ribbons', 'cyclone-ribbons')) {
        for (let ribbon = 0; ribbon < budget.layers; ribbon += 1) {
          const offset = (ribbon - budget.layers / 2) * radius * 0.18;
          context2d.moveTo(0, offset);
          context2d.bezierCurveTo?.(
            radius * 0.2,
            -radius * 0.7 + offset,
            targetX * 0.55,
            radius * 0.7 + offset,
            targetX,
            targetY + offset
          );
        }
      }
      if (hasMotif('feathers', 'feather-burst')) {
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
      if (hasMotif('pressure-rings')) {
        for (let ring = 1; ring <= budget.layers + 1; ring += 1) {
          context2d.moveTo(radius * ring * 0.22, 0);
          context2d.arc(0, 0, radius * ring * 0.22, 0, Math.PI * 2);
        }
      }
      if (hasMotif('branching-lightning', 'chain-lightning-storm')) {
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
      if (hasMotif('afterimage', 'static-afterimage-shell')) {
        for (let image = 1; image <= budget.layers; image += 1) {
          const ratio = image / (budget.layers + 1);
          context2d.moveTo(targetX * ratio - radius * 0.18, targetY * ratio);
          context2d.lineTo(targetX * ratio + radius * 0.18, targetY * ratio);
        }
      }
      if (hasMotif('travelling-crescents', 'crescents')) {
        context2d.moveTo(radius * 0.85, 0);
        context2d.arc(0, 0, radius * 0.85, -Math.PI * 0.55, Math.PI * 0.55);
        context2d.moveTo(radius * 0.62, 0);
        context2d.arc(radius * 0.18, 0, radius * 0.62, -Math.PI * 0.52, Math.PI * 0.52);
      }
      if (hasMotif('shadow-veil', 'eclipse-disc')) {
        context2d.moveTo(radius, 0);
        context2d.ellipse?.(0, 0, radius, radius * 0.48, 0, 0, Math.PI * 2);
      }
      if (hasMotif('stars', 'orbiting-stars')) {
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
      canvas2d.rotate(scene.scene === 'attack' ? 0 : (scene.vfx.twist - 3) * 0.018);
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
        const basis = scene.basis || attackBasis(scene.origin, scene.targetOrigin);
        const targetX = basis.longitudinal.x * basis.distance * width / scene.scale;
        const targetY = basis.longitudinal.y * basis.distance * height / scene.scale;
        canvas2d.moveTo(0, radius * 0.08);
        canvas2d.lineTo(targetX, targetY);
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
      if (destroyed) return;
      destroyed = true;
      initializationGeneration += 1;
      const deviceToDestroy = ownedDevice;
      const interrupted = activeScene;
      if (frameHandle != null) cancelFrame(frameHandle);
      if (activeScene?.timer != null) clearTimer(activeScene.timer);
      clearSurface();
      if (interrupted?.resolve) {
        interrupted.resolve({
          scene: interrupted.scene,
          duration: interrupted.duration,
          mode: rendererMode,
          reducedMotion,
          signature: interrupted.signature.id,
          hit: { ...interrupted.hit },
          metadata: {
            ...interrupted.metadata,
            statuses: [...interrupted.metadata.statuses]
          },
          quality: interrupted.quality,
          effectiveQuality: sceneEffectiveQuality(interrupted),
          interrupted: true,
          destroyed: true
        });
      }
      try {
        deviceToDestroy?.destroy?.();
      } catch (_) {}
      frameHandle = null;
      activeScene = null;
      device = null;
      ownedDevice = null;
      context = null;
      canvas2d = null;
      pipeline = null;
      uniformBuffer = null;
      bindGroup = null;
      lastFrameAt = null;
      fpsSamples = [];
      rendererMode = 'destroyed';
      fallbackReason = 'destroyed';
      if (canvas?.dataset) {
        canvas.dataset.renderer = 'destroyed';
        canvas.dataset.rendererBackend = 'destroyed';
        canvas.dataset.fallbackReason = 'destroyed';
      }
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
        fpsDegraded,
        active: Boolean(activeScene),
        destroyed
      })
    };
  }

  return {
    CHOREOGRAPHY,
    EFFECT_RECIPES,
    ELEMENT_COLORS,
    ELEMENT_PALETTES,
    ELEMENT_SIGNATURES,
    MAX_BACKING_PIXELS,
    PARTICLE_PROFILES,
    QUALITY_BUDGETS,
    SCENE_DURATIONS,
    attackBasis,
    buildEffectUniforms,
    colorForElement,
    createEffectsRenderer,
    effectMetadata,
    phaseForProgress,
    resolveEffectRecipe,
    sceneChoreography
  };
}));
