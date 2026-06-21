const GiftMilestonePlugin = require('../gift-milestone/main');
// Note: The standalone 'leaderboard' plugin does not exist.
// Use 'viewer-leaderboard' plugin instead for gifter leaderboard functionality.
// This mega plugin combines gift-milestone with viewer-leaderboard's gifter leaderboard.
const ViewerLeaderboardPlugin = require('../viewer-leaderboard/main');

class MilestoneLeaderboardPlugin {
  constructor(api) {
    this.api = api;
    this.giftMilestone = null;
    this.viewerLeaderboard = null;
    this.giftMilestoneInitialized = false;
    this.viewerLeaderboardInitialized = false;
  }

  shouldSkipNestedPlugin(pluginId) {
    const pluginLoader = this.api.pluginLoader;
    const isLoaded = pluginLoader?.plugins?.has(pluginId);
    const isEnabled = pluginLoader?.state?.[pluginId]?.enabled !== false;
    return Boolean(isLoaded && isEnabled);
  }

  async init() {
    this.api.log('Initializing Milestone Leaderboard mega plugin...', 'info');
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
        throw error;
      }
    }

    this.api.log('✅ Milestone Leaderboard plugin ready', 'info');
  }

  async destroy() {
    // Destroy in reverse init order when nested instances were started
    if (this.viewerLeaderboardInitialized && this.viewerLeaderboard?.destroy) {
      try {
        await this.viewerLeaderboard.destroy();
      } catch (error) {
        this.api.log(`Failed to destroy nested viewer-leaderboard plugin in Milestone Leaderboard: ${error.message}`, 'error');
      }
    }

    if (this.giftMilestoneInitialized && this.giftMilestone?.destroy) {
      try {
        await this.giftMilestone.destroy();
      } catch (error) {
        this.api.log(`Failed to destroy nested gift milestone plugin in Milestone Leaderboard: ${error.message}`, 'error');
      }
    }

    this.api.log('Milestone Leaderboard plugin destroyed', 'info');
    this.giftMilestoneInitialized = false;
    this.viewerLeaderboardInitialized = false;
    this.giftMilestone = null;
    this.viewerLeaderboard = null;
  }
}

module.exports = MilestoneLeaderboardPlugin;
