/**
 * Plugin Manager - Frontend-Logik für Plugin-Verwaltung
 */

// Global function to update UI after plugin changes
async function checkPluginsAndUpdateUI() {
    if (window.NavigationManager && typeof window.NavigationManager.refreshPluginVisibility === 'function') {
        await window.NavigationManager.refreshPluginVisibility();
    }
}

class PluginManager {
    constructor() {
        this.plugins = [];
        this.filteredPlugins = [];
        this.currentFilter = 'all';
        this.currentSort = 'name';
        this.searchQuery = '';
        this.compactMode = false;
        this.devStatusFilters = {
            'working-beta': true,
            'development-beta': true,
            'early-version': true
        };
        this.init();
    }

    init() {
        // Event-Listener registrieren
        const uploadBtn = document.getElementById('upload-plugin-btn');
        const fileInput = document.getElementById('plugin-file-input');
        const reloadBtn = document.getElementById('reload-plugins-btn');

        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileUpload(e.target.files[0]);
            });
        }

        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                this.reloadAllPlugins();
            });
        }

        // Search functionality
        const searchInput = document.getElementById('plugin-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.applyFiltersAndSort();
            });
        }

        // Filter buttons
        const filterBtns = document.querySelectorAll('.plugin-filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterBtns.forEach(b => {
                    b.classList.remove('active');
                    b.style.removeProperty('background');
                    b.style.removeProperty('border-color');
                    b.style.removeProperty('color');
                });
                
                btn.classList.add('active');
                
                this.currentFilter = btn.getAttribute('data-filter');
                this.applyFiltersAndSort();
            });
        });

        // Sort functionality
        const sortSelect = document.getElementById('plugin-sort');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                this.applyFiltersAndSort();
            });
        }

        // Compact mode toggle
        const compactToggle = document.getElementById('compact-mode-toggle');
        if (compactToggle) {
            compactToggle.addEventListener('click', () => {
                this.compactMode = !this.compactMode;
                compactToggle.classList.toggle('active', this.compactMode);
                
                // Update icon based on mode
                const icon = compactToggle.querySelector('i');
                const text = compactToggle.querySelector('span');
                if (icon && text) {
                    if (this.compactMode) {
                        icon.setAttribute('data-lucide', 'layout-grid');
                        text.textContent = 'Normal';
                    } else {
                        icon.setAttribute('data-lucide', 'layout-list');
                        text.textContent = 'Compact';
                    }
                    
                    // Re-initialize Lucide icons
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }
                
                this.renderPlugins();
            });
        }

        // Dev status filter checkboxes
        const devStatusCheckboxes = document.querySelectorAll('.dev-status-filter');
        devStatusCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const status = e.target.getAttribute('data-status');
                this.devStatusFilters[status] = e.target.checked;
                this.applyFiltersAndSort();
            });
        });

        // Note: Plugin loading is now triggered by navigation.js handleViewChange()
        // when switching to the plugins view
    }

    applyFiltersAndSort() {
        // Apply search filter
        let filtered = this.plugins.filter(plugin => {
            if (this.searchQuery) {
                const searchStr = `${plugin.name} ${plugin.description} ${plugin.id} ${plugin.author}`.toLowerCase();
                if (!searchStr.includes(this.searchQuery)) {
                    return false;
                }
            }
            return true;
        });

        // Apply status filter
        if (this.currentFilter === 'active') {
            filtered = filtered.filter(p => p.enabled);
        } else if (this.currentFilter === 'inactive') {
            filtered = filtered.filter(p => !p.enabled);
        }

        // Apply dev status filters
        filtered = filtered.filter(plugin => {
            // If plugin has no devStatus, always show it
            if (!plugin.devStatus) return true;
            // Otherwise check if this status is enabled in filters
            return this.devStatusFilters[plugin.devStatus] === true;
        });

        // Apply sorting
        filtered.sort((a, b) => {
            switch (this.currentSort) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'status':
                    return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
                case 'type':
                    return (a.type || '').localeCompare(b.type || '');
                case 'author':
                    return (a.author || '').localeCompare(b.author || '');
                default:
                    return 0;
            }
        });

        this.filteredPlugins = filtered;
        this.renderPlugins();
    }

    /**
     * Lädt alle Plugins vom Server
     */
    async loadPlugins() {
        try {
            const response = await fetch('/api/plugins');
            const data = await response.json();

            if (data.success) {
                this.plugins = data.plugins;
                this.updateStats();
                this.applyFiltersAndSort();
            } else {
                const errorMsg = window.i18n ? window.i18n.t('plugins.load_error', { error: data.error }) : 'Error loading plugins: ' + data.error;
                this.showError(errorMsg);
            }
        } catch (error) {
            console.error('Error loading plugins:', error);
            const errorMsg = window.i18n ? window.i18n.t('plugins.load_error', { error: error.message }) : 'Error loading plugins: ' + error.message;
            this.showError(errorMsg);
        }
    }

    /**
     * Updates plugin statistics
     */
    updateStats() {
        const activeCount = this.plugins.filter(p => p.enabled).length;
        const inactiveCount = this.plugins.filter(p => !p.enabled).length;
        const totalCount = this.plugins.length;

        const statActive = document.getElementById('stat-active-plugins');
        const statInactive = document.getElementById('stat-inactive-plugins');
        const statTotal = document.getElementById('stat-total-plugins');

        if (statActive) statActive.textContent = activeCount;
        if (statInactive) statInactive.textContent = inactiveCount;
        if (statTotal) statTotal.textContent = totalCount;
    }

    /**
     * Rendert die Plugin-Liste
     */
    renderPlugins() {
        const container = document.getElementById('plugins-container');
        if (!container) return;

        if (this.filteredPlugins.length === 0) {
            const message = this.searchQuery || this.currentFilter !== 'all'
                ? (window.i18n ? window.i18n.t('plugins.no_plugins_filter') : 'No plugins found matching the filter criteria.')
                : (window.i18n ? window.i18n.t('plugins.no_plugins') : 'No plugins found.');
            
            container.innerHTML = `
                <div class="text-center text-gray-400 py-12">
                    <i data-lucide="package-x" style="width: 64px; height: 64px; margin: 0 auto 1rem; color: #60a5fa;"></i>
                    <p class="text-lg">${message}</p>
                    ${!this.searchQuery && this.currentFilter === 'all' ? '<p class="text-sm mt-2">Lade ein Plugin hoch, um zu beginnen.</p>' : ''}
                </div>
            `;
            
            // Re-initialize Lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            return;
        }

        // Render based on mode
        if (this.compactMode) {
            this.renderPluginsCompact();
        } else {
            this.renderPluginsNormal();
        }
    }

    /**
     * Renders plugins in normal card view
     */
    renderPluginsNormal() {
        const container = document.getElementById('plugins-container');
        container.className = 'space-y-4';
        container.innerHTML = this.filteredPlugins.map(plugin => this.renderPlugin(plugin)).join('');

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Event-Listener für Buttons
        this.filteredPlugins.forEach(plugin => {
            const enableBtn = document.getElementById(`enable-${plugin.id}`);
            const disableBtn = document.getElementById(`disable-${plugin.id}`);
            const reloadBtn = document.getElementById(`reload-${plugin.id}`);
            const deleteBtn = document.getElementById(`delete-${plugin.id}`);

            if (enableBtn) {
                enableBtn.addEventListener('click', () => this.enablePlugin(plugin.id));
            }
            if (disableBtn) {
                disableBtn.addEventListener('click', () => this.disablePlugin(plugin.id));
            }
            if (reloadBtn) {
                reloadBtn.addEventListener('click', () => this.reloadPlugin(plugin.id));
            }
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => this.deletePlugin(plugin.id));
            }
        });
    }

    /**
     * Renders plugins in compact table view
     */
    renderPluginsCompact() {
        const container = document.getElementById('plugins-container');
        container.className = '';
        
        const tableHTML = `
            <table class="plugin-compact-table">
                <thead>
                    <tr>
                        <th style="width: 20%;">Name</th>
                        <th style="width: 8%;">Version</th>
                        <th style="width: 10%;">Status</th>
                        <th style="width: 20%;">Dev Status</th>
                        <th style="width: 10%;">Type</th>
                        <th style="width: 10%;">Author</th>
                        <th style="width: 22%; text-align: right;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.filteredPlugins.map(plugin => this.renderPluginCompact(plugin)).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = tableHTML;

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Event-Listener für Buttons
        this.filteredPlugins.forEach(plugin => {
            const enableBtn = document.getElementById(`enable-${plugin.id}`);
            const disableBtn = document.getElementById(`disable-${plugin.id}`);
            const reloadBtn = document.getElementById(`reload-${plugin.id}`);
            const deleteBtn = document.getElementById(`delete-${plugin.id}`);

            if (enableBtn) {
                enableBtn.addEventListener('click', () => this.enablePlugin(plugin.id));
            }
            if (disableBtn) {
                disableBtn.addEventListener('click', () => this.disablePlugin(plugin.id));
            }
            if (reloadBtn) {
                reloadBtn.addEventListener('click', () => this.reloadPlugin(plugin.id));
            }
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => this.deletePlugin(plugin.id));
            }
        });
    }

    /**
     * Renders a single plugin in compact table row format
     */
    renderPluginCompact(plugin) {
        const statusBadge = plugin.enabled
            ? '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px; font-size: 0.7rem; font-weight: 600;"><i data-lucide="check-circle" style="width: 12px; height: 12px;"></i> Active</span>'
            : '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: rgba(107, 114, 128, 0.3); border: 1px solid rgba(107, 114, 128, 0.5); border-radius: 12px; font-size: 0.7rem; font-weight: 600;"><i data-lucide="pause-circle" style="width: 12px; height: 12px;"></i> Inactive</span>';

        const devStatusBadge = this.getDevStatusBadge(plugin.devStatus);
        
        // Get row background color based on devStatus
        const rowBackground = this.getDevStatusRowBackground(plugin.devStatus);

        const actionButtons = plugin.enabled
            ? `
                <button id="reload-${plugin.id}" class="plugin-compact-btn" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white;">
                    <i data-lucide="refresh-cw" style="width: 12px; height: 12px;"></i>
                    Reload
                </button>
                <button id="disable-${plugin.id}" class="plugin-compact-btn" style="background: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.3); color: #fbbf24;">
                    <i data-lucide="pause" style="width: 12px; height: 12px;"></i>
                    Disable
                </button>
            `
            : `
                <button id="enable-${plugin.id}" class="plugin-compact-btn" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white;">
                    <i data-lucide="play" style="width: 12px; height: 12px;"></i>
                    Enable
                </button>
            `;

        return `
            <tr style="background: ${rowBackground};">
                <td>
                    <div style="font-weight: 600; color: white; margin-bottom: 2px;">${this.escapeHtml(plugin.name)}</div>
                    <div style="font-size: 0.75rem; color: #9ca3af; font-family: monospace;">${this.escapeHtml(plugin.id)}</div>
                </td>
                <td>
                    <span style="padding: 2px 8px; background: rgba(0, 0, 0, 0.3); border-radius: 4px; font-size: 0.7rem; color: #9ca3af; font-family: monospace;">v${this.escapeHtml(plugin.version)}</span>
                </td>
                <td>${statusBadge}</td>
                <td>${devStatusBadge || '<span style="color: #6b7280; font-size: 0.75rem;">-</span>'}</td>
                <td>
                    ${plugin.type ? `<span style="font-size: 0.75rem; color: #9ca3af;">${this.getTypeIcon(plugin.type)} ${this.escapeHtml(plugin.type)}</span>` : '<span style="color: #6b7280;">-</span>'}
                </td>
                <td>
                    <span style="font-size: 0.75rem; color: #9ca3af;">${this.escapeHtml(plugin.author || 'Unknown')}</span>
                </td>
                <td>
                    <div class="plugin-compact-actions">
                        ${actionButtons}
                        <button id="delete-${plugin.id}" class="plugin-compact-btn" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171;">
                            <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    /**
     * Rendert ein einzelnes Plugin
     */
    renderPlugin(plugin) {
        const statusBadge = plugin.enabled
            ? '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 20px; font-size: 0.75rem; font-weight: 600;"><i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> Aktiv</span>'
            : '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; background: rgba(107, 114, 128, 0.3); border: 1px solid rgba(107, 114, 128, 0.5); border-radius: 20px; font-size: 0.75rem; font-weight: 600;"><i data-lucide="pause-circle" style="width: 14px; height: 14px;"></i> Inaktiv</span>';

        const devStatusBadge = this.getDevStatusBadge(plugin.devStatus);

        // Get background color based on devStatus
        const devStatusBackground = this.getDevStatusBackground(plugin.devStatus);

        const typeIcon = this.getTypeIcon(plugin.type);
        const typeBadge = plugin.type 
            ? `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; font-size: 0.7rem; color: #60a5fa;">${typeIcon} ${this.escapeHtml(plugin.type)}</span>` 
            : '';

        const actionButtons = plugin.enabled
            ? `
                <button id="reload-${plugin.id}" class="plugin-action-btn" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white;">
                    <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
                    <span>Reload</span>
                </button>
                <button id="disable-${plugin.id}" class="plugin-action-btn" style="background: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.3); color: #fbbf24;">
                    <i data-lucide="pause" style="width: 16px; height: 16px;"></i>
                    <span>${window.i18n ? window.i18n.t('plugins.disable') : 'Disable'}</span>
                </button>
            `
            : `
                <button id="enable-${plugin.id}" class="plugin-action-btn" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white;">
                    <i data-lucide="play" style="width: 16px; height: 16px;"></i>
                    <span>${window.i18n ? window.i18n.t('plugins.enable') : 'Enable'}</span>
                </button>
            `;

        const loadedTime = plugin.loadedAt 
            ? `<div style="display: flex; align-items: center; gap: 6px; font-size: 0.7rem; color: #6b7280; margin-top: 8px;">
                <i data-lucide="clock" style="width: 12px; height: 12px;"></i>
                Loaded: ${new Date(plugin.loadedAt).toLocaleString('de-DE', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                })}
            </div>` 
            : '';

        return `
            <div class="plugin-card" style="background: ${devStatusBackground}; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 1.5rem; transition: all 0.3s ease; position: relative; overflow: hidden;">
                <!-- Subtle gradient overlay -->
                <div style="position: absolute; top: 0; right: 0; width: 200px; height: 200px; background: radial-gradient(circle at top right, rgba(59, 130, 246, 0.1) 0%, transparent 70%); pointer-events: none;"></div>
                
                <div style="position: relative; display: flex; gap: 1.5rem;">
                    <!-- Plugin Icon -->
                    <div style="flex-shrink: 0;">
                        <div style="width: 64px; height: 64px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(147, 51, 234, 0.2) 100%); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="package" style="width: 32px; height: 32px; color: #60a5fa;"></i>
                        </div>
                    </div>

                    <!-- Plugin Info -->
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: start; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;">
                                    <h3 style="font-size: 1.25rem; font-weight: 700; color: white; margin: 0;">${this.escapeHtml(plugin.name)}</h3>
                                    ${statusBadge}
                                    <span style="padding: 4px 10px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; font-size: 0.75rem; color: #9ca3af; font-family: monospace;">v${this.escapeHtml(plugin.version)}</span>
                                    ${devStatusBadge}
                                </div>
                                <p style="font-size: 0.9rem; color: #d1d5db; margin: 0 0 12px 0; line-height: 1.5;">${this.escapeHtml(plugin.description || (window.i18n ? window.i18n.t('plugins.no_description') : 'No description available'))}</p>
                                
                                <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.8rem; color: #9ca3af;">
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <i data-lucide="hash" style="width: 14px; height: 14px;"></i>
                                        <span style="font-family: monospace;">${this.escapeHtml(plugin.id)}</span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <i data-lucide="user" style="width: 14px; height: 14px;"></i>
                                        <span>${this.escapeHtml(plugin.author || (window.i18n ? window.i18n.t('plugins.unknown_author') : 'Unknown'))}</span>
                                    </div>
                                    ${plugin.type ? `<div>${typeBadge}</div>` : ''}
                                </div>
                                ${loadedTime}
                            </div>

                            <!-- Action Buttons -->
                            <div style="display: flex; flex-direction: column; gap: 8px; min-width: 140px;">
                                ${actionButtons}
                                <button id="delete-${plugin.id}" class="plugin-action-btn" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171;">
                                    <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                                    <span>${window.i18n ? window.i18n.t('plugins.delete') : 'Delete'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get icon for plugin type
     */
    getTypeIcon(type) {
        const icons = {
            'core': '⚡',
            'integration': '🔌',
            'overlay': '🎨',
            'module': '📦',
            'utility': '🔧'
        };
        return icons[type] || '📦';
    }

    /**
     * Get development status badge
     */
    getDevStatusBadge(devStatus) {
        if (!devStatus) return '';

        const statusConfig = {
            'working-beta': {
                text: 'Working Beta - please Report Bugs',
                background: 'rgba(34, 197, 94, 0.15)',
                border: 'rgba(34, 197, 94, 0.4)',
                color: '#22c55e'
            },
            'development-beta': {
                text: 'Development Beta: expect Bugs',
                background: 'rgba(251, 191, 36, 0.15)',
                border: 'rgba(251, 191, 36, 0.4)',
                color: '#fbbf24'
            },
            'early-version': {
                text: 'Early Version: not working - feel free to contribute',
                background: 'rgba(239, 68, 68, 0.15)',
                border: 'rgba(239, 68, 68, 0.4)',
                color: '#ef4444'
            }
        };

        const config = statusConfig[devStatus];
        if (!config) return '';

        return `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; background: ${config.background}; border: 1px solid ${config.border}; border-radius: 20px; font-size: 0.7rem; font-weight: 600; color: ${config.color};">${config.text}</span>`;
    }

    /**
     * Get background color based on development status
     */
    getDevStatusBackground(devStatus) {
        const baseGradient = 'linear-gradient(135deg, rgba(31, 41, 55, 0.6) 0%, rgba(17, 24, 39, 0.8) 100%)';
        
        const tints = {
            'working-beta': 'rgba(34, 197, 94, 0.05)',
            'development-beta': 'rgba(251, 191, 36, 0.05)',
            'early-version': 'rgba(239, 68, 68, 0.05)'
        };

        const tint = tints[devStatus];
        return tint ? `${baseGradient}, ${tint}` : baseGradient;
    }

    /**
     * Get row background color based on development status (for compact view)
     */
    getDevStatusRowBackground(devStatus) {
        const backgrounds = {
            'working-beta': 'rgba(34, 197, 94, 0.08)',
            'development-beta': 'rgba(251, 191, 36, 0.08)',
            'early-version': 'rgba(239, 68, 68, 0.08)'
        };

        return backgrounds[devStatus] || 'transparent';
    }

    /**
     * Aktiviert ein Plugin
     */
    async enablePlugin(pluginId) {
        try {
            const response = await fetch(`/api/plugins/${pluginId}/enable`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                const successMsg = window.i18n ? window.i18n.t('notifications.plugin_enabled') : `Plugin ${pluginId} enabled`;
                this.showSuccess(successMsg);
                await this.loadPlugins();
                // UI für Dashboard aktualisieren
                if (typeof checkPluginsAndUpdateUI === 'function') {
                    await checkPluginsAndUpdateUI();
                }
            } else {
                const errorMsg = window.i18n ? window.i18n.t('plugins.error_prefix', { error: data.error }) : 'Error: ' + data.error;
                this.showError(errorMsg);
            }
        } catch (error) {
            console.error('Error enabling plugin:', error);
            const errorMsg = window.i18n ? window.i18n.t('plugins.enable_failed', { error: error.message }) : 'Error enabling: ' + error.message;
            this.showError(errorMsg);
        }
    }

    /**
     * Deaktiviert ein Plugin
     */
    async disablePlugin(pluginId) {
        try {
            const response = await fetch(`/api/plugins/${pluginId}/disable`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                const successMsg = window.i18n ? window.i18n.t('notifications.plugin_disabled') : `Plugin ${pluginId} disabled`;
                this.showSuccess(successMsg);
                await this.loadPlugins();
                // UI für Dashboard aktualisieren
                if (typeof checkPluginsAndUpdateUI === 'function') {
                    await checkPluginsAndUpdateUI();
                }
            } else {
                const errorMsg = window.i18n ? window.i18n.t('plugins.error_prefix', { error: data.error }) : 'Error: ' + data.error;
                this.showError(errorMsg);
            }
        } catch (error) {
            console.error('Error disabling plugin:', error);
            const errorMsg = window.i18n ? window.i18n.t('plugins.disable_failed', { error: error.message }) : 'Error disabling: ' + error.message;
            this.showError(errorMsg);
        }
    }

    /**
     * Lädt ein Plugin neu
     */
    async reloadPlugin(pluginId) {
        try {
            const response = await fetch(`/api/plugins/${pluginId}/reload`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                const successMsg = window.i18n ? window.i18n.t('notifications.plugin_reloaded') : `Plugin ${pluginId} reloaded`;
                await this.loadPlugins();
                // UI für Dashboard aktualisieren
                if (typeof checkPluginsAndUpdateUI === 'function') {
                    await checkPluginsAndUpdateUI();
                }
            } else {
                const errorMsg = window.i18n ? window.i18n.t('plugins.error_prefix', { error: data.error }) : 'Error: ' + data.error;
                this.showError(errorMsg);
            }
        } catch (error) {
            console.error('Error reloading plugin:', error);
            const errorMsg = window.i18n ? window.i18n.t('plugins.reload_failed', { error: error.message }) : 'Error reloading: ' + error.message;
            this.showError(errorMsg);
        }
    }

    /**
     * Löscht ein Plugin
     */
    async deletePlugin(pluginId) {
        const confirmMsg = window.i18n ? window.i18n.t('plugins.delete_confirm', { name: pluginId }) : `Really delete plugin "${pluginId}"?`;
        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            const response = await fetch(`/api/plugins/${pluginId}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (data.success) {
                const successMsg = window.i18n ? window.i18n.t('notifications.plugin_deleted') : `Plugin ${pluginId} deleted`;
                this.showSuccess(successMsg);
                await this.loadPlugins();
                // UI für Dashboard aktualisieren
                if (typeof checkPluginsAndUpdateUI === 'function') {
                    await checkPluginsAndUpdateUI();
                }
            } else {
                const errorMsg = window.i18n ? window.i18n.t('plugins.error_prefix', { error: data.error }) : 'Error: ' + data.error;
                this.showError(errorMsg);
            }
        } catch (error) {
            console.error('Error deleting plugin:', error);
            const errorMsg = window.i18n ? window.i18n.t('plugins.error_prefix', { error: error.message }) : 'Error: ' + error.message;
            this.showError(errorMsg);
        }
    }

    /**
     * Lädt alle Plugins neu
     */
    async reloadAllPlugins() {
        const confirmMsg = window.i18n ? window.i18n.t('plugins.reload_all_confirm') : 'Reload all plugins?';
        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            const response = await fetch('/api/plugins/reload', {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                this.showSuccess('Alle Plugins neu geladen');
                await this.loadPlugins();
                // UI für Dashboard aktualisieren
                if (typeof checkPluginsAndUpdateUI === 'function') {
                    await checkPluginsAndUpdateUI();
                }
            } else {
                this.showError('Fehler: ' + data.error);
            }
        } catch (error) {
            console.error('Error reloading plugins:', error);
            this.showError('Fehler beim Neuladen: ' + error.message);
        }
    }

    /**
     * Behandelt Plugin-Upload
     */
    async handleFileUpload(file) {
        if (!file) return;

        if (!file.name.endsWith('.zip')) {
            this.showError('Bitte wähle eine ZIP-Datei aus');
            return;
        }

        const formData = new FormData();
        formData.append('plugin', file);

        try {
            this.showInfo('Plugin wird hochgeladen...');

            const response = await fetch('/api/plugins/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Plugin "${data.plugin.name}" erfolgreich hochgeladen und geladen`);
                await this.loadPlugins();
                // UI für Dashboard aktualisieren
                if (typeof checkPluginsAndUpdateUI === 'function') {
                    await checkPluginsAndUpdateUI();
                }
            } else {
                this.showError('Fehler beim Hochladen: ' + data.error);
            }
        } catch (error) {
            console.error('Error uploading plugin:', error);
            this.showError('Fehler beim Hochladen: ' + error.message);
        } finally {
            // Input zurücksetzen
            document.getElementById('plugin-file-input').value = '';
        }
    }

    /**
     * Hilfsfunktionen für Benachrichtigungen
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showInfo(message) {
        this.showNotification(message, 'info');
    }

    showNotification(message, type = 'info') {
        // Einfache Notification (kann später mit besserer UI ersetzt werden)
        const colors = {
            success: 'bg-green-600',
            error: 'bg-red-600',
            info: 'bg-blue-600'
        };

        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    /**
     * HTML-Escaping
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Plugin Manager initialisieren, wenn DOM geladen ist
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.pluginManager = new PluginManager();
    });
} else {
    window.pluginManager = new PluginManager();
}
