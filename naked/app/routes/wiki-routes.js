/**
 * Wiki API Routes
 * Serves wiki documentation with markdown rendering
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { sanitizeHtml } = require('../modules/html-sanitizer');
const logger = require('../modules/logger');

// marked is an ESM module, so we need to use dynamic import
// Use a Promise to ensure single initialization and prevent race conditions
let markedPromise = null;

// Initialize marked module asynchronously
async function initMarked() {
    if (!markedPromise) {
        markedPromise = (async () => {
            const markedModule = await import('marked');
            const marked = markedModule.marked;
            // Configure marked options
            marked.setOptions({
                breaks: true,
                gfm: true
            });
            return marked;
        })();
    }
    return markedPromise;
}

// Base path for wiki files
const WIKI_BASE_PATH = path.join(__dirname, '../wiki');

// Wiki structure definition
const WIKI_STRUCTURE = {
    sections: [
        {
            id: 'getting-started',
            title: 'Getting Started',
            icon: 'rocket',
            pages: [
                { id: 'home', title: 'Home', icon: 'home', file: 'Home.md' },
                { id: 'wiki-index', title: 'Wiki Index', icon: 'list', file: 'Wiki-Index.md' },
                { id: 'snapshot-status', title: 'Snapshot Status', icon: 'clipboard-check', file: 'Snapshot-Status.md' },
                { id: 'getting-started', title: 'Getting Started', icon: 'play-circle', file: 'Getting-Started.md' },
                { id: 'installation', title: 'Installation & Setup', icon: 'download', file: 'Installation-&-Setup.md' },
                { id: 'configuration', title: 'Configuration', icon: 'settings', file: 'Konfiguration.md' },
                { id: 'faq', title: 'FAQ & Troubleshooting', icon: 'help-circle', file: 'FAQ-&-Troubleshooting.md' }
            ]
        },
        {
            id: 'plugins',
            title: 'Plugins',
            icon: 'puzzle',
            pages: [
                { id: 'plugin-overview', title: 'Plugin System', icon: 'plug', file: 'Plugin-Dokumentation.md' },
                { id: 'plugin-list', title: 'Plugin-Liste', icon: 'layout-list', file: 'Plugin-Liste.md' },
                { id: 'vdoninja', title: 'VDO.Ninja Multi-Guest', icon: 'users', file: 'Plugins/VDO-Ninja.md' }
            ]
        },
        {
            id: 'features',
            title: 'Features',
            icon: 'zap',
            pages: [
                { id: 'webgpu-engine', title: 'WebGPU Engine', icon: 'cpu', file: 'Features/WebGPU-Engine.md' },
                { id: 'gcce', title: 'GCCE', icon: 'terminal', file: 'Features/GCCE.md' },
                { id: 'emoji-rain', title: 'Emoji Rain', icon: 'smile', file: 'Features/Emoji-Rain.md' },
                { id: 'cloud-sync', title: 'Cloud Sync', icon: 'cloud', file: 'Features/Cloud-Sync.md' }
            ]
        },
        {
            id: 'overlays-streaming',
            title: 'Overlays & Streaming',
            icon: 'monitor',
            pages: [
                { id: 'overlays-alerts', title: 'Overlays & Alerts', icon: 'image', file: 'Overlays-&-Alerts.md' },
                { id: 'advanced-features', title: 'Advanced Features', icon: 'sliders-horizontal', file: 'Advanced-Features.md' },
                { id: 'alerts', title: 'Alert System', icon: 'bell', file: 'modules/alerts.md' },
                { id: 'flows', title: 'Automation Flows', icon: 'git-branch', file: 'modules/flows.md' }
            ]
        },
        {
            id: 'developer',
            title: 'Developer Documentation',
            icon: 'code',
            pages: [
                { id: 'architecture', title: 'Architecture', icon: 'layers', file: 'Architektur.md' },
                { id: 'developer-guide', title: 'Developer Guide', icon: 'book', file: 'Entwickler-Leitfaden.md' },
                { id: 'api-reference', title: 'API Reference', icon: 'server', file: 'API-Reference.md' }
            ]
        }
    ]
};

// Helper function to find page info by ID
function findPageById(pageId) {
    for (const section of WIKI_STRUCTURE.sections) {
        const page = section.pages.find(p => p.id === pageId);
        if (page) {
            return { page, section };
        }
    }
    return null;
}

function findPageByFile(filePath) {
    const normalizedPath = filePath
        .replace(/\\/g, '/')
        .replace(/^\.?\//, '')
        .replace(/^\.\.\//, '')
        .toLowerCase();

    const normalizedFileName = normalizedPath.split('/').pop();

    for (const section of WIKI_STRUCTURE.sections) {
        for (const page of section.pages) {
            const pageFile = page.file.replace(/\\/g, '/').toLowerCase();
            const pageFileName = pageFile.split('/').pop();
            if (pageFile === normalizedPath || pageFileName === normalizedFileName) {
                return page;
            }
        }
    }

    return null;
}

const CP1252_REVERSE_MAP = new Map([
    [0x20AC, 0x80],
    [0x201A, 0x82],
    [0x0192, 0x83],
    [0x201E, 0x84],
    [0x2026, 0x85],
    [0x2020, 0x86],
    [0x2021, 0x87],
    [0x02C6, 0x88],
    [0x2030, 0x89],
    [0x0160, 0x8A],
    [0x2039, 0x8B],
    [0x0152, 0x8C],
    [0x017D, 0x8E],
    [0x2018, 0x91],
    [0x2019, 0x92],
    [0x201C, 0x93],
    [0x201D, 0x94],
    [0x2022, 0x95],
    [0x2013, 0x96],
    [0x2014, 0x97],
    [0x02DC, 0x98],
    [0x2122, 0x99],
    [0x0161, 0x9A],
    [0x203A, 0x9B],
    [0x0153, 0x9C],
    [0x017E, 0x9E],
    [0x0178, 0x9F]
]);

const MOJIBAKE_RUN_PATTERN = /[ÃÂâð][\u0080-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]*/g;

function getWindows1252Byte(char) {
    const codePoint = char.codePointAt(0);

    if (codePoint <= 0xFF) {
        return codePoint;
    }

    return CP1252_REVERSE_MAP.get(codePoint);
}

function decodeMojibakeRun(value) {
    const bytes = [];

    for (const char of value) {
        const byte = getWindows1252Byte(char);
        if (byte === undefined) {
            return value;
        }
        bytes.push(byte);
    }

    const decoded = Buffer.from(bytes).toString('utf8');
    return decoded.includes('\uFFFD') ? value : decoded;
}

function repairMojibake(value) {
    let repaired = String(value || '');

    for (let i = 0; i < 2; i++) {
        const next = repaired.replace(MOJIBAKE_RUN_PATTERN, match => decodeMojibakeRun(match));
        if (next === repaired) {
            break;
        }
        repaired = next;
    }

    return repaired;
}

function stripMarkdownInline(value) {
    return String(value || '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .replace(/<[^>]+>/g, '');
}

function slugifyHeading(value) {
    return repairMojibake(stripMarkdownInline(value))
        .replace(/&amp;/g, 'and')
        .replace(/ß/g, 'ss')
        .replace(/ẞ/g, 'ss')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function normalizeAnchor(anchor) {
    if (!anchor) {
        return '';
    }

    const decodedAnchor = decodeURIComponent(String(anchor).replace(/^#/, ''));
    return slugifyHeading(decodedAnchor);
}

// Helper function to extract table of contents from markdown
function extractTOC(markdown) {
    const headings = [];
    const lines = markdown.split('\n');
    
    lines.forEach(line => {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
            const level = match[1].length;
            const text = stripMarkdownInline(match[2]);
            const id = slugifyHeading(text);
            
            headings.push({
                level,
                text,
                id
            });
        }
    });
    
    // Build hierarchical TOC
    const toc = [];
    const stack = [{ level: 0, children: toc }];
    
    headings.forEach(heading => {
        // Skip h1 as it's usually the title
        if (heading.level === 1) return;
        
        while (stack[stack.length - 1].level >= heading.level) {
            stack.pop();
        }
        
        const item = {
            id: heading.id,
            text: heading.text,
            level: heading.level,
            children: []
        };
        
        stack[stack.length - 1].children.push(item);
        stack.push(item);
    });
    
    return toc;
}

// GET /api/wiki/structure - Get wiki navigation structure
router.get('/structure', (req, res) => {
    res.json(WIKI_STRUCTURE);
});

// GET /api/wiki/page/:pageId - Get rendered wiki page
router.get('/page/:pageId', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { lang } = req.query; // Get language preference from query parameter
        const pageInfo = findPageById(pageId);
        
        if (!pageInfo) {
            return res.status(404).json({ error: 'Page not found' });
        }
        
        const { page, section } = pageInfo;
        
        // Try to read the file
        let filePath = path.join(WIKI_BASE_PATH, page.file);
        
        // If file doesn't exist in wiki folder, try plugins folder
        if (!await fileExists(filePath)) {
            filePath = path.join(__dirname, '..', page.file);
        }
        
        if (!await fileExists(filePath)) {
            // Create placeholder content for missing files
            const placeholderContent = createPlaceholderContent(page.title);
            const markdownParser = await initMarked();
            const html = sanitizeHtml(markdownParser(placeholderContent));
            
            return res.json({
                id: page.id,
                title: page.title,
                html,
                toc: [],
                breadcrumb: [
                    { id: 'home', title: 'Home' },
                    { id: section.id, title: section.title },
                    { id: page.id, title: page.title }
                ],
                lastUpdated: new Date().toISOString()
            });
        }
        
        // Read and process the file
        const markdown = repairMojibake(await fs.readFile(filePath, 'utf-8'));
        
        // Extract TOC
        const toc = extractTOC(markdown);
        
        // Process markdown to fix internal links before rendering
        let processedMarkdown = markdown;
        
        // Convert markdown wiki links to in-app #wiki: links, including optional anchors
        processedMarkdown = processedMarkdown.replace(/\[([^\]]+)\]\((?!https?:|mailto:)([^)\n]+?\.md(?:#[^)]+)?)\)/gi, (match, text, link) => {
            const [linkPath, anchor] = link.trim().split('#');
            const foundPage = findPageByFile(linkPath);

            if (!foundPage) {
                return match;
            }

            const normalizedAnchor = normalizeAnchor(anchor);
            const anchorPart = normalizedAnchor ? `::${encodeURIComponent(normalizedAnchor)}` : '';
            return `[${text}](#wiki:${foundPage.id}${anchorPart})`;
        });

        processedMarkdown = processedMarkdown.replace(/\]\(#(?!wiki:)([^)]+)\)/g, (match, anchor) => {
            const normalizedAnchor = normalizeAnchor(anchor);
            return normalizedAnchor ? `](#${normalizedAnchor})` : match;
        });
        
        // Render markdown to HTML
        const markdownParser = await initMarked();
        let html = markdownParser(processedMarkdown);
        
        // Process image paths to be relative to server
        html = html.replace(/src="(?!http)([^"]+)"/g, (match, imgPath) => {
            // Convert relative image paths
            const assetsPath = `/assets/wiki/${imgPath}`;
            return `src="${assetsPath}"`;
        });
        
        // Add IDs to headings for TOC linking
        html = html.replace(/<h([2-6])(?:\s+[^>]*)?>(.+?)<\/h\1>/g, (match, level, text) => {
            const id = slugifyHeading(text);
            return `<h${level} id="${id}">${text}</h${level}>`;
        });

        html = sanitizeHtml(html);
        
        // Build breadcrumb
        const breadcrumb = [
            { id: 'home', title: 'Home' },
            { id: section.id, title: section.title },
            { id: page.id, title: page.title }
        ];
        
        // Get file stats for last updated
        const stats = await fs.stat(filePath);
        
        res.json({
            id: page.id,
            title: page.title,
            html,
            toc,
            breadcrumb,
            lastUpdated: stats.mtime.toISOString(),
            preferredLanguage: lang || 'en', // Include language preference in response
            languageAnchor: getLanguageAnchor(lang) // Get anchor for scrolling
        });
        
    } catch (error) {
        logger.error('Error loading wiki page:', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Failed to load page' });
    }
});

// GET /api/wiki/search - Search wiki content
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.json([]);
        }
        
        const query = q.toLowerCase();
        const results = [];
        
        // Search through all pages
        for (const section of WIKI_STRUCTURE.sections) {
            for (const page of section.pages) {
                // Check title match
                if (page.title.toLowerCase().includes(query)) {
                    results.push({
                        id: page.id,
                        title: page.title,
                        section: section.title,
                        excerpt: `Documentation for ${page.title}`,
                        matches: [query]
                    });
                    continue;
                }
                
                // Try to search in content
                try {
                    let filePath = path.join(WIKI_BASE_PATH, page.file);
                    if (!await fileExists(filePath)) {
                        filePath = path.join(__dirname, '..', page.file);
                    }
                    
                    if (await fileExists(filePath)) {
                        const content = repairMojibake(await fs.readFile(filePath, 'utf-8'));
                        const contentLower = content.toLowerCase();
                        
                        if (contentLower.includes(query)) {
                            // Extract excerpt around match
                            const index = contentLower.indexOf(query);
                            const start = Math.max(0, index - 50);
                            const end = Math.min(content.length, index + query.length + 100);
                            const excerpt = '...' + content.substring(start, end).replace(/\n/g, ' ') + '...';
                            
                            results.push({
                                id: page.id,
                                title: page.title,
                                section: section.title,
                                excerpt,
                                matches: [query]
                            });
                        }
                    }
                } catch (error) {
                    // Skip this page if error reading
                    continue;
                }
            }
        }
        
        res.json(results.slice(0, 10)); // Limit to 10 results
        
    } catch (error) {
        logger.error('Error searching wiki:', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Search failed' });
    }
});

// Helper function to check if file exists
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// Helper function to create placeholder content for missing documentation
function createPlaceholderContent(title) {
    return `# ${title}

## Documentation Coming Soon

This section is currently under development. Documentation for **${title}** will be added soon.

### What is ${title}?

${title} is a feature/plugin of Pup Cid's Little TikTok Helper that enhances your streaming experience.

### Getting Started

To use ${title}:

1. Navigate to the ${title} section in the sidebar
2. Configure your settings
3. Start using the feature in your stream

### Need Help?

If you have questions about ${title}, please:

- Check the FAQ section
- Contact support at loggableim@gmail.com
- Open an issue on GitHub

---

*This is placeholder content. Full documentation will be added in a future update.*
`;
}

// Helper function to get language anchor for scrolling
function getLanguageAnchor(lang) {
    const languageAnchors = {
        'en': 'english',
        'de': 'deutsch',
        'es': 'espanol',
        'fr': 'francais'
    };
    return languageAnchors[lang] || 'english';
}

module.exports = router;
