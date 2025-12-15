/**
 * Debug Routes
 * API endpoints for controlling and accessing debug logs
 */

/**
 * Setup debug routes
 * @param {Object} app - Express app instance
 * @param {Object} debugLogger - Debug logger instance
 * @param {Object} logger - Main logger instance
 */
function setupDebugRoutes(app, debugLogger, logger) {
    
    // GET /api/debug/status - Get debug status
    app.get('/api/debug/status', (req, res) => {
        try {
            res.json({
                success: true,
                enabled: debugLogger.enabled,
                stats: debugLogger.getStats()
            });
        } catch (error) {
            logger.error('Error getting debug status:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });

    // POST /api/debug/enable - Enable/disable debug logging
    app.post('/api/debug/enable', (req, res) => {
        try {
            const { enable } = req.body;
            debugLogger.setEnabled(enable);
            logger.info(`[DEBUG] Logging ${enable ? 'enabled' : 'disabled'}`);

            res.json({
                success: true,
                enabled: debugLogger.enabled,
                message: `Debug logging ${enable ? 'enabled' : 'disabled'}`
            });
        } catch (error) {
            logger.error('Error toggling debug:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });

    // POST /api/debug/filter - Set category filter
    app.post('/api/debug/filter', (req, res) => {
        try {
            const { category, enabled } = req.body;
            debugLogger.setFilter(category, enabled);

            res.json({
                success: true,
                message: `Filter '${category}' set to ${enabled}`
            });
        } catch (error) {
            logger.error('Error setting debug filter:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });

    // GET /api/debug/logs - Get debug logs
    app.get('/api/debug/logs', (req, res) => {
        try {
            const { category, level, limit = 200 } = req.query;
            const logs = debugLogger.getLogs(category, level, parseInt(limit));

            res.json({
                success: true,
                count: logs.length,
                logs,
                stats: debugLogger.getStats()
            });
        } catch (error) {
            logger.error('Error getting debug logs:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });

    // GET /api/debug/export - Export all logs
    app.get('/api/debug/export', (req, res) => {
        try {
            const data = debugLogger.export();
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=debug-logs-${Date.now()}.json`);
            res.json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error exporting debug logs:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });

    // POST /api/debug/clear - Clear all logs
    app.post('/api/debug/clear', (req, res) => {
        try {
            debugLogger.clear();
            logger.info('[DEBUG] Logs cleared');
            
            res.json({ 
                success: true, 
                message: 'Debug logs cleared' 
            });
        } catch (error) {
            logger.error('Error clearing debug logs:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });

    logger.info('✅ Debug routes registered');
}

module.exports = { setupDebugRoutes };
