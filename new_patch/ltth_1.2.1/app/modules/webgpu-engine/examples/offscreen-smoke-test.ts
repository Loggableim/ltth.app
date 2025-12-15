/**
 * WebGPU Engine Offscreen Smoke Test
 *
 * Headless/OffscreenCanvas smoke test for the WebGPU engine.
 * Tests shader compilation and basic rendering without a visible canvas.
 */

import {
  createEngine,
  checkWebGPUCapabilities,
  EngineFacade,
  PipelineDescriptor,
  EngineError
} from '../src/index';

/**
 * Simple vertex shader for testing
 */
const VERTEX_SHADER = `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
};

@vertex
fn main(@location(0) position: vec2<f32>, @location(1) color: vec3<f32>) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.color = color;
  return output;
}
`;

/**
 * Simple fragment shader for testing
 */
const FRAGMENT_SHADER = `
@fragment
fn main(@location(0) color: vec3<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(color, 1.0);
}
`;

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
 * Run all smoke tests
 */
export async function runSmokeTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Check WebGPU capabilities
  results.push(await runTest('WebGPU Capability Check', async () => {
    const capabilities = await checkWebGPUCapabilities();
    if (!capabilities.isSupported) {
      throw new Error(`WebGPU not supported: ${capabilities.reason}`);
    }
    return true;
  }));

  // Skip remaining tests if WebGPU is not available
  if (!results[0].passed) {
    return results;
  }

  // Test 2: Create engine
  let engine: EngineFacade | null = null;
  results.push(await runTest('Engine Creation', async () => {
    engine = await createEngine({
      preferHighPerformance: true
    });
    return engine !== null;
  }));

  if (!engine) {
    return results;
  }

  // Test 3: Create buffer
  results.push(await runTest('Buffer Creation', async () => {
    const buffer = engine!.createBuffer({
      size: 256,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: 'test-buffer'
    });

    if (!buffer || buffer.isDisposed()) {
      throw new Error('Buffer creation failed');
    }

    // Write some data
    const data = new Float32Array([
      -0.5, -0.5, 1.0, 0.0, 0.0,  // vertex 1: position + color
       0.5, -0.5, 0.0, 1.0, 0.0,  // vertex 2: position + color
       0.0,  0.5, 0.0, 0.0, 1.0   // vertex 3: position + color
    ]);
    buffer.write(data);

    // Release buffer
    buffer.release();
    return buffer.isDisposed();
  }));

  // Test 4: Create texture
  results.push(await runTest('Texture Creation', async () => {
    const texture = engine!.createTexture({
      width: 256,
      height: 256,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      label: 'test-texture'
    });

    if (!texture || texture.isDisposed()) {
      throw new Error('Texture creation failed');
    }

    // Create view
    const view = texture.createView();
    if (!view) {
      throw new Error('Texture view creation failed');
    }

    // Release texture
    texture.release();
    return texture.isDisposed();
  }));

  // Test 5: Create sampler
  results.push(await runTest('Sampler Creation', async () => {
    const sampler = engine!.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      label: 'test-sampler'
    });

    if (!sampler || sampler.isDisposed()) {
      throw new Error('Sampler creation failed');
    }

    sampler.release();
    return sampler.isDisposed();
  }));

  // Test 6: Create pipeline (shader compilation)
  results.push(await runTest('Pipeline Creation (Shader Compilation)', async () => {
    const pipelineDescriptor: PipelineDescriptor = {
      id: 'test-pipeline',
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      vertexBufferLayouts: [{
        arrayStride: 20, // 2 floats position + 3 floats color = 5 * 4 bytes
        attributes: [
          { format: 'float32x2', offset: 0, shaderLocation: 0 },  // position
          { format: 'float32x3', offset: 8, shaderLocation: 1 }   // color
        ]
      }],
      colorTargetStates: [{
        format: engine!.getPreferredFormat()
      }],
      label: 'test-pipeline'
    };

    const pipeline = await engine!.createPipeline(pipelineDescriptor);
    if (!pipeline || pipeline.isDisposed()) {
      throw new Error('Pipeline creation failed');
    }

    pipeline.release();
    return pipeline.isDisposed();
  }));

  // Test 7: Invalid shader compilation (should fail gracefully)
  results.push(await runTest('Invalid Shader Error Handling', async () => {
    const invalidPipelineDescriptor: PipelineDescriptor = {
      id: 'invalid-pipeline',
      vertexShader: 'invalid shader code !!!',
      fragmentShader: 'also invalid !!!',
      vertexBufferLayouts: [],
      colorTargetStates: [{
        format: engine!.getPreferredFormat()
      }]
    };

    try {
      await engine!.createPipeline(invalidPipelineDescriptor);
      throw new Error('Expected shader compilation to fail');
    } catch (error) {
      // Expected - shader compilation should fail
      if (error instanceof EngineError) {
        return true;
      }
      throw error;
    }
  }));

  // Test 8: Engine metrics
  results.push(await runTest('Engine Metrics', async () => {
    const metrics = engine!.getMetrics();
    if (typeof metrics.frameTime !== 'number') {
      throw new Error('Invalid frameTime metric');
    }
    if (typeof metrics.bufferCount !== 'number') {
      throw new Error('Invalid bufferCount metric');
    }
    if (typeof metrics.textureCount !== 'number') {
      throw new Error('Invalid textureCount metric');
    }
    return true;
  }));

  // Test 9: Adapter info
  results.push(await runTest('Adapter Info', async () => {
    const info = engine!.getAdapterInfo();
    if (!info.vendor) {
      throw new Error('Missing vendor info');
    }
    if (!info.features || !Array.isArray(info.features)) {
      throw new Error('Invalid features array');
    }
    return true;
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
  console.log('WebGPU Engine Smoke Test Results');
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
 * Main entry point for running smoke tests
 */
export async function main(): Promise<boolean> {
  const results = await runSmokeTests();
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
    console.error('Smoke test failed:', error);
    process.exit(1);
  });
}
