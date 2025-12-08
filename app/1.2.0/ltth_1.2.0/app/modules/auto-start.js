const AutoLaunch = require('auto-launch');
const path = require('path');
const logger = require('./logger');

/**
 * Auto-Start Manager
 * Manages application auto-start on system boot for Windows, macOS, and Linux
 */
class AutoStartManager {
    constructor() {
        this.autoLauncher = null;
        this.isInitialized = false;
        this.initializeAutoLauncher();
    }

    /**
     * Initialize the auto-launcher instance
     */
    initializeAutoLauncher() {
        try {
            const appPath = process.pkg
                ? process.execPath // If bundled with pkg
                : path.join(__dirname, '..', 'launch.js'); // Development mode

            const appName = 'TikTokStreamTool';

            this.autoLauncher = new AutoLaunch({
                name: appName,
                path: process.pkg ? process.execPath : process.execPath,
                isHidden: false, // Can be configured later
            });

            // For development mode (Node.js), we need to use a different approach
            if (!process.pkg) {
                // In development, use node to run the launch script
                this.autoLauncher = new AutoLaunch({
                    name: appName,
                    path: process.execPath,
                    args: [
                        path.join(__dirname, '..', 'launch.js')
                    ],
                    isHidden: false,
                });
            }

            this.isInitialized = true;
            logger.info('AutoStartManager initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize AutoStartManager:', error);
            this.isInitialized = false;
        }
    }

    /**
     * Enable auto-start on system boot
     * @param {boolean} hidden - Start application hidden/minimized
     * @returns {Promise<boolean>}
     */
    async enable(hidden = false) {
        if (!this.isInitialized) {
            logger.error('AutoStartManager not initialized');
            return false;
        }

        try {
            const isEnabled = await this.isEnabled();

            if (isEnabled) {
                // If already enabled, disable first to update settings
                await this.disable();
            }

            // Update hidden setting if needed
            if (hidden !== this.autoLauncher.opts.isHidden) {
                this.autoLauncher.opts.isHidden = hidden;
            }

            await this.autoLauncher.enable();
            logger.info(`Auto-start enabled (hidden: ${hidden})`);
            return true;
        } catch (error) {
            logger.error('Failed to enable auto-start:', error);
            return false;
        }
    }

    /**
     * Disable auto-start on system boot
     * @returns {Promise<boolean>}
     */
    async disable() {
        if (!this.isInitialized) {
            logger.error('AutoStartManager not initialized');
            return false;
        }

        try {
            const isEnabled = await this.isEnabled();

            if (!isEnabled) {
                logger.info('Auto-start already disabled');
                return true;
            }

            await this.autoLauncher.disable();
            logger.info('Auto-start disabled');
            return true;
        } catch (error) {
            logger.error('Failed to disable auto-start:', error);
            return false;
        }
    }

    /**
     * Check if auto-start is currently enabled
     * @returns {Promise<boolean>}
     */
    async isEnabled() {
        if (!this.isInitialized) {
            return false;
        }

        try {
            return await this.autoLauncher.isEnabled();
        } catch (error) {
            logger.error('Failed to check auto-start status:', error);
            return false;
        }
    }

    /**
     * Get current auto-start configuration
     * @returns {Promise<Object>}
     */
    async getStatus() {
        const enabled = await this.isEnabled();

        return {
            enabled,
            hidden: this.autoLauncher?.opts?.isHidden || false,
            platform: process.platform,
            supported: this.isInitialized,
            appPath: this.autoLauncher?.opts?.path || null,
        };
    }

    /**
     * Toggle auto-start on/off
     * @param {boolean} enabled - Enable or disable
     * @param {boolean} hidden - Start hidden/minimized
     * @returns {Promise<boolean>}
     */
    async toggle(enabled, hidden = false) {
        if (enabled) {
            return await this.enable(hidden);
        } else {
            return await this.disable();
        }
    }

    /**
     * Check if auto-start is supported on this platform
     * @returns {boolean}
     */
    isSupported() {
        // auto-launch supports Windows, macOS, and Linux
        const supportedPlatforms = ['win32', 'darwin', 'linux'];
        return supportedPlatforms.includes(process.platform) && this.isInitialized;
    }

    /**
     * Get platform-specific information
     * @returns {Object}
     */
    getPlatformInfo() {
        const platform = process.platform;
        let info = {
            platform,
            name: 'Unknown',
            method: 'Unknown',
        };

        switch (platform) {
            case 'win32':
                info.name = 'Windows';
                info.method = 'Registry (Run key)';
                info.location = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
                break;
            case 'darwin':
                info.name = 'macOS';
                info.method = 'Login Items';
                info.location = '~/Library/LaunchAgents';
                break;
            case 'linux':
                info.name = 'Linux';
                info.method = 'Desktop Entry';
                info.location = '~/.config/autostart';
                break;
        }

        return info;
    }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton instance of AutoStartManager
 * @returns {AutoStartManager}
 */
function getAutoStartManager() {
    if (!instance) {
        instance = new AutoStartManager();
    }
    return instance;
}

module.exports = getAutoStartManager;
