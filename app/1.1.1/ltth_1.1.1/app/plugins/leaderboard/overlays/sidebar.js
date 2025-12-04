/**
 * Leaderboard Sidebar Overlay
 * Vertical sidebar layout for OBS (400x1080)
 */

class LeaderboardSidebar {
  constructor() {
    this.socket = null;
    this.data = [];
    this.previousRanks = new Map();
    this.maxCoins = 0;
    this.config = {
      maxEntries: 10,
      showAvatars: true,
      showProgress: true,
      animationIntensity: 'high',
      theme: 'neon'
    };
    
    this.init();
  }

  init() {
    this.parseUrlParams();
    this.applyTheme();
    this.connectSocket();
    this.fetchInitialData();
    this.startUpdateTimer();
  }

  parseUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.has('maxEntries')) {
      this.config.maxEntries = parseInt(urlParams.get('maxEntries')) || 10;
    }
    if (urlParams.has('showAvatars')) {
      this.config.showAvatars = urlParams.get('showAvatars') !== 'false';
    }
    if (urlParams.has('showProgress')) {
      this.config.showProgress = urlParams.get('showProgress') !== 'false';
    }
    if (urlParams.has('animationIntensity')) {
      this.config.animationIntensity = urlParams.get('animationIntensity') || 'high';
    }
    if (urlParams.has('theme')) {
      this.config.theme = urlParams.get('theme') || 'neon';
    }
  }

  applyTheme() {
    document.body.className = `theme-${this.config.theme}`;
  }

  connectSocket() {
    this.socket = io();
    
    this.socket.on('leaderboard:update', (data) => {
      this.handleUpdate(data);
    });

    this.socket.on('leaderboard:reset', () => {
      this.handleReset();
    });

    this.socket.on('leaderboard:hypeStart', () => {
      this.handleHypeStart();
    });

    this.socket.on('leaderboard:hypeEnd', () => {
      this.handleHypeEnd();
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.socket.emit('leaderboard:request-update');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.showWaitingIndicator();
    });
  }

  async fetchInitialData() {
    try {
      const response = await fetch('/api/plugins/leaderboard/combined?limit=' + this.config.maxEntries);
      const result = await response.json();
      
      if (result.success) {
        this.handleUpdate(result);
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
      this.showWaitingIndicator();
    }
  }

  handleUpdate(data) {
    if (!data.session || !data.session.data) {
      return;
    }

    const sessionData = data.session.data.slice(0, this.config.maxEntries);
    
    this.updatePreviousRanks(sessionData);
    this.data = sessionData;
    
    if (this.data.length > 0) {
      this.maxCoins = this.data[0].coins || this.data[0].total_coins || 0;
    }
    
    this.render();
    this.updateLastUpdatedTime();
  }

  handleReset() {
    this.data = [];
    this.previousRanks.clear();
    this.maxCoins = 0;
    this.render();
  }

  handleHypeStart() {
    document.querySelector('.sidebar-container').classList.add('hype-mode');
  }

  handleHypeEnd() {
    document.querySelector('.sidebar-container').classList.remove('hype-mode');
  }

  updatePreviousRanks(newData) {
    newData.forEach(entry => {
      const userId = entry.userId || entry.user_id;
      if (!this.previousRanks.has(userId)) {
        this.previousRanks.set(userId, entry.rank);
      }
    });
  }

  render() {
    const container = document.getElementById('entries-container');
    
    if (!this.data || this.data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎁</div>
          <p>Waiting for gifts...</p>
        </div>
      `;
      return;
    }

    let html = '';
    this.data.forEach((entry, index) => {
      const rank = entry.rank || index + 1;
      const userId = entry.user_id || entry.userId;
      const nickname = entry.nickname || 'Unknown User';
      const uniqueId = entry.unique_id || entry.uniqueId || '';
      const profilePic = entry.profile_picture_url || entry.profilePictureUrl || '';
      const coins = entry.total_coins || entry.coins || 0;
      
      const previousRank = this.previousRanks.get(userId);
      let animationClass = '';
      if (previousRank !== undefined && previousRank > rank) {
        animationClass = 'rank-change-up';
      }
      
      this.previousRanks.set(userId, rank);
      
      let rankDisplay = '';
      let rankClass = 'rank-other';
      if (rank === 1) {
        rankClass = 'rank-1';
        rankDisplay = '👑';
      } else if (rank === 2) {
        rankClass = 'rank-2';
        rankDisplay = '🥈';
      } else if (rank === 3) {
        rankClass = 'rank-3';
        rankDisplay = '🥉';
      } else {
        rankDisplay = rank;
      }
      
      const progressPercent = this.maxCoins > 0 ? (coins / this.maxCoins) * 100 : 100;
      
      html += `
        <div class="sidebar-entry ${animationClass}" data-user-id="${this.escapeHtml(userId)}">
          <div class="rank-badge ${rankClass}">${rankDisplay}</div>
          ${this.config.showAvatars && profilePic && this.isValidUrl(profilePic) ? 
            `<img src="${this.escapeHtml(profilePic)}" alt="${this.escapeHtml(nickname)}" class="profile-pic" onerror="this.style.display='none'">` : 
            ''}
          <div class="user-info">
            <div class="username">${this.escapeHtml(nickname)}</div>
            ${uniqueId ? `<div class="user-id">@${this.escapeHtml(uniqueId)}</div>` : ''}
          </div>
          <div class="stats">
            <div class="coins-display">${this.formatNumber(coins)}</div>
            ${this.config.showProgress ? `
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressPercent}%"></div>
              </div>
              <div class="progress-text">${progressPercent.toFixed(0)}%</div>
            ` : ''}
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  }

  updateLastUpdatedTime() {
    const element = document.getElementById('last-updated');
    if (element) {
      element.textContent = 'Updated just now';
    }
  }

  startUpdateTimer() {
    setInterval(() => {
      const element = document.getElementById('last-updated');
      if (element && this.data.length > 0) {
        element.textContent = this.getRelativeTime();
      }
    }, 60000);
  }

  getRelativeTime() {
    return 'Updated just now';
  }

  showWaitingIndicator() {
    const container = document.getElementById('entries-container');
    container.innerHTML = '<div class="waiting-indicator">⏳ Connecting to server...</div>';
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  escapeHtml(text) {
    if (text === null || text === undefined) {
      return '';
    }
    
    const str = String(text);
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, m => map[m]);
  }

  isValidUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.leaderboardSidebar = new LeaderboardSidebar();
});
