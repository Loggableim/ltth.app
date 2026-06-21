/**
 * CoinBattle Overlay JavaScript
 * Real-time overlay with animations, themes, and effects
 */

(function() {
  'use strict';

  /**
   * Escape HTML to prevent XSS attacks
   * @param {string} unsafe - Unsafe string potentially containing HTML
   * @returns {string} Escaped safe string
   */
  function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Socket.io connection
  const socket = io();

  // Configuration
  let config = {
    theme: 'dark',
    skin: 'gold',
    layout: 'fullscreen',
    showAvatars: true,
    showBadges: true,
    animationSpeed: 'normal',
    toasterMode: false,
    kothMode: false,
    pyramidMode: false
  };

  // State
  let currentState = {
    active: false,
    match: null,
    leaderboard: [],
    teamScores: null,
    multiplier: { active: false },
    previousLeaderboard: [],
    teamNames: { red: { name: 'RED TEAM', imageUrl: null }, blue: { name: 'BLUE TEAM', imageUrl: null } }
  };

  // Pyramid state
  let pyramidState = {
    active: false,
    pyramid: [],
    leaderboard: [],
    remainingTime: 0,
    previousLeaderboard: [],
    config: {
      rowSizes: [1, 2, 4, 6],
      avatarSizes: [100, 70, 50, 40, 35, 30] // Sizes match CSS: row-1 to row-6
    }
  };

  // Timer state
  let timerInterval = null;
  let multiplierInterval = null;
  let pyramidWinnerTimeout = null; // Track timeout for cleanup

  // Avatar cache (including generated avatars)
  const avatarCache = new Map();
  const generatedAvatarCache = new Map();

  /**
   * Initialize overlay
   */
  function init() {
    loadConfig();
    applyTheme();
    connectSocket();
    startHeartbeat();
  }

  /**
   * Load configuration from URL parameters
   */
  function loadConfig() {
    const params = new URLSearchParams(window.location.search);
    
    config.theme = params.get('theme') || 'dark';
    config.skin = params.get('skin') || 'gold';
    config.layout = params.get('layout') || 'fullscreen';
    config.showAvatars = params.get('showAvatars') !== 'false';
    config.showBadges = params.get('showBadges') !== 'false';
    config.showXPAwards = params.get('showXPAwards') !== 'false';
    config.toasterMode = params.get('toasterMode') === 'true';
    config.kothMode = params.get('kothMode') === 'true';
    config.pyramidMode = params.get('pyramidMode') === 'true';
  }

  /**
   * Apply theme to body
   */
  function applyTheme() {
    // Sanitize config values to prevent potential issues with class names
    const sanitizeClassName = (value, defaultValue) => {
      if (!value || typeof value !== 'string') return defaultValue;
      // Only allow alphanumeric, hyphen, and underscore
      return value.replace(/[^a-zA-Z0-9\-_]/g, '');
    };
    
    // Build class list based on current config with proper defaults
    const classes = [
      `theme-${sanitizeClassName(config.theme, 'dark')}`,
      `layout-${sanitizeClassName(config.layout, 'fullscreen')}`,
      `skin-${sanitizeClassName(config.skin, 'gold')}`
    ];
    
    if (config.toasterMode) {
      classes.push('toaster-mode');
    }
    
    // Set all classes at once
    document.body.className = classes.join(' ');
  }

  /**
   * Connect to Socket.io
   */
  function connectSocket() {
    // Match state updates
    socket.on('coinbattle:match-state', (state) => {
      handleMatchState(state);
    });

    // Timer updates
    socket.on('coinbattle:timer-update', (data) => {
      updateTimer(data);
    });

    // Leaderboard updates
    socket.on('coinbattle:leaderboard-update', (data) => {
      updateLeaderboard(data);
    });

    // Match events
    socket.on('coinbattle:match-ended', (data) => {
      showWinnerReveal(data);
    });

    // Post-match display event
    socket.on('coinbattle:post-match', (data) => {
      handlePostMatchDisplay(data);
    });

    // Multiplier events
    socket.on('coinbattle:multiplier-activated', (data) => {
      showMultiplier(data);
    });

    socket.on('coinbattle:multiplier-ended', () => {
      hideMultiplier();
    });

    // Gift events
    socket.on('coinbattle:gift-received', (data) => {
      showGiftAnimation(data);
    });

    // Badge events
    socket.on('coinbattle:badges-awarded', (data) => {
      showBadgeNotification(data);
    });
    
    // Team names updated
    socket.on('coinbattle:team-names-updated', (data) => {
      updateTeamNames(data);
    });

    // Config updated (real-time design changes)
    socket.on('coinbattle:config-updated', (newConfig) => {
      handleConfigUpdate(newConfig);
    });

    // ==================== PYRAMID MODE EVENTS ====================
    
    // Pyramid round started
    socket.on('pyramid:round-started', (data) => {
      handlePyramidStart(data);
    });

    // Pyramid state (hydration)
    socket.on('pyramid:state', (data) => {
      handlePyramidState(data);
    });

    // Pyramid round ended
    socket.on('pyramid:round-ended', (data) => {
      handlePyramidEnd(data);
    });

    // Pyramid timer update
    socket.on('pyramid:timer-update', (data) => {
      updatePyramidTimer(data);
    });

    // Pyramid leaderboard update
    socket.on('pyramid:leaderboard-update', (data) => {
      updatePyramidLeaderboard(data);
    });

    // Pyramid player joined
    socket.on('pyramid:player-joined', (data) => {
      handlePyramidPlayerJoined(data);
    });

    // Pyramid points update
    socket.on('pyramid:points-update', (data) => {
      handlePyramidPointsUpdate(data);
    });

    // Pyramid knockout
    socket.on('pyramid:knockout', (data) => {
      showKnockoutAnimation(data);
    });

    // Pyramid round extended
    socket.on('pyramid:round-extended', (data) => {
      handlePyramidExtension(data);
    });

    // Pyramid config updated (row count changes, etc.)
    socket.on('pyramid:config-updated', (data) => {
      handlePyramidConfigUpdate(data);
    });

    // Request initial state after listeners are registered
    socket.emit('coinbattle:get-state');
    if (config.pyramidMode) {
      socket.emit('pyramid:get-state');
    }
  }

  /**
   * Handle match state update
   */
  function handleMatchState(state) {
    // Preserve previousLeaderboard when updating state
    const previousLeaderboard = currentState.previousLeaderboard || [];
    const previousTeamNames = currentState.teamNames || { red: { name: 'RED TEAM', imageUrl: null }, blue: { name: 'BLUE TEAM', imageUrl: null } };
    currentState = state;
    currentState.previousLeaderboard = currentState.previousLeaderboard || previousLeaderboard;
    currentState.teamNames = currentState.teamNames || previousTeamNames;

    if (state.active) {
      // Show match UI
      showMatchUI();
      
      // Check if Pyramid mode is active (takes priority)
      if (config.pyramidMode) {
        hidePyramidMode(); // Will be shown when pyramid starts
        hideKOTHMode();
      } else if (config.kothMode) {
        showKOTHMode();
        hidePyramidMode();
      } else {
        hideKOTHMode();
        hidePyramidMode();
      }
      
      // Update team scores if team mode
      if (state.match.mode === 'team' && state.teamScores) {
        updateTeamScores(state.teamScores, state.leaderboard);
      } else {
        hideTeamScores();
      }

      // Update leaderboard (hide if KOTH or Pyramid mode is active)
      if (state.leaderboard) {
        if (config.kothMode) {
          updateKOTHLeaderboard(state.leaderboard);
        } else if (!config.pyramidMode) {
          updateLeaderboard({
            leaderboard: state.leaderboard,
            teamScores: state.teamScores,
            mode: state.match.mode
          });
        }
      }

      // Update multiplier
      if (state.multiplier && state.multiplier.active) {
        showMultiplier(state.multiplier);
      } else {
        hideMultiplier();
      }
    } else {
      // Hide match UI
      hideMatchUI();
    }
  }

  /**
   * Show match UI
   */
  function showMatchUI() {
    document.getElementById('timer-container').style.display = 'block';
    document.getElementById('leaderboard-container').style.display = 'block';
  }

  /**
   * Hide match UI
   */
  function hideMatchUI() {
    document.getElementById('timer-container').style.display = 'none';
    document.getElementById('leaderboard-container').style.display = 'none';
    document.getElementById('team-scores-container').style.display = 'none';
    document.getElementById('multiplier-container').style.display = 'none';
    
    // Also hide post-match elements when match is not active
    const postMatchLeaderboard = document.getElementById('post-match-leaderboard');
    if (postMatchLeaderboard) {
      postMatchLeaderboard.style.display = 'none';
    }
    
    const winnerCredits = document.getElementById('winner-credits');
    if (winnerCredits) {
      winnerCredits.style.display = 'none';
    }
  }

  /**
   * Update timer display
   */
  function updateTimer(data) {
    const minutes = Math.floor(data.remaining / 60);
    const seconds = data.remaining % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const timerDisplay = document.getElementById('timer-display');
    timerDisplay.textContent = timeStr;

    // Update class for color coding
    timerDisplay.className = 'timer-display';
    if (data.remaining < 30) {
      timerDisplay.classList.add('danger');
    } else if (data.remaining < 60) {
      timerDisplay.classList.add('warning');
    }

    // Update circular progress
    const circle = document.getElementById('timer-circle-progress');
    const circumference = 2 * Math.PI * 45; // radius is 45
    const progress = data.remaining / data.total;
    const offset = circumference * (1 - progress);
    
    circle.style.strokeDashoffset = offset;
    circle.setAttribute('class', 'timer-circle-progress');
    if (data.remaining < 30) {
      circle.classList.add('danger');
    } else if (data.remaining < 60) {
      circle.classList.add('warning');
    }
  }

  /**
   * Update team scores with player avatars
   */
  function updateTeamScores(teamScores, leaderboard = []) {
    const container = document.getElementById('team-scores-container');
    container.style.display = 'flex';

    const redCoins = document.getElementById('team-red-coins');
    const blueCoins = document.getElementById('team-blue-coins');
    const redScore = document.querySelector('.team-score.team-red');
    const blueScore = document.querySelector('.team-score.team-blue');

    // Update team names
    const redNameEl = document.getElementById('team-red-name');
    const blueNameEl = document.getElementById('team-blue-name');
    const redImageEl = document.getElementById('team-red-image');
    const blueImageEl = document.getElementById('team-blue-image');
    
    if (currentState.teamNames && redNameEl && blueNameEl && redImageEl && blueImageEl) {
      redNameEl.textContent = currentState.teamNames.red.name || 'RED TEAM';
      blueNameEl.textContent = currentState.teamNames.blue.name || 'BLUE TEAM';
      
      if (currentState.teamNames.red.imageUrl) {
        redImageEl.src = currentState.teamNames.red.imageUrl;
        redImageEl.style.display = 'block';
      } else {
        redImageEl.style.display = 'none';
      }
      
      if (currentState.teamNames.blue.imageUrl) {
        blueImageEl.src = currentState.teamNames.blue.imageUrl;
        blueImageEl.style.display = 'block';
      } else {
        blueImageEl.style.display = 'none';
      }
    }

    // Animate coin changes
    animateValue(redCoins, parseInt(redCoins.textContent) || 0, teamScores.red, 500);
    animateValue(blueCoins, parseInt(blueCoins.textContent) || 0, teamScores.blue, 500);

    // Highlight leading team
    redScore.classList.toggle('leading', teamScores.red > teamScores.blue);
    blueScore.classList.toggle('leading', teamScores.blue > teamScores.red);
    
    // Update team player avatars
    if (leaderboard && leaderboard.length > 0) {
      updateTeamPlayerAvatars(leaderboard);
    }
  }

  /**
   * Update team player avatars
   */
  function updateTeamPlayerAvatars(leaderboard) {
    const redPlayersEl = document.getElementById('team-red-players');
    const bluePlayersEl = document.getElementById('team-blue-players');
    
    if (!redPlayersEl || !bluePlayersEl) {
      return; // Elements don't exist, exit safely
    }
    
    // Clear existing avatars (safe method)
    redPlayersEl.textContent = '';
    bluePlayersEl.textContent = '';
    
    // Group players by team
    const redPlayers = leaderboard.filter(p => p.team === 'red').slice(0, 8);
    const bluePlayers = leaderboard.filter(p => p.team === 'blue').slice(0, 8);
    
    // Helper function to add player avatar to container
    const addPlayerAvatar = (player, container) => {
      try {
        const avatarContainer = createAvatar(player, 'team-player-avatar', 40);
        if (!avatarContainer) {
          return; // Skip if createAvatar fails
        }
        const avatarImg = avatarContainer.querySelector('.team-player-avatar');
        if (avatarImg) {
          avatarImg.title = player.nickname || player.unique_id || 'Unknown';
          container.appendChild(avatarImg);
        }
      } catch (error) {
        console.error('Failed to create player avatar:', error);
      }
    };
    
    // Add red team avatars
    redPlayers.forEach(player => addPlayerAvatar(player, redPlayersEl));
    
    // Add blue team avatars
    bluePlayers.forEach(player => addPlayerAvatar(player, bluePlayersEl));
  }
  
  /**
   * Update team names
   */
  function updateTeamNames(data) {
    if (!currentState.teamNames) {
      currentState.teamNames = { red: { name: 'RED TEAM', imageUrl: null }, blue: { name: 'BLUE TEAM', imageUrl: null } };
    }
    
    if (data.team === 'red') {
      currentState.teamNames.red = { name: data.name, imageUrl: data.imageUrl };
    } else if (data.team === 'blue') {
      currentState.teamNames.blue = { name: data.name, imageUrl: data.imageUrl };
    }
    
    // Refresh team scores display if active
    if (currentState.active && currentState.match && currentState.match.mode === 'team') {
      updateTeamScores(currentState.teamScores, currentState.leaderboard);
    }
  }

  /**
   * Handle real-time config updates from backend
   */
  function handleConfigUpdate(newConfig) {
    // Update config state
    config.theme = newConfig.theme || config.theme;
    config.skin = newConfig.skin || config.skin;
    config.layout = newConfig.layout || config.layout;
    config.showAvatars = newConfig.showAvatars !== undefined ? newConfig.showAvatars : config.showAvatars;
    config.showBadges = newConfig.showBadges !== undefined ? newConfig.showBadges : config.showBadges;
    config.showXPAwards = newConfig.showXPAwards !== undefined ? newConfig.showXPAwards : config.showXPAwards;
    config.toasterMode = newConfig.toasterMode !== undefined ? newConfig.toasterMode : config.toasterMode;

    // Apply theme changes
    applyTheme();

    // Refresh current display with new config
    if (currentState.active) {
      // Refresh leaderboard with new settings
      if (currentState.leaderboard) {
        updateLeaderboard({
          leaderboard: currentState.leaderboard,
          teamScores: currentState.teamScores,
          mode: currentState.match ? currentState.match.mode : 'solo'
        });
      }

      // Refresh team scores if in team mode
      if (currentState.match && currentState.match.mode === 'team' && currentState.teamScores) {
        updateTeamScores(currentState.teamScores, currentState.leaderboard);
      }
    }
  }

  /**
   * Hide team scores
   */
  function hideTeamScores() {
    document.getElementById('team-scores-container').style.display = 'none';
  }

  /**
   * Update leaderboard
   */
  function updateLeaderboard(data) {
    const container = document.getElementById('leaderboard-content');
    const leaderboard = data.leaderboard || [];
    const teamScores = data.teamScores;
    const mode = data.mode;

    // Store previous positions for animation
    const previousPositions = new Map();
    if (currentState.previousLeaderboard && Array.isArray(currentState.previousLeaderboard)) {
      currentState.previousLeaderboard.forEach((player, index) => {
        previousPositions.set(player.user_id, index);
      });
    }

    // Render leaderboard (safe clear)
    container.textContent = '';

    leaderboard.forEach((player, index) => {
      const entry = createLeaderboardEntry(player, index, previousPositions, mode);
      container.appendChild(entry);
    });

    // Store current leaderboard for next update
    currentState.previousLeaderboard = leaderboard;
  }

  /**
   * Create leaderboard entry element
   */
  function createLeaderboardEntry(player, index, previousPositions, mode) {
    const entry = document.createElement('div');
    entry.className = 'leaderboard-entry';
    entry.classList.add(`rank-${index + 1}`);

    // Check if position changed
    const prevPosition = previousPositions.get(player.user_id);
    if (prevPosition !== undefined) {
      if (prevPosition > index) {
        entry.classList.add('moving-up');
      } else if (prevPosition < index) {
        entry.classList.add('moving-down');
      }
    }

    // Rank
    const rank = document.createElement('div');
    rank.className = 'entry-rank';
    rank.textContent = `#${index + 1}`;
    entry.appendChild(rank);

    // Avatar
    if (config.showAvatars) {
      const avatarContainer = createAvatar(player, 'entry-avatar', 50);
      const avatarImg = avatarContainer.querySelector('.entry-avatar');
      if (avatarImg) {
        entry.appendChild(avatarImg);
      }
    }

    // Player info
    const info = document.createElement('div');
    info.className = 'entry-info';

    const name = document.createElement('div');
    name.className = 'entry-name';
    name.textContent = player.nickname || player.unique_id;
    info.appendChild(name);

    // Badges
    if (config.showBadges && player.badges) {
      const badgesContainer = document.createElement('div');
      badgesContainer.className = 'entry-badges';
      
      let badges = [];
      try {
        badges = typeof player.badges === 'string' ? JSON.parse(player.badges) : player.badges;
      } catch (e) {
        badges = [];
      }

      badges.slice(0, 3).forEach(badgeId => {
        const badge = document.createElement('span');
        badge.className = 'entry-badge';
        badge.textContent = getBadgeIcon(badgeId);
        badgesContainer.appendChild(badge);
      });

      info.appendChild(badgesContainer);
    }

    entry.appendChild(info);

    // Team badge (if team mode)
    if (mode === 'team' && player.team) {
      const teamBadge = document.createElement('div');
      teamBadge.className = `entry-team ${player.team}`;
      teamBadge.textContent = player.team.toUpperCase();
      entry.appendChild(teamBadge);
    }

    // Coins
    const coins = document.createElement('div');
    coins.className = 'entry-coins';
    coins.textContent = (player.coins || 0).toLocaleString();
    entry.appendChild(coins);

    return entry;
  }

  /**
   * Get cached avatar or load new one
   */
  function getCachedAvatar(url) {
    if (avatarCache.has(url)) {
      return avatarCache.get(url);
    }
    avatarCache.set(url, url);
    return url;
  }

  /**
   * Get badge icon
   */
  function getBadgeIcon(badgeId) {
    const icons = {
      'top_donator': '👑',
      'legend': '⭐',
      'supporter': '💎',
      'team_player': '🤝',
      'coin_master': '🪙',
      'generous': '🎁',
      'champion': '🏆',
      'veteran': '🎖️'
    };
    return icons[badgeId] || '🏅';
  }

  /**
   * Show multiplier indicator
   */
  function showMultiplier(data) {
    const container = document.getElementById('multiplier-container');
    const value = document.getElementById('multiplier-value');
    const time = document.getElementById('multiplier-time');

    value.textContent = `${data.multiplier || data.value}x`;
    container.style.display = 'block';

    // Clear existing interval
    if (multiplierInterval) {
      clearInterval(multiplierInterval);
    }

    // Update countdown
    if (data.endTime) {
      multiplierInterval = setInterval(() => {
        const remaining = Math.max(0, Math.floor((data.endTime - Date.now()) / 1000));
        time.textContent = `${remaining}s`;
        
        if (remaining === 0) {
          clearInterval(multiplierInterval);
        }
      }, 1000);
    } else if (data.duration) {
      let remaining = data.duration;
      multiplierInterval = setInterval(() => {
        remaining--;
        time.textContent = `${remaining}s`;
        
        if (remaining === 0) {
          clearInterval(multiplierInterval);
          hideMultiplier();
        }
      }, 1000);
    }
  }

  /**
   * Hide multiplier indicator
   */
  function hideMultiplier() {
    const container = document.getElementById('multiplier-container');
    container.style.display = 'none';
    
    if (multiplierInterval) {
      clearInterval(multiplierInterval);
      multiplierInterval = null;
    }
  }

  /**
   * Show gift animation
   */
  function showGiftAnimation(data) {
    if (config.toasterMode) return; // Skip animations in toaster mode

    const container = document.getElementById('gift-animations');
    const particle = document.createElement('div');
    particle.className = 'gift-particle';
    particle.textContent = '🎁';

    // Random position
    particle.style.left = `${Math.random() * 80 + 10}%`;
    particle.style.bottom = '0';

    container.appendChild(particle);

    // Remove after animation
    setTimeout(() => {
      particle.remove();
    }, 3000);
  }

  /**
   * Show badge notification
   */
  function showBadgeNotification(data) {
    if (config.toasterMode) return; // Skip animations in toaster mode

    const container = document.getElementById('badge-notification');
    const icon = document.getElementById('badge-icon');
    const title = document.getElementById('badge-title');
    const name = document.getElementById('badge-name');

    if (data.badges && data.badges.length > 0) {
      const badge = data.badges[0];
      icon.textContent = badge.icon || '🏆';
      title.textContent = 'Achievement Unlocked!';
      name.textContent = badge.name;

      container.style.display = 'block';

      setTimeout(() => {
        container.style.display = 'none';
      }, 5000);
    }
  }

  /**
   * Show winner reveal
   */
  function showWinnerReveal(data) {
    const container = document.getElementById('winner-reveal');
    const winnerName = document.getElementById('winner-name');
    const winnerCoins = document.getElementById('winner-coins');

    let winner = null;
    if (data.winner && data.winner.winner_team) {
      // Team winner
      winnerName.textContent = `${data.winner.winner_team.toUpperCase()} TEAM WINS!`;
      winnerCoins.textContent = data.winner.winner_team === 'red' 
        ? data.teamScores.red.toLocaleString()
        : data.teamScores.blue.toLocaleString();
    } else if (data.leaderboard && data.leaderboard.length > 0) {
      // Solo winner
      winner = data.leaderboard[0];
      winnerName.textContent = winner.nickname || winner.unique_id;
      winnerCoins.textContent = winner.coins.toLocaleString();
    }

    // Show winner reveal
    container.style.display = 'flex';

    // Create confetti
    if (!config.toasterMode) {
      createConfetti();
    }

    // Hide after 10 seconds
    setTimeout(() => {
      container.style.display = 'none';
    }, 10000);
  }

  /**
   * Create confetti animation
   */
  function createConfetti() {
    const container = document.getElementById('confetti');
    const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f7b731'];

    for (let i = 0; i < 100; i++) {
      setTimeout(() => {
        const confetti = document.createElement('div');
        confetti.className = 'confetti-piece';
        confetti.style.left = `${Math.random() * 100}%`;
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = `${Math.random() * 0.5}s`;
        
        container.appendChild(confetti);

        setTimeout(() => {
          confetti.remove();
        }, 3000);
      }, i * 30);
    }
  }

  /**
   * Show KOTH mode container
   */
  function showKOTHMode() {
    document.getElementById('koth-container').style.display = 'block';
    document.getElementById('leaderboard-container').style.display = 'none';
  }

  /**
   * Hide KOTH mode container
   */
  function hideKOTHMode() {
    document.getElementById('koth-container').style.display = 'none';
    document.getElementById('leaderboard-container').style.display = 'block';
  }

  /**
   * Create avatar element with fallback
   */
  function createAvatar(user, className, size = 80) {
    const avatarContainer = document.createElement('div');
    avatarContainer.className = `${className}-container`;
    
    if (user.profile_picture_url) {
      const avatar = document.createElement('img');
      avatar.className = className;
      // Use cached avatar URL
      avatar.src = getCachedAvatar(user.profile_picture_url);
      avatar.alt = user.nickname || user.unique_id || 'User';
      avatar.loading = 'lazy';
      
      // Fallback to default avatar on error (with flag to prevent infinite loop)
      let errorHandled = false;
      avatar.onerror = () => {
        if (!errorHandled) {
          errorHandled = true;
          try {
            avatar.src = createDefaultAvatar(user.nickname || user.unique_id || 'U', size);
          } catch (error) {
            console.error('Failed to create fallback avatar:', error);
            // Hide avatar if fallback fails
            avatar.style.display = 'none';
          }
        }
      };
      
      avatarContainer.appendChild(avatar);
    } else {
      // Create default avatar with user's initial
      const defaultAvatar = document.createElement('img');
      defaultAvatar.className = className;
      try {
        defaultAvatar.src = createDefaultAvatar(user.nickname || user.unique_id || 'U', size);
      } catch (error) {
        console.error('Failed to create default avatar:', error);
        defaultAvatar.style.display = 'none';
      }
      defaultAvatar.alt = user.nickname || user.unique_id || 'User';
      avatarContainer.appendChild(defaultAvatar);
    }
    
    return avatarContainer;
  }

  /**
   * Create default avatar with user's initial (cached)
   * Constants for avatar generation
   */
  const AVATAR_SATURATION = 65;
  const AVATAR_LIGHTNESS = 50;
  const AVATAR_FONT_SIZE_RATIO = 0.5;

  function createDefaultAvatar(name, size = 80) {
    const cacheKey = `${name}_${size}`;
    
    // Return cached avatar if available
    if (generatedAvatarCache.has(cacheKey)) {
      return generatedAvatarCache.get(cacheKey);
    }
    
    const initial = name.charAt(0).toUpperCase();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Canvas context not available');
    }
    
    // Generate color based on name
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    
    // Draw background
    ctx.fillStyle = `hsl(${hue}, ${AVATAR_SATURATION}%, ${AVATAR_LIGHTNESS}%)`;
    ctx.fillRect(0, 0, size, size);
    
    // Draw initial
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size * AVATAR_FONT_SIZE_RATIO}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, size / 2, size / 2);
    
    const dataUrl = canvas.toDataURL();
    
    // Cache the generated avatar
    generatedAvatarCache.set(cacheKey, dataUrl);
    
    return dataUrl;
  }

  /**
   * Update KOTH leaderboard (pyramid: 1 king at top, 3 challengers below)
   */
  function updateKOTHLeaderboard(leaderboard) {
    if (!leaderboard || leaderboard.length === 0) return;
    
    const kingContainer = document.getElementById('koth-king');
    const challengersContainer = document.getElementById('koth-challengers');
    
    if (!kingContainer || !challengersContainer) {
      return; // Elements don't exist, exit safely
    }
    
    // Update King (1st place)
    if (leaderboard.length > 0) {
      const king = leaderboard[0];
      kingContainer.textContent = ''; // Clear existing content (safe)
      
      // Crown icon
      const crownDiv = document.createElement('div');
      crownDiv.className = 'koth-king-crown';
      crownDiv.textContent = '👑';
      kingContainer.appendChild(crownDiv);
      
      // Avatar with fallback
      const avatarContainer = createAvatar(king, 'koth-king-avatar', 100);
      kingContainer.appendChild(avatarContainer);
      
      // Name (escaped via textContent)
      const nameDiv = document.createElement('div');
      nameDiv.className = 'koth-king-name';
      nameDiv.textContent = king.nickname || king.unique_id || 'Unknown';
      kingContainer.appendChild(nameDiv);
      
      // Coins
      const coinsDiv = document.createElement('div');
      coinsDiv.className = 'koth-king-coins';
      coinsDiv.textContent = `${(king.coins || 0).toLocaleString()} 🪙`;
      kingContainer.appendChild(coinsDiv);
    }
    
    // Update Challengers (2nd, 3rd, 4th place)
    challengersContainer.textContent = ''; // Safe clear
    for (let i = 1; i <= 3 && i < leaderboard.length; i++) {
      const challenger = leaderboard[i];
      const challengerEl = document.createElement('div');
      challengerEl.className = 'koth-challenger';
      
      // Rank badge
      const rankDiv = document.createElement('div');
      rankDiv.className = 'koth-challenger-rank';
      rankDiv.textContent = `#${i + 1}`;
      challengerEl.appendChild(rankDiv);
      
      // Avatar with fallback
      const avatarContainer = createAvatar(challenger, 'koth-challenger-avatar', 60);
      challengerEl.appendChild(avatarContainer);
      
      // Info container
      const infoDiv = document.createElement('div');
      infoDiv.className = 'koth-challenger-info';
      
      // Name (escaped via textContent)
      const nameDiv = document.createElement('div');
      nameDiv.className = 'koth-challenger-name';
      nameDiv.textContent = challenger.nickname || challenger.unique_id || 'Unknown';
      infoDiv.appendChild(nameDiv);
      
      // Coins
      const coinsDiv = document.createElement('div');
      coinsDiv.className = 'koth-challenger-coins';
      coinsDiv.textContent = `${(challenger.coins || 0).toLocaleString()} 🪙`;
      infoDiv.appendChild(coinsDiv);
      
      challengerEl.appendChild(infoDiv);
      challengersContainer.appendChild(challengerEl);
    }
  }

  /**
   * Animate value change
   */
  function animateValue(element, start, end, duration) {
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
      current += increment;
      if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
        current = end;
        clearInterval(timer);
      }
      element.textContent = Math.floor(current).toLocaleString();
    }, 16);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  function startHeartbeat() {
    setInterval(() => {
      if (!currentState.active) {
        socket.emit('coinbattle:get-state');
      }
    }, 30000); // Every 30 seconds
  }

  // ==================== PYRAMID MODE FUNCTIONS ====================

  /**
   * Show pyramid mode container
   */
  function showPyramidMode() {
    const container = document.getElementById('pyramid-container');
    if (container) {
      container.style.display = 'block';
    }
    document.getElementById('leaderboard-container').style.display = 'none';
    document.getElementById('koth-container').style.display = 'none';
    document.getElementById('timer-container').style.display = 'none';
    document.getElementById('team-scores-container').style.display = 'none';
  }

  /**
   * Hide pyramid mode container
   */
  function hidePyramidMode() {
    const container = document.getElementById('pyramid-container');
    if (container) {
      container.style.display = 'none';
    }
    if (!config.kothMode) {
      document.getElementById('leaderboard-container').style.display = 'block';
      document.getElementById('timer-container').style.display = 'flex';
    }
  }

  /**
   * Handle pyramid round start
   */
  function handlePyramidStart(data) {
    pyramidState.active = true;
    pyramidState.remainingTime = data.duration;
    pyramidState.pyramid = [];
    pyramidState.leaderboard = [];
    pyramidState.previousLeaderboard = [];
    
    // Store row sizes from server config
    if (data.rowSizes) {
      pyramidState.config.rowSizes = data.rowSizes;
    }

    // Show pyramid mode - if we received this event, pyramid round is starting
    showPyramidMode();
    initializePyramidRows(data.rowSizes);
    
    // Show and update pyramid timer
    const pyramidTimer = document.getElementById('pyramid-timer');
    if (pyramidTimer) {
      pyramidTimer.style.display = 'block';
    }
    updatePyramidTimer({ remaining: data.duration, total: data.duration });
  }

  /**
   * Handle hydration of pyramid state for newly connected overlays
   */
  function handlePyramidState(state) {
    if (!state) return;

    pyramidState.active = state.active;
    pyramidState.remainingTime = state.remainingTime || 0;
    pyramidState.pyramid = state.pyramid || [];
    pyramidState.leaderboard = state.leaderboard || [];
    pyramidState.previousLeaderboard = [];

    if (state.config && state.config.rowSizes) {
      pyramidState.config.rowSizes = state.config.rowSizes;
    }

    if (!state.active) {
      hidePyramidMode();
      return;
    }

    // Show pyramid mode when state is active - if we have pyramid state, show it
    showPyramidMode();
    initializePyramidRows(pyramidState.config.rowSizes);
    updatePyramidTimer({
      remaining: pyramidState.remainingTime,
      total: state.roundDuration || pyramidState.remainingTime || 0
    });
    updatePyramidLeaderboard({
      pyramid: pyramidState.pyramid,
      leaderboard: pyramidState.leaderboard
    });
  }

  /**
   * Handle pyramid round end
   */
  async function handlePyramidEnd(data) {
    pyramidState.active = false;

    // Hide the pyramid timer immediately when round ends
    const pyramidTimer = document.getElementById('pyramid-timer');
    if (pyramidTimer) {
      pyramidTimer.style.display = 'none';
    }

    // Display final leaderboard in pyramid before showing winner
    if (data.leaderboard && data.leaderboard.length > 0) {
      updatePyramidLeaderboard({
        pyramid: data.pyramid || pyramidState.pyramid,
        leaderboard: data.leaderboard,
        totalPlayers: data.totalPlayers
      });
    }

    if (data.winner) {
      // Attach XP data to winner if available
      let winnerWithXP = { ...data.winner };
      if (data.xpRewards && data.xpRewards.length > 0) {
        // Find XP reward for the winner (place 1)
        const winnerReward = data.xpRewards.find(r => r.place === 1);
        if (winnerReward) {
          // Sanitize XP value to ensure it's a valid non-negative integer
          const xpValue = Number(winnerReward.xp);
          winnerWithXP.xp = Math.max(0, Math.floor(isNaN(xpValue) ? 0 : xpValue));
        }
      }
      showPyramidWinner(winnerWithXP, data.leaderboard);
    }

    // Show post-match leaderboard if requested
    if (data.postMatchConfig && data.leaderboard && data.leaderboard.length > 0) {
      // Transform pyramid leaderboard to match post-match format
      const transformedLeaderboard = data.leaderboard.map(player => ({
        ...player,
        coins: player.points || 0, // Map points to coins for display
        profile_picture_url: player.profile_picture_url || player.profilePictureUrl || '',
        nickname: player.nickname || player.uniqueId || 'Player',
        unique_id: player.uniqueId || player.userId
      }));

      // Wait for winner reveal (10 seconds) before showing post-match
      setTimeout(async () => {
        // Hide pyramid display before showing post-match
        hidePyramidMode();
        
        // Show post-match display
        await handlePostMatchDisplay({
          config: data.postMatchConfig,
          winnersWithXP: data.xpRewards ? data.xpRewards.map((reward, index) => {
            const player = data.leaderboard[index];
            if (!player) return null; // Skip if player doesn't exist
            return {
              ...player,
              coins: player.points || 0,
              xp: reward.xp,
              placement: reward.place
            };
          }).filter(Boolean) : [], // Remove null entries
          leaderboard: transformedLeaderboard
        });
      }, 10000);
    } else {
      // Reset after showing winner (if no post-match)
      setTimeout(() => {
        if (!pyramidState.active) {
          hidePyramidMode();
        }
      }, 10000);
    }
  }

  /**
   * Initialize pyramid rows
   */
  function initializePyramidRows(rowSizes) {
    // Use provided rowSizes or fall back to config
    const sizes = rowSizes || pyramidState.config.rowSizes;
    const rowsContainer = document.getElementById('pyramid-rows');
    if (!rowsContainer) return;
    
    console.log('[CoinBattle] Initializing pyramid rows:', sizes);
    
    // Remove all existing rows first
    rowsContainer.textContent = '';
    
    // Create rows based on current configuration
    sizes.forEach((slotCount, rowIndex) => {
      const rowEl = document.createElement('div');
      rowEl.className = `pyramid-row pyramid-row-${rowIndex + 1}`;
      rowEl.id = `pyramid-row-${rowIndex + 1}`;
      
      for (let i = 0; i < slotCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'pyramid-slot pyramid-slot-empty';
        slot.dataset.rowIndex = rowIndex;
        slot.dataset.slotIndex = i;
        
        const avatar = document.createElement('div');
        avatar.className = 'pyramid-avatar-placeholder';
        slot.appendChild(avatar);
        
        const score = document.createElement('div');
        score.className = 'pyramid-score';
        score.textContent = '---';
        slot.appendChild(score);
        
        rowEl.appendChild(slot);
      }
      
      rowsContainer.appendChild(rowEl);
    });
    
    console.log('[CoinBattle] Pyramid rows initialized:', sizes.length, 'rows with', sizes.reduce((a, b) => a + b, 0), 'total slots');
  }

  /**
   * Update pyramid timer
   */
  function updatePyramidTimer(data) {
    pyramidState.remainingTime = data.remaining;
    
    const timerEl = document.getElementById('pyramid-timer');
    if (!timerEl) return;
    
    const minutes = Math.floor(data.remaining / 60);
    const seconds = data.remaining % 60;
    timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    // Add warning/danger classes
    timerEl.className = 'pyramid-timer';
    if (data.remaining < 30) {
      timerEl.classList.add('danger');
    } else if (data.remaining < 60) {
      timerEl.classList.add('warning');
    }
  }

  /**
   * Update pyramid leaderboard
   */
  function updatePyramidLeaderboard(data) {
    pyramidState.pyramid = data.pyramid || [];
    pyramidState.leaderboard = data.leaderboard || [];
    
    // Skip update if pyramid functionality not available (not active and no URL param)
    if (!config.pyramidMode && !pyramidState.active) return;
    
    // Render each row
    data.pyramid.forEach((row, rowIndex) => {
      const rowEl = document.getElementById(`pyramid-row-${rowIndex + 1}`);
      if (!rowEl) return;
      
      row.slots.forEach((slot, slotIndex) => {
        const slotEl = rowEl.children[slotIndex];
        if (!slotEl) return;
        
        if (slot.filled && slot.player) {
          renderPyramidSlot(slotEl, slot.player, rowIndex, slotIndex);
        } else {
          renderEmptyPyramidSlot(slotEl, rowIndex, slotIndex);
        }
      });
    });
    
    // Store for animation detection
    pyramidState.previousLeaderboard = [...pyramidState.leaderboard];
  }

  /**
   * Render a filled pyramid slot
   */
  function renderPyramidSlot(slotEl, player, rowIndex, slotIndex) {
    slotEl.className = `pyramid-slot pyramid-slot-filled pyramid-slot-row-${rowIndex + 1}`;
    slotEl.dataset.userId = player.userId;
    
    // Check for position change animation
    const prevPosition = getPreviousPosition(player.userId);
    const currentPosition = getPositionFromRowSlot(rowIndex, slotIndex);
    
    if (prevPosition !== -1 && prevPosition !== currentPosition) {
      if (prevPosition > currentPosition) {
        slotEl.classList.add('moving-up');
        setTimeout(() => slotEl.classList.remove('moving-up'), 500);
      } else {
        slotEl.classList.add('moving-down');
        setTimeout(() => slotEl.classList.remove('moving-down'), 500);
      }
    }
    
    slotEl.textContent = ''; // Clear
    
    // Avatar
    const avatarContainer = createAvatar(player, `pyramid-avatar pyramid-avatar-row-${rowIndex + 1}`, getAvatarSizeForRow(rowIndex));
    const avatarImg = avatarContainer.querySelector('img');
    if (avatarImg) {
      slotEl.appendChild(avatarImg);
    }
    
    // Name
    const nameEl = document.createElement('div');
    nameEl.className = 'pyramid-name';
    nameEl.textContent = player.nickname || player.uniqueId || 'Unknown';
    slotEl.appendChild(nameEl);
    
    // Score
    const scoreEl = document.createElement('div');
    scoreEl.className = 'pyramid-score';
    scoreEl.textContent = formatPoints(player.points || 0);
    slotEl.appendChild(scoreEl);
  }

  /**
   * Render an empty pyramid slot
   */
  function renderEmptyPyramidSlot(slotEl, rowIndex, slotIndex) {
    slotEl.className = `pyramid-slot pyramid-slot-empty pyramid-slot-row-${rowIndex + 1}`;
    slotEl.dataset.userId = '';
    slotEl.textContent = '';
    
    const placeholder = document.createElement('div');
    placeholder.className = `pyramid-avatar-placeholder pyramid-avatar-row-${rowIndex + 1}`;
    slotEl.appendChild(placeholder);
    
    const score = document.createElement('div');
    score.className = 'pyramid-score';
    score.textContent = '---';
    slotEl.appendChild(score);
  }

  /**
   * Get avatar size for row (larger at top)
   * Sizes match CSS: row-1=100px, row-2=70px, row-3=50px, row-4=40px
   */
  function getAvatarSizeForRow(rowIndex) {
    return pyramidState.config.avatarSizes[rowIndex] || 40;
  }

  /**
   * Get position from row and slot indices
   */
  function getPositionFromRowSlot(rowIndex, slotIndex) {
    const rowSizes = pyramidState.config.rowSizes;
    let position = 1;
    for (let i = 0; i < rowIndex; i++) {
      position += rowSizes[i] || 0;
    }
    return position + slotIndex;
  }

  /**
   * Get previous position of a player
   */
  function getPreviousPosition(userId) {
    if (!pyramidState.previousLeaderboard) return -1;
    const index = pyramidState.previousLeaderboard.findIndex(p => p.userId === userId);
    return index === -1 ? -1 : index + 1;
  }

  /**
   * Format points for display (1k, 10k, 1M, etc.)
   */
  function formatPoints(points) {
    if (points >= 1000000) {
      return (points / 1000000).toFixed(2) + 'M';
    } else if (points >= 1000) {
      return Math.floor(points / 1000) + 'k';
    }
    return points.toString();
  }

  /**
   * Handle pyramid player joined
   */
  function handlePyramidPlayerJoined(data) {
    // Flash effect on new player
    if (config.pyramidMode && !config.toasterMode) {
      const container = document.getElementById('pyramid-container');
      if (container) {
        container.classList.add('player-joined-flash');
        setTimeout(() => container.classList.remove('player-joined-flash'), 500);
      }
    }
  }

  /**
   * Handle pyramid points update
   */
  function handlePyramidPointsUpdate(data) {
    // Position change animation handled in updatePyramidLeaderboard
    
    // Special knockout animation
    if (data.knockout) {
      showKnockoutAnimation({
        newLeader: data.player,
        previousLeader: null
      });
    }
  }

  /**
   * Show knockout animation
   */
  function showKnockoutAnimation(data) {
    if (config.toasterMode) return;
    
    const knockoutEl = document.getElementById('pyramid-knockout');
    if (!knockoutEl) return;
    
    const textEl = knockoutEl.querySelector('.knockout-text');
    if (textEl && data.newLeader) {
      textEl.textContent = `🥊 ${data.newLeader.nickname} TAKES THE LEAD!`;
    }
    
    knockoutEl.style.display = 'block';
    knockoutEl.classList.add('knockout-animate');
    
    setTimeout(() => {
      knockoutEl.style.display = 'none';
      knockoutEl.classList.remove('knockout-animate');
    }, 3000);
  }

  /**
   * Handle pyramid extension
   */
  function handlePyramidExtension(data) {
    // Flash timer to indicate extension
    const timerEl = document.getElementById('pyramid-timer');
    if (timerEl) {
      timerEl.classList.add('timer-extended');
      setTimeout(() => timerEl.classList.remove('timer-extended'), 1000);
    }
  }

  /**
   * Show pyramid winner
   */
  function showPyramidWinner(winner, leaderboard) {
    const container = document.getElementById('winner-reveal');
    const winnerName = document.getElementById('winner-name');
    const winnerCoins = document.getElementById('winner-coins');
    
    // Early return if required elements are missing
    if (!winner || !container || !winnerName || !winnerCoins) {
      return;
    }
    
    // Clear any existing timeout to prevent memory leaks and race conditions
    if (pyramidWinnerTimeout) {
      clearTimeout(pyramidWinnerTimeout);
    }
    
    const winnerStats = container.querySelector('.winner-stats');
    
    winnerName.textContent = winner.nickname || winner.uniqueId || 'Winner';
    winnerCoins.textContent = formatPoints(winner.points || 0);
    
    // Add XP display if XP rewards are enabled and winner has XP
    if (winnerStats && config.showXPAwards && winner.xp) {
      // Check if XP stat already exists
      let xpStat = winnerStats.querySelector('.winner-xp-stat');
      if (!xpStat) {
        xpStat = document.createElement('div');
        xpStat.className = 'winner-stat winner-xp-stat';
        winnerStats.appendChild(xpStat);
      }
      
      // Create elements safely to prevent XSS
      const labelSpan = document.createElement('span');
      labelSpan.className = 'stat-label';
      labelSpan.textContent = 'XP Earned:';
      
      const valueSpan = document.createElement('span');
      valueSpan.className = 'stat-value';
      valueSpan.textContent = `+${winner.xp}`; // Already sanitized in handlePyramidEnd
      
      xpStat.textContent = ''; // Clear existing content
      xpStat.appendChild(labelSpan);
      xpStat.appendChild(valueSpan);
    } else if (winnerStats) {
      // Remove XP stat if it exists but shouldn't be shown
      const xpStat = winnerStats.querySelector('.winner-xp-stat');
      if (xpStat) {
        xpStat.remove();
      }
    }
    
    container.style.display = 'flex';
    
    if (!config.toasterMode) {
      createConfetti();
    }
    
    // Store timeout ID for cleanup
    // Previous timeout is cleared above before setting new one
    pyramidWinnerTimeout = setTimeout(() => {
      container.style.display = 'none';
    }, 10000);
  }

  /**
   * Handle pyramid config update (row count changes, etc.)
   */
  function handlePyramidConfigUpdate(data) {
    if (!data) return;
    
    // Check if row count changed (requires full reinit)
    const rowCountChanged = data.rowSizes && 
      (data.rowSizes.length !== pyramidState.config.rowSizes.length ||
       data.rowSizes.some((size, i) => size !== pyramidState.config.rowSizes[i]));
    
    // Update row sizes in state
    if (data.rowSizes) {
      pyramidState.config.rowSizes = data.rowSizes;
    }
    
    // Update full config if provided
    if (data.config) {
      Object.assign(pyramidState.config, data.config);
    }
    
    // Re-initialize pyramid rows if active (from round events) or configured via URL
    if (config.pyramidMode || pyramidState.active) {
      initializePyramidRows(pyramidState.config.rowSizes);
      
      // If there's active data, re-render it
      if (pyramidState.active && pyramidState.pyramid.length > 0) {
        updatePyramidLeaderboard({
          pyramid: pyramidState.pyramid,
          leaderboard: pyramidState.leaderboard
        });
      }
      
      // For OBS Browser Sources: Force reload on row count change to clear cache
      // This ensures the pyramid structure updates properly in OBS
      // OBS aggressively caches content, so we need a full reload to ensure
      // the new row structure is properly rendered
      if (rowCountChanged && !pyramidState.active) {
        console.log('[CoinBattle] Pyramid row count changed, reloading overlay to clear OBS cache...');
        // 500ms delay ensures the config update event is fully processed
        // before triggering the reload
        const RELOAD_DELAY_MS = 500;
        setTimeout(() => {
          location.reload();
        }, RELOAD_DELAY_MS);
      }
    }
  }

  /**
   * Handle post-match display (leaderboards and winner credits)
   */
  async function handlePostMatchDisplay(data) {
    if (!data || !data.config) return;
    
    const { config: pmConfig, winnersWithXP, leaderboard } = data;
    
    // Show winner credits first if enabled
    if (pmConfig.showWinnerCredits && winnersWithXP && winnersWithXP.length > 0) {
      await showWinnerCredits(winnersWithXP, pmConfig);
    }
    
    // Then show leaderboards if enabled
    if (pmConfig.showLeaderboard && pmConfig.leaderboardTypes && pmConfig.leaderboardTypes.length > 0) {
      await showPostMatchLeaderboards(pmConfig, leaderboard);
    }
  }

  /**
   * Show winner credits roll animation
   */
  function showWinnerCredits(winners, config) {
    return new Promise((resolve) => {
      const container = document.getElementById('winner-credits');
      const creditsList = document.getElementById('credits-list');
      
      if (!container || !creditsList) {
        resolve();
        return;
      }
      
      // Clear previous credits
      creditsList.innerHTML = '';
      
      // Create credit entries for each winner
      winners.forEach((winner, index) => {
        const entry = document.createElement('div');
        entry.className = 'credits-entry';
        entry.style.animationDelay = `${index * 0.5}s`;
        
        const placement = winner.placement || (index + 1);
        const placementText = placement === 1 ? '🥇 1ST PLACE' : 
                             placement === 2 ? '🥈 2ND PLACE' :
                             placement === 3 ? '🥉 3RD PLACE' :
                             `#${placement}`;
        
        entry.innerHTML = `
          <div class="credits-placement">${placementText}</div>
          <div class="credits-name">${escapeHtml(winner.nickname || winner.uniqueId || 'Player')}</div>
          <div class="credits-stats">
            <div class="credits-stat">
              <span class="credits-stat-label">Coins:</span>
              <span class="credits-stat-value">${(winner.coins || 0).toLocaleString()}</span>
            </div>
            ${winner.team ? `
              <div class="credits-stat">
                <span class="credits-stat-label">Team:</span>
                <span class="credits-stat-value">${escapeHtml(winner.team.toUpperCase())}</span>
              </div>
            ` : ''}
          </div>
          ${config.showXPAwards ? `<div class="credits-xp">+${winner.xp || 0} XP</div>` : ''}
        `;
        
        creditsList.appendChild(entry);
      });
      
      // Show credits container
      container.style.display = 'block';
      
      // Calculate scroll duration based on number of winners
      const baseScrollDuration = 15; // Base 15 seconds
      const durationPerWinner = 2; // 2 seconds per winner
      const totalDuration = Math.max(baseScrollDuration, winners.length * durationPerWinner);
      const scrollDuration = Math.min(config.winnerCreditsDuration || 10, totalDuration);
      
      // Adjust animation duration
      const scrollEl = container.querySelector('.credits-scroll');
      if (scrollEl) {
        scrollEl.style.animationDuration = `${scrollDuration}s`;
      }
      
      // Hide after duration
      setTimeout(() => {
        container.style.display = 'none';
        resolve();
      }, scrollDuration * 1000);
    });
  }

  /**
   * Show post-match leaderboards
   */
  async function showPostMatchLeaderboards(config, matchLeaderboard) {
    if (!config.leaderboardTypes || config.leaderboardTypes.length === 0) return;
    
    // For each leaderboard type, fetch and display
    for (const type of config.leaderboardTypes) {
      await showSingleLeaderboard(type, config.leaderboardDuration, matchLeaderboard);
    }
  }

  /**
   * Show a single leaderboard
   */
  function showSingleLeaderboard(type, duration, matchLeaderboard) {
    return new Promise(async (resolve) => {
      const container = document.getElementById('post-match-leaderboard');
      const titleEl = document.getElementById('post-match-lb-title');
      const listEl = document.getElementById('post-match-lb-list');
      
      if (!container || !titleEl || !listEl) {
        console.warn('[CoinBattle] Post-match leaderboard elements not found');
        resolve();
        return;
      }
      
      // Set title based on type
      const titles = {
        weekly: '📅 WEEKLY LEADERBOARD',
        season: '🏅 SEASON LEADERBOARD',
        lifetime: '🏆 LIFETIME LEADERBOARD'
      };
      titleEl.textContent = titles[type] || '🏆 LEADERBOARD';
      
      // Fetch leaderboard data based on type
      let leaderboard = [];
      try {
        if (type === 'weekly') {
          const response = await fetch('/api/plugins/coinbattle/leaderboard/weekly?limit=10');
          const result = await response.json();
          if (result.success && result.data) {
            leaderboard = result.data;
          }
        } else if (type === 'season') {
          const response = await fetch('/api/plugins/coinbattle/leaderboard/season?limit=10');
          const result = await response.json();
          if (result.success && result.data) {
            leaderboard = result.data;
          }
        } else if (type === 'lifetime') {
          const response = await fetch('/api/plugins/coinbattle/leaderboard/lifetime?limit=10');
          const result = await response.json();
          if (result.success && result.data) {
            leaderboard = result.data;
          }
        } else {
          // Fallback to match leaderboard
          leaderboard = Array.isArray(matchLeaderboard) ? matchLeaderboard : [];
        }
      } catch (error) {
        console.error(`[CoinBattle] Error fetching ${type} leaderboard:`, error);
        // Fallback to match leaderboard on error
        leaderboard = Array.isArray(matchLeaderboard) ? matchLeaderboard : [];
      }
      
      console.log(`[CoinBattle] Showing ${type} leaderboard with ${leaderboard.length} entries`);
      
      // Clear previous entries
      listEl.innerHTML = '';
      
      // If no leaderboard data, show a message
      if (leaderboard.length === 0) {
        const noDataMsg = document.createElement('div');
        noDataMsg.className = 'post-match-lb-entry';
        noDataMsg.style.justifyContent = 'center';
        noDataMsg.innerHTML = '<div class="post-match-lb-name">No data available</div>';
        listEl.appendChild(noDataMsg);
      } else {
        // Create entries
        leaderboard.slice(0, 10).forEach((player, index) => {
          const entry = document.createElement('div');
          entry.className = 'post-match-lb-entry';
          
          const rank = index + 1;
          const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
          const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
          
          const profilePicUrl = player.profile_picture_url || '';
          const profilePicHtml = profilePicUrl ? 
            `<img src="${escapeHtml(profilePicUrl)}" class="post-match-lb-avatar" alt="${escapeHtml(player.nickname || '')}">` : 
            '<div class="post-match-lb-avatar"></div>';
          
          entry.innerHTML = `
            <div class="post-match-lb-rank ${rankClass}">${rankEmoji}</div>
            <div class="post-match-lb-player">
              ${profilePicHtml}
              <div class="post-match-lb-name">${escapeHtml(player.nickname || player.unique_id || 'Player')}</div>
            </div>
            <div class="post-match-lb-score">${(player.coins || player.total_coins || 0).toLocaleString()}</div>
          `;
          
          listEl.appendChild(entry);
        });
      }
      
      // Show container
      container.style.display = 'flex';
      
      // Hide after duration
      setTimeout(() => {
        container.style.display = 'none';
        resolve();
      }, (duration || 15) * 1000);
    });
  }

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
