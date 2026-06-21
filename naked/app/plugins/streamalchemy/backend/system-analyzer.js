const os = require('os');
const { execFile } = require('child_process');

class SystemAnalyzer {
  constructor({ execFileImpl = execFile, osImpl = os, fetchImpl = global.fetch } = {}) {
    this.execFile = execFileImpl;
    this.os = osImpl;
    this.fetch = fetchImpl;
  }

  async analyze({ comfyUrl }) {
    const gpu = await this.detectGpu();
    const comfy = await this.checkComfy(comfyUrl);
    return {
      os: {
        platform: this.os.platform()
      },
      cpu: this.detectCpu(),
      memory: {
        totalGb: Math.round(this.os.totalmem() / 1024 / 1024 / 1024)
      },
      gpu,
      comfy,
      recommendation: this.recommend(gpu)
    };
  }

  detectCpu() {
    const cpus = this.os.cpus();
    return {
      model: cpus[0]?.model || 'Unknown CPU',
      logicalCores: cpus.length
    };
  }

  detectGpu() {
    return new Promise(resolve => {
      this.execFile(
        'nvidia-smi',
        ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'],
        (error, stdout) => {
          if (error || !stdout) {
            resolve({
              name: null,
              vramMb: 0,
              driver: null,
              state: 'not_detected'
            });
            return;
          }

          const firstLine = stdout.trim().split(/\r?\n/)[0];
          const [name, memory, driver] = firstLine.split(',').map(part => part.trim());
          const vramMb = Number.parseInt(String(memory).replace(/[^\d]/g, ''), 10) || 0;
          resolve({
            name,
            vramMb,
            driver,
            state: 'detected'
          });
        }
      );
    });
  }

  async checkComfy(comfyUrl) {
    if (!comfyUrl) {
      return { state: 'disabled', url: null };
    }
    try {
      const response = await this.fetch(`${comfyUrl}/system_stats`);
      return response.ok
        ? { state: 'ready', url: comfyUrl }
        : { state: 'unreachable', url: comfyUrl, lastError: `HTTP ${response.status}` };
    } catch (error) {
      return { state: 'unreachable', url: comfyUrl, lastError: error.message };
    }
  }

  recommend(gpu) {
    if (gpu.vramMb >= 12000) {
      return {
        backend: 'ComfyUI',
        primaryModel: 'black-forest-labs/FLUX.1-schnell',
        alternativeModel: 'stabilityai/stable-diffusion-3.5-medium',
        width: 768,
        height: 768,
        steps: 4,
        concurrency: 1,
        remoteFallback: true,
        reason: 'Detected at least 12GB NVIDIA VRAM, suitable for single local image jobs with conservative settings.'
      };
    }

    if (gpu.vramMb >= 8000) {
      return {
        backend: 'ComfyUI',
        primaryModel: 'stabilityai/stable-diffusion-3.5-medium',
        alternativeModel: 'black-forest-labs/FLUX.1-schnell with offload',
        width: 768,
        height: 768,
        steps: 4,
        concurrency: 1,
        remoteFallback: true,
        reason: 'Detected 8GB or more VRAM; use conservative local settings and keep remote fallback enabled.'
      };
    }

    return {
      backend: 'remote-first',
      primaryModel: 'siliconflow',
      alternativeModel: 'openai',
      width: 768,
      height: 768,
      steps: null,
      concurrency: 1,
      remoteFallback: true,
      reason: 'Local GPU capacity is missing or low; remote providers should be preferred.'
    };
  }
}

module.exports = SystemAnalyzer;
