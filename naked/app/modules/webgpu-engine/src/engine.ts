/**
 * WebGPU Engine
 *
 * Core engine implementation with initialization, render loop,
 * device management, and error handling.
 */

import {
  EngineOptions,
  EngineContext,
  EngineFacade,
  EngineMetrics,
  AdapterInfo,
  SurfaceHandle,
  BufferOptions,
  BufferHandle,
  TextureOptions,
  TextureHandle,
  SamplerOptions,
  SamplerHandle,
  PipelineDescriptor,
  PipelineHandle,
  BindGroupOptions,
  CommandEncoderFacade,
  RenderGraph,
  EngineLogger,
  EngineError,
  EngineErrorCode,
  WebGPUCapabilityReport,
  FallbackMode
} from './types';
import { createNoOpLogger } from './logger';
import { ResourceManager } from './resourceManager';
import { PipelineRegistry } from './pipelineRegistry';
import { RenderGraphExecutor } from './renderGraph';
import { HotReloadManagerImpl, createHotReloadManager } from './hotReloadManager';

/**
 * Surface handle implementation
 */
class SurfaceHandleImpl implements SurfaceHandle {
  private _currentTexture: GPUTexture | null = null;

  constructor(
    public readonly id: string,
    public readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    public readonly context: GPUCanvasContext,
    public readonly format: GPUTextureFormat,
    private _width: number,
    private _height: number,
    private readonly device: GPUDevice
  ) {}

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  getCurrentTexture(): GPUTexture {
    this._currentTexture = this.context.getCurrentTexture();
    return this._currentTexture;
  }

  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;

    if (this.canvas instanceof HTMLCanvasElement) {
      this.canvas.width = width;
      this.canvas.height = height;
    } else {
      // OffscreenCanvas
      (this.canvas as OffscreenCanvas).width = width;
      (this.canvas as OffscreenCanvas).height = height;
    }

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied'
    });
  }

  dispose(): void {
    this.context.unconfigure();
  }
}

/**
 * WebGPU Engine implementation
 */
class WebGPUEngine implements EngineFacade {
  private readonly context: EngineContext;
  private readonly logger: EngineLogger;
  private readonly resourceManager: ResourceManager;
  private readonly pipelineRegistry: PipelineRegistry;
  private readonly renderGraphExecutor: RenderGraphExecutor;
  private readonly hotReloadManager: HotReloadManagerImpl;

  private readonly surfaces: Map<string, SurfaceHandle> = new Map();
  private primarySurface: SurfaceHandle | null = null;

  private isDisposed: boolean = false;
  private running: boolean = false;
  private paused: boolean = false;
  private animationFrameId: number | null = null;

  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  private deltaTime: number = 0;
  private startTime: number = 0;
  private totalTime: number = 0;

  private drawCallCount: number = 0;
  private pendingCommandBuffers: GPUCommandBuffer[] = [];

  constructor(context: EngineContext, logger?: EngineLogger) {
    this.context = context;
    this.logger = logger || createNoOpLogger();

    this.resourceManager = new ResourceManager(
      context.device,
      context.queue,
      this.logger
    );

    this.pipelineRegistry = new PipelineRegistry(
      context.device,
      this.logger
    );

    this.renderGraphExecutor = new RenderGraphExecutor(this.logger);

    this.hotReloadManager = createHotReloadManager(
      this.resourceManager,
      this.pipelineRegistry,
      this.logger
    ) as HotReloadManagerImpl;

    // Set up device lost handler
    this.context.device.lost.then(info => {
      this.handleDeviceLost(info);
    });

    this.logger.info('WebGPU Engine initialized');
  }

  // ============================================================================
  // Surface Management
  // ============================================================================

  createSurface(canvas: HTMLCanvasElement | OffscreenCanvas): SurfaceHandle {
    this.ensureNotDisposed();

    try {
      const context = canvas.getContext('webgpu');
      if (!context) {
        throw new EngineError(
          EngineErrorCode.SURFACE_CREATION_FAILED,
          'Failed to get WebGPU context from canvas'
        );
      }

      const format = this.context.preferredFormat;
      context.configure({
        device: this.context.device,
        format,
        alphaMode: 'premultiplied'
      });

      const id = `surface_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const surface = new SurfaceHandleImpl(
        id,
        canvas,
        context,
        format,
        canvas.width,
        canvas.height,
        this.context.device
      );

      this.surfaces.set(id, surface);

      if (!this.primarySurface) {
        this.primarySurface = surface;
      }

      this.logger.debug(`Created surface: ${id} (${canvas.width}x${canvas.height})`);
      return surface;
    } catch (error) {
      if (error instanceof EngineError) {
        throw error;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      throw new EngineError(
        EngineErrorCode.SURFACE_CREATION_FAILED,
        `Failed to create surface: ${err.message}`,
        err
      );
    }
  }

  // ============================================================================
  // Resource Creation
  // ============================================================================

  createBuffer(options: BufferOptions): BufferHandle {
    this.ensureNotDisposed();
    return this.resourceManager.createBuffer(options);
  }

  createTexture(options: TextureOptions): TextureHandle {
    this.ensureNotDisposed();
    return this.resourceManager.createTexture(options);
  }

  async createTextureFromImage(
    image: ImageBitmap | HTMLImageElement | HTMLCanvasElement,
    options?: Partial<TextureOptions>
  ): Promise<TextureHandle> {
    this.ensureNotDisposed();
    return this.resourceManager.createTextureFromImage(image, options);
  }

  async createTextureFromBlob(
    blob: Blob,
    options?: Partial<TextureOptions>
  ): Promise<TextureHandle> {
    this.ensureNotDisposed();
    return this.resourceManager.createTextureFromBlob(blob, options);
  }

  createSampler(options?: SamplerOptions): SamplerHandle {
    this.ensureNotDisposed();
    return this.resourceManager.createSampler(options);
  }

  // ============================================================================
  // Pipeline Creation
  // ============================================================================

  async createPipeline(descriptor: PipelineDescriptor): Promise<PipelineHandle> {
    this.ensureNotDisposed();
    return this.pipelineRegistry.createPipeline(descriptor);
  }

  createBindGroup(options: BindGroupOptions): GPUBindGroup {
    this.ensureNotDisposed();
    return this.pipelineRegistry.createBindGroup(options);
  }

  createBindGroupFromLayout(
    pipelineHandle: PipelineHandle,
    groupIndex: number,
    entries: GPUBindGroupEntry[]
  ): GPUBindGroup {
    this.ensureNotDisposed();
    return this.pipelineRegistry.createBindGroupFromLayout(
      pipelineHandle,
      groupIndex,
      entries
    );
  }

  // ============================================================================
  // Render Graph
  // ============================================================================

  registerRenderGraph(graph: RenderGraph): void {
    this.ensureNotDisposed();
    this.renderGraphExecutor.registerGraph(graph);
  }

  unregisterRenderGraph(graphId: string): void {
    this.ensureNotDisposed();
    this.renderGraphExecutor.unregisterGraph(graphId);
  }

  // ============================================================================
  // Encoding and Submission
  // ============================================================================

  encodePass(fn: (encoder: CommandEncoderFacade) => void): void {
    this.ensureNotDisposed();

    const commandEncoder = this.context.device.createCommandEncoder();
    const facade = this.createCommandEncoderFacade(commandEncoder);

    try {
      fn(facade);
      const commandBuffer = commandEncoder.finish();
      this.pendingCommandBuffers.push(commandBuffer);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new EngineError(
        EngineErrorCode.INTERNAL_ERROR,
        `Error during pass encoding: ${err.message}`,
        err
      );
    }
  }

  submit(): void {
    this.ensureNotDisposed();

    if (this.pendingCommandBuffers.length > 0) {
      this.context.queue.submit(this.pendingCommandBuffers);
      this.pendingCommandBuffers = [];
    }
  }

  // ============================================================================
  // Render Loop Control
  // ============================================================================

  start(): void {
    this.ensureNotDisposed();

    if (this.running) {
      return;
    }

    this.running = true;
    this.paused = false;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.frameCount = 0;

    this.logger.info('Render loop started');
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
    this.paused = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.logger.info('Render loop stopped');
  }

  pause(): void {
    if (this.running && !this.paused) {
      this.paused = true;
      this.logger.info('Render loop paused');
    }
  }

  resume(): void {
    if (this.running && this.paused) {
      this.paused = false;
      this.lastFrameTime = performance.now();
      this.logger.info('Render loop resumed');
      this.scheduleFrame();
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  isRunning(): boolean {
    return this.running;
  }

  // ============================================================================
  // Frame Timing
  // ============================================================================

  getTime(): number {
    return this.totalTime;
  }

  getDeltaTime(): number {
    return this.deltaTime;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  getMetrics(): EngineMetrics {
    return {
      frameTime: this.deltaTime * 1000,
      deltaTime: this.deltaTime,
      fps: this.deltaTime > 0 ? 1 / this.deltaTime : 0,
      drawCalls: this.drawCallCount,
      pipelineCount: this.pipelineRegistry.getPipelineCount(),
      bufferCount: this.resourceManager.getBufferCount(),
      textureCount: this.resourceManager.getTextureCount(),
      totalMemoryUsage: this.resourceManager.getEstimatedMemoryUsage(),
      frameCount: this.frameCount
    };
  }

  // ============================================================================
  // Capability Checks
  // ============================================================================

  isWebGPUSupported(): boolean {
    return true; // If engine is created, WebGPU is supported
  }

  getAdapterInfo(): AdapterInfo {
    return this.context.adapterInfo;
  }

  getPreferredFormat(): GPUTextureFormat {
    return this.context.preferredFormat;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.stop();

    // Dispose surfaces
    for (const surface of this.surfaces.values()) {
      surface.dispose();
    }
    this.surfaces.clear();
    this.primarySurface = null;

    // Dispose managers
    this.hotReloadManager.dispose();
    this.renderGraphExecutor.dispose();
    this.pipelineRegistry.dispose();
    this.resourceManager.dispose();

    // Destroy device
    this.context.device.destroy();

    this.isDisposed = true;
    this.logger.info('WebGPU Engine disposed');
  }

  // ============================================================================
  // Plugin Integration Helpers
  // ============================================================================

  /**
   * Set the current plugin ID for resource tracking
   */
  setCurrentPluginId(pluginId: string): void {
    this.resourceManager.setCurrentPluginId(pluginId);
    this.pipelineRegistry.setCurrentPluginId(pluginId);
  }

  /**
   * Get the hot reload manager
   */
  getHotReloadManager(): HotReloadManagerImpl {
    return this.hotReloadManager;
  }

  /**
   * Get the primary surface
   */
  getPrimarySurface(): SurfaceHandle | null {
    return this.primarySurface;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new EngineError(
        EngineErrorCode.INTERNAL_ERROR,
        'Engine has been disposed'
      );
    }
  }

  private scheduleFrame(): void {
    if (!this.running || this.paused) {
      return;
    }

    this.animationFrameId = requestAnimationFrame((timestamp) => {
      this.onFrame(timestamp);
    });
  }

  private onFrame(timestamp: number): void {
    if (!this.running || this.paused || this.isDisposed) {
      return;
    }

    // Calculate timing
    this.deltaTime = (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;
    this.totalTime = (timestamp - this.startTime) / 1000;
    this.frameCount++;

    // Reset per-frame counters
    this.drawCallCount = 0;

    // Submit any pending commands
    this.submit();

    // Schedule next frame
    this.scheduleFrame();
  }

  private handleDeviceLost(info: GPUDeviceLostInfo): void {
    this.logger.error(`GPU device lost: ${info.reason} - ${info.message}`);

    // Stop the render loop
    this.stop();

    // Mark as disposed to prevent further operations
    this.isDisposed = true;
  }

  private createCommandEncoderFacade(encoder: GPUCommandEncoder): CommandEncoderFacade {
    const self = this;

    return {
      beginRenderPass(descriptor: GPURenderPassDescriptor) {
        const pass = encoder.beginRenderPass(descriptor);
        return self.createRenderPassEncoderFacade(pass);
      },
      copyBufferToBuffer(source, sourceOffset, destination, destinationOffset, size) {
        encoder.copyBufferToBuffer(
          source.resource,
          sourceOffset,
          destination.resource,
          destinationOffset,
          size
        );
      },
      copyBufferToTexture(source, destination, copySize) {
        encoder.copyBufferToTexture(
          { ...source, buffer: source.buffer.resource },
          destination,
          copySize
        );
      },
      copyTextureToBuffer(source, destination, copySize) {
        encoder.copyTextureToBuffer(
          source,
          { ...destination, buffer: destination.buffer.resource },
          copySize
        );
      },
      copyTextureToTexture(source, destination, copySize) {
        encoder.copyTextureToTexture(source, destination, copySize);
      },
      finish() {
        return encoder.finish();
      },
      pushDebugGroup(groupLabel) {
        encoder.pushDebugGroup(groupLabel);
      },
      popDebugGroup() {
        encoder.popDebugGroup();
      },
      insertDebugMarker(markerLabel) {
        encoder.insertDebugMarker(markerLabel);
      }
    };
  }

  private createRenderPassEncoderFacade(pass: GPURenderPassEncoder) {
    const self = this;

    return {
      setPipeline(pipeline: PipelineHandle) {
        pass.setPipeline(pipeline.pipeline);
      },
      setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets?: number[]) {
        if (dynamicOffsets) {
          pass.setBindGroup(index, bindGroup, dynamicOffsets);
        } else {
          pass.setBindGroup(index, bindGroup);
        }
      },
      setVertexBuffer(slot: number, buffer: BufferHandle, offset?: number, size?: number) {
        pass.setVertexBuffer(slot, buffer.resource, offset, size);
      },
      setIndexBuffer(buffer: BufferHandle, format: GPUIndexFormat, offset?: number, size?: number) {
        pass.setIndexBuffer(buffer.resource, format, offset, size);
      },
      draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number) {
        pass.draw(vertexCount, instanceCount, firstVertex, firstInstance);
        self.drawCallCount++;
      },
      drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number) {
        pass.drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance);
        self.drawCallCount++;
      },
      setViewport(x: number, y: number, width: number, height: number, minDepth: number, maxDepth: number) {
        pass.setViewport(x, y, width, height, minDepth, maxDepth);
      },
      setScissorRect(x: number, y: number, width: number, height: number) {
        pass.setScissorRect(x, y, width, height);
      },
      pushDebugGroup(groupLabel: string) {
        pass.pushDebugGroup(groupLabel);
      },
      popDebugGroup() {
        pass.popDebugGroup();
      },
      insertDebugMarker(markerLabel: string) {
        pass.insertDebugMarker(markerLabel);
      }
    };
  }
}

// ============================================================================
// Engine Factory Functions
// ============================================================================

/**
 * Check WebGPU capabilities
 */
export async function checkWebGPUCapabilities(): Promise<WebGPUCapabilityReport> {
  // Check for navigator.gpu
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return {
      isSupported: false,
      reason: 'WebGPU is not supported in this browser or environment'
    };
  }

  try {
    // Request adapter
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return {
        isSupported: false,
        reason: 'Failed to request WebGPU adapter'
      };
    }

    // Get adapter info (if available - newer spec)
    let adapterInfo: AdapterInfo;
    if ('requestAdapterInfo' in adapter && typeof (adapter as any).requestAdapterInfo === 'function') {
      const info = await (adapter as any).requestAdapterInfo();
      adapterInfo = {
        vendor: info.vendor || 'unknown',
        architecture: info.architecture || 'unknown',
        device: info.device || 'unknown',
        description: info.description || 'unknown',
        features: Array.from(adapter.features) as GPUFeatureName[],
        limits: adapter.limits
      };
    } else {
      // Fallback for older implementations
      adapterInfo = {
        vendor: 'unknown',
        architecture: 'unknown',
        device: 'unknown',
        description: 'WebGPU Adapter',
        features: Array.from(adapter.features) as GPUFeatureName[],
        limits: adapter.limits
      };
    }

    return {
      isSupported: true,
      adapterInfo
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      isSupported: false,
      reason: `WebGPU capability check failed: ${err.message}`
    };
  }
}

/**
 * Create a WebGPU engine instance
 */
export async function createEngine(options: EngineOptions = {}): Promise<EngineFacade> {
  // Check WebGPU support
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    throw new EngineError(
      EngineErrorCode.WEBGPU_NOT_SUPPORTED,
      'WebGPU is not supported in this browser or environment'
    );
  }

  // Request adapter
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: options.powerPreference ||
      (options.preferHighPerformance ? 'high-performance' : 'low-power')
  });

  if (!adapter) {
    throw new EngineError(
      EngineErrorCode.ADAPTER_REQUEST_FAILED,
      'Failed to request WebGPU adapter'
    );
  }

  // Get adapter info (if available - newer spec)
  let adapterInfo: AdapterInfo;
  if ('requestAdapterInfo' in adapter && typeof (adapter as any).requestAdapterInfo === 'function') {
    const adapterInfoRaw = await (adapter as any).requestAdapterInfo();
    adapterInfo = {
      vendor: adapterInfoRaw.vendor || 'unknown',
      architecture: adapterInfoRaw.architecture || 'unknown',
      device: adapterInfoRaw.device || 'unknown',
      description: adapterInfoRaw.description || 'unknown',
      features: Array.from(adapter.features) as GPUFeatureName[],
      limits: adapter.limits
    };
  } else {
    // Fallback for older implementations
    adapterInfo = {
      vendor: 'unknown',
      architecture: 'unknown',
      device: 'unknown',
      description: 'WebGPU Adapter',
      features: Array.from(adapter.features) as GPUFeatureName[],
      limits: adapter.limits
    };
  }

  // Request device
  const device = await adapter.requestDevice({
    requiredFeatures: options.requiredFeatures,
    requiredLimits: options.requiredLimits
  });

  if (!device) {
    throw new EngineError(
      EngineErrorCode.DEVICE_REQUEST_FAILED,
      'Failed to request WebGPU device'
    );
  }

  // Get preferred format
  const preferredFormat = navigator.gpu.getPreferredCanvasFormat();

  // Create engine context
  const context: EngineContext = {
    adapter,
    device,
    queue: device.queue,
    adapterInfo,
    preferredFormat
  };

  // Create logger - use provided logger or no-op logger in production
  // Console logger is only used when explicitly requested
  const logger = options.logger || createNoOpLogger();

  // Create and return engine
  const engine = new WebGPUEngine(context, logger);

  // Create surface if canvas provided
  if (options.canvas) {
    engine.createSurface(options.canvas);
  }

  return engine;
}

/**
 * Get the fallback mode based on environment
 */
export function getFallbackMode(): FallbackMode {
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    return FallbackMode.NONE;
  }

  // Check for OffscreenCanvas for potential shader validation
  if (typeof OffscreenCanvas !== 'undefined') {
    return FallbackMode.SHADER_VALIDATION_ONLY;
  }

  return FallbackMode.CANVAS_2D;
}
