'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { FURRY_ASSET_VERSION, getTemplate } = require('./catalog');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const KENNEY_URL = /^\/api\/streammonsters\/art\/kenney-([a-f0-9]{16})\.svg$/;

function readWebpMetadata(bytes) {
  if (bytes.length < 30 || bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    bytes.subarray(8, 12).toString('ascii') !== 'WEBP') return null;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.subarray(offset, offset + 4).toString('ascii');
    const length = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + length > bytes.length) return null;
    if (type === 'VP8L' && length >= 5 && bytes[data] === 0x2f) {
      const packed = bytes.readUInt32LE(data + 1);
      return {
        width: 1 + (packed & 0x3fff),
        height: 1 + ((packed >>> 14) & 0x3fff),
        hasAlpha: Boolean((packed >>> 28) & 1)
      };
    }
    if (type === 'VP8X' && length >= 10) {
      return {
        width: 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16),
        height: 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16),
        hasAlpha: Boolean(bytes[data] & 0x10)
      };
    }
    offset = data + length + (length % 2);
  }
  return null;
}

class StreamMonstersAssetRegistry {
  constructor({ pluginDir, kenneyBuilder = null, logger = null }) {
    this.pluginDir = path.resolve(pluginDir);
    this.assetRoot = path.join(
      this.pluginDir,
      'assets',
      'streammonsters',
      'furry'
    );
    this.manifestPath = path.join(this.assetRoot, 'manifest.json');
    this.kenneyBuilder = kenneyBuilder;
    this.logger = logger;
    this.cache = null;
  }

  getValidatedUrl(templateId, stage = 1) {
    return this.getAsset(templateId, stage)?.publicUrl || null;
  }

  getAsset(templateId, stage = 1) {
    const normalizedTemplateId = String(templateId?.templateId || templateId || '')
      .trim()
      .toLowerCase();
    const normalizedStage = Number(stage);
    if (![1, 2, 3].includes(normalizedStage)) return null;
    return this.audit().assets.get(`${normalizedTemplateId}:${normalizedStage}`) || null;
  }

  hasBundledAsset(templateId, stage = 1) {
    return Boolean(this.getAsset(templateId, stage));
  }

  resolveUrl(templateId, stage = 1, options = {}) {
    return this.resolveVisual({ templateId, stage, ...options })?.imageUrl || null;
  }

  resolveVisual({
    templateId,
    stage = 1,
    seed = null,
    element = null,
    fallbackUrl = null,
    fallbackVisualKey = null
  } = {}) {
    const asset = this.getAsset(templateId, stage);
    if (asset) {
      return {
        imageUrl: asset.publicUrl,
        visualSource: 'furry',
        visualKey: asset.stage === 1
          ? `furry:${asset.templateId}`
          : `furry:${asset.templateId}:stage-${asset.stage}`,
        assetVersion: asset.assetVersion,
        fallback: false
      };
    }
    const existingFallback = KENNEY_URL.exec(String(fallbackUrl || ''));
    if (existingFallback) {
      return {
        imageUrl: fallbackUrl,
        visualSource: 'kenney',
        visualKey: /^kenney:[a-f0-9]{16}$/.test(String(fallbackVisualKey || ''))
          ? fallbackVisualKey
          : `kenney:${existingFallback[1]}`,
        assetVersion: 'kenney-cc0-v1',
        fallback: true
      };
    }
    if (!this.kenneyBuilder || !seed || !element) return null;
    const built = this.kenneyBuilder.build({ seed, element });
    return {
      imageUrl: built.publicUrl,
      visualSource: built.visualSource,
      visualKey: built.visualKey,
      assetVersion: 'kenney-cc0-v1',
      fallback: true
    };
  }

  getIntegrity() {
    const audit = this.audit();
    return {
      assetVersion: audit.assetVersion || null,
      expected: audit.expected,
      available: audit.assets.size,
      healthy: audit.expected === 72 && audit.assets.size === 72
    };
  }

  invalidate() {
    this.cache = null;
  }

  refresh() {
    this.invalidate();
    return this.audit();
  }

  audit() {
    if (this.cache) return this.cache;
    let manifestBuffer;
    let manifestStat;
    let manifest;
    try {
      manifestStat = this.inspectContainedPath(this.manifestPath);
      if (!manifestStat?.isFile()) {
        return this.cacheAudit(this.emptyAudit());
      }
      manifestBuffer = fs.readFileSync(this.manifestPath);
      manifest = JSON.parse(manifestBuffer.toString('utf8'));
    } catch (error) {
      this.logInvalid(`manifest unavailable: ${error.message}`);
      return this.cacheAudit(this.emptyAudit());
    }
    const isLegacyPngManifest = manifest?.schemaVersion === 2 &&
      manifest?.assetVersion === 'furry-1.5.0';
    const isWebpManifest = manifest?.schemaVersion === 3 &&
      manifest?.assetVersion === FURRY_ASSET_VERSION;
    if (
      (!isLegacyPngManifest && !isWebpManifest) ||
      manifest?.productionMode !== 'bundled-only' ||
      !Array.isArray(manifest.assets)
    ) {
      return this.cacheAudit(this.emptyAudit());
    }
    const candidates = manifest.assets.flatMap(asset => {
      const templateId = String(asset?.templateId || '').trim().toLowerCase();
      const stage = Number(asset?.stage);
      const relativePath = String(asset?.assetPath || '').replace(/\\/g, '/');
      const dimensions = Array.isArray(asset?.dimensions)
        ? asset.dimensions.map(Number)
        : [];
      if (
        !getTemplate(templateId) ||
        ![1, 2, 3].includes(stage) ||
        !(isLegacyPngManifest
          ? /^assets\/streammonsters\/furry\/[a-z0-9/-]+\.png$/.test(relativePath)
          : /^assets\/streammonsters\/furry\/[a-z0-9/-]+\.webp$/.test(relativePath) &&
            asset?.mediaType === 'image/webp') ||
        dimensions[0] !== 1024 ||
        dimensions[1] !== 1024 ||
        !/^[a-f0-9]{64}$/i.test(String(asset?.sha256 || ''))
      ) {
        return [];
      }
      const absolutePath = path.resolve(this.pluginDir, relativePath);
      if (
        absolutePath === this.assetRoot ||
        !absolutePath.startsWith(`${this.assetRoot}${path.sep}`)
      ) {
        return [];
      }
      const stat = this.inspectContainedPath(absolutePath);
      return [{
        absolutePath,
        dimensions,
        expectedHash: String(asset.sha256).toLowerCase(),
        relativePath,
        stage,
        stat,
        templateId
      }];
    });
    const assets = new Map();
    candidates.forEach(candidate => {
      if (!candidate.stat?.isFile() || candidate.stat.isSymbolicLink()) return;
      let fileBuffer;
      try {
        fileBuffer = fs.readFileSync(candidate.absolutePath);
      } catch (_) {
        return;
      }
      const webp = isWebpManifest ? readWebpMetadata(fileBuffer) : null;
      const validImage = isLegacyPngManifest
        ? fileBuffer.length >= 24 && fileBuffer.subarray(0, 8).equals(PNG_SIGNATURE) &&
          fileBuffer.readUInt32BE(8) === 13 &&
          fileBuffer.subarray(12, 16).toString('ascii') === 'IHDR' &&
          fileBuffer.readUInt32BE(16) === 1024 && fileBuffer.readUInt32BE(20) === 1024
        : webp?.width === 1024 && webp?.height === 1024 && webp?.hasAlpha;
      if (!validImage || crypto.createHash('sha256').update(fileBuffer).digest('hex') !==
        candidate.expectedHash) {
        return;
      }
      const key = `${candidate.templateId}:${candidate.stage}`;
      if (assets.has(key)) return;
      assets.set(key, Object.freeze({
        assetVersion: manifest.assetVersion,
        templateId: candidate.templateId,
        stage: candidate.stage,
        absolutePath: candidate.absolutePath,
        publicUrl: `/plugins/stream-monsters/${candidate.relativePath}`,
        sha256: candidate.expectedHash
      }));
    });
    const value = Object.freeze({
      assetVersion: manifest.assetVersion,
      expected: manifest.assets.length,
      assets
    });
    return this.cacheAudit(value);
  }

  cacheAudit(value) {
    this.cache = value;
    return value;
  }

  emptyAudit() {
    return { expected: 0, assets: new Map() };
  }

  inspectContainedPath(absolutePath) {
    const relativeToRoot = path.relative(this.assetRoot, absolutePath);
    if (
      !relativeToRoot ||
      relativeToRoot.startsWith(`..${path.sep}`) ||
      relativeToRoot === '..' ||
      path.isAbsolute(relativeToRoot)
    ) {
      return null;
    }
    try {
      const relativeToPlugin = path.relative(this.pluginDir, absolutePath);
      let cursor = this.pluginDir;
      let stat = null;
      for (const part of relativeToPlugin.split(path.sep)) {
        cursor = path.join(cursor, part);
        stat = fs.lstatSync(cursor);
        if (stat.isSymbolicLink()) return null;
      }
      const normalizeRealPath = value => {
        const resolved = path.normalize(fs.realpathSync(value));
        return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
      };
      const realPluginDir = normalizeRealPath(this.pluginDir);
      const realAssetRoot = normalizeRealPath(this.assetRoot);
      const realAssetPath = normalizeRealPath(absolutePath);
      const isWithin = (root, target) => (
        target === root || target.startsWith(`${root}${path.sep}`)
      );
      if (
        !isWithin(realPluginDir, realAssetRoot) ||
        !isWithin(realAssetRoot, realAssetPath)
      ) {
        return null;
      }
      return stat;
    } catch (_) {
      return null;
    }
  }

  logInvalid(message) {
    const text = `[STREAM MONSTERS] Asset registry ${message}`;
    if (typeof this.logger === 'function') this.logger(text);
    else this.logger?.warn?.(text);
  }
}

module.exports = StreamMonstersAssetRegistry;
module.exports.readWebpMetadata = readWebpMetadata;
