/**
 * Full Width Progress Bar Template
 * A wide progress bar that spans the full width
 */

module.exports = {
    id: 'full-width',
    name: 'Full Width Progress Bar',
    description: 'A wide progress bar spanning the full width with bold stats',
    defaultWidth: 1920,
    defaultHeight: 80,

    render(data, theme) {
        const {
            name,
            currentValue,
            targetValue,
            goalType
        } = data;

        const progress = Math.min(100, (currentValue / targetValue) * 100);
        const icon = this.getIcon(goalType);
        const primaryColor = theme?.primaryColor || '#60a5fa';
        const secondaryColor = theme?.secondaryColor || '#3b82f6';
        const textColor = theme?.textColor || '#ffffff';

        return `
            <div class="full-width-container">
                <div class="full-width-progress-bg">
                    <div class="full-width-progress-fill" style="width: ${progress}%"></div>
                </div>
                <div class="full-width-content">
                    <div class="full-width-left">
                        <span class="full-width-icon">${icon}</span>
                        <span class="full-width-name">${this.escapeHtml(name)}</span>
                    </div>
                    <div class="full-width-right">
                        <span class="full-width-current">${this.formatNumber(currentValue)}</span>
                        <span class="full-width-separator">/</span>
                        <span class="full-width-target">${this.formatNumber(targetValue)}</span>
                        <span class="full-width-percent">${progress.toFixed(0)}%</span>
                    </div>
                </div>
            </div>
        `;
    },

    getStyles(theme) {
        const primaryColor = theme?.primaryColor || '#60a5fa';
        const secondaryColor = theme?.secondaryColor || '#3b82f6';
        const textColor = theme?.textColor || '#ffffff';
        const bgColor = theme?.bgColor || 'rgba(15, 23, 42, 0.9)';

        return `
            .full-width-container {
                width: 100%;
                height: 100%;
                position: relative;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                overflow: hidden;
            }

            .full-width-progress-bg {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: ${bgColor};
                overflow: hidden;
            }

            .full-width-progress-fill {
                position: absolute;
                top: 0;
                left: 0;
                bottom: 0;
                background: linear-gradient(90deg, ${primaryColor}40, ${secondaryColor}40);
                transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                border-right: 3px solid ${primaryColor};
                box-shadow: 0 0 30px ${primaryColor}60;
            }

            .full-width-content {
                position: relative;
                height: 100%;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0 40px;
                z-index: 1;
            }

            .full-width-left {
                display: flex;
                align-items: center;
                gap: 15px;
            }

            .full-width-icon {
                font-size: 2rem;
                filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
            }

            .full-width-name {
                font-size: 1.5rem;
                font-weight: 700;
                color: ${textColor};
                text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8);
            }

            .full-width-right {
                display: flex;
                align-items: baseline;
                gap: 10px;
                font-weight: 700;
            }

            .full-width-current {
                font-size: 1.8rem;
                color: ${primaryColor};
                text-shadow: 0 0 15px ${primaryColor}80;
            }

            .full-width-separator {
                font-size: 1.2rem;
                color: #64748b;
            }

            .full-width-target {
                font-size: 1.2rem;
                color: #94a3b8;
            }

            .full-width-percent {
                font-size: 1.5rem;
                color: ${textColor};
                margin-left: 15px;
                text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8);
            }
        `;
    },

    getIcon(goalType) {
        const icons = {
            'coin': '🪙',
            'likes': '❤️',
            'follower': '👥',
            'custom': '⭐'
        };
        return icons[goalType] || '🎯';
    },

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    },

    escapeHtml(text) {
        const div = { textContent: text };
        return div.textContent;
    }
};
