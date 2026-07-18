const fs = require('fs');
const path = require('path');

const MAX_HISTORY_AGE_MS = 168 * 60 * 60 * 1000;

function normalizeSuperfanIdentityAliases(data = {}) {
  const aliases = [];
  const append = (prefix, value, normalize = false) => {
    const text = String(value ?? '').trim();
    if (!text) return;
    const alias = `${prefix}:${normalize ? text.toLowerCase() : text}`;
    if (!aliases.includes(alias)) aliases.push(alias);
  };

  const userId = [data.userId, data.user?.id]
    .map(value => String(value ?? '').trim())
    .find(Boolean);
  const handle = [data.uniqueId, data.username, data.nickname]
    .map(value => String(value ?? '').trim())
    .find(Boolean);
  append('id', userId);
  append('user', handle, true);
  return aliases;
}

function normalizeSuperfanIdentity(data = {}) {
  return normalizeSuperfanIdentityAliases(data)[0] || null;
}

function toIdentityAliases(identity) {
  const values = Array.isArray(identity) ? identity : [identity];
  return values
    .map(value => String(value ?? '').trim())
    .filter((value, index, aliases) => value && aliases.indexOf(value) === index);
}

class SuperfanFinaleHistory {
  constructor({ filePath, log = () => {}, now = () => Date.now() }) {
    this.filePath = filePath;
    this.log = log;
    this.now = now;
    this.entries = new Map();
    this.aliases = new Map();
  }

  load() {
    this.entries.clear();
    this.aliases.clear();
    const backupPath = `${this.filePath}.bak`;
    let parsed = null;
    let loadedFromBackup = false;

    if (fs.existsSync(this.filePath)) {
      try {
        parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      } catch (error) {
        this.log(`Failed to load Superfan finale history: ${error.message}`);
      }
    }

    if (!parsed && fs.existsSync(backupPath)) {
      try {
        parsed = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        loadedFromBackup = true;
      } catch (error) {
        this.log(`Failed to load Superfan finale history backup: ${error.message}`);
      }
    }

    if (!parsed) return 0;

    const loadedAt = this.now();
    const cutoff = loadedAt - MAX_HISTORY_AGE_MS;
    for (const [identity, timestamp] of Object.entries(parsed.entries || {})) {
      if (typeof identity === 'string' && Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= loadedAt) {
        this.entries.set(identity, timestamp);
      }
    }
    for (const [alias, canonical] of Object.entries(parsed.aliases || {})) {
      if (typeof alias === 'string' && typeof canonical === 'string' && this.entries.has(canonical) && alias !== canonical) {
        this.aliases.set(alias, canonical);
      }
    }

    if (loadedFromBackup && !fs.existsSync(this.filePath)) {
      try {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.renameSync(backupPath, this.filePath);
      } catch (error) {
        this.log(`Failed to restore Superfan finale history backup: ${error.message}`);
      }
    }
    return this.entries.size;
  }

  resolve(identity, { persistMigration = false } = {}) {
    const identities = toIdentityAliases(identity);
    if (identities.length === 0) return { canonical: null, changed: false };

    const stableId = identities.find(alias => alias.startsWith('id:'));
    const conflictingAliases = new Set();
    const resolved = identities.map(alias => {
      const mapped = this.aliases.get(alias);
      if (stableId && mapped?.startsWith('id:') && mapped !== stableId) {
        conflictingAliases.add(alias);
        if (typeof this.log === 'function') {
          this.log(`Superfan identity alias conflict: ${alias} already belongs to ${mapped}; keeping ${stableId} separate`);
        }
        return alias;
      }
      return mapped || alias;
    });
    const existing = resolved.find(alias => this.entries.has(alias));
    const canonical = stableId || existing || resolved[0];
    let changed = false;
    let latest = this.entries.get(canonical);

    for (const source of new Set(resolved)) {
      if (source === canonical || !this.entries.has(source)) continue;
      const timestamp = this.entries.get(source);
      if (!Number.isFinite(latest) || timestamp > latest) latest = timestamp;
      this.entries.delete(source);
      changed = true;
    }
    if (Number.isFinite(latest) && this.entries.get(canonical) !== latest) {
      this.entries.set(canonical, latest);
      changed = true;
    }

    for (const alias of identities) {
      if (alias === canonical || conflictingAliases.has(alias)) continue;
      if (this.aliases.get(alias) !== canonical) {
        this.aliases.set(alias, canonical);
        changed = true;
      }
    }
    for (const [alias, target] of this.aliases) {
      if (target !== canonical && resolved.includes(target)) {
        this.aliases.set(alias, canonical);
        changed = true;
      }
    }

    if (changed && persistMigration && this.entries.has(canonical)) {
      try {
        this.save();
      } catch (error) {
        this.log(`Failed to persist Superfan finale history migration: ${error.message}`);
      }
    }
    return { canonical, changed };
  }

  isEligible(identity, cooldownHours, at = this.now()) {
    const { canonical } = this.resolve(identity, { persistMigration: true });
    if (!canonical) return true;
    const last = this.entries.get(canonical);
    return !Number.isFinite(last) || at - last >= cooldownHours * 60 * 60 * 1000;
  }

  markAccepted(identity, at = this.now()) {
    const { canonical } = this.resolve(identity);
    if (!canonical) return null;
    this.entries.set(canonical, at);
    try {
      this.save();
    } catch (error) {
      this.log(`Failed to persist Superfan finale history: ${error.message}`);
    }
    return at;
  }

  getLastAcceptedAt(identity) {
    const { canonical } = this.resolve(identity);
    return canonical ? this.entries.get(canonical) ?? null : null;
  }

  snapshot() { return Object.fromEntries(this.entries); }

  aliasSnapshot() {
    return Object.fromEntries([...this.aliases].filter(([, canonical]) => this.entries.has(canonical)));
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    const backupPath = `${this.filePath}.bak`;
    fs.writeFileSync(tempPath, JSON.stringify({
      version: 2,
      entries: this.snapshot(),
      aliases: this.aliasSnapshot()
    }, null, 2), 'utf8');

    try {
      try {
        fs.renameSync(tempPath, this.filePath);
        return;
      } catch (error) {
        if (!fs.existsSync(this.filePath)) throw error;
      }

      if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true });
      fs.renameSync(this.filePath, backupPath);
      try {
        fs.renameSync(tempPath, this.filePath);
      } catch (error) {
        try {
          fs.renameSync(backupPath, this.filePath);
        } catch (restoreError) {
          this.log(`Failed to restore Superfan finale history backup: ${restoreError.message}`);
        }
        throw error;
      }
      fs.rmSync(backupPath, { force: true });
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
  }
}

module.exports = {
  MAX_HISTORY_AGE_MS,
  SuperfanFinaleHistory,
  normalizeSuperfanIdentity,
  normalizeSuperfanIdentityAliases
};
