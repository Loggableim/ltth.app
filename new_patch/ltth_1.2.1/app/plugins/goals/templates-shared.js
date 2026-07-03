/**
 * SHARED GOAL OVERLAY TEMPLATES
 * Used by both overlay.js and ui.js for consistent rendering
 * 
 * This file contains minimal template definitions for UI preview.
 * Full templates with animations are in overlay/overlay.js
 */

// Helper functions used by all templates
const TemplateHelpers = {
    getIcon(type) {
        const icons = { coin: '🪙', likes: '❤️', follower: '👥', custom: '⭐' };
        return icons[type] || '🎯';
    },

    format(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    },

    escape(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Export templates for browser usage
if (typeof window !== 'undefined') {
    window.GoalTemplates = {};
}

// Compact Bar Template
const CompactBarTemplate = {
    ...TemplateHelpers,
    
    render(goal, theme) {
        const progress = Math.min(100, (goal.current_value / goal.target_value) * 100);
        const remaining = Math.max(0, goal.target_value - goal.current_value);
        const icon = this.getIcon(goal.goal_type);

        return `
            <div class="compact-bar-container">
                <div class="compact-bar-wrapper">
                    <div class="compact-bar-header">
                        <div class="compact-bar-title">
                            <span class="compact-bar-icon">${icon}</span>
                            <span class="compact-bar-name">${this.escape(goal.name)}</span>
                        </div>
                        <div class="compact-bar-stats">
                            <span class="compact-bar-percent">${progress.toFixed(0)}%</span>
                            <span class="compact-bar-values">${this.format(goal.current_value)} / ${this.format(goal.target_value)}</span>
                        </div>
                    </div>
                    <div class="compact-bar-progress">
                        <div class="compact-bar-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="compact-bar-remaining">
                        ${remaining > 0 ? `${this.format(remaining)} remaining` : 'Goal Reached! 🎉'}
                    </div>
                </div>
            </div>
        `;
    },

    getStyles(theme) {
        const primaryColor = theme.primaryColor || '#60a5fa';
        const secondaryColor = theme.secondaryColor || '#3b82f6';
        const textColor = theme.textColor || '#ffffff';
        const bgColor = theme.bgColor || 'rgba(15, 23, 42, 0.95)';

        return `
            .compact-bar-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
            .compact-bar-wrapper { background: ${bgColor}; border-radius: 16px; padding: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); border: 2px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); width: 100%; position: relative; overflow: hidden; }
            .compact-bar-wrapper::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor}); }
            .compact-bar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
            .compact-bar-title { display: flex; align-items: center; gap: 10px; }
            .compact-bar-icon { font-size: 1.5rem; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5)); }
            .compact-bar-name { font-size: 1.2rem; font-weight: 700; color: ${textColor}; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5); }
            .compact-bar-stats { display: flex; align-items: center; gap: 12px; }
            .compact-bar-percent { font-size: 1.3rem; font-weight: 700; color: ${primaryColor}; text-shadow: 0 0 10px ${primaryColor}80; }
            .compact-bar-values { font-size: 0.9rem; color: #cbd5e1; }
            .compact-bar-progress { background: rgba(255, 255, 255, 0.1); border-radius: 10px; height: 20px; overflow: hidden; position: relative; }
            .compact-bar-fill { height: 100%; background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor}); border-radius: 10px; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 20px ${primaryColor}80; will-change: width; }
            .compact-bar-remaining { text-align: center; font-size: 0.85rem; color: #94a3b8; margin-top: 8px; }
        `;
    }
};

// Full Width Template
const FullWidthTemplate = {
    ...TemplateHelpers,
    
    render(goal, theme) {
        const progress = Math.min(100, (goal.current_value / goal.target_value) * 100);
        const icon = this.getIcon(goal.goal_type);

        return `
            <div class="full-width-container">
                <div class="full-width-progress-bg">
                    <div class="full-width-progress-fill" style="width: ${progress}%"></div>
                </div>
                <div class="full-width-content">
                    <div class="full-width-left">
                        <span class="full-width-icon">${icon}</span>
                        <span class="full-width-name">${this.escape(goal.name)}</span>
                    </div>
                    <div class="full-width-right">
                        <span class="full-width-current">${this.format(goal.current_value)}</span>
                        <span class="full-width-separator">/</span>
                        <span class="full-width-target">${this.format(goal.target_value)}</span>
                        <span class="full-width-percent">${progress.toFixed(0)}%</span>
                    </div>
                </div>
            </div>
        `;
    },

    getStyles(theme) {
        const primaryColor = theme.primaryColor || '#60a5fa';
        const secondaryColor = theme.secondaryColor || '#3b82f6';
        const textColor = theme.textColor || '#ffffff';
        const bgColor = theme.bgColor || 'rgba(15, 23, 42, 0.9)';

        return `
            .full-width-container { width: 100%; height: 100%; position: relative; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; }
            .full-width-progress-bg { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: ${bgColor}; overflow: hidden; }
            .full-width-progress-fill { position: absolute; top: 0; left: 0; bottom: 0; background: linear-gradient(90deg, ${primaryColor}40, ${secondaryColor}40); transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); border-right: 3px solid ${primaryColor}; box-shadow: 0 0 30px ${primaryColor}60; }
            .full-width-content { position: relative; height: 100%; display: flex; justify-content: space-between; align-items: center; padding: 0 40px; z-index: 1; }
            .full-width-left { display: flex; align-items: center; gap: 15px; }
            .full-width-icon { font-size: 2rem; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5)); }
            .full-width-name { font-size: 1.5rem; font-weight: 700; color: ${textColor}; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8)); }
            .full-width-right { display: flex; align-items: baseline; gap: 10px; font-weight: 700; }
            .full-width-current { font-size: 1.8rem; color: ${primaryColor}; text-shadow: 0 0 15px ${primaryColor}80; }
            .full-width-separator { font-size: 1.2rem; color: #64748b; }
            .full-width-target { font-size: 1.2rem; color: #94a3b8; }
            .full-width-percent { font-size: 1.5rem; color: ${textColor}; margin-left: 15px; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8); }
        `;
    }
};

// Minimal Counter Template
const MinimalCounterTemplate = {
    ...TemplateHelpers,
    
    render(goal, theme) {
        const progress = Math.min(100, (goal.current_value / goal.target_value) * 100);
        const icon = this.getIcon(goal.goal_type);

        return `
            <div class="minimal-counter-container">
                <div class="minimal-counter-icon">${icon}</div>
                <div class="minimal-counter-name">${this.escape(goal.name)}</div>
                <div class="minimal-counter-values">
                    <span class="minimal-counter-current">${this.format(goal.current_value)}</span>
                    <span class="minimal-counter-separator">/</span>
                    <span class="minimal-counter-target">${this.format(goal.target_value)}</span>
                </div>
                <div class="minimal-counter-bar">
                    <div class="minimal-counter-bar-fill" style="width: ${progress}%"></div>
                </div>
            </div>
        `;
    },

    getStyles(theme) {
        const primaryColor = theme.primaryColor || '#60a5fa';
        const secondaryColor = theme.secondaryColor || '#3b82f6';
        const textColor = theme.textColor || '#ffffff';
        const bgColor = theme.bgColor || 'rgba(15, 23, 42, 0.95)';

        return `
            .minimal-counter-container { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${bgColor}; border-radius: 20px; padding: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); }
            .minimal-counter-icon { font-size: 2.5rem; margin-bottom: 10px; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5)); }
            .minimal-counter-name { font-size: 1rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 15px; }
            .minimal-counter-values { display: flex; align-items: baseline; gap: 8px; margin-bottom: 15px; }
            .minimal-counter-current { font-size: 3rem; font-weight: 700; color: ${primaryColor}; text-shadow: 0 0 20px ${primaryColor}60; line-height: 1; }
            .minimal-counter-separator { font-size: 1.5rem; color: #475569; }
            .minimal-counter-target { font-size: 1.5rem; font-weight: 600; color: #64748b; }
            .minimal-counter-bar { width: 100%; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden; }
            .minimal-counter-bar-fill { height: 100%; background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor}); border-radius: 2px; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px ${primaryColor}80; }
        `;
    }
};

// Circular Progress Template
const CircularProgressTemplate = {
    ...TemplateHelpers,
    
    render(goal, theme) {
        const progress = Math.min(100, (goal.current_value / goal.target_value) * 100);
        const icon = this.getIcon(goal.goal_type);
        const circumference = 2 * Math.PI * 90;
        const offset = circumference - (progress / 100) * circumference;

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
                    <div class="circular-progress-name">${this.escape(goal.name)}</div>
                    <div class="circular-progress-values">
                        ${this.format(goal.current_value)} / ${this.format(goal.target_value)}
                    </div>
                </div>
            </div>
        `;
    },

    getStyles(theme) {
        const primaryColor = theme.primaryColor || '#60a5fa';
        const secondaryColor = theme.secondaryColor || '#3b82f6';
        const textColor = theme.textColor || '#ffffff';
        const bgColor = theme.bgColor || 'rgba(15, 23, 42, 0.95)';

        return `
            .circular-progress-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${bgColor}; border-radius: 50%; padding: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); position: relative; }
            .circular-progress-svg { position: absolute; width: 100%; height: 100%; transform: rotate(-90deg); }
            .circular-progress-bg { fill: none; stroke: rgba(255, 255, 255, 0.1); stroke-width: 12; }
            .circular-progress-fill { fill: none; stroke: ${primaryColor}; stroke-width: 12; stroke-linecap: round; transition: stroke-dashoffset 0.5s cubic-bezier(0.4, 0, 0.2, 1); filter: drop-shadow(0 0 10px ${primaryColor}80); }
            .circular-progress-content { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 1; text-align: center; }
            .circular-progress-icon { font-size: 2.5rem; margin-bottom: 10px; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5)); }
            .circular-progress-percent { font-size: 2.5rem; font-weight: 700; color: ${primaryColor}; text-shadow: 0 0 20px ${primaryColor}60; line-height: 1; margin-bottom: 10px; }
            .circular-progress-name { font-size: 1rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 5px; }
            .circular-progress-values { font-size: 0.9rem; color: #64748b; }
        `;
    }
};

// Floating Pill Template
const FloatingPillTemplate = {
    ...TemplateHelpers,
    
    render(goal, theme) {
        const progress = Math.min(100, (goal.current_value / goal.target_value) * 100);
        const icon = this.getIcon(goal.goal_type);

        return `
            <div class="floating-pill-container">
                <div class="floating-pill-card">
                    <div class="floating-pill-header">
                        <span class="floating-pill-icon">${icon}</span>
                        <span class="floating-pill-name">${this.escape(goal.name)}</span>
                        <span class="floating-pill-percent">${progress.toFixed(0)}%</span>
                    </div>
                    <div class="floating-pill-progress">
                        <div class="floating-pill-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="floating-pill-footer">
                        <span>${this.format(goal.current_value)}</span>
                        <span>/</span>
                        <span>${this.format(goal.target_value)}</span>
                    </div>
                </div>
            </div>
        `;
    },

    getStyles(theme) {
        const primaryColor = theme.primaryColor || '#60a5fa';
        const secondaryColor = theme.secondaryColor || '#3b82f6';
        const textColor = theme.textColor || '#ffffff';

        return `
            .floating-pill-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
            .floating-pill-card { background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95)); border-radius: 100px; padding: 15px 25px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); border: 2px solid rgba(255, 255, 255, 0.1); }
            .floating-pill-header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
            .floating-pill-icon { font-size: 1.8rem; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5)); }
            .floating-pill-name { font-size: 1.1rem; font-weight: 700; color: ${textColor}; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5); flex: 1; }
            .floating-pill-percent { font-size: 1.2rem; font-weight: 700; color: ${primaryColor}; text-shadow: 0 0 10px ${primaryColor}80; }
            .floating-pill-progress { height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 10px; overflow: hidden; margin-bottom: 10px; }
            .floating-pill-fill { height: 100%; background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor}); border-radius: 10px; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 15px ${primaryColor}80; }
            .floating-pill-footer { display: flex; gap: 8px; justify-content: center; font-size: 0.9rem; color: #94a3b8; }
        `;
    }
};

// Vertical Meter Template
const VerticalMeterTemplate = {
    ...TemplateHelpers,
    
    render(goal, theme) {
        const progress = Math.min(100, (goal.current_value / goal.target_value) * 100);
        const icon = this.getIcon(goal.goal_type);

        return `
            <div class="vertical-meter-container">
                <div class="vertical-meter-header">
                    <div class="vertical-meter-icon">${icon}</div>
                    <div class="vertical-meter-name">${this.escape(goal.name)}</div>
                </div>
                <div class="vertical-meter-bar-container">
                    <div class="vertical-meter-bar">
                        <div class="vertical-meter-fill" style="height: ${progress}%"></div>
                    </div>
                    <div class="vertical-meter-labels">
                        <div class="vertical-meter-label-top">${this.format(goal.target_value)}</div>
                        <div class="vertical-meter-label-current" style="bottom: ${progress}%">${this.format(goal.current_value)}</div>
                        <div class="vertical-meter-label-bottom">0</div>
                    </div>
                </div>
                <div class="vertical-meter-percent">${progress.toFixed(0)}%</div>
            </div>
        `;
    },

    getStyles(theme) {
        const primaryColor = theme.primaryColor || '#60a5fa';
        const secondaryColor = theme.secondaryColor || '#3b82f6';
        const textColor = theme.textColor || '#ffffff';
        const bgColor = theme.bgColor || 'rgba(15, 23, 42, 0.95)';

        return `
            .vertical-meter-container { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: space-between; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${bgColor}; border-radius: 20px; padding: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); }
            .vertical-meter-header { text-align: center; margin-bottom: 15px; }
            .vertical-meter-icon { font-size: 2.5rem; margin-bottom: 8px; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5)); }
            .vertical-meter-name { font-size: 1.1rem; font-weight: 700; color: ${textColor}; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5); }
            .vertical-meter-bar-container { flex: 1; display: flex; gap: 15px; align-items: center; width: 100%; }
            .vertical-meter-bar { flex: 0 0 40px; height: 100%; background: rgba(255, 255, 255, 0.1); border-radius: 20px; overflow: hidden; position: relative; display: flex; flex-direction: column-reverse; }
            .vertical-meter-fill { width: 100%; background: linear-gradient(180deg, ${secondaryColor}, ${primaryColor}); transition: height 0.5s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 20px ${primaryColor}80; border-radius: 20px; }
            .vertical-meter-labels { flex: 1; position: relative; height: 100%; }
            .vertical-meter-label-top, .vertical-meter-label-bottom { font-size: 0.85rem; color: #64748b; position: absolute; }
            .vertical-meter-label-top { top: 0; }
            .vertical-meter-label-bottom { bottom: 0; }
            .vertical-meter-label-current { position: absolute; font-size: 1.2rem; font-weight: 700; color: ${primaryColor}; text-shadow: 0 0 15px ${primaryColor}80; }
            .vertical-meter-percent { font-size: 1.5rem; font-weight: 700; color: ${primaryColor}; text-shadow: 0 0 15px ${primaryColor}60; margin-top: 15px; }
        `;
    }
};

// Neon Glow Template (NEW)
const NeonGlowTemplate = {
    ...TemplateHelpers,
    
    render(goal, theme) {
        const progress = Math.min(100, (goal.current_value / goal.target_value) * 100);
        const icon = this.getIcon(goal.goal_type);
        const primaryColor = theme.primaryColor || '#00ffff';

        return `
            <div class="neon-glow-container">
                <div class="neon-glow-border"></div>
                <div class="neon-glow-content">
                    <div class="neon-glow-header">
                        <span class="neon-glow-icon">${icon}</span>
                        <span class="neon-glow-name">${this.escape(goal.name)}</span>
                    </div>
                    <div class="neon-glow-stats">
                        <div class="neon-glow-current">${this.format(goal.current_value)}</div>
                        <div class="neon-glow-divider">//</div>
                        <div class="neon-glow-target">${this.format(goal.target_value)}</div>
                    </div>
                    <div class="neon-glow-progress-track">
                        <div class="neon-glow-progress-fill" style="width: ${progress}%"></div>
                        <div class="neon-glow-progress-glow" style="width: ${progress}%"></div>
                    </div>
                    <div class="neon-glow-percent">${progress.toFixed(1)}% COMPLETE</div>
                </div>
            </div>
        `;
    },

    getStyles(theme) {
        const primaryColor = theme.primaryColor || '#00ffff';
        const secondaryColor = theme.secondaryColor || '#ff00ff';
        const textColor = theme.textColor || '#00ffff';

        return `
            .neon-glow-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-family: 'Courier New', monospace; background: #0a0a0a; position: relative; overflow: hidden; }
            .neon-glow-border { position: absolute; inset: 10px; border: 2px solid ${primaryColor}; box-shadow: 0 0 20px ${primaryColor}80, inset 0 0 20px ${primaryColor}40; animation: neon-pulse 2s ease-in-out infinite; }
            .neon-glow-content { position: relative; z-index: 1; padding: 30px; width: 100%; }
            .neon-glow-header { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
            .neon-glow-icon { font-size: 2.5rem; filter: drop-shadow(0 0 10px ${primaryColor}); }
            .neon-glow-name { font-size: 1.4rem; font-weight: 700; color: ${textColor}; text-transform: uppercase; letter-spacing: 0.15em; text-shadow: 0 0 10px ${primaryColor}, 0 0 20px ${primaryColor}80; }
            .neon-glow-stats { display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 20px; }
            .neon-glow-current { font-size: 2.5rem; font-weight: 700; color: ${primaryColor}; text-shadow: 0 0 15px ${primaryColor}, 0 0 30px ${primaryColor}60; }
            .neon-glow-divider { font-size: 2rem; color: ${secondaryColor}; text-shadow: 0 0 10px ${secondaryColor}; }
            .neon-glow-target { font-size: 1.5rem; font-weight: 600; color: #888; }
            .neon-glow-progress-track { position: relative; height: 8px; background: rgba(255, 255, 255, 0.05); border: 1px solid ${primaryColor}40; margin-bottom: 15px; }
            .neon-glow-progress-fill { position: absolute; height: 100%; background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor}); transition: width 0.5s ease; }
            .neon-glow-progress-glow { position: absolute; height: 200%; top: -50%; background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor}); filter: blur(8px); opacity: 0.6; transition: width 0.5s ease; }
            .neon-glow-percent { text-align: center; font-size: 0.9rem; color: ${textColor}; letter-spacing: 0.2em; text-shadow: 0 0 5px ${primaryColor}80; }
            @keyframes neon-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }
        `;
    }
};

// Hexagon Progress Template (NEW)
const HexagonProgressTemplate = {
    ...TemplateHelpers,
    
    render(goal, theme) {
        const progress = Math.min(100, (goal.current_value / goal.target_value) * 100);
        const icon = this.getIcon(goal.goal_type);

        return `
            <div class="hexagon-container">
                <svg class="hexagon-bg" viewBox="0 0 200 220">
                    <defs>
                        <clipPath id="hexClip">
                            <polygon points="100,10 175,55 175,145 100,190 25,145 25,55" />
                        </clipPath>
                    </defs>
                    <polygon class="hexagon-outline" points="100,10 175,55 175,145 100,190 25,145 25,55" />
                    <polygon class="hexagon-fill" points="100,190 25,145 25,55 100,10 175,55 175,145" 
                             style="clip-path: url(#hexClip); transform: scaleY(${1 - progress / 100}); transform-origin: center bottom;" />
                </svg>
                <div class="hexagon-content">
                    <div class="hexagon-icon">${icon}</div>
                    <div class="hexagon-percent">${progress.toFixed(0)}%</div>
                    <div class="hexagon-name">${this.escape(goal.name)}</div>
                    <div class="hexagon-values">${this.format(goal.current_value)} / ${this.format(goal.target_value)}</div>
                </div>
            </div>
        `;
    },

    getStyles(theme) {
        const primaryColor = theme.primaryColor || '#60a5fa';
        const secondaryColor = theme.secondaryColor || '#3b82f6';
        const textColor = theme.textColor || '#ffffff';

        return `
            .hexagon-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; position: relative; }
            .hexagon-bg { position: absolute; width: 80%; height: 80%; }
            .hexagon-outline { fill: rgba(255, 255, 255, 0.05); stroke: ${primaryColor}; stroke-width: 2; filter: drop-shadow(0 0 15px ${primaryColor}80); }
            .hexagon-fill { fill: ${primaryColor}40; transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
            .hexagon-content { position: relative; z-index: 1; text-align: center; }
            .hexagon-icon { font-size: 3rem; margin-bottom: 10px; filter: drop-shadow(0 0 10px ${primaryColor}); }
            .hexagon-percent { font-size: 2.5rem; font-weight: 700; color: ${primaryColor}; text-shadow: 0 0 20px ${primaryColor}80; margin-bottom: 10px; }
            .hexagon-name { font-size: 1.1rem; font-weight: 600; color: ${textColor}; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
            .hexagon-values { font-size: 0.95rem; color: #94a3b8; }
        `;
    }
};

// Glassy Card Template (NEW)
const GlassyCardTemplate = {
    ...TemplateHelpers,
    
    render(goal, theme) {
        const progress = Math.min(100, (goal.current_value / goal.target_value) * 100);
        const icon = this.getIcon(goal.goal_type);

        return `
            <div class="glassy-container">
                <div class="glassy-card">
                    <div class="glassy-shine"></div>
                    <div class="glassy-header">
                        <span class="glassy-icon">${icon}</span>
                        <span class="glassy-name">${this.escape(goal.name)}</span>
                    </div>
                    <div class="glassy-stats">
                        <div class="glassy-stat-item">
                            <div class="glassy-stat-label">Current</div>
                            <div class="glassy-stat-value">${this.format(goal.current_value)}</div>
                        </div>
                        <div class="glassy-stat-divider"></div>
                        <div class="glassy-stat-item">
                            <div class="glassy-stat-label">Goal</div>
                            <div class="glassy-stat-value">${this.format(goal.target_value)}</div>
                        </div>
                    </div>
                    <div class="glassy-progress-container">
                        <div class="glassy-progress-bg">
                            <div class="glassy-progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <div class="glassy-progress-label">${progress.toFixed(0)}%</div>
                    </div>
                </div>
            </div>
        `;
    },

    getStyles(theme) {
        const primaryColor = theme.primaryColor || '#60a5fa';
        const secondaryColor = theme.secondaryColor || '#3b82f6';
        const textColor = theme.textColor || '#ffffff';

        return `
            .glassy-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, ${primaryColor}20, ${secondaryColor}20); }
            .glassy-card { position: relative; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px); border-radius: 25px; padding: 30px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.15); overflow: hidden; width: 90%; }
            .glassy-shine { position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.1), transparent); animation: glassy-shine 3s ease-in-out infinite; pointer-events: none; }
            .glassy-header { display: flex; align-items: center; gap: 15px; margin-bottom: 25px; }
            .glassy-icon { font-size: 2.5rem; filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3)); }
            .glassy-name { font-size: 1.5rem; font-weight: 700; color: ${textColor}; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
            .glassy-stats { display: flex; align-items: center; justify-content: space-around; margin-bottom: 25px; }
            .glassy-stat-item { text-align: center; }
            .glassy-stat-label { font-size: 0.85rem; color: rgba(255, 255, 255, 0.6); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
            .glassy-stat-value { font-size: 1.8rem; font-weight: 700; color: ${primaryColor}; text-shadow: 0 0 15px ${primaryColor}60; }
            .glassy-stat-divider { width: 1px; height: 50px; background: rgba(255, 255, 255, 0.2); }
            .glassy-progress-container { position: relative; }
            .glassy-progress-bg { height: 10px; background: rgba(255, 255, 255, 0.1); border-radius: 10px; overflow: hidden; margin-bottom: 10px; }
            .glassy-progress-fill { height: 100%; background: linear-gradient(90deg, ${primaryColor}, ${secondaryColor}); border-radius: 10px; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 20px ${primaryColor}80; position: relative; }
            .glassy-progress-fill::after { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent); animation: glassy-progress-shine 2s ease-in-out infinite; }
            .glassy-progress-label { text-align: center; font-size: 0.9rem; color: rgba(255, 255, 255, 0.8); font-weight: 600; }
            @keyframes glassy-shine { 0%, 100% { transform: translateX(-100%) translateY(-100%); } 50% { transform: translateX(100%) translateY(100%); } }
            @keyframes glassy-progress-shine { 0%, 100% { transform: translateX(-100%); } 50% { transform: translateX(100%); } }
        `;
    }
};

// Export templates to window for browser usage
if (typeof window !== 'undefined') {
    window.GoalTemplates = {
        CompactBarTemplate,
        FullWidthTemplate,
        MinimalCounterTemplate,
        CircularProgressTemplate,
        FloatingPillTemplate,
        VerticalMeterTemplate,
        NeonGlowTemplate,
        HexagonProgressTemplate,
        GlassyCardTemplate
    };
}
