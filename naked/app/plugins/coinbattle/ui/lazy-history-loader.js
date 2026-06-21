/**
 * Lazy Loading Pagination for Match History
 * Performance Optimization #4
 * 
 * Implements infinite scroll with lazy loading for efficient match history browsing
 */

class LazyMatchHistoryLoader {
  constructor(container, fetchFunction, options = {}) {
    this.container = container;
    this.fetchFunction = fetchFunction;
    
    // Configuration
    this.config = {
      pageSize: options.pageSize || 20,
      threshold: options.threshold || 200, // pixels before end to trigger load
      debounceMs: options.debounceMs || 100
    };
    
    // State
    this.currentPage = 0;
    this.totalMatches = null;
    this.isLoading = false;
    this.hasMore = true;
    this.matches = [];
    
    // DOM elements
    this.listElement = null;
    this.loaderElement = null;
    this.endElement = null;
    
    // Statistics
    this.stats = {
      totalLoaded: 0,
      totalPages: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    
    // Cache
    this.cache = new Map();
    
    this.init();
  }

  /**
   * Initialize the lazy loader
   */
  init() {
    // Create list container
    this.listElement = document.createElement('div');
    this.listElement.className = 'match-history-list';
    
    // Create loader indicator
    this.loaderElement = document.createElement('div');
    this.loaderElement.className = 'match-history-loader';
    this.loaderElement.innerHTML = `
      <div class="loader-spinner"></div>
      <p>Loading matches...</p>
    `;
    this.loaderElement.style.display = 'none';
    
    // Create end indicator
    this.endElement = document.createElement('div');
    this.endElement.className = 'match-history-end';
    this.endElement.innerHTML = '<p>No more matches to load</p>';
    this.endElement.style.display = 'none';
    
    // Add elements to container
    this.container.appendChild(this.listElement);
    this.container.appendChild(this.loaderElement);
    this.container.appendChild(this.endElement);
    
    // Setup scroll listener
    this.setupScrollListener();
    
    // Load first page
    this.loadNextPage();
  }

  /**
   * Setup scroll listener for infinite scroll
   */
  setupScrollListener() {
    const scrollHandler = this.debounce(() => {
      if (this.isLoading || !this.hasMore) return;
      
      const scrollTop = this.container.scrollTop;
      const scrollHeight = this.container.scrollHeight;
      const clientHeight = this.container.clientHeight;
      
      // Check if near bottom
      const distanceToBottom = scrollHeight - (scrollTop + clientHeight);
      
      if (distanceToBottom < this.config.threshold) {
        this.loadNextPage();
      }
    }, this.config.debounceMs);
    
    this.container.addEventListener('scroll', scrollHandler, { passive: true });
  }

  /**
   * Load next page of matches
   */
  async loadNextPage() {
    if (this.isLoading || !this.hasMore) return;
    
    this.isLoading = true;
    this.showLoader();
    
    try {
      // Check cache first
      const cacheKey = this.currentPage;
      let data;
      
      if (this.cache.has(cacheKey)) {
        data = this.cache.get(cacheKey);
        this.stats.cacheHits++;
      } else {
        // Fetch from server
        const offset = this.currentPage * this.config.pageSize;
        data = await this.fetchFunction(this.config.pageSize, offset);
        
        // Cache the result
        this.cache.set(cacheKey, data);
        this.stats.cacheMisses++;
      }
      
      // Process matches
      if (data && data.length > 0) {
        this.appendMatches(data);
        this.matches.push(...data);
        this.stats.totalLoaded += data.length;
        this.currentPage++;
        this.stats.totalPages++;
        
        // Check if there are more matches
        if (data.length < this.config.pageSize) {
          this.hasMore = false;
          this.showEnd();
        }
      } else {
        this.hasMore = false;
        this.showEnd();
      }
      
    } catch (error) {
      console.error('Failed to load match history:', error);
      this.showError('Failed to load matches. Please try again.');
    } finally {
      this.isLoading = false;
      this.hideLoader();
    }
  }

  /**
   * Append matches to the list
   */
  appendMatches(matches) {
    const fragment = document.createDocumentFragment();
    
    matches.forEach(match => {
      const matchElement = this.renderMatch(match);
      fragment.appendChild(matchElement);
    });
    
    this.listElement.appendChild(fragment);
  }

  /**
   * Render a single match item
   */
  renderMatch(match) {
    const item = document.createElement('div');
    item.className = 'match-history-item';
    item.dataset.matchId = match.id;
    
    const date = new Date(match.end_time * 1000);
    const dateStr = date.toLocaleString();
    
    const duration = match.duration 
      ? this.formatDuration(match.duration)
      : 'Unknown';
    
    const winner = match.winner_player_id 
      ? `Winner: ${match.winner_player_id}`
      : (match.winner_team ? `Team ${match.winner_team} wins!` : 'No winner');
    const totalCoins = Number.isFinite(Number(match.total_coins)) ? Number(match.total_coins) : 0;
    const totalGifts = Number.isFinite(Number(match.total_gifts)) ? Number(match.total_gifts) : 0;
    
    item.innerHTML = `
      <div class="match-header">
        <span class="match-id">#${this.escapeHTML(match.id)}</span>
        <span class="match-mode">${this.escapeHTML(match.mode || 'solo')}</span>
      </div>
      <div class="match-details">
        <div class="match-date">${this.escapeHTML(dateStr)}</div>
        <div class="match-duration">Duration: ${this.escapeHTML(duration)}</div>
      </div>
      <div class="match-stats">
        <span class="match-coins">${totalCoins.toLocaleString()} coins</span>
        <span class="match-gifts">${totalGifts.toLocaleString()} gifts</span>
      </div>
      <div class="match-winner">${this.escapeHTML(winner)}</div>
    `;
    
    return item;
  }

  /**
   * Format duration in seconds to readable string
   */
  formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Escape HTML to prevent injecting untrusted match data.
   */
  escapeHTML(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  /**
   * Show loader
   */
  showLoader() {
    this.loaderElement.style.display = 'block';
  }

  /**
   * Hide loader
   */
  hideLoader() {
    this.loaderElement.style.display = 'none';
  }

  /**
   * Show end message
   */
  showEnd() {
    this.endElement.style.display = 'block';
  }

  /**
   * Show error message
   */
  showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'match-history-error';
    errorElement.innerHTML = `
      <p class="error-message">${this.escapeHTML(message)}</p>
      <button class="retry-btn">Retry</button>
    `;
    
    errorElement.querySelector('.retry-btn').addEventListener('click', () => {
      errorElement.remove();
      this.loadNextPage();
    });
    
    this.listElement.appendChild(errorElement);
  }

  /**
   * Reload from beginning
   */
  reload() {
    this.currentPage = 0;
    this.hasMore = true;
    this.matches = [];
    this.listElement.innerHTML = '';
    this.endElement.style.display = 'none';
    this.cache.clear();
    
    this.loadNextPage();
  }

  /**
   * Get statistics
   */
  getStats() {
    const cacheHitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
      ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(1)
      : '0.0';
    
    return {
      ...this.stats,
      cacheHitRate: cacheHitRate + '%',
      cacheSize: this.cache.size,
      hasMore: this.hasMore,
      currentPage: this.currentPage
    };
  }

  /**
   * Debounce function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Destroy the loader
   */
  destroy() {
    this.container.innerHTML = '';
    this.cache.clear();
    this.matches = [];
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LazyMatchHistoryLoader;
}
