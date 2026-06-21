/**
 * Overlay Editor Module
 * Grid-based positioning system for CoinBattle overlay elements
 */

class OverlayEditor {
  constructor(api) {
    this.api = api;
    this.currentLayout = null;
    this.layouts = new Map();
    
    // Grid configuration
    this.grid = {
      columns: 20, // A-T
      rows: 20, // 1-20
      cellWidth: 0,
      cellHeight: 0
    };
    
    // Element sizes (predefined)
    this.elementSizes = {
      leaderboard_solo: {
        small: { width: 400, height: 500 },
        medium: { width: 600, height: 700 },
        large: { width: 800, height: 900 },
        xlarge: { width: 1000, height: 1100 }
      },
      team_red: {
        small: { width: 350, height: 400 },
        medium: { width: 500, height: 600 },
        large: { width: 700, height: 800 },
        xlarge: { width: 900, height: 1000 }
      },
      team_blue: {
        small: { width: 350, height: 400 },
        medium: { width: 500, height: 600 },
        large: { width: 700, height: 800 },
        xlarge: { width: 900, height: 1000 }
      },
      timer: {
        small: { width: 150, height: 150 },
        medium: { width: 200, height: 200 },
        large: { width: 250, height: 250 },
        xlarge: { width: 300, height: 300 }
      },
      match_info: {
        small: { width: 300, height: 80 },
        medium: { width: 400, height: 100 },
        large: { width: 500, height: 120 },
        xlarge: { width: 600, height: 150 }
      },
      koth_king: {
        small: { width: 200, height: 100 },
        medium: { width: 300, height: 150 },
        large: { width: 400, height: 200 },
        xlarge: { width: 500, height: 250 }
      },
      challenge_notification: {
        small: { width: 400, height: 150 },
        medium: { width: 600, height: 200 },
        large: { width: 800, height: 250 },
        xlarge: { width: 1000, height: 300 }
      }
    };
    
    // Default layouts
    this.defaultLayouts = {
      'default_1920x1080': {
        name: 'Standard 1920x1080',
        width: 1920,
        height: 1080,
        elements: {
          leaderboard_solo: { column: 'C', row: 3, size: 'medium', visible: true },
          team_red: { column: 'B', row: 3, size: 'medium', visible: true },
          team_blue: { column: 'O', row: 3, size: 'medium', visible: true },
          timer: { column: 'J', row: 1, size: 'medium', visible: true },
          match_info: { column: 'J', row: 18, size: 'small', visible: true },
          koth_king: { column: 'A', row: 1, size: 'small', visible: true },
          challenge_notification: { column: 'J', row: 10, size: 'medium', visible: true }
        }
      },
      'default_1280x720': {
        name: 'Standard 1280x720',
        width: 1280,
        height: 720,
        elements: {
          leaderboard_solo: { column: 'C', row: 3, size: 'small', visible: true },
          team_red: { column: 'B', row: 3, size: 'small', visible: true },
          team_blue: { column: 'N', row: 3, size: 'small', visible: true },
          timer: { column: 'I', row: 1, size: 'small', visible: true },
          match_info: { column: 'I', row: 17, size: 'small', visible: true },
          koth_king: { column: 'A', row: 1, size: 'small', visible: true },
          challenge_notification: { column: 'I', row: 9, size: 'small', visible: true }
        }
      },
      'default_2560x1440': {
        name: 'Standard 2560x1440',
        width: 2560,
        height: 1440,
        elements: {
          leaderboard_solo: { column: 'C', row: 3, size: 'large', visible: true },
          team_red: { column: 'B', row: 3, size: 'large', visible: true },
          team_blue: { column: 'P', row: 3, size: 'large', visible: true },
          timer: { column: 'J', row: 1, size: 'large', visible: true },
          match_info: { column: 'J', row: 18, size: 'medium', visible: true },
          koth_king: { column: 'A', row: 1, size: 'medium', visible: true },
          challenge_notification: { column: 'J', row: 10, size: 'large', visible: true }
        }
      }
    };
  }

  /**
   * Initialize overlay editor
   */
  async init() {
    await this.loadLayouts();
    this.setupEventListeners();
    this.loadLayout('default_1920x1080');
    this.updatePreview();
  }

  /**
   * Load saved layouts from database
   */
  async loadLayouts() {
    try {
      const response = await fetch('/api/plugins/coinbattle/overlay/layouts');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          data.data.forEach(layout => {
            this.layouts.set(layout.id, layout);
          });
        }
      }
    } catch (error) {
      console.error('Failed to load overlay layouts:', error);
    }
    
    // Add default layouts
    Object.entries(this.defaultLayouts).forEach(([id, layout]) => {
      if (!this.layouts.has(id)) {
        this.layouts.set(id, { id, ...layout });
      }
    });
    
    this.updateLayoutSelect();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Layout management
    document.getElementById('overlayLayoutSelect')?.addEventListener('change', (e) => {
      this.loadLayout(e.target.value);
    });
    
    document.getElementById('newOverlayLayoutBtn')?.addEventListener('click', () => {
      this.createNewLayout();
    });
    
    document.getElementById('duplicateLayoutBtn')?.addEventListener('click', () => {
      this.duplicateLayout();
    });
    
    document.getElementById('deleteLayoutBtn')?.addEventListener('click', () => {
      this.deleteLayout();
    });
    
    document.getElementById('saveOverlayLayoutBtn')?.addEventListener('click', () => {
      this.saveLayout();
    });
    
    document.getElementById('exportLayoutBtn')?.addEventListener('click', () => {
      this.exportLayout();
    });
    
    document.getElementById('importLayoutBtn')?.addEventListener('click', () => {
      this.importLayout();
    });
    
    document.getElementById('resetLayoutBtn')?.addEventListener('click', () => {
      this.resetLayout();
    });
    
    // Resolution change
    document.getElementById('overlayResolution')?.addEventListener('change', (e) => {
      const customGroups = document.querySelectorAll('#customWidthGroup, #customHeightGroup');
      customGroups.forEach(group => {
        group.style.display = e.target.value === 'custom' ? 'block' : 'none';
      });
      
      if (e.target.value !== 'custom') {
        const [width, height] = e.target.value.split('x');
        document.getElementById('overlayWidth').value = width;
        document.getElementById('overlayHeight').value = height;
      }
      
      this.updatePreview();
    });
    
    // Element positioning changes
    document.querySelectorAll('.grid-column, .grid-row, .grid-size, .grid-visible').forEach(input => {
      input.addEventListener('change', () => {
        this.updatePreview();
      });
    });
  }

  /**
   * Update layout select dropdown
   */
  updateLayoutSelect() {
    const select = document.getElementById('overlayLayoutSelect');
    if (!select) return;
    
    select.innerHTML = '';
    this.layouts.forEach((layout, id) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = layout.name || id;
      select.appendChild(option);
    });
  }

  /**
   * Load a layout
   */
  loadLayout(layoutId) {
    const layout = this.layouts.get(layoutId);
    if (!layout) return;
    
    this.currentLayout = layout;
    
    // Update form fields
    document.getElementById('overlayLayoutName').value = layout.name || '';
    document.getElementById('overlayWidth').value = layout.width || 1920;
    document.getElementById('overlayHeight').value = layout.height || 1080;
    
    // Set resolution select
    const resolutionSelect = document.getElementById('overlayResolution');
    const resolution = `${layout.width}x${layout.height}`;
    if (resolutionSelect) {
      const matchingOption = Array.from(resolutionSelect.options).find(opt => opt.value === resolution);
      resolutionSelect.value = matchingOption ? resolution : 'custom';
      
      // Show/hide custom fields
      const customGroups = document.querySelectorAll('#customWidthGroup, #customHeightGroup');
      customGroups.forEach(group => {
        group.style.display = !matchingOption ? 'block' : 'none';
      });
    }
    
    // Update element positions
    Object.entries(layout.elements || {}).forEach(([elementId, config]) => {
      const columnSelect = document.querySelector(`.grid-column[data-element="${elementId}"]`);
      const rowInput = document.querySelector(`.grid-row[data-element="${elementId}"]`);
      const sizeSelect = document.querySelector(`.grid-size[data-element="${elementId}"]`);
      const visibleCheckbox = document.querySelector(`.grid-visible[data-element="${elementId}"]`);
      
      if (columnSelect) columnSelect.value = config.column || 'C';
      if (rowInput) rowInput.value = config.row || 1;
      if (sizeSelect) sizeSelect.value = config.size || 'medium';
      if (visibleCheckbox) visibleCheckbox.checked = config.visible !== false;
    });
    
    this.updatePreview();
  }

  /**
   * Create new layout
   */
  createNewLayout() {
    const name = prompt('Layout Name:');
    if (!name) return;
    
    const id = `custom_${Date.now()}`;
    const newLayout = {
      id,
      name,
      width: 1920,
      height: 1080,
      elements: JSON.parse(JSON.stringify(this.defaultLayouts.default_1920x1080.elements))
    };
    
    this.layouts.set(id, newLayout);
    this.updateLayoutSelect();
    
    const select = document.getElementById('overlayLayoutSelect');
    if (select) select.value = id;
    
    this.loadLayout(id);
  }

  /**
   * Duplicate current layout
   */
  duplicateLayout() {
    if (!this.currentLayout) return;
    
    const name = prompt('Name für dupliziertes Layout:', `${this.currentLayout.name} (Kopie)`);
    if (!name) return;
    
    const id = `custom_${Date.now()}`;
    const duplicatedLayout = {
      ...JSON.parse(JSON.stringify(this.currentLayout)),
      id,
      name
    };
    
    this.layouts.set(id, duplicatedLayout);
    this.updateLayoutSelect();
    
    const select = document.getElementById('overlayLayoutSelect');
    if (select) select.value = id;
    
    this.loadLayout(id);
  }

  /**
   * Delete current layout
   */
  async deleteLayout() {
    if (!this.currentLayout) return;
    if (this.currentLayout.id.startsWith('default_')) {
      alert('Standard-Layouts können nicht gelöscht werden.');
      return;
    }
    
    if (!confirm(`Layout "${this.currentLayout.name}" wirklich löschen?`)) return;
    
    try {
      const response = await fetch(`/api/plugins/coinbattle/overlay/layouts/${this.currentLayout.id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        this.layouts.delete(this.currentLayout.id);
        this.updateLayoutSelect();
        this.loadLayout('default_1920x1080');
        this.showMessage('Layout gelöscht', 'success');
      }
    } catch (error) {
      console.error('Failed to delete layout:', error);
      this.showMessage('Fehler beim Löschen', 'error');
    }
  }

  /**
   * Save current layout
   */
  async saveLayout() {
    if (!this.currentLayout) return;
    
    const layout = {
      ...this.currentLayout,
      name: document.getElementById('overlayLayoutName').value,
      width: parseInt(document.getElementById('overlayWidth').value),
      height: parseInt(document.getElementById('overlayHeight').value),
      elements: {}
    };
    
    // Collect element positions
    document.querySelectorAll('.grid-column').forEach(select => {
      const elementId = select.dataset.element;
      layout.elements[elementId] = {
        column: select.value,
        row: parseInt(document.querySelector(`.grid-row[data-element="${elementId}"]`).value),
        size: document.querySelector(`.grid-size[data-element="${elementId}"]`).value,
        visible: document.querySelector(`.grid-visible[data-element="${elementId}"]`).checked
      };
    });
    
    try {
      const response = await fetch('/api/plugins/coinbattle/overlay/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layout)
      });
      
      if (response.ok) {
        this.layouts.set(layout.id, layout);
        this.currentLayout = layout;
        this.updateLayoutSelect();
        this.showMessage('Layout gespeichert', 'success');
      }
    } catch (error) {
      console.error('Failed to save layout:', error);
      this.showMessage('Fehler beim Speichern', 'error');
    }
  }

  /**
   * Export layout to JSON
   */
  exportLayout() {
    if (!this.currentLayout) return;
    
    const json = JSON.stringify(this.currentLayout, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `coinbattle-layout-${this.currentLayout.id}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    this.showMessage('Layout exportiert', 'success');
  }

  /**
   * Import layout from JSON
   */
  importLayout() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const layout = JSON.parse(text);
        
        layout.id = `custom_${Date.now()}`;
        
        this.layouts.set(layout.id, layout);
        this.updateLayoutSelect();
        
        const select = document.getElementById('overlayLayoutSelect');
        if (select) select.value = layout.id;
        
        this.loadLayout(layout.id);
        this.showMessage('Layout importiert', 'success');
      } catch (error) {
        console.error('Failed to import layout:', error);
        this.showMessage('Fehler beim Importieren', 'error');
      }
    };
    
    input.click();
  }

  /**
   * Reset to default layout
   */
  resetLayout() {
    if (!confirm('Layout auf Standard zurücksetzen?')) return;
    
    const width = parseInt(document.getElementById('overlayWidth').value);
    const height = parseInt(document.getElementById('overlayHeight').value);
    const resolution = `${width}x${height}`;
    
    const defaultId = `default_${resolution}`;
    if (this.defaultLayouts[defaultId]) {
      this.loadLayout(defaultId);
    } else {
      this.loadLayout('default_1920x1080');
    }
    
    this.showMessage('Layout zurückgesetzt', 'success');
  }

  /**
   * Update visual preview
   */
  updatePreview() {
    const preview = document.getElementById('coinbattleGridPreview');
    const elements = document.getElementById('coinbattleGridElements');
    if (!preview || !elements) return;
    
    const width = parseInt(document.getElementById('overlayWidth')?.value || 1920);
    const height = parseInt(document.getElementById('overlayHeight')?.value || 1080);
    
    // Calculate cell size
    this.grid.cellWidth = width / this.grid.columns;
    this.grid.cellHeight = height / this.grid.rows;
    
    // Update preview aspect ratio
    const aspectRatio = height / width;
    preview.style.height = `${600 * aspectRatio}px`;
    
    // Clear elements
    elements.innerHTML = '';
    
    // Position each element
    document.querySelectorAll('.grid-column').forEach(select => {
      const elementId = select.dataset.element;
      const column = select.value;
      const row = parseInt(document.querySelector(`.grid-row[data-element="${elementId}"]`).value);
      const size = document.querySelector(`.grid-size[data-element="${elementId}"]`).value;
      const visible = document.querySelector(`.grid-visible[data-element="${elementId}"]`).checked;
      
      if (!visible) return;
      
      // Convert column letter to index
      const columnIndex = column.charCodeAt(0) - 65; // A=0, B=1, etc.
      
      // Calculate position
      const x = (columnIndex * this.grid.cellWidth / width) * 100;
      const y = ((row - 1) * this.grid.cellHeight / height) * 100;
      
      // Get element size
      const elementSize = this.elementSizes[elementId]?.[size] || { width: 100, height: 100 };
      const widthPercent = (elementSize.width / width) * 100;
      const heightPercent = (elementSize.height / height) * 100;
      
      // Create preview element
      const previewElement = document.createElement('div');
      previewElement.style.position = 'absolute';
      previewElement.style.left = `${x}%`;
      previewElement.style.top = `${y}%`;
      previewElement.style.width = `${widthPercent}%`;
      previewElement.style.height = `${heightPercent}%`;
      previewElement.style.border = '2px solid #3b82f6';
      previewElement.style.borderRadius = '4px';
      previewElement.style.background = 'rgba(59, 130, 246, 0.1)';
      previewElement.style.display = 'flex';
      previewElement.style.alignItems = 'center';
      previewElement.style.justifyContent = 'center';
      previewElement.style.color = '#3b82f6';
      previewElement.style.fontSize = '12px';
      previewElement.style.fontWeight = 'bold';
      previewElement.style.textAlign = 'center';
      previewElement.style.padding = '5px';
      previewElement.textContent = elementId.replace(/_/g, ' ').toUpperCase();
      
      elements.appendChild(previewElement);
    });
  }

  /**
   * Show message
   */
  showMessage(message, type = 'info') {
    const messageEl = document.getElementById('overlayLayoutMessage');
    if (!messageEl) return;
    
    messageEl.textContent = message;
    messageEl.className = `message ${type}`;
    messageEl.classList.remove('hidden');
    
    setTimeout(() => {
      messageEl.classList.add('hidden');
    }, 3000);
  }

  /**
   * Get current layout configuration
   */
  getCurrentLayoutConfig() {
    if (!this.currentLayout) return null;
    
    const config = {
      ...this.currentLayout,
      elements: {}
    };
    
    document.querySelectorAll('.grid-column').forEach(select => {
      const elementId = select.dataset.element;
      config.elements[elementId] = {
        column: select.value,
        row: parseInt(document.querySelector(`.grid-row[data-element="${elementId}"]`).value),
        size: document.querySelector(`.grid-size[data-element="${elementId}"]`).value,
        visible: document.querySelector(`.grid-visible[data-element="${elementId}"]`).checked
      };
    });
    
    return config;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OverlayEditor;
}
