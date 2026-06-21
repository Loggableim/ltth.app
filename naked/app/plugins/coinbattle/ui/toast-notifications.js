/**
 * Toast Notification System
 * User-friendly notifications for events
 */

class ToastNotificationSystem {
  constructor(container = null) {
    this.container = container || this.createContainer();
    this.toasts = new Map();
    this.toastId = 0;
    
    // Configuration
    this.config = {
      defaultDuration: 3000,
      maxToasts: 5,
      position: 'top-right', // top-right, top-left, bottom-right, bottom-left
      stackDirection: 'down' // down or up
    };
    
    console.log('🍞 Toast Notification System initialized');
  }

  /**
   * Create toast container
   */
  createContainer() {
    if (typeof document === 'undefined') return null;
    
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    
    this.updateContainerPosition();
    
    document.body.appendChild(container);
    return container;
  }

  /**
   * Update container position based on config
   */
  updateContainerPosition() {
    if (!this.container) return;
    
    const positions = {
      'top-right': 'top: 20px; right: 20px;',
      'top-left': 'top: 20px; left: 20px;',
      'bottom-right': 'bottom: 20px; right: 20px;',
      'bottom-left': 'bottom: 20px; left: 20px;'
    };
    
    this.container.style.cssText = `
      position: fixed;
      ${positions[this.config.position] || positions['top-right']}
      z-index: 999999;
      display: flex;
      flex-direction: ${this.config.stackDirection === 'up' ? 'column-reverse' : 'column'};
      gap: 12px;
      min-width: 300px;
      max-width: 400px;
      pointer-events: none;
    `;
  }

  /**
   * Show a toast notification
   */
  show(message, type = 'info', options = {}) {
    const toast = this.createToast(message, type, options);
    const duration = options.duration || this.config.defaultDuration;
    
    // Limit max toasts
    if (this.toasts.size >= this.config.maxToasts) {
      const oldestId = this.toasts.keys().next().value;
      this.remove(oldestId);
    }
    
    // Add to container
    if (this.container) {
      this.container.appendChild(toast.element);
    }
    
    // Store toast
    this.toasts.set(toast.id, toast);
    
    // Auto-remove after duration
    if (duration > 0) {
      toast.timeout = setTimeout(() => {
        this.remove(toast.id);
      }, duration);
    }
    
    return toast.id;
  }

  /**
   * Create toast element
   */
  createToast(message, type, options) {
    const id = ++this.toastId;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.dataset.toastId = id;
    toast.setAttribute('role', 'alert');
    
    // Icon based on type
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      custom: options.icon || '📢'
    };
    
    const icon = icons[type] || icons.info;
    
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${icon}</span>
        <div class="toast-message">${this.escapeHTML(message)}</div>
        ${options.action ? `<button class="toast-action">${this.escapeHTML(options.action.text)}</button>` : ''}
      </div>
      <button class="toast-close" aria-label="Close">×</button>
    `;
    
    // Styling
    toast.style.cssText = `
      background: var(--toast-bg-${type}, rgba(0,0,0,0.9));
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border-left: 4px solid var(--toast-border-${type}, #3b82f6);
      display: flex;
      align-items: center;
      justify-content: space-between;
      animation: toast-slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: auto;
    `;
    
    // Event listeners
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.remove(id));
    
    if (options.action) {
      const actionBtn = toast.querySelector('.toast-action');
      actionBtn.addEventListener('click', () => {
        options.action.callback();
        this.remove(id);
      });
    }
    
    return {
      id,
      element: toast,
      timeout: null
    };
  }

  /**
   * Remove toast
   */
  remove(toastId) {
    const toast = this.toasts.get(toastId);
    if (!toast) return;
    
    // Clear timeout
    if (toast.timeout) {
      clearTimeout(toast.timeout);
    }
    
    // Animate out
    toast.element.style.animation = 'toast-slide-out 0.3s cubic-bezier(0.4, 0, 1, 1)';
    
    setTimeout(() => {
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
      this.toasts.delete(toastId);
    }, 300);
  }

  /**
   * Remove all toasts
   */
  removeAll() {
    for (const toastId of this.toasts.keys()) {
      this.remove(toastId);
    }
  }

  /**
   * Convenience methods
   */
  success(message, options = {}) {
    return this.show(message, 'success', options);
  }

  error(message, options = {}) {
    return this.show(message, 'error', options);
  }

  warning(message, options = {}) {
    return this.show(message, 'warning', options);
  }

  info(message, options = {}) {
    return this.show(message, 'info', options);
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Set position
   */
  setPosition(position) {
    this.config.position = position;
    this.updateContainerPosition();
  }

  /**
   * Destroy the system
   */
  destroy() {
    this.removeAll();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ToastNotificationSystem;
}

// Also make available globally in browser
if (typeof window !== 'undefined') {
  window.ToastNotificationSystem = ToastNotificationSystem;
}

// Add CSS for toast animations
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes toast-slide-in {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes toast-slide-out {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
    
    .toast-content {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }
    
    .toast-icon {
      font-size: 20px;
      flex-shrink: 0;
    }
    
    .toast-message {
      flex: 1;
      font-size: 14px;
      line-height: 1.4;
    }
    
    .toast-close {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 0 5px;
      opacity: 0.7;
      transition: opacity 0.2s;
    }
    
    .toast-close:hover {
      opacity: 1;
    }
    
    .toast-action {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: background 0.2s;
    }
    
    .toast-action:hover {
      background: rgba(255,255,255,0.3);
    }
    
    :root {
      --toast-bg-success: #10b981;
      --toast-bg-error: #ef4444;
      --toast-bg-warning: #f59e0b;
      --toast-bg-info: #3b82f6;
      --toast-border-success: #059669;
      --toast-border-error: #dc2626;
      --toast-border-warning: #d97706;
      --toast-border-info: #2563eb;
    }
  `;
  document.head.appendChild(style);
}
