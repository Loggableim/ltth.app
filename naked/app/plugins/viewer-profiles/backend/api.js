/**
 * Viewer Profiles API
 * 
 * Handles all REST API endpoints for viewer profiles
 */

class ViewerProfilesAPI {
  constructor(plugin) {
    this.plugin = plugin;
    this.api = plugin.api;
    this.db = plugin.db;
  }

  /**
   * Register all API routes
   */
  registerRoutes() {
    // Get viewer list with pagination and filters
    this.api.registerRoute('GET', '/api/viewer-profiles', (req, res) => {
      this.getViewerList(req, res);
    });

    // Register specific routes BEFORE parameterized routes
    // This ensures Express matches them correctly

    // Get statistics summary
    this.api.registerRoute('GET', '/api/viewer-profiles/stats/summary', (req, res) => {
      this.getStatsSummary(req, res);
    });

    // Get leaderboard
    this.api.registerRoute('GET', '/api/viewer-profiles/leaderboard', (req, res) => {
      this.getLeaderboard(req, res);
    });

    // Get VIP list
    this.api.registerRoute('GET', '/api/viewer-profiles/vip/list', (req, res) => {
      this.getVIPList(req, res);
    });

    // Get VIP tiers configuration
    this.api.registerRoute('GET', '/api/viewer-profiles/vip/tiers', (req, res) => {
      this.getVIPTiers(req, res);
    });

    // Get upcoming birthdays
    this.api.registerRoute('GET', '/api/viewer-profiles/birthdays/upcoming', (req, res) => {
      this.getUpcomingBirthdays(req, res);
    });

    // Get global heatmap
    this.api.registerRoute('GET', '/api/viewer-profiles/heatmap/global', (req, res) => {
      this.getGlobalHeatmap(req, res);
    });

    // Export viewers
    this.api.registerRoute('GET', '/api/viewer-profiles/export', (req, res) => {
      this.exportViewers(req, res);
    });

    // Get active sessions
    this.api.registerRoute('GET', '/api/viewer-profiles/sessions/active', (req, res) => {
      this.getActiveSessions(req, res);
    });

    // Get available TTS voices
    this.api.registerRoute('GET', '/api/viewer-profiles/tts/voices', (req, res) => {
      this.getTTSVoices(req, res);
    });

    // Now register parameterized routes (less specific, must come after)

    // Get viewer heatmap
    this.api.registerRoute('GET', '/api/viewer-profiles/:username/heatmap', (req, res) => {
      this.getViewerHeatmap(req, res);
    });

    // Set VIP status
    this.api.registerRoute('POST', '/api/viewer-profiles/:username/vip', (req, res) => {
      this.setVIPStatus(req, res);
    });

    // Get single viewer profile
    this.api.registerRoute('GET', '/api/viewer-profiles/:username', (req, res) => {
      this.getViewerProfile(req, res);
    });

    // Update viewer profile
    this.api.registerRoute('PATCH', '/api/viewer-profiles/:username', (req, res) => {
      this.updateViewerProfile(req, res);
    });

    this.api.log('Viewer Profiles API routes registered', 'info');
  }

  /**
   * Get viewer list with pagination and filters
   */
  getViewerList(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const sortBy = req.query.sortBy || 'total_coins_spent';
      const order = req.query.order || 'DESC';
      const search = req.query.search || '';
      const filter = req.query.filter || 'all';

      const result = this.db.getViewers({
        page,
        limit,
        sortBy,
        order,
        search,
        filter
      });

      res.json({
        success: true,
        data: result.viewers,
        pagination: result.pagination
      });
    } catch (error) {
      this.api.log(`Error getting viewer list: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get single viewer profile with details
   */
  getViewerProfile(req, res) {
    try {
      const username = req.params.username;
      const viewer = this.db.getViewerByUsername(username);

      if (!viewer) {
        return res.status(404).json({
          success: false,
          error: 'Viewer not found'
        });
      }

      // Get additional details
      const topGifts = this.db.getTopGifts(viewer.id, 5);
      const heatmap = this.db.getViewerHeatmap(viewer.id);

      res.json({
        success: true,
        data: {
          ...viewer,
          topGifts,
          heatmap,
          tags: viewer.tags ? JSON.parse(viewer.tags) : []
        }
      });
    } catch (error) {
      this.api.log(`Error getting viewer profile: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Update viewer profile (custom fields only)
   */
  updateViewerProfile(req, res) {
    try {
      const username = req.params.username;
      const updates = {};

      // Field validators
      const validators = {
        tts_voice: (v) => typeof v === 'string' || v === null || v === '',
        discord_username: (v) => typeof v === 'string' || v === null || v === '',
        birthday: (v) => {
          if (v === null || v === '') return true;
          // YYYY-MM-DD format
          return /^\d{4}-\d{2}-\d{2}$/.test(v);
        },
        notes: (v) => typeof v === 'string' || v === null || v === '',
        tags: (v) => Array.isArray(v),
        is_favorite: (v) => (typeof v === 'number' && (v === 0 || v === 1)) || typeof v === 'boolean',
        is_blocked: (v) => (typeof v === 'number' && (v === 0 || v === 1)) || typeof v === 'boolean',
        is_moderator: (v) => (typeof v === 'number' && (v === 0 || v === 1)) || typeof v === 'boolean'
      };

      const allowedFields = Object.keys(validators);
      const errors = [];

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          const value = req.body[field];
          if (!validators[field](value)) {
            errors.push(`Invalid value for field '${field}'`);
            continue;
          }
          if (field === 'tags') {
            updates[field] = JSON.stringify(value);
          } else if (['is_favorite', 'is_blocked', 'is_moderator'].includes(field)) {
            updates[field] = value ? 1 : 0;
          } else {
            updates[field] = value;
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors
        });
      }

      const viewer = this.db.updateViewer(username, updates);

      if (!viewer) {
        return res.status(404).json({
          success: false,
          error: 'Viewer not found'
        });
      }

      res.json({
        success: true,
        data: viewer
      });

      // Emit update event
      this.api.emit('viewer:updated', {
        username,
        updates
      });

    } catch (error) {
      this.api.log(`Error updating viewer profile: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Set VIP status
   */
  setVIPStatus(req, res) {
    try {
      const username = req.params.username;
      const { tier, remove } = req.body;

      const viewer = this.plugin.vipManager.setVIP(username, tier, remove);

      res.json({
        success: true,
        data: viewer
      });
    } catch (error) {
      this.api.log(`Error setting VIP status: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get viewer heatmap
   */
  getViewerHeatmap(req, res) {
    try {
      const username = req.params.username;
      const viewer = this.db.getViewerByUsername(username);

      if (!viewer) {
        return res.status(404).json({
          success: false,
          error: 'Viewer not found'
        });
      }

      const heatmap = this.db.getViewerHeatmap(viewer.id);

      res.json({
        success: true,
        data: {
          username,
          heatmap
        }
      });
    } catch (error) {
      this.api.log(`Error getting viewer heatmap: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get statistics summary
   */
  getStatsSummary(req, res) {
    try {
      const stats = this.db.getStatsSummary();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.api.log(`Error getting stats summary: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get leaderboard
   */
  getLeaderboard(req, res) {
    try {
      const type = req.query.type || 'coins';
      const limit = parseInt(req.query.limit) || 10;

      const leaderboard = this.db.getLeaderboard(type, limit);

      res.json({
        success: true,
        data: leaderboard
      });
    } catch (error) {
      this.api.log(`Error getting leaderboard: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get VIP list
   */
  getVIPList(req, res) {
    try {
      const tier = req.query.tier || null;
      const vips = this.plugin.vipManager.getVIPsByTier(tier);

      res.json({
        success: true,
        data: vips
      });
    } catch (error) {
      this.api.log(`Error getting VIP list: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get upcoming birthdays
   */
  getUpcomingBirthdays(req, res) {
    try {
      const days = parseInt(req.query.days) || 7;
      const birthdays = this.plugin.birthdayManager.getUpcomingBirthdays(days);

      res.json({
        success: true,
        data: birthdays
      });
    } catch (error) {
      this.api.log(`Error getting upcoming birthdays: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get global heatmap
   */
  getGlobalHeatmap(req, res) {
    try {
      const peakTimes = this.db.getGlobalPeakTimes(168); // 7 days * 24 hours

      res.json({
        success: true,
        data: peakTimes
      });
    } catch (error) {
      this.api.log(`Error getting global heatmap: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Export viewers
   */
  exportViewers(req, res) {
    try {
      const format = req.query.format || 'csv';
      const filter = req.query.filter || 'all';

      const viewers = this.db.exportViewers(filter);

      if (format === 'csv') {
        const csv = this.convertToCSV(viewers);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=viewers.csv');
        res.send(csv);
      } else if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=viewers.json');
        res.json(viewers);
      } else {
        res.status(400).json({
          success: false,
          error: 'Invalid format. Use csv or json'
        });
      }
    } catch (error) {
      this.api.log(`Error exporting viewers: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(req, res) {
    try {
      const sessions = this.plugin.sessionManager.getActiveSessions();

      res.json({
        success: true,
        data: {
          count: sessions.length,
          sessions
        }
      });
    } catch (error) {
      this.api.log(`Error getting active sessions: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get VIP tiers configuration
   */
  getVIPTiers(req, res) {
    try {
      const tiers = this.plugin.vipManager.getTiers();

      res.json({
        success: true,
        data: tiers
      });
    } catch (error) {
      this.api.log(`Error getting VIP tiers: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Convert data to CSV format
   */
  convertToCSV(data) {
    if (data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row =>
      Object.values(row).map(val => {
        // Escape quotes and wrap in quotes if contains comma
        const strVal = val === null || val === undefined ? '' : String(val);
        return strVal.includes(',') || strVal.includes('"') ? 
          `"${strVal.replace(/"/g, '""')}"` : strVal;
      }).join(',')
    );

    return [headers, ...rows].join('\n');
  }

  /**
   * Get available TTS voices
   */
  getTTSVoices(req, res) {
    try {
      // Try to get TTS plugin instance if available
      let voices = [];
      
      if (this.api.getPluginInstance) {
        const ttsPlugin = this.api.getPluginInstance('tts');
        if (ttsPlugin && ttsPlugin.getAvailableVoices) {
          voices = ttsPlugin.getAvailableVoices();
        }
      }

      // Fallback to default voices if TTS plugin not available
      if (voices.length === 0) {
        voices = [
          { value: '', label: 'Default' },
          { value: 'de_001', label: 'German Male' },
          { value: 'de_002', label: 'German Female' },
          { value: 'en_us_001', label: 'English US Male' },
          { value: 'en_us_002', label: 'English US Female' }
        ];
      }

      res.json({
        success: true,
        data: voices
      });
    } catch (error) {
      this.api.log(`Error getting TTS voices: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = ViewerProfilesAPI;
