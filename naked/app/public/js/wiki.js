/**
 * Wiki System for Pup Cid's Little TikTok Helper
 * Provides comprehensive documentation with markdown rendering, search, and navigation
 */

(() => {
    'use strict';

    // ========== LOGGING ==========
    const log = window.FrontendLogger.createLogger('Wiki');

    // ========== STATE ==========
    let wikiStructure = null;
    let wikiCache = new Map();
    let currentPage = 'home';
    let currentLanguage = 'en'; // Default language
    let isInitialized = false;
    let viewObserver = null;
    let searchTimeout = null;

    // ========== CONFIGURATION ==========
    const WIKI_API_BASE = '/api/wiki';
    const SEARCH_DEBOUNCE_MS = 300;
    const CACHE_MAX_SIZE = 50; // Limit cache size to prevent memory issues
    const SUPPORTED_LANGUAGES = ['en', 'de', 'es', 'fr']; // Supported languages

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
        
        log.info('Initializing wiki system');
        isInitialized = true;

        try {
            // Load wiki structure
            const response = await fetch(`${WIKI_API_BASE}/structure`);
            if (!response.ok) throw new Error('Failed to load wiki structure');
            
            wikiStructure = await response.json();
            log.info('Structure loaded', wikiStructure);

            // Resolve language before the first page request so standalone and dashboard
            // views load the expected language section immediately.
            currentLanguage = getPreferredLanguage();

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
            log.error('Initialization failed', { error: error.message, stack: error.stack });
            showError('Failed to load wiki. Please try again later.');
        }
    }

    // ========== LANGUAGE PREFERENCE ==========
    function getPreferredLanguage() {
        // Check localStorage first
        const stored = localStorage.getItem('wiki-language');
        if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
            return stored;
        }
        
        // Check browser language
        const browserLang = navigator.language.split('-')[0];
        if (SUPPORTED_LANGUAGES.includes(browserLang)) {
            return browserLang;
        }
        
        // Default to English
        return 'en';
    }

    function setPreferredLanguage(lang) {
        if (SUPPORTED_LANGUAGES.includes(lang)) {
            currentLanguage = lang;
            localStorage.setItem('wiki-language', lang);
            // Reload current page with new language
            loadPage(currentPage);
        }
    }

    // ========== URL HASH NAVIGATION ==========
    function handleHashNavigation() {
        const pageId = getPageFromHash();
        if (pageId && wikiStructure) {
            const anchor = getAnchorFromHash();
            loadPage(pageId).then(() => {
                if (anchor) {
                    setTimeout(() => scrollToArticleAnchor(anchor), 50);
                }
            });
        }
    }

    function getPageFromHash() {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#wiki:')) {
            const hashPayload = hash.replace('#wiki:', '');
            const [pageId] = hashPayload.split('::');
            return pageId;
        }
        return null;
    }

    function getAnchorFromHash() {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#wiki:')) {
            const hashPayload = hash.replace('#wiki:', '');
            const [, anchor] = hashPayload.split('::');
            return anchor ? decodeURIComponent(anchor) : null;
        }
        return null;
    }

    function setPageHash(pageId, anchor = null) {
        if (pageId && pageId !== 'home') {
            const anchorPart = anchor ? `::${encodeURIComponent(anchor)}` : '';
            window.history.pushState({ page: pageId, anchor }, '', `#wiki:${pageId}${anchorPart}`);
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
    async function loadPage(pageId, options = {}) {
        log.info(`Loading page: ${pageId}`);
        currentPage = pageId;

        const articleContainer = document.getElementById('wiki-article');
        if (!articleContainer) return;
        const scrollContainer = getWikiScrollContainer();

        // Save scroll position before loading new page
        const scrollPosition = scrollContainer ? scrollContainer.scrollTop : 0;

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
            const cacheKey = `${pageId}-${currentLanguage}`;
            if (wikiCache.has(cacheKey)) {
                content = wikiCache.get(cacheKey);
            } else {
                // Fetch from server with language preference
                const response = await fetch(`${WIKI_API_BASE}/page/${encodeURIComponent(pageId)}?lang=${encodeURIComponent(currentLanguage)}`);
                if (!response.ok) throw new Error(`Failed to load page: ${pageId}`);
                
                content = await response.json();
                
                // Add to cache with size limit
                if (wikiCache.size >= CACHE_MAX_SIZE) {
                    // Remove oldest entry (first key)
                    const firstKey = wikiCache.keys().next().value;
                    wikiCache.delete(firstKey);
                }
                wikiCache.set(cacheKey, content);
            }

            // Render content
            renderPage(content);

            // Update active state in navigation
            updateActiveNav(pageId);

            // Update URL hash
            setPageHash(pageId);

            // Scroll to top of article container
            if (scrollContainer) {
                scrollContainer.scrollTop = 0;
            }

            // Auto-scroll to language section if available
            if (content.languageAnchor && !options.suppressLanguageAnchorScroll) {
                setTimeout(() => {
                    scrollToLanguageSection(content.languageAnchor);
                }, 100);
            }

        } catch (error) {
            log.error(`Failed to load page ${pageId}`, { error: error.message });
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
                const hashValue = wikiLink.getAttribute('href').replace('#wiki:', '');
                const [pageId, encodedAnchor] = hashValue.split('::');
                const anchor = encodedAnchor ? decodeURIComponent(encodedAnchor) : null;
                loadPage(pageId, { suppressLanguageAnchorScroll: !!anchor }).then(() => {
                    if (anchor) {
                        setPageHash(pageId, anchor);
                        setTimeout(() => scrollToArticleAnchor(anchor), 50);
                    }
                });
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

        log.info(`Searching for: ${query}`);

        try {
            const response = await fetch(`${WIKI_API_BASE}/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Search failed');

            const results = await response.json();
            displaySearchResults(results);
        } catch (error) {
            log.error('Search failed', { error: error.message });
        }
    }

    function displaySearchResults(results) {
        let resultsContainer = document.getElementById('wiki-search-results');
        
        if (!resultsContainer) {
            resultsContainer = document.createElement('div');
            resultsContainer.id = 'wiki-search-results';
            resultsContainer.className = 'wiki-search-results';
            resultsContainer.addEventListener('click', handleSearchResultClick);
            
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
            resultsContainer.innerHTML = '';
            results.forEach(result => {
                const resultLink = document.createElement('a');
                resultLink.href = `#wiki:${result.id}`;
                resultLink.className = 'wiki-search-result';
                resultLink.dataset.page = result.id;

                const title = document.createElement('div');
                title.className = 'wiki-search-result-title';
                appendHighlightedText(title, result.title, result.matches);

                const excerpt = document.createElement('div');
                excerpt.className = 'wiki-search-result-excerpt';
                appendHighlightedText(excerpt, result.excerpt, result.matches);

                resultLink.appendChild(title);
                resultLink.appendChild(excerpt);
                resultsContainer.appendChild(resultLink);
            });
        }

        resultsContainer.style.display = 'block';
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function handleSearchResultClick(e) {
        const result = e.target.closest('.wiki-search-result');
        if (result) {
            e.preventDefault();
            loadPage(result.dataset.page);
            hideSearchResults();
            document.getElementById('wiki-search').value = '';
        }
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

    function appendHighlightedText(container, text, matches) {
        const source = String(text || '');
        const normalizedMatches = (matches || [])
            .map(match => String(match || '').toLowerCase())
            .filter(Boolean);

        if (normalizedMatches.length === 0) {
            container.textContent = source;
            return;
        }

        const lowerSource = source.toLowerCase();
        let index = 0;

        while (index < source.length) {
            let nextMatch = null;

            normalizedMatches.forEach(match => {
                const foundIndex = lowerSource.indexOf(match, index);
                if (foundIndex === -1) return;
                if (!nextMatch || foundIndex < nextMatch.index) {
                    nextMatch = { index: foundIndex, value: match };
                }
            });

            if (!nextMatch) {
                container.appendChild(document.createTextNode(source.slice(index)));
                break;
            }

            if (nextMatch.index > index) {
                container.appendChild(document.createTextNode(source.slice(index, nextMatch.index)));
            }

            const mark = document.createElement('mark');
            const endIndex = nextMatch.index + nextMatch.value.length;
            mark.textContent = source.slice(nextMatch.index, endIndex);
            container.appendChild(mark);
            index = endIndex;
        }
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
                <button class="btn btn-primary" data-action="reload-page">
                    <i data-lucide="refresh-cw"></i>
                    Reload Page
                </button>
            </div>
        `;

        // Add event listener for reload button
        const reloadBtn = articleContainer.querySelector('[data-action="reload-page"]');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => location.reload());
        }

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
        
        log.debug('Cleanup completed');
    }

    // ========== LANGUAGE SECTION SCROLLING ==========
    function scrollToLanguageSection(anchor) {
        const articleContainer = document.getElementById('wiki-article');
        if (!articleContainer) return;
        const scrollContainer = getWikiScrollContainer();
        if (!scrollContainer) return;

        const heading = articleContainer.querySelector(`h2[id="${anchor}"], h2 a[name="${anchor}"]`);
        if (heading) {
            const scrollRect = scrollContainer.getBoundingClientRect();
            const headingRect = heading.getBoundingClientRect();
            const offset = scrollContainer.scrollTop + (headingRect.top - scrollRect.top) - 20;
            scrollContainer.scrollTop = Math.max(0, offset);
        }
    }

    function scrollToArticleAnchor(anchor) {
        if (!anchor) return;
        const articleContainer = document.getElementById('wiki-article');
        if (!articleContainer) return;
        const scrollContainer = getWikiScrollContainer();
        if (!scrollContainer) return;
        const normalizedAnchor = String(anchor).toLowerCase();
        const target = articleContainer.querySelector(`#${anchor}, [id="${anchor}"]`) ||
            Array.from(articleContainer.querySelectorAll('[id]')).find(el => {
                const id = String(el.id || '').toLowerCase();
                return id === normalizedAnchor ||
                    id.endsWith(`-${normalizedAnchor}`) ||
                    id.includes(normalizedAnchor);
            });
        if (target) {
            const articleRect = scrollContainer.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const offsetTop = scrollContainer.scrollTop + (targetRect.top - articleRect.top) - 20;
            scrollContainer.scrollTo({ top: Math.max(0, offsetTop), behavior: 'auto' });
        }
    }

    function getWikiScrollContainer() {
        const articleContainer = document.getElementById('wiki-article');
        if (!articleContainer) return null;
        return articleContainer.closest('.wiki-content') || articleContainer;
    }

    // ========== EXPORT ==========
    window.WikiSystem = {
        loadPage,
        getCurrentPage: () => currentPage,
        getCurrentLanguage: () => currentLanguage,
        getCurrentHashAnchor: getAnchorFromHash,
        setLanguage: setPreferredLanguage,
        clearCache: () => wikiCache.clear(),
        cleanup
    };
})();
