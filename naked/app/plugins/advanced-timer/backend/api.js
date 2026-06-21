/**
 * Advanced Timer API Routes
 * Handles all REST API endpoints for timer management
 */

const path = require('path');

class TimerAPI {
    constructor(plugin) {
        this.plugin = plugin;
        this.api = plugin.api;
    }

    registerRoutes() {
        // Serve overlay HTML
        this.api.registerRoute('get', '/advanced-timer/overlay', (req, res) => {
            try {
                res.sendFile(path.join(this.api.getPluginDir(), 'overlay.html'));
            } catch (error) {
                this.api.log(`Error serving overlay: ${error.message}`, 'error');
                res.status(500).send('Error loading overlay');
            }
        });

        // Serve overlay JavaScript
        this.api.registerRoute('get', '/advanced-timer/overlay.js', (req, res) => {
            try {
                res.sendFile(path.join(this.api.getPluginDir(), 'overlay', 'overlay.js'));
            } catch (error) {
                this.api.log(`Error serving overlay JS: ${error.message}`, 'error');
                res.status(500).send('Error loading overlay JS');
            }
        });

        // Serve UI HTML
        this.api.registerRoute('get', '/advanced-timer/ui', (req, res) => {
            try {
                res.sendFile(path.join(this.api.getPluginDir(), 'ui.html'));
            } catch (error) {
                this.api.log(`Error serving UI: ${error.message}`, 'error');
                res.status(500).send('Error loading UI');
            }
        });

        // Serve UI JavaScript
        this.api.registerRoute('get', '/advanced-timer/ui.js', (req, res) => {
            try {
                res.sendFile(path.join(this.api.getPluginDir(), 'ui', 'ui.js'));
            } catch (error) {
                this.api.log(`Error serving UI JS: ${error.message}`, 'error');
                res.status(500).send('Error loading UI JS');
            }
        });

        // Get all timers
        this.api.registerRoute('get', '/api/advanced-timer/timers', (req, res) => {
            try {
                const timers = this.plugin.db.getAllTimers();
                const timerStates = timers.map(timer => {
                    const instance = this.plugin.engine.getTimer(timer.id);
                    return instance ? { ...timer, ...instance.getState() } : timer;
                });
                res.json({ success: true, timers: timerStates });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // IMPORTANT: Register specific routes (with sub-paths) BEFORE general routes
        // This ensures Express matches the most specific pattern first

        // Get timer logs (must be before /timers/:id)
        this.api.registerRoute('get', '/api/advanced-timer/timers/:id/logs', (req, res) => {
            try {
                const { id } = req.params;
                const limit = req.query.limit ? parseInt(req.query.limit) : 100;
                
                const logs = this.plugin.db.getTimerLogs(id, limit);
                res.json({ success: true, logs });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Export timer logs (must be before /timers/:id)
        this.api.registerRoute('get', '/api/advanced-timer/timers/:id/export-logs', (req, res) => {
            try {
                const { id } = req.params;
                const logs = this.plugin.db.exportTimerLogs(id);
                const timer = this.plugin.db.getTimer(id);
                
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="timer_${timer?.name || id}_logs.json"`);
                res.json({ timer: timer?.name || id, logs });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get timer events (must be before /timers/:id)
        this.api.registerRoute('get', '/api/advanced-timer/timers/:id/events', (req, res) => {
            try {
                const { id } = req.params;
                const events = this.plugin.db.getTimerEvents(id);
                res.json({ success: true, events });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get timer rules (must be before /timers/:id)
        this.api.registerRoute('get', '/api/advanced-timer/timers/:id/rules', (req, res) => {
            try {
                const { id } = req.params;
                const rules = this.plugin.db.getTimerRules(id);
                res.json({ success: true, rules });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get timer chains (must be before /timers/:id)
        this.api.registerRoute('get', '/api/advanced-timer/timers/:id/chains', (req, res) => {
            try {
                const { id } = req.params;
                const chains = this.plugin.db.getTimerChains(id);
                res.json({ success: true, chains });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Timer control endpoints (must be before /timers/:id)
        this.api.registerRoute('post', '/api/advanced-timer/timers/:id/start', (req, res) => {
            try {
                const { id } = req.params;
                const timer = this.plugin.engine.getTimer(id);
                
                if (!timer) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                timer.start();
                this.plugin.db.updateTimerState(id, 'running', timer.currentValue);
                
                res.json({ success: true, state: timer.getState() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/advanced-timer/timers/:id/pause', (req, res) => {
            try {
                const { id } = req.params;
                const timer = this.plugin.engine.getTimer(id);
                
                if (!timer) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                timer.pause();
                this.plugin.db.updateTimerState(id, 'paused', timer.currentValue);
                
                res.json({ success: true, state: timer.getState() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/advanced-timer/timers/:id/stop', (req, res) => {
            try {
                const { id } = req.params;
                const timer = this.plugin.engine.getTimer(id);
                
                if (!timer) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                timer.stop();
                this.plugin.db.updateTimerState(id, 'stopped', timer.currentValue);
                
                res.json({ success: true, state: timer.getState() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/advanced-timer/timers/:id/reset', (req, res) => {
            try {
                const { id } = req.params;
                const timer = this.plugin.engine.getTimer(id);
                
                if (!timer) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                timer.reset();
                this.plugin.db.updateTimerState(id, 'stopped', timer.currentValue);
                
                res.json({ success: true, state: timer.getState() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Add/remove time endpoints (must be before /timers/:id)
        this.api.registerRoute('post', '/api/advanced-timer/timers/:id/add-time', (req, res) => {
            try {
                const { id } = req.params;
                const { seconds, source } = req.body;
                
                // Validation
                if (seconds === undefined || seconds === null) {
                    return res.status(400).json({ success: false, error: 'Seconds parameter is required' });
                }
                
                const secondsNum = parseFloat(seconds);
                if (isNaN(secondsNum)) {
                    return res.status(400).json({ success: false, error: 'Seconds must be a valid number' });
                }
                
                if (secondsNum < 0) {
                    return res.status(400).json({ success: false, error: 'Seconds must be non-negative' });
                }

                const timer = this.plugin.engine.getTimer(id);
                if (!timer) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                timer.addTime(secondsNum, source || 'manual');
                this.plugin.db.updateTimerState(id, timer.state, timer.currentValue);
                this.plugin.db.addTimerLog(id, 'time_added', source, secondsNum, `Added ${secondsNum}s`);
                
                res.json({ success: true, state: timer.getState() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/advanced-timer/timers/:id/remove-time', (req, res) => {
            try {
                const { id } = req.params;
                const { seconds, source } = req.body;
                
                // Validation
                if (seconds === undefined || seconds === null) {
                    return res.status(400).json({ success: false, error: 'Seconds parameter is required' });
                }
                
                const secondsNum = parseFloat(seconds);
                if (isNaN(secondsNum)) {
                    return res.status(400).json({ success: false, error: 'Seconds must be a valid number' });
                }
                
                if (secondsNum < 0) {
                    return res.status(400).json({ success: false, error: 'Seconds must be non-negative' });
                }

                const timer = this.plugin.engine.getTimer(id);
                if (!timer) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                timer.removeTime(secondsNum, source || 'manual');
                this.plugin.db.updateTimerState(id, timer.state, timer.currentValue);
                this.plugin.db.addTimerLog(id, 'time_removed', source, -secondsNum, `Removed ${secondsNum}s`);
                
                res.json({ success: true, state: timer.getState() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get single timer (general route - must come AFTER specific sub-path routes)
        this.api.registerRoute('get', '/api/advanced-timer/timers/:id', (req, res) => {
            try {
                const { id } = req.params;
                const timer = this.plugin.db.getTimer(id);
                
                if (!timer) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                const instance = this.plugin.engine.getTimer(id);
                const state = instance ? { ...timer, ...instance.getState() } : timer;
                
                res.json({ success: true, timer: state });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Create timer
        this.api.registerRoute('post', '/api/advanced-timer/timers', (req, res) => {
            try {
                const timerData = req.body;
                
                // Generate ID if not provided
                if (!timerData.id) {
                    timerData.id = `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                }

                // Validate required fields
                if (!timerData.name || !timerData.mode) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Name and mode are required' 
                    });
                }

                // Validate mode
                const validModes = ['countdown', 'countup', 'stopwatch', 'loop', 'interval'];
                if (!validModes.includes(timerData.mode)) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid mode. Must be one of: ${validModes.join(', ')}`
                    });
                }

                // Set defaults and validate based on mode
                timerData.initial_duration = parseFloat(timerData.initial_duration) || 0;
                timerData.target_value = parseFloat(timerData.target_value) || 0;
                timerData.current_value = parseFloat(timerData.current_value) || 
                    (timerData.mode === 'countdown' || timerData.mode === 'loop' ? timerData.initial_duration : 0);
                timerData.config = timerData.config || {};

                // Mode-specific validation
                if ((timerData.mode === 'countdown' || timerData.mode === 'loop') && timerData.initial_duration <= 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Countdown and Loop modes require initial_duration > 0'
                    });
                }

                if ((timerData.mode === 'countup' || timerData.mode === 'interval') && timerData.target_value < 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Count Up and Interval modes require target_value >= 0'
                    });
                }

                // Save to database
                const saved = this.plugin.db.saveTimer(timerData);
                
                if (!saved) {
                    this.api.log(`Failed to persist timer '${timerData.name}' (${timerData.id}) to database`, 'error');
                    return res.status(500).json({ success: false, error: 'Failed to save timer' });
                }

                // Create timer instance
                this.plugin.engine.createTimer(timerData);
                this.plugin.eventBridge.rebuildCache();

                res.json({ success: true, timer: timerData });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update timer
        this.api.registerRoute('put', '/api/advanced-timer/timers/:id', (req, res) => {
            try {
                const { id } = req.params;
                const updates = req.body;
                
                const existingTimer = this.plugin.db.getTimer(id);
                if (!existingTimer) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                // Merge updates with existing timer
                const updatedTimer = { ...existingTimer, ...updates, id };

                // Validate mode if changed
                if (updates.mode) {
                    const validModes = ['countdown', 'countup', 'stopwatch', 'loop', 'interval'];
                    if (!validModes.includes(updates.mode)) {
                        return res.status(400).json({
                            success: false,
                            error: `Invalid mode. Must be one of: ${validModes.join(', ')}`
                        });
                    }
                }

                // Parse numeric fields
                if (updates.initial_duration !== undefined) {
                    updatedTimer.initial_duration = parseFloat(updates.initial_duration) || 0;
                }
                if (updates.target_value !== undefined) {
                    updatedTimer.target_value = parseFloat(updates.target_value) || 0;
                }
                if (updates.current_value !== undefined) {
                    updatedTimer.current_value = parseFloat(updates.current_value) || 0;
                }

                // Mode-specific validation
                if ((updatedTimer.mode === 'countdown' || updatedTimer.mode === 'loop') && updatedTimer.initial_duration <= 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Countdown and Loop modes require initial_duration > 0'
                    });
                }

                if ((updatedTimer.mode === 'countup' || updatedTimer.mode === 'interval') && updatedTimer.target_value < 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Count Up and Interval modes require target_value >= 0'
                    });
                }

                const saved = this.plugin.db.saveTimer(updatedTimer);
                
                if (!saved) {
                    return res.status(500).json({ success: false, error: 'Failed to update timer' });
                }

                // Update engine instance
                this.plugin.engine.removeTimer(id);
                this.plugin.engine.createTimer(updatedTimer);
                this.plugin.eventBridge.rebuildCache();

                res.json({ success: true, timer: updatedTimer });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete timer
        this.api.registerRoute('delete', '/api/advanced-timer/timers/:id', (req, res) => {
            try {
                const { id } = req.params;
                
                this.plugin.engine.removeTimer(id);
                this.plugin.db.deleteTimer(id);
                this.plugin.eventBridge.rebuildCache();
                
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ── Flat interaction endpoints ─────────────────────────────────────────

        // Update per-interaction seconds (per_coin, per_follow, per_share, per_subscribe, per_like, per_chat)
        this.api.registerRoute('put', '/api/advanced-timer/timers/:id/interactions', (req, res) => {
            try {
                const { id } = req.params;
                const existing = this.plugin.db.getTimer(id);
                if (!existing) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                const fields = ['per_coin', 'per_follow', 'per_share', 'per_subscribe', 'per_like', 'per_chat'];
                for (const f of fields) {
                    if (req.body[f] !== undefined) {
                        existing[f] = parseFloat(req.body[f]) || 0;
                    }
                }

                this.plugin.db.saveTimer(existing);
                // Selective cache update — avoid a full rebuild for per_* changes
                this.plugin.eventBridge.updateCacheEntry(id, {
                    per_coin: existing.per_coin,
                    per_follow: existing.per_follow,
                    per_share: existing.per_share,
                    per_subscribe: existing.per_subscribe,
                    per_like: existing.per_like,
                    per_chat: existing.per_chat
                });
                res.json({ success: true, timer: existing });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update multiplier
        this.api.registerRoute('put', '/api/advanced-timer/timers/:id/multiplier', (req, res) => {
            try {
                const { id } = req.params;
                const existing = this.plugin.db.getTimer(id);
                if (!existing) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                if (req.body.multiplier !== undefined) {
                    existing.multiplier = parseFloat(req.body.multiplier) || 1.0;
                }
                if (req.body.multiplier_enabled !== undefined) {
                    existing.multiplier_enabled = req.body.multiplier_enabled ? 1 : 0;
                }

                this.plugin.db.saveTimer(existing);
                // Selective cache update — avoid a full rebuild for multiplier changes
                this.plugin.eventBridge.updateCacheEntry(id, {
                    multiplier: existing.multiplier,
                    multiplier_enabled: existing.multiplier_enabled ? true : false
                });
                res.json({ success: true, timer: existing });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update expiry action
        this.api.registerRoute('put', '/api/advanced-timer/timers/:id/expiry', (req, res) => {
            try {
                const { id } = req.params;
                const existing = this.plugin.db.getTimer(id);
                if (!existing) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                if (req.body.expiry_action !== undefined) {
                    existing.expiry_action = req.body.expiry_action || 'none';
                }
                if (req.body.expiry_action_config !== undefined) {
                    existing.expiry_action_config = req.body.expiry_action_config || {};
                }

                this.plugin.db.saveTimer(existing);
                // Recreate engine instance so it picks up new expiry config
                this.plugin.engine.removeTimer(id);
                this.plugin.engine.createTimer(existing);
                res.json({ success: true, timer: existing });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update keyboard shortcuts
        this.api.registerRoute('put', '/api/advanced-timer/timers/:id/shortcuts', (req, res) => {
            try {
                const { id } = req.params;
                const existing = this.plugin.db.getTimer(id);
                if (!existing) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                const shortcutFields = ['shortcut_start_pause', 'shortcut_increase', 'shortcut_decrease', 'shortcut_step'];
                for (const f of shortcutFields) {
                    if (req.body[f] !== undefined) {
                        existing[f] = f === 'shortcut_step' ? (parseFloat(req.body[f]) || 60) : (req.body[f] || '');
                    }
                }

                this.plugin.db.saveTimer(existing);
                res.json({ success: true, timer: existing });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Event management routes
        this.api.registerRoute('post', '/api/advanced-timer/events', (req, res) => {
            try {
                const event = req.body;
                const saved = this.plugin.db.saveTimerEvent(event);
                res.json({ success: saved });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('delete', '/api/advanced-timer/events/:id', (req, res) => {
            try {
                const { id } = req.params;
                this.plugin.db.deleteTimerEvent(id);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Timer rules management
        this.api.registerRoute('post', '/api/advanced-timer/rules', (req, res) => {
            try {
                const rule = req.body;
                const saved = this.plugin.db.saveTimerRule(rule);
                res.json({ success: saved });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('delete', '/api/advanced-timer/rules/:id', (req, res) => {
            try {
                const { id } = req.params;
                this.plugin.db.deleteTimerRule(id);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Timer chains management
        this.api.registerRoute('post', '/api/advanced-timer/chains', (req, res) => {
            try {
                const chain = req.body;
                const saved = this.plugin.db.saveTimerChain(chain);
                res.json({ success: saved });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('delete', '/api/advanced-timer/chains/:id', (req, res) => {
            try {
                const { id } = req.params;
                this.plugin.db.deleteTimerChain(id);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Profiles
        this.api.registerRoute('get', '/api/advanced-timer/profiles', (req, res) => {
            try {
                const profiles = this.plugin.db.getAllProfiles();
                res.json({ success: true, profiles });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/advanced-timer/profiles', (req, res) => {
            try {
                const profile = req.body;
                if (!profile.id) {
                    profile.id = `profile_${Date.now()}`;
                }
                const saved = this.plugin.db.saveProfile(profile);
                res.json({ success: saved, profile });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('get', '/api/advanced-timer/profiles/:id', (req, res) => {
            try {
                const { id } = req.params;
                const profile = this.plugin.db.getProfile(id);
                if (!profile) {
                    return res.status(404).json({ success: false, error: 'Profile not found' });
                }
                res.json({ success: true, profile });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('delete', '/api/advanced-timer/profiles/:id', (req, res) => {
            try {
                const { id } = req.params;
                this.plugin.db.deleteProfile(id);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Apply profile endpoint
        this.api.registerRoute('post', '/api/advanced-timer/profiles/:id/apply', (req, res) => {
            try {
                const { id } = req.params;
                const profile = this.plugin.db.getProfile(id);
                
                if (!profile) {
                    return res.status(404).json({ success: false, error: 'Profile not found' });
                }

                // Clear existing timers
                const existingTimers = this.plugin.engine.getAllTimers();
                for (const timer of existingTimers) {
                    this.plugin.engine.removeTimer(timer.id);
                    this.plugin.db.deleteTimer(timer.id);
                }

                // Create timers from profile
                const profileConfig = profile.config || {};
                const timers = profileConfig.timers || [];
                const createdTimers = [];
                
                for (const timerData of timers) {
                    const saved = this.plugin.db.saveTimer(timerData);
                    if (saved) {
                        this.plugin.engine.createTimer(timerData);
                        createdTimers.push(timerData);
                    }
                }

                this.api.log(`Applied profile ${id}: ${createdTimers.length} timers created`, 'info');
                res.json({ success: true, timersCreated: createdTimers.length, timers: createdTimers });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.log('Advanced Timer API routes registered', 'info');
    }
}

module.exports = TimerAPI;
