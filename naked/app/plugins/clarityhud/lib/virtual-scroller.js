/**
 * Virtual Scroller for ClarityHUD
 * 
 * Implements virtual scrolling/recycling for high-performance rendering
 * of 200+ messages per minute without FPS issues
 */

class VirtualScroller {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      itemHeight: options.itemHeight || 60, // Estimated height per item
      bufferSize: options.bufferSize || 5, // Extra items to render outside viewport
      maxItems: options.maxItems || 200, // Maximum items to keep in memory
      renderCallback: options.renderCallback || null, // Function to render each item
      ...options
    };

    // State
    this.items = [];
    this.visibleItems = [];
    this.scrollTop = 0;
    this.viewportHeight = 0;
    this.totalHeight = 0;

    // DOM elements
    this.viewport = null;
    this.content = null;

    // Performance
    this.rafId = null;
    this.lastUpdate = 0;
    this.throttleMs = 16; // ~60 FPS

    this.initialize();
  }

  /**
   * Initialize virtual scroller
   */
  initialize() {
    // Create viewport
    this.viewport = document.createElement('div');
    this.viewport.className = 'virtual-scroller-viewport';
    this.viewport.style.cssText = `
      width: 100%;
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      position: relative;
    `;

    // Create content container
    this.content = document.createElement('div');
    this.content.className = 'virtual-scroller-content';
    this.content.style.cssText = `
      position: relative;
      width: 100%;
    `;

    this.viewport.appendChild(this.content);
    this.container.appendChild(this.viewport);

    // Set up scroll listener
    this.viewport.addEventListener('scroll', () => this.handleScroll(), { passive: true });

    // Set up resize observer
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.viewport);
    }

    // Initial measurement
    this.updateViewportHeight();
  }

  /**
   * Add items to the scroller
   * @param {Array} newItems - Items to add
   * @param {boolean} prepend - Add to beginning instead of end
   */
  addItems(newItems, prepend = false) {
    if (!Array.isArray(newItems)) {
      newItems = [newItems];
    }

    if (prepend) {
      this.items = [...newItems, ...this.items];
    } else {
      this.items = [...this.items, ...newItems];
    }

    // Trim to max items
    if (this.items.length > this.options.maxItems) {
      if (prepend) {
        // Remove from end
        this.items = this.items.slice(0, this.options.maxItems);
      } else {
        // Remove from beginning
        this.items = this.items.slice(-this.options.maxItems);
      }
    }

    this.updateTotalHeight();
    this.requestUpdate();
  }

  /**
   * Set all items (replace existing)
   */
  setItems(items) {
    this.items = items.slice(-this.options.maxItems);
    this.updateTotalHeight();
    this.requestUpdate();
  }

  /**
   * Clear all items
   */
  clear() {
    this.items = [];
    this.visibleItems = [];
    this.content.innerHTML = '';
    this.updateTotalHeight();
  }

  /**
   * Handle scroll event
   */
  handleScroll() {
    this.scrollTop = this.viewport.scrollTop;
    this.requestUpdate();
  }

  /**
   * Handle resize event
   */
  handleResize() {
    this.updateViewportHeight();
    this.requestUpdate();
  }

  /**
   * Update viewport height
   */
  updateViewportHeight() {
    this.viewportHeight = this.viewport.clientHeight;
  }

  /**
   * Update total content height
   */
  updateTotalHeight() {
    this.totalHeight = this.items.length * this.options.itemHeight;
    this.content.style.height = `${this.totalHeight}px`;
  }

  /**
   * Request update (throttled)
   */
  requestUpdate() {
    if (this.rafId) {
      return;
    }

    this.rafId = requestAnimationFrame(() => {
      const now = Date.now();
      if (now - this.lastUpdate >= this.throttleMs) {
        this.update();
        this.lastUpdate = now;
      }
      this.rafId = null;
    });
  }

  /**
   * Update visible items
   */
  update() {
    // Calculate visible range
    const startIndex = Math.floor(this.scrollTop / this.options.itemHeight);
    const endIndex = Math.ceil((this.scrollTop + this.viewportHeight) / this.options.itemHeight);

    // Add buffer
    const bufferedStart = Math.max(0, startIndex - this.options.bufferSize);
    const bufferedEnd = Math.min(this.items.length, endIndex + this.options.bufferSize);

    // Get visible items
    const newVisibleItems = [];
    for (let i = bufferedStart; i < bufferedEnd; i++) {
      newVisibleItems.push({
        index: i,
        data: this.items[i],
        top: i * this.options.itemHeight
      });
    }

    // Check if visible items changed
    if (this.hasVisibleItemsChanged(newVisibleItems)) {
      this.visibleItems = newVisibleItems;
      this.render();
    }
  }

  /**
   * Check if visible items have changed
   */
  hasVisibleItemsChanged(newItems) {
    if (newItems.length !== this.visibleItems.length) {
      return true;
    }

    for (let i = 0; i < newItems.length; i++) {
      if (newItems[i].index !== this.visibleItems[i].index) {
        return true;
      }
    }

    return false;
  }

  /**
   * Render visible items
   */
  render() {
    // Clear existing content
    this.content.innerHTML = '';

    // Create fragment for better performance
    const fragment = document.createDocumentFragment();

    // Render each visible item
    for (const item of this.visibleItems) {
      const element = this.renderItem(item);
      if (element) {
        // Position absolutely
        element.style.position = 'absolute';
        element.style.top = `${item.top}px`;
        element.style.left = '0';
        element.style.right = '0';
        
        fragment.appendChild(element);
      }
    }

    this.content.appendChild(fragment);
  }

  /**
   * Render individual item
   */
  renderItem(item) {
    if (this.options.renderCallback) {
      return this.options.renderCallback(item.data, item.index);
    }

    // Default renderer
    const element = document.createElement('div');
    element.className = 'virtual-scroller-item';
    element.style.cssText = `
      min-height: ${this.options.itemHeight}px;
      padding: 8px;
      box-sizing: border-box;
    `;
    element.textContent = JSON.stringify(item.data);
    
    return element;
  }

  /**
   * Scroll to index
   */
  scrollToIndex(index, behavior = 'smooth') {
    const top = index * this.options.itemHeight;
    this.viewport.scrollTo({
      top,
      behavior
    });
  }

  /**
   * Scroll to top
   */
  scrollToTop(behavior = 'smooth') {
    this.scrollToIndex(0, behavior);
  }

  /**
   * Scroll to bottom
   */
  scrollToBottom(behavior = 'smooth') {
    this.scrollToIndex(this.items.length - 1, behavior);
  }

  /**
   * Get item count
   */
  getItemCount() {
    return this.items.length;
  }

  /**
   * Update item height
   */
  setItemHeight(height) {
    this.options.itemHeight = height;
    this.updateTotalHeight();
    this.requestUpdate();
  }

  /**
   * Destroy scroller
   */
  destroy() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.viewport.removeEventListener('scroll', this.handleScroll);
    
    if (this.viewport.parentNode) {
      this.viewport.parentNode.removeChild(this.viewport);
    }

    this.items = [];
    this.visibleItems = [];
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  window.VirtualScroller = VirtualScroller;
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VirtualScroller;
}
