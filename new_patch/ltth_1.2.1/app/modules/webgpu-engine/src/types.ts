/// <reference types="@webgpu/types" />

/**
 * WebGPU Engine Types
 *
 * Central type definitions for the LTTH WebGPU Engine.
 * Provides strict typing for all engine components.
 */

// ============================================================================
// Resource Types
// ============================================================================

/**
 * Reference-counted handle for GPU resources
 */
export interface ResourceHandle<T> {
  readonly id: string;
  readonly resource: T;
  readonly refCount: number;
  addRef(): void;
  release(): void;
  isDisposed(): boolean;
}

/**
 * Buffer creation options
 */
export interface BufferOptions {
  readonly size: number;
  readonly usage: GPUBufferUsageFlags;
  readonly mappedAtCreation?: boolean;
  readonly label?: string;
}

/**
 * Texture creation options
 */
export interface TextureOptions {
  readonly width: number;
  readonly height: number;
  readonly format: GPUTextureFormat;
  readonly usage: GPUTextureUsageFlags;
  readonly mipLevelCount?: number;
  readonly sampleCount?: number;
  readonly label?: string;
}

/**
 * Sampler creation options
 */
export interface SamplerOptions {
  readonly addressModeU?: GPUAddressMode;
  readonly addressModeV?: GPUAddressMode;
  readonly addressModeW?: GPUAddressMode;
  readonly magFilter?: GPUFilterMode;
  readonly minFilter?: GPUFilterMode;
  readonly mipmapFilter?: GPUMipmapFilterMode;
  readonly lodMinClamp?: number;
  readonly lodMaxClamp?: number;
  readonly compare?: GPUCompareFunction;
  readonly maxAnisotropy?: number;
  readonly label?: string;
}

/**
 * Buffer handle with reference counting
 */
export interface BufferHandle extends ResourceHandle<GPUBuffer> {
  readonly size: number;
  readonly usage: GPUBufferUsageFlags;
  write(data: ArrayBufferView, offset?: number): void;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
}

/**
 * Texture handle with reference counting
 */
export interface TextureHandle extends ResourceHandle<GPUTexture> {
  readonly width: number;
  readonly height: number;
  readonly format: GPUTextureFormat;
  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
}

/**
 * Sampler handle with reference counting
 */
export interface SamplerHandle extends ResourceHandle<GPUSampler> {
  readonly descriptor: SamplerOptions;
}

// ============================================================================
// Pipeline Types
// ============================================================================

/**
 * Shader compilation error information
 */
export interface ShaderCompilationError {
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly code: string;
}

/**
 * Shader compilation result
 */
export interface ShaderCompilationResult {
  readonly success: boolean;
  readonly module: GPUShaderModule | null;
  readonly errors: ShaderCompilationError[];
}

/**
 * Vertex attribute descriptor
 */
export interface VertexAttributeDescriptor {
  readonly format: GPUVertexFormat;
  readonly offset: number;
  readonly shaderLocation: number;
}

/**
 * Vertex buffer layout descriptor
 */
export interface VertexBufferLayoutDescriptor {
  readonly arrayStride: number;
  readonly stepMode?: GPUVertexStepMode;
  readonly attributes: VertexAttributeDescriptor[];
}

/**
 * Pipeline descriptor for creating render pipelines
 */
export interface PipelineDescriptor {
  readonly id: string;
  readonly vertexShader: string;
  readonly fragmentShader: string;
  readonly vertexBufferLayouts: VertexBufferLayoutDescriptor[];
  readonly bindGroupLayouts?: GPUBindGroupLayoutDescriptor[];
  readonly colorTargetStates: GPUColorTargetState[];
  readonly depthStencilState?: GPUDepthStencilState;
  readonly primitiveState?: GPUPrimitiveState;
  readonly multisample?: GPUMultisampleState;
  readonly label?: string;
}

/**
 * Pipeline handle with reference counting
 */
export interface PipelineHandle {
  readonly id: string;
  readonly pipeline: GPURenderPipeline;
  readonly bindGroupLayouts: GPUBindGroupLayout[];
  readonly refCount: number;
  addRef(): void;
  release(): void;
  isDisposed(): boolean;
}

/**
 * Bind group creation options
 */
export interface BindGroupOptions {
  readonly layout: GPUBindGroupLayout;
  readonly entries: GPUBindGroupEntry[];
  readonly label?: string;
}

// ============================================================================
// Render Graph Types
// ============================================================================

/**
 * Render pass color attachment descriptor
 */
export interface RenderPassColorAttachment {
  readonly view: GPUTextureView | 'screen';
  readonly resolveTarget?: GPUTextureView;
  readonly clearValue?: GPUColor;
  readonly loadOp: GPULoadOp;
  readonly storeOp: GPUStoreOp;
}

/**
 * Render pass depth/stencil attachment descriptor
 */
export interface RenderPassDepthStencilAttachment {
  readonly view: GPUTextureView;
  readonly depthClearValue?: number;
  readonly depthLoadOp?: GPULoadOp;
  readonly depthStoreOp?: GPUStoreOp;
  readonly depthReadOnly?: boolean;
  readonly stencilClearValue?: number;
  readonly stencilLoadOp?: GPULoadOp;
  readonly stencilStoreOp?: GPUStoreOp;
  readonly stencilReadOnly?: boolean;
}

/**
 * Render pass descriptor
 */
export interface RenderPassDescriptor {
  readonly id: string;
  readonly colorAttachments: RenderPassColorAttachment[];
  readonly depthStencilAttachment?: RenderPassDepthStencilAttachment;
  readonly timestampWrites?: GPURenderPassTimestampWrites;
  readonly label?: string;
}

/**
 * Render graph node representing a render pass
 */
export interface RenderGraphNode {
  readonly id: string;
  readonly passDescriptor: RenderPassDescriptor;
  readonly dependencies: string[];
  readonly execute: (encoder: RenderPassEncoderFacade, context: PluginRenderContext) => void;
}

/**
 * Render graph configuration
 */
export interface RenderGraph {
  readonly id: string;
  readonly nodes: RenderGraphNode[];
}

// ============================================================================
// Command Encoder Types
// ============================================================================

/**
 * Render pass encoder facade for safe GPU command encoding
 */
export interface RenderPassEncoderFacade {
  setPipeline(pipeline: PipelineHandle): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup, dynamicOffsets?: number[]): void;
  setVertexBuffer(slot: number, buffer: BufferHandle, offset?: number, size?: number): void;
  setIndexBuffer(buffer: BufferHandle, format: GPUIndexFormat, offset?: number, size?: number): void;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): void;
  setViewport(x: number, y: number, width: number, height: number, minDepth: number, maxDepth: number): void;
  setScissorRect(x: number, y: number, width: number, height: number): void;
  pushDebugGroup(groupLabel: string): void;
  popDebugGroup(): void;
  insertDebugMarker(markerLabel: string): void;
}

/**
 * Command encoder facade for safe GPU command encoding
 */
export interface CommandEncoderFacade {
  beginRenderPass(descriptor: GPURenderPassDescriptor): RenderPassEncoderFacade;
  copyBufferToBuffer(
    source: BufferHandle,
    sourceOffset: number,
    destination: BufferHandle,
    destinationOffset: number,
    size: number
  ): void;
  copyBufferToTexture(
    source: GPUTexelCopyBufferLayout & { buffer: BufferHandle },
    destination: GPUTexelCopyTextureInfo,
    copySize: GPUExtent3DStrict
  ): void;
  copyTextureToBuffer(
    source: GPUTexelCopyTextureInfo,
    destination: GPUTexelCopyBufferLayout & { buffer: BufferHandle },
    copySize: GPUExtent3DStrict
  ): void;
  copyTextureToTexture(
    source: GPUTexelCopyTextureInfo,
    destination: GPUTexelCopyTextureInfo,
    copySize: GPUExtent3DStrict
  ): void;
  finish(): GPUCommandBuffer;
  pushDebugGroup(groupLabel: string): void;
  popDebugGroup(): void;
  insertDebugMarker(markerLabel: string): void;
}

// ============================================================================
// Surface Types
// ============================================================================

/**
 * Surface handle representing a canvas render target
 */
export interface SurfaceHandle {
  readonly id: string;
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly context: GPUCanvasContext;
  readonly format: GPUTextureFormat;
  readonly width: number;
  readonly height: number;
  getCurrentTexture(): GPUTexture;
  resize(width: number, height: number): void;
  dispose(): void;
}

// ============================================================================
// Engine Types
// ============================================================================

/**
 * Engine creation options
 */
export interface EngineOptions {
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  readonly preferHighPerformance?: boolean;
  readonly powerPreference?: GPUPowerPreference;
  readonly requiredFeatures?: GPUFeatureName[];
  readonly requiredLimits?: Record<string, number>;
  readonly logger?: EngineLogger;
}

/**
 * Engine adapter information
 */
export interface AdapterInfo {
  readonly vendor: string;
  readonly architecture: string;
  readonly device: string;
  readonly description: string;
  readonly features: GPUFeatureName[];
  readonly limits: GPUSupportedLimits;
}

/**
 * Engine metrics for performance monitoring
 */
export interface EngineMetrics {
  readonly frameTime: number;
  readonly deltaTime: number;
  readonly fps: number;
  readonly drawCalls: number;
  readonly pipelineCount: number;
  readonly bufferCount: number;
  readonly textureCount: number;
  readonly totalMemoryUsage: number;
  readonly frameCount: number;
}

/**
 * Engine context for internal use
 */
export interface EngineContext {
  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
  readonly queue: GPUQueue;
  readonly adapterInfo: AdapterInfo;
  readonly preferredFormat: GPUTextureFormat;
}

/**
 * Engine facade - main public API for plugins
 * Plugins receive this facade instead of raw GPU handles
 */
export interface EngineFacade {
  // Surface management
  createSurface(canvas: HTMLCanvasElement | OffscreenCanvas): SurfaceHandle;

  // Resource creation
  createBuffer(options: BufferOptions): BufferHandle;
  createTexture(options: TextureOptions): TextureHandle;
  createTextureFromImage(image: ImageBitmap | HTMLImageElement | HTMLCanvasElement, options?: Partial<TextureOptions>): Promise<TextureHandle>;
  createTextureFromBlob(blob: Blob, options?: Partial<TextureOptions>): Promise<TextureHandle>;
  createSampler(options?: SamplerOptions): SamplerHandle;

  // Pipeline creation
  createPipeline(descriptor: PipelineDescriptor): Promise<PipelineHandle>;
  createBindGroup(options: BindGroupOptions): GPUBindGroup;
  createBindGroupFromLayout(pipelineHandle: PipelineHandle, groupIndex: number, entries: GPUBindGroupEntry[]): GPUBindGroup;

  // Render graph
  registerRenderGraph(graph: RenderGraph): void;
  unregisterRenderGraph(graphId: string): void;

  // Encoding and submission
  encodePass(fn: (encoder: CommandEncoderFacade) => void): void;
  submit(): void;

  // Render loop control
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  isRunning(): boolean;

  // Frame timing
  getTime(): number;
  getDeltaTime(): number;
  getFrameCount(): number;

  // Metrics
  getMetrics(): EngineMetrics;

  // Capability checks
  isWebGPUSupported(): boolean;
  getAdapterInfo(): AdapterInfo;
  getPreferredFormat(): GPUTextureFormat;

  // Cleanup
  dispose(): void;
}

// ============================================================================
// Plugin Integration Types
// ============================================================================

/**
 * Plugin render context passed to plugin callbacks
 */
export interface PluginRenderContext {
  readonly pluginId: string;
  readonly time: number;
  readonly deltaTime: number;
  readonly frameCount: number;
  readonly surface: SurfaceHandle | null;
  readonly engine: EngineFacade;
  readonly encoder: CommandEncoderFacade | null;
}

/**
 * Plugin renderer registration options
 */
export interface PluginRendererOptions {
  readonly wantsSurface: boolean;
  readonly preferredCanvasSelector?: string;
  readonly fixedTimeStep?: number;
  readonly maxDeltaTime?: number;
  readonly defaultCanvasWidth?: number;
  readonly defaultCanvasHeight?: number;
}

/**
 * Plugin renderer lifecycle handlers
 */
export interface PluginRendererHandlers {
  onInit(context: PluginRenderContext): Promise<void> | void;
  onFrame(context: PluginRenderContext): void;
  onHotReload(context: PluginRenderContext): Promise<void> | void;
  onDispose(context: PluginRenderContext): Promise<void> | void;
  onResize?(context: PluginRenderContext, width: number, height: number): void;
  onError?(context: PluginRenderContext, error: Error): void;
}

/**
 * Plugin registration result
 */
export interface PluginRegistration {
  readonly pluginId: string;
  readonly isActive: boolean;
  unregister(): void;
}

// ============================================================================
// Hot Reload Types
// ============================================================================

/**
 * Hot reload manager interface
 */
export interface HotReloadManager {
  registerPlugin(pluginId: string): void;
  unregisterPlugin(pluginId: string): void;
  invalidatePlugin(pluginId: string): void;
  getLeakReport(): LeakReport;
  clearLeakReport(): void;
}

/**
 * Resource leak information
 */
export interface LeakInfo {
  readonly resourceType: 'buffer' | 'texture' | 'sampler' | 'pipeline';
  readonly resourceId: string;
  readonly refCount: number;
  readonly pluginId: string;
  readonly createdAt: number;
}

/**
 * Leak detection report
 */
export interface LeakReport {
  readonly pluginId: string;
  readonly leaks: LeakInfo[];
  readonly totalLeakCount: number;
  readonly hasLeaks: boolean;
}

// ============================================================================
// Logger Types
// ============================================================================

/**
 * Log level type
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Logger interface for engine
 */
export interface EngineLogger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * WebGPU engine error codes
 */
export enum EngineErrorCode {
  WEBGPU_NOT_SUPPORTED = 'WEBGPU_NOT_SUPPORTED',
  ADAPTER_REQUEST_FAILED = 'ADAPTER_REQUEST_FAILED',
  DEVICE_REQUEST_FAILED = 'DEVICE_REQUEST_FAILED',
  DEVICE_LOST = 'DEVICE_LOST',
  SHADER_COMPILATION_FAILED = 'SHADER_COMPILATION_FAILED',
  PIPELINE_CREATION_FAILED = 'PIPELINE_CREATION_FAILED',
  RESOURCE_CREATION_FAILED = 'RESOURCE_CREATION_FAILED',
  SURFACE_CREATION_FAILED = 'SURFACE_CREATION_FAILED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  OUT_OF_MEMORY = 'OUT_OF_MEMORY',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * WebGPU engine error
 */
export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
    public readonly cause?: Error
  ) {
    super(`[${code}] ${message}`);
    this.name = 'EngineError';
  }
}

// ============================================================================
// Fallback Types
// ============================================================================

/**
 * WebGPU capability report
 */
export interface WebGPUCapabilityReport {
  readonly isSupported: boolean;
  readonly reason?: string;
  readonly adapterInfo?: AdapterInfo;
  readonly missingFeatures?: string[];
}

/**
 * Fallback mode
 */
export enum FallbackMode {
  NONE = 'none',
  SHADER_VALIDATION_ONLY = 'shader_validation_only',
  CANVAS_2D = 'canvas_2d'
}
