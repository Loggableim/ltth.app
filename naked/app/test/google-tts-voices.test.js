/**
 * Test suite for Google TTS voice enhancements
 * Tests dynamic voice fetching and expanded static voice library
 */

const GoogleEngine = require('../plugins/tts/engines/google-engine');

describe('Google TTS Voice Enhancements', () => {
    let engine;
    
    beforeEach(() => {
        // Create engine instance without API key for testing static methods
        engine = new GoogleEngine(null, {
            info: () => {},
            error: () => {},
            warn: () => {}
        });
    });

    describe('Static Voice Library', () => {
        test('getVoices should return expanded voice library', () => {
            const voices = GoogleEngine.getVoices();
            
            // Should have significantly more voices than before
            // With Chirp3-HD voices added (160+ new voices), total should be 360+
            expect(Object.keys(voices).length).toBeGreaterThan(360);
        });

        test('should include Neural2 voices for German', () => {
            const voices = GoogleEngine.getVoices();
            
            expect(voices['de-DE-Neural2-A']).toBeDefined();
            expect(voices['de-DE-Neural2-B']).toBeDefined();
            expect(voices['de-DE-Neural2-C']).toBeDefined();
            expect(voices['de-DE-Neural2-D']).toBeDefined();
            expect(voices['de-DE-Neural2-F']).toBeDefined();
        });

        test('should include Studio and Polyglot voices', () => {
            const voices = GoogleEngine.getVoices();
            
            expect(voices['de-DE-Studio-B']).toBeDefined();
            expect(voices['de-DE-Studio-C']).toBeDefined();
            expect(voices['de-DE-Polyglot-1']).toBeDefined();
            expect(voices['es-ES-Polyglot-1']).toBeDefined();
            expect(voices['fr-FR-Polyglot-1']).toBeDefined();
        });

        test('should include News voices for English', () => {
            const voices = GoogleEngine.getVoices();
            
            expect(voices['en-US-News-K']).toBeDefined();
            expect(voices['en-US-News-L']).toBeDefined();
            expect(voices['en-US-News-N']).toBeDefined();
            expect(voices['en-GB-News-G']).toBeDefined();
            expect(voices['es-US-News-D']).toBeDefined();
        });

        test('should include new languages', () => {
            const voices = GoogleEngine.getVoices();
            
            // Dutch
            expect(voices['nl-NL-Wavenet-A']).toBeDefined();
            
            // Polish
            expect(voices['pl-PL-Wavenet-A']).toBeDefined();
            
            // Russian
            expect(voices['ru-RU-Wavenet-A']).toBeDefined();
            
            // Chinese
            expect(voices['cmn-CN-Wavenet-A']).toBeDefined();
            
            // Hindi
            expect(voices['hi-IN-Wavenet-A']).toBeDefined();
            expect(voices['hi-IN-Neural2-A']).toBeDefined();
            
            // Arabic
            expect(voices['ar-XA-Wavenet-A']).toBeDefined();
            
            // Turkish
            expect(voices['tr-TR-Wavenet-A']).toBeDefined();
            
            // Indonesian
            expect(voices['id-ID-Wavenet-A']).toBeDefined();
            
            // Thai
            expect(voices['th-TH-Neural2-C']).toBeDefined();
            
            // Vietnamese
            expect(voices['vi-VN-Wavenet-A']).toBeDefined();
            expect(voices['vi-VN-Neural2-A']).toBeDefined();
        });

        test('should include English India variant', () => {
            const voices = GoogleEngine.getVoices();
            
            expect(voices['en-IN-Wavenet-A']).toBeDefined();
            expect(voices['en-IN-Neural2-A']).toBeDefined();
            expect(voices['en-IN-Neural2-B']).toBeDefined();
            expect(voices['en-IN-Neural2-C']).toBeDefined();
            expect(voices['en-IN-Neural2-D']).toBeDefined();
        });

        test('should include Spanish US variant', () => {
            const voices = GoogleEngine.getVoices();
            
            expect(voices['es-US-Wavenet-A']).toBeDefined();
            expect(voices['es-US-Neural2-A']).toBeDefined();
            expect(voices['es-US-Studio-B']).toBeDefined();
        });

        test('should include Chirp3-HD voices for major languages', () => {
            const voices = GoogleEngine.getVoices();
            
            // German Chirp3-HD
            expect(voices['de-DE-Chirp3-HD-F1']).toBeDefined();
            expect(voices['de-DE-Chirp3-HD-M1']).toBeDefined();
            
            // English US Chirp3-HD
            expect(voices['en-US-Chirp3-HD-F1']).toBeDefined();
            expect(voices['en-US-Chirp3-HD-M1']).toBeDefined();
            
            // English GB Chirp3-HD
            expect(voices['en-GB-Chirp3-HD-F1']).toBeDefined();
            expect(voices['en-GB-Chirp3-HD-M1']).toBeDefined();
            
            // Spanish Chirp3-HD
            expect(voices['es-ES-Chirp3-HD-F1']).toBeDefined();
            expect(voices['es-ES-Chirp3-HD-M1']).toBeDefined();
            
            // French Chirp3-HD
            expect(voices['fr-FR-Chirp3-HD-F1']).toBeDefined();
            expect(voices['fr-FR-Chirp3-HD-M1']).toBeDefined();
            
            // Japanese Chirp3-HD
            expect(voices['ja-JP-Chirp3-HD-F1']).toBeDefined();
            expect(voices['ja-JP-Chirp3-HD-M1']).toBeDefined();
        });

        test('should include Portuguese PT variant', () => {
            const voices = GoogleEngine.getVoices();
            
            expect(voices['pt-PT-Wavenet-A']).toBeDefined();
            expect(voices['pt-PT-Wavenet-B']).toBeDefined();
        });

        test('all voices should have required properties', () => {
            const voices = GoogleEngine.getVoices();
            
            for (const [voiceId, voice] of Object.entries(voices)) {
                expect(voice).toHaveProperty('name');
                expect(voice).toHaveProperty('lang');
                expect(voice).toHaveProperty('gender');
                expect(voice).toHaveProperty('style');
                
                expect(typeof voice.name).toBe('string');
                expect(typeof voice.lang).toBe('string');
                expect(['male', 'female', 'neutral']).toContain(voice.gender);
                expect(['wavenet', 'neural2', 'standard', 'studio', 'news', 'polyglot', 'chirp3']).toContain(voice.style);
            }
        });
    });

    describe('Default Voice Selection', () => {
        test('should return default voices for new languages', () => {
            expect(GoogleEngine.getDefaultVoiceForLanguage('nl')).toBe('nl-NL-Wavenet-A');
            expect(GoogleEngine.getDefaultVoiceForLanguage('pl')).toBe('pl-PL-Wavenet-A');
            expect(GoogleEngine.getDefaultVoiceForLanguage('ru')).toBe('ru-RU-Wavenet-A');
            expect(GoogleEngine.getDefaultVoiceForLanguage('zh')).toBe('cmn-CN-Wavenet-A');
            expect(GoogleEngine.getDefaultVoiceForLanguage('hi')).toBe('hi-IN-Wavenet-A');
            expect(GoogleEngine.getDefaultVoiceForLanguage('ar')).toBe('ar-XA-Wavenet-A');
            expect(GoogleEngine.getDefaultVoiceForLanguage('tr')).toBe('tr-TR-Wavenet-A');
            expect(GoogleEngine.getDefaultVoiceForLanguage('id')).toBe('id-ID-Wavenet-A');
            expect(GoogleEngine.getDefaultVoiceForLanguage('th')).toBe('th-TH-Neural2-C');
            expect(GoogleEngine.getDefaultVoiceForLanguage('vi')).toBe('vi-VN-Wavenet-A');
        });

        test('should fall back to English for unknown languages', () => {
            expect(GoogleEngine.getDefaultVoiceForLanguage('xx')).toBe('en-US-Wavenet-C');
            expect(GoogleEngine.getDefaultVoiceForLanguage('zz')).toBe('en-US-Wavenet-C');
        });
    });

    describe('Dynamic Voice Fetching', () => {
        test('getAllVoices should fall back to static voices without API key', async () => {
            const voices = await engine.getAllVoices();
            
            expect(voices).toBeDefined();
            // Updated to reflect Chirp3-HD voices addition
            expect(Object.keys(voices).length).toBeGreaterThan(360);
        });

        test('voice cache should have correct TTL properties', () => {
            expect(engine.voicesCacheTTL).toBe(24 * 60 * 60 * 1000); // 24 hours
            expect(engine.dynamicVoices).toBeNull();
            expect(engine.voicesCacheTimestamp).toBeNull();
        });
    });

    describe('Voice Categorization', () => {
        test('should correctly categorize voices by style', () => {
            const voices = GoogleEngine.getVoices();
            
            const wavenetVoices = Object.values(voices).filter(v => v.style === 'wavenet');
            const neural2Voices = Object.values(voices).filter(v => v.style === 'neural2');
            const standardVoices = Object.values(voices).filter(v => v.style === 'standard');
            const studioVoices = Object.values(voices).filter(v => v.style === 'studio');
            const newsVoices = Object.values(voices).filter(v => v.style === 'news');
            const polyglotVoices = Object.values(voices).filter(v => v.style === 'polyglot');
            const chirp3Voices = Object.values(voices).filter(v => v.style === 'chirp3');
            
            expect(wavenetVoices.length).toBeGreaterThan(50);
            expect(neural2Voices.length).toBeGreaterThan(30);
            expect(standardVoices.length).toBeGreaterThan(15);
            expect(studioVoices.length).toBeGreaterThan(5);
            expect(newsVoices.length).toBeGreaterThan(10);
            expect(polyglotVoices.length).toBeGreaterThan(2);
            // 22 languages × 8 voices = 176 Chirp3-HD voices
            expect(chirp3Voices.length).toBeGreaterThan(150);
        });

        test('should have voices for all major languages', () => {
            const voices = GoogleEngine.getVoices();
            const languages = new Set(Object.values(voices).map(v => v.lang));
            
            // Should have at least these languages
            const expectedLanguages = ['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'nl', 'pl', 'ru', 'zh', 'hi', 'ar', 'tr', 'id', 'th', 'vi'];
            
            for (const lang of expectedLanguages) {
                expect(languages.has(lang)).toBe(true);
            }
        });
    });
});
