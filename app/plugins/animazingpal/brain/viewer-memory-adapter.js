'use strict';

class ViewerMemoryAdapter {
  constructor(api) {
    this.api = api;
  }

  getViewerPlugin() {
    return this.api.getPluginInstance?.('viewer-profiles') || this.api.getPlugin?.('viewer-profiles') || null;
  }

  getViewerContext(username, config = {}, privacy = {}) {
    const plugin = this.getViewerPlugin();
    if (!plugin?.db || typeof plugin.db.getViewerInsights !== 'function') {
      return { available: false, profile: null, memories: [] };
    }

    const insight = plugin.db.getViewerInsights(username);
    if (!insight) return { available: true, profile: null, memories: [] };
    const allowed = new Set(config.allowedProfileFields || []);
    if (privacy.includeNotes) allowed.add('notes');
    if (privacy.includeBirthday) allowed.add('birthday');
    if (privacy.includeContactFields) allowed.add('discord_username');

    const profile = {};
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(insight, field)) profile[field] = insight[field];
    }
    if (allowed.has('tags') && typeof plugin.db.parseTags === 'function') {
      profile.tags = plugin.db.parseTags(insight.tags);
    }

    const memories = typeof plugin.db.getHostMemories === 'function'
      ? plugin.db.getHostMemories(username, config.streamerId || 'default', {
          limit: config.maxMemories,
          minimumImportance: config.minimumImportance
        })
      : [];

    return {
      available: true,
      profile,
      memories,
      insights: config.includeInsights ? insight.insights || null : null,
      topGifts: config.includeGiftHistory ? insight.topGifts || [] : []
    };
  }

  recordMemory(username, memory) {
    const plugin = this.getViewerPlugin();
    if (!plugin?.db || typeof plugin.db.recordHostMemory !== 'function') return false;
    plugin.db.recordHostMemory(username, memory);
    return true;
  }
}

module.exports = ViewerMemoryAdapter;
