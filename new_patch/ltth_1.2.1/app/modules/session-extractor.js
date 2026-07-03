// Lazy-load puppeteer to reduce startup time and allow it to be optional
// PERFORMANCE: puppeteer is ~300MB and only needed for session extraction
let puppeteer = null;
const loadPuppeteer = () => {
    if (!puppeteer) {
        try {
            puppeteer = require('puppeteer');
        } catch {
            // Puppeteer not installed - this is expected in minimal installations
            // The error will be thrown with a user-friendly message
            throw new Error('Puppeteer is not installed. This feature requires puppeteer to be installed separately. Install with: npm install puppeteer');
        }
    }
    return puppeteer;
};

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// axios: HTTP client for Eulerstream API calls (session extraction via OpenAPI)
const axios = require('axios');

/**
 * Session Extractor - Extracts TikTok session ID from Eulerstream API or browser
 * 
 * This module provides multiple methods to extract TikTok session IDs:
 * 1. Eulerstream API (primary, recommended) - Fast, reliable, automated
 * 2. Puppeteer browser automation (fallback) - Slower, requires Chrome/Chromium
 * 
 * PERFORMANCE NOTE: Puppeteer is lazy-loaded to reduce startup time.
 * The ~300MB puppeteer package is only loaded when session extraction is actually used.
 */
class SessionExtractor {
    constructor(db, configPathManager = null) {
        this.db = db;
        this.browser = null;
        this.isExtracting = false;
        
        // Session storage path - use persistent location
        if (configPathManager) {
            this.sessionPath = path.join(configPathManager.getUserDataDir(), 'tiktok_session.json');
        } else {
            // Fallback to old behavior
            this.sessionPath = path.join(process.cwd(), 'user_data', 'tiktok_session.json');
        }
    }
    
    /**
     * Check if puppeteer is available
     * @returns {boolean} - True if puppeteer can be loaded
     */
    static isPuppeteerAvailable() {
        try {
            require.resolve('puppeteer');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Helper method to extract session data from various response formats
     * @private
     * @param {object} responseData - Response data from Eulerstream API
     * @returns {object|null} - { sessionId, ttTargetIdc } or null if not found
     */
    _extractSessionFromResponse(responseData) {
        if (!responseData) return null;
        
        let sessionId = null;
        let ttTargetIdc = null;
        
        // Check top-level properties
        if (responseData.sessionId || responseData.session_id) {
            sessionId = responseData.sessionId || responseData.session_id;
        } else if (responseData.tiktok_session_id || responseData.tiktokSessionId) {
            sessionId = responseData.tiktok_session_id || responseData.tiktokSessionId;
        }
        
        // Check nested data structure
        if (!sessionId && responseData.data) {
            const data = responseData.data;
            sessionId = data.sessionId || data.session_id || data.tiktok_session_id || data.tiktokSessionId;
            ttTargetIdc = data.ttTargetIdc || data.tt_target_idc;
        }
        
        // Check cookies array
        if (!sessionId && responseData.cookies) {
            const sessionCookie = responseData.cookies.find(c => 
                c.name === 'sessionid' || c.name === 'sessionId'
            );
            if (sessionCookie) {
                sessionId = sessionCookie.value;
            }
            
            const ttTargetIdcCookie = responseData.cookies.find(c => 
                c.name === 'tt-target-idc' || c.name === 'tt_target_idc'
            );
            if (ttTargetIdcCookie) {
                ttTargetIdc = ttTargetIdcCookie.value;
            }
        }
        
        return sessionId ? { sessionId, ttTargetIdc } : null;
    }

    /**
     * Extract session ID from Eulerstream API
     * This is the primary and recommended method - fast, reliable, and automated.
     * 
     * @param {object} options - Extraction options
     * @param {string} options.apiKey - Eulerstream API key (optional, will use stored key if not provided)
     * @param {string} options.accountId - Eulerstream account ID (optional, will be retrieved from API)
     * @returns {Promise<object>} - Extraction result with sessionId
     */
    async extractSessionIdFromEulerstream(options = {}) {
        try {
            console.log('🌐 Extracting session ID from Eulerstream API...');
            
            // Get Eulerstream API key from options, database, or environment
            let apiKey = options.apiKey || 
                         this.db.getSetting('tiktok_euler_api_key') || 
                         this.db.getSetting('euler_api_key') ||
                         process.env.EULER_API_KEY || 
                         process.env.SIGN_API_KEY;
            
            if (!apiKey || apiKey === 'null' || apiKey.trim().length === 0) {
                return {
                    success: false,
                    error: 'No Eulerstream API key configured',
                    message: 'Please configure your Eulerstream API key in settings or environment variable EULER_API_KEY',
                    requiresApiKey: true
                };
            }
            
            // Trim and validate API key format
            apiKey = apiKey.trim();
            
            // Basic validation: Eulerstream API keys should be reasonably long (at least 20 chars)
            if (apiKey.length < 20) {
                return {
                    success: false,
                    error: 'Invalid API key format',
                    message: 'Eulerstream API key appears to be too short. Please check your configuration.',
                    requiresValidApiKey: true
                };
            }
            
            console.log(`📡 Using Eulerstream API key: ${apiKey.substring(0, 10)}...`);
            
            // Eulerstream OpenAPI base URL
            // Can be overridden via environment variable for different environments or API versions
            // Validate that URL uses HTTPS for security
            const baseUrl = process.env.EULERSTREAM_API_URL || 'https://www.eulerstream.com/api';
            if (!baseUrl.startsWith('https://')) {
                return {
                    success: false,
                    error: 'Invalid API URL',
                    message: 'Eulerstream API URL must use HTTPS protocol for security',
                    suggestion: 'Ensure EULERSTREAM_API_URL environment variable starts with https://'
                };
            }
            
            // Step 1: Get account information to retrieve account ID
            // The API key is sent as Authorization header
            let accountId = options.accountId;
            
            if (!accountId) {
                console.log('🔍 Retrieving account information...');
                try {
                    const accountResponse = await axios.get(`${baseUrl}/accounts/me`, {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 10000
                    });
                    
                    if (accountResponse.data && accountResponse.data.id) {
                        accountId = accountResponse.data.id;
                        console.log(`✅ Account ID retrieved: ${accountId}`);
                    } else {
                        return {
                            success: false,
                            error: 'Could not retrieve account ID from Eulerstream API',
                            message: 'Eulerstream API did not return account information. Please verify your API key.',
                            response: accountResponse.data
                        };
                    }
                } catch (accountError) {
                    console.error('❌ Failed to retrieve account information:', accountError.message);
                    return {
                        success: false,
                        error: 'Failed to retrieve account information',
                        message: accountError.response?.data?.message || accountError.message,
                        statusCode: accountError.response?.status,
                        requiresValidApiKey: accountError.response?.status === 401 || accountError.response?.status === 403
                    };
                }
            }
            
            // Step 2: Retrieve API keys/session information for the account
            // NOTE: This endpoint structure is based on the problem statement URL:
            // https://www.eulerstream.com/docs/openapi#tag/authentication/get/accounts/{account_id}/api_keys/retrieve
            // The actual response structure may vary and might need adjustment based on Eulerstream's implementation.
            // If this endpoint returns 404, it may indicate that session extraction requires a specific
            // Eulerstream plan or needs to be enabled by contacting support.
            console.log(`🔑 Retrieving session keys for account ${accountId}...`);
            try {
                const keysResponse = await axios.get(
                    `${baseUrl}/accounts/${accountId}/api_keys/retrieve`,
                    {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 10000
                    }
                );
                
                // Parse response to find TikTok session ID using helper method
                if (keysResponse.data) {
                    console.log('📦 Received keys response from Eulerstream');
                    
                    // Use helper method to extract session data from various response formats
                    const extracted = this._extractSessionFromResponse(keysResponse.data);
                    
                    if (!extracted || !extracted.sessionId) {
                        console.warn('⚠️  Could not find session ID in Eulerstream API response');
                        console.warn('Response structure:', JSON.stringify(keysResponse.data, null, 2));
                        
                        return {
                            success: false,
                            error: 'Session ID not found in API response',
                            message: 'Eulerstream API responded but did not include a TikTok session ID. This may mean your account does not have session extraction enabled.',
                            response: keysResponse.data,
                            suggestion: 'Contact Eulerstream support to enable TikTok session extraction for your account, or use the browser-based extraction method as fallback.'
                        };
                    }
                    
                    const { sessionId, ttTargetIdc } = extracted;
                    
                    // Use hash for logging to prevent session prediction attacks
                    const sessionHash = crypto.createHash('md5').update(sessionId).digest('hex').substring(0, 8);
                    console.log(`✅ Session ID extracted from Eulerstream: ${sessionHash}... (hash)`);
                    if (ttTargetIdc) {
                        console.log(`✅ TT Target IDC extracted: ${ttTargetIdc}`);
                    }
                    
                    // Save session data
                    const sessionData = {
                        sessionId,
                        ttTargetIdc,
                        extractedAt: new Date().toISOString(),
                        method: 'eulerstream_api',
                        accountId
                    };
                    
                    // Save to file
                    this._saveSessionData(sessionData);
                    
                    // Save to database settings
                    this.db.setSetting('tiktok_session_id', sessionId);
                    if (ttTargetIdc) {
                        this.db.setSetting('tiktok_tt_target_idc', ttTargetIdc);
                    }
                    this.db.setSetting('tiktok_session_extracted_at', sessionData.extractedAt);
                    this.db.setSetting('tiktok_session_method', 'eulerstream_api');
                    
                    return {
                        success: true,
                        sessionId,
                        ttTargetIdc,
                        extractedAt: sessionData.extractedAt,
                        method: 'eulerstream_api',
                        message: 'Session ID extracted successfully from Eulerstream API'
                    };
                }
                
                return {
                    success: false,
                    error: 'Empty response from Eulerstream API',
                    message: 'Eulerstream API returned an empty response'
                };
                
            } catch (keysError) {
                console.error('❌ Failed to retrieve session keys:', keysError.message);
                
                // Check if this is a 404 (endpoint not available for this account/plan)
                if (keysError.response?.status === 404) {
                    return {
                        success: false,
                        error: 'Session extraction not available',
                        message: 'TikTok session extraction is not available for your Eulerstream account. This feature may require a specific plan or contact support to enable it.',
                        statusCode: 404,
                        suggestion: 'Use the browser-based Puppeteer extraction method as an alternative, or contact Eulerstream support to enable session extraction.',
                        fallbackAvailable: true
                    };
                }
                
                return {
                    success: false,
                    error: 'Failed to retrieve session keys',
                    message: keysError.response?.data?.message || keysError.message,
                    statusCode: keysError.response?.status,
                    suggestion: 'Verify your Eulerstream API key and account permissions, or use browser-based extraction as fallback.'
                };
            }
            
        } catch (error) {
            console.error('❌ Eulerstream session extraction failed:', error);
            
            return {
                success: false,
                error: error.message,
                message: `Eulerstream session extraction failed: ${error.message}`,
                suggestion: 'Use browser-based Puppeteer extraction as fallback.'
            };
        }
    }

    /**
     * Extract session ID using the best available method
     * Tries Eulerstream API first (fast, reliable), then falls back to Puppeteer (slow but works)
     * 
     * @param {object} options - Extraction options
     * @param {string} options.method - Force specific method: 'eulerstream', 'puppeteer', or 'auto' (default)
     * @param {boolean} options.headless - Run browser in headless mode (for Puppeteer)
     * @param {string} options.apiKey - Eulerstream API key (for Eulerstream method)
     * @returns {Promise<object>} - Extraction result with sessionId
     */
    async extractSessionId(options = {}) {
        if (this.isExtracting) {
            return {
                success: false,
                inProgress: true,
                message: 'Session extraction already in progress. Please wait for the current extraction to complete.'
            };
        }

        this.isExtracting = true;

        try {
            const method = options.method || 'auto';

            // Method 1: Try Eulerstream API first (unless explicitly disabled)
            if (method === 'auto' || method === 'eulerstream') {
                console.log('🌐 Attempting Eulerstream API method (primary)...');
                const eulerstreamResult = await this.extractSessionIdFromEulerstream(options);
                
                if (eulerstreamResult.success) {
                    console.log('✅ Eulerstream API extraction successful!');
                    return eulerstreamResult;
                }
                
                console.warn('⚠️  Eulerstream API method failed:', eulerstreamResult.message);
                
                // If Eulerstream was explicitly requested, don't try fallback
                if (method === 'eulerstream') {
                    return eulerstreamResult;
                }
                
                // If fallback is available, continue to Puppeteer method
                console.log('📋 Falling back to browser-based Puppeteer extraction...');
            }

            // Method 2: Puppeteer browser automation (fallback or explicit)
            if (method === 'auto' || method === 'puppeteer') {
                console.log('🌐 Attempting Puppeteer browser automation method...');
                const puppeteerResult = await this._extractSessionIdWithPuppeteer(options);
                return puppeteerResult;
            }

            return {
                success: false,
                error: 'Invalid extraction method',
                message: `Unknown extraction method: ${method}. Valid methods: 'eulerstream', 'puppeteer', 'auto'`
            };

        } finally {
            this.isExtracting = false;
        }
    }

    /**
     * Launch browser and extract session ID using Puppeteer (private method)
     * This is the fallback method when Eulerstream API is not available.
     * 
     * @private
     * @param {object} options - Extraction options
     * @returns {Promise<object>} - Extraction result with sessionId
     */
    async _extractSessionIdWithPuppeteer(options = {}) {
        try {
            console.log('🌐 Starting browser-based session extraction...');

            // Launch browser
            const browserOptions = {
                headless: options.headless !== false ? 'new' : false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920,1080',
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ],
                ...(options.executablePath && { executablePath: options.executablePath })
            };

            this.browser = await loadPuppeteer().launch(browserOptions);
            const page = await this.browser.newPage();

            // Set viewport
            await page.setViewport({ width: 1920, height: 1080 });

            // Navigate to TikTok
            console.log('📱 Navigating to TikTok...');
            await page.goto('https://www.tiktok.com/', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait a bit for cookies to be set
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Extract cookies
            const cookies = await page.cookies();
            
            // Find session ID cookie
            const sessionCookie = cookies.find(cookie => 
                cookie.name === 'sessionid' || cookie.name === 'sessionId'
            );

            // Find tt-target-idc cookie
            const ttTargetIdcCookie = cookies.find(cookie => 
                cookie.name === 'tt-target-idc' || cookie.name === 'tt_target_idc'
            );

            if (!sessionCookie) {
                console.warn('⚠️  Session ID cookie not found');
                
                // Check if user is not logged in
                const isLoggedIn = await page.evaluate(() => {
                    // Check for common TikTok login indicators
                    return document.querySelector('[data-e2e="profile-icon"]') !== null ||
                           document.querySelector('.avatar') !== null ||
                           localStorage.getItem('userId') !== null;
                });

                if (!isLoggedIn) {
                    return {
                        success: false,
                        message: 'Not logged in to TikTok. Please log in manually first.',
                        requiresLogin: true,
                        cookies: cookies.map(c => ({ name: c.name, domain: c.domain }))
                    };
                }

                return {
                    success: false,
                    message: 'Session ID not found in cookies',
                    cookies: cookies.map(c => ({ name: c.name, domain: c.domain }))
                };
            }

            const sessionId = sessionCookie.value;
            const ttTargetIdc = ttTargetIdcCookie ? ttTargetIdcCookie.value : null;

            // Use hash for logging to prevent session prediction attacks
            const sessionHash = crypto.createHash('md5').update(sessionId).digest('hex').substring(0, 8);
            console.log(`✅ Session ID extracted: ${sessionHash}... (hash)`);
            if (ttTargetIdc) {
                console.log(`✅ TT Target IDC extracted: ${ttTargetIdc}`);
            }

            // Save session data
            const sessionData = {
                sessionId,
                ttTargetIdc,
                extractedAt: new Date().toISOString(),
                method: 'puppeteer',
                cookies: cookies.map(c => ({
                    name: c.name,
                    value: c.value,
                    domain: c.domain,
                    path: c.path,
                    expires: c.expires,
                    httpOnly: c.httpOnly,
                    secure: c.secure,
                    sameSite: c.sameSite
                }))
            };

            // Save to file
            this._saveSessionData(sessionData);

            // Save to database settings
            this.db.setSetting('tiktok_session_id', sessionId);
            if (ttTargetIdc) {
                this.db.setSetting('tiktok_tt_target_idc', ttTargetIdc);
            }
            this.db.setSetting('tiktok_session_extracted_at', sessionData.extractedAt);
            this.db.setSetting('tiktok_session_method', 'puppeteer');

            return {
                success: true,
                sessionId,
                ttTargetIdc,
                extractedAt: sessionData.extractedAt,
                method: 'puppeteer',
                message: 'Session ID extracted successfully using browser automation'
            };

        } catch (error) {
            console.error('❌ Browser-based session extraction failed:', error);
            
            return {
                success: false,
                error: error.message,
                message: `Browser-based session extraction failed: ${error.message}`
            };
        } finally {
            // Close browser
            if (this.browser) {
                try {
                    await this.browser.close();
                } catch (err) {
                    console.warn('⚠️  Error closing browser:', err.message);
                }
                this.browser = null;
            }
        }
    }

    /**
     * Extract session ID with manual login
     * Opens browser in non-headless mode for user to login
     */
    async extractWithManualLogin(options = {}) {
        console.log('🌐 Opening browser for manual login...');
        console.log('📌 Please log in to TikTok in the browser window');
        console.log('⏳ Waiting 60 seconds for login...');

        // Force Puppeteer method with non-headless mode
        const result = await this.extractSessionId({
            ...options,
            method: 'puppeteer',
            headless: false
        });

        if (result.success) {
            return result;
        }

        // If extraction is already in progress, return the status
        if (result.inProgress) {
            return result;
        }

        // If not successful, wait longer and try again
        if (this.browser) {
            const page = await this.browser.newPage();
            await page.goto('https://www.tiktok.com/', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait for user to login (60 seconds)
            console.log('⏳ Waiting for login...');
            await new Promise(resolve => setTimeout(resolve, 60000));

            // Try extracting again
            const cookies = await page.cookies();
            const sessionCookie = cookies.find(cookie => 
                cookie.name === 'sessionid' || cookie.name === 'sessionId'
            );

            if (sessionCookie) {
                const sessionData = {
                    sessionId: sessionCookie.value,
                    extractedAt: new Date().toISOString(),
                    method: 'puppeteer_manual',
                    cookies: cookies.map(c => ({
                        name: c.name,
                        value: c.value,
                        domain: c.domain
                    }))
                };

                this._saveSessionData(sessionData);
                this.db.setSetting('tiktok_session_id', sessionCookie.value);
                this.db.setSetting('tiktok_session_method', 'puppeteer_manual');

                await this.browser.close();
                this.browser = null;

                return {
                    success: true,
                    sessionId: sessionCookie.value,
                    extractedAt: sessionData.extractedAt,
                    method: 'puppeteer_manual',
                    message: 'Session ID extracted after manual login'
                };
            }
        }

        return result;
    }

    /**
     * Load saved session data
     */
    loadSessionData() {
        try {
            if (fs.existsSync(this.sessionPath)) {
                const data = fs.readFileSync(this.sessionPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('❌ Error loading session data:', error);
        }
        return null;
    }

    /**
     * Save session data to file
     * @private
     */
    _saveSessionData(data) {
        try {
            const dir = path.dirname(this.sessionPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(this.sessionPath, JSON.stringify(data, null, 2), 'utf8');
            console.log(`💾 Session data saved to ${this.sessionPath}`);
        } catch (error) {
            console.error('❌ Error saving session data:', error);
        }
    }

    /**
     * Clear saved session data
     */
    clearSessionData() {
        try {
            if (fs.existsSync(this.sessionPath)) {
                fs.unlinkSync(this.sessionPath);
                console.log('🗑️  Session data cleared');
            }

            // Clear from database
            this.db.setSetting('tiktok_session_id', null);
            this.db.setSetting('tiktok_tt_target_idc', null);
            this.db.setSetting('tiktok_session_extracted_at', null);
            this.db.setSetting('tiktok_session_method', null);

            return { success: true, message: 'Session data cleared' };
        } catch (error) {
            console.error('❌ Error clearing session data:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get current session status
     */
    getSessionStatus() {
        const sessionId = this.db.getSetting('tiktok_session_id');
        const extractedAt = this.db.getSetting('tiktok_session_extracted_at');
        const ttTargetIdc = this.db.getSetting('tiktok_tt_target_idc');
        const method = this.db.getSetting('tiktok_session_method') || 'unknown';

        // Check for valid session (not null, not empty, not the string "null")
        const hasValidSession = sessionId && sessionId !== 'null' && sessionId.length > 0;

        return {
            hasSession: hasValidSession,
            sessionId: hasValidSession ? `${sessionId.substring(0, 10)}...` : null,
            ttTargetIdc: (ttTargetIdc && ttTargetIdc !== 'null') ? ttTargetIdc : null,
            extractedAt: (extractedAt && extractedAt !== 'null') ? extractedAt : null,
            method: method,
            isExtracting: this.isExtracting
        };
    }

    /**
     * Test if browser automation is available
     */
    async testBrowserAvailability() {
        try {
            const pptr = loadPuppeteer();
            const browser = await pptr.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            await browser.close();
            return { available: true, message: 'Browser automation is available' };
        } catch (error) {
            return { 
                available: false, 
                error: error.message,
                message: error.message.includes('not installed') 
                    ? 'Puppeteer is not installed. Install with: npm install puppeteer'
                    : 'Browser automation not available. You may need to install Chrome/Chromium.'
            };
        }
    }
}

module.exports = SessionExtractor;
