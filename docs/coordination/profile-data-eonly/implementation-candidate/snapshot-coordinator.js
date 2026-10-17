'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const CATEGORIES = Object.freeze([
  'globalSettings', 'pluginSettings', 'profileDatabases', 'userData', 'pluginFiles',
  'uploads', 'profileScopedPluginData', 'schnorrbecherPersistentState', 'credentialsAndSessions'
]);
const OPAQUE_CATEGORIES = Object.freeze(CATEGORIES.filter(category => category !== 'credentialsAndSessions'));
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ARTIFACTS = 3;
const DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const DEFAULT_GENERATION_TIMEOUT_MS = 60_000;

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalizeOptions(input = {}) {
  const operation = input.operation === 'import' ? 'import' : 'export';
  const selection = {};
  for (const category of CATEGORIES) selection[category] = input.selection?.[category] === true;
  const pluginFilter = Array.isArray(input.pluginFilter) && input.pluginFilter.length
    ? [...new Set(input.pluginFilter.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim().toLowerCase()))].sort()
    : null;
  if (selection.profileScopedPluginData && !selection.pluginFiles) {
    throw new Error('Profile-scoped plugin data requires Plugin Data Files');
  }
  if (selection.schnorrbecherPersistentState && !selection.profileScopedPluginData) {
    throw new Error('Persistent Schnorrbecher state requires profile-scoped plugin data');
  }
  const profileBinding = {};
  for (const key of ['sourceProfileId', 'targetProfileId', 'activeProfileId']) {
    const value = input.profileBinding?.[key];
    if (value !== undefined && value !== null && typeof value !== 'string') throw new Error(`Invalid ${key}`);
    profileBinding[key] = value || null;
  }
  const profilePluginIds = Array.isArray(input.profileBinding?.pluginIds)
    ? [...new Set(input.profileBinding.pluginIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim().toLowerCase()))].sort()
    : [];
  profileBinding.pluginIds = profilePluginIds;
  if (selection.profileDatabases || selection.profileScopedPluginData || selection.schnorrbecherPersistentState) {
    const resolvedProfile = operation === 'import' ? profileBinding.targetProfileId : profileBinding.activeProfileId;
    if (!resolvedProfile) throw new Error(`Resolved ${operation === 'import' ? 'target' : 'active'} profile ID is required for profile data`);
  }
  return { operation, selection, pluginFilter, profileBinding };
}

function requirements(options, risk = {}) {
  const selection = options.selection;
  const isFull = CATEGORIES.every(category => selection[category]);
  const hasOpaqueData = OPAQUE_CATEGORIES.some(category => selection[category]);
  return {
    full: isFull,
    sensitive: selection.credentialsAndSessions || risk.sensitive === true,
    unknown: hasOpaqueData || risk.unknown === true ||
      (options.operation === 'import' && risk.trustedProvenance !== true),
    legacyUnsigned: options.operation === 'import' && (risk.legacyUnsigned === true || risk.unsigned === true)
  };
}

function checkConsents(required, consents = {}) {
  const missing = Object.entries(required)
    .filter(([name, isRequired]) => isRequired && consents[name] !== true)
    .map(([name]) => name);
  if (missing.length) throw new Error(`Explicit confirmation required: ${missing.join(', ')}`);
}

async function collectBoundedBytes(generated, maxBytes, signal, reserveChunk) {
  const chunks = [];
  let size = 0;
  const append = chunk => {
    if (signal?.aborted) throw new Error('Snapshot generation canceled');
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw new Error('Prepared export byte quota exceeded');
    reserveChunk(bytes.length);
    chunks.push(bytes);
  };
  if (Buffer.isBuffer(generated) || generated instanceof Uint8Array || typeof generated === 'string') {
    append(generated);
  } else if (generated && generated.bytes !== undefined) {
    if (generated.finalized !== true) throw new Error('Archive generation did not finalize successfully');
    if (Buffer.isBuffer(generated.bytes) || generated.bytes instanceof Uint8Array || typeof generated.bytes === 'string') {
      append(generated.bytes);
    } else {
      for await (const chunk of generated.bytes) append(chunk);
    }
    return { bytes: Buffer.concat(chunks, size), warnings: Array.isArray(generated.warnings) ? generated.warnings.map(String) : [],
      warningRisk: generated.warningRisk || {} };
  } else if (generated && generated[Symbol.asyncIterator]) {
    for await (const chunk of generated) append(chunk);
  } else {
    throw new Error('Snapshot generator returned an invalid byte source');
  }
  return { bytes: Buffer.concat(chunks, size), warnings: [], warningRisk: {} };
}

class FileSnapshotStore {
  constructor(rootDir) {
    this.rootDir = path.resolve(rootDir);
  }

  async write(id, bytes) {
    if (!/^[a-f0-9]{48}$/.test(id)) throw new Error('Invalid artifact identifier');
    await fs.mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const directory = path.join(this.rootDir, id);
    await fs.mkdir(directory, { mode: 0o700 });
    try {
      await fs.writeFile(path.join(directory, '.ltth-export-owner'), 'ltth-eonly-export-v1\n', { flag: 'wx', mode: 0o600 });
      const file = path.join(directory, 'snapshot.bin');
      await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
      return { directory, file, size: bytes.length };
    } catch (error) {
      await this.remove({ directory });
      throw error;
    }
  }

  async read(artifact) {
    return fs.readFile(artifact.file);
  }

  async remove(artifact) {
    if (!artifact?.directory) return;
    const directory = path.resolve(artifact.directory);
    if (path.dirname(directory) !== this.rootDir || !/^[a-f0-9]{48}$/.test(path.basename(directory))) {
      throw new Error('Refusing cleanup outside the private artifact root');
    }
    const stat = await fs.lstat(directory).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (stat?.isSymbolicLink()) throw new Error('Refusing to follow an artifact reparse point');
    const owner = await fs.readFile(path.join(directory, '.ltth-export-owner'), 'utf8').catch(() => '');
    if (owner !== 'ltth-eonly-export-v1\n') throw new Error('Refusing cleanup of an unowned artifact directory');
    await fs.rm(directory, { recursive: true, force: true });
  }

  async cleanupOwnedArtifacts() {
    await fs.mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    for (const name of await fs.readdir(this.rootDir)) {
      if (!/^[a-f0-9]{48}$/.test(name)) continue;
      try {
        await this.remove({ directory: path.join(this.rootDir, name) });
      } catch (error) {
        if (!['ENOENT'].includes(error.code) && !/unowned|reparse point/i.test(error.message)) throw error;
      }
    }
  }
}

/**
 * E-only contract candidate. `generate` must return synthetic bytes in this
 * candidate; integrating BackupManager or producing a real ZIP is deliberately
 * out of scope until the archive/runtime gate is separately approved.
 */
class SnapshotCoordinator {
  constructor({ store, now = () => Number(process.hrtime.bigint() / 1_000_000n), ttlMs = DEFAULT_TTL_MS,
    maxArtifacts = DEFAULT_MAX_ARTIFACTS, maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
    generationTimeoutMs = DEFAULT_GENERATION_TIMEOUT_MS } = {}) {
    if (!store) throw new Error('A private snapshot store is required');
    this.store = store;
    this.now = now;
    this.ttlMs = ttlMs;
    this.maxArtifacts = maxArtifacts;
    this.maxTotalBytes = maxTotalBytes;
    this.generationTimeoutMs = generationTimeoutMs;
    this.previews = new Map();
    this.pendingGenerations = 0;
    this.pendingBytes = 0;
    this.closed = false;
    this.janitor = setInterval(() => { this.expire().catch(() => {}); }, Math.max(10, Math.min(ttlMs, 10_000)));
    this.janitor.unref?.();
  }

  async preview({ operation, selection, pluginFilter, profileBinding, consents, risk, generate, signal }) {
    if (this.closed) throw new Error('Snapshot coordinator is closed');
    const options = canonicalizeOptions({ operation, selection, pluginFilter, profileBinding });
    const required = requirements(options, risk);
    checkConsents(required, consents);
    if (typeof generate !== 'function') throw new Error('Snapshot generator is required');
    await this.expire();
    if (this.previews.size + this.pendingGenerations >= this.maxArtifacts) throw new Error('Prepared export quota exceeded');
    this.pendingGenerations += 1;
    let reservedBytes = 0;
    try {
      if (signal?.aborted) throw new Error('Snapshot generation canceled');
      const controller = new AbortController();
      let timer;
      let abortListener;
      const timeoutOrCancel = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Snapshot generation timed out'));
        }, this.generationTimeoutMs);
        abortListener = () => {
          controller.abort();
          reject(new Error('Snapshot generation canceled'));
        };
        signal?.addEventListener('abort', abortListener, { once: true });
      });
      let generated;
      const generation = Promise.resolve().then(() => generate(options, { signal: controller.signal }));
      try {
        generated = await Promise.race([generation, timeoutOrCancel]);
      } catch (error) {
        controller.abort();
        // The generator must acknowledge cancellation and release its own stage
        // before this bounded slot is released or an artifact is considered clean.
        await Promise.allSettled([generation]);
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abortListener);
      }
      if (signal?.aborted) throw new Error('Snapshot generation canceled');
      const reserveChunk = count => {
        if (this.totalBytes() + this.pendingBytes + count > this.maxTotalBytes) throw new Error('Prepared export byte quota exceeded');
        this.pendingBytes += count;
        reservedBytes += count;
      };
      const { bytes, warnings, warningRisk } = await collectBoundedBytes(generated, this.maxTotalBytes - this.totalBytes(), signal, reserveChunk);
      const finalRequirements = { ...required };
      if (warningRisk.sensitive === true) finalRequirements.sensitive = true;
      if (warningRisk.unknown === true) finalRequirements.unknown = true;
      if (options.operation === 'import' && (warningRisk.unsigned === true || warningRisk.legacyUnsigned === true)) {
        finalRequirements.legacyUnsigned = true;
        finalRequirements.unknown = true;
      }
      const id = crypto.randomBytes(24).toString('hex');
      let artifact;
      try {
        artifact = await this.store.write(id, bytes);
        const storedBytes = await this.store.read(artifact);
        const hash = sha256(bytes);
        if (sha256(storedBytes) !== hash) throw new Error('Snapshot changed while preparing preview');
        const previewToken = crypto.randomBytes(32).toString('hex');
        this.previews.set(previewToken, {
          artifact, hash, size: bytes.length, options, required: finalRequirements, warnings,
          timestamp: this.now(), state: 'ready'
        });
      return { operation: options.operation, previewToken, archiveHash: hash, size: bytes.length, selection: options.selection,
        pluginFilter: options.pluginFilter, profileBinding: options.profileBinding,
        warnings, requiredConfirmations: finalRequirements, expiresInMs: this.ttlMs };
      } catch (error) {
        if (artifact) await this.store.remove(artifact);
        throw error;
      }
    } finally {
      this.pendingGenerations -= 1;
      this.pendingBytes -= reservedBytes;
    }
  }

  async confirm({ previewToken, operation, archiveHash, selection, pluginFilter, profileBinding, warnings, consents }) {
    const entry = this.previews.get(previewToken);
    const age = entry ? this.now() - entry.timestamp : -1;
    if (!entry || entry.state !== 'ready') throw new Error('Preview expired or already consumed');
    if (!Number.isFinite(age) || age < 0 || age >= this.ttlMs) {
      await this.discard(previewToken, entry);
      throw new Error('Preview expired or already consumed');
    }
    const options = canonicalizeOptions({ operation, selection, pluginFilter, profileBinding });
    if (JSON.stringify(options) !== JSON.stringify(entry.options) || archiveHash !== entry.hash ||
      JSON.stringify(warnings || []) !== JSON.stringify(entry.warnings)) {
      await this.discard(previewToken, entry);
      throw new Error('Preview selection or archive hash changed');
    }
    checkConsents(entry.required, consents);
    if (entry.warnings.length && consents?.warnings !== true) throw new Error('Explicit confirmation required: warnings');
    entry.state = 'confirmed';
    entry.downloadToken = crypto.randomBytes(32).toString('hex');
    entry.confirmedHash = archiveHash;
    return { downloadToken: entry.downloadToken, archiveHash: entry.hash, size: entry.size };
  }

  async consume({ operation, previewToken, downloadToken }) {
    const entry = this.previews.get(previewToken);
    if (!entry || entry.options.operation !== (operation || 'export') || entry.state !== 'confirmed' || entry.downloadToken !== downloadToken) {
      throw new Error('Invalid or already-used download token');
    }
    this.previews.delete(previewToken);
    entry.state = 'claimed';
    try {
      const age = this.now() - entry.timestamp;
      if (!Number.isFinite(age) || age < 0 || age >= this.ttlMs) throw new Error('Prepared export expired');
      const bytes = Buffer.from(await this.store.read(entry.artifact));
      if (sha256(bytes) !== entry.confirmedHash || bytes.length !== entry.size) {
        throw new Error('Prepared archive hash mismatch');
      }
      return { bytes, archiveHash: entry.hash };
    } finally {
      await this.store.remove(entry.artifact);
      entry.state = 'disposed';
    }
  }

  async download(input) {
    return this.consume({ ...input, operation: 'export' });
  }

  async consumeImport(input) {
    return this.consume({ ...input, operation: 'import' });
  }

  async directExport() {
    throw new Error('Direct export requires the preview and one-time confirmation flow');
  }

  async directImport() {
    throw new Error('Direct import requires the preview and one-time confirmation flow');
  }

  async close() {
    if (this.pendingGenerations > 0) throw new Error('Wait for active generators to acknowledge cancellation before closing');
    this.closed = true;
    clearInterval(this.janitor);
    for (const [token, entry] of this.previews) await this.discard(token, entry);
  }

  async cancel(previewToken) {
    const entry = this.previews.get(previewToken);
    if (entry) await this.discard(previewToken, entry);
  }

  async expire() {
    const now = this.now();
    for (const [token, entry] of this.previews) {
      if (now - entry.timestamp >= this.ttlMs) await this.discard(token, entry);
    }
  }

  totalBytes() {
    let total = 0;
    for (const entry of this.previews.values()) total += entry.size;
    return total;
  }

  async discard(token, entry) {
    this.previews.delete(token);
    await this.store.remove(entry.artifact);
    entry.state = 'disposed';
  }
}

module.exports = {
  CATEGORIES, OPAQUE_CATEGORIES, DEFAULT_TTL_MS, DEFAULT_MAX_ARTIFACTS, DEFAULT_GENERATION_TIMEOUT_MS,
  DEFAULT_MAX_TOTAL_BYTES, FileSnapshotStore, SnapshotCoordinator,
  canonicalizeOptions, requirements, sha256
};

