/**
 * Permission Checker
 * 
 * Validates user permissions for command execution.
 */

const config = require('./config');

class PermissionChecker {
    constructor(logger) {
        this.logger = logger;
    }

    /**
     * Check if a user has permission to execute a command
     * @param {string} userRole - User's role (broadcaster, moderator, vip, subscriber, all)
     * @param {string} requiredPermission - Required permission level
     * @returns {boolean} True if user has permission
     */
    checkPermission(userRole, requiredPermission) {
        // Normalize to lowercase
        const role = (userRole || 'all').toLowerCase();
        const required = (requiredPermission || 'all').toLowerCase();
        
        // Get hierarchy indices
        const userLevel = config.PERMISSION_HIERARCHY.indexOf(role);
        const requiredLevel = config.PERMISSION_HIERARCHY.indexOf(required);
        
        // If either is not in hierarchy, default to strict match
        if (userLevel === -1 || requiredLevel === -1) {
            this.logger.warn(`[GCCE Permissions] Unknown role or permission: ${role}/${required}`);
            return role === required;
        }
        
        // User must have equal or higher permission level
        return userLevel >= requiredLevel;
    }

    /**
     * Get user role from TikTok user data
     * @param {Object} userData - TikTok user data
     * @returns {string} User role
     */
    getUserRole(userData) {
        // Check if broadcaster/streamer
        if (userData.isBroadcaster || userData.isHost) {
            return 'broadcaster';
        }
        
        // Check if moderator
        if (userData.isModerator || userData.teamMemberLevel > 0) {
            return 'moderator';
        }
        
        // Check if subscriber
        if (userData.isSubscriber) {
            return 'subscriber';
        }
        
        // Check if follower (can be treated as VIP in some cases)
        if (userData.isFollower) {
            return 'vip';
        }
        
        // Default to all
        return 'all';
    }

    /**
     * Get permission level name
     * @param {string} permission - Permission level
     * @returns {string} Human-readable permission name
     */
    getPermissionName(permission) {
        const names = {
            'all': 'Everyone',
            'subscriber': 'Subscribers',
            'vip': 'VIP & Above',
            'moderator': 'Moderators & Above',
            'broadcaster': 'Broadcaster Only'
        };
        
        return names[permission] || permission;
    }

    /**
     * Check if a permission level is valid
     * @param {string} permission - Permission to check
     * @returns {boolean} True if valid
     */
    isValidPermission(permission) {
        return config.PERMISSION_HIERARCHY.includes(permission.toLowerCase());
    }
}

module.exports = PermissionChecker;
