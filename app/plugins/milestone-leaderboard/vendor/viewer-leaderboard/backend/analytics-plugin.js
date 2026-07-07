const path = require('path');
const fs = require('fs');
const ViewerProfilesDatabase = require('./analytics-database');

class ViewerProfilesAnalyticsPlugin {
  constructor(api) {
    this.api = api;
    this.pluginId = 'viewer-leaderboard';
    this.db = new ViewerProfilesDatabase(api);
    this.config = {
      autoVipPromotion: true,
      birthdayReminder: true,
      sessionTimeout: 300,
      heatmapEnabled: true
    };
  }

  loadConfig() {
    try {
      const savedConfig = typeof this.api.getConfig === 'function'
        ? this.api.getConfig('viewer-profiles-config')
        : null;
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
      }
    } catch (error) {
      this.api.log(`Viewer Profiles analytics config load failed: ${error.message}`, 'warn');
    }
  }

  async init() {
    this.api.log('🎭 Initializing Viewer Profiles analytics...', 'info');

    try {
      this.loadConfig();
      this.db.initialize();
      this.registerRoutes();
      this.api.log('✅ Viewer Profiles analytics initialized successfully', 'info');
    } catch (error) {
      this.api.log(`❌ Error initializing Viewer Profiles analytics: ${error.message}`, 'error');
      this.api.log(`   Stack trace: ${error.stack}`, 'error');
      throw error;
    }
  }

  async destroy() {
    this.api.log('Destroying Viewer Profiles analytics...', 'info');
    try {
      this.db.destroy();
      this.api.log('✅ Viewer Profiles analytics destroyed', 'info');
    } catch (error) {
      this.api.log(`Error destroying Viewer Profiles analytics: ${error.message}`, 'error');
    }
  }

  registerRoutes() {
    this.api.registerRoute('GET', '/viewer-profiles/ui', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'viewer-profiles-ui.html'));
    });

    this.api.registerRoute('GET', '/viewer-profiles/assets/:file', (req, res) => {
      const assetsDir = path.join(__dirname, '..', 'assets');
      const fileName = path.basename(req.params.file || '');
      const targetPath = path.join(assetsDir, fileName);

      if (!fileName || !targetPath.startsWith(assetsDir) || !fs.existsSync(targetPath)) {
        return res.status(404).json({ success: false, error: 'Asset not found' });
      }

      return res.sendFile(targetPath);
    });

    this.api.registerRoute('GET', '/api/viewer-profiles/insights/overview', (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);
        const data = this.db.getOverviewInsights({ limit });
        res.json({ success: true, data });
      } catch (error) {
        this.api.log(`Error getting overview insights: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('POST', '/api/viewer-profiles/bulk/update', (req, res) => {
      try {
        const usernames = Array.isArray(req.body?.usernames) ? req.body.usernames : [];
        const updates = req.body?.updates || {};
        const updated = this.db.bulkUpdateViewers(usernames, updates);

        for (const viewer of updated) {
          this.api.emit('viewer:updated', {
            username: viewer.tiktok_username,
            reason: 'bulk-update',
            viewer
          });
        }

        res.json({
          success: true,
          data: {
            updatedCount: updated.length,
            viewers: updated
          }
        });
      } catch (error) {
        this.api.log(`Error bulk-updating viewers: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('GET', '/api/viewer-profiles/:username/insights', (req, res) => {
      try {
        const viewer = this.db.getViewerInsights(req.params.username);
        if (!viewer) {
          return res.status(404).json({ success: false, error: 'Viewer not found' });
        }
        res.json({ success: true, data: viewer });
      } catch (error) {
        this.api.log(`Error getting viewer insights: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('GET', '/api/viewer-profiles/stats/summary', (req, res) => {
      try {
        res.json({ success: true, data: this.db.getStatsSummary() });
      } catch (error) {
        this.api.log(`Error getting stats summary: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('GET', '/api/viewer-profiles/vip/tiers', (req, res) => {
      try {
        res.json({ success: true, data: this.db.getVIPTiers() });
      } catch (error) {
        this.api.log(`Error getting VIP tiers: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('GET', '/api/viewer-profiles/birthdays/upcoming', (req, res) => {
      try {
        const days = Math.min(parseInt(req.query.days, 10) || 7, 30);
        res.json({ success: true, data: this.db.getUpcomingBirthdays(days) });
      } catch (error) {
        this.api.log(`Error getting upcoming birthdays: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }
}

module.exports = ViewerProfilesAnalyticsPlugin;
