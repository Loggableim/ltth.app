/**
 * StreamAlchemy Fusion Service
 * 
 * Central orchestration service for item fusion operations.
 * Coordinates between prompt generation, image generation, caching, and tier system.
 * 
 * Features:
 * - Manual and automatic fusion modes
 * - Deterministic caching with fusion keys
 * - Multiple image generation backends (Silicon Flow primary, DALL-E fallback)
 * - Tier/frame integration
 * - Async queue for rate limiting
 */

const { randomUUID } = require('crypto');
const PromptGenerator = require('./promptGenerator');
const { STYLE_PRESETS } = require('./promptGenerator');
const SiliconFlowService = require('./siliconFlowService');

class FusionService {
    /**
     * @param {Object} db - Database instance
     * @param {Object} logger - Logger instance
     * @param {Object} config - Fusion configuration
     */
    constructor(db, logger, config = {}) {
        this.db = db;
        this.logger = logger;
        
        // Configuration
        this.config = {
            enabled: true,
            autoFusionEnabled: false, // Auto-fuse when 2 different gifts sent
            preferredGenerator: 'siliconflow', // 'siliconflow' or 'dalle'
            defaultStyle: 'rpg',
            allowedStyles: Object.keys(STYLE_PRESETS),
            fusionWindowMs: 6000, // Time window for auto-fusion
            ...config
        };

        // Services
        this.promptGenerator = new PromptGenerator(logger, config.customPrompts);
        this.siliconFlowService = new SiliconFlowService(logger, config.siliconFlowApiKey);
        
        // DALL-E fallback (from craftingService)
        this.dalleService = null;

        // Fusion cache (in-memory for quick lookups)
        // Key: fusionKey, Value: itemId
        this.fusionCache = new Map();

        // Processing queue
        this.queue = [];
        this.isProcessing = false;
        this.maxConcurrent = 1;

        // Statistics
        this.stats = {
            totalFusions: 0,
            manualFusions: 0,
            autoFusions: 0,
            cacheHits: 0,
            siliconFlowGenerations: 0,
            dalleGenerations: 0,
            failedFusions: 0
        };
    }

    /**
     * Set DALL-E service for fallback
     * @param {Object} dalleService - DALL-E capable crafting service
     */
    setDalleService(dalleService) {
        this.dalleService = dalleService;
    }

    /**
     * Update configuration
     * @param {Object} config - New configuration
     */
    updateConfig(config) {
        Object.assign(this.config, config);

        if (config.siliconFlowApiKey) {
            this.siliconFlowService.setApiKey(config.siliconFlowApiKey);
        }
        
        if (config.customPrompts) {
            this.promptGenerator.updateCustomPrompts(config.customPrompts);
        }
        
        this.logger.info('[FUSION SERVICE] Configuration updated');
    }

    /**
     * Get current configuration (safe for UI - no API keys)
     * @returns {Object} Safe configuration
     */
    getConfig() {
        return {
            enabled: this.config.enabled,
            autoFusionEnabled: this.config.autoFusionEnabled,
            preferredGenerator: this.config.preferredGenerator,
            defaultStyle: this.config.defaultStyle,
            allowedStyles: this.config.allowedStyles,
            fusionWindowMs: this.config.fusionWindowMs,
            hasSiliconFlowKey: this.siliconFlowService.hasApiKey(),
            hasDalleKey: !!this.dalleService?.apiKey
        };
    }

    /**
     * Perform manual fusion of two items
     * Called from UI when user selects two items and clicks "Fusionieren"
     * 
     * @param {Object} itemA - First item
     * @param {Object} itemB - Second item
     * @param {string} userId - User performing fusion
     * @param {Object} options - Fusion options
     * @returns {Promise<Object>} Fusion result
     */
    async performManualFusion(itemA, itemB, userId, options = {}) {
        const {
            style = this.config.defaultStyle,
            tier = 1
        } = options;

        this.logger.info(`[FUSION SERVICE] Manual fusion requested: ${itemA.name} + ${itemB.name} by ${userId}`);
        
        return this.performFusion(itemA, itemB, userId, {
            ...options,
            style,
            tier,
            isManual: true
        });
    }

    /**
     * Perform automatic fusion
     * Called when auto-fusion is triggered by gift events
     * 
     * @param {Object} itemA - First item
     * @param {Object} itemB - Second item
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Fusion result
     */
    async performAutoFusion(itemA, itemB, userId) {
        if (!this.config.autoFusionEnabled) {
            return {
                success: false,
                error: 'auto_fusion_disabled'
            };
        }

        this.logger.info(`[FUSION SERVICE] Auto fusion triggered: ${itemA.name} + ${itemB.name} for ${userId}`);
        
        return this.performFusion(itemA, itemB, userId, {
            style: this.config.defaultStyle,
            tier: 1,
            isManual: false
        });
    }

    /**
     * Core fusion logic
     * @private
     */
    async performFusion(itemA, itemB, userId, options = {}) {
        const {
            style = this.config.defaultStyle,
            tier = 1,
            isManual = false
        } = options;

        // Validation
        if (!itemA || !itemB) {
            return { success: false, error: 'missing_items' };
        }

        if (itemA.itemId === itemB.itemId) {
            return { success: false, error: 'same_item_fusion_not_allowed' };
        }

        if (!this.config.allowedStyles.includes(style)) {
            return { success: false, error: 'invalid_style' };
        }

        this.stats.totalFusions++;
        if (isManual) {
            this.stats.manualFusions++;
        } else {
            this.stats.autoFusions++;
        }

        try {
            // Generate fusion key for caching
            const fusionKey = this.promptGenerator.generateFusionKey(
                itemA.itemId,
                itemB.itemId,
                style,
                { tier }
            );

            // Check cache first
            const cachedResult = await this.checkCache(fusionKey);
            if (cachedResult) {
                this.stats.cacheHits++;
                this.logger.info(`[FUSION SERVICE] Cache hit for fusion key: ${fusionKey}`);
                return {
                    success: true,
                    item: cachedResult,
                    fromCache: true,
                    fusionKey
                };
            }

            // Generate prompt
            const rarityInfo = this.calculateFusionRarity(itemA, itemB);
            const promptResult = this.promptGenerator.generateFusionPrompt(
                itemA,
                itemB,
                style,
                {
                    rarity: rarityInfo.name,
                    rarityColor: rarityInfo.color,
                    auraEffect: rarityInfo.auraEffect
                }
            );

            // Generate image
            let imageURL;
            try {
                imageURL = await this.generateFusionImage(itemA, itemB, promptResult);
            } catch (imageError) {
                this.logger.error(`[FUSION SERVICE] Image generation failed: ${imageError.message}`);
                // Continue with placeholder
                imageURL = this.getPlaceholderImage(rarityInfo.name);
            }

            // Create fusion item
            const fusionItem = {
                itemId: randomUUID(),
                fusionKey,
                name: this.generateFusionName(itemA, itemB, rarityInfo.name),
                parentItems: [itemA.itemId, itemB.itemId].sort(),
                rarity: rarityInfo.name,
                tier: tier,
                style: style,
                imageURL,
                isCrafted: true,
                isFusion: true,
                coinValue: (itemA.coinValue || 0) + (itemB.coinValue || 0),
                createdAt: new Date().toISOString(),
                createdBy: userId
            };

            // Save to database
            await this.db.saveItem(fusionItem);

            // Update cache
            this.fusionCache.set(fusionKey, fusionItem.itemId);

            // Also save fusion mapping to DB for persistence
            await this.saveFusionMapping(fusionKey, fusionItem.itemId);

            this.logger.info(`[FUSION SERVICE] Fusion complete: ${fusionItem.name} (${fusionItem.itemId})`);

            return {
                success: true,
                item: fusionItem,
                fromCache: false,
                fusionKey,
                prompt: promptResult.prompt
            };

        } catch (error) {
            this.stats.failedFusions++;
            this.logger.error(`[FUSION SERVICE] Fusion failed: ${error.message}`);
            return {
                success: false,
                error: 'fusion_failed',
                message: error.message
            };
        }
    }

    /**
     * Generate fusion image using available services
     * Priority order based on config.preferredGenerator:
     * 1. Preferred generator (siliconflow, lightx, or dalle)
     * 2. Fallback to other available generators
     * @private
     */
    async generateFusionImage(itemA, itemB, promptResult) {
        const prompt = promptResult.prompt;
        const negativePrompt = promptResult.negativePrompt;
        const preferredGenerator = this.config.preferredGenerator || 'siliconflow';

        // Define generator attempts in priority order
        const generators = this.getGeneratorPriorityOrder(preferredGenerator);

        for (const generator of generators) {
            try {
                switch (generator) {
                    case 'siliconflow':
                        if (this.siliconFlowService.hasApiKey()) {
                            this.logger.info('[FUSION SERVICE] Attempting Silicon Flow (FLUX.1-schnell) generation');
                            const imageURL = await this.siliconFlowService.generateFusionImage(
                                itemA,
                                itemB,
                                prompt,
                                { negativePrompt }
                            );
                            this.stats.siliconFlowGenerations++;
                            return imageURL;
                        }
                        break;

                    case 'dalle':
                        if (this.dalleService) {
                            this.logger.info('[FUSION SERVICE] Using DALL-E for generation');
                            const imageURL = await this.dalleService.queueAIGeneration(prompt);
                            this.stats.dalleGenerations++;
                            return imageURL;
                        }
                        break;
                }
            } catch (error) {
                this.logger.warn(`[FUSION SERVICE] ${generator} failed: ${error.message}, trying next generator`);
            }
        }

        throw new Error('No image generation service available or all generators failed');
    }

    /**
     * Get generator priority order based on preferred generator
     * @private
     */
    getGeneratorPriorityOrder(preferred) {
        const allGenerators = ['siliconflow', 'dalle'];
        
        // Move preferred to front
        return [preferred, ...allGenerators.filter(g => g !== preferred)];
    }

    /**
     * Check fusion cache for existing result
     * @private
     */
    async checkCache(fusionKey) {
        // Check in-memory cache first
        if (this.fusionCache.has(fusionKey)) {
            const itemId = this.fusionCache.get(fusionKey);
            const item = await this.db.getItemById(itemId);
            if (item) {
                return item;
            }
            // Item was deleted, remove from cache
            this.fusionCache.delete(fusionKey);
        }

        // Check database
        const mapping = await this.db.getFusionMapping(fusionKey);
        if (mapping) {
            const item = await this.db.getItemById(mapping.itemId);
            if (item) {
                // Restore to in-memory cache
                this.fusionCache.set(fusionKey, item.itemId);
                return item;
            }
        }

        return null;
    }

    /**
     * Save fusion key mapping to database
     * @private
     */
    async saveFusionMapping(fusionKey, itemId) {
        try {
            await this.db.saveFusionMapping(fusionKey, itemId);
        } catch (error) {
            this.logger.warn(`[FUSION SERVICE] Failed to save fusion mapping: ${error.message}`);
        }
    }

    /**
     * Calculate rarity for fusion based on parent items
     * @private
     */
    calculateFusionRarity(itemA, itemB) {
        const totalCoins = (itemA.coinValue || 0) + (itemB.coinValue || 0);
        
        const RARITY_TIERS = {
            MYTHIC: { min: 5000, name: 'Mythic', color: '#9370DB', auraEffect: 'arcane magical aura' },
            LEGENDARY: { min: 1000, name: 'Legendary', color: '#FFD700', auraEffect: 'warm heavy glow' },
            RARE: { min: 100, name: 'Rare', color: '#C0C0C0', auraEffect: 'frost glow' },
            COMMON: { min: 0, name: 'Common', color: '#CD7F32', auraEffect: 'warm glow' }
        };

        if (totalCoins >= RARITY_TIERS.MYTHIC.min) return RARITY_TIERS.MYTHIC;
        if (totalCoins >= RARITY_TIERS.LEGENDARY.min) return RARITY_TIERS.LEGENDARY;
        if (totalCoins >= RARITY_TIERS.RARE.min) return RARITY_TIERS.RARE;
        return RARITY_TIERS.COMMON;
    }

    /**
     * Generate name for fusion item
     * @private
     */
    generateFusionName(itemA, itemB, rarity) {
        const cleanA = (itemA.name || 'Unknown').replace(/^Essence of /i, '').trim();
        const cleanB = (itemB.name || 'Unknown').replace(/^Essence of /i, '').trim();

        const prefixes = {
            'Common': ['Fused', 'Combined', 'Merged'],
            'Rare': ['Enhanced', 'Refined', 'Empowered'],
            'Legendary': ['Legendary', 'Exalted', 'Supreme'],
            'Mythic': ['Mythic', 'Divine', 'Transcendent']
        };

        const prefixList = prefixes[rarity] || prefixes.Common;
        // Use deterministic selection based on item names for caching consistency
        const combinedHash = (cleanA + cleanB).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const prefix = prefixList[combinedHash % prefixList.length];

        return `${prefix} ${cleanA}-${cleanB} Relic`;
    }

    /**
     * Get placeholder image for when generation fails
     * @private
     */
    getPlaceholderImage(rarity) {
        const colors = {
            'Common': '#CD7F32',
            'Rare': '#C0C0C0',
            'Legendary': '#FFD700',
            'Mythic': '#9370DB'
        };

        const color = colors[rarity] || colors.Common;
        
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
            <defs>
                <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" style="stop-color:${color};stop-opacity:0.8"/>
                    <stop offset="100%" style="stop-color:${color};stop-opacity:0.2"/>
                </radialGradient>
            </defs>
            <rect fill="url(#glow)" width="256" height="256"/>
            <circle cx="128" cy="128" r="60" fill="${color}" opacity="0.8"/>
            <text x="128" y="140" font-family="Arial" font-size="20" fill="white" text-anchor="middle">⚗️</text>
            <text x="128" y="220" font-family="Arial" font-size="16" fill="${color}" text-anchor="middle">${rarity}</text>
        </svg>`;

        return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    }

    /**
     * Get available styles
     * @returns {Array} Style options
     */
    getStyles() {
        return this.promptGenerator.getStylePresets();
    }

    /**
     * Get service statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.fusionCache.size,
            queueLength: this.queue.length,
            siliconFlowStats: this.siliconFlowService.getStats()
        };
    }

    /**
     * Clear fusion cache
     * @returns {number} Number of entries cleared
     */
    clearCache() {
        const size = this.fusionCache.size;
        this.fusionCache.clear();
        this.logger.info(`[FUSION SERVICE] Cache cleared (${size} entries)`);
        return size;
    }

    /**
     * Clean up resources
     */
    async destroy() {
        this.fusionCache.clear();
        await this.siliconFlowService.destroy();
        this.logger.info('[FUSION SERVICE] Service destroyed');
    }
}

module.exports = FusionService;
