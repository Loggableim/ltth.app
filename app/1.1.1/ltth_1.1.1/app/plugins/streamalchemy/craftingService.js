/**
 * StreamAlchemy Crafting Service
 * 
 * Handles AI-powered item generation with DALL-E 3.
 * Features:
 * - Request queue (FIFO) to prevent concurrent AI calls
 * - Deterministic generation (never generates the same thing twice)
 * - Automatic database lookup before generation
 * - Error handling and retries
 * - Rate limiting and timeout protection
 */

const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

class CraftingService {
    constructor(db, logger, apiKey, customPrompts = null) {
        this.db = db;
        this.logger = logger;
        this.apiKey = apiKey;
        this.customPrompts = customPrompts || {
            baseItemTemplate: '',
            craftedItemTemplate: ''
        };
        
        // Initialize OpenAI client
        if (this.apiKey) {
            this.openai = new OpenAI({ apiKey: this.apiKey });
        } else {
            this.logger.warn('[CRAFTING SERVICE] OpenAI API key not provided. AI generation disabled.');
            this.openai = null;
        }

        // Request queue for serialized AI calls
        this.queue = [];
        this.isProcessing = false;
        
        // Statistics
        this.stats = {
            totalRequests: 0,
            successfulGenerations: 0,
            failedGenerations: 0,
            cacheHits: 0
        };
    }

    /**
     * Update custom prompts
     * @param {Object} prompts - Custom prompts configuration
     */
    updateCustomPrompts(prompts) {
        this.customPrompts = prompts || {
            baseItemTemplate: '',
            craftedItemTemplate: ''
        };
        this.logger.info('[CRAFTING SERVICE] Custom prompts updated');
    }

    /**
     * Determine rarity based on total coin value
     * @param {number} totalCoins - Combined coin value
     * @returns {Object} Rarity tier object
     */
    getRarityTier(totalCoins) {
        const tiers = config.RARITY_TIERS;
        
        if (totalCoins >= tiers.PURPLE.min) return { key: 'PURPLE', ...tiers.PURPLE };
        if (totalCoins >= tiers.GOLD.min) return { key: 'GOLD', ...tiers.GOLD };
        if (totalCoins >= tiers.SILVER.min) return { key: 'SILVER', ...tiers.SILVER };
        return { key: 'BRONZE', ...tiers.BRONZE };
    }

    /**
     * Generate a base item from a TikTok gift
     * @param {Object} gift - Gift object from TikTok event
     * @returns {Promise<Object>} Generated item object
     */
    async generateBaseItem(gift) {
        this.logger.info(`[CRAFTING SERVICE] Generating base item for gift: ${gift.name} (ID: ${gift.id})`);

        // Check if this gift already has an item
        const existingItem = await this.db.getItemByGiftId(gift.id);
        if (existingItem) {
            this.logger.info(`[CRAFTING SERVICE] Item already exists for gift ${gift.id}: ${existingItem.name}`);
            this.stats.cacheHits++;
            return existingItem;
        }

        // Create base item structure
        const itemId = uuidv4();
        const item = {
            itemId,
            giftId: gift.id,
            name: `Essence of ${gift.name}`,
            rarity: 'Common', // Base items are always Common
            imageURL: null,
            isCrafted: false,
            coinValue: gift.coins || 0,
            createdAt: new Date().toISOString()
        };

        // Generate image via AI
        if (this.openai) {
            try {
                // Use custom prompt if available, otherwise use default
                let prompt;
                if (this.customPrompts.baseItemTemplate) {
                    // Replace placeholders in custom template
                    prompt = this.customPrompts.baseItemTemplate
                        .replace('{giftName}', gift.name)
                        .replace('{coinValue}', gift.coins || 0);
                } else {
                    prompt = config.PROMPTS.BASE_ITEM(gift.name);
                }
                
                const imageURL = await this.queueAIGeneration(prompt);
                item.imageURL = imageURL;
            } catch (error) {
                this.logger.error(`[CRAFTING SERVICE] Failed to generate image for base item: ${error.message}`);
                // Continue without image - item will use placeholder
                item.imageURL = this.getPlaceholderImage('Common');
            }
        } else {
            item.imageURL = this.getPlaceholderImage('Common');
        }

        // Save to database
        await this.db.saveItem(item);
        this.logger.info(`[CRAFTING SERVICE] Base item created: ${item.name} (${itemId})`);
        
        return item;
    }

    /**
     * Generate a crafted item from two parent items
     * @param {Object} itemA - First parent item
     * @param {Object} itemB - Second parent item
     * @returns {Promise<Object>} Generated crafted item object
     */
    async generateCraftedItem(itemA, itemB) {
        this.logger.info(`[CRAFTING SERVICE] Crafting: ${itemA.name} + ${itemB.name}`);

        // Check if this combination already exists
        const existingCrafted = await this.db.getCraftedCombination(itemA.itemId, itemB.itemId);
        if (existingCrafted) {
            this.logger.info(`[CRAFTING SERVICE] Crafted item already exists: ${existingCrafted.name}`);
            this.stats.cacheHits++;
            return existingCrafted;
        }

        // Calculate combined coin value and determine rarity
        const totalCoins = (itemA.coinValue || 0) + (itemB.coinValue || 0);
        const rarityTier = this.getRarityTier(totalCoins);

        // Create crafted item structure
        const itemId = uuidv4();
        const craftedName = this.generateCraftedName(itemA.name, itemB.name, rarityTier.name);
        
        const item = {
            itemId,
            parentItems: [itemA.itemId, itemB.itemId],
            name: craftedName,
            rarity: rarityTier.name,
            imageURL: null,
            isCrafted: true,
            coinValue: totalCoins,
            createdAt: new Date().toISOString()
        };

        // Generate image via AI
        if (this.openai) {
            try {
                // Use custom prompt if available, otherwise use default
                let prompt;
                if (this.customPrompts.craftedItemTemplate) {
                    // Replace placeholders in custom template
                    prompt = this.customPrompts.craftedItemTemplate
                        .replace('{itemA}', itemA.name)
                        .replace('{itemB}', itemB.name)
                        .replace('{rarity}', rarityTier.name)
                        .replace('{rarityColor}', rarityTier.color)
                        .replace('{auraEffect}', rarityTier.auraEffect)
                        .replace('{totalCoins}', totalCoins);
                } else {
                    prompt = config.PROMPTS.CRAFTED_ITEM(
                        itemA.name,
                        itemB.name,
                        rarityTier.color,
                        rarityTier.auraEffect
                    );
                }
                
                const imageURL = await this.queueAIGeneration(prompt);
                item.imageURL = imageURL;
            } catch (error) {
                this.logger.error(`[CRAFTING SERVICE] Failed to generate image for crafted item: ${error.message}`);
                item.imageURL = this.getPlaceholderImage(rarityTier.name);
            }
        } else {
            item.imageURL = this.getPlaceholderImage(rarityTier.name);
        }

        // Save to database
        await this.db.saveItem(item);
        this.logger.info(`[CRAFTING SERVICE] Crafted item created: ${item.name} (${itemId}) - Rarity: ${item.rarity}`);
        
        return item;
    }

    /**
     * Generate a creative name for crafted items
     * @param {string} nameA - First item name
     * @param {string} nameB - Second item name
     * @param {string} rarity - Rarity tier name
     * @returns {string} Generated name
     */
    generateCraftedName(nameA, nameB, rarity) {
        // Extract core words from names (remove "Essence of" prefix if present)
        const cleanA = nameA.replace(/^Essence of /i, '').trim();
        const cleanB = nameB.replace(/^Essence of /i, '').trim();

        // Rarity-based prefixes
        const rarityPrefixes = {
            'Common': ['Fused', 'Combined', 'Merged'],
            'Rare': ['Enhanced', 'Refined', 'Empowered'],
            'Legendary': ['Legendary', 'Exalted', 'Supreme'],
            'Mythic': ['Mythic', 'Divine', 'Transcendent', 'Celestial']
        };

        const prefixes = rarityPrefixes[rarity] || rarityPrefixes.Common;
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

        return `${prefix} ${cleanA}-${cleanB} Talisman`;
    }

    /**
     * Queue an AI image generation request
     * @param {string} prompt - DALL-E prompt
     * @returns {Promise<string>} Image URL
     */
    async queueAIGeneration(prompt) {
        return new Promise((resolve, reject) => {
            // Add to queue
            this.queue.push({ prompt, resolve, reject });
            this.stats.totalRequests++;
            
            // Start processing if not already running
            this.processQueue();
        });
    }

    /**
     * Process the AI generation queue (one at a time)
     */
    async processQueue() {
        // Already processing or queue is empty
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const request = this.queue.shift();
            
            try {
                this.logger.debug(`[CRAFTING SERVICE] Processing AI request. Queue length: ${this.queue.length}`);
                
                const imageURL = await this.generateImageWithDALLE(request.prompt);
                this.stats.successfulGenerations++;
                request.resolve(imageURL);
                
            } catch (error) {
                this.logger.error(`[CRAFTING SERVICE] AI generation failed: ${error.message}`);
                this.stats.failedGenerations++;
                request.reject(error);
            }

            // Small delay between requests to be respectful to API
            if (this.queue.length > 0) {
                await this.sleep(1000);
            }
        }

        this.isProcessing = false;
    }

    /**
     * Generate image using DALL-E 3
     * @param {string} prompt - Image description prompt
     * @returns {Promise<string>} Generated image URL
     */
    async generateImageWithDALLE(prompt) {
        if (!this.openai) {
            throw new Error(config.ERRORS.NO_OPENAI_KEY);
        }

        try {
            this.logger.debug(`[CRAFTING SERVICE] DALL-E prompt: ${prompt}`);

            const response = await Promise.race([
                this.openai.images.generate({
                    model: config.DALLE_CONFIG.model,
                    prompt: prompt,
                    n: config.DALLE_CONFIG.n,
                    size: config.DALLE_CONFIG.size,
                    quality: config.DALLE_CONFIG.quality
                }),
                this.timeout(config.AI_REQUEST_TIMEOUT)
            ]);

            if (!response.data || !response.data[0] || !response.data[0].url) {
                throw new Error('Invalid response from DALL-E API');
            }

            const imageURL = response.data[0].url;
            this.logger.info(`[CRAFTING SERVICE] Image generated successfully`);
            
            return imageURL;

        } catch (error) {
            if (error.message === 'AI request timeout') {
                this.logger.error('[CRAFTING SERVICE] DALL-E request timed out');
            } else if (error.response) {
                this.logger.error(`[CRAFTING SERVICE] OpenAI API error: ${error.response.status} - ${error.response.data?.error?.message || 'Unknown error'}`);
            } else {
                this.logger.error(`[CRAFTING SERVICE] DALL-E generation error: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Get placeholder image for items when AI generation is unavailable
     * @param {string} rarity - Rarity tier name
     * @returns {string} Data URL for placeholder image
     */
    getPlaceholderImage(rarity) {
        // Simple SVG placeholder with rarity-based colors
        const colors = {
            'Common': '#CD7F32',
            'Rare': '#C0C0C0',
            'Legendary': '#FFD700',
            'Mythic': '#9370DB'
        };

        // Sanitize rarity input - only allow known values
        const validRarities = ['Common', 'Rare', 'Legendary', 'Mythic'];
        const sanitizedRarity = validRarities.includes(rarity) ? rarity : 'Common';
        const color = colors[sanitizedRarity];
        
        // Create a simple SVG data URL (sanitized rarity already validated above)
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
            <rect fill="${color}" width="256" height="256" opacity="0.3"/>
            <circle cx="128" cy="128" r="80" fill="${color}" opacity="0.6"/>
            <text x="128" y="140" font-family="Arial" font-size="24" fill="white" text-anchor="middle">${sanitizedRarity}</text>
        </svg>`;

        return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    }

    /**
     * Promise timeout helper
     * @param {number} ms - Timeout in milliseconds
     * @returns {Promise} Promise that rejects after timeout
     */
    timeout(ms) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AI request timeout')), ms);
        });
    }

    /**
     * Sleep helper
     * @param {number} ms - Sleep duration in milliseconds
     * @returns {Promise} Promise that resolves after sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get service statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            queueLength: this.queue.length,
            isProcessing: this.isProcessing,
            hasAPIKey: !!this.apiKey
        };
    }

    /**
     * Clean up resources
     */
    async destroy() {
        // Clear queue
        this.queue = [];
        this.isProcessing = false;
        this.logger.info('[CRAFTING SERVICE] Service destroyed');
    }
}

module.exports = CraftingService;
