const { PROMPT_VERSION, STYLE_PRESETS } = require('./constants');

class PromptService {
  constructor(options = {}) {
    this.promptVersion = options.promptVersion || PROMPT_VERSION;
  }

  sanitizeName(value) {
    const text = String(value || 'Unknown')
      .replace(/^Essence of /i, '')
      .replace(/[<>`"'{}[\]\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 48) || 'Unknown';
  }

  normalizeStyle(style) {
    return STYLE_PRESETS[style] ? style : 'rpg';
  }

  createBaseItemPrompt({ giftName, style = 'rpg' }) {
    const cleanGift = this.sanitizeName(giftName);
    const normalizedStyle = this.normalizeStyle(style);
    const styleText = STYLE_PRESETS[normalizedStyle].prompt;
    return {
      promptVersion: this.promptVersion,
      prompt: [
        `Single fantasy RPG item icon inspired by TikTok gift "${cleanGift}".`,
        `Centered isometric object, transparent background, readable silhouette, premium game asset, soft glow, ${styleText}.`,
        'No text, no logo, no character, no background scene.'
      ].join(' '),
      negativePrompt: this.getNegativePrompt(),
      style: normalizedStyle
    };
  }

  createCraftedItemPrompt({ itemAName, itemBName, rarity, style = 'rpg' }) {
    const cleanA = this.sanitizeName(itemAName);
    const cleanB = this.sanitizeName(itemBName);
    const normalizedStyle = this.normalizeStyle(style);
    const styleText = STYLE_PRESETS[normalizedStyle].prompt;
    const cleanRarity = this.sanitizeName(rarity || 'Common');
    return {
      promptVersion: this.promptVersion,
      prompt: [
        `Single fantasy RPG item icon combining "${cleanA}" and "${cleanB}" into one new object.`,
        `Centered isometric object, transparent background, readable silhouette, premium game asset, ${cleanRarity} glow, ${styleText}.`,
        'No text, no logo, no character, no background scene.'
      ].join(' '),
      negativePrompt: this.getNegativePrompt(),
      style: normalizedStyle
    };
  }

  getNegativePrompt() {
    return 'text, watermark, logo, letters, numbers, person, face, hands, full scene, busy background, blurry, cropped, duplicate item';
  }

  createRecipeKey({ itemAId, itemBId, style = 'rpg', promptVersion = this.promptVersion }) {
    const [first, second] = [String(itemAId), String(itemBId)].sort();
    const normalizedStyle = this.normalizeStyle(style);
    return `craft:v1:${first}:${second}:${normalizedStyle}:${promptVersion}`;
  }
}

module.exports = PromptService;
