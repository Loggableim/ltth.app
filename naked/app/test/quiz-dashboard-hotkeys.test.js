const fs = require('fs');
const path = require('path');

describe('Quiz Show Dashboard Hotkey & Category Sync', () => {
    let uiCode;

    beforeAll(() => {
        const uiPath = path.join(__dirname, '../plugins/quiz-show/quiz_show.js');
        uiCode = fs.readFileSync(uiPath, 'utf8');
    });

    test('start and next sync category filter before emitting events', () => {
        const startMatch = uiCode.match(/async function startQuiz[\s\S]*?socket\.emit\('quiz-show:start'\);/);
        expect(startMatch).toBeTruthy();
        expect(startMatch[0]).toContain('syncCategoryFilter');

        const nextMatch = uiCode.match(/async function nextQuestion[\s\S]*?socket\.emit\('quiz-show:next'\);/);
        expect(nextMatch).toBeTruthy();
        expect(nextMatch[0]).toContain('syncCategoryFilter');
    });

    test('Shift+A hotkey toggles auto mode via handler', () => {
        const hotkeyHandler = uiCode.match(/function handleDashboardHotkeys[\s\S]*?toggleAutoModeHotkey\(\)/);
        expect(hotkeyHandler).toBeTruthy();
        expect(hotkeyHandler[0]).toContain('event.shiftKey');
        expect(/key\.toLowerCase\(\)\s*===\s*'a'/i.test(hotkeyHandler[0])).toBe(true);
    });
});
