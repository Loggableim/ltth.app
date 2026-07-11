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
        this.storePlugins = [];
        this.storeSources = [];
        this.storeErrors = [];
        this.storeNotices = [];
        this.communityEnabled = false;
        this.storeAccount = null;
        this.filteredPlugins = [];
        this.filteredStorePlugins = [];
        this.currentFilter = 'all';
        this.currentSort = 'name';
        this.searchQuery = '';
        this.compactMode = false;
        this.currentTab = 'store';
        this.currentStoreMode = 'store';
        this.currentStoreCategory = 'all';
        this.selectedStorePlugin = null;
        this.storeAuthReady = false;
        this.storeCategories = [
            { id: 'all', label: 'All' },
            { id: 'featured', label: 'Featured' },
            { id: 'overlays', label: 'Overlays' },
            { id: 'audio', label: 'Audio & TTS' },
            { id: 'games', label: 'Games' },
            { id: 'automation', label: 'Automation' },
            { id: 'integrations', label: 'Integrations' },
            { id: 'utilities', label: 'Utilities' },
            { id: 'open-beta', label: 'Open Beta' }
        ];
        this.devStatusFilters = {
            'stable': true,
            'working-beta': true,
            'development-beta': true,
            'early-version': true,
            'non-working-beta': true
        };
        this.init();
    }

    init() {
        // Event-Listener registrieren
        const uploadBtn = document.getElementById('upload-plugin-btn');
        const fileInput = document.getElementById('plugin-file-input');
        const reloadBtn = document.getElementById('reload-plugins-btn');
        const enableCommunityBtn = document.getElementById('enable-community-store-btn');
        const addCommunityBtn = document.getElementById('add-community-source-btn');

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

        // Store controls may be re-rendered while auth and translations load.
        // Delegate in the capture phase so the buttons retain their behavior
        // even when their DOM nodes are replaced by another UI pass.
        this.storeControlClickHandler = event => {
            const modeButton = event.target.closest('.plugin-mode-btn, .plugin-tab-btn');
            if (modeButton) {
                this.setStoreMode(modeButton.getAttribute('data-plugin-mode') || modeButton.getAttribute('data-plugin-tab'));
                return;
            }

            const filterButton = event.target.closest('.plugin-filter-btn');
            if (filterButton) {
                this.setPluginFilter(filterButton.getAttribute('data-filter'));
            }
        };
        document.addEventListener('click', this.storeControlClickHandler, true);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeStorePluginDetail();
            }
        });

        if (enableCommunityBtn) {
            enableCommunityBtn.addEventListener('click', () => this.enableCommunitySources());
        }

        if (addCommunityBtn) {
            addCommunityBtn.addEventListener('click', () => this.addCommunitySource());
        }

        if (window.StoreAuth && typeof window.StoreAuth.onChange === 'function') {
            window.StoreAuth.onChange(async ({ signedIn }) => {
                if (signedIn) {
                    this.storeAccount = window.StoreAuth?.account || this.storeAccount || null;
                    await this.loadStorePlugins(false);
                    this.applyFiltersAndSort();
                    return;
                }

                this.storeAccount = null;
                this.storePlugins = [];
                this.storeSources = [];
                this.storeErrors = [];
                this.storeNotices = [];
                this.communityEnabled = false;
                this.filteredStorePlugins = [];
                this.renderStoreShell();
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
        this.updateStoreModeControls();
        this.renderStoreCategoryChips();
    }

    applyFiltersAndSort() {
        if (this.currentStoreMode !== 'installed') {
            this.applyStoreFiltersAndSort();
            return;
        }

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
            // Unknown statuses should not make installed plugins disappear.
            if (!(plugin.devStatus in this.devStatusFilters)) return true;
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

    applyStoreFiltersAndSort() {
        if (this.currentStoreMode === 'sources') {
            this.filteredStorePlugins = [];
            this.renderStoreShell();
            return;
        }

        let filtered = this.getStorePluginsForCurrentMode().filter(plugin => {
            if (this.searchQuery) {
                const searchStr = `${plugin.name} ${plugin.description} ${plugin.id} ${plugin.author} ${plugin.category} ${plugin.sourceName}`.toLowerCase();
                if (!searchStr.includes(this.searchQuery)) {
                    return false;
                }
            }

            if (this.currentStoreMode === 'store' && this.currentStoreCategory !== 'all') {
                return this.storePluginMatchesCategory(plugin, this.currentStoreCategory);
            }

            return true;
        });

        filtered.sort((a, b) => {
            switch (this.currentSort) {
                case 'status':
                    return (b.installed ? 1 : 0) - (a.installed ? 1 : 0);
                case 'type':
                    return (a.category || '').localeCompare(b.category || '');
                case 'author':
                    return (a.author || '').localeCompare(b.author || '');
                case 'name':
                default:
                    return a.name.localeCompare(b.name);
            }
        });

        this.filteredStorePlugins = filtered;
        this.renderStoreShell();
    }

    setTab(tab) {
        this.setStoreMode(tab === 'store' ? 'store' : 'installed');
    }

    setPluginFilter(filter) {
        const nextFilter = ['all', 'active', 'inactive'].includes(filter) ? filter : 'all';
        document.querySelectorAll('.plugin-filter-btn').forEach(button => {
            const isActive = button.getAttribute('data-filter') === nextFilter;
            button.classList.toggle('active', isActive);
            button.style.removeProperty('background');
            button.style.removeProperty('border-color');
            button.style.removeProperty('color');
        });
        this.currentFilter = nextFilter;
        this.applyFiltersAndSort();
    }

    setStoreMode(mode) {
        const nextMode = ['store', 'installed', 'updates', 'sources'].includes(mode) ? mode : 'store';
        this.currentStoreMode = nextMode;
        this.currentTab = nextMode;

        document.querySelectorAll('.plugin-mode-btn, .plugin-tab-btn').forEach(btn => {
            const btnMode = btn.getAttribute('data-plugin-mode') || btn.getAttribute('data-plugin-tab');
            const isActive = btnMode === this.currentStoreMode;
            btn.classList.toggle('active', isActive);
            btn.style.background = isActive ? 'var(--color-active-bg)' : 'var(--color-bg-secondary)';
            btn.style.borderColor = isActive ? 'var(--color-active-border)' : 'var(--color-border)';
            btn.style.color = isActive ? 'var(--color-accent-primary)' : 'var(--color-text-muted)';
        });

        this.updateStoreModeControls();

        this.applyFiltersAndSort();
    }

    /**
     * Lädt alle Plugins vom Server
     */
    async loadPlugins() {
        try {
            const locale = window.i18n?.currentLocale || localStorage.getItem('app_locale') || 'en';
            const response = await fetch(`/api/plugins?locale=${encodeURIComponent(locale)}`);
            const data = await response.json();

            if (data.success) {
                this.plugins = data.plugins;
                this.updateStats();
                await this.loadStorePlugins(false);
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

    async loadStorePlugins(showErrors = true) {
        try {
            if (!(await this.ensureStoreAuth(showErrors))) {
                this.storePlugins = [];
                this.storeSources = [];
                this.storeErrors = [];
                this.storeNotices = [];
                this.communityEnabled = false;
                this.filteredStorePlugins = [];
                this.storeAccount = null;
                return false;
            }

            const locale = window.i18n?.currentLocale || localStorage.getItem('app_locale') || 'en';
            const response = await fetch(`/api/plugin-store?locale=${encodeURIComponent(locale)}`, {
                headers: await this.getStoreAuthHeaders()
            });
            const data = await response.json();

            if (data.success) {
                this.storeAccount = window.StoreAuth?.account || this.storeAccount || null;
                this.storePlugins = data.plugins || [];
                this.storeSources = data.sources || [];
                this.storeErrors = data.errors || [];
                this.storeNotices = data.notices || [];
                this.communityEnabled = data.communityEnabled === true;
                this.updateCommunityPanel();
            } else if (showErrors) {
                this.showError(data.error || 'Plugin store could not be loaded');
            }
        } catch (error) {
            console.error('Error loading plugin store:', error);
            if (showErrors) {
                this.showError('Error loading plugin store: ' + error.message);
            }
        }
    }

    async ensureStoreAuth(showErrors = true) {
        if (!window.StoreAuth || typeof window.StoreAuth.requireAuth !== 'function') {
            return true;
        }

        try {
            this.storeAuthReady = true;
            const signedIn = await window.StoreAuth.requireAuth();
            if (signedIn) {
                this.storeAccount = window.StoreAuth?.account || this.storeAccount || null;
            }
            if (!signedIn && showErrors) {
                this.storeErrors = [];
            }
            return signedIn;
        } catch (error) {
            if (showErrors) {
                this.showError(error?.message || 'Account required to access the plugin store.');
            }
            return false;
        }
    }

    async getStoreAuthHeaders() {
        const headers = {};
        const token = window.StoreAuth && typeof window.StoreAuth.getToken === 'function'
            ? await window.StoreAuth.getToken()
            : '';

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        return headers;
    }

    updateCommunityPanel() {
        const disabledPanel = document.getElementById('plugin-community-disabled');
        const enabledPanel = document.getElementById('plugin-community-enabled');

        if (disabledPanel) {
            disabledPanel.style.display = this.communityEnabled ? 'none' : 'flex';
        }

        if (enabledPanel) {
            enabledPanel.style.display = this.communityEnabled ? 'block' : 'none';
        }

        this.renderSourcesPanel();
    }

    updateStoreModeControls() {
        const installedMode = this.currentStoreMode === 'installed';
        const sourcesMode = this.currentStoreMode === 'sources';
        const storeMode = this.currentStoreMode === 'store';

        if (window.StoreAuth && typeof window.StoreAuth.setStoreMode === 'function') {
            window.StoreAuth.setStoreMode(installedMode ? 'installed' : 'store');
        }

        ['upload-plugin-btn', 'reload-plugins-btn', 'compact-mode-toggle'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.style.display = installedMode ? '' : 'none';
        });

        document.querySelectorAll('.plugin-filter-btn').forEach(btn => {
            btn.style.display = installedMode ? '' : 'none';
        });

        document.querySelectorAll('.dev-status-filter').forEach(input => {
            const label = input.closest('label');
            if (label) label.style.display = installedMode ? 'flex' : 'none';
        });

        const devStatusLabel = Array.from(document.querySelectorAll('span'))
            .find(span => span.textContent && span.textContent.trim() === 'Dev Status:');
        if (devStatusLabel && devStatusLabel.parentElement) {
            devStatusLabel.parentElement.style.display = installedMode ? 'flex' : 'none';
        }

        const categoryChips = document.getElementById('plugin-store-category-chips');
        if (categoryChips) {
            categoryChips.style.display = storeMode ? 'flex' : 'none';
        }

        const sourcesPanel = document.getElementById('plugin-store-sources-panel');
        if (sourcesPanel) {
            sourcesPanel.style.display = sourcesMode ? 'block' : 'none';
        }

        const pluginsContainer = document.getElementById('plugins-container');
        if (pluginsContainer) {
            pluginsContainer.style.display = sourcesMode ? 'none' : '';
        }
    }

    getStorePluginsForCurrentMode() {
        if (this.currentStoreMode === 'updates') {
            return this.storePlugins.filter(plugin => plugin.installed && plugin.updateAvailable);
        }
        return this.storePlugins;
    }

    storePluginMatchesCategory(plugin, category) {
        const categoryText = `${plugin.category || ''} ${plugin.type || ''}`.toLowerCase();
        const id = String(plugin.id || '').toLowerCase();
        const badges = Array.isArray(plugin.badges) ? plugin.badges : [];

        if (category === 'featured') return this.isFeaturedStorePlugin(plugin);
        if (category === 'open-beta') return plugin.channel === 'open-beta' || badges.includes('open-beta');
        if (category === 'audio') return /audio|tts|sound|music|stt|voice/.test(`${categoryText} ${id}`);
        if (category === 'games') return /game|quiz|battle|story|tier|leaderboard/.test(`${categoryText} ${id}`);
        if (category === 'automation') return /automation|timer|milestone|goal|event|bot/.test(`${categoryText} ${id}`);
        if (category === 'integrations') return /integration|bridge|api|osc|minecraft|vdoninja|openshock|connect/.test(`${categoryText} ${id}`);
        if (category === 'overlays') return /overlay|hud|emoji|rain|firework|flame|ticker|spotlight|avatar|head/.test(`${categoryText} ${id}`);
        if (category === 'utilities') {
            return !['audio', 'games', 'automation', 'integrations', 'overlays', 'open-beta']
                .some(otherCategory => this.storePluginMatchesCategory(plugin, otherCategory));
        }
        return true;
    }

    isFeaturedStorePlugin(plugin) {
        const id = String(plugin.id || '').toLowerCase();
        return plugin.installed || ['chatango', 'goals', 'spotlight', 'milestone-leaderboard', 'soundboard', 'toptier', 'tts', 'webgpu-emoji-rain', 'emoji-rain'].includes(id);
    }

    renderStoreCategoryChips() {
        const container = document.getElementById('plugin-store-category-chips');
        if (!container) return;

        container.innerHTML = this.storeCategories.map(category => {
            const active = category.id === this.currentStoreCategory;
            return `
                <button class="plugin-store-category-chip" data-store-category="${category.id}" style="padding: 0.55rem 0.85rem; border-radius: 999px; border: 1px solid ${active ? 'var(--color-active-border)' : 'var(--color-border)'}; background: ${active ? 'var(--color-active-bg)' : 'var(--color-bg-secondary)'}; color: ${active ? 'var(--color-accent-primary)' : 'var(--color-text-muted)'}; font-size: 0.82rem; cursor: pointer; white-space: nowrap;">
                    ${this.escapeHtml(category.label)}
                </button>
            `;
        }).join('');

        container.querySelectorAll('[data-store-category]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentStoreCategory = btn.getAttribute('data-store-category') || 'all';
                this.applyStoreFiltersAndSort();
            });
        });
    }

    renderSourcesPanel() {
        const sourceList = document.getElementById('plugin-store-source-list');
        const errorBox = document.getElementById('plugin-store-source-errors');

        if (errorBox) {
            if (this.storeErrors.length > 0) {
                errorBox.style.display = 'block';
                errorBox.innerHTML = this.storeErrors.map(error => `
                    <div style="padding: 0.75rem 1rem; border: 1px solid rgba(251, 191, 36, 0.35); background: rgba(251, 191, 36, 0.12); border-radius: 8px; color: #fbbf24; font-size: 0.9rem; margin-bottom: 0.5rem;">
                        ${this.escapeHtml(error.message || error.error || 'A store source could not be loaded.')}
                    </div>
                `).join('');
            } else {
                errorBox.style.display = 'none';
                errorBox.innerHTML = '';
            }
        }

        if (!sourceList) return;

        const sources = this.storeSources || [];
        sourceList.innerHTML = sources.length === 0
            ? '<div style="color: var(--color-text-muted); font-size: 0.9rem;">No community sources added yet.</div>'
            : sources.map(source => `
                <div style="border: 1px solid var(--color-border); border-radius: 8px; padding: 0.85rem; background: var(--color-bg-secondary);">
                    <div style="font-weight: 700; color: var(--color-text-primary); margin-bottom: 4px;">${this.escapeHtml(source.name || source.id)}</div>
                    <div style="font-size: 0.78rem; color: var(--color-text-muted); font-family: monospace; overflow-wrap: anywhere;">${this.escapeHtml(source.url || '')}</div>
                </div>
            `).join('');
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

        if (this.currentStoreMode !== 'installed') {
            this.renderStoreShell();
            return;
        }

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

    renderStoreShell() {
        const container = document.getElementById('plugins-container');
        if (!container) return;

        this.updateStoreModeControls();
        this.renderStoreCategoryChips();
        if (this.currentStoreMode === 'sources') {
            this.renderSourcesPanel();
            return;
        }

        container.className = '';

        const errorsHtml = this.storeErrors.length > 0 && this.currentStoreMode === 'store'
            ? `<div style="padding: 0.75rem 1rem; margin-bottom: 1rem; border: 1px solid rgba(251, 191, 36, 0.35); background: rgba(251, 191, 36, 0.12); border-radius: 8px; color: #fbbf24; font-size: 0.9rem;">Some community store sources could not be loaded. Check Sources for details.</div>`
            : '';
        const headerHtml = this.renderStoreHeader();
        const showFeatured = this.currentStoreMode === 'store' && !this.searchQuery && this.currentStoreCategory === 'all';
        const featuredPlugins = showFeatured ? this.getFeaturedStorePlugins() : [];
        const featuredKeys = new Set(featuredPlugins.map(plugin => `${plugin.sourceId}:${plugin.id}`));
        const gridPlugins = showFeatured
            ? this.filteredStorePlugins.filter(plugin => !featuredKeys.has(`${plugin.sourceId}:${plugin.id}`))
            : this.filteredStorePlugins;
        const featuredHtml = showFeatured ? this.renderFeaturedStoreRow(featuredPlugins) : '';

        if (this.filteredStorePlugins.length === 0) {
            container.innerHTML = headerHtml + errorsHtml + `
                <div class="text-center text-gray-400 py-12" style="border: 1px dashed var(--color-border); border-radius: 12px; background: var(--color-bg-card);">
                    <i data-lucide="${this.currentStoreMode === 'updates' ? 'check-circle' : 'shopping-bag'}" style="width: 56px; height: 56px; margin: 0 auto 1rem; color: #60a5fa;"></i>
                    <p class="text-lg">${this.currentStoreMode === 'updates' ? 'All plugins are up to date' : 'No plugins match this search'}</p>
                    <p class="text-sm mt-2">${this.currentStoreMode === 'updates' ? 'Installed plugins do not have available store updates.' : 'Try another search term or category.'}</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        container.innerHTML = headerHtml + errorsHtml + featuredHtml + `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; align-items: stretch;">
                ${gridPlugins.map(plugin => this.renderStorePlugin(plugin)).join('')}
            </div>
        `;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.bindStoreCardEvents(container);
    }

    renderStorePlugins() {
        this.renderStoreShell();
    }

    renderStoreHeader() {
        const total = this.storePlugins.length;
        const installed = this.storePlugins.filter(plugin => plugin.installed).length;
        const updates = this.storePlugins.filter(plugin => plugin.installed && plugin.updateAvailable).length;
        const title = this.currentStoreMode === 'updates' ? 'Plugin Updates' : 'Official LTTH Plugin Store';
        const subtitle = this.currentStoreMode === 'updates'
            ? 'Updates available from configured plugin sources.'
            : 'Browse official LTTH plugins. Community repos stay hidden until you enable them in Sources.';

        return `
            <div style="display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; margin-bottom: 1rem; padding: 1rem; background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 12px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; color: var(--color-text-primary); font-weight: 800; font-size: 1.15rem; margin-bottom: 4px;">
                        <i data-lucide="${this.currentStoreMode === 'updates' ? 'download' : 'shopping-bag'}" style="width: 20px; height: 20px; color: var(--color-accent-primary);"></i>
                        ${title}
                    </div>
                    <div style="color: var(--color-text-muted); font-size: 0.9rem;">${subtitle}</div>
                </div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${this.renderStoreBadge(`${total} plugins`, 'package')}
                    ${this.renderStoreBadge(`${installed} installed`, 'check-circle')}
                    ${this.renderStoreBadge(`${updates} updates`, 'download')}
                    ${this.renderStoreBadge(this.communityEnabled ? 'Community on' : 'Community off', 'users')}
                </div>
            </div>
        `;
    }

    getFeaturedStorePlugins() {
        return this.storePlugins.filter(plugin => this.isFeaturedStorePlugin(plugin)).slice(0, 4);
    }

    renderFeaturedStoreRow(featured = this.getFeaturedStorePlugins()) {
        if (featured.length === 0) return '';

        return `
            <div style="margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; gap: 8px; color: var(--color-text-primary); font-weight: 700; margin-bottom: 0.75rem;">
                    <i data-lucide="sparkles" style="width: 18px; height: 18px; color: #fbbf24;"></i>
                    Featured LTTH plugins
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem;">
                    ${featured.map(plugin => this.renderStorePlugin(plugin, true)).join('')}
                </div>
            </div>
        `;
    }

    renderStorePlugin(plugin, compact = false) {
        const action = this.getStorePluginAction(plugin);
        const pricing = this.getStorePluginPricing(plugin);
        const badgeHtml = this.renderStorePluginBadges(plugin);
        const category = this.getStorePluginCategoryLabel(plugin);
        const iconText = this.getStorePluginInitials(plugin);
        const accent = this.getStorePluginAccent(plugin);
        const logo = this.getPluginLogo(plugin);

        return `
            <button type="button" class="plugin-store-card" data-store-card="true" data-source-id="${this.escapeHtml(plugin.sourceId || '')}" data-plugin-id="${this.escapeHtml(plugin.id || '')}" style="text-align: left; width: 100%; min-height: ${compact ? '170px' : '220px'}; display: flex; flex-direction: column; gap: 0.85rem; background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 8px; padding: ${compact ? '0.9rem' : '1rem'}; cursor: pointer; color: inherit; transition: border-color 0.2s, transform 0.2s;">
                <div style="display: flex; gap: 0.85rem; align-items: flex-start;">
                    <div class="plugin-manager-logo" style="width: 52px; height: 52px; flex: 0 0 52px; border-radius: 12px; background: ${accent.background}; border: 1px solid ${accent.border}; display: flex; align-items: center; justify-content: center; color: ${accent.color}; font-weight: 800; font-size: 1rem; overflow: hidden;">
                        ${logo ? `<img src="${this.escapeHtml(logo)}" alt="${this.escapeHtml(plugin.name || plugin.id)} logo" loading="lazy" style="width: 100%; height: 100%; object-fit: contain; padding: 6px;" onerror="this.remove(); this.parentElement.textContent='${this.escapeHtml(iconText)}';">` : this.escapeHtml(iconText)}
                    </div>
                    <div style="min-width: 0; flex: 1;">
                        <div style="color: var(--color-text-primary); font-weight: 800; font-size: 1rem; line-height: 1.2; margin-bottom: 0.35rem; overflow-wrap: anywhere;">${this.escapeHtml(plugin.name || plugin.id)}</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.35rem;">${badgeHtml}</div>
                    </div>
                </div>
                <div style="color: var(--color-text-muted); font-size: 0.88rem; line-height: 1.35; min-height: 2.4rem; overflow: hidden;">${this.escapeHtml(plugin.description || 'No description available')}</div>
                <div style="margin-top: auto; display: flex; justify-content: space-between; gap: 0.75rem; align-items: end;">
                    <div style="min-width: 0; color: var(--color-text-muted); font-size: 0.78rem;">
                        <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 3px;"><i data-lucide="folder" style="width: 13px; height: 13px;"></i><span>${this.escapeHtml(category)}</span></div>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;">
                            <span style="font-family: monospace;">v${this.escapeHtml(plugin.version || '0.0.0')}</span>
                            <span style="color: ${pricing.type === 'free' ? '#34d399' : '#fbbf24'}; font-weight: 700;">${this.escapeHtml(pricing.label)}</span>
                        </div>
                    </div>
                    <span data-store-action="true" data-source-id="${this.escapeHtml(plugin.sourceId || '')}" data-plugin-id="${this.escapeHtml(plugin.id || '')}" style="display: inline-flex; align-items: center; gap: 6px; min-width: 94px; justify-content: center; padding: 0.55rem 0.7rem; border-radius: 8px; border: 1px solid ${action.disabled ? 'var(--color-border)' : 'rgba(16, 185, 129, 0.45)'}; background: ${action.disabled ? 'var(--color-bg-secondary)' : 'rgba(16, 185, 129, 0.16)'}; color: ${action.disabled ? 'var(--color-text-muted)' : '#34d399'}; font-size: 0.82rem; font-weight: 700;">
                        <i data-lucide="${action.icon}" style="width: 15px; height: 15px;"></i>
                        ${action.label}
                    </span>
                </div>
            </button>
        `;
    }

    bindStoreCardEvents(container) {
        container.querySelectorAll('[data-store-card]').forEach(card => {
            card.addEventListener('click', () => {
                this.openStorePluginDetail(card.getAttribute('data-source-id'), card.getAttribute('data-plugin-id'));
            });
        });

        container.querySelectorAll('[data-store-action]').forEach(action => {
            action.addEventListener('click', (event) => {
                event.stopPropagation();
                const plugin = this.findStorePlugin(action.getAttribute('data-source-id'), action.getAttribute('data-plugin-id'));
                if (plugin) this.handleStorePluginAction(plugin);
            });
        });
    }

    findStorePlugin(sourceId, pluginId) {
        return this.storePlugins.find(plugin => String(plugin.sourceId) === String(sourceId) && String(plugin.id) === String(pluginId));
    }

    getStoreAccount() {
        return this.storeAccount || window.StoreAuth?.account || null;
    }

    getStorePluginAccessInfo(plugin) {
        const access = plugin?.access || {};
        const type = String(access.type || '').toLowerCase();

        if (access.hidden === true && type !== 'admin') {
            return { type: 'hidden', label: 'Hidden', icon: 'eye-off' };
        }

        if (type === 'admin') {
            return { type, label: 'Admin only', icon: 'shield' };
        }

        if (type === 'subscriber') {
            return { type, label: 'Subscriber only', icon: 'crown' };
        }

        if (type === 'closed-beta') {
            return { type, label: 'Closed beta', icon: 'lock' };
        }

        return null;
    }

    hasStoreAccess(accessType, pluginId = '') {
        const account = this.getStoreAccount();
        const groups = new Set((account?.access?.groups || []).map(value => String(value || '').toLowerCase()));
        const closedBetaPlugins = new Set((account?.access?.closedBetaPlugins || []).map(value => String(value || '').toLowerCase()));
        const normalizedType = String(accessType || '').toLowerCase();
        const normalizedPluginId = String(pluginId || '').toLowerCase();

        if (groups.has('admin')) {
            return true;
        }

        if (!normalizedType || normalizedType === 'public') {
            return true;
        }

        if (normalizedType === 'hidden') {
            return groups.has('admin');
        }

        if (normalizedType === 'admin') {
            return false;
        }

        if (normalizedType === 'subscriber') {
            return groups.has('subscriber');
        }

        if (normalizedType === 'closed-beta') {
            return groups.has('closed-beta') || closedBetaPlugins.has(normalizedPluginId);
        }

        return true;
    }

    getStorePluginAction(plugin) {
        const accessInfo = this.getStorePluginAccessInfo(plugin);
        const locked = accessInfo && !this.hasStoreAccess(accessInfo.type, plugin.id);

        if (!plugin.packageUrl) {
            if (plugin.catalogOnly === true) {
                return { label: 'Catalog Only', icon: 'info', disabled: true };
            }
            return { label: 'Package missing', icon: 'package-x', disabled: true };
        }
        if (locked && !plugin.installed) {
            return { label: accessInfo.label, icon: accessInfo.icon, disabled: true };
        }
        if (this.getStorePluginPricing(plugin).type === 'paid' && !plugin.owned) {
            return { label: 'Buy', icon: 'shopping-cart', disabled: true };
        }
        if (plugin.installed && plugin.updateAvailable) {
            if (locked) {
                return { label: accessInfo.label, icon: accessInfo.icon, disabled: true };
            }
            return { label: 'Update', icon: 'download', disabled: false };
        }
        if (plugin.installed) {
            return { label: 'Manage', icon: 'settings', disabled: false };
        }
        return { label: 'Install', icon: 'plus', disabled: false };
    }

    async handleStorePluginAction(plugin) {
        const accessInfo = this.getStorePluginAccessInfo(plugin);
        if (accessInfo && !this.hasStoreAccess(accessInfo.type, plugin.id) && !plugin.installed) {
            this.showError(`${plugin.name || plugin.id} requires ${accessInfo.label.toLowerCase()} access.`);
            return;
        }

        if (!plugin.packageUrl) {
            this.openStorePluginDetail(plugin.sourceId, plugin.id);
            return;
        }

        if (this.getStorePluginPricing(plugin).type === 'paid' && !plugin.owned) {
            this.openStorePluginDetail(plugin.sourceId, plugin.id);
            return;
        }

        if (plugin.installed && !plugin.updateAvailable) {
            this.currentStoreMode = 'installed';
            this.setStoreMode('installed');
            const searchInput = document.getElementById('plugin-search');
            this.searchQuery = String(plugin.id || '').toLowerCase();
            if (searchInput) searchInput.value = this.searchQuery;
            this.applyFiltersAndSort();
            return;
        }

        await this.installStorePlugin(plugin.sourceId, plugin.id);
    }

    getStorePluginPricing(plugin) {
        const pricing = plugin.pricing || {};
        if (pricing.type === 'paid') {
            const amount = Number.isFinite(pricing.amount) ? pricing.amount : 0;
            const currency = pricing.currency || 'EUR';
            return {
                type: 'paid',
                amount,
                currency,
                label: amount > 0 ? `${(amount / 100).toFixed(2)} ${currency}` : `Paid ${currency}`
            };
        }

        return {
            type: 'free',
            amount: 0,
            currency: pricing.currency || 'EUR',
            label: 'Free'
        };
    }

    renderStoreBadge(label, icon) {
        return `
            <span style="display: inline-flex; align-items: center; gap: 5px; padding: 0.4rem 0.65rem; border-radius: 999px; border: 1px solid var(--color-border); background: var(--color-bg-secondary); color: var(--color-text-muted); font-size: 0.78rem; white-space: nowrap;">
                <i data-lucide="${icon}" style="width: 13px; height: 13px;"></i>
                ${this.escapeHtml(label)}
            </span>
        `;
    }

    renderStorePluginBadges(plugin) {
        const badges = [];
        const rawBadges = Array.isArray(plugin.badges) ? plugin.badges : [];

        badges.push(plugin.official
            ? '<span style="padding: 3px 8px; border-radius: 999px; background: rgba(59, 130, 246, 0.14); color: #60a5fa; font-size: 0.7rem;">Official</span>'
            : '<span style="padding: 3px 8px; border-radius: 999px; background: rgba(251, 191, 36, 0.14); color: #fbbf24; font-size: 0.7rem;">Community</span>');

        if (plugin.channel === 'open-beta' || rawBadges.includes('open-beta')) {
            badges.push('<span style="padding: 3px 8px; border-radius: 999px; background: rgba(251, 191, 36, 0.14); color: #fbbf24; font-size: 0.7rem;">Open Beta</span>');
        }

        const accessInfo = this.getStorePluginAccessInfo(plugin);
        if (accessInfo && (accessInfo.type !== 'hidden' || this.hasStoreAccess('hidden', plugin.id))) {
            badges.push(`<span style="padding: 3px 8px; border-radius: 999px; background: rgba(148, 163, 184, 0.14); color: #cbd5e1; font-size: 0.7rem;">${this.escapeHtml(accessInfo.label)}</span>`);
        }

        if (plugin.installed) {
            badges.push(`<span style="padding: 3px 8px; border-radius: 999px; background: rgba(34, 197, 94, 0.14); color: #22c55e; font-size: 0.7rem;">${plugin.updateAvailable ? 'Update' : 'Installed'}</span>`);
        }

        return badges.join('');
    }

    getStorePluginCategoryLabel(plugin) {
        const category = String(plugin.category || plugin.type || 'utilities').toLowerCase();
        const match = this.storeCategories.find(item => item.id !== 'all' && this.storePluginMatchesCategory(plugin, item.id));
        if (match && match.id !== 'utilities') return match.label;
        return category.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    }

    getStorePluginInitials(plugin) {
        const name = String(plugin.name || plugin.id || 'LT').trim();
        const words = name.split(/\s+/).filter(Boolean);
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
    }

    getStorePluginAccent(plugin) {
        const category = this.getStorePluginCategoryLabel(plugin).toLowerCase();
        if (category.includes('audio')) return { background: 'rgba(16, 185, 129, 0.14)', border: 'rgba(16, 185, 129, 0.35)', color: '#34d399' };
        if (category.includes('game')) return { background: 'rgba(244, 114, 182, 0.14)', border: 'rgba(244, 114, 182, 0.35)', color: '#f472b6' };
        if (category.includes('integration')) return { background: 'rgba(96, 165, 250, 0.14)', border: 'rgba(96, 165, 250, 0.35)', color: '#60a5fa' };
        if (category.includes('overlay')) return { background: 'rgba(251, 191, 36, 0.14)', border: 'rgba(251, 191, 36, 0.35)', color: '#fbbf24' };
        return { background: 'rgba(148, 163, 184, 0.14)', border: 'rgba(148, 163, 184, 0.35)', color: '#cbd5e1' };
    }

    openStorePluginDetail(sourceId, pluginId) {
        const plugin = this.findStorePlugin(sourceId, pluginId);
        if (!plugin) return;

        this.selectedStorePlugin = plugin;
        this.renderStorePluginDetail(plugin);
    }

    closeStorePluginDetail() {
        const drawer = document.getElementById('plugin-store-detail-drawer');
        if (!drawer) return;
        drawer.style.display = 'none';
        drawer.setAttribute('aria-hidden', 'true');
        drawer.innerHTML = '';
        this.selectedStorePlugin = null;
    }

    renderStorePluginDetail(plugin) {
        const drawer = document.getElementById('plugin-store-detail-drawer');
        if (!drawer) return;

        const action = this.getStorePluginAction(plugin);
        const pricing = this.getStorePluginPricing(plugin);
        const category = this.getStorePluginCategoryLabel(plugin);
        const badges = this.renderStorePluginBadges(plugin);
        const screenshots = Array.isArray(plugin.screenshots) && plugin.screenshots.length > 0
            ? plugin.screenshots.map(src => `<img src="${this.escapeHtml(src)}" alt="" style="width: 100%; border-radius: 8px; border: 1px solid var(--color-border);">`).join('')
            : '<div style="height: 120px; border: 1px dashed var(--color-border); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--color-text-muted); font-size: 0.9rem;">No screenshots yet</div>';

        drawer.style.display = 'block';
        drawer.setAttribute('aria-hidden', 'false');
        drawer.innerHTML = `
            <div data-store-drawer-backdrop style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 1200;"></div>
            <aside role="dialog" aria-modal="true" aria-label="${this.escapeHtml(plugin.name || plugin.id)} details" style="position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 100vw); background: var(--color-bg-primary); border-left: 1px solid var(--color-border); z-index: 1201; padding: 1.25rem; overflow-y: auto; box-shadow: -18px 0 40px rgba(0, 0, 0, 0.35);">
                <div style="display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1rem;">
                    <div>
                        <div style="color: var(--color-text-primary); font-weight: 800; font-size: 1.35rem; margin-bottom: 0.45rem;">${this.escapeHtml(plugin.name || plugin.id)}</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.35rem;">${badges}</div>
                    </div>
                    <button type="button" data-store-drawer-close class="btn btn-ghost" style="padding: 0.55rem;">
                        <i data-lucide="x" style="width: 18px; height: 18px;"></i>
                    </button>
                </div>
                <p style="color: var(--color-text-muted); line-height: 1.5; margin: 0 0 1rem;">${this.escapeHtml(plugin.description || 'No description available')}</p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
                    ${this.renderStoreDetailField('Version', `v${plugin.version || '0.0.0'}`)}
                    ${this.renderStoreDetailField('Installed', plugin.installedVersion || (plugin.installed ? 'Yes' : 'No'))}
                    ${this.renderStoreDetailField('Category', category)}
                    ${this.renderStoreDetailField('Source', plugin.sourceName || plugin.sourceId || 'LTTH')}
                    ${this.renderStoreDetailField('Author', plugin.author || 'Unknown')}
                    ${this.renderStoreDetailField('Price', pricing.label)}
                    ${this.renderStoreDetailField('Compatibility', plugin.minLtthVersion ? `LTTH ${plugin.minLtthVersion}+` : 'Current LTTH')}
                </div>
                ${plugin.channel === 'open-beta' ? '<div style="padding: 0.75rem; border-radius: 8px; background: rgba(251, 191, 36, 0.12); border: 1px solid rgba(251, 191, 36, 0.35); color: #fbbf24; font-size: 0.9rem; margin-bottom: 1rem;">Open Beta: this plugin may change faster than stable plugins.</div>' : ''}
                <div style="margin-bottom: 1rem;">
                    <div style="font-weight: 700; color: var(--color-text-primary); margin-bottom: 0.6rem;">Screenshots</div>
                    <div style="display: grid; gap: 0.75rem;">${screenshots}</div>
                </div>
                <button type="button" data-store-drawer-action class="btn btn-primary" style="width: 100%; justify-content: center;" ${action.disabled ? 'disabled' : ''}>
                    <i data-lucide="${action.icon}"></i>
                    ${action.label}
                </button>
                ${!plugin.packageUrl ? '<div style="color: var(--color-text-muted); font-size: 0.82rem; margin-top: 0.6rem;">This store entry does not provide an install package yet.</div>' : ''}
                ${pricing.type === 'paid' ? '<div style="color: var(--color-text-muted); font-size: 0.82rem; margin-top: 0.6rem;">Paid plugin checkout is reserved for a later store release.</div>' : ''}
            </aside>
        `;

        drawer.querySelector('[data-store-drawer-backdrop]')?.addEventListener('click', () => this.closeStorePluginDetail());
        drawer.querySelector('[data-store-drawer-close]')?.addEventListener('click', () => this.closeStorePluginDetail());
        drawer.querySelector('[data-store-drawer-action]')?.addEventListener('click', () => this.handleStorePluginAction(plugin));

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    renderStoreDetailField(label, value) {
        return `
            <div style="border: 1px solid var(--color-border); border-radius: 8px; padding: 0.7rem; background: var(--color-bg-card); min-width: 0;">
                <div style="color: var(--color-text-muted); font-size: 0.72rem; text-transform: uppercase; margin-bottom: 0.25rem;">${this.escapeHtml(label)}</div>
                <div style="color: var(--color-text-primary); font-size: 0.88rem; overflow-wrap: anywhere;">${this.escapeHtml(value)}</div>
            </div>
        `;
    }

    renderInstalledHeader() {
        return `
            <div style="display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; margin-bottom: 1rem; padding: 1rem; background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 12px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; color: var(--color-text-primary); font-weight: 800; font-size: 1.15rem; margin-bottom: 4px;">
                        <i data-lucide="hard-drive" style="width: 20px; height: 20px; color: var(--color-accent-primary);"></i>
                        Installed Plugins
                    </div>
                    <div style="color: var(--color-text-muted); font-size: 0.9rem;">Manage local plugins, reload development work, upload ZIP packages, and review plugin status.</div>
                </div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${this.renderStoreBadge(`${this.plugins.length} total`, 'package')}
                    ${this.renderStoreBadge(`${this.plugins.filter(plugin => plugin.enabled).length} active`, 'check-circle')}
                    ${this.renderStoreBadge(`${this.plugins.filter(plugin => !plugin.enabled).length} inactive`, 'pause-circle')}
                </div>
            </div>
        `;
    }

    /**
     * Renders plugins in normal card view
     */
    renderPluginsNormal() {
        const container = document.getElementById('plugins-container');
        container.className = 'space-y-4';
        container.innerHTML = this.renderInstalledHeader() + this.filteredPlugins.map(plugin => this.renderPlugin(plugin)).join('');

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
        
        const tableHTML = this.renderInstalledHeader() + `
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
        const logo = this.getPluginLogo(plugin);
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
                <span class="plugin-status-dot ${plugin.enabled ? 'status-active' : 'status-inactive'}"></span>
                <!-- Subtle gradient overlay -->
                <div style="position: absolute; top: 0; right: 0; width: 200px; height: 200px; background: radial-gradient(circle at top right, rgba(59, 130, 246, 0.1) 0%, transparent 70%); pointer-events: none;"></div>
                
                <div style="position: relative; display: flex; gap: 1.5rem;">
                    <!-- Plugin Icon -->
                    <div style="flex-shrink: 0;">
                        <div style="width: 64px; height: 64px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(147, 51, 234, 0.2) 100%); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            ${logo ? `<img src="${this.escapeHtml(logo)}" alt="${this.escapeHtml(plugin.name || plugin.id)} logo" loading="lazy" style="width: 100%; height: 100%; object-fit: contain; padding: 8px;" onerror="this.replaceWith(Object.assign(document.createElement('i'), {className: 'plugin-logo-fallback', textContent: '${this.escapeHtml(this.getPluginInitials(plugin))}'}));">` : `<span class="plugin-logo-fallback">${this.escapeHtml(this.getPluginInitials(plugin))}</span>`}
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

    getPluginInitials(plugin) {
        const source = String(plugin?.name || plugin?.id || 'LTTH').trim();
        const words = source.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
        return (words.length > 1 ? words.slice(0, 2).map(word => word[0]) : [source.slice(0, 2)]).join('').toUpperCase();
    }

    getPluginLogo(plugin) {
        const id = String(plugin?.id || '').trim();
        const overrides = {
            'advanced-timer': '/plugins/advanced-timer/assets/advanced-timer-icon.png',
            'clarityhud': '/plugins/clarityhud/assets/clarity-icon.png',
            'coinbattle': '/plugins/coinbattle/assets/coinbattle-icon.png',
            'fireworks': '/plugins/fireworks/assets/fireworks-icon.png',
            'flame-overlay': '/plugins/flame-overlay/assets/branding/visual-fx-frame-icon.png',
            'game-engine': '/plugins/game-engine/assets/branding/ltth-game-engine-icon.png',
            'goals': '/plugins/goals/assets/live-goals-icon.png',
            'interactive-story': '/plugins/interactive-story/assets/interactive-story-icon.png',
            'milestone-leaderboard': '/plugins/milestone-leaderboard/assets/viewer-xp-icon.png',
            'music-bot': '/plugins/music-bot/assets/soundbot.png',
            'openshock': '/plugins/openshock/assets/branding/hybridshock-icon.png',
            'quiz-show': '/plugins/quiz-show/assets/quiz-show-icon.png',
            'spotlight': '/plugins/spotlight/assets/spotlight-icon.png',
            'toptier': '/plugins/toptier/assets/toptier-icon.png',
            'multicam': '/multicam-icon.png',
            'osc-bridge': '/osc-bridge-icon.png',
            'soundboard': '/soundboard-icon.png',
            'stt-ticker': '/sttlogo.png',
            'tts': '/ltthttsicon.png',
            'weather-control': '/weather-control-icon.png',
            'emoji-rain': '/plugins/emoji-rain/assets/sidebar-icon.png',
            'webgpu-emoji-rain': '/plugins/webgpu-emoji-rain/assets/sidebar-icon.png',
            'webgpu-fireworks': '/plugins/webgpu-fireworks/assets/fireworks-icon.png'
        };
        const raw = typeof plugin?.logo === 'string' ? plugin.logo.trim() : '';
        if (raw) {
            if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) return raw;
            if (raw.startsWith('/plugins/')) return raw;
            // Plugin manifests may point to an app-public asset (for example
            // /soundboard-logo.png). Keep that root path intact; prefixing it
            // with /plugins would make the browser request a non-existent URL.
            if (/^\/(?:soundboard|ltthtts|ltthicon|ltthappicon|multicam|osc-bridge|weather-control|sttlogo)/i.test(raw)) {
                return raw;
            }
            if (id && raw.startsWith(`/${id}/`)) return `/plugins${raw}`;
            if (id && raw.startsWith('/')) return `/plugins/${id}${raw}`;
            if (id) return `/plugins/${id}/${raw.replace(/^\.\//, '')}`;
        }
        return overrides[id] || '';
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

    async installStorePlugin(sourceId, pluginId) {
        try {
            if (!(await this.ensureStoreAuth(true))) {
                return;
            }

            const plugin = this.storePlugins.find(item => item.sourceId === sourceId && item.id === pluginId);
            if (plugin && plugin.community) {
                const confirmMsg = `Install community plugin "${plugin.name}" from "${plugin.sourceName}"?`;
                if (!confirm(confirmMsg)) {
                    return;
                }
            }

            this.showInfo('Installing plugin...');
            const response = await fetch(`/api/plugin-store/${encodeURIComponent(sourceId)}/${encodeURIComponent(pluginId)}/install`, {
                method: 'POST',
                headers: await this.getStoreAuthHeaders()
            });
            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Plugin "${data.plugin.name}" installed`);
                await this.loadPlugins();
                await this.loadStorePlugins(false);
                this.applyFiltersAndSort();
                if (typeof checkPluginsAndUpdateUI === 'function') {
                    await checkPluginsAndUpdateUI();
                }
            } else {
                this.showError('Install failed: ' + data.error);
            }
        } catch (error) {
            console.error('Error installing plugin:', error);
            this.showError('Install failed: ' + error.message);
        }
    }

    async enableCommunitySources() {
        const confirmMsg = 'Enable community plugin sources? Only add registries you trust.';
        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            const response = await fetch('/api/plugin-store/community/enable', {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                this.communityEnabled = data.communityEnabled === true;
                this.storeSources = data.sources || [];
                this.updateCommunityPanel();
                this.applyFiltersAndSort();
                this.showSuccess('Community plugin sources enabled');
            } else {
                this.showError('Could not enable community sources: ' + data.error);
            }
        } catch (error) {
            console.error('Error enabling community sources:', error);
            this.showError('Could not enable community sources: ' + error.message);
        }
    }

    async addCommunitySource() {
        const idInput = document.getElementById('community-source-id');
        const nameInput = document.getElementById('community-source-name');
        const urlInput = document.getElementById('community-source-url');

        const payload = {
            id: idInput ? idInput.value.trim() : '',
            name: nameInput ? nameInput.value.trim() : '',
            url: urlInput ? urlInput.value.trim() : ''
        };

        try {
            const response = await fetch('/api/plugin-store/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();

            if (data.success) {
                this.storeSources = data.sources || [];
                if (idInput) idInput.value = '';
                if (nameInput) nameInput.value = '';
                if (urlInput) urlInput.value = '';
                await this.loadStorePlugins(false);
                this.applyFiltersAndSort();
                this.showSuccess('Community source added');
            } else {
                this.showError('Could not add source: ' + data.error);
            }
        } catch (error) {
            console.error('Error adding community source:', error);
            this.showError('Could not add source: ' + error.message);
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

function initializePluginManager() {
    if (window.pluginManager) return window.pluginManager;
    if (!document.getElementById('view-plugins')) return null;

    window.pluginManager = new PluginManager();
    return window.pluginManager;
}

// The script is loaded after the App Store markup, so initialize immediately.
// This makes the manager available when navigation restores the App Store in
// its earlier DOMContentLoaded handler and calls loadPlugins(). Keep the event
// fallback for pages that embed this script before the App Store markup.
if (!initializePluginManager()) {
    document.addEventListener('DOMContentLoaded', initializePluginManager, { once: true });
}
