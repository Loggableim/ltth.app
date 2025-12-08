/**
 * Context-Builder
 *
 * Erstellt Context-Objects für HybridShock Actions basierend auf Templates.
 * Features:
 * - Template-Strings mit Platzhaltern ({username}, {giftName}, etc.)
 * - Nested Objects und Arrays
 * - JavaScript-Expressions für Berechnungen
 * - Default-Values für fehlende Daten
 * - Type-Conversion (String, Number, Boolean)
 */

class ContextBuilder {
    constructor() {
        // Verfügbare Platzhalter-Mappings
        this.placeholderMappings = {
            // User-Daten
            '{username}': 'username',
            '{nickname}': 'nickname',
            '{userId}': 'userId',
            '{profilePicture}': 'profilePictureUrl',

            // Gift-Daten
            '{giftName}': 'giftName',
            '{giftId}': 'giftId',
            '{giftPicture}': 'giftPictureUrl',
            '{giftCount}': 'giftCount',
            '{repeatCount}': 'repeatCount',
            '{diamondCount}': 'diamondCount',
            '{coins}': 'coins',
            '{totalCoins}': 'totalCoins',

            // Chat-Daten
            '{message}': 'message',
            '{isModerator}': 'isModerator',
            '{isSubscriber}': 'isSubscriber',

            // Like-Daten
            '{likeCount}': 'likeCount',
            '{totalLikes}': 'totalLikes',

            // Share/Follow-Daten
            '{followCount}': 'followCount',
            '{shareCount}': 'shareCount',

            // System-Daten
            '{timestamp}': () => Date.now(),
            '{timestampISO}': () => new Date().toISOString(),
            '{random}': () => Math.random(),
            '{randomInt}': () => Math.floor(Math.random() * 100)
        };
    }

    /**
     * Context-Object aus Template erstellen
     * @param {object} template - Template-Object mit Platzhaltern
     * @param {object} eventData - TikTok Event-Daten
     * @returns {object} - Generiertes Context-Object
     */
    build(template, eventData) {
        if (!template || typeof template !== 'object') {
            return {};
        }

        return this.processObject(template, eventData);
    }

    /**
     * Object rekursiv verarbeiten
     */
    processObject(obj, eventData) {
        if (Array.isArray(obj)) {
            return obj.map(item => this.processValue(item, eventData));
        }

        if (obj && typeof obj === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.processValue(value, eventData);
            }
            return result;
        }

        return this.processValue(obj, eventData);
    }

    /**
     * Einzelnen Wert verarbeiten
     */
    processValue(value, eventData) {
        // Null/Undefined
        if (value === null || value === undefined) {
            return value;
        }

        // String mit Platzhaltern
        if (typeof value === 'string') {
            return this.processString(value, eventData);
        }

        // Object/Array
        if (typeof value === 'object') {
            return this.processObject(value, eventData);
        }

        // Primitive (Number, Boolean, etc.)
        return value;
    }

    /**
     * String mit Platzhaltern verarbeiten
     */
    processString(str, eventData) {
        let result = str;

        // Platzhalter ersetzen
        for (const [placeholder, mapping] of Object.entries(this.placeholderMappings)) {
            if (result.includes(placeholder)) {
                let replacement;

                // Function-Mapping (z.B. {timestamp})
                if (typeof mapping === 'function') {
                    replacement = mapping();
                }
                // Property-Mapping (z.B. {username})
                else {
                    replacement = this.getNestedProperty(eventData, mapping);
                }

                // Fallback to empty string
                if (replacement === null || replacement === undefined) {
                    replacement = '';
                }

                result = result.replace(new RegExp(this.escapeRegex(placeholder), 'g'), replacement);
            }
        }

        // JavaScript-Expressions (z.B. "${coins * 2}")
        result = this.evaluateExpressions(result, eventData);

        // Type-Conversion
        result = this.convertType(result);

        return result;
    }

    /**
     * JavaScript-Expressions evaluieren
     * Format: ${expression}
     */
    evaluateExpressions(str, eventData) {
        const expressionRegex = /\$\{([^}]+)\}/g;
        let result = str;

        const matches = [...str.matchAll(expressionRegex)];
        for (const match of matches) {
            const expression = match[1];
            try {
                // Context für eval erstellen
                const evalContext = {
                    ...eventData,
                    Math,
                    Date,
                    JSON,
                    String,
                    Number,
                    Boolean
                };

                // Sichere eval-Umgebung (mit Funktions-Scope)
                const fn = new Function(...Object.keys(evalContext), `return ${expression}`);
                const value = fn(...Object.values(evalContext));

                result = result.replace(match[0], value);
            } catch (error) {
                console.error(`Expression evaluation error: ${error.message}`);
                result = result.replace(match[0], '');
            }
        }

        return result;
    }

    /**
     * Nested Property aus Object holen (z.B. "user.profile.name")
     */
    getNestedProperty(obj, path) {
        if (!path) return undefined;

        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[part];
        }

        return current;
    }

    /**
     * Type-Conversion (String -> Number/Boolean wenn erkennbar)
     */
    convertType(value) {
        if (typeof value !== 'string') {
            return value;
        }

        // Boolean
        if (value === 'true') return true;
        if (value === 'false') return false;

        // Number
        if (/^\d+$/.test(value)) {
            return parseInt(value, 10);
        }
        if (/^\d+\.\d+$/.test(value)) {
            return parseFloat(value);
        }

        // Null
        if (value === 'null') return null;

        // String bleibt String
        return value;
    }

    /**
     * Regex-Special-Characters escapen
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Template validieren
     * @returns {object} - {valid: boolean, errors: string[]}
     */
    validateTemplate(template) {
        const errors = [];

        if (!template || typeof template !== 'object') {
            errors.push('Template must be an object');
            return { valid: false, errors };
        }

        // Rekursive Validierung
        const validateValue = (value, path = '') => {
            if (typeof value === 'string') {
                // Prüfe auf unbekannte Platzhalter
                const placeholders = value.match(/\{[^}]+\}/g) || [];
                for (const placeholder of placeholders) {
                    if (!this.placeholderMappings[placeholder]) {
                        errors.push(`Unknown placeholder ${placeholder} at ${path || 'root'}`);
                    }
                }

                // Prüfe Expressions
                const expressions = value.match(/\$\{[^}]+\}/g) || [];
                for (const expr of expressions) {
                    try {
                        new Function(`return ${expr.slice(2, -1)}`);
                    } catch (error) {
                        errors.push(`Invalid expression ${expr} at ${path || 'root'}: ${error.message}`);
                    }
                }
            } else if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    validateValue(item, `${path}[${index}]`);
                });
            } else if (value && typeof value === 'object') {
                for (const [key, val] of Object.entries(value)) {
                    validateValue(val, path ? `${path}.${key}` : key);
                }
            }
        };

        validateValue(template);

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Verfügbare Platzhalter abrufen
     */
    getAvailablePlaceholders() {
        return Object.keys(this.placeholderMappings).map(placeholder => ({
            placeholder,
            description: this.getPlaceholderDescription(placeholder)
        }));
    }

    /**
     * Platzhalter-Beschreibung
     */
    getPlaceholderDescription(placeholder) {
        const descriptions = {
            '{username}': 'TikTok username (unique ID)',
            '{nickname}': 'Display name',
            '{userId}': 'User ID',
            '{profilePicture}': 'Profile picture URL',
            '{giftName}': 'Gift name',
            '{giftId}': 'Gift ID',
            '{giftPicture}': 'Gift image URL',
            '{giftCount}': 'Gift count (deprecated, use repeatCount)',
            '{repeatCount}': 'Number of gifts in streak',
            '{diamondCount}': 'Diamonds per gift',
            '{coins}': 'Total coins value',
            '{totalCoins}': 'Total coins in session',
            '{message}': 'Chat message text',
            '{isModerator}': 'Is user a moderator (boolean)',
            '{isSubscriber}': 'Is user a subscriber (boolean)',
            '{likeCount}': 'Number of likes in event',
            '{totalLikes}': 'Total likes in stream',
            '{followCount}': 'Follow count',
            '{shareCount}': 'Share count',
            '{timestamp}': 'Current timestamp (milliseconds)',
            '{timestampISO}': 'Current timestamp (ISO string)',
            '{random}': 'Random number (0-1)',
            '{randomInt}': 'Random integer (0-99)'
        };

        return descriptions[placeholder] || 'No description';
    }

    /**
     * Custom Platzhalter registrieren
     */
    registerPlaceholder(placeholder, mapping) {
        this.placeholderMappings[placeholder] = mapping;
    }

    /**
     * Beispiel-Template für Event-Type
     */
    getExampleTemplate(eventType) {
        const templates = {
            gift: {
                username: '{username}',
                gift: '{giftName}',
                count: '{repeatCount}',
                value: '{coins}',
                message: '{nickname} sent {repeatCount}x {giftName} ({coins} coins)!'
            },
            chat: {
                username: '{username}',
                message: '{message}',
                formatted: '[{username}]: {message}'
            },
            follow: {
                username: '{username}',
                nickname: '{nickname}',
                message: '{nickname} (@{username}) followed!'
            },
            like: {
                username: '{username}',
                count: '{likeCount}',
                total: '{totalLikes}'
            },
            share: {
                username: '{username}',
                nickname: '{nickname}'
            },
            subscribe: {
                username: '{username}',
                nickname: '{nickname}',
                message: 'New subscriber: {nickname}!'
            }
        };

        return templates[eventType] || {};
    }
}

module.exports = ContextBuilder;
