(function weatherFramegraphModule(root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  root.WebGPUWeatherFramegraph = exported.WeatherFramegraph;
})(globalThis, () => {
  'use strict';

  const PARTICLE_STRIDE = 64;
  const INDIRECT_BYTES = 16;
  const U = () => globalThis.GPUBufferUsage || { STORAGE: 1, COPY_DST: 2, INDIRECT: 4, UNIFORM: 8, COPY_SRC: 16, MAP_READ: 32, QUERY_RESOLVE: 64 };
  const T = () => globalThis.GPUTextureUsage || { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2, STORAGE_BINDING: 4, COPY_SRC: 8, COPY_DST: 16 };
  const COLOR_LOOKUP = Object.freeze({ default: [0.68, 0.76, 0.84], ice: [0.48, 0.78, 1], golden: [1, 0.7, 0.32], warm: [1, 0.46, 0.2], cool: [0.35, 0.62, 1], violet: [0.62, 0.36, 1] });
  const TEMPERATURE_LOOKUP = Object.freeze({ default: 0, golden: 0.7, warm: 0.9, cool: -0.7, ice: -0.9, neutral: 0 });
  function colorVector(value) { return COLOR_LOOKUP[String(value || 'default').toLowerCase()] || COLOR_LOOKUP.default; }
  function temperatureValue(value) { return TEMPERATURE_LOOKUP[String(value || 'default').toLowerCase()] ?? 0; }

  // Particles, visible-index compaction and draw arguments are exclusively GPU-owned.
  const COMPUTE_WGSL = /* wgsl */`
struct Particle { position: vec4<f32>, velocity: vec4<f32>, state: vec4<f32>, trail: vec4<f32> };
struct Frame { viewport: vec2<f32>, time: f32, delta: f32, intensity: f32, wind: f32, direction: f32, layer: f32, opacity: f32, particleScale: f32, particleCap: f32, effectCount: f32, samples: f32, bloomPasses: f32, temporalBlend: f32, pad0: f32, pad1: f32 };
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> visible: array<u32>;
@group(0) @binding(2) var<storage, read_write> counters: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> indirectArgs: array<u32>;
@group(0) @binding(4) var<uniform> frame: Frame;
@group(0) @binding(5) var<storage, read> effectState: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read> spawnCommands: array<vec4<f32>>;
fn hash(n: f32) -> f32 { return fract(sin(n) * 43758.5453); }
fn rainSplashRippleGroundMist(y: f32) -> f32 { return smoothstep(-1.0, -0.92, y); }
fn snowAccumulation(y: f32) -> f32 { return smoothstep(-1.0, -0.82, y); }
fn particleTrail(speed: f32) -> f32 { return clamp(speed * 0.08, 0.0, 1.0); }
fn particleMaterialVelocity(kind: f32, seed: f32) -> vec2<f32> { if (kind == 0.0) { return vec2<f32>(seed * .12, -1.8); } if (kind == 1.0) { return vec2<f32>(seed * .03, -.24); } if (kind == 2.0) { return vec2<f32>(seed * .28, -1.1); } if (kind == 8.0) { return vec2<f32>(sin(seed * 20.0) * .18, cos(seed * 17.0) * .08); } if (kind == 9.0) { return vec2<f32>(seed * .8, -.5); } if (kind == 10.0) { return vec2<f32>(seed * .12, -.34); } return vec2<f32>(seed * .16, .08); }
fn integrateParticle(index: u32) {
  var p = particles[index];
  let wind = vec2<f32>(cos(frame.direction), sin(frame.direction)) * frame.wind;
  p.velocity.xy = p.velocity.xy + wind * frame.delta;
  p.position.xy = p.position.xy + p.velocity.xy * frame.delta;
  p.trail.xy = mix(p.trail.xy, p.position.xy, min(1.0, frame.delta * 14.0));
  // Rain retains splash/ripple/ground mist, snow retains accumulation, and the other particle effects retain trails entirely on GPU.
  if (p.position.y < -1.0) { let impact = p.position.y; p.state.x = 2.0; p.position.y = 1.0; if (p.state.y == 0.0) { p.trail.z = rainSplashRippleGroundMist(impact) + particleTrail(length(p.velocity.xy)); } else if (p.state.y == 1.0) { p.trail.z = snowAccumulation(impact); } else { p.trail.z = particleTrail(length(p.velocity.xy)); } }
  particles[index] = p;
}
@compute @workgroup_size(1) fn resetCounters() { atomicStore(&counters[0], 0u); }
@compute @workgroup_size(128) fn spawnParticles(@builtin(global_invocation_id) id: vec3<u32>) {
  let cap = u32(frame.particleCap); let count = u32(frame.effectCount);
  if (id.x >= cap || count == 0u) { return; }
  let slot = id.x % count; let command = spawnCommands[slot]; let shape = effectState[slot * 4u + 1u];
  if (particles[id.x].state.x > 0.0 && particles[id.x].state.y == command.x) { return; }
  let seed = hash(f32(id.x) + frame.time * 13.0);
  particles[id.x].position = vec4<f32>(seed * 2.0 - 1.0, 1.0 + seed, seed, 1.0);
  particles[id.x].velocity = vec4<f32>(particleMaterialVelocity(command.x, seed) * max(0.1, shape.y), 0.0, 0.0);
  particles[id.x].state = vec4<f32>(1.0, command.x, f32(slot), command.w);
  particles[id.x].trail = vec4<f32>(particles[id.x].position.xy, 0.0, 0.0);
}
@compute @workgroup_size(128) fn simulateParticles(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= arrayLength(&particles)) { return; }
  integrateParticle(id.x);
}
@compute @workgroup_size(128) fn compactParticles(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= arrayLength(&particles)) { return; }
  if (particles[id.x].state.x > 0.0) { let slot = atomicAdd(&counters[0], 1u); visible[slot] = id.x; }
}
@compute @workgroup_size(1) fn finalizeIndirectArgs() {
  indirectArgs[0] = 6u; indirectArgs[1] = atomicLoad(&counters[0]); indirectArgs[2] = 0u; indirectArgs[3] = 0u;
}`;

  const PARTICLE_WGSL = /* wgsl */`
struct Particle { position: vec4<f32>, velocity: vec4<f32>, state: vec4<f32>, trail: vec4<f32> };
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> visible: array<u32>;
@group(0) @binding(2) var<uniform> frame: vec4<f32>;
@group(0) @binding(3) var<storage, read> effectState: array<vec4<f32>>;
struct Out { @builtin(position) position: vec4<f32>, @location(0) color: vec4<f32> };
fn particleColor(kind: f32, tint: vec3<f32>) -> vec3<f32> { if (kind == 0.0) { return vec3<f32>(.55,.78,1.0); } if (kind == 1.0) { return vec3<f32>(.96,.98,1.0); } if (kind == 2.0) { return vec3<f32>(.24,.34,.58); } if (kind == 8.0) { return vec3<f32>(.78,1.0,.38); } if (kind == 9.0) { return vec3<f32>(1.0,.52,.22); } if (kind == 10.0) { return vec3<f32>(1.0,.52,.72); } if (kind == 11.0) { return vec3<f32>(1.0,.24,.05); } return tint; }
@vertex fn particleVertex(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Out {
  let p = particles[visible[ii]]; let corners = array<vec2<f32>, 6>(vec2<f32>(-1.,-1.), vec2<f32>(1.,-1.), vec2<f32>(1.,1.), vec2<f32>(-1.,-1.), vec2<f32>(1.,1.), vec2<f32>(-1.,1.));
  let kind = p.state.y; let material = effectState[u32(p.state.z) * 4u + 2u]; let shape = effectState[u32(p.state.z) * 4u + 1u]; let size = .004 + .018 * clamp(shape.y, .25, 2.0);
  var out: Out; out.position = vec4<f32>(p.position.xy + corners[vi] * size, p.position.z, 1.); out.color = vec4<f32>(particleColor(kind, material.xyz), clamp(p.state.w, 0.05, 1.0)); return out;
}
@fragment fn particleFragment(in: Out) -> @location(0) vec4<f32> { return in.color; }`;

  // Fullscreen cinema effects: fog, sunbeam, storm, thunder branches/flash, glitch, aurora and heatwave.
const POST_WGSL = /* wgsl */`
@group(0) @binding(0) var sceneHdr: texture_2d<f32>;
@group(0) @binding(1) var bloomHdr: texture_2d<f32>;
@group(0) @binding(2) var historyHdr: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
struct PostFrame { viewport: vec2<f32>, time: f32, delta: f32, intensity: f32, wind: f32, direction: f32, layer: f32, opacity: f32, particleScale: f32, particleCap: f32, effectCount: f32, samples: f32, bloomPasses: f32, temporalBlend: f32, pad0: f32, pad1: f32 };
@group(0) @binding(4) var<uniform> postFrame: PostFrame;
@group(0) @binding(5) var<storage, read> effectState: array<vec4<f32>>;
@vertex fn fullscreen(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> { let p = array<vec2<f32>,3>(vec2<f32>(-1.,-3.), vec2<f32>(3.,1.), vec2<f32>(-1.,1.)); return vec4<f32>(p[index],0.,1.); }
fn noise(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(12.9898,78.233))) * 43758.5453); }
fn thunderBolt(p: vec2<f32>, time: f32) -> f32 { let branch = sin(p.y * 34. + time * 18.) * .08 + sin(p.y * 91.) * .025; return smoothstep(.025, 0., abs(p.x - branch)) * smoothstep(.9,.15,p.y); }
fn auroraBands(uv: vec2<f32>) -> f32 { return sin(uv.x * 18. + uv.y * 4.) * .5 + .5; }
fn heatwaveRefraction(uv: vec2<f32>) -> f32 { return noise(uv * 42.) * .035; }
fn glitchClouds(uv: vec2<f32>) -> f32 { return noise(floor(uv * 45.)); }
fn bitEnabled(bits: f32, bit: f32) -> f32 { return floor(mod(floor(bits / bit), 2.0)); }
fn fullscreenEffect(kind: f32, uv: vec2<f32>, material: vec4<f32>, look: vec4<f32>) -> vec3<f32> {
  if (kind == 2.0) { return vec3<f32>(-0.32 * (0.4 + noise(uv * 12.0))); }
  if (kind == 3.0) { return mix(vec3<f32>(noise(uv * 18.0) * .22), look.xyz, .65) * (0.4 + look.w); }
  if (kind == 4.0) { let bolt = thunderBolt(uv - vec2<f32>(.5,0.), postFrame.time); return vec3<f32>(bolt * (1.0 + material.x * 3.0)); }
  if (kind == 5.0) { return vec3<f32>(pow(max(0.0,1.0-length(uv-vec2<f32>(.7,.1))*1.7),5.0)); }
  if (kind == 6.0) { let rgb = bitEnabled(look.x, 1.0); let displacement = bitEnabled(look.x, 2.0); let scanlines = bitEnabled(look.x, 4.0); let noiseOn = bitEnabled(look.x, 8.0); let blocks = bitEnabled(look.x, 16.0); let aberration = bitEnabled(look.x, 32.0); let shifted = glitchClouds(uv + vec2<f32>(displacement * .03, 0.0)); return vec3<f32>(shifted * (1.0 + rgb), shifted * (1.0 + scanlines * sin(uv.y * 720.0)), shifted * (1.0 + noiseOn + blocks + aberration)) * look.y; }
  if (kind == 7.0) { return vec3<f32>(auroraBands(uv),auroraBands(uv*.7),1.0); }
  if (kind == 12.0) { return vec3<f32>(heatwaveRefraction(uv + vec2<f32>(sin(postFrame.time + uv.y * 24.0) * .01, 0.0))); }
  return vec3<f32>(0.0);
}
fn layeredCinema(uv: vec2<f32>) -> vec3<f32> { var cinema = vec3<f32>(0.0); let samples = u32(clamp(postFrame.samples, 1.0, 48.0)); for (var effectIndex: u32 = 0u; effectIndex < 13u; effectIndex = effectIndex + 1u) { let base = effectIndex * 4u; let material = effectState[base]; let look = effectState[base + 2u]; let kind = effectState[base + 3u].z; if (material.x > 0.0) { var accumulation = vec3<f32>(0.0); for (var sample: u32 = 0u; sample < samples; sample = sample + 1u) { let depth = f32(sample) / f32(samples); accumulation = accumulation + fullscreenEffect(kind, uv + vec2<f32>(0.0, depth * .004), material, look); } let temperatureTint = vec3<f32>(1.0 + max(look.w, 0.0) * .28, 1.0, 1.0 + max(-look.w, 0.0) * .28); cinema = cinema + accumulation / f32(samples) * material.x * material.y * temperatureTint; } } return cinema; }
@fragment fn volumetricFragment(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> { let uv = p.xy / postFrame.viewport; let scene = textureSample(sceneHdr, linearSampler, uv); let cinema = layeredCinema(uv); return vec4<f32>(max(scene.rgb + cinema, vec3<f32>(0.0)), scene.a); }
@fragment fn bloomFragment(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> { let uv = p.xy / postFrame.viewport; let s = textureSample(sceneHdr, linearSampler, uv); return max(s - vec4<f32>(0.55), vec4<f32>(0.0)); }
@fragment fn temporalFragment(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> { let uv = p.xy / postFrame.viewport; return mix(textureSample(sceneHdr, linearSampler, uv), textureSample(historyHdr, linearSampler, uv), postFrame.temporalBlend); }
@fragment fn compositeFragment(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> { let uv = p.xy / postFrame.viewport; let scene = textureSample(sceneHdr, linearSampler, uv); let bloom = textureSample(bloomHdr, linearSampler, uv); let original = textureSample(historyHdr, linearSampler, uv); return vec4<f32>(scene.rgb + bloom.rgb + original.rgb * .05, max(scene.a, original.a)); }
`;

  class WeatherFramegraph {
    constructor(device, format, options = {}) {
      this.device = device;
      this.format = format;
      this.timestampEnabled = options.timestampEnabled === true;
      this.capacity = options.capacity || 4096;
      this.width = 1;
      this.height = 1;
      this.resources = {};
      this.pipelines = {};
    }

    initialize() {
      const usage = U();
      this.resources.particles = this.device.createBuffer({ label: 'weather-particle-storage', size: this.capacity * PARTICLE_STRIDE, usage: usage.STORAGE | usage.COPY_DST });
      this.resources.visible = this.device.createBuffer({ label: 'weather-gpu-compacted-visible-indices', size: this.capacity * 4, usage: usage.STORAGE | usage.COPY_DST });
      this.resources.counters = this.device.createBuffer({ label: 'weather-gpu-active-counter', size: 16, usage: usage.STORAGE | usage.COPY_DST | usage.COPY_SRC });
      this.resources.indirect = this.device.createBuffer({ label: 'weather-gpu-written-indirect-args', size: INDIRECT_BYTES, usage: usage.STORAGE | usage.INDIRECT | usage.COPY_DST });
      this.resources.uniforms = this.device.createBuffer({ label: 'weather-frame-effect-uniforms', size: 256, usage: usage.UNIFORM | usage.COPY_DST });
      this.resources.effectState = this.device.createBuffer({ label: 'weather-layered-effect-state', size: 13 * 16 * 4, usage: usage.STORAGE | usage.COPY_DST });
      this.resources.spawnCommands = this.device.createBuffer({ label: 'weather-bounded-effect-spawn-commands', size: 13 * 16, usage: usage.STORAGE | usage.COPY_DST });
      this.resources.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
      if (this.timestampEnabled) {
        this.resources.timestamps = this.device.createQuerySet({ type: 'timestamp', count: 2 });
        this.resources.timestampResolve = this.device.createBuffer({ label: 'weather-timestamp-resolve', size: 16, usage: usage.QUERY_RESOLVE | usage.COPY_SRC });
        this.resources.timestampReadback = this.device.createBuffer({ label: 'weather-timestamp-readback', size: 16, usage: usage.MAP_READ | usage.COPY_DST });
      }
      const compute = this.device.createShaderModule({ label: 'weather-compute-wgsl', code: COMPUTE_WGSL });
      const particle = this.device.createShaderModule({ label: 'weather-particle-wgsl', code: PARTICLE_WGSL });
      const post = this.device.createShaderModule({ label: 'weather-cinematic-wgsl', code: POST_WGSL });
      this.layouts = {
        compute: this.device.createBindGroupLayout({ entries: [0, 1, 2, 3].map((binding) => ({ binding, visibility: 4, buffer: { type: 'storage' } })).concat([{ binding: 4, visibility: 4, buffer: { type: 'uniform', minBindingSize: 64 } }, { binding: 5, visibility: 4, buffer: { type: 'read-only-storage' } }, { binding: 6, visibility: 4, buffer: { type: 'read-only-storage' } }]) }),
        particle: this.device.createBindGroupLayout({ entries: [{ binding: 0, visibility: 1, buffer: { type: 'read-only-storage' } }, { binding: 1, visibility: 1, buffer: { type: 'read-only-storage' } }, { binding: 2, visibility: 1, buffer: { type: 'uniform', minBindingSize: 16 } }, { binding: 3, visibility: 1, buffer: { type: 'read-only-storage' } }] }),
        post: this.device.createBindGroupLayout({ entries: [{ binding: 0, visibility: 2, texture: {} }, { binding: 1, visibility: 2, texture: {} }, { binding: 2, visibility: 2, texture: {} }, { binding: 3, visibility: 2, sampler: {} }, { binding: 4, visibility: 2, buffer: { type: 'uniform', minBindingSize: 64 } }, { binding: 5, visibility: 2, buffer: { type: 'read-only-storage' } }] })
      };
      this.pipelineLayouts = { compute: this.device.createPipelineLayout({ bindGroupLayouts: [this.layouts.compute] }), particle: this.device.createPipelineLayout({ bindGroupLayouts: [this.layouts.particle] }), post: this.device.createPipelineLayout({ bindGroupLayouts: [this.layouts.post] }) };
      this.pipelines.reset = this.device.createComputePipeline({ layout: this.pipelineLayouts.compute, compute: { module: compute, entryPoint: 'resetCounters' } });
      this.pipelines.spawn = this.device.createComputePipeline({ layout: this.pipelineLayouts.compute, compute: { module: compute, entryPoint: 'spawnParticles' } });
      this.pipelines.simulate = this.device.createComputePipeline({ layout: this.pipelineLayouts.compute, compute: { module: compute, entryPoint: 'simulateParticles' } });
      this.pipelines.compact = this.device.createComputePipeline({ layout: this.pipelineLayouts.compute, compute: { module: compute, entryPoint: 'compactParticles' } });
      this.pipelines.indirect = this.device.createComputePipeline({ layout: this.pipelineLayouts.compute, compute: { module: compute, entryPoint: 'finalizeIndirectArgs' } });
      this.pipelines.particle = this.device.createRenderPipeline({ layout: this.pipelineLayouts.particle, vertex: { module: particle, entryPoint: 'particleVertex' }, fragment: { module: particle, entryPoint: 'particleFragment', targets: [{ format: 'rgba16float', blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] }, primitive: { topology: 'triangle-list' } });
      ['volumetricFragment', 'bloomFragment', 'temporalFragment'].forEach((entry) => { this.pipelines[entry] = this.device.createRenderPipeline({ layout: this.pipelineLayouts.post, vertex: { module: post, entryPoint: 'fullscreen' }, fragment: { module: post, entryPoint: entry, targets: [{ format: 'rgba16float' }] }, primitive: { topology: 'triangle-list' } }); });
      this.pipelines.composite = this.device.createRenderPipeline({ layout: this.pipelineLayouts.post, vertex: { module: post, entryPoint: 'fullscreen' }, fragment: { module: post, entryPoint: 'compositeFragment', targets: [{ format: this.format }] }, primitive: { topology: 'triangle-list' } });
      this.bindGroups = {
        compute: this.device.createBindGroup({ layout: this.layouts.compute, entries: [
          { binding: 0, resource: { buffer: this.resources.particles } }, { binding: 1, resource: { buffer: this.resources.visible } }, { binding: 2, resource: { buffer: this.resources.counters } }, { binding: 3, resource: { buffer: this.resources.indirect } }, { binding: 4, resource: { buffer: this.resources.uniforms } }, { binding: 5, resource: { buffer: this.resources.effectState } }, { binding: 6, resource: { buffer: this.resources.spawnCommands } }
        ] }),
        particle: this.device.createBindGroup({ layout: this.layouts.particle, entries: [{ binding: 0, resource: { buffer: this.resources.particles } }, { binding: 1, resource: { buffer: this.resources.visible } }, { binding: 2, resource: { buffer: this.resources.uniforms } }, { binding: 3, resource: { buffer: this.resources.effectState } }] })
      };
      this.resize(1920, 1080);
    }

    resize(width, height) {
      this.width = Math.min(1920, Math.max(1, Math.floor(width || 1)));
      this.height = Math.min(1080, Math.max(1, Math.floor(height || 1)));
      ['scene', 'bloom', 'history', 'volume', 'temporal'].forEach((key) => this.resources[key]?.destroy?.());
      const usage = T();
      ['scene', 'bloom', 'history', 'volume', 'temporal'].forEach((key) => { this.resources[key] = this.device.createTexture({ label: `weather-hdr-${key}`, size: [this.width, this.height], format: 'rgba16float', usage: usage.RENDER_ATTACHMENT | usage.TEXTURE_BINDING | usage.STORAGE_BINDING | usage.COPY_SRC | usage.COPY_DST }); });
      const postEntries = (scene, bloom, history) => [{ binding: 0, resource: this.resources[scene].createView() }, { binding: 1, resource: this.resources[bloom].createView() }, { binding: 2, resource: this.resources[history].createView() }, { binding: 3, resource: this.resources.sampler }, { binding: 4, resource: { buffer: this.resources.uniforms } }, { binding: 5, resource: { buffer: this.resources.effectState } }];
      this.bindGroups.post = {
        volumetric: this.device.createBindGroup({ layout: this.layouts.post, entries: postEntries('scene', 'bloom', 'history') }),
        bloom: this.device.createBindGroup({ layout: this.layouts.post, entries: postEntries('volume', 'bloom', 'history') }),
        temporal: this.device.createBindGroup({ layout: this.layouts.post, entries: postEntries('volume', 'bloom', 'history') }),
        composite: this.device.createBindGroup({ layout: this.layouts.post, entries: postEntries('temporal', 'bloom', 'scene') })
      };
    }

    uploadEffectState(effects, quality, time, deltaSeconds) {
      // This fixed-size upload is per effect (max 13), never a CPU particle simulation.
      const packed = new Float32Array(13 * 16);
      effects.slice(0, 13).forEach((effect, index) => {
        const base = index * 16;
        const fogColor = colorVector(effect.fogColor);
        const glitchBits = (effect.glitchRgbShift ? 1 : 0) + (effect.glitchDisplacement ? 2 : 0) + (effect.glitchScanlines ? 4 : 0) + (effect.glitchNoise ? 8 : 0) + (effect.glitchBlocks ? 16 : 0) + (effect.glitchChromaticAberration ? 32 : 0);
        packed.set([
          effect.intensity, effect.duration, effect.permanent ? 1 : 0, effect.layer,
          effect.opacity, effect.particleScale, effect.wind, effect.directionDeg,
          fogColor[0], fogColor[1], fogColor[2], temperatureValue(effect.colorTemperature),
          glitchBits, effect.glitchIntensity, effect.effectIndex, 1
        ], base);
      });
      const commands = new Float32Array(13 * 4);
      effects.slice(0, 13).forEach((effect, index) => commands.set([effect.effectIndex, effect.layer, effect.intensity, effect.opacity], index * 4));
      this.activeParticleCap = Math.min(this.capacity, Math.max(0, quality.particleBudget));
      this.frameQuality = { ...quality };
      this.device.queue.writeBuffer(this.resources.effectState, 0, packed);
      this.device.queue.writeBuffer(this.resources.spawnCommands, 0, commands);
      this.device.queue.writeBuffer(this.resources.uniforms, 0, new Float32Array([this.width, this.height, time, deltaSeconds, effects[0]?.intensity || 0, effects[0]?.wind || 0, effects[0]?.directionDeg || 0, effects[0]?.layer || 0, effects[0]?.opacity || 0, effects[0]?.particleScale || 1, this.activeParticleCap, effects.length, quality.volumetricSamples, quality.bloomPasses, quality.temporalStability, quality.temporalStability]));
    }

    encode(encoder, targetView, metrics) {
      const workgroups = Math.ceil((this.activeParticleCap || 0) / 128);
      const compute = encoder.beginComputePass(this.timestampEnabled ? { timestampWrites: { querySet: this.resources.timestamps, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {});
      if (this.bindGroups?.compute) compute.setBindGroup(0, this.bindGroups.compute);
      compute.setPipeline(this.pipelines.reset); compute.dispatchWorkgroups(1);
      compute.setPipeline(this.pipelines.spawn); compute.dispatchWorkgroups(workgroups);
      compute.setPipeline(this.pipelines.simulate); compute.dispatchWorkgroups(workgroups);
      compute.setPipeline(this.pipelines.compact); compute.dispatchWorkgroups(workgroups);
      compute.setPipeline(this.pipelines.indirect); compute.dispatchWorkgroups(1); compute.end();
      const particlePass = encoder.beginRenderPass({ colorAttachments: [{ view: this.resources.scene.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      particlePass.setPipeline(this.pipelines.particle); if (this.bindGroups?.particle) particlePass.setBindGroup(0, this.bindGroups.particle); particlePass.drawIndirect(this.resources.indirect, 0); particlePass.end();
      const postPass = (name, target, group) => { const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.resources[target].createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] }); pass.setPipeline(this.pipelines[name]); pass.setBindGroup(0, group); pass.draw(3); pass.end(); };
      postPass('volumetricFragment', 'volume', this.bindGroups.post.volumetric);
      const bloomPasses = Math.max(1, Math.round(this.frameQuality?.bloomPasses || 1));
      for (let passIndex = 0; passIndex < bloomPasses; passIndex++) postPass('bloomFragment', 'bloom', this.bindGroups.post.bloom);
      postPass('temporalFragment', 'temporal', this.bindGroups.post.temporal);
      const composite = encoder.beginRenderPass({ colorAttachments: [{ view: targetView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] }); composite.setPipeline(this.pipelines.composite); composite.setBindGroup(0, this.bindGroups.post.composite); composite.draw(3); composite.end();
      encoder.copyTextureToTexture?.({ texture: this.resources.temporal }, { texture: this.resources.history }, [this.width, this.height, 1]);
      if (this.timestampEnabled) { encoder.resolveQuerySet(this.resources.timestamps, 0, 2, this.resources.timestampResolve, 0); encoder.copyBufferToBuffer(this.resources.timestampResolve, 0, this.resources.timestampReadback, 0, 16); }
      metrics.activeParticles = Math.min(this.capacity, metrics.activeParticles || 0);
    }

    destroy() { Object.values(this.resources).forEach((resource) => resource?.destroy?.()); this.resources = {}; }

    async readTimestampMs() {
      if (!this.timestampEnabled || !this.resources.timestampReadback) return null;
      try {
        await this.resources.timestampReadback.mapAsync(globalThis.GPUMapMode?.READ || 1);
        const samples = new BigUint64Array(this.resources.timestampReadback.getMappedRange().slice(0));
        this.resources.timestampReadback.unmap();
        return samples[1] > samples[0] ? Number(samples[1] - samples[0]) / 1e6 : 0;
      } catch (_) { try { this.resources.timestampReadback.unmap(); } catch (_) {} return null; }
    }
  }

  return { WeatherFramegraph, COMPUTE_WGSL, PARTICLE_WGSL, POST_WGSL };
});
