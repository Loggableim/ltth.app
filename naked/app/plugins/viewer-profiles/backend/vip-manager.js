/**
 * VIP Manager
 * 
 * Handles automatic VIP promotion based on viewer stats and tier configuration
 */

class VIPManager {
  constructor(db, api) {
    this.db = db;
    this.api = api;
    this.tiers = [];
    this.autoPromotionEnabled = true;
  }

  /**
   * Initialize VIP manager and load tiers
   */
  initialize() {
    this.loadTiers();
    this.api.log('VIP Manager initialized', 'info');
  }

  /**
   * Load VIP tiers from database
   */
  loadTiers() {
    this.tiers = this.db.getVIPTiers();
    this.api.log(`Loaded ${this.tiers.length} VIP tiers`, 'info');
  }

  /**
   * Check and promote viewer if eligible
   */
  checkAndPromoteViewer(viewerId) {
    try {
      if (!this.autoPromotionEnabled) {
        return;
      }

      const viewer = this.db.getViewerById(viewerId);
      if (!viewer) {
        return;
      }

      const watchHours = viewer.total_watchtime_seconds / 3600;

      // Find highest eligible tier
      let newTier = null;
      for (let i = this.tiers.length - 1; i >= 0; i--) {
        const tier = this.tiers[i];
        if (
          viewer.total_coins_spent >= tier.min_coins_spent &&
          watchHours >= tier.min_watchtime_hours &&
          viewer.total_visits >= tier.min_visits
        ) {
          newTier = tier.tier_name;
          break;
        }
      }

      // Check if tier changed
      if (newTier && newTier !== viewer.vip_tier) {
        this.promoteViewer(viewerId, newTier);
      }
    } catch (error) {
      this.api.log(`Error checking VIP promotion: ${error.message}`, 'error');
    }
  }

  /**
   * Promote viewer to VIP tier
   */
  promoteViewer(viewerId, tierName) {
    try {
      const viewer = this.db.getViewerById(viewerId);
      if (!viewer) {
        return;
      }

      // Update viewer VIP status
      this.api.getDatabase().prepare(`
        UPDATE viewer_profiles
        SET is_vip = 1,
            vip_tier = ?,
            vip_since = COALESCE(vip_since, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(tierName, viewerId);

      this.api.log(`🏆 ${viewer.tiktok_username} promoted to ${tierName} VIP`, 'info');

      // Emit socket event
      this.api.emit('viewer:vip-promoted', {
        username: viewer.tiktok_username,
        displayName: viewer.display_name,
        tier: tierName,
        viewerId: viewer.id
      });

      // Trigger TTS announcement (optional, could be configured)
      // this.api.triggerTTS(`${viewer.display_name} wurde zu ${tierName} VIP befördert!`);

    } catch (error) {
      this.api.log(`Error promoting viewer: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Manually set VIP status
   */
  setVIP(username, tierName = null, remove = false) {
    try {
      const viewer = this.db.getViewerByUsername(username);
      if (!viewer) {
        throw new Error('Viewer not found');
      }

      if (remove) {
        // Remove VIP status
        this.api.getDatabase().prepare(`
          UPDATE viewer_profiles
          SET is_vip = 0,
              vip_tier = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(viewer.id);

        this.api.log(`Removed VIP status from ${username}`, 'info');

        this.api.emit('viewer:vip-removed', {
          username: viewer.tiktok_username,
          displayName: viewer.display_name,
          viewerId: viewer.id
        });

      } else {
        // Set VIP status
        if (!tierName) {
          tierName = 'Bronze'; // Default tier
        }

        this.api.getDatabase().prepare(`
          UPDATE viewer_profiles
          SET is_vip = 1,
              vip_tier = ?,
              vip_since = COALESCE(vip_since, CURRENT_TIMESTAMP),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(tierName, viewer.id);

        this.api.log(`Set ${username} to ${tierName} VIP`, 'info');

        this.api.emit('viewer:vip-set', {
          username: viewer.tiktok_username,
          displayName: viewer.display_name,
          tier: tierName,
          viewerId: viewer.id
        });
      }

      return this.db.getViewerById(viewer.id);
    } catch (error) {
      this.api.log(`Error setting VIP status: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get VIP viewers by tier
   */
  getVIPsByTier(tierName = null) {
    let sql = 'SELECT * FROM viewer_profiles WHERE is_vip = 1';
    const params = [];

    if (tierName) {
      sql += ' AND vip_tier = ?';
      params.push(tierName);
    }

    sql += ' ORDER BY vip_since ASC';

    return this.api.getDatabase().prepare(sql).all(...params);
  }

  /**
   * Toggle auto promotion
   */
  setAutoPromotion(enabled) {
    this.autoPromotionEnabled = enabled;
    this.api.log(`VIP auto-promotion ${enabled ? 'enabled' : 'disabled'}`, 'info');
  }

  /**
   * Get tier by name
   */
  getTier(tierName) {
    return this.tiers.find(t => t.tier_name === tierName);
  }

  /**
   * Get all tiers
   */
  getTiers() {
    return this.tiers;
  }
}

module.exports = VIPManager;
