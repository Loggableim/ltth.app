/**
 * Leaderboard Popup Overlay
 * Temporary popup for highlights and events
 */

class LeaderboardPopup {
  constructor() {
    this.socket = null;
    this.data = [];
    this.previousRanks = new Map();
    this.isVisible = false;
    this.hideTimeout = null;
    this.config = {
      maxEntries: 5,
      showAvatars: true,
      autoHide: true,
      hideDelay: 10000,
      animationIntensity: 'high',
      theme: 'neon',
      showOnHype: true
    };
    
    this.init();
  }

  init() {
    this.parseUrlParams();
    this.applyTheme();
    this.connectSocket();
    this.fetchInitialData();
  }

  parseUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.has('maxEntries')) {
      this.config.maxEntries = parseInt(urlParams.get('maxEntries')) || 5;
    }
    if (urlParams.has('showAvatars')) {
      this.config.showAvatars = urlParams.get('showAvatars') !== 'false';
    }
    if (urlParams.has('autoHide')) {
      this.config.autoHide = urlParams.get('autoHide') !== 'false';
    }
    if (urlParams.has('hideDelay')) {
      this.config.hideDelay = parseInt(urlParams.get('hideDelay')) || 10000;
    }
    if (urlParams.has('animationIntensity')) {
      this.config.animationIntensity = urlParams.get('animationIntensity') || 'high';
    }
    if (urlParams.has('theme')) {
      this.config.theme = urlParams.get('theme') || 'neon';
    }
    if (urlParams.has('showOnHype')) {
      this.config.showOnHype = urlParams.get('showOnHype') !== 'false';
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
    }
  }

  handleUpdate(data) {
    if (!data.session || !data.session.data) {
      return;
    }

    const sessionData = data.session.data.slice(0, this.config.maxEntries);
    
    const hasRankChanges = this.detectRankChanges(sessionData);
    
    this.updatePreviousRanks(sessionData);
    this.data = sessionData;
    
    this.render();
    
    if (hasRankChanges || !this.config.autoHide) {
      this.show();
    }
  }

  detectRankChanges(newData) {
    return newData.some(entry => {
      const userId = entry.userId || entry.user_id;
      const previousRank = this.previousRanks.get(userId);
      return previousRank !== undefined && previousRank !== entry.rank;
    });
  }

  handleReset() {
    this.data = [];
    this.previousRanks.clear();
    this.render();
    this.hide();
  }

  handleHypeStart() {
    if (this.config.showOnHype) {
      this.show(15000);
    }
    document.querySelector('.popup-container').classList.add('hype-mode');
  }

  handleHypeEnd() {
    document.querySelector('.popup-container').classList.remove('hype-mode');
  }

  updatePreviousRanks(newData) {
    newData.forEach(entry => {
      const userId = entry.userId || entry.user_id;
      if (!this.previousRanks.has(userId)) {
        this.previousRanks.set(userId, entry.rank);
      }
    });
  }

  show(customDelay) {
    const container = document.getElementById('popup-container');
    container.classList.add('visible');
    this.isVisible = true;
    
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    
    if (this.config.autoHide) {
      const delay = customDelay || this.config.hideDelay;
      this.hideTimeout = setTimeout(() => {
        this.hide();
      }, delay);
    }
  }

  hide() {
    const container = document.getElementById('popup-container');
    container.classList.remove('visible');
    this.isVisible = false;
    
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  render() {
    const entriesContainer = document.getElementById('entries-container');
    
    if (!this.data || this.data.length === 0) {
      entriesContainer.innerHTML = `
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
      this.previousRanks.set(userId, rank);
      
      let rankDisplay = '';
      let rankClass = 'rank-other';
      let entryClass = '';
      
      if (rank <= 3) {
        entryClass = 'top-3';
      }
      
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
      
      const animationDelay = index * 0.1;
      
      html += `
        <div class="popup-entry ${entryClass}" style="animation-delay: ${animationDelay}s" data-user-id="${this.escapeHtml(userId)}">
          <div class="rank-badge ${rankClass}">${rankDisplay}</div>
          ${this.config.showAvatars && profilePic && this.isValidUrl(profilePic) ? 
            `<img src="${this.escapeHtml(profilePic)}" alt="${this.escapeHtml(nickname)}" class="profile-pic" onerror="this.style.display='none'">` : 
            ''}
          <div class="user-info">
            <div class="username">${this.escapeHtml(nickname)}</div>
            ${uniqueId ? `<div class="user-id">@${this.escapeHtml(uniqueId)}</div>` : ''}
          </div>
          <div class="coins-display">${this.formatNumber(coins)}</div>
        </div>
      `;
    });
    
    entriesContainer.innerHTML = html;
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
  window.leaderboardPopup = new LeaderboardPopup();
});
