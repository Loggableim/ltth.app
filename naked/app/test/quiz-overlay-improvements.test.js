/**
 * Test for Quiz Show Overlay Improvements
 * 
 * This test validates the improvements made to the quiz overlay:
 * 1. Long answer text handling
 * 2. Correct answer reveal size
 * 3. Timer visibility controls
 * 4. Leaderboard display between questions
 * 5. Round number and category display
 */

const fs = require('fs');
const path = require('path');

describe('Quiz Show Overlay - Display Improvements', () => {
    let overlayCode;
    let cssCode;
    let htmlCode;

    beforeAll(() => {
        // Read the overlay files
        const overlayJsPath = path.join(__dirname, '../plugins/quiz-show/quiz_show_overlay.js');
        const overlayCssPath = path.join(__dirname, '../plugins/quiz-show/quiz_show_overlay.css');
        const overlayHtmlPath = path.join(__dirname, '../plugins/quiz-show/quiz_show_overlay.html');
        
        overlayCode = fs.readFileSync(overlayJsPath, 'utf8');
        cssCode = fs.readFileSync(overlayCssPath, 'utf8');
        htmlCode = fs.readFileSync(overlayHtmlPath, 'utf8');
    });

    describe('Long Answer Text Handling', () => {
        test('CSS should support 2-line wrapping for long answers', () => {
            expect(cssCode).toContain('-webkit-line-clamp: 2');
            expect(cssCode).toContain('-webkit-box-orient: vertical');
        });

        test('CSS should have long-text class with tighter spacing', () => {
            expect(cssCode).toContain('.answer-text.long-text');
            expect(cssCode).toContain('line-height: 1.2');
            expect(cssCode).toContain('letter-spacing: -0.3px');
        });

        test('JavaScript should apply long-text class for answers > 30 chars', () => {
            expect(overlayCode).toContain("LONG_ANSWER_THRESHOLD");
            expect(overlayCode).toContain("if (length > LONG_ANSWER_THRESHOLD)");
            expect(overlayCode).toContain("element.classList.add('long-text')");
        });
    });

    describe('Correct Answer Reveal', () => {
        test('CSS should have larger correct icon (8rem)', () => {
            expect(cssCode).toContain('.correct-icon');
            expect(cssCode).toContain('font-size: 8rem');
        });

        test('CSS should have larger correct text (3rem)', () => {
            expect(cssCode).toContain('.correct-text');
            expect(cssCode).toContain('font-size: 3rem');
        });

        test('CSS should have larger correct info (1.5rem)', () => {
            expect(cssCode).toContain('.correct-info');
            expect(cssCode).toContain('font-size: 1.5rem');
        });

        test('JavaScript should use answerDisplayDuration config', () => {
            expect(overlayCode).toContain('gameData.answerDisplayDuration');
            expect(overlayCode).toContain('displayDuration / hudConfig.animationSpeed');
        });
    });

    describe('Timer Visibility', () => {
        test('JavaScript should show timer on QUESTION_INTRO', () => {
            const questionIntroMatch = overlayCode.match(/case States\.QUESTION_INTRO:[\s\S]*?timerSection\.style\.display = ''/);
            expect(questionIntroMatch).toBeTruthy();
        });

        test('JavaScript should turn timer red at TIME_UP', () => {
            expect(overlayCode).toContain("timerSectionTimeUp.classList.add('timer-at-zero')");
        });

        test('JavaScript should fade out timer after turning red', () => {
            expect(overlayCode).toContain("timerSectionTimeUp.classList.add('timer-fade-out')");
        });

        test('JavaScript should hide timer after fade-out completes', () => {
            const timeUpMatch = overlayCode.match(/case States\.TIME_UP:[\s\S]*?timerSection\.style\.display = 'none'/);
            expect(timeUpMatch).toBeTruthy();
        });

        test('CSS should have timer-at-zero class for red styling', () => {
            expect(cssCode).toContain('.timer-section.timer-at-zero');
            expect(cssCode).toContain('var(--color-danger)');
        });

        test('CSS should have timer-fade-out animation', () => {
            expect(cssCode).toContain('.timer-section.timer-fade-out');
            expect(cssCode).toContain('@keyframes timerFadeOut');
        });
    });

    describe('Leaderboard Between Questions', () => {
        test('JavaScript should have showCurrentGameLeaderboard function', () => {
            expect(overlayCode).toContain('async function showCurrentGameLeaderboard()');
        });

        test('JavaScript should fetch round leaderboard', () => {
            expect(overlayCode).toContain("/api/quiz-show/leaderboard?type=round");
        });

        test('JavaScript should call showCurrentGameLeaderboard in WAIT_NEXT state', () => {
            const waitNextMatch = overlayCode.match(/case States\.WAIT_NEXT:[\s\S]*?showCurrentGameLeaderboard\(\)/);
            expect(waitNextMatch).toBeTruthy();
        });
    });

    describe('Round Number Display', () => {
        test('CSS should have larger round number (1.8rem)', () => {
            expect(cssCode).toContain('.logo-text');
            expect(cssCode).toContain('font-size: 1.8rem');
        });

        test('CSS should have increased padding for quiz-logo', () => {
            expect(cssCode).toContain('.quiz-logo');
            expect(cssCode).toContain('padding: 16px 32px');
        });
    });

    describe('Category Display', () => {
        test('HTML should have category display element', () => {
            expect(htmlCode).toContain('id="categoryDisplay"');
            expect(htmlCode).toContain('id="categoryText"');
            expect(htmlCode).toContain('id="categoryIcon"');
        });

        test('CSS should have category-display styles', () => {
            expect(cssCode).toContain('.category-display');
            expect(cssCode).toContain('.category-text');
            expect(cssCode).toContain('.category-icon');
        });

        test('CSS category-text should be same size as logo-text (1.8rem)', () => {
            expect(cssCode).toContain('.category-text');
            expect(cssCode).toContain('font-size: 1.8rem');
        });

        test('JavaScript should extract and display category from state', () => {
            expect(overlayCode).toContain('category: state.currentQuestion.category');
            expect(overlayCode).toContain('if (gameData.category && categoryDisplay && categoryText)');
            expect(overlayCode).toContain('categoryText.textContent = gameData.category');
        });
    });

    describe('Code Quality', () => {
        test('JavaScript should not have syntax errors', () => {
            // Check for common syntax issues
            const openBraces = (overlayCode.match(/{/g) || []).length;
            const closeBraces = (overlayCode.match(/}/g) || []).length;
            expect(openBraces).toBe(closeBraces);
        });

        test('CSS should not have syntax errors', () => {
            // Check for basic CSS validity
            const openBraces = (cssCode.match(/{/g) || []).length;
            const closeBraces = (cssCode.match(/}/g) || []).length;
            expect(openBraces).toBe(closeBraces);
        });
    });
});
