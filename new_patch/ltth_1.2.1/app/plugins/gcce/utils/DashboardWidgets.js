/**
 * Dashboard Widget System
 * Provides real-time monitoring widgets for the GCCE admin UI
 */

class DashboardWidgets {
  constructor(api) {
    this.api = api;
    this.widgets = new Map();
    this.updateInterval = null;
  }

  /**
   * Register a widget
   * @param {Object} widgetDef - Widget definition
   */
  registerWidget(widgetDef) {
    const widget = {
      id: widgetDef.id,
      name: widgetDef.name,
      type: widgetDef.type, // 'stat', 'chart', 'list', 'table'
      dataSource: widgetDef.dataSource, // Function or API endpoint
      refreshInterval: widgetDef.refreshInterval || 5000,
      config: widgetDef.config || {},
      lastUpdate: null,
      data: null
    };

    this.widgets.set(widget.id, widget);
    return widget.id;
  }

  /**
   * Update widget data
   * @param {string} widgetId - Widget ID
   */
  async updateWidget(widgetId) {
    const widget = this.widgets.get(widgetId);
    if (!widget) return;

    try {
      let data;
      if (typeof widget.dataSource === 'function') {
        data = await widget.dataSource();
      } else if (typeof widget.dataSource === 'string') {
        const response = await fetch(widget.dataSource);
        data = await response.json();
      }

      widget.data = data;
      widget.lastUpdate = Date.now();

      // Emit update event
      this.api.emit('dashboard:widget:update', {
        widgetId: widget.id,
        data: widget.data,
        timestamp: widget.lastUpdate
      });

      return data;
    } catch (error) {
      this.api.log(`[Dashboard] Widget update failed for ${widgetId}: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * Start auto-refresh for all widgets
   */
  startAutoRefresh() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Update all widgets every second, but each widget respects its own interval
    this.updateInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [widgetId, widget] of this.widgets.entries()) {
        const timeSinceUpdate = now - (widget.lastUpdate || 0);
        
        if (timeSinceUpdate >= widget.refreshInterval) {
          this.updateWidget(widgetId);
        }
      }
    }, 1000);
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Get widget data
   * @param {string} widgetId - Widget ID
   * @returns {Object} Widget data
   */
  getWidgetData(widgetId) {
    const widget = this.widgets.get(widgetId);
    return widget ? widget.data : null;
  }

  /**
   * Get all widgets
   * @returns {Array} Array of widgets
   */
  getAllWidgets() {
    return Array.from(this.widgets.values());
  }

  /**
   * Remove widget
   * @param {string} widgetId - Widget ID
   */
  removeWidget(widgetId) {
    return this.widgets.delete(widgetId);
  }
}

module.exports = DashboardWidgets;
