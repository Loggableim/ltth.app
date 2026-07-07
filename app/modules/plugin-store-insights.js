const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { assertPluginId } = require('./plugin-paths');

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function cleanText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanList(items = []) {
  return Array.isArray(items)
    ? items.map((item) => cleanText(item, 100)).filter(Boolean)
    : [];
}

class PluginStoreInsights {
  constructor(options = {}) {
    this.filePath = options.filePath;
    this.maxEntries = options.maxEntries || 500;
  }

  readState() {
    return readJsonFile(this.filePath, {
      feedback: [],
      telemetry: []
    });
  }

  saveState(state) {
    writeJsonFile(this.filePath, {
      feedback: (state.feedback || []).slice(-this.maxEntries),
      telemetry: (state.telemetry || []).slice(-this.maxEntries)
    });
  }

  recordFeedback(account = {}, payload = {}) {
    const state = this.readState();
    const feedback = {
      id: crypto.randomUUID(),
      pluginId: assertPluginId(payload.pluginId),
      userId: cleanText(account.userId, 120) || null,
      rating: Math.max(1, Math.min(5, parseInt(payload.rating, 10) || 0)),
      kind: cleanText(payload.kind || 'feedback', 40),
      message: cleanText(payload.message, 2000),
      tags: cleanList(payload.tags),
      createdAt: new Date().toISOString()
    };

    state.feedback = state.feedback || [];
    state.feedback.push(feedback);
    this.saveState(state);
    return feedback;
  }

  recordTelemetry(account = {}, payload = {}) {
    const state = this.readState();
    const telemetry = {
      id: crypto.randomUUID(),
      pluginId: payload.pluginId ? assertPluginId(payload.pluginId) : null,
      userId: cleanText(account.userId, 120) || null,
      event: cleanText(payload.event || payload.type || 'event', 80),
      durationMs: Number.isFinite(payload.durationMs) ? Math.max(0, payload.durationMs) : null,
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
      createdAt: new Date().toISOString()
    };

    state.telemetry = state.telemetry || [];
    state.telemetry.push(telemetry);
    this.saveState(state);
    return telemetry;
  }

  listFeedback(options = {}) {
    const limit = Math.max(1, Math.min(100, parseInt(options.limit, 10) || 50));
    return (this.readState().feedback || []).slice(-limit).reverse();
  }

  getSummary() {
    const state = this.readState();
    const feedback = state.feedback || [];
    const telemetry = state.telemetry || [];
    const plugins = {};

    for (const item of feedback) {
      const plugin = this.ensurePluginSummary(plugins, item.pluginId);
      plugin.feedbackCount += 1;
      if (item.rating) {
        plugin.ratingTotal += item.rating;
        plugin.ratingCount += 1;
        plugin.averageRating = Number((plugin.ratingTotal / plugin.ratingCount).toFixed(2));
      }
    }

    for (const item of telemetry) {
      const plugin = this.ensurePluginSummary(plugins, item.pluginId || 'store');
      plugin.telemetryCount += 1;
      if (item.event === 'install_success') plugin.installSuccessCount += 1;
      if (item.event === 'install_failure') plugin.installFailureCount += 1;
      if (item.event === 'rollback_applied') plugin.rollbackCount += 1;
    }

    for (const plugin of Object.values(plugins)) {
      delete plugin.ratingTotal;
      delete plugin.ratingCount;
    }

    return {
      feedbackCount: feedback.length,
      telemetryCount: telemetry.length,
      plugins
    };
  }

  ensurePluginSummary(plugins, pluginId) {
    const id = pluginId || 'store';
    if (!plugins[id]) {
      plugins[id] = {
        feedbackCount: 0,
        telemetryCount: 0,
        installSuccessCount: 0,
        installFailureCount: 0,
        rollbackCount: 0,
        averageRating: null,
        ratingTotal: 0,
        ratingCount: 0
      };
    }

    return plugins[id];
  }
}

module.exports = {
  PluginStoreInsights
};
