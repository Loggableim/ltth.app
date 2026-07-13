(function registerEffectPipelines(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.VisualFxEffectPipelines = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEffectPipelinesModule() {
  function createShaderLibrary() {
    const shared = String.raw`
struct Uniforms {
  resolution: vec2f,
  fieldResolution: vec2f,
  time: f32,
  deltaTime: f32,
  effect: u32,
  style: u32,
  frameMode: u32,
  frameThickness: f32,
  intensity: f32,
  speed: f32,
  renderScale: f32,
  triggerPulse: f32,
  color: vec4f,
  background: vec4f,
  frameRect: vec4f,
  budgets: vec4u,
  material: vec4f,
  secondaryColor: vec4f,
  frameFx: vec4f,
  pulseFx: vec4f,
};

struct Particle {
  position: vec2f,
  velocity: vec2f,
  color: vec4f,
  life: f32,
  age: f32,
  size: f32,
  seed: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> field: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(3) var<storage, read_write> lightning: array<vec4f>;

fn hash11(value: f32) -> f32 {
  return fract(sin(value * 91.3458 + 17.135) * 47453.5453);
}

fn hash22(value: vec2f) -> vec2f {
  let n = sin(vec2f(dot(value, vec2f(127.1, 311.7)), dot(value, vec2f(269.5, 183.3))));
  return fract(n * 43758.5453);
}

fn noise2(point: vec2f) -> f32 {
  let cell = floor(point);
  let local = fract(point);
  let smoothLocal = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash11(dot(cell, vec2f(1.0, 57.0))), hash11(dot(cell + vec2f(1.0, 0.0), vec2f(1.0, 57.0))), smoothLocal.x),
    mix(hash11(dot(cell + vec2f(0.0, 1.0), vec2f(1.0, 57.0))), hash11(dot(cell + vec2f(1.0, 1.0), vec2f(1.0, 57.0))), smoothLocal.x),
    smoothLocal.y
  );
}

fn curlNoise(point: vec2f) -> vec2f {
  let epsilon = 0.05;
  let dx = noise2(point + vec2f(epsilon, 0.0)) - noise2(point - vec2f(epsilon, 0.0));
  let dy = noise2(point + vec2f(0.0, epsilon)) - noise2(point - vec2f(0.0, epsilon));
  return normalize(vec2f(dy, -dx) + vec2f(0.0001));
}

fn domainWarp(point: vec2f, time: f32) -> vec2f {
  let first = vec2f(noise2(point * 1.7 + time * 0.11), noise2(point.yx * 2.1 - time * 0.09));
  let second = vec2f(noise2(point * 3.9 + first * 2.4), noise2(point.yx * 4.3 - first * 1.8));
  return point + (first - 0.5) * 0.22 + (second - 0.5) * 0.08;
}
`;

    const renderShared = shared.replaceAll('read_write', 'read');
    const compute = shared + String.raw`
@compute @workgroup_size(8, 8)
fn simulateField(@builtin(global_invocation_id) id: vec3u) {
  let size = vec2u(uniforms.fieldResolution);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let index = id.y * size.x + id.x;
  let uv = (vec2f(id.xy) + 0.5) / vec2f(size);
  let flow = curlNoise(uv * 7.0 + vec2f(0.0, -uniforms.time * uniforms.speed * 0.2));
  let edge = 1.0 - min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)) * 5.0;
  let density = clamp(edge * uniforms.intensity + noise2(uv * 14.0 - uniforms.time * 0.3) * 0.4, 0.0, 2.0);
  field[index] = vec4f(flow, density, noise2(uv * 31.0 + uniforms.time));
}

@compute @workgroup_size(64)
fn updateParticles(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x;
  if (index >= uniforms.budgets.x || index >= arrayLength(&particles)) { return; }
  var particle = particles[index];
  let seed = f32(index) * 0.6180339;
  if (particle.life <= 0.0 || particle.age >= particle.life) {
    let random = hash22(vec2f(seed, floor(uniforms.time * 2.0)));
    let side = index % 4u;
    var origin = vec2f(random.x, 0.98);
    if (side == 1u) { origin = vec2f(random.x, 0.02); }
    if (side == 2u) { origin = vec2f(0.02, random.x); }
    if (side == 3u) { origin = vec2f(0.98, random.x); }
    particle.position = origin;
    particle.velocity = (random - 0.5) * vec2f(0.08, 0.16) + vec2f(0.0, -0.04);
    particle.life = 1.2 + random.y * 2.8;
    particle.age = random.y * particle.life;
    particle.size = 1.5 + random.x * 5.5;
    particle.seed = seed;
    particle.color = uniforms.color;
  }
  let curl = curlNoise(particle.position * 9.0 + uniforms.time * 0.15);
  particle.velocity += curl * uniforms.deltaTime * 0.025;
  particle.position += particle.velocity * uniforms.deltaTime;
  particle.age += uniforms.deltaTime;
  particles[index] = particle;
}

@compute @workgroup_size(64)
fn buildLightning(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x;
  if (index >= uniforms.budgets.y || index >= arrayLength(&lightning)) { return; }
  let t = f32(index) / max(1.0, f32(uniforms.budgets.y - 1u));
  let branch = f32(index % 7u) * 0.11;
  let jitter = (hash11(f32(index) * 12.77 + floor(uniforms.time * 18.0)) - 0.5) * (0.04 + branch);
  lightning[index] = vec4f(t, clamp(t + jitter, 0.0, 1.0), branch, hash11(f32(index) * 3.1));
}
`;

    const scene = renderShared + String.raw`
const EFFECT_FLAMES: u32 = 0u;
const EFFECT_PARTICLES: u32 = 1u;
const EFFECT_ENERGY: u32 = 2u;
const EFFECT_LIGHTNING: u32 = 3u;
const STYLE_REALISTIC: u32 = 0u;
const STYLE_NEON: u32 = 1u;
const STYLE_HYBRID: u32 = 2u;
const FRAME_STYLE_CLASSIC: u32 = 0u;
const FRAME_STYLE_ORGANIC: u32 = 1u;
const FRAME_STYLE_DOUBLE: u32 = 2u;
const FRAME_STYLE_SEGMENTED: u32 = 3u;
const FRAME_STYLE_PORTAL: u32 = 4u;

struct VertexOut { @builtin(position) position: vec4f, @location(0) uv: vec2f };

@vertex fn sceneVertex(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  let positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VertexOut;
  out.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  out.uv = positions[vertexIndex] * 0.5 + 0.5;
  return out;
}

fn sdBox(point: vec2f, center: vec2f, halfSize: vec2f) -> f32 {
  let offset = abs(point - center) - halfSize;
  return length(max(offset, vec2f(0.0))) + min(max(offset.x, offset.y), 0.0);
}

fn pulseWave(uv: vec2f) -> f32 {
  let phase = uniforms.time * max(0.1, uniforms.material.z) * 6.2831853;
  if (u32(uniforms.pulseFx.x) == 1u) {
    let beat = pow(max(0.0, sin(phase)), 12.0);
    let echo = pow(max(0.0, sin(phase * 2.0 - 1.1)), 18.0) * 0.55;
    return uniforms.material.y * max(beat, echo);
  }
  if (u32(uniforms.pulseFx.x) == 2u) {
    return uniforms.material.y * (0.5 + 0.5 * sin(phase + (uv.x + uv.y) * 18.0));
  }
  return uniforms.material.y * (0.5 + 0.5 * sin(phase));
}

fn sdFrame(uv: vec2f) -> f32 {
  let rectCenter = uniforms.frameRect.xy + uniforms.frameRect.zw * 0.5;
  let outer = sdBox(uv, rectCenter, uniforms.frameRect.zw * 0.5);
  let pulse = pulseWave(uv);
  let px = uniforms.frameThickness * (1.0 + pulse * 0.35) / max(uniforms.resolution.x, uniforms.resolution.y);
  let inner = sdBox(uv, rectCenter, max(vec2f(0.001), uniforms.frameRect.zw * 0.5 - px));
  var frame = max(outer, -inner);
  let frameStyle = u32(uniforms.material.w);
  if (frameStyle == FRAME_STYLE_ORGANIC || frameStyle == FRAME_STYLE_PORTAL) {
    let warped = domainWarp(uv * (5.0 + uniforms.pulseFx.y * 5.0), uniforms.time);
    frame += (noise2(warped * 3.0) - 0.5) * px * (0.8 + uniforms.frameFx.w * 2.4);
  }
  if (frameStyle == FRAME_STYLE_DOUBLE) {
    let gap = uniforms.frameFx.x / max(uniforms.resolution.x, uniforms.resolution.y);
    frame = min(frame, abs(frame + gap + px * 0.35) - px * 0.22);
  }
  if (uniforms.frameMode == 0u) { frame = max(frame, rectCenter.y - uv.y); }
  if (uniforms.frameMode == 1u) { frame = max(frame, uv.y - rectCenter.y); }
  if (uniforms.frameMode == 2u) { frame = max(frame, abs(uv.y - rectCenter.y) - uniforms.frameRect.w * 0.42); }
  return frame;
}

fn framePattern(uv: vec2f) -> f32 {
  let style = u32(uniforms.material.w);
  if (style != FRAME_STYLE_SEGMENTED && style != FRAME_STYLE_PORTAL) { return 1.0; }
  let count = max(4.0, uniforms.frameFx.y);
  let perimeter = (uv.x + uv.y * 1.17) * count;
  let gate = smoothstep(0.08, 0.2, min(fract(perimeter), 1.0 - fract(perimeter)));
  if (style == FRAME_STYLE_PORTAL) {
    return max(gate, pow(abs(sin(perimeter * 0.5 - uniforms.time * 2.0)), 12.0));
  }
  return gate;
}

fn styleColor(base: vec3f, energy: f32, uv: vec2f) -> vec3f {
  let travel = 0.5 + 0.5 * sin((uv.x + uv.y) * 14.0 - uniforms.time * 2.2);
  let palette = mix(base, uniforms.secondaryColor.rgb, clamp(energy * 0.55 + travel * 0.22, 0.0, 1.0));
  var material = palette;
  if (uniforms.style == STYLE_REALISTIC) {
    material = palette * vec3f(1.15, 0.72, 0.42);
  } else if (uniforms.style == STYLE_NEON) {
    material = mix(palette, palette.brg * 1.45 + palette * vec3f(0.08, 0.15, 0.32), 0.48) * (1.1 + energy);
  } else {
    material = mix(palette * vec3f(1.1, 0.82, 0.55), palette.brg * 1.35, 0.32) * (1.0 + energy * 0.65);
  }
  let hotCore = clamp(uniforms.material.x, 0.0, 1.0) * pow(clamp(energy, 0.0, 1.0), 3.0);
  return mix(material, vec3f(1.0, 0.95, 0.82), hotCore);
}

@fragment fn sceneFragment(input: VertexOut) -> @location(0) vec4f {
  let uv = input.uv;
  let distanceToFrame = sdFrame(uv);
  let feather = 0.002 + uniforms.frameFx.z * 0.018;
  let mask = (1.0 - smoothstep(-feather, feather, distanceToFrame)) * framePattern(uv);
  if (mask <= 0.0001) { discard; }
  let grid = vec2u(clamp(uv * uniforms.fieldResolution, vec2f(0.0), uniforms.fieldResolution - 1.0));
  let fieldIndex = grid.y * u32(uniforms.fieldResolution.x) + grid.x;
  let sample = field[min(fieldIndex, arrayLength(&field) - 1u)];
  var energy = sample.z * mask;
  if (uniforms.effect == EFFECT_FLAMES) {
    let warped = domainWarp(uv * 9.0 + sample.xy * 2.4 - vec2f(0.0, uniforms.time * uniforms.speed), uniforms.time);
    let lick = noise2(warped * 2.0) * 0.65 + noise2(warped * 4.7 + vec2f(0.0, uniforms.time)) * 0.35;
    energy *= 0.55 + lick * 0.95;
  } else if (uniforms.effect == EFFECT_ENERGY) {
    energy = mask * (0.45 + 0.55 * abs(sin(distanceToFrame * 220.0 - uniforms.time * uniforms.speed * 7.0 + sample.x * 4.0)));
  } else if (uniforms.effect == EFFECT_LIGHTNING) {
    let arcData = lightning[min(fieldIndex % max(1u, uniforms.budgets.y), arrayLength(&lightning) - 1u)];
    let arc = abs(sin((uv.x + uv.y + sample.x * 0.14) * 82.0 + floor(uniforms.time * 16.0)));
    let secondaryArc = pow(abs(sin((uv.x - uv.y + arcData.z) * 57.0 - uniforms.time * 21.0)), 28.0);
    energy = mask * (pow(arc, 18.0) * 2.8 + secondaryArc * 1.7 + 0.1);
  } else {
    energy = mask * (0.16 + sample.w * 0.22);
  }
  energy *= uniforms.intensity * (1.0 + uniforms.triggerPulse);
  energy *= 1.0 + pulseWave(uv);
  let color = styleColor(uniforms.color.rgb, clamp(energy, 0.0, 1.0), uv);
  let alpha = clamp(mask * (0.35 + energy), 0.0, 1.0);
  return vec4f(color * alpha * (1.0 + energy * 1.8), alpha);
}
`;

    const particle = renderShared + String.raw`
struct ParticleVertexOut { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) color: vec4f };

@vertex fn particleVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> ParticleVertexOut {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );
  let particle = particles[instanceIndex];
  let life = clamp(1.0 - particle.age / max(0.001, particle.life), 0.0, 1.0);
  let corner = corners[vertexIndex];
  let pixelSize = particle.size / uniforms.resolution;
  let position = particle.position * 2.0 - 1.0 + corner * pixelSize * 2.0;
  var out: ParticleVertexOut;
  out.position = vec4f(position.x, -position.y, 0.0, 1.0);
  out.uv = corner;
  out.color = particle.color * vec4f(1.0, 1.0, 1.0, life);
  return out;
}

@fragment fn particleFragment(input: ParticleVertexOut) -> @location(0) vec4f {
  let core = exp(-dot(input.uv, input.uv) * 4.5);
  let alpha = core * input.color.a;
  return vec4f(input.color.rgb * alpha * 2.4, alpha);
}
`;

    return { compute, scene, particle };
  }

  async function assertShader(module, label) {
    if (typeof module.getCompilationInfo !== 'function') return;
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter(message => message.type === 'error');
    if (errors.length) throw new Error(`${label} WGSL: ${errors.map(error => error.message).join('; ')}`);
  }

  async function createEffectPipelines(device) {
    const library = createShaderLibrary();
    const computeModule = device.createShaderModule({ label: 'visual-fx-compute-wgsl', code: library.compute });
    const sceneModule = device.createShaderModule({ label: 'visual-fx-scene-wgsl', code: library.scene });
    const particleModule = device.createShaderModule({ label: 'visual-fx-particle-wgsl', code: library.particle });
    await Promise.all([
      assertShader(computeModule, 'compute'),
      assertShader(sceneModule, 'scene'),
      assertShader(particleModule, 'particle')
    ]);
    const blend = {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
    };
    return {
      simulateField: device.createComputePipeline({ layout: 'auto', compute: { module: computeModule, entryPoint: 'simulateField' } }),
      updateParticles: device.createComputePipeline({ layout: 'auto', compute: { module: computeModule, entryPoint: 'updateParticles' } }),
      buildLightning: device.createComputePipeline({ layout: 'auto', compute: { module: computeModule, entryPoint: 'buildLightning' } }),
      scene: device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: sceneModule, entryPoint: 'sceneVertex' },
        fragment: { module: sceneModule, entryPoint: 'sceneFragment', targets: [{ format: 'rgba16float', blend }] },
        primitive: { topology: 'triangle-list' }
      }),
      particles: device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: particleModule, entryPoint: 'particleVertex' },
        fragment: { module: particleModule, entryPoint: 'particleFragment', targets: [{ format: 'rgba16float', blend }] },
        primitive: { topology: 'triangle-list' }
      })
    };
  }

  return { assertShader, createEffectPipelines, createShaderLibrary };
});
