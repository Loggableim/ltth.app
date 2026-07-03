/**
 * Floating Pill Template
 * A sleek, pill-shaped floating progress indicator
 */

module.exports = {
    id: 'floating-pill',
    name: 'Floating Progress Pill',
    description: 'A sleek, pill-shaped floating progress indicator',
    defaultWidth: 350,
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

        return `
            <div class="floating-pill-container">
                <div class="floating-pill-background" style="background: linear-gradient(135deg, ${primaryColor}20, ${primaryColor}10);">
                    <div class="floating-pill-progress" style="width: ${progress}%"></div>
                </div>
                <div class="floating-pill-content">
                    <div class="floating-pill-left">
                        <span class="floating-pill-icon">${icon}</span>
                        <span class="floating-pill-name">${this.escapeHtml(name)}</span>
                    </div>
                    <div class="floating-pill-right">
                        <span class="floating-pill-values">${this.formatNumber(currentValue)}/${this.formatNumber(targetValue)}</span>
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
            .floating-pill-container {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                padding: 10px;
            }

            .floating-pill-background {
                width: 100%;
                height: 100%;
                border-radius: 100px;
                position: relative;
                overflow: hidden;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3),
                            inset 0 2px 4px rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.15);
            }

            .floating-pill-progress {
                position: absolute;
                top: 0;
                left: 0;
                bottom: 0;
                background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor});
                transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 0 30px ${primaryColor}60;
                border-radius: 100px;
            }

            .floating-pill-content {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0 25px;
                z-index: 1;
            }

            .floating-pill-left {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .floating-pill-icon {
                font-size: 1.8rem;
                filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
            }

            .floating-pill-name {
                font-size: 1.1rem;
                font-weight: 700;
                color: ${textColor};
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
            }

            .floating-pill-right {
                display: flex;
                align-items: center;
            }

            .floating-pill-values {
                font-size: 1.2rem;
                font-weight: 700;
                color: ${textColor};
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
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
