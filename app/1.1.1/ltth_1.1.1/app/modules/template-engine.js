/**
 * Template Engine with Variable Replacement and RegExp Caching
 * Eliminates code duplication and improves performance
 */

class TemplateEngine {
    constructor() {
        // Cache for compiled RegExp patterns
        this.regexpCache = new Map();
        this.maxCacheSize = 1000;

        // Predefined common variables for TikTok events
        this.commonVariables = {
            'username': 'User',
            'uniqueId': 'user123',
            'nickname': 'User',
            'giftName': 'Rose',
            'giftCount': '1',
            'coins': '5',
            'diamondCount': '5',
            'message': 'Hello!',
            'comment': 'Nice stream!',
            'likeCount': '1',
            'totalLikes': '100',
            'followRole': 'follower',
            'viewerCount': '10',
            'teamMemberLevel': '1'
        };
    }

    /**
     * Get cached RegExp or create and cache new one
     * @param {string} variable - Variable name to create pattern for
     * @returns {RegExp} - Compiled RegExp pattern
     */
    getRegExp(variable) {
        if (this.regexpCache.has(variable)) {
            return this.regexpCache.get(variable);
        }

        // Create new RegExp
        const pattern = new RegExp(`\\{${variable}\\}`, 'g');

        // Cache size limit
        if (this.regexpCache.size >= this.maxCacheSize) {
            // Remove oldest entry (simple FIFO)
            const firstKey = this.regexpCache.keys().next().value;
            this.regexpCache.delete(firstKey);
        }

        this.regexpCache.set(variable, pattern);
        return pattern;
    }

    /**
     * Replace variables in template string
     * @param {string} template - Template string with {variable} placeholders
     * @param {Object} variables - Object with variable values
     * @param {Object} options - Rendering options
     * @param {boolean} options.htmlEscape - Whether to HTML escape values (default: false)
     * @param {string} options.defaultValue - Default value for missing variables (default: '')
     * @returns {string} - Rendered template
     */
    render(template, variables = {}, options = {}) {
        const { htmlEscape = false, defaultValue = '' } = options;

        if (!template || typeof template !== 'string') {
            return template;
        }

        let result = template;

        // Replace all variables
        for (const [key, value] of Object.entries(variables)) {
            if (value === null || value === undefined) {
                continue;
            }

            const regexp = this.getRegExp(key);
            let replacement = String(value);

            // HTML escape if requested
            if (htmlEscape) {
                replacement = this.escapeHtml(replacement);
            }

            result = result.replace(regexp, replacement);
        }

        // Replace remaining variables with default value
        if (defaultValue !== '') {
            result = result.replace(/\{[a-zA-Z0-9_]+\}/g, defaultValue);
        }

        return result;
    }

    /**
     * Render template for TikTok events
     * @param {string} template - Template string
     * @param {Object} eventData - TikTok event data
     * @param {Object} options - Rendering options
     * @returns {string} - Rendered template
     */
    renderTikTokEvent(template, eventData = {}, options = {}) {
        // Build variables from event data
        const variables = {};

        // Event-specific variable extraction
        if (eventData.uniqueId) variables.uniqueId = eventData.uniqueId;
        if (eventData.nickname) variables.nickname = eventData.nickname;
        if (eventData.username) variables.username = eventData.username;

        // Gift events
        if (eventData.giftName) variables.giftName = eventData.giftName;
        if (eventData.giftCount !== undefined) variables.giftCount = eventData.giftCount;
        if (eventData.repeatCount !== undefined) variables.giftCount = eventData.repeatCount;
        if (eventData.coins !== undefined) variables.coins = eventData.coins;
        if (eventData.diamondCount !== undefined) variables.diamondCount = eventData.diamondCount;

        // Chat/Comment events
        if (eventData.message) variables.message = eventData.message;
        if (eventData.comment) variables.comment = eventData.comment;

        // Like events
        if (eventData.likeCount !== undefined) variables.likeCount = eventData.likeCount;
        if (eventData.totalLikeCount !== undefined) variables.totalLikes = eventData.totalLikeCount;

        // Follow events
        if (eventData.followRole !== undefined) variables.followRole = eventData.followRole;

        // Share events
        if (eventData.shareType) variables.shareType = eventData.shareType;

        // Viewer count
        if (eventData.viewerCount !== undefined) variables.viewerCount = eventData.viewerCount;

        // Team member level
        if (eventData.teamMemberLevel !== undefined) variables.teamMemberLevel = eventData.teamMemberLevel;

        return this.render(template, variables, options);
    }

    /**
     * Render template for gift events
     * @param {string} template - Template string
     * @param {Object} gift - Gift event data
     * @returns {string} - Rendered template
     */
    renderGiftEvent(template, gift = {}) {
        const variables = {
            username: gift.uniqueId || gift.username || 'User',
            nickname: gift.nickname || gift.uniqueId || 'User',
            giftName: gift.giftName || 'Gift',
            giftCount: gift.giftCount || gift.repeatCount || 1,
            coins: gift.coins || gift.diamondCount || 0,
            diamondCount: gift.diamondCount || gift.coins || 0
        };

        return this.render(template, variables);
    }

    /**
     * Render template for alert events
     * @param {string} template - Template string
     * @param {string} eventType - Event type (gift, follow, share, etc.)
     * @param {Object} data - Event data
     * @returns {string} - Rendered template
     */
    renderAlertEvent(template, eventType, data = {}) {
        const variables = {
            eventType: eventType,
            username: data.uniqueId || data.username || 'User',
            nickname: data.nickname || data.uniqueId || 'User'
        };

        // Add event-specific variables
        switch (eventType) {
            case 'gift':
                variables.giftName = data.giftName || 'Gift';
                variables.giftCount = data.giftCount || data.repeatCount || 1;
                variables.coins = data.coins || data.diamondCount || 0;
                break;
            case 'chat':
            case 'comment':
                variables.message = data.message || data.comment || '';
                break;
            case 'like':
                variables.likeCount = data.likeCount || 1;
                variables.totalLikes = data.totalLikeCount || 0;
                break;
            case 'share':
                variables.shareType = data.shareType || 'share';
                break;
            case 'follow':
                variables.followRole = data.followRole || 'follower';
                break;
        }

        return this.render(template, variables);
    }

    /**
     * Escape HTML special characters
     * @param {string} text - Text to escape
     * @returns {string} - Escaped text
     */
    escapeHtml(text) {
        const htmlEscapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;'
        };

        return text.replace(/[&<>"'/]/g, char => htmlEscapeMap[char]);
    }

    /**
     * Check if template contains variable
     * @param {string} template - Template string
     * @param {string} variable - Variable name
     * @returns {boolean} - True if template contains variable
     */
    hasVariable(template, variable) {
        return template.includes(`{${variable}}`);
    }

    /**
     * Get all variables in template
     * @param {string} template - Template string
     * @returns {Array<string>} - Array of variable names
     */
    getVariables(template) {
        const matches = template.match(/\{([a-zA-Z0-9_]+)\}/g);
        if (!matches) {
            return [];
        }

        return matches.map(match => match.slice(1, -1));
    }

    /**
     * Validate template syntax
     * @param {string} template - Template string
     * @returns {Object} - Validation result { valid: boolean, errors: Array<string> }
     */
    validateTemplate(template) {
        const errors = [];

        if (typeof template !== 'string') {
            errors.push('Template must be a string');
            return { valid: false, errors };
        }

        // Check for unclosed braces
        const openBraces = (template.match(/\{/g) || []).length;
        const closeBraces = (template.match(/\}/g) || []).length;

        if (openBraces !== closeBraces) {
            errors.push(`Mismatched braces: ${openBraces} open, ${closeBraces} close`);
        }

        // Check for nested braces (not supported)
        if (/\{\{|\}\}/.test(template)) {
            errors.push('Nested braces are not supported');
        }

        // Check for invalid variable names
        const invalidVars = template.match(/\{[^a-zA-Z0-9_]+\}/g);
        if (invalidVars) {
            errors.push(`Invalid variable names: ${invalidVars.join(', ')}`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Clear RegExp cache
     */
    clearCache() {
        this.regexpCache.clear();
    }

    /**
     * Get cache statistics
     * @returns {Object} - Cache stats
     */
    getCacheStats() {
        return {
            size: this.regexpCache.size,
            maxSize: this.maxCacheSize,
            keys: Array.from(this.regexpCache.keys())
        };
    }
}

// Export singleton instance
module.exports = new TemplateEngine();
