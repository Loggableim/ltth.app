const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const ModelCatalog = require('./model-catalog');

const WINDOWS_ADAPTER_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$adapters = @(Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion,PNPDeviceID,DeviceID,Status)',
  '$registry = @(Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Video\\*\\0000" -ErrorAction SilentlyContinue | ForEach-Object {',
  '  [pscustomobject]@{ DriverDesc=$_.DriverDesc; MatchingDeviceId=$_.MatchingDeviceId; MemorySize=[string]$_."HardwareInformation.qwMemorySize" }',
  '})',
  '[pscustomobject]@{ adapters=$adapters; registry=$registry } | ConvertTo-Json -Depth 5 -Compress'
].join('; ');
const VIRTUAL_ADAPTER_PATTERN = /\b(microsoft basic|remote display|rdp|virtual|vmware|virtualbox|hyper-v|citrix|parallels|indirect display|dummy)\b/i;

class SystemAnalyzer {
  constructor({ execFileImpl = execFile, osImpl = os, fetchImpl = global.fetch, fsImpl = fs, catalog = new ModelCatalog() } = {}) {
    this.execFile = execFileImpl;
    this.os = osImpl;
    this.fetch = fetchImpl;
    this.fs = fsImpl;
    this.catalog = catalog;
  }

  async analyze({ comfyUrl, comfyRootDir = null } = {}) {
    const adapters = await this.detectAdapters();
    const gpu = this.selectPreferredAdapter(adapters);
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
      adapters,
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
    return this.detectAdapters().then(adapters => this.selectPreferredAdapter(adapters));
  }

  detectAdapters() {
    if (this.os.platform() === 'win32') {
      return this.detectWindowsAdapters();
    }
    return new Promise(resolve => {
      this.execFile(
        'nvidia-smi',
        ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'],
        async (error, stdout) => {
          if (!error && stdout) {
            const firstLine = stdout.trim().split(/\r?\n/)[0];
            const [name, memory, driver] = firstLine.split(',').map(part => part.trim());
            const vramMb = Number.parseInt(String(memory).replace(/[^\d]/g, ''), 10) || 0;
            resolve([this.normalizeAdapter({
              name,
              vendor: 'nvidia',
              vramMb,
              driver,
              pnpDeviceId: `nvidia-smi:${name}`
            })]);
            return;
          }

          resolve([]);
        }
      );
    });
  }

  detectWindowsGpu() {
    return this.detectWindowsAdapters().then(adapters => this.selectPreferredAdapter(adapters));
  }

  detectWindowsAdapters() {
    return new Promise(resolve => {
      this.execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_ADAPTER_SCRIPT],
        (error, stdout) => {
          if (error || !stdout) {
            resolve([]);
            return;
          }

          resolve(this.parseWindowsAdapters(stdout));
        }
      );
    });
  }

  parseWindowsAdapters(stdout) {
    let payload;
    try {
      payload = JSON.parse(String(stdout).trim());
    } catch (_) {
      return this.parseLegacyFixture(stdout);
    }
    const adapterRows = Array.isArray(payload?.adapters) ? payload.adapters : (payload?.adapters ? [payload.adapters] : []);
    const registryRows = Array.isArray(payload?.registry) ? payload.registry : (payload?.registry ? [payload.registry] : []);
    return adapterRows
      .filter(row => this.isPhysicalAdapter(row))
      .map(row => {
        const registry = this.findRegistryAdapter(row, registryRows);
        const cimBytes = this.parseBytes(row.AdapterRAM);
        const registryBytes = this.parseBytes(registry?.MemorySize ?? registry?.['HardwareInformation.qwMemorySize']);
        const bytes = registryBytes > cimBytes ? registryBytes : cimBytes;
        return this.normalizeAdapter({
          name: row.Name,
          vendor: this.vendorForName(row.Name),
          vramMb: bytes > 0 ? Math.round(bytes / 1024 / 1024) : 0,
          driver: row.DriverVersion || null,
          pnpDeviceId: row.PNPDeviceID || row.DeviceID || row.Name
        });
      });
  }

  parseLegacyFixture(stdout) {
    const text = String(stdout).trim();
    if (/nvidia/i.test(text) && text.includes(',')) {
      const [name, memory, driver] = text.split(/\r?\n/)[0].split(',').map(value => value.trim());
      return [this.normalizeAdapter({
        name,
        vendor: 'nvidia',
        vramMb: Number.parseInt(String(memory).replace(/[^\d]/g, ''), 10) || 0,
        driver,
        pnpDeviceId: `legacy:${name}`
      })];
    }
    const row = {};
    text.split(/[;\r\n]+/).forEach(part => {
      const [key, ...rest] = part.split('=');
      if (key && rest.length) row[key.trim()] = rest.join('=').trim();
    });
    if (!row.Name || !this.isPhysicalAdapter(row)) return [];
    return [this.normalizeAdapter({
      name: row.Name,
      vendor: this.vendorForName(row.Name),
      vramMb: Math.round(this.parseBytes(row.AdapterRAM) / 1024 / 1024),
      driver: row.DriverVersion || null,
      pnpDeviceId: row.PNPDeviceID || `legacy:${row.Name}`
    })];
  }

  normalizeAdapter({ name, vendor, vramMb, driver, pnpDeviceId }) {
    const normalizedName = String(name || '').trim();
    const normalizedPnp = String(pnpDeviceId || normalizedName).trim().toLowerCase();
    const memory = Math.max(0, Number(vramMb) || 0);
    return {
      id: `gpu-${crypto.createHash('sha256').update(normalizedPnp).digest('hex').slice(0, 16)}`,
      name: normalizedName || null,
      vendor: vendor || this.vendorForName(normalizedName),
      architecture: this.architectureForName(normalizedName),
      vramMb: memory,
      vramGb: Math.round((memory / 1024) * 10) / 10,
      memoryState: memory > 0 ? 'known' : 'unknown',
      driver: driver || null,
      pnpDeviceId: pnpDeviceId || null,
      state: normalizedName ? 'detected' : 'not_detected'
    };
  }

  selectPreferredAdapter(adapters = []) {
    if (!adapters.length) {
      return {
        id: null,
        name: null,
        vendor: null,
        architecture: 'unknown',
        vramMb: 0,
        vramGb: 0,
        memoryState: 'unknown',
        driver: null,
        state: 'not_detected'
      };
    }
    const vendorScore = { nvidia: 4, intel: 3, amd: 2, unknown: 1 };
    return [...adapters].sort((left, right) => (
      (vendorScore[right.vendor] || 0) - (vendorScore[left.vendor] || 0) ||
      right.vramMb - left.vramMb ||
      left.id.localeCompare(right.id)
    ))[0];
  }

  isPhysicalAdapter(row = {}) {
    const value = `${row.Name || ''} ${row.PNPDeviceID || ''} ${row.DeviceID || ''}`;
    return Boolean(String(row.Name || '').trim()) && !VIRTUAL_ADAPTER_PATTERN.test(value);
  }

  findRegistryAdapter(adapter, rows) {
    const pnp = String(adapter.PNPDeviceID || '').toLowerCase();
    const name = String(adapter.Name || '').trim().toLowerCase();
    return rows.find(row => {
      const matchingId = String(row.MatchingDeviceId || '').toLowerCase();
      return (matchingId && pnp.includes(matchingId)) ||
        String(row.DriverDesc || '').trim().toLowerCase() === name;
    }) || null;
  }

  parseBytes(value) {
    try {
      const digits = String(value ?? '').replace(/[^\d]/g, '');
      if (!digits) return 0;
      const parsed = BigInt(digits);
      return parsed > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(parsed);
    } catch (_) {
      return 0;
    }
  }

  vendorForName(name) {
    const lower = String(name || '').toLowerCase();
    if (lower.includes('nvidia') || lower.includes('geforce')) return 'nvidia';
    if (lower.includes('amd') || lower.includes('radeon')) return 'amd';
    if (lower.includes('intel')) return 'intel';
    return 'unknown';
  }

  architectureForName(name) {
    const lower = String(name || '').toLowerCase();
    if (/intel.*arc.*a770/.test(lower)) return 'arc_a770';
    if (/nvidia|geforce/.test(lower) && /\brtx\s*(20|30|40|50)\d{2}\b/.test(lower)) return 'rtx_20_plus';
    if (/nvidia|geforce/.test(lower) && /\bgtx\s*10\d{2}\b/.test(lower)) return 'gtx_10_legacy';
    if (/amd|radeon/.test(lower)) return 'amd_radeon';
    return 'unknown';
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
