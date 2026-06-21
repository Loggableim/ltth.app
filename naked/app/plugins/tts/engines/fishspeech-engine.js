const axios = require('axios');
const WebSocket = require('ws');
const msgpack = require('@msgpack/msgpack');

/**
 * Fish.audio TTS Engine (Official API)
 * High-quality multilingual TTS using Fish Audio S1 engine
 * 
 * API Documentation: https://docs.fish.audio/developer-guide/getting-started/introduction
 * - Base URL: https://api.fish.audio
 * - Endpoint: POST /v1/tts
 * - Model: Fish Audio S1 (latest generation)
 * - Request Format: JSON (MessagePack also supported)
 * - Audio Formats: mp3, wav, pcm, opus
 * 
 * Features:
 * - Multilingual support (13+ languages: EN, ZH, JA, DE, FR, ES, KO, AR, RU, NL, IT, PL, PT)
 * - Voice cloning with reference audio  
 * - 64+ emotion expressions via text markers (happy, sad, angry, excited, etc.)
 * - Advanced audio effects (laughing, crying, whispering, shouting, etc.)
 * - Fine-grained control (phoneme control, paralanguage)
 * - Streaming support for low latency
 * - Automatic retry with exponential backoff
 * - Performance mode optimization
 * 
 * References:
 * - Models: https://docs.fish.audio/developer-guide/models-pricing/models-overview
 * - TTS: https://docs.fish.audio/developer-guide/core-features/text-to-speech
 * - Emotions: https://docs.fish.audio/developer-guide/core-features/emotions
 * - Fine-grained control: https://docs.fish.audio/developer-guide/core-features/fine-grained-control
 * - Best practices: https://docs.fish.audio/developer-guide/best-practices/emotion-control
 */
class FishSpeechEngine {
    // Default voice reference ID (Sarah - warm female voice)
    static DEFAULT_REFERENCE_ID = '933563129e564b19a115bedd57b7406a';
    
    // Opus auto bitrate constant (-1000 means automatic bitrate selection)
    static OPUS_AUTO_BITRATE = -1000;
    
    constructor(apiKey, logger, config = {}) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('Fish Speech API key is required and must be a non-empty string');
        }

        this.apiKey = apiKey;
        this.logger = logger;
        this.config = config;

        // Fish.audio Official API Configuration
        this.apiBaseUrl = 'https://api.fish.audio';
        this.apiSynthesisUrl = `${this.apiBaseUrl}/v1/tts`;
        this.model = 's1'; // Fish Audio S1 model (latest generation)

        // Performance mode optimization
        const performanceMode = config.performanceMode || 'balanced';
        
        // Adjust timeout and retries based on performance mode
        if (performanceMode === 'fast') {
            // Fast mode: optimized for low-resource PCs
            this.timeout = 8000;  // 8s timeout for faster failure
            this.maxRetries = 1;  // Only 1 retry (2 attempts total)
        } else if (performanceMode === 'quality') {
            // Quality mode: longer timeouts for better reliability
            this.timeout = 30000; // 30s timeout
            this.maxRetries = 3;  // 3 retries (4 attempts total)
        } else {
            // Balanced mode (default): moderate settings
            this.timeout = 15000; // 15s timeout
            this.maxRetries = 2;  // 2 retries (3 attempts total)
        }
        
        this.performanceMode = performanceMode;
        this.logger.info(`Fish.audio TTS: Performance mode set to '${performanceMode}' (timeout: ${this.timeout}ms, retries: ${this.maxRetries})`);

        // Supported emotions for Fish.audio (64+ emotions available)
        // Basic emotions (24)
        this.supportedEmotions = [
            'neutral', 'happy', 'sad', 'angry', 'excited', 'calm', 'nervous', 'confident',
            'surprised', 'satisfied', 'delighted', 'scared', 'worried', 'upset', 'frustrated',
            'depressed', 'empathetic', 'embarrassed', 'disgusted', 'moved', 'proud', 'relaxed',
            'grateful', 'curious', 'sarcastic',
            // Advanced emotions (25)
            'disdainful', 'unhappy', 'anxious', 'hysterical', 'indifferent', 'uncertain',
            'doubtful', 'confused', 'disappointed', 'regretful', 'guilty', 'ashamed',
            'jealous', 'envious', 'hopeful', 'optimistic', 'pessimistic', 'nostalgic',
            'lonely', 'bored', 'contemptuous', 'sympathetic', 'compassionate', 'determined', 'resigned'
        ];

        // Tone markers (5)
        this.supportedTones = [
            'in a hurry tone', 'shouting', 'screaming', 'whispering', 'soft tone'
        ];

        // Audio effects (10)
        this.supportedEffects = [
            'laughing', 'chuckling', 'sobbing', 'crying loudly', 'sighing',
            'groaning', 'panting', 'gasping', 'yawning', 'snoring',
            // Paralanguage effects
            'break', 'long-break', 'breath', 'laugh', 'cough', 'lip-smacking', 'sigh',
            // Background effects
            'audience laughing', 'background laughter', 'crowd laughing'
        ];

        this.logger.info('Fish.audio TTS engine initialized (Fish Audio S1 model)');
    }

    /**
     * Get all available Fish.audio voices
     * Note: These are example voice IDs. In production, users should use voice IDs from their Fish.audio account
     * or from the Fish.audio discovery page: https://fish.audio/discovery
     * @returns {Object} Voice map with voiceId as key
     */
    static getVoices() {
        return {
            // Example voices from Fish.audio (users can add their own)
            'fish-egirl': { 
                name: 'E-girl (Energetic Female)', 
                lang: 'en', 
                gender: 'female',
                model: 's1',
                reference_id: '8ef4a238714b45718ce04243307c57a7',
                description: 'Energetic young female voice',
                supportedEmotions: true
            },
            'fish-energetic-male': { 
                name: 'Energetic Male', 
                lang: 'en', 
                gender: 'male',
                model: 's1',
                reference_id: '802e3bc2b27e49c2995d23ef70e6ac89',
                description: 'Energetic and dynamic male voice',
                supportedEmotions: true
            },
            'fish-sarah': { 
                name: 'Sarah (Warm Female)', 
                lang: 'en', 
                gender: 'female',
                model: 's1',
                reference_id: '933563129e564b19a115bedd57b7406a',
                description: 'Warm and friendly female voice',
                supportedEmotions: true
            },
            'fish-adrian': { 
                name: 'Adrian (Professional Male)', 
                lang: 'en', 
                gender: 'male',
                model: 's1',
                reference_id: 'bf322df2096a46f18c579d0baa36f41d',
                description: 'Professional male voice',
                supportedEmotions: true
            },
            'fish-selene': { 
                name: 'Selene (Elegant Female)', 
                lang: 'en', 
                gender: 'female',
                model: 's1',
                reference_id: 'b347db033a6549378b48d00acb0d06cd',
                description: 'Elegant and sophisticated female voice',
                supportedEmotions: true
            },
            'fish-ethan': { 
                name: 'Ethan (Calm Male)', 
                lang: 'en', 
                gender: 'male',
                model: 's1',
                reference_id: '536d3a5e000945adb7038665781a4aca',
                description: 'Calm and reassuring male voice',
                supportedEmotions: true
            },
            // Custom German and Character Voices
            'fish-fishhead-spongebob': {
                name: 'Spongebob (Fishhead Style)',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '21b11048a816438184bdda74f4b9a204',
                description: 'Spongebob character voice - Fishhead style',
                supportedEmotions: true
            },
            'fish-pupcid': {
                name: 'PupCid',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '2d4039641d67419fa132ca59fa2f61ad',
                description: 'PupCid custom voice',
                supportedEmotions: true
            },
            'fish-christa': {
                name: 'Christa',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: '88b18e0d81474a0ca08e2ea6f9df5ff4',
                description: 'Christa German female voice',
                supportedEmotions: true
            },
            'fish-stoisch': {
                name: 'Stoisch',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'dae27abda6be4299b86b300a8e3f326a',
                description: 'Stoic German voice',
                supportedEmotions: true
            },
            'fish-christian': {
                name: 'Christian',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '36c6f4b9900241f294e71964a79d1fe2',
                description: 'Christian German male voice',
                supportedEmotions: true
            },
            'fish-kollegah': {
                name: 'Kollegah',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '01bbdc2d6cfe4b63b6f1ace4684f1ab0',
                description: 'Kollegah German rapper voice',
                supportedEmotions: true
            },
            'fish-paluten': {
                name: 'Paluten',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '77e3908a672a4b43b30786e52655d1bc',
                description: 'Paluten German YouTuber voice',
                supportedEmotions: true
            },
            'fish-frau-tagesschau': {
                name: 'Tagesschau Ansagerin (Style 1)',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: '285f00e53ff14eb1b111532fb39569d3',
                description: 'German news anchor female voice - Style 1',
                supportedEmotions: true
            },
            'fish-documentary-de-male': {
                name: 'Documentary DE Male',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '50d4a16421c14e0081c5b4e05d76f234',
                description: 'German documentary narrator male voice',
                supportedEmotions: true
            },
            'fish-regina-halmich': {
                name: 'Regina Halmich',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: '5d57382c07b0434bb7958aed4cf97757',
                description: 'Regina Halmich German female voice',
                supportedEmotions: true
            },
            'fish-helene-fischer': {
                name: 'Helene Fischer',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: '6cf98e8eddf74cecb428bc7e553e617a',
                description: 'Helene Fischer German singer voice',
                supportedEmotions: true
            },
            'fish-karo-female': {
                name: 'Karo Female',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: '4133ab4e1c584423987f05b5502e7bba',
                description: 'Karo German female voice',
                supportedEmotions: true
            },
            'fish-bad-mofo': {
                name: 'Bad MOFO',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'ceb4faf5b27b4783a832e380ac07ba4b',
                description: 'Bad MOFO tough male voice',
                supportedEmotions: true
            },
            'fish-synchronstimme-1-frau': {
                name: 'Synchronstimme 1 Frau',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: '6c0670e7ae4e41e3a3523c33e6e2650f',
                description: 'German dubbing voice female',
                supportedEmotions: true
            },
            'fish-frankfurter-bra': {
                name: 'Frankfurter Bra',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'db293a1f99624e968882bdd0c3065f8e',
                description: 'Frankfurt dialect male voice',
                supportedEmotions: true
            },
            'fish-bernd-das-brot': {
                name: 'Bernd das Brot',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '048507e659184c21908ed808695049ea',
                description: 'Bernd das Brot character voice',
                supportedEmotions: true
            },
            'fish-ben-zucker': {
                name: 'Ben Zucker',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '07308b330b4d447d973dc5dab97eb6cd',
                description: 'Ben Zucker German singer voice',
                supportedEmotions: true
            },
            'fish-spongebob': {
                name: 'Spongebob (German)',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '5ea97971497248e085ead9fad68f4011',
                description: 'Spongebob German dubbed voice',
                supportedEmotions: true
            },
            'fish-robert-habeck': {
                name: 'Robert Habeck',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '2785b83326f54ed0b27ce22c12636049',
                description: 'Robert Habeck German politician voice',
                supportedEmotions: true
            },
            'fish-disney-ansagefrau': {
                name: 'Disney Ansagefrau',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: '12d95cc6ab0542ab89028c9dc67fa335',
                description: 'Disney announcer female voice',
                supportedEmotions: true
            },
            'fish-meister-yoda': {
                name: 'Meister Yoda',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '5edf4ab1126f494fb3c100fb69675954',
                description: 'Master Yoda German voice',
                supportedEmotions: true
            },
            'fish-tagesschau-frau': {
                name: 'Tagesschau Ansagerin (Style 2)',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: '637982b4834e4d379fcc42625a345cb9',
                description: 'German news anchor female voice - Style 2',
                supportedEmotions: true
            },
            'fish-naruto': {
                name: 'Naruto',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '96da754d56c64af2bf22dacccabc08be',
                description: 'Naruto anime character voice',
                supportedEmotions: true
            },
            'fish-kai-pflaume': {
                name: 'Kai Pflaume',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '7a8cee0027084842b90844b40fce5819',
                description: 'Kai Pflaume German TV host voice',
                supportedEmotions: true
            },
            'fish-gzuz': {
                name: 'Gzuz',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '5d0afd69be9849c989f515b99e5662aa',
                description: 'Gzuz German rapper voice',
                supportedEmotions: true
            },
            'fish-mike-kruger': {
                name: 'Mike Krüger',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'b4aba9a1cef34af3a1cc03e8468463ab',
                description: 'Mike Krüger German comedian voice',
                supportedEmotions: true
            },
            'fish-vera-birkenbihl': {
                name: 'Vera Birkenbihl',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: 'b8e21f6e361b4f938295a083f887f997',
                description: 'Vera Birkenbihl German trainer voice',
                supportedEmotions: true
            },
            'fish-charlie-harper': {
                name: 'Charlie Harper',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '1696adb09a1d4415846f84089289a1f1',
                description: 'Charlie Harper character voice',
                supportedEmotions: true
            },
            'fish-db-ansagemann': {
                name: 'DB Ansagemann',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'e75ddb41d45b4e8c9921593cd546e2dd',
                description: 'German railway announcer male voice',
                supportedEmotions: true
            },
            'fish-meister-rohrich-werner': {
                name: 'Meister Röhrich Werner',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'c6c8442c29e74ba4b3743ca846a6ba8d',
                description: 'Werner character voice',
                supportedEmotions: true
            },
            'fish-ubahn-muc-ansagefrau': {
                name: 'U-Bahn MUC Ansagefrau',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: 'd6e0c9f80fec44adac2d2b4746dcac61',
                description: 'Munich subway announcer female voice',
                supportedEmotions: true
            },
            'fish-spongebob-english': {
                name: 'Spongebob (English)',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '54e3a85ac9594ffa83264b8a494b901b',
                description: 'Spongebob original English voice',
                supportedEmotions: true
            },
            'fish-trump': {
                name: 'Trump',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '5196af35f6ff4a0dbf541793fc9f2157',
                description: 'Donald Trump voice',
                supportedEmotions: true
            },
            'fish-rick-sanchez': {
                name: 'Rick Sanchez',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '88d465f1189846ed98a0240298cf3e02',
                description: 'Rick Sanchez character voice',
                supportedEmotions: true
            },
            'fish-morty-smith': {
                name: 'Morty Smith',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '377e4ac186da47faa3b644d033775954',
                description: 'Morty Smith character voice',
                supportedEmotions: true
            },
            'fish-summer-smith': {
                name: 'Summer Smith',
                lang: 'en',
                gender: 'female',
                model: 's1',
                reference_id: 'e767945172524a24a272b86ed80b976c',
                description: 'Summer Smith character voice',
                supportedEmotions: true
            },
            'fish-bart-simpson-en': {
                name: 'Bart Simpson EN',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '55bef2337e5a4d6888eeac7f4bd01146',
                description: 'Bart Simpson English voice',
                supportedEmotions: true
            },
            'fish-morgan-freeman': {
                name: 'Morgan Freeman',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'd07c8029f7d64a11bdcf5e22edf861c8',
                description: 'Morgan Freeman voice',
                supportedEmotions: true
            },
            'fish-johnny-depp': {
                name: 'Johnny Depp',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'fb722cecaf534263b409223e524f3e60',
                description: 'Johnny Depp voice',
                supportedEmotions: true
            },
            'fish-anakin-skywalker': {
                name: 'Anakin Skywalker EN',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '9320d716366d473f9926ffdd2c7adb49',
                description: 'Anakin Skywalker Star Wars voice',
                supportedEmotions: true
            },
            'fish-obi-wan-kenobi': {
                name: 'Obi-Wan Kenobi EN',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '2012e5ae904749678a0f6799db444dac',
                description: 'Obi-Wan Kenobi Star Wars voice',
                supportedEmotions: true
            },
            'fish-drachenlord': {
                name: 'Drachenlord',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'fbb19c617d814cc897adb459290462bb',
                description: 'Drachenlord German voice',
                supportedEmotions: true
            },
            'fish-mace-windu-de': {
                name: 'Mace Windu StarWars DE',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '90ea379c19da4d3ebedc2770b3d2f9fc',
                description: 'Mace Windu Star Wars German voice',
                supportedEmotions: true
            },
            'fish-palpatine-de': {
                name: 'Palpatine StarWars DE',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'ebeda92d4e5b4da69117ccf7d8b1db87',
                description: 'Palpatine Star Wars German voice',
                supportedEmotions: true
            },
            'fish-dieter-bohlen': {
                name: 'Dieter Bohlen',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '9e1ea2b4eecc4d61b21c32f2a34b272d',
                description: 'Dieter Bohlen German voice',
                supportedEmotions: true
            },
            'fish-snowy-deutsch': {
                name: 'Snowy Deutsch',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '97d55b3aae9b45a69b87f8b1514aefe8',
                description: 'Snowy German voice',
                supportedEmotions: true
            },
            'fish-scorpion-mandalorian': {
                name: 'Scorpion (Mandalorian)',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'c711f1b663174c89948b3523a8c7e2f2',
                description: 'Scorpion Mandalorian voice',
                supportedEmotions: true
            },
            'fish-angela-merkel': {
                name: 'Angela Merkel',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: 'f7da03b5d8124756b8fad688f496c882',
                description: 'Angela Merkel German politician voice',
                supportedEmotions: true
            },
            'fish-helene-fischer-alt': {
                name: 'Helene Fischer (Alt)',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: '002474fb11bd4193a1f2c69ceb12d6a8',
                description: 'Helene Fischer German singer voice (alternative)',
                supportedEmotions: true
            },
            'fish-alice-weidel': {
                name: 'Alice Weidel',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: 'fb713e464c324e3a9a29ec8b199eb14a',
                description: 'Alice Weidel German politician voice',
                supportedEmotions: true
            },
            'fish-ubahn-berlin-frau': {
                name: 'U-Bahn Berlin Frau',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: '1383c31993764dbba924bacc342f3710',
                description: 'Berlin subway announcer female voice',
                supportedEmotions: true
            },
            'fish-rnb-bahnansage-mann': {
                name: 'RNB Bahnansage Mann',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '3530adc375a34807a259ebe9861dc971',
                description: 'RNB railway announcer male voice',
                supportedEmotions: true
            },
            'fish-computerheld-mann': {
                name: 'Computerheld Mann',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'aba15f4d197c45d48feba4af8f021c2b',
                description: 'Computerheld German male voice',
                supportedEmotions: true
            },
            'fish-mahito-jjk': {
                name: 'Mahito Jujutsu Kaisen',
                lang: 'ja',
                gender: 'male',
                model: 's1',
                reference_id: 'daec2b5a3c83425e880e105e65c787bd',
                description: 'Mahito from Jujutsu Kaisen anime voice',
                supportedEmotions: true
            },
            'fish-kira-death-note': {
                name: 'Kira Death Note',
                lang: 'ja',
                gender: 'male',
                model: 's1',
                reference_id: '2e657584d4bc47c4a244c6e5bb70cb72',
                description: 'Kira from Death Note anime voice',
                supportedEmotions: true
            },
            'fish-claudia-obert': {
                name: 'Claudia Obert',
                lang: 'de',
                gender: 'female',
                model: 's1',
                reference_id: '6bd05556771848ba90b42fe3fdab8d0f',
                description: 'Claudia Obert German voice',
                supportedEmotions: true
            },
            'fish-tim-maelzer': {
                name: 'Tim Mälzer',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'e4070d7e81bd4ccaa655bd7286b878ee',
                description: 'Tim Mälzer German chef voice',
                supportedEmotions: true
            },
            'fish-erzaehler-1-tief': {
                name: 'Erzähler 1 Tief',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '40f470ff12064bf1897215b41819147c',
                description: 'Deep narrator voice 1',
                supportedEmotions: true
            },
            'fish-erzaehler-2-tief': {
                name: 'Erzähler 2 Tief',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'f55aa5a0cad04ab193261367c5faa9e9',
                description: 'Deep narrator voice 2',
                supportedEmotions: true
            },
            'fish-homer-simpson-de': {
                name: 'Homer Simpson DE',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '56756fa804fc43e0b7d701e0e6b601ac',
                description: 'Homer Simpson German voice',
                supportedEmotions: true
            },
            'fish-kind-von-oben': {
                name: 'Kind von Oben',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '57887823e98a48e0a7c01819628ba59b',
                description: 'Child from above voice',
                supportedEmotions: true
            },
            'fish-jean-luc-picard-de': {
                name: 'Jean Luc Picard DE',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'da4e5c72580947ff99c14e6a187dd21a',
                description: 'Jean Luc Picard Star Trek German voice',
                supportedEmotions: true
            },
            'fish-bahnansage-2': {
                name: 'Bahnansage 2',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '3686c68c781a4c719439f9244e0e5125',
                description: 'Railway announcement voice 2',
                supportedEmotions: true
            },
            'fish-dumbledore-de': {
                name: 'Dumbledore DE',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'bbe1ddaa9dfc4f5187e8ba527c1595c6',
                description: 'Dumbledore Harry Potter German voice',
                supportedEmotions: true
            },
            'fish-erzaehler-de-3': {
                name: 'Erzähler DE 3',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '53626294bf79412c905b28a7da814791',
                description: 'German narrator voice 3',
                supportedEmotions: true
            },
            'fish-marco-hagemann': {
                name: 'Marco Hagemann Moderator',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'eaf0a55837fd4afd94630e1741e6da87',
                description: 'Marco Hagemann German moderator voice',
                supportedEmotions: true
            },
            'fish-die-drei-fragezeichen': {
                name: 'Die 3 ??? Erzähler',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'c3de8320141046269db419db81c91869',
                description: 'Die drei Fragezeichen narrator voice',
                supportedEmotions: true
            },
            'fish-resident-evil-en': {
                name: 'Resident Evil EN',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'ef9c79b62ef34530bf452c0e50e3c260',
                description: 'Resident Evil game voice',
                supportedEmotions: true
            },
            'fish-joker-en': {
                name: 'Joker EN',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'fad5a5a6770e47019f566b8f8c0ff609',
                description: 'Joker character voice',
                supportedEmotions: true
            },
            'fish-erzaehler-en-1': {
                name: 'Erzähler EN 1',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'b97618c195814c9fb7558ea34093cd28',
                description: 'English narrator voice 1',
                supportedEmotions: true
            },
            'fish-erzaehler-en-2': {
                name: 'Erzähler EN 2',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'c8c398f58ea74012969c3d9e51dd086c',
                description: 'English narrator voice 2',
                supportedEmotions: true
            },
            'fish-old-wizard': {
                name: 'Old Wizard',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '0e73b5c5ff5740cd8d85571454ef28ae',
                description: 'Old wizard fantasy voice',
                supportedEmotions: true
            },
            'fish-dexter-morgan': {
                name: 'Dexter Morgan',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'a5971a1fd805441aaf3b0bbe8c9f1ab6',
                description: 'Dexter Morgan TV series voice',
                supportedEmotions: true
            },
            'fish-peter-griffin': {
                name: 'Peter Griffin',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'd75c270eaee14c8aa1e9e980cc37cf1b',
                description: 'Peter Griffin Family Guy voice',
                supportedEmotions: true
            },
            'fish-sonic-hedgehog': {
                name: 'Sonic the Hedgehog',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '48484faae07e4cfdb8064da770ee461e',
                description: 'Sonic the Hedgehog character voice',
                supportedEmotions: true
            },
            'fish-shadow-hedgehog': {
                name: 'Shadow the Hedgehog',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '7eb5c086a3864b109eac101ec3feb06e',
                description: 'Shadow the Hedgehog character voice',
                supportedEmotions: true
            },
            'fish-mortal-kombat-en': {
                name: 'Mortal Kombat EN',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'd13f84b987ad4f22b56d2b47f4eb838e',
                description: 'Mortal Kombat game announcer voice',
                supportedEmotions: true
            },
            'fish-steve-jobs': {
                name: 'Steve Jobs EN',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'b27c6c896db64f96842e12dc6f6a07d2',
                description: 'Steve Jobs voice',
                supportedEmotions: true
            },
            'fish-david-attenborough': {
                name: 'David Attenborough',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'c39a76f685cf4f8fb41cd5d3d66b497d',
                description: 'David Attenborough documentary narrator voice',
                supportedEmotions: true
            },
            'fish-keanu-reeves': {
                name: 'Keanu Reeves',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'b3f50c9e578f48e9a7db2f86cb3edde8',
                description: 'Keanu Reeves actor voice',
                supportedEmotions: true
            },
            'fish-brian-griffin': {
                name: 'Brian Griffin EN',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'df7b23b4d67c4340be1170ae6cbc2913',
                description: 'Brian Griffin Family Guy voice',
                supportedEmotions: true
            },
            'fish-obama': {
                name: 'Obama',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'a7a0826352d240878d6a6566b61e4a61',
                description: 'Barack Obama voice',
                supportedEmotions: true
            },
            'fish-joe-rogan': {
                name: 'Joe Rogan',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '0a8f443cf9c34f6f848e01ea7260c549',
                description: 'Joe Rogan podcast host voice',
                supportedEmotions: true
            },
            'fish-joe-biden': {
                name: 'Joe Biden',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '9b42223616644104a4534968cd612053',
                description: 'Joe Biden voice',
                supportedEmotions: true
            },
            'fish-deadpool': {
                name: 'Deadpool',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'd657aa381ad444e393d7f6ff0f8cc2f0',
                description: 'Deadpool Marvel character voice',
                supportedEmotions: true
            },
            'fish-tommy-shelby': {
                name: 'Tommy Shelby UK',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '873041090cf440faaf0fbd7deadd9b86',
                description: 'Tommy Shelby Peaky Blinders voice',
                supportedEmotions: true
            },
            'fish-eric-cartman': {
                name: 'Eric Cartman US',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'b4f55643a15944e499defe42964d2ebf',
                description: 'Eric Cartman South Park voice',
                supportedEmotions: true
            },
            'fish-patrick-star': {
                name: 'Patrick Star US',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'd1520b60870b4e9aa01eab5bfefb1c45',
                description: 'Patrick Star SpongeBob SquarePants voice',
                supportedEmotions: true
            },
            'fish-grandpa-us': {
                name: 'Grandpa US',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '697a707402bf47e9940b95a5f85fbe94',
                description: 'American grandpa voice',
                supportedEmotions: true
            },
            'fish-sorting-hat': {
                name: 'Sorting Hat Hogwarts',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: 'c944589a55ad450e8109d39cd3ecc488',
                description: 'Sorting Hat Harry Potter voice',
                supportedEmotions: true
            },
            'fish-kermit': {
                name: 'Kermit',
                lang: 'en',
                gender: 'male',
                model: 's1',
                reference_id: '93d75b99763f4f10a0756d85c59cfcca',
                description: 'Kermit the Frog voice',
                supportedEmotions: true
            },
            'fish-zug-ostdeutschland': {
                name: 'Zug Ostdeutschland',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '63338a153446436db1b18fe92d58c6f0',
                description: 'East German train announcement voice',
                supportedEmotions: true
            },
            'fish-zug-allgemein': {
                name: 'Zug Allgemein',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '2e2259a37979416882b78165735cc7a0',
                description: 'General German train announcement voice',
                supportedEmotions: true
            },
            'fish-chibbiserker': {
                name: 'Chibbiserker',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'e49a69c4528a4fc4bd6bf620227ab575',
                description: 'Chibbiserker voice',
                supportedEmotions: true
            },
            'fish-blucher': {
                name: 'Gebhard Leberecht von Blücher',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: 'a355dda8cc904e4fb2590f1a598e89e2',
                description: 'Gebhard Leberecht von Blücher historical voice',
                supportedEmotions: true
            },
            'fish-funtime-freddy': {
                name: 'Funtime Freddy (Deutsch)',
                lang: 'de',
                gender: 'male',
                model: 's1',
                reference_id: '4540a261de68409396afc3a8e86255ad',
                description: 'Funtime Freddy German voice (Fazbear And Friends)',
                supportedEmotions: true
            }
        };
    }

    /**
     * Get default voice for a specific language
     * @param {string} langCode - Language code (e.g., 'en', 'de', 'zh')
     * @returns {string} Default voice ID for the language
     */
    static getDefaultVoiceForLanguage(langCode) {
        // All languages currently use the same default voice (fish-sarah)
        // since Fish.audio S1 model supports multilingual synthesis
        return 'fish-sarah';
    }

    /**
     * Convert text to speech using Fish.audio API
     * @param {string} text - The text to convert (supports emotion markers like "(happy) Hello!")
     * @param {string} voiceId - The voice ID (e.g., 'fish-sarah') or raw reference ID (32-char hex)
     * @param {number} speed - Speaking rate (0.5 - 2.0) - Note: Controlled via text normalization in Fish.audio
     * @param {object} options - Additional options
     *   - format: Audio format (mp3, wav, opus, pcm) - default: mp3
     *   - emotion: Emotion to inject into text (will be added as text marker)
     *   - normalize: Normalize text (default: true, set to false for fine-grained control)
     *   - latency: Latency mode ('normal' or 'balanced') - default: 'normal'
     *   - chunk_length: Characters per chunk (100-300) - default: 200
     *   - mp3_bitrate: MP3 bitrate (64, 128, 192) - default: 128
     *   - customVoices: Custom voice definitions from config
     * @returns {Promise<string>} Base64-encoded audio data
     */
    async synthesize(text, voiceId = 'fish-sarah', speed = 1.0, options = {}) {
        // Get built-in voices
        const builtInVoices = FishSpeechEngine.getVoices();
        
        // Merge with custom voices if provided
        const customVoices = options.customVoices || {};
        const allVoices = { ...builtInVoices, ...customVoices };
        
        const voiceConfig = allVoices[voiceId];

        // Get the reference_id - either from voice config or use voiceId directly if it's a valid reference ID
        let referenceId;
        
        if (voiceConfig?.reference_id) {
            // Voice found in config - use its reference_id
            referenceId = voiceConfig.reference_id;
            this.logger.debug(`Fish.audio TTS: Using voice '${voiceId}' with reference_id: ${referenceId}`);
        } else if (this._isValidReferenceId(voiceId)) {
            // voiceId looks like a raw reference ID (32-char hex) - use it directly
            referenceId = voiceId;
            this.logger.info(`Fish.audio TTS: Using raw reference_id: ${referenceId}`);
        } else {
            // Invalid voice - log warning and fall back to default
            this.logger.warn(`Fish.audio TTS: Invalid voice ID: ${voiceId}, falling back to default`);
            referenceId = FishSpeechEngine.DEFAULT_REFERENCE_ID;
        }

        // Process emotion injection if provided
        let processedText = text;
        if (options.emotion && this.isValidEmotion(options.emotion)) {
            // Add emotion marker at the beginning of the text if not already present
            if (!text.trim().startsWith('(')) {
                processedText = `(${options.emotion}) ${text}`;
                this.logger.info(`Fish.audio TTS: Injecting emotion '${options.emotion}' into text`);
            }
        }

        // Extract parameters
        const format = options.format || 'mp3';
        const normalize = options.normalize !== undefined ? options.normalize : true;
        const latency = options.latency || 'normal';
        const chunkLength = options.chunk_length || 200;
        const mp3Bitrate = options.mp3_bitrate || 128;

        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // Exponential backoff: 1s, 2s, 4s...
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    this.logger.info(`Fish.audio TTS: Retry attempt ${attempt}/${this.maxRetries} after ${delay}ms delay`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                this.logger.info(`Fish.audio TTS: Synthesizing with voice=${voiceId}, reference_id=${referenceId}, format=${format}, normalize=${normalize} (attempt ${attempt + 1}/${this.maxRetries + 1})`);

                // Fish.audio API request body
                const requestBody = {
                    text: processedText,
                    reference_id: referenceId,
                    format: format,
                    mp3_bitrate: mp3Bitrate,
                    normalize: normalize,
                    latency: latency,
                    chunk_length: chunkLength
                };

                // If format is opus, add opus_bitrate
                if (format === 'opus') {
                    requestBody.opus_bitrate = FishSpeechEngine.OPUS_AUTO_BITRATE; // Automatic bitrate selection
                }

                const response = await axios.post(this.apiSynthesisUrl, requestBody, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'model': this.model  // Fish Audio S1 model
                    },
                    responseType: 'arraybuffer',
                    timeout: this.timeout
                });

                // Convert response to base64
                const buffer = Buffer.from(response.data);
                const base64Audio = buffer.toString('base64');

                this.logger.info(`Fish.audio TTS: Successfully synthesized ${buffer.length} bytes`);
                return base64Audio;

            } catch (error) {
                lastError = error;
                
                // Determine if error is retryable
                const isRetryable = error.code === 'ECONNABORTED' || 
                                   error.code === 'ETIMEDOUT' ||
                                   (error.response && error.response.status >= 500);
                
                if (!isRetryable || attempt === this.maxRetries) {
                    // Don't retry on client errors (4xx) or if max retries reached
                    break;
                }
                
                this.logger.warn(`Fish.audio TTS: Attempt ${attempt + 1} failed (retryable error), retrying...`);
            }
        }

        // All retries exhausted
        if (lastError.response) {
            // API error response
            const errorMessage = lastError.response.data ? 
                (Buffer.isBuffer(lastError.response.data) ? 
                    lastError.response.data.toString('utf-8') : 
                    JSON.stringify(lastError.response.data)) : 
                'Unknown error';
            this.logger.error(`Fish.audio TTS: API error (${lastError.response.status}): ${errorMessage}`);
            throw new Error(`Fish.audio API error: ${errorMessage}`);
        } else if (lastError.request) {
            // Network error
            this.logger.error(`Fish.audio TTS: Network error - ${lastError.message}`);
            throw new Error(`Fish.audio network error: ${lastError.message}`);
        } else {
            // Other error
            this.logger.error(`Fish.audio TTS: Synthesis failed - ${lastError.message}`);
            throw lastError;
        }
    }

    /**
     * Synthesize text to speech with streaming (low-latency mode)
     * Returns a readable stream for immediate playback
     * @param {string} text - Text to synthesize
     * @param {string} voiceId - Voice ID or reference ID
     * @param {number} speed - Speech speed multiplier (included for API consistency but not used by Fish.audio API, which doesn't support speed modification)
     * @param {Object} options - Additional options (same as synthesize)
     * @returns {Promise<Object>} Object with stream and metadata
     */
    async synthesizeStream(text, voiceId = 'fish-sarah', speed = 1.0, options = {}) {
        // Get built-in voices
        const builtInVoices = FishSpeechEngine.getVoices();
        
        // Merge with custom voices if provided
        const customVoices = options.customVoices || {};
        const allVoices = { ...builtInVoices, ...customVoices };
        
        const voiceConfig = allVoices[voiceId];

        // Get the reference_id - either from voice config or use voiceId directly if it's a valid reference ID
        let referenceId;
        
        if (voiceConfig?.reference_id) {
            // Voice found in config - use its reference_id
            referenceId = voiceConfig.reference_id;
            this.logger.debug(`Fish.audio TTS Stream: Using voice '${voiceId}' with reference_id: ${referenceId}`);
        } else if (this._isValidReferenceId(voiceId)) {
            // voiceId looks like a raw reference ID (32-char hex) - use it directly
            referenceId = voiceId;
            this.logger.info(`Fish.audio TTS Stream: Using raw reference_id: ${referenceId}`);
        } else {
            // Invalid voice - log warning and fall back to default
            this.logger.warn(`Fish.audio TTS Stream: Invalid voice ID: ${voiceId}, falling back to default`);
            referenceId = FishSpeechEngine.DEFAULT_REFERENCE_ID;
        }

        // Process emotion injection if provided
        let processedText = text;
        if (options.emotion && this.isValidEmotion(options.emotion)) {
            // Add emotion marker at the beginning of the text if not already present
            if (!text.trim().startsWith('(')) {
                processedText = `(${options.emotion}) ${text}`;
                this.logger.info(`Fish.audio TTS Stream: Injecting emotion '${options.emotion}' into text`);
            }
        }

        // Extract parameters - use 'balanced' latency for streaming
        const format = options.format || 'mp3';
        const normalize = options.normalize !== undefined ? options.normalize : true;
        const latency = 'balanced'; // Always use balanced latency for streaming
        const chunkLength = options.chunk_length || 200;
        const mp3Bitrate = options.mp3_bitrate || 128;

        this.logger.info(`Fish.audio TTS Stream: Starting stream with voice=${voiceId}, reference_id=${referenceId}, format=${format}, latency=${latency}`);

        // Fish.audio API request body
        const requestBody = {
            text: processedText,
            reference_id: referenceId,
            format: format,
            mp3_bitrate: mp3Bitrate,
            normalize: normalize,
            latency: latency,
            chunk_length: chunkLength
        };

        // If format is opus, add opus_bitrate
        if (format === 'opus') {
            requestBody.opus_bitrate = FishSpeechEngine.OPUS_AUTO_BITRATE; // Automatic bitrate selection
        }

        try {
            const response = await axios.post(this.apiSynthesisUrl, requestBody, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'model': this.model  // Fish Audio S1 model
                },
                responseType: 'stream', // Request streaming response
                timeout: this.timeout
            });

            this.logger.info('Fish.audio TTS Stream: Stream connection established');

            // Return the stream and metadata
            return {
                stream: response.data,
                format: format,
                voiceId: voiceId,
                referenceId: referenceId
            };

        } catch (error) {
            // Handle errors
            if (error.response) {
                // API error response
                const errorMessage = error.response.data ? 
                    (Buffer.isBuffer(error.response.data) ? 
                        error.response.data.toString('utf-8') : 
                        JSON.stringify(error.response.data)) : 
                    'Unknown error';
                this.logger.error(`Fish.audio TTS Stream: API error (${error.response.status}): ${errorMessage}`);
                throw new Error(`Fish.audio API error: ${errorMessage}`);
            } else if (error.request) {
                // Network error
                this.logger.error(`Fish.audio TTS Stream: Network error - ${error.message}`);
                throw new Error(`Fish.audio network error: ${error.message}`);
            } else {
                // Other error
                this.logger.error(`Fish.audio TTS Stream: Failed - ${error.message}`);
                throw error;
            }
        }
    }

    /**
     * WebSocket-based streaming for true low-latency TTS
     * Uses Fish.audio Live TTS API: wss://api.fish.audio/v1/tts/live
     * 
     * Protocol (MessagePack serialized):
     * 1. Client sends StartEvent with TTS config
     * 2. Client sends TextChunk events (optional: multiple)
     * 3. Client sends FlushEvent to force synthesis
     * 4. Client sends StopEvent to end session
     * 5. Server sends AudioChunk events with audio bytes
     * 6. Server sends FinishEvent when done
     * 
     * @param {string} text - Text to synthesize
     * @param {string} voiceId - Voice ID or reference ID
     * @param {object} options - Synthesis options
     * @param {function} options.onChunk - Callback for each audio chunk (for real-time playback)
     * @param {function} options.onStart - Callback when stream starts
     * @param {function} options.onEnd - Callback when stream ends
     * @returns {Promise<{chunks: Buffer[], format: string, totalBytes: number}>}
     */
    async synthesizeWebSocket(text, voiceId = 'fish-sarah', options = {}) {
        // Get built-in voices
        const builtInVoices = FishSpeechEngine.getVoices();
        
        // Merge with custom voices if provided
        const customVoices = options.customVoices || {};
        const allVoices = { ...builtInVoices, ...customVoices };
        
        const voiceConfig = allVoices[voiceId];

        // Get the reference_id - either from voice config or use voiceId directly if it's a valid reference ID
        let referenceId;
        
        if (voiceConfig?.reference_id) {
            // Voice found in config - use its reference_id
            referenceId = voiceConfig.reference_id;
            this.logger.debug(`Fish.audio TTS WebSocket: Using voice '${voiceId}' with reference_id: ${referenceId}`);
        } else if (this._isValidReferenceId(voiceId)) {
            // voiceId looks like a raw reference ID (32-char hex) - use it directly
            referenceId = voiceId;
            this.logger.info(`Fish.audio TTS WebSocket: Using raw reference_id: ${referenceId}`);
        } else {
            // Invalid voice - log warning and fall back to default
            this.logger.warn(`Fish.audio TTS WebSocket: Invalid voice ID: ${voiceId}, falling back to default`);
            referenceId = FishSpeechEngine.DEFAULT_REFERENCE_ID;
        }

        // Process emotion injection if provided
        let processedText = text;
        if (options.emotion && this.isValidEmotion(options.emotion)) {
            // Add emotion marker at the beginning of the text if not already present
            if (!text.trim().startsWith('(')) {
                processedText = `(${options.emotion}) ${text}`;
                this.logger.info(`Fish.audio TTS WebSocket: Injecting emotion '${options.emotion}' into text`);
            }
        }

        // Extract parameters
        const format = options.format || 'mp3';
        const normalize = options.normalize !== undefined ? options.normalize : true;
        const latency = 'balanced'; // Use balanced latency for streaming
        const chunkLength = options.chunk_length || 200;
        const mp3Bitrate = options.mp3_bitrate || 128;

        this.logger.info(`Fish.audio TTS WebSocket: Starting with voice=${voiceId}, reference_id=${referenceId}, format=${format}, latency=${latency}`);

        return new Promise((resolve, reject) => {
            const wsUrl = `wss://api.fish.audio/v1/tts/live`;
            const ws = new WebSocket(wsUrl, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            const chunks = [];
            let totalBytes = 0;
            let hasStarted = false;
            let timeout;

            // Set connection timeout
            const connectionTimeout = setTimeout(() => {
                if (!hasStarted) {
                    this.logger.error('Fish.audio TTS WebSocket: Connection timeout');
                    ws.close();
                    reject(new Error('WebSocket connection timeout'));
                }
            }, this.timeout);

            ws.on('open', () => {
                clearTimeout(connectionTimeout);
                this.logger.debug('Fish.audio TTS WebSocket: Connection established');

                try {
                    // Build request body
                    const requestBody = {
                        text: '',  // Empty initially, will send via TextChunk
                        reference_id: referenceId,
                        format: format,
                        mp3_bitrate: mp3Bitrate,
                        normalize: normalize,
                        latency: latency,
                        chunk_length: chunkLength
                    };

                    // If format is opus, add opus_bitrate
                    if (format === 'opus') {
                        requestBody.opus_bitrate = FishSpeechEngine.OPUS_AUTO_BITRATE;
                    }

                    // Send StartEvent
                    const startEvent = {
                        event: 'start',
                        request: requestBody
                    };
                    ws.send(msgpack.encode(startEvent));
                    this.logger.debug('Fish.audio TTS WebSocket: StartEvent sent');

                    // Send TextChunk
                    const textEvent = {
                        event: 'text',
                        text: processedText
                    };
                    ws.send(msgpack.encode(textEvent));
                    this.logger.debug('Fish.audio TTS WebSocket: TextChunk sent');

                    // Send FlushEvent to force synthesis
                    const flushEvent = {
                        event: 'flush'
                    };
                    ws.send(msgpack.encode(flushEvent));
                    this.logger.debug('Fish.audio TTS WebSocket: FlushEvent sent');

                    // Call onStart callback if provided
                    if (options.onStart && typeof options.onStart === 'function') {
                        options.onStart();
                    }

                    hasStarted = true;

                    // Set response timeout
                    timeout = setTimeout(() => {
                        this.logger.error('Fish.audio TTS WebSocket: Response timeout');
                        ws.close();
                        reject(new Error('WebSocket response timeout'));
                    }, this.timeout * 2); // Double timeout for response

                } catch (error) {
                    this.logger.error(`Fish.audio TTS WebSocket: Error sending events - ${error.message}`);
                    ws.close();
                    reject(error);
                }
            });

            ws.on('message', (data) => {
                try {
                    // Decode MessagePack
                    const message = msgpack.decode(new Uint8Array(data));
                    
                    if (message.event === 'audio') {
                        // Reset timeout on each message
                        if (timeout) clearTimeout(timeout);
                        timeout = setTimeout(() => {
                            this.logger.error('Fish.audio TTS WebSocket: Response timeout');
                            ws.close();
                            reject(new Error('WebSocket response timeout'));
                        }, this.timeout * 2);

                        // Audio chunk received
                        const audioBuffer = Buffer.from(message.audio);
                        chunks.push(audioBuffer);
                        totalBytes += audioBuffer.length;

                        this.logger.debug(`Fish.audio TTS WebSocket: Audio chunk received (${audioBuffer.length} bytes, total: ${totalBytes})`);

                        // Call onChunk callback if provided
                        if (options.onChunk && typeof options.onChunk === 'function') {
                            const base64Chunk = audioBuffer.toString('base64');
                            const isFirst = chunks.length === 1;
                            options.onChunk(base64Chunk, isFirst);
                        }

                    } else if (message.event === 'finish') {
                        // Stream finished
                        if (timeout) clearTimeout(timeout);
                        this.logger.info(`Fish.audio TTS WebSocket: Stream finished (reason: ${message.reason}, chunks: ${chunks.length}, bytes: ${totalBytes})`);

                        // Send StopEvent
                        const stopEvent = {
                            event: 'stop'
                        };
                        ws.send(msgpack.encode(stopEvent));
                        this.logger.debug('Fish.audio TTS WebSocket: StopEvent sent');

                        // Call onEnd callback if provided
                        if (options.onEnd && typeof options.onEnd === 'function') {
                            options.onEnd(chunks.length, totalBytes);
                        }

                        ws.close();
                        resolve({
                            chunks: chunks,
                            format: format,
                            totalBytes: totalBytes
                        });

                    } else if (message.event === 'error') {
                        // Error received from server
                        if (timeout) clearTimeout(timeout);
                        this.logger.error(`Fish.audio TTS WebSocket: Server error - ${message.message}`);
                        ws.close();
                        reject(new Error(`Fish.audio WebSocket error: ${message.message}`));
                    } else {
                        // Unknown event
                        this.logger.warn(`Fish.audio TTS WebSocket: Unknown event type - ${message.event}`);
                    }

                } catch (error) {
                    this.logger.error(`Fish.audio TTS WebSocket: Error decoding message - ${error.message}`);
                }
            });

            ws.on('error', (error) => {
                if (timeout) clearTimeout(timeout);
                clearTimeout(connectionTimeout);
                this.logger.error(`Fish.audio TTS WebSocket: Connection error - ${error.message}`);
                reject(new Error(`Fish.audio WebSocket error: ${error.message}`));
            });

            ws.on('close', (code, reason) => {
                if (timeout) clearTimeout(timeout);
                clearTimeout(connectionTimeout);
                const reasonStr = reason ? reason.toString() : 'No reason provided';
                this.logger.debug(`Fish.audio TTS WebSocket: Connection closed (code: ${code}, reason: ${reasonStr})`);
                
                // If closed before completion, reject if not already resolved
                if (!hasStarted) {
                    reject(new Error('WebSocket closed before starting'));
                } else if (chunks.length === 0) {
                    reject(new Error('WebSocket closed without receiving audio data'));
                }
            });
        });
    }

    /**
     * Update API key
     * @param {string} apiKey - New API key
     */
    setApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('Fish.audio API key must be a non-empty string');
        }
        this.apiKey = apiKey;
        this.logger.info('Fish.audio TTS: API key updated');
    }

    /**
     * Get voices asynchronously (for consistency with other engines)
     * @param {Object} customVoices - Optional custom voice definitions to merge
     * @returns {Promise<Object>} Voice map
     */
    async getVoices(customVoices = {}) {
        const builtInVoices = FishSpeechEngine.getVoices();
        return { ...builtInVoices, ...customVoices };
    }

    /**
     * Validate if a string is a valid Fish.audio reference ID
     * Reference IDs are 32-character hexadecimal strings
     * @param {string} id - The ID to validate
     * @returns {boolean} True if valid reference ID format
     * @private
     */
    _isValidReferenceId(id) {
        if (!id || typeof id !== 'string') return false;
        // Fish.audio reference IDs are 32-character hexadecimal strings
        return /^[a-f0-9]{32}$/i.test(id);
    }

    /**
     * Get supported emotions
     * @returns {Array<string>} List of supported emotions
     */
    getSupportedEmotions() {
        return [...this.supportedEmotions];
    }

    /**
     * Get supported tones
     * @returns {Array<string>} List of supported tones
     */
    getSupportedTones() {
        return [...this.supportedTones];
    }

    /**
     * Get supported effects
     * @returns {Array<string>} List of supported effects
     */
    getSupportedEffects() {
        return [...this.supportedEffects];
    }

    /**
     * Validate emotion
     * @param {string} emotion - Emotion to validate
     * @returns {boolean} True if emotion is supported
     */
    isValidEmotion(emotion) {
        return this.supportedEmotions.includes(emotion) || 
               this.supportedTones.includes(emotion) ||
               this.supportedEffects.includes(emotion);
    }

    /**
     * Helper: Add emotion marker to text
     * @param {string} text - Original text
     * @param {string} emotion - Emotion to add
     * @returns {string} Text with emotion marker
     */
    static addEmotionMarker(text, emotion) {
        if (!text || !emotion) return text;
        // Only add if not already present
        if (text.trim().startsWith('(')) {
            return text;
        }
        return `(${emotion}) ${text}`;
    }

    /**
     * Helper: Add paralanguage effect to text
     * @param {string} text - Original text
     * @param {string} effect - Effect to add (e.g., 'break', 'laugh', 'breath')
     * @returns {string} Text with effect marker
     */
    static addParalanguageEffect(text, effect) {
        if (!text || !effect) return text;
        return `${text} (${effect})`;
    }
}

module.exports = FishSpeechEngine;
