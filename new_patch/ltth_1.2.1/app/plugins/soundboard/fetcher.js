/**
 * Soundboard Fetcher
 * 
 * Handles validation for soundboard preview system:
 * - Path traversal protection for local files
 * - URL whitelist validation for external sources
 */

const path = require('path');

class SoundboardFetcher {
    constructor() {
        // Get allowed hosts from environment or use defaults
        const envHosts = process.env.SOUNDBOARD_ALLOWED_HOSTS || '';
        const defaultHosts = ['myinstants.com', 'www.myinstants.com', 'openshock.com', 'www.openshock.com'];
        
        // Parse environment variable (comma-separated list)
        const additionalHosts = envHosts.split(',').map(h => h.trim()).filter(h => h.length > 0);
        
        // Combine default and additional hosts
        this.allowedHosts = [...new Set([...defaultHosts, ...additionalHosts])];
        
        console.log(`[SoundboardFetcher] Allowed hosts: ${this.allowedHosts.join(', ')}`);
    }

    /**
     * Validate local file path for security
     * Prevents path traversal attacks
     * 
     * @param {string} filename - Filename to validate
     * @param {string} baseDir - Base directory for sounds (absolute path)
     * @returns {Object} { valid: boolean, error?: string, resolvedPath?: string }
     */
    validateLocalPath(filename, baseDir) {
        if (!filename || typeof filename !== 'string') {
            return { valid: false, error: 'Invalid filename' };
        }

        // Reject if contains path separators or attempts traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            console.warn(`[SoundboardFetcher] Path traversal attempt blocked: ${filename}`);
            return { valid: false, error: 'Path traversal not allowed' };
        }

        // Only allow certain file extensions
        const allowedExtensions = ['.mp3', '.wav', '.ogg', '.m4a'];
        const ext = path.extname(filename).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return { valid: false, error: `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}` };
        }

        // Resolve the path and ensure it's within baseDir
        const resolvedPath = path.resolve(baseDir, filename);
        const normalizedBase = path.resolve(baseDir);
        
        if (!resolvedPath.startsWith(normalizedBase + path.sep)) {
            console.warn(`[SoundboardFetcher] Path escape attempt blocked: ${filename}`);
            return { valid: false, error: 'Path must be within sounds directory' };
        }

        return { 
            valid: true, 
            resolvedPath: resolvedPath,
            filename: filename
        };
    }

    /**
     * Validate external URL against whitelist
     * 
     * @param {string} url - URL to validate
     * @returns {Object} { valid: boolean, error?: string, url?: string }
     */
    validateExternalUrl(url) {
        if (!url || typeof url !== 'string') {
            return { valid: false, error: 'Invalid URL' };
        }

        // Parse URL
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch (error) {
            return { valid: false, error: 'Malformed URL' };
        }

        // Only allow http and https protocols
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
        }

        // Check if hostname is in whitelist
        const hostname = parsedUrl.hostname.toLowerCase();
        const isAllowed = this.allowedHosts.some(allowedHost => {
            // Exact match or subdomain match
            return hostname === allowedHost || hostname.endsWith('.' + allowedHost);
        });

        if (!isAllowed) {
            console.warn(`[SoundboardFetcher] Blocked URL from non-whitelisted host: ${hostname}`);
            return { 
                valid: false, 
                error: `Host not allowed. Allowed hosts: ${this.allowedHosts.join(', ')}`
            };
        }

        return { 
            valid: true, 
            url: parsedUrl.href // Return normalized URL
        };
    }

    /**
     * Add host to whitelist at runtime (for testing or dynamic configuration)
     * 
     * @param {string} host - Hostname to add
     */
    addAllowedHost(host) {
        if (host && typeof host === 'string') {
            const normalizedHost = host.toLowerCase().trim();
            if (!this.allowedHosts.includes(normalizedHost)) {
                this.allowedHosts.push(normalizedHost);
                console.log(`[SoundboardFetcher] Added allowed host: ${normalizedHost}`);
            }
        }
    }

    /**
     * Get list of allowed hosts
     * 
     * @returns {Array<string>} List of allowed hostnames
     */
    getAllowedHosts() {
        return [...this.allowedHosts];
    }
}

module.exports = SoundboardFetcher;
