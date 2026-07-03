/**
 * WebGPU Engine Plugin Adapter
 *
 * Integration layer for LTTH plugins to use the WebGPU engine.
 * Provides safe, managed access to GPU resources.
 */

import {
  EngineFacade,
  PluginRenderContext,
  PluginRendererOptions,
  PluginRendererHandlers,
  PluginRegistration,
  SurfaceHandle,
  EngineLogger
} from './types';
import { createEngineLoggerFromPluginAPI } from './logger';

/**
 * Plugin API interface (matches LTTH PluginAPI)
 */
interface PluginAPI {
  pluginId: string;
  log(message: string, level?: string): void;
  registerSocket(event: string, callback: (socket: unknown, ...args: unknown[]) => void): boolean;
  emit(event: string, data: unknown): boolean;
  getConfig(key?: string): unknown;
  setConfig(key: string, value: unknown): boolean;
}

/**
 * Global engine instance management
 */
let globalEngine: EngineFacade | null = null;
const registeredPlugins: Map<string, PluginRendererState> = new Map();

/**
 * Plugin renderer state
 */
interface PluginRendererState {
  pluginId: string;
  options: PluginRendererOptions;
  handlers: PluginRendererHandlers;
  surface: SurfaceHandle | null;
  isActive: boolean;
  isInitialized: boolean;
  frameCallbackId: number | null;
  lastFrameTime: number;
  api: PluginAPI;
}

/**
 * Set the global engine instance
 */
export function setGlobalEngine(engine: EngineFacade): void {
  globalEngine = engine;
}

/**
 * Get the global engine instance
 */
export function getGlobalEngine(): EngineFacade | null {
  return globalEngine;
}

/**
 * Check if WebGPU engine is available
 */
export function isEngineAvailable(): boolean {
  return globalEngine !== null && globalEngine.isWebGPUSupported();
}

/**
 * Register a plugin renderer with the WebGPU engine
 */
export async function registerPluginRenderer(
  api: PluginAPI,
  options: PluginRendererOptions,
  handlers: PluginRendererHandlers
): Promise<PluginRegistration> {
  const pluginId = api.pluginId;
  const logger = createEngineLoggerFromPluginAPI(api);

  // Check if already registered
  if (registeredPlugins.has(pluginId)) {
    logger.warn(`Plugin ${pluginId} is already registered, unregistering first`);
    await unregisterPluginRenderer(pluginId);
  }

  // Check engine availability
  if (!globalEngine) {
    logger.error('WebGPU engine not available. Plugin renderer registration failed.');
    throw new Error('WebGPU engine not available');
  }

  // Create plugin state
  const state: PluginRendererState = {
    pluginId,
    options,
    handlers,
    surface: null,
    isActive: false,
    isInitialized: false,
    frameCallbackId: null,
    lastFrameTime: 0,
    api
  };

  registeredPlugins.set(pluginId, state);

  // Set current plugin ID for resource tracking
  (globalEngine as unknown as { setCurrentPluginId(id: string): void }).setCurrentPluginId(pluginId);

  // Register with hot reload manager
  const hotReloadManager = (globalEngine as unknown as { getHotReloadManager(): { registerPlugin(id: string): void } }).getHotReloadManager();
  hotReloadManager.registerPlugin(pluginId);

  // Create surface if requested
  if (options.wantsSurface) {
    try {
      const canvas = findOrCreateCanvas(
        pluginId,
        options.preferredCanvasSelector,
        options.defaultCanvasWidth,
        options.defaultCanvasHeight
      );
      if (canvas) {
        state.surface = globalEngine.createSurface(canvas);
        logger.info(`Created surface for plugin: ${pluginId}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to create surface for plugin ${pluginId}: ${err.message}`);
    }
  }

  // Initialize plugin
  try {
    const context = createPluginRenderContext(state, globalEngine, null);
    await handlers.onInit(context);
    state.isInitialized = true;
    state.isActive = true;
    logger.info(`Plugin ${pluginId} initialized`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Failed to initialize plugin ${pluginId}: ${err.message}`);
    await unregisterPluginRenderer(pluginId);
    throw error;
  }

  // Start frame loop if surface exists
  if (state.surface) {
    startPluginFrameLoop(state, globalEngine, logger);
  }

  // Register socket events for external control
  registerPluginSocketEvents(api, state, logger);

  return {
    pluginId,
    get isActive() {
      return state.isActive;
    },
    unregister: () => unregisterPluginRenderer(pluginId)
  };
}

/**
 * Unregister a plugin renderer
 */
export async function unregisterPluginRenderer(pluginId: string): Promise<void> {
  const state = registeredPlugins.get(pluginId);
  if (!state) {
    return;
  }

  const logger = createEngineLoggerFromPluginAPI(state.api);

  // Stop frame loop
  stopPluginFrameLoop(state);

  // Call dispose handler
  if (state.handlers.onDispose && state.isInitialized && globalEngine) {
    try {
      const context = createPluginRenderContext(state, globalEngine, null);
      await state.handlers.onDispose(context);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error during plugin ${pluginId} dispose: ${err.message}`);
    }
  }

  // Dispose surface
  if (state.surface) {
    state.surface.dispose();
    state.surface = null;
  }

  // Unregister from hot reload manager
  if (globalEngine) {
    const hotReloadManager = (globalEngine as unknown as { getHotReloadManager(): { unregisterPlugin(id: string): void } }).getHotReloadManager();
    hotReloadManager.unregisterPlugin(pluginId);
  }

  // Remove from registry
  registeredPlugins.delete(pluginId);
  logger.info(`Plugin ${pluginId} unregistered`);
}

/**
 * Trigger hot reload for a plugin
 */
export async function hotReloadPlugin(pluginId: string): Promise<void> {
  const state = registeredPlugins.get(pluginId);
  if (!state || !globalEngine) {
    return;
  }

  const logger = createEngineLoggerFromPluginAPI(state.api);

  // Stop frame loop during reload
  stopPluginFrameLoop(state);

  // Set current plugin ID
  (globalEngine as unknown as { setCurrentPluginId(id: string): void }).setCurrentPluginId(pluginId);

  // Invalidate resources
  const hotReloadManager = (globalEngine as unknown as { getHotReloadManager(): { invalidatePlugin(id: string): void } }).getHotReloadManager();
  hotReloadManager.invalidatePlugin(pluginId);

  // Call hot reload handler
  if (state.handlers.onHotReload && state.isInitialized) {
    try {
      const context = createPluginRenderContext(state, globalEngine, null);
      await state.handlers.onHotReload(context);
      logger.info(`Plugin ${pluginId} hot reloaded`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error during plugin ${pluginId} hot reload: ${err.message}`);
    }
  }

  // Restart frame loop
  if (state.surface && state.isActive) {
    startPluginFrameLoop(state, globalEngine, logger);
  }
}

/**
 * Get all registered plugin IDs
 */
export function getRegisteredPluginIds(): string[] {
  return Array.from(registeredPlugins.keys());
}

/**
 * Check if a plugin is registered
 */
export function isPluginRegistered(pluginId: string): boolean {
  return registeredPlugins.has(pluginId);
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Default canvas dimensions for offscreen canvas
 */
const DEFAULT_CANVAS_WIDTH = 1920;
const DEFAULT_CANVAS_HEIGHT = 1080;

/**
 * Find or create a canvas element
 */
function findOrCreateCanvas(
  pluginId: string,
  selector?: string,
  defaultWidth?: number,
  defaultHeight?: number
): HTMLCanvasElement | OffscreenCanvas | null {
  const width = defaultWidth || DEFAULT_CANVAS_WIDTH;
  const height = defaultHeight || DEFAULT_CANVAS_HEIGHT;

  // Check if we're in a browser environment
  if (typeof document === 'undefined') {
    // Node.js environment - try OffscreenCanvas
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height);
    }
    return null;
  }

  // Try to find existing canvas by selector
  if (selector) {
    const canvas = document.querySelector(selector);
    if (canvas instanceof HTMLCanvasElement) {
      return canvas;
    }
  }

  // Try to find canvas by plugin ID
  const pluginCanvas = document.getElementById(`${pluginId}-canvas`);
  if (pluginCanvas instanceof HTMLCanvasElement) {
    return pluginCanvas;
  }

  // Create new canvas
  const canvas = document.createElement('canvas');
  canvas.id = `${pluginId}-canvas`;
  canvas.width = 800;
  canvas.height = 600;
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  return canvas;
}

/**
 * Create plugin render context
 */
function createPluginRenderContext(
  state: PluginRendererState,
  engine: EngineFacade,
  _encoder: unknown
): PluginRenderContext {
  return {
    pluginId: state.pluginId,
    time: engine.getTime(),
    deltaTime: engine.getDeltaTime(),
    frameCount: engine.getFrameCount(),
    surface: state.surface,
    engine,
    encoder: null // Encoder is passed during encodePass callback
  };
}

/**
 * Start the plugin frame loop
 */
function startPluginFrameLoop(
  state: PluginRendererState,
  engine: EngineFacade,
  logger: EngineLogger
): void {
  if (state.frameCallbackId !== null) {
    return;
  }

  const fixedTimeStep = state.options.fixedTimeStep || 0;
  const maxDeltaTime = state.options.maxDeltaTime || 0.1;

  let accumulator = 0;

  const frameLoop = (): void => {
    if (!state.isActive || !engine.isRunning()) {
      state.frameCallbackId = null;
      return;
    }

    const currentTime = performance.now();
    let deltaTime = (currentTime - state.lastFrameTime) / 1000;
    state.lastFrameTime = currentTime;

    // Clamp delta time
    deltaTime = Math.min(deltaTime, maxDeltaTime);

    try {
      // Set current plugin ID
      (engine as unknown as { setCurrentPluginId(id: string): void }).setCurrentPluginId(state.pluginId);

      if (fixedTimeStep > 0) {
        // Fixed time step mode
        accumulator += deltaTime;
        while (accumulator >= fixedTimeStep) {
          const context = createPluginRenderContext(state, engine, null);
          state.handlers.onFrame(context);
          accumulator -= fixedTimeStep;
        }
      } else {
        // Variable time step mode
        const context = createPluginRenderContext(state, engine, null);
        state.handlers.onFrame(context);
      }

      // Submit pending commands
      engine.submit();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error in plugin ${state.pluginId} frame: ${err.message}`);

      if (state.handlers.onError) {
        const context = createPluginRenderContext(state, engine, null);
        state.handlers.onError(context, err);
      }
    }

    state.frameCallbackId = requestAnimationFrame(frameLoop);
  };

  state.lastFrameTime = performance.now();
  state.frameCallbackId = requestAnimationFrame(frameLoop);
}

/**
 * Stop the plugin frame loop
 */
function stopPluginFrameLoop(state: PluginRendererState): void {
  if (state.frameCallbackId !== null) {
    cancelAnimationFrame(state.frameCallbackId);
    state.frameCallbackId = null;
  }
}

/**
 * Register socket events for plugin control
 */
function registerPluginSocketEvents(
  api: PluginAPI,
  state: PluginRendererState,
  logger: EngineLogger
): void {
  // Pause/resume event
  api.registerSocket(`webgpu:${state.pluginId}:toggle`, (_socket, data) => {
    const enabled = (data as { enabled?: boolean })?.enabled ?? !state.isActive;
    state.isActive = enabled;

    if (enabled && state.surface && globalEngine) {
      startPluginFrameLoop(state, globalEngine, logger);
    } else {
      stopPluginFrameLoop(state);
    }

    api.emit(`webgpu:${state.pluginId}:status`, { active: state.isActive });
    logger.info(`Plugin ${state.pluginId} ${enabled ? 'enabled' : 'disabled'}`);
  });

  // Hot reload event
  api.registerSocket(`webgpu:${state.pluginId}:hotreload`, async () => {
    await hotReloadPlugin(state.pluginId);
    api.emit(`webgpu:${state.pluginId}:reloaded`, { pluginId: state.pluginId });
  });

  // Resize event
  api.registerSocket(`webgpu:${state.pluginId}:resize`, (_socket, data) => {
    const { width, height } = data as { width: number; height: number };
    if (state.surface && width > 0 && height > 0) {
      state.surface.resize(width, height);

      if (state.handlers.onResize && globalEngine) {
        const context = createPluginRenderContext(state, globalEngine, null);
        state.handlers.onResize(context, width, height);
      }

      logger.debug(`Plugin ${state.pluginId} resized to ${width}x${height}`);
    }
  });

  // Status request event
  api.registerSocket(`webgpu:${state.pluginId}:getstatus`, () => {
    api.emit(`webgpu:${state.pluginId}:status`, {
      active: state.isActive,
      initialized: state.isInitialized,
      hasSurface: state.surface !== null,
      metrics: globalEngine?.getMetrics() || null
    });
  });
}

/**
 * Create a facade that prevents direct GPU access
 */
export function createPluginEngineFacade(
  engine: EngineFacade,
  pluginId: string
): EngineFacade {
  // The engine facade is already safe - it doesn't expose raw GPU handles
  // This wrapper just ensures the plugin ID is set for all operations
  return {
    createSurface(canvas) {
      (engine as unknown as { setCurrentPluginId(id: string): void }).setCurrentPluginId(pluginId);
      return engine.createSurface(canvas);
    },
    createBuffer(options) {
      (engine as unknown as { setCurrentPluginId(id: string): void }).setCurrentPluginId(pluginId);
      return engine.createBuffer(options);
    },
    createTexture(options) {
      (engine as unknown as { setCurrentPluginId(id: string): void }).setCurrentPluginId(pluginId);
      return engine.createTexture(options);
    },
    async createTextureFromImage(image, options) {
      (engine as unknown as { setCurrentPluginId(id: string): void }).setCurrentPluginId(pluginId);
      return engine.createTextureFromImage(image, options);
    },
    async createTextureFromBlob(blob, options) {
      (engine as unknown as { setCurrentPluginId(id: string): void }).setCurrentPluginId(pluginId);
      return engine.createTextureFromBlob(blob, options);
    },
    createSampler(options) {
      (engine as unknown as { setCurrentPluginId(id: string): void }).setCurrentPluginId(pluginId);
      return engine.createSampler(options);
    },
    async createPipeline(descriptor) {
      (engine as unknown as { setCurrentPluginId(id: string): void }).setCurrentPluginId(pluginId);
      return engine.createPipeline(descriptor);
    },
    createBindGroup(options) {
      return engine.createBindGroup(options);
    },
    createBindGroupFromLayout(pipelineHandle, groupIndex, entries) {
      return engine.createBindGroupFromLayout(pipelineHandle, groupIndex, entries);
    },
    registerRenderGraph(graph) {
      engine.registerRenderGraph(graph);
    },
    unregisterRenderGraph(graphId) {
      engine.unregisterRenderGraph(graphId);
    },
    encodePass(fn) {
      (engine as unknown as { setCurrentPluginId(id: string): void }).setCurrentPluginId(pluginId);
      engine.encodePass(fn);
    },
    submit() {
      engine.submit();
    },
    start() {
      engine.start();
    },
    stop() {
      engine.stop();
    },
    pause() {
      engine.pause();
    },
    resume() {
      engine.resume();
    },
    isPaused() {
      return engine.isPaused();
    },
    isRunning() {
      return engine.isRunning();
    },
    getTime() {
      return engine.getTime();
    },
    getDeltaTime() {
      return engine.getDeltaTime();
    },
    getFrameCount() {
      return engine.getFrameCount();
    },
    getMetrics() {
      return engine.getMetrics();
    },
    isWebGPUSupported() {
      return engine.isWebGPUSupported();
    },
    getAdapterInfo() {
      return engine.getAdapterInfo();
    },
    getPreferredFormat() {
      return engine.getPreferredFormat();
    },
    dispose() {
      // Plugins should not dispose the engine
      throw new Error('Plugins cannot dispose the shared engine');
    }
  };
}
