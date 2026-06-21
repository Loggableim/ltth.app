/**
 * Performance Monitoring Overlay
 * Real-time performance metrics display for debugging WebGL/Canvas overlays
 * 
 * Usage:
 *   // In your overlay HTML, include this script
 *   <script src="/js/performance-overlay.js"></script>
 *   
 *   // Update metrics in your render loop
 *   if (window.perfOverlay) {
 *     window.perfOverlay.update({
 *       fps: currentFPS,
 *       particleCount: particles.length,
 *       drawCalls: numberOfDrawCalls
 *     });
 *   }
 * 
 * Features:
 * - Real-time FPS monitoring
 * - CPU/Memory usage tracking
 * - Particle/object count
 * - GPU information
 * - Toggle with Ctrl+Shift+P
 * 
 * @version 1.0.0
 * @author LTTH Development Team
 */

class PerformanceOverlay {
  constructor(options = {}) {
    this.options = {
      autoStart: options.autoStart !== false, // Start visible by default
      position: options.position || 'top-right', // top-right, top-left, bottom-right, bottom-left
      theme: options.theme || 'dark', // dark or light
      updateInterval: options.updateInterval || 100, // ms
      ...options
    };

    this.metrics = {
      fps: 0,
      frameTime: 0,
      cpuUsage: 0,
      memoryMB: 0,
      memoryPercent: 0,
      particleCount: 0,
      drawCalls: 0,
      activeWorkers: 0,
      gpuInfo: 'Detecting...',
      gpuTier: 'unknown',
      renderAPI: 'unknown'
    };

    this.visible = this.options.autoStart;
    this.overlayElement = null;
    this.lastUpdateTime = 0;
    this.fpsHistory = [];
    this.frameTimeHistory = [];

    this.init();
  }

  /**
   * Initialize the overlay UI
   */
  init() {
    this.createUI();
    this.setupHotkeys();
    this.startMonitoring();

    // Auto-detect GPU info if gpuDetector is available
    if (window.gpuDetector && !window.gpuDetector.capabilities) {
      window.gpuDetector.detect().then(() => {
        this.updateGPUInfo();
      }).catch(e => {
        console.warn('[Performance Overlay] GPU detection failed:', e);
      });
    } else if (window.gpuDetector && window.gpuDetector.capabilities) {
      this.updateGPUInfo();
    }
  }

  /**
   * Create the overlay DOM structure
   */
  createUI() {
    const overlay = document.createElement('div');
    overlay.id = 'ltth-perf-overlay';
    overlay.className = `perf-overlay perf-overlay-${this.options.theme} perf-overlay-${this.options.position}`;
    overlay.style.display = this.visible ? 'block' : 'none';

    overlay.innerHTML = `
      <div class="perf-header">
        <span class="perf-title">🎮 Performance Monitor</span>
        <button class="perf-close" title="Close (Ctrl+Shift+P)">×</button>
      </div>
      <div class="perf-content">
        <div class="perf-section">
          <div class="perf-label">FPS</div>
          <div class="perf-value" id="perf-fps">
            <span class="perf-value-main">0</span>
            <span class="perf-value-unit">fps</span>
          </div>
          <div class="perf-graph" id="perf-fps-graph"></div>
        </div>

        <div class="perf-section">
          <div class="perf-label">Frame Time</div>
          <div class="perf-value" id="perf-frametime">
            <span class="perf-value-main">0</span>
            <span class="perf-value-unit">ms</span>
          </div>
        </div>

        <div class="perf-section">
          <div class="perf-label">Memory</div>
          <div class="perf-value" id="perf-memory">
            <span class="perf-value-main">0</span>
            <span class="perf-value-unit">MB</span>
          </div>
        </div>

        <div class="perf-section">
          <div class="perf-label">Particles</div>
          <div class="perf-value" id="perf-particles">
            <span class="perf-value-main">0</span>
          </div>
        </div>

        <div class="perf-section">
          <div class="perf-label">Draw Calls</div>
          <div class="perf-value" id="perf-drawcalls">
            <span class="perf-value-main">0</span>
          </div>
        </div>

        <div class="perf-section perf-section-wide">
          <div class="perf-label">GPU</div>
          <div class="perf-value-text" id="perf-gpu">Detecting...</div>
        </div>

        <div class="perf-section perf-section-wide">
          <div class="perf-label">API</div>
          <div class="perf-value-text" id="perf-api">Unknown</div>
        </div>
      </div>
    `;

    // Add CSS
    this.injectCSS();

    // Add to document
    document.body.appendChild(overlay);
    this.overlayElement = overlay;

    // Setup event listeners
    overlay.querySelector('.perf-close').addEventListener('click', () => {
      this.hide();
    });
  }

  /**
   * Inject CSS styles
   */
  injectCSS() {
    if (document.getElementById('ltth-perf-overlay-styles')) {
      return; // Already injected
    }

    const style = document.createElement('style');
    style.id = 'ltth-perf-overlay-styles';
    style.textContent = `
      .perf-overlay {
        position: fixed;
        z-index: 999999;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: 12px;
        background: rgba(0, 0, 0, 0.85);
        color: #0f0;
        border: 1px solid rgba(0, 255, 0, 0.3);
        border-radius: 8px;
        padding: 0;
        min-width: 200px;
        max-width: 300px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
        user-select: none;
      }

      .perf-overlay-dark {
        background: rgba(0, 0, 0, 0.85);
        color: #0f0;
        border-color: rgba(0, 255, 0, 0.3);
      }

      .perf-overlay-light {
        background: rgba(255, 255, 255, 0.95);
        color: #000;
        border-color: rgba(0, 0, 0, 0.2);
      }

      .perf-overlay-top-right {
        top: 10px;
        right: 10px;
      }

      .perf-overlay-top-left {
        top: 10px;
        left: 10px;
      }

      .perf-overlay-bottom-right {
        bottom: 10px;
        right: 10px;
      }

      .perf-overlay-bottom-left {
        bottom: 10px;
        left: 10px;
      }

      .perf-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid rgba(0, 255, 0, 0.2);
      }

      .perf-title {
        font-weight: bold;
        font-size: 13px;
      }

      .perf-close {
        background: none;
        border: none;
        color: inherit;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        line-height: 18px;
        opacity: 0.6;
        transition: opacity 0.2s;
      }

      .perf-close:hover {
        opacity: 1;
      }

      .perf-content {
        padding: 8px 12px;
      }

      .perf-section {
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .perf-section-wide {
        flex-direction: column;
        align-items: flex-start;
      }

      .perf-label {
        opacity: 0.7;
        font-size: 11px;
      }

      .perf-value {
        display: flex;
        align-items: baseline;
        gap: 4px;
      }

      .perf-value-main {
        font-size: 16px;
        font-weight: bold;
      }

      .perf-value-unit {
        font-size: 10px;
        opacity: 0.7;
      }

      .perf-value-text {
        font-size: 11px;
        opacity: 0.9;
        margin-top: 2px;
        word-break: break-word;
      }

      .perf-graph {
        width: 100px;
        height: 20px;
        margin-top: 4px;
        background: rgba(0, 255, 0, 0.1);
        border-radius: 2px;
        position: relative;
        overflow: hidden;
      }

      .perf-graph-bar {
        position: absolute;
        bottom: 0;
        width: 2px;
        background: #0f0;
        transition: height 0.1s ease;
      }

      /* FPS color indicators */
      .perf-fps-good { color: #0f0; }
      .perf-fps-ok { color: #ff0; }
      .perf-fps-bad { color: #f00; }
    `;

    document.head.appendChild(style);
  }

  /**
   * Setup keyboard hotkeys
   */
  setupHotkeys() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+P to toggle
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  /**
   * Start automatic monitoring
   */
  startMonitoring() {
    // Monitor memory if available
    if (performance.memory) {
      setInterval(() => {
        this.metrics.memoryMB = performance.memory.usedJSHeapSize / 1024 / 1024;
        this.metrics.memoryPercent = (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;
      }, this.options.updateInterval);
    }
  }

  /**
   * Update GPU information from gpuDetector
   */
  updateGPUInfo() {
    if (!window.gpuDetector || !window.gpuDetector.capabilities) {
      return;
    }

    const caps = window.gpuDetector.capabilities;
    this.metrics.gpuInfo = caps.gpu.renderer || 'Unknown';
    this.metrics.gpuTier = caps.tier;
    this.metrics.renderAPI = caps.preferredAPI;
  }

  /**
   * Update performance metrics
   * @param {Object} metrics - Metrics to update
   */
  update(metrics = {}) {
    const now = performance.now();

    // Throttle updates
    if (now - this.lastUpdateTime < this.options.updateInterval) {
      return;
    }
    this.lastUpdateTime = now;

    // Update metrics
    if (metrics.fps !== undefined) this.metrics.fps = metrics.fps;
    if (metrics.frameTime !== undefined) this.metrics.frameTime = metrics.frameTime;
    if (metrics.particleCount !== undefined) this.metrics.particleCount = metrics.particleCount;
    if (metrics.drawCalls !== undefined) this.metrics.drawCalls = metrics.drawCalls;
    if (metrics.activeWorkers !== undefined) this.metrics.activeWorkers = metrics.activeWorkers;
    if (metrics.gpuInfo !== undefined) this.metrics.gpuInfo = metrics.gpuInfo;
    if (metrics.renderAPI !== undefined) this.metrics.renderAPI = metrics.renderAPI;

    // Track FPS history
    this.fpsHistory.push(this.metrics.fps);
    if (this.fpsHistory.length > 50) this.fpsHistory.shift();

    // Update UI
    this.updateUI();
  }

  /**
   * Update the UI with current metrics
   */
  updateUI() {
    if (!this.visible || !this.overlayElement) {
      return;
    }

    // FPS
    const fpsElement = this.overlayElement.querySelector('#perf-fps .perf-value-main');
    if (fpsElement) {
      fpsElement.textContent = Math.round(this.metrics.fps);

      // Color code FPS
      fpsElement.className = 'perf-value-main';
      if (this.metrics.fps >= 55) {
        fpsElement.classList.add('perf-fps-good');
      } else if (this.metrics.fps >= 30) {
        fpsElement.classList.add('perf-fps-ok');
      } else {
        fpsElement.classList.add('perf-fps-bad');
      }
    }

    // Frame Time
    const frameTimeElement = this.overlayElement.querySelector('#perf-frametime .perf-value-main');
    if (frameTimeElement) {
      frameTimeElement.textContent = this.metrics.frameTime.toFixed(1);
    }

    // Memory
    const memoryElement = this.overlayElement.querySelector('#perf-memory .perf-value-main');
    if (memoryElement) {
      memoryElement.textContent = this.metrics.memoryMB.toFixed(1);
    }

    // Particles
    const particlesElement = this.overlayElement.querySelector('#perf-particles .perf-value-main');
    if (particlesElement) {
      particlesElement.textContent = this.metrics.particleCount;
    }

    // Draw Calls
    const drawCallsElement = this.overlayElement.querySelector('#perf-drawcalls .perf-value-main');
    if (drawCallsElement) {
      drawCallsElement.textContent = this.metrics.drawCalls;
    }

    // GPU Info
    const gpuElement = this.overlayElement.querySelector('#perf-gpu');
    if (gpuElement) {
      gpuElement.textContent = `${this.metrics.gpuInfo} (${this.metrics.gpuTier})`;
    }

    // Render API
    const apiElement = this.overlayElement.querySelector('#perf-api');
    if (apiElement) {
      apiElement.textContent = this.metrics.renderAPI.toUpperCase();
    }

    // Update FPS graph
    this.updateFPSGraph();
  }

  /**
   * Update the FPS history graph
   */
  updateFPSGraph() {
    const graphElement = this.overlayElement.querySelector('#perf-fps-graph');
    if (!graphElement || this.fpsHistory.length === 0) {
      return;
    }

    // Clear existing bars
    graphElement.innerHTML = '';

    // Create bars
    const maxFPS = 60;
    const barWidth = 2;
    const graphWidth = 100;
    const numBars = Math.min(Math.floor(graphWidth / barWidth), this.fpsHistory.length);

    for (let i = 0; i < numBars; i++) {
      const fps = this.fpsHistory[this.fpsHistory.length - numBars + i];
      const height = (fps / maxFPS) * 100;

      const bar = document.createElement('div');
      bar.className = 'perf-graph-bar';
      bar.style.height = `${height}%`;
      bar.style.left = `${i * barWidth}px`;

      graphElement.appendChild(bar);
    }
  }

  /**
   * Show the overlay
   */
  show() {
    this.visible = true;
    if (this.overlayElement) {
      this.overlayElement.style.display = 'block';
    }
  }

  /**
   * Hide the overlay
   */
  hide() {
    this.visible = false;
    if (this.overlayElement) {
      this.overlayElement.style.display = 'none';
    }
  }

  /**
   * Toggle overlay visibility
   */
  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Destroy the overlay
   */
  destroy() {
    if (this.overlayElement) {
      this.overlayElement.remove();
      this.overlayElement = null;
    }
  }
}

// Export singleton instance
if (typeof window !== 'undefined') {
  window.perfOverlay = new PerformanceOverlay({
    autoStart: false // Start hidden, toggle with Ctrl+Shift+P
  });

  console.log('[Performance Overlay] Initialized. Press Ctrl+Shift+P to toggle.');
}

// Export for Node.js/module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceOverlay;
}
