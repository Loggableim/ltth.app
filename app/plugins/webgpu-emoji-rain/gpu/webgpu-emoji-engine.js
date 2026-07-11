'use strict';

(() => {
  const GPU_CAPACITY = 4096;
  const PARTICLE_STRIDE = 112;
  const UNIFORM_SIZE = 128;
  const SPAWN_COMMAND_CAPACITY = 512;
  const MAX_PENDING_SPAWNS = GPU_CAPACITY * 2;
  const ATLAS_SIZE = 2048;
  const ATLAS_SLOT_SIZE = 128;
  const ATLAS_COLUMNS = ATLAS_SIZE / ATLAS_SLOT_SIZE;
  const ATLAS_CAPACITY = ATLAS_COLUMNS * ATLAS_COLUMNS;
  const GRID_COLUMNS = 64;
  const GRID_ROWS = 36;
  const GRID_CELLS = GRID_COLUMNS * GRID_ROWS;
  const ACTIVE_FLAG = 1;
  const DEFAULT_ASSET = '\u{1F327}\u{FE0F}';

  const QUALITY = Object.freeze({
    performance: { particles: 768, renderScale: 0.7, bloom: false, trails: false, spawnBudget: 128 },
    balanced: { particles: 1536, renderScale: 0.86, bloom: true, trails: true, spawnBudget: 256 },
    high: { particles: 3072, renderScale: 1, bloom: true, trails: true, spawnBudget: 512 },
    auto: { particles: 1536, renderScale: 0.9, bloom: true, trails: true, spawnBudget: 384 }
  });

  const PROFILE = Object.freeze({ hybrid: 0, cinematic: 1, neon: 2 });
  const PROFILE_TUNING = Object.freeze({
    hybrid: { bloom: 1, trail: 0.84, glow: 1, gravity: 1, saturation: 1 },
    cinematic: { bloom: 0.72, trail: 0.76, glow: 0.74, gravity: 0.92, saturation: 0.86 },
    neon: { bloom: 1.62, trail: 0.925, glow: 1.7, gravity: 1.04, saturation: 1.28 }
  });

  const KIND = Object.freeze({
    rain: 0,
    balloon: 1,
    burst: 2,
    spark: 3,
    gift: 4,
    sticker: 5,
    profile: 6,
    like: 7,
    follow: 8,
    share: 9,
    subscribe: 10,
    superfan: 11,
    profileBalloon: 12
  });

  const FRAME_FLAG = Object.freeze({
    floor: 1,
    bounce: 2,
    rainbow: 4,
    pixel: 8,
    glow: 16,
    particles: 32,
    depth: 64,
    shadows: 128
  });

  const COMPUTE_WGSL = /* wgsl */`
struct Particle {
  position: vec2<f32>,
  velocity: vec2<f32>,
  color: vec4<f32>,
  params0: vec4<f32>,
  params1: vec4<f32>,
  size: f32,
  rotation: f32,
  angularVelocity: f32,
  life: f32,
  maxLife: f32,
  fadeSeconds: f32,
  textureSlot: u32,
  kind: u32,
  flags: u32,
  material: u32,
  seed: f32,
  padding: f32,
};

struct FrameUniforms {
  viewport: vec2<f32>,
  deltaTime: f32,
  time: f32,
  gravity: vec2<f32>,
  wind: f32,
  windVariation: f32,
  intensity: f32,
  floorY: f32,
  collisionScale: f32,
  trailDecay: f32,
  profile: f32,
  speed: f32,
  friction: f32,
  bounceDamping: f32,
  bounds: vec4<f32>,
  gridSize: vec2<u32>,
  cellSize: vec2<f32>,
  rainbowSpeed: f32,
  pixelSize: f32,
  flags: u32,
  logicalLimit: u32,
  postLevel: f32,
  targetFrameMs: f32,
  padding: vec2<f32>,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> frame: FrameUniforms;
@group(0) @binding(2) var<storage, read_write> gridHeads: array<atomic<i32>>;
@group(0) @binding(3) var<storage, read_write> nextIndices: array<i32>;
@group(0) @binding(4) var<storage, read_write> activeIndices: array<u32>;
@group(0) @binding(5) var<storage, read_write> counters: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> indirectArgs: array<u32>;
@group(0) @binding(7) var<storage, read> spawnCommands: array<Particle>;
@group(0) @binding(8) var<storage, read_write> slotStates: array<atomic<u32>>;
@group(0) @binding(9) var<storage, read_write> spawnMeta: array<atomic<u32>>;

fn cellFor(position: vec2<f32>) -> vec2<u32> {
  let relative = clamp(position - frame.bounds.xy, vec2<f32>(0.0), max(frame.bounds.zw - frame.bounds.xy - vec2<f32>(1.0), vec2<f32>(1.0)));
  return min(vec2<u32>(relative / frame.cellSize), frame.gridSize - vec2<u32>(1u));
}

fn cellIndex(cell: vec2<u32>) -> u32 {
  return cell.y * frame.gridSize.x + cell.x;
}

fn hashNoise(value: f32) -> f32 {
  return fract(sin(value * 91.3458 + frame.time * 0.73) * 47453.5453) * 2.0 - 1.0;
}

fn isBalloon(kind: u32) -> bool {
  return kind == 1u || kind == 12u;
}

@compute @workgroup_size(64)
fn clearGrid(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index < arrayLength(&gridHeads)) {
    atomicStore(&gridHeads[index], -1);
  }
  if (index == 0u) {
    atomicStore(&counters[0], 0u);
    atomicStore(&counters[2], 0u);
    indirectArgs[0] = 6u;
    indirectArgs[1] = 0u;
    indirectArgs[2] = 0u;
    indirectArgs[3] = 0u;
  }
}

@compute @workgroup_size(64)
fn spawnParticles(@builtin(global_invocation_id) gid: vec3<u32>) {
  let commandIndex = gid.x;
  let commandCount = min(atomicLoad(&spawnMeta[0]), u32(arrayLength(&spawnCommands)));
  if (commandIndex >= commandCount) { return; }
  let limit = min(frame.logicalLimit, u32(arrayLength(&particles)));
  if (limit == 0u) {
    atomicAdd(&counters[1], 1u);
    return;
  }
  let command = spawnCommands[commandIndex];
  let seed = (u32(abs(command.seed) * 65537.0) + commandIndex * 2654435761u) % limit;
  for (var attempt: u32 = 0u; attempt < limit; attempt = attempt + 1u) {
    let slot = (seed + attempt) % limit;
    let claim = atomicCompareExchangeWeak(&slotStates[slot], 0u, 1u);
    if (claim.exchanged) {
      var particle = command;
      particle.flags = particle.flags | 1u;
      particles[slot] = particle;
      atomicAdd(&counters[2], 1u);
      return;
    }
  }
  atomicAdd(&counters[1], 1u);
}

@compute @workgroup_size(64)
fn buildGrid(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= frame.logicalLimit || (particles[index].flags & 1u) == 0u) { return; }
  let cell = cellIndex(cellFor(particles[index].position));
  nextIndices[index] = atomicExchange(&gridHeads[cell], i32(index));
}

@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= frame.logicalLimit) { return; }
  var particle = particles[index];
  if ((particle.flags & 1u) == 0u) { return; }

  let dt = min(frame.deltaTime * frame.speed, 0.05);
  let noise = hashNoise(particle.seed + f32(index));
  let balloon = isBalloon(particle.kind);
  if (balloon) {
    let sway = sin(frame.time * 1.9 + particle.seed) * (18.0 + 34.0 * particle.params1.y);
    particle.velocity.y -= (90.0 + 110.0 * frame.intensity) * dt;
    particle.velocity.x += (frame.wind * particle.params1.y + frame.windVariation * noise + sway) * dt;
  } else {
    particle.velocity += frame.gravity * dt;
    particle.velocity.x += (frame.wind * particle.params1.y + frame.windVariation * noise) * dt;
  }
  particle.velocity *= max(0.0, 1.0 - particle.params0.y * dt);
  particle.position += particle.velocity * dt;
  particle.rotation += particle.angularVelocity * dt;

  if (balloon && particle.params1.x > frame.bounds.y && particle.position.y <= particle.params1.x) {
    particle.kind = 3u;
    particle.material = 8u;
    particle.life = 0.62;
    particle.maxLife = 0.62;
    particle.fadeSeconds = 0.5;
    particle.size *= 1.65;
    particle.velocity = vec2<f32>(0.0);
  }

  let radius = max(3.0, particle.size * select(0.46, 0.38, particle.kind == 5u));
  if (particle.position.x < frame.bounds.x + radius) {
    particle.position.x = frame.bounds.x + radius;
    particle.velocity.x = abs(particle.velocity.x) * particle.params0.x;
  } else if (particle.position.x > frame.bounds.z - radius) {
    particle.position.x = frame.bounds.z - radius;
    particle.velocity.x = -abs(particle.velocity.x) * particle.params0.x;
  }

  if (!balloon && (frame.flags & 1u) != 0u && particle.position.y > frame.floorY - radius) {
    let impactSpeed = abs(particle.velocity.y);
    particle.position.y = frame.floorY - radius;
    if ((frame.flags & 2u) != 0u) {
      particle.velocity.y = -abs(particle.velocity.y) * particle.params0.x * max(0.0, 1.0 - frame.bounceDamping);
    } else {
      particle.velocity.y = 0.0;
    }
    particle.velocity.x *= max(0.0, 1.0 - frame.friction);
    if ((particle.flags & 32u) != 0u && impactSpeed > 90.0) {
      particle.params0.w = clamp(impactSpeed / 520.0, 0.18, 1.0);
    }
  }

  particle.params0.w = max(0.0, particle.params0.w - dt * 2.8);

  if (frame.collisionScale > 0.0 && particle.kind != 3u && particle.kind != 5u) {
    let home = cellFor(particle.position);
    for (var oy: i32 = -1; oy <= 1; oy = oy + 1) {
      for (var ox: i32 = -1; ox <= 1; ox = ox + 1) {
        let nx = clamp(i32(home.x) + ox, 0, i32(frame.gridSize.x) - 1);
        let ny = clamp(i32(home.y) + oy, 0, i32(frame.gridSize.y) - 1);
        var neighbour = atomicLoad(&gridHeads[cellIndex(vec2<u32>(u32(nx), u32(ny)))]);
        var checked = 0;
        loop {
          if (neighbour < 0 || checked >= 14) { break; }
          let otherIndex = u32(neighbour);
          if (otherIndex != index && (particles[otherIndex].flags & 1u) != 0u) {
            let other = particles[otherIndex];
            let delta = particle.position - other.position;
            let distanceSquared = max(dot(delta, delta), 0.001);
            let minDistance = radius + max(3.0, other.size * 0.43);
            if (distanceSquared < minDistance * minDistance) {
              let distance = sqrt(distanceSquared);
              let normal = delta / distance;
              let penetration = minDistance - distance;
              particle.position += normal * penetration * 0.5 * frame.collisionScale;
              let separating = dot(particle.velocity - other.velocity, normal);
              if (separating < 0.0) {
                particle.velocity -= normal * separating * (1.0 + particle.params0.x) * 0.5;
              }
            }
          }
          neighbour = nextIndices[otherIndex];
          checked = checked + 1;
        }
      }
    }
  }

  particle.life -= dt;
  let outside = particle.position.y < frame.bounds.y - particle.size * 4.0
    || particle.position.y > frame.bounds.w + particle.size * 5.0;
  if (particle.life <= 0.0 || outside) {
    particle.flags = particle.flags & ~1u;
    particles[index] = particle;
    atomicStore(&slotStates[index], 0u);
    return;
  }

  particles[index] = particle;
  let compactedIndex = atomicAdd(&counters[0], 1u);
  if (compactedIndex < arrayLength(&activeIndices)) {
    activeIndices[compactedIndex] = index;
  }
}

@compute @workgroup_size(1)
fn finalizeIndirect(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x == 0u) {
    indirectArgs[1] = min(atomicLoad(&counters[0]), frame.logicalLimit);
  }
}
`;

  const SPRITE_WGSL = /* wgsl */`
struct Particle {
  position: vec2<f32>, velocity: vec2<f32>, color: vec4<f32>,
  params0: vec4<f32>, params1: vec4<f32>, size: f32, rotation: f32,
  angularVelocity: f32, life: f32, maxLife: f32, fadeSeconds: f32,
  textureSlot: u32, kind: u32, flags: u32, material: u32,
  seed: f32, padding: f32,
};
struct FrameUniforms {
  viewport: vec2<f32>, deltaTime: f32, time: f32, gravity: vec2<f32>,
  wind: f32, windVariation: f32, intensity: f32, floorY: f32,
  collisionScale: f32, trailDecay: f32, profile: f32, speed: f32,
  friction: f32, bounceDamping: f32, bounds: vec4<f32>,
  gridSize: vec2<u32>, cellSize: vec2<f32>, rainbowSpeed: f32,
  pixelSize: f32, flags: u32, logicalLimit: u32, postLevel: f32,
  targetFrameMs: f32, padding: vec2<f32>,
};
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) local: vec2<f32>,
  @location(3) glow: f32,
  @location(4) age: f32,
  @location(5) seed: f32,
  @location(6) @interpolate(flat) kind: u32,
  @location(7) @interpolate(flat) flags: u32,
  @location(8) @interpolate(flat) material: u32,
  @location(9) impact: f32,
};
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> activeIndices: array<u32>;
@group(0) @binding(2) var<uniform> frame: FrameUniforms;
@group(0) @binding(3) var atlasTexture: texture_2d<f32>;
@group(0) @binding(4) var atlasSampler: sampler;

fn hsv2rgb(value: vec3<f32>) -> vec3<f32> {
  let p = abs(fract(value.xxx + vec3<f32>(0.0, 0.666667, 0.333333)) * 6.0 - 3.0);
  return value.z * mix(vec3<f32>(1.0), clamp(p - 1.0, vec3<f32>(0.0), vec3<f32>(1.0)), value.y);
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-0.5, -0.5), vec2<f32>(0.5, -0.5), vec2<f32>(-0.5, 0.5),
    vec2<f32>(-0.5, 0.5), vec2<f32>(0.5, -0.5), vec2<f32>(0.5, 0.5)
  );
  let uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0)
  );
  let particle = particles[activeIndices[instanceIndex]];
  let balloon = particle.kind == 1u || particle.kind == 12u;
  let depthScale = select(1.0, mix(0.72, 1.2, particle.params1.w), (particle.flags & 64u) != 0u);
  let pulse = 1.0 + sin((particle.maxLife - particle.life) * 5.0 + particle.seed) * select(0.025, 0.065, frame.profile > 1.5) + particle.params0.w * 0.14;
  let geometryScale = select(vec2<f32>(1.0), vec2<f32>(1.0, 1.48), balloon);
  let local = corners[vertexIndex] * geometryScale;
  let sized = local * particle.size * pulse * depthScale;
  let sine = sin(particle.rotation);
  let cosine = cos(particle.rotation);
  let rotated = vec2<f32>(sized.x * cosine - sized.y * sine, sized.x * sine + sized.y * cosine);
  let pixel = particle.position + rotated;
  let ndc = vec2<f32>(pixel.x / frame.viewport.x * 2.0 - 1.0, 1.0 - pixel.y / frame.viewport.y * 2.0);
  let slot = particle.textureSlot;
  let atlasBase = vec2<f32>(f32(slot % 16u), f32(slot / 16u)) / 16.0;
  let fadeIn = smoothstep(particle.maxLife, particle.maxLife - min(0.18, particle.maxLife * 0.15), particle.life);
  let fadeOut = smoothstep(0.0, max(0.001, particle.fadeSeconds), particle.life);
  var tint = particle.color;
  if ((frame.flags & 4u) != 0u) {
    tint = vec4<f32>(
      hsv2rgb(vec3<f32>(fract(particle.params1.z + frame.time * frame.rainbowSpeed * 0.08), 0.82, 1.0)),
      tint.a
    );
  }
  var output: VertexOutput;
  output.position = vec4<f32>(ndc, select(0.5, 0.88 - particle.params1.w * 0.7, (particle.flags & 64u) != 0u), 1.0);
  output.uv = atlasBase + uvs[vertexIndex] / 16.0;
  output.color = vec4<f32>(tint.rgb, tint.a * fadeIn * fadeOut);
  output.local = local;
  output.glow = particle.params0.z;
  output.age = particle.maxLife - particle.life;
  output.seed = particle.seed;
  output.kind = particle.kind;
  output.flags = particle.flags;
  output.material = particle.material;
  output.impact = particle.params0.w;
  return output;
}

fn roundedBox(point: vec2<f32>, halfSize: vec2<f32>, radius: f32) -> f32 {
  let q = abs(point) - halfSize + vec2<f32>(radius);
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  var uv = input.uv;
  if ((frame.flags & 8u) != 0u) {
    let slotBase = floor(uv * 16.0) / 16.0;
    let localUv = fract(uv * 16.0);
    let blocks = max(2.0, 128.0 / max(1.0, frame.pixelSize));
    uv = slotBase + floor(localUv * blocks) / blocks / 16.0;
  }
  let sampleColor = textureSample(atlasTexture, atlasSampler, uv);
  let radial = length(input.local);
  let circleMask = 1.0 - smoothstep(0.43, 0.505, radial);
  let shadowEnabled = (frame.flags & 128u) != 0u;
  let glowEnabled = (frame.flags & 16u) != 0u;
  var alpha = sampleColor.a;
  var rgb = sampleColor.rgb * input.color.rgb;

  if (input.kind == 3u) {
    let angle = atan2(input.local.y, input.local.x);
    let rays = pow(abs(cos(angle * 7.0 + input.seed)), 15.0);
    let ring = smoothstep(0.48, 0.24, radial) * smoothstep(0.05, 0.18, radial);
    alpha = max(rays * ring, (1.0 - smoothstep(0.08, 0.2, radial)) * 0.8);
    rgb = input.color.rgb * (1.25 + input.glow * 0.55);
  } else if (input.kind == 4u) {
    let highlight = pow(max(0.0, 1.0 - length(input.local - vec2<f32>(-0.15, -0.18)) * 1.55), 3.0);
    let sphere = input.color.rgb * (0.28 + 0.72 * (1.0 - radial)) + vec3<f32>(highlight * 0.8);
    rgb = mix(sphere, sampleColor.rgb, sampleColor.a * 0.9);
    alpha = circleMask;
  } else if (input.kind == 5u) {
    let card = 1.0 - smoothstep(-0.015, 0.02, roundedBox(input.local, vec2<f32>(0.47, 0.43), 0.1));
    let inner = 1.0 - smoothstep(-0.015, 0.02, roundedBox(input.local, vec2<f32>(0.42, 0.38), 0.075));
    let border = max(0.0, card - inner);
    rgb = sampleColor.rgb * input.color.rgb + input.color.rgb * border * 0.72;
    alpha = max(sampleColor.a * inner, border);
  } else if (input.kind == 6u || input.kind == 12u) {
    rgb = sampleColor.rgb;
    alpha = sampleColor.a * circleMask;
    let rim = smoothstep(0.34, 0.44, radial) * circleMask;
    rgb += input.color.rgb * rim * 0.5;
    alpha = max(alpha, rim * 0.7);
    if (input.kind == 12u) {
      let stringDistance = abs(input.local.x + sin(input.local.y * 18.0 + input.seed) * 0.025);
      let string = (1.0 - smoothstep(0.008, 0.022, stringDistance))
        * smoothstep(0.38, 0.47, input.local.y) * (1.0 - smoothstep(0.69, 0.74, input.local.y));
      let balloonSkin = (1.0 - smoothstep(0.43, 0.51, radial)) * 0.2;
      rgb += input.color.rgb * balloonSkin;
      alpha = max(alpha, max(balloonSkin, string * 0.78));
    }
  } else if (input.kind == 1u) {
    let body = 1.0 - smoothstep(0.42, 0.5, length(vec2<f32>(input.local.x, (input.local.y + 0.12) * 0.9)));
    let stringDistance = abs(input.local.x + sin(input.local.y * 18.0 + input.seed) * 0.025);
    let string = (1.0 - smoothstep(0.008, 0.022, stringDistance))
      * smoothstep(0.1, 0.2, input.local.y) * (1.0 - smoothstep(0.47, 0.54, input.local.y));
    rgb = mix(input.color.rgb * (0.55 + (0.5 - radial) * 0.75), sampleColor.rgb * input.color.rgb, sampleColor.a);
    alpha = max(sampleColor.a * body, max(body * 0.32, string * 0.76));
  } else if (input.kind >= 7u && input.kind <= 11u) {
    let halo = smoothstep(0.52, 0.39, radial) - smoothstep(0.39, 0.31, radial);
    let pulse = 0.62 + 0.38 * sin(input.age * 8.0 + input.seed);
    rgb += input.color.rgb * halo * pulse;
    alpha = max(alpha, halo * pulse);
  }

  if (input.kind == 2u || input.kind == 11u) {
    let ring = smoothstep(0.54, 0.45, radial) - smoothstep(0.39, 0.3, radial);
    rgb += input.color.rgb * ring * (0.5 + 0.5 * sin(input.age * 10.0));
    alpha = max(alpha, ring * 0.8);
  }

  if (input.impact > 0.001 && (input.flags & 32u) != 0u) {
    let impactAngle = atan2(input.local.y, input.local.x);
    let impactRays = pow(abs(cos(impactAngle * 9.0 + input.seed)), 20.0);
    let impactRing = smoothstep(0.56, 0.38, radial) * smoothstep(0.2, 0.34, radial);
    let impactAlpha = impactRays * impactRing * input.impact;
    rgb += input.color.rgb * impactAlpha * (1.2 + input.glow * 0.35);
    alpha = max(alpha, impactAlpha);
  }

  let shadow = select(0.0, smoothstep(0.58, 0.25, length(input.local - vec2<f32>(0.055, 0.075))) * (1.0 - alpha) * 0.34, shadowEnabled);
  let edge = smoothstep(0.04, 0.75, alpha);
  let profileGlow = select(select(0.82, 1.65, frame.profile > 1.5), 0.64, frame.profile > 0.5 && frame.profile < 1.5);
  let glow = select(vec3<f32>(0.0), input.color.rgb * (1.0 - edge) * input.glow * profileGlow * frame.postLevel, glowEnabled);
  let finalAlpha = clamp(alpha * input.color.a + shadow, 0.0, 1.0);
  let finalRgb = rgb * alpha * input.color.a + glow * alpha + vec3<f32>(shadow * 0.08);
  if (finalAlpha < 0.003) { discard; }
  return vec4<f32>(finalRgb, finalAlpha);
}
`;

  const POST_WGSL = /* wgsl */`
struct FrameUniforms {
  viewport: vec2<f32>, deltaTime: f32, time: f32, gravity: vec2<f32>,
  wind: f32, windVariation: f32, intensity: f32, floorY: f32,
  collisionScale: f32, trailDecay: f32, profile: f32, speed: f32,
  friction: f32, bounceDamping: f32, bounds: vec4<f32>,
  gridSize: vec2<u32>, cellSize: vec2<f32>, rainbowSpeed: f32,
  pixelSize: f32, flags: u32, logicalLimit: u32, postLevel: f32,
  targetFrameMs: f32, padding: vec2<f32>,
};
struct FullscreenOutput { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn fullscreen(@builtin(vertex_index) index: u32) -> FullscreenOutput {
  let positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var output: FullscreenOutput;
  output.position = vec4<f32>(positions[index], 0.0, 1.0);
  output.uv = positions[index] * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5);
  return output;
}
@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> frame: FrameUniforms;

@fragment fn historyFragment(input: FullscreenOutput) -> @location(0) vec4<f32> {
  let color = textureSample(sourceTexture, sourceSampler, input.uv);
  return color * frame.trailDecay * frame.postLevel;
}

@fragment fn bloomFragment(input: FullscreenOutput) -> @location(0) vec4<f32> {
  let dimensions = vec2<f32>(textureDimensions(sourceTexture));
  let texel = 1.0 / dimensions;
  var color = vec4<f32>(0.0);
  for (var y: i32 = -2; y <= 2; y = y + 1) {
    for (var x: i32 = -2; x <= 2; x = x + 1) {
      let weight = 1.0 / (1.0 + f32(x * x + y * y));
      color += textureSample(sourceTexture, sourceSampler, input.uv + vec2<f32>(f32(x), f32(y)) * texel * 2.0) * weight;
    }
  }
  color /= 9.8;
  let brightness = max(max(color.r, color.g), color.b);
  let profileBoost = select(select(1.0, 1.62, frame.profile > 1.5), 0.72, frame.profile > 0.5 && frame.profile < 1.5);
  return color * smoothstep(0.16, 0.86, brightness) * (0.48 + frame.intensity * 0.72) * profileBoost * frame.postLevel;
}
`;

  const COMPOSITE_WGSL = /* wgsl */`
struct FrameUniforms {
  viewport: vec2<f32>, deltaTime: f32, time: f32, gravity: vec2<f32>,
  wind: f32, windVariation: f32, intensity: f32, floorY: f32,
  collisionScale: f32, trailDecay: f32, profile: f32, speed: f32,
  friction: f32, bounceDamping: f32, bounds: vec4<f32>,
  gridSize: vec2<u32>, cellSize: vec2<f32>, rainbowSpeed: f32,
  pixelSize: f32, flags: u32, logicalLimit: u32, postLevel: f32,
  targetFrameMs: f32, padding: vec2<f32>,
};
struct FullscreenOutput { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn fullscreen(@builtin(vertex_index) index: u32) -> FullscreenOutput {
  let positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var output: FullscreenOutput;
  output.position = vec4<f32>(positions[index], 0.0, 1.0);
  output.uv = positions[index] * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5);
  return output;
}
@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var bloomTexture0: texture_2d<f32>;
@group(0) @binding(2) var bloomTexture1: texture_2d<f32>;
@group(0) @binding(3) var bloomTexture2: texture_2d<f32>;
@group(0) @binding(4) var linearSampler: sampler;
@group(0) @binding(5) var<uniform> frame: FrameUniforms;
@fragment fn composite(input: FullscreenOutput) -> @location(0) vec4<f32> {
  let scene = textureSample(sceneTexture, linearSampler, input.uv);
  let bloom = textureSample(bloomTexture0, linearSampler, input.uv) * 0.52
    + textureSample(bloomTexture1, linearSampler, input.uv) * 0.31
    + textureSample(bloomTexture2, linearSampler, input.uv) * 0.24;
  let bloomStrength = clamp(frame.postLevel, 0.0, 1.0);
  let rgb = scene.rgb + bloom.rgb * bloomStrength;
  let alpha = clamp(scene.a + max(max(bloom.r, bloom.g), bloom.b) * 0.14 * bloomStrength, 0.0, 1.0);
  return vec4<f32>(rgb, alpha);
}
`;

  function clamp(value, min, max, fallback = min) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  class WebGPUEmojiEngine {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.options = options;
      this.device = null;
      this.context = null;
      this.adapter = null;
      this.format = null;
      this.running = false;
      this.paused = false;
      this.destroyed = false;
      this.frameHandle = 0;
      this.atlasCursor = 0;
      this.freeAtlasSlots = [];
      this.atlasEntries = new Map();
      this.pendingAssets = new Map();
      this.knownAssets = new Set([DEFAULT_ASSET]);
      this.pendingSpawnCommands = [];
      this.lastFrameAt = performance.now();
      this.nextFrameAt = 0;
      this.lastMetricsAt = 0;
      this.lastAdaptAt = 0;
      this.frameIntervalAverage = 16.67;
      this.cpuFrameTimeAverage = 1;
      this.gpuTimeMs = 0;
      this.gpuTimeSource = 'unavailable';
      this.invalidTimestampSamples = 0;
      this.activeParticles = 0;
      this.droppedParticles = 0;
      this.gpuDroppedLast = 0;
      this.counterReadbackPending = false;
      this.timestampReadbackPending = false;
      this.recoveryAttempted = false;
      this.recoveryAttempts = 0;
      this.recovering = false;
      this.initGeneration = 0;
      this.adaptiveScale = 1;
      this.adaptivePostLevel = 1;
      this.adaptiveSpawnFactor = 1;
      this.speed = 1;
      this.particleCapacity = GPU_CAPACITY;
      this.theme = 'default';
      this.boundingBox = { x: 0, y: 0, width: 1, height: 1 };
      this.config = {};
      this.metrics = { backend: 'webgpu', state: 'initializing', fps: 0, frameTimeMs: 0, gpuTimeMs: 0 };
      this.configure(options.config || {});
    }

    configure(config = {}) {
      this.config = { ...this.config, ...(config && typeof config === 'object' ? config : {}) };
      this.qualityName = QUALITY[this.config.quality_preset] ? this.config.quality_preset : 'auto';
      this.quality = QUALITY[this.qualityName];
      this.maxParticles = GPU_CAPACITY;
      const previousLimit = this.particleLimit || GPU_CAPACITY;
      this.toasterMode = this.config.toaster_mode === true;
      this.particleLimit = Math.round(clamp(this.config.max_emojis_on_screen, 32, GPU_CAPACITY, this.quality.particles));
      if (this.toasterMode) this.particleLimit = Math.min(50, this.particleLimit);
      this.profileName = Object.prototype.hasOwnProperty.call(PROFILE, this.config.renderer_profile) ? this.config.renderer_profile : 'hybrid';
      this.profile = PROFILE[this.profileName];
      this.profileTuning = PROFILE_TUNING[this.profileName];
      this.visualMode = String(this.config.visual_mode || 'premium_stage').toLowerCase();
      this.visualGlowMultiplier = this.visualMode === 'premium_stage' ? 1.12 : this.visualMode === 'balanced' ? 0.86 : 1;
      this.intensity = clamp(this.config.effect_intensity, 0, 100, 72) / 100;
      this.targetFps = this.toasterMode ? 30 : Math.round(clamp(this.config.target_fps, 15, 240, 60));
      this.targetFrameMs = 1000 / this.targetFps;
      this.bloomEnabled = !this.toasterMode && this.config.enable_bloom !== false && this.quality.bloom;
      this.trailsEnabled = !this.toasterMode && this.config.enable_trails !== false && this.quality.trails;
      this.collisionsEnabled = this.config.gpu_collisions_enabled !== false;
      this.fpsOptimizationEnabled = this.config.fps_optimization_enabled !== false;
      this.fpsSensitivity = clamp(this.config.fps_sensitivity, 0.1, 2, 0.8);
      this.speed = clamp(this.config.speed, 0.1, 5, this.speed || 1);
      if (this.device && this.particleLimit < previousLimit) this._clearCapacityTail(this.particleLimit);
      this._updateSpawnBudget();
    }

    _featureEnabled(name) {
      if (this.toasterMode && ['glow', 'particles', 'depth', 'rainbow', 'pixel', 'bloom', 'trails'].includes(name)) return false;
      const configKey = name === 'particles' ? 'enable_particles'
        : name === 'depth' ? 'enable_depth'
          : name === 'glow' ? 'enable_glow'
            : name === 'rainbow' ? 'rainbow_enabled'
              : name === 'pixel' ? 'pixel_enabled'
                : 'enable_' + name;
      return this.config[configKey] !== false && (name !== 'rainbow' && name !== 'pixel' || this.config[configKey] === true);
    }

    setPaused(paused) {
      this.paused = Boolean(paused);
      this.lastFrameAt = performance.now();
    }

    setSpeed(speed) {
      this.speed = clamp(speed, 0.1, 5, 1);
    }

    setBoundingBox(box = {}) {
      const x = clamp(box.x, 0, 1, 0);
      const y = clamp(box.y, 0, 1, 0);
      this.boundingBox = {
        x,
        y,
        width: Math.min(clamp(box.width, 0.01, 1, 1), 1 - x),
        height: Math.min(clamp(box.height, 0.01, 1, 1), 1 - y)
      };
    }

    setTheme(theme) {
      this.theme = String(theme || 'default').trim().toLowerCase() || 'default';
      if (Object.prototype.hasOwnProperty.call(PROFILE, this.theme)) {
        this.profileName = this.theme;
        this.profile = PROFILE[this.theme];
        this.profileTuning = PROFILE_TUNING[this.theme];
      }
    }

    recordDropped(count = 1) {
      this.droppedParticles += Math.max(0, Math.floor(Number(count) || 0));
    }

    async init() {
      if (!navigator.gpu) {
        this._setState('unsupported', { reason: 'navigator.gpu is unavailable' });
        return false;
      }
      const generation = ++this.initGeneration;
      try {
        this.running = false;
        this._releaseGPUResources();
        this.adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!this.adapter) throw new Error('No WebGPU adapter was returned');
        const requiredFeatures = this.adapter.features?.has('timestamp-query') ? ['timestamp-query'] : [];
        this.device = await this.adapter.requestDevice({ requiredFeatures });
        if (generation !== this.initGeneration || this.destroyed) return false;
        this.context = this.canvas.getContext('webgpu');
        if (!this.context) throw new Error('Unable to create WebGPU canvas context');
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.timestampEnabled = requiredFeatures.includes('timestamp-query');
        this._resize(true);
        this._createBuffers();
        await this._createPipelines();
        this._createAtlas();
        this._createFrameTextures();
        const restoreAssets = Array.from(this.knownAssets).slice(0, ATLAS_CAPACITY);
        for (const asset of restoreAssets) await this.ensureAsset(asset);
        this._watchDevice(this.device, generation);
        this.running = true;
        this.recovering = false;
        this.lastFrameAt = performance.now();
        this.nextFrameAt = 0;
        this._setState('ready', {
          adapter: await this._adapterInfo(),
          timestampQuery: this.timestampEnabled,
          capacity: GPU_CAPACITY
        });
        this.frameHandle = requestAnimationFrame(time => this._frame(time));
        return true;
      } catch (error) {
        if (generation === this.initGeneration) {
          this._setState('error', { reason: error?.message || String(error) });
        }
        return false;
      }
    }

    async _adapterInfo() {
      try {
        const info = typeof this.adapter.requestAdapterInfo === 'function'
          ? await this.adapter.requestAdapterInfo()
          : this.adapter.info;
        return info ? {
          vendor: info.vendor || 'unknown',
          architecture: info.architecture || 'unknown',
          device: info.device || 'unknown',
          description: info.description || 'WebGPU adapter'
        } : null;
      } catch (_) {
        return null;
      }
    }

    _watchDevice(device = this.device, generation = this.initGeneration) {
      device.addEventListener?.('uncapturederror', event => {
        if (device !== this.device || generation !== this.initGeneration) return;
        this._setState('error', { reason: event.error?.message || 'WebGPU validation error' });
      });
      device.lost.then(async info => {
        if (this.destroyed || device !== this.device || generation !== this.initGeneration) return;
        this.running = false;
        cancelAnimationFrame(this.frameHandle);
        this._setState('device-lost', { reason: info?.message || 'WebGPU device lost' });
        if (this.recovering || this.recoveryAttempts >= 3) return;
        this.recovering = true;
        this.recoveryAttempted = true;
        while (!this.destroyed && this.recoveryAttempts < 3) {
          this.recoveryAttempts++;
          await new Promise(resolve => setTimeout(resolve, 350 * (2 ** (this.recoveryAttempts - 1))));
          if (await this.init()) return;
        }
        this.recovering = false;
      }).catch(error => {
        if (!this.destroyed) this._setState('error', { reason: error?.message || String(error) });
      });
    }

    _createBuffers() {
      const U = GPUBufferUsage;
      this.particleBuffer = this.device.createBuffer({ label: 'emoji-particles-fixed-capacity', size: GPU_CAPACITY * PARTICLE_STRIDE, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
      this.spawnCommandBuffer = this.device.createBuffer({ label: 'emoji-gpu-spawn-commands', size: SPAWN_COMMAND_CAPACITY * PARTICLE_STRIDE, usage: U.STORAGE | U.COPY_DST });
      this.spawnMetaBuffer = this.device.createBuffer({ label: 'emoji-spawn-meta', size: 16, usage: U.STORAGE | U.COPY_DST });
      this.slotStateBuffer = this.device.createBuffer({ label: 'emoji-atomic-free-slots', size: GPU_CAPACITY * 4, usage: U.STORAGE | U.COPY_DST });
      this.uniformBuffer = this.device.createBuffer({ label: 'emoji-frame-uniforms', size: UNIFORM_SIZE, usage: U.UNIFORM | U.COPY_DST | U.COPY_SRC });
      this.gridHeadsBuffer = this.device.createBuffer({ label: 'emoji-grid-heads', size: GRID_CELLS * 4, usage: U.STORAGE });
      this.nextIndicesBuffer = this.device.createBuffer({ label: 'emoji-grid-next', size: GPU_CAPACITY * 4, usage: U.STORAGE });
      this.activeIndicesBuffer = this.device.createBuffer({ label: 'emoji-active-indices', size: GPU_CAPACITY * 4, usage: U.STORAGE | U.COPY_SRC });
      this.counterBuffer = this.device.createBuffer({ label: 'emoji-counters', size: 16, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
      this.counterReadback = this.device.createBuffer({ label: 'emoji-counter-readback', size: 16, usage: U.MAP_READ | U.COPY_DST });
      this.indirectBuffer = this.device.createBuffer({ label: 'emoji-indirect', size: 16, usage: U.STORAGE | U.INDIRECT | U.COPY_DST | U.COPY_SRC });
      this.device.queue.writeBuffer(this.indirectBuffer, 0, new Uint32Array([6, 0, 0, 0]));
      this.device.queue.writeBuffer(this.spawnMetaBuffer, 0, new Uint32Array(4));
      this.device.queue.writeBuffer(this.slotStateBuffer, 0, new Uint32Array(GPU_CAPACITY));
      this.device.queue.writeBuffer(this.counterBuffer, 0, new Uint32Array(4));
      this.gpuDroppedLast = 0;
      if (this.timestampEnabled) {
        this.timestampQuerySet = this.device.createQuerySet({ type: 'timestamp', count: 2 });
        this.timestampResolveBuffer = this.device.createBuffer({ label: 'emoji-timestamp-resolve', size: 16, usage: U.QUERY_RESOLVE | U.COPY_SRC });
        this.timestampReadback = this.device.createBuffer({ label: 'emoji-timestamp-readback', size: 16, usage: U.MAP_READ | U.COPY_DST });
      }
    }

    async _createPipelines() {
      const computeModule = this.device.createShaderModule({ label: 'emoji-compute-wgsl', code: COMPUTE_WGSL });
      const spriteModule = this.device.createShaderModule({ label: 'emoji-sprite-wgsl', code: SPRITE_WGSL });
      const postModule = this.device.createShaderModule({ label: 'emoji-post-wgsl', code: POST_WGSL });
      const compositeModule = this.device.createShaderModule({ label: 'emoji-composite-wgsl', code: COMPOSITE_WGSL });
      await this._assertShader(computeModule, 'compute');
      await this._assertShader(spriteModule, 'sprite');
      await this._assertShader(postModule, 'post');
      await this._assertShader(compositeModule, 'composite');
      this.computePipelines = {
        clear: this.device.createComputePipeline({ layout: 'auto', compute: { module: computeModule, entryPoint: 'clearGrid' } }),
        spawn: this.device.createComputePipeline({ layout: 'auto', compute: { module: computeModule, entryPoint: 'spawnParticles' } }),
        build: this.device.createComputePipeline({ layout: 'auto', compute: { module: computeModule, entryPoint: 'buildGrid' } }),
        simulate: this.device.createComputePipeline({ layout: 'auto', compute: { module: computeModule, entryPoint: 'simulate' } }),
        finalize: this.device.createComputePipeline({ layout: 'auto', compute: { module: computeModule, entryPoint: 'finalizeIndirect' } })
      };
      this.spritePipeline = this.device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: spriteModule, entryPoint: 'vertexMain' },
        fragment: {
          module: spriteModule,
          entryPoint: 'fragmentMain',
          targets: [{
            format: 'rgba16float',
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
            }
          }]
        },
        primitive: { topology: 'triangle-list' }
      });
      this.historyPipeline = this.device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: postModule, entryPoint: 'fullscreen' },
        fragment: { module: postModule, entryPoint: 'historyFragment', targets: [{ format: 'rgba16float' }] },
        primitive: { topology: 'triangle-list' }
      });
      this.bloomPipeline = this.device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: postModule, entryPoint: 'fullscreen' },
        fragment: { module: postModule, entryPoint: 'bloomFragment', targets: [{ format: 'rgba16float' }] },
        primitive: { topology: 'triangle-list' }
      });
      this.compositePipeline = this.device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: compositeModule, entryPoint: 'fullscreen' },
        fragment: {
          module: compositeModule,
          entryPoint: 'composite',
          targets: [{
            format: this.format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
            }
          }]
        },
        primitive: { topology: 'triangle-list' }
      });
      this.linearSampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear' });
    }

    async _assertShader(module, label) {
      if (typeof module.getCompilationInfo !== 'function') return;
      const info = await module.getCompilationInfo();
      const errors = info.messages.filter(message => message.type === 'error');
      if (errors.length) throw new Error(label + ' shader: ' + errors.map(error => error.message).join('; '));
    }

    _createAtlas() {
      this.atlasGeneration = (this.atlasGeneration || 0) + 1;
      this.atlasTexture?.destroy();
      this.atlasTexture = this.device.createTexture({
        label: 'emoji-atlas',
        size: [ATLAS_SIZE, ATLAS_SIZE],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.atlasSampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge'
      });
      this.atlasEntries.clear();
      this.pendingAssets.clear();
      this.atlasCursor = 0;
      this.freeAtlasSlots.length = 0;
      this._createBindGroups();
    }

    _createFrameTextures() {
      for (const texture of [this.sceneTexture, this.historyTexture, ...(this.bloomTextures || [])]) texture?.destroy();
      const width = Math.max(1, this.canvas.width);
      const height = Math.max(1, this.canvas.height);
      const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST;
      this.sceneTexture = this.device.createTexture({ label: 'emoji-hdr-scene', size: [width, height], format: 'rgba16float', usage });
      this.historyTexture = this.device.createTexture({ label: 'emoji-trail-history', size: [width, height], format: 'rgba16float', usage });
      this.bloomTextures = [1, 2, 3].map((level, index) => this.device.createTexture({
        label: 'emoji-bloom-pyramid-level-' + index,
        size: [Math.max(1, width >> level), Math.max(1, height >> level)],
        format: 'rgba16float',
        usage
      }));
      this.bloomTexture = this.bloomTextures[0];
      this._createBindGroups();
    }

    _createBindGroups() {
      if (!this.computePipelines || !this.atlasTexture || !this.sceneTexture) return;
      const resources = {
        0: { binding: 0, resource: { buffer: this.particleBuffer } },
        1: { binding: 1, resource: { buffer: this.uniformBuffer } },
        2: { binding: 2, resource: { buffer: this.gridHeadsBuffer } },
        3: { binding: 3, resource: { buffer: this.nextIndicesBuffer } },
        4: { binding: 4, resource: { buffer: this.activeIndicesBuffer } },
        5: { binding: 5, resource: { buffer: this.counterBuffer } },
        6: { binding: 6, resource: { buffer: this.indirectBuffer } },
        7: { binding: 7, resource: { buffer: this.spawnCommandBuffer } },
        8: { binding: 8, resource: { buffer: this.slotStateBuffer } },
        9: { binding: 9, resource: { buffer: this.spawnMetaBuffer } }
      };
      const bindingsByPipeline = {
        clear: [2, 5, 6],
        spawn: [0, 1, 5, 7, 8, 9],
        build: [0, 1, 2, 3],
        simulate: [0, 1, 2, 3, 4, 5, 8],
        finalize: [1, 5, 6]
      };
      this.computeBindGroups = Object.fromEntries(Object.entries(this.computePipelines).map(([name, pipeline]) => [
        name,
        this.device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: bindingsByPipeline[name].map(binding => resources[binding])
        })
      ]));
      this.spriteBindGroup = this.device.createBindGroup({
        layout: this.spritePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.particleBuffer } },
          { binding: 1, resource: { buffer: this.activeIndicesBuffer } },
          { binding: 2, resource: { buffer: this.uniformBuffer } },
          { binding: 3, resource: this.atlasTexture.createView() },
          { binding: 4, resource: this.atlasSampler }
        ]
      });
      this.historyBindGroup = this.device.createBindGroup({
        layout: this.historyPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.historyTexture.createView() },
          { binding: 1, resource: this.linearSampler },
          { binding: 2, resource: { buffer: this.uniformBuffer } }
        ]
      });
      const bloomSources = [this.sceneTexture, this.bloomTextures[0], this.bloomTextures[1]];
      this.bloomBindGroups = bloomSources.map(source => this.device.createBindGroup({
        layout: this.bloomPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: source.createView() },
          { binding: 1, resource: this.linearSampler },
          { binding: 2, resource: { buffer: this.uniformBuffer } }
        ]
      }));
      this.bloomBindGroup = this.bloomBindGroups[0];
      this.compositeBindGroup = this.device.createBindGroup({
        layout: this.compositePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.sceneTexture.createView() },
          { binding: 1, resource: this.bloomTextures[0].createView() },
          { binding: 2, resource: this.bloomTextures[1].createView() },
          { binding: 3, resource: this.bloomTextures[2].createView() },
          { binding: 4, resource: this.linearSampler },
          { binding: 5, resource: { buffer: this.uniformBuffer } }
        ]
      });
    }

    _resize(force = false) {
      const logicalWidth = Math.max(1, this.canvas.clientWidth || Number(this.config.obs_hud_width) || 1920);
      const logicalHeight = Math.max(1, this.canvas.clientHeight || Number(this.config.obs_hud_height) || 1080);
      const scale = Math.min(1, (globalThis.devicePixelRatio || 1) * this.quality.renderScale * this.adaptiveScale);
      const width = Math.max(1, Math.round(logicalWidth * scale));
      const height = Math.max(1, Math.round(logicalHeight * scale));
      this.logicalWidth = logicalWidth;
      this.logicalHeight = logicalHeight;
      if (!force && this.canvas.width === width && this.canvas.height === height) return false;
      this.canvas.width = width;
      this.canvas.height = height;
      this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });
      if (this.sceneTexture) this._createFrameTextures();
      return true;
    }

    async ensureAsset(asset) {
      const key = String(asset || DEFAULT_ASSET);
      if (this.atlasEntries.has(key)) return this.atlasEntries.get(key);
      if (this.pendingAssets.has(key)) return this.pendingAssets.get(key);
      const task = this._uploadAsset(key)
        .catch(error => {
          this.options.onAssetError?.({ asset: key, reason: error?.message || String(error) });
          return null;
        })
        .finally(() => this.pendingAssets.delete(key));
      this.pendingAssets.set(key, task);
      return task;
    }

    async _uploadAsset(key) {
      const slot = this.freeAtlasSlots.length ? this.freeAtlasSlots.pop() : this.atlasCursor++;
      if (slot >= ATLAS_CAPACITY) {
        this.atlasCursor = ATLAS_CAPACITY;
        return null;
      }
      const atlasGeneration = this.atlasGeneration;
      const device = this.device;
      const atlasTexture = this.atlasTexture;
      try {
        const staging = typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(ATLAS_SLOT_SIZE, ATLAS_SLOT_SIZE)
          : document.createElement('canvas');
        staging.width = ATLAS_SLOT_SIZE;
        staging.height = ATLAS_SLOT_SIZE;
        const context = staging.getContext('2d', { alpha: true, colorSpace: 'srgb' });
        if (!context) throw new Error('Unable to rasterize atlas asset');
        context.clearRect(0, 0, ATLAS_SLOT_SIZE, ATLAS_SLOT_SIZE);
        if (/^(https?:|\/)/i.test(key)) {
          const response = await fetch(key, { cache: 'force-cache', mode: 'cors' });
          if (!response.ok) throw new Error('Asset HTTP ' + response.status);
          const bitmap = await createImageBitmap(await response.blob());
          const scale = Math.min(112 / bitmap.width, 112 / bitmap.height);
          const width = Math.max(1, bitmap.width * scale);
          const height = Math.max(1, bitmap.height * scale);
          context.drawImage(bitmap, (ATLAS_SLOT_SIZE - width) / 2, (ATLAS_SLOT_SIZE - height) / 2, width, height);
          bitmap.close?.();
        } else {
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.font = '92px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
          context.fillStyle = '#ffffff';
          context.fillText(key, ATLAS_SLOT_SIZE / 2, ATLAS_SLOT_SIZE / 2 + 4);
        }
        const source = typeof staging.transferToImageBitmap === 'function'
          ? staging.transferToImageBitmap()
          : await createImageBitmap(staging);
        if (atlasGeneration !== this.atlasGeneration || device !== this.device || atlasTexture !== this.atlasTexture) {
          throw new Error('Atlas was replaced while asset was loading');
        }
        device.queue.copyExternalImageToTexture(
          { source },
          {
            texture: atlasTexture,
            origin: [(slot % ATLAS_COLUMNS) * ATLAS_SLOT_SIZE, Math.floor(slot / ATLAS_COLUMNS) * ATLAS_SLOT_SIZE]
          },
          [ATLAS_SLOT_SIZE, ATLAS_SLOT_SIZE]
        );
        source.close?.();
        this.atlasEntries.set(key, slot);
        this.knownAssets.add(key);
        return slot;
      } catch (error) {
        if (atlasGeneration === this.atlasGeneration) this.freeAtlasSlots.push(slot);
        throw error;
      }
    }

    async _resolveAssetSlot(asset, fallbackAsset) {
      const primary = await this.ensureAsset(asset || DEFAULT_ASSET);
      if (primary !== null) return primary;
      const fallback = String(fallbackAsset || DEFAULT_ASSET);
      if (String(asset || DEFAULT_ASSET) !== fallback) {
        const fallbackSlot = await this.ensureAsset(fallback);
        if (fallbackSlot !== null) return fallbackSlot;
      }
      return null;
    }

    async spawn(options = {}) {
      const requested = Math.max(1, Math.min(Math.floor(Number(options.count) || 1), 500));
      if (!this.running || this.destroyed) {
        this.recordDropped(requested);
        return 0;
      }
      const textureSlot = await this._resolveAssetSlot(options.asset || options.emoji || DEFAULT_ASSET, options.fallbackAsset);
      if (textureSlot === null) {
        this.recordDropped(requested);
        return 0;
      }
      const queueRoom = Math.max(0, MAX_PENDING_SPAWNS - this.pendingSpawnCommands.length);
      const accepted = Math.min(requested, queueRoom);
      if (accepted < requested) this.recordDropped(requested - accepted);
      const kind = this._kindFor(options);
      const burst = options.burst === true || [KIND.burst, KIND.superfan, KIND.spark].includes(kind);
      for (let index = 0; index < accepted; index++) {
        this._writeParticle(this._createSpawnCommand(options, textureSlot, kind, burst, index, accepted));
      }
      return accepted;
    }

    _writeParticle(particle) {
      const command = particle instanceof ArrayBuffer ? particle : this._encodeParticle(particle);
      if (!(command instanceof ArrayBuffer) || command.byteLength !== PARTICLE_STRIDE) {
        this.recordDropped(1);
        return false;
      }
      this.pendingSpawnCommands.push(command);
      return true;
    }

    _kindFor(options) {
      const requested = String(options.kind || options.eventKind || 'rain').toLowerCase();
      if ((requested === 'profile' && options.balloon) || requested === 'profile-balloon') return KIND.profileBalloon;
      return Object.prototype.hasOwnProperty.call(KIND, requested) ? KIND[requested] : KIND.rain;
    }

    _createSpawnCommand(options, textureSlot, kind, burst, index, count) {
      const intensity = clamp(options.intensity, 0.1, 10, 1);
      const minSize = clamp(options.minSize, 8, 1024, clamp(this.config.emoji_min_size_px, 8, 512, 38));
      const maxSize = clamp(options.maxSize, minSize, 2048, clamp(this.config.emoji_max_size_px, minSize, 1024, 80));
      const baseSize = Number.isFinite(Number(options.size))
        ? clamp(options.size, 8, 2048, minSize)
        : minSize + Math.random() * (maxSize - minSize);
      const depthEnabled = this._featureEnabled('depth');
      const depth = depthEnabled ? 0.08 + Math.random() * 0.92 : 0.5;
      const size = baseSize * (depthEnabled ? 0.78 + depth * 0.4 : 1) * Math.min(2.4, Math.max(0.65, intensity));
      const balloon = kind === KIND.balloon || kind === KIND.profileBalloon;
      const angle = burst ? (index / Math.max(1, count)) * Math.PI * 2 + (Math.random() - 0.5) * 0.34 : 0;
      const burstSpeed = burst ? (140 + Math.random() * 360) * intensity : 0;
      const position = this._spawnPosition(options, index, count, size, balloon);
      const windDirection = this._windDirection();
      const velocityX = burst
        ? Math.cos(angle) * burstSpeed
        : (Math.random() - 0.5) * 90 + windDirection * clamp(options.windStrength, 0, 3, 1) * 12;
      const velocityY = burst
        ? Math.sin(angle) * burstSpeed
        : balloon ? -(42 + Math.random() * 66) : 80 + Math.random() * 180;
      const configuredLifetimeMs = clamp(options.lifetimeMs, 250, 120000, clamp(this.config.emoji_lifetime_ms, 250, 120000, 7600));
      const burstDurationMs = clamp(options.burstDurationMs, 0, 30000, clamp(this.config.superfan_burst_duration, 0, 30000, 2000));
      const lifetimeMs = kind === KIND.superfan || kind === KIND.burst
        ? Math.max(configuredLifetimeMs, burstDurationMs)
        : configuredLifetimeMs;
      const fadeMs = clamp(options.fadeMs, 0, lifetimeMs, clamp(this.config.emoji_fade_duration_ms, 0, 30000, 1100));
      const rotationScale = this.toasterMode ? 0 : clamp(this.config.emoji_rotation_speed, 0, 2, 0.035);
      const hue = this._resolveHue(options, kind);
      const color = this._resolveColor(options, kind, hue);
      const flags = ACTIVE_FLAG
        | (options.glow === false || !this._featureEnabled('glow') ? 0 : FRAME_FLAG.glow)
        | (options.impactParticles === false || !this._featureEnabled('particles') || this.config.effect === 'none' ? 0 : FRAME_FLAG.particles)
        | (options.depth === false || !depthEnabled ? 0 : FRAME_FLAG.depth);
      const popYNormalized = clamp(options.popY, 0.02, 0.98, clamp(this.config.heart_balloon_pop_y, 0.05, 0.95, 0.5));
      const bounds = this._pixelBounds();
      const popY = bounds.top + popYNormalized * (bounds.bottom - bounds.top);
      return {
        x: position.x,
        y: position.y,
        velocityX,
        velocityY,
        color,
        restitution: this.config.bounce_enabled === false ? 0 : clamp(this.config.bounce_height, 0, 1.5, clamp(this.config.physics_restitution, 0, 1.5, 0.62)),
        air: clamp(this.config.physics_air, 0, 1, 0.028) * 10,
        glow: options.glow === false || !this._featureEnabled('glow') ? 0 : this.profileTuning.glow * this.visualGlowMultiplier * (0.5 + this.intensity),
        popY,
        windStrength: clamp(options.windStrength, 0, 3, balloon ? clamp(this.config.heart_balloon_wind_strength, 0, 3, 0.45) : 1),
        hue: hue / 360,
        depth,
        size,
        rotation: Number.isFinite(Number(options.rotation)) ? Number(options.rotation) : Math.random() * Math.PI * 2,
        angularVelocity: (Math.random() - 0.5) * 90 * rotationScale * (balloon ? 0.18 : 1),
        lifetime: lifetimeMs / 1000,
        fadeSeconds: fadeMs / 1000,
        textureSlot,
        kind,
        flags,
        material: this._materialFor(kind),
        seed: Math.random() * 10000
      };
    }

    _encodeParticle(particle) {
      const bytes = new ArrayBuffer(PARTICLE_STRIDE);
      const floats = new Float32Array(bytes);
      const uints = new Uint32Array(bytes);
      floats[0] = particle.x;
      floats[1] = particle.y;
      floats[2] = particle.velocityX;
      floats[3] = particle.velocityY;
      floats[4] = particle.color[0];
      floats[5] = particle.color[1];
      floats[6] = particle.color[2];
      floats[7] = particle.color[3];
      floats[8] = particle.restitution;
      floats[9] = particle.air;
      floats[10] = particle.glow;
      // params0.w is the transient floor-impact pulse used by the shader.
      // The stable random seed lives at float 26; duplicating it here turns a
      // normal sprite into an enormous pulse on its first rendered frame.
      floats[11] = clamp(particle.impact, 0, 1, 0);
      floats[12] = particle.popY;
      floats[13] = particle.windStrength;
      floats[14] = particle.hue;
      floats[15] = particle.depth;
      floats[16] = particle.size;
      floats[17] = particle.rotation;
      floats[18] = particle.angularVelocity;
      floats[19] = particle.lifetime;
      floats[20] = particle.lifetime;
      floats[21] = particle.fadeSeconds;
      uints[22] = particle.textureSlot;
      uints[23] = particle.kind;
      uints[24] = particle.flags || ACTIVE_FLAG;
      uints[25] = particle.material;
      floats[26] = particle.seed;
      return bytes;
    }

    _spawnPosition(options, index, count, size, balloon) {
      const bounds = this._pixelBounds();
      const centered = count <= 1 ? 0 : index / (count - 1) - 0.5;
      const defaultXSpread = Math.min(bounds.right - bounds.left, Math.max(40, count * 14));
      const defaultYSpread = Math.min(bounds.bottom - bounds.top, Math.max(20, count * 7));
      const xSpread = clamp(options.xSpread ?? options.spreadX, 0, bounds.right - bounds.left, defaultXSpread);
      const ySpread = clamp(options.ySpread ?? options.spreadY, 0, bounds.bottom - bounds.top, defaultYSpread);
      const baseX = this._coordinate(options.x, bounds.left, bounds.right, Math.random());
      const defaultY = balloon ? 1 : 0;
      const baseY = this._coordinate(options.y, bounds.top, bounds.bottom, defaultY);
      return {
        x: clamp(baseX + centered * xSpread + (Math.random() - 0.5) * Math.min(48, xSpread * 0.24), bounds.left + size * 0.5, bounds.right - size * 0.5, baseX),
        y: clamp(baseY + centered * ySpread + (Math.random() - 0.5) * Math.min(32, ySpread * 0.2), bounds.top - size * 2, bounds.bottom + size * 2, baseY)
      };
    }

    _coordinate(value, start, end, fallbackNormalized) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return start + fallbackNormalized * (end - start);
      if (numeric >= 0 && numeric <= 1) return start + numeric * (end - start);
      return numeric;
    }

    _pixelBounds() {
      const width = this.logicalWidth || Number(this.config.obs_hud_width) || 1920;
      const height = this.logicalHeight || Number(this.config.obs_hud_height) || 1080;
      return {
        left: this.boundingBox.x * width,
        top: this.boundingBox.y * height,
        right: (this.boundingBox.x + this.boundingBox.width) * width,
        bottom: (this.boundingBox.y + this.boundingBox.height) * height
      };
    }

    _materialFor(kind) {
      if (kind === KIND.gift) return 1;
      if (kind === KIND.sticker) return 2;
      if (kind === KIND.profile || kind === KIND.profileBalloon) return 3;
      if (kind === KIND.balloon) return 4;
      if (kind >= KIND.like && kind <= KIND.superfan) return 5 + kind - KIND.like;
      if (kind === KIND.spark) return 8;
      return 0;
    }

    _resolveHue(options, kind) {
      if (Number.isFinite(Number(options.hue))) return ((Number(options.hue) % 360) + 360) % 360;
      const username = String(options.username || '');
      if (username) {
        let hash = 2166136261;
        for (let index = 0; index < username.length; index++) {
          hash ^= username.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
        return ((hash >>> 0) % 360 + 360) % 360;
      }
      const kindHues = [205, 340, 52, 48, 42, 286, 210, 345, 155, 198, 275, 318, 210];
      return (kindHues[kind] ?? 205) + (Math.random() - 0.5) * 24;
    }

    _resolveColor(options, kind, hue) {
      const explicit = this._parseColor(options.color || options.glowColor);
      if (explicit) return explicit;
      if (Number.isFinite(Number(options.hue))) {
        return [...this._hslToRgb(hue / 360, this.profileName === 'neon' ? 1 : 0.78, this.profileName === 'cinematic' ? 0.68 : 0.6), 1];
      }
      const mode = this.theme !== 'default' ? this.theme : String(this.config.color_mode || 'cool').toLowerCase();
      if (mode === 'off') return [1, 1, 1, 1];
      const palettes = {
        warm: ['#ff6b35', '#ffb703', '#ff477e', '#ffd166'],
        cool: ['#52b6ff', '#5eead4', '#818cf8', '#d8b4fe'],
        neon: ['#00f5ff', '#ff2bd6', '#b6ff00', '#8b5cf6'],
        pastel: ['#ffb3c7', '#bde0fe', '#caffbf', '#e4c1f9'],
        cinematic: ['#f6d365', '#8ec5fc', '#c3cfe2', '#fbc2eb'],
        hybrid: ['#51d6ff', '#ff65c3', '#ffd166', '#8bffbf']
      };
      const palette = palettes[mode];
      if (palette) {
        const color = this._parseColor(palette[Math.floor(Math.random() * palette.length)]);
        const amount = clamp(this.config.color_intensity, 0, 1, 0.4);
        return [1 + (color[0] - 1) * amount, 1 + (color[1] - 1) * amount, 1 + (color[2] - 1) * amount, 1];
      }
      const saturation = mode === 'pastel' ? 0.55 : mode === 'neon' ? 1 : 0.75;
      const lightness = mode === 'neon' ? 0.58 : 0.68;
      return [...this._hslToRgb(hue / 360, saturation, lightness), 1];
    }

    _parseColor(input) {
      if (!input || typeof input !== 'string' || !/^#[0-9a-f]{6}$/i.test(input)) return null;
      return [
        parseInt(input.slice(1, 3), 16) / 255,
        parseInt(input.slice(3, 5), 16) / 255,
        parseInt(input.slice(5, 7), 16) / 255,
        1
      ];
    }

    _hslToRgb(hue, saturation, lightness) {
      const channel = offset => {
        const k = (offset + hue * 12) % 12;
        return lightness - saturation * Math.min(lightness, 1 - lightness) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      };
      return [channel(0), channel(8), channel(4)];
    }

    _windDirection() {
      if (this.config.wind_direction === 'left') return -1;
      if (this.config.wind_direction === 'right') return 1;
      return Math.sin(performance.now() / 4300) >= 0 ? 1 : -1;
    }

    clear() {
      this.pendingSpawnCommands.length = 0;
      if (!this.device) return;
      this.device.queue.writeBuffer(this.particleBuffer, 0, new Uint8Array(GPU_CAPACITY * PARTICLE_STRIDE));
      this.device.queue.writeBuffer(this.slotStateBuffer, 0, new Uint32Array(GPU_CAPACITY));
      this.device.queue.writeBuffer(this.counterBuffer, 0, new Uint32Array(4));
      this.device.queue.writeBuffer(this.spawnMetaBuffer, 0, new Uint32Array(4));
      this.activeParticles = 0;
      this.gpuDroppedLast = 0;
    }

    _clearCapacityTail(startIndex) {
      if (!this.device || startIndex >= GPU_CAPACITY) return;
      const tailCount = GPU_CAPACITY - Math.max(0, startIndex);
      this.device.queue.writeBuffer(this.particleBuffer, startIndex * PARTICLE_STRIDE, new Uint8Array(tailCount * PARTICLE_STRIDE));
      this.device.queue.writeBuffer(this.slotStateBuffer, startIndex * 4, new Uint32Array(tailCount));
    }

    _writeUniforms(delta, time) {
      const data = new ArrayBuffer(UNIFORM_SIZE);
      const floats = new Float32Array(data);
      const uints = new Uint32Array(data);
      const bounds = this._pixelBounds();
      const direction = this._windDirection();
      const configuredWind = this.toasterMode ? 0 : this.config.wind_enabled
        ? clamp(this.config.wind_strength, 0, 100, 50) * direction
        : clamp(this.config.physics_wind_strength, 0, 1, 0.0005) * 1000 * direction;
      const variation = this.toasterMode ? 0 : clamp(this.config.physics_wind_variation, 0, 1, 0.0003) * 100000;
      const gravity = clamp(this.config.physics_gravity_y, -2, 4, 0.88) * 980 * this.profileTuning.gravity;
      let flags = 0;
      if (this.config.floor_enabled !== false) flags |= FRAME_FLAG.floor;
      if (this.config.bounce_enabled !== false) flags |= FRAME_FLAG.bounce;
      if (this._featureEnabled('rainbow')) flags |= FRAME_FLAG.rainbow;
      if (this._featureEnabled('pixel')) flags |= FRAME_FLAG.pixel;
      if (this._featureEnabled('glow')) flags |= FRAME_FLAG.glow;
      if (this._featureEnabled('particles') && this.config.effect !== 'none') flags |= FRAME_FLAG.particles;
      if (this._featureEnabled('depth')) flags |= FRAME_FLAG.depth;
      if (!this.toasterMode && this.config.enable_soft_shadows !== false) flags |= FRAME_FLAG.shadows;
      floats[0] = this.logicalWidth;
      floats[1] = this.logicalHeight;
      floats[2] = this.paused ? 0 : delta;
      floats[3] = time / 1000;
      floats[4] = 0;
      floats[5] = gravity;
      floats[6] = configuredWind;
      floats[7] = variation;
      floats[8] = this.intensity;
      floats[9] = bounds.bottom;
      floats[10] = this.collisionsEnabled ? 1 : 0;
      floats[11] = this.trailsEnabled ? this.profileTuning.trail : 0;
      floats[12] = this.profile;
      floats[13] = this.speed;
      floats[14] = clamp(this.config.physics_friction, 0, 1, 0.11);
      floats[15] = clamp(this.config.bounce_damping, 0, 1, 0.15);
      floats[16] = bounds.left;
      floats[17] = bounds.top;
      floats[18] = bounds.right;
      floats[19] = bounds.bottom;
      uints[20] = GRID_COLUMNS;
      uints[21] = GRID_ROWS;
      floats[22] = Math.max(1, (bounds.right - bounds.left) / GRID_COLUMNS);
      floats[23] = Math.max(1, (bounds.bottom - bounds.top) / GRID_ROWS);
      floats[24] = clamp(this.config.rainbow_speed, 0.05, 10, 1);
      floats[25] = clamp(this.config.pixel_size, 1, 16, 4);
      uints[26] = flags;
      uints[27] = this.particleLimit;
      floats[28] = this.adaptivePostLevel;
      floats[29] = this.targetFrameMs;
      this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
    }

    _flushSpawnCommands() {
      this._updateSpawnBudget();
      const count = Math.min(this.pendingSpawnCommands.length, this.currentSpawnBudget, SPAWN_COMMAND_CAPACITY);
      if (count > 0) {
        const packed = new Uint8Array(count * PARTICLE_STRIDE);
        for (let index = 0; index < count; index++) {
          packed.set(new Uint8Array(this.pendingSpawnCommands[index]), index * PARTICLE_STRIDE);
        }
        this.pendingSpawnCommands.splice(0, count);
        this.device.queue.writeBuffer(this.spawnCommandBuffer, 0, packed);
      }
      this.device.queue.writeBuffer(this.spawnMetaBuffer, 0, new Uint32Array([count, 0, 0, 0]));
      return count;
    }

    _frame(time) {
      if (!this.running || this.destroyed) return;
      if (time + 0.25 < this.nextFrameAt) {
        this.frameHandle = requestAnimationFrame(next => this._frame(next));
        return;
      }
      const frameStart = performance.now();
      const elapsedMs = Math.max(1, time - this.lastFrameAt);
      const delta = Math.min(0.05, elapsedMs / 1000);
      this.lastFrameAt = time;
      this.nextFrameAt = time + this.targetFrameMs;
      this.frameIntervalAverage = this.frameIntervalAverage * 0.9 + elapsedMs * 0.1;
      this._resize();
      this._writeUniforms(delta, time);
      const spawnCount = this._flushSpawnCommands();
      const encoder = this.device.createCommandEncoder({ label: 'emoji-frame' });
      const measureGPU = this.timestampEnabled && !this.timestampReadbackPending && time - this.lastMetricsAt > 750;
      const computeDescriptor = { label: 'emoji-compute' };
      if (measureGPU) {
        computeDescriptor.timestampWrites = {
          querySet: this.timestampQuerySet,
          beginningOfPassWriteIndex: 0
        };
      }
      const compute = encoder.beginComputePass(computeDescriptor);
      const computeDispatches = [
        ['clear', Math.ceil(GRID_CELLS / 64)],
        ['spawn', Math.ceil(spawnCount / 64)],
        ['build', Math.ceil(GPU_CAPACITY / 64)],
        ['simulate', Math.ceil(GPU_CAPACITY / 64)],
        ['finalize', 1]
      ];
      for (const [name, dispatch] of computeDispatches) {
        if (dispatch < 1) continue;
        compute.setPipeline(this.computePipelines[name]);
        compute.setBindGroup(0, this.computeBindGroups[name]);
        compute.dispatchWorkgroups(dispatch);
      }
      compute.end();

      const scene = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.sceneTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      if (this.trailsEnabled && this.adaptivePostLevel > 0.18) {
        scene.setPipeline(this.historyPipeline);
        scene.setBindGroup(0, this.historyBindGroup);
        scene.draw(3);
      }
      scene.setPipeline(this.spritePipeline);
      scene.setBindGroup(0, this.spriteBindGroup);
      scene.drawIndirect(this.indirectBuffer, 0);
      scene.end();

      for (let level = 0; level < this.bloomTextures.length; level++) {
        const bloom = encoder.beginRenderPass({
          label: 'emoji-bloom-pyramid-pass-' + level,
          colorAttachments: [{
            view: this.bloomTextures[level].createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store'
          }]
        });
        if (this.bloomEnabled && this.adaptivePostLevel > 0.32) {
          bloom.setPipeline(this.bloomPipeline);
          bloom.setBindGroup(0, this.bloomBindGroups[level]);
          bloom.draw(3);
        }
        bloom.end();
      }

      const outputDescriptor = {
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      };
      if (measureGPU) {
        outputDescriptor.timestampWrites = {
          querySet: this.timestampQuerySet,
          endOfPassWriteIndex: 1
        };
      }
      const output = encoder.beginRenderPass(outputDescriptor);
      output.setPipeline(this.compositePipeline);
      output.setBindGroup(0, this.compositeBindGroup);
      output.draw(3);
      output.end();
      encoder.copyTextureToTexture(
        { texture: this.sceneTexture },
        { texture: this.historyTexture },
        [this.canvas.width, this.canvas.height]
      );

      const readCounters = !this.counterReadbackPending && time - this.lastMetricsAt > 750;
      if (readCounters) {
        encoder.copyBufferToBuffer(this.counterBuffer, 0, this.counterReadback, 0, 16);
        this.counterReadbackPending = true;
      }
      if (measureGPU) {
        encoder.resolveQuerySet(this.timestampQuerySet, 0, 2, this.timestampResolveBuffer, 0);
        encoder.copyBufferToBuffer(this.timestampResolveBuffer, 0, this.timestampReadback, 0, 16);
        this.timestampReadbackPending = true;
      }
      const queueTimingStartedAt = measureGPU ? performance.now() : 0;
      this.device.queue.submit([encoder.finish()]);
      if (readCounters) void this._readCounters(time);
      if (measureGPU) void this._readTimestamp(queueTimingStartedAt);

      const cpuFrameMs = performance.now() - frameStart;
      this.cpuFrameTimeAverage = this.cpuFrameTimeAverage * 0.9 + cpuFrameMs * 0.1;
      this._adaptQuality(time);
      this.metrics = {
        ...this.metrics,
        state: 'ready',
        fps: Number((1000 / Math.max(1, this.frameIntervalAverage)).toFixed(1)),
        frameTimeMs: Number(this.frameIntervalAverage.toFixed(2)),
        cpuFrameTimeMs: Number(this.cpuFrameTimeAverage.toFixed(2)),
        gpuTimeMs: Number(this.gpuTimeMs.toFixed(3)),
        gpuTimeSource: this.gpuTimeSource,
        invalidTimestampSamples: this.invalidTimestampSamples,
        activeParticles: this.activeParticles,
        droppedParticles: this.droppedParticles,
        queuedParticles: this.pendingSpawnCommands.length,
        atlasEntries: this.atlasEntries.size,
        atlasCapacity: ATLAS_CAPACITY,
        capacity: GPU_CAPACITY,
        particleLimit: this.particleLimit,
        resolution: this.canvas.width + 'x' + this.canvas.height,
        profile: this.profileName,
        quality: this.qualityName,
        renderScale: Number((this.quality.renderScale * this.adaptiveScale).toFixed(2)),
        postProcessLevel: Number(this.adaptivePostLevel.toFixed(2)),
        spawnBudget: this.currentSpawnBudget,
        targetFps: this.targetFps
      };
      this.options.onMetrics?.({ ...this.metrics });
      this.frameHandle = requestAnimationFrame(next => this._frame(next));
    }

    async _readCounters(time) {
      try {
        await this.counterReadback.mapAsync(GPUMapMode.READ);
        const values = new Uint32Array(this.counterReadback.getMappedRange().slice(0));
        this.activeParticles = Math.min(values[0], this.particleLimit);
        const gpuDropped = values[1] >>> 0;
        const delta = gpuDropped >= this.gpuDroppedLast ? gpuDropped - this.gpuDroppedLast : gpuDropped;
        if (delta) this.recordDropped(delta);
        this.gpuDroppedLast = gpuDropped;
        this.counterReadback.unmap();
      } catch (_) {
        try { this.counterReadback.unmap(); } catch (_) {}
      } finally {
        this.lastMetricsAt = time;
        this.counterReadbackPending = false;
      }
    }

    async _readTimestamp(queueTimingStartedAt = 0) {
      try {
        await this.timestampReadback.mapAsync(GPUMapMode.READ);
        const values = new BigUint64Array(this.timestampReadback.getMappedRange().slice(0));
        const candidateMs = values[1] >= values[0] ? Number(values[1] - values[0]) / 1e6 : NaN;
        const plausibleCeilingMs = Math.max(250, this.targetFrameMs * 12);
        if (Number.isFinite(candidateMs) && candidateMs > 0 && candidateMs <= plausibleCeilingMs) {
          this.gpuTimeMs = this.gpuTimeMs > 0
            ? this.gpuTimeMs * 0.72 + candidateMs * 0.28
            : candidateMs;
          this.gpuTimeSource = 'timestamp-query';
        } else {
          this.invalidTimestampSamples++;
          const queueLatencyMs = performance.now() - queueTimingStartedAt;
          if (queueTimingStartedAt > 0 && Number.isFinite(queueLatencyMs) && queueLatencyMs > 0 && queueLatencyMs <= plausibleCeilingMs) {
            this.gpuTimeMs = this.gpuTimeMs > 0
              ? this.gpuTimeMs * 0.72 + queueLatencyMs * 0.28
              : queueLatencyMs;
            this.gpuTimeSource = 'queue-fallback';
          } else {
            this.gpuTimeSource = 'invalid';
          }
        }
        this.timestampReadback.unmap();
      } catch (_) {
        try { this.timestampReadback.unmap(); } catch (_) {}
      } finally {
        this.timestampReadbackPending = false;
      }
    }

    _updateSpawnBudget() {
      const base = this.quality?.spawnBudget || SPAWN_COMMAND_CAPACITY;
      this.currentSpawnBudget = Math.max(16, Math.min(SPAWN_COMMAND_CAPACITY, Math.floor(base * this.adaptiveSpawnFactor)));
    }

    _adaptQuality(time) {
      if (!this.fpsOptimizationEnabled || this.config.adaptive_quality === false || this.qualityName !== 'auto' || this.toasterMode) return;
      const cooldown = clamp(this.config.adaptive_resolution_cooldown_ms, 100, 30000, 1200);
      if (time - this.lastAdaptAt < cooldown) return;
      this.lastAdaptAt = time;
      const target = 1000 / clamp(this.config.adaptive_resolution_target_fps, 10, 240, this.targetFps);
      // Queue completion includes browser scheduling and readback latency. It is
      // useful telemetry, but only native timestamp-query samples are precise
      // enough to steer render resolution without false quality drops.
      const gpuPressure = this.gpuTimeSource === 'timestamp-query' && this.gpuTimeMs > 0
        ? this.gpuTimeMs / target
        : 0;
      const pressure = Math.max(this.frameIntervalAverage / target, gpuPressure);
      const minScale = clamp(this.config.adaptive_resolution_min_scale, 0.25, 1, 0.58);
      const maxScale = clamp(this.config.adaptive_resolution_max_scale, minScale, 1, 1);
      const beforeScale = this.adaptiveScale;
      const sensitivity = this.fpsSensitivity;
      const minimumFps = clamp(this.config.adaptive_resolution_min_fps, 10, this.targetFps, 50);
      const minimumFpsPressure = (1000 / minimumFps) / target;
      const degradeThreshold = Math.max(1.08, minimumFpsPressure * (1 - sensitivity * 0.05));
      const recoverThreshold = 1.02 + Math.max(0, 1 - sensitivity) * 0.02;
      if (pressure > degradeThreshold) {
        this.adaptivePostLevel = Math.max(0.2, this.adaptivePostLevel - 0.12 * sensitivity);
        this.adaptiveSpawnFactor = Math.max(0.22, this.adaptiveSpawnFactor - 0.1 * sensitivity);
        if (this.config.adaptive_resolution_enabled !== false && this.adaptivePostLevel <= 0.55) {
          this.adaptiveScale = Math.max(minScale, this.adaptiveScale - clamp(this.config.adaptive_resolution_step_down, 0.005, 0.25, 0.06));
        }
      } else if (pressure < recoverThreshold) {
        if (this.config.adaptive_resolution_enabled !== false) {
          this.adaptiveScale = Math.min(maxScale, this.adaptiveScale + clamp(this.config.adaptive_resolution_step_up, 0.002, 0.25, 0.02));
        }
        this.adaptivePostLevel = Math.min(1, this.adaptivePostLevel + 0.04);
        this.adaptiveSpawnFactor = Math.min(1, this.adaptiveSpawnFactor + 0.04);
      }
      this._updateSpawnBudget();
      if (Math.abs(beforeScale - this.adaptiveScale) >= 0.015) this._resize(true);
    }

    _setState(state, extra = {}) {
      this.metrics = { ...this.metrics, backend: 'webgpu', state, ...extra };
      this.options.onState?.({ ...this.metrics });
    }

    _releaseGPUResources() {
      const resources = [
        this.particleBuffer,
        this.spawnCommandBuffer,
        this.spawnMetaBuffer,
        this.slotStateBuffer,
        this.uniformBuffer,
        this.gridHeadsBuffer,
        this.nextIndicesBuffer,
        this.activeIndicesBuffer,
        this.counterBuffer,
        this.counterReadback,
        this.indirectBuffer,
        this.timestampResolveBuffer,
        this.timestampReadback,
        this.timestampQuerySet,
        this.atlasTexture,
        this.sceneTexture,
        this.historyTexture,
        ...(this.bloomTextures || [])
      ];
      for (const resource of resources) {
        try { resource?.destroy?.(); } catch (_) {}
      }
      this.counterReadbackPending = false;
      this.timestampReadbackPending = false;
      this.timestampQuerySet = null;
      this.atlasTexture = null;
      this.sceneTexture = null;
      this.historyTexture = null;
      this.bloomTexture = null;
      this.bloomTextures = [];
    }

    destroy() {
      this.destroyed = true;
      this.running = false;
      this.initGeneration++;
      cancelAnimationFrame(this.frameHandle);
      this.pendingSpawnCommands.length = 0;
      this.pendingAssets.clear();
      this._releaseGPUResources();
      this.context?.unconfigure?.();
    }
  }

  globalThis.WebGPUEmojiEngine = WebGPUEmojiEngine;
})();
