(function registerHDRPostProcessor(root, factory) {
  const HDRPostProcessor = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = HDRPostProcessor;
  if (root) root.VisualFxHDRPostProcessor = HDRPostProcessor;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createHDRPostProcessor() {
  const POST_WGSL = String.raw`
struct PostUniforms { texel: vec2f, intensity: f32, threshold: f32 };
@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> post: PostUniforms;
@group(0) @binding(3) var bloomTexture: texture_2d<f32>;
struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> Out {
  let positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: Out;
  out.position = vec4f(positions[index], 0.0, 1.0);
  out.uv = positions[index] * 0.5 + 0.5;
  return out;
}
fn luminance(color: vec3f) -> f32 { return dot(color, vec3f(0.2126, 0.7152, 0.0722)); }
@fragment fn brightExtract(input: Out) -> @location(0) vec4f {
  let color = textureSample(sourceTexture, sourceSampler, input.uv);
  let contribution = smoothstep(post.threshold, post.threshold + 0.45, luminance(color.rgb));
  return vec4f(color.rgb * contribution, color.a * contribution);
}
@fragment fn kawaseBlur(input: Out) -> @location(0) vec4f {
  let offset = post.texel * (1.0 + post.intensity * 2.0);
  return (
    textureSample(sourceTexture, sourceSampler, input.uv + vec2f(offset.x, offset.y)) +
    textureSample(sourceTexture, sourceSampler, input.uv + vec2f(-offset.x, offset.y)) +
    textureSample(sourceTexture, sourceSampler, input.uv + vec2f(offset.x, -offset.y)) +
    textureSample(sourceTexture, sourceSampler, input.uv - offset)
  ) * 0.25;
}
@fragment fn composite(input: Out) -> @location(0) vec4f {
  let scene = textureSample(sourceTexture, sourceSampler, input.uv);
  let bloom = textureSample(bloomTexture, sourceSampler, input.uv);
  let premultiplied = vec4f(scene.rgb + bloom.rgb * post.intensity, max(scene.a, bloom.a));
  let safeAlpha = max(premultiplied.a, 0.00001);
  let straightColor = premultiplied.rgb / safeAlpha;
  let mapped = straightColor / (straightColor + vec3f(1.0));
  return vec4f(mapped * premultiplied.a, premultiplied.a);
}
`;

  class HDRPostProcessor {
    constructor(device, canvasFormat, resourceArena) {
      this.device = device;
      this.canvasFormat = canvasFormat;
      this.resources = resourceArena;
      this.size = { width: 0, height: 0 };
      this.sceneTexture = null;
      this.bloomTextures = [];
      this.bindGroups = {};
      this.sampler = this.resources.track(device.createSampler({ magFilter: 'linear', minFilter: 'linear' }));
      this.uniformBuffer = this.resources.createBuffer(
        'visual-fx-post-uniforms',
        16,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      );
      this._createPipelines();
    }

    _createPipelines() {
      const module = this.device.createShaderModule({ label: 'visual-fx-post-wgsl', code: POST_WGSL });
      const make = (entryPoint, format) => this.device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vertexMain' },
        fragment: {
          module,
          entryPoint,
          targets: [{
            format,
            blend: entryPoint === 'composite' ? {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
            } : undefined
          }]
        }
      });
      this.pipelines = {
        brightExtract: make('brightExtract', 'rgba16float'),
        kawaseBlur: make('kawaseBlur', 'rgba16float'),
        composite: make('composite', this.canvasFormat)
      };
    }

    resize(width, height, bloomLevels) {
      if (this.size.width === width && this.size.height === height && this.bloomTextures.length === bloomLevels) return;
      this.sceneTexture?.destroy?.();
      for (const texture of this.bloomTextures) texture.destroy?.();
      const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
      this.sceneTexture = this.device.createTexture({
        label: 'visual-fx-hdr-scene',
        size: [width, height, 1],
        format: 'rgba16float',
        usage
      });
      this.bloomTextures = [];
      for (let level = 0; level < bloomLevels; level += 1) {
        this.bloomTextures.push(this.device.createTexture({
          label: `visual-fx-bloom-${level}`,
          size: [Math.max(1, width >> (level + 1)), Math.max(1, height >> (level + 1)), 1],
          format: 'rgba16float',
          usage
        }));
      }
      this.size = { width, height };
      this._createBindGroups();
    }

    _createBindGroups() {
      const baseEntries = texture => [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.uniformBuffer } }
      ];
      this.bindGroups.bright = this.device.createBindGroup({
        layout: this.pipelines.brightExtract.getBindGroupLayout(0),
        entries: baseEntries(this.sceneTexture)
      });
      this.bindGroups.blur = this.bloomTextures.slice(0, -1).map(texture => this.device.createBindGroup({
        layout: this.pipelines.kawaseBlur.getBindGroupLayout(0),
        entries: baseEntries(texture)
      }));
      const bloomTexture = this.bloomTextures.at(-1) || this.sceneTexture;
      this.bindGroups.composite = this.device.createBindGroup({
        layout: this.pipelines.composite.getBindGroupLayout(0),
        entries: [
          ...baseEntries(this.sceneTexture),
          { binding: 3, resource: bloomTexture.createView() }
        ]
      });
    }

    get sceneView() {
      return this.sceneTexture.createView();
    }

    encode(encoder, outputView, config = {}) {
      const values = new Float32Array([
        1 / Math.max(1, this.size.width),
        1 / Math.max(1, this.size.height),
        Number(config.bloomIntensity) || 0.78,
        Number(config.bloomThreshold) || 0.58
      ]);
      this.device.queue.writeBuffer(this.uniformBuffer, 0, values);
      if (this.bloomTextures.length) {
        const bright = encoder.beginRenderPass({
          colorAttachments: [{ view: this.bloomTextures[0].createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]
        });
        bright.setPipeline(this.pipelines.brightExtract);
        bright.setBindGroup(0, this.bindGroups.bright);
        bright.draw(3);
        bright.end();

        for (let level = 1; level < this.bloomTextures.length; level += 1) {
          const blur = encoder.beginRenderPass({
            colorAttachments: [{ view: this.bloomTextures[level].createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]
          });
          blur.setPipeline(this.pipelines.kawaseBlur);
          blur.setBindGroup(0, this.bindGroups.blur[level - 1]);
          blur.draw(3);
          blur.end();
        }
      }
      const composite = encoder.beginRenderPass({
        colorAttachments: [{ view: outputView, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]
      });
      composite.setPipeline(this.pipelines.composite);
      composite.setBindGroup(0, this.bindGroups.composite);
      composite.draw(3);
      composite.end();
    }

    destroy() {
      this.sceneTexture?.destroy?.();
      for (const texture of this.bloomTextures) texture.destroy?.();
      this.bloomTextures = [];
    }
  }

  HDRPostProcessor.POST_WGSL = POST_WGSL;
  return HDRPostProcessor;
});
