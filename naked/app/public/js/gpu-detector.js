/**
 * GPU Detection & Capability Testing
 * Detects available GPU rendering APIs and their performance characteristics
 * 
 * Usage:
 *   const caps = await window.gpuDetector.detect();
 *   if (!caps.isHardwareAccelerated()) {
 *     // Fallback to lower quality
 *   }
 * 
 * Features:
 * - WebGPU detection
 * - WebGL 2 detection
 * - WebGL 1 detection
 * - Software renderer detection
 * - GPU vendor/model identification
 * 
 * @version 1.0.0
 * @author LTTH Development Team
 */

class GPUDetector {
  constructor() {
    this.capabilities = null;
  }

  /**
   * Detect available GPU APIs and capabilities
   * @returns {Promise<Object>} Capabilities object
   */
  async detect() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    // Test WebGPU
    const webgpuSupport = 'gpu' in navigator;
    let webgpuAdapter = null;
    let webgpuLimits = null;

    if (webgpuSupport) {
      try {
        webgpuAdapter = await navigator.gpu.requestAdapter({
          powerPreference: 'high-performance'
        });

        if (webgpuAdapter) {
          webgpuLimits = webgpuAdapter.limits;
        }
      } catch (e) {
        console.warn('[GPU Detector] WebGPU adapter request failed:', e.message);
      }
    }

    // Test WebGL 2
    let webgl2 = null;
    let webgl2Failed = false;
    try {
      webgl2 = canvas.getContext('webgl2', {
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: true
      });
    } catch (e) {
      webgl2Failed = true;
      console.warn('[GPU Detector] WebGL 2 with performance caveat failed, trying without:', e.message);
      // Try again without failIfMajorPerformanceCaveat
      try {
        webgl2 = canvas.getContext('webgl2', {
          powerPreference: 'high-performance'
        });
      } catch (e2) {
        console.warn('[GPU Detector] WebGL 2 completely unavailable:', e2.message);
      }
    }

    // Test WebGL 1
    let webgl = null;
    let webglFailed = false;
    try {
      webgl = canvas.getContext('webgl', {
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: true
      });
    } catch (e) {
      webglFailed = true;
      console.warn('[GPU Detector] WebGL 1 with performance caveat failed, trying without:', e.message);
      // Try again without failIfMajorPerformanceCaveat
      try {
        webgl = canvas.getContext('webgl', {
          powerPreference: 'high-performance'
        });
      } catch (e2) {
        console.warn('[GPU Detector] WebGL 1 completely unavailable:', e2.message);
      }
    }

    // Get GPU info from WebGL
    let gpuVendor = 'Unknown';
    let gpuRenderer = 'Unknown';
    const gl = webgl2 || webgl;

    if (gl) {
      try {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown';
          gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown';
        }

        // Get additional WebGL capabilities
        const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
        const maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
      } catch (e) {
        console.warn('[GPU Detector] Failed to get GL parameters:', e.message);
      }
    }

    // Build capabilities object
    this.capabilities = {
      webgpu: {
        supported: webgpuSupport && webgpuAdapter !== null,
        adapter: webgpuAdapter,
        limits: webgpuLimits
      },
      webgl2: {
        supported: webgl2 !== null,
        context: webgl2,
        performanceCaveat: webgl2Failed
      },
      webgl: {
        supported: webgl !== null,
        context: webgl,
        performanceCaveat: webglFailed
      },
      gpu: {
        vendor: gpuVendor,
        renderer: gpuRenderer
      },
      preferredAPI: this._determinePreferredAPI(
        webgpuSupport && webgpuAdapter !== null,
        webgl2 !== null && !webgl2Failed,
        webgl !== null && !webglFailed
      ),
      tier: this._determinePerformanceTier(gpuRenderer)
    };

    return this.capabilities;
  }

  /**
   * Determine the preferred rendering API
   * @private
   */
  _determinePreferredAPI(hasWebGPU, hasWebGL2, hasWebGL) {
    if (hasWebGPU) return 'webgpu';
    if (hasWebGL2) return 'webgl2';
    if (hasWebGL) return 'webgl';
    return 'canvas2d'; // Fallback
  }

  /**
   * Determine performance tier based on GPU renderer string
   * @private
   */
  _determinePerformanceTier(renderer) {
    if (!renderer || renderer === 'Unknown') return 'unknown';

    const rendererLower = renderer.toLowerCase();

    // Check for software renderers (lowest tier)
    if (
      rendererLower.includes('swiftshader') ||
      rendererLower.includes('llvmpipe') ||
      rendererLower.includes('software') ||
      rendererLower.includes('mesa')
    ) {
      return 'software';
    }

    // Check for integrated GPUs (low tier)
    if (
      rendererLower.includes('intel') ||
      rendererLower.includes('hd graphics') ||
      rendererLower.includes('uhd graphics')
    ) {
      return 'low';
    }

    // Check for high-end GPUs (high tier)
    if (
      rendererLower.includes('rtx') ||
      rendererLower.includes('rx 6') ||
      rendererLower.includes('rx 7') ||
      rendererLower.includes('radeon vii') ||
      rendererLower.includes('titan')
    ) {
      return 'high';
    }

    // Check for mid-range GPUs (medium tier)
    if (
      rendererLower.includes('gtx') ||
      rendererLower.includes('geforce') ||
      rendererLower.includes('radeon') ||
      rendererLower.includes('rx ') ||
      rendererLower.includes('vega')
    ) {
      return 'medium';
    }

    // Default to medium if we can't determine
    return 'medium';
  }

  /**
   * Check if hardware acceleration is active
   * @returns {boolean} True if hardware accelerated
   * @throws {Error} If detect() hasn't been called yet
   */
  isHardwareAccelerated() {
    if (!this.capabilities) {
      throw new Error('[GPU Detector] Call detect() first');
    }

    return this.capabilities.tier !== 'software';
  }

  /**
   * Get recommended quality preset based on GPU tier
   * @returns {string} Quality preset name
   * @throws {Error} If detect() hasn't been called yet
   */
  getRecommendedQuality() {
    if (!this.capabilities) {
      throw new Error('[GPU Detector] Call detect() first');
    }

    const tier = this.capabilities.tier;

    switch (tier) {
      case 'high':
        return 'ultra';
      case 'medium':
        return 'high';
      case 'low':
        return 'medium';
      case 'software':
      case 'unknown':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Log capabilities to console
   */
  logCapabilities() {
    if (!this.capabilities) {
      console.warn('[GPU Detector] No capabilities detected. Call detect() first.');
      return;
    }

    console.group('🎮 GPU Detector - Capabilities');
    console.log('GPU:', this.capabilities.gpu.renderer);
    console.log('Vendor:', this.capabilities.gpu.vendor);
    console.log('Performance Tier:', this.capabilities.tier);
    console.log('Preferred API:', this.capabilities.preferredAPI);
    console.log('WebGPU:', this.capabilities.webgpu.supported ? '✅' : '❌');
    console.log('WebGL 2:', this.capabilities.webgl2.supported ? '✅' : '❌');
    console.log('WebGL:', this.capabilities.webgl.supported ? '✅' : '❌');
    console.log('Hardware Accelerated:', this.isHardwareAccelerated() ? '✅' : '❌');
    console.log('Recommended Quality:', this.getRecommendedQuality());
    console.groupEnd();
  }

  /**
   * Get a user-friendly status message
   * @returns {string} Status message
   */
  getStatusMessage() {
    if (!this.capabilities) {
      return 'GPU detection not run';
    }

    const tier = this.capabilities.tier;
    const isHW = this.isHardwareAccelerated();

    if (!isHW) {
      return `⚠️ Software rendering detected (${this.capabilities.gpu.renderer}). Performance may be limited. Consider enabling hardware acceleration in your browser settings.`;
    }

    switch (tier) {
      case 'high':
        return `✅ High-end GPU detected (${this.capabilities.gpu.renderer}). Maximum quality recommended.`;
      case 'medium':
        return `✅ Mid-range GPU detected (${this.capabilities.gpu.renderer}). High quality recommended.`;
      case 'low':
        return `🟡 Integrated GPU detected (${this.capabilities.gpu.renderer}). Medium quality recommended.`;
      default:
        return `✅ Hardware acceleration enabled (${this.capabilities.gpu.renderer}).`;
    }
  }
}

// Export singleton instance
if (typeof window !== 'undefined') {
  window.gpuDetector = new GPUDetector();

  // Auto-detect on load if not already detected (optional)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      // Auto-detect can be disabled by setting window.DISABLE_AUTO_GPU_DETECT = true
      if (!window.DISABLE_AUTO_GPU_DETECT) {
        try {
          await window.gpuDetector.detect();
          console.log('[GPU Detector] Auto-detection complete');
        } catch (e) {
          console.warn('[GPU Detector] Auto-detection failed:', e.message);
        }
      }
    });
  }
}

// Export for Node.js/module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GPUDetector;
}
