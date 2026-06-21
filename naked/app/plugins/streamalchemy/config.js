/**
 * StreamAlchemy Configuration
 * 
 * Global constants and configuration for the StreamAlchemy plugin.
 * This file defines all configurable parameters including rarity thresholds,
 * crafting windows, API settings, and overlay display parameters.
 */

module.exports = {
    // === CRAFTING ENGINE SETTINGS ===
    
    /**
     * Time window for crafting (milliseconds)
     * Users must send two gifts within this timeframe to trigger crafting
     */
    CRAFTING_WINDOW_MS: 6000, // 6 seconds
    
    /**
     * Fusion mode settings
     */
    FUSION_MODE: {
        AUTO_FUSION_ENABLED: false, // Enable automatic fusion when 2 different gifts sent
        MANUAL_FUSION_ENABLED: true, // Enable manual fusion from UI
        DEFAULT_STYLE: 'rpg' // Default style for fusion
    },
    
    /**
     * Tier/Frame system settings
     */
    TIER_SYSTEM: {
        ENABLED: true,
        TIERS: [
            { level: 1, name: 'Bronze', color: '#CD7F32', itemsToUpgrade: 3 },
            { level: 2, name: 'Silver', color: '#C0C0C0', itemsToUpgrade: 5 },
            { level: 3, name: 'Gold', color: '#FFD700', itemsToUpgrade: 7 },
            { level: 4, name: 'Platinum', color: '#E5E4E2', itemsToUpgrade: 10 },
            { level: 5, name: 'Diamond', color: '#B9F2FF', itemsToUpgrade: null } // Max tier
        ],
        AUTO_UPGRADE: false, // Automatically upgrade when enough items collected
        SHOW_UPGRADE_ANIMATION: true
    },
    
    /**
     * Available style presets
     */
    STYLE_PRESETS: [
        'rpg', 'fantasy', 'comic', 'pixel', 'anime', 
        'cyberpunk', 'minimalist', '3d_render', 'retro', 
        'rainbow', 'cartoon', 'dark_fantasy'
    ],
    
    /**
     * Rarity tier thresholds based on combined coin values
     * When two items are combined, their coin values are summed
     * and the total determines the crafted item's rarity
     */
    RARITY_TIERS: {
        BRONZE: {
            min: 0,
            max: 99,
            name: 'Common',
            color: '#CD7F32',
            glow: 'rgba(205, 127, 50, 0.6)',
            auraEffect: 'warm glow'
        },
        SILVER: {
            min: 100,
            max: 999,
            name: 'Rare',
            color: '#C0C0C0',
            glow: 'rgba(192, 192, 192, 0.8)',
            auraEffect: 'frost glow'
        },
        GOLD: {
            min: 1000,
            max: 4999,
            name: 'Legendary',
            color: '#FFD700',
            glow: 'rgba(255, 215, 0, 0.9)',
            auraEffect: 'warm heavy glow'
        },
        PURPLE: {
            min: 5000,
            max: Infinity,
            name: 'Mythic',
            color: '#9370DB',
            glow: 'rgba(147, 112, 219, 1.0)',
            auraEffect: 'arcane magical aura'
        }
    },
    
    // === AI GENERATION SETTINGS ===
    
    /**
     * DALL-E Image generation parameters
     */
    DALLE_CONFIG: {
        model: 'dall-e-3',
        size: '1024x1024',
        quality: 'standard',
        n: 1,
        style: 'vivid' // 'vivid' or 'natural'
    },
    
    /**
     * Item generation mode
     */
    ITEM_GENERATION_MODE: 'auto', // 'auto' (AI), 'manual' (upload), 'hybrid' (both)
    
    /**
     * AI prompt templates for item generation
     * These can be overridden via plugin configuration
     */
    PROMPTS: {
        BASE_ITEM: (giftName) => 
            `Create a fantasy RPG base item inspired by the TikTok gift "${giftName}". ` +
            `Isometric view, transparent background, soft glowing aura, crisp 2D icon.`,
        
        CRAFTED_ITEM: (itemAName, itemBName, rarityColor, auraEffect) =>
            `Combine ${itemAName} and ${itemBName} into a single unique crafted fantasy RPG item. ` +
            `Isometric view, transparent background, ${rarityColor} ${auraEffect}, highly detailed, game-ready icon.`
    },
    
    /**
     * Default custom prompt templates (empty = use default PROMPTS)
     */
    CUSTOM_PROMPTS: {
        BASE_ITEM_TEMPLATE: '',
        CRAFTED_ITEM_TEMPLATE: ''
    },
    
    /**
     * Default rarity for newly spawned base items
     */
    DEFAULT_BASE_RARITY: 'Common',
    
    /**
     * Maximum concurrent AI requests
     * Only one request at a time to avoid rate limits and ensure predictable behavior
     */
    MAX_CONCURRENT_AI_REQUESTS: 1,
    
    /**
     * AI request timeout (milliseconds)
     */
    AI_REQUEST_TIMEOUT: 60000, // 60 seconds
    
    // === DATABASE SETTINGS ===
    
    /**
     * LowDB file paths (relative to plugin directory)
     */
    DB_FILES: {
        INVENTORY_GLOBAL: 'data/inventory_global.json',
        USER_INVENTORY: 'data/user_inventory.json'
    },
    
    // === OVERLAY SETTINGS ===
    
    /**
     * WebSocket/SSE server port
     * Set to null to use the main server's Socket.io instance
     */
    OVERLAY_PORT: null,
    
    /**
     * Animation durations (milliseconds)
     */
    ANIMATIONS: {
        DISCOVERY_POPUP: 5000,      // Duration for new item discovery popup
        CRAFTING_ANIMATION: 3000,   // Duration for crafting fusion animation
        COUNTER_BOUNCE: 500,        // Duration for inventory counter bounce
        PARTICLE_DURATION: 2000     // Duration for particle effects
    },
    
    /**
     * UI display positions (CSS)
     */
    UI_POSITIONS: {
        DISCOVERY_POPUP: {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
        },
        CORNER_COUNTER: {
            top: '20px',
            right: '20px'
        }
    },
    
    // === CHATCOMMAND SETTINGS ===
    
    /**
     * Chat command prefix
     */
    COMMAND_PREFIX: '/',
    
    /**
     * Available commands (structure for future implementation)
     */
    COMMANDS: {
        MERGE: 'merge',
        INVENTORY: 'inventory',
        HELP: 'alchemy help'
    },
    
    // === RATE LIMITING ===
    
    /**
     * Rate limiting to prevent spam
     */
    RATE_LIMIT: {
        GIFTS_PER_USER_PER_MINUTE: 30,
        CRAFTING_PER_USER_PER_MINUTE: 10
    },
    
    // === ERROR MESSAGES ===
    
    ERRORS: {
        NO_OPENAI_KEY: 'OpenAI API key not configured. Please set OPENAI_API_KEY in environment or config.',
        AI_GENERATION_FAILED: 'Failed to generate item image. Please try again.',
        INVALID_COMBINATION: 'Invalid item combination.',
        DATABASE_ERROR: 'Database error occurred.',
        RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please slow down.'
    }
};
