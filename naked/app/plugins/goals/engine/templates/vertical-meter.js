/**
 * Vertical Meter Template
 * A vertical progress meter that fills from bottom to top
 */

module.exports = {
    id: 'vertical-meter',
    name: 'Vertical Meter',
    description: 'A vertical progress meter filling from bottom to top',
    defaultWidth: 120,
    defaultHeight: 500,

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

        return `
            <div class="vertical-meter-container">
                <div class="vertical-meter-header">
                    <div class="vertical-meter-icon">${icon}</div>
                    <div class="vertical-meter-name">${this.escapeHtml(name)}</div>
                </div>
                <div class="vertical-meter-bar">
                    <div class="vertical-meter-fill" style="height: ${progress}%"></div>
                    <div class="vertical-meter-markers">
                        <div class="vertical-meter-marker" style="bottom: 75%"><span>75%</span></div>
                        <div class="vertical-meter-marker" style="bottom: 50%"><span>50%</span></div>
                        <div class="vertical-meter-marker" style="bottom: 25%"><span>25%</span></div>
                    </div>
                </div>
                <div class="vertical-meter-footer">
                    <div class="vertical-meter-current">${this.formatNumber(currentValue)}</div>
                    <div class="vertical-meter-target">${this.formatNumber(targetValue)}</div>
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
            .vertical-meter-container {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                background: ${bgColor};
                border-radius: 20px;
                padding: 20px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                border: 2px solid rgba(255, 255, 255, 0.1);
            }

            .vertical-meter-header {
                text-align: center;
                margin-bottom: 20px;
            }

            .vertical-meter-icon {
                font-size: 2rem;
                margin-bottom: 10px;
                filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
            }

            .vertical-meter-name {
                font-size: 1rem;
                font-weight: 600;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 0.1em;
            }

            .vertical-meter-bar {
                flex: 1;
                width: 60px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 30px;
                position: relative;
                overflow: hidden;
                margin: 20px 0;
            }

            .vertical-meter-fill {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                background: linear-gradient(0deg, ${primaryColor}, ${secondaryColor});
                border-radius: 30px;
                transition: height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 0 20px ${primaryColor}80;
            }

            .vertical-meter-markers {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
            }

            .vertical-meter-marker {
                position: absolute;
                left: 0;
                right: 0;
                height: 1px;
                background: rgba(255, 255, 255, 0.2);
            }

            .vertical-meter-marker span {
                position: absolute;
                left: -35px;
                top: -8px;
                font-size: 0.7rem;
                color: #64748b;
            }

            .vertical-meter-footer {
                text-align: center;
            }

            .vertical-meter-current {
                font-size: 1.8rem;
                font-weight: 700;
                color: ${primaryColor};
                text-shadow: 0 0 15px ${primaryColor}60;
                margin-bottom: 5px;
            }

            .vertical-meter-target {
                font-size: 0.9rem;
                color: #64748b;
            }

            .vertical-meter-target::before {
                content: 'Goal: ';
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
