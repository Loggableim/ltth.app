/**
 * Role Manager for Talking Heads
 * Handles role-based permission checks for avatar activation
 */

class RoleManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Check if user is eligible for talking head avatar
   * @param {object} userData - TikTok user data
   * @param {object} userData.uniqueId - TikTok username
   * @param {object} userData.teamMemberLevel - Team level (0-6)
   * @param {object} userData.isModerator - Moderator status
   * @param {object} userData.isSubscriber - Subscriber status
   * @param {object} userData.topGifterRank - Top gifter rank
   * @param {string} customVoiceUsers - Array of users with custom TTS voices
   * @returns {boolean} True if user is eligible
   */
  isUserEligible(userData, customVoiceUsers = []) {
    // Check role permission setting
    const permission = this.config.rolePermission || 'all';

    switch (permission) {
      case 'all':
        // All viewers are eligible
        return true;

      case 'team':
        // Only team members with minimum level
        const minLevel = this.config.minTeamLevel || 0;
        const userLevel = userData.teamMemberLevel || 0;
        return userLevel >= minLevel;

      case 'subscriber':
        // Only subscribers/superfans
        return userData.isSubscriber || false;

      case 'custom_voice':
        // Only users with dedicated TTS voice
        return customVoiceUsers.includes(userData.uniqueId);

      case 'moderator':
        // Only moderators
        return userData.isModerator || false;

      case 'top_gifter':
        // Only top gifters (rank 1-3)
        const rank = userData.topGifterRank || 999;
        return rank <= 3;

      default:
        this.logger.warn(`TalkingHeads: Unknown permission type: ${permission}`);
        return false;
    }
  }

  /**
   * Get user eligibility status with reason
   * @param {object} userData - TikTok user data
   * @param {string} customVoiceUsers - Array of users with custom TTS voices
   * @returns {object} { eligible: boolean, reason: string }
   */
  checkEligibility(userData, customVoiceUsers = []) {
    const permission = this.config.rolePermission || 'all';
    const eligible = this.isUserEligible(userData, customVoiceUsers);

    if (eligible) {
      return { eligible: true, reason: 'User meets permission requirements' };
    }

    // Provide specific reason for ineligibility
    switch (permission) {
      case 'team':
        return {
          eligible: false,
          reason: `Requires team level ${this.config.minTeamLevel || 0} or higher`
        };
      case 'subscriber':
        return { eligible: false, reason: 'Requires subscriber/superfan status' };
      case 'custom_voice':
        return { eligible: false, reason: 'Requires custom TTS voice assignment' };
      case 'moderator':
        return { eligible: false, reason: 'Requires moderator status' };
      case 'top_gifter':
        return { eligible: false, reason: 'Requires top gifter rank (1-3)' };
      default:
        return { eligible: false, reason: 'Unknown permission requirement' };
    }
  }

  /**
   * Update configuration
   * @param {object} newConfig - New configuration settings
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

module.exports = RoleManager;
