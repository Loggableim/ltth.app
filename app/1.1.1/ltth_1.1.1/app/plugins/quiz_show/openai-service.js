const OpenAI = require('openai');

class OpenAIQuizService {
    constructor(apiKey, model = 'gpt-5-mini') {
        this.client = new OpenAI({ apiKey });
        this.model = model;
    }

    /**
     * Generate quiz questions for a specific category
     * @param {string} category - The category for questions
     * @param {number} count - Number of questions to generate
     * @param {Array} existingQuestions - Array of existing questions to avoid duplicates
     * @returns {Promise<Array>} Array of generated questions
     */
    async generateQuestions(category, count = 10, existingQuestions = []) {
        try {
            // Calculate difficulty distribution
            // 50% easy (difficulty 1), rest split between medium (2), hard (3), expert (4)
            const easyCount = Math.ceil(count * 0.5);
            const remainingCount = count - easyCount;
            const mediumCount = Math.ceil(remainingCount / 3);
            const hardCount = Math.ceil(remainingCount / 3);
            const expertCount = remainingCount - mediumCount - hardCount;

            const difficultyDistribution = {
                1: easyCount,
                2: mediumCount,
                3: hardCount,
                4: expertCount
            };

            // Build a list of existing question texts to avoid duplicates
            const existingQuestionTexts = existingQuestions.map(q => 
                typeof q === 'string' ? q : q.question
            ).filter(Boolean);

            const prompt = this.buildPrompt(category, count, difficultyDistribution, existingQuestionTexts);

            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'Du bist ein Quiz-Experte, der hochwertige Multiple-Choice-Fragen erstellt. Antworte NUR mit einem gültigen JSON-Array, ohne zusätzlichen Text oder Markdown.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0].message.content.trim();
            
            // Parse the response
            let parsed;
            try {
                parsed = JSON.parse(content);
            } catch (e) {
                // Try to extract JSON from markdown code blocks
                const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[1]);
                } else {
                    throw new Error('Failed to parse OpenAI response as JSON');
                }
            }

            // Handle both array and object with questions property
            const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

            // Validate and format questions
            const validatedQuestions = questions
                .filter(q => this.validateQuestion(q))
                .map(q => this.formatQuestion(q, category));

            return validatedQuestions;
        } catch (error) {
            throw new Error(`OpenAI question generation failed: ${error.message}`);
        }
    }

    buildPrompt(category, count, difficultyDistribution, existingQuestions) {
        const existingQuestionsText = existingQuestions.length > 0
            ? `\n\nVERMEIDE diese bereits existierenden Fragen:\n${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
            : '';

        return `Erstelle ${count} Multiple-Choice-Fragen für die Kategorie "${category}".

WICHTIGE ANFORDERUNGEN:
1. Jede Frage muss EXAKT 4 Antwortmöglichkeiten haben (A, B, C, D)
2. Nur EINE Antwort ist korrekt
3. Die Fragen müssen in DEUTSCHER Sprache sein
4. Schwierigkeitsverteilung:
   - ${difficultyDistribution[1]} Fragen mit Schwierigkeit 1 (Einfach)
   - ${difficultyDistribution[2]} Fragen mit Schwierigkeit 2 (Mittel)
   - ${difficultyDistribution[3]} Fragen mit Schwierigkeit 3 (Schwer)
   - ${difficultyDistribution[4]} Fragen mit Schwierigkeit 4 (Expert)
5. Jede Frage sollte eine kurze Info/Erklärung zur richtigen Antwort enthalten${existingQuestionsText}

Antworte NUR mit einem JSON-Objekt in diesem EXAKTEN Format:
{
  "questions": [
    {
      "question": "Frage Text hier?",
      "answers": ["Antwort A", "Antwort B", "Antwort C", "Antwort D"],
      "correct": 0,
      "difficulty": 1,
      "info": "Kurze Erklärung zur richtigen Antwort"
    }
  ]
}

Wobei "correct" der Index der richtigen Antwort ist (0 für A, 1 für B, 2 für C, 3 für D).
Die "difficulty" muss 1, 2, 3 oder 4 sein.
WICHTIG: Antworte NUR mit dem JSON-Objekt, kein zusätzlicher Text!`;
    }

    validateQuestion(question) {
        // Validate question structure
        if (!question.question || typeof question.question !== 'string') {
            return false;
        }

        if (!Array.isArray(question.answers) || question.answers.length !== 4) {
            return false;
        }

        if (typeof question.correct !== 'number' || question.correct < 0 || question.correct > 3) {
            return false;
        }

        if (!question.difficulty || question.difficulty < 1 || question.difficulty > 4) {
            return false;
        }

        return true;
    }

    formatQuestion(question, category) {
        return {
            question: question.question.trim(),
            answers: question.answers.map(a => a.trim()),
            correct: parseInt(question.correct),
            category: category,
            difficulty: parseInt(question.difficulty),
            info: question.info ? question.info.trim() : null
        };
    }

    /**
     * Test the API key validity
     * @returns {Promise<boolean>} True if API key is valid
     */
    async testApiKey() {
        try {
            await this.client.models.list();
            return true;
        } catch (error) {
            return false;
        }
    }
}

module.exports = OpenAIQuizService;
