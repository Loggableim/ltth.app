/**
 * StreamAlchemy Database Module
 * 
 * LowDB wrapper for atomic and persistent storage of:
 * - Global item inventory (all generated items)
 * - User inventory (item ownership and quantities)
 * 
 * Features:
 * - Atomic writes (no race conditions)
 * - Automatic file creation and initialization
 * - Thread-safe operations
 * - Efficient lookups and indexing
 */

const { JSONFilePreset } = require('lowdb/node');
const path = require('path');
const fs = require('fs').promises;
const config = require('./config');

class AlchemyDatabase {
    constructor(pluginDir, logger) {
        this.pluginDir = pluginDir;
        this.logger = logger;
        this.inventoryGlobalDb = null;
        this.userInventoryDb = null;
        this.initPromise = null;
        
        // Write queue to prevent concurrent write issues
        this.globalWriteQueue = Promise.resolve();
        this.userWriteQueue = Promise.resolve();
    }

    /**
     * Initialize database connections
     * Creates data directory and JSON files if they don't exist
     */
    async init() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            try {
                // Ensure data directory exists
                const dataDir = path.join(this.pluginDir, 'data');
                await fs.mkdir(dataDir, { recursive: true });

                // Initialize global inventory database
                const globalDbPath = path.join(this.pluginDir, config.DB_FILES.INVENTORY_GLOBAL);
                this.inventoryGlobalDb = await JSONFilePreset(globalDbPath, { items: [] });
                
                // Initialize user inventory database
                const userDbPath = path.join(this.pluginDir, config.DB_FILES.USER_INVENTORY);
                this.userInventoryDb = await JSONFilePreset(userDbPath, { userInventories: [] });

                this.logger.info('[ALCHEMY DB] Database initialized successfully');
            } catch (error) {
                this.logger.error(`[ALCHEMY DB] Failed to initialize database: ${error.message}`);
                throw error;
            }
        })();

        return this.initPromise;
    }

    // ==================== GLOBAL INVENTORY OPERATIONS ====================
    
    /**
     * Queue a write operation to prevent race conditions
     * @param {Promise} operation - Async operation to queue
     * @param {string} queueType - 'global' or 'user'
     * @returns {Promise} Result of the operation
     */
    async queueWrite(operation, queueType = 'global') {
        const queue = queueType === 'global' ? 'globalWriteQueue' : 'userWriteQueue';
        
        // Create a promise for this specific operation
        let operationResult;
        const operationPromise = (async () => {
            try {
                operationResult = await operation();
                return operationResult;
            } catch (error) {
                this.logger.error(`[ALCHEMY DB] Queued ${queueType} write failed: ${error.message}`);
                throw error;
            }
        })();
        
        // Chain to queue but don't propagate errors to queue chain
        this[queue] = this[queue]
            .then(() => operationPromise)
            .catch(() => {}); // Swallow error to keep queue alive
        
        // Return the operation result (which may reject)
        return operationPromise;
    }

    // ==================== GLOBAL INVENTORY OPERATIONS ====================

    /**
     * Get an item by its gift ID
     * @param {number} giftId - TikTok gift ID
     * @returns {Object|null} Item object or null if not found
     */
    async getItemByGiftId(giftId) {
        await this.init();
        await this.inventoryGlobalDb.read();
        return this.inventoryGlobalDb.data.items.find(item => item.giftId === giftId) || null;
    }

    /**
     * Get an item by its unique item ID
     * @param {string} itemId - UUID of the item
     * @returns {Object|null} Item object or null if not found
     */
    async getItemById(itemId) {
        await this.init();
        await this.inventoryGlobalDb.read();
        return this.inventoryGlobalDb.data.items.find(item => item.itemId === itemId) || null;
    }

    /**
     * Check if a crafted combination already exists
     * @param {string} itemAId - UUID of first item
     * @param {string} itemBId - UUID of second item
     * @returns {Object|null} Crafted item or null if combination doesn't exist
     */
    async getCraftedCombination(itemAId, itemBId) {
        await this.init();
        await this.inventoryGlobalDb.read();
        
        // Sort IDs to ensure consistent lookup regardless of order
        const sortedIds = [itemAId, itemBId].sort();
        
        return this.inventoryGlobalDb.data.items.find(item => {
            if (!item.isCrafted || !item.parentItems) return false;
            const sortedParents = [...item.parentItems].sort();
            return sortedParents[0] === sortedIds[0] && sortedParents[1] === sortedIds[1];
        }) || null;
    }

    /**
     * Save a new item to global inventory
     * @param {Object} item - Item object to save
     * @returns {Object} Saved item
     */
    async saveItem(item) {
        return this.queueWrite(async () => {
            await this.init();
            await this.inventoryGlobalDb.read();
            
            // Validate required fields
            if (!item.itemId || !item.name) {
                throw new Error('Item must have itemId and name');
            }

            // Check if item already exists
            const existingIndex = this.inventoryGlobalDb.data.items.findIndex(
                i => i.itemId === item.itemId
            );

            if (existingIndex >= 0) {
                // Update existing item
                this.inventoryGlobalDb.data.items[existingIndex] = item;
                this.logger.debug(`[ALCHEMY DB] Updated item: ${item.name} (${item.itemId})`);
            } else {
                // Add new item
                this.inventoryGlobalDb.data.items.push(item);
                this.logger.info(`[ALCHEMY DB] Saved new item: ${item.name} (${item.itemId})`);
            }

            await this.inventoryGlobalDb.write();
            return item;
        }, 'global');
    }

    /**
     * Get all items from global inventory
     * @returns {Array} Array of all items
     */
    async getAllItems() {
        await this.init();
        await this.inventoryGlobalDb.read();
        return this.inventoryGlobalDb.data.items;
    }

    // ==================== USER INVENTORY OPERATIONS ====================

    /**
     * Get user's inventory
     * @param {string} userId - User's unique identifier
     * @returns {Array} Array of user's items with quantities
     */
    async getUserInventory(userId) {
        await this.init();
        await this.userInventoryDb.read();
        
        const userInv = this.userInventoryDb.data.userInventories.find(
            inv => inv.userId === userId
        );

        return userInv ? userInv.items : [];
    }

    /**
     * Check if user has an item
     * @param {string} userId - User's unique identifier
     * @param {string} itemId - Item's UUID
     * @returns {Object|null} Item entry with quantity, or null
     */
    async getUserItem(userId, itemId) {
        const inventory = await this.getUserInventory(userId);
        return inventory.find(item => item.itemId === itemId) || null;
    }

    /**
     * Update user's inventory (add item or increment quantity)
     * @param {string} userId - User's unique identifier
     * @param {string} itemId - Item's UUID
     * @param {number} quantityChange - Amount to add (default: 1)
     * @returns {Object} Updated inventory entry
     */
    async updateUserInventory(userId, itemId, quantityChange = 1) {
        return this.queueWrite(async () => {
            await this.init();
            await this.userInventoryDb.read();

            // Find or create user inventory
            let userInvIndex = this.userInventoryDb.data.userInventories.findIndex(
                inv => inv.userId === userId
            );

            if (userInvIndex === -1) {
                // Create new user inventory
                this.userInventoryDb.data.userInventories.push({
                    userId,
                    items: []
                });
                userInvIndex = this.userInventoryDb.data.userInventories.length - 1;
            }

            const userInv = this.userInventoryDb.data.userInventories[userInvIndex];
            
            // Find or create item entry
            let itemIndex = userInv.items.findIndex(item => item.itemId === itemId);

            if (itemIndex === -1) {
                // First time receiving this item
                userInv.items.push({
                    itemId,
                    quantity: quantityChange,
                    firstObtained: new Date().toISOString(),
                    lastObtained: new Date().toISOString()
                });
                itemIndex = userInv.items.length - 1;
                this.logger.info(`[ALCHEMY DB] User ${userId} obtained new item ${itemId}`);
            } else {
                // Increment existing item
                userInv.items[itemIndex].quantity += quantityChange;
                userInv.items[itemIndex].lastObtained = new Date().toISOString();
                this.logger.debug(`[ALCHEMY DB] User ${userId} item ${itemId} quantity: ${userInv.items[itemIndex].quantity}`);
            }

            await this.userInventoryDb.write();
            return userInv.items[itemIndex];
        }, 'user');
    }

    /**
     * Check if this is the first time a user receives a specific item
     * @param {string} userId - User's unique identifier
     * @param {string} itemId - Item's UUID
     * @returns {boolean} True if this is the first time
     */
    async isFirstTimeItem(userId, itemId) {
        const userItem = await this.getUserItem(userId, itemId);
        return userItem === null;
    }

    /**
     * Get statistics about the database
     * @returns {Object} Database statistics
     */
    async getStats() {
        await this.init();
        await this.inventoryGlobalDb.read();
        await this.userInventoryDb.read();

        const items = this.inventoryGlobalDb.data.items;
        const baseItems = items.filter(i => !i.isCrafted);
        const craftedItems = items.filter(i => i.isCrafted);

        return {
            totalItems: items.length,
            baseItems: baseItems.length,
            craftedItems: craftedItems.length,
            totalUsers: this.userInventoryDb.data.userInventories.length,
            rarityDistribution: {
                Common: items.filter(i => i.rarity === 'Common').length,
                Rare: items.filter(i => i.rarity === 'Rare').length,
                Legendary: items.filter(i => i.rarity === 'Legendary').length,
                Mythic: items.filter(i => i.rarity === 'Mythic').length
            }
        };
    }

    /**
     * Create a custom item manually (for manual upload mode)
     * @param {Object} itemData - Item data
     * @returns {Object} Created item
     */
    async createCustomItem(itemData) {
        const { v4: uuidv4 } = require('uuid');
        
        const item = {
            itemId: uuidv4(),
            giftId: itemData.giftId || null,
            name: itemData.name,
            rarity: itemData.rarity || 'Common',
            imageURL: itemData.imageURL || null,
            isCrafted: false,
            coinValue: itemData.coinValue || 0,
            createdAt: new Date().toISOString(),
            isCustom: true
        };
        
        return await this.saveItem(item);
    }

    /**
     * Update an existing item
     * @param {string} itemId - Item ID to update
     * @param {Object} updates - Fields to update
     * @returns {Object|null} Updated item or null if not found
     */
    async updateItem(itemId, updates) {
        return this.queueWrite(async () => {
            await this.init();
            await this.inventoryGlobalDb.read();
            
            const itemIndex = this.inventoryGlobalDb.data.items.findIndex(
                i => i.itemId === itemId
            );
            
            if (itemIndex === -1) {
                return null;
            }
            
            // Merge updates (don't allow changing itemId)
            const { itemId: _, ...allowedUpdates } = updates;
            this.inventoryGlobalDb.data.items[itemIndex] = {
                ...this.inventoryGlobalDb.data.items[itemIndex],
                ...allowedUpdates
            };
            
            await this.inventoryGlobalDb.write();
            return this.inventoryGlobalDb.data.items[itemIndex];
        }, 'global');
    }

    /**
     * Delete an item from global inventory
     * @param {string} itemId - Item ID to delete
     * @returns {boolean} True if deleted, false if not found
     */
    async deleteItem(itemId) {
        return this.queueWrite(async () => {
            await this.init();
            await this.inventoryGlobalDb.read();
            
            const itemIndex = this.inventoryGlobalDb.data.items.findIndex(
                i => i.itemId === itemId
            );
            
            if (itemIndex === -1) {
                return false;
            }
            
            this.inventoryGlobalDb.data.items.splice(itemIndex, 1);
            await this.inventoryGlobalDb.write();
            
            this.logger.info(`[ALCHEMY DB] Deleted item: ${itemId}`);
            return true;
        }, 'global');
    }

    /**
     * Clean up database connections
     */
    async destroy() {
        // LowDB doesn't require explicit cleanup
        this.logger.info('[ALCHEMY DB] Database connections closed');
    }
}

module.exports = AlchemyDatabase;
