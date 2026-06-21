/**
 * MyInstants API Module
 * 
 * Handles all MyInstants integration with web scraping approach
 * Based on CarlosDanielDev/api-myinstants methodology
 */

const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const https = require('https');

class MyInstantsAPI {
    constructor(logger) {
        this.logger = logger || console;
        this.baseUrl = 'https://www.myinstants.com';
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        this.timeout = 15000; // Increased timeout for packaged apps
        
        // Create HTTPS agent with more permissive settings for packaged Electron apps
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: true,  // Keep TLS verification enabled
            keepAlive: true,
            timeout: this.timeout
        });
        
        // Create axios instance with default configuration
        this.axiosInstance = axios.create({
            httpsAgent: this.httpsAgent,
            timeout: this.timeout,
            headers: {
                'User-Agent': this.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });
    }

    /**
     * Search for sounds on MyInstants
     * @param {string} query - Search query
     * @param {number} page - Page number (default 1)
     * @param {number} limit - Results per page (default 20)
     * @returns {Promise<Array>} Array of sound objects
     */
    async search(query, page = 1, limit = 20) {
        try {
            this.logger.info(`[MyInstants] Searching for: "${query}" (page ${page}, limit ${limit})`);
            
            const searchUrl = `${this.baseUrl}/en/search/`;
            const response = await this.axiosInstance.get(searchUrl, {
                params: { name: query }
            });

            const $ = cheerio.load(response.data);
            const results = [];

            // Try multiple selectors for better compatibility with site changes
            // Primary: .instant class, Fallback: div with small-button, article elements
            const selectors = ['.instant', 'div.instant', '[class*="instant"]', 'article', '.sound-item'];
            let foundElements = false;
            
            for (const selector of selectors) {
                const elements = $(selector);
                if (elements.length > 0) {
                    this.logger.info(`[MyInstants] Found ${elements.length} elements with selector: ${selector}`);
                    foundElements = true;
                    
                    elements.each((index, element) => {
                        if (results.length >= limit) return false;

                        const $elem = $(element);
                        const sound = this._extractSoundData($, $elem);
                        
                        if (sound && sound.url) {
                            results.push(sound);
                        }
                    });
                    
                    if (results.length > 0) break;
                }
            }
            
            // If no results found with standard selectors, try extracting from onclick patterns
            if (results.length === 0) {
                this.logger.info(`[MyInstants] Trying fallback extraction from onclick patterns`);
                const allButtons = $('[onclick*="play"]');
                allButtons.each((index, element) => {
                    if (results.length >= limit) return false;
                    
                    const $button = $(element);
                    const onclickAttr = $button.attr('onclick') || '';
                    const soundMatch = onclickAttr.match(/play\('([^']+)'/);
                    
                    if (soundMatch && soundMatch[1]) {
                        let soundUrl = soundMatch[1];
                        if (!soundUrl.startsWith('http')) {
                            soundUrl = `${this.baseUrl}${soundUrl}`;
                        }
                        
                        // Try to find the name from parent or sibling elements
                        const $parent = $button.closest('div, article, section');
                        const name = $parent.find('a').first().text().trim() || 
                                    $parent.text().trim().split('\n')[0] || 
                                    'Sound';
                        
                        results.push({
                            id: this._generateId(soundUrl),
                            name: name.substring(0, 100),
                            url: soundUrl,
                            pageUrl: null,
                            description: '',
                            tags: [],
                            color: null
                        });
                    }
                });
            }

            this.logger.info(`[MyInstants] Found ${results.length} results for "${query}"`);
            return results;
        } catch (error) {
            this.logger.error(`[MyInstants] Search error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get trending sounds
     * @param {number} limit - Number of results (default 20)
     * @returns {Promise<Array>} Array of sound objects
     */
    async getTrending(limit = 20) {
        try {
            this.logger.info(`[MyInstants] Fetching trending sounds (limit ${limit})`);
            
            const trendingUrl = `${this.baseUrl}/en/index/us/`;
            const response = await this.axiosInstance.get(trendingUrl);

            const $ = cheerio.load(response.data);
            const results = [];

            // Try multiple selectors for better compatibility with site changes
            const selectors = ['.instant', 'div.instant', '[class*="instant"]', 'article', '.sound-item'];
            
            for (const selector of selectors) {
                const elements = $(selector);
                if (elements.length > 0) {
                    this.logger.info(`[MyInstants] Found ${elements.length} trending elements with selector: ${selector}`);
                    
                    elements.each((index, element) => {
                        if (results.length >= limit) return false;

                        const $elem = $(element);
                        const sound = this._extractSoundData($, $elem);
                        
                        if (sound && sound.url) {
                            results.push(sound);
                        }
                    });
                    
                    if (results.length > 0) break;
                }
            }
            
            // Fallback: extract from onclick patterns
            if (results.length === 0) {
                this.logger.info(`[MyInstants] Trying fallback extraction for trending`);
                const allButtons = $('[onclick*="play"]');
                allButtons.each((index, element) => {
                    if (results.length >= limit) return false;
                    
                    const $button = $(element);
                    const onclickAttr = $button.attr('onclick') || '';
                    const soundMatch = onclickAttr.match(/play\('([^']+)'/);
                    
                    if (soundMatch && soundMatch[1]) {
                        let soundUrl = soundMatch[1];
                        if (!soundUrl.startsWith('http')) {
                            soundUrl = `${this.baseUrl}${soundUrl}`;
                        }
                        
                        const $parent = $button.closest('div, article, section');
                        const name = $parent.find('a').first().text().trim() || 
                                    $parent.text().trim().split('\n')[0] || 
                                    'Sound';
                        
                        results.push({
                            id: this._generateId(soundUrl),
                            name: name.substring(0, 100),
                            url: soundUrl,
                            pageUrl: null,
                            description: '',
                            tags: [],
                            color: null
                        });
                    }
                });
            }

            this.logger.info(`[MyInstants] Found ${results.length} trending sounds`);
            return results;
        } catch (error) {
            this.logger.error(`[MyInstants] Trending error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get random sounds
     * @param {number} limit - Number of results (default 20)
     * @returns {Promise<Array>} Array of sound objects
     */
    async getRandom(limit = 20) {
        try {
            this.logger.info(`[MyInstants] Fetching random sounds (limit ${limit})`);
            
            // Fetch from trending and shuffle
            const trending = await this.getTrending(limit * 2);
            const shuffled = trending.sort(() => Math.random() - 0.5);
            const results = shuffled.slice(0, limit);

            this.logger.info(`[MyInstants] Returning ${results.length} random sounds`);
            return results;
        } catch (error) {
            this.logger.error(`[MyInstants] Random error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get categories (optional feature)
     * @returns {Promise<Array>} Array of category objects
     */
    async getCategories() {
        try {
            this.logger.info(`[MyInstants] Fetching categories`);
            
            const response = await this.axiosInstance.get(`${this.baseUrl}/en/categories/`);

            const $ = cheerio.load(response.data);
            const categories = [];

            $('.category-item, .category-link').each((index, element) => {
                const $elem = $(element);
                const name = $elem.text().trim();
                const href = $elem.attr('href');
                
                if (name && href) {
                    categories.push({
                        name: name,
                        slug: href.split('/').filter(Boolean).pop(),
                        url: href.startsWith('http') ? href : `${this.baseUrl}${href}`
                    });
                }
            });

            this.logger.info(`[MyInstants] Found ${categories.length} categories`);
            return categories;
        } catch (error) {
            this.logger.warn(`[MyInstants] Categories error: ${error.message}`);
            return []; // Categories are optional
        }
    }

    /**
     * Resolve a MyInstants page URL to direct MP3 URL
     * @param {string} pageUrl - MyInstants page URL
     * @returns {Promise<string>} Direct MP3 URL
     */
    async resolvePageUrl(pageUrl) {
        try {
            this.logger.info(`[MyInstants] Resolving page URL: ${pageUrl}`);
            
            const response = await this.axiosInstance.get(pageUrl);

            const $ = cheerio.load(response.data);
            
            // Try multiple methods to find MP3 URL
            // Method 1: From onclick attribute
            const playButtons = $('button[onclick*="play"]');
            for (let i = 0; i < playButtons.length; i++) {
                const onclickAttr = $(playButtons[i]).attr('onclick') || '';
                const soundMatch = onclickAttr.match(/play\('([^']+)'/);
                if (soundMatch && soundMatch[1]) {
                    let soundPath = soundMatch[1];
                    const mp3Url = soundPath.startsWith('http') ? soundPath : `${this.baseUrl}${soundPath}`;
                    this.logger.info(`[MyInstants] Resolved to: ${mp3Url}`);
                    return mp3Url;
                }
            }

            // Method 2: Look for direct .mp3 links
            const mp3Match = response.data.match(/https?:\/\/[^\s"'<>]+?\.mp3[^\s"'<>]*/i);
            if (mp3Match) {
                this.logger.info(`[MyInstants] Found direct MP3: ${mp3Match[0]}`);
                return mp3Match[0];
            }

            // Method 3: Look in media directory
            const mediaMatch = response.data.match(/\/media\/sounds\/[^\s"'<>]+\.mp3/i);
            if (mediaMatch) {
                const mp3Url = `${this.baseUrl}${mediaMatch[0]}`;
                this.logger.info(`[MyInstants] Found media path: ${mp3Url}`);
                return mp3Url;
            }

            throw new Error('Could not find MP3 URL in page');
        } catch (error) {
            this.logger.error(`[MyInstants] Resolve error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract sound data from HTML element
     * @private
     */
    _extractSoundData($, $elem) {
        try {
            // Find play button - try multiple selectors
            let $button = $elem.find('.small-button, button[onclick*="play"], [onclick*="play"]').first();
            
            // If not found in children, check if element itself has onclick
            if (!$button.length && $elem.attr('onclick')) {
                $button = $elem;
            }
            
            // Extract sound URL from onclick
            const onclickAttr = $button.attr('onclick') || $elem.attr('onclick') || '';
            let soundMatch = onclickAttr.match(/play\('([^']+)'/);
            
            // Try alternative pattern if first one fails
            if (!soundMatch) {
                soundMatch = onclickAttr.match(/play\("([^"]+)"/);
            }
            
            // Try to find audio source directly
            if (!soundMatch) {
                const audioSrc = $elem.find('audio source').attr('src') || $elem.find('audio').attr('src');
                if (audioSrc) {
                    soundMatch = [null, audioSrc];
                }
            }
            
            // Look for data-sound attribute
            if (!soundMatch) {
                const dataSoundUrl = $elem.attr('data-sound') || $elem.find('[data-sound]').attr('data-sound');
                if (dataSoundUrl) {
                    soundMatch = [null, dataSoundUrl];
                }
            }
            
            if (!soundMatch || !soundMatch[1]) {
                return null;
            }

            let soundUrl = soundMatch[1];
            
            // Make URL absolute
            if (!soundUrl.startsWith('http')) {
                soundUrl = `${this.baseUrl}${soundUrl}`;
            }

            // Extract name - try multiple selectors
            const $link = $elem.find('.instant-link, a[href*="/instant/"], a').first();
            const name = $link.text().trim() || 
                        $elem.find('.small-text, .sound-name, .title, h3, h4').first().text().trim() ||
                        $elem.text().trim().split('\n')[0] ||
                        'Unknown Sound';

            // Extract page URL
            const pageHref = $link.attr('href');
            const pageUrl = pageHref ? 
                (pageHref.startsWith('http') ? pageHref : `${this.baseUrl}${pageHref}`) : 
                null;

            // Generate ID from URL
            const id = this._generateId(soundUrl);

            return {
                id: id,
                name: name.substring(0, 100), // Limit name length
                url: soundUrl,
                pageUrl: pageUrl,
                description: '',
                tags: [],
                color: null
            };
        } catch (error) {
            this.logger.warn(`[MyInstants] Error extracting sound data: ${error.message}`);
            return null;
        }
    }

    /**
     * Generate unique ID from URL
     * @private
     */
    _generateId(url) {
        return crypto.createHash('md5').update(url).digest('hex').substring(0, 16);
    }

    /**
     * Validate if URL is from MyInstants
     * @param {string} url - URL to validate
     * @returns {boolean} True if valid MyInstants URL
     */
    isValidMyInstantsUrl(url) {
        try {
            const parsedUrl = new URL(url);
            return parsedUrl.hostname === 'www.myinstants.com' || 
                   parsedUrl.hostname === 'myinstants.com';
        } catch (error) {
            return false;
        }
    }

    /**
     * Get hash for URL (for cache key)
     * @param {string} url - URL to hash
     * @returns {string} MD5 hash
     */
    getUrlHash(url) {
        return crypto.createHash('md5').update(url).digest('hex');
    }
}

module.exports = MyInstantsAPI;
