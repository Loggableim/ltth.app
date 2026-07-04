const OpenAI = require('openai');

class LLMQuizService {
    /**
     * @param {Object} config - { provider, apiKey, model, baseUrl }
     */
    constructor(config = {}) {
        this.provider = config.provider || 'openai';
        this.apiKey = config.apiKey || '';
        this.model = config.model || 'gpt-5-mini';
        this.baseUrl = config.baseUrl || '';

        if (this.provider === 'openai' && this.apiKey) {
            this.client = new OpenAI({ apiKey: this.apiKey });
        } else if (this.provider === 'ollama') {
            // Ollama uses OpenAI-compatible API, no API key needed by default
            const ollamaBaseUrl = this.baseUrl || 'http://localhost:11434/v1';
            this.client = new OpenAI({
                apiKey: this.apiKey || 'ollama',
                baseURL: ollamaBaseUrl
            });
        }
    }

    /**
     * Generate a single quiz question on-the-fly
     * @param {Object} options
     * @param {string} options.category - Question category
     * @param {number} options.difficulty - 1-4 (easy to expert)
     * @param {string} options.language - Language code (de, en, es, fr, etc.)
     * @param {Array} options.existingQuestions - Existing question texts to avoid duplicates
     * @returns {Promise<Object>} Single question object
     */
    async generateSingleQuestion({ category, difficulty = 2, language = 'de', existingQuestions = [] }) {
        try {
            const prompt = this.buildSinglePrompt(category, difficulty, language, existingQuestions);

            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'Du bist ein Quiz-Experte, der hochwertige Multiple-Choice-Fragen erstellt. Antworte NUR mit einem gültigen JSON-Objekt, ohne zusätzlichen Text oder Markdown.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.8,
                max_tokens: 500
            });

            const content = response.choices[0].message.content.trim();

            // Parse the response
            let parsed;
            try {
                parsed = JSON.parse(content);
            } catch (e) {
                const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[1]);
                } else {
                    throw new Error('Failed to parse LLM response as JSON');
                }
            }

            // Handle both direct object and wrapped in "question" key
            const question = parsed.question || parsed;

            if (!this.validateQuestion(question)) {
                throw new Error('Generated question failed validation');
            }

            return this.formatQuestion(question, category, language);
        } catch (error) {
            throw new Error(`LLM question generation failed: ${error.message}`);
        }
    }

    buildSinglePrompt(category, difficulty, language, existingQuestions) {
        const languageNames = {
            de: 'DEUTSCHER', en: 'ENGLISH', es: 'SPANISH', fr: 'FRENCH',
            it: 'ITALIAN', pt: 'PORTUGUESE', nl: 'DUTCH', pl: 'POLISH',
            ru: 'RUSSIAN', tr: 'TURKISH', ja: 'JAPANESE', zh: 'CHINESE', ar: 'ARABIC'
        };
        const langName = languageNames[language] || 'DEUTSCHER';

        const difficultyLabels = {
            1: 'Einfach (Allgemeinwissen, das die meisten kennen)',
            2: 'Mittel (erfordert etwas Nachdenken oder grundlegendes Fachwissen)',
            3: 'Schwer (spezialisiertes Wissen oder komplexe Zusammenhänge)',
            4: 'Expert (sehr detailliertes Expertenwissen oder obskure Fakten)'
        };
        const diffLabel = difficultyLabels[difficulty] || difficultyLabels[2];

        const existingText = existingQuestions.length > 0
            ? `\n\nVERMEIDE diese bereits existierenden Fragen:\n${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
            : '';

        return `Erstelle EXAKT EINE Multiple-Choice-Frage für die Kategorie "${category}".

WICHTIGE ANFORDERUNGEN:
1. Die Frage muss EXAKT 4 Antwortmöglichkeiten haben (A, B, C, D)
2. Nur EINE Antwort ist korrekt
3. Die Frage muss in ${langName} Sprache sein
4. Schwierigkeitsgrad: ${diffLabel}
5. Füge eine kurze Info/Erklärung zur richtigen Antwort hinzu${existingText}

Antworte NUR mit einem JSON-Objekt in diesem EXAKTEN Format:
{
  "question": "Frage Text hier?",
  "answers": ["Antwort A", "Antwort B", "Antwort C", "Antwort D"],
  "correct": 0,
  "info": "Kurze Erklärung zur richtigen Antwort"
}

Wobei "correct" der Index der richtigen Antwort ist (0 für A, 1 für B, 2 für C, 3 für D).
WICHTIG: Antworte NUR mit dem JSON-Objekt, kein zusätzlicher Text!`;
    }

    validateQuestion(question) {
        if (!question.question || typeof question.question !== 'string') return false;
        if (!Array.isArray(question.answers) || question.answers.length !== 4) return false;
        if (typeof question.correct !== 'number' || question.correct < 0 || question.correct > 3) return false;
        return true;
    }

    formatQuestion(question, category, language) {
        return {
            question: question.question.trim(),
            answers: question.answers.map(a => a.trim()),
            correct: parseInt(question.correct),
            category: category,
            difficulty: parseInt(question.difficulty) || 2,
            info: question.info ? question.info.trim() : null,
            language: language
        };
    }

    /**
     * Test connectivity with the configured provider
     */
    async testConnection() {
        try {
            await this.client.models.list();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = LLMQuizService;
