const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ModelCatalog = require('./model-catalog');

class SystemAnalyzer {
  constructor({ execFileImpl = execFile, osImpl = os, fetchImpl = global.fetch, fsImpl = fs, catalog = new ModelCatalog() } = {}) {
    this.execFile = execFileImpl;
    this.os = osImpl;
    this.fetch = fetchImpl;
    this.fs = fsImpl;
    this.catalog = catalog;
  }

  async analyze({ comfyUrl, comfyRootDir = null } = {}) {
    const gpu = await this.detectGpu();
    const comfy = await this.checkComfy(comfyUrl);
    const comfyRoot = this.checkComfyRoot(comfyRootDir);
    const disk = this.detectDisk(comfyRootDir);
    const presets = this.catalog.getUiCatalog({ comfyRootDir }, {
      fsImpl: this.fs,
      gpu
    });
    if (comfyRoot.state === 'missing' && presets.some(preset => preset.installed)) {
      comfyRoot.state = 'ready';
    }

    return {
      os: {
        platform: this.os.platform()
      },
      cpu: this.detectCpu(),
      memory: {
        totalGb: Math.round(this.os.totalmem() / 1024 / 1024 / 1024)
      },
      gpu,
      disk,
      comfy,
      comfyRoot,
      presets,
      recommendation: this.recommend(gpu, presets)
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
        async (error, stdout) => {
          if (!error && stdout) {
            const firstLine = stdout.trim().split(/\r?\n/)[0];
            const [name, memory, driver] = firstLine.split(',').map(part => part.trim());
            const vramMb = Number.parseInt(String(memory).replace(/[^\d]/g, ''), 10) || 0;
            resolve({
              name,
              vendor: 'nvidia',
              vramMb,
              vramGb: Math.round((vramMb / 1024) * 10) / 10,
              driver,
              state: 'detected'
            });
            return;
          }

          if (this.os.platform() === 'win32') {
            resolve(await this.detectWindowsGpu());
            return;
          }

          resolve({
            name: null,
            vendor: null,
            vramMb: 0,
            vramGb: 0,
            driver: null,
            state: 'not_detected'
          });
        }
      );
    });
  }

  detectWindowsGpu() {
    return new Promise(resolve => {
      this.execFile(
        'powershell',
        ['-NoProfile', '-Command', 'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | Format-List'],
        (error, stdout) => {
          if (error || !stdout) {
            resolve({
              name: null,
              vendor: null,
              vramMb: 0,
              vramGb: 0,
              driver: null,
              state: 'not_detected'
            });
            return;
          }

          const data = {};
          stdout.trim().split(/[;\r\n]+/).forEach(part => {
            const [key, ...rest] = part.split('=');
            if (key && rest.length) {
              data[key.trim()] = rest.join('=').trim();
            }
          });
          const bytes = Number.parseInt(String(data.AdapterRAM || '').replace(/[^\d]/g, ''), 10) || 0;
          const vramMb = Math.round(bytes / 1024 / 1024);
          const name = data.Name || null;
          const lower = String(name || '').toLowerCase();
          resolve({
            name,
            vendor: lower.includes('nvidia') ? 'nvidia' : (lower.includes('amd') ? 'amd' : (lower.includes('intel') ? 'intel' : 'unknown')),
            vramMb,
            vramGb: Math.round((vramMb / 1024) * 10) / 10,
            driver: data.DriverVersion || null,
            state: name ? 'detected' : 'not_detected'
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

  checkComfyRoot(comfyRootDir) {
    if (!comfyRootDir) {
      return { state: 'missing', path: null };
    }
    return {
      state: this.fs?.existsSync?.(comfyRootDir) ? 'ready' : 'missing',
      path: comfyRootDir
    };
  }

  detectDisk(rootDir) {
    const targetRoot = rootDir || process.cwd();
    let freeGb = null;
    try {
      if (typeof this.fs?.statfsSync === 'function') {
        const stats = this.fs.statfsSync(targetRoot);
        if (stats && typeof stats.bavail === 'number' && typeof stats.bsize === 'number') {
          freeGb = Math.round((stats.bavail * stats.bsize) / 1024 / 1024 / 1024);
        }
      }
    } catch (error) {
      freeGb = null;
    }

    return {
      targetRoot: this.resolveTargetRoot(targetRoot),
      freeGb
    };
  }

  resolveTargetRoot(targetRoot) {
    const rawTargetRoot = String(targetRoot || process.cwd());
    if (path.win32.isAbsolute(rawTargetRoot) && this.os.platform() === 'win32') {
      return path.win32.resolve(rawTargetRoot);
    }
    return path.resolve(rawTargetRoot);
  }

  recommend(gpu, presets = []) {
    const preferred = presets.find(preset => preset.id === 'sdxl_lightning_4step' && preset.recommendationState === 'recommended')
      || presets.find(preset => preset.recommendationState === 'recommended')
      || presets.find(preset => preset.recommendationState === 'supported_with_warning')
      || presets.find(preset => preset.recommendationState === 'manual_only');

    if (preferred) {
      return {
        backend: 'ComfyUI',
        primaryModel: preferred.id,
        alternativeModel: presets.find(preset => preset.id !== preferred.id)?.id || null,
        width: preferred.width,
        height: preferred.height,
        steps: preferred.steps,
        concurrency: 1,
        remoteFallback: false,
        reason: `Detected ${gpu.vramMb || 0}MB VRAM. ${preferred.label} best matches the current local setup policy.`
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
