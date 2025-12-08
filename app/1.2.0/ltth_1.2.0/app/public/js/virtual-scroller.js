/**
 * Virtual Scrolling for Event Log
 * Only renders visible items for better performance with 1000+ events
 */

class VirtualScroller {
  constructor(container, items, itemHeight, renderFn) {
    this.container = container;
    this.items = items;
    this.itemHeight = itemHeight;
    this.renderFn = renderFn;
    this.scrollTop = 0;
    this.visibleStart = 0;
    this.visibleEnd = 0;
    
    // Performance: requestAnimationFrame throttling
    this._ticking = false;
    this._pendingScrollTop = 0;

    this.init();
  }

  init() {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'auto';

    // Create viewport
    this.viewport = document.createElement('div');
    this.viewport.style.position = 'relative';
    this.viewport.style.height = `${this.items.length * this.itemHeight}px`;
    this.container.appendChild(this.viewport);

    // Create content container
    this.content = document.createElement('div');
    this.content.style.position = 'absolute';
    this.content.style.top = '0';
    this.content.style.left = '0';
    this.content.style.right = '0';
    // Performance: Use GPU layer for smooth scrolling
    this.content.style.willChange = 'transform';
    this.content.style.contain = 'layout style paint';
    this.viewport.appendChild(this.content);

    // Listen to scroll with requestAnimationFrame optimization
    this.container.addEventListener('scroll', () => this.onScroll(), { passive: true });

    // Initial render
    this.render();
  }

  onScroll() {
    this._pendingScrollTop = this.container.scrollTop;
    
    // Performance: Use requestAnimationFrame to batch scroll updates
    if (!this._ticking) {
      requestAnimationFrame(() => {
        this.scrollTop = this._pendingScrollTop;
        this.render();
        this._ticking = false;
      });
      this._ticking = true;
    }
  }

  render() {
    const containerHeight = this.container.clientHeight;
    this.visibleStart = Math.floor(this.scrollTop / this.itemHeight);
    this.visibleEnd = Math.ceil((this.scrollTop + containerHeight) / this.itemHeight);

    // Add buffer
    const bufferSize = 5;
    const start = Math.max(0, this.visibleStart - bufferSize);
    const end = Math.min(this.items.length, this.visibleEnd + bufferSize);

    // Clear content
    this.content.innerHTML = '';
    this.content.style.transform = `translateY(${start * this.itemHeight}px)`;

    // Render visible items
    for (let i = start; i < end; i++) {
      const item = this.items[i];
      const el = this.renderFn(item, i);
      el.style.height = `${this.itemHeight}px`;
      this.content.appendChild(el);
    }
  }

  updateItems(items) {
    this.items = items;
    this.viewport.style.height = `${this.items.length * this.itemHeight}px`;
    this.render();
  }

  scrollToBottom() {
    this.container.scrollTop = this.items.length * this.itemHeight;
  }

  scrollToTop() {
    this.container.scrollTop = 0;
  }
}
