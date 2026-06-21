/**
 * Debug Panel - Client-side component for debug logging
 * Include this script in dashboard.html to enable debug panel
 * 
 * Features:
 * - Floating debug panel (Shift+F12)
 * - Integrated diagnostics in Settings page
 * - GPU and system info
 * - Console log capture
 */

(function() {
    'use strict';

    // Diagnostics Controller (for Settings page integration)
    const diagnostics = {
        logs: [],
        maxLogs: 500,
        loggingEnabled: true,
        consoleLoggingEnabled: true,
        logLevel: 'info',
        logLevels: { error: 0, warn: 1, info: 2, debug: 3 },
        initialized: false,

        init() {
            if (this.initialized) return;
            this.initialized = true;
            
            this.loadSettings();
            this.setupUI();
            this.interceptConsole();
            
            // Initial diagnostics refresh
            setTimeout(() => this.refreshDiagnostics(), 500);
            
            console.log('[Diagnostics] Settings panel initialized');
        },

        loadSettings() {
            try {
                const saved = localStorage.getItem('debug_panel_settings');
                if (saved) {
                    const settings = JSON.parse(saved);
                    this.loggingEnabled = settings.loggingEnabled !== false;
                    this.consoleLoggingEnabled = settings.consoleLoggingEnabled !== false;
                    this.logLevel = settings.logLevel || 'info';
                }
            } catch (e) {
                console.warn('[Diagnostics] Failed to load settings:', e);
            }
        },

        saveSettings() {
            try {
                localStorage.setItem('debug_panel_settings', JSON.stringify({
                    loggingEnabled: this.loggingEnabled,
                    consoleLoggingEnabled: this.consoleLoggingEnabled,
                    logLevel: this.logLevel
                }));
            } catch (e) {
                console.warn('[Diagnostics] Failed to save settings:', e);
            }
        },

        setupUI() {
            // Get UI elements
            const loggingCheckbox = document.getElementById('diag-logging-enabled');
            const consoleCheckbox = document.getElementById('diag-console-logging');
            const logLevelSelect = document.getElementById('diag-log-level');
            const clearBtn = document.getElementById('diag-clear-logs');
            const copyBtn = document.getElementById('diag-copy-logs');
            const downloadBtn = document.getElementById('diag-download-logs');
            const refreshBtn = document.getElementById('diag-refresh-btn');
            const testGpuBtn = document.getElementById('diag-test-gpu');
            const checkPluginsBtn = document.getElementById('diag-check-plugins');

            // Set initial values and add event listeners
            if (loggingCheckbox) {
                loggingCheckbox.checked = this.loggingEnabled;
                loggingCheckbox.addEventListener('change', (e) => {
                    this.loggingEnabled = e.target.checked;
                    this.saveSettings();
                    this.log('info', 'Diagnostics', `Logging ${this.loggingEnabled ? 'enabled' : 'disabled'}`);
                });
            }

            if (consoleCheckbox) {
                consoleCheckbox.checked = this.consoleLoggingEnabled;
                consoleCheckbox.addEventListener('change', (e) => {
                    this.consoleLoggingEnabled = e.target.checked;
                    this.saveSettings();
                });
            }

            if (logLevelSelect) {
                logLevelSelect.value = this.logLevel;
                logLevelSelect.addEventListener('change', (e) => {
                    this.logLevel = e.target.value;
                    this.saveSettings();
                    this.log('info', 'Diagnostics', `Log level set to: ${this.logLevel}`);
                });
            }

            if (clearBtn) clearBtn.addEventListener('click', () => this.clearLogs());
            if (copyBtn) copyBtn.addEventListener('click', () => this.copyLogs());
            if (downloadBtn) downloadBtn.addEventListener('click', () => this.downloadLogs());
            if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshDiagnostics());
            if (testGpuBtn) testGpuBtn.addEventListener('click', () => this.testGpu());
            if (checkPluginsBtn) checkPluginsBtn.addEventListener('click', () => this.checkPlugins());
        },

        interceptConsole() {
            const self = this;
            const originalConsole = {
                log: console.log.bind(console),
                warn: console.warn.bind(console),
                error: console.error.bind(console),
                info: console.info.bind(console),
                debug: console.debug.bind(console)
            };

            const intercept = (level) => {
                return function(...args) {
                    originalConsole[level](...args);
                    
                    if (self.loggingEnabled && self.consoleLoggingEnabled) {
                        const message = args.map(arg => {
                            if (typeof arg === 'object') {
                                try { return JSON.stringify(arg, null, 2); } 
                                catch { return String(arg); }
                            }
                            return String(arg);
                        }).join(' ');
                        
                        self.addLog(level === 'log' ? 'info' : level, 'Console', message);
                    }
                };
            };

            console.log = intercept('log');
            console.warn = intercept('warn');
            console.error = intercept('error');
            console.info = intercept('info');
            console.debug = intercept('debug');

            // Capture unhandled errors
            window.addEventListener('error', (event) => {
                this.log('error', 'Window', `Unhandled error: ${event.message} at ${event.filename}:${event.lineno}`);
            });

            window.addEventListener('unhandledrejection', (event) => {
                this.log('error', 'Promise', `Unhandled rejection: ${event.reason}`);
            });
        },

        log(level, source, message) {
            if (!this.loggingEnabled) return;
            if (this.logLevels[level] > this.logLevels[this.logLevel]) return;
            this.addLog(level, source, message);
        },

        addLog(level, source, message) {
            const entry = {
                timestamp: new Date().toISOString(),
                level,
                source,
                message: String(message).substring(0, 1000)
            };

            this.logs.push(entry);
            if (this.logs.length > this.maxLogs) {
                this.logs = this.logs.slice(-this.maxLogs);
            }

            this.updateLogViewer(entry);
        },

        updateLogViewer(entry) {
            const container = document.getElementById('diag-log-container');
            if (!container) return;

            const placeholder = container.querySelector('.text-gray-500');
            if (placeholder && placeholder.textContent.includes('Logs will appear')) {
                placeholder.remove();
            }

            const logEl = document.createElement('div');
            logEl.className = `log-entry log-${entry.level}`;
            
            const colors = { error: '#ef4444', warn: '#f59e0b', info: '#60a5fa', debug: '#94a3b8' };
            const time = new Date(entry.timestamp).toLocaleTimeString();
            logEl.innerHTML = `<span style="color: #64748b;">[${time}]</span> <span style="color: ${colors[entry.level] || '#fff'};">[${entry.level.toUpperCase()}]</span> <span style="color: #818cf8;">[${entry.source}]</span> ${this.escapeHtml(entry.message)}`;
            
            container.appendChild(logEl);
            container.scrollTop = container.scrollHeight;
        },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        async refreshDiagnostics() {
            this.log('info', 'Diagnostics', 'Refreshing diagnostics...');

            // Platform
            this.updateElement('diag-platform', this.getPlatformInfo());
            
            // Browser/Electron versions
            this.updateVersionInfo();
            
            // Memory
            this.updateMemoryInfo();
            
            // GPU
            this.updateGpuInfo();
        },

        getPlatformInfo() {
            const ua = navigator.userAgent;
            if (ua.includes('Windows')) return 'Windows';
            if (ua.includes('Mac')) return 'macOS';
            if (ua.includes('Linux')) return 'Linux';
            return navigator.platform || 'Unknown';
        },

        updateVersionInfo() {
            if (window.ltth && window.ltth.versions) {
                this.updateElement('diag-electron-version', window.ltth.versions.electron || 'N/A');
                this.updateElement('diag-node-version', window.ltth.versions.node || 'N/A');
                this.updateElement('diag-chrome-version', window.ltth.versions.chrome || 'N/A');
            } else {
                this.updateElement('diag-electron-version', 'N/A (Browser Mode)');
                const ua = navigator.userAgent;
                const match = ua.match(/(Chrome|Firefox|Safari|Edge)\/(\d+)/);
                this.updateElement('diag-chrome-version', match ? `${match[1]} ${match[2]}` : 'Unknown');
                this.updateElement('diag-node-version', 'N/A (Browser)');
            }
        },

        updateMemoryInfo() {
            if (performance.memory) {
                const used = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1);
                const total = (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1);
                this.updateElement('diag-memory', `${used} MB / ${total} MB`);
            } else {
                this.updateElement('diag-memory', 'N/A');
            }
        },

        updateGpuInfo() {
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                
                if (gl) {
                    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                    let renderer = 'Unknown', vendor = 'Unknown';
                    
                    if (debugInfo) {
                        renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                        vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                    } else {
                        renderer = gl.getParameter(gl.RENDERER);
                        vendor = gl.getParameter(gl.VENDOR);
                    }
                    
                    this.updateElement('diag-gpu-renderer', renderer || 'Unknown');
                    this.updateElement('diag-gpu-vendor', vendor || 'Unknown');
                    this.updateElement('diag-webgl', 'Supported ✓');
                    
                    const isHwAccel = !renderer?.toLowerCase().includes('swiftshader') && 
                                      !renderer?.toLowerCase().includes('llvmpipe') &&
                                      !renderer?.toLowerCase().includes('software');
                    this.updateElement('diag-hw-accel', isHwAccel ? 'Enabled ✓' : 'Disabled (Software)');
                } else {
                    this.updateElement('diag-gpu-renderer', 'N/A');
                    this.updateElement('diag-gpu-vendor', 'N/A');
                    this.updateElement('diag-webgl', 'Not Supported ✗');
                    this.updateElement('diag-hw-accel', 'Unknown');
                }
            } catch (e) {
                this.log('error', 'Diagnostics', `GPU info error: ${e.message}`);
            }
        },

        updateElement(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        },

        clearLogs() {
            this.logs = [];
            const container = document.getElementById('diag-log-container');
            if (container) {
                container.innerHTML = '<div class="text-gray-500">Logs cleared.</div>';
            }
        },

        copyLogs() {
            const logText = this.logs.map(log => 
                `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`
            ).join('\n');
            
            navigator.clipboard.writeText(logText).then(() => {
                if (typeof showNotification === 'function') {
                    showNotification('Logs copied to clipboard', 'success');
                }
            }).catch(err => {
                this.log('error', 'Diagnostics', `Copy failed: ${err.message}`);
            });
        },

        downloadLogs() {
            const logText = this.logs.map(log => 
                `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`
            ).join('\n');
            
            const blob = new Blob([logText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ltth-logs-${new Date().toISOString().slice(0, 10)}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        testGpu() {
            this.log('info', 'Diagnostics', 'Running GPU test...');
            
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 256;
                canvas.height = 256;
                
                const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                
                if (!gl) {
                    this.log('error', 'Diagnostics', 'GPU Test: WebGL not available');
                    return;
                }
                
                // Simple shader test
                const vs = gl.createShader(gl.VERTEX_SHADER);
                gl.shaderSource(vs, 'attribute vec4 p;void main(){gl_Position=p;}');
                gl.compileShader(vs);
                
                const fs = gl.createShader(gl.FRAGMENT_SHADER);
                gl.shaderSource(fs, 'precision mediump float;void main(){gl_FragColor=vec4(1.0);}');
                gl.compileShader(fs);
                
                const program = gl.createProgram();
                gl.attachShader(program, vs);
                gl.attachShader(program, fs);
                gl.linkProgram(program);
                
                const success = gl.getProgramParameter(program, gl.LINK_STATUS);
                
                gl.deleteShader(vs);
                gl.deleteShader(fs);
                gl.deleteProgram(program);
                
                if (success) {
                    this.log('info', 'Diagnostics', 'GPU Test: Passed ✓');
                    if (typeof showNotification === 'function') {
                        showNotification('GPU Test Passed', 'success');
                    }
                } else {
                    this.log('error', 'Diagnostics', 'GPU Test: Shader compilation failed');
                }
            } catch (e) {
                this.log('error', 'Diagnostics', `GPU Test failed: ${e.message}`);
            }
        },

        async checkPlugins() {
            this.log('info', 'Diagnostics', 'Checking plugins...');
            
            try {
                const response = await fetch('/api/plugins');
                if (!response.ok) {
                    this.log('error', 'Diagnostics', 'Failed to fetch plugins');
                    return;
                }
                
                const data = await response.json();
                const plugins = data.plugins || [];
                const enabled = plugins.filter(p => p.enabled).length;
                const disabled = plugins.filter(p => !p.enabled).length;
                
                this.log('info', 'Diagnostics', `Plugins: ${plugins.length} total, ${enabled} enabled, ${disabled} disabled`);
                
                plugins.forEach(plugin => {
                    const status = plugin.enabled ? '✓' : '✗';
                    this.log('debug', 'Diagnostics', `  ${status} ${plugin.name} (${plugin.id})`);
                });
                
                if (typeof showNotification === 'function') {
                    showNotification(`Found ${plugins.length} plugins (${enabled} enabled)`, 'info');
                }
            } catch (e) {
                this.log('error', 'Diagnostics', `Plugin check failed: ${e.message}`);
            }
        }
    };

    // Create debug panel HTML (floating panel for Shift+F12)
    const panelHTML = `
        <div id="debug-panel" style="display: none; position: fixed; bottom: 20px; right: 20px; width: 500px; 
             max-height: 600px; background: #1e1e1e; border: 2px solid #00ff00; border-radius: 8px; 
             font-family: 'Courier New', monospace; font-size: 12px; color: #00ff00; z-index: 10000; 
             box-shadow: 0 0 20px rgba(0,255,0,0.3); pointer-events: auto;">
          
          <div style="background: #111; padding: 10px; border-bottom: 1px solid #00ff00; display: flex; 
                      justify-content: space-between; align-items: center;">
            <span><strong>🔧 Debug Logger</strong></span>
            <div>
              <button id="debug-toggle-logs" style="background: #00ff00; color: #000; border: none; 
                      padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px;">
                Start
              </button>
              <button id="debug-clear" style="background: #ff0000; color: #fff; border: none; 
                      padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px;">
                Clear
              </button>
              <button id="debug-export" style="background: #0066ff; color: #fff; border: none; 
                      padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px;">
                Export
              </button>
              <button id="debug-close" style="background: #666; color: #fff; border: none; 
                      padding: 5px 10px; border-radius: 3px; cursor: pointer;">
                ✕
              </button>
            </div>
          </div>

          <div style="padding: 10px; border-bottom: 1px solid #444;">
            <div style="margin-bottom: 5px;"><strong>Kategorien:</strong></div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 11px;">
              <label><input type="checkbox" class="debug-filter" value="goals" checked> Goals</label>
              <label><input type="checkbox" class="debug-filter" value="websocket" checked> WebSocket</label>
              <label><input type="checkbox" class="debug-filter" value="ui" checked> UI</label>
              <label><input type="checkbox" class="debug-filter" value="tiktok"> TikTok</label>
              <label><input type="checkbox" class="debug-filter" value="csp"> CSP</label>
              <label><input type="checkbox" class="debug-filter" value="errors" checked> Errors</label>
              <label><input type="checkbox" class="debug-filter" value="socket-emit" checked> Socket Emit</label>
              <label><input type="checkbox" class="debug-filter" value="socket-receive"> Socket Receive</label>
            </div>
          </div>

          <div id="debug-logs" style="padding: 10px; height: 400px; overflow-y: auto; background: #0a0a0a; 
               border-bottom: 1px solid #444;">
            <div style="color: #666; text-align: center; padding: 20px;">Press Start to begin logging...</div>
          </div>

          <div id="debug-stats" style="padding: 10px; background: #111; font-size: 11px; border-top: 1px solid #444;">
            <span id="debug-count">0 entries</span> | 
            <span id="debug-uptime">0s uptime</span>
          </div>
        </div>
    `;

    // Debug Panel Controller (floating panel)
    const debugPanel = {
        enabled: false,
        pollInterval: 500,
        lastId: 0,
        intervalHandle: null,

        init() {
            // Inject panel HTML into document
            const container = document.createElement('div');
            container.innerHTML = panelHTML;
            document.body.appendChild(container.firstElementChild);

            // Attach event listeners
            document.getElementById('debug-toggle-logs').addEventListener('click', () => this.toggleLogging());
            document.getElementById('debug-clear').addEventListener('click', () => this.clear());
            document.getElementById('debug-export').addEventListener('click', () => this.exportLogs());
            document.getElementById('debug-close').addEventListener('click', () => this.hide());

            document.querySelectorAll('.debug-filter').forEach(cb => {
                cb.addEventListener('change', (e) => this.setFilter(e.target.value, e.target.checked));
            });

            // Hotkey: Shift+F12 to toggle panel
            document.addEventListener('keydown', (e) => {
                if (e.shiftKey && e.key === 'F12') {
                    e.preventDefault();
                    this.toggleVisibility();
                }
            });

            console.log('🔧 Debug Panel initialized. Press Shift+F12 to open.');
        },

        toggleVisibility() {
            const panel = document.getElementById('debug-panel');
            if (panel.style.display === 'none') {
                this.show();
            } else {
                this.hide();
            }
        },

        show() {
            document.getElementById('debug-panel').style.display = 'block';
        },

        hide() {
            document.getElementById('debug-panel').style.display = 'none';
        },

        async toggleLogging() {
            if (this.enabled) {
                await this.stop();
            } else {
                await this.start();
            }
        },

        async start() {
            try {
                const res = await fetch('/api/debug/enable', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ enable: true }) 
                });
                const json = await res.json();
                
                if (json.success) {
                    this.enabled = true;
                    document.getElementById('debug-toggle-logs').textContent = 'Stop';
                    document.getElementById('debug-toggle-logs').style.background = '#ff6600';
                    this.startPolling();
                    console.log('✅ Debug logging started');
                }
            } catch (e) {
                console.error('Debug start failed:', e);
            }
        },

        async stop() {
            try {
                const res = await fetch('/api/debug/enable', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ enable: false }) 
                });
                
                if (res.ok) {
                    this.enabled = false;
                    document.getElementById('debug-toggle-logs').textContent = 'Start';
                    document.getElementById('debug-toggle-logs').style.background = '#00ff00';
                    this.stopPolling();
                    console.log('⏹️ Debug logging stopped');
                }
            } catch (e) {
                console.error('Debug stop failed:', e);
            }
        },

        startPolling() {
            if (this.intervalHandle) return;
            
            this.pollLogs();
            this.intervalHandle = setInterval(() => this.pollLogs(), this.pollInterval);
        },

        stopPolling() {
            if (this.intervalHandle) {
                clearInterval(this.intervalHandle);
                this.intervalHandle = null;
            }
        },

        async pollLogs() {
            if (!this.enabled) return;

            try {
                const res = await fetch('/api/debug/logs?limit=100');
                const json = await res.json();

                if (json.logs) {
                    const container = document.getElementById('debug-logs');
                    const newLogs = json.logs.filter(l => l.id > this.lastId);

                    if (newLogs.length > 0) {
                        newLogs.forEach(log => {
                            const row = document.createElement('div');
                            row.style.cssText = 'margin-bottom: 3px; padding: 3px; background: #1a1a1a; border-left: 3px solid ' +
                                (log.level === 'error' ? '#ff0000' : log.level === 'warn' ? '#ffaa00' : '#00ff00') + ';';
                            
                            const dataStr = log.data ? ` <span style="color: #666;">${log.data}</span>` : '';
                            row.innerHTML = `<span style="color: #999;">[${log.elapsed_ms}ms]</span> <strong>[${log.category}]</strong> ${log.message}${dataStr}`;
                            
                            container.appendChild(row);
                            container.scrollTop = container.scrollHeight;
                            this.lastId = log.id;
                        });
                    }

                    const stats = json.stats || {};
                    document.getElementById('debug-count').textContent = `${json.count} entries`;
                    document.getElementById('debug-uptime').textContent = `${Math.round((stats.uptime_ms || 0) / 1000)}s`;
                }
            } catch (e) {
                console.error('Polling failed:', e);
            }
        },

        async clear() {
            try {
                await fetch('/api/debug/clear', { method: 'POST' });
                document.getElementById('debug-logs').innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">Logs cleared</div>';
                this.lastId = 0;
                console.log('🗑️ Debug logs cleared');
            } catch (e) {
                console.error('Clear failed:', e);
            }
        },

        async exportLogs() {
            try {
                const res = await fetch('/api/debug/export');
                const json = await res.json();
                
                if (json.success) {
                    const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `debug-logs-${Date.now()}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    console.log('💾 Debug logs exported');
                }
            } catch (e) {
                console.error('Export failed:', e);
            }
        },

        async setFilter(category, enabled) {
            try {
                await fetch('/api/debug/filter', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ category, enabled }) 
                });
            } catch (e) {
                console.error('Filter failed:', e);
            }
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            debugPanel.init();
            diagnostics.init();
        });
    } else {
        debugPanel.init();
        diagnostics.init();
    }

    // Expose to window for console access
    window.debugPanel = debugPanel;
    window.diagnostics = diagnostics;

})();
