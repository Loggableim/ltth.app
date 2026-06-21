/**
 * Virtual Scrolling for Large Leaderboards
 * Performance Optimization #8
 * 
 * Renders only visible items for optimal performance with 500+ players
 */

class VirtualLeaderboard {
  constructor(container, options = {}) {
    this.container = container;
    
    // Configuration
    this.config = {
      itemHeight: options.itemHeight || 60,
      overscan: options.overscan || 3,
      renderBatchSize: options.renderBatchSize || 20,
      throttleMs: options.throttleMs || 16
    };
    
    // Data
    this.allPlayers = [];
    this.visiblePlayers = [];
    
    // Scroll state
    this.scrollTop = 0;
    this.containerHeight = 0;
    this.totalHeight = 0;
    this.visibleStart = 0;
    this.visibleEnd = 0;
    
    // DOM elements
    this.viewport = null;
    this.content = null;
    
    // Performance tracking
    this.stats = {
      totalRenders: 0,
      lastRenderTime: 0,
      averageRenderTime: 0,
      itemsRendered: 0,
      itemsTotal: 0
    };
    
    // Throttle scroll handler
    this.scrollHandler = this.throttle(
      () => this.handleScroll(),
      this.config.throttleMs
    );
    
    this.init();
  }

  init() {
    this.viewport = document.createElement('div');
    this.viewport.className = 'virtual-leaderboard-viewport';
    this.viewport.style.cssText = `
      position: relative;
      overflow-y: auto;
      overflow-x: hidden;
      height: 100%;
      will-change: scroll-position;
      -webkit-overflow-scrolling: touch;
    `;
    
    this.content = document.createElement('div');
    this.content.className = 'virtual-leaderboard-content';
    this.content.style.cssText = `
      position: relative;
      will-change: height;
    `;
    
    this.viewport.appendChild(this.content);
    this.container.appendChild(this.viewport);
    
    this.viewport.addEventListener('scroll', this.scrollHandler, { passive: true });
    
    this.containerHeight = this.viewport.clientHeight;
    
    this.resizeObserver = new ResizeObserver(() => {
      this.containerHeight = this.viewport.clientHeight;
      this.render();
    });
    this.resizeObserver.observe(this.viewport);
  }

  setPlayers(players) {
    this.allPlayers = players;
    this.stats.itemsTotal = players.length;
    this.totalHeight = players.length * this.config.itemHeight;
    this.content.style.height = this.totalHeight + 'px';
    this.render();
  }

  handleScroll() {
    this.scrollTop = this.viewport.scrollTop;
    this.render();
  }

  calculateVisibleRange() {
    const scrollTop = this.scrollTop;
    const containerHeight = this.containerHeight;
    const itemHeight = this.config.itemHeight;
    const overscan = this.config.overscan;
    
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(
      this.allPlayers.length,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );
    
    return { start, end };
  }

  render() {
    const startTime = performance.now();
    
    const { start, end } = this.calculateVisibleRange();
    
    if (start === this.visibleStart && end === this.visibleEnd) {
      return;
    }
    
    this.visibleStart = start;
    this.visibleEnd = end;
    
    this.visiblePlayers = this.allPlayers.slice(start, end);
    
    this.content.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    
    this.visiblePlayers.forEach((player, index) => {
      const actualIndex = start + index;
      const item = this.renderPlayerItem(player, actualIndex);
      fragment.appendChild(item);
    });
    
    this.content.appendChild(fragment);
    
    const renderTime = performance.now() - startTime;
    this.stats.totalRenders++;
    this.stats.lastRenderTime = renderTime;
    this.stats.averageRenderTime = 
      (this.stats.averageRenderTime * (this.stats.totalRenders - 1) + renderTime) / 
      this.stats.totalRenders;
    this.stats.itemsRendered = this.visiblePlayers.length;
  }

  renderPlayerItem(player, index) {
    const item = document.createElement('div');
    item.className = 'virtual-player-item';
    item.dataset.userId = player.userId;
    
    const top = index * this.config.itemHeight;
    item.style.cssText = `
      position: absolute;
      top: ${top}px;
      left: 0;
      right: 0;
      height: ${this.config.itemHeight}px;
      will-change: transform;
      transform: translateZ(0);
    `;
    
    item.innerHTML = this.getPlayerHTML(player, index);
    
    return item;
  }

  getPlayerHTML(player, index) {
    const rank = index + 1;
    const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
    const nickname = player.nickname || player.uniqueId || player.userId || 'Player';
    const profilePictureUrl = player.profilePictureUrl || player.profile_picture_url || '';
    const safeTeam = typeof player.team === 'string' && /^(red|blue)$/.test(player.team) ? player.team : null;
    const safeCoins = Number.isFinite(Number(player.coins)) ? Number(player.coins) : 0;
    const safeGifts = Number.isFinite(Number(player.gifts)) ? Number(player.gifts) : 0;
    
    return `
      <div class="player-info ${rankClass}">
        <div class="player-rank">#${rank}</div>
        <div class="player-avatar">
          ${profilePictureUrl 
            ? `<img src="${this.escapeHTML(profilePictureUrl)}" alt="${this.escapeHTML(nickname)}">`
            : `<div class="avatar-placeholder">${this.escapeHTML(nickname.charAt(0).toUpperCase())}</div>`
          }
        </div>
        <div class="player-details">
          <div class="player-name">${this.escapeHTML(nickname)}</div>
          ${safeTeam ? `<div class="player-team team-${safeTeam}">${safeTeam}</div>` : ''}
        </div>
        <div class="player-stats">
          <div class="player-coins">
            <span class="coin-icon">🪙</span>
            <span class="coin-value">${safeCoins}</span>
          </div>
          ${safeGifts ? `<div class="player-gifts">${safeGifts} gifts</div>` : ''}
        </div>
      </div>
    `;
  }

  updatePlayer(userId, newData) {
    const playerIndex = this.allPlayers.findIndex(p => p.userId === userId);
    if (playerIndex === -1) return false;
    
    Object.assign(this.allPlayers[playerIndex], newData);
    
    if (playerIndex >= this.visibleStart && playerIndex < this.visibleEnd) {
      const item = Array.from(this.content.children).find((child) => child.dataset.userId === String(userId));
      if (item) {
        item.innerHTML = this.getPlayerHTML(this.allPlayers[playerIndex], playerIndex);
      }
    }
    
    return true;
  }

  scrollToPlayer(userId) {
    const index = this.allPlayers.findIndex(p => p.userId === userId);
    if (index === -1) return false;
    
    const targetScroll = index * this.config.itemHeight;
    this.viewport.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
    });
    
    return true;
  }

  scrollToRank(rank) {
    const index = rank - 1;
    if (index < 0 || index >= this.allPlayers.length) return false;
    
    const targetScroll = index * this.config.itemHeight;
    this.viewport.scrollTo({
      top: targetScroll,
      behavior: 'smooth'
    });
    
    return true;
  }

  getVisiblePlayers() {
    return this.visiblePlayers;
  }

  getStats() {
    const visiblePercentage = this.stats.itemsTotal > 0
      ? ((this.stats.itemsRendered / this.stats.itemsTotal) * 100).toFixed(1)
      : '0.0';
    
    return {
      ...this.stats,
      visiblePercentage: visiblePercentage + '%',
      averageRenderTime: this.stats.averageRenderTime.toFixed(2) + 'ms',
      lastRenderTime: this.stats.lastRenderTime.toFixed(2) + 'ms'
    };
  }

  throttle(func, wait) {
    let timeout = null;
    let previous = 0;
    
    return function(...args) {
      const now = Date.now();
      const remaining = wait - (now - previous);
      
      if (remaining <= 0 || remaining > wait) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        previous = now;
        func.apply(this, args);
      } else if (!timeout) {
        timeout = setTimeout(() => {
          previous = Date.now();
          timeout = null;
          func.apply(this, args);
        }, remaining);
      }
    };
  }

  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  destroy() {
    this.viewport.removeEventListener('scroll', this.scrollHandler);
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    if (this.container.contains(this.viewport)) {
      this.container.removeChild(this.viewport);
    }
    
    this.allPlayers = [];
    this.visiblePlayers = [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = VirtualLeaderboard;
}
