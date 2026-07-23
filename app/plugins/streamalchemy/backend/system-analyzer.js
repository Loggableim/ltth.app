const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const ModelCatalog = require('./model-catalog');

const WINDOWS_ADAPTER_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$pnpPropertyCommand = Get-Command Get-PnpDeviceProperty -ErrorAction SilentlyContinue',
  '$adapters = @(Get-CimInstance Win32_VideoController | ForEach-Object {',
  '  $video = $_',
  '  $bus = $null',
  '  $address = $null',
  '  $locationPaths = @()',
  '  if ($pnpPropertyCommand -and $video.PNPDeviceID) {',
  '    $bus = (Get-PnpDeviceProperty -InstanceId $video.PNPDeviceID -KeyName "DEVPKEY_Device_BusNumber" -ErrorAction SilentlyContinue).Data',
  '    $address = (Get-PnpDeviceProperty -InstanceId $video.PNPDeviceID -KeyName "DEVPKEY_Device_Address" -ErrorAction SilentlyContinue).Data',
  '    $locationPaths = @((Get-PnpDeviceProperty -InstanceId $video.PNPDeviceID -KeyName "DEVPKEY_Device_LocationPaths" -ErrorAction SilentlyContinue).Data)',
  '  }',
  '  $pciBusId = $null',
  '  if ($null -ne $bus -and $null -ne $address) {',
  '    $addressValue = [uint32]$address',
  '    $device = [math]::Floor($addressValue / 65536)',
  '    $function = $addressValue % 65536',
  '    $pciBusId = "0000:{0:x2}:{1:x2}.{2}" -f [uint32]$bus,[uint32]$device,[uint32]$function',
  '  }',
  '  [pscustomobject]@{ Name=$video.Name; AdapterRAM=$video.AdapterRAM; DriverVersion=$video.DriverVersion; PNPDeviceID=$video.PNPDeviceID; DeviceID=$video.DeviceID; Status=$video.Status; PciBusId=$pciBusId; LocationPaths=$locationPaths }',
  '})',
  '$registry = @(Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Video\\*\\0000" -ErrorAction SilentlyContinue | ForEach-Object {',
  '  [pscustomobject]@{ DriverDesc=$_.DriverDesc; MatchingDeviceId=$_.MatchingDeviceId; MemorySize=[string]$_."HardwareInformation.qwMemorySize" }',
  '})',
  '[pscustomobject]@{ adapters=$adapters; registry=$registry } | ConvertTo-Json -Depth 5 -Compress'
].join('; ');
const VIRTUAL_ADAPTER_PATTERN = /\b(microsoft basic|remote display|rdp|virtual|vmware|virtualbox|hyper-v|citrix|parallels|indirect display|dummy)\b/i;

class SystemAnalyzer {
  constructor({
    execFileImpl = execFile,
    osImpl = os,
    fetchImpl = global.fetch,
    fsImpl = fs,
    catalog = new ModelCatalog(),
    backendProbe = null
  } = {}) {
    this.execFile = execFileImpl;
    this.os = osImpl;
    this.fetch = fetchImpl;
    this.fs = fsImpl;
    this.catalog = catalog;
    this.backendProbe = backendProbe || (vendor => this.probeVendorBackend(vendor));
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
    return this.backendProbe('nvidia').then(records => records.map(record => this.normalizeAdapter({
      name: record.name,
      vendor: 'nvidia',
      vramMb: record.vramMb,
      driver: record.driver,
      pnpDeviceId: record.uuid || record.pciBusId || `nvidia-smi:${record.name}`,
      pciBusId: record.pciBusId,
      backendIndex: record.index,
      backendSelectionState: 'verified',
      backendIdentity: record
    }))).catch(() => []);
  }

  detectWindowsGpu() {
    return this.detectWindowsAdapters().then(adapters => this.selectPreferredAdapter(adapters));
  }

  detectWindowsAdapters() {
    return new Promise(resolve => {
      this.execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_ADAPTER_SCRIPT],
        async (error, stdout) => {
          if (error || !stdout) {
            resolve([]);
            return;
          }

          const adapters = this.parseWindowsAdapters(stdout);
          resolve(await this.mapBackendIdentities(adapters));
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
          pnpDeviceId: row.PNPDeviceID || row.DeviceID || row.Name,
          pciBusId: row.PciBusId || row.PCIBusId || row.PciBdf || null,
          locationPaths: row.LocationPaths
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

  async mapBackendIdentities(adapters = []) {
    const assignments = new Map();
    const vendors = [...new Set(adapters.map(adapter => adapter.vendor).filter(vendor => (
      ['nvidia', 'intel', 'amd'].includes(vendor)
    )))];
    await Promise.all(vendors.map(async vendor => {
      const vendorAdapters = adapters.filter(adapter => adapter.vendor === vendor);
      let backendRecords = [];
      try {
        const probed = await this.backendProbe(vendor);
        backendRecords = Array.isArray(probed)
          ? probed.map(record => this.normalizeBackendRecord(record, vendor)).filter(Boolean)
          : [];
      } catch (_) {}
      const usedRecords = new Set();
      for (const adapter of vendorAdapters) {
        const matchingRecord = this.findBackendRecord(
          adapter,
          vendorAdapters,
          backendRecords,
          usedRecords
        );
        if (matchingRecord) {
          usedRecords.add(matchingRecord);
          assignments.set(adapter, {
            backendIndex: matchingRecord.index,
            backendSelectionState: 'verified',
            backendIdentity: {
              source: matchingRecord.source,
              index: matchingRecord.index,
              uuid: matchingRecord.uuid,
              pciBusId: matchingRecord.pciBusId,
              name: matchingRecord.name
            }
          });
          continue;
        }
        if (vendorAdapters.length === 1 && backendRecords.length === 0) {
          assignments.set(adapter, {
            backendIndex: 0,
            backendSelectionState: 'single_adapter_fallback',
            backendIdentity: {
              source: 'single-adapter-fallback',
              index: 0,
              uuid: null,
              pciBusId: adapter.pciBusId,
              name: adapter.name
            }
          });
          continue;
        }
        const normalizedName = this.normalizeAdapterName(adapter.name);
        const indistinguishable = vendorAdapters.filter(candidate => (
          this.normalizeAdapterName(candidate.name) === normalizedName
        )).length > 1;
        assignments.set(adapter, {
          backendIndex: null,
          backendSelectionState: indistinguishable ? 'ambiguous' : 'unavailable',
          backendIdentity: null
        });
      }
    }));
    return adapters.map(adapter => ({
      ...adapter,
      ...(assignments.get(adapter) || {
        backendIndex: null,
        backendSelectionState: 'unsupported',
        backendIdentity: null
      })
    }));
  }

  findBackendRecord(adapter, vendorAdapters, backendRecords, usedRecords) {
    const pciBusId = this.normalizePciBusId(adapter.pciBusId);
    if (pciBusId) {
      const pciMatches = backendRecords.filter(record => (
        !usedRecords.has(record) && record.pciBusId === pciBusId
      ));
      if (pciMatches.length === 1) return pciMatches[0];
    }
    const backendUuid = String(adapter.backendUuid || '').trim().toLowerCase();
    if (backendUuid) {
      const uuidMatches = backendRecords.filter(record => (
        !usedRecords.has(record) &&
        String(record.uuid || '').trim().toLowerCase() === backendUuid
      ));
      if (uuidMatches.length === 1) return uuidMatches[0];
    }
    const normalizedName = this.normalizeAdapterName(adapter.name);
    const adapterNameCount = vendorAdapters.filter(candidate => (
      this.normalizeAdapterName(candidate.name) === normalizedName
    )).length;
    const nameMatches = backendRecords.filter(record => (
      !usedRecords.has(record) &&
      this.normalizeAdapterName(record.name) === normalizedName
    ));
    return adapterNameCount === 1 && nameMatches.length === 1 ? nameMatches[0] : null;
  }

  normalizeBackendRecord(record, vendor) {
    const index = Number(record?.index);
    if (!Number.isInteger(index) || index < 0) return null;
    return {
      source: record.source || this.probeSourceForVendor(vendor),
      index,
      name: String(record.name || '').trim() || null,
      uuid: String(record.uuid || '').trim() || null,
      pciBusId: this.normalizePciBusId(record.pciBusId),
      vramMb: Math.max(0, Number(record.vramMb) || 0),
      driver: String(record.driver || '').trim() || null
    };
  }

  probeVendorBackend(vendor) {
    const probes = {
      nvidia: {
        file: 'nvidia-smi',
        args: [
          '--query-gpu=index,name,uuid,pci.bus_id,memory.total,driver_version',
          '--format=csv,noheader,nounits'
        ],
        parse: stdout => this.parseNvidiaSmi(stdout)
      },
      intel: {
        file: 'xpu-smi',
        args: ['discovery', '-j'],
        parse: stdout => this.parseXpuSmi(stdout)
      },
      amd: {
        file: 'rocm-smi',
        args: ['--showuniqueid', '--showbus', '--showproductname', '--json'],
        parse: stdout => this.parseRocmSmi(stdout)
      }
    };
    const probe = probes[vendor];
    if (!probe) return Promise.resolve([]);
    return new Promise(resolve => {
      this.execFile(probe.file, probe.args, (error, stdout) => {
        if (error || !stdout) {
          resolve([]);
          return;
        }
        try {
          resolve(probe.parse(stdout));
        } catch (_) {
          resolve([]);
        }
      });
    });
  }

  parseNvidiaSmi(stdout) {
    return String(stdout || '').trim().split(/\r?\n/).filter(Boolean).map((line, fallbackIndex) => {
      const fields = line.split(',').map(value => value.trim());
      if (fields.length >= 6 && /^\d+$/.test(fields[0])) {
        return {
          source: 'nvidia-smi',
          index: Number(fields[0]),
          name: fields[1],
          uuid: fields[2],
          pciBusId: fields[3],
          vramMb: Number.parseInt(fields[4], 10) || 0,
          driver: fields[5]
        };
      }
      return {
        source: 'nvidia-smi',
        index: fallbackIndex,
        name: fields[0],
        uuid: null,
        pciBusId: null,
        vramMb: Number.parseInt(String(fields[1] || '').replace(/[^\d]/g, ''), 10) || 0,
        driver: fields[2] || null
      };
    });
  }

  parseXpuSmi(stdout) {
    const payload = JSON.parse(String(stdout || '{}'));
    const rows = payload.device_list || payload.deviceList || payload.devices || [];
    return (Array.isArray(rows) ? rows : []).map((row, fallbackIndex) => ({
      source: 'xpu-smi',
      index: Number.parseInt(row.device_id ?? row.deviceId ?? row.index ?? fallbackIndex, 10),
      name: row.device_name || row.deviceName || row.name,
      uuid: row.uuid || row.device_uuid || row.deviceUuid || null,
      pciBusId: row.pci_bdf_address || row.pciBdfAddress || row.pci_address || row.pciAddress || null
    }));
  }

  parseRocmSmi(stdout) {
    const payload = JSON.parse(String(stdout || '{}'));
    return Object.entries(payload).map(([key, row], fallbackIndex) => ({
      source: 'rocm-smi',
      index: Number.parseInt(String(key).replace(/[^\d]/g, ''), 10) || fallbackIndex,
      name: row['Card series'] || row['Card model'] || row['Card SKU'] || row.name || key,
      uuid: row['Unique ID'] || row.UniqueID || row.uuid || null,
      pciBusId: row['PCI Bus'] || row.PCIBus || row.pci_bus || null
    }));
  }

  probeSourceForVendor(vendor) {
    return {
      nvidia: 'nvidia-smi',
      intel: 'xpu-smi',
      amd: 'rocm-smi'
    }[vendor] || 'unknown';
  }

  normalizePciBusId(value) {
    const text = String(value || '').trim().toLowerCase();
    const match = text.match(/(?:^|[^0-9a-f])(?:([0-9a-f]{4,8}):)?([0-9a-f]{2}):([0-9a-f]{2})[.:]([0-7])(?:$|[^0-9a-f])/i);
    if (!match) return null;
    const domain = String(match[1] || '0000').slice(-4).padStart(4, '0');
    return `${domain}:${match[2]}:${match[3]}.${match[4]}`;
  }

  normalizeAdapterName(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  normalizeAdapter({
    name,
    vendor,
    vramMb,
    driver,
    pnpDeviceId,
    pciBusId = null,
    locationPaths = null,
    backendIndex = null,
    backendSelectionState = null,
    backendIdentity = null
  }) {
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
      pciBusId: this.normalizePciBusId(pciBusId),
      locationPaths: Array.isArray(locationPaths)
        ? locationPaths.filter(Boolean).map(value => String(value))
        : [],
      backendIndex,
      backendSelectionState,
      backendIdentity,
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
