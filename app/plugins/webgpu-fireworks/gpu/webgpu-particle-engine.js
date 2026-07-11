/**
 * WebGPU-only particle engine for WebGPU Fireworks.
 *
 * The CPU submits compact spawn commands. Particle allocation, shape velocity
 * generation, physics, lifetime management, trail history, active compaction
 * and indirect draw counts are produced by WGSL compute passes.
 */
class WebGPUParticleEngine {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.maxParticles = Math.max(256, Number(options.maxParticles) || 8192);
        this.maxSpawnCommands = 32;
        this.maxTrailSamples = 12;
        this.trailSamples = Math.max(2, Math.min(this.maxTrailSamples, Number(options.trailSamples) || 8));
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
        this.atlasSlots = new Map();
        this.nextAtlasSlot = 1; // Slot zero is the neutral paw sprite.
        this.atlasSize = 1024;
        this.atlasSlotSize = 128;
        this.atlasSlotsPerRow = this.atlasSize / this.atlasSlotSize;
        this.logicalWidth = canvas.width || 1920;
        this.logicalHeight = canvas.height || 1080;
        this.lastReadbackAt = 0;
        this.readbackPending = false;
        this.metrics = {
            state: 'initializing',
            backend: 'webgpu',
            activeParticles: 0,
            droppedParticles: 0,
            gpuFrameMs: null,
            adapter: null,
            format: null
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
        const particleStride = 80;
        this.buffers = {
            particles: this._createBuffer('fireworks-particles', this.maxParticles * particleStride, U.STORAGE | U.COPY_DST | U.COPY_SRC),
            history: this._createBuffer('fireworks-trail-history', this.maxParticles * this.maxTrailSamples * 8, U.STORAGE | U.COPY_DST),
            activeIndices: this._createBuffer('fireworks-active-indices', this.maxParticles * 4, U.STORAGE | U.COPY_SRC),
            secondaryIndices: this._createBuffer('fireworks-secondary-indices', this.maxParticles * 4, U.STORAGE),
            freeIndices: this._createBuffer('fireworks-free-indices', this.maxParticles * 4, U.STORAGE | U.COPY_DST),
            counters: this._createBuffer('fireworks-counters', 16, U.STORAGE | U.COPY_SRC | U.COPY_DST),
            commands: this._createBuffer('fireworks-spawn-commands', this.maxSpawnCommands * 96, U.STORAGE | U.COPY_DST),
            uniforms: this._createBuffer('fireworks-uniforms', 48, U.UNIFORM | U.COPY_DST),
            coreIndirect: this._createBuffer('fireworks-core-indirect', 16, U.STORAGE | U.INDIRECT | U.COPY_DST | U.COPY_SRC),
            trailIndirect: this._createBuffer('fireworks-trail-indirect', 16, U.STORAGE | U.INDIRECT | U.COPY_DST | U.COPY_SRC),
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
        this.device.queue.writeBuffer(this.buffers.counters, 0, new Uint32Array([this.maxParticles, 0, 0, 0]));
        this.device.queue.writeBuffer(this.buffers.coreIndirect, 0, new Uint32Array([6, 0, 0, 0]));
        this.device.queue.writeBuffer(this.buffers.trailIndirect, 0, new Uint32Array([6, 0, 0, 0]));

        this.atlasTexture = this.device.createTexture({
            label: 'fireworks-atlas',
            size: [this.atlasSize, this.atlasSize, 1],
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
        const makePost = (entryPoint, format) => this.device.createRenderPipelineAsync({
            layout: postPipelineLayout,
            vertex: { module: postModule, entryPoint: 'fullscreenVertex' },
            fragment: { module: postModule, entryPoint, targets: [{ format }] },
            primitive: { topology: 'triangle-list' }
        });
        this.pipelines.extract = await makePost('brightExtract', 'rgba16float');
        this.pipelines.blur = await makePost('kawaseBlur', 'rgba16float');
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
        this.renderBindGroup = this.device.createBindGroup({ layout: renderLayout, entries: [
            { binding: 0, resource: { buffer: this.buffers.particles } },
            { binding: 1, resource: { buffer: this.buffers.activeIndices } },
            { binding: 2, resource: { buffer: this.buffers.history } },
            { binding: 3, resource: { buffer: this.buffers.uniforms } },
            { binding: 4, resource: this.atlasTexture.createView() },
            { binding: 5, resource: this.atlasSampler }
        ]});
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
            halfToQuarter: make(this.bloomTextureB, this.sceneTexture),
            quarterBlur: make(this.bloomQuarterA, this.sceneTexture),
            quarterToEighth: make(this.bloomQuarterB, this.sceneTexture),
            eighthBlur: make(this.bloomEighthA, this.sceneTexture),
            eighthToQuarter: make(this.bloomEighthB, this.sceneTexture),
            quarterToHalf: make(this.bloomQuarterA, this.sceneTexture),
            composite: make(this.sceneTexture, this.bloomTextureA)
        };
    }

    async _assertShader(module, label) {
        if (typeof module.getCompilationInfo !== 'function') return;
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter(message => message.type === 'error');
        if (errors.length) throw new Error(`${label} WGSL: ${errors.map(error => error.message).join('; ')}`);
    }

    async _initializeAtlas() {
        const canvas = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(this.atlasSlotSize, this.atlasSlotSize)
            : Object.assign(document.createElement('canvas'), { width: this.atlasSlotSize, height: this.atlasSlotSize });
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, this.atlasSlotSize, this.atlasSlotSize);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(64, 82, 34, 29, 0, 0, Math.PI * 2);
        ctx.fill();
        for (const [x, y, r] of [[28, 43, 13], [50, 29, 13], [78, 29, 13], [100, 43, 13]]) {
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        this.device.queue.copyExternalImageToTexture({ source: canvas }, { texture: this.atlasTexture, origin: [0, 0] }, [this.atlasSlotSize, this.atlasSlotSize]);
        this.atlasSlots.set('shape:paw', 0);
    }

    async uploadImage(key, image) {
        if (!this.initialized || !key || !image) return 0;
        if (this.atlasSlots.has(key)) return this.atlasSlots.get(key) + 1;
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
        const scale = Math.min(this.atlasSlotSize / sourceWidth, this.atlasSlotSize / sourceHeight);
        const width = sourceWidth * scale;
        const height = sourceHeight * scale;
        ctx.drawImage(image, (this.atlasSlotSize - width) * 0.5, (this.atlasSlotSize - height) * 0.5, width, height);
        const x = (slot % this.atlasSlotsPerRow) * this.atlasSlotSize;
        const y = Math.floor(slot / this.atlasSlotsPerRow) * this.atlasSlotSize;
        this.device.queue.copyExternalImageToTexture({ source: canvas }, { texture: this.atlasTexture, origin: [x, y] }, [this.atlasSlotSize, this.atlasSlotSize]);
        this.atlasSlots.set(key, slot);
        return slot + 1;
    }

    spawnRocket(options = {}) {
        const style = this._styleId(options.style);
        this._queueSpawn({
            ...options,
            kind: 1,
            count: 1,
            shape: options.shape ?? 8,
            size: options.shape === 'image' ? options.size : Math.max(18, (Number(options.size) || 8) * 2.4),
            flags: this._flags({ role: 1, style, nativeColor: options.shape === 'image' }),
            curve: options.curve || 0
        });
        if (options.shape !== 'image') {
            this._queueSpawn({
                ...options,
                kind: 1,
                count: 1,
                shape: 'rocket',
                size: Math.max(11, (Number(options.size) || 8) * 1.35),
                color: '#fff4d6',
                flags: this._flags({ role: 2, style }),
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
        const requestedSize = Number(options.size) || 0;
        const shapeSize = shape >= 1 && shape <= 5
            ? Math.max(requestedSize, this._shapeSize(shape, style))
            : (requestedSize || this._shapeSize(shape, style));
        let remaining = count;
        for (let i = 0; i < palette.length && remaining > 0; i++) {
            const commandsLeft = palette.length - i;
            const slice = Math.ceil(remaining / commandsLeft);
            this._queueSpawn({
                ...options,
                kind: 2,
                count: slice,
                shape,
                size: shapeSize,
                color: palette[i],
                flags: this._flags({
                    role: shape === 0 ? 3 : shape === 6 ? 6 : 4,
                    style,
                    secondary: shape === 0 || shape === 5,
                    nativeColor: options.nativeColor === true
                })
            });
            remaining -= slice;
        }

        if (shape === 0) {
            this._queueSpawn({
                ...options,
                kind: 2,
                count: 1,
                shape: 0,
                intensity: 0.02,
                size: Math.max(30, shapeSize * 5),
                duration: 0.2,
                gravity: 0,
                drag: 1,
                color: '#ffffff',
                flags: this._flags({ role: 2, style })
            });
            this._queueSpawn({
                ...options,
                kind: 2,
                count: Math.max(8, Math.round(count * 0.12)),
                shape: 'sparkle',
                size: Math.max(4, shapeSize * 0.72),
                duration: Math.max(0.45, Number(options.duration) * 0.58),
                color: '#ffffff',
                flags: this._flags({ role: 5, style })
            });
        }

        const smokeCount = style === 1 ? 10 : style === 0 ? 5 : 0;
        if (smokeCount > 0 && this.smokeScale > 0.1 && shape === 0) {
            this._queueSpawn({
                ...options,
                kind: 2,
                count: Math.max(2, Math.round(smokeCount * this.smokeScale)),
                shape: 9,
                size: 20 + style * 5,
                duration: Math.max(1.2, Number(options.duration) * 1.18),
                gravity: -8,
                drag: 0.992,
                color: '#7c84912c',
                flags: this._flags({ role: 7, style })
            });
        }
    }

    spawnCrackle(options = {}) {
        const style = this._styleId(options.style);
        const palette = Array.isArray(options.colors) && options.colors.length
            ? options.colors.slice(0, 2)
            : ['#fff4b0'];
        const duration = Math.max(0.25, Math.min(1.2, Number(options.duration) || 0.7));
        const requested = Math.round(10 + Math.max(0.1, Number(options.intensity) || 1) * 5);
        const count = Math.max(10, Math.min(36, requested));
        let remaining = count;
        for (let index = 0; index < palette.length && remaining > 0; index++) {
            const slice = Math.ceil(remaining / (palette.length - index));
            this._queueSpawn({
                ...options,
                kind: 2,
                count: slice,
                shape: 'sparkle',
                size: 3.6 + style * 0.5,
                duration,
                color: palette[index],
                secondary: false,
                flags: this._flags({ role: 8, style })
            });
            remaining -= slice;
        }
        return duration;
    }

    _shapeId(shape) {
        if (typeof shape === 'number') return shape;
        return { burst: 0, heart: 1, paws: 2, paw: 2, star: 3, ring: 4, spiral: 5, image: 6, sparkle: 7, rocket: 8, smoke: 9 }[shape] ?? 0;
    }

    _styleId(style) {
        return { 'premium-hybrid': 0, realistic: 1, 'stylized-neon': 2 }[style] ?? 0;
    }

    _flags({ secondary = false, nativeColor = false, role = 0, style = 0 } = {}) {
        return (nativeColor ? 1 : 0) | (secondary ? 2 : 0) | ((role & 15) << 8) | ((style & 3) << 12);
    }

    _shapeSize(shape, style) {
        const base = { 0: 6, 1: 19, 2: 46, 3: 21, 4: 18, 5: 35, 6: 18, 7: 5, 8: 8, 9: 24 }[shape] || 6;
        const styleScale = style === 2 ? 1.28 : style === 1 ? 0.92 : 1.08;
        const resolutionScale = Math.max(0.75, Math.min(1.75, this.logicalHeight / 1080));
        return base * styleScale * resolutionScale;
    }

    _queueSpawn(command) {
        if (!this.initialized || this.spawnQueue.length >= this.maxSpawnCommands) return false;
        this.spawnQueue.push({
            origin: command.origin || { x: command.x || 0, y: command.y || 0 },
            target: command.target || command.origin || { x: command.x || 0, y: command.y || 0 },
            color: this._parseColor(command.color || '#ffffff'),
            count: Math.max(1, Math.floor(command.count || 1)),
            shape: this._shapeId(command.shape),
            kind: command.kind || 2,
            flags: command.flags || 0,
            intensity: Math.max(0.1, Number(command.intensity) || 1),
            duration: Math.max(0.05, Number(command.duration) || 1.2),
            textureIndex: Math.max(0, Number(command.textureIndex) || 0),
            seed: command.seed || Math.floor(Math.random() * 0xffffffff),
            size: Math.max(1, Number(command.size) || 6),
            gravity: Number.isFinite(command.gravity) ? command.gravity : 90,
            drag: Number.isFinite(command.drag) ? command.drag : 0.985,
            secondary: command.secondary !== false ? 1 : 0,
            wind: Number.isFinite(command.wind) ? command.wind : 0,
            curve: Number.isFinite(command.curve) ? command.curve : 0
        });
        return true;
    }

    _parseColor(color) {
        if (Array.isArray(color) && color.length >= 3) {
            return [
                Math.max(0, Math.min(1, Number(color[0]) || 0)),
                Math.max(0, Math.min(1, Number(color[1]) || 0)),
                Math.max(0, Math.min(1, Number(color[2]) || 0)),
                Math.max(0, Math.min(1, color.length > 3 ? Number(color[3]) : 1))
            ];
        }
        const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(color));
        if (hex) return [parseInt(hex[1], 16) / 255, parseInt(hex[2], 16) / 255, parseInt(hex[3], 16) / 255, 1];
        const hexAlpha = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(color));
        if (hexAlpha) return [
            parseInt(hexAlpha[1], 16) / 255,
            parseInt(hexAlpha[2], 16) / 255,
            parseInt(hexAlpha[3], 16) / 255,
            parseInt(hexAlpha[4], 16) / 255
        ];
        const hsl = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i.exec(String(color));
        if (!hsl) return [1, 1, 1, 1];
        const h = Number(hsl[1]) / 360, s = Number(hsl[2]) / 100, l = Number(hsl[3]) / 100;
        const f = n => {
            const k = (n + h * 12) % 12;
            return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        };
        return [f(0), f(8), f(4), 1];
    }

    _uploadSpawnCommands() {
        const commands = this.spawnQueue.splice(0, this.maxSpawnCommands);
        if (!commands.length) return { count: 0, maxParticles: 0 };
        const raw = new ArrayBuffer(commands.length * 96);
        const f32 = new Float32Array(raw);
        const u32 = new Uint32Array(raw);
        let maxParticles = 0;
        commands.forEach((command, index) => {
            const base = index * 24;
            f32[base] = command.origin.x; f32[base + 1] = command.origin.y;
            f32[base + 2] = command.target.x; f32[base + 3] = command.target.y;
            f32.set(command.color, base + 4);
            u32[base + 8] = command.count; u32[base + 9] = command.shape;
            u32[base + 10] = command.kind; u32[base + 11] = command.flags;
            f32[base + 12] = command.intensity; f32[base + 13] = command.duration;
            u32[base + 14] = command.textureIndex; u32[base + 15] = command.seed;
            f32[base + 16] = command.size; f32[base + 17] = command.gravity;
            f32[base + 18] = command.drag; u32[base + 19] = command.secondary;
            f32[base + 20] = command.wind; f32[base + 21] = command.curve;
            maxParticles = Math.max(maxParticles, command.count);
        });
        this.device.queue.writeBuffer(this.buffers.commands, 0, raw);
        return { count: commands.length, maxParticles };
    }

    render(deltaSeconds, timeSeconds = performance.now() / 1000) {
        if (!this.initialized || this.destroyed) return;
        const spawn = this._uploadSpawnCommands();
        const uniformRaw = new ArrayBuffer(48);
        const uf = new Float32Array(uniformRaw);
        const uu = new Uint32Array(uniformRaw);
        uf[0] = Math.min(0.05, Math.max(0.001, deltaSeconds || 1 / 60));
        uf[1] = timeSeconds;
        uf[2] = this.logicalWidth;
        uf[3] = this.logicalHeight;
        uu[4] = this.trailSamples;
        uf[5] = this.turbulence;
        uu[6] = spawn.count;
        uu[7] = this.maxTrailSamples;
        uf[8] = this.glowScale;
        uu[9] = this.bloomLevels;
        this.device.queue.writeBuffer(this.buffers.uniforms, 0, uniformRaw);

        const computeEncoder = this.device.createCommandEncoder({ label: 'fireworks-compute-frame' });
        const computeDescriptor = { label: 'fireworks-compute' };
        if (this.timestampEnabled) {
            computeDescriptor.timestampWrites = {
                querySet: this.timestampQuerySet,
                beginningOfPassWriteIndex: 0,
                endOfPassWriteIndex: 1
            };
        }
        let pass = computeEncoder.beginComputePass(computeDescriptor);
        pass.setBindGroup(0, this.computeBindGroup);
        pass.setPipeline(this.pipelines.reset);
        pass.dispatchWorkgroups(1);
        if (spawn.count) {
            pass.setPipeline(this.pipelines.spawn);
            pass.dispatchWorkgroups(Math.ceil(spawn.maxParticles / 64), spawn.count);
        }
        pass.setPipeline(this.pipelines.update);
        pass.dispatchWorkgroups(Math.ceil(this.maxParticles / 64));
        pass.setPipeline(this.pipelines.secondary);
        pass.dispatchWorkgroups(Math.ceil(this.maxParticles / 64));
        pass.end();
        this.device.queue.submit([computeEncoder.finish()]);

        // Keep compute and indirect rendering in ordered command buffers. This
        // makes the freshly compacted indirect arguments visible consistently
        // across Chromium/Dawn versions used by OBS browser sources.
        const encoder = this.device.createCommandEncoder({ label: 'fireworks-render-frame' });

        const scenePass = encoder.beginRenderPass({ colorAttachments: [{
            view: this.sceneTexture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store'
        }]});
        scenePass.setBindGroup(0, this.renderBindGroup);
        scenePass.setPipeline(this.pipelines.trail);
        scenePass.drawIndirect(this.buffers.trailIndirect, 0);
        scenePass.setPipeline(this.pipelines.glow);
        scenePass.drawIndirect(this.buffers.coreIndirect, 0);
        scenePass.setPipeline(this.pipelines.core);
        scenePass.drawIndirect(this.buffers.coreIndirect, 0);
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
                upQuarter.setPipeline(this.pipelines.blur); upQuarter.setBindGroup(0, this.postBindGroups.eighthToQuarter); upQuarter.draw(3); upQuarter.end();
            }
            if (this.bloomLevels >= 2) {
                const upHalf = encoder.beginRenderPass({ colorAttachments: [{ view: this.bloomTextureA.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
                upHalf.setPipeline(this.pipelines.blur); upHalf.setBindGroup(0, this.postBindGroups.quarterToHalf); upHalf.draw(3); upHalf.end();
            }
        } else {
            const clearBloom = encoder.beginRenderPass({ colorAttachments: [{ view: this.bloomTextureA.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]});
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
        this.turbulence = Number.isFinite(options.turbulence) ? options.turbulence : this.turbulence;
        this.bloomEnabled = options.bloomEnabled !== undefined ? options.bloomEnabled : this.bloomEnabled;
        this.style = ['premium-hybrid', 'realistic', 'stylized-neon'].includes(options.style) ? options.style : this.style;
        this.glowScale = Number.isFinite(options.glowScale) ? Math.max(0.25, Math.min(1.8, options.glowScale)) : this.glowScale;
        this.bloomLevels = !this.bloomEnabled ? 0 : this.trailSamples <= 3 ? 1 : this.trailSamples <= 5 ? 2 : 3;
        this.smokeScale = this.style === 'realistic' ? 1 : this.style === 'stylized-neon' ? 0.15 : 0.45;
    }

    getMetrics() { return { ...this.metrics }; }

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
        this._destroyResources();
        try { this.context?.unconfigure(); } catch (_) {}
        this.context = null;
        this.device = null;
        this.adapter = null;
    }

    _computeShader() {
        return `
struct Particle {
  position: vec2f, velocity: vec2f, color: vec4f,
  life: f32, maxLife: f32, size: f32, rotation: f32,
  angularVelocity: f32, gravity: f32, drag: f32, shape: u32,
  flags: u32, seed: u32, textureIndex: u32, alive: u32,
};
struct SpawnCommand {
  origin: vec2f, destination: vec2f, color: vec4f,
  count: u32, shape: u32, kind: u32, flags: u32,
  intensity: f32, duration: f32, textureIndex: u32, seed: u32,
  size: f32, gravity: f32, drag: f32, secondary: u32,
  pad: vec4f,
};
struct Counters { freeCount: atomic<u32>, activeCount: atomic<u32>, droppedCount: atomic<u32>, secondaryCount: atomic<u32> };
struct Uniforms {
  dt: f32, time: f32, width: f32, height: f32,
  trailSamples: u32, turbulence: f32, commandCount: u32, maxTrailSamples: u32,
  glowScale: f32, bloomLevels: u32, pad0: vec2u,
};
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> history: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> activeIndices: array<u32>;
@group(0) @binding(3) var<storage, read_write> freeIndices: array<u32>;
@group(0) @binding(4) var<storage, read_write> counters: Counters;
@group(0) @binding(5) var<storage, read> commands: array<SpawnCommand>;
@group(0) @binding(6) var<storage, read_write> coreIndirect: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> trailIndirect: array<atomic<u32>>;
@group(0) @binding(8) var<uniform> uniforms: Uniforms;
@group(0) @binding(9) var<storage, read_write> secondaryIndices: array<u32>;

fn hash(value: u32) -> f32 { var x = value; x = ((x >> 16u) ^ x) * 0x45d9f3bu; x = ((x >> 16u) ^ x) * 0x45d9f3bu; x = (x >> 16u) ^ x; return f32(x) / 4294967295.0; }
fn allocateParticle() -> u32 {
  loop {
    let available = atomicLoad(&counters.freeCount);
    if (available == 0u) { atomicAdd(&counters.droppedCount, 1u); return 0xffffffffu; }
    let claim = atomicCompareExchangeWeak(&counters.freeCount, available, available - 1u);
    if (claim.exchanged) { return freeIndices[available - 1u]; }
  }
  return 0xffffffffu;
}
fn releaseParticle(index: u32) { let slot = atomicAdd(&counters.freeCount, 1u); freeIndices[slot] = index; }
fn shapeVelocity(shape: u32, index: u32, count: u32, intensity: f32, seed: u32) -> vec2f {
  let t = f32(index) / max(1.0, f32(count));
  let jitter = (hash(seed + index * 17u) - 0.5) * 0.16;
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
@compute @workgroup_size(1) fn resetCounters() {
  atomicStore(&counters.activeCount, 0u); atomicStore(&counters.secondaryCount, 0u);
  atomicStore(&coreIndirect[0], 6u); atomicStore(&coreIndirect[1], 0u); atomicStore(&coreIndirect[2], 0u); atomicStore(&coreIndirect[3], 0u);
  atomicStore(&trailIndirect[0], 6u); atomicStore(&trailIndirect[1], 0u); atomicStore(&trailIndirect[2], 0u); atomicStore(&trailIndirect[3], 0u);
}
@compute @workgroup_size(64) fn spawnParticles(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.y >= uniforms.commandCount) { return; }
  let command = commands[gid.y]; if (gid.x >= command.count) { return; }
  let slot = allocateParticle(); if (slot == 0xffffffffu) { return; }
  var p: Particle; p.position = command.origin; p.color = command.color; p.life = 0.0; p.maxLife = command.duration;
  p.rotation = hash(command.seed + gid.x * 13u) * 6.2831853; p.angularVelocity = (hash(command.seed + gid.x * 29u)-0.5)*4.0;
  p.gravity = command.gravity; p.drag = command.drag; p.shape = command.shape; p.flags = command.flags; p.seed = command.seed + gid.x;
  p.textureIndex = command.textureIndex; p.alive = 1u; p.size = command.size;
  if (command.kind == 1u) {
    p.velocity = (command.destination-command.origin) / command.duration;
    p.gravity = 0.0; p.drag = 1.0; p.shape = select(8u, 6u, command.textureIndex > 0u);
    p.rotation = atan2(p.velocity.y, p.velocity.x);
    p.angularVelocity = command.pad.y;
  } else {
    p.velocity = shapeVelocity(command.shape, gid.x, command.count, command.intensity, command.seed);
    p.velocity.x += command.pad.x;
    let role = (command.flags >> 8u) & 15u;
    if (command.shape == 0u && role == 3u) {
      p.position += p.velocity * (0.035 + hash(command.seed + gid.x * 37u) * 0.035);
      p.size *= 0.62 + hash(command.seed + gid.x * 43u) * 0.78;
      p.rotation = atan2(p.velocity.y, p.velocity.x);
      p.angularVelocity = 0.0;
    } else if (command.shape == 0u && role == 2u) {
      p.velocity *= 0.05;
    } else if (command.shape == 7u) {
      if (role == 8u) {
        p.position += p.velocity * (0.025 + hash(command.seed + gid.x * 47u) * 0.08);
        p.size *= 0.72 + hash(command.seed + gid.x * 61u) * 0.48;
      }
      p.rotation = atan2(p.velocity.y, p.velocity.x);
      p.angularVelocity = 0.0;
    } else if (command.shape == 2u) {
      p.position += p.velocity * (0.22 + hash(command.seed + gid.x * 41u) * 0.08);
      p.size *= 0.82 + hash(command.seed + gid.x * 53u) * 0.36;
    } else if (command.shape == 5u) {
      p.position += p.velocity * 0.1;
    }
  }
  particles[slot] = p;
  for (var sample = 0u; sample < uniforms.maxTrailSamples; sample++) { history[slot * uniforms.maxTrailSamples + sample] = command.origin; }
}
@compute @workgroup_size(64) fn updateParticles(@builtin(global_invocation_id) gid: vec3u) {
  let index = gid.x; if (index >= arrayLength(&particles)) { return; }
  var p = particles[index]; if (p.alive == 0u) { return; }
  let previousLife = p.life;
  p.life += uniforms.dt;
  if (p.life >= p.maxLife) { p.alive = 0u; particles[index] = p; releaseParticle(index); return; }
  let role = (p.flags >> 8u) & 15u;
  if (role == 1u || role == 2u) {
    let progress = clamp(p.life / p.maxLife, 0.0, 1.0);
    let curveVelocity = p.angularVelocity * 3.1415926 / p.maxLife * cos(progress * 3.1415926);
    p.position += vec2f(p.velocity.x + curveVelocity, p.velocity.y) * uniforms.dt;
    p.rotation = atan2(p.velocity.y, p.velocity.x + curveVelocity);
  } else {
    let noise = vec2f(hash(p.seed + u32(uniforms.time*59.0))-0.5, hash(p.seed + u32(uniforms.time*83.0))-0.5) * uniforms.turbulence * 60.0;
    p.velocity += vec2f(noise.x, p.gravity + noise.y) * uniforms.dt;
    p.velocity *= pow(p.drag, uniforms.dt * 60.0);
    p.position += p.velocity * uniforms.dt;
    p.rotation += p.angularVelocity * uniforms.dt;
  }
  if ((p.flags & 2u) != 0u && (p.flags & 4u) == 0u && previousLife < p.maxLife * 0.55 && p.life >= p.maxLife * 0.55) {
    let secondary = atomicAdd(&counters.secondaryCount, 1u);
    secondaryIndices[secondary] = index;
    p.flags = p.flags | 4u;
  }
  let historyBase = index * uniforms.maxTrailSamples;
  for (var sample = uniforms.trailSamples - 1u; sample > 0u; sample--) { history[historyBase + sample] = history[historyBase + sample - 1u]; }
  history[historyBase] = p.position;
  particles[index] = p;
  let activeSlot = atomicAdd(&counters.activeCount, 1u); activeIndices[activeSlot] = index;
  atomicAdd(&coreIndirect[1], 1u); atomicAdd(&trailIndirect[1], max(1u, uniforms.trailSamples - 1u));
}
@compute @workgroup_size(64) fn spawnSecondary(@builtin(global_invocation_id) gid: vec3u) {
  let sourceNumber = gid.x;
  let sourceCount = atomicLoad(&counters.secondaryCount);
  if (sourceNumber >= sourceCount) { return; }
  let source = particles[secondaryIndices[sourceNumber]];
  let childCount = select(3u, 2u, source.shape == 5u);
  for (var child = 0u; child < childCount; child++) {
    let slot = allocateParticle();
    if (slot == 0xffffffffu) { return; }
    var p = source;
    let angle = f32(child) / f32(childCount) * 6.2831853 + hash(source.seed + child * 31u);
    p.position = source.position;
    p.velocity = source.velocity * 0.18 + vec2f(cos(angle), sin(angle)) * (90.0 + hash(source.seed + child) * 90.0);
    p.life = 0.0;
    p.maxLife = source.maxLife * 0.42;
    p.size = source.size * 0.62;
    let styleBits = source.flags & (3u << 12u);
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
struct Particle { position: vec2f, velocity: vec2f, color: vec4f, life: f32, maxLife: f32, size: f32, rotation: f32, angularVelocity: f32, gravity: f32, drag: f32, shape: u32, flags: u32, seed: u32, textureIndex: u32, alive: u32 };
struct Uniforms {
  dt: f32, time: f32, width: f32, height: f32,
  trailSamples: u32, turbulence: f32, commandCount: u32, maxTrailSamples: u32,
  glowScale: f32, bloomLevels: u32, pad0: vec2u,
};
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> activeIndices: array<u32>;
@group(0) @binding(2) var<storage, read> history: array<vec2f>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;
@group(0) @binding(4) var atlas: texture_2d<f32>;
@group(0) @binding(5) var atlasSampler: sampler;
struct Out {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(2) @interpolate(flat) shape: u32,
  @location(3) @interpolate(flat) textureIndex: u32,
  @location(4) fade: f32,
  @location(5) @interpolate(flat) flags: u32,
};
fn quadVertex(vertex: u32) -> vec2f { let vertices = array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1)); return vertices[vertex]; }
fn clip(position: vec2f) -> vec4f { return vec4f(position.x/uniforms.width*2.0-1.0, position.y/uniforms.height*2.0-1.0, 0.0, 1.0); }
@vertex fn coreVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Out {
  let p = particles[activeIndices[instance]]; let q = quadVertex(vertex); let c = cos(p.rotation); let s = sin(p.rotation);
  let role=(p.flags>>8u)&15u;let streak=(p.shape==0u&&role==3u)||p.shape==7u;
  let scaledQ=q*select(vec2f(1.0),vec2f(2.6,0.42),streak);
  let rotated = vec2f(c*scaledQ.x-s*scaledQ.y,s*scaledQ.x+c*scaledQ.y) * p.size;
  var out: Out; out.position=clip(p.position+rotated); out.uv=q*0.5+0.5; out.color=p.color; out.shape=p.shape; out.textureIndex=p.textureIndex; out.flags=p.flags;
  let normalizedLife=clamp(p.life/p.maxLife,0.0,1.0); out.fade=pow(1.0-normalizedLife,select(1.2,0.72,p.shape==9u)); return out;
}
@vertex fn trailVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Out {
  let segments=max(1u,uniforms.trailSamples-1u); let particleListIndex=instance/segments; let segment=instance%segments; let index=activeIndices[particleListIndex]; let p=particles[index]; let base=index*uniforms.maxTrailSamples;
  let a=history[base+segment]; let b=history[base+segment+1u]; let direction=normalize(a-b+vec2f(0.0001)); let normal=vec2f(-direction.y,direction.x); let q=quadVertex(vertex);
  let along=mix(b,a,q.x*0.5+0.5); let width=p.size*(0.38-f32(segment)/f32(segments)*0.29);
  var out:Out; out.position=clip(along+normal*q.y*width); out.uv=q*0.5+0.5; out.color=p.color; out.shape=p.shape; out.textureIndex=0u; out.flags=p.flags;
  let shapeTrail=select(0.42,0.12,p.shape>=1u&&p.shape<=5u); out.fade=(1.0-f32(segment)/f32(segments))*clamp(1.0-p.life/p.maxLife,0.0,1.0)*shapeTrail; return out;
}
fn sdCircle(p:vec2f)->f32{return length(p-0.5)-0.42;}
fn sdHeart(p0:vec2f)->f32{let p=(p0*2.0-1.0)*vec2f(1.08,-1.0);let x=p.x;let y=p.y-0.18;let a=x*x+y*y-0.58;return (a*a*a-x*x*y*y*y)*0.72;}
fn sdStar(p0:vec2f)->f32{
  var p=(p0*2.0-1.0)*1.08; let k1=vec2f(0.809016994,-0.587785252); let k2=vec2f(-k1.x,k1.y);
  p.x=abs(p.x); p-=2.0*max(dot(k1,p),0.0)*k1; p-=2.0*max(dot(k2,p),0.0)*k2; p.x=abs(p.x); p.y-=0.82;
  let ba=0.42*vec2f(-k1.y,k1.x)-vec2f(0.0,1.0); let h=clamp(dot(p,ba)/dot(ba,ba),0.0,0.82);
  return length(p-ba*h)*sign(p.y*ba.x-p.x*ba.y);
}
fn sdRing(p0:vec2f)->f32{return abs(length(p0-0.5)-0.315)-0.072;}
fn sdSpiral(p0:vec2f)->f32{let p=p0-0.5;let a=atan2(p.y,p.x)+3.1415926;let r=length(p);let first=abs(r-(0.035+0.047*a));let second=abs(r-(0.035+0.047*(a+6.2831853)));return min(first,second)-0.028;}
fn shapeDistance(uv:vec2f,shape:u32)->f32{if(shape==1u){return sdHeart(uv);}if(shape==3u){return sdStar(uv);}if(shape==4u){return sdRing(uv);}if(shape==5u){return sdSpiral(uv);}return sdCircle(uv);}
fn rocketCoverage(uv:vec2f,time:f32)->vec2f{
  let p=uv*2.0-1.0;let aa=0.035;
  let body=(1.0-smoothstep(0.15,0.22,abs(p.y)))*(1.0-smoothstep(0.43,0.53,abs(p.x+0.06)));
  let noseWidth=max(0.0,(0.9-p.x)*0.42);let nose=step(0.36,p.x)*step(p.x,0.9)*(1.0-smoothstep(noseWidth,noseWidth+aa,abs(p.y)));
  let finBand=smoothstep(0.16,0.25,abs(p.y))*(1.0-smoothstep(0.43,0.52,abs(p.y)));let fins=step(-0.58,p.x)*step(p.x,-0.16)*finBand;
  let flameStart=-0.94-0.06*sin(time*31.0+p.y*17.0);let flameWidth=max(0.0,(p.x-flameStart)*0.31);let flame=step(flameStart,p.x)*step(p.x,-0.48)*(1.0-smoothstep(flameWidth,flameWidth+0.08,abs(p.y)));
  return vec2f(max(body,max(nose,fins)),flame);
}
fn atlasSample(uv:vec2f,index:u32)->vec4f{let slot=f32(max(1u,index)-1u);let slots=8.0;let cell=vec2f(fract(slot/slots),floor(slot/slots)/slots);return textureSampleLevel(atlas,atlasSampler,cell+uv/slots,0.0);}
@fragment fn particleFragment(in:Out)->@location(0) vec4f {
  let baseDistance=shapeDistance(in.uv,in.shape);let aa=max(0.004,fwidth(baseDistance)*0.82);
  if(in.shape==2u||in.shape==6u){let tex=atlasSample(in.uv,select(1u,in.textureIndex,in.shape==6u));let alpha=tex.a*in.fade*in.color.a;if(in.shape==6u&&(in.flags&1u)!=0u){return vec4f(tex.rgb*alpha,alpha);}return vec4f(in.color.rgb*alpha,alpha);}
  if(in.shape==8u){let parts=rocketCoverage(in.uv,uniforms.time);let role=(in.flags>>8u)&15u;let bodyColor=select(in.color.rgb,vec3f(1.0,0.96,0.78),role==2u);let flameColor=mix(vec3f(1.0,0.18,0.02),vec3f(1.0,0.95,0.55),smoothstep(-1.0,-0.45,in.uv.x*2.0-1.0));let coverage=max(parts.x,parts.y);let rgb=mix(bodyColor,flameColor,parts.y*(1.0-parts.x));let alpha=coverage*in.fade*in.color.a;return vec4f(rgb*alpha,alpha);}
  let d=baseDistance;var coverage=1.0-smoothstep(-aa,aa,d);
  if(in.shape==7u){let p=abs(in.uv-0.5);coverage=1.0-smoothstep(0.18,0.42,min(max(p.x,p.y)*0.8,p.x+p.y));}
  if(in.shape==9u){coverage=pow(1.0-smoothstep(0.05,0.5,length(in.uv-0.5)),1.8)*0.34;}
  let alpha=coverage*in.fade*in.color.a;var rgb=in.color.rgb;
  if(in.shape==0u||in.shape==7u||in.shape==8u){let heat=pow(max(0.0,1.0-length(in.uv-0.5)*2.0),3.0);rgb=mix(rgb,vec3f(1.0,0.94,0.72),heat*0.88);}
  return vec4f(rgb*alpha,alpha);
}
@fragment fn glowFragment(in:Out)->@location(0) vec4f {
  var coverage=0.0;if(in.shape==2u||in.shape==6u){coverage=atlasSample(in.uv,select(1u,in.textureIndex,in.shape==6u)).a;}else if(in.shape==8u){let parts=rocketCoverage(in.uv,uniforms.time);coverage=max(parts.x*0.75,parts.y);}else{let d=shapeDistance(in.uv,in.shape);coverage=exp(-max(0.0,d)*10.0)*(1.0-smoothstep(0.12,0.62,length(in.uv-0.5)));}
  let alpha=coverage*in.fade*in.color.a*0.2*uniforms.glowScale;return vec4f(in.color.rgb*alpha,alpha);
}
@fragment fn trailFragment(in:Out)->@location(0) vec4f {if((in.shape>=1u&&in.shape<=6u)||in.shape==9u){discard;}let edge=1.0-smoothstep(0.1,0.5,abs(in.uv.y-0.5));let alpha=edge*in.fade*in.color.a;return vec4f(in.color.rgb*alpha,alpha);}
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
@vertex fn fullscreenVertex(@builtin(vertex_index) index:u32)->Out{let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var out:Out;out.position=vec4f(p[index],0,1);out.uv=p[index]*0.5+0.5;return out;}
@fragment fn brightExtract(in:Out)->@location(0) vec4f{let color=textureSample(firstTexture,linearSampler,in.uv);let light=max(color.r,max(color.g,color.b));let weight=smoothstep(0.35,1.0,light);return vec4f(color.rgb*weight,color.a*weight);}
@fragment fn kawaseBlur(in:Out)->@location(0) vec4f{let dim=vec2f(textureDimensions(firstTexture));let px=1.5/dim;var color=textureSample(firstTexture,linearSampler,in.uv)*0.2;color+=textureSample(firstTexture,linearSampler,in.uv+vec2f(px.x,px.y))*0.2;color+=textureSample(firstTexture,linearSampler,in.uv+vec2f(-px.x,px.y))*0.2;color+=textureSample(firstTexture,linearSampler,in.uv+vec2f(px.x,-px.y))*0.2;color+=textureSample(firstTexture,linearSampler,in.uv-vec2f(px.x,px.y))*0.2;return color;}
@fragment fn composite(in:Out)->@location(0) vec4f{let scene=textureSample(firstTexture,linearSampler,in.uv);let bloom=textureSample(secondTexture,linearSampler,in.uv);let bloomStrength=0.58+uniforms.glowScale*0.3;let bloomAlpha=clamp(max(bloom.r,max(bloom.g,bloom.b))*0.52*uniforms.glowScale,0.0,0.82);let alpha=clamp(max(scene.a,bloomAlpha),0.0,1.0);let rgb=min(vec3f(alpha),scene.rgb+bloom.rgb*bloomStrength);return vec4f(rgb,alpha);}
`;
    }
}

if (typeof window !== 'undefined') window.WebGPUParticleEngine = WebGPUParticleEngine;
if (typeof module !== 'undefined' && module.exports) module.exports = WebGPUParticleEngine;
