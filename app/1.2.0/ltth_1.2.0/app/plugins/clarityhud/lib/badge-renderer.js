/**
 * Badge Renderer for ClarityHUD
 * 
 * Renders user badges including Moderator, Host, Subscriber, Gifter Level,
 * Team Level (hearts), Fan Club, and custom badges
 */

class BadgeRenderer {
  constructor(settings = {}) {
    this.settings = {
      badgeSize: settings.badgeSize || 'medium', // small, medium, large
      showTeamLevel: settings.showTeamLevel !== false,
      showModerator: settings.showModerator !== false,
      showSubscriber: settings.showSubscriber !== false,
      showGifter: settings.showGifter !== false,
      showFanClub: settings.showFanClub !== false,
      teamLevelStyle: settings.teamLevelStyle || 'icon-color', // icon-color, icon-glow, number-only
      ...settings
    };

    // Team level color mappings (TikTok team heart levels)
    this.teamLevelColors = {
      0: '#808080',  // Gray - No team level
      1: '#90EE90',  // Light green
      2: '#00FF00',  // Green
      3: '#00CED1',  // Turquoise
      4: '#1E90FF',  // Blue
      5: '#9370DB',  // Purple
      6: '#FF1493',  // Pink
      7: '#FF4500',  // Orange-red
      8: '#FFD700',  // Gold
      9: '#FF6347',  // Tomato
      10: '#FF0000'  // Red - Max level/Moderator
    };

    // Team level icons
    this.teamLevelIcons = {
      0: '',
      1: '💚',
      2: '💚',
      3: '💙',
      4: '💙',
      5: '💜',
      6: '💗',
      7: '🧡',
      8: '💛',
      9: '❤️',
      10: '❤️‍🔥'
    };
  }

  /**
   * Extract badge data from TikTok event
   * @param {Object} eventData - TikTok event data
   * @returns {Object} Badge information
   */
  extractBadges(eventData) {
    const badges = {
      isModerator: false,
      isHost: false,
      isSubscriber: false,
      teamLevel: 0,
      gifterLevel: 0,
      fanClubLevel: 0,
      fanClubName: null,
      customBadges: []
    };

    // Extract from userIdentity
    if (eventData.userIdentity) {
      badges.isModerator = eventData.userIdentity.isModeratorOfAnchor || false;
      badges.isSubscriber = eventData.userIdentity.isSubscriberOfAnchor || false;
    }

    // Extract team member level (heart level)
    // This is NOT subscription - it's the team hearts system
    if (eventData.teamMemberLevel !== undefined) {
      badges.teamLevel = eventData.teamMemberLevel;
    } else if (eventData.user?.teamMemberLevel !== undefined) {
      badges.teamLevel = eventData.user.teamMemberLevel;
    }

    // Moderators get highest team level visual
    if (badges.isModerator) {
      badges.teamLevel = Math.max(badges.teamLevel, 10);
    }

    // Extract gifter level
    if (eventData.user?.gifterLevel !== undefined) {
      badges.gifterLevel = eventData.user.gifterLevel;
    }

    // Extract fan club data
    if (eventData.user?.fansClub) {
      const fansClub = eventData.user.fansClub;
      badges.fanClubLevel = fansClub.data?.level || fansClub.level || 0;
      badges.fanClubName = fansClub.data?.clubName || fansClub.clubName || null;
    }

    // Extract custom badges from badges array
    if (eventData.badges && Array.isArray(eventData.badges)) {
      badges.customBadges = eventData.badges.map(badge => ({
        type: badge.type || 'custom',
        imageUrl: badge.imageUrl || badge.url || null,
        name: badge.name || badge.displayType || 'Badge'
      }));
    }

    return badges;
  }

  /**
   * Render badges to HTML container (CSP-compliant)
   * @param {Object} badges - Badge data
   * @param {HTMLElement} container - Container element
   */
  renderToHTML(badges, container) {
    container.innerHTML = '';
    container.className = 'badge-container';

    const badgeElements = [];

    // Team Level Badge (hearts) - FIRST, most prominent
    if (this.settings.showTeamLevel && badges.teamLevel > 0) {
      badgeElements.push(this.createTeamLevelBadge(badges.teamLevel));
    }

    // Moderator Badge
    if (this.settings.showModerator && badges.isModerator) {
      badgeElements.push(this.createModeratorBadge());
    }

    // Subscriber Badge
    if (this.settings.showSubscriber && badges.isSubscriber) {
      badgeElements.push(this.createSubscriberBadge());
    }

    // Gifter Level Badge
    if (this.settings.showGifter && badges.gifterLevel > 0) {
      badgeElements.push(this.createGifterBadge(badges.gifterLevel));
    }

    // Fan Club Badge
    if (this.settings.showFanClub && badges.fanClubLevel > 0) {
      badgeElements.push(this.createFanClubBadge(badges.fanClubLevel, badges.fanClubName));
    }

    // Custom Badges
    for (const customBadge of badges.customBadges) {
      badgeElements.push(this.createCustomBadge(customBadge));
    }

    // Append all badges
    for (const badge of badgeElements) {
      container.appendChild(badge);
    }
  }

  /**
   * Create team level badge (hearts)
   */
  createTeamLevelBadge(level) {
    const badge = document.createElement('span');
    badge.className = `badge badge-team-level badge-team-level-${level}`;
    
    const color = this.teamLevelColors[level] || this.teamLevelColors[0];
    const icon = this.teamLevelIcons[level] || this.teamLevelIcons[0];

    const size = this.getBadgeSize();

    switch (this.settings.teamLevelStyle) {
      case 'icon-color':
        badge.textContent = icon;
        badge.style.cssText = `
          display: inline-block;
          font-size: ${size};
          color: ${color};
          margin-right: 3px;
          vertical-align: middle;
        `;
        break;

      case 'icon-glow':
        badge.textContent = icon;
        badge.style.cssText = `
          display: inline-block;
          font-size: ${size};
          color: ${color};
          margin-right: 3px;
          vertical-align: middle;
          filter: drop-shadow(0 0 4px ${color});
          text-shadow: 0 0 8px ${color};
        `;
        break;

      case 'number-only':
        badge.textContent = level;
        badge.style.cssText = `
          display: inline-block;
          font-size: calc(${size} * 0.8);
          font-weight: bold;
          color: ${color};
          background: rgba(0, 0, 0, 0.2);
          padding: 1px 4px;
          border-radius: 3px;
          margin-right: 3px;
          vertical-align: middle;
          border: 1px solid ${color};
        `;
        break;

      default:
        badge.textContent = icon;
        badge.style.cssText = `
          display: inline-block;
          font-size: ${size};
          color: ${color};
          margin-right: 3px;
          vertical-align: middle;
        `;
    }

    badge.title = `Team Level ${level}`;
    return badge;
  }

  /**
   * Create moderator badge
   */
  createModeratorBadge() {
    const badge = document.createElement('span');
    badge.className = 'badge badge-moderator';
    badge.textContent = '🔧';
    badge.title = 'Moderator';
    
    const size = this.getBadgeSize();
    badge.style.cssText = `
      display: inline-block;
      font-size: ${size};
      color: #4CAF50;
      margin-right: 3px;
      vertical-align: middle;
      filter: drop-shadow(0 0 3px #4CAF50);
    `;
    
    return badge;
  }

  /**
   * Create subscriber badge
   */
  createSubscriberBadge() {
    const badge = document.createElement('span');
    badge.className = 'badge badge-subscriber';
    badge.textContent = '⭐';
    badge.title = 'Subscriber';
    
    const size = this.getBadgeSize();
    badge.style.cssText = `
      display: inline-block;
      font-size: ${size};
      color: #FFD700;
      margin-right: 3px;
      vertical-align: middle;
    `;
    
    return badge;
  }

  /**
   * Create gifter level badge
   */
  createGifterBadge(level) {
    const badge = document.createElement('span');
    badge.className = `badge badge-gifter badge-gifter-${level}`;
    badge.textContent = '🎁';
    badge.title = `Gifter Level ${level}`;
    
    const size = this.getBadgeSize();
    const color = level >= 10 ? '#FF1493' : level >= 5 ? '#9370DB' : '#FF69B4';
    
    badge.style.cssText = `
      display: inline-block;
      font-size: ${size};
      color: ${color};
      margin-right: 3px;
      vertical-align: middle;
    `;
    
    return badge;
  }

  /**
   * Create fan club badge
   */
  createFanClubBadge(level, clubName) {
    const badge = document.createElement('span');
    badge.className = `badge badge-fanclub badge-fanclub-${level}`;
    badge.textContent = '👥';
    badge.title = clubName ? `${clubName} (Level ${level})` : `Fan Club Level ${level}`;
    
    const size = this.getBadgeSize();
    badge.style.cssText = `
      display: inline-block;
      font-size: ${size};
      color: #FF4500;
      margin-right: 3px;
      vertical-align: middle;
    `;
    
    return badge;
  }

  /**
   * Create custom badge
   */
  createCustomBadge(badgeData) {
    if (badgeData.imageUrl) {
      const badge = document.createElement('img');
      badge.className = 'badge badge-custom';
      badge.src = badgeData.imageUrl;
      badge.alt = badgeData.name;
      badge.title = badgeData.name;
      
      const size = this.getBadgeSize();
      badge.style.cssText = `
        display: inline-block;
        height: ${size};
        width: auto;
        margin-right: 3px;
        vertical-align: middle;
      `;
      
      return badge;
    } else {
      const badge = document.createElement('span');
      badge.className = 'badge badge-custom';
      badge.textContent = '🏅';
      badge.title = badgeData.name;
      
      const size = this.getBadgeSize();
      badge.style.cssText = `
        display: inline-block;
        font-size: ${size};
        margin-right: 3px;
        vertical-align: middle;
      `;
      
      return badge;
    }
  }

  /**
   * Get badge size based on settings
   */
  getBadgeSize() {
    const sizes = {
      small: '0.9em',
      medium: '1.1em',
      large: '1.3em'
    };
    return sizes[this.settings.badgeSize] || sizes.medium;
  }

  /**
   * Get username color based on team level
   * @param {number} teamLevel - Team level (0-10)
   * @returns {string} Color code
   */
  getUsernameColor(teamLevel) {
    return this.teamLevelColors[teamLevel] || this.teamLevelColors[0];
  }

  /**
   * Update settings
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  window.BadgeRenderer = BadgeRenderer;
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BadgeRenderer;
}
