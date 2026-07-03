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
                res.sendFile(path.join(this.api.pluginDir, 'overlay.html'));
            } catch (error) {
                this.api.log(`Error serving overlay: ${error.message}`, 'error');
                res.status(500).send('Error loading overlay');
            }
        });

        // Serve overlay JavaScript
        this.api.registerRoute('get', '/advanced-timer/overlay.js', (req, res) => {
            try {
                res.sendFile(path.join(this.api.pluginDir, 'overlay', 'overlay.js'));
            } catch (error) {
                this.api.log(`Error serving overlay JS: ${error.message}`, 'error');
                res.status(500).send('Error loading overlay JS');
            }
        });

        // Serve UI HTML
        this.api.registerRoute('get', '/advanced-timer/ui', (req, res) => {
            try {
                res.sendFile(path.join(this.api.pluginDir, 'ui.html'));
            } catch (error) {
                this.api.log(`Error serving UI: ${error.message}`, 'error');
                res.status(500).send('Error loading UI');
            }
        });

        // Serve UI JavaScript
        this.api.registerRoute('get', '/advanced-timer/ui.js', (req, res) => {
            try {
                res.sendFile(path.join(this.api.pluginDir, 'ui', 'ui.js'));
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
                    return instance ? instance.getState() : timer;
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
                
                if (!seconds || isNaN(seconds)) {
                    return res.status(400).json({ success: false, error: 'Invalid seconds value' });
                }

                const timer = this.plugin.engine.getTimer(id);
                if (!timer) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                timer.addTime(Number(seconds), source || 'manual');
                this.plugin.db.updateTimerState(id, timer.state, timer.currentValue);
                this.plugin.db.addTimerLog(id, 'time_added', source, Number(seconds), `Added ${seconds}s`);
                
                res.json({ success: true, state: timer.getState() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/advanced-timer/timers/:id/remove-time', (req, res) => {
            try {
                const { id } = req.params;
                const { seconds, source } = req.body;
                
                if (!seconds || isNaN(seconds)) {
                    return res.status(400).json({ success: false, error: 'Invalid seconds value' });
                }

                const timer = this.plugin.engine.getTimer(id);
                if (!timer) {
                    return res.status(404).json({ success: false, error: 'Timer not found' });
                }

                timer.removeTime(Number(seconds), source || 'manual');
                this.plugin.db.updateTimerState(id, timer.state, timer.currentValue);
                this.plugin.db.addTimerLog(id, 'time_removed', source, -Number(seconds), `Removed ${seconds}s`);
                
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
                const state = instance ? instance.getState() : timer;
                
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

                // Save to database
                const saved = this.plugin.db.saveTimer(timerData);
                
                if (!saved) {
                    return res.status(500).json({ success: false, error: 'Failed to save timer' });
                }

                // Create timer instance
                this.plugin.engine.createTimer(timerData);

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

                const updatedTimer = { ...existingTimer, ...updates, id };
                const saved = this.plugin.db.saveTimer(updatedTimer);
                
                if (!saved) {
                    return res.status(500).json({ success: false, error: 'Failed to update timer' });
                }

                // Update engine instance
                this.plugin.engine.removeTimer(id);
                this.plugin.engine.createTimer(updatedTimer);

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
                
                res.json({ success: true });
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

        this.api.log('Advanced Timer API routes registered', 'info');
    }
}

module.exports = TimerAPI;
