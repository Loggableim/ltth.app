/**
 * WebGPU Engine Resource Manager
 *
 * Reference-counted GPU resource management with safe disposal.
 * Handles buffers, textures, and samplers with automatic cleanup.
 */

import {
  BufferOptions,
  BufferHandle,
  TextureOptions,
  TextureHandle,
  SamplerOptions,
  SamplerHandle,
  EngineLogger,
  EngineError,
  EngineErrorCode
} from './types';
import { createNoOpLogger } from './logger';

/**
 * Generate unique resource ID
 */
function generateResourceId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Internal buffer handle implementation
 */
class BufferHandleImpl implements BufferHandle {
  private _refCount: number = 1;
  private _disposed: boolean = false;
  private readonly _pluginId: string;
  private readonly _createdAt: number;
  private readonly _onDispose: (handle: BufferHandleImpl) => void;

  constructor(
    public readonly id: string,
    public readonly resource: GPUBuffer,
    public readonly size: number,
    public readonly usage: GPUBufferUsageFlags,
    private readonly queue: GPUQueue,
    pluginId: string,
    onDispose: (handle: BufferHandleImpl) => void
  ) {
    this._pluginId = pluginId;
    this._createdAt = Date.now();
    this._onDispose = onDispose;
  }

  get refCount(): number {
    return this._refCount;
  }

  get pluginId(): string {
    return this._pluginId;
  }

  get createdAt(): number {
    return this._createdAt;
  }

  addRef(): void {
    if (this._disposed) {
      throw new EngineError(
        EngineErrorCode.VALIDATION_ERROR,
        `Cannot add reference to disposed buffer: ${this.id}`
      );
    }
    this._refCount++;
  }

  release(): void {
    if (this._disposed) {
      return;
    }
    this._refCount--;
    if (this._refCount <= 0) {
      this._disposed = true;
      this.resource.destroy();
      this._onDispose(this);
    }
  }

  isDisposed(): boolean {
    return this._disposed;
  }

  write(data: ArrayBufferView, offset: number = 0): void {
    if (this._disposed) {
      throw new EngineError(
        EngineErrorCode.VALIDATION_ERROR,
        `Cannot write to disposed buffer: ${this.id}`
      );
    }
    this.queue.writeBuffer(this.resource, offset, data as GPUAllowSharedBufferSource);
  }

  getMappedRange(offset?: number, size?: number): ArrayBuffer {
    if (this._disposed) {
      throw new EngineError(
        EngineErrorCode.VALIDATION_ERROR,
        `Cannot get mapped range of disposed buffer: ${this.id}`
      );
    }
    return this.resource.getMappedRange(offset, size);
  }

  unmap(): void {
    if (this._disposed) {
      throw new EngineError(
        EngineErrorCode.VALIDATION_ERROR,
        `Cannot unmap disposed buffer: ${this.id}`
      );
    }
    this.resource.unmap();
  }
}

/**
 * Internal texture handle implementation
 */
class TextureHandleImpl implements TextureHandle {
  private _refCount: number = 1;
  private _disposed: boolean = false;
  private readonly _pluginId: string;
  private readonly _createdAt: number;
  private readonly _onDispose: (handle: TextureHandleImpl) => void;

  constructor(
    public readonly id: string,
    public readonly resource: GPUTexture,
    public readonly width: number,
    public readonly height: number,
    public readonly format: GPUTextureFormat,
    pluginId: string,
    onDispose: (handle: TextureHandleImpl) => void
  ) {
    this._pluginId = pluginId;
    this._createdAt = Date.now();
    this._onDispose = onDispose;
  }

  get refCount(): number {
    return this._refCount;
  }

  get pluginId(): string {
    return this._pluginId;
  }

  get createdAt(): number {
    return this._createdAt;
  }

  addRef(): void {
    if (this._disposed) {
      throw new EngineError(
        EngineErrorCode.VALIDATION_ERROR,
        `Cannot add reference to disposed texture: ${this.id}`
      );
    }
    this._refCount++;
  }

  release(): void {
    if (this._disposed) {
      return;
    }
    this._refCount--;
    if (this._refCount <= 0) {
      this._disposed = true;
      this.resource.destroy();
      this._onDispose(this);
    }
  }

  isDisposed(): boolean {
    return this._disposed;
  }

  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView {
    if (this._disposed) {
      throw new EngineError(
        EngineErrorCode.VALIDATION_ERROR,
        `Cannot create view of disposed texture: ${this.id}`
      );
    }
    return this.resource.createView(descriptor);
  }
}

/**
 * Internal sampler handle implementation
 */
class SamplerHandleImpl implements SamplerHandle {
  private _refCount: number = 1;
  private _disposed: boolean = false;
  private readonly _pluginId: string;
  private readonly _createdAt: number;
  private readonly _onDispose: (handle: SamplerHandleImpl) => void;

  constructor(
    public readonly id: string,
    public readonly resource: GPUSampler,
    public readonly descriptor: SamplerOptions,
    pluginId: string,
    onDispose: (handle: SamplerHandleImpl) => void
  ) {
    this._pluginId = pluginId;
    this._createdAt = Date.now();
    this._onDispose = onDispose;
  }

  get refCount(): number {
    return this._refCount;
  }

  get pluginId(): string {
    return this._pluginId;
  }

  get createdAt(): number {
    return this._createdAt;
  }

  addRef(): void {
    if (this._disposed) {
      throw new EngineError(
        EngineErrorCode.VALIDATION_ERROR,
        `Cannot add reference to disposed sampler: ${this.id}`
      );
    }
    this._refCount++;
  }

  release(): void {
    if (this._disposed) {
      return;
    }
    this._refCount--;
    if (this._refCount <= 0) {
      this._disposed = true;
      // Samplers don't have a destroy method, just remove from tracking
      this._onDispose(this);
    }
  }

  isDisposed(): boolean {
    return this._disposed;
  }
}

/**
 * Resource manager for GPU resources with reference counting
 */
export class ResourceManager {
  private readonly device: GPUDevice;
  private readonly queue: GPUQueue;
  private readonly logger: EngineLogger;

  private readonly buffers: Map<string, BufferHandleImpl> = new Map();
  private readonly textures: Map<string, TextureHandleImpl> = new Map();
  private readonly samplers: Map<string, SamplerHandleImpl> = new Map();

  private currentPluginId: string = 'engine';

  constructor(device: GPUDevice, queue: GPUQueue, logger?: EngineLogger) {
    this.device = device;
    this.queue = queue;
    this.logger = logger || createNoOpLogger();
  }

  /**
   * Set the current plugin ID for resource tracking
   */
  setCurrentPluginId(pluginId: string): void {
    this.currentPluginId = pluginId;
  }

  /**
   * Get the current plugin ID
   */
  getCurrentPluginId(): string {
    return this.currentPluginId;
  }

  /**
   * Create a GPU buffer with reference counting
   */
  createBuffer(options: BufferOptions): BufferHandle {
    try {
      const buffer = this.device.createBuffer({
        size: options.size,
        usage: options.usage,
        mappedAtCreation: options.mappedAtCreation || false,
        label: options.label
      });

      const id = generateResourceId('buffer');
      const handle = new BufferHandleImpl(
        id,
        buffer,
        options.size,
        options.usage,
        this.queue,
        this.currentPluginId,
        (h) => this.onBufferDisposed(h)
      );

      this.buffers.set(id, handle);
      this.logger.debug(`Created buffer: ${id} (size: ${options.size}, plugin: ${this.currentPluginId})`);

      return handle;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new EngineError(
        EngineErrorCode.RESOURCE_CREATION_FAILED,
        `Failed to create buffer: ${err.message}`,
        err
      );
    }
  }

  /**
   * Create a GPU texture with reference counting
   */
  createTexture(options: TextureOptions): TextureHandle {
    try {
      const texture = this.device.createTexture({
        size: {
          width: options.width,
          height: options.height,
          depthOrArrayLayers: 1
        },
        format: options.format,
        usage: options.usage,
        mipLevelCount: options.mipLevelCount || 1,
        sampleCount: options.sampleCount || 1,
        label: options.label
      });

      const id = generateResourceId('texture');
      const handle = new TextureHandleImpl(
        id,
        texture,
        options.width,
        options.height,
        options.format,
        this.currentPluginId,
        (h) => this.onTextureDisposed(h)
      );

      this.textures.set(id, handle);
      this.logger.debug(`Created texture: ${id} (${options.width}x${options.height}, plugin: ${this.currentPluginId})`);

      return handle;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new EngineError(
        EngineErrorCode.RESOURCE_CREATION_FAILED,
        `Failed to create texture: ${err.message}`,
        err
      );
    }
  }

  /**
   * Create a texture from an ImageBitmap or HTMLImageElement
   */
  async createTextureFromImage(
    image: ImageBitmap | HTMLImageElement | HTMLCanvasElement,
    options?: Partial<TextureOptions>
  ): Promise<TextureHandle> {
    try {
      const width = image.width;
      const height = image.height;
      const format = options?.format || 'rgba8unorm';
      const usage = options?.usage || (
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT
      );

      const texture = this.device.createTexture({
        size: { width, height, depthOrArrayLayers: 1 },
        format,
        usage,
        label: options?.label
      });

      // Copy image data to texture
      this.queue.copyExternalImageToTexture(
        { source: image },
        { texture },
        { width, height }
      );

      const id = generateResourceId('texture');
      const handle = new TextureHandleImpl(
        id,
        texture,
        width,
        height,
        format,
        this.currentPluginId,
        (h) => this.onTextureDisposed(h)
      );

      this.textures.set(id, handle);
      this.logger.debug(`Created texture from image: ${id} (${width}x${height}, plugin: ${this.currentPluginId})`);

      return handle;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new EngineError(
        EngineErrorCode.RESOURCE_CREATION_FAILED,
        `Failed to create texture from image: ${err.message}`,
        err
      );
    }
  }

  /**
   * Create a texture from a Blob
   */
  async createTextureFromBlob(
    blob: Blob,
    options?: Partial<TextureOptions>
  ): Promise<TextureHandle> {
    try {
      const imageBitmap = await createImageBitmap(blob);
      const handle = await this.createTextureFromImage(imageBitmap, options);
      imageBitmap.close();
      return handle;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new EngineError(
        EngineErrorCode.RESOURCE_CREATION_FAILED,
        `Failed to create texture from blob: ${err.message}`,
        err
      );
    }
  }

  /**
   * Create a GPU sampler with reference counting
   */
  createSampler(options?: SamplerOptions): SamplerHandle {
    try {
      const descriptor: GPUSamplerDescriptor = {
        addressModeU: options?.addressModeU || 'clamp-to-edge',
        addressModeV: options?.addressModeV || 'clamp-to-edge',
        addressModeW: options?.addressModeW || 'clamp-to-edge',
        magFilter: options?.magFilter || 'linear',
        minFilter: options?.minFilter || 'linear',
        mipmapFilter: options?.mipmapFilter || 'linear',
        lodMinClamp: options?.lodMinClamp || 0,
        lodMaxClamp: options?.lodMaxClamp || 32,
        compare: options?.compare,
        maxAnisotropy: options?.maxAnisotropy || 1,
        label: options?.label
      };

      const sampler = this.device.createSampler(descriptor);

      const id = generateResourceId('sampler');
      const handle = new SamplerHandleImpl(
        id,
        sampler,
        options || {},
        this.currentPluginId,
        (h) => this.onSamplerDisposed(h)
      );

      this.samplers.set(id, handle);
      this.logger.debug(`Created sampler: ${id} (plugin: ${this.currentPluginId})`);

      return handle;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new EngineError(
        EngineErrorCode.RESOURCE_CREATION_FAILED,
        `Failed to create sampler: ${err.message}`,
        err
      );
    }
  }

  /**
   * Get buffer count
   */
  getBufferCount(): number {
    return this.buffers.size;
  }

  /**
   * Get texture count
   */
  getTextureCount(): number {
    return this.textures.size;
  }

  /**
   * Get sampler count
   */
  getSamplerCount(): number {
    return this.samplers.size;
  }

  /**
   * Get total resource count
   */
  getTotalResourceCount(): number {
    return this.buffers.size + this.textures.size + this.samplers.size;
  }

  /**
   * Get estimated memory usage (rough estimate)
   */
  getEstimatedMemoryUsage(): number {
    let total = 0;

    for (const buffer of this.buffers.values()) {
      total += buffer.size;
    }

    for (const texture of this.textures.values()) {
      // Estimate 4 bytes per pixel for RGBA
      const bytesPerPixel = 4;
      total += texture.width * texture.height * bytesPerPixel;
    }

    return total;
  }

  /**
   * Get resources for a specific plugin
   */
  getPluginResources(pluginId: string): {
    buffers: BufferHandleImpl[];
    textures: TextureHandleImpl[];
    samplers: SamplerHandleImpl[];
  } {
    return {
      buffers: Array.from(this.buffers.values()).filter(b => b.pluginId === pluginId),
      textures: Array.from(this.textures.values()).filter(t => t.pluginId === pluginId),
      samplers: Array.from(this.samplers.values()).filter(s => s.pluginId === pluginId)
    };
  }

  /**
   * Release all resources for a specific plugin
   */
  releasePluginResources(pluginId: string): void {
    const resources = this.getPluginResources(pluginId);

    for (const buffer of resources.buffers) {
      while (!buffer.isDisposed() && buffer.refCount > 0) {
        buffer.release();
      }
    }

    for (const texture of resources.textures) {
      while (!texture.isDisposed() && texture.refCount > 0) {
        texture.release();
      }
    }

    for (const sampler of resources.samplers) {
      while (!sampler.isDisposed() && sampler.refCount > 0) {
        sampler.release();
      }
    }

    this.logger.info(`Released all resources for plugin: ${pluginId}`);
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    for (const buffer of this.buffers.values()) {
      if (!buffer.isDisposed()) {
        buffer.resource.destroy();
      }
    }
    this.buffers.clear();

    for (const texture of this.textures.values()) {
      if (!texture.isDisposed()) {
        texture.resource.destroy();
      }
    }
    this.textures.clear();

    this.samplers.clear();

    this.logger.info('Resource manager disposed');
  }

  /**
   * Callback when a buffer is disposed
   */
  private onBufferDisposed(handle: BufferHandleImpl): void {
    this.buffers.delete(handle.id);
    this.logger.debug(`Disposed buffer: ${handle.id}`);
  }

  /**
   * Callback when a texture is disposed
   */
  private onTextureDisposed(handle: TextureHandleImpl): void {
    this.textures.delete(handle.id);
    this.logger.debug(`Disposed texture: ${handle.id}`);
  }

  /**
   * Callback when a sampler is disposed
   */
  private onSamplerDisposed(handle: SamplerHandleImpl): void {
    this.samplers.delete(handle.id);
    this.logger.debug(`Disposed sampler: ${handle.id}`);
  }
}
