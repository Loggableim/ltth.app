/**
 * Subscription Tiers Module
 *
 * Manages different subscription tiers and their benefits
 * - Tier 1: Basic (1 month)
 * - Tier 2: Advanced (3 months)
 * - Tier 3: Premium (6+ months)
 */

const logger = require('./logger');

class SubscriptionTiersManager {
  constructor(db, io = null) {
    this.db = db;
    this.io = io;
    this.initDatabase();
    this.tiers = this.loadTiers();
  }

  /**
   * Initialize database tables for subscription tiers
   */
  initDatabase() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS subscription_tiers (
        tier INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        min_months INTEGER NOT NULL,
        alert_sound TEXT,
        alert_text TEXT,
        alert_duration INTEGER DEFAULT 5,
        gift_multiplier REAL DEFAULT 1.0
      )
    `).run();

    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        username TEXT PRIMARY KEY,
        tier INTEGER NOT NULL,
        subscribed_at INTEGER NOT NULL,
        total_months INTEGER DEFAULT 1,
        FOREIGN KEY (tier) REFERENCES subscription_tiers(tier)
      )
    `).run();

    // Insert default tiers if not exist
    const tiers = this.db.prepare('SELECT COUNT(*) as count FROM subscription_tiers').get();
    if (tiers.count === 0) {
      this.db.prepare(`
        INSERT INTO subscription_tiers (tier, name, min_months, alert_text, alert_duration, gift_multiplier)
        VALUES
          (1, 'Bronze', 1, '🥉 {username} subscribed (Bronze)!', 5, 1.0),
          (2, 'Silver', 3, '🥈 {username} subscribed (Silver)!', 6, 1.2),
          (3, 'Gold', 6, '🥇 {username} subscribed (Gold)!', 8, 1.5)
      `).run();
      logger.info('Default subscription tiers created');
    }
  }

  /**
   * Load tiers from database
   */
  loadTiers() {
    const tiers = this.db.prepare('SELECT * FROM subscription_tiers ORDER BY tier ASC').all();
    return tiers;
  }

  /**
   * Get tier configuration
   */
  getTier(tierNumber) {
    return this.tiers.find(t => t.tier === tierNumber);
  }

  /**
   * Determine tier based on months subscribed
   */
  determineTier(months) {
    // Find the highest tier the user qualifies for
    let tier = 1;
    for (const t of this.tiers) {
      if (months >= t.min_months) {
        tier = t.tier;
      }
    }
    return tier;
  }

  /**
   * Handle subscribe event
   */
  handleSubscribe(username, eventData = {}) {
    const existingUser = this.db.prepare(
      'SELECT * FROM user_subscriptions WHERE username = ?'
    ).get(username);

    let tier;
    let totalMonths = 1;

    if (existingUser) {
      // User already subscribed before
      totalMonths = existingUser.total_months + 1;
      tier = this.determineTier(totalMonths);

      this.db.prepare(`
        UPDATE user_subscriptions
        SET tier = ?, total_months = ?, subscribed_at = ?
        WHERE username = ?
      `).run(tier, totalMonths, Date.now(), username);

      logger.info('User re-subscribed', { username, tier, totalMonths });
    } else {
      // New subscriber
      tier = 1;

      this.db.prepare(`
        INSERT INTO user_subscriptions (username, tier, subscribed_at, total_months)
        VALUES (?, ?, ?, ?)
      `).run(username, tier, Date.now(), totalMonths);

      logger.info('New subscriber', { username, tier });
    }

    const tierConfig = this.getTier(tier);

    const result = {
      username,
      tier,
      tierName: tierConfig.name,
      totalMonths,
      alertText: this.interpolate(tierConfig.alert_text, { username, tier: tierConfig.name, months: totalMonths }),
      alertSound: tierConfig.alert_sound,
      alertDuration: tierConfig.alert_duration,
      giftMultiplier: tierConfig.gift_multiplier
    };

    // Emit Socket.IO event
    if (this.io) {
      this.io.emit('subscription:tier', result);
    }

    return result;
  }

  /**
   * Get user's subscription info
   */
  getUserSubscription(username) {
    const sub = this.db.prepare(
      'SELECT * FROM user_subscriptions WHERE username = ?'
    ).get(username);

    if (!sub) return null;

    const tierConfig = this.getTier(sub.tier);

    return {
      username: sub.username,
      tier: sub.tier,
      tierName: tierConfig.name,
      totalMonths: sub.total_months,
      subscribedAt: sub.subscribed_at,
      giftMultiplier: tierConfig.gift_multiplier
    };
  }

  /**
   * Get all subscribers
   */
  getAllSubscribers() {
    return this.db.prepare(`
      SELECT
        us.username,
        us.tier,
        st.name as tierName,
        us.total_months,
        us.subscribed_at
      FROM user_subscriptions us
      JOIN subscription_tiers st ON us.tier = st.tier
      ORDER BY us.tier DESC, us.total_months DESC
    `).all();
  }

  /**
   * Update tier configuration
   */
  updateTier(tier, config) {
    this.db.prepare(`
      UPDATE subscription_tiers
      SET name = ?, min_months = ?, alert_sound = ?, alert_text = ?,
          alert_duration = ?, gift_multiplier = ?
      WHERE tier = ?
    `).run(
      config.name,
      config.min_months,
      config.alert_sound || null,
      config.alert_text,
      config.alert_duration || 5,
      config.gift_multiplier || 1.0,
      tier
    );

    this.tiers = this.loadTiers();
    logger.info('Tier updated', { tier, config });
  }

  /**
   * Interpolate variables in text
   */
  interpolate(text, params) {
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return key in params ? params[key] : match;
    });
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = {
      total: 0,
      byTier: {}
    };

    for (const tier of this.tiers) {
      const count = this.db.prepare(
        'SELECT COUNT(*) as count FROM user_subscriptions WHERE tier = ?'
      ).get(tier.tier);

      stats.byTier[tier.name] = count.count;
      stats.total += count.count;
    }

    return stats;
  }

  /**
   * Get all tiers (for server.js compatibility)
   */
  getAllTiers() {
    return this.tiers;
  }

  /**
   * Set tier config (for server.js compatibility)
   */
  setTierConfig(tier, config) {
    return this.updateTier(tier, config);
  }

  /**
   * Get tier config (for server.js compatibility)
   */
  getTierConfig(tier) {
    return this.getTier(tier);
  }

  /**
   * Process subscription event (for server.js compatibility)
   */
  async processSubscription(data) {
    return this.handleSubscribe(data.username, data);
  }
}

module.exports = SubscriptionTiersManager;
