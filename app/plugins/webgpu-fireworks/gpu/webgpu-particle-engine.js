/**
 * WebGPU-only particle engine for WebGPU Fireworks.
 *
 * The CPU submits compact spawn commands. Particle allocation, shape velocity
 * generation, physics, lifetime management, trail history, active compaction
 * and indirect draw counts are produced by WGSL compute passes.
 */
const SpawnCommandPolicy = typeof module !== 'undefined' && module.exports
    ? require('./spawn-command-policy')
    : globalThis.WebGPUFireworksSpawnCommandPolicy;
const V2_TRAIL = 1 << 0;
const V2_SPLIT_REQUESTED = 1 << 1;
const V2_STROBE = 1 << 3;
const V2_MARKER = 1 << 15;
const DEPTH_METADATA_MARKER = 1 << 3;
const DEPTH_BUCKET_COUNT = 3;
const V2_PRIMITIVE_IDS = Object.freeze({
    radial: 10,
    ring: 11,
    spiral: 12,
    palm: 13,
    crossette: 14,
    comet: 15,
    mine: 16
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
    'trans-flag': 26
});

function clampColorComponent(value) {
    const component = Number(value);
    if (!Number.isFinite(component)) return 0;
    return Math.max(0, Math.min(1, component));
}

function parseColor(color) {
    if (Array.isArray(color)) {
        if (color.length < 3) return [1, 1, 1, 1];
        return [
            clampColorComponent(color[0]),
            clampColorComponent(color[1]),
            clampColorComponent(color[2]),
            color.length > 3 ? clampColorComponent(color[3]) : 1
        ];
    }

    const value = String(color);
    const shortHex = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(value);
    if (shortHex) {
        return [
            parseInt(shortHex[1] + shortHex[1], 16) / 255,
            parseInt(shortHex[2] + shortHex[2], 16) / 255,
            parseInt(shortHex[3] + shortHex[3], 16) / 255,
            1
        ];
    }

    const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(value);
    if (hex) {
        return [
            parseInt(hex[1], 16) / 255,
            parseInt(hex[2], 16) / 255,
            parseInt(hex[3], 16) / 255,
            hex[4] ? parseInt(hex[4], 16) / 255 : 1
        ];
    }

    const hsl = /^hsl\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))%\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))%\s*\)$/i.exec(value);
    const hsla = /^hsla\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))%\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))%\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\)$/i.exec(value);
    const match = hsl || hsla;
    if (!match) return [1, 1, 1, 1];

    const hue = Number(match[1]);
    if (!Number.isFinite(hue)) return [1, 1, 1, 1];
    const h = ((hue % 360) + 360) % 360 / 360;
    const s = clampColorComponent(Number(match[2]) / 100);
    const l = clampColorComponent(Number(match[3]) / 100);
    const f = n => {
        const k = (n + h * 12) % 12;
        return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4), hsla ? clampColorComponent(match[4]) : 1];
}

class WebGPUParticleEngine {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.maxParticles = Math.max(256, Number(options.maxParticles) || 8192);
        this.maxSpawnCommands = 32;
        this.maxTrailSamples = 12;
        this.trailSamples = Math.max(2, Math.min(this.maxTrailSamples, Number(options.trailSamples) || 8));
        this.trailsEnabled = options.trailsEnabled !== false;
        this.glowEnabled = options.glowEnabled !== false;
        this.bloomEnabled = options.bloomEnabled !== false;
        this.bloomScale = Number(options.bloomScale) || 0.5;
        this.bloomLevels = 3;
        this.glowScale = 1;
        this.style = 'premium-hybrid';
        this.smokeScale = 0.45;
        this.turbulence = Number(options.turbulence) || 0.12;
        this.powerPreference = options.powerPreference || 'high-performance';
        this.onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};

        this.adapter = null;
        this.device = null;
        this.context = null;
        this.format = null;
        this.adapterInfo = null;
        this.initialized = false;
        this.destroyed = false;
        this.deviceRecoveryAttempted = false;
        this.spawnQueue = [];
        this.pendingDegradedLayerCounts = SpawnCommandPolicy.emptyDegradedLayerCounts();
        this.atlasSlots = new Map();
        this.atlasSources = new Map();
        this.nextAtlasSlot = 1; // Slot zero is the neutral paw sprite.
        this.atlasSize = 1024;
        this.atlasSlotSize = 128;
        this.atlasGutter = 6;
        this.atlasMipLevels = Math.floor(Math.log2(this.atlasSize)) + 1;
        this.atlasSlotsPerRow = this.atlasSize / this.atlasSlotSize;
        this.logicalWidth = canvas.width || 1920;
        this.logicalHeight = canvas.height || 1080;
        this.lastReadbackAt = 0;
        this.readbackPending = false;
        this.fixedStepSeconds = 1 / 60;
        this.simulationAccumulator = 0;
        this.simulationTimeSeconds = null;
        this.simulationStarted = false;
        this.metrics = {
            state: 'initializing',
            backend: 'webgpu',
            activeParticles: 0,
            droppedParticles: 0,
            gpuFrameMs: null,
            adapter: null,
            format: null,
            commandAdmission: {
                current: SpawnCommandPolicy.emptyCommandTelemetry(),
                cumulative: SpawnCommandPolicy.emptyCommandTelemetry()
            }
        };
    }

    async init() {
        this.destroyed = false;
        this._emitStatus('initializing');
        if (!globalThis.navigator || !navigator.gpu) {
            this._emitStatus('unsupported', { reason: 'navigator.gpu is unavailable' });
            return false;
        }

        try {
            this.adapter = await navigator.gpu.requestAdapter({ powerPreference: this.powerPreference });
            if (!this.adapter) throw new Error('No WebGPU adapter was returned');

            const optionalFeatures = [];
            if (this.adapter.features && this.adapter.features.has('timestamp-query')) {
                optionalFeatures.push('timestamp-query');
            }
            if (this.adapter.limits.maxStorageBuffersPerShaderStage < 9) {
                throw new Error('WebGPU adapter exposes fewer than 9 storage buffers per shader stage');
            }
            this.device = await this.adapter.requestDevice({
                requiredFeatures: optionalFeatures,
                requiredLimits: { maxStorageBuffersPerShaderStage: 9 }
            });
            this.timestampEnabled = optionalFeatures.includes('timestamp-query');
            this.format = navigator.gpu.getPreferredCanvasFormat();
            this.context = this.canvas.getContext('webgpu');
            if (!this.context) throw new Error('Unable to create a WebGPU canvas context');

            this.adapterInfo = await this._readAdapterInfo();
            this.context.configure({
                device: this.device,
                format: this.format,
                alphaMode: 'premultiplied'
            });

            this._createResources();
            await this._createPipelines();
            await this._initializeAtlas();
            this._watchDevice();
            this.initialized = true;
            this._emitStatus('ready', {
                adapter: this.adapterInfo,
                format: this.format,
                timestampQuery: optionalFeatures.includes('timestamp-query')
            });
            return true;
        } catch (error) {
            this.initialized = false;
            this._emitStatus('error', { reason: error && error.message ? error.message : String(error) });
            return false;
        }
    }

    async _readAdapterInfo() {
        try {
            if (this.adapter && typeof this.adapter.requestAdapterInfo === 'function') {
                const info = await this.adapter.requestAdapterInfo();
                return {
                    vendor: info.vendor || 'unknown',
                    architecture: info.architecture || 'unknown',
                    device: info.device || 'unknown',
                    description: info.description || 'WebGPU adapter'
                };
            }
        } catch (_) {}
        return { vendor: 'unknown', architecture: 'unknown', device: 'unknown', description: 'WebGPU adapter' };
    }

    _watchDevice() {
        if (!this.device) return;
        this.device.addEventListener?.('uncapturederror', event => {
            const message = event && event.error ? event.error.message : 'Uncaptured WebGPU validation error';
            this._emitStatus('error', { reason: message });
        });
        this.device.lost.then(info => this._handleDeviceLost(info));
    }

    async _handleDeviceLost(info) {
        if (this.destroyed) return;
        this.initialized = false;
        this._emitStatus('device-lost', { reason: info && info.message ? info.message : 'WebGPU device lost' });
        if (this.deviceRecoveryAttempted) return;
        this.deviceRecoveryAttempted = true;
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (this.destroyed) return;
        this._destroyResources();
        await this.init();
    }

    _emitStatus(state, extra = {}) {
        this.metrics = { ...this.metrics, state, backend: 'webgpu', ...extra };
        if ((state === 'initializing' || state === 'ready') && !Object.prototype.hasOwnProperty.call(extra, 'reason')) {
            delete this.metrics.reason;
        }
        this.onStatus({ ...this.metrics });
    }

    _createBuffer(label, size, usage, initialData = null) {
        const buffer = this.device.createBuffer({ label, size: Math.max(4, Math.ceil(size / 4) * 4), usage });
        if (initialData) this.device.queue.writeBuffer(buffer, 0, initialData);
        return buffer;
    }

    _createResources() {
        const U = globalThis.GPUBufferUsage;
        const T = globalThis.GPUTextureUsage;
        const particleStride = 96;
        const activeIndexBucketBytes = this.maxParticles * 4;
        const storageOffsetAlignment = Math.max(4, Number(this.device.limits?.minStorageBufferOffsetAlignment) || 256);
        this.activeIndexBucketStrideBytes = Math.ceil(activeIndexBucketBytes / storageOffsetAlignment) * storageOffsetAlignment;
        this.buffers = {
            particles: this._createBuffer('fireworks-particles', this.maxParticles * particleStride, U.STORAGE | U.COPY_DST | U.COPY_SRC),
            history: this._createBuffer('fireworks-trail-history', this.maxParticles * this.maxTrailSamples * 16, U.STORAGE | U.COPY_DST),
            activeIndices: this._createBuffer('fireworks-active-indices', this.activeIndexBucketStrideBytes * DEPTH_BUCKET_COUNT, U.STORAGE | U.COPY_SRC),
            secondaryIndices: this._createBuffer('fireworks-secondary-indices', this.maxParticles * 4, U.STORAGE),
            freeIndices: this._createBuffer('fireworks-free-indices', this.maxParticles * 4, U.STORAGE | U.COPY_DST),
            counters: this._createBuffer('fireworks-counters', 32, U.STORAGE | U.COPY_SRC | U.COPY_DST),
            commands: this._createBuffer('fireworks-spawn-commands', this.maxSpawnCommands * 112, U.STORAGE | U.COPY_DST),
            uniforms: this._createBuffer('fireworks-uniforms', 48, U.UNIFORM | U.COPY_DST),
            coreIndirect: this._createBuffer('fireworks-core-indirect', DEPTH_BUCKET_COUNT * 16, U.STORAGE | U.INDIRECT | U.COPY_DST | U.COPY_SRC),
            trailIndirect: this._createBuffer('fireworks-trail-indirect', DEPTH_BUCKET_COUNT * 16, U.STORAGE | U.INDIRECT | U.COPY_DST | U.COPY_SRC),
            readback: this._createBuffer('fireworks-counter-readback', 16, U.MAP_READ | U.COPY_DST)
        };
        if (this.timestampEnabled) {
            this.timestampQuerySet = this.device.createQuerySet({ type: 'timestamp', count: 2 });
            this.buffers.timestampResolve = this._createBuffer('fireworks-timestamp-resolve', 16, U.QUERY_RESOLVE | U.COPY_SRC);
            this.buffers.timestampReadback = this._createBuffer('fireworks-timestamp-readback', 16, U.MAP_READ | U.COPY_DST);
        }

        const freeIndices = new Uint32Array(this.maxParticles);
        for (let i = 0; i < this.maxParticles; i++) freeIndices[i] = i;
        this.device.queue.writeBuffer(this.buffers.freeIndices, 0, freeIndices);
        this.device.queue.writeBuffer(this.buffers.counters, 0, new Uint32Array([this.maxParticles, 0, 0, 0, 0, 0, 0, 0]));
        const coreIndirect = new Uint32Array(DEPTH_BUCKET_COUNT * 4);
        const trailIndirect = new Uint32Array(DEPTH_BUCKET_COUNT * 4);
        for (let bucket = 0; bucket < DEPTH_BUCKET_COUNT; bucket++) {
            coreIndirect[bucket * 4] = 6;
            trailIndirect[bucket * 4] = 6;
        }
        this.device.queue.writeBuffer(this.buffers.coreIndirect, 0, coreIndirect);
        this.device.queue.writeBuffer(this.buffers.trailIndirect, 0, trailIndirect);

        this.atlasTexture = this.device.createTexture({
            label: 'fireworks-atlas',
            size: [this.atlasSize, this.atlasSize, 1],
            mipLevelCount: this.atlasMipLevels,
            format: 'rgba8unorm',
            usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT
        });
        this.atlasSampler = this.device.createSampler({
            magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
            addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge'
        });
        this._createFrameTextures();
    }

    _createFrameTextures() {
        if (!this.device) return;
        const T = globalThis.GPUTextureUsage;
        for (const texture of [
            this.sceneTexture, this.bloomTextureA, this.bloomTextureB,
            this.bloomQuarterA, this.bloomQuarterB, this.bloomEighthA, this.bloomEighthB
        ]) texture?.destroy();
        const width = Math.max(1, this.canvas.width);
        const height = Math.max(1, this.canvas.height);
        const bloomWidth = Math.max(1, Math.floor(width * this.bloomScale));
        const bloomHeight = Math.max(1, Math.floor(height * this.bloomScale));
        const usage = T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC;
        this.sceneTexture = this.device.createTexture({ label: 'fireworks-hdr-scene', size: [width, height], format: 'rgba16float', usage });
        this.bloomTextureA = this.device.createTexture({ label: 'fireworks-bloom-a', size: [bloomWidth, bloomHeight], format: 'rgba16float', usage });
        this.bloomTextureB = this.device.createTexture({ label: 'fireworks-bloom-b', size: [bloomWidth, bloomHeight], format: 'rgba16float', usage });
        this.bloomQuarterA = this.device.createTexture({ label: 'fireworks-bloom-quarter-a', size: [Math.max(1, bloomWidth >> 1), Math.max(1, bloomHeight >> 1)], format: 'rgba16float', usage });
        this.bloomQuarterB = this.device.createTexture({ label: 'fireworks-bloom-quarter-b', size: [Math.max(1, bloomWidth >> 1), Math.max(1, bloomHeight >> 1)], format: 'rgba16float', usage });
        this.bloomEighthA = this.device.createTexture({ label: 'fireworks-bloom-eighth-a', size: [Math.max(1, bloomWidth >> 2), Math.max(1, bloomHeight >> 2)], format: 'rgba16float', usage });
        this.bloomEighthB = this.device.createTexture({ label: 'fireworks-bloom-eighth-b', size: [Math.max(1, bloomWidth >> 2), Math.max(1, bloomHeight >> 2)], format: 'rgba16float', usage });
        this.frameSize = { width, height, bloomWidth, bloomHeight };
        if (this.pipelines) this._createFrameBindGroups();
    }

    async _createPipelines() {
        const computeModule = this.device.createShaderModule({ label: 'fireworks-compute-wgsl', code: this._computeShader() });
        const particleModule = this.device.createShaderModule({ label: 'fireworks-particle-wgsl', code: this._particleShader() });
        const postModule = this.device.createShaderModule({ label: 'fireworks-post-wgsl', code: this._postShader() });
        await this._assertShader(computeModule, 'compute');
        await this._assertShader(particleModule, 'particle');
        await this._assertShader(postModule, 'post');

        const computeLayout = this.device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
        ]});
        const computePipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [computeLayout] });

        const renderLayout = this.device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
            { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
            { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
            { binding: 3, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
            { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
        ]});
        const renderPipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [renderLayout] });

        const premultipliedBlend = {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
        };
        const additiveBlend = {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
        };
        this.pipelines = {
            reset: await this.device.createComputePipelineAsync({ layout: computePipelineLayout, compute: { module: computeModule, entryPoint: 'resetCounters' } }),
            spawn: await this.device.createComputePipelineAsync({ layout: computePipelineLayout, compute: { module: computeModule, entryPoint: 'spawnParticles' } }),
            update: await this.device.createComputePipelineAsync({ layout: computePipelineLayout, compute: { module: computeModule, entryPoint: 'updateParticles' } }),
            secondary: await this.device.createComputePipelineAsync({ layout: computePipelineLayout, compute: { module: computeModule, entryPoint: 'spawnSecondary' } }),
            core: await this.device.createRenderPipelineAsync({
                layout: renderPipelineLayout,
                vertex: { module: particleModule, entryPoint: 'coreVertex' },
                fragment: { module: particleModule, entryPoint: 'particleFragment', targets: [{ format: 'rgba16float', blend: premultipliedBlend }] },
                primitive: { topology: 'triangle-list' }
            }),
            glow: await this.device.createRenderPipelineAsync({
                layout: renderPipelineLayout,
                vertex: { module: particleModule, entryPoint: 'coreVertex' },
                fragment: { module: particleModule, entryPoint: 'glowFragment', targets: [{ format: 'rgba16float', blend: additiveBlend }] },
                primitive: { topology: 'triangle-list' }
            }),
            trail: await this.device.createRenderPipelineAsync({
                layout: renderPipelineLayout,
                vertex: { module: particleModule, entryPoint: 'trailVertex' },
                fragment: { module: particleModule, entryPoint: 'trailFragment', targets: [{ format: 'rgba16float', blend: premultipliedBlend }] },
                primitive: { topology: 'triangle-list' }
            })
        };

        const postLayout = this.device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
            { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
        ]});
        this.postBindGroupLayout = postLayout;
        const postPipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [postLayout] });
        const makePost = (entryPoint, format, blend = undefined) => this.device.createRenderPipelineAsync({
            layout: postPipelineLayout,
            vertex: { module: postModule, entryPoint: 'fullscreenVertex' },
            fragment: { module: postModule, entryPoint, targets: [{ format, ...(blend ? { blend } : {}) }] },
            primitive: { topology: 'triangle-list' }
        });
        this.pipelines.extract = await makePost('brightExtract', 'rgba16float');
        this.pipelines.blur = await makePost('kawaseBlur', 'rgba16float');
        this.pipelines.bloomCopy = await makePost('bloomCopy', 'rgba16float');
        this.pipelines.bloomUpsample = await makePost('bloomUpsample', 'rgba16float', {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
        });
        this.pipelines.atlasMipmap = await makePost('atlasDownsample', 'rgba8unorm');
        this.pipelines.composite = await makePost('composite', this.format);

        this.computeBindGroup = this.device.createBindGroup({ layout: computeLayout, entries: [
            { binding: 0, resource: { buffer: this.buffers.particles } },
            { binding: 1, resource: { buffer: this.buffers.history } },
            { binding: 2, resource: { buffer: this.buffers.activeIndices } },
            { binding: 3, resource: { buffer: this.buffers.freeIndices } },
            { binding: 4, resource: { buffer: this.buffers.counters } },
            { binding: 5, resource: { buffer: this.buffers.commands } },
            { binding: 6, resource: { buffer: this.buffers.coreIndirect } },
            { binding: 7, resource: { buffer: this.buffers.trailIndirect } },
            { binding: 8, resource: { buffer: this.buffers.uniforms } },
            { binding: 9, resource: { buffer: this.buffers.secondaryIndices } }
        ]});
        const activeIndexBucketBytes = this.maxParticles * 4;
        this.renderBindGroups = Array.from({ length: DEPTH_BUCKET_COUNT }, (_, bucket) =>
            this.device.createBindGroup({ layout: renderLayout, entries: [
                { binding: 0, resource: { buffer: this.buffers.particles } },
                { binding: 1, resource: {
                    buffer: this.buffers.activeIndices,
                    offset: bucket * this.activeIndexBucketStrideBytes,
                    size: activeIndexBucketBytes
                } },
                { binding: 2, resource: { buffer: this.buffers.history } },
                { binding: 3, resource: { buffer: this.buffers.uniforms } },
                { binding: 4, resource: this.atlasTexture.createView() },
                { binding: 5, resource: this.atlasSampler }
            ]})
        );
        this._createFrameBindGroups(postLayout);
    }

    _createFrameBindGroups(layout = null) {
        if (!this.pipelines || !this.sceneTexture) return;
        const postLayout = layout || this.postBindGroupLayout;
        const make = (first, second) => this.device.createBindGroup({ layout: postLayout, entries: [
            { binding: 0, resource: first.createView() },
            { binding: 1, resource: second.createView() },
            { binding: 2, resource: this.atlasSampler },
            { binding: 3, resource: { buffer: this.buffers.uniforms } }
        ]});
        this.postBindGroups = {
            extract: make(this.sceneTexture, this.sceneTexture),
            blurA: make(this.bloomTextureA, this.sceneTexture),
            blurB: make(this.bloomTextureB, this.sceneTexture),
            halfToQuarter: make(this.bloomTextureA, this.sceneTexture),
            quarterBlur: make(this.bloomQuarterA, this.sceneTexture),
            quarterToEighth: make(this.bloomQuarterB, this.sceneTexture),
            eighthBlur: make(this.bloomEighthA, this.sceneTexture),
            quarterBase: make(this.bloomQuarterB, this.sceneTexture),
            eighthToQuarter: make(this.bloomEighthB, this.sceneTexture),
            halfBase: make(this.bloomTextureA, this.sceneTexture),
            quarterToHalf: make(this.bloomQuarterA, this.sceneTexture),
            quarterDirectToHalf: make(this.bloomQuarterB, this.sceneTexture),
            composite: make(this.sceneTexture, this.bloomTextureB)
        };
    }

    async _assertShader(module, label) {
        if (typeof module.getCompilationInfo !== 'function') return;
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter(message => message.type === 'error');
        if (errors.length) throw new Error(`${label} WGSL: ${errors.map(error => error.message).join('; ')}`);
    }

    async _initializeAtlas() {
        this.atlasSlots.clear();
        this.nextAtlasSlot = 1;
        const canvas = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(this.atlasSlotSize, this.atlasSlotSize)
            : Object.assign(document.createElement('canvas'), { width: this.atlasSlotSize, height: this.atlasSlotSize });
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, this.atlasSlotSize, this.atlasSlotSize);
        ctx.fillStyle = '#ffffff';
        const center = this.atlasSlotSize * 0.5;
        ctx.beginPath();
        ctx.ellipse(center, 82, 31, 27, 0, 0, Math.PI * 2);
        ctx.fill();
        for (const [x, y, r] of [[30, 44, 12], [51, 31, 12], [77, 31, 12], [98, 44, 12]]) {
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        this.device.queue.copyExternalImageToTexture({ source: canvas }, { texture: this.atlasTexture, origin: [0, 0] }, [this.atlasSlotSize, this.atlasSlotSize]);
        this.atlasSlots.set('shape:paw', 0);
        for (const [key, image] of this.atlasSources) this._writeAtlasImage(key, image);
        this._generateAtlasMipmaps();
    }

    async uploadImage(key, image) {
        if (!this.initialized || !key || !image) return 0;
        if (this.atlasSlots.has(key)) return this.atlasSlots.get(key) + 1;
        this.atlasSources.set(key, image);
        const result = this._writeAtlasImage(key, image);
        if (result) this._generateAtlasMipmaps();
        return result;
    }

    _writeAtlasImage(key, image) {
        const maxSlots = this.atlasSlotsPerRow * this.atlasSlotsPerRow;
        if (this.nextAtlasSlot >= maxSlots) {
            this._emitStatus('ready', { reason: 'Texture atlas full; image particle skipped' });
            return 0;
        }
        const slot = this.nextAtlasSlot++;
        const canvas = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(this.atlasSlotSize, this.atlasSlotSize)
            : Object.assign(document.createElement('canvas'), { width: this.atlasSlotSize, height: this.atlasSlotSize });
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, this.atlasSlotSize, this.atlasSlotSize);
        const sourceWidth = Math.max(1, image.naturalWidth || image.videoWidth || image.width || 1);
        const sourceHeight = Math.max(1, image.naturalHeight || image.videoHeight || image.height || 1);
        const contentSize = this.atlasSlotSize - this.atlasGutter * 2;
        const isAvatar = String(key).startsWith('avatar:');
        const scale = isAvatar
            ? Math.max(contentSize / sourceWidth, contentSize / sourceHeight)
            : Math.min(contentSize / sourceWidth, contentSize / sourceHeight);
        const width = sourceWidth * scale;
        const height = sourceHeight * scale;
        if (isAvatar) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(this.atlasGutter, this.atlasGutter, contentSize, contentSize);
            ctx.clip();
        }
        ctx.drawImage(image, (this.atlasSlotSize - width) * 0.5, (this.atlasSlotSize - height) * 0.5, width, height);
        if (isAvatar) ctx.restore();
        const x = (slot % this.atlasSlotsPerRow) * this.atlasSlotSize;
        const y = Math.floor(slot / this.atlasSlotsPerRow) * this.atlasSlotSize;
        this.device.queue.copyExternalImageToTexture({ source: canvas }, { texture: this.atlasTexture, origin: [x, y] }, [this.atlasSlotSize, this.atlasSlotSize]);
        this.atlasSlots.set(key, slot);
        return slot + 1;
    }

    _generateAtlasMipmaps() {
        if (!this.pipelines?.atlasMipmap || !this.postBindGroupLayout || !this.atlasTexture) return;
        const encoder = this.device.createCommandEncoder({ label: 'fireworks-atlas-mipmaps' });
        for (let level = 1; level < this.atlasMipLevels; level++) {
            const sourceView = this.atlasTexture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 });
            const targetView = this.atlasTexture.createView({ baseMipLevel: level, mipLevelCount: 1 });
            const bindGroup = this.device.createBindGroup({ layout: this.postBindGroupLayout, entries: [
                { binding: 0, resource: sourceView },
                { binding: 1, resource: sourceView },
                { binding: 2, resource: this.atlasSampler },
                { binding: 3, resource: { buffer: this.buffers.uniforms } }
            ]});
            const pass = encoder.beginRenderPass({ colorAttachments: [{
                view: targetView,
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: 'clear', storeOp: 'store'
            }]});
            pass.setPipeline(this.pipelines.atlasMipmap);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            pass.end();
        }
        this.device.queue.submit([encoder.finish()]);
    }

    spawnRocket(options = {}) {
        const style = this._styleId(options.style);
        const seed = this._resolveSeed(options);
        const effectId = this._hashValue(options.effectId ?? seed);
        const correlationId = options.correlationId ?? options.effectId ?? seed;
        const resolutionScale = Math.max(0.75, Math.min(1.75,
            Math.min(this.logicalWidth, this.logicalHeight) / 1080));
        const depthRocket = options.renderHints?.depthEnabled === true;
        const defaultRocketSize = depthRocket ? 22 : 32;
        const minimumRocketSize = depthRocket ? 18 : 28;
        const rocketSize = Math.max(minimumRocketSize,
            (Number(options.rocketSize) || defaultRocketSize) * resolutionScale);
        const headTextureIndex = Math.max(0, Number(options.headTextureIndex) || 0);
        const decalTextureIndex = headTextureIndex > 0 ? 0 : Math.max(0, Number(options.textureIndex) || 0);
        this._queueSpawn({
            ...options,
            priority: options.priority || 'core',
            required: options.required === true,
            kind: 1,
            count: 1,
            shape: 'rocket',
            textureIndex: headTextureIndex,
            size: rocketSize,
            seed,
            effectId,
            correlationId,
            flags: this._flags({ role: 1, style, rocketAvatarHead: headTextureIndex > 0 }),
            curve: options.curve || 0
        });
        this._queueSpawn({
            ...options,
            priority: 'accent',
            required: false,
            kind: 1,
            count: 1,
            shape: 'rocket',
            textureIndex: 0,
            size: rocketSize * 0.76,
            color: '#fff4d6',
            seed: seed ^ 0x9e3779b9,
            effectId,
            correlationId,
            flags: this._flags({ role: 2, style }),
            curve: options.curve || 0
        });
        if (decalTextureIndex > 0) {
            this._queueSpawn({
                ...options,
                priority: 'core',
                required: true,
                kind: 1,
                count: 1,
                shape: 'image',
                textureIndex: decalTextureIndex,
                size: Math.max(16, Number(options.size) || 18) * resolutionScale,
                color: '#ffffff',
                seed: seed ^ 0x85ebca6b,
                effectId,
                correlationId,
                flags: this._flags({ role: 6, style, nativeColor: true }) | 64,
                curve: options.curve || 0
            });
        }
    }

    spawnExplosion(options = {}) {
        const shape = this._shapeId(options.shape);
        const ranges = {
            0: [60, 220], 1: [36, 72], 2: [5, 9], 3: [30, 60],
            4: [32, 60], 5: [8, 14], 6: [1, 96], 7: [1, 220], 9: [1, 32]
        };
        const [minimum, maximum] = ranges[shape] || [1, 220];
        const requested = Math.max(1, Math.floor(Number(options.count) || 50));
        const count = Math.max(minimum, Math.min(requested, maximum));
        const palette = Array.isArray(options.colors) && options.colors.length ? options.colors : ['#ffffff'];
        const style = this._styleId(options.style);
        const seed = this._resolveSeed(options);
        const effectId = this._hashValue(options.effectId ?? seed);
        const correlationId = options.correlationId ?? options.effectId ?? seed;
        const requestedSize = Number(options.size) || 0;
        const shapeSize = shape >= 1 && shape <= 5
            ? Math.max(requestedSize, this._shapeSize(shape, style))
            : (requestedSize || this._shapeSize(shape, style));
        let remaining = count;
        let globalIndexBase = 0;
        const defaultEmissionSpread = shape === 5 ? 0.2 : shape >= 1 && shape <= 4 ? 0.1 : 0.055;
        for (let i = 0; i < palette.length && remaining > 0; i++) {
            const commandsLeft = palette.length - i;
            const slice = Math.ceil(remaining / commandsLeft);
            this._queueSpawn({
                ...options,
                priority: options.priority || 'core',
                required: options.required === true,
                kind: 2,
                count: slice,
                shape,
                size: shapeSize,
                color: palette[i],
                seed,
                effectId,
                correlationId,
                globalIndexBase,
                globalCount: count,
                emissionDelay: Number(options.emissionDelay) || 0,
                emissionSpread: Number.isFinite(options.emissionSpread) ? options.emissionSpread : defaultEmissionSpread,
                flags: this._flags({
                    role: shape === 0 ? 3 : shape === 6 ? 6 : 4,
                    style,
                    secondary: shape === 0 || shape === 5,
                    nativeColor: options.nativeColor === true
                })
            });
            remaining -= slice;
            globalIndexBase += slice;
        }

        if (shape === 0) {
            this._queueSpawn({
                ...options,
                priority: 'decorative',
                required: false,
                kind: 2,
                count: 1,
                shape: 0,
                intensity: 0.02,
                size: Math.max(30, shapeSize * 5),
                duration: 0.2,
                gravity: 0,
                drag: 1,
                color: '#ffffff',
                seed: seed ^ 0xc2b2ae35,
                effectId,
                correlationId,
                flags: this._flags({ role: 2, style })
            });
            this._queueSpawn({
                ...options,
                priority: 'accent',
                required: false,
                kind: 2,
                count: Math.max(8, Math.round(count * 0.12)),
                shape: 'sparkle',
                size: Math.max(4, shapeSize * 0.72),
                duration: Math.max(0.45, Number(options.duration) * 0.58),
                color: '#ffffff',
                seed: seed ^ 0x27d4eb2f,
                effectId,
                correlationId,
                emissionSpread: 0.09,
                flags: this._flags({ role: 5, style })
            });
        }

        const smokeCount = style === 1 ? 10 : style === 0 ? 5 : 0;
        if (smokeCount > 0 && this.smokeScale > 0.1 && shape === 0) {
            this._queueSpawn({
                ...options,
                priority: 'decorative',
                required: false,
                kind: 2,
                count: Math.max(2, Math.round(smokeCount * this.smokeScale)),
                shape: 9,
                size: 20 + style * 5,
                duration: Math.max(1.2, Number(options.duration) * 1.18),
                gravity: -8,
                drag: 0.992,
                color: '#7c84912c',
                seed: seed ^ 0x165667b1,
                effectId,
                correlationId,
                emissionSpread: 0.14,
                flags: this._flags({ role: 7, style })
            });
        }
    }

    spawnLayer(layer = {}, context = {}) {
        this._validateV2Layer(layer, context);
        const degradation = SpawnCommandPolicy.degradeLayerForPolicy(
            layer,
            context.degradationPolicy || { tier: 0 }
        );
        this._recordPendingDegradation(degradation.changes);
        if (!degradation.layer) return false;
        const effectiveLayer = degradation.layer;
        const shape = this._v2ShapeId(effectiveLayer);
        const packedColors = effectiveLayer.colors.map(color => this._packColor(color));
        const scale = this._v2ViewportScale();
        const style = context.materialProfile === 'premium-realistic'
            ? this._styleId('premium-realistic')
            : this._styleId(context.visualStyle || this.style);
        const splitQuality = context.splitQuality === undefined ? degradation.splitQuality : context.splitQuality;
        const materialRole = effectiveLayer.priority === 'decorative' ? 2 : effectiveLayer.priority === 'accent' ? 1 : 0;
        const renderHints = context.renderHints || {};
        const depthEnabled = renderHints.depthEnabled === true;
        const glyphScale = effectiveLayer.primitive === 'glyph' ? Number(renderHints.glyphScale) || 1 : 1;
        const particleSize = effectiveLayer.size * 6 * scale;
        const extentIntensity = effectiveLayer.primitive === 'glyph' && Number.isFinite(renderHints.glyphExtent)
            ? this._v2GlyphExtentIntensity(effectiveLayer, renderHints, particleSize)
            : null;
        const flags = V2_MARKER | (effectiveLayer.trail ? V2_TRAIL : 0) |
            (effectiveLayer.split ? V2_SPLIT_REQUESTED : 0) | (effectiveLayer.strobe ? V2_STROBE : 0) |
            ((splitQuality & 3) << 4) | ((materialRole & 15) << 8) | ((style & 3) << 12);

        return this._queueSpawn({
            lane: context.lane || 'show',
            priority: effectiveLayer.priority,
            required: context.required === undefined ? effectiveLayer.core === true : context.required === true,
            beatId: context.beatId ?? null,
            admissionBatchId: context.admissionBatchId ?? null,
            correlationId: context.correlationId ?? effectiveLayer.id,
            origin: context.origin || context.position || { x: 0, y: 0 },
            target: context.target || context.origin || context.position || { x: 0, y: 0 },
            kind: 2,
            count: effectiveLayer.density,
            shape,
            packedColors,
            colorCount: packedColors.length,
            flags,
            intensity: extentIntensity ?? ((context.powerScale ?? 1) * scale * glyphScale),
            particleDuration: effectiveLayer.lifetimeMs / 1000,
            size: particleSize,
            gravity: effectiveLayer.gravity * 105 * scale,
            drag: effectiveLayer.drag,
            secondary: false,
            seed: context.seed,
            effectId: context.effectId ?? effectiveLayer.id,
            globalCount: effectiveLayer.density,
            depthEnabled,
            launchDepth: depthEnabled ? Number(renderHints.launchDepth) : 0,
            burstDepth: depthEnabled ? Number(renderHints.burstDepth) : 0
        });
    }

    _recordPendingDegradation(changes = []) {
        for (const change of changes) {
            if (Object.prototype.hasOwnProperty.call(this.pendingDegradedLayerCounts, change)) {
                this.pendingDegradedLayerCounts[change]++;
            }
        }
    }

    _validateV2Layer(layer, context) {
        if (!layer || typeof layer !== 'object' || Array.isArray(layer) || this._v2ShapeId(layer) === null) {
            throw new TypeError('Unsupported ShowPlanV2 layer primitive or glyph.');
        }
        if (!Array.isArray(layer.colors) || layer.colors.length < 1 || layer.colors.length > 4) {
            throw new RangeError('ShowPlanV2 layers require between one and four colors.');
        }
        if (!Number.isInteger(layer.density) || layer.density < 1 || layer.density > this.maxParticles) {
            throw new RangeError(`ShowPlanV2 layer density must be an integer between 1 and ${this.maxParticles}.`);
        }
        if (!Number.isFinite(layer.size) || layer.size < 0.05 || layer.size > 10) {
            throw new RangeError('ShowPlanV2 layer size must be between 0.05 and 10.');
        }
        if (!Number.isInteger(layer.lifetimeMs) || layer.lifetimeMs < 1 || layer.lifetimeMs > 10000) {
            throw new RangeError('ShowPlanV2 layer lifetimeMs must be an integer between 1 and 10000.');
        }
        if (!Number.isFinite(layer.gravity) || layer.gravity < -10 || layer.gravity > 10) {
            throw new RangeError('ShowPlanV2 layer gravity must be between -10 and 10.');
        }
        if (!Number.isFinite(layer.drag) || layer.drag < 0 || layer.drag > 1) {
            throw new RangeError('ShowPlanV2 layer drag must be between 0 and 1.');
        }
        if (!Number.isInteger(layer.delayMs) || layer.delayMs < 0) {
            throw new RangeError('ShowPlanV2 layer delayMs must be a non-negative integer.');
        }
        for (const property of ['trail', 'split', 'strobe', 'core']) {
            if (typeof layer[property] !== 'boolean') throw new TypeError(`ShowPlanV2 layer ${property} must be boolean.`);
        }
        if (!['core', 'accent', 'decorative'].includes(layer.priority)) {
            throw new TypeError('ShowPlanV2 layer priority is unsupported.');
        }
        if (layer.priority === 'decorative' && layer.core) {
            throw new TypeError('Decorative ShowPlanV2 layers cannot be core.');
        }
        layer.colors.forEach(color => this._packColor(color));
        if (context.materialProfile !== undefined && !['classic', 'premium-realistic'].includes(context.materialProfile)) {
            throw new TypeError('ShowPlanV2 material profile is unsupported.');
        }
        if (context.visualStyle !== undefined && !['premium-hybrid', 'realistic', 'stylized-neon'].includes(context.visualStyle)) {
            throw new TypeError('ShowPlanV2 visual style is unsupported.');
        }
        if (context.splitQuality !== undefined && (!Number.isInteger(context.splitQuality)
            || context.splitQuality < 0 || context.splitQuality > 3)) {
            throw new RangeError('ShowPlanV2 splitQuality must be an integer between 0 and 3.');
        }
        if (context.powerScale !== undefined && (!Number.isFinite(context.powerScale) || context.powerScale <= 0)) {
            throw new RangeError('ShowPlanV2 powerScale must be positive.');
        }
        if (context.renderHints !== undefined) {
            const hints = context.renderHints;
            if (!hints || typeof hints !== 'object' || Array.isArray(hints) || typeof hints.depthEnabled !== 'boolean') {
                throw new TypeError('ShowPlanV2 renderHints must contain a boolean depthEnabled.');
            }
            for (const property of ['launchDepth', 'burstDepth']) {
                if (!Number.isFinite(hints[property]) || hints[property] < -1 || hints[property] > 1) {
                    throw new RangeError(`ShowPlanV2 renderHints ${property} must be between -1 and 1.`);
                }
            }
            if (!Number.isFinite(hints.glyphScale) || hints.glyphScale < 0.5 || hints.glyphScale > 2) {
                throw new RangeError('ShowPlanV2 renderHints glyphScale must be between 0.5 and 2.');
            }
            if (hints.glyphExtent !== undefined && (!Number.isFinite(hints.glyphExtent)
                || hints.glyphExtent <= 0 || hints.glyphExtent > 1)) {
                throw new RangeError('ShowPlanV2 renderHints glyphExtent must be greater than zero through one.');
            }
        }
        for (const point of [context.origin || context.position, context.target]) {
            if (point !== undefined && (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
                throw new TypeError('ShowPlanV2 layer context positions must contain finite x and y values.');
            }
        }
    }

    spawnCrackle(options = {}) {
        const style = this._styleId(options.style);
        const colors = Array.isArray(options.colors) && options.colors.length ? options.colors : ['#fff4b0'];
        const profile = options.profile === 'long' ? 'long' : options.profile === 'short' ? 'short' : null;
        const totalDuration = Math.max(0.25, Math.min(1.2, Number(options.duration) || (profile === 'long' ? 1 : 0.65)));
        const defaultPulses = profile === 'long' || (!profile && totalDuration >= 0.85) ? 6 : 4;
        const pulseCount = Math.max(2, Math.min(7, Math.round(Number(options.pulseCount) || defaultPulses)));
        const splitterCount = Math.max(2, Math.min(5, Math.round(2 + Math.max(0.1, Number(options.intensity) || 1))));
        const count = pulseCount * (splitterCount + 1);
        const pulseLife = Math.max(0.12, Math.min(0.24, totalDuration * 0.24));
        const seed = this._resolveSeed(options);
        const correlationId = options.correlationId ?? options.effectId ?? seed;
        this._queueSpawn({
            ...options,
            priority: options.priority || 'accent',
            required: false,
            kind: 2,
            count,
            globalCount: count,
            shape: 'sparkle',
            size: 3.8 + style * 0.45,
            duration: totalDuration,
            particleDuration: pulseLife,
            color: colors[0],
            seed,
            effectId: this._hashValue(options.effectId ?? seed),
            correlationId,
            emissionDelay: Math.max(0, Number(options.emissionDelay) || 0),
            emissionSpread: Math.max(0, totalDuration - pulseLife),
            secondary: false,
            pulseCount,
            flags: this._flags({ role: 8, style, pulseCount })
        });
        return totalDuration;
    }

    _shapeId(shape) {
        if (typeof shape === 'number') return shape;
        return { burst: 0, heart: 1, paws: 2, paw: 2, star: 3, ring: 4, spiral: 5, image: 6, sparkle: 7, rocket: 8, smoke: 9 }[shape] ?? 0;
    }

    _v2ShapeId(layer = {}) {
        if (layer.primitive === 'glyph') return V2_GLYPH_IDS[layer.glyph] ?? null;
        return V2_PRIMITIVE_IDS[layer.primitive] ?? null;
    }

    _styleId(style) {
        return { 'premium-hybrid': 0, realistic: 1, 'stylized-neon': 2, 'premium-realistic': 3 }[style] ?? 0;
    }

    _v2ViewportScale() {
        return Math.max(0.75, Math.min(1.75, Math.min(this.logicalWidth, this.logicalHeight) / 1080));
    }

    _v2GlyphExtentIntensity(layer, renderHints, particleSize) {
        const extentPixels = this.logicalWidth * renderHints.glyphExtent;
        const burstDepth = Math.max(-1, Math.min(1, Number(renderHints.burstDepth) || 0));
        const perspective = 4 / Math.max(2, 4 - burstDepth);
        const midpointSeconds = Number(layer.lifetimeMs) / 2000;
        const decay = Number(layer.drag) * 60;
        const displacement = decay > 1e-6
            ? (1 - Math.exp(-decay * midpointSeconds)) / decay
            : midpointSeconds;
        const particleDiameter = particleSize * perspective * 2;
        const velocityWidth = Math.max(1, extentPixels - particleDiameter);
        return velocityWidth / (1.8 * 218 * displacement * perspective);
    }

    _flags({ secondary = false, nativeColor = false, role = 0, style = 0, pulseCount = 0, rocketAvatarHead = false } = {}) {
        return (nativeColor ? 1 : 0) | (secondary ? 2 : 0) | ((pulseCount & 7) << 3) |
            ((role & 15) << 8) | ((style & 3) << 12) | (rocketAvatarHead ? (1 << 14) : 0);
    }

    _hashValue(value) {
        const text = String(value ?? '');
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    _resolveSeed(options = {}) {
        if (Number.isFinite(Number(options.seed))) return Number(options.seed) >>> 0;
        if (options.effectId !== undefined && options.effectId !== null) return this._hashValue(options.effectId);
        return Math.floor(Math.random() * 0xffffffff) >>> 0;
    }

    _shapeSize(shape, style) {
        const base = { 0: 6, 1: 19, 2: 46, 3: 21, 4: 18, 5: 35, 6: 18, 7: 5, 8: 8, 9: 24 }[shape] || 6;
        const styleScale = style === 2 ? 1.28 : style === 1 ? 0.92 : 1.08;
        const resolutionScale = Math.max(0.75, Math.min(1.75, this.logicalHeight / 1080));
        return base * styleScale * resolutionScale;
    }

    _queueSpawn(command) {
        if (!this.initialized) return false;
        const metadata = SpawnCommandPolicy.normalizeCommandMetadata(command);
        const managedQueue = metadata.admissionManaged || this.spawnQueue.some(item => item.admissionManaged);
        if (!managedQueue && this.spawnQueue.length >= this.maxSpawnCommands) return false;
        const seed = this._resolveSeed(command);
        const flags = command.flags || 0;
        const isV2 = (flags & V2_MARKER) !== 0;
        const renderHints = command.renderHints || {};
        const depthEnabled = command.depthEnabled === true || renderHints.depthEnabled === true;
        this.spawnQueue.push({
            origin: command.origin || { x: command.x || 0, y: command.y || 0 },
            target: command.target || command.origin || { x: command.x || 0, y: command.y || 0 },
            color: this._parseColor(command.color || '#ffffff'),
            count: Math.max(1, Math.floor(command.count || 1)),
            shape: this._shapeId(command.shape),
            kind: command.kind || 2,
            flags,
            intensity: Math.max(0.1, Number(command.intensity) || 1),
            duration: Math.max(0.05, Number(command.duration) || 1.2),
            particleDuration: isV2
                ? Number(command.particleDuration)
                : Math.max(0.05, Number(command.particleDuration) || Number(command.duration) || 1.2),
            textureIndex: Math.max(0, Number(command.textureIndex) || 0),
            seed,
            effectId: this._hashValue(command.effectId ?? seed),
            size: isV2 ? Number(command.size) : Math.max(1, Number(command.size) || 6),
            gravity: Number.isFinite(command.gravity) ? command.gravity : 90,
            drag: Number.isFinite(command.drag) ? command.drag : 0.985,
            secondary: command.secondary !== false ? 1 : 0,
            wind: Number.isFinite(command.wind) ? command.wind : 0,
            curve: Number.isFinite(command.curve) ? command.curve : 0,
            emissionDelay: Math.max(0, Number(command.emissionDelay) || 0),
            emissionSpread: Math.max(0, Number(command.emissionSpread) || 0),
            globalIndexBase: Math.max(0, Math.floor(Number(command.globalIndexBase) || 0)),
            globalCount: Math.max(1, Math.floor(Number(command.globalCount) || Number(command.count) || 1)),
            pulseCount: Math.max(0, Math.min(7, Math.floor(Number(command.pulseCount) || 0))),
            packedColors: isV2 ? [...command.packedColors] : null,
            colorCount: isV2 ? command.colorCount : 0,
            depthEnabled,
            launchDepth: depthEnabled ? Number(command.launchDepth ?? renderHints.launchDepth) : 0,
            burstDepth: depthEnabled ? Number(command.burstDepth ?? renderHints.burstDepth) : 0,
            username: command.username ?? null,
            userId: command.userId ?? null,
            uniqueId: command.uniqueId ?? null,
            giftId: command.giftId ?? null,
            giftName: command.giftName ?? null,
            giftImage: command.giftImage ?? null,
            coins: command.coins ?? null,
            value: command.value ?? null,
            combo: command.combo ?? null,
            bundleCount: command.bundleCount ?? null,
            giftBundleKey: command.giftBundleKey ?? null,
            ...metadata
        });
        return true;
    }

    _parseColor(color) {
        return parseColor(color);
    }

    _packColor(color) {
        const match = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(String(color));
        if (!match) throw new TypeError('ShowPlanV2 colors must use #RRGGBB or #RRGGBBAA.');
        const red = parseInt(match[1], 16);
        const green = parseInt(match[2], 16);
        const blue = parseInt(match[3], 16);
        const alpha = match[4] ? parseInt(match[4], 16) : 255;
        return (red | (green << 8) | (blue << 16) | (alpha << 24)) >>> 0;
    }

    _uploadSpawnCommands() {
        const queued = this.spawnQueue.splice(0);
        const managedShowCommands = queued.filter(command => (
            command.admissionManaged &&
            command.lane === 'show' &&
            command.admissionBatchId !== null
        ));
        let pending = queued;
        if (managedShowCommands.length > 0) {
            const earliestBatchId = managedShowCommands.reduce((earliest, command) => {
                const candidate = Number(command.admissionBatchId);
                const current = Number(earliest);
                return Number.isFinite(candidate) && Number.isFinite(current) && candidate < current
                    ? command.admissionBatchId
                    : earliest;
            }, managedShowCommands[0].admissionBatchId);
            const deferred = [];
            pending = queued.filter(command => {
                const isLaterShowBatch = command.admissionManaged &&
                    command.lane === 'show' &&
                    command.admissionBatchId !== null &&
                    command.admissionBatchId !== earliestBatchId;
                if (isLaterShowBatch) deferred.push(command);
                return !isLaterShowBatch;
            });
            this.spawnQueue.push(...deferred);
        }
        let admission;
        let admissionError = null;
        try {
            admission = SpawnCommandPolicy.admitSpawnCommands(pending, {
                maxCommands: this.maxSpawnCommands
            });
        } catch (error) {
            if (!error.admission) {
                this._recordCommandAdmission(error.telemetry || SpawnCommandPolicy.emptyCommandTelemetry());
                throw error;
            }
            admission = error.admission;
            admissionError = error;
        }
        this._recordCommandAdmission(admission.telemetry);
        const commands = admission.selected;
        if (!commands.length) {
            return admissionError
                ? { count: 0, maxParticles: 0, admissionError }
                : { count: 0, maxParticles: 0 };
        }
        const raw = new ArrayBuffer(commands.length * 112);
        const f32 = new Float32Array(raw);
        const u32 = new Uint32Array(raw);
        let maxParticles = 0;
        const quantizeDepth = value => Math.round((Math.max(-1, Math.min(1, value)) + 1) * 127.5 + 1e-7);
        commands.forEach((command, index) => {
            const base = index * 28;
            f32[base] = command.origin.x; f32[base + 1] = command.origin.y;
            f32[base + 2] = command.target.x; f32[base + 3] = command.target.y;
            if ((command.flags & V2_MARKER) !== 0) {
                for (let colorIndex = 0; colorIndex < 4; colorIndex++) {
                    u32[base + 4 + colorIndex] = command.packedColors[colorIndex] || 0;
                }
            } else {
                f32.set(command.color, base + 4);
            }
            u32[base + 8] = command.count; u32[base + 9] = command.shape;
            u32[base + 10] = command.kind; u32[base + 11] = command.flags;
            f32[base + 12] = command.intensity; f32[base + 13] = command.particleDuration;
            u32[base + 14] = command.textureIndex; u32[base + 15] = command.seed;
            f32[base + 16] = command.size; f32[base + 17] = command.gravity;
            f32[base + 18] = command.drag; u32[base + 19] = command.secondary;
            f32[base + 20] = command.wind; f32[base + 21] = command.curve;
            f32[base + 22] = command.emissionDelay; f32[base + 23] = command.emissionSpread;
            u32[base + 24] = command.globalIndexBase; u32[base + 25] = command.globalCount;
            u32[base + 26] = command.effectId;
            const lowBits = (command.flags & V2_MARKER) !== 0 ? command.colorCount : command.pulseCount;
            u32[base + 27] = command.depthEnabled
                ? (lowBits | DEPTH_METADATA_MARKER | (quantizeDepth(command.launchDepth) << 8) |
                    (quantizeDepth(command.burstDepth) << 16)) >>> 0
                : lowBits;
            maxParticles = Math.max(maxParticles, command.count);
        });
        this.device.queue.writeBuffer(this.buffers.commands, 0, raw);
        const spawn = { count: commands.length, maxParticles };
        if (admissionError) spawn.admissionError = admissionError;
        return spawn;
    }

    _recordCommandAdmission(current) {
        const previous = this.metrics.commandAdmission?.cumulative || SpawnCommandPolicy.emptyCommandTelemetry();
        const cumulative = SpawnCommandPolicy.emptyCommandTelemetry();
        const next = {
            ...current,
            degradedLayerCounts: { ...this.pendingDegradedLayerCounts }
        };
        this.pendingDegradedLayerCounts = SpawnCommandPolicy.emptyDegradedLayerCounts();
        for (const key of Object.keys(cumulative).filter(key => key !== 'degradedLayerCounts')) {
            cumulative[key] = Number(previous[key] || 0) + Number(current[key] || 0);
        }
        for (const key of SpawnCommandPolicy.DEGRADATION_KEYS) {
            cumulative.degradedLayerCounts[key] = Number(previous.degradedLayerCounts?.[key] || 0) +
                Number(next.degradedLayerCounts[key] || 0);
        }
        this.metrics.commandAdmission = { current: next, cumulative };
    }

    render(deltaSeconds, timeSeconds = performance.now() / 1000, options = {}) {
        if (!this.initialized || this.destroyed) return;
        if (timeSeconds && typeof timeSeconds === 'object') {
            options = timeSeconds;
            timeSeconds = performance.now() / 1000;
        }
        const frameDelta = Math.min(0.05, Math.max(0.001, deltaSeconds || this.fixedStepSeconds));
        this.simulationAccumulator = Math.min(
            this.fixedStepSeconds * 3,
            this.simulationAccumulator + frameDelta
        );
        const spawn = this._uploadSpawnCommands();
        let simulationSteps = Math.min(3, Math.floor((this.simulationAccumulator + 1e-7) / this.fixedStepSeconds));
        if (simulationSteps === 0 && (spawn.count || !this.simulationStarted)) simulationSteps = 1;
        if (!Number.isFinite(this.simulationTimeSeconds)) {
            this.simulationTimeSeconds = Number(timeSeconds) || performance.now() / 1000;
        }

        for (let step = 0; step < simulationSteps; step++) {
            const stepSpawn = step === 0 ? spawn : { count: 0, maxParticles: 0 };
            this.simulationTimeSeconds += this.fixedStepSeconds;
            const uniformRaw = new ArrayBuffer(48);
            const uf = new Float32Array(uniformRaw);
            const uu = new Uint32Array(uniformRaw);
            uf[0] = this.fixedStepSeconds;
            uf[1] = this.simulationTimeSeconds;
            uf[2] = this.logicalWidth;
            uf[3] = this.logicalHeight;
            uu[4] = this.trailSamples;
            uf[5] = this.turbulence;
            uu[6] = stepSpawn.count;
            uu[7] = this.maxTrailSamples;
            uf[8] = this.glowScale;
            uu[9] = this.bloomLevels;
            this.device.queue.writeBuffer(this.buffers.uniforms, 0, uniformRaw);

            const computeEncoder = this.device.createCommandEncoder({ label: 'fireworks-compute-frame' });
            const computeDescriptor = { label: 'fireworks-compute' };
            if (this.timestampEnabled && step === simulationSteps - 1) {
                computeDescriptor.timestampWrites = {
                    querySet: this.timestampQuerySet,
                    beginningOfPassWriteIndex: 0,
                    endOfPassWriteIndex: 1
                };
            }
            const pass = computeEncoder.beginComputePass(computeDescriptor);
            pass.setBindGroup(0, this.computeBindGroup);
            pass.setPipeline(this.pipelines.reset);
            pass.dispatchWorkgroups(1);
            if (stepSpawn.count) {
                pass.setPipeline(this.pipelines.spawn);
                pass.dispatchWorkgroups(Math.ceil(stepSpawn.maxParticles / 64), stepSpawn.count);
            }
            pass.setPipeline(this.pipelines.update);
            pass.dispatchWorkgroups(Math.ceil(this.maxParticles / 64));
            pass.setPipeline(this.pipelines.secondary);
            pass.dispatchWorkgroups(Math.ceil(this.maxParticles / 64));
            pass.end();
            this.device.queue.submit([computeEncoder.finish()]);
        }
        if (simulationSteps > 0) {
            this.simulationAccumulator = Math.max(0, this.simulationAccumulator - simulationSteps * this.fixedStepSeconds);
            this.simulationStarted = true;
        }

        if (spawn.admissionError) throw spawn.admissionError;

        // Simulation and queued spawns continue even when adaptive quality
        // skips an expensive presentation frame.
        if (options.present === false) return;

        // Keep compute and indirect rendering in ordered command buffers. This
        // makes the freshly compacted indirect arguments visible consistently
        // across Chromium/Dawn versions used by OBS browser sources.
        const encoder = this.device.createCommandEncoder({ label: 'fireworks-render-frame' });

        const scenePass = encoder.beginRenderPass({ colorAttachments: [{
            view: this.sceneTexture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store'
        }]});
        this._drawDepthBuckets(scenePass);
        scenePass.end();

        if (this.bloomEnabled) {
            const extract = encoder.beginRenderPass({ colorAttachments: [{ view: this.bloomTextureA.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
            extract.setPipeline(this.pipelines.extract); extract.setBindGroup(0, this.postBindGroups.extract); extract.draw(3); extract.end();
            const blurA = encoder.beginRenderPass({ colorAttachments: [{ view: this.bloomTextureB.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
            blurA.setPipeline(this.pipelines.blur); blurA.setBindGroup(0, this.postBindGroups.blurA); blurA.draw(3); blurA.end();
            const blurB = encoder.beginRenderPass({ colorAttachments: [{ view: this.bloomTextureA.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
            blurB.setPipeline(this.pipelines.blur); blurB.setBindGroup(0, this.postBindGroups.blurB); blurB.draw(3); blurB.end();
            if (this.bloomLevels >= 2) {
                const quarterA = encoder.beginRenderPass({ colorAttachments: [{ view: this.bloomQuarterA.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
                quarterA.setPipeline(this.pipelines.blur); quarterA.setBindGroup(0, this.postBindGroups.halfToQuarter); quarterA.draw(3); quarterA.end();
                const quarterB = encoder.beginRenderPass({ colorAttachments: [{ view: this.bloomQuarterB.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
                quarterB.setPipeline(this.pipelines.blur); quarterB.setBindGroup(0, this.postBindGroups.quarterBlur); quarterB.draw(3); quarterB.end();
            }
            if (this.bloomLevels >= 3) {
                const eighthA = encoder.beginRenderPass({ colorAttachments: [{ view: this.bloomEighthA.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
                eighthA.setPipeline(this.pipelines.blur); eighthA.setBindGroup(0, this.postBindGroups.quarterToEighth); eighthA.draw(3); eighthA.end();
                const eighthB = encoder.beginRenderPass({ colorAttachments: [{ view: this.bloomEighthB.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
                eighthB.setPipeline(this.pipelines.blur); eighthB.setBindGroup(0, this.postBindGroups.eighthBlur); eighthB.draw(3); eighthB.end();
                const upQuarter = encoder.beginRenderPass({ colorAttachments: [{ view: this.bloomQuarterA.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
                upQuarter.setPipeline(this.pipelines.bloomCopy); upQuarter.setBindGroup(0, this.postBindGroups.quarterBase); upQuarter.draw(3);
                upQuarter.setPipeline(this.pipelines.bloomUpsample); upQuarter.setBindGroup(0, this.postBindGroups.eighthToQuarter); upQuarter.draw(3); upQuarter.end();
            }
            const upHalf = encoder.beginRenderPass({ colorAttachments: [{ view: this.bloomTextureB.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
            upHalf.setPipeline(this.pipelines.bloomCopy); upHalf.setBindGroup(0, this.postBindGroups.halfBase); upHalf.draw(3);
            if (this.bloomLevels >= 2) {
                upHalf.setPipeline(this.pipelines.bloomUpsample);
                upHalf.setBindGroup(0, this.bloomLevels >= 3 ? this.postBindGroups.quarterToHalf : this.postBindGroups.quarterDirectToHalf);
                upHalf.draw(3);
            }
            upHalf.end();
        } else {
            const clearBloom = encoder.beginRenderPass({ colorAttachments: [{ view: this.bloomTextureB.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
            clearBloom.end();
        }

        const output = this.context.getCurrentTexture().createView();
        const composite = encoder.beginRenderPass({ colorAttachments: [{ view: output, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
        composite.setPipeline(this.pipelines.composite); composite.setBindGroup(0, this.postBindGroups.composite); composite.draw(3); composite.end();

        if (!this.readbackPending && performance.now() - this.lastReadbackAt > 1000) {
            encoder.copyBufferToBuffer(this.buffers.counters, 0, this.buffers.readback, 0, 16);
            if (this.timestampEnabled) {
                encoder.resolveQuerySet(this.timestampQuerySet, 0, 2, this.buffers.timestampResolve, 0);
                encoder.copyBufferToBuffer(this.buffers.timestampResolve, 0, this.buffers.timestampReadback, 0, 16);
            }
            this.readbackPending = true;
            this.lastReadbackAt = performance.now();
        }
        this.device.queue.submit([encoder.finish()]);
        if (this.readbackPending) this._consumeReadback();
    }

    _drawDepthBuckets(scenePass) {
        for (let bucket = 0; bucket < DEPTH_BUCKET_COUNT; bucket++) {
            const offset = bucket * 16;
            scenePass.setBindGroup(0, this.renderBindGroups[bucket]);
            if (this.trailsEnabled) {
                scenePass.setPipeline(this.pipelines.trail);
                scenePass.drawIndirect(this.buffers.trailIndirect, offset);
            }
            if (this.glowEnabled) {
                scenePass.setPipeline(this.pipelines.glow);
                scenePass.drawIndirect(this.buffers.coreIndirect, offset);
            }
            scenePass.setPipeline(this.pipelines.core);
            scenePass.drawIndirect(this.buffers.coreIndirect, offset);
        }
    }

    async _consumeReadback() {
        if (this.readbackPromise) return;
        let activeParticles = 0;
        let droppedParticles = 0;
        this.readbackPromise = this.buffers.readback.mapAsync(GPUMapMode.READ).then(() => {
            const values = new Uint32Array(this.buffers.readback.getMappedRange().slice(0));
            this.buffers.readback.unmap();
            activeParticles = values[1];
            droppedParticles = values[2];
            this.metrics.activeParticles = activeParticles;
            this.metrics.droppedParticles = droppedParticles;
            return this.timestampEnabled
                ? this.buffers.timestampReadback.mapAsync(GPUMapMode.READ).then(() => {
                    const timestamps = new BigUint64Array(this.buffers.timestampReadback.getMappedRange().slice(0));
                    this.buffers.timestampReadback.unmap();
                    const milliseconds = timestamps[1] > timestamps[0]
                        ? Number(timestamps[1] - timestamps[0]) / 1e6
                        : NaN;
                    this.metrics.gpuFrameMs = Number.isFinite(milliseconds) && milliseconds >= 0 && milliseconds <= 250
                        ? milliseconds
                        : null;
                })
                : null;
        }).then(() => {
            this.readbackPending = false;
            this._emitStatus('ready', {
                activeParticles, droppedParticles, gpuFrameMs: this.metrics.gpuFrameMs,
                adapter: this.adapterInfo, format: this.format
            });
        }).catch(error => {
            this.readbackPending = false;
            this._emitStatus('error', { reason: error.message });
        }).finally(() => { this.readbackPromise = null; });
    }

    resize(width, height) {
        const nextWidth = Math.max(1, Math.floor(width));
        const nextHeight = Math.max(1, Math.floor(height));
        if (this.canvas.width === nextWidth && this.canvas.height === nextHeight) return;
        this.canvas.width = nextWidth;
        this.canvas.height = nextHeight;
        if (this.context && this.device) this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });
        if (this.initialized) this._createFrameTextures();
    }

    setLogicalSize(width, height) {
        this.logicalWidth = Math.max(1, width);
        this.logicalHeight = Math.max(1, height);
    }

    setQuality(options = {}) {
        this.trailSamples = Math.max(2, Math.min(this.maxTrailSamples, Number(options.trailSamples) || this.trailSamples));
        this.trailsEnabled = options.trailsEnabled !== undefined ? options.trailsEnabled !== false : this.trailsEnabled;
        this.glowEnabled = options.glowEnabled !== undefined ? options.glowEnabled !== false : this.glowEnabled;
        this.turbulence = Number.isFinite(options.turbulence) ? options.turbulence : this.turbulence;
        this.bloomEnabled = options.bloomEnabled !== undefined ? options.bloomEnabled : this.bloomEnabled;
        this.style = ['premium-hybrid', 'realistic', 'stylized-neon'].includes(options.style) ? options.style : this.style;
        this.glowScale = Number.isFinite(options.glowScale) ? Math.max(0, Math.min(1.8, options.glowScale)) : this.glowScale;
        if (options.bloomEnabled === false && options.glowEnabled === undefined) this.glowEnabled = false;
        if (options.bloomEnabled === true && options.glowEnabled === undefined) this.glowEnabled = true;
        this.bloomLevels = !this.bloomEnabled ? 0 : this.trailSamples <= 3 ? 1 : this.trailSamples <= 5 ? 2 : 3;
        this.smokeScale = this.style === 'realistic' ? 1 : this.style === 'stylized-neon' ? 0.15 : 0.45;
    }

    getMetrics() {
        return {
            ...this.metrics,
            commandAdmission: {
                current: {
                    ...this.metrics.commandAdmission.current,
                    degradedLayerCounts: { ...this.metrics.commandAdmission.current.degradedLayerCounts }
                },
                cumulative: {
                    ...this.metrics.commandAdmission.cumulative,
                    degradedLayerCounts: { ...this.metrics.commandAdmission.cumulative.degradedLayerCounts }
                }
            }
        };
    }

    _destroyResources() {
        if (this.buffers) Object.values(this.buffers).forEach(buffer => buffer?.destroy?.());
        for (const texture of [
            this.atlasTexture, this.sceneTexture, this.bloomTextureA, this.bloomTextureB,
            this.bloomQuarterA, this.bloomQuarterB, this.bloomEighthA, this.bloomEighthB
        ]) texture?.destroy?.();
        this.buffers = null;
        this.pipelines = null;
    }

    destroy() {
        this.destroyed = true;
        this.initialized = false;
        this.spawnQueue.length = 0;
        this.pendingDegradedLayerCounts = SpawnCommandPolicy.emptyDegradedLayerCounts();
        this.metrics.commandAdmission = {
            current: SpawnCommandPolicy.emptyCommandTelemetry(),
            cumulative: SpawnCommandPolicy.emptyCommandTelemetry()
        };
        this._destroyResources();
        try { this.context?.unconfigure(); } catch (_) {}
        this.context = null;
        this.device = null;
        this.adapter = null;
    }

    _computeShader() {
        return `
struct Particle {
  position: vec3f, velocity: vec3f, color: vec4f,
  life: f32, maxLife: f32, size: f32, rotation: f32,
  angularVelocity: f32, gravity: f32, drag: f32, shape: u32,
  flags: u32, seed: u32, textureIndex: u32, alive: u32,
};
struct SpawnCommand {
  origin: vec2f, destination: vec2f, colorWords: vec4u,
  count: u32, shape: u32, kind: u32, flags: u32,
  intensity: f32, duration: f32, textureIndex: u32, seed: u32,
  size: f32, gravity: f32, drag: f32, secondary: u32,
  wind: f32, curve: f32, emissionDelay: f32, emissionSpread: f32,
  globalIndexBase: u32, globalCount: u32, effectId: u32, colorCount: u32,
};
struct Counters {
  freeCount: atomic<u32>, activeCount: atomic<u32>, droppedCount: atomic<u32>, secondaryCount: atomic<u32>,
  farCount: atomic<u32>, midCount: atomic<u32>, nearCount: atomic<u32>, pad0: atomic<u32>,
};
struct Uniforms {
  dt: f32, time: f32, width: f32, height: f32,
  trailSamples: u32, turbulence: f32, commandCount: u32, maxTrailSamples: u32,
  glowScale: f32, bloomLevels: u32, pad0: vec2u,
};
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> history: array<vec3f>;
@group(0) @binding(2) var<storage, read_write> activeIndices: array<u32>;
@group(0) @binding(3) var<storage, read_write> freeIndices: array<u32>;
@group(0) @binding(4) var<storage, read_write> counters: Counters;
@group(0) @binding(5) var<storage, read> commands: array<SpawnCommand>;
@group(0) @binding(6) var<storage, read_write> coreIndirect: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> trailIndirect: array<atomic<u32>>;
@group(0) @binding(8) var<uniform> uniforms: Uniforms;
@group(0) @binding(9) var<storage, read_write> secondaryIndices: array<u32>;

const V2_TRAIL = 1u;
const V2_SPLIT_REQUESTED = 2u;
const V2_SPLIT_EMITTED = 4u;
const V2_STROBE = 8u;
const V2_DEPTH = 16384u;
const V2_MARKER = 32768u;
const DEPTH_METADATA_MARKER = 8u;

fn hash(value: u32) -> f32 { var x = value; x = ((x >> 16u) ^ x) * 0x45d9f3bu; x = ((x >> 16u) ^ x) * 0x45d9f3bu; x = (x >> 16u) ^ x; return f32(x) / 4294967295.0; }
fn isV2(flags: u32) -> bool { return (flags & V2_MARKER) != 0u; }
fn unpackRgba8(packed: u32) -> vec4f {
  return vec4f(
    f32(packed & 255u)/255.0,
    f32((packed >> 8u) & 255u)/255.0,
    f32((packed >> 16u) & 255u)/255.0,
    f32((packed >> 24u) & 255u)/255.0
  );
}
fn commandColor(command: SpawnCommand, globalIndex: u32) -> vec4f {
  if (!isV2(command.flags)) { return bitcast<vec4f>(command.colorWords); }
  var colorIndex = globalIndex % min(command.colorCount & 7u, 4u);
  let glyphT = f32(globalIndex) / max(1.0, f32(command.globalCount));
  if (command.shape == 25u) {
    if (glyphT < 0.54) {
      colorIndex = 0u;
    } else if (glyphT < 0.72) {
      colorIndex = 1u;
    } else if (glyphT < 0.76) {
      colorIndex = 2u;
    } else if (glyphT < 0.86) {
      colorIndex = 1u;
    } else {
      colorIndex = 3u;
    }
  } else if (command.shape == 26u) {
    let band = min(4u, u32(floor(glyphT * 5.0)));
    colorIndex = select(select(0u, 1u, band == 1u || band == 3u), 2u, band == 2u);
  }
  return unpackRgba8(command.colorWords[colorIndex]);
}
fn depthEnabled(command: SpawnCommand) -> bool { return (command.colorCount & DEPTH_METADATA_MARKER) != 0u; }
fn unpackDepth(value: u32) -> f32 { return f32(value) / 127.5 - 1.0; }
fn launchDepth(command: SpawnCommand) -> f32 { return select(0.0, unpackDepth((command.colorCount >> 8u) & 255u), depthEnabled(command)); }
fn burstDepth(command: SpawnCommand) -> f32 { return select(0.0, unpackDepth((command.colorCount >> 16u) & 255u), depthEnabled(command)); }
fn allocateParticle() -> u32 {
  var result = 0xffffffffu;
  loop {
    let available = atomicLoad(&counters.freeCount);
    if (available == 0u) { atomicAdd(&counters.droppedCount, 1u); break; }
    let claim = atomicCompareExchangeWeak(&counters.freeCount, available, available - 1u);
    if (claim.exchanged) { result = freeIndices[available - 1u]; break; }
  }
  return result;
}
fn releaseParticle(index: u32) { let slot = atomicAdd(&counters.freeCount, 1u); freeIndices[slot] = index; }
fn glyphPoint(shape: u32, t: f32, seed: u32) -> vec2f {
  var point = vec2f(0.0);
  if (shape == 17u) {
    let section = min(4u, u32(floor(t * 5.0)));
    let angle = fract(t * 5.0) * 6.2831853;
    if (section == 0u) {
      point = vec2f(cos(angle) * 0.42, 0.24 + sin(angle) * 0.34);
    } else {
      let centers = array<vec2f, 4>(
        vec2f(-0.48, -0.28), vec2f(-0.17, -0.48),
        vec2f(0.17, -0.48), vec2f(0.48, -0.28)
      );
      point = centers[section - 1u] + vec2f(cos(angle) * 0.16, sin(angle) * 0.2);
    }
  } else if (shape == 18u) {
    let angle = t * 6.2831853;
    point = vec2f(
      16.0 * pow(sin(angle), 3.0) / 18.0,
      -(13.0*cos(angle)-5.0*cos(2.0*angle)-2.0*cos(3.0*angle)-cos(4.0*angle)) / 18.0
    );
  } else if (shape == 19u) {
    let edge = t * 10.0;
    let vertex = u32(floor(edge)) % 10u;
    let local = fract(edge);
    let angle0 = -1.5707963 + f32(vertex) * 0.6283185;
    let angle1 = -1.5707963 + f32((vertex + 1u) % 10u) * 0.6283185;
    let radius0 = select(0.42, 0.94, vertex % 2u == 0u);
    let radius1 = select(0.42, 0.94, (vertex + 1u) % 2u == 0u);
    point = mix(vec2f(cos(angle0), sin(angle0))*radius0, vec2f(cos(angle1), sin(angle1))*radius1, local);
  } else if (shape == 20u) {
    let points = array<vec2f, 9>(
      vec2f(-0.82,0.46), vec2f(-0.67,-0.72), vec2f(-0.28,-0.4),
      vec2f(0.0,-0.68), vec2f(0.28,-0.4), vec2f(0.67,-0.72),
      vec2f(0.82,0.46), vec2f(0.38,0.78), vec2f(-0.38,0.78)
    );
    let edge = t * 9.0; let index = u32(floor(edge)) % 9u;
    point = mix(points[index], points[(index + 1u) % 9u], fract(edge));
  } else if (shape == 21u) {
    let points = array<vec2f, 10>(
      vec2f(-0.78,0.58), vec2f(-0.62,-0.82), vec2f(-0.24,-0.48),
      vec2f(0.0,-0.78), vec2f(0.24,-0.48), vec2f(0.62,-0.82),
      vec2f(0.78,0.58), vec2f(0.42,0.82), vec2f(0.0,0.68), vec2f(-0.42,0.82)
    );
    let edge = t * 10.0; let index = u32(floor(edge)) % 10u;
    point = mix(points[index], points[(index + 1u) % 10u], fract(edge));
  } else if (shape == 22u) {
    let points = array<vec2f, 12>(
      vec2f(-0.9,0.42), vec2f(-0.66,0.02), vec2f(-0.8,-0.38),
      vec2f(-0.34,-0.2), vec2f(-0.08,-0.68), vec2f(0.12,-0.18),
      vec2f(0.62,-0.48), vec2f(0.48,-0.02), vec2f(0.9,0.18),
      vec2f(0.38,0.38), vec2f(0.04,0.76), vec2f(-0.36,0.34)
    );
    let edge = t * 12.0; let index = u32(floor(edge)) % 12u;
    point = mix(points[index], points[(index + 1u) % 12u], fract(edge));
  } else if (shape == 23u) {
    let points = array<vec2f, 9>(
      vec2f(-0.88,0.5), vec2f(-0.42,-0.7), vec2f(-0.12,-0.18),
      vec2f(0.24,-0.88), vec2f(0.3,-0.16), vec2f(0.84,-0.5),
      vec2f(0.48,0.22), vec2f(0.9,0.62), vec2f(0.0,0.46)
    );
    let edge = t * 9.0; let index = u32(floor(edge)) % 9u;
    point = mix(points[index], points[(index + 1u) % 9u], fract(edge));
  } else if (shape == 24u) {
    let x = -0.9 + t * 1.8;
    let envelope = 1.0 - 0.42 * t;
    point = vec2f(x, sin(t * 8.6) * 0.58 * envelope + (t - 0.5) * 0.28);
  }
  point *= 0.992 + hash(seed + u32(t * 65535.0)) * 0.016;
  return clamp(point, vec2f(-1.0), vec2f(1.0));
}
fn boykisserPoint(index: u32, count: u32, seed: u32) -> vec2f {
  let t = f32(index) / max(1.0, f32(count));
  let detailed = count >= 96u;
  var point = vec2f(0.0);
  if (t < 0.46) {
    let local = t / 0.46;
    if (detailed) {
      let detailedOutline = array<vec2f, 22>(
        vec2f(-0.15,-0.5), vec2f(-0.5,-0.67), vec2f(-0.65,-0.84),
        vec2f(-0.78,-0.55), vec2f(-0.82,-0.22), vec2f(-0.9,-0.12),
        vec2f(-0.76,0.03), vec2f(-0.88,0.15), vec2f(-0.6,0.2),
        vec2f(-0.5,0.52), vec2f(-0.42,0.82), vec2f(0.0,0.74),
        vec2f(0.42,0.82), vec2f(0.5,0.52), vec2f(0.6,0.2),
        vec2f(0.88,0.15), vec2f(0.76,0.03), vec2f(0.9,-0.12),
        vec2f(0.82,-0.22), vec2f(0.78,-0.55), vec2f(0.65,-0.84),
        vec2f(0.5,-0.67)
      );
      let edge = local * 22.0;
      let segment = u32(floor(edge)) % 22u;
      point = mix(detailedOutline[segment], detailedOutline[(segment + 1u) % 22u], fract(edge));
    } else {
      let simplifiedOutline = array<vec2f, 14>(
        vec2f(-0.15,-0.5), vec2f(-0.58,-0.7), vec2f(-0.66,-0.82),
        vec2f(-0.8,-0.2), vec2f(-0.9,-0.1), vec2f(-0.72,0.12),
        vec2f(-0.45,0.8), vec2f(0.0,0.72), vec2f(0.45,0.8),
        vec2f(0.72,0.12), vec2f(0.9,-0.1), vec2f(0.8,-0.2),
        vec2f(0.66,-0.82), vec2f(0.58,-0.7)
      );
      let edge = local * 14.0;
      let segment = u32(floor(edge)) % 14u;
      point = mix(simplifiedOutline[segment], simplifiedOutline[(segment + 1u) % 14u], fract(edge));
    }
  } else if (t < 0.54) {
    let local = (t - 0.46) / 0.08;
    if (detailed) {
      let detailedForelock = array<vec2f, 6>(
        vec2f(-0.27,-0.43), vec2f(-0.1,-0.62), vec2f(-0.14,-0.39),
        vec2f(0.12,-0.46), vec2f(0.06,-0.3), vec2f(0.3,-0.34)
      );
      let edge = local * 5.0;
      let segment = min(4u, u32(floor(edge)));
      point = mix(detailedForelock[segment], detailedForelock[segment + 1u], fract(edge));
    } else {
      let simplifiedForelock = array<vec2f, 4>(
        vec2f(-0.23,-0.43), vec2f(-0.08,-0.57),
        vec2f(-0.12,-0.35), vec2f(0.25,-0.35)
      );
      let edge = local * 3.0;
      let segment = min(2u, u32(floor(edge)));
      point = mix(simplifiedForelock[segment], simplifiedForelock[segment + 1u], fract(edge));
    }
  } else if (t < 0.72) {
    let local = (t - 0.54) / 0.18;
    let eye = min(1u, u32(floor(local * 2.0)));
    let eyeLocal = fract(local * 2.0);
    let side = select(-1.0, 1.0, eye == 1u);
    let eyeCenter = vec2f(side * 0.29, 0.0);
    if (eyeLocal < 0.35) {
      let eyeLid = mix(vec2f(-0.15,-0.12), vec2f(0.15,-0.12), eyeLocal / 0.35);
      point = eyeCenter + eyeLid;
    } else {
      let eyeArc = ((eyeLocal - 0.35) / 0.65) * 3.1415926;
      let arcScale = select(vec2f(0.13,0.08), vec2f(0.15,0.1), detailed);
      point = eyeCenter + vec2f(cos(eyeArc), sin(eyeArc)) * arcScale + vec2f(0.0,-0.12);
    }
  } else if (t < 0.76) {
    let local = (t - 0.72) / 0.04;
    let nose = array<vec2f, 4>(
      vec2f(-0.035,0.015), vec2f(0.0,0.055),
      vec2f(0.035,0.015), vec2f(0.0,0.075)
    );
    let edge = local * 3.0;
    let segment = min(2u, u32(floor(edge)));
    point = mix(nose[segment], nose[segment + 1u], fract(edge));
  } else if (t < 0.86) {
    let local = (t - 0.76) / 0.1;
    let mouth = array<vec2f, 5>(
      vec2f(-0.24,0.18), vec2f(-0.08,0.29), vec2f(0.0,0.18),
      vec2f(0.08,0.29), vec2f(0.24,0.18)
    );
    let edge = local * 4.0;
    let segment = min(3u, u32(floor(edge)));
    point = mix(mouth[segment], mouth[segment + 1u], fract(edge));
  } else {
    let local = (t - 0.86) / 0.14;
    let cheek = min(1u, u32(floor(local * 2.0)));
    let cheekLocal = fract(local * 2.0);
    let side = select(-1.0, 1.0, cheek == 1u);
    let cheekCenter = vec2f(side * 0.5, 0.18);
    let cheekLine = array<vec2f, 4>(
      vec2f(-0.11,0.02), vec2f(-0.035,-0.045),
      vec2f(0.035,0.045), vec2f(0.11,-0.02)
    );
    let edge = cheekLocal * 3.0;
    let segment = min(2u, u32(floor(edge)));
    point = cheekCenter + mix(cheekLine[segment], cheekLine[segment + 1u], fract(edge));
  }
  point *= 0.994 + hash(seed + index * 71u) * 0.012;
  return clamp(point, vec2f(-1.0), vec2f(1.0));
}
fn transFlagPoint(t: f32) -> vec2f {
  let band = min(4u, u32(floor(t * 5.0)));
  let local = fract(t * 5.0);
  let x = -0.9 + local * 1.8;
  let bandY = (f32(band) - 2.0) * 0.22;
  let wave = sin(local * 6.2831853 + f32(band) * 0.34) * 0.08;
  return clamp(vec2f(x, bandY + wave), vec2f(-1.0), vec2f(1.0));
}
fn shapeVelocity2(shape: u32, index: u32, count: u32, intensity: f32, seed: u32) -> vec2f {
  let t = f32(index) / max(1.0, f32(count));
  let jitter = (hash(seed + index * 17u) - 0.5) * 0.16;
  if (shape == 10u) {
    let angle = t * 6.2831853 + jitter;
    let speed = 175.0 + hash(seed + index * 23u) * 105.0;
    return vec2f(cos(angle), sin(angle)) * speed * intensity;
  }
  if (shape == 11u) {
    let angle = t * 6.2831853 + jitter * 0.18;
    return vec2f(cos(angle), sin(angle)) * 228.0 * intensity;
  }
  if (shape == 12u) {
    let angle = t * 15.707963 + f32(index % 2u) * 3.1415926;
    let radial = vec2f(cos(angle), sin(angle)) * (72.0 + t * 170.0);
    let tangent = vec2f(-sin(angle), cos(angle)) * 92.0;
    return (radial + tangent) * intensity;
  }
  if (shape == 13u) {
    let frond = f32(index % 7u) - 3.0;
    let angle = -1.5707963 + frond * 0.235 + jitter * 0.3;
    let speed = 172.0 + hash(seed + index * 31u) * 98.0;
    return vec2f(cos(angle) * speed, sin(angle) * speed * 1.08) * intensity;
  }
  if (shape == 14u) {
    let arm = index % 4u;
    let angle = f32(arm) * 1.5707963 + jitter * 0.34;
    let speed = 152.0 + hash(seed + index * 37u) * 76.0;
    return vec2f(cos(angle), sin(angle)) * speed * intensity;
  }
  if (shape == 15u) {
    let angle = -1.5707963 + (t - 0.5) * 0.52 + jitter * 0.18;
    let speed = 142.0 + hash(seed + index * 41u) * 82.0;
    return vec2f(cos(angle), sin(angle)) * speed * intensity;
  }
  if (shape == 16u) {
    let angle = -2.72 + t * 2.3 + jitter * 0.25;
    let speed = 205.0 + hash(seed + index * 43u) * 92.0;
    return vec2f(cos(angle), sin(angle)) * speed * intensity;
  }
  if (shape >= 17u && shape <= 26u) {
    if (shape == 25u) { return boykisserPoint(index, count, seed) * 218.0 * intensity; }
    if (shape == 26u) { return transFlagPoint(t) * 218.0 * intensity; }
    return glyphPoint(shape, t, seed) * 218.0 * intensity;
  }
  if (shape == 1u) {
    let a = t * 6.2831853;
    let x = 16.0 * pow(sin(a), 3.0);
    let y = -(13.0*cos(a)-5.0*cos(2.0*a)-2.0*cos(3.0*a)-cos(4.0*a));
    let layer = select(0.72, 1.0, index % 2u == 0u);
    return vec2f(x, y) * 9.4 * intensity * layer;
  }
  if (shape == 2u) {
    let angle = t * 6.2831853 + jitter;
    return vec2f(cos(angle), sin(angle)) * (145.0 + hash(seed+index)*75.0) * intensity;
  }
  if (shape == 3u) {
    let edge = t * 10.0;
    let vertex = u32(floor(edge)) % 10u;
    let local = fract(edge);
    let a0 = -1.5707963 + f32(vertex) * 0.6283185;
    let a1 = -1.5707963 + f32((vertex + 1u) % 10u) * 0.6283185;
    let r0 = select(0.42, 1.0, vertex % 2u == 0u);
    let r1 = select(0.42, 1.0, (vertex + 1u) % 2u == 0u);
    let point = mix(vec2f(cos(a0), sin(a0))*r0, vec2f(cos(a1), sin(a1))*r1, local);
    return point * 235.0 * intensity;
  }
  if (shape == 4u) {
    let angle = t * 6.2831853 + jitter;
    let layer = 0.72 + f32(index % 3u) * 0.14;
    return vec2f(cos(angle), sin(angle)) * 225.0 * layer * intensity;
  }
  if (shape == 5u) {
    let angle = t * 14.137167 + f32(index % 2u) * 3.1415926;
    let radial = vec2f(cos(angle), sin(angle)) * (65.0 + t * 180.0);
    let tangent = vec2f(-sin(angle), cos(angle)) * 82.0;
    return (radial + tangent) * intensity;
  }
  if (shape == 9u) {
    let angle = t * 6.2831853 + jitter;
    return vec2f(cos(angle)*34.0, -28.0-abs(sin(angle))*32.0) * intensity;
  }
  let angle = t * 6.2831853 + jitter;
  let ring = 0.62 + f32(index % 3u) * 0.22;
  return vec2f(cos(angle), sin(angle)) * (160.0 + hash(seed+index)*170.0) * ring * intensity;
}
fn shapeVelocity(shape: u32, index: u32, count: u32, intensity: f32, seed: u32, depthEnabled: bool) -> vec3f {
  let planar = shapeVelocity2(shape, index, count, intensity, seed);
  let volumetric = depthEnabled && shape != 11u && (shape < 17u || shape > 24u)
    && (shape < 17u || shape > 26u);
  let depthVelocity = (hash(seed + index * 59u + 0x9e3779b9u) - 0.5) * 1.8 * intensity;
  return vec3f(planar, select(0.0, depthVelocity, volumetric));
}
fn depthBucket(z: f32) -> u32 {
  if (z < -0.3333333) { return 0u; }
  if (z > 0.3333333) { return 2u; }
  return 1u;
}
@compute @workgroup_size(1) fn resetCounters() {
  atomicStore(&counters.activeCount, 0u); atomicStore(&counters.secondaryCount, 0u);
  atomicStore(&counters.farCount, 0u); atomicStore(&counters.midCount, 0u); atomicStore(&counters.nearCount, 0u);
  for (var bucket = 0u; bucket < 3u; bucket++) {
    let offset = bucket * 4u;
    atomicStore(&coreIndirect[offset], 6u); atomicStore(&coreIndirect[offset + 1u], 0u); atomicStore(&coreIndirect[offset + 2u], 0u);
    atomicStore(&coreIndirect[offset + 3u], 0u);
    atomicStore(&trailIndirect[offset], 6u); atomicStore(&trailIndirect[offset + 1u], 0u); atomicStore(&trailIndirect[offset + 2u], 0u);
    atomicStore(&trailIndirect[offset + 3u], 0u);
  }
}
@compute @workgroup_size(64) fn spawnParticles(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.y >= uniforms.commandCount) { return; }
  let command = commands[gid.y]; if (gid.x >= command.count) { return; }
  let slot = allocateParticle(); if (slot == 0xffffffffu) { return; }
  let globalIndex = command.globalIndexBase + gid.x;
  let globalCount = max(1u, command.globalCount);
  let commandDepthEnabled = depthEnabled(command);
  var p: Particle; p.position = vec3f(command.origin, burstDepth(command)); p.color = commandColor(command, globalIndex); p.life = -command.emissionDelay; p.maxLife = command.duration;
  p.rotation = hash(command.seed + globalIndex * 13u) * 6.2831853; p.angularVelocity = (hash(command.seed + globalIndex * 29u)-0.5)*4.0;
  p.gravity = command.gravity; p.drag = command.drag; p.shape = command.shape;
  p.flags = command.flags | ((globalIndex & 0xffffu) << 16u) | select(0u, V2_DEPTH, commandDepthEnabled); p.seed = command.seed ^ command.effectId ^ globalIndex;
  p.textureIndex = command.textureIndex; p.alive = 1u; p.size = command.size;
  if (command.kind == 1u) {
    p.position = vec3f(command.origin, launchDepth(command));
    p.velocity = (vec3f(command.destination, burstDepth(command))-p.position) / command.duration;
    p.gravity = 0.0; p.drag = 1.0; p.shape = command.shape;
    p.rotation = atan2(p.velocity.y, p.velocity.x);
    p.angularVelocity = command.curve;
  } else {
    p.velocity = shapeVelocity(command.shape, globalIndex, globalCount, command.intensity, command.seed ^ command.effectId, commandDepthEnabled);
    p.velocity.x += command.wind;
    let role = (command.flags >> 8u) & 15u;
    let pulseCount = (command.flags >> 3u) & 7u;
    if (command.emissionSpread > 0.0) {
      if (role == 8u && pulseCount > 1u) {
        let pulse = globalIndex % pulseCount;
        let localIndex = globalIndex / pulseCount;
        let pulsePhase = f32(pulse) / f32(pulseCount - 1u);
        let jitter = select(hash(p.seed + 0x68bc21ebu) * 0.016, 0.0, localIndex == 0u);
        p.life -= command.emissionSpread * pulsePhase + jitter;
        if (localIndex == 0u) { p.flags = p.flags | 128u; p.size *= 2.25; p.velocity *= 0.08; }
      } else {
        p.life -= command.emissionSpread * hash(p.seed + 0x9e3779b9u);
      }
    }
    if (command.shape == 0u && role == 3u) {
      p.position += p.velocity * (0.035 + hash(command.seed + globalIndex * 37u) * 0.035);
      p.size *= 0.62 + hash(command.seed + globalIndex * 43u) * 0.78;
      p.rotation = atan2(p.velocity.y, p.velocity.x);
      p.angularVelocity = 0.0;
    } else if (command.shape == 0u && role == 2u) {
      p.velocity *= 0.05;
    } else if (command.shape == 7u) {
      if (role == 8u) {
        p.position += p.velocity * (0.025 + hash(command.seed + globalIndex * 47u) * 0.08);
        p.size *= 0.72 + hash(command.seed + globalIndex * 61u) * 0.48;
      }
      p.rotation = atan2(p.velocity.y, p.velocity.x);
      p.angularVelocity = 0.0;
    } else if (command.shape == 2u) {
      p.position += p.velocity * (0.22 + hash(command.seed + globalIndex * 41u) * 0.08);
      p.size *= 0.82 + hash(command.seed + globalIndex * 53u) * 0.36;
    } else if (command.shape == 5u) {
      p.position += p.velocity * 0.1;
    }
    if (!isV2(p.flags) && (p.flags & 2u) != 0u) {
      let keepChance = select(0.14, 0.32, command.shape == 5u);
      if (hash(p.seed + 0x27d4eb2fu) > keepChance) { p.flags = p.flags & 0xfffffffdu; }
    }
  }
  particles[slot] = p;
  for (var sample = 0u; sample < uniforms.maxTrailSamples; sample++) { history[slot * uniforms.maxTrailSamples + sample] = p.position; }
}
@compute @workgroup_size(64) fn updateParticles(@builtin(global_invocation_id) gid: vec3u) {
  let index = gid.x; if (index >= arrayLength(&particles)) { return; }
  var p = particles[index]; if (p.alive == 0u) { return; }
  let previousLife = p.life;
  p.life += uniforms.dt;
  if (p.life < 0.0) { particles[index] = p; return; }
  if (p.life >= p.maxLife) { p.alive = 0u; particles[index] = p; releaseParticle(index); return; }
  let role = (p.flags >> 8u) & 15u;
  if (!isV2(p.flags) && (role == 1u || role == 2u)) {
    let progress = clamp(p.life / p.maxLife, 0.0, 1.0);
    let curveVelocity = p.angularVelocity * 3.1415926 / p.maxLife * cos(progress * 3.1415926);
    p.position += vec3f(p.velocity.x + curveVelocity, p.velocity.y, p.velocity.z) * uniforms.dt;
    p.rotation = atan2(p.velocity.y, p.velocity.x + curveVelocity);
  } else {
    let phase = uniforms.time * (1.7 + hash(p.seed + 71u) * 2.1) + hash(p.seed + 19u) * 6.2831853;
    var noise = vec2f(sin(phase), cos(phase * 0.83 + 1.7)) * uniforms.turbulence * 60.0;
    if (role == 7u) { noise += vec2f(cos(phase * 0.47), -abs(sin(phase * 0.31))) * 18.0; }
    p.velocity += vec3f(noise.x, p.gravity + noise.y, 0.0) * uniforms.dt;
    let legacyRetention = pow(p.drag, uniforms.dt * 60.0);
    let v2Resistance = exp(-p.drag * uniforms.dt * 60.0);
    p.velocity *= select(legacyRetention, v2Resistance, isV2(p.flags));
    p.position += p.velocity * uniforms.dt;
    p.rotation += p.angularVelocity * uniforms.dt;
  }
  let secondaryAt = 0.48 + hash(p.seed + 0x165667b1u) * 0.2;
  let splitQuality = (p.flags >> 4u) & 3u;
  let splitEnabled = !isV2(p.flags) || splitQuality > 0u;
  if ((p.flags & V2_SPLIT_REQUESTED) != 0u && (p.flags & V2_SPLIT_EMITTED) == 0u && splitEnabled && previousLife < p.maxLife * secondaryAt && p.life >= p.maxLife * secondaryAt) {
    let secondary = atomicAdd(&counters.secondaryCount, 1u);
    secondaryIndices[secondary] = index;
    p.flags = p.flags | V2_SPLIT_EMITTED;
  }
  if (!isV2(p.flags) && role == 1u && previousLife >= 0.0) {
    let previousBucket = u32(previousLife * 15.0);
    let currentBucket = u32(p.life * 15.0);
    if (currentBucket != previousBucket) {
      let exhaust = atomicAdd(&counters.secondaryCount, 1u);
      secondaryIndices[exhaust] = index;
    }
  }
  let historyBase = index * uniforms.maxTrailSamples;
  for (var sample = uniforms.trailSamples - 1u; sample > 0u; sample--) { history[historyBase + sample] = history[historyBase + sample - 1u]; }
  history[historyBase] = p.position;
  particles[index] = p;
  atomicAdd(&counters.activeCount, 1u);
  let bucket = depthBucket(p.position.z);
  var bucketSlot = 0u;
  if (bucket == 0u) { bucketSlot = atomicAdd(&counters.farCount, 1u); }
  else if (bucket == 1u) { bucketSlot = atomicAdd(&counters.midCount, 1u); }
  else { bucketSlot = atomicAdd(&counters.nearCount, 1u); }
  let bucketStride = arrayLength(&activeIndices) / 3u;
  activeIndices[bucket * bucketStride + bucketSlot] = index;
  let indirectOffset = bucket * 4u + 1u;
  atomicAdd(&coreIndirect[indirectOffset], 1u);
  atomicAdd(&trailIndirect[indirectOffset], max(1u, uniforms.trailSamples - 1u));
}
@compute @workgroup_size(64) fn spawnSecondary(@builtin(global_invocation_id) gid: vec3u) {
  let sourceNumber = gid.x;
  let sourceCount = atomicLoad(&counters.secondaryCount);
  if (sourceNumber >= sourceCount) { return; }
  let source = particles[secondaryIndices[sourceNumber]];
  let sourceRole = (source.flags >> 8u) & 15u;
  let styleBits = source.flags & (3u << 12u);
  if (isV2(source.flags)) {
    let splitQuality = (source.flags >> 4u) & 3u;
    let childCount = splitQuality + 1u;
    for (var child = 0u; child < childCount; child++) {
      let slot = allocateParticle();
      if (slot == 0xffffffffu) { return; }
      var p = source;
      let angle = f32(child) / f32(childCount) * 6.2831853 + hash(source.seed + child * 31u) * 0.36;
      let speed = 78.0 + hash(source.seed + child * 47u) * 86.0;
      let volumetric = (source.flags & V2_DEPTH) != 0u && source.shape != 11u && (source.shape < 17u || source.shape > 26u);
      let childDepthVelocity = (hash(source.seed + child * 67u) - 0.5) * 1.4;
      p.position = source.position;
      p.velocity = source.velocity * 0.22 + vec3f(cos(angle) * speed, sin(angle) * speed, select(0.0, childDepthVelocity, volumetric));
      p.life = 0.0; p.maxLife = max(0.08, source.maxLife * 0.46);
      p.size = source.size * (0.54 + 0.08 * f32(splitQuality));
      p.flags = (source.flags & ~V2_SPLIT_REQUESTED) | V2_SPLIT_EMITTED;
      p.seed = source.seed + child * 101u; p.alive = 1u;
      particles[slot] = p;
      for (var sample = 0u; sample < uniforms.maxTrailSamples; sample++) { history[slot * uniforms.maxTrailSamples + sample] = source.position; }
    }
    return;
  }
  if (sourceRole == 1u) {
    let style = (source.flags >> 12u) & 3u;
    let direction = normalize(source.velocity.xy + vec2f(0.0001));
    let normal = vec2f(-direction.y, direction.x);
    let childCount = select(2u, 3u, style == 1u || (style == 0u && hash(source.seed + u32(source.life * 91.0)) < 0.32));
    for (var child = 0u; child < childCount; child++) {
      let slot = allocateParticle();
      if (slot == 0xffffffffu) { return; }
      var p = source;
      let random = hash(source.seed + child * 101u + u32(source.life * 997.0));
      p.position = source.position + vec3f(-direction * source.size * (0.5 + random * 0.45) + normal * (random - 0.5) * source.size * 0.28, 0.0);
      p.life = 0.0; p.seed = source.seed + child * 131u + u32(source.life * 1301.0); p.textureIndex = 0u;
      p.rotation = atan2(-direction.y, -direction.x); p.angularVelocity = 0.0; p.alive = 1u;
      if (child == 2u) {
        p.shape = 9u; p.flags = styleBits | (7u << 8u); p.maxLife = 0.6 + random * 0.28;
        p.size = source.size * 0.38; p.color = vec4f(0.26, 0.29, 0.34, 0.18); p.gravity = -8.0; p.drag = 0.986;
        p.velocity = vec3f(-direction * (12.0 + random * 16.0) + normal * (random - 0.5) * 24.0, 0.0);
      } else {
        p.shape = 7u; p.flags = styleBits | (10u << 8u); p.maxLife = 0.24 + random * 0.22;
        p.size = source.size * (0.09 + random * 0.08); p.color = mix(source.color, vec4f(1.0, 0.48, 0.08, 1.0), 0.62);
        p.gravity = 72.0; p.drag = 0.955; p.velocity = vec3f(-direction * (38.0 + random * 58.0) + normal * (random - 0.5) * 55.0, 0.0);
      }
      particles[slot] = p;
      for (var sample = 0u; sample < uniforms.maxTrailSamples; sample++) { history[slot * uniforms.maxTrailSamples + sample] = p.position; }
    }
    return;
  }
  let childCount = select(3u, 2u, source.shape == 5u);
  for (var child = 0u; child < childCount; child++) {
    let slot = allocateParticle();
    if (slot == 0xffffffffu) { return; }
    var p = source;
    let angle = f32(child) / f32(childCount) * 6.2831853 + hash(source.seed + child * 31u);
    p.position = source.position;
    let childSpeed = 90.0 + hash(source.seed + child) * 90.0;
    p.velocity = source.velocity * 0.18 + vec3f(cos(angle) * childSpeed, sin(angle) * childSpeed, 0.0);
    p.life = 0.0;
    p.maxLife = source.maxLife * 0.42;
    p.size = source.size * 0.62;
    p.flags = styleBits | (5u << 8u);
    p.seed = source.seed + child * 101u;
    p.alive = 1u;
    if (source.shape != 5u) { p.shape = 0u; p.textureIndex = 0u; }
    particles[slot] = p;
    for (var sample = 0u; sample < uniforms.maxTrailSamples; sample++) { history[slot * uniforms.maxTrailSamples + sample] = source.position; }
  }
}
`;
    }

    _particleShader() {
        return `
struct Particle { position: vec3f, velocity: vec3f, color: vec4f, life: f32, maxLife: f32, size: f32, rotation: f32, angularVelocity: f32, gravity: f32, drag: f32, shape: u32, flags: u32, seed: u32, textureIndex: u32, alive: u32 };
struct Uniforms {
  dt: f32, time: f32, width: f32, height: f32,
  trailSamples: u32, turbulence: f32, commandCount: u32, maxTrailSamples: u32,
  glowScale: f32, bloomLevels: u32, pad0: vec2u,
};
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> activeIndices: array<u32>;
@group(0) @binding(2) var<storage, read> history: array<vec3f>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;
@group(0) @binding(4) var atlas: texture_2d<f32>;
@group(0) @binding(5) var atlasSampler: sampler;
const V2_TRAIL = 1u;
const V2_STROBE = 8u;
const V2_MARKER = 32768u;
struct Out {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(2) @interpolate(flat) shape: u32,
  @location(3) @interpolate(flat) textureIndex: u32,
  @location(4) fade: f32,
  @location(5) @interpolate(flat) flags: u32,
  @location(6) normalizedLife: f32,
  @location(7) @interpolate(flat) seed: u32,
  @location(8) @interpolate(flat) rotation: f32,
};
fn quadVertex(vertex: u32) -> vec2f { let vertices = array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1)); return vertices[vertex]; }
const CAMERA_DISTANCE = 4.0;
fn perspectiveScale(z: f32) -> f32 { return CAMERA_DISTANCE / max(2.0, CAMERA_DISTANCE - z); }
fn projectToPixels(position: vec3f) -> vec2f {
  let center = vec2f(uniforms.width, uniforms.height) * 0.5;
  return center + (position.xy - center) * perspectiveScale(position.z);
}
fn clipPixels(position: vec2f) -> vec4f { return vec4f(position.x/uniforms.width*2.0-1.0, 1.0-position.y/uniforms.height*2.0, 0.0, 1.0); }
fn clip(position: vec3f) -> vec4f { return clipPixels(projectToPixels(position)); }
fn isV2(flags:u32)->bool{return (flags&V2_MARKER)!=0u;}
fn v2Strobe(flags:u32,t:f32,seed:u32)->f32{
  if(!isV2(flags)||(flags&V2_STROBE)==0u){return 1.0;}
  let beat=floor(t*18.0);let pulse=fract(sin((f32(seed&1023u)+beat*91.7)*12.9898)*43758.5453);
  return select(0.08,1.0,pulse>0.38);
}
fn fadeEnvelope(role:u32,shape:u32,t:f32,flags:u32)->f32{
  if(shape==8u||(flags&64u)!=0u){return 1.0-smoothstep(0.9,1.0,t);}
  if(role==2u&&shape==0u){return 1.0-smoothstep(0.0,1.0,t);}
  if(role==7u){return smoothstep(0.0,0.16,t)*(1.0-smoothstep(0.38,1.0,t));}
  if(role==8u){return smoothstep(0.0,0.07,t)*(1.0-smoothstep(0.32,1.0,t));}
  if(role==10u){return pow(1.0-t,1.65);}
  if(shape>=17u&&shape<=26u){return smoothstep(0.0,0.08,t)*(1.0-smoothstep(0.64,1.0,t));}
  if(role==4u||shape==2u){return smoothstep(0.0,0.08,t)*(1.0-smoothstep(0.68,1.0,t));}
  return pow(1.0-t,select(1.2,0.82,shape>=1u&&shape<=6u));
}
@vertex fn coreVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Out {
  let p = particles[activeIndices[instance]]; let q = quadVertex(vertex); let role=(p.flags>>8u)&15u; let t=clamp(p.life/p.maxLife,0.0,1.0);
  let rotation=select(p.rotation,0.0,p.shape==6u&&(p.flags&64u)!=0u); let c = cos(rotation); let s = sin(rotation);
  let streak=(p.shape==0u&&role==3u)||(p.shape==7u&&(p.flags&128u)==0u);
  var scale=select(vec2f(1.0),vec2f(2.6,0.42),streak);
  if(p.shape==8u){scale=select(vec2f(1.42,0.48),vec2f(1.58,0.32),role==2u);}
  if(role==7u){scale*=1.0+t*1.75;}
  if(role==10u){scale*=max(0.32,1.0-t*0.68);}
  if(role==4u||p.shape==2u){scale*=0.84+0.16*smoothstep(0.0,0.16,t);}
  let scaledQ=q*scale;
  let rotated = vec2f(c*scaledQ.x-s*scaledQ.y,s*scaledQ.x+c*scaledQ.y) * p.size * perspectiveScale(p.position.z);
  var out: Out; out.position=clipPixels(projectToPixels(p.position)+rotated); out.uv=q*0.5+0.5; out.color=p.color; out.shape=p.shape; out.textureIndex=p.textureIndex; out.flags=p.flags; out.rotation=p.rotation;
  out.normalizedLife=t; out.seed=p.seed; out.fade=fadeEnvelope(role,p.shape,t,p.flags)*v2Strobe(p.flags,t,p.seed); return out;
}
@vertex fn trailVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Out {
  let segments=max(1u,uniforms.trailSamples-1u); let particleListIndex=instance/segments; let segment=instance%segments; let index=activeIndices[particleListIndex]; let p=particles[index]; let base=index*uniforms.maxTrailSamples;
  let a=history[base+segment]; let b=history[base+segment+1u]; let projectedA=projectToPixels(a); let projectedB=projectToPixels(b);
  let direction=normalize(projectedA-projectedB+vec2f(0.0001)); let normal=vec2f(-direction.y,direction.x); let q=quadVertex(vertex);
  let along=mix(projectedB,projectedA,q.x*0.5+0.5); let depth=mix(b.z,a.z,q.x*0.5+0.5); let trailWidthScale=select(1.0,0.62,p.shape==8u); let width=p.size*perspectiveScale(depth)*(0.38-f32(segment)/f32(segments)*0.29)*trailWidthScale;
  var out:Out; out.position=clipPixels(along+normal*q.y*width); out.uv=q*0.5+0.5; out.color=p.color; out.shape=p.shape; out.textureIndex=0u; out.flags=p.flags; out.rotation=p.rotation;
  let role=(p.flags>>8u)&15u;let t=clamp(p.life/p.maxLife,0.0,1.0);let shapeTrail=select(0.44,0.1,p.shape>=1u&&p.shape<=5u);
  out.fade=(1.0-f32(segment)/f32(segments))*fadeEnvelope(role,p.shape,t,p.flags)*shapeTrail*v2Strobe(p.flags,t,p.seed);
  if(isV2(p.flags)&&(p.flags & V2_TRAIL) == 0u){out.fade=0.0;}out.normalizedLife=t;out.seed=p.seed;return out;
}
fn sdCircle(p:vec2f)->f32{return length(p-0.5)-0.42;}
fn sdEllipse(p:vec2f,r:vec2f)->f32{return (length(p/max(r,vec2f(0.001)))-1.0)*min(r.x,r.y);}
fn sdHeart(p0:vec2f)->f32{
  var p=(p0*2.0-1.0)*vec2f(1.08,-1.0);p.y-=0.08;p.x=abs(p.x);
  if(p.x+p.y>1.0){return length(p-vec2f(0.25,0.75))-0.3535534;}
  let a=p-vec2f(0.0,1.0);let b=p-0.5*max(p.x+p.y,0.0);return sqrt(min(dot(a,a),dot(b,b)))*sign(p.x-p.y);
}
fn sdStar(p0:vec2f)->f32{
  var p=(p0*2.0-1.0)*1.08; let k1=vec2f(0.809016994,-0.587785252); let k2=vec2f(-k1.x,k1.y);
  p.x=abs(p.x); p-=2.0*max(dot(k1,p),0.0)*k1; p-=2.0*max(dot(k2,p),0.0)*k2; p.x=abs(p.x); p.y-=0.82;
  let ba=0.42*vec2f(-k1.y,k1.x)-vec2f(0.0,1.0); let h=clamp(dot(p,ba)/dot(ba,ba),0.0,0.82);
  return length(p-ba*h)*sign(p.y*ba.x-p.x*ba.y);
}
fn sdRing(p0:vec2f)->f32{return abs(length(p0-0.5)-0.315)-0.072;}
fn sdSpiral(p0:vec2f)->f32{let p=p0-0.5;let a=atan2(p.y,p.x)+3.1415926;let r=length(p);let first=abs(r-(0.035+0.047*a));let second=abs(r-(0.035+0.047*(a+6.2831853)));return min(first,second)-0.028;}
fn sdPaw(p0:vec2f)->f32{
  let p=(p0*2.0-1.0)*vec2f(1.0,-1.0);
  var d=sdEllipse(p-vec2f(0.0,0.24),vec2f(0.39,0.33));
  d=min(d,sdEllipse(p-vec2f(-0.43,-0.24),vec2f(0.17,0.21)));
  d=min(d,sdEllipse(p-vec2f(-0.15,-0.4),vec2f(0.17,0.22)));
  d=min(d,sdEllipse(p-vec2f(0.15,-0.4),vec2f(0.17,0.22)));
  return min(d,sdEllipse(p-vec2f(0.43,-0.24),vec2f(0.17,0.21)));
}
fn shapeDistance(uv:vec2f,shape:u32)->f32{if(shape==1u){return sdHeart(uv);}if(shape==2u){return sdPaw(uv);}if(shape==3u){return sdStar(uv);}if(shape==4u){return sdRing(uv);}if(shape==5u){return sdSpiral(uv);}return sdCircle(uv);}
fn sdCapsule(p:vec2f,a:vec2f,b:vec2f,r:f32)->f32{let pa=p-a;let ba=b-a;let h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);return length(pa-ba*h)-r;}
fn rocketCoverage(uv:vec2f,time:f32,seed:u32)->vec3f{
  let p=uv*2.0-1.0;let aa=0.025;
  let fuselage=1.0-smoothstep(-aa,aa,sdCapsule(p,vec2f(-0.48,0.0),vec2f(0.43,0.0),0.16));
  let noseWidth=max(0.0,(0.94-p.x)*0.34);let nose=step(0.38,p.x)*step(p.x,0.94)*(1.0-smoothstep(noseWidth,noseWidth+aa,abs(p.y)));
  let finWidth=max(0.0,(p.x+0.68)*0.38);let fins=step(-0.68,p.x)*step(p.x,-0.18)*smoothstep(0.12,0.19,abs(p.y))*(1.0-smoothstep(0.34,0.34+finWidth+aa,abs(p.y)));
  let nozzle=step(-0.68,p.x)*step(p.x,-0.43)*(1.0-smoothstep(0.11,0.17,abs(p.y)));
  let flicker=0.08*sin(time*37.0+f32(seed&255u)*0.17)+0.04*sin(time*71.0);
  let flameStart=-0.98-flicker;let flameWidth=max(0.0,(p.x-flameStart)*0.22);let flame=step(flameStart,p.x)*step(p.x,-0.56)*(1.0-smoothstep(flameWidth,flameWidth+0.05,abs(p.y)));
  return vec3f(max(fuselage,max(nose,fins)),nozzle,flame);
}
fn atlasSample(uv:vec2f,index:u32,uvDx:vec2f,uvDy:vec2f)->vec4f{let slot=f32(max(1u,index)-1u);let cell=vec2f(fract(slot/8.0),floor(slot/8.0)/8.0);let atlasScale=vec2f(116.0/1024.0);let inner=vec2f(6.0/1024.0)+uv*atlasScale;return textureSampleGrad(atlas,atlasSampler,cell+inner,uvDx*atlasScale,uvDy*atlasScale);}
fn premiumRealisticMaterial(base:vec3f,role:u32,t:f32,seed:u32)->vec3f{
  let ignition=vec3f(1.0,0.985,0.88);let gold=vec3f(1.0,0.64,0.16);let ember=vec3f(0.92,0.075,0.012);
  var color=mix(ignition,base,smoothstep(0.035,0.26,t));
  color=mix(color,gold,smoothstep(0.62,0.82,t)*0.34);
  color=mix(color,ember,smoothstep(0.78,1.0,t)*select(0.42,0.68,role==2u));
  let grain=0.93+0.07*sin(uniforms.time*(24.0+f32(seed&7u))+f32(seed&255u)*0.31);
  return color*grain;
}
fn materialColor(base:vec3f,role:u32,style:u32,t:f32,seed:u32)->vec3f{
  if(style==3u){return premiumRealisticMaterial(base,role,t,seed);}
  if(role==7u){return mix(vec3f(0.38,0.4,0.44),base,0.18);}
  let whiteHot=vec3f(1.0,0.965,0.78);let ember=vec3f(1.0,0.2,0.025);
  var color=mix(whiteHot,base,smoothstep(0.02,0.22,t));
  if(role==3u||role==5u||role==8u||role==10u){color=mix(color,ember,smoothstep(0.68,1.0,t)*select(0.72,0.42,style==2u));}
  if(role==4u){color=mix(whiteHot,base,smoothstep(0.0,0.13,t));}
  let flicker=0.88+0.12*sin(uniforms.time*(21.0+f32(seed&7u))+f32(seed&255u));
  return color*select(1.0,flicker,role==8u||role==10u);
}
fn glyphMaterialColor(base:vec3f,t:f32)->vec3f{
  let chroma=smoothstep(0.14,0.72,t);
  return mix(mix(vec3f(1.0),base,0.34),base,chroma*0.66);
}
@fragment fn particleFragment(in:Out)->@location(0) vec4f {
  let uvDx=dpdx(in.uv);let uvDy=dpdy(in.uv);let d=shapeDistance(in.uv,in.shape);let aa=max(0.0035,fwidth(d)*0.9);
  let role=(in.flags>>8u)&15u;let style=(in.flags>>12u)&3u;
  if(in.shape==6u){let tex=atlasSample(in.uv,in.textureIndex,uvDx,uvDy);let alpha=tex.a*in.fade*in.color.a;if((in.flags&1u)!=0u){return vec4f(tex.rgb*alpha,alpha);}return vec4f(in.color.rgb*alpha,alpha);}
  if(in.shape==8u){
    let parts=rocketCoverage(in.uv,uniforms.time,in.seed);
    let bodyColor=mix(in.color.rgb,vec3f(0.96,0.98,1.0),0.2+0.22*smoothstep(0.0,1.0,in.uv.y));
    let flameColor=mix(vec3f(1.0,0.12,0.01),vec3f(1.0,0.98,0.7),smoothstep(-1.0,-0.42,in.uv.x*2.0-1.0));
    var coverage=select(parts.x,max(parts.y,parts.z),role==2u);
    var rgb=select(bodyColor,flameColor,role==2u);
    if((in.flags&16384u)!=0u&&in.textureIndex>0u&&role==1u){
      let local=(in.uv*2.0-1.0-vec2f(0.56,0.0))*vec2f(1.42,0.48);
      let localDx=uvDx*2.0*vec2f(1.42,0.48);let localDy=uvDy*2.0*vec2f(1.42,0.48);
      let c=cos(in.rotation);let s=sin(in.rotation);
      let upright=vec2f(c*local.x-s*local.y,s*local.x+c*local.y);
      let uprightDx=vec2f(c*localDx.x-s*localDx.y,s*localDx.x+c*localDx.y);
      let uprightDy=vec2f(c*localDy.x-s*localDy.y,s*localDy.x+c*localDy.y);
      let radius=0.43;let avatarUv=upright/(radius*2.0)+0.5;
      let avatar=atlasSample(clamp(avatarUv,vec2f(0.0),vec2f(1.0)),in.textureIndex,uprightDx/(radius*2.0),uprightDy/(radius*2.0));
      let normalized=length(upright)/radius;
      let disc=1.0-smoothstep(0.9,0.99,normalized);
      let outer=1.0-smoothstep(0.97,1.04,normalized);let inner=1.0-smoothstep(0.8,0.88,normalized);let rim=max(0.0,outer-inner);
      let avatarAlpha=avatar.a*disc;
      coverage=max(coverage,max(avatarAlpha,rim));
      rgb=mix(rgb,avatar.rgb,avatarAlpha);
      rgb=mix(rgb,mix(in.color.rgb,vec3f(1.0,0.96,0.78),0.58),rim*(1.0-avatarAlpha*0.45));
    }
    let alpha=coverage*in.fade*in.color.a;return vec4f(rgb*alpha,alpha);
  }
  var coverage=1.0-smoothstep(-aa,aa,d);
  if(in.shape>=1u&&in.shape<=5u){let outlineWidth=select(0.024,0.055,style==2u);let outline=1.0-smoothstep(outlineWidth,outlineWidth+aa,abs(d));coverage=max(coverage,outline*select(0.72,1.0,style==2u));}
  if(in.shape==7u){if((in.flags&128u)!=0u){coverage=1.0-smoothstep(0.18,0.46,length(in.uv-0.5));}else{let p=abs(in.uv-0.5);coverage=1.0-smoothstep(0.12,0.42,min(max(p.x,p.y)*0.78,p.x+p.y));}}
  if(in.shape==9u){let radius=length(in.uv-0.5);let curl=0.08*sin(atan2(in.uv.y-0.5,in.uv.x-0.5)*5.0+uniforms.time*0.8+f32(in.seed&63u));coverage=pow(1.0-smoothstep(0.04,0.5+curl,radius),1.65)*0.31;}
  let alpha=coverage*in.fade*in.color.a;var rgb=materialColor(in.color.rgb,role,style,in.normalizedLife,in.seed);
  if(in.shape>=17u&&in.shape<=26u){rgb=glyphMaterialColor(in.color.rgb,in.normalizedLife);}
  if(in.shape==0u||in.shape==7u){let heat=pow(max(0.0,1.0-length(in.uv-0.5)*2.0),3.0);rgb=mix(rgb,vec3f(1.0,0.96,0.76),heat*0.86);}
  return vec4f(rgb*alpha,alpha);
}
@fragment fn glowFragment(in:Out)->@location(0) vec4f {
  let uvDx=dpdx(in.uv);let uvDy=dpdy(in.uv);let role=(in.flags>>8u)&15u;if(role==7u){discard;}var coverage=0.0;if(in.shape==6u){coverage=atlasSample(in.uv,in.textureIndex,uvDx,uvDy).a;}else if(in.shape==8u){let parts=rocketCoverage(in.uv,uniforms.time,in.seed);coverage=max(parts.x*0.62,max(parts.y,parts.z));}else{let d=shapeDistance(in.uv,in.shape);coverage=exp(-max(0.0,d)*select(11.0,7.5,(in.flags&128u)!=0u))*(1.0-smoothstep(0.08,0.7,length(in.uv-0.5)));}
  let style=(in.flags>>12u)&3u;var styleGlow=select(1.0,select(0.72,1.38,style==2u),style!=0u);if(style==3u){styleGlow=1.18;}let pulse=select(1.0,0.72+0.28*sin(uniforms.time*44.0+f32(in.seed&31u)),role==8u);let glyphGlow=select(1.0,1.3,in.shape>=17u&&in.shape<=26u);let alpha=coverage*in.fade*in.color.a*0.18*uniforms.glowScale*styleGlow*pulse*glyphGlow;var rgb=materialColor(in.color.rgb,role,style,in.normalizedLife,in.seed);if(in.shape>=17u&&in.shape<=26u){rgb=glyphMaterialColor(in.color.rgb,in.normalizedLife);}return vec4f(rgb*alpha,alpha);
}
@fragment fn trailFragment(in:Out)->@location(0) vec4f {let role=(in.flags>>8u)&15u;if(isV2(in.flags)&&(in.flags&V2_TRAIL)==0u){discard;}if(!isV2(in.flags)&&((in.shape>=1u&&in.shape<=6u)||in.shape==9u||role==2u||role==7u)){discard;}let edge=exp(-pow(abs(in.uv.y-0.5)*3.8,2.0));let alpha=edge*in.fade*in.color.a;let style=(in.flags>>12u)&3u;let rgb=materialColor(in.color.rgb,role,style,in.normalizedLife,in.seed);return vec4f(rgb*alpha,alpha);}
`;
    }

    _postShader() {
        return `
struct Uniforms { dt:f32,time:f32,width:f32,height:f32,trailSamples:u32,turbulence:f32,commandCount:u32,maxTrailSamples:u32,glowScale:f32,bloomLevels:u32,pad0:vec2u };
@group(0) @binding(0) var firstTexture:texture_2d<f32>;
@group(0) @binding(1) var secondTexture:texture_2d<f32>;
@group(0) @binding(2) var linearSampler:sampler;
@group(0) @binding(3) var<uniform> uniforms:Uniforms;
struct Out{@builtin(position) position:vec4f,@location(0) uv:vec2f};
@vertex fn fullscreenVertex(@builtin(vertex_index) index:u32)->Out{let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var out:Out;out.position=vec4f(p[index],0,1);out.uv=vec2f(p[index].x*0.5+0.5,0.5-p[index].y*0.5);return out;}
@fragment fn brightExtract(in:Out)->@location(0) vec4f{let color=textureSample(firstTexture,linearSampler,in.uv);let light=max(color.r,max(color.g,color.b));let weight=smoothstep(0.35,1.0,light);return vec4f(color.rgb*weight,color.a*weight);}
@fragment fn kawaseBlur(in:Out)->@location(0) vec4f{let dim=vec2f(textureDimensions(firstTexture));let px=1.5/dim;var color=textureSample(firstTexture,linearSampler,in.uv)*0.2;color+=textureSample(firstTexture,linearSampler,in.uv+vec2f(px.x,px.y))*0.2;color+=textureSample(firstTexture,linearSampler,in.uv+vec2f(-px.x,px.y))*0.2;color+=textureSample(firstTexture,linearSampler,in.uv+vec2f(px.x,-px.y))*0.2;color+=textureSample(firstTexture,linearSampler,in.uv-vec2f(px.x,px.y))*0.2;return color;}
@fragment fn bloomCopy(in:Out)->@location(0) vec4f{return textureSample(firstTexture,linearSampler,in.uv);}
@fragment fn bloomUpsample(in:Out)->@location(0) vec4f{let dim=vec2f(textureDimensions(firstTexture));let px=1.0/dim;var color=textureSample(firstTexture,linearSampler,in.uv)*0.25;color+=textureSample(firstTexture,linearSampler,in.uv+vec2f(px.x,0.0))*0.125;color+=textureSample(firstTexture,linearSampler,in.uv-vec2f(px.x,0.0))*0.125;color+=textureSample(firstTexture,linearSampler,in.uv+vec2f(0.0,px.y))*0.125;color+=textureSample(firstTexture,linearSampler,in.uv-vec2f(0.0,px.y))*0.125;color+=textureSample(firstTexture,linearSampler,in.uv+px)*0.0625;color+=textureSample(firstTexture,linearSampler,in.uv-px)*0.0625;color+=textureSample(firstTexture,linearSampler,in.uv+vec2f(px.x,-px.y))*0.0625;color+=textureSample(firstTexture,linearSampler,in.uv+vec2f(-px.x,px.y))*0.0625;return color*0.68;}
@fragment fn atlasDownsample(in:Out)->@location(0) vec4f{let dim=vec2f(textureDimensions(firstTexture));let px=0.5/dim;let a=textureSampleLevel(firstTexture,linearSampler,in.uv+vec2f(-px.x,-px.y),0.0);let b=textureSampleLevel(firstTexture,linearSampler,in.uv+vec2f(px.x,-px.y),0.0);let c=textureSampleLevel(firstTexture,linearSampler,in.uv+vec2f(-px.x,px.y),0.0);let d=textureSampleLevel(firstTexture,linearSampler,in.uv+vec2f(px.x,px.y),0.0);let alpha=(a.a+b.a+c.a+d.a)*0.25;let premul=(a.rgb*a.a+b.rgb*b.a+c.rgb*c.a+d.rgb*d.a)*0.25;return vec4f(select(vec3f(0.0),premul/max(alpha,0.0001),alpha>0.0001),alpha);}
fn aces(color:vec3f)->vec3f{let a=2.51;let b=0.03;let c=2.43;let d=0.59;let e=0.14;return clamp((color*(a*color+b))/(color*(c*color+d)+e),vec3f(0.0),vec3f(1.0));}
@fragment fn composite(in:Out)->@location(0) vec4f{let scene=textureSample(firstTexture,linearSampler,in.uv);let bloom=textureSample(secondTexture,linearSampler,in.uv);let bloomStrength=0.5+uniforms.glowScale*0.24;let bloomLight=max(bloom.r,max(bloom.g,bloom.b));let bloomAlpha=clamp(bloom.a*0.42+bloomLight*0.14*uniforms.glowScale,0.0,0.68);let alpha=clamp(max(scene.a,bloomAlpha),0.0,1.0);let radiance=scene.rgb+bloom.rgb*bloomStrength;let straight=aces(radiance/max(alpha,0.001));let rgb=select(vec3f(0.0),min(vec3f(alpha),straight*alpha),alpha>0.0001);return vec4f(rgb,alpha);}
`;
    }
}

if (typeof window !== 'undefined') window.WebGPUParticleEngine = WebGPUParticleEngine;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebGPUParticleEngine;
    module.exports.parseColor = parseColor;
}
