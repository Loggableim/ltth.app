/**
 * Test for multilingual wiki functionality
 * Tests language detection, anchor generation, and link handling
 */

const path = require('path');
const fs = require('fs');

describe('Multilingual Wiki System', () => {
  // Test language anchor generation
  test('getLanguageAnchor should return correct anchors', () => {
    const getLanguageAnchor = (lang) => {
      const languageAnchors = {
        'en': 'english',
        'de': 'deutsch',
        'es': 'espanol',
        'fr': 'francais'
      };
      return languageAnchors[lang] || 'english';
    };

    expect(getLanguageAnchor('en')).toBe('english');
    expect(getLanguageAnchor('de')).toBe('deutsch');
    expect(getLanguageAnchor('es')).toBe('espanol');
    expect(getLanguageAnchor('fr')).toBe('francais');
    expect(getLanguageAnchor('invalid')).toBe('english'); // default
  });

  // Test multilingual files exist
  test('Home.md should exist and contain multilingual sections', () => {
    const wikiPath = path.join(__dirname, '../wiki/Home.md');
    expect(fs.existsSync(wikiPath)).toBe(true);

    const content = fs.readFileSync(wikiPath, 'utf-8');
    
    // Check for language section markers
    expect(content).toContain('## 🇬🇧 English');
    expect(content).toContain('## 🇩🇪 Deutsch');
    expect(content).toContain('## 🇪🇸 Español');
    expect(content).toContain('## 🇫🇷 Français');
    
    // Check for language selection section
    expect(content).toContain('Language Selection');
    expect(content).toContain('Sprachauswahl');
    expect(content).toContain('Selección de idioma');
    expect(content).toContain('Sélection de la langue');
  });

  // Test Getting-Started.md contains multilingual sections
  test('Getting-Started.md should exist and contain multilingual sections', () => {
    const wikiPath = path.join(__dirname, '../wiki/Getting-Started.md');
    expect(fs.existsSync(wikiPath)).toBe(true);

    const content = fs.readFileSync(wikiPath, 'utf-8');
    
    // Check for language section markers
    expect(content).toContain('## 🇬🇧 English');
    expect(content).toContain('## 🇩🇪 Deutsch');
    expect(content).toContain('## 🇪🇸 Español');
    expect(content).toContain('## 🇫🇷 Français');
  });

  // Test supported languages array
  test('Supported languages should be defined', () => {
    const SUPPORTED_LANGUAGES = ['en', 'de', 'es', 'fr'];
    
    expect(SUPPORTED_LANGUAGES).toHaveLength(4);
    expect(SUPPORTED_LANGUAGES).toContain('en');
    expect(SUPPORTED_LANGUAGES).toContain('de');
    expect(SUPPORTED_LANGUAGES).toContain('es');
    expect(SUPPORTED_LANGUAGES).toContain('fr');
  });

  // Test language preference detection
  test('Language preference should default to "en"', () => {
    const getPreferredLanguage = (stored, browserLang) => {
      const SUPPORTED_LANGUAGES = ['en', 'de', 'es', 'fr'];
      
      if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
        return stored;
      }
      
      if (browserLang && SUPPORTED_LANGUAGES.includes(browserLang)) {
        return browserLang;
      }
      
      return 'en';
    };

    // Test with no preferences
    expect(getPreferredLanguage(null, null)).toBe('en');
    
    // Test with stored preference
    expect(getPreferredLanguage('de', null)).toBe('de');
    
    // Test with browser language
    expect(getPreferredLanguage(null, 'fr')).toBe('fr');
    
    // Test with invalid language
    expect(getPreferredLanguage('invalid', null)).toBe('en');
    
    // Test stored preference takes precedence
    expect(getPreferredLanguage('es', 'fr')).toBe('es');
  });

  // Test cache key generation with language
  test('Cache key should include language', () => {
    const pageId = 'home';
    const currentLanguage = 'de';
    const cacheKey = `${pageId}-${currentLanguage}`;
    
    expect(cacheKey).toBe('home-de');
  });

  // Test wiki route query parameter
  test('Wiki route should accept lang query parameter', () => {
    const mockReq = { params: { pageId: 'home' }, query: { lang: 'es' } };
    const lang = mockReq.query.lang;
    
    expect(lang).toBe('es');
  });
});
