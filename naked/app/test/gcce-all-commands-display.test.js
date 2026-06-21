/**
 * Test to verify that the GCCE UI displayCommands function accepts containerId parameter
 * This validates the fix for the "All Commands" tab loading issue
 */

const fs = require('fs');
const path = require('path');

describe('GCCE UI - All Commands Display Fix', () => {
    let uiHtmlContent;

    beforeAll(() => {
        // Read the UI HTML file
        const uiPath = path.join(__dirname, '../plugins/gcce/ui.html');
        uiHtmlContent = fs.readFileSync(uiPath, 'utf-8');
    });

    test('displayCommands function should accept containerId parameter', () => {
        // Check that the function signature includes containerId parameter
        const functionSignatureRegex = /function displayCommands\(commandsList,\s*containerId\s*=\s*['"]commands-container['"]\)/;
        expect(uiHtmlContent).toMatch(functionSignatureRegex);
    });

    test('displayCommands function should use containerId to get container element', () => {
        // Check that the function uses getElementById with containerId parameter
        const getElementByIdRegex = /document\.getElementById\(containerId\)/;
        expect(uiHtmlContent).toMatch(getElementByIdRegex);
    });

    test('displayFilteredCommands should pass all-commands-container as parameter', () => {
        // Check that displayFilteredCommands calls displayCommands with 'all-commands-container'
        const callRegex = /displayCommands\([^,]+,\s*['"]all-commands-container['"]\)/;
        expect(uiHtmlContent).toMatch(callRegex);
    });

    test('loadCommands should still work without passing containerId (backward compatibility)', () => {
        // Check that there's still a call to displayCommands with only one parameter
        // This ensures backward compatibility
        const loadCommandsSection = uiHtmlContent.match(/async function loadCommands\(\)[\s\S]*?displayCommands\(commands\);/);
        expect(loadCommandsSection).toBeTruthy();
    });

    test('all-commands-container element should exist in HTML', () => {
        // Verify that the target container exists in the HTML
        expect(uiHtmlContent).toMatch(/id="all-commands-container"/);
    });

    test('commands-container element should exist in HTML (default container)', () => {
        // Verify that the default container exists in the HTML
        expect(uiHtmlContent).toMatch(/id="commands-container"/);
    });
});
