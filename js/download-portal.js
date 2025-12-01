/**
 * PupCid's Little TikTok Helper - Download Portal
 * In-browser download and extraction system
 */

(function() {
    'use strict';

    // ===================================
    // Configuration
    // ===================================
    const CONFIG = {
        downloadsPath: '/downloads/',
        versionPattern: /^LTTH-(\d+\.\d+\.\d+)-win-x64$/,
        maxRetries: 3,
        retryDelay: 1000
    };

    // ===================================
    // State Management
    // ===================================
    const state = {
        currentPhase: 'idle', // idle, loading, downloading, extracting, complete, error
        versions: [],
        latestVersion: null,
        downloadProgress: 0,
        extractProgress: 0,
        extractedFiles: [],
        error: null
    };

    // ===================================
    // Version Comparison
    // ===================================
    function compareVersions(a, b) {
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);
        
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const numA = partsA[i] || 0;
            const numB = partsB[i] || 0;
            if (numA !== numB) {
                return numA - numB;
            }
        }
        return 0;
    }

    function getVersionFromFolder(folderName) {
        const match = folderName.match(CONFIG.versionPattern);
        return match ? match[1] : null;
    }

    // ===================================
    // UI Updates
    // ===================================
    function updateUI() {
        const splashScreen = document.getElementById('splashScreen');
        const downloadPhase = document.getElementById('downloadPhase');
        const extractPhase = document.getElementById('extractPhase');
        const completePhase = document.getElementById('completePhase');
        const errorPhase = document.getElementById('errorPhase');
        const downloadProgress = document.getElementById('downloadProgress');
        const downloadProgressText = document.getElementById('downloadProgressText');
        const extractProgress = document.getElementById('extractProgress');
        const extractProgressText = document.getElementById('extractProgressText');
        const versionDisplay = document.getElementById('versionDisplay');
        const errorMessage = document.getElementById('errorMessage');

        // Hide all phases
        [splashScreen, downloadPhase, extractPhase, completePhase, errorPhase].forEach(el => {
            if (el) el.classList.add('hidden');
        });

        // Show current phase
        switch (state.currentPhase) {
            case 'idle':
            case 'loading':
                if (splashScreen) splashScreen.classList.remove('hidden');
                break;
            case 'downloading':
                if (downloadPhase) downloadPhase.classList.remove('hidden');
                if (downloadProgress) downloadProgress.style.width = state.downloadProgress + '%';
                if (downloadProgressText) downloadProgressText.textContent = Math.round(state.downloadProgress) + '%';
                break;
            case 'extracting':
                if (extractPhase) extractPhase.classList.remove('hidden');
                if (extractProgress) extractProgress.style.width = state.extractProgress + '%';
                if (extractProgressText) extractProgressText.textContent = Math.round(state.extractProgress) + '%';
                break;
            case 'complete':
                if (completePhase) completePhase.classList.remove('hidden');
                break;
            case 'error':
                if (errorPhase) errorPhase.classList.remove('hidden');
                if (errorMessage) errorMessage.textContent = state.error;
                break;
        }

        // Update version display
        if (versionDisplay && state.latestVersion) {
            versionDisplay.textContent = 'v' + state.latestVersion;
        }
    }

    // ===================================
    // Fetch Available Versions
    // ===================================
    async function fetchAvailableVersions() {
        try {
            // Fetch index.json from downloads folder
            const response = await fetch(CONFIG.downloadsPath + 'index.json');
            if (!response.ok) {
                throw new Error('Could not fetch version list');
            }
            const data = await response.json();
            
            // Parse versions
            state.versions = data.versions || [];
            
            // Find latest version
            if (state.versions.length > 0) {
                const sortedVersions = [...state.versions].sort((a, b) => {
                    const versionA = getVersionFromFolder(a.folder);
                    const versionB = getVersionFromFolder(b.folder);
                    return compareVersions(versionB, versionA);
                });
                state.latestVersion = getVersionFromFolder(sortedVersions[0].folder);
            }
            
            return true;
        } catch (error) {
            console.error('Error fetching versions:', error);
            state.error = getLocalizedText('errorFetchVersions');
            state.currentPhase = 'error';
            updateUI();
            return false;
        }
    }

    // ===================================
    // Download File
    // ===================================
    async function downloadFile(url) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';

            xhr.onprogress = (event) => {
                if (event.lengthComputable) {
                    state.downloadProgress = (event.loaded / event.total) * 100;
                    updateUI();
                }
            };

            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve(xhr.response);
                } else {
                    reject(new Error('Download failed with status: ' + xhr.status));
                }
            };

            xhr.onerror = () => {
                reject(new Error('Network error during download'));
            };

            xhr.send();
        });
    }

    // ===================================
    // Extract 7z Archive (using 7z-wasm)
    // ===================================
    async function extract7z(data) {
        try {
            // Check if 7z-wasm is available
            if (typeof SevenZip === 'undefined') {
                throw new Error('7z-wasm library not loaded');
            }

            const sevenZip = await SevenZip({
                onProgress: (progress) => {
                    state.extractProgress = progress;
                    updateUI();
                }
            });

            const archive = new Uint8Array(data);
            const extractedFiles = [];

            // Extract the archive
            const files = await sevenZip.extractArchive(archive);
            
            for (const file of files) {
                extractedFiles.push({
                    name: file.name,
                    data: file.data,
                    size: file.data.length
                });
            }

            state.extractedFiles = extractedFiles;
            return extractedFiles;
        } catch (error) {
            // Fallback: Use alternative extraction method
            return await extractWithFallback(data);
        }
    }

    // ===================================
    // Fallback Extraction (for browsers without 7z-wasm)
    // ===================================
    async function extractWithFallback(data) {
        // For 7z files, we need a proper library
        // This fallback triggers a direct download
        state.extractProgress = 100;
        updateUI();
        
        // Create blob and trigger download
        const blob = new Blob([data], { type: 'application/x-7z-compressed' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'LTTH-' + state.latestVersion + '-win-x64.7z';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        return [{
            name: 'LTTH-' + state.latestVersion + '-win-x64.7z',
            downloaded: true
        }];
    }

    // ===================================
    // Save Extracted File
    // ===================================
    function saveExtractedFile(file) {
        const blob = new Blob([file.data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ===================================
    // Main Download Process
    // ===================================
    async function startDownload() {
        try {
            // Phase 1: Loading
            state.currentPhase = 'loading';
            updateUI();

            // Fetch available versions
            const versionsLoaded = await fetchAvailableVersions();
            if (!versionsLoaded) return;

            if (state.versions.length === 0) {
                state.error = getLocalizedText('errorNoVersions');
                state.currentPhase = 'error';
                updateUI();
                return;
            }

            // Get latest version info
            const sortedVersions = [...state.versions].sort((a, b) => {
                const versionA = getVersionFromFolder(a.folder);
                const versionB = getVersionFromFolder(b.folder);
                return compareVersions(versionB, versionA);
            });
            const latestVersionInfo = sortedVersions[0];
            const downloadUrl = CONFIG.downloadsPath + latestVersionInfo.folder + '/' + latestVersionInfo.file;

            // Phase 2: Downloading
            state.currentPhase = 'downloading';
            state.downloadProgress = 0;
            updateUI();

            const fileData = await downloadFile(downloadUrl);

            // Phase 3: Extracting
            state.currentPhase = 'extracting';
            state.extractProgress = 0;
            updateUI();

            const extractedFiles = await extract7z(fileData);

            // Phase 4: Complete
            state.currentPhase = 'complete';
            updateUI();

            // If we have extracted files with data, save the installer
            const installerFile = extractedFiles.find(f => f.name && f.name.endsWith('.exe'));
            if (installerFile && installerFile.data) {
                saveExtractedFile(installerFile);
            }

        } catch (error) {
            console.error('Download error:', error);
            state.error = error.message || getLocalizedText('errorDownload');
            state.currentPhase = 'error';
            updateUI();
        }
    }

    // ===================================
    // Retry Download
    // ===================================
    function retryDownload() {
        state.currentPhase = 'idle';
        state.error = null;
        state.downloadProgress = 0;
        state.extractProgress = 0;
        updateUI();
        startDownload();
    }

    // ===================================
    // Display Version List
    // ===================================
    async function displayVersionList() {
        const versionList = document.getElementById('versionList');
        if (!versionList) return;

        const versionsLoaded = await fetchAvailableVersions();
        if (!versionsLoaded || state.versions.length === 0) {
            versionList.innerHTML = '<p class="no-versions">' + getLocalizedText('noVersionsAvailable') + '</p>';
            return;
        }

        // Sort versions by version number (newest first)
        const sortedVersions = [...state.versions].sort((a, b) => {
            const versionA = getVersionFromFolder(a.folder);
            const versionB = getVersionFromFolder(b.folder);
            return compareVersions(versionB, versionA);
        });

        let html = '<div class="version-grid">';
        sortedVersions.forEach((version, index) => {
            const versionNumber = getVersionFromFolder(version.folder);
            const isLatest = index === 0;
            html += `
                <div class="version-item ${isLatest ? 'latest' : ''}">
                    <div class="version-info">
                        <span class="version-number">v${versionNumber}</span>
                        ${isLatest ? '<span class="version-badge-latest">' + getLocalizedText('latest') + '</span>' : ''}
                    </div>
                    <div class="version-details">
                        <span class="version-platform">Windows x64</span>
                        ${version.size ? '<span class="version-size">' + formatFileSize(version.size) + '</span>' : ''}
                    </div>
                    <button class="btn btn-primary version-download-btn" 
                            data-folder="${version.folder}" 
                            data-file="${version.file}">
                        ${getLocalizedText('download')}
                    </button>
                </div>
            `;
        });
        html += '</div>';

        versionList.innerHTML = html;

        // Add click handlers
        versionList.querySelectorAll('.version-download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const folder = e.target.dataset.folder;
                const file = e.target.dataset.file;
                downloadSpecificVersion(folder, file);
            });
        });
    }

    // ===================================
    // Download Specific Version
    // ===================================
    async function downloadSpecificVersion(folder, file) {
        try {
            state.latestVersion = getVersionFromFolder(folder);
            state.currentPhase = 'downloading';
            state.downloadProgress = 0;
            updateUI();

            // Show download modal
            const modal = document.getElementById('downloadModal');
            if (modal) modal.classList.add('active');

            const downloadUrl = CONFIG.downloadsPath + folder + '/' + file;
            const fileData = await downloadFile(downloadUrl);

            state.currentPhase = 'extracting';
            state.extractProgress = 0;
            updateUI();

            const extractedFiles = await extract7z(fileData);

            state.currentPhase = 'complete';
            updateUI();

            const installerFile = extractedFiles.find(f => f.name && f.name.endsWith('.exe'));
            if (installerFile && installerFile.data) {
                saveExtractedFile(installerFile);
            }

        } catch (error) {
            console.error('Download error:', error);
            state.error = error.message || getLocalizedText('errorDownload');
            state.currentPhase = 'error';
            updateUI();
        }
    }

    // ===================================
    // Utility Functions
    // ===================================
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function getLocalizedText(key) {
        const lang = document.documentElement.lang || 'de';
        const texts = {
            de: {
                errorFetchVersions: 'Versionen konnten nicht geladen werden',
                errorNoVersions: 'Keine Versionen verfügbar',
                errorDownload: 'Download fehlgeschlagen',
                noVersionsAvailable: 'Keine Versionen verfügbar',
                latest: 'Aktuell',
                download: 'Download'
            },
            en: {
                errorFetchVersions: 'Could not load versions',
                errorNoVersions: 'No versions available',
                errorDownload: 'Download failed',
                noVersionsAvailable: 'No versions available',
                latest: 'Latest',
                download: 'Download'
            }
        };
        return texts[lang]?.[key] || texts.en[key] || key;
    }

    // ===================================
    // Close Modal
    // ===================================
    function closeModal() {
        const modal = document.getElementById('downloadModal');
        if (modal) modal.classList.remove('active');
        state.currentPhase = 'idle';
        state.downloadProgress = 0;
        state.extractProgress = 0;
        updateUI();
    }

    // ===================================
    // Initialize
    // ===================================
    function init() {
        // Set up event listeners
        const downloadBtn = document.getElementById('startDownloadBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', startDownload);
        }

        const retryBtn = document.getElementById('retryDownloadBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', retryDownload);
        }

        const closeModalBtn = document.getElementById('closeModalBtn');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', closeModal);
        }

        // Display version list if element exists
        displayVersionList();

        // Update UI
        updateUI();
    }

    // ===================================
    // Wait for DOM to be ready
    // ===================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ===================================
    // Export for external use
    // ===================================
    window.downloadPortal = {
        startDownload,
        retryDownload,
        displayVersionList,
        closeModal
    };

})();
