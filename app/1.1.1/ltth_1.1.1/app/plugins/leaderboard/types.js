/**
 * Leaderboard Plugin Type Definitions
 * 
 * This file documents the data models used throughout the leaderboard plugin.
 * While the project uses JavaScript, these definitions serve as documentation
 * and can be referenced in JSDoc comments.
 */

/**
 * @typedef {Object} LeaderboardEntry
 * @property {string} id - Unique identifier for the user
 * @property {string} userId - User ID (alias for id)
 * @property {string} user_id - User ID (database format)
 * @property {string} name - Display name
 * @property {string} nickname - Nickname (alias for name)
 * @property {string} [uniqueId] - Unique TikTok handle
 * @property {string} [unique_id] - Unique handle (database format)
 * @property {string} [avatarUrl] - Profile picture URL
 * @property {string} [profilePictureUrl] - Profile picture URL (alias)
 * @property {string} [profile_picture_url] - Profile picture URL (database format)
 * @property {number} rank - Current rank position (1-indexed)
 * @property {number} score - Total score/coins
 * @property {number} [coins] - Coins (alias for score)
 * @property {number} [total_coins] - Total coins (database format)
 * @property {number} [deltaSinceLastUpdate] - Change in score since last update
 */

/**
 * @typedef {Object} LeaderboardState
 * @property {string} title - Leaderboard title (e.g., "Top Gifters")
 * @property {string} [subtitle] - Subtitle or additional context
 * @property {string} unitLabel - Label for the score unit (e.g., "Points", "Coins", "Gifts")
 * @property {LeaderboardEntry[]} entries - Array of leaderboard entries
 * @property {string} lastUpdatedAt - ISO timestamp of last update
 */

/**
 * @typedef {Object} LeaderboardOverlayConfig
 * @property {'bar'|'sidebar'|'popup'|'default'} layout - Layout variant
 * @property {'neon'|'elegant'|'gaming'|'royal'|'gradient'} theme - Visual theme
 * @property {number} maxEntries - Maximum number of entries to display
 * @property {boolean} showAvatars - Whether to show user avatars
 * @property {boolean} showDelta - Whether to show score changes
 * @property {'off'|'low'|'high'} animationIntensity - Animation intensity level
 * @property {boolean} [showProgress] - Show progress bars (sidebar only)
 * @property {boolean} [autoHide] - Auto-hide popup after delay (popup only)
 * @property {number} [hideDelay] - Auto-hide delay in ms (popup only)
 */

/**
 * @typedef {Object} LeaderboardUpdateEvent
 * @property {Object} session - Session leaderboard data
 * @property {LeaderboardEntry[]} session.data - Session entries
 * @property {string} session.startTime - Session start timestamp
 * @property {Object} alltime - All-time leaderboard data
 * @property {LeaderboardEntry[]} alltime.data - All-time entries
 */

/**
 * @typedef {Object} LeaderboardResetEvent
 * @property {string} timestamp - Reset timestamp (ISO format)
 */

/**
 * @typedef {Object} LeaderboardHypeEvent
 * @property {string} timestamp - Event timestamp (ISO format)
 * @property {string} [reason] - Reason for hype mode (optional)
 */

/**
 * WebSocket Events emitted by the leaderboard plugin:
 * 
 * - leaderboard:update - Sent when leaderboard data changes
 *   @type {LeaderboardUpdateEvent}
 * 
 * - leaderboard:reset - Sent when session is reset
 *   @type {LeaderboardResetEvent}
 * 
 * - leaderboard:hypeStart - Signals start of hype phase
 *   @type {LeaderboardHypeEvent}
 * 
 * - leaderboard:hypeEnd - Signals end of hype phase
 *   @type {LeaderboardHypeEvent}
 */

/**
 * WebSocket Events received by the leaderboard plugin:
 * 
 * - leaderboard:request-update - Client requests current data
 * - leaderboard:reset-session - Client requests session reset (admin)
 */

/**
 * REST API Endpoints:
 * 
 * GET /api/plugins/leaderboard/session?limit=10
 * - Returns session leaderboard
 * 
 * GET /api/plugins/leaderboard/alltime?limit=10&minCoins=0
 * - Returns all-time leaderboard
 * 
 * GET /api/plugins/leaderboard/combined?limit=10
 * - Returns both session and all-time data
 * 
 * GET /api/plugins/leaderboard/user/:userId
 * - Returns stats for specific user
 * 
 * POST /api/plugins/leaderboard/reset-session
 * - Resets current session
 * 
 * GET /api/plugins/leaderboard/config
 * - Returns plugin configuration
 * 
 * POST /api/plugins/leaderboard/config
 * - Updates plugin configuration
 * 
 * POST /api/plugins/leaderboard/hype-start
 * - Manually trigger hype mode
 * 
 * POST /api/plugins/leaderboard/hype-end
 * - Manually end hype mode
 */

/**
 * Overlay Routes:
 * 
 * GET /leaderboard/overlay
 * - Original overlay (tabbed view)
 * 
 * GET /leaderboard/overlays/bar?theme=neon&maxEntries=5
 * - Horizontal bar overlay for top/bottom of stream
 * 
 * GET /leaderboard/overlays/sidebar?theme=neon&maxEntries=10&showProgress=true
 * - Vertical sidebar overlay (400x1080)
 * 
 * GET /leaderboard/overlays/popup?theme=neon&maxEntries=5&autoHide=true&hideDelay=10000
 * - Popup overlay for temporary highlights
 */

module.exports = {
  // This module is for documentation only
  // No exports are needed, but we export an empty object to make it a valid module
};
