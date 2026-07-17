const fs = require('fs');
const path = require('path');

const MAX_HISTORY_AGE_MS = 168 * 60 * 60 * 1000;

function normalizeSuperfanIdentity(data = {}) {
  const userId = String(data.userId ?? data.user?.id ?? '').trim();
  if (userId) return `id:${userId}`;
  const handle = String(data.uniqueId || data.username || data.nickname || '').trim().toLowerCase();
  return handle ? `user:${handle}` : null;
}

class SuperfanFinaleHistory {
  constructor({ filePath, log = () => {}, now = () => Date.now() }) {
    this.filePath = filePath;
    this.log = log;
    this.now = now;
    this.entries = new Map();
  }

  load() {
    this.entries.clear();
    if (!fs.existsSync(this.filePath)) return 0;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      const cutoff = this.now() - MAX_HISTORY_AGE_MS;
      for (const [identity, timestamp] of Object.entries(parsed.entries || {})) {
        if (typeof identity === 'string' && Number.isFinite(timestamp) && timestamp >= cutoff) {
          this.entries.set(identity, timestamp);
        }
      }
      return this.entries.size;
    } catch (error) {
      this.log(`Failed to load Superfan finale history: ${error.message}`);
      return 0;
    }
  }

  isEligible(identity, cooldownHours, at = this.now()) {
    const last = this.entries.get(identity);
    return !Number.isFinite(last) || at - last >= cooldownHours * 60 * 60 * 1000;
  }

  markAccepted(identity, at = this.now()) {
    this.entries.set(identity, at);
    try {
      this.save();
    } catch (error) {
      this.log(`Failed to persist Superfan finale history: ${error.message}`);
    }
    return at;
  }

  getLastAcceptedAt(identity) { return this.entries.get(identity) ?? null; }
  snapshot() { return Object.fromEntries(this.entries); }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify({ version: 1, entries: this.snapshot() }, null, 2), 'utf8');
    try {
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      if (process.platform !== 'win32' || !fs.existsSync(this.filePath)) throw error;
      fs.rmSync(this.filePath, { force: true });
      fs.renameSync(tempPath, this.filePath);
    }
  }
}

module.exports = { MAX_HISTORY_AGE_MS, SuperfanFinaleHistory, normalizeSuperfanIdentity };
