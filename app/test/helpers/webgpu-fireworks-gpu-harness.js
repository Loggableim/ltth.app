'use strict';

const WebGPUParticleEngine = require('../../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');

const OWNED_GLOBALS = [
  'GPUBufferUsage',
  'GPUTextureUsage',
  'GPUShaderStage',
  'GPUMapMode',
  'OffscreenCanvas'
];

const GPU_GLOBAL_VALUES = Object.freeze({
  GPUBufferUsage: Object.freeze({
    MAP_READ: 1,
    MAP_WRITE: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
    INDEX: 16,
    VERTEX: 32,
    UNIFORM: 64,
    STORAGE: 128,
    INDIRECT: 256,
    QUERY_RESOLVE: 512
  }),
  GPUTextureUsage: Object.freeze({
    COPY_SRC: 1,
    COPY_DST: 2,
    TEXTURE_BINDING: 4,
    STORAGE_BINDING: 8,
    RENDER_ATTACHMENT: 16
  }),
  GPUShaderStage: Object.freeze({
    VERTEX: 1,
    FRAGMENT: 2,
    COMPUTE: 4
  }),
  GPUMapMode: Object.freeze({
    READ: 1,
    WRITE: 2
  })
});

let installedGlobals = null;

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class FakeOffscreenCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.context2d = {
      fillStyle: '',
      clearRect() {},
      beginPath() {},
      ellipse() {},
      arc() {},
      fill() {},
      drawImage() {},
      save() {},
      rect() {},
      clip() {},
      restore() {}
    };
  }

  getContext(type) {
    return type === '2d' ? this.context2d : null;
  }
}

function installGpuGlobals(gpu) {
  if (!installedGlobals) {
    const descriptors = new Map();
    for (const name of OWNED_GLOBALS) {
      descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    }

    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const navigatorObject = globalThis.navigator;
    const navigatorGpuDescriptor = navigatorObject
      ? Object.getOwnPropertyDescriptor(navigatorObject, 'gpu')
      : undefined;
    installedGlobals = {
      descriptors,
      navigatorDescriptor,
      navigatorObject,
      navigatorGpuDescriptor,
      createdNavigator: !navigatorObject
    };
  }

  for (const [name, value] of Object.entries({
    ...GPU_GLOBAL_VALUES,
    OffscreenCanvas: FakeOffscreenCanvas
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  }

  if (!globalThis.navigator) {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: {}
    });
  }
  Object.defineProperty(globalThis.navigator, 'gpu', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: gpu
  });
}

function restoreGpuGlobals() {
  if (!installedGlobals) return;
  const snapshot = installedGlobals;
  installedGlobals = null;

  for (const name of OWNED_GLOBALS) {
    const descriptor = snapshot.descriptors.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }

  if (snapshot.createdNavigator) {
    if (snapshot.navigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', snapshot.navigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
    return;
  }

  if (globalThis.navigator !== snapshot.navigatorObject && snapshot.navigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', snapshot.navigatorDescriptor);
  }
  if (snapshot.navigatorGpuDescriptor) {
    Object.defineProperty(snapshot.navigatorObject, 'gpu', snapshot.navigatorGpuDescriptor);
  } else {
    delete snapshot.navigatorObject.gpu;
  }
}

function cloneWriteData(data) {
  if (data instanceof ArrayBuffer) return data.slice(0);
  if (ArrayBuffer.isView(data)) return data.slice ? data.slice(0) : new data.constructor(data);
  return data;
}

function pipelineInspectionNames(pipeline) {
  const descriptor = pipeline && pipeline.descriptor ? pipeline.descriptor : {};
  if (descriptor.label) return [descriptor.label];
  return [
    descriptor.compute?.entryPoint,
    descriptor.vertex?.entryPoint,
    descriptor.fragment?.entryPoint
  ].filter(Boolean);
}

function passSemanticName(pass) {
  const descriptorLabel = String(pass.descriptor?.label || '').toLowerCase();
  const pipelineNames = pass.pipelines.flatMap(pipelineInspectionNames);
  const names = `${descriptorLabel} ${pipelineNames.join(' ')}`.toLowerCase();

  if (pass.type === 'compute' || names.includes('compute')) return 'compute';
  if (names.includes('composite')) return 'composite';
  if (names.includes('bloom-up') || names.includes('upsample') || names.includes('bloomcopy')) {
    return 'bloom-up';
  }
  if (names.includes('bloom-down') || names.includes('downsample') ||
      names.includes('brightextract') || names.includes('kawaseblur')) {
    return 'bloom-down';
  }
  if (names.includes('scene') || names.includes('particlefragment') ||
      names.includes('glowfragment') || names.includes('trailfragment')) {
    return 'scene';
  }
  return null;
}

function createFakeGpu(options = {}) {
  const allowedOptions = new Set(['timestampQuery', 'mapAsync', 'mapAsyncSequence']);
  const unknownOption = Object.keys(options).find(key => !allowedOptions.has(key));
  if (unknownOption) throw new Error(`unsupported fake GPU option: ${unknownOption}`);
  if (options.mapAsync && options.mapAsyncSequence) {
    throw new Error('mapAsync and mapAsyncSequence are mutually exclusive');
  }
  if (options.mapAsync !== undefined && typeof options.mapAsync !== 'function') {
    throw new TypeError('mapAsync must be a function');
  }
  if (options.mapAsyncSequence !== undefined && !Array.isArray(options.mapAsyncSequence)) {
    throw new TypeError('mapAsyncSequence must be an array');
  }
  if (options.timestampQuery !== undefined && typeof options.timestampQuery !== 'boolean') {
    throw new TypeError('timestampQuery must be a boolean');
  }

  const timestampQuery = options.timestampQuery === true;
  const features = new Set(timestampQuery ? ['timestamp-query'] : []);
  const devices = [];
  const buffers = [];
  const textures = [];
  const bindGroups = [];
  const commandEncoders = [];
  const submissions = [];
  const queueWrites = [];
  const shaderModules = [];
  const pipelines = [];
  const querySets = [];
  let mapSequenceIndex = 0;
  let nextBufferFailure = null;
  let currentFrameStart = null;
  let closedFrame = { submissions: [] };

  const invokeMapAsync = (buffer, args) => {
    if (options.mapAsync) return options.mapAsync(buffer, ...args);
    if (options.mapAsyncSequence) {
      if (mapSequenceIndex >= options.mapAsyncSequence.length) {
        return Promise.reject(new Error('fake mapAsync sequence exhausted'));
      }
      return options.mapAsyncSequence[mapSequenceIndex++];
    }
    return Promise.resolve();
  };

  const makeBuffer = descriptor => {
    const mappedRange = new ArrayBuffer(Math.max(4, Number(descriptor.size) || 4));
    const buffer = {
      ...descriptor,
      descriptor,
      mapCalls: 0,
      mapArguments: [],
      unmapCalls: 0,
      destroyed: false,
      mapAsync(...args) {
        this.mapCalls += 1;
        this.mapArguments.push(args);
        return invokeMapAsync(this, args);
      },
      getMappedRange() {
        return mappedRange;
      },
      setMappedUint32(values) {
        new Uint32Array(mappedRange).set(values);
      },
      unmap() {
        this.unmapCalls += 1;
      },
      destroy() {
        this.destroyed = true;
      }
    };
    buffers.push(buffer);
    return buffer;
  };

  const makeTexture = descriptor => {
    const texture = {
      ...descriptor,
      descriptor,
      destroyed: false,
      views: [],
      createView(viewDescriptor = {}) {
        const view = { texture: this, descriptor: viewDescriptor };
        this.views.push(view);
        return view;
      },
      destroy() {
        this.destroyed = true;
      }
    };
    textures.push(texture);
    return texture;
  };

  const createPass = (encoder, type, descriptor = {}) => {
    const pass = {
      type,
      descriptor,
      pipelines: [],
      bindGroups: [],
      operations: [],
      ended: false,
      setBindGroup(...args) {
        this.bindGroups.push(args);
        this.operations.push({ name: 'setBindGroup', args });
      },
      setPipeline(pipeline) {
        this.pipelines.push(pipeline);
        this.operations.push({ name: 'setPipeline', args: [pipeline] });
      },
      dispatchWorkgroups(...args) {
        this.operations.push({ name: 'dispatchWorkgroups', args });
      },
      dispatchWorkgroupsIndirect(...args) {
        this.operations.push({ name: 'dispatchWorkgroupsIndirect', args });
      },
      draw(...args) {
        this.operations.push({ name: 'draw', args });
      },
      drawIndirect(...args) {
        this.operations.push({ name: 'drawIndirect', args });
      },
      setVertexBuffer(...args) {
        this.operations.push({ name: 'setVertexBuffer', args });
      },
      setIndexBuffer(...args) {
        this.operations.push({ name: 'setIndexBuffer', args });
      },
      setViewport(...args) {
        this.operations.push({ name: 'setViewport', args });
      },
      setScissorRect(...args) {
        this.operations.push({ name: 'setScissorRect', args });
      },
      end() {
        if (this.ended) return;
        this.ended = true;
        encoder.events.push({ kind: 'pass-end', pass: this });
        const timestampWrites = descriptor.timestampWrites;
        if (timestampWrites && timestampWrites.endOfPassWriteIndex !== undefined) {
          encoder.events.push({
            kind: 'timestamp',
            querySet: timestampWrites.querySet,
            queryIndex: timestampWrites.endOfPassWriteIndex
          });
        }
      }
    };

    const timestampWrites = descriptor.timestampWrites;
    if (timestampWrites && timestampWrites.beginningOfPassWriteIndex !== undefined) {
      encoder.events.push({
        kind: 'timestamp',
        querySet: timestampWrites.querySet,
        queryIndex: timestampWrites.beginningOfPassWriteIndex
      });
    }
    encoder.events.push({ kind: 'pass-begin', pass });
    encoder.passes.push(pass);
    return pass;
  };

  const makeCommandEncoder = descriptor => {
    const encoder = {
      descriptor,
      passes: [],
      events: [],
      copies: [],
      queryResolves: [],
      finished: null,
      beginComputePass(passDescriptor = {}) {
        return createPass(this, 'compute', passDescriptor);
      },
      beginRenderPass(passDescriptor = {}) {
        return createPass(this, 'render', passDescriptor);
      },
      copyBufferToBuffer(...args) {
        this.copies.push({ name: 'copyBufferToBuffer', args });
        this.events.push({ kind: 'copyBufferToBuffer', args });
      },
      copyTextureToBuffer(...args) {
        this.copies.push({ name: 'copyTextureToBuffer', args });
        this.events.push({ kind: 'copyTextureToBuffer', args });
      },
      copyTextureToTexture(...args) {
        this.copies.push({ name: 'copyTextureToTexture', args });
        this.events.push({ kind: 'copyTextureToTexture', args });
      },
      writeTimestamp(querySet, queryIndex) {
        this.events.push({ kind: 'timestamp', querySet, queryIndex });
      },
      resolveQuerySet(querySet, firstQuery, queryCount, destination, destinationOffset) {
        const call = { querySet, firstQuery, queryCount, destination, destinationOffset };
        this.queryResolves.push(call);
        this.events.push({ kind: 'resolveQuerySet', call });
      },
      finish(finishDescriptor = {}) {
        if (!this.finished) {
          this.finished = {
            kind: 'command-buffer',
            descriptor: finishDescriptor,
            encoder: this
          };
        }
        return this.finished;
      }
    };
    commandEncoders.push(encoder);
    return encoder;
  };

  const createDevice = descriptor => {
    const lost = createDeferred();
    const queue = {
      submit(commandBuffers) {
        submissions.push(Array.from(commandBuffers));
      },
      writeBuffer(buffer, bufferOffset, data, dataOffset, size) {
        queueWrites.push({
          buffer,
          bufferOffset,
          data: cloneWriteData(data),
          dataOffset,
          size
        });
      },
      copyExternalImageToTexture(source, destination, copySize) {
        queueWrites.push({ kind: 'copyExternalImageToTexture', source, destination, copySize });
      },
      writeTexture(destination, data, dataLayout, size) {
        queueWrites.push({
          kind: 'writeTexture',
          destination,
          data: cloneWriteData(data),
          dataLayout,
          size
        });
      },
      onSubmittedWorkDone() {
        return Promise.resolve();
      }
    };
    const device = {
      descriptor,
      features: new Set(features),
      limits: {
        maxStorageBuffersPerShaderStage: 16,
        minStorageBufferOffsetAlignment: 256
      },
      queue,
      lost: lost.promise,
      addEventListener() {},
      createBuffer(bufferDescriptor) {
        if (nextBufferFailure) {
          const failure = nextBufferFailure;
          nextBufferFailure = null;
          throw failure;
        }
        return makeBuffer(bufferDescriptor);
      },
      createTexture: makeTexture,
      createSampler(samplerDescriptor = {}) {
        return { descriptor: samplerDescriptor };
      },
      createShaderModule(shaderDescriptor) {
        const module = {
          descriptor: shaderDescriptor,
          getCompilationInfo: () => Promise.resolve({ messages: [] })
        };
        shaderModules.push(module);
        return module;
      },
      createBindGroupLayout(layoutDescriptor) {
        return { descriptor: layoutDescriptor };
      },
      createPipelineLayout(layoutDescriptor) {
        return { descriptor: layoutDescriptor };
      },
      createComputePipelineAsync(pipelineDescriptor) {
        const pipeline = { type: 'compute', descriptor: pipelineDescriptor };
        pipelines.push(pipeline);
        return Promise.resolve(pipeline);
      },
      createRenderPipelineAsync(pipelineDescriptor) {
        const pipeline = { type: 'render', descriptor: pipelineDescriptor };
        pipelines.push(pipeline);
        return Promise.resolve(pipeline);
      },
      createRenderPipeline(pipelineDescriptor) {
        const pipeline = { type: 'render', descriptor: pipelineDescriptor };
        pipelines.push(pipeline);
        return pipeline;
      },
      createBindGroup(bindGroupDescriptor) {
        const bindGroup = { descriptor: bindGroupDescriptor };
        bindGroups.push(bindGroup);
        return bindGroup;
      },
      createQuerySet(queryDescriptor) {
        const querySet = {
          descriptor: queryDescriptor,
          destroyed: false,
          destroy() {
            this.destroyed = true;
          }
        };
        querySets.push(querySet);
        return querySet;
      },
      createCommandEncoder: makeCommandEncoder
    };
    Object.defineProperty(device, '_lostDeferred', { value: lost });
    devices.push(device);
    return device;
  };

  const adapter = {
    features: new Set(features),
    limits: { maxStorageBuffersPerShaderStage: 16 },
    info: {
      vendor: 'fake-vendor',
      architecture: 'fake-architecture',
      device: 'fake-device',
      description: 'deterministic fake GPU'
    },
    requestAdapterInfo() {
      return Promise.resolve(this.info);
    },
    requestDevice(descriptor = {}) {
      return Promise.resolve(createDevice(descriptor));
    }
  };

  const frameCommandBuffers = () => closedFrame.submissions.flat();
  const frameEncoders = () => frameCommandBuffers()
    .map(commandBuffer => commandBuffer?.encoder)
    .filter(Boolean);
  const framePasses = () => frameEncoders().flatMap(encoder => encoder.passes);
  const frameEvents = () => frameEncoders().flatMap(encoder => encoder.events);
  const timestampEvidence = () => {
    const events = frameEvents();
    const timestamps = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.kind === 'timestamp');
    const passBegins = events
      .map((event, index) => ({ event, index, semantic: event.kind === 'pass-begin' ? passSemanticName(event.pass) : null }))
      .filter(entry => entry.semantic);
    const passEnds = events
      .map((event, index) => ({ event, index, semantic: event.kind === 'pass-end' ? passSemanticName(event.pass) : null }))
      .filter(entry => entry.semantic);
    const firstCompute = passBegins.find(entry => entry.semantic === 'compute');
    const firstScene = passBegins.find(entry => entry.semantic === 'scene');
    const compositeEnds = passEnds.filter(entry => entry.semantic === 'composite');
    const finalComposite = compositeEnds[compositeEnds.length - 1];

    return timestamps.map(({ event, index }) => {
      let position = 'inside-frame';
      if (firstCompute && index <= firstCompute.index) position = 'before-first-compute';
      else if (!firstCompute && firstScene && index <= firstScene.index) position = 'before-scene';
      else if (finalComposite && index >= finalComposite.index) position = 'after-final-composite';
      return { queryIndex: event.queryIndex, position };
    });
  };

  const gpu = {
    adapter,
    devices,
    buffers,
    textures,
    bindGroups,
    commandEncoders,
    submissions,
    queueWrites,
    shaderModules,
    pipelines,
    requestAdapter() {
      return Promise.resolve(adapter);
    },
    getPreferredCanvasFormat() {
      return 'bgra8unorm';
    },
    loseDevice(deviceIndex, info = { reason: 'unknown', message: 'fake device loss' }) {
      const device = devices[deviceIndex];
      if (!device) throw new Error(`fake device ${deviceIndex} does not exist`);
      device._lostDeferred.resolve(info);
    },
    failNextBufferCreation(message) {
      nextBufferFailure = new Error(message);
    },
    bindGroupBuffers(bindGroup) {
      return (bindGroup?.descriptor?.entries || [])
        .map(entry => entry.resource?.buffer)
        .filter(Boolean);
    },
    latestQueueWriteFor(label) {
      for (let index = queueWrites.length - 1; index >= 0; index -= 1) {
        const write = queueWrites[index];
        if (write.buffer && String(write.buffer.label || '').includes(label)) return write;
      }
      return null;
    },
    framePassNames() {
      const names = framePasses().map(passSemanticName).filter(Boolean);
      return names.filter((name, index) => index === 0 || name !== names[index - 1]);
    },
    firstTimestamp() {
      return timestampEvidence()[0] || null;
    },
    lastTimestamp() {
      const evidence = timestampEvidence();
      return evidence[evidence.length - 1] || null;
    },
    resolveQueryCalls() {
      return frameEncoders().flatMap(encoder => encoder.queryResolves.map(call => ({
        firstQuery: call.firstQuery,
        queryCount: call.queryCount
      })));
    },
    texturesNamed(fragment) {
      return textures.filter(texture => String(texture.label || '').includes(fragment));
    },
    textureDescriptor(label) {
      return textures.find(texture => texture.label === label)?.descriptor || null;
    },
    shaderCode(label) {
      return shaderModules.find(module => module.descriptor.label === label)?.descriptor.code || null;
    },
    pipelineLabels() {
      return pipelines.flatMap(pipelineInspectionNames);
    }
  };

  Object.defineProperties(gpu, {
    _beginFrame: {
      value() {
        currentFrameStart = submissions.length;
      }
    },
    _endFrame: {
      value() {
        const start = currentFrameStart === null ? submissions.length : currentFrameStart;
        closedFrame = { submissions: submissions.slice(start) };
        currentFrameStart = null;
      }
    }
  });

  return gpu;
}

function makeRenderer(gpu, options = {}) {
  installGpuGlobals(gpu);
  const width = Math.max(1, Number(options.width) || 1920);
  const height = Math.max(1, Number(options.height) || 1080);
  const context = {
    descriptor: null,
    configured: false,
    configure(descriptor) {
      this.descriptor = descriptor;
      this.configured = true;
    },
    unconfigure() {
      this.configured = false;
    },
    getCurrentTexture() {
      return {
        descriptor: { label: 'fake-current-canvas-texture' },
        createView(viewDescriptor = {}) {
          return { texture: this, descriptor: viewDescriptor };
        }
      };
    }
  };
  const canvas = {
    width,
    height,
    getContext(type) {
      return type === 'webgpu' ? context : null;
    }
  };
  const renderer = new WebGPUParticleEngine(canvas, options);
  const render = renderer.render;
  renderer.render = function renderWithGpuRecorder(...args) {
    gpu._beginFrame();
    try {
      return render.apply(this, args);
    } finally {
      gpu._endFrame();
    }
  };
  return renderer;
}

async function waitForRecovery(renderer) {
  await Promise.resolve();
  const recoveryPromise = renderer.recoveryPromise;
  if (!recoveryPromise || typeof recoveryPromise.then !== 'function') {
    throw new Error('renderer.recoveryPromise is required');
  }
  await recoveryPromise;
}

module.exports = {
  createDeferred,
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
  waitForRecovery
};
