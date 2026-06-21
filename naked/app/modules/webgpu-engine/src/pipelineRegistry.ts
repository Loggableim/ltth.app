/**
 * WebGPU Engine Pipeline Registry
 *
 * Pipeline creation, compilation, and management.
 * Handles WGSL shader compilation and bind group layout management.
 */

import {
  PipelineDescriptor,
  PipelineHandle,
  ShaderCompilationResult,
  ShaderCompilationError,
  BindGroupOptions,
  EngineLogger,
  EngineError,
  EngineErrorCode
} from './types';
import { createNoOpLogger } from './logger';

/**
 * Generate unique pipeline ID
 */
function generatePipelineId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Internal pipeline handle implementation
 */
class PipelineHandleImpl implements PipelineHandle {
  private _refCount: number = 1;
  private _disposed: boolean = false;
  private readonly _pluginId: string;
  private readonly _createdAt: number;
  private readonly _onDispose: (handle: PipelineHandleImpl) => void;

  constructor(
    public readonly id: string,
    public readonly pipeline: GPURenderPipeline,
    public readonly bindGroupLayouts: GPUBindGroupLayout[],
    pluginId: string,
    onDispose: (handle: PipelineHandleImpl) => void
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
        `Cannot add reference to disposed pipeline: ${this.id}`
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
      // Pipelines don't have a destroy method, just remove from tracking
      this._onDispose(this);
    }
  }

  isDisposed(): boolean {
    return this._disposed;
  }
}

/**
 * Parse shader compilation errors from GPUCompilationInfo
 */
function parseCompilationErrors(
  compilationInfo: GPUCompilationInfo,
  shaderCode: string
): ShaderCompilationError[] {
  const errors: ShaderCompilationError[] = [];

  for (const message of compilationInfo.messages) {
    if (message.type === 'error') {
      const lines = shaderCode.split('\n');
      const lineNumber = message.lineNum || 0;
      const lineContent = lineNumber > 0 && lineNumber <= lines.length
        ? lines[lineNumber - 1]
        : '';

      errors.push({
        message: message.message,
        line: lineNumber,
        column: message.linePos || 0,
        code: lineContent
      });
    }
  }

  return errors;
}

/**
 * Pipeline registry for creating and managing render pipelines
 */
export class PipelineRegistry {
  private readonly device: GPUDevice;
  private readonly logger: EngineLogger;

  private readonly pipelines: Map<string, PipelineHandleImpl> = new Map();
  private readonly shaderModuleCache: Map<string, GPUShaderModule> = new Map();

  private currentPluginId: string = 'engine';

  constructor(device: GPUDevice, logger?: EngineLogger) {
    this.device = device;
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
   * Compile a WGSL shader module
   */
  async compileShader(code: string, label?: string): Promise<ShaderCompilationResult> {
    try {
      const module = this.device.createShaderModule({
        code,
        label
      });

      // Get compilation info to check for errors
      const compilationInfo = await module.getCompilationInfo();
      const errors = parseCompilationErrors(compilationInfo, code);

      if (errors.length > 0) {
        return {
          success: false,
          module: null,
          errors
        };
      }

      return {
        success: true,
        module,
        errors: []
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        module: null,
        errors: [{
          message: err.message,
          line: 0,
          column: 0,
          code: ''
        }]
      };
    }
  }

  /**
   * Get or create a cached shader module
   */
  private async getOrCreateShaderModule(code: string, label?: string): Promise<GPUShaderModule> {
    const cacheKey = `${code}_${label || ''}`;

    if (this.shaderModuleCache.has(cacheKey)) {
      return this.shaderModuleCache.get(cacheKey)!;
    }

    const result = await this.compileShader(code, label);

    if (!result.success || !result.module) {
      const errorMessages = result.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n');
      throw new EngineError(
        EngineErrorCode.SHADER_COMPILATION_FAILED,
        `Shader compilation failed:\n${errorMessages}`
      );
    }

    this.shaderModuleCache.set(cacheKey, result.module);
    return result.module;
  }

  /**
   * Create a render pipeline from a descriptor
   */
  async createPipeline(descriptor: PipelineDescriptor): Promise<PipelineHandle> {
    try {
      // Compile shaders
      const vertexModule = await this.getOrCreateShaderModule(
        descriptor.vertexShader,
        `${descriptor.label || descriptor.id}_vertex`
      );

      const fragmentModule = await this.getOrCreateShaderModule(
        descriptor.fragmentShader,
        `${descriptor.label || descriptor.id}_fragment`
      );

      // Create bind group layouts if provided
      const bindGroupLayouts: GPUBindGroupLayout[] = [];
      if (descriptor.bindGroupLayouts && descriptor.bindGroupLayouts.length > 0) {
        for (let i = 0; i < descriptor.bindGroupLayouts.length; i++) {
          const layout = this.device.createBindGroupLayout(descriptor.bindGroupLayouts[i]);
          bindGroupLayouts.push(layout);
        }
      }

      // Create pipeline layout
      const pipelineLayout = bindGroupLayouts.length > 0
        ? this.device.createPipelineLayout({ bindGroupLayouts })
        : 'auto';

      // Convert vertex buffer layouts
      const vertexBuffers: GPUVertexBufferLayout[] = descriptor.vertexBufferLayouts.map(layout => ({
        arrayStride: layout.arrayStride,
        stepMode: layout.stepMode || 'vertex',
        attributes: layout.attributes.map(attr => ({
          format: attr.format,
          offset: attr.offset,
          shaderLocation: attr.shaderLocation
        }))
      }));

      // Create render pipeline
      const pipeline = await this.device.createRenderPipelineAsync({
        layout: pipelineLayout,
        vertex: {
          module: vertexModule,
          entryPoint: 'main',
          buffers: vertexBuffers
        },
        fragment: {
          module: fragmentModule,
          entryPoint: 'main',
          targets: descriptor.colorTargetStates
        },
        primitive: descriptor.primitiveState || {
          topology: 'triangle-list',
          cullMode: 'back'
        },
        depthStencil: descriptor.depthStencilState,
        multisample: descriptor.multisample || { count: 1 },
        label: descriptor.label
      });

      // If using 'auto' layout, get the bind group layouts from the pipeline
      let finalBindGroupLayouts = bindGroupLayouts;
      if (pipelineLayout === 'auto') {
        // Try to get bind group layouts from the pipeline (up to 4 groups)
        finalBindGroupLayouts = [];
        for (let i = 0; i < 4; i++) {
          try {
            const layout = pipeline.getBindGroupLayout(i);
            finalBindGroupLayouts.push(layout);
          } catch {
            // No more bind groups
            break;
          }
        }
      }

      const id = descriptor.id || generatePipelineId('pipeline');
      const handle = new PipelineHandleImpl(
        id,
        pipeline,
        finalBindGroupLayouts,
        this.currentPluginId,
        (h) => this.onPipelineDisposed(h)
      );

      this.pipelines.set(id, handle);
      this.logger.debug(`Created pipeline: ${id} (plugin: ${this.currentPluginId})`);

      return handle;
    } catch (error) {
      if (error instanceof EngineError) {
        throw error;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      throw new EngineError(
        EngineErrorCode.PIPELINE_CREATION_FAILED,
        `Failed to create pipeline: ${err.message}`,
        err
      );
    }
  }

  /**
   * Create a bind group for a pipeline
   */
  createBindGroup(options: BindGroupOptions): GPUBindGroup {
    return this.device.createBindGroup({
      layout: options.layout,
      entries: options.entries,
      label: options.label
    });
  }

  /**
   * Create a bind group using a pipeline's bind group layout
   */
  createBindGroupFromLayout(
    pipelineHandle: PipelineHandle,
    groupIndex: number,
    entries: GPUBindGroupEntry[]
  ): GPUBindGroup {
    if (groupIndex < 0 || groupIndex >= pipelineHandle.bindGroupLayouts.length) {
      throw new EngineError(
        EngineErrorCode.VALIDATION_ERROR,
        `Invalid bind group index: ${groupIndex}. Pipeline has ${pipelineHandle.bindGroupLayouts.length} bind group layouts.`
      );
    }

    const layout = pipelineHandle.bindGroupLayouts[groupIndex];
    return this.device.createBindGroup({
      layout,
      entries
    });
  }

  /**
   * Get a pipeline by ID
   */
  getPipeline(id: string): PipelineHandle | undefined {
    return this.pipelines.get(id);
  }

  /**
   * Check if a pipeline exists
   */
  hasPipeline(id: string): boolean {
    return this.pipelines.has(id);
  }

  /**
   * Get pipeline count
   */
  getPipelineCount(): number {
    return this.pipelines.size;
  }

  /**
   * Get pipelines for a specific plugin
   */
  getPluginPipelines(pluginId: string): PipelineHandleImpl[] {
    return Array.from(this.pipelines.values()).filter(p => p.pluginId === pluginId);
  }

  /**
   * Release all pipelines for a specific plugin
   */
  releasePluginPipelines(pluginId: string): void {
    const pipelines = this.getPluginPipelines(pluginId);

    for (const pipeline of pipelines) {
      while (!pipeline.isDisposed() && pipeline.refCount > 0) {
        pipeline.release();
      }
    }

    this.logger.info(`Released all pipelines for plugin: ${pluginId}`);
  }

  /**
   * Clear the shader module cache
   */
  clearShaderCache(): void {
    this.shaderModuleCache.clear();
    this.logger.debug('Shader module cache cleared');
  }

  /**
   * Dispose all pipelines and clear cache
   */
  dispose(): void {
    this.pipelines.clear();
    this.shaderModuleCache.clear();
    this.logger.info('Pipeline registry disposed');
  }

  /**
   * Callback when a pipeline is disposed
   */
  private onPipelineDisposed(handle: PipelineHandleImpl): void {
    this.pipelines.delete(handle.id);
    this.logger.debug(`Disposed pipeline: ${handle.id}`);
  }
}
