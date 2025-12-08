/**
 * Keyboard Navigation Enhancement
 *
 * Features:
 * - Tab navigation for all dialogs
 * - ESC to close modals/dialogs
 * - Ctrl+S to save
 * - Ctrl+Z/Y for undo/redo
 * - Arrow keys for navigation
 */

class KeyboardNavigationManager {
  constructor() {
    this.handlers = new Map();
    this.init();
  }

  init() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.setupModalHandlers();
    this.setupGlobalShortcuts();
  }

  /**
   * Handle keydown events
   */
  handleKeyDown(e) {
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    // ESC to close modals
    if (key === 'escape') {
      this.closeTopModal();
      return;
    }

    // Ctrl+S to save
    if (ctrl && key === 's') {
      e.preventDefault();
      this.triggerSave();
      return;
    }

    // Ctrl+Z to undo
    if (ctrl && !shift && key === 'z') {
      e.preventDefault();
      this.triggerUndo();
      return;
    }

    // Ctrl+Y or Ctrl+Shift+Z to redo
    if ((ctrl && key === 'y') || (ctrl && shift && key === 'z')) {
      e.preventDefault();
      this.triggerRedo();
      return;
    }

    // Call custom handlers
    const handlerKey = `${ctrl ? 'ctrl+' : ''}${shift ? 'shift+' : ''}${key}`;
    if (this.handlers.has(handlerKey)) {
      e.preventDefault();
      this.handlers.get(handlerKey)(e);
    }
  }

  /**
   * Register custom keyboard handler
   */
  on(key, handler) {
    this.handlers.set(key.toLowerCase(), handler);
  }

  /**
   * Remove keyboard handler
   */
  off(key) {
    this.handlers.delete(key.toLowerCase());
  }

  /**
   * Setup modal ESC handlers
   */
  setupModalHandlers() {
    // Listen for new modals
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.classList && node.classList.contains('modal')) {
            this.setupModalFocusTrap(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Setup focus trap for modal (Tab navigation)
   */
  setupModalFocusTrap(modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    });

    // Focus first element
    firstElement.focus();
  }

  /**
   * Close topmost modal
   */
  closeTopModal() {
    const modals = document.querySelectorAll('.modal:not(.hidden)');
    if (modals.length > 0) {
      const topModal = modals[modals.length - 1];
      const closeBtn = topModal.querySelector('[data-close-modal], .close-modal, .modal-close');
      if (closeBtn) {
        closeBtn.click();
      } else {
        topModal.classList.add('hidden');
      }
    }
  }

  /**
   * Trigger save event
   */
  triggerSave() {
    window.dispatchEvent(new CustomEvent('keyboard:save'));
  }

  /**
   * Trigger undo event
   */
  triggerUndo() {
    window.dispatchEvent(new CustomEvent('keyboard:undo'));
  }

  /**
   * Trigger redo event
   */
  triggerRedo() {
    window.dispatchEvent(new CustomEvent('keyboard:redo'));
  }

  /**
   * Setup global shortcuts
   */
  setupGlobalShortcuts() {
    // Ctrl+/ for help
    this.on('ctrl+/', () => {
      this.showHelp();
    });

    // Ctrl+K for command palette (future feature)
    this.on('ctrl+k', () => {
      console.log('Command palette (future feature)');
    });
  }

  /**
   * Show keyboard shortcuts help
   */
  showHelp() {
    const shortcuts = [
      { keys: 'ESC', description: 'Close modal/dialog' },
      { keys: 'Ctrl+S', description: 'Save' },
      { keys: 'Ctrl+Z', description: 'Undo' },
      { keys: 'Ctrl+Y', description: 'Redo' },
      { keys: 'Ctrl+/', description: 'Show this help' },
      { keys: 'Tab', description: 'Navigate forward' },
      { keys: 'Shift+Tab', description: 'Navigate backward' }
    ];

    const helpText = shortcuts.map(s => `${s.keys}: ${s.description}`).join('\n');
    alert(`Keyboard Shortcuts:\n\n${helpText}`);
  }
}

// Initialize
const keyboardNav = new KeyboardNavigationManager();
