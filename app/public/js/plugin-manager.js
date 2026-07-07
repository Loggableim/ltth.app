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
        this.filteredPlugins = [];
        this.filteredStorePlugins = [];
        this.currentFilter = 'all';
        this.currentSort = 'name';
        this.currentStoreSort = 'relevance';
        this.searchQuery = '';
        this.compactMode = false;
        this.currentTab = 'store';
        this.currentStoreMode = 'store';
        this.currentStoreCategory = 'all';
        this.selectedStorePlugin = null;
        this.currentAppVersion = null;
        this.storeAccount = window.StoreAuth?.account || null;
        this.currentStoreFilters = {
            official: false,
            free: false,
            openBeta: false,
            compatible: false,
            installed: false
        };
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
        const modeBtns = document.querySelectorAll('.plugin-mode-btn, .plugin-tab-btn');

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

        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setStoreMode(btn.getAttribute('data-plugin-mode') || btn.getAttribute('data-plugin-tab'));
            });
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeStorePluginDetail();
            }
        });

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
                if (this.currentStoreMode === 'installed') {
                    this.currentSort = e.target.value;
                } else {
                    this.currentStoreSort = e.target.value;
                }
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
        if (window.StoreAuth && typeof window.StoreAuth.onChange === 'function') {
            window.StoreAuth.onChange((state) => {
                this.storeAccount = state.account || null;
                if (state.signedIn) {
                    this.loadPlugins();
                } else {
                    this.storePlugins = [];
                    this.filteredStorePlugins = [];
                    this.renderStoreShell();
                }
            });
        }

        this.updateStoreModeControls();
        this.renderStoreCategoryChips();
        this.loadCurrentAppVersion();
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
        const query = String(this.searchQuery || '').trim();
        const filtered = [];

        for (const plugin of this.getStorePluginsForCurrentMode()) {
            if (this.currentStoreMode === 'store' && this.currentStoreCategory !== 'all' && !this.storePluginMatchesCategory(plugin, this.currentStoreCategory)) {
                continue;
            }

            if (this.currentStoreFilters.official && !plugin.official) {
                continue;
            }

            if (this.currentStoreFilters.free && this.getStorePluginPricing(plugin).type !== 'free') {
                continue;
            }

            if (this.currentStoreFilters.openBeta && plugin.channel !== 'open-beta' && !(Array.isArray(plugin.badges) && plugin.badges.includes('open-beta'))) {
                continue;
            }

            if (this.currentStoreFilters.installed && !plugin.installed) {
                continue;
            }

            if (this.currentStoreFilters.compatible && !this.isStorePluginCompatible(plugin)) {
                continue;
            }

            if (query && this.getStorePluginSearchScore(plugin, query) === 0) {
                continue;
            }

            filtered.push(plugin);
        }

        filtered.sort((a, b) => this.compareStorePlugins(a, b, query));

        this.filteredStorePlugins = filtered;
        this.renderStoreShell();
    }

    setTab(tab) {
        this.setStoreMode(tab === 'store' ? 'store' : 'installed');
    }

    setStoreMode(mode) {
        const nextMode = ['store', 'installed', 'updates'].includes(mode) ? mode : 'store';
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
        if (this.currentStoreMode === 'installed') {
            this.closeStorePluginDetail();
        }

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
            const hasStoreAuth = await this.requireStoreAuth(showErrors);
            if (!hasStoreAuth) {
                this.storePlugins = [];
                this.filteredStorePlugins = [];
                this.renderStoreShell();
                return;
            }

            const locale = window.i18n?.currentLocale || localStorage.getItem('app_locale') || 'en';
            const response = await fetch(`/api/plugin-store?locale=${encodeURIComponent(locale)}`, {
                headers: await this.getStoreAuthHeaders()
            });
            const data = await response.json();

            if (data.success) {
                this.storePlugins = data.plugins || [];
                this.storeSources = data.sources || [];
                this.storeErrors = data.errors || [];
                this.storeNotices = data.notices || [];
                this.communityEnabled = data.communityEnabled === true;
            } else if (data.code === 'AUTH_REQUIRED') {
                window.StoreAuth?.showSignIn?.();
            } else if (showErrors) {
                this.showError(data.error || 'App Store could not be loaded');
            }
        } catch (error) {
            console.error('Error loading App Store:', error);
            if (showErrors) {
                this.showError('Error loading App Store: ' + error.message);
            }
        }
    }

    async requireStoreAuth(showErrors = true) {
        if (!window.StoreAuth || typeof window.StoreAuth.requireAuth !== 'function') {
            return true;
        }

        try {
            return await window.StoreAuth.requireAuth();
        } catch (error) {
            console.warn('App Store auth is unavailable:', error);
            if (showErrors) {
                this.showError('App Store login is unavailable: ' + error.message);
            }
            return false;
        }
    }

    async getStoreAuthHeaders() {
        if (!window.StoreAuth || typeof window.StoreAuth.getToken !== 'function') {
            return {};
        }

        const token = await window.StoreAuth.getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    hasStoreLicense() {
        return this.storeAccount?.license?.active === true;
    }

    hasClosedBetaPluginAccess(plugin) {
        if (plugin?.access?.type !== 'closed-beta') {
            return true;
        }

        const access = this.storeAccount?.access || {};
        const groups = Array.isArray(access.groups) ? access.groups : [];
        const closedBetaPlugins = Array.isArray(access.closedBetaPlugins) ? access.closedBetaPlugins : [];
        const normalizedGroups = groups.map(group => String(group || '').toLowerCase());
        const normalizedPlugins = closedBetaPlugins.map(pluginId => String(pluginId || '').toLowerCase());
        const pluginId = String(plugin.id || '').toLowerCase();

        return normalizedGroups.includes('admin') ||
            normalizedGroups.includes('closed-beta') ||
            normalizedPlugins.includes(pluginId);
    }

    getStoreLicense() {
        return this.storeAccount?.license || {
            active: false,
            status: 'missing',
            plan: null,
            licenseId: null
        };
    }

    async claimBetaLicense() {
        const hasStoreAuth = await this.requireStoreAuth(true);
        if (!hasStoreAuth) {
            return false;
        }

        try {
            this.showInfo('Claiming free beta license...');
            const response = await fetch('/api/plugin-store/license/claim', {
                method: 'POST',
                headers: await this.getStoreAuthHeaders()
            });
            const data = await response.json();

            if (!data.success) {
                this.showError(data.error || 'Beta license could not be claimed.');
                return false;
            }

            if (window.StoreAuth && typeof window.StoreAuth.refreshAccount === 'function') {
                this.storeAccount = await window.StoreAuth.refreshAccount();
            } else {
                this.storeAccount = {
                    ...(this.storeAccount || {}),
                    license: data.license
                };
            }

            this.showSuccess('Free LTTH beta license activated.');
            this.renderStoreShell();
            return true;
        } catch (error) {
            console.error('Error claiming beta license:', error);
            this.showError('Beta license claim failed: ' + error.message);
            return false;
        }
    }

    async loadCurrentAppVersion() {
        try {
            const response = await fetch('/api/update/current');
            const data = await response.json();

            if (data && data.success && data.version) {
                this.currentAppVersion = String(data.version);
                this.applyFiltersAndSort();
            }
        } catch (error) {
            console.warn('Could not load current app version for App Store compatibility filters:', error);
        }
    }

    compareVersions(a = '0.0.0', b = '0.0.0') {
        const left = String(a).split('.').map((part) => parseInt(part, 10) || 0);
        const right = String(b).split('.').map((part) => parseInt(part, 10) || 0);
        const length = Math.max(left.length, right.length);

        for (let index = 0; index < length; index += 1) {
            const diff = (left[index] || 0) - (right[index] || 0);
            if (diff !== 0) {
                return diff;
            }
        }

        return 0;
    }

    updateStoreModeControls() {
        const installedMode = this.currentStoreMode === 'installed';
        const storeMode = this.currentStoreMode === 'store';

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

        const pluginsContainer = document.getElementById('plugins-container');
        if (pluginsContainer) {
            pluginsContainer.style.display = '';
        }

        this.syncStoreControls();
        this.syncStoreQuickFilters();
    }

    syncStoreControls() {
        const searchInput = document.getElementById('plugin-search');
        const sortSelect = document.getElementById('plugin-sort');

        if (searchInput) {
            if (this.currentStoreMode === 'installed') {
                searchInput.placeholder = 'Search installed plugins...';
            } else if (this.currentStoreMode === 'updates') {
                searchInput.placeholder = 'Search plugin updates...';
            } else {
                searchInput.placeholder = 'Search the store...';
            }
        }

        if (sortSelect) {
            const isInstalled = this.currentStoreMode === 'installed';
            const options = isInstalled ? this.getInstalledSortOptions() : this.getStoreSortOptions();
            const currentValue = isInstalled ? this.currentSort : this.currentStoreSort;
            sortSelect.innerHTML = options.map(option => `
                <option value="${this.escapeHtml(option.value)}">${this.escapeHtml(option.label)}</option>
            `).join('');
            sortSelect.value = currentValue;
        }
    }

    syncStoreQuickFilters() {
        const container = document.getElementById('plugin-store-filter-chips');
        if (!container) return;

        const quickFilters = [
            { id: 'official', label: 'Official', icon: 'shield-check' },
            { id: 'free', label: 'Free', icon: 'badge-check' },
            { id: 'openBeta', label: 'Open Beta', icon: 'flask-conical' },
            { id: 'compatible', label: 'Compatible', icon: 'check-circle-2' },
            { id: 'installed', label: 'Installed', icon: 'hard-drive' }
        ];

        const active = this.currentStoreMode === 'store' || this.currentStoreMode === 'updates';
        container.style.display = active ? 'flex' : 'none';
        container.innerHTML = quickFilters.map(filter => {
            const isActive = Boolean(this.currentStoreFilters[filter.id]);
            return `
                <button type="button" class="plugin-store-filter-chip ${isActive ? 'active' : ''}" data-store-filter="${filter.id}" aria-pressed="${isActive ? 'true' : 'false'}">
                    <i data-lucide="${filter.icon}" style="width: 13px; height: 13px;"></i>
                    <span>${this.escapeHtml(filter.label)}</span>
                </button>
            `;
        }).join('');

        container.querySelectorAll('[data-store-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                const filterId = btn.getAttribute('data-store-filter');
                this.currentStoreFilters[filterId] = !this.currentStoreFilters[filterId];
                this.syncStoreQuickFilters();
                this.applyFiltersAndSort();
            });
        });
    }

    getInstalledSortOptions() {
        return [
            { value: 'name', label: 'Name' },
            { value: 'status', label: 'Status' },
            { value: 'type', label: 'Type' },
            { value: 'author', label: 'Author' }
        ];
    }

    getStoreSortOptions() {
        return [
            { value: 'relevance', label: 'Relevance' },
            { value: 'updates', label: 'Updates' },
            { value: 'newest', label: 'Newest' },
            { value: 'popular', label: 'Popular' },
            { value: 'name', label: 'Name' }
        ];
    }

    getStorePluginsForCurrentMode() {
        if (this.currentStoreMode === 'updates') {
            return this.storePlugins.filter(plugin => plugin.installed && plugin.updateAvailable);
        }
        return this.storePlugins;
    }

    isStorePluginCompatible(plugin) {
        if (!plugin || !plugin.minLtthVersion || !this.currentAppVersion) {
            return true;
        }

        return this.compareVersions(this.currentAppVersion, plugin.minLtthVersion) >= 0;
    }

    getStorePluginSearchScore(plugin, query) {
        const terms = [
            plugin.name,
            plugin.description,
            plugin.id,
            plugin.author,
            plugin.sourceName,
            plugin.category,
            plugin.channel,
            ...(Array.isArray(plugin.badges) ? plugin.badges : [])
        ].filter(Boolean).map(value => String(value).toLowerCase());

        const normalizedQuery = String(query || '').toLowerCase();
        if (!normalizedQuery) {
            return 1;
        }

        let score = 0;
        const name = String(plugin.name || '').toLowerCase();
        const id = String(plugin.id || '').toLowerCase();
        const description = String(plugin.description || '').toLowerCase();
        const sourceName = String(plugin.sourceName || '').toLowerCase();

        if (id === normalizedQuery) score += 200;
        if (name === normalizedQuery) score += 180;
        if (name.startsWith(normalizedQuery)) score += 120;
        if (name.includes(normalizedQuery)) score += 90;
        if (id.includes(normalizedQuery)) score += 80;
        if (description.includes(normalizedQuery)) score += 60;
        if (sourceName.includes(normalizedQuery)) score += 40;

        for (const term of terms) {
            if (term.includes(normalizedQuery)) {
                score += 8;
            }
        }

        if (plugin.installed) score += 10;
        if (plugin.updateAvailable) score += 12;
        if (plugin.official) score += 6;
        if (plugin.packageUrl) score += 4;

        return score;
    }

    compareStorePlugins(a, b, query = '') {
        const leftScore = query ? this.getStorePluginSearchScore(a, query) : this.getStoreSortScore(a, this.currentStoreSort);
        const rightScore = query ? this.getStorePluginSearchScore(b, query) : this.getStoreSortScore(b, this.currentStoreSort);

        if (leftScore !== rightScore) {
            return rightScore - leftScore;
        }

        return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''));
    }

    getStoreSortScore(plugin, sortKey) {
        switch (sortKey) {
            case 'updates':
                return plugin.updateAvailable ? 1000 + this.versionWeight(plugin.version) : 0;
            case 'newest':
                return this.versionWeight(plugin.version);
            case 'popular':
                return this.getPopularityScore(plugin);
            case 'relevance':
                return this.getRelevanceScore(plugin);
            case 'name':
            default:
                return 0;
        }
    }

    versionWeight(version) {
        const parts = String(version || '0.0.0').split('.').map(part => parseInt(part, 10) || 0);
        return (parts[0] * 10000) + (parts[1] * 100) + (parts[2] || 0);
    }

    getPopularityScore(plugin) {
        let score = 0;
        if (plugin.official) score += 40;
        if (plugin.installed) score += 25;
        if (plugin.updateAvailable) score += 10;
        if (plugin.packageUrl) score += 12;
        if (plugin.screenshots && plugin.screenshots.length > 0) score += 8;
        if (plugin.channel === 'open-beta') score += 3;
        score += Array.isArray(plugin.badges) ? plugin.badges.length * 4 : 0;
        if (this.isFeaturedStorePlugin(plugin)) score += 20;
        return score;
    }

    getRelevanceScore(plugin) {
        let score = this.getPopularityScore(plugin);
        if (this.currentStoreFilters.official && plugin.official) score += 20;
        if (this.currentStoreFilters.free && this.getStorePluginPricing(plugin).type === 'free') score += 10;
        if (this.currentStoreFilters.compatible && this.isStorePluginCompatible(plugin)) score += 15;
        if (this.currentStoreFilters.installed && plugin.installed) score += 15;
        if (this.currentStoreFilters.openBeta && plugin.channel === 'open-beta') score += 8;
        if (this.currentStoreCategory === 'featured' && this.isFeaturedStorePlugin(plugin)) score += 25;
        if (this.currentStoreCategory === 'open-beta' && plugin.channel === 'open-beta') score += 25;
        if (this.currentStoreCategory !== 'all' && this.storePluginMatchesCategory(plugin, this.currentStoreCategory)) score += 20;
        return score;
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
        return plugin.installed || ['chatango', 'goals', 'spotlight', 'soundboard', 'toptier', 'tts', 'webgpu-emoji-rain', 'emoji-rain'].includes(id);
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
                    <i data-lucide="package-x" style="width: 64px; height: 64px; margin: 0 auto 1rem; color: var(--color-accent-primary);"></i>
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
        const heroContainer = document.getElementById('plugin-store-hero');
        if (!container) return;

        this.updateStoreModeControls();
        this.renderStoreCategoryChips();

        container.className = 'plugin-store-shell';

        const errorsHtml = this.storeErrors.length > 0 && this.currentStoreMode === 'store'
            ? `
                <div class="plugin-store-warning">
                    <i data-lucide="shield-alert" style="width: 16px; height: 16px;"></i>
                    <span>The official store catalog is using fallback data. Some metadata may be delayed.</span>
                </div>
            `
            : '';
        const headerHtml = this.renderStoreHeader();
        const discoverySections = this.currentStoreMode === 'store' && !this.searchQuery && this.currentStoreCategory === 'all' && !this.hasAnyStoreFilter()
            ? this.getStoreDiscoverySections()
            : [];
        const discoveryHtml = discoverySections.length > 0
            ? this.renderStoreDiscoverySections(discoverySections)
            : '';
        const discoveryKeys = new Set(
            discoverySections.flatMap(section => section.plugins.map(plugin => `${plugin.sourceId}:${plugin.id}`))
        );
        const gridPlugins = discoveryKeys.size > 0
            ? this.filteredStorePlugins.filter(plugin => !discoveryKeys.has(`${plugin.sourceId}:${plugin.id}`))
            : this.filteredStorePlugins;
        const gridHtml = gridPlugins.length === 0
            ? this.renderStoreEmptyState()
            : `
                <div class="plugin-store-grid">
                    ${gridPlugins.map(plugin => this.renderStorePlugin(plugin)).join('')}
                </div>
            `;

        if (heroContainer) {
            heroContainer.innerHTML = headerHtml;
            container.innerHTML = [errorsHtml, discoveryHtml, gridHtml].join('');
        } else {
            container.innerHTML = [headerHtml, errorsHtml, discoveryHtml, gridHtml].join('');
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.bindStoreCardEvents(container);
        if (heroContainer) {
            this.bindStoreCardEvents(heroContainer);
        }
    }

    renderStorePlugins() {
        this.renderStoreShell();
    }

    renderStoreHeader() {
        const total = this.storePlugins.length;
        const installed = this.storePlugins.filter(plugin => plugin.installed).length;
        const updates = this.storePlugins.filter(plugin => plugin.installed && plugin.updateAvailable).length;
        const title = this.currentStoreMode === 'updates'
            ? 'Plugin Updates'
            : this.currentStoreMode === 'installed'
                ? 'Installed Plugins'
                : 'Official LTTH App Store';
        const subtitle = this.currentStoreMode === 'updates'
            ? 'Review available upgrades before you install them.'
            : this.currentStoreMode === 'installed'
                ? 'Manage local plugins, reload dev builds, and review status.'
                : 'Browse the closed official LTTH catalog. A Clerk account is required for installs and updates.';
        const license = this.getStoreLicense();
        const licenseMeta = this.hasStoreLicense()
            ? this.renderStoreBadge('Beta license active', 'badge-check')
            : this.renderStoreBadge('Beta license required', 'badge-alert');
        const licenseActionHtml = !this.hasStoreLicense() && this.currentStoreMode !== 'installed'
            ? `
                <button type="button" class="plugin-store-update-all" data-store-license-claim="true">
                    <i data-lucide="badge-check" style="width: 15px; height: 15px;"></i>
                    Claim free beta license
                </button>
            `
            : '';
        const updateActionHtml = this.currentStoreMode === 'updates' && updates > 0
            ? `
                <button type="button" class="plugin-store-update-all" data-update-all-store-plugins="true">
                    <i data-lucide="download" style="width: 15px; height: 15px;"></i>
                    Update all official
                </button>
            `
            : '';
        const actionHtml = [licenseActionHtml, updateActionHtml].filter(Boolean).join('');
        const trustHtml = this.currentAppVersion
            ? `<span class="plugin-store-inline-note">Current LTTH version: v${this.escapeHtml(this.currentAppVersion)}</span>`
            : '<span class="plugin-store-inline-note">Version check pending</span>';
        const licenseHintHtml = this.hasStoreLicense()
            ? `<span class="plugin-store-inline-note">License: ${this.escapeHtml(license.plan || 'beta-free')}</span>`
            : '<span class="plugin-store-inline-note">Claim a free beta license to install or update plugins.</span>';

        return `
            <section class="plugin-store-header">
                <div class="plugin-store-header__body">
                    <div class="plugin-store-header__title">
                        <div class="plugin-store-header__title-row">
                            <i data-lucide="${this.currentStoreMode === 'updates' ? 'download' : this.currentStoreMode === 'installed' ? 'hard-drive' : 'shopping-bag'}" style="width: 22px; height: 22px; color: var(--color-accent-primary);"></i>
                            <h3>${title}</h3>
                        </div>
                        <p>${subtitle}</p>
                        <div class="plugin-store-header__meta">
                            ${this.renderStoreBadge(`${total} total`, 'package')}
                            ${this.renderStoreBadge(`${installed} installed`, 'check-circle')}
                            ${this.renderStoreBadge(`${updates} updates`, 'download')}
                            ${this.renderStoreBadge('Official catalog', 'shield-check')}
                            ${licenseMeta}
                            ${trustHtml}
                            ${licenseHintHtml}
                        </div>
                    </div>
                    <div class="plugin-store-header__side">
                        <div class="plugin-store-header__brand">
                            <img src="/appstore-logo.png" alt="LTTH AppStore logo" class="plugin-store-header__logo" loading="lazy">
                        </div>
                        <div class="plugin-store-header__actions">
                            ${actionHtml}
                        </div>
                    </div>
                </div>
            </section>
        `;
    }

    getFeaturedStorePlugins() {
        return this.storePlugins
            .filter(plugin => this.isFeaturedStorePlugin(plugin))
            .sort((a, b) => this.getPopularityScore(b) - this.getPopularityScore(a))
            .slice(0, 4);
    }

    getRecommendedStorePlugins() {
        const installedCategories = new Map();

        for (const plugin of this.storePlugins.filter(item => item.installed)) {
            const category = this.getStorePluginCategoryLabel(plugin).toLowerCase();
            installedCategories.set(category, (installedCategories.get(category) || 0) + 1);
        }

        return this.storePlugins
            .filter(plugin => !plugin.installed && this.currentStoreMode === 'store')
            .sort((a, b) => this.getRecommendationScore(b, installedCategories) - this.getRecommendationScore(a, installedCategories))
            .slice(0, 4);
    }

    getNewStorePlugins() {
        return this.storePlugins
            .filter(plugin => !plugin.installed)
            .sort((a, b) => this.versionWeight(b.version) - this.versionWeight(a.version))
            .slice(0, 4);
    }

    getPopularStorePlugins() {
        return this.storePlugins
            .filter(plugin => plugin.packageUrl)
            .sort((a, b) => this.getPopularityScore(b) - this.getPopularityScore(a))
            .slice(0, 4);
    }

    getRecommendationScore(plugin, installedCategories = new Map()) {
        let score = this.getPopularityScore(plugin);
        const category = this.getStorePluginCategoryLabel(plugin).toLowerCase();
        score += (installedCategories.get(category) || 0) * 15;
        if (this.isFeaturedStorePlugin(plugin)) score += 12;
        if (plugin.official) score += 6;
        if (this.isStorePluginCompatible(plugin)) score += 8;
        return score;
    }

    hasAnyStoreFilter() {
        return Object.values(this.currentStoreFilters).some(Boolean);
    }

    getStoreDiscoverySections() {
        return [
            { title: 'Featured', icon: 'sparkles', plugins: this.getFeaturedStorePlugins() },
            { title: 'For you', icon: 'wand-sparkles', plugins: this.getRecommendedStorePlugins() },
            { title: 'New', icon: 'clock-3', plugins: this.getNewStorePlugins() },
            { title: 'Popular', icon: 'trending-up', plugins: this.getPopularStorePlugins() }
        ].filter(section => section.plugins.length > 0);
    }

    renderStoreDiscoverySections(sections = this.getStoreDiscoverySections()) {
        if (!sections || sections.length === 0) {
            return '';
        }

        return `
            <div class="plugin-store-discovery">
                ${sections.map(section => this.renderStoreCollectionSection(section)).join('')}
            </div>
        `;
    }

    renderStoreCollectionSection(section) {
        return `
            <section class="plugin-store-collection">
                <div class="plugin-store-collection__header">
                    <div class="plugin-store-collection__title">
                        <i data-lucide="${section.icon}" style="width: 16px; height: 16px; color: var(--color-accent-primary);"></i>
                        <h4>${this.escapeHtml(section.title)}</h4>
                    </div>
                    <span>${section.plugins.length} plugins</span>
                </div>
                <div class="plugin-store-collection__grid">
                    ${section.plugins.map(plugin => this.renderStorePlugin(plugin, true)).join('')}
                </div>
            </section>
        `;
    }

    renderStoreEmptyState() {
        const emptyTitle = this.currentStoreMode === 'updates'
            ? 'No updates available'
            : 'No plugins match this view';
        const emptyText = this.currentStoreMode === 'updates'
            ? 'Installed plugins are already on the latest available store version.'
            : 'Try a different search term, sort order, or filter combination.';

        return `
            <div class="plugin-store-empty">
                <i data-lucide="${this.currentStoreMode === 'updates' ? 'check-circle-2' : 'search-x'}" style="width: 58px; height: 58px; color: var(--color-accent-primary);"></i>
                <h4>${emptyTitle}</h4>
                <p>${emptyText}</p>
            </div>
        `;
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
        const media = this.getStorePluginMedia(plugin, compact);
        const versionSummary = this.getStorePluginVersionSummary(plugin);
        const trustSummary = this.getStorePluginTrustSummary(plugin);
        const compatibilitySummary = this.getStorePluginCompatibilitySummary(plugin);

        return `
            <article class="plugin-store-card ${compact ? 'plugin-store-card--compact' : ''}" role="button" tabindex="0" data-store-card="true" data-source-id="${this.escapeHtml(plugin.sourceId || '')}" data-plugin-id="${this.escapeHtml(plugin.id || '')}" aria-label="${this.escapeHtml(plugin.name || plugin.id)}">
                ${media}
                <div class="plugin-store-card__body">
                    <div class="plugin-store-card__title-row">
                        <div class="plugin-store-card__title-wrap">
                            <div class="plugin-store-card__title">${this.escapeHtml(plugin.name || plugin.id)}</div>
                            <div class="plugin-store-card__badges">${badgeHtml}</div>
                        </div>
                        <span class="plugin-store-card__price ${pricing.type === 'free' ? 'is-free' : 'is-paid'}">${this.escapeHtml(pricing.label)}</span>
                    </div>
                    <p class="plugin-store-card__description">${this.escapeHtml(plugin.description || 'No description available')}</p>
                    <div class="plugin-store-card__summary">
                        <div class="plugin-store-card__summary-item">
                            <i data-lucide="folder" style="width: 13px; height: 13px;"></i>
                            <span>${this.escapeHtml(category)}</span>
                        </div>
                        <div class="plugin-store-card__summary-item">
                            <i data-lucide="tag" style="width: 13px; height: 13px;"></i>
                            <span>${this.escapeHtml(versionSummary)}</span>
                        </div>
                        <div class="plugin-store-card__summary-item">
                            <i data-lucide="shield-check" style="width: 13px; height: 13px;"></i>
                            <span>${this.escapeHtml(trustSummary)}</span>
                        </div>
                        <div class="plugin-store-card__summary-item">
                            <i data-lucide="check-circle-2" style="width: 13px; height: 13px;"></i>
                            <span>${this.escapeHtml(compatibilitySummary)}</span>
                        </div>
                    </div>
                </div>
                <div class="plugin-store-card__footer">
                    <div class="plugin-store-card__footer-meta">
                        <span>${this.escapeHtml(plugin.sourceName || (plugin.official ? 'Official LTTH' : 'External source'))}</span>
                        ${plugin.installed ? `<span>${plugin.updateAvailable ? `Installed ${this.escapeHtml(plugin.installedVersion || '')}` : 'Installed'}</span>` : '<span>Ready to install</span>'}
                    </div>
                    <button
                        type="button"
                        class="plugin-store-card__action ${action.disabled ? 'is-disabled' : ''}"
                        data-store-action="true"
                        data-source-id="${this.escapeHtml(plugin.sourceId || '')}"
                        data-plugin-id="${this.escapeHtml(plugin.id || '')}"
                        ${action.disabled ? 'disabled' : ''}
                    >
                        <i data-lucide="${action.icon}" style="width: 15px; height: 15px;"></i>
                        <span>${this.escapeHtml(action.label)}</span>
                    </button>
                </div>
            </article>
        `;
    }

    bindStoreCardEvents(container) {
        container.querySelectorAll('[data-store-card]').forEach(card => {
            card.addEventListener('click', (event) => {
                if (event.target.closest('[data-store-action="true"]')) {
                    return;
                }
                this.openStorePluginDetail(card.getAttribute('data-source-id'), card.getAttribute('data-plugin-id'));
            });
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.openStorePluginDetail(card.getAttribute('data-source-id'), card.getAttribute('data-plugin-id'));
                }
            });
        });

        container.querySelectorAll('[data-store-action]').forEach(action => {
            action.addEventListener('click', (event) => {
                event.stopPropagation();
                const plugin = this.findStorePlugin(action.getAttribute('data-source-id'), action.getAttribute('data-plugin-id'));
                if (plugin) this.handleStorePluginAction(plugin);
            });
        });

        const updateAllButton = container.querySelector('[data-update-all-store-plugins]');
        if (updateAllButton) {
            updateAllButton.addEventListener('click', () => this.updateAllStorePlugins());
        }

        const claimLicenseButton = container.querySelector('[data-store-license-claim]');
        if (claimLicenseButton) {
            claimLicenseButton.addEventListener('click', () => this.claimBetaLicense());
        }
    }

    findStorePlugin(sourceId, pluginId) {
        return this.storePlugins.find(plugin => String(plugin.sourceId) === String(sourceId) && String(plugin.id) === String(pluginId));
    }

    getStorePluginAction(plugin) {
        if (!plugin.packageUrl) {
            if (plugin.catalogOnly === true) {
                return { label: 'Catalog Only', icon: 'info', disabled: true };
            }
            return { label: 'Package missing', icon: 'package-x', disabled: true };
        }
        if (this.getStorePluginPricing(plugin).type === 'paid' && !plugin.owned) {
            return { label: 'Buy', icon: 'shopping-cart', disabled: true };
        }
        if ((!plugin.installed || plugin.updateAvailable) && plugin.access?.type === 'closed-beta' && !this.hasClosedBetaPluginAccess(plugin)) {
            return { label: 'Invite required', icon: 'lock', disabled: true };
        }
        if (!this.hasStoreLicense() && (!plugin.installed || plugin.updateAvailable)) {
            return { label: 'Claim License', icon: 'badge-check', disabled: false };
        }
        if (plugin.installed && plugin.updateAvailable) {
            return { label: 'Update', icon: 'download', disabled: false };
        }
        if (plugin.installed) {
            return { label: 'Manage', icon: 'settings', disabled: false };
        }
        return { label: 'Install', icon: 'plus', disabled: false };
    }

    async handleStorePluginAction(plugin) {
        if (!plugin.packageUrl) {
            this.openStorePluginDetail(plugin.sourceId, plugin.id);
            return;
        }

        if (this.getStorePluginPricing(plugin).type === 'paid' && !plugin.owned) {
            this.openStorePluginDetail(plugin.sourceId, plugin.id);
            return;
        }

        if ((!plugin.installed || plugin.updateAvailable) && plugin.access?.type === 'closed-beta' && !this.hasClosedBetaPluginAccess(plugin)) {
            this.openStorePluginDetail(plugin.sourceId, plugin.id);
            return;
        }

        if (!this.hasStoreLicense() && (!plugin.installed || plugin.updateAvailable)) {
            await this.claimBetaLicense();
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
            <span class="plugin-store-badge">
                <i data-lucide="${icon}" style="width: 13px; height: 13px;"></i>
                ${this.escapeHtml(label)}
            </span>
        `;
    }

    renderStorePluginBadges(plugin) {
        const badges = [];
        const rawBadges = Array.isArray(plugin.badges) ? plugin.badges : [];

        badges.push(plugin.official
            ? '<span class="plugin-store-chip plugin-store-chip--official">Official</span>'
            : '<span class="plugin-store-chip plugin-store-chip--external">External</span>');

        if (plugin.channel === 'open-beta' || rawBadges.includes('open-beta')) {
            badges.push('<span class="plugin-store-chip plugin-store-chip--warning">Open Beta</span>');
        }

        if (plugin.access?.type === 'closed-beta' || rawBadges.includes('closed-beta')) {
            badges.push('<span class="plugin-store-chip plugin-store-chip--danger">Closed Beta</span>');
        }

        if (plugin.sha256) {
            badges.push('<span class="plugin-store-chip plugin-store-chip--success">SHA-256</span>');
        }

        if (plugin.minLtthVersion) {
            badges.push(`<span class="plugin-store-chip plugin-store-chip--muted">LTTH ${this.escapeHtml(plugin.minLtthVersion)}+</span>`);
        }

        if (plugin.installed) {
            badges.push(`<span class="plugin-store-chip plugin-store-chip--installed">${plugin.updateAvailable ? 'Update' : 'Installed'}</span>`);
        }

        return badges.join('');
    }

    getStorePluginCategoryLabel(plugin) {
        const category = String(plugin.category || plugin.type || 'utilities').toLowerCase();
        const match = this.storeCategories.find(item => item.id !== 'all' && this.storePluginMatchesCategory(plugin, item.id));
        if (match && match.id !== 'utilities') return match.label;
        return category.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    }

    getStorePluginAccent(plugin) {
        const category = this.getStorePluginCategoryLabel(plugin).toLowerCase();
        if (category.includes('audio')) return { background: 'color-mix(in srgb, var(--color-accent-success) 14%, transparent)', border: 'color-mix(in srgb, var(--color-accent-success) 34%, transparent)', color: 'var(--color-accent-success)' };
        if (category.includes('game')) return { background: 'color-mix(in srgb, var(--color-accent-secondary) 14%, transparent)', border: 'color-mix(in srgb, var(--color-accent-secondary) 34%, transparent)', color: 'var(--color-accent-secondary)' };
        if (category.includes('integration')) return { background: 'color-mix(in srgb, var(--color-accent-primary) 14%, transparent)', border: 'color-mix(in srgb, var(--color-accent-primary) 34%, transparent)', color: 'var(--color-accent-primary)' };
        if (category.includes('overlay')) return { background: 'color-mix(in srgb, var(--color-accent-warning) 14%, transparent)', border: 'color-mix(in srgb, var(--color-accent-warning) 34%, transparent)', color: 'var(--color-accent-warning)' };
        return { background: 'color-mix(in srgb, var(--color-text-muted) 14%, transparent)', border: 'color-mix(in srgb, var(--color-text-muted) 34%, transparent)', color: 'var(--color-text-muted)' };
    }

    getStorePluginAccentStyle(plugin) {
        const accent = this.getStorePluginAccent(plugin);
        return `--store-icon-bg: ${accent.background}; --store-icon-border: ${accent.border}; --store-icon-color: ${accent.color};`;
    }

    getStorePluginBrandMedia(plugin) {
        const logo = typeof plugin.logo === 'string' ? plugin.logo.trim() : '';
        const icon = typeof plugin.icon === 'string' ? plugin.icon.trim() : '';
        const thumbnail = Array.isArray(plugin.screenshots) && plugin.screenshots.length > 0
            ? plugin.screenshots[0]
            : '';

        if (logo) {
            return {
                src: logo,
                alt: `${plugin.name || plugin.id} logo`,
                kind: 'logo'
            };
        }

        if (icon) {
            return {
                src: icon,
                alt: `${plugin.name || plugin.id} icon`,
                kind: 'icon'
            };
        }

        if (thumbnail) {
            return {
                src: thumbnail,
                alt: '',
                kind: 'screenshot'
            };
        }

        return null;
    }

    getStorePluginMedia(plugin, compact = false) {
        const media = this.getStorePluginBrandMedia(plugin);
        const accentStyle = this.getStorePluginAccentStyle(plugin);

        if (media) {
            const mediaClass = media.kind === 'screenshot' ? '' : 'is-brand';
            return `
                <div class="plugin-store-card__media ${compact ? 'is-compact' : ''} ${mediaClass}">
                    <img src="${this.escapeHtml(media.src)}" alt="${this.escapeHtml(media.alt)}" loading="lazy" />
                    <span class="plugin-store-card__media-chip">${this.escapeHtml(plugin.official ? 'Official' : 'External')}</span>
                </div>
            `;
        }

        return `
            <div class="plugin-store-card__media ${compact ? 'is-compact' : ''}">
                <div class="plugin-store-card__avatar" style="${accentStyle}" role="img" aria-label="LTTH app icon">
                    <span class="plugin-store-card__avatar-icon" data-icon-src="/ltthicon.png" aria-hidden="true"></span>
                </div>
                <span class="plugin-store-card__media-chip">${this.escapeHtml(plugin.official ? 'Official' : 'External')}</span>
            </div>
        `;
    }

    getStorePluginVersionSummary(plugin) {
        if (plugin.installed && plugin.updateAvailable && plugin.installedVersion) {
            return `v${plugin.installedVersion} -> v${plugin.version}`;
        }

        if (plugin.installed && plugin.installedVersion) {
            return `v${plugin.installedVersion}`;
        }

        return `v${plugin.version || '0.0.0'}`;
    }

    getStorePluginTrustSummary(plugin) {
        const summary = [];

        summary.push(plugin.official ? 'Official source' : 'External source');
        if (plugin.sha256) {
            summary.push('SHA-256 verified');
        }
        if (plugin.packageUrl) {
            summary.push('Installable package');
        }

        return summary.join(' · ');
    }

    getStorePluginCompatibilitySummary(plugin) {
        if (!plugin.minLtthVersion) {
            return this.isStorePluginCompatible(plugin) ? 'Compatible' : 'Compatibility unknown';
        }

        if (!this.currentAppVersion) {
            return `Requires LTTH ${plugin.minLtthVersion}+`;
        }

        return this.isStorePluginCompatible(plugin)
            ? `Compatible with LTTH ${this.currentAppVersion}`
            : `Requires LTTH ${plugin.minLtthVersion}+`;
    }

    renderStoreQualitySignals(plugin) {
        const quality = plugin.quality || {};
        const badges = Array.isArray(quality.badges) ? quality.badges : [];
        const level = quality.level || plugin.devStatus || 'beta';
        const signals = [
            `Quality level: ${level}`,
            ...(badges.length > 0 ? badges.map(badge => badge.replace(/-/g, ' ')) : ['Signed official package'])
        ];

        return `
            <section class="plugin-store-drawer__section">
                <div class="plugin-store-drawer__section-title">
                    <i data-lucide="shield-check" style="width: 15px; height: 15px;"></i>
                    <span>Quality signals</span>
                </div>
                <div class="plugin-store-badge-list">
                    ${signals.map(signal => this.renderStoreBadge(signal, 'badge-check')).join('')}
                </div>
            </section>
        `;
    }

    renderStoreRequirements(plugin) {
        const requirements = plugin.requirements || {};
        const secrets = Array.isArray(requirements.secrets) ? requirements.secrets : [];
        const externalAccounts = Array.isArray(requirements.externalAccounts) ? requirements.externalAccounts : [];
        const items = [
            ...secrets.map(secret => `Secret: ${secret}`),
            ...externalAccounts.map(account => `Account: ${account}`)
        ];

        if (items.length === 0) {
            items.push('No external account setup required');
        }

        return `
            <section class="plugin-store-drawer__section">
                <div class="plugin-store-drawer__section-title">
                    <i data-lucide="list-checks" style="width: 15px; height: 15px;"></i>
                    <span>Setup requirements</span>
                </div>
                <div class="plugin-store-drawer__stack">
                    ${items.map(item => `<p class="plugin-store-drawer__notes">- ${this.escapeHtml(item)}</p>`).join('')}
                </div>
            </section>
        `;
    }

    renderStoreUpdateNotes(plugin, changelogSummary) {
        const changelog = Array.isArray(plugin.changelog) ? plugin.changelog.slice(0, 4) : [];
        const notes = changelog.length > 0
            ? changelog.map(item => {
                const version = item.version ? `v${item.version}: ` : '';
                const summary = item.summary || item.notes || item.title || '';
                return `${version}${summary}`;
            }).filter(Boolean)
            : [changelogSummary];

        return `
            <section class="plugin-store-drawer__section">
                <div class="plugin-store-drawer__section-title">
                    <i data-lucide="file-text" style="width: 15px; height: 15px;"></i>
                    <span>Update notes</span>
                </div>
                <div class="plugin-store-drawer__stack">
                    ${notes.map(note => `<p class="plugin-store-drawer__notes">${this.escapeHtml(note)}</p>`).join('')}
                    ${plugin.minLtthVersion ? `<p class="plugin-store-drawer__notes">Requires LTTH v${this.escapeHtml(plugin.minLtthVersion)} or newer.</p>` : ''}
                </div>
            </section>
        `;
    }

    renderStoreHealthNotice(plugin) {
        const rollbackProtected = plugin.updateSafety?.rollbackProtected !== false;
        const support = plugin.support || {};
        const feedbackEnabled = support.feedbackEnabled !== false;

        return `
            <section class="plugin-store-drawer__section">
                <div class="plugin-store-drawer__section-title">
                    <i data-lucide="activity" style="width: 15px; height: 15px;"></i>
                    <span>Store health</span>
                </div>
                <p class="plugin-store-drawer__notes">${rollbackProtected ? 'Rollback protected: failed updates restore the previous local plugin copy.' : 'Rollback protected: unavailable for this package.'}</p>
                <p class="plugin-store-drawer__notes">${feedbackEnabled ? 'Review telemetry and feedback are stored locally for admin review.' : 'Feedback is disabled for this listing.'}</p>
            </section>
        `;
    }

    renderStoreFeedbackSection(plugin) {
        if (plugin.support?.feedbackEnabled === false) {
            return '';
        }

        return `
            <section class="plugin-store-drawer__section">
                <div class="plugin-store-drawer__section-title">
                    <i data-lucide="message-square" style="width: 15px; height: 15px;"></i>
                    <span>Review / Feedback</span>
                </div>
                <div class="plugin-store-feedback-form">
                    <select data-store-feedback-rating class="plugin-store-feedback-form__control">
                        <option value="5">5 - Works well</option>
                        <option value="4">4 - Good with small issues</option>
                        <option value="3">3 - Needs polish</option>
                        <option value="2">2 - Hard to use</option>
                        <option value="1">1 - Broken for me</option>
                    </select>
                    <textarea data-store-feedback-message class="plugin-store-feedback-form__control plugin-store-feedback-form__textarea" rows="3" placeholder="Short feedback for ${this.escapeHtml(plugin.name || plugin.id)}"></textarea>
                    <button type="button" data-store-feedback-submit class="btn btn-ghost plugin-store-feedback-form__submit">
                        <i data-lucide="send" style="width: 15px; height: 15px;"></i>
                        Send feedback
                    </button>
                </div>
            </section>
        `;
    }

    openStorePluginDetail(sourceId, pluginId) {
        const plugin = this.findStorePlugin(sourceId, pluginId);
        if (!plugin) return;

        this.selectedStorePlugin = plugin;
        this.renderStorePluginDetail(plugin);
        this.recordStoreTelemetry(plugin.id, 'detail_open', { sourceId: plugin.sourceId });
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
        const screenshots = Array.isArray(plugin.screenshots) ? plugin.screenshots : [];
        const primaryScreenshot = screenshots.length > 0 ? screenshots[0] : '';
        const extraScreenshots = screenshots.slice(1, 4);
        const brandMedia = this.getStorePluginBrandMedia(plugin);
        const versionSummary = this.getStorePluginVersionSummary(plugin);
        const trustSummary = this.getStorePluginTrustSummary(plugin);
        const compatibilitySummary = this.getStorePluginCompatibilitySummary(plugin);
        const accentStyle = this.getStorePluginAccentStyle(plugin);
        const changelogSummary = plugin.installed && plugin.updateAvailable
            ? `Update available from v${this.escapeHtml(plugin.installedVersion || 'unknown')} to v${this.escapeHtml(plugin.version || '0.0.0')}.`
            : `Latest store package: v${this.escapeHtml(plugin.version || '0.0.0')}.`;

        drawer.style.display = 'block';
        drawer.setAttribute('aria-hidden', 'false');
        drawer.innerHTML = `
            <div data-store-drawer-backdrop class="plugin-store-drawer__backdrop"></div>
            <aside role="dialog" aria-modal="true" aria-label="${this.escapeHtml(plugin.name || plugin.id)} details" class="plugin-store-drawer__panel">
                <div class="plugin-store-drawer__header">
                    <div class="plugin-store-drawer__hero">
                        <div class="plugin-store-drawer__media ${brandMedia && brandMedia.kind !== 'screenshot' ? 'is-brand' : ''}">
                            ${brandMedia
                                ? `<img src="${this.escapeHtml(brandMedia.src)}" alt="${this.escapeHtml(brandMedia.alt)}" loading="lazy" />`
                                : primaryScreenshot
                                    ? `<img src="${this.escapeHtml(primaryScreenshot)}" alt="" loading="lazy" />`
                                    : `<div class="plugin-store-drawer__avatar" style="${accentStyle}" role="img" aria-label="Plugin icon"><span class="plugin-store-drawer__avatar-icon" data-icon-src="/ltthicon.png" aria-hidden="true"></span></div>`}
                        </div>
                        <div class="plugin-store-drawer__title">
                            <h3>${this.escapeHtml(plugin.name || plugin.id)}</h3>
                            <div class="plugin-store-drawer__badges">${badges}</div>
                            <p>${this.escapeHtml(plugin.description || 'No description available')}</p>
                        </div>
                    </div>
                    <button type="button" data-store-drawer-close class="btn btn-ghost plugin-store-drawer__close">
                        <i data-lucide="x" style="width: 18px; height: 18px;"></i>
                    </button>
                </div>

                ${plugin.official ? '' : `
                    <div class="plugin-store-drawer__warning">
                        <i data-lucide="shield-alert" style="width: 16px; height: 16px;"></i>
                        <span>Non-official plugin entry. Only install if you trust the source.</span>
                    </div>
                `}

                <div class="plugin-store-drawer__meta-grid">
                    ${this.renderStoreDetailField('Version', versionSummary)}
                    ${this.renderStoreDetailField('Installed', plugin.installedVersion || (plugin.installed ? 'Yes' : 'No'))}
                    ${this.renderStoreDetailField('Category', category)}
                    ${this.renderStoreDetailField('Source', plugin.sourceName || plugin.sourceId || 'LTTH')}
                    ${this.renderStoreDetailField('Author', plugin.author || 'Unknown')}
                    ${this.renderStoreDetailField('Price', pricing.label)}
                    ${this.renderStoreDetailField('Trust', trustSummary)}
                    ${this.renderStoreDetailField('Compatibility', compatibilitySummary)}
                </div>

                ${this.renderStoreQualitySignals(plugin)}
                ${this.renderStoreRequirements(plugin)}
                ${this.renderStoreUpdateNotes(plugin, changelogSummary)}
                ${this.renderStoreHealthNotice(plugin)}

                <section class="plugin-store-drawer__section">
                    <div class="plugin-store-drawer__section-title">
                        <i data-lucide="images" style="width: 15px; height: 15px;"></i>
                        <span>Screenshots</span>
                    </div>
                    <div class="plugin-store-drawer__gallery">
                        ${primaryScreenshot
                            ? `<img src="${this.escapeHtml(primaryScreenshot)}" alt="" loading="lazy" class="plugin-store-drawer__gallery-main" />`
                            : '<div class="plugin-store-drawer__empty">No screenshots yet</div>'}
                        ${extraScreenshots.length > 0 ? `
                            <div class="plugin-store-drawer__thumbs">
                                ${extraScreenshots.map(src => `<img src="${this.escapeHtml(src)}" alt="" loading="lazy" class="plugin-store-drawer__thumb" />`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </section>

                ${this.renderStoreFeedbackSection(plugin)}

                <button type="button" data-store-drawer-action class="btn btn-primary plugin-store-drawer__action" ${action.disabled ? 'disabled' : ''}>
                    <i data-lucide="${action.icon}"></i>
                    ${action.label}
                </button>

                ${!plugin.packageUrl ? '<div class="plugin-store-drawer__hint">This store entry does not provide an install package yet.</div>' : ''}
                ${pricing.type === 'paid' ? '<div class="plugin-store-drawer__hint">Paid plugin checkout is reserved for a later store release.</div>' : ''}
                ${plugin.access?.type === 'closed-beta' && !this.hasClosedBetaPluginAccess(plugin) ? '<div class="plugin-store-drawer__hint">Invite required. This plugin is in closed beta and must be enabled for your account first.</div>' : ''}
                ${!this.hasStoreLicense() && (!plugin.installed || plugin.updateAvailable) ? '<div class="plugin-store-drawer__hint">Beta license required. Claim the free LTTH beta license to install or update this plugin.</div>' : ''}
            </aside>
        `;

        drawer.querySelector('[data-store-drawer-backdrop]')?.addEventListener('click', () => this.closeStorePluginDetail());
        drawer.querySelector('[data-store-drawer-close]')?.addEventListener('click', () => this.closeStorePluginDetail());
        drawer.querySelector('[data-store-drawer-action]')?.addEventListener('click', () => this.handleStorePluginAction(plugin));
        drawer.querySelector('[data-store-feedback-submit]')?.addEventListener('click', () => this.submitStoreFeedback(plugin));

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    renderStoreDetailField(label, value) {
        return `
            <div class="plugin-store-detail-field">
                <div class="plugin-store-detail-field__label">${this.escapeHtml(label)}</div>
                <div class="plugin-store-detail-field__value">${this.escapeHtml(value)}</div>
            </div>
        `;
    }

    getPluginBrandMedia(plugin) {
        const logo = typeof plugin.logo === 'string' ? plugin.logo.trim() : '';
        const icon = typeof plugin.icon === 'string' ? plugin.icon.trim() : '';

        if (logo) {
            return {
                src: logo,
                alt: `${plugin.name || plugin.id} logo`,
                kind: 'logo'
            };
        }

        if (icon) {
            return {
                src: icon,
                alt: `${plugin.name || plugin.id} icon`,
                kind: 'icon'
            };
        }

        return null;
    }

    renderInstalledHeader() {
        return `
            <div style="display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; margin-bottom: 1rem; padding: 1rem 1.05rem; background: var(--store-panel-bg, var(--color-bg-card)); border: 1px solid var(--store-panel-border, var(--color-border)); border-radius: 18px; box-shadow: var(--store-panel-shadow, var(--shadow-sm));">
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
        const brandMedia = this.getPluginBrandMedia(plugin);
        const statusBadge = plugin.enabled
            ? '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: linear-gradient(135deg, color-mix(in srgb, var(--color-accent-success) 88%, transparent) 0%, color-mix(in srgb, var(--color-accent-success) 68%, var(--color-bg-secondary)) 100%); border: 1px solid color-mix(in srgb, var(--color-accent-success) 34%, transparent); border-radius: 12px; font-size: 0.7rem; font-weight: 600; color: var(--color-text-primary);"><i data-lucide="check-circle" style="width: 12px; height: 12px;"></i> Active</span>'
            : '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: color-mix(in srgb, var(--color-bg-secondary) 82%, var(--color-border) 18%); border: 1px solid var(--color-border); border-radius: 12px; font-size: 0.7rem; font-weight: 600; color: var(--color-text-muted);"><i data-lucide="pause-circle" style="width: 12px; height: 12px;"></i> Inactive</span>';

        const devStatusBadge = this.getDevStatusBadge(plugin.devStatus);
        
        // Get row background color based on devStatus
        const rowBackground = this.getDevStatusRowBackground(plugin.devStatus);

        const actionButtons = plugin.enabled
            ? `
                <button id="reload-${plugin.id}" class="plugin-compact-btn" style="background: linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 18%, transparent) 0%, color-mix(in srgb, var(--brand-primary) 12%, var(--color-bg-secondary)) 100%); border: 1px solid color-mix(in srgb, var(--brand-primary) 34%, var(--color-border)); color: var(--brand-primary);">
                    <i data-lucide="refresh-cw" style="width: 12px; height: 12px;"></i>
                    Reload
                </button>
                <button id="disable-${plugin.id}" class="plugin-compact-btn" style="background: color-mix(in srgb, var(--color-accent-warning) 16%, transparent); border: 1px solid color-mix(in srgb, var(--color-accent-warning) 28%, transparent); color: var(--color-accent-warning);">
                    <i data-lucide="pause" style="width: 12px; height: 12px;"></i>
                    Disable
                </button>
            `
            : `
                <button id="enable-${plugin.id}" class="plugin-compact-btn" style="background: linear-gradient(135deg, color-mix(in srgb, var(--color-accent-success) 88%, transparent) 0%, color-mix(in srgb, var(--color-accent-success) 68%, var(--color-bg-secondary)) 100%); border: 1px solid color-mix(in srgb, var(--color-accent-success) 34%, transparent); color: var(--color-text-primary);">
                    <i data-lucide="play" style="width: 12px; height: 12px;"></i>
                    Enable
                </button>
            `;

        return `
            <tr style="background: ${rowBackground};">
                <td>
                    <div style="display: flex; align-items: center; gap: 0.85rem; min-width: 0;">
                        <div style="width: 46px; height: 46px; flex-shrink: 0; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--color-border) 66%, transparent); background: linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 16%, transparent) 0%, color-mix(in srgb, var(--color-accent-secondary) 12%, transparent) 100%); display: flex; align-items: center; justify-content: center; overflow: hidden;">
                            ${brandMedia
                                ? `<img src="${this.escapeHtml(brandMedia.src)}" alt="${this.escapeHtml(brandMedia.alt)}" loading="lazy" style="width: 100%; height: 100%; object-fit: contain; padding: 8px;" />`
                                : '<i data-lucide="package" style="width: 22px; height: 22px; color: var(--brand-primary);"></i>'}
                        </div>
                        <div style="min-width: 0;">
                            <div style="font-weight: 700; color: var(--color-text-primary); margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(plugin.name)}</div>
                            <div style="font-size: 0.75rem; color: var(--color-text-muted); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(plugin.id)}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="padding: 2px 8px; background: color-mix(in srgb, var(--color-bg-primary) 72%, transparent); border: 1px solid var(--color-border); border-radius: 4px; font-size: 0.7rem; color: var(--color-text-muted); font-family: monospace;">v${this.escapeHtml(plugin.version)}</span>
                </td>
                <td>${statusBadge}</td>
                <td>${devStatusBadge || '<span style="color: var(--color-text-muted); font-size: 0.75rem;">-</span>'}</td>
                <td>
                    ${plugin.type ? `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: color-mix(in srgb, var(--color-accent-primary) 16%, transparent); border: 1px solid color-mix(in srgb, var(--color-accent-primary) 32%, transparent); border-radius: 999px; font-size: 0.75rem; color: var(--color-accent-primary);">${this.getTypeIcon(plugin.type)} ${this.escapeHtml(plugin.type)}</span>` : '<span style="color: var(--color-text-muted);">-</span>'}
                </td>
                <td>
                    <span style="font-size: 0.75rem; color: var(--color-text-muted);">${this.escapeHtml(plugin.author || 'Unknown')}</span>
                </td>
                <td>
                    <div class="plugin-compact-actions">
                        ${actionButtons}
                        <button id="delete-${plugin.id}" class="plugin-compact-btn" style="background: color-mix(in srgb, var(--color-accent-danger) 16%, transparent); border: 1px solid color-mix(in srgb, var(--color-accent-danger) 28%, transparent); color: var(--color-accent-danger);">
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
        const brandMedia = this.getPluginBrandMedia(plugin);
        const statusBadge = plugin.enabled
            ? '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; background: linear-gradient(135deg, color-mix(in srgb, var(--color-accent-success) 88%, transparent) 0%, color-mix(in srgb, var(--color-accent-success) 68%, var(--color-bg-secondary)) 100%); border: 1px solid color-mix(in srgb, var(--color-accent-success) 34%, transparent); border-radius: 20px; font-size: 0.75rem; font-weight: 600; color: var(--color-text-primary);"><i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> Aktiv</span>'
            : '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; background: color-mix(in srgb, var(--color-bg-secondary) 82%, var(--color-border) 18%); border: 1px solid var(--color-border); border-radius: 20px; font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted);"><i data-lucide="pause-circle" style="width: 14px; height: 14px;"></i> Inaktiv</span>';

        const devStatusBadge = this.getDevStatusBadge(plugin.devStatus);

        // Get background color based on devStatus
        const devStatusBackground = this.getDevStatusBackground(plugin.devStatus);

        const typeIcon = this.getTypeIcon(plugin.type);
        const typeBadge = plugin.type 
            ? `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: color-mix(in srgb, var(--color-accent-primary) 16%, transparent); border: 1px solid color-mix(in srgb, var(--color-accent-primary) 32%, transparent); border-radius: 999px; font-size: 0.7rem; color: var(--color-accent-primary);">${typeIcon} ${this.escapeHtml(plugin.type)}</span>` 
            : '';

        const actionButtons = plugin.enabled
            ? `
                <button id="reload-${plugin.id}" class="plugin-action-btn" style="background: linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 18%, transparent) 0%, color-mix(in srgb, var(--brand-primary) 12%, var(--color-bg-secondary)) 100%); border: 1px solid color-mix(in srgb, var(--brand-primary) 34%, var(--color-border)); color: var(--brand-primary);">
                    <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
                    <span>Reload</span>
                </button>
                <button id="disable-${plugin.id}" class="plugin-action-btn" style="background: color-mix(in srgb, var(--color-accent-warning) 16%, transparent); border: 1px solid color-mix(in srgb, var(--color-accent-warning) 28%, transparent); color: var(--color-accent-warning);">
                    <i data-lucide="pause" style="width: 16px; height: 16px;"></i>
                    <span>${window.i18n ? window.i18n.t('plugins.disable') : 'Disable'}</span>
                </button>
            `
            : `
                <button id="enable-${plugin.id}" class="plugin-action-btn" style="background: linear-gradient(135deg, color-mix(in srgb, var(--color-accent-success) 88%, transparent) 0%, color-mix(in srgb, var(--color-accent-success) 68%, var(--color-bg-secondary)) 100%); border: 1px solid color-mix(in srgb, var(--color-accent-success) 34%, transparent); color: var(--color-text-primary);">
                    <i data-lucide="play" style="width: 16px; height: 16px;"></i>
                    <span>${window.i18n ? window.i18n.t('plugins.enable') : 'Enable'}</span>
                </button>
            `;

        const loadedTime = plugin.loadedAt 
            ? `<div style="display: flex; align-items: center; gap: 6px; font-size: 0.7rem; color: var(--color-text-muted); margin-top: 8px;">
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
            <div class="plugin-card" style="background: ${devStatusBackground}; border: 1px solid var(--store-panel-border, var(--color-border)); border-radius: 18px; padding: 1.5rem; transition: all 0.3s ease; position: relative; overflow: hidden; box-shadow: var(--store-panel-shadow, var(--shadow-sm)); color: var(--color-text-primary);">
                <span class="plugin-status-dot ${plugin.enabled ? 'status-active' : 'status-inactive'}"></span>
                <!-- Subtle gradient overlay -->
                <div style="position: absolute; top: 0; right: 0; width: 200px; height: 200px; background: radial-gradient(circle at top right, color-mix(in srgb, var(--brand-primary) 12%, transparent) 0%, transparent 70%); pointer-events: none;"></div>
                
                <div style="position: relative; display: flex; gap: 1.5rem;">
                    <!-- Plugin Icon -->
                    <div style="flex-shrink: 0;">
                        <div style="width: 72px; height: 72px; background: linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 18%, transparent) 0%, color-mix(in srgb, var(--color-accent-secondary) 14%, transparent) 100%); border: 1px solid color-mix(in srgb, var(--brand-primary) 34%, var(--color-border)); border-radius: 20px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                            ${brandMedia
                                ? `<img src="${this.escapeHtml(brandMedia.src)}" alt="${this.escapeHtml(brandMedia.alt)}" loading="lazy" style="width: 100%; height: 100%; object-fit: contain; padding: ${brandMedia.kind === 'logo' ? '10px' : '12px'};" />`
                                : '<i data-lucide="package" style="width: 32px; height: 32px; color: var(--brand-primary);"></i>'}
                        </div>
                    </div>

                    <!-- Plugin Info -->
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: start; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;">
                                    <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); margin: 0;">${this.escapeHtml(plugin.name)}</h3>
                                    ${statusBadge}
                                    <span style="padding: 4px 10px; background: color-mix(in srgb, var(--color-bg-primary) 72%, transparent); border: 1px solid var(--color-border); border-radius: 999px; font-size: 0.75rem; color: var(--color-text-muted); font-family: monospace;">v${this.escapeHtml(plugin.version)}</span>
                                    ${devStatusBadge}
                                </div>
                                <p style="font-size: 0.9rem; color: var(--color-text-secondary); margin: 0 0 12px 0; line-height: 1.5;">${this.escapeHtml(plugin.description || (window.i18n ? window.i18n.t('plugins.no_description') : 'No description available'))}</p>
                                
                                <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.8rem; color: var(--color-text-muted);">
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
                                <button id="delete-${plugin.id}" class="plugin-action-btn" style="background: color-mix(in srgb, var(--color-accent-danger) 16%, transparent); border: 1px solid color-mix(in srgb, var(--color-accent-danger) 28%, transparent); color: var(--color-accent-danger);">
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
        const baseGradient = 'linear-gradient(180deg, color-mix(in srgb, var(--color-bg-card) 92%, var(--brand-primary) 8%) 0%, color-mix(in srgb, var(--color-bg-card) 98%, var(--color-bg-primary) 2%) 100%)';
        
        const tints = {
            'working-beta': 'rgba(34, 197, 94, 0.06)',
            'development-beta': 'rgba(251, 191, 36, 0.06)',
            'early-version': 'rgba(239, 68, 68, 0.06)'
        };

        const tint = tints[devStatus];
        return tint ? `${baseGradient}, linear-gradient(180deg, ${tint}, ${tint})` : baseGradient;
    }

    /**
     * Get row background color based on development status (for compact view)
     */
    getDevStatusRowBackground(devStatus) {
        const backgrounds = {
            'working-beta': 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
            'development-beta': 'color-mix(in srgb, var(--color-accent-warning) 8%, transparent)',
            'early-version': 'color-mix(in srgb, var(--color-accent-danger) 8%, transparent)'
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

    async installStorePlugin(sourceId, pluginId, options = {}) {
        const silent = options.silent === true;
        const reloadAfterInstall = options.reloadAfterInstall !== false;

        try {
            const plugin = this.storePlugins.find(item => item.sourceId === sourceId && item.id === pluginId);
            const hasStoreAuth = await this.requireStoreAuth(!silent);
            if (!hasStoreAuth) {
                return false;
            }

            if (!this.hasStoreLicense()) {
                if (!silent) {
                    this.showError('Beta license required. Claim the free LTTH beta license before installing plugins.');
                    this.renderStoreShell();
                }
                return false;
            }

            if (plugin?.access?.type === 'closed-beta' && !this.hasClosedBetaPluginAccess(plugin)) {
                if (!silent) {
                    this.showError('Invite required. This closed beta plugin must be enabled for your account first.');
                    this.renderStoreShell();
                }
                return false;
            }

            if (!silent) {
                this.showInfo(plugin && plugin.updateAvailable ? `Updating ${plugin.name || pluginId}...` : 'Installing plugin...');
            }
            const response = await fetch(`/api/plugin-store/${encodeURIComponent(sourceId)}/${encodeURIComponent(pluginId)}/install`, {
                method: 'POST',
                headers: await this.getStoreAuthHeaders()
            });
            const data = await response.json();

            if (data.success) {
                await this.recordStoreTelemetry(pluginId, 'install_success', {
                    sourceId,
                    version: data.plugin?.version || plugin?.version || null,
                    rollbackProtected: data.rollbackProtected === true
                });
                if (!silent) {
                    this.showSuccess(`Plugin "${data.plugin.name}" installed`);
                }
                if (reloadAfterInstall) {
                    await this.loadPlugins();
                    await this.loadStorePlugins(false);
                    this.applyFiltersAndSort();
                }
                if (reloadAfterInstall && typeof checkPluginsAndUpdateUI === 'function') {
                    await checkPluginsAndUpdateUI();
                }
                return true;
            } else {
                await this.recordStoreTelemetry(pluginId, data.rollbackApplied ? 'rollback_applied' : 'install_failure', {
                    sourceId,
                    code: data.code || null,
                    rollbackApplied: data.rollbackApplied === true
                });
                if (!silent) {
                    if (data.code === 'BETA_LICENSE_REQUIRED') {
                        this.showError('Beta license required. Claim the free LTTH beta license before installing plugins.');
                    } else if (data.code === 'CLOSED_BETA_INVITE_REQUIRED') {
                        this.showError('Invite required. This closed beta plugin must be enabled for your account first.');
                    } else if (data.code === 'ADMIN_ACCESS_REQUIRED') {
                        this.showError('Admin access required for this store plugin.');
                    } else {
                        this.showError('Install failed: ' + data.error);
                    }
                }
                return false;
            }
        } catch (error) {
            console.error('Error installing plugin:', error);
            await this.recordStoreTelemetry(pluginId, error.rollbackApplied ? 'rollback_applied' : 'install_failure', {
                sourceId,
                error: error.message,
                rollbackApplied: error.rollbackApplied === true
            });
            if (!silent) {
                this.showError('Install failed: ' + error.message);
            }
            return false;
        }
    }

    async updateAllStorePlugins() {
        if (!this.hasStoreLicense()) {
            this.showInfo('Claim the free LTTH beta license before updating store plugins.');
            this.renderStoreShell();
            return;
        }

        const updatePlugins = this.storePlugins.filter(plugin => plugin.installed && plugin.updateAvailable && plugin.packageUrl);
        const officialUpdates = updatePlugins.filter(plugin => plugin.official);

        if (officialUpdates.length === 0) {
            this.showInfo('No official updates available.');
            return;
        }

        const confirmMsg = `Update ${officialUpdates.length} official plugin${officialUpdates.length === 1 ? '' : 's'} now?`;

        if (!confirm(confirmMsg)) {
            return;
        }

        let updatedCount = 0;
        for (const plugin of officialUpdates) {
            const success = await this.installStorePlugin(plugin.sourceId, plugin.id, {
                silent: true,
                reloadAfterInstall: false
            });
            if (success) {
                updatedCount += 1;
            }
        }

        await this.loadPlugins();
        await this.loadStorePlugins(false);
        this.applyFiltersAndSort();
        if (typeof checkPluginsAndUpdateUI === 'function') {
            await checkPluginsAndUpdateUI();
        }

        if (updatedCount > 0) {
            this.showSuccess(`${updatedCount} plugin${updatedCount === 1 ? '' : 's'} updated`);
        } else {
            this.showError('No updates could be applied.');
        }
    }

    async submitStoreFeedback(plugin) {
        const drawer = document.getElementById('plugin-store-detail-drawer');
        const rating = parseInt(drawer?.querySelector('[data-store-feedback-rating]')?.value || '5', 10);
        const message = drawer?.querySelector('[data-store-feedback-message]')?.value || '';

        try {
            const hasStoreAuth = await this.requireStoreAuth(true);
            if (!hasStoreAuth) {
                return false;
            }

            const response = await fetch('/api/plugin-store/feedback', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(await this.getStoreAuthHeaders())
                },
                body: JSON.stringify({
                    pluginId: plugin.id,
                    sourceId: plugin.sourceId,
                    rating,
                    message,
                    kind: 'review'
                })
            });
            const data = await response.json();

            if (!data.success) {
                this.showError(data.error || 'Feedback could not be saved.');
                return false;
            }

            await this.recordStoreTelemetry(plugin.id, 'feedback_submitted', { sourceId: plugin.sourceId, rating });
            this.showSuccess('Feedback saved.');
            const textarea = drawer?.querySelector('[data-store-feedback-message]');
            if (textarea) textarea.value = '';
            return true;
        } catch (error) {
            console.error('Error submitting App Store feedback:', error);
            this.showError('Feedback could not be saved: ' + error.message);
            return false;
        }
    }

    async recordStoreTelemetry(pluginId, event, metadata = {}) {
        try {
            await fetch('/api/plugin-store/telemetry', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(await this.getStoreAuthHeaders())
                },
                body: JSON.stringify({
                    pluginId,
                    event,
                    metadata
                })
            });
        } catch (error) {
            console.warn('App Store telemetry could not be recorded:', error);
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
