/**
 * WebGPU Engine - Main Entry Point
 *
 * Central, production-ready WebGPU engine for LTTH plugins.
 * Provides a shared service for GPU-accelerated rendering.
 */

// ============================================================================
// Type Exports
// ============================================================================

export {
  // Resource types
  ResourceHandle,
  BufferOptions,
  BufferHandle,
  TextureOptions,
  TextureHandle,
  SamplerOptions,
  SamplerHandle,

  // Pipeline types
  ShaderCompilationError,
  ShaderCompilationResult,
  VertexAttributeDescriptor,
  VertexBufferLayoutDescriptor,
  PipelineDescriptor,
  PipelineHandle,
  BindGroupOptions,

  // Render graph types
  RenderPassColorAttachment,
  RenderPassDepthStencilAttachment,
  RenderPassDescriptor,
  RenderGraphNode,
  RenderGraph,

  // Command encoder types
  RenderPassEncoderFacade,
  CommandEncoderFacade,

  // Surface types
  SurfaceHandle,

  // Engine types
  EngineOptions,
  AdapterInfo,
  EngineMetrics,
  EngineContext,
  EngineFacade,

  // Plugin types
  PluginRenderContext,
  PluginRendererOptions,
  PluginRendererHandlers,
  PluginRegistration,

  // Hot reload types
  HotReloadManager,
  LeakInfo,
  LeakReport,

  // Logger types
  LogLevel,
  EngineLogger,

  // Error types
  EngineErrorCode,
  EngineError,

  // Fallback types
  WebGPUCapabilityReport,
  FallbackMode
} from './types';

// ============================================================================
// Engine Exports
// ============================================================================

export {
  createEngine,
  checkWebGPUCapabilities,
  getFallbackMode
} from './engine';

// ============================================================================
// Logger Exports
// ============================================================================

export {
  createEngineLogger,
  createEngineLoggerFromPluginAPI,
  createNoOpLogger,
  createConsoleLogger,
  createFilteredLogger,
  setDefaultLogger,
  getDefaultLogger
} from './logger';

// ============================================================================
// Resource Manager Exports
// ============================================================================

export {
  ResourceManager
} from './resourceManager';

// ============================================================================
// Pipeline Registry Exports
// ============================================================================

export {
  PipelineRegistry
} from './pipelineRegistry';

// ============================================================================
// Render Graph Exports
// ============================================================================

export {
  RenderGraphExecutor,
  RenderGraphBuilder,
  createRenderGraph
} from './renderGraph';

// ============================================================================
// Hot Reload Manager Exports
// ============================================================================

export {
  createHotReloadManager
} from './hotReloadManager';

// ============================================================================
// Plugin Adapter Exports
// ============================================================================

export {
  setGlobalEngine,
  getGlobalEngine,
  isEngineAvailable,
  registerPluginRenderer,
  unregisterPluginRenderer,
  hotReloadPlugin,
  getRegisteredPluginIds,
  isPluginRegistered,
  createPluginEngineFacade
} from './pluginAdapter';

// ============================================================================
// Convenience Re-exports
// ============================================================================

import { createEngine } from './engine';
import {
  setGlobalEngine,
  registerPluginRenderer,
  unregisterPluginRenderer,
  isEngineAvailable
} from './pluginAdapter';

/**
 * Initialize the WebGPU engine as a global service
 * Call this once at application startup
 */
export async function initializeWebGPUEngine(options?: {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  preferHighPerformance?: boolean;
}): Promise<boolean> {
  try {
    const engine = await createEngine(options || {});
    setGlobalEngine(engine);
    engine.start();
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    // Log error but don't throw - graceful fallback
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('[WebGPU Engine] Initialization failed:', err.message);
    }
    return false;
  }
}

/**
 * Shut down the WebGPU engine
 */
export async function shutdownWebGPUEngine(): Promise<void> {
  // Unregister all plugins
  const { getGlobalEngine, getRegisteredPluginIds } = await import('./pluginAdapter');

  const pluginIds = getRegisteredPluginIds();
  for (const pluginId of pluginIds) {
    await unregisterPluginRenderer(pluginId);
  }

  // Dispose engine
  const engine = getGlobalEngine();
  if (engine) {
    engine.dispose();
    setGlobalEngine(null as unknown as import('./types').EngineFacade);
  }
}

// ============================================================================
// Default Export
// ============================================================================

/**
 * WebGPU Engine Factory and Utilities
 */
export default {
  createEngine,
  initializeWebGPUEngine,
  shutdownWebGPUEngine,
  isEngineAvailable,
  registerPluginRenderer,
  unregisterPluginRenderer
};
