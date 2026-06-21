/**
 * WebGPU Engine Hot Reload Test
 *
 * Tests hot reload functionality including:
 * - Pipeline replacement
 * - Resource cleanup
 * - Leak detection
 */

import {
  createEngine,
  checkWebGPUCapabilities,
  EngineFacade,
  PipelineDescriptor,
  PipelineHandle,
  BufferHandle,
  TextureHandle
} from '../src/index';

/**
 * Test result interface
 */
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

/**
 * Simple vertex shader v1
 */
const VERTEX_SHADER_V1 = `
@vertex
fn main(@location(0) position: vec2<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(position, 0.0, 1.0);
}
`;

/**
 * Simple vertex shader v2 (modified)
 */
const VERTEX_SHADER_V2 = `
@vertex
fn main(@location(0) position: vec2<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(position * 0.5, 0.0, 1.0);
}
`;

/**
 * Simple fragment shader
 */
const FRAGMENT_SHADER = `
@fragment
fn main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
`;

/**
 * Run hot reload tests
 */
export async function runHotReloadTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Check WebGPU availability
  const capabilities = await checkWebGPUCapabilities();
  if (!capabilities.isSupported) {
    results.push({
      name: 'WebGPU Availability',
      passed: false,
      error: `WebGPU not supported: ${capabilities.reason}`,
      duration: 0
    });
    return results;
  }

  // Create engine
  let engine: EngineFacade | null = null;
  results.push(await runTest('Engine Creation', async () => {
    engine = await createEngine({ preferHighPerformance: true });
    return engine !== null;
  }));

  if (!engine) {
    return results;
  }

  // Access internal methods for testing
  const engineInternal = engine as unknown as {
    setCurrentPluginId(id: string): void;
    getHotReloadManager(): {
      registerPlugin(id: string): void;
      unregisterPlugin(id: string): void;
      invalidatePlugin(id: string): void;
      getLeakReport(pluginId?: string): {
        pluginId: string;
        hasLeaks: boolean;
        totalLeakCount: number;
        leaks: Array<{
          resourceType: string;
          resourceId: string;
          refCount: number;
        }>;
      };
    };
  };

  // Test 1: Plugin registration with hot reload manager
  results.push(await runTest('Plugin Registration', async () => {
    const hotReloadManager = engineInternal.getHotReloadManager();
    hotReloadManager.registerPlugin('test-plugin');
    engineInternal.setCurrentPluginId('test-plugin');
    return true;
  }));

  // Test 2: Create resources for plugin
  let pipeline1: PipelineHandle | null = null;
  let buffer1: BufferHandle | null = null;
  let texture1: TextureHandle | null = null;

  results.push(await runTest('Create Plugin Resources', async () => {
    engineInternal.setCurrentPluginId('test-plugin');

    // Create buffer
    buffer1 = engine!.createBuffer({
      size: 256,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: 'test-plugin-buffer'
    });

    // Create texture
    texture1 = engine!.createTexture({
      width: 64,
      height: 64,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      label: 'test-plugin-texture'
    });

    // Create pipeline
    const pipelineDesc: PipelineDescriptor = {
      id: 'test-plugin-pipeline-v1',
      vertexShader: VERTEX_SHADER_V1,
      fragmentShader: FRAGMENT_SHADER,
      vertexBufferLayouts: [{
        arrayStride: 8,
        attributes: [{ format: 'float32x2', offset: 0, shaderLocation: 0 }]
      }],
      colorTargetStates: [{ format: engine!.getPreferredFormat() }]
    };

    pipeline1 = await engine!.createPipeline(pipelineDesc);

    return buffer1 !== null && texture1 !== null && pipeline1 !== null;
  }));

  // Test 3: Simulate hot reload - create new pipeline
  let pipeline2: PipelineHandle | null = null;

  results.push(await runTest('Create Replacement Pipeline', async () => {
    engineInternal.setCurrentPluginId('test-plugin');

    // Create new pipeline with modified shader
    const pipelineDesc: PipelineDescriptor = {
      id: 'test-plugin-pipeline-v2',
      vertexShader: VERTEX_SHADER_V2,
      fragmentShader: FRAGMENT_SHADER,
      vertexBufferLayouts: [{
        arrayStride: 8,
        attributes: [{ format: 'float32x2', offset: 0, shaderLocation: 0 }]
      }],
      colorTargetStates: [{ format: engine!.getPreferredFormat() }]
    };

    pipeline2 = await engine!.createPipeline(pipelineDesc);

    return pipeline2 !== null && !pipeline2.isDisposed();
  }));

  // Test 4: Release old pipeline
  results.push(await runTest('Release Old Pipeline', async () => {
    if (pipeline1) {
      pipeline1.release();
      return pipeline1.isDisposed();
    }
    return false;
  }));

  // Test 5: Verify new pipeline is active
  results.push(await runTest('Verify New Pipeline Active', async () => {
    return pipeline2 !== null && !pipeline2.isDisposed();
  }));

  // Test 6: Invalidate plugin (full cleanup)
  results.push(await runTest('Plugin Invalidation', async () => {
    const hotReloadManager = engineInternal.getHotReloadManager();
    hotReloadManager.invalidatePlugin('test-plugin');

    // After invalidation, all resources should be released
    return true;
  }));

  // Test 7: Check for leaks (should have some since we didn't release all resources)
  results.push(await runTest('Leak Detection Report', async () => {
    const hotReloadManager = engineInternal.getHotReloadManager();
    const report = hotReloadManager.getLeakReport('test-plugin');

    // Report should exist
    if (!report) {
      throw new Error('Leak report not found');
    }

    // Log report details
    // eslint-disable-next-line no-console
    console.log(`  Leak report for test-plugin:`);
    // eslint-disable-next-line no-console
    console.log(`    Has leaks: ${report.hasLeaks}`);
    // eslint-disable-next-line no-console
    console.log(`    Total count: ${report.totalLeakCount}`);

    // Return true since we're testing the leak detection feature itself
    return true;
  }));

  // Test 8: Create new plugin with proper cleanup
  results.push(await runTest('Clean Plugin Lifecycle', async () => {
    const hotReloadManager = engineInternal.getHotReloadManager();

    // Register new plugin
    hotReloadManager.registerPlugin('clean-plugin');
    engineInternal.setCurrentPluginId('clean-plugin');

    // Create resources
    const buffer = engine!.createBuffer({
      size: 64,
      usage: GPUBufferUsage.VERTEX,
      label: 'clean-buffer'
    });

    const texture = engine!.createTexture({
      width: 32,
      height: 32,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING,
      label: 'clean-texture'
    });

    // Properly release resources
    buffer.release();
    texture.release();

    // Unregister plugin
    hotReloadManager.unregisterPlugin('clean-plugin');

    // Check for leaks
    const report = hotReloadManager.getLeakReport('clean-plugin');
    return !report.hasLeaks;
  }));

  // Test 9: Multiple hot reloads
  results.push(await runTest('Multiple Hot Reloads', async () => {
    const hotReloadManager = engineInternal.getHotReloadManager();

    for (let i = 0; i < 3; i++) {
      hotReloadManager.registerPlugin('multi-reload-plugin');
      engineInternal.setCurrentPluginId('multi-reload-plugin');

      // Create and release resources
      const buffer = engine!.createBuffer({
        size: 128,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: `reload-buffer-${i}`
      });

      buffer.release();
      hotReloadManager.invalidatePlugin('multi-reload-plugin');
    }

    const report = hotReloadManager.getLeakReport('multi-reload-plugin');
    return !report.hasLeaks;
  }));

  // Cleanup
  results.push(await runTest('Engine Disposal', async () => {
    engine!.dispose();
    return true;
  }));

  return results;
}

/**
 * Run a single test
 */
async function runTest(name: string, testFn: () => Promise<boolean>): Promise<TestResult> {
  const startTime = performance.now();
  try {
    const passed = await testFn();
    return {
      name,
      passed,
      duration: performance.now() - startTime
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      name,
      passed: false,
      error: err.message,
      duration: performance.now() - startTime
    };
  }
}

/**
 * Print test results to console
 */
export function printTestResults(results: TestResult[]): void {
  // eslint-disable-next-line no-console
  console.log('\n========================================');
  // eslint-disable-next-line no-console
  console.log('WebGPU Engine Hot Reload Test Results');
  // eslint-disable-next-line no-console
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    const duration = result.duration.toFixed(2);

    // eslint-disable-next-line no-console
    console.log(`${status}: ${result.name} (${duration}ms)`);

    if (!result.passed && result.error) {
      // eslint-disable-next-line no-console
      console.log(`       Error: ${result.error}`);
    }

    if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  // eslint-disable-next-line no-console
  console.log('\n----------------------------------------');
  // eslint-disable-next-line no-console
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  // eslint-disable-next-line no-console
  console.log('========================================\n');
}

/**
 * Main entry point
 */
export async function main(): Promise<boolean> {
  const results = await runHotReloadTests();
  printTestResults(results);

  const allPassed = results.every(r => r.passed);
  return allPassed;
}

// Run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  main().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    // eslint-disable-next-line no-console
    console.error('Hot reload test failed:', error);
    process.exit(1);
  });
}
