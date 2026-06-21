/**
 * StreamAlchemy Tier System
 * 
 * Handles item tiers, frames, and upgrade mechanics.
 * 
 * Features:
 * - Configurable tier levels with frames/borders
 * - Item upgrade system (X items → higher tier)
 * - Custom frame support (color or PNG/GIF upload)
 * - Frame overlay generation
 */

const path = require('path');
const fs = require('fs').promises;
const { randomUUID } = require('crypto');

/**
 * Default tier configuration
 */
const DEFAULT_TIER_CONFIG = {
    enabled: true,
    tiers: [
        {
            level: 1,
            name: 'Bronze',
            color: '#CD7F32',
            glowColor: 'rgba(205, 127, 50, 0.6)',
            itemsToUpgrade: 3, // Items needed to upgrade to next tier
            frameType: 'color', // 'color' or 'custom'
            customFrame: null // Path to custom frame image
        },
        {
            level: 2,
            name: 'Silver',
            color: '#C0C0C0',
            glowColor: 'rgba(192, 192, 192, 0.8)',
            itemsToUpgrade: 5,
            frameType: 'color',
            customFrame: null
        },
        {
            level: 3,
            name: 'Gold',
            color: '#FFD700',
            glowColor: 'rgba(255, 215, 0, 0.9)',
            itemsToUpgrade: 7,
            frameType: 'color',
            customFrame: null
        },
        {
            level: 4,
            name: 'Platinum',
            color: '#E5E4E2',
            glowColor: 'rgba(229, 228, 226, 0.9)',
            itemsToUpgrade: 10,
            frameType: 'color',
            customFrame: null
        },
        {
            level: 5,
            name: 'Diamond',
            color: '#B9F2FF',
            glowColor: 'rgba(185, 242, 255, 1.0)',
            itemsToUpgrade: null, // Max tier - no upgrade
            frameType: 'color',
            customFrame: null
        }
    ]
};

class TierSystem {
    /**
     * @param {Object} db - Database instance
     * @param {Object} logger - Logger instance
     * @param {string} dataDir - Directory for storing custom frames
     */
    constructor(db, logger, dataDir) {
        this.db = db;
        this.logger = logger;
        this.dataDir = dataDir;
        this.framesDir = path.join(dataDir, 'frames');
        this.config = { ...DEFAULT_TIER_CONFIG };
    }

    /**
     * Initialize tier system
     */
    async init() {
        // Ensure frames directory exists
        try {
            await fs.mkdir(this.framesDir, { recursive: true });
            this.logger.info('[TIER SYSTEM] Frames directory initialized');
        } catch (error) {
            this.logger.warn(`[TIER SYSTEM] Could not create frames directory: ${error.message}`);
        }
    }

    /**
     * Update tier configuration
     * @param {Object} config - New configuration
     */
    updateConfig(config) {
        if (config.enabled !== undefined) {
            this.config.enabled = config.enabled;
        }
        if (config.tiers && Array.isArray(config.tiers)) {
            this.config.tiers = config.tiers;
        }
        this.logger.info('[TIER SYSTEM] Configuration updated');
    }

    /**
     * Get current configuration
     * @returns {Object} Current tier configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Get tier info by level
     * @param {number} level - Tier level (1-based)
     * @returns {Object|null} Tier info or null
     */
    getTier(level) {
        return this.config.tiers.find(t => t.level === level) || null;
    }

    /**
     * Get max tier level
     * @returns {number} Maximum tier level
     */
    getMaxTier() {
        return Math.max(...this.config.tiers.map(t => t.level));
    }

    /**
     * Check if an item can be upgraded based on user's inventory
     * 
     * @param {string} userId - User ID
     * @param {string} itemId - Item ID to check
     * @param {number} currentTier - Current tier level of the item
     * @returns {Object} Upgrade check result
     */
    async checkUpgradeEligibility(userId, itemId, currentTier = 1) {
        if (!this.config.enabled) {
            return { eligible: false, reason: 'tier_system_disabled' };
        }

        const tier = this.getTier(currentTier);
        if (!tier) {
            return { eligible: false, reason: 'invalid_tier' };
        }

        // Max tier - can't upgrade further
        if (tier.itemsToUpgrade === null) {
            return { eligible: false, reason: 'max_tier_reached' };
        }

        // Get user's item quantity
        const userItem = await this.db.getUserItem(userId, itemId);
        if (!userItem) {
            return { eligible: false, reason: 'item_not_found' };
        }

        const quantity = userItem.quantity || 0;
        const required = tier.itemsToUpgrade;

        if (quantity >= required) {
            const nextTier = this.getTier(currentTier + 1);
            return {
                eligible: true,
                currentQuantity: quantity,
                requiredQuantity: required,
                currentTier: currentTier,
                nextTier: currentTier + 1,
                nextTierName: nextTier?.name || 'Unknown'
            };
        }

        return {
            eligible: false,
            reason: 'insufficient_items',
            currentQuantity: quantity,
            requiredQuantity: required,
            remaining: required - quantity
        };
    }

    /**
     * Perform item upgrade
     * Consumes X items of current tier, creates 1 item of next tier
     * 
     * @param {string} userId - User ID
     * @param {Object} item - Item to upgrade
     * @returns {Object} Upgrade result
     */
    async performUpgrade(userId, item) {
        const currentTier = item.tier || 1;
        const eligibility = await this.checkUpgradeEligibility(userId, item.itemId, currentTier);

        if (!eligibility.eligible) {
            return {
                success: false,
                error: eligibility.reason,
                details: eligibility
            };
        }

        const tier = this.getTier(currentTier);
        const nextTier = this.getTier(currentTier + 1);

        if (!nextTier) {
            return {
                success: false,
                error: 'next_tier_not_found'
            };
        }

        try {
            // Deduct items from user inventory
            const itemsToRemove = tier.itemsToUpgrade;
            await this.db.updateUserInventory(userId, item.itemId, -itemsToRemove);

            // Create upgraded item
            const upgradedItem = await this.createUpgradedItem(item, nextTier.level);

            // Add upgraded item to user inventory
            await this.db.updateUserInventory(userId, upgradedItem.itemId, 1);

            this.logger.info(`[TIER SYSTEM] Upgraded ${item.name} from tier ${currentTier} to ${nextTier.level} for user ${userId}`);

            return {
                success: true,
                previousItem: item,
                upgradedItem,
                itemsConsumed: itemsToRemove,
                previousTier: currentTier,
                newTier: nextTier.level,
                newTierName: nextTier.name
            };
        } catch (error) {
            this.logger.error(`[TIER SYSTEM] Upgrade failed: ${error.message}`);
            return {
                success: false,
                error: 'upgrade_failed',
                message: error.message
            };
        }
    }

    /**
     * Create an upgraded version of an item
     * @param {Object} originalItem - Original item
     * @param {number} newTier - New tier level
     * @returns {Object} Upgraded item
     */
    async createUpgradedItem(originalItem, newTier) {
        const tierInfo = this.getTier(newTier);

        // Check if upgraded version already exists
        const existingUpgraded = await this.db.getUpgradedItem(originalItem.itemId, newTier);
        if (existingUpgraded) {
            return existingUpgraded;
        }

        // Create new upgraded item
        const upgradedItem = {
            itemId: randomUUID(),
            originalItemId: originalItem.itemId,
            name: `${tierInfo.name} ${originalItem.name}`,
            tier: newTier,
            tierName: tierInfo.name,
            tierColor: tierInfo.color,
            rarity: originalItem.rarity,
            imageURL: originalItem.imageURL, // Same image, frame applied in overlay
            frameColor: tierInfo.color,
            frameGlow: tierInfo.glowColor,
            frameType: tierInfo.frameType,
            customFrame: tierInfo.customFrame,
            isCrafted: originalItem.isCrafted,
            isUpgraded: true,
            coinValue: originalItem.coinValue * newTier, // Scale value by tier
            parentItems: originalItem.parentItems,
            createdAt: new Date().toISOString()
        };

        // Save to database
        await this.db.saveItem(upgradedItem);

        return upgradedItem;
    }

    /**
     * Get frame CSS/styling for an item based on tier
     * @param {Object} item - Item object
     * @returns {Object} Frame styling information
     */
    getFrameStyle(item) {
        const tier = item.tier || 1;
        const tierInfo = this.getTier(tier);

        if (!tierInfo) {
            return {
                type: 'none',
                style: {}
            };
        }

        if (tierInfo.frameType === 'custom' && tierInfo.customFrame) {
            return {
                type: 'custom',
                frameUrl: tierInfo.customFrame,
                tierName: tierInfo.name,
                tierLevel: tier
            };
        }

        return {
            type: 'color',
            color: tierInfo.color,
            glowColor: tierInfo.glowColor,
            tierName: tierInfo.name,
            tierLevel: tier,
            style: {
                border: `3px solid ${tierInfo.color}`,
                boxShadow: `0 0 10px ${tierInfo.glowColor}, inset 0 0 5px ${tierInfo.glowColor}`,
                borderRadius: '8px'
            }
        };
    }

    /**
     * Upload custom frame image
     * @param {number} tierLevel - Tier level for the frame
     * @param {Buffer} fileBuffer - File buffer
     * @param {string} filename - Original filename
     * @returns {Object} Upload result
     */
    async uploadCustomFrame(tierLevel, fileBuffer, filename) {
        const tier = this.getTier(tierLevel);
        if (!tier) {
            return { success: false, error: 'invalid_tier' };
        }

        // Validate file type
        const ext = path.extname(filename).toLowerCase();
        if (!['.png', '.gif'].includes(ext)) {
            return { success: false, error: 'invalid_file_type' };
        }

        // Generate filename
        const safeFilename = `tier_${tierLevel}_frame${ext}`;
        const filePath = path.join(this.framesDir, safeFilename);

        try {
            await fs.writeFile(filePath, fileBuffer);

            // Update tier config
            tier.frameType = 'custom';
            tier.customFrame = `/streamalchemy/frames/${safeFilename}`;

            this.logger.info(`[TIER SYSTEM] Custom frame uploaded for tier ${tierLevel}`);

            return {
                success: true,
                framePath: tier.customFrame,
                tier: tierLevel
            };
        } catch (error) {
            this.logger.error(`[TIER SYSTEM] Frame upload failed: ${error.message}`);
            return { success: false, error: 'upload_failed' };
        }
    }

    /**
     * Remove custom frame and revert to color
     * @param {number} tierLevel - Tier level
     * @returns {Object} Result
     */
    async removeCustomFrame(tierLevel) {
        const tier = this.getTier(tierLevel);
        if (!tier) {
            return { success: false, error: 'invalid_tier' };
        }

        if (tier.customFrame) {
            const filePath = path.join(this.dataDir, tier.customFrame.replace('/streamalchemy/', ''));
            try {
                await fs.unlink(filePath);
            } catch (error) {
                // File might not exist, ignore
            }
        }

        tier.frameType = 'color';
        tier.customFrame = null;

        this.logger.info(`[TIER SYSTEM] Custom frame removed for tier ${tierLevel}`);
        return { success: true };
    }

    /**
     * Generate overlay HTML for item with frame
     * @param {Object} item - Item object
     * @returns {string} HTML string for overlay
     */
    generateFrameOverlayHTML(item) {
        const frameStyle = this.getFrameStyle(item);
        const tierInfo = this.getTier(item.tier || 1);

        if (frameStyle.type === 'custom' && frameStyle.frameUrl) {
            return `
                <div class="item-frame-container tier-${item.tier || 1}">
                    <img src="${item.imageURL}" class="item-image" alt="${item.name}">
                    <img src="${frameStyle.frameUrl}" class="item-frame custom-frame" alt="Frame">
                    <div class="tier-badge" style="background: ${tierInfo?.color || '#CD7F32'}">${tierInfo?.name || 'Bronze'}</div>
                </div>
            `;
        }

        // Color-based frame
        const styleStr = Object.entries(frameStyle.style || {})
            .map(([key, value]) => `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value}`)
            .join('; ');

        return `
            <div class="item-frame-container tier-${item.tier || 1}" style="${styleStr}">
                <img src="${item.imageURL}" class="item-image" alt="${item.name}">
                <div class="tier-badge" style="background: ${tierInfo?.color || '#CD7F32'}">${tierInfo?.name || 'Bronze'}</div>
            </div>
        `;
    }

    /**
     * Check if auto-upgrade should be performed
     * Called after item is added to inventory
     * 
     * @param {string} userId - User ID
     * @param {Object} item - Item added
     * @returns {Object|null} Upgrade result if upgrade performed, null otherwise
     */
    async checkAutoUpgrade(userId, item) {
        if (!this.config.enabled) {
            return null;
        }

        const currentTier = item.tier || 1;
        const eligibility = await this.checkUpgradeEligibility(userId, item.itemId, currentTier);

        if (eligibility.eligible) {
            return await this.performUpgrade(userId, item);
        }

        return null;
    }

    /**
     * Get upgrade progress for an item
     * @param {string} userId - User ID
     * @param {string} itemId - Item ID
     * @param {number} currentTier - Current tier
     * @returns {Object} Progress information
     */
    async getUpgradeProgress(userId, itemId, currentTier = 1) {
        const tier = this.getTier(currentTier);
        if (!tier || tier.itemsToUpgrade === null) {
            return {
                isMaxTier: tier?.itemsToUpgrade === null,
                currentTier,
                progress: 0,
                current: 0,
                required: 0
            };
        }

        const userItem = await this.db.getUserItem(userId, itemId);
        const quantity = userItem?.quantity || 0;
        const required = tier.itemsToUpgrade;
        const progress = Math.min(100, Math.round((quantity / required) * 100));

        return {
            isMaxTier: false,
            currentTier,
            nextTier: currentTier + 1,
            nextTierName: this.getTier(currentTier + 1)?.name || 'Unknown',
            current: quantity,
            required,
            remaining: Math.max(0, required - quantity),
            progress
        };
    }
}

module.exports = TierSystem;
module.exports.DEFAULT_TIER_CONFIG = DEFAULT_TIER_CONFIG;
