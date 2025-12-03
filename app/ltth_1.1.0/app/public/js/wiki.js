/**
 * Wiki System for Pup Cid's Little TikTok Helper
 * Provides comprehensive documentation with markdown rendering, search, and navigation
 */

(() => {
    'use strict';

    // ========== STATE ==========
    let wikiStructure = null;
    let wikiCache = new Map();
    let currentPage = 'home';
    let isInitialized = false;
    let viewObserver = null;
    let searchTimeout = null;

    // ========== CONFIGURATION ==========
    const WIKI_API_BASE = '/api/wiki';
    const SEARCH_DEBOUNCE_MS = 300;
    const CACHE_MAX_SIZE = 50; // Limit cache size to prevent memory issues

    // ========== INITIALIZATION ==========
    document.addEventListener('DOMContentLoaded', async () => {
        // Initialize when wiki view becomes active
        const wikiView = document.getElementById('view-wiki');
        
        // Check if we're in standalone mode (wiki.html without dashboard)
        const isStandalone = !wikiView;
        
        if (isStandalone) {
            // Standalone mode: initialize immediately
            initializeWiki();
        } else {
            // Dashboard mode: initialize when view becomes active (lazy initialization)
            viewObserver = new MutationObserver(() => {
                if (wikiView.classList.contains('active') && !isInitialized) {
                    initializeWiki();
                }
            });

            viewObserver.observe(wikiView, { attributes: true, attributeFilter: ['class'] });

            // Also check if it's already active
            if (wikiView.classList.contains('active')) {
                initializeWiki();
            }
        }

        // Handle URL hash navigation
        handleHashNavigation();
        window.addEventListener('hashchange', handleHashNavigation);
    });

    // ========== WIKI INITIALIZATION ==========
    async function initializeWiki() {
        if (isInitialized) return;
        
        console.log('📚 [Wiki] Initializing wiki system...');
        isInitialized = true;

        try {
            // Load wiki structure
            const response = await fetch(`${WIKI_API_BASE}/structure`);
            if (!response.ok) throw new Error('Failed to load wiki structure');
            
            wikiStructure = await response.json();
            console.log('✅ [Wiki] Structure loaded:', wikiStructure);

            // Build navigation
            buildNavigation();

            // Set up search (consolidated event listener)
            setupSearch();

            // Load initial page based on hash or default to home
            const hashPage = getPageFromHash();
            await loadPage(hashPage || 'home');

            // Re-initialize Lucide icons once
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        } catch (error) {
            console.error('❌ [Wiki] Initialization failed:', error);
            showError('Failed to load wiki. Please try again later.');
        }
    }

    // ========== URL HASH NAVIGATION ==========
    function handleHashNavigation() {
        const pageId = getPageFromHash();
        if (pageId && wikiStructure) {
            loadPage(pageId);
        }
    }

    function getPageFromHash() {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#wiki:')) {
            return hash.replace('#wiki:', '');
        }
        return null;
    }

    function setPageHash(pageId) {
        if (pageId && pageId !== 'home') {
            window.history.pushState({ page: pageId }, '', `#wiki:${pageId}`);
        } else {
            window.history.pushState({ page: 'home' }, '', window.location.pathname);
        }
    }

    // ========== NAVIGATION ==========
    function buildNavigation() {
        const navContainer = document.getElementById('wiki-nav');
        if (!navContainer) return;

        navContainer.innerHTML = '';

        // Create navigation structure
        wikiStructure.sections.forEach(section => {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'wiki-nav-section';
            sectionEl.dataset.sectionId = section.id;

            // Section header
            const headerEl = document.createElement('div');
            headerEl.className = 'wiki-nav-section-header';
            headerEl.innerHTML = `
                <i data-lucide="${section.icon || 'folder'}"></i>
                <span>${section.title}</span>
                <i data-lucide="chevron-down" class="wiki-nav-chevron"></i>
            `;

            sectionEl.appendChild(headerEl);

            // Section items
            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'wiki-nav-items';

            section.pages.forEach(page => {
                const itemEl = document.createElement('a');
                itemEl.className = 'wiki-nav-item';
                itemEl.href = `#wiki:${page.id}`;
                itemEl.dataset.page = page.id;
                itemEl.innerHTML = `
                    <i data-lucide="${page.icon || 'file-text'}"></i>
                    <span>${page.title}</span>
                `;

                itemsContainer.appendChild(itemEl);
            });

            sectionEl.appendChild(itemsContainer);
            navContainer.appendChild(sectionEl);
        });

        // Event delegation for section headers
        navContainer.addEventListener('click', (e) => {
            const header = e.target.closest('.wiki-nav-section-header');
            if (header) {
                const section = header.closest('.wiki-nav-section');
                section.classList.toggle('collapsed');
                // Re-initialize icons only for the changed chevron
                if (typeof lucide !== 'undefined') {
                    const chevron = header.querySelector('.wiki-nav-chevron');
                    if (chevron) {
                        lucide.createIcons({ icons: { 'chevron-down': lucide.icons['chevron-down'] } });
                    }
                }
                return;
            }

            // Event delegation for navigation items
            const navItem = e.target.closest('.wiki-nav-item');
            if (navItem) {
                e.preventDefault();
                const pageId = navItem.dataset.page;
                loadPage(pageId);
            }
        });

        // Re-initialize Lucide icons once
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // ========== PAGE LOADING ==========
    async function loadPage(pageId) {
        console.log(`📄 [Wiki] Loading page: ${pageId}`);
        currentPage = pageId;

        const articleContainer = document.getElementById('wiki-article');
        if (!articleContainer) return;

        // Save scroll position before loading new page
        const scrollPosition = articleContainer.scrollTop;

        // Show loading state
        articleContainer.innerHTML = `
            <div class="wiki-loading">
                <i data-lucide="loader"></i>
                <span>Loading...</span>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            // Check cache first
            let content;
            if (wikiCache.has(pageId)) {
                content = wikiCache.get(pageId);
            } else {
                // Fetch from server
                const response = await fetch(`${WIKI_API_BASE}/page/${pageId}`);
                if (!response.ok) throw new Error(`Failed to load page: ${pageId}`);
                
                content = await response.json();
                
                // Add to cache with size limit
                if (wikiCache.size >= CACHE_MAX_SIZE) {
                    // Remove oldest entry (first key)
                    const firstKey = wikiCache.keys().next().value;
                    wikiCache.delete(firstKey);
                }
                wikiCache.set(pageId, content);
            }

            // Render content
            renderPage(content);

            // Update active state in navigation
            updateActiveNav(pageId);

            // Update URL hash
            setPageHash(pageId);

            // Scroll to top of article container
            articleContainer.scrollTop = 0;

        } catch (error) {
            console.error(`❌ [Wiki] Failed to load page ${pageId}:`, error);
            showError(`Failed to load page. Please try again.`);
        }
    }

    function renderPage(content) {
        const articleContainer = document.getElementById('wiki-article');
        if (!articleContainer) return;

        // Create article structure
        const article = document.createElement('article');
        article.className = 'wiki-article-content';

        // Add breadcrumb
        if (content.breadcrumb && content.breadcrumb.length > 0) {
            const breadcrumb = document.createElement('nav');
            breadcrumb.className = 'wiki-breadcrumb';
            breadcrumb.innerHTML = content.breadcrumb.map((item, index) => {
                if (index === content.breadcrumb.length - 1) {
                    return `<span>${item.title}</span>`;
                }
                return `<a href="#wiki:${item.id}" data-page="${item.id}">${item.title}</a>`;
            }).join('<i data-lucide="chevron-right"></i>');
            
            article.appendChild(breadcrumb);
        }

        // Add title
        const title = document.createElement('h1');
        title.className = 'wiki-page-title';
        title.textContent = content.title;
        article.appendChild(title);

        // Add table of contents if available
        if (content.toc && content.toc.length > 0) {
            const tocContainer = document.createElement('div');
            tocContainer.className = 'wiki-toc';
            tocContainer.innerHTML = `
                <h2>Table of Contents</h2>
                <nav class="wiki-toc-nav">
                    ${buildTOC(content.toc)}
                </nav>
            `;
            article.appendChild(tocContainer);
        }

        // Add main content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'wiki-markdown-content';
        contentDiv.innerHTML = content.html;
        article.appendChild(contentDiv);

        // Add footer with metadata
        if (content.lastUpdated) {
            const footer = document.createElement('div');
            footer.className = 'wiki-article-footer';
            footer.innerHTML = `
                <div class="wiki-meta">
                    <i data-lucide="clock"></i>
                    <span>Last updated: ${new Date(content.lastUpdated).toLocaleDateString()}</span>
                </div>
            `;
            article.appendChild(footer);
        }

        articleContainer.innerHTML = '';
        articleContainer.appendChild(article);

        // Re-initialize Lucide icons once
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Set up event delegation for internal links, breadcrumbs, TOC, and images
        setupArticleEventHandlers(article);
    }

    // ========== EVENT DELEGATION FOR ARTICLE ==========
    function setupArticleEventHandlers(article) {
        article.addEventListener('click', (e) => {
            // Handle breadcrumb clicks
            const breadcrumbLink = e.target.closest('.wiki-breadcrumb a[data-page]');
            if (breadcrumbLink) {
                e.preventDefault();
                loadPage(breadcrumbLink.dataset.page);
                return;
            }

            // Handle TOC clicks (smooth scroll to heading)
            const tocLink = e.target.closest('.wiki-toc-nav a[href^="#"]');
            if (tocLink) {
                e.preventDefault();
                const targetId = tocLink.getAttribute('href').substring(1);
                const targetElement = article.querySelector(`#${targetId}, [id="${targetId}"]`);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                return;
            }

            // Handle wiki internal links (#wiki:pageId)
            const wikiLink = e.target.closest('a[href^="#wiki:"]');
            if (wikiLink) {
                e.preventDefault();
                const pageId = wikiLink.getAttribute('href').replace('#wiki:', '');
                loadPage(pageId);
                return;
            }

            // Handle image clicks (lightbox)
            const img = e.target.closest('.wiki-markdown-content img');
            if (img) {
                e.preventDefault();
                showImageModal(img.src, img.alt);
                return;
            }
        });
    }

    function buildTOC(toc) {
        return `<ul>${toc.map(item => `
            <li>
                <a href="#${item.id}">${item.text}</a>
                ${item.children && item.children.length > 0 ? buildTOC(item.children) : ''}
            </li>
        `).join('')}</ul>`;
    }

    function updateActiveNav(pageId) {
        // Remove all active states
        document.querySelectorAll('.wiki-nav-item').forEach(item => {
            item.classList.remove('active');
        });

        // Add active state to current page
        const activeItem = document.querySelector(`.wiki-nav-item[data-page="${pageId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            
            // Expand parent section if collapsed
            const section = activeItem.closest('.wiki-nav-section');
            if (section) {
                section.classList.remove('collapsed');
            }
        }
    }

    // ========== SEARCH ==========
    function setupSearch() {
        const searchInput = document.getElementById('wiki-search');
        if (!searchInput) return;

        // Use single event listener with debouncing
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch(e.target.value);
            }, SEARCH_DEBOUNCE_MS);
        });

        // Close search results when clicking outside
        document.addEventListener('click', (e) => {
            const searchContainer = e.target.closest('.wiki-search-container');
            if (!searchContainer) {
                hideSearchResults();
            }
        });
    }

    async function performSearch(query) {
        if (!query || query.trim().length < 2) {
            // Clear search results
            hideSearchResults();
            return;
        }

        console.log(`🔍 [Wiki] Searching for: ${query}`);

        try {
            const response = await fetch(`${WIKI_API_BASE}/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Search failed');

            const results = await response.json();
            displaySearchResults(results);
        } catch (error) {
            console.error('❌ [Wiki] Search failed:', error);
        }
    }

    function displaySearchResults(results) {
        let resultsContainer = document.getElementById('wiki-search-results');
        
        if (!resultsContainer) {
            resultsContainer = document.createElement('div');
            resultsContainer.id = 'wiki-search-results';
            resultsContainer.className = 'wiki-search-results';
            
            const searchContainer = document.querySelector('.wiki-search-container');
            if (searchContainer) {
                searchContainer.appendChild(resultsContainer);
            }
        }

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="wiki-search-no-results">
                    <i data-lucide="search-x"></i>
                    <span>No results found</span>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = results.map(result => `
                <a href="#wiki:${result.id}" class="wiki-search-result" data-page="${result.id}">
                    <div class="wiki-search-result-title">${highlightMatch(result.title, result.matches)}</div>
                    <div class="wiki-search-result-excerpt">${highlightMatch(result.excerpt, result.matches)}</div>
                </a>
            `).join('');
        }

        // Event delegation for search results (already handled by navigation click handler)
        resultsContainer.style.display = 'block';
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Add click handler for search results
        resultsContainer.addEventListener('click', (e) => {
            const result = e.target.closest('.wiki-search-result');
            if (result) {
                e.preventDefault();
                loadPage(result.dataset.page);
                hideSearchResults();
                document.getElementById('wiki-search').value = '';
            }
        }, { once: false }); // Reusable handler
    }

    function hideSearchResults() {
        const resultsContainer = document.getElementById('wiki-search-results');
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
        }
    }

    function highlightMatch(text, matches) {
        if (!matches || matches.length === 0) return text;
        
        // Simple highlight implementation
        let highlighted = text;
        matches.forEach(match => {
            const regex = new RegExp(`(${match})`, 'gi');
            highlighted = highlighted.replace(regex, '<mark>$1</mark>');
        });
        return highlighted;
    }

    // ========== IMAGE MODAL ==========
    function showImageModal(src, alt) {
        // Remove existing modal if any
        const existing = document.getElementById('wiki-image-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'wiki-image-modal';
        modal.className = 'wiki-image-modal';
        modal.innerHTML = `
            <div class="wiki-image-modal-backdrop"></div>
            <div class="wiki-image-modal-content">
                <button class="wiki-image-modal-close">
                    <i data-lucide="x"></i>
                </button>
                <img src="${src}" alt="${alt || ''}">
                <div class="wiki-image-modal-caption">${alt || ''}</div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handler
        const close = () => {
            modal.remove();
            document.removeEventListener('keydown', escHandler);
        };

        // Close button and backdrop clicks
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('wiki-image-modal-backdrop') ||
                e.target.closest('.wiki-image-modal-close')) {
                close();
            }
        });

        // ESC key handler
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                close();
            }
        };
        document.addEventListener('keydown', escHandler);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // ========== ERROR HANDLING ==========
    function showError(message) {
        const articleContainer = document.getElementById('wiki-article');
        if (!articleContainer) return;

        articleContainer.innerHTML = `
            <div class="wiki-error">
                <i data-lucide="alert-circle"></i>
                <h2>Error</h2>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="location.reload()">
                    <i data-lucide="refresh-cw"></i>
                    Reload Page
                </button>
            </div>
        `;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // ========== CLEANUP ==========
    function cleanup() {
        // Clear cache
        wikiCache.clear();
        
        // Clear search timeout
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        
        // Disconnect observer
        if (viewObserver) {
            viewObserver.disconnect();
            viewObserver = null;
        }
        
        // Reset initialization flag
        isInitialized = false;
        
        console.log('🧹 [Wiki] Cleanup completed');
    }

    // ========== EXPORT ==========
    window.WikiSystem = {
        loadPage,
        getCurrentPage: () => currentPage,
        clearCache: () => wikiCache.clear(),
        cleanup
    };
})();
