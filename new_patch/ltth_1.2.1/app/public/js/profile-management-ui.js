/**
 * Profile Management UI
 * 
 * Provides:
 * - Profile integrity verification tool
 * - Migration wizard for old data
 * - Orphaned data detection
 * - Interactive tooltips and documentation
 */

(() => {
    'use strict';

    // Initialize on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', async () => {
        await initializeProfileManagementUI();
    });

    /**
     * Initialize the profile management UI
     */
    async function initializeProfileManagementUI() {
        console.log('🔧 Initializing Profile Management UI...');

        // Setup profile integrity checker
        setupProfileIntegrityChecker();

        // Setup migration wizard
        setupMigrationWizard();

        // Setup documentation links
        setupDocumentationLinks();

        // Setup tooltips
        setupProfileTooltips();

        console.log('✅ Profile Management UI initialized');
    }

    /**
     * Setup profile integrity checker
     */
    function setupProfileIntegrityChecker() {
        const checkButton = document.getElementById('check-profile-integrity-btn');
        if (!checkButton) return;

        checkButton.addEventListener('click', async () => {
            await runProfileIntegrityCheck();
        });
    }

    /**
     * Run profile integrity check
     */
    async function runProfileIntegrityCheck() {
        const resultsContainer = document.getElementById('profile-integrity-results');
        if (!resultsContainer) return;

        // Show loading state
        resultsContainer.innerHTML = `
            <div class="integrity-check-loading">
                <i data-lucide="loader" class="spinning"></i>
                <p>Checking profile integrity...</p>
            </div>
        `;
        
        // Re-create icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        try {
            const response = await fetch('/api/profiles/integrity');
            const data = await response.json();

            if (data.success) {
                displayIntegrityResults(data);
            } else {
                showIntegrityError(data.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error checking profile integrity:', error);
            showIntegrityError(error.message);
        }
    }

    /**
     * Display integrity check results
     */
    function displayIntegrityResults(data) {
        const resultsContainer = document.getElementById('profile-integrity-results');
        if (!resultsContainer) return;

        const { activeProfile, profiles } = data;

        let html = '<div class="integrity-results">';

        profiles.forEach(profile => {
            const statusClass = profile.status === 'healthy' ? 'success' : 
                              profile.status === 'warning' ? 'warning' : 'error';
            
            const statusIcon = profile.status === 'healthy' ? 'check-circle' :
                              profile.status === 'warning' ? 'alert-triangle' : 'x-circle';

            html += `
                <div class="integrity-result-card ${statusClass}">
                    <div class="integrity-result-header">
                        <div class="integrity-result-title">
                            <i data-lucide="${statusIcon}"></i>
                            <span class="profile-name">${escapeHtml(profile.username)}</span>
                            ${profile.isActive ? '<span class="active-badge">Active</span>' : ''}
                        </div>
                        <span class="integrity-status-badge ${statusClass}">
                            ${profile.status}
                        </span>
                    </div>
                    <div class="integrity-result-details">
                        <div class="detail-row">
                            <span class="detail-label">Database Path:</span>
                            <span class="detail-value">${escapeHtml(profile.dbPath)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">File Size:</span>
                            <span class="detail-value">${formatBytes(profile.size)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">WAL File:</span>
                            <span class="detail-value ${profile.walExists ? 'text-success' : 'text-muted'}">
                                ${profile.walExists ? '✓ Exists' : '✗ Not found'}
                            </span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">SHM File:</span>
                            <span class="detail-value ${profile.shmExists ? 'text-success' : 'text-muted'}">
                                ${profile.shmExists ? '✓ Exists' : '✗ Not found'}
                            </span>
                        </div>
                        ${profile.issues.length > 0 ? `
                            <div class="integrity-issues">
                                <strong>Issues:</strong>
                                <ul>
                                    ${profile.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        html += '</div>';

        resultsContainer.innerHTML = html;

        // Re-create icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Show integrity check error
     */
    function showIntegrityError(message) {
        const resultsContainer = document.getElementById('profile-integrity-results');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = `
            <div class="integrity-check-error">
                <i data-lucide="x-circle"></i>
                <p>Error checking profile integrity:</p>
                <p class="error-message">${escapeHtml(message)}</p>
            </div>
        `;

        // Re-create icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Setup migration wizard
     */
    function setupMigrationWizard() {
        const checkButton = document.getElementById('check-migration-status-btn');
        if (!checkButton) return;

        checkButton.addEventListener('click', async () => {
            await checkMigrationStatus();
        });

        const startButton = document.getElementById('start-migration-wizard-btn');
        if (startButton) {
            startButton.addEventListener('click', () => {
                showMigrationWizard();
            });
        }
    }

    /**
     * Check migration status
     */
    async function checkMigrationStatus() {
        const resultsContainer = document.getElementById('migration-status-results');
        if (!resultsContainer) return;

        // Show loading state
        resultsContainer.innerHTML = `
            <div class="migration-check-loading">
                <i data-lucide="loader" class="spinning"></i>
                <p>Checking for old data...</p>
            </div>
        `;

        // Re-create icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        try {
            const response = await fetch('/api/profiles/migration-status');
            const data = await response.json();

            if (data.success) {
                displayMigrationStatus(data);
            } else {
                showMigrationError(data.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error checking migration status:', error);
            showMigrationError(error.message);
        }
    }

    /**
     * Display migration status
     */
    function displayMigrationStatus(data) {
        const resultsContainer = document.getElementById('migration-status-results');
        if (!resultsContainer) return;

        let html = '<div class="migration-status-results">';

        // Current storage location
        html += `
            <div class="migration-info-card success">
                <h4><i data-lucide="check-circle"></i> Current Storage Location</h4>
                <p><strong>Config Directory:</strong><br>${escapeHtml(data.configLocation)}</p>
                <p><strong>User Profiles:</strong><br>${escapeHtml(data.userConfigsLocation)}</p>
            </div>
        `;

        // Check for old database
        if (data.oldDatabaseExists) {
            html += `
                <div class="migration-info-card warning">
                    <h4><i data-lucide="alert-triangle"></i> Old Database Found</h4>
                    <p>Old database file detected at:</p>
                    <p class="code-block">${escapeHtml(data.oldDatabasePath)}</p>
                    <p>This file should be migrated to a user profile.</p>
                    <button class="btn btn-warning" onclick="window.profileManagementUI.startMigration()">
                        <i data-lucide="move"></i>
                        Start Migration Wizard
                    </button>
                </div>
            `;
        } else {
            html += `
                <div class="migration-info-card success">
                    <h4><i data-lucide="check-circle"></i> No Old Database</h4>
                    <p>No old database file found. Your data is already in the correct location.</p>
                </div>
            `;
        }

        // Check for orphaned data
        if (data.orphanedData && data.orphanedData.length > 0) {
            html += `
                <div class="migration-info-card warning">
                    <h4><i data-lucide="alert-triangle"></i> Orphaned Data Detected</h4>
                    <p>Found old plugin data in application directory:</p>
                    <ul class="orphaned-data-list">
                        ${data.orphanedData.map(item => `
                            <li>
                                <strong>${escapeHtml(item.plugin)}</strong>
                                <br>Path: ${escapeHtml(item.path)}
                                <br>Files: ${item.files}
                            </li>
                        `).join('')}
                    </ul>
                    <p class="text-sm">This data may be lost during updates. Consider moving it to persistent storage.</p>
                </div>
            `;
        }

        html += '</div>';

        resultsContainer.innerHTML = html;

        // Re-create icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Show migration error
     */
    function showMigrationError(message) {
        const resultsContainer = document.getElementById('migration-status-results');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = `
            <div class="migration-check-error">
                <i data-lucide="x-circle"></i>
                <p>Error checking migration status:</p>
                <p class="error-message">${escapeHtml(message)}</p>
            </div>
        `;

        // Re-create icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Show migration wizard
     */
    function showMigrationWizard() {
        // This would open a modal with step-by-step migration instructions
        alert('Migration wizard coming soon! For now, the system automatically migrates old data on startup.');
    }

    /**
     * Setup documentation links
     */
    function setupDocumentationLinks() {
        // Add click handlers for documentation links
        const docLinks = document.querySelectorAll('[data-doc-link]');
        docLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const docType = link.getAttribute('data-doc-link');
                openDocumentation(docType);
            });
        });
    }

    /**
     * Open documentation
     */
    function openDocumentation(docType) {
        // Map documentation types to their respective locations
        const docMap = {
            'profile-system': '/docs/STREAMER_PROFILE_SYSTEM_DE.md',
            'profile-analysis': '/VIEWER_XP_PROFILE_SYSTEM_ANALYSIS.md',
            'visual-guide': '/PROFILE_SYSTEM_UX_VISUAL_GUIDE.md'
        };

        const docPath = docMap[docType];
        if (docPath) {
            // Open in wiki view or new window
            window.open(docPath, '_blank');
        }
    }

    /**
     * Setup profile tooltips
     */
    function setupProfileTooltips() {
        // Initialize tooltips for profile help icons
        const helpIcons = document.querySelectorAll('.profile-help-icon');
        
        helpIcons.forEach(icon => {
            const tooltipText = icon.getAttribute('data-tooltip');
            if (tooltipText) {
                icon.title = tooltipText;
            }
        });
    }

    /**
     * Helper: Escape HTML
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Helper: Format bytes
     */
    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    // Expose public API
    window.profileManagementUI = {
        runProfileIntegrityCheck,
        checkMigrationStatus,
        startMigration: showMigrationWizard
    };

})();
