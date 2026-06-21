const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * OpenAI Image Generation Service
 * Supports GPT Image 1, DALL-E 2 and DALL-E 3
 */
class OpenAIImageService {
  constructor(apiKey, logger, cacheDir) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.cacheDir = cacheDir;
    this.client = new OpenAI({ apiKey });
    
    this.models = {
      'gpt-image-1': 'gpt-image-1',  // Latest multimodal image model
      'dall-e-3': 'dall-e-3',        // High quality
      'dall-e-2': 'dall-e-2'         // Cost-efficient
    };

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate image from text prompt
   * @param {string} prompt - Image description
   * @param {string} model - Model to use (gpt-image-1, dall-e-2, or dall-e-3)
   * @param {string} style - Additional style prompt (ignored, for API compatibility)
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Promise<string>} - Path to cached image file
   */
  async generateImage(prompt, model = 'gpt-image-1', style = '', width = 1024, height = 1024) {
    try {
      let modelName = this.models[model] || this.models['dall-e-2']; // Fallback to dall-e-2 if model not found
      
      // gpt-image-1 may not be available yet - fallback to dall-e-3
      if (modelName === 'gpt-image-1') {
        this.logger.warn('gpt-image-1 requested but may not be available - attempting, will fallback to dall-e-3 if fails');
      }
      
      // Different models support different sizes
      let size = '1024x1024';
      
      if (modelName === 'gpt-image-1' || modelName === 'dall-e-3') {
        // Both support: 1024x1024, 1792x1024, 1024x1792
        if (width === 1792 && height === 1024) {
          size = '1792x1024';
        } else if (width === 1024 && height === 1792) {
          size = '1024x1792';
        } else {
          size = '1024x1024';
        }
      } else {
        // DALL-E 2
        if (width === 512 && height === 512) {
          size = '512x512';
        } else if (width === 256 && height === 256) {
          size = '256x256';
        } else {
          size = '1024x1024';
        }
      }
      
      this.logger.info(`Generating image with ${modelName} (${size}): ${prompt.substring(0, 100)}...`);

      // Build parameters - only include what the model supports
      const params = {
        prompt: prompt,
        n: 1,
        size: size
      };
      
      // Only add model parameter for known models (gpt-image-1 might not exist)
      if (modelName === 'dall-e-2' || modelName === 'dall-e-3') {
        params.model = modelName;
      } else if (modelName === 'gpt-image-1') {
        // Try with gpt-image-1, but catch errors and fallback
        params.model = modelName;
      }
      
      // Only add quality for DALL-E 3
      if (modelName === 'dall-e-3') {
        params.quality = 'standard';
      }
      
      // NEVER add response_format - causes errors with OpenAI-compatible APIs like SiliconFlow
      // OpenAI API returns URLs by default
      // DO NOT add: params.response_format = 'url';
      
      this.logger.info(`Image API parameters: ${JSON.stringify(params)}`);
      
      let response;
      try {
        response = await this.client.images.generate(params);
      } catch (err) {
        // Check if error is due to unsupported parameter (OpenAI-compatible API)
        if (err.message && err.message.includes('response_format')) {
          this.logger.warn(`API doesn't support response_format parameter - likely an OpenAI-compatible endpoint`);
          throw new Error('Image generation failed: API does not support response_format parameter. Please ensure you are using the correct image provider setting for your API endpoint.');
        }
        
        // If gpt-image-1 fails, fallback to dall-e-3
        if (modelName === 'gpt-image-1' && (err.message.includes('model') || err.message.includes('parameter'))) {
          this.logger.warn(`gpt-image-1 not available, falling back to dall-e-3: ${err.message}`);
          modelName = 'dall-e-3';
          params.model = 'dall-e-3';
          params.quality = 'standard';
          this.logger.info(`Retrying with DALL-E 3: ${JSON.stringify(params)}`);
          response = await this.client.images.generate(params);
        } else {
          throw err;
        }
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No images returned from OpenAI DALL-E API');
      }

      const imageUrl = response.data[0].url;
      return await this._cacheImageFromUrl(imageUrl, prompt);
      
    } catch (error) {
      this.logger.error(`OpenAI Image Service Error: ${error.message}`);
      if (error.response) {
        this.logger.error(`API Response: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Download and cache image from URL
   * @param {string} imageUrl - URL of the image
   * @param {string} prompt - Original prompt (for filename)
   * @returns {Promise<string>} - Path to cached file
   */
  async _cacheImageFromUrl(imageUrl, prompt) {
    try {
      const timestamp = Date.now();
      const safePrompt = prompt.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${timestamp}_${safePrompt}.png`;
      const filepath = path.join(this.cacheDir, filename);

      // Download from URL
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });
      
      fs.writeFileSync(filepath, response.data);
      
      this.logger.info(`Image cached: ${filename} (${response.data.length} bytes)`);
      return filename;
    } catch (error) {
      this.logger.error(`Failed to cache image: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean old cached images
   * @param {number} daysOld - Remove files older than this many days
   */
  cleanOldCache(daysOld = 7) {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();
      const maxAge = daysOld * 24 * 60 * 60 * 1000;
      
      let cleaned = 0;
      files.forEach(file => {
        const filepath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filepath);
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filepath);
          cleaned++;
        }
      });
      
      if (cleaned > 0) {
        this.logger.info(`OpenAI Image Service: Cleaned ${cleaned} old cached images`);
      }
    } catch (error) {
      this.logger.error(`Failed to clean cache: ${error.message}`);
    }
  }

  /**
   * Get style description based on story theme
   * Note: OpenAI DALL-E doesn't support separate style parameter,
   * but this method is provided for API compatibility with SiliconFlow service
   * @param {string} theme - Story theme
   * @returns {string} - Style description (to be included in prompt)
   */
  getStyleForTheme(theme) {
    const styles = {
      fantasy: 'epic fantasy art style, detailed, dramatic lighting, magical atmosphere, high quality digital art, realistic style',
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

module.exports = OpenAIImageService;
