/**
 * Circular Progress Template
 * A circular progress indicator with radial fill
 */

module.exports = {
    id: 'circular-progress',
    name: 'Circular Progress',
    description: 'A circular progress indicator with radial fill animation',
    defaultWidth: 300,
    defaultHeight: 300,

    render(data, theme) {
        const {
            name,
            currentValue,
            targetValue,
            goalType
        } = data;

        const progress = Math.min(100, (currentValue / targetValue) * 100);
        const icon = this.getIcon(goalType);
        const circumference = 2 * Math.PI * 90; // radius = 90
        const offset = circumference - (progress / 100) * circumference;

        const primaryColor = theme?.primaryColor || '#60a5fa';

        return `
            <div class="circular-progress-container">
                <svg class="circular-progress-svg" viewBox="0 0 200 200">
                    <circle class="circular-progress-bg" cx="100" cy="100" r="90"></circle>
                    <circle class="circular-progress-fill" cx="100" cy="100" r="90"
                            style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}"></circle>
                </svg>
                <div class="circular-progress-content">
                    <div class="circular-progress-icon">${icon}</div>
                    <div class="circular-progress-percent">${progress.toFixed(0)}%</div>
                    <div class="circular-progress-name">${this.escapeHtml(name)}</div>
                    <div class="circular-progress-values">
                        ${this.formatNumber(currentValue)} / ${this.formatNumber(targetValue)}
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
            .circular-progress-container {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                background: ${bgColor};
                border-radius: 50%;
                padding: 20px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                position: relative;
            }

            .circular-progress-svg {
                position: absolute;
                width: 100%;
                height: 100%;
                transform: rotate(-90deg);
            }

            .circular-progress-bg {
                fill: none;
                stroke: rgba(255, 255, 255, 0.1);
                stroke-width: 12;
            }

            .circular-progress-fill {
                fill: none;
                stroke: url(#circularGradient);
                stroke-width: 12;
                stroke-linecap: round;
                transition: stroke-dashoffset 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                filter: drop-shadow(0 0 10px ${primaryColor}80);
            }

            .circular-progress-content {
                position: relative;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 1;
                text-align: center;
            }

            .circular-progress-icon {
                font-size: 2.5rem;
                margin-bottom: 10px;
                filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
            }

            .circular-progress-percent {
                font-size: 2.5rem;
                font-weight: 700;
                color: ${primaryColor};
                text-shadow: 0 0 20px ${primaryColor}60;
                line-height: 1;
                margin-bottom: 10px;
            }

            .circular-progress-name {
                font-size: 1rem;
                font-weight: 600;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                margin-bottom: 5px;
            }

            .circular-progress-values {
                font-size: 0.9rem;
                color: #64748b;
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
