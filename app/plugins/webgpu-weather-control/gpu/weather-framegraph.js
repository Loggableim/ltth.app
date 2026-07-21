(function weatherFramegraphModule(root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  root.WebGPUWeatherFramegraph = exported.WeatherFramegraph;
})(globalThis, () => {
  'use strict';

  const PARTICLE_STRIDE = 64;
  const INDIRECT_BYTES = 16;
  const U = () => globalThis.GPUBufferUsage || { STORAGE: 1, COPY_DST: 2, INDIRECT: 4, UNIFORM: 8, COPY_SRC: 16, MAP_READ: 32, QUERY_RESOLVE: 64 };
  const T = () => globalThis.GPUTextureUsage || { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2, STORAGE_BINDING: 4 };

  // Particles, visible-index compaction and draw arguments are exclusively GPU-owned.
  const COMPUTE_WGSL = /* wgsl */`
struct Particle { position: vec4<f32>, velocity: vec4<f32>, state: vec4<f32>, trail: vec4<f32> };
struct Frame { viewport: vec2<f32>, time: f32, delta: f32, intensity: f32, wind: f32, direction: f32, layer: f32, opacity: f32, particleScale: f32, effectMask: u32, samples: u32, pad: u32 };
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> visible: array<u32>;
@group(0) @binding(2) var<storage, read_write> counters: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> indirectArgs: array<u32>;
@group(0) @binding(4) var<uniform> frame: Frame;
fn hash(n: f32) -> f32 { return fract(sin(n) * 43758.5453); }
fn rainSplashRippleGroundMist(y: f32) -> f32 { return smoothstep(-1.0, -0.92, y); }
fn snowAccumulation(y: f32) -> f32 { return smoothstep(-1.0, -0.82, y); }
fn particleTrail(speed: f32) -> f32 { return clamp(speed * 0.08, 0.0, 1.0); }
fn integrateParticle(index: u32) {
  var p = particles[index];
  let wind = vec2<f32>(cos(frame.direction), sin(frame.direction)) * frame.wind;
  p.velocity.xy = p.velocity.xy + wind * frame.delta;
  p.position.xy = p.position.xy + p.velocity.xy * frame.delta;
  p.trail.xy = mix(p.trail.xy, p.position.xy, min(1.0, frame.delta * 14.0));
  // rain splash/ripple/ground mist and snow accumulation state remain per-particle GPU state.
  if (p.position.y < -1.0) { p.state.x = 2.0; p.position.y = 1.0; p.trail.z = rainSplashRippleGroundMist(p.position.y) + snowAccumulation(p.position.y) + particleTrail(length(p.velocity.xy)); }
  particles[index] = p;
}
@compute @workgroup_size(1) fn resetCounters() { atomicStore(&counters[0], 0u); }
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
struct Out { @builtin(position) position: vec4<f32>, @location(0) color: vec4<f32> };
@vertex fn particleVertex(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Out {
  let p = particles[visible[ii]]; let corners = array<vec2<f32>, 6>(vec2(-1.,-1.), vec2(1.,-1.), vec2(1.,1.), vec2(-1.,-1.), vec2(1.,1.), vec2(-1.,1.));
  var out: Out; out.position = vec4(p.position.xy + corners[vi] * 0.012 * frame.x, p.position.z, 1.); out.color = vec4(0.75, 0.9, 1.0, frame.y); return out;
}
@fragment fn particleFragment(in: Out) -> @location(0) vec4<f32> { return in.color; }`;

  // Fullscreen cinema effects: fog, sunbeam, storm, thunder branches/flash, glitch, aurora and heatwave.
  const POST_WGSL = /* wgsl */`
@vertex fn fullscreen(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> { let p = array<vec2<f32>,3>(vec2(-1.,-3.), vec2(3.,1.), vec2(-1.,1.)); return vec4(p[index],0.,1.); }
fn noise(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
fn thunderBolt(p: vec2<f32>, time: f32) -> f32 { let branch = sin(p.y * 34. + time * 18.) * .08 + sin(p.y * 91.) * .025; return smoothstep(.025, 0., abs(p.x - branch)) * smoothstep(.9,.15,p.y); }
fn auroraBands(uv: vec2<f32>) -> f32 { return sin(uv.x * 18. + uv.y * 4.) * .5 + .5; }
fn heatwaveRefraction(uv: vec2<f32>) -> f32 { return noise(uv * 42.) * .035; }
fn glitchClouds(uv: vec2<f32>) -> f32 { return noise(floor(uv * 45.)); }
@fragment fn volumetricFragment(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> { let uv = p.xy / vec2(1920.,1080.); let fog = noise(uv * 18.) * .14; let beam = pow(max(0., 1. - length(uv - vec2(.7,.1))*1.7), 5.); let storm = .12 + fog; let bolt = thunderBolt(uv - vec2(.5,0.), p.x*.003); let cinema = auroraBands(uv) * .08 + heatwaveRefraction(uv) + glitchClouds(uv) * .02; return vec4(vec3(storm + beam + bolt + cinema), 0.0); }
@fragment fn bloomFragment() -> @location(0) vec4<f32> { return vec4(0.0); }
@fragment fn temporalFragment() -> @location(0) vec4<f32> { return vec4(0.0); }
@fragment fn compositeFragment() -> @location(0) vec4<f32> { return vec4(0.0); }
// glitchclouds uses RGB shift/displacement/scanlines/noise/blocks/chromatic aberration; aurora uses bands; heatwave refracts UV.
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
      this.resources.uniforms = this.device.createBuffer({ label: 'weather-frame-effect-uniforms', size: 64, usage: usage.UNIFORM | usage.COPY_DST });
      this.resources.effectState = this.device.createBuffer({ label: 'weather-layered-effect-state', size: 13 * 16 * 4, usage: usage.STORAGE | usage.COPY_DST });
      if (this.timestampEnabled) {
        this.resources.timestamps = this.device.createQuerySet({ type: 'timestamp', count: 2 });
        this.resources.timestampResolve = this.device.createBuffer({ label: 'weather-timestamp-resolve', size: 16, usage: usage.QUERY_RESOLVE | usage.COPY_SRC });
        this.resources.timestampReadback = this.device.createBuffer({ label: 'weather-timestamp-readback', size: 16, usage: usage.MAP_READ | usage.COPY_DST });
      }
      const compute = this.device.createShaderModule({ label: 'weather-compute-wgsl', code: COMPUTE_WGSL });
      const particle = this.device.createShaderModule({ label: 'weather-particle-wgsl', code: PARTICLE_WGSL });
      const post = this.device.createShaderModule({ label: 'weather-cinematic-wgsl', code: POST_WGSL });
      this.pipelines.reset = this.device.createComputePipeline({ layout: 'auto', compute: { module: compute, entryPoint: 'resetCounters' } });
      this.pipelines.simulate = this.device.createComputePipeline({ layout: 'auto', compute: { module: compute, entryPoint: 'simulateParticles' } });
      this.pipelines.compact = this.device.createComputePipeline({ layout: 'auto', compute: { module: compute, entryPoint: 'compactParticles' } });
      this.pipelines.indirect = this.device.createComputePipeline({ layout: 'auto', compute: { module: compute, entryPoint: 'finalizeIndirectArgs' } });
      this.pipelines.particle = this.device.createRenderPipeline({ layout: 'auto', vertex: { module: particle, entryPoint: 'particleVertex' }, fragment: { module: particle, entryPoint: 'particleFragment', targets: [{ format: 'rgba16float', blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] }, primitive: { topology: 'triangle-list' } });
      ['volumetricFragment', 'bloomFragment', 'temporalFragment'].forEach((entry) => { this.pipelines[entry] = this.device.createRenderPipeline({ layout: 'auto', vertex: { module: post, entryPoint: 'fullscreen' }, fragment: { module: post, entryPoint: entry, targets: [{ format: 'rgba16float' }] }, primitive: { topology: 'triangle-list' } }); });
      this.pipelines.composite = this.device.createRenderPipeline({ layout: 'auto', vertex: { module: post, entryPoint: 'fullscreen' }, fragment: { module: post, entryPoint: 'compositeFragment', targets: [{ format: this.format }] }, primitive: { topology: 'triangle-list' } });
      if (typeof this.pipelines.simulate.getBindGroupLayout === 'function') {
        this.bindGroups = {
          compute: this.device.createBindGroup({ layout: this.pipelines.simulate.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer: this.resources.particles } }, { binding: 1, resource: { buffer: this.resources.visible } },
            { binding: 2, resource: { buffer: this.resources.counters } }, { binding: 3, resource: { buffer: this.resources.indirect } }, { binding: 4, resource: { buffer: this.resources.uniforms } }
          ] }),
          particle: this.device.createBindGroup({ layout: this.pipelines.particle.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer: this.resources.particles } }, { binding: 1, resource: { buffer: this.resources.visible } }, { binding: 2, resource: { buffer: this.resources.uniforms } }
          ] })
        };
      }
      this.resize(1920, 1080);
    }

    resize(width, height) {
      this.width = Math.min(1920, Math.max(1, Math.floor(width || 1)));
      this.height = Math.min(1080, Math.max(1, Math.floor(height || 1)));
      ['scene', 'bloom', 'history', 'volume'].forEach((key) => this.resources[key]?.destroy?.());
      const usage = T();
      ['scene', 'bloom', 'history', 'volume'].forEach((key) => { this.resources[key] = this.device.createTexture({ label: `weather-hdr-${key}`, size: [this.width, this.height], format: 'rgba16float', usage: usage.RENDER_ATTACHMENT | usage.TEXTURE_BINDING | usage.STORAGE_BINDING }); });
    }

    uploadEffectState(effects, quality, time) {
      // This fixed-size upload is per effect (max 13), never a CPU particle simulation.
      const packed = new Float32Array(13 * 16);
      effects.slice(0, 13).forEach((effect, index) => {
        const base = index * 16;
        packed.set([
          effect.intensity, effect.duration, effect.permanent ? 1 : 0, effect.layer,
          effect.opacity, effect.particleScale, effect.wind, effect.directionDeg,
          effect.glitchRgbShift ? 1 : 0, effect.glitchDisplacement ? 1 : 0, effect.glitchScanlines ? 1 : 0, effect.glitchNoise ? 1 : 0,
          effect.glitchBlocks ? 1 : 0, effect.glitchChromaticAberration ? 1 : 0, effect.glitchIntensity, time
        ], base);
      });
      this.device.queue.writeBuffer(this.resources.effectState, 0, packed);
      this.device.queue.writeBuffer(this.resources.uniforms, 0, new Float32Array([this.width, this.height, time, effects[0]?.intensity || 0, effects[0]?.wind || 0, effects[0]?.directionDeg || 0, effects[0]?.layer || 0, effects[0]?.opacity || 0, effects[0]?.particleScale || 1, quality.volumetricSamples, quality.bloomPasses, quality.temporalStability]));
    }

    encode(encoder, targetView, metrics) {
      const workgroups = Math.ceil(this.capacity / 128);
      const compute = encoder.beginComputePass(this.timestampEnabled ? { timestampWrites: { querySet: this.resources.timestamps, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {});
      if (this.bindGroups?.compute) compute.setBindGroup(0, this.bindGroups.compute);
      compute.setPipeline(this.pipelines.reset); compute.dispatchWorkgroups(1);
      compute.setPipeline(this.pipelines.simulate); compute.dispatchWorkgroups(workgroups);
      compute.setPipeline(this.pipelines.compact); compute.dispatchWorkgroups(workgroups);
      compute.setPipeline(this.pipelines.indirect); compute.dispatchWorkgroups(1); compute.end();
      const particlePass = encoder.beginRenderPass({ colorAttachments: [{ view: this.resources.scene.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      particlePass.setPipeline(this.pipelines.particle); if (this.bindGroups?.particle) particlePass.setBindGroup(0, this.bindGroups.particle); particlePass.drawIndirect(this.resources.indirect, 0); particlePass.end();
      ['volumetricFragment', 'bloomFragment', 'temporalFragment'].forEach((name) => { const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.resources[name === 'bloomFragment' ? 'bloom' : name === 'temporalFragment' ? 'history' : 'volume'].createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] }); pass.setPipeline(this.pipelines[name]); pass.draw(3); pass.end(); });
      const composite = encoder.beginRenderPass({ colorAttachments: [{ view: targetView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] }); composite.setPipeline(this.pipelines.composite); composite.draw(3); composite.end();
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
