/**
 * Profanity Filter
 * Filters inappropriate content with configurable strictness
 */
class ProfanityFilter {
    constructor(logger) {
        this.logger = logger;

        // Profanity word lists (basic, can be extended)
        this.profanityLists = {
            // English
            'en': [
                'fuck', 'shit', 'ass', 'bitch', 'damn', 'hell',
                'bastard', 'crap', 'piss', 'dick', 'cock', 'pussy',
                'whore', 'slut', 'fag', 'nigger', 'cunt'
            ],
            // German
            'de': [
                'scheiße', 'scheisse', 'fick', 'arsch', 'fotze',
                'hurensohn', 'wichser', 'sau', 'dreck', 'mist'
            ],
            // Spanish
            'es': [
                'mierda', 'puta', 'coño', 'joder', 'cabrón',
                'pendejo', 'verga', 'chingada'
            ],
            // French
            'fr': [
                'merde', 'putain', 'con', 'salope', 'connard',
                'enculé', 'bordel', 'chier'
            ]
        };

        // Replacement strategies
        this.replacements = {
            'asterisk': (word) => word[0] + '*'.repeat(word.length - 1),
            'beep': () => '[BEEP]',
            'blank': () => '',
            'custom': (word, custom) => custom || '[CENSORED]'
        };

        // Current filter mode
        this.mode = 'moderate'; // off, moderate, strict
        this.replaceStrategy = 'asterisk';
        this.customReplacement = null;
    }

    /**
     * Set filter mode
     * @param {string} mode - 'off', 'moderate', 'strict'
     */
    setMode(mode) {
        if (['off', 'moderate', 'strict'].includes(mode)) {
            this.mode = mode;
            this.logger.info(`Profanity filter mode set to: ${mode}`);
        }
    }

    /**
     * Set replacement strategy
     * @param {string} strategy - 'asterisk', 'beep', 'blank', 'custom'
     * @param {string} customText - Custom replacement text (for 'custom' strategy)
     */
    setReplacement(strategy, customText = null) {
        if (this.replacements[strategy]) {
            this.replaceStrategy = strategy;
            this.customReplacement = customText;
            this.logger.info(`Profanity replacement strategy set to: ${strategy}`);
        }
    }

    /**
     * Add custom words to filter list
     * @param {string} langCode - Language code
     * @param {array} words - Array of words to add
     */
    addWords(langCode, words) {
        if (!this.profanityLists[langCode]) {
            this.profanityLists[langCode] = [];
        }

        words.forEach(word => {
            const normalized = word.toLowerCase().trim();
            if (normalized && !this.profanityLists[langCode].includes(normalized)) {
                this.profanityLists[langCode].push(normalized);
            }
        });

        this.logger.info(`Added ${words.length} custom words to ${langCode} profanity filter`);
    }

    /**
     * Remove words from filter list
     * @param {string} langCode - Language code
     * @param {array} words - Array of words to remove
     */
    removeWords(langCode, words) {
        if (!this.profanityLists[langCode]) {
            return;
        }

        words.forEach(word => {
            const normalized = word.toLowerCase().trim();
            const index = this.profanityLists[langCode].indexOf(normalized);
            if (index !== -1) {
                this.profanityLists[langCode].splice(index, 1);
            }
        });

        this.logger.info(`Removed ${words.length} words from ${langCode} profanity filter`);
    }

    /**
     * Filter text for profanity
     * @param {string} text - Text to filter
     * @param {string} langCode - Language code (optional, will check all if not provided)
     * @returns {object} { filtered: string, hasProfanity: boolean, matches: array }
     */
    filter(text, langCode = null) {
        // Check if text exists first to avoid returning null
        if (!text) {
            return {
                filtered: '',
                hasProfanity: false,
                matches: []
            };
        }

        if (this.mode === 'off') {
            return {
                filtered: text,
                hasProfanity: false,
                matches: []
            };
        }

        const originalText = text;
        let filteredText = text;
        const matches = [];

        // Determine which word lists to check
        const listsToCheck = langCode && this.profanityLists[langCode]
            ? [langCode]
            : Object.keys(this.profanityLists);

        // Check each language's profanity list
        for (const lang of listsToCheck) {
            const wordList = this.profanityLists[lang];

            for (const badWord of wordList) {
                // Create regex for case-insensitive matching with word boundaries
                const regex = new RegExp(`\\b${this._escapeRegex(badWord)}\\b`, 'gi');
                const foundMatches = text.match(regex);

                if (foundMatches) {
                    matches.push(...foundMatches.map(m => ({
                        word: m,
                        lang: lang
                    })));

                    // Replace based on strategy
                    const replacement = this.replaceStrategy === 'custom'
                        ? this.replacements.custom(badWord, this.customReplacement)
                        : this.replacements[this.replaceStrategy](badWord);

                    filteredText = filteredText.replace(regex, replacement);
                }
            }
        }

        const hasProfanity = matches.length > 0;

        if (hasProfanity) {
            this.logger.warn(`Profanity detected and filtered: ${matches.length} match(es) in text: "${originalText.substring(0, 50)}..."`);
        }

        return {
            filtered: filteredText,
            hasProfanity,
            matches,
            action: this.mode === 'strict' && hasProfanity ? 'drop' : 'replace'
        };
    }

    /**
     * Check if text contains profanity (without filtering)
     * @param {string} text - Text to check
     * @param {string} langCode - Language code (optional)
     * @returns {boolean}
     */
    contains(text, langCode = null) {
        const result = this.filter(text, langCode);
        return result.hasProfanity;
    }

    /**
     * Escape regex special characters
     */
    _escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Get current filter settings
     */
    getSettings() {
        return {
            mode: this.mode,
            replaceStrategy: this.replaceStrategy,
            customReplacement: this.customReplacement,
            wordListSizes: Object.keys(this.profanityLists).reduce((acc, lang) => {
                acc[lang] = this.profanityLists[lang].length;
                return acc;
            }, {})
        };
    }

    /**
     * Get all profanity words for a language
     */
    getWordList(langCode) {
        return this.profanityLists[langCode] || [];
    }

    /**
     * Export all word lists
     */
    exportWordLists() {
        return JSON.parse(JSON.stringify(this.profanityLists));
    }

    /**
     * Import word lists
     */
    importWordLists(lists) {
        try {
            Object.keys(lists).forEach(lang => {
                if (Array.isArray(lists[lang])) {
                    this.profanityLists[lang] = lists[lang];
                }
            });
            this.logger.info('Profanity word lists imported successfully');
            return true;
        } catch (error) {
            this.logger.error(`Failed to import word lists: ${error.message}`);
            return false;
        }
    }
}

module.exports = ProfanityFilter;
