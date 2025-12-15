/**
 * WebGPU Engine Hot Reload Manager
 *
 * Manages plugin lifecycle, resource invalidation, and leak detection.
 * Ensures clean plugin unloading and resource cleanup.
 */

import {
  HotReloadManager,
  LeakReport,
  LeakInfo,
  EngineLogger
} from './types';
import { createNoOpLogger } from './logger';
import { ResourceManager } from './resourceManager';
import { PipelineRegistry } from './pipelineRegistry';

/**
 * Plugin registration state
 */
interface PluginState {
  readonly pluginId: string;
  readonly registeredAt: number;
  isActive: boolean;
  resourceSnapshot: {
    bufferIds: string[];
    textureIds: string[];
    samplerIds: string[];
    pipelineIds: string[];
  } | null;
}

/**
 * Hot reload manager implementation
 */
export class HotReloadManagerImpl implements HotReloadManager {
  private readonly logger: EngineLogger;
  private readonly resourceManager: ResourceManager;
  private readonly pipelineRegistry: PipelineRegistry;
  private readonly plugins: Map<string, PluginState> = new Map();
  private readonly leakReports: Map<string, LeakReport> = new Map();

  constructor(
    resourceManager: ResourceManager,
    pipelineRegistry: PipelineRegistry,
    logger?: EngineLogger
  ) {
    this.resourceManager = resourceManager;
    this.pipelineRegistry = pipelineRegistry;
    this.logger = logger || createNoOpLogger();
  }

  /**
   * Register a plugin for resource tracking
   */
  registerPlugin(pluginId: string): void {
    if (this.plugins.has(pluginId)) {
      this.logger.warn(`Plugin already registered: ${pluginId}`);
      return;
    }

    this.plugins.set(pluginId, {
      pluginId,
      registeredAt: Date.now(),
      isActive: true,
      resourceSnapshot: null
    });

    this.logger.info(`Registered plugin for hot reload tracking: ${pluginId}`);
  }

  /**
   * Unregister a plugin and clean up its resources
   */
  unregisterPlugin(pluginId: string): void {
    const state = this.plugins.get(pluginId);
    if (!state) {
      this.logger.warn(`Plugin not registered: ${pluginId}`);
      return;
    }

    // Take a snapshot before cleanup for leak detection
    this.takeResourceSnapshot(pluginId);

    // Release all plugin resources
    this.resourceManager.releasePluginResources(pluginId);
    this.pipelineRegistry.releasePluginPipelines(pluginId);

    // Check for leaks
    this.checkForLeaks(pluginId);

    // Remove plugin state
    this.plugins.delete(pluginId);
    this.logger.info(`Unregistered plugin: ${pluginId}`);
  }

  /**
   * Invalidate a plugin's resources for hot reload
   */
  invalidatePlugin(pluginId: string): void {
    const state = this.plugins.get(pluginId);
    if (!state) {
      this.logger.warn(`Cannot invalidate unregistered plugin: ${pluginId}`);
      return;
    }

    // Take a snapshot before invalidation
    this.takeResourceSnapshot(pluginId);

    // Release all plugin resources
    this.resourceManager.releasePluginResources(pluginId);
    this.pipelineRegistry.releasePluginPipelines(pluginId);

    // Check for leaks
    this.checkForLeaks(pluginId);

    this.logger.info(`Invalidated plugin resources for hot reload: ${pluginId}`);
  }

  /**
   * Get the leak report for a specific plugin
   */
  getLeakReport(pluginId?: string): LeakReport {
    if (pluginId) {
      const report = this.leakReports.get(pluginId);
      if (report) {
        return report;
      }
      return {
        pluginId,
        leaks: [],
        totalLeakCount: 0,
        hasLeaks: false
      };
    }

    // Aggregate all leak reports
    const allLeaks: LeakInfo[] = [];
    for (const report of this.leakReports.values()) {
      allLeaks.push(...report.leaks);
    }

    return {
      pluginId: 'all',
      leaks: allLeaks,
      totalLeakCount: allLeaks.length,
      hasLeaks: allLeaks.length > 0
    };
  }

  /**
   * Clear all leak reports
   */
  clearLeakReport(): void {
    this.leakReports.clear();
    this.logger.debug('Cleared all leak reports');
  }

  /**
   * Get all registered plugin IDs
   */
  getRegisteredPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Check if a plugin is registered
   */
  isPluginRegistered(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Dispose the hot reload manager
   */
  dispose(): void {
    // Unregister all plugins
    for (const pluginId of this.plugins.keys()) {
      this.unregisterPlugin(pluginId);
    }

    this.plugins.clear();
    this.leakReports.clear();
    this.logger.info('Hot reload manager disposed');
  }

  /**
   * Take a snapshot of a plugin's resources
   */
  private takeResourceSnapshot(pluginId: string): void {
    const state = this.plugins.get(pluginId);
    if (!state) {
      return;
    }

    const resources = this.resourceManager.getPluginResources(pluginId);
    const pipelines = this.pipelineRegistry.getPluginPipelines(pluginId);

    state.resourceSnapshot = {
      bufferIds: resources.buffers.map(b => b.id),
      textureIds: resources.textures.map(t => t.id),
      samplerIds: resources.samplers.map(s => s.id),
      pipelineIds: pipelines.map(p => p.id)
    };
  }

  /**
   * Check for resource leaks after cleanup
   */
  private checkForLeaks(pluginId: string): void {
    const state = this.plugins.get(pluginId);
    if (!state || !state.resourceSnapshot) {
      return;
    }

    const leaks: LeakInfo[] = [];
    const resources = this.resourceManager.getPluginResources(pluginId);
    const pipelines = this.pipelineRegistry.getPluginPipelines(pluginId);

    // Check for leaked buffers
    for (const buffer of resources.buffers) {
      if (!buffer.isDisposed() && buffer.refCount > 0) {
        leaks.push({
          resourceType: 'buffer',
          resourceId: buffer.id,
          refCount: buffer.refCount,
          pluginId,
          createdAt: buffer.createdAt
        });
      }
    }

    // Check for leaked textures
    for (const texture of resources.textures) {
      if (!texture.isDisposed() && texture.refCount > 0) {
        leaks.push({
          resourceType: 'texture',
          resourceId: texture.id,
          refCount: texture.refCount,
          pluginId,
          createdAt: texture.createdAt
        });
      }
    }

    // Check for leaked samplers
    for (const sampler of resources.samplers) {
      if (!sampler.isDisposed() && sampler.refCount > 0) {
        leaks.push({
          resourceType: 'sampler',
          resourceId: sampler.id,
          refCount: sampler.refCount,
          pluginId,
          createdAt: sampler.createdAt
        });
      }
    }

    // Check for leaked pipelines
    for (const pipeline of pipelines) {
      if (!pipeline.isDisposed() && pipeline.refCount > 0) {
        leaks.push({
          resourceType: 'pipeline',
          resourceId: pipeline.id,
          refCount: pipeline.refCount,
          pluginId,
          createdAt: pipeline.createdAt
        });
      }
    }

    // Create leak report
    const report: LeakReport = {
      pluginId,
      leaks,
      totalLeakCount: leaks.length,
      hasLeaks: leaks.length > 0
    };

    this.leakReports.set(pluginId, report);

    // Log leaks as errors
    if (report.hasLeaks) {
      this.logger.error(
        `Resource leak detected for plugin ${pluginId}: ${report.totalLeakCount} leaked resources`
      );
      for (const leak of leaks) {
        this.logger.error(
          `  - ${leak.resourceType} ${leak.resourceId} (refCount: ${leak.refCount})`
        );
      }
    } else {
      this.logger.debug(`No leaks detected for plugin: ${pluginId}`);
    }
  }
}

/**
 * Create a hot reload manager
 */
export function createHotReloadManager(
  resourceManager: ResourceManager,
  pipelineRegistry: PipelineRegistry,
  logger?: EngineLogger
): HotReloadManager {
  return new HotReloadManagerImpl(resourceManager, pipelineRegistry, logger);
}
