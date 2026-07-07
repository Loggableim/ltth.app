const path = require('path');
const fs = require('fs');
const GiftMilestonePlugin = require('./vendor/gift-milestone/main');
const ViewerLeaderboardPlugin = require('./vendor/viewer-leaderboard/main');

class ViewerXPPlugin {
  constructor(api) {
    this.api = api;
    this.giftMilestone = null;
    this.viewerLeaderboard = null;
    this.giftMilestoneInitialized = false;
    this.viewerLeaderboardInitialized = false;
    this.originalGetPlugin = null;
  }

  shouldSkipNestedPlugin(pluginId) {
    const pluginLoader = this.api.pluginLoader;
    const isLoaded = pluginLoader?.plugins?.has(pluginId);
    const isEnabled = pluginLoader?.state?.[pluginId]?.enabled !== false;
    return Boolean(isLoaded && isEnabled);
  }

  installPluginLookupShim() {
    if (this.originalGetPlugin || typeof this.api.getPlugin !== 'function') {
      return;
    }

    this.originalGetPlugin = this.api.getPlugin.bind(this.api);
    this.api.getPlugin = (pluginId) => {
      if (pluginId === 'gift-milestone') {
        return this.giftMilestone || this.originalGetPlugin(pluginId);
      }

      if (pluginId === 'viewer-leaderboard' || pluginId === 'viewer-xp') {
        return this.viewerLeaderboard || this.originalGetPlugin(pluginId);
      }

      return this.originalGetPlugin(pluginId);
    };
  }

  restorePluginLookupShim() {
    if (this.originalGetPlugin) {
      this.api.getPlugin = this.originalGetPlugin;
      this.originalGetPlugin = null;
    }
  }

  registerLegacyStaticAlias(urlPrefix, pluginDir) {
    const normalizedRoot = path.resolve(pluginDir);
    const routePath = urlPrefix.endsWith('/') ? `${urlPrefix}*` : `${urlPrefix}/*`;

    this.api.registerRoute('get', routePath, (req, res) => {
      const relativePath = String(req.params[0] || '').replace(/\\/g, '/');
      if (!relativePath) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      const filePath = path.resolve(normalizedRoot, relativePath);
      const isInsideRoot = filePath === normalizedRoot || filePath.startsWith(`${normalizedRoot}${path.sep}`);

      if (!isInsideRoot) {
        return res.status(400).json({ success: false, error: 'Invalid file path' });
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      return res.sendFile(filePath);
    });
  }

  async init() {
    this.api.log('Initializing Viewer XP plugin...', 'info');
    this.installPluginLookupShim();

    const hasStandaloneGiftMilestone = this.shouldSkipNestedPlugin('gift-milestone');
    const hasStandaloneViewerLeaderboard = this.shouldSkipNestedPlugin('viewer-leaderboard');

    if (hasStandaloneGiftMilestone) {
      this.api.log('Standalone gift-milestone plugin detected, skipping nested initialization to avoid route conflicts', 'warn');
    } else {
      try {
        this.giftMilestone = new GiftMilestonePlugin(this.api);
        await this.giftMilestone.init();
        this.giftMilestoneInitialized = true;
      } catch (error) {
        this.api.log(`Failed to initialize nested gift milestone plugin: ${error.message}`, 'error');
        this.giftMilestone = null;
        this.restorePluginLookupShim();
        throw error;
      }
    }

    if (hasStandaloneViewerLeaderboard) {
      this.api.log('Standalone viewer-leaderboard plugin detected, skipping nested initialization to avoid route conflicts', 'warn');
    } else {
      try {
        this.viewerLeaderboard = new ViewerLeaderboardPlugin(this.api);
        await this.viewerLeaderboard.init();
        this.viewerLeaderboardInitialized = true;
      } catch (error) {
        this.api.log(`Failed to initialize nested viewer-leaderboard plugin: ${error.message}`, 'error');
        if (this.giftMilestoneInitialized && this.giftMilestone?.destroy) {
          try {
            await this.giftMilestone.destroy();
          } catch (cleanupError) {
            this.api.log(`Cleanup failed for nested gift milestone plugin after viewer-leaderboard init error: ${cleanupError.message}`, 'error');
          }
          this.giftMilestoneInitialized = false;
          this.giftMilestone = null;
        }
        this.viewerLeaderboard = null;
        this.restorePluginLookupShim();
        throw error;
      }
    }

    this.registerLegacyStaticAlias('/plugins/gift-milestone', path.join(__dirname, 'vendor', 'gift-milestone'));
    this.registerLegacyStaticAlias('/plugins/viewer-leaderboard', path.join(__dirname, 'vendor', 'viewer-leaderboard'));

    this.api.log('Viewer XP plugin ready', 'info');
  }

  async destroy() {
    if (this.viewerLeaderboardInitialized && this.viewerLeaderboard?.destroy) {
      try {
        await this.viewerLeaderboard.destroy();
      } catch (error) {
        this.api.log(`Failed to destroy nested viewer-leaderboard plugin in Viewer XP: ${error.message}`, 'error');
      }
    }

    if (this.giftMilestoneInitialized && this.giftMilestone?.destroy) {
      try {
        await this.giftMilestone.destroy();
      } catch (error) {
        this.api.log(`Failed to destroy nested gift milestone plugin in Viewer XP: ${error.message}`, 'error');
      }
    }

    this.restorePluginLookupShim();
    this.api.log('Viewer XP plugin destroyed', 'info');
    this.giftMilestoneInitialized = false;
    this.viewerLeaderboardInitialized = false;
    this.giftMilestone = null;
    this.viewerLeaderboard = null;
  }
}

module.exports = ViewerXPPlugin;
