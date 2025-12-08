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

/**
 * Session Extractor - Extracts TikTok session ID from browser
 * 
 * This module uses Puppeteer to launch a headless browser, navigate to TikTok,
 * and extract the session ID cookie. This can help improve connection reliability
 * when encountering 504 Sign API errors.
 * 
 * PERFORMANCE NOTE: Puppeteer is now lazy-loaded to reduce startup time.
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
     * Launch browser and extract session ID
     * @param {object} options - Extraction options
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
            console.log('🌐 Starting session extraction...');

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

            console.log(`✅ Session ID extracted: ${sessionId.substring(0, 10)}...`);
            if (ttTargetIdc) {
                console.log(`✅ TT Target IDC extracted: ${ttTargetIdc}`);
            }

            // Save session data
            const sessionData = {
                sessionId,
                ttTargetIdc,
                extractedAt: new Date().toISOString(),
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

            return {
                success: true,
                sessionId,
                ttTargetIdc,
                extractedAt: sessionData.extractedAt,
                message: 'Session ID extracted successfully'
            };

        } catch (error) {
            console.error('❌ Session extraction failed:', error);
            
            return {
                success: false,
                error: error.message,
                message: `Session extraction failed: ${error.message}`
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
            this.isExtracting = false;
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

        const result = await this.extractSessionId({
            ...options,
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
                    cookies: cookies.map(c => ({
                        name: c.name,
                        value: c.value,
                        domain: c.domain
                    }))
                };

                this._saveSessionData(sessionData);
                this.db.setSetting('tiktok_session_id', sessionCookie.value);

                await this.browser.close();
                this.browser = null;

                return {
                    success: true,
                    sessionId: sessionCookie.value,
                    extractedAt: sessionData.extractedAt,
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

        // Check for valid session (not null, not empty, not the string "null")
        const hasValidSession = sessionId && sessionId !== 'null' && sessionId.length > 0;

        return {
            hasSession: hasValidSession,
            sessionId: hasValidSession ? `${sessionId.substring(0, 10)}...` : null,
            ttTargetIdc: (ttTargetIdc && ttTargetIdc !== 'null') ? ttTargetIdc : null,
            extractedAt: (extractedAt && extractedAt !== 'null') ? extractedAt : null,
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
