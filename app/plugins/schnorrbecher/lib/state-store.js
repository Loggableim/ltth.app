const fs = require('fs');
const path = require('path');

const {
  DEFAULT_CONFIG,
  DEFAULT_STATE,
  normalizeConfig,
  normalizeState
} = require('./config');

class CoinJarStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.configPath = path.join(dataDir, 'coin-jar-config.json');
    this.statePath = path.join(dataDir, 'coin-jar-state.json');
    fs.mkdirSync(dataDir, { recursive: true });
  }

  _read(filePath, fallback, normalize) {
    try {
      return normalize(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (_) {
      return normalize(fallback);
    }
  }

  _write(filePath, value) {
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, filePath);
  }

  loadConfig() {
    return this._read(this.configPath, DEFAULT_CONFIG, normalizeConfig);
  }

  saveConfig(config) {
    const next = normalizeConfig(config);
    this._write(this.configPath, next);
    return next;
  }

  loadState() {
    return this._read(this.statePath, DEFAULT_STATE, normalizeState);
  }

  saveState(state) {
    const next = normalizeState(state);
    this._write(this.statePath, next);
    return next;
  }

  clearState() {
    this._write(this.statePath, DEFAULT_STATE);
    return normalizeState(DEFAULT_STATE);
  }
}

module.exports = CoinJarStore;
