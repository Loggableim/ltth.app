'use strict';

class ViewerMemoryAdapter {
  constructor(api) {
    this.api = api;
  }

  getViewerPlugin() {
    return this.api.getPluginInstance?.('viewer-leaderboard') || this.api.getPlugin?.('viewer-leaderboard') || null;
  }

  getViewerContext(username, config = {}, privacy = {}) {
    const plugin = this.getViewerPlugin();
    const analyticsDb = plugin?.analyticsDb || plugin?.embeddedViewerProfiles?.db || plugin?.db;
    if (!analyticsDb || typeof analyticsDb.getViewerInsights !== 'function') {
      return { available: false, profile: null, memories: [] };
    }

    const insight = analyticsDb.getViewerInsights(username);
    if (!insight) return { available: true, profile: null, memories: [] };
    const allowed = new Set(config.allowedProfileFields || []);
    if (privacy.includeNotes) allowed.add('notes');
    if (privacy.includeBirthday) allowed.add('birthday');
    if (privacy.includeContactFields) allowed.add('discord_username');

    const profile = {};
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(insight, field)) profile[field] = insight[field];
    }
    if (allowed.has('tags') && typeof analyticsDb.parseTags === 'function') {
      profile.tags = analyticsDb.parseTags(insight.tags);
    }

    const memories = typeof analyticsDb.getHostMemories === 'function'
      ? analyticsDb.getHostMemories(username, config.streamerId || 'default', {
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
    const analyticsDb = plugin?.analyticsDb || plugin?.embeddedViewerProfiles?.db || plugin?.db;
    if (!analyticsDb || typeof analyticsDb.recordHostMemory !== 'function') return false;
    analyticsDb.recordHostMemory(username, memory);
    return true;
  }
}

module.exports = ViewerMemoryAdapter;
