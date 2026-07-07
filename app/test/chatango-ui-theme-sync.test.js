const fs = require('fs');
const path = require('path');

describe('Chatango settings theme sync', () => {
    let uiHtml;

    beforeAll(() => {
        const uiPath = path.join(__dirname, '../plugins/chatango/ui.html');
        uiHtml = fs.readFileSync(uiPath, 'utf8');
    });

    test('does not observe its own data-theme attribute', () => {
        expect(uiHtml).not.toContain("new MutationObserver(syncTheme).observe(document.documentElement");
    });

    test('still watches the parent document for theme changes', () => {
        expect(uiHtml).toContain("new MutationObserver(syncTheme).observe(window.parent.document.documentElement");
    });
});
