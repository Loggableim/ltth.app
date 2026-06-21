const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Image Generation Service for SiliconFlow API
 * Supports: Tongyi-MAI/Z-Image-Turbo and black-forest-labs/FLUX.1-schnell
 */
class ImageService {
  constructor(apiKey, logger, cacheDir) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.cacheDir = cacheDir;
    this.baseURL = 'https://api.siliconflow.com/v1';  // Fixed: Use .com instead of .cn
    
    this.models = {
      'z-image-turbo': 'Tongyi-MAI/Z-Image-Turbo',
      'flux-schnell': 'black-forest-labs/FLUX.1-schnell'
    };

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate image from text prompt
   * @param {string} prompt - Image description
   * @param {string} model - Model to use (z-image-turbo or flux-schnell)
   * @param {string} style - Additional style prompt
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Promise<string>} - Path to cached image file
   */
  async generateImage(prompt, model = 'flux-schnell', style = '', width = 1024, height = 1024) {
    try {
      const modelName = this.models[model] || this.models['flux-schnell'];
      const fullPrompt = style ? `${prompt}, ${style}` : prompt;
      
      this.logger.info(`Generating image with ${modelName}: ${fullPrompt.substring(0, 100)}...`);

      // Build request body with model-specific parameters
      const requestBody = {
        model: modelName,
        prompt: fullPrompt,
        image_size: `${width}x${height}`,
        seed: Math.floor(Math.random() * 1000000)
      };

      // FLUX.1-schnell is a distilled model that doesn't use guidance_scale
      // Only add guidance_scale for models that support it (Z-Image-Turbo)
      // Note: 'model' is the short name parameter ('z-image-turbo' or 'flux-schnell')
      //       'modelName' is the full API model name ('Tongyi-MAI/Z-Image-Turbo' etc.)
      if (model === 'z-image-turbo') {
        requestBody.num_inference_steps = 4;
        requestBody.guidance_scale = 7.5;
      }
      // For FLUX.1-schnell, use minimal parameters (no guidance_scale)
      // The model is designed to work without classifier-free guidance

      const response = await axios.post(
        `${this.baseURL}/images/generations`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60 second timeout for image generation
        }
      );

      if (response.data && response.data.images && response.data.images.length > 0) {
        const imageData = response.data.images[0];
        return await this._cacheImage(imageData, prompt);
      }

      throw new Error('Invalid response from Image API');
    } catch (error) {
      this.logger.error(`Image Service Error: ${error.message}`);
      if (error.response) {
        this.logger.error(`API Response: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Cache image data to local file
   * @param {Object} imageData - Image data from API (URL or base64)
   * @param {string} prompt - Original prompt (for filename)
   * @returns {Promise<string>} - Path to cached file
   */
  async _cacheImage(imageData, prompt) {
    try {
      const timestamp = Date.now();
      const safePrompt = prompt.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${timestamp}_${safePrompt}.png`;
      const filepath = path.join(this.cacheDir, filename);

      if (imageData.url) {
        // Download from URL
        const response = await axios.get(imageData.url, {
          responseType: 'arraybuffer',
          timeout: 30000
        });
        fs.writeFileSync(filepath, response.data);
      } else if (imageData.b64_json) {
        // Decode base64
        const buffer = Buffer.from(imageData.b64_json, 'base64');
        fs.writeFileSync(filepath, buffer);
      } else {
        throw new Error('Image data does not contain URL or base64');
      }

      this.logger.info(`Image cached to: ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.error(`Failed to cache image: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get cached image path if it exists
   * @param {string} filename - Image filename
   * @returns {string|null} - Full path or null
   */
  getCachedImage(filename) {
    const filepath = path.join(this.cacheDir, filename);
    return fs.existsSync(filepath) ? filepath : null;
  }

  /**
   * Clean old cached images (older than N days)
   * @param {number} daysOld - Days threshold
   */
  cleanOldCache(daysOld = 7) {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      let cleaned = 0;

      for (const file of files) {
        const filepath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filepath);
        
        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filepath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.logger.info(`Cleaned ${cleaned} old cached images`);
      }
    } catch (error) {
      this.logger.error(`Failed to clean cache: ${error.message}`);
    }
  }

  /**
   * Get style prompt based on story theme
   * @param {string} theme - Story theme
   * @returns {string} - Style description
   */
  getStyleForTheme(theme) {
    const styles = {
      fantasy: 'epic fantasy art, detailed, dramatic lighting, magical atmosphere, high quality digital art, realistic style',
      cyberpunk: 'cyberpunk style, neon lights, futuristic cityscape, sci-fi, high tech, detailed digital art, realistic style',
      horror: 'dark horror atmosphere, eerie lighting, suspenseful mood, detailed horror art style, realistic',
      scifi: 'science fiction art, space, futuristic technology, detailed sci-fi illustration, realistic style',
      mystery: 'mysterious atmosphere, noir style, dramatic shadows, detective aesthetic, realistic',
      adventure: 'adventure illustration, dynamic scene, action-packed, vibrant colors, detailed art, realistic style',
      romance: 'romantic atmosphere, soft lighting, beautiful scenery, emotional illustration, realistic style',
      comedy: 'whimsical art style, bright colors, fun atmosphere, cartoonish but detailed',
      // Furry-specific themes - use comic/cartoon style instead of realism
      furry_fantasy: 'furry art style, anthropomorphic animal characters, comic book illustration style, vibrant colors, detailed furry artwork, stylized cartoon art',
      furry_scifi: 'furry art style, anthropomorphic animal characters, space opera, comic book illustration style, vibrant sci-fi colors, detailed furry artwork, stylized cartoon art',
      furry_adventure: 'furry art style, anthropomorphic animal characters, action adventure, comic book illustration style, dynamic pose, detailed furry artwork, stylized cartoon art',
      furry_cyberpunk: 'furry art style, anthropomorphic animal characters, cyberpunk neon aesthetic, comic book illustration style, detailed furry artwork, stylized cartoon art',
      // Other themes
      superhero: 'superhero comic book art, dynamic action pose, dramatic lighting, vibrant colors, detailed comic illustration',
      postapocalyptic: 'post-apocalyptic art, gritty atmosphere, dystopian landscape, detailed illustration, realistic style'
    };

    return styles[theme.toLowerCase()] || styles.fantasy;
  }
}

module.exports = ImageService;
