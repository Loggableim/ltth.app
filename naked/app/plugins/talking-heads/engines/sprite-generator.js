/**
 * Sprite Generator Engine
 * Generates 5 essential sprite frames from base avatar image
 * Uses FLUX.1-Kontext for context-aware mouth editing to ensure synchronized speech animation
 */

const OpenAI = require('openai');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { getStyleTemplate } = require('../utils/style-templates');

// FLUX.1-Kontext API endpoint for context-aware image editing
const FLUX_KONTEXT_API_URL = 'https://api.siliconflow.com/v1/images/generations';
const FLUX_KONTEXT_MODEL = 'black-forest-labs/FLUX.1-Kontext-dev';
const DEFAULT_SPRITE_RESOLUTION = 512;
const MIN_SPRITE_RESOLUTION = 256;
const MAX_SPRITE_RESOLUTION = 1024;

class SpriteGenerator {
  constructor(apiUrl, apiKey, logger, config) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.logger = logger;
    this.config = config;
    this.provider = (config && config.imageProvider) || 'siliconflow';
    this.openaiClient = this.provider === 'openai' && apiKey ? new OpenAI({ apiKey }) : null;

    // Sprite frame definitions
    this.spriteFrames = {
      idle_neutral: 'character in neutral pose with relaxed expression, eyes open, mouth gently closed',
      blink: 'character with eyes gently closed, peaceful blinking expression, mouth closed',
      speak_closed: 'character with mouth closed, ready to speak, alert expression',
      speak_mid: 'character with mouth halfway open, mid-speech expression',
      speak_open: 'character with mouth fully open, speaking expression'
    };

    // Frames that require context-aware editing (mouth synchronization)
    this.kontextFrames = ['speak_open', 'speak_mid'];
  }

  /**
   * Make HTTPS POST request
   * @param {string} url - URL to POST to
   * @param {object} data - Data to send
   * @param {object} headers - HTTP headers
   * @returns {Promise<object>} Response data
   */
  async _httpsPost(url, data, headers = {}) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...headers
        },
        timeout: 60000,
        // TLS configuration to fix SSL handshake failures
        minVersion: 'TLSv1.2'
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(error.message || 'HTTP request failed'));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Make HTTPS GET request for binary data
   * @param {string} url - URL to GET
   * @returns {Promise<Buffer>} Response buffer
   */
  async _httpsGetBuffer(url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        // TLS configuration to fix SSL handshake failures
        minVersion: 'TLSv1.2'
      };
      
      https.get(options, (res) => {
        const chunks = [];

        res.on('data', (chunk) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      }).on('error', (error) => {
        reject(new Error(error.message || 'HTTP GET request failed'));
      });
    });
  }

  /**
   * Calculate OpenAI image size for sprite generation
   * @returns {string} OpenAI-compatible size string
   * @private
   */
  _getOpenAISize() {
    const resolution = this._getSpriteResolution();
    if (resolution >= 1792) {
      return '1792x1024';
    }
    return '1024x1024';
  }

  /**
   * Calculate square WxH image size string for sprite generation
   * @returns {string} Size string like "512x512"
   * @private
   */
  _getSpriteImageSize() {
    const resolution = this._getSpriteResolution(true);
    return `${resolution}x${resolution}`;
  }

  /**
   * Parse sprite resolution from config with optional bounds
   * @param {boolean} clamp - Whether to apply min/max bounds
   * @returns {number} Parsed resolution value
   * @private
   */
  _getSpriteResolution(clamp = false) {
    const parsed = parseInt(this.config?.spriteResolution ?? DEFAULT_SPRITE_RESOLUTION, 10);
    const resolution = Number.isNaN(parsed) ? DEFAULT_SPRITE_RESOLUTION : parsed;
    if (!clamp) {
      return resolution;
    }
    return Math.max(MIN_SPRITE_RESOLUTION, Math.min(MAX_SPRITE_RESOLUTION, resolution));
  }

  /**
   * Generate sprite frame via OpenAI Images API
   * @param {string} prompt - Prompt to render
   * @returns {Promise<string>} URL to generated image
   * @private
   */
  async _generateSpriteWithOpenAI(prompt) {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const model = this.config.openaiImageModel || 'dall-e-3';
    const size = this._getOpenAISize();

    const response = await this.openaiClient.images.generate({
      model,
      prompt,
      size
    });
    
    if (!response.data || response.data.length === 0) {
      throw new Error('No images returned from OpenAI');
    }
    
    return response.data[0].url;
  }

  /**
   * Build prompt for sprite frame generation
   * @param {string} frameType - Type of sprite frame
   * @param {string} styleKey - Style template key
   * @param {string} username - TikTok username
   * @returns {string} Sprite generation prompt
   */
  buildSpritePrompt(frameType, styleKey, username) {
    const styleTemplate = getStyleTemplate(styleKey);
    if (!styleTemplate) {
      throw new Error(`Invalid style key: ${styleKey}`);
    }

    const frameDescription = this.spriteFrames[frameType];
    if (!frameDescription) {
      throw new Error(`Invalid frame type: ${frameType}`);
    }

    const resolution = this._getSpriteResolution(true);

    return `Create a sprite animation frame for character "${username}".

Frame Type: ${frameType}
Frame Description: ${frameDescription}

Style Requirements:
- ${styleTemplate.spriteModifier}
- Artistic style: ${styleTemplate.name}

Technical Requirements:
- Transparent background (PNG format)
- Resolution: ${resolution}×${resolution}px
- Consistent with base avatar proportions
- Same visual identity and style
- Clean edges suitable for animation
- Centered composition
- Head and upper body visible

Output Requirements:
- Single sprite frame only
- No sprite sheet
- Animation-ready
- Professional quality`;
  }

  /**
   * Build prompt for context-aware mouth editing using FLUX.1-Kontext
   * @param {string} frameType - Type of sprite frame (speak_open, speak_mid)
   * @returns {string} Kontext editing prompt
   * @private
   */
  _buildKontextPrompt(frameType) {
    const mouthPrompts = {
      speak_open: 'Edit this character portrait to show the mouth fully open as if speaking or saying "ah". Keep everything else exactly the same - same character, same style, same pose, same background, same lighting. Only change the mouth to be wide open.',
      speak_mid: 'Edit this character portrait to show the mouth slightly open as if mid-speech. Keep everything else exactly the same - same character, same style, same pose, same background, same lighting. Only change the mouth to be partially open.'
    };
    return mouthPrompts[frameType] || mouthPrompts.speak_open;
  }

  /**
   * Generate context-aware sprite frame using FLUX.1-Kontext
   * This edits the existing avatar image to create mouth variations
   * ensuring perfect synchronization between TTS speech and avatar mouth movement
   * @param {string} avatarBase64 - Base64 encoded avatar image
   * @param {string} frameType - Type of sprite frame
   * @returns {Promise<Buffer>} Generated image buffer
   * @private
   */
  async _generateWithKontext(avatarBase64, frameType) {
    const prompt = this._buildKontextPrompt(frameType);
    
    this.logger.info(`TalkingHeads: Using FLUX.1-Kontext for context-aware ${frameType} generation`);

    try {
      // Detect MIME type from base64 image header (PNG starts with iVBOR, JPEG with /9j/)
      let mimeType = 'image/png';  // Default to PNG
      if (avatarBase64.startsWith('/9j/')) {
        mimeType = 'image/jpeg';
      } else if (avatarBase64.startsWith('UklGR')) {
        mimeType = 'image/webp';
      }

      const response = await this._httpsPost(
        FLUX_KONTEXT_API_URL,
        {
          model: FLUX_KONTEXT_MODEL,
          prompt: prompt,
          image: `data:${mimeType};base64,${avatarBase64}`,
          image_size: this._getSpriteImageSize(),
          num_inference_steps: 28,  // Kontext uses more steps for quality
          guidance_scale: 3.5,
          prompt_enhancement: false  // Don't enhance prompt, we want precise editing
        },
        {
          'Authorization': `Bearer ${this.apiKey}`
        }
      );

      if (!response || !response.images || response.images.length === 0) {
        throw new Error(`No image returned from FLUX.1-Kontext for frame ${frameType}`);
      }

      // Get image data
      const imageData = response.images[0].url;
      
      // Download or decode image
      if (imageData.startsWith('http')) {
        return await this._httpsGetBuffer(imageData);
      } else {
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        return Buffer.from(base64Data, 'base64');
      }
    } catch (error) {
      this.logger.warn(`TalkingHeads: FLUX.1-Kontext failed for ${frameType}: ${error.message}. Falling back to standard generation.`);
      // Return null to signal fallback to standard generation
      return null;
    }
  }

  /**
   * Generate all sprite frames for avatar
   * Uses FLUX.1-Kontext for mouth frames (speak_open, speak_mid) to ensure
   * perfect synchronization between TTS speech and avatar mouth movement
   * @param {string} username - TikTok username
   * @param {string} userId - TikTok user ID
   * @param {string} avatarPath - Path to base avatar image
   * @param {string} styleKey - Style template key
   * @param {string} cacheDir - Directory to save sprites
   * @returns {Promise<object>} Object with paths to all sprite frames
   */
  async generateSprites(username, userId, avatarPath, styleKey, cacheDir) {
    try {
      this.logger.info(`TalkingHeads: Generating sprites for ${username}`);

      // Read avatar image to use as reference for context-aware editing
      const avatarBuffer = await fs.readFile(avatarPath);
      const avatarBase64 = avatarBuffer.toString('base64');

      const spritePaths = {};

      // Generate each sprite frame
      for (const [frameType, frameDescription] of Object.entries(this.spriteFrames)) {
        try {
          this.logger.info(`TalkingHeads: Generating sprite frame "${frameType}" for ${username} (${this.provider})`);

          let imageBuffer = null;

          // For mouth frames, try FLUX.1-Kontext first for context-aware editing
          // This ensures the open mouth version matches the original avatar exactly
          if (this.kontextFrames.includes(frameType) && this.provider === 'siliconflow') {
            imageBuffer = await this._generateWithKontext(avatarBase64, frameType);
          }

          // If Kontext failed or not applicable, use standard generation
          if (!imageBuffer) {
            const prompt = this.buildSpritePrompt(frameType, styleKey, username);
            
            if (this.provider === 'openai') {
              const imageUrl = await this._generateSpriteWithOpenAI(prompt);
              imageBuffer = await this._httpsGetBuffer(imageUrl);
            } else {
              // Call image generation API with SiliconFlow FLUX.1-schnell
              const response = await this._httpsPost(
                this.apiUrl,
                {
                  model: 'black-forest-labs/FLUX.1-schnell',
                  prompt: prompt,
                  image_size: this._getSpriteImageSize(),
                  batch_size: 1,
                  num_inference_steps: 4,
                  guidance_scale: 7.5
                },
                {
                  'Authorization': `Bearer ${this.apiKey}`
                }
              );

              if (!response || !response.images || response.images.length === 0) {
                throw new Error(`No image returned for frame ${frameType}`);
              }

              // Get image data
              const imageData = response.images[0].url;
              
              // Download or decode image
              if (imageData.startsWith('http')) {
                imageBuffer = await this._httpsGetBuffer(imageData);
              } else {
                const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
                imageBuffer = Buffer.from(base64Data, 'base64');
              }
            }
          }

          // Save sprite frame
          const filename = `${userId}_${styleKey}_${frameType}.png`;
          const filepath = path.join(cacheDir, filename);
          await fs.writeFile(filepath, imageBuffer);

          spritePaths[frameType] = filepath;

          this.logger.info(`TalkingHeads: Sprite frame "${frameType}" generated for ${username}`);

        } catch (error) {
          this.logger.error(`TalkingHeads: Failed to generate sprite frame "${frameType}": ${error.message}`);
          throw error;
        }
      }

      this.logger.info(`TalkingHeads: All sprites generated successfully for ${username}`);
      return spritePaths;

    } catch (error) {
      this.logger.error(`TalkingHeads: Sprite generation failed for ${username}: ${error.message}`);
      throw new Error(`Sprite generation failed: ${error.message}`);
    }
  }

  /**
   * Generate single sprite frame (for testing or regeneration)
   * @param {string} username - TikTok username
   * @param {string} userId - TikTok user ID
   * @param {string} frameType - Type of sprite frame
   * @param {string} styleKey - Style template key
   * @param {string} cacheDir - Directory to save sprite
   * @returns {Promise<string>} Path to generated sprite
   */
  async generateSingleSprite(username, userId, frameType, styleKey, cacheDir) {
    if (!this.spriteFrames[frameType]) {
      throw new Error(`Invalid frame type: ${frameType}`);
    }

    try {
      const prompt = this.buildSpritePrompt(frameType, styleKey, username);

      let imageBuffer;
      if (this.provider === 'openai') {
        const imageUrl = await this._generateSpriteWithOpenAI(prompt);
        imageBuffer = await this._httpsGetBuffer(imageUrl);
      } else {
        const response = await this._httpsPost(
          this.apiUrl,
          {
            model: 'black-forest-labs/FLUX.1-schnell',
            prompt: prompt,
            image_size: this._getSpriteImageSize(),
            batch_size: 1,
            num_inference_steps: 4,
            guidance_scale: 7.5
          },
          {
            'Authorization': `Bearer ${this.apiKey}`
          }
        );

        if (!response || !response.images || response.images.length === 0) {
          throw new Error('No image returned from API');
        }

        const imageData = response.images[0].url;
        
        if (imageData.startsWith('http')) {
          imageBuffer = await this._httpsGetBuffer(imageData);
        } else {
          const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
          imageBuffer = Buffer.from(base64Data, 'base64');
        }
      }

      const filename = `${userId}_${styleKey}_${frameType}.png`;
      const filepath = path.join(cacheDir, filename);
      await fs.writeFile(filepath, imageBuffer);

      return filepath;

    } catch (error) {
      this.logger.error(`TalkingHeads: Failed to generate sprite frame "${frameType}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Get list of sprite frame types
   * @returns {string[]} Array of sprite frame type names
   */
  getFrameTypes() {
    return Object.keys(this.spriteFrames);
  }
}

module.exports = SpriteGenerator;
