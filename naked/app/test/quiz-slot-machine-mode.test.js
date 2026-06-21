/**
 * Tests for Slot Machine mode stability and HUD startup
 */

const fs = require('fs');
const path = require('path');

describe('Quiz Show Plugin - Slot Machine Mode', () => {
    let mainCode;
    let overlayCode;

    beforeAll(() => {
        mainCode = fs.readFileSync(
            path.join(__dirname, '../plugins/quiz-show/main.js'),
            'utf8'
        );
        overlayCode = fs.readFileSync(
            path.join(__dirname, '../plugins/quiz-show/quiz_show_overlay.js'),
            'utf8'
        );
    });

    test('slot machine uses available question pool for categories', () => {
        expect(mainCode).toContain('SELECT id, category FROM questions');
        expect(mainCode).toContain('Slot machine aborted: No available categories with remaining questions');
        expect(mainCode).toContain("type: 'slot_machine_no_categories'");
    });

    test('slot machine overlay guards against missing categories', () => {
        expect(overlayCode).toContain('Slot machine start skipped due to missing overlay elements or categories');
        expect(overlayCode).toContain('!Array.isArray(categories) || categories.length === 0');
        expect(overlayCode).toContain('Slot machine stop skipped due to missing overlay elements or category');
    });
});
