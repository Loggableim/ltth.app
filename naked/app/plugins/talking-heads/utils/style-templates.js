/**
 * Style Templates for Avatar Generation
 * Each template defines artistic style prompts for AI image generation
 */

const STYLE_TEMPLATES = {
  furry: {
    name: 'Furry',
    description: 'Animated anthropomorphic animal character, soft and lively',
    avatarPrompt: 'furry style anthropomorphic character with expressive features, soft fur texture, vibrant colors, friendly and energetic appearance',
    spriteModifier: 'anthropomorphic furry character with consistent fur patterns and expressive facial features'
  },
  tech: {
    name: 'Tech/Futuristic',
    description: 'Futuristic high-tech look with neon and metallic accents',
    avatarPrompt: 'futuristic tech avatar with sleek neon accents, metallic textures, cyberpunk aesthetic, holographic elements, modern sci-fi design',
    spriteModifier: 'futuristic character with consistent neon lighting and tech details'
  },
  medieval: {
    name: 'Medieval Fantasy',
    description: 'Fantasy medieval character with fabric, leather, and armor',
    avatarPrompt: 'medieval fantasy character with detailed clothing, leather armor elements, fabric textures, fantasy RPG style, heroic appearance',
    spriteModifier: 'medieval fantasy character with consistent armor and clothing details'
  },
  noble: {
    name: 'Noble/Aristocratic',
    description: 'Elegant aristocratic portrait style',
    avatarPrompt: 'elegant aristocratic portrait, refined features, noble attire, sophisticated styling, regal appearance, high-class aesthetic',
    spriteModifier: 'noble character with elegant features and refined clothing'
  },
  cartoon: {
    name: 'Cartoon',
    description: 'Cartoon style with bold outlines and vibrant colors',
    avatarPrompt: 'cartoon character with bold outlines, vibrant bright colors, exaggerated expressive features, fun and playful design, animation-ready style',
    spriteModifier: 'cartoon character with consistent bold outlines and vibrant colors'
  },
  whimsical: {
    name: 'Whimsical/Fairy Tale',
    description: 'Whimsical, playful fairy tale design',
    avatarPrompt: 'whimsical fairy tale design, magical and enchanting, soft pastel colors, dreamy atmosphere, storybook illustration style, charming and delightful',
    spriteModifier: 'whimsical fairy tale character with magical and dreamy qualities'
  },
  realistic: {
    name: 'Realistic',
    description: 'Realistic high-quality portrait',
    avatarPrompt: 'realistic high-quality portrait, detailed facial features, natural skin tones, photorealistic rendering, professional photography style, lifelike appearance',
    spriteModifier: 'realistic character with detailed natural features'
  }
};

/**
 * Get style template by key
 * @param {string} styleKey - Style template key
 * @returns {object|null} Style template object or null if not found
 */
function getStyleTemplate(styleKey) {
  return STYLE_TEMPLATES[styleKey] || null;
}

/**
 * Get all available style templates
 * @returns {object} All style templates
 */
function getAllStyleTemplates() {
  return STYLE_TEMPLATES;
}

/**
 * Get list of style template keys
 * @returns {string[]} Array of style keys
 */
function getStyleKeys() {
  return Object.keys(STYLE_TEMPLATES);
}

module.exports = {
  STYLE_TEMPLATES,
  getStyleTemplate,
  getAllStyleTemplates,
  getStyleKeys
};
