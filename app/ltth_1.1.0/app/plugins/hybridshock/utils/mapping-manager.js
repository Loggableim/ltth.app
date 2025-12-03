/**
 * Event-Mapping-Manager
 *
 * Verwaltet Mappings zwischen TikTok Live Events und HybridShock Actions.
 * Features:
 * - Flexible Mapping-Konfiguration (1:N - ein Event kann mehrere Actions triggern)
 * - Conditional Triggers (IF-Bedingungen für Mappings)
 * - Delay & Cooldown-Support
 * - Template-basierte Context-Objects
 * - Priority-System
 */

class MappingManager {
    constructor(db, logger) {
        this.db = db;
        this.logger = logger;
        this.mappings = new Map();
        this.cooldowns = new Map();

        this.initializeDatabase();
    }

    /**
     * Validate regex pattern to prevent ReDoS attacks
     * @param {string} pattern - Regex pattern to validate
     * @returns {boolean} - True if safe, false if potentially dangerous
     */
    isRegexSafe(pattern) {
        // Check for common ReDoS patterns
        const dangerousPatterns = [
            /(\*\+|\+\*|\+\+)/,           // Nested quantifiers like *+, +*, ++
            /(\{\d+,\}\+|\{\d+,\}\*)/,    // Unbounded quantifiers with nested quantifiers
            /(.*){2,}/,                   // Nested wildcards with repetition
            /(\(.+\)){2,}\+/              // Multiple capturing groups with quantifiers
        ];

        for (const dangerous of dangerousPatterns) {
            if (dangerous.test(pattern)) {
                return false;
            }
        }

        // Check pattern length (very long patterns can be problematic)
        if (pattern.length > 500) {
            return false;
        }

        return true;
    }

    /**
     * Datenbank-Tabellen erstellen
     */
    initializeDatabase() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS hybridshock_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                enabled INTEGER DEFAULT 1,
                name TEXT NOT NULL,
                description TEXT,
                tiktok_event_type TEXT NOT NULL,
                hybridshock_category TEXT NOT NULL,
                hybridshock_action TEXT NOT NULL,
                context_template TEXT,
                conditions TEXT,
                delay INTEGER DEFAULT 0,
                cooldown INTEGER DEFAULT 0,
                priority INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Index für schnelles Suchen
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_mappings_event_type
            ON hybridshock_mappings(tiktok_event_type, enabled)
        `);

        this.log('Database initialized', 'info');
    }

    /**
     * Alle Mappings aus DB laden
     */
    loadMappings() {
        try {
            const rows = this.db.prepare(`
                SELECT * FROM hybridshock_mappings
                ORDER BY priority DESC, id ASC
            `).all();

            this.mappings.clear();

            rows.forEach(row => {
                const mapping = {
                    id: row.id,
                    enabled: row.enabled === 1,
                    name: row.name,
                    description: row.description,
                    tiktokEventType: row.tiktok_event_type,
                    hybridshockCategory: row.hybridshock_category,
                    hybridshockAction: row.hybridshock_action,
                    contextTemplate: row.context_template ? JSON.parse(row.context_template) : {},
                    conditions: row.conditions ? JSON.parse(row.conditions) : null,
                    delay: row.delay,
                    cooldown: row.cooldown,
                    priority: row.priority
                };

                if (!this.mappings.has(mapping.tiktokEventType)) {
                    this.mappings.set(mapping.tiktokEventType, []);
                }

                this.mappings.get(mapping.tiktokEventType).push(mapping);
            });

            this.log(`Loaded ${rows.length} mappings`, 'info');
            return rows.length;
        } catch (error) {
            this.log(`Failed to load mappings: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Mapping erstellen
     */
    createMapping(mappingData) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO hybridshock_mappings (
                    enabled, name, description,
                    tiktok_event_type, hybridshock_category, hybridshock_action,
                    context_template, conditions, delay, cooldown, priority
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const result = stmt.run(
                mappingData.enabled !== false ? 1 : 0,
                mappingData.name,
                mappingData.description || null,
                mappingData.tiktokEventType,
                mappingData.hybridshockCategory,
                mappingData.hybridshockAction,
                mappingData.contextTemplate ? JSON.stringify(mappingData.contextTemplate) : null,
                mappingData.conditions ? JSON.stringify(mappingData.conditions) : null,
                mappingData.delay || 0,
                mappingData.cooldown || 0,
                mappingData.priority || 0
            );

            this.loadMappings();
            this.log(`Created mapping: ${mappingData.name}`, 'info');

            return result.lastInsertRowid;
        } catch (error) {
            this.log(`Failed to create mapping: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Mapping aktualisieren
     */
    updateMapping(id, mappingData) {
        try {
            const stmt = this.db.prepare(`
                UPDATE hybridshock_mappings
                SET enabled = ?,
                    name = ?,
                    description = ?,
                    tiktok_event_type = ?,
                    hybridshock_category = ?,
                    hybridshock_action = ?,
                    context_template = ?,
                    conditions = ?,
                    delay = ?,
                    cooldown = ?,
                    priority = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            stmt.run(
                mappingData.enabled !== false ? 1 : 0,
                mappingData.name,
                mappingData.description || null,
                mappingData.tiktokEventType,
                mappingData.hybridshockCategory,
                mappingData.hybridshockAction,
                mappingData.contextTemplate ? JSON.stringify(mappingData.contextTemplate) : null,
                mappingData.conditions ? JSON.stringify(mappingData.conditions) : null,
                mappingData.delay || 0,
                mappingData.cooldown || 0,
                mappingData.priority || 0,
                id
            );

            this.loadMappings();
            this.log(`Updated mapping ID ${id}`, 'info');

            return true;
        } catch (error) {
            this.log(`Failed to update mapping: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Mapping löschen
     */
    deleteMapping(id) {
        try {
            this.db.prepare('DELETE FROM hybridshock_mappings WHERE id = ?').run(id);
            this.loadMappings();
            this.log(`Deleted mapping ID ${id}`, 'info');
            return true;
        } catch (error) {
            this.log(`Failed to delete mapping: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Mapping aktivieren/deaktivieren
     */
    toggleMapping(id, enabled) {
        try {
            this.db.prepare(`
                UPDATE hybridshock_mappings
                SET enabled = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(enabled ? 1 : 0, id);

            this.loadMappings();
            this.log(`Toggled mapping ID ${id}: ${enabled}`, 'info');

            return true;
        } catch (error) {
            this.log(`Failed to toggle mapping: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Alle Mappings abrufen
     */
    getAllMappings() {
        const allMappings = [];
        this.mappings.forEach(mappings => {
            allMappings.push(...mappings);
        });
        return allMappings;
    }

    /**
     * Mappings für Event-Type abrufen
     */
    getMappingsForEvent(eventType) {
        return this.mappings.get(eventType) || [];
    }

    /**
     * Einzelnes Mapping abrufen
     */
    getMapping(id) {
        const allMappings = this.getAllMappings();
        return allMappings.find(m => m.id === id);
    }

    /**
     * Prüfe ob Mapping durch Bedingungen aktiviert wird
     * @param {object} mapping - Mapping-Konfiguration
     * @param {object} eventData - TikTok Event-Daten
     * @returns {boolean}
     */
    evaluateConditions(mapping, eventData) {
        if (!mapping.conditions) {
            return true; // Keine Bedingungen = immer aktivieren
        }

        try {
            const conditions = mapping.conditions;

            // Gift-spezifische Bedingungen
            if (conditions.giftNames && conditions.giftNames.length > 0) {
                if (!conditions.giftNames.includes(eventData.giftName)) {
                    return false;
                }
            }

            if (conditions.minCoins && eventData.coins < conditions.minCoins) {
                return false;
            }

            if (conditions.maxCoins && eventData.coins > conditions.maxCoins) {
                return false;
            }

            // User-spezifische Bedingungen
            if (conditions.usernames && conditions.usernames.length > 0) {
                if (!conditions.usernames.includes(eventData.username)) {
                    return false;
                }
            }

            if (conditions.excludeUsernames && conditions.excludeUsernames.length > 0) {
                if (conditions.excludeUsernames.includes(eventData.username)) {
                    return false;
                }
            }

            // Chat-spezifische Bedingungen
            if (conditions.messageContains && eventData.message) {
                if (!eventData.message.toLowerCase().includes(conditions.messageContains.toLowerCase())) {
                    return false;
                }
            }

            if (conditions.messageRegex && eventData.message) {
                // Validate regex pattern to prevent ReDoS attacks
                if (!this.isRegexSafe(conditions.messageRegex)) {
                    this.log(`Unsafe regex pattern detected, skipping: ${conditions.messageRegex}`, 'warn');
                    return false;
                }

                try {
                    const regex = new RegExp(conditions.messageRegex, 'i');
                    if (!regex.test(eventData.message)) {
                        return false;
                    }
                } catch (error) {
                    this.log(`Invalid regex pattern: ${error.message}`, 'error');
                    return false;
                }
            }

            // Custom JavaScript Expression (erweitert)
            if (conditions.customExpression) {
                try {
                    // Use Function constructor instead of eval for better security
                    // Create a sandboxed function with eventData as context
                    const evaluateExpression = new Function(
                        'eventData',
                        `
                        'use strict';
                        const { username, giftName, coins, message, timestamp } = eventData;
                        return (${conditions.customExpression});
                        `
                    );
                    const result = evaluateExpression(eventData);
                    if (!result) {
                        return false;
                    }
                } catch (error) {
                    this.log(`Custom expression error: ${error.message}`, 'error');
                    return false;
                }
            }

            return true;
        } catch (error) {
            this.log(`Condition evaluation error: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Prüfe Cooldown für Mapping
     * @param {object} mapping - Mapping-Konfiguration
     * @returns {boolean} - true wenn Cooldown aktiv (nicht triggern), false wenn OK
     */
    checkCooldown(mapping) {
        if (!mapping.cooldown || mapping.cooldown === 0) {
            return false; // Kein Cooldown
        }

        const cooldownKey = `mapping_${mapping.id}`;
        const lastTrigger = this.cooldowns.get(cooldownKey);

        if (!lastTrigger) {
            return false; // Noch nie getriggert
        }

        const elapsed = Date.now() - lastTrigger;
        return elapsed < mapping.cooldown;
    }

    /**
     * Setze Cooldown für Mapping
     * @param {object} mapping - Mapping-Konfiguration
     */
    setCooldown(mapping) {
        if (mapping.cooldown && mapping.cooldown > 0) {
            const cooldownKey = `mapping_${mapping.id}`;
            this.cooldowns.set(cooldownKey, Date.now());
        }
    }

    /**
     * Cooldown-Zeit verbleibend abrufen
     * @param {object} mapping - Mapping-Konfiguration
     * @returns {number} - Verbleibende Millisekunden
     */
    getCooldownRemaining(mapping) {
        if (!mapping.cooldown || mapping.cooldown === 0) {
            return 0;
        }

        const cooldownKey = `mapping_${mapping.id}`;
        const lastTrigger = this.cooldowns.get(cooldownKey);

        if (!lastTrigger) {
            return 0;
        }

        const elapsed = Date.now() - lastTrigger;
        const remaining = mapping.cooldown - elapsed;

        return remaining > 0 ? remaining : 0;
    }

    /**
     * Alle Mappings exportieren (JSON)
     */
    exportMappings() {
        return this.getAllMappings().map(mapping => ({
            name: mapping.name,
            description: mapping.description,
            enabled: mapping.enabled,
            tiktokEventType: mapping.tiktokEventType,
            hybridshockCategory: mapping.hybridshockCategory,
            hybridshockAction: mapping.hybridshockAction,
            contextTemplate: mapping.contextTemplate,
            conditions: mapping.conditions,
            delay: mapping.delay,
            cooldown: mapping.cooldown,
            priority: mapping.priority
        }));
    }

    /**
     * Mappings importieren (JSON)
     */
    importMappings(mappingsData, replaceExisting = false) {
        try {
            if (replaceExisting) {
                this.db.exec('DELETE FROM hybridshock_mappings');
                this.log('Cleared existing mappings', 'info');
            }

            let imported = 0;
            mappingsData.forEach(mappingData => {
                this.createMapping(mappingData);
                imported++;
            });

            this.log(`Imported ${imported} mappings`, 'info');
            return imported;
        } catch (error) {
            this.log(`Import failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Logging
     */
    log(message, level = 'info') {
        if (this.logger) {
            this.logger(message, level);
        }
    }
}

module.exports = MappingManager;
