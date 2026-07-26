'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { FURRY_ASSET_VERSION, getTemplate } = require('./catalog');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const KENNEY_URL = /^\/api\/streammonsters\/art\/kenney-([a-f0-9]{16})\.svg$/;

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
    if (
      manifest?.schemaVersion !== 2 ||
      manifest?.assetVersion !== FURRY_ASSET_VERSION ||
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
        !/^assets\/streammonsters\/furry\/[a-z0-9/-]+\.png$/.test(relativePath) ||
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
      if (
        fileBuffer.length < 24 ||
        !fileBuffer.subarray(0, 8).equals(PNG_SIGNATURE) ||
        fileBuffer.readUInt32BE(8) !== 13 ||
        fileBuffer.subarray(12, 16).toString('ascii') !== 'IHDR' ||
        fileBuffer.readUInt32BE(16) !== 1024 ||
        fileBuffer.readUInt32BE(20) !== 1024 ||
        crypto.createHash('sha256').update(fileBuffer).digest('hex') !==
          candidate.expectedHash
      ) {
        return;
      }
      const key = `${candidate.templateId}:${candidate.stage}`;
      if (assets.has(key)) return;
      assets.set(key, Object.freeze({
        assetVersion: manifest.assetVersion,
        templateId: candidate.templateId,
        stage: candidate.stage,
        absolutePath: candidate.absolutePath,
        publicUrl: `/plugins/streamalchemy/${candidate.relativePath}`,
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
