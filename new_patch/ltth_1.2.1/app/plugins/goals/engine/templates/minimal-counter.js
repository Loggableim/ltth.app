/**
 * Minimal Counter Template
 * A minimalist counter display with clean typography
 */

module.exports = {
    id: 'minimal-counter',
    name: 'Minimal Counter',
    description: 'A clean, minimalist counter with large numbers',
    defaultWidth: 400,
    defaultHeight: 120,

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
        const textColor = theme?.textColor || '#ffffff';

        return `
            <div class="minimal-counter-container">
                <div class="minimal-counter-icon">${icon}</div>
                <div class="minimal-counter-name">${this.escapeHtml(name)}</div>
                <div class="minimal-counter-values">
                    <span class="minimal-counter-current">${this.formatNumber(currentValue)}</span>
                    <span class="minimal-counter-separator">/</span>
                    <span class="minimal-counter-target">${this.formatNumber(targetValue)}</span>
                </div>
                <div class="minimal-counter-bar">
                    <div class="minimal-counter-bar-fill" style="width: ${progress}%"></div>
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
            .minimal-counter-container {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                background: ${bgColor};
                border-radius: 20px;
                padding: 20px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .minimal-counter-icon {
                font-size: 2.5rem;
                margin-bottom: 10px;
                filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
            }

            .minimal-counter-name {
                font-size: 1rem;
                font-weight: 600;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                margin-bottom: 15px;
            }

            .minimal-counter-values {
                display: flex;
                align-items: baseline;
                gap: 8px;
                margin-bottom: 15px;
            }

            .minimal-counter-current {
                font-size: 3rem;
                font-weight: 700;
                color: ${primaryColor};
                text-shadow: 0 0 20px ${primaryColor}60;
                line-height: 1;
            }

            .minimal-counter-separator {
                font-size: 1.5rem;
                color: #475569;
            }

            .minimal-counter-target {
                font-size: 1.5rem;
                font-weight: 600;
                color: #64748b;
            }

            .minimal-counter-bar {
                width: 100%;
                height: 4px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
                overflow: hidden;
            }

            .minimal-counter-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor});
                border-radius: 2px;
                transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 0 10px ${primaryColor}80;
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
