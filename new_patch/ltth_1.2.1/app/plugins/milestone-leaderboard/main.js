const GiftMilestonePlugin = require('../gift-milestone/main');
const LeaderboardPlugin = require('../leaderboard/main');

class MilestoneLeaderboardPlugin {
  constructor(api) {
    this.api = api;
    this.giftMilestone = null;
    this.leaderboard = null;
    this.giftMilestoneInitialized = false;
    this.leaderboardInitialized = false;
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
    const hasStandaloneLeaderboard = this.shouldSkipNestedPlugin('leaderboard');

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

    if (hasStandaloneLeaderboard) {
      this.api.log('Standalone leaderboard plugin detected, skipping nested initialization to avoid route conflicts', 'warn');
    } else {
      try {
        this.leaderboard = new LeaderboardPlugin(this.api);
        await this.leaderboard.init();
        this.leaderboardInitialized = true;
      } catch (error) {
        this.api.log(`Failed to initialize nested leaderboard plugin: ${error.message}`, 'error');
        if (this.giftMilestoneInitialized && this.giftMilestone?.destroy) {
          try {
            await this.giftMilestone.destroy();
          } catch (cleanupError) {
            this.api.log(`Cleanup failed for nested gift milestone plugin after leaderboard init error: ${cleanupError.message}`, 'error');
          }
          this.giftMilestoneInitialized = false;
          this.giftMilestone = null;
        }
        this.leaderboard = null;
        throw error;
      }
    }

    this.api.log('✅ Milestone Leaderboard plugin ready', 'info');
  }

  async destroy() {
    // Destroy in reverse init order when nested instances were started
    if (this.leaderboardInitialized && this.leaderboard?.destroy) {
      try {
        await this.leaderboard.destroy();
      } catch (error) {
        this.api.log(`Failed to destroy nested leaderboard plugin in Milestone Leaderboard: ${error.message}`, 'error');
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
    this.leaderboardInitialized = false;
    this.giftMilestone = null;
    this.leaderboard = null;
  }
}

module.exports = MilestoneLeaderboardPlugin;
