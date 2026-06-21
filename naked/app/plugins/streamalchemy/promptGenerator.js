/**
 * StreamAlchemy Prompt Generator
 * 
 * Generates detailed AI prompts for fusion item image generation.
 * Reads item metadata and creates prompts with configurable styles.
 * 
 * Features:
 * - Style presets (RPG, Fantasy, Comic, Pixel Art, etc.)
 * - Custom style support
 * - Negative prompts for quality control
 * - Metadata-aware prompt construction
 */

/**
 * Available style presets for image generation
 */
const STYLE_PRESETS = {
    rpg: {
        name: 'RPG',
        description: 'Classic role-playing game item style',
        basePrompt: 'Highly detailed RPG game item icon, isometric view, polished metal and gemstones, magical glow, dark fantasy aesthetic',
        lighting: 'dramatic rim lighting, soft ambient occlusion',
        colors: 'rich saturated colors with gold accents',
        negativePrompt: 'blurry, low quality, text, watermark, signature, realistic photo'
    },
    fantasy: {
        name: 'Fantasy',
        description: 'High fantasy magical item style',
        basePrompt: 'Enchanted magical artifact, ethereal glow, mystical runes, fantasy game art style, highly detailed',
        lighting: 'magical inner glow, soft diffused light',
        colors: 'vibrant jewel tones, purple and gold magical aura',
        negativePrompt: 'modern, realistic, photo, blurry, low quality'
    },
    comic: {
        name: 'Comic',
        description: 'Bold comic book style',
        basePrompt: 'Comic book style illustration, bold outlines, cel shading, dynamic composition, pop art influence',
        lighting: 'flat comic lighting with bold shadows',
        colors: 'bright primary colors, high contrast',
        negativePrompt: 'realistic, photo, 3D render, blurry'
    },
    pixel: {
        name: 'Pixel Art',
        description: '16-bit retro pixel art style',
        basePrompt: '16-bit pixel art game item, retro video game style, clean pixel edges, nostalgic aesthetic',
        lighting: 'simple pixel shading, limited color palette',
        colors: 'classic 16-bit color palette, vibrant retro colors',
        negativePrompt: 'blurry, anti-aliased, smooth gradients, realistic'
    },
    anime: {
        name: 'Anime',
        description: 'Japanese anime/manga style',
        basePrompt: 'Anime style magical item, cel shaded, Japanese game art aesthetic, clean lines, sparkle effects',
        lighting: 'anime style highlights, dramatic backlight',
        colors: 'soft pastel with vibrant accents, anime color palette',
        negativePrompt: 'realistic, photo, western cartoon style'
    },
    cyberpunk: {
        name: 'Cyberpunk',
        description: 'Futuristic neon cyberpunk style',
        basePrompt: 'Cyberpunk tech artifact, neon glow, holographic elements, futuristic sci-fi aesthetic, chrome and glass',
        lighting: 'neon rim lighting, volumetric light rays',
        colors: 'neon pink, cyan, purple, electric blue on dark background',
        negativePrompt: 'fantasy, medieval, natural, organic, blurry'
    },
    minimalist: {
        name: 'Minimalist',
        description: 'Clean minimalist design',
        basePrompt: 'Minimalist icon design, clean geometric shapes, simple elegant composition, modern flat design',
        lighting: 'soft even lighting, subtle shadows',
        colors: 'limited color palette, muted tones with single accent color',
        negativePrompt: 'detailed, complex, ornate, busy, cluttered'
    },
    '3d_render': {
        name: '3D Render',
        description: 'High quality 3D rendered style',
        basePrompt: '3D rendered game item, high polygon, PBR materials, studio lighting, professional quality',
        lighting: 'three-point studio lighting, subtle reflections',
        colors: 'realistic material colors, metallic and glossy surfaces',
        negativePrompt: '2D, flat, cartoon, blurry, low poly'
    },
    retro: {
        name: 'Retro',
        description: 'Vintage retro game style',
        basePrompt: 'Retro vintage game item, 80s/90s aesthetic, nostalgic design, classic game art style',
        lighting: 'warm retro lighting, subtle vignette',
        colors: 'warm orange, teal, faded vintage palette',
        negativePrompt: 'modern, hyper-realistic, dark, gritty'
    },
    rainbow: {
        name: 'Rainbow',
        description: 'Colorful rainbow spectrum style',
        basePrompt: 'Iridescent rainbow magical item, prismatic colors, holographic effect, magical sparkles',
        lighting: 'rainbow light refraction, sparkle highlights',
        colors: 'full spectrum rainbow gradient, iridescent shimmer',
        negativePrompt: 'monochrome, dark, muted, realistic'
    },
    cartoon: {
        name: 'Cartoon',
        description: 'Fun cartoon style',
        basePrompt: 'Cartoon style game item, exaggerated proportions, playful design, fun and whimsical',
        lighting: 'bright cheerful lighting, soft shadows',
        colors: 'bright saturated cartoon colors, playful palette',
        negativePrompt: 'realistic, dark, gritty, scary'
    },
    dark_fantasy: {
        name: 'Dark Fantasy',
        description: 'Dark and gothic fantasy style',
        basePrompt: 'Dark fantasy artifact, gothic ornate design, sinister magical aura, dark souls aesthetic',
        lighting: 'dramatic low-key lighting, deep shadows',
        colors: 'dark palette with red/purple accents, ominous glow',
        negativePrompt: 'bright, cheerful, cute, colorful, cartoony'
    }
};

class PromptGenerator {
    /**
     * @param {Object} logger - Logger instance
     * @param {Object} customPrompts - Custom prompt templates
     */
    constructor(logger, customPrompts = {}) {
        this.logger = logger;
        this.customPrompts = customPrompts;
        this.stylePresets = STYLE_PRESETS;
    }

    /**
     * Update custom prompts
     * @param {Object} customPrompts - New custom prompts
     */
    updateCustomPrompts(customPrompts) {
        this.customPrompts = customPrompts || {};
        this.logger.info('[PROMPT GENERATOR] Custom prompts updated');
    }

    /**
     * Get all available style presets
     * @returns {Object} Style presets
     */
    getStylePresets() {
        return Object.entries(this.stylePresets).map(([id, preset]) => ({
            id,
            name: preset.name,
            description: preset.description
        }));
    }

    /**
     * Generate a fusion prompt from two items
     * 
     * @param {Object} itemA - First source item
     * @param {Object} itemB - Second source item
     * @param {string} style - Style preset ID or 'custom'
     * @param {Object} options - Additional options
     * @returns {Object} Generated prompt with metadata
     */
    generateFusionPrompt(itemA, itemB, style = 'rpg', options = {}) {
        const {
            customStyle = null,
            rarity = 'Common',
            rarityColor = '#CD7F32',
            auraEffect = 'warm glow',
            includeNegative = true
        } = options;

        // Get style preset or use custom
        let styleConfig;
        if (style === 'custom' && customStyle) {
            styleConfig = {
                name: 'Custom',
                basePrompt: customStyle.basePrompt || '',
                lighting: customStyle.lighting || '',
                colors: customStyle.colors || '',
                negativePrompt: customStyle.negativePrompt || ''
            };
        } else {
            styleConfig = this.stylePresets[style] || this.stylePresets.rpg;
        }

        // Extract item info
        const itemAName = this.cleanItemName(itemA.name);
        const itemBName = this.cleanItemName(itemB.name);
        const itemADescription = itemA.description || '';
        const itemBDescription = itemB.description || '';
        const itemATags = itemA.tags || [];
        const itemBTags = itemB.tags || [];

        // Build the main prompt
        const fusionConcept = this.generateFusionConcept(itemAName, itemBName, itemATags, itemBTags);
        
        // Check for custom fusion template
        let mainPrompt;
        if (this.customPrompts.fusionTemplate) {
            mainPrompt = this.customPrompts.fusionTemplate
                .replace('{itemA}', itemAName)
                .replace('{itemB}', itemBName)
                .replace('{fusionConcept}', fusionConcept)
                .replace('{rarity}', rarity)
                .replace('{rarityColor}', rarityColor)
                .replace('{auraEffect}', auraEffect)
                .replace('{style}', styleConfig.name);
        } else {
            mainPrompt = this.buildDefaultFusionPrompt(
                itemAName,
                itemBName,
                fusionConcept,
                styleConfig,
                rarity,
                rarityColor,
                auraEffect
            );
        }

        const result = {
            prompt: mainPrompt,
            style: style,
            styleName: styleConfig.name,
            itemA: itemAName,
            itemB: itemBName,
            rarity,
            rarityColor,
            fusionConcept
        };

        if (includeNegative && styleConfig.negativePrompt) {
            result.negativePrompt = styleConfig.negativePrompt;
        }

        this.logger.info(`[PROMPT GENERATOR] Generated fusion prompt for ${itemAName} + ${itemBName} in ${styleConfig.name} style`);
        this.logger.debug(`[PROMPT GENERATOR] Prompt: ${mainPrompt.substring(0, 100)}...`);

        return result;
    }

    /**
     * Build the default fusion prompt
     */
    buildDefaultFusionPrompt(itemAName, itemBName, fusionConcept, styleConfig, rarity, rarityColor, auraEffect) {
        const parts = [];

        // Core fusion description
        parts.push(`A mystical fusion artifact combining the essence of "${itemAName}" and "${itemBName}".`);
        parts.push(fusionConcept);
        
        // Style base prompt
        if (styleConfig.basePrompt) {
            parts.push(styleConfig.basePrompt);
        }

        // Rarity-specific elements
        parts.push(`${rarity} tier item with ${auraEffect}.`);
        
        // Lighting
        if (styleConfig.lighting) {
            parts.push(`Lighting: ${styleConfig.lighting}.`);
        }

        // Colors
        if (styleConfig.colors) {
            parts.push(`Color scheme: ${styleConfig.colors}.`);
        }

        // Technical quality
        parts.push('Transparent background, game-ready icon, ultra detailed, sharp focus.');

        return parts.join(' ');
    }

    /**
     * Generate a creative fusion concept from two items
     */
    generateFusionConcept(itemAName, itemBName, tagsA, tagsB) {
        // Combine and deduplicate tags
        const allTags = [...new Set([...tagsA, ...tagsB])];
        
        // Generate fusion concept based on item names
        const concepts = [
            `The power of ${itemAName} intertwined with the magic of ${itemBName}`,
            `A harmonious blend where ${itemAName} meets ${itemBName}`,
            `Ancient artifact born from merging ${itemAName} and ${itemBName}`,
            `Mystical creation combining ${itemAName}'s essence with ${itemBName}'s spirit`
        ];

        // Select concept based on hash of names for determinism
        const hash = this.simpleHash(itemAName + itemBName);
        const conceptIndex = Math.abs(hash) % concepts.length;
        
        let concept = concepts[conceptIndex];
        
        // Add tag-based description if available
        if (allTags.length > 0) {
            const tagStr = allTags.slice(0, 3).join(', ');
            concept += `. Embodying ${tagStr}.`;
        }

        return concept;
    }

    /**
     * Generate a prompt for base item (from gift)
     */
    generateBaseItemPrompt(giftName, style = 'rpg', options = {}) {
        const styleConfig = this.stylePresets[style] || this.stylePresets.rpg;
        
        // Check for custom base item template
        if (this.customPrompts.baseItemTemplate) {
            return {
                prompt: this.customPrompts.baseItemTemplate
                    .replace('{giftName}', giftName)
                    .replace('{style}', styleConfig.name),
                style: style,
                styleName: styleConfig.name,
                negativePrompt: styleConfig.negativePrompt
            };
        }

        const prompt = `A magical item inspired by "${giftName}". ${styleConfig.basePrompt}. ` +
            `${styleConfig.lighting}. ${styleConfig.colors}. ` +
            `Transparent background, game icon style, highly detailed.`;

        return {
            prompt,
            style: style,
            styleName: styleConfig.name,
            negativePrompt: styleConfig.negativePrompt
        };
    }

    /**
     * Clean item name for prompt use
     */
    cleanItemName(name) {
        if (!name) return 'Unknown Item';
        // Remove "Essence of " prefix if present
        return name.replace(/^Essence of /i, '').trim();
    }

    /**
     * Simple deterministic hash function for consistent selections
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }

    /**
     * Generate a unique fusion key for caching
     * Creates a deterministic key from sorted item IDs and style
     * 
     * @param {string} itemAId - First item ID
     * @param {string} itemBId - Second item ID
     * @param {string} style - Style preset ID
     * @param {Object} options - Additional options to include in key
     * @returns {string} Unique fusion key
     */
    generateFusionKey(itemAId, itemBId, style = 'rpg', options = {}) {
        // Sort IDs for consistent ordering
        const sortedIds = [itemAId, itemBId].sort();
        
        // Include relevant options in key
        const keyParts = [
            sortedIds[0],
            sortedIds[1],
            style
        ];

        // Add any additional options that affect output
        if (options.tier) {
            keyParts.push(`tier:${options.tier}`);
        }

        return keyParts.join('|');
    }

    /**
     * Parse a fusion key back to components
     * @param {string} fusionKey - Fusion key to parse
     * @returns {Object} Parsed components
     */
    parseFusionKey(fusionKey) {
        const parts = fusionKey.split('|');
        return {
            itemAId: parts[0] || null,
            itemBId: parts[1] || null,
            style: parts[2] || 'rpg',
            tier: parts[3] ? parseInt(parts[3].replace('tier:', '')) : 1
        };
    }
}

// Export both class and style presets
module.exports = PromptGenerator;
module.exports.STYLE_PRESETS = STYLE_PRESETS;
