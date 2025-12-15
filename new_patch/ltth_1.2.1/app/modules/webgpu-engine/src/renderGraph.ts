/**
 * WebGPU Engine Render Graph
 *
 * Declarative render pass registration and automatic ordering.
 * Handles attachment resolve/clear and pass dependencies.
 */

import {
  RenderGraph,
  RenderGraphNode,
  RenderPassDescriptor,
  RenderPassEncoderFacade,
  PluginRenderContext,
  SurfaceHandle,
  EngineLogger,
  EngineError,
  EngineErrorCode
} from './types';
import { createNoOpLogger } from './logger';

/**
 * Topologically sort render graph nodes based on dependencies
 */
function topologicalSort(nodes: RenderGraphNode[]): RenderGraphNode[] {
  const nodeMap = new Map<string, RenderGraphNode>();
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: RenderGraphNode[] = [];

  // Build node map
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // DFS visit function
  function visit(nodeId: string): void {
    if (visited.has(nodeId)) {
      return;
    }

    if (visiting.has(nodeId)) {
      throw new EngineError(
        EngineErrorCode.VALIDATION_ERROR,
        `Cyclic dependency detected in render graph at node: ${nodeId}`
      );
    }

    visiting.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (node) {
      for (const depId of node.dependencies) {
        if (nodeMap.has(depId)) {
          visit(depId);
        }
      }
      visited.add(nodeId);
      visiting.delete(nodeId);
      sorted.push(node);
    }
  }

  // Visit all nodes
  for (const node of nodes) {
    visit(node.id);
  }

  return sorted;
}

/**
 * Render graph executor
 */
export class RenderGraphExecutor {
  private readonly logger: EngineLogger;
  private readonly graphs: Map<string, RenderGraph> = new Map();
  private readonly sortedGraphs: Map<string, RenderGraphNode[]> = new Map();

  constructor(logger?: EngineLogger) {
    this.logger = logger || createNoOpLogger();
  }

  /**
   * Register a render graph
   */
  registerGraph(graph: RenderGraph): void {
    if (this.graphs.has(graph.id)) {
      this.logger.warn(`Replacing existing render graph: ${graph.id}`);
    }

    // Validate and sort the graph
    const sorted = topologicalSort(graph.nodes);

    this.graphs.set(graph.id, graph);
    this.sortedGraphs.set(graph.id, sorted);
    this.logger.debug(`Registered render graph: ${graph.id} (${sorted.length} nodes)`);
  }

  /**
   * Unregister a render graph
   */
  unregisterGraph(graphId: string): void {
    this.graphs.delete(graphId);
    this.sortedGraphs.delete(graphId);
    this.logger.debug(`Unregistered render graph: ${graphId}`);
  }

  /**
   * Check if a graph is registered
   */
  hasGraph(graphId: string): boolean {
    return this.graphs.has(graphId);
  }

  /**
   * Get all registered graph IDs
   */
  getGraphIds(): string[] {
    return Array.from(this.graphs.keys());
  }

  /**
   * Get a render graph by ID
   */
  getGraph(graphId: string): RenderGraph | undefined {
    return this.graphs.get(graphId);
  }

  /**
   * Execute a render graph
   */
  execute(
    graphId: string,
    device: GPUDevice,
    commandEncoder: GPUCommandEncoder,
    surface: SurfaceHandle | null,
    context: PluginRenderContext
  ): void {
    const sortedNodes = this.sortedGraphs.get(graphId);
    if (!sortedNodes) {
      throw new EngineError(
        EngineErrorCode.VALIDATION_ERROR,
        `Render graph not found: ${graphId}`
      );
    }

    for (const node of sortedNodes) {
      this.executeNode(node, device, commandEncoder, surface, context);
    }
  }

  /**
   * Execute all registered render graphs
   */
  executeAll(
    device: GPUDevice,
    commandEncoder: GPUCommandEncoder,
    surface: SurfaceHandle | null,
    context: PluginRenderContext
  ): void {
    for (const graphId of this.graphs.keys()) {
      this.execute(graphId, device, commandEncoder, surface, context);
    }
  }

  /**
   * Execute a single render graph node
   */
  private executeNode(
    node: RenderGraphNode,
    _device: GPUDevice,
    commandEncoder: GPUCommandEncoder,
    surface: SurfaceHandle | null,
    context: PluginRenderContext
  ): void {
    const passDesc = this.buildRenderPassDescriptor(node.passDescriptor, surface);
    const renderPass = commandEncoder.beginRenderPass(passDesc);

    // Create the encoder facade
    const encoderFacade = this.createRenderPassEncoderFacade(renderPass);

    try {
      // Execute the node's callback
      node.execute(encoderFacade, context);
    } finally {
      renderPass.end();
    }
  }

  /**
   * Build a GPURenderPassDescriptor from our descriptor
   */
  private buildRenderPassDescriptor(
    descriptor: RenderPassDescriptor,
    surface: SurfaceHandle | null
  ): GPURenderPassDescriptor {
    const colorAttachments: GPURenderPassColorAttachment[] = descriptor.colorAttachments.map(
      attachment => {
        let view: GPUTextureView;

        if (attachment.view === 'screen') {
          if (!surface) {
            throw new EngineError(
              EngineErrorCode.VALIDATION_ERROR,
              'Render pass requires screen surface but none was provided'
            );
          }
          view = surface.getCurrentTexture().createView();
        } else {
          view = attachment.view;
        }

        return {
          view,
          resolveTarget: attachment.resolveTarget,
          clearValue: attachment.clearValue,
          loadOp: attachment.loadOp,
          storeOp: attachment.storeOp
        };
      }
    );

    const result: GPURenderPassDescriptor = {
      colorAttachments,
      label: descriptor.label
    };

    if (descriptor.depthStencilAttachment) {
      result.depthStencilAttachment = {
        view: descriptor.depthStencilAttachment.view,
        depthClearValue: descriptor.depthStencilAttachment.depthClearValue,
        depthLoadOp: descriptor.depthStencilAttachment.depthLoadOp,
        depthStoreOp: descriptor.depthStencilAttachment.depthStoreOp,
        depthReadOnly: descriptor.depthStencilAttachment.depthReadOnly,
        stencilClearValue: descriptor.depthStencilAttachment.stencilClearValue,
        stencilLoadOp: descriptor.depthStencilAttachment.stencilLoadOp,
        stencilStoreOp: descriptor.depthStencilAttachment.stencilStoreOp,
        stencilReadOnly: descriptor.depthStencilAttachment.stencilReadOnly
      };
    }

    if (descriptor.timestampWrites) {
      result.timestampWrites = descriptor.timestampWrites;
    }

    return result;
  }

  /**
   * Create a render pass encoder facade
   */
  private createRenderPassEncoderFacade(encoder: GPURenderPassEncoder): RenderPassEncoderFacade {
    return {
      setPipeline(pipeline) {
        encoder.setPipeline(pipeline.pipeline);
      },
      setBindGroup(index, bindGroup, dynamicOffsets) {
        if (dynamicOffsets) {
          encoder.setBindGroup(index, bindGroup, dynamicOffsets);
        } else {
          encoder.setBindGroup(index, bindGroup);
        }
      },
      setVertexBuffer(slot, buffer, offset, size) {
        encoder.setVertexBuffer(slot, buffer.resource, offset, size);
      },
      setIndexBuffer(buffer, format, offset, size) {
        encoder.setIndexBuffer(buffer.resource, format, offset, size);
      },
      draw(vertexCount, instanceCount, firstVertex, firstInstance) {
        encoder.draw(vertexCount, instanceCount, firstVertex, firstInstance);
      },
      drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance) {
        encoder.drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance);
      },
      setViewport(x, y, width, height, minDepth, maxDepth) {
        encoder.setViewport(x, y, width, height, minDepth, maxDepth);
      },
      setScissorRect(x, y, width, height) {
        encoder.setScissorRect(x, y, width, height);
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

  /**
   * Clear all registered graphs
   */
  clear(): void {
    this.graphs.clear();
    this.sortedGraphs.clear();
    this.logger.debug('All render graphs cleared');
  }

  /**
   * Dispose the executor
   */
  dispose(): void {
    this.clear();
    this.logger.info('Render graph executor disposed');
  }
}

/**
 * Builder for creating render graphs declaratively
 */
export class RenderGraphBuilder {
  private readonly id: string;
  private readonly nodes: RenderGraphNode[] = [];

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Add a render pass node to the graph
   */
  addPass(
    nodeId: string,
    passDescriptor: RenderPassDescriptor,
    execute: (encoder: RenderPassEncoderFacade, context: PluginRenderContext) => void,
    dependencies: string[] = []
  ): RenderGraphBuilder {
    this.nodes.push({
      id: nodeId,
      passDescriptor,
      dependencies,
      execute
    });
    return this;
  }

  /**
   * Add a screen pass (renders to the canvas)
   */
  addScreenPass(
    nodeId: string,
    clearColor: GPUColor,
    execute: (encoder: RenderPassEncoderFacade, context: PluginRenderContext) => void,
    dependencies: string[] = []
  ): RenderGraphBuilder {
    return this.addPass(
      nodeId,
      {
        id: nodeId,
        colorAttachments: [{
          view: 'screen',
          clearValue: clearColor,
          loadOp: 'clear',
          storeOp: 'store'
        }]
      },
      execute,
      dependencies
    );
  }

  /**
   * Build the render graph
   */
  build(): RenderGraph {
    return {
      id: this.id,
      nodes: [...this.nodes]
    };
  }
}

/**
 * Create a new render graph builder
 */
export function createRenderGraph(id: string): RenderGraphBuilder {
  return new RenderGraphBuilder(id);
}
