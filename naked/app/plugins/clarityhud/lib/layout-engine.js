/**
 * Layout Engine for ClarityHUD
 *
 * Handles different layout modes for displaying activity events:
 * - Single Stream: Unified chronological feed
 * - Structured: Separate blocks per event type
 * - Adaptive: Intelligent grouping based on activity patterns
 */

class LayoutEngine {
  constructor(settings = {}) {
    this.settings = {
      mode: 'singleStream',
      maxEventsPerType: 50,
      animationSpeed: 'medium',
      enableTransitions: true,
      responsiveColumns: true,
      ...settings
    };
    this.currentMode = null;
    this.eventTypeOrder = ['follow', 'share', 'like', 'gift', 'comment'];
  }

  /**
   * Set layout mode
   */
  setMode(mode) {
    if (!['singleStream', 'structured', 'adaptive'].includes(mode)) {
      console.warn(`Invalid layout mode: ${mode}. Using 'singleStream'.`);
      mode = 'singleStream';
    }
    this.settings.mode = mode;
    this.currentMode = mode;
    return this;
  }

  /**
   * Update settings
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    if (newSettings.mode) {
      this.currentMode = newSettings.mode;
    }
    return this;
  }

  /**
   * Render using current mode
   */
  render(events, container) {
    if (!container) {
      console.error('LayoutEngine.render: container is required');
      return;
    }

    if (!events || events.length === 0) {
      this.renderEmpty(container);
      return;
    }

    const mode = this.currentMode || this.settings.mode;

    switch (mode) {
      case 'singleStream':
        this.renderSingleStream(events, container);
        break;
      case 'structured':
        this.renderStructured(events, container);
        break;
      case 'adaptive':
        this.renderAdaptive(events, container);
        break;
      default:
        this.renderSingleStream(events, container);
    }
  }

  /**
   * Render empty state
   */
  renderEmpty(container) {
    container.innerHTML = `
      <div class="clarity-empty-state" style="
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--clarity-text-secondary, #888);
        font-size: 1.2em;
        padding: 40px;
        text-align: center;
      ">
        <div>
          <div style="font-size: 3em; margin-bottom: 10px; opacity: 0.5;">📊</div>
          <div>No activity yet</div>
          <div style="font-size: 0.8em; margin-top: 10px; opacity: 0.7;">
            Events will appear here as they happen
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render single stream layout - unified chronological feed
   */
  renderSingleStream(events, container) {
    // Sort events by timestamp (newest first)
    const sortedEvents = [...events].sort((a, b) => b.timestamp - a.timestamp);

    const html = `
      <div class="clarity-single-stream" style="
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px;
        overflow-y: auto;
        height: 100%;
      ">
        ${sortedEvents.map(event => this.renderEventCard(event)).join('')}
      </div>
    `;

    this.updateDOM(container, html);
  }

  /**
   * Render structured layout - separate blocks per type
   */
  renderStructured(events, container) {
    // Group events by type
    const grouped = this.groupEventsByType(events);

    // Build sections for each event type
    const sections = this.eventTypeOrder
      .filter(type => grouped[type] && grouped[type].length > 0)
      .map(type => {
        const typeEvents = grouped[type].slice(0, this.settings.maxEventsPerType);
        const color = this.getEventTypeColor(type);
        const icon = this.getEventTypeIcon(type);
        const label = this.getEventTypeLabel(type);

        return `
          <div class="clarity-section clarity-section-${type}" style="
            margin-bottom: 24px;
            border-left: 4px solid ${color};
            padding-left: 12px;
          ">
            <div class="clarity-section-header" style="
              display: flex;
              align-items: center;
              gap: 8px;
              margin-bottom: 12px;
              font-weight: 600;
              font-size: 1.1em;
              color: var(--clarity-text, #000);
            ">
              <span style="font-size: 1.3em;">${icon}</span>
              <span>${label}</span>
              <span style="
                background: ${color};
                color: white;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 0.8em;
                margin-left: auto;
              ">${typeEvents.length}</span>
            </div>
            <div class="clarity-section-events" style="
              display: flex;
              flex-direction: column;
              gap: 6px;
            ">
              ${typeEvents.map(event => this.renderEventCard(event, 'compact')).join('')}
            </div>
          </div>
        `;
      });

    const html = `
      <div class="clarity-structured" style="
        padding: 16px;
        overflow-y: auto;
        height: 100%;
      ">
        ${sections.join('')}
      </div>
    `;

    this.updateDOM(container, html);
  }

  /**
   * Render adaptive layout - intelligent grouping
   */
  renderAdaptive(events, container) {
    // Analyze event patterns
    const analysis = this.analyzeEventPatterns(events);

    // Determine best layout strategy
    if (analysis.totalEvents < 20) {
      // Few events: use single stream
      this.renderSingleStream(events, container);
      return;
    }

    if (analysis.dominantType && analysis.dominantPercentage > 0.6) {
      // One type dominates: use structured with emphasis on dominant type
      this.renderStructuredWithEmphasis(events, container, analysis.dominantType);
      return;
    }

    // Balanced distribution: use column layout
    this.renderColumnLayout(events, container);
  }

  /**
   * Render structured layout with emphasis on a specific type
   */
  renderStructuredWithEmphasis(events, container, emphasizedType) {
    const grouped = this.groupEventsByType(events);

    // Put emphasized type first
    const order = [emphasizedType, ...this.eventTypeOrder.filter(t => t !== emphasizedType)];

    const sections = order
      .filter(type => grouped[type] && grouped[type].length > 0)
      .map((type, index) => {
        const typeEvents = grouped[type].slice(0, this.settings.maxEventsPerType);
        const color = this.getEventTypeColor(type);
        const icon = this.getEventTypeIcon(type);
        const label = this.getEventTypeLabel(type);
        const isEmphasized = type === emphasizedType;

        return `
          <div class="clarity-section clarity-section-${type}" style="
            margin-bottom: ${isEmphasized ? '32px' : '16px'};
            border-left: 4px solid ${color};
            padding-left: 12px;
            ${isEmphasized ? 'background: var(--clarity-surface, #F5F5F5); padding: 16px; border-radius: 8px;' : ''}
          ">
            <div class="clarity-section-header" style="
              display: flex;
              align-items: center;
              gap: 8px;
              margin-bottom: 12px;
              font-weight: ${isEmphasized ? '700' : '600'};
              font-size: ${isEmphasized ? '1.3em' : '1.1em'};
              color: var(--clarity-text, #000);
            ">
              <span style="font-size: 1.3em;">${icon}</span>
              <span>${label}</span>
              <span style="
                background: ${color};
                color: white;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 0.8em;
                margin-left: auto;
              ">${typeEvents.length}</span>
            </div>
            <div class="clarity-section-events" style="
              display: ${isEmphasized ? 'flex' : 'flex'};
              flex-direction: column;
              gap: ${isEmphasized ? '8px' : '6px'};
            ">
              ${typeEvents.map(event => this.renderEventCard(event, isEmphasized ? 'normal' : 'compact')).join('')}
            </div>
          </div>
        `;
      });

    const html = `
      <div class="clarity-adaptive-emphasis" style="
        padding: 16px;
        overflow-y: auto;
        height: 100%;
      ">
        ${sections.join('')}
      </div>
    `;

    this.updateDOM(container, html);
  }

  /**
   * Render column layout for balanced distribution
   */
  renderColumnLayout(events, container) {
    const grouped = this.groupEventsByType(events);
    const activeTypes = this.eventTypeOrder.filter(type => grouped[type] && grouped[type].length > 0);

    // Determine number of columns based on responsive setting and active types
    const numColumns = this.settings.responsiveColumns
      ? Math.min(activeTypes.length, 3)
      : 2;

    const columns = [];
    for (let i = 0; i < numColumns; i++) {
      columns.push([]);
    }

    // Distribute types across columns
    activeTypes.forEach((type, index) => {
      const columnIndex = index % numColumns;
      columns[columnIndex].push(type);
    });

    const columnHTML = columns.map(columnTypes => {
      const sections = columnTypes.map(type => {
        const typeEvents = grouped[type].slice(0, Math.floor(this.settings.maxEventsPerType / 2));
        const color = this.getEventTypeColor(type);
        const icon = this.getEventTypeIcon(type);
        const label = this.getEventTypeLabel(type);

        return `
          <div class="clarity-column-section" style="
            margin-bottom: 16px;
            border-radius: 8px;
            background: var(--clarity-surface, #F5F5F5);
            padding: 12px;
          ">
            <div class="clarity-section-header" style="
              display: flex;
              align-items: center;
              gap: 6px;
              margin-bottom: 10px;
              font-weight: 600;
              font-size: 1em;
              color: var(--clarity-text, #000);
              border-bottom: 2px solid ${color};
              padding-bottom: 6px;
            ">
              <span>${icon}</span>
              <span>${label}</span>
              <span style="
                background: ${color};
                color: white;
                padding: 1px 6px;
                border-radius: 10px;
                font-size: 0.75em;
                margin-left: auto;
              ">${typeEvents.length}</span>
            </div>
            <div class="clarity-section-events" style="
              display: flex;
              flex-direction: column;
              gap: 4px;
            ">
              ${typeEvents.map(event => this.renderEventCard(event, 'mini')).join('')}
            </div>
          </div>
        `;
      });

      return `
        <div class="clarity-column" style="
          flex: 1;
          min-width: 0;
        ">
          ${sections.join('')}
        </div>
      `;
    }).join('');

    const html = `
      <div class="clarity-columns" style="
        display: flex;
        gap: 16px;
        padding: 16px;
        overflow-y: auto;
        height: 100%;
      ">
        ${columnHTML}
      </div>
    `;

    this.updateDOM(container, html);
  }

  /**
   * Render individual event card
   */
  renderEventCard(event, size = 'normal') {
    const color = this.getEventTypeColor(event.type);
    const icon = this.getEventTypeIcon(event.type);
    const timeAgo = this.formatTimeAgo(event.timestamp);

    if (size === 'mini') {
      return `
        <div class="clarity-event-card clarity-event-mini" style="
          padding: 6px;
          background: var(--clarity-bg, #FFF);
          border-radius: 4px;
          font-size: 0.85em;
          display: flex;
          align-items: center;
          gap: 6px;
          border-left: 3px solid ${color};
        ">
          <span style="font-size: 1.2em;">${icon}</span>
          <span style="flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${event.nickname || 'Anonymous'}
          </span>
          <span style="font-size: 0.8em; color: var(--clarity-text-secondary, #888); white-space: nowrap;">
            ${timeAgo}
          </span>
        </div>
      `;
    }

    if (size === 'compact') {
      return `
        <div class="clarity-event-card clarity-event-compact" style="
          padding: 8px 12px;
          background: var(--clarity-bg, #FFF);
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 10px;
          border-left: 3px solid ${color};
          transition: transform 0.2s, box-shadow 0.2s;
        ">
          <span style="font-size: 1.5em;">${icon}</span>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${event.nickname || 'Anonymous'}
            </div>
            ${event.message ? `
              <div style="font-size: 0.85em; color: var(--clarity-text-secondary, #666); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${event.message}
              </div>
            ` : ''}
          </div>
          <span style="font-size: 0.85em; color: var(--clarity-text-secondary, #888); white-space: nowrap;">
            ${timeAgo}
          </span>
        </div>
      `;
    }

    // Normal size
    return `
      <div class="clarity-event-card clarity-event-normal" style="
        padding: 12px;
        background: var(--clarity-surface, #F5F5F5);
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 12px;
        border-left: 4px solid ${color};
        transition: transform 0.2s, box-shadow 0.2s;
      ">
        <span style="font-size: 2em;">${icon}</span>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 1.1em; margin-bottom: 2px;">
            ${event.nickname || 'Anonymous'}
          </div>
          ${event.message ? `
            <div style="font-size: 0.9em; color: var(--clarity-text-secondary, #666); margin-bottom: 4px;">
              ${event.message}
            </div>
          ` : ''}
          <div style="font-size: 0.8em; color: var(--clarity-text-secondary, #888);">
            ${timeAgo}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Group events by type
   */
  groupEventsByType(events) {
    const grouped = {};
    events.forEach(event => {
      const type = event.type || 'other';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(event);
    });

    // Sort each group by timestamp
    Object.keys(grouped).forEach(type => {
      grouped[type].sort((a, b) => b.timestamp - a.timestamp);
    });

    return grouped;
  }

  /**
   * Analyze event patterns for adaptive layout
   */
  analyzeEventPatterns(events) {
    const grouped = this.groupEventsByType(events);
    const totalEvents = events.length;

    let dominantType = null;
    let dominantCount = 0;
    let dominantPercentage = 0;

    Object.keys(grouped).forEach(type => {
      const count = grouped[type].length;
      if (count > dominantCount) {
        dominantCount = count;
        dominantType = type;
      }
    });

    if (dominantType) {
      dominantPercentage = dominantCount / totalEvents;
    }

    return {
      totalEvents,
      eventTypes: Object.keys(grouped).length,
      dominantType,
      dominantCount,
      dominantPercentage,
      grouped
    };
  }

  /**
   * Update DOM efficiently
   */
  updateDOM(container, html) {
    if (this.settings.enableTransitions) {
      // Fade out
      container.style.opacity = '0';

      setTimeout(() => {
        container.innerHTML = html;
        // Fade in
        requestAnimationFrame(() => {
          container.style.transition = 'opacity 0.3s';
          container.style.opacity = '1';
        });
      }, 150);
    } else {
      container.innerHTML = html;
    }
  }

  /**
   * Get color for event type
   */
  getEventTypeColor(type) {
    const colors = {
      follow: '#FF6B9D',
      share: '#4A90E2',
      like: '#E74C3C',
      gift: '#9B59B6',
      comment: '#2ECC71'
    };
    return colors[type] || '#95A5A6';
  }

  /**
   * Get icon for event type
   */
  getEventTypeIcon(type) {
    const icons = {
      follow: '👤',
      share: '🔄',
      like: '❤️',
      gift: '🎁',
      comment: '💬'
    };
    return icons[type] || '📌';
  }

  /**
   * Get label for event type
   */
  getEventTypeLabel(type) {
    const labels = {
      follow: 'Follows',
      share: 'Shares',
      like: 'Likes',
      gift: 'Gifts',
      comment: 'Comments'
    };
    return labels[type] || 'Events';
  }

  /**
   * Format timestamp as time ago
   */
  formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  window.LayoutEngine = LayoutEngine;
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LayoutEngine;
}
