/**
 * Compact Bar Template
 * A compact horizontal progress bar with goal info
 */

module.exports = {
    id: 'compact-bar',
    name: 'Compact Bar',
    description: 'A compact horizontal progress bar with icon and stats',
    defaultWidth: 500,
    defaultHeight: 100,

    render(data, theme) {
        const {
            name,
            currentValue,
            targetValue,
            goalType
        } = data;

        const progress = Math.min(100, (currentValue / targetValue) * 100);
        const remaining = Math.max(0, targetValue - currentValue);

        const icon = this.getIcon(goalType);
        const primaryColor = theme?.primaryColor || '#60a5fa';
        const secondaryColor = theme?.secondaryColor || '#3b82f6';
        const textColor = theme?.textColor || '#ffffff';
        const bgColor = theme?.bgColor || 'rgba(15, 23, 42, 0.95)';

        return `
            <div class="compact-bar-container">
                <div class="compact-bar-wrapper">
                    <div class="compact-bar-header">
                        <div class="compact-bar-title">
                            <span class="compact-bar-icon">${icon}</span>
                            <span class="compact-bar-name">${this.escapeHtml(name)}</span>
                        </div>
                        <div class="compact-bar-stats">
                            <span class="compact-bar-percent">${progress.toFixed(0)}%</span>
                            <span class="compact-bar-values">${this.formatNumber(currentValue)} / ${this.formatNumber(targetValue)}</span>
                        </div>
                    </div>
                    <div class="compact-bar-progress">
                        <div class="compact-bar-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="compact-bar-remaining">
                        ${remaining > 0 ? `${this.formatNumber(remaining)} remaining` : 'Goal Reached! 🎉'}
                    </div>
                </div>
            </div>
        `;
    },

    getStyles(theme) {
        const primaryColor = theme?.primaryColor || '#60a5fa';
        const secondaryColor = theme?.secondaryColor || '#3b82f6';
        const textColor = theme?.textColor || '#ffffff';
        const bgColor = theme?.bgColor || 'rgba(15, 23, 42, 0.95)';

        return `
            .compact-bar-container {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }

            .compact-bar-wrapper {
                background: ${bgColor};
                border-radius: 16px;
                padding: 20px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                border: 2px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                width: 100%;
                position: relative;
                overflow: hidden;
            }

            .compact-bar-wrapper::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor});
            }

            .compact-bar-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }

            .compact-bar-title {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .compact-bar-icon {
                font-size: 1.5rem;
                filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
            }

            .compact-bar-name {
                font-size: 1.2rem;
                font-weight: 700;
                color: ${textColor};
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            }

            .compact-bar-stats {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .compact-bar-percent {
                font-size: 1.3rem;
                font-weight: 700;
                color: ${primaryColor};
                text-shadow: 0 0 10px ${primaryColor}80;
            }

            .compact-bar-values {
                font-size: 0.9rem;
                color: #cbd5e1;
            }

            .compact-bar-progress {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                height: 20px;
                overflow: hidden;
                position: relative;
            }

            .compact-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor});
                border-radius: 10px;
                transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 0 20px ${primaryColor}80;
            }

            .compact-bar-remaining {
                text-align: center;
                font-size: 0.85rem;
                color: #94a3b8;
                margin-top: 8px;
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
